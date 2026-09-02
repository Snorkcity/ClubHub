import { randomUUID } from "node:crypto";

import { clubMembersTable, clubsTable, db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("club membership uniqueness", () => {
  let clubId: number;
  let userId: number;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("clubhub_test")) {
      throw new Error("Refusing to run outside the disposable test database");
    }

    const suffix = randomUUID();
    [clubId] = await db
      .insert(clubsTable)
      .values({ name: `Membership uniqueness ${suffix}` })
      .returning({ id: clubsTable.id })
      .then((rows) => rows.map((row) => row.id));
    [userId] = await db
      .insert(usersTable)
      .values({
        clubId,
        clerkUserId: `membership-${suffix}`,
        firstName: "Membership",
        lastName: "Test",
        email: `membership-${suffix}@example.test`,
      })
      .returning({ id: usersTable.id })
      .then((rows) => rows.map((row) => row.id));
  });

  afterAll(async () => {
    if (clubId && userId) {
      await db
        .delete(clubMembersTable)
        .where(eq(clubMembersTable.clubId, clubId));
      await db.delete(usersTable).where(eq(usersTable.id, userId));
      await db.delete(clubsTable).where(eq(clubsTable.id, clubId));
    }
  });

  it("rejects a second membership for the same club and user", async () => {
    await db.insert(clubMembersTable).values({ clubId, userId });

    await expect(
      db.insert(clubMembersTable).values({ clubId, userId }),
    ).rejects.toMatchObject({
      cause: {
        code: "23505",
        constraint: "club_members_club_id_user_id_unique",
      },
    });
  });
});