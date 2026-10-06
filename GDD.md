# matchBlade — Game Design Document

## Reliable title buttons — v0.0.91

- Fixed start/load buttons occasionally staying invisible after launch. A viewport resize during their delayed fade canceled the animation but left the button containers transparent. Title reflow now restores both buttons to full opacity when canceling their tweens, across desktop, portrait and short landscape layouts.

## Slime rush finale — v0.0.90

- Replaced Round Them Up with Slime Rush. Four small slimes circle the player, hop into position and visibly squash down before lunging. Swiping through an airborne slime knocks it out with a blade flash, gel spray and recoil. The first two defeats come from single attacks; the final pair leap in sync at the same height so one sweeping slash can hit both.
- Swipes work in either direction with generous targets and swept collision for fast pointer movement. Short taps and stationary holds do not hit. Each new attack clears the prior gesture's hit eligibility, while allowing a held finger to begin a new swipe. A miss is one attack even when both slimes reach the player, and defeated slimes stay defeated across retries and checkpoint resumes.
- Leaf pads and lure/trap interactions are removed. The first two phases retain their mechanics. The finale uses the existing player and slime sprites, a brief arena caption and animated windups. Focused checks cover attack grouping, multi-target swipes, partial recovery and single boss rewards; visual playtesting is left to the user.

## Stretch and sever — v0.0.89

- Replaced the forest slime boss's second phase with a swipe game. Its two halves hop apart and stretch a shaded, elastic goo membrane; the thin middle turns warm gold when it can be cut. Three successful cuts trigger the existing split into four smaller slimes.
- Each cut produces a brief blade trail, gel spray, retracting strands and springy recoil. The halves reconnect at a different angle with less goo and more separation as progress accumulates. A missed window makes them snap together and attack; completed cuts stay earned, including after a checkpoint resume.
- Slow drags and fast swipes both work in either direction, with forgiving endpoints. Taps, small jitter and movement along the connection do not count. A held pointer cannot carry a previous stroke into another opportunity. The final encounter uses the same mechanic with a slightly shorter, still generous opening.
- The first and third phases stay unchanged. A short arena caption explains the gesture, without an instruction popup or timing meter. Focused swipe/recovery checks and the production build are the verification for this batch; visual playtesting is left to the user.

## Forest slime boss — v0.0.88

- Moss Slime replaces Malgrim in the forest. Malgrim now belongs to the dungeon; Gorrach and the Frost Guardian keep their zones. Aldwin's camp recruitment is unchanged.
- Three dedicated boss arenas replace matching during this fight: dodge the giant's marked slam and tap its exposed core three times; drag either of its two halves into the other for three collisions; then bait four small slimes onto broad leaves and tap each landed slime to fold the leaf around it. Misses retain completed hits and captures. The second encounter uses slightly shorter reaction windows and the same three phases.
- Both the upper combat lane and the arena visibly split from one slime to two to four, using the existing animated pixel slime with gel splashes, squash/stretch and forest colors. Persistent action cues replace instruction popups. A completed fight pays one boss reward and advances one depth.
- Partial phase progress is checkpointed. Older forest wizard checkpoints keep completed stages when migrated. Focused checks cover migration, partial recovery, fast flings in either direction and one-time boss completion. Visual playtesting is left to the user.

## Forest ambushes — v0.0.87

- Forest supply forks and tile roots are replaced by ambushes at encounters 5 and 15. A small Sporecap and Watcher emerge from rustling bushes with a few loose leaves, separate health bars and one shared attack cycle. Each has 55% of the normal depth-based health; the pair clears one depth, preserving bosses at 10 and 20.
- Swords target the front creature. Fireball matches and spell items hit both, applying each creature's own resistance. A survivor moves forward after the other falls. Clearing the entire pair awards one recovery surge and 4 wood / 2 stone, with no duplicate depth, pet or quest rewards.
- The forest's guaranteed shop supply is now an Ember Flask: 12 base spell damage to both ambushers, plus spell upgrades. It costs 4 gems and is kept unless two ambushers are present. The legacy `shears` ID preserves already purchased supplies. Existing forest checkpoints clear retired roots/forks and retain both ambushers' health when saved mid-fight.
- Focused checks cover targeting, shared attacks, both casualty orders, mixed cascades, rewards and save migration. Production build passes; visual playtesting is left to the user.

## Forgiving edge swaps — v0.0.86

- Fixed upward drags snapping back when the pointer slightly overshot the top of the puzzle. Active drag previews and releases now allow a 0.35-tile margin at each edge, scaled with the board; the destination still must be an adjacent, valid tile.
- Starting taps and item targeting retain exact board bounds. Far-outside releases and canceled input still cancel. A focused regression exercises the actual scene input/swap methods: the same top-row match works in either direction and with a small overshoot, in portrait and landscape.

## Earlier danger warning — v0.0.85

- The combat red tint now starts at 50% pressure and reaches full strength at 80%, instead of starting at 72% and peaking at 96%. A direct pressure ramp makes the early warning visible sooner, while the existing time easing keeps transitions smooth.
- Maximum tint strength and recovery fade are unchanged. This adjusts visual warning timing only.

## Aligned portrait resource header — v0.0.84

- Replaced the loose resource row with four evenly spaced gray pockets: consistent centered icons, right-aligned counts and room for growing totals. A separate 44px menu target and a quieter depth/score row fit within the existing 64px header.
- A subtle dark backing separates the counters from animated scenery. Resource arrivals target the icon center and use a smaller portrait bounce to preserve spacing. Landscape restores its existing counter and menu arrangement on rotation.

## Balance tall-phone combat and inventory — v0.0.83

- Fixed the portrait sizing rule that gave every spare pixel to combat: the lane now uses its protected HUD/actor height, and extra vertical space goes below the puzzle. At a 393×852 usable viewport, combat is about 135px instead of 251px, with the full-width square puzzle preserved.
- When the bottom tray has at least 228px available, its six items use two rows of three, up to 72px per slot, with separate quest and compact buff space. Shorter portrait screens and boss fights keep one row, with enough reserved height for their content and padding. Landscape is unchanged.

## Clearer near-death combat warning — v0.0.82

- The combat scene gradually turns red after 72% pressure, with stronger edges and a light wash over the center. It reaches its maximum warning at 96% pressure, before the skull ends the run, and eases away on recovery.
- Uses the existing combat-panel bounds in both orientations. The puzzle stays untinted; chest, tutorial and result screens suppress the effect. The warning stays smooth without flashing.

## Further tighten portrait combat — v0.0.81

- Trimmed the combat minimum to 130px, the HUD allowance to 40px and the scaled action allowance to 160 design pixels, returning more height to the puzzle on constrained portrait screens.

## Tighter portrait combat spacing — v0.0.80

- Reduced the combat minimum to 140px, HUD allowance to 44px and scaled action allowance to 180 design pixels. This returns room to the puzzle while retaining protected space for the characters and enemy display.

## Preserve portrait combat height — v0.0.79

- Portrait combat keeps at least 160px of height, plus enough room for a 52px HUD row and a 220-design-pixel action area at the current character scale. The enemy name, health display and controls stay above the actors instead of cropping into their heads on shorter portrait windows.
- The puzzle uses the remaining height with square tiles and retains full available width when space allows. Landscape layout is unchanged.

## Camp pets resize with the caravan — v0.0.78

- Pet artwork follows the caravan's live scale when resizing, rotating or expanding the cart. Their feet remain anchored to the ground or roof, and focused NPC views use the same resized artwork.
- Kept a minimum 44px tap target independently of the pet's visible size. Existing pixel artwork and animation routines are preserved.

## Gorrach ends at Lock horns — v0.0.77

- Removed Gorrach's floor-20 armor-cutting finale. Both encounters now end after Dodge the charge, Turn his axe and Lock horns, with the normal victory animation, rewards and zone progression.
- His health bar reflects only those three stages. Resuming a save already in the removed finale awards the victory; checkpoints preserve completion of the core stages. The other bosses retain their floor-20 finales.

## Make potion rainbow visible — v0.0.76

- Replaced the faint four-corner tint with a shared atlas of actual rainbow-colored background frames, supporting both WebGL and Canvas rendering. Multiple colors are visible immediately, with a quiet twelve-second cycle and stronger color coverage over the teal panel.
- The bottle/frame cutout, TAP label, original glisten and Tile Effects control remain intact. Only potion background rendering changes.

## Full motion on every device — v0.0.75

- Removed automatic OS/browser reduced-motion handling throughout the game: camp weather and smoke, forge bursts, NPC camera transitions, creature rescues, empowered effects, tile lifting/settling and drag previews, quest feedback, camp buttons, ready indicators and CSS transitions now animate consistently on desktop and phone.
- Motion starts enabled by default. Explicit camp Play/Pause, the saved Tile Effects setting, game pauses and hidden-tab suspension retain their intended roles. The project guidance records this policy to prevent automatic motion reduction from being reintroduced.

## Camp creatures animate consistently — v0.0.74

- Collected creatures use the camp's animation clock on desktop and phone, including when the OS requests reduced motion. They roam, fly, perch and idle through their existing routines by default. Camp's Play/Pause button freezes and resumes them in place alongside the NPCs, and focused NPC views continue showing those live animations.

## Tap outside the caravan to leave an NPC — v0.0.73

- In any focused NPC view, clicking or tapping the scenery outside the cart closes the service panel through the existing smooth zoom-out transition. Hit detection follows the rendered camera position and the cart's actual opaque artwork, so empty sky within its canvas also counts as outside; a small margin protects taps near its edges.
- Cart/NPC taps and service-panel controls stay interactive without dismissing the view. The modal input shield remains through the exit animation, preventing the same tap from activating the camp underneath. Applies to portrait and landscape.

## Subtle potion iridescence — v0.0.72

- Potion tiles have a faint pastel rainbow sheen across their colored background, drifting through one smooth color cycle every 24 seconds at 26% opacity. A shared high-resolution cutout keeps it off the bottle and metal frame; the TAP badge and original occasional glisten remain above it.
- The effect follows the saved Tile Effects toggle, including changes during a run, and cleans up its animation/listener when the tile is removed. Other tile backgrounds, glisten timing, shattering and potion behavior are unchanged.

## Combat danger tint and fork scenery — v0.0.71

- Near death, a restrained red edge tint fades into the top combat panel once pressure exceeds 75%. It strengthens smoothly toward the skull and eases away when the player recovers. The center stays clear, with no heartbeat flashing. The effect follows the visible lane in both orientations, replacing the former full-screen vignette; it hides during tutorials, loot/choice screens and results.
- Supply forks now change the lane's scenery during their three-encounter detour: the wooded trail adds trees, bushes and cut timber; the quarry adds larger rock outcrops and scattered stones. These reuse the existing pixel-art props behind the road and characters, scroll with travel, and fade in/out as the detour starts/ends. Snow uses frosted pines and cold rock colors; the dungeon's timber passage uses stored wood and crates. The underlying biome remains visible.
- Scenery reads the existing saved route choice and progress, so resuming and rotating preserve the route. Rewards, matching, tile effects and combat tuning are unchanged.

## Tile effects preference — v0.0.70

- Options now includes a saved **Tile effects** ON/OFF toggle for random glisten, shattering and its short material accents. It defaults to ON independently of the device's reduced-motion preference; existing installations receive the same default. The original glisten timing, strength and shatter physics are unchanged.
- Changes apply to the current board without restarting the run. Turning effects off removes existing glints and shards, and cleared tiles use the short fade. Turning them back on restores glints to ordinary tiles, keeping empowered indicators and potion labels intact. The preference is stored separately from progress and save slots; if storage is unavailable it still works for the session. Other motion preferences retain their existing behavior.

## Potion tap cue — v0.0.69

- Usable potion tiles show a compact, high-contrast **TAP** badge in Pixelify Sans and a slow, gentle mint outline pulse. The badge stays still and is rendered at higher resolution for phone readability. The cue travels with the tile through swaps and falls.
- The cue hides while a potion is ice-locked, the board is resolving, a drag is in progress, or an encounter/tutorial/item-targeting state prevents drinking. Reduced-motion mode retains the static badge and border. The decoration and its tween are removed with the tile; potion behavior and the restored glisten remain unchanged.

## Restore original tile glisten — v0.0.68

- Restored the original glisten implementation from Git: the same warm-white gradient, narrow soft highlight, 11 frames at 8 fps and 0.4 sprite opacity. Each tile starts independently after 0.5–7.2 seconds and repeats with its own 6.5–9-second gap. Removed the recent board-wide scheduling and material-specific glint tinting.
- The sharper tile faces, static glossy backing and drag swap preview remain. Reduced-motion preferences and empowered-tile decorations retain their current handling.

