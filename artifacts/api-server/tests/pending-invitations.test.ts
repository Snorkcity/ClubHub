import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createHash, randomBytes } from "node:crypto";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, string> }) => ({ userId: req.headers["x-test-user"] ?? null }),
  clerkClient: { users: { getUser: async (id: string) => ({
    firstName: "Test", lastName: "Invitee", primaryEmailAddressId: "primary",
    emailAddresses: [{ id: "primary", emailAddress: `${id}@example.test`,
      verification: { status: id.includes("unverified") ? "unverified" : "verified" } }],
  }) } },
}));

import { and, eq } from "drizzle-orm";
import {
  db, pool, clubsTable, usersTable, teamsTable, teamMembersTable,
  clubMembersTable, teamInvitationsTable, guardianshipsTable,
} from "@workspace/db";
import app from "../src/app";

let clubId: number;
let teamId: number;
let playerId: number;
const as = (login: string) => ({ "x-test-user": login });

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("clubhub_test")) throw Error("Disposable test database required");
  clubId = (await db.insert(clubsTable).values({ name: "Pending invitations", countryCode: "AU" }).returning())[0].id;
  teamId = (await db.insert(teamsTable).values({ clubId, name: "U13 Rovers", ageGroup: "U13" }).returning())[0].id;
  playerId = (await db.insert(usersTable).values({ clubId, firstName: "Synthetic", lastName: "Child" }).returning())[0].id;
  await db.insert(teamMembersTable).values({ teamId, userId: playerId, role: "player" });
});
afterAll(() => pool.end());

async function fixture(login: string, role = "guardian") {
  const [person] = await db.insert(usersTable).values({
    clubId, firstName: "Pending", lastName: login, email: `${login}@example.test`,
    clerkUserId: login.includes("unclaimed") ? null : login,
  }).returning();
  await db.insert(clubMembersTable).values({ clubId, userId: person.id, role: "member" });
  if (role !== "guardian")
    await db.insert(teamMembersTable).values({ teamId, userId: person.id, role });
  const token = randomBytes(32).toString("base64url");
  const [invitation] = await db.insert(teamInvitationsTable).values({
    clubId, teamId, personId: person.id, invitedByUserId: playerId,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    guardianPlayerId: role === "guardian" ? playerId : null,
    expiresAt: new Date(Date.now() + 86400000),
  }).returning();
  return { person, invitation, token };
}

