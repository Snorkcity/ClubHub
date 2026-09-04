import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, unknown> }) => ({
    userId: (req.headers["x-test-user"] as string | undefined) ?? null,
  }),
  clerkClient: { users: { getUser: async () => { throw new Error("Clerk must not be called"); } } },
}));

import { and, eq, inArray } from "drizzle-orm";
import {
  clubMembersTable,
  clubsTable,
  db,
  developmentAssessmentsTable,
  developmentCycleAssessorsTable,
  developmentCyclesTable,
  developmentReportsTable,
  guardianshipsTable,
  notificationRecipientsTable,
  notificationsTable,
  pool,
  teamMembersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";
import app from "../src/app";

const PREFIX = "test_dev_";
const ids = { users: [] as number[], team: 0, otherTeam: 0, cycle: 0, report: 0 };
const as = (name: string) => ({ "x-test-user": `${PREFIX}${name}` });
let clubId = 0;
let selected = 0;
let unselected = 0;
let playerA = 0;
let playerB = 0;
let guardian = 0;
let nonManagingGuardian = 0;
let technicalDirector = 0;

async function user(name: string) {
  const [row] = await db.insert(usersTable).values({
    clubId, clerkUserId: `${PREFIX}${name}`, firstName: name, lastName: "Development",
  }).returning();
  ids.users.push(row.id);
  await db.insert(clubMembersTable).values({ clubId, userId: row.id, role: "member" });
  return row.id;
}

const assessment = (internalNotes: string) => ({
  technical: 3,
  tactical: 4,
  physical: 2,
  coachabilityMindset: 5,
  effortConsistency: 3,
  teamworkCommunication: 4,
  attendanceReliability: 5,
  strength: "Creates space well.",
  focus: "Keep developing first touch.",
  internalNotes,
});

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("clubhub_test")) throw new Error("Disposable test database required");
  let club = (await db.select().from(clubsTable).limit(1))[0];
  if (!club) club = (await db.insert(clubsTable).values({ name: "Test Club" }).returning())[0];
  clubId = club.id;
  selected = await user("selected");
  unselected = await user("unselected");
  playerA = await user("playerA");
  playerB = await user("playerB");
  guardian = await user("guardian");
  nonManagingGuardian = await user("nonmanager");
  technicalDirector = await user("technicalDirector");
  const [team] = await db.insert(teamsTable).values({ clubId, name: `${PREFIX}team`, ageGroup: "U13" }).returning();
  ids.team = team.id;
  const [otherTeam] = await db.insert(teamsTable).values({ clubId, name: `${PREFIX}other`, ageGroup: "U15" }).returning();
  ids.otherTeam = otherTeam.id;
  await db.insert(teamMembersTable).values([
    { teamId: team.id, userId: selected, role: "coach" },
    { teamId: team.id, userId: unselected, role: "coach" },
    { teamId: team.id, userId: playerA, role: "player" },
    { teamId: team.id, userId: playerB, role: "player" },
    { teamId: otherTeam.id, userId: technicalDirector, role: "manager" },
  ]);
  await db.insert(guardianshipsTable).values([
    { guardianId: guardian, playerId: playerA, canManage: true },
    { guardianId: nonManagingGuardian, playerId: playerA, canManage: false },
  ]);
  const created = await request(app).post(`/api/teams/${team.id}/development-cycles`)
    .set(as("selected")).send({
      title: "Mid-season development",
      reportingPeriod: "January to June",
      assessorIds: [selected],
    }).expect(201);
  ids.cycle = created.body.id;
});

afterAll(async () => {
  const notificationRows = await db.select({ id: notificationsTable.id }).from(notificationsTable)
    .where(and(eq(notificationsTable.kind, "development"), eq(notificationsTable.clubId, clubId)));
  const notificationIds = notificationRows.map((x) => x.id);
  if (notificationIds.length) {
    await db.delete(notificationRecipientsTable).where(inArray(notificationRecipientsTable.notificationId, notificationIds));
    await db.delete(notificationsTable).where(inArray(notificationsTable.id, notificationIds));
  }
  await db.delete(developmentReportsTable).where(eq(developmentReportsTable.cycleId, ids.cycle));
  await db.delete(developmentAssessmentsTable).where(eq(developmentAssessmentsTable.cycleId, ids.cycle));
  await db.delete(developmentCycleAssessorsTable).where(eq(developmentCycleAssessorsTable.cycleId, ids.cycle));
  await db.delete(developmentCyclesTable).where(eq(developmentCyclesTable.id, ids.cycle));
  await db.delete(guardianshipsTable).where(inArray(guardianshipsTable.guardianId, ids.users));
  await db.delete(teamMembersTable).where(eq(teamMembersTable.teamId, ids.team));
  await db.delete(teamMembersTable).where(eq(teamMembersTable.teamId, ids.otherTeam));
  await db.delete(teamsTable).where(eq(teamsTable.id, ids.team));
  await db.delete(teamsTable).where(eq(teamsTable.id, ids.otherTeam));
  await db.delete(clubMembersTable).where(and(eq(clubMembersTable.clubId, clubId), inArray(clubMembersTable.userId, ids.users)));
  await db.delete(usersTable).where(inArray(usersTable.id, ids.users));
  await pool.end();
});

