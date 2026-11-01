# Development setup

## Requirements

- Node.js 22 or newer
- pnpm 11 (`corepack enable` can provide the package manager from `package.json`)
- A Discord application and bot added to a development server

Install the **bot user** in the development server with the `bot` and `applications.commands` OAuth scopes. An application installed only for commands can answer `/ping` while its bot user cannot access the server; `/project add` needs the bot present. Grant **View Channels** and **Manage Channels** for workspace creation. Restricted workspaces also require **Manage Roles** to set permission overwrites. For issue and PR import the bot also needs **Send Messages** (creates forum posts), **Send Messages in Threads**, **Embed Links**, and **Manage Threads** (rename threads and edit archived posts) in the forum channels. Workspace channels inherit server-level permissions, so grant these through the bot role. The client uses only the `Guilds` gateway intent; no privileged intent is required. A user needs **Manage Server** to invoke `/project` commands.

Create a GitHub App with repository **Metadata: Read-only**, **Issues: Read-only**, and **Pull requests: Read-only** access, install it on the intended account or organization, and grant it access to the repositories to register. Set the App ID, installation ID, and path to its private key in `.env`. The key remains outside Git. A GitHub repository may be private; the installation must have access to it. RepoStrat performs no GitHub writes and needs no webhook subscription. After adding the Issues and Pull requests permissions to an existing App, an owner must accept the updated permissions on the installation.

## Configuration

Copy `.env.example` to `.env` if `.env` does not exist. Keep the existing `.env` if one is already present. Fill in:

| Variable                  | Purpose                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `NODE_ENV`                | `development`, `test`, or `production`; default `development` |
| `HOST`                    | Health server bind address; default `127.0.0.1`               |
| `PORT`                    | Health server port; default `3000`                            |
| `LOG_LEVEL`               | Pino log level; default `info`                                |
| `DISCORD_TOKEN`           | Discord bot token; required                                   |
| `DISCORD_CLIENT_ID`       | Discord application ID; required                              |
| `DISCORD_GUILD_ID`        | Development server ID for command registration; required      |
| `DATABASE_URL`            | SQLite `file:` path; default `file:./data/repostrat.db`       |
| `GITHUB_APP_ID`           | GitHub App ID; needed for project commands                    |
| `GITHUB_INSTALLATION_ID`  | Installation ID with repository access; needed for projects   |
| `GITHUB_PRIVATE_KEY_PATH` | Path to the GitHub App private key; needed for projects       |
| `GITHUB_WEBHOOK_SECRET`   | Reserved for a later milestone; may be empty                  |
| `SYNC_BATCH_SIZE`         | Max posts created or edited per `/project sync`; default `50` |

Do not commit `.env`, private keys, or database files. The private key is read only when a project command uses GitHub. One installation ID is configured for this process; register repositories available to that installation. The same repository can be registered independently in multiple Discord guilds.

## Run

From the repository root:

```sh
pnpm install
pnpm db:migrate
pnpm commands:register
pnpm dev
```

Run `pnpm commands:register` again after changing command definitions. This updates commands only in `DISCORD_GUILD_ID`. To use commands in another server, set that server as `DISCORD_GUILD_ID` and run registration there too. Use `/ping` to check the bot, and request `/health` on the configured address and port. Stop with Ctrl+C; the process closes the HTTP server, Discord connection, and SQLite database.

`DISCORD_GUILD_ID` selects where development commands are registered. Project commands use the server ID from each interaction. If `/project add` says the bot cannot access the server, verify the bot user appears in that server's member list and reinstall it with the `bot` scope if needed. Command registration alone does not add the bot user.

To test registration, run `/project add Sinyedu/QueryPlan` in the development server. If the repository is private, choose an `audience` role containing you; RepoStrat denies `@everyone` access to its category and four channels. Then run `/project list` and `/project sync Sinyedu/QueryPlan`. Repeating `/project add` repairs missing channels and should not create duplicate workspaces.

## Importing issues and pull requests

`/project add` only creates the workspace, so a large repository is never imported by surprise. `/project sync owner/repository` is the explicit import:

1. It checks GitHub access, the audience role (private repositories), bot permissions, and the five workspace channels. If a channel or permission needs repair, nothing is imported; run `/project add` to repair it, then sync again.
2. It lists all issues and pull requests (100 per request, up to 5,000 of each) before writing anything to Discord.
3. It creates a forum post for each new item, edits the bot's starter message when GitHub content changed, and recreates a post whose thread was deleted. Unchanged posts are not touched. Thread discussion is never deleted, and closed items are not archived.
4. It replies with counts. If more than `SYNC_BATCH_SIZE` posts need writing, or errors occurred, the reply says **partially synchronized**; run `/project sync` again to continue. Finished items are skipped, so each run makes progress.

To test with `Sinyedu/QueryPlan`: register it, run `/project sync Sinyedu/QueryPlan`, open the `issues` and `pull-requests` forums, edit an issue on GitHub, and sync again to see that post update without duplicates.

### Limitations

- Sync is manual. Changes appear only after the next `/project sync`; webhooks come later.
- Items are imported oldest first (by creation), so with batching the newest arrive last.
- Reviewers are only those currently _requested_; completed reviews are not shown.
- A crash between creating a thread and saving its mapping can leave one unmapped duplicate thread. The next sync creates a mapped post; delete the stray thread manually.
- One sync per repository and server runs at a time (in-process lock); a second request is refused.
- An item deleted or transferred on GitHub keeps its Discord post.
- Descriptions are shortened to about 1,500 characters; HTML is stripped, images become text, link targets are shown, and mentions are defused.

### Troubleshooting

- _GitHub App access was denied_: grant **Issues** and **Pull requests** read access and accept the new permissions on the installation.
- _Repository not found_: the installation no longer includes the repository. Existing Discord posts are kept.
- _Rate limiting_: wait and run sync again. Nothing in Discord changes when listing fails.
- _Discord error 50013 or 50001_, or "stopped after repeated Discord errors": give the bot role the forum permissions above. After three consecutive failures the run stops and reports what remains.
- _"... need attention"_: a channel or permission mapping is missing; run `/project add` again.

For a production build, use `pnpm build` then `pnpm start:prod` from the repository root, with `drizzle/` available for migrations. Do not expose the health endpoint publicly without network controls.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm db:generate` creates a migration after schema changes. Review the generated SQL before applying it with `pnpm db:migrate`. The Milestone 2 migration adds registration fields to existing repository rows without discarding data; older rows stay pending until re-registered.
