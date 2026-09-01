import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  teamsTable,
  teamMembersTable,
  seasonsTable,
  rsvpsTable,
  commentsTable,
  usersTable,
  type Team,
  type Event,
  type Post,
} from "@workspace/db";
import { postPhotosTable } from "@workspace/db";
import { iso, toPerson } from "./serialize";
import { signedBannerPath } from "./bannerToken";
import { signedPostPhotoPath } from "./photoToken";

async function teamNameMap(teamIds: number[]): Promise<Record<number, string>> {
  if (teamIds.length === 0) return {};
  const rows = await db
    .select({ id: teamsTable.id, name: teamsTable.name })
    .from(teamsTable)
    .where(inArray(teamsTable.id, teamIds));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

export async function buildTeams(teams: Team[]) {
  if (teams.length === 0) return [];
  const ids = teams.map((t) => t.id);
  const members = await db
    .select()
    .from(teamMembersTable)
    .where(inArray(teamMembersTable.teamId, ids));
  const seasonIds = teams
    .map((t) => t.seasonId)
    .filter((s): s is number => s != null);
  const seasons = seasonIds.length
    ? await db
        .select()
        .from(seasonsTable)
        .where(inArray(seasonsTable.id, seasonIds))
    : [];
  const seasonName = Object.fromEntries(seasons.map((s) => [s.id, s.name]));

  return teams.map((t) => {
    const tm = members.filter((m) => m.teamId === t.id);
    return {
      id: t.id,
      name: t.name,
      ageGroup: t.ageGroup,
      gender: t.gender ?? null,
      colorHex: t.colorHex ?? null,
      seasonId: t.seasonId ?? null,
      seasonName: t.seasonId ? (seasonName[t.seasonId] ?? null) : null,
      bannerUpdatedAt: t.bannerUpdatedAt?.toISOString() ?? null,
      bannerUrl: t.bannerUpdatedAt
        ? signedBannerPath(t.id, t.bannerUpdatedAt)
        : null,
      playerCount: tm.filter((m) => m.role === "player").length,
      staffCount: tm.filter((m) => m.role === "coach" || m.role === "manager")
        .length,
    };
  });
}

export async function buildEvents(events: Event[], myUserId?: number) {
  if (events.length === 0) return [];
  const ids = events.map((e) => e.id);
  const teamIds = Array.from(new Set(events.map((e) => e.teamId)));
  const [rsvps, players, names] = await Promise.all([
    db.select().from(rsvpsTable).where(inArray(rsvpsTable.eventId, ids)),
    db
      .select()
      .from(teamMembersTable)
      .where(
        and(
          inArray(teamMembersTable.teamId, teamIds),
          eq(teamMembersTable.role, "player"),
        ),
      ),
    teamNameMap(teamIds),
  ]);

  const playerCountByTeam: Record<number, number> = {};
  for (const p of players)
    playerCountByTeam[p.teamId] = (playerCountByTeam[p.teamId] ?? 0) + 1;

  return events.map((e) => {
    const er = rsvps.filter((r) => r.eventId === e.id);
    const going = er.filter((r) => r.status === "going").length;
    const maybe = er.filter((r) => r.status === "maybe").length;
    const out = er.filter((r) => r.status === "out").length;
    const totalPlayers = playerCountByTeam[e.teamId] ?? 0;
    const mine = myUserId ? er.find((r) => r.userId === myUserId) : undefined;
    return {
      id: e.id,
      teamId: e.teamId,
      teamName: names[e.teamId] ?? "",
      type: e.type as "training" | "game" | "social" | "other",
      title: e.title,
      location: e.location ?? null,
      opponent: e.opponent ?? null,
      startsAt: iso(e.startsAt) as string,
      endsAt: iso(e.endsAt),
      notes: e.notes ?? null,
      goingCount: going,
      maybeCount: maybe,
      outCount: out,
      noResponseCount: Math.max(0, totalPlayers - er.length),
      myRsvp: mine
        ? (mine.status as "going" | "maybe" | "out")
        : null,
      invitedRoles: (e.invitedRoles ?? "coaches,players,parents")
        .split(",")
        .filter(Boolean) as ("coaches" | "players" | "parents")[],
      cancelledAt: iso(e.cancelledAt),
      cancelReason: e.cancelReason ?? null,
    };
  });
}

export async function buildPosts(posts: Post[]) {
  if (posts.length === 0) return [];
  const teamIds = Array.from(new Set(posts.map((p) => p.teamId)));
  const authorIds = Array.from(new Set(posts.map((p) => p.authorId)));
  const postIds = posts.map((p) => p.id);
  const [authors, comments, names, photos] = await Promise.all([
    db.select().from(usersTable).where(inArray(usersTable.id, authorIds)),
    db
      .select()
      .from(commentsTable)
      .where(inArray(commentsTable.postId, postIds)),
    teamNameMap(teamIds),
    db
      .select({
        id: postPhotosTable.id,
        postId: postPhotosTable.postId,
        position: postPhotosTable.position,
      })
      .from(postPhotosTable)
      .where(inArray(postPhotosTable.postId, postIds)),
  ]);
  const photosByPost: Record<number, { id: number; position: number }[]> = {};
  for (const ph of photos)
    (photosByPost[ph.postId] ??= []).push({ id: ph.id, position: ph.position });
  const authorById = Object.fromEntries(authors.map((a) => [a.id, a]));
  const countByPost: Record<number, number> = {};
  for (const c of comments)
    countByPost[c.postId] = (countByPost[c.postId] ?? 0) + 1;

  return posts.map((p) => ({
    id: p.id,
    teamId: p.teamId,
    teamName: names[p.teamId] ?? "",
    title: p.title ?? null,
    body: p.body,
    // Pins auto-expire: a pinned post only presents as pinned for 2 days
    // from when it was (last) pinned.
    pinned:
      p.pinned &&
      p.pinnedAt != null &&
      Date.now() - new Date(p.pinnedAt).getTime() < 2 * 24 * 60 * 60 * 1000,
    createdAt: iso(p.createdAt) as string,
    author: toPerson(authorById[p.authorId]),
    commentCount: countByPost[p.id] ?? 0,
    photos: (photosByPost[p.id] ?? [])
      .sort((a, b) => a.position - b.position)
      .map((ph) => ({ id: ph.id, url: signedPostPhotoPath(p.id, ph.id) })),
  }));
}
