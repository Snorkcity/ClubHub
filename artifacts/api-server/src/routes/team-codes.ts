import { randomBytes } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { and, eq, sql } from "drizzle-orm";
import {
  db, teamsTable, clubsTable, usersTable, clubMembersTable, teamMembersTable,
  chatsTable, chatMembersTable, guardianshipsTable, teamJoinCodesTable, teamJoinRequestsTable,
  teamInvitationsTable,
} from "@workspace/db";
import {
  PreviewTeamCodeBody, JoinWithTeamCodeBody, ReviewTeamJoinRequestBody,
  GetTeamJoinCodeResponse, PreviewTeamCodeResponse, JoinWithTeamCodeResponse,
  GetTeamJoinRequestsResponse, ReviewTeamJoinRequestResponse,
} from "@workspace/api-zod";
import { findOrClaimUser, loadClerkIdentity, requireAuth, type AuthedRequest } from "../lib/auth";
import { isTeamStaff } from "../lib/authz";

const router = Router();
const APP_URL = (process.env.WEB_APP_URL ?? "https://app.nahreo.com").replace(/\/$/, "");
const normalize = (code: string) => code.replace(/[\s-]/g, "").toUpperCase();

// Bound in-memory abuse protection complements the unguessable 64-bit codes.
// Key by Clerk account for authenticated joins, IP for public lookups.
const attempts = new Map<string, { count: number; reset: number }>();
const codeLimit: RequestHandler = (req, res, next) => {
  const now = Date.now();
  const key = getAuth(req)?.userId ?? req.ip ?? "unknown";
  let bucket = attempts.get(key);
  if (!bucket || bucket.reset <= now) {
    if (attempts.size >= 10000) {
      for (const [k, b] of attempts) if (b.reset <= now) attempts.delete(k);
      if (attempts.size >= 10000) { res.status(429).json({ error: "Please try again shortly." }); return; }
    }
    bucket = { count: 0, reset: now + 60000 };
    attempts.set(key, bucket);
  }
  if (++bucket.count > 30) {
    res.setHeader("Retry-After", Math.ceil((bucket.reset - now) / 1000));
    res.status(429).json({ error: "Too many attempts. Please wait a minute." }); return;
  }
  next();
};

const staff: RequestHandler = async (req, res, next) => {
  const { localUser, clubId, isClubAdmin } = req as AuthedRequest;
  const teamId = Number(req.params.teamId);
  if (!Number.isSafeInteger(teamId) || teamId <= 0) {
    res.status(400).json({ error: "Invalid team" }); return;
  }
  if (!(await isTeamStaff(localUser.id, teamId, clubId, isClubAdmin))) {
    res.status(403).json({ error: "Only this team's coaches and admins can manage joining." }); return;
  }
  next();
};

function codeResult(code: string | null) {
  return GetTeamJoinCodeResponse.parse({
    code,
    link: code ? `${APP_URL}/join-team?code=${code}` : null,
  });
}

router.get("/teams/:teamId/join-code", requireAuth, staff, async (req, res) => {
  const [row] = await db.select().from(teamJoinCodesTable)
    .where(eq(teamJoinCodesTable.teamId, Number(req.params.teamId)));
  res.json(codeResult(row?.code ?? null));
});

router.post("/teams/:teamId/join-code", requireAuth, staff, async (req, res) => {
  const code = randomBytes(8).toString("hex").toUpperCase();
  await db.insert(teamJoinCodesTable).values({ teamId: Number(req.params.teamId), code })
    .onConflictDoUpdate({ target: teamJoinCodesTable.teamId, set: { code, updatedAt: new Date() } });
  res.json(codeResult(code));
});

router.delete("/teams/:teamId/join-code", requireAuth, staff, async (req, res) => {
  await db.update(teamJoinCodesTable).set({ code: null, updatedAt: new Date() })
    .where(eq(teamJoinCodesTable.teamId, Number(req.params.teamId)));
  res.sendStatus(204);
});

router.post("/team-codes/preview", codeLimit, async (req, res) => {
  const body = PreviewTeamCodeBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Enter a valid team code." }); return; }
  const [row] = await db.select({ teamName: teamsTable.name, clubName: clubsTable.name })
    .from(teamJoinCodesTable).innerJoin(teamsTable, eq(teamsTable.id, teamJoinCodesTable.teamId))
    .innerJoin(clubsTable, eq(clubsTable.id, teamsTable.clubId))
    .where(eq(teamJoinCodesTable.code, normalize(body.data.code)));
  if (!row) { res.status(404).json({ error: "This team code is invalid or has been disabled. Ask your coach for a current code." }); return; }
  res.json(PreviewTeamCodeResponse.parse(row));
});

