import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  eventsTable,
  gamePeriodsTable,
  gameStintsTable,
  teamMembersTable,
  usersTable,
  type GamePeriod,
  type GameStint,
} from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { isTeamStaff } from "../lib/authz";
import { toPerson, iso } from "../lib/serialize";

const router: IRouter = Router();

/** Seconds of a stint that overlap running game periods (clock time only). */
function overlapSeconds(
  stints: GameStint[],
  periods: GamePeriod[],
  now: Date,
): number {
  let total = 0;
  for (const stint of stints) {
    const sStart = stint.startedAt.getTime();
    const sEnd = (stint.endedAt ?? now).getTime();
    for (const period of periods) {
      const pStart = period.startedAt.getTime();
      const pEnd = (period.endedAt ?? now).getTime();
      const start = Math.max(sStart, pStart);
      const end = Math.min(sEnd, pEnd);
      if (end > start) total += (end - start) / 1000;
    }
  }
  return Math.round(total);
}

type StaffEventResult =
  | { error: 404 | 403; event?: never }
  | { error?: never; event: typeof eventsTable.$inferSelect };

/** Load event and verify the caller is staff of its team. */
async function loadStaffEvent(
  req: AuthedRequest,
  eventId: number,
): Promise<StaffEventResult> {
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId));
  if (!event) return { error: 404 as const };
  const ok = await isTeamStaff(
    req.localUser.id,
    event.teamId,
    req.clubId,
    req.isClubAdmin,
  );
  if (!ok) return { error: 403 as const };
  return { event };
}

async function buildState(eventId: number, teamId: number) {
  const now = new Date();
  const periods = await db
    .select()
    .from(gamePeriodsTable)
    .where(eq(gamePeriodsTable.eventId, eventId))
    .orderBy(asc(gamePeriodsTable.periodNumber));
  const stints = await db
    .select()
    .from(gameStintsTable)
    .where(eq(gameStintsTable.eventId, eventId));

  const roster = await db
    .select({ m: teamMembersTable, u: usersTable })
    .from(teamMembersTable)
    .innerJoin(usersTable, eq(teamMembersTable.userId, usersTable.id))
    .where(
      and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.role, "player")),
    );

  const running = periods.find((p) => !p.endedAt) ?? null;
  const stintsByUser = new Map<number, GameStint[]>();
  for (const s of stints) {
    const list = stintsByUser.get(s.userId) ?? [];
    list.push(s);
    stintsByUser.set(s.userId, list);
  }

  return {
    clockRunning: !!running,
    currentPeriodNumber: running?.periodNumber ?? null,
    periodsPlayed: periods.filter((p) => p.endedAt).length,
    periods: periods.map((p) => ({
      periodNumber: p.periodNumber,
      startedAt: iso(p.startedAt),
      endedAt: p.endedAt ? iso(p.endedAt) : null,
    })),
    players: roster
      .map(({ m, u }) => {
        const userStints = stintsByUser.get(u.id) ?? [];
        return {
          person: toPerson(u),
          jerseyNumber: m.jerseyNumber,
          position: m.position,
          onPitch: userStints.some((s) => !s.endedAt),
          secondsPlayed: overlapSeconds(userStints, periods, now),
        };
      })
      .sort((a, b) => (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999)),
  };
}

router.get("/events/:eventId/timekeeping", requireAuth, async (req, res) => {
  const eventId = Number(req.params.eventId);
  const result = await loadStaffEvent(req as AuthedRequest, eventId);
  if (result.error)
    return res.status(result.error).json({
      error: result.error === 404 ? "Event not found" : "Staff only",
    });
  return res.json(await buildState(eventId, result.event.teamId));
});

router.post(
  "/events/:eventId/timekeeping/periods/start",
  requireAuth,
  async (req, res) => {
    const eventId = Number(req.params.eventId);
    const result = await loadStaffEvent(req as AuthedRequest, eventId);
    if (result.error)
      return res.status(result.error).json({
        error: result.error === 404 ? "Event not found" : "Staff only",
      });
    const periods = await db
      .select()
      .from(gamePeriodsTable)
      .where(eq(gamePeriodsTable.eventId, eventId));
    if (periods.some((p) => !p.endedAt))
      return res.status(409).json({ error: "A period is already running" });
    const nextNumber =
      periods.reduce((max, p) => Math.max(max, p.periodNumber), 0) + 1;
    try {
      await db.insert(gamePeriodsTable).values({
        eventId,
        periodNumber: nextNumber,
        startedAt: new Date(),
      });
    } catch (e: any) {
      // Partial unique index guarantees one open period per event.
      if (e?.code === "23505")
        return res.status(409).json({ error: "A period is already running" });
      throw e;
    }
    return res.json(await buildState(eventId, result.event.teamId));
  },
);