## Glossy tile faces and drag preview — v0.0.67

- Tiles now retain 252×252 texture detail for their 84×84 logical faces, improving clarity on high-density phone screens. A restrained colored backing, lower edge and static glass highlight give each face depth. Existing symbols, palettes, hit areas and source artwork remain. Title decorations and resource pickup animations keep their previous displayed sizes; shattering uses the updated faces.
- Random glistens are roughly half as strong and occur every 4.5–8 seconds. Removed the extra bevel sparkle and toned down landing movement.
- Dragging toward an adjacent cell animates the held tile and its neighbor partway toward a swap. The logical grid, tile ownership, matches and rewards remain unchanged while holding. Releasing completes the normal swap from its visible position; nonmatching swaps still return as before. Dragging back cancels, and changing directions returns the previous neighbor to its cell. Tapping to select and tapping potions remain supported.
- Outside release, touch cancellation, focus loss, pause, rotation and encounter transitions cancel the preview. Only the initiating pointer can finish the gesture. Ice restrictions remain enforced and reduced-motion mode uses immediate position feedback. Preview motion does not pause combat or enter checkpoints.

## Random tile glisten and movement polish — v0.0.66

- Replaced the faint per-tile shine loop (8–24 seconds before its first appearance) with a board-level clock. One random eligible tile glistens every 0.95–1.85 seconds of available play; changing tiles no longer restarts a long wait. The same face cannot glisten again for six seconds. Selection and match opportunities do not influence the choice.
- The shared highlight now has 36 frames over 750 ms, a brighter fine specular line, a soft diagonal sweep and a brief pixel sparkle on the bevel. Materials have slightly different light colors and strengths: polished metal and gems catch more light, wood and stone less. Transparent first/last frames keep the effect from sticking, and only one sweep plays at a time.
- Press/release easing and a small spring on landing add tactile feedback without moving logical tile positions or changing match timing. New glints wait during cascades, tutorials, targeting, chests and boss arenas; empowered tiles keep their existing effect. Reduced-motion mode skips decorative glints and movement.

## Stone tile contrast — v0.0.65

- Stone now has a neutral warm-gray panel and lighter inner edge, making it distinct from the shield's cobalt-blue background. Its light rock cluster retains a strong dark outline. A separate stone sprite overrides just that face; the other tiles retain their existing artwork. The board and shattering effect use the same updated face.

## Scout Map removed — v0.0.64

- Removed Scout Map and its next-encounter forecast from shops, chest drops and the active-effects HUD. Loading an old save removes packed maps, map inventory slots, pending map loot and the old forecast buff while preserving the rest of the run.

## Forge ready highlight — v0.0.63

- When the forge is unbuilt and the player can afford its actual material cost, the camp's Unlock forge button shows **Ready to build**, a warm gold treatment and a slow pulsing glow. The forge hotspot replaces its lock with a small gold exclamation mark and soft highlight.
- Readiness updates with the existing camp resource refresh, clearing when materials are spent below the cost or the forge is built. No popup or automatic purchase. Paused camp animations and reduced-motion preferences are respected; the static color and label remain visible.

## Brighter tiles and restored shattering — v0.0.62

- Tile backgrounds now use brighter, more saturated enamel colors and a light inner edge, preserving the large symbols and thin dark frames. The purple fireball remains the magic tile. Title and board share the revised atlas.
- Restored the original full-face shatter: each matched tile breaks into roughly a dozen irregular textured pieces, including its icon and frame, which burst outward, spin and fall with gravity over 0.8–1.2 seconds. Three crack patterns per tile are cached between runs. The brief material accents remain alongside the break-up effect.
- Shards clear with scene shutdown. Reduced-motion mode retains the quick fade without flying pieces. Match resolution keeps its existing 90 ms clear delay; no combat or reward rules change.

## Tile art and feedback — v0.0.61

- All eight tile faces now share a thin, quiet dark-metal frame and larger pixel-art symbols. Wood and stone use simpler, broader shapes. The magic tile is a purple fireball, and the potion has matching painted art instead of a platform-dependent emoji. Title-screen decor and boss mechanics use the same textures as the board.
- A new transparent atlas is normalized to the existing 84×84 faces using measured sprite bounds. Existing tile IDs, texture keys, saves, board dimensions, match rules, spell damage and study levels stay compatible. Player-facing tutorial, combat, companion and upgrade text calls the magic tiles fireballs and the upgrades spells.
- Tiles lift slightly while pressed and settle after swaps or falls; selected tiles have a clear cream outline. These animations affect the artwork inside the tile, preserving grid positions and touch targets.
- Ordinary glints are fainter and much less frequent. Empowered tiles retain their moving border, lose the competing ordinary glint and gain an opaque backing behind the readable ×2 badge.
- Clears use short, local accents: steel cuts, violet embers, shield flashes, key/gem glints, wooden splinters, stone chips and potion bubbles. These replace the long-lived full-tile shard explosions. Reduced-motion mode skips glints, lifting, settling and decorative bursts while retaining selection feedback and quick clear fades.

## Gorrach timing difficulty — v0.0.60

- Lock Horns still needs five successful shoves, but earned hits, filled pips and boss-bar progress never decrease after a miss, red hit or timeout. Mistakes retain their strike and brief input lockout; a failed run still ends normally.
- Gold windows now span 28%–20% of the rail (previously 19%–8%). One-way sweeps take 1600–1300 ms (previously 1150–640 ms), zone drift is much slower, and at most two smaller red bands appear. Attempts allow 9–7.5 seconds, giving players several passes to line up a hit.
- Applies to this timing phase at both boss depths. The floor-20 armor finale retains its existing rules.

## Companion balance — v0.0.59

- **Moss:** 2 starting guard, plus 2 every third defeat. Refills scale to the cost of a normal hit when that exceeds 2 (3 guard at depth 16+). Across a full 20-enemy run Moss grants 15 guard; boss arena attacks still bypass it. Starting guard belongs to new-run creation, so resuming never grants it again.
- **Bramble / Pip:** 3 wood / stone every fourth defeat (15 each over a full run). **Echo:** 1 key every fifth defeat (4 over a full run). Fixed kill bonuses remain independent of item multipliers.
- **Hazel / Flint:** clearing 4+ wood / stone in a cascade adds 3 of that resource. **Flurry:** clearing 4+ shields adds 2 guard. **Rime:** board potions add 2 bonus guard (4 total).
- **Hush:** staff matches gain 20% damage after defenses, rounded to the nearest integer, with a minimum bonus of 2. Scales with study upgrades and empowered spells; ordinary board damage still cannot bypass boss arenas.
- Collection text and active-bonus descriptions use the same tuning values as combat. Moss refills show a guard pickup; resource notices and potion guard feedback show the actual rewards. All owned pets continue helping together in every zone.

## Launch-screen version — v0.0.58

- The title screen imports the package version directly, allowing the development server to watch version bumps instead of retaining the version from server startup. Production builds use the same source.

## Fork in the road — v0.0.57

- Once per run, after the fifth defeated enemy, a short supply detour offers **Wooded trail** or **Quarry path**. A pet rescue at that depth defers the fork until the sixth enemy. Chests finish first, tutorials never open it, and the fork does not change the 10/20 boss milestones or reroll the puzzle.
- Choose **+3 wood** or **+3 stone** after each of the next **three enemies** (9 total if the stretch is completed). The fixed bonus is added to normal loot, is not multiplied by resource items, counts toward local haul quests and banks even on defeat or retreat. No resource match or payment is required to take either route.
- A compact native dialog shows a hand-drawn pixel map with connected branching paths, two readable touch targets and explicit reward/duration text. Snow uses Pine trail / Frozen quarry; the Dungeon uses Timber passage / Old quarry, with timber stacks in place of outdoor trees. Combat, pressure, scrolling and item timers wait while choosing. Pause/Escape, keyboard navigation, phone rotation and reduced-motion preferences remain supported.
- The chosen path adds one tappable wood/stone icon to the existing active-effects strip, explaining the bonus and remaining enemies. Small resource popups accompany payouts. The icon disappears after the third defeat. No extra permanent HUD row.
- Pending choices, committed choices and paid enemy counts are saved with the run. Reloads and rotation cannot reselect a path or pay the same defeat again. Old checkpoints receive an empty fork state; malformed fork data is ignored.

Verified with the build and focused fork checks for both choices in every zone, repeated input, reward limits, multiplier independence, expiry, checkpoint recovery in both board shapes, old saves, banking and quest accounting. Visual playtesting stays with the player.

## Revisit roads and area-specific quests — v0.0.56

- Tap the camp's area name (or **Choose area** in the guide) to open a compact route selector. Every unlocked road is available, including earlier areas. Cards show the current stop, cleared roads, pet collection counts and completed quest counts; locked roads explain which final boss opens them. Travel fades the existing camp before rebuilding it in the chosen environment. No NPC zoom for the route panel. In development, Shift-clicking the area name retains the preview-next-zone shortcut.
- Travel preserves banked resources, packed items, upgrades, recruits, pets and achievements. A suspended run blocks travel. Run results retain their forward-travel shortcut. The zone's final boss remains the unlock condition, and going back never relocks later areas.
- Each area has its own three automatically tracked quest slots. Only the current area's quests appear in its guide and combat HUD, fill empty slots, or pay out at camp. Enemy, chest, wood and stone counters now advance in the area where the run happens; depth objectives also require a run in their own area. Hiring and upgrade objectives still use permanent caravan progress. Quests in other areas remain saved and resume when revisited.
- Migration preserves completed quests, pending rewards and the progress already earned by every tracked objective in old saves, including mixed-area quest lists. Old lifetime counters remain for achievements; past runs are not guessed or assigned to a zone. Save slots and interrupted runs retain these rules.
- Player-facing resource wording is consistently **stone** in quests, camp costs, item descriptions, effects, tutorial and run results. Internal `ore` identifiers, asset paths, quest IDs and saved resource values stay compatible.

Verified with the build and focused quest/travel checks covering locked areas, returning to all unlocked roads, separate live/banked progress, legacy saves, reward idempotence, retained crew/items/upgrades, suspended runs and save slots. Visual playtesting remains with the player.

## Automatic quests and achievements — v0.0.55

- Camp automatically fills up to three quest slots from the current area's ordered pool. Delta objectives begin at the current lifetime totals; depth objectives need a subsequent run. Already-met hiring/upgrade objectives complete immediately when reached in the queue. Existing tracked quests and their baselines carry across areas.
- Completed quest rewards pay automatically on arrival at camp and after relevant camp upgrades. Payment, replacement objectives and achievement unlocks share one save. A suspended run keeps its original objectives until it ends. Opening the guide is no longer required to accept or turn in quests.
- Returning players see a brief nonmodal summary of collected gems and new achievement badges, with a short guide reaction. The Quests service shows the closest objective's actual progress and a thin meter, and highlights unseen journal updates. The summary survives reload until the guide is viewed or a new run begins. In-run objectives gain checkmarks and a brief text pulse/chime on completion; results note the rewards due at camp.
- The guide has **Quests** and **Achievements** tabs. Quests show current progress, upcoming objectives and the last three completed rewards. Achievements show descriptions, progress and permanently unlocked badges. Changing tabs retains the NPC view without replaying the zoom.
- Twelve achievements: first quest, ten quests, first pet, three pets, all nine pets, opening the forge, recruiting Aldwin, clearing each of the four zones, and defeating 100 enemies. Badges have no extra currency payout or manual claim step. Eligible milestones in older saves are recognized automatically. They live with the save and its slots; a new game resets them. This is the in-game achievement journal, with stable identifiers for future platform integration.
- Boss victories still unlock zones. Quests and achievements never block departure or add a combat popup.

Verified with the build and focused checks covering initial tracking, reward idempotence, atomic saving, reloads, suspended runs, camp upgrades, travel, old-save migration and achievement persistence. Visual playtesting stays with the player.

## Smoke follows the weather — v0.0.54

Chimney smoke now shares the camp's horizontal wind: pronounced rightward Plains gusts, a lighter Forest breeze, shifting Snow drafts, and near-vertical smoke in the sheltered Dungeon. Forest leaves and snowflakes share the same breeze with small individual swirls. Plains gust strength follows the grass-sway clock and wind-trail intensity. Fresh smoke rises before catching the wind; older puffs retain momentum instead of jumping when the breeze changes. Wind displacement uses screen speed converted into cart coordinates, so it stays consistent through resizing. Forge billows still swell briefly and drift with the same wind; pause and reduced-motion behavior remain supported.

