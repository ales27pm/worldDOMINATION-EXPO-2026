import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { MapViewport } from "@/components/game/MapViewport";
import {
  buildMapSceneModel,
  MAP_VIEW_LABELS,
  MAP_VIEW_MODES,
  type MapViewMode,
} from "@/game/mapSceneModel";
import { WorldBoard } from "@/components/game/WorldBoard";
import { hitTestTerritory } from "@/game/mapGeometry";
import type { MapPerformanceEvidence } from "@/game/mapPerformanceEvidence";
import {
  DEFAULT_MAP_RENDERER_MODE,
  type MapRendererMode,
} from "@/game/mapRendererMode";
import type { GameState, TerritoryId } from "@/game/types";

const R3FGameMap = React.lazy(() => import("@/components/game/R3FGameMap"));

export { MAP_VIEW_LABELS, MAP_VIEW_MODES };
export type { MapViewMode };
export type { MapRendererMode } from "@/game/mapRendererMode";

const MAP_SCENE_DEBUG_ENABLED = process.env.EXPO_PUBLIC_BROWSER_SMOKE === "1";

interface Props {
  game: GameState;
  selected: TerritoryId | null;
  targets: Set<TerritoryId>;
  interactive: Set<TerritoryId>;
  viewMode: MapViewMode;
  rendererMode?: MapRendererMode;
  viewerPlayerId?: number;
  qualificationBattleCount?: number;
  cameraControlsRightInset?: number;
  onTerritoryTap: (id: TerritoryId) => void;
  onPerformanceEvidence?: (evidence: MapPerformanceEvidence) => void;
}

interface RendererBoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
}

class RendererBoundary extends React.Component<
  RendererBoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("R3F map renderer failed; using the SVG fallback.", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * The campaign map: attention-directed camera viewport over the painted
 * world board — the mobile mirror of the web's MapViewport + WorldMap split.
 */
export default function GameMap({
  game,
  selected,
  targets,
  interactive,
  viewMode,
  rendererMode = DEFAULT_MAP_RENDERER_MODE,
  viewerPlayerId,
  qualificationBattleCount,
  cameraControlsRightInset,
  onTerritoryTap,
  onPerformanceEvidence,
}: Props) {
  const activeIdsRef = useRef(game.activeIds);
  activeIdsRef.current = game.activeIds;
  const onTapRef = useRef(onTerritoryTap);
  onTapRef.current = onTerritoryTap;

  const handleBoardTap = useCallback((x: number, y: number) => {
    const id = hitTestTerritory(x, y, activeIdsRef.current);
    if (id) onTapRef.current(id);
  }, []);
  const model = useMemo(
    () =>
      buildMapSceneModel(
        game,
        selected,
        targets,
        interactive,
        viewMode,
        viewerPlayerId,
      ),
    [game, interactive, selected, targets, viewerPlayerId, viewMode],
  );

  useEffect(() => {
    if (!MAP_SCENE_DEBUG_ENABLED) return;
    const root = globalThis as typeof globalThis & {
      __WORLD_DOMINATION_MAP_SCENE__?: Record<string, unknown>;
    };
    root.__WORLD_DOMINATION_MAP_SCENE__ = {
      contractVersion: model.contractVersion,
      rendererMode,
      sceneRevision: model.revision,
      variant: model.variant,
      viewMode: model.viewMode,
      territoryCount: model.territories.length,
    };
  }, [model, rendererMode]);

  const svgMap = (
    <MapViewport
      game={game}
      selected={selected}
      onBoardTap={handleBoardTap}
      cameraControlsRightInset={cameraControlsRightInset}
    >
      <WorldBoard game={game} model={model} />
    </MapViewport>
  );

  if (rendererMode === "r3f") {
    return (
      <RendererBoundary fallback={svgMap}>
        <Suspense fallback={svgMap}>
          <R3FGameMap
            game={game}
            model={model}
            qualificationBattleCount={qualificationBattleCount}
            cameraControlsRightInset={cameraControlsRightInset}
            onTerritoryTap={onTerritoryTap}
            onPerformanceEvidence={onPerformanceEvidence}
          />
        </Suspense>
      </RendererBoundary>
    );
  }

  return svgMap;
}
