import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  serial,
  timestamp,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

import { usersTable } from "./users";
import { clubsTable } from "./clubs";

export const learningPreferencesTable = pgTable(
  "player_learning_preferences",
  {
    id: serial("id").primaryKey(),
    clubId: integer("club_id")
      .notNull()
      .references(() => clubsTable.id),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    subjectRole: text("subject_role", { enum: ["player", "coach"] })
      .notNull()
      .default("player"),
    visualScore: integer("visual_score").notNull(),
    auditoryScore: integer("auditory_score").notNull(),
    kinestheticScore: integer("kinesthetic_score").notNull(),
    questionnaireVersion: integer("questionnaire_version").notNull().default(1),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("player_learning_preferences_user_role_unique").on(
      table.userId,
      table.subjectRole,
    ),
    check(
      "player_learning_preferences_subject_role",
      sql`${table.subjectRole} IN ('player', 'coach')`,
    ),
    check(
      "player_learning_preferences_score_range",
      sql`${table.visualScore} BETWEEN 0 AND 30 AND ${table.auditoryScore} BETWEEN 0 AND 30 AND ${table.kinestheticScore} BETWEEN 0 AND 30`,
    ),
    check(
      "player_learning_preferences_score_total",
      sql`${table.visualScore} + ${table.auditoryScore} + ${table.kinestheticScore} = 30`,
    ),
  ],
);

export const insertLearningPreferencesSchema = createInsertSchema(
  learningPreferencesTable,
).omit({ id: true, completedAt: true });

export type InsertLearningPreferences = z.infer<
  typeof insertLearningPreferencesSchema
>;
export type LearningPreferences = typeof learningPreferencesTable.$inferSelect;
