import { pgTable, serial, integer, text, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { usersTable } from "./users";

// Links a guardian (parent) to a player's lifelong account. canManage lets the
// guardian act on behalf of the player (e.g. RSVP) — typically true for young
// players and dialed down as the player grows into their own account.
export const guardianshipsTable = pgTable(
  "guardianships",
  {
    id: serial("id").primaryKey(),
    guardianId: integer("guardian_id")
      .notNull()
      .references(() => usersTable.id),
    playerId: integer("player_id")
      .notNull()
      .references(() => usersTable.id),
    relationship: text("relationship").notNull().default("parent"), // parent | guardian | other
    canManage: boolean("can_manage").notNull().default(true),
  },
  (t) => [unique().on(t.guardianId, t.playerId)],
);

export const insertGuardianshipSchema = createInsertSchema(
  guardianshipsTable,
).omit({ id: true });
export type InsertGuardianship = z.infer<typeof insertGuardianshipSchema>;
export type Guardianship = typeof guardianshipsTable.$inferSelect;
