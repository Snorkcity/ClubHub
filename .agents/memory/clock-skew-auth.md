---
name: Client clock skew breaks auth
description: Sudden all-requests-401 with valid-looking cookies can be the user's device clock, not the code
---
If every API request 401s instantly while the Clerk client thinks it's signed in, decode the __session JWT's exp: tokens "expired" even right after re-login mean the *user's device clock* is running slow (server clock verified against Clerk's Date header).
**Why:** July 2026 outage — Scott's machine was ~24 min slow; nothing in the code had changed.
**How to apply:** Dev server tolerates drift via `clockSkewInMs` (30 min, dev-only) in the clerkMiddleware options in the api-server app setup. Production stays strict. To diagnose again: temporarily decode the __session cookie JWT in the 401 branch and log iss/exp vs server time.

**Update (2026-07-16):** Server-side auth verified fully working — a session created via Clerk backend API + Bearer token hit /api/me 200 and auto-claimed the player1 person row. Remaining 401s are purely client-side: the browser keeps sending a stale, never-refreshed session cookie. Next steps if it recurs: time.is clock check, clear site cookies, open app in full browser tab (not embedded preview). Temp debug logging in the API 401 branch is still in place — remove once the browser issue is resolved.

**Resolved diagnosis (2026-07-16 pm):** Not clock skew after all. Browser console showed clerk-js Frontend API calls (token refresh/touch/signOut) receiving an HTML page instead of JSON — something on the user's desktop/network (ad-blocker extension, antivirus web protection, or DNS filter) intercepts requests to the clerk.accounts.dev domain, so the session token never refreshes and goes stale forever. Phone on unfiltered network works fine. If instant-401s with an ever-more-expired token recur, check for HTML responses from the Clerk Frontend API in browser console before suspecting clocks or keys.

**Account-switch identity fix (2026-07-21):** After switching Clerk accounts, the browser could keep the old __session cookie, so the API answered as the previous user while the Clerk widget showed the new one (screenshot: player1 email + "Club Admin" sidebar). Fix: web app now registers an auth token getter (active Clerk user's getToken) so every API call sends Authorization: Bearer; Clerk middleware prefers header over cookie, making identity mismatch impossible. Cookie is only a fallback when getToken returns null momentarily.
