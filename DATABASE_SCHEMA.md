# Database schema

`migrations/0001_cards.sql` owns the cards table and its change-notification trigger;
`migrations/0002_better_auth.sql` owns Better Auth's user, session, account, and verification
tables; `migrations/0003_enrichment_analytics.sql` owns the private AI-enrichment analytics tables,
views, row-level security, and grants. `migrations/0004_card_kind.sql` adds the card kind
(`memory`, `idea`, or `note`), assigning `memory` to all existing cards. Run all migrations with `vp run db:migrate` before starting
the application. Runtime application code never creates or alters schema.

Each card stores its UUID, kind, title, Markdown body, canvas coordinates, tags, topics, derived HTTP links,
archive flag, creation timestamp, and last content-edit timestamp. Moving, archiving, or restoring a
card does not change its content-edit timestamp. Application reads return complete snapshots ordered
by `created_at, id`; links are re-derived from the Markdown body.

The `cards_changed` trigger publishes an empty payload only after a transaction commits. It is an
invalidation signal: application processes re-read the table rather than treating notifications as
card data or event history.
