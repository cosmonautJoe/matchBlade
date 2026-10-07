import type { RunState } from "./run";
import type { MetaState } from "./meta";
import type { ChestPull } from "./items";
import type { BoardLayouts } from "./board";
import { restoreEmpowered } from "./empowered";
import { companionById, cleanCompanions } from "./companions";
import { newRoadFork, restoreRoadFork } from "./road-fork";
import { restoreSlimeProgress, type SlimeProgress } from "./slime-boss";

export interface RunCheckpoint {
  version: 1;
  savedAt: number;
  run: RunState;
  grid: number[][];
  boardLayouts?: BoardLayouts;
  empowered?: import("./empowered").EmpoweredState;
  rescue?: import("./companions").RescueState;
  items: (string | null)[];
  chestsOpened: number;
  sinceChest: number;
  bestCascade: number;
  rainy: boolean;
  arenaWard: number;
  slimeBoss?: SlimeProgress;
  pendingChest: ChestPull[] | null;
  awaitingChest?: boolean; // closed chest reached; no key spent or loot rolled yet
  buffs: {
    freezeLeft: number; hornLeft: number; ledgerLeft: number; burnLeft: number; burnAcc: number;
    skeletonCharges: number; panCharges: number; spursActive: boolean; bossChestNext: boolean;
  };
}

/** Ignore incompatible / incomplete checkpoints rather than boot into a broken board. */
export function readCheckpoint(meta: MetaState): RunCheckpoint | null {
  const c = meta.activeRun;
  if (!c || c.version !== 1 || !c.run || c.run.over || c.run.biome !== meta.biome || !c.buffs) return null;
  if (!Array.isArray(c.grid) || !c.grid.every(row => Array.isArray(row))) return null;
  const rows = c.grid.length, cols = c.grid[0]?.length;
  if (!((rows === 7 && cols === 7) || (rows === 5 && cols === 10))) return null;
  if (!c.grid.every(row => row.length === cols && row.every(t => Number.isInteger(t) && t >= 0 && t < 8))) return null;
  if (!Array.isArray(c.items) || c.items.length !== 6 || !Number.isFinite(c.run.pressure)) return null;
  if (!c.items.every(id => id === null || typeof id === "string")) return null;
  if (c.pendingChest !== null && (!Array.isArray(c.pendingChest) || c.pendingChest.some(p => !p || !Number.isFinite(p.n)))) return null;
  const restored = structuredClone(c);
  // Remove retired Scout Maps without discarding the rest of an interrupted run.
  restored.items = restored.items.map(id => id === "ink" ? null : id);
  if (restored.pendingChest) restored.pendingChest = restored.pendingChest.filter(p => p.kind !== "item" || p.item?.id !== "ink");
  delete (restored.buffs as RunCheckpoint["buffs"] & { inkActive?: boolean }).inkActive;
  restored.run.companions = cleanCompanions(restored.run.companions);
  restored.run.roadFork = restoreRoadFork(restored.run.roadFork, restored.run.killed);
  // Forest ambushes replace supply forks and tile roots, including mid-run saves.
  if (restored.run.biome === "forest") {
    restored.run.roadFork = newRoadFork();
    if (restored.run.zone) restored.run.zone.marks = [];
    if (restored.run.enemy) delete restored.run.enemy.spores;
    if (restored.run.enemy?.kind === "boss")
      restored.slimeBoss = restoreSlimeProgress(restored.slimeBoss, restored.arenaWard);
  }
  if (restored.run.biome !== "forest" || restored.run.enemy?.kind !== "boss") delete restored.slimeBoss;
  restored.empowered = restoreEmpowered(restored.empowered, restored.grid);
  const rescue = restored.rescue;
  if (rescue && (!Number.isFinite(rescue.rolledDepth) || typeof rescue.encountered !== "boolean" ||
      (rescue.pending !== null && !companionById(rescue.pending)))) delete restored.rescue;
  const layouts = restored.boardLayouts;
  if (layouts) {
    const valid = (g: number[][] | undefined, rows: number, cols: number) => g === undefined ||
      (Array.isArray(g) && g.length === rows && g.every(row => Array.isArray(row) && row.length === cols &&
        row.every(t => Number.isInteger(t) && t >= 0 && t < 8)));
    if (!valid(layouts.portrait, 7, 7) || !valid(layouts.landscape, 5, 10) ||
        (layouts.reserve !== undefined && (!Number.isInteger(layouts.reserve) || layouts.reserve < 0 || layouts.reserve >= 8)))
      delete restored.boardLayouts;
  }
  return restored;
}
