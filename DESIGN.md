# matchBlade — Design & Handoff

A match-3 **dungeon runner**: your hero auto-advances through a dungeon while you
slide tiles below to attack, defend, unlock, and gather. Inspired by the
*genre* of 10000000 (EightyEight Games) — we build **our own original art,
code, and content**; we do not copy their assets.

> This doc is the handoff from the planning chat. It captures the decisions and
> the plan so a fresh chat can build from here without re-deriving anything.

---

## 1. Core loop

- The hero walks **left → right** along a top "runner lane" on their own.
- The dungeon **scrolls**, applying constant **leftward pressure** on the hero.
- Below is a **match-3 grid**. Making matches produces effects (attack, defend,
  keys, resources). Good play pushes the hero forward / kills enemies; poor play
  lets the scroll drag the hero back.
- If the hero is pushed off the **left edge (the death/skull marker)** → run ends.
- **Goal:** reach a target score in a single run. Between runs, spend gathered
  resources on **permanent upgrades**.

## 2. Grid & input  (classic swap match-3)

- Board is **10 columns × 5 rows** (`W=10, H=5` in `src/board.ts`).
- **Input is a SWAP** — Candy Crush / Bejeweled style. The player drags a tile
  onto an **orthogonally-adjacent** neighbour to swap the two; the swap only
  **sticks if it creates a match**, otherwise it animates back.
  (`swap` / `swapMakesMatch` helpers in `board.ts`.)
- After a valid swap, resolve matches: clear 3+ runs, collapse, refill from the
  top (standard match-3 cascade), and repeat until stable. `findMatches()` does
  detection; `collapseAndRefill()` is the pure gravity+refill (the game layer has
  an animated equivalent). `hasPossibleMove()` guards against deadlocks.
- Longer matches (4+, 5+) should hit harder / grant more — a natural upgrade hook.

## 3. Tile types -> effects  (7 types)

Effects are **context-sensitive** — combat/defense only apply when the hero is
facing an enemy; keys only when at a lock; resources always stockpile.

| id | tile      | effect                                                        |
|----|-----------|---------------------------------------------------------------|
| 0  | sword     | melee attack vs. adjacent (ground) enemies                    |
| 1  | staff     | magic attack vs. flying/ranged enemies                        |
| 2  | shield    | block / reduce incoming damage                                |
| 3  | key       | free caged recruits (and open chests) in the lane             |
| 4  | treasure  | diamonds — rare currency: hire certain recruits, premium tiers |
| 5  | wood      | crafting resource (spent at the caravan camp)                 |
| 6  | ore       | crafting resource (spent at the caravan camp)                 |
| 7  | potion    | VERY RARE (~1/121 spawn); **tapped, not matched** — regain ground + a swig of guard |

Production tile faces are 84×84 transparent pixel-art PNGs in `public/tiles/`.
`TILE_ART` in `src/main.ts` maps each logical type to its preloaded texture.

## 4. Runner lane & combat

- Hero auto-advances; enemies/obstacles occupy lane positions ahead.
- **Enemy encounter:** hero stops at the enemy; matched combat tiles deal damage
  (melee vs. ground, magic vs. flying). Enemy has an HP bar. Shields mitigate the
  enemy's counterattack. Defeat the enemy -> hero proceeds.
- **Cages & chests:** a caged prisoner (or chest) scrolls into view; key matches
  while it's on screen free the recruit / pop the loot — scroll pressure keeps
  ticking, so keys suddenly jump the priority queue. Miss it and it scrolls past.
- **Chest opening = the dopamine blast (Vampire Survivors style).** Not floating
  text — a full takeover sequence: hitstop + dark veil → chest center-stage,
  rattling, light leaking → POP: radial light rays, loot erupting with physics
  (reuse the tile-shard tumble system) → rewards revealed **one at a time**
  (hidden count = slot-machine tension; resources plus a guaranteed **run item
  that flies into one of the 6 right-panel HUD slots**, with jackpot chances for
  more items) → fast tick-up tally → world resumes. Escalating sting per extra
  reward. A due chest waits while all 6 item slots are occupied.
- **Scroll pressure:** the world scrolls left at a steady (increasing) rate;
  progress from matches/kills moves the hero right relative to it. Fall behind to
  the skull -> death.

