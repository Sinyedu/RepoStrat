import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import type { Config } from './config.js';
import { openDatabase } from './db/index.js';
import { handleCommand } from './discord/handle-command.js';
import { createHttpServer } from './http.js';

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
    void handleCommand(interaction).catch(async (error: unknown) => {
      logger.error({ err: error }, 'Command failed');
      const content = 'Something went wrong. Please try again later.';
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content,
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        logger.error({ err: replyError }, 'Could not report command failure');
      }
    });
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
