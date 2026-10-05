import torch
import torch.nn as nn
from transformers import AutoModelForDepthEstimation

DEFAULT_CHECKPOINT = "depth-anything/Depth-Anything-V2-Small-hf"

class GamusHeightModel(nn.Module):
    def __init__(self, checkpoint=DEFAULT_CHECKPOINT, freeze_backbone=False):
        super().__init__()
        self.backbone_model = AutoModelForDepthEstimation.from_pretrained(checkpoint)
        if freeze_backbone:
            for name, param in self.backbone_model.named_parameters():
                if "backbone" in name:
                    param.requires_grad = False

    def forward(self, pixel_values, out_size=None):
        if out_size is None:
            out_size = pixel_values.shape[-2:]
        outputs = self.backbone_model(pixel_values=pixel_values)
        raw = outputs.predicted_depth
        if raw.ndim == 3:
            raw = raw.unsqueeze(1)
        raw = torch.nn.functional.interpolate(
            raw, size=out_size, mode="bicubic", align_corners=False
        )
        height = torch.nn.functional.softplus(raw)
        return height
