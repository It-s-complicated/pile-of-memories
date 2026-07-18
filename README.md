# Pile of Memories II

A private spatial memory board for capturing, clustering, and revisiting ideas.

Memory cards are Svelte Flow nodes backed by PostgreSQL. SvelteKit `query.live` streams complete,
authoritative card snapshots after PostgreSQL `LISTEN/NOTIFY` invalidations. Notifications contain no
card data. A small client overlay keeps local edits, deletes, and grouped moves immediate until a
snapshot confirms them.

The guided creation and placement idea is captured in [GUIDED_MEMORY_PLACEMENT.md](GUIDED_MEMORY_PLACEMENT.md).
The database schema is described in [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

## Development

```sh
vp install
DATABASE_CONNECTION_STRING='postgresql://…' vp run db:migrate
vp dev
```

Set `DATABASE_CONNECTION_STRING` in `.env` to a PostgreSQL URL for the app, and export the same value
when running the migration. It must be session-capable unless `DATABASE_LISTEN_CONNECTION_STRING`
supplies a separate session-mode URL for the one long-lived listener connection per application
process. The migration command requires `psql` and must run before application traffic.

Set `OPENCODE_GO_API_KEY` to enable DeepSeek V4 Flash title and tag suggestions through OpenCode Go.
Database access remains development-only until authentication is implemented.

## Live-query deployment

The explicit `@sveltejs/adapter-node` adapter requires a persistent Node runtime. The host and any
proxy must support long-lived, unbuffered SSE responses, preserve `Cache-Control: no-store`, and not
cache live-query responses in a service worker.

Completed local verification uses a disposable TLS PostgreSQL instance. In the development server,
two independent browser contexts received cross-client create, edit, archive, and restore updates
without reload; PostgreSQL showed one shared process listener while both or either context remained
and no listener after both closed. The integration suite covers commit/rollback notifications, atomic
position batches, forced listener reconnection, zero-subscriber cleanup, and the full snapshot stream
through create, update, archive, restore, delete, grouped movement, and cancellation:

```sh
DATABASE_INTEGRATION_TEST=1 \
DATABASE_CONNECTION_STRING='postgresql://…' \
DATABASE_LISTEN_CONNECTION_STRING='postgresql://…' \
vp test src/lib/server/database.integration.test.ts
```

The local Node-adapter build returned the expected unbuffered SSE headers, but production-mode
authentication intentionally returned `503`, so end-to-end Node-adapter behavior was not locally
verified. Hosted staging must still verify buffering and `no-store` preservation, request/idle
timeouts, passive reconnect, connection sharing, convergence after grouped movement, rollback after a
failed mutation, and unused-stream cleanup against a session-capable production listener URL.

Card invalidations are coalesced for 50 ms before re-reading the full ordered snapshot. Successful
optimistic mutations wait up to 5 seconds for a matching `updatedAt` (or a missing deleted ID); an
unconfirmed mutation drops its overlay and requests one live-query reconnect. Snapshots represent
current authoritative state, not event history. Keep the Stage 1 collection and its TanStack DB
packages until hosted staging accepts Stage 2, then remove them in the final cleanup commit.
