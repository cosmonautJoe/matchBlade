import Phaser from "phaser";

const KEY = "tile-held-fire-v117";
const WIDTH = 112, HEIGHT = 124, DENSITY = 2, FRAMES = 40, COLUMNS = 8;

/** Bake smooth, translucent flame ribbons once; holding a tile only changes a frame. */
function prepareFire(scene: Phaser.Scene) {
  if (scene.textures.exists(KEY)) return;
  const canvas = document.createElement("canvas");
  const w = WIDTH * DENSITY, h = HEIGHT * DENSITY;
  canvas.width = w * COLUMNS;
  canvas.height = h * Math.ceil(FRAMES / COLUMNS);
  const g = canvas.getContext("2d")!;
  for (let frame = 0; frame < FRAMES; frame++) {
    g.save();
    g.translate(frame % COLUMNS * w, Math.floor(frame / COLUMNS) * h);
    g.beginPath(); g.rect(0, 0, w, h); g.clip();
    g.scale(DENSITY, DENSITY);
    g.translate(WIDTH / 2, 78);
    const phase = frame / FRAMES * Math.PI * 2;
    const flicker = .9 + Math.sin(phase * 3) * .06 + Math.sin(phase * 7) * .04;
    const glow = g.createRadialGradient(-5, 12, 2, -5, 7, 43);
    glow.addColorStop(0, `rgba(255,221,246,${.2 * flicker})`);
    glow.addColorStop(.4, `rgba(213,94,255,${.23 * flicker})`);
    glow.addColorStop(.72, "rgba(141,48,245,.09)");
    glow.addColorStop(1, "rgba(94,28,193,0)");
    g.fillStyle = glow; g.fillRect(-48, -39, 96, 91);

    // Each ribbon wraps around the existing fireball, curling upwards at its tip.
    // Continuous periodic curves make the final frame blend back into the first.
    for (let i = 0; i < 5; i++) {
      const p = phase + i * 1.73;
      const rootX = [-24, -14, 2, 21, 29][i];
      const rootY = [19, 28, 29, 23, 12][i];
      const tipX = rootX + 10 + Math.sin(p) * 9;
      const tipY = -30 - (i % 3) * 8 - Math.sin(p + .8) * 8;
      const bendX = rootX - 12 + Math.sin(p * 2) * 6;
      const midY = (rootY + tipY) * .5;
      for (let layer = 0; layer < 3; layer++) {
        const width = (9 - layer * 3) * (1 + Math.sin(p + 1) * .18);
        const gradient = g.createLinearGradient(rootX, rootY, tipX, tipY);
        if (layer === 0) {
          gradient.addColorStop(0, "rgba(163,51,255,0)");
          gradient.addColorStop(.28, "rgba(171,67,255,.38)");
          gradient.addColorStop(.7, "rgba(194,104,255,.32)");
        } else if (layer === 1) {
          gradient.addColorStop(0, "rgba(239,147,255,0)");
          gradient.addColorStop(.25, "rgba(247,155,255,.55)");
          gradient.addColorStop(.62, "rgba(222,149,255,.4)");
        } else {
          gradient.addColorStop(0, "rgba(255,249,231,0)");
          gradient.addColorStop(.2, "rgba(255,244,226,.7)");
          gradient.addColorStop(.5, "rgba(255,215,248,.46)");
        }
        gradient.addColorStop(1, "rgba(189,113,255,0)");
        g.fillStyle = gradient;
        g.beginPath();
        g.moveTo(rootX - width * .45, rootY);
        g.bezierCurveTo(bendX - width, midY + 11, tipX + 11, tipY + 18, tipX, tipY);
        g.bezierCurveTo(tipX + 3, tipY + 21, bendX + width, midY + 3, rootX + width * .45, rootY);
        g.closePath(); g.fill();
      }
    }
    // A small hot center makes the light feel attached to the illustrated flame.
    const core = g.createRadialGradient(-9, 13, 0, -9, 13, 16);
    core.addColorStop(0, `rgba(255,246,217,${.36 * flicker})`);
    core.addColorStop(.32, "rgba(255,204,238,.18)");
    core.addColorStop(1, "rgba(235,113,255,0)");
    g.fillStyle = core; g.fillRect(-25, -3, 32, 32);
    g.restore();
  }
  const texture = scene.textures.addCanvas(KEY, canvas)!;
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  for (let frame = 0; frame < FRAMES; frame++)
    texture.add(frame, 0, frame % COLUMNS * w, Math.floor(frame / COLUMNS) * h, w, h);
}

export function createHeldFire(scene: Phaser.Scene, visual: Phaser.GameObjects.Container) {
  prepareFire(scene);
  const flame = scene.add.image(0, 0, KEY, 0).setOrigin(.5, 78 / HEIGHT)
    .setDisplaySize(WIDTH, HEIGHT).setBlendMode(Phaser.BlendModes.ADD);
  visual.add(flame);
  return {
    update(age: number, opacity: number) {
      flame.setFrame(Math.floor(age * .03) % FRAMES);
      flame.setAlpha(opacity * (.82 + Math.max(0, 1 - age / 220) * .18));
    },
    destroy() { flame.destroy(); },
  };
}
