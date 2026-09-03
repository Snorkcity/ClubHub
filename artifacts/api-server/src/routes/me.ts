import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  clubsTable,
  usersTable,
  teamsTable,
  teamMembersTable,
  guardianshipsTable,
  eventsTable,
} from "@workspace/db";
import { UpdateMeBody } from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { toPerson } from "../lib/serialize";
import { formatPhoneForCountry } from "../lib/phone";
import { verifyAvatarToken } from "../lib/avatarToken";

const router: IRouter = Router();
const AVATAR_DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

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
    pushNotificationsEnabled: localUser.pushNotificationsEnabled,
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
  const [club] = body.phone !== undefined
    ? await db
        .select({ countryCode: clubsTable.countryCode })
        .from(clubsTable)
        .where(eq(clubsTable.id, localUser.clubId))
    : [];
  const [updated] = await db
    .update(usersTable)
    .set({
      ...body,
      ...(body.phone !== undefined
        ? { phone: formatPhoneForCountry(body.phone, club?.countryCode ?? "AU") }
        : {}),
    })
    .where(eq(usersTable.id, localUser.id))
    .returning();
  return res.json(toPerson(updated, undefined, { full: true }));
});

router.put("/me/avatar", requireAuth, async (req, res) => {
  const { localUser } = req as AuthedRequest;
  const imageData = typeof req.body?.imageData === "string" ? req.body.imageData : "";
  const match = AVATAR_DATA_URL_RE.exec(imageData);
  if (!match) return res.status(400).json({ message: "A JPEG, PNG, or WebP image is required." });
  const [, contentType, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > 1_000_000) {
    return res.status(400).json({ message: "Profile photo must be smaller than 1 MB." });
  }
  const [updated] = await db
    .update(usersTable)
    .set({
      avatarImage: base64,
      avatarContentType: contentType,
      avatarUpdatedAt: new Date(),
      avatarUrl: null,
    })
    .where(eq(usersTable.id, localUser.id))
    .returning();
  return res.json(toPerson(updated, undefined, { full: true }));
});

router.get("/people/:personId/avatar", async (req, res) => {
  const personId = Number(req.params.personId);
  if (!Number.isInteger(personId) || personId <= 0) return res.sendStatus(404);
  if (!verifyAvatarToken(personId, req.query.u, req.query.e, req.query.s)) {
    return res.sendStatus(403);
  }
  const [person] = await db
    .select({
      image: usersTable.avatarImage,
      contentType: usersTable.avatarContentType,
      updatedAt: usersTable.avatarUpdatedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, personId));
  if (!person?.image || !person.contentType || !person.updatedAt) return res.sendStatus(404);
  if (person.updatedAt.getTime() !== Number(req.query.u)) return res.sendStatus(403);
  res.setHeader("Content-Type", person.contentType);
  res.setHeader("Cache-Control", "private, max-age=86400");
  return res.send(Buffer.from(person.image, "base64"));
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
