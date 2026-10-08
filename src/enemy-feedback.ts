import Phaser from "phaser";
import type { Defense } from "./run";

type BodyBounds = { x: number; y: number; w: number; h: number };
export type EnemyWear = { update(hp: number): void; destroy(): void };
export type EnemyFinish = { destroy(): void };

const bodyBounds = new WeakMap<Phaser.Textures.Frame, BodyBounds>();
let scratch: HTMLCanvasElement | undefined;
let wearId = 0;

/** Packs have very different transparent margins. Measure visible art, not sheet size. */
function body(frame: Phaser.Textures.Frame): BodyBounds {
  const cached = bodyBounds.get(frame);
  if (cached) return cached;
  scratch ??= document.createElement("canvas");
  scratch.width = frame.realWidth; scratch.height = frame.realHeight;
  const ctx = scratch.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(frame.source.image as CanvasImageSource,
    frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
    frame.x, frame.y, frame.width, frame.height);
  let result = { x: frame.x, y: frame.y, w: frame.width, h: frame.height };
  try {
    const pixels = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
    let left = scratch.width, top = scratch.height, right = -1, bottom = -1;
    for (let y = 0; y < scratch.height; y++) for (let x = 0; x < scratch.width; x++) {
      if (pixels[(y * scratch.width + x) * 4 + 3] < 40) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    if (right >= left) result = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  } catch { /* Local textures are readable; retain frame bounds for other image sources. */ }
  bodyBounds.set(frame, result);
  return result;
}

/** Marks are baked in color and alpha-clipped, so Canvas and WebGL look alike. */
function drawWear(ctx: CanvasRenderingContext2D, frame: Phaser.Textures.Frame,
  defense: Defense, stage: number) {
  const b = body(frame), unit = Math.max(.75, Math.min(b.w, b.h) / 36);
  const cracks = [[.34, .47, .21], [.63, .57, .25], [.45, .72, .17]];
  ctx.save();
  ctx.translate(b.x, b.y);
  // Uneven shaded scuffs read as wear without recoloring the creature or its face.
  for (let i = 0; i < stage + 1; i++) {
    const [x, y, span] = cracks[i];
    ctx.fillStyle = defense === "ward" ? "rgba(39,26,65,.34)" : "rgba(24,27,32,.34)";
    ctx.beginPath();
    ctx.moveTo(b.w * (x - span * .3), b.h * y);
    ctx.lineTo(b.w * (x + span * .5), b.h * (y - .035));
    ctx.lineTo(b.w * (x + span), b.h * (y + .035));
    ctx.lineTo(b.w * (x + span * .6), b.h * (y + .09));
    ctx.lineTo(b.w * (x - span * .25), b.h * (y + .045));
    ctx.closePath(); ctx.fill();
    if (defense === "none") {
      ctx.strokeStyle = "rgba(219,207,178,.64)"; ctx.lineWidth = unit * .85;
      ctx.beginPath(); ctx.moveTo(b.w * x, b.h * (y + .025));
      ctx.lineTo(b.w * (x + span * .65), b.h * (y + .055)); ctx.stroke();
      continue;
    }
    // Broken, offset segments replace a complete armor/ward outline.
    const points = [[x, y - .075], [x + .035, y], [x - .025, y + .04],
      [x + .055, y + .10], [x + .025, y + .16]];
    ctx.beginPath();
    points.forEach(([px, py], index) => index
      ? ctx.lineTo(px * b.w, py * b.h) : ctx.moveTo(px * b.w, py * b.h));
    ctx.strokeStyle = defense === "ward" ? "rgba(46,25,72,.84)" : "rgba(18,24,31,.94)";
    ctx.lineWidth = unit * 2.3; ctx.stroke();
    ctx.strokeStyle = defense === "ward" ? "rgba(186,164,241,.9)" : "rgba(220,214,195,.86)";
    ctx.lineWidth = unit * .85; ctx.stroke();
  }
  ctx.restore();
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(frame.source.image as CanvasImageSource,
    frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
    frame.x, frame.y, frame.width, frame.height);
  ctx.globalCompositeOperation = "source-over";
}

/** Attach once per regular enemy; feed HP when the corresponding damage lands. */
export function createEnemyWear(scene: Phaser.Scene, parent: Phaser.GameObjects.Container,
  sprite: Phaser.GameObjects.Sprite, options: { defense: Defense; maxHp: number }): EnemyWear {
  let stage = 0, disposed = false, listening = false;
  let image: Phaser.GameObjects.Image | undefined;
  let texture: Phaser.Textures.CanvasTexture | undefined;
  let lastFrame: Phaser.Textures.Frame | undefined;
  let paintedStage = 0;
  const key = `enemy-wear-${++wearId}`;
  const destroy = (source?: Phaser.GameObjects.GameObject) => {
    if (disposed) return;
    disposed = true;
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, sync);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, destroy);
    sprite.off(Phaser.GameObjects.Events.DESTROY, destroy);
    image?.off(Phaser.GameObjects.Events.DESTROY, destroy);
    if (image !== source) image?.destroy();
    if (texture && scene.textures.exists(key)) scene.textures.remove(key);
  };
  const sync = () => {
    if (!sprite.scene || !sprite.active || !parent.scene) { destroy(); return; }
    const frame = sprite.frame;
    if (!texture) {
      texture = scene.textures.createCanvas(key, frame.realWidth, frame.realHeight) ?? undefined;
      if (!texture) return;
      texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      image = scene.add.image(sprite.x, sprite.y, key);
      parent.add(image); parent.moveAbove(image, sprite);
      image.once(Phaser.GameObjects.Events.DESTROY, destroy);
    }
    if (frame !== lastFrame || paintedStage !== stage) {
      if (texture.width !== frame.realWidth || texture.height !== frame.realHeight)
        texture.setSize(frame.realWidth, frame.realHeight);
      texture.context.clearRect(0, 0, texture.width, texture.height);
      drawWear(texture.context, frame, options.defense, stage);
      texture.refresh();
      image!.setTexture(key);
      lastFrame = frame; paintedStage = stage;
    }
    image!.setPosition(sprite.x, sprite.y).setOrigin(sprite.originX, sprite.originY)
      .setScale(sprite.scaleX, sprite.scaleY).setRotation(sprite.rotation)
      .setFlip(sprite.flipX, sprite.flipY).setAlpha(sprite.alpha * (stage === 1 ? .76 : 1))
      .setVisible(sprite.visible && stage > 0);
  };
  const update = (hp: number) => {
    if (disposed) return;
    if (hp <= 0) { destroy(); return; }
    const fraction = hp / Math.max(1, options.maxHp);
    stage = fraction <= .3 ? 2 : fraction <= .6 ? 1 : 0;
    if (!stage) {
      image?.setVisible(false);
      if (listening) scene.events.off(Phaser.Scenes.Events.POST_UPDATE, sync);
      listening = false;
      return;
    }
    if (!listening) {
      listening = true; scene.events.on(Phaser.Scenes.Events.POST_UPDATE, sync);
    }
    sync();
  };
  sprite.once(Phaser.GameObjects.Events.DESTROY, destroy);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);
  return { update, destroy };
}

