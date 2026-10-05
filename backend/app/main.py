"""
DepthWizard Visualizer (SIH26175) Backend Service
Speaks the exact HTTP contract for Relative (PNG/JPG) and Absolute (GeoTIFF) DSM visualization.
"""
import os
import uuid
import json
import shutil
import asyncio
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Query, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import numpy as np

from make_sample import ensure_reference_data, REF_DIR

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
RESULTS_DIR = DATA_DIR / "results"
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="DepthWizard API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

JOBS = {}

RELATIVE_STAGES = [
    "Ingesting imagery",
    "Depth Anything V2 inference",
    "Height AGL conversion (metres)",
    "Surface normal & relief calculation",
    "Packaging 3D assets"
]

ABSOLUTE_STAGES = [
    "Ingesting GeoTIFF & CRS",
    "Depth Anything V2 inference",
    "Fetching SRTM 30m terrain",
    "Calibration & absolute DSM synthesis",
    "Surface normal & relief calculation",
    "Packaging 3D assets"
]

def build_package(job_id: str, kind: str, upload_path: Optional[str] = None) -> dict:
    """
    Produces the package files in RESULTS_DIR / job_id.
    When real ML pipeline arrives, only this function is swapped!
    """
    ensure_reference_data()
    out_dir = RESULTS_DIR / job_id
    out_dir.mkdir(parents=True, exist_ok=True)

    ref_agl_path = REF_DIR / "height_agl.npy"
    ref_rgb_path = REF_DIR / "rgb.png"
    ref_meta_path = REF_DIR / "metadata.json"

    # Load base reference
    height_agl = np.load(ref_agl_path).astype(np.float32)
    with open(ref_meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    is_absolute = (kind in ["geotiff", "tif", "tiff"])

    if not is_absolute:
        # Relative DSM mode (AGL)
        shutil.copy(ref_rgb_path, out_dir / "rgb.png")
        np.save(out_dir / "height_agl.npy", height_agl)
        
        meta_copy = dict(meta)
        meta_copy["mode"] = "relative"
        meta_copy["vertical_reference"] = "AGL"
        meta_copy["data_file"] = "height_agl.npy"
        meta_copy["rgb_file"] = "rgb.png"
        meta_copy["georeferenced"] = False
        meta_copy["coordinate_reference_system"] = None
        if upload_path:
            meta_copy["source_image"] = Path(upload_path).name

        with open(out_dir / "metadata.json", "w", encoding="utf-8") as f:
            json.dump(meta_copy, f, indent=2)

        return {
            "rgb": f"/api/results/{job_id}/rgb.png",
            "elevation": f"/api/results/{job_id}/height_agl.npy",
            "metadata": f"/api/results/{job_id}/metadata.json",
            "terrain": None
        }
    else:
        # Absolute DSM mode (Calibrated with SRTM terrain elevation)
        shutil.copy(ref_rgb_path, out_dir / "rgb.png")
        H, W = height_agl.shape
        # Create realistic gentle slope terrain base around 1200m
        y_grid, x_grid = np.meshgrid(np.linspace(0, 1, W), np.linspace(0, 1, H))
        terrain = (1200.0 + 18.0 * x_grid + 12.0 * y_grid + 4.0 * np.sin(x_grid * 6.28) * np.cos(y_grid * 6.28)).astype(np.float32)
        height_absolute = (terrain + height_agl).astype(np.float32)

        np.save(out_dir / "terrain_elevation.npy", terrain)
        np.save(out_dir / "height_absolute.npy", height_absolute)

        meta_copy = dict(meta)
        meta_copy["mode"] = "absolute"
        meta_copy["vertical_reference"] = "absolute_elevation"
        meta_copy["data_file"] = "height_absolute.npy"
        meta_copy["terrain_file"] = "terrain_elevation.npy"
        meta_copy["rgb_file"] = "rgb.png"
        meta_copy["georeferenced"] = True
        meta_copy["coordinate_reference_system"] = "EPSG:32644 (DUMMY)"
        meta_copy["pixel_size_m"] = 1.25
        meta_copy["bounds"] = [77.2090, 28.6139, 77.2155, 28.6195]
        meta_copy["terrain_source"] = "SRTM 30m (Synthetic Demo Calibration)"
        meta_copy["height_min_m"] = float(height_absolute.min())
        meta_copy["height_max_m"] = float(height_absolute.max())
        meta_copy["height_mean_m"] = float(height_absolute.mean())
        meta_copy["height_median_m"] = float(np.median(height_absolute))

        with open(out_dir / "metadata.json", "w", encoding="utf-8") as f:
            json.dump(meta_copy, f, indent=2)

        return {
            "rgb": f"/api/results/{job_id}/rgb.png",
            "elevation": f"/api/results/{job_id}/height_absolute.npy",
            "metadata": f"/api/results/{job_id}/metadata.json",
            "terrain": f"/api/results/{job_id}/terrain_elevation.npy"
        }

async def run_pipeline_task(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        return
    job["status"] = "running"
    delay = float(os.getenv("DUMMY_STAGE_DELAY", "0.7"))
    stages = job["stages"]

    try:
        for idx in range(len(stages)):
            job["stage_index"] = idx
            await asyncio.sleep(delay)

        # Build output package
        result_files = await asyncio.to_thread(
            build_package, job_id, job["kind"], job.get("upload_path")
        )

        job["status"] = "done"
        job["stage_index"] = len(stages)
        is_abs = (job["kind"] in ["geotiff", "tif", "tiff"])
        job["result"] = {
            "input_kind": job["kind"],
            "mode": "absolute" if is_abs else "relative",
            "original_filename": job.get("filename", "sample.png"),
            "dummy": True,
            "files": result_files
        }
    except Exception as e:
        job["status"] = "error"
        job["error"] = str(e)

@app.get("/api/health")
def health():
    return {"ok": True, "dummy": True}

@app.post("/api/jobs")
async def create_job(
    background_tasks: BackgroundTasks,
    sample: Optional[str] = Query(None),
    file: Optional[UploadFile] = File(None)
):
    job_id = str(uuid.uuid4())
    upload_path = None
    filename = None
    kind = "png"

    if sample:
        sample_lower = sample.lower()
        if sample_lower in ["geotiff", "tif", "tiff"]:
            kind = "geotiff"
            filename = f"sample_{sample_lower}.tif"
        else:
            kind = "png"
            filename = f"sample_{sample_lower}.png"
    elif file:
        filename = file.filename
        ext = Path(filename).suffix.lower()
        if ext in [".tif", ".tiff", ".geotiff"]:
            kind = "geotiff"
        elif ext in [".png", ".jpg", ".jpeg"]:
            kind = "png"
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file extension: {ext}")
        
        job_upload_dir = UPLOADS_DIR / job_id
        job_upload_dir.mkdir(parents=True, exist_ok=True)
        dest_path = job_upload_dir / filename
        with open(dest_path, "wb") as f_out:
            shutil.copyfileobj(file.file, f_out)
        upload_path = str(dest_path)
    else:
        raise HTTPException(status_code=400, detail="Must provide either ?sample= or a file upload")

    stages = ABSOLUTE_STAGES if kind == "geotiff" else RELATIVE_STAGES

    JOBS[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "kind": kind,
        "filename": filename,
        "upload_path": upload_path,
        "stages": stages,
        "stage_index": 0,
        "result": None,
        "error": None
    }

    background_tasks.add_task(run_pipeline_task, job_id)
    return {"job_id": job_id}

@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "stages": job["stages"],
        "stage_index": job["stage_index"],
        "result": job["result"],
        "error": job["error"]
    }

@app.get("/api/results/{job_id}/{filename}")
def get_result_file(job_id: str, filename: str):
    res_path = (RESULTS_DIR / job_id / filename).resolve()
    # Path traversal protection
    if not str(res_path).startswith(str(RESULTS_DIR.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")
    if not res_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(res_path)

# Static serving of frontend production build if available
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="static")
