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
  guardianshipsTable,
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

  it("creates an email-less player atomically with ordinary club and player memberships", async () => {
    const created = await request(app).post("/api/people").set(as(adminLogin)).send({
      firstName: "Junior", lastName: "NoEmail", teamId,
    });
    expect(created.status).toBe(201);
    const [person] = await db.select().from(usersTable).where(eq(usersTable.id, created.body.id));
    expect(person.email).toBeNull();
    expect(person.clerkUserId).toBeNull();
    expect(await db.select().from(clubMembersTable).where(eq(clubMembersTable.userId, person.id)))
      .toEqual([expect.objectContaining({ clubId: destinationClub, role: "member" })]);
    expect(await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, person.id)))
      .toEqual([expect.objectContaining({ teamId, role: "player" })]);
  });

  async function guardianInvite(login: string, playerId: number) {
    return request(app).post("/api/team-invitations").set(as(adminLogin)).send({
      teamId, firstName: "Adult", lastName: "Guardian", email: `${login}@example.test`,
      role: "guardian", guardianPlayerId: playerId, deliveryMethod: "link",
    });
  }

  async function junior() {
    const created = await request(app).post("/api/people").set(as(adminLogin)).send({
      firstName: "Junior", lastName: "GuardianTest", teamId,
    });
    expect(created.status).toBe(201);
    return created.body.id as number;
  }

  it("admits a brand-new guardian only after verified acceptance, never as staff or player", async () => {
    const playerId = await junior();
    const login = "test_guardian_new";
    const created = await guardianInvite(login, playerId);
    expect(created.status).toBe(201);
    const token = new URL(created.body.inviteLink).searchParams.get("token")!;
    const preview = await request(app).get("/api/team-invitations/preview").query({ token });
    expect(preview.status).toBe(200);
    expect(preview.body.role).toBe("guardian");
    const [invite] = await db.select().from(teamInvitationsTable)
      .where(eq(teamInvitationsTable.tokenHash, hash(token)));
    expect(await db.select().from(guardianshipsTable).where(eq(guardianshipsTable.guardianId, invite.personId))).toHaveLength(0);
    expect(await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, invite.personId))).toHaveLength(0);
    expect(await db.select().from(chatMembersTable).where(eq(chatMembersTable.userId, invite.personId))).toHaveLength(0);
    const accepted = await request(app).post("/api/team-invitations/accept").set(as(login)).send({ token });
    expect(accepted.status).toBe(200);
    const me = await request(app).get("/api/me").set(as(login)).set("X-Nahreo-Club", String(destinationClub));
    expect(me.status).toBe(200);
    expect(me.body.isClubAdmin).toBe(false);
    expect(me.body.memberships).toHaveLength(0);
    expect(me.body.guardianOf.map((p: { id: number }) => p.id)).toContain(playerId);
    const [link] = await db.select().from(guardianshipsTable).where(eq(guardianshipsTable.guardianId, invite.personId));
    expect(link.canManage).toBe(true);
    const again = await request(app).post("/api/team-invitations/accept").set(as(login)).send({ token });
    expect(again.status).toBe(200);
    await db.delete(guardianshipsTable).where(eq(guardianshipsTable.id, link.id));
    const revoked = await request(app).post("/api/team-invitations/accept").set(as(login)).send({ token });
    expect(revoked.status).toBe(403);
    expect(await db.select().from(guardianshipsTable).where(eq(guardianshipsTable.guardianId, invite.personId))).toHaveLength(0);
  });

  it("reuses an existing guardian's permanent account across clubs", async () => {
    const login = "test_guardian_existing";
    const existing = await account(login);
    const playerId = await junior();
    const created = await guardianInvite(login, playerId);
    expect(created.status).toBe(201);
    const token = new URL(created.body.inviteLink).searchParams.get("token")!;
    const accepted = await request(app).post("/api/team-invitations/accept").set(as(login)).send({ token });
    expect(accepted.status).toBe(200);
    const [person] = await db.select().from(usersTable).where(eq(usersTable.id, existing.id));
    expect(person.clubId).toBe(homeClub);
    expect(await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, existing.id))).toHaveLength(0);
    const [link] = await db.select().from(guardianshipsTable).where(eq(guardianshipsTable.guardianId, existing.id));
    expect(link.playerId).toBe(playerId);
  });

  it("rejects wrong and unverified guardian emails, expired invitations and departed players", async () => {
    for (const login of ["test_guardian_target", "test_guardian_unverified", "test_guardian_expired", "test_guardian_departed"]) {
      await account(login);
      const playerId = await junior();
      const created = await guardianInvite(login, playerId);
      expect(created.status).toBe(201);
      const token = new URL(created.body.inviteLink).searchParams.get("token")!;
      if (login.endsWith("expired"))
        await db.update(teamInvitationsTable).set({ expiresAt: new Date(0) }).where(eq(teamInvitationsTable.tokenHash, hash(token)));
      if (login.endsWith("departed"))
        await db.delete(teamMembersTable).where(eq(teamMembersTable.userId, playerId));
      const result = await request(app).post("/api/team-invitations/accept")
        .set(as(login.endsWith("target") ? adminLogin : login)).send({ token });
      expect(result.status).toBe(login.endsWith("expired") ? 404 : 403);
      expect(await db.select().from(guardianshipsTable).where(eq(guardianshipsTable.playerId, playerId))).toHaveLength(0);
    }
  });

  it("lets team coaches invite a guardian and accept without granting team or staff membership", async () => {
    const login = "test_guardian_coach";
    const coach = await account(login);
    await db.insert(clubMembersTable).values({ clubId: destinationClub, userId: coach.id, role: "member" });
    await db.insert(teamMembersTable).values({ teamId, userId: coach.id, role: "coach" });
    const playerId = await junior();
    const parentLogin = "test_coach_invited_guardian";
    const created = await request(app).post("/api/team-invitations")
      .set(as(login)).set("X-Nahreo-Club", String(destinationClub)).send({
        teamId, firstName: "Adult", lastName: "Guardian", email: `${parentLogin}@example.test`,
        role: "guardian", guardianPlayerId: playerId, deliveryMethod: "link",
      });
    expect(created.status).toBe(201);
    await account(parentLogin);
    const token = new URL(created.body.inviteLink).searchParams.get("token")!;
    const accepted = await request(app).post("/api/team-invitations/accept")
      .set(as(parentLogin)).send({ token });
    expect(accepted.status).toBe(200);
    const [parent] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, parentLogin));
    expect(await db.select().from(guardianshipsTable).where(eq(guardianshipsTable.guardianId, parent.id)))
      .toEqual([expect.objectContaining({ playerId, canManage: true })]);
    expect(await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, parent.id))).toHaveLength(0);
    const noPlayer = await request(app).post("/api/people").set(as(login))
      .set("X-Nahreo-Club", String(destinationClub)).send({ firstName: "No", lastName: "Access", teamId });
    expect(noPlayer.status).toBe(403);
  });

  it("keeps guardian invitations within the staff member's own team and club", async () => {
    const playerId = await junior();
    const [otherTeam] = await db.insert(teamsTable).values({
      clubId: destinationClub, name: "Other guardian team", ageGroup: "U14",
    }).returning();
    const [otherPlayer] = await db.insert(usersTable).values({
      clubId: destinationClub, firstName: "Other", lastName: "Player",
    }).returning();
    await db.insert(teamMembersTable).values({ teamId: otherTeam.id, userId: otherPlayer.id, role: "player" });
    const [foreignTeam] = await db.insert(teamsTable).values({
      clubId: homeClub, name: "Foreign guardian team", ageGroup: "U14",
    }).returning();
    const invite = (login: string, selectedTeam: number, player: number) =>
      request(app).post("/api/team-invitations")
        .set(as(login)).set("X-Nahreo-Club", String(destinationClub)).send({
          teamId: selectedTeam, firstName: "Blocked", lastName: "Guardian",
          email: "blocked-guardian-scope@example.test", role: "guardian",
          guardianPlayerId: player, deliveryMethod: "link",
        });
    expect((await invite("test_guardian_coach", otherTeam.id, otherPlayer.id)).status).toBe(403);
    expect((await invite("test_guardian_coach", foreignTeam.id, playerId)).status).toBe(403);
    expect((await invite("test_guardian_coach", teamId, otherPlayer.id)).status).toBe(400);
    expect((await invite("test_invite_brandnew", teamId, playerId)).status).toBe(403);
    expect((await invite("test_coach_invited_guardian", teamId, playerId)).status).toBe(403);
    expect(await db.select().from(usersTable).where(eq(usersTable.email, "blocked-guardian-scope@example.test"))).toHaveLength(0);
  });

  it("rejects players outside the selected team and foreign team creation without writing a person", async () => {
    expect((await guardianInvite("test_guardian_foreign", adminId)).status).toBe(400);
    const [foreignTeam] = await db.insert(teamsTable).values({ clubId: homeClub, name: "Foreign team", ageGroup: "U14" }).returning();
    const invalid = await request(app).post("/api/people").set(as(adminLogin)).send({
      firstName: "MustNot", lastName: "Exist", teamId: foreignTeam.id,
    });
    expect(invalid.status).toBe(404);
    expect(await db.select().from(usersTable).where(eq(usersTable.firstName, "MustNot"))).toHaveLength(0);
  });
});
