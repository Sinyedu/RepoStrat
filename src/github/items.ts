import { z } from 'zod';
import type { Config } from '../config.js';
import type {
  GitHubItem,
  ItemListing,
  ItemsGateway,
  ItemType,
} from '../sync/types.js';
import { classify, createInstallationProvider } from './client.js';

const perPage = 100;
const maxPages = 50;

const login = z.object({ login: z.string() });
const base = {
  id: z.number(),
  number: z.number().int(),
  title: z.string(),
  body: z.string().nullish(),
  state: z.enum(['open', 'closed']),
  user: login.nullish(),
  labels: z.array(z.union([z.string(), z.object({ name: z.string() })])),
  assignees: z.array(login).nullish(),
  html_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
};
const issueSchema = z.object({ ...base, pull_request: z.unknown().optional() });
const pullSchema = z.object({
  ...base,
  draft: z.boolean().nullish(),
  merged_at: z.string().nullish(),
  requested_reviewers: z.array(login).nullish(),
  requested_teams: z.array(z.object({ slug: z.string() })).nullish(),
  head: z.object({ ref: z.string() }),
  base: z.object({ ref: z.string() }),
});

function common(raw: z.infer<typeof issueSchema>, type: ItemType) {
  return {
    id: String(raw.id),
    number: raw.number,
    type,
    title: raw.title,
    body: raw.body ?? null,
    state: raw.state,
    author: raw.user?.login ?? null,
    labels: raw.labels.map((l) => (typeof l === 'string' ? l : l.name)),
    assignees: (raw.assignees ?? []).map((a) => a.login),
    url: raw.html_url,
    createdAt: new Date(raw.created_at),
    updatedAt: new Date(raw.updated_at),
  };
}

function issueItem(raw: z.infer<typeof issueSchema>): GitHubItem {
  return {
    ...common(raw, 'issue'),
    merged: false,
    draft: false,
    reviewers: [],
    headRef: null,
    baseRef: null,
  };
}

function pullItem(raw: z.infer<typeof pullSchema>): GitHubItem {
  return {
    ...common(raw, 'pull_request'),
    merged: !!raw.merged_at,
    draft: !!raw.draft,
    reviewers: [
      ...(raw.requested_reviewers ?? []).map((r) => r.login),
      ...(raw.requested_teams ?? []).map((t) => `team:${t.slug}`),
    ],
    headRef: raw.head.ref,
    baseRef: raw.base.ref,
  };
}

export function createItemsGateway(
  config: Config,
  getClient = createInstallationProvider(config),
): ItemsGateway {
  // Oldest-first keeps page boundaries stable while items are being updated.
  async function list(
    route:
      'GET /repos/{owner}/{repo}/issues' | 'GET /repos/{owner}/{repo}/pulls',
    owner: string,
    repo: string,
  ): Promise<ItemListing> {
    const octokit = await getClient();
    const items: GitHubItem[] = [];
    try {
      for (let page = 1; page <= maxPages; page++) {
        const { data } = await octokit.request(route, {
          owner,
          repo,
          state: 'all',
          sort: 'created',
          direction: 'asc',
          per_page: perPage,
          page,
        });
        const rows = z.array(z.unknown()).parse(data);
        for (const row of rows) {
          if (route.endsWith('/pulls')) {
            items.push(pullItem(pullSchema.parse(row)));
          } else {
            const issue = issueSchema.parse(row);
            // The issues endpoint also returns pull requests; skip them.
            if (!issue.pull_request) items.push(issueItem(issue));
          }
        }
        if (rows.length < perPage) return { items, truncated: false };
      }
      return { items, truncated: true };
    } catch (error) {
      return classify(error);
    }
  }
  return {
    listIssues: (owner, name) =>
      list('GET /repos/{owner}/{repo}/issues', owner, name),
    listPullRequests: (owner, name) =>
      list('GET /repos/{owner}/{repo}/pulls', owner, name),
  };
}
