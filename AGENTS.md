# RepoStrat engineering contract

This file applies to Codex, Claude Code, and future coding agents. Read it with `README.md` and `docs/ARCHITECTURE.md` before changing the application. The user's current task and constraints take precedence.

## Product and scope

- RepoStrat is one self-hosted Node.js application, not a monorepo. GitHub is the source of truth.
- Discord uses one category per repository. It cannot nest categories.
- Milestone 1 contains only the foundation. Do not implement GitHub synchronization, webhooks, channel creation, or imports until a later milestone is approved.
- Keep code small and direct. Prefer TypeScript files under 150 lines when practical.

## Engineering rules

- Use Node.js 22+, pnpm, strict TypeScript, discord.js, Fastify, Drizzle with SQLite, and Vitest.
- Keep domain behavior out of the process entry point. Separate command definitions, command handling, configuration, HTTP, and database code.
- Add a Drizzle migration when changing schema; never edit an already applied migration. Preserve existing data.
- Store Discord snowflakes and stable GitHub repository IDs as text. Never convert snowflakes to JavaScript numbers.
- Use parameterized ORM queries or bound SQLite parameters. Validate external input at the boundary.
- Keep Discord project management commands restricted at both registration and runtime. Use only necessary gateway intents and bot permissions.
- Never print, commit, or overwrite credentials, `.env`, or private keys. GitHub configuration is optional until its integration is implemented.
- Do not execute repository code or add GitHub write operations.
- Do not create commits or push unless the user asks.

## Checks and handoff

Run `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm db:migrate`, and `pnpm build` for foundation changes. For future changes, run checks relevant to the change. Report what passed and any live integration that could not be verified. Update the README and docs when behavior or setup changes.
