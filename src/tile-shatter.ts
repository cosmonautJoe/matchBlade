import Phaser from "phaser";
import { TILE_FACE_SIZE, TILE_KEYS } from "./tile-art";

type Point = { x: number; y: number };
type Shard = { key: string; cx: number; cy: number };
type Fragment = { image: Phaser.GameObjects.Image; vx: number; vy: number; vr: number; life: number };
// Reuse baked artwork between runs, including the centroid for each cut piece.
const cachedPatterns = new WeakMap<Phaser.Textures.TextureManager, Map<string, Shard[][]>>();

/** The original irregular impact cracks: a jittered center fanned to the perimeter. */
function crackTriangles(size: number): Point[][] {
  const center = { x: size / 2 + (Math.random() * 2 - 1) * size * .22,
    y: size / 2 + (Math.random() * 2 - 1) * size * .22 };
  const boundary: Point[] = [];
  for (let side = 0; side < 4; side++) {
    for (let at = 0; at < size; at += size * (.38 + Math.random() * .32)) {
      boundary.push(side === 0 ? { x: at, y: 0 }
        : side === 1 ? { x: size, y: at }
        : side === 2 ? { x: size - at, y: size } : { x: 0, y: size - at });
    }
  }
  return boundary.map((point, i) => [center, point, boundary[(i + 1) % boundary.length]]);
}

function patternsFor(scene: Phaser.Scene, texture: string): Shard[][] {
  let cache = cachedPatterns.get(scene.textures);
  if (!cache) { cache = new Map(); cachedPatterns.set(scene.textures, cache); }
  const cached = cache.get(texture);
  if (cached) return cached;
  const size = TILE_FACE_SIZE;
  const source = scene.textures.get(texture).getSourceImage() as CanvasImageSource;
  const patterns = Array.from({ length: 3 }, (_, pattern) => crackTriangles(size).map((triangle, i) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const g = canvas.getContext("2d")!;
    g.beginPath(); g.moveTo(triangle[0].x, triangle[0].y);
    g.lineTo(triangle[1].x, triangle[1].y); g.lineTo(triangle[2].x, triangle[2].y);
    g.closePath(); g.clip();
    g.drawImage(source, 0, 0, size, size);
    const key = `tile-shard-v067-${texture}-${pattern}-${i}`;
    scene.textures.addCanvas(key, canvas)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return { key, cx: (triangle[0].x + triangle[1].x + triangle[2].x) / 3,
      cy: (triangle[0].y + triangle[1].y + triangle[2].y) / 3 };
  }));
  cache.set(texture, patterns);
  return patterns;
}

/** Whole faces break into real textured pieces, with the original burst and gravity. */
export class TileShatter {
  private fragments: Fragment[] = [];

  constructor(private scene: Phaser.Scene) {
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clear());
  }

  burst(parent: Phaser.GameObjects.Container, x: number, y: number, type: number) {
    const patterns = patternsFor(this.scene, TILE_KEYS[type]);
    const pieces = patterns[Math.floor(Math.random() * patterns.length)];
    for (const piece of pieces) {
      const ox = piece.cx - TILE_FACE_SIZE / 2, oy = piece.cy - TILE_FACE_SIZE / 2;
      const image = this.scene.add.image(x + ox, y + oy, piece.key)
        .setOrigin(piece.cx / TILE_FACE_SIZE, piece.cy / TILE_FACE_SIZE).setDepth(41);
      parent.add(image);
      this.fragments.push({ image, vx: ox * 5 + (Math.random() * 2 - 1) * 40,
        vy: oy * 3 - 90 - Math.random() * 130, vr: (Math.random() * 2 - 1) * 8,
        life: .8 + Math.random() * .4 });
    }
  }

  update(delta: number) {
    const dt = Math.min(.05, delta / 1000);
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const piece = this.fragments[i];
      piece.vy += 1500 * dt;
      piece.image.x += piece.vx * dt; piece.image.y += piece.vy * dt;
      piece.image.rotation += piece.vr * dt; piece.life -= dt;
      if (piece.life < .3) piece.image.setAlpha(Math.max(0, piece.life / .3));
      if (piece.life <= 0) { piece.image.destroy(); this.fragments.splice(i, 1); }
    }
  }

  clear() {
    for (const piece of this.fragments) piece.image.destroy();
    this.fragments = [];
  }
}
