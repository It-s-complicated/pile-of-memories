# Deploying on Coolify and leaving Supabase

Recommended order: **move the app first, then the database**. The app talks directly to PostgreSQL
and uses Better Auth, not Supabase Auth, Storage, or Realtime. You need a PostgreSQL resource,
not a self-hosted Supabase stack. `compose.coolify.yaml` runs **only the app**, built from the
existing Dockerfile. The database stays a separate Coolify resource with its own lifecycle/backups.

Do not run the migration commands against production until you have rehearsed them against a
disposable target. Nothing in this guide requires deleting the Supabase project.

## 1. Move the app, keep Supabase

In Coolify, create an application from this repository:

- **Build strategy:** Docker Compose; repository root `/`; Compose location `/compose.coolify.yaml`.
  Use normal Coolify-managed Compose, not raw mode. The `app` service builds the Dockerfile's
  `runtime` stage; no application build arguments or secrets are needed.
- **Internal port:** `3000` on service `app`; no public host-port mapping. Node listens on `0.0.0.0`.
- **Domain:** set the `app` service's public HTTPS domain, routed to internal port `3000`.
  `SERVICE_URL_APP_3000` links the generated URL to this service and port.
- **Start command:** leave the image default (`node build`). No application volume is needed.
- **Health check:** use the Dockerfile's built-in Node-based check. Dashboard HTTP checks need
  curl/wget, which this image does not install. `GET /` checks the signed-out page, including
  Better Auth's initial schema validation, not ongoing board-query/`LISTEN` readiness.

### Coolify-owned URLs and secrets

Load the Compose file in Coolify so it discovers the referenced variables. It generates and stores
these values, and Compose passes them to the application under its existing names:

- `SERVICE_URL_APP_3000` → `BETTER_AUTH_URL` (the public URL, including the scheme).
- `SERVICE_BASE64_64_APP` → `BETTER_AUTH_SECRET`.
- `SERVICE_BASE64_64_ANALYTICS` → `ANALYTICS_FINGERPRINT_KEY` (a separate key).

`SERVICE_URL_APP_3000` is the port-aware form of `SERVICE_URL_APP`: the suffix tells Coolify to route
to container port 3000, not to expose a public `:3000` URL. Ensure its resolved value is your single
public HTTPS origin, without an internal port or path. Update the service domain rather than
hardcoding a second URL in `BETTER_AUTH_URL`. Generated URLs follow the service's domain settings;
generated secrets are stored, not regenerated for every restart. Despite the `BASE64` name, Coolify
documents these generators as 64-character random alphanumeric strings; both satisfy our schemas.

**For this Supabase migration, before the first app start, overwrite `SERVICE_BASE64_64_APP` with
the existing `BETTER_AUTH_SECRET`, and `SERVICE_BASE64_64_ANALYTICS` with the existing
`ANALYTICS_FINGERPRINT_KEY`.** The generator's name does not require replacing an existing key with
a newly generated 64-character value. Rotating the auth key would prevent decryption of imported
OAuth tokens; rotating the analytics key would change fingerprints. Use newly generated secrets
only for a genuinely new board or an isolated preview database, not for the imported board.

Enter the remaining referenced variables in Coolify: the two database URLs, `DATABASE_SSL`, approved
GitHub ID, GitHub OAuth credentials, and both AI API keys. Set them and generated secrets to
**runtime only**, not build-time. The file supplies `PROTOCOL_HEADER=x-forwarded-proto` and defaults
`DATABASE_SSL` to `true`; override it to `false` for a TLS-free private database.

Coolify performs the generation/interpolation; the application still reads and validates its usual
environment names. Do not put literal `$SERVICE_*` references in local `.env` or in `docker run
--env-file` files: Node and Docker's env-file reader do not expand them. Plain `docker compose` also
does not generate Coolify values; supply resolved values for all references when running it outside
Coolify. Required references use `:?` to reject missing or empty values before starting the container.

The image builds without `.env`, production credentials, or access to a database: its build command
uses synthetic values only. Startup still rejects missing or invalid runtime variables. Do not
deploy the synthetic build values.

For the initial Supabase-backed deployment:

- Keep the existing Supabase SQL URL as `DATABASE_CONNECTION_STRING`.
- Use a direct or **session-pooler** URL for `DATABASE_LISTEN_CONNECTION_STRING`, never the
  transaction pooler (typically port 6543). `LISTEN` needs a persistent session. If the server
  cannot reach Supabase's IPv6 direct endpoint, use its IPv4 session pooler (typically port 5432).
- Keep `DATABASE_SSL=true` for Supabase.
- Preserve the existing auth and analytics keys in the Coolify-owned slots above, plus
  `APPROVED_GITHUB_PROVIDER_ID`, GitHub OAuth credentials, and the two AI API keys.
