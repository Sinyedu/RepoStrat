import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { ProjectError } from '../projects/types.js';
import type { ProjectService } from '../projects/service.js';
import type { SyncService } from '../sync/service.js';
import { formatSummary } from './sync-report.js';

const messages: Record<ProjectError['code'], string> = {
  'invalid-name': 'Use a repository in owner/name form.',
  'github-unavailable':
    'Repository not found or the GitHub App cannot access it.',
  'github-denied':
    'GitHub App access was denied. Check its installation and its Issues and Pull requests read permissions.',
  'github-rate-limit': 'GitHub is rate limiting requests. Try again later.',
  'github-not-configured': 'GitHub App authentication is not configured.',
  'audience-required':
    'An audience role is required for a non-public repository.',
  'audience-denied': 'The audience role must exist and include you.',
  'bot-permissions': 'The bot lacks permissions to create this workspace.',
  'bot-not-in-guild':
    'The bot cannot access this server. Install its bot user in this server, then retry.',
  'in-progress':
    'Registration is in progress. Retry after two minutes if interrupted.',
  'discord-conflict':
    'A conflicting Discord channel exists. Resolve it before retrying.',
  'not-registered': 'That repository is not registered in this server.',
  'sync-in-progress':
    'A sync for this repository is already running. Try again when it finishes.',
};

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  projects: ProjectService,
  syncs: SyncService,
): Promise<void> {
  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong!');
    return;
  }
  if (interaction.commandName !== 'project') return;

  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: 'Use this command in a server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: 'Manage Server permission is required.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const action = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    if (action === 'add') {
      const path = interaction.options.getString('repository', true);
      const roleId = interaction.options.getRole('audience')?.id ?? null;
      const project = await projects.add(
        guildId,
        interaction.user.id,
        path,
        roleId,
      );
      await interaction.editReply(
        `Registered ${project.owner}/${project.name} in <#${project.categoryId}>.\nExisting issues and pull requests are not imported automatically. Run \`/project sync ${project.owner}/${project.name}\` to import them.`,
      );
      return;
    }
    if (action === 'list') {
      const entries = await projects.list(guildId, interaction.user.id);
      const lines = entries.map(({ project, visible }) =>
        visible
          ? `${project.owner}/${project.name} — <${project.htmlUrl}> — ${project.categoryId ? `<#${project.categoryId}>` : 'no category'} — ${project.status}`
          : 'Private project (restricted)',
      );
      const content = lines.length
        ? lines.join('\n')
        : 'No registered projects.';
      await interaction.editReply(
        content.length <= 1900 ? content : `${content.slice(0, 1850)}\n…`,
      );
      return;
    }
    if (action === 'sync') {
      const path = interaction.options.getString('repository', true);
      let lastEdit = 0;
      const { project, problems, summary } = await syncs.run(
        guildId,
        interaction.user.id,
        path,
        (written) => {
          if (written - lastEdit < 10) return;
          lastEdit = written;
          void interaction
            .editReply(`Synchronizing… ${written} posts written so far.`)
            .catch(() => undefined);
        },
      );
      await interaction.editReply(
        summary
          ? formatSummary(project.name, summary)
          : `${project.owner}/${project.name}: ${problems.join(', ')} need attention.`,
      );
      return;
    }
    await interaction.editReply('Unknown project command.');
  } catch (error) {
    if (!(error instanceof ProjectError)) throw error;
    await interaction.editReply(messages[error.code]);
  }
}
