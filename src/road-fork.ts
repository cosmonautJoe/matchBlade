/** A small supply detour. Choice and payouts live in the run checkpoint. */
export type RoadChoice = "wood" | "ore";
export interface RoadForkState {
  pending: boolean;
  choice: RoadChoice | null;
  startDepth: number;
  paidThrough: number;
}
export const ROAD_FORK_FIRST = 5;
export const ROAD_FORK_LAST = 6;
export const ROAD_FORK_ENEMIES = 3;
export const ROAD_FORK_BONUS = 3;
export const newRoadFork = (): RoadForkState => ({ pending: false, choice: null, startDepth: 0, paidThrough: 0 });

export function restoreRoadFork(saved: RoadForkState | undefined, depth: number): RoadForkState {
  if (!saved || !Number.isInteger(depth) || depth < 0) return newRoadFork();
  if (saved.choice === null && !saved.pending) return newRoadFork();
  if (typeof saved.pending !== "boolean" || ![null, "wood", "ore"].includes(saved.choice) ||
    !Number.isInteger(saved.startDepth) || saved.startDepth < ROAD_FORK_FIRST || saved.startDepth > ROAD_FORK_LAST ||
    saved.startDepth > depth || !Number.isInteger(saved.paidThrough) || saved.paidThrough < saved.startDepth ||
    saved.paidThrough > Math.min(depth, saved.startDepth + ROAD_FORK_ENEMIES) ||
    (saved.pending && (saved.choice !== null || depth !== saved.startDepth || saved.paidThrough !== depth))) return newRoadFork();
  return { pending: saved.pending, choice: saved.choice, startDepth: saved.startDepth, paidThrough: saved.paidThrough };
}

/** Called at a settled gap between encounters, after chests and rescue checks. */
export function offerRoadFork(state: RoadForkState, depth: number): boolean {
  if (state.choice || depth < ROAD_FORK_FIRST || depth > ROAD_FORK_LAST) return false;
  if (!state.pending) { state.pending = true; state.startDepth = depth; state.paidThrough = depth; }
  return true;
}

export function chooseRoad(state: RoadForkState, choice: RoadChoice): boolean {
  if (!state.pending || state.choice || (choice !== "wood" && choice !== "ore")) return false;
  state.choice = choice;
  state.pending = false;
  return true;
}

export function roadEnemiesLeft(state: RoadForkState | undefined, depth: number): number {
  return state?.choice ? Math.max(0, Math.min(ROAD_FORK_ENEMIES, state.startDepth + ROAD_FORK_ENEMIES - depth)) : 0;
}

/** One fixed reward per new defeat. Resource multipliers don't affect detour loot. */
export function claimRoadBonus(state: RoadForkState | undefined, depth: number): { resource: RoadChoice; amount: number } | null {
  if (!state?.choice || state.pending || depth <= state.paidThrough || depth <= state.startDepth ||
    depth > state.startDepth + ROAD_FORK_ENEMIES) return null;
  state.paidThrough = depth;
  return { resource: state.choice, amount: ROAD_FORK_BONUS };
}

export function roadOptions(biome: string) {
  const names = biome === "snow" ? ["Pine trail", "Frozen quarry"]
    : biome === "dungeon" ? ["Timber passage", "Old quarry"] : ["Wooded trail", "Quarry path"];
  return (["wood", "ore"] as const).map((id, index) => ({
    id, name: names[index], icon: id === "wood" ? "🪵" : "🪨", resource: id === "wood" ? "wood" : "stone",
    note: id === "wood" ? "Gather timber along the way." : "Collect stone along the way.",
  }));
}
