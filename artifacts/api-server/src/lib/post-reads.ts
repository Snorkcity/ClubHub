import { and, inArray, isNotNull, sql } from "drizzle-orm";
import { db, teamsTable, usersTable, postReadsTable, type Post } from "@workspace/db";

/** Same viewing access as the feed: direct members, linked guardians and club
 * admins. Unclaimed roster records cannot log in, so are not possible readers.
 * Resolve all teams together, not a database query per card/person. */
export async function postReadSummaries(posts: Post[], viewerId?: number) {
  const teamIds = [...new Set(posts.map(p => p.teamId))];
  const [audience, reads] = await Promise.all([
    db.select({ teamId: teamsTable.id, userId: usersTable.id })
      .from(teamsTable)
      .innerJoin(usersTable, and(
        isNotNull(usersTable.clerkUserId),
        personBelongsToClubSql(),
        sql`(
          EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = ${teamsTable.clubId}
            AND cm.user_id = ${usersTable.id} AND cm.role = 'admin')
          OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = ${teamsTable.id}
            AND tm.user_id = ${usersTable.id})
          OR EXISTS (SELECT 1 FROM guardianships g JOIN team_members tm ON tm.user_id = g.player_id
            WHERE g.guardian_id = ${usersTable.id} AND tm.team_id = ${teamsTable.id})
        )`,
      ))
      .where(inArray(teamsTable.id, teamIds)),
    db.select({ postId: postReadsTable.postId, userId: postReadsTable.userId })
      .from(postReadsTable).where(inArray(postReadsTable.postId, posts.map(p => p.id))),
  ]);
  const audienceByTeam = new Map<number, Set<number>>();
  for (const row of audience) {
    if (!audienceByTeam.has(row.teamId)) audienceByTeam.set(row.teamId, new Set());
    audienceByTeam.get(row.teamId)!.add(row.userId);
  }
  const readsByPost = new Map<number, Set<number>>();
  for (const row of reads) {
    if (!readsByPost.has(row.postId)) readsByPost.set(row.postId, new Set());
    readsByPost.get(row.postId)!.add(row.userId);
  }
  return new Map(posts.map(post => {
    const eligible = [...(audienceByTeam.get(post.teamId) ?? [])].filter(id => id !== post.authorId);
    const seen = readsByPost.get(post.id);
    return [post.id, {
      readerCount: eligible.length,
      readCount: eligible.filter(id => seen?.has(id)).length,
      hasRead: viewerId === post.authorId || (viewerId !== undefined && !!seen?.has(viewerId)),
    }];
  }));
}

function personBelongsToClubSql() {
  // This query spans multiple clubs: use each team's club, never the viewer's
  // selected club or the person's legacy home-club value.
  return sql`EXISTS (SELECT 1 FROM club_members cm
    WHERE cm.user_id = ${usersTable.id} AND cm.club_id = ${teamsTable.clubId})`;
}
