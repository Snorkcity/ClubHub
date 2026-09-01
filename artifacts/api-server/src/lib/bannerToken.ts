import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, expiring URLs for team banner images.
 *
 * Banners are delivered via <img> tags, which cannot attach Authorization
 * headers (the web client is cross-origin from the API on Railway prod). So
 * instead of an open endpoint, authenticated team APIs hand out a signed URL
 * that only club members ever receive; the image route verifies the HMAC
 * signature and expiry. URLs are quantized to a daily boundary so they stay
 * stable (cacheable) within a day while still expiring after ~a week.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_DAYS = 7;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET must be set to sign banner URLs");
  return s;
}

function sign(teamId: number, updatedAtMs: number, expMs: number): string {
  return createHmac("sha256", secret())
    .update(`team-banner:${teamId}:${updatedAtMs}:${expMs}`)
    .digest("base64url");
}

/** Relative signed URL for a team's banner (client prepends its API base). */
export function signedBannerPath(teamId: number, updatedAt: Date): string {
  const updatedAtMs = updatedAt.getTime();
  // Quantized expiry: stable URL within a day, valid for 6-7 days.
  const expMs = (Math.floor(Date.now() / DAY_MS) + VALID_DAYS) * DAY_MS;
  const sig = sign(teamId, updatedAtMs, expMs);
  return `/api/teams/${teamId}/banner?u=${updatedAtMs}&e=${expMs}&s=${sig}`;
}

/** Verifies signature + expiry from query params. */
export function verifyBannerToken(
  teamId: number,
  u: unknown,
  e: unknown,
  s: unknown,
): boolean {
  const updatedAtMs = Number(u);
  const expMs = Number(e);
  if (!Number.isFinite(updatedAtMs) || !Number.isFinite(expMs)) return false;
  if (typeof s !== "string" || s.length === 0) return false;
  if (Date.now() > expMs) return false;
  const expected = Buffer.from(sign(teamId, updatedAtMs, expMs));
  const given = Buffer.from(s);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
