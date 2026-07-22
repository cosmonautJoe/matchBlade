/**
 * matchBlade — persistent meta progression (the caravan's memory).
 *
 * Everything that survives death lives here, saved to localStorage: banked
 * resources, hired recruits, forge upgrades, and the quest board. Runs stay
 * disposable (run.ts); the camp reads/writes this.
 *
 * QUESTS (YMBAB-style, with our twist): the Wayfarer OFFERS quests from an
 * ordered pool; the player ACCEPTS up to MAX_ACTIVE at a time. Progress counts
 * from the moment of acceptance (delta quests snapshot a baseline), so you
 * can't retro-complete. Completing quests frees a slot and the next offers
 * appear. Clearing the WHOLE pool opens the road to the next biome.
 */

export interface ActiveQuest {
  id: string;
  base: number; // stat snapshot at acceptance (delta quests)
}

export interface MetaState {
  version: 1;
  // the caravan's current stop; the quest board + both scenes' art route off this
  biome: string;
  // banked resources (keys are per-run tension — they don't bank)
  wood: number;
  ore: number;
  treasure: number;
  // lifetime-earned counters (monotonic; "haul home" quests measure deltas of these)
  totalWood: number;
  totalOre: number;
  // recruits & upgrades
  blacksmithHired: boolean;
  swordLevel: number; // each forge level = +1 damage on the first sword hit
  // cumulative stats
  slain: number;
  chestsOpened: number;
  bestDepth: number;
  // the run scene's first-entry tutorial has been completed (or skipped)
  tutorialSeen: boolean;
  // the camp's arrival cutscene (walk in + the Wayfarer's welcome) has played
  campIntroSeen: boolean;
  // the Peddler has joined the camp (arrives the first time you bank a diamond)
  peddlerArrived: boolean;
  // item ids bought from the Peddler, delivered into slots when the next run starts
  stockedItems: string[];
  // quest board
  active: ActiveQuest[];
  questsRewarded: string[]; // completed & paid out
  fulfilledRuns: string[]; // single-run quests satisfied since acceptance
}

const KEY = "matchblade-meta-v1";
export const MAX_ACTIVE = 3;

export function defaultMeta(): MetaState {
  return {
    version: 1,
    biome: "plains",
    wood: 0,
    ore: 0,
    treasure: 0,
    totalWood: 0,
    totalOre: 0,
    blacksmithHired: false,
    swordLevel: 0,
    slain: 0,
    chestsOpened: 0,
    bestDepth: 0,
    tutorialSeen: false,
    campIntroSeen: false,
    peddlerArrived: false,
    stockedItems: [],
    active: [],
    questsRewarded: [],
    fulfilledRuns: [],
  };
}

export function loadMeta(): MetaState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultMeta();
    const parsed = JSON.parse(raw) as Partial<MetaState>;
    return { ...defaultMeta(), ...parsed, version: 1 };
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(m: MetaState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable (private mode etc.) — play on without persistence */
  }
}

// ---- save slots (the menu's Save/Load) --------------------------------------
// The ACTIVE save auto-persists on every mutation; slots are snapshots of it —
// restore points the player takes and returns to deliberately.

export const SAVE_SLOTS = 3;
const slotKey = (n: number) => `matchblade-save-${n}`;

export interface SlotData {
  savedAt: number; // epoch ms
  meta: MetaState;
}

export function readSlot(n: number): SlotData | null {
  try {
    const raw = localStorage.getItem(slotKey(n));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<SlotData>;
    if (!p.meta) return null;
    return { savedAt: p.savedAt ?? 0, meta: { ...defaultMeta(), ...p.meta, version: 1 } };
  } catch {
    return null;
  }
}

/** Snapshot the active save into a slot. */
export function saveToSlot(n: number, m: MetaState): void {
  try {
    localStorage.setItem(slotKey(n), JSON.stringify({ savedAt: Date.now(), meta: m } satisfies SlotData));
  } catch {
    /* storage unavailable */
  }
}

/** Replace the active save with a slot's snapshot. True on success. */
export function loadFromSlot(n: number): boolean {
  const s = readSlot(n);
  if (!s) return false;
  saveMeta(s.meta);
  return true;
}

/** Fold one finished run into the bank + quest stats. Mutates and saves. */
export function bankRun(
  m: MetaState,
  run: { wood: number; ore: number; treasure: number; kills: number; chests: number },
): MetaState {
  m.wood += run.wood;
  m.ore += run.ore;
  m.treasure += run.treasure;
  m.totalWood += run.wood;
  m.totalOre += run.ore;
  m.slain += run.kills;
  m.chestsOpened += run.chests;
  m.bestDepth = Math.max(m.bestDepth, run.kills); // depth == kills this run
  // single-run quests: did this run satisfy any accepted "in one run" targets?
  for (const aq of m.active) {
    const q = questById(aq.id);
    if (q?.kind === "run-depth" && run.kills >= q.target && !m.fulfilledRuns.includes(q.id)) m.fulfilledRuns.push(q.id);
  }
  saveMeta(m);
  return m;
}

