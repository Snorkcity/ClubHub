---
name: Railway unique reconciliation
description: Safe response when Drizzle misreads an existing Railway UNIQUE constraint and offers table truncation.
---

Use an explicitly named unique index when Drizzle repeatedly proposes adding an
already-present UNIQUE constraint on Railway PostgreSQL. Convert within one
transaction only after a duplicate-pair check that fails closed; never accept
the truncation prompt.

**Why:** Drizzle 0.31 can fail to reconcile a manually added UNIQUE constraint
on Railway's PostgreSQL version even when its name and columns match. The
equivalent named unique index is recognized through a different catalog path
and provides the same duplicate protection.

**How to apply:** When this exact drift appears, first verify there are no
duplicate key tuples, then use a scoped transaction that drops only the
same-named constraint and creates the equivalent named unique index. Re-run
schema reconciliation and confirm it advances past that table without proposing
truncation.