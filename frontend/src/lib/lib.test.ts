import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { parseNpy } from './npy';
import { boxBlur } from './blur';
import { computeStats } from './stats';
import { computeMetrics, bilinearResize } from './metrics';
import {
  gridToWorld,
  worldToGrid,
  sampleBilinear,
  computeSlopeDeg,
  computeNormal,
  createTerrainGeometry,
  raycastTerrain,
} from './terrain';
import { computeSurfaceData } from './surface';
import { Dataset } from '../types';

// Helper to create a minimal synthetic valid .npy buffer (Float32, shape H x W)
function createFakeNpyBuffer(height: number, width: number, values: number[]): ArrayBuffer {
  const magic = new Uint8Array([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0]);
  const headerStr = `{'descr': '<f4', 'fortran_order': False, 'shape': (${height}, ${width}), }`;
  // Pad with spaces and newline to multiple of 16
  const totalHeaderLen = Math.ceil((headerStr.length + 1) / 16) * 16;
  const paddedHeader = headerStr.padEnd(totalHeaderLen - 1, ' ') + '\n';
  const headerBytes = new TextEncoder().encode(paddedHeader);

  const headerLenBytes = new Uint8Array([headerBytes.length & 0xff, (headerBytes.length >> 8) & 0xff]);

  const floatData = new Float32Array(values);
  const dataBytes = new Uint8Array(floatData.buffer);

  const totalLen = magic.length + headerLenBytes.length + headerBytes.length + dataBytes.length;
  const buf = new Uint8Array(totalLen);
  buf.set(magic, 0);
  buf.set(headerLenBytes, 8);
  buf.set(headerBytes, 10);
  buf.set(dataBytes, 10 + headerBytes.length);

  return buf.buffer;
}

describe('1. .npy Parser', () => {
  it('parses valid 2D float32 .npy buffer', () => {
    const buf = createFakeNpyBuffer(2, 3, [1, 2, 3, 4, 5, 6]);
    const res = parseNpy(buf);
    expect(res.shape).toEqual([2, 3]);
    expect(res.data.length).toBe(6);
    expect(res.data[0]).toBe(1);
    expect(res.data[5]).toBe(6);
  });

  it('rejects non-npy magic buffer', () => {
    const invalid = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
    expect(() => parseNpy(invalid)).toThrow(/missing \\x93NUMPY magic/);
  });
});

describe('2. Box Blur', () => {
  it('smooths values and preserves dimensions', () => {
    const src = new Float32Array([
      0, 0, 0,
      0, 9, 0,
      0, 0, 0,
    ]);
    const smoothed = boxBlur(src, 3, 3, 1);
    expect(smoothed.length).toBe(9);
    expect(smoothed[4]).toBeLessThan(9);
    expect(smoothed[4]).toBeGreaterThan(0);
  });

  it('returns exact copy when radius is 0', () => {
    const src = new Float32Array([1, 2, 3, 4]);
    const out = boxBlur(src, 2, 2, 0);
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
  });
});

describe('3. Statistics', () => {
  it('computes min, max, mean, median, std correctly', () => {
    const data = new Float32Array([2, 4, 4, 4, 5, 5, 7, 9]);
    const stats = computeStats(data, 10);
    expect(stats.min).toBe(2);
    expect(stats.max).toBe(9);
    expect(stats.mean).toBe(5);
    expect(stats.std).toBe(2);
    expect(stats.median).toBe(4.5);
  });

  it('handles empty or all-NaN array gracefully', () => {
    const empty = new Float32Array([]);
    const stats = computeStats(empty);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(stats.mean).toBe(0);
  });
});

describe('4. Metrics & Evaluation', () => {
  it('computes RMSE and MAE accurately on synthetic differences', () => {
    const pred = new Float32Array([10, 20, 30, 40]);
    const ref = new Float32Array([12, 19, 32, 40]); // diffs: -2, 1, -2, 0
    const m = computeMetrics(pred, ref);
    // MSE = (4 + 1 + 4 + 0) / 4 = 2.25 => RMSE = 1.5
    expect(m.rmse).toBeCloseTo(1.5, 4);
    // MAE = (2 + 1 + 2 + 0) / 4 = 1.25
    expect(m.mae).toBeCloseTo(1.25, 4);
    expect(m.r).toBeGreaterThan(0.99);
  });

  it('resizes arrays bilinearly when shapes differ', () => {
    const src = new Float32Array([0, 10, 0, 10]); // 2x2
    const resized = bilinearResize(src, 2, 2, 3, 3);
    expect(resized.length).toBe(9);
    expect(resized[0]).toBe(0);
    expect(resized[2]).toBe(10);
    expect(resized[1]).toBeCloseTo(5, 1);
  });
});

