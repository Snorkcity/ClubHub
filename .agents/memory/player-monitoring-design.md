---
name: Player Monitoring module — agreed design
description: Product decisions for the RPE/wellness monitoring module (capture, dashboard, reporting, privacy). Agreed with user July 2026; build starts after GitHub/Railway migration.
---

# Player Monitoring module — agreed decisions

**Build order:** capture screens → live dashboard → AI summary layer → reports (on-demand only, never scheduled).

**Capture**
- RPE (0–10) after training/matches, prompted ~15–30 min after event end; session load = RPE × minutes (auto, minutes from the scheduled event).
- Wellness: short daily check (~5 questions, 15–60 sec). RPE + wellness can be completed from the same screen, but are separate moments.
- Players see their own trends (user approved — good for buy-in).

**Dashboard (coach/assistant/analyst)**
- Always-live snapshot, checked before sessions; time filters 24h / 7d / 14d / 28d, default 7d.
- Grid: players down the left, metrics across top, colour-coded flags.
- Flags are baseline-relative (change from the player's own norm), not absolute scores. Use acute (7d) vs chronic (28d) load comparison (ACWR-style); algorithm to be validated with user's physio/lecturer — prepare an evidence-backed draft for them.
- AI summary generated on open from the selected window; items clickable to drill in.
- Retention: keep all data forever (season reports); dashboard reads a rolling window (28d chronic baseline powering the 7d story).

**Privacy / minors**
- Menstrual-cycle tracking: 16+ only, opt-in, player-visible by default with explicit consent. Under 16 gets standard wellness only.
- Parents are involved for young players (guardianship model supports parent submitting on behalf).

**Status (July 2026):** capture (daily wellness + post-session RPE, guardian on-behalf supported) and the staff dashboard (window filters, baseline-relative flags, rolling ACWR with >2-week chronic-base guard) are BUILT. Wellness scores stored 1–5 where higher is always better (soreness 5 = no soreness). Teams 4 (U13 Rovers) & 5 (U13 Falcons) carry ~5 weeks of seeded test data with two story players: player1@ = load-spike ALERT, player2@ = wellness WATCH. Flag thresholds are a draft pending physio review. Still to build: AI summary layer, reports.

**Long-term direction:** one player-management screen combining availability, attendance, RPE, wellness, GPS, injuries, minutes played, load, AI risk indicators. References: AIS athlete-monitoring conventions, Foster sRPE, Gabbett ACWR (contested in recent literature — verify with live sources when designing flags).
