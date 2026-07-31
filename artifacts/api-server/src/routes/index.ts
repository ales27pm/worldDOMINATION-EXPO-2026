import { Router, type IRouter } from "express";
import { resolveConfiguredAccountIdentity } from "../lib/accountIdentity";
import accountRouter from "./account";
import healthRouter from "./health";
import multiplayerRouter from "./multiplayer";

const router: IRouter = Router();

router.use(healthRouter);
router.use(resolveConfiguredAccountIdentity);
router.use(accountRouter);
router.use(multiplayerRouter);

export default router;
