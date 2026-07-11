---
name: Repo build quirks
description: Non-obvious build/run gotchas in this pnpm monorepo (running scripts, db declarations).
---

# Build & run quirks

**No `tsx` in this repo.** `pnpm exec tsx` fails ("Command tsx not found"). The api-server runs via esbuild (`build.mjs`), not a TS loader. To run a standalone TS script (e.g. a DB seed):

1. Bundle with esbuild, keeping deps external:
   `pnpm --filter @workspace/api-server exec esbuild <path>.ts --bundle --platform=node --format=esm --packages=external --outfile=<dir>/.tmp.mjs`
2. The output must live in a directory whose `node_modules` can resolve the runtime deps. A bundle placed in `/tmp` or the repo root **cannot** resolve `drizzle-orm`/`pg` (pnpm virtual store). Output into `lib/db/` and `node` it from there.

**db declarations are built, not source-resolved.** `@workspace/db` consumers (api-server) typecheck against emitted `.d.ts`, not `lib/db/src`. After editing `lib/db/src/schema`, run `pnpm -w run typecheck:libs` (`tsc --build`) or new exports show as "has no exported member".

**Why:** Both cost multiple failed attempts. Saves rediscovering that the seed pattern and the "missing export" error are environment quirks, not code bugs.
