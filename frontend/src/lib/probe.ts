import { Dataset, ProbePoint, SurfaceData } from '../types';
import { sampleBilinear, computeSlopeDeg } from './terrain';

export function createProbePoint(
  dataset: Dataset,
  surface: SurfaceData,
  col: number,
  row: number,
  worldX: number,
  worldZ: number
): ProbePoint {
  const { width, height } = surface;
  const hVal = sampleBilinear(surface.field, width, height, col, row);
  const slope = computeSlopeDeg(surface.field, width, height, col, row, surface.pixel_size_m);

  let structureHeight: number | undefined;
  let terrainHeight: number | undefined;

  if (dataset.mode === 'absolute' && dataset.terrain_raw) {
    terrainHeight = sampleBilinear(dataset.terrain_raw, width, height, col, row);
    structureHeight = Math.max(0, hVal - terrainHeight);
  }

  return {
    col,
    row,
    worldX,
    worldZ,
    height: hVal,
    structureHeight,
    terrainHeight,
    slopeDeg: slope,
  };
}

export function computeMeasure(
  pA: ProbePoint,
  pB: ProbePoint
): {
  horizontalDist: number;
  deltaHeight: number;
  straightDist: number;
  slopeAngleDeg: number;
} {
  const dx = pB.worldX - pA.worldX;
  const dz = pB.worldZ - pA.worldZ;
  const horizontalDist = Math.sqrt(dx * dx + dz * dz);
  const deltaHeight = pB.height - pA.height;
  const straightDist = Math.sqrt(horizontalDist * horizontalDist + deltaHeight * deltaHeight);
  const slopeAngleDeg = horizontalDist > 1e-4
    ? Math.atan(Math.abs(deltaHeight) / horizontalDist) * (180 / Math.PI)
    : 90;

  return {
    horizontalDist,
    deltaHeight,
    straightDist,
    slopeAngleDeg,
  };
}
