import { Dataset, SurfaceData } from '../types';
import { boxBlur } from './blur';

export function computeSurfaceData(
  dataset: Dataset,
  scaleFactor: number,
  smoothingRadius: number,
  customPixelSize?: number
): SurfaceData {
  const { width, height, mode, elevation_raw, terrain_raw, metadata } = dataset;
  const len = width * height;
  const rawScaled = new Float32Array(len);

  let baseline = 0;
  let minElev = Infinity;
  let maxElev = -Infinity;

  if (mode === 'relative' || !terrain_raw) {
    // Relative AGL mode: scale entire height
    for (let i = 0; i < len; i++) {
      const val = elevation_raw[i] * scaleFactor;
      rawScaled[i] = val;
      if (val < minElev) minElev = val;
      if (val > maxElev) maxElev = val;
    }
    baseline = 0;
  } else {
    // Absolute mode: only scale the structure height (elevation - terrain)
    for (let i = 0; i < len; i++) {
      const structH = (elevation_raw[i] - terrain_raw[i]) * scaleFactor;
      const totalElev = terrain_raw[i] + Math.max(0, structH);
      rawScaled[i] = totalElev;
      if (totalElev < minElev) minElev = totalElev;
      if (totalElev > maxElev) maxElev = totalElev;
    }
    baseline = minElev;
  }

  // Apply smoothing if requested
  const field = smoothingRadius > 0 ? boxBlur(rawScaled, width, height, smoothingRadius) : rawScaled;

  const pixel_size_m = customPixelSize || metadata.pixel_size_m || 1.0;

  return {
    field,
    baseline,
    width,
    height,
    pixel_size_m,
    scale_factor: scaleFactor,
    smoothing_px: smoothingRadius,
    min_elevation: minElev,
    max_elevation: maxElev,
  };
}
