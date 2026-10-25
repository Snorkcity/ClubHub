import { and, eq, sql } from "drizzle-orm";
import {
  db, usersTable, clubMembersTable, teamMembersTable,
  chatMembersTable, chatsTable, teamInvitationsTable,
} from "@workspace/db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Older invitations created a second, login-less roster entry even when the
 * person already had an account. Only consolidate an invitation-only shell:
 * never delete a profile containing attendance, monitoring, feedback or history.
 * The caller must first verify the authenticated email against the invitation.
 */
export async function reconcileInvitedPerson(
  tx: Transaction,
  placeholderId: number,
  accountId: number,
  clubId: number,
  teamId: number,
) {
  const [profile] = await tx.select().from(usersTable).where(eq(usersTable.id, placeholderId));
  if (!profile || profile.clerkUserId || profile.phone || profile.bio ||
    profile.avatarUrl || profile.avatarImage || profile.avatarContentType ||
    profile.avatarUpdatedAt || profile.dateOfBirth || profile.pushNotificationsEnabled ||
    profile.phonePrivacy !== "everyone" || profile.emailPrivacy !== "everyone" ||
    profile.bioPrivacy !== "everyone") return false;
  const memberships = await tx.select().from(teamMembersTable)
    .where(eq(teamMembersTable.userId, placeholderId));
  const clubs = await tx.select().from(clubMembersTable)
    .where(eq(clubMembersTable.userId, placeholderId));
  const invitations = await tx.select().from(teamInvitationsTable)
    .where(eq(teamInvitationsTable.personId, placeholderId));
  const chats = await tx.select({ membership: chatMembersTable, teamId: chatsTable.teamId })
    .from(chatMembersTable).innerJoin(chatsTable, eq(chatsTable.id, chatMembersTable.chatId))
    .where(eq(chatMembersTable.userId, placeholderId));
  if (
    memberships.some((row) => row.teamId !== teamId) ||
    clubs.some((row) => row.clubId !== clubId || row.role !== "member") ||
    invitations.some((row) => row.teamId !== teamId || row.clubId !== clubId || row.acceptedAt) ||
    chats.some((row) => row.teamId !== teamId)
  ) return false;

  // Discover all user references, including future schema additions. A shell
  // with any other reference needs explicit reconciliation, not cascade deletion.
  const references = await tx.execute(sql`
    select n.nspname as schema_name, c.relname as table_name, a.attname as column_name
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any(k.conkey)
    where k.contype = 'f' and k.confrelid = 'users'::regclass
  `);
  const movable = new Set([
    "club_members.user_id", "team_members.user_id",
    "chat_members.user_id", "team_invitations.person_id",
  ]);
  for (const reference of references.rows) {
    const table = String(reference.table_name);
    const column = String(reference.column_name);
    if (reference.schema_name === "public" && movable.has(`${table}.${column}`)) continue;
    const found = await tx.execute(sql`select 1 from
      ${sql.identifier(String(reference.schema_name))}.${sql.identifier(table)}
      where ${sql.identifier(column)} = ${placeholderId} limit 1`);
    if (found.rows.length) return false;
  }

  for (const row of memberships) {
    await tx.insert(teamMembersTable).values({
      teamId: row.teamId, userId: accountId, role: row.role,
      jerseyNumber: row.jerseyNumber, position: row.position,
    }).onConflictDoNothing();
  }
  await tx.insert(clubMembersTable).values({ clubId, userId: accountId, role: "member" })
    .onConflictDoNothing();
  for (const row of chats) {
    await tx.insert(chatMembersTable).values({
      chatId: row.membership.chatId, userId: accountId,
    }).onConflictDoNothing();
  }
  await tx.update(teamInvitationsTable).set({ personId: accountId })
    .where(eq(teamInvitationsTable.personId, placeholderId));
  await tx.delete(chatMembersTable).where(eq(chatMembersTable.userId, placeholderId));
  await tx.delete(teamMembersTable).where(eq(teamMembersTable.userId, placeholderId));
  await tx.delete(clubMembersTable).where(eq(clubMembersTable.userId, placeholderId));
  await tx.delete(usersTable).where(and(eq(usersTable.id, placeholderId), sql`${usersTable.clerkUserId} is null`));
  return true;
}
