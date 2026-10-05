
import sys
import argparse
from pathlib import Path
import numpy as np
from PIL import Image
import h5py


def inspect_h5(h5_path: Path):
    """Prints internal dataset structure, keys, shapes, and dtypes."""

    print(f"Inspecting H5 File: {h5_path.name}")

    with h5py.File(h5_path, "r") as f:
        def visitor(name, obj):
            if isinstance(obj, h5py.Dataset):
                print(f"  Dataset: '{name}' | Shape: {obj.shape} | Dtype: {obj.dtype}")
            elif isinstance(obj, h5py.Group):
                print(f"  Group:   '{name}'")
        f.visititems(visitor)
    print()


def extract_from_h5(h5_path: Path, output_dir: Path):
    """Extracts RGB PNG (and height NPY if available) from an H5 file."""
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = h5_path.stem

    with h5py.File(h5_path, "r") as f:
        datasets = {}

        def collector(name, obj):
            if isinstance(obj, h5py.Dataset):
                datasets[name] = obj

        f.visititems(collector)

        if not datasets:
            print(f"[warning] No datasets found inside {h5_path.name}")
            return

        # 1. Identify RGB Image Dataset
        rgb_key = None
        # Check common name patterns
        for key in datasets:
            lower = key.lower()
            if any(k in lower for k in ["rgb", "image", "img", "photo", "ortho"]):
                rgb_key = key
                break

        # Fallback: look for 3-channel array (H, W, 3) or (3, H, W)
        if rgb_key is None:
            for key, ds in datasets.items():
                if len(ds.shape) == 3 and (ds.shape[0] == 3 or ds.shape[2] == 3):
                    rgb_key = key
                    break

        if rgb_key:
            data = np.array(datasets[rgb_key])
            # Handle channel-first (3, H, W) -> (H, W, 3)
            if data.ndim == 3 and data.shape[0] in [1, 3, 4] and data.shape[0] < data.shape[2]:
                data = np.transpose(data, (1, 2, 0))

            # Handle 1-channel grayscale
            if data.ndim == 3 and data.shape[2] == 1:
                data = data.squeeze(-1)

            # Normalize values to 0-255 uint8
            if data.dtype in (np.float32, np.float64):
                if data.max() <= 1.05 and data.min() >= 0.0:
                    data = (data * 255.0).clip(0, 255).astype(np.uint8)
                else:
                    data = ((data - data.min()) / max(1e-5, data.max() - data.min()) * 255.0).clip(0, 255).astype(np.uint8)
            elif data.dtype != np.uint8:
                data = data.astype(np.uint8)

            out_png = output_dir / f"{stem}.png"
            Image.fromarray(data).save(out_png)
            print(f"[ok] Saved PNG image: {out_png} (from '{rgb_key}', {data.shape[1]}x{data.shape[0]})")
        else:
            print(f"[warning] Could not detect RGB dataset in {h5_path.name}")

        # 2. Identify Depth / Height Dataset (if present)
        depth_key = None
        for key in datasets:
            lower = key.lower()
            if any(k in lower for k in ["depth", "height", "dsm", "elevation", "agl"]):
                depth_key = key
                break

        if depth_key:
            depth_arr = np.array(datasets[depth_key], dtype=np.float32)
            if depth_arr.ndim == 3 and (depth_arr.shape[0] == 1 or depth_arr.shape[2] == 1):
                depth_arr = depth_arr.squeeze()

            out_npy = output_dir / f"{stem}_depth.npy"
            np.save(out_npy, depth_arr)
            print(f"[ok] Saved Depth NPY: {out_npy} (from '{depth_key}', range: {depth_arr.min():.2f}m to {depth_arr.max():.2f}m)")


def main():
    parser = argparse.ArgumentParser(description="Extract PNG images and NPY depth from .h5 files.")
    parser.add_argument("input", help="Path to a .h5 file or directory containing .h5 files")
    parser.add_argument("--output", "-o", default="extracted_h5_images", help="Output directory for PNGs")
    parser.add_argument("--info", action="store_true", help="Only inspect dataset structure without extracting")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"[error] File or directory not found: {input_path}")
        sys.exit(1)

    if input_path.is_file():
        h5_files = [input_path]
    else:
        h5_files = list(input_path.glob("*.h5")) + list(input_path.glob("*.hdf5"))
        if not h5_files:
            print(f"[error] No .h5 or .hdf5 files found in {input_path}")
            sys.exit(1)

    print(f"Found {len(h5_files)} H5 file(s).")
    output_dir = Path(args.output)

    for h5_file in h5_files:
        if args.info:
            inspect_h5(h5_file)
        else:
            extract_from_h5(h5_file, output_dir)


if __name__ == "__main__":
    main()




#  1. To inspect what datasets are inside your .h5 file:                                                                                          
                                                                                                                                                      
#     python extract_h5.py "path/to/file.h5" --info                                                                                                     
                                                                                                                                                      
#   (This shows the internal dataset names, shapes, and data types without creating files).                                                             
                                                                                                                                                      
#   2. To extract PNGs from a single .h5 file:                                                                                                     
                                                                                                                                                      
#     python extract_h5.py "path/to/file.h5" --output extracted_images/                                                                                 
                                                                                                                                                      
#   3. To extract a whole folder of .h5 files at once:                                                                                             
                                                                                                                                                      
#     python extract_h5.py "path/to/folder_with_h5_files/" --output extracted_images/                                                                   
#                                                                             
