import { pgTable, serial, integer, text, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { usersTable } from "./users";

/**
 * A training/playing session logged OUTSIDE the club calendar — rep squad,
 * school sport, private conditioning etc. Counts toward the player's
 * workload (load = rpe × minutes) exactly like a club session, so coaches
 * see the athlete's true total load, not just club load.
 */
export const extraSessionsTable = pgTable("extra_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  /** Local calendar day of the session (YYYY-MM-DD). */
  sessionDate: date("session_date", { mode: "string" }).notNull(),
  /** rep | school | other */
  kind: text("kind").notNull(),
  /** Optional free-text description, e.g. "NSW Metro squad training". */
  label: text("label"),
  /** Rating of Perceived Exertion, 0–10 (Foster sRPE scale). */
  rpe: integer("rpe").notNull(),
  minutes: integer("minutes").notNull(),
  /** Who entered it (self, or a guardian on behalf of the player). */
  submittedById: integer("submitted_by_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertExtraSessionSchema = createInsertSchema(
  extraSessionsTable,
).omit({ id: true, createdAt: true });
export type InsertExtraSession = z.infer<typeof insertExtraSessionSchema>;
export type ExtraSession = typeof extraSessionsTable.$inferSelect;
