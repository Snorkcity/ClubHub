import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, unknown> }) => ({
    userId: (req.headers["x-test-user"] as string | undefined) ?? null,
  }),
  clerkClient: {
    users: { getUser: async () => { throw new Error("Clerk must not be called"); } },
  },
}));

import { and, eq, inArray } from "drizzle-orm";
import {
  clubMembersTable,
  clubsTable,
  db,
  learningPreferencesTable,
  pool,
  teamMembersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";
import app from "../src/app";

const PREFIX = "test_learning_preferences_";
const ids = { users: [] as number[], teams: [] as number[] };
const as = (name: string) => ({ "x-test-user": `${PREFIX}${name}` });
let clubId = 0;
let playerId = 0;
let coachId = 0;
let unrelatedCoachId = 0;
let nonPlayerId = 0;
let teamId = 0;

async function createUser(name: string) {
  const [person] = await db.insert(usersTable).values({
    clubId,
    clerkUserId: `${PREFIX}${name}`,
    firstName: name,
    lastName: "Learning",
  }).returning();
  ids.users.push(person.id);
  await db.insert(clubMembersTable).values({
    clubId,
    userId: person.id,
    role: "member",
  });
  return person.id;
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("clubhub_test")) {
    throw new Error("Disposable test database required");
  }
  const [club] = await db.insert(clubsTable).values({ name: `${PREFIX}club` }).returning();
  clubId = club.id;
  playerId = await createUser("player");
  coachId = await createUser("coach");
  unrelatedCoachId = await createUser("unrelated-coach");
  nonPlayerId = await createUser("non-player");
  const [team] = await db.insert(teamsTable).values({
    clubId,
    name: `${PREFIX}team`,
    ageGroup: "U13",
  }).returning();
  teamId = team.id;
  ids.teams.push(team.id);
  const [otherTeam] = await db.insert(teamsTable).values({
    clubId,
    name: `${PREFIX}other-team`,
    ageGroup: "U15",
  }).returning();
  ids.teams.push(otherTeam.id);
  await db.insert(teamMembersTable).values([
    { teamId, userId: playerId, role: "player" },
    { teamId, userId: coachId, role: "coach" },
    { teamId: otherTeam.id, userId: unrelatedCoachId, role: "coach" },
  ]);
});

afterAll(async () => {
  if (ids.users.length) {
    await db.delete(learningPreferencesTable)
      .where(inArray(learningPreferencesTable.userId, ids.users));
    await db.delete(teamMembersTable)
      .where(inArray(teamMembersTable.teamId, ids.teams));
    await db.delete(teamsTable).where(inArray(teamsTable.id, ids.teams));
    await db.delete(clubMembersTable)
      .where(and(eq(clubMembersTable.clubId, clubId), inArray(clubMembersTable.userId, ids.users)));
    await db.delete(usersTable).where(inArray(usersTable.id, ids.users));
  }
  if (clubId) await db.delete(clubsTable).where(eq(clubsTable.id, clubId));
  await pool.end();
});

describe("player learning-preference API", () => {
  it("lets a player submit and retake, and limits the coach view to their team staff", async () => {
    await request(app)
      .get("/api/me/learning-preferences")
      .set(as("player"))
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          completed: false,
          visualScore: 0,
          auditoryScore: 0,
          kinestheticScore: 0,
          questionnaireVersion: 2,
        });
      });

    await request(app)
      .put("/api/me/learning-preferences")
      .set(as("player"))
      .send({ answers: Array(29).fill("visual") })
      .expect(400);

    const answers = [
      ...Array(12).fill("visual"),
      ...Array(10).fill("auditory"),
      ...Array(8).fill("kinesthetic"),
    ];
    const saved = await request(app)
      .put("/api/me/learning-preferences")
      .set(as("player"))
      .send({ answers })
      .expect(200);
    expect(saved.body).toMatchObject({
      completed: true,
      visualScore: 12,
      auditoryScore: 10,
      kinestheticScore: 8,
      questionnaireVersion: 1,
    });

    await request(app)
      .get(`/api/people/${playerId}/learning-preferences`)
      .set(as("coach"))
      .expect(200)
      .expect(({ body }) => expect(body.visualScore).toBe(12));
    await request(app)
      .get(`/api/people/${playerId}/learning-preferences`)
      .set(as("unrelated-coach"))
      .expect(403);
    await request(app)
      .get("/api/me/learning-preferences")
      .set(as("non-player"))
      .expect(403);

    await request(app)
      .put("/api/me/learning-preferences")
      .set(as("player"))
      .send({
        answers: [
          ["visual", "auditory"],
          ["visual"],
          ["visual"],
          ["visual"],
          ["auditory"],
          ["auditory"],
          ["kinesthetic"],
          ["kinesthetic"],
          "depends",
          "depends",
          "depends",
          "depends",
          "depends",
          "depends",
          "depends",
        ],
      })
      .expect(200);
    await request(app)
      .get("/api/me/learning-preferences")
      .set(as("player"))
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          questionnaireVersion: 2,
          visualScore: 13,
          auditoryScore: 9,
          kinestheticScore: 8,
        });
      });

    await request(app)
      .put("/api/me/learning-preferences")
      .set(as("player"))
      .send({
        answers: [
          ["visual"],
          ["visual"],
          ["visual"],
          ["visual"],
          ["visual"],
          ["visual"],
          ["visual"],
          "depends",
          "depends",
          "depends",
          "depends",
          "depends",
          "depends",
          "depends",
          "depends",
        ],
      })
      .expect(400);

    const updated = await request(app)
      .put("/api/me/learning-preferences")
      .set(as("player"))
      .send({ answers: Array(30).fill("kinesthetic") })
      .expect(200);
    expect(updated.body).toMatchObject({
      questionnaireVersion: 1,
      visualScore: 0,
      auditoryScore: 0,
      kinestheticScore: 30,
    });
  });
});
