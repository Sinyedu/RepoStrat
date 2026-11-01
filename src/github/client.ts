import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { App } from '@octokit/app';
import type { Config } from '../config.js';
import { ProjectError } from '../projects/types.js';

export type InstallationClient = Awaited<
  ReturnType<App['getInstallationOctokit']>
>;

/** Maps a GitHub/Octokit failure to a ProjectError; rethrows unknown errors. */
export function classify(error: unknown): never {
  if (error instanceof ProjectError) throw error;
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
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
    throw new ProjectError('github-not-configured');
  }
  throw error;
}

/** Lazily creates the GitHub App and returns an installation client. */
export function createInstallationProvider(
  config: Config,
): () => Promise<InstallationClient> {
  let app: App | undefined;
  return async () => {
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
      return await app.getInstallationOctokit(
        Number(config.GITHUB_INSTALLATION_ID),
      );
    } catch (error) {
      return classify(error);
    }
  };
}
