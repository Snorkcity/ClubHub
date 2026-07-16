import { pgTable, serial, integer, date, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { usersTable } from "./users";

/**
 * Daily wellness check-in. All five answers use a 1–5 scale where
 * HIGHER IS ALWAYS BETTER (5 = great, 1 = poor):
 *  - sleepQuality: 1 very poor sleep → 5 excellent sleep
 *  - energy:       1 exhausted       → 5 fresh (inverse of fatigue)
 *  - soreness:     1 very sore       → 5 no soreness
 *  - stress:       1 very stressed   → 5 relaxed
 *  - mood:         1 down            → 5 great
 */
export const wellnessEntriesTable = pgTable(
  "wellness_entries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    /** Local calendar day the entry is for (YYYY-MM-DD). */
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    sleepQuality: integer("sleep_quality").notNull(),
    energy: integer("energy").notNull(),
    soreness: integer("soreness").notNull(),
    stress: integer("stress").notNull(),
    mood: integer("mood").notNull(),
    /** Who entered it (self, or a guardian on behalf of the player). */
    submittedById: integer("submitted_by_id")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.userId, t.entryDate)],
);

export const insertWellnessEntrySchema = createInsertSchema(
  wellnessEntriesTable,
).omit({ id: true, createdAt: true });
export type InsertWellnessEntry = z.infer<typeof insertWellnessEntrySchema>;
export type WellnessEntry = typeof wellnessEntriesTable.$inferSelect;
