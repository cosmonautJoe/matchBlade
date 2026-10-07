import Phaser from "phaser";

type Bounds = { x: number; y: number; w: number; h: number };
type IceKind = "gold" | "blue" | "red";

/** Soft procedural wisps, cached once; linear filtering keeps the mist smooth. */
function mistTexture(scene: Phaser.Scene) {
  const key = "frost-mist-wisp-v098";
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement("canvas");
  canvas.width = 384; canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.translate(62 + i * 36, 47 + Math.sin(i * 2.1) * 10);
    ctx.scale(2.5, 1);
    const radius = 22 + i % 3 * 5;
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, "rgba(218,241,249,0.58)");
    gradient.addColorStop(.45, "rgba(173,215,233,0.30)");
    gradient.addColorStop(1, "rgba(171,213,232,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.restore();
  }
  scene.textures.addCanvas(key, canvas)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

/** A bounded bank of mist. Keep it below HUD; light edge wisps may cross tiles. */
export function frostMist(scene: Phaser.Scene, width: number, height: number, opacity = .4) {
  const root = scene.add.container(0, 0);
  const tweens: Phaser.Tweens.Tween[] = [];
  for (let i = 0; i < 4; i++) {
    const w = width * (.42 + i % 2 * .16), h = height * (.57 + i % 3 * .1);
    const start = i % 2 ? .94 : .06;
    const x = w / 2 + (width - w) * start, y = height / 2 + (i % 2 ? 1 : -1) * height * .08;
    const cloud = scene.add.image(x, y, mistTexture(scene)).setDisplaySize(w, h).setAlpha(opacity * (.75 + i * .08));
    root.add(cloud);
    tweens.push(scene.tweens.add({ targets: cloud, x: width - x, y: height - y,
      duration: 5700 + i * 1300, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }));
  }
  root.once("destroy", () => tweens.forEach(t => t.stop()));
  return root;
}

