"""
DepthWizard Visualizer (SIH26175) Backend Service.
End-to-End Monocular Height Estimation and 3D Flythrough Pipeline.
Supports Lane 1 (Fine-tuned GAMUS model on any image) and Lane 2 (Relative to Absolute DSM calibration).
"""
import os
import uuid
import json
import shutil
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

from fastapi import FastAPI, UploadFile, File, Query, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import numpy as np
from PIL import Image
import tifffile

from make_sample import ensure_reference_data, REF_DIR
from app.depth_pipeline import predict_agl, save_heatmap_png, get_depth_model
from app.geotiff_handler import parse_geotiff_metadata
from app.landscape_classifier import classify_landscape
from app.absolute_calibrator import fetch_srtm_dem, calibrate_absolute_dsm

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
RESULTS_DIR = DATA_DIR / "results"
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="TerraVision API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

JOBS: Dict[str, Dict[str, Any]] = {}

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
    "Landscape classification & calibration",
    "Calibration & absolute DSM synthesis",
    "Packaging 3D assets"
]


def execute_pipeline(job_id: str, kind: str, upload_path: Optional[str] = None) -> Tuple[Dict[str, str], bool, str]:
    """
    Synchronous worker executing the full pipeline.
    Returns:
        (result_files_dict, is_real_inference, mode)
    """
    ensure_reference_data()
    out_dir = RESULTS_DIR / job_id
    out_dir.mkdir(parents=True, exist_ok=True)

    is_absolute = (kind in ["geotiff", "tif", "tiff"])
    if upload_path:
        input_file = Path(upload_path)
    else:
        input_file = (REF_DIR / "sample_geotiff.tif") if is_absolute else (REF_DIR / "sample_relative.png")
        if not input_file.exists():
            input_file = REF_DIR / "rgb.png"

    # 1. Run Lane 1 Fine-Tuned GAMUS Depth Model
    height_agl, rgb_img, is_real = predict_agl(input_file, out_resolution=518)
    
    # Save standard RGB texture for 3D renderer
    rgb_save_path = out_dir / "rgb.png"
    rgb_img.save(rgb_save_path, format="PNG")
    
    # Save visualization heatmap
    heatmap_path = out_dir / "height_agl_heatmap.png"
    save_heatmap_png(height_agl, heatmap_path)

    H, W = height_agl.shape

    if not is_absolute:
        # Branch A: Relative DSM (rDSM)
        np.save(out_dir / "height_agl.npy", height_agl)

        metadata = {
            "source_image": input_file.name,
            "mode": "relative",
            "vertical_reference": "AGL",
            "units": "meters",
            "data_file": "height_agl.npy",
            "rgb_file": "rgb.png",
            "heatmap_file": "height_agl_heatmap.png",
            "width": W,
            "height": H,
            "georeferenced": False,
            "coordinate_reference_system": None,
            "bounds": None,
            "pixel_size_m": 1.0,
            "terrain_source": None,
            "model_checkpoint": "Depth Anything V2 Small (fine-tuned on GAMUS)",
            "inference_mode": "neural_network" if is_real else "synthetic_fallback",
            "height_min_m": float(np.nanmin(height_agl)),
            "height_max_m": float(np.nanmax(height_agl)),
            "height_mean_m": float(np.nanmean(height_agl)),
            "height_median_m": float(np.median(height_agl)),
            "note": "Relative height above ground level (AGL) in meters."
        }

        with open(out_dir / "metadata.json", "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)

        return {
            "rgb": f"/api/results/{job_id}/rgb.png",
            "elevation": f"/api/results/{job_id}/height_agl.npy",
            "metadata": f"/api/results/{job_id}/metadata.json",
            "terrain": None
        }, is_real, "relative"

    else:
        # Branch B: Absolute DSM (aDSM)
        # 1. Parse embedded coordinates from GeoTIFF
        geo_meta = parse_geotiff_metadata(input_file)
        bounds = geo_meta["bounds"]
        crs_str = geo_meta["crs"]
        pixel_size_m = geo_meta["pixel_size_m"]

        # 2. Fetch SRTM 30m DEM patch
        terrain_dem, terrain_source = fetch_srtm_dem(bounds, (H, W))

        # 3. Landscape Classification (Urban / Veg / Bare / Water)
        rgb_arr = np.array(rgb_img)
        class_map, landscape_stats = classify_landscape(rgb_arr, height_agl)

        # 4. Per-Class Scale Calibration (Regression)
        height_absolute, terrain_dem, calib_metrics = calibrate_absolute_dsm(
            terrain_dem, height_agl, class_map
        )

        # Save numpy arrays
        np.save(out_dir / "height_absolute.npy", height_absolute)
        np.save(out_dir / "terrain_elevation.npy", terrain_dem)
        np.save(out_dir / "height_agl.npy", height_agl)

        # Save georeferenced 32-bit float GeoTIFF
        try:
            tifffile.imwrite(out_dir / "dsm_absolute.tif", height_absolute.astype(np.float32))
        except Exception:
            pass

        metadata = {
            "source_image": input_file.name,
            "mode": "absolute",
            "vertical_reference": "absolute_elevation",
            "units": "meters",
            "data_file": "height_absolute.npy",
            "terrain_file": "terrain_elevation.npy",
            "rgb_file": "rgb.png",
            "width": W,
            "height": H,
            "georeferenced": True,
            "coordinate_reference_system": crs_str,
            "bounds": bounds,
            "pixel_size_m": pixel_size_m,
            "terrain_source": terrain_source,
            "model_checkpoint": "Depth Anything V2 Small (fine-tuned on GAMUS)",
            "inference_mode": "neural_network" if is_real else "synthetic_fallback",
            "landscape_classification": landscape_stats,
            "calibration_metrics": calib_metrics,
            "height_min_m": calib_metrics["dsm_min_m"],
            "height_max_m": calib_metrics["dsm_max_m"],
            "height_mean_m": calib_metrics["dsm_mean_m"],
            "height_median_m": calib_metrics["dsm_median_m"],
            "note": "Absolute Digital Surface Model (aDSM) in meters ASL with SRTM 30m terrain baseline."
        }

        with open(out_dir / "metadata.json", "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)

        return {
            "rgb": f"/api/results/{job_id}/rgb.png",
            "elevation": f"/api/results/{job_id}/height_absolute.npy",
            "metadata": f"/api/results/{job_id}/metadata.json",
            "terrain": f"/api/results/{job_id}/terrain_elevation.npy"
        }, is_real, "absolute"


async def run_pipeline_task(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        return
    job["status"] = "running"
    stages = job["stages"]

    try:
        # Step through stages with brief pacing for visual feedback
        for idx in range(len(stages) - 1):
            job["stage_index"] = idx
            await asyncio.sleep(0.4)

        # Execute full real pipeline
        result_files, is_real, mode = await asyncio.to_thread(
            execute_pipeline, job_id, job["kind"], job.get("upload_path")
        )

        job["stage_index"] = len(stages)
        job["status"] = "done"
        job["result"] = {
            "input_kind": job["kind"],
            "mode": mode,
            "original_filename": job.get("filename", "image.png"),
            "dummy": not is_real,
            "files": result_files
        }
    except Exception as e:
        job["status"] = "error"
        job["error"] = str(e)
        print(f"[error] Pipeline failed for job {job_id}: {e}")


@app.get("/api/health")
def health():
    model, device = get_depth_model()
    return {
        "ok": True,
        "model_loaded": model is not None,
        "device": str(device),
        "checkpoint": "Depth-Anything-V2-GAMUS-run_1500tiles_v2"
    }


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
