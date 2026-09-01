import { index, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clubsTable } from "./clubs";
import { usersTable } from "./users";

/** Immutable notification content; delivery/read state lives in notification_recipients. */
export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
    actorId: integer("actor_id").references(() => usersTable.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // event | post
    title: text("title").notNull(),
    body: text("body").notNull(),
    deepLink: text("deep_link").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_club_created_idx").on(t.clubId, t.createdAt)],
);

export const notificationRecipientsTable = pgTable(
  "notification_recipients",
  {
    id: serial("id").primaryKey(),
    notificationId: integer("notification_id").notNull().references(() => notificationsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.notificationId, t.userId),
    index("notification_recipients_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;