/** Frost, snow and drifting mist cover the board background, below every tile. */
export function frozenBoardArt(scene: Phaser.Scene, cols: number, rows: number, tile: number) {
  const root = scene.add.container(0, 0);
  let effects: Phaser.GameObjects.Container | null = null;
  let width = 0, height = 0;
  const flakes: { image: Phaser.GameObjects.Rectangle; phase: number; speed: number; x: number }[] = [];
  const wisps: { image: Phaser.GameObjects.Image; w: number; h: number; y: number; phase: number; speed: number }[] = [];
  let elapsed = 0;
  const resize = (columns: number, lines: number) => {
    effects?.destroy(); flakes.length = 0; wisps.length = 0;
    width = columns * tile; height = lines * tile;
    effects = scene.add.container(0, 0); root.add(effects);
    const g = scene.add.graphics(); effects.add(g);
    g.fillStyle(0x102b3e).fillRoundedRect(-4, -4, width + 8, height + 8, 8);
    g.fillGradientStyle(0x31566a, 0x1d394e, 0x102937, 0x274558, .75).fillRoundedRect(0, 0, width, height, 6);
    g.lineStyle(5, 0x5d92aa, .9).strokeRoundedRect(-2, -2, width + 4, height + 4, 7);
    g.lineStyle(2, 0xddf5fc, .85).strokeRoundedRect(-3, -3, width + 6, height + 6, 8);
    // Snow collects on the lip; narrow icicles hang in the gaps between columns.
    for (let c = 0; c < columns; c++) {
      const x = c * tile;
      g.fillStyle(0xdbf1f7, .8).fillRoundedRect(x + 5, -4, tile - 10, 6, 3);
      g.fillStyle(0x98cadf, .8).fillRoundedRect(x + 20, height - 1, tile - 28, 4, 2);
      if (!c) continue;
      const length = 16 + c % 3 * 6;
      g.fillStyle(0x75b7d0, .95).fillTriangle(x - 4, 0, x + 5, 0, x + 1, length);
      g.fillStyle(0xe0faff, .9).fillTriangle(x - 3, 0, x, 0, x + 1, length - 2);
    }
    for (let r = 0; r < lines; r++) {
      const y = r * tile + 17;
      g.lineStyle(2, 0xb9e7f6, .7).strokePoints([{ x: 0, y }, { x: 3, y: y + 8 }, { x: 0, y: y + 21 }]);
      g.lineStyle(2, 0xb9e7f6, .55).strokePoints([{ x: width, y: y + 20 }, { x: width - 3, y: y + 32 }, { x: width, y: y + 45 }]);
    }
    // Stagger taller clouds throughout the board instead of a single floor strip.
    // Their different phases and gentle vertical drift prevent synchronized bands.
    const count = Math.max(15, lines * 3);
    for (let i = 0; i < count; i++) {
      const w = width * (.38 + i % 4 * .09), h = Math.min(height * .65, tile * (1.3 + i % 3 * .65));
      const phase = i * 2.39996, speed = .14 + i % 5 * .018;
      const image = scene.add.image(width / 2, h / 2 + (height - h) * (i + .5) / count, mistTexture(scene))
        .setDisplaySize(w, h).setAlpha(.76);
      effects.add(image);
      wisps.push({ image, w, h, y: (i + .5) / count, phase, speed });
    }
    for (let i = 0; i < 18; i++) {
      const flake = scene.add.rectangle(0, 0, i % 4 ? 2 : 3, i % 4 ? 2 : 3, 0xe2f7ff, .6);
      effects.add(flake);
      flakes.push({ image: flake, phase: (i * .381966) % 1, speed: 7 + i % 5 * 2, x: (i * .618034) % 1 });
    }
  };
  const update = (_time: number, delta: number) => {
    if (!root.visible) return;
    elapsed += Math.min(delta, 80) / 1000;
    for (const wisp of wisps) {
      const x = .5 + Math.sin(elapsed * wisp.speed + wisp.phase) * .5;
      const y = Phaser.Math.Clamp(wisp.y + Math.sin(elapsed * .11 + wisp.phase) * .1, 0, 1);
      wisp.image.setPosition(wisp.w / 2 + (width - wisp.w) * x, wisp.h / 2 + (height - wisp.h) * y);
      wisp.image.setAlpha(.72 + Math.sin(elapsed * .19 + wisp.phase) * .12);
    }
    for (const flake of flakes) {
      const progress = (flake.phase + elapsed * flake.speed / height) % 1;
      flake.image.setPosition(10 + flake.x * (width - 20) + Math.sin(elapsed * .35 + flake.phase * 9) * 5, 7 + progress * (height - 14));
      flake.image.setAlpha(Math.min(1, progress * 12, (1 - progress) * 12) * .65);
    }
  };
  resize(cols, rows); update(0, 0);
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  root.once("destroy", () => scene.events.off(Phaser.Scenes.Events.UPDATE, update));
  return { root, resize };
}

