---
name: Railway is production
description: Squadly prod runs on Railway; Replit is dev. Deploy flow and env differences.
---

# Railway production setup (since July 2026)

- **Replit = dev, Railway = prod.** Deploy flow: commit → `gitPush` to `github.com/Snorkcity/ClubHub` (origin) → Railway auto-rebuilds both services.
- Railway project is named Squadly and has Postgres, API, and web services. Production web uses `clubhub.gameinsights.com.au` while legacy Railway domains remain active; API health is on `clubhub-production-162a.up.railway.app/api/healthz`. Full setup is in `DEPLOY.md`.
- Prod drizzle-kit push against Railway may prompt to truncate unrelated populated tables while reconciling drift. Never accept; apply scoped additive DDL transactionally with `psql`, then verify only intended objects.
- Prod DB reachable from Replit via secret `RAILWAY_DATABASE_URL` (schema pushed + full data copy done 2026-07-24; databases are independent since then).
- Cross-origin support: web client calls `setBaseUrl(VITE_API_URL)`; unset on Replit (same-origin `/api`). Don't break this when touching App.tsx or custom-fetch.
- **Why root `package.json` pins `packageManager`:** Railway's builder picked pnpm 9 and failed frozen-lockfile; keep the pin in sync with the lockfile's pnpm version.
- clubhub `vite.config.ts` must not *require* PORT at import time — Railway builds without PORT (defaults to 4173; serving platforms inject it).
- Outstanding for real launch: Clerk still a development instance; CORS on api reflects any origin — tighten to the web domain when URLs are final.
