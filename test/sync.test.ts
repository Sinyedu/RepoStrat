import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectError } from '../src/projects/types.js';
import { guild, item, syncFixture, user } from './sync-fixture.js';

type Fixture = Awaited<ReturnType<typeof syncFixture>>;
const active: Fixture[] = [];
async function setup(options?: Parameters<typeof syncFixture>[0]) {
  const f = await syncFixture(options);
  active.push(f);
  return f;
}
afterEach(() => {
  for (const f of active.splice(0)) f.database.close();
});
const run = (f: Fixture) => f.sync.run(guild, user, 'acme/widget');

describe('initial import', () => {
  it('imports issues and pull requests into their own forums', async () => {
    const f = await setup();
    f.items.issues = [item(1), item(2)];
    f.items.pulls = [item(3, 'pull_request')];
    const { summary } = await run(f);
    expect(summary).toMatchObject({
      issuesImported: 2,
      pullRequestsImported: 1,
      unchanged: 0,
      failures: [],
    });
    const forums = [...f.forum.threads.values()].map((t) => t.forumId);
    expect(forums.filter((id) => id === f.project.issuesId)).toHaveLength(2);
    expect(forums.filter((id) => id === f.project.pullRequestsId)).toHaveLength(
      1,
    );
    expect([...f.forum.threads.values()][0]?.post.name).toBe('#1 — Item 1');
    expect(f.store.forRepository(guild, '100').size).toBe(3);
  });

  it('reports an empty repository as synchronized', async () => {
    const f = await setup();
    const { summary } = await run(f);
    expect(summary).toMatchObject({ issuesImported: 0, unchanged: 0 });
    expect(f.forum.created).toBe(0);
  });

  it('keeps an issue and a PR with the same number separate', async () => {
    const f = await setup();
    f.items.issues = [item(7)];
    f.items.pulls = [item(7, 'pull_request')];
    await run(f);
    expect(f.forum.threads.size).toBe(2);
  });
});

describe('repeat synchronization', () => {
  it('does not duplicate posts or edit unchanged ones', async () => {
    const f = await setup();
    f.items.issues = [item(1)];
    f.items.pulls = [item(2, 'pull_request')];
    await run(f);
    const second = await run(f);
    expect(second.summary).toMatchObject({
      issuesImported: 0,
      updated: 0,
      unchanged: 2,
    });
    expect(f.forum.created).toBe(2);
    expect(f.forum.edits).toBe(0);
  });

  it('updates the existing post when GitHub content changes', async () => {
    const f = await setup();
    f.items.issues = [item(1)];
    await run(f);
    const before = f.store.forRepository(guild, '100').values().next().value!;
    f.items.issues = [
      item(1, 'issue', {
        title: 'Renamed',
        state: 'closed',
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      }),
    ];
    const { summary } = await run(f);
    expect(summary).toMatchObject({ updated: 1, issuesImported: 0 });
    expect(f.forum.created).toBe(1);
    const post = f.forum.threads.get(before.threadId)!.post;
    expect(post.name).toBe('#1 — Renamed');
    expect(JSON.stringify(post.embed)).toContain('Closed');
    const after = f.store.forRepository(guild, '100').values().next().value!;
    expect(after.id).toBe(before.id);
    expect(after.githubUpdatedAt).toEqual(new Date('2026-02-01T00:00:00Z'));
  });

  it('renders closed, merged, and draft pull request statuses', async () => {
    const f = await setup();
    f.items.pulls = [
      item(1, 'pull_request', { state: 'closed', merged: true }),
      item(2, 'pull_request', { state: 'closed' }),
      item(3, 'pull_request', { draft: true }),
    ];
    await run(f);
    const text = [...f.forum.threads.values()].map((t) =>
      JSON.stringify(t.post.embed),
    );
    expect(text[0]).toContain('Merged');
    expect(text[1]).toContain('Closed');
    expect(text[2]).toContain('Draft');
  });

  it('follows a repository rename without duplicating posts', async () => {
    const f = await setup();
    f.items.issues = [item(1)];
    await run(f);
    f.setRepository({
      name: 'renamed',
      url: 'https://github.com/acme/renamed',
    });
    const { summary } = await f.sync.run(guild, user, 'acme/renamed');
    expect(summary).toMatchObject({ updated: 1, issuesImported: 0 });
    expect(f.forum.created).toBe(1);
    expect(JSON.stringify([...f.forum.threads.values()][0]?.post)).toContain(
      'acme/renamed',
    );
  });
});

