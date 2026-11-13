<!-- intent-skills:start -->

## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before editing files for a substantial task:

- Run `pnpm exec intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm exec intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

<!-- intent-skills:end -->

# AGENTS.md

## Project Direction

Pile of Memories is a personal spatial memory board.

The first product loop is intentionally small:

- create memory cards
- move cards around a canvas
- cluster ideas visually
- persist cards in PostgreSQL while the interaction model proves itself

## Tech

- Vite+ + SvelteKit 3 (pre-release) / Svelte 5
- Svelte Flow for the canvas
- PostgreSQL (Supabase or self-hosted)
- pnpm for package management

Memory cards are Svelte Flow nodes with `type === "memory"`.

## Constraints

- Keep changes small and app-shaped.
- Prefer Svelte Flow APIs over custom canvas code.
- Prefer Zod schemas with inferred types over hand-written runtime validators and type guards.

## Guidance Map

- When changing capture, placement, or reorganization, read [GUIDED_MEMORY_PLACEMENT.md](GUIDED_MEMORY_PLACEMENT.md).
- When changing visual design or background cluster labels, read [DESIGN.md](DESIGN.md).
- When changing persistence or schema, read [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) and [README.md — Browser cache](README.md#browser-cache).
- When running locally, configuring authentication, or deploying, read [README.md — Development](README.md#development), [Authentication](README.md#authentication), and [Deployment](README.md#deployment).
- When adding or changing a request to an external service (GitHub, OpenCode, TypeSafe), update its mock in `src/mocks`; read [README.md — Mock mode](README.md#mock-mode).
- For local access to the Coolify database, deployment, or moving the Supabase database, read [COOLIFY.md](COOLIFY.md).
- When deciding product scope, read [PRODUCT.md](PRODUCT.md), which separates current behavior from future direction.

## Agent Tools

- When creating, editing, or analyzing Svelte components or modules, use the `svelte:svelte-code-writer` and `svelte:svelte-core-bestpractices` skills for documentation lookup and validation.
- Discover tools by the specific capability needed; filter tool metadata by name or description and return only matching entries.
- Locate files and symbols with `rg --files` and `rg -n`, then read the relevant line ranges. Keep source and documentation reads in separate outputs; narrow any truncated read before retrying.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Auth for local development

Prefer mock mode when the task needs neither the real board nor real model output: run `vp run db:mock`, then `vp run dev:mock`, and "Continue with GitHub" signs in without an account.

To pass the auth check against the real services: with the agent browser open a browser that the user can access and log in to.

## Local access to the Coolify database

When the task needs the real database, follow [COOLIFY.md — Local development](COOLIFY.md#local-development-against-the-coolify-database).

- Use the existing ignored `.env`: both database URLs should point at `127.0.0.1:15432`, with `sslmode=disable`, `DATABASE_SSL=false`, and `DATABASE_SSH_HOST` identifying the SSH account/server. Keep credentials private.
- Ensure `psql` is installed before running migrations (`apt-get install postgresql-client` on Debian/Ubuntu).
- Run `vp run db:tunnel` in a separate terminal or managed background session before `vp run db:migrate` or `vp dev`. Reuse an existing tunnel if one is already listening on that port.
- The "listening" message confirms only the local listener. Verify that PostgreSQL can be reached before treating the tunnel as working.
- SSH host-key verification must remain enabled. If authentication fails, check which client key SSH offers and compare its fingerprint with the server's authorized keys. Each agent machine needs its own public key authorized with the database-only forced command documented in `COOLIFY.md`; the Coolify server's private key must stay on that server.
- Keep the tunnel running while local database commands or the local app need it. Stop a tunnel you started when that work is finished; leave a pre-existing tunnel under its owner's control. Restart with `vp run db:tunnel` when needed again.
- The deployed app and Coolify MCP connect independently of this tunnel. MCP access does not make local PostgreSQL connections work automatically.
- Local writes and migrations affect the deployed board. Run destructive database integration tests only against a disposable database.
