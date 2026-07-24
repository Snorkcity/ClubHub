import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { chatsTable } from "./chats";
import { usersTable } from "./users";

export const chatMembersTable = pgTable(
  "chat_members",
  {
    id: serial("id").primaryKey(),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chatsTable.id),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    // Read receipts: last time this member viewed the chat. Null = never.
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  },
  (t) => [unique().on(t.chatId, t.userId)],
);

export const insertChatMemberSchema = createInsertSchema(chatMembersTable).omit({
  id: true,
});
export type InsertChatMember = z.infer<typeof insertChatMemberSchema>;
export type ChatMember = typeof chatMembersTable.$inferSelect;
