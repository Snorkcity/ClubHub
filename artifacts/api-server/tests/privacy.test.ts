/**
 * Regression tests for privacy rules that must never silently break:
 *  1. RSVP "not going" reasons are visible only to team staff/club admins,
 *     the person themselves, and their guardians — never other players/parents.
 *  2. Chats can only be started with people who share a team (guardians count
 *     as belonging to their wards' teams). Non-teammates → 403.
 *  3. POST /posts/club is club-admin-only.
 *  4. GET /people?teamId only returns that team's members + their guardians.
 *
 * Runs against a throwaway local PostgreSQL cluster provisioned by
 * scripts/run-tests.sh (never the shared dev/prod database — enforced by the
 * DATABASE_URL guard below). Clerk is mocked: the `x-test-user` request
 * header carries the fake clerkUserId of the acting user.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  getAuth: (req: { headers: Record<string, unknown> }) => ({
    userId: (req.headers["x-test-user"] as string | undefined) ?? null,
  }),
  clerkClient: {
    users: {
      getUser: async () => {
        throw new Error("Clerk backend must not be called in tests");
      },
    },
  },
}));

import {
  db,
  pool,
  clubsTable,
  clubMembersTable,
  usersTable,
  teamsTable,
  teamMembersTable,
  guardianshipsTable,
  eventsTable,
  rsvpsTable,
  chatsTable,
  chatMembersTable,
  postsTable,
} from "@workspace/db";
import { and, eq, inArray, like } from "drizzle-orm";
import app from "../src/app";

const PREFIX = "test_priv_";

type Seed = {
  clubId: number;
  createdClub: boolean;
  userIds: number[];
  teamIds: number[];
  eventId: number;
  coach: number;
  playerA: number;
  playerB: number;
  guardianA: number;
  outsider: number;
  admin: number;
};
let s: Seed;

const as = (clerkId: string) => ({ "x-test-user": PREFIX + clerkId });

async function mkUser(clerkId: string, firstName: string) {
  const [u] = await db
    .insert(usersTable)
    .values({
      clubId: s.clubId,
      clerkUserId: PREFIX + clerkId,
      firstName,
      lastName: "Test",
    })
    .returning();
  s.userIds.push(u.id);
  return u.id;
}

beforeAll(async () => {
  // Fail closed: only ever run against the disposable test database.
  if (!process.env.DATABASE_URL?.includes("clubhub_test")) {
    throw new Error(
      "Refusing to run: DATABASE_URL is not the disposable test database. " +
        "Run tests via `pnpm --filter @workspace/api-server run test`.",
    );
  }
  // requireAuth binds every request to the FIRST club row, so seed into it.
  let club = (await db.select().from(clubsTable).limit(1))[0];
  let createdClub = false;
  if (!club) {
    club = (
      await db.insert(clubsTable).values({ name: "Test Club" }).returning()
    )[0];
    createdClub = true;
  }
  s = {
    clubId: club.id,
    createdClub,
    userIds: [],
    teamIds: [],
    eventId: 0,
    coach: 0,
    playerA: 0,
    playerB: 0,
    guardianA: 0,
    outsider: 0,
    admin: 0,
  };

  s.coach = await mkUser("coach", "Coach");
  s.playerA = await mkUser("playerA", "PlayerA");
  s.playerB = await mkUser("playerB", "PlayerB");
  s.guardianA = await mkUser("guardianA", "GuardianA");
  s.outsider = await mkUser("outsider", "Outsider");
  s.admin = await mkUser("admin", "Admin");

  // Explicit club memberships so requireAuth's JIT logic can't accidentally
  // promote a test user to admin (it makes the first member an admin when the
  // club has none).
  await db.insert(clubMembersTable).values([
    { clubId: s.clubId, userId: s.coach, role: "member" },
    { clubId: s.clubId, userId: s.playerA, role: "member" },
    { clubId: s.clubId, userId: s.playerB, role: "member" },
    { clubId: s.clubId, userId: s.guardianA, role: "member" },
    { clubId: s.clubId, userId: s.outsider, role: "member" },
    { clubId: s.clubId, userId: s.admin, role: "admin" },
  ]);

  const [teamX] = await db
    .insert(teamsTable)
    .values({ clubId: s.clubId, name: PREFIX + "TeamX", ageGroup: "U12" })
    .returning();
  const [teamY] = await db
    .insert(teamsTable)
    .values({ clubId: s.clubId, name: PREFIX + "TeamY", ageGroup: "U14" })
    .returning();
  s.teamIds = [teamX.id, teamY.id];

  await db.insert(teamMembersTable).values([
    { teamId: teamX.id, userId: s.coach, role: "coach" },
    { teamId: teamX.id, userId: s.playerA, role: "player" },
    { teamId: teamX.id, userId: s.playerB, role: "player" },
    { teamId: teamY.id, userId: s.outsider, role: "player" },
  ]);

  await db
    .insert(guardianshipsTable)
    .values({ guardianId: s.guardianA, playerId: s.playerA });

  const [event] = await db
    .insert(eventsTable)
    .values({
      teamId: teamX.id,
      createdById: s.coach,
      type: "training",
      title: PREFIX + "Training",
      startsAt: new Date(Date.now() + 86400_000),
    })
    .returning();
  s.eventId = event.id;

  await db.insert(rsvpsTable).values([
    { eventId: event.id, userId: s.playerA, status: "out", reason: "family emergency" },
    { eventId: event.id, userId: s.playerB, status: "out", reason: "sick with flu" },
  ]);
});

afterAll(async () => {
  // Delete in dependency order; everything test-created is traceable.
  const chatRows = await db
    .select({ id: chatsTable.id })
    .from(chatsTable)
    .where(like(chatsTable.name, `${PREFIX}%`));
  const chatIds = chatRows.map((c) => c.id);
  if (chatIds.length) {
    await db.delete(chatMembersTable).where(inArray(chatMembersTable.chatId, chatIds));
    await db.delete(chatsTable).where(inArray(chatsTable.id, chatIds));
  }
  if (s.userIds.length) {
    await db.delete(postsTable).where(inArray(postsTable.authorId, s.userIds));
    await db.delete(rsvpsTable).where(inArray(rsvpsTable.userId, s.userIds));
  }
  await db.delete(eventsTable).where(eq(eventsTable.id, s.eventId));
  if (s.teamIds.length)
    await db.delete(teamMembersTable).where(inArray(teamMembersTable.teamId, s.teamIds));
  if (s.userIds.length) {
    await db
      .delete(guardianshipsTable)
      .where(inArray(guardianshipsTable.guardianId, s.userIds));
    await db
      .delete(clubMembersTable)
      .where(
        and(
          eq(clubMembersTable.clubId, s.clubId),
          inArray(clubMembersTable.userId, s.userIds),
        ),
      );
  }
  if (s.teamIds.length)
    await db.delete(teamsTable).where(inArray(teamsTable.id, s.teamIds));
  if (s.userIds.length)
    await db.delete(usersTable).where(inArray(usersTable.id, s.userIds));
  if (s.createdClub) await db.delete(clubsTable).where(eq(clubsTable.id, s.clubId));
  await pool.end();
});

function reasonFor(body: { rsvps: { person: { id: number }; reason: string | null }[] }, userId: number) {
  const row = body.rsvps.find((r) => r.person.id === userId);
  expect(row).toBeDefined();
  return row!.reason;
}

describe("RSVP 'not going' reason redaction", () => {
  const getEvent = (who: string) =>
    request(app).get(`/api/events/${s.eventId}`).set(as(who)).expect(200);

  it("team staff sees reasons", async () => {
    const res = await getEvent("coach");
    expect(reasonFor(res.body, s.playerA)).toBe("family emergency");
    expect(reasonFor(res.body, s.playerB)).toBe("sick with flu");
  });

  it("club admin sees reasons", async () => {
    const res = await getEvent("admin");
    expect(reasonFor(res.body, s.playerA)).toBe("family emergency");
  });

  it("player sees own reason but NOT another player's", async () => {
    const res = await getEvent("playerA");
    expect(reasonFor(res.body, s.playerA)).toBe("family emergency");
    expect(reasonFor(res.body, s.playerB)).toBeNull();
  });

  it("guardian sees their ward's reason but NOT another player's", async () => {
    const res = await getEvent("guardianA");
    expect(reasonFor(res.body, s.playerA)).toBe("family emergency");
    expect(reasonFor(res.body, s.playerB)).toBeNull();
  });
});

describe("team-only chat creation", () => {
  it("allows a chat between teammates", async () => {
    await request(app)
      .post("/api/chats")
      .set(as("playerA"))
      .send({ name: PREFIX + "teammates", type: "group", memberIds: [s.playerB] })
      .expect(201);
  });

  it("403s a chat with a non-teammate", async () => {
    const res = await request(app)
      .post("/api/chats")
      .set(as("playerA"))
      .send({ name: PREFIX + "strangers", type: "group", memberIds: [s.outsider] })
      .expect(403);
    expect(res.body.error).toMatch(/own teams/i);
  });

  it("guardian inherits their ward's teams (can chat with ward's teammate)", async () => {
    await request(app)
      .post("/api/chats")
      .set(as("guardianA"))
      .send({ name: PREFIX + "guardian-chat", type: "group", memberIds: [s.playerB] })
      .expect(201);
  });

  it("403s a guardian chatting outside their ward's teams", async () => {
    await request(app)
      .post("/api/chats")
      .set(as("guardianA"))
      .send({ name: PREFIX + "guardian-stranger", type: "group", memberIds: [s.outsider] })
      .expect(403);
  });
});

describe("club-wide posting is admin-only", () => {
  it("403s a non-admin (even team staff)", async () => {
    for (const who of ["playerA", "coach", "guardianA"]) {
      const res = await request(app)
        .post("/api/posts/club")
        .set(as(who))
        .send({ body: PREFIX + "should not exist" })
        .expect(403);
      expect(res.body.error).toMatch(/admin/i);
    }
    // And nothing was written.
    const rows = await db
      .select({ id: postsTable.id })
      .from(postsTable)
      .where(inArray(postsTable.authorId, s.userIds));
    expect(rows).toHaveLength(0);
  });

  it("allows a club admin", async () => {
    const res = await request(app)
      .post("/api/posts/club")
      .set(as("admin"))
      .send({ body: PREFIX + "club announcement" })
      .expect(201);
    expect(res.body.created).toBeGreaterThan(0);
  });
});

describe("GET /people?teamId scoping", () => {
  it("returns team members + guardians of its players, and nobody else", async () => {
    const res = await request(app)
      .get(`/api/people?teamId=${s.teamIds[0]}`)
      .set(as("coach"))
      .expect(200);
    const ids = new Set(res.body.map((p: { id: number }) => p.id));
    expect(ids.has(s.coach)).toBe(true);
    expect(ids.has(s.playerA)).toBe(true);
    expect(ids.has(s.playerB)).toBe(true);
    expect(ids.has(s.guardianA)).toBe(true); // guardian of playerA
    expect(ids.has(s.outsider)).toBe(false); // other team
    expect(ids.has(s.admin)).toBe(false); // in club but not on the team
  });
});
