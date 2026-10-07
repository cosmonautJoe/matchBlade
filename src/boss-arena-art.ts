import Phaser from "phaser";
import { frostArenaArt } from "./frost-art";
export { frostCrystal } from "./frost-art";

export type BossTheme = "plains" | "forest" | "snow" | "dungeon";
export type ArenaBounds = { x: number; y: number; w: number; h: number };

/** Shared stage framing; ornament stays at the edges, away from touch targets. */
export function bossArenaArt(scene: Phaser.Scene, R: ArenaBounds, theme: BossTheme, title: string, cue: string, progress = "", finale = false) {
  if (theme === "snow") return frostArenaArt(scene, R, title, cue, progress, finale);
  const forest = theme === "forest", plains = theme === "plains";
  const base = forest ? 0x182721 : plains ? 0x292820 : 0x20212d;
  const edge = forest ? 0x829c69 : plains ? 0xc6a56d : 0x9985bc;
  const root = scene.add.container(R.x, R.y).setDepth(40);
  const g = scene.add.graphics(); root.add(g);
  g.fillStyle(base).fillRoundedRect(0, 0, R.w, R.h, 16);
  g.lineStyle(2, edge, .7).strokeRoundedRect(3, 3, R.w - 6, R.h - 6, 14);
  for (let i = 0; i < 35; i++) {
    const x = 20 + i * 113 % (R.w - 40), y = 112 + i * 73 % (R.h - 158);
    g.lineStyle(1, edge, .13);
    g.lineBetween(x, y, x + 14, y);
  }
  if (forest) for (const x of [16, R.w - 16]) {
    g.lineStyle(4, 0x4b6643, .7);
    g.strokePoints([{x,y:110},{x:x+8,y:R.h*.4},{x:x-6,y:R.h*.7},{x,y:R.h-40}]);
    for (let y = 122; y < R.h - 45; y += 36) {
      g.fillStyle(0x789258, .5).fillEllipse(x + (y % 3 ? 5 : -5), y, 16, 6);
    }
  }
  g.fillStyle(0x101a22, .92).fillRoundedRect(10, 10, R.w - 20, 86, 10);
  g.lineStyle(1, edge, .6).lineBetween(24, 96, R.w - 24, 96);
  const text = (x: number, y: number, value: string, size: number, color: string) => scene.add.text(x, y, value,
    { fontFamily: "system-ui, sans-serif", fontSize: `${size}px`, fontStyle: "bold", color });
  root.add(text(24, 16, title, 30, "#f5e3bf"));
  root.add(text(24, 58, cue, 23, "#c0d0cd"));
  const tally = text(R.w - 24, 20, progress, 26, "#edcc87").setOrigin(1, 0); root.add(tally);
  root.add(text(R.w / 2, R.h - 28, finale ? "FINAL STAND" : "", 18, "#aaa992").setOrigin(.5, 0));
  for (let i = 0; i < 9; i++) {
    const mote = scene.add.rectangle(30 + i * 137 % (R.w - 60), 115 + i * 59 % (R.h - 165), 2, 2, 0xdfc479, .3);
    root.add(mote);
    const tween = scene.tweens.add({ targets: mote, x: mote.x + 12, y: mote.y - 25, alpha: .05, duration: 2200 + i * 160, yoyo: true, repeat: -1 });
    mote.once("destroy", () => tween.stop());
  }
  return { root, tally };
}
