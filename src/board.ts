/**
 * Pure match-3 grid logic — no rendering, no framework. Operates on a
 * number[][] where each cell holds a tile-type id (0..TYPES-1) or EMPTY.
 *
 * Carried over from the Stellar Shards prototype. The match-finding and
 * initial-fill logic is engine-agnostic and reused as-is here.
 *
 * NOTE: matchBlade's INPUT differs from classic match-3 — instead of swapping
 * two adjacent tiles, the player SLIDES a whole row or column (with tiles
 * wrapping around off the edge). That slide logic lives in the game layer, not
 * here. This module only answers "what matches exist in a given grid?".
 */

export const W = 8; // columns
export const H = 7; // rows  (dungeon-runner board is ~8 wide x 7 tall)

// Tile types: sword, staff, shield, key, treasure, wood, ore  (see DESIGN.md)
export const TYPES = 7;
export const EMPTY = -1;

export interface Coord { c: number; r: number; }
export interface Match { cells: Coord[]; type: number; len: number; dir: "h" | "v"; }

/** Build a full grid with no pre-existing matches (so play starts stable). */
export function makeInitialGrid(rand: () => number = Math.random): number[][] {
  const g: number[][] = Array.from({ length: H }, () => Array<number>(W).fill(EMPTY));
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      let t: number;
      do {
        t = Math.floor(rand() * TYPES);
      } while (
        (c >= 2 && g[r][c - 1] === t && g[r][c - 2] === t) ||
        (r >= 2 && g[r - 1][c] === t && g[r - 2][c] === t)
      );
      g[r][c] = t;
    }
  }
  return g;
}

/** Find every horizontal/vertical run of 3+ same-type tiles. */
export function findMatches(g: number[][]): Match[] {
  const out: Match[] = [];

  // horizontal
  for (let r = 0; r < H; r++) {
    let start = 0;
    for (let c = 1; c <= W; c++) {
      const cont = c < W && g[r][c] !== EMPTY && g[r][c] === g[r][start];
      if (cont) continue;
      const len = c - start;
      const type = g[r][start];
      if (len >= 3 && type !== EMPTY) {
        const cells: Coord[] = [];
        for (let k = start; k < c; k++) cells.push({ c: k, r });
        out.push({ cells, type, len, dir: "h" });
      }
      start = c;
    }
  }

  // vertical
  for (let c = 0; c < W; c++) {
    let start = 0;
    for (let r = 1; r <= H; r++) {
      const cont = r < H && g[r][c] !== EMPTY && g[r][c] === g[start][c];
      if (cont) continue;
      const len = r - start;
      const type = g[start][c];
      if (len >= 3 && type !== EMPTY) {
        const cells: Coord[] = [];
        for (let k = start; k < r; k++) cells.push({ c, r: k });
        out.push({ cells, type, len, dir: "v" });
      }
      start = r;
    }
  }

  return out;
}

/** Slide a row left/right (dir -1/+1) by one, wrapping around. Mutates g. */
export function slideRow(g: number[][], r: number, dir: 1 | -1) {
  const row = g[r];
  if (dir === 1) row.unshift(row.pop()!);
  else row.push(row.shift()!);
}

/** Slide a column up/down (dir -1/+1) by one, wrapping around. Mutates g. */
export function slideCol(g: number[][], c: number, dir: 1 | -1) {
  const col = g.map((row) => row[c]);
  if (dir === 1) col.unshift(col.pop()!);
  else col.push(col.shift()!);
  for (let r = 0; r < H; r++) g[r][c] = col[r];
}
