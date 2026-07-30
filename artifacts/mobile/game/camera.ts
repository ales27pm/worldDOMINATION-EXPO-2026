import { TERRITORY_MAP } from "./mapData";
import type { GameState, TerritoryId } from "./types";

/** Map coordinate space (matches the painted board's SVG artwork). */
export const MAP_W = 1536;
export const MAP_H = 1024;

const MAP_SCALE = MAP_W / 1000;
const scaleMapDistance = (value: number) => value * MAP_SCALE;

/**
 * A camera over the board: center point plus view WIDTH in map units.
 * The view height is derived from the live viewport aspect ratio, so the
 * framed window always matches the phone's orientation exactly — portrait
 * gets a tall window, landscape a wide one, with zero letterboxing.
 */
export interface Camera {
  cx: number;
  cy: number;
  vw: number;
}

/** A weighted point of interest the attention camera tries to keep on screen. */
export interface AttentionPoint {
  id: TerritoryId;
  x: number;
  y: number;
  /** Relative importance — the camera maximizes covered weight. */
  weight: number;
  /** Required points must be inside the frame (targets, selections, battles). */
  required: boolean;
}

/** Deepest manual pinch/wheel zoom (view width in map units). */
export const MANUAL_MIN_VW = scaleMapDistance(170);

/**
 * Horizontal slack beyond the board edges so edge territories' overhanging
 * sprites and labels (New Zealand, Alaska) are not sliced by the frame.
 */
export const EDGE_PAD = scaleMapDistance(28);

/** Fraction of total attention weight a candidate frame must capture. */
const COVERAGE_TARGET = 0.82;
/** Zoom ladder resolution between tightest and widest candidate frames. */
const ZOOM_STEPS = 9;

/** Breathing room around a piece so its base, roundel and name stay in frame. */
const PAD_X = scaleMapDistance(52);
const PAD_TOP = scaleMapDistance(46);
const PAD_BOTTOM = scaleMapDistance(60);

/** Wrap-around neighbours (Alaska–Kamchatka) farther than this are not forced into frame. */
const REQUIRED_LINK_RANGE = scaleMapDistance(460);

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Smallest view width that shows the ENTIRE board at this aspect (contain). */
export function fitVw(aspect: number): number {
  return Math.max(MAP_W, MAP_H * aspect);
}

/** Largest view width whose window still lies fully INSIDE the board (cover). */
export function coverVw(aspect: number): number {
  return Math.min(MAP_W, MAP_H * aspect);
}

/** Deepest auto zoom for a viewport: tight cinematic frames on phones, gentler on desktops. */
export function autoMinVw(viewportPxWidth: number): number {
  return scaleMapDistance(viewportPxWidth > 0 && viewportPxWidth < 760 ? 250 : 430);
}

/** Keep the camera window legal: zoom bounded, center clamped so we never over-pan. */
export function clampCamera(cam: Camera, aspect: number, minVw: number = MANUAL_MIN_VW): Camera {
  const safeAspect = aspect > 0 ? aspect : MAP_W / MAP_H;
  const vw = clamp(cam.vw, Math.min(minVw, fitVw(safeAspect)), fitVw(safeAspect));
  const vh = vw / safeAspect;
  return {
    vw,
    cx: vw >= MAP_W ? MAP_W / 2 : clamp(cam.cx, vw / 2 - EDGE_PAD, MAP_W - vw / 2 + EDGE_PAD),
    cy: vh >= MAP_H ? MAP_H / 2 : clamp(cam.cy, vh / 2, MAP_H - vh / 2),
  };
}

/** SVG viewBox string for a camera at the given viewport aspect. */
export function viewBoxFor(cam: Camera, aspect: number): string {
  const safeAspect = aspect > 0 ? aspect : MAP_W / MAP_H;
  const vh = cam.vw / safeAspect;
  return `${(cam.cx - cam.vw / 2).toFixed(2)} ${(cam.cy - vh / 2).toFixed(2)} ${cam.vw.toFixed(2)} ${vh.toFixed(2)}`;
}

