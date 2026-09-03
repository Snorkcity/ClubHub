/**
 * Regression tests for post photo attachments:
 *  - staff can create posts with photos; response and feed carry signed URLs
 *  - non-staff cannot post with photos (403)
 *  - invalid data URLs and >6 photos are rejected (400) — including a
 *    six-photo request near the per-photo size limit (aggregate body budget)
 *  - the photo GET route requires a valid signed URL (403 otherwise)
 *  - deleting a post removes its photos (signed URL then 404s)
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
  pool,
  clubsTable,
  clubMembersTable,
  usersTable,
  teamsTable,
  teamMembersTable,
  postsTable,
  postPhotosTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import app from "../src/app";

process.env.SESSION_SECRET ??= "test-session-secret";

const PREFIX = "test_photo_";
const as = (clerkId: string) => ({ "x-test-user": PREFIX + clerkId });

// Tiny valid JPEG (enough for server-side data URL validation).
const TINY_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xdb, 0, 0x43, 0, ...Array(64).fill(8), 0xff, 0xc0, 0, 11,
  8, 0, 1, 0, 1, 1, 1, 17, 0, 0xff, 0xc4, 0, 0x1f, 0, 0, 1, 5, 1, 1, 1, 1, 1,
  1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0xff, 0xda, 0,
  8, 1, 1, 0, 0, 63, 0, 0x7f, 0xff, 0xd9,
]).toString("base64");
const DATA_URL = `data:image/jpeg;base64,${TINY_JPEG}`;

/** A JPEG data URL padded to roughly `bytes` of binary payload. */
function bigJpegDataUrl(bytes: number): string {
  const raw = Buffer.concat([
    Buffer.from(TINY_JPEG, "base64"),
    Buffer.alloc(bytes),
  ]);
  return `data:image/jpeg;base64,${raw.toString("base64")}`;
}

let clubId: number;
let createdClub = false;
let teamId = 0;
const userIds: number[] = [];
let coach = 0;

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

  async function mkUser(clerkId: string, firstName: string) {
    const [u] = await db
      .insert(usersTable)
      .values({
        clubId,
        clerkUserId: PREFIX + clerkId,
        firstName,
        lastName: "Test",
      })
      .returning();
    userIds.push(u.id);
    return u.id;
  }
  coach = await mkUser("coach", "Coach");
  const player = await mkUser("player", "Player");

  await db.insert(clubMembersTable).values([
    { clubId, userId: coach, role: "member" },
    { clubId, userId: player, role: "member" },
  ]);

  const [team] = await db
    .insert(teamsTable)
    .values({ clubId, name: PREFIX + "Team", ageGroup: "U12" })
    .returning();
  teamId = team.id;
  await db.insert(teamMembersTable).values([
    { teamId, userId: coach, role: "coach" },
    { teamId, userId: player, role: "player" },
  ]);
});

afterAll(async () => {
  if (userIds.length) {
    const posts = await db
      .select({ id: postsTable.id })
      .from(postsTable)
      .where(inArray(postsTable.authorId, userIds));
    const postIds = posts.map((p) => p.id);
    if (postIds.length)
      await db
        .delete(postPhotosTable)
        .where(inArray(postPhotosTable.postId, postIds));
    await db.delete(postsTable).where(inArray(postsTable.authorId, userIds));
  }
  if (teamId)
    await db.delete(teamMembersTable).where(eq(teamMembersTable.teamId, teamId));
  if (teamId) await db.delete(teamsTable).where(eq(teamsTable.id, teamId));
  if (userIds.length) {
    await db
      .delete(clubMembersTable)
      .where(
        and(
          eq(clubMembersTable.clubId, clubId),
          inArray(clubMembersTable.userId, userIds),
        ),
      );
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
  if (createdClub) await db.delete(clubsTable).where(eq(clubsTable.id, clubId));
  await pool.end();
});

describe("post photo attachments", () => {
  it("staff can post with photos and gets signed URLs back", async () => {
    const res = await request(app)
      .post(`/api/teams/${teamId}/posts`)
      .set(as("coach"))
      .send({
        title: "  Match update  ",
        body: PREFIX + "with photos",
        photos: [DATA_URL, DATA_URL],
      })
      .expect(201);
    expect(res.body.title).toBe("Match update");
    expect(res.body.photos).toHaveLength(2);
    for (const p of res.body.photos) {
      expect(p.url).toMatch(new RegExp(`^/api/posts/${res.body.id}/photos/\\d+\\?e=\\d+&s=`));
    }
  });

  it("feed and team posts carry photos", async () => {
    const feed = await request(app).get("/api/feed").set(as("player")).expect(200);
    const post = feed.body.find((p: any) => p.body === PREFIX + "with photos");
    expect(post?.title).toBe("Match update");
    expect(post?.photos).toHaveLength(2);
  });

  it("non-staff cannot post with photos", async () => {
    await request(app)
      .post(`/api/teams/${teamId}/posts`)
      .set(as("player"))
      .send({ body: "nope", photos: [DATA_URL] })
      .expect(403);
  });

  it("rejects non-image data URLs with 400", async () => {
    await request(app)
      .post(`/api/teams/${teamId}/posts`)
      .set(as("coach"))
      .send({ body: "bad", photos: ["data:text/html;base64,PGI+"] })
      .expect(400);
  });

  it("rejects more than 6 photos with 400", async () => {
    await request(app)
      .post(`/api/teams/${teamId}/posts`)
      .set(as("coach"))
      .send({ body: "too many", photos: Array(7).fill(DATA_URL) })
      .expect(400);
  });

  it("accepts six photos near the 4MB per-photo limit (aggregate body budget)", async () => {
    // ~3.9MB binary each; 6 of them ≈ 31MB base64 — must clear express.json.
    const big = bigJpegDataUrl(3_900_000);
    const res = await request(app)
      .post(`/api/teams/${teamId}/posts`)
      .set(as("coach"))
      .send({ body: PREFIX + "six big", photos: Array(6).fill(big) })
      .expect(201);
    expect(res.body.photos).toHaveLength(6);
  }, 60_000);

  it("rejects a photo over 4MB with 400", async () => {
    await request(app)
      .post(`/api/teams/${teamId}/posts`)
      .set(as("coach"))
      .send({ body: "huge", photos: [bigJpegDataUrl(4_400_000)] })
      .expect(400);
  });

  it("photo GET requires a valid signature", async () => {
    const create = await request(app)
      .post(`/api/teams/${teamId}/posts`)
      .set(as("coach"))
      .send({ body: PREFIX + "sig test", photos: [DATA_URL] })
      .expect(201);
    const url: string = create.body.photos[0].url;

    await request(app).get(url.split("?")[0]).expect(403);
    await request(app)
      .get(url.replace(/s=[^&]+/, "s=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"))
      .expect(403);
    const ok = await request(app).get(url).expect(200);
    expect(ok.headers["content-type"]).toMatch(/^image\/jpeg/);
  });

  it("deleting a post removes its photos", async () => {
    const create = await request(app)
      .post(`/api/teams/${teamId}/posts`)
      .set(as("coach"))
      .send({ body: PREFIX + "delete me", photos: [DATA_URL] })
      .expect(201);
    const url: string = create.body.photos[0].url;
    await request(app)
      .delete(`/api/posts/${create.body.id}`)
      .set(as("coach"))
      .expect(204);
    await request(app).get(url).expect(404);
    const rows = await db
      .select()
      .from(postPhotosTable)
      .where(eq(postPhotosTable.postId, create.body.id));
    expect(rows).toHaveLength(0);
  });
});
