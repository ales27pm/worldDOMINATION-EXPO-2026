import React from "react";
import { Asset } from "expo-asset";
import { Platform } from "react-native";
import {
  DoubleSide,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
} from "three";

import { useLoader } from "@/components/game/r3fRuntime";

const DYNAMIC_SHADOWS = Platform.OS === "web";
const COMMAND_ROOM_FLOOR_TEXTURE = require("../../assets/ui/command-room-floor.png") as number;
const COMMAND_ROOM_RUG_TEXTURE = require("../../assets/ui/command-room-rug.png") as number;
const COMMAND_ROOM_WALL_TEXTURE = require("../../assets/ui/command-room-wall.png") as number;

function BrassRail({
  y,
  z,
}: {
  y: number;
  z: number;
}) {
  return (
    <mesh name={`command_room_brass_rail_${y}`} position={[0, y, z]}>
      <boxGeometry args={[27.5, 0.045, 0.05]} />
      <meshStandardMaterial color="#8f6b2c" roughness={0.34} metalness={0.62} />
    </mesh>
  );
}

function WindowPane({ x, y }: { x: number; y: number }) {
  return (
    <mesh name={`command_room_window_pane_${x}_${y}`} position={[x, y, -11.74]}>
      <planeGeometry args={[1.08, 1.24]} />
      <meshBasicMaterial
        color="#d6b76b"
        transparent
        opacity={0.18}
        toneMapped={false}
      />
    </mesh>
  );
}

function FramedParchment({ x }: { x: number }) {
  return (
    <group name={`command_room_wall_chart_${x}`} position={[x, 1.48, -11.7]}>
      <mesh>
        <planeGeometry args={[3.3, 2.16]} />
        <meshStandardMaterial
          color="#c7a875"
          roughness={0.82}
          metalness={0.01}
        />
      </mesh>
      <mesh position={[0, 1.12, 0.025]}>
        <boxGeometry args={[3.58, 0.08, 0.06]} />
        <meshStandardMaterial color="#5a3b22" roughness={0.58} />
      </mesh>
      <mesh position={[0, -1.12, 0.025]}>
        <boxGeometry args={[3.58, 0.08, 0.06]} />
        <meshStandardMaterial color="#5a3b22" roughness={0.58} />
      </mesh>
      <mesh position={[-1.79, 0, 0.025]}>
        <boxGeometry args={[0.08, 2.32, 0.06]} />
        <meshStandardMaterial color="#5a3b22" roughness={0.58} />
      </mesh>
      <mesh position={[1.79, 0, 0.025]}>
        <boxGeometry args={[0.08, 2.32, 0.06]} />
        <meshStandardMaterial color="#5a3b22" roughness={0.58} />
      </mesh>
      {[-0.82, 0, 0.82].map((lineY) => (
        <mesh key={lineY} position={[0, lineY, 0.035]}>
          <boxGeometry args={[2.72, 0.025, 0.035]} />
          <meshStandardMaterial color="#6e5537" roughness={0.78} />
        </mesh>
      ))}
    </group>
  );
}

