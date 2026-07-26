# Frost Skeleton — a palette swap of the Monster_Creatures_Fantasy skeleton
# into the glacial pass's colours. Same technique the game already uses for its
# slime variants (green/blue/dark), so every animation state comes along for
# free: idle / walk / attack / hurt / death.
#
# The source has two colour families, which we map separately so the creature
# doesn't flatten into one blue mush:
#   * neutral greys  -> BONE, frozen: pale blue-white ice
#   * warm browns    -> LEATHER/WRAPS: deep frost-slate
# Shading is preserved by mapping each pixel's luminance along a ramp.
#
# Run: python scripts/gen_frost_skeleton.py
from PIL import Image
import numpy as np

SRC = "public/sprites"
STATES = ["idle", "walk", "attack", "hurt", "death"]

# ramp stops: (luminance 0..255) -> rgb. Interpolated between stops.
BONE_RAMP = [(0, (26, 40, 58)), (60, (58, 96, 130)), (105, (140, 196, 226)), (150, (198, 232, 248)), (200, (236, 250, 255)), (255, (255, 255, 255))]
WRAP_RAMP = [(0, (14, 22, 38)), (45, (30, 50, 78)), (66, (42, 70, 104)), (105, (62, 100, 140)), (160, (96, 140, 180)), (255, (150, 190, 220))]


def ramp(stops, lum):
    if lum <= stops[0][0]:
        return stops[0][1]
    for i in range(1, len(stops)):
        l0, c0 = stops[i - 1]
        l1, c1 = stops[i]
        if lum <= l1:
            t = (lum - l0) / max(1, l1 - l0)
            return tuple(int(round(c0[k] + (c1[k] - c0[k]) * t)) for k in range(3))
    return stops[-1][1]


def frostify(path_in, path_out):
    im = Image.open(path_in).convert("RGBA")
    a = np.array(im).astype(np.int16)
    rgb, alpha = a[:, :, :3], a[:, :, 3]
    lum = (0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2])
    warm = (rgb[:, :, 0] - rgb[:, :, 2]) > 18  # brown wraps run red-heavy
    out = np.zeros_like(a)
    out[:, :, 3] = alpha
    # build small lookup tables so this stays fast on 1200x150 sheets
    bone_lut = np.array([ramp(BONE_RAMP, i) for i in range(256)], dtype=np.int16)
    wrap_lut = np.array([ramp(WRAP_RAMP, i) for i in range(256)], dtype=np.int16)
    li = np.clip(lum, 0, 255).astype(np.uint8)
    out[:, :, :3] = np.where(warm[:, :, None], wrap_lut[li], bone_lut[li])
    # a cold rim: brighten the topmost lit pixels so the ice catches the light
    hot = (lum > 150) & (alpha > 30) & (~warm)
    out[:, :, 0] = np.where(hot, np.minimum(255, out[:, :, 0] + 10), out[:, :, 0])
    out[:, :, 1] = np.where(hot, np.minimum(255, out[:, :, 1] + 14), out[:, :, 1])
    out[:, :, 2] = np.where(hot, 255, out[:, :, 2])
    Image.fromarray(out.astype(np.uint8), "RGBA").save(path_out)
    return im.size


for st in STATES:
    size = frostify(f"{SRC}/skeleton_{st}.png", f"{SRC}/frostskel_{st}.png")
    print(f"frostskel_{st}.png {size}")
print("frost skeleton written")