/** A cold, layered arena with ornament confined to the edges of the play space. */
export function frostArenaArt(scene: Phaser.Scene, R: Bounds, title: string, cue: string, progress: string, finale = false) {
  const root = scene.add.container(R.x, R.y).setDepth(40);
  const g = scene.add.graphics(); root.add(g);
  const tweens: Phaser.Tweens.Tween[] = [];
  const animate = (config: Phaser.Types.Tweens.TweenBuilderConfig) => tweens.push(scene.tweens.add(config));
  g.fillStyle(0x081521).fillRoundedRect(0, 0, R.w, R.h, 16);
  g.fillGradientStyle(0x17394d, 0x112635, 0x071320, 0x102a3b, 1);
  g.fillRoundedRect(7, 7, R.w - 14, R.h - 14, 12);
  // Buried, faceted ice gives the arena depth without disguising active targets.
  for (let i = 0; i < 8; i++) {
    const x = 12 + i * (R.w - 24) / 7;
    const height = 32 + (i * 43 % 76);
    g.fillStyle(i % 2 ? 0x3e7d95 : 0x24526e, .23);
    g.fillTriangle(x - 50, R.h - 8, x + 47, R.h - 8, x + 11, R.h - height);
    g.fillStyle(0x9ddae9, .1).fillTriangle(x + 11, R.h - height, x + 11, R.h - 8, x + 47, R.h - 8);
  }
  for (let i = 0; i < 14; i++) {
    const x = 20 + i * 97 % (R.w - 40), y = 145 + i * 71 % (R.h - 198);
    g.lineStyle(1, 0x87cce4, .1).strokePoints([{ x: x - 22, y }, { x, y: y - 5 }, { x: x + 42, y: y - 2 }]);
  }
  g.lineStyle(3, 0x6a9dae, .8).strokeRoundedRect(2, 2, R.w - 4, R.h - 4, 15);
  g.lineStyle(1, 0xcaf5ff, .28).strokeRoundedRect(7, 7, R.w - 14, R.h - 14, 11);
  for (const x of [12, R.w - 12]) {
    g.fillStyle(0xc0eaff, .35).fillTriangle(x - 5, 115, x + 5, 115, x, 151);
    g.fillStyle(0xc0eaff, .3).fillTriangle(x - 4, R.h - 12, x + 4, R.h - 12, x, R.h - 50);
  }
  root.add(frostMist(scene, R.w - 24, 130, .4).setPosition(12, R.h - 164));
  const text = (x: number, y: number, value: string, size: number, color: string) => scene.add.text(x, y, value,
    { fontFamily: "system-ui, sans-serif", fontSize: `${size}px`, fontStyle: "bold", color });
  const header = scene.add.graphics(); root.add(header);
  header.fillStyle(0x07121d, .92).fillRoundedRect(12, 12, R.w - 24, 87, 10);
  header.fillStyle(0x76c9df, .7).fillRoundedRect(23, 25, 4, 26, 2);
  header.lineStyle(1, 0xa9e6f2, .3).lineBetween(24, 99, R.w - 24, 99);
  root.add(text(38, 21, title, 29, "#edfaff"));
  root.add(text(25, 62, cue, 24, "#b5d4df").setWordWrapWidth(R.w - 50));
  header.fillStyle(0x2b5162, .8).fillRoundedRect(R.w - 132, 22, 107, 34, 9);
  const tally = text(R.w - 78, 26, progress, 24, "#d6f6ff").setOrigin(.5, 0); root.add(tally);
  root.add(text(R.w / 2, R.h - 24, finale ? "FINAL STAND" : "FROST GUARDIAN", 16, "#8cbdcf").setOrigin(.5, 0));
  for (let i = 0; i < 13; i++) {
    const flake = scene.add.rectangle(25 + i * 137 % (R.w - 50), 121 + i * 59 % (R.h - 168), i % 3 ? 2 : 4, i % 3 ? 2 : 4, 0xccefff, .2);
    root.add(flake);
    animate({ targets: flake, x: flake.x - 18, y: flake.y + 25, alpha: .04, duration: 2100 + i * 110, yoyo: true, repeat: -1 });
  }
  root.once("destroy", () => tweens.forEach(t => t.stop()));
  return { root, tally };
}

/** Faceted ice with a distinct inset symbol as well as a gameplay colour. */
export function frostCrystal(scene: Phaser.Scene, kind: IceKind) {
  const key = `frost-crystal-polished-${kind}`;
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 });
  const points = [{ x: 64, y: 5 }, { x: 106, y: 25 }, { x: 120, y: 65 }, { x: 101, y: 109 }, { x: 54, y: 123 }, { x: 14, y: 98 }, { x: 7, y: 45 }];
  const bright = kind === "gold" ? 0xffe09a : kind === "blue" ? 0x8feaff : 0xff9f9e;
  const base = kind === "gold" ? 0x806533 : kind === "blue" ? 0x286181 : 0x823c59;
  g.fillStyle(0x061923).fillPoints(points, true);
  g.lineStyle(4, 0xbeeefa, .9).strokePoints(points, true);
  g.fillStyle(base).fillPoints(points.map(p => ({ x: 64 + (p.x - 64) * .9, y: 64 + (p.y - 64) * .9 })), true);
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    g.fillStyle(i % 2 ? bright : 0xe4faff, [.26, .1, .08, .34, .12, .42, .18][i]);
    g.fillTriangle(a.x, a.y, b.x, b.y, 60, 65);
  }
  g.lineStyle(2, 0xf3fdff, .8).strokePoints([{ x: 17, y: 46 }, { x: 26, y: 34 }, { x: 57, y: 19 }]);
  g.lineStyle(2, 0x183443, .7).strokePoints([{ x: 20, y: 98 }, { x: 54, y: 114 }, { x: 99, y: 101 }]);
  g.fillStyle(0x0e2430, .75).fillCircle(64, 64, 23);
  g.lineStyle(2, bright, .85).strokeCircle(64, 64, 23);
  if (kind === "gold") {
    g.fillStyle(0xfff2b6).fillPoints([{ x: 64, y: 43 }, { x: 78, y: 65 }, { x: 64, y: 84 }, { x: 51, y: 65 }], true);
    g.fillStyle(0xffffff, .7).fillTriangle(64, 45, 64, 80, 54, 65);
  } else if (kind === "red") {
    g.lineStyle(6, 0xffdcd5).lineBetween(54, 54, 74, 74); g.lineBetween(74, 54, 54, 74);
  } else {
    g.lineStyle(5, 0xe6fbff).lineBetween(51, 76, 77, 52);
    g.lineStyle(2, 0x62bdda).lineBetween(54, 83, 83, 55);
  }
  g.generateTexture(key, 128, 128); g.destroy(); return key;
}

