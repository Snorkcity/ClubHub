import { Router, type IRouter } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  teamsTable,
  teamMembersTable,
  guardianshipsTable,
} from "@workspace/db";
import {
  CreatePersonBody,
  UpdatePersonBody,
  CreateGuardianshipBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { canActFor } from "../lib/queries";
import { toPerson } from "../lib/serialize";

const router: IRouter = Router();

/** Load a user only if they belong to the caller's club. */
async function getPersonInClub(personId: number, clubId: number) {
  const [person] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, personId), eq(usersTable.clubId, clubId)));
  return person ?? null;
}

router.get("/people", requireAuth, async (req, res) => {
  const { clubId } = req as AuthedRequest;
  const search = (req.query.search as string | undefined)?.toLowerCase().trim();
  const role = req.query.role as string | undefined;
  const teamId = req.query.teamId ? Number(req.query.teamId) : null;

  let people = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clubId, clubId))
    .orderBy(asc(usersTable.firstName));

  if (teamId) {
    // Team members plus guardians of the team's players.
    const members = await db
      .select({ userId: teamMembersTable.userId, role: teamMembersTable.role })
      .from(teamMembersTable)
      .where(eq(teamMembersTable.teamId, teamId));
    const memberIds = new Set(members.map((m) => m.userId));
    const playerIds = members.filter((m) => m.role === "player").map((m) => m.userId);
    if (playerIds.length) {
      const guardians = await db
        .select({ guardianId: guardianshipsTable.guardianId })
        .from(guardianshipsTable)
        .where(inArray(guardianshipsTable.playerId, playerIds));
      for (const g of guardians) memberIds.add(g.guardianId);
    }
    people = people.filter((p) => memberIds.has(p.id));
  }

  if (role === "parent") {
    const guardians = await db
      .select({ id: guardianshipsTable.guardianId })
      .from(guardianshipsTable);
    const ids = new Set(guardians.map((g) => g.id));
    people = people.filter((p) => ids.has(p.id));
  } else if (role === "manager" || role === "coach" || role === "player") {
    const members = await db
      .select({ userId: teamMembersTable.userId })
      .from(teamMembersTable)
      .where(eq(teamMembersTable.role, role));
    const ids = new Set(members.map((m) => m.userId));
    people = people.filter((p) => ids.has(p.id));
  }

  if (search) {
    people = people.filter((p) =>
      `${p.firstName} ${p.lastName} ${p.email ?? ""}`
        .toLowerCase()
        .includes(search),
    );
  }

  const { localUser, isClubAdmin } = req as AuthedRequest;
  const viewer = { id: localUser.id, isClubAdmin };
  return res.json(people.map((p) => toPerson(p, viewer)));
});

router.post("/people", requireAuth, async (req, res) => {
  const { clubId, isClubAdmin } = req as AuthedRequest;
  if (!isClubAdmin)
    return res.status(403).json({ error: "Only club admins can add people" });
  const body = CreatePersonBody.parse(req.body);
  const [person] = await db
    .insert(usersTable)
    .values({
      clubId,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email ?? null,
      phone: body.phone ?? null,
      dateOfBirth: body.dateOfBirth ?? null,
    })
    .returning();
  return res.status(201).json(toPerson(person));
});