// ---- costs (tuning knobs) ---------------------------------------------------
// Hire ~= 2-3 decent early runs of banking: a real ask, not a wall.
export const BLACKSMITH_COST = { wood: 30, ore: 30 };
/** Ore cost of the next forge level (level is the CURRENT level). */
export function forgeCost(level: number): number {
  return 20 + level * 15; // 20, 35, 50, ...
}

export function canAfford(m: MetaState, cost: { wood?: number; ore?: number; treasure?: number }): boolean {
  return m.wood >= (cost.wood ?? 0) && m.ore >= (cost.ore ?? 0) && m.treasure >= (cost.treasure ?? 0);
}

export function spend(m: MetaState, cost: { wood?: number; ore?: number; treasure?: number }): void {
  m.wood -= cost.wood ?? 0;
  m.ore -= cost.ore ?? 0;
  m.treasure -= cost.treasure ?? 0;
  saveMeta(m);
}

// ---- quest pool (plains) ----------------------------------------------------
// kind:
//   delta     — progress = stat(now) - stat(at accept), vs target
//   run-depth — one run (after accepting) must reach `target` depth
//   state     — a milestone flag (e.g. blacksmith hired)
export type QuestKind = "delta" | "run-depth" | "state";
export type DeltaStat = "slain" | "chestsOpened" | "totalWood" | "totalOre" | "swordLevel";

export interface Quest {
  id: string;
  label: string;
  shortLabel: string; // compact form for the in-run HUD
  reward: number; // treasure paid on completion
  kind: QuestKind;
  target: number;
  stat?: DeltaStat; // delta quests
}

export const PLAINS_QUESTS: Quest[] = [
  { id: "slay25", label: "Slay 25 slimes", shortLabel: "slay slimes", reward: 10, kind: "delta", stat: "slain", target: 25 },
  { id: "chests5", label: "Crack open 5 treasure chests", shortLabel: "open chests", reward: 10, kind: "delta", stat: "chestsOpened", target: 5 },
  { id: "wood60", label: "Haul 60 wood back to camp", shortLabel: "haul wood", reward: 10, kind: "delta", stat: "totalWood", target: 60 },
  { id: "hire", label: "Coax the blacksmith from her tent", shortLabel: "hire the smith", reward: 15, kind: "state", target: 1 },
  { id: "depth10", label: "Reach depth 10 in a single run", shortLabel: "depth 10 run", reward: 15, kind: "run-depth", target: 10 },
  { id: "slay60", label: "Slay 60 more slimes", shortLabel: "slay slimes II", reward: 15, kind: "delta", stat: "slain", target: 60 },
  { id: "ore80", label: "Haul 80 ore back to camp", shortLabel: "haul ore", reward: 15, kind: "delta", stat: "totalOre", target: 80 },
  { id: "forge2", label: "Have Wren forge 2 upgrades", shortLabel: "forge twice", reward: 20, kind: "delta", stat: "swordLevel", target: 2 },
  { id: "chests12", label: "Crack open 12 more chests", shortLabel: "open chests II", reward: 15, kind: "delta", stat: "chestsOpened", target: 12 },
  { id: "depth16", label: "Reach depth 16 in a single run", shortLabel: "depth 16 run", reward: 25, kind: "run-depth", target: 16 },
];

// The forest asks more of a seasoned scout — bigger hauls, deeper runs, a sharper blade.
export const FOREST_QUESTS: Quest[] = [
  { id: "f_slay50", label: "Slay 50 forest beasts", shortLabel: "slay beasts", reward: 20, kind: "delta", stat: "slain", target: 50 },
  { id: "f_chests10", label: "Crack open 10 treasure chests", shortLabel: "open chests", reward: 20, kind: "delta", stat: "chestsOpened", target: 10 },
  { id: "f_wood120", label: "Haul 120 wood back to camp", shortLabel: "haul wood", reward: 20, kind: "delta", stat: "totalWood", target: 120 },
  { id: "f_ore120", label: "Haul 120 ore back to camp", shortLabel: "haul ore", reward: 25, kind: "delta", stat: "totalOre", target: 120 },
  { id: "f_forge3", label: "Have Wren forge 3 more upgrades", shortLabel: "forge x3", reward: 30, kind: "delta", stat: "swordLevel", target: 3 },
  { id: "f_depth22", label: "Reach depth 22 in a single run", shortLabel: "depth 22 run", reward: 30, kind: "run-depth", target: 22 },
  { id: "f_depth30", label: "Reach depth 30 in a single run", shortLabel: "depth 30 run", reward: 45, kind: "run-depth", target: 30 },
];

