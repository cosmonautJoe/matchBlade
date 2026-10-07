/**
 * matchBlade — persistent meta progression (the caravan's memory).
 *
 * Everything that survives death lives here, saved to localStorage: banked
 * resources, hired recruits, forge upgrades, and the quest board. Runs stay
 * disposable (run.ts); the camp reads/writes this.
 *
 * Up to three quests per area track automatically. Camp pays completed quests
 * and fills the current area's slots; other areas retain their progress.
 * Achievements are permanent badges. Final bosses alone unlock the next zone.
 */

import { cleanCompanions, type CompanionId } from "./companions";
import { cleanAchievements, unlockAchievements } from "./achievements";

export interface ActiveQuest {
  id: string;
  base: number; // stat snapshot at acceptance (delta quests)
}

export interface ZoneStats {
  slain: number;
  chestsOpened: number;
  totalWood: number;
  totalOre: number;
}
const emptyZoneStats = (): ZoneStats => ({ slain: 0, chestsOpened: 0, totalWood: 0, totalOre: 0 });

export interface MetaState {
  version: 1;
  companions: CompanionId[];
  achievements: string[];
  progressNotice: { quests: string[]; achievements: string[] };
  // the caravan's current stop; the quest board + both scenes' art route off this
  biome: string;
  clearedBiomes: string[];
  /** Set by the development area picker; grants travel without recording boss victories. */
  debugZonesUnlocked?: boolean;
  zoneStats: Record<string, ZoneStats>;
  activeRun?: import("./run-save").RunCheckpoint;
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
  wizardHired: boolean; // Aldwin joins at the FOREST camp (the smith's magic mirror)
  staffLevel: number; // each study level = +SPELL_BONUS_PER_LEVEL on every cast
  // cumulative stats
  slain: number;
  chestsOpened: number;
  bestDepth: number;
  // the run scene's first-entry tutorial has been completed (or skipped)
  tutorialSeen: boolean;
  // the camp's arrival cutscene (walk in + the Wayfarer's welcome) has played
  campIntroSeen: boolean;
  // The caravan story intro is separate from the retired camp tutorial.
  caravanIntroSeen: boolean;
  // the Peddler has joined the camp (arrives the first time you bank a diamond)
  peddlerArrived: boolean;
  // item ids bought from the Peddler, delivered into slots when the next run starts
  stockedItems: string[];
  // quest board
  active: ActiveQuest[]; // up to three per area; use currentQuests for the current stop
  questsRewarded: string[]; // completed & paid out
  fulfilledRuns: string[]; // single-run quests satisfied since acceptance
}

const KEY = "matchblade-meta-v1";
export const MAX_ACTIVE = 3;

export function defaultMeta(): MetaState {
  return {
    version: 1,
    companions: [],
    achievements: [],
    progressNotice: { quests: [], achievements: [] },
    biome: "plains",
    clearedBiomes: [],
    zoneStats: {},
    wood: 0,
    ore: 0,
    treasure: 0,
    totalWood: 0,
    totalOre: 0,
    blacksmithHired: false,
    swordLevel: 0,
    wizardHired: false,
    staffLevel: 0,
    slain: 0,
    chestsOpened: 0,
    bestDepth: 0,
    tutorialSeen: false,
    campIntroSeen: false,
    caravanIntroSeen: false,
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
    return migrateMeta(parsed);
  } catch {
    return defaultMeta();
  }
}

