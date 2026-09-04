import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import {
  db,
  clubMembersTable,
  developmentAssessmentsTable,
  developmentCycleAssessorsTable,
  developmentCyclesTable,
  developmentReportsTable,
  guardianshipsTable,
  teamMembersTable,
  teamsTable,
  usersTable,
  type DevelopmentAssessment,
  type DevelopmentCycle,
  type DevelopmentReport,
  type User,
} from "@workspace/db";
import {
  CreateDevelopmentCycleBody,
  SaveDevelopmentAssessmentBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { getTeamInClub, isTeamStaff } from "../lib/authz";
import { createNotification } from "../lib/notifications";
import {
  DEVELOPMENT_DISCLOSURE,
  DEVELOPMENT_RUBRIC,
  familyCategories,
  type RatingKey,
} from "../lib/development";

const router: IRouter = Router();
const APP_URL = process.env.WEB_APP_URL || "https://app.nahreo.com";

const person = (u: User) => ({
  id: u.id,
  firstName: u.firstName,
  lastName: u.lastName,
  fullName: `${u.firstName} ${u.lastName}`,
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]!,
  );
}

async function cycleContext(cycleId: number, clubId: number) {
  const [cycle] = await db.select().from(developmentCyclesTable)
    .innerJoin(teamsTable, eq(developmentCyclesTable.teamId, teamsTable.id))
    .where(and(eq(developmentCyclesTable.id, cycleId), eq(developmentCyclesTable.clubId, clubId), eq(teamsTable.clubId, clubId)));
  if (!cycle) return null;
  const assessorRows = await db.select({ userId: developmentCycleAssessorsTable.userId })
    .from(developmentCycleAssessorsTable).where(eq(developmentCycleAssessorsTable.cycleId, cycleId));
  return { cycle: cycle.development_cycles, assessorIds: assessorRows.map((x) => x.userId) };
}

function access(cycle: DevelopmentCycle, assessorIds: number[], userId: number, isAdmin: boolean) {
  const administer = isAdmin || cycle.createdById === userId;
  const selected = assessorIds.includes(userId);
  return {
    canView: administer || selected,
    canEdit: cycle.status === "active" && (administer || selected),
    canSubmit: cycle.status === "active" && (administer || selected),
    canReviewReports: cycle.status === "submitted" && (administer || selected),
    canRelease: (cycle.status === "submitted" || cycle.status === "released") && administer,
  };
}

/** Internal recipients must remain privileged club staff, even for legacy rows. */
async function isEligibleInternalRecipient(userId: number, clubId: number) {
  const [admin] = await db.select({ id: clubMembersTable.id }).from(clubMembersTable)
    .where(and(eq(clubMembersTable.clubId, clubId), eq(clubMembersTable.userId, userId), eq(clubMembersTable.role, "admin")));
  if (admin) return true;
  const [staff] = await db.select({ id: teamMembersTable.id }).from(teamMembersTable)
    .innerJoin(teamsTable, eq(teamMembersTable.teamId, teamsTable.id))
    .innerJoin(usersTable, eq(teamMembersTable.userId, usersTable.id))
    .where(and(eq(teamMembersTable.userId, userId), eq(teamsTable.clubId, clubId), eq(usersTable.clubId, clubId), inArray(teamMembersTable.role, ["coach", "manager"])));
  return !!staff;
}

async function canViewCycle(cycle: DevelopmentCycle, assessorIds: number[], userId: number, isAdmin: boolean) {
  if (access(cycle, assessorIds, userId, isAdmin).canView) return true;
  return cycle.status !== "active" && cycle.internalRecipientId === userId &&
    isEligibleInternalRecipient(userId, cycle.clubId);
}

function isSerializationFailure(error: unknown) {
  return (error as { code?: string } | undefined)?.code === "40001";
}

async function serializable<T>(work: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (!isSerializationFailure(error) || attempt === 2) throw error;
    }
  }
  throw lastError;
}

