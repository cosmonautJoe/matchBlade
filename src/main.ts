/**
 * matchBlade — game scene.
 *
 * Two coupled systems:
 *   1. A classic swap match-3 board (bottom) — model in board.ts.
 *   2. a side-scrolling world runner (top) — pure state in run.ts. The backdrop
 *      is a swappable "world" (grass first); the runner/combat logic is shared.
 *
 * Runner feel (DESIGN.md §4): the hero holds the line on the left; enemies march
 * in from the right. While an enemy is engaged, a constant leftward scroll drags
 * the hero toward the skull, and every enemy strike shoves him further left.
 * Matching sword/staff tiles damages the enemy; killing it surges the hero
 * forward (pressure drops) and the next foe advances. Pressure hits 1 -> the run
 * ends at the skull.
 *
 * The board and runner meet in resolve(): each cascade's cleared-tile counts are
 * fed to run.applyMatches() — swords/staves -> damage, shields -> block,
 * wood/ore/treasure/keys -> stockpiled resources.
 */

import Phaser from "phaser";
import {
  W,
  H,
  TYPES,
  EMPTY,
  type Coord,
  makeInitialGrid,
  findMatches,
  swap,
  hasPossibleMove,
} from "./board";
import { type RunState, newRun, applyMatches, enemyStrike, spawnNext, scroll } from "./run";

// ---- layout ---------------------------------------------------------------
const TILE = 80;
const GRID_W = W * TILE; // 640
const GRID_H = H * TILE; // 560
const PAD = 20;
const HUD_H = 34;
const LANE_H = 150;
const PBAR_H = 14;

const GRID_X = PAD;
const HUD_Y = PAD;
const LANE_Y = HUD_Y + HUD_H + 8;
const PBAR_Y = LANE_Y + LANE_H + 6;
const GRID_Y = PBAR_Y + PBAR_H + 12;

const GAME_W = GRID_W + PAD * 2; // 680
const GAME_H = GRID_Y + GRID_H + PAD; // 824

// lane geometry
const FLOOR_H = 32; // grassy ground band the characters stand on (lower surface = more world above)
const GROUND_Y = LANE_Y + LANE_H - FLOOR_H; // feet / floor-surface line
// Tiny RPG content sits mid-frame at slightly different heights per sheet,
// so anchor each sprite by its own foot fraction to plant it on the floor.
const HERO_FOOT = 0.59;
const ORC_FOOT = 0.56;
const SKULL_X = GRID_X + 32; // death marker at the far left
const SAFE_X = GRID_X + 300; // hero screen x at pressure 0
const ENGAGE_GAP = 130; // enemy centre sits this far right of the hero when fighting
const ENTER_X = GAME_W + 80; // enemies walk in from off-screen right
const SPRITE_SCALE = 3.2; // Tiny RPG art in 100x100 frames (4 was a touch big)
const HP_W = 88;

// ---- runner tuning (safe to tweak / turn into upgrades later) --------------
const SCROLL_PER_SEC = 0.02; // pressure gained per second while engaged
const STRIKE_MS = 4800; // enemy strike cadence
const WALK_IN_MS = 850; // time for a new enemy to march into range
const WORLD_SCROLL = 170; // px/sec the world pans while the hero is running
const FLOOR_SCALE = 1.6; // show the grass chunk chunky so the blades read like the reference
const PARALLAX_SRC_H = 216; // source height of the vnitti parallax layers
// parallax layers, back-to-front, with scroll factors (0 = static .. 1 = foreground)
const PARALLAX: { key: string; scroll: number }[] = [
  { key: "grass-sky", scroll: 0.04 },
  { key: "grass-clouds-mid", scroll: 0.1 },
  { key: "grass-mtn-far", scroll: 0.16 },
  { key: "grass-mtn", scroll: 0.3 },
  { key: "grass-clouds-front", scroll: 0.24 },
  { key: "grass-hill", scroll: 0.5 },
];

