import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import {
  db,
  clubsTable,
  teamsTable,
  teamMembersTable,
  guardianshipsTable,
  eventsTable,
  postsTable,
} from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { buildEvents, buildPosts } from "../lib/build";

const router: IRouter = Router();

router.get("/club", requireAuth, async (req, res) => {
  const { clubId } = req as AuthedRequest;
  const [club] = await db
    .select()
    .from(clubsTable)
    .where(eq(clubsTable.id, clubId));
  if (!club) return res.status(404).json({ error: "Club not found" });
  return res.json({
    id: club.id,
    name: club.name,
    logoUrl: club.logoUrl ?? null,
    primaryColor: club.primaryColor ?? null,
  });
});

router.get("/club/overview", requireAuth, async (req, res) => {
  const { clubId, localUser } = req as AuthedRequest;
  const [club] = await db
    .select()
    .from(clubsTable)
    .where(eq(clubsTable.id, clubId));

  const teams = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.clubId, clubId));
  const teamIds = teams.map((t) => t.id);

  const members = teamIds.length
    ? await db
        .select()
        .from(teamMembersTable)
        .where(inArray(teamMembersTable.teamId, teamIds))
    : [];
  const playerCount = new Set(
    members.filter((m) => m.role === "player").map((m) => m.userId),
  ).size;
  const coachCount = new Set(
    members
      .filter((m) => m.role === "coach" || m.role === "manager")
      .map((m) => m.userId),
  ).size;

  const guardians = await db
    .select({ id: guardianshipsTable.guardianId })
    .from(guardianshipsTable);
  const parentCount = new Set(guardians.map((g) => g.id)).size;

  const upcoming = teamIds.length
    ? await db
        .select()
        .from(eventsTable)
        .where(
          and(
            inArray(eventsTable.teamId, teamIds),
            gte(eventsTable.startsAt, new Date()),
          ),
        )
        .orderBy(eventsTable.startsAt)
        .limit(8)
    : [];

  const recent = teamIds.length
    ? await db
        .select()
        .from(postsTable)
        .where(inArray(postsTable.teamId, teamIds))
        .orderBy(desc(postsTable.createdAt))
        .limit(6)
    : [];

  return res.json({
    club: {
      id: club.id,
      name: club.name,
      logoUrl: club.logoUrl ?? null,
      primaryColor: club.primaryColor ?? null,
    },
    teamCount: teams.length,
    playerCount,
    coachCount,
    parentCount,
    upcomingEvents: await buildEvents(upcoming, localUser.id),
    recentPosts: await buildPosts(recent),
  });
});

export default router;
