/**
 * Pure run / combat state for the dungeon runner — no Phaser, no rendering.
 * The scene drives it: each resolved cascade calls applyMatches(counts), a
 * timer calls enemyStrike(), and the frame loop calls scroll(dp).
 *
 * SINGLE FAIL AXIS: `pressure` in [0,1] is how far the leftward scroll has
 * dragged the hero toward the skull. It rises with time (scroll) and with
 * unblocked enemy strikes; it drops when you kill an enemy (the hero surges
 * forward). Reaches 1 -> the run is over. This is the DESIGN.md §4 loop
 * expressed as one value; the scene maps pressure to the hero's screen x.
 */

// Tile-type ids — mirror src/board.ts / DESIGN.md §3.
export const SWORD = 0;
export const STAFF = 1;
export const SHIELD = 2;
export const KEY = 3;
export const TREASURE = 4;
export const WOOD = 5;
export const ORE = 6;
export const POTION = 7; // rare board gift: tapped (not matched) to drink

/** Which slime sheet the scene dresses the foe in (boss = the Cindermage). */
export type EnemyVariant = "green" | "blue" | "dark" | "boss";
/**
 * Defenses — the reason tile CHOICE matters (DESIGN: physical vs spell):
 *   hide — iron hide: swords glance off (x0.5), spells burn through (x1.5)
 *   ward — spell ward: magic fizzles (x0.5), steel bites deep (x1.5)
 *   none — plain flesh, everything lands true
 */
export type Defense = "none" | "hide" | "ward";

export interface Enemy {
  kind: "orc" | "boss";
  variant: EnemyVariant;
  defense: Defense;
  hp: number;
  maxHp: number;
  power: number; // pressure a full strike adds, before block
}

export interface Resources {
  wood: number;
  ore: number;
  treasure: number;
  keys: number;
}

export interface RunState {
  pressure: number; // 0 safe .. 1 dead
  block: number; // shield stockpile, mitigates the next strike (pressure units)
  enemy: Enemy | null;
  killed: number; // enemies defeated this run
  score: number;
  resources: Resources;
  over: boolean;
  swordBonus: number; // forge upgrades: extra damage folded into the first sword hit
  // ---- run-item buffs (src/items.ts; the scene sets these, we honour them) ----
  whetstone: number; // charges: sword matches that count as full 5-match combos
  surgeMult: number; // War Horn: multiplies the per-kill pressure surge (default 1)
  resMult: number; // Merchant's Ledger: multiplies wood/ore/treasure gains (default 1)
}

// --- tuning knobs (easy to expose as upgrades later, DESIGN.md §5) ---
// Sword damage is split into swings so a bigger match reads as a combo: a 3-match
// is one solid hit; each extra sword (up to 2) tacks on a small follow-up hit.
export const SWORD_MAIN = 5; // first swing — a 3-match
export const SWORD_EXTRA = 2; // each extra sword beyond 3 (max 2 follow-ups)
// Staff matches are their own act now: the hero CASTS, a fireball flies.
// Firebolt (3) / Fireball (4) / Pyroclasm (5+, also sets the foe burning).
export const SPELL_DMG: Record<3 | 4 | 5, number> = { 3: 9, 4: 14, 5: 20 };
export const SPELL_EXTRA = 3; // each staff tile beyond 5 (double runs in one cascade)
export const SPELL_BURN_TIER = 5; // a Pyroclasm leaves the foe burning (scene applies it)
// Defense multipliers — resisted hits still land SOMETHING (min 1 per swing).
export const RESIST_MULT = 0.5;
export const WEAK_MULT = 1.5;
export const BLOCK_PER_SHIELD = 0.05; // pressure absorbed per shield tile
// A PERFECT block (guard soaks the whole strike) also shoves the foe back —
// shields stop being purely defensive and win ground.
export const BLOCK_PUSHBACK = 0.05;
// The potion tile, drunk on tap: a stride of ground regained + a swig of guard.
export const POTION_GROUND = 0.12;
export const POTION_GUARD = 0.1; // two shields' worth
export const ADVANCE_PER_KILL = 0.3; // pressure removed (hero surge) per kill
// Damage per match now runs 5 / 7 / 9 (for 3 / 4 / 5+ swords). Base HP sits ~one
// strong combo so early foes fall fast; a couple of small matches also do it.
export const ENEMY_BASE_HP = 9;
export const ENEMY_HP_GROWTH = 3; // +hp per prior kill
export const ENEMY_BASE_POWER = 0.075;
export const ENEMY_POWER_GROWTH = 0.015;

