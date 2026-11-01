# RepoStrat

RepoStrat is an open-source, self-hosted Discord bot for organizing GitHub repositories into Discord project workspaces. GitHub remains the source of truth. `/project add owner/repository` creates one Discord category per repository, with `overview` and `activity` text channels plus `issues` and `pull-requests` forum channels.

Milestone 2 adds read-only GitHub App validation and persistent project registration. `/project list` shows registered projects in the current server, and `/project sync owner/repository` checks GitHub access and Discord channel mappings. These commands require **Manage Server** and reply privately. Private or internal repositories also require an explicit `audience` role on `/project add`; members outside that role cannot see their details in `/project list`.

## Quick start

Use Node.js 22+ and pnpm 11. See [setup](docs/SETUP.md) for Discord application and environment configuration.

```sh
pnpm install
pnpm db:migrate
pnpm commands:register
pnpm dev
```

`GET http://127.0.0.1:3000/health` returns `{"status":"ok"}` by default. `/ping` replies `Pong!` in the configured development guild. GitHub App credentials are needed only for project registration and validation, so the bot can still start without them.

## Development

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The shared engineering contract is [AGENTS.md](AGENTS.md). Architecture and planned milestones are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Contributions are welcome under the MIT license.
