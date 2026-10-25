import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomBytes, createHash } from "node:crypto";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, string> }) => ({ userId: req.headers["x-test-user"] ?? null }),
  clerkClient: { users: { getUser: async (id: string) => ({
    firstName: "Leaving", lastName: "Tester", primaryEmailAddressId: "primary",
    emailAddresses: [{ id: "primary", emailAddress: `${id}@example.test`, verification: { status: "verified" } }],
  }) } },
}));
import { and, eq } from "drizzle-orm";
import {
  db, pool, clubsTable, usersTable, teamsTable, teamMembersTable, clubMembersTable,
  chatsTable, chatMembersTable, teamInvitationsTable, teamReadsTable, guardianshipsTable,
} from "@workspace/db";
import app from "../src/app";
const auth = (id: string, club?: number) => ({
  "x-test-user": id, ...(club ? { "X-Nahreo-Club": String(club) } : {}),
});
beforeAll(() => {
  if (!process.env.DATABASE_URL?.includes("clubhub_test")) throw Error("Disposable test database required");
});
afterAll(() => pool.end());

async function fixture(role = "member") {
  const login = `leave_${randomBytes(6).toString("hex")}`;
  const [club] = await db.insert(clubsTable).values({ name: login, countryCode: "AU" }).returning();
  const [user] = await db.insert(usersTable).values({
    clubId: club.id, clerkUserId: login, email: `${login}@example.test`, firstName: "Leave", lastName: "Tester",
  }).returning();
  await db.insert(clubMembersTable).values({ clubId: club.id, userId: user.id, role });
  const teams = await db.insert(teamsTable).values([
    { clubId: club.id, name: "First", ageGroup: "Open" },
    { clubId: club.id, name: "Second", ageGroup: "Open" },
  ]).returning();
  await db.insert(teamMembersTable).values(teams.map((t) => ({ teamId: t.id, userId: user.id, role: "coach" })));
  const chats = await db.insert(chatsTable).values(teams.map((t) => ({
    clubId: club.id, teamId: t.id, name: t.name, type: "team",
  }))).returning();
  await db.insert(chatMembersTable).values(chats.map((c) => ({ chatId: c.id, userId: user.id })));
  return { login, club, user, teams, chats };
}
const memberships = (id: number) => db.select().from(clubMembersTable).where(eq(clubMembersTable.userId, id));

