import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import {
  db,
  eventsTable,
  teamMembersTable,
  usersTable,
  rsvpsTable,
  rpeEntriesTable,
  wellnessEntriesTable,
  extraSessionsTable,
  type RpeEntry,
  type WellnessEntry,
  type ExtraSession,
} from "@workspace/db";
import {
  SubmitWellnessBody,
  SubmitRpeBody,
  LogExtraSessionBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { buildEvents } from "../lib/build";
import { getWardIds, canActFor } from "../lib/queries";
import { isTeamStaff, isTeamMember, getTeamInClub } from "../lib/authz";
import { toPerson } from "../lib/serialize";

/** Tenant guard: is this user a member of the given club? */
async function isInClub(userId: number, clubId: number): Promise<boolean> {
  const [u] = await db
    .select({ clubId: usersTable.clubId })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return !!u && u.clubId === clubId;
}

const router: IRouter = Router();

const WELLNESS_METRICS = [
  "sleepQuality",
  "energy",
  "soreness",
  "stress",
  "mood",
] as const;

export function sessionFrequencyFlag(
  currentSessions: number,
  priorThreeWeekSessions: number,
  currentExternalSessions: number,
): { metric: string; severity: "watch" | "alert"; message: string } | null {
  const usualSessions = priorThreeWeekSessions / 3;
  if (usualSessions <= 0) return null;
  const increase = currentSessions - usualSessions;
  const ratio = currentSessions / usualSessions;
  if (increase < 2 || ratio < 1.5) return null;
  const externalNote = currentExternalSessions
    ? `; ${currentExternalSessions} external`
    : "";
  return {
    metric: "sessions",
    severity: increase >= 3 && ratio >= 1.75 ? "alert" : "watch",
    message: `Session frequency up: ${currentSessions} this week vs usual ~${Math.round(usualSessions * 10) / 10}${externalNote}`,
  };
}

function toWellness(w: WellnessEntry) {
  return {
    id: w.id,
    personId: w.userId,
    entryDate: w.entryDate,
    sleepQuality: w.sleepQuality,
    energy: w.energy,
    soreness: w.soreness,
    stress: w.stress,
    mood: w.mood,
  };
}

function toRpe(r: RpeEntry) {
  return {
    id: r.id,
    eventId: r.eventId,
    personId: r.userId,
    rpe: r.rpe,
    minutes: r.minutes,
    load: r.rpe * r.minutes,
  };
}

function toExtraSession(s: ExtraSession) {
  return {
    id: s.id,
    personId: s.userId,
    sessionDate: s.sessionDate,
    kind: s.kind as "rep" | "school" | "other",
    label: s.label,
    rpe: s.rpe,
    minutes: s.minutes,
    load: s.rpe * s.minutes,
  };
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function eventMinutes(startsAt: Date, endsAt: Date | null): number {
  if (!endsAt) return 90;
  const mins = Math.round((endsAt.getTime() - startsAt.getTime()) / 60000);
  return Math.min(300, Math.max(15, mins));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Check-in status for the current user and any linked players they manage. */
router.get("/monitoring/checkin", requireAuth, async (req, res) => {
  const { localUser } = req as AuthedRequest;
  const date = String(req.query.date ?? "");
  if (!ISO_DATE.test(date))
    return res.status(400).json({ error: "date must be YYYY-MM-DD" });

  const wardIds = await getWardIds(localUser.id);
  const candidateIds = [localUser.id, ...wardIds];

  // Only people who are players on at least one team check in.
  const playerRows = await db
    .select({
      userId: teamMembersTable.userId,
      teamId: teamMembersTable.teamId,
    })
    .from(teamMembersTable)
    .where(
      and(
        inArray(teamMembersTable.userId, candidateIds),
        eq(teamMembersTable.role, "player"),
      ),
    );
  const playerTeams = new Map<number, number[]>();
  for (const row of playerRows) {
    const list = playerTeams.get(row.userId) ?? [];
    list.push(row.teamId);
    playerTeams.set(row.userId, list);
  }
  const subjectIds = candidateIds.filter((id) => playerTeams.has(id));
  if (subjectIds.length === 0) return res.json({ subjects: [] });

  const users = await db
    .select()
    .from(usersTable)
    .where(inArray(usersTable.id, subjectIds));
  const userById = new Map(users.map((u) => [u.id, u]));

  // Wellness for the last 7 days (incl. the requested date).
  const weekStart = dateStr(new Date(new Date(`${date}T12:00:00Z`).getTime() - 6 * 86400000));
  const wellness = await db
    .select()
    .from(wellnessEntriesTable)
    .where(
      and(
        inArray(wellnessEntriesTable.userId, subjectIds),
        gte(wellnessEntriesTable.entryDate, weekStart),
        lte(wellnessEntriesTable.entryDate, date),
      ),
    )
    .orderBy(desc(wellnessEntriesTable.entryDate));

  // Recent finished sessions (last 72h) that still need an RPE.
  const allTeamIds = [...new Set(playerRows.map((r) => r.teamId))];
  const recentEvents = await db
    .select()
    .from(eventsTable)
    .where(
      and(
        inArray(eventsTable.teamId, allTeamIds),
        inArray(eventsTable.type, ["training", "game"]),
        isNull(eventsTable.cancelledAt),
        gte(eventsTable.startsAt, daysAgo(3)),
        lte(eventsTable.startsAt, new Date()),
      ),
    )
    .orderBy(desc(eventsTable.startsAt));
  const eventIds = recentEvents.map((e) => e.id);
  const existingRpe = eventIds.length
    ? await db
        .select()
        .from(rpeEntriesTable)
        .where(
          and(
            inArray(rpeEntriesTable.eventId, eventIds),
            inArray(rpeEntriesTable.userId, subjectIds),
          ),
        )
    : [];
  const hasRpe = new Set(existingRpe.map((r) => `${r.eventId}:${r.userId}`));
  // Don't prompt for sessions the player said they weren't attending.
  const outRsvps = eventIds.length
    ? await db
        .select({ eventId: rsvpsTable.eventId, userId: rsvpsTable.userId })
        .from(rsvpsTable)
        .where(
          and(
            inArray(rsvpsTable.eventId, eventIds),
            inArray(rsvpsTable.userId, subjectIds),
            eq(rsvpsTable.status, "out"),
          ),
        )
    : [];
  const rsvpOut = new Set(outRsvps.map((r) => `${r.eventId}:${r.userId}`));
  // Extra (non-club) sessions logged in the last 7 days.
  const extras = await db
    .select()
    .from(extraSessionsTable)
    .where(
      and(
        inArray(extraSessionsTable.userId, subjectIds),
        gte(extraSessionsTable.sessionDate, weekStart),
      ),
    )
    .orderBy(desc(extraSessionsTable.sessionDate), desc(extraSessionsTable.id));
  const builtEvents = await buildEvents(recentEvents, localUser.id);
  const builtById = new Map(builtEvents.map((e: { id: number }) => [e.id, e]));

  const subjects = subjectIds.map((id) => {
    const u = userById.get(id)!;
    const teams = playerTeams.get(id) ?? [];
    const myWellness = wellness.filter((w) => w.userId === id);
    const today = myWellness.find((w) => w.entryDate === date);
    const pending = recentEvents
      .filter(
        (e) =>
          teams.includes(e.teamId) &&
          !hasRpe.has(`${e.id}:${id}`) &&
          !rsvpOut.has(`${e.id}:${id}`) &&
          // only prompt once the session has (roughly) finished
          (e.endsAt ? e.endsAt : new Date(e.startsAt.getTime() + 60 * 60000)) <
            new Date(),
      )
      .map((e) => ({
        event: builtById.get(e.id),
        defaultMinutes: eventMinutes(e.startsAt, e.endsAt),
      }));
    return {
      person: toPerson(u),
      isSelf: id === localUser.id,
      todayWellness: today ? toWellness(today) : undefined,
      pendingRpe: pending,
      weekWellness: myWellness.map(toWellness),
      recentExtraSessions: extras
        .filter((s) => s.userId === id)
        .map(toExtraSession),
    };
  });

  return res.json({ subjects });
});

/** Submit (or update) the daily wellness check. */
router.put("/wellness", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const body = SubmitWellnessBody.parse(req.body);
  if (!ISO_DATE.test(body.entryDate))
    return res.status(400).json({ error: "entryDate must be YYYY-MM-DD" });

  // The client sends its LOCAL calendar date. Compare date strings so users
  // ahead of UTC aren't rejected: allow up to 2 days back (late entries) and
  // at most 1 day ahead of the server's UTC date (timezone skew), lexicographic
  // comparison is safe for YYYY-MM-DD.
  const minDate = dateStr(daysAgo(2));
  const maxDate = dateStr(new Date(Date.now() + 86400000));
  if (body.entryDate < minDate || body.entryDate > maxDate)
    return res
      .status(400)
      .json({ error: "Wellness can only be logged for the last few days" });

  const targetId = body.onBehalfOfPersonId ?? localUser.id;
  if (!(await canActFor(localUser.id, targetId, isClubAdmin)))
    return res
      .status(403)
      .json({ error: "You cannot submit for this person" });
  if (!(await isInClub(targetId, clubId)))
    return res
      .status(403)
      .json({ error: "You cannot submit for this person" });

  const [entry] = await db
    .insert(wellnessEntriesTable)
    .values({
      userId: targetId,
      entryDate: body.entryDate,
      sleepQuality: body.sleepQuality,
      energy: body.energy,
      soreness: body.soreness,
      stress: body.stress,
      mood: body.mood,
      submittedById: localUser.id,
    })
    .onConflictDoUpdate({
      target: [wellnessEntriesTable.userId, wellnessEntriesTable.entryDate],
      set: {
        sleepQuality: body.sleepQuality,
        energy: body.energy,
        soreness: body.soreness,
        stress: body.stress,
        mood: body.mood,
        submittedById: localUser.id,
      },
    })
    .returning();
  return res.json(toWellness(entry));
});

/** Submit (or update) post-session RPE for an event. */
router.put("/events/:eventId/rpe", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const eventId = Number(req.params.eventId);
  const body = SubmitRpeBody.parse(req.body);

  const [event] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId));
  if (!event) return res.status(404).json({ error: "Event not found" });
  // Tenant guard: the event's team must belong to the requester's club.
  if (!(await getTeamInClub(event.teamId, clubId)))
    return res.status(404).json({ error: "Event not found" });
  if (event.type !== "training" && event.type !== "game")
    return res
      .status(400)
      .json({ error: "RPE only applies to trainings and games" });
  if (event.startsAt > new Date())
    return res.status(400).json({ error: "This session has not happened yet" });

  const targetId = body.onBehalfOfPersonId ?? localUser.id;
  if (!(await canActFor(localUser.id, targetId, isClubAdmin)))
    return res
      .status(403)
      .json({ error: "You cannot submit for this person" });
  if (!(await isTeamMember(targetId, event.teamId)))
    return res.status(400).json({ error: "That person is not on this team" });

  const minutes = body.minutes ?? eventMinutes(event.startsAt, event.endsAt);
  const [entry] = await db
    .insert(rpeEntriesTable)
    .values({
      eventId,
      userId: targetId,
      rpe: body.rpe,
      minutes,
      submittedById: localUser.id,
    })
    .onConflictDoUpdate({
      target: [rpeEntriesTable.eventId, rpeEntriesTable.userId],
      set: { rpe: body.rpe, minutes, submittedById: localUser.id },
    })
    .returning();
  return res.json(toRpe(entry));
});