## Forge chimney smoke — v0.0.53

Once the blacksmith is hired, a gentle trail of pixel-edged smoke rises from the caravan's chimney, drifting, expanding and fading. Hiring the smith or buying a sword upgrade briefly increases puff size, lift and emission rate, easing back over three seconds. The smoke is drawn on the live scenery behind the cart, extending beyond the roof canvas and following resizing and NPC camera transitions. Camp pause freezes the trail; reduced motion shows a static trail without upgrade bursts. No new image assets or changes to the caravan artwork.

## Companions on every road — v0.0.52

Nine permanent pets, all helping automatically in every zone from the run after recruitment. Existing collections are preserved. Each road randomly offers only its own missing pets, at most one encounter per run, using the existing 13% chance at eligible depths 3–18. Encounters only appear if the player can open the cage: **1 carried key**, or **3 wood** for a lever (carried wood first, then camp wood). Both choices show availability; leaving is allowed and that pet stays in the future encounter pool. No rare consumables required. Payment and ownership save together with checkpoint resources, so a resumed rescue cannot charge twice or refund its cost. A failed run does not lose the pet.

| Zone | Pet | Benefit | Camp behavior |
| --- | --- | --- | --- |
| Plains | Bramble, fox | 2 wood every 5 defeats | Wanders and sniffs around camp |
| Plains | Pip, magpie | 1 stone every 5 defeats | Hops, flies and inspects roof perches |
| Plains | Moss, tortoise | 1 starting guard | Slow walks with long pauses |
| Forest | Hazel, squirrel | 2 extra wood when a cascade clears 4+ wood | Darts between a stash and a nibbling spot |
| Forest | Hush, owl | Staff matches deal 1 extra damage after defenses | Watches from the roof, takes short flights, dozes |
| Snow | Flurry, snow hare | 1 extra guard when a cascade clears 4+ shields | Short hops and alert pauses |
| Snow | Rime, stoat | Board potions give 1 extra guard | Quick dashes, grooming and naps |
| Dungeon | Echo, bat | 1 key every 6 defeats | Hangs under the awning between short flying circuits |
| Dungeon | Flint, mole | 2 extra stone when a cascade clears 4+ stone | Shuffles, digs and examines the ground |

Fixed match extras trigger once per cascade and are not multiplied by resource items or empowered tiles. Boss immunity remains unchanged. Hand-drawn canvas pixel silhouettes share camp/rescue/collection rendering and keep the pets small. Ground pets spread across the scene; birds use the actual roof contour, while flying pets rest between trips. Motion follows resizing, camp pause, reduced-motion preferences and NPC close-ups. New owned-pet conversations give every addition two crew exchanges.

The camp has a compact **Pets** collection button, with zone counts, benefits, personalities and silhouettes for undiscovered pets. One compact paw icon in the run's active-effects strip lists all helping companions; it does not add nine separate buff icons. Recruitment remains centered, readable and keyboard navigable. Potion feedback includes Rime's extra guard.

Verified with the build and focused rules/save/payment/motion checks. Visual playtesting remains with the player.

## Active buff descriptions — v0.0.51

Tap an active effect icon to open a compact, readable card showing its name, effect and current duration/charges. Descriptions also work for guard and zone features. Tap the same icon, the close button or outside the card to dismiss; Escape closes the card before opening the pause menu. Cards update with the active effect and close when it expires or the effect strip is hidden. The existing compact icon layout stays the same, and buff presses do not reach the puzzle. Buttons retain their identity through timer updates so touch and keyboard focus remain reliable.

## Start Run zone floor — v0.0.50

The animated Start Run vignette scrolls the current camp's actual ground texture beneath the hero: Plains grass, Forest ground, Snow, or Dungeon stone, using the same atlas crop as the camp.

## Dungeon bat flight — v0.0.49

Dungeon bats now make occasional 3–4 second fly-bys with gaps between sightings, at most two at once. They use straighter trajectories, quick wingbeat bursts, short glides and an asymmetric side-on silhouette instead of slow, symmetrical fluttering.

## More visible camp atmosphere — v0.0.48

- **Plains:** curved pale gust trails cross the scenery, loose grass/seeds drift on the breeze, and ground grass/bushes sway. A slow cloud shadow and warm daylight give the air some depth.
- **Forest/Jungle:** sunbeam strength is roughly doubled, motes are larger/brighter, and 18–34 green/gold leaves tumble down in two depth layers. Leaves stop and fade on the roof or ground.
- **Snow:** 38–100 flakes scale with screen area. Near flakes are 4–6px simple crystals and distant flakes are 2–3px, with stronger contrast and lateral drift. Collision samples the full flake width, retaining the cart's sheltered interior.
- **Dungeon:** five small, low-detail bat silhouettes cross the background on staggered paths with flapping wings, behind the caravan and NPCs.

All effects use the existing camp clock, pause/reduced-motion behavior and NPC close-up compositor. Visual playtesting remains with the player.

## Jungle sunbeams — v0.0.47

Three warm diagonal rays peek through the forest canopy with brighter narrow centers, soft edges, gentle independent sway and a vertical fade before the ground. The rays are composited behind the caravan and inherit camp pause and reduced-motion behavior.

## Forest and ice camp atmosphere — v0.0.46

- Forest has a subtle green light grade, slow soft canopy rays, and eight drifting pollen/firefly motes.
- Snow has a cool blue haze and light, depth-layered snowfall. Flakes collide with the starter or expanded cart's roof/chimney/anvil silhouette and fade on contact. The entire sheltered space stays clear, including transparent illustration gaps and NPC workspaces. Ground contact also stops flakes; deposits do not grow indefinitely.
- Atmosphere uses small canvas lighting and particle passes without another WebGL context. Flake counts are capped and scale with screen area. Effects follow the cart's live position and scale during resizing, and NPC close-ups composite the same live foreground layer.
- Camp pause freezes the effects; reduced motion keeps a static atmosphere. Weather is confined to the environment, below dialogue and outside the control panels. Original cart assets remain unchanged.

## Compact bird wings — v0.0.45

Pip's wings now use three short feather segments close to the body, with a much shorter upstroke and compact idle stretch.

## Pip wing proportions — v0.0.44

Pip's flight wings are roughly one-third shorter, with a narrower feather silhouette and smaller idle stretches. The eight flight poses, timing and flight paths remain unchanged.

## Pip's flight and perches — v0.0.43

Pip is 35% smaller in camp and the rescue view. At camp he hops on the ground, flies in a smooth arc to the cart roof, rests, flies to a second perch, then returns to the ground. Flight uses eight wing poses and tucked feet, with longer pauses between trips. Perches follow the live starter/expanded cart bounds through resizing and NPC close-ups. The 44px tap target follows him; camp pause freezes the cycle and reduced motion keeps him grounded.

## Caravan zone accents — v0.0.42

The original starter and expanded caravan images remain unchanged. A separate pixel overlay adds small roof snow deposits in Snow, a few fallen leaves in Forest, and faint stone dust in Dungeon. Plains keeps the clean cart. Accents avoid roof straps, shelves, NPCs and workspaces, and are drawn into the shared caravan canvas so NPC close-ups inherit them.

## Pets in NPC close-ups — v0.0.41

NPC service views composite the pets' live canvases alongside the scenery and caravan, using their current camp positions. Pet animation and wandering continue through zoom-in and zoom-out with the same camera transform.

## Fox scale and wandering — v0.0.40

Bramble is 35% smaller in camp and the rescue view. At camp he walks a short, screen-scaled stretch of ground, pauses, turns and returns with alternating leg animation. His 44px tap target follows him. Camp pause freezes the walk; reduced motion keeps him stationary.

## Empowered tiles, Plains companions and camp UI — v0.0.38

- After two successful non-tutorial swaps, one sword, staff or shield tile becomes empowered. Its animated rim, orbiting sparks and ×2 badge follow swaps and gravity. Matching it doubles the corresponding connected match's damage or guard, with a colored burst and callout. Disconnected matches do not receive the bonus. Crosses count each cell once; a whetstone spends one charge. A new charge becomes available 6–8 successful swaps after consumption. Boss arenas do not spawn charges.
- Charges and their cadence survive checkpoints; portrait/landscape positions are cached alongside board layouts. Rotation does not roll a new charge. Reshuffles keep the existing charge's type; the prism converts it to sword power. A bomb consumes it, applying the bonus if at least three of that type are cleared.
- Plains can reveal a caged companion after a cleared encounter: 13% per eligible depth from 3–18, excluding the approach to floor 10, at most one rescue per run, choosing only unowned companions. Tap the centered cage to rescue, then continue. The board, pressure and timed buffs wait during the encounter. Rescue progress is saved immediately and survives a failed run; checkpoint recovery cannot reroll the same encounter.
- Three companions: **Bramble the fox** finds 2 wood every five kills; **Pip the magpie** finds 1 stone every five kills (changed from gems in v0.0.39; uses the existing ore resource); **Moss the tortoise** grants one starting guard. Benefits begin on the next run, persist across zones, and all rescued companions help automatically. Each has a small animated pixel silhouette beside the caravan; tap it for its benefit. Crew chatter acknowledges them.
- Start Run includes an animated miniature road and the original running hero, stronger gold light, a sweeping glint and moving arrow. Camp pause and reduced-motion settings stop these animations.
- Speech bubbles use locally bundled, OFL-licensed Pixelify Sans at 18px (previously 16px ambient / 17px intro). Compact padding, tighter leading, a plain speaker label and a small advance chevron replace the spacious badge/footer. Click-to-advance behavior remains.

Build and focused model checks only; visual playtesting stays with the player.

## Floor-20 finales and boss art — v0.0.37

Floor 10 retains three stages. The floor-20 rematch adds a fourth phase after the familiar finale, before the normal defeat, reward and chest sequence:

- **Gorrach / Plains — Break the armor:** his axe is caught; swipe across three exposed leather straps to drop individual armor plates. Crosswise swipes count, taps and strokes along the strap do not. A visible struggle precedes him pulling free and striking; already-cut straps stay cut on the next opening.
- **Malgrim / Forest — Connect the wards:** draw one continuous line through three matching seals. Complete diamond, triangle and branch circuits to collapse the barrier. A wrong symbol or early release resets the current trace; his cast animation warns before a delayed strike resets that circuit. The Dungeon placeholder uses the same mechanic with stone/violet framing.
- **Frost Guardian / Snow — Crack the lake:** match on a separate ice-covered board (6×4 portrait, 8×3 landscape). Matched cells crack; connect these cracks from the bottom edge to the top to break the lake under him. He retaliates after every fourth valid player swap, with an attack animation before impact. Cascades do not advance that retaliation count. The finale board awards no run resources and does not replace the regular board.

Boss meters reserve a final segment on floor 20. Checkpoints resume at the start of the fourth phase. Finale inputs, timers and tweens are owned by the arena and removed on teardown; orientation changes retain the active challenge. The local `?debug` boss bar has **IV · 20** to jump to the selected boss's finale; **FINISH** still bypasses the fight.

The visual pass keeps Gorrach's earth/leather/iron style, adds moss, vines and fireflies to Forest spell arenas, and uses violet stone accents for Dungeon spells. All three Guardian stages now share a frosted frame, faceted ice targets and shards, clearer headers, snowy particles and grounded movement. Existing stage-three rules remain, with no modal explanation added. Visual and balance playtesting remains with the player.

## Plains boss polish — v0.0.36

Gorrach now guards the Plains. Malgrim moves to the Forest and remains the Dungeon placeholder. Preloading, encounter selection and the development boss shortcuts follow this mapping.

- Gorrach's arena uses trampled earth, grass edging, worn iron target plates and a consistent three-stage footer. Larger headings and separated controls fit both board shapes.
- The opening charge shows Gorrach winding up on the path before he rushes forward. Directional warning chevrons, grounded character shadows, animated dodges and dust replace the plain red rectangles and offscreen entrance. Three rounds, including the final two-path warning, remain; successful dodges expose a gold bonus counter.
- The upper combat scene keeps both fighters visible throughout, brings Gorrach closer and adds hoof dust on swings. His bronze boss meter marks the actual phase boundaries.
- Counter attacks use iron target plates and a tighter timing ring. The lower duel has larger characters, connected ground and synchronized attacks. Stage transitions are brief, without instructional popups.
- Lock Horns retains all five shove steps, timing windows, drifting zones, penalties and input rules. It gains a riveted timing rail, striped danger zones, gold target emblem, visible needle, progress tally and impact sparks.

