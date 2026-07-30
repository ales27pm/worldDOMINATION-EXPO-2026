import { activeTerritories, TERRITORY_MAP } from "./mapData";
import { SHAPES_H, SHAPES_W, TERRITORY_PATHS } from "./mapShapes";
import type { TerritoryId } from "./types";

/**
 * The painted atlas contains the extended-map North/West Africa split. Classic
 * games merge those two traced regions into the original North Africa shape.
 */
const CLASSIC_NORTH_AFRICA_PATH =
  "M708 455 L711 455 L715 459 L718 456 L721 457 L721 460 L725 464 L720 469 L723 473 L724 483 L720 486 L721 496 L717 501 L720 506 L721 517 L717 521 L718 531 L715 535 L735 552 L741 555 L750 553 L752 556 L758 557 L759 561 L763 565 L767 565 L775 575 L777 575 L779 580 L775 588 L777 595 L776 602 L771 605 L774 612 L774 623 L768 625 L763 631 L758 631 L752 640 L746 640 L738 649 L736 658 L741 664 L737 667 L737 672 L721 672 L719 674 L716 671 L716 669 L720 667 L719 660 L715 656 L709 656 L706 653 L700 652 L690 644 L685 644 L681 647 L674 645 L671 646 L668 651 L665 649 L661 651 L659 648 L655 648 L653 651 L647 651 L645 654 L642 654 L631 641 L627 643 L624 638 L621 638 L618 634 L620 632 L619 627 L613 623 L615 616 L612 613 L610 614 L609 612 L611 610 L603 604 L605 597 L602 588 L608 584 L607 579 L609 576 L608 565 L604 562 L608 552 L608 543 L611 544 L616 540 L616 529 L617 526 L625 520 L623 516 L630 516 L633 510 L642 504 L643 501 L641 500 L642 497 L640 494 L646 486 L647 481 L651 481 L660 469 L663 471 L672 470 L677 466 L679 467 L681 463 L683 464 L685 460 L688 461 L691 458 L699 459 L702 456 L708 456 Z M731 430 L736 430 L736 432 L727 443 L725 441 L719 442 L717 445 L712 443 L693 443 L696 438 L699 439 L702 437 L711 441 L713 439 L711 437 L712 434 L717 438 L723 438 L731 431 Z M750 452 L754 455 L752 458 L750 456 L748 458 L744 457 L739 462 L737 457 L738 455 L747 455 L750 453 Z";

export const CLASSIC_NORTH_AFRICA_SEAM = {
  x1: 609,
  y1: 575,
  x2: 777,
  y2: 575,
} as const;

export function getTerritoryPath(id: TerritoryId, includeExtra: boolean): string {
  if (id === "northAfrica" && !includeExtra) return CLASSIC_NORTH_AFRICA_PATH;
  return TERRITORY_PATHS[id];
}

interface HitShape {
  polys: number[][];
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

function parseHitShape(path: string): HitShape {
  const polys = path
    .split("M")
    .map((segment) => (segment.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number))
    .filter((coords) => coords.length >= 6);

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const poly of polys) {
    for (let index = 0; index < poly.length; index += 2) {
      x0 = Math.min(x0, poly[index]);
      x1 = Math.max(x1, poly[index]);
      y0 = Math.min(y0, poly[index + 1]);
      y1 = Math.max(y1, poly[index + 1]);
    }
  }

  return { polys, bbox: { x0, y0, x1, y1 } };
}

function buildHitShapes(includeExtra: boolean): Partial<Record<TerritoryId, HitShape>> {
  const shapes: Partial<Record<TerritoryId, HitShape>> = {};
  for (const territory of activeTerritories(includeExtra)) {
    shapes[territory.id] = parseHitShape(getTerritoryPath(territory.id, includeExtra));
  }
  return shapes;
}

const CLASSIC_HIT_SHAPES = buildHitShapes(false);
const EXTENDED_HIT_SHAPES = buildHitShapes(true);

function pointInPoly(px: number, py: number, poly: number[]): boolean {
  let inside = false;
  const count = poly.length / 2;
  for (let index = 0, previous = count - 1; index < count; previous = index++) {
    const xi = poly[index * 2];
    const yi = poly[index * 2 + 1];
    const xj = poly[previous * 2];
    const yj = poly[previous * 2 + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Resolve a board-space tap to the mode-specific SVG geometry, then fall back
 * to the nearest piece center for small islands and overhanging roundels.
 */
export function hitTestTerritory(
  x: number,
  y: number,
  activeIds: readonly TerritoryId[],
): TerritoryId | null {
  const includeExtra = activeIds.includes("westAfrica");
  const hitShapes = includeExtra ? EXTENDED_HIT_SHAPES : CLASSIC_HIT_SHAPES;

  for (const id of activeIds) {
    const shape = hitShapes[id];
    if (!shape) continue;
    const { bbox } = shape;
    if (x < bbox.x0 || x > bbox.x1 || y < bbox.y0 || y > bbox.y1) continue;
    if (shape.polys.some((poly) => pointInPoly(x, y, poly))) return id;
  }

  const boardScale = SHAPES_W / 1000;
  const threshold = boardScale * 30;
  const pieceHitOffsetY = boardScale * 9;
  let closest: TerritoryId | null = null;
  let minDistanceSquared = threshold * threshold;
  for (const id of activeIds) {
    const territory = TERRITORY_MAP[id];
    if (!territory) continue;
    const dx = x - territory.x * SHAPES_W;
    const dy = y - (territory.y * SHAPES_H + pieceHitOffsetY);
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < minDistanceSquared) {
      minDistanceSquared = distanceSquared;
      closest = id;
    }
  }
  return closest;
}
