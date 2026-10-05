# Part 1 Model Deployment

## What this is

This package runs the completed Part 1 model:

**Depth Anything V2 Small → fine-tuned on GAMUS → metric AGL height prediction**

The trained checkpoint is:

`checkpoints/run_1500tiles_v2/best.pt`

Best validation result from the project:

- MAE ≈ 2.615 m
- RMSE ≈ 3.939 m
- best checkpoint: epoch 17

## Files to send to the team member

At minimum:

```text
best.pt
inference.py
model.py
requirements.txt
```

`gamus_dataset.py` is not required for inference if `inference.py` is used, but it can be included for reference/documentation.

## Setup

Create a clean Python environment and install the project's dependencies.

The machine needs a compatible PyTorch installation. CUDA is optional; inference automatically uses CUDA when available and CPU otherwise.

The first model construction may need internet access to obtain the pretrained Depth Anything V2 Small configuration/weights referenced by the model wrapper. If the pretrained backbone is already cached locally, internet is not required for that step.

## Run

From the directory containing `inference.py`:

```powershell
python inference.py --checkpoint best.pt --input image.jpg --output outputs/result
```

For a GeoTIFF:

```powershell
python inference.py --checkpoint best.pt --input image.tif --output outputs/result
```

## Output

```text
outputs/result/
├── height_agl.npy
├── height_agl_heatmap.png
└── metadata.json
```

### height_agl.npy

This is the authoritative numerical prediction.

Each value is predicted **above-ground-level height in meters**.

Load it with:

```python
import numpy as np
height = np.load("height_agl.npy")
```

### height_agl_heatmap.png

Visualization only. Do not use this PNG as the numerical source for height values.

### metadata.json

Contains model, device, output dimensions and prediction statistics.

## Important limitation

This Part 1 model predicts **AGL height**.

It does NOT by itself produce absolute geographic elevation.

For the PS georeferenced branch, Part 2 will be:

```text
Georeferenced RGB GeoTIFF
        ↓
read CRS + affine transform
        ↓
Part 1 model → predicted AGL
        ↓
retrieve terrain DEM/SRTM
        ↓
reproject DEM to RGB grid
        ↓
absolute elevation = terrain elevation + AGL
        ↓
write georeferenced DSM GeoTIFF
```

Do not describe `height_agl.npy` as an absolute DSM.
