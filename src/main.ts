import Phaser from "phaser";
import { W, H, makeInitialGrid } from "./board.js";

// Placeholder tile palette, one per tile type (see DESIGN.md for meanings):
//   0 sword  1 staff  2 shield  3 key  4 treasure  5 wood  6 ore
const TILE_COLORS = [0x4aa3ff, 0xc06bff, 0xd7dde6, 0x49d98a, 0xffcf4d, 0xb5763c, 0x8b929e];
const TILE_GLYPH = ["swd", "stf", "shd", "key", "tsr", "wd", "ore"];

const TILE = 54;
const GAP = 4;
const LANE_H = 120;
const MARGIN = 16;

const BOARD_W = W * (TILE + GAP) - GAP;
const BOARD_H = H * (TILE + GAP) - GAP;
const GAME_W = BOARD_W + MARGIN * 2;
const GAME_H = LANE_H + BOARD_H + MARGIN * 3;

/**
 * Placeholder boot scene. Draws the two-zone layout — a runner lane on top and
 * the match grid below — with colored-block tiles. This exists only to prove
 * the toolchain runs and to show the intended layout; the real game (slide
 * input, combat, scrolling, etc.) is built from here. See DESIGN.md.
 */
class BootScene extends Phaser.Scene {
  create() {
    // --- Runner lane (top) -------------------------------------------------
    const laneY = MARGIN;
    this.add.rectangle(MARGIN, laneY, BOARD_W, LANE_H, 0x2a2f3a).setOrigin(0, 0);
    this.add.rectangle(MARGIN, laneY, BOARD_W, LANE_H).setOrigin(0, 0).setStrokeStyle(2, 0x555c6b);

    // death "skull" marker on the far left
    this.add.rectangle(MARGIN + 10, laneY + LANE_H / 2, 22, 30, 0x772222).setOrigin(0, 0.5);
    this.add.text(MARGIN + 6, laneY + LANE_H / 2 - 8, "X", { fontSize: "18px", color: "#e88" });

    // hero (placeholder) advancing right
    this.add.rectangle(MARGIN + BOARD_W * 0.28, laneY + LANE_H / 2, 26, 40, 0x8fd0ff).setOrigin(0.5);
    this.add.text(MARGIN + BOARD_W * 0.28, laneY + LANE_H / 2 + 30, "hero", { fontSize: "11px", color: "#cfe4ff" }).setOrigin(0.5);

    // an enemy ahead
    this.add.rectangle(MARGIN + BOARD_W * 0.5, laneY + LANE_H / 2, 26, 38, 0xff6b7a).setOrigin(0.5);
    this.add.text(MARGIN + BOARD_W * 0.5, laneY + LANE_H / 2 + 30, "enemy", { fontSize: "11px", color: "#ffb3ba" }).setOrigin(0.5);

    this.add.text(GAME_W - MARGIN, laneY + 8, "0", { fontSize: "20px", color: "#ffffff" }).setOrigin(1, 0);

    // --- Match grid (bottom) ----------------------------------------------
    const gridX = MARGIN;
    const gridY = MARGIN * 2 + LANE_H;
    this.add.rectangle(gridX - 4, gridY - 4, BOARD_W + 8, BOARD_H + 8, 0x14171f).setOrigin(0, 0);

    const grid = makeInitialGrid();
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const type = grid[r][c];
        const x = gridX + c * (TILE + GAP);
        const y = gridY + r * (TILE + GAP);
        this.add.rectangle(x, y, TILE, TILE, TILE_COLORS[type]).setOrigin(0, 0);
        this.add.text(x + TILE / 2, y + TILE / 2, TILE_GLYPH[type], {
          fontSize: "12px", color: "#0a0b0f", fontStyle: "bold",
        }).setOrigin(0.5);
      }
    }

    this.add.text(GAME_W / 2, GAME_H - 6, "matchBlade — placeholder scaffold", {
      fontSize: "12px", color: "#5a6472",
    }).setOrigin(0.5, 1);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0a0b0f",
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_W,
    height: GAME_H,
  },
  scene: [BootScene],
});
