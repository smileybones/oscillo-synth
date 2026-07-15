import type { Path } from '../geometry/path';
import type { Vec3 } from '../geometry/vec3';
import { identity, multiply, rotationX, rotationY, rotationZ, transformPoint } from '../geometry/mat4';
import type { Source } from './source';

// A flat vertex/face wireframe, format-agnostic — OBJ and glTF/GLB loaders
// both produce this same shape, so rotation/projection/normalization only
// need to be written once.
export interface MeshModel {
  vertices: Vec3[];
  faces: number[][];
}

export function parseObj(text: string): MeshModel {
  const vertices: Vec3[] = [];
  const faces: number[][] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const keyword = parts[0];

    if (keyword === 'v') {
      const x = Number(parts[1]);
      const y = Number(parts[2]);
      const z = Number(parts[3]);
      if ([x, y, z].some((n) => Number.isNaN(n))) continue;
      vertices.push({ x, y, z });
    } else if (keyword === 'f') {
      const indices: number[] = [];
      for (let i = 1; i < parts.length; i++) {
        const token = parts[i].split('/')[0];
        let idx = Number(token);
        if (Number.isNaN(idx) || idx === 0) continue;
        // OBJ indices are 1-based; negative indices count back from the end.
        idx = idx < 0 ? vertices.length + idx : idx - 1;
        indices.push(idx);
      }
      if (indices.length >= 2) faces.push(indices);
    }
  }

  return { vertices, faces };
}

// Centers on the centroid and scales by the bounding-sphere radius (not an
// axis-aligned bounding box) — since the model rotates in place, this is the
// only normalization that guarantees every vertex stays within radius 1 of
// the origin at every orientation, not just its resting pose.
export function normalizeMeshModel(model: MeshModel): MeshModel {
  const { vertices, faces } = model;
  if (vertices.length === 0) return model;

  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const v of vertices) {
    sx += v.x;
    sy += v.y;
    sz += v.z;
  }
  const cx = sx / vertices.length;
  const cy = sy / vertices.length;
  const cz = sz / vertices.length;

  let maxDist = 0;
  for (const v of vertices) {
    maxDist = Math.max(maxDist, Math.hypot(v.x - cx, v.y - cy, v.z - cz));
  }
  const scale = maxDist === 0 ? 1 : 1 / maxDist;

  return {
    vertices: vertices.map((v) => ({
      x: (v.x - cx) * scale,
      y: (v.y - cy) * scale,
      z: (v.z - cz) * scale,
    })),
    faces,
  };
}

export interface MeshRotationSpeed {
  x?: number;
  y?: number;
  z?: number;
}

export class MeshSource implements Source {
  private rotationSpeed: Required<MeshRotationSpeed>;

  constructor(
    private model: MeshModel,
    rotationSpeedDegPerSec: MeshRotationSpeed = {},
  ) {
    this.rotationSpeed = {
      x: rotationSpeedDegPerSec.x ?? 0,
      y: rotationSpeedDegPerSec.y ?? 0,
      z: rotationSpeedDegPerSec.z ?? 0,
    };
  }

  render(t: number): Path[] {
    const toRad = (degPerSec: number) => ((degPerSec * t) % 360) * (Math.PI / 180);
    let rotation = identity();
    rotation = multiply(rotationX(toRad(this.rotationSpeed.x)), rotation);
    rotation = multiply(rotationY(toRad(this.rotationSpeed.y)), rotation);
    rotation = multiply(rotationZ(toRad(this.rotationSpeed.z)), rotation);

    // Orthographic projection: rotate in 3D, then drop z.
    const projected = this.model.vertices.map((v) => transformPoint(rotation, v));

    return this.model.faces.map((face) => ({
      points: face.map((i) => {
        const p = projected[i];
        return { x: p.x, y: p.y };
      }),
      closed: true,
    }));
  }
}
