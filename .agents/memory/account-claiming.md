---
name: Account claiming by email
description: How first-login JIT provisioning attaches a Clerk login to a pre-created person, and the security rules around it.
---

# Account claiming by email (first sign-in)

On first authenticated access, the identity resolver can bridge a Clerk login
to a pre-created login-less person. If no safe claim exists, the account stays
unprovisioned until the user explicitly creates a new club through onboarding.

**Rules (do not weaken):**
- Identity (name + email + verification status) is read from the **Clerk
  backend** (`clerkClient.users.getUser`), NOT from session claims — the session
  token often omits email entirely.
- Only a **verified** primary email may claim a pre-created person.
- **Fail closed on ambiguity:** link only when exactly ONE login-less row across
  all clubs matches the email. Zero or multiple matches leave the identity
  unprovisioned; never guess a club or bind an ambiguous identity.
- A successful claim must have a matching ordinary club-membership row so
  invitation and directory-created people can pass authorization immediately.
- An unmatched identity must use explicit first-time setup to create an
  isolated club. Never select a global/default/first existing club.

**Why:** auto-claiming by unverified or duplicated email is an account-takeover /
mis-attribution risk, especially in a family/club context where relatives share
contact info. A code review flagged this as blocking; the verified + single-match
guards are the mitigation.

**How to apply:** Resolve or safely claim identity before protected club access.
Treat onboarding as the only path that can provision an unmatched account.
