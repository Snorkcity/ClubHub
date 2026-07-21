# Deploying ClubHub to Railway

Two services from this repo plus a Postgres database.

## 1. Postgres
Add a PostgreSQL database to the Railway project. Note its `DATABASE_URL`.

Push the schema (from your machine or a Railway shell):

```bash
DATABASE_URL=<railway postgres url> pnpm --filter @workspace/db run push
```

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
- CORS on the API currently reflects any origin with credentials; tighten `cors({ origin })` to the web domain once URLs are stable.
- To bring existing data across, `pg_dump` the source database and restore into the Railway Postgres before switching over.