export function frostSpike(scene: Phaser.Scene) {
  const key = "frost-spike-polished";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 });
  const outline = [{ x: 8, y: 19 }, { x: 28, y: 5 }, { x: 56, y: 12 }, { x: 70, y: 38 }, { x: 38, y: 185 }, { x: 20, y: 74 }];
  g.fillStyle(0x285571).fillPoints(outline, true);
  g.fillStyle(0xb4ecff, .85).fillTriangle(28, 8, 35, 169, 12, 23);
  g.fillStyle(0x6aafca).fillTriangle(28, 8, 56, 15, 38, 181);
  g.fillStyle(0xff7992, .65).fillTriangle(56, 15, 68, 38, 38, 181);
  g.lineStyle(3, 0xd8f9ff, .9).strokePoints(outline, true);
  g.lineStyle(2, 0xffffff, .8).lineBetween(28, 21, 37, 131);
  g.generateTexture(key, 78, 192); g.destroy(); return key;
}

export function frostHeart(scene: Phaser.Scene) {
  const key = "frost-heart-polished";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 });
  const edge = [{ x: 64, y: 4 }, { x: 105, y: 25 }, { x: 122, y: 65 }, { x: 93, y: 111 }, { x: 64, y: 124 }, { x: 26, y: 103 }, { x: 7, y: 55 }, { x: 27, y: 20 }];
  g.fillStyle(0x20516d).fillPoints(edge, true);
  for (let i = 0; i < edge.length; i++) {
    const a = edge[i], b = edge[(i + 1) % edge.length];
    g.fillStyle(i % 2 ? 0xa9ecff : 0x5998bf, i % 2 ? .55 : .8).fillTriangle(a.x, a.y, b.x, b.y, 62, 67);
  }
  g.lineStyle(3, 0xddfaff).strokePoints(edge, true);
  g.fillStyle(0x142c43, .8).fillCircle(64, 64, 34);
  const heart = [{ x: 64, y: 49 }, { x: 54, y: 40 }, { x: 42, y: 43 }, { x: 36, y: 54 }, { x: 39, y: 67 }, { x: 64, y: 90 }, { x: 88, y: 67 }, { x: 92, y: 54 }, { x: 86, y: 43 }, { x: 74, y: 40 }];
  g.fillStyle(0xeac97f).fillPoints(heart, true);
  g.fillStyle(0xfff0b3).fillTriangle(42, 47, 64, 57, 64, 84);
  g.lineStyle(2, 0xfff6d0, .9).strokePoints(heart, true);
  g.lineStyle(2, 0xe0fbff, .8).strokePoints([{ x: 16, y: 51 }, { x: 32, y: 26 }, { x: 62, y: 12 }]);
  g.lineStyle(2, 0x133748, .6).strokePoints([{ x: 77, y: 15 }, { x: 82, y: 30 }, { x: 104, y: 42 }, { x: 113, y: 64 }]);
  g.generateTexture(key, 128, 128); g.destroy(); return key;
}

