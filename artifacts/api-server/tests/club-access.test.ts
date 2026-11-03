import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, unknown> }) => ({ userId: req.headers["x-test-user"] ?? null }),
  clerkClient: { users: { getUser: async () => { throw new Error("No live Clerk calls in tests"); } } },
}));

import { db, pool, clubsTable, clubMembersTable, usersTable, teamsTable, teamMembersTable, postsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import app from "../src/app";

const prefix = "club_access_test_";
const ids: Record<string, number> = {};
let clubId: number;
let otherClubId: number;
let teamId: number;
const as = (name: string) => ({ "x-test-user": prefix + name });
const update = (actor: string, target: string, role = "announcer") =>
  request(app).patch(`/api/club/access/${ids[target]}`).set(as(actor)).send({ role });
const transfer = (actor: string, target: string) =>
  request(app).post("/api/club/access/transfer").set(as(actor)).send({ personId: ids[target], confirmation: "TRANSFER" });

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("clubhub_test")) throw new Error("Disposable test database required");
  clubId = (await db.insert(clubsTable).values({ name: prefix + "Club" }).returning())[0].id;
  otherClubId = (await db.insert(clubsTable).values({ name: prefix + "Other" }).returning())[0].id;
  for (const name of ["admin", "one", "two", "three", "four", "coach", "outsider", "pending"]) {
    const home = name === "outsider" ? otherClubId : clubId;
    ids[name] = (await db.insert(usersTable).values({
      clubId: home, firstName: name, lastName: "Example",
      clerkUserId: name === "pending" ? null : prefix + name,
    }).returning())[0].id;
    await db.insert(clubMembersTable).values({ clubId: home, userId: ids[name], role: name === "admin" ? "admin" : "member" });
  }
  teamId = (await db.insert(teamsTable).values({ clubId, name: "First team", ageGroup: "Seniors" }).returning())[0].id;
  await db.insert(teamsTable).values({ clubId, name: "Second team", ageGroup: "U14" });
  await db.insert(teamsTable).values({ clubId: otherClubId, name: "Private other club", ageGroup: "U14" });
  await db.insert(teamMembersTable).values({ teamId, userId: ids.coach, role: "coach" });
});
beforeEach(async () => {
  await db.update(clubMembersTable).set({ role: "member" }).where(eq(clubMembersTable.clubId, clubId));
  await db.update(clubMembersTable).set({ role: "admin" })
    .where(and(eq(clubMembersTable.clubId, clubId), eq(clubMembersTable.userId, ids.admin)));
});
// The surrounding test script destroys this entire isolated PostgreSQL cluster.
afterAll(async () => { await pool.end(); });

