import type { RunState } from "./run";
import type { MetaState } from "./meta";
import type { ChestPull } from "./items";
import type { BoardLayouts } from "./board";

export interface RunCheckpoint {
  version: 1;
  savedAt: number;
  run: RunState;
  grid: number[][];
  boardLayouts?: BoardLayouts;
  items: (string | null)[];
  chestsOpened: number;
  sinceChest: number;
  bestCascade: number;
  rainy: boolean;
  arenaWard: number;
  pendingChest: ChestPull[] | null;
  awaitingChest?: boolean; // closed chest reached; no key spent or loot rolled yet
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
  const restored = structuredClone(c);
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
