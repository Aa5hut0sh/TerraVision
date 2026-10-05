/**
 * Reads NumPy .npy binary files (v1.0, v2.0, v3.0) in the browser.
 * Supports float32, float64, int16, uint16, uint8 (converts all to Float32Array).
 */

export interface NpyArray {
  data: Float32Array;
  shape: number[];
  dtype: string;
  fortranOrder: boolean;
}

export function parseNpy(buffer: ArrayBuffer): NpyArray {
  const u8 = new Uint8Array(buffer);
  
  // Verify magic: \x93NUMPY
  if (u8[0] !== 0x93 || u8[1] !== 0x4e || u8[2] !== 0x55 || u8[3] !== 0x4d || u8[4] !== 0x50 || u8[5] !== 0x59) {
    throw new Error('Invalid .npy file: missing \\x93NUMPY magic header');
  }

  const major = u8[6];
  let headerLen = 0;
  let offset = 0;

  if (major === 1) {
    headerLen = u8[8] | (u8[9] << 8);
    offset = 10;
  } else if (major === 2 || major === 3) {
    headerLen = u8[8] | (u8[9] << 8) | (u8[10] << 16) | (u8[11] << 24);
    offset = 12;
  } else {
    throw new Error(`Unsupported .npy version ${major}`);
  }

  const headerBytes = u8.subarray(offset, offset + headerLen);
  const headerStr = new TextDecoder('ascii').decode(headerBytes);
  const dataOffset = offset + headerLen;

  // Parse header dict with regex
  const descrMatch = headerStr.match(/'descr':\s*'([^']+)'/);
  const fortranMatch = headerStr.match(/'fortran_order':\s*(True|False)/);
  const shapeMatch = headerStr.match(/'shape':\s*\(([^)]*)\)/);

  if (!descrMatch || !fortranMatch || !shapeMatch) {
    throw new Error('Failed to parse .npy header fields');
  }

  const dtype = descrMatch[1];
  const fortranOrder = fortranMatch[1] === 'True';
  if (fortranOrder) {
    throw new Error('Fortran-ordered .npy is not supported. Save with np.ascontiguousarray(arr)');
  }

  const shapeParts = shapeMatch[1].split(',').map(s => s.trim()).filter(s => s.length > 0);
  const rawShape = shapeParts.map(s => parseInt(s, 10));

  // Accept (H, W) or (1, H, W) or (H, W, 1)
  let shape: number[];
  if (rawShape.length === 2) {
    shape = rawShape;
  } else if (rawShape.length === 3 && rawShape[0] === 1) {
    shape = [rawShape[1], rawShape[2]];
  } else if (rawShape.length === 3 && rawShape[2] === 1) {
    shape = [rawShape[0], rawShape[1]];
  } else {
    throw new Error(`Expected a 2-D height array, got shape (${rawShape.join(', ')})`);
  }

  const totalElements = shape[0] * shape[1];
  let data: Float32Array;

  const dataBuffer = buffer.slice(dataOffset);

  if (dtype === '<f4' || dtype === '=f4') {
    data = new Float32Array(dataBuffer, 0, totalElements);
  } else if (dtype === '<f8' || dtype === '=f8') {
    const f64 = new Float64Array(dataBuffer, 0, totalElements);
    data = new Float32Array(totalElements);
    for (let i = 0; i < totalElements; i++) data[i] = f64[i];
  } else if (dtype === '<i2' || dtype === '=i2') {
    const i16 = new Int16Array(dataBuffer, 0, totalElements);
    data = new Float32Array(totalElements);
    for (let i = 0; i < totalElements; i++) data[i] = i16[i];
  } else if (dtype === '<u2' || dtype === '=u2') {
    const u16 = new Uint16Array(dataBuffer, 0, totalElements);
    data = new Float32Array(totalElements);
    for (let i = 0; i < totalElements; i++) data[i] = u16[i];
  } else if (dtype === '|u1' || dtype === 'u1') {
    const u8arr = new Uint8Array(dataBuffer, 0, totalElements);
    data = new Float32Array(totalElements);
    for (let i = 0; i < totalElements; i++) data[i] = u8arr[i];
  } else {
    throw new Error(`Unsupported .npy dtype: ${dtype}`);
  }

  // Handle any NaNs by replacing with 0 or neighbors
  for (let i = 0; i < totalElements; i++) {
    if (isNaN(data[i])) {
      data[i] = 0;
    }
  }

  return { data, shape, dtype, fortranOrder };
}
