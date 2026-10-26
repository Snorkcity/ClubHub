import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Request } from "express";

const profiles = vi.hoisted(() => new Map<string, { email: string; verified: boolean }>());
vi.mock("@clerk/express", () => ({
  getAuth: () => ({}),
  clerkClient: { users: { getUser: async (id: string) => {
    const profile = profiles.get(id);
    if (!profile) throw new Error("No trusted Clerk profile");
    return {
      firstName: "Migration", lastName: "Tester", primaryEmailAddressId: "primary",
      emailAddresses: [{
        id: "primary", emailAddress: profile.email,
        verification: { status: profile.verified ? "verified" : "unverified" },
      }],
    };
  } } },
}));
import {
  db, pool, clubsTable, usersTable, clubMembersTable, teamsTable, teamMembersTable,
} from "@workspace/db";
import { findOrClaimUser } from "../src/lib/auth";
import { mayTransferLegacyClerkAccount } from "../src/lib/clerk-account-migration";

const req = { log: { warn: vi.fn(), info: vi.fn() } } as unknown as Request;
const productionKey = `pk_live_${Buffer.from("clerk.nahreo.com$").toString("base64")}`;
beforeAll(() => {
  if (!process.env.DATABASE_URL?.includes("clubhub_test"))
    throw new Error("Disposable test database required");
});
afterEach(() => { vi.unstubAllEnvs(); profiles.clear(); });
afterAll(() => pool.end());

async function fixture() {
  const suffix = randomBytes(8).toString("hex");
  const oldId = `user_legacy${suffix}`;
  const newId = `user_production${suffix}`;
  const email = `migration_${suffix}@example.test`;
  const [club] = await db.insert(clubsTable).values({ name: "Migration club" }).returning();
  const [person] = await db.insert(usersTable).values({
    clubId: club.id, clerkUserId: oldId, email, firstName: "Migration", lastName: "Tester",
  }).returning();
  const [team] = await db.insert(teamsTable).values({
    clubId: club.id, name: "Existing team", ageGroup: "Open",
  }).returning();
  await db.insert(clubMembersTable).values({ clubId: club.id, userId: person.id, role: "admin" });
  await db.insert(teamMembersTable).values({ teamId: team.id, userId: person.id, role: "coach" });
  profiles.set(newId, { email, verified: true });
  vi.stubEnv("CLERK_PUBLISHABLE_KEY", productionKey);
  vi.stubEnv("CLERK_LEGACY_USER_IDS", oldId);
  vi.stubEnv("CLERK_ACCOUNT_MIGRATION_UNTIL", new Date(Date.now() + 86400000).toISOString());
  return { oldId, newId, email, club, person, team };
}
const readPerson = async (id: number) =>
  (await db.select().from(usersTable).where(eq(usersTable.id, id)))[0];

describe("explicit production Clerk account transfer", () => {
  it("preserves the permanent person, club admin role and team coach role", async () => {
    const f = await fixture();
    profiles.set(f.newId, { email: f.email.toUpperCase(), verified: true });
    const { user } = await findOrClaimUser(req, f.newId);
    expect(user).toEqual({ ...f.person, clerkUserId: f.newId });
    expect(await readPerson(f.person.id)).toEqual(user);
    expect((await db.select().from(clubMembersTable)
      .where(eq(clubMembersTable.userId, f.person.id)))[0].role).toBe("admin");
    expect((await db.select().from(teamMembersTable)
      .where(eq(teamMembersTable.userId, f.person.id)))[0].role).toBe("coach");
  });

  it("does not restore a departed club membership", async () => {
    const f = await fixture();
    await db.delete(clubMembersTable).where(eq(clubMembersTable.userId, f.person.id));
    expect((await findOrClaimUser(req, f.newId)).user?.id).toBe(f.person.id);
    expect(await db.select().from(clubMembersTable)
      .where(eq(clubMembersTable.userId, f.person.id))).toHaveLength(0);
  });

  it.each(["unverified", "missing-profile", "wrong-email", "not-allowlisted", "disabled", "expired", "development", "wrong-tenant"])(
    "refuses a transfer when %s", async (scenario) => {
      const f = await fixture();
      if (scenario === "unverified") profiles.set(f.newId, { email: f.email, verified: false });
      if (scenario === "missing-profile") profiles.delete(f.newId);
      if (scenario === "wrong-email") profiles.set(f.newId, { email: "unrelated@example.test", verified: true });
      if (scenario === "not-allowlisted") vi.stubEnv("CLERK_LEGACY_USER_IDS", "user_someoneelse");
      if (scenario === "disabled") vi.stubEnv("CLERK_LEGACY_USER_IDS", "");
      if (scenario === "expired") vi.stubEnv("CLERK_ACCOUNT_MIGRATION_UNTIL", "2000-01-01T00:00:00.000Z");
      if (scenario === "development") vi.stubEnv("CLERK_PUBLISHABLE_KEY", productionKey.replace("pk_live_", "pk_test_"));
      if (scenario === "wrong-tenant") vi.stubEnv("CLERK_PUBLISHABLE_KEY",
        `pk_live_${Buffer.from("another.clerk.accounts.dev$").toString("base64")}`);
      expect((await findOrClaimUser(req, f.newId)).user).toBeUndefined();
      expect((await readPerson(f.person.id)).clerkUserId).toBe(f.oldId);
    },
  );

  it("fails closed on duplicate emails, including login-less placeholders", async () => {
    const f = await fixture();
    await db.insert(usersTable).values({
      clubId: f.club.id, email: f.email, firstName: "Duplicate", lastName: "Placeholder",
    });
    expect((await findOrClaimUser(req, f.newId)).user).toBeUndefined();
    expect((await readPerson(f.person.id)).clerkUserId).toBe(f.oldId);
  });

  it("is stable across concurrent requests and cannot be claimed a second time", async () => {
    const f = await fixture();
    const results = await Promise.all(Array.from({ length: 4 }, () => findOrClaimUser(req, f.newId)));
    expect(results.every((r) => r.user?.id === f.person.id)).toBe(true);
    const differentLogin = `${f.newId}second`;
    profiles.set(differentLogin, { email: f.email, verified: true });
    expect((await findOrClaimUser(req, differentLogin)).user).toBeUndefined();
    expect((await readPerson(f.person.id)).clerkUserId).toBe(f.newId);
  });

  it("rejects malformed migration configuration rather than allowing a broad match", () => {
    vi.stubEnv("CLERK_PUBLISHABLE_KEY", productionKey);
    vi.stubEnv("CLERK_LEGACY_USER_IDS", "*");
    vi.stubEnv("CLERK_ACCOUNT_MIGRATION_UNTIL", "tomorrow");
    expect(() => mayTransferLegacyClerkAccount("user_old")).toThrow("Invalid temporary");
  });
});
