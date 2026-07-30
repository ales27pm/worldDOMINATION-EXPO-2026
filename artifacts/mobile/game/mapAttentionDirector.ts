import {
  MAP_H,
  MAP_W,
  clampCamera,
  type Camera,
} from "./camera";
import { MAP_SCENE_UNITS_PER_PIXEL } from "./mapSceneGeometry";
import type { TerritoryId } from "./types";

export type MapAttentionSource = "user" | "game" | "system";
export type MapAttentionCancelReason =
  | "manual"
  | "background"
  | "modal"
  | "explicit";

export interface MapAttentionRequest {
  key: string;
  targetIds?: readonly TerritoryId[];
  camera?: Camera;
  priority: number;
  source?: MapAttentionSource;
  label?: string;
  padding?: number;
  minViewWidth?: number;
  ttlMs?: number;
  force?: boolean;
}

export interface ResolvedMapAttentionRequest
  extends Omit<MapAttentionRequest, "source" | "targetIds" | "camera"> {
  source: MapAttentionSource;
  targetIds: TerritoryId[];
  camera?: Camera;
  issuedAt: number;
  padding: number;
  minViewWidth: number;
  ttlMs: number;
}

export type MapAttentionEvent =
  | { type: "focus"; request: ResolvedMapAttentionRequest }
  | { type: "cancel"; reason: MapAttentionCancelReason };

export interface MapAttentionDirectorOptions {
  coalesceWindowMs?: number;
  manualCooldownMs?: number;
  sameTargetCooldownMs?: number;
  minimumAutomaticMoveIntervalMs?: number;
  automaticMoveWindowMs?: number;
  maxAutomaticMovesPerWindow?: number;
  defaultPadding?: number;
  defaultMinViewWidth?: number;
  defaultRequestTtlMs?: number;
}

