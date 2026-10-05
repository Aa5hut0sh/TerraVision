export type InputKind = 'png' | 'jpg' | 'geotiff';
export type DSMMode = 'relative' | 'absolute';
export type VerticalReference = 'AGL' | 'absolute_elevation';
export type JobStatus = 'queued' | 'running' | 'done' | 'error';
export type ViewLayer = 'rgb' | 'height' | 'slope' | 'grayscale' | 'error';
export type NavigationMode = 'fly' | 'walk';

export interface JobFiles {
  rgb: string;
  elevation: string;
  metadata: string;
  terrain: string | null;
}

export interface JobResult {
  input_kind: InputKind;
  mode: DSMMode;
  original_filename: string;
  dummy: boolean;
  files: JobFiles;
}

export interface JobResponse {
  job_id: string;
  status: JobStatus;
  stages: string[];
  stage_index: number;
  error: string | null;
  result: JobResult | null;
}

export interface RawMetadata {
  source_image?: string;
  model_checkpoint?: string;
  output_type?: string;
  units?: string;
  coordinate_reference_system?: string | null;
  georeferenced?: boolean;
  pixel_size_m?: number;
  bounds?: [number, number, number, number];
  terrain_source?: string | null;
  height_min_m?: number;
  height_max_m?: number;
  height_mean_m?: number;
  height_median_m?: number;
  width?: number;
  height?: number;
  future_part2_fields?: {
    terrain_source?: string | null;
    terrain_units?: string;
    absolute_elevation_available?: boolean;
    geotransform_available?: boolean;
    vertical_reference?: string;
  };
  vertical_reference?: string;
  mode?: string;
  [key: string]: any;
}

export interface NormalizedMetadata {
  vertical_reference: VerticalReference;
  georeferenced: boolean;
  crs: string | null;
  pixel_size_m: number | null;
  bounds: [number, number, number, number] | null;
  terrain_source: string | null;
  units: string;
  width: number;
  height: number;
  source_image: string;
}

export interface Stats {
  min: number;
  max: number;
  mean: number;
  median: number;
  std: number;
  histogram: {
    bins: number[];
    counts: number[];
  };
}

export interface Dataset {
  mode: DSMMode;
  is_dummy: boolean;
  filename: string;
  metadata: NormalizedMetadata;
  elevation_raw: Float32Array;
  terrain_raw: Float32Array | null;
  rgb_texture_url: string;
  width: number;
  height: number;
  elevation_stats: Stats;
  terrain_stats: Stats | null;
}

export interface ProbePoint {
  col: number;
  row: number;
  worldX: number;
  worldZ: number;
  height: number;
  structureHeight?: number;
  terrainHeight?: number;
  slopeDeg: number;
}

export interface MetricsResult {
  rmse: number;
  mae: number;
  r: number;
  bias: number;
  errorMap: Float32Array;
  minError: number;
  maxError: number;
  p95Error: number;
}

export interface SurfaceData {
  field: Float32Array;
  baseline: number;
  width: number;
  height: number;
  pixel_size_m: number;
  scale_factor: number;
  smoothing_px: number;
  min_elevation: number;
  max_elevation: number;
}
