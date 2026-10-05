# TerraVision: Monocular Aerial Surface Reconstruction & Geospatial Intelligence Platform

TerraVision is an end-to-end geospatial computer vision platform that reconstructs metric 3D Digital Surface Models (DSM) and Above Ground Level (AGL) heightmaps from single monocular aerial or satellite imagery. The platform features an automated dual-lane architecture capable of processing uncalibrated consumer photographs (PNG/JPG) as well as georeferenced multispectral/RGB GeoTIFF datasets.

TerraVision couples a fine-tuned vision foundation model (Depth Anything V2 Small on the GAMUS dataset) with an automated relative-to-absolute calibration engine leveraging SRTM 30m Global DEMs and multispectral landscape classification. Processed scenes are rendered inside a high-performance WebGL 3D flythrough visualization engine with real-time elevation probing and structural measurement tools.

---

## Key Capabilities

- **Monocular Metric Depth Inference (Lane 1)**: Infers Above Ground Level (AGL) heights in metres from a single RGB perspective without requiring stereo pairs or LiDAR point clouds.
- **Relative to Absolute Georeferenced Calibration (Lane 2)**: Automatically extracts embedded spatial CRS metadata from GeoTIFF inputs, queries OpenTopography SRTM 30m base topography, classifies terrain into spectral land-cover categories, and applies per-class regression to construct real-world Digital Surface Models (WGS84 elevation).
- **Interactive WebGL Flythrough Engine**: Browser-based Three.js and React Three Fiber 3D viewport supporting 60 FPS rendering with dual flight dynamics (Fly and First-Person Walk), analytical vertical wall shading, crosshair height probing, and Euclidean A-to-B distance profiling.
- **Enterprise Geospatial Export**: Direct download of calibrated 32-bit floating-point GeoTIFFs, raw NumPy depth arrays (`.npy`), normalized 16-bit displacement maps, textured 3D meshes (`.obj`), and CSV flight path profiles.
- **Containerized Cloud Architecture**: Fully dockerized backend and frontend services configured for single-command deployment with Nginx reverse proxy and Let's Encrypt automated TLS.

---

## System Architecture

TerraVision operates across two decoupled processing tiers connected via an asynchronous task execution pipeline:

