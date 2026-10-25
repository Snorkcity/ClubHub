import { sql } from "drizzle-orm";
import { usersTable, clubMembersTable } from "@workspace/db";

/** Existing unclaimed roster entries have a home club; signed-in people may
 * also have explicitly granted memberships in other clubs. Never infer a
 * membership from an email, club name, or the selected request header. */
export function personBelongsToClub(clubId: number) {
  return sql`(${usersTable.clubId} = ${clubId} OR EXISTS (
    SELECT 1 FROM ${clubMembersTable}
    WHERE ${clubMembersTable.userId} = ${usersTable.id}
      AND ${clubMembersTable.clubId} = ${clubId}
  ))`;
}
