import React, { useMemo } from "react";
import { Platform } from "react-native";
import {
  BufferGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Path,
  Shape,
  ShapeGeometry,
} from "three";

import {
  MAP_SCENE_BOARD_PIXELS,
  MAP_SCENE_TABLETOP_RADIUS,
  MAP_SCENE_TABLETOP_Y,
  MAP_SCENE_UNITS_PER_PIXEL,
} from "@/game/mapSceneGeometry";

const DYNAMIC_SHADOWS = Platform.OS === "web";
const TABLETOP_THICKNESS = 0.34;
const APRON_HEIGHT = 0.44;
const FOOT_DEPTH = 0.58;

function createTabletopSurfaceGeometry(): ShapeGeometry {
  const tabletop = new Shape();
  tabletop.absarc(0, 0, MAP_SCENE_TABLETOP_RADIUS - 0.04, 0, Math.PI * 2);

  const halfBoardWidth =
    (MAP_SCENE_BOARD_PIXELS[0] * MAP_SCENE_UNITS_PER_PIXEL) / 2 - 0.01;
  const halfBoardDepth =
    (MAP_SCENE_BOARD_PIXELS[1] * MAP_SCENE_UNITS_PER_PIXEL) / 2 - 0.01;
  const boardCutout = new Path();
  boardCutout.moveTo(-halfBoardWidth, -halfBoardDepth);
  boardCutout.lineTo(-halfBoardWidth, halfBoardDepth);
  boardCutout.lineTo(halfBoardWidth, halfBoardDepth);
  boardCutout.lineTo(halfBoardWidth, -halfBoardDepth);
  boardCutout.closePath();
  tabletop.holes.push(boardCutout);

  const geometry = new ShapeGeometry(tabletop, 64);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function createTabletopSeamGeometry(): BufferGeometry {
  const positions: number[] = [];
  const halfBoardDepth =
    (MAP_SCENE_BOARD_PIXELS[1] * MAP_SCENE_UNITS_PER_PIXEL) / 2 + 0.02;
  for (const x of [-5.6, -2.8, 0, 2.8, 5.6]) {
    const halfLength = Math.sqrt(
      (MAP_SCENE_TABLETOP_RADIUS - 0.14) ** 2 - x ** 2,
    );
    positions.push(
      x,
      0,
      -halfLength,
      x,
      0,
      -halfBoardDepth,
      x,
      0,
      halfBoardDepth,
      x,
      0,
      halfLength,
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

function createFootGeometry(): ExtrudeGeometry {
  const profile = new Shape();
  profile.moveTo(0.58, 0.08);
  profile.bezierCurveTo(1.15, 0.06, 1.42, -0.12, 1.83, -0.34);
  profile.bezierCurveTo(2.45, -0.67, 3.45, -0.78, 4.35, -0.78);
  profile.quadraticCurveTo(4.58, -0.78, 4.58, -0.57);
  profile.quadraticCurveTo(4.58, -0.4, 4.37, -0.37);
  profile.bezierCurveTo(3.45, -0.31, 2.75, -0.22, 2.2, 0.04);
  profile.bezierCurveTo(1.73, 0.27, 1.15, 0.35, 0.58, 0.29);
  profile.closePath();

  const geometry = new ExtrudeGeometry(profile, {
    depth: FOOT_DEPTH,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.07,
    bevelThickness: 0.06,
    curveSegments: 12,
  });
  geometry.translate(0, 0, -FOOT_DEPTH / 2);
  geometry.computeVertexNormals();
  return geometry;
}

export default function R3FTable() {
  const tabletopSurfaceGeometry = useMemo(
    createTabletopSurfaceGeometry,
    [],
  );
  const tabletopSeamGeometry = useMemo(createTabletopSeamGeometry, []);
  const footGeometry = useMemo(createFootGeometry, []);
  const tabletopCenterY = MAP_SCENE_TABLETOP_Y - TABLETOP_THICKNESS / 2;
  const apronCenterY =
    MAP_SCENE_TABLETOP_Y - TABLETOP_THICKNESS - APRON_HEIGHT / 2 + 0.04;

  return (
    <group name="table">
      <mesh
        name="tabletop_walnut_edge"
        position={[0, tabletopCenterY, 0]}
        receiveShadow={DYNAMIC_SHADOWS}
      >
        <cylinderGeometry
          args={[
            MAP_SCENE_TABLETOP_RADIUS,
            MAP_SCENE_TABLETOP_RADIUS,
            TABLETOP_THICKNESS,
            64,
            1,
            true,
          ]}
        />
        <meshStandardMaterial
          color="#30231d"
          roughness={0.5}
          metalness={0.02}
        />
      </mesh>

      <mesh
        name="tabletop_walnut_surface"
        geometry={tabletopSurfaceGeometry}
        position={[0, MAP_SCENE_TABLETOP_Y + 0.003, 0]}
        receiveShadow={DYNAMIC_SHADOWS}
      >
        <meshStandardMaterial
          color="#443027"
          roughness={0.44}
          metalness={0.015}
        />
      </mesh>

      <lineSegments
        name="tabletop_plank_seams"
        geometry={tabletopSeamGeometry}
        position={[0, MAP_SCENE_TABLETOP_Y + 0.011, 0]}
      >
        <lineBasicMaterial color="#251a15" />
      </lineSegments>

      <mesh
        name="tabletop_apron"
        position={[0, apronCenterY, 0]}
        receiveShadow={DYNAMIC_SHADOWS}
      >
        <cylinderGeometry
          args={[
            MAP_SCENE_TABLETOP_RADIUS - 0.1,
            MAP_SCENE_TABLETOP_RADIUS - 0.4,
            APRON_HEIGHT,
            64,
            1,
            true,
          ]}
        />
        <meshStandardMaterial
          color="#2c211c"
          roughness={0.58}
          metalness={0.015}
        />
      </mesh>

      <mesh
        name="tabletop_upper_bead"
        position={[0, MAP_SCENE_TABLETOP_Y - 0.24, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <torusGeometry
          args={[MAP_SCENE_TABLETOP_RADIUS - 0.13, 0.14, 8, 48]}
        />
        <meshStandardMaterial
          color="#4c372d"
          roughness={0.46}
          metalness={0.02}
        />
      </mesh>

      <mesh
        name="tabletop_lower_bead"
        position={[0, apronCenterY - APRON_HEIGHT / 2 + 0.04, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <torusGeometry
          args={[MAP_SCENE_TABLETOP_RADIUS - 0.42, 0.1, 6, 48]}
        />
        <meshStandardMaterial
          color="#241b17"
          roughness={0.62}
          metalness={0.01}
        />
      </mesh>

      <group name="table_pedestal">
        <mesh
          name="table_pedestal_column"
          position={[0, -1.32, 0]}
          receiveShadow={DYNAMIC_SHADOWS}
        >
          <cylinderGeometry args={[0.76, 0.84, 1.58, 32]} />
          <meshStandardMaterial
            color="#171719"
            roughness={0.53}
            metalness={0.12}
          />
        </mesh>
        <mesh
          name="table_pedestal_upper_collar"
          position={[0, -0.7, 0]}
        >
          <cylinderGeometry args={[1.03, 0.94, 0.24, 32]} />
          <meshStandardMaterial
            color="#222124"
            roughness={0.47}
            metalness={0.16}
          />
        </mesh>
        <mesh
          name="table_pedestal_lower_collar"
          position={[0, -2.05, 0]}
        >
          <cylinderGeometry args={[1.04, 0.88, 0.28, 32]} />
          <meshStandardMaterial
            color="#111113"
            roughness={0.56}
            metalness={0.1}
          />
        </mesh>
      </group>

      <group name="table_feet" position={[0, -2.02, 0]}>
        {[0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].map((rotation) => (
          <mesh
            key={rotation}
            name={`table_foot_${rotation}`}
            geometry={footGeometry}
            rotation={[0, rotation, 0]}
            receiveShadow={DYNAMIC_SHADOWS}
          >
            <meshStandardMaterial
              color="#151518"
              roughness={0.58}
              metalness={0.1}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}
