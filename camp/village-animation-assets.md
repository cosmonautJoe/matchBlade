# Animated village assets

## Player arrival

The active maps are now `village-hub-arrival.png` and `village-hub-wide-arrival.png`, with the painted player removed. `village-player.png` is a 4 × 3 transparent sheet: eight north-facing walk poses followed by four idle poses. Full built-in image generation prompts are in `village-arrival-prompts.json`.

The player walks from the south trail across the center of the bridge into the clearing over 4.6 seconds. Arrival waits for the player and background images, preserves progress on rotation, and does not block station input. Pausing camp animation skips to the destination. Each of the twelve sprite frames has its own measured boot anchor to compensate for uneven source padding; keep these anchors in sync if replacing the sprite sheet.

## Current departure artwork

The active maps are `village-hub-trail.png` and `village-hub-wide-trail.png`. A signposted woodland trail replaces the portal in both orientations. Depart still starts a run from the same touch region. Portal surface distortion and purple motes have been removed from the renderer. Edit prompts are recorded in `village-trail-prompts.json`. Earlier portal maps below are retained as source references only.

Generated with the built-in image generation tool from the approved village artwork.
The original maps remain available as references. The hub now uses `village-hub-polished.png` and `village-hub-wide-polished.png`: connected station paths, a bridge with a visible south-bank exit, simplified props, and no painted station NPCs. Full edit prompts are in `village-polish-prompts.json`. The surrounding viewport uses a solid background so scenery is never duplicated behind the map.

- `village-hub-layered.png`: portrait map with merchant, blacksmith, and wizard removed. The anvil and buildings remain; the quest guide is still painted into this version.
- `village-hub-wide-layered.png`: landscape map with merchant, blacksmith, wizard, and quest guide removed.
- `village-npcs.png`: original four-pose reference sheet.
- `village-npcs-v2.png`: active transparent eight-column, four-row sprite sheet. Rows are merchant sorting goods, blacksmith swinging a hammer, wizard casting, and guide reading a scroll. Columns contain consecutive poses. Generation prompt is in `village-npcs-v2-prompt.txt`.

Actions take 1.6–2.8 seconds, with staggered cycles of 12–19 seconds. The portal's painted surface is displaced inside its opening, with drifting motes. Water texture is displaced inside shoreline polygons; waterfall streaks and foam remain continuous while characters rest. All four station NPCs are separate sprites in both layouts. The blacksmith faces the anvil. River masks are specific to the polished maps.

Station hit areas cover their buildings, with small captions at rest and emphasis on hover, press, and keyboard focus. They retain one-tap activation and native button semantics.

The quest guide starts reading within a second of arrival, holds the open-scroll poses, then rests for the remainder of an 18-second cycle. A small weight shift runs between actions. Two feathered, multi-lobed cloud shadows cross the map over 38 seconds, beginning over the clearing so the effect is visible on arrival; four staggered leaf tracks create only a few visible leaves at once. These effects share the camp animation toggle and never cover UI labels.

Departure fades an opaque curtain over the hub rather than fading the hub itself. The legacy Phaser camp camera is hidden before handoff, preventing the old camp from flashing through. The game scene supplies its own fade-in.

Animation is drawn by `src/village-animation.ts` in map coordinates. Portrait uses 1024 × 1536 coordinates and landscape uses 1536 × 1024. Sprite-sheet source cells are calculated from the image dimensions. The anvil is composited back in front of the blacksmith. Portal flow, fire, hammer sparks, spell motes, quest-board glints, river highlights, and waterfall trails are procedural canvas effects.

Station buttons remain separate DOM elements above the animation. The animation does not receive pointer input. Rendering is capped at 24 frames per second and device pixel ratio 2 and pauses drawing for hidden pages. Reduced motion sets the initial default to paused; the visible Play/Pause camp animation button overrides that default and remembers the player's choice locally. Scene cleanup removes the canvas and observers.

Generation brief summary (not verbatim prompts): preserve each approved map's composition while removing the specified NPCs for separate animation; create a matching transparent 4 × 4 sprite sheet with four distinct action poses per character, consistent scale and alignment, and no labels or grid lines.