- Behind Coolify's trusted proxy, set `PROTOCOL_HEADER=x-forwarded-proto`. The proxy must preserve
  the public `Host` header. If it rewrites `Host`, also set `HOST_HEADER=x-forwarded-host` and ensure
  the proxy overwrites that header. Do not expose the Node port directly with trusted-header settings.
  This adapter version derives the request origin from these headers; `BETTER_AUTH_URL` configures
  Better Auth, not SvelteKit's request URL.

If keeping the existing domain, the GitHub callback remains unchanged. For a new domain, update the
GitHub OAuth App callback to `https://NEW_DOMAIN/api/auth/callback/github` before testing login.
Use a separate OAuth App for a parallel staging domain so production login keeps working.
Configure preview values separately, use an isolated database, and verify that the generated preview
URL matches that preview OAuth App's callback. Do not point automated previews at the production DB.

### Direct Dockerfile alternative

If you prefer the Dockerfile build strategy without Compose, use `/Dockerfile`, stage `runtime`,
and internal port `3000`. Provision the required variables in `.env.example` at runtime, including
the real `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, and `ANALYTICS_FINGERPRINT_KEY`. `DATABASE_SSL` is
optional and defaults to `true`. The mappings above belong to
the Compose definition; the Dockerfile does not generate or resolve `SERVICE_*` values itself.

### Migrations before each release

Run migrations **from the new release image**, on the database's network, before routing traffic
to that release. Do not rely on a pre-deployment hook executing in an old container (or on a first
deployment having an old container). On the Coolify server, with the release image available:

```sh
docker run --rm --network YOUR_COOLIFY_NETWORK \
  --env-file /secure/path/memories.runtime.env \
  YOUR_RELEASE_IMAGE node scripts/migrate.mjs