describe("club administrator and announcer permissions", () => {
  it("lists registered members only, exposes no contact details and blocks non-admins", async () => {
    const r = await request(app).get("/api/club/access").set(as("admin"));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ maxAdmins: 1, maxAnnouncers: 3 });
    expect(r.body.members.map((m: any) => m.personId)).not.toContain(ids.outsider);
    expect(r.body.members.map((m: any) => m.personId)).not.toContain(ids.pending);
    expect(Object.keys(r.body.members[0]).sort()).toEqual(["name", "personId", "role"]);
    for (const actor of ["one", "coach", "outsider"]) {
      expect((await request(app).get("/api/club/access").set(as(actor))).status).toBe(403);
      expect((await update(actor, "two")).status).toBe(403);
      expect((await transfer(actor, "two")).status).toBe(403);
    }
  });
  it("grants and revokes announcing without granting administrative access", async () => {
    expect((await update("admin", "one")).status).toBe(200);
    const me = await request(app).get("/api/me").set(as("one"));
    expect(me.body).toMatchObject({ clubRole: "announcer", isClubAdmin: false });
    expect((await request(app).get("/api/club/access").set(as("one"))).status).toBe(403);
    expect((await update("one", "two")).status).toBe(403);
    expect((await transfer("one", "two")).status).toBe(403);
    expect((await update("admin", "one", "member")).status).toBe(200);
    expect((await request(app).get("/api/me").set(as("one"))).body.clubRole).toBe("member");
    expect((await request(app).post("/api/posts/club").set(as("one")).send({ body: "Revoked" })).status).toBe(403);
  });
  it("enforces the three-announcer cap, supports idempotence and frees removed slots", async () => {
    for (const target of ["one", "two", "three"]) expect((await update("admin", target)).status).toBe(200);
    expect((await update("admin", "one")).status).toBe(200);
    expect((await update("admin", "four")).status).toBe(409);
    expect((await update("admin", "two", "member")).status).toBe(200);
    expect((await update("admin", "four")).status).toBe(200);
  });
  it("serialises concurrent grants so they cannot create a fourth announcer", async () => {
    await update("admin", "one");
    await update("admin", "two");
    const r = await Promise.all([update("admin", "three"), update("admin", "four")]);
    expect(r.map((v) => v.status).sort()).toEqual([200, 409]);
    const members = await db.select().from(clubMembersTable).where(eq(clubMembersTable.clubId, clubId));
    expect(members.filter((m) => m.role === "announcer")).toHaveLength(3);
  });
  it("rejects unclaimed accounts, other clubs, bad identifiers and attempts to promote via the announcer endpoint", async () => {
    for (const target of ["pending", "outsider"]) expect((await update("admin", target)).status).toBe(404);
    expect((await update("admin", "one", "admin")).status).toBe(400);
    expect((await update("admin", "admin", "member")).status).toBe(400);
    for (const id of ["1.5", "NaN", "-1", "9007199254740992"])
      expect((await request(app).patch(`/api/club/access/${id}`).set(as("admin")).send({ role: "announcer" })).status).toBe(400);
    expect((await request(app).post("/api/club/access/transfer").set(as("admin")).send({ personId: ids.one })).status).toBe(400);
    expect((await request(app).post("/api/club/access/transfer").set(as("admin")).send({ personId: 1.5, confirmation: "TRANSFER" })).status).toBe(400);
  });
  it("lets an announcer publish to every team in their club, without reading private teams or settings", async () => {
    await update("admin", "one");
    const r = await request(app).post("/api/posts/club").set(as("one")).send({ title: "Club update", body: "Everyone welcome" });
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(2);
    const ownPosts = await db.select().from(postsTable).where(eq(postsTable.authorId, ids.one));
    expect(ownPosts).toHaveLength(2);
    expect((await request(app).get(`/api/teams/${teamId}`).set(as("one"))).status).toBe(403);
    expect((await request(app).get(`/api/people?teamId=${teamId}`).set(as("one"))).status).toBe(403);
    expect((await request(app).get(`/api/teams/${teamId}/monitoring`).set(as("one"))).status).toBe(403);
    expect((await request(app).post(`/api/teams/${teamId}/posts`).set(as("one")).send({ body: "Team-only not allowed" })).status).toBe(403);
    expect((await request(app).post("/api/posts/club").set(as("coach")).send({ body: "Not an announcer" })).status).toBe(403);
  });
  it("atomically hands over to one admin, revokes old authority, and preserves team roles", async () => {
    await update("admin", "coach");
    expect((await transfer("admin", "coach")).status).toBe(200);
    const members = await db.select().from(clubMembersTable).where(eq(clubMembersTable.clubId, clubId));
    expect(members.filter((m) => m.role === "admin").map((m) => m.userId)).toEqual([ids.coach]);
    expect(members.find((m) => m.userId === ids.admin)?.role).toBe("member");
    expect((await request(app).get("/api/me").set(as("coach"))).body).toMatchObject({
      isClubAdmin: true, clubRole: "admin", memberships: [expect.objectContaining({ role: "coach", teamId })],
    });
    expect((await update("admin", "one")).status).toBe(403);
    expect((await transfer("admin", "two")).status).toBe(403);
    expect((await update("coach", "one")).status).toBe(200);
  });
  it("allows only one competing handover to succeed and rejects self/foreign handovers", async () => {
    expect((await transfer("admin", "admin")).status).toBe(400);
    expect((await transfer("admin", "outsider")).status).toBe(404);
    expect((await transfer("admin", "pending")).status).toBe(404);
    const r = await Promise.all([transfer("admin", "one"), transfer("admin", "two")]);
    expect(r.map((v) => v.status).sort()).toEqual([200, 403]);
    const members = await db.select().from(clubMembersTable).where(eq(clubMembersTable.clubId, clubId));
    expect(members.filter((m) => m.role === "admin")).toHaveLength(1);
  });
  it("preserves legacy admins until an explicit confirmed consolidation", async () => {
    await db.update(clubMembersTable).set({ role: "admin" })
      .where(and(eq(clubMembersTable.clubId, clubId), eq(clubMembersTable.userId, ids.coach)));
    const before = await request(app).get("/api/club/access").set(as("admin"));
    expect(before.body.members.filter((m: any) => m.role === "admin")).toHaveLength(2);
    expect((await transfer("admin", "admin")).status).toBe(200);
    const after = await request(app).get("/api/club/access").set(as("admin"));
    expect(after.body.members.filter((m: any) => m.role === "admin").map((m: any) => m.personId)).toEqual([ids.admin]);
    expect((await update("coach", "one")).status).toBe(403);
    expect((await request(app).get("/api/me").set(as("coach"))).body.memberships).toEqual([expect.objectContaining({ teamId, role: "coach" })]);
  });
});
