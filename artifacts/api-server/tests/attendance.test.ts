import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, unknown> }) => ({ userId: req.headers["x-test-user"] ?? null }),
  clerkClient: { users: { getUser: async () => { throw new Error("No live Clerk calls"); } } },
}));
import {
  db, pool, clubsTable, clubMembersTable, usersTable, teamsTable, teamMembersTable,
  eventsTable, rsvpsTable, guardianshipsTable,
} from "@workspace/db";
import app from "../src/app";

const prefix = "attendance_test_";
const ids: Record<string, number> = {};
let clubId: number;
let teamId: number;
let otherTeamId: number;
let foreignTeamId: number;
const sessions: number[] = [];
const as = (name: string) => ({ "x-test-user": prefix + name });
const params = { from: "2025-01-01", to: "2025-01-31", timeZone: "Australia/Sydney", type: "all" };
const report = (actor = "coach", query: Record<string, string> = params, team = teamId) =>
  request(app).get(`/api/teams/${team}/attendance`).set(as(actor)).query(query);

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("clubhub_test")) throw new Error("Disposable DB only");
  clubId = (await db.insert(clubsTable).values({ name: prefix }).returning())[0].id;
  const foreignClub = (await db.insert(clubsTable).values({ name: prefix + "foreign" }).returning())[0].id;
  for (const name of ["admin", "coach", "manager", "player", "second", "parent", "announcer", "foreign"]) {
    const home = name === "foreign" ? foreignClub : clubId;
    ids[name] = (await db.insert(usersTable).values({
      clubId: home, firstName: name, lastName: "Sample", clerkUserId: prefix + name,
    }).returning())[0].id;
    await db.insert(clubMembersTable).values({
      clubId: home, userId: ids[name], role: name === "admin" ? "admin" : name === "announcer" ? "announcer" : "member",
    });
  }
  teamId = (await db.insert(teamsTable).values({ clubId, name: "U13 Test", ageGroup: "U13" }).returning())[0].id;
  otherTeamId = (await db.insert(teamsTable).values({ clubId, name: "Second Test", ageGroup: "U14" }).returning())[0].id;
  foreignTeamId = (await db.insert(teamsTable).values({ clubId: foreignClub, name: "Other club", ageGroup: "U14" }).returning())[0].id;
  for (const name of ["coach", "manager", "player", "second"]) {
    await db.insert(teamMembersTable).values({
      teamId, userId: ids[name], role: name === "second" ? "player" : name,
    });
  }
  // Coaching one team never grants reporting on a second managed-only team.
  await db.insert(teamMembersTable).values({ teamId: otherTeamId, userId: ids.coach, role: "manager" });
  await db.insert(guardianshipsTable).values({ guardianId: ids.parent, playerId: ids.player });
  for (let i = 0; i < 4; i++) {
    sessions.push((await db.insert(eventsTable).values({
      teamId, createdById: ids.coach, title: "Training " + i,
      type: i === 3 ? "game" : "training", startsAt: new Date(`2025-01-0${i + 2}T08:00:00Z`),
      endsAt: new Date(`2025-01-0${i + 2}T09:00:00Z`),
    }).returning())[0].id);
  }
  for (const [i, status] of ["going", "going", "out", "maybe"].entries()) {
    await db.insert(rsvpsTable).values({ eventId: sessions[i], userId: ids.player, status });
  }
  // These must never inflate the reporting denominator.
  for (const extra of [
    { type: "social", startsAt: new Date("2025-01-10T08:00:00Z") },
    { type: "training", startsAt: new Date("2025-01-10T08:00:00Z"), cancelledAt: new Date() },
    { type: "training", startsAt: new Date("2025-01-10T08:00:00Z"), invitedRoles: "coaches" },
    { type: "training", startsAt: new Date("2025-02-10T08:00:00Z") },
    { type: "training", startsAt: new Date(Date.now() + 86400000) },
    // Sydney date Jan 1 but UTC date Dec 31.
    { type: "training", startsAt: new Date("2024-12-31T14:00:00Z"), invitedRoles: "coaches" },
  ]) {
    await db.insert(eventsTable).values({ teamId, createdById: ids.coach, title: "Excluded", ...extra });
  }
  await db.insert(eventsTable).values({
    teamId: foreignTeamId, createdById: ids.foreign, type: "training", title: "Private foreign session",
    startsAt: new Date("2025-01-01T08:00:00Z"),
  });
});
afterAll(async () => { await pool.end(); });

