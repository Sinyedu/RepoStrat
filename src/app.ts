import { Client, Events, GatewayIntentBits } from 'discord.js';
import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import type { Config } from './config.js';
import { openDatabase } from './db/index.js';
import { handleCommand } from './discord/handle-command.js';
import { reportCommandFailure } from './discord/command-failure.js';
import { DiscordWorkspace } from './discord/workspace.js';
import { DiscordForum } from './discord/forum.js';
import { createItemsGateway } from './github/items.js';
import { createGitHubGateway } from './github/repositories.js';
import { createHttpServer } from './http.js';
import { ProjectService } from './projects/service.js';
import { ProjectStore } from './projects/store.js';
import { SyncService } from './sync/service.js';
import { SyncStore } from './sync/store.js';

type Dependencies = {
  client?: Client;
  server?: FastifyInstance;
  database?: ReturnType<typeof openDatabase>;
};

export async function startApplication(
  config: Config,
  dependencies: Dependencies = {},
) {
  const logger = pino({
    level: config.LOG_LEVEL,
    redact: ['DISCORD_TOKEN', 'GITHUB_WEBHOOK_SECRET'],
  });
  const database = dependencies.database ?? openDatabase(config.DATABASE_URL);
  const server = dependencies.server ?? createHttpServer(logger);
  const client =
    dependencies.client ?? new Client({ intents: [GatewayIntentBits.Guilds] });
  const projects = new ProjectService(
    new ProjectStore(database.db),
    createGitHubGateway(config),
    new DiscordWorkspace(client),
    config.GITHUB_INSTALLATION_ID ?? '',
  );
  const syncs = new SyncService(
    projects,
    createItemsGateway(config),
    new DiscordForum(client),
    new SyncStore(database.db),
    config.SYNC_BATCH_SIZE,
  );
  let stopping: Promise<void> | undefined;

  function stop(): Promise<void> {
    stopping ??= (async () => {
      const results = await Promise.allSettled([
        server.close(),
        client.destroy(),
      ]);
      database.close();
      for (const result of results)
        if (result.status === 'rejected') logger.error(result.reason);
      logger.info('RepoStrat stopped');
    })();
    return stopping;
  }

  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    void handleCommand(interaction, projects, syncs).catch((error: unknown) =>
      reportCommandFailure(interaction, error, logger),
    );
  });

  try {
    await server.listen({ host: config.HOST, port: config.PORT });
    await client.login(config.DISCORD_TOKEN);
    logger.info('Discord client connected');
  } catch (error) {
    await stop();
    throw error;
  }

  return { stop, client, server, database };
}
