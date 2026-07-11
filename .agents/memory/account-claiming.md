---
name: Account claiming by email
description: How first-login JIT provisioning attaches a Clerk login to a pre-created person, and the security rules around it.
---

# Account claiming by email (first sign-in)

On first authenticated request, `requireAuth` bridges a Clerk login to a local
`users` row. Admins/seed can pre-create login-less people (`clerkUserId` NULL).
To let those people "claim" their real login on first sign-in, JIT provisioning
matches by email and attaches the `clerkUserId` to the existing row.

**Rules (do not weaken):**
- Identity (name + email + verification status) is read from the **Clerk
  backend** (`clerkClient.users.getUser`), NOT from session claims — the session
  token often omits email entirely.
- Only a **verified** primary email may claim a pre-created person.
- **Fail closed on ambiguity:** link only when exactly ONE login-less,
  same-club row matches the email. Zero or multiple matches → create a fresh
  account instead (never bind an ambiguous identity).

**Why:** auto-claiming by unverified or duplicated email is an account-takeover /
mis-attribution risk, especially in a family/club context where relatives share
contact info. A code review flagged this as blocking; the verified + single-match
guards are the mitigation.

**Follow-up (not yet done):** a DB-level uniqueness policy for normalized email
among `clerkUserId IS NULL` rows per club would enforce this at the data layer;
current protection is app-level only.
