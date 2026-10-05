import * as THREE from 'three';

export interface GridCoord {
  col: number;
  row: number;
}

export interface WorldCoord {
  x: number;
  z: number;
}

export interface RayHit {
  worldX: number;
  worldY: number;
  worldZ: number;
  col: number;
  row: number;
  height: number;
  distance: number;
}

export function gridToWorld(
  col: number,
  row: number,
  w: number,
  h: number,
  pixelSize: number
): WorldCoord {
  return {
    x: (col - (w - 1) / 2) * pixelSize,
    z: (row - (h - 1) / 2) * pixelSize,
  };
}

export function worldToGrid(
  x: number,
  z: number,
  w: number,
  h: number,
  pixelSize: number
): GridCoord {
  return {
    col: x / pixelSize + (w - 1) / 2,
    row: z / pixelSize + (h - 1) / 2,
  };
}

export function sampleBilinear(
  field: Float32Array,
  w: number,
  h: number,
  col: number,
  row: number
): number {
  const c = Math.max(0, Math.min(w - 1, col));
  const r = Math.max(0, Math.min(h - 1, row));

  const c0 = Math.floor(c);
  const c1 = Math.min(c0 + 1, w - 1);
  const r0 = Math.floor(r);
  const r1 = Math.min(r0 + 1, h - 1);

  const fc = c - c0;
  const fr = r - r0;

  const v00 = field[r0 * w + c0];
  const v10 = field[r0 * w + c1];
  const v01 = field[r1 * w + c0];
  const v11 = field[r1 * w + c1];

  const top = v00 + (v10 - v00) * fc;
  const bottom = v01 + (v11 - v01) * fc;
  return top + (bottom - top) * fr;
}

export function computeSlopeDeg(
  field: Float32Array,
  w: number,
  h: number,
  col: number,
  row: number,
  pixelSize: number
): number {
  const c = Math.round(col);
  const r = Math.round(row);

  const cLeft = Math.max(0, c - 1);
  const cRight = Math.min(w - 1, c + 1);
  const rTop = Math.max(0, r - 1);
  const rBottom = Math.min(h - 1, r + 1);

  const dx = (cRight - cLeft) * pixelSize || pixelSize;
  const dz = (rBottom - rTop) * pixelSize || pixelSize;

  const dzdx = (field[r * w + cRight] - field[r * w + cLeft]) / dx;
  const dzdz = (field[rBottom * w + c] - field[rTop * w + c]) / dz;

  const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdz * dzdz));
  return slopeRad * (180 / Math.PI);
}

export function computeNormal(
  field: Float32Array,
  w: number,
  h: number,
  c: number,
  r: number,
  pixelSize: number,
  exaggeration = 1.0
): [number, number, number] {
  const cLeft = Math.max(0, c - 1);
  const cRight = Math.min(w - 1, c + 1);
  const rTop = Math.max(0, r - 1);
  const rBottom = Math.min(h - 1, r + 1);

  const dx = (cRight - cLeft) * pixelSize || pixelSize;
  const dz = (rBottom - rTop) * pixelSize || pixelSize;

  const dy_dx = ((field[r * w + cRight] - field[r * w + cLeft]) * exaggeration) / dx;
  const dy_dz = ((field[rBottom * w + c] - field[rTop * w + c]) * exaggeration) / dz;

  // Unnormalized normal: [-dy/dx, 1, -dy/dz]
  const nx = -dy_dx;
  const ny = 1.0;
  const nz = -dy_dz;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;

  return [nx / len, ny / len, nz / len];
}

/**
 * Creates an indexed BufferGeometry for the terrain heightfield.
 */
