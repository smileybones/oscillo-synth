import type { MeshModel } from './mesh-source';

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_CHUNK_TYPE_JSON = 0x4e4f534a; // "JSON"
const GLB_CHUNK_TYPE_BIN = 0x004e4942; // "BIN\0"

const COMPONENT_TYPE_BYTE = 5120;
const COMPONENT_TYPE_UNSIGNED_BYTE = 5121;
const COMPONENT_TYPE_SHORT = 5122;
const COMPONENT_TYPE_UNSIGNED_SHORT = 5123;
const COMPONENT_TYPE_UNSIGNED_INT = 5125;
const COMPONENT_TYPE_FLOAT = 5126;

const COMPONENT_BYTE_SIZES: Record<number, number> = {
  [COMPONENT_TYPE_BYTE]: 1,
  [COMPONENT_TYPE_UNSIGNED_BYTE]: 1,
  [COMPONENT_TYPE_SHORT]: 2,
  [COMPONENT_TYPE_UNSIGNED_SHORT]: 2,
  [COMPONENT_TYPE_UNSIGNED_INT]: 4,
  [COMPONENT_TYPE_FLOAT]: 4,
};

const TYPE_COMPONENT_COUNTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT4: 16,
};

const PRIMITIVE_MODE_TRIANGLES = 4;
const PRIMITIVE_MODE_LINES = 1;

// Hand-rolled since engine has no DOM lib and can't rely on the browser's
// atob() being available — this keeps the parser environment-agnostic.
const BASE64_TABLE = (() => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < chars.length; i++) table[chars.charCodeAt(i)] = i;
  return table;
})();

function decodeBase64(base64: string): ArrayBuffer {
  const withoutPadding = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const byteLength = Math.floor((withoutPadding.length * 6) / 8);
  const bytes = new Uint8Array(byteLength);

  let byteIndex = 0;
  let buffer = 0;
  let bitsInBuffer = 0;

  for (let i = 0; i < withoutPadding.length; i++) {
    const value = BASE64_TABLE[withoutPadding.charCodeAt(i)];
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bitsInBuffer += 6;
    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      bytes[byteIndex++] = (buffer >> bitsInBuffer) & 0xff;
    }
  }

  return bytes.buffer;
}

interface GltfJson {
  buffers?: { uri?: string; byteLength: number }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  accessors?: {
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
  }[];
  meshes?: { primitives: { attributes: Record<string, number>; indices?: number; mode?: number }[] }[];
}

function parseGlbContainer(buffer: ArrayBuffer): { json: GltfJson; binaryChunk: ArrayBuffer | null } {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('Not a valid GLB file (bad magic number)');
  }

  let offset = 12; // skip magic + version + total length
  let json: GltfJson | null = null;
  let binaryChunk: ArrayBuffer | null = null;

  while (offset < buffer.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkData = buffer.slice(chunkStart, chunkStart + chunkLength);

    if (chunkType === GLB_CHUNK_TYPE_JSON) {
      json = JSON.parse(new TextDecoder().decode(chunkData)) as GltfJson;
    } else if (chunkType === GLB_CHUNK_TYPE_BIN) {
      binaryChunk = chunkData;
    }
    offset = chunkStart + chunkLength;
  }

  if (!json) throw new Error('GLB file has no JSON chunk');
  return { json, binaryChunk };
}

function resolveBuffers(json: GltfJson, glbBinaryChunk: ArrayBuffer | null): ArrayBuffer[] {
  return (json.buffers ?? []).map((bufferDef, index) => {
    if (bufferDef.uri) {
      const base64Marker = ';base64,';
      const base64Index = bufferDef.uri.indexOf(base64Marker);
      if (bufferDef.uri.startsWith('data:') && base64Index !== -1) {
        return decodeBase64(bufferDef.uri.slice(base64Index + base64Marker.length));
      }
      throw new Error(
        `External buffer files aren't supported (buffer ${index} references "${bufferDef.uri}") — ` +
          'use a self-contained .glb, or a .gltf with embedded base64 buffers.',
      );
    }
    if (glbBinaryChunk && index === 0) return glbBinaryChunk;
    throw new Error(`No data available for buffer ${index}`);
  });
}

