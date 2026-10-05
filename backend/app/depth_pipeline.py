"""
Lane 1 Depth Estimation Pipeline.
Loads fine-tuned GAMUS Depth Anything V2 Small model from backend/model/best.pt.
Handles inference on any uploaded image (PNG, JPG, TIFF, GeoTIFF) and returns:
- height_agl: 2D float32 numpy array of metric AGL heights
- rgb_image: 3-channel PIL Image suitable for 3D texture mapping
"""
import sys
from pathlib import Path
from typing import Tuple, Optional
import numpy as np
from PIL import Image

MODEL_DIR = Path(__file__).resolve().parent.parent / "model"
CHECKPOINT_PATH = MODEL_DIR / "best.pt"

# Ensure model directory is importable
if str(MODEL_DIR) not in sys.path:
    sys.path.insert(0, str(MODEL_DIR))

_MODEL = None
_DEVICE = None

def get_depth_model():
    """
    Singleton loader for the fine-tuned GAMUS Depth Model.
    Caches the model in memory across inference requests.
    """
    global _MODEL, _DEVICE
    if _MODEL is not None:
        return _MODEL, _DEVICE

    try:
        import torch
        from model import GamusHeightModel

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"[depth_pipeline] Initializing GamusHeightModel on device: {device}")
        
        model = GamusHeightModel()
        
        if CHECKPOINT_PATH.exists():
            print(f"[depth_pipeline] Loading checkpoint: {CHECKPOINT_PATH}")
            ckpt = torch.load(CHECKPOINT_PATH, map_location=device, weights_only=False)
            state = ckpt.get("model_state", ckpt.get("state_dict", ckpt))
            
            clean_state = {}
            for k, v in state.items():
                if k.startswith("module."):
                    k = k[7:]
                # Remap older Transformers Dinov2 attention layer names to current transformers names
                k = k.replace(".attention.attention.query.", ".attention.q_proj.")
                k = k.replace(".attention.attention.key.", ".attention.k_proj.")
                k = k.replace(".attention.attention.value.", ".attention.v_proj.")
                k = k.replace(".attention.output.dense.", ".attention.o_proj.")
                clean_state[k] = v

            missing, unexpected = model.load_state_dict(clean_state, strict=False)
            print(f"[depth_pipeline] Checkpoint loaded (missing={len(missing)}, unexpected={len(unexpected)})")
        else:
            print(f"[depth_pipeline] Checkpoint not found at {CHECKPOINT_PATH}, using base weights.")

        model.to(device)
        model.eval()
        _MODEL = model
        _DEVICE = device
        return _MODEL, _DEVICE
    except Exception as e:
        print(f"[depth_pipeline] Warning: Failed to load PyTorch depth model ({e}). Fallback active.")
        return None, "cpu"


def preprocess_image(img: Image.Image, target_size=(518, 518)):
    """Preprocess image with 518x518 bilinear resize and ImageNet normalization."""
    import torch
    resized = img.resize(target_size, Image.Resampling.BILINEAR)
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    tensor = torch.from_numpy(arr).permute(2, 0, 1)

    mean = torch.tensor([0.485, 0.456, 0.406], dtype=torch.float32)[:, None, None]
    std = torch.tensor([0.229, 0.224, 0.225], dtype=torch.float32)[:, None, None]
    norm = (tensor - mean) / std
    return norm.unsqueeze(0)


def predict_agl(
    image_path: Path,
    out_resolution: int = 518
) -> Tuple[np.ndarray, Image.Image, bool]:
    """
    Runs Lane 1 fine-tuned depth model inference on any image.
    
    Returns:
        (height_agl, rgb_image, is_real_inference)
    """
    # 1. Load image and convert to 3-channel RGB
    try:
        raw_img = Image.open(image_path)
        # Handle multiband GeoTIFF or palette images
        if raw_img.mode in ("RGBA", "LA") or (raw_img.mode == "P" and "transparency" in raw_img.info):
            rgb_img = Image.new("RGB", raw_img.size, (255, 255, 255))
            rgb_img.paste(raw_img, mask=raw_img.convert("RGBA").split()[3])
        elif raw_img.mode != "RGB":
            rgb_img = raw_img.convert("RGB")
        else:
            rgb_img = raw_img
    except Exception as e:
        raise ValueError(f"Could not load image at {image_path}: {e}")

    # Standardize output texture size to square for 3D mesh consistency
    rgb_img_518 = rgb_img.resize((out_resolution, out_resolution), Image.Resampling.LANCZOS)

    # 2. Run inference if model is available
    model, device = get_depth_model()
    if model is not None:
        try:
            import torch
            pixel_values = preprocess_image(rgb_img, target_size=(out_resolution, out_resolution)).to(device)
            with torch.inference_mode():
                pred = model(pixel_values, out_size=(out_resolution, out_resolution))
                height_agl = pred.squeeze().detach().cpu().numpy().astype(np.float32)
                # Ensure heights are physically non-negative
                height_agl = np.maximum(0.0, height_agl)
                return height_agl, rgb_img_518, True
        except Exception as e:
            print(f"[depth_pipeline] Inference error ({e}), utilizing synthetic fallback.")

    # 3. Robust fallback: compute relative structural height from gradient/contrast if torch fails
    gray = np.array(rgb_img_518.convert("L"), dtype=np.float32) / 255.0
    gy, gx = np.gradient(gray)
    gradient = np.sqrt(gx**2 + gy**2)
    # Heuristic building/canopy height proxy
    height_agl = (gradient * 18.0 + (1.0 - gray) * 4.0).astype(np.float32)
    height_agl = np.clip(height_agl, 0.0, 35.0)
    return height_agl, rgb_img_518, False


def save_heatmap_png(height_arr: np.ndarray, out_path: Path):
    """Saves turbo/viridis heatmap visualization PNG."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        lo = float(np.nanpercentile(height_arr, 1))
        hi = float(np.nanpercentile(height_arr, 99))
        if hi <= lo:
            hi = lo + 1.0

        fig, ax = plt.subplots(figsize=(6, 6), dpi=100)
        im = ax.imshow(height_arr, cmap="turbo", vmin=lo, vmax=hi)
        plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04, label="Height AGL (m)")
        ax.axis("off")
        plt.tight_layout()
        plt.savefig(out_path, bbox_inches="tight", dpi=120)
        plt.close(fig)
    except Exception as e:
        # Fallback without matplotlib: normalize to grayscale PNG
        norm = ((height_arr - height_arr.min()) / max(1e-5, height_arr.max() - height_arr.min()) * 255.0).astype(np.uint8)
        Image.fromarray(norm).save(out_path)
