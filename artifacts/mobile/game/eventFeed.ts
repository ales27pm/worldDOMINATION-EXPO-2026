import type { LogEntry } from "./types";

export interface CampaignEventFeedSnapshot {
  recentEvents: LogEntry[];
  displayEvents: LogEntry[];
  recentEventIds: number[];
  visibleEventIds: number[];
  newestEventId: number | null;
  newestTurnLabel: string | null;
  showsEmptyState: boolean;
}

const DEFAULT_LIMIT = 4;

function normalizedLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(0, Math.floor(limit));
}

export function campaignEventFeedSnapshot(
  events: readonly LogEntry[],
  limit = DEFAULT_LIMIT,
): CampaignEventFeedSnapshot {
  const recentEvents = events.slice(0, normalizedLimit(limit));
  const recentEventIds = recentEvents.map((entry) => entry.id);
  const newest = recentEvents[0] ?? null;

  return {
    recentEvents,
    displayEvents: [...recentEvents].reverse(),
    recentEventIds,
    visibleEventIds: recentEventIds,
    newestEventId: newest?.id ?? null,
    newestTurnLabel: newest ? `Turn ${newest.turn}` : null,
    showsEmptyState: recentEvents.length === 0,
  };
}

export function shouldHighlightNewestEvent(
  snapshot: CampaignEventFeedSnapshot,
  previousNewestEventId: number | null | undefined,
): boolean {
  return previousNewestEventId !== null &&
    previousNewestEventId !== undefined &&
    snapshot.newestEventId !== null &&
    snapshot.newestEventId !== previousNewestEventId;
}