function readComponent(view: DataView, offset: number, componentType: number): number {
  switch (componentType) {
    case COMPONENT_TYPE_BYTE:
      return view.getInt8(offset);
    case COMPONENT_TYPE_UNSIGNED_BYTE:
      return view.getUint8(offset);
    case COMPONENT_TYPE_SHORT:
      return view.getInt16(offset, true);
    case COMPONENT_TYPE_UNSIGNED_SHORT:
      return view.getUint16(offset, true);
    case COMPONENT_TYPE_UNSIGNED_INT:
      return view.getUint32(offset, true);
    case COMPONENT_TYPE_FLOAT:
      return view.getFloat32(offset, true);
    default:
      throw new Error(`Unsupported glTF component type: ${componentType}`);
  }
}

function readAccessor(json: GltfJson, buffers: ArrayBuffer[], accessorIndex: number): Float64Array {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Missing accessor ${accessorIndex}`);

  const numComponents = TYPE_COMPONENT_COUNTS[accessor.type];
  const componentSize = COMPONENT_BYTE_SIZES[accessor.componentType];
  const out = new Float64Array(accessor.count * numComponents);
  if (accessor.bufferView === undefined) return out; // sparse accessors not supported

  const bufferView = json.bufferViews?.[accessor.bufferView];
  if (!bufferView) throw new Error(`Missing bufferView ${accessor.bufferView}`);

  const buffer = buffers[bufferView.buffer];
  const byteStride = bufferView.byteStride ?? numComponents * componentSize;
  const baseOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const view = new DataView(buffer);

  for (let i = 0; i < accessor.count; i++) {
    const elementOffset = baseOffset + i * byteStride;
    for (let c = 0; c < numComponents; c++) {
      out[i * numComponents + c] = readComponent(view, elementOffset + c * componentSize, accessor.componentType);
    }
  }
  return out;
}

// Accepts either a .glb (ArrayBuffer) or a .gltf with embedded base64
// buffers (JSON text). External .bin/texture file references aren't
// supported, since the app's file picker only takes one file at a time.
export function parseGltf(input: string | ArrayBuffer): MeshModel {
  let json: GltfJson;
  let glbBinaryChunk: ArrayBuffer | null = null;

  if (typeof input === 'string') {
    json = JSON.parse(input) as GltfJson;
  } else {
    const parsed = parseGlbContainer(input);
    json = parsed.json;
    glbBinaryChunk = parsed.binaryChunk;
  }

  const buffers = resolveBuffers(json, glbBinaryChunk);
  const vertices: MeshModel['vertices'] = [];
  const faces: number[][] = [];

  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const positionAccessorIndex = primitive.attributes.POSITION;
      if (positionAccessorIndex === undefined) continue;

      const positions = readAccessor(json, buffers, positionAccessorIndex);
      const vertexOffset = vertices.length;
      for (let i = 0; i < positions.length / 3; i++) {
        vertices.push({ x: positions[i * 3], y: positions[i * 3 + 1], z: positions[i * 3 + 2] });
      }

      const mode = primitive.mode ?? PRIMITIVE_MODE_TRIANGLES;
      const indices =
        primitive.indices !== undefined
          ? Array.from(readAccessor(json, buffers, primitive.indices))
          : Array.from({ length: positions.length / 3 }, (_, i) => i);

      if (mode === PRIMITIVE_MODE_TRIANGLES) {
        for (let i = 0; i + 2 < indices.length; i += 3) {
          faces.push([vertexOffset + indices[i], vertexOffset + indices[i + 1], vertexOffset + indices[i + 2]]);
        }
      } else if (mode === PRIMITIVE_MODE_LINES) {
        for (let i = 0; i + 1 < indices.length; i += 2) {
          faces.push([vertexOffset + indices[i], vertexOffset + indices[i + 1]]);
        }
      }
      // Other modes (strips/fans/points) are skipped rather than
      // misinterpreted as triangles.
    }
  }

  return { vertices, faces };
}
