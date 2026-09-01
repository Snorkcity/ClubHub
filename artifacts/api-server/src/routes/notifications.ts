import { Router, type IRouter } from "express";
import { and, count, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { db, notificationRecipientsTable, notificationsTable, pushSubscriptionsTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../lib/auth";

const router: IRouter = Router();
const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const PUSH_SERVICE_HOSTS = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
]);

function isTrustedPushEndpoint(endpoint: string) {
  if (!endpoint || endpoint.length > 4096) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && (
      PUSH_SERVICE_HOSTS.has(url.hostname) ||
      url.hostname.endsWith(".notify.windows.com")
    );
  } catch {
    return false;
  }
}

function isValidPushKey(value: unknown, minLength: number, maxLength: number) {
  return typeof value === "string" &&
    value.length >= minLength &&
    value.length <= maxLength &&
    BASE64URL_PATTERN.test(value);
}

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
  if (
    typeof endpoint !== "string" ||
    !isTrustedPushEndpoint(endpoint) ||
    !isValidPushKey(keys?.p256dh, 40, 256) ||
    !isValidPushKey(keys?.auth, 8, 128) ||
    (contentEncoding != null && (
      typeof contentEncoding !== "string" ||
      !/^[a-z0-9-]{1,32}$/.test(contentEncoding)
    ))
  )
    return res.status(400).json({ error: "A valid push subscription is required" });
  await db.transaction(async (tx) => {
    await tx.insert(pushSubscriptionsTable).values({
      userId: localUser.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      contentEncoding: typeof contentEncoding === "string" ? contentEncoding : null,
    }).onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: {
        userId: localUser.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        contentEncoding: typeof contentEncoding === "string" ? contentEncoding : null,
        updatedAt: new Date(),
      },
    });
    const subscriptions = await tx.select({ id: pushSubscriptionsTable.id })
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.userId, localUser.id))
      .orderBy(desc(pushSubscriptionsTable.updatedAt), desc(pushSubscriptionsTable.id));
    const expiredIds = subscriptions
      .slice(MAX_PUSH_SUBSCRIPTIONS_PER_USER)
      .map(({ id }) => id);
    if (expiredIds.length) {
      await tx.delete(pushSubscriptionsTable)
        .where(inArray(pushSubscriptionsTable.id, expiredIds));
    }
    await tx.update(usersTable)
      .set({ pushNotificationsEnabled: true })
      .where(eq(usersTable.id, localUser.id));
  });
  return res.status(204).end();
});

router.delete("/notifications/subscriptions", requireAuth, async (req, res) => {
  const { localUser } = req as AuthedRequest;
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== "string") return res.status(400).json({ error: "An endpoint is required" });
  await db.transaction(async (tx) => {
    await tx.delete(pushSubscriptionsTable).where(and(eq(pushSubscriptionsTable.userId, localUser.id), eq(pushSubscriptionsTable.endpoint, endpoint)));
    const remaining = await tx.select({ id: pushSubscriptionsTable.id })
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.userId, localUser.id))
      .limit(1);
    await tx.update(usersTable)
      .set({ pushNotificationsEnabled: remaining.length > 0 })
      .where(eq(usersTable.id, localUser.id));
  });
  return res.status(204).end();
});

router.patch("/notifications/preferences", requireAuth, async (req, res) => {
  const { localUser } = req as AuthedRequest;
  if (typeof req.body?.pushNotificationsEnabled !== "boolean") return res.status(400).json({ error: "pushNotificationsEnabled must be a boolean" });
  await db.update(usersTable).set({ pushNotificationsEnabled: req.body.pushNotificationsEnabled }).where(eq(usersTable.id, localUser.id));
  return res.status(204).end();
});

export default router;