/** Preserve roads unlocked by the old quest gate when loading older saves. */
export function migrateMeta(parsed: Partial<MetaState>): MetaState {
  const m: MetaState = { ...defaultMeta(), ...parsed, version: 1 };
  m.companions = cleanCompanions(parsed.companions);
  m.achievements = cleanAchievements(parsed.achievements);
  // Scout Map was retired; old packed copies must not occupy shop capacity.
  m.stockedItems = (Array.isArray(parsed.stockedItems) ? parsed.stockedItems : []).filter(id => id !== "ink");
  const quests = (ids: unknown): string[] => Array.isArray(ids)
    ? [...new Set(ids.filter((id): id is string => typeof id === "string" && !!questById(id)))] : [];
  m.questsRewarded = quests(parsed.questsRewarded);
  m.fulfilledRuns = quests(parsed.fulfilledRuns);
  const activeIds = new Set<string>();
  const slots: Record<string, number> = {};
  m.active = (Array.isArray(parsed.active) ? parsed.active : []).filter(a => {
    if (!a || !questById(a.id) || !Number.isFinite(a.base) || activeIds.has(a.id) || m.questsRewarded.includes(a.id)) return false;
    const biome = questBiome(a.id)!;
    if ((slots[biome] ?? 0) >= MAX_ACTIVE) return false;
    slots[biome] = (slots[biome] ?? 0) + 1;
    activeIds.add(a.id); return true;
  }).map(a => ({ id: a.id, base: a.base }));
  m.zoneStats = {};
  for (const biome of BIOME_ORDER) {
    const stats = emptyZoneStats(), saved = parsed.zoneStats?.[biome];
    for (const key of Object.keys(stats) as (keyof ZoneStats)[])
      stats[key] = Number.isFinite(saved?.[key]) ? Math.max(0, saved![key]) : 0;
    m.zoneStats[biome] = stats;
  }
  // Older saves only know lifetime totals. Keep each visible quest's earned
  // progress as a baseline credit; never guess how past runs split across zones.
  if (!parsed.zoneStats) for (const aq of m.active) {
    const q = questById(aq.id)!;
    if (q.kind === "delta" && q.stat !== "swordLevel" && q.stat !== "staffLevel")
      aq.base = -Math.max(0, Math.min(q.target, m[q.stat!] - aq.base));
  }
  m.progressNotice = {
    quests: quests(parsed.progressNotice?.quests).filter(id => m.questsRewarded.includes(id)),
    achievements: cleanAchievements(parsed.progressNotice?.achievements).filter(id => m.achievements.includes(id)),
  };
  // Hiring the smith now includes the first improvement, including existing saves.
  if (m.blacksmithHired) m.swordLevel = Math.max(1, m.swordLevel);
  m.clearedBiomes = Array.isArray(parsed.clearedBiomes) ? [...parsed.clearedBiomes] : [];
  m.debugZonesUnlocked = parsed.debugZonesUnlocked === true;
  const visited = BIOME_ORDER.indexOf(m.biome as typeof BIOME_ORDER[number]);
  for (const [i, biome] of BIOME_ORDER.entries()) {
    if (((!m.debugZonesUnlocked && i < visited) || (!Array.isArray(parsed.clearedBiomes) && QUEST_POOLS[biome].every(q => m.questsRewarded.includes(q.id)))) && !m.clearedBiomes.includes(biome))
      m.clearedBiomes.push(biome);
  }
  return m;
}

export function saveMeta(m: MetaState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
    return true;
  } catch {
    return false;
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
    return { savedAt: p.savedAt ?? 0, meta: migrateMeta(p.meta) };
  } catch {
    return null;
  }
}

/** Snapshot the active save into a slot. */
export function saveToSlot(n: number, m: MetaState): void {
  try {
    const meta = { ...m };
    delete meta.activeRun; // manual slots contain camp progress; live recovery uses the active save
    localStorage.setItem(slotKey(n), JSON.stringify({ savedAt: Date.now(), meta } satisfies SlotData));
  } catch {
    /* storage unavailable */
  }
}

