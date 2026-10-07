import Phaser from "phaser";

/** Small cached textures keep the woodland lighting soft and the leaves pixel crisp. */
function forestTextures(scene: Phaser.Scene) {
  const glow = "forest-board-dapple-v101", ray = "forest-board-sunray-v101", leaf = "forest-board-leaf-v101";
  if (!scene.textures.exists(glow)) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const light = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    light.addColorStop(0, "rgba(235,241,171,0.75)");
    light.addColorStop(.35, "rgba(170,203,115,0.45)");
    light.addColorStop(.7, "rgba(105,158,100,0.16)");
    light.addColorStop(1, "rgba(105,158,100,0)");
    ctx.fillStyle = light; ctx.fillRect(0, 0, 128, 128);
    scene.textures.addCanvas(glow, canvas)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
  if (!scene.textures.exists(ray)) {
    const canvas = document.createElement("canvas");
    canvas.width = 192; canvas.height = 384;
    const ctx = canvas.getContext("2d")!;
    // A tapered, diagonal shaft with feathered ends; its entire footprint stays in the board.
    for (let y = 0; y < canvas.height; y++) {
      const p = y / canvas.height, x = 37 + p * 111, spread = 15 + p * 25;
      const alpha = Math.sin(p * Math.PI) * .48;
      const light = ctx.createLinearGradient(x - spread, 0, x + spread, 0);
      light.addColorStop(0, "rgba(220,237,162,0)");
      light.addColorStop(.5, `rgba(220,237,162,${alpha})`);
      light.addColorStop(1, "rgba(220,237,162,0)");
      ctx.fillStyle = light; ctx.fillRect(x - spread, y, spread * 2, 1);
    }
    scene.textures.addCanvas(ray, canvas)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
  if (!scene.textures.exists(leaf)) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(3, 6, 10, 4); ctx.fillRect(5, 4, 6, 8); ctx.fillRect(7, 3, 2, 10);
    ctx.fillStyle = "#78845c"; ctx.fillRect(7, 5, 1, 10);
    scene.textures.addCanvas(leaf, canvas)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  return { glow, ray, leaf };
}

/** Woodland depth, dappled sunlight and drifting leaves, all below the tile faces. */
export function forestBoardArt(scene: Phaser.Scene, cols: number, rows: number, tile: number) {
  const root = scene.add.container(0, 0);
  const textures = forestTextures(scene);
  let effects: Phaser.GameObjects.Container | null = null;
  let width = 0, height = 0, elapsed = 0;
  const lights: { image: Phaser.GameObjects.Image; x: number; y: number; phase: number; alpha: number }[] = [];
  const leaves: { image: Phaser.GameObjects.Image; phase: number; x: number; speed: number; size: number }[] = [];
  const motes: { image: Phaser.GameObjects.Arc; phase: number; x: number; y: number }[] = [];

  const resize = (columns: number, lines: number) => {
    effects?.destroy(); lights.length = 0; leaves.length = 0; motes.length = 0;
    width = columns * tile; height = lines * tile;
    effects = scene.add.container(0, 0); root.add(effects);
    const bed = scene.add.graphics(); effects.add(bed);
    bed.fillStyle(0x0b1915).fillRoundedRect(-4, -4, width + 8, height + 8, 8);
    bed.fillGradientStyle(0x315849, 0x1b3c32, 0x102620, 0x234635, 1)
      .fillRoundedRect(0, 0, width, height, 6);
    // Quiet patches of forest floor add depth between cells, without a second grid.
    for (let i = 0; i < columns * lines; i++) {
      const x = 18 + i * 137 % (width - 36), y = 14 + i * 97 % (height - 28);
      bed.fillStyle(i % 2 ? 0x466e48 : 0x081e19, .24)
        .fillEllipse(x, y, 25 + i % 4 * 13, 12 + i % 3 * 6);
    }

    // Light pools at different depths breathe independently, visible across the full board.
    for (let i = 0; i < 10; i++) {
      const w = width * (.24 + i % 3 * .09), h = tile * (1.5 + i % 4 * .35);
      const x = w / 2 + 20 + (width - w - 40) * ((i * .618034) % 1);
      const y = h / 2 + 16 + (height - h - 32) * ((i * .381966) % 1);
      const image = scene.add.image(x, y, textures.glow).setDisplaySize(w, h);
      effects.add(image); lights.push({ image, x, y, phase: i * 2.39996, alpha: .56 });
    }
    for (let i = 0; i < 3; i++) {
      const w = width * .3, h = height * .88;
      const x = width * (.22 + i * .28), y = height / 2;
      const image = scene.add.image(x, y, textures.ray).setDisplaySize(w, h);
      effects.add(image); lights.push({ image, x, y, phase: 1.4 + i * 2.1, alpha: .52 });
    }

    // A narrow sage bevel and broken moss lip anchor the board in the forest.
    const rim = scene.add.graphics(); effects.add(rim);
    rim.lineStyle(5, 0x3d634c).strokeRoundedRect(-2, -2, width + 4, height + 4, 7);
    rim.lineStyle(2, 0xa8c384, .8).strokeRoundedRect(-3, -3, width + 6, height + 6, 8);
    rim.lineStyle(1, 0x081b16, .9).strokeRoundedRect(2, 2, width - 4, height - 4, 5);
    for (let c = 0; c < columns; c++) {
      const x = c * tile + 12;
      rim.fillStyle(0x719153, .95).fillRoundedRect(x, -4, 24 + c % 3 * 9, 6, 2);
      rim.fillStyle(0xb3c982, .8).fillRect(x + 5, -4, 10 + c % 2 * 7, 2);
      rim.fillStyle(0x678546, .85).fillRoundedRect(x + 30, height - 2, 23 + c % 2 * 11, 5, 2);
    }
    for (let r = 0; r < lines; r++) {
      const y = r * tile + 24;
      rim.fillStyle(0x789c56, .9).fillRoundedRect(-3, y, 6, 16 + r % 3 * 5, 3);
      rim.fillStyle(0x789c56, .7).fillRoundedRect(width - 3, y + 28, 6, 18, 3);
    }
    // Small leaf clusters sit in the outer corners, never across a tile symbol.
    for (const [x, y, direction] of [[4, 4, 1], [width - 4, 4, -1], [4, height - 4, -1], [width - 4, height - 4, 1]]) {
      const ornament = scene.add.image(x, y, textures.leaf).setDisplaySize(20, 20)
        .setTint(0x9dbb70).setAngle(direction * 40);
      effects.add(ornament);
    }

    for (let i = 0; i < 10; i++) {
      const size = 13 + i % 3 * 3;
      const image = scene.add.image(0, 0, textures.leaf)
        .setTint([0xa8c56b, 0xd7ae60, 0x7da56d][i % 3]);
      effects.add(image);
      leaves.push({ image, size, phase: (i * .381966) % 1, x: (i * .618034) % 1, speed: 8 + i % 4 * 2 });
    }
    for (let i = 0; i < 12; i++) {
      const image = scene.add.circle(0, 0, i % 3 ? 1.2 : 1.8, 0xe0e7a0);
      effects.add(image);
      motes.push({ image, phase: i * 2.39996, x: (i * .618034) % 1, y: (i * .381966) % 1 });
    }
  };

  const update = (_time: number, delta: number) => {
    if (!root.visible) return;
    elapsed += Math.min(delta, 80) / 1000;
    for (const light of lights) {
      light.image.setPosition(light.x + Math.sin(elapsed * .13 + light.phase) * 15,
        light.y + Math.sin(elapsed * .09 + light.phase) * 10);
      light.image.setAlpha(light.alpha * (.8 + Math.sin(elapsed * .23 + light.phase) * .2));
    }
    for (const leaf of leaves) {
      const p = (leaf.phase + elapsed * leaf.speed / height) % 1;
      const x = 24 + ((leaf.x + elapsed * .008) % 1) * (width - 48);
      leaf.image.setPosition(x + Math.sin(elapsed * .8 + leaf.phase * 11) * 10, 18 + p * (height - 36));
      leaf.image.setDisplaySize(leaf.size * (.4 + Math.abs(Math.cos(elapsed * .9 + leaf.phase * 9)) * .6), leaf.size);
      leaf.image.setRotation(Math.sin(elapsed * .65 + leaf.phase * 7) * .7 + .5);
      leaf.image.setAlpha(Math.min(1, p * 10, (1 - p) * 10) * .8);
    }
    for (const mote of motes) {
      mote.image.setPosition(16 + mote.x * (width - 32) + Math.sin(elapsed * .3 + mote.phase) * 8,
        16 + ((mote.y + elapsed * .008) % 1) * (height - 32));
      mote.image.setAlpha(.12 + Math.pow((1 + Math.sin(elapsed * .7 + mote.phase)) / 2, 3) * .5);
    }
  };
  resize(cols, rows); update(0, 0);
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  root.once("destroy", () => scene.events.off(Phaser.Scenes.Events.UPDATE, update));
  return { root, resize };
}
