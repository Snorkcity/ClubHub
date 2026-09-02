import { index, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { clubsTable } from "./clubs";
import { teamsTable } from "./teams";
import { usersTable } from "./users";

export const teamInvitationsTable = pgTable(
  "team_invitations",
  {
    id: serial("id").primaryKey(),
    clubId: integer("club_id")
      .notNull()
      .references(() => clubsTable.id, { onDelete: "cascade" }),
    teamId: integer("team_id")
      .notNull()
      .references(() => teamsTable.id, { onDelete: "cascade" }),
    personId: integer("person_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    invitedByUserId: integer("invited_by_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("team_invitations_token_hash_unique").on(table.tokenHash),
    index("team_invitations_person_idx").on(table.personId),
  ],
);

export type TeamInvitation = typeof teamInvitationsTable.$inferSelect;