describe("leave your own team", () => {
  it("preserves another team, its chat, club access, and historical records", async () => {
    const f = await fixture();
    await db.insert(teamReadsTable).values({ teamId: f.teams[0].id, userId: f.user.id, section: "home" });
    const res = await request(app).post(`/api/teams/${f.teams[0].id}/leave`).set(auth(f.login)).send();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ leftTeamId: f.teams[0].id, leftClub: false });
    const me = await request(app).get("/api/me").set(auth(f.login));
    expect(me.status).toBe(200);
    expect(me.body.memberships.map((m: { teamId: number }) => m.teamId)).toEqual([f.teams[1].id]);
    const chats = await db.select().from(chatMembersTable).where(eq(chatMembersTable.userId, f.user.id));
    expect(chats.map((c) => c.chatId)).toEqual([f.chats[1].id]);
    expect(await memberships(f.user.id)).toHaveLength(1);
    expect(await db.select().from(teamReadsTable).where(eq(teamReadsTable.userId, f.user.id))).toHaveLength(1);
  });

  it("leaves the last team and home club permanently, preserves account, expires old invites, and can rejoin", async () => {
    const f = await fixture();
    const token = randomBytes(32).toString("base64url");
    await db.insert(teamInvitationsTable).values({
      clubId: f.club.id, teamId: f.teams[1].id, personId: f.user.id, invitedByUserId: f.user.id,
      tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 86400000),
    });
    await request(app).post(`/api/teams/${f.teams[0].id}/leave`).set(auth(f.login));
    const last = await request(app).post(`/api/teams/${f.teams[1].id}/leave`).set(auth(f.login));
    expect(last.status).toBe(200);
    expect(last.body.leftClub).toBe(true);
    for (let i = 0; i < 2; i++) {
      const access = await request(app).get("/api/platform/access").set(auth(f.login));
      expect(access.status).toBe(200); expect(access.body.clubs).toEqual([]);
      expect((await request(app).get("/api/me").set(auth(f.login, f.club.id))).status).toBe(403);
    }
    expect(await memberships(f.user.id)).toHaveLength(0);
    expect(await db.select().from(usersTable).where(eq(usersTable.id, f.user.id))).toHaveLength(1);
    expect((await request(app).get("/api/onboarding/status").set(auth(f.login))).body.needsOnboarding).toBe(false);
    expect((await request(app).post("/api/team-invitations/accept").set(auth(f.login)).send({ token })).status).toBe(404);

    const [admin] = await db.insert(usersTable).values({
      clubId: f.club.id, clerkUserId: `${f.login}_admin`, firstName: "Other", lastName: "Admin",
    }).returning();
    await db.insert(clubMembersTable).values({ clubId: f.club.id, userId: admin.id, role: "admin" });
    const invite = await request(app).post("/api/team-invitations").set(auth(`${f.login}_admin`)).send({
      teamId: f.teams[1].id, firstName: "Leave", lastName: "Tester",
      email: f.user.email, role: "coach", deliveryMethod: "link",
    });
    expect(invite.status).toBe(201);
    const newToken = new URL(invite.body.inviteLink).searchParams.get("token");
    const joined = await request(app).post("/api/team-invitations/accept").set(auth(f.login)).send({ token: newToken });
    expect(joined.status).toBe(200);
    expect((await memberships(f.user.id))[0].clubId).toBe(f.club.id);
  });

  it("keeps another club and denies access to the departed club", async () => {
    const f = await fixture();
    const [other] = await db.insert(clubsTable).values({ name: "Other club" }).returning();
    await db.insert(clubMembersTable).values({ clubId: other.id, userId: f.user.id, role: "member" });
    for (const t of f.teams)
      expect((await request(app).post(`/api/teams/${t.id}/leave`).set(auth(f.login))).status).toBe(200);
    const access = await request(app).get("/api/platform/access").set(auth(f.login));
    expect(access.body.clubs.map((c: { id: number }) => c.id)).toEqual([other.id]);
    expect((await request(app).get("/api/me").set(auth(f.login))).status).toBe(200);
    expect((await request(app).get("/api/me").set(auth(f.login, f.club.id))).status).toBe(403);
  });

  it("blocks the last admin with no partial removal", async () => {
    const f = await fixture("admin");
    expect((await request(app).post(`/api/teams/${f.teams[0].id}/leave`).set(auth(f.login))).status).toBe(200);
    const res = await request(app).post(`/api/teams/${f.teams[1].id}/leave`).set(auth(f.login));
    expect(res.status).toBe(409); expect(res.body.error).toContain("last club admin");
    expect(await memberships(f.user.id)).toHaveLength(1);
    expect(await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, f.user.id))).toHaveLength(1);
    expect(await db.select().from(chatMembersTable).where(eq(chatMembersTable.userId, f.user.id))).toHaveLength(1);
  });

  it("serialises concurrent final admin departures and keeps one admin", async () => {
    const f = await fixture("admin");
    const [other] = await db.insert(usersTable).values({
      clubId: f.club.id, clerkUserId: `${f.login}_other`, firstName: "Other", lastName: "Admin",
    }).returning();
    await db.insert(clubMembersTable).values({ clubId: f.club.id, userId: other.id, role: "admin" });
    await db.insert(teamMembersTable).values({ teamId: f.teams[1].id, userId: other.id, role: "coach" });
    await request(app).post(`/api/teams/${f.teams[0].id}/leave`).set(auth(f.login));
    const results = await Promise.all([
      request(app).post(`/api/teams/${f.teams[1].id}/leave`).set(auth(f.login)),
      request(app).post(`/api/teams/${f.teams[1].id}/leave`).set(auth(`${f.login}_other`)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await db.select().from(clubMembersTable)
      .where(and(eq(clubMembersTable.clubId, f.club.id), eq(clubMembersTable.role, "admin")))).toHaveLength(1);
  });

  it("keeps guardian links and club access needed for a child", async () => {
    const f = await fixture();
    const [child] = await db.insert(usersTable).values({
      clubId: f.club.id, firstName: "Linked", lastName: "Child",
    }).returning();
    await db.insert(guardianshipsTable).values({ guardianId: f.user.id, playerId: child.id, relationship: "parent", canManage: true });
    await db.insert(teamMembersTable).values({ teamId: f.teams[0].id, userId: child.id, role: "player" });
    for (const team of f.teams) {
      const res = await request(app).post(`/api/teams/${team.id}/leave`).set(auth(f.login));
      expect(res.status).toBe(200); expect(res.body.leftClub).toBe(false);
    }
    expect(await memberships(f.user.id)).toHaveLength(1);
    expect(await db.select().from(guardianshipsTable).where(eq(guardianshipsTable.guardianId, f.user.id))).toHaveLength(1);
  });

  it("rejects unauthenticated, invalid, cross-club and other-person departures", async () => {
    const f = await fixture();
    const other = await fixture();
    expect((await request(app).post(`/api/teams/${f.teams[0].id}/leave`)).status).toBe(401);
    expect((await request(app).post("/api/teams/nope/leave").set(auth(f.login))).status).toBe(400);
    expect((await request(app).post(`/api/teams/${other.teams[0].id}/leave`).set(auth(f.login))
      .send({ userId: other.user.id })).status).toBe(404);
    expect(await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, other.user.id))).toHaveLength(2);
  });
});
