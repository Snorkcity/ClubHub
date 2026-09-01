---
name: Validation steps vs the Project run button
description: Keep validation workflows out of the Project run button; API tests must use a disposable local Postgres.
---

# Validation steps and the run button

- Never define an explicit `Project` workflow in `.replit` when registering validation commands — the managed run button groups artifact services automatically; an explicit one shadows it.
- API tests must never touch the shared database; they run on a throwaway local Postgres cluster torn down after each run (and the suite fails closed if pointed anywhere else).

**Why:** an explicit Project workflow once left the Run button starting only tests; tests against the shared DB mutate real club data.
**How to apply:** when adding validation commands or API test suites, keep validation as its own `isValidation` workflow and use the disposable-DB test runner in the api-server artifact.
