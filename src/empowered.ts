import type { Coord, Match } from "./board";

export type Charge = { id: number; type: number; cell: Coord | null; multiplier?: 2 | 3; random?: boolean };
export type PowerBonus = { type: number; count: number; multiplier?: 2 | 3 };
export type EmpoweredState = {
  charges: Charge[]; nextId: number; moves: number; nextAt: number;
  layouts: Record<string, { signature: string; charges: Charge[] }>;
};
export const newEmpowered = (): EmpoweredState => ({ charges: [], nextId: 1, layouts: {}, moves: 0, nextAt: 2 });
const key = (c: Coord) => `${c.r},${c.c}`;
const clone = (charges: Charge[]) => charges.map(c => ({ ...c, cell: c.cell && { ...c.cell } }));

/** Crosses count as one connected match; separate groups never share a bonus. */
function groups(matches: Match[]) {
  const groups: { type: number; cells: Coord[] }[] = [];
  for (const match of matches) {
    const joined = groups.filter(g => g.type === match.type && g.cells.some(c => match.cells.some(m => key(c) === key(m))));
    const cells = new Map([...match.cells, ...joined.flatMap(g => g.cells)].map(c => [key(c), c]));
    for (const g of joined) groups.splice(groups.indexOf(g), 1);
    groups.push({ type: match.type, cells: [...cells.values()] });
  }
  return groups;
}

export function empoweredMatch(matches: Match[], cell: Coord | null): PowerBonus | undefined {
  const group = cell && groups(matches).find(g => g.cells.some(c => key(c) === key(cell)));
  return group ? { type: group.type, count: group.cells.length } : undefined;
}

/** Only a player's swap earns a new tile. Cascades/items can spend existing power. */
export function planEmpowered(matches: Match[], state: EmpoweredState, swapped: Coord[] = []) {
  const consume: number[] = [], bonus: PowerBonus[] = [], create: { type: number; cell: Coord; cells: Coord[]; multiplier: 2 | 3 }[] = [];
  for (const group of groups(matches)) {
    const charged = state.charges.filter(p => p.cell && group.cells.some(c => key(c) === key(p.cell!)));
    if (charged.length) {
      consume.push(...charged.map(c => c.id));
      bonus.push({ type: group.type, count: group.cells.length, multiplier: charged.some(c => c.multiplier === 3) ? 3 : 2 });
      continue; // The strongest charge wins; powers don't multiply each other.
    }
    const cell = swapped.find(s => group.cells.some(c => key(c) === key(s)));
    if (cell && group.cells.length >= 4 && group.type >= 0 && group.type < 7)
      create.push({ type: group.type, cell: { ...cell }, cells: group.cells, multiplier: group.cells.length >= 5 ? 3 : 2 });
  }
  return { consume, bonus, create };
}

/** Surprise power keeps its original cadence, alongside player-earned charges. */
export function randomEmpower(state: EmpoweredState, grid: number[][],
  blocked: (cell: Coord) => boolean = () => false, rand: () => number = Math.random): Charge | undefined {
  if (state.moves < state.nextAt || state.charges.some(c => c.random)) return;
  const occupied = new Set(state.charges.filter(c => c.cell).map(c => key(c.cell!)));
  const choices = grid.flatMap((row,r) => row.flatMap((type,c) =>
    type >= 0 && type <= 2 && !occupied.has(key({r,c})) && !blocked({r,c}) ? [{r,c}] : []));
  if (!choices.length) return;
  const cell = choices[Math.min(choices.length - 1, Math.floor(rand() * choices.length))];
  const charge: Charge = { id: state.nextId++, type: grid[cell.r][cell.c], cell, multiplier: 2, random: true };
  state.charges.push(charge); state.layouts = {};
  return charge;
}

/** Item clears honor the strongest charge of each collected tile type. */
export function itemPowerBonuses(charges: Charge[], counts: Record<number, number>): PowerBonus[] {
  return [...new Set(charges.map(p => p.type))].map(type => ({ type, count: counts[type] ?? 0,
    multiplier: charges.some(p => p.type === type && p.multiplier === 3) ? 3 : 2 }));
}

