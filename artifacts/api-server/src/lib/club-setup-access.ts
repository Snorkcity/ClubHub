import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, platformOwnersTable, clubSetupInvitationsTable } from "@workspace/db";
import type { ClerkIdentity } from "./auth";

export function hashSetupToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function isNahreoOwner(identity: ClerkIdentity): Promise<boolean> {
  if (!identity.emailVerified || !identity.email) return false;
  const [owner] = await db.select({ email: platformOwnersTable.email })
    .from(platformOwnersTable).where(and(
      eq(platformOwnersTable.email, identity.email.trim().toLowerCase()),
      isNull(platformOwnersTable.revokedAt),
    ));
  return !!owner;
}

export async function getClubSetupAccess(identity: ClerkIdentity, token?: string) {
  const owner = await isNahreoOwner(identity);
  if (owner) return { allowed: true, owner, invitationId: null, message: "" };
  if (!identity.emailVerified || !identity.email)
    return { allowed: false, owner, invitationId: null, message: "Verify your sign-in email before using a club setup invitation." };
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    return { allowed: false, owner, invitationId: null, message: "New clubs are invitation-only. Ask the Nahreo owner for a club setup invitation. To join an existing team, use your team invitation instead." };
  const [invitation] = await db.select({ id: clubSetupInvitationsTable.id })
    .from(clubSetupInvitationsTable).where(and(
      eq(clubSetupInvitationsTable.tokenHash, hashSetupToken(token)),
      eq(clubSetupInvitationsTable.email, identity.email.trim().toLowerCase()),
      isNull(clubSetupInvitationsTable.usedAt), isNull(clubSetupInvitationsTable.revokedAt),
      gt(clubSetupInvitationsTable.expiresAt, new Date()),
    ));
  return {
    allowed: !!invitation, owner, invitationId: invitation?.id ?? null,
    message: invitation ? "" : "This invitation has expired, was revoked, was already used, or belongs to another email. Sign in with the invited email or ask the Nahreo owner for a new invitation.",
  };
}
