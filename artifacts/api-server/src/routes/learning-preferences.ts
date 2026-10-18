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
  GetPersonLearningPreferencesResponse,
  SubmitMyLearningPreferencesBody,
  SubmitMyLearningPreferencesResponse,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { isTeamStaff } from "../lib/authz";
import { scoreLearningPreferences } from "../lib/learning-preferences";

const router: IRouter = Router();
const QUESTIONNAIRE_VERSION = 1;

async function hasPlayerRole(userId: number): Promise<boolean> {
  const [membership] = await db
    .select({ id: teamMembersTable.id })
    .from(teamMembersTable)
    .where(
      and(
        eq(teamMembersTable.userId, userId),
        eq(teamMembersTable.role, "player"),
      ),
    );
  return !!membership;
}

async function readPreferences(userId: number, clubId: number) {
  const [row] = await db
    .select()
    .from(learningPreferencesTable)
    .where(
      and(
        eq(learningPreferencesTable.userId, userId),
        eq(learningPreferencesTable.clubId, clubId),
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
  const { localUser } = req as AuthedRequest;
  if (!(await hasPlayerRole(localUser.id))) {
    res.status(403).json({ error: "This questionnaire is available to players." });
    return;
  }
  res.json(GetMyLearningPreferencesResponse.parse(
    await readPreferences(localUser.id, localUser.clubId),
  ));
});

router.put("/me/learning-preferences", requireAuth, async (req, res): Promise<void> => {
  const { localUser } = req as AuthedRequest;
  if (!(await hasPlayerRole(localUser.id))) {
    res.status(403).json({ error: "This questionnaire is available to players." });
    return;
  }

  const parsed = SubmitMyLearningPreferencesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const scores = scoreLearningPreferences(parsed.data.answers);
  await db
    .insert(learningPreferencesTable)
    .values({
      clubId: localUser.clubId,
      userId: localUser.id,
      visualScore: scores.visual,
      auditoryScore: scores.auditory,
      kinestheticScore: scores.kinesthetic,
      questionnaireVersion: QUESTIONNAIRE_VERSION,
    })
    .onConflictDoUpdate({
      target: learningPreferencesTable.userId,
      set: {
        clubId: localUser.clubId,
        visualScore: scores.visual,
        auditoryScore: scores.auditory,
        kinestheticScore: scores.kinesthetic,
        questionnaireVersion: QUESTIONNAIRE_VERSION,
        completedAt: new Date(),
      },
    });

  res.json(SubmitMyLearningPreferencesResponse.parse(
    await readPreferences(localUser.id, localUser.clubId),
  ));
});

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
        and(eq(usersTable.id, personId), eq(usersTable.clubId, clubId)),
      );
    if (!player) {
      res.status(404).json({ error: "Player not found." });
      return;
    }

    const playerTeams = await db
      .select({ teamId: teamMembersTable.teamId })
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
    for (const { teamId } of playerTeams) {
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
      await readPreferences(personId, clubId),
    ));
  },
);

export default router;
