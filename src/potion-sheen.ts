import Phaser from "phaser";
import { TILE_FACE_SIZE, TILE_TEXTURE_DENSITY } from "./tile-art";
import { tileEffectsEnabled, TILE_EFFECTS_CHANGED } from "./tile-effects";

const KEY = "potion-panel-rainbow-v076";
const FRAMES = 48;

/** A soft iridescent panel. The bottle silhouette and metal frame stay untouched. */
function preparePanel(scene: Phaser.Scene) {
  if (scene.textures.exists(KEY)) return;
  const size = TILE_FACE_SIZE * TILE_TEXTURE_DENSITY;
  const mask = document.createElement("canvas");
  mask.width = mask.height = size;
  const g = mask.getContext("2d")!;
  g.scale(TILE_TEXTURE_DENSITY, TILE_TEXTURE_DENSITY);
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.roundRect(8, 8, 68, 68, 5);
  g.fill();
  // A slightly generous cutout follows the existing atlas bottle, including its cork.
  // Feather it just enough to keep a hard color seam off the glass outline.
  const bottle = [[29, 4], [55, 4], [57, 16], [59, 18], [59, 28], [56, 30],
    [64, 36], [70, 45], [72, 57], [69, 68], [61, 75], [50, 80], [32, 80],
    [20, 75], [12, 65], [10, 54], [12, 43], [20, 34], [27, 30], [24, 27],
    [24, 17], [28, 16]];
  g.globalCompositeOperation = "destination-out";
  g.shadowColor = "#ffffff"; g.shadowBlur = 2 * TILE_TEXTURE_DENSITY;
  g.beginPath();
  bottle.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
  g.closePath(); g.fill();

  // Bake the colors themselves: vertex tints disappear in Phaser's Canvas renderer,
  // and interpolating four pale corner colors over teal looked almost colorless.
  // This one shared atlas keeps the rainbow visible without per-frame canvas uploads.
  const columns = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size * columns; canvas.height = size * Math.ceil(FRAMES / columns);
  const ink = canvas.getContext("2d")!;
  for (let frame = 0; frame < FRAMES; frame++) {
    ink.save(); ink.translate(frame % columns * size, Math.floor(frame / columns) * size);
    ink.beginPath(); ink.rect(0, 0, size, size); ink.clip();
    const rainbow = ink.createLinearGradient(0, 0, size, size * .65);
    for (let stop = 0; stop <= 6; stop++) {
      const hue = ((frame / FRAMES + stop / 7) % 1) * 360;
      rainbow.addColorStop(stop / 6, `hsl(${hue},72%,62%)`);
    }
    ink.fillStyle = rainbow; ink.fillRect(0, 0, size, size);
    ink.globalCompositeOperation = "destination-in"; ink.drawImage(mask, 0, 0);
    ink.restore();
  }
  const texture = scene.textures.addCanvas(KEY, canvas)!;
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  for (let frame = 0; frame < FRAMES; frame++)
    texture.add(frame, 0, frame % columns * size, Math.floor(frame / columns) * size, size, size);
  scene.anims.create({ key: KEY, frames: scene.anims.generateFrameNumbers(KEY, { start: 0, end: FRAMES - 1 }),
    frameRate: 4, repeat: -1 });
}

export function decoratePotionSheen(scene: Phaser.Scene, tile: Phaser.GameObjects.Container) {
  preparePanel(scene);
  const sheen = scene.add.sprite(0, 0, KEY, 0).setDisplaySize(TILE_FACE_SIZE, TILE_FACE_SIZE).setAlpha(.62);
  const visual = tile.getData("visual") as Phaser.GameObjects.Container;
  visual.addAt(sheen, 1);
  tile.setData("potionSheen", sheen);
  // A quiet twelve-second loop, with several colors visible from the first frame.
  sheen.play({ key: KEY, startFrame: Phaser.Math.Between(0, FRAMES - 1) });
  const sync = () => {
    const enabled = tileEffectsEnabled();
    sheen.setVisible(enabled);
    if (enabled) sheen.anims.resume(); else sheen.anims.pause();
  };
  sync();
  scene.game.events.on(TILE_EFFECTS_CHANGED, sync);
  tile.once("destroy", () => {
    scene.game.events.off(TILE_EFFECTS_CHANGED, sync);
  });
}
