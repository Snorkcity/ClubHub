import type { Request, RequestHandler } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  clubMembersTable,
  type User,
} from "@workspace/db";
import { mayTransferLegacyClerkAccount } from "./clerk-account-migration";

export interface AuthedRequest extends Request {
  localUser: User;
  clubId: number;
  isClubAdmin: boolean;
}

export interface ClerkIdentity {
  firstName: string;
  lastName: string;
  email: string | null;
  emailVerified: boolean;
}

export async function loadClerkIdentity(
  req: Request,
  clerkUserId: string,
): Promise<ClerkIdentity> {
  const identity: ClerkIdentity = {
    firstName: "",
    lastName: "",
    email: null,
    emailVerified: false,
  };
  try {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    identity.firstName = clerkUser.firstName ?? "";
    identity.lastName = clerkUser.lastName ?? "";
    const primary = clerkUser.emailAddresses.find(
      (email) => email.id === clerkUser.primaryEmailAddressId,
    );
    if (primary) {
      identity.email = primary.emailAddress;
      identity.emailVerified = primary.verification?.status === "verified";
    }
  } catch (err) {
    req.log.warn({ err }, "Could not load Clerk user profile");
  }
  return identity;
}

/** Resolve an existing login, including fail-closed verified-email claiming. */
export async function findOrClaimUser(
  req: Request,
  clerkUserId: string,
): Promise<{ user?: User; identity?: ClerkIdentity }> {
  let user: User | undefined = (
    await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkUserId))
  )[0];
  if (user) {
    // Existing accounts may have deliberately left their original club.
    // Only claiming/onboarding/inviting grants membership, never signing in.
    return { user };
  }

  const identity = await loadClerkIdentity(req, clerkUserId);
  if (identity.email && identity.emailVerified) {
    const email = identity.email.toLowerCase();
    user = await db.transaction(async (tx) => {
      // Match invitation/leave lock ordering: email first, then person.
      // Parallel first-login requests must not overwrite each other's claim.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);
      const [alreadyLinked] = await tx.select().from(usersTable)
        .where(eq(usersTable.clerkUserId, clerkUserId));
      if (alreadyLinked) return alreadyLinked;

      // Check ALL people, not only login-less placeholders. A duplicate must
      // never choose a placeholder instead of the real, history-bearing account.
      const candidates = await tx.select().from(usersTable)
        .where(sql`lower(${usersTable.email}) = ${email}`).for("update");
      if (candidates.length !== 1) {
        if (candidates.length > 1) req.log.warn(
          "Ambiguous verified email match on sign-in; account not linked",
        );
        return undefined;
      }
      const candidate = candidates[0];
      const transferring = candidate.clerkUserId !== null;
      if (transferring && !mayTransferLegacyClerkAccount(candidate.clerkUserId!))
        return undefined;

      const [claimed] = await tx.update(usersTable).set({ clerkUserId })
        .where(and(
          eq(usersTable.id, candidate.id),
          transferring
            ? eq(usersTable.clerkUserId, candidate.clerkUserId!)
            : isNull(usersTable.clerkUserId),
        )).returning();
      if (!claimed) return undefined;
      if (!transferring) {
        await tx
          .insert(clubMembersTable)
          .values({
            clubId: claimed.clubId,
            userId: claimed.id,
            role: "member",
          })
          .onConflictDoNothing();
      }
      // A tenant transfer changes ONLY the login binding. In particular, do
      // not restore clubs somebody left, alter roles, or create another person.
      if (transferring) req.log.info(
        { localUserId: claimed.id }, "Completed approved Clerk account transfer",
      );
      return claimed;
    });
  }
  return { user, identity };
}

/** Account identity without club access, for accepting an invitation after
 * leaving every team. This must not grant access to tenant-scoped endpoints. */
export const requireAccount: RequestHandler = async (req, res, next) => {
  const clerkUserId = getAuth(req)?.userId;
  if (!clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { user } = await findOrClaimUser(req, clerkUserId);
  if (!user) {
    res.status(409).json({ error: "Complete first-time setup before using the app", code: "ONBOARDING_REQUIRED" });
    return;
  }
  const authed = req as AuthedRequest;
  authed.localUser = user;
  authed.clubId = user.clubId;
  authed.isClubAdmin = false;
  next();
};

/** Requires an authenticated Clerk session already linked to a club. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const auth = getAuth(req);
    const clerkUserId = auth?.userId;
    if (!clerkUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { user } = await findOrClaimUser(req, clerkUserId);
    if (!user) {
      res.status(409).json({
        error: "Complete first-time setup before using the app",
        code: "ONBOARDING_REQUIRED",
      });
      return;
    }

    const requestedClub = req.header("X-Nahreo-Club");
    const memberships = await db.select().from(clubMembersTable)
      .where(eq(clubMembersTable.userId, user.id));
    const defaultClub = memberships.find((m) => m.clubId === user.clubId) ?? memberships[0];
    const clubId = requestedClub === undefined ? (defaultClub?.clubId ?? user.clubId) : Number(requestedClub);
    if (!Number.isSafeInteger(clubId) || clubId <= 0) {
      res.status(400).json({ error: "Invalid active club" }); return;
    }
    const membership = (
      await db
        .select()
        .from(clubMembersTable)
        .where(
          and(
            eq(clubMembersTable.clubId, clubId),
            eq(clubMembersTable.userId, user.id),
          ),
        )
    )[0];

    if (!membership) {
      res.status(403).json({ error: "You do not belong to this club" }); return;
    }

    const authed = req as AuthedRequest;
    // Preserve the permanent account/home club in the database. Only this
    // authorised request's context changes when the person switches clubs.
    authed.localUser = { ...user, clubId };
    authed.clubId = clubId;
    authed.isClubAdmin = membership.role === "admin";
    next();
  } catch (err) {
    req.log.error({ err }, "Authentication failed");
    res.status(500).json({ error: "Authentication failed" });
  }
};
