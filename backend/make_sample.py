"""
Generates synthetic DSM data if backend/reference/ has no height_agl.npy.
Also provides helpers for generating absolute GeoTIFF mock packages.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
import json

REF_DIR = Path(__file__).resolve().parent / "reference"

def generate_synthetic_agl(size=518):
    """Generate a synthetic 518x518 neighborhood: terrain, roads, houses, trees."""
    H = size
    W = size
    height = np.zeros((H, W), dtype=np.float32)
    img = Image.new("RGB", (W, H), color=(40, 110, 45)) # lush green ground
    draw = ImageDraw.Draw(img)

    # Roads
    # Horizontal road
    draw.rectangle([0, 240, W, 278], fill=(60, 60, 65))
    # Vertical road
    draw.rectangle([240, 0, 278, H], fill=(60, 60, 65))

    # Road height is 0
    # Add houses in quadrants
    rng = np.random.default_rng(42)

    # Add houses (box with slight gable roof)
    for qx, qy in [(40, 40), (310, 40), (40, 310), (310, 310)]:
        for ix in range(2):
            for iy in range(2):
                bx = qx + ix * 80 + int(rng.integers(-5, 5))
                by = qy + iy * 80 + int(rng.integers(-5, 5))
                bw = int(rng.integers(45, 60))
                bh = int(rng.integers(40, 55))
                roof_h = float(rng.uniform(7.0, 14.0))

                # Draw building on RGB
                roof_col = (int(rng.integers(160, 210)), int(rng.integers(60, 90)), int(rng.integers(40, 60)))
                draw.rectangle([bx, by, bx + bw, by + bh], fill=roof_col, outline=(30, 30, 30))

                # Heightfield: box with gabled roof along x
                for r in range(by, min(H, by + bh)):
                    for c in range(bx, min(W, bx + bw)):
                        rel_x = abs((c - bx) - bw / 2) / (bw / 2)
                        h_val = roof_h * (1.0 - 0.25 * rel_x)
                        height[r, c] = max(height[r, c], h_val)

    # Add trees (bumps)
    for _ in range(60):
        tx = int(rng.integers(15, W - 15))
        ty = int(rng.integers(15, H - 15))
        if 230 <= tx <= 290 or 230 <= ty <= 290:
            continue
        rad = int(rng.integers(8, 16))
        th = float(rng.uniform(6.0, 15.0))
        draw.ellipse([tx - rad, ty - rad, tx + rad, ty + rad], fill=(20, int(rng.integers(80, 130)), 30))
        for r in range(max(0, ty - rad), min(H, ty + rad + 1)):
            for c in range(max(0, tx - rad), min(W, tx + rad + 1)):
                dist = np.hypot(r - ty, c - tx)
                if dist <= rad:
                    bump = th * (1.0 - (dist / rad) ** 2)
                    height[r, c] = max(height[r, c], bump)

    return height, img

def ensure_reference_data():
    REF_DIR.mkdir(parents=True, exist_ok=True)
    agl_path = REF_DIR / "height_agl.npy"
    rgb_path = REF_DIR / "rgb.png"
    meta_path = REF_DIR / "metadata.json"

    if not agl_path.exists():
        print(f"[make_sample] {agl_path} not found. Generating synthetic reference package...")
        height, img = generate_synthetic_agl(518)
        np.save(agl_path, height)
        img.save(rgb_path)

        meta = {
            "source_image": "synthetic_sample.png",
            "model_checkpoint": "synthetic_demo",
            "output_type": "above_ground_height",
            "units": "meters",
            "coordinate_reference_system": None,
            "georeferenced": False,
            "height_min_m": float(height.min()),
            "height_max_m": float(height.max()),
            "height_mean_m": float(height.mean()),
            "height_median_m": float(np.median(height)),
            "width": 518,
            "height": 518,
            "channels": 1,
            "data_file": "height_agl.npy",
            "rgb_file": "rgb.png",
            "future_part2_fields": {
                "terrain_source": None,
                "terrain_units": "meters",
                "absolute_elevation_available": False,
                "geotransform_available": False,
                "vertical_reference": "AGL"
            }
        }
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)
        print("[make_sample] Generated reference package in", REF_DIR)
    else:
        print("[make_sample] Using existing reference data in", REF_DIR)

if __name__ == "__main__":
    ensure_reference_data()
