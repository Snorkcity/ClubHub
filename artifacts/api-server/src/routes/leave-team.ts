import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db, usersTable, clubsTable, clubMembersTable, teamsTable, teamMembersTable,
  guardianshipsTable, chatsTable, chatMembersTable, teamInvitationsTable,
} from "@workspace/db";
import { LeaveTeamResponse } from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";

const router: IRouter = Router();

router.post("/teams/:teamId/leave", requireAuth, async (req, res): Promise<void> => {
  const teamId = Number(req.params.teamId);
  if (!Number.isSafeInteger(teamId) || teamId <= 0) {
    res.status(400).json({ error: "Invalid team" }); return;
  }
  const { localUser, clubId } = req as AuthedRequest;
  const result = await db.transaction(async (tx) => {
    // Same order as invitation acceptance: email lock, then account/club locks.
    if (localUser.email)
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${localUser.email.toLowerCase()}))`);
    await tx.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.id, localUser.id)).for("update");
    // Serialise simultaneous admin departures so a club cannot lose every admin.
    await tx.select({ id: clubsTable.id }).from(clubsTable)
      .where(eq(clubsTable.id, clubId)).for("update");
    const [team] = await tx.select().from(teamsTable)
      .where(and(eq(teamsTable.id, teamId), eq(teamsTable.clubId, clubId)));
    const [membership] = await tx.select().from(teamMembersTable)
      .where(and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.userId, localUser.id)));
    if (!team || !membership)
      return { status: 404, error: "You are not a member of this team" };

    const [clubMembership] = await tx.select().from(clubMembersTable)
      .where(and(eq(clubMembersTable.clubId, clubId), eq(clubMembersTable.userId, localUser.id)));
    const otherTeams = await tx.select({ teamId: teamsTable.id }).from(teamMembersTable)
      .innerJoin(teamsTable, eq(teamsTable.id, teamMembersTable.teamId))
      .where(and(eq(teamMembersTable.userId, localUser.id), eq(teamsTable.clubId, clubId),
        sql`${teamsTable.id} <> ${teamId}`));
    // Leaving one's own roster must not sever a child's identity/guardian link.
    const wards = await tx.select({ id: teamsTable.id }).from(guardianshipsTable)
      .innerJoin(teamMembersTable, eq(teamMembersTable.userId, guardianshipsTable.playerId))
      .innerJoin(teamsTable, eq(teamsTable.id, teamMembersTable.teamId))
      .where(and(eq(guardianshipsTable.guardianId, localUser.id), eq(teamsTable.clubId, clubId)));
    const leftClub = otherTeams.length === 0 && wards.length === 0;
    if (leftClub && clubMembership?.role === "admin") {
      const admins = await tx.select({ id: clubMembersTable.id }).from(clubMembersTable)
        .where(and(eq(clubMembersTable.clubId, clubId), eq(clubMembersTable.role, "admin"),
          sql`${clubMembersTable.userId} <> ${localUser.id}`));
      if (!admins.length)
        return { status: 409, error: "You are the last club admin. Appoint another club admin before leaving your last team." };
    }

    // Remove access only. Events, attendance, minutes, reports and messages remain.
    await tx.delete(teamMembersTable)
      .where(and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.userId, localUser.id)));
    const chats = await tx.select({ id: chatsTable.id }).from(chatsTable)
      .where(and(eq(chatsTable.clubId, clubId), leftClub ? sql`true` : eq(chatsTable.teamId, teamId)));
    if (chats.length)
      await tx.delete(chatMembersTable).where(and(eq(chatMembersTable.userId, localUser.id),
        inArray(chatMembersTable.chatId, chats.map((c) => c.id))));
    // Old invitation links must never silently re-enrol someone who left.
    await tx.update(teamInvitationsTable).set({ expiresAt: new Date() })
      .where(and(eq(teamInvitationsTable.teamId, teamId), eq(teamInvitationsTable.personId, localUser.id)));
    if (leftClub)
      await tx.delete(clubMembersTable).where(and(eq(clubMembersTable.clubId, clubId),
        eq(clubMembersTable.userId, localUser.id)));
    return { status: 200, leftClub };
  });
  if ("error" in result) { res.status(result.status).json({ error: result.error }); return; }
  res.json(LeaveTeamResponse.parse({ leftTeamId: teamId, leftClub: result.leftClub }));
});

export default router;
