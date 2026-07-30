import React, { useMemo } from "react";
import { Image as RNImage, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { WORLD_BOARD } from "@/lib/gameArt";
import { MapPiece } from "@/components/game/PieceSprite";
import { BattleArrowLayer } from "@/components/game/BattleArrowLayer";
import { borderThreat, largestEmpire } from "@/game/analysis";
import { activeTerritories, CONTINENTS, TERRITORY_MAP } from "@/game/mapData";
import {
  CLASSIC_NORTH_AFRICA_SEAM,
  getTerritoryPath,
} from "@/game/mapGeometry";
import { buildSeaRouteEdges } from "@/game/mapRoutes";
import {
  MAP_VIEW_LABELS,
  MAP_VIEW_MODES,
  type MapViewMode,
} from "@/game/mapSceneModel";
import { dominantPiece } from "@/game/pieces";
import { Fonts } from "@/constants/typography";
import { MAP_HUD_TEXT_SHADOW, MapHud } from "@/constants/mapHud";
import type { ContinentId, GameState, TerritoryId } from "@/game/types";

export { MAP_VIEW_LABELS, MAP_VIEW_MODES };
export type { MapViewMode };

export const W = 1536;
export const H = 1024;

const BOARD_SCALE = W / 1000;
const scaleBoard = (value: number) => value * BOARD_SCALE;

const INK = "#6b4a26";
const INK_DARK = "#4a3418";

const PIECE_BASE_OFFSET_Y = scaleBoard(18);
const PIECE_SHADOW_OFFSET_Y = PIECE_BASE_OFFSET_Y + scaleBoard(2);
const PIECE_SPRITE_BASE_OFFSET_Y = PIECE_BASE_OFFSET_Y + scaleBoard(1);
const ARMY_ROUNDEL_OFFSET_X = scaleBoard(13);
const ARMY_ROUNDEL_OFFSET_Y = PIECE_BASE_OFFSET_Y - scaleBoard(7);

/** Blue (safe/weak) → red (dangerous/strong) heat color. */
function heat(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  return `hsl(${Math.round(215 - 215 * clamped)}, 78%, 46%)`;
}

// ─── Presentational bits ──────────────────────────────────────────────────────

function OceanLabel({
  x,
  y,
  lines,
  size,
}: {
  x: number;
  y: number;
  lines: string[];
  size: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={[styles.oceanWrap, { left: x - 200, top: y - size }]}
    >
      {lines.map((line) => (
        <Text
          key={line}
          style={[
            styles.oceanText,
            { fontSize: size, letterSpacing: size * 0.4 },
          ]}
        >
          {line.toUpperCase()}
        </Text>
      ))}
    </View>
  );
}

interface WorldBoardProps {
  game: GameState;
  selected: TerritoryId | null;
  targets: Set<TerritoryId>;
  interactive: Set<TerritoryId>;
  viewMode: MapViewMode;
}

/**
 * The full 1536×1024 painted board with its cartographic overlay — mirrors
 * the web build's WorldMap.tsx. The painted board and the figures are native
 * RNImages (remote images inside react-native-svg are unreliable on iOS),
 * sandwiched between two SVG layers that carry the traced outlines, sea
 * routes, tints, rings, roundels, stars, labels, legend and frame.
 */
export const WorldBoard = React.memo(function WorldBoard({
  game,
  selected,
  targets,
  interactive,
  viewMode,
}: WorldBoardProps) {
  const defs = useMemo(
    () => activeTerritories(game.setup.useExtraTerritories),
    [game.setup.useExtraTerritories],
  );
  const edges = useMemo(
    () => buildSeaRouteEdges(game.setup.useExtraTerritories, W, H),
    [game.setup.useExtraTerritories],
  );
  const includeExtra = game.setup.useExtraTerritories;
  const capitals = useMemo(() => {
    // Capital RISK secrecy (manual, Ch. 6): capitals stay hidden from other
    // commanders until the reveal fires — a viewer always knows their own.
    const viewerId = game.players.find((p) => p.isHuman)?.id;
    const map = new Map<TerritoryId, number>();
    for (const p of game.players) {
      if (p.capital && (game.capitalsRevealed || p.id === viewerId))
        map.set(p.capital, p.id);
    }
    return map;
  }, [game.players, game.capitalsRevealed]);

  // View-modifier tint per territory (manual, Chapter 9: The View Modifier).
  const overlay = useMemo(() => {
    if (viewMode === "board") return null;
    const map = new Map<TerritoryId, string>();
    if (viewMode === "ownership") {
      for (const id of game.activeIds) {
        const owner = game.players[game.territories[id].owner];
        if (owner) map.set(id, owner.color);
      }
    } else if (viewMode === "threats") {
      for (const id of game.activeIds) {
        const territory = game.territories[id];
        if (territory.owner < 0) continue;
        const threat = borderThreat(game, id, territory.owner);
        const ratio = threat / Math.max(1, territory.armies);
        map.set(id, heat(ratio / 3));
      }
    } else if (viewMode === "strength") {
      const max = Math.max(
        1,
        ...game.activeIds.map((id) => game.territories[id].armies),
      );
      for (const id of game.activeIds) {
        if (game.territories[id].owner < 0) continue;
        map.set(id, heat(game.territories[id].armies / max));
      }
    } else if (viewMode === "empire") {
      for (const player of game.players) {
        if (!player.alive) continue;
        for (const id of largestEmpire(game, player.id)) {
          map.set(id, player.color);
        }
      }
    }
    return map;
  }, [game, viewMode]);

  return (
    <View style={styles.board} pointerEvents="none">
      {/* The painted Risk II world board (bundled with the app). Explicit
          size — bundled images otherwise render at intrinsic pixel size on
          web (inset-only styles lose the merge against it). */}
      <RNImage
        source={WORLD_BOARD}
        style={[StyleSheet.absoluteFillObject, { width: W, height: H }]}
        resizeMode="stretch"
        fadeDuration={0}
      />

      {/* Under layer: vignette, ocean lettering, sea routes, tints, rings */}
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={styles.svg}>
        <Defs>
          <RadialGradient id="seaVignette" cx="50%" cy="42%" r="85%">
            <Stop offset="0%" stopColor="hsl(30, 40%, 30%)" stopOpacity="0" />
            <Stop
              offset="75%"
              stopColor="hsl(30, 42%, 28%)"
              stopOpacity="0.05"
            />
            <Stop
              offset="100%"
              stopColor="hsl(28, 44%, 22%)"
              stopOpacity="0.28"
            />
          </RadialGradient>
          <LinearGradient
            id="chinaAtlasFill"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <Stop offset="0%" stopColor="#b6cf90" />
            <Stop offset="52%" stopColor="#abc886" />
            <Stop offset="100%" stopColor="#9fbd7a" />
          </LinearGradient>
        </Defs>
        <Rect width={W} height={H} fill="url(#seaVignette)" />

        {/* The raster is the painted texture; SVG remains the authoritative
            border layer. Hide the extended Africa seam in classic games. */}
        {!includeExtra && (
          <Line
            {...CLASSIC_NORTH_AFRICA_SEAM}
            stroke="#d4a044"
            strokeOpacity={0.96}
            strokeWidth={scaleBoard(1.5)}
            strokeLinecap="round"
          />
        )}
        <Path
          d={getTerritoryPath("china", includeExtra)}
          fill="url(#chinaAtlasFill)"
        />
        {defs.map((def) => (
          <Path
            key={`atlas-${def.id}`}
            d={getTerritoryPath(def.id, includeExtra)}
            fill="none"
            stroke={INK_DARK}
            strokeOpacity={0.48}
            strokeWidth={scaleBoard(0.75)}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Sea routes — classic red dashed lines */}
        {edges.map((edge) =>
          edge.segments.map((s, i) => (
            <Line
              key={`${edge.key}-${i}`}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke="#a63d2b"
              strokeOpacity={0.65}
              strokeWidth={scaleBoard(1.6)}
              strokeDasharray="5 5"
            />
          )),
        )}

        {/* View-modifier tints — fill the actual territory shape */}
        {overlay &&
          defs.map((def) => {
            const tint = overlay.get(def.id);
            if (!tint) return null;
            return (
              <Path
                key={`view-${def.id}`}
                d={getTerritoryPath(def.id, includeExtra)}
                fill={tint}
                fillOpacity={0.36}
                stroke={tint}
                strokeOpacity={0.8}
                strokeWidth={scaleBoard(1.4)}
              />
            );
          })}

        {/* Interactive shimmer on the board view (web shows it on hover; mobile marks tappable shapes) */}
        {viewMode === "board" &&
          defs.map((def) => {
            if (
              !interactive.has(def.id) ||
              targets.has(def.id) ||
              selected === def.id
            )
              return null;
            return (
              <Path
                key={`int-${def.id}`}
                d={getTerritoryPath(def.id, includeExtra)}
                fill="hsl(43, 88%, 55%)"
                fillOpacity={0.1}
                stroke="hsl(43, 88%, 40%)"
                strokeOpacity={0.5}
                strokeWidth={scaleBoard(1.2)}
              />
            );
          })}

        {/* Selection / target outlines on the traced territory borders */}
        {defs.map((def) => {
          const isSelected = selected === def.id;
          const isTarget = targets.has(def.id);
          if (!isSelected && !isTarget) return null;
          return (
            <Path
              key={`ring-${def.id}`}
              d={getTerritoryPath(def.id, includeExtra)}
              fill={
                isSelected
                  ? "hsla(43, 88%, 50%, 0.14)"
                  : "hsla(0, 70%, 45%, 0.12)"
              }
              stroke={isSelected ? "hsl(43, 88%, 40%)" : "#b3262a"}
              strokeWidth={scaleBoard(2.5)}
              strokeDasharray={isTarget ? "6 8" : undefined}
            />
          );
        })}

        {/* Pending occupy: mark the march route while the overlay is up */}
        {game.pendingOccupy && (
          <>
            <Path
              d={getTerritoryPath(game.pendingOccupy.from, includeExtra)}
              fill="none"
              stroke="hsl(43, 88%, 40%)"
              strokeWidth={scaleBoard(2)}
              strokeDasharray="6 4"
            />
            <Path
              d={getTerritoryPath(game.pendingOccupy.to, includeExtra)}
              fill="none"
              stroke="hsl(43, 88%, 40%)"
              strokeWidth={scaleBoard(2.5)}
            />
          </>
        )}

        {/* Unclaimed territory markers + piece shadows and plastic bases */}
        {defs.map((def) => {
          const territory = game.territories[def.id];
          const cx = def.x * W;
          const cy = def.y * H;
          if (territory.owner < 0) {
            const isInteractive = interactive.has(def.id);
            return (
              <G key={`node-${def.id}`}>
                <Circle
                  cx={cx}
                  cy={cy}
                  r={scaleBoard(11)}
                  fill="hsla(46, 55%, 88%, 0.55)"
                  stroke={isInteractive ? "hsl(43, 88%, 40%)" : INK}
                  strokeWidth={isInteractive ? scaleBoard(2) : scaleBoard(1.2)}
                  strokeDasharray="3 3"
                />
              </G>
            );
          }
          const owner = game.players[territory.owner];
          const color = owner?.color ?? "#666666";
          return (
            <G key={`node-${def.id}`}>
              <Ellipse
                cx={cx + scaleBoard(1)}
                cy={cy + PIECE_SHADOW_OFFSET_Y}
                rx={scaleBoard(14.5)}
                ry={scaleBoard(4.5)}
                fill="#2e2010"
                opacity={0.25}
              />
              {/* Plastic base the piece stands on */}
              <Ellipse
                cx={cx}
                cy={cy + PIECE_BASE_OFFSET_Y}
                rx={scaleBoard(13)}
                ry={scaleBoard(4.2)}
                fill={color}
                stroke="#3a2812"
                strokeWidth={scaleBoard(1.2)}
              />
            </G>
          );
        })}
      </Svg>

      {/* Ocean lettering */}
      <OceanLabel
        x={scaleBoard(75)}
        y={scaleBoard(392)}
        lines={["Pacific", "Ocean"]}
        size={scaleBoard(14)}
      />
      <OceanLabel
        x={scaleBoard(352)}
        y={scaleBoard(230)}
        lines={["Atlantic", "Ocean"]}
        size={scaleBoard(12)}
      />
      <OceanLabel
        x={scaleBoard(655)}
        y={scaleBoard(455)}
        lines={["Indian", "Ocean"]}
        size={scaleBoard(14)}
      />

      {/* Figures — native RNImages tinted per player */}
      {defs.map((def) => {
        const territory = game.territories[def.id];
        if (territory.owner < 0) return null;
        const owner = game.players[territory.owner];
        return (
          <MapPiece
            key={`piece-${def.id}`}
            type={dominantPiece(territory.armies)}
            color={owner?.color ?? "#666666"}
            cx={def.x * W}
            baseY={def.y * H + PIECE_SPRITE_BASE_OFFSET_Y}
            scale={BOARD_SCALE}
          />
        );
      })}

      {/* Over layer: capital stars, roundels, name labels — native Text
          (react-native-svg text is unreliable on web, so labels are RN) */}
      {defs.map((def) => {
        const territory = game.territories[def.id];
        const cx = def.x * W;
        const cy = def.y * H;
        if (territory.owner < 0) {
          return (
            <View
              key={`label-${def.id}`}
              pointerEvents="none"
              style={[
                styles.nameWrap,
                { left: cx - 100, top: cy + scaleBoard(17) },
              ]}
            >
              <Text style={styles.nameLabel}>{def.name}</Text>
            </View>
          );
        }
        const dim = !(interactive.has(def.id) || targets.has(def.id));
        return (
          <View
            key={`label-${def.id}`}
            pointerEvents="none"
            style={dim && styles.dimmed}
          >
            {capitals.has(def.id) && (
              <Text
                style={[
                  styles.capitalStar,
                  {
                    left: cx - scaleBoard(15) - 20,
                    top: cy - scaleBoard(12) - scaleBoard(11),
                  },
                ]}
              >
                ★
              </Text>
            )}
            {/* Muster-count roundel */}
            <View
              style={[
                styles.roundel,
                {
                  left: cx + ARMY_ROUNDEL_OFFSET_X - scaleBoard(8),
                  top: cy + ARMY_ROUNDEL_OFFSET_Y - scaleBoard(8),
                },
              ]}
            >
              <Text
                style={[
                  styles.roundelText,
                  territory.armies > 99 && { fontSize: scaleBoard(8) },
                ]}
              >
                {territory.armies}
              </Text>
            </View>
            <View
              style={[
                styles.nameWrap,
                { left: cx - 100, top: cy + scaleBoard(23) },
              ]}
            >
              <Text style={styles.nameLabel}>{def.name}</Text>
            </View>
          </View>
        );
      })}

      {/* Transient attack-order arrows — board space, over the figures */}
      <BattleArrowLayer game={game} w={W} h={H} />

      {/* Double map frame */}
      <Svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={styles.svg}
        pointerEvents="none"
      >
        <Rect
          x={scaleBoard(1.5)}
          y={scaleBoard(1.5)}
          width={W - scaleBoard(3)}
          height={H - scaleBoard(3)}
          fill="none"
          stroke="#7a5a2e"
          strokeWidth={scaleBoard(3)}
        />
        <Rect
          x={scaleBoard(7)}
          y={scaleBoard(7)}
          width={W - scaleBoard(14)}
          height={H - scaleBoard(14)}
          fill="none"
          stroke="#7a5a2e"
          strokeOpacity={0.6}
          strokeWidth={scaleBoard(1)}
        />
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  board: { position: "absolute", width: W, height: H },
  svg: {
    position: "absolute",
    left: 0,
    top: 0,
    backgroundColor: "transparent",
  },
  dimmed: { opacity: 0.94 },
  oceanWrap: { position: "absolute", width: 400, alignItems: "center" },
  oceanText: {
    color: "#8a6a3c",
    opacity: 0.8,
    fontFamily: Fonts.display,
    textAlign: "center",
    marginBottom: scaleBoard(4),
  },
  capitalStar: {
    position: "absolute",
    width: 40,
    textAlign: "center",
    fontSize: scaleBoard(13),
    lineHeight: scaleBoard(15),
    color: "#7a5a10",
    textShadowColor: "hsla(46, 60%, 90%, 0.9)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  roundel: {
    position: "absolute",
    width: scaleBoard(16),
    height: scaleBoard(16),
    borderRadius: scaleBoard(8),
    backgroundColor: "hsl(46, 62%, 90%)",
    borderWidth: scaleBoard(1),
    borderColor: INK,
    alignItems: "center",
    justifyContent: "center",
  },
  roundelText: {
    color: INK_DARK,
    fontFamily: Fonts.bodyBold,
    fontSize: scaleBoard(10),
    lineHeight: scaleBoard(13),
    textAlign: "center",
  },
  nameWrap: { position: "absolute", width: 200, alignItems: "center" },
  nameLabel: {
    color: INK_DARK,
    fontFamily: Fonts.map,
    fontSize: scaleBoard(10),
    lineHeight: scaleBoard(13),
    textAlign: "center",
    textShadowColor: "hsla(46, 60%, 88%, 0.95)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
});

// ─── Continent legend (screen-space) ─────────────────────────────────────────

/**
 * Continent bonus legend — rendered by the game screen's floating chrome, not
 * on the board itself. Pinned to board space it was sliced off by any camera
 * pan or portrait framing.
 */
export function ContinentLegend() {
  return (
    <View
      testID="map-continent-legend"
      style={legendStyles.wrap}
      pointerEvents="none"
    >
      {(Object.keys(CONTINENTS) as ContinentId[]).map((id) => (
        <View key={id} style={legendStyles.item}>
          <View
            style={[
              legendStyles.dot,
              { backgroundColor: CONTINENTS[id].color },
            ]}
          />
          <Text style={legendStyles.text}>
            {CONTINENTS[id].name} +{CONTINENTS[id].bonus}
          </Text>
        </View>
      ))}
    </View>
  );
}

const legendStyles = StyleSheet.create({
  wrap: {
    backgroundColor: MapHud.surface,
    borderWidth: 1,
    borderColor: "rgba(222,190,115,0.35)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 3,
  },
  item: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(222,190,115,0.6)",
  },
  text: {
    ...MAP_HUD_TEXT_SHADOW,
    color: "rgba(238,220,180,0.92)",
    fontFamily: Fonts.map,
    fontSize: 9.5,
  },
});