describe("player development permissions and lifecycle", () => {
  it("denies team staff who were not selected", async () => {
    await request(app).get(`/api/development-cycles/${ids.cycle}`).set(as("unselected")).expect(403);
    await request(app).put(`/api/development-cycles/${ids.cycle}/players/${playerA}/assessment`)
      .set(as("unselected")).send(assessment("must never save")).expect(403);
  });

  it("exposes compact same-club recipient candidates to team staff", async () => {
    const candidates = await request(app).get(`/api/teams/${ids.team}/development-recipient-candidates`)
      .set(as("selected")).expect(200);
    const candidateIds = candidates.body.map((candidate: { id: number }) => candidate.id);
    expect(candidateIds).toContain(technicalDirector);
    expect(candidateIds).toContain(selected);
    expect(candidateIds).toContain(guardian);
    expect(candidates.body.every((candidate: Record<string, unknown>) => !("email" in candidate) && !("phone" in candidate))).toBe(true);
    await request(app).get(`/api/teams/${ids.team}/development-recipient-candidates`)
      .set(as("guardian")).expect(403);
  });

  it("allows selected assessor saves and rejects incomplete submission", async () => {
    await request(app).put(`/api/development-cycles/${ids.cycle}/players/${playerA}/assessment`)
      .set(as("selected")).send(assessment("staff-only context")).expect(200);
    const incomplete = await request(app).post(`/api/development-cycles/${ids.cycle}/submit`)
      .set(as("selected")).expect(409);
    expect(incomplete.body.error).toMatch(/all current players/i);
  });

  it("serializes concurrent save and submit, then locks all edits", async () => {
    const [save, submit] = await Promise.all([
      request(app).put(`/api/development-cycles/${ids.cycle}/players/${playerB}/assessment`)
        .set(as("selected")).send(assessment("another private note")),
      request(app).post(`/api/development-cycles/${ids.cycle}/submit`).set(as("selected")),
    ]);
    expect(save.status).toBe(200);
    expect([200, 409]).toContain(submit.status);
    if (submit.status === 409)
      await request(app).post(`/api/development-cycles/${ids.cycle}/submit`).set(as("selected")).expect(200);
    await request(app).put(`/api/development-cycles/${ids.cycle}/players/${playerA}/assessment`)
      .set(as("selected")).send(assessment("changed")).expect(409);
  });

  it("releases a guardian-safe report only to managing guardians", async () => {
    const releases = await Promise.all([
      request(app).post(`/api/development-cycles/${ids.cycle}/release`).set(as("selected")),
      request(app).post(`/api/development-cycles/${ids.cycle}/release`).set(as("selected")),
    ]);
    expect(releases.every((release) => release.status === 200)).toBe(true);
    expect(releases.map((release) => release.body.reportCount).sort()).toEqual([2, 2]);
    const rows = await db.select().from(developmentReportsTable).where(eq(developmentReportsTable.cycleId, ids.cycle));
    expect(rows).toHaveLength(2);
    const retry = await request(app).post(`/api/development-cycles/${ids.cycle}/release`).set(as("selected")).expect(200);
    expect(retry.body).toMatchObject({ released: true, reportCount: 2, emailFailures: 0 });
    const list = await request(app).get(`/api/players/${playerA}/development-reports`)
      .set(as("guardian")).expect(200);
    expect(list.body).toHaveLength(1);
    ids.report = list.body[0].id;
    await request(app).get(`/api/development-reports/${ids.report}`)
      .set(as("nonmanager")).expect(403);
    const report = await request(app).get(`/api/development-reports/${ids.report}`)
      .set(as("guardian")).expect(200);
    expect(report.body.categories).toHaveLength(7);
    expect(report.body.categories.find((x: { score: number }) => x.score === 3).narrative)
      .toMatch(/meets the expected team standard/i);
    expect(JSON.stringify(report.body)).not.toContain("staff-only context");
    expect(report.body).not.toHaveProperty("internalNotes");
    expect(report.body).not.toHaveProperty("updatedBy");
    expect(report.body).not.toHaveProperty("assessmentId");
  });
});