async function buildDetail(cycle: DevelopmentCycle, assessorIds: number[], actorId: number, isAdmin: boolean, recipientRead = false) {
  const rosterRows = await db.select({ user: usersTable }).from(teamMembersTable)
    .innerJoin(usersTable, eq(teamMembersTable.userId, usersTable.id))
    .where(and(eq(teamMembersTable.teamId, cycle.teamId), eq(teamMembersTable.role, "player")));
  const staffRows = await db.select({ user: usersTable }).from(teamMembersTable)
    .innerJoin(usersTable, eq(teamMembersTable.userId, usersTable.id))
    .where(and(eq(teamMembersTable.teamId, cycle.teamId), inArray(teamMembersTable.role, ["coach", "manager"])));
  const allUserIds = [...new Set([cycle.createdById, ...assessorIds, ...(cycle.internalRecipientId ? [cycle.internalRecipientId] : [])])];
  const named = await db.select().from(usersTable).where(and(eq(usersTable.clubId, cycle.clubId), inArray(usersTable.id, allUserIds)));
  const byId = new Map(named.map((u) => [u.id, u]));
  const assessments = await db.select().from(developmentAssessmentsTable)
    .where(eq(developmentAssessmentsTable.cycleId, cycle.id));
  const editors = [...new Set(assessments.map((a) => a.updatedById))];
  if (editors.length) {
    const users = await db.select().from(usersTable).where(and(eq(usersTable.clubId, cycle.clubId), inArray(usersTable.id, editors)));
    for (const user of users) byId.set(user.id, user);
  }
  const assessmentByPlayer = new Map(assessments.map((a) => [a.playerId, a]));
  const caps = access(cycle, assessorIds, actorId, isAdmin);
  if (recipientRead) caps.canView = true;
  const toAssessment = (a: DevelopmentAssessment) => ({
    id: a.id,
    technical: a.technical,
    tactical: a.tactical,
    physical: a.physical,
    coachabilityMindset: a.coachabilityMindset,
    effortConsistency: a.effortConsistency,
    teamworkCommunication: a.teamworkCommunication,
    attendanceReliability: a.attendanceReliability,
    strength: a.strength,
    focus: a.focus,
    internalNotes: a.internalNotes,
    player: person(rosterRows.find((r) => r.user.id === a.playerId)!.user),
    updatedBy: person(byId.get(a.updatedById)!),
    updatedAt: a.updatedAt.toISOString(),
  });
  return {
    id: cycle.id,
    teamId: cycle.teamId,
    title: cycle.title,
    reportingPeriod: cycle.reportingPeriod,
    status: cycle.status,
    createdBy: person(byId.get(cycle.createdById)!),
    assessors: assessorIds.map((id) => person(byId.get(id)!)),
    internalRecipient: cycle.internalRecipientId ? person(byId.get(cycle.internalRecipientId)!) : null,
    completedPlayers: assessments.filter((a) => rosterRows.some((r) => r.user.id === a.playerId)).length,
    totalPlayers: rosterRows.length,
    reviewedReports: assessments.filter((a) => a.reviewedAt && a.familyDraftCategories && a.familyStrength && a.familyFocus).length,
    totalReports: rosterRows.length,
    capabilities: caps,
    submittedAt: cycle.submittedAt?.toISOString() ?? null,
    releasedAt: cycle.releasedAt?.toISOString() ?? null,
    createdAt: cycle.createdAt.toISOString(),
    assessorChoices: staffRows.map((r) => person(r.user)),
    players: rosterRows.map(({ user }) => {
      const assessment = assessmentByPlayer.get(user.id);
      const reportDraft =
        cycle.status !== "active" &&
        assessment?.familyDraftCategories &&
        assessment.familyStrength &&
        assessment.familyFocus
          ? {
              player: person(user),
              categories: assessment.familyDraftCategories,
              strength: assessment.familyStrength,
              focus: assessment.familyFocus,
              reviewedAt: assessment.reviewedAt?.toISOString() ?? null,
            }
          : null;
      return {
        person: person(user),
        complete: !!assessment,
        assessment: assessment ? toAssessment(assessment) : null,
        reportDraft,
      };
    }),
    rubric: DEVELOPMENT_RUBRIC,
  };
}

router.get("/teams/:teamId/development-cycles", requireAuth, async (req, res): Promise<void> => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const teamId = Number(req.params.teamId);
  if (!(await getTeamInClub(teamId, clubId))) { res.status(404).json({ error: "Team not found" }); return; }
  const cycles = await db.select().from(developmentCyclesTable)
    .where(and(eq(developmentCyclesTable.teamId, teamId), eq(developmentCyclesTable.clubId, clubId)))
    .orderBy(desc(developmentCyclesTable.createdAt));
  const visible = [];
  for (const cycle of cycles) {
    const context = await cycleContext(cycle.id, clubId);
    if (!context || !(await canViewCycle(cycle, context.assessorIds, localUser.id, isClubAdmin))) continue;
    const recipientRead = !access(cycle, context.assessorIds, localUser.id, isClubAdmin).canView;
    const detail = await buildDetail(cycle, context.assessorIds, localUser.id, isClubAdmin, recipientRead);
    const { assessorChoices: _choices, players: _players, rubric: _rubric, ...summary } = detail;
    visible.push(summary);
  }
  res.json(visible);
});

