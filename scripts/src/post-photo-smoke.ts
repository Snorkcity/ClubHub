/**
 * Integration smoke test for post photo attachments.
 *
 * Covers authorization end-to-end against a running dev api-server:
 *  - staff can create a post with photos; response carries signed photo URLs
 *  - non-staff of that team get 403 posting with photos
 *  - invalid data URLs / too many photos are rejected with 400
 *  - the photo GET requires a valid signed URL (no/bad signature → 403)
 *  - the signed URL from the authenticated feed API serves the image
 *  - deleting the post removes photos; the signed URL then 404s
 *
 * Usage: API_PORT=8080 pnpm --filter @workspace/scripts run smoke:post-photos
 * Requires CLERK_SECRET_KEY and a seeded dev DB (uses two coach users on
 * different teams).
 */

export {};

const PORT = process.env.API_PORT ?? "8080";
const BASE = `http://localhost:${PORT}`;
const CLERK = "https://api.clerk.com/v1";
const CLERK_KEY = process.env.CLERK_SECRET_KEY;
if (!CLERK_KEY) throw new Error("CLERK_SECRET_KEY required");

// Tiny valid JPEG (enough for the server-side data URL validation).
const TINY_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xdb, 0, 0x43, 0, ...Array(64).fill(8), 0xff, 0xc0, 0, 11,
  8, 0, 1, 0, 1, 1, 1, 17, 0, 0xff, 0xc4, 0, 0x1f, 0, 0, 1, 5, 1, 1, 1, 1, 1,
  1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0xff, 0xda, 0,
  8, 1, 1, 0, 0, 63, 0, 0x7f, 0xff, 0xd9,
]).toString("base64");
const DATA_URL = `data:image/jpeg;base64,${TINY_JPEG}`;

async function mintToken(clerkUserId: string): Promise<string> {
  const s = await fetch(`${CLERK}/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLERK_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: clerkUserId }),
  }).then((r) => r.json() as Promise<{ id: string }>);
  const t = await fetch(`${CLERK}/sessions/${s.id}/tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLERK_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  }).then((r) => r.json() as Promise<{ jwt: string }>);
  return t.jwt;
}

async function api(
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
}

const TEAM = 4;
const STAFF = "user_3GZH7fik1jAL5CGtMGl3NvKca3F"; // coach, team 4
const OUTSIDER = "user_3GZPif5JYm0mBpD45AnZdH8gKlT"; // coach, team 5 only

const staffTok = await mintToken(STAFF);
const outsiderTok = await mintToken(OUTSIDER);

// 1. Staff posts with two photos
const create = await api(staffTok, "POST", `/api/teams/${TEAM}/posts`, {
  body: "Photo smoke test post",
  photos: [DATA_URL, DATA_URL],
});
const post = (create.ok ? await create.json() : null) as {
  id: number;
  photos: { id: number; url: string }[];
} | null;
check(
  "staff POST with photos → 201 with 2 signed photo URLs",
  create.status === 201 && post?.photos?.length === 2 && post.photos.every((p) => p.url.includes("s=")),
  `status=${create.status}`,
);
if (!post) process.exit(1);

// 2. Non-staff cannot post with photos
const outPost = await api(outsiderTok, "POST", `/api/teams/${TEAM}/posts`, {
  body: "nope",
  photos: [DATA_URL],
});
check("non-staff POST → 403", outPost.status === 403, `status=${outPost.status}`);

// 3. Bad payloads rejected
const badUrl = await api(staffTok, "POST", `/api/teams/${TEAM}/posts`, {
  body: "bad",
  photos: ["data:text/html;base64,PGI+"],
});
check("non-image data URL → 400", badUrl.status === 400, `status=${badUrl.status}`);
const tooMany = await api(staffTok, "POST", `/api/teams/${TEAM}/posts`, {
  body: "too many",
  photos: Array(7).fill(DATA_URL),
});
check("7 photos → 400", tooMany.status === 400, `status=${tooMany.status}`);

// 4. Photo GET requires a valid signature
const photoUrl = post.photos[0].url;
const bare = await api(null, "GET", photoUrl.split("?")[0]);
check("GET without signature → 403", bare.status === 403, `status=${bare.status}`);
const tampered = await api(
  null,
  "GET",
  photoUrl.replace(/s=[^&]+/, "s=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
);
check("GET with bad signature → 403", tampered.status === 403, `status=${tampered.status}`);

// 5. Signed URL serves the image
const signed = await api(null, "GET", photoUrl);
check(
  "GET signed URL → 200 image/jpeg",
  signed.status === 200 &&
    (signed.headers.get("content-type") ?? "").startsWith("image/jpeg"),
  `status=${signed.status}`,
);

// 6. Feed includes photos on the post
const feed = await api(staffTok, "GET", `/api/feed`);
const feedPosts = (await feed.json()) as { id: number; photos?: unknown[] }[];
const inFeed = feedPosts.find((p) => p.id === post.id);
check("GET /feed post carries photos", (inFeed?.photos?.length ?? 0) === 2);

// 7. Deleting the post removes photos
const del = await api(staffTok, "DELETE", `/api/posts/${post.id}`);
check("staff DELETE post → 204", del.status === 204, `status=${del.status}`);
const afterDel = await api(null, "GET", photoUrl);
check("GET signed URL after delete → 404", afterDel.status === 404, `status=${afterDel.status}`);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll post photo checks passed");
