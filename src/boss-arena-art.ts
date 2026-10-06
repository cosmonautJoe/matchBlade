import Phaser from "phaser";

export type BossTheme = "plains" | "forest" | "snow" | "dungeon";
export type ArenaBounds = { x: number; y: number; w: number; h: number };

/** Shared stage framing; ornament stays at the edges, away from touch targets. */
export function bossArenaArt(scene: Phaser.Scene, R: ArenaBounds, theme: BossTheme, title: string, cue: string, progress = "", finale = false) {
  const snow = theme === "snow", forest = theme === "forest", plains = theme === "plains";
  const base = snow ? 0x112a3b : forest ? 0x182721 : plains ? 0x292820 : 0x20212d;
  const edge = snow ? 0x8bbaca : forest ? 0x829c69 : plains ? 0xc6a56d : 0x9985bc;
  const root = scene.add.container(R.x, R.y).setDepth(40);
  const g = scene.add.graphics(); root.add(g);
  g.fillStyle(base).fillRoundedRect(0, 0, R.w, R.h, 16);
  g.lineStyle(2, edge, .7).strokeRoundedRect(3, 3, R.w - 6, R.h - 6, 14);
  for (let i = 0; i < 35; i++) {
    const x = 20 + i * 113 % (R.w - 40), y = 112 + i * 73 % (R.h - 158);
    g.lineStyle(1, edge, .13);
    if (snow) g.strokePoints([{x:x-12,y:y+6},{x,y},{x:x+8,y:y+3},{x:x+16,y:y-9}]);
    else g.lineBetween(x, y, x + 14, y);
  }
  if (forest) for (const x of [16, R.w - 16]) {
    g.lineStyle(4, 0x4b6643, .7);
    g.strokePoints([{x,y:110},{x:x+8,y:R.h*.4},{x:x-6,y:R.h*.7},{x,y:R.h-40}]);
    for (let y = 122; y < R.h - 45; y += 36) {
      g.fillStyle(0x789258, .5).fillEllipse(x + (y % 3 ? 5 : -5), y, 16, 6);
    }
  }
  if (snow) for (let x = 22; x < R.w - 20; x += 53) {
    g.fillStyle(0x8ec4da, .25).fillTriangle(x, R.h - 6, x + 18, R.h - 6, x + 5, R.h - 28 - x % 29);
  }
  g.fillStyle(0x101a22, .92).fillRoundedRect(10, 10, R.w - 20, 86, 10);
  g.lineStyle(1, edge, .6).lineBetween(24, 96, R.w - 24, 96);
  const text = (x: number, y: number, value: string, size: number, color: string) => scene.add.text(x, y, value,
    { fontFamily: "system-ui, sans-serif", fontSize: `${size}px`, fontStyle: "bold", color });
  root.add(text(24, 16, title, 30, snow ? "#e3f8ff" : "#f5e3bf"));
  root.add(text(24, 58, cue, 23, "#c0d0cd"));
  const tally = text(R.w - 24, 20, progress, 26, snow ? "#a5e8ff" : "#edcc87").setOrigin(1, 0); root.add(tally);
  root.add(text(R.w / 2, R.h - 28, finale ? "FINAL STAND" : snow ? "FROST GUARDIAN" : "", 18, snow ? "#8cb5c9" : "#aaa992").setOrigin(.5, 0));
  for (let i = 0; i < 9; i++) {
    const mote = scene.add.rectangle(30 + i * 137 % (R.w - 60), 115 + i * 59 % (R.h - 165), snow ? 3 : 2, snow ? 3 : 2, snow ? 0xdcf5ff : 0xdfc479, .3);
    root.add(mote);
    const tween = scene.tweens.add({ targets: mote, x: mote.x + 12, y: mote.y + (snow ? 30 : -25), alpha: .05, duration: 2200 + i * 160, yoyo: true, repeat: -1 });
    mote.once("destroy", () => tween.stop());
  }
  return { root, tally };
}

export function frostCrystal(scene: Phaser.Scene, kind: "gold" | "blue" | "red") {
  const key = `frost-crystal-${kind}`;
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 });
  const color = kind === "gold" ? 0xeac876 : kind === "blue" ? 0x64bfd8 : 0xbd546b;
  const points = [{x:64,y:5},{x:113,y:36},{x:105,y:94},{x:64,y:122},{x:17,y:96},{x:10,y:36}];
  g.fillStyle(0x102533).fillPoints(points, true);
  g.lineStyle(4, 0xc3ecf5, .8).strokePoints(points, true);
  g.fillStyle(color, .95).fillTriangle(64, 14, 103, 39, 64, 104);
  g.fillStyle(color, .65).fillTriangle(64, 14, 20, 39, 64, 104);
  g.fillStyle(0xe0f8ff, .3).fillTriangle(20, 39, 27, 90, 64, 104);
  g.lineStyle(2, 0xe1f8ff, .7).strokePoints([{x:64,y:16},{x:59,y:54},{x:72,y:68},{x:64,y:102}]);
  if (kind === "red") { g.lineStyle(6, 0xffe2df); g.lineBetween(48, 47, 80, 79); g.lineBetween(80, 47, 48, 79); }
  g.generateTexture(key, 128, 128); g.destroy(); return key;
}