router.post("/teams/:teamId/development-cycles", requireAuth, async (req, res): Promise<void> => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const teamId = Number(req.params.teamId);
  const parsed = CreateDevelopmentCycleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!(await isTeamStaff(localUser.id, teamId, clubId, isClubAdmin))) {
    res.status(403).json({ error: "Only team staff or club admins can create a development cycle" }); return;
  }
  const team = await getTeamInClub(teamId, clubId);
  if (!team) { res.status(404).json({ error: "Team not found" }); return; }
  const assessors = await db.select({ userId: teamMembersTable.userId }).from(teamMembersTable)
    .innerJoin(usersTable, eq(teamMembersTable.userId, usersTable.id))
    .where(and(eq(teamMembersTable.teamId, teamId), inArray(teamMembersTable.role, ["coach", "manager"]), inArray(teamMembersTable.userId, parsed.data.assessorIds), eq(usersTable.clubId, clubId)));
  if (new Set(assessors.map((x) => x.userId)).size !== parsed.data.assessorIds.length) {
    res.status(400).json({ error: "Every assessor must be a coach or manager on this team" }); return;
  }
  if (parsed.data.internalRecipientId) {
    if (!(await isEligibleInternalRecipient(parsed.data.internalRecipientId, clubId))) {
      res.status(400).json({ error: "Internal recipient must be a current club admin, coach, or manager" }); return;
    }
  }
  const cycle = await db.transaction(async (tx) => {
    const [created] = await tx.insert(developmentCyclesTable).values({
      clubId, teamId, createdById: localUser.id, title: parsed.data.title.trim(),
      reportingPeriod: parsed.data.reportingPeriod.trim(),
      internalRecipientId: parsed.data.internalRecipientId ?? null,
    }).returning();
    await tx.insert(developmentCycleAssessorsTable).values(parsed.data.assessorIds.map((userId) => ({ cycleId: created.id, userId })));
    return created;
  });
  res.status(201).json(await buildDetail(cycle, parsed.data.assessorIds, localUser.id, isClubAdmin));
});

router.get("/teams/:teamId/development-recipient-candidates", requireAuth, async (req, res): Promise<void> => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const teamId = Number(req.params.teamId);
  if (!(await isTeamStaff(localUser.id, teamId, clubId, isClubAdmin))) {
    res.status(403).json({ error: "Only team staff or club admins can view recipient candidates" }); return;
  }
  const admins = await db.select({ userId: clubMembersTable.userId }).from(clubMembersTable)
    .where(and(eq(clubMembersTable.clubId, clubId), eq(clubMembersTable.role, "admin")));
  const staff = await db.select({ userId: teamMembersTable.userId }).from(teamMembersTable)
    .innerJoin(teamsTable, eq(teamMembersTable.teamId, teamsTable.id))
    .innerJoin(usersTable, eq(teamMembersTable.userId, usersTable.id))
    .where(and(
      eq(teamsTable.clubId, clubId),
      eq(usersTable.clubId, clubId),
      inArray(teamMembersTable.role, ["coach", "manager"]),
    ));
  const candidateIds = [...new Set([...admins.map((row) => row.userId), ...staff.map((row) => row.userId)])];
  const candidates = candidateIds.length
    ? await db.select().from(usersTable)
      .where(and(eq(usersTable.clubId, clubId), inArray(usersTable.id, candidateIds)))
      .orderBy(usersTable.lastName, usersTable.firstName)
    : [];
  res.json(candidates.map(person));
});

router.get("/development-cycles/:cycleId", requireAuth, async (req, res): Promise<void> => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const context = await cycleContext(Number(req.params.cycleId), clubId);
  if (!context) { res.status(404).json({ error: "Development cycle not found" }); return; }
  if (!(await canViewCycle(context.cycle, context.assessorIds, localUser.id, isClubAdmin))) {
    res.status(403).json({ error: "You do not have access to this development cycle" }); return;
  }
  const recipientRead = !access(context.cycle, context.assessorIds, localUser.id, isClubAdmin).canView;
  res.json(await buildDetail(context.cycle, context.assessorIds, localUser.id, isClubAdmin, recipientRead));
});

