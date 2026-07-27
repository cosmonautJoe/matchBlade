# Zone bosses — pack the two purchased/free boss packs into the horizontal
# strip spritesheets the game preloads from public/sprites/.
#
#   * FOREST  — the Minotaur (mino_v1.1_free), 288x160 frames.
#               States: idle(16) / walk(12) / attack(16). The pack ships NO
#               hurt or death frames, so the scene fakes those (tint + topple).
#   * SNOW    — the Frost Guardian (Frost_Guardian_FREE_v1.0), 192x128 frames.
#               States: idle(6) / walk(10) / attack(14) / hurt(4) / death(16).
#
# Both packs face RIGHT natively; the scene flips them to glare up-lane.
# The script also prints each sheet's content bbox and FOOT FRACTION (lowest
# opaque row / frame height) — that number is what CREATURE_RIG/BOSS origins
# use to stand the sprite on GROUND_Y.
#
# Run: python scripts/gen_bosses.py
import os
from PIL import Image

OUT = "public/sprites"
MINO = "assets/enemy/mino_v1.1_free/animations"
FROST = "assets/enemy/Frost_Guardian_FREE_v1.0/PNG files"

# (out name, source dir, frame-file prefix)
JOBS = [
    ("mino_idle", f"{MINO}/idle", "idle"),
    ("mino_walk", f"{MINO}/walk", "walk"),
    ("mino_attack", f"{MINO}/atk_1", "atk_1"),
    ("frost_idle", f"{FROST}/idle", "idle"),
    ("frost_walk", f"{FROST}/walk", "walk"),
    ("frost_attack", f"{FROST}/1_atk", "1_atk"),
    ("frost_hurt", f"{FROST}/take_hit", "take_hit"),
    ("frost_death", f"{FROST}/death", "death"),
]


def frames(d, prefix):
    """Numerically-ordered frame paths (frame_1, frame_2 ... not frame_10 first)."""
    got = []
    for f in os.listdir(d):
        if not f.endswith(".png") or not f.startswith(prefix + "_"):
            continue
        stem = f[:-4][len(prefix) + 1:]
        if not stem.isdigit():
            continue
        got.append((int(stem), os.path.join(d, f)))
    return [p for _, p in sorted(got)]


os.makedirs(OUT, exist_ok=True)
for name, d, prefix in JOBS:
    paths = frames(d, prefix)
    if not paths:
        raise SystemExit(f"no frames for {name} in {d}")
    ims = [Image.open(p).convert("RGBA") for p in paths]
    w, h = ims[0].size
    sheet = Image.new("RGBA", (w * len(ims), h), (0, 0, 0, 0))
    for i, im in enumerate(ims):
        if im.size != (w, h):
            raise SystemExit(f"{name}: frame {i} is {im.size}, expected {(w, h)}")
        sheet.paste(im, (i * w, 0))
    out = f"{OUT}/{name}.png"
    sheet.save(out)
    bbox = sheet.getbbox()  # (l, t, r, b) over the whole strip
    foot = bbox[3] / h
    print(f"{name}.png  {len(ims)} frames  {w}x{h}  content y{bbox[1]}..{bbox[3]}  foot={foot:.3f}")
