import { Router, type IRouter } from "express";
import { desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  db,
  postsTable,
  commentsTable,
  usersTable,
} from "@workspace/db";
import { CreatePostBody, UpdatePostBody, AddCommentBody } from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { buildPosts } from "../lib/build";
import { getVisibleTeamIds } from "../lib/queries";
import { canAccessTeam, isTeamStaff } from "../lib/authz";
import { toPerson, iso } from "../lib/serialize";

const router: IRouter = Router();

// Pinned posts only stay on top for 2 days, then fall back into date order.
// Re-pinning updates pinnedAt and restarts the clock.
const activePin: SQL = sql`(${postsTable.pinned} and ${postsTable.pinnedAt} > now() - interval '2 days')`;

router.get("/feed", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const visible = await getVisibleTeamIds(clubId, localUser.id, isClubAdmin);
  if (visible.length === 0) return res.json([]);
  const posts = await db
    .select()
    .from(postsTable)
    .where(inArray(postsTable.teamId, visible))
    .orderBy(desc(activePin), desc(postsTable.createdAt))
    .limit(30);
  return res.json(await buildPosts(posts));
});

router.get("/teams/:teamId/posts", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const teamId = Number(req.params.teamId);
  if (!(await canAccessTeam(localUser.id, teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot view this team" });
  const posts = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.teamId, teamId))
    .orderBy(desc(activePin), desc(postsTable.createdAt));
  return res.json(await buildPosts(posts));
});

router.post("/teams/:teamId/posts", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const teamId = Number(req.params.teamId);
  if (!(await isTeamStaff(localUser.id, teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "Only team staff can post" });
  const body = CreatePostBody.parse(req.body);
  const [post] = await db
    .insert(postsTable)
    .values({
      teamId,
      authorId: localUser.id,
      title: body.title ?? null,
      body: body.body,
      pinned: body.pinned ?? false,
      pinnedAt: body.pinned ? new Date() : null,
    })
    .returning();
  const [built] = await buildPosts([post]);
  return res.status(201).json(built);
});

router.get("/posts/:postId", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const postId = Number(req.params.postId);
  const [post] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.id, postId));
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (!(await canAccessTeam(localUser.id, post.teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot view this post" });
  const [built] = await buildPosts([post]);

  const rows = await db
    .select({ c: commentsTable, u: usersTable })
    .from(commentsTable)
    .innerJoin(usersTable, eq(commentsTable.authorId, usersTable.id))
    .where(eq(commentsTable.postId, postId))
    .orderBy(commentsTable.createdAt);

  return res.json({
    post: built,
    comments: rows.map(({ c, u }) => ({
      id: c.id,
      postId: c.postId,
      body: c.body,
      createdAt: iso(c.createdAt) as string,
      author: toPerson(u),
    })),
  });
});

router.patch("/posts/:postId", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const postId = Number(req.params.postId);
  const [existing] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.id, postId));
  if (!existing) return res.status(404).json({ error: "Post not found" });
  if (!(await isTeamStaff(localUser.id, existing.teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot edit this post" });
  const body = UpdatePostBody.parse(req.body);
  const [post] = await db
    .update(postsTable)
    .set({
      ...body,
      // Toggling pin resets/clears the 2-day pin clock.
      ...(body.pinned !== undefined
        ? { pinnedAt: body.pinned ? new Date() : null }
        : {}),
    })
    .where(eq(postsTable.id, postId))
    .returning();
  const [built] = await buildPosts([post]);
  return res.json(built);
});

router.delete("/posts/:postId", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const postId = Number(req.params.postId);
  const [existing] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.id, postId));
  if (!existing) return res.status(404).json({ error: "Post not found" });
  if (!(await isTeamStaff(localUser.id, existing.teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot delete this post" });
  await db.delete(commentsTable).where(eq(commentsTable.postId, postId));
  await db.delete(postsTable).where(eq(postsTable.id, postId));
  return res.status(204).send();
});

router.post("/posts/:postId/comments", requireAuth, async (req, res) => {
  const { clubId, localUser, isClubAdmin } = req as AuthedRequest;
  const postId = Number(req.params.postId);
  const [post] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.id, postId));
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (!(await canAccessTeam(localUser.id, post.teamId, clubId, isClubAdmin)))
    return res.status(403).json({ error: "You cannot comment on this post" });
  const body = AddCommentBody.parse(req.body);
  const [comment] = await db
    .insert(commentsTable)
    .values({ postId, authorId: localUser.id, body: body.body })
    .returning();
  return res.status(201).json({
    id: comment.id,
    postId: comment.postId,
    body: comment.body,
    createdAt: iso(comment.createdAt) as string,
    author: toPerson(localUser),
  });
});

export default router;