describe('failure handling', () => {
  it('recreates a deleted Discord thread and remaps it', async () => {
    const f = await setup();
    f.items.issues = [item(1)];
    await run(f);
    const old = f.store.forRepository(guild, '100').values().next().value!;
    f.forum.threads.delete(old.threadId);
    const { summary } = await run(f);
    expect(summary).toMatchObject({ recreated: 1, issuesImported: 0 });
    const now = f.store.forRepository(guild, '100');
    expect(now.size).toBe(1);
    expect(now.values().next().value!.threadId).not.toBe(old.threadId);
  });

  it('reports partial Discord failures and recovers on retry', async () => {
    const f = await setup();
    f.items.issues = [item(1), item(2), item(3)];
    f.forum.failCreate = (post) =>
      post.name.startsWith('#2')
        ? Object.assign(new Error('denied'), { code: 50013 })
        : null;
    const first = await run(f);
    expect(first.summary).toMatchObject({
      issuesImported: 2,
      failures: [{ number: 2, reason: 'Discord error 50013' }],
    });
    expect(f.store.forRepository(guild, '100').size).toBe(2);
    f.forum.failCreate = () => null;
    const second = await run(f);
    expect(second.summary).toMatchObject({ issuesImported: 1, unchanged: 2 });
    expect(f.forum.created).toBe(3);
  });

  it('stops after repeated failures and counts the rest as deferred', async () => {
    const f = await setup();
    f.items.issues = [1, 2, 3, 4, 5].map((n) => item(n));
    f.forum.failCreate = () => new Error('down');
    const { summary } = await run(f);
    expect(summary).toMatchObject({ aborted: true, deferred: 2 });
    expect(summary?.failures).toHaveLength(3);
    expect(f.store.forRepository(guild, '100').size).toBe(0);
  });

  it('deletes the new thread when saving its mapping fails', async () => {
    const f = await setup();
    f.items.issues = [item(1)];
    vi.spyOn(f.store, 'insert').mockImplementation(() => {
      throw new Error('database write failed');
    });
    const { summary } = await run(f);
    expect(summary?.failures).toHaveLength(1);
    expect(summary?.issuesImported).toBe(0);
    expect(f.forum.threads.size).toBe(0);
    expect(f.forum.deleted).toHaveLength(1);
  });

  it('keeps existing mappings when GitHub is rate limited', async () => {
    const f = await setup();
    f.items.issues = [item(1)];
    await run(f);
    f.items.error = new ProjectError('github-rate-limit');
    await expect(run(f)).rejects.toMatchObject({ code: 'github-rate-limit' });
    expect(f.store.forRepository(guild, '100').size).toBe(1);
    expect(f.forum.threads.size).toBe(1);
    expect(f.forum.edits).toBe(0);
  });

  it('keeps mappings when installation access is revoked', async () => {
    const f = await setup();
    f.items.issues = [item(1)];
    await run(f);
    f.setGitHubError(new ProjectError('github-unavailable'));
    await expect(run(f)).rejects.toMatchObject({ code: 'github-unavailable' });
    expect(f.store.forRepository(guild, '100').size).toBe(1);
    expect(f.forum.threads.size).toBe(1);
  });

  it('never calls Discord with partial data when listing fails', async () => {
    const f = await setup();
    f.items.error = new ProjectError('github-denied');
    await expect(run(f)).rejects.toMatchObject({ code: 'github-denied' });
    expect(f.forum.created).toBe(0);
  });
});

