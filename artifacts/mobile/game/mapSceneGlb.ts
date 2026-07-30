import { BufferAttribute, BufferGeometry } from "three";

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BINARY_CHUNK = 0x004e4942;
const GLB_VERSION = 2;

interface GltfAccessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  normalized?: boolean;
  sparse?: unknown;
  type: string;
}

interface GltfBufferView {
  buffer: number;
  byteLength: number;
  byteOffset?: number;
  byteStride?: number;
}

interface GltfPrimitive {
  attributes: {
    NORMAL?: number;
    POSITION?: number;
    TEXCOORD_0?: number;
  };
  indices?: number;
  mode?: number;
}

interface GltfDocument {
  accessors: GltfAccessor[];
  asset: { version: string };
  buffers: Array<{ byteLength: number }>;
  bufferViews: GltfBufferView[];
  meshes: Array<{ name?: string; primitives: GltfPrimitive[] }>;
  nodes: Array<{ mesh?: number; name?: string }>;
  scene?: number;
  scenes: Array<{ nodes: number[] }>;
}

export interface ParsedMapSceneGlb {
  geometries: Map<string, BufferGeometry>;
  dispose: () => void;
}

function invariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(`Invalid canonical map GLB: ${message}`);
}

function itemSizeForType(type: string): number {
  if (type === "SCALAR") return 1;
  if (type === "VEC2") return 2;
  if (type === "VEC3") return 3;
  if (type === "VEC4") return 4;
  throw new Error(`Invalid canonical map GLB: unsupported accessor ${type}`);
}

function bytesPerComponent(componentType: number): number {
  if (componentType === 5121) return 1;
  if (componentType === 5123) return 2;
  if (componentType === 5125 || componentType === 5126) return 4;
  throw new Error(
    `Invalid canonical map GLB: unsupported component ${componentType}`,
  );
}

function accessorArray(
  document: GltfDocument,
  binary: Uint8Array,
  accessorIndex: number,
): {
  array: Float32Array | Uint8Array | Uint16Array | Uint32Array;
  itemSize: number;
  normalized: boolean;
} {
  const accessor = document.accessors[accessorIndex];
  invariant(accessor, `missing accessor ${accessorIndex}`);
  invariant(!accessor.sparse, "sparse accessors are not supported");
  const bufferView = document.bufferViews[accessor.bufferView];
  invariant(bufferView, `missing buffer view ${accessor.bufferView}`);
  invariant(bufferView.buffer === 0, "only the embedded buffer is supported");

  const itemSize = itemSizeForType(accessor.type);
  const componentBytes = bytesPerComponent(accessor.componentType);
  const packedStride = itemSize * componentBytes;
  invariant(
    bufferView.byteStride === undefined ||
      bufferView.byteStride === packedStride,
    "interleaved attributes are not supported",
  );

  const accessorOffset = accessor.byteOffset ?? 0;
  const viewOffset = bufferView.byteOffset ?? 0;
  const elementCount = accessor.count * itemSize;
  const byteLength = elementCount * componentBytes;
  invariant(
    accessorOffset + byteLength <= bufferView.byteLength,
    `accessor ${accessorIndex} exceeds its buffer view`,
  );

  const byteOffset = binary.byteOffset + viewOffset + accessorOffset;
  invariant(
    byteOffset % componentBytes === 0,
    `accessor ${accessorIndex} is misaligned`,
  );
  invariant(
    viewOffset + accessorOffset + byteLength <= binary.byteLength,
    `accessor ${accessorIndex} exceeds the binary chunk`,
  );

  let array: Float32Array | Uint8Array | Uint16Array | Uint32Array;
  if (accessor.componentType === 5126) {
    array = new Float32Array(
      new Float32Array(binary.buffer, byteOffset, elementCount),
    );
  } else if (accessor.componentType === 5125) {
    array = new Uint32Array(
      new Uint32Array(binary.buffer, byteOffset, elementCount),
    );
  } else if (accessor.componentType === 5123) {
    array = new Uint16Array(
      new Uint16Array(binary.buffer, byteOffset, elementCount),
    );
  } else {
    array = new Uint8Array(
      new Uint8Array(binary.buffer, byteOffset, elementCount),
    );
  }

  return {
    array,
    itemSize,
    normalized: accessor.normalized ?? false,
  };
}

