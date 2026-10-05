/**
 * Separable 2D box blur for height smoothing.
 * Runs in-place or copies into a new Float32Array.
 */
export function boxBlur(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius <= 0) {
    return new Float32Array(src);
  }

  const out = new Float32Array(width * height);
  const temp = new Float32Array(width * height);
  const r = Math.min(radius, Math.min(width, height) - 1);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let sum = 0;
    let count = 0;

    // Initialize window
    for (let x = -r; x <= r; x++) {
      if (x >= 0 && x < width) {
        sum += src[rowOffset + x];
        count++;
      }
    }
    temp[rowOffset] = sum / count;

    for (let x = 1; x < width; x++) {
      const addX = x + r;
      const subX = x - r - 1;
      if (addX < width) {
        sum += src[rowOffset + addX];
        count++;
      }
      if (subX >= 0) {
        sum -= src[rowOffset + subX];
        count--;
      }
      temp[rowOffset + x] = sum / count;
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    let sum = 0;
    let count = 0;

    for (let y = -r; y <= r; y++) {
      if (y >= 0 && y < height) {
        sum += temp[y * width + x];
        count++;
      }
    }
    out[x] = sum / count;

    for (let y = 1; y < height; y++) {
      const addY = y + r;
      const subY = y - r - 1;
      if (addY < height) {
        sum += temp[addY * width + x];
        count++;
      }
      if (subY >= 0) {
        sum -= temp[subY * width + x];
        count--;
      }
      out[y * width + x] = sum / count;
    }
  }

  return out;
}
