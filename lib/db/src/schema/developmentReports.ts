import { index, integer, jsonb, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { developmentAssessmentsTable } from "./developmentAssessments";
import { developmentCyclesTable } from "./developmentCycles";
import { usersTable } from "./users";

export type DevelopmentCategorySnapshot = {
  key: string;
  label: string;
  score: number;
  narrative: string;
};

export const developmentReportsTable = pgTable(
  "development_reports",
  {
    id: serial("id").primaryKey(),
    cycleId: integer("cycle_id").notNull().references(() => developmentCyclesTable.id, { onDelete: "cascade" }),
    assessmentId: integer("assessment_id").notNull().references(() => developmentAssessmentsTable.id, { onDelete: "restrict" }),
    playerId: integer("player_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    playerFirstName: text("player_first_name").notNull(),
    playerFullName: text("player_full_name").notNull(),
    reportingPeriod: text("reporting_period").notNull(),
    categories: jsonb("categories").$type<DevelopmentCategorySnapshot[]>().notNull(),
    strength: text("strength").notNull(),
    focus: text("focus").notNull(),
    disclosure: text("disclosure").notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.cycleId, t.playerId),
    index("development_reports_player_released_idx").on(t.playerId, t.releasedAt),
  ],
);

export const insertDevelopmentReportSchema = createInsertSchema(developmentReportsTable).omit({
  id: true, releasedAt: true,
});
export type InsertDevelopmentReport = z.infer<typeof insertDevelopmentReportSchema>;
export type DevelopmentReport = typeof developmentReportsTable.$inferSelect;