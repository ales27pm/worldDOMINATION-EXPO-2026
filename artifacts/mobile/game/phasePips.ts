import type { GamePhase, GameState } from "./types";

export interface CommandPhasePip {
  key: string;
  label: string;
  active: boolean;
  accessibilityLabel: string;
}

interface ClassicPhasePipDefinition {
  key: string;
  label: string;
  phases: readonly GamePhase[];
  accessibilityLabel: string;
}

const SETUP_PHASE_LABELS: Partial<Record<GamePhase, string>> = {
  territoryGrab: "CLAIMING",
  election: "ELECTION",
  initialDeploy: "DEPLOY",
  chooseCapital: "CAPITAL",
};

const CLASSIC_PHASES: readonly ClassicPhasePipDefinition[] = [
  {
    key: "deploy",
    label: "I. DEP",
    phases: ["reinforcement"],
    accessibilityLabel: "Classic deployment phase",
  },
  {
    key: "engage",
    label: "II. ENG",
    phases: ["attack"],
    accessibilityLabel: "Classic engagement phase",
  },
  {
    key: "maneuver",
    label: "III. MAN",
    phases: ["fortify"],
    accessibilityLabel: "Classic maneuver phase",
  },
];

const SAME_TIME_PHASES = [
  {
    key: "muster",
    label: "I. MUSTER",
    isActive: (game: GameState) => game.phase === "sameTimeReinforce",
    accessibilityLabel: "Same Time secret reinforcement phase",
  },
  {
    key: "seal",
    label: "II. SEAL",
    isActive: (game: GameState) =>
      game.phase === "sameTimeBattle" &&
      (game.sameTime?.playback.length ?? 0) === 0,
    accessibilityLabel: "Same Time sealed attack order phase",
  },
  {
    key: "review",
    label: "III. REVIEW",
    isActive: (game: GameState) =>
      game.phase === "sameTimeBattle" &&
      (game.sameTime?.playback.length ?? 0) > 0,
    accessibilityLabel: "Same Time battle playback review phase",
  },
  {
    key: "march",
    label: "IV. MARCH",
    isActive: (game: GameState) => game.phase === "sameTimeMove",
    accessibilityLabel: "Same Time tactical movement phase",
  },
] as const;

export function commandPhasePips(game: GameState): CommandPhasePip[] {
  const setupLabel = SETUP_PHASE_LABELS[game.phase];
  if (setupLabel) {
    return [
      {
        key: game.phase,
        label: setupLabel,
        active: true,
        accessibilityLabel: `${setupLabel.toLowerCase()} setup phase`,
      },
    ];
  }

  if (game.phase === "gameOver") {
    return [
      {
        key: "complete",
        label: "COMPLETE",
        active: true,
        accessibilityLabel: "Campaign complete",
      },
    ];
  }

  if (game.setup.turnStyle === "sameTime") {
    return SAME_TIME_PHASES.map((phase) => ({
      key: phase.key,
      label: phase.label,
      active: phase.isActive(game),
      accessibilityLabel: phase.accessibilityLabel,
    }));
  }

  return CLASSIC_PHASES.map((phase) => ({
    key: phase.key,
    label: phase.label,
    active: phase.phases.includes(game.phase),
    accessibilityLabel: phase.accessibilityLabel,
  }));
}