```

Use the actual image tag and destination network from Coolify's deployment details. The env file
is server-local, outside the checkout, readable only by its owner; it needs
the **resolved** `DATABASE_CONNECTION_STRING`, not a Coolify/Compose reference. For `psql`, TLS is
controlled by `sslmode` in that URL (or `PGSSLMODE`),
**not** `DATABASE_SSL`. Use `sslmode=require` for Supabase. Run one migration job at a time; the
runner reapplies the idempotent SQL files and has no migration lock or version ledger.

For the first deployment, build the image without starting the public app, then run this job.
If your Coolify version cannot pause between build and start, build/tag the release on the server
first and use the same image for the migration and deployment. Abort deployment if migrations fail.
For future incompatible schema changes, use a maintenance window or expand/contract migrations;
a rolling application deploy does not make schema changes safe automatically.

### Verify before moving data

- Sign in as the approved GitHub account; confirm other accounts cannot open the board.
- Create/edit/archive a temporary card, move it, and edit a label. Confirm positions after reload.
- Open two tabs: edits in one must update the other without reload. Leave them open beyond 60 seconds.
- Restart/redeploy the app: live updates should recover automatically. Test AI enrichment separately.
- Only after these checks, switch production routing/DNS. Disable Netlify automatic/preview builds
  for this repository after cutover; the app now uses the Node adapter, not Netlify functions.

Keeping the same HTTPS origin retains browser-local preferences/cache. A different origin gets a
fresh cache and requires login; the database is the source of truth. Cached cards can hide a broken
restore, so include a fresh browser profile in the final checks.

## 2. Prepare a private PostgreSQL target

1. In Coolify create PostgreSQL with a persistent volume, on the app's destination network. Leave
   public access disabled. Use its **internal hostname**, not `localhost`, in the application URLs.
   For the Compose application, enable **Connect to predefined network** so `app` can reach this
   separately managed database. Verify the database hostname on the shared network; Compose's
   resource-specific default network alone cannot reach another Coolify resource.
2. Check the source version with `SHOW server_version;`. Use the same PostgreSQL major version or
   a newer one, at least 15 (the analytics views use `security_invoker`). Do not downgrade.
3. Use `pg_dump` matching the source major version, and `pg_restore` from the same client suite;
   the target must also support that client version's output. The app image has `psql` for schema
   migrations, but its Debian client may be older than Supabase: use a matching PostgreSQL client
   installation/container for dump/restore, not the app image's tools.
4. Create a dedicated non-superuser login and an **empty** database owned by it. In an admin `psql`
   session on the target (choose a strong password using the interactive prompt):

   ```sql
   CREATE ROLE memories_app LOGIN;
   \password memories_app
   CREATE DATABASE memories OWNER memories_app;
   ```

   Run schema migrations as `memories_app`, not as the bootstrap admin. The app's RLS-enabled
   analytics and labels tables intentionally have no public policies: their owner can access them;
   a different role with just table grants cannot. Do not give the app a superuser or BYPASSRLS role.

5. Configure scheduled, encrypted **off-server** backups and retention in Coolify before cutover.
   Restore one into a disposable database. A persistent volume or a backup on the same server is
   not disaster recovery; scheduled dumps are not point-in-time recovery.

Perform the following commands from one trusted machine that can reach both databases (for example
the Coolify server, using the PostgreSQL network or an SSH tunnel). Do not publicly expose PostgreSQL
just for this move. Supply credentials through a password manager / protected libpq password file,
not committed files, chat, or literal shell history. URL-encode special characters in URL passwords.

### Importing through the Coolify UI (no SSH)

Coolify 4.5 can restore a PostgreSQL archive from the database's **Import Backup** page. Build an
application-only archive from the frozen source with a matching `pg_dump` (custom format, selected
tables, schema included) and verify it locally by restoring it into an empty same-or-newer-major
database and comparing `scripts/verify-migration.sql`. Upload it, choose "backup contains one
database", leave **Replace objects** and **Keep owners and privileges** off, and import. The target
is then owned by `postgres`; create a non-superuser login role, transfer ownership of the database
and application tables, views, and functions to it, and set its password privately (for example in
the database's Coolify terminal). Point both connection strings at that role and set
`DATABASE_SSL=false` only for a TLS-free private network.

Set these shell variables privately for the manual commands below, then run the snippets in the
same Bash shell:

- `SOURCE_DB_URL`: Supabase direct/session URL with the source database owner and `sslmode=require`.
- `TARGET_DB_URL`: **new empty target** URL as `memories_app` (for migration and verification).
- `TARGET_ADMIN_DB_URL`: the same target database, as its bootstrap superuser (restore only).

On a TLS-free private network use `sslmode=disable` in target URLs. `DATABASE_SSL` only configures
the application's Node drivers; PostgreSQL command-line tools use libpq's `sslmode`/`PGSSLMODE`.

## 3. Rehearse the transfer, then repeat during a write freeze

Use the **same application commit/schema** on source and target. Apply this release's migrations
to the source before the final freeze if needed, after taking its normal backup. This recipe copies
only application table data into a schema created from the repository. It deliberately does not
restore Supabase roles, extensions, managed schemas, grants, or policies.

The eight tables are `cards`, `memory_labels`, `user`, `session`, `account`, `verification`, and both
`analytics_ai_enrichment_*` tables. This includes archived cards, label IDs/descriptions and deleted
default-label choices, Better Auth's encrypted OAuth tokens, sessions, and analytics. Supabase's
`auth.users` is **not** the app's user table. The in-app JSON export is useful as an extra copy of
your memories, but has no import flow and is not a database backup.

### Freeze all writers

For rehearsal, a live dump is a consistent snapshot, but later source changes will not be included.
For the real cutover, stop **every app connected to Supabase** (Coolify, Netlify, previews, local dev,
and background jobs), block new requests, and wait for in-flight requests to finish. Stop sign-in
traffic too: authentication and enrichment write data. Keep the new app stopped through restore
and comparison. Do not dual-write. Preserve the source untouched until verification passes.

### Export and fingerprint the frozen source

Use a private backup directory **outside the repository and Docker build context**:

```sh
set -euo pipefail
: "${SOURCE_DB_URL:?Set the Supabase source URL}"
: "${TARGET_DB_URL:?Set the new target app-role URL}"
: "${TARGET_ADMIN_DB_URL:?Set the new target admin URL}"
umask 077
mkdir -p "$HOME/memories-migration"
BACKUP_DIR="$HOME/memories-migration"

pg_dump --dbname="$SOURCE_DB_URL" \
  --format=custom --data-only --no-owner --no-privileges --strict-names \
  --table=public.cards --table=public.memory_labels \
  --table=public.user --table=public.session --table=public.account \
  --table=public.verification \
  --table=public.analytics_ai_enrichment_attempts \
  --table=public.analytics_ai_enrichment_reviews \
  --file="$BACKUP_DIR/application.dump"

pg_restore --list "$BACKUP_DIR/application.dump"
psql "$SOURCE_DB_URL" -X -qAt -v ON_ERROR_STOP=1 \
  -f scripts/verify-migration.sql > "$BACKUP_DIR/source.txt"
```

Check every command's exit status; stop on any error. Keep the dump encrypted off-server as well.
The archive contains private memories and authentication tokens. It is a **data-only migration
artifact**: keep the matching repository commit to reconstruct its schema. Do not replace your
normal full backups with it.

### Create the target schema and restore

```sh
psql "$TARGET_DB_URL" -X -v ON_ERROR_STOP=1 \
  -c 'SELECT current_database(), current_user, inet_server_addr();'
