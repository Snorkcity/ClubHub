import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db, pool, clubsTable, clubMembersTable, teamsTable, teamMembersTable,
  usersTable, eventsTable, rpeEntriesTable, wellnessEntriesTable,
  learningPreferencesTable, guardianshipsTable,
} from "@workspace/db";
import { normalizeTeamAgeGroup, teamFeatures } from "@workspace/api-zod";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, unknown> }) => ({
    userId: req.headers["x-test-user"] ?? null,
  }),
  clerkClient: { users: { getUser: async () => { throw new Error("Unexpected Clerk call"); } } },
}));
import app from "../src/app";

describe("team feature classification", () => {
  it.each([
    ["U13", false, true], ["U14", true, true], ["U17", true, true],
    ["U18", true, false], ["Seniors", true, false], ["Varsity", false, false],
  ])("%s has monitoring=%s and timekeeping=%s", (age, monitoring, timekeeping) => {
    expect(teamFeatures(age)).toMatchObject({ monitoring, learningPreferences: monitoring, timekeeping });
  });
  it.each([["Under 14", "U14"], ["u-17", "U17"], ["14s", "U14"], ["Senior", "Seniors"], ["Open", "Seniors"]])(
    "normalizes %s", (input, output) => expect(normalizeTeamAgeGroup(input)).toBe(output),
  );
});

const prefix = "test_feature_policy_";
const teams: Record<string, number> = {};
const players: Record<string, number> = {};
const events: Record<string, number> = {};
const userIds: number[] = [];
const teamIds: number[] = [];
let clubId: number;
let admin: number;
let coach: number;
let guardian: number;
let mixed: number;
const auth = (name: string) => ({ "x-test-user": `${prefix}${name}` });
const date = () => new Date().toISOString().slice(0, 10);
const wellness = () => ({ entryDate: date(), sleepQuality: 4, energy: 4, soreness: 4, stress: 4, mood: 4 });
const answers = Array.from({ length: 15 }, () => ["visual"]);

async function person(name: string, role: "admin" | "member" = "member") {
  const [user] = await db.insert(usersTable).values({
    clubId, clerkUserId: `${prefix}${name}`, firstName: name, lastName: "Features",
  }).returning();
  userIds.push(user.id);
  await db.insert(clubMembersTable).values({ clubId, userId: user.id, role });
  return user.id;
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("clubhub_test")) throw Error("Disposable test database required");
  const [club] = await db.insert(clubsTable).values({ name: prefix }).returning();
  clubId = club.id;
  admin = await person("admin", "admin");
  coach = await person("coach");
  guardian = await person("guardian");
  mixed = await person("mixed");
  for (const ageGroup of ["U13", "U14", "U17", "U18", "Seniors", "Varsity"]) {
    const [team] = await db.insert(teamsTable).values({ clubId, name: `${prefix}${ageGroup}`, ageGroup }).returning();
    teams[ageGroup] = team.id;
    teamIds.push(team.id);
    players[ageGroup] = await person(ageGroup);
    await db.insert(teamMembersTable).values([
      { teamId: team.id, userId: players[ageGroup], role: "player" },
      { teamId: team.id, userId: admin, role: "coach" },
      ...(ageGroup === "U13" ? [{ teamId: team.id, userId: coach, role: "coach" }] : []),
      ...(["U13", "U14"].includes(ageGroup) ? [{ teamId: team.id, userId: mixed, role: "player" }] : []),
    ]);
    const [event] = await db.insert(eventsTable).values({
      teamId: team.id, createdById: admin, type: "game", title: prefix,
      startsAt: new Date(Date.now() - 3 * 3600000), endsAt: new Date(Date.now() - 2 * 3600000),
    }).returning();
    events[ageGroup] = event.id;
  }
  await db.insert(guardianshipsTable).values([
    { guardianId: guardian, playerId: players.U13 },
    { guardianId: guardian, playerId: players.U14 },
  ]);
});

afterAll(async () => {
  if (userIds.length) {
    await db.delete(learningPreferencesTable).where(inArray(learningPreferencesTable.userId, userIds));
    await db.delete(wellnessEntriesTable).where(inArray(wellnessEntriesTable.userId, userIds));
    await db.delete(rpeEntriesTable).where(inArray(rpeEntriesTable.userId, userIds));
    await db.delete(guardianshipsTable).where(eq(guardianshipsTable.guardianId, guardian));
    await db.delete(eventsTable).where(inArray(eventsTable.teamId, teamIds));
    await db.delete(teamMembersTable).where(inArray(teamMembersTable.teamId, teamIds));
    await db.delete(teamsTable).where(eq(teamsTable.clubId, clubId));
    await db.delete(clubMembersTable).where(eq(clubMembersTable.clubId, clubId));
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
    await db.delete(clubsTable).where(eq(clubsTable.id, clubId));
  }
  await pool.end();
});