## 5. Meta progression — THE CARAVAN (between runs)

**Fantasy:** you are the scout for a traveling caravan, running ahead to clear
the road. Each run carves a path through the next stretch of wilderness; the
caravan follows, world by world (grass → forest → jungle → snow → dungeon).

- **Recruits, not upgrades-in-a-menu.** The visible-progression hook (YMBAB's
  growing boat): each recruit adds a **wagon** to the caravan lineup at camp.
- **Keys free people.** Recruits are rescued from **cages in the lane** (§4) by
  matching keys under scroll pressure. Some later recruits are *hired* with
  **diamonds** instead (the mercenary wants gems, not gratitude).
- **Recruits are craftspeople, not combat buddies.** Each one owns an upgrade
  track that maps onto an exported `run.ts` tuning knob:

  | recruit     | wants     | upgrades                                   |
  |-------------|-----------|--------------------------------------------|
  | Blacksmith  | ore       | sword damage (`SWORD_MAIN` / `SWORD_EXTRA`) |
  | Carpenter   | wood      | guard (e.g. bonus charges / stronger shove) |
  | Hedge-witch | wood+ore  | spell power (`SPELL_DMG` tiers)            |
  | Cook        | wood      | steadier pace (scroll rate / surge per kill) |

- **Camp scene** between runs: wagons in a line, campfire, tap a recruit to
  spend wood/ore on their track. Persist via localStorage.
- **v1 SHIPPED (src/meta.ts + camp.ts):** resources bank across runs (shown on
  the death screen); the blacksmith ("Wren") hides in the tarp tent (gold "?"
  marker) until paid **30 wood + 30 ore**, then walks out and mans the furnace;
  her forge sells **+1 first-strike sword damage** per level (20 + 15/level ore).
- **Quest board (src/meta.ts):** the Wayfarer (Goddess sprite, by the portal)
  OFFERS quests from a 10-deep plains pool; the player ACCEPTS up to 3 at a
  time. Progress is **delta-based from acceptance** (no retro-completing);
  accepted quests show with live progress in the run HUD under DEPTH/SCORE.
  Completing quests pays treasure, frees a slot, and surfaces the next offers.
  Clearing the WHOLE pool opens the road to the next biome (YMBAB-style gate;
  hiring alone does NOT advance the area). Keys stay per-run.
- **Biomes & the road gate (SHIPPED, src/meta.ts):** `meta.biome` is the caravan's
  current stop, ordered by `BIOME_ORDER = [plains, forest]`, each with its own quest
  pool in `QUEST_POOLS`. Clearing the current pool → `roadOpen()` true → the Wayfarer's
  board shows a **"take the road onward"** button that calls `advanceBiome()` (bumps the
  biome, clears active oaths, saves) and rebuilds the camp in the new biome. Both scenes
  redress off `meta.biome`: the **camp** via `CAMP_BIOMES` (forest = layered jungle
  parallax + baked forest floor) and the **run** via `RUN_BIOMES` in main.ts (forest
  parallax layers + forest ground crop). Forest art lives in `public/worlds/forest/`
  (plx1–5 + baked floor.png). TEMP: tapping the camp biome tag flips plains↔forest for
  preview (remove before release).
- **Character budget:** one portrait, a name, and a single line of dialogue per
  recruit (on rescue + at camp). No dialogue trees, no cutscenes, and recruits
  never fight beside you — that's sequel scope.
- **Win condition:** the caravan completes the journey — clear the last world,
  everyone home. Endless mode unlocks after. (Closes the §10 open question.)
- **v1 slice:** cages in the lane → camp scene with ~3 recruits → done.
  First rescue can be **WarriorWoman** (already in the character pack, unused).

## 6. Tech stack & decisions

- **Engine: Phaser 3** (2D game framework) + **TypeScript** + **Vite**.
  - Chosen over PixiJS (leaner, the modern "Starling") and Three.js (3D, overkill
    for this 2D game). Phaser gives scenes, input, tweens, audio, and asset
    loading out of the box, which suits this game's many systems.
- **Art: 2D pixel-art.** The board uses custom ironbound relic tile sprites;
  remaining procedural/placeholder assets can be replaced incrementally.
