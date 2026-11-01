import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { commands } from '../src/discord/commands.js';
import { handleCommand } from '../src/discord/handle-command.js';
import type { ProjectService } from '../src/projects/service.js';
import { ProjectError } from '../src/projects/types.js';

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

  it('rejects a missing interaction guild ID without calling the service', async () => {
    const input = interaction('project', 'add');
    Object.assign(input, { guildId: null });
    const add = vi.spyOn(projects, 'add');
    await handleCommand(input, projects);
    expect(input.reply).toHaveBeenCalledWith({
      content: 'Use this command in a server.',
      flags: MessageFlags.Ephemeral,
    });
    expect(add).not.toHaveBeenCalled();
    add.mockRestore();
  });

  it('passes the interaction guild ID to project registration', async () => {
    const input = interaction('project', 'add');
    Object.assign(input, { guildId: '876543210987654321' });
    const add = vi.spyOn(projects, 'add').mockResolvedValueOnce({
      owner: 'acme',
      name: 'widget',
      categoryId: '123',
    } as Awaited<ReturnType<ProjectService['add']>>);
    await handleCommand(input, projects);
    expect(add).toHaveBeenCalledWith(
      '876543210987654321',
      input.user.id,
      'acme/widget',
      null,
    );
    expect(input.deferReply).toHaveBeenCalledBefore(add);
    expect(input.editReply).toHaveBeenCalledWith(
      'Registered acme/widget in <#123>.',
    );
    add.mockRestore();
  });

  it('edits the deferred reply when the bot is absent from the server', async () => {
    const unavailable = {
      add: async () => {
        throw new ProjectError('bot-not-in-guild');
      },
    } as unknown as ProjectService;
    const input = interaction('project', 'add');
    await handleCommand(input, unavailable);
    expect(input.deferReply).toHaveBeenCalledOnce();
    expect(input.editReply).toHaveBeenCalledWith(
      'The bot cannot access this server. Install its bot user in this server, then retry.',
    );
  });

  it('edits the deferred reply for an unknown project action', async () => {
    const input = interaction('project', 'unexpected');
    await handleCommand(input, projects);
    expect(input.deferReply).toHaveBeenCalledOnce();
    expect(input.editReply).toHaveBeenCalledWith('Unknown project command.');
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