router.get("/people/:personId", requireAuth, async (req, res) => {
  const { clubId } = req as AuthedRequest;
  const personId = Number(req.params.personId);
  const person = await getPersonInClub(personId, clubId);
  if (!person) return res.status(404).json({ error: "Person not found" });

  const memberships = await db
    .select({ m: teamMembersTable, t: teamsTable })
    .from(teamMembersTable)
    .innerJoin(teamsTable, eq(teamMembersTable.teamId, teamsTable.id))
    .where(eq(teamMembersTable.userId, personId));

  const guardianLinks = await db
    .select()
    .from(guardianshipsTable)
    .where(eq(guardianshipsTable.playerId, personId));
  const wardLinks = await db
    .select()
    .from(guardianshipsTable)
    .where(eq(guardianshipsTable.guardianId, personId));

  const relatedIds = Array.from(
    new Set([
      personId,
      ...guardianLinks.map((g) => g.guardianId),
      ...wardLinks.map((g) => g.playerId),
    ]),
  );
  const related = relatedIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, relatedIds))
    : [];
  const byId = Object.fromEntries(related.map((u) => [u.id, u]));

  const { localUser, isClubAdmin } = req as AuthedRequest;
  const viewer = { id: localUser.id, isClubAdmin };
  return res.json({
    person: toPerson(person, viewer),
    memberships: memberships.map(({ m, t }) => ({
      id: m.id,
      teamId: m.teamId,
      teamName: t.name,
      role: m.role,
      jerseyNumber: m.jerseyNumber ?? null,
      position: m.position ?? null,
    })),
    guardians: guardianLinks.map((g) => ({
      id: g.id,
      relationship: g.relationship,
      canManage: g.canManage,
      guardian: toPerson(byId[g.guardianId], viewer),
      player: toPerson(person, viewer),
    })),
    wards: wardLinks.map((g) => ({
      id: g.id,
      relationship: g.relationship,
      canManage: g.canManage,
      guardian: toPerson(person, viewer),
      player: toPerson(byId[g.playerId], viewer),
    })),
  });
});

router.patch("/people/:personId", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const personId = Number(req.params.personId);
  const existing = await getPersonInClub(personId, clubId);
  if (!existing) return res.status(404).json({ error: "Person not found" });
  if (!(await canActFor(localUser.id, personId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot edit this person" });

  const body = UpdatePersonBody.parse(req.body);
  const [person] = await db
    .update(usersTable)
    .set(body)
    .where(eq(usersTable.id, personId))
    .returning();
  return res.json(toPerson(person));
});

router.post("/guardianships", requireAuth, async (req, res) => {
  const { clubId, isClubAdmin } = req as AuthedRequest;
  if (!isClubAdmin)
    return res
      .status(403)
      .json({ error: "Only club admins can link guardians" });
  const body = CreateGuardianshipBody.parse(req.body);

  // Both people must belong to the caller's club.
  const rows = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.clubId, clubId),
        inArray(usersTable.id, [body.guardianId, body.playerId]),
      ),
    );
  if (rows.length !== 2)
    return res.status(404).json({ error: "Person not found in this club" });

  const [link] = await db
    .insert(guardianshipsTable)
    .values({
      guardianId: body.guardianId,
      playerId: body.playerId,
      relationship: body.relationship,
      canManage: body.canManage ?? true,
    })
    .returning();
  const byId = Object.fromEntries(rows.map((u) => [u.id, u]));
  return res.status(201).json({
    id: link.id,
    relationship: link.relationship,
    canManage: link.canManage,
    guardian: toPerson(byId[link.guardianId]),
    player: toPerson(byId[link.playerId]),
  });
});

router.delete("/guardianships/:guardianshipId", requireAuth, async (req, res) => {
  const { clubId, isClubAdmin } = req as AuthedRequest;
  if (!isClubAdmin)
    return res
      .status(403)
      .json({ error: "Only club admins can remove guardian links" });
  const id = Number(req.params.guardianshipId);
  const [link] = await db
    .select()
    .from(guardianshipsTable)
    .where(eq(guardianshipsTable.id, id));
  if (!link) return res.status(404).json({ error: "Guardianship not found" });

  // Tenant guard: the linked people must belong to the admin's club.
  const members = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.clubId, clubId),
        inArray(usersTable.id, [link.guardianId, link.playerId]),
      ),
    );
  if (members.length !== 2)
    return res.status(404).json({ error: "Guardianship not found" });

  await db.delete(guardianshipsTable).where(eq(guardianshipsTable.id, id));
  return res.status(204).send();
});

export default router;
