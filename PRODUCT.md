# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single user: the owner. Pile of Memories is a personal tool, built by and for one person. It will never be public, and multi-user support is not a goal.

## Product Purpose

A private spatial memory board for capturing, clustering, and revisiting personal ideas and memories. Cards are captured description-first in Markdown and live on a spatial canvas instead of in lists. Success means the owner actually revisits and re-clusters the pile as meaning changes — the board stays alive rather than becoming an archive that is written to and never read.

## Positioning

Organization reflects card content through tags and topics. AI suggests metadata; a deterministic client-side layout groups related cards. The owner reviews layout changes and can currently drag cards in Arrange mode.

## Operating Context

- Single-user, private instance protected by Better Auth with GitHub; only the configured approved account can access the board, exports, and remote functions.
- Capture is description-first: the owner writes text, AI suggests title and tags (editable).
- Cards are read as Markdown and edited (title, text, tags, derived links) in one dialog.
- Runs on SvelteKit + Svelte Flow canvas, PostgreSQL on Supabase with `LISTEN/NOTIFY` live snapshots and a TanStack DB browser cache backed by SQLite.
- AI title suggestions run through TanStack AI → OpenCode Console (Zen), enabled by `OPENCODE_API_KEY`; TypeSafe suggests card kind and labels using `TYPESAFE_API_KEY` and the managed database vocabulary.

## Current Behavior and Constraints

- Memory cards are Svelte Flow nodes (`type === "memory"`) persisted in PostgreSQL; positions stored per card.
- Cluster grouping uses weighted tag/topic similarity and complete-link grouping; shared topics carry more weight than broad tags. See [GUIDED_MEMORY_PLACEMENT.md](GUIDED_MEMORY_PLACEMENT.md) for the accepted placement and layout behavior.
- Saving a new card opens the full-board reorganization preview. **Reorganize** opens the same preview manually; cancel restores the snapshot while retaining a newly saved card, and apply persists only changed positions.
- Placement is deterministic and client-side. Background cluster names are centered behind their largest matching group, as recorded in [DESIGN.md](DESIGN.md).
- Markdown is an important, near-term-binding format for card bodies.
- Selecting an exploration idea opens review and enriches tags/topics immediately while reusing its title and type. Source-card context clarifies generic idea wording; labels still describe the idea itself rather than being inherited automatically. Private analytics connect exploration operations, draft selection/cancellation, enrichment, and successful saves without retaining card or question text.
- **Explore** starts from an existing card. TypeSafe ranks a bounded set of related cards by usefulness, including other perspectives and counterpoints. The owner chooses up to eight source cards and an optional question; TanStack AI generates observations, new ideas, and follow-up questions with source references. Ideas can be reviewed and saved through normal capture, with source links in their Markdown. Exploration sessions are temporary; existing cards and positions change only through the normal editing and saving flows.
- Live updates stream complete snapshots after Postgres invalidations; the configured deployment adapter and hosting runtime must support persistent streams, unbuffered SSE, and `Cache-Control: no-store`. Writes require a connection; there is no offline write queue.
- Zod schemas with inferred types are preferred over hand-written validators.
- Changes stay small and app-shaped; Svelte Flow APIs are preferred over custom canvas code.

## Future Direction and Open Decisions

- Move placement primarily into the AI backend, with the owner steering organization through cluster preferences.
- Decide whether direct drag placement should remain available. It currently works in Arrange mode; resolve this decision before expanding manual-placement interactions.

## Brand Commitments

- The name is **"Pile of Memories"**.
- Private-by-default and self-directed: own database (Supabase Postgres), own API keys, no public deployment, no accounts beyond the owner.

## Evidence on Hand

- Working implementation: spatial canvas, memory nodes, tag editor, Markdown rendering, guided placement and cluster reorganization, AI title/tag enrichment, live Postgres-backed sync.
- Product docs: README.md, GUIDED_MEMORY_PLACEMENT.md, DATABASE_SCHEMA.md, migrations/0001_cards.sql.
- No testimonials, external users, metrics, or press exist; none may be fabricated.

## Product Principles

1. **Content guides organization; the owner steers.** Tags and topics drive layout, and the owner reviews the full-board preview. Backend-driven placement is a future direction; direct drag placement is provisional.
2. **Capture is cheap, revisiting is the point.** Description-first entry with AI-suggested metadata; the board must invite rearrangement and return visits.
3. **Personal, not a product.** One user, no growth features, no public surface — optimize for the owner's daily use, not for onboarding strangers.
4. **Markdown is the memory format.** Card bodies are authored and read as Markdown.
5. **Small and app-shaped.** Prefer Svelte Flow and Zod; no speculative abstractions.
