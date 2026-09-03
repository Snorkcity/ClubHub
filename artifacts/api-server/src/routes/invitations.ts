import { Router, type IRouter } from "express";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  chatMembersTable,
  chatsTable,
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
import { requireAuth, type AuthedRequest } from "../lib/auth";
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
    .innerJoin(
      teamMembersTable,
      and(
        eq(teamMembersTable.userId, teamInvitationsTable.personId),
        eq(teamMembersTable.teamId, teamInvitationsTable.teamId),
      ),
    )
    .where(eq(teamInvitationsTable.tokenHash, tokenHash(token)));
  return row ?? null;
}

router.get("/team-invitations/preview", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const row = await findInvitation(token);
  if (!row || row.invitation.expiresAt.getTime() <= Date.now())
    return res.status(404).json({ error: "This invitation is invalid or has expired" });
  return res.json({
    firstName: row.firstName,
    teamName: row.teamName,
    role: row.role,
    expiresAt: row.invitation.expiresAt.toISOString(),
    accepted: !!row.invitation.acceptedAt || !!row.clerkUserId,
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

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.clubId, clubId),
        sql`lower(${usersTable.email}) = ${email}`,
      ),
    );
  if (existing.length)
    return res.status(409).json({
      error: "A person with this email already exists. Add them from the club directory instead.",
    });

  const token = randomBytes(32).toString("base64url");
  const expiresAtDate = new Date(Date.now() + INVITE_LIFETIME_MS);
  const person = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(usersTable)
      .values({
        clubId,
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        email,
      })
      .returning();
    await tx.insert(teamMembersTable).values({
      teamId: team.id,
      userId: created.id,
      role: body.role,
    });
    const [teamChat] = await tx
      .select({ id: chatsTable.id })
      .from(chatsTable)
      .where(and(eq(chatsTable.teamId, team.id), eq(chatsTable.type, "team")));
    if (teamChat)
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
    });
    return created;
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

router.post("/team-invitations/accept", requireAuth, async (req, res) => {
  const { localUser } = req as AuthedRequest;
  const body = AcceptTeamInvitationBody.parse(req.body);
  const row = await findInvitation(body.token);
  if (!row || row.invitation.expiresAt.getTime() <= Date.now())
    return res.status(404).json({ error: "This invitation is invalid or has expired" });
  if (row.invitation.personId !== localUser.id)
    return res.status(403).json({
      error: "Sign in with the email address this invitation was sent to",
    });
  if (!row.invitation.acceptedAt) {
    await db
      .update(teamInvitationsTable)
      .set({ acceptedAt: new Date() })
      .where(
        and(
          eq(teamInvitationsTable.id, row.invitation.id),
          isNull(teamInvitationsTable.acceptedAt),
          gt(teamInvitationsTable.expiresAt, new Date()),
        ),
      );
  }
  return res.json({ accepted: true, teamId: row.invitation.teamId });
});

export default router;