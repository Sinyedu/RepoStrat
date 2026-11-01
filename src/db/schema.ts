import {
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
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('repositories_guild_github_id').on(
      table.guildId,
      table.githubRepositoryId,
    ),
  ],
);