/** Whole-board camera (letterboxed on mismatched aspects — the widest legal view). */
export function fullCamera(aspect: number): Camera {
  return { cx: MAP_W / 2, cy: MAP_H / 2, vw: fitVw(aspect > 0 ? aspect : MAP_W / MAP_H) };
}

/** Vertical margin factor for the portrait default view (a hint of parchment above and below the board). */
const PORTRAIT_MARGIN = 1.06;

/**
 * Widest AUTO camera for a viewport. Landscape-ish aspects use the classic
 * contain fit; tall portrait screens get a height-fit view instead — the
 * contain view on a phone is ~2/3 empty parchment bands.
 */
export function defaultVw(aspect: number): number {
  const a = aspect > 0 ? aspect : MAP_W / MAP_H;
  if (a >= MAP_W / MAP_H) return fitVw(a);
  return Math.min(MAP_W, MAP_H * PORTRAIT_MARGIN * a);
}

/** Default resting camera — centered at the widest auto view. */
export function defaultCamera(aspect: number): Camera {
  return { cx: MAP_W / 2, cy: MAP_H / 2, vw: defaultVw(aspect) };
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  weight: number;
  required: boolean;
}

interface Bounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function toBoxes(points: AttentionPoint[]): Box[] {
  return points.map((p) => ({
    x0: p.x - PAD_X,
    x1: p.x + PAD_X,
    y0: p.y - PAD_TOP,
    y1: p.y + PAD_BOTTOM,
    weight: p.weight,
    required: p.required,
  }));
}

function unionBounds(boxes: Box[]): Bounds {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    if (b.x0 < x0) x0 = b.x0;
    if (b.x1 > x1) x1 = b.x1;
    if (b.y0 < y0) y0 = b.y0;
    if (b.y1 > y1) y1 = b.y1;
  }
  return { x0, x1, y0, y1 };
}

interface WindowResult {
  x0: number;
  y0: number;
  weight: number;
}

/**
 * Place a vw×vh window to maximize the attention weight it fully contains,
 * subject to (a) containing all required boxes and (b) staying within the
 * board where possible. Candidate offsets are box edges — the optimum for
 * axis-aligned containment always lies on one, so this scan is exact.
 */
function bestWindow(boxes: Box[], vw: number, vh: number, req: Bounds | null): WindowResult {
  const xMin = vw >= MAP_W ? (MAP_W - vw) / 2 : -EDGE_PAD;
  const xMax = vw >= MAP_W ? (MAP_W - vw) / 2 : MAP_W - vw + EDGE_PAD;
  const yMin = vh >= MAP_H ? (MAP_H - vh) / 2 : 0;
  const yMax = vh >= MAP_H ? (MAP_H - vh) / 2 : MAP_H - vh;
  let fxLo = xMin;
  let fxHi = xMax;
  let fyLo = yMin;
  let fyHi = yMax;
  if (req) {
    fxLo = Math.max(fxLo, req.x1 - vw);
    fxHi = Math.min(fxHi, req.x0);
    fyLo = Math.max(fyLo, req.y1 - vh);
    fyHi = Math.min(fyHi, req.y0);
    // Required span exceeds the window (or pushes past the board): center on it.
    if (fxLo > fxHi) fxLo = fxHi = (req.x0 + req.x1 - vw) / 2;
    if (fyLo > fyHi) fyLo = fyHi = (req.y0 + req.y1 - vh) / 2;
  }

  const xCands = new Set<number>([fxLo, fxHi]);
  for (const b of boxes) {
    xCands.add(clamp(b.x0, fxLo, fxHi));
    xCands.add(clamp(b.x1 - vw, fxLo, fxHi));
  }

  let best: WindowResult = { x0: (fxLo + fxHi) / 2, y0: (fyLo + fyHi) / 2, weight: -1 };
  for (const x0 of xCands) {
    const inX = boxes.filter((b) => b.x0 >= x0 - 0.5 && b.x1 <= x0 + vw + 0.5);
    const yCands = new Set<number>([fyLo, fyHi]);
    for (const b of inX) {
      yCands.add(clamp(b.y0, fyLo, fyHi));
      yCands.add(clamp(b.y1 - vh, fyLo, fyHi));
    }
    for (const y0 of yCands) {
      let weight = 0;
      for (const b of inX) {
        if (b.y0 >= y0 - 0.5 && b.y1 <= y0 + vh + 0.5) weight += b.weight;
      }
      if (weight > best.weight + 1e-6) best = { x0, y0, weight };
    }
  }
  return best;
}