router.post(
  "/events/:eventId/timekeeping/periods/end",
  requireAuth,
  async (req, res) => {
    const eventId = Number(req.params.eventId);
    const result = await loadStaffEvent(req as AuthedRequest, eventId);
    if (result.error)
      return res.status(result.error).json({
        error: result.error === 404 ? "Event not found" : "Staff only",
      });
    const updated = await db
      .update(gamePeriodsTable)
      .set({ endedAt: new Date() })
      .where(
        and(eq(gamePeriodsTable.eventId, eventId), isNull(gamePeriodsTable.endedAt)),
      )
      .returning();
    if (updated.length === 0)
      return res.status(409).json({ error: "No period is running" });
    return res.json(await buildState(eventId, result.event.teamId));
  },
);

router.post(
  "/events/:eventId/timekeeping/players/:userId/toggle",
  requireAuth,
  async (req, res) => {
    const eventId = Number(req.params.eventId);
    const userId = Number(req.params.userId);
    const result = await loadStaffEvent(req as AuthedRequest, eventId);
    if (result.error)
      return res.status(result.error).json({
        error: result.error === 404 ? "Event not found" : "Staff only",
      });

    const [membership] = await db
      .select()
      .from(teamMembersTable)
      .where(
        and(
          eq(teamMembersTable.teamId, result.event.teamId),
          eq(teamMembersTable.userId, userId),
        ),
      );
    if (!membership)
      return res.status(400).json({ error: "That person is not on this team" });

    const open = await db
      .select()
      .from(gameStintsTable)
      .where(
        and(
          eq(gameStintsTable.eventId, eventId),
          eq(gameStintsTable.userId, userId),
          isNull(gameStintsTable.endedAt),
        ),
      );
    if (open.length > 0) {
      // Close by "still open" predicate so concurrent toggles stay idempotent.
      await db
        .update(gameStintsTable)
        .set({ endedAt: new Date() })
        .where(
          and(
            inArray(
              gameStintsTable.id,
              open.map((s) => s.id),
            ),
            isNull(gameStintsTable.endedAt),
          ),
        );
    } else {
      try {
        await db.insert(gameStintsTable).values({
          eventId,
          userId,
          startedAt: new Date(),
        });
      } catch (e: any) {
        // Partial unique index: player is already ON — treat as no-op.
        if (e?.code !== "23505") throw e;
      }
    }
    return res.json(await buildState(eventId, result.event.teamId));
  },
);

router.get(
  "/teams/:teamId/timekeeping/season",
  requireAuth,
  async (req, res) => {
    const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
    const teamId = Number(req.params.teamId);
    if (!(await isTeamStaff(localUser.id, teamId, clubId, isClubAdmin)))
      return res.status(403).json({ error: "Staff only" });

    const now = new Date();
    const games = await db
      .select()
      .from(eventsTable)
      .where(and(eq(eventsTable.teamId, teamId), eq(eventsTable.type, "game")));
    const gameIds = games.map((g) => g.id);

    const periods = gameIds.length
      ? await db
          .select()
          .from(gamePeriodsTable)
          .where(inArray(gamePeriodsTable.eventId, gameIds))
      : [];
    const stints = gameIds.length
      ? await db
          .select()
          .from(gameStintsTable)
          .where(inArray(gameStintsTable.eventId, gameIds))
      : [];

    const periodsByEvent = new Map<number, GamePeriod[]>();
    for (const p of periods) {
      const list = periodsByEvent.get(p.eventId) ?? [];
      list.push(p);
      periodsByEvent.set(p.eventId, list);
    }

    const roster = await db
      .select({ m: teamMembersTable, u: usersTable })
      .from(teamMembersTable)
      .innerJoin(usersTable, eq(teamMembersTable.userId, usersTable.id))
      .where(
        and(
          eq(teamMembersTable.teamId, teamId),
          eq(teamMembersTable.role, "player"),
        ),
      );

    const players = roster.map(({ m, u }) => {
      let totalSeconds = 0;
      const gamesPlayed = new Set<number>();
      for (const s of stints.filter((s) => s.userId === u.id)) {
        const secs = overlapSeconds(
          [s],
          periodsByEvent.get(s.eventId) ?? [],
          now,
        );
        if (secs > 0) {
          totalSeconds += secs;
          gamesPlayed.add(s.eventId);
        }
      }
      return {
        person: toPerson(u),
        jerseyNumber: m.jerseyNumber,
        position: m.position,
        totalSeconds,
        gamesPlayed: gamesPlayed.size,
      };
    });

    players.sort((a, b) => b.totalSeconds - a.totalSeconds);
    return res.json({ trackedGames: periodsByEvent.size, players });
  },
);

export default router;
