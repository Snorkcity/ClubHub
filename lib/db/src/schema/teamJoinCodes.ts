import { integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamsTable } from "./teams";
import { usersTable } from "./users";

// These codes grant ordinary team access, never staff or family authority.
export const teamJoinCodesTable = pgTable("team_join_codes", {
  teamId: integer("team_id").primaryKey().references(() => teamsTable.id, { onDelete: "cascade" }),
  code: text("code").unique(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teamJoinRequestsTable = pgTable("team_join_requests", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  childName: text("child_name").notNull(),
  status: text("status").notNull().default("pending"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("team_join_requests_team_user_unique").on(t.teamId, t.userId)]);

export const insertTeamJoinCodeSchema = createInsertSchema(teamJoinCodesTable).omit({ updatedAt: true });
export const insertTeamJoinRequestSchema = createInsertSchema(teamJoinRequestsTable).omit({ id: true, createdAt: true });
export type TeamJoinCode = typeof teamJoinCodesTable.$inferSelect;
export type InsertTeamJoinCode = z.infer<typeof insertTeamJoinCodeSchema>;
export type TeamJoinRequest = typeof teamJoinRequestsTable.$inferSelect;
export type InsertTeamJoinRequest = z.infer<typeof insertTeamJoinRequestSchema>;
