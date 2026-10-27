import { Router, type IRouter } from "express";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  chatMembersTable,
  chatsTable,
  clubMembersTable,
  guardianshipsTable,
  db,
  teamMembersTable,
  teamsTable,
  teamInvitationsTable,
  usersTable,
} from "@workspace/db";
import {
  AcceptTeamInvitationBody,
  CreateTeamInvitationBody,
} from "@workspace/api-zod";
import { requireAuth, requireAccount, loadClerkIdentity, type AuthedRequest } from "../lib/auth";
import { reconcileInvitedPerson } from "../lib/reconcile-invited-person";
import { isTeamStaff } from "../lib/authz";

const router: IRouter = Router();
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const APP_URL = process.env.WEB_APP_URL || "https://app.nahreo.com";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[
        character
      ]!,
  );
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function findInvitation(token: string) {
  if (!token) return null;
  const [row] = await db
    .select({
      invitation: teamInvitationsTable,
      firstName: usersTable.firstName,
      clerkUserId: usersTable.clerkUserId,
      teamName: teamsTable.name,
      role: teamMembersTable.role,
    })
    .from(teamInvitationsTable)
    .innerJoin(usersTable, eq(usersTable.id, teamInvitationsTable.personId))
    .innerJoin(teamsTable, eq(teamsTable.id, teamInvitationsTable.teamId))
    .leftJoin(
      teamMembersTable,
      and(
        eq(teamMembersTable.userId, teamInvitationsTable.personId),
        eq(teamMembersTable.teamId, teamInvitationsTable.teamId),
      ),
    )
    .where(eq(teamInvitationsTable.tokenHash, tokenHash(token)));
  return row && (row.invitation.guardianPlayerId || row.role) ? row : null;
}

router.get("/team-invitations/preview", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const row = await findInvitation(token);
  if (!row || row.invitation.expiresAt.getTime() <= Date.now())
    return res.status(404).json({ error: "This invitation is invalid or has expired" });
  return res.json({
    firstName: row.firstName,
    teamName: row.teamName,
    role: row.invitation.guardianPlayerId ? "guardian" : row.role,
    expiresAt: row.invitation.expiresAt.toISOString(),
    accepted: !!row.invitation.acceptedAt,
  });
});

router.post("/team-invitations", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const body = CreateTeamInvitationBody.parse(req.body);
  if (!(await isTeamStaff(localUser.id, body.teamId, clubId, isClubAdmin)))
    return res.status(403).json({
      error: "Only this team's admins and coaches can invite new people",
    });
  const email = body.email.trim().toLowerCase();
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(and(eq(teamsTable.id, body.teamId), eq(teamsTable.clubId, clubId)));
  if (!team) return res.status(404).json({ error: "Team not found" });
  if (body.role === "guardian") {
    if (!isClubAdmin)
      return res.status(403).json({ error: "Only club admins can invite guardians" });
    const [player] = await db.select({ id: teamMembersTable.userId }).from(teamMembersTable)
      .where(and(eq(teamMembersTable.teamId, team.id),
        eq(teamMembersTable.userId, body.guardianPlayerId ?? -1),
        eq(teamMembersTable.role, "player")));
    if (!player)
      return res.status(400).json({ error: "Choose a player on this team's roster" });
  } else if (body.guardianPlayerId !== undefined) {
    return res.status(400).json({ error: "Only guardian invitations can link a player" });
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAtDate = new Date(Date.now() + INVITE_LIFETIME_MS);
  const person = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);
    const existing = await tx.select().from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${email}`);
    if (existing.length > 1) return null;
    if (body.role === "guardian" && existing[0]?.id === body.guardianPlayerId)
      return null;
    // A person keeps one identity across clubs. An invitation may add roles,
    // but must never create a second profile for an existing account.
    const created = existing[0]
      ? existing[0]
      : (await tx
      .insert(usersTable)
      .values({
        clubId,
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        email,
      })
      .returning())[0];
    await tx.insert(clubMembersTable).values({
      clubId,
      userId: created.id,
      role: "member",
    }).onConflictDoNothing();
    if (body.role !== "guardian") await tx.insert(teamMembersTable).values({
      teamId: team.id,
      userId: created.id,
      role: body.role,
    }).onConflictDoNothing();
    const [teamChat] = await tx
      .select({ id: chatsTable.id })
      .from(chatsTable)
      .where(and(eq(chatsTable.teamId, team.id), eq(chatsTable.type, "team")));
    if (teamChat && body.role !== "guardian")
      await tx
        .insert(chatMembersTable)
        .values({ chatId: teamChat.id, userId: created.id })
        .onConflictDoNothing();
    await tx.insert(teamInvitationsTable).values({
      clubId,
      teamId: team.id,
      personId: created.id,
      invitedByUserId: localUser.id,
      tokenHash: tokenHash(token),
      expiresAt: expiresAtDate,
      guardianPlayerId: body.role === "guardian" ? body.guardianPlayerId : null,
    });
    return created;
  });
  if (!person)
    return res.status(409).json({
      error: "More than one roster entry uses this email. Ask the person to accept their existing invitation first, or contact your club administrator.",
    });

  const expiresAt = expiresAtDate.toISOString();
  const inviteLink = `${APP_URL}/join?token=${encodeURIComponent(token)}`;
  let emailSent = false;
  let warning: string | undefined;
  if (body.deliveryMethod !== "link") {
    const safeFirstName = escapeHtml(person.firstName);
    const safeInviterName = escapeHtml(localUser.firstName);
    const safeTeamName = escapeHtml(team.name);
    const safeRole = escapeHtml(body.role);
    try {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Nahreo <invites@nahreo.com>",
          to: [email],
          subject: `${localUser.firstName} invited you to join ${team.name} on Nahreo`,
          text: `Hi ${person.firstName},\n\n${localUser.firstName} invited you to join ${team.name} as a ${body.role} on Nahreo.\n\nAccept your invitation: ${inviteLink}\n\nThis secure link expires in 7 days.`,
          html: `<div style="font-family:Inter,Arial,sans-serif;color:#101828;max-width:560px;margin:auto"><h1 style="color:#173F8A">You're invited to Nahreo</h1><p>Hi ${safeFirstName},</p><p>${safeInviterName} invited you to join <strong>${safeTeamName}</strong> as a ${safeRole}.</p><p style="margin:32px 0"><a href="${inviteLink}" style="background:#173F8A;color:white;padding:14px 22px;border-radius:12px;text-decoration:none;font-weight:700">Accept invitation</a></p><p style="color:#667085;font-size:14px">This secure link expires in 7 days.</p></div>`,
        }),
      });
      if (!response.ok) throw new Error(`Resend returned ${response.status}`);
      emailSent = true;
    } catch (error) {
      req.log.error({ err: error }, "Invitation created but email delivery failed");
      warning = "The invitation was created, but the email could not be sent. Copy and share the secure link instead.";
    }
  }

  return res.status(201).json({ inviteLink, expiresAt, emailSent, warning });
});

