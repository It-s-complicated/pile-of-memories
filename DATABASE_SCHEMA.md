# Database schema

`migrations/0001_cards.sql` owns the cards table and its change-notification trigger;
`migrations/0002_better_auth.sql` owns Better Auth's user, session, account, and verification
tables; `migrations/0003_enrichment_analytics.sql` owns the private AI-enrichment analytics tables,
views, row-level security, and grants. `migrations/0004_card_kind.sql` adds the card kind
(`memory`, `idea`, or `note`), assigning `memory` to all existing cards.
`migrations/0005_drop_card_links.sql` removes the unused stored links column.
`migrations/0006_managed_labels.sql` adds the private `memory_labels` catalog and assignment triggers.
Run all migrations with `vp run db:migrate` before starting the application. Runtime application
code never creates or alters schema.

Each card stores its UUID, kind, title, Markdown body, canvas coordinates, tags, topics,
archive flag, creation timestamp, and last content-edit timestamp. Moving, archiving, or restoring a
card does not change its content-edit timestamp. Application reads return complete snapshots ordered
by `created_at, id`; links are re-derived from the Markdown body.

The `cards_changed` trigger publishes an empty payload only after a transaction commits. It is an
invalidation signal: application processes re-read the table rather than treating notifications as
card data or event history. The label catalog publishes on the same channel.

## Managed vocabulary

`memory_labels` stores a UUID, case-insensitively unique name (1–40 characters), kind
(`tag` or `topic`), and enrichment description (up to 1,000 characters). The initial migration
seeds the default vocabulary and backfills custom labels, including archived-card assignments.
Seeding runs only when the catalog is first created; subsequent migrations preserve edits/deletions.

Cards continue to use their existing string arrays. A before-write trigger validates labels,
canonicalizes names, deduplicates assignments, and places each label in the array matching its
current catalog kind. Unknown labels are rejected rather than silently discarded. Matching
definitions are locked during card writes to protect against concurrent renames or deletions.

Catalog rename/type changes cascade to assigned cards in the same transaction. Deleting a label
removes its assignments while retaining the cards. Both operations update affected cards'
content-edit timestamps; changing only a description does not. The catalog uses row-level security
and revokes public/Supabase API-role access; app remote functions require the approved session.
