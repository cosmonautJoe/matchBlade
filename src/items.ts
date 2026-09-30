/**
 * matchBlade — run-item registry (the chest loot that fills the 6 HUD slots).
 *
 * Pure data + roll tables, no Phaser. The scene owns slot state and effect
 * execution; run.ts owns the couple of buff fields items poke (whetstone
 * charges, surge/resource multipliers). Activation model: TAP TO USE — every
 * item is a one-shot consumable; `target` says whether using it needs a
 * follow-up tap on the board. The Hearth Charm is the one exception: it sits
 * in its slot and fires itself on death.
 */

export type ItemTier = "common" | "uncommon" | "rare";
export type ItemTarget = "none" | "cell" | "type";

export interface ItemDef {
  id: string;
  name: string;
  glyph: string; // slot / chest-reveal icon
  tier: ItemTier;
  target: ItemTarget; // cell = tap a tile, type = tap a tile to pick its kind
  desc: string; // tooltip body
  hint: string; // tooltip footer ("tap to use" variants)
  bossOnly?: boolean; // only appears in the boss-hoard table
  bossAid?: boolean; // a warden-charm: only does anything inside a boss arena.
  // The Peddler always keeps one of these on her table (see rollShopOffers) —
  // her whole pitch is that a boss fight is survivable if you shop first.
}

export type ChestPull = { kind: "wood" | "ore" | "treasure" | "item"; n: number; icon: string; item?: ItemDef };

// ---- effect tuning (the scene reads these) ---------------------------------
export const STORMCALL_DMG = 25;
export const WARHORN_SECS = 15;
export const WAYSTONE_SECS = 12;
export const BULWARK_BLOCK = 6; // guard charges — six shields' worth
export const BURN_DPS = 2;
export const BURN_SECS = 10;
export const SPURS_STRIKE_MS = 7000; // slowed enemy cadence (vs STRIKE_MS 4800)
export const HEARTH_PRESSURE = 0.5; // revive resets pressure here
export const LEDGER_SECS = 20;
export const WHETSTONE_CHARGES = 3;
export const PAN_EXTRA_PULLS = 2;
export const SAPPER_RADIUS = 1; // 3x3
// Warden-charms. Deliberately modest: a boss arena pierces your guard entirely,
// so these take the edge off a mistake rather than buying one back.
export const SALVE_MULT = 0.5; // a warden's blow lands at half force
export const BELL_CHARGES = 1; // RED slips forgiven outright (stacks if you buy two)

const TAP = "tap to use";
const AIM = "tap, then pick a tile";