// ---- placeholder tile look (see DESIGN.md §3) -----------------------------
const TILE_COLORS = [
  0xd94b4b, // 0 sword     red
  0x9b59b6, // 1 staff     purple
  0x4b7bd9, // 2 shield    blue
  0x54c26e, // 3 key       green
  0xf2c14e, // 4 treasure  gold
  0x9c6b3f, // 5 wood      brown
  0x8a8f98, // 6 ore       gray
];
// icon per tile type: sword, staff, shield, key, treasure, wood, ore
const TILE_GLYPH = ["⚔️", "🪄", "🛡️", "🔑", "💎", "🪵", "🪨"];
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function lerpColor(a: number, b: number, t: number) {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (
    (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t))
  );
}

class GameScene extends Phaser.Scene {
  // board
  private grid: number[][] = [];
  private tiles: (Phaser.GameObjects.Container | null)[][] = [];
  private busy = false;
  private down: { coord: Coord; x: number; y: number } | null = null;

  // runner
  private run!: RunState;
  private phase: "advance" | "fight" = "advance";
  private parallax: { sprite: Phaser.GameObjects.TileSprite; scroll: number }[] = [];
  private floor!: Phaser.GameObjects.TileSprite;
  private hero!: Phaser.GameObjects.Sprite;
  private orc: Phaser.GameObjects.Sprite | null = null;
  private orcDying = false;
  private enemyHpBar!: Phaser.GameObjects.Rectangle;
  private enemyHpBg!: Phaser.GameObjects.Rectangle;
  private pressureFill!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private resourceText!: Phaser.GameObjects.Text;
  private overShown = false;

  constructor() {
    super("game");
  }

  preload() {
    const sheet = (key: string, file: string, fw = 100, fh = 100) =>
      this.load.spritesheet(key, `sprites/${file}`, { frameWidth: fw, frameHeight: fh });
    sheet("hero-idle", "hero_idle.png");
    sheet("hero-walk", "hero_walk.png");
    sheet("hero-attack", "hero_attack.png");
    sheet("orc-idle", "orc_idle.png");
    sheet("orc-walk", "orc_walk.png");
    sheet("orc-hurt", "orc_hurt.png");
    sheet("orc-death", "orc_death.png");
    sheet("orc-attack", "orc_attack.png");
    // grass world backdrop: vnitti parallax layers + GandalfHardcore floor atlas
    this.load.image("grass-sky", "worlds/grass/sky.png");
    this.load.image("grass-mtn-far", "worlds/grass/mountains_far.png");
    this.load.image("grass-mtn", "worlds/grass/mountains.png");
    this.load.image("grass-hill", "worlds/grass/hill.png");
    this.load.image("grass-clouds-mid", "worlds/grass/clouds_mid.png");
    this.load.image("grass-clouds-front", "worlds/grass/clouds_front.png");
    this.load.image("grass-floor", "worlds/grass/floor.png");
  }

  create() {
    this.run = newRun();
    this.busy = false;
    this.down = null;
    this.orc = null;
    this.orcDying = false;
    this.overShown = false;
    this.phase = "advance";
    this.parallax = [];

    this.buildAnims();
    this.buildGrassGround();
    this.buildHud();
    this.buildLane();
    this.buildBoard();
    this.buildInput();
    this.spawnOrc();

    this.time.addEvent({ delay: STRIKE_MS, loop: true, callback: () => this.strike() });

    if (import.meta.env.DEV) (globalThis as unknown as { __mb: GameScene }).__mb = this;
  }

