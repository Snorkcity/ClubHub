import { index, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clubsTable } from "./clubs";
import { teamsTable } from "./teams";
import { usersTable } from "./users";

export const developmentCyclesTable = pgTable(
  "development_cycles",
  {
    id: serial("id").primaryKey(),
    clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
    teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
    createdById: integer("created_by_id").notNull().references(() => usersTable.id),
    internalRecipientId: integer("internal_recipient_id").references(() => usersTable.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    reportingPeriod: text("reporting_period").notNull(),
    status: text("status").notNull().default("active"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("development_cycles_club_team_idx").on(t.clubId, t.teamId),
    index("development_cycles_status_idx").on(t.status),
  ],
);

export const insertDevelopmentCycleSchema = createInsertSchema(developmentCyclesTable).omit({
  id: true, createdAt: true, updatedAt: true, submittedAt: true, releasedAt: true,
});
export type InsertDevelopmentCycle = z.infer<typeof insertDevelopmentCycleSchema>;
export type DevelopmentCycle = typeof developmentCyclesTable.$inferSelect;

export const developmentCycleAssessorsTable = pgTable(
  "development_cycle_assessors",
  {
    id: serial("id").primaryKey(),
    cycleId: integer("cycle_id").notNull().references(() => developmentCyclesTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.cycleId, t.userId),
    index("development_cycle_assessors_user_idx").on(t.userId),
  ],
);