export const ITEMS: ItemDef[] = [
  // ---- combat ----
  { id: "whetstone", name: "Sharpening Stone", glyph: "🗡️", tier: "common", target: "none",
    desc: `Your next ${WHETSTONE_CHARGES} sword matches attack with at least 5 tiles of power. Lasts until used.`, hint: TAP },
  { id: "stormcall", name: "Lightning Scroll", glyph: "📜", tier: "rare", target: "none",
    desc: `${STORMCALL_DMG} base spell damage, plus staff upgrades. Enemy resistance applies. Cannot damage bosses.`, hint: "tap during a regular fight" },
  { id: "warhorn", name: "Rally Horn", glyph: "📯", tier: "common", target: "none",
    desc: `For ${WARHORN_SECS}s of regular combat, kills push you back toward safety twice as far.`, hint: TAP },
  { id: "cinderflask", name: "Fire Bomb", glyph: "🔥", tier: "uncommon", target: "none", bossOnly: true,
    desc: `Burn the current enemy for ${BURN_DPS} damage/sec for ${BURN_SECS}s. Ends when it dies. Cannot damage bosses.`, hint: "tap during a regular fight" },
  // ---- survival ----
  { id: "waystone", name: "Time Stop", glyph: "⏳", tier: "uncommon", target: "none",
    desc: `Pause the steady push toward the skull for ${WAYSTONE_SECS}s. Enemy attacks still hit.`, hint: TAP },
  { id: "bulwark", name: "Shield Potion", glyph: "🧪", tier: "common", target: "none",
    desc: `Add ${BULWARK_BLOCK} guard charges. Stronger enemies use more charges per hit. Boss attacks bypass guard.`, hint: TAP },
  { id: "hearth", name: "Revive", glyph: "❤️", tier: "rare", target: "none",
    desc: "Automatically save this run once when you would die, moving you halfway back from the skull. Works against bosses too.", hint: "automatic · keep in your inventory" },
  { id: "spurs", name: "Slow Trap", glyph: "🕸️", tier: "common", target: "none",
    desc: "The current regular enemy attacks more slowly until defeated. Does not affect its attack already in progress.", hint: "tap during a regular fight" },
  // ---- board ----
  { id: "sapper", name: "Tile Bomb", glyph: "💣", tier: "uncommon", target: "cell",
    desc: "Clear a 3×3 area. Wood, ore and gems are collected; combat tiles and keys use normal match thresholds. Potions are collected too.", hint: AIM },
  { id: "prism", name: "Sword Converter", glyph: "🔮", tier: "rare", target: "type",
    desc: "Choose a tile type to turn all its tiles into swords. Any resulting matches activate immediately.", hint: AIM },
  { id: "dice", name: "Shuffle", glyph: "🎲", tier: "common", target: "none",
    desc: "Replace the board with new tiles and at least one valid move. Replaced tiles give no rewards.", hint: TAP },
  { id: "lodestone", name: "Resource Magnet", glyph: "🧲", tier: "uncommon", target: "none",
    desc: "Collect all wood and ore tiles, then refill the gaps. Kept if there is nothing to collect.", hint: TAP },
  // ---- economy ----
  { id: "skeleton", name: "Spare Key", glyph: "🗝️", tier: "uncommon", target: "none",
    desc: "Open the next chest without spending a key. Extra uses each cover another chest.", hint: TAP },
  { id: "pan", name: "Bonus Loot", glyph: "🎁", tier: "uncommon", target: "none",
    desc: `The next chest gives ${PAN_EXTRA_PULLS} extra rewards. Extra uses each apply to another chest.`, hint: TAP },
  { id: "ledger", name: "Double Resources", glyph: "📒", tier: "uncommon", target: "none",
    desc: `Double wood, ore and gems collected from the board for ${LEDGER_SECS}s of regular combat. Does not double chest loot or keys.`, hint: TAP },
  { id: "ink", name: "Scout Map", glyph: "🗺️", tier: "common", target: "none",
    desc: "Show the next three encounter types: enemies, chests or bosses. Lasts for this run.", hint: TAP },
  // ---- warden-charms (the Peddler's speciality; dead weight outside a boss) ----
  { id: "wardsalve", name: "Boss Armor", glyph: "🩹", tier: "uncommon", target: "none", bossAid: true,
    desc: "Boss hits move you half as far toward the skull for this run. Does not stack or affect regular enemies.", hint: "tap before or during a boss" },
  { id: "wardbell", name: "Safety Bell", glyph: "🔔", tier: "common", target: "none", bossAid: true,
    desc: "Cancel your next red-hazard mistake during a boss fight. Extra uses add one saved mistake each.", hint: "tap before or during a boss" },
];

export interface ItemUseContext {
  arena: boolean;
  boss: boolean;
  hasEnemy: boolean;
  boardBusy: boolean;
  hasMaterials: boolean;
  burning: boolean;
  sunder: boolean;
}

