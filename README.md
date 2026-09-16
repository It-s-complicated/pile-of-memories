# Pile of Memories

A private spatial memory board for capturing, clustering, and revisiting ideas.

Core loop:

- capture rough memories and ideas quickly
- place them spatially instead of burying them in lists
- rearrange and cluster items as their meaning changes
- enrich description-first capture with editable AI title and tag suggestions
- read Markdown cards and edit their title, text, tags, and derived links in one dialog

Memory cards are Svelte Flow nodes. The board is one whole-snapshot record of memories, tags, and
topics stored in your own AT Protocol account: a private Airspace space on a spaces-enabled PDS,
written from the browser with an app-password session. There is no server database. Sign in through
AT Protocol OAuth (gating AI enrichment), then connect the board to your PDS.

The guided creation and placement idea is captured in [GUIDED_MEMORY_PLACEMENT.md](GUIDED_MEMORY_PLACEMENT.md).
Board storage requirements and limitations are described in [ATPROTO_PROTOTYPE.md](ATPROTO_PROTOTYPE.md).

## Development

```sh
vp install
vp dev
```

Set `APP_URL`, `APPROVED_ATPROTO_DID`, and `AUTH_SECRET` in `.env`. Set
`OPENCODE_GO_API_KEY` to enable DeepSeek V4 Flash title and tag suggestions through OpenCode Go.

Run `vp run dev:core` for a standalone browser board without the hosted auth shell; `vp run
build:core` produces static files in `dist/core`.

## Authentication

The board signs in through AT Protocol (Bluesky) and admits one account. Configure `APP_URL` (the
public origin), `AUTH_SECRET`, and the approved account's DID in `APPROVED_ATPROTO_DID`. Sign-in
redirects to the account's own PDS; the callback is:

```text
<APP_URL>/auth/callback
```

The OAuth client metadata is served at `<APP_URL>/oauth-client-metadata.json`, which the PDS
fetches during authorization. OAuth sessions (DPoP-bound, keyed by DID) are kept in server memory
and require signing in again after a server restart. The OAuth grant is identity-only (`atproto`
scope); board data never flows through the app server.

The enrichment remote function requires the approved session. Card storage is authorized by your
PDS credentials instead.

## Board storage

The board is one JSON snapshot (memories, positions, tags, and topics) written as the `self` record of
`app.pileofmemories.prototype.board` inside the private
`app.pileofmemories.prototype.workspace` space of your own PDS. The browser holds an
app-password session in memory; reloading the page requires reconnecting. PDS requirements,
the snapshot size cap, and the one-editor-at-a-time limitation are in
[ATPROTO_PROTOTYPE.md](ATPROTO_PROTOTYPE.md). Use **Reload board** to pull changes saved from
another device.

Use **Export** to download a versioned JSON backup. **Import** accepts that same format, validates
the full snapshot, and replaces the current board after confirmation. New tags and topics can be
created directly in the memory editor and remain in the stored vocabulary even when unused.

## Deployment

The web app manifest supports home-screen installation and a **New memory** shortcut at
`/?action=new-memory`. The + button uses the same URL with shallow navigation; browser Back closes
capture and Forward reopens it. Direct launches return to the board on Back. Reloading or closing
capture discards its unsaved draft.

Install the deployed HTTPS site from the browser's install/add-to-home-screen menu. There is no
service worker or offline app shell; opening the app, connecting to your PDS, and saving memories
require a connection.
