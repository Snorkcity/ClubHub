import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  getAuth: (req: { headers: Record<string, unknown> }) => ({
    userId: (req.headers["x-test-user"] as string | undefined) ?? null,
  }),
  clerkClient: {
    users: {
      getUser: async (clerkUserId: string) => ({
        firstName: "",
        lastName: "",
        primaryEmailAddressId: "primary",
        emailAddresses: [
          {
            id: "primary",
            emailAddress: `${clerkUserId}@example.test`,
            verification: { status: "verified" },
          },
        ],
      }),
    },
  },
}));

import { eq, inArray } from "drizzle-orm";
import {
  chatMembersTable,
  chatsTable,
  clubMembersTable,
  clubsTable,
  db,
  pool,
  teamMembersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";
import app from "../src/app";

const PREFIX = "test_onboarding_";
const NEW_CLERK_ID = `${PREFIX}new`;
const EXISTING_CLERK_ID = `${PREFIX}existing`;
const CLAIM_CLERK_ID = `${PREFIX}claim`;
const as = (clerkId: string) => ({ "x-test-user": clerkId });

let existingClubId = 0;
let existingUserId = 0;
const createdClubIds: number[] = [];

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("clubhub_test")) {
    throw new Error("Refusing to run onboarding tests outside the disposable test database");
  }
  const [club] = await db
    .insert(clubsTable)
    .values({ name: `${PREFIX}existing club`, countryCode: "AU" })
    .returning();
  existingClubId = club.id;
  const [user] = await db
    .insert(usersTable)
    .values({
      clubId: club.id,
      clerkUserId: EXISTING_CLERK_ID,
      firstName: "Existing",
      lastName: "Admin",
    })
    .returning();
  existingUserId = user.id;
  await db.insert(clubMembersTable).values({
    clubId: club.id,
    userId: user.id,
    role: "admin",
  });
});

afterAll(async () => {
  const clubIds = [...createdClubIds, existingClubId].filter(Boolean);
  if (clubIds.length) {
    const users = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(inArray(usersTable.clubId, clubIds));
    const userIds = users.map((user) => user.id);
    const teams = await db
      .select({ id: teamsTable.id })
      .from(teamsTable)
      .where(inArray(teamsTable.clubId, clubIds));
    const teamIds = teams.map((team) => team.id);
    const chats = await db
      .select({ id: chatsTable.id })
      .from(chatsTable)
      .where(inArray(chatsTable.clubId, clubIds));
    const chatIds = chats.map((chat) => chat.id);
    if (chatIds.length)
      await db.delete(chatMembersTable).where(inArray(chatMembersTable.chatId, chatIds));
    if (chatIds.length)
      await db.delete(chatsTable).where(inArray(chatsTable.id, chatIds));
    if (teamIds.length)
      await db.delete(teamMembersTable).where(inArray(teamMembersTable.teamId, teamIds));
    if (teamIds.length)
      await db.delete(teamsTable).where(inArray(teamsTable.id, teamIds));
    if (userIds.length)
      await db.delete(clubMembersTable).where(inArray(clubMembersTable.userId, userIds));
    if (userIds.length)
      await db.delete(usersTable).where(inArray(usersTable.id, userIds));
    await db.delete(clubsTable).where(inArray(clubsTable.id, clubIds));
  }
  await pool.end();
});

describe("first-time club onboarding", () => {
  it("recognises existing accounts", async () => {
    const response = await request(app)
      .get("/api/onboarding/status")
      .set(as(EXISTING_CLERK_ID))
      .expect(200);
    expect(response.body).toEqual({ needsOnboarding: false });
  });

  it("does not silently attach an unknown account to an existing club", async () => {
    const status = await request(app)
      .get("/api/onboarding/status")
      .set(as(NEW_CLERK_ID))
      .expect(200);
    expect(status.body).toEqual({ needsOnboarding: true });
    await request(app).get("/api/me").set(as(NEW_CLERK_ID)).expect(409);
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, NEW_CLERK_ID));
    expect(rows).toHaveLength(0);
  });

  it("claims exactly one verified-email person and reconciles club membership", async () => {
    const [person] = await db
      .insert(usersTable)
      .values({
        clubId: existingClubId,
        firstName: "Invited",
        lastName: "Person",
        email: `${CLAIM_CLERK_ID}@example.test`,
      })
      .returning();

    const status = await request(app)
      .get("/api/onboarding/status")
      .set(as(CLAIM_CLERK_ID))
      .expect(200);
    expect(status.body).toEqual({ needsOnboarding: false });
    await request(app).get("/api/me").set(as(CLAIM_CLERK_ID)).expect(200);
    const [membership] = await db
      .select()
      .from(clubMembersTable)
      .where(eq(clubMembersTable.userId, person.id));
    expect(membership).toMatchObject({
      clubId: existingClubId,
      role: "member",
    });
  });

  it("creates a separate club, first team, admin and team manager atomically", async () => {
    const response = await request(app)
      .post("/api/onboarding")
      .set(as(NEW_CLERK_ID))
      .send({
        firstName: "Taylor",
        lastName: "Jordan",
        clubName: `${PREFIX}new club`,
        countryCode: "AU",
        teamName: `${PREFIX}U14`,
        ageGroup: "U14",
        gender: "Mixed",
      })
      .expect(201);
    createdClubIds.push(response.body.clubId);

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, NEW_CLERK_ID));
    expect(user.clubId).toBe(response.body.clubId);
    const [clubRole] = await db
      .select()
      .from(clubMembersTable)
      .where(eq(clubMembersTable.userId, user.id));
    expect(clubRole.role).toBe("admin");
    const [teamRole] = await db
      .select()
      .from(teamMembersTable)
      .where(eq(teamMembersTable.userId, user.id));
    expect(teamRole).toMatchObject({
      teamId: response.body.teamId,
      role: "manager",
    });
    const [chatMembership] = await db
      .select()
      .from(chatMembersTable)
      .where(eq(chatMembersTable.userId, user.id));
    expect(chatMembership).toBeTruthy();
  });

  it("cannot run setup twice for the same identity", async () => {
    await request(app)
      .post("/api/onboarding")
      .set(as(NEW_CLERK_ID))
      .send({
        firstName: "Taylor",
        lastName: "Jordan",
        clubName: "Duplicate",
        countryCode: "AU",
        teamName: "Duplicate",
        ageGroup: "Open",
      })
      .expect(409);
  });

  it("returns one success and one conflict for simultaneous setup requests", async () => {
    const clerkId = `${PREFIX}race`;
    const body = {
      firstName: "Race",
      lastName: "Tester",
      clubName: `${PREFIX}race club`,
      countryCode: "AU",
      teamName: `${PREFIX}race team`,
      ageGroup: "Open",
    };
    const responses = await Promise.all([
      request(app).post("/api/onboarding").set(as(clerkId)).send(body),
      request(app).post("/api/onboarding").set(as(clerkId)).send(body),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const successful = responses.find((response) => response.status === 201)!;
    createdClubIds.push(successful.body.clubId);
    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkId));
    expect(users).toHaveLength(1);
  });
});