router.put("/development-cycles/:cycleId/players/:playerId/assessment", requireAuth, async (req, res): Promise<void> => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const cycleId = Number(req.params.cycleId);
  const playerId = Number(req.params.playerId);
  const parsed = SaveDevelopmentAssessmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select({ cycle: developmentCyclesTable }).from(developmentCyclesTable)
      .innerJoin(teamsTable, eq(developmentCyclesTable.teamId, teamsTable.id))
      .where(and(eq(developmentCyclesTable.id, cycleId), eq(developmentCyclesTable.clubId, clubId), eq(teamsTable.clubId, clubId)))
      .for("update");
    if (!row) return { kind: "missing" as const };
    const assessors = await tx.select({ userId: developmentCycleAssessorsTable.userId }).from(developmentCycleAssessorsTable)
      .where(eq(developmentCycleAssessorsTable.cycleId, cycleId));
    if (!access(row.cycle, assessors.map((a) => a.userId), localUser.id, isClubAdmin).canEdit)
      return { kind: row.cycle.status === "active" ? "forbidden" as const : "locked" as const };
    const [player] = await tx.select({ user: usersTable }).from(teamMembersTable)
      .innerJoin(usersTable, eq(teamMembersTable.userId, usersTable.id))
      .where(and(eq(teamMembersTable.teamId, row.cycle.teamId), eq(teamMembersTable.userId, playerId), eq(teamMembersTable.role, "player"), eq(usersTable.clubId, clubId)));
    if (!player) return { kind: "player" as const };
    const [saved] = await tx.insert(developmentAssessmentsTable).values({
      cycleId, playerId, ...parsed.data, internalNotes: parsed.data.internalNotes ?? null, updatedById: localUser.id,
    }).onConflictDoUpdate({
      target: [developmentAssessmentsTable.cycleId, developmentAssessmentsTable.playerId],
      set: { ...parsed.data, internalNotes: parsed.data.internalNotes ?? null, updatedById: localUser.id, updatedAt: new Date() },
    }).returning();
    return { kind: "saved" as const, saved, player: player.user };
  });
  if (result.kind === "missing") { res.status(404).json({ error: "Development cycle not found" }); return; }
  if (result.kind === "forbidden") { res.status(403).json({ error: "You are not a selected assessor" }); return; }
  if (result.kind === "locked") { res.status(409).json({ error: "Submitted assessments are locked" }); return; }
  if (result.kind === "player") { res.status(400).json({ error: "Player is not on this team" }); return; }
  const saved = result.saved!;
  const player = result.player!;
  res.json({
    id: saved.id, ...parsed.data, internalNotes: saved.internalNotes, player: person(player),
    updatedBy: person(localUser), updatedAt: saved.updatedAt.toISOString(),
  });
});

router.put("/development-cycles/:cycleId/players/:playerId/report-draft", requireAuth, async (req, res): Promise<void> => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const cycleId = Number(req.params.cycleId);
  const playerId = Number(req.params.playerId);
  const body = req.body as { categories?: { key?: string; narrative?: string }[]; strength?: unknown; focus?: unknown };
  const requiredKeys = DEVELOPMENT_RUBRIC.map((r) => r.key);
  if (!Array.isArray(body.categories) || body.categories.length !== requiredKeys.length ||
      new Set(body.categories.map((c) => c.key)).size !== requiredKeys.length ||
      !requiredKeys.every((key) => body.categories!.some((c) => c.key === key && typeof c.narrative === "string" && c.narrative.trim().length > 0 && c.narrative.length <= 1000)) ||
      typeof body.strength !== "string" || !body.strength.trim() || body.strength.length > 2000 ||
      typeof body.focus !== "string" || !body.focus.trim() || body.focus.length > 2000) {
    res.status(400).json({ error: "Provide one narrative for each canonical category plus family strength and focus" }); return;
  }
  const familyStrength = body.strength.trim();
  const familyFocus = body.focus.trim();
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select({ cycle: developmentCyclesTable }).from(developmentCyclesTable)
      .innerJoin(teamsTable, eq(developmentCyclesTable.teamId, teamsTable.id))
      .where(and(eq(developmentCyclesTable.id, cycleId), eq(developmentCyclesTable.clubId, clubId), eq(teamsTable.clubId, clubId))).for("update");
    if (!row) return { kind: "missing" as const };
    const assessors = await tx.select({ userId: developmentCycleAssessorsTable.userId }).from(developmentCycleAssessorsTable).where(eq(developmentCycleAssessorsTable.cycleId, cycleId));
    if (!access(row.cycle, assessors.map((a) => a.userId), localUser.id, isClubAdmin).canReviewReports)
      return { kind: row.cycle.status === "submitted" ? "forbidden" as const : "locked" as const };
    const [assessment] = await tx.select().from(developmentAssessmentsTable)
      .where(and(eq(developmentAssessmentsTable.cycleId, cycleId), eq(developmentAssessmentsTable.playerId, playerId))).for("update");
    const [player] = await tx.select().from(usersTable).where(and(eq(usersTable.id, playerId), eq(usersTable.clubId, clubId)));
    if (!assessment || !player || !assessment.familyDraftCategories) return { kind: "missingAssessment" as const };
    const narratives = new Map(body.categories!.map((c) => [c.key!, c.narrative!.trim()]));
    const categories = assessment.familyDraftCategories.map((category) => ({ ...category, narrative: narratives.get(category.key)! }));
    const [saved] = await tx.update(developmentAssessmentsTable).set({
      familyDraftCategories: categories, familyStrength, familyFocus,
      reviewedAt: new Date(), reviewedById: localUser.id,
    }).where(eq(developmentAssessmentsTable.id, assessment.id)).returning();
    return { kind: "saved" as const, saved, player };
  });
  if (result.kind === "missing") { res.status(404).json({ error: "Development cycle not found" }); return; }
  if (result.kind === "forbidden") { res.status(403).json({ error: "You are not a selected assessor" }); return; }
  if (result.kind === "locked") { res.status(409).json({ error: "Family drafts can only be reviewed after submission and before release" }); return; }
  if (result.kind === "missingAssessment") { res.status(404).json({ error: "Assessment draft not found" }); return; }
  res.json({ player: person(result.player!), categories: result.saved!.familyDraftCategories, strength: result.saved!.familyStrength, focus: result.saved!.familyFocus, reviewedAt: result.saved!.reviewedAt!.toISOString() });
});

