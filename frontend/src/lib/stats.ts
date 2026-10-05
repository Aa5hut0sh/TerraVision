import { Stats } from '../types';

export function computeStats(arr: Float32Array, numBins = 30): Stats {
  const len = arr.length;
  if (len === 0) {
    return {
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      std: 0,
      histogram: { bins: [], counts: [] }
    };
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let validCount = 0;

  for (let i = 0; i < len; i++) {
    const v = arr[i];
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    validCount++;
  }

  if (validCount === 0) {
    return {
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      std: 0,
      histogram: { bins: [], counts: [] }
    };
  }

  const mean = sum / validCount;

  // Std dev
  let varianceSum = 0;
  for (let i = 0; i < len; i++) {
    const v = arr[i];
    if (!Number.isFinite(v)) continue;
    const diff = v - mean;
    varianceSum += diff * diff;
  }
  const std = Math.sqrt(varianceSum / validCount);

  // Subsample for fast median if large array
  const sampleSize = Math.min(validCount, 20000);
  const sample = new Float32Array(sampleSize);
  const step = Math.floor(validCount / sampleSize) || 1;
  let sIdx = 0;
  for (let i = 0; i < len && sIdx < sampleSize; i += step) {
    if (Number.isFinite(arr[i])) {
      sample[sIdx++] = arr[i];
    }
  }
  const sorted = Array.from(sample.subarray(0, sIdx)).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;

  // Histogram
  const range = max - min;
  const binStep = range > 0 ? range / numBins : 1;
  const bins = new Array(numBins).fill(0).map((_, i) => min + i * binStep);
  const counts = new Array(numBins).fill(0);

  if (range > 0) {
    for (let i = 0; i < len; i++) {
      const v = arr[i];
      if (!Number.isFinite(v)) continue;
      let binIdx = Math.floor((v - min) / binStep);
      if (binIdx >= numBins) binIdx = numBins - 1;
      if (binIdx < 0) binIdx = 0;
      counts[binIdx]++;
    }
  } else {
    counts[0] = validCount;
  }

  return {
    min,
    max,
    mean,
    median,
    std,
    histogram: {
      bins,
      counts
    }
  };
}
