"""
GeoTIFF georeferencing parser.
Extracts CRS, bounding box, affine transform, and pixel scale without requiring heavy C libraries,
with optional rasterio integration if present.
"""
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
import math
from PIL import Image
from PIL.TiffTags import TAGS_V2

# Well-known GeoTIFF TIFF tags
TAG_MODEL_PIXEL_SCALE = 33550
TAG_MODEL_TIEPOINT = 33922
TAG_GEO_KEY_DIRECTORY = 34735
TAG_GEO_DOUBLE_PARAMS = 34736
TAG_GEO_ASCII_PARAMS = 34737

def parse_geotiff_metadata(image_path: Path) -> Dict[str, Any]:
    """
    Parses spatial metadata (CRS, bounds, pixel size) from a GeoTIFF.
    Falls back gracefully if the image is standard RGB or unreferenced.
    """
    # Try rasterio first if installed
    try:
        import rasterio
        with rasterio.open(image_path) as src:
            bounds = src.bounds
            crs_str = str(src.crs) if src.crs else "EPSG:4326"
            res_x, res_y = src.res
            
            # If coordinates are in degrees (EPSG:4326), approximate meters per pixel
            mean_lat = (bounds.bottom + bounds.top) / 2.0
            if "4326" in crs_str or abs(bounds.left) <= 180 and abs(bounds.top) <= 90:
                pixel_size_m = float(res_x * 111320.0 * math.cos(math.radians(mean_lat)))
            else:
                pixel_size_m = float((res_x + res_y) / 2.0)

            return {
                "georeferenced": True,
                "crs": crs_str,
                "bounds": [float(bounds.left), float(bounds.bottom), float(bounds.right), float(bounds.top)],
                "pixel_size_m": max(0.1, pixel_size_m),
                "width": src.width,
                "height": src.height,
                "transform": [float(v) for v in src.transform]
            }
    except Exception:
        pass

    # Pure Python / Pillow TIFF tag fallback
    try:
        with Image.open(image_path) as img:
            w, h = img.size
            tags = getattr(img, "tag_v2", {}) or getattr(img, "tag", {})

            tiepoints = tags.get(TAG_MODEL_TIEPOINT)
            pixel_scale = tags.get(TAG_MODEL_PIXEL_SCALE)
            geo_keys = tags.get(TAG_GEO_KEY_DIRECTORY)
            ascii_params = tags.get(TAG_GEO_ASCII_PARAMS)

            if tiepoints and pixel_scale:
                # tiepoints: (i, j, k, x, y, z)
                tp = list(tiepoints)
                ps = list(pixel_scale)
                origin_x = tp[3]
                origin_y = tp[4]
                scale_x = ps[0]
                scale_y = ps[1]

                west = origin_x
                north = origin_y
                east = west + w * scale_x
                south = north - h * scale_y

                crs_name = "EPSG:4326 (WGS84)"
                if ascii_params:
                    crs_name = str(ascii_params).strip("|\x00 ")
                elif geo_keys:
                    # Look for projected or geographic CRS code in geo_keys directory
                    # KeyDirectoryVersion, KeyRevision, MinorRevision, NumberOfKeys, then 4-tuples: (KeyID, TIFFTagLocation, Count, Value_Offset)
                    gk = list(geo_keys)
                    if len(gk) >= 4:
                        num_keys = gk[3]
                        for idx in range(num_keys):
                            offset = 4 + idx * 4
                            if offset + 3 < len(gk):
                                key_id = gk[offset]
                                val = gk[offset + 3]
                                if key_id in [3072, 2048]:  # ProjectedCSTypeGeoKey / GeographicTypeGeoKey
                                    crs_name = f"EPSG:{val}"
                                    break

                mean_lat = (south + north) / 2.0
                if abs(west) <= 180 and abs(north) <= 90:
                    pixel_size_m = float(scale_x * 111320.0 * math.cos(math.radians(mean_lat)))
                else:
                    pixel_size_m = float((scale_x + scale_y) / 2.0)

                return {
                    "georeferenced": True,
                    "crs": crs_name,
                    "bounds": [float(west), float(south), float(east), float(north)],
                    "pixel_size_m": max(0.1, pixel_size_m),
                    "width": w,
                    "height": h,
                    "transform": [scale_x, 0.0, origin_x, 0.0, -scale_y, origin_y]
                }
    except Exception:
        pass

    # Default fallback for images without geospatial headers
    return {
        "georeferenced": False,
        "crs": "Local Grid (unprojected)",
        "bounds": [77.2090, 28.6139, 77.2155, 28.6195],  # Default demo location (New Delhi)
        "pixel_size_m": 1.25,
        "width": 518,
        "height": 518,
        "transform": None
    }