/** Replace the active save with a slot's snapshot. True on success. */
export function loadFromSlot(n: number): boolean {
  const s = readSlot(n);
  if (!s) return false;
  delete s.meta.activeRun;
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
  const stats = m.zoneStats[m.biome] ??= emptyZoneStats();
  stats.slain += run.kills;
  stats.chestsOpened += run.chests;
  stats.totalWood += run.wood;
  stats.totalOre += run.ore;
  m.bestDepth = Math.max(m.bestDepth, run.kills); // depth == kills this run
  if (run.kills >= 20 && !m.clearedBiomes.includes(m.biome)) m.clearedBiomes.push(m.biome);
  delete m.activeRun; // settlement and checkpoint removal share one storage write
  // single-run quests: did this run satisfy any accepted "in one run" targets?
  for (const aq of currentQuests(m)) {
    const q = questById(aq.id);
    if (q?.kind === "run-depth" && run.kills >= q.target && !m.fulfilledRuns.includes(q.id)) m.fulfilledRuns.push(q.id);
  }
  saveMeta(m);
  return m;
}

// ---- costs (tuning knobs) ---------------------------------------------------
// Hire ~= 2-3 decent early runs of banking: a real ask, not a wall.
export const BLACKSMITH_COST = { wood: 20, ore: 20 };

/** Set up the forge and improve the sword in one transaction. */
export function unlockForge(m: MetaState): boolean {
  if (m.blacksmithHired || !canAfford(m, BLACKSMITH_COST)) return false;
  m.wood -= BLACKSMITH_COST.wood;
  m.ore -= BLACKSMITH_COST.ore;
  m.blacksmithHired = true;
  m.swordLevel = Math.max(1, m.swordLevel);
  saveMeta(m);
  return true;
}
/** Ore cost of the next forge level (level is the CURRENT level). */
export function forgeCost(level: number): number {
  return 20 + level * 15; // 20, 35, 50, ...
}
/**
 * Each zone's smithy can only take the blade so far. At the cap, the blade
 * SUNDERS that zone's common foes — one sword match, one kill (never bosses).
 * The next zone raises the ceiling (and fields foes that demand it).
 */
export function forgeCap(biome: string): number {
  return biome === "dungeon" ? 12 : biome === "snow" ? 9 : biome === "forest" ? 6 : 3;
}

// --- Aldwin the Mage: the forge's mirror for magic ---------------------------
// He's found at the FOREST camp, so he starts a zone later than Wren and asks
// for a scholar's price (reagents AND a diamond focus).
export const WIZARD_COST = { wood: 40, ore: 40, treasure: 5 };
/** Ore cost of the next study level (level is the CURRENT level). */
export function studyCost(level: number): number {
  return 25 + level * 18; // 25, 43, 61, ...
}
/** The staff's ceiling per zone — one tier behind the blade, since he joins later. */
export function studyCap(biome: string): number {
  return biome === "dungeon" ? 9 : biome === "snow" ? 6 : biome === "forest" ? 3 : 0;
}
/** Aldwin only turns up once the caravan reaches the forest. */
export function wizardAvailable(biome: string): boolean {
  return biome !== "plains";
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
export type DeltaStat = "slain" | "chestsOpened" | "totalWood" | "totalOre" | "swordLevel" | "staffLevel";

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
  { id: "slay25", label: "Defeat 25 enemies", shortLabel: "defeat enemies", reward: 10, kind: "delta", stat: "slain", target: 25 },
  { id: "chests5", label: "Open 5 treasure chests", shortLabel: "open chests", reward: 10, kind: "delta", stat: "chestsOpened", target: 5 },
  { id: "wood60", label: "Collect 60 wood and finish the run", shortLabel: "haul wood", reward: 10, kind: "delta", stat: "totalWood", target: 60 },
  { id: "hire", label: "Hire Wren the blacksmith", shortLabel: "hire the smith", reward: 15, kind: "state", target: 1 },
  { id: "depth10", label: "Reach depth 10 in a single run", shortLabel: "depth 10 run", reward: 15, kind: "run-depth", target: 10 },
  { id: "slay60", label: "Defeat 60 more enemies", shortLabel: "defeat enemies II", reward: 15, kind: "delta", stat: "slain", target: 60 },
  { id: "ore80", label: "Collect 80 stone and finish the run", shortLabel: "haul stone", reward: 15, kind: "delta", stat: "totalOre", target: 80 },
  { id: "forge2", label: "Upgrade your sword to level 3", shortLabel: "sword level 3", reward: 20, kind: "delta", stat: "swordLevel", target: 3 },
  { id: "chests12", label: "Open 12 more chests", shortLabel: "open chests II", reward: 15, kind: "delta", stat: "chestsOpened", target: 12 },
  { id: "depth16", label: "Reach depth 16 in a single run", shortLabel: "depth 16 run", reward: 25, kind: "run-depth", target: 16 },
];

