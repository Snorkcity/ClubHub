import type { Request, RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
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
      const claims = (auth.sessionClaims ?? {}) as Record<string, unknown>;
      const firstName =
        (claims.firstName as string) ||
        (claims.first_name as string) ||
        "New";
      const lastName =
        (claims.lastName as string) ||
        (claims.last_name as string) ||
        "Member";
      const email =
        (claims.email as string) || (claims.primary_email as string) || null;
      user = (
        await db
          .insert(usersTable)
          .values({ clubId: club.id, clerkUserId, firstName, lastName, email })
          .returning()
      )[0];
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