// --- bosses: every Nth foe is the Cindermage (DESIGN.md §4) --------------------
// A boss fight has no intermediate kills to relieve pressure, so the scroll
// eases while he's engaged (the world holds its breath) and the kill pays a
// bigger surge + a treasure bounty (applied scene-side).
export const BOSS_EVERY = 10;
export const BOSS_HP_MULT = 1.8;
export const BOSS_SCROLL_MULT = 0.5;
export const BOSS_BOUNTY = 8; // treasure showered on the kill
export const BOSS_SURGE = 0.2; // extra pressure relief on top of ADVANCE_PER_KILL

/** What the defense does to each damage school. */
export function physMult(d: Defense): number {
  return d === "hide" ? RESIST_MULT : d === "ward" ? WEAK_MULT : 1;
}
export function spellMult(d: Defense): number {
  return d === "ward" ? RESIST_MULT : d === "hide" ? WEAK_MULT : 1;
}

const VARIANT_DEFENSE: Record<EnemyVariant, Defense> = {
  green: "none", // plain flesh — the tutorial-friendly slime
  blue: "ward", // arcane sheen: spells fizzle, steel bites deep
  dark: "hide", // iron hide: swords glance off, spells burn through
  boss: "ward", // the Cindermage's wards drink magic — bring a blade
};

export function makeEnemy(killed: number, rand: () => number = Math.random): Enemy {
  const boss = (killed + 1) % BOSS_EVERY === 0;
  // deeper pools mirror the old scene-side variant roll: green early, the
  // warded blue joins mid-run, the iron-hided dark slime rules the deeps
  const pool: EnemyVariant[] = killed < 3 ? ["green"] : killed < 8 ? ["green", "blue"] : ["blue", "dark"];
  const variant: EnemyVariant = boss ? "boss" : pool[(rand() * pool.length) | 0];
  const hp = Math.round((ENEMY_BASE_HP + killed * ENEMY_HP_GROWTH) * (boss ? BOSS_HP_MULT : 1));
  return {
    kind: boss ? "boss" : "orc",
    variant,
    defense: VARIANT_DEFENSE[variant],
    hp,
    maxHp: hp,
    power: ENEMY_BASE_POWER + killed * ENEMY_POWER_GROWTH,
  };
}

export function newRun(swordBonus = 0): RunState {
  return {
    pressure: 0,
    block: 0,
    enemy: makeEnemy(0),
    killed: 0,
    score: 0,
    resources: { wood: 0, ore: 0, treasure: 0, keys: 0 },
    over: false,
    swordBonus,
    whetstone: 0,
    surgeMult: 1,
    resMult: 1,
  };
}

/** "resist" = the defense soaked it, "weak" = it tore through, "none" = plain. */
export type DamageMod = "none" | "resist" | "weak";

export interface SpellOutcome {
  dmg: number; // post-defense damage the fireball lands
  tier: 3 | 4 | 5; // Firebolt / Fireball / Pyroclasm — drives the projectile's size
  mod: DamageMod;
  burn: boolean; // Pyroclasm leaves the foe burning (scene applies the DoT)
}

export interface MatchOutcome {
  damage: number; // total (melee + spell), post-defense
  hits: number[]; // per-SWING melee damage, matching the combo animation
  swordMod: DamageMod; // how the foe's defense treated the steel
  spell: SpellOutcome | null; // the cast, if staff tiles matched
  killed: boolean;
  gained: Resources;
  swords: number; // EFFECTIVE sword count driving the swing animation (whetstone can raise it)
}

/** Split a sword match into per-swing damage: 3 -> [5], 4 -> [5,2], 5+ -> [5,2,2]. */
export function swordHits(swords: number): number[] {
  if (swords < 3) return [];
  const extras = Math.min(2, swords - 3);
  return [SWORD_MAIN, ...Array<number>(extras).fill(SWORD_EXTRA)];
}

function clampPressure(s: RunState) {
  if (s.pressure < 0) s.pressure = 0;
  if (s.pressure >= 1) {
    s.pressure = 1;
    s.over = true;
  }
}

/**
 * Deal direct damage to the current enemy (matches, item blasts, burns all
 * funnel through here). Handles score, the kill, and the forward surge.
 */
export function dealDamage(s: RunState, damage: number): boolean {
  if (!s.enemy || damage <= 0) return false;
  s.enemy.hp -= damage;
  s.score += damage * 5;
  if (s.enemy.hp <= 0) {
    s.enemy = null;
    s.killed += 1;
    s.score += 100;
    s.pressure -= ADVANCE_PER_KILL * s.surgeMult; // surge forward, away from the skull
    clampPressure(s);
    return true;
  }
  return false;
}

