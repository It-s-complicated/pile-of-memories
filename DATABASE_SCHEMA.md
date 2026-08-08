# Database schema

`migrations/0001_cards.sql` owns the cards table and its change-notification trigger;
`migrations/0002_better_auth.sql` owns Better Auth's user, session, account, and verification
tables; `migrations/0003_enrichment_analytics.sql` owns the private AI-enrichment analytics tables,
views, row-level security, and grants. Run all migrations with `vp run db:migrate` before starting
the application. Runtime application code never creates or alters schema.

Each card stores its UUID, title, Markdown body, canvas coordinates, tags, topics, derived HTTP links,
archive flag, and creation/update timestamps. Application reads return complete snapshots ordered by
`created_at, id`; links are re-derived from the Markdown body.

The `cards_changed` trigger publishes an empty payload only after a transaction commits. It is an
invalidation signal: application processes re-read the table rather than treating notifications as
card data or event history.
