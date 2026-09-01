import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { clubsTable } from "./clubs";
import { seasonsTable } from "./seasons";

export const teamsTable = pgTable("teams", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id")
    .notNull()
    .references(() => clubsTable.id),
  seasonId: integer("season_id").references(() => seasonsTable.id),
  name: text("name").notNull(),
  ageGroup: text("age_group").notNull(),
  gender: text("gender"),
  colorHex: text("color_hex"),
  // Team photo banner (shown on Home). Stored inline as base64 so it works
  // identically on Replit dev and Railway prod without external storage.
  bannerImage: text("banner_image"),
  bannerContentType: text("banner_content_type"),
  bannerUpdatedAt: timestamp("banner_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertTeamSchema = createInsertSchema(teamsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teamsTable.$inferSelect;