export default function R3FCommandRoom() {
  const floorTexture = useLoader(
    TextureLoader,
    Asset.fromModule(COMMAND_ROOM_FLOOR_TEXTURE).uri,
  );
  const rugTexture = useLoader(
    TextureLoader,
    Asset.fromModule(COMMAND_ROOM_RUG_TEXTURE).uri,
  );
  const wallTexture = useLoader(
    TextureLoader,
    Asset.fromModule(COMMAND_ROOM_WALL_TEXTURE).uri,
  );

  React.useEffect(() => {
    floorTexture.colorSpace = SRGBColorSpace;
    floorTexture.wrapS = RepeatWrapping;
    floorTexture.wrapT = RepeatWrapping;
    floorTexture.repeat.set(3, 3);
    floorTexture.anisotropy = 8;
    floorTexture.needsUpdate = true;

    rugTexture.colorSpace = SRGBColorSpace;
    rugTexture.anisotropy = 6;
    rugTexture.needsUpdate = true;

    wallTexture.colorSpace = SRGBColorSpace;
    wallTexture.wrapS = RepeatWrapping;
    wallTexture.wrapT = RepeatWrapping;
    wallTexture.repeat.set(2, 1);
    wallTexture.anisotropy = 6;
    wallTexture.needsUpdate = true;
  }, [floorTexture, rugTexture, wallTexture]);

  return (
    <group name="imperial_command_room" userData={{ room: "imperial-command-room" }}>
      <mesh
        name="command_room_floor"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -2.42, 0.35]}
        receiveShadow={DYNAMIC_SHADOWS}
      >
        <planeGeometry args={[31, 25]} />
        <meshStandardMaterial
          map={floorTexture}
          color="#ffffff"
          roughness={0.64}
          metalness={0.02}
          side={DoubleSide}
        />
      </mesh>

      <mesh
        name="command_room_campaign_rug"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -2.405, 0.35]}
        receiveShadow={DYNAMIC_SHADOWS}
      >
        <planeGeometry args={[18.4, 12.6]} />
        <meshStandardMaterial
          map={rugTexture}
          color="#ffffff"
          roughness={0.78}
          metalness={0.01}
          side={DoubleSide}
        />
      </mesh>

      <mesh name="command_room_back_wall" position={[0, 1.2, -11.82]}>
        <planeGeometry args={[31, 8.4]} />
        <meshStandardMaterial
          map={wallTexture}
          color="#ffffff"
          roughness={0.86}
          metalness={0.01}
          side={DoubleSide}
        />
      </mesh>
      <mesh
        name="command_room_left_wall"
        rotation={[0, Math.PI / 2, 0]}
        position={[-15.45, 1.2, 0.35]}
      >
        <planeGeometry args={[25, 8.4]} />
        <meshStandardMaterial
          map={wallTexture}
          color="#ffffff"
          roughness={0.9}
          metalness={0.01}
          side={DoubleSide}
        />
      </mesh>
      <mesh
        name="command_room_right_wall"
        rotation={[0, -Math.PI / 2, 0]}
        position={[15.45, 1.2, 0.35]}
      >
        <planeGeometry args={[25, 8.4]} />
        <meshStandardMaterial
          map={wallTexture}
          color="#ffffff"
          roughness={0.9}
          metalness={0.01}
          side={DoubleSide}
        />
      </mesh>

      <mesh name="command_room_wainscot_back" position={[0, -1.12, -11.72]}>
        <boxGeometry args={[29.8, 1.78, 0.08]} />
        <meshStandardMaterial color="#2b1d16" roughness={0.64} />
      </mesh>
      <BrassRail y={-0.19} z={-11.66} />
      <BrassRail y={-1.98} z={-11.66} />

      <group name="command_room_tall_window">
        {[-0.6, 0.6].map((x) =>
          [-0.72, 0.72].map((y) => (
            <WindowPane key={`${x}:${y}`} x={-8.5 + x} y={2.05 + y} />
          )),
        )}
        <mesh position={[-8.5, 2.05, -11.68]}>
          <boxGeometry args={[2.82, 3.34, 0.08]} />
          <meshStandardMaterial
            color="#1d1511"
            roughness={0.5}
            metalness={0.04}
          />
        </mesh>
        <pointLight
          color="#c89f55"
          intensity={0.55}
          distance={13}
          position={[-8.5, 2.55, -9.4]}
        />
      </group>

      <FramedParchment x={7.7} />

      {[-12.1, 12.1].map((x) => (
        <group key={x} name={`command_room_sconce_${x}`} position={[x, 1.28, -11.62]}>
          <mesh>
            <sphereGeometry args={[0.14, 10, 8]} />
            <meshStandardMaterial
              color="#9f792d"
              roughness={0.28}
              metalness={0.78}
            />
          </mesh>
          <mesh position={[0, 0.34, 0]}>
            <sphereGeometry args={[0.19, 12, 8]} />
            <meshBasicMaterial
              color="#f0c16c"
              transparent
              opacity={0.42}
              toneMapped={false}
            />
          </mesh>
          <pointLight
            color="#c88b4f"
            intensity={0.28}
            distance={7}
            position={[0, 0.35, 0.55]}
          />
        </group>
      ))}
    </group>
  );
}