Build checked; visual playtesting is left to the player as requested.

## Zone supplies — v0.0.35

Forest, Snow and Dungeon shops guarantee one matching supply alongside a boss aid and a regular item on each stock roll, including paid refreshes. The supply is listed first and marked as zone gear. Plains stock stays unchanged. Zone supplies use normal pack/inventory slots and do not appear in generic chest rolls.

- **Pruning Shears (4 gems, Forest):** clear all current roots and award their normal 2 wood per patch, without changing tiles. Kept when there are no roots.
- **Thaw Flask (6 gems, Snow):** melt current ice without changing tiles, then prevent new patches until three more enemies have been defeated. Does not stack; its remaining encounter count appears in active effects and survives checkpoint recovery.
- **Lockpick (4 gems, Dungeon):** immediately open the current bonus cache for 3 gems, retaining keys and resetting that cache's partial lock progress. Counts toward the existing three-cache limit; kept once all three have been opened. The price exceeds the payout to prevent a currency loop.

Wrong-zone use, unsettled boards and boss arenas keep the supply in its slot. Zone rewards are fixed and are not multiplied by Double Resources.

## Zone preview shortcut — v0.0.34

In local development, clicking/tapping the camp area name cycles Plains → Forest → Snow → Dungeon → Plains and reloads camp in that zone. The shortcut retains the crew and resources and clears any suspended run from the previous zone. It is unavailable during dialogue, panels or departure, and omitted from production builds.

## Light zone mechanics — v0.0.33

- **Plains:** the familiar combat/matching loop without an added board rule.
- **Forest:** up to two root patches appear after depth 2, then no more than once per five kills. Matching through a patch removes it and adds 2 wood; roots do not restrict swaps. This replaces mushroom spore buildup. Enemy resistances remain.
- **Snow:** the same sparse schedule adds two ice patches. Their tiles cannot be swapped and stay in place during gravity. A match through or orthogonally beside ice breaks it. Placement always leaves a legal swap; ice thaws if it would otherwise deadlock the board. Rotation preserves the patch count, relocating only if needed to keep a legal move.
- **Dungeon:** each cascade containing a key match fills one of three locks on a small cache indicator beside active effects. Three locks automatically open the bonus cache for 3 gems without spending keys or interrupting combat. Maximum three bonus caches per run.

Patch positions, spawn cadence and cache progress persist with the run checkpoint. No extra timers, modal lessons, or changes to the zone backgrounds. Patch art stays on the board and disappears during chest/boss presentations. Camp preparation offers a short contextual hint; normal feedback reports roots cleared, ice broken and cache rewards.

## Start run invitation — v0.0.32

The Start run control uses a warm gold gradient, a gentle glow cycle, an occasional shimmer and a small arrow nudge. Pressing gives a subtle tactile offset without changing layout. Camp pause and reduced-motion preferences stop these animations.

## Consistent camp services — v0.0.31

Quests, sword upgrades, staff upgrades and locked workspaces share the merchant's gentle live NPC camera and smooth return. Each service frames its own station; undiscovered companions remain unnamed. Camp preparation and service panels share one fixed divider: the lower 55% in portrait, or the right 55% in landscape. Panels copy the preparation area's exact bounds, accounting for the header and safe areas, so opening or closing a service never changes the divider. Longer content scrolls inside the panel. Camp headers, preparation controls and service panels use the shop's charcoal gray palette with warm gold actions and accents. Preparation and service frames share rounded corners and a single thin border, without the heavy inset gold stripe.

## Merchant close-up — v0.0.27

v0.0.30 fixes the exit showing the normal camp underneath a second moving caravan. The exit now uses one fixed canvas covering the transition, hides only the underlying environment until handoff, and animates the camera and crop without repeatedly resizing the canvas. Camera motion targets 60 fps. The isolated flow preview includes an explicit shop-motion case for testing on hosts with reduced motion enabled; production continues respecting that preference.

The shop camera now uses a wider crop and caps its push-in at 1.6× the normal camp scale. On exit, the shop panel follows the camera crop edge and fades near the end, avoiding an exposed blank band between the returning scenery and camp controls.

As of v0.0.28, the camera is pulled back about 28% to show more of the caravan around the merchant while retaining the same shop split.

As of v0.0.29, closing the shop fades the counter away while the merchant camera eases back to the original camp framing over 440 ms. Camp controls stay blocked until the transition finishes. Closing during the entrance reverses from the current camera position; purchase refreshes still skip the exit. Reduced-motion mode closes immediately.

Opening the shop eases into a close-up of the animated merchant, shelves and counter. Portrait gives the merchant one-third of the screen and the shop two-thirds; landscape uses a roughly 38/62 side-by-side split. The close-up samples the live caravan canvas, with distinct framing for the starter and expanded wagon, while the underlying camp keeps its original geometry. Purchase/stock refresh responses keep the camera in place. Reduced-motion users get the close-up without the entrance zoom. The buy control sits toward the bottom of the available item area; compact screens scroll longer descriptions.

## Rotation and fixed camp framing — v0.0.26

The shop fits over the existing preparation area without changing camp dimensions, caravan scale or scenery framing. Portrait gameplay uses 7×7 and landscape uses 10×5, including after rotation and recovery. Board reflow waits for swaps, cascades, targeting, chests, tutorials and boss challenges to finish. It preserves the tile bag, retains the 50th tile in reserve in portrait, and creates no automatic matches or rewards. Both arrangements are cached in the checkpoint; rotating back without playing restores the exact previous cells. After a move, the alternate arrangement is rebuilt deterministically from the remaining tiles, without RNG. Legacy portrait saves receive one deterministic common reserve tile on their first expansion.

## Compact camp shop — v0.0.25

The item shop replaces the preparation area with a bottom counter in portrait and a narrow right-hand counter in landscape. Camp stays bright and animated. Players select an offer from the stock strip to read its effect and buy it; longer details scroll without enlarging the panel. Pack contents, gems, stock refresh and merchant responses remain available. Background controls are inactive while shopping. As of v0.0.26, opening and closing the counter leave camp framing unchanged.

## NPC service responses — v0.0.24

Successful purchases, paid stock refreshes, sword/staff upgrades, recruitment, quest acceptance and reward collection trigger short NPC responses with no immediate line repeats. Shops and quest panels display the response inline; recruitment and upgrades use camp speech bubbles once the scene is available. Bubbles now have rounded corners, retaining cream paper and bronze borders.

## Dialogue appearance — v0.0.23

Camp speech bubbles use cream paper, dark ink, a stepped bronze frame and a contrasting speaker nameplate. Intro controls use cream and plum. Intro and idle exchanges share the same styling and tap-to-advance behavior.

## Boss framing — v0.0.22

During boss challenges, portrait mode hides the quest line and compacts the footer to 94 px, moving the fight and arena 46 px lower while retaining the inventory and effect badges. The player is 20% larger and the boss 8% larger during challenges. Malgrim's return-fire timing cue lives in the lower playfield; duplicate guard and projectile circles have been removed from the runner scene. Normal framing returns after the challenge.

## Chest interaction — v0.0.20

An affordable chest automatically enlarges into the middle of the screen, then waits for the player to tap it, with a "Tap to open" prompt (v0.0.21). Combat, puzzle input and item timers pause while waiting. Keys (or Spare Key charges) are spent and loot is rolled only after the tap. Reloading restores the closed chest; locked chests still pass by when no key is available.

## Active item effects — v0.0.16

As of v0.0.19, the portrait footer groups quest progress, compact effect badges and a full-width inventory row in 140 px. The remaining height goes to the fight scene. The Hint button has been removed in both orientations; the keyboard shortcut and automatic idle hint remain.

Compact icon badges sit above the inventory in portrait and below quests in the landscape sidebar. As of v0.0.17, badges show only the icon plus seconds, charge count, or an active checkmark; full names and descriptions remain in hover text and accessible labels. The portrait row scrolls when needed, while landscape badges wrap. Timed effects show remaining combat seconds (muted when paused); Boss Armor persists for the run. Revive readiness and the shared guard pool are also visible. The readout follows actual run/checkpoint state, clears spent effects, and hides during chest reveals, menus, tutorials and results.

## Caravan story and idle dialogue — v0.0.13

- First arrival: the original player sprite walks in from the left, stops beside the cart, and talks with the guide. The provisional story is a search for his abducted wife and son. Clearing the road earns a place with the caravan and help with the search. Eight short, manually advanced lines; always skippable. No run starts automatically.
- Intro dialogue appears in speech bubbles above the speaker, with Continue/Skip controls in the preparation area. Idle chatter uses the same anchored bubbles. The new `caravanIntroSeen` save flag is independent of the retired camp intro; existing saves see the new scene once. Completing or skipping saves it; `?intro` replays it for development.
- 37 idle conversations: solo remarks, two-person exchanges, and ensemble chats. The guide is practical and welcoming; the merchant is dry and careful with supplies; Wren is blunt and quietly caring; Aldwin is curious and absent-minded. The player is tired but willing to help.
- Only recruited, visible crew can speak. Location-specific exchanges require the current biome. Chatter begins after 16–26 idle seconds, with 35–60 seconds of quiet after each exchange; interaction delays it, and shops, menus, departure and hidden tabs suppress it. Recent conversations are avoided. As of v0.0.14, clicking or tapping a speech bubble advances its next line (keyboard Enter/Space also works). Idle chatter still advances automatically if left alone; intro dialogue waits for input.

## Camp interaction polish — v0.0.12

Camp animations play on entry, with a pause/play control in the header. Hovering or keyboard-focusing an NPC area adds a soft warm glow and reveals its label; pressing the area gives the same feedback on touch screens.

## Opening-loop tuning — v0.0.11

This section supersedes the older tuning figures below.

- The first three plains encounters are two slimes and a boar. Their base attack interval is 6 seconds; later encounters use 4.8 seconds, adjusted by creature type. Each new enemy gets a full interval. Plains scroll pressure ramps from 0.012/sec to 0.017/sec by depth 6.
- Enemy names, HP and situational advice use screen-sized text. Ordinary enemies no longer show the generic swords/staves damage hint or its background strip; resistance, higher guard costs and danger cues still appear when relevant. Attacks use animation cues without a countdown. Boss stages flow automatically with the existing arena cues and no instruction popup; regular shields do not prevent boss damage.
- Forge setup costs **20 wood + 20 ore** and includes **sword level 1** (a basic sword match goes from 5 to 10 damage before defenses). Existing hired smiths with level 0 receive level 1. Later forge costs and zone caps are unchanged.
- Wood and ore spawn weights are **12 each**, against sword 36 and staff/shield/key/gem 18 each; potion remains 1. Every chest guarantees a **6–8 wood or ore** pull, in addition to the existing item guarantee when inventory has room.
- Shop prices are **6 / 12 / 24 gems** for common/uncommon/rare. Before reaching depth 10, stock includes a Shield Potion and Safety Bell. The camp displays the next upgrade, material shortfall, readiness and a direct link to the service.
- Forest opens with ward slime → Sporecap → Watcher. As of v0.0.33, root patches replace spore buildup as the forest mechanic. Forest attack-power growth is 0.007 per depth.
- The board remains 7×7 or 10×5 according to the orientation when the run starts. Rotation and recovery preserve its tiles and shape.

Validation: `node tests/gameplay-balance.mjs` exercises actual board/combat rules with 60 seeds per configuration. A greedy bot taking 4 seconds per move reached the first boss in 21/60 portrait and 23/60 landscape runs at sword level 0, versus 54/60 and 53/60 at level 1. Mean material earnings were roughly 15 wood and 15 ore per attempt. These probes exclude boss performance and active item use; they are tuning evidence, **not human completion-rate or session-length estimates**. Human testing of the full opening 15–20 minutes remains the next balance check.

**Version:** 1.0 (living document) · **Status:** playable core loop + meta progression shipped · **Engine:** Phaser 3 + TypeScript + Vite
**Live build:** https://cosmonautjoe.github.io/matchBlade/ · **Repo:** github.com/cosmonautJoe/matchBlade

> This is the complete, authoritative design reference. The companion `DESIGN.md`
> is the running dev-log (decisions + "SHIPPED" notes as they land); this GDD is
> the organized full-feature picture. Where they disagree, code wins — this doc
> was reconciled against the source (`src/*.ts`) at v1.0.
>
> **Origin & originality:** matchBlade is inspired by the *genre* of
> *10000000* (EightyEight Games) — a match-3 dungeon runner. All art, code,
> content, characters, and systems here are our own; no assets are copied.

