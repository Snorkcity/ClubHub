import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, unknown> }) => ({
    userId: (req.headers["x-test-user"] as string | undefined) ?? null,
  }),
  clerkClient: { users: { getUser: async () => { throw new Error("Unexpected Clerk call"); } } },
}));

import { eq, inArray } from "drizzle-orm";
import { db, clubsTable, usersTable, clubMembersTable } from "@workspace/db";
import app from "../src/app";
import { clubLogoPath, verifyClubLogoToken } from "../src/lib/club-logo";

process.env.SESSION_SECRET ??= "club-logo-test-secret";
const PREFIX = "test_club_logo_";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const as = (name: string) => ({ "x-test-user": PREFIX + name });
const clubIds: number[] = [];
const userIds: number[] = [];
let signedUrl = "";

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("clubhub_test")) throw new Error("Disposable test DB required");
  for (const index of [0, 1]) {
    const [club] = await db.insert(clubsTable).values({ name: `${PREFIX}${index}` }).returning();
    clubIds.push(club.id);
    for (const role of index ? ["admin"] as const : ["admin", "member"] as const) {
      const [user] = await db.insert(usersTable).values({
        clubId: club.id, firstName: "Logo", lastName: role,
        clerkUserId: PREFIX + role + index,
      }).returning();
      userIds.push(user.id);
      await db.insert(clubMembersTable).values({ clubId: club.id, userId: user.id, role });
    }
  }
});

afterAll(async () => {
  if (userIds.length) {
    await db.delete(clubMembersTable).where(inArray(clubMembersTable.userId, userIds));
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
  if (clubIds.length) await db.delete(clubsTable).where(inArray(clubsTable.id, clubIds));
});

describe("club logo lifecycle and access control", () => {
  it("requires authentication and club-admin permission for all changes", async () => {
    await request(app).put("/api/club/logo").send({ imageData: PNG }).expect(401);
    await request(app).put("/api/club/logo").set(as("member0")).send({ imageData: PNG }).expect(403);
    await request(app).delete("/api/club/logo").set(as("member0")).expect(403);
  });

  it("saves the logo and returns a signed image URL, not image data", async () => {
    const response = await request(app).put("/api/club/logo").set(as("admin0")).send({ imageData: PNG }).expect(200);
    signedUrl = response.body.logoUrl;
    expect(signedUrl).toMatch(new RegExp(`^/api/clubs/${clubIds[0]}/logo\\?`));
    expect(JSON.stringify(response.body)).not.toContain("base64");
    const persisted = await request(app).get("/api/club").set(as("member0")).expect(200);
    expect(persisted.body.logoUrl).toBe(signedUrl);
    const overview = await request(app).get("/api/club/overview").set(as("admin0")).expect(200);
    expect(overview.body.club.logoUrl).toBe(signedUrl);
  });

  it("serves only valid signed requests and rejects tampering", async () => {
    const image = await request(app).get(signedUrl).expect(200);
    expect(image.headers["content-type"]).toMatch(/image\/png/);
    expect(image.body).toEqual(Buffer.from(PNG.split(",")[1], "base64"));
    await request(app).get(`/api/clubs/${clubIds[0]}/logo`).expect(403);
    await request(app).get(signedUrl.replace(`/clubs/${clubIds[0]}/`, `/clubs/${clubIds[1]}/`)).expect(403);
    await request(app).get(signedUrl + "tampered").expect(403);
  });

  it("does not allow an admin of another club to change this club's logo", async () => {
    const other = await request(app).get("/api/club").set(as("admin1")).expect(200);
    expect(other.body.logoUrl).toBeNull();
    await request(app).delete("/api/club/logo").set(as("admin1")).send({ clubId: clubIds[0] }).expect(200);
    const own = await request(app).get("/api/club").set(as("admin0")).expect(200);
    expect(own.body.logoUrl).toBe(signedUrl);
  });

  it("rejects invalid, spoofed, SVG and oversized images", async () => {
    for (const imageData of [
      "not-an-image",
      "data:image/svg+xml;base64,PHN2Zz4=",
      PNG.replace("image/png", "image/jpeg"),
      `data:image/png;base64,${Buffer.concat([Buffer.from(PNG.split(",")[1], "base64"), Buffer.alloc(1024 * 1024)]).toString("base64")}`,
    ]) {
      await request(app).put("/api/club/logo").set(as("admin0")).send({ imageData }).expect(400);
    }
  });

  it("rejects expired signatures", () => {
    const path = clubLogoPath(clubIds[0], PNG)!;
    const params = new URL(path, "https://example.test").searchParams;
    const clock = vi.spyOn(Date, "now").mockReturnValue(Number(params.get("e")) + 1);
    try {
      expect(verifyClubLogoToken(clubIds[0], params.get("v"), params.get("e"), params.get("s"))).toBe(false);
    } finally {
      clock.mockRestore();
    }
  });

  it("removes the logo and makes the previous signed image unavailable", async () => {
    const removed = await request(app).delete("/api/club/logo").set(as("admin0")).expect(200);
    expect(removed.body.logoUrl).toBeNull();
    await request(app).get(signedUrl).expect(404);
    const reloaded = await request(app).get("/api/club").set(as("admin0")).expect(200);
    expect(reloaded.body.logoUrl).toBeNull();
  });

  it("preserves compatibility with an existing externally hosted club logo", async () => {
    const url = "https://example.test/club.png";
    await db.update(clubsTable).set({ logoUrl: url }).where(eq(clubsTable.id, clubIds[0]));
    const club = await request(app).get("/api/club").set(as("admin0")).expect(200);
    expect(club.body.logoUrl).toBe(url);
  });
});