router.post("/development-cycles/:cycleId/submit", requireAuth, async (req, res): Promise<void> => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const cycleId = Number(req.params.cycleId);
  let outcome:
    | { kind: "missing" | "forbidden" | "locked" }
    | { kind: "incomplete"; missing: number }
    | { kind: "submitted"; cycle: DevelopmentCycle; assessorIds: number[] };
  try {
    outcome = await serializable(() => db.transaction(async (tx) => {
      const [row] = await tx.select({ cycle: developmentCyclesTable }).from(developmentCyclesTable)
        .innerJoin(teamsTable, eq(developmentCyclesTable.teamId, teamsTable.id))
        .where(and(eq(developmentCyclesTable.id, cycleId), eq(developmentCyclesTable.clubId, clubId), eq(teamsTable.clubId, clubId)))
        .for("update");
      if (!row) return { kind: "missing" as const };
      const assessors = await tx.select({ userId: developmentCycleAssessorsTable.userId }).from(developmentCycleAssessorsTable)
        .where(eq(developmentCycleAssessorsTable.cycleId, cycleId));
      const assessorIds = assessors.map((a) => a.userId);
      if (!access(row.cycle, assessorIds, localUser.id, isClubAdmin).canSubmit)
        return { kind: row.cycle.status === "active" ? "forbidden" as const : "locked" as const };
      // Serializable isolation plus row locks makes the roster snapshot and
      // assessment completeness check one atomic submission decision.
      const players = await tx.select({ userId: teamMembersTable.userId }).from(teamMembersTable)
        .where(and(eq(teamMembersTable.teamId, row.cycle.teamId), eq(teamMembersTable.role, "player"))).for("update");
      const assessments = await tx.select().from(developmentAssessmentsTable)
        .where(eq(developmentAssessmentsTable.cycleId, cycleId)).for("update");
      const completed = new Set(assessments.map((a) => a.playerId));
      const missing = players.filter((p) => !completed.has(p.userId)).length;
      if (missing) return { kind: "incomplete" as const, missing };
      // Submission creates an unreviewed, family-safe draft from the shared
      // assessment. Review is explicitly required before release.
      for (const assessment of assessments) {
        const ratings = Object.fromEntries(DEVELOPMENT_RUBRIC.map((r) => [r.key, assessment[r.key]])) as Record<RatingKey, number>;
        await tx.update(developmentAssessmentsTable).set({
          familyDraftCategories: familyCategories(ratings),
          familyStrength: assessment.strength,
          familyFocus: assessment.focus,
          reviewedAt: null,
          reviewedById: null,
        }).where(eq(developmentAssessmentsTable.id, assessment.id));
      }
      const [submitted] = await tx.update(developmentCyclesTable)
        .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(developmentCyclesTable.id, cycleId), eq(developmentCyclesTable.status, "active"))).returning();
      if (!submitted) return { kind: "locked" as const };
      return { kind: "submitted" as const, cycle: submitted, assessorIds };
    }, { isolationLevel: "serializable" }));
  } catch (error) {
    if (isSerializationFailure(error)) { res.status(409).json({ error: "The roster changed while submitting; review completion and try again" }); return; }
    throw error;
  }
  if (outcome.kind === "missing") { res.status(404).json({ error: "Development cycle not found" }); return; }
  if (outcome.kind === "forbidden") { res.status(403).json({ error: "You are not a selected assessor" }); return; }
  if (outcome.kind === "locked") { res.status(409).json({ error: "Cycle has already been submitted" }); return; }
  if (outcome.kind === "incomplete") { res.status(409).json({ error: `All current players must be completed before submission (${outcome.missing} remaining)` }); return; }
  if (outcome.kind !== "submitted") { res.status(409).json({ error: "Cycle has already been submitted" }); return; }
  res.json(await buildDetail(outcome.cycle, outcome.assessorIds, localUser.id, isClubAdmin));
});

async function reportJson(report: DevelopmentReport) {
  const coaches = await db.select({ user: usersTable }).from(developmentCycleAssessorsTable)
    .innerJoin(usersTable, eq(developmentCycleAssessorsTable.userId, usersTable.id))
    .where(eq(developmentCycleAssessorsTable.cycleId, report.cycleId));
  return {
    id: report.id,
    cycleId: report.cycleId,
    player: { id: report.playerId, firstName: report.playerFirstName, lastName: report.playerFullName.slice(report.playerFirstName.length).trim(), fullName: report.playerFullName },
    coachingTeam: coaches.map((row) => person(row.user)),
    reportingPeriod: report.reportingPeriod,
    categories: report.categories,
    strength: report.strength,
    focus: report.focus,
    disclosure: report.disclosure,
    releasedAt: report.releasedAt.toISOString(),
  };
}

