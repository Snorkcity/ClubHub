import { Router, type IRouter } from "express";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import {
  db,
  clubsTable,
  teamsTable,
  teamMembersTable,
  usersTable,
  eventsTable,
  postsTable,
  chatsTable,
  chatMembersTable,
} from "@workspace/db";
import {
  CreateTeamBody,
  UpdateTeamBody,
  SetTeamBannerBody,
  AddTeamMemberBody,
  UpdateTeamMemberBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { buildTeams, buildEvents } from "../lib/build";
import { getVisibleTeamIds } from "../lib/queries";
import { canAccessTeam, isTeamStaff, getTeamInClub } from "../lib/authz";
import { toPerson } from "../lib/serialize";
import { verifyBannerToken } from "../lib/bannerToken";

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
  const team = await db.transaction(async (tx) => {
    if (body.countryCode) {
      const existingTeams = await tx
        .select({ id: teamsTable.id })
        .from(teamsTable)
        .where(eq(teamsTable.clubId, clubId))
        .limit(1);
      if (existingTeams.length === 0) {
        await tx
          .update(clubsTable)
          .set({ countryCode: body.countryCode })
          .where(eq(clubsTable.id, clubId));
      }
    }
    const [created] = await tx
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
    return created;
  });
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

// Banner images live in Postgres (base64) so dev (Replit) and prod (Railway)
// behave identically without an external storage service. Clients resize
// before upload, so payloads stay small.
const MAX_BANNER_BYTES = 4 * 1024 * 1024;
const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

router.put("/teams/:teamId/banner", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const teamId = Number(req.params.teamId);
  if (!(await isTeamStaff(localUser.id, teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot edit this team" });
  const body = SetTeamBannerBody.parse(req.body);
  const match = DATA_URL_RE.exec(body.imageData);
  if (!match)
    return res
      .status(400)
      .json({ error: "Image must be a JPEG, PNG or WebP data URL" });
  const [, contentType, base64] = match;
  if (Buffer.from(base64, "base64").length > MAX_BANNER_BYTES)
    return res.status(400).json({ error: "Image too large (max 4MB)" });
  const [team] = await db
    .update(teamsTable)
    .set({
      bannerImage: base64,
      bannerContentType: contentType,
      bannerUpdatedAt: new Date(),
    })
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.clubId, clubId)))
    .returning();
  if (!team) return res.status(404).json({ error: "Team not found" });
  const [built] = await buildTeams([team]);
  return res.json(built);
});

router.delete("/teams/:teamId/banner", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const teamId = Number(req.params.teamId);
  if (!(await isTeamStaff(localUser.id, teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot edit this team" });
  await db
    .update(teamsTable)
    .set({ bannerImage: null, bannerContentType: null, bannerUpdatedAt: null })
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.clubId, clubId)));
  return res.status(204).send();
});

// Serves the banner image itself. <img> tags can't attach auth headers
// (the web client is cross-origin from the API on Railway prod), so access
// control is enforced via a signed, expiring URL that only club members
// receive from the authenticated team APIs (see lib/bannerToken.ts).
router.get("/teams/:teamId/banner", async (req, res) => {
  const teamId = Number(req.params.teamId);
  if (!Number.isInteger(teamId)) return res.status(404).send();
  if (!verifyBannerToken(teamId, req.query.u, req.query.e, req.query.s))
    return res.status(403).send();
  const [team] = await db
    .select({
      bannerImage: teamsTable.bannerImage,
      bannerContentType: teamsTable.bannerContentType,
    })
    .from(teamsTable)
    .where(eq(teamsTable.id, teamId));
  if (!team?.bannerImage || !team.bannerContentType)
    return res.status(404).send();
  const buf = Buffer.from(team.bannerImage, "base64");
  res.setHeader("Content-Type", team.bannerContentType);
  // Short private cache: the URL embeds the banner version, but keep TTL
  // modest so removed/replaced images don't linger in caches.
  res.setHeader("Cache-Control", "private, max-age=3600");
  return res.send(buf);
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

  // Joining a roster also joins the team chat.
  const [teamChat] = await db
    .select({ id: chatsTable.id })
    .from(chatsTable)
    .where(and(eq(chatsTable.teamId, teamId), eq(chatsTable.type, "team")));
  if (teamChat) {
    await db
      .insert(chatMembersTable)
      .values({ chatId: teamChat.id, userId: body.personId })
      .onConflictDoNothing();
  }

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

  // Leaving the roster also leaves the team chat — unless they still have
  // another role on the team (e.g. player + coach rows).
  const stillOnTeam = await db
    .select({ id: teamMembersTable.id })
    .from(teamMembersTable)
    .where(
      and(
        eq(teamMembersTable.teamId, existing.teamId),
        eq(teamMembersTable.userId, existing.userId),
      ),
    );
  if (stillOnTeam.length === 0) {
    const [teamChat] = await db
      .select({ id: chatsTable.id })
      .from(chatsTable)
      .where(
        and(eq(chatsTable.teamId, existing.teamId), eq(chatsTable.type, "team")),
      );
    if (teamChat) {
      await db
        .delete(chatMembersTable)
        .where(
          and(
            eq(chatMembersTable.chatId, teamChat.id),
            eq(chatMembersTable.userId, existing.userId),
          ),
        );
    }
  }
  return res.status(204).send();
});

export default router;
