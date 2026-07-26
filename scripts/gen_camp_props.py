# Camp dressing for the forest and glacial towns — ORIGINAL pixel art, drawn
# programmatically like the dungeon backdrop and the ice elemental.
#
# House style, matched to the bought packs: hard aliased edges, a small palette
# per prop, a dark outline, and a lighter top face so everything reads as lit
# from above. Every piece sits with its BASE on the bottom row, because camp
# props are placed with origin (0.5, 1).
#
# Run: python scripts/gen_camp_props.py   ->  public/camp/*.png
from PIL import Image, ImageDraw
import random

OUT = "public/camp"
random.seed(7)  # stable art between runs


def new(w, h):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def outline_rect(d, box, fill, line):
    d.rectangle(box, fill=fill, outline=line)


def grain(d, x0, y0, x1, y1, col, n=3, seed=0):
    """A few darker streaks so flat timber doesn't read as plastic."""
    rnd = random.Random(seed)
    for _ in range(n):
        y = rnd.randint(int(y0) + 1, max(int(y0) + 1, int(y1) - 1))
        xa = rnd.randint(int(x0) + 1, int(x1) - 3)
        d.line([(xa, y), (min(int(x1) - 1, xa + rnd.randint(3, 9)), y)], fill=col)


# ============================ FOREST ============================
def stump_axe():
    """A felled stump with an axe buried in it — the woodcutters' mark."""
    im, d = new(46, 40)
    BARK, BARK_D, TOP, RING = (74, 52, 32), (48, 33, 20), (146, 110, 70), (112, 82, 50)
    d.rectangle([9, 14, 36, 38], fill=BARK, outline=BARK_D)  # trunk
    d.ellipse([8, 8, 37, 20], fill=TOP, outline=BARK_D)  # cut face
    d.ellipse([15, 11, 30, 17], outline=RING)  # growth ring
    d.ellipse([20, 13, 25, 15], outline=RING)
    grain(d, 10, 20, 36, 37, BARK_D, 4, seed=1)
    # roots flaring at the base
    d.polygon([(9, 38), (4, 38), (9, 32)], fill=BARK, outline=BARK_D)
    d.polygon([(36, 38), (41, 38), (36, 32)], fill=BARK, outline=BARK_D)
    # axe: haft, then head
    d.line([(31, 4), (23, 15)], fill=(96, 66, 38), width=3)
    d.polygon([(28, 2), (36, 5), (33, 12), (26, 8)], fill=(176, 182, 192), outline=(84, 90, 102))
    d.line([(30, 4), (34, 7)], fill=(226, 232, 240))  # edge highlight
    im.save(f"{OUT}/stump_axe.png")


def drying_rack():
    """Split logs stacked under a lean-to — where the camp seasons its timber."""
    im, d = new(88, 58)
    POST, POST_D = (92, 64, 38), (58, 40, 24)
    ROOF, ROOF_D = (108, 78, 46), (66, 46, 28)
    for x in (6, 78):  # uprights
        d.rectangle([x, 14, x + 5, 56], fill=POST, outline=POST_D)
    d.polygon([(2, 16), (86, 16), (80, 6), (8, 6)], fill=ROOF, outline=ROOF_D)  # slanted roof
    grain(d, 6, 7, 82, 15, ROOF_D, 5, seed=2)
    # stacked log ends, two courses
    logs = [(90, 62, 36), (78, 54, 32), (104, 74, 44)]
    for row, (y, h) in enumerate([(34, 11), (46, 11)]):
        for i in range(6):
            cx = 12 + i * 11 + (5 if row else 0)
            if cx > 74:
                continue
            c = logs[(i + row) % 3]
            d.ellipse([cx, y, cx + 10, y + h], fill=c, outline=(52, 36, 22))
            d.ellipse([cx + 3, y + 3, cx + 7, y + h - 3], outline=(60, 42, 26))
    im.save(f"{OUT}/drying_rack.png")