// The forest asks more of a seasoned scout — bigger hauls, deeper runs, a sharper blade.
export const FOREST_QUESTS: Quest[] = [
  { id: "f_slay50", label: "Defeat 50 forest enemies", shortLabel: "forest enemies", reward: 20, kind: "delta", stat: "slain", target: 50 },
  { id: "f_chests10", label: "Open 10 treasure chests", shortLabel: "open chests", reward: 20, kind: "delta", stat: "chestsOpened", target: 10 },
  { id: "f_wood120", label: "Collect 120 wood and finish the run", shortLabel: "haul wood", reward: 20, kind: "delta", stat: "totalWood", target: 120 },
  { id: "f_ore120", label: "Collect 120 stone and finish the run", shortLabel: "haul stone", reward: 25, kind: "delta", stat: "totalOre", target: 120 },
  { id: "f_forge3", label: "Upgrade your sword to level 6", shortLabel: "sword level 6", reward: 30, kind: "delta", stat: "swordLevel", target: 6 },
  // Runs end victorious at depth 20 (the second boss) — quests fit the road.
  { id: "f_depth22", label: "Reach depth 18 in a single run", shortLabel: "depth 18 run", reward: 30, kind: "run-depth", target: 18 },
  { id: "f_depth30", label: "Defeat the second boss", shortLabel: "second boss", reward: 45, kind: "run-depth", target: 20 },
];

// The pass strips the caravan back to survival: bigger hauls, the full road, a blade at its true peak.
export const SNOW_QUESTS: Quest[] = [
  { id: "s_slay80", label: "Defeat 80 snow enemies", shortLabel: "snow enemies", reward: 30, kind: "delta", stat: "slain", target: 80 },
  { id: "s_chests15", label: "Open 15 treasure chests", shortLabel: "open chests", reward: 30, kind: "delta", stat: "chestsOpened", target: 15 },
  { id: "s_wood180", label: "Collect 180 wood and finish the run", shortLabel: "haul wood", reward: 35, kind: "delta", stat: "totalWood", target: 180 },
  { id: "s_ore180", label: "Collect 180 stone and finish the run", shortLabel: "haul stone", reward: 35, kind: "delta", stat: "totalOre", target: 180 },
  { id: "s_forge9", label: "Upgrade your sword to level 9", shortLabel: "sword level 9", reward: 45, kind: "delta", stat: "swordLevel", target: 9 },
  { id: "s_depth20", label: "Defeat the second boss", shortLabel: "clear the pass", reward: 60, kind: "run-depth", target: 20 },
];

// The delve is the journey's end (for now): the dark asks for everything.
export const DUNGEON_QUESTS: Quest[] = [
  { id: "d_slay120", label: "Defeat 120 dungeon enemies", shortLabel: "dungeon enemies", reward: 40, kind: "delta", stat: "slain", target: 120 },
  { id: "d_chests20", label: "Open 20 treasure chests", shortLabel: "open chests", reward: 40, kind: "delta", stat: "chestsOpened", target: 20 },
  { id: "d_wood240", label: "Collect 240 wood and finish the run", shortLabel: "haul wood", reward: 45, kind: "delta", stat: "totalWood", target: 240 },
  { id: "d_ore240", label: "Collect 240 stone and finish the run", shortLabel: "haul stone", reward: 45, kind: "delta", stat: "totalOre", target: 240 },
  { id: "d_forge12", label: "Upgrade your sword to level 12", shortLabel: "sword level 12", reward: 60, kind: "delta", stat: "swordLevel", target: 12 },
  { id: "d_depth20", label: "Defeat the second boss", shortLabel: "clear the deep", reward: 80, kind: "run-depth", target: 20 },
];

