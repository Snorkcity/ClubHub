import { pgTable, serial, integer, text, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { teamsTable } from "./teams";
import { usersTable } from "./users";

// A person's role on a specific team. The same person can hold different roles
// on different teams (e.g. coach on one, parent's child plays on another).
export const teamMembersTable = pgTable(
  "team_members",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teamsTable.id),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    role: text("role").notNull(), // manager | coach | player
    jerseyNumber: integer("jersey_number"),
    position: text("position"),
  },
  (t) => [unique().on(t.teamId, t.userId, t.role)],
);

export const insertTeamMemberSchema = createInsertSchema(teamMembersTable).omit({
  id: true,
});
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembersTable.$inferSelect;