async function canReadReport(report: DevelopmentReport, userId: number, clubId: number, isAdmin: boolean) {
  const context = await cycleContext(report.cycleId, clubId);
  if (!context) return false;
  if (isAdmin || report.playerId === userId || context.cycle.createdById === userId ||
      context.assessorIds.includes(userId)) return true;
  if (context.cycle.internalRecipientId === userId &&
      await isEligibleInternalRecipient(userId, clubId)) return true;
  const [guardian] = await db.select({ id: guardianshipsTable.id }).from(guardianshipsTable)
    .where(and(eq(guardianshipsTable.guardianId, userId), eq(guardianshipsTable.playerId, report.playerId), eq(guardianshipsTable.canManage, true)));
  return !!guardian;
}

router.post("/development-cycles/:cycleId/release", requireAuth, async (req, res): Promise<void> => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const cycleId = Number(req.params.cycleId);
  const releasedAt = new Date();
  let outcome:
    | { kind: "missing" }
    | { kind: "forbidden" }
    | { kind: "notSubmitted" }
    | { kind: "incompleteReviews"; remaining: number }
    | { kind: "alreadyReleased"; reportCount: number }
    | { kind: "claimed"; reports: DevelopmentReport[]; cycle: DevelopmentCycle };
  outcome = await db.transaction(async (tx) => {
    const [locked] = await tx.select({ cycle: developmentCyclesTable }).from(developmentCyclesTable)
      .innerJoin(teamsTable, eq(developmentCyclesTable.teamId, teamsTable.id))
      .where(and(eq(developmentCyclesTable.id, cycleId), eq(developmentCyclesTable.clubId, clubId), eq(teamsTable.clubId, clubId)))
      .for("update");
    if (!locked) return { kind: "missing" as const };
    const assessorRows = await tx.select({ userId: developmentCycleAssessorsTable.userId }).from(developmentCycleAssessorsTable)
      .where(eq(developmentCycleAssessorsTable.cycleId, cycleId));
    if (!access(locked.cycle, assessorRows.map((a) => a.userId), localUser.id, isClubAdmin).canRelease)
      return { kind: "forbidden" as const };
    if (locked.cycle.status === "released") {
      const existing = await tx.select({ id: developmentReportsTable.id }).from(developmentReportsTable)
        .where(eq(developmentReportsTable.cycleId, cycleId));
      return { kind: "alreadyReleased" as const, reportCount: existing.length };
    }
    if (locked.cycle.status !== "submitted") return { kind: "notSubmitted" as const };
    const assessments = await tx.select({ assessment: developmentAssessmentsTable, player: usersTable })
      .from(developmentAssessmentsTable).innerJoin(usersTable, eq(developmentAssessmentsTable.playerId, usersTable.id))
      .where(and(eq(developmentAssessmentsTable.cycleId, cycleId), eq(usersTable.clubId, clubId)));
    const remaining = assessments.filter(({ assessment }) =>
      !assessment.reviewedAt || !assessment.familyDraftCategories || !assessment.familyStrength || !assessment.familyFocus,
    ).length;
    if (remaining) return { kind: "incompleteReviews" as const, remaining };
    // Claim release only after every review passes. The locked row means only
    // this transaction can be the claimant and therefore the delivery sender.
    const [claimed] = await tx.update(developmentCyclesTable)
      .set({ status: "released", releasedAt, updatedAt: releasedAt })
      .where(and(eq(developmentCyclesTable.id, cycleId), eq(developmentCyclesTable.status, "submitted")))
      .returning();
    if (!claimed) return { kind: "alreadyReleased" as const, reportCount: 0 };
    const created = [];
    for (const { assessment, player: playerRow } of assessments) {
      const [report] = await tx.insert(developmentReportsTable).values({
        cycleId, assessmentId: assessment.id, playerId: playerRow.id,
        playerFirstName: playerRow.firstName, playerFullName: `${playerRow.firstName} ${playerRow.lastName}`,
        reportingPeriod: claimed.reportingPeriod, categories: assessment.familyDraftCategories!,
        strength: assessment.familyStrength!, focus: assessment.familyFocus!, disclosure: DEVELOPMENT_DISCLOSURE, releasedAt,
      }).returning();
      created.push(report);
    }
    return { kind: "claimed" as const, reports: created, cycle: claimed };
  });
  if (outcome.kind === "missing") { res.status(404).json({ error: "Development cycle not found" }); return; }
  if (outcome.kind === "forbidden") { res.status(403).json({ error: "Only the cycle creator or a club admin can release submitted reports" }); return; }
  if (outcome.kind === "notSubmitted") { res.status(409).json({ error: "Cycle must be submitted before reports are released" }); return; }
  if (outcome.kind === "incompleteReviews") { res.status(409).json({ error: `All family report drafts must be reviewed before release (${outcome.remaining} remaining)` }); return; }
  if (outcome.kind === "alreadyReleased") { res.json({ released: true, reportCount: outcome.reportCount, emailFailures: 0 }); return; }
  const { reports, cycle } = outcome;

  const emailJobs: {
    email: string;
    subject: string;
    text: string;
    html: string;
    reportId?: number;
  }[] = [];
  for (const report of reports) {
    const guardians = await db.select({ user: usersTable }).from(guardianshipsTable)
      .innerJoin(usersTable, eq(guardianshipsTable.guardianId, usersTable.id))
      .where(and(eq(guardianshipsTable.playerId, report.playerId), eq(guardianshipsTable.canManage, true), eq(usersTable.clubId, clubId)));
    const [playerRow] = await db.select().from(usersTable).where(and(eq(usersTable.id, report.playerId), eq(usersTable.clubId, clubId)));
    const recipients = [playerRow, ...guardians.map((g) => g.user)].filter(Boolean) as User[];
    const recipientIds = [...new Set(recipients.map((u) => u.id))];
    const deepLink = `/development/reports/${report.id}`;
    await createNotification({ clubId, actorId: localUser.id, kind: "development", title: "Player development report ready", body: `${report.playerFirstName}'s ${report.reportingPeriod} report is ready.`, deepLink, recipientIds });
    for (const recipient of recipients) {
      if (!recipient.email) continue;
      const link = `${APP_URL}${deepLink}`;
      emailJobs.push({
        email: recipient.email,
        reportId: report.id,
        subject: `${report.playerFirstName}'s Nahreo development report is ready`,
        text: `${report.playerFirstName}'s development report for ${report.reportingPeriod} is ready. Sign in securely to view it: ${link}`,
        html: `<div style="font-family:Inter,Arial,sans-serif;color:#101828;max-width:560px;margin:auto"><h1 style="color:#173F8A">Development report ready</h1><p>${escapeHtml(report.playerFirstName)}'s report for ${escapeHtml(report.reportingPeriod)} is ready.</p><p style="margin:32px 0"><a href="${escapeHtml(link)}" style="background:#173F8A;color:white;padding:14px 22px;border-radius:12px;text-decoration:none;font-weight:700">View securely in Nahreo</a></p></div>`,
      });
    }
  }
  if (cycle.internalRecipientId) {
    const deepLink = `/development/cycles/${cycleId}`;
    await createNotification({ clubId, actorId: localUser.id, kind: "development", title: "Team development report submitted", body: `${cycle.reportingPeriod} team report is ready.`, deepLink, recipientIds: [cycle.internalRecipientId] });
    const [recipient] = await db.select().from(usersTable).where(and(
      eq(usersTable.id, cycle.internalRecipientId),
      eq(usersTable.clubId, clubId),
    ));
    if (recipient?.email) {
      const link = `${APP_URL}${deepLink}`;
      emailJobs.push({
        email: recipient.email,
        subject: "Nahreo team development report ready",
        text: `The team development report for ${cycle.reportingPeriod} is ready. Sign in securely to view it: ${link}`,
        html: `<div style="font-family:Inter,Arial,sans-serif;color:#101828;max-width:560px;margin:auto"><h1 style="color:#173F8A">Team development report ready</h1><p>The team report for ${escapeHtml(cycle.reportingPeriod)} is ready.</p><p style="margin:32px 0"><a href="${escapeHtml(link)}" style="background:#173F8A;color:white;padding:14px 22px;border-radius:12px;text-decoration:none;font-weight:700">View securely in Nahreo</a></p></div>`,
      });
    }
  }
  let emailFailures = 0;
  await Promise.all(emailJobs.map(async (job) => {
    try {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Nahreo <reports@nahreo.com>", to: [job.email],
          subject: job.subject,
          text: job.text,
          html: job.html,
        }),
      });
      if (!response.ok) throw new Error(`Resend returned ${response.status}`);
    } catch (error) {
      emailFailures++;
      req.log.error({ err: error, reportId: job.reportId }, "Development report email delivery failed");
    }
  }));
  res.json({ released: true, reportCount: reports.length, emailFailures });
});

