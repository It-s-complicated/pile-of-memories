# Pile of Memories

A private spatial memory board for capturing, clustering, and revisiting ideas.

Core loop:

- capture rough memories and ideas quickly
- place them spatially instead of burying them in lists
- rearrange and cluster items as their meaning changes
- enrich description-first capture with editable AI title and tag suggestions
- read Markdown cards and edit their title, text, tags, and derived links in one dialog

Memory cards are Svelte Flow nodes persisted in PostgreSQL. TanStack DB keeps a reactive client
collection backed by SQLite in the browser's origin-private file system (OPFS). SvelteKit
`query.live` streams complete, authoritative snapshots after PostgreSQL `LISTEN/NOTIFY` invalidations.

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

## Authentication

The board uses Better Auth with GitHub and admits one account. Configure `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and the approved account's stable
numeric GitHub ID in `APPROVED_GITHUB_PROVIDER_ID`. The GitHub OAuth callback is:

```text
<BETTER_AUTH_URL>/api/auth/callback/github
```

Every card and enrichment remote function requires the approved session. The board itself remains a
single shared dataset without ownership columns.

The page reuses the server-validated user instead of making another client session request. Browser
caches are scoped by user and only opened after authentication. Signing out clears cached card rows
and closes the board in other open tabs. Cached cards are private data stored on this device.

## Browser cache

On repeat visits, cached cards and the saved viewport appear while the server snapshot loads. The
server reads the first snapshot before opening its PostgreSQL listener, then reads again after
subscribing to cover changes in between. Server snapshots reconcile edits and deletions into the
local collection; successful write responses also update it immediately.

Writes always require a connection and validated server access. There is no offline write queue.
Dragging and layout previews stay in Svelte Flow until saved; failed moves revert to confirmed cards.
If OPFS is unavailable, the app uses an in-memory collection and reports that caching is unavailable.
Multiple tabs coordinate SQLite access through TanStack's browser coordinator.

SQLite runs in a bundled worker with WASM; HTTPS (or localhost) is required. The unused PowerSync
extension download in `@journeyapps/wa-sqlite`'s install script is deliberately disabled. Bump
`schemaVersion` in `src/lib/card-collection.ts` when the cached card shape changes to reset and
refresh the local replica. Browser storage can be evicted; PostgreSQL remains the source of truth.

## Deployment

The web app manifest supports home-screen installation and a **New memory** shortcut at
`/?action=new-memory`. The + button uses the same URL with shallow navigation; browser Back closes
capture and Forward reopens it. Direct launches return to the board on Back, and GitHub sign-in
preserves the capture URL. Reloading or closing capture discards its unsaved draft.

Install the deployed HTTPS site from the browser's install/add-to-home-screen menu. Manifest
shortcuts depend on the platform (supported on Android, not as custom long-press actions on iOS).
An iOS Shortcut can open the capture URL instead. There is no service worker or offline app shell;
opening the app, authenticating, and saving memories still require a connection. The SQLite cache
speeds up card loading after authentication.

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
