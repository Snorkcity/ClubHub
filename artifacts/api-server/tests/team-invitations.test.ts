import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createHash, randomBytes } from "node:crypto";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, string> }) => ({
    userId: req.headers["x-test-user"] ?? null,
  }),
  clerkClient: { users: { getUser: async (id: string) => ({
    firstName: "Test", lastName: "Coach", primaryEmailAddressId: "primary",
    emailAddresses: [{
      id: "primary", emailAddress: `${id}@example.test`,
      verification: { status: id.includes("unverified") ? "unverified" : "verified" },
    }],
  }) } },
}));

import { eq, sql } from "drizzle-orm";
import {
  db, pool, clubsTable, usersTable, teamsTable, teamMembersTable,
  clubMembersTable, chatsTable, chatMembersTable, teamInvitationsTable, teamReadsTable,
} from "@workspace/db";
import app from "../src/app";

let homeClub: number;
let destinationClub: number;
let teamId: number;
let chatId: number;
let adminId: number;
const adminLogin = "test_invite_admin";
const as = (id: string) => ({ "x-test-user": id });
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("clubhub_test"))
    throw Error("Disposable test database required");
  const clubs = await db.insert(clubsTable).values([
    { name: "Invitation test Riverside", countryCode: "AU" },
    { name: "Invitation test Belconnen", countryCode: "AU" },
  ]).returning();
  homeClub = clubs[0].id;
  destinationClub = clubs[1].id;
  const [team] = await db.insert(teamsTable).values({
    clubId: destinationClub, name: "NPLM", ageGroup: "Open",
  }).returning();
  teamId = team.id;
  const [chat] = await db.insert(chatsTable).values({
    clubId: destinationClub, teamId, name: "NPLM", type: "team",
  }).returning();
  chatId = chat.id;
  const [admin] = await db.insert(usersTable).values({
    clubId: destinationClub, clerkUserId: adminLogin,
    email: `${adminLogin}@example.test`, firstName: "Test", lastName: "Admin",
  }).returning();
  adminId = admin.id;
  await db.insert(clubMembersTable).values({
    clubId: destinationClub, userId: adminId, role: "admin",
  });
});
afterAll(() => pool.end());

async function account(login: string) {
  const person = (await db.insert(usersTable).values({
    clubId: homeClub, clerkUserId: login, email: `${login}@example.test`,
    firstName: "Existing", lastName: "Coach",
  }).returning())[0];
  await db.insert(clubMembersTable).values({ clubId: homeClub, userId: person.id, role: "member" });
  return person;
}

async function legacyInvitation(login: string) {
  const existing = await account(login);
  const [placeholder] = await db.insert(usersTable).values({
    clubId: destinationClub, email: `${login}@example.test`,
    firstName: "Invited", lastName: "Coach",
  }).returning();
  await db.insert(clubMembersTable).values({
    clubId: destinationClub, userId: placeholder.id, role: "member",
  });
  await db.insert(teamMembersTable).values({
    teamId, userId: placeholder.id, role: "coach",
  });
  await db.insert(chatMembersTable).values({ chatId, userId: placeholder.id });
  const token = randomBytes(32).toString("base64url");
  const [invitation] = await db.insert(teamInvitationsTable).values({
    clubId: destinationClub, teamId, personId: placeholder.id,
    invitedByUserId: adminId, tokenHash: hash(token),
    expiresAt: new Date(Date.now() + 86400000),
  }).returning();
  return { existing, placeholder, invitation, token };
}

