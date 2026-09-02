# Deploying Nahreo to Railway

Two services from this repo plus a Postgres database.

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
  - `NODE_ENV=production`
- Generate a public domain (Settings → Networking). Railway injects `PORT` automatically; the server reads it.
- Health check path: `/api/healthz`

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
- Railway service display labels may be renamed to **Nahreo API** and **Nahreo Web** without changing their generated domains. When a Nahreo production domain is introduced, attach it as an additional domain first, update Clerk/CORS configuration, and keep the old Squadly domains redirecting until existing installs and links have migrated.
- The GitHub repository can be renamed separately once Railway is confirmed to follow GitHub redirects or has been reconnected to the new repository URL. The internal workspace package should remain `@workspace/clubhub` unless all Railway commands are updated and tested in the same change.
- CORS on the API currently reflects any origin with credentials; tighten `cors({ origin })` to the web domain once URLs are stable.
- To bring existing data across, `pg_dump` the source database and restore into the Railway Postgres before switching over.
