import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import request from "supertest";
import { and, eq, inArray, sql } from "drizzle-orm";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, string> }) => ({ userId: req.headers["x-test-user"] ?? null }),
  clerkClient: { users: { getUser: async (id: string) => ({
    firstName: "Code", lastName: "User", primaryEmailAddressId: "p",
    emailAddresses: [{ id: "p", emailAddress: `${id}@example.test`,
      verification: { status: id.includes("unverified") ? "unverified" : "verified" } }],
  }) } },
}));

import {
  db, pool, clubsTable, teamsTable, usersTable, clubMembersTable, teamMembersTable,
  chatsTable, chatMembersTable, guardianshipsTable, teamJoinCodesTable, teamJoinRequestsTable,
  teamInvitationsTable,
} from "@workspace/db";
import app from "../src/app";

let clubId: number, teamId: number, otherTeamId: number, otherClubId: number, chatId: number, playerId: number;
let code: string;
const as = (login: string) => ({ "x-test-user": `code_${login}` });
const join = (login: string, role = "player", extra = {}) => request(app)
  .post("/api/team-codes/join").set(as(login))
  .send({ code, role, firstName: "Code", lastName: login, childName: "Test Player", ...extra });

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("clubhub_test")) throw Error("Disposable DB required");
  [clubId, otherClubId] = (await db.insert(clubsTable).values([{ name: "Code Club" }, { name: "Other Code Club" }]).returning()).map((c) => c.id);
  [teamId, otherTeamId] = (await db.insert(teamsTable).values([
    { clubId, name: "Code U14", ageGroup: "U14" }, { clubId: otherClubId, name: "Other U14", ageGroup: "U14" },
  ]).returning()).map((t) => t.id);
  for (const role of ["admin", "coach", "member", "outsider"]) {
    const homeClub = role === "outsider" ? otherClubId : clubId;
    const [u] = await db.insert(usersTable).values({
      clubId: homeClub, clerkUserId: `code_${role}`, email: `code_${role}@example.test`, firstName: role, lastName: "Test",
    }).returning();
    await db.insert(clubMembersTable).values({ clubId: homeClub, userId: u.id, role: role === "admin" ? "admin" : "member" });
    if (role === "coach" || role === "member")
      await db.insert(teamMembersTable).values({ teamId, userId: u.id, role: role === "coach" ? "coach" : "player" });
  }
  const [p] = await db.insert(usersTable).values({ clubId, firstName: "Test", lastName: "Player" }).returning();
  playerId = p.id;
  await db.insert(teamMembersTable).values({ teamId, userId: playerId, role: "player" });
  const [chat] = await db.insert(chatsTable).values({ clubId, teamId, type: "team", name: "Code chat" }).returning();
  chatId = chat.id;
});

afterAll(async () => {
  const ids = (await db.select({ id: usersTable.id }).from(usersTable)
    .where(inArray(usersTable.clubId, [clubId, otherClubId]))).map((u) => u.id);
  if (ids.length) {
    await db.delete(teamJoinRequestsTable).where(inArray(teamJoinRequestsTable.userId, ids));
    await db.delete(guardianshipsTable).where(inArray(guardianshipsTable.guardianId, ids));
    await db.delete(teamInvitationsTable).where(inArray(teamInvitationsTable.personId, ids));
    await db.delete(chatMembersTable).where(inArray(chatMembersTable.userId, ids));
    await db.delete(teamMembersTable).where(inArray(teamMembersTable.userId, ids));
    await db.delete(clubMembersTable).where(inArray(clubMembersTable.userId, ids));
    await db.delete(usersTable).where(inArray(usersTable.id, ids));
  }
  await db.delete(chatsTable).where(eq(chatsTable.id, chatId));
  await db.delete(teamsTable).where(inArray(teamsTable.id, [teamId, otherTeamId]));
  await db.delete(clubsTable).where(inArray(clubsTable.id, [clubId, otherClubId]));
  await pool.end();
});