describe("Recovering unfinished team invitations", () => {
  it("requires a signed-in account", async () => {
    expect((await request(app).get("/api/team-invitations/pending")).status).toBe(401);
    expect((await request(app).post("/api/team-invitations/1/accept")).status).toBe(401);
  });

  it("finds a first-login parent's invitation and accepts without the original email or token", async () => {
    const login = "pending_unclaimed_parent";
    const { person, invitation } = await fixture(login);
    const pending = await request(app).get("/api/team-invitations/pending").set(as(login));
    expect(pending.status).toBe(200);
    expect(pending.body).toEqual({
      hasEstablishedAccess: false,
      invitations: [expect.objectContaining({ id: invitation.id, teamId, teamName: "U13 Rovers", role: "guardian" })],
    });
    expect(JSON.stringify(pending.body)).not.toMatch(/tokenHash|token_hash|inviteLink/);
    expect(await db.select().from(guardianshipsTable).where(eq(guardianshipsTable.guardianId, person.id))).toHaveLength(0);
    const accepted = await request(app).post(`/api/team-invitations/${invitation.id}/accept`).set(as(login));
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({ accepted: true, clubId, teamId });
    expect(await db.select().from(guardianshipsTable).where(eq(guardianshipsTable.guardianId, person.id)))
      .toEqual([expect.objectContaining({ playerId, canManage: true })]);
    expect(await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, person.id))).toHaveLength(0);
    const after = await request(app).get("/api/team-invitations/pending").set(as(login));
    expect(after.body).toEqual({ invitations: [], hasEstablishedAccess: true });
  });

  it("does not count pre-provisioned player membership as a completed first join", async () => {
    const login = "pending_player";
    const { invitation } = await fixture(login, "player");
    expect((await request(app).get("/api/team-invitations/pending").set(as(login))).body)
      .toEqual({ hasEstablishedAccess: false, invitations: [expect.objectContaining({ id: invitation.id, role: "player" })] });
    expect((await request(app).post(`/api/team-invitations/${invitation.id}/accept`).set(as(login))).status).toBe(200);
    expect((await request(app).get("/api/team-invitations/pending").set(as(login))).body)
      .toEqual({ invitations: [], hasEstablishedAccess: true });
  });

  it("preserves access to existing teams while another invitation is pending", async () => {
    const login = "pending_existing";
    await fixture(login);
    const [person] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, login));
    const [otherTeam] = await db.insert(teamsTable).values({ clubId, name: "Existing U14", ageGroup: "U14" }).returning();
    await db.insert(teamMembersTable).values({ teamId: otherTeam.id, userId: person.id, role: "coach" });
    const pending = await request(app).get("/api/team-invitations/pending").set(as(login));
    expect(pending.body.hasEstablishedAccess).toBe(true);
    expect(pending.body.invitations).toHaveLength(1);
    expect((await db.select().from(teamMembersTable).where(and(eq(teamMembersTable.teamId, otherTeam.id), eq(teamMembersTable.userId, person.id))))[0].role).toBe("coach");
  });

  it("does not hide access to a different club", async () => {
    const login = "pending_other_club";
    const { person } = await fixture(login);
    const [otherClub] = await db.insert(clubsTable).values({ name: "Already joined", countryCode: "AU" }).returning();
    await db.insert(clubMembersTable).values({ clubId: otherClub.id, userId: person.id, role: "member" });
    expect((await request(app).get("/api/team-invitations/pending").set(as(login))).body.hasEstablishedAccess).toBe(true);
  });

  it("lists only the verified account's own invitations and rejects guessed IDs", async () => {
    const owner = await fixture("pending_private_owner");
    const other = "pending_private_other";
    const otherFixture = await fixture(other);
    const pending = await request(app).get("/api/team-invitations/pending").set(as(other));
    expect(pending.body.invitations.map((i: { id: number }) => i.id)).toEqual([otherFixture.invitation.id]);
    expect((await request(app).post(`/api/team-invitations/${owner.invitation.id}/accept`).set(as(other))).status).toBe(403);
    expect((await db.select().from(teamInvitationsTable).where(eq(teamInvitationsTable.id, owner.invitation.id)))[0].acceptedAt).toBeNull();
  });

  it("does not expose or accept invitations for unverified emails", async () => {
    const login = "pending_unverified";
    const { invitation } = await fixture(login);
    expect((await request(app).get("/api/team-invitations/pending").set(as(login))).status).toBe(403);
    expect((await request(app).post(`/api/team-invitations/${invitation.id}/accept`).set(as(login))).status).toBe(403);
  });

  it("omits expired invitations and will not accept them by ID", async () => {
    const login = "pending_expired";
    const { invitation } = await fixture(login);
    await db.update(teamInvitationsTable).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(teamInvitationsTable.id, invitation.id));
    expect((await request(app).get("/api/team-invitations/pending").set(as(login))).body.invitations).toEqual([]);
    expect((await request(app).post(`/api/team-invitations/${invitation.id}/accept`).set(as(login))).status).toBe(404);
  });

  it("cannot restore a removed family link by replaying an accepted ID", async () => {
    const login = "pending_revoked";
    const { person, invitation } = await fixture(login);
    expect((await request(app).post(`/api/team-invitations/${invitation.id}/accept`).set(as(login))).status).toBe(200);
    await db.update(guardianshipsTable).set({ canManage: false }).where(eq(guardianshipsTable.guardianId, person.id));
    expect((await request(app).post(`/api/team-invitations/${invitation.id}/accept`).set(as(login))).status).toBe(403);
    expect((await db.select().from(guardianshipsTable).where(eq(guardianshipsTable.guardianId, person.id)))[0].canManage).toBe(false);
  });
});