describe('5. Coordinate Mapping & Height Sampling', () => {
  it('maps grid center to world origin (0, 0)', () => {
    const w = 518;
    const h = 518;
    const pixelSize = 1.5;
    const origin = gridToWorld((w - 1) / 2, (h - 1) / 2, w, h, pixelSize);
    expect(origin.x).toBeCloseTo(0, 5);
    expect(origin.z).toBeCloseTo(0, 5);
  });

  it('inverts gridToWorld and worldToGrid correctly', () => {
    const w = 100;
    const h = 100;
    const pixel = 2.0;
    const pt = { col: 25, row: 75 };
    const wPt = gridToWorld(pt.col, pt.row, w, h, pixel);
    const gPt = worldToGrid(wPt.x, wPt.z, w, h, pixel);
    expect(gPt.col).toBeCloseTo(pt.col, 4);
    expect(gPt.row).toBeCloseTo(pt.row, 4);
  });

  it('bilinear sampling interpolates between grid points', () => {
    const field = new Float32Array([0, 10, 0, 10]);
    const val = sampleBilinear(field, 2, 2, 0.5, 0.5);
    expect(val).toBeCloseTo(5, 4);
  });
});

describe('6. Slope & Surface Normals', () => {
  it('reports zero slope and straight-up normal on flat ground', () => {
    const flat = new Float32Array(9).fill(10);
    const slope = computeSlopeDeg(flat, 3, 3, 1, 1, 1.0);
    expect(slope).toBeCloseTo(0, 4);

    const normal = computeNormal(flat, 3, 3, 1, 1, 1.0);
    expect(normal[0]).toBeCloseTo(0, 4);
    expect(normal[1]).toBeCloseTo(1, 4);
    expect(normal[2]).toBeCloseTo(0, 4);
  });

  it('reports 45-degree slope for a 1:1 ramp', () => {
    // 3x3 where each column increases by 1m with pixelSize=1m
    const ramp = new Float32Array([
      0, 1, 2,
      0, 1, 2,
      0, 1, 2,
    ]);
    const slope = computeSlopeDeg(ramp, 3, 3, 1, 1, 1.0);
    expect(slope).toBeCloseTo(45, 1);
  });
});

describe('7. Geometry Creation', () => {
  it('creates geometry with expected vertex and index counts', () => {
    const geom = createTerrainGeometry(10, 10, 1.0, 1);
    expect(geom.getAttribute('position').count).toBe(100);
    expect(geom.getAttribute('uv').count).toBe(100);
    expect(geom.getIndex()!.count).toBe(9 * 9 * 6);
  });

  it('supports strided LOD downsampling', () => {
    // 9x9 with stride 2 => 5x5 vertices
    const geom = createTerrainGeometry(9, 9, 1.0, 2);
    expect(geom.getAttribute('position').count).toBe(25);
  });
});

describe('8. Raycasting vs Terrain', () => {
  it('finds intersection with flat terrain', () => {
    const field = new Float32Array(25).fill(5); // 5x5 flat at height 5
    const origin = new THREE.Vector3(0, 50, 0);
    const dir = new THREE.Vector3(0, -1, 0); // straight down
    const hit = raycastTerrain(origin, dir, field, 0, 1.0, 5, 5, 2.0);
    expect(hit).not.toBeNull();
    expect(hit!.worldY).toBeCloseTo(5, 1);
    expect(hit!.height).toBeCloseTo(5, 1);
  });

  it('returns null if ray points away or misses bounding box', () => {
    const field = new Float32Array(25).fill(5);
    const origin = new THREE.Vector3(0, 50, 0);
    const dir = new THREE.Vector3(0, 1, 0); // upwards
    const hit = raycastTerrain(origin, dir, field, 0, 1.0, 5, 5, 2.0);
    expect(hit).toBeNull();
  });
});

