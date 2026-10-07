# Tile artwork v0.0.106

`wood-v106.png` overrides the wood tile with a very light sandy-brown panel and
cream highlights. Its gradient and diagonal enamel facets remain. It was
edited from `wood-v105.png` using built-in image generation;
the exact prompt is in `wood-v106-prompts.json`. The separately measured frame is
normalized to the same logical tile size. Other tiles still use `atlas-v104.png`.

`atlas-v104.png` is the base atlas, edited with the built-in image generation
tool from `atlas-v062.png`, with `stone-v065.png` as the warm-gray stone reference.
This atlas has a muted olive-brown wood panel, superseded by the override. All eight panels
have richer diagonal gradients and restrained enamel facets behind the symbols.
The full prompt is saved in `atlas-v104-prompts.json`.

Measured frame bounds are in `src/tile-art.ts`. Stone now comes from this atlas,
retaining its warm-gray panel, so the separate old override is no longer loaded.
Stable tile keys, the 252×252 bake, glisten, actual-art shatter and the potion's
animated rainbow overlay are retained. All prior source artwork stays available.

## Earlier artwork

`atlas-v062.png` is the base atlas. Its colored panels were brightened with the
built-in image generation tool; the exact edit prompt is in `atlas-v062-prompts.json`.
The earlier atlas and its generation/refinement prompts remain as `atlas-v061.png`
and `atlas-v061-prompts.json`.

`stone-v065.png` overrides only the stone tile, replacing its blue panel with
neutral warm gray to distinguish it from shields. It was edited with the built-in
image generation tool; the exact prompt is in `stone-v065-prompts.json`.
It was normalized to the same logical face; all other tiles used the base atlas.

Layout: swords, purple fireball, shield / key, gem, wood / stone, potion, empty frame.
The ninth empty frame is reserved artwork and is not a board tile.

The atlas is 1254×1254 with real transparency. Sprite bounds are recorded in
`src/tile-art.ts`; do not assume equal grid cells when replacing the artwork.
Each logical 84×84 face is baked at 252×252 to retain detail on high-density phones.
The shared renderer adds a subtle colored backing, lower lip and static glass finish;
source PNGs are unchanged. Existing texture keys and logical tile IDs are retained.
The fireball retains the internal
`tile-staff` key for saved games and arena mechanics.

Original individual PNGs remain available as art references.
