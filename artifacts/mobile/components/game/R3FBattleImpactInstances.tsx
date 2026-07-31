import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from "three";

import {
  BATTLE_IMPACT_INSTANCE_COUNT,
  battleImpactInstanceOffsets,
} from "@/game/r3fBattleImpactGeometry";

interface Props {
  color: string;
}

export function R3FBattleImpactInstances({ color }: Props) {
  const ref = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const scale = useMemo(() => new Vector3(1, 1, 1), []);
  const geometry = useMemo(() => new SphereGeometry(0.035, 8, 6), []);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: "#ffffff",
        toneMapped: false,
      }),
    [],
  );
  const offsets = useMemo(() => battleImpactInstanceOffsets(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();

    offsets.forEach(({ x, y, z }, index) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.copy(scale);
      dummy.updateMatrix();
      matrix.copy(dummy.matrix);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [dummy, offsets, scale]);

  useEffect(() => {
    material.color.set(color);
    material.needsUpdate = true;
  }, [color, material]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, BATTLE_IMPACT_INSTANCE_COUNT]}
      frustumCulled={false}
      name="battle_impact_instances"
      userData={{
        worldDominationKind: "battle-impact",
        instanceCount: BATTLE_IMPACT_INSTANCE_COUNT,
      }}
    />
  );
}
