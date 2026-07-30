import React, { useCallback, useRef } from 'react';
import { MapViewport } from '@/components/game/MapViewport';
import {
  MAP_VIEW_LABELS,
  MAP_VIEW_MODES,
  WorldBoard,
  type MapViewMode,
} from '@/components/game/WorldBoard';
import { hitTestTerritory } from '@/game/mapGeometry';
import type { GameState, TerritoryId } from '@/game/types';

export { MAP_VIEW_LABELS, MAP_VIEW_MODES };
export type { MapViewMode };

interface Props {
  game: GameState;
  selected: TerritoryId | null;
  targets: Set<TerritoryId>;
  interactive: Set<TerritoryId>;
  viewMode: MapViewMode;
  onTerritoryTap: (id: TerritoryId) => void;
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

  return (
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
}