describe("RSVP attendance reporting", () => {
  it("shows staff only the invited current members still awaiting a response", async () => {
    const detail = await request(app).get(`/api/events/${sessions[0]}`).set(as("coach"));
    expect(detail.status).toBe(200);
    expect(detail.body.awaitingResponses.map((p: any) => p.personId).sort((a: number, b: number) => a - b))
      .toEqual([ids.coach, ids.manager, ids.second].sort((a, b) => a - b));
    expect(detail.body.awaitingResponses.find((p: any) => p.personId === ids.manager).role).toBe("manager");
    expect(detail.body.awaitingResponses.every((p: any) => !("email" in p) && !("phone" in p))).toBe(true);
    for (const actor of ["player", "parent"]) {
      const view = await request(app).get(`/api/events/${sessions[0]}`).set(as(actor));
      expect(view.body.awaitingResponses).toEqual([]);
    }
    const coachesOnly = await db.select().from(eventsTable);
    const event = coachesOnly.find((e) => e.teamId === teamId && e.invitedRoles === "coaches")!;
    const staffView = await request(app).get(`/api/events/${event.id}`).set(as("coach"));
    expect(staffView.body.awaitingResponses.map((p: any) => p.personId).sort((a: number, b: number) => a - b))
      .toEqual([ids.coach, ids.manager].sort((a, b) => a - b));
    expect((await request(app).get(`/api/events/${sessions[0]}`).set(as("foreign"))).status).toBe(403);
    await request(app).put(`/api/events/${sessions[0]}/rsvp`).set(as("coach")).send({ status: "going" });
    const updated = await request(app).get(`/api/events/${sessions[0]}`).set(as("coach"));
    expect(updated.body.awaitingResponses.some((p: any) => p.personId === ids.coach)).toBe(false);
    expect(updated.body.rsvps.some((r: any) => r.person.id === ids.coach)).toBe(true);
  });
  it("allows only this team's coaches or its club admin, not manager/parent/player/announcer", async () => {
    expect((await report("coach")).status).toBe(200);
    expect((await report("admin")).status).toBe(200);
    for (const actor of ["manager", "parent", "player", "announcer", "foreign"]) {
      expect((await report(actor)).status).toBe(403);
    }
    expect((await report("coach", params, otherTeamId)).status).toBe(403);
    expect((await report("admin", params, foreignTeamId)).status).toBe(403);
    expect((await request(app).get(`/api/teams/${teamId}/attendance`).query(params)).status).toBe(401);
  });
  it("counts eligible completed sessions only, with separate non-responses and no contact details", async () => {
    const r = await report();
    expect(r.body.totalSessions).toBe(4);
    expect(r.body.players).toHaveLength(2);
    expect(r.body.players.find((p: any) => p.personId === ids.player)).toMatchObject({
      going: 2, out: 1, maybe: 1, noResponse: 0, totalSessions: 4, goingPercent: 50,
    });
    expect(r.body.players.find((p: any) => p.personId === ids.second)).toMatchObject({
      going: 0, out: 0, maybe: 0, noResponse: 4, goingPercent: 0,
    });
    expect(JSON.stringify(r.body)).not.toMatch(/email|phone|reason/);
    expect(r.body.notice).toContain("not independently confirmed attendance");
    expect(r.body.notice).toContain("historical joining dates are not recorded");
  });
  it("filters training/games and handles zero denominator without a misleading percentage", async () => {
    expect((await report("coach", { ...params, type: "training" })).body.totalSessions).toBe(3);
    expect((await report("coach", { ...params, type: "game" })).body.totalSessions).toBe(1);
    const r = await report("coach", { ...params, from: "2025-03-01", to: "2025-03-02" });
    expect(r.body.totalSessions).toBe(0);
    expect(r.body.players.every((p: any) => p.goingPercent === null && p.noResponse === 0)).toBe(true);
  });
  it("rejects bad dates, timezones, reversed and excessive ranges and malformed team ids", async () => {
    for (const query of [
      { ...params, from: "2025-02-30" }, { ...params, to: "2024-01-01" },
      { ...params, timeZone: "Unknown/Zone" }, { ...params, to: "2030-01-01" },
      { ...params, type: "social" },
    ]) expect((await report("coach", query)).status).toBe(400);
    expect((await request(app).get("/api/teams/1.2/attendance").set(as("admin")).query(params)).status).toBe(400);
  });
  it("respects the requested local calendar date at UTC midnight boundaries", async () => {
    const r = await report("coach", { ...params, from: "2025-01-02", to: "2025-01-02" });
    expect(r.body.totalSessions).toBe(1);
    const utc = await report("coach", { ...params, from: "2025-01-02", to: "2025-01-02", timeZone: "UTC" });
    expect(utc.body.totalSessions).toBe(1);
    // Jan 2 08:00 UTC is Jan 1 in Honolulu.
    const hawaii = await report("coach", { ...params, from: "2025-01-01", to: "2025-01-01", timeZone: "Pacific/Honolulu" });
    expect(hawaii.body.totalSessions).toBe(1);
  });
  it("lets staff correct a past Going, persists it and refreshes the report's totals", async () => {
    const r = await request(app).put(`/api/events/${sessions[0]}/rsvp`).set(as("coach"))
      .send({ status: "out", onBehalfOfPersonId: ids.player, reason: "Did not attend" });
    expect(r.status).toBe(200);
    const detail = await request(app).get(`/api/events/${sessions[0]}`).set(as("coach"));
    expect(detail.body.canManageRsvps).toBe(true);
    expect(detail.body.rsvpPlayers.find((p: any) => p.personId === ids.player).status).toBe("out");
    const playerView = await request(app).get(`/api/events/${sessions[0]}`).set(as("player"));
    expect(playerView.body.canManageRsvps).toBe(false);
    expect(playerView.body.rsvpPlayers).toEqual([]);
    const summary = await report();
    expect(summary.body.players.find((p: any) => p.personId === ids.player)).toMatchObject({
      going: 1, out: 2, goingPercent: 25,
    });
  });
});