/**
 * The attention solver: walk a zoom ladder from the tightest legal frame to
 * the whole board, and return the TIGHTEST window (at the viewport's exact
 * aspect) that contains every required point and captures enough of the
 * total attention mass. Wide, scattered focus no longer bails out to a full
 * view — the camera locks onto the dominant cluster instead.
 */
export function cameraForAttention(points: AttentionPoint[], aspect: number, minVw: number): Camera {
  const safeAspect = aspect > 0 ? aspect : MAP_W / MAP_H;
  if (points.length === 0) return defaultCamera(safeAspect);

  const boxes = toBoxes(points);
  const requiredBoxes = boxes.filter((b) => b.required);
  const req = requiredBoxes.length > 0 ? unionBounds(requiredBoxes) : null;
  const total = boxes.reduce((sum, b) => sum + b.weight, 0);
  // The width the required points genuinely need on screen together.
  const reqVw = req ? Math.max(req.x1 - req.x0, (req.y1 - req.y0) * safeAspect) : 0;
  // The zoom ladder normally tops out at the portrait-aware default view (no
  // empty bands), but long adjacencies — Alaska↔Kamchatka, Japan↔Hawaii —
  // must still fit whole, so the cap stretches up to the letterboxed contain
  // view when required points demand it.
  const maxVw = Math.min(Math.max(defaultVw(safeAspect), reqVw), fitVw(safeAspect));

  let lo = Math.max(minVw, reqVw);
  lo = Math.min(lo, maxVw);

  let fallback: Camera | null = null;
  for (let i = 0; i <= ZOOM_STEPS; i++) {
    const vw = lo >= maxVw ? maxVw : lo * Math.pow(maxVw / lo, i / ZOOM_STEPS);
    const vh = vw / safeAspect;
    const win = bestWindow(boxes, vw, vh, req);
    const cam = clampCamera({ cx: win.x0 + vw / 2, cy: win.y0 + vh / 2, vw }, safeAspect, 1);
    fallback = cam;
    if (win.weight >= COVERAGE_TARGET * total) return cam;
    if (lo >= maxVw) break;
  }
  return fallback ?? defaultCamera(safeAspect);
}

/**
 * The attention director: score every territory that matters for the current
 * game context. Required points (selections, targets, live battles) are
 * guaranteed on screen; weighted points bias the frame toward front lines,
 * big garrisons and contested ground. Empty output = show the whole board.
 */
