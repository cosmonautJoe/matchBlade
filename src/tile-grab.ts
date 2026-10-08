import Phaser from "phaser";
import { tileEffectsEnabled, TILE_EFFECTS_CHANGED } from "./tile-effects";
import { createHeldFire } from "./tile-fire-grab";

type Tile = Phaser.GameObjects.Container;
type GrabEffect = { release: () => void; destroy: () => void };
type Mote = { x: number; y: number; vx: number; vy: number; life: number; age: number; size: number; angle: number };
const active = new WeakMap<Tile, GrabEffect>();
const COLORS = [0xeaf7ff, 0xd297ff, 0x8dceff, 0xffd77d, 0x9cf6ff, 0xe7cda0, 0xc6d2dc, 0x9bf5d0];
const INTERVALS = [160, 170, 190, 250, 180, 320, 360, 140];

/** One small, tile-local drawing surface, allocated only while a tile is held. */
export function setTileGrabbed(scene: Phaser.Scene, tile: Tile, held: boolean) {
  const previous = active.get(tile);
  if (!held) { previous?.release(); return; }
  previous?.destroy();
  if (!tileEffectsEnabled()) return;

  const type = Number(tile.getData("type"));
  const color = COLORS[type] ?? COLORS[0];
  const visual: Tile = tile.getData("visual") ?? tile;
  const fire = type === 1 ? createHeldFire(scene, visual) : null;
  const ink = scene.add.graphics();
  visual.add(ink);
  const motes: Mote[] = [];
  let age = 0, emission = 0, releasing = false, fade = 0, destroyed = false;
  const between = Phaser.Math.FloatBetween;

  const spawn = (initial = false) => {
    if (motes.length >= 14) return;
    const side = Math.random() < .5 ? -1 : 1;
    const mote: Mote = {
      x: side * between(19, 33), y: between(-22, 18),
      vx: side * between(3, 10), vy: -between(12, 23),
      life: between(.45, .7), age: initial ? .08 : 0, size: between(2.7, 4.8), angle: between(-1, 1),
    };
    if (type === 0) {
      // Steel sparks shoot along the blade diagonals; no soft floating stars.
      const diagonal = Math.random() < .5 ? -1 : 1;
      mote.x = side * between(8, 19); mote.y = mote.x * diagonal;
      mote.vx = side * between(90, 135); mote.vy = mote.vx * diagonal + between(-18, 18);
      mote.life = between(.2, .3); mote.age = initial ? .015 : 0; mote.size = between(1.2, 2);
    } else if (type === 1) {
      // A few fine embers accompany the continuous flame, rather than becoming it.
      mote.x = between(-23, 22); mote.y = between(-12, 9);
      mote.vx = between(5, 18); mote.vy = -between(37, 55);
      mote.life = between(.5, .8); mote.size = between(.8, 1.5);
    } else if (type === 5 || type === 6) {
      mote.y = between(10, 25); mote.vx = side * between(12, 24); mote.vy = -between(15, 25);
      mote.life = between(.35, .55); mote.size = between(2, 3.2);
    } else if (type === 7) {
      mote.y = between(0, 20); mote.vy = -between(24, 40);
    }
    motes.push(mote);
  };

  const star = (x: number, y: number, radius: number, opacity: number) => {
    ink.fillStyle(color, opacity * .19).fillCircle(x, y, radius * 1.8);
    ink.fillStyle(color, opacity).fillPoints([
      { x, y: y - radius }, { x: x + radius * .22, y: y - radius * .22 },
      { x: x + radius, y }, { x: x + radius * .22, y: y + radius * .22 },
      { x, y: y + radius }, { x: x - radius * .22, y: y + radius * .22 },
      { x: x - radius, y }, { x: x - radius * .22, y: y - radius * .22 },
    ], true);
    ink.fillStyle(0xffffff, opacity).fillCircle(x, y, Math.max(.6, radius * .16));
  };

  // Clip a moving diagonal band to the tile face without a renderer-specific mask.
  const sheen = (progress: number, opacity: number) => {
    const offset = -80 + progress * 160;
    let points = [{ x: -33, y: -33 }, { x: 33, y: -33 }, { x: 33, y: 33 }, { x: -33, y: 33 }];
    for (const [edge, direction] of [[offset - 7, 1], [offset + 7, -1]]) {
      const clipped: typeof points = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        const da = (a.x + a.y - edge) * direction, db = (b.x + b.y - edge) * direction;
        if (da >= 0) clipped.push(a);
        if ((da >= 0) !== (db >= 0)) {
          const t = da / (da - db);
          clipped.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      }
      points = clipped;
    }
    if (points.length >= 3) ink.fillStyle(0xffffff, opacity).fillPoints(points, true);
  };

  const bladeFlash = (diagonal: number, delay: number) => {
    const elapsed = age % 1250 - delay;
    if (elapsed < 0 || elapsed > 240) return;
    const t = elapsed / 240;
    const head = -25 + Math.min(1, (t + .12) * 1.5) * 66;
    const tail = Math.max(-39, head - 46);
    const width = (1 - t) * 3.8;
    const opacity = (1 - t) * .95;
    const center = (head + tail) * .5;
    // A tapered blade-shaped cut with a narrow white edge and blue steel wake.
    ink.lineStyle(7, 0x87c8f2, opacity * .16).lineBetween(tail, tail * diagonal, head, head * diagonal);
    ink.fillStyle(0xe4f5ff, opacity).fillPoints([
      { x: tail, y: tail * diagonal },
      { x: center - diagonal * width, y: center * diagonal + width },
      { x: head, y: head * diagonal },
      { x: center + diagonal * width * .4, y: center * diagonal - width * .4 },
    ], true);
    ink.lineStyle(1.2, 0xffffff, opacity).lineBetween(tail + 5, (tail + 5) * diagonal, head, head * diagonal);
  };

  const draw = () => {
    ink.clear();
    fire?.update(age, releasing ? Math.max(0, 1 - fade / 140) : 1);
    const breath = .5 + .5 * Math.sin(age * .008);
    ink.lineStyle(8, color, fire ? .065 : .12 + breath * .04).strokeRoundedRect(-43, -43, 86, 86, 10);
    ink.lineStyle(fire ? 1.3 : 2, color, fire ? .5 : .8 + breath * .2).strokeRoundedRect(-42, -42, 84, 84, 9);
    // A short pickup pulse gives immediate feedback, even on a quick touch.
    if (!fire && age < 240) {
      const t = age / 240, radius = 43 + t * 7;
      ink.lineStyle(2.5, color, (1 - t) * .75).strokeRoundedRect(-radius, -radius, radius * 2, radius * 2, 10);
    }
    if (type === 0) {
      bladeFlash(-1, 0);
      bladeFlash(1, 65);
    } else if (type === 4 || type === 3) {
      const phase = age % (type === 4 ? 1150 : 1600);
      if (phase < 450) sheen(phase / 450, type === 4 ? .38 : .24);
      if (type === 4) {
        const t = .4 + .6 * Math.min(1, age / 120);
        star(-22, -25, (7 + breath * 4) * t, 1);
        star(25, 10, (4 + (1 - breath) * 3) * t, .85);
      }
    } else if (type === 2) {
      const t = (age % 1000) / 1000, s = .9 + t * .25;
      ink.lineStyle(3, color, Math.sin(t * Math.PI) * .65).strokePoints([
        { x: -22 * s, y: -25 * s }, { x: 22 * s, y: -25 * s },
        { x: 19 * s, y: 7 * s }, { x: 0, y: 28 * s }, { x: -19 * s, y: 7 * s },
      ], true);
    }
    for (const p of motes) {
      const t = p.age / p.life;
      const opacity = Math.min(1, t * (type === 0 ? 20 : 9)) * (1 - t * t);
      if (type === 0) {
        const speed = Math.hypot(p.vx, p.vy), dx = p.vx / speed, dy = p.vy / speed;
        const length = (12 + p.size * 4) * (1 - t * .5);
        ink.fillStyle(0x9ecfea, opacity * .7).fillTriangle(
          p.x - dx * length, p.y - dy * length,
          p.x - dy * p.size, p.y + dx * p.size,
          p.x + dx * 2, p.y + dy * 2,
        );
        ink.lineStyle(1.2, 0xffffff, opacity).lineBetween(p.x - dx * length * .65, p.y - dy * length * .65, p.x, p.y);
      } else if (type === 1) {
        const x = p.x + Math.sin(p.age * 9 + p.angle) * 3;
        ink.lineStyle(p.size, 0xe9a4ff, opacity * .5).lineBetween(x - .5, p.y + 3, x, p.y);
        ink.fillStyle(0xffe9ce, opacity).fillCircle(x, p.y, p.size * (1 - t * .5));
      } else if (type === 5) {
        ink.lineStyle(p.size * .7, color, opacity * .8).lineBetween(p.x, p.y, p.x + Math.sin(p.angle + p.age * 7) * 4, p.y + 4);
      } else if (type === 6) {
        ink.fillStyle(color, opacity * .8).fillTriangle(p.x - p.size, p.y, p.x, p.y - p.size, p.x + p.size, p.y + p.size);
      } else if (type === 7) {
        ink.lineStyle(1.7, color, opacity).strokeCircle(p.x, p.y, p.size);
        ink.fillStyle(0xffffff, opacity * .8).fillCircle(p.x - 1, p.y - 1, .8);
      } else if (type === 2) {
        ink.fillStyle(color, opacity * .23).fillCircle(p.x, p.y, p.size * 2);
        ink.fillStyle(0xe6f9ff, opacity).fillCircle(p.x, p.y, p.size * .6);
      } else star(p.x, p.y, p.size * (type === 4 ? 1.8 : 1.3), opacity);
    }
  };

  const update = (_time: number, delta: number) => {
    const step = Math.min(delta, 40), seconds = step / 1000;
    age += step;
    if (releasing) {
      fade += step;
      if (fade >= 140) { effect.destroy(); return; }
      ink.setAlpha(1 - fade / 140);
    } else {
      emission += step;
      if (emission >= (INTERVALS[type] ?? 280)) { emission = 0; spawn(); }
    }
    for (let i = motes.length - 1; i >= 0; i--) {
      const p = motes[i];
      p.age += seconds;
      if (p.age >= p.life) { motes.splice(i, 1); continue; }
      p.x += p.vx * seconds; p.y += p.vy * seconds;
      if (type === 5 || type === 6) p.vy += 110 * seconds;
    }
    draw();
  };
  const effect: GrabEffect = {
    release: () => { releasing = true; },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      scene.events.off(Phaser.Scenes.Events.UPDATE, update);
      scene.events.off(Phaser.Scenes.Events.PAUSE, effect.destroy);
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, effect.destroy);
      scene.game.events.off(TILE_EFFECTS_CHANGED, effect.destroy);
      tile.off("destroy", effect.destroy);
      if (active.get(tile) === effect) active.delete(tile);
      fire?.destroy();
      ink.destroy();
    },
  };
  active.set(tile, effect);
  for (let i = 0; i < (type === 1 ? 3 : type === 0 ? 6 : 4); i++) spawn(true);
  draw();
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  scene.events.once(Phaser.Scenes.Events.PAUSE, effect.destroy);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, effect.destroy);
  scene.game.events.on(TILE_EFFECTS_CHANGED, effect.destroy);
  tile.once("destroy", effect.destroy);
}
