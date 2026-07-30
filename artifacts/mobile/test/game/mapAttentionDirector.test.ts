import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import {
  MapAttentionDirector,
  MapAttentionTargetRegistry,
  type MapAttentionEvent,
  type MapAttentionScheduler,
} from "../../game/mapAttentionDirector";

class FakeScheduler implements MapAttentionScheduler {
  private currentTime = 0;
  private nextId = 1;
  private readonly tasks = new Map<
    number,
    { callback: () => void; time: number }
  >();

  now = () => this.currentTime;

  setTimeout = (callback: () => void, delayMs: number): number => {
    const id = this.nextId++;
    this.tasks.set(id, {
      callback,
      time: this.currentTime + Math.max(0, delayMs),
    });
    return id;
  };

  clearTimeout = (handle: unknown): void => {
    this.tasks.delete(handle as number);
  };

  advance(milliseconds: number): void {
    this.currentTime += milliseconds;
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.time <= this.currentTime)
        .sort((a, b) => a[1].time - b[1].time || a[0] - b[0])[0];
      if (!next) return;
      this.tasks.delete(next[0]);
      next[1].callback();
    }
  }
}

function focusKeys(events: MapAttentionEvent[]): string[] {
  return events.flatMap((event) =>
    event.type === "focus" ? [event.request.key] : [],
  );
}

test("attention director coalesces equal-priority input to the latest target", () => {
  const scheduler = new FakeScheduler();
  const director = new MapAttentionDirector({}, scheduler);
  const events: MapAttentionEvent[] = [];
  director.subscribe((event) => events.push(event));

  ok(
    director.request({
      key: "territory:brazil",
      targetIds: ["brazil"],
      priority: 80,
      source: "user",
    }),
  );
  ok(
    director.request({
      key: "territory:china",
      targetIds: ["china"],
      priority: 80,
      source: "user",
    }),
  );
  scheduler.advance(120);

  deepEqual(focusKeys(events), ["territory:china"]);
});

test("attention director retains the highest-priority coalesced request", () => {
  const scheduler = new FakeScheduler();
  const director = new MapAttentionDirector({}, scheduler);
  const events: MapAttentionEvent[] = [];
  director.subscribe((event) => events.push(event));

  director.request({
    key: "critical",
    targetIds: ["china"],
    priority: 100,
    source: "system",
  });
  director.request({
    key: "ambient",
    targetIds: ["brazil"],
    priority: 40,
    source: "game",
  });
  scheduler.advance(120);

  deepEqual(focusKeys(events), ["critical"]);
});

test("manual gestures veto attention and leave a lease that explicit taps override", () => {
  const scheduler = new FakeScheduler();
  const director = new MapAttentionDirector({}, scheduler);
  const events: MapAttentionEvent[] = [];
  director.subscribe((event) => events.push(event));

  director.beginManual();
  equal(
    director.request({
      key: "remote",
      targetIds: ["china"],
      priority: 60,
    }),
    false,
  );
  equal(
    director.request({
      key: "tap-during-gesture",
      targetIds: ["china"],
      priority: 80,
      source: "user",
    }),
    false,
  );
  director.endManual();
  equal(
    director.request({
      key: "remote-during-lease",
      targetIds: ["china"],
      priority: 60,
    }),
    false,
  );
  ok(
    director.request({
      key: "explicit-tap",
      targetIds: ["china"],
      priority: 80,
      source: "user",
    }),
  );
  scheduler.advance(120);

  deepEqual(focusKeys(events), ["explicit-tap"]);
});

test("manual gesture depth prevents an overlapping gesture from releasing the veto", () => {
  const scheduler = new FakeScheduler();
  const director = new MapAttentionDirector({}, scheduler);

  director.beginManual();
  director.beginManual();
  director.endManual();
  equal(
    director.request({
      key: "still-blocked",
      targetIds: ["brazil"],
      priority: 80,
      source: "user",
    }),
    false,
  );
  director.endManual(0);
  ok(
    director.request({
      key: "released",
      targetIds: ["brazil"],
      priority: 80,
      source: "user",
    }),
  );
});

test("an unmatched gesture finalization does not create a manual lease", () => {
  const scheduler = new FakeScheduler();
  const director = new MapAttentionDirector({}, scheduler);
  const events: MapAttentionEvent[] = [];
  director.subscribe((event) => events.push(event));

  director.endManual();
  ok(
    director.request({
      key: "remote-after-unmatched-finalize",
      targetIds: ["china"],
      priority: 50,
      source: "game",
    }),
  );
  scheduler.advance(120);

  deepEqual(focusKeys(events), ["remote-after-unmatched-finalize"]);
});

test("attention director suppresses duplicate targets and enforces its automatic move budget", () => {
  const scheduler = new FakeScheduler();
  const director = new MapAttentionDirector(
    { coalesceWindowMs: 0 },
    scheduler,
  );
  const events: MapAttentionEvent[] = [];
  director.subscribe((event) => events.push(event));

  ok(
    director.request({
      key: "automatic-1",
      targetIds: ["brazil"],
      priority: 50,
    }),
  );
  scheduler.advance(0);
  equal(
    director.request({
      key: "automatic-1",
      targetIds: ["brazil"],
      priority: 50,
    }),
    false,
  );

  scheduler.advance(400);
  director.request({
    key: "automatic-2",
    targetIds: ["china"],
    priority: 50,
  });
  scheduler.advance(0);
  scheduler.advance(400);
  director.request({
    key: "automatic-3",
    targetIds: ["india"],
    priority: 50,
  });
  scheduler.advance(0);
  scheduler.advance(400);
  director.request({
    key: "automatic-4",
    targetIds: ["japan"],
    priority: 50,
  });
  scheduler.advance(0);

  deepEqual(focusKeys(events), [
    "automatic-1",
    "automatic-2",
    "automatic-3",
  ]);
});

test("cached target bounds frame one territory or a combat union at any aspect", () => {
  const registry = new MapAttentionTargetRegistry();
  ok(
    registry.register("brazil", {
      left: 300,
      right: 500,
      top: 550,
      bottom: 760,
    }),
  );
  ok(
    registry.register("northAfrica", {
      left: 650,
      right: 840,
      top: 430,
      bottom: 650,
    }),
  );
  equal(registry.size, 2);
  deepEqual(registry.union(["brazil", "northAfrica"]), {
    left: 300,
    right: 840,
    top: 430,
    bottom: 760,
  });

  for (const aspect of [390 / 844, 3 / 2, 844 / 390]) {
    const camera = registry.cameraForTargets(
      ["brazil", "northAfrica"],
      aspect,
      250,
      1.4,
    );
    ok(camera);
    const halfWidth = camera.vw / 2;
    const halfHeight = camera.vw / aspect / 2;
    ok(camera.cx - halfWidth <= 300);
    ok(camera.cx + halfWidth >= 840);
    ok(camera.cy - halfHeight <= 430);
    ok(camera.cy + halfHeight >= 760);
  }
});
