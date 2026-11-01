import { ProjectError, ProjectOperationError } from '../projects/types.js';
import { renderItem } from './render.js';
import { mappingKey, type Mapping, type SyncStore } from './store.js';
import type {
  ForumGateway,
  GitHubItem,
  ItemType,
  SyncSummary,
} from './types.js';

const maxConsecutiveFailures = 3;
type Rendered = ReturnType<typeof renderItem>;

export type ApplyContext = {
  guildId: string;
  repositoryId: string;
  repositoryName: string;
  forumIds: Record<ItemType, string>;
  mappings: Map<string, Mapping>;
  store: SyncStore;
  forum: ForumGateway;
  batchSize: number;
  onProgress?: (written: number) => void;
};

/** Short, secret-free description of a failure. */
export function reason(error: unknown): string {
  if (error instanceof ProjectError) return error.code;
  const api = (error ?? {}) as { code?: unknown; status?: unknown };
  if (typeof api.code === 'number') return `Discord error ${api.code}`;
  if (typeof api.status === 'number') return `HTTP ${api.status}`;
  return error instanceof Error ? error.name : 'unknown error';
}

async function write(
  ctx: ApplyContext,
  item: GitHubItem,
  post: Rendered,
  summary: SyncSummary,
) {
  const forumId = ctx.forumIds[item.type];
  const mapping = ctx.mappings.get(mappingKey(item.type, item.id));
  const now = new Date();
  const fresh = {
    contentHash: post.hash,
    githubUpdatedAt: item.updatedAt,
    lastSyncedAt: now,
  };

  if (mapping) {
    const result = await ctx.forum.updatePost(
      ctx.guildId,
      forumId,
      mapping.threadId,
      post,
    );
    if (result === 'updated') {
      ctx.store.update(mapping.id, fresh);
      summary.updated++;
      return;
    }
  }

  // New item, or its Discord thread was deleted: create a fresh post.
  const created = await ctx.forum.createPost(ctx.guildId, forumId, post);
  try {
    if (mapping) {
      const where = {
        channelId: forumId,
        threadId: created.threadId,
        starterMessageId: created.starterMessageId,
      };
      ctx.store.update(mapping.id, { ...where, ...fresh });
      summary.recreated++;
      return;
    }
    ctx.store.insert({
      guildId: ctx.guildId,
      githubRepositoryId: ctx.repositoryId,
      itemType: item.type,
      githubItemId: item.id,
      number: item.number,
      channelId: forumId,
      threadId: created.threadId,
      starterMessageId: created.starterMessageId,
      ...fresh,
    });
  } catch (error) {
    // Never leave an unmapped duplicate behind a failed database write.
    await ctx.forum
      .deletePost(ctx.guildId, created.threadId)
      .catch(() => undefined);
    throw error;
  }
  if (item.type === 'issue') summary.issuesImported++;
  else summary.pullRequestsImported++;
}

/** Thread IDs of unchanged mappings that still exist in Discord. */
async function liveThreads(ctx: ApplyContext, items: GitHubItem[]) {
  const live = new Set<string>();
  for (const type of ['issue', 'pull_request'] as const) {
    const ids: string[] = [];
    for (const item of items) {
      const mapping = ctx.mappings.get(mappingKey(type, item.id));
      if (
        item.type === type &&
        mapping?.contentHash === renderItem(item, ctx.repositoryName).hash &&
        mapping.channelId === ctx.forumIds[type]
      )
        ids.push(mapping.threadId);
    }
    try {
      const found = await ctx.forum.liveThreads(
        ctx.guildId,
        ctx.forumIds[type],
        ids,
      );
      for (const id of found) live.add(id);
    } catch (error) {
      throw new ProjectOperationError('discord.forum.liveThreads', error);
    }
  }
  return live;
}

/** Applies items in order; one failing item never affects the others. */
export async function applyItems(
  ctx: ApplyContext,
  items: GitHubItem[],
  summary: SyncSummary,
): Promise<void> {
  const live = await liveThreads(ctx, items);
  const unchanged: number[] = [];
  let written = 0;
  let failures = 0;
  for (const item of items) {
    const mapping = ctx.mappings.get(mappingKey(item.type, item.id));
    const post = renderItem(item, ctx.repositoryName);
    if (
      mapping?.contentHash === post.hash &&
      mapping.channelId === ctx.forumIds[item.type] &&
      live.has(mapping.threadId)
    ) {
      unchanged.push(mapping.id);
      summary.unchanged++;
      continue;
    }
    if (written >= ctx.batchSize || summary.aborted) {
      summary.deferred++;
      continue;
    }
    try {
      await write(ctx, item, post, summary);
      written++;
      failures = 0;
      ctx.onProgress?.(written);
    } catch (error) {
      summary.failures.push({
        type: item.type,
        number: item.number,
        reason: reason(error),
      });
      if (++failures >= maxConsecutiveFailures) summary.aborted = true;
    }
  }
  ctx.store.touch(unchanged, new Date());
}
