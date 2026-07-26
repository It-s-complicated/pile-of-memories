# Pile of Memories

A private spatial memory board for capturing, clustering, and revisiting ideas.

Core loop:

- capture rough memories and ideas quickly
- place them spatially instead of burying them in lists
- rearrange and cluster items as their meaning changes
- enrich description-first capture with editable AI title and tag suggestions
- read Markdown cards and edit their title, text, tags, and derived links in one dialog

Memory cards are Svelte Flow nodes persisted in PostgreSQL. SvelteKit `query.live` streams complete,
authoritative snapshots after PostgreSQL `LISTEN/NOTIFY` invalidations. TanStack remains only for AI
enrichment.

The guided creation and placement idea is captured in [GUIDED_MEMORY_PLACEMENT.md](GUIDED_MEMORY_PLACEMENT.md).
The database schema is described in [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

## Development

```sh
vp install
DATABASE_CONNECTION_STRING='postgresql://…' vp run db:migrate
vp dev
```

Set `DATABASE_CONNECTION_STRING` in `.env`. If it uses transaction pooling, set
`DATABASE_LISTEN_CONNECTION_STRING` to a session-mode URL for live updates. Set
`OPENCODE_GO_API_KEY` to enable DeepSeek V4 Flash title and tag suggestions through OpenCode Go.
Database access remains development-only until authentication is implemented.

## Deployment

Live queries require the configured Node adapter, a persistent runtime, unbuffered SSE, and responses
with `Cache-Control: no-store`. Each active card stream uses Postgres.js's automatically reconnecting
dedicated listener; SvelteKit owns client connection sharing, reconnects, and stream cancellation.

Run the database integration check with:

```sh
DATABASE_INTEGRATION_TEST=1 \
DATABASE_CONNECTION_STRING='postgresql://…' \
DATABASE_LISTEN_CONNECTION_STRING='postgresql://…' \
vp test src/lib/server/database.integration.test.ts
```
