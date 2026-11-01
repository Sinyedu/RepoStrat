import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether RepoStrat is responding'),
  new SlashCommandBuilder()
    .setName('project')
    .setDescription('Manage GitHub projects (coming in a later milestone)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((command) =>
      command
        .setName('add')
        .setDescription('Register a GitHub repository (coming soon)')
        .addStringOption((option) =>
          option
            .setName('repository')
            .setDescription('owner/repository')
            .setRequired(true),
        ),
    )
    .addSubcommand((command) =>
      command.setName('list').setDescription('List projects (coming soon)'),
    )
    .addSubcommand((command) =>
      command
        .setName('sync')
        .setDescription('Sync a repository (coming soon)')
        .addStringOption((option) =>
          option
            .setName('repository')
            .setDescription('owner/repository')
            .setRequired(true),
        ),
    ),
].map((command) => command.toJSON());
