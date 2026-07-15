# Pile of Memories II

Fresh start for a auto-clustering, private memory and idea hub.

Core idea from the first pass:

- capture rough memories and ideas quickly
- place them spatially instead of burying them in lists
- rearrange and cluster items as their meaning changes
- keep search, auth, sync, AI, and rich note editing out until the canvas loop works or the user explicitly wants to implement those features

This version uses Svelte Flow as the main workspace. Memory cards are editable Svelte Flow nodes,
queried and optimistically updated through TanStack DB, and persisted individually in PostgreSQL.

The guided creation and placement idea is captured in [GUIDED_MEMORY_PLACEMENT.md](GUIDED_MEMORY_PLACEMENT.md).
The database decisions are captured in [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

## Development

```sh
vp install
vp dev
```

Set `DATABASE_CONNECTION_STRING` in `.env` to a PostgreSQL session-pooler URL. Database endpoints
are development-only until authentication is implemented.
