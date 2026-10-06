import Phaser from "phaser";

/** Small, grounded props reuse the forest's existing pixel art. */
export class ForestAmbushBrush {
  readonly root: Phaser.GameObjects.Container;
  private bushes: Phaser.GameObjects.Image[] = [];

  constructor(private scene: Phaser.Scene, parent: Phaser.GameObjects.Container, ground: number) {
    this.root = scene.add.container(0, ground);
    parent.add(this.root);
    for (const x of [-12, 106]) {
      const shadow = scene.add.ellipse(x, 1, 74, 9, 0x0e211c, .24);
      const bush = scene.add.image(x, 2, "bush_small").setOrigin(.5, 1).setTint(0xabc88e);
      bush.setScale(30 / bush.height).setFlipX(x > 0);
      this.root.add([shadow, bush]);
      this.bushes.push(bush);
    }
    if (!scene.textures.exists("ambush-leaf")) {
      const g = scene.add.graphics();
      g.fillStyle(0x749750).fillRect(0, 2, 8, 3);
      g.fillStyle(0xb8cf79).fillRect(2, 0, 4, 3);
      g.generateTexture("ambush-leaf", 8, 6); g.destroy();
    }
  }

  rustle(index: number) {
    const bush = this.bushes[index];
    this.scene.tweens.add({ targets: bush, angle: { from: -5, to: 5 }, duration: 65,
      yoyo: true, repeat: 3, onComplete: () => bush.setAngle(0) });
    const leaves = this.scene.add.particles(bush.x, -12, "ambush-leaf", {
      angle: { min: 215, max: 325 }, speed: { min: 40, max: 95 }, gravityY: 100,
      lifespan: { min: 550, max: 900 }, rotate: { start: 0, end: 160 },
      scale: { start: 1, end: .6 }, alpha: { start: .9, end: 0 }, emitting: false,
    });
    this.root.add(leaves); leaves.explode(9);
    this.scene.time.delayedCall(1000, () => leaves.destroy());
  }

  leave() {
    this.scene.tweens.add({ targets: this.root, x: this.root.x - 130, alpha: 0,
      duration: 700, ease: "Sine.easeIn", onComplete: () => this.root.destroy() });
  }
}

/** A single fire wave connects both impacts, making the multi-target hit legible. */
export function ambushSplash(scene: Phaser.Scene, parent: Phaser.GameObjects.Container,
  x: number, rearX: number, y: number, tint: number) {
  const wave = scene.add.ellipse((x + rearX) / 2, y, Math.abs(rearX - x) + 54, 44, tint, .22)
    .setStrokeStyle(2, tint, .8).setBlendMode(Phaser.BlendModes.ADD);
  const burst = scene.add.particles(rearX, y, "spark", {
    speed: { min: 45, max: 150 }, lifespan: { min: 180, max: 380 },
    scale: { start: .9, end: 0 }, tint, blendMode: "ADD", emitting: false,
  });
  parent.add([wave, burst]); burst.explode(16);
  scene.tweens.add({ targets: wave, scaleY: 1.6, alpha: 0, duration: 280,
    onComplete: () => wave.destroy() });
  scene.time.delayedCall(450, () => burst.destroy());
}
