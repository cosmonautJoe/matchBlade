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

export interface Enemy {
  kind: "orc";
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
}

// --- tuning knobs (easy to expose as upgrades later, DESIGN.md §5) ---
// Sword damage is split into swings so a bigger match reads as a combo: a 3-match
// is one solid hit; each extra sword (up to 2) tacks on a small follow-up hit.
export const SWORD_MAIN = 5; // first swing — a 3-match
export const SWORD_EXTRA = 2; // each extra sword beyond 3 (max 2 follow-ups)
export const STAFF_DMG = 3; // magic, folded into the first swing
export const BLOCK_PER_SHIELD = 0.05; // pressure absorbed per shield tile
export const ADVANCE_PER_KILL = 0.3; // pressure removed (hero surge) per kill
// Damage per match now runs 5 / 7 / 9 (for 3 / 4 / 5+ swords). Base HP sits ~one
// strong combo so early foes fall fast; a couple of small matches also do it.
export const ENEMY_BASE_HP = 9;
export const ENEMY_HP_GROWTH = 3; // +hp per prior kill
export const ENEMY_BASE_POWER = 0.075;
export const ENEMY_POWER_GROWTH = 0.015;

export function makeEnemy(killed: number): Enemy {
  const hp = ENEMY_BASE_HP + killed * ENEMY_HP_GROWTH;
  return { kind: "orc", hp, maxHp: hp, power: ENEMY_BASE_POWER + killed * ENEMY_POWER_GROWTH };
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
  };
}

export interface MatchOutcome {
  damage: number;
  hits: number[]; // per-swing damage, matching the combo animation (for floating numbers)
  killed: boolean;
  gained: Resources;
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

/** Apply one cascade's cleared-tile counts. Returns what happened (for juice). */
export function applyMatches(s: RunState, counts: Record<number, number>): MatchOutcome {
  const n = (t: number) => counts[t] ?? 0;
  const gained: Resources = { wood: n(WOOD), ore: n(ORE), treasure: n(TREASURE), keys: n(KEY) };

  s.block += n(SHIELD) * BLOCK_PER_SHIELD;
  s.resources.wood += gained.wood;
  s.resources.ore += gained.ore;
  s.resources.treasure += gained.treasure;
  s.resources.keys += gained.keys;
  s.score += (gained.wood + gained.ore + gained.treasure + gained.keys) * 2;

  const hits = swordHits(n(SWORD));
  if (hits.length && n(SWORD) >= 3) hits[0] += s.swordBonus; // forged edge bites harder
  const staffDmg = n(STAFF) * STAFF_DMG;
  if (staffDmg > 0) {
    if (hits.length) hits[0] += staffDmg;
    else hits.push(staffDmg); // staff-only: one magic hit
  }
  const damage = hits.reduce((a, b) => a + b, 0);
  let killed = false;
  if (s.enemy && damage > 0) {
    s.enemy.hp -= damage;
    s.score += damage * 5;
    if (s.enemy.hp <= 0) {
      killed = true;
      s.enemy = null;
      s.killed += 1;
      s.score += 100;
      s.pressure -= ADVANCE_PER_KILL; // surge forward, away from the skull
      clampPressure(s);
    }
  }

  return { damage, hits, killed, gained };
}

/** Spawn the next enemy — the scene calls this after the death animation. */
export function spawnNext(s: RunState): Enemy | null {
  if (s.over) return null;
  s.enemy = makeEnemy(s.killed);
  return s.enemy;
}

/** The current enemy strikes: block absorbs first, remainder shoves pressure. */
export function enemyStrike(s: RunState): number {
  if (s.over || !s.enemy) return 0;
  const raw = s.enemy.power;
  const absorbed = Math.min(s.block, raw);
  s.block -= absorbed;
  const net = raw - absorbed;
  s.pressure += net;
  clampPressure(s);
  return net;
}

/** Constant scroll pressure for a frame; `dp` is the pressure to add. */
export function scroll(s: RunState, dp: number): void {
  if (s.over || dp <= 0) return;
  s.pressure += dp;
  clampPressure(s);
}
