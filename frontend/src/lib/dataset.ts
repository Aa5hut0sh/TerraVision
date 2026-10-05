import { Dataset, JobResult, NormalizedMetadata, RawMetadata, VerticalReference } from '../types';
import { fetchArrayBuffer, fetchJson } from './api';
import { parseNpy } from './npy';
import { computeStats } from './stats';

export function normalizeMetadata(raw: RawMetadata): NormalizedMetadata {
  let vRef: VerticalReference = 'AGL';
  const rawRef = raw.vertical_reference || raw.future_part2_fields?.vertical_reference;
  if (rawRef === 'absolute_elevation' || raw.mode === 'absolute') {
    vRef = 'absolute_elevation';
  }

  const georef = Boolean(raw.georeferenced || raw.future_part2_fields?.geotransform_available);
  const crs = raw.coordinate_reference_system || null;
  const pixel_size_m = typeof raw.pixel_size_m === 'number' ? raw.pixel_size_m : null;
  const bounds = Array.isArray(raw.bounds) && raw.bounds.length === 4 ? (raw.bounds as [number, number, number, number]) : null;
  const terrain_source = raw.terrain_source || raw.future_part2_fields?.terrain_source || null;
  const units = raw.units || raw.future_part2_fields?.terrain_units || 'meters';

  return {
    vertical_reference: vRef,
    georeferenced: georef,
    crs,
    pixel_size_m,
    bounds,
    terrain_source,
    units,
    width: raw.width || 518,
    height: raw.height || 518,
    source_image: raw.source_image || 'aerial_tile',
    landscape_classification: raw.landscape_classification || null,
  };
}

export async function buildDataset(jobResult: JobResult): Promise<Dataset> {
  const { files, mode, dummy, original_filename } = jobResult;

  // 1. Fetch metadata
  const rawMeta: RawMetadata = await fetchJson<RawMetadata>(files.metadata);
  const normMeta = normalizeMetadata(rawMeta);

  // 2. Fetch elevation array
  const elevBuffer = await fetchArrayBuffer(files.elevation);
  const parsedElev = parseNpy(elevBuffer);
  const elevStats = computeStats(parsedElev.data);

  // 3. Fetch terrain if absolute mode
  let terrainData: Float32Array | null = null;
  let terrainStats = null;
  if (files.terrain) {
    const terrainBuffer = await fetchArrayBuffer(files.terrain);
    const parsedTerrain = parseNpy(terrainBuffer);
    terrainData = parsedTerrain.data;
    terrainStats = computeStats(terrainData);
  }

  return {
    mode,
    is_dummy: dummy,
    filename: original_filename,
    metadata: normMeta,
    elevation_raw: parsedElev.data,
    terrain_raw: terrainData,
    rgb_texture_url: files.rgb,
    width: parsedElev.shape[1],
    height: parsedElev.shape[0],
    elevation_stats: elevStats,
    terrain_stats: terrainStats,
  };
}
