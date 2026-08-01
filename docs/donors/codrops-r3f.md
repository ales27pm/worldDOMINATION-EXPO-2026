# Codrops R3F Donors

## Context

- Target repository: `worldDOMINATION-EXPO-2026`
- Canonical workspace: `artifacts/mobile`
- Report inspection commit: `3d6f2b4d142d5d0b8554e8eb93ad4cf5ebbfb145`
- Integration base: `b156533cf6bfd9ffa1f547027ba6d63c6437ba2a`
- Audit and implementation date: 2026-07-31
- Policy: study and reimplement narrow techniques only. Do not import Codrops templates, demo assets, Next.js or DOM scaffolding, GSAP, Framer Motion, Leva, Rapier, web Drei helpers, postprocessing, WebGPU, TSL, Gaussian splatting, or reflection/refraction render targets.

## Donor Register

| Donor              | Pinned source                                                                                                                                                               | Observed license                                             | Files inspected                                                                                                               | Use and decision                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Three.js Instances | [`basementstudio/r3f-instances-article@178c7a8`](https://github.com/basementstudio/r3f-instances-article/commit/178c7a8897b3da4729e1bef7ea155401242a7ff4)                   | Unspecified in the visible repository root                   | `README.md`, `src/app/(examples)/create-instances/scene/index.tsx`, `src/app/(examples)/instanced-attributes/scene/index.tsx` | Instancing idea reimplemented; accepted for battle impact only.                   |
| Breathing Dots     | [`mattrossman/breathing-dots-tutorial@c04b92d`](https://github.com/mattrossman/breathing-dots-tutorial/commit/c04b92d6d38c26ebfaf5710d146066e7743c9af2)                     | MIT, `LICENSE` present                                       | `README.md`, `src/demos/Demo1.js`, `src/demos/Demo2.js`                                                                       | Preallocation and reused transforms studied; accepted as an idea only.            |
| Noise Transition   | [`mohAmineBrs/codrops-noise-transition@13e548a`](https://github.com/mohAmineBrs/codrops-noise-transition/commit/13e548a86bb297559f4b127067cdac4323447e70)                   | MIT per imported audit; no root `LICENSE` at the pinned tree | `README.md`, `src/BackgroundMaterial.js`, `src/Noise.js`, `src/Model.jsx`                                                     | Radial/noise front reimplemented in original WebGL1 GLSL; accepted behind a flag. |
| Image Reveal       | [`colindmg/r3f-image-reveal-effect@45c3f28`](https://github.com/colindmg/r3f-image-reveal-effect/commit/45c3f28941b481cc0756be3e4cbc2e2f5f7269d9)                           | MIT, `LICENSE` present                                       | `README.md`, `src/components/RevealImage.jsx`, `src/shaders/imageReveal/vertex.glsl`, `src/shaders/imageReveal/fragment.glsl` | Progress-uniform mask concept reimplemented; accepted behind a flag.              |
| Singularity        | [`niccolofanton/codrops-singularity-demo@ccfa02a`](https://github.com/niccolofanton/codrops-singularity-demo/commit/ccfa02a997ce6f564bf27e02a82bae45aa5fa86a)               | MIT, `LICENSE` present                                       | `README.md`, `package.json`, `src/components/CustomScene.tsx`                                                                 | Measurement method only; dependency stack and models rejected.                    |
| Infinite Canvas    | [`edoardolunardi/infinite-canvas@528d811`](https://github.com/edoardolunardi/infinite-canvas/commit/528d811a39eafe574917ed45f697f51c62942758)                               | MIT per imported audit                                       | Imported audit only                                                                                                           | No port. Existing bounded attention camera remains authoritative.                 |
| Stylized Water     | [`thaslle/stylized-water@76a335f`](https://github.com/thaslle/stylized-water/commit/76a335f75dcccac0785ce9d84c914328bd3a1ea0)                                               | MIT per imported audit                                       | Imported audit only                                                                                                           | Rejected pending a licensed sea mask and physical thermal proof.                  |
| Generative Artwork | [`eduardfossas/codrops-generative-artwork-three@c4148f0`](https://github.com/eduardfossas/codrops-generative-artwork-three/commit/c4148f0de3fa5b629f8b2e7ea7971afd19a5eebc) | Unspecified; README mentions MIT, license file not confirmed | Imported audit only                                                                                                           | Rejected for gameplay; no menu decoration added.                                  |

No donor repository is a dependency or Git submodule. No donor code, model, texture, image, font, sound, HDRI, or scene file was copied.

## Integrated Decisions

### Battle Impact Instancing

- Type of use: original reimplementation of the single-`InstancedMesh` technique.
- Targets: `R3FBattleImpactInstances.tsx`, `r3fBattleImpactGeometry.ts`, `R3FGameMap.tsx`.
- Behavior: one mesh, one shared geometry/material, and eight precomputed radial matrices replace the eight impact meshes.
- Preserved: battle duration, battle-scene suspension, conquered/defended color, point light, native invalidation, and one completion callback.
- Flag: `EXPO_PUBLIC_R3F_BATTLE_INSTANCING`; production default on, explicit `0` restores the legacy fallback.

### Conquest Pulse

- Type of use: original radial/noise shader informed by the Noise Transition technique.
- Targets: `R3FConquestPulse.tsx`, `shaders/radial-overlay.ts`, `R3FTerritorySurface.tsx`.
- Behavior: deterministic selection, impact, and conquest descriptors drive a transparent sibling mesh that reuses territory geometry.
- Isolation: no base material, GLB, UV, pick mesh, raycast handler, or gameplay state is mutated.
- Lifecycle: uniforms are mutated in place; suspension pauses elapsed time; reduced motion completes once; the owned shader material is disposed.
- Flag: `EXPO_PUBLIC_R3F_CONQUEST_PULSE`; production default off, qualification default on.

### Sealed Order Reveal

- Type of use: original `uProgress` mask informed by the Image Reveal concept.
- Targets: `R3FSealedOrderReveal.tsx`, `shaders/radial-overlay.ts`, `mapSceneModel.ts`.
- Behavior: viewer-scoped Same Time orders appear only after that viewer seals them; playback, the viewer mission, and victory also produce deterministic presentation descriptors.
- Security boundary: another commander's sealed target is never derived for the viewer; no gameplay store or multiplayer snapshot is changed.
- Lifecycle and geometry isolation match the conquest pulse.
- Flag: `EXPO_PUBLIC_R3F_ORDER_REVEAL`; production default off, qualification default on.

### Renderer Qualification

- `mapFrameProfile.ts` records camera, aggregate battle, cold battle, warm battle, and conquest-pulse frame windows.
- Samples include FPS, p50/p95/p99, calls, triangles, points, lines, programs, geometries, textures, and heap bytes only when the runtime exposes them. Native memory remains `null`; it is not synthesized.
- The public Three.js renderer API has no material count. Program, geometry, and texture counts are the automated growth signals; Instruments and Android Profiler remain the material/native-memory authority.
- `qualificationBattles` is a qualification-only deep-link parameter. It repeats the presentation effect in one GL context without dispatching a gameplay action. Values are bounded to 500.
- Release evidence now requires both shaders rendered, cold/warm/pulse profiles with renderer counters, required flags, stylized water off, and at least 50 stable battle samples.

## Feature Policy

| Flag                                | Production default | Qualification default | Decision                                           |
| ----------------------------------- | -----------------: | --------------------: | -------------------------------------------------- |
| `EXPO_PUBLIC_R3F_BATTLE_INSTANCING` |                 On |                    On | Accepted.                                          |
| `EXPO_PUBLIC_R3F_CONQUEST_PULSE`    |                Off |                    On | Experimental until fresh physical evidence passes. |
| `EXPO_PUBLIC_R3F_ORDER_REVEAL`      |                Off |                    On | Experimental until fresh physical evidence passes. |
| `EXPO_PUBLIC_R3F_STYLIZED_WATER`    |                Off |                   Off | Rejected for this integration.                     |

## Assets And Notices

| Asset class                                    | Included from donors? | Notes                                                           |
| ---------------------------------------------- | --------------------: | --------------------------------------------------------------- |
| Code or shader source                          |                    No | Shaders and timelines are original implementations.             |
| Models, textures, images, fonts, HDRIs, sounds |                    No | Existing project assets only.                                   |
| New third-party runtime packages               |                    No | Existing React, R3F, Three, Expo GL, and Expo Asset stack only. |

No `THIRD_PARTY_NOTICES.md` change is required because no substantial donor code or asset was copied. Donor URLs, pinned SHAs, observed licenses, and inspected files remain recorded here for provenance.

## Validation And Measurements

| Lane                      | Result on 2026-07-31                      | Qualification meaning                                                                                                                                                 |
| ------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                | Passed                                    | Static integration is coherent.                                                                                                                                       |
| Node unit suite           | 216 passed                                | Covers matrices, timeline, flags, scene descriptors, evidence parsing, cold/warm profiles, and 50-sample growth rejection.                                            |
| Browser smoke             | Passed across 97 bundled game images      | Compiled both shaders, rendered one eight-instance impact mesh, preserved all territory pick meshes, returned to idle, and exercised a two-battle cold/warm sequence. |
| Browser performance       | Captured, environment marked `ineligible` | Useful diagnostics only; cannot satisfy native release policy.                                                                                                        |
| Android and physical iOS  | Pending for the final integration commit  | Required before enabling the two shader flags in production.                                                                                                          |
| Thermal and native memory | Pending                                   | Requires a 10-15 minute physical session plus Instruments/Android Profiler.                                                                                           |

Absolute 60 Hz thresholds remain unchanged. The automated browser lane does not claim a physical baseline/variant comparison, native memory result, thermal result, or 50-battle device result.

For the minimum growth run, launch a qualification build with:

```text
worlddomination://game?autostart=1&qualificationRun=1&renderer=r3f&qualificationBattles=50&players=2
```

For a roughly 10-15 minute effect and thermal run, use `qualificationBattles=400`. Background/foreground, battle-modal suspension, rotation, pan, pinch, wheel, focus, and full-board controls still require operator checks on the reference devices. Exported Android and iOS evidence must match the final full Git revision and pass `pnpm --filter @workspace/mobile map:release:check` as one capture pair.

## Rejected Boundaries

- No Codrops template, demo scene, asset pack, or dependency stack was imported.
- No WebGPU, TSL, postprocessing, physics, reflection/refraction target, Gaussian splat, or continuous water render was added.
- Infinite-world camera behavior was not merged into the existing bounded attention camera.
- Stylized water stays off until a separate licensed mask, overdraw review, interaction check, and physical thermal proof exist.
