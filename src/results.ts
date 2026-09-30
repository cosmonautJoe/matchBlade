import Phaser from "phaser";
import { openCampPanel } from "./camp-ui";

export interface RunResult {
  won: boolean;
  depth: number;
  score: number;
  cascade: number;
  wood: number;
  ore: number;
  treasure: number;
  record: boolean;
}

/** Rewards have already been banked by the caller. Text never scales with the board. */
export function showResults(scene: Phaser.Scene, result: RunResult) {
  let leaving = false;
  const leave = () => {
    if (leaving) return;
    leaving = true;
    close();
    scene.scene.start("camp");
  };
  const close = openCampPanel(scene, {
    title: result.won ? "Road complete!" : "Run complete",
    subtitle: result.record ? "New personal best!" : "Your resources are saved.",
    kind: "upgrade",
    cards: [
      { title: "This run", lines: [
        `Depth ${result.depth}/20 · Score ${result.score.toLocaleString()}`,
        `Best cascade ×${Math.max(1, result.cascade)}`,
      ] },
      { title: "Added to camp", lines: [
        `🪵 ${result.wood} wood`, `🪨 ${result.ore} ore`, `💎 ${result.treasure} gems`,
      ] },
    ],
    actions: [{ label: "Back to camp →", run: leave }],
    onClose: leave,
  });
}
