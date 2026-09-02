---
name: Railway is production
description: Squadly prod runs on Railway; Replit is dev. Deploy flow and env differences.
---

# Railway production setup (since July 2026)

- **Replit = dev, Railway = prod.** Deploy flow: commit → `gitPush` to `github.com/Snorkcity/ClubHub` (origin) → Railway auto-rebuilds both services.
- Railway project has Postgres, API, and web services. The primary production web address is `app.nahreo.com`; `clubhub.gameinsights.com.au` remains a compatibility alias. API health is on `clubhub-production-162a.up.railway.app/api/healthz`. Full setup is in `DEPLOY.md`.
- Prod drizzle-kit push against Railway may prompt to truncate unrelated populated tables while reconciling drift. Never accept; apply scoped additive DDL transactionally with `psql`, then verify only intended objects.
- Prod DB reachable from Replit via secret `RAILWAY_DATABASE_URL` (schema pushed + full data copy done 2026-07-24; databases are independent since then).
- Cross-origin support: web client calls `setBaseUrl(VITE_API_URL)`; unset on Replit (same-origin `/api`). Don't break this when touching App.tsx or custom-fetch.
- **Why root `package.json` pins `packageManager`:** Railway's builder picked pnpm 9 and failed frozen-lockfile; keep the pin in sync with the lockfile's pnpm version.
- clubhub `vite.config.ts` must not *require* PORT at import time — Railway builds without PORT (defaults to 4173; serving platforms inject it).
- Outstanding for real launch: Clerk still uses a development instance on Railway. Production API CORS is restricted to the Nahreo and compatibility web origins.
