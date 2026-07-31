# Codrops R3F Donors

## Context

- Target repository: `worldDOMINATION-EXPO-2026`
- Target workspace: `artifacts/mobile`
- Target commit inspected by the imported report: `3d6f2b4d142d5d0b8554e8eb93ad4cf5ebbfb145`
- Local integration start: `c24f461105648c5a5e5dd9b592d744ee6ce0016b`
- Audit date: 2026-07-31
- Policy: study and reimplement narrow techniques only. Do not import Codrops templates, demo assets, Next.js/DOM scaffolding, GSAP, Framer Motion, Leva, Rapier, web Drei helpers, postprocessing, WebGPU, TSL, Gaussian splatting, or reflection/refraction render targets.

## Donor Register

| Donor | Source | Pinned SHA | Observed license | Technique studied | Use in this repo |
|---|---|---|---|---|---|
| Three.js Instances | `https://github.com/basementstudio/r3f-instances-article` | `178c7a8897b3da4729e1bef7ea155401242a7ff4` | Unspecified in visible repository root | Single `InstancedMesh`, shared geometry/material, instance matrices | Idea only; no code copied. |
| Breathing Dots | `https://github.com/mattrossman/breathing-dots-tutorial` | `c04b92d6d38c26ebfaf5710d146066e7743c9af2` | MIT | Preallocated transforms and no per-frame allocation | Idea only; no code copied. |
| Noise Transition | `https://github.com/mohAmineBrs/codrops-noise-transition` | `13e548a86bb297559f4b127067cdac4323447e70` | MIT per imported audit | Radial noisy reveal/front | Not integrated yet. |
| Image Reveal | `https://github.com/colindmg/r3f-image-reveal-effect` | `45c3f28941b481cc0756be3e4cbc2e2f5f7269d9` | MIT | `uProgress` mask reveal | Not integrated yet. |
| Singularity | `https://github.com/niccolofanton/codrops-singularity-demo` | `ccfa02a997ce6f564bf27e02a82bae45aa5fa86a` | MIT | Scene performance audit method | Not integrated yet. |
| Infinite Canvas | `https://github.com/edoardolunardi/infinite-canvas` | `528d811a39eafe574917ed45f697f51c62942758` | MIT | Culling/loading principles | Not integrated yet. |
| Stylized Water | `https://github.com/thaslle/stylized-water` | `76a335f75dcccac0785ce9d84c914328bd3a1ea0` | MIT | Low-cost procedural water reference | Not integrated; flag remains off. |
| Generative Artwork | `https://github.com/eduardfossas/codrops-generative-artwork-three` | `c4148f0de3fa5b629f8b2e7ea7971afd19a5eebc` | Unspecified; README mentions MIT per imported audit | Seeded decorative instancing | Not integrated yet. |

## Integrated Decisions

### Battle Impact Instancing

- Type of use: original reimplementation from the instancing technique.
- Files touched:
  - `artifacts/mobile/components/game/R3FBattleImpactInstances.tsx`
  - `artifacts/mobile/game/r3fBattleImpactGeometry.ts`
  - `artifacts/mobile/game/r3fFeatureFlags.ts`
  - `artifacts/mobile/components/game/R3FGameMap.tsx`
  - `artifacts/mobile/test/game/r3fBattleImpactGeometry.test.ts`
  - `artifacts/mobile/test/game/r3fFeatureFlags.test.ts`
  - `artifacts/mobile/scripts/browser-smoke.js`
- Feature flag: `EXPO_PUBLIC_R3F_BATTLE_INSTANCING`
- Default: on. Set `EXPO_PUBLIC_R3F_BATTLE_INSTANCING=0` to use the legacy eight-mesh fallback.
- Third-party code copied: none.
- Third-party assets copied: none.

The previous impact group rendered eight separate impact sphere meshes. The new path renders one `InstancedMesh` with eight precomputed radial transforms while preserving the existing battle duration, suspension reset, conquered/defended color choice, completion callback, point light, and native invalidation behavior.

## Pending Decisions

- `EXPO_PUBLIC_R3F_CONQUEST_PULSE`: off until the territory overlay shader is implemented and checked against picking, depth, reduced motion, and native GL behavior.
- `EXPO_PUBLIC_R3F_ORDER_REVEAL`: off until Same Time reveal progress is sourced from the existing presentation model.
- `EXPO_PUBLIC_R3F_STYLIZED_WATER`: off unless a physical-device proof shows no continuous rendering, thermal, overdraw, or interaction regression.
- Cold/warm renderer counters and 50-battle growth evidence remain pending until fresh Android and physical iOS performance evidence is captured for the current source revision.

## Rejected Boundaries

- No demo assets, Sketchfab models, external textures, fonts, sounds, HDRIs, or canned scene files are included.
- No dependency was added for this instancing slice.
- Browser metrics remain ineligible for final physical-device qualification.