describe("one account across club invitations", () => {
  it("reuses an existing account and preserves its home club", async () => {
    const login = "test_invite_existing";
    const existing = await account(login);
    const created = await request(app).post("/api/team-invitations").set(as(adminLogin)).send({
      teamId, firstName: "Existing", lastName: "Coach",
      email: `${login.toUpperCase()}@EXAMPLE.TEST`, role: "coach", deliveryMethod: "link",
    });
    expect(created.status).toBe(201);
    const token = new URL(created.body.inviteLink).searchParams.get("token");
    const [invitation] = await db.select().from(teamInvitationsTable)
      .where(eq(teamInvitationsTable.tokenHash, hash(token!)));
    expect(invitation.personId).toBe(existing.id);
    const preview = await request(app).get("/api/team-invitations/preview").query({ token });
    expect(preview.body.accepted).toBe(false); // Having a login is not acceptance.
    const accepted = await request(app).post("/api/team-invitations/accept")
      .set(as(login)).send({ token });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({ accepted: true, teamId, clubId: destinationClub });
    const people = await db.select().from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${`${login}@example.test`}`);
    expect(people).toHaveLength(1);
    expect(people[0].clubId).toBe(homeClub);
    const selected = await request(app).get("/api/me").set(as(login))
      .set("X-Nahreo-Club", String(destinationClub));
    expect(selected.status).toBe(200);
    expect(selected.body.memberships.some((row: { teamId: number }) => row.teamId === teamId)).toBe(true);
  });

  it("links an already-issued legacy invitation without a second account", async () => {
    const login = "test_invite_legacy";
    const fixture = await legacyInvitation(login);
    const accepted = await request(app).post("/api/team-invitations/accept")
      .set(as(login)).send({ token: fixture.token });
    expect(accepted.status).toBe(200);
    expect(accepted.body.clubId).toBe(destinationClub);
    expect(await db.select().from(usersTable).where(eq(usersTable.id, fixture.placeholder.id))).toHaveLength(0);
    const [updated] = await db.select().from(teamInvitationsTable)
      .where(eq(teamInvitationsTable.id, fixture.invitation.id));
    expect(updated.personId).toBe(fixture.existing.id);
    expect(updated.acceptedAt).not.toBeNull();
    expect(await db.select().from(chatMembersTable)
      .where(eq(chatMembersTable.userId, fixture.existing.id))).toHaveLength(1);
    const again = await request(app).post("/api/team-invitations/accept")
      .set(as(login)).send({ token: fixture.token });
    expect(again.status).toBe(200);
    const [person] = await db.select().from(usersTable).where(eq(usersTable.id, fixture.existing.id));
    expect(person.clubId).toBe(homeClub);
  });

  it("rejects a different signed-in email without modifying the invitation", async () => {
    const fixture = await legacyInvitation("test_invite_recipient");
    await account("test_invite_wrong");
    const result = await request(app).post("/api/team-invitations/accept")
      .set(as("test_invite_wrong")).send({ token: fixture.token });
    expect(result.status).toBe(403);
    const [unchanged] = await db.select().from(teamInvitationsTable)
      .where(eq(teamInvitationsTable.id, fixture.invitation.id));
    expect(unchanged.personId).toBe(fixture.placeholder.id);
    expect(unchanged.acceptedAt).toBeNull();
  });

  it("rejects an unverified email", async () => {
    const login = "test_invite_unverified";
    const fixture = await legacyInvitation(login);
    const result = await request(app).post("/api/team-invitations/accept")
      .set(as(login)).send({ token: fixture.token });
    expect(result.status).toBe(403);
  });

  it("never deletes a roster profile containing history", async () => {
    const login = "test_invite_history";
    const fixture = await legacyInvitation(login);
    await db.insert(teamReadsTable).values({ userId: fixture.placeholder.id, teamId });
    const result = await request(app).post("/api/team-invitations/accept")
      .set(as(login)).send({ token: fixture.token });
    expect(result.status).toBe(409);
    expect(await db.select().from(usersTable).where(eq(usersTable.id, fixture.placeholder.id))).toHaveLength(1);
    const [invitation] = await db.select().from(teamInvitationsTable)
      .where(eq(teamInvitationsTable.id, fixture.invitation.id));
    expect(invitation.acceptedAt).toBeNull();
  });

  it("lets a new user claim their invitation and join normally", async () => {
    const login = "test_invite_brandnew";
    const created = await request(app).post("/api/team-invitations").set(as(adminLogin)).send({
      teamId, firstName: "New", lastName: "Player",
      email: `${login}@example.test`, role: "player", deliveryMethod: "link",
    });
    expect(created.status).toBe(201);
    const token = new URL(created.body.inviteLink).searchParams.get("token");
    const accepted = await request(app).post("/api/team-invitations/accept").set(as(login)).send({ token });
    expect(accepted.status).toBe(200);
  });

  it("does not let a player invite people", async () => {
    const denied = await request(app).post("/api/team-invitations").set(as("test_invite_brandnew")).send({
      teamId, firstName: "No", lastName: "Access",
      email: "not-invited@example.test", role: "coach", deliveryMethod: "link",
    });
    expect(denied.status).toBe(403);
  });
});
