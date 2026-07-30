import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useGame } from "@/context/GameContext";
import { useTournament } from "@/context/TournamentContext";
import { aiNextAction } from "@/game/ai";
import { allianceBetween } from "@/game/analysis";
import { electionBudget } from "@/game/engine";
import { TERRITORY_MAP } from "@/game/mapData";
import { friendlyReachableSet } from "@/game/sameTime";
import { tournamentResult } from "@/game/tournament";
import {
  isCompleteMapPerformanceEvidence,
  serializeMapPerformanceEvidence,
  type MapPerformanceEvidence,
} from "@/game/mapPerformanceEvidence";
import { Colors } from "@/constants/colors";
import { MAP_HUD_TEXT_SHADOW, MapHud } from "@/constants/mapHud";
import type {
  Allocation,
  BattleReport,
  GameAction,
  GameState,
  GameSetup,
  Objective,
  TerritoryId,
  TurnStyle,
} from "@/game/types";
import { playActionSound, useGameSounds } from "@/hooks/useGameSounds";
import {
  BATTLE_SCENE_LABELS,
  cycleBattleSceneMode,
  useBattleSceneMode,
} from "@/lib/battleScenes";
import {
  loadMapPerformanceEvidence,
  saveMapPerformanceEvidence,
} from "@/lib/mapPerformanceEvidence";
import GameMap, {
  MAP_VIEW_LABELS,
  MAP_VIEW_MODES,
  type MapRendererMode,
  type MapViewMode,
} from "@/components/game/GameMap";
import { ContinentLegend } from "@/components/game/WorldBoard";
import { TopBar } from "@/components/game/TopBar";
import { FieldPanel, SectionHeader } from "@/components/game/FieldPanel";
import { PhaseBanner } from "@/components/game/PhaseBanner";
import GamePanel, { type StagedMove } from "@/components/game/GamePanel";
import PlayerRoster from "@/components/game/PlayerRoster";
import { TransientBattleReport } from "@/components/game/BattleReport";
import { EventTicker } from "@/components/game/EventTicker";
import CardHand from "@/components/game/CardHand";
import { BattleView } from "@/components/game/BattleView";
import {
  DispatchLog,
  HandoffOverlay,
  OccupyOverlay,
  ProposalOverlay,
  SameTimeBattlePlayback,
  VictoryOverlay,
} from "@/components/game/GameOverlays";

const MAP_PERFORMANCE_QUALIFICATION_ENABLED =
  process.env.EXPO_PUBLIC_BROWSER_SMOKE === "1" ||
  process.env.EXPO_PUBLIC_R3F_QUALIFICATION === "1";

export default function GameScreen() {
  const router = useRouter();
  const { game, startGame, loadingSave } = useGame();
  const params = useLocalSearchParams<PreviewParams>();
  const autostart = firstParam(params.autostart);

  // Redirect if no game (dev builds can auto-start a demo campaign for previews)
  useEffect(() => {
    if (game) return;
    if (loadingSave) return;
    if (
      (__DEV__ || process.env.EXPO_PUBLIC_BROWSER_SMOKE === "1") &&
      autostart
    ) {
      const setup = previewSetupFromParams(params);
      startGame(setup, previewPrepareFromParams(params));
      return;
    }
    router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, loadingSave, autostart]);

  if (!game) return null;
  return (
    <CampaignScreen
      game={game}
      initialRendererMode={previewRendererFromParams(params)}
    />
  );
}

type PreviewParams = {
  autostart?: string | string[];
  objective?: string | string[];
  allocation?: string | string[];
  turnStyle?: string | string[];
  extra?: string | string[];
  extended?: string | string[];
  restricted?: string | string[];
  players?: string | string[];
  playback?: string | string[];
  battlePlayback?: string | string[];
  orders?: string | string[];
  battleOrders?: string | string[];
  renderer?: string | string[];
  attackDemo?: string | string[];
};

const PREVIEW_OBJECTIVES: Objective[] = [
  "domination60",
  "domination80",
  "domination100",
  "capital",
  "mission",
];
const PREVIEW_ALLOCATIONS: Allocation[] = ["random", "grab", "election"];
const PREVIEW_TURN_STYLES: TurnStyle[] = ["classic", "sameTime"];
const PREVIEW_NAMES = [
  "Napoleon",
  "Wellington",
  "Kutuzov",
  "Blucher",
  "Marmont",
  "Campbell",
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return value && allowed.includes(value as T) ? (value as T) : fallback;
}

