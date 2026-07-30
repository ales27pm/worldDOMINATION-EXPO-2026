import { Router, type IRouter, type Request, type Response } from "express";

import {
  type ApplyActionInput,
  type CreateMatchInput,
  type CreateSeatInvitationInput,
  type JoinMatchInput,
  MultiplayerError,
  multiplayerAuthority,
  type QuickMatchInput,
} from "../lib/multiplayerAuthority";
import {
  requireMultiplayerApiAuth,
  requireTrustedMultiplayerUser,
  trustedMultiplayerUserIdFromHeaders,
} from "../lib/multiplayerAuth";
import {
  listMultiplayerContacts,
  MultiplayerContactDirectoryError,
} from "../lib/multiplayerContacts";

const router: IRouter = Router();

router.use("/multiplayer", requireMultiplayerApiAuth);
router.use("/multiplayer", requireTrustedMultiplayerUser);

router.post("/multiplayer/matches", async (req: Request, res: Response) => {
  try {
    const result = await multiplayerAuthority.createMatch(bodyWithTrustedUser<CreateMatchInput>(req));
    res.status(201).json(result);
  } catch (error) {
    sendMultiplayerError(res, error);
  }
});

router.post("/multiplayer/quick-match", async (req: Request, res: Response) => {
  try {
    const result = await multiplayerAuthority.quickMatch(bodyWithTrustedUser<QuickMatchInput>(req));
    res.status(result.matchSource === "created" ? 201 : 200).json(result);
  } catch (error) {
    sendMultiplayerError(res, error);
  }
});

router.get("/multiplayer/matches", async (req: Request, res: Response) => {
  try {
    res.json(await multiplayerAuthority.listMatches({
      limit: req.query.limit,
      status: req.query.status,
      scope: req.query.scope,
      userId: trustedMultiplayerUserIdFromHeaders(req.headers),
    }));
  } catch (error) {
    sendMultiplayerError(res, error);
  }
});

router.get("/multiplayer/invitations", async (req: Request, res: Response) => {
  try {
    res.json(await multiplayerAuthority.listInvitations({
      limit: req.query.limit,
      userId: trustedMultiplayerUserIdFromHeaders(req.headers),
    }));
  } catch (error) {
    sendMultiplayerError(res, error);
  }
});

router.get("/multiplayer/contacts", async (req: Request, res: Response) => {
  try {
    res.json(await listMultiplayerContacts(trustedMultiplayerUserIdFromHeaders(req.headers)));
  } catch (error) {
    sendMultiplayerError(res, error);
  }
});

router.get("/multiplayer/invitations/events", async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit;
    const userId = trustedMultiplayerUserIdFromHeaders(req.headers);
    const initialInvitations = await multiplayerAuthority.listInvitations({ limit, userId });
    let closed = false;
    let unsubscribe = () => {};

    res.set({
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const writeInvitations = (invitations: unknown) => {
      if (closed) return;
      res.write(`event: invitations\n`);
      res.write(`data: ${JSON.stringify(invitations)}\n\n`);
    };
    const refreshInvitations = async () => {
      writeInvitations(await multiplayerAuthority.listInvitations({ limit, userId }));
    };

    writeInvitations(initialInvitations);
    unsubscribe = multiplayerAuthority.subscribeAll(() => {
      void refreshInvitations().catch(() => {
        if (!closed) {
          closed = true;
          unsubscribe();
          res.end();
        }
      });
    });

    req.on("close", () => {
      closed = true;
      unsubscribe();
      res.end();
    });
  } catch (error) {
    sendMultiplayerError(res, error);
  }
});

router.get("/multiplayer/matches/:matchId", async (req: Request, res: Response) => {
  try {
    const matchId = readMatchId(req);
    const token = typeof req.query.playerToken === "string" ? req.query.playerToken : undefined;
    res.json(await multiplayerAuthority.snapshot(matchId, token, trustedMultiplayerUserIdFromHeaders(req.headers)));
  } catch (error) {
    sendMultiplayerError(res, error);
  }
});

router.get("/multiplayer/matches/:matchId/events", async (req: Request, res: Response) => {
  try {
    const matchId = readMatchId(req);
    const token = typeof req.query.playerToken === "string" ? req.query.playerToken : undefined;
    const userId = trustedMultiplayerUserIdFromHeaders(req.headers);
    const initialSnapshot = await multiplayerAuthority.snapshot(matchId, token, userId);
    let closed = false;

    res.set({
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const writeSnapshot = async () => {
      if (closed) return;
      const snapshot = await multiplayerAuthority.snapshot(matchId, token, userId);
      res.write(`event: snapshot\n`);
      res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    };

    res.write(`event: snapshot\n`);
    res.write(`data: ${JSON.stringify(initialSnapshot)}\n\n`);
    const unsubscribe = multiplayerAuthority.subscribe(matchId, (update) => {
      if (update.matchId === matchId) {
        void writeSnapshot().catch(() => {
          if (!closed) {
            closed = true;
            unsubscribe();
            res.end();
          }
        });
      }
    });

    req.on("close", () => {
      closed = true;
      unsubscribe();
      res.end();
    });
  } catch (error) {
    sendMultiplayerError(res, error);
  }
});

router.post("/multiplayer/matches/:matchId/join", async (req: Request, res: Response) => {
  try {
    res.status(201).json(await multiplayerAuthority.joinMatch(readMatchId(req), bodyWithTrustedUser<JoinMatchInput>(req)));
  } catch (error) {
    sendMultiplayerError(res, error);
  }
});

router.post("/multiplayer/matches/:matchId/invitations", async (req: Request, res: Response) => {
  try {
    res.status(201).json(await multiplayerAuthority.inviteSeat(readMatchId(req), bodyWithTrustedUser<CreateSeatInvitationInput>(req)));
  } catch (error) {
    sendMultiplayerError(res, error);
  }
});

router.post("/multiplayer/matches/:matchId/actions", async (req: Request, res: Response) => {
  try {
    res.json(await multiplayerAuthority.applyAction(readMatchId(req), bodyWithTrustedUser<ApplyActionInput>(req)));
  } catch (error) {
    sendMultiplayerError(res, error);
  }
});

function readMatchId(req: Request): string {
  const value = req.params.matchId;
  if (typeof value !== "string") {
    throw new MultiplayerError("INVALID_MATCH_ID", "Match id is invalid.", 400);
  }
  return value;
}

function sendMultiplayerError(res: Response, error: unknown): void {
  if (error instanceof MultiplayerError) {
    res.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
  if (error instanceof MultiplayerContactDirectoryError) {
    res.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
  res.status(500).json({ error: "MULTIPLAYER_ERROR", message: "Multiplayer service failed." });
}

function bodyWithTrustedUser<T>(req: Request): T {
  const input = req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? { ...(req.body as Record<string, unknown>) }
    : {};
  delete input.userId;
  const userId = trustedMultiplayerUserIdFromHeaders(req.headers);
  return (userId ? { ...input, userId } : input) as T;
}

export default router;
