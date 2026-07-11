import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { eventsTable } from "./events";
import { usersTable } from "./users";

export const rsvpsTable = pgTable(
  "rsvps",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => eventsTable.id),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    status: text("status").notNull(), // going | maybe | out
    respondedAt: timestamp("responded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.eventId, t.userId)],
);

export const insertRsvpSchema = createInsertSchema(rsvpsTable).omit({
  id: true,
  respondedAt: true,
});
export type InsertRsvp = z.infer<typeof insertRsvpSchema>;
export type Rsvp = typeof rsvpsTable.$inferSelect;
