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
const cycleIds: number[] = [];
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
const draft = (suffix: string) => ({
  categories: [
    "technical", "tactical", "physical", "coachabilityMindset", "effortConsistency", "teamworkCommunication", "attendanceReliability",
  ].map((key) => ({ key, narrative: `${key} ${suffix}` })),
  strength: `Family strength ${suffix}`,
  focus: `Family focus ${suffix}`,
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
      internalRecipientId: technicalDirector,
    }).expect(201);
  ids.cycle = created.body.id;
  cycleIds.push(ids.cycle);
});

afterAll(async () => {
  const notificationRows = await db.select({ id: notificationsTable.id }).from(notificationsTable)
    .where(and(eq(notificationsTable.kind, "development"), eq(notificationsTable.clubId, clubId)));
  const notificationIds = notificationRows.map((x) => x.id);
  if (notificationIds.length) {
    await db.delete(notificationRecipientsTable).where(inArray(notificationRecipientsTable.notificationId, notificationIds));
    await db.delete(notificationsTable).where(inArray(notificationsTable.id, notificationIds));
  }
  await db.delete(developmentReportsTable).where(inArray(developmentReportsTable.cycleId, cycleIds));
  await db.delete(developmentAssessmentsTable).where(inArray(developmentAssessmentsTable.cycleId, cycleIds));
  await db.delete(developmentCycleAssessorsTable).where(inArray(developmentCycleAssessorsTable.cycleId, cycleIds));
  await db.delete(developmentCyclesTable).where(inArray(developmentCyclesTable.id, cycleIds));
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
    await request(app).get(`/api/development-cycles/${ids.cycle}/internal-summary`).set(as("selected")).expect(409);
    const active = await request(app).get(`/api/development-cycles/${ids.cycle}`).set(as("selected")).expect(200);
    expect(active.body.players.every((player: { reportDraft: unknown }) => player.reportDraft === null)).toBe(true);
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
    expect(candidateIds).not.toContain(guardian);
    expect(candidateIds).not.toContain(playerA);
    expect(candidates.body.every((candidate: Record<string, unknown>) => !("email" in candidate) && !("phone" in candidate))).toBe(true);
    await request(app).get(`/api/teams/${ids.team}/development-recipient-candidates`)
      .set(as("guardian")).expect(403);
    await request(app).post(`/api/teams/${ids.team}/development-cycles`).set(as("selected")).send({
      title: "Invalid recipient", reportingPeriod: "Test", assessorIds: [selected], internalRecipientId: guardian,
    }).expect(400);
  });

  it("rejects an empty submission, then allows selected assessor saves", async () => {
    const empty = await request(app).post(`/api/development-cycles/${ids.cycle}/submit`)
      .set(as("selected")).expect(409);
    expect(empty.body.error).toMatch(/at least one/i);
    await request(app).put(`/api/development-cycles/${ids.cycle}/players/${playerA}/assessment`)
      .set(as("selected")).send(assessment("staff-only context")).expect(200);
  });

  it("still submits a full team and locks all edits", async () => {
    await request(app).put(`/api/development-cycles/${ids.cycle}/players/${playerB}/assessment`)
      .set(as("selected")).send(assessment("another private note")).expect(200);
    await request(app).post(`/api/development-cycles/${ids.cycle}/submit`).set(as("selected")).expect(200);
    const detail = await request(app).get(`/api/development-cycles/${ids.cycle}`).set(as("selected")).expect(200);
    expect(detail.body).toMatchObject({ reviewedReports: 0, totalReports: 2 });
    expect(detail.body.players.every((player: { reportDraft: { reviewedAt: unknown } | null }) =>
      player.reportDraft !== null && player.reportDraft.reviewedAt === null,
    )).toBe(true);
    await db.update(developmentCyclesTable).set({ internalRecipientId: guardian }).where(eq(developmentCyclesTable.id, ids.cycle));
    await request(app).get(`/api/development-cycles/${ids.cycle}`).set(as("guardian")).expect(403);
    await request(app).get(`/api/development-cycles/${ids.cycle}/internal-summary`).set(as("guardian")).expect(403);
    await db.update(developmentCyclesTable).set({ internalRecipientId: technicalDirector }).where(eq(developmentCyclesTable.id, ids.cycle));
    expect(detail.body.players[0].reportDraft.categories.find((x: { score: number }) => x.score === 3).narrative)
      .toMatch(/meets the expected team standard/i);
    await request(app).put(`/api/development-cycles/${ids.cycle}/players/${playerA}/assessment`)
      .set(as("selected")).send(assessment("changed")).expect(409);
  });

  it("releases a guardian-safe report only to managing guardians", async () => {
    await request(app).put(`/api/development-cycles/${ids.cycle}/players/${playerA}/report-draft`)
      .set(as("unselected")).send(draft("blocked")).expect(403);
    await request(app).put(`/api/development-cycles/${ids.cycle}/players/${playerA}/report-draft`)
      .set(as("technicalDirector")).send(draft("blocked")).expect(403);
    const reviewed = await request(app).put(`/api/development-cycles/${ids.cycle}/players/${playerA}/report-draft`)
      .set(as("selected")).send(draft("edited")).expect(200);
    expect(reviewed.body.categories[0].narrative).toContain("edited");
    await request(app).get(`/api/development-cycles/${ids.cycle}/internal-summary`)
      .set(as("technicalDirector")).expect(200);
    const currentCycle = (await db.select().from(developmentCyclesTable).where(eq(developmentCyclesTable.id, ids.cycle)))[0];
    const [older] = await db.insert(developmentCyclesTable).values({
      clubId, teamId: ids.team, createdById: selected, title: "Older baseline", reportingPeriod: "Older",
      status: "submitted", submittedAt: new Date(currentCycle.submittedAt!.getTime() - 86_400_000),
    }).returning();
    const [newer] = await db.insert(developmentCyclesTable).values({
      clubId, teamId: ids.team, createdById: selected, title: "Newer cycle", reportingPeriod: "Newer",
      status: "submitted", submittedAt: new Date(currentCycle.submittedAt!.getTime() + 86_400_000),
    }).returning();
    const fixture = (cycleId: number, score: number) => db.insert(developmentAssessmentsTable).values({
      cycleId, playerId: playerA, technical: score, tactical: score, physical: score,
      coachabilityMindset: score, effortConsistency: score, teamworkCommunication: score,
      attendanceReliability: score, strength: "Fixture", focus: "Fixture", updatedById: selected,
    });
    await fixture(older.id, 1);
    await fixture(newer.id, 5);
    const baseline = await request(app).get(`/api/development-cycles/${ids.cycle}/internal-summary`)
      .set(as("selected")).expect(200);
    const playerBaseline = baseline.body.players.find((player: { player: { id: number } }) => player.player.id === playerA);
    expect(playerBaseline.previousAverage).toBe(1);
    expect(playerBaseline.averageChange).toBeCloseTo((26 / 7) - 1);
    await db.delete(developmentAssessmentsTable).where(inArray(developmentAssessmentsTable.cycleId, [older.id, newer.id]));
    await db.delete(developmentCyclesTable).where(inArray(developmentCyclesTable.id, [older.id, newer.id]));
    await request(app).post(`/api/development-cycles/${ids.cycle}/release`)
      .set(as("selected")).expect(409);
    await request(app).put(`/api/development-cycles/${ids.cycle}/players/${playerB}/report-draft`)
      .set(as("selected")).send(draft("second")).expect(200);
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
    expect(JSON.stringify(report.body)).not.toContain("staff-only context");
    expect(JSON.stringify(report.body)).toContain("technical edited");
    expect(report.body).not.toHaveProperty("internalNotes");
    expect(report.body).not.toHaveProperty("updatedBy");
    expect(report.body).not.toHaveProperty("assessmentId");
    expect(report.body).not.toHaveProperty("previousAverage");
    expect(report.body).not.toHaveProperty("teamCategoryAverages");
    expect(report.body).not.toHaveProperty("internalNotes");
  });
});

