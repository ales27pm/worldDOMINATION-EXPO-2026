import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BattleReport, GameState } from "@/game/types";

/**
 * Battle-scene pacing preference + the shared "should this battle get a
 * cinematic?" policy, mirroring RISK II's option to tone down the theatre.
 *
 * - full: unhurried pre-roll beat and a long result hold.
 * - fast: blink-and-you-miss-it pacing (default).
 * - off:  no scenes at all — battles resolve with map + percussion only.
 */
export type BattleSceneMode = "full" | "fast" | "off";

const MODE_KEY = "risk2.battleScenes";

export const BATTLE_SCENE_LABELS: Record<BattleSceneMode, string> = {
  full: "FULL",
  fast: "FAST",
  off: "OFF",
};

/** Cycle order for the in-game toggle button. */
const CYCLE: BattleSceneMode[] = ["fast", "full", "off"];

let mode: BattleSceneMode = "fast";
const modeListeners = new Set<() => void>();

AsyncStorage.getItem(MODE_KEY)
  .then((value) => {
    if (value === "full" || value === "fast" || value === "off") {
      mode = value;
      modeListeners.forEach((fn) => fn());
    }
  })
  .catch(() => {
    // Storage unavailable — session keeps the default.
  });

export function getBattleSceneMode(): BattleSceneMode {
  return mode;
}

export function setBattleSceneMode(next: BattleSceneMode): void {
  mode = next;
  AsyncStorage.setItem(MODE_KEY, next).catch(() => {
    // Best-effort persistence; the choice still applies this session.
  });
  modeListeners.forEach((fn) => fn());
}

export function cycleBattleSceneMode(): void {
  const idx = CYCLE.indexOf(mode);
  setBattleSceneMode(CYCLE[(idx + 1) % CYCLE.length] ?? "fast");
}

function subscribeMode(fn: () => void): () => void {
  modeListeners.add(fn);
  return () => {
    modeListeners.delete(fn);
  };
}

export function useBattleSceneMode(): BattleSceneMode {
  return useSyncExternalStore(subscribeMode, getBattleSceneMode, getBattleSceneMode);
}

/** Scene pacing (ms) per mode: pre-roll beat, result hold, sound offsets. */
export const SCENE_TIMINGS: Record<
  Exclude<BattleSceneMode, "off">,
  { preRoll: number; hold: number; volleyAt: number; trumpetAt: number }
> = {
  full: { preRoll: 550, hold: 2500, volleyAt: 240, trumpetAt: 1130 },
  fast: { preRoll: 200, hold: 1150, volleyAt: 180, trumpetAt: 600 },
};

/**
 * Scene policy — used by both the battle modal and the sound director so the
 * cinematic and its soundtrack always agree:
 * - Scenes off: never.
 * - The player's own assault: always a scene.
 * - An AI assault on the player: only interrupt when ground was actually
 *   lost, or the contested territory is someone's capital.
 * - AI vs AI: never (map + percussion only).
 */
export function shouldShowBattleScene(
  game: GameState,
  report: BattleReport,
  sceneMode: BattleSceneMode,
): boolean {
  if (sceneMode === "off") return false;
  if (game.players[report.attacker]?.isHuman) return true;
  if (!game.players[report.defender]?.isHuman) return false;
  return report.conquered || game.players.some((p) => p.capital === report.to);
}

// ── Live scene visibility ────────────────────────────────────────────────
// The occupy toast must not burn its countdown while a battle scene modal
// covers the screen, so the modal publishes its visibility here.

let sceneVisible = false;
let sceneVisibilityRevision = 0;
const visListeners = new Set<() => void>();

export function setBattleSceneVisible(value: boolean): void {
  if (sceneVisible === value) return;
  sceneVisible = value;
  sceneVisibilityRevision += 1;
  visListeners.forEach((fn) => fn());
}

export function getBattleSceneVisible(): boolean {
  return sceneVisible;
}

export function getBattleSceneVisibilityRevision(): number {
  return sceneVisibilityRevision;
}

function subscribeVisible(fn: () => void): () => void {
  visListeners.add(fn);
  return () => {
    visListeners.delete(fn);
  };
}

export function useBattleSceneVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisible,
    getBattleSceneVisible,
    getBattleSceneVisible,
  );
}
