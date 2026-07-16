import type { Request, RequestHandler } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  clubsTable,
  clubMembersTable,
  type User,
} from "@workspace/db";

export interface AuthedRequest extends Request {
  localUser: User;
  clubId: number;
  isClubAdmin: boolean;
}

/**
 * Requires an authenticated Clerk session and bridges it to a local user
 * record (JIT provisioning). The first authenticated user for a club with no
 * admin becomes the Club Admin so the product owner can manage everything on
 * first sign-in.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const auth = getAuth(req);
    const clerkUserId = auth?.userId;
    if (!clerkUserId) {
      // TEMP DEBUG: why is Clerk rejecting the session?
      const cookie = req.headers.cookie ?? "";
      req.log.warn(
        {
          authDebug: {
            sessionStatus: (auth as { sessionStatus?: string } | undefined)
              ?.sessionStatus,
            tokenType: (auth as { tokenType?: string } | undefined)?.tokenType,
            hasSessionCookie: cookie.includes("__session"),
            hasClientUat: cookie.includes("__client_uat"),
            hasAuthHeader: Boolean(req.headers.authorization),
            host: req.headers.host,
            xForwardedHost: req.headers["x-forwarded-host"],
          },
        },
        "Unauthorized request",
      );
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    let club = (await db.select().from(clubsTable).limit(1))[0];
    if (!club) {
      club = (
        await db.insert(clubsTable).values({ name: "My Club" }).returning()
      )[0];
    }

    let user = (
      await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.clerkUserId, clerkUserId))
    )[0];

    if (!user) {
      // Pull identity from Clerk's backend so we can trust the email and,
      // critically, its verification status (the session token may omit email
      // entirely). This call only runs once per user — on first sign-in.
      let firstName = "New";
      let lastName = "Member";
      let email: string | null = null;
      let emailVerified = false;
      try {
        const clerkUser = await clerkClient.users.getUser(clerkUserId);
        firstName = clerkUser.firstName || firstName;
        lastName = clerkUser.lastName || lastName;
        const primary = clerkUser.emailAddresses.find(
          (e) => e.id === clerkUser.primaryEmailAddressId,
        );
        if (primary) {
          email = primary.emailAddress;
          emailVerified = primary.verification?.status === "verified";
        }
      } catch (err) {
        req.log.warn({ err }, "Could not load Clerk user profile");
      }

      // Claim a pre-created (login-less) person by email so admins can seed
      // people and have them attach to their real login on first sign-in.
      // Guarded: only a *verified* email may claim, and we fail closed on any
      // ambiguity (0 or >1 matches) rather than binding the wrong identity.
      if (email && emailVerified) {
        const candidates = await db
          .select()
          .from(usersTable)
          .where(
            and(
              sql`lower(${usersTable.email}) = ${email.toLowerCase()}`,
              isNull(usersTable.clerkUserId),
              eq(usersTable.clubId, club.id),
            ),
          );
        if (candidates.length === 1) {
          user = (
            await db
              .update(usersTable)
              .set({ clerkUserId })
              .where(eq(usersTable.id, candidates[0].id))
              .returning()
          )[0];
        } else if (candidates.length > 1) {
          req.log.warn(
            { email },
            "Ambiguous email match on sign-in; creating a new account instead of auto-linking",
          );
        }
      }

      if (!user) {
        user = (
          await db
            .insert(usersTable)
            .values({ clubId: club.id, clerkUserId, firstName, lastName, email })
            .returning()
        )[0];
      }
    }

    const admins = await db
      .select()
      .from(clubMembersTable)
      .where(
        and(
          eq(clubMembersTable.clubId, club.id),
          eq(clubMembersTable.role, "admin"),
        ),
      );

    let membership = (
      await db
        .select()
        .from(clubMembersTable)
        .where(
          and(
            eq(clubMembersTable.clubId, club.id),
            eq(clubMembersTable.userId, user.id),
          ),
        )
    )[0];

    if (!membership) {
      const role = admins.length === 0 ? "admin" : "member";
      membership = (
        await db
          .insert(clubMembersTable)
          .values({ clubId: club.id, userId: user.id, role })
          .returning()
      )[0];
    }

    const authed = req as AuthedRequest;
    authed.localUser = user;
    authed.clubId = club.id;
    authed.isClubAdmin = membership.role === "admin";
    next();
  } catch (err) {
    req.log.error({ err }, "Authentication failed");
    res.status(500).json({ error: "Authentication failed" });
  }
};
