# Architecture

## Application process

`src/index.ts` loads validated configuration and starts one process. `src/app.ts` owns the Discord client, Fastify server, SQLite connection, command error handling, and shutdown. The client requests only the `Guilds` gateway intent. `src/discord/commands.ts` defines guild-scoped development commands; `handle-command.ts` validates permissions and input. `src/http.ts` exposes `GET /health`. The server binds to `HOST` (loopback by default) and `PORT`.

Fastify and the application use Pino JSON logs. Configuration errors identify variable names without printing values. GitHub App authentication is lazy, so missing GitHub configuration does not prevent `/ping` or `/health`. Command registration is a separate explicit step, so startup does not repeatedly overwrite guild commands.

`src/github/repositories.ts` reads the configured GitHub App key when a project command needs it, obtains an installation Octokit, and fetches the repository through that installation. A successful response supplies the stable GitHub ID and current owner/name, URL, and visibility. `src/projects/service.ts` validates input, enforces audience requirements, and coordinates the database with `src/discord/workspace.ts`. Project replies are ephemeral. The Discord adapter creates one category and four channels and checks or repairs stored mappings. `/project sync` validates access and mappings; it does not import issues or PRs.

## Persistence

`src/db/schema.ts` defines `guilds` and `repositories`. A repository row stores the stable GitHub repository ID, current owner/name and URL, visibility, installation ID, guild ID, audience role, five Discord resource IDs, registration time, and pending/ready status. The unique `(guild_id, github_repository_id)` key allows the same repository in multiple Discord servers without duplicate registration within one server. Discord snowflakes and GitHub IDs are text to avoid JavaScript integer precision problems.

Drizzle Kit generates SQL migrations in `drizzle/`; the Drizzle migrator applies them at startup and via `pnpm db:migrate`. SQLite foreign keys are enabled, and file databases use WAL mode. The database path is a `file:` path relative to the working directory unless absolute. The database file and WAL files are ignored by Git.

Registration uses a two-minute SQLite claim lease to serialize concurrent commands. Each Discord resource ID is saved immediately after creation. A failed save removes that newly created resource; a later `/project add` reuses saved IDs or discovers the deterministic category and its named children after a crash. Missing channels are recreated on retry, and existing children are reparented when a category was deleted. A public repository that becomes private without an audience role is quarantined by denying `View Channel` to `@everyone` on its existing workspace. Registration then requires a role. Private workspaces are created with explicit role permissions and synchronized child overwrites.

Later milestones may need tables for installation metadata, issue and PR thread IDs, webhook delivery IDs, and synchronization cursors. Keep webhook deduplication keyed by GitHub delivery ID. Design uniqueness around GitHub object IDs plus repository and guild, so one GitHub item can map to a thread in each server. Do not store GitHub private content in public Discord channels without permission checks.

## Future milestones

1. Import existing issues and pull requests into forum posts and persist mappings.
2. Verify GitHub webhook signatures, deduplicate deliveries, and synchronize issue, PR, and activity updates.
3. Reconciliation, retries, operational diagnostics, and Docker deployment.

GitHub remains authoritative throughout. Discord edits must not write back to GitHub.
