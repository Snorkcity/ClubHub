import { Router, type IRouter } from "express";
import { and, count, desc, eq, isNull, lt } from "drizzle-orm";
import { db, notificationRecipientsTable, notificationsTable, pushSubscriptionsTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../lib/auth";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res) => {
  const { localUser, clubId } = req as AuthedRequest;
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 100) : 50;
  const requestedCursor = Number(req.query.cursor);
  const cursor = Number.isInteger(requestedCursor) && requestedCursor > 0
    ? requestedCursor : null;
  const rows = await db.select({ notification: notificationsTable, recipient: notificationRecipientsTable })
    .from(notificationRecipientsTable).innerJoin(notificationsTable, eq(notificationRecipientsTable.notificationId, notificationsTable.id))
    .where(and(
      eq(notificationRecipientsTable.userId, localUser.id),
      eq(notificationsTable.clubId, clubId),
      ...(cursor ? [lt(notificationRecipientsTable.id, cursor)] : []),
    ))
    // Recipient IDs are monotonic and give a stable snapshot cursor even when
    // multiple notifications have identical timestamps.
    .orderBy(desc(notificationRecipientsTable.id)).limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const [unread] = await db.select({ value: count() })
    .from(notificationRecipientsTable).innerJoin(notificationsTable, eq(notificationRecipientsTable.notificationId, notificationsTable.id))
    .where(and(eq(notificationRecipientsTable.userId, localUser.id), eq(notificationsTable.clubId, clubId), isNull(notificationRecipientsTable.readAt)));
  return res.json({ unreadCount: unread.value, hasMore, nextCursor: hasMore ? page.at(-1)!.recipient.id : null, notifications: page.map(({ notification, recipient }) => ({
    id: notification.id, kind: notification.kind, title: notification.title, body: notification.body,
    deepLink: notification.deepLink, createdAt: notification.createdAt.toISOString(),
    readAt: recipient.readAt?.toISOString() ?? null, unread: !recipient.readAt,
  })) });
});

router.post("/notifications/read-all", requireAuth, async (req, res) => {
  const { localUser, clubId } = req as AuthedRequest;
  await db.update(notificationRecipientsTable).set({ readAt: new Date() })
    .from(notificationsTable)
    .where(and(eq(notificationRecipientsTable.notificationId, notificationsTable.id), eq(notificationRecipientsTable.userId, localUser.id), eq(notificationsTable.clubId, clubId), isNull(notificationRecipientsTable.readAt)));
  return res.status(204).end();
});

router.post("/notifications/:id/read", requireAuth, async (req, res) => {
  const { localUser, clubId } = req as AuthedRequest;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: "Notification not found" });
  const updated = await db.update(notificationRecipientsTable).set({ readAt: new Date() })
    .from(notificationsTable)
    .where(and(eq(notificationRecipientsTable.notificationId, notificationsTable.id), eq(notificationRecipientsTable.notificationId, id), eq(notificationRecipientsTable.userId, localUser.id), eq(notificationsTable.clubId, clubId)))
    .returning({ id: notificationRecipientsTable.id });
  if (!updated.length) return res.status(404).json({ error: "Notification not found" });
  return res.status(204).end();
});

router.get("/notifications/push-config", requireAuth, (_req, res) =>
  res.json({ enabled: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT), publicKey: process.env.VAPID_PUBLIC_KEY ?? null }),
);

router.post("/notifications/subscriptions", requireAuth, async (req, res) => {
  const { localUser } = req as AuthedRequest;
  const { endpoint, keys, contentEncoding } = req.body ?? {};
  if (typeof endpoint !== "string" || !endpoint || typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string")
    return res.status(400).json({ error: "A valid push subscription is required" });
  await db.insert(pushSubscriptionsTable).values({ userId: localUser.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, contentEncoding: typeof contentEncoding === "string" ? contentEncoding : null })
    .onConflictDoUpdate({ target: pushSubscriptionsTable.endpoint, set: { userId: localUser.id, p256dh: keys.p256dh, auth: keys.auth, contentEncoding: typeof contentEncoding === "string" ? contentEncoding : null, updatedAt: new Date() } });
  await db.update(usersTable).set({ pushNotificationsEnabled: true }).where(eq(usersTable.id, localUser.id));
  return res.status(204).end();
});

router.delete("/notifications/subscriptions", requireAuth, async (req, res) => {
  const { localUser } = req as AuthedRequest;
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== "string") return res.status(400).json({ error: "An endpoint is required" });
  await db.delete(pushSubscriptionsTable).where(and(eq(pushSubscriptionsTable.userId, localUser.id), eq(pushSubscriptionsTable.endpoint, endpoint)));
  return res.status(204).end();
});

router.patch("/notifications/preferences", requireAuth, async (req, res) => {
  const { localUser } = req as AuthedRequest;
  if (typeof req.body?.pushNotificationsEnabled !== "boolean") return res.status(400).json({ error: "pushNotificationsEnabled must be a boolean" });
  await db.update(usersTable).set({ pushNotificationsEnabled: req.body.pushNotificationsEnabled }).where(eq(usersTable.id, localUser.id));
  return res.status(204).end();
});

export default router;