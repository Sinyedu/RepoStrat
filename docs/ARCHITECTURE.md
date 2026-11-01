# Architecture

## Application process

`src/index.ts` loads validated configuration and starts one process. `src/app.ts` owns the Discord client, Fastify server, SQLite connection, command error handling, and shutdown. The client requests only the `Guilds` gateway intent. `src/discord/commands.ts` defines guild-scoped development commands; `handle-command.ts` validates permissions and input. `src/http.ts` exposes `GET /health`. The server binds to `HOST` (loopback by default) and `PORT`.

Fastify and the application use Pino JSON logs. Configuration errors identify variable names without printing values. GitHub App authentication is lazy, so missing GitHub configuration does not prevent `/ping` or `/health`. Command registration is a separate explicit step, so startup does not repeatedly overwrite guild commands.

`src/github/repositories.ts` reads the configured GitHub App key when a project command needs it, obtains an installation Octokit, and fetches the repository through that installation. A successful response supplies the stable GitHub ID and current owner/name, URL, and visibility. `src/projects/service.ts` validates input, enforces audience requirements, and coordinates the database with `src/discord/workspace.ts`. Project replies are ephemeral. The Discord adapter creates one category and four channels and checks or repairs stored mappings. `/project sync` first validates access and mappings through `ProjectService.sync`, then `src/sync/service.ts` imports issues and PRs.

## Issue and pull request synchronization

`src/github/items.ts` reads `GET /issues` and `GET /pulls` with `state=all`, 100 per page, oldest first, capped at 50 pages per type. Zod validates responses. Issues-endpoint entries that carry a `pull_request` key are discarded. The PR list already includes draft, merged, branches, and requested reviewers, so there are no per-item requests. Errors share the classifier in `src/github/client.ts`.

`src/sync/service.ts` holds an in-process lock per `(guild, repository)`, fetches both listings completely, and only then writes to Discord, so a GitHub failure changes nothing. `apply.ts` renders each item (`render.ts`, `sanitize.ts`) into a thread name and one embed and compares a SHA-256 of the rendering with the stored hash. An item is skipped only if its hash matches, its forum is unchanged, and its thread still exists (`ForumGateway.liveThreads`: one active-thread listing plus bounded archived pages, with direct fetches for the rest). Otherwise the starter message is edited, or a new post is created when the thread is gone. If a new mapping cannot be saved, the new thread is deleted. A write budget (`SYNC_BATCH_SIZE`) defers the remainder and three consecutive failures abort the run; both are reported. `src/discord/forum.ts` is the only discord.js forum code and always sends `allowedMentions: { parse: [] }`.

Rendered text is untrusted: mentions and Discord tokens are defused with zero-width spaces, HTML and comments are stripped, code fences are re-closed after truncation, and truncation is by code point. Issue bodies are never stored or logged.

## Persistence

`src/db/schema.ts` defines `guilds`, `repositories`, and `synced_items`. `synced_items` maps one GitHub item to one forum thread: guild, repository ID, item type, stable GitHub item ID, number, forum channel ID, thread ID, starter message ID, content hash, GitHub `updated_at`, and last sync time. It is unique on `(guild, repository, type, item ID)` and on thread ID, and references the registration by `(guild, repository)`, so one item can be mirrored in several servers. A repository rename keeps the stable ID, so mappings survive and posts are refreshed. A repository row stores the stable GitHub repository ID, current owner/name and URL, visibility, installation ID, guild ID, audience role, five Discord resource IDs, registration time, and pending/ready status. The unique `(guild_id, github_repository_id)` key allows the same repository in multiple Discord servers without duplicate registration within one server. Discord snowflakes and GitHub IDs are text to avoid JavaScript integer precision problems.

Drizzle Kit generates SQL migrations in `drizzle/`; the Drizzle migrator applies them at startup and via `pnpm db:migrate`. SQLite foreign keys are enabled, and file databases use WAL mode. The database path is a `file:` path relative to the working directory unless absolute. The database file and WAL files are ignored by Git.

Registration uses a two-minute SQLite claim lease to serialize concurrent commands. Each Discord resource ID is saved immediately after creation. A failed save removes that newly created resource; a later `/project add` reuses saved IDs or discovers the deterministic category and its named children after a crash. Missing channels are recreated on retry, and existing children are reparented when a category was deleted. A public repository that becomes private without an audience role is quarantined by denying `View Channel` to `@everyone` on its existing workspace. Registration then requires a role. Private workspaces are created with explicit role permissions and synchronized child overwrites.

Later milestones may need tables for installation metadata, webhook delivery IDs, and synchronization cursors. Keep webhook deduplication keyed by GitHub delivery ID. Design uniqueness around GitHub object IDs plus repository and guild, so one GitHub item can map to a thread in each server. Do not store GitHub private content in public Discord channels without permission checks.

## Future milestones

1. Done (Milestone 3): import issues and pull requests into forum posts and persist mappings, via manual `/project sync`.
2. Verify GitHub webhook signatures, deduplicate deliveries, and synchronize issue, PR, and activity updates.
3. Reconciliation, retries, operational diagnostics, and Docker deployment.

GitHub remains authoritative throughout. Discord edits must not write back to GitHub.
