"""
Part 1 deployment inference for the fine-tuned GAMUS height model.

Usage:
    python inference.py --checkpoint best.pt --input image.jpg --output outputs/result

The checkpoint is the trained Depth Anything V2 Small model from:
    checkpoints/run_1500tiles_v2/best.pt

Input:
    RGB PNG/JPG/TIFF/GeoTIFF

Output:
    height_agl.npy          predicted AGL heights in meters
    height_agl_heatmap.png  visualization only
    metadata.json           run metadata

Important:
    This model predicts Above-Ground-Level (AGL) height, not absolute
    geographic elevation. Absolute DSM generation is a Part 2 step.
"""

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import AutoImageProcessor

# Import the exact model wrapper used by the project.
from model import GamusHeightModel


DEFAULT_CHECKPOINT = "checkpoints/run_1500tiles_v2/best.pt"
DEFAULT_MODEL_CHECKPOINT = "depth-anything/Depth-Anything-V2-Small-hf"


def load_rgb(path: Path) -> Image.Image:
    """Load an input image as RGB."""
    try:
        return Image.open(path).convert("RGB")
    except Exception as exc:
        raise RuntimeError(f"Could not read RGB image: {path}") from exc


def make_fallback_preprocess(image: Image.Image) -> torch.Tensor:
    """
    Fallback preprocessing matching the project's documented training path:
    resize to 518x518, /255, ImageNet normalization.

    The preferred path is the Hugging Face image processor below; if the
    installed Transformers version/model processor is unavailable, this
    fallback keeps the deployment usable.
    """
    image = image.resize((518, 518), Image.Resampling.BILINEAR)
    arr = np.asarray(image, dtype=np.float32) / 255.0
    tensor = torch.from_numpy(arr).permute(2, 0, 1)

    mean = torch.tensor([0.485, 0.456, 0.406], dtype=torch.float32)[:, None, None]
    std = torch.tensor([0.229, 0.224, 0.225], dtype=torch.float32)[:, None, None]
    return (tensor - mean) / std


def preprocess(image: Image.Image) -> torch.Tensor:
    """
    Prepare the RGB image for the model.

    The project training/export pipeline uses 518x518 input with ImageNet
    normalization. We deliberately keep this preprocessing deterministic.
    """
    return make_fallback_preprocess(image).unsqueeze(0)


def load_checkpoint(model, checkpoint_path: Path, device: torch.device):
    ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)

    if isinstance(ckpt, dict) and "model_state" in ckpt:
        state = ckpt["model_state"]
    elif isinstance(ckpt, dict) and "state_dict" in ckpt:
        state = ckpt["state_dict"]
    else:
        # Also support a raw state_dict checkpoint.
        state = ckpt

    # Handle checkpoints saved from DataParallel/DDP.
    state = {
        (k[7:] if k.startswith("module.") else k): v
        for k, v in state.items()
    }

    missing, unexpected = model.load_state_dict(state, strict=False)
    if missing or unexpected:
        raise RuntimeError(
            "Checkpoint/model mismatch.\n"
            f"Missing keys: {missing[:10]}\n"
            f"Unexpected keys: {unexpected[:10]}"
        )

    return ckpt


def save_heatmap(height: np.ndarray, path: Path):
    import matplotlib.pyplot as plt

    finite = np.isfinite(height)
    if not finite.any():
        raise RuntimeError("Prediction contains no finite values.")

    lo = float(np.nanpercentile(height, 1))
    hi = float(np.nanpercentile(height, 99))
    if hi <= lo:
        hi = lo + 1.0

    plt.figure(figsize=(8, 8))
    plt.imshow(height, cmap="turbo", vmin=lo, vmax=hi)
    plt.colorbar(label="Predicted AGL height (m)")
    plt.axis("off")
    plt.tight_layout()
    plt.savefig(path, dpi=150, bbox_inches="tight")
    plt.close()


def main():
    parser = argparse.ArgumentParser(description="Run Part 1 RGB -> AGL inference.")
    parser.add_argument("--checkpoint", default=DEFAULT_CHECKPOINT)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", default="outputs/inference_result")
    args = parser.parse_args()

    checkpoint_path = Path(args.checkpoint)
    input_path = Path(args.input)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    if not checkpoint_path.exists():
        raise FileNotFoundError(f"Checkpoint not found: {checkpoint_path}")
    if not input_path.exists():
        raise FileNotFoundError(f"Input image not found: {input_path}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[info] device={device}")
    print(f"[info] checkpoint={checkpoint_path}")
    print(f"[info] input={input_path}")

    model = GamusHeightModel(checkpoint=DEFAULT_MODEL_CHECKPOINT)
    load_checkpoint(model, checkpoint_path, device)
    model.to(device)
    model.eval()

    image = load_rgb(input_path)
    original_size = [image.height, image.width]

    pixel_values = preprocess(image).to(device)

    with torch.inference_mode():
        prediction = model(pixel_values, out_size=(518, 518))

    height = prediction.squeeze().detach().cpu().numpy().astype(np.float32)

    np.save(output_dir / "height_agl.npy", height)
    save_heatmap(height, output_dir / "height_agl_heatmap.png")

    metadata = {
        "task": "RGB_to_metric_AGL_height",
        "vertical_reference": "above_ground_level",
        "units": "meters",
        "input_file": str(input_path),
        "input_size_hw": original_size,
        "output_size_hw": list(height.shape),
        "checkpoint": str(checkpoint_path),
        "backbone": DEFAULT_MODEL_CHECKPOINT,
        "device": str(device),
        "prediction_min_m": float(np.nanmin(height)),
        "prediction_max_m": float(np.nanmax(height)),
        "prediction_mean_m": float(np.nanmean(height)),
        "prediction_median_m": float(np.nanmedian(height)),
        "absolute_georeferencing": False,
        "note": "height_agl.npy is the authoritative numerical output; the PNG is visualization only.",
    }

    with open(output_dir / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"[ok] wrote outputs to {output_dir}")
    print(f"[ok] prediction shape={height.shape}")
    print(
        f"[ok] AGL range={height.min():.3f}..{height.max():.3f} m, "
        f"mean={height.mean():.3f} m"
    )


if __name__ == "__main__":
    main()
