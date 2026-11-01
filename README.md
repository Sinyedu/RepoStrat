# RepoStrat

RepoStrat is an open-source, self-hosted Discord bot for organizing GitHub repositories into Discord project workspaces. GitHub remains the source of truth. The intended `/project add owner/repository` flow will eventually create one Discord category per repository, with `overview`, `issues`, `pull-requests`, and `activity` channels.

Milestone 1 provides the application foundation: a Discord client, guild-scoped development commands, a Fastify health endpoint, SQLite migrations, configuration validation, and graceful shutdown. `/project add`, `/project list`, and `/project sync` are permission-protected placeholders and do not access GitHub or change Discord channels.

## Quick start

Use Node.js 22+ and pnpm 11. See [setup](docs/SETUP.md) for Discord application and environment configuration.

```sh
pnpm install
pnpm db:migrate
pnpm commands:register
pnpm dev
```

`GET http://127.0.0.1:3000/health` returns `{"status":"ok"}` by default. `/ping` replies `Pong!` in the configured development guild. Project commands require Manage Server permission.

## Development

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The shared engineering contract is [AGENTS.md](AGENTS.md). Architecture and planned milestones are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Contributions are welcome under the MIT license.
