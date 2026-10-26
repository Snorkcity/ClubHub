import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db, pool, clubsTable, clubMembersTable, teamsTable, teamMembersTable,
  usersTable, guardianshipsTable, eventsTable, rsvpsTable,
} from "@workspace/db";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, unknown> }) => ({
    userId: req.headers["x-test-user"] ?? null,
  }),
  clerkClient: { users: { getUser: async () => { throw Error("Unexpected Clerk call"); } } },
}));
import app from "../src/app";

const prefix = "launch_event_permissions_";
const people: Record<string, number> = {};
const clubIds: number[] = [];
const teamIds: number[] = [];
const eventIds: number[] = [];
let teamA: number;
let eventA: number;

async function person(name: string, clubId: number, admin = false) {
  const [user] = await db.insert(usersTable).values({
    clubId, clerkUserId: prefix + name, firstName: prefix, lastName: name,
  }).returning();
  people[name] = user.id;
  await db.insert(clubMembersTable).values({ clubId, userId: user.id, role: admin ? "admin" : "member" });
  return user.id;
}

const acting = (name: string) => ({ "x-test-user": prefix + name });

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("clubhub_test")) throw Error("Disposable test database required");
  const clubs = await db.insert(clubsTable).values([
    { name: prefix + "home" }, { name: prefix + "foreign" },
  ]).returning();
  clubIds.push(...clubs.map(club => club.id));
  for (const name of ["coach", "manager", "player", "peer", "ward", "guardian", "readOnly", "otherCoach", "outsider"]) {
    await person(name, clubIds[0]);
  }
  await person("admin", clubIds[0], true);
  await person("foreignAdmin", clubIds[1], true);
  const teams = await db.insert(teamsTable).values([
    { clubId: clubIds[0], name: prefix + "A", ageGroup: "U14" },
    { clubId: clubIds[0], name: prefix + "B", ageGroup: "U14" },
    { clubId: clubIds[1], name: prefix + "foreign", ageGroup: "U14" },
  ]).returning();
  teamIds.push(...teams.map(team => team.id));
  teamA = teamIds[0];
  await db.insert(teamMembersTable).values([
    { teamId: teamA, userId: people.coach, role: "coach" },
    { teamId: teamA, userId: people.manager, role: "manager" },
    ...["player", "peer", "ward"].map(name => ({ teamId: teamA, userId: people[name], role: "player" })),
    { teamId: teamIds[1], userId: people.otherCoach, role: "coach" },
    { teamId: teamIds[1], userId: people.outsider, role: "player" },
  ]);
  await db.insert(guardianshipsTable).values([
    { guardianId: people.guardian, playerId: people.ward, canManage: true },
    { guardianId: people.readOnly, playerId: people.ward, canManage: false },
  ]);
  const events = await db.insert(eventsTable).values(teams.map(team => ({
    teamId: team.id,
    createdById: team.clubId === clubIds[0] ? people.coach : people.foreignAdmin,
    type: "training", title: prefix + "original", startsAt: new Date("2030-01-15T08:00:00Z"),
  }))).returning();
  eventIds.push(...events.map(event => event.id));
  eventA = eventIds[0];
});

afterAll(async () => {
  if (eventIds.length) {
    await db.delete(rsvpsTable).where(inArray(rsvpsTable.eventId, eventIds));
    await db.delete(eventsTable).where(inArray(eventsTable.id, eventIds));
  }
  if (teamIds.length) {
    await db.delete(teamMembersTable).where(inArray(teamMembersTable.teamId, teamIds));
    await db.delete(teamsTable).where(inArray(teamsTable.id, teamIds));
  }
  const ids = Object.values(people);
  if (ids.length) {
    await db.delete(guardianshipsTable).where(inArray(guardianshipsTable.guardianId, ids));
    await db.delete(clubMembersTable).where(inArray(clubMembersTable.userId, ids));
    await db.delete(usersTable).where(inArray(usersTable.id, ids));
  }
  if (clubIds.length) await db.delete(clubsTable).where(inArray(clubsTable.id, clubIds));
  await pool.end();
});

