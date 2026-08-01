export interface R3FEffectRenderCounts {
  conquestPulseMeshCount: number;
  conquestPulseRenderedMeshCount: number;
  orderRevealMeshCount: number;
  orderRevealRenderedMeshCount: number;
}

/** True only after every active shader overlay has reached onBeforeRender. */
export function hasCompleteR3FEffectRenderEvidence(
  counts: R3FEffectRenderCounts,
): boolean {
  const activeMeshCount =
    counts.conquestPulseMeshCount + counts.orderRevealMeshCount;
  return (
    activeMeshCount > 0 &&
    counts.conquestPulseRenderedMeshCount ===
      counts.conquestPulseMeshCount &&
    counts.orderRevealRenderedMeshCount === counts.orderRevealMeshCount
  );
}
