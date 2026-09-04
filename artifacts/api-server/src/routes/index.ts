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
import timekeepingRouter from "./timekeeping";
import notificationsRouter from "./notifications";
import invitationsRouter from "./invitations";
import onboardingRouter from "./onboarding";
import developmentRouter from "./development";

const router: IRouter = Router();

router.use(healthRouter);
router.use(onboardingRouter);
router.use(meRouter);
router.use(clubRouter);
router.use(seasonsRouter);
router.use(teamsRouter);
router.use(peopleRouter);
router.use(feedRouter);
router.use(eventsRouter);
router.use(chatsRouter);
router.use(monitoringRouter);
router.use(timekeepingRouter);
router.use(notificationsRouter);
router.use(invitationsRouter);
router.use(developmentRouter);

export default router;
