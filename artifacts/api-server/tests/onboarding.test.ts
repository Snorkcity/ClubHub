import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomBytes, createHash } from "node:crypto";

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
            verification: { status: clerkUserId.includes("unverified") ? "unverified" : "verified" },
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
  clubSetupInvitationsTable,
  platformOwnersTable,
} from "@workspace/db";
import app from "../src/app";

const PREFIX = "test_onboarding_";
const NEW_CLERK_ID = `${PREFIX}new`;
const EXISTING_CLERK_ID = `${PREFIX}existing`;
const CLAIM_CLERK_ID = `${PREFIX}claim`;
const as = (clerkId: string) => ({ "x-test-user": clerkId });
const OWNER = `${PREFIX}owner`;
const ownerEmail = `${OWNER}@example.test`;
async function invite(clerkId: string, expiresAt = new Date(Date.now() + 86400000)) {
  const token = randomBytes(32).toString("hex");
  await db.insert(clubSetupInvitationsTable).values({
    email: `${clerkId}@example.test`, invitedBy: OWNER,
    tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt,
  });
  return token;
}
const setupBody = (name: string) => ({
  firstName: "Setup", lastName: "Tester", clubName: `${PREFIX}${name}`,
  countryCode: "AU", teamName: "Seniors", ageGroup: "Open",
});

