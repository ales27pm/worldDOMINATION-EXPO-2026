import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createGame, gameReducer } from '../game/engine';
import { migrateLegacyStorage } from '../db/migrate';
import {
  deleteSave,
  loadSavedState,
  recordCompletedCampaign,
  saveCampaignState,
} from '../db/repository';
import type { GameAction, GameSetup, GameState } from '../game/types';

interface GameContextValue {
  game: GameState | null;
  startGame: (setup: GameSetup, prepare?: (state: GameState) => GameState) => void;
  dispatch: (action: GameAction) => void;
  abandonGame: () => Promise<void>;
  loadingSave: boolean;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [game, setGame] = useState<GameState | null>(null);
  const [loadingSave, setLoadingSave] = useState(true);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordedRef = useRef(false);

  // Migrate legacy AsyncStorage saves, then restore the campaign from the DB.
  useEffect(() => {
    async function load() {
      try {
        await migrateLegacyStorage();
        const saved = await loadSavedState();
        if (saved) setGame(saved);
      } catch {
        // Corrupted save — ignore
      } finally {
        setLoadingSave(false);
      }
    }
    void load();
  }, []);

  // Autosave every state change (debounced); archive the campaign once it ends.
  useEffect(() => {
    if (!game) return;
    if (game.phase === 'gameOver') {
      if (recordedRef.current) return;
      recordedRef.current = true;
      void recordCompletedCampaign(game).catch(() => {});
      return;
    }
    recordedRef.current = false;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      saveCampaignState(game).catch(() => {});
    }, 400);
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [game]);

  const startGame = useCallback((setup: GameSetup, prepare?: (state: GameState) => GameState) => {
    const newGame = createGame(setup);
    setGame(prepare ? prepare(newGame) : newGame);
  }, []);

  const dispatch = useCallback((action: GameAction) => {
    setGame((prev) => {
      if (!prev) return prev;
      return gameReducer(prev, action);
    });
  }, []);

  const abandonGame = useCallback(async () => {
    setGame(null);
    await deleteSave().catch(() => {});
  }, []);

  return (
    <GameContext.Provider value={{ game, startGame, dispatch, abandonGame, loadingSave }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