---

## Table of Contents

1. [High Concept](#1-high-concept)
2. [Design Pillars](#2-design-pillars)
3. [The Core Loop](#3-the-core-loop)
4. [The Match Board](#4-the-match-board)
5. [The Runner Lane & Combat](#5-the-runner-lane--combat)
6. [Bosses — Malgrim the Cindermage](#6-bosses--malgrim-the-cindermage)
7. [Chests — The Dopamine Blast](#7-chests--the-dopamine-blast)
8. [Item Slots](#8-item-slots)
9. [Worlds & Biomes](#9-worlds--biomes)
10. [HUD & UI](#10-hud--ui)
11. [Meta Progression — The Caravan](#11-meta-progression--the-caravan)
12. [First-Run Tutorial](#12-first-run-tutorial)
13. [Audio](#13-audio)
14. [Art & Assets](#14-art--assets)
15. [Technical Architecture](#15-technical-architecture)
16. [Deployment](#16-deployment)
17. [Tuning Reference](#17-tuning-reference)
18. [Roadmap](#18-roadmap)

---

## 1. High Concept

**matchBlade** is a **match-3 dungeon runner**. You are the **scout for a
travelling caravan**, running ahead through the wilds to clear the road. Your
hero auto-advances along a side-scrolling lane at the top of the screen; you
fight, defend, loot, and gather entirely by playing a **swap match-3 board**
below. The world scrolls constantly, dragging the hero toward a death-marker on
the left — good matches push forward, bad play falls behind. Resources you haul
home fund a persistent **caravan camp**, where you rescue/hire craftspeople,
forge upgrades, and swear quests that open the road to the next biome.

**Platform:** web-first (browser, itch.io, your own site), with a Capacitor path
to iOS. Built for **portrait-tolerant landscape** on phone, tablet, and desktop.

**One-line pitch:** *Bejeweled swaps drive a Vampire-Survivors-juicy dungeon run,
and every run feeds a growing caravan that marches across the world.*

---

## 2. Design Pillars

1. **Every match is a verb.** Tiles aren't points — they're actions (attack,
   defend, unlock, gather). The board is a control panel for the lane.
2. **One clear pressure.** A single value — *pressure* — is the whole fail state.
   The hero's distance from the skull IS the health bar. No hidden systems.
3. **Juice sells the hit.** Shatter shards, combo hitstop, floating numbers,
   screen shake, and the full chest "takeover" make small wins feel big.
4. **Runs are disposable; the caravan is forever.** Death is cheap and fast; the
   meta layer (resources, recruits, forge, quests, biomes) is the real progress.
5. **Visible progression.** Progress you can *see* — a growing camp, a hired
   blacksmith walking out of her tent, the road opening to a new world.
6. **Phone-native.** Big tiles, drag-to-swap, safe-area aware, haptics where the
   platform allows.

---

## 3. The Core Loop

Three nested loops:

**Moment-to-moment (seconds):**
> read the board → drag a swap → matches resolve → tiles act on the lane
> (damage / block / loot / gather) → cascade juice → repeat.

**The run (2–5 minutes):**
> fight a rising line of enemies → every 3rd kill a **chest** becomes due (spend
> a banked key to pop it; a full item pack defers it) → every 10th foe is a
> **boss** → *pressure* creeps up the
> whole time → you die when it hits 1.0 → the run's haul banks to the caravan.

**The meta (many runs):**
> bank wood/ore/treasure → at **camp**: hire Wren the blacksmith, **forge** sword
> upgrades, **swear quests** from the Wayfarer → clear a biome's whole quest pool
> → **the road opens** → travel to the next biome → repeat until the caravan
> completes the journey (win), then endless.

---

## 4. The Match Board

Pure logic lives in **`src/board.ts`** (framework-agnostic); the animated layer
is in `src/main.ts` (`GameScene`).

### 4.1 Dimensions & tiles
- **Grid:** `W = 10` columns × `H = 5` rows (landscape board). `EMPTY = -1`.
- **8 tile types** (`TYPES = 8` — the 7 matchables plus the RARE potion, id 7,
  ~1/121 spawns: **tapped in place, not matched** → `POTION_GROUND = 0.12`
  pressure regained + `POTION_GUARD = 0.1` block; face composited at runtime
  from the treasure frame until real art lands), rendered as custom **84×84 ironbound pixel-art
  faces** loaded from `public/tiles/`:

| id | tile | visual | effect (context-sensitive) |
|----|----------|----|------------------------------------------------------|
| 0 | sword | crossed steel swords | melee attack on the current foe |
| 1 | staff | crooked crystal staff | magic attack (folds into the swing; standalone if no swords) |
| 2 | shield | blue kite shield | adds **block** that soaks the next enemy strike |
| 3 | key | ornate gold key | **banks** a key (per-run) → pops chests / frees cages |
| 4 | treasure | faceted cyan diamond | diamonds — banked currency (premium/quests/boss bounty) |
| 5 | wood | bound timber bundle | crafting resource, banked to the caravan |
| 6 | ore | jagged steel crystals | crafting resource, banked to the caravan |

### 4.2 Spawn weights (the economy dial)
Tiles do **not** spawn uniformly. `SPAWN_WEIGHTS = [4, 2, 2, 2, 2, 1, 1]` (sword,
staff, shield, key, treasure, wood, ore) — swords drop ~2× a baseline tile and
raw resources ~½, so the board leans toward **fighting over stockpiling**.
`randomType()` samples this; `makeInitialGrid()` guarantees no pre-existing match.

### 4.3 Input — swap (Bejeweled/Candy-Crush style)
- **Drag a tile onto an orthogonally-adjacent neighbour** to swap them.
- The swap **only sticks if it creates a match**; otherwise both tiles animate
  back and a "nope" `swap` sfx plays. (`swap` / `swapMakesMatch` in board.ts;
  animated `trySwap` in main.ts.)
- Taps under 12px are ignored; dominant axis (dx vs dy) picks the target cell.
- Input is blocked while `busy`, `run.over`, a chest is active, or the tutorial
  locks the board.

### 4.4 Resolution — cascade
`findMatches()` returns every horizontal/vertical run of 3+. On a valid swap the
scene loops: **find → count cleared per type → shatter tiles → `applyMatches()`
→ drive the lane → collapse (gravity) → refill from top → repeat until stable.**
- **Collapse/refill:** per-column compaction; new `randomType()` tiles tween in
  from above (140ms). Headless equivalent: `collapseAndRefill()`.
- **Deadlock guard:** after settling, if `!hasPossibleMove()` the board is
  destroyed and rebuilt from a fresh no-match grid (`rebuildBoard`).
- **Longer matches read as combos:** a 3-match is one solid hit; extra swords add
  small follow-up swings (see §5.3). Cascades stack a **combo counter** with
  escalating callouts and hitstop.

### 4.5 Board juice
- **Shatter shards:** each cleared tile bursts into pre-baked, per-type crack
  triangles (`SHARD_PATTERNS = 3` patterns/type, clipped canvas textures) that
  tumble with gravity (`1500`), an upward pop, rotation, and a fade tail
  (0.8–1.2s life). A pooled fragment system (`frags[]`).
- **Combo hitstop:** at cascade depth ≥ 2, a `COMBO ×N` callout, a beat of delay,
  then camera shake + a white board flash.
- **Floating damage numbers:** `-N` pops over the enemy per swing (big vs small
  styling), rises and fades.
- **Haptics:** short `buzz()` on matches (14ms normal / 22ms deep cascade) where
  the Vibration API exists (Android/desktop; iOS Safari has none — Capacitor
  would supply native haptics later).

---

## 5. The Runner Lane & Combat

Pure combat state lives in **`src/run.ts`** (`RunState`, no Phaser); the scene
renders + drives it. This is the DESIGN §4 loop expressed as **one fail value**.

### 5.1 Actors
- **Hero:** the Soldier/Warrior (`warrior.png`, 80×64), `HERO_SCALE = 3.8`.
  Marches in at run start, then his screen-x is driven purely by *pressure*.
- **Enemies:** a **zone-aware bestiary** (`makeEnemy(killed, biome)` in run.ts;
  `CREATURE_RIG` dresses each in main.ts). Every road fields its own roster,
  still depth-gated (early / mid / deep tiers), with **slimes anchoring both**:
  - **Plains:** green slime, **boar** (fast charger — 0.55× HP, strikes ~2×
    faster, no defense), blue slime (ward), **goblin** (ward, 0.85× HP).
  - **Forest:** green slime, **mushroom** (hide, 1.25× HP, slow), dark slime
    (hide), blue slime (ward).
  - **Snow (Glacial Pass):** **frost skeleton** (hide) and **ice elemental**
    (ward, hovers) — no slimes survive the pass. The two opposite defenses force
    the player to switch damage schools inside one zone.
  - Snow art is generated, not bought: `scripts/gen_frost_skeleton.py` palette-
    swaps the skeleton into ice (the same technique behind the slime variants),
    and `scripts/gen_ice_elemental.py` draws an ORIGINAL crystal creature
    (faceted core, orbiting shards, frost mist) across all five states.
  Per-creature knobs: `VARIANT_HP_MULT`, `VARIANT_STRIKE_MULT` (the foe's own
  `strikeMult` scales the scene's strike cadence). Art: slimes are a full
  idle/walk/hurt/death pack; the **boar** ships idle/run/hit (death faked as a
  topple); the **goblin/mushroom** ship an attack sheet only — idle holds frame 0
  with a breathing scale-bob, death is a fake topple+fade. `SLIME_SCALE = 2.7`.
- **Skull ☠** at the far left (`SKULL_X`) — the death line.

### 5.2 The single fail axis — *pressure* ∈ [0, 1]
- **Rises** with time (constant scroll) and with unblocked enemy strikes.
- **Falls** when you kill an enemy (the hero surges forward).
- **`heroXForPressure()`** = `lerp(SAFE_X, SKULL_X, pressure)` — the hero's
  distance from the skull *is* the health bar (no separate pressure meter).
- **Reaches 1.0 → run over.** Constant scroll: `SCROLL_PER_SEC = 0.02` (applied
  only during a fight, `phase === "fight"`). The world pans at `WORLD_SCROLL =
  170 px/s` while the hero jogs between foes and holds still in a fight.

### 5.3 Combat math (all knobs in `run.ts`)
Applied in `applyMatches(run, counts)` per resolved cascade:

- **Sword damage splits into swings** so a big match reads as a combo:
  `swordHits(n)` → 3 swords = `[5]`, 4 = `[5, 2]`, 5+ = `[5, 2, 2]`
  (`SWORD_MAIN = 5`, `SWORD_EXTRA = 2`, capped at 2 follow-ups). **Total damage
  per match: 5 / 7 / 9** for 3 / 4 / 5+.
- **Forge bonus**: each forge level adds **+5 first-strike damage**
  (`SWORD_BONUS_PER_LEVEL`). At the zone's **forge cap** the blade **SUNDERS**:
  any sword match fells a non-boss foe in one stroke, iron hide included
  (`sunderEdge` in run.ts; "SUNDER!" chip in the lane). Bosses are arena
  fights — the board retracts — so steel never reaches them anyway.
- **Staff** matches CAST: a fireball flies from the hero and everything lands on
  impact — **Firebolt (3) 9 dmg / Fireball (4) 14 / Pyroclasm (5+) 20** (+3 per
  tile beyond 5; a Pyroclasm also sets the foe burning). `SPELL_DMG` in run.ts.
- **Enemy defenses** (rolled with the variant in `makeEnemy`): **iron hide**
  (dark slime — swords ×0.5, spells ×1.5) vs **spell ward** (blue slime and
  Malgrim — spells ×0.5, swords ×1.5); green slimes are plain. `RESIST_MULT`
  0.5 / `WEAK_MULT` 1.5; badge 🛡⚔ / 🛡🪄 by the HP bar; gray "resisted" and
  gold "WEAK!" numbers + a first-hit callout teach the rule.
- **Shields** bank guard CHARGES per MATCH, rewarding the long swap: 3 tiles →
  1 charge, then +1 per extra tile (4→2, 5→3, 6→4…). But deep foes hit harder than
  one shield can turn: a strike costs `guardCost(killed)` charges — 1 early,
  **2 from depth 8, 3 from depth 16** (the HUD floats `-N🛡` when a block eats
  more than one). Pay in full and the blow is turned + the foe shoved back
  (`BLOCK_PUSHBACK = 0.05`); pay short and the uncovered share lands.
- **Kill surge:** `ADVANCE_PER_KILL = 0.3` pressure removed (hero lunges
  forward), +100 score, then the next enemy spawns.
- **Scoring:** resources ×2, damage ×5, +100 per kill (+400 per boss).

### 5.4 Enemy scaling & strikes
- **HP:** `ENEMY_BASE_HP = 9 + kills × ENEMY_HP_GROWTH(3)` — base foe dies to
  ~one strong combo; scales each kill.
- **Power:** `ENEMY_BASE_POWER = 0.075 + kills × ENEMY_POWER_GROWTH(0.015)`.
- **Strikes** fire on a `STRIKE_MS = 4800ms` cadence, scaled by the foe's
  `strikeMult` (boars ~2× faster) and Scout's Spurs: `enemyStrike()` — block
  soaks first, remainder shoves pressure; on a soaked hit a `block1/2/3` clang
  plays; on net damage, camera shake + a red hero tint.
- **Weapon→animation:** 3-match `hero-attack`, 4 adds `hero-attack2`, 5+ adds
  `hero-attack3`; a cascade's 2nd sword hit fires `hero-spell` (blue sword);
  staff-only = a basic swing. On kill the hero freezes x, plays the full combo in
  place, then surges. (Weapon-vs-enemy-*type* gating — sword=ground, staff=flying
  — is designed but not yet enforced; currently all damage applies.)

---

## 6. Bosses — Malgrim the Cindermage

Every **`BOSS_EVERY = 10`th** foe is **MALGRIM THE CINDERMAGE** (Evil Wizard
pack, CC0, 150×150, flipped to face left).

- **Entrance:** `summon` sting + haptic; the lane **darkens** (a veil); Malgrim
  walks in over ~2.1s; an **ember-gradient name banner** flies in and floats out;
  a **wide named bar** (`☠ MALGRIM THE CINDERMAGE · 🛡🪄`) fills up dramatically.
- **The fight is a MODE BREAK — Malgrim's Infernal Shell Game** (phase
  `"arena"`: scroll stops, strikes stop, the puzzle board retracts and burning
  portals rise in its place). He hides among fiery decoys; **tap the REAL one**
  (brief **cyan staff glint**; decoys burn red) before he casts. A correct tap
  = the hero lunges and cracks his wards; a decoy tap or timeout fires a
  **fireball** — one **guard charge** turns it (the puzzle phase's shields
  matter here), otherwise the hero slides toward the skull.
  **Three wards, TWO deals each, and every ward is its own game**
  (`ARENA_WARDS` in main.ts): **I FIND HIM** (spot the glint among red decoys),
  **II TRACK HIM** (he glints, then everyone **cloaks identical and shuffles**
  — follow him through the swaps), **III RETURN HIS FIRE** (fireball tennis:
  he serves from the far court with a **shrinking timing ring**; tap — anywhere,
  the screen is the racket — as the ball meets the cyan guard ring to reflect
  it into him. Whiffs lock the swing `TENNIS_WHIFF_LOCK_MS` so mashing loses,
  his wind-ups sometimes throw **nothing**, and the **violet ball is a lie**
  that passes harmlessly unless you swing at it. **Three returns** break the
  final ward, each rally faster). Wards I/II: his cast is a **visible ember bar**
  whose last 32% burns red (`ARENA_CRIT_FRAC=0.68`): a hit in the red
  **shatters the whole ward at once** — the daring end the fight early. The
  boss bar is the ward meter (drains per deal of `ARENA_TOTAL_DEALS`); a
  **flawless ward refunds +1 guard charge** ("your poise holds"), and Malgrim
  taunts between wards. After the third ward: he staggers back into the lane,
  exposed — **one tap delivers the finishing dash-strike**. Misses re-deal;
  the only clock is your own pressure. Hearth revive resumes mid-arena.
- **Death — the spoils:** flash + camera quake + a **coin/spark eruption**,
  `"CINDERMAGE FELLED!"`, **`BOSS_BOUNTY = 8` treasure**, +400 score, an extra
  **`BOSS_SURGE = 0.2`** pressure relief on top of the kill surge, and a
  **guaranteed chest** becomes due next (and waits if the item pack is full).
- **Dev:** `__mb.debugBoss()` rigs the next foe as the boss.

### 6b. The boss grammar — three colours, one rule

Every warden speaks the same vocabulary, so what you learn in the plains still
reads in the pass. The fights differ in theme and staging, never in language —
the Undertale trick, where **colour IS the rule**.

| | | |
|---|---|---|
| **GOLD ●** | **tap it** | a strike, committed at an instant |
| **BLUE ╱** | **cut it** | swipe across it, the way its arrow points |
| **RED ✖** | **never touch it** | a lie among the gold (touching burns), or a hazard sweeping at you (get clear) |

Red covers both cases deliberately, so it never needs re-teaching: stationary
red is a trap, moving red is an attack, and both resolve to *no contact*.

**A warden's blow pierces the guard** (`pierceStrike` in run.ts). Shields are for
the road; his power lands in full and the guard pool is never spent or consulted.
While guard absorbed arena hits, a player who banked shields on the board could
eat every colour mistake for free and the rules carried no stakes. A miss costs
one blow, a RED violation costs two — plus a longer lockout and a heavier shove.
The HUD floats a PIERCED chip whenever you still hold guard, so the untouched
counter never reads as a bug. Dial with `ARENA_PIERCE_MULT`.

**A warden's blow pierces the guard** (`pierceStrike` in run.ts). Shields are for
the road; his power lands in full and the guard pool is never spent or consulted.
While guard absorbed arena hits, a player who banked shields on the board could
eat every colour mistake for free and the rules carried no stakes. A miss costs
one blow, a RED violation costs two — plus a longer lockout and a heavier shove.
The HUD floats a **🛡 PIERCED** chip whenever you still hold guard, so the
untouched counter never reads as a bug. Dial with `ARENA_PIERCE_MULT`.

**Gold and blue are both committed at an instant** — that is the load-bearing
decision. An earlier pass made blue a press-and-hold, and every blue stage died
the same death: holding is *passive* (the only skill is choosing when to stop),
your finger parks on top of the thing you are meant to be watching, and three
different bosses ended up running the same "hold it, wait, let go" puzzle. A
directional cut keeps the timing commitment that makes the good stages good and
adds a second axis — direction — to read under pressure.

Shared parts in `main.ts`: `G_GOLD/G_BLUE/G_RED`, `grammarLegend()` (the key,
drawn in every arena), `goldNode()`, `redNode()`, `swipeNode()`, and one
`installSwipeReader()` that judges every drag against the live cut targets
(`SWIPE_MIN` distance, `SWIPE_TOL` degrees of slop). `BOSS_STAGES` holds each
warden's three stage cards.

**No stage is a memory test, and no stage is a hold.** Everything is reaction,
timing or nerve — the Simon-style labyrinth, the rule-recall sigils, and all
four hold stages were cut for exactly this reason.

**The reference stage is THE FROZEN HEART** (Rime III): continuous motion, a
readable window, one precise instant, escalating without changing its rule.
When a stage isn't working, that's the shape to move it toward.

### 6c. One warden per road

The boss is chosen by biome (`BOSS_DEFS` + `BOSS_FOR_BIOME`). A `BossDef` carries
the lane dressing — sheet prefix, scale, measured foot fraction (printed by
`scripts/gen_bosses.py`), engage gap, name-banner gradient, veil colour — plus
`steps`, the beats its arena is worth for the boss bar. **Only the current road's
boss sheets preload.** The entrance, named bar, exposed-then-execute finish,
spoils, flawless +1 guard refund and hearth-revive are all shared.

| | Malgrim (forest/deep) | Gorrach (plains) | Warden (snow) |
|---|---|---|---|
| **I** | **THE EMBER COURT** — his images flare and fade; tap the GOLD, the RED ones burn | **THE CHARGE** — the RED path is the trampling; leap clear, then tap the GOLD gore-point on his flank | **BREAK THE ICE** — GOLD plates tap (×3), BLUE plates cut along the grain, RED plates bite |
| **II** | **THE EMBER FALL** — fire rains four channels: tap GOLD, cut BLUE along its arrow, let RED land | **TURN HIS AXE** — a parry duel: cut BLUE aside, tap GOLD to counter, and let a RED feint go by | **THE WHITEOUT** — drag your scout clear of RED icicle columns and tap the GOLD warmth |
| **III** | **RETURN HIS FIRE** — GOLD reflects at your guard, RED is the lie that only hurts if you swing at it | **LOCK HORNS** — tap as the needle crosses GOLD, avoid RED; five shoves with narrowing, drifting zones | **THE FROZEN HEART** — RED shards ring the GOLD core; strike only as the gap crosses your blade-line |

Stage III of Malgrim's fight is the template the rest were built from — it was
already "strike this, never that", it just wasn't speaking the language yet
(the old violet lie is now simply RED).

The WHITEOUT is the one stage with **no blue**, on purpose: moving the scout is
itself a drag, so a cut there would fight the dodging for the same gesture.

Tuning knobs: `GORE_CHARGES` / `HORNS_*`, `RIME_*`, `HEART_*`, `TENNIS_*`,
`SWIPE_MIN` / `SWIPE_TOL`. Art baked by `scripts/gen_bosses.py`.

---

## 7. Chests — The Dopamine Blast

A chest becomes due **every `CHEST_EVERY = 3`rd kill** (and immediately after a
boss). At most one due chest waits while all 6 item slots are occupied; once the
player uses an item, it arrives after the next fight. Opening it is a
**Vampire-Survivors-style full-screen takeover**, not floating text. Costs **1
banked key** (`CHEST_KEY_COST = 1`).

**Sequence (`openChest`, skippable by tapping — `chestFast` collapses timings):**
1. **Key gate** — hero jogs up; if no key, `🔒 need a key!` rattle and it slides
   past. With a key, the banked key **flies from the HUD into the lock**.
2. **Veil & center-stage** — the middle of the screen dims; the chest scales up
   to center, a glowing seam pulses (ADD blend).
3. **Anticipation** — 3 rattles with muffled jingles, then a silent beat.
4. **POP** — switch to the open texture, white flash, camera shake, `chest_creak`
   + `coin_pour`, two rotating **god rays**, coin + spark particle bursts,
   `"TREASURE!"` title, coins erupting with physics (gravity 1150).
5. **Reveal one at a time** — each pull rises on an orb with an **escalating
   sting** (`combo2..combo6`); slot-machine tension because the count is hidden.
   Pull table: **2 guaranteed** + diminishing "one more!" rolls (0.6 / 0.32 /
   0.16). Every opened chest reserves **at least one run item and one resource**.
   Each remaining pull has a **14% bonus-item chance** while another slot is
   free; otherwise it is treasure (2–4), wood (4–8), or ore (4–8). Resources
   reveal first and all item pulls land **last**. A due chest waits behind
   the next fight while all 6 item slots are full, preserving the guarantee.
6. **Cash out** — each reward zips to its HUD counter/slot, values tick up with
   coin sfx, a final `pouch`; the world resumes.

- **Dev:** `__mb.debugChest()` grants a key and forces the next eligible chest;
  a full item pack still defers it.

**Cages (designed, next up):** the same walk-in + key-gate reused for **caged
recruits** — match keys under scroll pressure to free a craftsperson before they
scroll past.

---

## 8. Run Items (the 6 HUD slots)

**16 one-shot run items** (`src/items.ts` registry + scene wiring in `main.ts`),
earned from chest item-pulls into the **`SLOT_N = 6`** right-panel slots. Tap a
filled slot to use it (the Hearth Charm instead fires automatically on death);
**hover (mouse)** or **press-and-hold
380ms (touch)** shows a **tooltip** (name, tier tag, description, usage hint).
Aimed items enter a **targeting mode** (gold board ring + banner; tap a tile to
fire, tap elsewhere to cancel — the item is only consumed when the shot lands).
A live **buff readout** under the quests shows charges/timers (`🗡️×2 📯9s …`).

| tier | items |
|---|---|
| **common** | Wren's Whetstone 🗡️ (next 3 sword matches = full 5-match combos) · War Horn 📯 (2× kill-surge 15s) · Bulwark Brew 🧪 (+6 shields of guard) · Scout's Spurs 🥾 (foe strikes slow to 7s until it falls) · Vagrant's Dice 🎲 (reroll the board) |
| **uncommon** | Waystone 🗿 (freeze scroll 12s) · Sapper's Charge 💣 (aim: 3×3 blast, destroyed tiles count as matched) · Lodestone 🧲 (bank every wood/ore tile) · Skeleton Key 🗝️ (next chest opens free) · Prospector's Pan ⛏️ (next chest +2 pulls) · Merchant's Ledger 📒 (2× resource matches 20s) · **Cinder Flask 🔥** *(boss hoard only: foe burns 2/sec for 10s)* |
| **rare** | Stormcall Scroll 📜 (instant 25-dmg spell blast) · Chromatic Prism 🔮 (aim: every tile of a kind → swords) · Hearth Charm ❤️ (**auto**: on death it burns instead — once — pressure resets to 0.5) |

- **Roll:** every chest has one guaranteed item; additional pulls retain a 14%
  item chance. Regular items draw tier `60/30/10`%; the **boss hoard** chest
  draws `25/45/30` and is the only source of boss trophies.
- Effects hook the pure layer via `RunState.whetstone / surgeMult / resMult` and
  a shared `dealDamage()` (items, burns, and matches all kill through one path,
  so surge/score/kill flow stays consistent).

---

## 9. Worlds & Biomes

The caravan marches through a series of biomes; each redresses both the **run**
(`RUN_BIOMES` in main.ts) and the **camp** (`CAMP_BIOMES` in camp.ts), routed off
`meta.biome`. Shipped biomes: **plains** (`grass`), **forest**, **snow**
(vnitti *Glacial Mountains* parallax + GandalfHardcore Floor Tiles2 winter band;
the lane always snows there, rails wear icicles/drifts, forgeCap 9), and
**dungeon** (100% ORIGINAL generated art — `scripts/gen_dungeon.py` bakes the
torchlit brick wall / stone colonnade / pillar+chain layers and the flagstone
floor; Mysterious Dungeon music bed, no weather, chains/rubble rails with dust
and embers, forgeCap 12).

### 9.1 Run parallax (back → front, with scroll factor)
- **Plains:** `sky` (0.04) · `clouds-mid` (0.1) · `mtn-far` (0.16) · `mtn` (0.3)
  · `clouds-front` (0.24) · `hill` (0.5); ground cropped from the grass floor
  atlas. (vnitti *Grassy-Mountains* pack.)
- **Forest:** `plx1` (0.03) · `plx2` (0.08) · `plx3` (0.16) · `plx4` (0.3) ·
  `plx5` (0.5); baked forest floor. Art in `public/worlds/forest/`.
- Each layer is a `TileSprite` scrolled by its depth factor every frame; the
  ground is a seamless cropped slice.

### 9.2 Weather
Rolled once per run — **`RAIN_CHANCE = 0.35`**:
- **Overcast wash** (cool tint over the backdrop) + **rain streaks** (a baked
  gradient raindrop, particle emitter with wind) in front of the actors.

### 9.3 Ambient soundscape
A looping bed under every run: **`amb_rain`** if rainy, else **`amb_day`**
(faded in over ~1.4s, stopped on scene exit). Camp adds fire crackle + night
crickets. (Loops are 40s mono MP3s cut from longer ambience WAVs, tail
cross-faded for seamlessness.)

---

## 10. HUD & UI

Responsive shell: the lane + board live in a centered "design box"; two side
panels flank it and absorb leftover width (no letterboxing).

- **Left panel:** resource rows (🪵 wood, 🪨 ore, 💎 treasure, 🔑 keys),
  `DEPTH {kills}` / `SCORE {n}`, **accepted-quest lines** with live progress
  (`✓`/`·` + short label + `have/need`, counting the run in progress), and a `⚙`
  gear — **TEMP: tapping it fires `debugCombo`**.
- **Right panel:** the 6 item slots.
- **Rotate hint:** `↻ rotate to landscape` shown in portrait.
- `refreshHud()` repaints resources / depth / score / quest lines each change.

---

## 11. Meta Progression — The Caravan

Everything that survives death lives in **`src/meta.ts`** (`MetaState`, saved to
`localStorage` under `matchblade-meta-v1`). The camp scene (`src/camp.ts`)
reads/writes it. **Runs are disposable; the caravan is the progress.**

### 11.1 Fantasy
You scout ahead of a travelling caravan. Each cleared run carves the road; the
caravan follows, biome by biome (**plains → forest → …**). Recruits are
**craftspeople, not combat buddies** — each adds a wagon and owns an upgrade
track.

### 11.2 Economy
- **Banked (persist):** wood, ore, treasure (💎). Lifetime `totalWood` /
  `totalOre` counters back "haul home" quests.
- **Per-run (do NOT bank):** keys — they're live tension for chests/cages.
- **`bankRun()`** folds a finished run into the bank + quest stats + `bestDepth`
  (depth = kills) on death.

### 11.3 The camp scene
A cozy, biome-dressed hub (`CampScene`, scene key `"camp"` — the game **boots
here**). Full-bleed parallax backdrop + a ground-anchored prop layer (baked from
an in-camp dev editor). Props: tents, crates, barrels, a **campfire** (animated +
glow), the **forge/furnace**, and the **portal** (the DEPART point). Fades in on
enter; departs by walking the hero into the portal (`scene.start("game")`).
- **DEV in-camp layout editor** (`✎ edit` / `📋 copy layout`): drag props,
  serialize positions to clipboard to bake in. `__mbCamp` global handle.

### 11.4 Wren the blacksmith (first recruit) + the Forge
- **Hidden** in the tarp tent behind a bobbing gold **"?"** until hired. Tapping
  the tent opens her dialogue; **hire cost `BLACKSMITH_COST = 30 wood + 30 ore`**
  (~2–3 good runs). On hire she **walks out of the tent to the forge** (2.6s) and
  joins the caravan.
- **The Forge** (tap Wren/furnace once hired): sells sword levels (**+5
  first-strike damage each**), capped per zone — **`forgeCap`: plains 3,
  forest 6**. At the cap the blade **sunders** (one sword match = one dead
  common foe) and the panel closes shop: "a harder land will ask for a harder
  edge." Cost curve **`forgeCost(level) = 20 + level × 15` ore** (20, 35, …).
  Forge quests measure the blade's absolute level (deltas break under caps).
### 11.4b Aldwin the Mage (second recruit) + the Study
- **The forge's mirror for magic**, found at the **FOREST camp onward**
  (`wizardAvailable(biome)`), so he starts a zone later than Wren. Unhired he
  waits under a violet **"?"**; hire cost **`WIZARD_COST = 40 wood + 40 ore +
  5 diamonds`** — a scholar's price in reagents *and* a focus-stone.
- **The Study** (tap Aldwin once hired): sells staff levels at **+4 damage on
  EVERY cast** (`SPELL_BONUS_PER_LEVEL`), folded into `raw` before the foe's
  ward multiplier — so it lifts Firebolt/Fireball/Pyroclasm *and* the Stormcall
  scroll. Cost **`studyCost(level) = 25 + level x 18`** ore (25, 43, 61 ...).
- **Capped per zone**, one tier behind the blade since he joins later —
  **`studyCap`: forest 3, snow 6, dungeon 9** (plains 0: he isn't there yet).
  At the cap the panel closes shop: *"the leylines here are spent."*
- Art: `scripts/gen_mage.py` recolours the Evil Wizard sheet (Malgrim's pack)
  from fire-red into arcane blue by HUE, keeping skin tones, so he reads as a
  scholar of the caravan rather than the boss who burns it.
- Same character budget as Wren: one sprite, a name, one line of dialogue.

- Sprites: `smith.png` (WarriorWoman sheet). One portrait, a name, one line of
  dialogue — the **character budget** (no dialogue trees; recruits never fight
  beside you — that's sequel scope).

### 11.5 The Wayfarer & the quest board
The **Wayfarer** (goddess sprite) stands by the road and offers quests. The
board is YMBAB-style with a twist:
- **She OFFERS from an ordered pool; the player ACCEPTS up to `MAX_ACTIVE = 3`.**
- **Progress counts from acceptance** — delta quests snapshot a baseline, so you
  can't retro-complete.
- **Kinds:** `delta` (stat now − at accept, e.g. slain/chests/wood/ore/swordLevel),
  `run-depth` (one run must reach a depth after accepting), `state` (a milestone
  flag, e.g. blacksmith hired).
- **Completing** frees a slot, pays **treasure**, and surfaces the next offers;
  accepted quests also show live in the **run HUD**.

**Plains pool (`PLAINS_QUESTS`, 10):**

| id | quest | reward |
|----|-------|:------:|
| slay25 | Slay 25 slimes | 10 |
| chests5 | Crack open 5 chests | 10 |
| wood60 | Haul 60 wood home | 10 |
| hire | Coax the blacksmith from her tent | 15 |
| depth10 | Reach depth 10 in one run | 15 |
| slay60 | Slay 60 more slimes | 15 |
| ore80 | Haul 80 ore home | 15 |
| forge2 | Have Wren forge 2 upgrades | 20 |
| chests12 | Crack open 12 more chests | 15 |
| depth16 | Reach depth 16 in one run | 25 |

**Forest pool (`FOREST_QUESTS`, 7):** slay 50 · open 10 chests · haul 120 wood ·
haul 120 ore · forest-peak blade · depth 18 · clear the road (rewards 20–45 —
the forest asks more of a seasoned scout).

### 11.5b The forest plan (designed, NOT yet built)
The forest inverts the plains' lesson — steel got you here, magic gets you
through:
- **Forest mobs are sword-resistant** (hide-heavy spawn pools / new variants):
  the sundering plains blade does NOT trivialize the new road, and staff
  matches become the damage school that matters.
- **The Wizard** — the forest's hireable recruit, mirroring Wren: found in
  camp, hired for banked resources, then sells **magic upgrades** (spell
  damage / cast tiers) with its own per-zone cap, the way the forge sells
  sword levels. Wren's forge cap rises to 6 in the forest (already wired),
  so both schools climb side by side.
- Same character budget as Wren: one sprite, a name, one line — no dialogue
  trees.

### 11.5c Per-biome camp layouts
The camp is no longer one static dressing reused everywhere — `CampLayout` holds
BOTH the prop list and the anchors for the folk (hero, smith, furnace, Aldwin,
Wayfarer, portal, Peddler), so each road pitches its camp differently:
- **Plains** — the original roadside pitch (unchanged).
- **Forest** — a woodcutters' clearing: the folk span **10..355** instead of the
  plains huddle at **85..300** (the forest gains Aldwin, so it needed the elbow
  room), and the dressing changes character — log piles and a cook pot instead
  of market crates, birches and cattails instead of verge tufts.
- Snow/dungeon fall back to the plains pitch until they're dressed.
- **Sizing note:** `tree1/2/3` are 256x208; anything over s~1.3 swallows the
  clearing, so big timber only frames the EDGES and the middle uses small props.
- Camps are FLAT (one ground line). A multi-floor/terraced variant was built and
  rejected — the stacked look fought the camp's readability.
- Wren's tarp tent travels with the caravan, so she still walks out of it to
  whichever forge the layout pitched.

### 11.6 Biomes & the road gate
- `BIOME_ORDER = [plains, forest, snow, dungeon]`; each biome has its own quest pool
  (`QUEST_POOLS`).
- **Clearing the *whole* current pool → `roadOpen()` true** → the Wayfarer's
  board shows a **"take the road onward"** button → `advanceBiome()` bumps the
  biome, clears active oaths, saves, and rebuilds the camp in the new world.
  (Hiring/forging alone does **not** advance — quests gate the road.)
- **TEMP debug:** tapping the camp biome tag cycles the biomes (remove before
  release).

### 11.5d The in-camp editor (dev only)
`✎ edit` in the camp (DEV builds) is a full layout tool — the camps are authored
in-game, then the copied JSON is baked into `CAMP_LAYOUTS`.
- **Drag anything**, props *and* the folk (hero, Wren, Aldwin, the Wayfarer, the
  Peddler, the forge, the portal) — NPCs register as `npc:` editables.
- **`＋ pieces`** opens the building set: every prop texture the camp preloads
  (32 pieces, animated ones included), tap to drop it in the middle of camp.
- **Floor slabs** (3 shades) build background terraces out of the biome's own
  ground. The tint fakes aerial perspective — the further back a shelf reads,
  the paler and cooler it gets. One vertical texture repeat spans each slab
  (`fitSlab`), or the grass lip stripes down the whole cliff.
- **Keys on the selection:** `[` `]` scale (or resize a slab; `shift` = height),
  `shift+[ ]` cycles a frame, `F` flips, `,` `.` depth, arrows nudge
  (`shift` = x10), `Del` removes.
- **`📋 copy layout`** emits `{ biome, anchors, slabs, props }` — exactly the
  shape `CampLayout` wants, so a paste can be baked in directly.
- Taps on the editor's own chrome never grab a prop underneath.

### 11.7 Win condition
The caravan **completes the journey** — clear the last biome, everyone home.
**Endless mode** unlocks after. (Difficulty curve per world is still open.)

---

## 12. First-Run Tutorial

An 8-step guided overlay (`src/tutorial.ts`) the first time the run scene opens
(gated on `meta.tutorialSeen`; `?tutorial` force-replays). A dim veil with a
spotlight **hole** + a gold ring, a copy **card** per beat, progress dots, and a
skip button. While active it **holds the run harmless** (`active` suppresses
scroll/strikes/chests; `lockBoard` locks input except during hands-on beats).

**Beats:** (0) the road ahead → (1) the board / how to swap → (2) **hands-on:
planted sword match** cuts the foe → (3) **scripted strike** shows knockback
toward the skull → (4) **hands-on: shield match** then a **scripted strike clangs
off the guard** (BLOCKED beat) → (5) keys open chests → (6) gather for the caravan
→ (7) go, scout.

Drives the game via a **host API** (`rigSwapMatch(type)`, `demoStrike(pierce)`,
lane/board/cell geometry, `resourceRowsRect`, `markTutorialSeen`), and listens on
`onCascade(counts)` / `onBoardSettled()`. Plants are re-planted if a cascade eats
them; scripted strikes retry until a foe is engaged (or narrate through).

---

## 13. Audio

All loaded in `preload` (guarded), master volume 0.7, via an `sfx()` helper.

- **Combat:** `swing1/2/3`, `hit1/2/3`, `spell`, `slimeatk`, `squish1/2`,
  `block1/2/3`, `death`.
- **Footsteps:** `step1..step5` (dirt cadence — swap per world later).
- **Tile matches:** `tile1..tile17` (random per non-combat clear, slight pitch
  variance).
- **Chest:** `chest_unlock`, `chest_creak`, `coin_pour`, `coin1/2/3`, `pouch`,
  `pickup`; reveal stings reuse `combo2..combo6`.
- **Boss:** `summon`, `fireball1/2/3`.
- **Ambient/weather:** `amb_day`, `amb_rain` (run); `camp_fire`, `amb_night`
  (camp).
- **Swap "nope":** `swap`.

---

## 14. Art & Assets

**Style:** 2D pixel-art. The board uses a custom **ironbound relic** tile set:
dark chipped frames, saturated type-colored inset panels, and silhouette-distinct
icons sized for the 84×84 gameplay face. A shared, staggered diagonal glint
occasionally sweeps individual tiles without synchronizing the whole board.

**Character sprite sheets** (`public/sprites/`):
- Hero — `warrior.png` (WarriorMan, 80×64). Anims: idle / walk / attack ×3 /
  spell / death.
- Enemies — `slime_*`, `slime2_*`, `slime3_*` (idle/run/hurt/death, 64×64).
- Boss — `boss_*` (Evil Wizard pack, **CC0**, 150×150; idle/move/attack/hurt/death).
- Wren — `smith.png` (WarriorWoman, 80×64). Wayfarer — `camp/goddess.png` (64×64,
  walk-only sheet → held frame + float).

**Backgrounds:** vnitti *Grassy-Mountains* (plains parallax), forest `plx1–5`,
floor atlases (GandalfHardcore) cropped per biome. Camp set-dressing (fire,
furnace, portal, torches/water staged for future biomes).

**Procedural (baked at runtime, no files):** shard crack textures (sampling the
PNG tile faces), raindrop, chest closed/open, god rays, coins, sparks, orbs,
cropped ground slices.

**Music:** xDeviruchi *8-bit Fantasy & Adventure* (**CC-BY 4.0** — credit
"xDeviruchi" in released builds). Source WAVs live in `assets/music/`
(gitignored); shipped as 160 kbps MP3s via `node scripts/encode-music.mjs`.
- `music_menu.mp3` (*A Great Journey — Overworld*; separate artist, confirm
  license/credit before commercial release) — title screen.
- `music_title.mp3` (*Title Theme*) — camp.
- `music_journey.mp3` (*And The Journey Begins*) — the run.
- `music_boss.mp3` (*Prepare for Battle!*) — boss approach through boss death.
- `music_dungeon.mp3` (*Mysterious Dungeon*) — the delve's road music.
Remaining pack tracks (Decisive Battle, Mysterious Dungeon, The Icy Cave…) are
on deck for future biomes/moments.

**Licensing note:** keep every pack CC0 / properly-licensed and original; the
boss pack is explicitly CC0, the music pack CC-BY 4.0 (attribution required).
(Confirm licenses before shipping commercially.)

---

## 15. Technical Architecture

**Stack:** Phaser 3 (`^3.87`) · TypeScript (strict) · Vite (`^6`).

**Module map:**
| file | role | deps |
|------|------|------|
| `board.ts` | pure match-3 grid logic (dims, spawn weights, find/swap/collapse) | none |
| `run.ts` | pure run/combat state (pressure, damage, enemies, bosses) | none |
| `meta.ts` | persistent progression (bank, recruits, forge, quests, biomes) | localStorage |
| `main.ts` | `GameScene` — board + lane + combat + chests + boss + HUD + worlds + tutorial host (~1950 lines) | all |
| `camp.ts` | `CampScene` — hub, Wren/forge, Wayfarer/quests, biome dressing, editor | meta |
| `tutorial.ts` | first-run guided overlay | — |

**Scene flow:** boots into **CampScene** → **DEPART** → **GameScene** → death →
back to camp (banks the run, pays quest rewards). Pure-logic modules
(`board`/`run`/`meta`) are engine-free and unit-testable; Phaser only renders.

**Persistence:** `MetaState` v1 in `localStorage` (`matchblade-meta-v1`), with a
safe default + merge on load (survives private-mode/no-storage).

**Mobile/responsive:** Phaser `Scale.RESIZE`; a `layout()` reflows lane/board/
panels each resize; CSS safe-area insets (`--sai-*`) read into layout for
notch/home-indicator; `refit` on `visualViewport` resize + `orientationchange`
(mobile toolbar show/hide); portrait shows a rotate hint. Haptics via Vibration
API where present.

**Dev hooks:** `window.__mb` (GameScene) + `window.__mbGame` (DEV); `__mb.debugBoss()`,
`__mb.debugChest()`, `__mb.debugCombo()` (also the `⚙` gear, TEMP); `?tutorial`
replay; `window.__mbCamp` + the in-camp layout editor; TEMP camp biome-flip tag.

---

## 16. Deployment

- **Build:** `npm run build` (tsc `--noEmit` + Vite) → static bundle in `dist/`.
  Bundle is Phaser-weight (~1.5 MB / ~340 KB gzip) — fine; code-split later if
  needed.
- **GitHub Pages:** `npm run deploy` (`scripts/deploy.mjs`) builds, then
  force-pushes `dist/` to the `gh-pages` branch (throwaway repo inside `dist/`,
  `.nojekyll`) → **https://cosmonautjoe.github.io/matchBlade/**. Auth via the
  machine's git credential helper (`gh`).
- **itch.io / your site:** upload `dist/` (itch hosts the folder; your site
  embeds or serves it).
- **iOS:** wrap `dist/` with **Capacitor** → native app (needs Apple Developer
  account + Mac/Xcode; also unlocks reliable native haptics). Lighter 2D build
  runs well on phones.

---

## 17. Tuning Reference

Master knobs, current values (edit these to retune the game):

**Board (`board.ts`):** `W=10`, `H=5`, `TYPES=7`, `SPAWN_WEIGHTS=[4,2,2,2,2,1,1]`.

**Combat (`run.ts`):**
`SWORD_MAIN=5`, `SWORD_EXTRA=2` (→ 5/7/9 dmg for 3/4/5+),
`SPELL_DMG={3:9,4:14,5:20}` +`SPELL_EXTRA=3`/tile past 5 (tier 5 burns),
defenses `RESIST_MULT=0.5`/`WEAK_MULT=1.5` (hide=anti-sword, ward=anti-spell),
block = CHARGES (1/shield tile; a full block turns the strike + `BLOCK_PUSHBACK=0.05`
shove, but strikes COST `guardCost(killed)` = 1 +1/8 depths; short pay = partial),
potion `POTION_GROUND=0.12`/`POTION_GUARD=2` charges, Bulwark Brew = 6 charges,
`RUN_COMPLETE_AT=20` (the run ends VICTORIOUS after the second boss + his hoard —
"THE ROAD IS CLEARED" banks the haul and returns to camp; the pause menu offers
"return to camp" mid-run, banking as if fallen),
`ADVANCE_PER_KILL=0.3`, `SAFE_X=PADIN+430` (longer starting runway),
`ENEMY_BASE_HP=9` (+3/kill), `ENEMY_BASE_POWER=0.075` (+0.015/kill).

**Bosses (`run.ts`):** `BOSS_EVERY=10`, `BOSS_HP_MULT=1.8`, `BOSS_SCROLL_MULT=0.5`,
`BOSS_BOUNTY=8`, `BOSS_SURGE=0.2`.

**Pace/lane (`main.ts`):** `SCROLL_PER_SEC=0.02`, `WORLD_SCROLL=170`,
`STRIKE_MS=4800`, `CHEST_EVERY=3`, `CHEST_KEY_COST=1`, `SLOT_N=6`, `RAIN_CHANCE=0.35`,
`HOLD_TIP_MS=380`.

**Items (`items.ts`):** `STORMCALL_DMG=25`, `WARHORN_SECS=15`, `WAYSTONE_SECS=12`,
`BULWARK_BLOCK=0.3`, `BURN_DPS=2`/`BURN_SECS=10`, `SPURS_STRIKE_MS=7000`,
`HEARTH_PRESSURE=0.5`, `LEDGER_SECS=20`, `WHETSTONE_CHARGES=3`,
`PAN_EXTRA_PULLS=2`, `CHEST_BONUS_ITEM_CHANCE=0.14`, `SAPPER_RADIUS=1` (3×3);
tiers `60/30/10` (boss `25/45/30`).

**Meta (`meta.ts`):** `BLACKSMITH_COST={wood:30, ore:30}`,
`forgeCost=20+15·level`, `MAX_ACTIVE=3` quests, `BIOME_ORDER=[plains, forest, snow, dungeon]`.

---

## 18. Roadmap

### Shipped ✅
- Swap match-3 board with animated cascade, deadlock rebuild, full juice (shards,
  combos, hitstop, floating numbers, haptics).
- Runner + combat: single-pressure fail axis, hero/slime animation, scaling foes,
  strikes, block, weapon combos, kill surge, score/depth HUD.
- **Bosses** (Malgrim the Cindermage) with entrance, named bar, spoils, gated chest.
- **Chests** — full VS-style takeover, pull table, reveal-one-at-a-time, cashout.
- **Run items** — 16 one-shot items with hover/hold tooltips, targeting
  mode, timed buffs + buff readout, tiered chest/boss-hoard roll tables (§8).
- **Worlds/biomes** — plains + forest parallax, weather (rain/overcast), ambient beds.
- **Meta caravan** — camp scene, Wren the blacksmith (hire + forge), the Wayfarer
  quest board (offer/accept/complete), biome pools + the road gate, persistence.
- **First-run tutorial** (8 beats, hands-on).
- Deploy pipeline to GitHub Pages.

### Next / In-progress
1. **Cages & rescues** — recruits freed by key-matches under pressure (reuses the
   chest walk-in + key-gate). *(Immediate next.)*
2. **More recruits** — Carpenter (shield block), Hedge-witch (spell power), Cook
   (steadier pace) — each mapping to a `run.ts` knob (see §11).
3. **Weapon-vs-enemy-type gating** (sword=ground, staff=flying) + a richer enemy
   roster / lane obstacle set.
4. More biomes (jungle → snow → dungeon) using staged floor/parallax sets.
5. **Ship polish:** itch.io page, then Capacitor iOS wrap.

### Open questions
- Difficulty curve per world; final pacing of the win condition.
- Full recruit roster + where recruit/NPC art comes from.
- Cage tuning (frequency, key cost, on-screen dwell).
- Art-direction lock (pixel style, palette, hero/enemy identity).
- ~~Do run items stack?~~ → shipped: duplicates allowed across slots; charges
  and timers stack additively when re-used (§8). Capacity stays 6.

---

*End of GDD v1.0. Keep this reconciled with `src/*.ts`; when a system changes,
update the relevant section and the Tuning Reference (§17).*
