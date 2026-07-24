---
name: Team switcher & unread model
description: Agreed design for active-team switching and unread tracking (Heja parity)
---

- Active team is client-side only (localStorage `clubhub.activeTeamId`, React context); null = "All teams". No server-side concept of active team.
- Unread model: `team_reads` (user_id, team_id, last_seen_at, unique pair). Unread = posts + team-chat messages newer than lastSeenAt, excluding own-authored. Never-opened teams fall back to a 14-day window; teams with a reads row use their own lastSeenAt even if older.
- **Why:** Heja parity — Scott's 15 teams know Heja's dropdown-with-badges + red dot on the Team tab; year-one goal is zero learning curve.
- Mark-seen fires only after ~2s of actually viewing the team's content (home with that team active, or team detail page) — never on switch itself, to avoid clearing badges the user hasn't read.
- Pins: `pinned_at` timestamp; pins auto-expire 2 days after (re)pinning; staff can re-pin from PostCard, which restarts the clock.
