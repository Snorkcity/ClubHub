import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  usersTable,
  teamsTable,
  teamMembersTable,
  guardianshipsTable,
  eventsTable,
} from "@workspace/db";
import { UpdateMeBody } from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { toPerson } from "../lib/serialize";

const router: IRouter = Router();

router.get("/me", requireAuth, async (req, res) => {
  const { localUser, isClubAdmin } = req as AuthedRequest;

  const memberships = await db
    .select({ m: teamMembersTable, t: teamsTable })
    .from(teamMembersTable)
    .innerJoin(teamsTable, eq(teamMembersTable.teamId, teamsTable.id))
    .where(eq(teamMembersTable.userId, localUser.id));

  const wards = await db
    .select({ u: usersTable })
    .from(guardianshipsTable)
    .innerJoin(usersTable, eq(guardianshipsTable.playerId, usersTable.id))
    .where(eq(guardianshipsTable.guardianId, localUser.id));

  return res.json({
    person: toPerson(localUser, undefined, { full: true }),
    clubRole: isClubAdmin ? "admin" : "member",
    isClubAdmin,
    memberships: memberships.map(({ m, t }) => ({
      id: m.id,
      teamId: m.teamId,
      teamName: t.name,
      role: m.role,
      jerseyNumber: m.jerseyNumber ?? null,
      position: m.position ?? null,
    })),
    // Guardians see their wards' full profiles.
    guardianOf: wards.map((w) => toPerson(w.u, undefined, { full: true })),
  });
});

router.patch("/me", requireAuth, async (req, res) => {
  const { localUser } = req as AuthedRequest;
  const body = UpdateMeBody.parse(req.body);
  const [updated] = await db
    .update(usersTable)
    .set(body)
    .where(eq(usersTable.id, localUser.id))
    .returning();
  return res.json(toPerson(updated, undefined, { full: true }));
});

/** Distinct recent locations from events of teams the user staffs (or whole
 *  club for admins) — powers location suggestions when creating an event. */
router.get("/me/event-locations", requireAuth, async (req, res) => {
  const { localUser, clubId, isClubAdmin } = req as AuthedRequest;
  let teamIds: number[];
  if (isClubAdmin) {
    const rows = await db
      .select({ id: teamsTable.id })
      .from(teamsTable)
      .where(eq(teamsTable.clubId, clubId));
    teamIds = rows.map((r) => r.id);
  } else {
    const rows = await db
      .select({ teamId: teamMembersTable.teamId })
      .from(teamMembersTable)
      .where(
        and(
          eq(teamMembersTable.userId, localUser.id),
          inArray(teamMembersTable.role, ["coach", "manager"]),
        ),
      );
    teamIds = rows.map((r) => r.teamId);
  }
  if (teamIds.length === 0) return res.json([]);
  const rows = await db
    .select({ location: eventsTable.location, startsAt: eventsTable.startsAt })
    .from(eventsTable)
    .where(
      and(inArray(eventsTable.teamId, teamIds), isNotNull(eventsTable.location)),
    )
    .orderBy(desc(eventsTable.startsAt))
    .limit(200);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const loc = (r.location ?? "").trim();
    if (!loc || seen.has(loc.toLowerCase())) continue;
    seen.add(loc.toLowerCase());
    out.push(loc);
    if (out.length >= 15) break;
  }
  return res.json(out);
});

export default router;
