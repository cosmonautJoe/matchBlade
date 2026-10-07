import { findHint, type Coord } from "./board";

/** Board patches use stable cell ordinals so rotation cannot remove or respawn them. */
export interface ZoneFeatureState {
  marks: number[];
  iceHits: Record<number, number>;
  nextDepth: number;
  locks: number;
  caches: number;
  thawUntil: number;
}
export const ICE_TAP_HITS = 3;
export function restoreZoneFeatures(saved?: ZoneFeatureState): ZoneFeatureState {
  const integer = (n: unknown, fallback: number, max: number) =>
    typeof n === "number" && Number.isInteger(n) && n >= 0 ? Math.min(n, max) : fallback;
  const marks = Array.isArray(saved?.marks) ? [...new Set(saved.marks.filter(n => Number.isInteger(n) && n >= 0 && n < 49))].slice(0, 2) : [];
  return {
    marks,
    iceHits: Object.fromEntries(marks.map(i => [i, integer(saved?.iceHits?.[i], 0, ICE_TAP_HITS - 1)])),
    nextDepth: integer(saved?.nextDepth, 2, 100),
    locks: integer(saved?.locks, 0, 2),
    caches: integer(saved?.caches, 0, 3),
    thawUntil: integer(saved?.thawUntil, 0, 100),
  };
}
export const iceLocked = (biome: string, state: ZoneFeatureState, cols: number, cell: Coord) =>
  biome === "snow" && state.marks.includes(cell.r * cols + cell.c);

/** Chip the ice only: the underlying tile, resources and turn count are untouched. */
export function tapIce(biome: string, state: ZoneFeatureState, cols: number, cell: Coord) {
  if (!iceLocked(biome, state, cols, cell)) return null;
  const index = cell.r * cols + cell.c;
  const hits = (state.iceHits[index] ?? 0) + 1;
  const broken = hits >= ICE_TAP_HITS;
  if (broken) {
    state.marks = state.marks.filter(i => i !== index);
    delete state.iceHits[index];
  } else state.iceHits[index] = hits;
  return { hits, broken };
}

/** Two patches at most, five encounters apart. Leave a known legal swap open. */
export function seedZonePatches(biome: string, state: ZoneFeatureState, grid: number[][], depth: number) {
  if (biome !== "snow" || depth < state.nextDepth) return false;
  if (biome === "snow" && depth < state.thawUntil) return false;
  state.nextDepth = depth + 5;
  if (state.marks.length) return false;
  state.iceHits = {};
  const cols = grid[0].length, hint = findHint(grid);
  const safe = hint ? [hint.a.r * cols + hint.a.c, hint.b.r * cols + hint.b.c] : [];
  const cells = grid.flat().map((tile, i) => ({ tile, i }))
    .filter(({ tile, i }) => i < 49 && tile !== 7 && tile >= 0 && !safe.includes(i));
  // Depth determines placement; rotating or reloading never rolls another patch.
  for (let n = 0; n < 2 && cells.length; n++) {
    const at = (depth * 11 + n * 17) % cells.length;
    state.marks.push(cells.splice(at, 1)[0].i);
  }
  return state.marks.length > 0;
}

/** Return refusals before mutation so an unusable supply remains in its slot. */
export function useZoneSupply(id: string, biome: string, state: ZoneFeatureState, depth: number) {
  const result = { reason: "", wood: 0, gems: 0 };
  const expected = id === "thawflask" ? "snow" : id === "lockpick" ? "dungeon" : null;
  if (!expected || biome !== expected) return { ...result, reason: `Use this in the ${expected ?? "matching zone"}. Item kept.` };
  if (id === "thawflask") {
    if (state.thawUntil > depth) return { ...result, reason: "Thaw protection is already active. Item kept." };
    state.marks = [];
    state.iceHits = {};
    state.thawUntil = depth + 3;
  } else {
    if (state.caches >= 3) return { ...result, reason: "All bonus caches are open. Item kept." };
    state.locks = 0;
    state.caches++;
    result.gems = 3;
  }
  return result;
}

export function resolveZoneMatches(biome: string, state: ZoneFeatureState, cols: number, cells: Coord[], keyTiles: number) {
  const removed = state.marks.filter(i => cells.some(cell => {
    const distance = Math.abs(Math.floor(i / cols) - cell.r) + Math.abs(i % cols - cell.c);
    return biome === "snow" && distance <= 1;
  }));
  state.marks = state.marks.filter(i => !removed.includes(i));
  for (const i of removed) delete state.iceHits[i];
  let gems = 0;
  if (biome === "dungeon" && keyTiles >= 3 && state.caches < 3) {
    state.locks++;
    if (state.locks === 3) { state.locks = 0; state.caches++; gems = 3; }
  }
  return { removed, wood: 0, gems };
}

/** Ice must never force a free reroll or leave the player with no usable swap. */
export function thawIfStuck(biome: string, state: ZoneFeatureState, grid: number[][]) {
  if (biome !== "snow" || !state.marks.length) return false;
  if (findHint(grid, cell => iceLocked(biome, state, grid[0].length, cell))) return false;
  state.marks = [];
  state.iceHits = {};
  return true;
}

/** Preserve ice count on rotation; relocate a blocking patch instead of melting it. */
export function reflowIce(biome: string, state: ZoneFeatureState, grid: number[][]) {
  if (biome !== "snow" || !state.marks.length) return;
  const cols = grid[0].length;
  if (findHint(grid, cell => iceLocked(biome, state, cols, cell))) return;
  const hint = findHint(grid);
  if (!hint) return;
  const safe = [hint.a.r * cols + hint.a.c, hint.b.r * cols + hint.b.c];
  const used = state.marks.filter(i => !safe.includes(i));
  const hits = Object.fromEntries(used.map(i => [i, state.iceHits[i] ?? 0]));
  for (const i of state.marks) {
    if (!safe.includes(i)) continue;
    const next = grid.flat().findIndex((tile, j) => j < 49 && tile !== 7 && !safe.includes(j) && !used.includes(j));
    if (next >= 0) { used.push(next); hits[next] = state.iceHits[i] ?? 0; }
  }
  state.marks = used;
  state.iceHits = hits;
}
