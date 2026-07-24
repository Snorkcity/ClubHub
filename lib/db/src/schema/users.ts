import { pgTable, serial, text, integer, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { clubsTable } from "./clubs";

// A "user" is a person in the club. Every player has a lifelong account here,
// whether or not they can log in yet. clerkUserId is set once the person
// actually authenticates; young players may have no clerkUserId while a
// guardian operates on their behalf.
export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id")
    .notNull()
    .references(() => clubsTable.id),
  clerkUserId: text("clerk_user_id").unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  // Per-field privacy: who can see this info. 'everyone' | 'admins' | 'private'
  phonePrivacy: text("phone_privacy").notNull().default("everyone"),
  emailPrivacy: text("email_privacy").notNull().default("everyone"),
  bioPrivacy: text("bio_privacy").notNull().default("everyone"),
  dateOfBirth: date("date_of_birth", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
