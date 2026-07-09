/**
 * matchBlade — boot scene.
 *
 * Renders a placeholder runner lane on top and a playable swap match-3 board
 * below (classic Candy Crush / Bejeweled input). The board model lives in
 * board.ts; this file owns rendering, input, and the animated cascade.
 *
 * This is build-order step 1–2 (grid interaction + match resolution). The
 * runner/combat/meta systems from DESIGN.md come next.
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

// ---- layout ---------------------------------------------------------------
const TILE = 80; // px per cell
const GRID_W = W * TILE; // 640
const GRID_H = H * TILE; // 560
const LANE_H = 120;
const PAD = 20;
const GAME_W = GRID_W + PAD * 2; // 680
const GAME_H = LANE_H + GRID_H + PAD * 3; // lane + grid + margins
const GRID_X = PAD; // left of grid
const GRID_Y = LANE_H + PAD * 2; // top of grid

// ---- placeholder tile look (see DESIGN.md §3) -----------------------------
// Colours carry identity; single-letter glyphs always render (real art later).
const TILE_COLORS = [
  0xd94b4b, // 0 sword     red
  0x9b59b6, // 1 staff     purple
  0x4b7bd9, // 2 shield    blue
  0x54c26e, // 3 key       green
  0xf2c14e, // 4 treasure  gold
  0x9c6b3f, // 5 wood      brown
  0x8a8f98, // 6 ore       gray
];
const TILE_GLYPH = ["A", "M", "D", "K", "T", "W", "O"]; // Attack/Magic/Defend/Key/Treasure/Wood/Ore
const TILE_NAME = ["sword", "staff", "shield", "key", "treasure", "wood", "ore"];

class BoardScene extends Phaser.Scene {
  private grid: number[][] = [];
  private tiles: (Phaser.GameObjects.Container | null)[][] = [];
  private busy = false;
  private down: { coord: Coord; x: number; y: number } | null = null;
  private hud!: Phaser.GameObjects.Text;

  constructor() {
    super("board");
  }

  create() {
    this.buildLane();
    this.buildBoard();
    this.buildInput();
  }

  // --- coordinate helpers (container origin is its centre) ---
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

  // --- placeholder top lane + HUD ---
  private buildLane() {
    this.add
      .rectangle(GAME_W / 2, PAD + LANE_H / 2, GRID_W, LANE_H, 0x16181f)
      .setStrokeStyle(2, 0x2a2d38);
    const midY = PAD + LANE_H / 2;
    // skull / death marker at far left
    this.add.text(GRID_X + 14, midY, "☠", { fontSize: "34px", color: "#c0424a" }).setOrigin(0, 0.5);
    // hero
    this.add.rectangle(GRID_X + 120, midY, 44, 60, 0x5aa9e6).setStrokeStyle(2, 0x101216);
    this.add
      .text(GRID_X + 120, midY, "@", { fontFamily: "monospace", fontSize: "26px", color: "#08131f" })
      .setOrigin(0.5);
    // enemy ahead
    this.add.rectangle(GRID_X + 300, midY, 44, 60, 0xb0b6bf).setStrokeStyle(2, 0x101216);
    this.add.text(GRID_X + 300, midY, "♠", { fontSize: "24px", color: "#1a1c22" }).setOrigin(0.5);

    this.hud = this.add
      .text(GAME_W - PAD - 8, midY, "swap to match", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#9aa0ab",
        align: "right",
      })
      .setOrigin(1, 0.5);
  }

  // --- board ---
  private buildBoard() {
    // grid backdrop
    this.add
      .rectangle(GAME_W / 2, GRID_Y + GRID_H / 2, GRID_W + 8, GRID_H + 8, 0x0e1015)
      .setStrokeStyle(2, 0x2a2d38);

    this.grid = makeInitialGrid();
    this.tiles = Array.from({ length: H }, () =>
      Array<Phaser.GameObjects.Container | null>(W).fill(null),
    );
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) this.tiles[r][c] = this.makeTile(r, c, this.grid[r][c]);
  }

  private makeTile(r: number, c: number, type: number): Phaser.GameObjects.Container {
    const rect = this.add
      .rectangle(0, 0, TILE - 8, TILE - 8, TILE_COLORS[type])
      .setStrokeStyle(2, 0x000000, 0.25);
    const label = this.add
      .text(0, 0, TILE_GLYPH[type], {
        fontFamily: "monospace",
        fontStyle: "bold",
        fontSize: "30px",
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setAlpha(0.85);
    return this.add.container(this.xFor(c), this.yFor(r), [rect, label]).setData("type", type);
  }

  // --- input: drag a tile onto a neighbour ---
  private buildInput() {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.busy) return;
      const coord = this.cellAt(p.x, p.y);
      if (coord) this.down = { coord, x: p.x, y: p.y };
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (!this.down || this.busy) {
        this.down = null;
        return;
      }
      const { coord, x, y } = this.down;
      this.down = null;
      const dx = p.x - x;
      const dy = p.y - y;
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return; // treat as a tap, not a drag
      // dominant axis -> pick the adjacent neighbour
      const target: Coord =
        Math.abs(dx) > Math.abs(dy)
          ? { r: coord.r, c: coord.c + (dx > 0 ? 1 : -1) }
          : { r: coord.r + (dy > 0 ? 1 : -1), c: coord.c };
      if (target.c < 0 || target.c >= W || target.r < 0 || target.r >= H) return;
      void this.trySwap(coord, target);
    });
  }

  // --- animated swap + resolve ---
  private moveTo(t: Phaser.GameObjects.Container, r: number, c: number): Promise<void> {
    return new Promise((res) => {
      this.tweens.add({
        targets: t,
        x: this.xFor(c),
        y: this.yFor(r),
        duration: 140,
        ease: "Quad.easeInOut",
        onComplete: () => res(),
      });
    });
  }

  private fadeOut(t: Phaser.GameObjects.Container): Promise<void> {
    return new Promise((res) => {
      this.tweens.add({
        targets: t,
        scale: 0,
        alpha: 0,
        duration: 130,
        ease: "Back.easeIn",
        onComplete: () => {
          t.destroy();
          res();
        },
      });
    });
  }

  private async trySwap(a: Coord, b: Coord) {
    this.busy = true;
    const ta = this.tiles[a.r][a.c];
    const tb = this.tiles[b.r][b.c];
    if (!ta || !tb) {
      this.busy = false;
      return;
    }

    // commit to model + tile array, animate the visual swap
    swap(this.grid, a, b);
    const makesMatch = findMatches(this.grid).length > 0;
    this.tiles[a.r][a.c] = tb;
    this.tiles[b.r][b.c] = ta;
    await Promise.all([this.moveTo(tb, a.r, a.c), this.moveTo(ta, b.r, b.c)]);

    if (!makesMatch) {
      // illegal swap: animate back
      swap(this.grid, a, b);
      this.tiles[a.r][a.c] = ta;
      this.tiles[b.r][b.c] = tb;
      await Promise.all([this.moveTo(ta, a.r, a.c), this.moveTo(tb, b.r, b.c)]);
      this.hud.setText("no match — reverted");
      this.busy = false;
      return;
    }

    await this.resolve();
    if (!hasPossibleMove(this.grid)) {
      this.hud.setText("no moves — reshuffling");
      this.rebuild();
    }
    this.busy = false;
  }

  private async resolve() {
    let cascade = 0;
    while (true) {
      const matches = findMatches(this.grid);
      if (matches.length === 0) break;
      cascade++;

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
      this.reportEffects(counts, cascade);
      await this.collapse();
    }
  }

  /** Animated gravity + refill (visual twin of board.ts collapseAndRefill). */
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
      // rows [0..write] are now empty: drop in fresh tiles from above
      const spawned = write + 1;
      for (let r = write; r >= 0; r--) {
        const type = Math.floor(Math.random() * TYPES);
        this.grid[r][c] = type;
        const t = this.makeTile(r, c, type);
        t.y = this.yFor(r - spawned); // start above the visible board
        this.tiles[r][c] = t;
        anims.push(this.moveTo(t, r, c));
      }
    }
    await Promise.all(anims);
  }

  private reportEffects(counts: Record<number, number>, cascade: number) {
    const parts = Object.entries(counts)
      .map(([type, n]) => `${TILE_NAME[+type]} +${n}`)
      .join("  ");
    this.hud.setText((cascade > 1 ? `x${cascade}  ` : "") + parts);
  }

  private rebuild() {
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
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BoardScene],
});

// Dev-only handle for debugging / snapshots; stripped from production builds.
if (import.meta.env.DEV) (globalThis as unknown as { __mbGame: Phaser.Game }).__mbGame = game;
