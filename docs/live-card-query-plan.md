# Live Card Query Migration Plan

## Status

Stage 1 of the data-access migration is complete and stable. This document covers Stage 2.

This plan replaces the TanStack DB card collection with SvelteKit `query.live`, PostgreSQL change notifications, and a deliberately small local optimistic overlay.

## Objective

Make the board genuinely live across tabs and clients:

- the server emits an authoritative card snapshot after committed card changes
- active clients share and automatically reconnect their SvelteKit live-query connection
- Svelte Flow remains immediately responsive during local interactions
- failed mutations revert local optimistic state
- TanStack DB and TanStack Query are removed from card data flow

`query.live` is the streaming transport, not the database change detector. PostgreSQL must provide the signal that causes the async generator to yield again.

## SvelteKit Live-Query Contract

Treat the [official SvelteKit `query.live` documentation](https://svelte.dev/docs/kit/remote-functions#query-live) as the contract. Do not reproduce or depend on undocumented details of the currently installed runtime.

The plan relies on these documented behaviors:

- a `query.live` callback returns an `AsyncIterable`, typically from an async generator
- a client connection remains open while the query is actively used by a component
- identical live-query instances share one connection
- when no active uses remain, SvelteKit disconnects the stream and stops server-side iteration
- dropped connections reconnect passively with exponential backoff and actively when the browser comes back online
- live queries expose the ordinary query state (`current`, `loading`, and `error`) plus `connected` and `reconnect()`
- live queries have no `refresh()` method because they update themselves
- imperative consumers may iterate the resource directly, with only the latest pending value retained for a slow consumer

The application should verify these observable behaviors in staging, but should not add a parallel connection manager, cache, or retry state machine around them.

## Remaining Preconditions

Do not implement Stage 2 until all of the following are true:

- The target host is known and supports long-lived, unbuffered SSE responses and a persistent server runtime.
- The production adapter is chosen explicitly; `adapter-auto` is not treated as the deployment contract.
- The host's request-duration and idle-timeout limits are understood.
- The PostgreSQL connection URL uses a mode that supports session features such as `LISTEN`; add a separate listener URL if normal queries use transaction pooling.
- The repository has an agreed versioned migration location and deploy command.
- A staging check proves that SvelteKit reconnects after the host or network closes a stream.
- No service worker or proxy caches responses whose `Cache-Control` includes `no-store`.

If the deployment platform cannot support the stream reliably, stop after Stage 1. Do not disguise polling as the final live-query architecture.

## Non-goals

- Do not build an event log, offline-first database, CRDT, or collaborative conflict-resolution system.
- Do not stream private card bodies in PostgreSQL notification payloads.
- Do not add Supabase Realtime alongside PostgreSQL `LISTEN/NOTIFY`.
- Do not change card schema, clustering semantics, or Svelte Flow APIs.
- Do not enable SSR as part of this migration.
- Do not guarantee that every intermediate drag/update event is rendered; card snapshots are state, not an event history.
- Do not remove TanStack AI packages used by enrichment.

## Target Architecture

### Authoritative server snapshot

Create a card live query in `src/lib/cards.remote.ts` using `query.live`.

Its async generator must:

1. call `requirePrivateBoard()`
2. establish its change subscription before the initial database read
3. yield `listCards()` as the initial authoritative snapshot
4. wait for a coalesced card-change signal
5. re-run `listCards()` and yield the new snapshot
6. release listener/subscriber resources in `finally` when server-side iteration stops

Subscribing before reading avoids missing a write between the first `SELECT` and `LISTEN`. A notification received during the initial read may cause one harmless extra snapshot. SvelteKit stops server-side iteration when the query is no longer actively used; the generator must make that cancellation sufficient to clean up its subscription.

The query should emit complete `Card[]` snapshots. That is appropriate for the current small personal board and keeps ordering, deletion, archive state, and reconnect behavior simple. Revisit incremental patches only after measurement shows full snapshots are a problem.

### PostgreSQL change source

Introduce a versioned database migration for the notification trigger rather than silently extending the request-time `ensureSchema` DDL. The repository does not yet have a migration runner, so choosing the migration location and deploy command is a Stage 2 prerequisite. The migration adds:

- one fixed notification channel owned by the application
- one trigger function that calls `pg_notify`
- an `AFTER INSERT OR UPDATE OR DELETE` trigger on `cards`
- an empty or minimal non-sensitive payload

If the project deliberately keeps runtime schema management instead, that must be an explicit decision with documented production DDL permissions and concurrency behavior, not the default implementation.

The notification means only “the cards snapshot may have changed.” The server must re-read authoritative rows after receiving it. Do not put titles, bodies, labels, or full card JSON in the payload.

Use the existing `postgres` client's `listen` support. Encapsulate listener lifecycle in a server-only module rather than exposing the SQL client to the remote module.

The listener abstraction must handle:

- multiple live-query consumers in one application process
- one subscriber disconnecting without breaking the others
- PostgreSQL listener reconnects
- cancellation and zero-subscriber cleanup
- a bounded signal queue so a slow consumer does not accumulate an event log

Prefer one process-level channel listener with fan-out over one dedicated PostgreSQL listener per browser. Each deployed server process will still have its own listener, which is expected.

### Notification coalescing

`saveMovedCards` and `reorganizeClusters` can commit several updates close together. Coalesce notifications over a short fixed window before re-reading the board.

Requirements:

- a burst produces one eventual snapshot when practical
- a notification that arrives during a database read schedules one subsequent read
- the coalescer is trailing-edge or otherwise cannot permanently miss the final committed state
- memory remains bounded
- cancellation clears timers and subscribers

Do not depend on SvelteKit's “latest pending value” behavior to prevent server-side query amplification; coalesce before calling `listCards()`.

Add one bounded `updateCardPositions` command for drag groups and cluster reorganization. Validate every item before starting, update all positions in one PostgreSQL transaction, and define missing-card behavior as all-or-nothing. PostgreSQL can then fold identical notifications from the transaction, while application-level coalescing still protects against bursts from separate commits.

### Remote mutations

Keep the Stage 1 create, update, and delete commands and add the batch position command. A successful database mutation causes the trigger to notify every active server process; the live query then emits the new snapshot.

Use the live query through its documented surface. It has no `refresh()` method, and ordinary-query `set()` and `withOverride()` behavior is not part of the live-query contract. `reconnect()` is supported, but PostgreSQL notifications—not a reconnect after every command—remain the normal invalidation path. Reserve explicit reconnects for user retry, an unconfirmed-mutation timeout, or a mutation that changes connection context such as authentication.

Commands should continue returning the created or updated card where applicable. The client can use that result to reconcile optimistic state while waiting for the authoritative stream.

## Client State Model

### Replace the collection

Remove `useLiveQuery` and `cardsCollection` from `App.svelte`. Instantiate the documented remote live-query resource once in `App.svelte`, then derive effective cards from:

- `cardsQuery.current`, the latest snapshot owned by SvelteKit
- pending optimistic inserts and updates keyed by card ID
- pending optimistic deletions keyed by card ID

Keep only the optimistic overlay in a focused client module rather than embedding reconciliation rules throughout `App.svelte` and `MemoryNode.svelte`.

Suggested ownership:

- `src/lib/card-overlay.svelte.ts`: pending mutations, sequencing, reconciliation, rollback, and command wrappers
- `src/lib/card-persistence.ts`: either becomes a thin interface to the overlay or is removed
- `src/App.svelte`: owns the live-query resource and derives effective cards from its current value plus the overlay

The overlay must not cache a second authoritative snapshot or manage connection sharing, stream lifetime, passive retries, or online/offline events. Those remain SvelteKit responsibilities. Do not recreate a general-purpose client database.

### Optimistic reconciliation

For each mutation:

1. assign a local sequence/token
2. apply the smallest optimistic overlay needed for immediate UI behavior
3. invoke the remote command
4. on command failure, remove only that mutation's overlay and surface the existing error
5. on success, retain the overlay until an authoritative snapshot confirms it
6. remove the overlay when the streamed card matches the returned card/change, or when a deletion snapshot no longer contains the card

Use per-card sequencing so an older command response cannot clear a newer optimistic update. Define explicit last-write-wins behavior for rapid successive drags or edits.

Add a bounded reconciliation timeout. If a command succeeds but no confirming snapshot arrives, preserve the last good server state, expose stale status, and call the documented `reconnect()` method once. Do not retain pending overlays forever, and do not start a custom retry loop merely because `connected` is false; SvelteKit already handles dropped connections.

Apply optimism only where it protects existing UX:

- dragging remains immediate because Svelte Flow already moves the node locally
- edits may continue using `updateNodeData` while persistence is pending
- archive/delete should disappear immediately and roll back on failure
- creation may continue waiting for server success before closing the dialog; it does not need speculative creation unless user testing demands it

### Status mapping

Replace current TanStack status usage with the documented live-query resource state:

- initial loading: `loading` is true and `current` is undefined
- initial failure: `error` is set and `current` is undefined
- ready: `current` contains at least one snapshot
- disconnected after a snapshot: keep rendering `current` and show a non-destructive reconnect/stale indication when `connected` is false
- reconnecting: do not blank the board

Do not add a separate connection state machine. Use `connected` for presentation and `reconnect()` for explicit retry. Avoid disabling all editing merely because a transient reconnect is in progress; command failures remain the authoritative persistence signal.

## Implementation Sequence

### 1. Prove infrastructure compatibility

- Choose the production adapter/runtime; a persistent Node deployment is the default fit for PostgreSQL `LISTEN`.
- Add a minimal staging-only live stream and verify the deployed host does not buffer it.
- Observe reconnect behavior after network interruption and server restart.
- Confirm the Supabase/PostgreSQL connection mode supports `LISTEN` for the required duration.
- Record host timeout behavior in the README or deployment documentation.

Stop here if the platform is unsuitable.

### 2. Add the database migration, listener abstraction, and batch write

- Establish the repository's versioned migration location and deploy command.
- Add the trigger/function migration without putting private card data in notification payloads.
- Add the process-level, server-only card-change hub.
- Make subscription cleanup reliable through async-generator `finally` handling.
- Add the bounded coalescer.
- Add a transactional, bounded database operation and remote command for multi-card position updates.
- Test commit/rollback notification behavior, all-or-nothing batch behavior, subscribe-before-read, and notification-during-read races.

### 3. Add the live query

- Add a temporarily separate card live query while the ordinary Stage 1 query remains available for rollback and tests.
- Yield the initial ordered snapshot and each coalesced refresh.
- Verify authorization is checked for every new connection.
- Ensure generator `finally` cleanup releases its hub subscription when SvelteKit stops iteration.
- Verify the documented active-use lifecycle, connection sharing, and passive reconnect behavior on the deployed host.

Do not run both resources in the production UI.

### 4. Add the optimistic card overlay

- Implement pending overlays independently of the live-query lifecycle and Svelte components.
- Add create/update/delete wrappers around the existing remote commands.
- Cover per-card sequencing, rollback, confirmation, timeout, and explicit reconnect behavior with focused tests.
- Keep public operations close to the existing `insertCard`, `updateCard`, and `deleteCard` signatures to minimize component churn.
- Do not copy the authoritative snapshot out of `cardsQuery.current` into another cache.

### 5. Switch the UI

- Replace TanStack imports and status fields in `App.svelte` with one directly instantiated live-query resource.
- Derive effective cards from `cardsQuery.current` plus the optimistic overlay.
- Route `MemoryNode.svelte` persistence through the new overlay/interface.
- Preserve derived tag vocabulary, archived cards, node conversion, and all existing UI copy.
- Replace `Promise.all(updateCard(...))` for grouped moves/reflow with one optimistic batch-position command.
- Add a small disconnected/reconnecting status only if it can be communicated without blocking the canvas.

### 6. Remove the old client data layer

Delete `src/lib/cards-collection.ts` after no caller uses it.

Remove these dependencies if repository search confirms they are unused:

- `@tanstack/db`
- `@tanstack/query-core`
- `@tanstack/query-db-collection`
- `@tanstack/svelte-db`

Keep `@tanstack/ai` and `@tanstack/ai-openai` for enrichment.

Remove the ordinary card query only after the live query passes staging and browser verification. Retaining it as a diagnostic or fallback requires an explicit decision; do not leave an unused duplicate path.

### 7. Update documentation

- Update `README.md` to describe real-time card snapshots, PostgreSQL notifications, and the deployment requirements.
- Document that snapshots are authoritative state rather than an event log.
- Record the chosen coalescing interval and reconciliation timeout near their implementations.

## Decisions Required Before Stage 2

1. **Hosting and adapter:** choose a persistent runtime that supports SSE and a long-lived PostgreSQL listener. If the selected platform is serverless or edge-only, revise this plan around a managed realtime source instead of forcing `LISTEN`.
2. **Listener connection:** confirm the current Supabase URL is session-capable, or add a dedicated `DATABASE_LISTEN_CONNECTION_STRING` and budget one persistent connection per server process.
3. **Migration ownership:** select the migration directory/tool and how migrations run in development, CI, and deployment before adding the trigger.
4. **Optimistic acknowledgement:** choose between matching returned `updatedAt`, adding a monotonic card version, or serializing writes per card. A version column is safer but expands the database migration.
5. **Batch not-found behavior:** the recommended contract is all-or-nothing with `404` when any requested card is missing.
6. **Authentication scope:** production remains blocked by `requirePrivateBoard`. Before multiple boards/users, derive board identity from the authenticated server session and scope snapshots accordingly.
7. **SvelteKit compatibility:** use a SvelteKit version that supports the documented `query.live` contract. Treat the official documentation as authoritative and avoid dependencies on package internals; if the installed version lacks documented behavior required here, upgrade it deliberately before implementing Stage 2.

## Verification

### Unit and component-level

Add focused tests for:

- change-hub fan-out and cleanup
- bounded/coalesced notification behavior
- notification during an in-flight snapshot read
- optimistic update confirmation
- optimistic rollback after command failure
- overlapping updates to one card
- insert and delete confirmation
- reconciliation timeout and reconnect request
- snapshot replacement without losing a newer pending mutation
- optimistic overlay behavior without duplicating the authoritative snapshot or live-query lifecycle

Preserve existing card-contract, scene, cluster, Markdown, and enrichment tests.

### Database integration

Against a disposable PostgreSQL database:

1. subscribe and receive the initial snapshot
2. insert, update, archive, restore, and delete a card
3. verify each operation eventually emits the correct snapshot
4. issue one transactional batch of position updates and verify it produces one committed invalidation and final snapshot
5. cancel a subscriber and verify resources are released
6. restart or interrupt the listener connection and verify recovery

### Browser and multi-client

Use two independent browser contexts:

1. Open the board in both contexts.
2. Create a card in A and observe it in B without reload.
3. Move and edit it in B and observe the final state in A.
4. Archive, restore, and delete across contexts.
5. Reorganize a multi-card board and verify both clients converge.
6. Disconnect A, mutate in B, reconnect A, and verify A receives the authoritative board.
7. Force a mutation failure and verify the initiating client rolls back without corrupting the other client.
8. Leave and return to the page and verify unused streams are closed and recreated.
9. Render multiple consumers of the same live-query instance and verify they share one connection.
10. Drop the connection and verify SvelteKit reconnects without an application-owned retry loop.

### Project checks

- Run `vp check`.
- Run `vp test`.
- Run `vp run svelte-check`.
- Run `vp build`.
- Search for removed TanStack DB imports and dependencies.
- Verify no service worker caches the live response.
- Verify behavior on the real deployment platform, not only the local development server.

## Acceptance Criteria

The migration is complete when:

- a committed card change appears in another active client without reload
- all clients converge to the same ordered snapshot after burst updates
- local interactions remain immediate
- failed writes roll back only their own optimistic changes
- transient stream loss keeps the last good board visible while SvelteKit reconnects
- identical active live-query instances share a connection, and unused streams stop server iteration
- the application has no parallel live-query connection manager, snapshot cache, or passive retry loop
- no PostgreSQL notification contains private card data
- listener and generator resources are released when unused
- card CRUD no longer imports TanStack DB or TanStack Query
- the four card-data TanStack packages are removed
- enrichment continues to work through its existing TanStack AI dependencies

## Rollback Boundary

Keep Stage 1 deployable until Stage 2 passes staging. If SSE or PostgreSQL listener behavior is unreliable:

1. switch `App.svelte` back to the Stage 1 collection
2. remove the live-query/overlay wiring
3. leave the database trigger temporarily only if it is harmless and documented, otherwise remove it with an idempotent schema change

No card data migration is required. The fallback is the Stage 1 remote-query/command architecture, not restoration of the deleted REST routes.
