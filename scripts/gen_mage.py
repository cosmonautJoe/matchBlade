# Aldwin the Mage — the forest camp's hireable wizard, recoloured from the Evil
# Wizard sheet (the same pack Malgrim uses) into cold arcane blues so he reads
# as a scholar of the caravan, not the boss who burns it.
#
# Rules work on HUE so the five sheets stay consistent:
#   * red robes      -> deep indigo/blue
#   * gold/orange fire on the staff -> cyan arcane light
#   * warm brown haft -> slate blue
#   * SKIN is left alone (else he turns into a smurf)
#
# Run: python scripts/gen_mage.py
import colorsys
from PIL import Image
import numpy as np

SRC = "public/sprites"
# camp needs a standing pose and a walk for the hire cutscene
STATES = [("idle", "boss_idle"), ("walk", "boss_move")]


def is_skin(r, g, b):
    """Peachy highlights on the face/hands — keep them human."""
    return r > 200 and g > 150 and b > 100 and (r - b) < 140


def remap(px):
    r, g, b, a = px
    if a < 10:
        return (0, 0, 0, 0)
    if is_skin(r, g, b):
        return (r, g, b, a)
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    deg = h * 360
    if s < 0.12:  # greys/whites: tint them faintly cold
        h2, s2, v2 = 0.58, 0.10, v
    elif deg < 20 or deg > 330:  # RED robes -> indigo
        h2, s2, v2 = 0.63, min(0.85, s * 0.95), v * 0.98
    elif deg < 45:  # brown haft / dark orange -> slate blue
        h2, s2, v2 = 0.58, min(0.60, s * 0.7), v * 0.95
    else:  # gold & yellow flame -> cyan arcane light
        h2, s2, v2 = 0.50, min(0.75, s * 0.85), min(1.0, v * 1.05)
    r2, g2, b2 = colorsys.hsv_to_rgb(h2, s2, v2)
    return (int(r2 * 255), int(g2 * 255), int(b2 * 255), a)


for name, src in STATES:
    im = Image.open(f"{SRC}/{src}.png").convert("RGBA")
    a = np.array(im)
    out = a.copy()
    # only a couple dozen distinct colours per sheet — map uniques, then apply
    flat = a.reshape(-1, 4)
    uniq = np.unique(flat, axis=0)
    lut = {tuple(u): remap(tuple(int(x) for x in u)) for u in uniq}
    of = out.reshape(-1, 4)
    for u in uniq:
        key = tuple(u)
        m = (flat == u).all(axis=1)
        of[m] = lut[key]
    Image.fromarray(out, "RGBA").save(f"{SRC}/mage_{name}.png")
    print(f"mage_{name}.png {im.size} (from {src})")
print("mage written")
