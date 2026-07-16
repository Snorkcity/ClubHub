---
name: Client clock skew breaks auth
description: Sudden all-requests-401 with valid-looking cookies can be the user's device clock, not the code
---
If every API request 401s instantly while the Clerk client thinks it's signed in, decode the __session JWT's exp: tokens "expired" even right after re-login mean the *user's device clock* is running slow (server clock verified against Clerk's Date header).
**Why:** July 2026 outage — Scott's machine was ~24 min slow; nothing in the code had changed.
**How to apply:** Dev server tolerates drift via `clockSkewInMs` (30 min, dev-only) in the clerkMiddleware options in the api-server app setup. Production stays strict. To diagnose again: temporarily decode the __session cookie JWT in the 401 branch and log iss/exp vs server time.
