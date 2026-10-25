import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, clubsTable, clubMembersTable, clubSetupInvitationsTable } from "@workspace/db";
import {
  CreateClubSetupInvitationBody, CreateClubSetupInvitationResponse,
  ListClubSetupInvitationsResponse, GetPlatformAccessResponse,
} from "@workspace/api-zod";
import { findOrClaimUser, loadClerkIdentity } from "../lib/auth";
import { hashSetupToken, isNahreoOwner } from "../lib/club-setup-access";

const router: IRouter = Router();
type Invitation = typeof clubSetupInvitationsTable.$inferSelect;
const serialize = (row: Invitation) => ({
  id: row.id, email: row.email, createdAt: row.createdAt.toISOString(),
  expiresAt: row.expiresAt.toISOString(),
  status: row.usedAt ? "used" : row.revokedAt ? "revoked" : row.expiresAt <= new Date() ? "expired" : "pending",
});

router.get("/platform/access", async (req, res) => {
  const clerkId = getAuth(req)?.userId;
  if (!clerkId) return res.status(401).json({ error: "Unauthorized" });
  const identity = await loadClerkIdentity(req, clerkId);
  const { user } = await findOrClaimUser(req, clerkId);
  const clubs = user ? await db.select({ id: clubsTable.id, name: clubsTable.name, role: clubMembersTable.role })
    .from(clubMembersTable).innerJoin(clubsTable, eq(clubsTable.id, clubMembersTable.clubId))
    .where(eq(clubMembersTable.userId, user.id)).orderBy(clubsTable.name) : [];
  return res.json(GetPlatformAccessResponse.parse({ isPlatformOwner: await isNahreoOwner(identity), clubs }));
});

router.use("/platform/club-invitations", async (req, res, next) => {
  const clerkId = getAuth(req)?.userId;
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!await isNahreoOwner(await loadClerkIdentity(req, clerkId))) {
    res.status(403).json({ error: "Only the Nahreo owner can authorise new clubs" }); return;
  }
  next();
});

router.get("/platform/club-invitations", async (_req, res) => {
  const rows = await db.select().from(clubSetupInvitationsTable).orderBy(desc(clubSetupInvitationsTable.id));
  return res.json(ListClubSetupInvitationsResponse.parse(rows.map(serialize)));
});

router.post("/platform/club-invitations", async (req, res) => {
  const parsed = CreateClubSetupInvitationBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email address" });
  const email = parsed.data.email.trim().toLowerCase();
  const token = randomBytes(32).toString("hex");
  const [row] = await db.insert(clubSetupInvitationsTable).values({
    email, tokenHash: hashSetupToken(token), invitedBy: getAuth(req)!.userId!,
    expiresAt: new Date(Date.now() + 7 * 86400000),
  }).returning();
  // Return a shareable link explicitly: no best-effort email can be mistaken
  // for successful delivery. The owner chooses who receives it.
  const base = (process.env.WEB_APP_URL || "https://app.nahreo.com").replace(/\/$/, "");
  return res.status(201).json(CreateClubSetupInvitationResponse.parse({
    invitation: serialize(row), setupUrl: `${base}/get-started?invitation=${token}`,
  }));
});

router.delete("/platform/club-invitations/:invitationId", async (req, res) => {
  const invitationId = Number(req.params.invitationId);
  if (!Number.isSafeInteger(invitationId) || invitationId <= 0)
    return res.status(400).json({ error: "Invalid invitation" });
  const [row] = await db.update(clubSetupInvitationsTable).set({ revokedAt: new Date() })
    .where(and(eq(clubSetupInvitationsTable.id, invitationId), isNull(clubSetupInvitationsTable.usedAt))).returning();
  if (!row) return res.status(409).json({ error: "Invitation does not exist or has already been used" });
  return res.status(204).end();
});

export default router;
