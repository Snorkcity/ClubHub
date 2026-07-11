# ClubHub

A soccer club management web app (posts, rosters, scheduling, RSVP, and messaging) for a single club, structured to become multi-club SaaS.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (serves `/api`)
- `pnpm --filter @workspace/clubhub run dev` — run the ClubHub web app (served at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Seed dev data: bundle `lib/db/src/seed.ts` with esbuild into `lib/db/` and run with node (no `tsx` in this repo). The seed is a no-op if a club already exists.
- Required env: `DATABASE_URL`; Clerk keys (`CLERK_*`, `VITE_CLERK_PUBLISHABLE_KEY`); `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (`artifacts/api-server`), routes under `/api`
- Web: React + Vite + Wouter + TanStack Query (`artifacts/clubhub`)
- Auth: Replit-managed Clerk, cookie-based (proxied via `clerkProxyMiddleware`)
- DB: PostgreSQL + Drizzle ORM (`lib/db`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (`lib/api-client-react`, `lib/api-zod`) from `lib/api-spec/openapi.yaml`
- Build: esbuild (CJS bundle)

## Where things live

- DB schema (source of truth): `lib/db/src/schema/` (one file per table, re-exported by `index.ts`)
- API contract (source of truth): `lib/api-spec/openapi.yaml` → generated hooks in `lib/api-client-react`, zod bodies in `lib/api-zod`
- API routes: `artifacts/api-server/src/routes/` (mounted in `routes/index.ts`)
- API helpers: `artifacts/api-server/src/lib/` (`auth.ts` requireAuth + JIT provisioning, `serialize.ts`, `queries.ts` visibility/permissions, `build.ts` response assembly)
- Web pages: `artifacts/clubhub/src/pages/`, layout in `src/components/layout/`, theme in `src/index.css`

## Architecture decisions

- **Lifelong identity model:** every player is one permanent account (login optional); guardians are *linked* via `guardianships` (with `canManage`), never modeled as child sub-profiles. This is the central pillar — see `.agents/memory/`.
- **Roles are contextual:** club-level role on `club_members.role` (Club Admin); per-team roles (manager/coach/player) on `team_members.role`; parent/guardian via guardianship links. The same person can hold different roles on different teams.
- **JIT provisioning:** the first authenticated user with no existing admin becomes Club Admin; users are created locally on first authenticated request.
- **Multi-tenant ready:** tenant-scoped tables carry `clubId` even though only one club exists today.
- **Manual response assembly:** API responses are assembled by hand (not `.parse()`d) to avoid date-format serialization errors; request bodies are validated with generated zod `*Body` schemas.

## Product

Club Admins manage the club, teams, seasons, and directory. Managers/coaches run their teams (posts, events, rosters). Players and guardians see their teams' feed and schedule, RSVP to events (guardians can RSVP on behalf of players they manage), and use team/group chats.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- No `tsx` binary in this repo — run standalone TS scripts by bundling with esbuild (`--packages=external`) into a directory that can resolve the needed `node_modules` (e.g. `lib/db/`), then `node` it.
- Convert body date strings to `new Date()` before inserting into timestamp columns; `iso()` serializes them back out.
- RSVP is an upsert on unique `(eventId, userId)`.
- The db package emits declarations via `tsc --build`; after changing `lib/db/src/schema`, run `pnpm -w run typecheck:libs` so `@workspace/db` consumers see the new exports.
