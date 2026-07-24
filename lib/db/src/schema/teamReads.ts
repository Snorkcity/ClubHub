import { pgTable, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { teamsTable } from "./teams";
import { usersTable } from "./users";

/**
 * Tracks when a user last viewed a team's content (feed + team chat).
 * Anything newer than lastSeenAt counts as unread for that user/team.
 */
export const teamReadsTable = pgTable(
  "team_reads",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    teamId: integer("team_id")
      .notNull()
      .references(() => teamsTable.id),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("team_reads_user_team_unique").on(t.userId, t.teamId)],
);

export type TeamRead = typeof teamReadsTable.$inferSelect;
