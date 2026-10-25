import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, unknown> }) => ({
    userId: (req.headers["x-test-user"] as string | undefined) ?? null,
  }),
  clerkClient: { users: { getUser: async () => { throw new Error("Unexpected Clerk call"); } } },
}));

import { inArray } from "drizzle-orm";
import {
  db, clubsTable, usersTable, clubMembersTable,
  teamsTable, teamMembersTable, guardianshipsTable,
} from "@workspace/db";
import app from "../src/app";

const PREFIX = "test_club_overview_";
const clubs: number[] = [];
const teams: number[] = [];
const users: number[] = [];
const as = (index: number) => ({ "x-test-user": `${PREFIX}admin${index}` });

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("clubhub_test")) throw new Error("Disposable test DB required");
  for (let index = 0; index < 3; index++) {
    const [club] = await db.insert(clubsTable).values({ name: `${PREFIX}${index}` }).returning();
    clubs.push(club.id);
    const [admin] = await db.insert(usersTable).values({
      clubId: club.id, firstName: "Admin", lastName: `${index}`,
      clerkUserId: `${PREFIX}admin${index}`,
    }).returning();
    users.push(admin.id);
    await db.insert(clubMembersTable).values({ clubId: club.id, userId: admin.id, role: "admin" });
  }

  for (const clubId of [clubs[0], clubs[0], clubs[1]]) {
    const [team] = await db.insert(teamsTable).values({
      clubId, name: `${PREFIX}team${teams.length}`, ageGroup: "U14",
    }).returning();
    teams.push(team.id);
  }
  async function person(name: string, clubIndex: number) {
    const [user] = await db.insert(usersTable).values({
      clubId: clubs[clubIndex], firstName: name, lastName: "Test",
    }).returning();
    users.push(user.id);
    return user.id;
  }
  const sibling1 = await person("SiblingOne", 0);
  const sibling2 = await person("SiblingTwo", 0);
  const otherPlayer = await person("OtherPlayer", 1);
  const coach = await person("Coach", 0);
  await db.insert(teamMembersTable).values([
    { teamId: teams[0], userId: sibling1, role: "player" },
    { teamId: teams[1], userId: sibling1, role: "player" },
    { teamId: teams[1], userId: sibling2, role: "player" },
    { teamId: teams[2], userId: otherPlayer, role: "player" },
    { teamId: teams[0], userId: coach, role: "coach" },
  ]);
  const siblingParent = await person("SiblingParent", 0);
  const sharedParent = await person("SharedParent", 1);
  const otherParent = await person("OtherParent", 0);
  const extraOtherParent = await person("ExtraOtherParent", 1);
  const coachGuardian = await person("CoachGuardian", 0);
  await db.insert(guardianshipsTable).values([
    { guardianId: siblingParent, playerId: sibling1 },
    { guardianId: siblingParent, playerId: sibling2 },
    { guardianId: sharedParent, playerId: sibling1 },
    { guardianId: sharedParent, playerId: otherPlayer },
    { guardianId: otherParent, playerId: otherPlayer },
    { guardianId: extraOtherParent, playerId: otherPlayer },
    { guardianId: coachGuardian, playerId: coach },
  ]);
});

afterAll(async () => {
  if (users.length) {
    await db.delete(guardianshipsTable).where(inArray(guardianshipsTable.guardianId, users));
    await db.delete(teamMembersTable).where(inArray(teamMembersTable.userId, users));
    await db.delete(clubMembersTable).where(inArray(clubMembersTable.userId, users));
    await db.delete(usersTable).where(inArray(usersTable.id, users));
  }
  if (teams.length) await db.delete(teamsTable).where(inArray(teamsTable.id, teams));
  if (clubs.length) await db.delete(clubsTable).where(inArray(clubsTable.id, clubs));
});

describe("club overview parent totals", () => {
  it("counts only guardians of this club's players, once across siblings and teams", async () => {
    const response = await request(app).get("/api/club/overview").set(as(0)).expect(200);
    expect(response.body).toMatchObject({ teamCount: 2, playerCount: 2, parentCount: 2 });
  });

  it("scopes a second club independently and includes parents with another home club", async () => {
    const response = await request(app).get("/api/club/overview").set(as(1)).expect(200);
    expect(response.body).toMatchObject({ teamCount: 1, playerCount: 1, parentCount: 3 });
  });

  it("shows zero parents for a new club with no teams", async () => {
    const response = await request(app).get("/api/club/overview").set(as(2)).expect(200);
    expect(response.body).toMatchObject({ teamCount: 0, playerCount: 0, parentCount: 0 });
  });

  it("still shows zero parents after a new club adds its first empty team", async () => {
    const [team] = await db.insert(teamsTable).values({
      clubId: clubs[2], name: `${PREFIX}first team`, ageGroup: "U14",
    }).returning();
    teams.push(team.id);
    const response = await request(app).get("/api/club/overview").set(as(2)).expect(200);
    expect(response.body).toMatchObject({ teamCount: 1, playerCount: 0, parentCount: 0 });
  });
});
