---
name: UX direction — mobile-first, Heja-familiar
description: Agreed UX priorities for ClubHub — phone interface comes first; Heja is the familiarity baseline (not to copy) for the club's 15 teams.
---

# UX direction

**Mobile-first is the priority.** Nearly all coaches/parents/players access on phones; desktop is secondary. Design and verify every surface at phone viewport first (bottom nav, thumb-reach actions), then adapt up to desktop.

**Heja is the familiarity baseline** — the club's 15 teams already use it. Goal: "feels like Heja to a parent, feels like much more to the club admin." Not copying; matching learned habits.

Patterns to adopt (from user's Heja screenshots, July 2026):
- Feed-first team home with cover photo + quick links (Members, Photos, Team Info).
- RSVP count chip embedded on feed posts (e.g. "52/58 →").
- Event RSVP breakdown: Going / Not going / Unanswered, "N not seen" badges, and a **Remind now** nudge button (most-loved manager feature).
- Schedule grouped by time buckets ("Next 7 days / Later in July / August"), own RSVP status inline on each card.
- Private staff-only notes on events.
- Simple 4-tab bottom nav on mobile: Team / Schedule / Messages / You.

**Why:** user finds the current admin-centric interface overwhelming; role-appropriate simplicity is the fix. Plan is a "Heja familiarity pass" after the GitHub/Railway migration, with canvas layout comparisons first.

## App icon (July 24, 2026)
Scott chose the sport-neutral "team huddle" mark (three figures circling, navy #0b1f4b / lime / white) — deliberately not soccer-specific so ClubHub can expand to other sports. The maskable (Android) icon variant must keep the artwork inside ~75% of the canvas because Android crops/squishes into a circle or squircle.

## RSVP model (July 24, 2026)
Two-option RSVP only: "Going" (green) / "Not" (red) — no Maybe in the UI ('maybe' stays in the API enum for legacy rows; counts show maybe merged into Not). Tapping Not saves immediately, then an optional reason field appears (rsvps.reason, stored only for status=out). Teams nav tab removed — team switcher dropdown replaces it; roster admin still lives at /teams/:id routes.
**Reminder:** Railway prod DB needs `ALTER TABLE rsvps ADD COLUMN reason text` before the next push goes live.

## Profile privacy & mobile nav (July 24, 2026)
- Per-field privacy on phone/email/bio: everyone | admins | private ("only me" beats admins). Enforced in toPerson(u, viewer?, {full}) — no viewer = 'everyone'-only redaction (safe default); never call .map(toPerson) directly (index becomes viewer).
- Mobile has NO hamburger: avatar dropdown in top bar holds Profile & Settings, staff Directory/Check-in, logout. Bottom tabs — players: Home/Schedule/Check-in/Messages; staff: Home/Schedule/Messages/Monitoring (monitoring team must be one they coach/manage; admins may use active team).
- AU phone format in placeholders (0412 345 678); later: derive formats from club country setting.
