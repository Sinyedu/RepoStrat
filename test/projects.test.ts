import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture } from './project-fixture.js';
import { ProjectError } from '../src/projects/types.js';

const guild = '123456789012345678';
const user = '234567890123456789';
const active: ReturnType<typeof fixture>[] = [];
function setup() {
  const f = fixture();
  active.push(f);
  return f;
}
afterEach(() => {
  for (const f of active.splice(0)) f.database.close();
});

describe('project registration', () => {
  it('creates one workspace and persists stable mappings', async () => {
    const { service, store, workspace } = setup();
    const project = await service.add(guild, user, 'acme/widget', null);
    expect(project.status).toBe('ready');
    expect(project.githubRepositoryId).toBe('100');
    expect(project.githubInstallationId).toBe('777');
    expect([
      project.categoryId,
      project.overviewId,
      project.issuesId,
      project.pullRequestsId,
      project.activityId,
    ]).toEqual(['1', '2', '3', '4', '5']);
    expect(project.registeredAt).toBeInstanceOf(Date);
    expect(store.find(guild, '100')?.categoryId).toBe('1');
    expect(workspace.created).toBe(5);
  });

  it('rejects invalid names before calling GitHub', async () => {
    const { service, workspace } = setup();
    await expect(
      service.add(guild, user, '../widget', null),
    ).rejects.toMatchObject({ code: 'invalid-name' });
    expect(workspace.created).toBe(0);
  });

  it.each([
    'github-unavailable',
    'github-denied',
    'github-rate-limit',
  ] as const)('handles %s without creating Discord resources', async (code) => {
    const f = setup();
    f.setGitHubError(new ProjectError(code));
    await expect(
      f.service.add(guild, user, 'acme/widget', null),
    ).rejects.toMatchObject({ code });
    expect(f.workspace.created).toBe(0);
  });

  it('reuses all Discord resources on a duplicate add', async () => {
    const { service, workspace } = setup();
    const first = await service.add(guild, user, 'acme/widget', null);
    const second = await service.add(guild, user, 'acme/widget', null);
    expect(second.categoryId).toBe(first.categoryId);
    expect(second.registeredAt).toEqual(first.registeredAt);
    expect(workspace.created).toBe(5);
  });

  it('serializes concurrent attempts', async () => {
    const { service, workspace, store } = setup();
    workspace.delayMs = 20;
    const results = await Promise.allSettled([
      service.add(guild, user, 'acme/widget', null),
      service.add(guild, user, 'acme/widget', null),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: { code: 'in-progress' } });
    expect(store.list(guild)).toHaveLength(1);
    expect(workspace.created).toBe(5);
  });

  it('resumes after partial channel creation failure', async () => {
    const { service, store, workspace } = setup();
    workspace.failField = 'issuesId';
    await expect(service.add(guild, user, 'acme/widget', null)).rejects.toThrow(
      'discord.channel.issuesId.ensure',
    );
    expect(store.find(guild, '100')).toMatchObject({
      status: 'pending',
      categoryId: '1',
      overviewId: '2',
    });
    const project = await service.add(guild, user, 'acme/widget', null);
    expect(project.status).toBe('ready');
    expect(workspace.created).toBe(5);
  });

  it('removes a new category when persisting its ID fails', async () => {
    const { service, store, workspace } = setup();
    const save = vi.spyOn(store, 'saveChannel').mockImplementationOnce(() => {
      throw new Error('database write failed');
    });
    await expect(service.add(guild, user, 'acme/widget', null)).rejects.toThrow(
      'database write failed',
    );
    expect(workspace.removed).toEqual(['1']);
    expect(workspace.resources.size).toBe(0);
    save.mockRestore();
    await service.add(guild, user, 'acme/widget', null);
    expect(workspace.resources.size).toBe(5);
  });

  it('rejects missing bot permissions before creation', async () => {
    const { service, workspace } = setup();
    workspace.botAllowed = false;
    await expect(
      service.add(guild, user, 'acme/widget', null),
    ).rejects.toMatchObject({ code: 'bot-permissions' });
    expect(workspace.created).toBe(0);
  });

  it('labels a Discord permission API failure before querying GitHub', async () => {
    const f = setup();
    f.workspace.assertPermissions = async () => {
      throw Object.assign(new Error('Discord denied access'), {
        code: 50013,
        status: 403,
      });
    };
    f.setGitHubError(new ProjectError('github-unavailable'));
    const error = await f.service
      .add(guild, user, 'acme/widget', null)
      .catch((failure: unknown) => failure);
    expect((error as { operation?: string }).operation).toBe(
      'discord.guild.permissions',
    );
    expect(f.workspace.created).toBe(0);
  });

  it('requires an explicit audience for private repositories', async () => {
    const f = setup();
    f.setRepository({ visibility: 'private' });
    await expect(
      f.service.add(guild, user, 'acme/widget', null),
    ).rejects.toMatchObject({ code: 'audience-required' });
    f.workspace.audienceAllowed = false;
    await expect(
      f.service.add(guild, user, 'acme/widget', '345678901234567890'),
    ).rejects.toMatchObject({ code: 'audience-denied' });
    expect(f.workspace.created).toBe(0);
    f.workspace.audienceAllowed = true;
    const project = await f.service.add(
      guild,
      user,
      'acme/widget',
      '345678901234567890',
    );
    expect(project.audienceRoleId).toBe('345678901234567890');
    expect(f.workspace.resources.get(`${guild}:100:categoryId`)?.roleId).toBe(
      project.audienceRoleId,
    );
    f.workspace.audienceAllowed = false;
    expect((await f.service.list(guild, user))[0]?.visible).toBe(false);
  });

  it('quarantines an existing workspace when a repository turns private', async () => {
    const f = setup();
    await f.service.add(guild, user, 'acme/widget', null);
    f.setRepository({ visibility: 'private' });
    await expect(
      f.service.sync(guild, user, 'acme/widget'),
    ).rejects.toMatchObject({ code: 'audience-required' });
    expect(f.workspace.quarantined).toBe(true);
    expect(f.store.find(guild, '100')?.visibility).toBe('private');
    expect((await f.service.list(guild, user))[0]?.visible).toBe(false);
  });

  it('allows the same stable repository in multiple guilds', async () => {
    const { service, store } = setup();
    await service.add(guild, user, 'acme/widget', null);
    await service.add('345678901234567890', user, 'acme/widget', null);
    expect(store.list(guild)).toHaveLength(1);
    expect(store.list('345678901234567890')).toHaveLength(1);
  });

  it('updates renamed repository metadata without a second workspace', async () => {
    const f = setup();
    await f.service.add(guild, user, 'acme/widget', null);
    f.setRepository({
      name: 'renamed',
      url: 'https://github.com/acme/renamed',
    });
    const project = await f.service.add(guild, user, 'acme/renamed', null);
    expect(project.name).toBe('renamed');
    expect(f.workspace.created).toBe(5);
    expect(
      (await f.service.sync(guild, user, 'acme/renamed')).problems,
    ).toEqual([]);
  });

  it('repairs a manually deleted channel on retry', async () => {
    const f = setup();
    const first = await f.service.add(guild, user, 'acme/widget', null);
    await f.workspace.remove(guild, first.issuesId!);
    const repaired = await f.service.add(guild, user, 'acme/widget', null);
    expect(repaired.issuesId).not.toBe(first.issuesId);
    expect(repaired.categoryId).toBe(first.categoryId);
    expect(f.workspace.created).toBe(6);
  });

  it('reports a missing channel without creating one during sync', async () => {
    const f = setup();
    const project = await f.service.add(guild, user, 'acme/widget', null);
    await f.workspace.remove(guild, project.issuesId!);
    const result = await f.service.sync(guild, user, 'acme/widget');
    expect(result.problems).toContain('issuesId');
    expect(f.workspace.created).toBe(5);
  });

  it('replaces a deleted category and reuses surviving channels', async () => {
    const f = setup();
    const first = await f.service.add(guild, user, 'acme/widget', null);
    await f.workspace.remove(guild, first.categoryId!);
    const repaired = await f.service.add(guild, user, 'acme/widget', null);
    expect(repaired.categoryId).not.toBe(first.categoryId);
    expect(repaired.overviewId).toBe(first.overviewId);
    expect(repaired.issuesId).toBe(first.issuesId);
    expect(f.workspace.created).toBe(6);
  });

  it('finishes after a final database write failure without duplicating channels', async () => {
    const f = setup();
    const finish = vi.spyOn(f.store, 'finish').mockImplementationOnce(() => {
      throw new Error('database write failed');
    });
    await expect(
      f.service.add(guild, user, 'acme/widget', null),
    ).rejects.toThrow('database write failed');
    expect(f.store.find(guild, '100')?.status).toBe('pending');
    finish.mockRestore();
    const project = await f.service.add(guild, user, 'acme/widget', null);
    expect(project.status).toBe('ready');
    expect(f.workspace.created).toBe(5);
  });
});