describe("past schedule", () => {
  it("is newest-first, includes previous sessions and preserves member/guardian access and club silos", async () => {
    for (const actor of ["coach", "manager", "player", "parent"]) {
      const r = await request(app).get("/api/events/past").set(as(actor)).query({ teamId });
      expect(r.status).toBe(200);
      expect(r.body.events.length).toBeGreaterThan(0);
      expect(r.body.events.every((e: any) => e.teamId === teamId && Date.parse(e.startsAt) < Date.now())).toBe(true);
      const times = r.body.events.map((e: any) => Date.parse(e.startsAt));
      expect(times).toEqual([...times].sort((a, b) => b - a));
      expect(r.body.nextOffset).toBeNull();
    }
    expect((await request(app).get("/api/events/past").set(as("admin")).query({ teamId: foreignTeamId })).status).toBe(403);
    const all = await request(app).get("/api/events/past").set(as("player"));
    expect(all.body.events.some((e: any) => e.teamId === foreignTeamId)).toBe(false);
    for (const query of [{ offset: -1 }, { offset: 0.2 }, { teamId: "x" }, { teamId: 0 }]) {
      expect((await request(app).get("/api/events/past").set(as("coach")).query(query)).status).toBe(400);
    }
  });
  it("paginates without duplicates even when sessions share a timestamp", async () => {
    for (let i = 0; i < 55; i++) {
      await db.insert(eventsTable).values({
        teamId: otherTeamId, createdById: ids.admin, type: "training", title: "Past page " + i,
        startsAt: new Date("2025-01-10T08:00:00Z"),
      });
    }
    const first = await request(app).get("/api/events/past").set(as("admin")).query({ teamId: otherTeamId });
    const second = await request(app).get("/api/events/past").set(as("admin")).query({ teamId: otherTeamId, offset: first.body.nextOffset });
    expect(first.body.events).toHaveLength(50);
    expect(first.body.nextOffset).toBe(50);
    expect(second.body.events).toHaveLength(5);
    expect(second.body.nextOffset).toBeNull();
    expect(new Set([...first.body.events, ...second.body.events].map((e: any) => e.id)).size).toBe(55);
  });
});