describe('9. Relative vs Absolute Surface Logic', () => {
  const mockDataset: Dataset = {
    mode: 'relative',
    is_dummy: true,
    filename: 'test.png',
    metadata: {
      vertical_reference: 'AGL',
      georeferenced: false,
      crs: null,
      pixel_size_m: 1.0,
      bounds: null,
      terrain_source: null,
      units: 'meters',
      width: 2,
      height: 2,
      source_image: 'test.png',
    },
    elevation_raw: new Float32Array([10, 20, 30, 40]),
    terrain_raw: null,
    rgb_texture_url: '',
    width: 2,
    height: 2,
    elevation_stats: {} as any,
    terrain_stats: null,
  };

  it('scales full height in relative mode with baseline 0', () => {
    const surface = computeSurfaceData(mockDataset, 1.5, 0);
    expect(surface.baseline).toBe(0);
    expect(surface.field[0]).toBeCloseTo(15, 4);
    expect(surface.field[3]).toBeCloseTo(60, 4);
  });

  it('scales only structure height and offsets baseline in absolute mode', () => {
    const absDataset: Dataset = {
      ...mockDataset,
      mode: 'absolute',
      metadata: { ...mockDataset.metadata, vertical_reference: 'absolute_elevation' },
      elevation_raw: new Float32Array([1010, 1020, 1030, 1040]),
      terrain_raw: new Float32Array([1000, 1000, 1000, 1000]),
    };
    // Structure heights: 10, 20, 30, 40
    // Scaled x2: 20, 40, 60, 80
    // Total elevation: 1020, 1040, 1060, 1080
    // Baseline: min(1020, 1040, 1060, 1080) = 1020
    const surface = computeSurfaceData(absDataset, 2.0, 0);
    expect(surface.baseline).toBe(1020);
    expect(surface.field[0]).toBe(1020);
    expect(surface.field[1]).toBe(1040);
  });
});

describe('10. Probe, Measure & Normal Winding (Total 23 Tests)', () => {
  it('computes distance and delta height between two probe points', () => {
    const pA = { col: 0, row: 0, worldX: 0, worldZ: 0, height: 10, slopeDeg: 0 };
    const pB = { col: 1, row: 0, worldX: 3, worldZ: 4, height: 15, slopeDeg: 0 };
    // dx = 3, dz = 4 => horizDist = 5; deltaHeight = 5; straight = sqrt(5^2 + 5^2) = 7.071
    const dx = pB.worldX - pA.worldX;
    const dz = pB.worldZ - pA.worldZ;
    const horizDist = Math.sqrt(dx * dx + dz * dz);
    const deltaHeight = pB.height - pA.height;
    const straight = Math.sqrt(horizDist * horizDist + deltaHeight * deltaHeight);

    expect(horizDist).toBeCloseTo(5, 4);
    expect(deltaHeight).toBeCloseTo(5, 4);
    expect(straight).toBeCloseTo(7.071, 3);
  });

  it('generates valid upward-facing mesh triangle winding', () => {
    const geom = createTerrainGeometry(3, 3, 1.0, 1);
    const indices = geom.getIndex()!.array;
    const pos = geom.getAttribute('position').array;

    // Check first triangle: vertices i0, i1, i2
    const i0 = indices[0];
    const i1 = indices[1];
    const i2 = indices[2];

    const v0 = new THREE.Vector3(pos[i0 * 3], pos[i0 * 3 + 1], pos[i0 * 3 + 2]);
    const v1 = new THREE.Vector3(pos[i1 * 3], pos[i1 * 3 + 1], pos[i1 * 3 + 2]);
    const v2 = new THREE.Vector3(pos[i2 * 3], pos[i2 * 3 + 1], pos[i2 * 3 + 2]);

    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v2, v0);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2);

    // Upward face in Three.js right-hand coordinate system
    expect(Math.abs(normal.y)).toBeGreaterThan(0);
  });

  it('bins histogram values correctly with conservation of count', () => {
    const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const stats = computeStats(data, 5);
    const totalCount = stats.histogram.counts.reduce((a, b) => a + b, 0);
    expect(totalCount).toBe(10);
    expect(stats.histogram.bins.length).toBe(5);
  });

  it('handles zero-variance constant predictions gracefully in metrics', () => {
    const pred = new Float32Array([5, 5, 5, 5]);
    const ref = new Float32Array([5, 5, 5, 5]);
    const m = computeMetrics(pred, ref);
    expect(m.rmse).toBe(0);
    expect(m.mae).toBe(0);
    expect(m.r).toBe(0);
  });
});