/** Upgrade old single-charge checkpoints without changing their board or rewards. */
export function restoreEmpowered(value: unknown, grid: number[][]): EmpoweredState {
  if (!value || typeof value !== "object") return newEmpowered();
  const raw = value as Partial<EmpoweredState> & { type?: number; cell?: Coord | null };
  const valid = (charges: unknown, board: number[][]): charges is Charge[] => Array.isArray(charges) &&
    charges.length <= 50 && new Set(charges.map(p => p?.id)).size === charges.length &&
    new Set(charges.filter(p => p?.cell).map(p => key(p.cell))).size === charges.filter(p => p?.cell).length &&
    charges.every(p => p && Number.isInteger(p.id) && p.id > 0 && Number.isInteger(p.type) && p.type >= 0 && p.type < 7 &&
      (p.multiplier === undefined || p.multiplier === 2 || p.multiplier === 3) && (p.random === undefined || typeof p.random === "boolean") &&
      (p.cell === null || (Number.isInteger(p.cell?.r) && Number.isInteger(p.cell?.c) && board[p.cell.r]?.[p.cell.c] === p.type)));
  const charges = raw.charges ?? (raw.type !== undefined && raw.type >= 0 && raw.cell ? [{ id: 1, type: raw.type, cell: raw.cell, random: true }] : []);
  if (!valid(charges, grid)) return newEmpowered();
  const moves = Number.isInteger(raw.moves) && raw.moves! >= 0 ? raw.moves! : 0;
  const nextAt = Number.isInteger(raw.nextAt) && raw.nextAt! >= 0 ? raw.nextAt! : moves + 2;
  const state: EmpoweredState = { charges: clone(charges), nextId: Math.max(0, ...charges.map(c => c.id)) + 1, layouts: {}, moves, nextAt };
  for (const [width, layout] of Object.entries(raw.layouts ?? {})) {
    try {
      const board = JSON.parse(layout.signature);
      if ((width === "7" || width === "10") && Array.isArray(board) && board.every(Array.isArray) && valid(layout.charges, board) &&
          layout.charges.length === charges.length && layout.charges.every(c => charges.some(p => p.id === c.id && p.type === c.type &&
            (p.multiplier ?? 2) === (c.multiplier ?? 2) && !!p.random === !!c.random)))
        state.layouts[width] = { signature: layout.signature, charges: clone(layout.charges) };
    } catch { /* A bad layout cache must not discard the live charge. */ }
  }
  return state;
}

/** Match tiles by type ordinal; cached layouts restore the exact earned positions. */
export function reflowEmpowered(state: EmpoweredState, before: number[][], after: number[][]) {
  if (!state.charges.length) return;
  const from = String(before[0].length), to = String(after[0].length);
  if (state.layouts[from]?.signature !== JSON.stringify(before)) state.layouts = {};
  state.layouts[from] = { signature: JSON.stringify(before), charges: clone(state.charges) };
  const cached = state.layouts[to];
  if (cached?.signature === JSON.stringify(after)) state.charges = clone(cached.charges);
  else {
    const used = new Set<string>();
    // Visible charges first; a reserve tile can carry a charge off-board.
    for (const charge of [...state.charges].sort((a,b) => Number(!a.cell) - Number(!b.cell))) {
      const old = before.flatMap((row,r) => row.flatMap((t,c) => t === charge.type ? [{r,c}] : []));
      const next = after.flatMap((row,r) => row.flatMap((t,c) => t === charge.type ? [{r,c}] : []));
      const ordinal = charge.cell ? old.findIndex(c => key(c) === key(charge.cell!)) : next.length - 1;
      const preferred = next[Math.min(Math.max(0, ordinal), next.length - 1)];
      charge.cell = preferred && !used.has(key(preferred)) ? preferred : next.find(c => !used.has(key(c))) ?? null;
      if (charge.cell) used.add(key(charge.cell));
    }
    state.layouts[to] = { signature: JSON.stringify(after), charges: clone(state.charges) };
  }
}
