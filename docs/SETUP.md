# Development setup

## Requirements

- Node.js 22 or newer
- pnpm 11 (`corepack enable` can provide the package manager from `package.json`)
- A Discord application and bot added to a development server

The bot needs the `bot` and `applications.commands` OAuth scopes. Grant **View Channels** and **Manage Channels** for workspace creation. Restricted workspaces also require **Manage Roles** to set permission overwrites. Keep **Send Messages** if the bot will post in text channels in a later milestone. The client uses only the `Guilds` gateway intent; no privileged intent is required. A user needs **Manage Server** to invoke `/project` commands.

Create a GitHub App with repository **Metadata: Read-only** access, install it on the intended account or organization, and grant it access to the repositories to register. Set the App ID, installation ID, and path to its private key in `.env`. The key remains outside Git. A GitHub repository may be private; the installation must have access to it. This milestone performs no GitHub writes and needs no webhook subscription.

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

To test registration, run `/project add Sinyedu/QueryPlan` in the development server. If the repository is private, choose an `audience` role containing you; RepoStrat denies `@everyone` access to its category and four channels. Then run `/project list` and `/project sync Sinyedu/QueryPlan`. Repeating `/project add` repairs missing channels and should not create duplicate workspaces. `/project sync` only reports mapping or access problems; it does not synchronize issue or PR posts.

For a production build, use `pnpm build` then `pnpm start:prod` from the repository root, with `drizzle/` available for migrations. Do not expose the health endpoint publicly without network controls.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm db:generate` creates a migration after schema changes. Review the generated SQL before applying it with `pnpm db:migrate`. The Milestone 2 migration adds registration fields to existing repository rows without discarding data; older rows stay pending until re-registered.
