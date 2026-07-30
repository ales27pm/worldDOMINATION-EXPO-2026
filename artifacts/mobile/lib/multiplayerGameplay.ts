import type { GameAction } from '../game/types';
import {
  MultiplayerApiError,
  type MultiplayerClient,
  type MultiplayerSnapshot,
} from './multiplayerClient';
import type { MultiplayerLocalSession } from './multiplayerSession';

export interface SubmitMultiplayerGameplayActionInput {
  client: MultiplayerClient;
  session: MultiplayerLocalSession;
  snapshot: MultiplayerSnapshot;
  action: GameAction;
}

export interface SubmitMultiplayerGameplayActionResult {
  snapshot: MultiplayerSnapshot;
  refreshedAfterConflict: boolean;
}

export async function submitMultiplayerGameplayAction({
  client,
  session,
  snapshot,
  action,
}: SubmitMultiplayerGameplayActionInput): Promise<SubmitMultiplayerGameplayActionResult> {
  try {
    return {
      snapshot: await client.applyAction(session.matchId, {
        playerToken: session.playerToken,
        ...(session.sessionId ? { sessionId: session.sessionId } : {}),
        expectedVersion: snapshot.version,
        action,
      }),
      refreshedAfterConflict: false,
    };
  } catch (error) {
    if (error instanceof MultiplayerApiError && error.code === 'VERSION_CONFLICT') {
      return {
        snapshot: await client.getSnapshot(session.matchId, session.playerToken),
        refreshedAfterConflict: true,
      };
    }
    throw error;
  }
}

export function multiplayerActionStatus(action: GameAction, version: number): string {
  return `${action.type.replace(/_/g, ' ')} accepted at version ${version}.`;
}
