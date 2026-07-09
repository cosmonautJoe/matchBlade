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

- Board is ~**8 columns x 7 rows** (`W=8, H=7` in `src/board.ts`).
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
  `hasPossibleMove`, `collapseAndRefill`) carried over from Stellar Shards, plus
  `swap` / `swapMakesMatch` for the swap input. No rendering deps.

## 8. Current state (playable core loop)

- Vite + TS + Phaser project with the core loop working end to end:
  - **Swap match-3 board** (`src/main.ts` + `src/board.ts`): drag-to-swap,
    illegal-swap revert, animated clear/gravity/refill cascade. Tiles use emoji
    icons (⚔️🪄🛡️🔑💎🪵🪨) on a backing disc; real tile art still TODO.
  - **Runner + combat** (`src/main.ts` + `src/run.ts`): animated hero (Soldier)
    and enemies (Orc) marching in from the right, over a **scrolling dungeon
    wall** (generated brick TileSprite + torches that pan while the hero runs and
    hold still in a fight). Constant leftward **scroll pressure** + enemy strikes
    push the hero toward the skull; matching combat tiles kills the enemy and
    surges the hero forward. Enemy HP bar, pressure bar, score/resource HUD,
    game-over + tap-to-restart.
  - Runner state is a pure, unit-tested module (`src/run.ts`); a single
    `pressure` value in [0,1] is the fail axis (see §4).
- `npm install` then `npm run dev` -> the harness picks a free port (see
  `vite.config.ts` / `.claude/launch.json` `autoPort`).
- **Still placeholder / TODO:** real tile-icon art, weapon-vs-enemy-type gating
  (sword vs ground, staff vs flying), locks/chests, meta hub, audio.

## 9. Suggested build order

1. ~~**Grid interaction** — drag a tile onto a neighbour to swap.~~ ✅ done
2. ~~**Match resolution** — clear/collapse/refill with a little juice.~~ ✅ done
3. ~~**Runner lane** — scroll pressure, death on reaching the skull.~~ ✅ done
4. ~~**Combat** — enemies with HP; sword/staff -> damage, shield -> block.~~ ✅ done
   (single ground enemy for now; weapon-vs-type gating still TODO)
6. ~~**Score + HUD** — score, resource counters, depth.~~ ✅ done
5. **Keys & chests** — locks/chests in the lane, key matches, loot. ← next
7. **Meta hub** — spend resources on persistent upgrades (localStorage).
8. **Art & audio** — real tile-icon art, SFX, music (character sprites done).
9. **Ship** — `npm run build`, itch.io page, (later) Capacitor iOS wrap.

## 10. Open questions

- Final win condition / score target and difficulty curve.
- Exact enemy roster & lane obstacle set.
- Art direction specifics (pixel style, palette, hero/enemy designs).
- Do slides cost anything / are they free (reference game: free)?
