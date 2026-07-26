# Ice Elemental — ORIGINAL creature art, generated as pixel art.
#
# A hovering crystal: a faceted core with a cracked glow inside, three orbiting
# shards, and a drift of frost-mist beneath it. Crystalline shapes are geometric,
# so code draws them cleanly (unlike organic creatures) — the same reasoning
# behind the generated dungeon backdrop.
#
# Drawn on a 50x50 grid then upscaled 3x NEAREST into the pack's 150x150 frame,
# which keeps chunky pixels consistent with the bought sheets. Faces RIGHT like
# the rest of the pack (CREATURE_RIG flips it to face the hero).
#
# States: idle(4) walk(8) attack(8) hurt(4) death(4)
# Run: python scripts/gen_ice_elemental.py
import math
from PIL import Image, ImageDraw

S = 50           # design grid
Z = 3            # upscale -> 150px frames
BASE_Y = 34      # mist/base line: 34*3 = 102 ~ the pack's foot line (101/150)
OUT = "public/sprites"

DEEP = (26, 56, 92)
MID = (58, 118, 168)
LIGHT = (140, 200, 236)
BRIGHT = (206, 240, 255)
GLOW = (150, 245, 255)
CORE = (92, 210, 240)


def crystal(d, cx, cy, w, h, fill, edge, hi=True):
    """A faceted shard: pointed top and bottom, widest just above centre."""
    pts = [
        (cx, cy - h),
        (cx + w, cy - h * 0.30),
        (cx + w * 0.72, cy + h * 0.58),
        (cx, cy + h),
        (cx - w * 0.72, cy + h * 0.58),
        (cx - w, cy - h * 0.30),
    ]
    d.polygon(pts, fill=fill, outline=edge)
    if hi:
        # lit facet down the left shoulder
        d.polygon([(cx, cy - h), (cx - w, cy - h * 0.30), (cx - w * 0.72, cy + h * 0.58), (cx, cy + h * 0.15)], fill=edge)
        d.line([(cx, cy - h), (cx, cy + h)], fill=fill)


def draw(bob=0.0, orbit=0.0, lean=0.0, thrust=0.0, crack=0.0, shatter=0.0, flash=False):
    """One frame. All animation is parameterised so states share the same body."""
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = 25 + lean + thrust * 6
    cy = 20 + bob

    if shatter >= 1.0:
        return img  # gone

    # --- frost mist beneath (it hovers) ---
    if shatter < 0.6:
        ma = 1.0 - shatter * 1.6
        for i, (ox, rw) in enumerate([(0, 9), (-4, 6), (4, 5)]):
            yy = BASE_Y + 1 + (i % 2)
            col = MID if i == 0 else DEEP
            if ma > 0.35:
                d.ellipse([cx + ox - rw, yy - 1.5, cx + ox + rw, yy + 1.5], fill=col)

    # --- orbiting shards ---
    for k in range(3):
        a = orbit + k * (2 * math.pi / 3)
        rx, ry = 13.5, 7.0
        sx = cx + math.cos(a) * rx
        sy = cy + math.sin(a) * ry + 2
        if shatter > 0:  # fly apart on death
            sx += math.cos(a) * shatter * 26
            sy += math.sin(a) * shatter * 18 - shatter * 6
        sw = 2.4 + math.sin(a) * 0.5
        behind = math.sin(a) < 0
        crystal(d, sx, sy, sw, 4.4 + sw * 0.4, DEEP if behind else MID, MID if behind else LIGHT, hi=not behind)

    # --- the core body ---
    body_w, body_h = 8.0, 13.0
    if shatter > 0:
        body_w *= max(0.15, 1 - shatter * 0.7)
        body_h *= max(0.15, 1 - shatter * 0.7)
    fill = BRIGHT if flash else MID
    edge = (255, 255, 255) if flash else LIGHT
    crystal(d, cx, cy, body_w, body_h, fill, edge)

    # inner glow — the elemental's heart
    if not flash and shatter < 0.5:
        gh = body_h * 0.42
        crystal(d, cx, cy + 1, body_w * 0.36, gh, CORE, GLOW, hi=False)

    # --- eyes: dark sockets so the glow reads as a FACE, not more inner shine ---
    if shatter < 0.4:
        ey = cy - body_h * 0.52
        ecol = (255, 255, 255) if flash else GLOW
        for ox in (1.0, 4.2):
            d.rectangle([cx + ox - 0.6, ey - 0.8, cx + ox + 2.4, ey + 2.4], fill=DEEP)  # socket
            d.rectangle([cx + ox, ey, cx + ox + 1.4, ey + 1.6], fill=ecol)              # glow

    # --- damage cracks ---
    if crack > 0:
        d.line([(cx - 2, cy - 6), (cx + 1, cy - 1), (cx - 1, cy + 4)], fill=BRIGHT)
        if crack > 0.5:
            d.line([(cx + 3, cy - 8), (cx + 1, cy - 3)], fill=BRIGHT)

    # --- death: a spray of splinters ---
    if shatter > 0:
        for k in range(7):
            a = k * (2 * math.pi / 7) + 0.4
            px = cx + math.cos(a) * shatter * 30
            py = cy + math.sin(a) * shatter * 22
            if 0 <= px < S and 0 <= py < S:
                d.rectangle([px, py, px + 1.2, py + 1.2], fill=LIGHT if k % 2 else BRIGHT)
    return img


def sheet(frames, name):
    out = Image.new("RGBA", (len(frames) * S * Z, S * Z), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f.resize((S * Z, S * Z), Image.NEAREST), (i * S * Z, 0))
    out.save(f"{OUT}/icelem_{name}.png")
    print(f"icelem_{name}.png {out.size} ({len(frames)} frames)")


# idle — a slow hover, shards drifting round
sheet([draw(bob=math.sin(i / 4 * math.tau) * 1.6, orbit=i / 4 * math.tau * 0.5) for i in range(4)], "idle")
# walk — same drift, leaning into the travel
sheet([draw(bob=math.sin(i / 8 * math.tau) * 1.4, orbit=i / 8 * math.tau, lean=1.2) for i in range(8)], "walk")
# attack — shards wind back, then the whole body lunges forward
atk = []
for i in range(8):
    t = i / 7
    thrust = -0.55 if t < 0.4 else (t - 0.4) / 0.6 * 1.5   # coil, then strike
    atk.append(draw(bob=-abs(math.sin(t * 3.1)) * 1.5, orbit=t * math.tau * 1.4, thrust=thrust))
sheet(atk, "attack")
# hurt — a white flash, then cracks show
sheet([draw(bob=0.6, orbit=0.4 * i, crack=0.3 + i * 0.25, flash=(i == 0), lean=-1.4 + i * 0.5) for i in range(4)], "hurt")
# death — it comes apart
sheet([draw(bob=1.0, orbit=i * 0.7, crack=1.0, shatter=(i + 1) / 4.2) for i in range(4)], "death")
print("ice elemental written")
