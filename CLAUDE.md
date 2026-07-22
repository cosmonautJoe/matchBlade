# matchBlade

A match-3 dungeon runner (Phaser 3 + TypeScript + Vite). The hero auto-runs a
lane up top; you fight/defend/loot by playing the swap match-3 board below.
Runs are disposable; the caravan camp between runs is the persistent progress.

## Read these first
- **`GDD.md`** — the complete design document (systems, tuning tables, roadmap).
- **`DESIGN.md`** — the running dev-log (decisions + what's SHIPPED, newest state).
- Where they disagree, **code wins**; update the doc you touched.

## Commands
- `npm run dev` — Vite dev server. Binds the harness `PORT` env (autoPort in
  `.claude/launch.json`), falls back to 5173.
- `npm run build` — `tsc --noEmit` + Vite bundle to `dist/`. Run tsc before
  committing; there are no unit tests yet.
- `npm run deploy` — **the ONLY way the live site updates.** Builds, then
  force-pushes `dist/` to the `gh-pages` branch (`scripts/deploy.mjs`).
  Live at: **https://cosmonautjoe.github.io/matchBlade/**
  ⚠️ Pushing `master` does NOT deploy — source and site are separate branches.
  Deploy only when the user asks (it publishes).

## Architecture (src/)
- `board.ts` — pure match-3 grid logic (no Phaser). W=10 x H=5, 7 tile types,
  weighted spawns (`SPAWN_WEIGHTS`).
- `run.ts` — pure run/combat state. Single fail axis: `pressure` 0→1 (skull).
  All combat/boss tuning knobs live here.
- `items.ts` — pure run-item registry (16 tap-to-use consumables + roll tables).
- `meta.ts` — persistent progression (localStorage `matchblade-meta-v1`):
  banked resources, blacksmith/forge, quest board, biomes.
- `main.ts` — `GameScene`: board + lane + combat + chests + boss + items + HUD
  (~2300 lines; the big one).
- `camp.ts` — `CampScene`: the between-runs hub. Boots first; DEPART → run;
  death → back here. Wayfarer (quests), blacksmith (forge), Peddler (diamond
  item shop), arrival cutscenes.
- `menu.ts` — `MenuScene`: pause/system menu overlay (Esc or ☰). Pauses the
  scene beneath it. New game / save+load (3 slots) / options (audio faders).
- `audio.ts` — persisted channel volumes (effects/ambience/music). All sfx
  route through `sfxV()`, looping beds through `ambV()`; sliders emit
  `game.events "audio-changed"` so beds re-level live.
- `tutorial.ts` — first-run overlay (gates the run while active).

## Dev hooks (DEV builds only)
- `__mb` = GameScene: `.debugBoss()`, `.debugChest()`, `.debugCombo()`,
  `.debugItem(id?)`, `.rigSwapMatch(type)`.
- `__mbCamp` = CampScene (has an in-camp layout editor, "✎ edit").
- `?tutorial` URL param force-replays the run tutorial; `?intro` force-replays
  the camp arrival cutscene.

## Quirks worth knowing
- `assets/` (raw art/audio packs) is **gitignored and not served** — the game
  loads only from `public/`. Vite ignores it in watch (locked files crash chokidar).
- Windows checkout: LF/CRLF warnings on commit are normal; ignore them.
- Tile faces are custom 84×84 ironbound pixel-art PNGs in `public/tiles/`;
  `TILE_ART` in `src/main.ts` maps board types to preload keys. Keep future
  replacements inside the shared frame/inset silhouette so the set stays cohesive.
- The `⚙` gear (bottom-left) is dev-only; hidden in production builds.
