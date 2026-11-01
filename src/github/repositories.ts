import type { Config } from '../config.js';
import type { GitHubGateway, Visibility } from '../projects/types.js';
import { classify, createInstallationProvider } from './client.js';

export function createGitHubGateway(
  config: Config,
  getClient = createInstallationProvider(config),
): GitHubGateway {
  return {
    async getRepository(owner, name) {
      const octokit = await getClient();
      try {
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
        return classify(error);
      }
    },
  };
}
