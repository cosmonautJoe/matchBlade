import type { Coord, Match } from "./board";

export type EmpoweredState = {
  moves: number; nextAt: number; type: number; cell: Coord | null;
  layouts: Record<string, { signature: string; cell: Coord | null }>;
};
export const newEmpowered = (): EmpoweredState => ({ moves: 0, nextAt: 2, type: -1, cell: null, layouts: {} });
const key = (c: Coord) => `${c.r},${c.c}`;

/** Only the connected match containing the charged tile receives the bonus. */
export function empoweredMatch(matches: Match[], cell: Coord | null): { type: number; count: number } | undefined {
  if (!cell) return;
  const first = matches.find(m => m.cells.some(c => key(c) === key(cell)));
  if (!first || first.type > 2) return;
  const cells = new Set(first.cells.map(key));
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of matches) if (m.type === first.type && m.cells.some(c => cells.has(key(c))))
      for (const c of m.cells) if (!cells.has(key(c))) { cells.add(key(c)); changed = true; }
  }
  return { type: first.type, count: cells.size };
}

/** Cache both positions with the board layouts so rotating back never rerolls power. */
export function reflowEmpowered(state: EmpoweredState, before: number[][], after: number[][]) {
  if (state.type < 0) return;
  const from = String(before[0].length), to = String(after[0].length);
  if (state.layouts[from]?.signature !== JSON.stringify(before)) state.layouts = {};
  state.layouts[from] = { signature: JSON.stringify(before), cell: state.cell && { ...state.cell } };
  const cached = state.layouts[to];
  if (cached?.signature === JSON.stringify(after)) state.cell = cached.cell && { ...cached.cell };
  else {
    const old = before.flatMap((row,r) => row.flatMap((t,c) => t === state.type ? [{r,c}] : []));
    const next = after.flatMap((row,r) => row.flatMap((t,c) => t === state.type ? [{r,c}] : []));
    const ordinal = state.cell ? Math.max(0, old.findIndex(c => key(c) === key(state.cell!))) : 0;
    state.cell = next.length ? next[Math.min(ordinal, next.length - 1)] : null;
    state.layouts[to] = { signature: JSON.stringify(after), cell: state.cell && { ...state.cell } };
  }
}