/** Validate before spending a slot: an unusable item stays in the inventory. */
export function itemUseReason(def: ItemDef, ctx: ItemUseContext): string | null {
  if (ctx.arena && !def.bossAid && def.id !== "hearth") return "Use this between boss fights.";
  if (["stormcall", "cinderflask", "spurs"].includes(def.id)) {
    if (ctx.boss) return "This item only works on regular enemies.";
    if (!ctx.hasEnemy) return "Wait for an enemy to engage.";
    if (ctx.boardBusy) return "Wait for the board to settle.";
  }
  if ((def.target !== "none" || ["dice", "lodestone"].includes(def.id)) && ctx.boardBusy)
    return "Wait for the board to settle.";
  if (def.id === "lodestone" && !ctx.hasMaterials) return "No wood or ore to collect. Item kept.";
  if (def.id === "cinderflask" && ctx.burning) return "This enemy is already burning. Item kept.";
  if (def.id === "whetstone" && ctx.sunder) return "Your sword already defeats regular enemies in one match. Item kept.";
  return null;
}

export function itemById(id: string): ItemDef | undefined {
  return ITEMS.find((i) => i.id === id);
}

export const TIER_COLORS: Record<ItemTier, string> = {
  common: "#b9c0cc",
  uncommon: "#7fd0ff",
  rare: "#ffd24a",
};

// ---- chest roll ------------------------------------------------------------
// Regular chests: common-heavy. The boss hoard rolls richer AND is the only
// place bossOnly trophies (the Cinder Flask) appear.
const TIER_WEIGHTS: Record<ItemTier, number> = { common: 60, uncommon: 30, rare: 10 };
const BOSS_TIER_WEIGHTS: Record<ItemTier, number> = { common: 25, uncommon: 45, rare: 30 };
export const CHEST_BONUS_ITEM_CHANCE = 0.14;

export function rollItem(bossHoard: boolean, rand: () => number = Math.random): ItemDef {
  const weights = bossHoard ? BOSS_TIER_WEIGHTS : TIER_WEIGHTS;
  const total = weights.common + weights.uncommon + weights.rare;
  let x = rand() * total;
  let tier: ItemTier = "rare";
  for (const t of ["common", "uncommon", "rare"] as const) {
    x -= weights[t];
    if (x < 0) {
      tier = t;
      break;
    }
  }
  const pool = ITEMS.filter((i) => i.tier === tier && (bossHoard || !i.bossOnly));
  return pool[(rand() * pool.length) | 0];
}

/**
 * Build a fixed-size chest haul. One resource and one item are guaranteed when
 * inventory space exists; the remaining pulls retain the old 14% item chance.
 * Item count is capped to the empty-slot budget and one resource always remains.
 */
export function rollChestPulls(
  count: number,
  emptySlots: number,
  bossHoard: boolean,
  rand: () => number = Math.random,
): ChestPull[] {
  const total = Math.max(2, Math.floor(count));
  const itemBudget = Math.max(0, Math.min(Math.floor(emptySlots), total - 1));
  let itemCount = itemBudget > 0 ? 1 : 0;

  // Two pulls are reserved for the guaranteed resource + item. Every extra
  // reveal can jackpot into another item, while capacity remains available.
  for (let i = 0; i < total - 2 && itemCount < itemBudget; i++) {
    if (rand() < CHEST_BONUS_ITEM_CHANCE) itemCount++;
  }

  const resourcePull = (): ChestPull => {
    const r = rand();
    if (r < 0.4) return { kind: "treasure", n: 2 + ((rand() * 3) | 0), icon: "💎" };
    if (r < 0.7) return { kind: "wood", n: 4 + ((rand() * 5) | 0), icon: "🪵" };
    return { kind: "ore", n: 4 + ((rand() * 5) | 0), icon: "🪨" };
  };

  const pulls: ChestPull[] = [];
  for (let i = itemCount; i < total; i++) pulls.push(resourcePull());
  for (let i = 0; i < itemCount; i++) {
    const def = rollItem(bossHoard, rand);
    pulls.push({ kind: "item", n: 1, icon: def.glyph, item: def });
  }
  const rank = { wood: 0, ore: 0, treasure: 1, item: 2 } as const;
  return pulls.sort((a, b) => rank[a.kind] - rank[b.kind]);
}
