import type { User } from "@workspace/db";
import { signedAvatarPath } from "./avatarToken";

export function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

export function computeIsMinor(dob: string | null | undefined): boolean {
  if (!dob) return false;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age < 18;
}

export type Viewer = { id: number; isClubAdmin: boolean };

/**
 * Serialize a user, honoring their per-field privacy settings.
 * - No viewer given: only 'everyone' fields are included (safe default).
 * - viewer.self / full: everything (own profile, guardians viewing wards).
 * - 'admins' fields require viewer.isClubAdmin; 'private' is self-only.
 */
export function toPerson(u: User, viewer?: Viewer, opts?: { full?: boolean }) {
  const self = opts?.full === true || (viewer != null && viewer.id === u.id);
  const can = (privacy: string) =>
    self ||
    privacy === "everyone" ||
    (privacy === "admins" && !!viewer?.isClubAdmin);
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    fullName: `${u.firstName} ${u.lastName}`,
    email: can(u.emailPrivacy) ? (u.email ?? null) : null,
    phone: can(u.phonePrivacy) ? (u.phone ?? null) : null,
    avatarUrl: u.avatarUpdatedAt
      ? signedAvatarPath(u.id, u.avatarUpdatedAt)
      : (u.avatarUrl ?? null),
    bio: can(u.bioPrivacy) ? (u.bio ?? null) : null,
    phonePrivacy: u.phonePrivacy,
    emailPrivacy: u.emailPrivacy,
    bioPrivacy: u.bioPrivacy,
    dateOfBirth: u.dateOfBirth ?? null,
    isMinor: computeIsMinor(u.dateOfBirth),
    hasLogin: !!u.clerkUserId,
  };
}
