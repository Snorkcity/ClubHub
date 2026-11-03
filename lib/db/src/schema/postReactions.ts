import { pgTable, integer, text, primaryKey } from "drizzle-orm/pg-core";
import { postsTable } from "./posts";
import { usersTable } from "./users";

export const postReactionsTable = pgTable("post_reactions", {
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  emoji: text("emoji").notNull(),
}, (table) => [
  primaryKey({ columns: [table.postId, table.userId] }),
]);
