import { check, index, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { developmentCyclesTable } from "./developmentCycles";
import { usersTable } from "./users";

export const developmentAssessmentsTable = pgTable(
  "development_assessments",
  {
    id: serial("id").primaryKey(),
    cycleId: integer("cycle_id").notNull().references(() => developmentCyclesTable.id, { onDelete: "cascade" }),
    playerId: integer("player_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    technical: integer("technical").notNull(),
    tactical: integer("tactical").notNull(),
    physical: integer("physical").notNull(),
    coachabilityMindset: integer("coachability_mindset").notNull(),
    effortConsistency: integer("effort_consistency").notNull(),
    teamworkCommunication: integer("teamwork_communication").notNull(),
    attendanceReliability: integer("attendance_reliability").notNull(),
    strength: text("strength").notNull(),
    focus: text("focus").notNull(),
    internalNotes: text("internal_notes"),
    updatedById: integer("updated_by_id").notNull().references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    unique().on(t.cycleId, t.playerId),
    index("development_assessments_player_idx").on(t.playerId),
    check("development_assessment_ratings_check", sql`
      ${t.technical} between 1 and 5 and ${t.tactical} between 1 and 5 and
      ${t.physical} between 1 and 5 and ${t.coachabilityMindset} between 1 and 5 and
      ${t.effortConsistency} between 1 and 5 and ${t.teamworkCommunication} between 1 and 5 and
      ${t.attendanceReliability} between 1 and 5
    `),
  ],
);

export const insertDevelopmentAssessmentSchema = createInsertSchema(developmentAssessmentsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertDevelopmentAssessment = z.infer<typeof insertDevelopmentAssessmentSchema>;
export type DevelopmentAssessment = typeof developmentAssessmentsTable.$inferSelect;