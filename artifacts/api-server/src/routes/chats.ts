import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  chatsTable,
  chatMembersTable,
  messagesTable,
  teamsTable,
  usersTable,
} from "@workspace/db";
import { CreateChatBody, SendMessageBody } from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { canAccessTeam, isChatMember } from "../lib/authz";
import { toPerson, iso } from "../lib/serialize";

const router: IRouter = Router();

function messageDto(
  m: typeof messagesTable.$inferSelect,
  author: typeof usersTable.$inferSelect,
) {
  return {
    id: m.id,
    chatId: m.chatId,
    body: m.body,
    createdAt: iso(m.createdAt) as string,
    author: toPerson(author),
  };
}

router.get("/chats", requireAuth, async (req, res) => {
  const { localUser } = req as AuthedRequest;
  const myChats = await db
    .select({ chatId: chatMembersTable.chatId })
    .from(chatMembersTable)
    .where(eq(chatMembersTable.userId, localUser.id));
  const chatIds = myChats.map((c) => c.chatId);
  if (chatIds.length === 0) return res.json([]);

  const chats = await db
    .select({ c: chatsTable, t: teamsTable })
    .from(chatsTable)
    .leftJoin(teamsTable, eq(chatsTable.teamId, teamsTable.id))
    .where(inArray(chatsTable.id, chatIds));

  const memberRows = await db
    .select()
    .from(chatMembersTable)
    .where(inArray(chatMembersTable.chatId, chatIds));
  const countByChat: Record<number, number> = {};
  const myReadByChat: Record<number, Date | null> = {};
  for (const m of memberRows) {
    countByChat[m.chatId] = (countByChat[m.chatId] ?? 0) + 1;
    if (m.userId === localUser.id) myReadByChat[m.chatId] = m.lastReadAt;
  }

  const lastMsgs = await db
    .select()
    .from(messagesTable)
    .where(inArray(messagesTable.chatId, chatIds))
    .orderBy(desc(messagesTable.createdAt));
  const lastByChat: Record<number, typeof messagesTable.$inferSelect> = {};
  for (const m of lastMsgs) if (!lastByChat[m.chatId]) lastByChat[m.chatId] = m;

  const authorIds = Array.from(
    new Set(Object.values(lastByChat).map((m) => m.authorId)),
  );
  const authors = authorIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, authorIds))
    : [];
  const authorById = Object.fromEntries(authors.map((a) => [a.id, a]));

  const result = chats.map(({ c, t }) => {
    const last = lastByChat[c.id];
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      teamId: c.teamId ?? null,
      teamName: t?.name ?? null,
      memberCount: countByChat[c.id] ?? 0,
      lastMessage:
        last && authorById[last.authorId]
          ? messageDto(last, authorById[last.authorId])
          : undefined,
      myLastReadAt: iso(myReadByChat[c.id] ?? null),
    };
  });
  result.sort((a, b) => {
    const at = a.lastMessage?.createdAt ?? "";
    const bt = b.lastMessage?.createdAt ?? "";
    return bt.localeCompare(at);
  });
  return res.json(result);
});

router.post("/chats", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const body = CreateChatBody.parse(req.body);

  // Team chats require access to that team.
  if (body.teamId != null) {
    if (!(await canAccessTeam(localUser.id, body.teamId, clubId, isClubAdmin)))
      return res.status(403).json({ error: "You cannot create a chat for this team" });
  }

  // All invited members must belong to the caller's club.
  const requestedIds = Array.from(new Set([localUser.id, ...body.memberIds]));
  const validMembers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.clubId, clubId), inArray(usersTable.id, requestedIds)));
  const memberIds = validMembers.map((m) => m.id);

  const [chat] = await db
    .insert(chatsTable)
    .values({
      clubId,
      teamId: body.teamId ?? null,
      name: body.name,
      type: body.type,
    })
    .returning();

  await db
    .insert(chatMembersTable)
    .values(memberIds.map((userId) => ({ chatId: chat.id, userId })))
    .onConflictDoNothing();

  return res.status(201).json({
    id: chat.id,
    name: chat.name,
    type: chat.type,
    teamId: chat.teamId ?? null,
    teamName: null,
    memberCount: memberIds.length,
    lastMessage: undefined,
  });
});

router.get("/chats/:chatId", requireAuth, async (req, res) => {
  const { localUser } = req as AuthedRequest;
  const chatId = Number(req.params.chatId);
  if (!(await isChatMember(localUser.id, chatId)))
    return res.status(403).json({ error: "You are not a member of this chat" });
  const [row] = await db
    .select({ c: chatsTable, t: teamsTable })
    .from(chatsTable)
    .leftJoin(teamsTable, eq(chatsTable.teamId, teamsTable.id))
    .where(eq(chatsTable.id, chatId));
  if (!row) return res.status(404).json({ error: "Chat not found" });

  const members = await db
    .select({ u: usersTable, cm: chatMembersTable })
    .from(chatMembersTable)
    .innerJoin(usersTable, eq(chatMembersTable.userId, usersTable.id))
    .where(eq(chatMembersTable.chatId, chatId));

  return res.json({
    chat: {
      id: row.c.id,
      name: row.c.name,
      type: row.c.type,
      teamId: row.c.teamId ?? null,
      teamName: row.t?.name ?? null,
      memberCount: members.length,
      lastMessage: undefined,
    },
    members: members.map((m) => toPerson(m.u)),
    // Read receipts: when each member last viewed this chat.
    reads: members.map((m) => ({
      userId: m.cm.userId,
      lastReadAt: iso(m.cm.lastReadAt),
    })),
  });
});

router.post("/chats/:chatId/read", requireAuth, async (req, res) => {
  const { localUser } = req as AuthedRequest;
  const chatId = Number(req.params.chatId);
  if (!(await isChatMember(localUser.id, chatId)))
    return res.status(403).json({ error: "You are not a member of this chat" });
  await db
    .update(chatMembersTable)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(chatMembersTable.chatId, chatId),
        eq(chatMembersTable.userId, localUser.id),
      ),
    );
  return res.status(204).end();
});

router.get("/chats/:chatId/messages", requireAuth, async (req, res) => {
  const { localUser } = req as AuthedRequest;
  const chatId = Number(req.params.chatId);
  if (!(await isChatMember(localUser.id, chatId)))
    return res.status(403).json({ error: "You are not a member of this chat" });
  const rows = await db
    .select({ m: messagesTable, u: usersTable })
    .from(messagesTable)
    .innerJoin(usersTable, eq(messagesTable.authorId, usersTable.id))
    .where(eq(messagesTable.chatId, chatId))
    .orderBy(asc(messagesTable.createdAt));
  return res.json(rows.map(({ m, u }) => messageDto(m, u)));
});

router.post("/chats/:chatId/messages", requireAuth, async (req, res) => {
  const { localUser } = req as AuthedRequest;
  const chatId = Number(req.params.chatId);
  if (!(await isChatMember(localUser.id, chatId)))
    return res.status(403).json({ error: "You are not a member of this chat" });
  const body = SendMessageBody.parse(req.body);
  const [message] = await db
    .insert(messagesTable)
    .values({ chatId, authorId: localUser.id, body: body.body })
    .returning();
  return res.status(201).json(messageDto(message, localUser));
});

export default router;
