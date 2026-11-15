import { Router, type IRouter } from "express";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import {
  db, eventsTable, notificationRecipientsTable, notificationsTable,
  rsvpsTable, teamMembersTable, usersTable,
} from "@workspace/db";
import { SendEventRemindersBody, SendEventRemindersResponse } from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { isTeamStaff } from "../lib/authz";
import { personBelongsToClub } from "../lib/club-membership";
import { deliverPush } from "../lib/notifications";

const router: IRouter = Router();

router.post("/events/:eventId/reminders", requireAuth, async (req, res): Promise<void> => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const eventId = Number(req.params.eventId);
  const parsed = SendEventRemindersBody.safeParse(req.body);
  if (!Number.isSafeInteger(eventId) || eventId <= 0 || !parsed.success ||
      !parsed.data.personIds.every(Number.isSafeInteger)) {
    res.status(400).json({ error: "Choose the players to remind." });
    return;
  }
  const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  if (!(await isTeamStaff(localUser.id, event.teamId, clubId, isClubAdmin))) {
    res.status(403).json({ error: "Only this team's staff or club admin can send reminders." });
    return;
  }

  const personIds = [...new Set(parsed.data.personIds)];
  // Serialize sends for this event so double-clicks and other staff cannot
  // bypass the per-player cooldown. No new tables or scheduled jobs needed.
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(eventsTable)
      .where(eq(eventsTable.id, eventId)).for("update");
    if (!current || current.cancelledAt || current.startsAt <= new Date()) {
      return { error: "Reminders are only available before an uncancelled session starts.", status: 409 } as const;
    }
    if (!current.invitedRoles.split(",").includes("players")) {
      return { error: "Players are not invited to this session.", status: 400 } as const;
    }
    const players = await tx.selectDistinct({ id: usersTable.id })
      .from(teamMembersTable).innerJoin(usersTable, eq(usersTable.id, teamMembersTable.userId))
      .where(and(
        eq(teamMembersTable.teamId, current.teamId), eq(teamMembersTable.role, "player"),
        inArray(usersTable.id, personIds), personBelongsToClub(clubId),
        // A staff member who also has a player membership is not in the
        // unanswered-player list (staff roles take precedence there).
        sql`not exists (select 1 from ${teamMembersTable} staff
          where staff.team_id = ${current.teamId} and staff.user_id = ${usersTable.id}
          and staff.role in ('coach', 'manager'))`,
      ));
    if (players.length !== personIds.length) {
      return { error: "Choose only current players on this session's team.", status: 400 } as const;
    }
    const deepLink = `/events/${eventId}`;
    const responded = await tx.select({ id: rsvpsTable.userId }).from(rsvpsTable)
      .where(and(eq(rsvpsTable.eventId, eventId), inArray(rsvpsTable.userId, personIds)));
    const recent = await tx.select({ id: notificationRecipientsTable.userId })
      .from(notificationRecipientsTable)
      .innerJoin(notificationsTable, eq(notificationsTable.id, notificationRecipientsTable.notificationId))
      .where(and(
        eq(notificationsTable.clubId, clubId), eq(notificationsTable.kind, "event_reminder"),
        eq(notificationsTable.deepLink, deepLink),
        gte(notificationsTable.createdAt, new Date(Date.now() - 10 * 60_000)),
        inArray(notificationRecipientsTable.userId, personIds),
      ));
    const skip = new Set([...responded, ...recent].map((r) => r.id));
    const recipientIds = personIds.filter((id) => id !== localUser.id && !skip.has(id));
    if (!recipientIds.length) return { recipientIds, notification: null };
    const [notification] = await tx.insert(notificationsTable).values({
      clubId, actorId: localUser.id, kind: "event_reminder",
      title: "Please mark your availability",
      body: `Please mark Going or Not going for ${current.title}.`.slice(0, 180),
      deepLink,
    }).returning();
    await tx.insert(notificationRecipientsTable).values(recipientIds.map((userId) => ({
      notificationId: notification.id, userId,
    })));
    return { recipientIds, notification };
  });
  if (result.status !== undefined) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  // Durable in-app notification first; push remains permission-dependent.
  if (result.notification) {
    await deliverPush(result.recipientIds, result.notification)
      .catch(() => req.log.warn({ eventId }, "Reminder push delivery failed"));
  }
  res.json(SendEventRemindersResponse.parse({
    sentCount: result.recipientIds.length,
    skippedCount: personIds.length - result.recipientIds.length,
  }));
});

export default router;
