import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, seasonsTable } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../lib/auth";

const router: IRouter = Router();

router.get("/seasons", requireAuth, async (req, res) => {
  const { clubId } = req as AuthedRequest;
  const seasons = await db
    .select()
    .from(seasonsTable)
    .where(eq(seasonsTable.clubId, clubId))
    .orderBy(desc(seasonsTable.isActive), desc(seasonsTable.startDate));
  return res.json(
    seasons.map((s) => ({
      id: s.id,
      name: s.name,
      startDate: s.startDate ?? null,
      endDate: s.endDate ?? null,
      isActive: s.isActive,
    })),
  );
});

export default router;