describe("event administration boundaries", () => {
  it.each(["player", "guardian", "readOnly", "otherCoach", "foreignAdmin"])(
    "%s cannot edit, cancel, delete or create events for this team",
    async name => {
      const before = await db.select().from(eventsTable).where(eq(eventsTable.id, eventA));
      expect((await request(app).patch(`/api/events/${eventA}`).set(acting(name))
        .send({ title: "unauthorised edit" })).status).toBe(403);
      expect((await request(app).post(`/api/events/${eventA}/cancel`).set(acting(name))
        .send({ reason: "unauthorised cancellation" })).status).toBe(403);
      expect((await request(app).delete(`/api/events/${eventA}`).set(acting(name))).status).toBe(403);
      expect((await request(app).post(`/api/teams/${teamA}/events`).set(acting(name))
        .send({ title: "unauthorised event", type: "training", startsAt: "2030-01-15T08:00:00Z" })).status).toBe(403);
      expect(await db.select().from(eventsTable).where(eq(eventsTable.id, eventA))).toEqual(before);
      expect(await db.select().from(eventsTable).where(eq(eventsTable.teamId, teamA))).toHaveLength(1);
    },
  );

  it.each(["coach", "manager", "admin"])("%s can edit their team's event", async name => {
    const title = prefix + name;
    const response = await request(app).patch(`/api/events/${eventA}`).set(acting(name)).send({ title });
    expect(response.status).toBe(200);
    expect(response.body.title).toBe(title);
    const [stored] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventA));
    expect(stored.title).toBe(title);
  });

  it("rejects unauthenticated event writes", async () => {
    expect((await request(app).patch(`/api/events/${eventA}`).send({ title: "anonymous" })).status).toBe(401);
    expect((await request(app).put(`/api/events/${eventA}/rsvp`).send({ status: "out" })).status).toBe(401);
  });
});

describe("RSVP-on-behalf boundaries", () => {
  it.each([
    ["player", "peer"],
    ["guardian", "peer"],
    ["readOnly", "ward"],
    ["otherCoach", "ward"],
    ["foreignAdmin", "ward"],
  ])("%s cannot RSVP for %s without the required authority", async (actor, target) => {
    const where = and(eq(rsvpsTable.eventId, eventA), eq(rsvpsTable.userId, people[target]));
    const before = await db.select().from(rsvpsTable).where(where);
    const response = await request(app).put(`/api/events/${eventA}/rsvp`).set(acting(actor))
      .send({ status: "out", reason: "not authorised", onBehalfOfPersonId: people[target] });
    expect(response.status).toBe(403);
    expect(await db.select().from(rsvpsTable).where(where)).toEqual(before);
  });

  it.each(["coach", "manager", "admin", "guardian"])("%s can RSVP for an authorised player", async actor => {
    const response = await request(app).put(`/api/events/${eventA}/rsvp`).set(acting(actor))
      .send({ status: "out", reason: prefix + actor, onBehalfOfPersonId: people.ward });
    expect(response.status).toBe(200);
    const [stored] = await db.select().from(rsvpsTable).where(
      and(eq(rsvpsTable.eventId, eventA), eq(rsvpsTable.userId, people.ward)),
    );
    expect(stored.reason).toBe(prefix + actor);
    expect(stored.status).toBe("out");
  });

  it("allows a player to RSVP for themselves without changing a teammate's response", async () => {
    const before = await db.select().from(rsvpsTable).where(
      and(eq(rsvpsTable.eventId, eventA), eq(rsvpsTable.userId, people.ward)),
    );
    expect((await request(app).put(`/api/events/${eventA}/rsvp`).set(acting("player"))
      .send({ status: "out", reason: "own response" })).status).toBe(200);
    expect(await db.select().from(rsvpsTable).where(
      and(eq(rsvpsTable.eventId, eventA), eq(rsvpsTable.userId, people.ward)),
    )).toEqual(before);
  });

  it.each(["coach", "admin"])("%s cannot RSVP a nonmember into this event", async actor => {
    const response = await request(app).put(`/api/events/${eventA}/rsvp`).set(acting(actor))
      .send({ status: "out", onBehalfOfPersonId: people.outsider });
    expect(response.status).toBe(400);
    expect(await db.select().from(rsvpsTable).where(
      and(eq(rsvpsTable.eventId, eventA), eq(rsvpsTable.userId, people.outsider)),
    )).toHaveLength(0);
  });
});

describe("multi-club profile boundaries", () => {
  beforeAll(async () => {
    await db.insert(clubMembersTable).values({
      clubId: clubIds[1], userId: people.peer, role: "member",
    });
    await db.insert(teamMembersTable).values({
      teamId: teamIds[2], userId: people.peer, role: "player",
    });
  });

  it.each([["coach", 0], ["foreignAdmin", 1]] as const)(
    "%s sees only the shared person's memberships within the current club",
    async (actor, clubIndex) => {
      const response = await request(app).get(`/api/people/${people.peer}`)
        .set(acting(actor)).set("X-Club-Id", String(clubIds[clubIndex])).expect(200);
      expect(response.body.person.id).toBe(people.peer);
      expect(response.body.memberships.map((membership: { teamId: number }) => membership.teamId))
        .toEqual([clubIndex === 0 ? teamIds[0] : teamIds[2]]);
      expect(await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, people.peer)))
        .toHaveLength(2);
      const [person] = await db.select().from(usersTable).where(eq(usersTable.id, people.peer));
      expect(person.clubId).toBe(clubIds[0]);
    },
  );
});
