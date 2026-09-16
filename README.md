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
written from the browser with an app-password session. OAuth credentials live in encrypted HttpOnly cookies. Sign in through
AT Protocol OAuth (gating AI enrichment), then connect the board to your PDS.

The guided creation and placement idea is captured in [GUIDED_MEMORY_PLACEMENT.md](GUIDED_MEMORY_PLACEMENT.md).
Board storage requirements and limitations are described in [ATPROTO_PROTOTYPE.md](ATPROTO_PROTOTYPE.md).

## Development

```sh
vp install
vp dev
```

Set `APPROVED_ATPROTO_DID`, `AUTH_SECRET`, and `AUTH_ORIGIN` in `.env`. Set
`OPENCODE_GO_API_KEY` to enable DeepSeek V4 Flash title and tag suggestions through OpenCode Go.

Run `vp run dev:core` for a standalone browser board without the hosted auth shell; `vp run
build:core` produces static files in `dist/core`.

## Authentication

The board signs in through AT Protocol (Bluesky) and admits one account. Configure `AUTH_SECRET`
and the approved account's DID in `APPROVED_ATPROTO_DID`. Set `AUTH_ORIGIN` to the canonical HTTPS
origin, without a trailing slash. Requests to auth endpoints through alternate origins are rejected.
Sign-in redirects to the account's own PDS; the callback uses the configured origin:

```text
<origin>/auth/callback
```

The OAuth client metadata is served at `<origin>/oauth-client-metadata.json`, which the PDS
fetches during authorization. OAuth sessions (DPoP-bound, keyed by DID) and callback state use
encrypted, authenticated HttpOnly cookies, with a separate OAuth client for each request.
Callback state expires after 10 minutes; sessions expire after 30 days. Both expiries are checked
server-side. Cookies use SameSite=Lax and Secure on HTTPS; AUTH_SECRET encrypts their contents.
Sign-out revokes the OAuth token and clears this browser's cookies. Without server-side storage,
a previously copied cookie can still authenticate to this app until expiry (or AUTH_SECRET rotation).
Only one sign-in can be pending per browser. Each encrypted cookie is limited to 3,800 characters;
larger OAuth payloads fail sign-in rather than silently producing an unusable session.
The OAuth grant is identity-only (`atproto`
scope); board data never flows through the app server.

No hosted session store is required. For local OAuth testing, use `vp dev` with
`AUTH_ORIGIN=http://127.0.0.1:5173`. Existing cookies from the previous storage format require signing in again.

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

Netlify Deploy Previews and branch deploys automatically use `DEPLOY_PRIME_URL` for OAuth,
overriding any inherited production `AUTH_ORIGIN`. SvelteKit captures `CONTEXT` and
`DEPLOY_PRIME_URL` at build time, so function runtime variables are not required for these values.
Production keeps the configured `AUTH_ORIGIN`; local development keeps the localhost default.
Cookies are bound to the selected origin, so preview cookies cannot authenticate to production.
The preview context still needs `AUTH_SECRET` and `APPROVED_ATPROTO_DID` available to Functions.
The preview's OAuth metadata endpoint must be publicly accessible to the PDS (not behind Netlify
deploy protection). Use the primary preview URL, not an individual deploy permalink.

The web app manifest supports home-screen installation and a **New memory** shortcut at
`/?action=new-memory`. The + button uses the same URL with shallow navigation; browser Back closes
capture and Forward reopens it. Direct launches return to the board on Back. Reloading or closing
capture discards its unsaved draft.

Install the deployed HTTPS site from the browser's install/add-to-home-screen menu. There is no
service worker or offline app shell; opening the app, connecting to your PDS, and saving memories
require a connection.
