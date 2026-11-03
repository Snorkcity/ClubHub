import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, string> }) => ({ userId: req.headers["x-test-user"] ?? null }),
}));

import {
  db, pool, clubsTable, teamsTable, usersTable, clubMembersTable, teamMembersTable,
  postsTable, commentsTable, postReactionsTable, guardianshipsTable,
} from "@workspace/db";
import app from "../src/app";

const people: Record<string, number> = {};
let clubId: number, otherClub: number, teamId: number, otherTeam: number, postId: number, foreignPost: number;
const as = (name: string) => ({ "x-test-user": `post_interaction_${name}` });
const react = (name: string, emoji: string | null, post = postId) => request(app)
  .put(`/api/posts/${post}/reaction`).set(as(name)).send({ emoji });
const comment = (name: string, body: string, post = postId) => request(app)
  .post(`/api/posts/${post}/comments`).set(as(name)).send({ body });

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("clubhub_test")) throw Error("Disposable DB required");
  [clubId, otherClub] = (await db.insert(clubsTable).values([{ name: "Post interactions" }, { name: "Foreign posts" }]).returning()).map(c => c.id);
  [teamId, otherTeam] = (await db.insert(teamsTable).values([
    { clubId, name: "Interaction U14", ageGroup: "U14" },
    { clubId: otherClub, name: "Foreign U14", ageGroup: "U14" },
  ]).returning()).map(t => t.id);
  for (const name of ["coach", "player", "peer", "guardian", "outsider"]) {
    const home = name === "outsider" ? otherClub : clubId;
    const [u] = await db.insert(usersTable).values({
      clubId: home, clerkUserId: `post_interaction_${name}`, firstName: name, lastName: "Test",
      email: `post_interaction_${name}@example.test`, emailPrivacy: "private", phonePrivacy: "private",
    }).returning();
    people[name] = u.id;
    await db.insert(clubMembersTable).values({ clubId: home, userId: u.id, role: "member" });
    if (name !== "guardian") await db.insert(teamMembersTable).values({
      teamId: name === "outsider" ? otherTeam : teamId, userId: u.id, role: name === "coach" ? "coach" : "player",
    });
  }
  await db.insert(guardianshipsTable).values({ guardianId: people.guardian, playerId: people.player, relation: "parent", canManage: true });
  [postId, foreignPost] = (await db.insert(postsTable).values([
    { teamId, authorId: people.coach, body: "Home news" },
    { teamId: otherTeam, authorId: people.outsider, body: "Foreign news" },
  ]).returning()).map(p => p.id);
});

afterAll(async () => {
  await db.delete(commentsTable).where(inArray(commentsTable.postId, [postId, foreignPost]));
  await db.delete(postsTable).where(inArray(postsTable.id, [postId, foreignPost]));
  await db.delete(guardianshipsTable).where(eq(guardianshipsTable.guardianId, people.guardian));
  await db.delete(teamMembersTable).where(inArray(teamMembersTable.teamId, [teamId, otherTeam]));
  await db.delete(clubMembersTable).where(inArray(clubMembersTable.clubId, [clubId, otherClub]));
  await db.delete(usersTable).where(inArray(usersTable.id, Object.values(people)));
  await db.delete(teamsTable).where(inArray(teamsTable.id, [teamId, otherTeam]));
  await db.delete(clubsTable).where(inArray(clubsTable.id, [clubId, otherClub]));
  await pool.end();
});

describe("Team news reactions and comments", () => {
  it("requires sign-in, denies other teams and validates emoji", async () => {
    expect((await request(app).put(`/api/posts/${postId}/reaction`).send({ emoji: "👍" })).status).toBe(401);
    expect((await react("outsider", "👍")).status).toBe(403);
    expect((await react("player", "👍", foreignPost)).status).toBe(403);
    expect((await react("player", "not-a-reaction")).status).toBe(400);
    expect((await react("player", "👍", 999999999)).status).toBe(404);
  });

  it("persists one reaction per person, replaces it, and returns viewer-specific selection", async () => {
    expect((await react("player", "👍")).body.reactions).toEqual([{ emoji: "👍", count: 1, reacted: true }]);
    await Promise.all([react("player", "👍"), react("player", "👍")]);
    expect((await db.select().from(postReactionsTable).where(eq(postReactionsTable.postId, postId))).length).toBe(1);
    expect((await react("player", "❤️")).body.reactions).toEqual([{ emoji: "❤️", count: 1, reacted: true }]);
    const peer = await request(app).get(`/api/posts/${postId}`).set(as("peer"));
    expect(peer.body.post.reactions).toEqual([{ emoji: "❤️", count: 1, reacted: false }]);
    const guardian = await react("guardian", "❤️");
    expect(guardian.body.reactions).toEqual([{ emoji: "❤️", count: 2, reacted: true }]);
    const feed = await request(app).get("/api/feed").set(as("player"));
    expect(feed.body.find((p: { id: number }) => p.id === postId).reactions).toEqual([{ emoji: "❤️", count: 2, reacted: true }]);
    await react("player", null);
    const removed = await react("guardian", null);
    expect(removed.body.reactions).toEqual([]);
    expect((await react("guardian", null)).body.reactions).toEqual([]);
  });

  it("rejects blank/oversize and foreign-team comments", async () => {
    expect((await comment("player", "  ")).status).toBe(400);
    expect((await comment("player", "x".repeat(2001))).status).toBe(400);
    expect((await comment("outsider", "Should not post")).status).toBe(403);
    expect((await comment("player", "Should not post", foreignPost)).status).toBe(403);
  });

  it("keeps comments after reload and lets only their author or team staff remove them", async () => {
    const made = await comment("player", "  Thanks coach  ");
    expect(made.status).toBe(201);
    expect(made.body.body).toBe("Thanks coach");
    expect(made.body.canDelete).toBe(true);
    const id = made.body.id;
    const peer = await request(app).get(`/api/posts/${postId}`).set(as("peer"));
    expect(peer.body.comments.find((c: { id: number }) => c.id === id).canDelete).toBe(false);
    expect(peer.body.post.commentCount).toBe(1);
    expect(peer.body.comments[0].author.email).toBeNull();
    expect((await request(app).delete(`/api/posts/${postId}/comments/${id}`).set(as("peer"))).status).toBe(403);
    expect((await request(app).delete(`/api/posts/${foreignPost}/comments/${id}`).set(as("outsider"))).status).toBe(404);
    const coach = await request(app).get(`/api/posts/${postId}`).set(as("coach"));
    expect(coach.body.comments[0].canDelete).toBe(true);
    expect((await request(app).delete(`/api/posts/${postId}/comments/${id}`).set(as("coach"))).status).toBe(204);
    const own = await comment("guardian", "See you there");
    expect((await request(app).delete(`/api/posts/${postId}/comments/${own.body.id}`).set(as("guardian"))).status).toBe(204);
    const fresh = await request(app).get(`/api/posts/${postId}`).set(as("player"));
    expect(fresh.body.comments).toEqual([]);
    expect(fresh.body.post.commentCount).toBe(0);
  });

  it("cleans up reactions when team staff delete the post", async () => {
    const [p] = await db.insert(postsTable).values({ teamId, authorId: people.coach, body: "Temporary" }).returning();
    await react("player", "👍", p.id);
    expect((await request(app).delete(`/api/posts/${p.id}`).set(as("coach"))).status).toBe(204);
    expect(await db.select().from(postReactionsTable).where(eq(postReactionsTable.postId, p.id))).toEqual([]);
  });
});
