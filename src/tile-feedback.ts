import Phaser from "phaser";
import { decoratePotionSheen } from "./potion-sheen";

/** Local accents clear quickly and stay close to their tile, leaving the fight readable. */
export function tileClearBurst(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, type: number) {
  const add = (g: Phaser.GameObjects.Graphics) => { parent.add(g); return g.setPosition(x, y).setDepth(43); };
  const animate = (g: Phaser.GameObjects.Graphics, dx: number, dy: number, duration: number, rotation = 0) => {
    scene.tweens.add({ targets: g, x: x + dx, y: y + dy, rotation, alpha: 0,
      duration, ease: "Cubic.easeOut", onComplete: () => g.destroy() });
  };
  if (type === 0) {
    // Steel: two crisp crossing cuts, then a few short sparks.
    const slash = add(scene.add.graphics().lineStyle(4, 0xffe1b4, .95));
    slash.lineBetween(-23, 20, 20, -23).lineBetween(-18, -18, 18, 18);
    scene.tweens.add({ targets: slash, scale: 1.13, alpha: 0, duration: 180, onComplete: () => slash.destroy() });
  } else if (type === 2) {
    // A shield silhouette answers the match instead of another explosion.
    const shield = add(scene.add.graphics().lineStyle(3, 0xafe8ff, .95));
    shield.strokePoints([{x:-20,y:-20},{x:20,y:-20},{x:17,y:10},{x:0,y:24},{x:-17,y:10}], true);
    scene.tweens.add({ targets: shield, scale: 1.18, alpha: 0, duration: 240, onComplete: () => shield.destroy() });
  } else if (type === 3 || type === 4) {
    const glint = add(scene.add.graphics().lineStyle(3, type === 3 ? 0xffd887 : 0xb4f8ff, .9));
    glint.lineBetween(-13,0,13,0).lineBetween(0,-13,0,13);
    scene.tweens.add({ targets: glint, scale: 1.3, alpha: 0, duration: 200, onComplete: () => glint.destroy() });
  }
  const count = type === 0 || type === 2 ? 2 : 4;
  for (let i = 0; i < count; i++) {
    const g = add(scene.add.graphics());
    const side = i % 2 ? 1 : -1;
    const spread = 10 + i * 5;
    const duration = 210 + i * 25;
    if (type === 5) {
      // Light wood splinters: long edges and a short downward tumble.
      g.fillStyle(i % 2 ? 0xe3b678 : 0xb87942).fillRect(-2, -7, 4, 14);
      g.fillStyle(0xf0cf99).fillRect(-2,-7,1,10);
      animate(g, side * spread, 12 + i * 4, duration, side * (1 + i * .3));
    } else if (type === 6) {
      // Stone: broad, heavy angular chips with one pale facet.
      g.fillStyle(i % 2 ? 0x91a8b8 : 0x657c8c).fillPoints([{x:-5,y:-3},{x:1,y:-6},{x:6,y:0},{x:3,y:5},{x:-4,y:4}],true);
      g.fillStyle(0xcad9dd).fillTriangle(-5,-3,1,-6,0,1);
      animate(g, side * spread, 17 + i * 4, duration, side * .7);
    } else if (type === 1) {
      // Magic: compact violet flames with pale cores rise out of the match.
      g.fillStyle(i % 2 ? 0xd19aff : 0xa968e8).fillPoints([{x:0,y:-8},{x:4,y:-1},{x:3,y:5},{x:-3,y:5},{x:-5,y:0}],true);
      g.fillStyle(0xffeed3).fillRect(-1,0,3,4);
      animate(g, side * spread * .7, -22 - i * 5, duration);
    } else if (type === 7) {
      g.lineStyle(2,0xadffd8,.9).strokeCircle(0,0,3+i%2);
      animate(g, side * spread * .6, -22 - i * 4, duration);
    } else {
      const color = type === 2 ? 0x9cdeff : type === 4 ? 0x8aefff : 0xffd98a;
      g.fillStyle(color).fillPoints([{x:0,y:-5},{x:3,y:0},{x:0,y:5},{x:-3,y:0}],true);
      animate(g, side * spread, -10 - i * 4, duration, side * .35);
    }
  }
}

export function tileVisual(tile: Phaser.GameObjects.Container): Phaser.GameObjects.Container {
  return tile.getData("visual") ?? tile;
}

/** Potions are usable immediately; keep their action cue attached during swaps and falls. */
export function decoratePotion(scene: Phaser.Scene, tile: Phaser.GameObjects.Container) {
  decoratePotionSheen(scene, tile);
  const rim = scene.add.graphics().lineStyle(2, 0xa5f0ca, .9)
    .strokeRoundedRect(-40, -40, 80, 80, 8).setAlpha(.45);
  const plate = scene.add.graphics().fillStyle(0x17232c, .98)
    .fillRoundedRect(-27, 15, 54, 25, 6)
    .lineStyle(1.5, 0xa5f0ca, .9).strokeRoundedRect(-27, 15, 54, 25, 6);
  const label = scene.add.text(0, 27, "TAP", {
    fontFamily: '"Pixelify Sans", monospace', fontSize: "22px", fontStyle: "bold",
    color: "#edfff5", stroke: "#17232c", strokeThickness: 2,
  }).setOrigin(.5).setResolution(3);
  const cue = scene.add.container(0, 0, [rim, plate, label]).setVisible(false);
  tileVisual(tile).add(cue);
  // Only the thin rim breathes; the label stays still and readable.
  const pulse = scene.tweens.add({ targets: rim, alpha: .8,
    duration: 1400, yoyo: true, repeat: -1, repeatDelay: 1600, ease: "Sine.easeInOut", paused: true });
  tile.once("destroy", () => pulse.remove());
  let ready = false;
  return {
    setReady(value: boolean) {
      if (ready === value) return;
      ready = value; cue.setVisible(value);
      if (value) pulse.resume(); else pulse.pause();
    },
  };
}

export function liftTile(scene: Phaser.Scene, tile: Phaser.GameObjects.Container, lifted: boolean) {
  const visual = tileVisual(tile);
  scene.tweens.killTweensOf(visual);
  scene.tweens.add({ targets: visual, y: lifted ? -4 : 0, scale: lifted ? 1.045 : 1,
    duration: lifted ? 90 : 120, ease: "Cubic.easeOut" });
}

export function settleTile(scene: Phaser.Scene, tile: Phaser.GameObjects.Container) {
  const visual = tileVisual(tile);
  scene.tweens.killTweensOf(visual);
  visual.setPosition(0, 0).setScale(1);
  visual.setScale(1.018, .982);
  scene.tweens.add({ targets: visual, scaleX: 1, scaleY: 1, duration: 120, ease: "Sine.easeOut" });
}
