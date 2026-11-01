import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { App } from '@octokit/app';
import type { Config } from '../config.js';
import {
  ProjectError,
  type GitHubGateway,
  type Visibility,
} from '../projects/types.js';

function classify(error: unknown): never {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number(error.status)
      : 0;
  const headers =
    typeof error === 'object' && error !== null && 'response' in error
      ? (error.response as { headers?: Record<string, string> })?.headers
      : undefined;
  const message = error instanceof Error ? error.message : '';
  if (
    status === 429 ||
    (status === 403 &&
      (headers?.['x-ratelimit-remaining'] === '0' ||
        !!headers?.['retry-after'] ||
        /rate limit/i.test(message)))
  ) {
    throw new ProjectError('github-rate-limit');
  }
  if (status === 404) throw new ProjectError('github-unavailable');
  if (status === 401 || status === 403) throw new ProjectError('github-denied');
  throw error;
}

export function createGitHubGateway(config: Config): GitHubGateway {
  let app: App | undefined;
  return {
    async getRepository(owner, name) {
      if (
        !config.GITHUB_APP_ID ||
        !config.GITHUB_INSTALLATION_ID ||
        !config.GITHUB_PRIVATE_KEY_PATH ||
        !/^\d+$/.test(config.GITHUB_APP_ID) ||
        !/^\d+$/.test(config.GITHUB_INSTALLATION_ID) ||
        !Number.isSafeInteger(Number(config.GITHUB_INSTALLATION_ID)) ||
        Number(config.GITHUB_INSTALLATION_ID) <= 0
      ) {
        throw new ProjectError('github-not-configured');
      }
      try {
        app ??= new App({
          appId: config.GITHUB_APP_ID,
          privateKey: await readFile(
            resolve(config.GITHUB_PRIVATE_KEY_PATH),
            'utf8',
          ),
        });
        const octokit = await app.getInstallationOctokit(
          Number(config.GITHUB_INSTALLATION_ID),
        );
        const { data } = await octokit.request('GET /repos/{owner}/{repo}', {
          owner,
          repo: name,
        });
        const visibility: Visibility =
          data.visibility === 'public' ||
          data.visibility === 'private' ||
          data.visibility === 'internal'
            ? data.visibility
            : data.private
              ? 'private'
              : 'public';
        return {
          id: String(data.id),
          owner: data.owner.login,
          name: data.name,
          url: data.html_url,
          visibility,
        };
      } catch (error) {
        if (error instanceof ProjectError) throw error;
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        ) {
          throw new ProjectError('github-not-configured');
        }
        classify(error);
      }
    },
  };
}