- **Deployment:**
  - **GitHub Pages (SHIPPED):** `npm run deploy` builds and force-pushes `dist/`
    to the `gh-pages` branch -> https://cosmonautjoe.github.io/matchBlade/.
    Pushing `master` does NOT update the live site — deploy is a separate,
    manual step (see `scripts/deploy.mjs` + CLAUDE.md).
  - **Web / your site / itch.io:** `npm run build` -> static bundle in `dist/`.
  - **iOS:** wrap the web build with **Capacitor** (or Cordova) -> native app.
    Needs an Apple Developer account + Mac/Xcode to submit. Lighter 2D builds run
    better on phones.

## 7. Reused code

- `src/board.ts` — pure match logic (`makeInitialGrid`, `findMatches`,
  `hasPossibleMove`, `collapseAndRefill`) carried over from Stellar Shards, plus
  `swap` / `swapMakesMatch` for the swap input. No rendering deps.

## 8. Current state (playable core loop)

- Vite + TS + Phaser project with the core loop working end to end:
  - **Swap match-3 board** (`src/main.ts` + `src/board.ts`): drag-to-swap,
    illegal-swap revert, animated clear/gravity/refill cascade. Tiles use a
    cohesive custom ironbound pixel-art set (crossed swords, crystal staff,
    shield, key, treasure, timber, and ore); staggered metallic glints add subtle
    runtime polish, and clear shards sample the same art.
  - **Runner + combat** (`src/main.ts` + `src/run.ts`): animated hero (Soldier)
    and enemies (Orc) marching in from the right, over a **grass world** — a
    layered **parallax** backdrop (vnitti Grassy-Mountains: sky, far/near
    mountains, hill, drifting clouds, each scrolling at its own depth factor) and
    a grassy ground band cropped from the GandalfHardcore floor atlas. The world
    pans while the hero runs and holds still in a fight. Constant leftward
    **scroll pressure** + enemy strikes push the hero toward the skull; matching
    combat tiles kills the enemy and surges the hero forward. Enemy HP bar,
    score/resource HUD, **6 run-item slots** in the right panel (filled by chest
    drops, see §4), game-over +
    tap-to-restart. (The pressure bar was removed: the hero's distance from
    the skull IS the pressure readout.)
  - **Worlds** (planned): the backdrop is swappable — grass first, then
    icy/autumn (the floor atlas already has all three biomes) and dungeon. New
    enemy art (boar/bee/snail) is staged for later.
  - Runner state is a pure, unit-tested module (`src/run.ts`); a single
    `pressure` value in [0,1] is the fail axis (see §4).
  - **Boss encounters (SHIPPED):** every `BOSS_EVERY`th (10th) foe is **MALGRIM
    THE CINDERMAGE** (Evil Wizard pack, CC0, flipped to face left). Entrance:
    summon sting, the lane darkens, ember-gradient name banner, wide named HP
    bar with a dramatic fill-up. He fights with fireball strikes (harder shake,
    seared tint); scroll pressure halves during the fight (`BOSS_SCROLL_MULT` —
    no intermediate kills means no relief). Death: flash + quake + coin/spark
    eruption, "CINDERMAGE FELLED!", `BOSS_BOUNTY` treasure, an extra
    `BOSS_SURGE` of pressure relief, and a guaranteed chest becomes due next
    (it waits if all 6 item slots are occupied).
    Dev: `__mb.debugBoss()` rigs the next foe. Knobs live in run.ts.
  - **Ambient soundscape + weather (SHIPPED):** a looping forest bed under
    every run (`amb_day`), with a `RAIN_CHANCE` roll per run that swaps in
    `amb_rain` plus rain streaks + an overcast wash over the lane. Camp adds
    night crickets (`amb_night`) beside the fire crackle, faded out on DEPART.
    Loops are 40s mono MP3s cut from the 10MB ambience WAVs (tail crossfaded
    into the head for a seamless loop; conversion script kept in the chat log).
  - **First-run tutorial (src/tutorial.ts):** a step-driven spotlight overlay
    the first time the puzzle scene opens — dim veil + hole, card per idea,
    progress dots, skippable. Two beats are hands-on: a planted one-swap sword
    match (`rigSwapMatch`, re-planted if a cascade eats it) to show damage, and
    a shield match followed by a scripted enemy strike clanging off the guard.
    A scripted "pierce" strike demos knockback toward the skull. While active
    the scene holds the run harmless (no strikes / scroll / chests, board
    unlocked only for the hands-on steps). Plays once via `meta.tutorialSeen`.
    Copy notes: resource tiles are pitched as "spend at camp, more uses coming"
    since tile roles may still change.