  private buildAnims() {
    const mk = (key: string, fps: number, repeat: number) => {
      if (this.anims.exists(key)) return;
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(key, {}), frameRate: fps, repeat });
    };
    mk("hero-idle", 8, -1);
    mk("hero-walk", 12, -1);
    mk("hero-attack", 16, 0);
    mk("orc-idle", 7, -1);
    mk("orc-walk", 10, -1);
    mk("orc-hurt", 12, 0);
    mk("orc-death", 10, 0);
    mk("orc-attack", 12, 0);
  }

  /** Crop a seamless middle slice (grass top + dirt, no rocky side edges) from the floor atlas. */
  private buildGrassGround() {
    if (!this.textures.exists("grass-ground")) this.cropTile("grass-ground", "grass-floor", 16, 0, 64, 96);
  }

  /** Copy a region of a loaded image into its own texture, for TileSprite tiling. */
  private cropTile(key: string, src: string, sx: number, sy: number, w: number, h: number) {
    const img = this.textures.get(src).getSourceImage() as HTMLImageElement;
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const cx = cv.getContext("2d")!;
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
    this.textures.addCanvas(key, cv);
  }

  // --- tile coordinate helpers (container origin is its centre) ---
  private xFor(c: number) {
    return GRID_X + c * TILE + TILE / 2;
  }
  private yFor(r: number) {
    return GRID_Y + r * TILE + TILE / 2;
  }
  private cellAt(x: number, y: number): Coord | null {
    const c = Math.floor((x - GRID_X) / TILE);
    const r = Math.floor((y - GRID_Y) / TILE);
    if (c < 0 || c >= W || r < 0 || r >= H) return null;
    return { r, c };
  }
  private heroXForPressure() {
    return lerp(SAFE_X, SKULL_X, this.run.pressure);
  }
  private heroBaseAnim() {
    return this.phase === "fight" ? "hero-idle" : "hero-walk";
  }

  // --- HUD ---
  private buildHud() {
    this.add.rectangle(GAME_W / 2, HUD_Y + HUD_H / 2, GRID_W, HUD_H, 0x14171f).setStrokeStyle(2, 0x2a2d38);
    this.resourceText = this.add
      .text(GRID_X + 10, HUD_Y + HUD_H / 2, "", { fontFamily: "monospace", fontSize: "15px", color: "#c7ccd6" })
      .setOrigin(0, 0.5);
    this.scoreText = this.add
      .text(GRID_X + GRID_W - 10, HUD_Y + HUD_H / 2, "", { fontFamily: "monospace", fontSize: "16px", color: "#ffe08a" })
      .setOrigin(1, 0.5);
    this.refreshHud();
  }
  private refreshHud() {
    const r = this.run.resources;
    this.resourceText.setText(`Wood ${r.wood}   Ore ${r.ore}   Treasure ${r.treasure}   Keys ${r.keys}`);
    this.scoreText.setText(`Depth ${this.run.killed}    Score ${this.run.score}`);
  }

  // --- runner lane ---
  private buildLane() {
    // --- parallax world backdrop, back-to-front (each layer fills the lane) ---
    const pscale = LANE_H / PARALLAX_SRC_H; // fit the 216-tall layers into the lane
    this.parallax = [];
    for (const { key, scroll: s } of PARALLAX) {
      const ts = this.add
        .tileSprite(GAME_W / 2, LANE_Y + LANE_H / 2, GRID_W, LANE_H, key)
        .setTileScale(pscale);
      this.parallax.push({ sprite: ts, scroll: s });
    }

    // grass ground band the hero runs along
    this.floor = this.add
      .tileSprite(GAME_W / 2, GROUND_Y + FLOOR_H / 2, GRID_W, FLOOR_H, "grass-ground")
      .setTileScale(FLOOR_SCALE);

    this.add.rectangle(GAME_W / 2, LANE_Y + LANE_H / 2, GRID_W, LANE_H).setStrokeStyle(2, 0x2a2d38); // border
    this.add.text(SKULL_X, GROUND_Y + 4, "☠", { fontSize: "40px", color: "#c0424a" }).setOrigin(0.5, 1);

    this.hero = this.add
      .sprite(SAFE_X, GROUND_Y, "hero-idle")
      .setOrigin(0.5, HERO_FOOT)
      .setScale(SPRITE_SCALE)
      .play("hero-idle");

    this.enemyHpBg = this.add.rectangle(0, 0, HP_W, 9, 0x000000, 0.55).setOrigin(0.5).setVisible(false);
    this.enemyHpBar = this.add.rectangle(0, 0, HP_W, 9, 0xe05a5a).setOrigin(0, 0.5).setVisible(false);

    this.add.rectangle(GAME_W / 2, PBAR_Y + PBAR_H / 2, GRID_W, PBAR_H, 0x14171f).setStrokeStyle(2, 0x2a2d38);
    this.pressureFill = this.add
      .rectangle(GRID_X + 2, PBAR_Y + PBAR_H / 2, GRID_W - 4, PBAR_H - 4, 0x4caf50)
      .setOrigin(0, 0.5)
      .setScale(0.001, 1);
  }

  // --- board ---
  private buildBoard() {
    this.add.rectangle(GAME_W / 2, GRID_Y + GRID_H / 2, GRID_W + 8, GRID_H + 8, 0x0e1015).setStrokeStyle(2, 0x2a2d38);
    this.grid = makeInitialGrid();
    this.tiles = Array.from({ length: H }, () => Array<Phaser.GameObjects.Container | null>(W).fill(null));
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) this.tiles[r][c] = this.makeTile(r, c, this.grid[r][c]);
  }
  private makeTile(r: number, c: number, type: number): Phaser.GameObjects.Container {
    const rect = this.add.rectangle(0, 0, TILE - 8, TILE - 8, TILE_COLORS[type]).setStrokeStyle(2, 0x000000, 0.25);
    const disc = this.add.circle(0, 0, 23, 0x0a0a0a, 0.32); // keeps icons legible on any tile colour
    const label = this.add.text(0, 0, TILE_GLYPH[type], { fontFamily: EMOJI_FONT, fontSize: "34px" }).setOrigin(0.5);
    return this.add.container(this.xFor(c), this.yFor(r), [rect, disc, label]).setData("type", type);
  }

  // --- input ---
  private buildInput() {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.busy || this.run.over) return;
      const coord = this.cellAt(p.x, p.y);
      if (coord) this.down = { coord, x: p.x, y: p.y };
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (!this.down || this.busy || this.run.over) {
        this.down = null;
        return;
      }
      const { coord, x, y } = this.down;
      this.down = null;
      const dx = p.x - x;
      const dy = p.y - y;
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      const target: Coord =
        Math.abs(dx) > Math.abs(dy)
          ? { r: coord.r, c: coord.c + (dx > 0 ? 1 : -1) }
          : { r: coord.r + (dy > 0 ? 1 : -1), c: coord.c };
      if (target.c < 0 || target.c >= W || target.r < 0 || target.r >= H) return;
      void this.trySwap(coord, target);
    });
  }

  // --- per-frame: scroll pressure (only while engaged) + sprite placement ---
  update(_time: number, delta: number) {
    if (this.phase === "fight" && !this.run.over) scroll(this.run, SCROLL_PER_SEC * (delta / 1000));

    // pan the world while the hero runs to the next foe; hold still in a fight
    const worldSpeed = this.phase === "advance" && !this.run.over ? WORLD_SCROLL : 0;
    if (worldSpeed > 0) {
      const d = worldSpeed * (delta / 1000);
      // each layer moves at its depth factor; tilePositionX is texture-space (magnified by tileScale)
      for (const p of this.parallax) p.sprite.tilePositionX += (d * p.scroll) / p.sprite.tileScaleX;
      this.floor.tilePositionX += d / this.floor.tileScaleX;
    }

    const heroX = this.heroXForPressure();
    this.hero.x = heroX;
    if (this.orc && this.phase === "fight") this.orc.x = heroX + ENGAGE_GAP; // enemy pushes the hero toward the skull
    if (this.orc) {
      const barY = GROUND_Y - 62; // above the orc's head
      this.enemyHpBg.setPosition(this.orc.x, barY);
      this.enemyHpBar.setPosition(this.orc.x - HP_W / 2, barY);
    }

    this.pressureFill.scaleX = Math.max(0.001, this.run.pressure);
    this.pressureFill.fillColor = lerpColor(0x4caf50, 0xe53935, this.run.pressure);

    if (this.run.over && !this.overShown) this.showGameOver();
  }

  // ================= combat / runner =================

  private spawnOrc() {
    if (this.run.over) return;
    if (!this.run.enemy) spawnNext(this.run);
    if (!this.run.enemy) return;
    this.orcDying = false;
    this.phase = "advance";
    this.hero.play("hero-walk", true); // stride forward while the foe approaches

    const orc = this.add
      .sprite(ENTER_X, GROUND_Y, "orc-walk")
      .setOrigin(0.5, ORC_FOOT)
      .setScale(SPRITE_SCALE)
      .setFlipX(true) // face left, toward the hero
      .play("orc-walk");
    this.orc = orc;
    this.enemyHpBg.setVisible(true);
    this.enemyHpBar.setVisible(true);
    this.updateEnemyBar();

    this.tweens.add({
      targets: orc,
      x: this.heroXForPressure() + ENGAGE_GAP,
      duration: WALK_IN_MS,
      ease: "Sine.easeOut",
      onComplete: () => this.enterFight(),
    });
  }

  private enterFight() {
    if (this.run.over || !this.orc || this.orcDying) return;
    this.phase = "fight";
    this.orc.play("orc-idle");
    this.hero.play("hero-idle", true);
  }

  private updateEnemyBar() {
    const e = this.run.enemy;
    this.enemyHpBar.scaleX = e && !this.orcDying ? Math.max(0, e.hp / e.maxHp) : 0;
  }

  private async trySwap(a: Coord, b: Coord) {
    this.busy = true;
    const ta = this.tiles[a.r][a.c];
    const tb = this.tiles[b.r][b.c];
    if (!ta || !tb) {
      this.busy = false;
      return;
    }
    swap(this.grid, a, b);
    const makesMatch = findMatches(this.grid).length > 0;
    this.tiles[a.r][a.c] = tb;
    this.tiles[b.r][b.c] = ta;
    await Promise.all([this.moveTo(tb, a.r, a.c), this.moveTo(ta, b.r, b.c)]);

    if (!makesMatch) {
      swap(this.grid, a, b);
      this.tiles[a.r][a.c] = ta;
      this.tiles[b.r][b.c] = tb;
      await Promise.all([this.moveTo(ta, a.r, a.c), this.moveTo(tb, b.r, b.c)]);
      this.busy = false;
      return;
    }

    await this.resolve();
    if (!this.run.over && !hasPossibleMove(this.grid)) this.rebuildBoard();
    this.busy = false;
  }

  private async resolve() {
    while (true) {
      const matches = findMatches(this.grid);
      if (matches.length === 0) break;

      const counts: Record<number, number> = {};
      const cleared = new Set<string>();
      for (const m of matches)
        for (const cell of m.cells) {
          const key = cell.r + "," + cell.c;
          if (cleared.has(key)) continue;
          cleared.add(key);
          counts[this.grid[cell.r][cell.c]] = (counts[this.grid[cell.r][cell.c]] ?? 0) + 1;
        }

      const fades: Promise<void>[] = [];
      cleared.forEach((key) => {
        const [r, c] = key.split(",").map(Number);
        const t = this.tiles[r][c];
        if (t) fades.push(this.fadeOut(t));
        this.tiles[r][c] = null;
        this.grid[r][c] = EMPTY;
      });
      await Promise.all(fades);

      const outcome = applyMatches(this.run, counts);
      this.onCombat(outcome.damage, outcome.killed);
      this.refreshHud();

      await this.collapse();
    }
  }

  private onCombat(damage: number, killed: boolean) {
    if (damage > 0 && this.orc && !this.orcDying) {
      this.hero.play("hero-attack").once("animationcomplete", () => {
        if (!this.run.over) this.hero.play(this.heroBaseAnim(), true);
      });
      this.floatDamage(damage);
      this.updateEnemyBar();
      if (!killed) {
        this.orc.play("orc-hurt").once("animationcomplete", () => {
          if (this.orc && !this.orcDying) this.orc.play(this.phase === "fight" ? "orc-idle" : "orc-walk");
        });
      }
    }
    if (killed) this.killOrc();
  }

  private killOrc() {
    this.orcDying = true;
    this.phase = "advance";
    this.updateEnemyBar();
    this.enemyHpBg.setVisible(false);
    this.enemyHpBar.setVisible(false);
    this.hero.play("hero-walk", true); // surge forward
    this.time.delayedCall(600, () => {
      if (!this.run.over) this.hero.play("hero-idle", true);
    });

    const dying = this.orc;
    this.orc = null;
    if (dying) {
      this.tweens.killTweensOf(dying);
      dying.play("orc-death");
      dying.once("animationcomplete", () => {
        this.tweens.add({ targets: dying, alpha: 0, duration: 260, onComplete: () => dying.destroy() });
      });
    }

    this.time.delayedCall(760, () => {
      if (this.run.over) return;
      spawnNext(this.run);
      this.spawnOrc();
      this.refreshHud();
    });
  }

  private strike() {
    if (this.run.over || this.phase !== "fight" || this.orcDying || !this.orc || !this.run.enemy) return;
    const net = enemyStrike(this.run);
    this.orc.play("orc-attack").once("animationcomplete", () => {
      if (this.orc && !this.orcDying) this.orc.play("orc-idle");
    });
    if (net > 0) {
      this.cameras.main.shake(150, 0.006);
      this.hero.setTint(0xff8888);
      this.time.delayedCall(130, () => this.hero.clearTint());
    }
  }

  private floatDamage(n: number) {
    const t = this.add
      .text(this.orc?.x ?? SAFE_X, GROUND_Y - 78, `-${n}`, {
        fontFamily: "monospace",
        fontStyle: "bold",
        fontSize: "24px",
        color: "#ffd24a",
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: t, y: t.y - 38, alpha: 0, duration: 640, ease: "Quad.easeOut", onComplete: () => t.destroy() });
  }

  private showGameOver() {
    this.overShown = true;
    this.orc?.stop();
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05060a, 0.72);
    this.add
      .text(GAME_W / 2, GAME_H / 2 - 40, "THE DARK TAKES YOU", { fontFamily: "monospace", fontStyle: "bold", fontSize: "34px", color: "#e6e8ee" })
      .setOrigin(0.5);
    this.add
      .text(GAME_W / 2, GAME_H / 2 + 6, `Depth ${this.run.killed}    Score ${this.run.score}`, { fontFamily: "monospace", fontSize: "20px", color: "#ffe08a" })
      .setOrigin(0.5);
    const hint = this.add
      .text(GAME_W / 2, GAME_H / 2 + 54, "tap to descend again", { fontFamily: "monospace", fontSize: "16px", color: "#9aa0ab" })
      .setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });
    this.time.delayedCall(450, () => this.input.once("pointerdown", () => this.scene.restart()));
  }

  // --- tile tweens (shared by swap / collapse) ---
  private moveTo(t: Phaser.GameObjects.Container, r: number, c: number): Promise<void> {
    return new Promise((res) => {
      this.tweens.add({ targets: t, x: this.xFor(c), y: this.yFor(r), duration: 140, ease: "Quad.easeInOut", onComplete: () => res() });
    });
  }
  private fadeOut(t: Phaser.GameObjects.Container): Promise<void> {
    return new Promise((res) => {
      this.tweens.add({ targets: t, scale: 0, alpha: 0, duration: 130, ease: "Back.easeIn", onComplete: () => { t.destroy(); res(); } });
    });
  }
  private async collapse() {
    const anims: Promise<void>[] = [];
    for (let c = 0; c < W; c++) {
      let write = H - 1;
      for (let r = H - 1; r >= 0; r--) {
        const t = this.tiles[r][c];
        if (!t) continue;
        if (write !== r) {
          this.grid[write][c] = this.grid[r][c];
          this.grid[r][c] = EMPTY;
          this.tiles[write][c] = t;
          this.tiles[r][c] = null;
          anims.push(this.moveTo(t, write, c));
        }
        write--;
      }
      const spawned = write + 1;
      for (let r = write; r >= 0; r--) {
        const type = Math.floor(Math.random() * TYPES);
        this.grid[r][c] = type;
        const t = this.makeTile(r, c, type);
        t.y = this.yFor(r - spawned);
        this.tiles[r][c] = t;
        anims.push(this.moveTo(t, r, c));
      }
    }
    await Promise.all(anims);
  }
  private rebuildBoard() {
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        this.tiles[r][c]?.destroy();
        this.tiles[r][c] = null;
      }
    this.grid = makeInitialGrid();
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) this.tiles[r][c] = this.makeTile(r, c, this.grid[r][c]);
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_W,
  height: GAME_H,
  parent: "game",
  backgroundColor: "#0a0b0f",
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [GameScene],
});

// Dev-only handle for debugging; stripped from production builds.
if (import.meta.env.DEV) (globalThis as unknown as { __mbGame: Phaser.Game }).__mbGame = game;