router.post("/team-codes/join", codeLimit, async (req, res) => {
  const login = getAuth(req)?.userId;
  if (!login) { res.status(401).json({ error: "Sign in before joining a team." }); return; }
  const parsed = JoinWithTeamCodeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Check your name, team code and joining role." }); return; }
  const body = parsed.data;
  if (!body.firstName.trim() || !body.lastName.trim() || (body.role === "guardian" && !body.childName?.trim())) {
    res.status(400).json({ error: "Enter your name and, for guardians, your player's name." }); return;
  }
  const identity = await loadClerkIdentity(req, login);
  if (!identity.emailVerified || !identity.email) {
    res.status(403).json({ error: "Use Google sign-in or verify your email address before joining." }); return;
  }
  const email = identity.email.toLowerCase();
  await findOrClaimUser(req, login);
  const result = await db.transaction(async (tx) => {
    // Same email lock as invitation acceptance and first-login account claiming.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);
    const [code] = await tx.select().from(teamJoinCodesTable)
      .where(eq(teamJoinCodesTable.code, normalize(body.code))).for("update");
    if (!code) return { error: "This team code is invalid or has been disabled.", statusCode: 404 };
    const [team] = await tx.select().from(teamsTable).where(eq(teamsTable.id, code.teamId));
    if (!team) return { error: "Team not found.", statusCode: 404 };
    let [person] = await tx.select().from(usersTable).where(eq(usersTable.clerkUserId, login));
    if (!person) {
      const matches = await tx.select({ id: usersTable.id }).from(usersTable)
        .where(sql`lower(${usersTable.email}) = ${email}`);
      if (matches.length) return { error: "An existing roster entry needs to be linked to your account. Ask your club administrator for help; don't create a second player.", statusCode: 409 };
      [person] = await tx.insert(usersTable).values({
        clerkUserId: login, clubId: team.clubId, email,
        firstName: body.firstName.trim(), lastName: body.lastName.trim(),
        emailPrivacy: "private", phonePrivacy: "private",
      }).returning();
    }
    const base = { teamId: team.id, clubId: team.clubId };
    if (body.role === "guardian") {
      const linked = await tx.select({ id: guardianshipsTable.id }).from(guardianshipsTable)
        .innerJoin(teamMembersTable, and(eq(teamMembersTable.userId, guardianshipsTable.playerId),
          eq(teamMembersTable.teamId, team.id), eq(teamMembersTable.role, "player")))
        .where(and(eq(guardianshipsTable.guardianId, person.id), eq(guardianshipsTable.canManage, true)));
      if (!linked.length) {
        await tx.insert(teamJoinRequestsTable).values({
          teamId: team.id, userId: person.id, childName: body.childName!.trim(),
        }).onConflictDoNothing();
        const [request] = await tx.select().from(teamJoinRequestsTable)
          .where(and(eq(teamJoinRequestsTable.teamId, team.id), eq(teamJoinRequestsTable.userId, person.id))).for("update");
        // Approval may have committed while this join was waiting on the
        // request. Recheck after the lock, rather than reopening an approval
        // based on the earlier statement's snapshot.
        const confirmed = await tx.select({ id: guardianshipsTable.id }).from(guardianshipsTable)
          .innerJoin(teamMembersTable, and(eq(teamMembersTable.userId, guardianshipsTable.playerId),
            eq(teamMembersTable.teamId, team.id), eq(teamMembersTable.role, "player")))
          .where(and(eq(guardianshipsTable.guardianId, person.id), eq(guardianshipsTable.canManage, true)));
        if (!confirmed.length) {
          // A subsequently removed family link must never be re-granted by
          // a previously approved request.
          if (request.status === "approved") {
            await tx.update(teamJoinRequestsTable).set({ status: "pending", reviewedBy: null })
              .where(eq(teamJoinRequestsTable.id, request.id));
          }
          return { ...base, status: request.status === "rejected" ? "rejected" as const : "pending" as const };
        }
      }
    }
    await tx.insert(clubMembersTable).values({ clubId: team.clubId, userId: person.id, role: "member" }).onConflictDoNothing();
    if (body.role === "player") {
      // Never downgrade or add a spurious player role to existing staff.
      const membership = await tx.select().from(teamMembersTable)
        .where(and(eq(teamMembersTable.teamId, team.id), eq(teamMembersTable.userId, person.id)));
      const pendingInvites = await tx.select().from(teamInvitationsTable)
        .where(and(eq(teamInvitationsTable.teamId, team.id), eq(teamInvitationsTable.personId, person.id),
          sql`${teamInvitationsTable.acceptedAt} IS NULL`, sql`${teamInvitationsTable.guardianPlayerId} IS NULL`));
      if (pendingInvites.length && membership.some((m) => m.role !== "player"))
        return { error: "You have an individual staff invitation. Accept that invitation to activate your staff access.", statusCode: 409 };
      if (!membership.length) await tx.insert(teamMembersTable).values({ teamId: team.id, userId: person.id, role: "player" });
      await tx.update(teamInvitationsTable).set({ acceptedAt: new Date() })
        .where(and(eq(teamInvitationsTable.teamId, team.id), eq(teamInvitationsTable.personId, person.id),
          sql`${teamInvitationsTable.acceptedAt} IS NULL`, sql`${teamInvitationsTable.guardianPlayerId} IS NULL`));
    }
    const [chat] = await tx.select().from(chatsTable)
      .where(and(eq(chatsTable.teamId, team.id), eq(chatsTable.type, "team")));
    if (chat) await tx.insert(chatMembersTable).values({ chatId: chat.id, userId: person.id }).onConflictDoNothing();
    return { ...base, status: "joined" as const };
  });
  if ("error" in result) { res.status(result.statusCode!).json({ error: result.error }); return; }
  res.json(JoinWithTeamCodeResponse.parse(result));
});

