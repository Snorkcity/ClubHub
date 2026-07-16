import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { eventsTable } from "./events";
import { usersTable } from "./users";

export const rpeEntriesTable = pgTable(
  "rpe_entries",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => eventsTable.id),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    /** Rating of Perceived Exertion, 0–10 (Foster sRPE scale). */
    rpe: integer("rpe").notNull(),
    /** Session minutes (from the scheduled event; editable). Load = rpe × minutes. */
    minutes: integer("minutes").notNull(),
    /** Who entered it (self, or a guardian on behalf of the player). */
    submittedById: integer("submitted_by_id")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.eventId, t.userId)],
);

export const insertRpeEntrySchema = createInsertSchema(rpeEntriesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRpeEntry = z.infer<typeof insertRpeEntrySchema>;
export type RpeEntry = typeof rpeEntriesTable.$inferSelect;
