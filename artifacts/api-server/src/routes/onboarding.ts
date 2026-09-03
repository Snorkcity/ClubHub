import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import {
  chatMembersTable,
  chatsTable,
  clubMembersTable,
  clubsTable,
  db,
  teamMembersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";
import {
  CompleteOnboardingBody,
  CompleteOnboardingResponse,
  GetOnboardingStatusResponse,
} from "@workspace/api-zod";
import { findOrClaimUser, loadClerkIdentity } from "../lib/auth";

const router: IRouter = Router();

router.get("/onboarding/status", async (req, res) => {
  const clerkUserId = getAuth(req)?.userId;
  if (!clerkUserId) return res.status(401).json({ error: "Unauthorized" });
  const { user } = await findOrClaimUser(req, clerkUserId);
  return res.json(
    GetOnboardingStatusResponse.parse({ needsOnboarding: !user }),
  );
});

router.post("/onboarding", async (req, res) => {
  const clerkUserId = getAuth(req)?.userId;
  if (!clerkUserId) return res.status(401).json({ error: "Unauthorized" });
  const body = CompleteOnboardingBody.parse(req.body);
  const existing = await findOrClaimUser(req, clerkUserId);
  if (existing.user)
    return res.status(409).json({ error: "This account already belongs to a club" });
  const identity =
    existing.identity ?? (await loadClerkIdentity(req, clerkUserId));

  let result: { clubId: number; teamId: number } | null;
  try {
    result = await db.transaction(async (tx) => {
      const [raceWinner] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.clerkUserId, clerkUserId));
      if (raceWinner) return null;

      const [club] = await tx
        .insert(clubsTable)
        .values({
          name: body.clubName.trim(),
          countryCode: body.countryCode,
        })
        .returning();
      const [user] = await tx
        .insert(usersTable)
        .values({
          clubId: club.id,
          clerkUserId,
          firstName: body.firstName.trim(),
          lastName: body.lastName.trim(),
          email: identity.email,
        })
        .returning();
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
          ageGroup: body.ageGroup.trim(),
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
      return { clubId: club.id, teamId: team.id };
    });
  } catch (error) {
    const [raceWinner] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkUserId));
    if (raceWinner)
      return res
        .status(409)
        .json({ error: "This account already belongs to a club" });
    throw error;
  }

  if (!result)
    return res.status(409).json({ error: "This account already belongs to a club" });
  return res.status(201).json(CompleteOnboardingResponse.parse(result));
});

export default router;