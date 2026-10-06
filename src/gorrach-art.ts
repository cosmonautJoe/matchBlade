import Phaser from "phaser";

type ArenaRect = { x: number; y: number; w: number; h: number; cx: number; cy: number };

/** Deliberately simple pixel marks: worn iron, hide, grass and trampled earth. */
export function gorrachArena(scene: Phaser.Scene, R: ArenaRect, stage: number, title: string, subtitle: string, progress: string) {
  const root = scene.add.container(R.x, R.y).setDepth(40);
  const g = scene.add.graphics();
  g.fillStyle(0x101711).fillRoundedRect(0, 0, R.w, R.h, 14);
  g.fillStyle(0x292820).fillRoundedRect(5, 5, R.w - 10, R.h - 10, 10);
  g.lineStyle(2, 0x716348).strokeRoundedRect(4, 4, R.w - 8, R.h - 8, 11);
  // Deterministic dressing never consumes the gameplay random stream.
  for (let i = 0; i < 170; i++) {
    const x = 17 + (i * 137 % Math.floor(R.w - 34));
    const y = 102 + (i * 71 % Math.floor(R.h - 157));
    g.fillStyle(i % 3 ? 0x8b7652 : 0x141c15, i % 3 ? .12 : .3);
    g.fillRect(x, y, 3 + i % 7, 2);
  }
  for (let i = 0; i < 30; i++) {
    const x = i % 2 ? R.w - 17 : 12;
    const y = 112 + (i * 43 % Math.floor(R.h - 169));
    g.fillStyle(i % 3 ? 0x52613a : 0x77834a, .65);
    g.fillRect(x, y, 3, 9); g.fillRect(x - 4, y + 4, 3, 6);
  }
  g.fillStyle(0x171e22).fillRoundedRect(10, 10, R.w - 20, 82, 8);
  g.lineStyle(1, 0xd2af68, .35).lineBetween(23, 91, R.w - 23, 91);
  root.add(g);
  const text = (x: number, y: number, value: string, size: number, color: string) =>
    scene.add.text(x, y, value, { fontFamily: "system-ui, sans-serif", fontSize: `${size}px`, fontStyle: "bold", color });
  root.add(text(24, 16, title, 32, "#f7e7c8"));
  root.add(text(24, 55, subtitle, 25, "#c4c8b8"));
  const tally = text(R.w - 25, 23, progress, 28, "#f3ca7c").setOrigin(1, 0);
  root.add(tally);
  const names = ["CHARGE", "COUNTER", "LOCK HORNS"];
  names.forEach((name, i) => {
    const x = R.w * (i + .5) / 3;
    root.add(scene.add.rectangle(x, R.h - 43, R.w / 3 - 24, 3, i <= stage - 1 ? 0xcba669 : 0x4b4b3e));
    root.add(text(x, R.h - 32, name, 22, i === stage - 1 ? "#f4d49a" : "#8f9988").setOrigin(.5, 0));
  });
  return { root, tally };
}

/** Metal target plates replace the prototype's solid coloured circles. */
export function gorrachToken(scene: Phaser.Scene, kind: "gold" | "red" | "blue" | "hidden") {
  const key = `gorrach-plate-${kind}`;
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 });
  const colors = kind === "gold" ? [0x665029, 0xe3b659, 0xffedaf]
    : kind === "red" ? [0x59292c, 0xb34b46, 0xffb096]
    : kind === "blue" ? [0x254758, 0x529bac, 0xc0f2f3] : [0x2b3030, 0x505b58, 0x98a49a];
  g.fillStyle(0x080c0d, .55).fillRoundedRect(10, 15, 110, 108, 20);
  g.fillStyle(0x252a29).fillRoundedRect(7, 7, 114, 110, 18);
  g.lineStyle(4, 0x9a9078).strokeRoundedRect(7, 7, 114, 110, 18);
  g.fillStyle(colors[0]).fillRoundedRect(17, 17, 94, 90, 12);
  g.fillStyle(colors[1]).fillRoundedRect(22, 20, 84, 75, 8);
  g.lineStyle(3, colors[2], .8).lineBetween(27, 23, 101, 23);
  for (const x of [17, 111]) for (const y of [18, 105]) {
    g.fillStyle(0x0f1516).fillCircle(x, y + 2, 4);
    g.fillStyle(0xc5bda3).fillRect(x - 2, y - 2, 4, 4);
  }
  g.lineStyle(6, colors[2]);
  if (kind === "gold") g.strokePoints([{x:64,y:34},{x:82,y:59},{x:64,y:83},{x:46,y:59}], true);
  if (kind === "red") { g.lineBetween(46, 42, 82, 78); g.lineBetween(82, 42, 46, 78); }
  if (kind === "hidden") { g.lineStyle(3, colors[2], .6); g.strokeCircle(64, 60, 15); }
  g.generateTexture(key, 128, 128); g.destroy();
  return key;
}

/** Riveted housing; all active timing zones and hit checks remain separate. */
export function gorrachTimingFrame(scene: Phaser.Scene, x: number, y: number, w: number, h: number) {
  const g = scene.add.graphics().setDepth(41);
  g.fillStyle(0x080e10, .65).fillRoundedRect(x - w / 2 - 20, y - h / 2 - 14, w + 40, h + 36, 12);
  g.fillStyle(0x484537).fillRoundedRect(x - w / 2 - 16, y - h / 2 - 16, w + 32, h + 32, 9);
  g.lineStyle(2, 0xb79a64).strokeRoundedRect(x - w / 2 - 16, y - h / 2 - 16, w + 32, h + 32, 9);
  g.fillStyle(0x141c1d).fillRect(x - w / 2 - 3, y - h / 2 - 3, w + 6, h + 6);
  for (let i = 0; i <= 20; i++) {
    g.lineStyle(2, 0xd3bd87, i % 5 ? .2 : .5);
    g.lineBetween(x - w / 2 + i * w / 20, y + h / 2 + 6, x - w / 2 + i * w / 20, y + h / 2 + (i % 5 ? 9 : 12));
  }
  for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
    g.fillStyle(0xdbc397).fillCircle(x + dx * (w / 2 + 10), y + dy * (h / 2 + 9), 3);
  }
  return g;
}
