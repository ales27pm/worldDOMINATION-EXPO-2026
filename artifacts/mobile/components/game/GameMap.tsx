import React, { useCallback, useRef } from "react";
import { MapViewport } from "@/components/game/MapViewport";
import R3FGameMap from "@/components/game/R3FGameMap";
import {
  MAP_VIEW_LABELS,
  MAP_VIEW_MODES,
  WorldBoard,
  type MapViewMode,
} from "@/components/game/WorldBoard";
import { hitTestTerritory } from "@/game/mapGeometry";
import type { GameState, TerritoryId } from "@/game/types";

export { MAP_VIEW_LABELS, MAP_VIEW_MODES };
export type { MapViewMode };

export type MapRendererMode = "svg" | "r3f";

interface Props {
  game: GameState;
  selected: TerritoryId | null;
  targets: Set<TerritoryId>;
  interactive: Set<TerritoryId>;
  viewMode: MapViewMode;
  rendererMode?: MapRendererMode;
  onTerritoryTap: (id: TerritoryId) => void;
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
  rendererMode = "svg",
  onTerritoryTap,
}: Props) {
  const activeIdsRef = useRef(game.activeIds);
  activeIdsRef.current = game.activeIds;
  const onTapRef = useRef(onTerritoryTap);
  onTapRef.current = onTerritoryTap;

  const handleBoardTap = useCallback((x: number, y: number) => {
    const id = hitTestTerritory(x, y, activeIdsRef.current);
    if (id) onTapRef.current(id);
  }, []);

  const svgMap = (
    <MapViewport game={game} selected={selected} onBoardTap={handleBoardTap}>
      <WorldBoard
        game={game}
        selected={selected}
        targets={targets}
        interactive={interactive}
        viewMode={viewMode}
      />
    </MapViewport>
  );

  if (rendererMode === "r3f") {
    return (
      <RendererBoundary fallback={svgMap}>
        <R3FGameMap
          game={game}
          selected={selected}
          targets={targets}
          interactive={interactive}
          viewMode={viewMode}
          onTerritoryTap={onTerritoryTap}
        />
      </RendererBoundary>
    );
  }

  return svgMap;
}
