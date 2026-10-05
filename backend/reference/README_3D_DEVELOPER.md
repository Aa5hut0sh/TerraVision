# 3D Playground - Output Package (README for the 3D developer)

This folder is the output of Part 1 of the pipeline: an RGB aerial tile run
through a fine-tuned Depth Anything V2 model, producing a per-pixel
above-ground-level (AGL) height prediction, in meters.

## 1. What each file is

- `rgb.png` - the RGB tile, resized to the exact same H x W as the height
  array. Use this as the texture.
- `height_agl.npy` - a single-channel float32 NumPy array, shape (H, W),
  values in **meters AGL**. **This is the primary, authoritative height data.**
- `height_agl_heatmap.png` - a colored visualization (viridis, with a
  colorbar) of the same data, for humans to sanity-check. NOT for numeric use.
- `height_displacement.png` - a grayscale 0-255 PNG version of the height
  data, for engines/tools that specifically want a grayscale displacement
  texture. See "Grayscale <-> meters mapping" below before using this for
  anything that needs real units.
- `preview.png` - three panels side by side: RGB | AGL heatmap | a shaded
  pseudo-3D relief view, just to visually confirm what the data represents
  before you build the real thing.
- `metadata.json` - machine-readable description of this export (units,
  stats, and explicit `null`/`false` placeholders for the georeferencing
  fields Part 2 will eventually fill in).

## 2. Which file is the actual height/displacement source

**`height_agl.npy`.** Always load this for anything that needs real height
values. Do not reconstruct height from `height_agl_heatmap.png` or
`height_displacement.png` - both are lossy visualizations of the same data.

## 3. Which file is the RGB texture

**`rgb.png`.** It's already resized to match `height_agl.npy`'s H x W
exactly, so pixel (x, y) in one corresponds to pixel (x, y) in the other -
no additional alignment needed.

## 4. Why not use the heatmap PNG as the real data

`height_agl_heatmap.png` passes the height values through a color colormap
(viridis) for human viewing. That's a one-way, lossy transform - you cannot
recover the original float meters from the colors reliably. Always go back
to `height_agl.npy` for anything numeric.

## 5. Current heights are AGL, not absolute elevation

Every value in `height_agl.npy` means "how far above the LOCAL ground is
whatever's at this pixel" - a value of 0 means ground level *at that pixel*,
not sea level or any other global reference. Two pixels with the same value
are NOT necessarily at the same real-world elevation if the underlying
terrain slopes.

## 6. Converting the height array to Z/displacement values

```python
import numpy as np
height = np.load("height_agl.npy")  # (H, W) float32, meters

# Simplest mapping: use meters directly as world-space Z, scaled to taste.
vertical_scale = 1.0  # 1.0 = 1 meter of AGL height = 1 world unit of Z
base_z = 0.0           # arbitrary local reference plane

# Example for one pixel:
# vertex_z = base_z + height[y, x] * vertical_scale
```

### Grayscale <-> meters mapping (for `height_displacement.png` only)

The grayscale PNG is computed as:

```
gray = round( (height - height_min_m) / (height_max_m - height_min_m) * 255 )
```

`height_min_m` and `height_max_m` are recorded in `metadata.json`. To go
back from grayscale to an approximate meter value (lossy, ~height_range/255
resolution):

```
approx_height_m = (gray / 255.0) * (height_max_m - height_min_m) + height_min_m
```

Only use this if your tool truly cannot accept `height_agl.npy` directly -
it loses precision `height_agl.npy` doesn't.

## 7. How to treat the coordinate system right now

Treat this as **local image coordinates only**: pixel (x, y) has a height,
full stop. There is no latitude/longitude, no map projection, and no tie to
any real-world location yet - `metadata.json` deliberately has
`"coordinate_reference_system": null` and `"georeferenced": false` to make
that explicit. Do not build in an assumption that pixel spacing corresponds
to a specific real-world distance yet.

## 8. What will change in Part 2

Part 2 will combine this AGL prediction with real terrain elevation data
(from a source like USGS 3DEP or SRTM) once GAMUS tile georeferencing is
resolved:

```
absolute_elevation[y, x] = terrain_elevation[y, x] + predicted_AGL[y, x]
```

At that point `metadata.json`'s `future_part2_fields` will be filled in:
`terrain_source`, `geotransform_available` -> true, and a `vertical_reference`
field will say `"absolute_elevation"` instead of `"AGL"`. The array shape and
dtype (`float32`, meters, H x W) will NOT change - only what the numbers mean.

## 9. What should stay unchanged in the renderer

The renderer should already be built to read a generic `elevation[y, x]`
float array and a units/vertical_reference string from metadata, then compute
`vertex_z = base_z + elevation[y, x] * vertical_scale`. When Part 2 arrives,
you should only need to point it at a new `.npy` file and read the updated
`vertical_reference` - not rewrite the mesh-building or texturing logic.

If you want height relative to local terrain instead of absolute:
```
Z_relative = absolute_elevation - terrain_elevation
```

## Mesh / downsampling recommendation

The `.npy` array is left at full resolution (matches the model's training
resolution, currently 518x518 = ~268k pixels) so nothing is thrown away.
For an interactive web/desktop playground, using one vertex per pixel at
full resolution is usually unnecessary overhead:

- **Recommended default:** downsample by a factor of ~2-4 for the live mesh
  (e.g. sample every 2nd-4th pixel -> ~130-260 vertices per side, ~17k-65k
  vertices total) - smooth and fast on both web (three.js) and desktop engines.
- **Keep `height_agl.npy` at full resolution** as the source of truth; only
  downsample the array you actually feed into mesh generation, e.g.
  `height[::stride, ::stride]` in NumPy.
- If you need per-pixel fidelity for a specific close-up view, sample
  `height_agl.npy` directly at full resolution for that region only, rather
  than upsampling a downsampled mesh.

## Conceptual example

```
RGB:
    texture[y, x]

Height:
    H[y, x] = 12.7 meters   # e.g. a tree or building at this pixel

3D:
    vertex_z = base_z + H[y, x] * vertical_scale
```
