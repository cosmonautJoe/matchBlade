# matchBlade — Game Design Document

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
> fight a rising line of enemies → every 3rd kill a **chest** rolls in (spend a
> banked key to pop it) → every 10th foe is a **boss** → *pressure* creeps up the
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
- **Grid:** `W = 11` columns × `H = 5` rows (landscape board). `EMPTY = -1`.
- **7 tile types** (`TYPES = 7`), currently drawn as **emoji glyphs on a colored
  disc** (placeholder art — real tile icons are TODO):

| id | tile | glyph | effect (context-sensitive) |
|----|----------|----|------------------------------------------------------|
| 0 | sword | ⚔️ | melee attack on the current foe |
| 1 | staff | 🪄 | magic attack (folds into the swing; standalone if no swords) |
| 2 | shield | 🛡️ | adds **block** that soaks the next enemy strike |
| 3 | key | 🔑 | **banks** a key (per-run) → pops chests / frees cages |
| 4 | treasure | 💎 | diamonds — banked currency (premium/quests/boss bounty) |
| 5 | wood | 🪵 | crafting resource, banked to the caravan |
| 6 | ore | 🪨 | crafting resource, banked to the caravan |

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
- **Enemies:** slimes (legacy `orc-*` anim keys), variant pool by depth —
  `k<3`: base slime; `k<8`: + variant 2; `k≥8`: variants 2 & 3. `SLIME_SCALE = 3.7`.
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
- **Forge bonus** (`swordBonus`, from `meta.swordLevel`) is added to the **first**
  swing — "the forged edge bites harder."
- **Staff** (`STAFF_DMG = 3` each) folds into the first swing, or lands as one
  standalone magic hit if no swords matched.
- **Shields** add block: `BLOCK_PER_SHIELD = 0.05` pressure absorbed per shield,
  stockpiled until spent by a strike.
- **Kill surge:** `ADVANCE_PER_KILL = 0.3` pressure removed (hero lunges
  forward), +100 score, then the next enemy spawns.
- **Scoring:** resources ×2, damage ×5, +100 per kill (+400 per boss).

### 5.4 Enemy scaling & strikes
- **HP:** `ENEMY_BASE_HP = 9 + kills × ENEMY_HP_GROWTH(3)` — base foe dies to
  ~one strong combo; scales each kill.
- **Power:** `ENEMY_BASE_POWER = 0.075 + kills × ENEMY_POWER_GROWTH(0.015)`.
- **Strikes** fire on a `STRIKE_MS = 4800ms` cadence: `enemyStrike()` — block
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
  a **wide named HP bar** (`☠ MALGRIM THE CINDERMAGE`) fills up dramatically
  (the first hit cancels the intro fill).
- **The fight:** he throws **fireballs** (`fireball1/2/3`) with harder shake and
  a hotter seared tint. **Scroll pressure halves** during the fight
  (`BOSS_SCROLL_MULT = 0.5`) — there are no intermediate kills to relieve
  pressure, so the world "holds its breath."
- **HP:** `BOSS_HP_MULT = 1.8` over a same-depth foe.
- **Death — the spoils:** flash + camera quake + a **coin/spark eruption**,
  `"CINDERMAGE FELLED!"`, **`BOSS_BOUNTY = 8` treasure**, +400 score, an extra
  **`BOSS_SURGE = 0.2`** pressure relief on top of the kill surge, and a
  **guaranteed chest** rolls in right behind him.
- **Dev:** `__mb.debugBoss()` rigs the next foe as the boss.

---

## 7. Chests — The Dopamine Blast

A chest rolls into the lane **every `CHEST_EVERY = 3`rd kill** (and always after a
boss). Opening it is a **Vampire-Survivors-style full-screen takeover**, not
floating text. Costs **1 banked key** (`CHEST_KEY_COST = 1`).

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
   0.16). Each pull: **14% a run item** (if a slot is free, once), else treasure
   (2–4), wood (4–8), or ore (4–8). Best pull is sorted to land **last**.
6. **Cash out** — each reward zips to its HUD counter/slot, values tick up with
   coin sfx, a final `pouch`; the world resumes.

- **Dev:** `__mb.debugChest()` grants a key and forces a chest.

**Cages (designed, next up):** the same walk-in + key-gate reused for **caged
recruits** — match keys under scroll pressure to free a craftsperson before they
scroll past.

---

## 8. Item Slots

- **`SLOT_N = 6`** slots down the right HUD panel.
- **Filled** by the rare chest **item pull** (`fillSlot`, golden pop into the
  first empty slot). Placeholder glyphs `ITEM_GLYPHS = ["🧪", "💣", "🧭"]`.
