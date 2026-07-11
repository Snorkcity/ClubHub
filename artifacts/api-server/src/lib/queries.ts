import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  teamsTable,
  teamMembersTable,
  guardianshipsTable,
} from "@workspace/db";

/** Player user ids this guardian is linked to. */
export async function getWardIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ playerId: guardianshipsTable.playerId })
    .from(guardianshipsTable)
    .where(eq(guardianshipsTable.guardianId, userId));
  return rows.map((r) => r.playerId);
}

/** Team ids the user may view: all club teams for admins, otherwise teams the
 *  user belongs to plus teams any of their linked children belong to. */
export async function getVisibleTeamIds(
  clubId: number,
  userId: number,
  isAdmin: boolean,
): Promise<number[]> {
  if (isAdmin) {
    const rows = await db
      .select({ id: teamsTable.id })
      .from(teamsTable)
      .where(eq(teamsTable.clubId, clubId));
    return rows.map((r) => r.id);
  }

  const wardIds = await getWardIds(userId);
  const memberUserIds = [userId, ...wardIds];
  const rows = await db
    .select({ teamId: teamMembersTable.teamId })
    .from(teamMembersTable)
    .innerJoin(teamsTable, eq(teamMembersTable.teamId, teamsTable.id))
    .where(
      and(
        inArray(teamMembersTable.userId, memberUserIds),
        eq(teamsTable.clubId, clubId),
      ),
    );
  return Array.from(new Set(rows.map((r) => r.teamId)));
}

/** True when the user can act on behalf of the target player (self, admin, or
 *  a guardian with manage rights). */
export async function canActFor(
  actorId: number,
  targetId: number,
  isAdmin: boolean,
): Promise<boolean> {
  if (actorId === targetId || isAdmin) return true;
  const link = await db
    .select()
    .from(guardianshipsTable)
    .where(
      and(
        eq(guardianshipsTable.guardianId, actorId),
        eq(guardianshipsTable.playerId, targetId),
        eq(guardianshipsTable.canManage, true),
      ),
    );
  return link.length > 0;
}