```
┌────────────────────────────────────────────────────────────────────────┐
│                              CLIENT TIER                                │
│                                                                        │
│   Web Interface (React 19 + TypeScript + Vite + Tailwind CSS)          │
│   Three.js / React Three Fiber 3D Flythrough Engine                    │
│   Real-time Elevation Probe, Dynamic Lighting, and Contour Shaders     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST API (Port 8000)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                              SERVER TIER                                │
│                                                                        │
│   FastAPI Asynchronous Gateway + Disk-Backed Job Persistence           │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ LANE 1: Monocular Metric Inference Engine                      │   │
│   │ - GAMUS Fine-Tuned Depth Anything V2 Small (ViT-S / DPT Head)  │   │
│   │ - Metric Above Ground Level (AGL) height prediction (metres)   │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│                 ┌─────────────────┴─────────────────┐                  │
│                 │ Input Format Routing              │                  │
│                 ▼                                   ▼                  │
│      [Standard PNG / JPEG]                 [Georeferenced GeoTIFF]     │
│                 │                                   │                  │
│                 ▼                                   ▼                  │
│      ┌─────────────────────┐             ┌─────────────────────┐       │
│      │ Relative DSM (rDSM) │             │ LANE 2: Calibration │       │
│      │ Normalized Display  │             │ - CRS & Bounds Parse│       │
│      │ Colormap Rendering  │             │ - OpenTopography DEM│       │
│      └──────────┬──────────┘             │ - Land Cover Class  │       │
│                 │                        │ - Per-Class Fitting │       │
│                 │                        └──────────┬──────────┘       │
│                 │                                   │                  │
│                 ▼                                   ▼                  │
│      ┌─────────────────────┐             ┌─────────────────────┐       │
│      │ Metric AGL Surface  │             │ Absolute Metric DSM │       │
│      │ 3D Mesh Generation  │             │ 32-bit Float GeoTIFF│       │
│      └──────────┬──────────┘             └──────────┬──────────┘       │
│                 └─────────────────┬─────────────────┘                  │
│                                   ▼                                    │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ Artifact Serialization: .npy arrays, GeoTIFF, PNG maps, .obj   │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Processing Pipeline Specifications

### Lane 1: Monocular Metric Height Estimation

Lane 1 maps single monocular optical inputs to dense per-pixel height above ground level (AGL, in metres).

1. **Backbone**: Vision Transformer (ViT-Small) with patch size $14 \times 14$, pre-trained with self-supervised DINOv2 representations.
2. **Dense Prediction Head**: Multiscale DPT (Dense Prediction Transformer) featuring reassemble blocks, feature fusion stages, and bilinear upsampling layers.
3. **Training Distribution**: Supervised on the GAMUS dataset containing aerial orthophotos aligned with airborne LiDAR ground truth across diverse urban and rural topographies.
4. **Resolution Normalization**: Input images are padded or resized to dynamic multiples of 14, followed by ImageNet standard normalizations ($\mu = [0.485, 0.456, 0.406]$, $\sigma = [0.229, 0.224, 0.225]$).

### Lane 2: Relative to Absolute Elevation Calibration

When the user uploads a georeferenced GeoTIFF, TerraVision activates Lane 2 to anchor relative structural heights onto real-world ellipsoidal/geoid datums (EGM96 / WGS84).

```
┌─────────────────┐     ┌───────────────────────┐     ┌───────────────────────┐
│ Embedded GeoTIFF│────▶│ Spatial Metadata      │────▶│ OpenTopography API    │
│ Coordinates     │     │ Extraction (EPSG/WGS84│     │ SRTM 30m Global DEM   │
└─────────────────┘     └───────────────────────┘     └───────────┬───────────┘
                                                                  │
                                                                  ▼
┌─────────────────┐     ┌───────────────────────┐     ┌───────────────────────┐
│ Absolute DSM    │◀────│ Per-Class Scale       │◀────│ Landscape Spectral    │
│ (Real Metres)   │     │ Calibration Model     │     │ Classification        │
└─────────────────┘     └───────────────────────┘     └───────────────────────┘
```

#### 1. Spatial Metadata Extraction
The georeferencing engine interrogates GeoTIFF tag directories via Rasterio and pure-Python TIFF fallback readers. It parses:
- ModelPixelScaleTag and ModelTiepointTag / ModelTransformationTag
- Coordinate Reference System (CRS) projection definitions
- WGS84 bounding envelope: $[S, W, N, E]$ in decimal degrees

#### 2. Base Topography Acquisition
Using the computed bounding box, the system issues an authenticated REST request to the OpenTopography Global DEM endpoint:
```
https://portal.opentopography.org/API/globaldem?demtype=SRTMGL1&south={S}&north={N}&west={W}&east={E}&outputFormat=GTiff
```
The downloaded SRTM GL1 tile (30m spatial resolution) provides the absolute bare-earth baseline elevation ($Z_{\text{base}}$). If the API is unreachable, the system executes a regional relief fallback approximating local terrain slopes. The base DEM is resampled to match the exact matrix dimensions of the input image using bilinear spatial interpolation.

#### 3. Spectral Landscape Classification
Physical features scale differently between optical textures and radar returns. TerraVision segments the scene into four land-cover classes using visible spectrum reflectance transforms and geometric roughness:

- **Excess Green Index (ExG)**:
  $$\text{ExG} = 2G - R - B$$
- **Visible Atmospherically Resistant Index (VARI)**:
  $$\text{VARI} = \frac{G - R}{G + R - B + \epsilon}$$
- **Normalized Blue-Red Water Difference**:
  $$\text{NDWI}_{\text{vis}} = \frac{B - R}{B + R + \epsilon}$$
- **Height Gradient Roughness**:
  $$\nabla r = \sqrt{\left(\frac{\partial r}{\partial x}\right)^2 + \left(\frac{\partial r}{\partial y}\right)^2}$$

Classification boundaries assign each pixel $(i, j)$ into one of four distinct geospatial categories:
- **Urban / Built Environment**: High structural gradient $\nabla r$ combined with low vegetation index.
- **Vegetation / Canopy**: $\text{ExG} > 0.08$ and $\text{VARI} > 0.05$.
- **Water Bodies**: High blue reflectance ratio combined with near-zero local height variance.
- **Bare Ground / Agriculture**: Remaining neutral non-vegetated terrain surfaces.

#### 4. Per-Class Scale Calibration Model
For each landscape category $c$, an independent scale-shift regression maps relative height $r(i,j)$ onto absolute ground elevation $Z(i,j)$:

$$Z(i, j) = \text{DEM}_{\text{base}}(i, j) + \alpha_c \cdot r(i, j) + \beta_c$$

Where:
- $\alpha_c$ is the class-specific scaling coefficient calibrating optical depth disparity to metric vertical displacement.
- $\beta_c$ compensates for baseline penetration offsets (e.g. radar penetration into tree canopies vs building rooftop returns).

The resulting 2D matrix is encoded into a georeferenced single-band 32-bit IEEE floating-point GeoTIFF carrying the original CRS and geotransform.

---

## 3D WebGL Flythrough Engine

The client visualizer is built on Three.js and `@react-three/fiber`, rendering displacement geometry directly on the GPU.

### Key Visualizer Features

1. **Dual Navigation Physics**:
   - **Fly Mode**: Free 6-DOF orbital exploration with yaw, pitch, roll, and variable cruise velocity.
   - **Walk Mode**: Ground-clamped first-person inspection with collision floor detection hovering 1.8 metres above terrain.
2. **Analytical Wall Shading**:
   To eliminate blurry stretched textures on sheer building facades, custom vertex normals are calculated analytically from height field gradients:
   $$\mathbf{N} = \left(-\frac{\partial h}{\partial x}, 1.0, -\frac{\partial h}{\partial y}\right)^T$$
   Vertical building edges receive directional ambient darkening, highlighting building contours in complex city blocks.
3. **Crosshair Height Probe**:
   Real-time raycaster intersecting screen crosshairs with terrain vertices. Displays instant spatial coordinates, metric AGL, and absolute elevation above sea level at the mouse position.
4. **Elevation Profiler (A-B Ruler)**:
   Interactive marker placement calculating Euclidean distance ($d = \sqrt{\Delta x^2 + \Delta y^2 + \Delta z^2}$), horizontal run, and vertical gradient between arbitrary surface points.
5. **Dynamic False-Color Colormaps**:
   Real-time shader colormaps for height inspection: **Viridis**, **Turbo**, **Terrain Elevation**, and **Monochrome Grayscale**.

---

## Directory Structure

```
GeoProject/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI application, job queue, and routing
│   │   ├── depth_pipeline.py        # ViT-S GAMUS Depth Anything V2 inference engine
│   │   ├── geotiff_handler.py       # CRS detection, bounds parsing, and GeoTIFF reader
│   │   ├── landscape_classifier.py  # Spectral indices (ExG, VARI) and land-cover segmentation
│   │   └── absolute_calibrator.py   # SRTM 30m retrieval, bilinear resampling, and regression
│   ├── model/
│   │   ├── best.pt                  # GAMUS model weights (ViT-S / DPT, 297 MB)
│   │   ├── depth_anything_v2/       # Model architecture definitions
│   │   └── dinov2/                  # Dinov2 backbone primitives
│   ├── data/
│   │   ├── jobs/                    # Disk-backed atomic job state manifests
│   │   ├── results/                 # Per-job output files (NPY, PNG, GeoTIFF, OBJ)
│   │   └── uploads/                 # Temporary client upload directory
│   ├── reference/                   # Reference datasets and sample imagery
│   ├── extract_h5.py                # GAMUS H5 extraction and inspection utility
│   ├── requirements.txt             # Python runtime dependencies
│   └── Dockerfile                   # Production Python backend container
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Visualizer3D.tsx     # Three.js / React Three Fiber 3D viewport
│   │   │   ├── Canvas3D.tsx         # WebGL canvas container and render loop
│   │   │   ├── Controls.tsx         # Fly/Walk parameters, colormaps, sun position
│   │   │   ├── ElevationProfile.tsx # Point A-to-B measuring tool
│   │   │   ├── HeightLegend.tsx     # Dynamic metric colorbar legend
│   │   │   ├── ImageUploader.tsx    # Drag-and-drop file ingestion and demo loader
│   │   │   └── MetricsOverlay.tsx   # Statistical telemetry (min, max, mean, coverage)
│   │   ├── lib/
│   │   │   ├── api.ts               # Resilient backend polling client with retries
│   │   │   ├── three-utils.ts       # Mesh generation, analytical normals, OBJ export
│   │   │   └── colormaps.ts         # Analytical RGB transfer functions
│   │   ├── types.ts                 # TypeScript type definitions
│   │   └── App.tsx                  # Root user interface layout
│   ├── package.json                 # Node dependencies and scripts
│   ├── vite.config.ts               # Vite bundler configuration
│   └── Dockerfile                   # Multi-stage production Nginx frontend container
├── nginx/
│   ├── nginx.conf                   # Reverse proxy configuration with gzip and SSL termination
│   └── conf.d/
│       └── terravision.conf         # Domain host rule for terravision.ashuttosh.me
├── docker-compose.yml               # Unified multi-service production composition
├── DEPLOY_EC2.md                    # Detailed Amazon EC2 production deployment guide
└── README.md                        # Technical documentation
```

---

## REST API Specification

### Health Check
```http
GET /api/health
```
**Response (200 OK)**:
```json
{
  "status": "healthy",
  "model_loaded": true,
  "device": "cpu",
  "samples_available": true
}
```

---

### Submit Reconstruction Job
```http
POST /api/jobs
Content-Type: multipart/form-data
```
**Parameters**:
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `file` | Binary (File) | Yes | Image file (`.png`, `.jpg`, `.jpeg`, `.tif`, `.tiff`) |
| `opentopo_api_key` | String | No | OpenTopography API key for SRTM DEM retrieval |

**Response (200 OK)**:
```json
{
  "job_id": "8c6b7582-4f11-477c-a496-c146e2970f5e",
  "status": "queued",
  "filename": "aerial_survey.tif",
  "is_geotiff": true
}
```

---

### Poll Job Status
```http
GET /api/jobs/{job_id}
```
**Response (200 OK - Completed)**:
```json
{
  "job_id": "8c6b7582-4f11-477c-a496-c146e2970f5e",
  "status": "completed",
  "is_geotiff": true,
  "results": {
    "height_agl_npy": "/api/results/8c6b7582-4f11-477c-a496-c146e2970f5e/height_agl.npy",
    "rgb_png": "/api/results/8c6b7582-4f11-477c-a496-c146e2970f5e/rgb.png",
    "dsm_geotiff": "/api/results/8c6b7582-4f11-477c-a496-c146e2970f5e/dsm_absolute.tif",
    "height_colored_png": "/api/results/8c6b7582-4f11-477c-a496-c146e2970f5e/height_colored.png"
  },
  "metrics": {
    "min_height": 0.0,
    "max_height": 48.72,
    "mean_height": 14.15,
    "units": "metres"
  },
  "georef": {
    "crs": "EPSG:4326",
    "bounds": [77.581, 12.968, 77.595, 12.982],
    "resolution_m": 0.5
  }
}
```

---

### Download Result Artifacts
```http
GET /api/results/{job_id}/{filename}
```
Supported files:
- `height_agl.npy`: Dense NumPy matrix containing float32 Above Ground Level heights (m).
- `dsm_absolute.tif`: Georeferenced 32-bit floating point GeoTIFF containing sea-level elevations.
- `rgb.png`: Cleaned RGB orthophoto.
- `height_colored.png`: False-color visual height representation.

---

## Local Development Setup

### Prerequisites
- Python 3.10 or higher
- Node.js 18 or higher (with `npm`)
- CUDA-compatible GPU optional (CPU inference supported out-of-the-box)

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv

# On Linux/macOS:
source .venv/bin/activate
# On Windows:
.venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Verify model weights are present at backend/model/best.pt
# Start development server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be accessible at `http://localhost:8000` with interactive Swagger docs at `http://localhost:8000/docs`.

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run Vitest test suite
npm test

# Launch Vite development server
npm run dev
```

The client application will open at `http://localhost:5173`.

---

## Production Deployment

TerraVision provides a production-hardened Docker configuration ready for deployment on any cloud virtual machine (e.g. AWS EC2, GCP Compute Engine, or bare-metal Linux servers).

### 1. Build and Run via Docker Compose

```bash
# Clone the repository
git clone https://github.com/ashutossh99/GeoProject.git
cd GeoProject

# Start services in detached mode
docker compose up -d --build
```

Docker Compose spins up:
- **`terravision-backend`**: FastAPI application with internal state persistence in `/app/data/jobs`.
- **`terravision-frontend`**: High-performance multi-stage Nginx container serving optimized React assets.
- **`terravision-nginx`**: Edge reverse proxy handling public traffic on ports 80/443.

### 2. Domain & SSL Setup (Certbot)

To configure HTTPS with Let's Encrypt for `terravision.ashuttosh.me`:

```bash
# Set execute permissions on certbot init script
chmod +x init-letsencrypt.sh

# Run initialization script with domain and email
./init-letsencrypt.sh
```

---

## Verification & Testing

The frontend includes an automated unit and integration test suite executed via Vitest and Testing Library:

```bash
cd frontend
npm test
```

Test coverage includes:
- API polling resilience, automatic backoff, and 404 recovery
- Analytical wall normal calculations and vertex displacement
- Color transfer function correctness (Viridis, Turbo, Terrain)
- State persistence and error notification boundaries

---

## Credits & Attribution

Developed by **Team Binary Bandits**.

### Foundation Research & Open Datasets
- **Depth Anything V2**: Foundation Models for Monocular Depth Estimation.
- **GAMUS Dataset**: Global Airborne Metric Urban Surveys for monocular metric training.
- **DINOv2**: Learning Robust Visual Features without Supervision.
- **OpenTopography**: High-Resolution Shuttle Radar Topography Mission (SRTM) Global 30m DEM.
