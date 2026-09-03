import { createHmac, timingSafeEqual } from "node:crypto";

const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_DAYS = 7;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET must be set to sign avatar URLs");
  return value;
}

function sign(userId: number, updatedAtMs: number, expMs: number): string {
  return createHmac("sha256", secret())
    .update(`user-avatar:${userId}:${updatedAtMs}:${expMs}`)
    .digest("base64url");
}

export function signedAvatarPath(userId: number, updatedAt: Date): string {
  const updatedAtMs = updatedAt.getTime();
  const expMs = (Math.floor(Date.now() / DAY_MS) + VALID_DAYS) * DAY_MS;
  return `/api/people/${userId}/avatar?u=${updatedAtMs}&e=${expMs}&s=${sign(userId, updatedAtMs, expMs)}`;
}

export function verifyAvatarToken(
  userId: number,
  updatedAt: unknown,
  expiresAt: unknown,
  signature: unknown,
): boolean {
  const updatedAtMs = Number(updatedAt);
  const expMs = Number(expiresAt);
  if (!Number.isFinite(updatedAtMs) || !Number.isFinite(expMs)) return false;
  if (typeof signature !== "string" || !signature || Date.now() > expMs) return false;
  const expected = Buffer.from(sign(userId, updatedAtMs, expMs));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}