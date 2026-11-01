import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { commands } from '../src/discord/commands.js';
import { handleCommand } from '../src/discord/handle-command.js';
import type { ProjectService } from '../src/projects/service.js';

const projects = {
  add: vi.fn(),
  list: vi.fn().mockResolvedValue([]),
  sync: vi.fn(),
} as unknown as ProjectService;

function interaction(
  commandName: string,
  action = 'list',
  allowed = true,
  repository = 'acme/widget',
) {
  const reply = vi.fn().mockResolvedValue(undefined);
  const deferReply = vi.fn().mockResolvedValue(undefined);
  const editReply = vi.fn().mockResolvedValue(undefined);
  return {
    commandName,
    guildId: '234567890123456789',
    user: { id: '345678901234567890' },
    inGuild: () => true,
    memberPermissions: { has: () => allowed },
    options: {
      getSubcommand: () => action,
      getString: () => repository,
      getRole: () => null,
    },
    reply,
    deferReply,
    editReply,
  } as unknown as ChatInputCommandInteraction & {
    reply: typeof reply;
    deferReply: typeof deferReply;
    editReply: typeof editReply;
  };
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
    await handleCommand(input, projects);
    expect(input.reply).toHaveBeenCalledWith('Pong!');
  });

  it('denies project commands without Manage Server', async () => {
    const input = interaction('project', 'list', false);
    await handleCommand(input, projects);
    expect(input.reply).toHaveBeenCalledWith({
      content: 'Manage Server permission is required.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('routes project commands through the service with an ephemeral reply', async () => {
    const input = interaction('project', 'list');
    await handleCommand(input, projects);
    expect(input.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(input.editReply).toHaveBeenCalledWith('No registered projects.');
  });

  it('renders visible list entries and hides restricted details', async () => {
    const list = vi.spyOn(projects, 'list').mockResolvedValueOnce([
      {
        project: {
          owner: 'acme',
          name: 'widget',
          htmlUrl: 'https://github.com/acme/widget',
          categoryId: '123',
          status: 'ready',
        },
        visible: true,
      },
      { project: { owner: 'secret', name: 'repo' }, visible: false },
    ] as Awaited<ReturnType<ProjectService['list']>>);
    const input = interaction('project', 'list');
    await handleCommand(input, projects);
    expect(input.editReply).toHaveBeenCalledWith(
      expect.stringContaining(
        'acme/widget — <https://github.com/acme/widget> — <#123> — ready',
      ),
    );
    expect(input.editReply).toHaveBeenCalledWith(
      expect.not.stringContaining('secret/repo'),
    );
    list.mockRestore();
  });

  it('renders sync mapping problems', async () => {
    const sync = vi.spyOn(projects, 'sync').mockResolvedValueOnce({
      project: { owner: 'acme', name: 'widget' },
      problems: ['issues'],
    } as Awaited<ReturnType<ProjectService['sync']>>);
    const input = interaction('project', 'sync');
    await handleCommand(input, projects);
    expect(input.editReply).toHaveBeenCalledWith(
      'acme/widget: issues need attention.',
    );
    sync.mockRestore();
  });
});
