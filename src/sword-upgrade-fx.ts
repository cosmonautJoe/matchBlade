import Phaser from "phaser";
import { swordStyle, weaponGrade } from "./weapon-style";

type Point = { x: number; y: number };

/** One short-lived drawing surface; scene and container teardown also cancel its tween. */
function transient(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, duration: number,
  draw: (g: Phaser.GameObjects.Graphics, progress: number) => void) {
  const g = scene.add.graphics().setDepth(26);
  parent.add(g);
  const clock = { p: 0 };
  let tween: Phaser.Tweens.Tween | undefined;
  const destroy = () => g.destroy();
  g.once("destroy", () => {
    tween?.remove();
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, destroy);
  });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);
  draw(g, 0);
  if (!g.scene) return;
  tween = scene.tweens.add({ targets: clock, p: 1, duration,
    onUpdate: () => { if (g.scene) { g.clear(); draw(g, clock.p); } },
    onComplete: destroy });
}

/** Tapered ribbon, with pointed ends rather than a thick round brush stroke. */
function steelArc(g: Phaser.GameObjects.Graphics, radius: number, head: number,
  length: number, width: number, color: number, alpha: number) {
  const outside: Point[] = [], inside: Point[] = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18, angle = head - length * (1 - t);
    const thickness = Math.pow(Math.sin(Math.PI * t), .7) * width * (1.15 - t * .4);
    const radial = (r: number) => ({ x: Math.cos(angle) * r * .84, y: Math.sin(angle) * r });
    outside.push(radial(radius + thickness * .5));
    inside.unshift(radial(radius - thickness * .5));
  }
  g.fillStyle(color, alpha).fillPoints([...outside, ...inside], true);
}

/** Steel improves at forge milestones while preserving the original hero artwork. */
export function swordUpgradeSlash(scene: Phaser.Scene, parent: Phaser.GameObjects.Container,
  hero: Phaser.GameObjects.Sprite, groundY: number, level: number, swing: number): void {
  const grade = weaponGrade(level), style = swordStyle(level);
  const radius = 41 + grade * 5;
  const reverse = swing % 2 === 1 ? -1 : 1;
  transient(scene, parent, 155 + grade * 12, (g, p) => {
    if (!hero.scene || !hero.active) { g.destroy(); return; }
    const direction = hero.flipX ? -1 : 1;
    g.setPosition(hero.x + 34 * direction, groundY - 45);
    g.setScale(direction, reverse);
    const alpha = Math.min(1, p * 8) * Math.pow(1 - p, .65);
    const head = -1.3 + Math.min(1, p * 1.35) * 2.8;
    const length = 1.05 + grade * .13;
    const width = 6 + grade * 1.3;
    steelArc(g, radius, head, length, width + 4, 0x12232e, alpha * .5);
    steelArc(g, radius, head, length, width, style.accent, alpha * .7);
    steelArc(g, radius + 1.5, head + .015, length * .94, width * .47, style.edge, alpha);
    steelArc(g, radius + 2, head + .015, length * .8, 1.3 + grade * .2, 0xffffff, alpha);
    if (grade >= 2) {
      steelArc(g, radius - 8, head - .25, length * .84, width * .4,
        style.accent, alpha * .38);
    }
    // A few fragments shed behind the steel edge; no persistent particle emitter.
    for (let i = 0; i < grade; i++) {
      const t = Math.max(0, p - i * .04);
      const a = -.75 + i * .55, r = radius + t * (15 + i * 3);
      const x = Math.cos(a) * r * .84, y = Math.sin(a) * r;
      const size = 1.8 * (1 - p);
      g.fillStyle(style.edge, alpha * .75).fillTriangle(
        x, y, x - 8 * t, y - size, x - 5 * t, y + size);
    }
  });
}

/** Compact directional steel splinters show the weight of an upgraded landed hit. */
export function swordUpgradeImpact(scene: Phaser.Scene, parent: Phaser.GameObjects.Container,
  x: number, y: number, level: number, swing: number): void {
  const grade = weaponGrade(level), style = swordStyle(level);
  const count = 3 + grade;
  transient(scene, parent, 160 + grade * 15, (g, p) => {
    g.setPosition(x, y);
    const travel = 1 - Math.pow(1 - p, 3), alpha = Math.pow(1 - p, 1.5);
    const skew = (swing % 3 - 1) * .12;
    for (let i = 0; i < count; i++) {
      const a = -1.2 + 2.4 * i / Math.max(1, count - 1) + skew;
      const radius = 5 + travel * (15 + grade * 4 + (i % 2) * 7);
      const length = (12 + grade * 2) * (1 - p * .6);
      const width = (1.3 + grade * .3) * (1 - p * .5);
      const cos = Math.cos(a), sin = Math.sin(a);
      const px = cos * radius, py = sin * radius;
      g.fillStyle(i % 2 ? style.accent : style.edge, alpha).fillPoints([
        { x: px + cos * length, y: py + sin * length },
        { x: px - sin * width, y: py + cos * width },
        { x: px - cos * length * .35, y: py - sin * length * .35 },
        { x: px + sin * width, y: py - cos * width },
      ], true);
    }
    if (p < .46) {
      const size = (1 - p / .46) * (11 + grade * 2);
      g.fillStyle(0xffffff, alpha * .9).fillPoints([
        { x: -size, y: -size * .7 }, { x: 0, y: -2 },
        { x: size, y: size * .7 }, { x: 1, y: 2 },
      ], true);
    }
  });
}