// Ordered march of the caravan. Each biome has an optional quest pool.
export const BIOME_ORDER = ["plains", "forest", "snow", "dungeon"] as const;
export const BIOME_LABELS: Record<string, string> = {
  plains: "Grass Plains", forest: "High Forest", snow: "Glacial Pass", dungeon: "The Delve",
};
export const QUEST_POOLS: Record<string, Quest[]> = {
  plains: PLAINS_QUESTS,
  forest: FOREST_QUESTS,
  snow: SNOW_QUESTS,
  dungeon: DUNGEON_QUESTS,
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

export function questBiome(id: string): string | undefined {
  return BIOME_ORDER.find(biome => QUEST_POOLS[biome].some(q => q.id === id));
}

export function currentQuests(m: MetaState, biome = m.biome): ActiveQuest[] {
  return m.active.filter(aq => questBiome(aq.id) === biome);
}

function statOf(m: MetaState, stat: DeltaStat, biome = m.biome): number {
  if (stat === "swordLevel" || stat === "staffLevel") return m[stat];
  return m.zoneStats[biome]?.[stat] ?? 0;
}

/** Progress of an ACCEPTED quest, optionally counting the run in progress. */
export function questProgress(
  m: MetaState,
  aq: ActiveQuest,
  live?: { kills: number; chests: number; wood: number; ore: number },
): { have: number; need: number } {
  const q = questById(aq.id);
  if (!q) return { have: 0, need: 1 };
  const biome = questBiome(aq.id)!;
  if (biome !== m.biome) live = undefined;
  if (q.kind === "state") return { have: m.blacksmithHired ? 1 : 0, need: 1 };
  if (q.kind === "run-depth") {
    const hit = m.fulfilledRuns.includes(q.id) || (live ? live.kills >= q.target : false);
    return { have: hit ? q.target : Math.min(live?.kills ?? 0, q.target), need: q.target };
  }
  // forge quests measure the blade's ABSOLUTE level (caps make deltas
  // unreachable if accepted after a forging) — other stats count from accept
  const absolute = q.stat === "swordLevel" || q.stat === "staffLevel"; // capped levels: measure absolutely
  let have = absolute ? statOf(m, q.stat!) : statOf(m, q.stat!, biome) - aq.base;
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
  const room = MAX_ACTIVE - currentQuests(m).length;
  return currentPool(m).filter((q) => !taken.has(q.id)).slice(0, Math.max(0, room));
}

export function acceptQuest(m: MetaState, id: string): boolean {
  if (currentQuests(m).length >= MAX_ACTIVE || questBiome(id) !== m.biome) return false;
  const q = questById(id);
  if (!q || m.active.some((a) => a.id === id) || m.questsRewarded.includes(id)) return false;
  const base = q.kind === "delta" ? statOf(m, q.stat!) : 0;
  m.active.push({ id, base });
  saveMeta(m);
  return true;
}

/** Move finished active quests to completed, pay their rewards. Returns them. */
export function collectQuestRewards(m: MetaState, persist = true): Quest[] {
  const done = currentQuests(m).filter((aq) => questDone(m, aq));
  if (!done.length) return [];
  const quests: Quest[] = [];
  for (const aq of done) {
    if (m.questsRewarded.includes(aq.id)) continue;
    const q = questById(aq.id)!;
    m.treasure += q.reward;
    m.questsRewarded.push(q.id);
    quests.push(q);
  }
  m.active = m.active.filter((aq) => !m.questsRewarded.includes(aq.id));
  if (persist) saveMeta(m);
  return quests;
}

/** Settle only between runs: one save contains payments, replacements and badges. */
export function prepareCampProgress(m: MetaState) {
  const paid: Quest[] = [];
  let added = 0;
  if (m.activeRun) return { paid, achievements: [] as ReturnType<typeof unlockAchievements> };
  do {
    paid.push(...collectQuestRewards(m, false));
    for (const q of offeredQuests(m)) {
      m.active.push({ id: q.id, base: q.kind === "delta" ? statOf(m, q.stat!) : 0 });
      added++;
    }
    // Hiring/upgrade quests may already be satisfied when they become available.
    // Only those pay immediately; new haul and depth quests require future runs.
  } while (currentQuests(m).some(aq => questDone(m, aq)));
  const achievements = unlockAchievements(m);
  if (paid.length || achievements.length || added) {
    m.progressNotice.quests = [...new Set([...m.progressNotice.quests, ...paid.map(q => q.id)])];
    m.progressNotice.achievements = [...new Set([...m.progressNotice.achievements, ...achievements.map(a => a.id)])];
    saveMeta(m);
  }
  return { paid, achievements };
}

export function acknowledgeProgress(m: MetaState) {
  if (!m.progressNotice.quests.length && !m.progressNotice.achievements.length) return;
  m.progressNotice = { quests: [], achievements: [] }; saveMeta(m);
}

export function progressNoticeText(m: MetaState): string {
  const { quests, achievements } = m.progressNotice;
  const gems = quests.reduce((sum, id) => sum + (questById(id)?.reward ?? 0), 0);
  return [quests.length ? `✓ ${quests.length} quest${quests.length === 1 ? "" : "s"} completed · +${gems} gems collected` : "",
    achievements.length ? `★ ${achievements.length} achievement${achievements.length === 1 ? "" : "s"} unlocked` : ""].filter(Boolean).join("\n");
}

export function campQuestFocus(m: MetaState) {
  return currentQuests(m).map(aq => ({ quest: questById(aq.id)!, progress: questProgress(m, aq) }))
    .sort((a, b) => b.progress.have / b.progress.need - a.progress.have / a.progress.need)[0] ?? null;
}

/** All optional quests in the current biome have been rewarded. */
export function allQuestsDone(m: MetaState): boolean {
  const pool = currentPool(m);
  return pool.length > 0 && pool.every((q) => m.questsRewarded.includes(q.id));
}

/** The biome the caravan moves to after this one, or null if this is the last. */
export function nextBiome(m: MetaState): string | null {
  const i = BIOME_ORDER.indexOf(m.biome as (typeof BIOME_ORDER)[number]);
  return i >= 0 && i < BIOME_ORDER.length - 1 ? BIOME_ORDER[i + 1] : null;
}

/** The final boss has fallen and there's somewhere new to go. */
export function roadOpen(m: MetaState): boolean {
  return m.clearedBiomes.includes(m.biome) && nextBiome(m) !== null;
}

/** Cleared roads and the next reachable stop are always available to revisit. */
export function unlockedBiomes(m: MetaState): string[] {
  if (m.debugZonesUnlocked) return [...BIOME_ORDER];
  let furthest = Math.max(0, BIOME_ORDER.indexOf(m.biome as typeof BIOME_ORDER[number]));
  for (const biome of m.clearedBiomes) {
    const i = BIOME_ORDER.indexOf(biome as typeof BIOME_ORDER[number]);
    if (i >= 0) furthest = Math.max(furthest, Math.min(BIOME_ORDER.length - 1, i + 1));
  }
  return BIOME_ORDER.slice(0, furthest + 1);
}

/** Travel only between runs; inventory, upgrades and each area's quests stay saved. */
export function travelToBiome(m: MetaState, biome: string): boolean {
  if (m.activeRun || biome === m.biome || !unlockedBiomes(m).includes(biome)) return false;
  prepareCampProgress(m);
  m.biome = biome;
  saveMeta(m);
  prepareCampProgress(m);
  return true;
}

/** Forward-travel shortcut used by run results. */
export function advanceBiome(m: MetaState): boolean {
  const next = nextBiome(m);
  if (!roadOpen(m) || !next) return false;
  return travelToBiome(m, next);
}
