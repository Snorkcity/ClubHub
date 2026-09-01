import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, expiring URLs for post photo attachments — same pattern as team
 * banners (see bannerToken.ts): <img> tags can't attach auth headers, so
 * authenticated feed APIs hand out signed URLs and the image route verifies
 * the HMAC signature and expiry. Quantized daily so URLs stay cacheable.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_DAYS = 7;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET must be set to sign photo URLs");
  return s;
}

function sign(postId: number, photoId: number, expMs: number): string {
  return createHmac("sha256", secret())
    .update(`post-photo:${postId}:${photoId}:${expMs}`)
    .digest("base64url");
}

/** Relative signed URL for a post photo (client prepends its API base). */
export function signedPostPhotoPath(postId: number, photoId: number): string {
  const expMs = (Math.floor(Date.now() / DAY_MS) + VALID_DAYS) * DAY_MS;
  const sig = sign(postId, photoId, expMs);
  return `/api/posts/${postId}/photos/${photoId}?e=${expMs}&s=${sig}`;
}

/** Verifies signature + expiry from query params. */
export function verifyPostPhotoToken(
  postId: number,
  photoId: number,
  e: unknown,
  s: unknown,
): boolean {
  const expMs = Number(e);
  if (!Number.isFinite(expMs)) return false;
  if (typeof s !== "string" || s.length === 0) return false;
  if (Date.now() > expMs) return false;
  const expected = Buffer.from(sign(postId, photoId, expMs));
  const given = Buffer.from(s);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
