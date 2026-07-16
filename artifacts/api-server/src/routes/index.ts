import { Router, type IRouter } from "express";
import healthRouter from "./health";
import meRouter from "./me";
import clubRouter from "./club";
import seasonsRouter from "./seasons";
import teamsRouter from "./teams";
import peopleRouter from "./people";
import feedRouter from "./feed";
import eventsRouter from "./events";
import chatsRouter from "./chats";
import monitoringRouter from "./monitoring";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meRouter);
router.use(clubRouter);
router.use(seasonsRouter);
router.use(teamsRouter);
router.use(peopleRouter);
router.use(feedRouter);
router.use(eventsRouter);
router.use(chatsRouter);
router.use(monitoringRouter);

export default router;
