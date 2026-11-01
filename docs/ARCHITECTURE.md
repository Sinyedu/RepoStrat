# Architecture

## Milestone 1 process

`src/index.ts` loads validated configuration and starts one process. `src/app.ts` owns the Discord client, Fastify server, SQLite connection, command error handling, and shutdown. The client requests only the `Guilds` gateway intent. `src/discord/commands.ts` defines guild-scoped development commands; `handle-command.ts` validates permissions and input. `src/http.ts` exposes `GET /health`. The server binds to `HOST` (loopback by default) and `PORT`.

Fastify and the application use Pino JSON logs. Configuration errors identify variable names without printing values. GitHub environment fields are reserved but never required to start the Discord-only foundation. Command registration is a separate explicit step, so startup does not repeatedly overwrite guild commands.

## Persistence

`src/db/schema.ts` currently defines `guilds` and `repositories`. They are the minimum near-term entities for registering a repository in a guild. A repository row stores the stable GitHub repository ID, current owner/name, installation ID, and guild ID. The unique `(guild_id, github_repository_id)` key allows the same repository in multiple Discord servers without duplicate registration within one server. Discord snowflakes and GitHub IDs are text to avoid JavaScript integer precision problems.

Drizzle Kit generates SQL migrations in `drizzle/`; the Drizzle migrator applies them at startup and via `pnpm db:migrate`. SQLite foreign keys are enabled, and file databases use WAL mode. The database path is a `file:` path relative to the working directory unless absolute. The database file and WAL files are ignored by Git.

When the corresponding behavior is implemented, add tables for installation metadata, category and channel IDs, issue and PR thread IDs, webhook delivery IDs, and synchronization cursors/status. Keep webhook deduplication keyed by GitHub delivery ID. Design uniqueness around GitHub object IDs plus repository and guild, so one GitHub item can map to a thread in each server. Do not store GitHub private content in public Discord channels without permission checks.

## Future milestones

1. GitHub App authentication and read-only repository validation; implement `/project add` and `/project list`, plus one category and four channels per repository.
2. Import existing issues and pull requests into forum posts and persist mappings.
3. Verify GitHub webhook signatures, deduplicate deliveries, and synchronize issue, PR, and activity updates.
4. Reconciliation, retries, operational diagnostics, and Docker deployment.

GitHub remains authoritative throughout. Discord edits must not write back to GitHub.
