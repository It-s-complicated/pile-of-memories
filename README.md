# Pile of Memories

A private spatial memory board for capturing, clustering, and revisiting ideas.

Core loop:

- capture rough memories and ideas quickly
- place them spatially instead of burying them in lists
- rearrange and cluster items as their meaning changes
- enrich description-first capture with editable AI title, card type, and tag suggestions
- read Markdown cards and edit their title, text, tags, and derived links in one dialog

Memory cards are Svelte Flow nodes persisted in PostgreSQL. TanStack DB keeps a reactive client
collection backed by SQLite in the browser's origin-private file system (OPFS). SvelteKit
`query.live` streams complete, authoritative snapshots after PostgreSQL `LISTEN/NOTIFY` invalidations.

The guided creation and placement idea is captured in [GUIDED_MEMORY_PLACEMENT.md](GUIDED_MEMORY_PLACEMENT.md).
The database schema is described in [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

New cards are classified as **Memory** (a personal recollection), **Idea** (something to try or
create), or **Note** (reference information, reminders, or tasks). TypeSafe selects the type in
the same request as tag suggestions. Review or change it before saving, or later in the editor.
Canvas labels and icons distinguish the types; clustering still uses tags and topics. If enrichment
is unavailable, capture defaults to an editable Note. Existing cards remain Memories.

## Export

Open **Board tools** below the board title and choose **Export memories** to download a versioned JSON file of all
saved memories, including archived ones, Markdown bodies, IDs, canvas positions, timestamps,
links, and assigned tags/topics. The file also includes the complete managed tag and topic
vocabularies, even when the board is filtered.
The version-2 export also includes managed label IDs, types, and enrichment descriptions, including unused labels.
The download reads PostgreSQL and requires the approved session and a working connection.
Save edits and apply layout previews before exporting.

Browser preferences (viewport, browse/arrange mode, and list settings), unsaved drafts,
AI enrichment analytics, and authentication records are not included. This is a data export;
there is no import/restore flow yet.

## Development

```sh
vp install
DATABASE_CONNECTION_STRING='postgresql://…' vp run db:migrate
vp dev
```

Set `DATABASE_CONNECTION_STRING` in `.env`. If it uses transaction pooling, set
`DATABASE_LISTEN_CONNECTION_STRING` to a session-mode URL for live updates. Set `DATABASE_SSL=false`
when a local PostgreSQL server does not serve TLS. Set `OPENCODE_API_KEY` to an OpenCode Console
(Zen) service-account key for pay-as-you-go title suggestions, and set `TYPESAFE_API_KEY` for card
classification and label suggestions through TypeSafe.
Title generation uses the Responses API at `https://opencode.ai/inference/openai/v1/responses`.
When migrating from Go, set the new key locally and in the deployment environment, then restart or
redeploy; `OPENCODE_GO_API_KEY` is no longer used.

Svelte Inspector is enabled during `vp dev`. Hold **Alt+X** and hover over an element to see its
source location; click to open it in your editor, or right-click for the component stack. The
inspector is excluded from production builds.

## Tags and topics

Choose **Tags & topics** in **Board tools** to create, edit, or delete labels. **Tags** are broad areas;
**topics** are specific subjects. Both have an editable enrichment description explaining what
belongs and what does not. Descriptions are optional; without one, AI uses the label's name.
AI reads the current database vocabulary on the server and suggests up to five tags/topics total.

Capture and card editing have separate tag and topic selectors. New labels are created in the
manager, not implicitly by typing into a card. Names are unique across both types, ignoring case.
Renaming or changing a label's type updates assignments on all cards, including archived cards.
Deleting a label requires confirmation and removes only its assignments, never the cards.

Run `vp run db:migrate` before deploying this feature. Migration 0006 seeds the existing defaults
and preserves custom labels already assigned to cards; rerunning it does not overwrite edited
definitions or resurrect deleted defaults. Label changes refresh both labels and card snapshots
through the existing PostgreSQL notification stream.

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

Live queries require the Node adapter and a persistent runtime: each open tab holds an unbuffered
`text/event-stream` response and a dedicated Postgres.js listener. SvelteKit sets
`Cache-Control: no-store`, sends a keep-alive comment every 30 seconds, and owns client connection
sharing and stream cancellation. The client restarts a stream that ended cleanly, such as one cut by
a server restart.

### Self-hosting

`vp build` writes a standalone Node server to `build/`. Run it with `node build` (or
`vp run start`). `PORT` defaults to 3000, `BETTER_AUTH_URL` must match the public origin, and the
GitHub OAuth callback stays `<BETTER_AUTH_URL>/api/auth/callback/github`.

The included `Dockerfile` builds without production secrets and installs `psql` for migrations.
On Coolify, use the app-only `compose.coolify.yaml` to map Coolify's generated service URL and
secrets to the application's environment variables. PostgreSQL stays a separate Coolify resource.
Provision the remaining configuration at **runtime only**; when migrating, seed the generated secret
slots with the existing auth and analytics keys. Direct Dockerfile deployment is also supported
using the variables in `.env.example` (`DATABASE_SSL` is optional and defaults to `true`). Point both
`DATABASE_CONNECTION_STRING` and `DATABASE_LISTEN_CONNECTION_STRING` at the direct (session-mode)
database URL. Set `DATABASE_SSL=false` when the database does not serve TLS, as on Coolify's private
network.

The image includes a Node-based health check; curl/wget are not installed. Behind the trusted Coolify
proxy, set `PROTOCOL_HEADER=x-forwarded-proto` and preserve the public Host header.

See [COOLIFY.md](COOLIFY.md) for the deployment checklist, release-image migration command, and
**Supabase → Coolify PostgreSQL migration** with a write freeze, data verification, and rollback.
Move hosting first while keeping Supabase, then move the database separately. Backups are yours
to arrange; a self-hosted Postgres has no point-in-time recovery unless you build it.

Run the database integration check **only against a disposable test database**. It truncates cards
and changes labels; never point it at production or the migrated board:

```sh
DATABASE_INTEGRATION_TEST=1 \
DATABASE_SSL=false \
DATABASE_CONNECTION_STRING='postgresql://…/memories_test' \
DATABASE_LISTEN_CONNECTION_STRING='postgresql://…/memories_test' \
vp test src/lib/server/database.integration.test.ts
```
