// Shared by rewards, collection descriptions and combat feedback.
export const COMPANION_BALANCE = {
  bramble: { every: 4, wood: 3 },
  pip: { every: 4, stone: 3 },
  moss: { startGuard: 2, every: 3, minGuard: 2 },
  hazel: { matchSize: 4, wood: 3 },
  hush: { damagePercent: 20, minDamage: 2 },
  flurry: { matchSize: 4, guard: 2 },
  rime: { guard: 2 },
  echo: { every: 5, keys: 1 },
  flint: { matchSize: 4, stone: 3 },
} as const;
const B = COMPANION_BALANCE;
export const COMPANIONS = [
  { id: "bramble", biome: "plains", name: "Bramble", species: "Fox", benefit: `Finds ${B.bramble.wood} wood every ${B.bramble.every} enemies defeated.`, personality: "Nose in everything. Usually looking for lunch.", greeting: "A little help with the firewood. A lot of interest in your lunch." },
  { id: "pip", biome: "plains", name: "Pip", species: "Magpie", benefit: `Finds ${B.pip.stone} stone every ${B.pip.every} enemies defeated.`, personality: "Collects pebbles and occasionally someone else's cutlery.", greeting: "A pocketful of pebbles. Pip seems very pleased with the collection." },
  { id: "moss", biome: "plains", name: "Moss", species: "Tortoise", benefit: `Start with ${B.moss.startGuard} guard. Every ${B.moss.every} enemies defeated, gain ${B.moss.minGuard} guard, rising to 3 at depth 16. Guard blocks normal attacks.`, personality: "Takes the long way. Gets there eventually.", greeting: "Slow on the road. Very good at watching your back." },
  { id: "hazel", biome: "forest", name: "Hazel", species: "Squirrel", benefit: `Clearing ${B.hazel.matchSize} or more wood in a cascade gives ${B.hazel.wood} extra wood.`, personality: "Buries supplies, then checks them. Then checks again.", greeting: "Hazel has already hidden a nut in your bag. Apparently you're trusted now." },
  { id: "hush", biome: "forest", name: "Hush", species: "Owl", benefit: `Fireball matches deal ${B.hush.damagePercent}% extra damage after enemy defenses (at least ${B.hush.minDamage} extra damage).`, personality: "A quiet lookout with very strong opinions about noise.", greeting: "Hush settles onto the cart roof and gives everyone a long look." },
  { id: "flurry", biome: "snow", name: "Flurry", species: "Snow hare", benefit: `Clearing ${B.flurry.matchSize} or more shields in a cascade gives ${B.flurry.guard} extra guard.`, personality: "Always ready to leap. Occasionally surprised by a leaf.", greeting: "Two cautious hops, then straight into the warmest blanket." },
  { id: "rime", biome: "snow", name: "Rime", species: "Stoat", benefit: `Board potions give ${B.rime.guard} extra guard.`, personality: "Quick feet, a spotless coat, and a favorite warm corner.", greeting: "Rime checks your pockets, approves of the blankets, and decides to stay." },
  { id: "echo", biome: "dungeon", name: "Echo", species: "Bat", benefit: `Finds ${B.echo.keys} key every ${B.echo.every} enemies defeated.`, personality: "A neat little flyer who prefers to watch camp upside down.", greeting: "Echo claims a spot under the awning. A tiny set of ears follows your voice." },
  { id: "flint", biome: "dungeon", name: "Flint", species: "Mole", benefit: `Clearing ${B.flint.matchSize} or more stone in a cascade gives ${B.flint.stone} extra stone.`, personality: "A determined digger. Every pebble gets a proper inspection.", greeting: "Flint presents you with a smooth stone, then gets back to digging." },
] as const;
export type CompanionId = typeof COMPANIONS[number]["id"];
export const companionById = (id: string) => COMPANIONS.find(c => c.id === id);
export function cleanCompanions(ids: unknown): CompanionId[] {
  return Array.isArray(ids) ? [...new Set(ids.filter((id): id is CompanionId => !!companionById(id)))] : [];
}
/** Describe payouts at a defeat; the combat kill path applies them exactly once. */
export function companionKillRewards(owned: readonly string[] | undefined, killed: number, hitGuard: number) {
  const rewards: { id: CompanionId; resource: "wood" | "ore" | "keys" | "guard"; amount: number }[] = [];
  if (killed <= 0) return rewards;
  if (owned?.includes("bramble") && killed % B.bramble.every === 0)
    rewards.push({ id: "bramble", resource: "wood", amount: B.bramble.wood });
  if (owned?.includes("pip") && killed % B.pip.every === 0)
    rewards.push({ id: "pip", resource: "ore", amount: B.pip.stone });
  if (owned?.includes("moss") && killed % B.moss.every === 0)
    rewards.push({ id: "moss", resource: "guard", amount: Math.max(B.moss.minGuard, hitGuard) });
  if (owned?.includes("echo") && killed % B.echo.every === 0)
    rewards.push({ id: "echo", resource: "keys", amount: B.echo.keys });
  return rewards;
}
export interface RescueState { rolledDepth: number; encountered: boolean; pending: CompanionId | null }
export const newRescueState = (): RescueState => ({ rolledDepth: 0, encountered: false, pending: null });
export type RescuePayment = "key" | "wood";
type RescuePack = { keys: number; wood: number };
/** Common supplies only: one key, or one ordinary wood match for a lever. */
export function rescueOptions(pack: RescuePack, bank: { wood: number }) {
  return { key: pack.keys >= 1, wood: pack.wood + bank.wood >= 3 };
}
export function payForRescue(payment: RescuePayment, pack: RescuePack, bank: { wood: number }): boolean {
  if (!rescueOptions(pack, bank)[payment]) return false;
  if (payment === "key") pack.keys -= 1;
  else { const carried = Math.min(3, pack.wood); pack.wood -= carried; bank.wood -= 3 - carried; }
  return true;
}
/** One chance per newly cleared encounter, at most one rescue per run. */
export function rollRescue(state: RescueState, biome: string, depth: number, owned: readonly string[], rand = Math.random, affordable = true): CompanionId | null {
  if (state.pending) return state.pending;
  if (state.encountered || depth <= state.rolledDepth) return null;
  state.rolledDepth = depth;
  if (!affordable || depth < 3 || depth >= 19 || depth % 10 === 9) return null;
  const pool = COMPANIONS.filter(c => c.biome === biome && !owned.includes(c.id));
  if (!pool.length || rand() >= .13) return null;
  state.encountered = true;
  return state.pending = pool[Math.min(pool.length-1, Math.floor(rand()*pool.length))].id;
}
