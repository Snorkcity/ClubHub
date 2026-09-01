/**
 * Notification integration tests use the throwaway database started by
 * scripts/run-tests.sh and mock Clerk with the x-test-user header.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

const push = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, unknown> }) => ({ userId: (req.headers["x-test-user"] as string | undefined) ?? null }),
  clerkClient: { users: { getUser: async () => { throw new Error("Clerk must not be called in tests"); } } },
}));
vi.mock("web-push", () => ({ default: push }));

import {
  clubMembersTable, clubsTable, db, eventsTable, guardianshipsTable,
  notificationRecipientsTable, notificationsTable, pool, postsTable,
  pushSubscriptionsTable, teamMembersTable, teamsTable, usersTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import app from "../src/app";

process.env.SESSION_SECRET ??= "test-session-secret";
const PREFIX = "test_notifications_";
const as = (id: string) => ({ "x-test-user": PREFIX + id });
let clubId = 0, teamId = 0, actor = 0, staff = 0, player = 0, guardian = 0, outsider = 0;
const users: number[] = [];

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("clubhub_test"))
    throw new Error("Refusing to run outside the disposable clubhub_test database");
  let club = (await db.select().from(clubsTable).limit(1))[0];
  if (!club) [club] = await db.insert(clubsTable).values({ name: "Test Club" }).returning();
  clubId = club.id;
  async function user(id: string) {
    const [u] = await db.insert(usersTable).values({ clubId, clerkUserId: PREFIX + id, firstName: id, lastName: "Test" }).returning();
    users.push(u.id);
    return u.id;
  }
  actor = await user("coach");
  staff = await user("manager");
  player = await user("player");
  guardian = await user("guardian");
  outsider = await user("outsider");
  await db.insert(clubMembersTable).values(users.map((userId) => ({ clubId, userId, role: "member" })));
  const [team] = await db.insert(teamsTable).values({ clubId, name: PREFIX + "team", ageGroup: "U12" }).returning();
  teamId = team.id;
  await db.insert(teamMembersTable).values([
    { teamId, userId: actor, role: "coach" },
    { teamId, userId: staff, role: "manager" },
    { teamId, userId: player, role: "player" },
  ]);
  await db.insert(guardianshipsTable).values({ guardianId: guardian, playerId: player });
});

afterAll(async () => {
  // Dependents must go first because notification rows reference both users and notifications.
  const made = await db.select({ id: notificationsTable.id }).from(notificationsTable).where(eq(notificationsTable.actorId, actor));
  const ids = made.map((n) => n.id);
  if (ids.length) await db.delete(notificationRecipientsTable).where(inArray(notificationRecipientsTable.notificationId, ids));
  if (ids.length) await db.delete(notificationsTable).where(inArray(notificationsTable.id, ids));
  if (users.length) await db.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.userId, users));
  await db.delete(eventsTable).where(eq(eventsTable.teamId, teamId));
  await db.delete(postsTable).where(eq(postsTable.teamId, teamId));
  await db.delete(guardianshipsTable).where(and(eq(guardianshipsTable.guardianId, guardian), eq(guardianshipsTable.playerId, player)));
  await db.delete(teamMembersTable).where(eq(teamMembersTable.teamId, teamId));
  await db.delete(teamsTable).where(eq(teamsTable.id, teamId));
  if (users.length) await db.delete(clubMembersTable).where(and(eq(clubMembersTable.clubId, clubId), inArray(clubMembersTable.userId, users)));
  if (users.length) await db.delete(usersTable).where(inArray(usersTable.id, users));
  await pool.end();
});

async function recipientsFor(title: string) {
  const [notification] = await db.select().from(notificationsTable).where(and(eq(notificationsTable.actorId, actor), eq(notificationsTable.title, title)));
  expect(notification).toBeTruthy();
  return db.select({ userId: notificationRecipientsTable.userId }).from(notificationRecipientsTable).where(eq(notificationRecipientsTable.notificationId, notification.id));
}

describe("team notifications", () => {
  it("scopes event recipients by role, includes guardians of invited players, and excludes the actor", async () => {
    const title = PREFIX + "role event";
    await request(app).post(`/api/teams/${teamId}/events`).set(as("coach")).send({
      type: "training", title, startsAt: "2030-01-01T10:00:00.000Z",
      invitedRoles: ["coaches", "players"], notifyRecipients: true,
    }).expect(201);
    const rows = await recipientsFor("New event");
    expect(new Set(rows.map((r) => r.userId))).toEqual(new Set([staff, player, guardian]));
  });

  it("does not persist an event notification when notifyRecipients is false", async () => {
    const before = await db.select({ id: notificationsTable.id }).from(notificationsTable).where(eq(notificationsTable.actorId, actor));
    await request(app).post(`/api/teams/${teamId}/events`).set(as("coach")).send({
      type: "training", title: PREFIX + "silent event", startsAt: "2030-01-02T10:00:00.000Z", notifyRecipients: false,
    }).expect(201);
    const after = await db.select({ id: notificationsTable.id }).from(notificationsTable).where(eq(notificationsTable.actorId, actor));
    expect(after).toHaveLength(before.length);
  });

  it("notifies staff, players, and guardians once for a team post with a team deep link", async () => {
    await request(app).post(`/api/teams/${teamId}/posts`).set(as("coach")).send({ title: PREFIX + "post", body: "hello" }).expect(201);
    const [notification] = await db.select().from(notificationsTable).where(and(eq(notificationsTable.actorId, actor), eq(notificationsTable.kind, "post"))).orderBy(notificationsTable.createdAt);
    expect(notification.deepLink).toBe(`/teams/${teamId}`);
    const rows = await db.select({ userId: notificationRecipientsTable.userId }).from(notificationRecipientsTable).where(eq(notificationRecipientsTable.notificationId, notification.id));
    expect(new Set(rows.map((r) => r.userId))).toEqual(new Set([staff, player, guardian]));
    expect(rows).toHaveLength(3);
  });

  it("enforces recipient ownership and keeps in-app records visible when master push preference is off", async () => {
    const list = await request(app).get("/api/notifications").set(as("player")).expect(200);
    const id = list.body.notifications[0].id;
    await request(app).post(`/api/notifications/${id}/read`).set(as("outsider")).expect(404);
    await request(app).patch("/api/notifications/preferences").set(as("player")).send({ pushNotificationsEnabled: false }).expect(204);
    await request(app).get("/api/me").set(as("player")).expect((res) => expect(res.body.pushNotificationsEnabled).toBe(false));
    // New durable records are independent from the push eligibility preference.
    const before = await db.select({ id: notificationRecipientsTable.id }).from(notificationRecipientsTable)
      .where(eq(notificationRecipientsTable.userId, player));
    await request(app).post(`/api/teams/${teamId}/posts`).set(as("coach"))
      .send({ title: PREFIX + "preference off", body: "still in app" }).expect(201);
    const after = await request(app).get("/api/notifications").set(as("player")).expect(200);
    expect(after.body.notifications.length).toBeGreaterThan(before.length);
    expect(after.body.notifications.some((n: { id: number }) => n.id === id)).toBe(true);
    await request(app).post(`/api/notifications/${id}/read`).set(as("player")).expect(204);
  });

  it("configures VAPID before delivery and removes only a 410-expired subscription", async () => {
    process.env.VAPID_PUBLIC_KEY = "test-public";
    process.env.VAPID_PRIVATE_KEY = "test-private";
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    await db.update(usersTable).set({ pushNotificationsEnabled: true }).where(eq(usersTable.id, player));
    await db.insert(pushSubscriptionsTable).values([
      { userId: player, endpoint: PREFIX + "expired", p256dh: "key", auth: "auth" },
      { userId: player, endpoint: PREFIX + "valid", p256dh: "key", auth: "auth" },
    ]);
    push.setVapidDetails.mockClear();
    push.sendNotification.mockImplementation(async ({ endpoint }: { endpoint: string }) => {
      if (endpoint === PREFIX + "expired") throw { statusCode: 410 };
    });
    await request(app).post(`/api/teams/${teamId}/posts`).set(as("coach"))
      .send({ title: PREFIX + "push delivery", body: "best effort" }).expect(201);
    expect(push.setVapidDetails).toHaveBeenCalledWith("mailto:test@example.com", "test-public", "test-private");
    expect(push.setVapidDetails.mock.invocationCallOrder[0]).toBeLessThan(push.sendNotification.mock.invocationCallOrder[0]);
    const remaining = await db.select({ endpoint: pushSubscriptionsTable.endpoint }).from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.userId, player));
    expect(remaining.map((row) => row.endpoint)).toContain(PREFIX + "valid");
    expect(remaining.map((row) => row.endpoint)).not.toContain(PREFIX + "expired");
  });

  it("returns stable older pages while unreadCount covers all notifications", async () => {
    const created = await db.insert(notificationsTable).values(
      Array.from({ length: 101 }, (_, i) => ({
        clubId, actorId: actor, kind: "post", title: PREFIX + "page " + i,
        body: "page test", deepLink: `/teams/${teamId}`,
      })),
    ).returning({ id: notificationsTable.id });
    await db.insert(notificationRecipientsTable).values(created.map(({ id }) => ({ notificationId: id, userId: player })));
    const first = await request(app).get("/api/notifications?limit=100").set(as("player")).expect(200);
    expect(first.body.notifications).toHaveLength(100);
    expect(first.body.unreadCount).toBeGreaterThanOrEqual(101);
    expect(first.body.hasMore).toBe(true);
    expect(first.body.nextCursor).toEqual(expect.any(Number));
    const second = await request(app).get(`/api/notifications?cursor=${first.body.nextCursor}&limit=100`).set(as("player")).expect(200);
    expect(second.body.notifications.length).toBeGreaterThan(0);
    const firstIds = new Set(first.body.notifications.map((n: { id: number }) => n.id));
    expect(second.body.notifications.some((n: { id: number }) => firstIds.has(n.id))).toBe(false);
  });
});