router.get("/development-cycles/:cycleId/internal-summary", requireAuth, async (req, res): Promise<void> => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const context = await cycleContext(Number(req.params.cycleId), clubId);
  if (!context) { res.status(404).json({ error: "Development cycle not found" }); return; }
  if (context.cycle.status === "active") { res.status(409).json({ error: "Internal summaries are available after submission" }); return; }
  if (!(await canViewCycle(context.cycle, context.assessorIds, localUser.id, isClubAdmin))) {
    res.status(403).json({ error: "You do not have access to this internal summary" }); return;
  }
  const current = await db.select({ assessment: developmentAssessmentsTable, player: usersTable })
    .from(developmentAssessmentsTable).innerJoin(usersTable, eq(developmentAssessmentsTable.playerId, usersTable.id))
    .where(and(eq(developmentAssessmentsTable.cycleId, context.cycle.id), eq(usersTable.clubId, clubId)));
  const priorCycles = context.cycle.submittedAt
    ? await db.select().from(developmentCyclesTable)
      .where(and(
        eq(developmentCyclesTable.clubId, clubId),
        eq(developmentCyclesTable.teamId, context.cycle.teamId),
        inArray(developmentCyclesTable.status, ["submitted", "released"]),
        lt(developmentCyclesTable.submittedAt, context.cycle.submittedAt),
      ))
      .orderBy(desc(developmentCyclesTable.submittedAt), desc(developmentCyclesTable.id))
      .limit(1)
    : [];
  const previous = priorCycles[0];
  const previousAssessments = previous
    ? await db.select().from(developmentAssessmentsTable).where(eq(developmentAssessmentsTable.cycleId, previous.id))
    : [];
  const previousByPlayer = new Map(previousAssessments.map((assessment) => [assessment.playerId, assessment]));
  const avg = (assessment: DevelopmentAssessment) =>
    DEVELOPMENT_RUBRIC.reduce((sum, category) => sum + assessment[category.key], 0) / DEVELOPMENT_RUBRIC.length;
  const teamCategoryAverages = Object.fromEntries(DEVELOPMENT_RUBRIC.map((category) => [
    category.key,
    current.length ? current.reduce((sum, row) => sum + row.assessment[category.key], 0) / current.length : 0,
  ]));
  res.json({
    cycleId: context.cycle.id,
    teamId: context.cycle.teamId,
    teamCategoryAverages,
    players: current.map(({ assessment, player: playerRow }) => {
      const prior = previousByPlayer.get(assessment.playerId);
      const currentAverage = avg(assessment);
      const previousAverage = prior ? avg(prior) : null;
      const ratings = Object.fromEntries(DEVELOPMENT_RUBRIC.map((category) => [category.key, assessment[category.key]])) as Record<RatingKey, number>;
      return {
        player: person(playerRow),
        categories: familyCategories(ratings),
        currentAverage,
        previousAverage,
        averageChange: previousAverage === null ? null : currentAverage - previousAverage,
        categoryChanges: Object.fromEntries(DEVELOPMENT_RUBRIC.map((category) => [
          category.key, prior ? assessment[category.key] - prior[category.key] : null,
        ])),
        strength: assessment.familyStrength ?? assessment.strength,
        focus: assessment.familyFocus ?? assessment.focus,
        internalNotes: assessment.internalNotes,
      };
    }),
  });
});