describe("partially completed feedback cycles", () => {
  let cycleId: number;
  let reportId: number;

  async function createCycle(assessorIds = [selected]) {
    const response = await request(app).post(`/api/teams/${ids.team}/development-cycles`)
      .set(as("selected")).send({
        title: "Partial team feedback", reportingPeriod: "Partial cycle test", assessorIds,
      }).expect(201);
    cycleIds.push(response.body.id);
    return response.body.id as number;
  }

  beforeAll(async () => {
    const partialAdmin = await user("partialAdmin");
    await db.update(clubMembersTable).set({ role: "admin" })
      .where(and(eq(clubMembersTable.clubId, clubId), eq(clubMembersTable.userId, partialAdmin)));
    cycleId = await createCycle();
  });

  it("does not lock an empty cycle or count an invalid assessment as complete", async () => {
    await request(app).put(`/api/development-cycles/${cycleId}/players/${playerA}/assessment`)
      .set(as("selected")).send({ ...assessment("invalid"), strength: "" }).expect(400);
    await request(app).post(`/api/development-cycles/${cycleId}/submit`).set(as("selected")).expect(409);
    const detail = await request(app).get(`/api/development-cycles/${cycleId}`).set(as("selected")).expect(200);
    expect(detail.body).toMatchObject({ status: "active", completedPlayers: 0, totalPlayers: 2, totalReports: 0 });
  });

  it("keeps submission restricted to selected assessors and administrators", async () => {
    await request(app).post(`/api/development-cycles/${cycleId}/submit`).set(as("unselected")).expect(403);
    await request(app).post(`/api/development-cycles/${cycleId}/submit`).set(as("guardian")).expect(403);
  });

  it("locks one saved assessment without requiring the other player's assessment", async () => {
    await request(app).put(`/api/development-cycles/${cycleId}/players/${playerA}/assessment`)
      .set(as("selected")).send(assessment("PARTIAL PRIVATE NOTE")).expect(200);
    const submitted = await request(app).post(`/api/development-cycles/${cycleId}/submit`)
      .set(as("selected")).expect(200);
    expect(submitted.body).toMatchObject({
      status: "submitted", completedPlayers: 1, totalPlayers: 2, totalReports: 1, reviewedReports: 0,
      capabilities: { canEdit: false, canSubmit: false, canReviewReports: true },
    });
    expect(submitted.body.players.find((p: { person: { id: number } }) => p.person.id === playerA).reportDraft).not.toBeNull();
    expect(submitted.body.players.find((p: { person: { id: number } }) => p.person.id === playerB))
      .toMatchObject({ complete: false, assessment: null, reportDraft: null });
    expect(await db.select().from(developmentReportsTable).where(eq(developmentReportsTable.cycleId, cycleId))).toHaveLength(0);
    await request(app).put(`/api/development-cycles/${cycleId}/players/${playerB}/assessment`)
      .set(as("selected")).send(assessment("too late")).expect(409);
    await request(app).post(`/api/development-cycles/${cycleId}/submit`).set(as("selected")).expect(409);
  });

  it("still requires review of the included report and cannot fabricate a skipped player's draft", async () => {
    await request(app).post(`/api/development-cycles/${cycleId}/release`).set(as("selected")).expect(409);
    await request(app).put(`/api/development-cycles/${cycleId}/players/${playerB}/report-draft`)
      .set(as("selected")).send(draft("must not create a report")).expect(404);
    const list = await request(app).get(`/api/players/${playerA}/development-reports`).set(as("guardian")).expect(200);
    expect(list.body.some((r: { cycleId: number }) => r.cycleId === cycleId)).toBe(false);
  });

  it("releases only the reviewed report exactly once, including concurrent requests", async () => {
    await request(app).put(`/api/development-cycles/${cycleId}/players/${playerA}/report-draft`)
      .set(as("selected")).send(draft("partial reviewed")).expect(200);
    const responses = await Promise.all([
      request(app).post(`/api/development-cycles/${cycleId}/release`).set(as("selected")),
      request(app).post(`/api/development-cycles/${cycleId}/release`).set(as("selected")),
    ]);
    expect(responses.every(r => r.status === 200 && r.body.reportCount === 1)).toBe(true);
    const rows = await db.select().from(developmentReportsTable).where(eq(developmentReportsTable.cycleId, cycleId));
    expect(rows).toHaveLength(1);
    expect(rows[0].playerId).toBe(playerA);
    reportId = rows[0].id;
    await request(app).post(`/api/development-cycles/${cycleId}/release`).set(as("selected")).expect(200, {
      released: true, reportCount: 1, emailFailures: 0,
    });
    const notifications = await db.select().from(notificationsTable)
      .where(eq(notificationsTable.deepLink, `/development/reports/${reportId}`));
    expect(notifications).toHaveLength(1);
    const recipients = await db.select().from(notificationRecipientsTable)
      .where(eq(notificationRecipientsTable.notificationId, notifications[0].id));
    expect(recipients.map(r => r.userId).sort()).toEqual([playerA, guardian].sort());
  });

  it("keeps the skipped player out of delivery while preserving private saved notes", async () => {
    const skipped = await request(app).get(`/api/players/${playerB}/development-reports`).set(as("playerB")).expect(200);
    expect(skipped.body.some((r: { cycleId: number }) => r.cycleId === cycleId)).toBe(false);
    await request(app).get(`/api/development-reports/${reportId}`).set(as("playerB")).expect(403);
    await request(app).get(`/api/development-reports/${reportId}`).set(as("nonmanager")).expect(403);
    const family = await request(app).get(`/api/development-reports/${reportId}`).set(as("guardian")).expect(200);
    expect(JSON.stringify(family.body)).not.toContain("PARTIAL PRIVATE NOTE");
    expect(family.body.strength).toBe("Family strength partial reviewed");
    const detail = await request(app).get(`/api/development-cycles/${cycleId}`).set(as("selected")).expect(200);
    expect(detail.body).toMatchObject({ status: "released", completedPlayers: 1, totalPlayers: 2, totalReports: 1, reviewedReports: 1 });
    expect(detail.body.players.find((p: { person: { id: number } }) => p.person.id === playerA).assessment.internalNotes)
      .toBe("PARTIAL PRIVATE NOTE");
    expect(detail.body.players.find((p: { person: { id: number } }) => p.person.id === playerB).assessment).toBeNull();
  });

  it("serializes a racing save and partial submission without silently discarding a saved assessment", async () => {
    const concurrentCycle = await createCycle();
    await request(app).put(`/api/development-cycles/${concurrentCycle}/players/${playerA}/assessment`)
      .set(as("selected")).send(assessment("saved first")).expect(200);
    const [save, submit] = await Promise.all([
      request(app).put(`/api/development-cycles/${concurrentCycle}/players/${playerB}/assessment`)
        .set(as("selected")).send(assessment("concurrent save")),
      request(app).post(`/api/development-cycles/${concurrentCycle}/submit`).set(as("selected")),
    ]);
    expect([200, 409]).toContain(save.status);
    expect(submit.status).toBe(200);
    const detail = await request(app).get(`/api/development-cycles/${concurrentCycle}`).set(as("selected")).expect(200);
    expect(detail.body).toMatchObject({ status: "submitted", totalReports: save.status === 200 ? 2 : 1 });
    expect(detail.body.players.find((p: { person: { id: number } }) => p.person.id === playerB).complete).toBe(save.status === 200);
    expect(detail.body.players.filter((p: { reportDraft: unknown }) => p.reportDraft !== null))
      .toHaveLength(save.status === 200 ? 2 : 1);
  });

  it("keeps release restricted to the creator or a club admin, even with another selected assessor", async () => {
    const delegatedCycle = await createCycle([selected, unselected]);
    await request(app).put(`/api/development-cycles/${delegatedCycle}/players/${playerA}/assessment`)
      .set(as("unselected")).send(assessment("delegated")).expect(200);
    await request(app).post(`/api/development-cycles/${delegatedCycle}/submit`).set(as("unselected")).expect(200);
    await request(app).put(`/api/development-cycles/${delegatedCycle}/players/${playerA}/report-draft`)
      .set(as("unselected")).send(draft("delegated reviewed")).expect(200);
    await request(app).post(`/api/development-cycles/${delegatedCycle}/release`).set(as("unselected")).expect(403);
    await request(app).post(`/api/development-cycles/${delegatedCycle}/release`).set(as("partialAdmin")).expect(200);
  });
});