describe('limits', () => {
  it('writes at most the batch size and reports the remainder', async () => {
    const f = await setup({ batchSize: 2 });
    f.items.issues = [1, 2, 3, 4, 5].map((n) => item(n));
    const first = await run(f);
    expect(first.summary).toMatchObject({ issuesImported: 2, deferred: 3 });
    const second = await run(f);
    expect(second.summary).toMatchObject({
      issuesImported: 2,
      unchanged: 2,
      deferred: 1,
    });
    const third = await run(f);
    expect(third.summary).toMatchObject({ issuesImported: 1, deferred: 0 });
    expect(f.forum.created).toBe(5);
  });

  it('carries a truncated GitHub listing into the summary', async () => {
    const f = await setup();
    f.items.truncated = true;
    expect((await run(f)).summary?.truncated).toBe(true);
  });
});

describe('concurrency', () => {
  it('rejects a second simultaneous sync without duplicates', async () => {
    const f = await setup();
    f.items.issues = [item(1), item(2)];
    f.forum.delayMs = 15;
    const results = await Promise.allSettled([run(f), run(f)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'sync-in-progress' },
    });
    expect(f.forum.threads.size).toBe(2);
    await run(f);
    expect(f.forum.threads.size).toBe(2);
  });

  it('releases the lock after a failure', async () => {
    const f = await setup();
    f.items.error = new Error('boom');
    await expect(run(f)).rejects.toThrow('boom');
    f.items.error = null;
    await expect(run(f)).resolves.toBeDefined();
  });
});

describe('access restrictions', () => {
  it('imports nothing while the workspace has permission problems', async () => {
    const f = await setup();
    f.items.issues = [item(1)];
    await f.workspace.remove(guild, f.project.issuesId!);
    const { summary, problems } = await run(f);
    expect(summary).toBeNull();
    expect(problems).toContain('issuesId');
    expect(f.items.calls).toBe(0);
    expect(f.forum.created).toBe(0);
  });

  it('refuses private content without an audience role and quarantines', async () => {
    const f = await setup();
    f.items.issues = [item(1)];
    f.setRepository({ visibility: 'private' });
    await expect(run(f)).rejects.toMatchObject({ code: 'audience-required' });
    expect(f.workspace.quarantined).toBe(true);
    expect(f.forum.created).toBe(0);
  });

  it('requires the caller to belong to a private audience', async () => {
    const f = await setup();
    f.setRepository({ visibility: 'private' });
    await f.service.add(guild, user, 'acme/widget', '345678901234567890');
    f.items.issues = [item(1)];
    f.workspace.audienceAllowed = false;
    await expect(run(f)).rejects.toMatchObject({ code: 'audience-denied' });
    expect(f.forum.created).toBe(0);
    f.workspace.audienceAllowed = true;
    expect((await run(f)).summary?.issuesImported).toBe(1);
  });

  it('scopes mappings per guild', async () => {
    const f = await setup();
    f.items.issues = [item(1)];
    await run(f);
    const other = '345678901234567890';
    await f.service.add(other, user, 'acme/widget', null);
    await f.sync.run(other, user, 'acme/widget');
    expect(f.forum.threads.size).toBe(2);
    expect(f.store.forRepository(guild, '100').size).toBe(1);
    expect(f.store.forRepository(other, '100').size).toBe(1);
  });
});

describe('persistence', () => {
  it('reuses mappings after the application restarts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'repostrat-'));
    const url = `file:${join(dir, 'test.db').replace(/\\/g, '/')}`;
    try {
      const first = await syncFixture({ databaseUrl: url });
      first.items.issues = [item(1)];
      await first.sync.run(guild, user, 'acme/widget');
      first.database.close();

      const second = await syncFixture({ databaseUrl: url });
      active.push(second);
      second.forum.threads = first.forum.threads;
      second.items.issues = [item(1)];
      const { summary } = await second.sync.run(guild, user, 'acme/widget');
      expect(summary).toMatchObject({ unchanged: 1, issuesImported: 0 });
      expect(first.forum.threads.size).toBe(1);
    } finally {
      for (const f of active.splice(0)) f.database.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
