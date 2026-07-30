import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";

import {
  AccountDirectoryError,
  addTrustedAccountContact,
  deleteTrustedAccountContact,
  getTrustedAccountProfile,
  listTrustedAccountContacts,
  updateTrustedAccountProfile,
} from "../lib/accountDirectory";
import {
  MULTIPLAYER_TRUSTED_USER_REQUIRED_ERROR,
  requireMultiplayerApiAuth,
  trustedMultiplayerUserDisplayNameFromHeaders,
  trustedMultiplayerUserIdFromHeaders,
} from "../lib/multiplayerAuth";

const router: IRouter = Router();

router.use("/account", requireMultiplayerApiAuth);
router.use("/account", requireTrustedAccountUser);

router.get("/account/me", async (req: Request, res: Response) => {
  try {
    res.json(await getTrustedAccountProfile(
      trustedMultiplayerUserIdFromHeaders(req.headers),
      trustedMultiplayerUserDisplayNameFromHeaders(req.headers),
    ));
  } catch (error) {
    sendAccountError(res, error);
  }
});

router.put("/account/me", async (req: Request, res: Response) => {
  try {
    res.json(await updateTrustedAccountProfile(
      trustedMultiplayerUserIdFromHeaders(req.headers),
      bodyRecord(req).displayName,
    ));
  } catch (error) {
    sendAccountError(res, error);
  }
});

router.get("/account/contacts", async (req: Request, res: Response) => {
  try {
    res.json(await listTrustedAccountContacts(trustedMultiplayerUserIdFromHeaders(req.headers), req.query.limit));
  } catch (error) {
    sendAccountError(res, error);
  }
});

router.put("/account/contacts/:userId", async (req: Request, res: Response) => {
  try {
    res.json(await addTrustedAccountContact(
      trustedMultiplayerUserIdFromHeaders(req.headers),
      req.params.userId,
      bodyRecord(req).displayName,
    ));
  } catch (error) {
    sendAccountError(res, error);
  }
});

router.delete("/account/contacts/:userId", async (req: Request, res: Response) => {
  try {
    const deleted = await deleteTrustedAccountContact(
      trustedMultiplayerUserIdFromHeaders(req.headers),
      req.params.userId,
    );
    res.status(deleted ? 204 : 404).send();
  } catch (error) {
    sendAccountError(res, error);
  }
});

function requireTrustedAccountUser(req: Request, res: Response, next: NextFunction): void {
  if (trustedMultiplayerUserIdFromHeaders(req.headers)) {
    next();
    return;
  }
  res.status(401).json({
    error: MULTIPLAYER_TRUSTED_USER_REQUIRED_ERROR,
    message: "Trusted account identity is required.",
  });
}

function bodyRecord(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
}

function sendAccountError(res: Response, error: unknown): void {
  if (error instanceof AccountDirectoryError) {
    res.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
  res.status(500).json({ error: "ACCOUNT_DIRECTORY_ERROR", message: "Account directory request failed." });
}

export default router;
