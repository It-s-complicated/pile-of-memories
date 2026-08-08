# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single user: the owner. Pile of Memories is a personal tool, built by and for one person. It will never be public, and multi-user support is not a goal.

## Product Purpose

A private spatial memory board for capturing, clustering, and revisiting personal ideas and memories. Cards are captured description-first in Markdown and live on a spatial canvas instead of in lists. Success means the owner actually revisits and re-clusters the pile as meaning changes — the board stays alive rather than becoming an archive that is written to and never read.

## Positioning

The mechanism the product is organized around is **AI-guided placement**: the backend decides where memories land and how they cluster, so the board's organization reflects the content rather than manual filing. The owner steers placement indirectly (e.g. by dialing cluster preferences) rather than dragging every card into place.

**Open decision:** whether manual (drag) placement is allowed at all. Currently possible on the canvas, but under active doubt. Future design work must not deepen the manual-placement interaction model without resolving this first.

Note: the README's "place them spatially instead of burying them in lists" framing is lingering marketing language, not a confirmed product claim.

## Operating Context

- Single-user, private instance; database access is development-only until authentication is implemented, and even then it stays a one-person app.
- Capture is description-first: the owner writes text, AI suggests title and tags (editable).
- Cards are read as Markdown and edited (title, text, tags, derived links) in one dialog.
- Runs on SvelteKit + Svelte Flow canvas, PostgreSQL on Supabase with `LISTEN/NOTIFY` live snapshots.
- AI enrichment runs through TanStack AI → OpenCode Go (DeepSeek V4 Flash), enabled by `OPENCODE_GO_API_KEY`.

## Capabilities and Constraints

- Memory cards are Svelte Flow nodes (`type === "memory"`) persisted in PostgreSQL; positions stored per card.
- Cluster model: memories sharing the same normalized, sorted union of areas and topics form a cluster; new memories join exact clusters at the nearest collision-free position, novel combinations are placed by Jaccard similarity; spacing targets range from 24px inside exact clusters to 180px between unrelated cluster bounds.
- **Reorganize clusters** is the only group-move operation: deterministic two-dimensional proximity preview, cancel restores the snapshot, apply persists only changed positions.
- Placement is currently client-side (see GUIDED_MEMORY_PLACEMENT.md); the stated direction is to move placement primarily into the AI backend.
- Markdown is an important, near-term-binding format for card bodies.
- Live updates stream complete snapshots after Postgres invalidations; deployment requires the Node adapter, persistent runtime, unbuffered SSE, `Cache-Control: no-store`.
- Zod schemas with inferred types are preferred over hand-written validators.
- Changes stay small and app-shaped; Svelte Flow APIs are preferred over custom canvas code.

## Brand Commitments

- The name is **"Pile of Memories"**.
- Private-by-default and self-directed: own database (Supabase Postgres), own API keys, no public deployment, no accounts beyond the owner.

## Evidence on Hand

- Working implementation: spatial canvas, memory nodes, tag editor, Markdown rendering, guided placement and cluster reorganization, AI title/tag enrichment, live Postgres-backed sync.
- Product docs: README.md, GUIDED_MEMORY_PLACEMENT.md, DATABASE_SCHEMA.md, migrations/0001_cards.sql.
- No testimonials, external users, metrics, or press exist; none may be fabricated.

## Product Principles

1. **The backend organizes; the owner steers.** Placement is AI-guided by default; manual control is indirect (cluster preferences), and direct drag placement is provisional.
2. **Capture is cheap, revisiting is the point.** Description-first entry with AI-suggested metadata; the board must invite rearrangement and return visits.
3. **Personal, not a product.** One user, no growth features, no public surface — optimize for the owner's daily use, not for onboarding strangers.
4. **Markdown is the memory format.** Card bodies are authored and read as Markdown.
5. **Small and app-shaped.** Prefer Svelte Flow and Zod; no speculative abstractions.
