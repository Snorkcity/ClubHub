# Deploying Nahreo to Railway

Two services from this repo plus a Postgres database.

## Invitation-only club setup

The API build packages the additive `20261025_club_setup_access.sql` migration
and `config/nahreo-owner.json`. Startup applies the migration transactionally
and seeds the explicitly configured owner email with `ON CONFLICT DO NOTHING`.
Each environment resolves its own verified Clerk identity; no Clerk IDs or
development role records are copied into production. A revoked owner record
is never re-enabled by restarting or redeploying.

Nahreo-owner access is separate from club-admin access. Only the verified
owner can issue or revoke single-use, email-bound, seven-day club-setup links.
Links are created for manual sharing, not automatically emailed. Ordinary
club admins can still create teams within their own club.

## 1. Postgres
Add a PostgreSQL database to the Railway project. Note its `DATABASE_URL`.

Push the schema (from your machine or a Railway shell):

```bash
DATABASE_URL=<railway postgres url> pnpm --filter @workspace/db run push
```

### Safe club membership uniqueness repair

If schema reconciliation offers to truncate `club_members` while adding
`club_members_club_id_user_id_unique`, decline the truncation. Repair the
production drift additively:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c \
  'SELECT club_id, user_id, COUNT(*) FROM club_members GROUP BY club_id, user_id HAVING COUNT(*) > 1'
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f lib/db/migrations/20260901_club_members_unique.sql
DATABASE_URL="$DATABASE_URL" pnpm --filter @workspace/db run push
```

The first query must return no rows. The migration preserves all memberships,
fails without changing the schema if duplicates exist, and replaces a
same-named constraint with an equivalent unique index that Drizzle can
reconcile on Railway. It is safe to re-run. The final Drizzle command should
report that there are no schema changes.

## 2. API service (this repo)
- **Build command:** `pnpm install && pnpm --filter @workspace/api-server run build`
- **Start command:** `node --enable-source-maps artifacts/api-server/dist/index.mjs`
- **Variables:**
  - `DATABASE_URL` → reference the Postgres service
  - `CLERK_SECRET_KEY`
  - `CLERK_PUBLISHABLE_KEY`
  - `SESSION_SECRET`
  - `RESEND_API_KEY` → Resend sending key for `nahreo.com`
  - `NODE_ENV=production`
- Generate a public domain (Settings → Networking). Railway injects `PORT` automatically; the server reads it.
- Health check path: `/api/healthz`
- Production browser requests are accepted from `https://app.nahreo.com` and
  the compatibility domain `https://clubhub.gameinsights.com.au`.

## 3. Web service (same repo, second service)
- **Build command:** `pnpm install && BASE_PATH=/ pnpm --filter @workspace/clubhub run build`
- **Start command:** `BASE_PATH=/ pnpm --filter @workspace/clubhub run serve`
- **Variables (build-time):**
  - `VITE_CLERK_PUBLISHABLE_KEY`
  - `VITE_API_URL` → the API service's public URL, e.g. `https://<api-service>.up.railway.app` (no trailing slash)
  - `BASE_PATH=/`
- Generate a public domain.

## Notes
- The web client prefixes all `/api/...` calls with `VITE_API_URL` when set (see `setBaseUrl` in `artifacts/clubhub/src/App.tsx`). Leave it unset in environments where the API is same-origin (like Replit).
- Keep the existing `@workspace/clubhub` package name, `artifacts/clubhub` directory, GitHub repository URL, Railway service domains, and PWA `start_url`/`scope` during the product rename. These are compatibility identifiers rather than user-facing branding; changing them without redirects or aliases can break Railway builds, installed PWAs, saved sessions, and deep links.
- Railway service display labels may be renamed to **Nahreo API** and **Nahreo Web** without changing their generated domains. `https://app.nahreo.com` is the primary public web address; keep the old ClubHub domain attached as a compatibility alias until existing installs and links have migrated.
- The GitHub repository can be renamed separately once Railway is confirmed to follow GitHub redirects or has been reconnected to the new repository URL. The internal workspace package should remain `@workspace/clubhub` unless all Railway commands are updated and tested in the same change.
- API CORS is restricted in production to the Nahreo web address and the old
  compatibility address. Development remains open to proxied/local origins.
- To bring existing data across, `pg_dump` the source database and restore into the Railway Postgres before switching over.

## One-time external Clerk production cutover

Keep Replit's development keys unchanged. The separately named
`NAHREO_PRODUCTION_CLERK_*` preparation secrets are not read by the running app.
Both services must retain the explicit `clerk.nahreo.com` production key rather
than deriving a new key from their serving hostname. The managed SDK helper
otherwise derives `clerk.app.nahreo.com` on Web and a different tenant on API.
The production-key resolver preserves managed/development behavior for all
other configured tenants.
Before enabling transfers, audit old login IDs against the old Clerk tenant:
each primary email must be verified and match the unique Nahreo account email.
Never print credentials or full provider profiles in audit output.

Two temporary **API** variables control transfers:

- `CLERK_LEGACY_USER_IDS`: comma-separated, individually audited old Clerk user
  IDs, not email addresses, local person IDs, wildcard patterns or new IDs.
- `CLERK_ACCOUNT_MIGRATION_UNTIL`: explicit ISO-8601 UTC expiry. Use a short
  migration window and remove both variables once transfers are complete.

Transfers run only with a live publishable key for `clerk.nahreo.com`. A new
login must have a backend-verified primary email matching exactly one person
globally, whose current login is an allowlisted old ID. Only the login binding
changes, transactionally: no person is recreated and no departed membership is
restored. The new binding cannot be claimed a second time using this bridge.
Unverified identities, ambiguous emails, unauthorised source IDs and expired
windows cannot transfer an existing login.

Coordinate the Railway API's `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` with
Web's build-time `VITE_CLERK_PUBLISHABLE_KEY`; rebuild Web. Existing passwords
and sessions do not carry across instances. People use the same verified email
with Google or register a new password; Nahreo records stay intact. Do not
delete the old provider's users or revoke its keys during the switch.

Before any transfers, rollback can restore the old Web build and API keys
together. After transfers begin, restoring keys alone is not a complete
rollback: explicitly recover the affected login bindings too. Never clear all
login IDs or remove memberships to force re-registration.
