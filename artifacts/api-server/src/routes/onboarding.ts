import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  chatMembersTable,
  chatsTable,
  clubMembersTable,
  clubsTable,
  db,
  teamMembersTable,
  teamsTable,
  usersTable,
  clubSetupInvitationsTable,
} from "@workspace/db";
import {
  CompleteOnboardingBody,
  CompleteOnboardingResponse,
  GetOnboardingStatusResponse,
  normalizeTeamAgeGroup,
} from "@workspace/api-zod";
import { findOrClaimUser, loadClerkIdentity } from "../lib/auth";
import { readClubLogo } from "../lib/club-logo";
import { getClubSetupAccess } from "../lib/club-setup-access";

const router: IRouter = Router();

router.get("/onboarding/status", async (req, res) => {
  const clerkUserId = getAuth(req)?.userId;
  if (!clerkUserId) return res.status(401).json({ error: "Unauthorized" });
  const { user } = await findOrClaimUser(req, clerkUserId);
  const identity = await loadClerkIdentity(req, clerkUserId);
  const token = typeof req.query.invitation === "string" ? req.query.invitation : undefined;
  const access = await getClubSetupAccess(identity, token);
  return res.json(
    GetOnboardingStatusResponse.parse({
      needsOnboarding: !user, canCreateClub: access.allowed,
      isPlatformOwner: access.owner, accessMessage: access.message,
    }),
  );
});

router.post("/onboarding", async (req, res) => {
  const clerkUserId = getAuth(req)?.userId;
  if (!clerkUserId) return res.status(401).json({ error: "Unauthorized" });
  const body = CompleteOnboardingBody.parse(req.body);
  if (!normalizeTeamAgeGroup(body.ageGroup))
    return res.status(400).json({ error: "Choose an age group such as U14 or Seniors." });
  if (body.logoImageData) {
    try {
      readClubLogo(body.logoImageData);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  }
  await findOrClaimUser(req, clerkUserId);
  const identity = await loadClerkIdentity(req, clerkUserId);
  const access = await getClubSetupAccess(identity, body.invitation);
  if (!access.allowed)
    return res.status(403).json({ error: access.message });

  let result: { clubId: number; teamId: number } | null;
  try {
    result = await db.transaction(async (tx) => {
      // Serialise setup for the identity, then lock and consume an invitation
      // in this same transaction. Failed creation never burns an invitation.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${clerkUserId}))`);
      if (access.invitationId) {
        const [usable] = await tx.select().from(clubSetupInvitationsTable)
          .where(and(eq(clubSetupInvitationsTable.id, access.invitationId),
            isNull(clubSetupInvitationsTable.usedAt), isNull(clubSetupInvitationsTable.revokedAt),
            gt(clubSetupInvitationsTable.expiresAt, new Date()))).for("update");
        if (!usable) return null;
      }
      const [existingUser] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.clerkUserId, clerkUserId));

      const [club] = await tx
        .insert(clubsTable)
        .values({
          name: body.clubName.trim(),
          logoUrl: body.logoImageData ?? null,
          countryCode: body.countryCode,
        })
        .returning();
      const user = existingUser ?? (await tx
        .insert(usersTable)
        .values({
          clubId: club.id,
          clerkUserId,
          firstName: body.firstName.trim(),
          lastName: body.lastName.trim(),
          email: identity.email,
        })
        .returning())[0];
      await tx.insert(clubMembersTable).values({
        clubId: club.id,
        userId: user.id,
        role: "admin",
      });
      const [team] = await tx
        .insert(teamsTable)
        .values({
          clubId: club.id,
          name: body.teamName.trim(),
          ageGroup: normalizeTeamAgeGroup(body.ageGroup)!,
          gender: body.gender?.trim() || null,
        })
        .returning();
      await tx.insert(teamMembersTable).values({
        teamId: team.id,
        userId: user.id,
        role: "manager",
      });
      const [chat] = await tx
        .insert(chatsTable)
        .values({
          clubId: club.id,
          teamId: team.id,
          type: "team",
          name: "Team chat",
        })
        .returning();
      await tx.insert(chatMembersTable).values({
        chatId: chat.id,
        userId: user.id,
      });
      if (access.invitationId) {
        await tx.update(clubSetupInvitationsTable).set({
          usedAt: new Date(), usedBy: user.id, clubId: club.id,
        }).where(eq(clubSetupInvitationsTable.id, access.invitationId));
      }
      return { clubId: club.id, teamId: team.id };
    });
  } catch (error) {
    if ((error as { code?: string; cause?: { code?: string } }).code === "23505" ||
        (error as { cause?: { code?: string } }).cause?.code === "23505")
      return res
        .status(409)
        .json({ error: "Setup changed in another request. Please reload and try again." });
    throw error;
  }

  if (!result)
    return res.status(409).json({ error: "This invitation has already been used or is no longer available." });
  return res.status(201).json(CompleteOnboardingResponse.parse(result));
});

export default router;