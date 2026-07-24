import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  usersTable,
  teamsTable,
  teamMembersTable,
  guardianshipsTable,
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

export default router;