/** Log a session outside the club calendar (rep squad, school sport, etc). */
router.post("/extra-sessions", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const body = LogExtraSessionBody.parse(req.body);
  if (!ISO_DATE.test(body.sessionDate))
    return res.status(400).json({ error: "sessionDate must be YYYY-MM-DD" });

  // Same local-calendar-date rules as wellness, but allow a week of backfill —
  // rep sessions are often logged later. Never the future.
  const minDate = dateStr(daysAgo(7));
  const maxDate = dateStr(new Date(Date.now() + 86400000));
  if (body.sessionDate < minDate || body.sessionDate > maxDate)
    return res
      .status(400)
      .json({ error: "Extra sessions can only be logged for the last week" });

  const targetId = body.onBehalfOfPersonId ?? localUser.id;
  if (
    !(await canActFor(localUser.id, targetId, isClubAdmin)) ||
    !(await isInClub(targetId, clubId))
  )
    return res.status(403).json({ error: "You cannot submit for this person" });

  const [entry] = await db
    .insert(extraSessionsTable)
    .values({
      userId: targetId,
      sessionDate: body.sessionDate,
      kind: body.kind,
      label: body.label ?? null,
      rpe: body.rpe,
      minutes: body.minutes,
      submittedById: localUser.id,
    })
    .returning();
  return res.json(toExtraSession(entry));
});

