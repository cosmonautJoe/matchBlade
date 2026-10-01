import Phaser from "phaser";

// The original player artwork and animation timing, shared by every scene.
export const PLAYER_SOURCE = "sprites/warrior.png";
export const PLAYER_TEXTURE = "player-original";
export const PLAYER_DENSITY = 1;
export const PLAYER_FRAME_W = 80;
export const PLAYER_FRAME_H = 64;
export const PLAYER_ORIGIN = 47 / 64;
const COLUMNS = 16;
const definitions = [
  { key: "hero-idle", start: 0, end: 7, fps: 8, repeat: -1 },
  { key: "hero-walk", start: 48, end: 55, fps: 15, repeat: -1 },
  { key: "hero-attack", start: 144, end: 150, fps: 18, repeat: 0 },
  { key: "hero-attack2", start: 160, end: 164, fps: 18, repeat: 0 },
  { key: "hero-attack3", start: 176, end: 183, fps: 18, repeat: 0 },
  { key: "hero-spell", start: 192, end: 207, fps: 18, repeat: 0 },
  { key: "hero-death", start: 368, end: 374, fps: 10, repeat: 0 },
];
export const PLAYER_ANIMATIONS = definitions.map(anim => ({
  ...anim, frames: Array.from({ length: anim.end - anim.start + 1 }, (_, i) => anim.start + i),
}));
export const PLAYER_FRAME_COUNT = PLAYER_ANIMATIONS.reduce((n, a) => n + a.frames.length, 0);
export const playerIdleFrame = (seconds: number) => Math.floor(seconds * 8) % 8;

let prepared: HTMLCanvasElement | undefined;
export function preparePlayerSheet(source: HTMLImageElement): HTMLCanvasElement {
  if (prepared) return prepared;
  const sheet = document.createElement("canvas");
  sheet.width = source.naturalWidth; sheet.height = source.naturalHeight;
  sheet.getContext("2d")!.drawImage(source, 0, 0);
  return prepared = sheet;
}
export function preloadPlayer(scene: Phaser.Scene) {
  if (!scene.textures.exists("player-source")) scene.load.image("player-source", import.meta.env.BASE_URL + PLAYER_SOURCE);
}
export function createPlayerAnimations(scene: Phaser.Scene) {
  if (!scene.textures.exists(PLAYER_TEXTURE)) {
    const source = scene.textures.get("player-source").getSourceImage() as HTMLImageElement;
    scene.textures.addSpriteSheet(PLAYER_TEXTURE, source, { frameWidth: PLAYER_FRAME_W, frameHeight: PLAYER_FRAME_H });
  }
  for (const anim of PLAYER_ANIMATIONS) if (!scene.anims.exists(anim.key)) {
    scene.anims.create({ key: anim.key, frames: scene.anims.generateFrameNumbers(PLAYER_TEXTURE, { frames: anim.frames }), frameRate: anim.fps, repeat: anim.repeat });
  }
}
export function drawPlayerFrame(ctx: CanvasRenderingContext2D, sheet: HTMLCanvasElement, frame: number, x: number, y: number, width: number, height: number) {
  ctx.drawImage(sheet, frame % COLUMNS * PLAYER_FRAME_W, Math.floor(frame / COLUMNS) * PLAYER_FRAME_H, PLAYER_FRAME_W, PLAYER_FRAME_H, x, y, width, height);
}
