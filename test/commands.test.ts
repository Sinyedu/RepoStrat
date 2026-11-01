import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { commands } from '../src/discord/commands.js';
import { handleCommand } from '../src/discord/handle-command.js';
import type { ProjectService } from '../src/projects/service.js';
import type { SyncService } from '../src/sync/service.js';
import { ProjectError } from '../src/projects/types.js';

const projects = {
  add: vi.fn(),
  list: vi.fn().mockResolvedValue([]),
  sync: vi.fn(),
} as unknown as ProjectService;

const syncs = { run: vi.fn() } as unknown as SyncService;

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
    await handleCommand(input, projects, syncs);
    expect(input.reply).toHaveBeenCalledWith('Pong!');
  });

  it('denies project commands without Manage Server', async () => {
    const input = interaction('project', 'list', false);
    await handleCommand(input, projects, syncs);
    expect(input.reply).toHaveBeenCalledWith({
      content: 'Manage Server permission is required.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('rejects a missing interaction guild ID without calling the service', async () => {
    const input = interaction('project', 'add');
    Object.assign(input, { guildId: null });
    const add = vi.spyOn(projects, 'add');
    await handleCommand(input, projects, syncs);
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
    await handleCommand(input, projects, syncs);
    expect(add).toHaveBeenCalledWith(
      '876543210987654321',
      input.user.id,
      'acme/widget',
      null,
    );
    expect(input.deferReply).toHaveBeenCalledBefore(add);
    expect(input.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Registered acme/widget in <#123>.'),
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
    await handleCommand(input, unavailable, syncs);
    expect(input.deferReply).toHaveBeenCalledOnce();
    expect(input.editReply).toHaveBeenCalledWith(
      'The bot cannot access this server. Install its bot user in this server, then retry.',
    );
  });

  it('edits the deferred reply for an unknown project action', async () => {
    const input = interaction('project', 'unexpected');
    await handleCommand(input, projects, syncs);
    expect(input.deferReply).toHaveBeenCalledOnce();
    expect(input.editReply).toHaveBeenCalledWith('Unknown project command.');
  });

  it('routes project commands through the service with an ephemeral reply', async () => {
    const input = interaction('project', 'list');
    await handleCommand(input, projects, syncs);
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
    await handleCommand(input, projects, syncs);
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
    const run = vi.spyOn(syncs, 'run').mockResolvedValueOnce({
      project: { owner: 'acme', name: 'widget' },
      problems: ['issues'],
      summary: null,
    } as Awaited<ReturnType<SyncService['run']>>);
    const input = interaction('project', 'sync');
    await handleCommand(input, projects, syncs);
    expect(input.editReply).toHaveBeenCalledWith(
      'acme/widget: issues need attention.',
    );
    run.mockRestore();
  });
});

describe('project sync command', () => {
  const summary = {
    issuesImported: 12,
    pullRequestsImported: 4,
    updated: 3,
    recreated: 0,
    unchanged: 16,
    deferred: 0,
    truncated: false,
    aborted: false,
    failures: [],
  };
  const outcome = (over = {}) =>
    ({
      project: { owner: 'Sinyedu', name: 'QueryPlan' },
      problems: [],
      summary: { ...summary, ...over },
    }) as unknown as Awaited<ReturnType<SyncService['run']>>;

  it('defers before a slow sync, then reports the result', async () => {
    const run = vi.spyOn(syncs, 'run').mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return outcome();
    });
    const input = interaction('project', 'sync');
    await handleCommand(input, projects, syncs);
    expect(input.deferReply).toHaveBeenCalledBefore(run);
    const text = input.editReply.mock.calls.at(-1)?.[0] as string;
    expect(text).toContain('**QueryPlan synchronized**');
    expect(text).toContain('- 12 issues imported');
    expect(text).toContain('- 4 pull requests imported');
    expect(text).toContain('- 3 existing posts updated');
    expect(text).toContain('- 16 unchanged');
    expect(text).toContain('- 0 errors');
    run.mockRestore();
  });

  it('never calls a partial import complete', async () => {
    const run = vi.spyOn(syncs, 'run').mockResolvedValueOnce(
      outcome({
        deferred: 7,
        failures: [{ type: 'issue', number: 4, reason: 'Discord error 50013' }],
      }),
    );
    const input = interaction('project', 'sync');
    await handleCommand(input, projects, syncs);
    const text = input.editReply.mock.calls.at(-1)?.[0] as string;
    expect(text).toContain('partially synchronized');
    expect(text).toContain('7 items were not processed');
    expect(text).toContain('#4 (issue): Discord error 50013');
    run.mockRestore();
  });

  it('streams progress edits without failing the sync', async () => {
    const run = vi
      .spyOn(syncs, 'run')
      .mockImplementationOnce(async (_g, _u, _p, onProgress) => {
        onProgress?.(10);
        return outcome();
      });
    const input = interaction('project', 'sync');
    input.editReply.mockRejectedValueOnce(new Error('token expired'));
    await handleCommand(input, projects, syncs);
    expect(input.editReply).toHaveBeenCalledTimes(2);
    run.mockRestore();
  });

  it('explains a concurrent sync', async () => {
    const run = vi
      .spyOn(syncs, 'run')
      .mockRejectedValueOnce(new ProjectError('sync-in-progress'));
    const input = interaction('project', 'sync');
    await handleCommand(input, projects, syncs);
    expect(input.editReply).toHaveBeenCalledWith(
      expect.stringContaining('already running'),
    );
    run.mockRestore();
  });

  it('surfaces a failed final reply for the global failure handler', async () => {
    const run = vi.spyOn(syncs, 'run').mockResolvedValueOnce(outcome());
    const input = interaction('project', 'sync');
    input.editReply.mockRejectedValueOnce(new Error('Invalid Webhook Token'));
    await expect(handleCommand(input, projects, syncs)).rejects.toThrow(
      'Invalid Webhook Token',
    );
    run.mockRestore();
  });

  it('tells the user how to import after registration', async () => {
    const add = vi.spyOn(projects, 'add').mockResolvedValueOnce({
      owner: 'acme',
      name: 'widget',
      categoryId: '1',
    } as Awaited<ReturnType<ProjectService['add']>>);
    const input = interaction('project', 'add');
    await handleCommand(input, projects, syncs);
    expect(input.editReply).toHaveBeenCalledWith(
      expect.stringContaining('/project sync acme/widget'),
    );
    add.mockRestore();
  });
});
