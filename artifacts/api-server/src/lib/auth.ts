import type { Request, RequestHandler } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  clubMembersTable,
  type User,
} from "@workspace/db";

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
  let user = (
    await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkUserId))
  )[0];
  if (user) {
    await db
      .insert(clubMembersTable)
      .values({ clubId: user.clubId, userId: user.id, role: "member" })
      .onConflictDoNothing();
    return { user };
  }

  const identity = await loadClerkIdentity(req, clerkUserId);
  if (identity.email && identity.emailVerified) {
    const candidates = await db
      .select()
      .from(usersTable)
      .where(
        and(
          sql`lower(${usersTable.email}) = ${identity.email.toLowerCase()}`,
          isNull(usersTable.clerkUserId),
        ),
      );
    if (candidates.length === 1) {
      user = await db.transaction(async (tx) => {
        const [claimed] = await tx
          .update(usersTable)
          .set({ clerkUserId })
          .where(eq(usersTable.id, candidates[0].id))
          .returning();
        await tx
          .insert(clubMembersTable)
          .values({
            clubId: claimed.clubId,
            userId: claimed.id,
            role: "member",
          })
          .onConflictDoNothing();
        return claimed;
      });
    } else if (candidates.length > 1) {
      req.log.warn(
        { clerkUserId },
        "Ambiguous verified email match on sign-in; account not linked",
      );
    }
  }
  return { user, identity };
}

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

    const membership = (
      await db
        .select()
        .from(clubMembersTable)
        .where(
          and(
            eq(clubMembersTable.clubId, user.clubId),
            eq(clubMembersTable.userId, user.id),
          ),
        )
    )[0];

    if (!membership)
      throw new Error("Authenticated user club membership reconciliation failed");

    const authed = req as AuthedRequest;
    authed.localUser = user;
    authed.clubId = user.clubId;
    authed.isClubAdmin = membership.role === "admin";
    next();
  } catch (err) {
    req.log.error({ err }, "Authentication failed");
    res.status(500).json({ error: "Authentication failed" });
  }
};