/** Shared fracture language for the boss plates and regular frozen tiles. */
export function iceCracks(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, hits: number) {
  if (!hits) return;
  const paths = [
    [[-.1, -.48], [.02, -.23], [-.09, -.05], [.06, .17], [-.06, .48]],
    [[-.47, .13], [-.25, .07], [-.09, -.05], [.2, -.09], [.46, -.27]],
    [[.06, .17], [.31, .22], [.46, .42]],
  ];
  for (const [i, path] of paths.entries()) {
    if (i > 0 && hits < 2) continue;
    const points = path.map(([px, py]) => ({ x: x + px * size, y: y + py * size }));
    g.lineStyle(4, 0x102f48, .8).strokePoints(points);
    g.lineStyle(1.7, 0xf0fcff, .95).strokePoints(points);
  }
}

export function frozenTile(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, hits: number) {
  const r = size / 2;
  g.fillStyle(0x88cae9, .2 - hits * .035).fillRoundedRect(x - r, y - r, size, size, 8);
  g.lineStyle(4, 0x2d647e, .7).strokeRoundedRect(x - r, y - r, size, size, 8);
  g.lineStyle(2, 0xd1f5ff, .95).strokeRoundedRect(x - r + 1, y - r + 1, size - 2, size - 2, 7);
  g.fillStyle(0xdefaff, .5).fillTriangle(x - r + 4, y - r + 4, x - r + 25, y - r + 4, x - r + 4, y - r + 27);
  g.fillStyle(0xdefaff, .38).fillTriangle(x + r - 4, y + r - 4, x + r - 23, y + r - 4, x + r - 4, y + r - 25);
  iceCracks(g, x, y, size, hits);
  g.fillStyle(0x0c2334, .85).fillRoundedRect(x - 18, y + r - 12, 36, 10, 4);
  for (let i = 0; i < 3; i++) g.fillStyle(i < 3 - hits ? 0xd2f7ff : 0x39566b).fillRect(x - 12 + i * 9, y + r - 9, 6, 4);
}

/** Actual glassy pieces tumble out, with a compact impact flash and no screen wash. */
export function iceBurst(scene: Phaser.Scene, x: number, y: number, size = 42, strength = 1) {
  const root = scene.add.container(x, y).setDepth(58);
  const tweens: Phaser.Tweens.Tween[] = [];
  if (strength >= .6) for (let i = 0; i < 3; i++) {
    const mist = scene.add.image((i - 1) * size * .2, 0, mistTexture(scene))
      .setDisplaySize(size * 2, size * .85).setAlpha(.55);
    root.add(mist);
    tweens.push(scene.tweens.add({ targets: mist, x: (i - 1) * size * .8, y: -size * .25,
      scaleX: mist.scaleX * 1.6, scaleY: mist.scaleY * 1.4, alpha: 0, duration: 700, ease: "Sine.easeOut" }));
  }
  for (let i = 0; i < (strength < .6 ? 5 : 11); i++) {
    const a = i * 2.399, length = size * (.65 + Math.random()) * strength;
    const shard = scene.add.image(0, 0, frostSpike(scene)).setTint(i % 2 ? 0xd3f9ff : 0x85cfea)
      .setDisplaySize(5 + Math.random() * 6, 12 + Math.random() * 14).setAngle(i * 41);
    root.add(shard);
    tweens.push(scene.tweens.add({ targets: shard, x: Math.cos(a) * length, y: Math.sin(a) * length + size * .7,
      angle: shard.angle + 100, alpha: 0, duration: 370 + Math.random() * 180, ease: "Quad.easeOut" }));
  }
  const flash = scene.add.circle(0, 0, size * .32, 0xdffaff, .55); root.add(flash);
  tweens.push(scene.tweens.add({ targets: flash, scale: 1.8, alpha: 0, duration: 170 }));
  const clock = scene.time.delayedCall(750, () => root.destroy());
  root.once("destroy", () => { clock.remove(false); tweens.forEach(t => t.stop()); });
  return root;
}
