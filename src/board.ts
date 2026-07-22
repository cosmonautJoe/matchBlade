/**
 * Pure match-3 grid logic — no rendering, no framework. Operates on a
 * number[][] where each cell holds a tile-type id (0..TYPES-1) or EMPTY.
 *
 * Carried over from the Stellar Shards prototype. The match-finding and
 * initial-fill logic is engine-agnostic and reused as-is here.
 *
 * INPUT is classic swap match-3 (Candy Crush / Bejeweled): the player drags a
 * tile onto an orthogonally-adjacent neighbour to swap them, and the swap only
 * "sticks" if it produces a match. `swap` / `swapMakesMatch` support that; the
 * animated version lives in the game layer. This module stays pure logic.
 */

export const W = 10; // columns
export const H = 5; // rows  (landscape dungeon-runner board is 10 wide x 5 tall)

// Tile types: sword, staff, shield, key, treasure, wood, ore, potion (see DESIGN.md)
export const TYPES = 8;
export const EMPTY = -1;

// Spawn weights per tile id (sword, staff, shield, key, treasure, wood, ore, potion).
// The board favours fighting: sword drops twice as often as a baseline tile and
// raw resources (wood/ore) half as often, so matches lean toward damage over
// stockpiling. The potion is a RARE gift (~1 in 43 spawns — usually 0-2 on a
// full board): tapped, not matched. Tweak these to retune the economy.
export const SPAWN_WEIGHTS = [12, 6, 6, 6, 6, 3, 3, 1];
const WEIGHT_SUM = SPAWN_WEIGHTS.reduce((a, b) => a + b, 0);

/** Pick a tile id weighted by SPAWN_WEIGHTS (not a uniform 1/TYPES draw). */
export function randomType(rand: () => number = Math.random): number {
  let x = rand() * WEIGHT_SUM;
  for (let t = 0; t < TYPES; t++) {
    x -= SPAWN_WEIGHTS[t];
    if (x < 0) return t;
  }
  return TYPES - 1;
}

export interface Coord { c: number; r: number; }
export interface Match { cells: Coord[]; type: number; len: number; dir: "h" | "v"; }

/** Build a full grid with no pre-existing matches (so play starts stable). */
export function makeInitialGrid(rand: () => number = Math.random): number[][] {
  const g: number[][] = Array.from({ length: H }, () => Array<number>(W).fill(EMPTY));
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      let t: number;
      do {
        t = randomType(rand);
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

/** Swap two cells in place. Mutates g. */
export function swap(g: number[][], a: Coord, b: Coord) {
  const t = g[a.r][a.c];
  g[a.r][a.c] = g[b.r][b.c];
  g[b.r][b.c] = t;
}

/** True if swapping a<->b would create at least one match. Non-mutating. */
export function swapMakesMatch(g: number[][], a: Coord, b: Coord): boolean {
  swap(g, a, b);
  const ok = findMatches(g).length > 0;
  swap(g, a, b); // restore
  return ok;
}

/** True if any single adjacent swap on the board would create a match. */
export function hasPossibleMove(g: number[][]): boolean {
  return findHint(g) !== null;
}

/** The first adjacent swap that would create a match — the pair the Hint button lights up. */
export function findHint(g: number[][]): { a: Coord; b: Coord } | null {
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (c + 1 < W && swapMakesMatch(g, { r, c }, { r, c: c + 1 })) return { a: { r, c }, b: { r, c: c + 1 } };
      if (r + 1 < H && swapMakesMatch(g, { r, c }, { r: r + 1, c })) return { a: { r, c }, b: { r: r + 1, c } };
    }
  }
  return null;
}

/**
 * Pure gravity + refill: collapse surviving tiles down each column, then fill
 * the vacated top cells with fresh random tiles. Mutates g. (The game layer has
 * an animated equivalent; this headless version is handy for logic/tests.)
 */
export function collapseAndRefill(g: number[][], rand: () => number = Math.random) {
  for (let c = 0; c < W; c++) {
    const survivors: number[] = [];
    for (let r = 0; r < H; r++) if (g[r][c] !== EMPTY) survivors.push(g[r][c]);
    const missing = H - survivors.length;
    for (let r = 0; r < missing; r++) g[r][c] = randomType(rand);
    for (let r = missing; r < H; r++) g[r][c] = survivors[r - missing];
  }
}