export function computeAttention(game: GameState | null, selected: TerritoryId | null): AttentionPoint[] {
  if (!game || game.phase === "gameOver" || game.awaitingHandoff) return [];
  const player = game.players[game.currentPlayer];
  if (!player) return [];

  const active = new Set<TerritoryId>(game.activeIds);
  const pts = new Map<TerritoryId, AttentionPoint>();
  const add = (id: TerritoryId, weight: number, required = false) => {
    const def = TERRITORY_MAP[id];
    if (!def || !active.has(id)) return;
    const prev = pts.get(id);
    if (prev) {
      prev.weight = Math.max(prev.weight, weight);
      prev.required = prev.required || required;
    } else {
      pts.set(id, { id, x: def.x * MAP_W, y: def.y * MAP_H, weight, required });
    }
  };
  const distance = (a: TerritoryId, b: TerritoryId): number => {
    const da = TERRITORY_MAP[a];
    const db = TERRITORY_MAP[b];
    return Math.hypot((da.x - db.x) * MAP_W, (da.y - db.y) * MAP_H);
  };
  /** A player's empire, weighted toward contested borders and big garrisons. */
  const addOwned = (pid: number, frontBias = true) => {
    for (const id of game.activeIds) {
      const t = game.territories[id];
      if (t.owner !== pid) continue;
      let weight = 1;
      if (frontBias) {
        const hostile = TERRITORY_MAP[id].neighbors.filter(
          (n) => active.has(n) && game.territories[n].owner !== pid,
        ).length;
        weight += hostile * 0.6 + Math.min(1.2, Math.log2(Math.max(1, t.armies)) * 0.25);
      }
      add(id, weight);
    }
  };

  // A live election locks onto the contested ground and its influence ring.
  if (game.phase === "election" && game.election) {
    add(game.election.territory, 4, true);
    for (const n of TERRITORY_MAP[game.election.territory].neighbors) add(n, 1);
    return [...pts.values()];
  }

  // A conquest awaiting occupation locks onto the corridor of the advance.
  if (game.pendingOccupy) {
    add(game.pendingOccupy.from, 3, true);
    add(game.pendingOccupy.to, 4, true);
    for (const n of TERRITORY_MAP[game.pendingOccupy.to].neighbors) add(n, 0.5);
    return [...pts.values()];
  }

  const humanTurn = player.isHuman;

  switch (game.phase) {
    case "territoryGrab": {
      const unclaimed = game.activeIds.filter((id) => game.territories[id].owner === -1);
      if (unclaimed.length === 0 || unclaimed.length > 12) return [];
      for (const id of unclaimed) add(id, 1);
      break;
    }
    case "initialDeploy": {
      // Solo campaign: hold on the lone human's empire so the camera doesn't
      // bounce as AI placements interleave.
      const humans = game.players.filter((p) => p.isHuman && p.alive);
      if (humans.length !== 1) return [];
      addOwned(humans[0].id);
      break;
    }
    case "chooseCapital": {
      if (!humanTurn) return [];
      addOwned(player.id, false);
      break;
    }
    case "reinforcement": {
      addOwned(player.id);
      break;
    }
    case "attack": {
      if (humanTurn) {
        if (selected) {
          // The chosen army and every strike target must be on screen.
          add(selected, 5, true);
          for (const n of TERRITORY_MAP[selected].neighbors) {
            if (!active.has(n)) continue;
            const enemy = game.territories[n].owner !== player.id;
            const nearby = distance(selected, n) < REQUIRED_LINK_RANGE;
            add(n, enemy ? 3 : 0.5, enemy && nearby);
          }
        } else {
          // No selection: weight the whole front line — attack-ready armies
          // and the hostile ground they face. The solver picks the hottest
          // cluster that fits the screen.
          let anyFront = false;
          for (const id of game.activeIds) {
            const t = game.territories[id];
            if (t.owner !== player.id || t.armies < 2) continue;
            const hostile = TERRITORY_MAP[id].neighbors.filter(
              (n) => active.has(n) && game.territories[n].owner !== player.id,
            );
            if (hostile.length === 0) continue;
            anyFront = true;
            add(id, 1 + Math.min(2, Math.log2(t.armies) * 0.5));
            for (const n of hostile) add(n, 0.8);
          }
          if (!anyFront) addOwned(player.id);
        }
      } else if (game.lastBattle && game.lastBattle.attacker === game.currentPlayer) {
        // AI turn: follow the general's latest engagement.
        add(game.lastBattle.from, 3, true);
        add(game.lastBattle.to, 4, true);
        for (const n of TERRITORY_MAP[game.lastBattle.to].neighbors) add(n, 0.4);
      } else {
        addOwned(player.id);
      }
      break;
    }
    case "fortify": {
      if (humanTurn && selected) {
        add(selected, 5, true);
        for (const n of TERRITORY_MAP[selected].neighbors) {
          if (!active.has(n)) continue;
          const friendly = game.territories[n].owner === player.id;
          const nearby = distance(selected, n) < REQUIRED_LINK_RANGE;
          add(n, friendly ? 3 : 0.4, friendly && nearby);
        }
      } else {
        addOwned(player.id);
      }
      break;
    }
    case "sameTimeReinforce": {
      if (selected && game.territories[selected]?.owner === player.id) {
        add(selected, 5, true);
        for (const n of TERRITORY_MAP[selected].neighbors) add(n, 0.5);
      } else {
        addOwned(player.id);
      }
      break;
    }
    case "sameTimeBattle": {
      const orders = game.sameTime?.orders ?? [];
      const playback = game.sameTime?.playback ?? [];

      for (const report of playback) {
        add(report.from, 3, true);
        add(report.to, 4, true);
      }

      for (const order of orders.filter((o) => o.player === player.id)) {
        add(order.from, 3, true);
        add(order.to, 4, true);
        if (order.surgeTo) add(order.surgeTo, 2, false);
      }

      if (humanTurn && selected) {
        add(selected, 5, true);
        const committed = orders
          .filter((o) => o.player === player.id && o.from === selected)
          .reduce((sum, o) => sum + o.count, 0);
        const selectedState = game.territories[selected];
        if (selectedState?.owner === player.id && selectedState.armies - 1 - committed >= 1) {
          for (const n of TERRITORY_MAP[selected].neighbors) {
            if (!active.has(n)) continue;
            const enemy = game.territories[n].owner !== player.id;
            const nearby = distance(selected, n) < REQUIRED_LINK_RANGE;
            add(n, enemy ? 3 : 0.5, enemy && nearby);
          }
        }
      } else if (playback.length === 0 && orders.length === 0) {
        let anyFront = false;
        for (const id of game.activeIds) {
          const t = game.territories[id];
          if (t.owner !== player.id) continue;
          const committed = orders
            .filter((o) => o.player === player.id && o.from === id)
            .reduce((sum, o) => sum + o.count, 0);
          if (t.armies - 1 - committed < 1) continue;
          const hostile = TERRITORY_MAP[id].neighbors.filter(
            (n) => active.has(n) && game.territories[n].owner !== player.id,
          );
          if (hostile.length === 0) continue;
          anyFront = true;
          add(id, 1 + Math.min(2, Math.log2(t.armies) * 0.5));
          for (const n of hostile) add(n, 0.8);
        }
        if (!anyFront) addOwned(player.id);
      }
      break;
    }
    case "sameTimeMove": {
      const moves = game.sameTime?.moves ?? [];
      for (const move of moves.filter((m) => m.player === player.id)) {
        add(move.from, 3, true);
        add(move.to, 4, true);
      }

      if (humanTurn && selected) {
        add(selected, 5, true);
        const committed = moves
          .filter((m) => m.player === player.id && m.from === selected)
          .reduce((sum, m) => sum + m.count, 0);
        const selectedState = game.territories[selected];
        if (selectedState?.owner === player.id && selectedState.armies - 1 - committed >= 1) {
          for (const n of TERRITORY_MAP[selected].neighbors) {
            if (!active.has(n)) continue;
            const friendly = game.territories[n].owner === player.id;
            const nearby = distance(selected, n) < REQUIRED_LINK_RANGE;
            add(n, friendly ? 3 : 0.4, friendly && nearby);
          }
        }
      } else if (moves.length === 0) {
        addOwned(player.id);
      }
      break;
    }
    default:
      return [];
  }
  return [...pts.values()];
}