describe("server-side team feature access", () => {
  it.each(["U13", "U14", "U17", "U18", "Seniors", "Varsity"])(
    "enforces monitoring and timekeeping for %s even for admins", async age => {
      const features = teamFeatures(age);
      expect((await request(app).get(`/api/teams/${teams[age]}/monitoring`).set(auth("admin"))).status)
        .toBe(features.monitoring ? 200 : 403);
      expect((await request(app).get(`/api/events/${events[age]}/timekeeping`).set(auth("admin"))).status)
        .toBe(features.timekeeping ? 200 : 403);
      expect((await request(app).get(`/api/teams/${teams[age]}/timekeeping/season`).set(auth("admin"))).status)
        .toBe(features.timekeeping ? 200 : 403);
    },
  );
  it("rejects every timekeeping write for U18 before touching records", async () => {
    for (const suffix of ["periods/start", "periods/end", `players/${players.U18}/toggle`]) {
      expect((await request(app).post(`/api/events/${events.U18}/timekeeping/${suffix}`)
        .set(auth("admin")).send({})).status).toBe(403);
    }
  });
  it("keeps the junior coach questionnaire but rejects junior player questionnaires", async () => {
    expect((await request(app).get("/api/me/coach-learning-preferences").set(auth("coach"))).status).toBe(200);
    expect((await request(app).put("/api/me/coach-learning-preferences").set(auth("coach")).send({ answers })).status).toBe(200);
    expect((await request(app).get("/api/me/learning-preferences").set(auth("U13"))).status).toBe(403);
    expect((await request(app).put("/api/me/learning-preferences").set(auth("U13")).send({ answers })).status).toBe(403);
    expect((await request(app).get(`/api/people/${players.U13}/learning-preferences`).set(auth("admin"))).status).toBe(403);
    expect((await request(app).put("/api/me/learning-preferences").set(auth("U14")).send({ answers })).status).toBe(200);
  });
  it("scopes mixed-team players and staff results to the selected team", async () => {
    expect((await request(app).get("/api/me/learning-preferences").set(auth("mixed")).set("X-Team-Id", String(teams.U13))).status).toBe(403);
    expect((await request(app).get("/api/me/learning-preferences").set(auth("mixed")).set("X-Team-Id", String(teams.U14))).status).toBe(200);
    expect((await request(app).get(`/api/people/${mixed}/learning-preferences`).set(auth("admin")).set("X-Team-Id", String(teams.U13))).status).toBe(403);
    expect((await request(app).get(`/api/people/${mixed}/learning-preferences`).set(auth("coach"))).status).toBe(403);
    expect((await request(app).get("/api/me/learning-preferences").set(auth("mixed")).set("X-Team-Id", "invalid")).status).toBe(403);
  });
  it("omits junior players and junior events from check-in prompts, including guardian views", async () => {
    const young = await request(app).get(`/api/monitoring/checkin?date=${date()}`).set(auth("U13"));
    expect(young.body.subjects).toEqual([]);
    const parent = await request(app).get(`/api/monitoring/checkin?date=${date()}`).set(auth("guardian"));
    expect(parent.body.subjects.map((s: any) => s.person.id)).toEqual([players.U14]);
    const all = await request(app).get(`/api/monitoring/checkin?date=${date()}`).set(auth("mixed"));
    expect(all.body.subjects[0].pendingRpe.map((r: any) => r.event.id)).toEqual([events.U14]);
    const selected = await request(app).get(`/api/monitoring/checkin?date=${date()}`).set(auth("mixed")).set("X-Team-Id", String(teams.U13));
    expect(selected.body.subjects).toEqual([]);
  });
  it("blocks junior wellness and RPE, but retains senior session minutes", async () => {
    expect((await request(app).put("/api/wellness").set(auth("U13")).send(wellness())).status).toBe(403);
    expect((await request(app).put("/api/wellness").set(auth("guardian")).send({ ...wellness(), onBehalfOfPersonId: players.U13 })).status).toBe(403);
    expect((await request(app).put(`/api/events/${events.U13}/rpe`).set(auth("U13")).send({ rpe: 5 })).status).toBe(403);
    const senior = await request(app).put(`/api/events/${events.Seniors}/rpe`).set(auth("Seniors")).send({ rpe: 5 });
    expect(senior.status).toBe(200);
    expect(senior.body.minutes).toBe(60);
  });
  it("preserves data across age-group changes and applies the new rules immediately", async () => {
    expect((await request(app).put("/api/wellness").set(auth("U14")).send(wellness())).status).toBe(200);
    const before = await db.select().from(wellnessEntriesTable).where(eq(wellnessEntriesTable.userId, players.U14));
    const changed = await request(app).patch(`/api/teams/${teams.U14}`).set(auth("admin")).send({ ageGroup: "Under 13" });
    expect(changed.status).toBe(200);
    expect(changed.body.ageGroup).toBe("U13");
    expect((await request(app).put("/api/wellness").set(auth("U14")).send(wellness())).status).toBe(403);
    expect(await db.select().from(wellnessEntriesTable).where(eq(wellnessEntriesTable.userId, players.U14))).toEqual(before);
    expect((await request(app).patch(`/api/teams/${teams.U14}`).set(auth("admin")).send({ ageGroup: "Under 14" })).status).toBe(200);
    const restored = await request(app).get(`/api/monitoring/checkin?date=${date()}`).set(auth("U14"));
    expect(restored.body.subjects[0].todayWellness.id).toBe(before[0].id);
  });
  it("requires a recognized classification without silently guessing competition labels", async () => {
    expect((await request(app).post("/api/teams").set(auth("admin")).send({ name: "Ambiguous", ageGroup: "Varsity" })).status).toBe(400);
    expect((await request(app).patch(`/api/teams/${teams.U13}`).set(auth("admin")).send({ ageGroup: "NPLM" })).status).toBe(400);
    expect((await request(app).patch(`/api/teams/${teams.U13}`).set(auth("U13")).send({ ageGroup: "U14" })).status).toBe(403);
  });
});
