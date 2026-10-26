import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  learningPreferencesTable,
  teamMembersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";
import {
  GetMyLearningPreferencesResponse,
  GetMyCoachLearningPreferencesResponse,
  GetCoachLearningPreferencesResponse,
  GetPersonLearningPreferencesResponse,
  SubmitMyLearningPreferencesBody,
  SubmitMyCoachLearningPreferencesBody,
  SubmitMyLearningPreferencesResponse,
  SubmitMyCoachLearningPreferencesResponse,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { personBelongsToClub } from "../lib/club-membership";
import { isTeamStaff } from "../lib/authz";
import { hasEligiblePlayerTeam, featureTeamContext, teamFeatures } from "../lib/team-features";
import {
  scoreLearningPreferences,
  type LearningModality,
  type LearningPreferenceAnswer,
} from "../lib/learning-preferences";

const router: IRouter = Router();
const QUESTIONNAIRE_VERSION = 2;
type SubjectRole = "player" | "coach";

async function hasRole(userId: number, role: SubjectRole): Promise<boolean> {
  const [membership] = await db
    .select({ id: teamMembersTable.id })
    .from(teamMembersTable)
    .where(
      and(
        eq(teamMembersTable.userId, userId),
        eq(teamMembersTable.role, role),
      ),
    );
  return !!membership;
}

async function readPreferences(
  userId: number,
  clubId: number,
  subjectRole: SubjectRole,
) {
  const [row] = await db
    .select()
    .from(learningPreferencesTable)
    .where(
      and(
        eq(learningPreferencesTable.userId, userId),
        eq(learningPreferencesTable.clubId, clubId),
        eq(learningPreferencesTable.subjectRole, subjectRole),
      ),
    );

  return {
    completed: !!row,
    visualScore: row?.visualScore ?? 0,
    auditoryScore: row?.auditoryScore ?? 0,
    kinestheticScore: row?.kinestheticScore ?? 0,
    questionnaireVersion: row?.questionnaireVersion ?? QUESTIONNAIRE_VERSION,
    completedAt: row?.completedAt ?? null,
  };
}

router.get("/me/learning-preferences", requireAuth, async (req, res): Promise<void> => {
  const { localUser, clubId } = req as AuthedRequest;
  if (!(await hasEligiblePlayerTeam(localUser.id, clubId, req))) {
    res.status(403).json({ error: "The player questionnaire is available to U14 and older teams." });
    return;
  }
  res.json(GetMyLearningPreferencesResponse.parse(
    await readPreferences(localUser.id, clubId, "player"),
  ));
});

router.put("/me/learning-preferences", requireAuth, async (req, res): Promise<void> => {
  const { localUser, clubId } = req as AuthedRequest;
  if (!(await hasEligiblePlayerTeam(localUser.id, clubId, req))) {
    res.status(403).json({ error: "The player questionnaire is available to U14 and older teams." });
    return;
  }

  const parsed = SubmitMyLearningPreferencesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const answers = parsed.data.answers as LearningPreferenceAnswer[];
  const isLegacyV1 =
    answers.length === 30 &&
    answers.every(
      (answer): answer is LearningModality =>
        typeof answer === "string" &&
        (answer === "visual" || answer === "auditory" || answer === "kinesthetic"),
    );
  const isCurrentV2 =
    answers.length === 15 &&
    answers.every((answer) => Array.isArray(answer) || answer === "depends");

  if (!isLegacyV1 && !isCurrentV2) {
    res.status(400).json({ error: "Submit all 15 current answers or all 30 legacy answers." });
    return;
  }

  const answeredPreferenceCount = isCurrentV2
    ? answers.filter(Array.isArray).length
    : 30;
  if (isCurrentV2 && answeredPreferenceCount < 8) {
    res.status(400).json({ error: "Choose at least one approach for 8 questions; use “It depends” for the rest." });
    return;
  }

  const scores = scoreLearningPreferences(answers);
  const questionnaireVersion = isLegacyV1 ? 1 : QUESTIONNAIRE_VERSION;
  await db
    .insert(learningPreferencesTable)
    .values({
      clubId,
      userId: localUser.id,
      subjectRole: "player",
      visualScore: scores.visual,
      auditoryScore: scores.auditory,
      kinestheticScore: scores.kinesthetic,
      questionnaireVersion,
    })
    .onConflictDoUpdate({
      target: [
        learningPreferencesTable.userId,
        learningPreferencesTable.subjectRole,
      ],
      set: {
        clubId,
        visualScore: scores.visual,
        auditoryScore: scores.auditory,
        kinestheticScore: scores.kinesthetic,
        questionnaireVersion,
        completedAt: new Date(),
      },
    });

  res.json(SubmitMyLearningPreferencesResponse.parse(
    await readPreferences(localUser.id, clubId, "player"),
  ));
});

router.get(
  "/me/coach-learning-preferences",
  requireAuth,
  async (req, res): Promise<void> => {
    const { localUser } = req as AuthedRequest;
    if (!(await hasRole(localUser.id, "coach"))) {
      res.status(403).json({ error: "This questionnaire is available to coaches." });
      return;
    }
    res.json(GetMyCoachLearningPreferencesResponse.parse(
      await readPreferences(localUser.id, localUser.clubId, "coach"),
    ));
  },
);

router.put(
  "/me/coach-learning-preferences",
  requireAuth,
  async (req, res): Promise<void> => {
    const { localUser } = req as AuthedRequest;
    if (!(await hasRole(localUser.id, "coach"))) {
      res.status(403).json({ error: "This questionnaire is available to coaches." });
      return;
    }

    const parsed = SubmitMyCoachLearningPreferencesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const answers = parsed.data.answers as LearningPreferenceAnswer[];
    const isLegacyV1 =
      answers.length === 30 &&
      answers.every(
        (answer): answer is LearningModality =>
          typeof answer === "string" &&
          (answer === "visual" || answer === "auditory" || answer === "kinesthetic"),
      );
    const isCurrentV2 =
      answers.length === 15 &&
      answers.every((answer) => Array.isArray(answer) || answer === "depends");
    if (!isLegacyV1 && !isCurrentV2) {
      res.status(400).json({ error: "Submit all 15 current answers or all 30 legacy answers." });
      return;
    }

    const answeredPreferenceCount = isCurrentV2
      ? answers.filter(Array.isArray).length
      : 30;
    if (isCurrentV2 && answeredPreferenceCount < 8) {
      res.status(400).json({ error: "Choose at least one approach for 8 questions; use “It depends” for the rest." });
      return;
    }

    const scores = scoreLearningPreferences(answers);
    const questionnaireVersion = isLegacyV1 ? 1 : QUESTIONNAIRE_VERSION;
    await db
      .insert(learningPreferencesTable)
      .values({
        clubId: localUser.clubId,
        userId: localUser.id,
        subjectRole: "coach",
        visualScore: scores.visual,
        auditoryScore: scores.auditory,
        kinestheticScore: scores.kinesthetic,
        questionnaireVersion,
      })
      .onConflictDoUpdate({
        target: [
          learningPreferencesTable.userId,
          learningPreferencesTable.subjectRole,
        ],
        set: {
          clubId: localUser.clubId,
          visualScore: scores.visual,
          auditoryScore: scores.auditory,
          kinestheticScore: scores.kinesthetic,
          questionnaireVersion,
          completedAt: new Date(),
        },
      });

    res.json(SubmitMyCoachLearningPreferencesResponse.parse(
      await readPreferences(localUser.id, localUser.clubId, "coach"),
    ));
  },
);

router.get(
  "/people/:personId/learning-preferences",
  requireAuth,
  async (req, res): Promise<void> => {
    const { localUser, clubId, isClubAdmin } = req as AuthedRequest;
    const personId = Number(req.params.personId);
    if (!Number.isInteger(personId) || personId <= 0) {
      res.status(404).json({ error: "Player not found." });
      return;
    }

    const [player] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(eq(usersTable.id, personId), personBelongsToClub(clubId)),
      );
    if (!player) {
      res.status(404).json({ error: "Player not found." });
      return;
    }

    const playerTeams = await db
      .select({ teamId: teamMembersTable.teamId, ageGroup: teamsTable.ageGroup })
      .from(teamMembersTable)
      .innerJoin(teamsTable, eq(teamMembersTable.teamId, teamsTable.id))
      .where(
        and(
          eq(teamMembersTable.userId, personId),
          eq(teamMembersTable.role, "player"),
          eq(teamsTable.clubId, clubId),
        ),
      );
    let staffCanView = false;
    const context = featureTeamContext(req);
    for (const { teamId, ageGroup } of playerTeams) {
      if (!teamFeatures(ageGroup).learningPreferences || (context !== null && context !== teamId)) continue;
      if (await isTeamStaff(localUser.id, teamId, clubId, isClubAdmin)) {
        staffCanView = true;
        break;
      }
    }
    if (!staffCanView) {
      res.status(403).json({ error: "Only the player's team staff can view this result." });
      return;
    }

    res.json(GetPersonLearningPreferencesResponse.parse(
      await readPreferences(personId, clubId, "player"),
    ));
  },
);

router.get(
  "/people/:personId/coach-learning-preferences",
  requireAuth,
  async (req, res): Promise<void> => {
    const { localUser, clubId, isClubAdmin } = req as AuthedRequest;
    const personId = Number(req.params.personId);
    if (!Number.isInteger(personId) || personId <= 0) {
      res.status(404).json({ error: "Coach not found." });
      return;
    }

    const [coach] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.id, personId), personBelongsToClub(clubId)));
    if (!coach || !(await hasRole(personId, "coach"))) {
      res.status(404).json({ error: "Coach not found." });
      return;
    }
    if (localUser.id !== personId && !isClubAdmin) {
      res.status(403).json({ error: "Only this coach or a club admin can view this result." });
      return;
    }

    res.json(GetCoachLearningPreferencesResponse.parse(
      await readPreferences(personId, clubId, "coach"),
    ));
  },
);

export default router;
