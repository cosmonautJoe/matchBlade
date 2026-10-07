import Phaser from "phaser";
import type { Coord } from "./board";

/** Room for the cache locks below the tiles, included in both layout budgets. */
export const DELVE_FRAME_FOOTER = 54;

function glowTexture(scene: Phaser.Scene) {
  const key = "delve-board-glow-v103";
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,0.9)");
  gradient.addColorStop(.3, "rgba(255,255,255,0.5)");
  gradient.addColorStop(.7, "rgba(255,255,255,0.12)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  scene.textures.addCanvas(key, canvas)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

/** A torchlit vault under the puzzle. Cache animation only observes gameplay state. */
export function delveBoardArt(scene: Phaser.Scene, cols: number, rows: number, tile: number) {
  const root = scene.add.container(0, 0), glow = glowTexture(scene);
  let effects: Phaser.GameObjects.Container;
  let width = 0, height = 0, elapsed = 0;
  let locks = -1, caches = -1, openAge = -1;
  let counter: Phaser.GameObjects.Text;
  let rewardRim: Phaser.GameObjects.Graphics;
  const lockPulse = [0, 0, 0];
  const lamps: { image: Phaser.GameObjects.Image; phase: number; alpha: number }[] = [];
  const cracks: { image: Phaser.GameObjects.Graphics; points: { x: number; y: number }[]; energy: number; phase: number }[] = [];
  const dust: { image: Phaser.GameObjects.Rectangle; phase: number; x: number; speed: number; ember: boolean }[] = [];
  const seals: { root: Phaser.GameObjects.Container; halo: Phaser.GameObjects.Image;
    body: Phaser.GameObjects.Rectangle; shackle: Phaser.GameObjects.Graphics; gem: Phaser.GameObjects.Rectangle }[] = [];
  const sparks: { image: Phaser.GameObjects.Rectangle; x: number; y: number; vx: number; vy: number; age: number }[] = [];

  const resize = (columns: number, lines: number) => {
    effects?.destroy(); lamps.length = 0; cracks.length = 0; dust.length = 0; seals.length = 0; sparks.length = 0;
    width = columns * tile; height = lines * tile;
    effects = scene.add.container(0, 0); root.add(effects);
    const stone = scene.add.graphics(); effects.add(stone);
    stone.fillStyle(0x100e18).fillRoundedRect(-4, -4, width + 8, height + DELVE_FRAME_FOOTER + 8, 8);
    stone.fillGradientStyle(0x302e3d, 0x22232e, 0x191b25, 0x302634, 1).fillRect(0, 0, width, height);
    // Offset masonry and small chips read as stone through the tile gutters.
    for (let row = 0, y = 0; y < height; row++, y += tile * .72) {
      for (let column = 0, x = row % 2 ? -tile * .7 : 0; x < width; column++, x += tile * 1.45) {
        const left = Math.max(1, x + 2), right = Math.min(width - 1, x + tile * 1.45 - 2);
        const bottom = Math.min(height - 1, y + tile * .72 - 2);
        stone.fillStyle([0x46434d, 0x333440, 0x45414b][(row + column) % 3], .6)
          .fillRoundedRect(left, y + 2, right - left, bottom - y - 2, 3);
        stone.lineStyle(1, 0x938780, .2).lineBetween(left + 4, y + 3, right - 4, y + 3);
      }
    }
    for (let i = 0; i < columns * lines * 2; i++) {
      const x = 5 + i * 67 % (width - 10), y = 5 + i * 113 % (height - 10);
      stone.fillStyle(i % 3 ? 0x080c14 : 0x99867b, .3).fillRect(x, y, 2 + i % 4, 1 + i % 2);
    }

    // Fractures follow short stretches of grout, then branch beneath the tile faces.
    const fracture = (points: { x: number; y: number }[], phase: number) => {
      stone.lineStyle(5, 0x0b0a16, .85).strokePoints(points);
      stone.lineStyle(1, 0x8d69b5, .34).strokePoints(points);
      const image = scene.add.graphics(); effects.add(image);
      image.lineStyle(12, 0x8e4acf, .13).strokePoints(points);
      image.lineStyle(5, 0xb675f6, .48).strokePoints(points);
      image.lineStyle(1.5, 0xe2b8ff, .9).strokePoints(points);
      cracks.push({ image, points, energy: 0, phase });
    };
    for (let row = 1; row < lines; row++) {
      for (let side = 0; side < 2; side++) {
        const x = tile * (1 + (row * 3 + side * 2) % (columns - 2)), y = row * tile;
        fracture([{ x: x - tile * .7, y: y - 12 }, { x: x - tile * .45, y: y + 1 },
          { x: x - 7, y: y - 1 }, { x: x + 4, y: y + 2 }, { x: x + 23, y: y - 15 },
          { x: x + 43, y: y - 9 }], row * 1.9 + side);
      }
    }
    for (let column = 1; column < columns; column += 2) {
      const x = column * tile, y = tile * (1 + column % (lines - 2));
      fracture([{ x: x - 13, y: y - 45 }, { x: x + 1, y: y - 24 }, { x: x - 2, y: y + 4 },
        { x: x + 1, y: y + 38 }, { x: x + 17, y: y + 60 }], column * 2.1);
    }

    // Amber light from unseen wall torches; violet depth stays quieter in the middle.
    for (let i = 0; i < 4; i++) {
      const image = scene.add.image(i % 2 ? width * .9 : width * .1, height * (i < 2 ? .32 : .68), glow)
        .setDisplaySize(width * .56, height * .64).setTint(0xf4a64b);
      // Keep soft light inside the frame without masks or overlays over the tiles.
      image.setX(i % 2 ? width - image.displayWidth / 2 : image.displayWidth / 2);
      effects.add(image); lamps.push({ image, phase: i * 2.7, alpha: .6 });
    }
    for (let i = 0; i < 3; i++) {
      const image = scene.add.image(width * .5, height * (.23 + i * .27), glow)
        .setDisplaySize(width * .56, height * .44).setTint(0x855fba);
      effects.add(image); lamps.push({ image, phase: i * 3.1, alpha: .17 });
    }
    const rim = scene.add.graphics(); effects.add(rim);
    const totalHeight = height + DELVE_FRAME_FOOTER;
    rim.lineStyle(5, 0x5c483e).strokeRoundedRect(-2, -2, width + 4, totalHeight + 4, 7);
    rim.lineStyle(1.5, 0xc3a279, .85).strokeRoundedRect(-3, -3, width + 6, totalHeight + 6, 8);
    rim.lineStyle(1, 0x100e16, .85).strokeRoundedRect(2, 2, width - 4, height - 4, 4);
    for (const x of [1, width - 1]) for (const y of [1, height - 1]) {
      rim.fillStyle(0x957556).fillCircle(x, y, 3);
      rim.fillStyle(0xe2c69a, .7).fillCircle(x - .5, y - .5, 1);
    }
    // This recess has its own layout space; it cannot cover the last row or quests.
    rim.fillStyle(0x16141e).fillRect(1, height + 3, width - 2, DELVE_FRAME_FOOTER - 4);
    rim.lineStyle(1, 0x997957, .65).lineBetween(3, height + 4, width - 3, height + 4);
    rim.lineStyle(1, 0x997957, .35).lineBetween(15, height + 30, width - 15, height + 30);
    const labelStyle = { fontFamily: "system-ui, sans-serif", fontSize: "22px", fontStyle: "bold", color: "#cbbba4",
      backgroundColor: "#16141e", padding: { left: 6, right: 6 } };
    effects.add(scene.add.text(14, height + 29, "BONUS CACHE", labelStyle).setOrigin(0, .5));
    counter = scene.add.text(width - 14, height + 29, "0 / 3", labelStyle).setOrigin(1, .5);
    effects.add(counter);
    for (let i = 0; i < 3; i++) {
      const lock = scene.add.container(width / 2 + (i - 1) * 54, height + 29); effects.add(lock);
      lock.add(scene.add.rectangle(0, 0, 44, 44, 0x16141e));
      const halo = scene.add.image(0, 0, glow).setDisplaySize(60, 48).setTint(0xffcb77); lock.add(halo);
      const shackle = scene.add.graphics();
      shackle.lineStyle(5, 0xb39874).strokeRoundedRect(-9, -17, 18, 23, 8);
      shackle.lineStyle(1, 0xf3ddaf, .65).strokeRoundedRect(-9, -17, 18, 23, 8);
      const body = scene.add.rectangle(0, 5, 28, 24, 0x4a3e3b).setStrokeStyle(2, 0x8e735b);
      const gem = scene.add.rectangle(0, 4, 6, 6, 0x877496).setAngle(45);
      const slot = scene.add.rectangle(0, 10, 3, 5, 0x15121a);
      lock.add([shackle, body, gem, slot]); seals.push({ root: lock, halo, body, shackle, gem });
    }
    rewardRim = scene.add.graphics(); effects.add(rewardRim);
    rewardRim.lineStyle(3, 0xffd58c, .8).strokeRoundedRect(-2, -2, width + 4, totalHeight + 4, 7);

    for (let i = 0; i < 22; i++) {
      const ember = i < 8;
      const image = scene.add.rectangle(0, 0, ember ? 2.5 : 1.5, ember ? 4 : 1.5, ember ? 0xffbf68 : 0xc1b0cf);
      effects.add(image);
      dust.push({ image, phase: (i * .381966) % 1, x: (i * .618034) % 1, speed: ember ? 15 + i % 3 * 4 : 4 + i % 3, ember });
    }
    update(0, 0);
  };

  const burstTreasure = () => {
    // Deterministic cosmetic motion must never consume puzzle RNG or grant resources.
    for (let i = 0; i < 14; i++) {
      const x = width / 2 + (i % 3 - 1) * 54, y = height + 29;
      const image = scene.add.rectangle(x, y, i % 3 ? 4 : 7, i % 3 ? 4 : 7, i % 3 ? 0xffd588 : 0x8ee5ef).setAngle(45);
      effects.add(image);
      sparks.push({ image, x, y, vx: (i - 6.5) * 18, vy: -45 - i % 4 * 20, age: 0 });
    }
  };

  const syncCache = (nextLocks: number, nextCaches: number) => {
    if (nextLocks === locks && nextCaches === caches) return;
    if (caches >= 0) {
      if (nextCaches > caches) {
        openAge = 0; lockPulse.fill(1);
      } else if (nextLocks > locks) {
        for (let i = locks; i < nextLocks; i++) lockPulse[i] = 1;
      }
    }
    locks = nextLocks; caches = nextCaches;
  };

  const reactToMatch = (cells: readonly Coord[], cascade: number) => {
    if (cells.length < 4 && cascade < 2) return;
    for (const crack of cracks) {
      const near = crack.points.some(point => cells.some(cell =>
        Math.hypot(point.x - (cell.c + .5) * tile, point.y - (cell.r + .5) * tile) < tile * 1.4));
      if (near) crack.energy = Math.min(1, .7 + cells.length * .04);
    }
  };

  const update = (_time: number, delta: number) => {
    if (!root.visible) return;
    const dt = Math.min(delta, 80) / 1000;
    elapsed += dt;
    if (openAge >= 0) {
      const previous = openAge; openAge += dt;
      if (previous < .24 && openAge >= .24) burstTreasure();
      if (openAge > 1.6) openAge = -1;
    }
    for (const lamp of lamps) lamp.image.setAlpha(lamp.alpha *
      (.85 + Math.sin(elapsed * 2.1 + lamp.phase) * .07 + Math.sin(elapsed * 4.7 + lamp.phase) * .04));
    for (const crack of cracks) {
      crack.energy *= Math.exp(-dt * 2.6);
      crack.image.setAlpha(.12 + Math.sin(elapsed * .45 + crack.phase) * .045 + crack.energy * .86);
    }
    for (const particle of dust) {
      const p = (particle.phase + elapsed * particle.speed / height) % 1;
      const x = particle.ember ? (particle.x < .5 ? 10 + particle.x * 32 : width - 10 - (1 - particle.x) * 32)
        : 16 + particle.x * (width - 32);
      particle.image.setPosition(x + Math.sin(elapsed * .5 + particle.phase * 12) * 6, 8 + (1 - p) * (height - 16));
      particle.image.setAlpha(Math.min(1, p * 8, (1 - p) * 8) * (particle.ember ? .72 : .3));
    }
    const opening = openAge >= 0, complete = caches >= 3;
    const lift = complete && !opening ? 1 : opening ? Phaser.Math.Clamp((openAge - .15) / .35, 0, 1) : 0;
    counter.setText(`${Math.max(0, caches)} / 3`).setColor(complete ? "#f0d49b" : "#cbbba4");
    for (let i = 0; i < seals.length; i++) {
      const seal = seals[i], lit = i < locks || opening || complete;
      lockPulse[i] = Math.max(0, lockPulse[i] - dt * 1.4);
      seal.body.setFillStyle(lit ? 0xa9793f : 0x4a3e3b).setStrokeStyle(2, lit ? 0xf2d299 : 0x8e735b);
      seal.gem.setFillStyle(lit ? 0xffe8a3 : 0x877496);
      seal.shackle.setY(-6 * lift).setRotation(lift * -.24).setAlpha(lit ? 1 : .65);
      seal.halo.setAlpha((lit ? .26 : .035) + lockPulse[i] * .55);
      seal.root.setScale(1 + lockPulse[i] * .08);
    }
    rewardRim.setAlpha(opening ? Math.max(0, 1 - openAge / 1.2) : 0);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const spark = sparks[i]; spark.age += dt;
      if (spark.age >= .85) { spark.image.destroy(); sparks.splice(i, 1); continue; }
      const t = spark.age;
      spark.image.setPosition(spark.x + spark.vx * t, spark.y + spark.vy * t + 65 * t * t)
        .setRotation(.8 + t * 4).setAlpha(1 - t / .85);
    }
  };

  resize(cols, rows);
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  root.once("destroy", () => scene.events.off(Phaser.Scenes.Events.UPDATE, update));
  return { root, resize, syncCache, reactToMatch };
}
