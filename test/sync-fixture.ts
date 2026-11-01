import { fixture } from './project-fixture.js';
import { SyncService } from '../src/sync/service.js';
import { SyncStore } from '../src/sync/store.js';
import type {
  ForumGateway,
  ForumPost,
  GitHubItem,
  ItemListing,
  ItemsGateway,
  ItemType,
} from '../src/sync/types.js';

export const guild = '123456789012345678';
export const user = '234567890123456789';

export function item(
  number: number,
  type: ItemType = 'issue',
  extra: Partial<GitHubItem> = {},
): GitHubItem {
  return {
    id: `${type === 'issue' ? 1000 : 2000}${number}`,
    number,
    type,
    title: `Item ${number}`,
    body: 'Body text',
    state: 'open',
    merged: false,
    draft: false,
    author: 'octocat',
    labels: ['bug'],
    assignees: [],
    reviewers: [],
    headRef: type === 'pull_request' ? 'feature' : null,
    baseRef: type === 'pull_request' ? 'main' : null,
    url: `https://github.com/acme/widget/${type === 'issue' ? 'issues' : 'pull'}/${number}`,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...extra,
  };
}

export class FakeItems implements ItemsGateway {
  issues: GitHubItem[] = [];
  pulls: GitHubItem[] = [];
  error: Error | null = null;
  truncated = false;
  calls = 0;

  private listing(items: GitHubItem[]): ItemListing {
    this.calls++;
    if (this.error) throw this.error;
    return { items: [...items], truncated: this.truncated };
  }
  async listIssues() {
    return this.listing(this.issues);
  }
  async listPullRequests() {
    return this.listing(this.pulls);
  }
}

export class FakeForum implements ForumGateway {
  threads = new Map<string, { forumId: string; post: ForumPost }>();
  created = 0;
  edits = 0;
  deleted: string[] = [];
  failCreate: (post: ForumPost) => Error | null = () => null;
  failUpdate: Error | null = null;
  delayMs = 0;

  private async pause() {
    if (this.delayMs)
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
  }

  async createPost(_guildId: string, forumId: string, post: ForumPost) {
    await this.pause();
    const failure = this.failCreate(post);
    if (failure) throw failure;
    const threadId = String(5000 + ++this.created);
    this.threads.set(threadId, { forumId, post });
    return { threadId, starterMessageId: threadId };
  }

  async updatePost(
    _guildId: string,
    forumId: string,
    threadId: string,
    post: ForumPost,
  ) {
    await this.pause();
    if (this.failUpdate) throw this.failUpdate;
    const thread = this.threads.get(threadId);
    if (!thread || thread.forumId !== forumId) return 'missing' as const;
    thread.post = post;
    this.edits++;
    return 'updated' as const;
  }

  async liveThreads(_guildId: string, forumId: string, ids: string[]) {
    return new Set(
      ids.filter((id) => this.threads.get(id)?.forumId === forumId),
    );
  }

  async deletePost(_guildId: string, threadId: string) {
    this.deleted.push(threadId);
    this.threads.delete(threadId);
  }
}

export async function syncFixture(
  options: { batchSize?: number; databaseUrl?: string } = {},
) {
  const base = fixture(options.databaseUrl);
  const items = new FakeItems();
  const forum = new FakeForum();
  const store = new SyncStore(base.database.db);
  const build = (batchSize = options.batchSize ?? 50) =>
    new SyncService(base.service, items, forum, store, batchSize);
  const sync = build();
  const project = await base.service.add(guild, user, 'acme/widget', null);
  return { ...base, items, forum, store, sync, build, project };
}