export function createTerrainGeometry(
  w: number,
  h: number,
  pixelSize: number,
  stride = 1
): THREE.BufferGeometry {
  const cols = Math.floor((w - 1) / stride) + 1;
  const rows = Math.floor((h - 1) / stride) + 1;
  const vertexCount = cols * rows;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  const halfExtentX = ((w - 1) * pixelSize) / 2;
  const halfExtentZ = ((h - 1) * pixelSize) / 2;

  let vIdx = 0;
  let uvIdx = 0;

  for (let r = 0; r < rows; r++) {
    const origRow = Math.min(r * stride, h - 1);
    const z = (origRow - (h - 1) / 2) * pixelSize;
    const v = 1 - origRow / (h - 1);

    for (let c = 0; c < cols; c++) {
      const origCol = Math.min(c * stride, w - 1);
      const x = (origCol - (w - 1) / 2) * pixelSize;
      const u = origCol / (w - 1);

      positions[vIdx * 3] = x;
      positions[vIdx * 3 + 1] = 0;
      positions[vIdx * 3 + 2] = z;

      normals[vIdx * 3] = 0;
      normals[vIdx * 3 + 1] = 1;
      normals[vIdx * 3 + 2] = 0;

      uvs[uvIdx * 2] = u;
      uvs[uvIdx * 2 + 1] = v;

      vIdx++;
      uvIdx++;
    }
  }

  // Indices
  const indexCount = (cols - 1) * (rows - 1) * 6;
  const indices = new Uint32Array(indexCount);
  let iIdx = 0;

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = r * cols + (c + 1);
      const d = (r + 1) * cols + c;
      const e = (r + 1) * cols + (c + 1);

      // Two triangles per quad: a-d-b and b-d-e
      indices[iIdx++] = a;
      indices[iIdx++] = d;
      indices[iIdx++] = b;

      indices[iIdx++] = b;
      indices[iIdx++] = d;
      indices[iIdx++] = e;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  return geometry;
}

/**
 * Fast CPU ray-marching against heightfield with bisection refinement.
 */
export function raycastTerrain(
  rayOrigin: THREE.Vector3,
  rayDir: THREE.Vector3,
  field: Float32Array,
  baseline: number,
  exaggeration: number,
  w: number,
  h: number,
  pixelSize: number,
  maxDistance = 2000
): RayHit | null {
  const minX = -((w - 1) / 2) * pixelSize;
  const maxX = ((w - 1) / 2) * pixelSize;
  const minZ = -((h - 1) / 2) * pixelSize;
  const maxZ = ((h - 1) / 2) * pixelSize;

  const stepSize = Math.max(0.5, pixelSize * 0.75);
  let t = 0;
  let prevDiff = 0;
  let prevT = 0;
  let hasEntered = false;

  while (t < maxDistance) {
    const rx = rayOrigin.x + rayDir.x * t;
    const ry = rayOrigin.y + rayDir.y * t;
    const rz = rayOrigin.z + rayDir.z * t;

    // Check if within bounds
    if (rx >= minX && rx <= maxX && rz >= minZ && rz <= maxZ) {
      const g = worldToGrid(rx, rz, w, h, pixelSize);
      const elev = sampleBilinear(field, w, h, g.col, g.row);
      const surfaceY = (elev - baseline) * exaggeration;
      const diff = ry - surfaceY;

      if (!hasEntered) {
        hasEntered = true;
      } else if (diff <= 0 && prevDiff > 0) {
        // Crossed the surface! Refine with bisection
        let t0 = prevT;
        let t1 = t;

        for (let iter = 0; iter < 12; iter++) {
          const midT = (t0 + t1) * 0.5;
          const mx = rayOrigin.x + rayDir.x * midT;
          const my = rayOrigin.y + rayDir.y * midT;
          const mz = rayOrigin.z + rayDir.z * midT;
          const mg = worldToGrid(mx, mz, w, h, pixelSize);
          const mElev = sampleBilinear(field, w, h, mg.col, mg.row);
          const mSurfaceY = (mElev - baseline) * exaggeration;

          if (my <= mSurfaceY) {
            t1 = midT;
          } else {
            t0 = midT;
          }
        }

        const hitT = (t0 + t1) * 0.5;
        const hx = rayOrigin.x + rayDir.x * hitT;
        const hy = rayOrigin.y + rayDir.y * hitT;
        const hz = rayOrigin.z + rayDir.z * hitT;
        const hg = worldToGrid(hx, hz, w, h, pixelSize);
        const actualElev = sampleBilinear(field, w, h, hg.col, hg.row);

        return {
          worldX: hx,
          worldY: hy,
          worldZ: hz,
          col: hg.col,
          row: hg.row,
          height: actualElev,
          distance: hitT,
        };
      }

      prevDiff = diff;
      prevT = t;
    } else {
      if (hasEntered) {
        // Exited bounding box
        break;
      }
    }

    t += stepSize;
  }

  return null;
}