router.post("/team-invitations/accept", requireAccount, async (req, res) => {
  const { localUser } = req as AuthedRequest;
  const body = AcceptTeamInvitationBody.parse(req.body);
  const identity = await loadClerkIdentity(req, localUser.clerkUserId!);
  const result = await db.transaction(async (tx) => {
    if (identity.email)
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${identity.email.toLowerCase()}))`);
    const [invitation] = await tx.select().from(teamInvitationsTable)
      .where(eq(teamInvitationsTable.tokenHash, tokenHash(body.token))).for("update");
    if (!invitation || invitation.expiresAt.getTime() <= Date.now())
      return { status: 404, error: "This invitation is invalid or has expired" };
    const [person] = await tx.select().from(usersTable)
      .where(eq(usersTable.id, invitation.personId)).for("update");
    if (!person || !identity.emailVerified || !identity.email ||
      identity.email.toLowerCase() !== person.email?.toLowerCase())
      return { status: 403, error: "Sign in with the verified email address this invitation was sent to" };
    if (person.id !== localUser.id) {
      if (person.clerkUserId || invitation.acceptedAt)
        return { status: 403, error: "This invitation belongs to another account" };
      const reconciled = await reconcileInvitedPerson(
        tx, person.id, localUser.id, invitation.clubId, invitation.teamId,
      );
      if (!reconciled)
        return { status: 409, error: "This roster entry has existing history. Ask your club administrator to contact Nahreo so it can be safely linked to your existing account." };
    }
    const [membership] = await tx.select({ id: teamMembersTable.id }).from(teamMembersTable)
      .where(and(eq(teamMembersTable.teamId, invitation.teamId), eq(teamMembersTable.userId, localUser.id)));
    if (invitation.guardianPlayerId) {
      const [player] = await tx.select({ id: teamMembersTable.id }).from(teamMembersTable)
        .where(and(eq(teamMembersTable.teamId, invitation.teamId),
          eq(teamMembersTable.userId, invitation.guardianPlayerId), eq(teamMembersTable.role, "player")));
      if (!player || invitation.guardianPlayerId === localUser.id)
        return { status: 403, error: "This player is no longer on the team. Ask your club admin for a new invitation." };
      // Never reinstate a link removed after acceptance by replaying an old URL.
      const [existingLink] = await tx.select().from(guardianshipsTable).where(and(
        eq(guardianshipsTable.guardianId, localUser.id),
        eq(guardianshipsTable.playerId, invitation.guardianPlayerId)));
      if (invitation.acceptedAt && !existingLink?.canManage)
        return { status: 403, error: "This family link is no longer active. Ask your club admin for a new invitation." };
      if (!invitation.acceptedAt) await tx.insert(guardianshipsTable).values({
        guardianId: localUser.id, playerId: invitation.guardianPlayerId,
        relationship: "guardian", canManage: true,
      }).onConflictDoUpdate({
        target: [guardianshipsTable.guardianId, guardianshipsTable.playerId],
        set: { canManage: true },
      });
    } else if (!membership)
      return { status: 403, error: "You are no longer a member of this team. Ask for a new invitation to rejoin." };
    await tx.update(teamInvitationsTable).set({ acceptedAt: invitation.acceptedAt ?? new Date() })
      .where(eq(teamInvitationsTable.id, invitation.id));
    return { status: 200, clubId: invitation.clubId, teamId: invitation.teamId };
  });
  if ("error" in result)
    return res.status(result.status).json({ error: result.error });
  return res.json({
    accepted: true, clubId: result.clubId, teamId: result.teamId,
    });
});

export default router;