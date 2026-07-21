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
}

export type ChestPull = { kind: "wood" | "ore" | "treasure" | "item"; n: number; icon: string; item?: ItemDef };

// ---- effect tuning (the scene reads these) ---------------------------------
export const STORMCALL_DMG = 25;
export const WARHORN_SECS = 15;
export const WAYSTONE_SECS = 12;
export const BULWARK_BLOCK = 0.3; // six shields' worth
export const BURN_DPS = 2;
export const BURN_SECS = 10;
export const SPURS_STRIKE_MS = 7000; // slowed enemy cadence (vs STRIKE_MS 4800)
export const HEARTH_PRESSURE = 0.5; // revive resets pressure here
export const LEDGER_SECS = 20;
export const WHETSTONE_CHARGES = 3;
export const PAN_EXTRA_PULLS = 2;
export const SAPPER_RADIUS = 1; // 3x3

const TAP = "tap to use";
const AIM = "tap, then pick a tile";

export const ITEMS: ItemDef[] = [
  // ---- combat ----
  { id: "whetstone", name: "Wren's Whetstone", glyph: "🗡️", tier: "common", target: "none",
    desc: "Your next 3 sword matches strike as full combos — 5-match power from any match.", hint: TAP },
  { id: "stormcall", name: "Stormcall Scroll", glyph: "📜", tier: "rare", target: "none",
    desc: `Unleash a bolt of storm magic: ${STORMCALL_DMG} damage to the foe before you.`, hint: TAP },
  { id: "warhorn", name: "War Horn", glyph: "📯", tier: "common", target: "none",
    desc: `Sound the charge: for ${WARHORN_SECS}s every kill's surge carries you twice as far.`, hint: TAP },
  { id: "cinderflask", name: "Cinder Flask", glyph: "🔥", tier: "uncommon", target: "none", bossOnly: true,
    desc: `Malgrim's own fire, corked: the foe before you burns for ${BURN_DPS}/sec for ${BURN_SECS}s.`, hint: `${TAP} · boss trophy` },
  // ---- survival ----
  { id: "waystone", name: "Waystone", glyph: "🗿", tier: "uncommon", target: "none",
    desc: `The world holds its breath: scroll pressure freezes for ${WAYSTONE_SECS}s.`, hint: TAP },
  { id: "bulwark", name: "Bulwark Brew", glyph: "🧪", tier: "common", target: "none",
    desc: "Drink deep: instantly raise your guard by six shields' worth.", hint: TAP },
  { id: "hearth", name: "Hearth Charm", glyph: "❤️", tier: "rare", target: "none",
    desc: "Keeps itself. When death takes you it burns instead — once — and drags you back from the skull.", hint: "acts on its own" },
  { id: "spurs", name: "Scout's Spurs", glyph: "🥾", tier: "common", target: "none",
    desc: "Dig in: the current foe's strikes come far slower until it falls.", hint: TAP },
  // ---- board ----
  { id: "sapper", name: "Sapper's Charge", glyph: "💣", tier: "uncommon", target: "cell",
    desc: "Detonate a 3×3 blast. Every tile destroyed counts as matched — swords swing, keys bank, all of it.", hint: AIM },
  { id: "prism", name: "Chromatic Prism", glyph: "🔮", tier: "rare", target: "type",
    desc: "Pick a tile: every tile of its kind on the board transmutes into swords.", hint: AIM },
  { id: "dice", name: "Vagrant's Dice", glyph: "🎲", tier: "common", target: "none",
    desc: "Toss the board: every tile rerolls into a fresh spread.", hint: TAP },
  { id: "lodestone", name: "Lodestone", glyph: "🧲", tier: "uncommon", target: "none",
    desc: "Wrench every wood and ore tile off the board, straight into your pack.", hint: TAP },
  // ---- economy ----
  { id: "skeleton", name: "Skeleton Key", glyph: "🗝️", tier: "uncommon", target: "none",
    desc: "The next chest springs open free — no key spent.", hint: TAP },
  { id: "pan", name: "Prospector's Pan", glyph: "⛏️", tier: "uncommon", target: "none",
    desc: `Work the sluice: the next chest yields ${PAN_EXTRA_PULLS} extra pulls.`, hint: TAP },
  { id: "ledger", name: "Merchant's Ledger", glyph: "📒", tier: "uncommon", target: "none",
    desc: `Cook the books: for ${LEDGER_SECS}s wood, ore and gem matches pay double.`, hint: TAP },
  { id: "ink", name: "Cartographer's Ink", glyph: "🗺️", tier: "common", target: "none",
    desc: "Chart the road: see what the next three encounters hold, for the rest of the run.", hint: TAP },
];

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
