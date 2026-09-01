/**
 * Integration smoke test for the team photo banner feature.
 *
 * Covers authorization end-to-end against a running dev api-server:
 *  - staff can upload (PUT) and remove (DELETE) their team's banner
 *  - non-staff of that team get 403 on PUT/DELETE
 *  - the image GET requires a valid signed URL (no signature / bad signature → 403)
 *  - signed URL from the authenticated team API serves the image
 *  - after delete, the signed URL 404s
 *
 * Usage: API_PORT=8080 pnpm --filter @workspace/scripts run smoke:banner
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
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
}

// Two coaches on different teams (from seed data): coach of team 4 and coach
// of team 5. The team-4 coach is our actor; the team-5 coach is "non-staff"
// with respect to team 4.
const TEAM = 4;
const STAFF = "user_3GZH7fik1jAL5CGtMGl3NvKca3F"; // coach, team 4
const OUTSIDER = "user_3GZPif5JYm0mBpD45AnZdH8gKlT"; // coach, team 5 only

const staffTok = await mintToken(STAFF);
const outsiderTok = await mintToken(OUTSIDER);

// 1. Staff uploads a banner
const put = await api(staffTok, "PUT", `/api/teams/${TEAM}/banner`, {
  imageData: DATA_URL,
});
const team = (put.ok ? await put.json() : null) as {
  bannerUrl: string;
} | null;
check("staff PUT banner → 200 with bannerUrl", put.status === 200 && !!team?.bannerUrl, `status=${put.status}`);
if (!team) process.exit(1);

// 2. Non-staff cannot upload or delete
const putOut = await api(outsiderTok, "PUT", `/api/teams/${TEAM}/banner`, {
  imageData: DATA_URL,
});
check("non-staff PUT banner → 403", putOut.status === 403, `status=${putOut.status}`);
const delOut = await api(outsiderTok, "DELETE", `/api/teams/${TEAM}/banner`);
check("non-staff DELETE banner → 403", delOut.status === 403, `status=${delOut.status}`);

// 3. Image GET requires a valid signature
const bare = await api(null, "GET", `/api/teams/${TEAM}/banner`);
check("GET without signature → 403", bare.status === 403, `status=${bare.status}`);
const tampered = await api(
  null,
  "GET",
  `${team.bannerUrl.replace(/s=[^&]+/, "s=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")}`,
);
check("GET with bad signature → 403", tampered.status === 403, `status=${tampered.status}`);

// 4. Signed URL serves the image
const signed = await api(null, "GET", team.bannerUrl);
check(
  "GET signed URL → 200 image/jpeg",
  signed.status === 200 &&
    (signed.headers.get("content-type") ?? "").startsWith("image/jpeg"),
  `status=${signed.status}`,
);

// 5. Unauthenticated team list does not leak banner URLs
const teamsAnon = await api(null, "GET", `/api/teams`);
check("unauthenticated GET /teams → 401", teamsAnon.status === 401, `status=${teamsAnon.status}`);

// 6. Staff deletes; signed URL then 404s
const del = await api(staffTok, "DELETE", `/api/teams/${TEAM}/banner`);
check("staff DELETE banner → 204", del.status === 204, `status=${del.status}`);
const afterDel = await api(null, "GET", team.bannerUrl);
check("GET signed URL after delete → 404", afterDel.status === 404, `status=${afterDel.status}`);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll banner checks passed");
