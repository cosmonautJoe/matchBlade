import type { RunState } from "./run";
import type { MetaState } from "./meta";
import type { ChestPull } from "./items";

export interface RunCheckpoint {
  version: 1;
  savedAt: number;
  run: RunState;
  grid: number[][];
  items: (string | null)[];
  chestsOpened: number;
  sinceChest: number;
  bestCascade: number;
  rainy: boolean;
  arenaWard: number;
  pendingChest: ChestPull[] | null;
  buffs: {
    freezeLeft: number; hornLeft: number; ledgerLeft: number; burnLeft: number; burnAcc: number;
    skeletonCharges: number; panCharges: number; spursActive: boolean; inkActive: boolean; bossChestNext: boolean;
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
  return structuredClone(c);
}
