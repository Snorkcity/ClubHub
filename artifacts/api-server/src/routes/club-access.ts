import { Router, type IRouter } from "express";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db, clubsTable, clubMembersTable, usersTable } from "@workspace/db";
import { UpdateClubAnnouncerBody, TransferClubAdminBody } from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";

const router: IRouter = Router();

async function clubAccess(clubId: number) {
  const rows = await db.select({
    personId: usersTable.id, firstName: usersTable.firstName,
    lastName: usersTable.lastName, role: clubMembersTable.role,
  }).from(clubMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, clubMembersTable.userId))
    .where(and(eq(clubMembersTable.clubId, clubId), isNotNull(usersTable.clerkUserId)))
    .orderBy(asc(usersTable.firstName), asc(usersTable.lastName), asc(usersTable.id));
  return {
    maxAdmins: 1, maxAnnouncers: 3,
    members: rows.map(({ personId, firstName, lastName, role }) => ({
      personId, name: `${firstName} ${lastName}`.trim(), role,
    })),
  };
}

router.get("/club/access", requireAuth, async (req, res) => {
  const { clubId, isClubAdmin } = req as AuthedRequest;
  if (!isClubAdmin) return res.status(403).json({ error: "Only the club admin can manage club access" });
  return res.json(await clubAccess(clubId));
});

// Lock one stable club row before checking authority, capacity or transferring.
// Concurrent grants and stale requests after a transfer cannot exceed limits.
async function changeAccess(clubId: number, actorId: number, personId: number, role: "member" | "announcer" | "admin") {
  return db.transaction(async (tx) => {
    await tx.select({ id: clubsTable.id }).from(clubsTable).where(eq(clubsTable.id, clubId)).for("update");
    const members = await tx.select().from(clubMembersTable).where(eq(clubMembersTable.clubId, clubId));
    if (!members.some((m) => m.userId === actorId && m.role === "admin"))
      return { status: 403, error: "Only the current club admin can change club access" };
    const target = members.find((m) => m.userId === personId);
    const [account] = await tx.select({ id: usersTable.id }).from(usersTable)
      .where(and(eq(usersTable.id, personId), isNotNull(usersTable.clerkUserId)));
    if (!target || !account) return { status: 404, error: "Choose a registered member of this club" };
    if (target.role === "admin" && role !== "admin")
      return { status: 400, error: "Use the administrator handover to change the club admin" };
    if (role === "admin" && personId === actorId && members.filter((m) => m.role === "admin").length <= 1)
      return { status: 400, error: "You are already the sole club admin" };
    if (role === "announcer" && target.role !== "announcer" && members.filter((m) => m.role === "announcer").length >= 3)
      return { status: 409, error: "This club already has three announcers. Remove one before adding another." };
    if (role === "admin") {
      // A handover, never an additional administrator. Team roles are untouched.
      await tx.update(clubMembersTable).set({ role: "member" })
        .where(and(eq(clubMembersTable.clubId, clubId), eq(clubMembersTable.role, "admin")));
    }
    await tx.update(clubMembersTable).set({ role }).where(eq(clubMembersTable.id, target.id));
    return { status: 200 };
  });
}

router.patch("/club/access/:personId", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  if (!isClubAdmin) return res.status(403).json({ error: "Only the club admin can manage club access" });
  const personId = Number(req.params.personId);
  const parsed = UpdateClubAnnouncerBody.safeParse(req.body);
  if (!Number.isSafeInteger(personId) || personId <= 0 || !parsed.success)
    return res.status(400).json({ error: "Choose a valid member and announcer setting" });
  const result = await changeAccess(clubId, localUser.id, personId, parsed.data.role);
  if (result.error) return res.status(result.status).json({ error: result.error });
  return res.json(await clubAccess(clubId));
});

router.post("/club/access/transfer", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  if (!isClubAdmin) return res.status(403).json({ error: "Only the club admin can hand over administration" });
  const parsed = TransferClubAdminBody.safeParse(req.body);
  if (!parsed.success || !Number.isSafeInteger(parsed.data.personId))
    return res.status(400).json({ error: "Choose a registered club member and confirm the handover" });
  const result = await changeAccess(clubId, localUser.id, parsed.data.personId, "admin");
  if (result.error) return res.status(result.status).json({ error: result.error });
  return res.json({ personId: parsed.data.personId });
});

export default router;
