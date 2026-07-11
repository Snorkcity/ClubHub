import { Router, type IRouter } from "express";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import {
  db,
  teamsTable,
  teamMembersTable,
  usersTable,
  eventsTable,
  postsTable,
} from "@workspace/db";
import {
  CreateTeamBody,
  UpdateTeamBody,
  AddTeamMemberBody,
  UpdateTeamMemberBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { buildTeams, buildEvents } from "../lib/build";
import { getVisibleTeamIds } from "../lib/queries";
import { canAccessTeam, isTeamStaff, getTeamInClub } from "../lib/authz";
import { toPerson } from "../lib/serialize";

const router: IRouter = Router();

router.get("/teams", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const visible = await getVisibleTeamIds(clubId, localUser.id, isClubAdmin);
  if (visible.length === 0) return res.json([]);
  const teams = await db
    .select()
    .from(teamsTable)
    .where(inArray(teamsTable.id, visible))
    .orderBy(asc(teamsTable.name));
  return res.json(await buildTeams(teams));
});

router.post("/teams", requireAuth, async (req, res) => {
  const { clubId, isClubAdmin } = req as AuthedRequest;
  if (!isClubAdmin)
    return res.status(403).json({ error: "Only club admins can create teams" });
  const body = CreateTeamBody.parse(req.body);
  const [team] = await db
    .insert(teamsTable)
    .values({
      clubId,
      name: body.name,
      ageGroup: body.ageGroup,
      gender: body.gender ?? null,
      colorHex: body.colorHex ?? null,
      seasonId: body.seasonId ?? null,
    })
    .returning();
  const [built] = await buildTeams([team]);
  return res.status(201).json(built);
});

router.get("/teams/:teamId", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const teamId = Number(req.params.teamId);
  if (!(await canAccessTeam(localUser.id, teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot view this team" });
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, teamId));
  const [built] = await buildTeams([team]);
  return res.json(built);
});

router.patch("/teams/:teamId", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const teamId = Number(req.params.teamId);
  if (!(await isTeamStaff(localUser.id, teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot edit this team" });
  const body = UpdateTeamBody.parse(req.body);
  const [team] = await db
    .update(teamsTable)
    .set(body)
    .where(eq(teamsTable.id, teamId))
    .returning();
  const [built] = await buildTeams([team]);
  return res.json(built);
});

router.get("/teams/:teamId/summary", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const teamId = Number(req.params.teamId);
  if (!(await canAccessTeam(localUser.id, teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot view this team" });
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, teamId));

  const [built] = await buildTeams([team]);

  const upcoming = await db
    .select()
    .from(eventsTable)
    .where(
      and(eq(eventsTable.teamId, teamId), gte(eventsTable.startsAt, new Date())),
    )
    .orderBy(asc(eventsTable.startsAt))
    .limit(1);
  const [nextEvent] = await buildEvents(upcoming, localUser.id);

  const recentPosts = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.teamId, teamId));

  return res.json({
    team: built,
    nextEvent: nextEvent ?? undefined,
    playerCount: built.playerCount,
    goingCount: nextEvent?.goingCount ?? 0,
    maybeCount: nextEvent?.maybeCount ?? 0,
    outCount: nextEvent?.outCount ?? 0,
    noResponseCount: nextEvent?.noResponseCount ?? built.playerCount,
    recentPostCount: recentPosts.length,
  });
});

router.get("/teams/:teamId/members", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const teamId = Number(req.params.teamId);
  if (!(await canAccessTeam(localUser.id, teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot view this team" });
  const rows = await db
    .select({ m: teamMembersTable, u: usersTable })
    .from(teamMembersTable)
    .innerJoin(usersTable, eq(teamMembersTable.userId, usersTable.id))
    .where(eq(teamMembersTable.teamId, teamId));
  return res.json(
    rows.map(({ m, u }) => ({
      id: m.id,
      teamId: m.teamId,
      role: m.role,
      jerseyNumber: m.jerseyNumber ?? null,
      position: m.position ?? null,
      person: toPerson(u),
    })),
  );
});

router.post("/teams/:teamId/members", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const teamId = Number(req.params.teamId);
  if (!(await isTeamStaff(localUser.id, teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot manage this roster" });
  const body = AddTeamMemberBody.parse(req.body);

  // Target person must belong to the same club.
  const [target] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, body.personId), eq(usersTable.clubId, clubId)));
  if (!target) return res.status(404).json({ error: "Person not found" });

  const [member] = await db
    .insert(teamMembersTable)
    .values({
      teamId,
      userId: body.personId,
      role: body.role,
      jerseyNumber: body.jerseyNumber ?? null,
      position: body.position ?? null,
    })
    .returning();
  return res.status(201).json({
    id: member.id,
    teamId: member.teamId,
    role: member.role,
    jerseyNumber: member.jerseyNumber ?? null,
    position: member.position ?? null,
    person: toPerson(target),
  });
});

router.patch("/team-members/:memberId", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const memberId = Number(req.params.memberId);
  const [existing] = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.id, memberId));
  if (!existing) return res.status(404).json({ error: "Member not found" });
  if (!(await isTeamStaff(localUser.id, existing.teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot manage this roster" });

  const body = UpdateTeamMemberBody.parse(req.body);
  const [member] = await db
    .update(teamMembersTable)
    .set(body)
    .where(eq(teamMembersTable.id, memberId))
    .returning();
  const [u] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, member.userId));
  return res.json({
    id: member.id,
    teamId: member.teamId,
    role: member.role,
    jerseyNumber: member.jerseyNumber ?? null,
    position: member.position ?? null,
    person: toPerson(u),
  });
});

router.delete("/team-members/:memberId", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const memberId = Number(req.params.memberId);
  const [existing] = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.id, memberId));
  if (!existing) return res.status(404).json({ error: "Member not found" });
  if (!(await isTeamStaff(localUser.id, existing.teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot manage this roster" });
  await db.delete(teamMembersTable).where(eq(teamMembersTable.id, memberId));
  return res.status(204).send();
});

export default router;