function geometryAttribute(
  document: GltfDocument,
  binary: Uint8Array,
  accessorIndex: number,
  expectedType: "VEC2" | "VEC3",
): BufferAttribute {
  const accessor = document.accessors[accessorIndex];
  invariant(accessor?.type === expectedType, `expected ${expectedType}`);
  invariant(accessor.componentType === 5126, "attributes must be float32");
  const value = accessorArray(document, binary, accessorIndex);
  return new BufferAttribute(value.array, value.itemSize, value.normalized);
}

function geometryIndex(
  document: GltfDocument,
  binary: Uint8Array,
  accessorIndex: number,
): BufferAttribute {
  const accessor = document.accessors[accessorIndex];
  invariant(accessor?.type === "SCALAR", "indices must be scalar");
  invariant(
    accessor.componentType === 5121 ||
      accessor.componentType === 5123 ||
      accessor.componentType === 5125,
    "indices must be unsigned integers",
  );
  const value = accessorArray(document, binary, accessorIndex);
  return new BufferAttribute(value.array, 1, false);
}

export function parseMapSceneGlb(bytes: Uint8Array): ParsedMapSceneGlb {
  invariant(bytes.byteLength >= 20, "container is truncated");
  const container = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  invariant(container.getUint32(0, true) === GLB_MAGIC, "bad magic");
  invariant(container.getUint32(4, true) === GLB_VERSION, "bad version");
  invariant(
    container.getUint32(8, true) === bytes.byteLength,
    "length mismatch",
  );

  let offset = 12;
  let document: GltfDocument | null = null;
  let binary: Uint8Array | null = null;
  while (offset < bytes.byteLength) {
    invariant(offset + 8 <= bytes.byteLength, "chunk header is truncated");
    const chunkLength = container.getUint32(offset, true);
    const chunkType = container.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + chunkLength;
    invariant(end <= bytes.byteLength, "chunk exceeds the container");

    if (chunkType === GLB_JSON_CHUNK) {
      const json = new TextDecoder()
        .decode(bytes.subarray(start, end))
        .trim();
      document = JSON.parse(json) as GltfDocument;
    } else if (chunkType === GLB_BINARY_CHUNK) {
      binary = bytes.subarray(start, end);
    }
    offset = end;
  }

  invariant(document, "JSON chunk is missing");
  invariant(binary, "binary chunk is missing");
  invariant(document.asset?.version === "2.0", "asset is not glTF 2.0");
  invariant(document.buffers?.length === 1, "expected one embedded buffer");
  invariant(
    document.buffers[0].byteLength <= binary.byteLength,
    "embedded buffer is truncated",
  );

  const scene = document.scenes?.[document.scene ?? 0];
  invariant(scene, "active scene is missing");
  const geometries = new Map<string, BufferGeometry>();

  try {
    for (const nodeIndex of scene.nodes) {
      const node = document.nodes[nodeIndex];
      if (!node || node.mesh === undefined) continue;
      const mesh = document.meshes[node.mesh];
      const name = node.name ?? mesh?.name;
      if (!name?.startsWith("territory__")) continue;
      invariant(mesh?.primitives.length === 1, `${name} has bad primitives`);
      const primitive = mesh.primitives[0];
      invariant((primitive.mode ?? 4) === 4, `${name} is not triangles`);
      invariant(
        primitive.attributes.POSITION !== undefined &&
          primitive.attributes.NORMAL !== undefined &&
          primitive.attributes.TEXCOORD_0 !== undefined &&
          primitive.indices !== undefined,
        `${name} is missing indexed geometry`,
      );

      const geometry = new BufferGeometry();
      geometry.name = name;
      geometry.setAttribute(
        "position",
        geometryAttribute(
          document,
          binary,
          primitive.attributes.POSITION,
          "VEC3",
        ),
      );
      geometry.setAttribute(
        "normal",
        geometryAttribute(
          document,
          binary,
          primitive.attributes.NORMAL,
          "VEC3",
        ),
      );
      geometry.setAttribute(
        "uv",
        geometryAttribute(
          document,
          binary,
          primitive.attributes.TEXCOORD_0,
          "VEC2",
        ),
      );
      geometry.setIndex(geometryIndex(document, binary, primitive.indices));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometries.set(name, geometry);
    }
  } catch (error) {
    for (const geometry of geometries.values()) geometry.dispose();
    throw error;
  }

  invariant(geometries.size > 0, "scene has no territory meshes");
  return {
    geometries,
    dispose: () => {
      for (const geometry of geometries.values()) geometry.dispose();
    },
  };
}