- **Run items (SHIPPED, src/items.ts + main.ts):** 16 one-shot run items
  fill the 6 HUD slots from chest item-pulls. Every opened chest reserves one
  resource and one item; extra pulls retain a 14% bonus-item chance, capped by
  free slots (tiers 60/30/10; the boss hoard rolls 25/45/30 and is the only
  source of the Cinder Flask trophy). Due chests wait while the pack is full. Tooltips
  on **hover** (mouse) and **press-and-hold** (touch, 380ms — that release
  doesn't fire the item). Aimed items (Sapper's Charge, Chromatic Prism) enter
  a targeting mode (gold ring + banner, consumed only when the shot lands);
  the Hearth Charm auto-fires on death (once, pressure -> 0.5). Live buff
  readout under the quests (charges/timers/armed keys + the Cartographer's Ink
  `ROAD ▸` forecast). Pure hooks live in run.ts (`whetstone`/`surgeMult`/
  `resMult`, shared `dealDamage()`); the strike timer self-schedules so
  Scout's Spurs can stretch the cadence. Dev: `__mb.debugItem(id?)`.
- **Spell projectiles + enemy defenses (SHIPPED):** staff matches are their own
  act — the hero casts and a fireball flies (Firebolt 3 / Fireball 4 /
  Pyroclasm 5+, which also sets the foe burning); damage, hurt, and even the
  death land ON IMPACT. Foes carry a defense school: **iron hide** (dark slime
  — swords x0.5, spells x1.5) or **spell ward** (blue slime + Malgrim — spells
  x0.5, swords x1.5), badge 🛡⚔/🛡🪄 by the HP bar, taught in-play by gray
  "resisted" / gold "WEAK!" numbers and a first-hit callout. Variant + defense
  now roll in run.ts makeEnemy (scene just dresses it); Stormcall respects
  wards via castBlast(). This replaces the old sword-vs-ground/staff-vs-flying
  plan. Tuning: SPELL_DMG {3:9,4:14,5:20}, RESIST_MULT 0.5, WEAK_MULT 1.5.
- `npm install` then `npm run dev` -> the harness picks a free port (see
  `vite.config.ts` / `.claude/launch.json` `autoPort`).
- **Still placeholder / TODO:** cages/rescues, more recruits at camp.

## 9. Suggested build order

1. ~~**Grid interaction** — drag a tile onto a neighbour to swap.~~ ✅ done
2. ~~**Match resolution** — clear/collapse/refill with a little juice.~~ ✅ done
3. ~~**Runner lane** — scroll pressure, death on reaching the skull.~~ ✅ done
4. ~~**Combat** — enemies with HP; sword/staff -> damage, shield -> block.~~ ✅ done
   (single ground enemy for now; weapon-vs-type gating still TODO)
6. ~~**Score + HUD** — score, resource counters, depth.~~ ✅ done
5. **Chests** — ✅ done. A chest becomes due every Nth kill; at most one waits
   while the item pack is full. A banked key pops it into the full VS-style
   takeover blast (§4). Placeholder pixel chest + baked god-rays/coins/sparks;
   real chest art TBD.
   **Cages & rescues** — cages in the lane, key matches free recruits under
   pressure (reuses the chest's walk-in + key-gate). ← next
7. **Caravan camp** — wagon lineup between runs; recruits' upgrade tracks
   spend wood/ore (localStorage). See §5.
8. **Art & audio** — custom tile-icon art ✅; SFX and music remain
   (character sprites done).
9. **Ship** — `npm run build`, itch.io page, (later) Capacitor iOS wrap.

## 10. Open questions

- ~~Final win condition~~ → the caravan completes the journey (§5). Difficulty
  curve per world still open.
- Exact enemy roster & lane obstacle set.
- Recruit roster beyond the first four (§5) + where recruit/NPC art comes from
  (user is sourcing a pack).
- Cage tuning: how often, how many keys, how long on screen.
- Art direction specifics (pixel style, palette, hero/enemy designs).
- Do slides cost anything / are they free (reference game: free)?