// Ordered march of the caravan. Each biome has a quest pool that gates the next.
export const BIOME_ORDER = ["plains", "forest"] as const;
export const QUEST_POOLS: Record<string, Quest[]> = {
  plains: PLAINS_QUESTS,
  forest: FOREST_QUESTS,
};

/** The quest pool for the biome the caravan is currently camped in. */
export function currentPool(m: MetaState): Quest[] {
  return QUEST_POOLS[m.biome] ?? [];
}

export function questById(id: string): Quest | undefined {
  for (const pool of Object.values(QUEST_POOLS)) {
    const q = pool.find((x) => x.id === id);
    if (q) return q;
  }
  return undefined;
}

function statOf(m: MetaState, stat: DeltaStat): number {
  return m[stat];
}

/** Progress of an ACCEPTED quest, optionally counting the run in progress. */
export function questProgress(
  m: MetaState,
  aq: ActiveQuest,
  live?: { kills: number; chests: number; wood: number; ore: number },
): { have: number; need: number } {
  const q = questById(aq.id);
  if (!q) return { have: 0, need: 1 };
  if (q.kind === "state") return { have: m.blacksmithHired ? 1 : 0, need: 1 };
  if (q.kind === "run-depth") {
    const hit = m.fulfilledRuns.includes(q.id) || (live ? live.kills >= q.target : false);
    return { have: hit ? q.target : Math.min(live?.kills ?? 0, q.target), need: q.target };
  }
  let have = statOf(m, q.stat!) - aq.base;
  if (live) {
    if (q.stat === "slain") have += live.kills;
    else if (q.stat === "chestsOpened") have += live.chests;
    else if (q.stat === "totalWood") have += live.wood;
    else if (q.stat === "totalOre") have += live.ore;
  }
  return { have: Math.max(0, Math.min(have, q.target)), need: q.target };
}

export function questDone(m: MetaState, aq: ActiveQuest): boolean {
  const p = questProgress(m, aq);
  return p.have >= p.need;
}

/** Quests the Wayfarer is offering right now (fills free slots, current-biome pool order). */
export function offeredQuests(m: MetaState): Quest[] {
  const taken = new Set([...m.active.map((a) => a.id), ...m.questsRewarded]);
  const room = MAX_ACTIVE - m.active.length;
  return currentPool(m).filter((q) => !taken.has(q.id)).slice(0, Math.max(0, room));
}

export function acceptQuest(m: MetaState, id: string): boolean {
  if (m.active.length >= MAX_ACTIVE) return false;
  const q = questById(id);
  if (!q || m.active.some((a) => a.id === id) || m.questsRewarded.includes(id)) return false;
  const base = q.kind === "delta" ? statOf(m, q.stat!) : 0;
  m.active.push({ id, base });
  saveMeta(m);
  return true;
}

/** Move finished active quests to completed, pay their rewards. Returns them. */
export function collectQuestRewards(m: MetaState): Quest[] {
  const done = m.active.filter((aq) => questDone(m, aq));
  if (!done.length) return [];
  const quests: Quest[] = [];
  for (const aq of done) {
    const q = questById(aq.id)!;
    m.treasure += q.reward;
    m.questsRewarded.push(q.id);
    quests.push(q);
  }
  m.active = m.active.filter((aq) => !questDone(m, aq) || !m.questsRewarded.includes(aq.id));
  m.active = m.active.filter((aq) => !m.questsRewarded.includes(aq.id));
  saveMeta(m);
  return quests;
}

/** The current biome's whole quest pool cleared -> the road onward opens. */
export function allQuestsDone(m: MetaState): boolean {
  const pool = currentPool(m);
  return pool.length > 0 && pool.every((q) => m.questsRewarded.includes(q.id));
}

/** The biome the caravan moves to after this one, or null if this is the last. */
export function nextBiome(m: MetaState): string | null {
  const i = BIOME_ORDER.indexOf(m.biome as (typeof BIOME_ORDER)[number]);
  return i >= 0 && i < BIOME_ORDER.length - 1 ? BIOME_ORDER[i + 1] : null;
}

/** True when the pool is cleared AND there's somewhere new to go. */
export function roadOpen(m: MetaState): boolean {
  return allQuestsDone(m) && nextBiome(m) !== null;
}

/** Break camp and travel to the next biome. Clears any dangling active quests. */
export function advanceBiome(m: MetaState): boolean {
  const next = nextBiome(m);
  if (!roadOpen(m) || !next) return false;
  m.biome = next;
  m.active = []; // pool cleared; the new biome offers fresh oaths
  saveMeta(m);
  return true;
}
