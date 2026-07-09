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

## 2. Grid & input  (!! different from classic match-3)

- Board is ~**8 columns x 7 rows** (`W=8, H=7` in `src/board.ts`).
- **Input is a SLIDE, not a swap.** The player drags an entire **row or column**
  any number of cells; tiles that fall off one edge **wrap around** to the other.
  (`slideRow` / `slideCol` helpers exist in `board.ts`.)
- After a slide, resolve matches: clear 3+ runs, collapse, refill from the top
  (standard match-3 cascade). `findMatches()` already does detection; the
  collapse/refill step is written in the game layer.
- Longer matches (4+, 5+) should hit harder / grant more — a natural upgrade hook.

## 3. Tile types -> effects  (7 types)

Effects are **context-sensitive** — combat/defense only apply when the hero is
facing an enemy; keys only when at a lock; resources always stockpile.

| id | tile      | effect                                                        |
|----|-----------|---------------------------------------------------------------|
| 0  | sword     | melee attack vs. adjacent (ground) enemies                    |
| 1  | staff     | magic attack vs. flying/ranged enemies                        |
| 2  | shield    | block / reduce incoming damage                                |
| 3  | key       | open locked doors & chests in the lane                        |
| 4  | treasure  | one-use item / loot                                           |
| 5  | wood      | crafting resource (stockpiled for upgrades)                   |
| 6  | ore       | crafting resource (stockpiled for upgrades)                   |

Palette + glyphs for placeholders are in `src/main.ts` (`TILE_COLORS`, `TILE_GLYPH`).

## 4. Runner lane & combat

- Hero auto-advances; enemies/obstacles occupy lane positions ahead.
- **Enemy encounter:** hero stops at the enemy; matched combat tiles deal damage
  (melee vs. ground, magic vs. flying). Enemy has an HP bar. Shields mitigate the
  enemy's counterattack. Defeat the enemy -> hero proceeds.
- **Locks/chests:** require key matches to open (chests give treasure/resources).
- **Scroll pressure:** the world scrolls left at a steady (increasing) rate;
  progress from matches/kills moves the hero right relative to it. Fall behind to
  the skull -> death.

## 5. Meta progression (between runs)

- Gather **wood/ore/treasure/keys** during runs.
- Spend them in a hub screen on **permanent upgrades**: better weapons/armor,
  and **match modifiers** (e.g. "4+ matches deal bonus damage", more starting
  HP). Persist across runs (localStorage).

## 6. Tech stack & decisions

- **Engine: Phaser 3** (2D game framework) + **TypeScript** + **Vite**.
  - Chosen over PixiJS (leaner, the modern "Starling") and Three.js (3D, overkill
    for this 2D game). Phaser gives scenes, input, tweens, audio, and asset
    loading out of the box, which suits this game's many systems.
- **Art: 2D.** Start with **colored-block placeholders** (already in the boot
  scene) to nail mechanics, then add pixel-art sprites.
- **Deployment:**
  - **Web / your site / itch.io:** `npm run build` -> static bundle in `dist/`.
  - **iOS:** wrap the web build with **Capacitor** (or Cordova) -> native app.
    Needs an Apple Developer account + Mac/Xcode to submit. Lighter 2D builds run
    better on phones.

## 7. Reused code

- `src/board.ts` — pure match logic (`makeInitialGrid`, `findMatches`,
  `hasPossibleMove`-style helpers) carried over from Stellar Shards, plus
  `slideRow` / `slideCol` for the slide input. No rendering deps.

## 8. Current state (scaffold)

- Vite + TS + Phaser project that boots to a **placeholder scene**: runner lane
  (hero/enemy/skull blocks) on top, an 8x7 grid of colored placeholder tiles
  below. Proves the toolchain; no gameplay yet.
- `npm install` then `npm run dev` -> http://localhost:5173

## 9. Suggested build order

1. **Grid interaction** — slide a row/column by drag; animate the slide + wrap.
2. **Match resolution** — clear/collapse/refill with a little juice.
3. **Runner lane** — hero auto-walk, scroll pressure, death on reaching skull.
4. **Combat** — enemies with HP; sword/staff/shield tiles wired to attack/block.
5. **Keys & chests** — locks in the lane, key matches, loot.
6. **Score + HUD** — score, resource counters, distance.
7. **Meta hub** — spend resources on persistent upgrades (localStorage).
8. **Art & audio** — pixel-art tiles/characters, SFX, music.
9. **Ship** — `npm run build`, itch.io page, (later) Capacitor iOS wrap.

## 10. Open questions

- Final win condition / score target and difficulty curve.
- Exact enemy roster & lane obstacle set.
- Art direction specifics (pixel style, palette, hero/enemy designs).
- Do slides cost anything / are they free (reference game: free)?