- **Not yet usable** — display/fill only. The **run-consumable item system**
  (activation, effects) is a designed-but-unbuilt feature (TODO).

---

## 9. Worlds & Biomes

The caravan marches through a series of biomes; each redresses both the **run**
(`RUN_BIOMES` in main.ts) and the **camp** (`CAMP_BIOMES` in camp.ts), routed off
`meta.biome`. Shipped biomes: **plains** (`grass`) and **forest**.

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
- **The Forge** (tap Wren/furnace once hired): sells **+1 first-strike sword
  damage per level**. Cost curve **`forgeCost(level) = 20 + level × 15` ore**
  (20, 35, 50, …). Each level raises `meta.swordLevel`, folded into the first
  sword swing every run.
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
haul 120 ore · forge ×3 · depth 22 · depth 30 (rewards 20–45 — the forest asks
more of a seasoned scout).

### 11.6 Biomes & the road gate
- `BIOME_ORDER = [plains, forest]`; each biome has its own quest pool
  (`QUEST_POOLS`).
- **Clearing the *whole* current pool → `roadOpen()` true** → the Wayfarer's
  board shows a **"take the road onward"** button → `advanceBiome()` bumps the
  biome, clears active oaths, saves, and rebuilds the camp in the new world.
  (Hiring/forging alone does **not** advance — quests gate the road.)
- **TEMP debug:** tapping the camp biome tag flips plains↔forest (remove before
  release).

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

**Style:** 2D pixel-art. Tiles are currently **emoji-on-disc placeholders** —
real tile-icon art is the top art TODO.

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

**Procedural (baked at runtime, no files):** tile faces + shard crack textures,
raindrop, chest closed/open, god rays, coins, sparks, orbs, cropped ground slices.

**Licensing note:** keep every pack CC0 / properly-licensed and original; the
boss pack is explicitly CC0. (Confirm licenses before shipping commercially.)

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

**Board (`board.ts`):** `W=11`, `H=5`, `TYPES=7`, `SPAWN_WEIGHTS=[4,2,2,2,2,1,1]`.

**Combat (`run.ts`):**
`SWORD_MAIN=5`, `SWORD_EXTRA=2` (→ 5/7/9 dmg for 3/4/5+), `STAFF_DMG=3`,
`BLOCK_PER_SHIELD=0.05`, `ADVANCE_PER_KILL=0.3`,
`ENEMY_BASE_HP=9` (+3/kill), `ENEMY_BASE_POWER=0.075` (+0.015/kill).

**Bosses (`run.ts`):** `BOSS_EVERY=10`, `BOSS_HP_MULT=1.8`, `BOSS_SCROLL_MULT=0.5`,
`BOSS_BOUNTY=8`, `BOSS_SURGE=0.2`.

**Pace/lane (`main.ts`):** `SCROLL_PER_SEC=0.02`, `WORLD_SCROLL=170`,
`STRIKE_MS=4800`, `CHEST_EVERY=3`, `CHEST_KEY_COST=1`, `SLOT_N=6`, `RAIN_CHANCE=0.35`.

**Meta (`meta.ts`):** `BLACKSMITH_COST={wood:30, ore:30}`,
`forgeCost=20+15·level`, `MAX_ACTIVE=3` quests, `BIOME_ORDER=[plains, forest]`.

---

## 18. Roadmap

### Shipped ✅
- Swap match-3 board with animated cascade, deadlock rebuild, full juice (shards,
  combos, hitstop, floating numbers, haptics).
- Runner + combat: single-pressure fail axis, hero/slime animation, scaling foes,
  strikes, block, weapon combos, kill surge, score/depth HUD.
- **Bosses** (Malgrim the Cindermage) with entrance, named bar, spoils, gated chest.
- **Chests** — full VS-style takeover, pull table, reveal-one-at-a-time, cashout.
- **Item slots** (fill only).
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
3. **Run items** — make the 6 item slots actually *do* things (consumables).
4. **Real tile-icon art** (retire the emoji placeholders).
5. **Weapon-vs-enemy-type gating** (sword=ground, staff=flying) + a richer enemy
   roster / lane obstacle set.
6. More biomes (jungle → snow → dungeon) using staged floor/parallax sets.
7. **Ship polish:** itch.io page, then Capacitor iOS wrap.

### Open questions
- Difficulty curve per world; final pacing of the win condition.
- Full recruit roster + where recruit/NPC art comes from.
- Cage tuning (frequency, key cost, on-screen dwell).
- Art-direction lock (pixel style, palette, hero/enemy identity).
- Do run items stack / how many can you hold beyond the 6 slots?

---

*End of GDD v1.0. Keep this reconciled with `src/*.ts`; when a system changes,
update the relevant section and the Tuning Reference (§17).*
