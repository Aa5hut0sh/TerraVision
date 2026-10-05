/**
 * Colormaps for 3D visualization layers:
 * - Viridis for heights
 * - Green -> Yellow -> Red for slope
 * - Cool Blue -> White -> Warm Red for validation error
 */

// Sampled viridis control points
const VIRIDIS_POINTS: [number, number, number][] = [
  [68, 1, 84],
  [72, 35, 116],
  [64, 67, 135],
  [52, 94, 141],
  [41, 120, 142],
  [32, 144, 140],
  [34, 167, 132],
  [68, 190, 112],
  [121, 209, 81],
  [189, 222, 38],
  [253, 231, 37],
];

export function viridis(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  const numSegments = VIRIDIS_POINTS.length - 1;
  const idx = clamped * numSegments;
  const i0 = Math.floor(idx);
  const i1 = Math.min(i0 + 1, numSegments);
  const f = idx - i0;

  const c0 = VIRIDIS_POINTS[i0];
  const c1 = VIRIDIS_POINTS[i1];

  return [
    (c0[0] + (c1[0] - c0[0]) * f) / 255,
    (c0[1] + (c1[1] - c0[1]) * f) / 255,
    (c0[2] + (c1[2] - c0[2]) * f) / 255,
  ];
}

/**
 * Green (0 deg) -> Yellow (30 deg) -> Red (60+ deg)
 */
export function slopeColormap(deg: number, maxDeg = 60): [number, number, number] {
  const t = Math.max(0, Math.min(1, deg / maxDeg));
  if (t < 0.5) {
    // Green (0, 0.8, 0.2) to Yellow (1, 0.9, 0.1)
    const f = t / 0.5;
    return [f, 0.8 + 0.1 * f, 0.2 - 0.1 * f];
  } else {
    // Yellow (1, 0.9, 0.1) to Red (0.9, 0.1, 0.1)
    const f = (t - 0.5) / 0.5;
    return [1.0 - 0.1 * f, 0.9 - 0.8 * f, 0.1];
  }
}

/**
 * Blue (under-estimate < 0) -> White (0) -> Red (over-estimate > 0)
 */
export function errorColormap(err: number, maxErr = 10): [number, number, number] {
  if (maxErr <= 0) return [1, 1, 1];
  const t = Math.max(-1, Math.min(1, err / maxErr));

  if (t < 0) {
    // Blue [0.15, 0.45, 0.95] to White [1, 1, 1]
    const f = 1 + t; // 0 (pure blue) to 1 (pure white)
    return [
      0.15 + 0.85 * f,
      0.45 + 0.55 * f,
      0.95 + 0.05 * f,
    ];
  } else {
    // White [1, 1, 1] to Red [0.95, 0.2, 0.2]
    const f = t; // 0 (pure white) to 1 (pure red)
    return [
      1.0 - 0.05 * f,
      1.0 - 0.80 * f,
      1.0 - 0.80 * f,
    ];
  }
}
