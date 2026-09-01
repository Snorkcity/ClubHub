/**
 * Tests for the club-admin storage health check (/club/storage):
 *  - club admins get size stats, thresholds, and an "ok" status on a small DB
 *  - non-admin members get 403
 *
 * Runs against the throwaway local PostgreSQL cluster provisioned by
 * scripts/run-tests.sh; Clerk is mocked via the `x-test-user` header.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  getAuth: (req: { headers: Record<string, unknown> }) => ({
    userId: (req.headers["x-test-user"] as string | undefined) ?? null,
  }),
  clerkClient: {
    users: {
      getUser: async () => {
        throw new Error("Clerk backend must not be called in tests");
      },
    },
  },
}));

import {
  db,
  clubsTable,
  clubMembersTable,
  usersTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import app from "../src/app";

process.env.SESSION_SECRET ??= "test-session-secret";

const PREFIX = "test_storage_";
const as = (clerkId: string) => ({ "x-test-user": PREFIX + clerkId });

let clubId: number;
let createdClub = false;
const userIds: number[] = [];

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("clubhub_test")) {
    throw new Error(
      "Refusing to run: DATABASE_URL is not the disposable test database. " +
        "Run tests via `pnpm --filter @workspace/api-server run test`.",
    );
  }
  let club = (await db.select().from(clubsTable).limit(1))[0];
  if (!club) {
    club = (
      await db.insert(clubsTable).values({ name: "Test Club" }).returning()
    )[0];
    createdClub = true;
  }
  clubId = club.id;

  async function mkUser(clerkId: string, role: "admin" | "member") {
    const [u] = await db
      .insert(usersTable)
      .values({
        clubId,
        clerkUserId: PREFIX + clerkId,
        firstName: clerkId,
        lastName: "Test",
      })
      .returning();
    userIds.push(u.id);
    await db.insert(clubMembersTable).values({ clubId, userId: u.id, role });
    return u.id;
  }
  await mkUser("admin", "admin");
  await mkUser("member", "member");
});

afterAll(async () => {
  if (userIds.length) {
    await db
      .delete(clubMembersTable)
      .where(inArray(clubMembersTable.userId, userIds));
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
  if (createdClub) await db.delete(clubsTable).where(eq(clubsTable.id, clubId));
});

describe("GET /club/storage", () => {
  it("returns sizes, thresholds and ok status for club admins", async () => {
    const res = await request(app).get("/api/club/storage").set(as("admin"));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.postPhotos.bytes).toBeGreaterThan(0);
    expect(res.body.postPhotos.count).toBeGreaterThanOrEqual(0);
    expect(res.body.bannersBytes).toBeGreaterThanOrEqual(0);
    expect(res.body.databaseBytes).toBeGreaterThan(0);
    expect(res.body.thresholds.warnBytes).toBe(1024 ** 3);
    expect(res.body.thresholds.criticalBytes).toBe(5 * 1024 ** 3);
    expect(typeof res.body.plan).toBe("string");
  });

  it("rejects non-admin members", async () => {
    const res = await request(app).get("/api/club/storage").set(as("member"));
    expect(res.status).toBe(403);
  });
});
