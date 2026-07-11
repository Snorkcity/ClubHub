import { pgTable, serial, integer, text, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { clubsTable } from "./clubs";
import { usersTable } from "./users";

// Club-level role. "admin" runs the whole club; "member" is everyone else.
export const clubMembersTable = pgTable(
  "club_members",
  {
    id: serial("id").primaryKey(),
    clubId: integer("club_id")
      .notNull()
      .references(() => clubsTable.id),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    role: text("role").notNull().default("member"), // admin | member
  },
  (t) => [unique().on(t.clubId, t.userId)],
);

export const insertClubMemberSchema = createInsertSchema(clubMembersTable).omit({
  id: true,
});
export type InsertClubMember = z.infer<typeof insertClubMemberSchema>;
export type ClubMember = typeof clubMembersTable.$inferSelect;