function impactPoint(sprite: Phaser.GameObjects.Sprite) {
  const b = body(sprite.frame);
  let x = b.x + b.w * .5 - sprite.displayOriginX;
  let y = b.y + b.h * .53 - sprite.displayOriginY;
  if (sprite.flipX) x = -x;
  if (sprite.flipY) y = -y;
  x *= sprite.scaleX; y *= sprite.scaleY;
  const cos = Math.cos(sprite.rotation), sin = Math.sin(sprite.rotation);
  return { x: sprite.x + x * cos - y * sin, y: sprite.y + x * sin + y * cos,
    size: Phaser.Math.Clamp(Math.max(b.w * Math.abs(sprite.scaleX), b.h * Math.abs(sprite.scaleY)) * .48, 27, 58) };
}

/** Call after the actor's death animation/tweens are selected. No combat state changes. */
export function finishingBlow(scene: Phaser.Scene, parent: Phaser.GameObjects.Container,
  sprite: Phaser.GameObjects.Sprite, kind: "sword" | "magic", groundY: number): EnemyFinish {
  if (!sprite.active || !sprite.scene) return { destroy() {} };
  const impact = impactPoint(sprite), magic = kind === "magic";
  const color = magic ? 0xc394ff : 0xffd89b, edge = magic ? 0xf4ddff : 0xf6ffff;
  const g = scene.add.graphics().setDepth(48);
  parent.add(g);
  let disposed = false, moved = 0;
  let tween: Phaser.Tweens.Tween | undefined;
  let resume: Phaser.Time.TimerEvent | undefined;
  const speed = sprite.anims.timeScale;
  sprite.anims.timeScale = 0;
  const restoreSpeed = () => {
    if (sprite.scene && sprite.anims?.timeScale === 0) sprite.anims.timeScale = speed;
  };
  const destroy = (source?: Phaser.GameObjects.GameObject) => {
    if (disposed) return;
    disposed = true;
    resume?.remove(false); restoreSpeed(); tween?.remove();
    sprite.off(Phaser.GameObjects.Events.DESTROY, destroy);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, destroy);
    g.off(Phaser.GameObjects.Events.DESTROY, destroy);
    if (g !== source) g.destroy();
  };
  resume = scene.time.delayedCall(50, restoreSpeed);
  const draw = (p: number) => {
    if (!sprite.scene || !parent.scene) { destroy(); return; }
    g.clear();
    const travel = 1 - Math.pow(1 - p, 3), alpha = Math.pow(1 - p, 1.5);
    const push = 32 * Math.min(1, Math.max(0, (p - .14) / .6));
    // Add only our displacement; don't cancel another effect's tween or touch scale.
    sprite.x += push - moved; moved = push;
    for (let i = 0; i < (magic ? 10 : 8); i++) {
      const a = magic ? i * Math.PI * 2 / 10 : -.98 + i * .29;
      const radius = 4 + travel * (impact.size * .78 + i % 3 * 8);
      const length = (magic ? 13 : 24) * (1 - p * .65);
      const width = (magic ? 3.1 : 1.9) * (1 - p * .4);
      const cos = Math.cos(a), sin = Math.sin(a);
      const x = impact.x + cos * radius, y = impact.y + sin * radius;
      g.fillStyle(i % 3 ? color : edge, alpha).fillPoints([
        { x: x + cos * length, y: y + sin * length },
        { x: x - sin * width, y: y + cos * width },
        { x: x - cos * length * .35, y: y - sin * length * .35 },
        { x: x + sin * width, y: y - cos * width },
      ], true);
    }
    if (p < .42) {
      const flash = (1 - p / .42) * impact.size;
      for (const angle of magic ? [-.8, .8] : [-.65, .92]) {
        const cos = Math.cos(angle), sin = Math.sin(angle), width = magic ? 6 : 3.6;
        g.fillStyle(edge, alpha).fillPoints([
          { x: impact.x - cos * flash, y: impact.y - sin * flash },
          { x: impact.x - sin * width, y: impact.y + cos * width },
          { x: impact.x + cos * flash, y: impact.y + sin * flash },
          { x: impact.x + sin * width, y: impact.y - cos * width },
        ], true);
      }
    }
    for (let i = 0; i < 4; i++) {
      const x = impact.x + 9 + travel * (18 + i * 11);
      const y = groundY - 3 - Math.sin(p * Math.PI) * (6 + i % 2 * 8);
      g.fillStyle(0xd4c7a8, alpha * .5).fillEllipse(x, y, (8 + i * 2) * (1 - p), 3);
    }
  };
  sprite.once(Phaser.GameObjects.Events.DESTROY, destroy);
  g.once(Phaser.GameObjects.Events.DESTROY, destroy);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);
  draw(0);
  const clock = { p: 0 };
  tween = scene.tweens.add({ targets: clock, p: 1, duration: 350,
    onUpdate: () => draw(clock.p), onComplete: () => destroy() });
  return { destroy };
}