router.get("/players/:playerId/development-reports", requireAuth, async (req, res): Promise<void> => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const playerId = Number(req.params.playerId);
  const reports = await db.select({ report: developmentReportsTable }).from(developmentReportsTable)
    .innerJoin(developmentCyclesTable, eq(developmentReportsTable.cycleId, developmentCyclesTable.id))
    .where(and(eq(developmentReportsTable.playerId, playerId), eq(developmentCyclesTable.clubId, clubId)))
    .orderBy(desc(developmentReportsTable.releasedAt));
  const allowed = [];
  for (const { report } of reports) if (await canReadReport(report, localUser.id, clubId, isClubAdmin)) allowed.push(await reportJson(report));
  if (!allowed.length && playerId !== localUser.id) {
    const [target] = await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.id, playerId), eq(usersTable.clubId, clubId)));
    if (!target) { res.status(404).json({ error: "Player not found" }); return; }
    const [guardian] = await db.select({ id: guardianshipsTable.id }).from(guardianshipsTable)
      .where(and(eq(guardianshipsTable.guardianId, localUser.id), eq(guardianshipsTable.playerId, playerId), eq(guardianshipsTable.canManage, true)));
    if (!guardian && !isClubAdmin) { res.status(403).json({ error: "You cannot view this player's reports" }); return; }
  }
  res.json(allowed);
});

router.get("/development-reports/:reportId", requireAuth, async (req, res): Promise<void> => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const [row] = await db.select({ report: developmentReportsTable }).from(developmentReportsTable)
    .innerJoin(developmentCyclesTable, eq(developmentReportsTable.cycleId, developmentCyclesTable.id))
    .where(and(eq(developmentReportsTable.id, Number(req.params.reportId)), eq(developmentCyclesTable.clubId, clubId)));
  if (!row) { res.status(404).json({ error: "Development report not found" }); return; }
  if (!(await canReadReport(row.report, localUser.id, clubId, isClubAdmin))) {
    res.status(403).json({ error: "You cannot view this development report" }); return;
  }
  res.json(await reportJson(row.report));
});

export default router;