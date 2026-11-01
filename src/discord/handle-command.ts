import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';

const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
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

  const action = interaction.options.getSubcommand();
  if (action === 'add' || action === 'sync') {
    const repository = interaction.options.getString('repository', true);
    if (!repositoryPattern.test(repository) || repository.includes('..')) {
      await interaction.reply({
        content: 'Use a repository in owner/name form.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }
  await interaction.reply({
    content: `/project ${action} is not available yet. No changes were made.`,
    flags: MessageFlags.Ephemeral,
  });
}
