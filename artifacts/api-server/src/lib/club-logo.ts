import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const MAX_BYTES = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

export function readClubLogo(imageData: string) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageData);
  if (!match) throw new Error("Choose a PNG, JPEG or WebP image.");
  const [, contentType, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > MAX_BYTES) throw new Error("Club logos must be no larger than 1 MB.");
  if (bytes.toString("base64") !== base64) throw new Error("This image could not be read.");
  const valid =
    (contentType === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (contentType === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (contentType === "image/webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");
  if (!valid) throw new Error("This file is not a valid PNG, JPEG or WebP image.");
  return { contentType, bytes };
}

export function clubLogoVersion(imageData: string) {
  return createHash("sha256").update(imageData).digest("hex").slice(0, 24);
}

function sign(clubId: number, version: string, expiry: number) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for club logo URLs");
  return createHmac("sha256", secret)
    .update(`club-logo:${clubId}:${version}:${expiry}`)
    .digest("base64url");
}

export function clubLogoPath(clubId: number, stored: string | null) {
  if (!stored?.startsWith("data:")) return stored;
  const version = clubLogoVersion(stored);
  const expiry = (Math.floor(Date.now() / DAY_MS) + 7) * DAY_MS;
  return `/api/clubs/${clubId}/logo?v=${version}&e=${expiry}&s=${sign(clubId, version, expiry)}`;
}

export function verifyClubLogoToken(clubId: number, version: unknown, expiry: unknown, signature: unknown) {
  const exp = Number(expiry);
  if (!Number.isInteger(clubId) || clubId <= 0 ||
      typeof version !== "string" || !/^[a-f0-9]{24}$/.test(version) ||
      !Number.isSafeInteger(exp) || exp <= Date.now() ||
      typeof signature !== "string") return false;
  const expected = Buffer.from(sign(clubId, version, exp));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
