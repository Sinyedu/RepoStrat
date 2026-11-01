import type { Project } from '../projects/types.js';

export type ItemType = 'issue' | 'pull_request';

/** Normalized GitHub issue or pull request. Bodies are never persisted. */
export type GitHubItem = {
  id: string;
  number: number;
  type: ItemType;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  merged: boolean;
  draft: boolean;
  author: string | null;
  labels: string[];
  assignees: string[];
  reviewers: string[];
  headRef: string | null;
  baseRef: string | null;
  url: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ItemListing = { items: GitHubItem[]; truncated: boolean };

export interface ItemsGateway {
  listIssues(owner: string, name: string): Promise<ItemListing>;
  listPullRequests(owner: string, name: string): Promise<ItemListing>;
}

export type ForumPost = { name: string; embed: Record<string, unknown> };

export interface ForumGateway {
  /** Creates a forum post and returns its thread ID. */
  createPost(
    guildId: string,
    forumId: string,
    post: ForumPost,
  ): Promise<{ threadId: string; starterMessageId: string }>;
  /** Edits the bot-owned starter message; 'missing' if the thread is gone. */
  updatePost(
    guildId: string,
    forumId: string,
    threadId: string,
    post: ForumPost,
  ): Promise<'updated' | 'missing'>;
  /** Returns the subset of thread IDs that still exist in the forum. */
  liveThreads(
    guildId: string,
    forumId: string,
    threadIds: string[],
  ): Promise<Set<string>>;
  /** Removes a post this process just created (compensation only). */
  deletePost(guildId: string, threadId: string): Promise<void>;
}

export type SyncFailure = {
  type: ItemType;
  number: number;
  reason: string;
};

export type SyncSummary = {
  issuesImported: number;
  pullRequestsImported: number;
  updated: number;
  recreated: number;
  unchanged: number;
  deferred: number;
  truncated: boolean;
  aborted: boolean;
  failures: SyncFailure[];
};

export type SyncOutcome = {
  project: Project;
  problems: string[];
  summary: SyncSummary | null;
};
