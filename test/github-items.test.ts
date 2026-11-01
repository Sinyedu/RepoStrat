import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../src/config.js';
import { createItemsGateway } from '../src/github/items.js';

const api = vi.hoisted(() => ({
  pages: [] as unknown[][],
  error: null as unknown,
  calls: [] as Array<{ route: string; page: number; state: string }>,
}));
vi.mock('@octokit/app', () => ({
  App: class {
    getInstallationOctokit() {
      return {
        request: async (
          route: string,
          params: { page: number; state: string },
        ) => {
          api.calls.push({ route, page: params.page, state: params.state });
          if (api.error) throw api.error;
          return { data: api.pages[params.page - 1] ?? [] };
        },
      };
    }
  },
}));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => 'test-key'),
}));

const config = parseConfig({
  DISCORD_TOKEN: 'test',
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_GUILD_ID: '234567890123456789',
  GITHUB_APP_ID: '123',
  GITHUB_INSTALLATION_ID: '456',
  GITHUB_PRIVATE_KEY_PATH: 'test-key.pem',
});

function raw(number: number, extra: Record<string, unknown> = {}) {
  return {
    id: 9000 + number,
    number,
    title: `Item ${number}`,
    body: null,
    state: 'open',
    user: { login: 'octocat' },
    labels: [{ name: 'bug' }, 'plain'],
    assignees: [{ login: 'hubot' }],
    html_url: `https://github.com/acme/widget/issues/${number}`,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...extra,
  };
}
const pull = (number: number, extra: Record<string, unknown> = {}) =>
  raw(number, {
    head: { ref: 'feature' },
    base: { ref: 'main' },
    requested_reviewers: [{ login: 'reviewer' }],
    requested_teams: [{ slug: 'core' }],
    ...extra,
  });

describe('GitHub issue and pull request listing', () => {
  beforeEach(() => {
    api.pages = [];
    api.error = null;
    api.calls = [];
  });

  it('filters pull requests out of the issues endpoint', async () => {
    api.pages = [[raw(1), raw(2, { pull_request: { url: 'x' } }), raw(3)]];
    const { items, truncated } = await createItemsGateway(config).listIssues(
      'acme',
      'widget',
    );
    expect(items.map((i) => i.number)).toEqual([1, 3]);
    expect(items[0]).toMatchObject({
      id: '9001',
      type: 'issue',
      labels: ['bug', 'plain'],
      assignees: ['hubot'],
      author: 'octocat',
    });
    expect(truncated).toBe(false);
  });

  it('follows pagination until a short page', async () => {
    api.pages = [
      Array.from({ length: 100 }, (_, i) => raw(i + 1)),
      Array.from({ length: 100 }, (_, i) => raw(i + 101)),
      [raw(201)],
    ];
    const { items } = await createItemsGateway(config).listIssues(
      'acme',
      'widget',
    );
    expect(items).toHaveLength(201);
    expect(api.calls.map((c) => c.page)).toEqual([1, 2, 3]);
    expect(api.calls.every((c) => c.state === 'all')).toBe(true);
  });

  it('flags a listing cut off by the page cap', async () => {
    api.pages = Array.from({ length: 60 }, () =>
      Array.from({ length: 100 }, (_, i) => raw(i + 1)),
    );
    const listing = await createItemsGateway(config).listIssues(
      'acme',
      'widget',
    );
    expect(listing.truncated).toBe(true);
    expect(api.calls).toHaveLength(50);
  });

  it('normalizes merged, draft, branches, and reviewers in one request', async () => {
    api.pages = [
      [
        pull(1, { state: 'closed', merged_at: '2026-01-03T00:00:00Z' }),
        pull(2, { draft: true }),
      ],
    ];
    const { items } = await createItemsGateway(config).listPullRequests(
      'acme',
      'widget',
    );
    expect(api.calls).toHaveLength(1);
    expect(items[0]).toMatchObject({ merged: true, state: 'closed' });
    expect(items[1]).toMatchObject({
      draft: true,
      headRef: 'feature',
      baseRef: 'main',
      reviewers: ['reviewer', 'team:core'],
    });
  });

  it.each([
    [429, 'github-rate-limit'],
    [403, 'github-denied'],
    [404, 'github-unavailable'],
  ])('maps GitHub status %i', async (status, code) => {
    api.error = Object.assign(new Error('failed'), { status });
    await expect(
      createItemsGateway(config).listIssues('acme', 'widget'),
    ).rejects.toMatchObject({ code });
  });

  it('maps a secondary rate limit 403', async () => {
    api.error = Object.assign(new Error('x'), {
      status: 403,
      response: { headers: { 'retry-after': '30' } },
    });
    await expect(
      createItemsGateway(config).listPullRequests('acme', 'widget'),
    ).rejects.toMatchObject({ code: 'github-rate-limit' });
  });
});
