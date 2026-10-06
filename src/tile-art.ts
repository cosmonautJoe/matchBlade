import Phaser from "phaser";

// Keep texture keys and tile IDs stable for existing saves and boss mechanics.
export const TILE_KEYS = ["tile-sword", "tile-staff", "tile-shield", "tile-key", "tile-treasure", "tile-wood", "tile-ore", "tile-potion"] as const;
const ATLAS_KEY = "tile-atlas-v062";
const STONE_KEY = "tile-stone-v065";
// Visible frame bounds; exclude the almost-transparent gutter around the sprite.
const STONE_RECT = [116, 116, 1022, 1009] as const;
export const TILE_FACE_SIZE = 84;
export const TILE_TEXTURE_DENSITY = 3;
const TILE_BACKINGS = ["#743746", "#553b76", "#395a7c", "#396b49", "#78663b", "#785336", "#635f57", "#32676a"];
// Measured opaque bounds in the 1254px atlas; gutters aren't perfectly uniform.
const TILE_RECTS = [
  [54, 63, 363, 355], [446, 63, 363, 355], [837, 63, 364, 355],
  [54, 443, 363, 354], [446, 443, 363, 354], [837, 443, 364, 354],
  [54, 821, 363, 355], [446, 821, 363, 355],
] as const;

export function preloadTileArt(scene: Phaser.Scene) {
  if (!scene.textures.exists(ATLAS_KEY)) scene.load.image(ATLAS_KEY, "tiles/atlas-v062.png");
  if (!scene.textures.exists(STONE_KEY)) scene.load.image(STONE_KEY, "tiles/stone-v065.png");
}

function tileOutline(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, corner: number) {
  g.beginPath(); g.moveTo(x + corner, y); g.lineTo(x + w - corner, y);
  g.lineTo(x + w, y + corner); g.lineTo(x + w, y + h - corner);
  g.lineTo(x + w - corner, y + h); g.lineTo(x + corner, y + h);
  g.lineTo(x, y + h - corner); g.lineTo(x, y + corner); g.closePath();
}

/** Keep original detail at phone pixel densities; logical faces remain 84×84. */
export function prepareTileArt(scene: Phaser.Scene) {
  if (TILE_KEYS.every(key => scene.textures.exists(key))) return;
  TILE_KEYS.forEach((key, index) => {
    if (scene.textures.exists(key)) return;
    const stone = key === "tile-ore";
    const source = scene.textures.get(stone ? STONE_KEY : ATLAS_KEY).getSourceImage() as HTMLImageElement;
    const [x, y, width, height] = stone ? STONE_RECT : TILE_RECTS[index];
    const face = document.createElement("canvas");
    face.width = face.height = TILE_FACE_SIZE * TILE_TEXTURE_DENSITY;
    const g = face.getContext("2d")!;
    g.scale(TILE_TEXTURE_DENSITY, TILE_TEXTURE_DENSITY);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";

    // A quiet colored backing and a little lower lip separate each face from the board.
    const backing = g.createLinearGradient(0, 0, 0, TILE_FACE_SIZE);
    backing.addColorStop(0, TILE_BACKINGS[index]); backing.addColorStop(1, "#171d28");
    tileOutline(g, .5, .5, 83, 83, 7); g.fillStyle = backing; g.fill();
    g.strokeStyle = "rgba(197,216,235,.24)"; g.lineWidth = .7; g.stroke();
    g.drawImage(source, x, y, width, height, 2, 1.5, 80, 80);

    // A static glass finish carries most of the polish, leaving animated glints occasional.
    g.save(); tileOutline(g, 2, 1.5, 80, 80, 6); g.clip();
    const glass = g.createLinearGradient(0, 1.5, 16, 58);
    glass.addColorStop(0, "rgba(255,255,255,.13)");
    glass.addColorStop(.42, "rgba(235,245,255,.035)");
    glass.addColorStop(.7, "rgba(255,255,255,0)");
    glass.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = glass; g.fillRect(2, 1.5, 80, 80);
    const lowerEdge = g.createLinearGradient(0, 69, 0, 82);
    lowerEdge.addColorStop(0, "rgba(0,0,0,0)"); lowerEdge.addColorStop(1, "rgba(0,0,0,.14)");
    g.fillStyle = lowerEdge; g.fillRect(2, 69, 80, 13);
    g.restore();
    scene.textures.addCanvas(key, face)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
  });
}