export interface MapAttentionScheduler {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

type Listener = (event: MapAttentionEvent) => void;

const DEFAULT_OPTIONS: Required<MapAttentionDirectorOptions> = {
  coalesceWindowMs: 120,
  manualCooldownMs: 2500,
  sameTargetCooldownMs: 800,
  minimumAutomaticMoveIntervalMs: 400,
  automaticMoveWindowMs: 10_000,
  maxAutomaticMovesPerWindow: 3,
  defaultPadding: 1.25,
  defaultMinViewWidth: 1,
  defaultRequestTtlMs: 1200,
};

const DEFAULT_SCHEDULER: MapAttentionScheduler = {
  now: Date.now,
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class MapAttentionDirector {
  private readonly listeners = new Set<Listener>();
  private readonly lastFocusedAt = new Map<string, number>();
  private readonly automaticDispatches: number[] = [];
  private readonly options: Required<MapAttentionDirectorOptions>;
  private pending: ResolvedMapAttentionRequest | null = null;
  private coalesceTimer: unknown = null;
  private manualDepth = 0;
  private manualUntil = 0;

  constructor(
    options: MapAttentionDirectorOptions = {},
    private readonly scheduler: MapAttentionScheduler = DEFAULT_SCHEDULER,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  request(input: MapAttentionRequest): boolean {
    const now = this.scheduler.now();
    const source = input.source ?? "game";
    if (this.manualDepth > 0 && !input.force) return false;
    if (
      now < this.manualUntil &&
      source !== "user" &&
      !input.force
    ) {
      return false;
    }
    const previousFocus = this.lastFocusedAt.get(input.key);
    if (
      previousFocus !== undefined &&
      now - previousFocus < this.options.sameTargetCooldownMs &&
      !input.force
    ) {
      return false;
    }
    if (
      !input.camera &&
      (!input.targetIds || input.targetIds.length === 0)
    ) {
      return false;
    }

    const request: ResolvedMapAttentionRequest = {
      ...input,
      source,
      targetIds: [...(input.targetIds ?? [])],
      camera: input.camera ? { ...input.camera } : undefined,
      issuedAt: now,
      padding: input.padding ?? this.options.defaultPadding,
      minViewWidth:
        input.minViewWidth ?? this.options.defaultMinViewWidth,
      ttlMs: input.ttlMs ?? this.options.defaultRequestTtlMs,
    };
    if (
      this.pending === null ||
      request.priority >= this.pending.priority
    ) {
      this.pending = request;
    }
    if (this.coalesceTimer === null) {
      this.coalesceTimer = this.scheduler.setTimeout(
        this.flushPending,
        this.options.coalesceWindowMs,
      );
    }
    return true;
  }

  beginManual(): void {
    this.manualDepth += 1;
    this.clearPending();
    this.emit({ type: "cancel", reason: "manual" });
  }

  endManual(cooldownMs = this.options.manualCooldownMs): void {
    if (this.manualDepth === 0) return;
    this.manualDepth -= 1;
    if (this.manualDepth === 0) {
      this.manualUntil = this.scheduler.now() + Math.max(0, cooldownMs);
    }
  }

  cancel(reason: MapAttentionCancelReason = "explicit"): void {
    this.clearPending();
    this.emit({ type: "cancel", reason });
  }

  dispose(): void {
    this.clearPending();
    this.listeners.clear();
  }

  private readonly flushPending = (): void => {
    this.coalesceTimer = null;
    const request = this.pending;
    this.pending = null;
    if (!request) return;

    const now = this.scheduler.now();
    if (now - request.issuedAt > request.ttlMs) return;
    if (this.manualDepth > 0 && !request.force) return;
    if (
      now < this.manualUntil &&
      request.source !== "user" &&
      !request.force
    ) {
      return;
    }
    const previousFocus = this.lastFocusedAt.get(request.key);
    if (
      previousFocus !== undefined &&
      now - previousFocus < this.options.sameTargetCooldownMs &&
      !request.force
    ) {
      return;
    }
    if (
      request.source !== "user" &&
      !request.force &&
      !this.consumeAutomaticBudget(now)
    ) {
      return;
    }

    this.lastFocusedAt.set(request.key, now);
    this.emit({ type: "focus", request });
  };

  private consumeAutomaticBudget(now: number): boolean {
    const oldestAllowed = now - this.options.automaticMoveWindowMs;
    while (
      this.automaticDispatches.length > 0 &&
      this.automaticDispatches[0] < oldestAllowed
    ) {
      this.automaticDispatches.shift();
    }
    const previous =
      this.automaticDispatches[this.automaticDispatches.length - 1];
    if (
      previous !== undefined &&
      now - previous < this.options.minimumAutomaticMoveIntervalMs
    ) {
      return false;
    }
    if (
      this.automaticDispatches.length >=
      this.options.maxAutomaticMovesPerWindow
    ) {
      return false;
    }
    this.automaticDispatches.push(now);
    return true;
  }

  private clearPending(): void {
    this.pending = null;
    if (this.coalesceTimer !== null) {
      this.scheduler.clearTimeout(this.coalesceTimer);
      this.coalesceTimer = null;
    }
  }

  private emit(event: MapAttentionEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export interface MapAttentionBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface MapAttentionWorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function validBounds(bounds: MapAttentionBounds): boolean {
  return (
    Number.isFinite(bounds.left) &&
    Number.isFinite(bounds.right) &&
    Number.isFinite(bounds.top) &&
    Number.isFinite(bounds.bottom) &&
    bounds.left <= bounds.right &&
    bounds.top <= bounds.bottom
  );
}

export class MapAttentionTargetRegistry {
  private readonly boundsById = new Map<TerritoryId, MapAttentionBounds>();

  register(id: TerritoryId, bounds: MapAttentionBounds): boolean {
    if (!validBounds(bounds)) return false;
    this.boundsById.set(id, { ...bounds });
    return true;
  }

  registerWorldBounds(
    id: TerritoryId,
    bounds: MapAttentionWorldBounds,
  ): boolean {
    return this.register(id, {
      left: bounds.minX / MAP_SCENE_UNITS_PER_PIXEL + MAP_W / 2,
      right: bounds.maxX / MAP_SCENE_UNITS_PER_PIXEL + MAP_W / 2,
      top: bounds.minZ / MAP_SCENE_UNITS_PER_PIXEL + MAP_H / 2,
      bottom: bounds.maxZ / MAP_SCENE_UNITS_PER_PIXEL + MAP_H / 2,
    });
  }

  get size(): number {
    return this.boundsById.size;
  }

  get(id: TerritoryId): MapAttentionBounds | undefined {
    const bounds = this.boundsById.get(id);
    return bounds ? { ...bounds } : undefined;
  }

  union(ids: readonly TerritoryId[]): MapAttentionBounds | null {
    let result: MapAttentionBounds | null = null;
    for (const id of ids) {
      const bounds = this.boundsById.get(id);
      if (!bounds) continue;
      result = result
        ? {
            left: Math.min(result.left, bounds.left),
            right: Math.max(result.right, bounds.right),
            top: Math.min(result.top, bounds.top),
            bottom: Math.max(result.bottom, bounds.bottom),
          }
        : { ...bounds };
    }
    return result;
  }

  cameraForTargets(
    ids: readonly TerritoryId[],
    aspect: number,
    minViewWidth: number,
    padding = DEFAULT_OPTIONS.defaultPadding,
  ): Camera | null {
    const bounds = this.union(ids);
    if (!bounds) return null;
    const safeAspect = Math.max(0.1, aspect);
    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;
    const width = Math.max(1, bounds.right - bounds.left);
    const height = Math.max(1, bounds.bottom - bounds.top);
    const viewWidth = Math.max(
      minViewWidth,
      Math.max(width, height * safeAspect) * Math.max(1, padding),
    );
    return clampCamera(
      { cx: centerX, cy: centerY, vw: viewWidth },
      safeAspect,
      1,
    );
  }
}

interface MapAttentionGeometry {
  boundingBox: {
    min: { x: number; z: number };
    max: { x: number; z: number };
  } | null;
  computeBoundingBox: () => void;
}

export function createMapAttentionTargetRegistry(
  territories: readonly {
    id: TerritoryId;
    meshName: string;
  }[],
  geometries: ReadonlyMap<string, MapAttentionGeometry>,
): MapAttentionTargetRegistry {
  const registry = new MapAttentionTargetRegistry();
  for (const territory of territories) {
    const geometry = geometries.get(territory.meshName);
    if (!geometry) continue;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds) continue;
    registry.registerWorldBounds(territory.id, {
      minX: bounds.min.x,
      maxX: bounds.max.x,
      minZ: bounds.min.z,
      maxZ: bounds.max.z,
    });
  }
  return registry;
}
