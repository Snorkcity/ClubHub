---
name: Railway is production
description: ClubHub prod runs on Railway; Replit is dev. Deploy flow and env differences.
---

# Railway production setup (since July 2026)

- **Replit = dev, Railway = prod.** Deploy flow: commit → `gitPush` to `github.com/Snorkcity/ClubHub` (origin) → Railway auto-rebuilds both services.
- Railway project has: Postgres, `api` service (was card "ClubHub", domain `clubhub-production-162a.up.railway.app`), `web` service (was card "valiant-love"). Full setup in repo `DEPLOY.md`.
- Prod DB reachable from Replit via secret `RAILWAY_DATABASE_URL` (schema pushed + full data copy done 2026-07-24; databases are independent since then).
- Cross-origin support: web client calls `setBaseUrl(VITE_API_URL)`; unset on Replit (same-origin `/api`). Don't break this when touching App.tsx or custom-fetch.
- **Why root `package.json` pins `packageManager`:** Railway's builder picked pnpm 9 and failed frozen-lockfile; keep the pin in sync with the lockfile's pnpm version.
- clubhub `vite.config.ts` must not *require* PORT at import time — Railway builds without PORT (defaults to 4173; serving platforms inject it).
- Outstanding for real launch: Clerk still a development instance; CORS on api reflects any origin — tighten to the web domain when URLs are final.
