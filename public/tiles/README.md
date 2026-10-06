# Tile artwork v0.0.67

`atlas-v062.png` is the base atlas. Its colored panels were brightened with the
built-in image generation tool; the exact edit prompt is in `atlas-v062-prompts.json`.
The earlier atlas and its generation/refinement prompts remain as `atlas-v061.png`
and `atlas-v061-prompts.json`.

`stone-v065.png` overrides only the stone tile, replacing its blue panel with
neutral warm gray to distinguish it from shields. It was edited with the built-in
image generation tool; the exact prompt is in `stone-v065-prompts.json`.
Its visible frame bounds are recorded separately in `src/tile-art.ts` and normalized
to the same logical face. All other tiles still use the unchanged base atlas.

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
