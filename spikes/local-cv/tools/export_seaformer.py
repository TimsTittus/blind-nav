"""Build a standalone SeaFormer (no mmcv/mmseg) from the upstream sources, load weights, export ONNX."""
import re, sys, json, numpy as np, torch, torch.nn as nn, torch.nn.functional as F
from PIL import Image
src_root = sys.argv[1]; ckpt_path = sys.argv[2]; out_dir = sys.argv[3]; test_img = sys.argv[4]

SHIMS = '''
import math, torch
from torch import nn
import torch.nn.functional as F
def build_norm_layer(cfg, num_features):
    return "bn", nn.BatchNorm2d(num_features)
class ConvModule(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size, stride=1, padding=0, dilation=1, groups=1,
                 norm_cfg=None, act_cfg=dict(type="ReLU"), **_):
        super().__init__()
        self.conv = nn.Conv2d(in_channels, out_channels, kernel_size, stride, padding, dilation, groups, bias=norm_cfg is None)
        if norm_cfg is not None: self.bn = nn.BatchNorm2d(out_channels)
        self.has_norm = norm_cfg is not None
        self.activate = nn.ReLU(inplace=True) if act_cfg is not None else None
    def forward(self, x):
        x = self.conv(x)
        if self.has_norm: x = self.bn(x)
        return self.activate(x) if self.activate is not None else x
def resize(input, size=None, scale_factor=None, mode="nearest", align_corners=None, warning=True):
    return F.interpolate(input, size, scale_factor, mode, align_corners)
class BaseDecodeHead(nn.Module):
    def __init__(self, in_channels, channels, *, num_classes, in_index, input_transform=None, dropout_ratio=0.1,
                 norm_cfg=None, act_cfg=dict(type="ReLU"), align_corners=False, **_):
        super().__init__()
        self.in_channels, self.channels, self.in_index = in_channels, channels, in_index
        self.norm_cfg, self.act_cfg, self.align_corners = norm_cfg, act_cfg, align_corners
        self.conv_seg = nn.Conv2d(channels, num_classes, kernel_size=1)
        self.dropout = nn.Dropout2d(dropout_ratio)
    def _transform_inputs(self, inputs):
        return [inputs[i] for i in self.in_index]
    def cls_seg(self, feat):
        return self.conv_seg(self.dropout(feat))
'''
def strip(path):
    text = open(path).read()
    text = text.split("if __name__ == '__main__':")[0]
    text = re.sub(r"^(from|import) .*$", "", text, flags=re.M)
    return re.sub(r"^@\w+\.register_module\(\)$", "", text, flags=re.M)
code = SHIMS + strip(f"{src_root}/mmseg/models/backbones/seaformer.py") + strip(f"{src_root}/mmseg/models/decode_heads/light_head.py")
ns = {}; exec(compile(code, "seaformer_standalone", "exec"), ns)

cfg = dict(cfg1=[[3,1,16,1],[3,4,24,2],[3,3,24,1]], cfg2=[[5,3,48,2],[5,3,48,1]], cfg3=[[3,3,96,2],[3,3,96,1]],
           cfg4=[[5,4,160,2]], cfg5=[[3,6,192,2]], channels=[16,24,48,96,160,192], depths=[3,3], key_dims=[16,24],
           emb_dims=[160,192], num_heads=6)
norm = dict(type="BN", requires_grad=True)
class Seg(nn.Module):
    def __init__(self):
        super().__init__()
        self.backbone = ns["SeaFormer"](cfgs=[cfg[f"cfg{i}"] for i in range(1,6)], channels=cfg["channels"], emb_dims=cfg["emb_dims"],
            key_dims=cfg["key_dims"], depths=cfg["depths"], num_heads=cfg["num_heads"], drop_path_rate=0.0, norm_cfg=norm)
        self.decode_head = ns["LightHead"](in_channels=[48,160,192], in_index=[0,1,2], channels=128, dropout_ratio=0.1,
            embed_dims=[96,128], num_classes=150, is_dw=True, norm_cfg=norm, align_corners=False)
    def forward(self, x):
        return self.decode_head(self.backbone(x))  # logits at 1/8 resolution

ck = torch.load(ckpt_path, map_location="cpu", weights_only=False)
model = Seg().eval()
missing, unexpected = model.load_state_dict(ck["state_dict"], strict=False)
print("missing", missing[:5], len(missing), "unexpected", unexpected[:5], len(unexpected))
assert not missing, "weights did not map onto the standalone model"
classes = list(ck["meta"]["CLASSES"])
json.dump(classes, open(f"{out_dir}/seaformer_classes.json", "w"))
print("params M", round(sum(p.numel() for p in model.parameters()) / 1e6, 2))

MEAN = np.array([123.675, 116.28, 103.53], np.float32); STD = np.array([58.395, 57.12, 57.375], np.float32)
def prep(path, size):
    a = (np.asarray(Image.open(path).convert("RGB").resize((size, size), Image.BILINEAR), np.float32) - MEAN) / STD
    return torch.from_numpy(a.transpose(2, 0, 1)[None].copy())

for size in (512, 384):
    x = prep(test_img, size)
    with torch.no_grad(): y = model(x)
    labels, counts = np.unique(y.argmax(1).numpy(), return_counts=True)
    top = sorted(zip(counts, labels), reverse=True)[:6]
    print(size, "logits", tuple(y.shape), "top classes", [(classes[l], int(c)) for c, l in top])
    path = f"{out_dir}/seaformer_s_ade_{size}.onnx"
    torch.onnx.export(model, (x,), path, input_names=["pixel_values"], output_names=["logits"], opset_version=17, dynamo=False)
    import onnxruntime as ort
    o = ort.InferenceSession(path, providers=["CPUExecutionProvider"]).run(None, {"pixel_values": x.numpy()})[0]
    print(size, "onnx max abs diff vs torch", float(np.abs(o - y.numpy()).max()), "argmax agreement", float((o.argmax(1) == y.numpy().argmax(1)).mean()))