describe("Reusable team codes", () => {
  it("allows coaches to create a code and exposes only team identity publicly", async () => {
    const made = await request(app).post(`/api/teams/${teamId}/join-code`).set(as("coach"));
    expect(made.status).toBe(200);
    code = made.body.code;
    expect(code).toMatch(/^[A-F0-9]{16}$/);
    expect(made.body.link).toContain(`/join-team?code=${code}`);
    const preview = await request(app).post("/api/team-codes/preview").send({ code: code.toLowerCase().match(/.{4}/g).join("-") });
    expect(preview.status).toBe(200);
    expect(preview.body).toEqual({ teamName: "Code U14", clubName: "Code Club" });
  });
  it("denies member and cross-club code management and unauthenticated joins", async () => {
    for (const login of ["member", "outsider"]) {
      for (const method of ["get", "post", "delete"] as const)
        expect((await request(app)[method](`/api/teams/${teamId}/join-code`).set(as(login))).status).toBe(403);
    }
    expect((await request(app).post("/api/team-codes/join").send({ code })).status).toBe(401);
    expect((await request(app).get(`/api/teams/${teamId}/join-requests`).set(as("member"))).status).toBe(403);
  });
  it("joins a new player without sending email, creates one permanent person and chat membership", async () => {
    const first = await join("new");
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ status: "joined", teamId, clubId });
    expect((await join("new")).body.status).toBe("joined");
    const people = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, "code_new"));
    expect(people).toHaveLength(1);
    expect(people[0].emailPrivacy).toBe("private");
    const memberships = await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, people[0].id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe("player");
    expect(await db.select().from(chatMembersTable).where(eq(chatMembersTable.userId, people[0].id))).toHaveLength(1);
    expect(await db.select().from(teamInvitationsTable).where(eq(teamInvitationsTable.personId, people[0].id))).toHaveLength(0);
  });
  it("rejects forged staff roles, unverified email and invalid codes without provisioning", async () => {
    expect((await join("forged", "coach")).status).toBe(400);
    expect((await join("unverified")).status).toBe(403);
    expect((await join("bad", "player", { code: "FFFFFFFFFFFFFFFF" })).status).toBe(404);
    expect(await db.select().from(usersTable).where(eq(usersTable.clerkUserId, "code_bad"))).toHaveLength(0);
  });
  it("reuses an existing account across clubs without changing its home club or staff roles", async () => {
    expect((await join("outsider")).body.status).toBe("joined");
    const [person] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, "code_outsider"));
    expect(person.clubId).toBe(otherClubId);
    expect(await db.select().from(clubMembersTable).where(eq(clubMembersTable.userId, person.id))).toHaveLength(2);
    expect((await join("coach")).body.status).toBe("joined");
    const [coach] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, "code_coach"));
    expect((await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, coach.id))).map((r) => r.role)).toEqual(["coach"]);
  });
  it("requires staff to approve guardian links; requests are idempotent and grant no access", async () => {
    expect((await join("parent", "guardian")).body.status).toBe("pending");
    expect((await join("parent", "guardian")).body.status).toBe("pending");
    const [parent] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, "code_parent"));
    expect(await db.select().from(teamJoinRequestsTable).where(eq(teamJoinRequestsTable.userId, parent.id))).toHaveLength(1);
    expect(await db.select().from(clubMembersTable).where(eq(clubMembersTable.userId, parent.id))).toHaveLength(0);
    expect(await db.select().from(guardianshipsTable).where(eq(guardianshipsTable.guardianId, parent.id))).toHaveLength(0);
    expect((await request(app).get("/api/me").set(as("parent"))).status).toBe(403);
    const list = await request(app).get(`/api/teams/${teamId}/join-requests`).set(as("coach"));
    expect(list.body[0]).toEqual(expect.objectContaining({ name: "Code parent", childName: "Test Player" }));
    const id = list.body[0].id;
    expect((await request(app).post(`/api/teams/${otherTeamId}/join-requests/${id}`).set(as("coach"))
      .send({ decision: "approve", playerId })).status).toBe(403);
    expect((await request(app).post(`/api/teams/${teamId}/join-requests/${id}`).set(as("coach"))
      .send({ decision: "approve", playerId: parent.id })).status).toBe(400);
    const approved = await request(app).post(`/api/teams/${teamId}/join-requests/${id}`).set(as("coach"))
      .send({ decision: "approve", playerId });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("approved");
    expect((await join("parent", "guardian")).body.status).toBe("joined");
    expect(await db.select().from(guardianshipsTable).where(and(
      eq(guardianshipsTable.guardianId, parent.id), eq(guardianshipsTable.playerId, playerId),
    ))).toHaveLength(1);
    expect(await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, parent.id))).toHaveLength(0);
    expect((await request(app).get("/api/me").set(as("parent"))).status).toBe(200);
  });
  it("keeps rejection final until a separate individual invitation, and never exposes the roster", async () => {
    await join("reject", "guardian");
    const [parent] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, "code_reject"));
    const [pending] = await db.select().from(teamJoinRequestsTable).where(eq(teamJoinRequestsTable.userId, parent.id));
    expect((await request(app).post(`/api/teams/${teamId}/join-requests/${pending.id}`).set(as("admin")).send({ decision: "reject" })).body.status).toBe("rejected");
    expect((await join("reject", "guardian")).body.status).toBe("rejected");
    expect((await request(app).get(`/api/teams/${teamId}/join-requests`).set(as("reject"))).status).toBe(403);
  });
  it("does not merge ambiguous same-email identities", async () => {
    await db.insert(usersTable).values([1, 2].map(() => ({
      clubId, firstName: "Duplicate", lastName: "Test", email: "code_duplicate@example.test",
    })));
    expect((await join("duplicate")).status).toBe(409);
    expect(await db.select().from(usersTable).where(eq(usersTable.clerkUserId, "code_duplicate"))).toHaveLength(0);
  });
  it("finishes a pending player invitation but cannot activate a pending staff role", async () => {
    const [coach] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, "code_coach"));
    for (const role of ["player", "coach"]) {
      const login = `code_invited_${role}`;
      const [person] = await db.insert(usersTable).values({
        clubId, firstName: "Invited", lastName: role, email: `${login}@example.test`,
      }).returning();
      await db.insert(clubMembersTable).values({ clubId, userId: person.id, role: "member" });
      await db.insert(teamMembersTable).values({ teamId, userId: person.id, role });
      const [invitation] = await db.insert(teamInvitationsTable).values({
        clubId, teamId, personId: person.id, invitedByUserId: coach.id,
        tokenHash: createHash("sha256").update(login).digest("hex"),
        expiresAt: new Date(Date.now() + 600000),
      }).returning();
      const response = await join(`invited_${role}`);
      expect(response.status).toBe(role === "player" ? 200 : 409);
      const [saved] = await db.select().from(teamInvitationsTable).where(eq(teamInvitationsTable.id, invitation.id));
      expect(!!saved.acceptedAt).toBe(role === "player");
    }
  });
  it("cannot approve a player in a different team or elevate a restricted guardian link", async () => {
    await join("restricted", "guardian");
    const [parent] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, "code_restricted"));
    const [pending] = await db.select().from(teamJoinRequestsTable).where(eq(teamJoinRequestsTable.userId, parent.id));
    const [foreign] = await db.insert(usersTable).values({ clubId: otherClubId, firstName: "Foreign", lastName: "Player" }).returning();
    await db.insert(teamMembersTable).values({ teamId: otherTeamId, userId: foreign.id, role: "player" });
    const review = (id: number) => request(app).post(`/api/teams/${teamId}/join-requests/${pending.id}`)
      .set(as("coach")).send({ decision: "approve", playerId: id });
    expect((await review(foreign.id)).status).toBe(400);
    await db.insert(guardianshipsTable).values({ guardianId: parent.id, playerId, canManage: false });
    expect((await review(playerId)).status).toBe(409);
    expect(await db.select().from(clubMembersTable).where(eq(clubMembersTable.userId, parent.id))).toHaveLength(0);
    expect((await db.select().from(guardianshipsTable).where(eq(guardianshipsTable.guardianId, parent.id)))[0].canManage).toBe(false);
  });
  it("serialises parallel joins without duplicate identities or memberships", async () => {
    const responses = await Promise.all([join("parallel"), join("parallel")]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const rows = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, "code_parallel"));
    expect(rows).toHaveLength(1);
    expect(await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, rows[0].id))).toHaveLength(1);
  });
  it("invalidates old codes on rotation and disables joining without removing existing access", async () => {
    const old = code;
    code = (await request(app).post(`/api/teams/${teamId}/join-code`).set(as("admin"))).body.code;
    expect(code).not.toBe(old);
    expect((await request(app).post("/api/team-codes/preview").send({ code: old })).status).toBe(404);
    expect((await join("revoked", "player", { code: old })).status).toBe(404);
    expect((await request(app).delete(`/api/teams/${teamId}/join-code`).set(as("admin"))).status).toBe(204);
    expect((await request(app).get(`/api/teams/${teamId}/join-code`).set(as("coach"))).body).toEqual({ code: null, link: null });
    expect((await join("disabled")).status).toBe(404);
    expect((await request(app).get("/api/me").set(as("new"))).status).toBe(200);
  });
  it("rate limits repeated guesses", async () => {
    let status = 0;
    for (let i = 0; i < 32; i++)
      status = (await request(app).post("/api/team-codes/preview").set(as("guesser")).send({ code: "bad" })).status;
    expect(status).toBe(429);
  });
});
