import type Phaser from "phaser";
import type { Coord } from "./board";

/** Pointer travel is in board coordinates, so touch and mouse use the same threshold. */
export function dragSwapTarget(from: Coord, dx: number, dy: number, cellSize: number, cols: number, rows: number): Coord | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < cellSize * .3) return null;
  const to = Math.abs(dx) > Math.abs(dy)
    ? { r: from.r, c: from.c + Math.sign(dx) }
    : { r: from.r + Math.sign(dy), c: from.c };
  return to.r >= 0 && to.r < rows && to.c >= 0 && to.c < cols ? to : null;
}

type Tile = Phaser.GameObjects.Container;
type Point = { x: number; y: number };

/** Moves artwork only. The grid and tile ownership stay untouched until release. */
export class TileSwapPreview {
  private origins = new Map<Tile, Point>();
  private pair: { a: Tile; b: Tile } | null = null;

  constructor(private scene: Phaser.Scene) {}

  show(a: Tile, b: Tile, from: Point, to: Point) {
    if (this.pair?.a === a && this.pair.b === b) return;
    for (const [tile, origin] of this.origins) if (tile !== a && tile !== b) this.move(tile, origin);
    this.origins.set(a, from); this.origins.set(b, to);
    this.pair = { a, b };
    a.parentContainer?.moveAbove(a, b);
    // Leave a little travel for the release, making the pending swap visibly unfinished.
    this.move(a, { x: from.x + (to.x - from.x) * .72, y: from.y + (to.y - from.y) * .72 });
    this.move(b, { x: to.x + (from.x - to.x) * .72, y: to.y + (from.y - to.y) * .72 });
  }

  cancel(immediate = false) {
    this.pair = null;
    for (const [tile, origin] of this.origins) this.move(tile, origin, immediate, () => {
      // Keep returning tiles tracked so a pause/resize can still finish cancellation.
      if (this.origins.get(tile) === origin && this.pair?.a !== tile && this.pair?.b !== tile)
        this.origins.delete(tile);
    });
  }

  /** Hand the visible positions to the real swap tween, with no snap back first. */
  commit(a: Tile, b: Tile) {
    const keep = this.pair?.a === a && this.pair.b === b;
    for (const [tile, origin] of this.origins) {
      if (!tile.scene) continue;
      if (keep && (tile === a || tile === b)) this.scene.tweens.killTweensOf(tile);
      else this.move(tile, origin, true);
    }
    this.origins.clear(); this.pair = null;
  }

  private move(tile: Tile, point: Point, immediate = false, onComplete?: () => void) {
    if (!tile.scene) { onComplete?.(); return; }
    this.scene.tweens.killTweensOf(tile);
    if (immediate) { tile.setPosition(point.x, point.y); onComplete?.(); }
    else this.scene.tweens.add({ targets: tile, ...point, duration: 110, ease: "Cubic.easeOut", onComplete });
  }
}
