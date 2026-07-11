---
name: Lifelong identity model
description: How ClubHub models players, guardians, and roles — the central data-model decision.
---

# Lifelong identity & contextual roles

**Rule:** Every person (including children) is one permanent account in `users` (login optional — `clerkUserId` is nullable). Guardians are *linked* to players through the `guardianships` table (`guardianId`, `playerId`, `relationship`, `canManage`). Never model a child as a sub-profile of a parent account.

Roles are contextual, not a single field on the user:
- Club-level admin: `club_members.role` (Club Admin).
- Per-team roles: `team_members.role` (manager / coach / player). The same person can hold different roles on different teams.
- Parent/guardian: expressed only via guardianship links.

**Why:** The product must follow a player across teams, seasons, and eventually clubs for their whole career, and let a guardian manage a minor without the child needing a login. Sub-profiles would fracture a player's history and block later features (multi-year reports, transfers, a child aging into their own login). `canManage` gates actions-on-behalf (e.g. RSVP for a minor) via `canActFor` in the api-server queries helper.

**How to apply:** When adding features that touch a person, resolve identity through `users` + `guardianships`, never by nesting people. Permission to act for someone else = self, or a guardianship with `canManage`, or club admin. Keep `clubId` on tenant-scoped tables for the eventual multi-club move.
