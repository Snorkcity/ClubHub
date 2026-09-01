import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

import { postsTable } from "./posts";

// Photos attached to feed posts. Stored base64 in Postgres (same rationale as
// team banners: Replit dev and Railway prod share only the DB) and served via
// signed, expiring URLs — never through an unauthenticated route.
export const postPhotosTable = pgTable("post_photos", {
  id: serial("id").primaryKey(),
  postId: integer("post_id")
    .notNull()
    .references(() => postsTable.id),
  position: integer("position").notNull().default(0),
  image: text("image").notNull(), // base64, no data-URL prefix
  contentType: text("content_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PostPhoto = typeof postPhotosTable.$inferSelect;
