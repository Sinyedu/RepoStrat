import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../src/config.js';
import { createGitHubGateway } from '../src/github/repositories.js';

const api = vi.hoisted(() => ({
  response: null as unknown,
  error: null as unknown,
  calls: [] as Array<[string, { owner: string; repo: string }]>,
}));
vi.mock('@octokit/app', () => ({
  App: class {
    getInstallationOctokit() {
      return {
        request: async (
          route: string,
          params: { owner: string; repo: string },
        ) => {
          api.calls.push([route, params]);
          if (api.error) throw api.error;
          return api.response;
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

describe('GitHub App repository lookup', () => {
  beforeEach(() => {
    api.response = null;
    api.error = null;
    api.calls = [];
  });

  it('returns the stable ID and private visibility', async () => {
    api.response = {
      data: {
        id: 987,
        owner: { login: 'Sinyedu' },
        name: 'QueryPlan',
        html_url: 'https://github.com/Sinyedu/QueryPlan',
        visibility: 'private',
        private: true,
      },
    };
    await expect(
      createGitHubGateway(config).getRepository('Sinyedu', 'QueryPlan'),
    ).resolves.toEqual({
      id: '987',
      owner: 'Sinyedu',
      name: 'QueryPlan',
      url: 'https://github.com/Sinyedu/QueryPlan',
      visibility: 'private',
    });
    expect(api.calls).toEqual([
      ['GET /repos/{owner}/{repo}', { owner: 'Sinyedu', repo: 'QueryPlan' }],
    ]);
  });

  it.each([
    [404, 'github-unavailable'],
    [403, 'github-denied'],
    [429, 'github-rate-limit'],
  ])('maps GitHub status %i', async (status, code) => {
    api.error = Object.assign(new Error('GitHub request failed'), { status });
    const actual = await createGitHubGateway(config)
      .getRepository('acme', 'widget')
      .catch((error: unknown) => error);
    expect((actual as { code?: string }).code).toBe(code);
  });

  it('rejects malformed installation configuration at use time', async () => {
    const malformed = { ...config, GITHUB_INSTALLATION_ID: 'wrong' };
    await expect(
      createGitHubGateway(malformed).getRepository('acme', 'widget'),
    ).rejects.toMatchObject({ code: 'github-not-configured' });
  });
});