let existingClubId = 0;
let existingUserId = 0;
const createdClubIds: number[] = [];

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("clubhub_test")) {
    throw new Error("Refusing to run onboarding tests outside the disposable test database");
  }
  await db.insert(platformOwnersTable).values({ email: ownerEmail });
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
  await db.delete(clubSetupInvitationsTable);
  await db.delete(platformOwnersTable).where(eq(platformOwnersTable.email, ownerEmail));
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
    expect(response.body).toMatchObject({ needsOnboarding: false, canCreateClub: false, isPlatformOwner: false });
  });

  it("does not silently attach an unknown account to an existing club", async () => {
    const status = await request(app)
      .get("/api/onboarding/status")
      .set(as(NEW_CLERK_ID))
      .expect(200);
    expect(status.body).toMatchObject({ needsOnboarding: true, canCreateClub: false });
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
    expect(status.body).toMatchObject({ needsOnboarding: false });
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
        invitation: await invite(NEW_CLERK_ID),
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

  it("stores an optional club logo in the same onboarding transaction", async () => {
    const logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
    const response = await request(app).post("/api/onboarding")
      .set(as(`${PREFIX}with_logo`))
      .send({
        invitation: await invite(`${PREFIX}with_logo`),
        firstName: "Club", lastName: "Admin", clubName: `${PREFIX}logo club`,
        countryCode: "AU", teamName: "First team", ageGroup: "U14", logoImageData: logo,
      }).expect(201);
    createdClubIds.push(response.body.clubId);
    const [club] = await db.select().from(clubsTable).where(eq(clubsTable.id, response.body.clubId));
    expect(club.logoUrl).toBe(logo);
  });

  it("rejects an invalid onboarding logo before creating any club or account", async () => {
    const identity = `${PREFIX}invalid_logo`;
    await request(app).post("/api/onboarding").set(as(identity)).send({
      firstName: "Club", lastName: "Admin", clubName: `${PREFIX}invalid logo`,
      countryCode: "AU", teamName: "First team", ageGroup: "U14", logoImageData: "invalid",
    }).expect(400);
    expect(await db.select().from(usersTable).where(eq(usersTable.clerkUserId, identity))).toHaveLength(0);
    expect(await db.select().from(clubsTable).where(eq(clubsTable.name, `${PREFIX}invalid logo`))).toHaveLength(0);
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
      .expect(403);
  });

  it("returns one success and one conflict for simultaneous setup requests", async () => {
    const clerkId = `${PREFIX}race`;
    const body = {
      invitation: await invite(clerkId),
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

  it("blocks direct setup without an invitation and does not create rows", async () => {
    const id = `${PREFIX}outsider`;
    await request(app).post("/api/onboarding").set(as(id)).send(setupBody("blocked")).expect(403);
    expect(await db.select().from(usersTable).where(eq(usersTable.clerkUserId, id))).toHaveLength(0);
  });

  it("only lets the verified Nahreo owner issue/list/revoke club invitations", async () => {
    await request(app).post("/api/platform/club-invitations").send({ email: "new@example.test" }).expect(401);
    await request(app).get("/api/platform/club-invitations").set(as(EXISTING_CLERK_ID)).expect(403);
    await request(app).post("/api/platform/club-invitations").set(as(EXISTING_CLERK_ID)).send({ email: "new@example.test" }).expect(403);
    await request(app).post("/api/platform/club-invitations").set(as(OWNER)).send({ email: "not-an-email" }).expect(400);
    const created = await request(app).post("/api/platform/club-invitations").set(as(OWNER))
      .send({ email: "NEW@example.test" }).expect(201);
    expect(created.body.invitation).toMatchObject({ email: "new@example.test", status: "pending" });
    expect(created.body.setupUrl).toContain("/get-started?invitation=");
    const list = await request(app).get("/api/platform/club-invitations").set(as(OWNER)).expect(200);
    expect(JSON.stringify(list.body)).not.toContain("tokenHash");
    expect(JSON.stringify(list.body)).not.toContain("setupUrl");
    await request(app).delete(`/api/platform/club-invitations/${created.body.invitation.id}`).set(as(EXISTING_CLERK_ID)).expect(403);
    await request(app).delete(`/api/platform/club-invitations/${created.body.invitation.id}`).set(as(OWNER)).expect(204);
  });

  it("rejects wrong recipient, unverified identity, expired and revoked invitations", async () => {
    const token = await invite(`${PREFIX}recipient`);
    await request(app).post("/api/onboarding").set(as(`${PREFIX}wrong`))
      .send({ ...setupBody("wrong"), invitation: token }).expect(403);
    const expired = await invite(`${PREFIX}expired`, new Date(Date.now() - 1000));
    await request(app).post("/api/onboarding").set(as(`${PREFIX}expired`))
      .send({ ...setupBody("expired"), invitation: expired }).expect(403);
    const unverified = `${PREFIX}unverified`;
    await db.insert(platformOwnersTable).values({ email: `${unverified}@example.test` });
    const unverifiedToken = await invite(unverified);
    await request(app).post("/api/platform/club-invitations").set(as(unverified)).send({ email: "x@example.test" }).expect(403);
    await request(app).post("/api/onboarding").set(as(unverified))
      .send({ ...setupBody("unverified"), invitation: unverifiedToken }).expect(403);
    await db.delete(platformOwnersTable).where(eq(platformOwnersTable.email, `${unverified}@example.test`));
    const revoked = await invite(`${PREFIX}revoked`);
    await db.update(clubSetupInvitationsTable).set({ revokedAt: new Date() })
      .where(eq(clubSetupInvitationsTable.tokenHash, createHash("sha256").update(revoked).digest("hex")));
    await request(app).post("/api/onboarding").set(as(`${PREFIX}revoked`))
      .send({ ...setupBody("revoked"), invitation: revoked }).expect(403);
  });

  it("reuses one permanent account and scopes each club without moving the demo", async () => {
    const token = await invite(EXISTING_CLERK_ID);
    const response = await request(app).post("/api/onboarding").set(as(EXISTING_CLERK_ID))
      .send({ ...setupBody("second club"), invitation: token }).expect(201);
    const newClubId = response.body.clubId;
    createdClubIds.push(newClubId);
    const people = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, EXISTING_CLERK_ID));
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ id: existingUserId, clubId: existingClubId });
    const access = await request(app).get("/api/platform/access").set(as(EXISTING_CLERK_ID)).expect(200);
    expect(access.body.clubs.map((c: { id: number }) => c.id).sort()).toEqual([existingClubId, newClubId].sort());
    const selected = { ...as(EXISTING_CLERK_ID), "X-Nahreo-Club": String(newClubId) };
    const club = await request(app).get("/api/club").set(selected).expect(200);
    expect(club.body.id).toBe(newClubId);
    const me = await request(app).get("/api/me").set(selected).expect(200);
    expect(me.body.memberships).toHaveLength(1);
    expect(me.body.memberships[0].teamId).toBe(response.body.teamId);
    await request(app).get(`/api/people/${existingUserId}`).set(selected).expect(200);
    const overview = await request(app).get("/api/club/overview").set(selected).expect(200);
    expect(overview.body.club.id).toBe(newClubId);
    await request(app).get("/api/club").set(as(EXISTING_CLERK_ID)).expect(200).expect((r) => expect(r.body.id).toBe(existingClubId));
    await request(app).get("/api/club").set({ ...selected, "X-Nahreo-Club": "2147483646" }).expect(403);
    await request(app).get("/api/club").set({ ...selected, "X-Nahreo-Club": "bad" }).expect(400);
    await request(app).get(`/api/teams/${response.body.teamId}`).set(as(NEW_CLERK_ID)).expect(403);
    await request(app).post("/api/onboarding").set(as(EXISTING_CLERK_ID))
      .send({ ...setupBody("replay"), invitation: token }).expect(403);
    const [used] = await db.select().from(clubSetupInvitationsTable)
      .where(eq(clubSetupInvitationsTable.tokenHash, createHash("sha256").update(token).digest("hex")));
    expect(used.clubId).toBe(newClubId);
    await request(app).delete(`/api/platform/club-invitations/${used.id}`).set(as(OWNER)).expect(409);
  });

  it("lets the configured owner set up a club but revoked owner access fails closed", async () => {
    const response = await request(app).post("/api/onboarding").set(as(OWNER)).send(setupBody("owner club")).expect(201);
    createdClubIds.push(response.body.clubId);
    await db.update(platformOwnersTable).set({ revokedAt: new Date() }).where(eq(platformOwnersTable.email, ownerEmail));
    await request(app).post("/api/onboarding").set(as(OWNER)).send(setupBody("revoked owner")).expect(403);
  });
});