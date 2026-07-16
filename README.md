# Pile of Memories II

Fresh start for a auto-clustering, private memory and idea hub.

Core loop:

- capture rough memories and ideas quickly
- place them spatially instead of burying them in lists
- rearrange and cluster items as their meaning changes
- enrich description-first capture with editable AI title and tag suggestions
- read Markdown cards and edit their title, text, tags, and derived links in one dialog

This version uses Svelte Flow as the main workspace. Memory cards are Svelte Flow nodes,
queried and optimistically updated through TanStack DB, and persisted individually in PostgreSQL.

The guided creation and placement idea is captured in [GUIDED_MEMORY_PLACEMENT.md](GUIDED_MEMORY_PLACEMENT.md).
The database decisions are captured in [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

## Development

```sh
vp install
vp dev
```

Set `DATABASE_CONNECTION_STRING` in `.env` to a PostgreSQL session-pooler URL. Database endpoints
are development-only until authentication is implemented. Set `OPENCODE_GO_API_KEY` to enable
DeepSeek V4 Flash title and tag suggestions through OpenCode Go.
