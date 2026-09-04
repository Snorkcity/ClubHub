import { and, eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import {
  db, guardianshipsTable, notificationRecipientsTable, notificationsTable,
  pushSubscriptionsTable, teamMembersTable, teamsTable, usersTable,
} from "@workspace/db";

export type InvitedRole = "coaches" | "players" | "parents";

/** Resolves only users belonging to this club, including guardians of team players. */
export async function resolveTeamRecipients(
  clubId: number,
  teamId: number,
  roles: readonly InvitedRole[],
  actorId: number,
) {
  const [team] = await db.select({ id: teamsTable.id }).from(teamsTable)
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.clubId, clubId)));
  if (!team) return [];
  const ids = new Set<number>();
  const members = await db.select({ userId: teamMembersTable.userId, role: teamMembersTable.role })
    .from(teamMembersTable).innerJoin(usersTable, eq(teamMembersTable.userId, usersTable.id))
    .where(and(eq(teamMembersTable.teamId, teamId), eq(usersTable.clubId, clubId)));
  if (roles.includes("coaches")) {
    for (const member of members)
      if (member.role === "coach" || member.role === "manager") ids.add(member.userId);
  }
  if (roles.includes("players")) {
    for (const member of members) if (member.role === "player") ids.add(member.userId);
  }
  // Player event invitations are actionable by their linked guardians too;
  // `parents` additionally supports guardian-only invitations.
  if (roles.includes("players") || roles.includes("parents")) {
    const players = members.filter((m) => m.role === "player").map((m) => m.userId);
    if (players.length) {
      const guardians = await db.select({ guardianId: guardianshipsTable.guardianId })
        .from(guardianshipsTable).innerJoin(usersTable, eq(guardianshipsTable.guardianId, usersTable.id))
        .where(and(inArray(guardianshipsTable.playerId, players), eq(usersTable.clubId, clubId)));
      for (const guardian of guardians) ids.add(guardian.guardianId);
    }
  }
  ids.delete(actorId);
  return [...ids];
}

export async function resolvePostRecipients(clubId: number, teamIds: readonly number[], actorId: number) {
  const recipients = new Set<number>();
  for (const teamId of teamIds) {
    for (const id of await resolveTeamRecipients(clubId, teamId, ["coaches", "players", "parents"], actorId))
      recipients.add(id);
  }
  return [...recipients];
}

function configured() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
}

async function deliverPush(userIds: number[], payload: { title: string; body: string; deepLink: string }) {
  if (!configured() || !userIds.length) return;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  webpush.setVapidDetails(VAPID_SUBJECT!, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  const subscriptions = await db.select().from(pushSubscriptionsTable)
    .innerJoin(usersTable, eq(pushSubscriptionsTable.userId, usersTable.id))
    .where(and(inArray(pushSubscriptionsTable.userId, userIds), eq(usersTable.pushNotificationsEnabled, true)));
  const safe = JSON.stringify({ title: payload.title.slice(0, 100), body: payload.body.slice(0, 180), deepLink: payload.deepLink.startsWith("/") ? payload.deepLink : "/" });
  await Promise.allSettled(subscriptions.map(async ({ push_subscriptions: subscription }) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, safe);
    } catch (error: unknown) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410)
        await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, subscription.id));
    }
  }));
}

export async function createNotification(input: {
  clubId: number; actorId: number; kind: "event" | "post" | "development"; title: string; body: string;
  deepLink: string; recipientIds: number[];
}) {
  const recipientIds = [...new Set(input.recipientIds)].filter((id) => id !== input.actorId);
  if (!recipientIds.length) return;
  const [notification] = await db.insert(notificationsTable).values({
    ...input, title: input.title.slice(0, 100), body: input.body.slice(0, 180),
    deepLink: input.deepLink.startsWith("/") ? input.deepLink : "/",
  }).returning();
  await db.insert(notificationRecipientsTable).values(recipientIds.map((userId) => ({ notificationId: notification.id, userId })));
  // Notifications are durable before this intentionally best-effort operation.
  await deliverPush(recipientIds, notification).catch(() => undefined);
}