function truthyParam(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function previewPlayerCount(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 4;
  return Math.min(6, Math.max(2, parsed));
}

function previewSetupFromParams(params: PreviewParams): GameSetup {
  const smokePlayback = previewWantsBattlePlayback(params);
  const smokeOrders = previewWantsBattleOrders(params);
  const turnStyle =
    smokePlayback || smokeOrders
      ? "sameTime"
      : oneOf(firstParam(params.turnStyle), PREVIEW_TURN_STYLES, "classic");
  const count = previewPlayerCount(firstParam(params.players));
  return {
    players: Array.from({ length: count }, (_, index) => ({
      name: PREVIEW_NAMES[index] ?? `Commander ${index + 1}`,
      colorIdx: index,
      isHuman: index === 0,
      generalId: null,
    })),
    objective: oneOf(
      firstParam(params.objective),
      PREVIEW_OBJECTIVES,
      "domination100",
    ),
    useExtraTerritories:
      truthyParam(firstParam(params.extra)) ||
      truthyParam(firstParam(params.extended)),
    cardRule: "ascending",
    allocation: oneOf(
      firstParam(params.allocation),
      PREVIEW_ALLOCATIONS,
      "random",
    ),
    turnStyle,
    restrictedReinforcement:
      turnStyle === "sameTime"
        ? truthyParam(firstParam(params.restricted))
        : undefined,
  };
}

function previewWantsBattlePlayback(params: PreviewParams): boolean {
  return (
    truthyParam(firstParam(params.playback)) ||
    truthyParam(firstParam(params.battlePlayback))
  );
}

function previewWantsBattleOrders(params: PreviewParams): boolean {
  return (
    truthyParam(firstParam(params.orders)) ||
    truthyParam(firstParam(params.battleOrders))
  );
}

function previewWantsAttackDemo(params: PreviewParams): boolean {
  return truthyParam(firstParam(params.attackDemo));
}

function previewRendererFromParams(params: PreviewParams): MapRendererMode {
  const renderer = firstParam(params.renderer)?.toLowerCase();
  return renderer === "r3f" || renderer === "3d" ? "r3f" : "svg";
}

function previewPrepareFromParams(
  params: PreviewParams,
): ((state: GameState) => GameState) | undefined {
  if (previewWantsAttackDemo(params)) return previewR3FAttackState;
  if (previewWantsBattlePlayback(params))
    return previewSameTimeBattlePlaybackState;
  if (previewWantsBattleOrders(params)) return previewSameTimeBattleOrdersState;
  return undefined;
}

function previewR3FAttackState(state: GameState): GameState {
  return {
    ...state,
    phase: "attack",
    currentPlayer: 0,
    awaitingHandoff: false,
    pendingProposal: null,
    pendingOccupy: null,
    lastBattle: null,
    battlesFought: 0,
    reinforcementsRemaining: 0,
    mustTrade: false,
    territories: {
      ...state.territories,
      brazil: { owner: 0, armies: 6 },
      northAfrica: { owner: 1, armies: 2 },
      china: { owner: 0, armies: 12 },
      peru: { owner: 0, armies: 1 },
    },
    log: [
      ...state.log,
      {
        id: state.logCounter + 1,
        turn: state.turn,
        text: "Napoleon prepares a transatlantic assault from Brazil.",
        tone: "info",
      },
    ],
    logCounter: state.logCounter + 1,
  };
}

function previewSameTimeBattleOrdersState(state: GameState): GameState {
  if (!state.sameTime) return state;
  return {
    ...state,
    phase: "sameTimeBattle",
    currentPlayer: 0,
    awaitingHandoff: false,
    pendingProposal: null,
    pendingOccupy: null,
    lastBattle: null,
    territories: {
      ...state.territories,
      alaska: { owner: 0, armies: 5 },
      northwestTerritory: { owner: 1, armies: 3 },
      alberta: { owner: 0, armies: 2 },
      greenland: { owner: 1, armies: 4 },
    },
    sameTime: {
      ...state.sameTime,
      reinforcementsRemaining: state.players.map(() => 0),
      deployLog: state.players.map(() => []),
      readyReinforce: state.players.map((player) => player.alive),
      orders: [],
      readyBattle: state.players.map(() => false),
      playback: [],
      moves: [],
      readyMove: state.players.map(() => false),
    },
    log: [
      ...state.log,
      {
        id: state.logCounter + 1,
        turn: state.turn,
        text: "Napoleon studies attack routes from Alaska.",
        tone: "info",
      },
    ],
    logCounter: state.logCounter + 1,
  };
}

function previewSameTimeBattlePlaybackState(state: GameState): GameState {
  if (!state.sameTime) return state;
  const report: BattleReport = {
    from: "alaska",
    to: "northwestTerritory",
    attacker: 0,
    defender: 1,
    attackerRolls: [6, 5],
    defenderRolls: [3],
    attackerLosses: 0,
    defenderLosses: 1,
    rounds: 1,
    conquered: true,
    attackerTier: "orange",
    defenderTier: "white",
    attackerArmiesBefore: 6,
    defenderArmiesBefore: 1,
    roundResults: [
      {
        attackerRolls: [6, 5],
        defenderRolls: [3],
        attackerLosses: 0,
        defenderLosses: 1,
        attackerTier: "orange",
        defenderTier: "white",
      },
    ],
  };

  return {
    ...state,
    phase: "sameTimeBattle",
    currentPlayer: 0,
    awaitingHandoff: false,
    lastBattle: null,
    battlesFought: Math.max(state.battlesFought, 1),
    territories: {
      ...state.territories,
      alaska: { owner: 0, armies: 1 },
      northwestTerritory: { owner: 0, armies: 5 },
      alberta: { owner: 0, armies: 3 },
      greenland: { owner: 1, armies: 4 },
    },
    sameTime: {
      ...state.sameTime,
      reinforcementsRemaining: state.players.map(() => 0),
      deployLog: state.players.map(() => []),
      readyReinforce: state.players.map(() => true),
      orders: [],
      readyBattle: state.players.map(() => true),
      playback: [report],
      moves: [],
      readyMove: state.players.map(() => false),
    },
    log: [
      ...state.log,
      {
        id: state.logCounter + 1,
        turn: state.turn,
        text: "Napoleon storms Northwest Territory from Alaska (1 defenders slain).",
        tone: "battle",
      },
    ],
    logCounter: state.logCounter + 1,
  };
}

interface CampaignScreenProps {
  game: GameState;
  dispatchAction?: (action: GameAction) => void | Promise<void>;
  localPlayerId?: number | null;
  actionBusy?: boolean;
  disableAi?: boolean;
  statusBanner?: React.ReactNode;
  onExit?: () => void;
  onActionError?: (error: unknown) => void;
  onVictoryExit?: () => void | Promise<void>;
  initialRendererMode?: MapRendererMode;
}

export function CampaignScreen({
  game,
  dispatchAction,
  localPlayerId,
  actionBusy = false,
  disableAi = false,
  statusBanner,
  onExit,
  onActionError,
  onVictoryExit,
  initialRendererMode = "svg",
}: CampaignScreenProps) {
  const router = useRouter();
  const { dispatch: rawDispatch, abandonGame } = useGame();
  const { recordResult } = useTournament();

  // Every human order gets its RISK II sound cue before it hits the engine.
  const dispatch = useCallback(
    (action: GameAction) => {
      playActionSound(action);
      try {
        const result = dispatchAction
          ? dispatchAction(action)
          : rawDispatch(action);
        if (
          result &&
          typeof (result as PromiseLike<void>).then === "function" &&
          "catch" in result &&
          typeof result.catch === "function"
        ) {
          void result.catch((error) => onActionError?.(error));
        }
      } catch (error) {
        onActionError?.(error);
      }
    },
    [dispatchAction, onActionError, rawDispatch],
  );

  // State-transition sound director: battles, proposals, handoffs, victory.
  useGameSounds(game);

  const sceneMode = useBattleSceneMode();
  const [selected, setSelected] = useState<TerritoryId | null>(null);
  const [stagedMove, setStagedMove] = useState<StagedMove | null>(null);
  const [diceCount, setDiceCount] = useState(3);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<MapViewMode>("board");
  const [rendererMode, setRendererMode] =
    useState<MapRendererMode>(initialRendererMode);
  const [currentPerformanceEvidence, setCurrentPerformanceEvidence] =
    useState<MapPerformanceEvidence | null>(null);
  const [savedPerformanceEvidence, setSavedPerformanceEvidence] =
    useState<MapPerformanceEvidence | null>(null);

  useEffect(() => {
    if (!MAP_PERFORMANCE_QUALIFICATION_ENABLED) return;
    let cancelled = false;
    void loadMapPerformanceEvidence(AsyncStorage)
      .then((evidence) => {
        if (!cancelled) setSavedPerformanceEvidence(evidence);
      })
      .catch((error) => {
        console.warn("Unable to load map performance evidence.", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePerformanceEvidence = useCallback(
    (evidence: MapPerformanceEvidence) => {
      setCurrentPerformanceEvidence(evidence);
      if (!isCompleteMapPerformanceEvidence(evidence)) return;
      setSavedPerformanceEvidence(evidence);
      void saveMapPerformanceEvidence(AsyncStorage, evidence).catch(
        (error) => {
          console.warn("Unable to save map performance evidence.", error);
        },
      );
    },
    [],
  );

  const shareablePerformanceEvidence =
    currentPerformanceEvidence &&
    isCompleteMapPerformanceEvidence(currentPerformanceEvidence)
      ? currentPerformanceEvidence
      : savedPerformanceEvidence;
  const performanceStatus =
    currentPerformanceEvidence?.qualification.status ??
    savedPerformanceEvidence?.qualification.status ??
    "pending";
  const performanceColor =
    performanceStatus === "pass"
      ? "#66b87a"
      : performanceStatus === "fail"
        ? Colors.crimsonLight
        : performanceStatus === "ineligible"
          ? Colors.textMuted
          : Colors.gold;
  const performanceIcon: React.ComponentProps<typeof Ionicons>["name"] =
    performanceStatus === "pass"
      ? "checkmark-circle-outline"
      : performanceStatus === "fail"
        ? "close-circle-outline"
        : performanceStatus === "ineligible"
          ? "remove-circle-outline"
          : "speedometer-outline";
  const sharePerformanceEvidence = useCallback(() => {
    if (!shareablePerformanceEvidence) return;
    void Share.share(
      {
        title: "worldDOMINATION map performance evidence",
        message: serializeMapPerformanceEvidence(
          shareablePerformanceEvidence,
        ),
      },
      {
        dialogTitle: "Share map performance evidence",
        subject: "worldDOMINATION map performance evidence",
      },
    ).catch((error) => {
      console.warn("Unable to share map performance evidence.", error);
      Alert.alert(
        "Evidence Export Failed",
        "The completed qualification remains saved on this device.",
      );
    });
  }, [shareablePerformanceEvidence]);

  // Landscape: the map spans the full width, chrome docks right (RISK II
  // keeps the board full-bleed — the panel must never eat the map).
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;

  const player = game.players[game.currentPlayer];
  const isHumanTurn = player?.isHuman ?? false;
  const sameTimePlaybackPending =
    game.phase === "sameTimeBattle" &&
    (game.sameTime?.playback.length ?? 0) > 0;
  const localOwnsCurrentPlayer =
    localPlayerId === undefined ? true : localPlayerId === game.currentPlayer;
  const canSubmitCurrentPlayer = localOwnsCurrentPlayer && !actionBusy;
  const isHumanActive =
    isHumanTurn &&
    canSubmitCurrentPlayer &&
    !game.awaitingHandoff &&
    !game.pendingProposal &&
    !sameTimePlaybackPending;
  const inactiveHint =
    localPlayerId !== undefined && !localOwnsCurrentPlayer
      ? `Waiting for ${player?.name ?? "the active commander"}.`
      : actionBusy
        ? "Submitting orders to the server."
        : undefined;
  const isTournamentGame = game.setup.tournamentGame !== undefined;

  const hasHuman = useMemo(
    () => game.players.some((p) => p.isHuman && p.alive),
    [game.players],
  );

  // ── AI Loop ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (disableAi) return;
    if (!game || game.phase === "gameOver") return;

    // Same Time battle playback: a human at the table must tap through the
    // recap themselves (ST_ACK_PLAYBACK, via the panel/overlay). In a
    // full-AI/spectator match there's no one to tap, so auto-advance it.
    if (
      game.phase === "sameTimeBattle" &&
      (game.sameTime?.playback.length ?? 0) > 0
    ) {
      if (hasHuman) return;
      const timer = setTimeout(
        () => rawDispatch({ type: "ST_ACK_PLAYBACK" }),
        900,
      );
      return () => clearTimeout(timer);
    }

    if (isHumanTurn || game.awaitingHandoff || game.pendingProposal) return;
    if (game.pendingOccupy) {
      const timer = setTimeout(() => {
        const action = aiNextAction(game);
        // AI orders bypass the human sound cue — battle audio is state-driven.
        if (action) rawDispatch(action);
      }, 100);
      return () => clearTimeout(timer);
    }
    // Attack orders get a longer beat so each on-map arrow reads clearly.
    const delay =
      game.phase === "initialDeploy" || game.phase === "territoryGrab"
        ? 100
        : game.phase === "attack"
          ? 260
          : 180;
    const timer = setTimeout(() => {
      const action = aiNextAction(game);
      if (action) rawDispatch(action);
    }, delay);
    return () => clearTimeout(timer);
  }, [disableAi, game, isHumanTurn, hasHuman, rawDispatch]);

  // ── Deselect when phase changes ────────────────────────────────────────────
  useEffect(() => {
    setSelected(null);
    setStagedMove(null);
  }, [game.phase, game.currentPlayer]);

  // Once the tactical move lands, clear any staging UI.
  useEffect(() => {
    if (game.fortifyUsed) {
      setSelected(null);
      setStagedMove(null);
    }
  }, [game.fortifyUsed]);

  // ── Territory interaction sets ─────────────────────────────────────────────
  const { interactive, targets } = useMemo(() => {
    if (!game || !player || !isHumanActive) {
      return {
        interactive: new Set<TerritoryId>(),
        targets: new Set<TerritoryId>(),
      };
    }
    const phase = game.phase;
    const inter = new Set<TerritoryId>();
    const tgts = new Set<TerritoryId>();
    const activeSet = new Set(game.activeIds);

    if (phase === "territoryGrab") {
      for (const id of game.activeIds) {
        if (game.territories[id].owner === -1) inter.add(id);
      }
    } else if (phase === "chooseCapital") {
      if (!player.capital) {
        for (const id of game.activeIds) {
          if (game.territories[id].owner === player.id) inter.add(id);
        }
      }
    } else if (phase === "initialDeploy") {
      if ((game.initialRemaining[player.id] ?? 0) > 0) {
        for (const id of game.activeIds) {
          if (game.territories[id].owner === player.id) inter.add(id);
        }
      }
    } else if (phase === "reinforcement" && !game.mustTrade) {
      for (const id of game.activeIds) {
        if (game.territories[id].owner === player.id) inter.add(id);
      }
    } else if (phase === "attack") {
      if (!selected) {
        for (const id of game.activeIds) {
          const ter = game.territories[id];
          if (ter.owner !== player.id || ter.armies < 2) continue;
          if (ter.armies >= 2) inter.add(id);
        }
      } else {
        const selTer = game.territories[selected];
        if (selTer?.owner === player.id && selTer.armies >= 2) {
          inter.add(selected);
          const def = TERRITORY_MAP[selected];
          if (def) {
            for (const n of def.neighbors) {
              if (!activeSet.has(n)) continue;
              const nt = game.territories[n as TerritoryId];
              if (nt?.owner !== player.id) {
                const alliance = allianceBetween(game, player.id, nt.owner);
                if (!alliance || alliance.level < 2) {
                  tgts.add(n as TerritoryId);
                }
              }
            }
          }
        }
      }
    } else if (phase === "fortify" && !game.fortifyUsed) {
      if (!selected) {
        for (const id of game.activeIds) {
          const ter = game.territories[id];
          if (ter.owner === player.id && ter.armies >= 2) inter.add(id);
        }
      } else {
        const selTer = game.territories[selected];
        if (selTer?.owner === player.id && selTer.armies >= 2) {
          inter.add(selected);
          const def = TERRITORY_MAP[selected];
          if (def) {
            for (const n of def.neighbors) {
              if (!activeSet.has(n)) continue;
              if (game.territories[n as TerritoryId]?.owner === player.id)
                tgts.add(n as TerritoryId);
            }
          }
        }
      }
    } else if (phase === "sameTimeReinforce") {
      const remaining = game.sameTime?.reinforcementsRemaining[player.id] ?? 0;
      if (remaining > 0 && player.cards.length < 5) {
        for (const id of game.activeIds) {
          if (game.territories[id].owner === player.id) inter.add(id);
        }
      }
    } else if (phase === "sameTimeBattle") {
      const orders = game.sameTime?.orders ?? [];
      if (!selected) {
        for (const id of game.activeIds) {
          const ter = game.territories[id];
          if (ter.owner !== player.id) continue;
          const committed = orders
            .filter((o) => o.player === player.id && o.from === id)
            .reduce((sum, o) => sum + o.count, 0);
          if (ter.armies - 1 - committed >= 1) inter.add(id);
        }
      } else {
        const selTer = game.territories[selected];
        const committed = orders
          .filter((o) => o.player === player.id && o.from === selected)
          .reduce((sum, o) => sum + o.count, 0);
        if (selTer?.owner === player.id && selTer.armies - 1 - committed >= 1) {
          inter.add(selected);
          const def = TERRITORY_MAP[selected];
          if (def) {
            for (const n of def.neighbors) {
              if (!activeSet.has(n)) continue;
              const nt = game.territories[n as TerritoryId];
              if (nt?.owner !== player.id) {
                const alliance = allianceBetween(game, player.id, nt.owner);
                if (!alliance || alliance.level < 2) tgts.add(n as TerritoryId);
              }
            }
          }
        }
      }
    } else if (phase === "sameTimeMove") {
      const moves = game.sameTime?.moves ?? [];
      if (!selected) {
        for (const id of game.activeIds) {
          const ter = game.territories[id];
          if (ter.owner !== player.id) continue;
          const committed = moves
            .filter((m) => m.player === player.id && m.from === id)
            .reduce((sum, m) => sum + m.count, 0);
          if (ter.armies - 1 - committed >= 1) inter.add(id);
        }
      } else {
        const selTer = game.territories[selected];
        const committed = moves
          .filter((m) => m.player === player.id && m.from === selected)
          .reduce((sum, m) => sum + m.count, 0);
        if (selTer?.owner === player.id && selTer.armies - 1 - committed >= 1) {
          inter.add(selected);
          for (const to of friendlyReachableSet(game, player.id, selected)) {
            tgts.add(to);
          }
        }
      }
    }
    return { interactive: inter, targets: tgts };
  }, [game, selected, isHumanActive]);

  // ── Territory tap handler ──────────────────────────────────────────────────
  const handleTerritoryTap = useCallback(
    (id: TerritoryId) => {
      if (!isHumanActive) return;
      const phase = game.phase;
      const ter = game.territories[id];

      if (phase === "territoryGrab" && ter.owner === -1) {
        dispatch({ type: "CLAIM_TERRITORY", territory: id });
        return;
      }
      if (
        phase === "chooseCapital" &&
        ter.owner === player?.id &&
        !player?.capital
      ) {
        dispatch({ type: "CHOOSE_CAPITAL", territory: id });
        return;
      }
      if (phase === "initialDeploy" && ter.owner === player?.id) {
        dispatch({ type: "PLACE_INITIAL", territory: id });
        return;
      }
      if (phase === "attack") {
        if (selected && targets.has(id)) {
          const maxDice = Math.max(
            1,
            Math.min(3, (game.territories[selected]?.armies ?? 2) - 1),
          );
          dispatch({
            type: "ATTACK",
            from: selected,
            to: id,
            dice: Math.min(diceCount, maxDice),
          });
          setSelected(null);
          return;
        }
        if (ter.owner === player?.id && ter.armies >= 2) {
          setSelected(id === selected ? null : id);
          return;
        }
      }
      if (phase === "fortify") {
        if (game.fortifyUsed) {
          if (id !== selected) setSelected(null);
          return;
        }
        if (selected && targets.has(id)) {
          // Stage the march — the MARCH button in the panel commits it.
          const maxMove = Math.max(
            1,
            (game.territories[selected]?.armies ?? 2) - 1,
          );
          setStagedMove({ from: selected, to: id, count: maxMove });
          return;
        }
        if (ter.owner === player?.id) {
          setStagedMove(null);
          setSelected(id === selected ? null : id);
          return;
        }
      }
      if (phase === "reinforcement" && ter.owner === player?.id) {
        if (game.mustTrade || game.reinforcementsRemaining < 1) {
          setSelected(id === selected ? null : id);
          return;
        }
        // Tap-to-place: every tap drops one army here.
        dispatch({ type: "DEPLOY", territory: id, count: 1 });
        setSelected(id);
        return;
      }
      if (phase === "sameTimeReinforce" && ter.owner === player?.id) {
        const remaining =
          game.sameTime?.reinforcementsRemaining[player.id] ?? 0;
        if (player.cards.length >= 5 || remaining < 1) {
          setSelected(id === selected ? null : id);
          return;
        }
        dispatch({ type: "DEPLOY", territory: id, count: 1 });
        setSelected(id);
        return;
      }
      if (phase === "sameTimeBattle") {
        if (selected && targets.has(id)) {
          const selTer = game.territories[selected];
          const committed = (game.sameTime?.orders ?? [])
            .filter((o) => o.player === player?.id && o.from === selected)
            .reduce((sum, o) => sum + o.count, 0);
          const maxCount = Math.max(1, (selTer?.armies ?? 2) - 1 - committed);
          setStagedMove({ from: selected, to: id, count: maxCount });
          return;
        }
        if (ter.owner === player?.id) {
          setStagedMove(null);
          setSelected(id === selected ? null : id);
          return;
        }
      }
      if (phase === "sameTimeMove") {
        if (selected && targets.has(id)) {
          const selTer = game.territories[selected];
          const committed = (game.sameTime?.moves ?? [])
            .filter((m) => m.player === player?.id && m.from === selected)
            .reduce((sum, m) => sum + m.count, 0);
          const maxCount = Math.max(1, (selTer?.armies ?? 2) - 1 - committed);
          setStagedMove({ from: selected, to: id, count: maxCount });
          return;
        }
        if (ter.owner === player?.id) {
          setStagedMove(null);
          setSelected(id === selected ? null : id);
          return;
        }
      }
      if (id !== selected) setSelected(null);
    },
    [game, selected, targets, diceCount, isHumanActive, dispatch, player],
  );

  // ── Victory / game-over exit ───────────────────────────────────────────────
  const handleVictoryExit = useCallback(async () => {
    if (onVictoryExit) {
      await onVictoryExit();
      return;
    }
    if (isTournamentGame && game.phase === "gameOver") {
      // Score this tournament battle, then return to tournament screen
      const result = tournamentResult(game);
      await abandonGame();
      recordResult(result);
      router.replace("/tournament");
    } else {
      await abandonGame();
      router.replace("/");
    }
  }, [
    isTournamentGame,
    game,
    abandonGame,
    onVictoryExit,
    recordResult,
    router,
  ]);

  // ── View mode cycle ────────────────────────────────────────────────────────
  const cycleViewMode = useCallback(() => {
    setViewMode((m) => {
      const idx = MAP_VIEW_MODES.indexOf(m);
      return MAP_VIEW_MODES[(idx + 1) % MAP_VIEW_MODES.length];
    });
  }, []);

  // ── Election UI ────────────────────────────────────────────────────────────
  const renderElectionPanel = () => {
    const election = game.election;
    if (!election || game.phase !== "election") return null;
    if (game.currentPlayer !== player?.id) return null;
    const tName = TERRITORY_MAP[election.territory]?.name ?? election.territory;
    const budget = electionBudget(game, player.id);
    const points = election.points[player.id] ?? 0;
    return (
      <FieldPanel style={styles.electionPanel}>
        <SectionHeader index={1} title={`Auction — ${tName}`} />
        <Text style={styles.electionBid}>Current bid: {election.bid}</Text>
        <Text style={styles.electionPoints}>
          Your points: {points} (budget: {budget})
        </Text>
        <View style={styles.electionBtns}>
          {election.bid + 5 <= budget && (
            <Pressable
              onPress={() => dispatch({ type: "ELECTION_BID", raise: 5 })}
              style={styles.bidBtn}
            >
              <Text style={styles.bidBtnText}>Bid +5</Text>
            </Pressable>
          )}
          {election.bid + 10 <= budget && (
            <Pressable
              onPress={() => dispatch({ type: "ELECTION_BID", raise: 10 })}
              style={styles.bidBtn}
            >
              <Text style={styles.bidBtnText}>Bid +10</Text>
            </Pressable>
          )}
          {election.highBidder !== player.id &&
            !election.passed.includes(player.id) && (
              <Pressable
                onPress={() => dispatch({ type: "ELECTION_PASS" })}
                style={styles.passBtn}
              >
                <Text style={styles.passBtnText}>Pass</Text>
              </Pressable>
            )}
        </View>
      </FieldPanel>
    );
  };

  return (
    <View style={styles.container}>
      {/* MAP — full bleed behind the floating chrome */}
      <View style={StyleSheet.absoluteFillObject}>
        <GameMap
          game={game}
          selected={selected}
          targets={targets}
          interactive={interactive}
          viewMode={viewMode}
          rendererMode={rendererMode}
          onTerritoryTap={handleTerritoryTap}
          onPerformanceEvidence={
            MAP_PERFORMANCE_QUALIFICATION_ENABLED
              ? handlePerformanceEvidence
              : undefined
          }
        />
      </View>

      {/* Continent bonuses — screen-space so map panning can't slice it */}
      <View
        style={[
          styles.legendOverlay,
          isLandscape && styles.legendOverlayLandscape,
        ]}
        pointerEvents="none"
      >
        <ContinentLegend />
      </View>

      {/* Floating imperial command bar */}
      <SafeAreaView
        edges={["top"]}
        style={styles.topBar}
        pointerEvents="box-none"
      >
        <TopBar
          game={game}
          onExit={() => {
            if (onExit) {
              onExit();
              return;
            }
            Alert.alert(
              "Exit Campaign",
              "Return to the hall? Progress is auto-saved.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Exit",
                  style: "destructive",
                  onPress: () =>
                    router.replace(isTournamentGame ? "/tournament" : "/"),
                },
              ],
            );
          }}
        />
        {statusBanner}
        {/* View-mode rail (web's Layers list) */}
        <View style={styles.viewRail} pointerEvents="box-none">
          <Pressable
            testID="map-renderer-toggle"
            accessibilityLabel={`Use ${rendererMode === "r3f" ? "2D" : "3D"} map renderer`}
            onPress={() =>
              setRendererMode((mode) => (mode === "r3f" ? "svg" : "r3f"))
            }
            style={styles.viewModeBtn}
          >
            <Ionicons
              name={rendererMode === "r3f" ? "cube-outline" : "map-outline"}
              size={14}
              color="#ead69d"
            />
            <Text style={styles.viewModeText}>
              {rendererMode === "r3f" ? "3D" : "2D"}
            </Text>
          </Pressable>
          <Pressable
            testID="map-view-mode-button"
            onPress={cycleViewMode}
            style={styles.viewModeBtn}
          >
            <Text style={styles.viewModeText}>
              {MAP_VIEW_LABELS[viewMode].toUpperCase()}
            </Text>
          </Pressable>
          {MAP_PERFORMANCE_QUALIFICATION_ENABLED &&
          rendererMode === "r3f" ? (
            <Pressable
              testID="map-performance-evidence"
              accessibilityRole="button"
              accessibilityLabel={`Map performance qualification ${performanceStatus}`}
              accessibilityState={{
                disabled: !shareablePerformanceEvidence,
              }}
              disabled={!shareablePerformanceEvidence}
              onPress={sharePerformanceEvidence}
              style={({ pressed }) => [
                styles.performanceEvidenceBtn,
                { borderColor: performanceColor },
                pressed && styles.performanceEvidenceBtnPressed,
              ]}
            >
              <Ionicons
                name={performanceIcon}
                size={17}
                color={performanceColor}
              />
            </Pressable>
          ) : null}
          <Pressable
            onPress={cycleBattleSceneMode}
            style={styles.viewModeBtn}
            accessibilityLabel="Battle scene pacing"
          >
            <Text style={styles.viewModeText}>
              BATTLES: {BATTLE_SCENE_LABELS[sceneMode]}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Phase chapter card — non-blocking toast, human turns only */}
      <PhaseBanner game={game} />

      {/* Floating bottom chrome */}
      <SafeAreaView
        edges={isLandscape ? ["bottom", "right"] : ["bottom"]}
        style={isLandscape ? styles.bottomChromeLandscape : styles.bottomChrome}
        pointerEvents="box-none"
      >
        {/* War dispatches — translucent ticker, the original's scrolling readout */}
        {game.phase !== "gameOver" && (
          <View style={styles.tickerWrap} pointerEvents="none">
            <EventTicker game={game} />
          </View>
        )}

        {/* Battle report (inline, shown above panel) — auto-hides after a beat */}
        {game.phase === "attack" && (
          <TransientBattleReport game={game} style={styles.battleContainer} />
        )}

        {/* Election panel */}
        {game.phase === "election" && isHumanActive && renderElectionPanel()}

        {/* Bottom action panel */}
        {game.phase !== "gameOver" && (
          <View
            testID="map-command-panel"
            style={[styles.bottomBar, isLandscape && styles.bottomBarLandscape]}
          >
            <GamePanel
              game={game}
              selected={selected}
              targets={targets}
              stagedMove={stagedMove}
              setStagedMove={setStagedMove}
              diceCount={diceCount}
              setDiceCount={setDiceCount}
              dispatch={dispatch}
              onOpenCards={() => setCardsOpen(true)}
              onOpenRoster={() => setRosterOpen(true)}
              onOpenLog={() => setLogOpen(true)}
              canAct={canSubmitCurrentPlayer}
              inactiveHint={inactiveHint}
            />
          </View>
        )}
      </SafeAreaView>

      {/* Roster overlay */}
      {rosterOpen && (
        <View testID="map-roster-overlay" style={styles.rosterOverlay}>
          <View style={styles.rosterHeader}>
            <Text style={styles.rosterTitle}>COMMANDERS</Text>
            <Pressable
              onPress={() => setRosterOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close commander roster"
            >
              <Text style={styles.rosterClose}>✕</Text>
            </Pressable>
          </View>
          <PlayerRoster
            game={game}
            dispatch={canSubmitCurrentPlayer ? dispatch : undefined}
          />
        </View>
      )}

      {/* Cinematic battle overlay */}
      <BattleView
        game={game}
        dispatch={canSubmitCurrentPlayer ? dispatch : () => {}}
      />

      {/* Modals */}
      {canSubmitCurrentPlayer && (
        <HandoffOverlay game={game} dispatch={dispatch} />
      )}
      {canSubmitCurrentPlayer && (
        <OccupyOverlay game={game} dispatch={dispatch} />
      )}
      {canSubmitCurrentPlayer && (
        <ProposalOverlay game={game} dispatch={dispatch} />
      )}
      {canSubmitCurrentPlayer && (
        <SameTimeBattlePlayback game={game} dispatch={dispatch} />
      )}
      <VictoryOverlay
        game={game}
        onExit={handleVictoryExit}
        viewerPlayerId={localPlayerId}
      />

      <CardHand
        game={game}
        dispatch={dispatch}
        open={cardsOpen && canSubmitCurrentPlayer}
        onClose={() => setCardsOpen(false)}
      />

      <DispatchLog
        game={game}
        visible={logOpen}
        onClose={() => setLogOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  legendOverlay: { position: "absolute", left: 10, bottom: 128, zIndex: 5 },
  legendOverlayLandscape: { bottom: 10 },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  viewRail: { alignItems: "flex-start", paddingLeft: 8, paddingTop: 8, gap: 6 },
  viewModeBtn: {
    borderWidth: 1,
    borderColor: "rgba(222,190,115,0.4)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: MapHud.control,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  viewModeText: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.gold,
    fontFamily: "Alegreya_600SemiBold",
    fontSize: 9,
    letterSpacing: 2,
  },
  performanceEvidenceBtn: {
    width: 30,
    height: 28,
    borderWidth: 1,
    backgroundColor: MapHud.control,
    alignItems: "center",
    justifyContent: "center",
  },
  performanceEvidenceBtnPressed: {
    opacity: 0.72,
  },
  bottomChrome: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  bottomChromeLandscape: {
    position: "absolute",
    bottom: 0,
    right: 0,
    zIndex: 10,
    width: 348,
    paddingRight: 6,
    paddingBottom: 6,
  },
  tickerWrap: { paddingHorizontal: 12, marginBottom: 2 },
  battleContainer: { paddingHorizontal: 12, paddingVertical: 4 },
  bottomBar: {
    backgroundColor: MapHud.surface,
    borderTopWidth: 1,
    borderTopColor: "rgba(222,190,115,0.28)",
  },
  bottomBarLandscape: {
    borderWidth: 1,
    borderColor: "rgba(222,190,115,0.3)",
  },

  // Election (parchment field panel)
  electionPanel: { marginHorizontal: 10, marginBottom: 8 },
  electionBid: {
    color: Colors.ink,
    fontFamily: "Alegreya_500Medium",
    fontSize: 14,
  },
  electionPoints: {
    color: Colors.inkMuted,
    fontFamily: "Alegreya_400Regular",
    fontSize: 12,
    marginBottom: 8,
  },
  electionBtns: { flexDirection: "row", gap: 8 },
  bidBtn: {
    backgroundColor: Colors.crimson,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  bidBtnText: {
    color: Colors.primaryFg,
    fontFamily: "Alegreya_700Bold",
    fontSize: 13,
    letterSpacing: 1,
  },
  passBtn: {
    borderWidth: 1,
    borderColor: Colors.parchmentBorder,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  passBtnText: {
    color: Colors.inkMuted,
    fontFamily: "Alegreya_500Medium",
    fontSize: 13,
  },

  // Roster overlay
  rosterOverlay: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 240,
    backgroundColor: MapHud.focused,
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
    padding: 12,
    gap: 12,
    zIndex: 100,
  },
  rosterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rosterTitle: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.gold,
    fontFamily: "Alegreya_700Bold",
    fontSize: 12,
    letterSpacing: 3,
  },
  rosterClose: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.textMuted,
    fontSize: 18,
    padding: 4,
  },
});
