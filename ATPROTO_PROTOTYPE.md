# Client core + AT Protocol prototype

Branch: `prototype/client-core-airspace`.

## Run it

```sh
vp install
vp run dev:core
# Or build a site that any static HTTP server can serve:
vp run build:core
python -m http.server 4179 --directory dist/core
```

Open `http://localhost:4179`. Choose **This browser** to create, edit, archive,
delete, drag and reorganize memories with no account, database, AI key or app
server. Capture still has an editable title/tags review, but no AI request or
"AI unavailable" message. Local storage is the durable source; Web Locks serialize
writes across tabs and storage events refresh other tabs. Use HTTPS or localhost
(Web Locks and UUID generation need a secure context). Clearing site data deletes
the browser pile. No import from the existing private board happens automatically.

The default `vp dev` / `vp build` still run the hosted application. After GitHub
sign-in, `/?storage=atproto` opens the same browser/PDS chooser with the current AI
enrichment function attached. `/` retains PostgreSQL. The hosted shell is SSR;
the Svelte Flow canvas mounts in the browser. AI needs a server for secrets, but
SSR itself is a deployment choice, not a requirement of enrichment.

## Private AT Protocol storage

Choose **Private AT Protocol space** and supply your own spaces-enabled PDS URL,
handle (or DID), and app password. Credentials go directly from the browser to
that PDS; the session is kept in memory, so reload requires reconnecting. This is
a self-hosting spike for your own account. Browser OAuth is the next step before
asking other people to authorize an app. The PDS must allow browser CORS requests.

Airspace 0.1.3 provides the AT Protocol client and lexicon helpers. The adapter:

- checks `workspace.supported()` and refuses unsupported PDSes;
- requires member-list read/write policies, ensuring the private space exists;
- reads/writes only `client.workspace.boards`, never the public collection;
- stores the board in the private `app.pileofmemories.prototype.workspace` space,
  as the `self` record of `app.pileofmemories.prototype.board`;
- validates snapshots and edits with the existing Zod schemas;
- saves one JSON snapshot per write, preserving fractional canvas coordinates and
  keeping multi-card layout changes in one record write.

The namespace is experimental. Replace it with a reverse-domain namespace you
own and publish the lexicons before treating this as an interoperable app schema.
The JSON payload is capped at 200 KB. A production schema should use per-card
records and space batches for layout changes.

**Private spaces are experimental and ordinary hosted PDSes, including
bsky.social, do not currently support them.** They are permissioned storage, not
end-to-end encryption. The PDS operator remains trusted. This prototype uploads no
blobs and has no publish action. Existing space members retain their permissions.

**Use one active editor across devices.** Airspace's private-space writes do not
support `ifMatch` conflict checks. Web Locks prevent overlap on the same origin
in one browser, but cannot protect edits across devices/hosts. Private records
also do not appear on the public firehose; use **Reload board** to refresh.

## The plugin boundary

`src/lib/board-backend.ts` defines the small storage contract used by `App.svelte`.
It has two actual implementations: existing PostgreSQL remote functions and a
snapshot backend used by browser storage and AT Protocol.

`EnrichmentPlugin` is a function passed through `App` to `CaptureDialog`. The core
imports no remote functions. The hosted route supplies `enrichMemory` from the
existing server implementation. No plugin registry, dynamic package loader, or
plugin permissions system is needed for this experiment. These are trusted,
build-time integrations.

`POM_PROFILE=core` chooses separate route/entry files and adapter-static, excluding
the hosted auth hook, server load, and required environment schema. The static
artifact is `dist/core`; Netlify's hosted artifact remains `build`.

The current enrichment implementation still uses PostgreSQL for GitHub sessions
and analytics in the hosted profile. Choosing AT Protocol replaces **memory card
storage**; it does not yet remove that hosted plugin's auth/analytics database.
To remove PostgreSQL entirely from an AI-enabled deployment, the next slice is
AT Protocol session verification on the enrichment endpoint and an optional
analytics sink. The static AT Protocol core already has no PostgreSQL dependency
at runtime. Installed server dependencies remain shared in this prototype repo.

## Verification

```sh
# Route/env types are generated for the selected profile. Restore hosted types
# before checking the whole repository (which includes the hosted server files).
vp run prepare
vp check
vp test
vp run svelte-check
vp build
vp run build:core
vp run prepare
```

Verified: 55 tests pass (3 database integration tests skipped), `vp check`,
Svelte checks, and both production builds pass. A browser test against the static
artifact confirmed capture, reload persistence, and capture while offline.

Tests cover CRUD, durable-write failure, atomic layout rejection, corrupt stored
data, private-space rejection and the snapshot size cap. AT Protocol adapter
tests stub the PDS boundary; a real spaces-enabled PDS/account is still required
for an end-to-end session/read/write test. No existing PostgreSQL data is migrated.

## Sources checked

- [Airspace private spaces](https://getair.space/docs/spaces)
- [Airspace reads, writes and conflict behavior](https://getair.space/docs/reading-and-writing)
- [Airspace OAuth](https://getair.space/docs/oauth)
- [Airspace source and prerelease PDS requirements](https://github.com/danielroe/airspace)
