import {
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const guilds = sqliteTable('guilds', {
  id: text('id').primaryKey(), // Discord snowflake; never convert to Number.
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const repositories = sqliteTable(
  'repositories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    guildId: text('guild_id')
      .notNull()
      .references(() => guilds.id),
    githubRepositoryId: text('github_repository_id').notNull(), // Stable GitHub ID.
    owner: text('owner').notNull(),
    name: text('name').notNull(),
    githubInstallationId: text('github_installation_id').notNull(),
    htmlUrl: text('html_url'),
    visibility: text('visibility', {
      enum: ['public', 'private', 'internal', 'unknown'],
    })
      .notNull()
      .default('unknown'),
    audienceRoleId: text('audience_role_id'),
    categoryId: text('category_id'),
    overviewId: text('overview_id'),
    issuesId: text('issues_id'),
    pullRequestsId: text('pull_requests_id'),
    activityId: text('activity_id'),
    status: text('status', { enum: ['pending', 'ready'] })
      .notNull()
      .default('pending'),
    claimToken: text('claim_token'),
    claimUntil: integer('claim_until', { mode: 'timestamp' }),
    registeredAt: integer('registered_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('repositories_guild_github_id').on(
      table.guildId,
      table.githubRepositoryId,
    ),
  ],
);

export const syncedItems = sqliteTable(
  'synced_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    guildId: text('guild_id').notNull(),
    githubRepositoryId: text('github_repository_id').notNull(),
    itemType: text('item_type', { enum: ['issue', 'pull_request'] }).notNull(),
    githubItemId: text('github_item_id').notNull(), // Stable GitHub ID.
    number: integer('number').notNull(),
    channelId: text('channel_id').notNull(), // Forum channel.
    threadId: text('thread_id').notNull(),
    starterMessageId: text('starter_message_id'),
    contentHash: text('content_hash').notNull(),
    githubUpdatedAt: integer('github_updated_at', {
      mode: 'timestamp',
    }).notNull(),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.guildId, table.githubRepositoryId],
      foreignColumns: [repositories.guildId, repositories.githubRepositoryId],
    }),
    uniqueIndex('synced_items_identity').on(
      table.guildId,
      table.githubRepositoryId,
      table.itemType,
      table.githubItemId,
    ),
    uniqueIndex('synced_items_thread').on(table.threadId),
    index('synced_items_repository').on(
      table.guildId,
      table.githubRepositoryId,
    ),
  ],
);
