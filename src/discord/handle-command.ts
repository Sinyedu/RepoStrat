import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { ProjectError } from '../projects/types.js';
import type { ProjectService } from '../projects/service.js';

const messages: Record<ProjectError['code'], string> = {
  'invalid-name': 'Use a repository in owner/name form.',
  'github-unavailable':
    'Repository not found or the GitHub App cannot access it.',
  'github-denied': 'GitHub App access was denied. Check its installation.',
  'github-rate-limit': 'GitHub is rate limiting requests. Try again later.',
  'github-not-configured': 'GitHub App authentication is not configured.',
  'audience-required':
    'An audience role is required for a non-public repository.',
  'audience-denied': 'The audience role must exist and include you.',
  'bot-permissions': 'The bot lacks permissions to create this workspace.',
  'in-progress':
    'Registration is in progress. Retry after two minutes if interrupted.',
  'discord-conflict':
    'A conflicting Discord channel exists. Resolve it before retrying.',
  'not-registered': 'That repository is not registered in this server.',
};

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  projects: ProjectService,
): Promise<void> {
  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong!');
    return;
  }
  if (interaction.commandName !== 'project') return;

  if (
    !interaction.inGuild() ||
    !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  ) {
    await interaction.reply({
      content: 'Manage Server permission is required.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const action = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
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
        `Registered ${project.owner}/${project.name} in <#${project.categoryId}>.`,
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
      const { project, problems } = await projects.sync(
        guildId,
        interaction.user.id,
        path,
      );
      await interaction.editReply(
        problems.length
          ? `${project.owner}/${project.name}: ${problems.join(', ')} need attention.`
          : `${project.owner}/${project.name}: GitHub access and Discord mappings are healthy.`,
      );
    }
  } catch (error) {
    if (!(error instanceof ProjectError)) throw error;
    await interaction.editReply(messages[error.code]);
  }
}
