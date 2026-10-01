import Phaser from "phaser";
import { openCampPanel } from "./camp-ui";
import { loadMeta, roadOpen, nextBiome, advanceBiome } from "./meta";
import { endOfRunCopy, nextUpgrade } from "./run-advice";
import type { RunState } from "./run";

export interface RunResult {
  won: boolean;
  depth: number;
  score: number;
  cascade: number;
  wood: number;
  ore: number;
  treasure: number;
  record: boolean;
  reason?: RunState["endReason"];
}

/** Rewards have already been banked by the caller. Text never scales with the board. */
export function showResults(scene: Phaser.Scene, result: RunResult) {
  const meta = loadMeta();
  const outcome = endOfRunCopy(result.reason, result.won);
  const unlocked = roadOpen(meta);
  let leaving = false;
  const leave = () => {
    if (leaving) return;
    leaving = true;
    close();
    scene.scene.start("camp");
  };
  const close = openCampPanel(scene, {
    title: result.won ? "Road complete!" : "Run ended",
    subtitle: result.won ? (result.record ? "New personal best!" : "Both bosses defeated. Your resources are saved.") : outcome.title,
    kind: "upgrade",
    cards: [
      { title: "This run", lines: [
        `Depth ${result.depth}/20 · Score ${result.score.toLocaleString()}`,
        `Best cascade ×${Math.max(1, result.cascade)}`,
      ] },
      { title: "Added to camp", lines: [
        `🪵 ${result.wood} wood`, `🪨 ${result.ore} ore`, `💎 ${result.treasure} gems`,
      ] },
      nextUpgrade(meta),
    ],
    footer: unlocked ? `Next area unlocked: ${nextBiome(meta)}. Travel when you're ready; quests are optional.` : outcome.tip,
    actions: [
      ...(unlocked ? [{ label: `Travel to ${nextBiome(meta)} →`, run: () => { advanceBiome(loadMeta()); leave(); } }] : []),
      { label: "Back to camp →", secondary: unlocked, run: leave },
    ],
    onClose: leave,
  });
}
