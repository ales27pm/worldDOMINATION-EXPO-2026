import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";

import { campaignEventFeedSnapshot, shouldHighlightNewestEvent } from "../../game/eventFeed";
import type { LogEntry } from "../../game/types";

function event(id: number, turn = id, text = `Event ${id}`): LogEntry {
  return {
    id,
    turn,
    text,
    tone: id % 2 === 0 ? "battle" : "info",
  };
}

test("campaign event feed snapshot limits to the most recent events", () => {
  const snapshot = campaignEventFeedSnapshot([1, 2, 3, 4, 5, 6].map((id) => event(id)));

  equal(snapshot.recentEvents.length, 4);
  deepEqual(snapshot.recentEvents.map((entry) => entry.turn), [1, 2, 3, 4]);
  deepEqual(snapshot.displayEvents.map((entry) => entry.turn), [4, 3, 2, 1]);
  deepEqual(snapshot.recentEventIds, [1, 2, 3, 4]);
  deepEqual(snapshot.visibleEventIds, [1, 2, 3, 4]);
  equal(snapshot.newestEventId, 1);
  equal(snapshot.newestTurnLabel, "Turn 1");
  equal(snapshot.showsEmptyState, false);
});

test("campaign event feed snapshot reports empty state without events", () => {
  const snapshot = campaignEventFeedSnapshot([]);

  deepEqual(snapshot.recentEvents, []);
  deepEqual(snapshot.displayEvents, []);
  deepEqual(snapshot.recentEventIds, []);
  deepEqual(snapshot.visibleEventIds, []);
  equal(snapshot.newestEventId, null);
  equal(snapshot.newestTurnLabel, null);
  equal(snapshot.showsEmptyState, true);
});

test("campaign event feed highlight triggers only when newest event changes", () => {
  const initial = campaignEventFeedSnapshot([event(1, 3, "Turn Ended")]);
  const unchangedNewest = campaignEventFeedSnapshot([
    event(1, 3, "Turn Ended"),
    event(2, 2, "Income"),
  ]);
  const changedNewest = campaignEventFeedSnapshot([
    event(2, 4, "New Turn"),
    event(1, 3, "Turn Ended"),
  ]);

  equal(shouldHighlightNewestEvent(initial, null), false);
  equal(shouldHighlightNewestEvent(unchangedNewest, 1), false);
  equal(shouldHighlightNewestEvent(changedNewest, 1), true);
});

test("campaign event feed snapshot allows custom limits", () => {
  const snapshot = campaignEventFeedSnapshot([event(1), event(2), event(3)], 2);

  equal(snapshot.recentEvents.length, 2);
  deepEqual(snapshot.recentEvents.map((entry) => entry.turn), [1, 2]);
  deepEqual(snapshot.displayEvents.map((entry) => entry.turn), [2, 1]);
  deepEqual(snapshot.visibleEventIds, [1, 2]);
});
