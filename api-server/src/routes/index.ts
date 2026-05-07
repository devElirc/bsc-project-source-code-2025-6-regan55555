import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import trailsRouter from "./trails";
import recommendationsRouter from "./recommendations";
import usersRouter from "./users";
import mediaRouter from "./media";
import aiDiscoverRouter from "./ai-discover";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(trailsRouter);
router.use(recommendationsRouter);
router.use(usersRouter);
router.use(mediaRouter);
router.use(aiDiscoverRouter);

export default router;
