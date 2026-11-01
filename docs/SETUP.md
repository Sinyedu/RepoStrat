# Development setup

## Requirements

- Node.js 22 or newer
- pnpm 11 (`corepack enable` can provide the package manager from `package.json`)
- A Discord application and bot added to a development server

The bot needs the `bot` and `applications.commands` OAuth scopes. For Milestone 1, request only **View Channels** and **Send Messages** for the bot. The client uses only the `Guilds` gateway intent; no privileged intent is required. A user needs **Manage Server** to invoke `/project` commands. Future channel creation will require additional permissions and should be documented when implemented.

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
| `GITHUB_APP_ID`           | Reserved for a future milestone; optional                     |
| `GITHUB_INSTALLATION_ID`  | Reserved for a future milestone; optional                     |
| `GITHUB_PRIVATE_KEY_PATH` | Reserved for a future milestone; optional                     |
| `GITHUB_WEBHOOK_SECRET`   | Reserved for a future milestone; may be empty                 |

Do not commit `.env`, private keys, or database files. The current application does not read the private key or contact GitHub.

## Run

From the repository root:

```sh
pnpm install
pnpm db:migrate
pnpm commands:register
pnpm dev
```

Run `pnpm commands:register` again after changing command definitions. This updates commands only in `DISCORD_GUILD_ID`. Use `/ping` to check the bot, and request `/health` on the configured address and port. Stop with Ctrl+C; the process closes the HTTP server, Discord connection, and SQLite database.

For a production build, use `pnpm build` then `pnpm start:prod` from the repository root, with `drizzle/` available for migrations. Do not expose the health endpoint publicly without network controls.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm db:generate` creates a migration after schema changes. Review the generated SQL before applying it with `pnpm db:migrate`. Project commands are placeholders in Milestone 1 and return an ephemeral message without changing state.
