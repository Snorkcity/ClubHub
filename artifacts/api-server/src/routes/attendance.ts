import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { GetTeamAttendanceQueryParams } from "@workspace/api-zod";
import { db, eventsTable, rsvpsTable, teamMembersTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { getTeamInClub } from "../lib/authz";

const router: IRouter = Router();
function isDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const parsed = new Date(v);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
}
function validZone(v: unknown): v is string {
  if (typeof v !== "string" || v.length > 100) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; } catch { return false; }
}

router.get("/teams/:teamId/attendance", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const teamId = Number(req.params.teamId);
  const { from, to, timeZone } = req.query;
  if (!isDate(from) || !isDate(to) || !validZone(timeZone))
    return res.status(400).json({ error: "Choose valid dates and a time zone." });
  const parsed = GetTeamAttendanceQueryParams.safeParse({ ...req.query, from: new Date(from), to: new Date(to) });
  if (!Number.isSafeInteger(teamId) || teamId <= 0 || !parsed.success)
    return res.status(400).json({ error: "Choose a valid team, dates and time zone." });
  const { type } = parsed.data;
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  if (days < 0 || days > 366)
    return res.status(400).json({ error: "Choose a date range of up to one year, with the end after the start." });
  const team = await getTeamInClub(teamId, clubId);
  const [coach] = await db.select({ id: teamMembersTable.id }).from(teamMembersTable).where(and(
    eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.userId, localUser.id),
    eq(teamMembersTable.role, "coach"),
  ));
  if (!team || (!isClubAdmin && !coach))
    return res.status(403).json({ error: "Attendance reports are only available to this team's coaches and club administrators." });
  const sessions = (await db.select().from(eventsTable).where(and(
    eq(eventsTable.teamId, teamId),
    sql`${eventsTable.cancelledAt} IS NULL`,
    inArray(eventsTable.type, type === "all" ? ["training", "game"] : [type]),
    lt(sql`coalesce(${eventsTable.endsAt}, ${eventsTable.startsAt})`, new Date()),
    sql`(${eventsTable.startsAt} AT TIME ZONE ${timeZone})::date BETWEEN ${from}::date AND ${to}::date`,
  ))).filter((e) => e.invitedRoles.split(",").includes("players"));
  const roster = await db.select({
    personId: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName,
  }).from(teamMembersTable).innerJoin(usersTable, eq(usersTable.id, teamMembersTable.userId))
    .where(and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.role, "player")))
    .orderBy(asc(usersTable.firstName), asc(usersTable.lastName));
  const responses = sessions.length ? await db.select({
    personId: rsvpsTable.userId, status: rsvpsTable.status,
  }).from(rsvpsTable).where(inArray(rsvpsTable.eventId, sessions.map((e) => e.id))) : [];
  const counts = new Map<number, { going: number; out: number; maybe: number }>();
  for (const response of responses) {
    const row = counts.get(response.personId) ?? { going: 0, out: 0, maybe: 0 };
    if (response.status === "going" || response.status === "out" || response.status === "maybe")
      row[response.status]++;
    counts.set(response.personId, row);
  }
  return res.json({
    teamId, teamName: team.name, from, to, timeZone, type, totalSessions: sessions.length,
    generatedAt: new Date().toISOString(),
    notice: "Based on RSVP records, not independently confirmed attendance. Going percentage uses all completed, non-cancelled training sessions and games inviting players in this range. No response is not a confirmed absence. This is the current player roster; historical joining dates are not recorded, so choose an appropriate date range. Staff should check and correct responses before using these figures in player feedback or attendance discussions.",
    players: roster.map((p) => {
      const row = counts.get(p.personId) ?? { going: 0, out: 0, maybe: 0 };
      return {
        personId: p.personId, fullName: `${p.firstName} ${p.lastName}`.trim(), ...row,
        totalSessions: sessions.length,
        noResponse: sessions.length - row.going - row.out - row.maybe,
        goingPercent: sessions.length ? Math.round(row.going / sessions.length * 1000) / 10 : null,
      };
    }),
  });
});

export default router;