/** Apply one cascade's cleared-tile counts. Returns what happened (for juice). */
export function applyMatches(s: RunState, counts: Record<number, number>): MatchOutcome {
  const n = (t: number) => counts[t] ?? 0;
  const mult = Math.max(1, s.resMult); // Merchant's Ledger doubles the haul (keys stay 1:1 — they're tension)
  const gained: Resources = { wood: n(WOOD) * mult, ore: n(ORE) * mult, treasure: n(TREASURE) * mult, keys: n(KEY) };

  s.block += n(SHIELD) * BLOCK_PER_SHIELD;
  s.resources.wood += gained.wood;
  s.resources.ore += gained.ore;
  s.resources.treasure += gained.treasure;
  s.resources.keys += gained.keys;
  s.score += (gained.wood + gained.ore + gained.treasure + gained.keys) * 2;

  const defense: Defense = s.enemy?.defense ?? "none";

  // ---- steel: Wren's Whetstone can turn any sword match into a full combo ----
  let swords = n(SWORD);
  if (swords >= 3 && s.whetstone > 0) {
    s.whetstone--;
    swords = Math.max(swords, 5);
  }
  const rawHits = swordHits(swords);
  if (rawHits.length && swords >= 3) rawHits[0] += s.swordBonus; // forged edge bites harder
  const pM = physMult(defense);
  const hits = rawHits.map((h) => Math.max(1, Math.round(h * pM))); // even glancing blows land 1
  const swordMod: DamageMod = !hits.length || pM === 1 ? "none" : pM < 1 ? "resist" : "weak";

  // ---- the cast: staff tiles fire a Firebolt / Fireball / Pyroclasm ----------
  const staves = n(STAFF);
  let spell: SpellOutcome | null = null;
  if (staves >= 3) {
    const tier: 3 | 4 | 5 = staves >= 5 ? 5 : staves === 4 ? 4 : 3;
    const raw = SPELL_DMG[tier] + Math.max(0, staves - 5) * SPELL_EXTRA;
    const sM = spellMult(defense);
    spell = {
      dmg: Math.max(1, Math.round(raw * sM)),
      tier,
      mod: sM === 1 ? "none" : sM < 1 ? "resist" : "weak",
      burn: tier >= SPELL_BURN_TIER,
    };
  }

  const damage = hits.reduce((a, b) => a + b, 0) + (spell?.dmg ?? 0);
  const killed = dealDamage(s, damage);

  return { damage, hits, swordMod, spell, killed, gained, swords: n(SWORD) > 0 ? swords : 0 };
}

/**
 * A raw spell blast from outside the board (Stormcall etc.) — runs through the
 * foe's ward like any other magic. Returns what landed.
 */
export function castBlast(s: RunState, raw: number): { dmg: number; mod: DamageMod; killed: boolean } {
  const sM = spellMult(s.enemy?.defense ?? "none");
  const dmg = Math.max(1, Math.round(raw * sM));
  const killed = dealDamage(s, dmg);
  return { dmg, mod: sM === 1 ? "none" : sM < 1 ? "resist" : "weak", killed };
}

/** Spawn the next enemy — the scene calls this after the death animation. */
export function spawnNext(s: RunState): Enemy | null {
  if (s.over) return null;
  s.enemy = makeEnemy(s.killed);
  return s.enemy;
}

/**
 * The current enemy strikes: block absorbs first, remainder shoves pressure.
 * A PERFECT block answers back — the guard turns the blow and shoves the foe,
 * so the hero gains BLOCK_PUSHBACK of ground instead of just standing firm.
 */
export function enemyStrike(s: RunState): number {
  if (s.over || !s.enemy) return 0;
  const raw = s.enemy.power;
  const absorbed = Math.min(s.block, raw);
  s.block -= absorbed;
  const net = raw - absorbed;
  s.pressure += net;
  if (absorbed > 0 && net <= 0) s.pressure = Math.max(0, s.pressure - BLOCK_PUSHBACK); // the riposte shove
  clampPressure(s);
  return net;
}

/** Drink a tapped potion tile: regain ground, raise the guard, small score nip. */
export function drinkPotion(s: RunState): void {
  if (s.over) return;
  s.pressure = Math.max(0, s.pressure - POTION_GROUND);
  s.block += POTION_GUARD;
  s.score += 30;
  clampPressure(s);
}

/** Constant scroll pressure for a frame; `dp` is the pressure to add. */
export function scroll(s: RunState, dp: number): void {
  if (s.over || dp <= 0) return;
  s.pressure += dp;
  clampPressure(s);
}
