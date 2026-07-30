import React, { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { MapSceneModel, MapSceneTerritory } from "@/game/mapSceneModel";
import type { PieceType } from "@/game/pieces";

interface Props {
  model: MapSceneModel;
}

interface SegmentInstance {
  x: number;
  z: number;
  rotation: number;
}

const PIECE_SCALE = 0.9;
const ROUNDEL_OFFSET_X = 0.2;
const ROUNDEL_OFFSET_Z = -0.16;
const DIGIT_SEGMENT_LENGTH = 0.042;
const DIGIT_SEGMENT_THICKNESS = 0.011;
const DIGIT_WIDTH = 0.052;
const DIGIT_HEIGHT = 0.088;

const DIGIT_SEGMENTS: Record<string, number[]> = {
  "0": [0, 1, 2, 3, 4, 5],
  "1": [1, 2],
  "2": [0, 1, 6, 4, 3],
  "3": [0, 1, 2, 3, 6],
  "4": [5, 6, 1, 2],
  "5": [0, 5, 6, 2, 3],
  "6": [0, 5, 4, 3, 2, 6],
  "7": [0, 1, 2],
  "8": [0, 1, 2, 3, 4, 5, 6],
  "9": [0, 1, 2, 3, 5, 6],
};

function transformed(
  geometry: BufferGeometry,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
): BufferGeometry {
  const matrix = new Matrix4().compose(
    new Vector3(...position),
    new Quaternion().setFromEuler(new Euler(...rotation)),
    new Vector3(1, 1, 1),
  );
  return geometry.applyMatrix4(matrix);
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const geometry = mergeGeometries(parts, false);
  if (!geometry) throw new Error("Unable to build procedural army geometry");
  geometry.computeVertexNormals();
  return geometry;
}

function infantryGeometry(): BufferGeometry {
  return merge([
    transformed(new CylinderGeometry(0.14, 0.17, 0.04, 18), [0, 0.02, 0]),
    transformed(new CylinderGeometry(0.055, 0.075, 0.2, 12), [0, 0.14, 0]),
    transformed(new SphereGeometry(0.068, 12, 8), [0, 0.285, 0]),
    transformed(new BoxGeometry(0.025, 0.3, 0.025), [0.09, 0.18, 0]),
  ]);
}

function cavalryGeometry(): BufferGeometry {
  return merge([
    transformed(new CylinderGeometry(0.16, 0.19, 0.04, 18), [0, 0.02, 0]),
    transformed(new BoxGeometry(0.3, 0.115, 0.12), [0, 0.14, 0]),
    transformed(new SphereGeometry(0.075, 12, 8), [0.16, 0.22, 0]),
    transformed(new CylinderGeometry(0.036, 0.052, 0.16, 10), [-0.02, 0.27, 0]),
    transformed(new SphereGeometry(0.052, 10, 8), [-0.02, 0.38, 0]),
  ]);
}

function artilleryGeometry(): BufferGeometry {
  return merge([
    transformed(new CylinderGeometry(0.16, 0.19, 0.04, 18), [0, 0.02, 0]),
    transformed(
      new CylinderGeometry(0.075, 0.075, 0.035, 14),
      [-0.02, 0.11, -0.1],
      [Math.PI / 2, 0, 0],
    ),
    transformed(
      new CylinderGeometry(0.075, 0.075, 0.035, 14),
      [-0.02, 0.11, 0.1],
      [Math.PI / 2, 0, 0],
    ),
    transformed(
      new CylinderGeometry(0.035, 0.05, 0.32, 12),
      [0.06, 0.18, 0],
      [0, 0, Math.PI / 2],
    ),
    transformed(new BoxGeometry(0.13, 0.08, 0.13), [-0.04, 0.14, 0]),
  ]);
}

function geometryForPiece(type: PieceType): BufferGeometry {
  if (type === "cavalry") return cavalryGeometry();
  if (type === "artillery") return artilleryGeometry();
  return infantryGeometry();
}

function ArmyInstances({
  territories,
  type,
}: {
  territories: MapSceneTerritory[];
  type: PieceType;
}) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => geometryForPiece(type), [type]);
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        roughness: 0.42,
        metalness: 0.12,
      }),
    [],
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    const quaternion = new Quaternion();
    const scale = new Vector3(PIECE_SCALE, PIECE_SCALE, PIECE_SCALE);

    territories.forEach((territory, index) => {
      quaternion.setFromEuler(
        new Euler(0, ((territory.stableIndex * 37) % 360) * (Math.PI / 180), 0),
      );
      matrix.compose(
        new Vector3(
          territory.anchor[0] - 0.08,
          territory.anchor[1] + 0.02,
          territory.anchor[2] + 0.05,
        ),
        quaternion,
        scale,
      );
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, new Color(territory.ownerColor ?? "#777777"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    material.needsUpdate = true;
  }, [material, territories]);

  if (territories.length === 0) return null;
  return (
    <instancedMesh
      key={`${type}:${territories.length}`}
      ref={ref}
      args={[geometry, material, territories.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
      name={`army_instances__${type}`}
    />
  );
}

function segmentInstances(territories: MapSceneTerritory[]): SegmentInstance[] {
  const result: SegmentInstance[] = [];
  const segmentPositions: Array<[number, number, number]> = [
    [0, -DIGIT_HEIGHT / 2, 0],
    [DIGIT_WIDTH / 2, -DIGIT_HEIGHT / 4, Math.PI / 2],
    [DIGIT_WIDTH / 2, DIGIT_HEIGHT / 4, Math.PI / 2],
    [0, DIGIT_HEIGHT / 2, 0],
    [-DIGIT_WIDTH / 2, DIGIT_HEIGHT / 4, Math.PI / 2],
    [-DIGIT_WIDTH / 2, -DIGIT_HEIGHT / 4, Math.PI / 2],
    [0, 0, 0],
  ];

  for (const territory of territories) {
    const digits = String(Math.max(0, Math.floor(territory.armies))).slice(-3);
    const startX =
      territory.anchor[0] +
      ROUNDEL_OFFSET_X -
      ((digits.length - 1) * DIGIT_WIDTH) / 2;
    const centerZ = territory.anchor[2] + ROUNDEL_OFFSET_Z;

    [...digits].forEach((digit, digitIndex) => {
      for (const segmentIndex of DIGIT_SEGMENTS[digit] ?? []) {
        const [offsetX, offsetZ, rotation] = segmentPositions[segmentIndex];
        result.push({
          x: startX + digitIndex * DIGIT_WIDTH + offsetX,
          z: centerZ + offsetZ,
          rotation,
        });
      }
    });
  }
  return result;
}

function ArmyRoundels({ territories }: { territories: MapSceneTerritory[] }) {
  const roundelRef = useRef<InstancedMesh>(null);
  const segmentRef = useRef<InstancedMesh>(null);
  const segments = useMemo(() => segmentInstances(territories), [territories]);
  const roundelGeometry = useMemo(() => new CircleGeometry(0.13, 24), []);
  const roundelMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: "#f8f1d4",
        roughness: 0.72,
        metalness: 0,
      }),
    [],
  );
  const segmentGeometry = useMemo(
    () => new BoxGeometry(DIGIT_SEGMENT_LENGTH, 0.012, DIGIT_SEGMENT_THICKNESS),
    [],
  );
  const segmentMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: "#24170d",
        roughness: 0.58,
        metalness: 0,
      }),
    [],
  );

  useLayoutEffect(() => {
    const mesh = roundelRef.current;
    if (!mesh) return;
    const quaternion = new Quaternion().setFromEuler(
      new Euler(-Math.PI / 2, 0, 0),
    );
    const scale = new Vector3(1, 1, 1);
    const matrix = new Matrix4();
    territories.forEach((territory, index) => {
      matrix.compose(
        new Vector3(
          territory.anchor[0] + ROUNDEL_OFFSET_X,
          territory.anchor[1] + 0.2,
          territory.anchor[2] + ROUNDEL_OFFSET_Z,
        ),
        quaternion,
        scale,
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [territories]);

  useLayoutEffect(() => {
    const mesh = segmentRef.current;
    if (!mesh) return;
    const scale = new Vector3(1, 1, 1);
    const matrix = new Matrix4();
    segments.forEach((segment, index) => {
      matrix.compose(
        new Vector3(segment.x, 0.292, segment.z),
        new Quaternion().setFromEuler(new Euler(0, segment.rotation, 0)),
        scale,
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [segments]);

  return (
    <>
      <instancedMesh
        ref={roundelRef}
        args={[roundelGeometry, roundelMaterial, territories.length]}
        receiveShadow
        frustumCulled={false}
        name="army_count_roundels"
      />
      <instancedMesh
        ref={segmentRef}
        args={[segmentGeometry, segmentMaterial, segments.length]}
        castShadow
        frustumCulled={false}
        name="army_count_digits"
      />
    </>
  );
}

function CapitalMarkers({ territories }: { territories: MapSceneTerritory[] }) {
  const ref = useRef<InstancedMesh>(null);
  const capitals = useMemo(
    () => territories.filter((territory) => territory.isCapital),
    [territories],
  );
  const geometry = useMemo(() => new ConeGeometry(0.09, 0.23, 5), []);
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: "#e5b72e",
        emissive: "#6e4300",
        emissiveIntensity: 0.4,
        roughness: 0.35,
        metalness: 0.4,
      }),
    [],
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    capitals.forEach((territory, index) => {
      matrix.makeTranslation(
        territory.anchor[0] - 0.2,
        territory.anchor[1] + 0.2,
        territory.anchor[2] - 0.16,
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [capitals]);

  if (capitals.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, capitals.length]}
      castShadow
      frustumCulled={false}
      name="capital_markers"
    />
  );
}

export function R3FArmyLayer({ model }: Props) {
  const occupied = useMemo(
    () =>
      model.territories.filter(
        (territory) => territory.ownerId >= 0 && territory.pieceType,
      ),
    [model.territories],
  );

  return (
    <>
      {(["infantry", "cavalry", "artillery"] as const).map((type) => (
        <ArmyInstances
          key={type}
          type={type}
          territories={occupied.filter(
            (territory) => territory.pieceType === type,
          )}
        />
      ))}
      <ArmyRoundels territories={occupied} />
      <CapitalMarkers territories={occupied} />
    </>
  );
}
