import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  teamsTable,
  teamMembersTable,
  chatMembersTable,
} from "@workspace/db";
import { getWardIds } from "./queries";

/** Fetch a team only if it belongs to the given club (tenant guard). */
export async function getTeamInClub(teamId: number, clubId: number) {
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.clubId, clubId)));
  return team ?? null;
}

/** Can the user view this team? Admins see all club teams; others must be a
 *  member, or a guardian of a member. Cross-club teams are never accessible. */
export async function canAccessTeam(
  userId: number,
  teamId: number,
  clubId: number,
  isAdmin: boolean,
): Promise<boolean> {
  const team = await getTeamInClub(teamId, clubId);
  if (!team) return false;
  if (isAdmin) return true;
  const wardIds = await getWardIds(userId);
  const ids = [userId, ...wardIds];
  const rows = await db
    .select({ id: teamMembersTable.id })
    .from(teamMembersTable)
    .where(
      and(
        eq(teamMembersTable.teamId, teamId),
        inArray(teamMembersTable.userId, ids),
      ),
    );
  return rows.length > 0;
}

/** Can the user manage this team (create posts/events, edit roster)? Admins and
 *  the team's own managers/coaches. */
export async function isTeamStaff(
  userId: number,
  teamId: number,
  clubId: number,
  isAdmin: boolean,
): Promise<boolean> {
  const team = await getTeamInClub(teamId, clubId);
  if (!team) return false;
  if (isAdmin) return true;
  const rows = await db
    .select({ role: teamMembersTable.role })
    .from(teamMembersTable)
    .where(
      and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.userId, userId)),
    );
  return rows.some((r) => r.role === "manager" || r.role === "coach");
}

/** Is the user a member of this chat? No admin bypass — chats are private. */
export async function isChatMember(
  userId: number,
  chatId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: chatMembersTable.id })
    .from(chatMembersTable)
    .where(
      and(eq(chatMembersTable.chatId, chatId), eq(chatMembersTable.userId, userId)),
    );
  return rows.length > 0;
}

/** Is the target user a player/member of the given team? */
export async function isTeamMember(
  userId: number,
  teamId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: teamMembersTable.id })
    .from(teamMembersTable)
    .where(
      and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.userId, userId)),
    );
  return rows.length > 0;
}
