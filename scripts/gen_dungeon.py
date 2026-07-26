# Generates the dungeon biome's parallax layers + floor atlas as pixel art.
# Original art, drawn programmatically (no packs) — matches the 384x216 layer
# format of the vnitti biome sets. Run: python scripts/gen_dungeon.py
# Layers (back -> front): wall.png (torchlit brick), arches.png (stone
# colonnade), fore.png (pillar + chain silhouettes). Plus floor.png (64x96
# stone-flag band, cropped like the other biomes' ground).
import random
from PIL import Image, ImageDraw

random.seed(83)  # stable art between regenerations

W, H = 384, 216
OUT = "public/worlds/dungeon"


def clamp(v):
    return max(0, min(255, int(v)))


def jitter(c, n):
    return tuple(clamp(v + random.randint(-n, n)) for v in c)


# ---------- layer 1: the far wall — dark brick courses + torch pools ----------
wall = Image.new("RGBA", (W, H), (13, 14, 18, 255))
d = ImageDraw.Draw(wall)

BRICK_W, BRICK_H = 24, 12
base = (30, 32, 41)
for row in range(H // BRICK_H + 1):
    off = (BRICK_W // 2) if row % 2 else 0
    for col in range(-1, W // BRICK_W + 1):
        x = col * BRICK_W + off
        y = row * BRICK_H
        c = jitter(base, 5)
        if random.random() < 0.08:  # the odd sunken/broken brick
            c = jitter((21, 22, 28), 3)
        d.rectangle([x + 1, y + 1, x + BRICK_W - 1, y + BRICK_H - 1], fill=c)
        # top-left catchlight, bottom shade — chunky pixel shading
        d.line([x + 1, y + 1, x + BRICK_W - 1, y + 1], fill=jitter((38, 40, 50), 4))
        d.line([x + 1, y + BRICK_H - 1, x + BRICK_W - 1, y + BRICK_H - 1], fill=(16, 17, 22))
        if random.random() < 0.05:  # moss creeping through the mortar
            mx, my = x + random.randint(2, BRICK_W - 4), y + random.randint(2, BRICK_H - 3)
            d.rectangle([mx, my, mx + 2, my + 1], fill=jitter((36, 52, 34), 6))

# torch sconces every 96px — the corridor's only light
px = wall.load()
for tx in (48, 144, 240, 336):
    ty = 92
    # warm pool of light painted onto the bricks (soft radial blend)
    R = 46
    for yy in range(max(0, ty - R), min(H, ty + R)):
        for xx in range(tx - R, tx + R):
            dist2 = (xx - tx) ** 2 + (yy - ty) ** 2
            if dist2 < R * R:
                f = (1 - (dist2 ** 0.5) / R) ** 2 * 0.55
                r, g, b, a = px[xx % W, yy]
                px[xx % W, yy] = (clamp(r + 190 * f), clamp(g + 120 * f), clamp(b + 30 * f), a)
    # bracket + flame
    d.rectangle([tx - 1, ty + 3, tx + 1, ty + 10], fill=(52, 42, 34))
    d.rectangle([tx - 2, ty + 1, tx + 2, ty + 3], fill=(64, 50, 38))
    d.rectangle([tx - 2, ty - 4, tx + 2, ty + 1], fill=(238, 148, 34))
    d.rectangle([tx - 1, ty - 7, tx + 1, ty - 2], fill=(255, 208, 74))
    d.point((tx, ty - 8), fill=(255, 240, 160))

wall.save(f"{OUT}/wall.png")

# ---------- layer 2: stone colonnade — columns + arches, transparent gaps ----------
arch = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(arch)
stone = (44, 47, 58)
hi = (60, 64, 78)
lo = (28, 30, 38)
COL_W = 22
for cx in (16, 144, 272):  # 128px rhythm, tileable
    d.rectangle([cx, 24, cx + COL_W, H], fill=stone)
    d.line([cx, 24, cx, H], fill=hi)  # rim light left
    d.line([cx + COL_W, 24, cx + COL_W, H], fill=lo)
    # mortar courses on the column
    for y in range(34, H, 18):
        d.line([cx + 1, y, cx + COL_W - 1, y], fill=lo)
    # capital + base blocks
    d.rectangle([cx - 3, 24, cx + COL_W + 3, 32], fill=jitter(stone, 3))
    d.rectangle([cx - 3, 24, cx + COL_W + 3, 26], fill=hi)
    d.rectangle([cx - 4, H - 14, cx + COL_W + 4, H], fill=jitter(stone, 3))
    d.rectangle([cx - 4, H - 14, cx + COL_W + 4, H - 12], fill=hi)
# arches spanning between capitals (chunky stepped curves)
for lx, rx in ((16 + COL_W, 144), (144 + COL_W, 272), (272 + COL_W, 384 + 16)):
    span = rx - lx
    for i in range(span):
        t = i / max(1, span - 1)
        # a shallow pointed arch: rise toward the middle
        rise = int(18 * (1 - abs(t - 0.5) * 2) ** 0.8)
        x = (lx + i) % W
        d.rectangle([x, 24 - rise, x, 24 - rise + 7], fill=stone)
        d.point((x, 24 - rise), fill=hi)
arch.save(f"{OUT}/arches.png")

# ---------- layer 3: foreground — near-black pillars + hanging chains ----------
fore = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(fore)
dark = (17, 18, 24)
rim = (36, 38, 48)
for cx in (58, 250):  # sparse 192px-ish rhythm
    w = 30
    d.rectangle([cx, 0, cx + w, H], fill=dark)
    d.line([cx, 0, cx, H], fill=rim)
    for y in range(12, H, 26):  # the merest hint of coursing
        d.line([cx + 2, y, cx + w - 2, y], fill=(13, 14, 18))
# chains swinging from the dark above
for chx, ln in ((130, 52), (168, 30), (330, 44)):
    for y in range(0, ln, 6):
        d.rectangle([chx - 1, y, chx + 1, y + 4], outline=(52, 54, 64))
    d.rectangle([chx - 2, ln, chx + 2, ln + 4], fill=(58, 60, 70))  # the hook
fore.save(f"{OUT}/fore.png")

# ---------- floor: stone flags band (64x96, same crop shape as the biomes) ----------
fl = Image.new("RGBA", (64, 96), (9, 10, 13, 255))
d = ImageDraw.Draw(fl)
# two courses of flagstones on top — the walkable lip
for row, y0, hh in ((0, 0, 9), (1, 9, 8)):
    off = 8 if row % 2 else 0
    for col in range(-1, 5):
        x = col * 16 + off
        c = jitter((58, 60, 70), 6)
        d.rectangle([x + 1, y0 + 1, x + 15, y0 + hh - 1], fill=c)
        d.line([x + 1, y0 + 1, x + 15, y0 + 1], fill=jitter((74, 77, 90), 5))
        d.line([x + 1, y0 + hh - 1, x + 15, y0 + hh - 1], fill=(30, 31, 38))
# under-earth: sparse rubble fading into the dark
for i in range(60):
    x = random.randint(0, 63)
    y = random.randint(19, 92)
    if random.random() < max(0.1, 1 - (y - 18) / 40):
        d.point((x, y), fill=jitter((34, 35, 42), 8))
fl.save(f"{OUT}/floor.png")

print("dungeon art written to", OUT)
