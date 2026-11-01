import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether RepoStrat is responding'),
  new SlashCommandBuilder()
    .setName('project')
    .setDescription('Manage GitHub projects')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((command) =>
      command
        .setName('add')
        .setDescription('Register a GitHub repository')
        .addStringOption((option) =>
          option
            .setName('repository')
            .setDescription('owner/repository')
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName('audience')
            .setDescription(
              'Role allowed to view this workspace; required for private repositories',
            ),
        ),
    )
    .addSubcommand((command) =>
      command.setName('list').setDescription('List registered projects'),
    )
    .addSubcommand((command) =>
      command
        .setName('sync')
        .setDescription('Import and update GitHub issues and pull requests')
        .addStringOption((option) =>
          option
            .setName('repository')
            .setDescription('owner/repository')
            .setRequired(true),
        ),
    ),
].map((command) => command.toJSON());
