---
name: Image storage strategy
description: Why user-uploaded images live in Postgres and are served via signed URLs.
---

# Images in Postgres, delivered via signed URLs

Uploaded images (team banners, and future attachments) are stored in the Postgres DB rather than object storage, and served through signed, expiring URLs handed out only by authenticated APIs.

**Why:** prod is Railway — Replit's object storage (GCS sidecar auth) doesn't work there, and the DB is the only storage both environments share. `<img>` tags can't attach auth headers cross-origin on Railway, so an authenticated fetch is impossible for images; unauthenticated serving would expose photos of minors behind sequential IDs (a completion review rejected that). Signed HMAC URLs (keyed on SESSION_SECRET, quantized daily expiry so they stay cacheable) preserve club-member-only access.

**How to apply:** reuse this pattern for new image uploads: resize client-side before upload so JSON payloads stay small, and never add an unauthenticated image route. Keep the express.json body limit above the worst-case aggregate (per-image cap × max images, base64 ≈ ×1.33) — a completion review rejected a 6×4MB contract behind an 8MB body limit. Threshold decision (Aug 2026, when post_photos was ~empty): stay in Postgres below 1 GiB of post photos; at 1 GiB plan the move to an S3-compatible store (works on both platforms, keep signed delivery) and complete it before 5 GiB. A club-admin storage endpoint reports sizes against these thresholds. Integration coverage lives in the scripts workspace smoke test (`smoke:banner`) — extend it for new image endpoints.