def forest_shrooms():
    """A cluster of fat red-caps — the forest floor's own lanterns."""
    im, d = new(52, 34)
    def cap(cx, base, r, ch, capc, capd):
        d.rectangle([cx - 2, base - ch, cx + 2, base], fill=(226, 216, 196), outline=(150, 140, 120))
        d.chord([cx - r, base - ch - r, cx + r, base - ch + r], 180, 360, fill=capc, outline=capd)
        for dx, dy in ((-r // 2, -3), (2, -5), (r // 2, -2)):
            d.ellipse([cx + dx, base - ch + dy - 1, cx + dx + 2, base - ch + dy + 1], fill=(244, 238, 228))
    cap(16, 32, 11, 10, (168, 52, 44), (104, 28, 24))
    cap(35, 33, 9, 8, (186, 66, 52), (112, 32, 26))
    cap(26, 34, 6, 5, (150, 44, 38), (96, 24, 20))
    im.save(f"{OUT}/forest_shrooms.png")


def fern():
    """Low fronds — filler green with more body than a grass tuft."""
    im, d = new(46, 32)
    for bx, lean, ln, col, dark in [
        (23, -15, 21, (58, 104, 52), (38, 74, 36)),
        (23, -6, 28, (76, 130, 64), (50, 92, 44)),
        (23, 5, 27, (68, 118, 58), (44, 84, 40)),
        (23, 14, 19, (54, 98, 50), (36, 70, 34)),
    ]:
        tipx, tipy = bx + lean, 31 - ln
        d.line([(bx, 31), (tipx, tipy)], fill=dark, width=2)  # spine
        for k in range(1, 9):  # leaflets, fattest at the base
            t = k / 9
            px = int(bx + lean * t)
            py = int(31 - ln * t)
            w = max(2, int(6 * (1 - t) + 1))
            d.polygon([(px, py + 2), (px - w, py), (px, py - 1)], fill=col)
            d.polygon([(px, py + 2), (px + w, py), (px, py - 1)], fill=col)
    im.save(f"{OUT}/fern.png")


def lantern_post():
    """A hung lantern — the camp's warm point of light after dusk."""
    im, d = new(26, 62)
    d.rectangle([11, 10, 14, 61], fill=(88, 62, 36), outline=(56, 38, 22))  # post
    d.line([(12, 11), (21, 11)], fill=(70, 74, 84), width=2)  # arm
    d.line([(21, 11), (21, 16)], fill=(70, 74, 84))
    d.rectangle([16, 16, 26, 30], fill=(58, 62, 72), outline=(34, 38, 46))  # housing
    d.rectangle([18, 19, 24, 27], fill=(255, 214, 120), outline=(196, 148, 60))  # glass
    d.rectangle([20, 21, 22, 25], fill=(255, 246, 206))  # flame
    d.polygon([(15, 16), (27, 16), (25, 12), (17, 12)], fill=(70, 74, 84), outline=(34, 38, 46))  # cap
    im.save(f"{OUT}/lantern_post.png")


# ============================ GLACIAL ============================
def snow_drift():
    """A wind-carved drift — soft mass to break up a flat camp floor."""
    im, d = new(78, 26)
    d.chord([0, 4, 56, 44], 180, 360, fill=(226, 238, 248), outline=(180, 200, 220))
    d.chord([30, 10, 78, 40], 180, 360, fill=(238, 246, 252), outline=(190, 208, 226))
    for _ in range(14):  # crust sparkle
        x, y = random.randint(4, 74), random.randint(10, 23)
        d.point((x, y), fill=(255, 255, 255))
    im.save(f"{OUT}/snow_drift.png")


def ice_crystal():
    """A shard formation — the pass growing its own architecture."""
    im, d = new(50, 58)
    def shard(cx, base, w, h, fill, edge):
        d.polygon([(cx, base - h), (cx + w, base - h * 0.42), (cx + w - 1, base - 4), (cx, base),
                   (cx - w + 1, base - 4), (cx - w, base - h * 0.42)], fill=fill, outline=edge)
        d.line([(cx, base - h), (cx, base - 4)], fill=edge)
    shard(17, 56, 8, 30, (150, 200, 232), (206, 236, 252))
    shard(34, 57, 7, 22, (128, 182, 220), (188, 222, 244))
    shard(25, 58, 11, 46, (176, 218, 242), (226, 246, 255))
    d.line([(25, 20), (25, 50)], fill=(240, 252, 255))  # core glint
    im.save(f"{OUT}/ice_crystal.png")


def snowman():
    """Somebody's been idle in camp."""
    im, d = new(38, 52)
    SNOW, EDGE = (240, 247, 252), (186, 204, 222)
    d.ellipse([4, 30, 34, 51], fill=SNOW, outline=EDGE)
    d.ellipse([9, 16, 29, 34], fill=SNOW, outline=EDGE)
    d.ellipse([12, 4, 26, 18], fill=SNOW, outline=EDGE)
    d.rectangle([11, 2, 27, 5], fill=(52, 48, 60))  # hat
    d.rectangle([14, -4, 24, 3], fill=(52, 48, 60))
    for x in (16, 22):
        d.rectangle([x, 9, x + 1, 10], fill=(30, 30, 36))  # eyes
    d.polygon([(19, 12), (26, 13), (19, 14)], fill=(226, 138, 52))  # carrot
    for bx in (14, 19, 24):
        d.point((bx, 24), fill=(40, 40, 48))  # buttons
    d.line([(8, 24), (0, 17)], fill=(94, 66, 40))  # stick arms
    d.line([(30, 24), (37, 17)], fill=(94, 66, 40))
    im.save(f"{OUT}/snowman.png")


def brazier():
    """An iron fire-basket — the reason anyone survives the pass."""
    im, d = new(38, 50)
    IRON, IRON_D, IRON_L = (74, 78, 88), (40, 44, 52), (104, 110, 122)
    # a SOLID silhouette first: splayed legs meeting a stem, then the bowl on top
    d.polygon([(7, 49), (31, 49), (24, 44), (14, 44)], fill=IRON, outline=IRON_D)  # base plate
    d.polygon([(14, 44), (24, 44), (21, 30), (17, 30)], fill=IRON, outline=IRON_D)  # stem
    d.polygon([(5, 30), (33, 30), (29, 19), (9, 19)], fill=IRON, outline=IRON_D)  # bowl
    d.line([(6, 30), (32, 30)], fill=IRON_D)  # bowl floor reads closed
    d.line([(9, 20), (29, 20)], fill=IRON_L)  # lit rim
    for x in range(11, 29, 4):
        d.line([(x, 21), (x - 1, 29)], fill=IRON_D)  # bars
    # embers sit INSIDE the bowl, flame rising out of it
    d.rectangle([11, 21, 27, 24], fill=(150, 52, 26))
    d.polygon([(12, 21), (26, 21), (22, 9), (19, 15), (16, 6), (14, 15)], fill=(238, 138, 40))
    d.polygon([(16, 20), (23, 20), (21, 11), (19, 15), (17, 12)], fill=(255, 206, 96))
    d.point((19, 12), fill=(255, 248, 214))
    im.save(f"{OUT}/brazier.png")


def frozen_pine():
    """A snow-laden conifer — the pass's own tree, mid-sized for camp filler."""
    im, d = new(70, 92)
    TRUNK, TRUNK_D = (76, 56, 38), (48, 34, 22)
    NEEDLE, NEEDLE_D = (38, 76, 62), (24, 52, 42)
    d.rectangle([32, 74, 38, 91], fill=TRUNK, outline=TRUNK_D)
    for y, w in ((72, 30), (54, 25), (36, 19), (18, 12)):
        d.polygon([(35 - w, y), (35 + w, y), (35, y - 22)], fill=NEEDLE, outline=NEEDLE_D)
        # snow settled on each bough
        d.polygon([(35 - w + 3, y - 1), (35 + w - 3, y - 1), (35, y - 15)], fill=(228, 240, 250))
        d.polygon([(35 - w + 8, y - 3), (35 + w - 8, y - 3), (35, y - 13)], fill=NEEDLE)
    d.polygon([(31, 8), (39, 8), (35, -2)], fill=(238, 247, 253))  # capped crown
    im.save(f"{OUT}/frozen_pine.png")


def ice_blocks():
    """Cut ice, stacked — quarried for the caravan's cold stores."""
    im, d = new(62, 40)
    def block(x, y, w, h, f, e):
        d.rectangle([x, y, x + w, y + h], fill=f, outline=e)
        d.line([(x + 2, y + 2), (x + w - 3, y + 2)], fill=(226, 244, 255))  # top sheen
    block(2, 22, 26, 17, (166, 208, 236), (112, 158, 196))
    block(31, 24, 26, 15, (150, 196, 228), (104, 148, 188))
    block(14, 6, 26, 17, (182, 220, 244), (120, 166, 202))
    im.save(f"{OUT}/ice_blocks.png")


for fn in (stump_axe, drying_rack, forest_shrooms, fern, lantern_post,
           snow_drift, ice_crystal, snowman, brazier, frozen_pine, ice_blocks):
    fn()
    print(f"  {fn.__name__}")
print("camp props written to", OUT)
