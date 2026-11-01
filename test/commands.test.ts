import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { commands } from '../src/discord/commands.js';
import { handleCommand } from '../src/discord/handle-command.js';

function interaction(
  commandName: string,
  action = 'list',
  allowed = true,
  repository = 'acme/widget',
) {
  const reply = vi.fn().mockResolvedValue(undefined);
  return {
    commandName,
    inGuild: () => true,
    memberPermissions: { has: () => allowed },
    options: { getSubcommand: () => action, getString: () => repository },
    reply,
  } as unknown as ChatInputCommandInteraction & { reply: typeof reply };
}

describe('Discord commands', () => {
  it('registers guild management permission on project', () => {
    const project = commands.find((command) => command.name === 'project');
    expect(project?.default_member_permissions).toBe(
      PermissionFlagsBits.ManageGuild.toString(),
    );
    expect(project?.options?.map((option) => option.name)).toEqual([
      'add',
      'list',
      'sync',
    ]);
  });

  it('responds to ping', async () => {
    const input = interaction('ping');
    await handleCommand(input);
    expect(input.reply).toHaveBeenCalledWith('Pong!');
  });

  it('denies project commands without Manage Server', async () => {
    const input = interaction('project', 'list', false);
    await handleCommand(input);
    expect(input.reply).toHaveBeenCalledWith({
      content: 'Manage Server permission is required.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('validates repository input and keeps placeholders inert', async () => {
    const bad = interaction('project', 'add', true, 'invalid');
    await handleCommand(bad);
    expect(bad.reply.mock.calls[0]?.[0].content).toContain('owner/name');

    const valid = interaction('project', 'sync');
    await handleCommand(valid);
    expect(valid.reply.mock.calls[0]?.[0].content).toContain(
      'not available yet',
    );
  });
});
