import { pgTable, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { eventsTable } from "./events";
import { usersTable } from "./users";

/**
 * Game clock periods (halves). A period is running while endedAt is null.
 * Player minutes only accrue while a period is running.
 */
export const gamePeriodsTable = pgTable("game_periods", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id")
    .notNull()
    .references(() => eventsTable.id),
  periodNumber: integer("period_number").notNull(), // 1 = first half, 2 = second half, ...
  plannedMinutes: integer("planned_minutes"), // countdown target; null = count up
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
}, (t) => [
  // At most one running (un-ended) period per event.
  uniqueIndex("game_periods_one_open_per_event")
    .on(t.eventId)
    .where(sql`${t.endedAt} IS NULL`),
]);

/**
 * A stint is a continuous stretch a player spends ON the pitch.
 * Toggling a player ON opens a stint; toggling OFF closes it.
 * Total minutes = sum of stint time overlapping running periods.
 */
export const gameStintsTable = pgTable("game_stints", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id")
    .notNull()
    .references(() => eventsTable.id),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
}, (t) => [
  // At most one open stint per player per event.
  uniqueIndex("game_stints_one_open_per_player")
    .on(t.eventId, t.userId)
    .where(sql`${t.endedAt} IS NULL`),
]);

export type GamePeriod = typeof gamePeriodsTable.$inferSelect;
export type GameStint = typeof gameStintsTable.$inferSelect;
