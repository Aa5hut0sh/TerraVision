"""
Landscape Classification Module for Earth Observation Imagery.
Classifies remote sensing pixels into 4 core classes:
0: WATER
1: BARE_GROUND
2: VEGETATION
3: URBAN / BUILT-UP
Uses spectral indices (Excess Green, NDWI/Water Index) and structural features (AGL height & gradient).
"""
import numpy as np
from typing import Dict, Any, Tuple

CLASS_WATER = 0
CLASS_BARE = 1
CLASS_VEG = 2
CLASS_URBAN = 3

CLASS_LABELS = {
    CLASS_WATER: "Water",
    CLASS_BARE: "Bare Ground",
    CLASS_VEG: "Vegetation",
    CLASS_URBAN: "Urban / Built-up"
}

def classify_landscape(
    rgb_arr: np.ndarray,
    height_agl: np.ndarray
) -> Tuple[np.ndarray, Dict[str, float]]:
    """
    Classifies pixels into Urban, Vegetation, Bare Ground, and Water.
    
    Args:
        rgb_arr: uint8 or float array [H, W, 3] (RGB)
        height_agl: float32 array [H, W] of predicted AGL heights in meters
        
    Returns:
        (class_map, stats_dict)
    """
    H, W = height_agl.shape
    if rgb_arr.shape[:2] != (H, W):
        # Resize if dimensions differ
        from PIL import Image
        rgb_img = Image.fromarray(rgb_arr.astype(np.uint8)).resize((W, H), Image.Resampling.BILINEAR)
        rgb_norm = np.asarray(rgb_img, dtype=np.float32) / 255.0
    else:
        rgb_norm = rgb_arr.astype(np.float32)
        if rgb_norm.max() > 1.0:
            rgb_norm /= 255.0

    R = rgb_norm[..., 0]
    G = rgb_norm[..., 1]
    B = rgb_norm[..., 2]

    # 1. Spectral Indices
    # Excess Green Index: 2G - R - B (sensitive to canopy and green vegetation)
    exg = 2.0 * G - R - B

    # Visible Atmospheric Resistant Index (VARI): (G - R) / (G + R - B + eps)
    vari = (G - R) / (G + R - B + 1e-5)

    # Visible Water Index: B > R and G > R with moderate to low brightness
    brightness = (R + G + B) / 3.0
    water_score = (B - R) + 0.5 * (G - R)

    # 2. Structural gradient / edges from height
    # Compute spatial gradient magnitude of AGL height
    gy, gx = np.gradient(height_agl)
    grad_mag = np.sqrt(gx**2 + gy**2)

    # 3. Decision Tree Classification
    class_map = np.full((H, W), CLASS_BARE, dtype=np.uint8)

    # Water condition: dark to medium blue-green, very low AGL, low roughness
    water_mask = (water_score > 0.08) & (brightness < 0.45) & (height_agl < 1.0) & (grad_mag < 1.2)
    class_map[water_mask] = CLASS_WATER

    # Vegetation condition: high greenness, moderate VARI, and not water
    veg_mask = ((exg > 0.05) | (vari > 0.15)) & ~water_mask
    class_map[veg_mask] = CLASS_VEG

    # Urban condition:
    # A) Significant building height (AGL >= 2.5m) with high wall gradients
    # B) Or built-up roof spectral signature (low vegetation, high contrast or grey/red roof tones) with height
    urban_height_mask = (height_agl >= 2.2) & ~water_mask
    urban_texture_mask = (grad_mag > 1.8) & (height_agl >= 1.5) & ~water_mask
    # Roof color signature (red terracotta tiles or light concrete/asphalt)
    roof_color_mask = (R > G * 1.15) & (height_agl >= 1.8)

    urban_mask = urban_height_mask | urban_texture_mask | roof_color_mask
    class_map[urban_mask] = CLASS_URBAN

    # Remaining non-water, non-veg, non-urban pixels stay CLASS_BARE

    # Compute distribution statistics
    total_pixels = float(H * W)
    stats = {
        "urban_pct": round(float(np.sum(class_map == CLASS_URBAN) / total_pixels * 100.0), 1),
        "vegetation_pct": round(float(np.sum(class_map == CLASS_VEG) / total_pixels * 100.0), 1),
        "bare_ground_pct": round(float(np.sum(class_map == CLASS_BARE) / total_pixels * 100.0), 1),
        "water_pct": round(float(np.sum(class_map == CLASS_WATER) / total_pixels * 100.0), 1),
    }

    return class_map, stats