DATABASE_CONNECTION_STRING="$TARGET_DB_URL" node scripts/migrate.mjs
```

**The next command deletes all application rows on the target**, including migration-seeded labels.
Only run it on the new, disposable target after checking its hostname and database name. Never run
it on Supabase or an existing board. Clearing the seeded vocabulary preserves the source exactly,
including renamed/deleted defaults and their original IDs.

```sh
psql "$TARGET_DB_URL" -X -v ON_ERROR_STOP=1 -c \
  'TRUNCATE public.cards, public.memory_labels, public."user", public.session,
   public.account, public.verification, public.analytics_ai_enrichment_attempts,
   public.analytics_ai_enrichment_reviews;'

pg_restore --dbname="$TARGET_ADMIN_DB_URL" \
  --data-only --no-owner --no-privileges --disable-triggers \
  --single-transaction --exit-on-error "$BACKUP_DIR/application.dump"

psql "$TARGET_DB_URL" -X -qAt -v ON_ERROR_STOP=1 \
  -f scripts/verify-migration.sql > "$BACKUP_DIR/target.txt"
diff -u "$BACKUP_DIR/source.txt" "$BACKUP_DIR/target.txt"
```

The restore needs the target superuser **only** because `--disable-triggers` temporarily disables
foreign-key and application triggers. Otherwise cards can be loaded before their managed labels,
and triggers could normalize/change imported data. The successful restore re-enables triggers;
its transaction rolls back on failure. The preceding truncate is separate: if restore fails, keep
the target offline and retry the restore or recreate the disposable target. Never ignore errors.
Do not give these admin credentials to the web app.

`verify-migration.sql` is read-only. It compares exact counts and ordered row fingerprints for all
eight tables, including coordinates, timestamps, label descriptions, and auth records, without
printing their contents. Run with the same client and UTC settings on both sides. **An empty diff
is required** before proceeding; it is a small-board integrity check, not a replacement for backups.

Do not rerun source-changing migrations between export and comparison. In particular, the label
migration normalizes existing card assignments; compare the restored data before running it again.

## 4. Switch the app to the new database

While production traffic is still blocked:

1. Change both database URLs in Coolify to the target's internal URL as `memories_app`.
   Direct PostgreSQL supports both queries and `LISTEN`; they can use the same URL.
2. Set `DATABASE_SSL=false` only for a TLS-free private connection. Remove any Supabase
   `sslmode=require` query parameter from that URL (or use `sslmode=disable`). For a TLS-enabled
   target keep `DATABASE_SSL=true`. Never send an unencrypted connection over the public internet.
3. Keep `SERVICE_BASE64_64_APP` set to the original auth key and `SERVICE_BASE64_64_ANALYTICS` to the
   original analytics key (or preserve the corresponding app variables for a direct Dockerfile
   deployment). Better Auth needs the same key to decrypt imported OAuth tokens; analytics needs
   the same key for comparable fingerprints. Keep the approved GitHub ID unchanged too.
4. Start the new app and repeat the sign-in, persistence, two-tab live-update, and enrichment checks
   above, including a fresh browser profile. These checks now write to the target. Imported sessions
   may survive on the same domain; a domain change normally requires another sign-in.
5. Reopen production traffic only after these checks pass. Keep old deployments stopped, disable
   their redeploy hooks, and keep Supabase plus the final dump through an agreed rollback window.

**Never run the database integration test against either live database or your restored board.**
`DATABASE_INTEGRATION_TEST=1` tests truncate cards and change labels. Use a separate disposable test
database; the manual checks above are the production smoke test.

### Rollback and retirement

- **Before the target accepts any writes:** stop the new app, restore the Supabase URLs and
  `DATABASE_SSL=true`, redeploy the known-good app, and reopen traffic. Supabase is still authoritative.
- **After any target writes** (including smoke tests or logins): freeze traffic again, back up both
  databases, and choose one authoritative dataset. Switching URLs straight back loses those writes.
  Either explicitly discard only known test writes or reconcile/reverse-transfer into a fresh
  database and verify it before reopening. Never merge two active databases by guesswork.
- Once stable, take and restore a fresh Coolify backup, verify backup alerts/retention, then retire
  the old hosting and Supabase project only with explicit approval. Revoke unused credentials and
  remove temporary dumps/password files securely. Keep encrypted backups according to retention.

References: [Coolify Dockerfile deployments](https://coolify.io/docs/applications/builds/dockerfile),
[Compose generated values](https://coolify.io/docs/applications/builds/docker-compose#generated-stack-values),
[health checks](https://coolify.io/docs/applications/configuration/health-checks), and
[SvelteKit Node proxy settings](https://svelte.dev/docs/kit/adapter-node#Environment-variables).