/** Delete an extra session (the player it belongs to, or their guardian). */
router.delete("/extra-sessions/:extraSessionId", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const id = Number(req.params.extraSessionId);
  const [entry] = await db
    .select()
    .from(extraSessionsTable)
    .where(eq(extraSessionsTable.id, id));
  if (!entry) return res.status(404).json({ error: "Not found" });
  if (
    !(await canActFor(localUser.id, entry.userId, isClubAdmin)) ||
    !(await isInClub(entry.userId, clubId))
  )
    return res.status(403).json({ error: "You cannot delete this entry" });
  await db.delete(extraSessionsTable).where(eq(extraSessionsTable.id, id));
  return res.status(204).end();
});

/** Live monitoring dashboard for a team (staff only). */
router.get("/teams/:teamId/monitoring", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const teamId = Number(req.params.teamId);
  if (!(await isTeamStaff(localUser.id, teamId, clubId, isClubAdmin)))
    return res
      .status(403)
      .json({ error: "Only team staff can view monitoring" });

  const windowRaw = Number(req.query.window ?? 7);
  const windowDays = [1, 7, 14, 28].includes(windowRaw) ? windowRaw : 7;
  const now = new Date();

  const roster = await db
    .select({ u: usersTable })
    .from(teamMembersTable)
    .innerJoin(usersTable, eq(teamMembersTable.userId, usersTable.id))
    .where(
      and(
        eq(teamMembersTable.teamId, teamId),
        eq(teamMembersTable.role, "player"),
      ),
    );
  const players = roster.map((r) => r.u);
  const playerIds = players.map((p) => p.id);
  if (playerIds.length === 0)
    return res.json({
      teamId,
      windowDays,
      generatedAt: now.toISOString(),
      players: [],
    });

  // Wellness: pull 28 days for baselines regardless of window.
  const since28 = dateStr(daysAgo(28));
  const wellness = await db
    .select()
    .from(wellnessEntriesTable)
    .where(
      and(
        inArray(wellnessEntriesTable.userId, playerIds),
        gte(wellnessEntriesTable.entryDate, since28),
      ),
    );

  // Load: RPE entries joined to events in the last 28 days (any team —
  // training load is about the athlete, not just this team's sessions).
  const loadRows = await db
    .select({ r: rpeEntriesTable, startsAt: eventsTable.startsAt })
    .from(rpeEntriesTable)
    .innerJoin(eventsTable, eq(rpeEntriesTable.eventId, eventsTable.id))
    .where(
      and(
        inArray(rpeEntriesTable.userId, playerIds),
        gte(eventsTable.startsAt, daysAgo(28)),
        lte(eventsTable.startsAt, now),
      ),
    );

  // Extra (non-club) sessions count toward total workload too.
  const extraRows = await db
    .select()
    .from(extraSessionsTable)
    .where(
      and(
        inArray(extraSessionsTable.userId, playerIds),
        gte(extraSessionsTable.sessionDate, since28),
      ),
    );

  const windowStart = dateStr(daysAgo(windowDays - 1)); // window includes today
  const result = players.map((p) => {
    const mine = wellness.filter((w) => w.userId === p.id);
    const inWindow = mine.filter((w) => w.entryDate >= windowStart);

    const avg = (vals: number[]) =>
      vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const round1 = (v: number | null) =>
      v === null ? null : Math.round(v * 10) / 10;

    const metricAvgs: Record<string, number | null> = {};
    for (const m of WELLNESS_METRICS) {
      metricAvgs[m] = round1(avg(inWindow.map((w) => w[m])));
    }
    const composite = round1(
      avg(inWindow.flatMap((w) => WELLNESS_METRICS.map((m) => w[m]))),
    );
    const baseline = round1(
      avg(mine.flatMap((w) => WELLNESS_METRICS.map((m) => w[m]))),
    );

    const myLoad = loadRows.filter((row) => row.r.userId === p.id);
    const myExtras = extraRows.filter((s) => s.userId === p.id);
    const sum = (rows: typeof myLoad) =>
      rows.reduce((a, row) => a + row.r.rpe * row.r.minutes, 0);
    const sumExtras = (rows: typeof myExtras) =>
      rows.reduce((a, s) => a + s.rpe * s.minutes, 0);
    // Extra sessions store a local calendar day; anchor them at midday so
    // they use the SAME rolling cutoffs as event timestamps everywhere.
    const extraTime = (s: (typeof myExtras)[number]) =>
      new Date(`${s.sessionDate}T12:00:00Z`).getTime();
    const cut7 = daysAgo(7).getTime();
    const cutWin = daysAgo(windowDays).getTime();
    const acuteLoadRows = myLoad.filter((row) => row.startsAt >= daysAgo(7));
    const acuteExtraRows = myExtras.filter((s) => extraTime(s) >= cut7);
    const priorLoadRows = myLoad.filter(
      (row) => row.startsAt >= daysAgo(28) && row.startsAt < daysAgo(7),
    );
    const priorExtraRows = myExtras.filter(
      (s) => extraTime(s) >= daysAgo(28).getTime() && extraTime(s) < cut7,
    );
    const extraAcute = sumExtras(acuteExtraRows);
    const acute = sum(acuteLoadRows) + extraAcute;
    const chronicTotal = sum(myLoad) + sumExtras(myExtras);
    const chronicWeekly = chronicTotal > 0 ? chronicTotal / 4 : null;
    const windowExternalLoad = sumExtras(
      myExtras.filter((s) => extraTime(s) >= cutWin),
    );
    const windowLoad =
      sum(myLoad.filter((row) => row.startsAt >= daysAgo(windowDays))) +
      windowExternalLoad;
    // ACWR needs a meaningful chronic base: require >2 weeks of history.
    const allTimes = [
      ...myLoad.map((row) => row.startsAt.getTime()),
      ...myExtras.map(extraTime),
    ];
    const oldest = allTimes.length ? Math.min(...allTimes) : null;
    const hasChronicBase =
      chronicWeekly !== null &&
      oldest !== null &&
      oldest < daysAgo(14).getTime();
    const acwr = hasChronicBase
      ? Math.round((acute / chronicWeekly!) * 100) / 100
      : null;

    const flags: { metric: string; severity: string; message: string }[] = [];
    if (acwr !== null && acwr >= 1.5)
      flags.push({
        metric: "load",
        severity: "alert",
        message: `Load spike: this week is ${acwr}× their 4-week norm`,
      });
    else if (acwr !== null && acwr >= 1.3)
      flags.push({
        metric: "load",
        severity: "watch",
        message: `Load rising: ${acwr}× their 4-week norm`,
      });
    // A load spike can come from harder sessions OR simply doing many more of
    // them. Surface frequency independently so a coach can see the likely
    // cause, especially when school/rep/private sessions are stacking up.
    const frequencyFlag = sessionFrequencyFlag(
      acuteLoadRows.length + acuteExtraRows.length,
      priorLoadRows.length + priorExtraRows.length,
      acuteExtraRows.length,
    );
    if (frequencyFlag) flags.push(frequencyFlag);
    if (composite !== null && baseline !== null) {
      const delta = composite - baseline;
      if (delta <= -1)
        flags.push({
          metric: "wellness",
          severity: "alert",
          message: `Wellness well below their norm (${composite} vs ${baseline})`,
        });
      else if (delta <= -0.5)
        flags.push({
          metric: "wellness",
          severity: "watch",
          message: `Wellness below their norm (${composite} vs ${baseline})`,
        });
    }
    for (const m of WELLNESS_METRICS) {
      const v = metricAvgs[m];
      if (v !== null && v <= 2)
        flags.push({
          metric: m,
          severity: v <= 1.5 ? "alert" : "watch",
          message:
            m === "soreness"
              ? "Reporting heavy soreness"
              : m === "sleepQuality"
                ? "Sleeping poorly"
                : m === "energy"
                  ? "Very fatigued"
                  : m === "stress"
                    ? "High stress"
                    : "Low mood",
        });
    }

    const lastWellness = mine.length
      ? mine.reduce((a, b) => (a.entryDate > b.entryDate ? a : b)).entryDate
      : null;

    // Weekly history: 4 rolling 7-day buckets ending now, oldest first.
    const weeklyHistory = [3, 2, 1, 0].map((i) => {
      const from = daysAgo(7 * (i + 1)).getTime();
      const to = daysAgo(7 * i).getTime();
      const evts = myLoad.filter(
        (row) => row.startsAt.getTime() > from && row.startsAt.getTime() <= to,
      );
      const extras = myExtras.filter(
        (s) => extraTime(s) > from && extraTime(s) <= to,
      );
      // Anchor wellness entry dates at midday (same convention as extra
      // sessions) so every metric in a row uses the SAME rolling bounds.
      const wellnessTime = (w: (typeof mine)[number]) =>
        new Date(`${w.entryDate}T12:00:00Z`).getTime();
      const wk = mine.filter(
        (w) => wellnessTime(w) > from && wellnessTime(w) <= to,
      );
      const wkAvg = avg(wk.flatMap((w) => WELLNESS_METRICS.map((m) => w[m])));
      return {
        weekStart: dateStr(new Date(from)),
        load: sum(evts) + sumExtras(extras),
        externalLoad: sumExtras(extras),
        sessions: evts.length + extras.length,
        wellnessAvg: round1(wkAvg),
        checkIns: wk.length,
      };
    });

    return {
      person: toPerson(p),
      sleepQuality: metricAvgs.sleepQuality,
      energy: metricAvgs.energy,
      soreness: metricAvgs.soreness,
      stress: metricAvgs.stress,
      mood: metricAvgs.mood,
      wellnessComposite: composite,
      wellnessBaseline: baseline,
      wellnessCount: inWindow.length,
      lastWellnessDate: lastWellness,
      sessions:
        myLoad.filter((row) => row.startsAt >= daysAgo(windowDays)).length +
        myExtras.filter((s) => extraTime(s) >= cutWin).length,
      windowLoad,
      windowExternalLoad,
      acuteLoad: acute,
      acuteExternalLoad: extraAcute,
      chronicWeeklyLoad:
        chronicWeekly === null ? null : Math.round(chronicWeekly),
      acwr,
      flags,
      weeklyHistory,
    };
  });

  // Sustained-high-load flag: ACWR normalises to ~1.0 when a player grinds
  // heavy weeks for a month straight, so it goes green even though the
  // absolute workload is huge. Compare each player's 4-week weekly average
  // against the squad median instead (self-calibrating; needs no fixed
  // ceiling). Requires >=4 players with real load so one busy player in a
  // tiny sample doesn't flag themselves.
  const chronicVals = result
    .map((x) => x.chronicWeeklyLoad)
    .filter((v): v is number => v !== null && v > 0)
    .sort((a, b) => a - b);
  if (chronicVals.length >= 4) {
    const mid = chronicVals.length / 2;
    const squadMedian =
      chronicVals.length % 2
        ? chronicVals[Math.floor(mid)]
        : (chronicVals[mid - 1] + chronicVals[mid]) / 2;
    if (squadMedian > 0) {
      for (const x of result) {
        const cw = x.chronicWeeklyLoad;
        if (cw === null) continue;
        const ratio = cw / squadMedian;
        if (ratio >= 2)
          x.flags.push({
            metric: "load",
            severity: "alert",
            message: `Sustained high load: ~${cw}/week, ${Math.round(ratio * 10) / 10}× the squad norm (~${Math.round(squadMedian)})`,
          });
        else if (ratio >= 1.5)
          x.flags.push({
            metric: "load",
            severity: "watch",
            message: `Sustained high load: ~${cw}/week, ${Math.round(ratio * 10) / 10}× the squad norm (~${Math.round(squadMedian)})`,
          });
      }
    }
  }

  // Flagged players first, then alphabetically.
  result.sort((a, b) => {
    const sev = (x: typeof a) =>
      x.flags.some((f) => f.severity === "alert")
        ? 2
        : x.flags.length > 0
          ? 1
          : 0;
    return sev(b) - sev(a) || a.person.fullName.localeCompare(b.person.fullName);
  });

  return res.json({
    teamId,
    windowDays,
    generatedAt: now.toISOString(),
    players: result,
  });
});

export default router;
