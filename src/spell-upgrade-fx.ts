import Phaser from "phaser";
import { spellStyle } from "./weapon-style";

const W = 96, H = 64, DENSITY = 2, FRAMES = 20, COLS = 5;
const css = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

/** A shared flowing-flame atlas per upgrade grade, including baked color for Canvas. */
function fireTexture(scene: Phaser.Scene, level: number) {
  const look = spellStyle(level), key = `upgrade-fire-${look.grade}`;
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement("canvas");
  canvas.width = W * DENSITY * COLS;
  canvas.height = H * DENSITY * Math.ceil(FRAMES / COLS);
  const ctx = canvas.getContext("2d")!;
  for (let f = 0; f < FRAMES; f++) {
    ctx.save();
    ctx.translate(f % COLS * W * DENSITY, Math.floor(f / COLS) * H * DENSITY);
    ctx.scale(DENSITY, DENSITY);
    const phase = f / FRAMES * Math.PI * 2;
    const glow = ctx.createRadialGradient(66, 32, 2, 66, 32, 29);
    glow.addColorStop(0, css(look.accent) + "80");
    glow.addColorStop(1, css(look.accent) + "00");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    for (let layer = 0; layer < 3; layer++) {
      const radius = (19 + look.grade * 1.2) * [1, .68, .34][layer];
      const tail = [76, 64, 42][layer];
      const fill = ctx.createLinearGradient(8, 32, 84, 32);
      fill.addColorStop(0, css(look.accent) + "00");
      fill.addColorStop(.3, css(layer === 0 ? look.accent : look.edge) + "a8");
      fill.addColorStop(1, css(layer === 0 ? look.accent : look.core));
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (const side of [-1, 1]) {
        for (let i = 0; i <= 28; i++) {
          const t = side === -1 ? i / 28 : 1 - i / 28;
          const x = 84 - tail * t;
          const bend = Math.sin(phase - t * 8 + layer) * t * (6 + look.grade);
          const width = radius * Math.pow(Math.sin(t * Math.PI), .7) * (1 - t * .57);
          const y = 32 + bend + side * width;
          if (side === -1 && i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
      }
      ctx.closePath(); ctx.fill();
    }
    // A handful of embers flow backwards with the flame rather than orbiting it.
    for (let i = 0; i < 2 + look.grade; i++) {
      const u = (f / FRAMES + i / (2 + look.grade)) % 1;
      ctx.globalAlpha = Math.sin(u * Math.PI) * .8;
      ctx.fillStyle = css(look.grade === 4 ? 0xffdda1 : look.edge);
      const y = 32 + (i % 2 ? 1 : -1) * (10 + u * 9);
      ctx.fillRect(65 - u * 60, y, 2 + (1 - u) * 2, 1.5);
    }
    ctx.restore();
  }
  const texture = scene.textures.addCanvas(key, canvas)!;
  for (let f = 0; f < FRAMES; f++)
    texture.add(f, 0, f % COLS * W * DENSITY, Math.floor(f / COLS) * H * DENSITY, W * DENSITY, H * DENSITY);
  scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(key, { start: 0, end: FRAMES - 1 }), frameRate: 30, repeat: -1 });
  return key;
}

export function upgradeFireball(scene: Phaser.Scene, x: number, y: number, level: number) {
  const key = fireTexture(scene, level);
  const flame = scene.add.sprite(0, 0, key, 0).setOrigin(.75, .5).setScale(1 / DENSITY).play(key);
  return scene.add.container(x, y, [flame]).setDepth(46);
}

/** Short-lived effects use scene time, so pausing also freezes their motion. */
function animate(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, duration: number,
  draw: (g: Phaser.GameObjects.Graphics, t: number) => void) {
  const g = scene.add.graphics().setDepth(47);
  parent.add(g);
  const state = { t: 0 };
  draw(g, 0);
  const tween = scene.tweens.add({ targets: state, t: 1, duration,
    onUpdate: () => { if (g.scene) { g.clear(); draw(g, state.t); } },
    onComplete: () => g.destroy(),
  });
  g.once(Phaser.GameObjects.Events.DESTROY, () => tween.remove());
}

export function spellUpgradeCharge(scene: Phaser.Scene, parent: Phaser.GameObjects.Container,
  hero: Phaser.GameObjects.Sprite, groundY: number, level: number, duration: number) {
  const look = spellStyle(level);
  animate(scene, parent, duration, (g, t) => {
    if (!hero.active) return;
    g.setPosition(hero.x + 28, groundY - 44);
    const fade = Math.sin(t * Math.PI);
    const radius = (20 + look.grade * 3) * (1 - t) + 3;
    for (let i = 0; i < 3 + look.grade; i++) {
      const a = i * Math.PI * 2 / (3 + look.grade) + t * 2.8;
      const x = Math.cos(a) * radius, y = Math.sin(a) * radius * .65;
      g.lineStyle(2, look.accent, fade * .7).lineBetween(x * 1.2, y * 1.2, x, y);
      g.fillStyle(look.core, fade).fillCircle(x, y, 1.5 + look.grade * .25);
    }
    g.fillStyle(look.accent, fade * .16).fillCircle(0, 0, 5 + t * (7 + look.grade));
    g.fillStyle(look.core, fade * .85).fillCircle(0, 0, 2 + t * 3);
  });
}

export function spellUpgradeImpact(scene: Phaser.Scene, parent: Phaser.GameObjects.Container,
  x: number, y: number, level: number, matchTier: number) {
  const look = spellStyle(level), reach = 24 + look.grade * 4 + (matchTier - 3) * 4;
  animate(scene, parent, 310, (g, t) => {
    g.setPosition(x, y);
    const fade = (1 - t) * (1 - t), spread = Math.sin(t * Math.PI / 2);
    g.fillStyle(look.accent, fade * .18).fillEllipse(0, 0, 28 + spread * reach, 22 + spread * reach);
    g.fillStyle(look.core, fade * .85).fillEllipse(0, 0, 17 * (1 - t), 22 * (1 - t));
    for (let i = 0; i < 6 + look.grade; i++) {
      const a = i * Math.PI * 2 / (6 + look.grade) + .3;
      const r = 6 + spread * reach, tail = Math.max(2, r - 15 * (1 - t));
      const color = i % 3 === 0 ? look.core : look.accent;
      g.fillStyle(color, fade).fillTriangle(Math.cos(a) * r, Math.sin(a) * r,
        Math.cos(a - .12) * tail, Math.sin(a - .12) * tail,
        Math.cos(a + .12) * tail, Math.sin(a + .12) * tail);
    }
  });
}
