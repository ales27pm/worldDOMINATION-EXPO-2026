import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import { MAP_H, MAP_W, type Camera } from "../../game/camera";
import {
  applyCameraIntent,
  beginCameraInertia,
  createMapCameraRuntime,
  panCameraIntent,
  perspectivePoseForCamera,
  screenPointToBoard,
  stepMapCameraRuntime,
  zoomCameraIntent,
  type CameraIntent,
} from "../../game/mapCameraIntent";

const ASPECT = 3 / 2;

function snapIntent(target: Camera): CameraIntent {
  return { reason: "initial", target, transition: "snap" };
}

test("screen and pan intents use the canonical camera contract", () => {
  const camera = { cx: 768, cy: 512, vw: 600 };
  deepEqual(screenPointToBoard(camera, 1200, 800, 600, 400), {
    x: camera.cx,
    y: camera.cy,
  });

  const panned = panCameraIntent(camera, ASPECT, 1200, 120, -60);
  equal(panned.reason, "pan");
  equal(panned.transition, "snap");
  equal(panned.target.cx, 708);
  equal(panned.target.cy, 542);
  equal(panned.target.vw, camera.vw);
});

test("zoom intent preserves its focal board point", () => {
  const camera = { cx: 700, cy: 420, vw: 900 };
  const focalPoint = { x: 940, y: 510 };
  const intent = zoomCameraIntent(
    camera,
    ASPECT,
    focalPoint,
    450,
    "wheel",
    "spring",
  );

  equal(
    (focalPoint.x - camera.cx) / camera.vw,
    (focalPoint.x - intent.target.cx) / intent.target.vw,
  );
  equal(
    (focalPoint.y - camera.cy) / camera.vw,
    (focalPoint.y - intent.target.cy) / intent.target.vw,
  );
});

test("camera runtime converges consistently at 60 Hz and 120 Hz", () => {
  const integrate = (fps: number) => {
    const runtime = createMapCameraRuntime(
      snapIntent({ cx: 768, cy: 512, vw: 1200 }),
    );
    applyCameraIntent(runtime, {
      reason: "focus",
      target: { cx: 520, cy: 390, vw: 460 },
      transition: "spring",
    });
    for (let frame = 0; frame < fps * 2; frame += 1) {
      stepMapCameraRuntime(runtime, 1 / fps, ASPECT);
    }
    return runtime;
  };

  const sixty = integrate(60);
  const oneTwenty = integrate(120);
  deepEqual(sixty.current, { cx: 520, cy: 390, vw: 460 });
  deepEqual(sixty.current, oneTwenty.current);
  equal(sixty.motion, "idle");
  equal(oneTwenty.motion, "idle");
});

test("camera inertia decays and remains inside legal board bounds", () => {
  const runtime = createMapCameraRuntime(
    snapIntent({ cx: 768, cy: 512, vw: 600 }),
  );
  beginCameraInertia(runtime, 900, -500);
  for (let frame = 0; frame < 240; frame += 1) {
    stepMapCameraRuntime(runtime, 1 / 120, ASPECT);
  }

  equal(runtime.motion, "idle");
  ok(runtime.current.cx >= runtime.current.vw / 2);
  ok(runtime.current.cx <= MAP_W - runtime.current.vw / 2);
  ok(runtime.current.cy >= runtime.current.vw / ASPECT / 2);
  ok(runtime.current.cy <= MAP_H - runtime.current.vw / ASPECT / 2);
});

test("perspective pose maps board center to the 3D scene origin", () => {
  const pose = perspectivePoseForCamera(
    { cx: MAP_W / 2, cy: MAP_H / 2, vw: MAP_W },
    ASPECT,
  );

  deepEqual(pose.target, [0, 0, 0]);
  equal(pose.position[0], 0);
  ok(pose.position[1] > 0);
  ok(pose.position[2] > 0);
  equal(pose.fov, 35);
  ok(pose.near > 0);
  ok(pose.far > pose.position[1]);
});
