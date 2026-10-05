import { MetricsResult } from '../types';

/**
 * Resizes a 2D float array to target (targetW, targetH) using bilinear interpolation.
 */
export function bilinearResize(
  src: Float32Array,
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number
): Float32Array {
  if (srcW === targetW && srcH === targetH) {
    return new Float32Array(src);
  }

  const out = new Float32Array(targetW * targetH);
  const xRatio = srcW > 1 ? (srcW - 1) / (targetW - 1) : 0;
  const yRatio = srcH > 1 ? (srcH - 1) / (targetH - 1) : 0;

  for (let r = 0; r < targetH; r++) {
    const srcY = r * yRatio;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const yDiff = srcY - y0;

    for (let c = 0; c < targetW; c++) {
      const srcX = c * xRatio;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const xDiff = srcX - x0;

      const p00 = src[y0 * srcW + x0];
      const p10 = src[y0 * srcW + x1];
      const p01 = src[y1 * srcW + x0];
      const p11 = src[y1 * srcW + x1];

      const top = p00 + (p10 - p00) * xDiff;
      const bottom = p01 + (p11 - p01) * xDiff;
      out[r * targetW + c] = top + (bottom - top) * yDiff;
    }
  }

  return out;
}

/**
 * Computes validation metrics: RMSE, MAE, Pearson r, Bias, and Error Map.
 */
export function computeMetrics(
  predicted: Float32Array,
  reference: Float32Array
): MetricsResult {
  const len = Math.min(predicted.length, reference.length);
  if (len === 0) {
    return {
      rmse: 0,
      mae: 0,
      r: 0,
      bias: 0,
      errorMap: new Float32Array(0),
      minError: 0,
      maxError: 0,
      p95Error: 1,
    };
  }

  const errorMap = new Float32Array(len);
  let sumSqErr = 0;
  let sumAbsErr = 0;
  let sumErr = 0;

  let sumP = 0;
  let sumR = 0;
  let validCount = 0;

  for (let i = 0; i < len; i++) {
    const p = predicted[i];
    const r = reference[i];
    if (!Number.isFinite(p) || !Number.isFinite(r)) continue;

    const err = p - r;
    errorMap[i] = err;
    sumSqErr += err * err;
    sumAbsErr += Math.abs(err);
    sumErr += err;

    sumP += p;
    sumR += r;
    validCount++;
  }

  if (validCount === 0) {
    return {
      rmse: 0,
      mae: 0,
      r: 0,
      bias: 0,
      errorMap,
      minError: 0,
      maxError: 0,
      p95Error: 1,
    };
  }

  const rmse = Math.sqrt(sumSqErr / validCount);
  const mae = sumAbsErr / validCount;
  const bias = sumErr / validCount;

  // Pearson correlation r
  const meanP = sumP / validCount;
  const meanR = sumR / validCount;

  let num = 0;
  let denP = 0;
  let denR = 0;

  for (let i = 0; i < len; i++) {
    const p = predicted[i];
    const r = reference[i];
    if (!Number.isFinite(p) || !Number.isFinite(r)) continue;

    const dp = p - meanP;
    const dr = r - meanR;
    num += dp * dr;
    denP += dp * dp;
    denR += dr * dr;
  }

  const den = Math.sqrt(denP * denR);
  const r = den > 1e-9 ? num / den : 0;

  // Min, max, p95 error
  let minError = Infinity;
  let maxError = -Infinity;
  const absErrors: number[] = [];

  for (let i = 0; i < len; i++) {
    const err = errorMap[i];
    if (!Number.isFinite(err)) continue;
    if (err < minError) minError = err;
    if (err > maxError) maxError = err;
    absErrors.push(Math.abs(err));
  }

  absErrors.sort((a, b) => a - b);
  const p95Idx = Math.min(Math.floor(absErrors.length * 0.95), absErrors.length - 1);
  const p95Error = absErrors.length > 0 ? Math.max(0.5, absErrors[p95Idx]) : 5.0;

  return {
    rmse,
    mae,
    r,
    bias,
    errorMap,
    minError,
    maxError,
    p95Error,
  };
}
