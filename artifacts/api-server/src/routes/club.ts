import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
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
import { SetClubLogoBody } from "@workspace/api-zod";
import { clubLogoPath, clubLogoVersion, readClubLogo, verifyClubLogoToken } from "../lib/club-logo";

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
    logoUrl: clubLogoPath(club.id, club.logoUrl),
    primaryColor: club.primaryColor ?? null,
    countryCode: club.countryCode,
  });
});

router.put("/club/logo", requireAuth, async (req, res) => {
  const { clubId, isClubAdmin } = req as AuthedRequest;
  if (!isClubAdmin) return res.status(403).json({ error: "Only club admins can change the club logo" });
  const body = SetClubLogoBody.parse(req.body);
  try {
    readClubLogo(body.imageData);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
  const [club] = await db.update(clubsTable)
    .set({ logoUrl: body.imageData })
    .where(eq(clubsTable.id, clubId)).returning();
  if (!club) return res.status(404).json({ error: "Club not found" });
  return res.json({ ...club, logoUrl: clubLogoPath(club.id, club.logoUrl) });
});

router.delete("/club/logo", requireAuth, async (req, res) => {
  const { clubId, isClubAdmin } = req as AuthedRequest;
  if (!isClubAdmin) return res.status(403).json({ error: "Only club admins can change the club logo" });
  const [club] = await db.update(clubsTable).set({ logoUrl: null })
    .where(eq(clubsTable.id, clubId)).returning();
  if (!club) return res.status(404).json({ error: "Club not found" });
  return res.json({ ...club, logoUrl: null });
});

router.get("/clubs/:clubId/logo", async (req, res) => {
  const clubId = Number(req.params.clubId);
  if (!verifyClubLogoToken(clubId, req.query.v, req.query.e, req.query.s))
    return res.status(403).send();
  const [club] = await db.select({ logoUrl: clubsTable.logoUrl })
    .from(clubsTable).where(eq(clubsTable.id, clubId));
  if (!club?.logoUrl?.startsWith("data:") || clubLogoVersion(club.logoUrl) !== req.query.v)
    return res.status(404).send();
  const { bytes, contentType } = readClubLogo(club.logoUrl);
  res.setHeader("Content-Type", contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=300");
  return res.send(bytes);
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
  const playerIds = [...new Set(
    members.filter((m) => m.role === "player").map((m) => m.userId),
  )];
  const playerCount = playerIds.length;
  const coachCount = new Set(
    members
      .filter((m) => m.role === "coach" || m.role === "manager")
      .map((m) => m.userId),
  ).size;

  // Scope through this club's players, not the guardian's home club: a
  // lifelong account can have children playing at more than one club.
  const guardians = playerIds.length
    ? await db
        .selectDistinct({ id: guardianshipsTable.guardianId })
        .from(guardianshipsTable)
        .where(inArray(guardianshipsTable.playerId, playerIds))
    : [];
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
      logoUrl: clubLogoPath(club.id, club.logoUrl),
      primaryColor: club.primaryColor ?? null,
      countryCode: club.countryCode,
    },
    teamCount: teams.length,
    playerCount,
    coachCount,
    parentCount,
    upcomingEvents: await buildEvents(upcoming, localUser.id),
    recentPosts: await buildPosts(recent),
  });
});

// Storage health check for image data kept in Postgres (post photos and
// team banners). Threshold decision (see .agents/memory/image-storage.md):
// stay in Postgres while image storage is small; plan the S3 move once
// post_photos passes 1 GiB (warning) and do it before 5 GiB (critical) —
// beyond that, backups/restores and row TOAST churn get expensive on
// Railway Postgres. Club admins only.
const STORAGE_WARN_BYTES = 1 * 1024 * 1024 * 1024;
const STORAGE_CRITICAL_BYTES = 5 * 1024 * 1024 * 1024;

router.get("/club/storage", requireAuth, async (req, res) => {
  const { isClubAdmin } = req as AuthedRequest;
  if (!isClubAdmin)
    return res.status(403).json({ error: "Only club admins can view storage stats" });

  const { rows: [row] } = await db.execute<{
    post_photos_bytes: string;
    photo_count: string;
    banner_bytes: string;
    database_bytes: string;
  }>(sql`
    select
      pg_total_relation_size('post_photos') as post_photos_bytes,
      (select count(*) from post_photos) as photo_count,
      (select coalesce(sum(length(banner_image)), 0) from teams) as banner_bytes,
      pg_database_size(current_database()) as database_bytes
  `);

  const postPhotosBytes = Number(row.post_photos_bytes);
  const status =
    postPhotosBytes >= STORAGE_CRITICAL_BYTES
      ? "critical"
      : postPhotosBytes >= STORAGE_WARN_BYTES
        ? "warning"
        : "ok";

  return res.json({
    status,
    postPhotos: {
      bytes: postPhotosBytes,
      count: Number(row.photo_count),
    },
    bannersBytes: Number(row.banner_bytes),
    databaseBytes: Number(row.database_bytes),
    thresholds: {
      warnBytes: STORAGE_WARN_BYTES,
      criticalBytes: STORAGE_CRITICAL_BYTES,
    },
    // Human-readable summary of the migration plan for whoever checks this.
    plan:
      "Images stay in Postgres while small. At 'warning' (1 GiB of post photos), plan a move to S3-compatible storage keeping signed expiring URLs; complete it before 'critical' (5 GiB).",
  });
});

export default router;
