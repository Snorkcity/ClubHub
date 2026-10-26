import { and, eq } from "drizzle-orm";
import { db, teamsTable, teamMembersTable } from "@workspace/db";
import { teamFeatures } from "@workspace/api-zod";
import type { Request } from "express";

export { teamFeatures };

/** Absent = All teams; invalid is deliberately not treated as All teams. */
export function featureTeamContext(req: Request): number | null {
  const raw = req.header("x-team-id");
  if (raw === undefined) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : -1;
}

export async function teamHasFeature(
  teamId: number,
  clubId: number,
  feature: "monitoring" | "learningPreferences" | "timekeeping",
) {
  const [team] = await db.select({ ageGroup: teamsTable.ageGroup })
    .from(teamsTable)
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.clubId, clubId)));
  return !!team && teamFeatures(team.ageGroup)[feature];
}

export async function hasEligiblePlayerTeam(userId: number, clubId: number, req: Request) {
  const context = featureTeamContext(req);
  const rows = await db.select({ teamId: teamsTable.id, ageGroup: teamsTable.ageGroup })
    .from(teamMembersTable)
    .innerJoin(teamsTable, eq(teamsTable.id, teamMembersTable.teamId))
    .where(and(
      eq(teamMembersTable.userId, userId),
      eq(teamMembersTable.role, "player"),
      eq(teamsTable.clubId, clubId),
      context === null ? undefined : eq(teamsTable.id, context),
    ));
  return rows.some(row => teamFeatures(row.ageGroup).monitoring);
}