router.get("/teams/:teamId/join-requests", requireAuth, staff, async (req, res) => {
  const rows = await db.select({
    id: teamJoinRequestsTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName,
    childName: teamJoinRequestsTable.childName, createdAt: teamJoinRequestsTable.createdAt,
  }).from(teamJoinRequestsTable).innerJoin(usersTable, eq(usersTable.id, teamJoinRequestsTable.userId))
    .where(and(eq(teamJoinRequestsTable.teamId, Number(req.params.teamId)), eq(teamJoinRequestsTable.status, "pending")));
  res.json(GetTeamJoinRequestsResponse.parse(rows.map((r) => ({
    id: r.id, name: `${r.firstName} ${r.lastName}`, childName: r.childName, createdAt: r.createdAt.toISOString(),
  }))));
});

router.post("/teams/:teamId/join-requests/:requestId", requireAuth, staff, async (req, res) => {
  const parsed = ReviewTeamJoinRequestBody.safeParse(req.body);
  if (!parsed.success || !Number.isSafeInteger(Number(req.params.requestId))) {
    res.status(400).json({ error: "Invalid review." }); return;
  }
  const { localUser, clubId } = req as AuthedRequest;
  const teamId = Number(req.params.teamId);
  const { decision, playerId } = parsed.data;
  const result = await db.transaction(async (tx) => {
    const [request] = await tx.select().from(teamJoinRequestsTable)
      .where(and(eq(teamJoinRequestsTable.id, Number(req.params.requestId)), eq(teamJoinRequestsTable.teamId, teamId))).for("update");
    if (!request) return { error: "Request not found.", statusCode: 404 };
    if (request.status !== "pending") return { error: "This request has already been reviewed.", statusCode: 409 };
    if (decision === "approve") {
      const [player] = await tx.select().from(teamMembersTable)
        .where(and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.userId, playerId ?? -1), eq(teamMembersTable.role, "player")));
      if (!player || player.userId === request.userId)
        return { error: "Select a different player on this team's roster.", statusCode: 400 };
      // Do not elevate an existing deliberately restricted family relationship.
      const [existing] = await tx.select().from(guardianshipsTable)
        .where(and(eq(guardianshipsTable.guardianId, request.userId), eq(guardianshipsTable.playerId, player.userId)));
      if (existing && !existing.canManage)
        return { error: "This family relationship is restricted. A club administrator must review it.", statusCode: 409 };
      await tx.insert(clubMembersTable).values({ clubId, userId: request.userId, role: "member" }).onConflictDoNothing();
      await tx.insert(guardianshipsTable).values({ guardianId: request.userId, playerId: player.userId, relationship: "parent", canManage: true }).onConflictDoNothing();
      await tx.update(teamInvitationsTable).set({ acceptedAt: new Date() })
        .where(and(eq(teamInvitationsTable.teamId, teamId), eq(teamInvitationsTable.personId, request.userId),
          eq(teamInvitationsTable.guardianPlayerId, player.userId), sql`${teamInvitationsTable.acceptedAt} IS NULL`));
      const [chat] = await tx.select().from(chatsTable)
        .where(and(eq(chatsTable.teamId, teamId), eq(chatsTable.type, "team")));
      if (chat) await tx.insert(chatMembersTable).values({ chatId: chat.id, userId: request.userId }).onConflictDoNothing();
    }
    const status = decision === "approve" ? "approved" as const : "rejected" as const;
    await tx.update(teamJoinRequestsTable).set({ status, reviewedBy: localUser.id })
      .where(eq(teamJoinRequestsTable.id, request.id));
    return { status };
  });
  if ("error" in result) { res.status(result.statusCode!).json({ error: result.error }); return; }
  res.json(ReviewTeamJoinRequestResponse.parse(result));
});

export default router;
