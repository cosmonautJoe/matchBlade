import Phaser from "phaser";
import { openCampPanel } from "./camp-ui";
import { loadMeta, roadOpen, nextBiome, advanceBiome, questDone, questById, currentQuests, BIOME_LABELS } from "./meta";
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
  const completed=currentQuests(meta).filter(aq=>questDone(meta,aq)).map(aq=>questById(aq.id)!);
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
        `🪵 ${result.wood} wood`, `🪨 ${result.ore} stone`, `💎 ${result.treasure} gems`,
      ] },
      ...(completed.length ? [{title:`✓ ${completed.length} quest${completed.length===1?"":"s"} complete`,lines:[
        `${completed.reduce((sum,q)=>sum+q.reward,0)} gems will be collected automatically at camp.`,
      ]}] : []),
      nextUpgrade(meta),
    ],
    footer: unlocked ? `${BIOME_LABELS[nextBiome(meta)!]} is open. You can revisit earlier roads from camp.` : outcome.tip,
    actions: [
      ...(unlocked ? [{ label: `Travel to ${BIOME_LABELS[nextBiome(meta)!]} →`, run: () => { advanceBiome(loadMeta()); leave(); } }] : []),
      { label: "Back to camp →", secondary: unlocked, run: leave },
    ],
    onClose: leave,
  });
}
