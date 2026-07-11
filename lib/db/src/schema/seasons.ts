import { pgTable, serial, text, integer, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { clubsTable } from "./clubs";

export const seasonsTable = pgTable("seasons", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id")
    .notNull()
    .references(() => clubsTable.id),
  name: text("name").notNull(),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  isActive: boolean("is_active").notNull().default(false),
});

export const insertSeasonSchema = createInsertSchema(seasonsTable).omit({
  id: true,
});
export type InsertSeason = z.infer<typeof insertSeasonSchema>;
export type Season = typeof seasonsTable.$inferSelect;
