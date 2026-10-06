import Phaser from "phaser";
import { bossArenaArt, type ArenaBounds } from "./boss-arena-art";
import { PLAYER_TEXTURE, PLAYER_ORIGIN, PLAYER_DENSITY } from "./player-art";
import { SLIME_GOALS, slimeRushHits, slimeRushWave, slimeSwipeCut, type SlimePoint, type SlimeProgress } from "./slime-boss";

type Options = {
  scene: Phaser.Scene; rect: ArenaBounds; progress: SlimeProgress; final: boolean;
  alive: () => boolean; hurt: () => void; hit: (cleared: number) => void;
  cleared: () => void; sound: (key: string) => void;
};
type Blob = { root: Phaser.GameObjects.Container; body: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse; shine: Phaser.GameObjects.Ellipse; size: number };

/** Three tactile games, with input/timer ownership confined to the current phase. */
export function createSlimeBossArena(o: Options) {
  const { scene, rect: R } = o, phase = o.progress.phase, goal = SLIME_GOALS[phase];
  const titles = ["Heavy bounce", "Stretch and sever", "Slime rush"];
  const cues = ["Move clear. Strike the exposed core.", "Swipe through the stretched goo.", "Swipe through the lunging slimes."];
  const art = bossArenaArt(scene, R, "forest", titles[phase], cues[phase], `${o.progress.cleared}/${goal}`);
  const root = art.root;
  const fieldTop = 112, floor = R.h - 66, fieldH = floor - fieldTop;
  let dead = false, finishing = false, cleared = o.progress.cleared;
  const clocks: Phaser.Time.TimerEvent[] = [], owned: object[] = [];
  const blobs: Blob[] = [];
  const live = () => !dead && !finishing && o.alive();
  const add = <T extends Phaser.GameObjects.GameObject>(obj: T): T => { root.add(obj); owned.push(obj); return obj; };
  const later = (ms: number, fn: () => void) => clocks.push(scene.time.delayedCall(ms, () => { if (!dead && o.alive()) fn(); }));
  const animate = (targets: object | object[], values: Omit<Phaser.Types.Tweens.TweenBuilderConfig, "targets">) => scene.tweens.add({ ...values, targets });
  const local = (p: Phaser.Input.Pointer) => root.getWorldTransformMatrix().applyInverse(p.x, p.y);
  let down = (_: { x: number; y: number }) => {}, move = down, up = down, cancel = () => {};
  let tick = (_time: number, _delta: number) => {};

  const moss = add(scene.add.graphics());
  moss.fillStyle(0x324631, .62).fillRoundedRect(30, floor + 10, R.w - 60, 16, 8);
  for (let i = 0; i < 22; i++) {
    const x = 34 + i * (R.w - 68) / 22;
    moss.fillStyle(i % 2 ? 0x769159 : 0x506c44, .6).fillRect(x, floor + 7 - i % 4, 3, 9);
  }

  const makeBlob = (x: number, y: number, size: number): Blob => {
    const shadow = scene.add.ellipse(0, 3, size * 20, size * 3, 0x071711, .5);
    const shine = scene.add.ellipse(0, -size * 10, size * 24, size * 23, 0x97d873, .07);
    const body = scene.add.sprite(0, 0, "slime-idle").setOrigin(.52, .625).setScale(size).play("slimeboss-idle");
    const node = add(scene.add.container(x, y, [shadow, shine, body]));
    owned.push(shadow, shine, body);
    const blob = { root: node, body, shadow, shine, size }; blobs.push(blob);
    return blob;
  };
  const pulse = (b: Blob, color = 0xbaf194) => {
    b.body.setTintFill(color);
    later(80, () => { if (b.body.active) b.body.clearTint(); });
  };
  const splash = (x: number, y: number, count = 13, color = 0x92ce6f) => {
    const ring = add(scene.add.ellipse(x, y, 40, 10, color, .22).setStrokeStyle(3, color, .75));
    animate(ring, { scaleX: 3.1, scaleY: 2, alpha: 0, duration: 340, onComplete: () => ring.destroy() });
    for (let i = 0; i < count; i++) {
      const angle = Math.PI + i / Math.max(1, count - 1) * Math.PI;
      const bit = add(scene.add.ellipse(x, y - 8, 5 + i % 4, 8 + i % 3, i % 3 ? color : 0xd9edaf, .9));
      animate(bit, { x: x + Math.cos(angle) * (32 + i % 5 * 12), y: y + Math.sin(angle) * (30 + i % 4 * 13),
        alpha: 0, angle: i * 29, duration: 420 + i % 3 * 70, onComplete: () => bit.destroy() });
    }
  };
  const finish = () => {
    if (finishing || dead) return;
    finishing = true; cancel();
    for (const t of clocks) t.remove(false);
    clocks.length = 0;
    down = move = up = () => {}; tick = () => {};
    o.sound("squish2");
    if (phase === 2) { later(650, o.cleared); return; }
    // Both halves come from their parent; the next phase starts after the goo settles.
    const parents = blobs.filter(b => b.root.active);
    for (const b of parents) {
      scene.tweens.killTweensOf(b.root); scene.tweens.killTweensOf(b.body);
      animate(b.body, { scaleX: b.size * 1.5, scaleY: b.size * .4, duration: 200, ease: "Cubic.easeIn" });
    }
    later(210, () => {
      const count = 2 ** (phase + 1), size = phase === 0 ? Math.min(4.6, fieldH / 63) : Math.min(2.9, fieldH / 105);
      const positions = phase === 0 ? [.28, .72] : [.17, .39, .61, .83];
      const y = phase === 0 ? fieldTop + fieldH * .52 : fieldTop + fieldH * .27;
      parents.forEach(b => { splash(b.root.x, b.root.y, 18); b.root.setAlpha(0); });
      for (let i = 0; i < count; i++) {
        const parent = parents[Math.min(parents.length - 1, Math.floor(i / 2))];
        const child = makeBlob(parent.root.x, parent.root.y, size);
        child.body.setScale(size * .5, size * 1.25);
        animate(child.root, { x: R.w * positions[i], y, duration: 470, ease: "Cubic.easeOut" });
        animate(child.body, { scaleX: size, scaleY: size, duration: 470, ease: "Back.easeOut" });
      }
      later(600, o.cleared);
    });
  };
  const hit = () => {
    if (!live()) return;
    cleared++; art.tally.setText(`${cleared}/${goal}`); o.hit(cleared); o.sound("hit2");
    if (cleared >= goal) finish();
  };

  if (phase === 0) {
    const size = Math.min(6.8, fieldH / 45), home = { x: R.w * .5, y: fieldTop + size * 22 + 10 };
    const blob = makeBlob(home.x, home.y, size);
    const spots = [.2, .5, .8].map(x => R.w * x);
    const hero = add(scene.add.sprite(spots[1], floor, PLAYER_TEXTURE).setOrigin(.5, PLAYER_ORIGIN)
      .setScale(Math.min(3.2, fieldH / 76) / PLAYER_DENSITY).play("hero-idle"));
    for (const x of spots) add(scene.add.ellipse(x, floor + 4, 72, 14, 0x8da572, .2).setStrokeStyle(2, 0xb7cba1, .5));
    const warning = add(scene.add.ellipse(hero.x, floor + 2, R.w * .31, 26, 0xbdaa56, .2).setStrokeStyle(3, 0xe2c773, .7).setVisible(false));
    const core = add(scene.add.ellipse(home.x, floor - 24, 66, 48, 0xffd982, .95).setStrokeStyle(4, 0xfff3cd).setVisible(false));
    const coreGleam = add(scene.add.ellipse(home.x - 9, floor - 32, 13, 8, 0xffffff, .9).setVisible(false));
    let aiming = false, exposed = false, cycleId = 0;
    const cycle = () => {
      if (!live()) return;
      const id = ++cycleId;
      scene.tweens.killTweensOf(blob.body); scene.tweens.killTweensOf(blob.root);
      blob.body.setScale(size).play("slimeboss-idle");
      animate(blob.root, { x: home.x, y: home.y, duration: 220, ease: "Sine.easeOut" });
      core.setVisible(false); coreGleam.setVisible(false); exposed = false; aiming = true;
      warning.setVisible(true).setFillStyle(0xbdaa56, .2).setStrokeStyle(3, 0xe2c773, .7).setScale(.65);
      animate(warning, { scale: 1, duration: 900, ease: "Sine.easeIn" });
      animate(blob.body, { scaleX: size * 1.18, scaleY: size * .72, duration: 720, ease: "Sine.easeIn" });
      later(o.final ? 650 : 800, () => {
        if (id !== cycleId || !live()) return;
        aiming = false;
        const target = warning.x;
        warning.setFillStyle(0x9f4552, .28).setStrokeStyle(4, 0xf0a18e, .9);
        pulse(blob, 0xe0e9ab);
        later(420, () => {
          if (id !== cycleId || !live()) return;
          const start = { x: blob.root.x, y: blob.root.y }, motion = { t: 0 };
          animate(blob.body, { scaleX: size * .86, scaleY: size * 1.12, duration: 160 });
          scene.tweens.add({ targets: motion, t: 1, duration: 470, ease: "Sine.easeIn",
            onUpdate: () => { if (blob.root.active) blob.root.setPosition(Phaser.Math.Linear(start.x, target, motion.t),
              Phaser.Math.Linear(start.y, floor, motion.t) - Math.sin(motion.t * Math.PI) * 75); },
            onComplete: () => {
              if (!live() || id !== cycleId) return;
              warning.setVisible(false); splash(target, floor, 22); o.sound("slimeatk");
              scene.cameras.main.shake(100, .004);
              if (Math.abs(hero.x - target) < R.w * .125) o.hurt();
              if (!live()) return;
              blob.body.setScale(size * 1.4, size * .4);
              core.setPosition(target, floor - size * 3.3).setVisible(true);
              coreGleam.setPosition(target - 9, core.y - 8).setVisible(true); exposed = true;
              animate(core, { scale: 1.1, duration: 240, yoyo: true, repeat: 2 });
              later(o.final ? 1150 : 1500, () => {
                if (!exposed || id !== cycleId || !live()) return;
                exposed = false; core.setVisible(false); coreGleam.setVisible(false); later(300, cycle);
              });
            } });
          owned.push(motion);
        });
      });
    };
    down = p => {
      if (exposed && Math.hypot(p.x - core.x, p.y - core.y) < 52) {
        exposed = false; core.setVisible(false); coreGleam.setVisible(false); pulse(blob); splash(core.x, core.y, 9, 0xf3d58e);
        hero.play("hero-attack").once("animationcomplete", () => { if (hero.active) hero.play("hero-idle"); });
        hit(); if (live()) later(420, cycle); return;
      }
      if (p.y < fieldTop || p.y > R.h - 25) return;
      const x = spots.reduce((a, b) => Math.abs(p.x - a) < Math.abs(p.x - b) ? a : b);
      scene.tweens.killTweensOf(hero); hero.play("hero-walk", true);
      animate(hero, { x, duration: 140, ease: "Sine.easeOut", onComplete: () => { if (hero.active) hero.play("hero-idle"); } });
    };
    tick = () => { if (aiming) warning.x = hero.x; };
    later(600, cycle);
  } else if (phase === 1) {
    const size = Math.min(4.6, fieldH / 63), y = fieldTop + fieldH * .52;
    const membrane = add(scene.add.graphics());
    const pair = [makeBlob(R.w * .28, y, size), makeBlob(R.w * .72, y, size)];
    const trail = add(scene.add.graphics());
    type Stage = "gather" | "pull" | "open" | "cut" | "snap";
    let stage: Stage = "gather", elapsed = 0, stageAt = 0, drawing = false;
    let starts = pair.map(b => ({ x: b.root.x, y: b.root.y }));
    let cutPoint = { x: R.w / 2, y }, stroke: SlimePoint[] = [];
    const trailPoints: (SlimePoint & { at: number })[] = [];
    const mix = (a: SlimePoint, b: SlimePoint, t: number): SlimePoint =>
      ({ x: Phaser.Math.Linear(a.x, b.x, t), y: Phaser.Math.Linear(a.y, b.y, t) });
    const ease = (t: number) => { t = Phaser.Math.Clamp(t, 0, 1); return t * t * (3 - 2 * t); };
    const enter = (next: Stage) => {
      stage = next; stageAt = elapsed;
      starts = pair.map(b => ({ x: b.root.x, y: b.root.y }));
      stroke = [];
    };
    const layout = (apart: number) => {
      const skew = [0, -.2, .2][Math.min(2, cleared)] * fieldH;
      const halfWidth = R.w * Phaser.Math.Linear(.125, .27 + cleared * .015, apart);
      return [-1, 1].map(sign => ({ x: R.w / 2 + sign * halfWidth,
        y: fieldTop + fieldH * .65 + sign * skew * Phaser.Math.Linear(.3, 1, apart) }));
    };
    const ends = () => {
      const a = { x: pair[0].root.x, y: pair[0].root.y - size * 9 };
      const b = { x: pair[1].root.x, y: pair[1].root.y - size * 9 };
      const inset = size * 5 / Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      return [mix(a, b, inset), mix(a, b, 1 - inset)];
    };
    // A shaded, tapering sheet of gel stays attached to the animated bodies.
    const ribbon = (a: SlimePoint, b: SlimePoint, tension: number, alpha = 1) => {
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < 3) return;
      const nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length;
      const top: SlimePoint[] = [], bottom: SlimePoint[] = [], gloss: SlimePoint[] = [];
      for (let i = 0; i <= 28; i++) {
        const t = i / 28, p = mix(a, b, t), edge = Math.pow(Math.abs(t * 2 - 1), 2.8);
        const core = Phaser.Math.Linear(13 - cleared * 2, 3, tension);
        const width = core + (size * 4.5 - core) * edge;
        const sag = Math.sin(t * Math.PI) * (1 - tension) * (13 + Math.sin(elapsed / 190 + t * 8) * 3);
        top.push({ x: p.x + nx * (sag - width), y: p.y + ny * (sag - width) });
        bottom.push({ x: p.x + nx * (sag + width), y: p.y + ny * (sag + width) });
        gloss.push({ x: p.x + nx * (sag - width * .55), y: p.y + ny * (sag - width * .55) });
      }
      membrane.fillStyle(0x699d4e, .95 * alpha).fillPoints([...top, ...bottom.reverse()], true);
      membrane.lineStyle(2.5, 0x2c522f, .9 * alpha).strokePoints([...top, ...bottom], true);
      membrane.lineStyle(3, 0xc6e594, .65 * alpha).strokePoints(gloss, false);
    };
    const pose = (positions: SlimePoint[], tension: number, hop = 0) => pair.forEach((b, i) => {
      const breathe = Math.sin(elapsed / 140 + i * Math.PI) * .025;
      b.root.setPosition(positions[i].x, positions[i].y - hop);
      b.body.setPosition(0, 0).setAngle((i ? 1 : -1) * tension * 5)
        .setScale(size * (1.08 - tension * .2 + breathe), size * (.9 + tension * .19 - breathe));
      b.shadow.setScale(1 - hop / 180).setAlpha(.5 - hop / 160);
      b.shine.setFillStyle(0x97d873, .07);
    });
    const sever = (point: SlimePoint) => {
      cutPoint = point; enter("cut"); drawing = false;
      pair.forEach(b => pulse(b, 0xe6efb5));
      splash(point.x, point.y + 8, 20, 0xb8da81);
      const flash = add(scene.add.ellipse(point.x, point.y, 28, 28, 0xfff2c6, .75));
      animate(flash, { scale: 2.2, alpha: 0, duration: 180, onComplete: () => flash.destroy() });
      o.sound("squish2"); hit();
    };
    const sample = (p: SlimePoint) => {
      if (!drawing) return;
      const last = stroke[stroke.length - 1];
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
      stroke.push({ ...p }); if (stroke.length > 128) stroke.shift();
      trailPoints.push({ ...p, at: elapsed });
      if (stage !== "open") return;
      const [a, b] = ends();
      const cut = slimeSwipeCut(stroke, mix(a, b, .18), mix(a, b, .82));
      if (cut) sever(cut);
    };
    down = p => { drawing = true; stroke = []; trailPoints.length = 0; sample(p); };
    move = sample;
    up = p => { sample(p); drawing = false; stroke = []; };
    cancel = () => {
      drawing = false; stroke = []; trailPoints.length = 0; trail.clear();
      if (finishing) { membrane.clear(); pair.forEach(b => b.body.setAngle(0)); }
    };
    tick = (_time, delta) => {
      elapsed += delta;
      const age = elapsed - stageAt;
      membrane.clear(); trail.clear();
      while (trailPoints.length && elapsed - trailPoints[0].at > 190) trailPoints.shift();
      for (let i = 1; i < trailPoints.length; i++) {
        const a = trailPoints[i - 1], b = trailPoints[i], alpha = 1 - (elapsed - a.at) / 190;
        trail.lineStyle(11, 0xb9e5b4, alpha * .15).lineBetween(a.x, a.y, b.x, b.y);
        trail.lineStyle(3.5, 0xfff2cf, alpha * .95).lineBetween(a.x, a.y, b.x, b.y);
      }
      if (stage === "gather") {
        const t = ease(age / 700), near = layout(0);
        pose(starts.map((p, i) => mix(p, near[i], t)), 0, Math.sin(t * Math.PI) * 22);
        const [a, b] = ends(), join = Math.min(1, age / 500);
        ribbon(a, mix(a, b, join * .5), 0);
        ribbon(mix(b, a, join * .5), b, 0);
        if (age >= 700) enter("pull");
      } else if (stage === "pull") {
        const t = ease(age / 1000);
        pose(layout(t), t, Math.sin(t * Math.PI) * Math.min(38, fieldH * .1));
        const [a, b] = ends(); ribbon(a, b, t);
        if (age >= 1000) { enter("open"); o.sound("pickup"); }
      } else if (stage === "open") {
        pose(layout(1), 1);
        const [a, b] = ends(); ribbon(a, b, 1);
        const weakA = mix(a, b, .18), weakB = mix(a, b, .82), glow = .65 + Math.sin(age / 180) * .12;
        membrane.lineStyle(18, 0xf7d887, .14 * glow).lineBetween(weakA.x, weakA.y, weakB.x, weakB.y);
        membrane.lineStyle(7, 0xe4b766, glow).lineBetween(weakA.x, weakA.y, weakB.x, weakB.y);
        membrane.lineStyle(2.5, 0xfff1bf, .95).lineBetween(weakA.x, weakA.y, weakB.x, weakB.y);
        // The final half-second is a physical wind-up; there is still time to cut.
        const window = o.final ? 2300 : 2800;
        if (age > window - 550) pair.forEach((b, i) => {
          b.body.x = Math.sin(age / 45 + i) * 2;
          b.shine.setFillStyle(0xedb178, .18);
        });
        if (age >= window) enter("snap");
      } else if (stage === "cut") {
        const t = Math.min(1, age / 780), spring = 1 - Math.cos(t * 7) * Math.exp(-t * 5);
        pose(starts.map((p, i) => ({ x: p.x + (i ? 1 : -1) * 34 * spring, y: p.y })), 0);
        pair.forEach(b => b.body.setScale(size * (1 + .23 * Math.sin(t * 10) * (1 - t)),
          size * (1 - .17 * Math.sin(t * 10) * (1 - t))));
        const [a, b] = ends(), retract = ease(age / 380);
        ribbon(a, mix(cutPoint, a, retract), .75, 1 - retract);
        ribbon(mix(cutPoint, b, retract), b, .75, 1 - retract);
        if (age >= 900) enter("gather");
      } else {
        const t = ease(age / 550), center = { x: R.w / 2, y: fieldTop + fieldH * .73 };
        pose(starts.map((p, i) => mix(p, { x: center.x + (i ? 1 : -1) * size * 7, y: center.y }, t)),
          1 - t, Math.sin(t * Math.PI) * 22);
        const [a, b] = ends(); ribbon(a, b, 1 - t);
        pair.forEach(b => b.shine.setFillStyle(0xed9876, .22));
        if (age >= 550) {
          splash(center.x, center.y, 22); o.sound("slimeatk"); o.hurt();
          if (live()) enter("gather");
        }
      }
    };
  } else {
    const size = Math.min(2.9, fieldH / 105), y = fieldTop + fieldH * .27;
    const heroY = fieldTop + fieldH * .64;
    add(scene.add.ellipse(R.w / 2, heroY + 3, 64, 12, 0x071711, .45));
    const air = add(scene.add.graphics());
    const hero = add(scene.add.sprite(R.w / 2, heroY, PLAYER_TEXTURE).setOrigin(.5, PLAYER_ORIGIN)
      .setScale(Math.min(2.8, fieldH / 88) / PLAYER_DENSITY).play("hero-idle"));
    hero.on("animationcomplete", () => { if (hero.active) hero.play("hero-idle"); });
    const swarm = [.17, .39, .61, .83].map(x => makeBlob(R.w * x, y, size));
    const defeated = swarm.map((b, i) => { if (i < cleared) b.root.setVisible(false); return i < cleared; });
    const trail = add(scene.add.graphics());
    const trailPoints: (SlimePoint & { at: number })[] = [];
    type RushStage = "orbit" | "gather" | "windup" | "rush" | "recover";
    let stage: RushStage = "orbit", elapsed = 0, stageAt = 0, cursor = cleared, waveNumber = 0;
    let wave: number[] = [], starts = swarm.map(b => ({ x: b.root.x, y: b.root.y }));
    let slashOrigin: SlimePoint | null = null, slashLast: SlimePoint | null = null, slashArmed = false;
    const ease = (t: number) => { t = Phaser.Math.Clamp(t, 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a: SlimePoint, b: SlimePoint, t: number): SlimePoint =>
      ({ x: Phaser.Math.Linear(a.x, b.x, t), y: Phaser.Math.Linear(a.y, b.y, t) });
    const orbit = (i: number): SlimePoint => ({
      x: hero.x + Math.cos(elapsed / 2400 + i * Math.PI / 2 - Math.PI * .75) * R.w * .31,
      y: hero.y - size * 2 + Math.sin(elapsed / 2400 + i * Math.PI / 2 - Math.PI * .75) * fieldH * .28,
    });
    const enter = (next: RushStage) => {
      stage = next; stageAt = elapsed;
      starts = swarm.map(b => ({ x: b.root.x, y: b.root.y }));
      // A held finger may start a fresh swipe, but an old trail never damages a new wave.
      slashOrigin = slashLast ? { ...slashLast } : null; slashArmed = false;
      if (next === "orbit") wave = [];
    };
    const side = (i: number) => wave.length === 2 ? (wave.indexOf(i) ? 1 : -1) : (waveNumber % 2 ? -1 : 1);
    const launchPoint = (i: number) => ({ x: hero.x + side(i) * R.w * .31, y: hero.y - size * 4 });
    const beginWave = () => {
      wave = slimeRushWave(defeated, cursor);
      if (!wave.length) return;
      cursor = (wave[wave.length - 1] + 1) % swarm.length; waveNumber++;
      hero.setFlipX(side(wave[0]) < 0);
      enter("gather");
    };
    const slash = (p: SlimePoint) => {
      if (!slashOrigin || !slashLast || Math.hypot(p.x - slashLast.x, p.y - slashLast.y) < 2) return;
      const previous = slashLast; slashLast = { ...p };
      trailPoints.push({ ...p, at: elapsed });
      if (stage !== "rush") return;
      if (!slashArmed && Math.hypot(p.x - slashOrigin.x, p.y - slashOrigin.y) < 24) return;
      const from = slashArmed ? previous : slashOrigin; slashArmed = true;
      const targets = wave.filter(i => !defeated[i]).map(i => ({ id: i, x: swarm[i].root.x,
        y: swarm[i].root.y - size * 10, radius: Math.max(38, size * 14) }));
      const hits = slimeRushHits(from, p, targets);
      if (!hits.length) return;
      hero.setFlipX(swarm[hits[0]].root.x < hero.x).play(hits.length > 1 ? "hero-attack3" : "hero-attack2");
      o.sound("squish2");
      const length = Math.max(1, Math.hypot(p.x - from.x, p.y - from.y));
      const dx = (p.x - from.x) / length, dy = (p.y - from.y) / length;
      for (const i of hits) {
        if (!live() || defeated[i]) continue;
        defeated[i] = true;
        const b = swarm[i], center = { x: b.root.x, y: b.root.y - size * 10 };
        b.body.setAngle(0).play("slimeboss-death");
        b.shine.setVisible(false); splash(center.x, center.y + 10, 16, 0xbad990);
        const cut = add(scene.add.graphics().setPosition(center.x, center.y));
        cut.lineStyle(12, 0xbfec99, .22).lineBetween(-dx * 39, -dy * 39, dx * 39, dy * 39);
        cut.lineStyle(4, 0xfff4d2, 1).lineBetween(-dx * 32, -dy * 32, dx * 32, dy * 32);
        animate(cut, { scale: 1.7, alpha: 0, duration: 230, onComplete: () => cut.destroy() });
        animate(b.root, { x: b.root.x + side(i) * 32, y: b.root.y - 20, scale: .45, alpha: 0,
          duration: 320, ease: "Cubic.easeOut", onComplete: () => b.root.setVisible(false) });
        hit();
      }
    };
    down = p => {
      slashOrigin = { ...p }; slashLast = { ...p }; slashArmed = false;
      trailPoints.length = 0; trailPoints.push({ ...p, at: elapsed });
    };
    move = slash;
    up = p => { slash(p); slashOrigin = slashLast = null; slashArmed = false; };
    cancel = () => { slashOrigin = slashLast = null; slashArmed = false; trailPoints.length = 0; trail.clear(); air.clear(); };
    tick = (_time, delta) => {
      elapsed += delta;
      const age = elapsed - stageAt, rushDuration = o.final ? 1300 : 1550;
      air.clear(); trail.clear();
      while (trailPoints.length && elapsed - trailPoints[0].at > 180) trailPoints.shift();
      for (let i = 1; i < trailPoints.length; i++) {
        const a = trailPoints[i - 1], b = trailPoints[i], alpha = 1 - (elapsed - a.at) / 180;
        trail.lineStyle(12, 0xbbde95, alpha * .2).lineBetween(a.x, a.y, b.x, b.y);
        trail.lineStyle(3.5, 0xfff3d4, alpha).lineBetween(a.x, a.y, b.x, b.y);
      }
      swarm.forEach((b, i) => {
        if (defeated[i]) return;
        b.body.setAngle(0).setScale(size); b.shadow.setScale(1).setAlpha(.5);
        b.shine.setFillStyle(0x97d873, .07);
        if (stage === "orbit" || !wave.includes(i)) {
          const target = orbit(i), t = Math.min(1, delta / 160), bounce = Math.abs(Math.sin(elapsed / 230 + i)) * 5;
          b.root.setPosition(Phaser.Math.Linear(b.root.x, target.x, t), Phaser.Math.Linear(b.root.y, target.y - bounce, t));
          b.body.setScale(size * (1 + bounce / 100), size * (1 - bounce / 120));
          return;
        }
        const launch = launchPoint(i), direction = side(i);
        if (stage === "gather") {
          const t = ease(age / 470), p = mix(starts[i], launch, t);
          b.root.setPosition(p.x, p.y - Math.sin(t * Math.PI) * 24);
          b.body.setScale(size * .9, size * 1.12);
        } else if (stage === "windup") {
          const t = ease(age / (o.final ? 750 : 900));
          b.root.setPosition(launch.x, launch.y);
          b.body.setScale(size * (1 + t * .3), size * (1 - t * .45)).setAngle(-direction * t * 7);
          b.shine.setFillStyle(0xf4d88b, .1 + t * .22);
          b.shadow.setScale(1 + t * .25, 1);
        } else if (stage === "rush") {
          const t = Math.min(1, age / rushDuration), travel = Math.pow(t, 1.12);
          // Both slimes share this height/arc, allowing one horizontal sweep through the pair.
          const p = mix(launch, { x: hero.x + direction * size * 3, y: hero.y - size * 3 }, travel);
          const hop = Math.sin(t * Math.PI) * Math.min(42, fieldH * .12);
          b.root.setPosition(p.x, p.y - hop);
          b.body.setScale(size * (.85 + t * .15), size * (1.15 - t * .15)).setAngle(-direction * 12 * (1 - t));
          b.shadow.setScale(.72).setAlpha(.2); b.shine.setFillStyle(0xf3dfa0, .24);
          for (let streak = 0; streak < 3; streak++) {
            const yy = b.root.y - size * 9 + (streak - 1) * size * 3;
            air.lineStyle(streak === 1 ? 4 : 2, 0xb9d695, .2 + .1 * Math.sin(t * Math.PI));
            air.lineBetween(b.root.x + direction * (size * 12 + streak * 6), yy,
              b.root.x + direction * size * 6, yy);
          }
        } else {
          const t = ease(age / 500), p = mix(starts[i], orbit(i), t);
          b.root.setPosition(p.x, p.y - Math.sin(t * Math.PI) * 22);
          b.body.setScale(size * (1.25 - t * .25), size * (.7 + t * .3));
        }
      });
      if (stage === "orbit" && age >= 850) beginWave();
      else if (stage === "gather" && age >= 470) enter("windup");
      else if (stage === "windup" && age >= (o.final ? 750 : 900)) {
        enter("rush"); o.sound("squish1");
        wave.forEach(i => splash(swarm[i].root.x, swarm[i].root.y, 6));
      } else if (stage === "rush") {
        if (wave.every(i => defeated[i])) enter("orbit");
        else if (age >= rushDuration) {
          // A paired miss is one attack; already defeated slimes never return.
          enter("recover"); o.sound("slimeatk");
          splash(hero.x, hero.y, 14); hero.setTintFill(0xf0a18e);
          later(140, () => { if (hero.active) hero.clearTint(); });
          o.hurt();
        }
      } else if (stage === "recover" && age >= 500) enter("orbit");
    };
  }

  let pointer: number | null = null;
  const onDown = (p: Phaser.Input.Pointer) => {
    if (!live() || pointer !== null) return;
    const q = local(p);
    if (q.x < 0 || q.x > R.w || q.y < fieldTop || q.y > R.h) return;
    pointer = p.id; down(q);
  };
  const onMove = (p: Phaser.Input.Pointer) => { if (live() && p.id === pointer) move(local(p)); };
  const onUp = (p: Phaser.Input.Pointer) => { if (p.id === pointer) { pointer = null; if (live()) up(local(p)); } };
  const onCancel = () => { pointer = null; cancel(); };
  const update = (time: number, delta: number) => { if (live()) tick(time, delta); };
  scene.input.on("pointerdown", onDown); scene.input.on("pointermove", onMove); scene.input.on("pointerup", onUp);
  scene.input.on("pointerupoutside", onCancel); scene.input.on("gameout", onCancel);
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  root.once("destroy", () => {
    dead = true;
    for (const clock of clocks) clock.remove(false);
    scene.tweens.killTweensOf(owned);
    scene.input.off("pointerdown", onDown); scene.input.off("pointermove", onMove); scene.input.off("pointerup", onUp);
    scene.input.off("pointerupoutside", onCancel); scene.input.off("gameout", onCancel);
    scene.events.off(Phaser.Scenes.Events.UPDATE, update);
  });
  if (cleared >= goal) later(100, finish);
  return root;
}
