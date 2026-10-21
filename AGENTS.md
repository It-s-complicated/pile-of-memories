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

To pass the auth check: with the agent browser open a browser that the user can access and log in to.
