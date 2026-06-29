# AGENTS.md

## Project Direction

Pile of Memories II is a personal spatial memory garden.

The first product loop is intentionally small:

- create memory cards
- move cards around a canvas
- connect and cluster ideas visually
- persist locally while the interaction model proves itself

## Tech

- Vite + React
- Excalidraw for the canvas
- pnpm for package management

Memory cards are Excalidraw rectangles with bound text and `customData.type === "memory-card"`.

## Constraints

- Keep changes small and app-shaped.
- Prefer Excalidraw APIs over custom canvas code.
- Keep the React 19 Radix override in `pnpm-workspace.yaml` unless `pnpm peers check` stays clean without it.

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
