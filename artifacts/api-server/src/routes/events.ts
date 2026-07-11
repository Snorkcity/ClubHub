import { Router, type IRouter } from "express";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db, eventsTable, rsvpsTable, usersTable } from "@workspace/db";
import { CreateEventBody, UpdateEventBody, SetRsvpBody } from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { buildEvents } from "../lib/build";
import { getVisibleTeamIds, canActFor } from "../lib/queries";
import { canAccessTeam, isTeamStaff, isTeamMember } from "../lib/authz";
import { toPerson, iso } from "../lib/serialize";

const router: IRouter = Router();

router.get("/events/upcoming", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const visible = await getVisibleTeamIds(clubId, localUser.id, isClubAdmin);
  if (visible.length === 0) return res.json([]);
  const events = await db
    .select()
    .from(eventsTable)
    .where(
      and(
        inArray(eventsTable.teamId, visible),
        gte(eventsTable.startsAt, new Date()),
      ),
    )
    .orderBy(asc(eventsTable.startsAt))
    .limit(20);
  return res.json(await buildEvents(events, localUser.id));
});

router.get("/teams/:teamId/events", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const teamId = Number(req.params.teamId);
  if (!(await canAccessTeam(localUser.id, teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot view this team" });
  const events = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.teamId, teamId))
    .orderBy(asc(eventsTable.startsAt));
  return res.json(await buildEvents(events, localUser.id));
});

router.post("/teams/:teamId/events", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const teamId = Number(req.params.teamId);
  if (!(await isTeamStaff(localUser.id, teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "Only team staff can create events" });
  const body = CreateEventBody.parse(req.body);
  const [event] = await db
    .insert(eventsTable)
    .values({
      teamId,
      createdById: localUser.id,
      type: body.type,
      title: body.title,
      location: body.location ?? null,
      opponent: body.opponent ?? null,
      startsAt: new Date(body.startsAt),
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      notes: body.notes ?? null,
    })
    .returning();
  const [built] = await buildEvents([event], localUser.id);
  return res.status(201).json(built);
});

router.get("/events/:eventId", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const eventId = Number(req.params.eventId);
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId));
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await canAccessTeam(localUser.id, event.teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot view this event" });
  const [built] = await buildEvents([event], localUser.id);

  const rows = await db
    .select({ r: rsvpsTable, u: usersTable })
    .from(rsvpsTable)
    .innerJoin(usersTable, eq(rsvpsTable.userId, usersTable.id))
    .where(eq(rsvpsTable.eventId, eventId));

  return res.json({
    event: built,
    rsvps: rows.map(({ r, u }) => ({
      id: r.id,
      eventId: r.eventId,
      status: r.status,
      respondedAt: iso(r.respondedAt),
      person: toPerson(u),
    })),
  });
});

router.patch("/events/:eventId", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const eventId = Number(req.params.eventId);
  const [existing] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId));
  if (!existing) return res.status(404).json({ error: "Event not found" });
  if (!(await isTeamStaff(localUser.id, existing.teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot edit this event" });
  const body = UpdateEventBody.parse(req.body);
  const patch: Record<string, unknown> = { ...body };
  if (body.startsAt) patch.startsAt = new Date(body.startsAt);
  if (body.endsAt) patch.endsAt = new Date(body.endsAt);
  const [event] = await db
    .update(eventsTable)
    .set(patch)
    .where(eq(eventsTable.id, eventId))
    .returning();
  const [built] = await buildEvents([event], localUser.id);
  return res.json(built);
});

router.delete("/events/:eventId", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const eventId = Number(req.params.eventId);
  const [existing] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId));
  if (!existing) return res.status(404).json({ error: "Event not found" });
  if (!(await isTeamStaff(localUser.id, existing.teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot delete this event" });
  await db.delete(rsvpsTable).where(eq(rsvpsTable.eventId, eventId));
  await db.delete(eventsTable).where(eq(eventsTable.id, eventId));
  return res.status(204).send();
});

router.put("/events/:eventId/rsvp", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const eventId = Number(req.params.eventId);
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId));
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await canAccessTeam(localUser.id, event.teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot respond to this event" });

  const body = SetRsvpBody.parse(req.body);
  const targetId = body.onBehalfOfPersonId ?? localUser.id;
  if (!(await canActFor(localUser.id, targetId, isClubAdmin))) {
    return res
      .status(403)
      .json({ error: "You cannot respond on behalf of this person" });
  }
  if (!(await isTeamMember(targetId, event.teamId))) {
    return res
      .status(400)
      .json({ error: "That person is not on this team" });
  }

  const [rsvp] = await db
    .insert(rsvpsTable)
    .values({ eventId, userId: targetId, status: body.status })
    .onConflictDoUpdate({
      target: [rsvpsTable.eventId, rsvpsTable.userId],
      set: { status: body.status, respondedAt: new Date() },
    })
    .returning();
  const [u] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, targetId));

  return res.json({
    id: rsvp.id,
    eventId: rsvp.eventId,
    status: rsvp.status,
    respondedAt: iso(rsvp.respondedAt),
    person: toPerson(u),
  });
});

export default router;
