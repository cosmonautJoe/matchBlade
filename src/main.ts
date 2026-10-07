/**
 * matchBlade — game scene.
 *
 * Two coupled systems:
 *   1. A classic swap match-3 board (bottom) — model in board.ts.
 *   2. a side-scrolling world runner (top) — pure state in run.ts. The backdrop
 *      is a swappable "world" (grass first); the runner/combat logic is shared.
 *
 * Runner feel (DESIGN.md §4): the hero holds the line on the left; enemies march
 * in from the right. While an enemy is engaged, a constant leftward scroll drags
 * the hero toward the skull, and every enemy strike shoves him further left.
 * Matching sword/staff tiles damages the enemy; killing it surges the hero
 * forward (pressure drops) and the next foe advances. Pressure hits 1 -> the run
 * ends at the skull.
 *
 * The board and runner meet in resolve(): each cascade's cleared-tile counts are
 * fed to run.applyMatches() — swords/staves -> damage, shields -> block,
 * wood/ore/treasure/keys -> stockpiled resources.
 */

import Phaser from "phaser";
import { buzz, haptic, initHaptics, stopHaptics } from "./haptics";
import { TILE_KEYS, TILE_TEXTURE_DENSITY, preloadTileArt, prepareTileArt } from "./tile-art";
import { tileClearBurst, tileVisual, liftTile, settleTile, decoratePotion } from "./tile-feedback";
import { TileShatter } from "./tile-shatter";
import { tileEffectsEnabled, TILE_EFFECTS_CHANGED } from "./tile-effects";
import { TileSwapPreview, dragSwapTarget } from "./tile-drag";
import { newEmpowered, planEmpowered, randomEmpower, itemPowerBonuses, reflowEmpowered, type EmpoweredState } from "./empowered";
import { decorateEmpowered, empoweredBurst, empoweredGather } from "./empowered-art";
import { newRescueState, rollRescue, companionById, companionKillRewards, rescueOptions, payForRescue, type RescueState } from "./companions";
import { showCompanionRescue } from "./companion-view";
import { offerRoadFork, chooseRoad, newRoadFork, roadOptions, ROAD_FORK_BONUS } from "./road-fork";
import { showRoadFork } from "./road-fork-view";
import { RoadScenery, preloadRoadScenery } from "./road-scenery";
import { ForestAmbushBrush, ambushSplash } from "./forest-ambush-art";
import { createCombatReadout } from "./combat-readout";
import { createActiveEffects, activeItemEffects } from "./active-effects";
import { preloadPlayer, createPlayerAnimations, PLAYER_TEXTURE, PLAYER_DENSITY, PLAYER_ORIGIN } from "./player-art";
import {
  TYPES,
  EMPTY,
  type Coord,
  makeInitialGrid,
  randomType,
  findMatches,
  findHint,
  swap,
  hasPossibleMove,
  reflowBoard,
  type BoardLayouts,
} from "./board";
import {
  type RunState,
  type Enemy,
  type MatchOutcome,
  type SpellOutcome,
  type DamageMod,
  type Defense,
  SWORD,
  STAFF,
  SHIELD,
  KEY,
  TREASURE,
  WOOD,
  ORE,
  POTION,
  newRun,
  applyMatches,
  dealDamage,
  castBlast,
  ambushRear,
  FOREST_AMBUSH_REWARD,
  drinkPotion,
  enemyStrike,
  guardCost,
  pierceStrike,
  spawnNext,
  scroll,
  roadScrollRate,
  attackInterval,
  BOSS_EVERY,
  BOSS_SCROLL_MULT,
  BOSS_BOUNTY,
  BOSS_SURGE,
  RUN_COMPLETE_AT,
} from "./run";
import {
  type ItemDef,
  type ChestPull,
  itemById,
  itemUseReason,
  rollItem,
  rollChestPulls,
  TIER_COLORS,
  STORMCALL_DMG,
  AMBUSH_FLASK_DMG,
  WARHORN_SECS,
  WAYSTONE_SECS,
  BULWARK_BLOCK,
  BURN_DPS,
  BURN_SECS,
  SPURS_STRIKE_MS,
  HEARTH_PRESSURE,
  LEDGER_SECS,
  WHETSTONE_CHARGES,
  SALVE_MULT,
  BELL_CHARGES,
  PAN_EXTRA_PULLS,
  SAPPER_RADIUS,
} from "./items";
import { CampScene } from "./camp";
import { MenuScene } from "./menu";
import { TitleScene } from "./title";
import { sfxV, ambV, musicV, audioSettings, setAudioSettings, setSoundLevel } from "./audio";
import { type MetaState, loadMeta, saveMeta, bankRun, questById, questProgress, currentQuests, forgeCap, prepareCampProgress, acknowledgeProgress, allQuestsDone } from "./meta";
import { Tutorial } from "./tutorial";
import { showResults } from "./results";
import { readCheckpoint, type RunCheckpoint } from "./run-save";
import { malgrimArena, malgrimToken } from "./malgrim-art";
import { gorrachArena, gorrachToken, gorrachTimingFrame } from "./gorrach-art";
import { bossArenaArt, frostCrystal, type BossTheme } from "./boss-arena-art";
import { iceCracks, frozenTile, iceBurst, frostSpike, frostHeart, frostMist, frozenBoardArt } from "./frost-art";
import { forestBoardArt } from "./forest-board-art";
import { delveBoardArt, DELVE_FRAME_FOOTER } from "./delve-board-art";
import { createBossFinale } from "./boss-finales";
import { BOSS_FOR_BIOME, SLIME_SCALES, SLIME_GAPS, restoreSlimeProgress, slimeBeats, type SlimeProgress } from "./slime-boss";
import { createSlimeBossArena } from "./slime-boss-arena";
import { showChestReward } from "./chest-reward";
import { restoreZoneFeatures, seedZonePatches, resolveZoneMatches, iceLocked, tapIce, thawIfStuck, reflowIce, useZoneSupply } from "./zone-features";

// ---- layout ---------------------------------------------------------------
// The centre column (runner lane over the match board) is authored in these fixed
// "design" coordinates and lives inside `centerBox`, which layout() scales + centres
// to the live viewport. Side panels (resources / item slots) fill the leftover width,
// so the game fills any landscape screen — phone or desktop — with no letterboxing.
const TILE = 92;
const GRID_W = 7 * TILE; // fixed runner design width
const GRID_H = 7 * TILE; // default portrait / chest presentation
const PADIN = 8; // compact inset keeps more room for the board
// Keep the runner as a shallow cinematic strip so the puzzle owns most of a
// landscape phone. The whole centre can then scale up without stretching tiles.
const LANE_H = 300; // a readable battle scene above the square mobile board
const GRID_GAP = 10; // combat sits immediately above the tiles

const LANE_Y = PADIN;
const GRID_X = PADIN; // board / lane left inset (design-local)
const GRID_Y = LANE_Y + LANE_H + GRID_GAP; // board top (design-local)
const CENTER_DW = GRID_W + PADIN * 2; // runner design width
const CENTER_DH = GRID_Y + GRID_H + PADIN; // centre-column design height
const CXC = CENTER_DW / 2; // centre-column horizontal centre (design-local)
const UI_W = GRID_W; // lane inner width

const SLOT_N = 6; // item slots down the right panel

// treasure chests — the Vampire-Survivors-style dopamine blast (DESIGN.md §4)
const CHEST_EVERY = 3; // a chest rolls in after every Nth kill
const CHEST_KEY_COST = 1; // banked keys needed to pop it
const HOLD_TIP_MS = 380; // touch: press-and-hold this long on a slot to read its tooltip

/** One HUD item slot: frame + contents (def null = empty). */
interface ItemSlotUI {
  x: number;
  y: number;
  s: number;
  bg: Phaser.GameObjects.Rectangle;
  inner: Phaser.GameObjects.Rectangle;
  plus: Phaser.GameObjects.Text;
  icon: Phaser.GameObjects.Text | null;
  item: ItemDef | null;
}

// lane geometry (design-local)
const FLOOR_H = 42; // thicker ground makes the scrolling terrain easier to read
const GROUND_Y = LANE_Y + LANE_H - FLOOR_H; // feet / floor-surface line
// Foot fraction measured from each sheet (lowest opaque pixel) so they sit on the ground.
const HERO_ORIGIN = PLAYER_ORIGIN;
const SLIME_ORIGIN = 0.656; // slime base at y41/64
const SKULL_X = PADIN + 28; // death marker at the far left of the lane
const SAFE_X = PADIN + GRID_W * 0.43;
const ENGAGE_GAP = 160; // combat spacing inside the compact runner strip
const ENTER_X = CENTER_DW + 80; // enemies walk in from off the right
const HERO_SCALE = 3.15;
const SLIME_SCALE = 3.15;
// boss: the Cindermage (Evil Wizard pack, CC0) — 150x150 frames, feet at y101, faces right natively
const BOSS_SCALE = 2.15;
const BOSS_ORIGIN = 0.675;

// How each creature variant is dressed on the lane. animPrefix drives the
// `${prefix}-{idle,walk,hurt,attack,death}` keys built in buildAnims; scale/
// origin are measured per sheet (foot fraction). faceLeft flips right-facing
// art to look up-lane; fakeDeath means "no death frames — topple + fade in
// killOrc". flat means "not a slime" (skip the squish-in sfx).
/** `hitAt` is WHERE in the attack animation the blow connects (0..1 of its length). */
type CreatureRig = { prefix: string; idleTex: string; scale: number; origin: number; faceLeft?: boolean; fakeDeath?: boolean; flat?: boolean; bob?: boolean; lunge?: boolean; hover?: number; barOff?: number; hitAt?: number };
type AmbushActor = { sprite: Phaser.GameObjects.Sprite; enemy: Enemy; rig: CreatureRig;
  hpBg: Phaser.GameObjects.Rectangle; hpBar: Phaser.GameObjects.Rectangle };
const CREATURE_RIG: Record<string, CreatureRig> = {
  green: { prefix: "orc", idleTex: "slime-idle", scale: SLIME_SCALE, origin: SLIME_ORIGIN },
  blue: { prefix: "orc2", idleTex: "slime2-idle", scale: SLIME_SCALE, origin: SLIME_ORIGIN },
  dark: { prefix: "orc3", idleTex: "slime3-idle", scale: SLIME_SCALE, origin: SLIME_ORIGIN },
  // 48×32 charger — faces LEFT natively (toward the hero), so no flip. Real
  // pawing idle + gallop; the attack LUNGES so the gallop rides real forward
  // motion into a gore. Death topples (no death frames in this pack). barOff
  // lifts the HP bar clear of the boar's back (it's low and wide, not tall).
  boar: { prefix: "boar", idleTex: "boar-idle", scale: 2.7, origin: 0.97, fakeDeath: true, flat: true, lunge: true, barOff: 82, hitAt: 0.7 },
  // Monster pack — 150px, full anim sets, face RIGHT natively so flip to face
  // the hero. Real death frames (no fake topple). foot y101/150 → origin 0.673.
  // The goblin's visible body is 36px tall versus the hero's 26px. At 2.6 it
  // towered over him; 2.0 puts both silhouettes at roughly the same height.
  goblin: { prefix: "goblin", idleTex: "goblin-idle", scale: 2.0, origin: 0.673, faceLeft: true, flat: true, barOff: 82, hitAt: 0.62 },
  mushroom: { prefix: "mushroom", idleTex: "mushroom-idle", scale: 2.7, origin: 0.673, faceLeft: true, flat: true, barOff: 104, hitAt: 0.6 },
  // NB: the skeleton is drawn much larger in-frame than its packmates (45x51 of
  // content vs the goblin's 33x36), so it needs a LOWER scale to stand at a
  // comparable height — at 2.6 it towered ~2x the hero.
  skeleton: { prefix: "skeleton", idleTex: "skeleton-idle", scale: 1.9, origin: 0.673, faceLeft: true, flat: true, barOff: 104, hitAt: 0.62 },
  // the eye FLIES — hover it off the ground with a gentle float (spawnOrc)
  eye: { prefix: "eye", idleTex: "eye-idle", scale: 2.4, origin: 0.62, faceLeft: true, flat: true, hover: 42, barOff: 104 },
  // the glacial pass: a frozen skeleton (recoloured) and a hovering ice elemental
  frostskel: { prefix: "frostskel", idleTex: "frostskel-idle", scale: 1.9, origin: 0.673, faceLeft: true, flat: true, barOff: 104, hitAt: 0.62 },
  // NB: the generated frames draw a much larger creature than the bought pack
  // (78x93px of content vs the goblin's 33x36), so its scale is far lower to
  // sit at a comparable on-screen size. Foot fraction measured at 0.760.
  icelem: { prefix: "icelem", idleTex: "icelem-idle", scale: 1.05, origin: 0.76, faceLeft: true, flat: true, barOff: 104 },
};
const BOSS_ENGAGE_GAP = 220; // the robe and fire breath still need a wider stance
const BOSS_NAME = "MALGRIM";

// =============================================================================
// THE BOSS GRAMMAR — three colours, one rule: HOW LONG YOU TOUCH.
// =============================================================================
// Every warden speaks this, so what you learn fighting Gorrach in the plains
// still reads in the glacial pass. The fights differ in theme and staging, not
// in vocabulary — the Undertale trick, where colour IS the rule.
//
//   GOLD  ●  TOUCH ONCE   — tap it. A discrete strike.
//   BLUE  ╱  CUT IT       — swipe across it, the way its arrow points.
//   RED   ✖  NEVER TOUCH   — a lie sitting among the gold (tapping burns you),
//                            or a hazard sweeping at you (get clear). Both
//                            resolve to "no contact", so red never needs
//                            re-teaching.
//
// GOLD and BLUE are both COMMITTED AT AN INSTANT — that is deliberate. An
// earlier pass made blue a press-and-hold and every blue stage died the same
// death: holding is passive (the only skill is when to stop), your finger sits
// on top of the thing you are meant to be watching, and three bosses ended up
// running the same "hold it, wait, let go" puzzle. A swipe keeps the timing
// commitment that makes the good stages good, and adds a direction to read.
const G_GOLD = 0xffd24a;
const G_GOLD_EDGE = 0xfff2b0;
const G_BLUE = 0x3aa8ff;
const G_RED = 0xe03a2a;
const G_RED_EDGE = 0xff9d6a;
// What a mistake costs in an arena, in enemy strikes. A strike is turned by
// guard if you have it and eats ground if you don't, so these scale with how
// well you played the board before the fight — which is the point.
//   MISS  — too slow, wrong way, whiffed: the ordinary cost of failing.
//   RED   — you touched the one thing the grammar says never to touch. The
//           colour has to mean something, so it costs double and locks you out.
// How fast the boss closes the gap the hero has lost (approach units/sec), and
// how quickly the hero walks off a knockback (px/sec).
const BOSS_CLOSE_RATE = 3.2;
const KNOCK_RECOVER = 46;
const KNOCK_MISS = 16; // px he reels on an ordinary miss...
const KNOCK_RED = 38; // ...and on a RED violation
const ARENA_MISS_STRIKES = 1;
const ARENA_RED_STRIKES = 2;
const ARENA_RED_LOCK_MS = 650; // and you are left open afterwards
const EARLY_SWING_LOCK_MS = 240; // shorter than any parry window on purpose: an early
// swing should cost you the beat, not forfeit the parry outright
// The kill punch-in. It fires on EVERY kill, which at one kill every few
// seconds is a lot of full-screen movement — so an ordinary kill gets barely a
// nudge and the punctuation is saved for a warden. (It used to be 1.035 for
// everything, but a bug stranded the camera and quietly suppressed most of
// them; fixing that made the real frequency visible for the first time.)
// Set PUNCH_KILL to 1 to switch ordinary kills off entirely.
const PUNCH_KILL = 1.015;
const PUNCH_BOSS = 1.05;
const TRAIL_LIFE_MS = 210; // how long a segment of the blade streak lingers
/** A drag must cover this much design-space before it counts as a cut. */
const SWIPE_MIN = 52;
/** ...and land within this many degrees of the arrow it was asked for. */
const SWIPE_TOL = 55;
type SwipeDir = "up" | "down" | "left" | "right";
const SWIPE_GLYPH: Record<SwipeDir, string> = { up: "↑", down: "↓", left: "←", right: "→" };
const SWIPE_ANGLE: Record<SwipeDir, number> = { right: 0, down: 90, left: 180, up: -90 };
/** Per-boss stage cards. Every warden is defeated after exactly three stages. */
type StageCard = { title: string; sub: string; taunt: string };
const BOSS_STAGES: Record<string, StageCard[]> = {
  malgrim: [
    { title: "STAGE 1 · TARGETS", sub: "● tap the GOLD images — ✖ leave the RED ones", taunt: "" },
    { title: "STAGE 2 · FALLING TARGETS", sub: "● tap GOLD — ╱ cut BLUE the way it points — ✖ let RED fall", taunt: "" },
    { title: "STAGE 3 · REFLECT", sub: "● tap GOLD at your guard — ✖ never swing at RED", taunt: "" },
  ],
  gorrach: [
    { title: "STAGE 1 · DODGE", sub: "✖ stay off the RED path — ● tap the GOLD as he passes", taunt: "" },
    { title: "STAGE 2 · COUNTER", sub: "╱ cut BLUE aside — ● tap GOLD to counter — ✖ RED is a feint", taunt: "" },
    { title: "STAGE 3 · TIMING", sub: "● tap on GOLD — ✖ never on RED — it all keeps moving", taunt: "" },
  ],
  hoarfrost: [
    { title: "STAGE 1 · BREAK THE ICE", sub: "● tap GOLD plates — ╱ cut BLUE ones — ✖ leave RED alone", taunt: "" },
    { title: "STAGE 2 · DODGE THE ICE", sub: "✖ drag clear of the RED — ● tap the GOLD warmth", taunt: "" },
    { title: "STAGE 3 · HIT THE CORE", sub: "✖ RED shards — ● tap the GOLD core through the gap", taunt: "" },
  ],
};
// Ward III is a RALLY, and it is built to crescendo. Each entry is one VOLLEY:
// `balls` fire in sequence `stagger` ms apart, and you must return every GOLD in
// the volley before it counts — one return no longer ends the exchange. `castMs`
// is each ball's flight time, `redChance` how often a ball after the first is the
// lie, `fake` a wind-up that throws nothing, and early/late tighten the window.
// It opens as a single slow serve and ends as a four-ball barrage.
type TennisShot = {
  castMs: number;
  balls?: number;
  redChance?: number;
  stagger?: number;
  fake?: number;
  early?: number;
  late?: number;
  restMs?: number;
  call?: string;
};
const TENNIS_SHOTS: TennisShot[] = [
  { castMs: 1350, restMs: 1000, call: "RETURN IT!" },
  { castMs: 1150, fake: 0.4, restMs: 900, call: "again, faster" },
  { castMs: 1000, balls: 2, redChance: 0.5, stagger: 320, restMs: 820, call: "TWO AT ONCE!" },
  { castMs: 880, balls: 3, redChance: 0.4, stagger: 265, fake: 0.3, early: 125, late: 100, restMs: 720, call: "HE OPENS UP — THREE!" },
  { castMs: 760, balls: 4, redChance: 0.35, stagger: 205, early: 110, late: 88, restMs: 600, call: "“BURN WITH ME!”" },
];
// fireball tennis timing (ward III)
const TENNIS_EARLY_MS = 140; // the tap window opens this early before the ball meets the guard
const TENNIS_LATE_MS = 110; // ...and forgives this much lateness
const TENNIS_WHIFF_LOCK_MS = 380; // a swing at nothing leaves you open — mashing loses
// ---- GORRACH'S GORING RUN (plains boss arena) ------------------------------
// Three horns, three different games, then victory.
//   HORN I   THE CHARGE    — three trampled paths. He paws, one path lights
//                            RED, then he charges it. Tap another path to leap
//                            clear. The telegraph shortens; the last charge
//                            lights TWO paths and only one is safe.
//   HORN II  THE LABYRINTH — he stamps a route through the standing stones.
//                            Repeat it. Round 3 must be repeated BACKWARDS.
//   HORN III LOCK HORNS    — a sweeping marker over a shrinking purchase band.
//                            Tap inside it to shove him back a notch; five
//                            notches break him. Earned shoves stay secured.
const GORE_LANES = 3;
const GORE_CHARGES: { tell: number; run: number; blind: number }[] = [
  { tell: 950, run: 520, blind: 1 }, // blind = how many paths light up
  { tell: 700, run: 440, blind: 1 },
  { tell: 560, run: 380, blind: 2 }, // two lit, one lie — read them both
];
const ROPE_ROUNDS = 3; // hauls needed to break Horn II
// TURN HIS AXE. `windup` is the whole swing; only the last `window` ms of it
// can be answered. `reveal` is how far through he shows the colour, so a low
// number is kinder. `roam` scatters the mark, `prompts` throws several at once.
// Tuning note, learned the hard way: `window` must stay comfortably above human
// reaction (~250ms) once you ALSO have to read a colour, and `reveal` has to
// leave real thinking time before the window opens. A 250ms window behind a
// late reveal is the floor, not a target. On the doubled round keep `stagger`
// larger than `window` so the two marks resolve in sequence instead of
// overlapping — two simultaneous windows is a different (and unfair) game.
const PARRY_ROUNDS: { need: number; windup: number; window: number; reveal: number; red: number; prompts: number; stagger?: number; rest: number; roam: boolean }[] = [
  { need: 3, windup: 1400, window: 520, reveal: 0.32, red: 0.2, prompts: 1, rest: 640, roam: false },
  { need: 4, windup: 1200, window: 440, reveal: 0.38, red: 0.25, prompts: 1, rest: 560, roam: true },
  { need: 5, windup: 1050, window: 360, reveal: 0.42, red: 0.3, prompts: 2, stagger: 520, rest: 500, roam: true },
];
const HORNS_NOTCHES = 5; // shoves needed to break the lock
const HORNS_MAX_REDS = 2;
// A gentle ramp: broad gold windows, slow drift and time for several passes.
// Five successful shoves are cumulative; a mistake never removes one.
// Widths are fractions of the rail; sweep is milliseconds in one direction.
const HORNS_STEPS: { gold: number; red: number; reds: number; sweep: number; drift: number; clock: number }[] = [
  { gold: 0.28, red: 0.09, reds: 1, sweep: 1600, drift: 0, clock: 9000 },
  { gold: 0.26, red: 0.09, reds: 1, sweep: 1500, drift: 0.2, clock: 8500 },
  { gold: 0.24, red: 0.10, reds: 1, sweep: 1400, drift: 0.3, clock: 8000 },
  { gold: 0.22, red: 0.10, reds: 2, sweep: 1350, drift: 0.4, clock: 8000 },
  { gold: 0.20, red: 0.10, reds: 2, sweep: 1300, drift: 0.5, clock: 7500 },
];
// ---- THE THREE RIMES (snow boss arena) -------------------------------------
//   RIME I   BREAK THE ICE   — he seals you in. Frost plates crust the arena,
//                              three taps each; new ones keep forming and the
//                              freeze meter fills FASTER the more are alive.
//   RIME II  COUNTER-SIGILS  — he casts a rune; tap its OPPOSITE. Then the
//                              MIRROR flips the rule and you tap the SAME one.
//   RIME III THE FROZEN HEART— his core orbits behind a ring of shards with one
//                              gap. Strike only as the gap comes round.
const RIME_PLATES_TO_CLEAR = 12; // shatters needed (every 4 = one step)
const RIME_PLATE_TAPS = 3;
const RIME_FREEZE_MS = 15000; // the seal closes in this long with ONE plate alive
const RIME_PLATE_SPAWN_MS = 1250; // a fresh plate crusts over this often
const RIME_MAX_PLATES = 7;
const HEART_HITS = 4; // clean core strikes that break the last rime
const HEART_SHARDS = 5;
const HEART_SPIN_FROM = 95; // deg/sec at the first hit...
const HEART_SPIN_TO = 215; // ...and after the third
const HEART_GAP_FROM = 40; // half-width (deg) of the opening, first hit...
const HEART_GAP_TO = 19; // ...and last
const HEART_LOCK_MS = 700; // Hit blocked · wait for the gap — you're open this long

// ---- the zone bosses -------------------------------------------------------
// Every road has its own warden, and each one is a DIFFERENT game — the fight
// is a mode break, not a bigger slime. A def carries the lane dressing (sheet
// prefix, scale, foot fraction, name banner) and how many minigame steps its
// arena is worth (the boss bar drains against that total).
//   forest           — MOSS SLIME  : one giant, two halves, four little slimes
//   dungeon          — MALGRIM     : the Infernal Shell Game
//   plains           — GORRACH     : the Goring Run (mino_v1.1_free)
//   snow             — FROST GUARDIAN   : the Three Rimes (Frost_Guardian)
type BossDef = {
  key: string; // anim-key prefix — `${key}-{idle,walk,attack,hurt,death}`
  name: string;
  scale: number;
  origin: number; // foot fraction, measured by scripts/gen_bosses.py
  gap: number; // engage distance (bigger silhouettes need more room)
  faceLeft: boolean; // TRUE only if the pack faces RIGHT natively and needs flipping to
  // glare up-lane at the hero. The Cindermage does; the minotaur and the
  // guardian are already drawn facing left, so flipping them turned their backs.
  hasDeath: boolean; // false = no death frames, topple + fade instead
  hasHurt: boolean; // false = flash-tint instead of a hurt anim
  steps: number; // total arena steps — the boss bar drains 1/steps at a time
  wardMark: string; // the glyph on his bar — every boss carries run.ts's "ward" defense
  nameTint: [number, number, number, number];
  veil: number; // the colour the lane bleeds while he approaches
  accent: string; // notice colour for his lines
  arena: "shells" | "goring" | "rimes" | "slime";
};
const BOSS_DEFS: Record<string, BossDef> = {
  slime: {
    key: "slimeboss", name: "MOSS SLIME", scale: SLIME_SCALES[0], origin: .625, gap: SLIME_GAPS[0],
    faceLeft: false, hasDeath: true, hasHurt: true, steps: 10, wardMark: "",
    nameTint: [0xf2ecc0, 0xc4e99a, 0x8ac075, 0x518958], veil: 0x173523, accent: "#c8e69e", arena: "slime",
  },
  malgrim: {
    key: "boss", name: BOSS_NAME, scale: BOSS_SCALE, origin: BOSS_ORIGIN, gap: BOSS_ENGAGE_GAP,
    faceLeft: true, hasDeath: true, hasHurt: true, steps: 11, wardMark: "🛡🪄",
    nameTint: [0xfff2d0, 0xffd280, 0xf2903b, 0xc9581f], veil: 0x1a0505, accent: "#ff9d6a", arena: "shells",
  },
  gorrach: {
    // Minotaur — 288x160 frames, content 108px tall, feet at y144/160.
    key: "mino", name: "GORRACH", scale: 1.05, origin: 0.9, gap: 215,
    faceLeft: false, hasDeath: false, hasHurt: false, steps: 11, wardMark: "🛡🪄",
    nameTint: [0xffe8c8, 0xf0b070, 0xc2632c, 0x7a2f16], veil: 0x332312, accent: "#ffb06a", arena: "goring",
  },
  hoarfrost: {
    // Frost Guardian — 192x128 frames, content 92px tall, feet at y110/128.
    key: "frost", name: "FROST GUARDIAN", scale: 1.25, origin: 0.859, gap: 240,
    faceLeft: false, hasDeath: true, hasHurt: true, steps: 10, wardMark: "🛡🪄",
    nameTint: [0xf2fdff, 0xbfe8ff, 0x6fa8dd, 0x30538f], veil: 0x061424, accent: "#8ff4ff", arena: "rimes",
  },
};
/** Which warden holds which road. Unlisted roads fall back to the Cindermage. */
const bossForBiome = (biome: string) => BOSS_DEFS[BOSS_FOR_BIOME[biome] ?? "malgrim"];
const RAIN_CHANCE = 0.35; // some runs the sky weeps — ambience swaps + rain streaks
const DEATH_BODY_LEFT = 27; // original sprite's sideways fall
const HP_W = 70;

// ---- runner tuning (safe to tweak / turn into upgrades later) --------------
// spell casts (staff matches): the bolt leaves the staff partway into the cast,
// flies, and everything downstream (damage number, hurt, death) lands on impact
const CAST_LEAD_MS = 320;
const BOLT_FLIGHT_MS = 340;
// board<->lane stitching: matches launch FROM the tiles, the fight answers back
// ONTO the board — so the runner is felt even when the eye never leaves the puzzle
const STRIKE_TELE_MS = 700; // dread creeps over the board this long before a strike
const BLADE_FLIGHT_MS = 360; // spectral blades: matched sword tiles -> the foe
const VIGNETTE_FROM = 0.5; // start warning halfway toward the skull
const VIGNETTE_FULL = 0.8; // clearly warn while there is still room to recover
const VIGNETTE_MAX = 0.36; // soft scene tint with stronger red edges
const SPELL_BURN_SECS = 6; // a Pyroclasm (5-match) leaves the foe burning this long
const WALK_IN_MS = 850; // time for a new enemy to march into range
const TILE_SFX = 17; // number of tile-match sound variations (tile1..tileN)
const FACE = TILE - 8; // 84px face with a small gap between neighboring tiles
const WORLD_SCROLL = 170; // px/sec the world pans while the hero is running
const FLOOR_SCALE = 1.9; // readable grass and terrain detail on phones
const PARALLAX_SRC_H = 216; // source height of the parallax layers (both biome sets are 216 tall)
// Per-biome run backdrop: parallax layers back-to-front with scroll factors (0 = static ..
// 1 = foreground), plus the floor atlas + the ground-band crop [sx,sy,w,h]. meta.biome picks one.
type RunBiome = {
  parallax: { key: string; file: string; scroll: number }[];
  floorKey: string;
  floorFile: string;
  groundKey: string;
  crop: [number, number, number, number];
};
// Each road gets its own song (xDeviruchi, CC-BY). Unlisted roads walk out to
// the journey theme.
//   plains — And The Journey Begins     forest  — Exploring The Unknown
//   snow   — The Icy Cave               dungeon — Mysterious Dungeon
const ROAD_MUSIC: Record<string, string> = {
  plains: "music_journey",
  forest: "music_forest",
  snow: "music_snow",
  dungeon: "music_dungeon",
};

const RUN_BIOMES: Record<string, RunBiome> = {
  plains: {
    parallax: [
      { key: "grass-sky", file: "worlds/grass/sky.png", scroll: 0.04 },
      { key: "grass-clouds-mid", file: "worlds/grass/clouds_mid.png", scroll: 0.1 },
      { key: "grass-mtn-far", file: "worlds/grass/mountains_far.png", scroll: 0.16 },
      { key: "grass-mtn", file: "worlds/grass/mountains.png", scroll: 0.3 },
      { key: "grass-clouds-front", file: "worlds/grass/clouds_front.png", scroll: 0.24 },
      { key: "grass-hill", file: "worlds/grass/hill.png", scroll: 0.5 },
    ],
    floorKey: "grass-floor",
    floorFile: "worlds/grass/floor.png",
    groundKey: "grass-ground",
    crop: [16, 0, 64, 96],
  },
  forest: {
    parallax: [
      { key: "forest-sky", file: "worlds/forest/plx1.png", scroll: 0.03 },
      { key: "forest-far", file: "worlds/forest/plx2.png", scroll: 0.08 },
      { key: "forest-mid", file: "worlds/forest/plx3.png", scroll: 0.16 },
      { key: "forest-near", file: "worlds/forest/plx4.png", scroll: 0.3 },
      { key: "forest-front", file: "worlds/forest/plx5.png", scroll: 0.5 },
    ],
    floorKey: "forest-floor",
    floorFile: "worlds/forest/floor.png",
    groundKey: "forest-ground",
    crop: [0, 0, 112, 96],
  },
  snow: {
    // vnitti's Glacial Mountains — the same hand as the plains, gone cold
    parallax: [
      { key: "snow-sky", file: "worlds/snow/sky.png", scroll: 0.04 },
      { key: "snow-clouds-bg", file: "worlds/snow/clouds_bg.png", scroll: 0.08 },
      { key: "snow-mtn", file: "worlds/snow/glacial_mountains.png", scroll: 0.16 },
      { key: "snow-clouds-3", file: "worlds/snow/clouds_mg_3.png", scroll: 0.24 },
      { key: "snow-clouds-2", file: "worlds/snow/clouds_mg_2.png", scroll: 0.34 },
      { key: "snow-clouds-1", file: "worlds/snow/clouds_mg_1.png", scroll: 0.5 },
    ],
    floorKey: "snow-floor",
    floorFile: "worlds/snow/floor.png", // GandalfHardcore Floor Tiles2 (winter band)
    groundKey: "snow-ground",
    crop: [16, 384, 64, 96], // the snow-lipped block, same layout as the grass one
  },
  dungeon: {
    // ORIGINAL art, generated by scripts/gen_dungeon.py — a torchlit brick
    // corridor: far wall, stone colonnade, near-black pillars + chains
    parallax: [
      { key: "dungeon-wall", file: "worlds/dungeon/wall.png", scroll: 0.08 },
      { key: "dungeon-arches", file: "worlds/dungeon/arches.png", scroll: 0.28 },
      { key: "dungeon-fore", file: "worlds/dungeon/fore.png", scroll: 0.55 },
    ],
    floorKey: "dungeon-floor",
    floorFile: "worlds/dungeon/floor.png",
    groundKey: "dungeon-ground",
    crop: [0, 0, 64, 96], // the whole generated band (flagstone lip + dark earth)
  },
};

const tileArtKey = (type: number) => TILE_KEYS[type];
const TILE_SHINE_KEY = "tile-shine";
const TILE_SHINE_ANIM = "tile-shine-sweep";
const TILE_SHINE_FRAMES = 11; // empty bookends + 9-frame diagonal glint
// Text-FIRST so iOS Safari draws real digit/letter glyphs; emoji fall back per-glyph to
// the system emoji font. (Leading with an emoji font garbles ASCII digits on iPhone.)
const EMOJI_FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

class GameScene extends Phaser.Scene {
  // board
  private recovered: RunCheckpoint | null = null;
  private empowered: EmpoweredState = newEmpowered();
  private empoweredTiles = new Map<number, Phaser.GameObjects.Container>();
  private rescue: RescueState = newRescueState();
  private rescueView: ReturnType<typeof showCompanionRescue> | null = null;
  private forkView: ReturnType<typeof showRoadFork> | null = null;
  private pendingChest: ChestPull[] | null = null;
  private checkpointAt = 0;
  private saveWarningShown = false;
  private grid: number[][] = [];
  private zoneArt!: Phaser.GameObjects.Graphics;
  private zoneArtSignature = "";
  private boardAtmosphere: {
    root: Phaser.GameObjects.Container;
    resize: (cols: number, rows: number) => void;
    syncCache?: (locks: number, caches: number) => void;
    reactToMatch?: (cells: readonly Coord[], cascade: number) => void;
  } | null = null;
  private tiles: (Phaser.GameObjects.Container | null)[][] = [];
  private pressedTile: Phaser.GameObjects.Container | null = null;
  private swapPreview!: TileSwapPreview;
  private tileShatter!: TileShatter;
  private busy = false;
  private down: { coord: Coord; x: number; y: number; pointerId: number; dragged: boolean } | null = null;
  private selected: Coord | null = null;
  private selection!: Phaser.GameObjects.Rectangle;
  private bestCascade = 0;
  private idleBoardTime = 0;
  private idleHintShown = false;

  // runner
  private run!: RunState;
  private phase: "advance" | "fight" | "chest" | "arena" = "advance"; // arena = boss shell game (no scroll/strikes/pan)
  private parallax: { sprite: Phaser.GameObjects.TileSprite; scroll: number }[] = [];
  private laneFrame!: Phaser.GameObjects.Rectangle;
  private laneRainWash?: Phaser.GameObjects.Rectangle;
  private roadScenery!: RoadScenery;
  private world: RunBiome = RUN_BIOMES.plains; // backdrop set for the current biome
  private floor!: Phaser.GameObjects.TileSprite;
  private hero!: Phaser.GameObjects.Sprite;
  private orc: Phaser.GameObjects.Sprite | null = null;
  private orcEnemy: Enemy | null = null; // actor's model; may be the casualty until its impact plays
  private rearFoe: AmbushActor | null = null;
  private ambushBrush: ForestAmbushBrush | null = null;
  private ambushResolving = false;
  private orcAnim = "orc"; // anim-key prefix of the current foe (orc / boar / goblin / boss …)
  private orcRig: CreatureRig | null = null; // how the current foe is dressed (null for the boss)
  private orcDefense: Defense = "none"; // the current foe's armor school (badge + callouts)
  private defenseTaught = false; // first resisted/weak hit per foe shows a callout
  private attackClock = 0;
  private attackWarned = false;
  private combatReadout?: ReturnType<typeof createCombatReadout>;
  private activeNotice?: Phaser.GameObjects.Text;
  private defBadge!: Phaser.GameObjects.Text; // 🛡⚔ / 🛡🪄 beside the HP bar

  // the zone's boss arena (Malgrim's shell game / Gorrach's goring run / the three rimes)
  private boss: BossDef = BOSS_DEFS.malgrim; // set from meta.biome in create()
  private arenaActive = false;
  private arenaGen = 0; // generation counter: stale arena timers bail out
  private arenaObjs: Phaser.GameObjects.GameObject[] = []; // live portal/figure props
  private arenaTimers: Phaser.Time.TimerEvent[] = []; // looping arena clocks (seal, ring spin) — torn down with the props
  private swipeTargets: { x: number; y: number; r: number; dir: SwipeDir; alive: boolean; onHit: (ang: number) => void; onWrong?: () => void }[] = [];
  private swingLockUntil = 0; // an early swing commits the blade: gated nodes refuse until this passes
  private trailPts: { x: number; y: number; t: number }[] = []; // recent drag points — the blade streak
  private trailGfx: Phaser.GameObjects.Graphics | null = null;
  private swipeFrom: { x: number; y: number } | null = null; // where the current drag began (design-local)
  private arenaWard = 0; // 0..2; 3 = core stages cleared (optional floor-20 finale)
  private arenaDealIdx = 0; // which deal within the ward
  private arenaDealsDone = 0; // drives the boss bar drain (out of ARENA_TOTAL_DEALS)
  private arenaWardMissed = false; // a flawless ward refunds a guard charge
  private slimeProgress: SlimeProgress | null = null;
  private slimeAdds: Phaser.GameObjects.Sprite[] = [];
  private orcGap = ENGAGE_GAP; // engage distance for the current foe (wider for the boss)
  private orcDying = false;
  private bossBar: { root: Phaser.GameObjects.Container; fill: Phaser.GameObjects.Rectangle } | null = null;
  private rainy = false; // rolled per run: rain ambience + streaks over the lane
  private amb: Phaser.Sound.BaseSound | null = null; // looping forest bed under the run
  private music: Phaser.Sound.BaseSound | null = null; // the run's song (journey on the road, war-drums at the boss)
  private fadingSounds: Phaser.Sound.BaseSound[] = []; // tracks mid-fade — no longer `music`, still ours to stop
  private musicBase = 0; // current track's design volume — audio-changed re-levels against it
  private heroLockX = false; // freeze hero x while a killing swing lands, then surge
  private heroKnock = 0; // px the hero is currently reeling backwards (decays); a felt shove
  private bossHold = false; // a stage has parked the boss somewhere of its own (tennis' far court)
  private enemyHpBar!: Phaser.GameObjects.Rectangle;
  private enemyHpBg!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private resIcons: Phaser.GameObjects.Text[] = []; // 🪵 🪨 💎 🔑 icons (left panel)
  private resVals: Phaser.GameObjects.Text[] = []; // matching counts, positioned tight to each icon
  private resourceChrome!: Phaser.GameObjects.Graphics;
  private overShown = false;
  private runCompleteShown = false; // the second boss fell — victory banner up
  private lastScoreShown = 0; // pulse the SCORE readout only when it climbs

  // responsive shell: the lane + board live in centerBox (design coords), scaled to
  // fit the viewport; the side panels flank it and absorb the leftover width.
  private centerBox!: Phaser.GameObjects.Container;
  private puzzleBox!: Phaser.GameObjects.Container;
  private wideLayout = false;
  private puzzleScale = 1;
  private boardCols = 7;
  private boardRows = 7;
  private boardLayouts: BoardLayouts = {};
  private boardFrame!: Phaser.GameObjects.Rectangle;
  private failedBoardReflow = "";
  private get boardWidth() { return this.boardCols * TILE; }
  private get boardHeight() { return this.boardRows * TILE; }
  private get boardFrameHeight() { return this.boardHeight + (this.run.biome === "dungeon" ? DELVE_FRAME_FOOTER : 0); }
  private get boardCenter() { return GRID_X + this.boardWidth / 2; }
  private portraitLaneTop = 0;
  private portraitBoardBottom = 0;
  private portraitFooterHeight = 160;
  private laneClip?: Phaser.GameObjects.Graphics;
  private runProgress!: Phaser.GameObjects.Graphics;
  private runProgressRect = new Phaser.Geom.Rectangle();
  private centerScale = 1;
  private centerBaseX = 0;
  private centerBaseY = 0;
  private centerBaseScale = 1;
  private tutorialHitFocus = false;
  private tutorialSwordSlow = false;
  private tutorialViewTween: Phaser.Tweens.Tween | null = null;
  private tutorialViewTweenDone: (() => void) | null = null;
  private leftPanel!: Phaser.GameObjects.Rectangle;
  private rightPanel!: Phaser.GameObjects.Rectangle;
  private gearText!: Phaser.GameObjects.Text;
  private devJumpBoss = false; // set by init(): rig this run's first foe as the boss
  private menuBtn!: Phaser.GameObjects.Text; // ☰ opens the pause menu (Esc works too)
  private hintObjs: Phaser.GameObjects.GameObject[] = []; // active hint rings (cleared on next move)
  private rotateHint!: Phaser.GameObjects.Text;

  // chests
  private chest: Phaser.GameObjects.Container | null = null; // the lane chest (body + key tag)
  private chestActive = false; // takeover sequence running — board input is frozen
  private awaitingChest = false;
  private chestFast = false; // the skip ▸ button shortens every remaining beat
  private sinceChest = 0; // kills since the last chest
  private chestsOpened = 0; // opened this run (banked into meta quest stats on death)
  private meta!: MetaState; // snapshot at run start — drives the in-run quest HUD
  private questText!: Phaser.GameObjects.Text;
  private completedQuestCues = new Set<string>();
  private tutorial: Tutorial | null = null; // first-entry guided overlay (null once seen)
  private itemSlots: ItemSlotUI[] = [];

  // ---- run items (src/items.ts): live buffs, armed charges, targeting -------
  private freezeLeft = 0; // Waystone: seconds of frozen scroll remaining
  private freezeVeil: Phaser.GameObjects.Rectangle | null = null; // cool wash while frozen
  private hornLeft = 0; // War Horn: seconds of doubled kill-surge
  private ledgerLeft = 0; // Merchant's Ledger: seconds of doubled resource gains
  private burnLeft = 0; // Cinder Flask: seconds the current foe keeps burning
  private burnAcc = 0; // fractional-second accumulator for burn ticks
  private spursActive = false; // Scout's Spurs: slowed strikes until the current foe falls
  private skeletonCharges = 0; // Skeleton Key: free chest openings armed
  private panCharges = 0; // Prospector's Pan: chests with bonus pulls armed
  private bossChestNext = false; // the chest rolling in is the boss hoard (richer item table)
  private targeting: { def: ItemDef; slot: ItemSlotUI } | null = null;
  private targetObjs: Phaser.GameObjects.GameObject[] = []; // banner + board ring while aiming
  private tip: Phaser.GameObjects.Container | null = null; // shared tooltip panel (screen-space)
  private tipFor: number = -1; // slot index the tooltip is showing for
  private holdTimer: Phaser.Time.TimerEvent | null = null; // touch press-and-hold -> tooltip
  private holdShown = false; // this press already showed the tooltip -> release must not use
  private activeEffects?: ReturnType<typeof createActiveEffects>;

  // ---- peril feedback: the fight reaching the player's peripheral vision ----
  private vignette: Phaser.GameObjects.Image | null = null; // combat-panel danger wash
  private vignetteA = 0; // eased alpha (lerps toward the pressure-driven target)
  private laneGuard!: Phaser.GameObjects.Container; // in-lane 🛡️×N badge (top-left)
  private laneGuardText!: Phaser.GameObjects.Text;
  private laneGuardLast = -1; // last shown count — drives the gain-bounce / spend-flash
  private laneHudScale = 1;
  private laneMutes: Phaser.GameObjects.Container[] = [];
  // zone-dressed HUD rails: baked fringe strips pinned to the panel edges by layoutPanels
  private panelDecor: { ts: Phaser.GameObjects.TileSprite; edge: "top" | "bottom" | "side"; h: number; side: "left" | "right" }[] = [];
  // live rail bounds (screen px) — the panel critters wander inside these
  private panelRectL = new Phaser.Geom.Rectangle();
  private panelRectR = new Phaser.Geom.Rectangle();

  constructor() {
    super("game");
  }

  /** Scene data — the dev boss bar restarts the run with `bossJump` to rig the warden. */
  init(data?: { bossJump?: boolean }) {
    this.devJumpBoss = !!data?.bossJump;
  }

  preload() {
    // CampScene boots first and shares several keys (hero, parallax, floor) —
    // guard every load so re-entering the run never re-queues existing assets.
    const sheet = (key: string, file: string, fw: number, fh: number) => {
      if (!this.textures.exists(key)) this.load.spritesheet(key, `sprites/${file}`, { frameWidth: fw, frameHeight: fh });
    };
    preloadPlayer(this);
    // enemy: slime — top-down pack, 64x64 frames; we use the front-facing row 0
    sheet("slime-idle", "slime_idle.png", 64, 64);
    sheet("slime-walk", "slime_run.png", 64, 64);
    sheet("slime-hurt", "slime_hurt.png", 64, 64);
    sheet("slime-death", "slime_death.png", 64, 64);
    // extra slime variants (same pack, same layout): green=1, blue=2, dark=3 — depth adds them
    for (const n of ["2", "3"]) {
      sheet(`slime${n}-idle`, `slime${n}_idle.png`, 64, 64);
      sheet(`slime${n}-walk`, `slime${n}_run.png`, 64, 64);
      sheet(`slime${n}-hurt`, `slime${n}_hurt.png`, 64, 64);
      sheet(`slime${n}-death`, `slime${n}_death.png`, 64, 64);
    }
    // boar (48×32 frames — the sprites are 48 wide, NOT 32: slicing at 32 cut
    // each boar in half and caused the sliding/clipping). idle(4)/run(6)/hit(4).
    sheet("boar-idle", "boar_idle.png", 48, 32);
    sheet("boar-run", "boar_run.png", 48, 32);
    sheet("boar-hit", "boar_hit.png", 48, 32);
    // Monster_Creatures_Fantasy pack — full 150×150 sheets, face RIGHT (flipped
    // to face the hero). Each: idle, walk/run, attack, hurt (Take Hit), death.
    for (const [k, f] of [
      ["goblin-idle", "goblin_idle"], ["goblin-walk", "goblin_run"], ["goblin-attack", "goblin_melee"],
      ["goblin-throw", "goblin_throw"], ["goblin-hurt", "goblin_hurt"], ["goblin-death", "goblin_death"],
      ["mushroom-idle", "mushroom_idle"], ["mushroom-walk", "mushroom_run"], ["mushroom-attack", "mushroom_melee"],
      ["mushroom-hurt", "mushroom_hurt"], ["mushroom-death", "mushroom_death"],
      ["skeleton-idle", "skeleton_idle"], ["skeleton-walk", "skeleton_walk"], ["skeleton-attack", "skeleton_attack"],
      ["skeleton-hurt", "skeleton_hurt"], ["skeleton-death", "skeleton_death"],
      ["eye-idle", "eye_fly"], ["eye-walk", "eye_fly"], ["eye-attack", "eye_attack"],
      ["eye-hurt", "eye_hurt"], ["eye-death", "eye_death"],
      // the glacial pass (generated: scripts/gen_frost_skeleton.py + gen_ice_elemental.py)
      ["frostskel-idle", "frostskel_idle"], ["frostskel-walk", "frostskel_walk"], ["frostskel-attack", "frostskel_attack"],
      ["frostskel-hurt", "frostskel_hurt"], ["frostskel-death", "frostskel_death"],
      ["icelem-idle", "icelem_idle"], ["icelem-walk", "icelem_walk"], ["icelem-attack", "icelem_attack"],
      ["icelem-hurt", "icelem_hurt"], ["icelem-death", "icelem_death"],
    ] as const)
      sheet(k, `${f}.png`, 150, 150);
    sheet("goblin-bomb", "goblin_bomb.png", 100, 100); // 19-frame bomb (fuse burns down)
    // ---- the zone's boss (only his sheets load — they're the biggest in the game)
    const bossKey = bossForBiome(loadMeta().biome).key;
    if (bossKey === "boss") {
      // the Cindermage (Evil Wizard pack, CC0) — the dungeon
      sheet("boss-idle", "boss_idle.png", 150, 150);
      sheet("boss-move", "boss_move.png", 150, 150);
      sheet("boss-attack", "boss_attack.png", 150, 150);
      sheet("boss-hurt", "boss_hurt.png", 150, 150);
      sheet("boss-death", "boss_death.png", 150, 150);
    } else if (bossKey === "mino") {
      // Gorrach (mino_v1.1_free) — no hurt/death frames in the pack
      sheet("mino-idle", "mino_idle.png", 288, 160);
      sheet("mino-walk", "mino_walk.png", 288, 160);
      sheet("mino-attack", "mino_attack.png", 288, 160);
    } else if (bossKey === "frost") {
      // the Hoarfrost Warden (Frost_Guardian_FREE_v1.0) — a full set
      sheet("frost-idle", "frost_idle.png", 192, 128);
      sheet("frost-walk", "frost_walk.png", 192, 128);
      sheet("frost-attack", "frost_attack.png", 192, 128);
      sheet("frost-hurt", "frost_hurt.png", 192, 128);
      sheet("frost-death", "frost_death.png", 192, 128);
    }
    // world backdrop for the current biome: parallax layers + floor atlas (meta.biome picks the set)
    this.world = RUN_BIOMES[loadMeta().biome] ?? RUN_BIOMES.plains;
    const img = (key: string, file: string) => {
      if (!this.textures.exists(key)) this.load.image(key, file);
    };
    preloadTileArt(this);
    preloadRoadScenery(this);
    for (const l of this.world.parallax) img(l.key, l.file);
    img(this.world.floorKey, this.world.floorFile);
    // sfx — combat is dedicated WAVs; swap/gameover are the foley pack
    const audio: Record<string, string> = {
      swing1: "swing1.wav", swing2: "swing2.wav", swing3: "swing3.wav",
      hit1: "hit1.wav", hit2: "hit2.wav", hit3: "hit3.wav",
      spell: "spell.wav", death: "death.mp3", swap: "swap.mp3",
      slimeatk: "slimeatk.wav", squish1: "squish1.wav", squish2: "squish2.wav",
      block1: "block1.wav", block2: "block2.wav", block3: "block3.wav", // shield soaks a strike
      // grass map = dirt footsteps (swap this set per world later)
      step1: "step1.wav", step2: "step2.wav", step3: "step3.wav", step4: "step4.wav", step5: "step5.wav",
      // escalating combo stingers — reborn as chest-pull reveal stings (pull 1..5)
      combo2: "combo2.wav", combo3: "combo3.wav", combo4: "combo4.wav", combo5: "combo5.wav", combo6: "combo6.wav",
      // chest blast: unlock click, lid creak, coin eruption, per-reward flips, collect thunk
      chest_unlock: "chest_unlock.wav", chest_creak: "chest_creak.wav", coin_pour: "coin_pour.mp3",
      coin1: "coin1.mp3", coin2: "coin2.mp3", coin3: "coin3.mp3", pouch: "pouch.mp3", pickup: "pickup.mp3",
      // boss: summon sting on his entrance, fireballs when he strikes
      summon: "summon.wav", fireball1: "fireball1.wav", fireball2: "fireball2.wav", fireball3: "fireball3.wav",
      // ambient forest bed under the run (rain variant on wet runs)
      amb_day: "amb_day.mp3", amb_rain: "amb_rain.mp3",
      // music (xDeviruchi, CC-BY): the road's song, the boss's war-drums, the deep's hush
      music_journey: "music_journey.mp3", music_boss: "music_boss.mp3", music_dungeon: "music_dungeon.mp3",
      music_forest: "music_forest.mp3", music_snow: "music_snow.mp3",
    };
    for (const [k, f] of Object.entries(audio)) if (!this.cache.audio.exists(k)) this.load.audio(k, `sounds/${f}`);
    for (let i = 1; i <= TILE_SFX; i++)
      if (!this.cache.audio.exists(`tile${i}`)) this.load.audio(`tile${i}`, `sounds/tile${i}.wav`); // random tile-match sfx
  }

  create() {
    this.recovered = this.devJumpBoss ? null : readCheckpoint(loadMeta());
    this.empowered = structuredClone(this.recovered?.empowered ?? newEmpowered());
    this.empoweredTiles.clear();
    this.rescue = structuredClone(this.recovered?.rescue ?? newRescueState());
    this.rescueView = null;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.rescueView?.destroy(); this.rescueView = null; });
    this.forkView = null;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.forkView?.destroy(); this.forkView = null; });
    this.pendingChest = null;
    this.checkpointAt = 0;
    this.saveWarningShown = false;
    // Recovered boards reflow at the next stable layout, preserving their tile bag.
    this.boardLayouts = structuredClone(this.recovered?.boardLayouts ?? {});
    this.failedBoardReflow = "";
    this.boardCols = this.scale.width >= this.scale.height ? 10 : 7;
    this.boardRows = this.boardCols === 10 ? 5 : 7;
    if (this.recovered) { this.boardRows = this.recovered.grid.length; this.boardCols = this.recovered.grid[0].length; }
    this.meta = loadMeta();
    this.completedQuestCues.clear();
    if (!this.recovered && !this.devJumpBoss) {
      prepareCampProgress(this.meta);
      acknowledgeProgress(this.meta);
    }
    // forge + study bite all run; the zone fields its own bestiary
    this.run = newRun(this.meta.swordLevel, forgeCap(this.meta.biome), this.meta.biome, this.meta.staffLevel, this.meta.companions);
    if (this.recovered) this.run = structuredClone(this.recovered.run);
    this.run.zone = restoreZoneFeatures(this.run.zone);
    if (this.run.biome === "forest") {
      this.run.zone.marks = [];
      this.run.roadFork = newRoadFork();
      if (this.run.enemy) delete this.run.enemy.spores;
    }
    this.boss = bossForBiome(this.meta.biome); // each road has its own warden and its own game
    this.chestsOpened = 0;
    this.busy = false;
    this.down = null;
    this.pressedTile = null;
    this.swapPreview = new TileSwapPreview(this);
    this.selected = null;
    this.bestCascade = 0;
    this.idleBoardTime = 0;
    this.idleHintShown = false;
    this.orc = null;
    this.orcEnemy = null;
    this.rearFoe = null;
    this.ambushBrush = null;
    this.ambushResolving = false;
    this.orcDying = false;
    this.orcGap = ENGAGE_GAP;
    this.bossBar = null;
    // no weather underground; the pass snows instead of raining
    this.rainy = this.meta.biome === "snow" || this.meta.biome === "dungeon" ? false : Math.random() < RAIN_CHANCE;
    if (this.recovered) this.rainy = this.recovered.rainy;
    this.heroLockX = false;
    this.heroKnock = 0;
    this.settleCamera(); // a restart must never inherit a stranded zoom/shake
    this.bossHold = false;
    this.overShown = false;
    this.runCompleteShown = false;
    this.lastScoreShown = 0;
    this.phase = "advance";
    this.parallax = [];
    this.chest = null;
    this.chestActive = false;
    this.awaitingChest = false;
    this.chestFast = false;
    this.sinceChest = 0;
    this.tutorial = null;
    // run items: everything resets with the run
    this.freezeLeft = 0;
    this.freezeVeil = null;
    this.hornLeft = 0;
    this.ledgerLeft = 0;
    this.burnLeft = 0;
    this.burnAcc = 0;
    this.spursActive = false;
    this.skeletonCharges = 0;
    this.panCharges = 0;
    this.bossChestNext = false;
    this.targeting = null;
    this.targetObjs = [];
    this.hintObjs = [];
    this.arenaActive = false;
    this.arenaGen++;
    this.arenaObjs = [];
    this.arenaTimers = [];
    this.swipeTargets = [];
    this.swipeFrom = null;
    this.arenaWard = 0;
    this.arenaDealIdx = 0;
    this.arenaDealsDone = 0;
    this.arenaWardMissed = false;
    this.slimeProgress = null;
    this.slimeAdds = [];
    this.tip = null;
    this.tipFor = -1;
    this.holdTimer = null;
    this.holdShown = false;
    prepareTileArt(this);
    this.tileShatter = new TileShatter(this);
    this.buildTilePolish();
    this.buildChestArt();
    this.buildBladeArt();
    this.buildVignetteArt();
    this.vignette = null;
    this.vignetteA = 0;

    // (master volume is set once at boot, below the game config — setting it
    // here made the first camp visit of a session 43% louder than everything
    // after it, since the global manager started at 1.0 until the first run)

    this.buildAnims();
    this.buildGrassGround();
    this.buildPanels();
    this.centerBox = this.add.container(0, 0);
    this.puzzleBox = this.add.container(0, 0);
    this.boardAtmosphere = null;
    this.buildLane();
    this.buildBoard();
    const onTileEffects = () => {
      for (const row of this.tiles) for (const tile of row) if (tile?.scene) this.syncTileShine(tile);
      if (!tileEffectsEnabled()) this.tileShatter.clear();
    };
    this.game.events.on(TILE_EFFECTS_CHANGED, onTileEffects);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(TILE_EFFECTS_CHANGED, onTileEffects));
    this.attackClock = 0; this.attackWarned = false;
    this.combatReadout = createCombatReadout();
    this.activeEffects = createActiveEffects();
    const hideEffects = () => this.activeEffects?.show(false);
    this.events.on(Phaser.Scenes.Events.PAUSE, stopHaptics);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      stopHaptics();
      this.events.off(Phaser.Scenes.Events.PAUSE, stopHaptics);
    });
    this.events.on(Phaser.Scenes.Events.PAUSE, hideEffects);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.PAUSE, hideEffects);
      this.combatReadout?.destroy(); this.activeEffects?.destroy();
    });
    if (this.recovered) {
      const c = this.recovered;
      Object.assign(this, c.buffs);
      this.chestsOpened = c.chestsOpened; this.sinceChest = c.sinceChest; this.bestCascade = c.bestCascade;
      this.awaitingChest = !!c.awaitingChest;
      this.chestActive = this.awaitingChest;
      for (const [i, id] of c.items.entries()) if (id) {
        const def = itemById(id); if (def) this.fillSlot(def, this.itemSlots[i]);
      }
      if (c.pendingChest) for (const pull of c.pendingChest) this.applyPull(pull);
    }
    this.buildInput();
    // Screen-space bounds follow the visible combat panel, including landscape's sky crop.
    this.vignette = this.add.image(0, 0, "lane-peril").setDepth(76).setAlpha(0);
    this.layout();
    this.scale.off("resize", this.layout, this);
    this.scale.on("resize", this.layout, this);
    // the ScaleManager is global — drop our handler when the camp takes over
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off("resize", this.layout, this));

    // ambient forest bed under the whole run (rain variant on wet runs); the
    // sound manager outlives the scene, so stop it when the camp takes over.
    // The ambience fader scales it, live when the options slider moves.
    // NB: levels go through setSoundLevel AFTER play() — it writes the level
    // into the sound's config too, so Phaser's internal re-applies (loop
    // restarts, blur-resume) restore OUR level instead of full blast.
    const ambBase = this.rainy ? 0.34 : 0.22;
    this.amb = this.sound.add(this.rainy ? "amb_rain" : "amb_day", { loop: true });
    this.amb.play();
    setSoundLevel(this.amb, ambV(ambBase));
    // the road's song under it all (the boss swaps in his own war-drums);
    // underground, the deep hums its own uneasy tune
    this.music = null;
    this.fadingSounds = [];
    this.playMusic(this.roadMusicKey(), 0.26, 1600);
    const onAudio = () => {
      if (this.amb) {
        this.tweens.killTweensOf(this.amb);
        setSoundLevel(this.amb, ambV(ambBase));
      }
      if (this.music) {
        this.tweens.killTweensOf(this.music);
        setSoundLevel(this.music, musicV(this.musicBase));
      }
    };
    this.game.events.on("audio-changed", onAudio);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("audio-changed", onAudio);
      this.killSound(this.amb);
      this.amb = null;
      this.killSound(this.music);
      this.music = null;
      for (const s of this.fadingSounds) this.killSound(s); // caught mid-fade — the tween won't outlive us
      this.fadingSounds = [];
    });

    // pause menu: Esc (desktop) or the ☰ chip (see buildPanels)
    this.input.keyboard?.on("keydown-ESC", () => this.openMenu());

    // Opaque camera: the runner is a letterboxed centre column, so on tall/square
    // viewports there's empty space above and below it. Phaser stacks visible
    // scenes, and a lingering camp scene would show its SKY through that gap.
    // Painting our own background makes the run visually self-contained.
    this.cameras.main.setBackgroundColor(0x0a0b0f);
    if (!this.recovered) this.cameras.main.fadeIn(300, 5, 6, 10);
    else this.cameras.main.resetFX();
    // intro: the hero jogs in from off the left edge to meet the first foe.
    // Slow both approaches together so the hero's run reads at a natural pace.
    const INTRO_MS = this.recovered ? 500 : 1550;
    if (this.run.roadFork?.pending) this.showFork();
    else if (this.rescue.pending) this.showRescue();
    else if (!this.run.enemy && this.recovered && !this.awaitingChest) this.advanceRoad(INTRO_MS);
    else if (this.awaitingChest) this.spawnChest(INTRO_MS);
    else if (this.run.killed < RUN_COMPLETE_AT) this.spawnOrc(INTRO_MS);
    if (this.forkView) {
      this.hero.setX(this.heroXForPressure()); this.heroLockX = false;
      this.hero.play("hero-idle", true);
    } else {
      this.hero.setX(-30);
      this.heroLockX = true;
      this.hero.play("hero-walk", true);
      this.tweens.add({
        targets: this.hero,
        x: this.heroXForPressure(),
        duration: INTRO_MS - 40, // arrive just before the slime, so enterFight's idle looks right
        ease: "Sine.easeOut",
        onComplete: () => (this.heroLockX = false),
      });
    }

    // strike cadence self-schedules so Scout's Spurs can stretch the interval and
    // each foe's own tempo can quicken it (boars are fast); the dread telegraph
    // leads every blow.
    // The attack clock belongs to each encounter. New foes always give a full
    // warning instead of inheriting the previous foe's nearly-finished timer.
    this.time.addEvent({ delay: 270, loop: true, callback: () => this.footstep() }); // hero jog cadence

    // the Peddler's goods: items bought at camp arrive already packed in slots
    const stocked = this.recovered ? [] : this.meta.stockedItems ?? [];
    if (stocked.length) {
      this.meta.stockedItems = [];
      // Packed items and their checkpoint are persisted together below.
      {
        for (const id of stocked) {
          const def = itemById(id);
          if (def) this.fillSlot(def);
        }
        this.notice("Items from the shop are ready.", "#ffe08a");
      }
    }

    // first time into the puzzle: the guided tutorial runs over the live scene
    // (it gates strikes / scroll / board input itself; see src/tutorial.ts).
    // ?tutorial on the URL force-replays it — handy for testing on devices.
    const replay = new URLSearchParams(location.search).has("tutorial");
    if (!this.meta.tutorialSeen || replay) {
      this.tutorial = new Tutorial(this);
      this.tutorial.start();
    }

    this.installSwipeReader();
    this.writeCheckpoint(true);
    const suspend = () => { this.writeCheckpoint(); this.openMenu(); };
    const hidden = () => { if (document.hidden) suspend(); };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", suspend);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", suspend);
    });
    if (this.recovered) this.time.delayedCall(0, () => {
      if (this.run.killed >= RUN_COMPLETE_AT && !this.awaitingChest) this.showRunComplete();
      else { this.notice("Run restored. Resume when you're ready.", "#82efcd"); this.openMenu(); }
    });

    if (import.meta.env.DEV) (globalThis as unknown as { __mb: GameScene }).__mb = this;

    // the dev bar restarted us to reach this road's warden — put him on the lane
    if (this.devJumpBoss && import.meta.env.DEV) {
      this.devJumpBoss = false;
      this.tutorial = null;
      this.run.block = 6; // arriving at a boss with no guard makes every miss lethal — not a useful test
      this.time.delayedCall(300, () => this.debugBoss());
    }
  }

  private buildAnims() {
    const mk = (key: string, tex: string, start: number, end: number, fps: number, repeat: number) => {
      if (this.anims.exists(key)) return;
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(tex, { start, end }), frameRate: fps, repeat });
    };
    createPlayerAnimations(this);
    // enemy slime — front-facing row 0 of each 64x64 sheet (keep orc-* keys)
    mk("orc-idle", "slime-idle", 0, 5, 6, -1);
    mk("orc-walk", "slime-walk", 0, 7, 10, -1);
    mk("orc-hurt", "slime-hurt", 0, 4, 12, 0);
    mk("orc-death", "slime-death", 0, 9, 12, 0);
    mk("orc-attack", "slime-walk", 0, 7, 12, 0); // slime lunges (reuse run)
    mk("slimeboss-idle", "slime-idle", 0, 5, 6, -1);
    mk("slimeboss-walk", "slime-walk", 0, 7, 9, -1);
    mk("slimeboss-hurt", "slime-hurt", 0, 4, 12, 0);
    mk("slimeboss-death", "slime-death", 0, 9, 12, 0);
    mk("slimeboss-attack", "slime-walk", 0, 7, 12, 0);
    // variant anims mirror the orc-* frame layout (orc2 = blue slime, orc3 = dark slime)
    for (const [p, n] of [["orc2", "2"], ["orc3", "3"]] as const) {
      mk(`${p}-idle`, `slime${n}-idle`, 0, 5, 6, -1);
      mk(`${p}-walk`, `slime${n}-walk`, 0, 7, 10, -1);
      mk(`${p}-hurt`, `slime${n}-hurt`, 0, 4, 12, 0);
      mk(`${p}-death`, `slime${n}-death`, 0, 9, 12, 0);
      mk(`${p}-attack`, `slime${n}-walk`, 0, 7, 12, 0);
    }
    // boar — a clean 48px pack: 4-frame pawing idle, 6-frame gallop, 4-frame
    // hurt (frames 1 & 3 are white damage-flashes → hurt uses the brown frame).
    // No attack/death frames: the CHARGE is the gallop (+lunge), death a topple.
    mk("boar-idle", "boar-idle", 0, 3, 6, -1);
    mk("boar-walk", "boar-run", 0, 5, 14, -1);
    mk("boar-hurt", "boar-hit", 0, 0, 1, 0); // brown recoil; the red hero-strike tint is the flash
    mk("boar-attack", "boar-run", 0, 5, 20, 0); // a galloping charge (+ the lunge surge)
    mk("boar-death", "boar-idle", 0, 0, 1, 0); // brown standing; the topple+fade sells the death
    // Monster pack — full state sets (idle/walk/attack/hurt/death) per creature.
    // [prefix, idleEnd, walkEnd, atkEnd, hurtEnd, deathEnd] (0-indexed last frame)
    for (const [p, ie, we, ae, he, de] of [
      ["goblin", 3, 7, 7, 3, 3] as const,
      ["mushroom", 3, 7, 7, 3, 3] as const,
      ["skeleton", 3, 3, 7, 3, 3] as const,
      ["eye", 7, 7, 7, 3, 3] as const,
      ["frostskel", 3, 3, 7, 3, 3] as const, // recoloured skeleton — same frame layout
      ["icelem", 3, 7, 7, 3, 3] as const, // generated: idle4 walk8 attack8 hurt4 death4
    ]) {
      mk(`${p}-idle`, `${p}-idle`, 0, ie, 6, -1);
      mk(`${p}-walk`, `${p}-walk`, 0, we, 12, -1);
      mk(`${p}-attack`, `${p}-attack`, 0, ae, 14, 0);
      mk(`${p}-hurt`, `${p}-hurt`, 0, he, 14, 0);
      mk(`${p}-death`, `${p}-death`, 0, de, 10, 0);
    }
    mk("goblin-throw", "goblin-throw", 0, 11, 14, 0); // the goblin's bomb hurl (Attack3)
    mk("goblin-bomb-spin", "goblin-bomb", 0, 18, 22, -1); // the thrown bomb, fuse burning
    // boss anims plug into the same `${orcAnim}-*` key scheme the slimes use.
    // Only the zone's own warden was preloaded, so build against what exists.
    if (this.textures.exists("boss-idle")) {
      mk("boss-idle", "boss-idle", 0, 7, 8, -1);
      mk("boss-walk", "boss-move", 0, 7, 10, -1);
      mk("boss-attack", "boss-attack", 0, 7, 14, 0);
      mk("boss-hurt", "boss-hurt", 0, 3, 12, 0);
      mk("boss-death", "boss-death", 0, 4, 10, 0);
    }
    if (this.textures.exists("mino-idle")) {
      // Gorrach: 16-frame breathing idle, 12-frame stomp, 16-frame axe swing.
      // No hurt/death art — hurt reuses the idle head (the white flash sells the
      // hit) and death reuses idle under killOrc's topple.
      mk("mino-idle", "mino-idle", 0, 15, 12, -1);
      mk("mino-walk", "mino-walk", 0, 11, 12, -1);
      mk("mino-attack", "mino-attack", 0, 15, 20, 0);
      mk("mino-hurt", "mino-idle", 0, 1, 8, 0);
      mk("mino-death", "mino-idle", 0, 0, 1, 0);
    }
    if (this.textures.exists("frost-idle")) {
      mk("frost-idle", "frost-idle", 0, 5, 7, -1);
      mk("frost-walk", "frost-walk", 0, 9, 11, -1);
      mk("frost-attack", "frost-attack", 0, 13, 16, 0);
      mk("frost-hurt", "frost-hurt", 0, 6, 14, 0);
      mk("frost-death", "frost-death", 0, 15, 12, 0);
    }
  }

  /** Crop a seamless ground slice (grass top + dirt, no rocky side edges) from the biome floor atlas. */
  private buildGrassGround() {
    const w = this.world;
    if (!this.textures.exists(w.groundKey)) this.cropTile(w.groundKey, w.floorKey, ...w.crop);
  }

  /** Copy a region of a loaded image into its own texture, for TileSprite tiling. */
  private cropTile(key: string, src: string, sx: number, sy: number, w: number, h: number) {
    const img = this.textures.get(src).getSourceImage() as HTMLImageElement;
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const cx = cv.getContext("2d")!;
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
    this.textures.addCanvas(key, cv);
  }

  // --- tile coordinate helpers (container origin is its centre) ---
  private xFor(c: number) {
    return GRID_X + c * TILE + TILE / 2;
  }
  private yFor(r: number) {
    return GRID_Y + r * TILE + TILE / 2;
  }
  private cellAt(x: number, y: number, edgeMargin = 0): Coord | null {
    const bx = (x - this.puzzleBox.x) / this.puzzleScale - GRID_X;
    const by = (y - this.puzzleBox.y) / this.puzzleScale - GRID_Y;
    if (bx < -edgeMargin || bx >= this.boardCols * TILE + edgeMargin ||
        by < -edgeMargin || by >= this.boardRows * TILE + edgeMargin) return null;
    // Held drags can overshoot an edge slightly; taps still use the exact board bounds.
    return { r: Math.max(0, Math.min(this.boardRows - 1, Math.floor(by / TILE))),
      c: Math.max(0, Math.min(this.boardCols - 1, Math.floor(bx / TILE))) };
  }
  private heroXForPressure() {
    return lerp(SAFE_X, SKULL_X, this.run.pressure);
  }
  private heroBaseAnim() {
    return this.phase === "fight" ? "hero-idle" : "hero-walk";
  }

  // --- responsive shell helpers ---
  /** Parent a game-world object into the scaled centre column. */
  private inBox<T extends Phaser.GameObjects.GameObject>(o: T, puzzle?: boolean): T {
    const positioned = o as Phaser.GameObjects.GameObject & { y?: number };
    const onBoard = puzzle ?? (o instanceof Phaser.GameObjects.Graphics || (positioned.y ?? 0) >= GRID_Y);
    (onBoard ? this.puzzleBox : this.centerBox).add(o);
    return o;
  }

  /** Font sizes for world labels, measured against their final screen size. */
  private worldFont(size: number, minimum = 16) {
    return Math.max(size, Math.ceil(minimum / Math.max(0.25, this.centerBaseScale)));
  }
  /** screen px -> design-local. */
  private toLocal(sx: number, sy: number) {
    if (sy >= this.puzzleBox.y + GRID_Y * this.puzzleScale) {
      return { x: (sx - this.puzzleBox.x) / this.puzzleScale, y: (sy - this.puzzleBox.y) / this.puzzleScale };
    }
    return { x: (sx - this.centerBox.x) / this.centerScale, y: (sy - this.centerBox.y) / this.centerScale };
  }

  /** Read the notch / home-indicator safe-area insets (CSS px) exposed as :root vars. */
  private safeInsets() {
    const cs = getComputedStyle(document.documentElement);
    const px = (v: string) => parseFloat(v) || 0;
    return {
      t: px(cs.getPropertyValue("--sai-t")),
      r: px(cs.getPropertyValue("--sai-r")),
      b: px(cs.getPropertyValue("--sai-b")),
      l: px(cs.getPropertyValue("--sai-l")),
    };
  }

  /** Fit a compact HUD + centre shell, keeping square tiles and a shallow runner. */
  private layout() {
    if (this.down) this.clearSelection(true);
    const vw = this.scale.width;
    const vh = this.scale.height;
    const ins = this.safeInsets(); // stay clear of the notch + home indicator
    const x0 = ins.l;
    const y0 = ins.t;
    const uw = Math.max(120, vw - ins.l - ins.r);
    const uh = Math.max(120, vh - ins.t - ins.b);
    const portrait = uh > uw;
    this.syncBoardOrientation(!portrait);
    this.wideLayout = !portrait;
    this.hero.setScale(HERO_SCALE / PLAYER_DENSITY * (this.arenaActive ? 1.2 : 1));
    if (this.orc && this.run.enemy?.kind === "boss" && !this.orcDying)
      this.orc.setScale(this.boss.arena === "slime" ? SLIME_SCALES[this.slimeProgress?.phase ?? 0] : this.boss.scale * (this.arenaActive ? 1.08 : 1));
    if (this.wideLayout) {
      this.layoutWide(x0, y0, uw, uh);
      return;
    }
    // Use the phone width when it fits, but reserve the fight's HUD and actor
    // space before sizing the puzzle. A short portrait must not crop their heads.
    const topReserve = 64;
    const minFooterHeight = this.arenaActive ? 112 : 160;
    const progressGap = 16;
    const minLaneHeight = 130;
    const laneHudHeight = 40; // fixed-size enemy label, guard and sound controls
    const laneActionHeight = 160; // design pixels: actors, overhead HP bars and floor
    const roomHeight = uh - topReserve - minFooterHeight - progressGap;
    const boardAspect = this.boardFrameHeight / this.boardWidth;
    const boardSize = Math.max(1, Math.min(uw - 12,
      (roomHeight - minLaneHeight) / boardAspect,
      (roomHeight - laneHudHeight) / (boardAspect + laneActionHeight / GRID_W)));
    const puzzleScale = boardSize / this.boardWidth;
    const boardHeight = this.boardFrameHeight * puzzleScale;
    const s = boardSize / GRID_W;
    this.centerScale = s;
    const cw = boardSize;
    const shellW = uw;
    const shellX = x0;
    const boardX = x0 + (uw - boardSize) / 2;
    // Keep the lane sized for its contents. Tall phones give spare height to the
    // item tray instead of stretching the battlefield into a wall of empty sky.
    const laneHeight = Math.max(minLaneHeight, laneHudHeight + laneActionHeight * s);
    this.portraitFooterHeight = uh - topReserve - boardHeight - progressGap - laneHeight;
    this.layoutLaneBackdrop(Math.max(LANE_H, laneHeight / s));
    this.portraitLaneTop = y0 + topReserve;
    const cx = boardX - GRID_X * s;
    const cy = this.portraitLaneTop + laneHeight - (LANE_Y + LANE_H) * s;
    const boardTop = this.portraitLaneTop + laneHeight + progressGap;
    this.runProgressRect.setTo(boardX + 5, boardTop - progressGap / 2 - 3, boardSize - 10, 6);
    this.portraitBoardBottom = boardTop + boardHeight;
    this.centerBaseX = cx;
    this.centerBaseY = cy;
    this.centerBaseScale = s;
    if (this.tutorialViewTween) {
      this.tutorialViewTween.stop();
      this.tutorialViewTween = null;
    }
    const view = this.tutorialHitFocus ? this.tutorialHitView() : { x: cx, y: cy, scale: s };
    this.applyCenterView(view.x, view.y, view.scale);
    this.puzzleScale = puzzleScale;
    this.puzzleBox.setScale(puzzleScale).setPosition(boardX - GRID_X * puzzleScale, boardTop - GRID_Y * puzzleScale);
    this.centerBox.clearMask(true);
    if (!this.laneClip?.scene) this.laneClip = this.add.graphics().setVisible(false);
    this.laneClip.clear().fillStyle(0xffffff).fillRect(boardX - 1, this.portraitLaneTop, boardSize + 2, laneHeight);
    this.centerBox.setMask(this.laneClip.createGeometryMask());
    this.laneHudScale = Math.max(1, 1 / s);
    const hudY = (this.portraitLaneTop - cy) / s;
    this.laneGuard.setScale(this.laneHudScale).setPosition(GRID_X + 6 / s, hudY + 20 / s);
    this.laneMutes.forEach((chip, i) => {
      chip.setScale(this.laneHudScale).setPosition(GRID_X + UI_W - (26 + i * 46) / s, hudY + 24 / s);
      const compact = Math.min(uw, uh) <= 600;
      (chip.getAt(0) as Phaser.GameObjects.Rectangle).setSize(compact ? 28 : 44, compact ? 28 : 40);
    });
    this.defBadge.setFontSize(this.worldFont(13, 15));
    this.layoutBossBar();
    if (this.tutorialViewTweenDone) {
      const done = this.tutorialViewTweenDone;
      this.tutorialViewTweenDone = null;
      this.time.delayedCall(0, done);
    }
    this.vignette?.setPosition(boardX + boardSize / 2, this.portraitLaneTop + laneHeight / 2)
      .setDisplaySize(boardSize, laneHeight);
    this.layoutPanels(shellX, y0, shellW, uh, cx, cw);
  }

  /** Classic landscape composition: stats | fight above puzzle | inventory. */
  private layoutWide(x: number, y: number, w: number, h: number) {
    this.layoutLaneBackdrop(LANE_H);
    const leftW = Phaser.Math.Clamp(w * .15, 160, 220);
    const rightW = Phaser.Math.Clamp(w * .075, 64, 112);
    const gap = 16;
    // Fit the 10×5 board and runner into the entire centre column with square tiles.
    const available = Math.max(100, w - leftW - rightW - 8);
    const aspect = this.boardFrameHeight / this.boardWidth;
    // While a swap or challenge finishes, a deferred square board needs more cue room.
    const cueHeader = this.boardCols === 7 ? 60 : 0;
    const boardSize = Math.min(available, (h - gap - 16 - cueHeader) / (aspect + 180 / GRID_W), (h - gap - 100 - cueHeader) / aspect);
    const scale = boardSize / GRID_W;
    const puzzleScale = boardSize / this.boardWidth;
    const boardHeight = this.boardFrameHeight * puzzleScale;
    const laneHeight = Math.max(84, 180 * scale);
    const totalHeight = cueHeader + laneHeight + gap + boardHeight;
    const shellWidth = leftW + boardSize + rightW + 8;
    const shellX = x + (w - shellWidth) / 2;
    const boardX = shellX + leftW + 4;
    const laneTop = y + (h - totalHeight) / 2 + cueHeader;
    const laneX = boardX - GRID_X * scale;
    const laneY = laneTop + laneHeight - (LANE_Y + LANE_H) * scale;
    const boardTop = laneTop + laneHeight + gap;
    this.centerBaseX = laneX; this.centerBaseY = laneY; this.centerBaseScale = scale;
    this.portraitLaneTop = laneTop; // visible lane edge, shared by labels and masks
    this.tutorialViewTween?.stop(); this.tutorialViewTween = null;
    this.applyCenterView(laneX, laneY, scale);
    this.puzzleScale = puzzleScale;
    this.puzzleBox.setScale(puzzleScale).setPosition(boardX - GRID_X * puzzleScale, boardTop - GRID_Y * puzzleScale);
    this.centerBox.clearMask(true);
    if (!this.laneClip?.scene) this.laneClip = this.add.graphics().setVisible(false);
    this.laneClip.clear().fillStyle(0xffffff).fillRect(boardX - 1, laneTop, boardSize + 2, laneHeight);
    this.centerBox.setMask(this.laneClip.createGeometryMask());
    this.runProgressRect.setTo(boardX + 5, boardTop - gap / 2 - 3, boardSize - 10, 6);
    this.laneHudScale = Math.max(1, 1 / scale);
    const hudY = (laneTop - laneY) / scale;
    this.laneGuard.setScale(this.laneHudScale).setPosition(GRID_X + 6 / scale, hudY + 20 / scale);
    this.laneMutes.forEach((chip, i) => {
      chip.setScale(this.laneHudScale).setPosition(GRID_X + UI_W - (26 + i * 46) / scale, hudY + 24 / scale);
      const compact = Math.min(w, h) <= 600;
      (chip.getAt(0) as Phaser.GameObjects.Rectangle).setSize(compact ? 28 : 44, compact ? 28 : 40);
    });
    this.layoutBossBar();
    this.defBadge.setFontSize(this.worldFont(13, 15));
    if (this.tutorialViewTweenDone) {
      const done = this.tutorialViewTweenDone; this.tutorialViewTweenDone = null;
      this.time.delayedCall(0, done);
    }
    this.vignette?.setPosition(boardX + boardSize / 2, laneTop + laneHeight / 2)
      .setDisplaySize(boardSize, laneHeight);
    this.refreshHud();
    this.layoutPanels(shellX, y, shellWidth, h, boardX - 4, boardSize + 8);
  }

  /** Left panel = resources / score / gear; right panel = the vertical item-slot rack. Always visible. */
  private layoutPanels(x0: number, y0: number, uw: number, uh: number, cx: number, cw: number) {
    const portrait = !this.wideLayout;
    this.resourceChrome.clear().setVisible(portrait);
    const lLeft = x0;
    const lw = cx - x0; // left panel: usable-left -> centre-left
    const rLeft = cx + cw;
    const rw = x0 + uw - rLeft; // right panel: centre-right -> usable-right
    const midY = y0 + uh / 2;
    this.leftPanel.setPosition(lLeft + lw / 2, midY).setSize(lw - 8, uh - 8);
    this.rightPanel.setPosition(rLeft + rw / 2, midY).setSize(rw - 8, uh - 8);
    // fringe strips hug the inside of each rail's frame (see buildPanelTheme)
    this.panelRectL.setTo(lLeft + 4, y0 + 4, lw - 8, uh - 8);
    this.panelRectR.setTo(rLeft + 4, y0 + 4, rw - 8, uh - 8);
    for (const d of this.panelDecor) {
      const isL = d.side === "left";
      const px = isL ? lLeft : rLeft;
      const pw = isL ? lw : rw;
      if (d.edge === "side") {
        // a climbing strip down the rail's OUTER edge (clear of the text inset)
        const x = isL ? px + 4 + d.h / 2 : px + pw - 4 - d.h / 2;
        d.ts.setPosition(x, midY).setSize(d.h, uh - 12);
      } else {
        const y = d.edge === "bottom" ? midY + (uh - 8) / 2 - d.h / 2 - 2 : midY - (uh - 8) / 2 + d.h / 2 + 2;
        d.ts.setPosition(px + pw / 2, y).setSize(Math.max(8, pw - 14), d.h);
      }
    }
    this.rotateHint.setVisible(false);

    if (portrait) {
      // Reuse the biome panels as horizontal scenery, with no vertical rails.
      const above = this.portraitLaneTop;
      const below = this.portraitBoardBottom;
      this.leftPanel.setPosition(x0 + uw / 2, y0 + (above - y0) / 2)
        .setSize(uw, above - y0).setStrokeStyle(0).setDepth(-2);
      this.rightPanel.setPosition(x0 + uw / 2, below + (y0 + uh - below) / 2)
        .setSize(uw, y0 + uh - below).setStrokeStyle(0).setDepth(-2);
      this.panelRectL.setTo(x0, y0, uw, above - y0);
      this.panelRectR.setTo(x0, below, uw, y0 + uh - below);
      for (const d of this.panelDecor) {
        const rect = d.side === "left" ? this.panelRectL : this.panelRectR;
        if (!d.ts.getData("landscapeAlpha")) d.ts.setData("landscapeAlpha", d.ts.alpha);
        d.ts.setVisible(d.edge !== "side").setDepth(-1).setAlpha(d.side === "left" ? 0.22 : 0.45);
        d.ts.setPosition(x0 + uw / 2, d.edge === "top" ? rect.y + d.h / 2 : rect.bottom - d.h / 2)
          .setSize(uw, d.h);
      }
      // Four consistent resource pockets, with a separate 44px menu target.
      const compact = uw < 360, pad = 8, resourceGap = compact ? 4 : 6, menuW = 44;
      const topY = y0 + 23;
      const itemW = (uw - pad * 2 - menuW - 6 - resourceGap * 3) / this.resIcons.length;
      const chrome = this.resourceChrome;
      chrome.fillStyle(0x171f25, .9).fillRoundedRect(x0 + 2, y0 + 2, uw - 4, 60, 10);
      for (let i = 0; i < this.resIcons.length; i++) {
        const x = x0 + pad + (itemW + resourceGap) * i;
        chrome.fillStyle(0x29343b, .95).fillRoundedRect(x, y0 + 5, itemW, 36, 7);
        chrome.lineStyle(1, 0x53616a, .55).strokeRoundedRect(x, y0 + 5, itemW, 36, 7);
        this.resIcons[i].setVisible(true).setOrigin(.5).setPosition(x + (compact ? 14 : 17), topY)
          .setFontSize(compact ? 20 : 22);
        this.resVals[i].setVisible(true).setOrigin(1, .5).setPosition(x + itemW - (compact ? 5 : 7), topY)
          .setFontSize(20).setData("hudWidth", itemW - (compact ? 32 : 40));
      }
      const menuX = x0 + uw - pad - menuW;
      chrome.fillStyle(0x29343b, .95).fillRoundedRect(menuX, y0 + 1, menuW, 44, 8);
      chrome.lineStyle(1, 0x53616a, .55).strokeRoundedRect(menuX, y0 + 1, menuW, 44, 8);
      this.scoreText.setVisible(true).setPosition(x0 + uw / 2, y0 + 46).setFontSize(13).setColor("#c7d0d4");
      this.questText.setVisible(!this.arenaActive).setFontFamily(EMOJI_FONT).setFontSize(13).setLineSpacing(3)
        .setWordWrapWidth(uw - 24).setPosition(x0 + 12, below + 8);
      this.menuBtn.setOrigin(.5).setPosition(menuX + menuW / 2, topY).setFontSize(22)
        .setFixedSize(menuW, 44).setPadding(0, 8, 0, 0).setAlign("center").setStroke("#0a0b0f", 0);
      this.gearText.setPosition(x0 + uw - 8, y0 + uh - 8).setVisible(false);

      // Tall portrait screens use the freed height for larger, reachable items.
      // Keep buff chips compact and leave room for two lines of quest progress.
      const roomy = !this.arenaActive && this.portraitFooterHeight >= 228;
      const rows = roomy ? 2 : 1, cols = SLOT_N / rows;
      const gap = roomy ? 8 : 4;
      const cellW = (uw - 24 - (cols - 1) * gap) / cols;
      const slot = roomy
        ? Math.min(72, cellW, (this.portraitFooterHeight - 104 - gap) / rows)
        : Math.min(56, cellW);
      const bottomPad = this.arenaActive ? 10 : 18;
      const rackHeight = rows * slot + (rows - 1) * gap;
      const rackTop = y0 + uh - bottomPad - rackHeight;
      this.activeEffects?.place(x0 + 12, rackTop - 38, uw - 24, 26, false);
      for (let i = 0; i < SLOT_N; i++) {
        const x = Math.round(x0 + 12 + cellW / 2 + (i % cols) * (cellW + gap));
        const rackY = Math.round(rackTop + slot / 2 + Math.floor(i / cols) * (slot + gap));
        const it = this.itemSlots[i];
        it.x = x; it.y = rackY; it.s = slot;
        it.bg.setPosition(x, rackY).setSize(slot, slot);
        if (it.bg.input) (it.bg.input.hitArea as Phaser.Geom.Rectangle).setSize(slot, slot);
        it.inner.setPosition(x, rackY).setSize(slot - 10, slot - 10);
        it.plus.setPosition(x, rackY).setFontSize(Math.round(slot * 0.4)).setVisible(!it.icon);
        it.icon?.setPosition(x, rackY).setFontSize(Math.round(slot * 0.52));
      }
      this.hideTip();
      this.refreshHud();
      return;
    }

    this.leftPanel.setDepth(0).setStrokeStyle(2, 0x526342);
    this.rightPanel.setDepth(0).setStrokeStyle(2, 0x526342);
    this.panelDecor.forEach(d => d.ts.setVisible(true).setDepth(0).setAlpha(d.ts.getData("landscapeAlpha") ?? d.ts.alpha));
    this.questText.setVisible(true).setFontFamily(EMOJI_FONT).setFontSize(14).setLineSpacing(3);
    this.scoreText.setVisible(true).setFontSize(17).setColor("#ffe08a");
    this.gearText.setVisible(false);
    this.resIcons.forEach((icon) => icon.setVisible(true).setOrigin(0, .5));
    this.resVals.forEach((value) => value.setVisible(true).setOrigin(0, .5).setData("hudWidth", 0));

    // Resources use a 2×2 block on the narrow rail. Four vertical rows consumed
    // nearly half a phone screen and forced quests down into the hint button.
    const padX = lLeft + 12;
    const lcx = lLeft + lw / 2;
    const rowH = Math.min(42, Math.max(32, uh * 0.09));
    const topY = y0 + Math.max(30, uh * 0.1);
    const colW = (lw - 16) / 2;
    for (let i = 0; i < this.resIcons.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = lLeft + 8 + col * colW;
      const y = Math.round(topY + row * rowH);
      this.resIcons[i].setPosition(Math.round(x), y).setFontSize(lw < 165 ? 21 : 26);
      this.resVals[i].setPosition(Math.round(x + (lw < 165 ? 25 : 34)), y).setFontSize(lw < 165 ? 18 : 24);
    }

    // Each section starts after the measured content above it. Quest/effect copy
    // is width-bounded as a final guard against spilling into the board.
    const scoreY = Math.round(topY + rowH * 2 + 8);
    this.scoreText.setPosition(Math.round(lcx), scoreY);
    this.questText.setWordWrapWidth(Math.max(80, lw - 24), true);
    const questY = Math.round(scoreY + this.scoreText.height + 12);
    this.questText.setPosition(padX, questY);
    const effectsY = Math.round(questY + this.questText.height + 10);
    this.activeEffects?.place(padX, effectsY, Math.max(80, lw - 24), Math.max(36, y0 + uh - 56 - effectsY), true);

    this.gearText.setPosition(lLeft + lw - 40, y0 + uh - 12);
    this.menuBtn.setOrigin(1, 0).setPosition(x0 + uw - 10, y0 + 6).setFontSize(24)
      .setFixedSize(0, 0).setPadding(0).setAlign("left").setStroke("#0a0b0f", 4);

    // right: item slots, vertical, centred
    const gap = 5;
    const slot = Math.max(32, Math.min(rw - 16, (uh - 54 - (SLOT_N - 1) * gap) / SLOT_N, 70));
    const totalH = SLOT_N * slot + (SLOT_N - 1) * gap;
    for (let i = 0; i < SLOT_N; i++) {
      const x = rLeft + rw / 2;
      const y = Math.round(y0 + 48 + (uh - 48 - totalH) / 2 + slot / 2 + i * (slot + gap));
      const it = this.itemSlots[i];
      it.x = x;
      it.y = y;
      it.s = slot;
      it.bg.setPosition(x, y).setSize(slot, slot);
      // keep the pointer hit area in step with the resized rectangle
      if (it.bg.input) (it.bg.input.hitArea as Phaser.Geom.Rectangle).setSize(slot, slot);
      it.inner.setPosition(x, y).setSize(slot - 10, slot - 10);
      it.plus.setPosition(x, y).setFontSize(Math.round(slot * 0.4)).setVisible(!it.icon);
      it.icon?.setPosition(x, y).setFontSize(Math.round(slot * 0.52));
    }
    this.hideTip(); // slot geometry moved — a floating tooltip would be orphaned
  }

  // --- HUD panels (positions are set later by layout()) ---
  private buildPanels() {
    // the rails wear the zone: tinted body + hand-baked fringe art (buildPanelTheme),
    // muted and edge-hugging so the resources/slots stay the first read
    const theme = this.buildPanelTheme();
    this.leftPanel = this.add.rectangle(0, 0, 10, 10, theme.body).setStrokeStyle(2, theme.edge);
    this.rightPanel = this.add.rectangle(0, 0, 10, 10, theme.body).setStrokeStyle(2, theme.edge);
    this.panelDecor = [];
    for (const side of ["left", "right"] as const)
      for (const d of theme.decor) {
        const ts = this.add.tileSprite(0, 0, 8, d.h, d.key).setAlpha(d.alpha);
        this.panelDecor.push({ ts, edge: d.edge, h: d.h, side });
      }
    this.buildPanelLife(theme.kind); // created HERE so the critters render under the text/slots
    this.runProgress = this.add.graphics().setDepth(-0.5);
    this.resourceChrome = this.add.graphics().setDepth(1);

    // resources: one icon + one number per row, positioned explicitly so spacing is exact
    const RES_GLYPHS = ["🪵", "🪨", "💎", "🔑"];
    this.resIcons = [];
    this.resVals = [];
    for (const g of RES_GLYPHS) {
      this.resIcons.push(this.add.text(0, 0, g, { fontFamily: EMOJI_FONT, fontSize: "26px" }).setOrigin(0, 0.5).setDepth(2));
      this.resVals.push(
        this.add.text(0, 0, "0", { fontFamily: "monospace", fontStyle: "bold", fontSize: "24px", color: "#dfe3ea" }).setOrigin(0, 0.5).setDepth(2),
      );
    }
    this.scoreText = this.add
      .text(0, 0, "", { fontFamily: "monospace", fontSize: "17px", color: "#ffe08a", lineSpacing: 2, align: "center" })
      .setOrigin(0.5, 0).setDepth(2); // centred in the rail (layoutPanels feeds it the panel centre)
    this.questText = this.add
      .text(0, 0, "", { fontFamily: "monospace", fontSize: "14px", color: "#b9d8b9", lineSpacing: 4 })
      .setOrigin(0, 0);
    this.menuBtn = this.add
      .text(0, 0, "☰", { fontFamily: "monospace", fontStyle: "bold", fontSize: "24px", color: "#c7ccd6", stroke: "#0a0b0f", strokeThickness: 4 })
      .setOrigin(1, 0)
      .setDepth(80)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.openMenu());
    this.gearText = this.add.text(0, 0, "⚙", { fontFamily: EMOJI_FONT, fontSize: "26px", color: "#c7ccd6" }).setOrigin(0, 1);
    // dev-only combo rig — in production an accidental tap here instantly rewrote
    // the whole board mid-run ("my board just reset?!"), so the gear ships hidden
    if (import.meta.env.DEV) this.gearText.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.debugCombo());
    else this.gearText.setVisible(false);
    this.buildDevBar();
    this.rotateHint = this.add
      .text(0, 0, "↻ rotate to landscape", { fontFamily: "monospace", fontSize: "16px", color: "#9aa0ab" })
      .setOrigin(0.5, 0)
      .setVisible(false);

    this.itemSlots = [];
    for (let i = 0; i < SLOT_N; i++) {
      const bg = this.add.rectangle(0, 0, 10, 10, 0x101319).setStrokeStyle(2, 0x2a2d38);
      const inner = this.add.rectangle(0, 0, 8, 8, 0x0a0c11);
      const plus = this.add.text(0, 0, "+", { fontFamily: "monospace", fontSize: "20px", color: "#3a3f4b" }).setOrigin(0.5);
      this.itemSlots.push({ x: 0, y: 0, s: 40, bg, inner, plus, icon: null, item: null });
      this.wireSlot(i, bg);
    }
    this.refreshHud();
  }

  /**
   * Slot input: TAP uses the item; HOVER (mouse) shows the tooltip instantly;
   * PRESS-AND-HOLD (touch) shows it too — and that release doesn't fire the item.
   */
  private wireSlot(i: number, bg: Phaser.GameObjects.Rectangle) {
    bg.setInteractive({ useHandCursor: true });
    bg.on("pointerover", (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) this.showTip(i); // mouse hover — touch reads via hold instead
    });
    bg.on("pointerout", () => {
      this.hideTip(i);
      this.cancelHold();
    });
    bg.on("pointerdown", () => {
      if (this.chestActive) return; // taps there belong to the skip handler
      this.holdShown = false;
      const slot = this.itemSlots[i];
      if (slot.item) {
        const targets: Phaser.GameObjects.GameObject[] = [bg, slot.inner];
        if (slot.icon) targets.push(slot.icon);
        this.tweens.add({ targets, scale: 0.92, duration: 70, yoyo: true });
      }
      this.cancelHold();
      this.holdTimer = this.time.delayedCall(HOLD_TIP_MS, () => {
        this.holdShown = true;
        this.showTip(i);
      });
    });
    bg.on("pointerup", (p: Phaser.Input.Pointer) => {
      this.cancelHold();
      if (this.holdShown) {
        // this press was a "read the tooltip" hold — release just closes it
        if (p.wasTouch) this.hideTip(i);
        this.holdShown = false;
        return;
      }
      this.useSlot(i);
    });
  }

  private cancelHold() {
    this.holdTimer?.remove(false);
    this.holdTimer = null;
  }
  private refreshHud() {
    this.drawRunProgress();
    const r = this.run.resources;
    const vals = [r.wood, r.ore, r.treasure, r.keys];
    for (let i = 0; i < this.resVals.length; i++) {
      const label = this.resVals[i], width = label.getData("hudWidth") as number | undefined;
      label.setText(`${vals[i]}`);
      if (width) {
        // Keep growing counts inside their pocket; large totals use compact notation.
        if (vals[i] >= 1000) label.setText(Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 0 }).format(vals[i]));
        label.setFontSize(20);
        if (label.width > width) label.setFontSize(Math.max(12, Math.floor(20 * width / label.width)));
      }
    }
    this.scoreText.setText(`DEPTH ${this.run.killed}/20${this.wideLayout ? "\n" : "   ·   "}SCORE ${this.run.score}`);
    if (this.run.score > this.lastScoreShown) {
      this.lastScoreShown = this.run.score;
      this.tweens.killTweensOf(this.scoreText);
      this.scoreText.setScale(1);
      this.tweens.add({ targets: this.scoreText, scale: 1.09, duration: 90, yoyo: true }); // a little thump as it climbs
    }
    // Automatic objectives, with live progress and one quiet completion cue.
    const live = { kills: this.run.killed, chests: this.chestsOpened, wood: r.wood, ore: r.ore };
    let newlyComplete=false;
    const lines = currentQuests(this.meta).map((aq) => {
      const q = questById(aq.id);
      if (!q) return "";
      const p = questProgress(this.meta, aq, live);
      if (p.have >= p.need && !this.completedQuestCues.has(aq.id)) {
        this.completedQuestCues.add(aq.id);newlyComplete=true;
      }
      // The camp board keeps the full oath wording. The rail needs a compact
      // label so all three progress counters remain inside its narrow column.
      const short = q.shortLabel
        .replace(/^slay (the )?/, "")
        .replace(/^open /, "")
        .replace(/^haul /, "")
        .replace(/^hire the /, "hire ")
        .replace(/^clear the /, "clear ")
        .replace(/ run$/, "");
      return `${p.have >= p.need ? "✓ " : ""}${short} ${p.have}/${p.need}`;
    });
    this.questText.setText(lines.length
      ? lines.filter(Boolean).join("  •  ")
      : allQuestsDone(this.meta) ? "Area quests complete · Milestones at camp" : "Quests start automatically at camp");
    if(newlyComplete && !this.run.over && !this.tutorial?.active) {
      this.questText.setColor("#ffe0a0");
      this.tweens.killTweensOf(this.questText);this.questText.setAlpha(1);
      this.tweens.add({targets:this.questText,alpha:.6,duration:180,yoyo:true,repeat:1});
      this.sfx("coin3",.22);
    }
  }

  /** Run distance is earned by defeating enemies; bosses mark the milestones. */
  private drawRunProgress() {
    const g = this.runProgress;
    const { x, y, width, height } = this.runProgressRect;
    if (!g || width <= 0) return;
    g.setVisible(!this.chestActive);
    const completed = Phaser.Math.Clamp(this.run.killed, 0, RUN_COMPLETE_AT);
    const filled = width * completed / RUN_COMPLETE_AT;
    g.clear();
    g.fillStyle(0x172a2c).fillRoundedRect(x, y, width, height, 3);
    g.lineStyle(1, 0x405559).strokeRoundedRect(x, y, width, height, 3);
    if (filled > 0) g.fillStyle(0x83dcc1).fillRoundedRect(x, y, Math.max(height, filled), height, 3);
    for (let depth = BOSS_EVERY; depth <= RUN_COMPLETE_AT; depth += BOSS_EVERY) {
      const mx = x + width * depth / RUN_COMPLETE_AT;
      const my = y + height / 2;
      g.fillStyle(completed >= depth ? 0xf4d48c : 0x7b6749);
      g.lineStyle(1, 0xf4d48c);
      const diamond = [{ x: mx, y: my - 4 }, { x: mx + 4, y: my }, { x: mx, y: my + 4 }, { x: mx - 4, y: my }];
      g.fillPoints(diamond, true).strokePoints(diamond, true);
    }
    g.fillStyle(0xe1fff3).fillCircle(x + filled, y + height / 2, 3);
  }

  // --- runner lane (all objects live in centerBox, design-local coords) ---
  private layoutLaneBackdrop(height: number) {
    const y = LANE_Y + LANE_H - height / 2;
    for (const { sprite } of this.parallax) {
      sprite.setPosition(CXC, y).setSize(UI_W, height).setTileScale(height / PARALLAX_SRC_H);
    }
    this.laneFrame?.setPosition(CXC, y).setSize(UI_W, height);
    this.laneRainWash?.setPosition(CXC, y).setSize(UI_W, height);
  }

  private buildLane() {
    this.laneMutes = [];
    this.laneRainWash = undefined;
    // --- parallax world backdrop, back-to-front (each layer fills the lane) ---
    const pscale = LANE_H / PARALLAX_SRC_H; // fit the 216-tall layers into the lane
    this.parallax = [];
    for (const { key, scroll: s } of this.world.parallax) {
      const ts = this.inBox(this.add.tileSprite(CXC, LANE_Y + LANE_H / 2, UI_W, LANE_H, key)).setTileScale(pscale);
      this.parallax.push({ sprite: ts, scroll: s });
    }

    // The selected supply route is another scenery layer, below terrain and actors.
    this.roadScenery = new RoadScenery(this, this.centerBox, this.run.biome, GRID_X, UI_W, GROUND_Y,
      this.run.roadFork, this.run.killed);

    // ground band the hero runs along
    this.floor = this.inBox(this.add.tileSprite(CXC, GROUND_Y + FLOOR_H / 2, UI_W, FLOOR_H, this.world.groundKey)).setTileScale(FLOOR_SCALE);
    if (this.run.biome === "snow") {
      this.inBox(frostMist(this, UI_W, 120, .82).setPosition(GRID_X, GROUND_Y - 100), false);
    }

    // wet runs read overcast: a cool wash over the backdrop, under the characters
    if (this.rainy) this.laneRainWash = this.inBox(this.add.rectangle(CXC, LANE_Y + LANE_H / 2, UI_W, LANE_H, 0x0a1626, 0.16));

    this.laneFrame = this.inBox(this.add.rectangle(CXC, LANE_Y + LANE_H / 2, UI_W, LANE_H).setStrokeStyle(2, 0x2a2d38));
    this.inBox(this.add.text(SKULL_X, GROUND_Y + 4, "☠", { fontSize: "48px", color: "#c0424a" }).setOrigin(0.5, 1));

    // guard badge, top-left of the lane: the shield count lives IN the fight,
    // right where the strikes it answers land (renderBuffs keeps it current)
    const gbBg = this.add.rectangle(0, 0, 74, 30, 0x0c1018, 0.72).setOrigin(0, 0.5).setStrokeStyle(2, 0x3a5a7a, 0.9);
    const gbIcon = this.add.text(8, 0, "🛡️", { fontFamily: EMOJI_FONT, fontSize: "17px" }).setOrigin(0, 0.5);
    this.laneGuardText = this.add
      .text(34, 1, "×0", { fontFamily: "monospace", fontStyle: "bold", fontSize: "18px", color: "#6a707c", stroke: "#0a0b0f", strokeThickness: 4 })
      .setOrigin(0, 0.5);
    this.laneGuard = this.inBox(this.add.container(GRID_X + 8, LANE_Y + 22, [gbBg, gbIcon, this.laneGuardText]).setDepth(30));
    this.laneGuardLast = -1;

    // quick-mute chips, top-right of the lane: 🔊 (effects + ambience) and 🎵
    // (music). Toggles persist in the audio settings and re-level live beds.
    const mkMute = (
      x: number,
      glyphFor: (muted: boolean) => string,
      isMuted: () => boolean,
      flip: () => void,
    ) => {
      const bg = this.add.rectangle(0, 0, 44, 40, 0x0c1018, 0.72).setStrokeStyle(2, 0x3a4152, 0.9);
      const ic = this.add.text(0, 1, "", { fontFamily: EMOJI_FONT, fontSize: "15px" }).setOrigin(0.5);
      const slash = this.add.line(0, 0, -9, 9, 9, -9, 0xff6a5a, 1).setLineWidth(2).setVisible(false);
      // The visible mobile chip is compact; its invisible touch area stays generous.
      const hit = this.add.zone(0, 0, 44, 44);
      this.laneMutes.push(this.inBox(this.add.container(x, LANE_Y + 22, [bg, ic, slash, hit]).setDepth(30)));
      const paint = () => {
        const m = isMuted();
        ic.setText(glyphFor(m)).setAlpha(m ? 0.4 : 1);
        slash.setVisible(m);
      };
      paint();
      hit.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
        flip();
        this.game.events.emit("audio-changed"); // live beds re-level immediately
        paint();
        this.sfx("swap", 0.3); // audible only when sound survived the toggle
      });
    };
    mkMute(
      GRID_X + UI_W - 26,
      (m) => (m ? "🔇" : "🔊"),
      () => audioSettings().muteSound,
      () => setAudioSettings({ muteSound: !audioSettings().muteSound }),
    );
    mkMute(
      GRID_X + UI_W - 68,
      () => "🎵",
      () => audioSettings().muteMusic,
      () => setAudioSettings({ muteMusic: !audioSettings().muteMusic }),
    );

    this.hero = this.inBox(
      this.add.sprite(SAFE_X, GROUND_Y, PLAYER_TEXTURE).setOrigin(0.5, HERO_ORIGIN).setScale(HERO_SCALE / PLAYER_DENSITY).play("hero-idle"),
    );

    this.enemyHpBg = this.inBox(this.add.rectangle(0, 0, HP_W, 10, 0x000000, 0.55).setOrigin(0.5).setVisible(false));
    this.enemyHpBar = this.inBox(this.add.rectangle(0, 0, HP_W, 10, 0xe05a5a).setOrigin(0, 0.5).setVisible(false));
    // defense badge: what this foe shrugs off (🛡⚔ iron hide / 🛡🪄 spell ward)
    this.defBadge = this.inBox(this.add.text(0, 0, "", { fontFamily: EMOJI_FONT, fontSize: "13px" }).setOrigin(0, 0.5).setDepth(21).setVisible(false));

    // rain streaks fall in front of the actors, dying just above the ground band
    if (this.rainy) {
      if (!this.textures.exists("raindrop")) {
        const cv = document.createElement("canvas");
        cv.width = 2;
        cv.height = 12;
        const g = cv.getContext("2d")!;
        const gr = g.createLinearGradient(0, 0, 0, 12);
        gr.addColorStop(0, "rgba(190,215,255,0)");
        gr.addColorStop(1, "rgba(190,215,255,0.9)");
        g.fillStyle = gr;
        g.fillRect(0, 0, 2, 12);
        this.textures.addCanvas("raindrop", cv);
      }
      this.inBox(
        this.add.particles(0, 0, "raindrop", {
          x: { min: GRID_X, max: GRID_X + UI_W },
          y: LANE_Y - 6,
          speedY: { min: 560, max: 700 },
          speedX: { min: -60, max: -25 }, // wind leans with the world's drift
          lifespan: 350,
          quantity: 2,
          frequency: 30,
          alpha: { start: 0.7, end: 0.25 },
          scaleY: { min: 1, max: 1.6 },
        }),
      );
    }

    // the glacial pass snows, always — fat lazy flakes wandering down the lane
    if (this.meta.biome === "snow") {
      if (!this.textures.exists("snowflake")) {
        const cv = document.createElement("canvas");
        cv.width = cv.height = 5;
        const g = cv.getContext("2d")!;
        const gr = g.createRadialGradient(2.5, 2.5, 0.3, 2.5, 2.5, 2.5);
        gr.addColorStop(0, "rgba(255,255,255,0.95)");
        gr.addColorStop(1, "rgba(230,240,255,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, 5, 5);
        this.textures.addCanvas("snowflake", cv);
      }
      this.inBox(
        this.add.particles(0, 0, "snowflake", {
          x: { min: GRID_X, max: GRID_X + UI_W },
          y: LANE_Y - 4,
          speedY: { min: 26, max: 55 },
          speedX: { min: -18, max: 10 },
          accelerationX: { min: -8, max: 8 }, // a wandering drift, not a fall
          lifespan: 4200,
          quantity: 1,
          frequency: 120,
          alpha: { start: 0.9, end: 0.15 },
          scale: { min: 0.6, max: 1.3 },
        }),
      );
    }
  }

  // --- board ---
  private syncEmpoweredCell() {
    for (const charge of this.empowered.charges) {
      const tile = this.empoweredTiles.get(charge.id);
      if (!tile) continue;
      for (let r=0;r<this.tiles.length;r++) for(let c=0;c<this.tiles[r].length;c++)
        if(this.tiles[r][c]===tile) charge.cell={r,c};
    }
  }

  private maybeEmpower() {
    if (this.tutorial?.active || this.empowered.moves < this.empowered.nextAt || this.empowered.charges.some(c => c.random)) return;
    this.syncEmpoweredCell();
    const charge = randomEmpower(this.empowered, this.grid, cell => this.isIceLocked(cell));
    if (!charge?.cell) return;
    const tile = this.tiles[charge.cell.r][charge.cell.c]!;
    this.empoweredTiles.set(charge.id, tile);
    decorateEmpowered(this, tile, charge.type, 2);
    this.sfx("pickup", .28, 1.3);
    this.writeCheckpoint(true);
  }

  private consumeEmpowered(ids: number[]) {
    this.syncEmpoweredCell();
    for (const charge of this.empowered.charges.filter(c => ids.includes(c.id))) {
      const cell=charge.cell;
      if(cell) empoweredBurst(this,this.puzzleBox,this.xFor(cell.c),this.yFor(cell.r),charge.type,charge.multiplier ?? 2);
      if(charge.random) this.empowered.nextAt = this.empowered.moves + 6 + Math.floor(Math.random() * 3);
      this.empoweredTiles.delete(charge.id);
    }
    this.empowered.charges=this.empowered.charges.filter(c => !ids.includes(c.id));
    this.empowered.layouts={};
    this.sfx("spell",.35,1.2);buzz(22);
  }

  private syncBoardOrientation(wide: boolean) {
    const cols = wide ? 10 : 7;
    if (this.boardCols === cols || !this.boardFrame || !this.grid?.length ||
        this.busy || this.chestActive || this.arenaActive || this.targeting ||
        this.tutorial?.active || this.run.over || this.runCompleteShown) return;
    if (this.grid.some(row => row.includes(EMPTY))) return;
    const attempt = `${cols}:${JSON.stringify(this.grid)}`;
    if (attempt === this.failedBoardReflow) return;
    const next = reflowBoard(this.grid, wide, this.boardLayouts);
    if (!next) { this.failedBoardReflow = attempt; return; }
    this.syncEmpoweredCell();
    reflowEmpowered(this.empowered, this.grid, next.grid);
    this.empoweredTiles.clear();
    this.down = null;
    this.clearSelection();
    this.clearHint();
    for (const row of this.tiles) for (const tile of row) tile?.destroy();
    this.grid = next.grid; this.boardLayouts = next.layouts;
    this.boardCols = cols; this.boardRows = wide ? 5 : 7;
    this.tiles = this.grid.map((row, r) => row.map((type, c) => this.makeTile(r, c, type)));
    this.boardFrame.setPosition(this.boardCenter, GRID_Y + this.boardHeight / 2)
      .setSize(this.boardWidth + 8, this.boardHeight + 8);
    this.boardAtmosphere?.resize(this.boardCols, this.boardRows);
    this.idleBoardTime = 0; this.idleHintShown = false;
    reflowIce(this.run.biome, this.run.zone!, this.grid);
  }

  private buildBoard() {
    this.boardFrame = this.inBox(this.add.rectangle(this.boardCenter, GRID_Y + this.boardHeight / 2, this.boardWidth + 8, this.boardHeight + 8, 0x0e1015).setStrokeStyle(2, 0x2a2d38));
    const atmosphere = this.run.biome === "snow" ? frozenBoardArt : this.run.biome === "forest" ? forestBoardArt
      : this.run.biome === "dungeon" ? delveBoardArt : null;
    if (atmosphere) {
      this.boardAtmosphere = atmosphere(this, this.boardCols, this.boardRows, TILE);
      this.inBox(this.boardAtmosphere.root.setPosition(GRID_X, GRID_Y), true);
      this.boardAtmosphere.syncCache?.(this.run.zone!.locks, this.run.zone!.caches);
    }
    this.grid = this.recovered ? structuredClone(this.recovered.grid) : makeInitialGrid(Math.random, this.boardCols, this.boardRows);
    this.tiles = Array.from({ length: this.boardRows }, () => Array<Phaser.GameObjects.Container | null>(this.boardCols).fill(null));
    for (let r = 0; r < this.boardRows; r++)
      for (let c = 0; c < this.boardCols; c++) this.tiles[r][c] = this.makeTile(r, c, this.grid[r][c]);
    this.selection = this.inBox(this.add.rectangle(0, 0, FACE + 4, FACE + 4)
      .setStrokeStyle(3, 0xffe6aa).setDepth(51).setVisible(false), true);
    this.zoneArt = this.inBox(this.add.graphics().setDepth(48), true);
    this.zoneArtSignature = "";
    thawIfStuck(this.run.biome, this.run.zone!, this.grid);
  }
  private makeTile(r: number, c: number, type: number): Phaser.GameObjects.Container {
    const face = this.add.image(0, 0, tileArtKey(type)).setDisplaySize(FACE, FACE);
    const visual = this.add.container(0, 0, [face]);
    const tile = this.inBox(this.add.container(this.xFor(c), this.yFor(r), [visual]).setData("type", type).setData("visual", visual), true);
    this.syncTileShine(tile);
    tile.once("destroy", () => this.tweens.killTweensOf([tile, visual]));
    if (type === POTION) tile.setData("potionCue", decoratePotion(this, tile));
    const charge = this.empowered.charges.find(p => p.type === type && p.cell?.r === r && p.cell?.c === c);
    if (charge && !this.empoweredTiles.has(charge.id)) {
      this.empoweredTiles.set(charge.id, tile); decorateEmpowered(this, tile, type, charge.multiplier ?? 2);
    }
    return tile;
  }

  private syncTileShine(tile: Phaser.GameObjects.Container) {
    const current = tile.getData("shine") as Phaser.GameObjects.Sprite | undefined;
    if (!tileEffectsEnabled() || tile.getData("empowered")) {
      current?.destroy();
      tile.setData("shine", null);
      return;
    }
    if (current?.scene) return;
    const shine = this.add.sprite(0, 0, TILE_SHINE_KEY, 0).setDisplaySize(FACE, FACE)
      .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.4);
    // Keep potion action badges above the decorative glint when toggled mid-run.
    tileVisual(tile).addAt(shine, tile.getData("potionSheen")?.scene ? 2 : 1);
    tile.setData("shine", shine);
    shine.play({
      key: TILE_SHINE_ANIM,
      delay: Phaser.Math.Between(500, 7200),
      repeat: -1,
      repeatDelay: Phaser.Math.Between(6500, 9000),
      showBeforeDelay: true,
    });
  }

  // --- input ---
  private buildInput() {
    const blocked = () => this.busy || this.run.over || this.runCompleteShown || this.chestActive || this.arenaActive || this.tutorial?.lockBoard || !!this.targeting;
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.down || (!p.wasTouch && !p.leftButtonDown())) return;
      if (this.targeting) {
        this.onTargetTap(p); // an armed item is waiting for its board tap
        return;
      }
      if (blocked()) return;
      const coord = this.cellAt(p.x, p.y);
      if (coord) {
        this.clearHint();
        this.swapPreview.cancel(true);
        this.down = { coord, x: p.x, y: p.y, pointerId: p.id, dragged: false };
        this.releaseTilePress();
        this.pressedTile = this.isIceLocked(coord) ? null : this.tiles[coord.r][coord.c];
        if (this.pressedTile) liftTile(this, this.pressedTile, true);
      }
      else this.clearSelection();
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.down || this.down.pointerId !== p.id) return;
      if (!p.isDown || p.wasCanceled || blocked()) { this.clearSelection(); return; }
      this.previewTileDrag(p);
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (!this.down || this.down.pointerId !== p.id) return;
      if (p.wasCanceled || blocked() || !this.cellAt(p.x, p.y, TILE * .35)) { this.clearSelection(); return; }
      this.previewTileDrag(p);
      const { coord, x, y, dragged } = this.down;
      this.releaseTilePress();
      this.down = null;
      const target = dragSwapTarget(coord, (p.x - x) / this.puzzleScale, (p.y - y) / this.puzzleScale,
        TILE, this.boardCols, this.boardRows);
      if (dragged || target) {
        if (target) void this.trySwap(coord, target);
        else this.clearSelection();
        return;
      }
      if (this.isIceLocked(coord)) {
        this.clearSelection();
        const released = this.cellAt(p.x, p.y);
        if (released?.r !== coord.r || released.c !== coord.c) return;
        const hit = tapIce(this.run.biome, this.run.zone!, this.boardCols, coord);
        if (hit) {
          this.inBox(iceBurst(this, this.xFor(coord.c), this.yFor(coord.r), 36, hit.broken ? 1 : .35), true);
          this.sfx(hit.broken ? "block2" : "block1", hit.broken ? .4 : .25, 1 + hit.hits * .12);
          buzz(hit.broken ? 18 : 8);
          this.drawZonePatches();
          this.updatePotionCues();
          this.refreshHud();
          this.writeCheckpoint(true);
        }
        return;
      }
      if (this.grid[coord.r][coord.c] === POTION) {
        this.clearSelection();
        void this.drinkPotionAt(coord);
      } else if (this.selected && Math.abs(this.selected.r - coord.r) + Math.abs(this.selected.c - coord.c) === 1) {
        void this.trySwap(this.selected, coord);
      } else if (this.selected?.r === coord.r && this.selected.c === coord.c) {
        this.clearSelection();
      } else {
        this.selected = coord;
        this.selection.setPosition(this.xFor(coord.c), this.yFor(coord.r)).setVisible(true);
        this.sfx("swap", 0.12, 1.2);
        haptic("tap");
      }
    });
    this.input.on("pointerupoutside", (p: Phaser.Input.Pointer) => {
      if (this.down?.pointerId === p.id) this.clearSelection();
    });
    this.input.on("gameout", () => this.clearSelection());
    const cancel = () => this.clearSelection(true);
    this.events.on(Phaser.Scenes.Events.PAUSE, cancel);
    this.game.events.on(Phaser.Core.Events.BLUR, cancel);
    for (const event of ["touchcancel", "pointercancel"]) this.game.canvas.addEventListener(event, cancel, true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      cancel();
      this.events.off(Phaser.Scenes.Events.PAUSE, cancel);
      this.game.events.off(Phaser.Core.Events.BLUR, cancel);
      for (const event of ["touchcancel", "pointercancel"]) this.game.canvas.removeEventListener(event, cancel, true);
    });
    this.input.keyboard?.on("keydown-H", () => this.showHint());
    for (let i = 0; i < SLOT_N; i++) this.input.keyboard?.on(`keydown-${i + 1}`, () => this.useSlot(i));
  }

  private previewTileDrag(p: Phaser.Input.Pointer) {
    if (!this.down) return;
    const { coord, x, y } = this.down;
    const dx = (p.x - x) / this.puzzleScale, dy = (p.y - y) / this.puzzleScale;
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= TILE * .3) this.down.dragged = true;
    const target = this.cellAt(p.x, p.y, TILE * .35) ? dragSwapTarget(coord, dx, dy, TILE, this.boardCols, this.boardRows) : null;
    if (!target || this.isIceLocked(coord) || this.isIceLocked(target)) { this.swapPreview.cancel(); return; }
    const a = this.tiles[coord.r][coord.c], b = this.tiles[target.r][target.c];
    if (!a || !b) { this.swapPreview.cancel(); return; }
    this.selected = null;
    this.selection.setVisible(false);
    this.swapPreview.show(a, b, { x: this.xFor(coord.c), y: this.yFor(coord.r) },
      { x: this.xFor(target.c), y: this.yFor(target.r) });
  }

  private clearSelection(immediate = false) {
    this.down = null;
    this.swapPreview?.cancel(immediate);
    this.releaseTilePress();
    this.selected = null;
    this.selection?.setVisible(false);
  }

  private releaseTilePress() {
    if (this.pressedTile?.scene) liftTile(this, this.pressedTile, false);
    this.pressedTile = null;
  }

  private isIceLocked(cell: Coord) {
    return iceLocked(this.run.biome, this.run.zone!, this.boardCols, cell);
  }

  private updatePotionCues() {
    const available = !this.busy && !this.run.over && !this.runCompleteShown && !this.chestActive &&
      !this.arenaActive && !this.tutorial?.lockBoard && !this.targeting && !this.down?.dragged;
    for (let r = 0; r < this.boardRows; r++) for (let c = 0; c < this.boardCols; c++) {
      if (this.grid[r]?.[c] !== POTION) continue;
      const cue = this.tiles[r]?.[c]?.getData("potionCue") as ReturnType<typeof decoratePotion> | undefined;
      cue?.setReady(available && !this.isIceLocked({ r, c }));
    }
  }

  private drawZonePatches() {
    this.boardAtmosphere?.root.setVisible(!this.chestActive && !this.arenaActive);
    this.zoneArt.setVisible(!this.chestActive && !this.arenaActive && !this.tutorial?.active && !this.run.over);
    const state = this.run.zone!;
    this.boardAtmosphere?.syncCache?.(state.locks, state.caches);
    const signature = `${this.run.biome}:${this.boardCols}:${state.marks.map(i => `${i}:${state.iceHits[i] ?? 0}`).join(",")}`;
    if (signature === this.zoneArtSignature) return;
    this.zoneArtSignature = signature;
    this.puzzleBox.bringToTop(this.zoneArt);
    const g = this.zoneArt.clear();
    for (const i of state.marks) {
      const x = this.xFor(i % this.boardCols), y = this.yFor(Math.floor(i / this.boardCols));
      if (this.run.biome === "snow") {
        frozenTile(g, x, y, 78, state.iceHits[i] ?? 0);
      }
    }
  }

  // --- per-frame: scroll pressure (only while engaged) + sprite placement ---
  update(_time: number, delta: number) {
    this.tileShatter.update(delta);
    if (this.down && (this.busy || this.run.over || this.runCompleteShown || this.chestActive ||
        this.arenaActive || this.tutorial?.lockBoard || this.targeting)) this.clearSelection(true);
    // Resize immediately if safe; otherwise apply the latest orientation once the move ends.
    const wantedCols = this.wideLayout ? 10 : 7;
    if (this.boardCols !== wantedCols) {
      this.syncBoardOrientation(this.wideLayout);
      if (this.boardCols === wantedCols) this.layout();
    }
    if (_time - this.checkpointAt > 1000) { this.checkpointAt = _time; this.writeCheckpoint(); }
    const dts = delta / 1000;
    const fighting = this.phase === "fight" && !this.run.over && !this.orcDying && !this.tutorial?.active && !this.arenaActive;
    if (fighting && !this.busy && !this.down && !this.chestActive && !this.targeting && this.run.enemy?.kind !== "boss") this.maybeEmpower();
    if (fighting && !this.busy && !this.chestActive && !this.targeting && this.run.enemy?.kind !== "boss") {
      if (seedZonePatches(this.run.biome, this.run.zone!, this.grid, this.run.killed)) {
        this.clearHint();
        this.refreshHud();
      }
    }
    this.drawZonePatches();
    if (fighting && !this.ambushResolving) {
      this.attackClock += delta;
      const wait = this.strikeWait();
      if (!this.attackWarned && this.attackClock >= wait - STRIKE_TELE_MS) {
        this.attackWarned = true; this.strikeTelegraph();
      }
      if (this.attackClock >= wait) { this.attackClock = 0; this.attackWarned = false; this.strike(); }
    }
    this.combatReadout?.update(this.run,
      { x: this.runProgressRect.x, y: this.portraitLaneTop + (this.wideLayout && this.boardCols === 7 ? -60 : 3),
        width: this.runProgressRect.width, floorY: this.toScreen(GRID_X, GROUND_Y).y,
        header: this.wideLayout && this.boardCols === 7 },
      fighting && !this.chestActive && !this.runCompleteShown);
    this.activeEffects?.show(this.scene.isActive() && !this.scene.isActive("menu") && !this.run.over && !this.runCompleteShown && !this.chestActive && !this.tutorial?.active);
    this.tickItems(dts);
    this.updatePotionCues();
    const canAct = !this.busy && !this.down && !this.run.over && !this.runCompleteShown && !this.chestActive &&
      !this.arenaActive && !this.tutorial?.active && !this.targeting && this.phase === "fight";
    if (canAct) {
      this.idleBoardTime += dts;
      if (this.idleBoardTime >= 8 && !this.idleHintShown) {
        this.idleHintShown = true;
        this.showHint(true);
      }
    }

    // the tutorial holds the run harmless — no scroll pressure while it teaches.
    // Boss fights ease the scroll (BOSS_SCROLL_MULT): no intermediate kills = no relief.
    // The Waystone freezes the world's breath entirely.
    if (this.phase === "fight" && !this.run.over && !(this.ambushResolving && !this.orcEnemy?.hp) && !this.tutorial?.active && this.freezeLeft <= 0)
      scroll(this.run, roadScrollRate(this.run) * (this.run.enemy?.kind === "boss" ? BOSS_SCROLL_MULT : 1) * dts);

    // pan the world while the hero runs to the next foe; hold still in a fight
    const worldSpeed = this.phase === "advance" && !this.run.over ? WORLD_SCROLL : 0;
    this.roadScenery.update(delta, worldSpeed * dts, this.run.roadFork, this.run.killed);
    if (worldSpeed > 0) {
      const d = worldSpeed * (delta / 1000);
      // each layer moves at its depth factor; tilePositionX is texture-space (magnified by tileScale)
      for (const p of this.parallax) p.sprite.tilePositionX += (d * p.scroll) / p.sprite.tileScaleX;
      this.floor.tilePositionX += d / this.floor.tileScaleX;
    }

    this.drawSwipeTrail();

    const heroX = this.heroXForPressure();
    // a blow leaves the hero reeling: he is driven back off his mark and walks
    // it off, so losing ground is something you SEE, not just a bar moving
    if (this.heroKnock > 0) this.heroKnock = Math.max(0, this.heroKnock - (delta / 1000) * KNOCK_RECOVER);
    if (!this.heroLockX && !this.overShown) this.hero.x = heroX - this.heroKnock; // hold the final fall inside the lane
    // enemy pushes the hero toward the skull. NOT while it's dying: a killing
    // blow drops pressure instantly, and chaining the corpse to the new heroX
    // would teleport it forward (visible during a spell kill's bolt flight) —
    // the dead stay where they fell; the hero surges up past them instead.
    if (this.orc && this.phase === "fight" && !this.orcDying && !this.ambushResolving) this.orc.x = heroX + this.orcGap;
    // ...and in the ARENA the boss presses his advantage. Without this he stayed
    // planted while pressure dragged the hero leftwards, so the stance silently
    // stretched across the lane and the fight stopped reading as a fight. He
    // closes smoothly rather than snapping, so it looks like him advancing.
    else if (this.orc && this.phase === "arena" && !this.orcDying && !this.bossHold && this.run.enemy?.kind === "boss") {
      const want = this.hero.x + this.orcGap;
      this.orc.x = Phaser.Math.Linear(this.orc.x, want, Math.min(1, (delta / 1000) * BOSS_CLOSE_RATE));
    }
    if (this.orc && this.boss.arena === "slime" && this.arenaActive) {
      const spacing = this.slimeProgress?.phase === 1 ? 92 : 62;
      this.slimeAdds.forEach((slime, i) => {
        slime.x = Phaser.Math.Linear(slime.x, this.orc!.x + spacing * (i + 1), Math.min(1, delta / 150));
      });
    }
    if (this.orc) {
      const barY = GROUND_Y - (this.orcRig?.barOff ?? 56); // clear each creature's head
      const barWidth = this.orcEnemy?.ambush ? 56 : HP_W;
      this.enemyHpBg.setPosition(this.orc.x, barY);
      this.enemyHpBar.setPosition(this.orc.x - barWidth / 2, barY);
      this.defBadge.setPosition(this.orc.x + barWidth / 2 + 6, barY);
      if (this.ambushBrush && this.phase === "fight" && !this.ambushResolving) this.ambushBrush.root.x = heroX + 120;
      const rear = this.rearFoe;
      if (rear) {
        if (this.phase === "fight" && !this.ambushResolving) rear.sprite.x = heroX + 230;
        const y = GROUND_Y - (rear.rig.barOff ?? 56);
        rear.hpBg.setPosition(rear.sprite.x, y);
        rear.hpBar.setPosition(rear.sprite.x - 28, y);
      }
    }

    // Near-death feedback gently reddens the combat panel as the skull gets closer.
    if (this.vignette) {
      const p = this.run.pressure;
      const hidden = this.run.over || this.overShown || this.runCompleteShown || this.chestActive || this.tutorial?.active;
      const t = Phaser.Math.Clamp((p - VIGNETTE_FROM) / (VIGNETTE_FULL - VIGNETTE_FROM), 0, 1);
      // A direct ramp makes early danger visible; the time easing keeps it smooth.
      const target = t * VIGNETTE_MAX;
      this.vignetteA = hidden ? 0 : this.vignetteA + (target - this.vignetteA) * (1 - Math.exp(-dts * 6));
      this.vignette.setAlpha(Math.max(0, this.vignetteA));
    }

    if (this.run.over && !this.overShown && !this.runCompleteShown) {
      if (this.tryHearthRevive()) return; // the charm burns so you don't (mid-arena, the game resumes)
      if (this.arenaActive) this.teardownArena();
      this.showGameOver();
    }
  }

  /** Per-frame item bookkeeping: timed buffs decay, the burn ticks, the readout refreshes. */
  private tickItems(dts: number) {
    if (this.run.over) return;
    // Paid time is combat time; arrivals, loot reveals and boss arenas keep it.
    const activeDt = this.phase === "fight" && !this.orcDying && !this.ambushResolving && !this.arenaActive && !this.chestActive && !this.tutorial?.active ? dts : 0;

    // Waystone: frozen scroll + a cool wash over the lane while it holds
    if (this.freezeLeft > 0) {
      this.freezeLeft = Math.max(0, this.freezeLeft - activeDt);
      if (!this.freezeVeil) {
        this.freezeVeil = this.inBox(this.add.rectangle(CXC, LANE_Y + LANE_H / 2, UI_W, LANE_H, 0x3a7bd9, 0.1).setDepth(19));
      }
      if (this.freezeLeft <= 0 && this.freezeVeil) {
        const v = this.freezeVeil;
        this.freezeVeil = null;
        this.tweens.add({ targets: v, fillAlpha: 0, duration: 400, onComplete: () => v.destroy() });
      }
    }

    // War Horn / Merchant's Ledger: timed multipliers wind down
    if (this.hornLeft > 0) {
      this.hornLeft = Math.max(0, this.hornLeft - activeDt);
      this.run.surgeMult = this.hornLeft > 0 ? 2 : 1;
    }
    if (this.ledgerLeft > 0) {
      this.ledgerLeft = Math.max(0, this.ledgerLeft - activeDt);
      this.run.resMult = this.ledgerLeft > 0 ? 2 : 1;
    }

    // Cinder Flask: the foe burns — one tick per second while it lives
    // (held during the boss arena: wards fall to taps there, not to fire)
    // (also held for the boss: fire can't touch him outside his arena either)
    if (this.burnLeft > 0 && !this.arenaActive && this.run.enemy?.kind !== "boss") {
      if (this.run.enemy && this.orc && !this.orcDying) {
          const burnDt = Math.min(this.burnLeft, activeDt);
          this.burnLeft = Math.max(0, this.burnLeft - burnDt);
          this.burnAcc += burnDt;
        while (this.burnAcc >= 1 && this.run.enemy && !this.ambushResolving) {
          this.burnAcc -= 1;
          const killed = dealDamage(this.run, BURN_DPS);
          this.floatDamage(BURN_DPS, false);
          this.updateEnemyBar();
          this.orc?.setTint(0xff9060);
          this.time.delayedCall(160, () => this.orc?.clearTint());
          if (killed) {
            this.burnLeft = 0;
            this.killOrc(0); // burned to ash — no swing needed
            this.refreshHud();
            break;
          }
          if (this.orcEnemy?.ambush && this.orcEnemy !== this.run.enemy) {
            // A burning front enemy can fall without ending the ambush.
            void this.finishAmbushHit(null, false, 0);
            break;
          }
        }
      } else {
        this.burnLeft = 0; // nothing left to burn
        this.burnAcc = 0;
      }
    }

    this.renderBuffs();
  }

  /** Item effects use named, screen-sized chips beside the inventory HUD. */
  private renderBuffs() {
    // lane guard badge: count + a bounce on gain / red flash on spend
    if (this.run.block !== this.laneGuardLast) {
      const gained = this.run.block > this.laneGuardLast && this.laneGuardLast >= 0;
      const spent = this.run.block < this.laneGuardLast;
      this.laneGuardLast = this.run.block;
      this.laneGuardText.setText(`×${this.run.block}`).setColor(this.run.block > 0 ? "#bfe0ff" : "#6a707c");
      if (gained || spent) {
        this.tweens.killTweensOf(this.laneGuard);
        this.laneGuard.setScale(this.laneHudScale);
        this.tweens.add({ targets: this.laneGuard, scale: this.laneHudScale * (gained ? 1.22 : 0.86), duration: 100, yoyo: true, ease: "Quad.easeOut" });
        if (spent) {
          this.laneGuardText.setTint(0xff7a6a);
          this.time.delayedCall(240, () => this.laneGuardText.clearTint());
        }
      }
    }
    this.activeEffects?.update(activeItemEffects(this.run, {
      freezeLeft: this.freezeLeft, hornLeft: this.hornLeft, ledgerLeft: this.ledgerLeft,
      burnLeft: this.burnLeft, burnAcc: this.burnAcc, spursActive: this.spursActive,
      skeletonCharges: this.skeletonCharges, panCharges: this.panCharges,
      bossChestNext: this.bossChestNext,
    }, this.itemSlots.map(slot => slot.item?.id ?? null),
    this.phase !== "fight" || this.orcDying || this.arenaActive || this.chestActive || !!this.tutorial?.active));
  }

  /** Hearth Charm: consumes itself at the moment of death and drags you back. */
  private tryHearthRevive(): boolean {
    const slot = this.itemSlots.find((s) => s.item?.id === "hearth");
    if (!slot) return false;
    this.consumeSlot(slot);
    this.run.over = false;
    this.run.endReason = undefined;
    this.run.pressure = HEARTH_PRESSURE;
    buzz(40);
    this.sfx("summon", 0.5, 1.25);
    const flash = this.inBox(this.add.rectangle(CXC, LANE_Y + LANE_H / 2, UI_W, LANE_H, 0xff6a4a, 0.55).setDepth(48));
    this.tweens.add({ targets: flash, fillAlpha: 0, duration: 700, onComplete: () => flash.destroy() });
    const heart = this.inBox(
      this.add.text(this.hero.x, GROUND_Y - 90, "❤️", { fontFamily: EMOJI_FONT, fontSize: "34px" }).setOrigin(0.5).setDepth(49).setScale(0.3),
    );
    this.tweens.add({ targets: heart, scale: 1.4, duration: 260, ease: "Back.easeOut" });
    this.tweens.add({ targets: heart, y: heart.y - 50, alpha: 0, duration: 900, delay: 300, onComplete: () => heart.destroy() });
    this.notice("REVIVED · BACK TO SAFETY", "#ff9d7a");
    this.refreshHud();
    return true;
  }

  // ================= combat / runner =================

  private creatureRig(enemy: Enemy, small = false): CreatureRig {
    const base = CREATURE_RIG[enemy.variant] ?? CREATURE_RIG.green;
    const size = small ? .78 : 1;
    return { ...base, scale: base.scale * (base.idleTex.startsWith("slime") ? 1 : 1.17) * size,
      barOff: (base.barOff ?? 56) * size, hover: (base.hover ?? 0) * size };
  }

  /** Retire a member without advancing depth, paying loot or starting a new attack clock. */
  private retireAmbusher(sprite: Phaser.GameObjects.Sprite, rig: CreatureRig) {
    this.tweens.killTweensOf(sprite);
    sprite.removeAllListeners("animationcomplete");
    sprite.setTintFill(0xffe2ad).play(`${rig.prefix}-death`);
    this.time.delayedCall(70, () => { if (sprite.active) sprite.clearTint(); });
    sprite.once("animationcomplete", () => {
      this.tweens.add({ targets: sprite, alpha: 0, duration: 200, onComplete: () => sprite.destroy() });
    });
  }

  private async settleAmbushActors() {
    const rear = this.rearFoe;
    if (rear && rear.enemy.hp <= 0) {
      rear.hpBg.destroy(); rear.hpBar.destroy();
      this.retireAmbusher(rear.sprite, rear.rig);
      this.rearFoe = null;
    }
    if (this.orcEnemy && this.orcEnemy.hp <= 0 && this.run.enemy && this.rearFoe) {
      const survivor = this.rearFoe;
      if (this.orc && this.orcRig) this.retireAmbusher(this.orc, this.orcRig);
      survivor.hpBg.destroy(); survivor.hpBar.destroy();
      this.orc = survivor.sprite; this.orcRig = survivor.rig;
      this.orcAnim = survivor.rig.prefix; this.orcEnemy = survivor.enemy;
      this.orcDefense = survivor.enemy.defense; this.defenseTaught = false;
      this.rearFoe = null;
      // Fire Bomb burns the enemy it struck; Slow Trap belongs to the shared encounter.
      this.burnLeft = 0; this.burnAcc = 0;
      this.defBadge.setText(this.orcDefense === "hide" ? "🛡⚔" : this.orcDefense === "ward" ? "🛡🪄" : "")
        .setVisible(this.orcDefense !== "none");
      this.orc.play(`${this.orcAnim}-walk`);
      this.updateEnemyBar();
      await this.tweenP(this.orc, { x: this.heroXForPressure() + this.orcGap, duration: 230, ease: "Sine.easeInOut" });
      if (this.orc?.active) this.orc.play(`${this.orcAnim}-idle`);
    }
    this.updateEnemyBar();
  }

  /** Finish both impacts before the next cascade can target the surviving member. */
  private async finishAmbushHit(spell: SpellOutcome | null, killed: boolean, meleeMs: number,
    tint = 0xffa040, fromCells: { x: number; y: number }[] = []) {
    this.ambushResolving = true;
    if (killed) this.heroLockX = true;
    await new Promise<void>(resolve => {
      if (spell) this.performCast(spell, false, meleeMs, tint, fromCells, resolve);
      else this.time.delayedCall(Math.max(100, meleeMs), resolve);
    });
    if (!this.run.over) {
      if (killed) { this.killOrc(520); this.surgeAfterKill(0); }
      else await this.settleAmbushActors();
    }
    this.ambushResolving = false;
    this.refreshHud();
  }

  private spawnOrc(walkMs = WALK_IN_MS) {
    if (this.run.over) return;
    if (!this.run.enemy) spawnNext(this.run);
    if (!this.run.enemy) return;
    if (this.run.enemy.kind === "boss") {
      this.spawnBoss();
      return;
    }
    this.orcDying = false;
    this.orcEnemy = this.run.enemy;
    const ambush = !!this.run.enemy.ambush;
    this.phase = "advance";
    this.orcGap = ambush ? 120 : ENGAGE_GAP;
    this.hero.play("hero-walk", true); // stride forward while the foe approaches

    // the variant (and its defense) is rolled in run.ts makeEnemy — dress to match
    const rig = this.creatureRig(this.run.enemy, ambush);
    this.orcAnim = rig.prefix;
    this.orcRig = rig;
    this.orcDefense = this.run.enemy.defense;
    this.defenseTaught = false;
    if (ambush) {
      this.ambushBrush = new ForestAmbushBrush(this, this.centerBox, GROUND_Y);
      this.ambushBrush.root.x = this.heroXForPressure() + this.orcGap;
    }

    // flyers hover off the ground (update() only drives x, so y stays put)
    const gy = GROUND_Y - (rig.hover ?? 0);
    const orc = this.inBox(
      this.add.sprite(ENTER_X, gy, rig.idleTex).setOrigin(0.5, rig.origin).setScale(rig.scale).setFlipX(!!rig.faceLeft).play(`${this.orcAnim}-walk`),
    );
    this.orc = orc;
    if (rig.hover) this.tweens.add({ targets: orc, y: gy - 9, duration: 1100, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }); // a lazy float
    if (rig.bob) this.tweens.add({ targets: orc, scaleY: rig.scale * 1.035, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    // slimes squelch in; the flyer beats its wings; everything else thuds a footfall
    if (rig.hover) this.sfx("summon", 0.25, 1.5);
    else if (rig.flat) this.sfx(this.pick(["step2", "step4"]), 0.3, 0.85);
    else this.sfx(this.pick(["squish1", "squish2"]), 0.32, 0.95 + Math.random() * 0.1);
    this.enemyHpBg.setVisible(true);
    this.enemyHpBar.setVisible(true);
    this.enemyHpBg.setSize(ambush ? 56 : HP_W, ambush ? 7 : 10);
    this.enemyHpBar.setSize(ambush ? 56 : HP_W, ambush ? 7 : 10);
    this.defBadge.setText(this.orcDefense === "hide" ? "🛡⚔" : this.orcDefense === "ward" ? "🛡🪄" : "").setVisible(this.orcDefense !== "none");
    if (!ambush && this.orcDefense !== "none") {
      // a brief tinted shimmer as it bounces in — gray iron vs violet ward
      const aura = this.inBox(
        this.add
          .image(ENTER_X, GROUND_Y - 26, "orb")
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(this.orcDefense === "hide" ? 0xb9c0cc : 0xa06bff)
          .setScale(1.4)
          .setAlpha(0.8)
          .setDepth(22),
      );
      this.tweens.add({ targets: aura, x: this.heroXForPressure() + ENGAGE_GAP, duration: WALK_IN_MS, ease: "Sine.easeOut" });
      this.tweens.add({ targets: aura, alpha: 0, scale: 2.4, duration: WALK_IN_MS + 200, onComplete: () => aura.destroy() });
    }
    this.updateEnemyBar();

    if (ambush) {
      this.ambushResolving = true;
      const rear = ambushRear(this.run);
      if (rear) {
        const rearRig = this.creatureRig(rear, true);
        const sprite = this.inBox(this.add.sprite(ENTER_X, GROUND_Y - (rearRig.hover ?? 0), rearRig.idleTex)
          .setOrigin(.5, rearRig.origin).setScale(rearRig.scale).setFlipX(!!rearRig.faceLeft).play(`${rearRig.prefix}-walk`));
        const hpBg = this.inBox(this.add.rectangle(0, 0, 56, 7, 0x10191b, .85));
        const hpBar = this.inBox(this.add.rectangle(0, 0, 56, 7, 0xe05a5a).setOrigin(0, .5));
        this.rearFoe = { sprite, enemy: rear, rig: rearRig, hpBg, hpBar };
      }
      // Both emerge from the undergrowth; a restored lone survivor just steps back in.
      const enter = (sprite: Phaser.GameObjects.Sprite, actorRig: CreatureRig, index: number) => {
        this.tweens.killTweensOf(sprite);
        const x = this.heroXForPressure() + this.orcGap + index * 110;
        const y = GROUND_Y - (actorRig.hover ?? 0);
        sprite.setPosition(x + 26, y + 10).setAlpha(0);
        const delay = 180 + index * 110;
        this.time.delayedCall(delay, () => this.ambushBrush?.rustle(index));
        this.tweens.add({ targets: sprite, x, y, alpha: 1, delay, duration: 330, ease: "Cubic.easeOut",
          onComplete: () => {
            if (!sprite.active) return;
            sprite.play(`${actorRig.prefix}-idle`);
            if (actorRig.hover) this.tweens.add({ targets: sprite, y: y - 6, duration: 1000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
          } });
      };
      enter(orc, rig, 0);
      if (this.rearFoe) enter(this.rearFoe.sprite, this.rearFoe.rig, 1);
      this.centerBox.bringToTop(this.enemyHpBg); this.centerBox.bringToTop(this.enemyHpBar);
      this.centerBox.bringToTop(this.defBadge);
      this.updateEnemyBar();
      this.time.delayedCall(680, () => this.enterFight());
      return;
    }

    this.tweens.add({
      targets: orc,
      x: this.heroXForPressure() + ENGAGE_GAP,
      duration: walkMs,
      ease: "Sine.easeOut",
      onComplete: () => this.enterFight(),
    });
  }

  private enterFight() {
    if (this.run.over || !this.orc || this.orcDying) return;
    if (this.orcAnim === this.boss.key) {
      this.startBossArena(); // Malgrim doesn't trade blows — he plays his shell game
      return;
    }
    this.phase = "fight";
    this.ambushResolving = false;
    this.attackClock = 0; this.attackWarned = false;
    this.orc.play(`${this.orcAnim}-idle`);
    this.hero.play("hero-idle", true);
  }

  /** ===== THE BOSS ===== the zone's warden strides in under a darkening sky. */
  private spawnBoss() {
    if (this.run.over) return;
    const B = this.boss;
    if (B.arena === "slime") {
      const saved = this.recovered?.run.enemy?.kind === "boss" && this.recovered.run.killed === this.run.killed ? this.recovered : null;
      this.slimeProgress = restoreSlimeProgress(saved?.slimeBoss, saved?.arenaWard);
    }
    this.orcDying = false;
    this.orcEnemy = this.run.enemy;
    this.phase = "advance";
    this.orcAnim = B.key;
    // Gorrach's pack ships no death frames — rig a fake topple for him; the
    // others fall properly, so clear the rig.
    this.orcRig = B.hasDeath ? null : { prefix: B.key, idleTex: `${B.key}-idle`, scale: B.scale, origin: B.origin, fakeDeath: true, flat: true };
    this.orcDefense = this.run.enemy?.defense ?? "ward"; // his wards drink magic — bring a blade
    this.defenseTaught = false;
    this.defBadge.setVisible(false); // the boss bar carries his ward mark instead
    this.orcGap = B.gap;
    this.hero.play("hero-walk", true);
    this.sfx("summon", 0.55, 0.9);
    buzz(30);
    this.playMusic("music_boss", 0.32, 1200); // his war-drums drown the road's song

    // the lane darkens for his approach; the veil lifts as he plants his staff
    const veil = this.inBox(this.add.rectangle(CXC, LANE_Y + LANE_H / 2, UI_W, LANE_H, B.veil, 0).setDepth(20));
    this.tweens.add({ targets: veil, fillAlpha: 0.38, duration: 800 });

    const orc = this.inBox(
      this.add
        .sprite(ENTER_X, GROUND_Y, B.arena === "slime" ? "slime-idle" : `${B.key}-idle`)
        .setOrigin(0.5, B.origin)
        .setScale(B.scale)
        .setFlipX(B.faceLeft) // he walks in from the right and must glare left, at the hero
        .play(`${B.key}-walk`),
    );
    this.orc = orc;

    // name banner over the lane while he closes the distance
    const nm = this.inBox(
      this.add
        .text(CXC, this.laneRectD().y + 64, B.name, {
          fontFamily: "monospace",
          fontStyle: "bold",
          fontSize: "30px",
          color: "#ffd7a0",
          stroke: "#2a0c06",
          strokeThickness: 7,
        })
        .setOrigin(0.5)
        .setDepth(30)
        .setScale(0.3)
        .setAlpha(0),
    );
    nm.setTint(...B.nameTint); // ember for the mage, hide-and-bronze for the bull, glacier for the warden
    this.tweens.add({ targets: nm, alpha: 1, scale: 1, duration: 420, ease: "Back.easeOut", delay: 300 });
    this.tweens.add({ targets: nm, alpha: 0, y: nm.y - 20, duration: 500, delay: 2600, onComplete: () => nm.destroy() });

    this.enemyHpBg.setVisible(false); // the boss carries his own bar
    this.enemyHpBar.setVisible(false);
    this.showBossBar();

    this.tweens.add({
      targets: orc,
      x: this.heroXForPressure() + this.orcGap,
      duration: 2100, // a slow, inevitable approach
      ease: "Sine.easeOut",
      onComplete: () => {
        this.tweens.add({ targets: veil, fillAlpha: 0, duration: 700, onComplete: () => veil.destroy() });
        this.enterFight();
      },
    });
  }

  /** Wide named HP bar across the lane top — the classic boss-fight furniture. */
  private showBossBar() {
    this.hideBossBar();
    const BW = 460;
    const BH = 13;
    const root = this.add.container(CXC, LANE_Y + (this.boss.arena === "shells" ? 52 : 30)).setDepth(31);
    const label = this.add
      .text(0, -14, this.boss.arena === "goring" ? "GORRACH" : this.boss.arena === "shells" ? "MALGRIM" : this.boss.name, { fontFamily: "system-ui, sans-serif", fontStyle: "bold", fontSize: "24px", color: "#ffe0b3",stroke:"#121923",strokeThickness:4 })
      .setOrigin(0.5, 1);
    const bg = this.add.rectangle(0, 0, BW, BH, 0x000000, 0.6).setStrokeStyle(2, 0x8a2d2d);
    const fill = this.add.rectangle(-BW / 2 + 2, 0, BW - 4, BH - 4, 0xe05a5a).setOrigin(0, 0.5);
    root.add([bg, fill, label]);
    const dividers: Phaser.GameObjects.Rectangle[] = [];
    if (this.boss.arena === "goring") {
      bg.setFillStyle(0x191b16, .95).setStrokeStyle(2, 0xc6a56d);
      fill.setFillStyle(0xd6a65e);
    }
    if(this.boss.arena === "shells") {
      fill.setFillStyle(0xe6a953);
      const haze=this.add.rectangle(0,LANE_H/2-52,UI_W,LANE_H,this.run.biome === "forest" ? 0x17352a : 0x231a30,.12);
      root.addAt(haze,0);
      for(let i=0;i<10;i++) {
        const ember=this.add.circle(-UI_W/2+20+i*(UI_W-40)/10,GROUND_Y-LANE_Y-52,2,this.run.biome === "forest" ? 0xd9df98 : 0xb69cdd,.45);
        root.add(ember);
        const tween=this.tweens.add({targets:ember,y:80,alpha:0,duration:1800+i*170,delay:i*150,repeat:-1});
        ember.once("destroy",()=>tween.stop());
      }
    }
    if (this.boss.arena === "rimes") {
      bg.setStrokeStyle(2, 0x88bfcd).setFillStyle(0x132635, .95);
      fill.setFillStyle(0x99d6e7); label.setColor("#d6f5ff");
    }
    if (this.boss.arena === "slime") {
      bg.setStrokeStyle(2, 0x9fb677).setFillStyle(0x14281d, .95);
      fill.setFillStyle(0xa6cf7c); label.setColor("#e5eec5");
    }
    const total = this.boss.steps + (this.hasBossFinale() ? 3 : 0);
    for (const cleared of [3, 6, ...(this.hasBossFinale() ? [this.boss.steps] : [])]) {
      const fraction = 1 - cleared / total;
      const divider = this.add.rectangle(-BW / 2 + BW * fraction, 0, 3, BH, 0x131d22).setData("fraction", fraction);
      dividers.push(divider); root.add(divider);
    }
    this.inBox(root);
    root.setAlpha(0);
    this.tweens.add({ targets: root, alpha: 1, duration: 400, delay: 350 });
    fill.scaleX = 0;
    this.tweens.add({ targets: fill, scaleX: 1, duration: 1500, delay: 400, ease: "Quad.easeOut" }); // dramatic fill-up
    this.bossBar = { root, fill };
    root.setData("layout", { bg, label, dividers });
    this.layoutBossBar();
  }

  private layoutBossBar() {
    if (!this.bossBar) return;
    const { root, fill } = this.bossBar;
    const { bg, label, dividers } = root.getData("layout") as {
      bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; dividers: Phaser.GameObjects.Rectangle[];
    };
    // On phones the boss name and bar occupy the gap between guard and audio.
    const width = Math.max(160, UI_W - 186 / this.centerBaseScale);
    root.setY(this.laneRectD().y + 30 / this.centerBaseScale);
    bg.setSize(width, 13);
    fill.setX(-width / 2 + 2).setSize(width - 4, 9);
    label.setFontSize(this.worldFont(24, 12)).setWordWrapWidth(width);
    dividers.forEach((d, i) => d.setX(-width / 2 + width * (d.getData("fraction") ?? (i + 1) / 3)));
  }

  private hideBossBar() {
    this.bossBar?.root.destroy();
    this.bossBar = null;
  }

  private updateEnemyBar() {
    const e = this.orcEnemy?.ambush ? this.orcEnemy : this.run.enemy;
    const frac = e && !this.orcDying ? Math.max(0, e.hp / e.maxHp) : 0;
    this.enemyHpBar.scaleX = frac;
    if (this.rearFoe) this.rearFoe.hpBar.scaleX = Math.max(0, this.rearFoe.enemy.hp / this.rearFoe.enemy.maxHp);
    if (this.bossBar) {
      this.tweens.killTweensOf(this.bossBar.fill); // first hit cancels the intro fill-up
      this.bossBar.fill.scaleX = frac;
    }
  }

  private async trySwap(a: Coord, b: Coord) {
    if (this.busy || this.ambushResolving || this.run.over || this.runCompleteShown || this.arenaActive || this.chestActive || this.targeting || this.tutorial?.lockBoard) {
      this.clearSelection(); return;
    }
    if (this.isIceLocked(a) || this.isIceLocked(b)) {
      this.clearSelection(); this.notice("Tap ice three times or match beside it", "#b7e8ff"); return;
    }
    const ta = this.tiles[a.r][a.c];
    const tb = this.tiles[b.r][b.c];
    if (!ta || !tb) {
      this.clearSelection();
      return;
    }
    this.swapPreview.commit(ta, tb);
    this.busy = true;
    this.clearSelection();
    this.clearHint(); // a move settles the board — any hint is stale now
    swap(this.grid, a, b);
    const makesMatch = findMatches(this.grid).length > 0;
    if (makesMatch) haptic("tap");
    if (!makesMatch) this.sfx("swap", 0.4, 0.85); // "nope" only on an illegal swap
    this.tiles[a.r][a.c] = tb;
    this.tiles[b.r][b.c] = ta;
    await Promise.all([this.moveTo(tb, a.r, a.c), this.moveTo(ta, b.r, b.c)]);

    if (!makesMatch) {
      swap(this.grid, a, b);
      this.tiles[a.r][a.c] = ta;
      this.tiles[b.r][b.c] = tb;
      await Promise.all([this.moveTo(ta, a.r, a.c), this.moveTo(tb, b.r, b.c)]);
      this.busy = false;
      return;
    }

    this.idleBoardTime = 0;
    this.idleHintShown = false;
    await this.resolve(this.tutorial?.active ? [] : [b, a]);
    if (!this.tutorial?.active) this.empowered.moves++;
    if (!this.run.over && !hasPossibleMove(this.grid)) await this.animatedReshuffle("no moves left — fresh tiles");
    this.tutorial?.onBoardSettled();
    this.busy = false;
  }

  private async resolve(swapped: Coord[] = []) {
    let depth = 0; // cascade depth — rising pitch on the match pop
    while (!this.run.over && !this.runCompleteShown) {
      const matches = findMatches(this.grid);
      if (matches.length === 0) break;
      depth++;
      if (!this.tutorial?.active) this.bestCascade = Math.max(this.bestCascade, depth);
      if (depth >= 2) await this.comboBeat(depth); // hitstop + callout right before the cascade pops

      const counts: Record<number, number> = {};
      const cleared = new Set<string>();
      for (const m of matches)
        for (const cell of m.cells) {
          const key = cell.r + "," + cell.c;
          if (cleared.has(key)) continue;
          cleared.add(key);
          counts[this.grid[cell.r][cell.c]] = (counts[this.grid[cell.r][cell.c]] ?? 0) + 1;
        }

      const clearedCells = [...cleared].map(key => { const [r, c] = key.split(",").map(Number); return { r, c }; });
      this.boardAtmosphere?.reactToMatch?.(clearedCells, depth);
      const zoneReward = resolveZoneMatches(this.run.biome, this.run.zone!, this.boardCols, clearedCells, counts[KEY] ?? 0);
      for (const i of zoneReward.removed) this.inBox(iceBurst(this, this.xFor(i % this.boardCols), this.yFor(Math.floor(i / this.boardCols)), 36), true);
      this.drawZonePatches();
      this.syncEmpoweredCell();
      const power = planEmpowered(matches, this.empowered, depth === 1 ? swapped : []);
      if (power.consume.length) this.consumeEmpowered(power.consume);
      // Keep one tile from each deliberate large match. Its glow travels with gravity.
      const retained = new Set(power.create.map(p => `${p.cell.r},${p.cell.c}`));
      for (const earned of power.create) {
        const tile = this.tiles[earned.cell.r][earned.cell.c];
        if (!tile) continue;
        const id = this.empowered.nextId++;
        this.empowered.charges.push({ id, type: earned.type, cell: { ...earned.cell }, multiplier: earned.multiplier });
        this.empowered.layouts = {};
        this.empoweredTiles.set(id, tile);
        decorateEmpowered(this, tile, earned.type, earned.multiplier);
        empoweredGather(this, this.puzzleBox, earned.cells.map(c => ({ x: this.xFor(c.c), y: this.yFor(c.r) })),
          { x: this.xFor(earned.cell.c), y: this.yFor(earned.cell.r) }, earned.type, earned.multiplier);
      }
      if (power.create.length) this.sfx("pickup", .35, 1.3);
      haptic(depth > 1 || cleared.size >= 4 ? "combo" : "match");
      const fades: Promise<void>[] = [];
      // every match pays out visibly WHERE it happened — group the cleared cells
      const resCells: { x: number; y: number }[] = []; // resources/keys -> gold score
      const cmbCells: { x: number; y: number }[] = []; // swords/staves  -> gold combat score
      const shdCells: { x: number; y: number }[] = []; // shields        -> steel guard chip
      const swordCells: { x: number; y: number }[] = []; // launch points for the spectral blades
      const staffCells: { x: number; y: number }[] = []; // gather points for the spell cast
      const resFly: Record<number, { x: number; y: number }[]> = {}; // per-type launch points -> the resource rail
      cleared.forEach((key) => {
        const [r, c] = key.split(",").map(Number);
        const ty = this.grid[r][c];
        const at = { x: this.xFor(c), y: this.yFor(r) };
        if (ty === WOOD || ty === ORE || ty === TREASURE || ty === KEY) {
          resCells.push(at);
          (resFly[ty] ??= []).push(at);
        } else if (ty === SWORD || ty === STAFF) cmbCells.push(at);
        else if (ty === SHIELD) shdCells.push(at);
        if (ty === SWORD) swordCells.push(at);
        else if (ty === STAFF) staffCells.push(at);
        if (retained.has(key)) return;
        const t = this.tiles[r][c];
        if (t) fades.push(this.shatter(t, ty));
        this.tiles[r][c] = null;
        this.grid[r][c] = EMPTY;
      });
      await Promise.all(fades);

      const scoreBefore = this.run.score;
      const sporesBefore = this.run.enemy?.spores ?? 0;
      const outcome = applyMatches(this.run, counts, power.bonus);
      if (sporesBefore > 0 && (counts[STAFF] ?? 0) >= 3) this.notice("Spores cleared", "#c4efab");
      const centroid = (cells: { x: number; y: number }[]) => ({
        x: cells.reduce((s, p) => s + p.x, 0) / cells.length,
        y: cells.reduce((s, p) => s + p.y, 0) / cells.length,
      });
      // resources: their haul score lands over the matched tiles
      const resScore = (outcome.gained.wood + outcome.gained.ore + outcome.gained.treasure + outcome.gained.keys) * 2;
      if (resScore > 0 && resCells.length) {
        const p = centroid(resCells);
        this.floatScore(p.x, p.y, resScore, { delay: 70, size: Math.min(52, 32 + Math.floor(resScore / 4) + depth * 3) });
      }
      // swords/staves: the combat score (damage x5) — the kill's +100 pops at the corpse instead
      const combatScore = this.run.score - scoreBefore - resScore - (outcome.killed ? 100 : 0);
      if (combatScore > 0 && cmbCells.length) {
        const p = centroid(cmbCells);
        this.floatScore(p.x, p.y, combatScore, { delay: 140, size: Math.min(52, 32 + Math.floor(combatScore / 4) + depth * 3) });
      }
      // shields: no points, but the guard gained answers back in steel-blue
      if (outcome.guard > 0 && shdCells.length) {
        const p = centroid(shdCells);
        this.floatGuard(p.x, p.y, outcome.guard, 100);
      }
      await this.tutorial?.onCascade(counts);
      // keys bank per MATCH, not per tile — fly only as many chips as were kept
      if (resFly[KEY]) resFly[KEY] = resFly[KEY].slice(0, outcome.gained.keys);
      this.flyResources(resFly); // the goods themselves stream off the board into the rail
      await this.onCombat(outcome, outcome.swords, swordCells, staffCells); // wait for ambush casualties before the next cascade
      // non-combat clear — a random tile-match sound (1 of TILE_SFX), slight pitch variation
      if (outcome.damage <= 0) this.sfx(`tile${1 + ((Math.random() * TILE_SFX) | 0)}`, 0.4, 0.97 + Math.random() * 0.06);
      if (zoneReward.gems) {
        this.run.resources.treasure += zoneReward.gems;
        this.run.score += zoneReward.gems * 2;
        this.notice(`🔓 Cache opened · +${zoneReward.gems} gems`, "#ffe0a0");
        haptic("reward");
        this.sfx("pickup", .45);
      } else if (zoneReward.removed.length) this.notice("Ice broken", "#b7e8ff");
      this.refreshHud();

      await this.collapse();
    }
    if (thawIfStuck(this.run.biome, this.run.zone!, this.grid)) {
      this.drawZonePatches(); this.refreshHud();
    }
  }

  private onCombat(outcome: MatchOutcome, swords: number, swordCells: { x: number; y: number }[] = [], staffCells: { x: number; y: number }[] = []) {
    if (outcome.damage <= 0 || !this.orc || this.orcDying) return;

    const comboTempo = this.tutorialSwordSlow ? 1.55 : 1;
    this.tutorialSwordSlow = false;
    this.updateEnemyBar();

    // Melee: the swing combo scales with the sword match (3 / 4 / 5+).
    // Spells are their own act now — the cast + fireball follow the swings.
    const hasMelee = outcome.hits.length > 0;
    const combo = !hasMelee
      ? []
      : swords >= 5
        ? ["hero-attack", "hero-attack2", "hero-attack3"]
        : swords === 4
          ? ["hero-attack", "hero-attack2"]
          : ["hero-attack"];
    if (hasMelee) {
      this.playComboSfx(combo, comboTempo);
      this.showHits(outcome.hits, combo, outcome.swordMod, comboTempo);
      this.flyBlades(swordCells); // the matched tiles themselves take wing at the foe
      if (outcome.sunder) {
        // the peak blade fells it in one stroke — name the moment
        this.time.delayedCall(140, () => {
          if (!this.orc) return;
          this.floatChip(this.orc.x - 4, GROUND_Y - 122, "SUNDER!", { size: 26, stroke: "#2a0c06" });
          this.cameras.main.shake(120, 0.005);
        });
      }
    }
    const meleeMs = hasMelee ? this.comboMs(combo, comboTempo) : 0;
    const spell = outcome.spell;

    if (this.orcEnemy?.ambush) {
      if (hasMelee) {
        this.playCombo(combo, spell ? undefined : this.heroBaseAnim(), comboTempo);
        const struck = this.orc;
        struck.setTint(0xff8660);
        this.time.delayedCall(140, () => { if (struck.active) struck.clearTint(); });
      }
      return this.finishAmbushHit(spell, outcome.killed, meleeMs, undefined, staffCells);
    }

    if (outcome.killed) {
      // Everything plays IN PLACE (x frozen); the surge waits for the last act.
      this.heroLockX = true;
      if (hasMelee) this.playCombo(combo, undefined, comboTempo);
      if (spell) {
        const impactAt = this.performCast(spell, true, meleeMs, undefined, staffCells);
        this.surgeAfterKill(impactAt + 120);
      } else {
        this.surgeAfterKill(meleeMs);
        this.killOrc(meleeMs + 420); // hold the next foe until the combo + surge finishes
      }
    } else {
      if (hasMelee) {
        this.playCombo(combo, spell ? undefined : this.heroBaseAnim(), comboTempo); // the cast takes over if one follows
        this.orc.setTint(0xff6a6a); // a red flash on the struck foe
        this.time.delayedCall(150, () => this.orc?.clearTint());
        this.orc.play(`${this.orcAnim}-hurt`).once("animationcomplete", () => {
          if (this.orc && !this.orcDying) this.orc.play(`${this.orcAnim}-${this.phase === "fight" ? "idle" : "walk"}`);
        });
      }
      if (spell) this.performCast(spell, false, meleeMs, undefined, staffCells);
    }
  }

  /** Hero swings done — stride back up to pressure position and hand x back to update(). */
  private surgeAfterKill(atMs: number) {
    this.time.delayedCall(atMs, () => {
      if (this.run.over) {
        this.heroLockX = false;
        return;
      }
      this.hero.play("hero-walk", true);
      this.tweens.add({ targets: this.hero, x: this.heroXForPressure(), duration: 320, ease: "Quad.easeOut" });
      // Release off a clock timer, not the tween, so x-control always returns to update().
      this.time.delayedCall(320, () => (this.heroLockX = false));
    });
  }

  /**
   * The cast: hero raises the staff, the bolt leaves partway in, and the hit
   * (number, hurt, burn, even the death) lands ON IMPACT. Returns impact time.
   * `killed` holds the corpse until the bolt arrives instead of dying early.
   */
  private performCast(spell: SpellOutcome, killed: boolean, delayMs: number, tint = 0xffa040, fromCells: { x: number; y: number }[] = [], onImpact?: () => void): number {
    if (killed) this.orcDying = true; // freeze hurt/strike reactions; killOrc re-affirms at impact
    this.time.delayedCall(delayMs, () => {
      this.playCombo(["hero-spell"], killed ? undefined : this.heroBaseAnim());
      this.sfx("spell", 0.55);
      if (fromCells.length) this.gatherSpell(fromCells, tint); // the matched tiles feed the staff
      this.time.delayedCall(CAST_LEAD_MS, () => this.launchBolt(spell, killed, tint, onImpact));
    });
    return delayMs + CAST_LEAD_MS + BOLT_FLIGHT_MS;
  }

  /** The projectile itself — sized by tier, trailing sparks, bursting on arrival. */
  private launchBolt(spell: SpellOutcome, killed: boolean, tint: number, onImpact?: () => void) {
    const sx = this.hero.x + 28;
    const sy = GROUND_Y - 44;
    const tx = (this.orc?.x ?? sx + 220) - 6;
    const ty = GROUND_Y - 34;
    const scale = spell.tier >= 5 ? 2.0 : spell.tier === 4 ? 1.45 : 1.0;
    const ball = this.inBox(this.add.image(sx, sy, "bolt").setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(scale * 0.5).setDepth(46));
    this.tweens.add({ targets: ball, scale, duration: 110 });
    const trail = this.inBox(
      this.add
        .particles(0, 0, "spark", {
          speed: { min: 10, max: 50 },
          lifespan: { min: 130, max: 280 },
          scale: { start: 0.8 * scale, end: 0 },
          blendMode: "ADD",
          tint,
          frequency: 16,
          follow: ball,
        })
        .setDepth(45),
    );
    this.sfx(spell.tier >= 5 ? "fireball3" : spell.tier === 4 ? "fireball2" : "fireball1", 0.5, 1.12);
    this.tweens.add({
      targets: ball,
      x: tx,
      y: ty,
      duration: BOLT_FLIGHT_MS,
      ease: "Sine.easeIn",
      onComplete: () => {
        trail.destroy();
        ball.destroy();
        this.spellImpact(spell, killed, tint, tx, ty, onImpact);
      },
    });
  }

  /** Impact: burst + shake scaled by tier, the damage number, burn, hurt or death. */
  private spellImpact(spell: SpellOutcome, killed: boolean, tint: number, x: number, y: number, onImpact?: () => void) {
    const t = spell.tier;
    const burst = this.inBox(
      this.add
        .particles(x, y, "spark", {
          speed: { min: 80, max: t >= 5 ? 360 : t === 4 ? 260 : 190 },
          lifespan: { min: 200, max: 520 },
          scale: { start: t >= 5 ? 1.6 : 1.1, end: 0 },
          blendMode: "ADD",
          tint,
          emitting: false,
        })
        .setDepth(46),
    );
    burst.explode(t >= 5 ? 40 : t === 4 ? 24 : 12);
    this.time.delayedCall(700, () => burst.destroy());
    this.cameras.main.shake(t >= 5 ? 260 : t === 4 ? 160 : 90, t >= 5 ? 0.009 : t === 4 ? 0.006 : 0.004);
    buzz(t >= 5 ? 26 : 14);
    if (t >= 5) {
      const flash = this.inBox(this.add.rectangle(CXC, LANE_Y + LANE_H / 2, UI_W, LANE_H, 0xffd7a0, 0.28).setDepth(45));
      this.tweens.add({ targets: flash, fillAlpha: 0, duration: 320, onComplete: () => flash.destroy() });
    }
    // nothing landed (Malgrim outside his arena drinks it) — say so, don't float "-0"
    if (spell.dmg <= 0) {
      this.floatChip((this.orc?.x ?? SAFE_X) - 4, GROUND_Y - 96, "WARDED!", { size: 22, tint: [0xe8dcff, 0xc9a0ff, 0x9a6ae0, 0x5a3a9a], stroke: "#140a26" });
    } else {
      this.floatDamage(spell.dmg, t >= 4, spell.mod);
      this.teachDefense(spell.mod);
    }
    if (spell.burn && this.run.enemy && !killed) {
      this.burnLeft = Math.max(this.burnLeft, SPELL_BURN_SECS); // Pyroclasm sticks
      this.burnAcc = 0;
    }
    if (spell.splash && this.rearFoe) {
      const rear = this.rearFoe;
      ambushSplash(this, this.centerBox, x, rear.sprite.x, y, tint);
      this.floatDamage(spell.splash.dmg, t >= 4, spell.splash.mod, rear.sprite);
      rear.sprite.setTint(tint);
      this.time.delayedCall(150, () => { if (rear.sprite.active) rear.sprite.clearTint(); });
      if (rear.enemy.hp > 0) rear.sprite.play(`${rear.rig.prefix}-hurt`).once("animationcomplete", () => {
        if (this.rearFoe === rear && rear.enemy.hp > 0) rear.sprite.play(`${rear.rig.prefix}-idle`);
      });
    }
    if (onImpact) {
      const struck = this.orc, prefix = this.orcAnim;
      if (struck && this.orcEnemy && this.orcEnemy.hp > 0) {
        struck.setTint(tint).play(`${prefix}-hurt`).once("animationcomplete", () => {
          if (this.orc === struck && !this.orcDying && this.orcEnemy!.hp > 0) struck.play(`${prefix}-idle`);
        });
        this.time.delayedCall(150, () => { if (struck.active) struck.clearTint(); });
      }
      onImpact(); return;
    }
    if (killed) {
      this.killOrc(520);
    } else if (this.orc && !this.orcDying) {
      this.orc.setTint(0xffa060);
      this.time.delayedCall(180, () => this.orc?.clearTint());
      this.orc.play(`${this.orcAnim}-hurt`).once("animationcomplete", () => {
        if (this.orc && !this.orcDying) this.orc.play(`${this.orcAnim}-${this.phase === "fight" ? "idle" : "walk"}`);
      });
    }
  }

  // ---- board -> lane causality: the match physically travels to the fight ----

  /** Tween an object along a shallow arc, nose pointed down the path. */
  private arcTo(obj: Phaser.GameObjects.Image, sx: number, sy: number, tx: number, ty: number, ms: number, arcH: number, onDone: () => void) {
    const mx = (sx + tx) / 2;
    const my = Math.min(sy, ty) - arcH; // control point above the straight line
    let px = sx;
    let py = sy;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: ms,
      ease: "Sine.easeIn",
      onUpdate: (tw) => {
        const u = tw.getValue() ?? 0;
        const a = 1 - u;
        const x = a * a * sx + 2 * a * u * mx + u * u * tx;
        const y = a * a * sy + 2 * a * u * my + u * u * ty;
        obj.setRotation(Math.atan2(y - py, x - px) + Math.PI / 2); // blade art points up
        px = x;
        py = y;
        obj.setPosition(x, y);
      },
      onComplete: onDone,
    });
  }

  /**
   * Sword matches take wing: a spectral blade lifts out of each matched tile and
   * arcs up into the foe — the eye follows the motion from board to fight, and
   * "my match DID that" becomes literal. Impacts land as small steel-white pops.
   */
  private flyBlades(cells: { x: number; y: number }[]) {
    if (!this.orc || !cells.length) return;
    const foeX = this.orc.x;
    cells.slice(0, 5).forEach((cell, i) => {
      this.time.delayedCall(i * 55, () => {
        if (this.run.over) return;
        const tx = foeX + (Math.random() * 20 - 14);
        const ty = GROUND_Y - 34 - Math.random() * 18;
        const blade = this.inBox(
          this.add.image(cell.x, cell.y, "blade-spect").setBlendMode(Phaser.BlendModes.ADD).setDepth(46).setAlpha(0).setScale(0.5),
        );
        this.tweens.add({ targets: blade, alpha: 0.95, scale: 1, duration: 90 });
        const trail = this.inBox(
          this.add
            .particles(0, 0, "spark", {
              speed: { min: 5, max: 30 },
              lifespan: { min: 110, max: 240 },
              scale: { start: 0.55, end: 0 },
              blendMode: "ADD",
              tint: 0xcfe8ff,
              frequency: 22,
              follow: blade,
            })
            .setDepth(45),
        );
        this.arcTo(blade, cell.x, cell.y, tx, ty, BLADE_FLIGHT_MS, 70 + Math.random() * 40, () => {
          trail.destroy();
          blade.destroy();
          const pop = this.inBox(
            this.add
              .particles(tx, ty, "spark", {
                speed: { min: 60, max: 170 },
                lifespan: { min: 120, max: 300 },
                scale: { start: 0.8, end: 0 },
                blendMode: "ADD",
                tint: 0xe7f4ff,
                emitting: false,
              })
              .setDepth(46),
          );
          pop.explode(7);
          this.time.delayedCall(400, () => pop.destroy());
        });
      });
    });
  }

  /**
   * Resource matches ship out: a shrunken copy of each matched tile lifts off
   * the board and swoops into its row on the resource rail, which bounces as
   * the goods land — banked WHERE the counter lives, not just as a number.
   */
  private flyResources(groups: Record<number, { x: number; y: number }[]>) {
    const iconIdx: Record<number, number> = { [WOOD]: 0, [ORE]: 1, [TREASURE]: 2, [KEY]: 3 };
    for (const [tyStr, cells] of Object.entries(groups)) {
      const ty = Number(tyStr);
      const icon = this.resIcons[iconIdx[ty]];
      const val = this.resVals[iconIdx[ty]];
      if (!icon) continue;
      cells.slice(0, 6).forEach((cell, i) => {
        this.time.delayedCall(i * 60, () => {
          if (this.run.over) return;
          // target computed at launch, so a mid-cascade resize still lands on the row
          const center = icon.getCenter();
          const tgt = this.toLocal(center.x, center.y);
          const chip = this.inBox(this.add.image(cell.x, cell.y, tileArtKey(ty)).setDepth(66).setScale(0.34 / TILE_TEXTURE_DENSITY).setAngle(Math.random() * 20 - 10));
          // a quick lift first, then the swoop — reads as "plucked, then carried off"
          const mx = (cell.x + tgt.x) / 2 + (Math.random() * 50 - 25);
          const my = Math.min(cell.y, tgt.y) - 90 - Math.random() * 50;
          this.tweens.add({ targets: chip, scale: 0.42 / TILE_TEXTURE_DENSITY, duration: 90, yoyo: true });
          this.tweens.add({ targets: chip, angle: chip.angle + (Math.random() < 0.5 ? -1 : 1) * 140, duration: 460, ease: "Sine.easeIn" });
          this.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 460,
            ease: "Cubic.easeIn",
            onUpdate: (tw) => {
              const u = tw.getValue() ?? 0;
              const a = 1 - u;
              chip.setPosition(a * a * cell.x + 2 * a * u * mx + u * u * tgt.x, a * a * cell.y + 2 * a * u * my + u * u * tgt.y);
              if (u > 0.55) chip.setScale((0.42 - (u - 0.55) * 0.45) / TILE_TEXTURE_DENSITY); // shrink into the rail
            },
            onComplete: () => {
              chip.destroy();
              // the row answers: icon + count bounce as the goods thunk in
              for (const o of [icon, val]) {
                this.tweens.killTweensOf(o);
                o.setScale(1);
                this.tweens.add({ targets: o, scale: this.wideLayout ? 1.3 : 1.08, duration: 90, yoyo: true, ease: "Quad.easeOut" });
              }
              if (i === 0) this.sfx(this.pick(["coin1", "coin3"]), 0.22, 1.15); // one soft thunk per group, not per chip
            },
          });
        });
      });
    }
  }

  /**
   * Staff matches feed the cast: motes stream out of the matched tiles and
   * converge on the staff tip during the cast lead — THEN the bolt leaves.
   * The player sees their tiles become the fireball.
   */
  private gatherSpell(cells: { x: number; y: number }[], tint: number) {
    const tx = this.hero.x + 28; // the staff tip — same origin launchBolt uses
    const ty = GROUND_Y - 44;
    cells.slice(0, 5).forEach((cell, i) => {
      const mote = this.inBox(
        this.add.image(cell.x, cell.y, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setDepth(46).setScale(1.5).setAlpha(0.9),
      );
      const mx = (cell.x + tx) / 2 + (Math.random() * 60 - 30);
      const my = (cell.y + ty) / 2 + (Math.random() * 40 - 20);
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: CAST_LEAD_MS - 40,
        delay: i * 18,
        ease: "Quad.easeIn",
        onUpdate: (tw) => {
          const u = tw.getValue() ?? 0;
          const a = 1 - u;
          mote.setPosition(a * a * cell.x + 2 * a * u * mx + u * u * tx, a * a * cell.y + 2 * a * u * my + u * u * ty);
          mote.setScale(1.5 - u * 0.9);
        },
        onComplete: () => mote.destroy(),
      });
    });
    // the tip answers as the motes land — a swelling glow right before the launch
    const glow = this.inBox(this.add.image(tx, ty, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setDepth(46).setScale(0.4).setAlpha(0.5));
    this.tweens.add({ targets: glow, scale: 2.4, alpha: 0.95, duration: CAST_LEAD_MS - 30, ease: "Quad.easeIn", onComplete: () => glow.destroy() });
  }

  /** First resisted/weak hit on a foe names the rule — the defenses teach themselves. */
  private teachDefense(mod: DamageMod) {
    if (mod === "none" || this.defenseTaught || !this.orc) return;
    this.defenseTaught = true;
    const label = mod === "weak" ? "BONUS DAMAGE" : this.orcDefense === "hide" ? "USE STAVES" : "USE SWORDS";
    const color = mod === "weak" ? "#ffd24a" : this.orcDefense === "hide" ? "#c7ccd6" : "#c9a0ff";
    const t = this.inBox(
      this.add
        .text(this.orc.x, GROUND_Y - 84, label, { fontFamily: "monospace", fontStyle: "bold", fontSize: "17px", color, stroke: "#0a0b0f", strokeThickness: 5 })
        .setOrigin(0.5)
        .setDepth(61)
        .setScale(0.3),
    );
    this.tweens.add({ targets: t, scale: 1, duration: 180, ease: "Back.easeOut" });
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 900, delay: 500, ease: "Quad.easeIn", onComplete: () => t.destroy() });
  }

  /** Play a sequence of one-shot anims back-to-back (Phaser chain), optional trailing loop. */
  private playCombo(keys: string[], then?: string, tempo = 1) {
    if (this.overShown) return;
    const tail = then ? [...keys.slice(1), then] : keys.slice(1);
    if (tempo > 1) {
      this.hero.anims.timeScale = 1 / tempo;
      this.time.delayedCall(this.comboMs(keys, tempo), () => {
        if (this.hero.active) this.hero.anims.timeScale = 1;
      });
    }
    this.hero.play(keys[0]);
    // Drop any leftover chain from a prior hit (Phaser keeps one in nextAnim, rest queued).
    this.hero.anims.nextAnim = null;
    this.hero.anims.nextAnimsQueue.length = 0;
    if (tail.length) this.hero.chain(tail);
  }

  private comboMs(keys: string[], tempo = 1): number {
    return keys.reduce((s, k) => s + (this.anims.get(k)?.duration ?? 300) * tempo, 0);
  }

  // ---- sfx / music ----
  private sfx(key: string, volume = 0.5, rate = 1) {
    if (this.cache.audio.exists(key)) this.sound.play(key, { volume: sfxV(volume), rate });
  }

  /**
   * Fade a bed to silence and stop it. Steps through setSoundLevel so the
   * sound's config follows the fade — a loop restart mid-fade can't pop it
   * back to its old level.
   */
  /**
   * Stop a track for good. `destroy` (not just `stop`) so it leaves the sound
   * manager — every run adds its own bed + song, and restarts would otherwise
   * pile up silent Sound objects for the whole session.
   */
  private killSound(snd: Phaser.Sound.BaseSound | null) {
    if (!snd) return;
    this.tweens.killTweensOf(snd); // no fade tween left to poke a destroyed sound
    snd.stop();
    snd.destroy();
  }

  private fadeSoundOut(snd: Phaser.Sound.BaseSound, ms: number) {
    this.tweens.killTweensOf(snd);
    const from = (snd as unknown as { volume: number }).volume;
    // A fading track is no longer `this.music`, so SHUTDOWN's `this.music.stop()`
    // can't reach it — and a scene restart mid-fade kills the tween before it
    // ever stops the sound, leaving it looping under the next scene's song.
    // Park it here so shutdown can always finish the job.
    this.fadingSounds.push(snd);
    const drop = () => {
      this.killSound(snd);
      this.fadingSounds = this.fadingSounds.filter((s) => s !== snd);
    };
    this.tweens.addCounter({
      from,
      to: 0,
      duration: ms,
      onUpdate: (tw) => setSoundLevel(snd, tw.getValue() ?? 0),
      onComplete: drop,
    });
  }

  /** The road's own tune: the journey theme above ground, the deep's hush below. */
  private roadMusicKey(): string {
    return ROAD_MUSIC[this.meta.biome] ?? "music_journey";
  }

  /** Switch the run's music bed to `key`: old fades out, new enters at level. */
  private playMusic(key: string, base: number, fadeMs = 900) {
    if (!this.cache.audio.exists(key)) return;
    if (this.music && (this.music as unknown as { key: string }).key === key) return;
    if (this.music) this.fadeSoundOut(this.music, fadeMs * 0.6);
    this.music = this.sound.add(key, { loop: true });
    this.musicBase = base;
    this.music.play();
    setSoundLevel(this.music, musicV(base)); // straight in at level — no fade to fight
  }

  /** Let the song go (death, victory) — it fades and does not return. */
  private fadeOutMusic(ms = 1100) {
    const m = this.music;
    this.music = null;
    if (m) this.fadeSoundOut(m, ms);
  }
  private pick(a: string[]): string {
    return a[(Math.random() * a.length) | 0];
  }

  /** Pause the run under the system menu (Esc / ☰). Everything holds its breath. */
  private writeCheckpoint(force = false) {
    if (this.devJumpBoss || this.run.over || this.overShown || this.runCompleteShown || !this.itemSlots.length) return;
    if (!force && (this.busy || this.ambushResolving || this.chestActive || this.orcDying || this.phase === "chest" || this.tutorial?.active)) return;
    if (this.grid.some(row => row.some(t => t === EMPTY))) return;
    const m = loadMeta();
    this.syncEmpoweredCell();
    m.stockedItems = [...this.meta.stockedItems];
    m.activeRun = {
      version: 1, savedAt: Date.now(), run: structuredClone(this.run), grid: this.grid.map(row => [...row]),
      boardLayouts: structuredClone(this.boardLayouts),
      empowered: structuredClone(this.empowered), rescue: structuredClone(this.rescue),
      items: this.itemSlots.map(slot => slot.item?.id ?? null), chestsOpened: this.chestsOpened,
      sinceChest: this.sinceChest, bestCascade: this.bestCascade, rainy: this.rainy,
      arenaWard: this.arenaActive ? Math.min(3, this.arenaWard) : this.recovered?.arenaWard ?? 0,
      slimeBoss: this.boss.arena === "slime" && this.run.enemy?.kind === "boss" && this.slimeProgress
        ? { ...this.slimeProgress } : undefined,
      pendingChest: this.pendingChest ? structuredClone(this.pendingChest) : null,
      awaitingChest: this.awaitingChest,
      buffs: { freezeLeft: this.freezeLeft, hornLeft: this.hornLeft, ledgerLeft: this.ledgerLeft,
        burnLeft: this.burnLeft, burnAcc: this.burnAcc, skeletonCharges: this.skeletonCharges,
        panCharges: this.panCharges, spursActive: this.spursActive,
        bossChestNext: this.bossChestNext },
    };
    const saved = saveMeta(m);
    if (!saved && !this.saveWarningShown) {
      this.saveWarningShown = true;
      this.notice("Saving is unavailable. Keep this tab open to finish your run.", "#ffd24a");
    }
  }

  private openMenu() {
    if (this.run.over || this.runCompleteShown) return;
    this.writeCheckpoint();
    this.down = null;
    this.clearSelection();
    if (this.scene.isActive("menu")) return;
    if (this.combatReadout) this.combatReadout.root.hidden = true;
    this.activeEffects?.show(false);
    const reward = document.querySelector<HTMLElement>(".chest-reward, .companion-rescue, .road-fork");
    if (reward) {
      reward.style.visibility = "hidden";
      this.events.once(Phaser.Scenes.Events.RESUME, () => { reward.style.visibility = ""; });
    }
    this.scene.launch("menu", { from: "game" });
    this.scene.pause();
  }

  /** Menu retreat: end the run early, banking the haul as if the scout had fallen. */
  public bankAndRetreat() {
    if (this.run.over || this.overShown || this.runCompleteShown) return; // death/victory paths bank themselves
    if (this.pendingChest) for (const pull of [...this.pendingChest]) this.applyPull(pull);
    this.pendingChest = null;
    const r = this.run.resources;
    bankRun(loadMeta(), { wood: r.wood, ore: r.ore, treasure: r.treasure, kills: this.run.killed, chests: this.chestsOpened });
    this.run.over = true;
  }

  private clearHint() {
    for (const o of this.hintObjs) o.destroy();
    this.hintObjs = [];
  }

  /** Drink a tapped potion tile: position recovered + guard raised, in green. */
  private async drinkPotionAt(cell: Coord) {
    this.busy = true;
    this.clearSelection();
    this.clearHint();
    this.sfx("pickup", 0.55, 0.85);
    buzz(16);

    // the tile shatters like any match...
    const t = this.tiles[cell.r][cell.c];
    if (t) void this.shatter(t, POTION);
    this.tiles[cell.r][cell.c] = null;
    this.grid[cell.r][cell.c] = EMPTY;

    // ...and the tonic hits: pressure relief (hero strides right via update) + guard
    const guardBeforePotion = this.run.block;
    drinkPotion(this.run);
    const potionGuard = this.run.block - guardBeforePotion;
    this.refreshHud();

    // green surge on the hero: rising glow + a heal chip + guard chip
    const glow = this.inBox(
      this.add.image(this.hero.x, GROUND_Y - 36, "orb").setBlendMode(Phaser.BlendModes.ADD).setTint(0x6dff9e).setScale(0.7).setAlpha(0.95).setDepth(47),
    );
    this.tweens.add({ targets: glow, scale: 2.8, alpha: 0, y: glow.y - 46, duration: 620, ease: "Quad.easeOut", onComplete: () => glow.destroy() });
    const sparks = this.inBox(
      this.add
        .particles(this.hero.x, GROUND_Y - 30, "spark", {
          speed: { min: 40, max: 150 }, angle: { min: 230, max: 310 }, lifespan: { min: 300, max: 650 },
          scale: { start: 1.0, end: 0 }, blendMode: "ADD", tint: 0x6dff9e, emitting: false,
        })
        .setDepth(46),
    );
    sparks.explode(16);
    this.time.delayedCall(800, () => sparks.destroy());
    this.floatChip(this.hero.x, GROUND_Y - 104, "+♥", {
      size: 32,
      tint: [0xeafff0, 0xa9f5c0, 0x54c26e, 0x2e7a44],
      stroke: "#052a12",
      font: EMOJI_FONT,
    });
    this.floatGuard(this.hero.x + 30, GROUND_Y - 76, potionGuard, 220);
    this.notice(`Potion collected · back on your feet · +${potionGuard} guard`, "#a9f5c0");

    await this.collapse();
    await this.resolve(); // the refill can cascade like any clear
    if (!this.run.over && !hasPossibleMove(this.grid)) await this.animatedReshuffle("no moves left — fresh tiles");
    this.busy = false;
  }

  /** Light up a valid swap: two pulsing gold rings on the tiles to trade. */
  private showHint(quiet = false) {
    if (this.busy || this.run.over || this.chestActive || this.arenaActive || this.tutorial?.active || this.targeting) return;
    this.clearHint();
    const h = findHint(this.grid, cell => this.isIceLocked(cell));
    if (!h) {
      this.notice("no moves — the board will refresh", "#9aa0ab");
      return;
    }
    if (!quiet) {
      buzz(12);
      this.sfx("pickup", 0.25, 1.2);
    }
    for (const cell of [h.a, h.b]) {
      const ring = this.inBox(
        this.add.rectangle(this.xFor(cell.c), this.yFor(cell.r), TILE - 4, TILE - 4).setStrokeStyle(4, 0xffe08a, 0.95).setDepth(50),
      );
      this.tweens.add({ targets: ring, scaleX: 1.1, scaleY: 1.1, alpha: 0.35, duration: 440, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.hintObjs.push(ring);
    }
    this.time.delayedCall(2800, () => this.clearHint()); // fades on its own if unused
  }
  /** Hero footfalls while running to the next foe (dirt on the grass map). */
  private footstep() {
    if (this.run.over || this.phase !== "advance") return;
    if (this.hero.anims.currentAnim?.key !== "hero-walk") return;
    this.sfx(this.pick(["step1", "step2", "step3", "step4", "step5"]), 0.28, 0.95 + Math.random() * 0.1);
  }
  /** Swings + impacts synced to the melee combo (casts handle their own audio). */
  private playComboSfx(combo: string[], tempo = 1) {
    const HITS = ["hit1", "hit2", "hit3"];
    let t = 0;
    combo.forEach((key, i) => {
      this.time.delayedCall(t, () => this.sfx(["swing1", "swing2", "swing3"][Math.min(i, 2)], 0.28));
      this.time.delayedCall(t + 100 * tempo, () => this.sfx(this.pick(HITS), 0.5));
      t += (this.anims.get(key)?.duration ?? 300) * tempo;
    });
  }

  /** Milliseconds until the next strike: base cadence × the foe's own tempo (Spurs override). */
  private strikeWait(): number {
    return this.spursActive ? Math.round(SPURS_STRIKE_MS * (this.run.enemy?.strikeMult ?? 1)) : attackInterval(this.run);
  }

  private killOrc(afterMs = 760) {
    if (this.orcEnemy?.ambush) {
      this.notice(`Ambush cleared · +${FOREST_AMBUSH_REWARD.wood} wood · +${FOREST_AMBUSH_REWARD.ore} stone`, "#dceba6");
    }
    if (this.rearFoe) {
      this.rearFoe.hpBg.destroy(); this.rearFoe.hpBar.destroy();
      this.retireAmbusher(this.rearFoe.sprite, this.rearFoe.rig);
      this.rearFoe = null;
    }
    this.ambushBrush?.leave(); this.ambushBrush = null;
    const detour = this.run.roadFork;
    if (detour?.choice && detour.paidThrough === this.run.killed && this.run.killed > detour.startDepth) {
      const option = roadOptions(this.run.biome).find(option => option.id === detour.choice)!;
      this.floatChip(this.hero.x + 28, GROUND_Y - 82, `${option.icon} +${ROAD_FORK_BONUS}`, {
        size: 24, font: EMOJI_FONT, tint: [0xffedb4, 0xe4c780, 0xd4b477, 0xba965b], stroke: "#1e292b", delay: 180,
      });
    }
    const petRewards = companionKillRewards(this.run.companions, this.run.killed, guardCost(this.run.killed));
    const finds = petRewards.filter(reward => reward.resource !== "guard").map(reward => {
      const label = reward.resource === "ore" ? "stone" : reward.resource === "keys" && reward.amount === 1 ? "key" : reward.resource;
      return `${companionById(reward.id)!.name}: +${reward.amount} ${label}`;
    });
    if (finds.length) this.notice(finds.join(" · "), "#ffe0a0");
    const protection = petRewards.find(reward => reward.resource === "guard");
    if (protection) {
      this.floatGuard(this.hero.x, GROUND_Y - 76, protection.amount, 240);
      if (!finds.length) this.notice(`Moss: +${protection.amount} guard`, "#a9d7c0");
    }
    const wasBoss = this.orcAnim === this.boss.key;
    if (wasBoss) this.clearSlimeAdds();
    if (!wasBoss) this.sfx("death", 0.16); // slime death — kept well in the background
    this.orcDying = true;
    this.spursActive = false; // per-foe item effects die with the foe
    this.burnLeft = 0;
    this.burnAcc = 0;
    this.phase = "advance";
    this.updateEnemyBar();
    this.enemyHpBg.setVisible(false);
    this.enemyHpBar.setVisible(false);
    this.defBadge.setVisible(false);
    // NB: the hero's swing-then-surge is sequenced in onCombat so the attack plays.

    const dying = this.orc;
    this.orc = null;
    if (dying) {
      // the kill lands as a BEAT: corpse flashes white-hot, the camera punches in a
      // hair and settles — a felt full-screen punctuation, no eye movement required
      dying.setTintFill(0xffffff);
      this.time.delayedCall(90, () => dying.clearTint());
      buzz(18);
      this.punchCamera(wasBoss ? PUNCH_BOSS : PUNCH_KILL, wasBoss ? 90 : 60, wasBoss ? 240 : 140);
      this.tweens.killTweensOf(dying);
      dying.play(`${this.orcAnim}-death`);
      if (this.orcRig?.fakeDeath) {
        // no death frames: it keels over — topple, drop, and fade where it fell
        this.tweens.add({
          targets: dying,
          angle: dying.flipX ? 82 : -82,
          y: dying.y + 10,
          alpha: 0,
          duration: 440,
          ease: "Quad.easeIn",
          onComplete: () => dying.destroy(),
        });
      } else {
        dying.once("animationcomplete", () => {
          this.tweens.add({ targets: dying, alpha: 0, duration: wasBoss ? 700 : 260, onComplete: () => dying.destroy() });
        });
      }
      // the kill bounty pops over the corpse as the final swing lands
      this.floatScore(dying.x + 14, GROUND_Y - 104, wasBoss ? 400 : 100, {
        size: wasBoss ? 44 : 34,
        sparkle: true,
        delay: Math.max(0, afterMs - 420),
      });
    }
    if (wasBoss) {
      this.bossSpoils(dying?.x ?? SAFE_X + this.boss.gap);
      // his drums die with him: the road's song returns — unless the road is done
      if (this.run.killed < RUN_COMPLETE_AT) this.playMusic(this.roadMusicKey(), 0.26, 1600);
      else this.fadeOutMusic(1400);
    }

    this.time.delayedCall(Math.max(760, afterMs), () => {
      if (this.run.over) return;
      const chestDue = ++this.sinceChest >= CHEST_EVERY && !this.tutorial?.active;
      const chestHasRoom = this.itemSlots.some((s) => !s.item);
      if (chestDue && chestHasRoom) {
        this.sinceChest = 0;
        this.spawnChest(); // treasure interlude — the next foe waits its turn (held during the tutorial)
      } else {
        if (chestDue && !chestHasRoom && this.sinceChest === CHEST_EVERY) {
          this.notice("pack full — chest waits", "#ffd0a0");
        }
        this.advanceRoad();
      }
      this.refreshHud();
    });
  }

  /** Next foe — unless this run's stretch of road is done (the second boss fell). */
  private advanceRoad(walkMs = WALK_IN_MS) {
    if (this.run.over || this.forkView || this.rescueView) return;
    // A rescue checkpoint must contain a settled board, including its rewards.
    if(this.busy) {this.time.delayedCall(100,()=>this.advanceRoad(walkMs));return;}
    if (this.run.killed >= RUN_COMPLETE_AT) {
      this.showRunComplete();
      return;
    }
    const supplies = rescueOptions(this.run.resources, this.meta);
    if (!this.tutorial?.active && rollRescue(this.rescue, this.run.biome, this.run.killed, this.meta.companions, Math.random, supplies.key || supplies.wood)) {
      this.showRescue(); return;
    }
    // Avoid a second choice immediately after rescuing a pet at this depth.
    const justRescued = this.rescue.encountered && this.rescue.rolledDepth === this.run.killed;
    if (this.run.biome !== "forest" && !this.tutorial?.active && !this.devJumpBoss && !justRescued &&
      offerRoadFork(this.run.roadFork ??= newRoadFork(), this.run.killed)) {
      this.showFork(); return;
    }
    spawnNext(this.run);
    this.spawnOrc(walkMs);
  }

  private showFork() {
    const fork = this.run.roadFork;
    if (!fork?.pending || this.forkView) return;
    this.chestActive = true; this.phase = "chest";
    this.hero.play("hero-idle", true);
    this.clearSelection(); this.clearHint(); this.down = null; this.attackClock = 0;
    this.combatReadout?.root.setAttribute("hidden", ""); this.activeEffects?.show(false);
    this.writeCheckpoint(true);
    this.forkView = showRoadFork(this.run.biome, choice => {
      if (!chooseRoad(fork, choice)) return;
      // Commit the choice before its short departure animation. Reload cannot reselect it.
      this.writeCheckpoint(true); this.sfx("pickup", .5); buzz(16);
      this.time.delayedCall(300, () => {
        this.forkView?.destroy(); this.forkView = null;
        this.chestActive = false; this.phase = "advance";
        this.advanceRoad(); this.writeCheckpoint(true); this.refreshHud();
        const option = roadOptions(this.run.biome).find(option => option.id === choice)!;
        this.notice(`${option.name} · ${option.note}`, "#ffe0a0");
      });
    }, () => this.openMenu());
  }

  private showRescue() {
    const id=this.rescue.pending;
    if(!id || !companionById(id) || this.rescueView)return;
    this.chestActive=true;this.phase="chest";this.hero.play("hero-idle",true);
    this.clearSelection();this.clearHint();this.down=null;this.attackClock=0;
    this.writeCheckpoint(true);
    const view=showCompanionRescue(id,this.meta.companions.includes(id),
      () => ({ keys: this.run.resources.keys, wood: this.run.resources.wood + loadMeta().wood }), payment=>{
      const meta=loadMeta();
      if(meta.companions.includes(id))return true;
      if(!payForRescue(payment,this.run.resources,meta))return false;
      meta.companions.push(id);
      this.meta.companions=[...meta.companions];this.meta.wood=meta.wood;
      // Save ownership and spent supplies together, including the suspended run.
      if(meta.activeRun)meta.activeRun.run.resources={...this.run.resources};
      saveMeta(meta);
      this.writeCheckpoint(true);this.sfx("pickup",.55);buzz(25);
      this.refreshHud();return true;
    },()=>{
      this.rescueView=null;this.rescue.pending=null;this.chestActive=false;
      this.advanceRoad();this.writeCheckpoint(true);
    });
    this.rescueView=view;
  }

  /** Victory: the second boss is down, the hoard is looted — home to camp. */
  private showRunComplete() {
    if (this.runCompleteShown || this.overShown) return;
    this.runCompleteShown = true;
    this.run.over = true;
    this.fadeOutMusic(1200); // quiet under the victory fanfare
    this.phase = "advance"; // he strides on while the banner flies — a victory walk
    this.hero.play("hero-walk", true);

    // the caravan keeps everything: bank resources + quest stats, same as a fall
    const r = this.run.resources;
    bankRun(loadMeta(), { wood: r.wood, ore: r.ore, treasure: r.treasure, kills: this.run.killed, chests: this.chestsOpened });

    this.sfx("combo6", 0.55);
    this.time.delayedCall(400, () => this.sfx("coin_pour", 0.5));
    this.renderRunResults(true);
  }

  /** The Cindermage falls: flash, quake, treasure bounty, and a chest rolls in next. */
  private bossSpoils(x: number) {
    this.hideBossBar();
    haptic("victory");
    this.cameras.main.shake(420, 0.012);
    this.sfx("coin_pour", 0.6);
    const flash = this.inBox(this.add.rectangle(CXC, LANE_Y + LANE_H / 2, UI_W, LANE_H, 0xfff0d8, 0.85).setDepth(40));
    this.tweens.add({ targets: flash, fillAlpha: 0, duration: 420, onComplete: () => flash.destroy() });

    // treasure erupts from where he fell (the chest blast's textures moonlight here)
    const coins = this.inBox(
      this.add
        .particles(x, GROUND_Y - 46, "coin", {
          speed: { min: 300, max: 640 }, angle: { min: 230, max: 310 }, gravityY: 1100,
          lifespan: { min: 700, max: 1200 }, scale: { min: 0.9, max: 1.5 }, rotate: { min: 0, max: 360 },
          emitting: false,
        })
        .setDepth(41),
    );
    const sparks = this.inBox(
      this.add
        .particles(x, GROUND_Y - 46, "spark", {
          speed: { min: 160, max: 520 }, angle: { min: 210, max: 330 }, gravityY: 650,
          lifespan: { min: 400, max: 900 }, scale: { start: 1.3, end: 0 }, blendMode: "ADD",
          emitting: false,
        })
        .setDepth(41),
    );
    coins.explode(26);
    sparks.explode(38);
    this.time.delayedCall(1600, () => {
      coins.destroy();
      sparks.destroy();
    });

    const t = this.inBox(
      this.add
        .text(CXC, this.laneRectD().y + 96, "BOSS DEFEATED!", {
          fontFamily: "monospace", fontStyle: "bold", fontSize: "34px",
          color: "#ffffff", stroke: "#3a1d08", strokeThickness: 8,
        })
        .setOrigin(0.5)
        .setDepth(42)
        .setScale(2.2)
        .setAlpha(0),
    );
    t.setTint(0xfff6c8, 0xffe08a, 0xf2a93b, 0xc9761f);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 260, ease: "Back.easeOut" });
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 24, duration: 600, delay: 1500, onComplete: () => t.destroy() });

    const bounty = this.inBox(
      this.add
        .text(x, GROUND_Y - 130, `+${BOSS_BOUNTY} 💎`, {
          fontFamily: EMOJI_FONT, fontStyle: "bold", fontSize: "26px",
          color: "#bfe6ff", stroke: "#2a0c06", strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setDepth(42)
        .setScale(0.3),
    );
    this.tweens.add({ targets: bounty, scale: 1.1, duration: 220, ease: "Back.easeOut", delay: 350 });
    this.tweens.add({ targets: bounty, y: bounty.y - 46, alpha: 0, duration: 900, delay: 900, onComplete: () => bounty.destroy() });

    this.run.resources.treasure += BOSS_BOUNTY;
    this.run.score += 400;
    this.run.pressure = Math.max(0, this.run.pressure - BOSS_SURGE); // the road clears ahead of the caravan
    this.sinceChest = CHEST_EVERY - 1; // his hoard rolls in right behind him
    this.bossChestNext = true; // ...and it rolls the richer item table (Cinder Flask lives there)
    this.refreshHud();
  }

  // ---- DEV boss bar ---------------------------------------------------------
  // A strip of jump buttons along the bottom edge, built only in DEV builds.
  // The three wardens live on different roads, so jumping to one means writing
  // meta.biome and restarting the run — preload() re-reads the biome and pulls
  // that boss's sheets. The stage buttons skip straight into an arena beat.

  /**
   * DEV only: build the boss-jump strip.
   *
   * It's a DOM overlay, not Phaser text, on purpose: two of the arenas listen
   * on screen-wide tap catchers (Lock Horns, fireball tennis), and an in-canvas
   * button sitting under one of those gets its tap eaten by the fight instead —
   * clicking "WARDEN" mid-Lock-Horns just registered as a missed shove. A DOM
   * layer sits above the canvas entirely, so it always wins.
   */
  private buildDevBar() {
    if (!import.meta.env.DEV || !new URLSearchParams(location.search).has("debug")) return;
    document.getElementById("mb-devbar")?.remove(); // a scene restart rebuilds it
    const el = document.createElement("div");
    el.id = "mb-devbar";
    el.style.cssText =
      "position:fixed;left:6px;bottom:6px;z-index:2147483000;display:flex;gap:4px;flex-wrap:wrap;pointer-events:none;font:bold 12px system-ui,sans-serif";
    const mk = (label: string, colour: string, fn: () => void) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText =
        `pointer-events:auto;cursor:pointer;background:#0c0f16ee;color:${colour};` +
        "border:1px solid #2a2d38;border-radius:4px;padding:4px 8px;font:inherit";
      b.addEventListener("pointerdown", (e) => e.stopPropagation()); // never reaches the board/arena beneath
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        fn();
      });
      el.appendChild(b);
    };
    mk("☠ SLIME", "#c8e69e", () => this.debugBossIn("forest"));
    mk("☠ MALGRIM", "#ffd280", () => this.debugBossIn("dungeon"));
    mk("☠ GORRACH", "#f0b070", () => this.debugBossIn("plains"));
    mk("☠ WARDEN", "#bfe8ff", () => this.debugBossIn("snow"));
    mk("▸ I", "#9fe6a0", () => this.debugArenaStage(0));
    mk("▸ II", "#9fe6a0", () => this.debugArenaStage(1));
    mk("▸ III", "#9fe6a0", () => this.debugArenaStage(2));
    mk("▸ IV · 20", "#edcc87", () => { this.run.killed = RUN_COMPLETE_AT - 1; this.debugArenaStage(3); this.refreshHud(); });
    mk("▸ FINISH", "#ff9d6a", () => this.debugArenaStage(4));
    mk("▣ CHEST", "#ffe08a", () => this.debugChest());
    mk("+9 guard", "#bfe0ff", () => {
      this.run.block += 9; // every stage punishes misses with a real strike — bank guard for a long study session
      this.refreshHud();
      this.notice("+9 GUARD", "#bfe0ff");
    });
    document.body.appendChild(el);
    this.events.once("shutdown", () => el.remove());
    this.events.once("destroy", () => el.remove());
  }

  /**
   * DEV: start a fresh run on `biome` with the first foe rigged as its warden.
   * Writes meta so preload() pulls the right boss sheets, then restarts.
   */
  public debugBossIn(biome: string) {
    const m = loadMeta();
    m.biome = biome;
    m.tutorialSeen = true; // the tutorial gates the board and would sit on top of the arena
    saveMeta(m);
    this.arenaGen++; // orphan any in-flight arena timers from the run we're abandoning
    this.arenaActive = false;
    // hard stop, not a fade: we're restarting this instant, and a fade tween
    // would die with the scene and leave the old track looping under the new one
    this.killSound(this.music);
    this.music = null;
    for (const s of this.fadingSounds) this.killSound(s);
    this.fadingSounds = [];
    this.scene.start("game", { bossJump: true });
  }

  /**
   * DEV: skip to a beat of the CURRENT boss's arena (0/1/2 = his three stages,
   * 3 = floor-20 finale, 4 = finish). Rigs the boss first if he isn't up.
   */
  public debugArenaStage(n: number) {
    this.restartArenaStage(n);
  }

  /** Restart one challenge stage for recovery or the developer stage selector. */
  private restartArenaStage(n: number) {
    if (!this.arenaActive) {
      this.debugBoss();
      this.time.delayedCall(3400, () => this.restartArenaStage(n)); // let him walk in and the board retract
      return;
    }
    // bump the generation so whatever stage the arena was about to open on its
    // own bails out — otherwise the jump and the natural opening both run
    const gen = ++this.arenaGen;
    this.clearArenaObjs();
    void this.hideBoard(); // we may have jumped in before the board finished retracting
    this.arenaWard = n;
    this.arenaDealIdx = 0;
    this.arenaWardMissed = false;
    if (n === 3 && this.hasBossFinale()) {
      this.arenaDealsDone = this.boss.steps;
      this.startBossFinale(gen);
      return;
    }
    if (n >= 3) {
      this.arenaDealsDone = this.boss.steps;
      this.drainBossBar();
      this.completeBossArena(gen, true);
      return;
    }
    if (this.boss.arena === "slime") {
      this.slimeStage(gen, { phase: Math.max(0, n) as 0 | 1 | 2, cleared: 0 });
      return;
    }
    if (this.boss.arena === "goring") {
      // 3 charges, then 3 routes, then 5 shoves
      this.arenaDealsDone = n === 0 ? 0 : n === 1 ? GORE_CHARGES.length : GORE_CHARGES.length + ROPE_ROUNDS;
      this.drainBossBar();
      if (n === 0) this.goringCharge(gen, 0);
      else if (n === 1) this.goringParry(gen, 0);
      else this.goringHorns(gen);
    } else if (this.boss.arena === "rimes") {
      this.arenaDealsDone = n === 0 ? 0 : n === 1 ? 3 : 6;
      this.drainBossBar();
      if (n === 0) this.rimeIce(gen);
      else if (n === 1) this.rimeWhiteout(gen, 0);
      else this.rimeHeart(gen);
    } else {
      this.arenaDealsDone = n * 3;
      this.drainBossBar();
      if (n === 0) this.emberCourt(gen, 0);
      else if (n === 1) this.emberFall(gen, 0);
      else this.startTennis(gen);
    }
  }

  /** Dev: rig the next foe to be the boss (console: __mb.debugBoss()). */
  public debugBoss() {
    this.run.killed = this.run.killed >= RUN_COMPLETE_AT - 1 ? RUN_COMPLETE_AT - 1 : BOSS_EVERY - 1;
    this.sinceChest = -999; // skip the chest interlude for this test
    if (this.orc && !this.orcDying) {
      this.run.enemy = null;
      this.killOrc(0);
    }
  }

  // ================= BOSS CHALLENGE (boss arena) =================
  // A mode break: the scroll stops (phase "arena"), the board retracts, burning
  // portals rise where it stood and Malgrim hides among fiery decoys. Tap the
  // REAL one (cyan staff glint) before he casts to crack a ward; wrong taps and
  // timeouts fire a fireball that the puzzle phase's guard charges can absorb.
  // Three wards, each round faster and busier; clearing the last wins the fight.

  private arenaWait(ms: number): Promise<void> {
    return new Promise((res) => this.time.delayedCall(ms, res));
  }

  private clearArenaObjs() {
    for (const o of this.arenaObjs) {
      this.tweens.killTweensOf(o); // killed tweens never fire onComplete — no phantom hits
      o.destroy();
    }
    this.arenaObjs = [];
    for (const t of this.arenaTimers) t.remove(false);
    this.arenaTimers = [];
    this.swipeTargets = [];
    this.swipeFrom = null;
  }

  /** Register a looping arena clock so the next stage (or death) stops it. */
  private aTimer(t: Phaser.Time.TimerEvent) {
    this.arenaTimers.push(t);
    return t;
  }

  /** Register an arena prop so teardown (and death mid-fight) can sweep it up. */
  private aReg = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
    this.arenaObjs.push(o);
    return o;
  };

  /**
   * The board retracts and the zone's warden takes over the screen. Which game
   * gets played is the boss's own business (BossDef.arena) — this only sets up
   * the shared state and hands off once the last cascade has settled.
   */
  private startBossArena() {
    this.arenaActive = true;
    const gen = ++this.arenaGen;
    this.phase = "arena"; // stationary arena: no scroll, no strikes, no world pan
    this.arenaWard = this.recovered?.arenaWard ?? 0;
    this.arenaDealIdx = 0;
    this.arenaDealsDone = 0;
    this.arenaWardMissed = false;
    this.bossHold = false;
    this.orc?.play(`${this.boss.key}-idle`);
    this.hero.play("hero-idle", true);
    const banner =
      this.boss.arena === "shells" ? "BOSS CHALLENGE" : this.boss.arena === "goring" ? "THE GORING RUN" : "THE THREE RIMES";
    if (this.boss.arena !== "slime") this.notice(banner, this.boss.accent);
    this.layout();

    if (this.boss.arena === "shells" && this.orc) {
      this.bossHold = true;
      this.tweens.add({targets:this.orc,x:PADIN+UI_W-96,alpha:1,duration:500,ease:"Sine.easeOut"});
    }

    void (async () => {
      while (this.busy) await this.arenaWait(120); // let any final cascade settle first
      if (gen !== this.arenaGen || this.run.over) return;
      await this.hideBoard();
      await this.arenaWait(420);
      if (gen !== this.arenaGen || this.run.over) return;
      if (this.boss.arena === "slime") {
        const progress = this.slimeProgress ?? restoreSlimeProgress();
        this.recovered = null;
        this.slimeStage(gen, progress);
        return;
      }
      if (this.recovered && this.recovered.arenaWard > 0) {
        const ward = this.recovered.arenaWard; this.recovered = null;
        this.restartArenaStage(ward);
      }
      else if (this.boss.arena === "goring") this.goringIntro(gen);
      else if (this.boss.arena === "rimes") this.rimesIntro(gen);
      else this.malgrimIntro(gen);
    })();
  }

  private clearSlimeAdds() {
    for (const slime of this.slimeAdds) { this.tweens.killTweensOf(slime); slime.destroy(); }
    this.slimeAdds = [];
  }

  /** The upper lane mirrors the physical split; the normal boss actor owns the kill. */
  private splitSlimeLane(progress: SlimeProgress) {
    if (!this.orc) return;
    const parentX = [this.orc.x, ...this.slimeAdds.map(s => s.x)];
    this.clearSlimeAdds();
    const { phase, cleared } = progress, size = SLIME_SCALES[phase];
    const count = phase === 2 ? Math.max(1, 4 - cleared) : 2 ** phase;
    this.orcGap = SLIME_GAPS[phase];
    this.tweens.killTweensOf(this.orc);
    this.orc.play("slimeboss-idle").clearTint();
    this.tweens.add({ targets: this.orc, scaleX: size, scaleY: size, duration: 380, ease: "Back.easeOut" });
    for (let i = 1; i < count; i++) {
      const x = parentX[Math.min(parentX.length - 1, Math.floor(i / 2))];
      const slime = this.inBox(this.add.sprite(x, GROUND_Y, "slime-idle").setOrigin(.52, .625)
        .setScale(size * .6, size * 1.15).play("slimeboss-idle"));
      this.slimeAdds.push(slime);
      this.tweens.add({ targets: slime, scaleX: size, scaleY: size, duration: 450, ease: "Back.easeOut" });
    }
    if (phase > 0) {
      const goo = this.aReg(this.inBox(this.add.particles(this.orc.x, GROUND_Y - 22, "spark", {
        speedX: { min: -90, max: 150 }, speedY: { min: -90, max: -25 }, gravityY: 210,
        lifespan: 600, scale: { start: .85, end: 0 }, tint: [0x9dce80, 0xcbe69d], emitting: false,
      }).setDepth(29)));
      goo.explode(16);
      this.aTimer(this.time.delayedCall(700, () => goo.destroy()));
    }
  }

  /** Moss Slime: dodge a slam, sever its stretched goo, then slash through the rushing swarm. */
  private slimeStage(gen: number, progress: SlimeProgress) {
    if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
    this.clearArenaObjs();
    this.slimeProgress = { ...progress };
    this.arenaWard = progress.phase;
    this.arenaWardMissed = false;
    this.arenaDealsDone = slimeBeats(progress);
    this.splitSlimeLane(progress);
    this.drainBossBar();
    const arena = createSlimeBossArena({
      scene: this, rect: this.arenaRect(), progress, final: this.run.killed + 1 >= RUN_COMPLETE_AT,
      alive: () => gen === this.arenaGen && !this.run.over && this.arenaActive,
      sound: key => this.sfx(key, .4),
      hurt: () => {
        if (this.bellForgives()) return;
        this.arenaWardMissed = true; this.bossSwing(); this.arenaStrikeHero();
        this.slimeAdds.forEach(s => s.play("slimeboss-attack").once("animationcomplete", () => {
          if (s.active) s.play("slimeboss-idle");
        }));
        this.writeCheckpoint(true);
      },
      hit: cleared => {
        this.slimeProgress = { phase: progress.phase, cleared };
        this.arenaDealsDone = slimeBeats(this.slimeProgress);
        this.drainBossBar(); this.bossReact(); this.playCombo(["hero-attack2"], "hero-idle");
        if (progress.phase === 2) {
          const caught = this.slimeAdds.pop();
          if (caught) {
            caught.play("slimeboss-death");
            this.tweens.add({ targets: caught, alpha: 0, duration: 400, onComplete: () => caught.destroy() });
          }
        }
        this.refreshHud(); this.writeCheckpoint(true);
      },
      cleared: () => {
        if (!this.arenaWardMissed) {
          this.run.block++; this.floatGuard(this.hero.x + 24, GROUND_Y - 90, 1); this.refreshHud();
        }
        this.sfx(`combo${3 + progress.phase}`, .45);
        if (progress.phase === 2) this.completeBossArena(gen, true);
        else this.slimeStage(gen, { phase: (progress.phase + 1) as 1 | 2, cleared: 0 });
      },
    });
    this.aReg(this.inBox(arena, true));
    this.writeCheckpoint(true);
  }

  /**
   * A stage of any boss arena falls: fanfare, the flawless refund, his taunt,
   * then on to whatever comes next. Every warden's stage ends through here, so
   * the beat between games is identical no matter whose fight you are in.
   */
  private arenaStageClear(gen: number, msg: string, taunt: string, next: () => void, gapMs = 1900) {
    if (gen !== this.arenaGen) return;
    const flawless = !this.arenaWardMissed;
    this.drainBossBar();
    this.cameras.main.shake(240, 0.008);
    this.sfx(`combo${Math.min(5, 3 + this.arenaWard)}`, 0.55);
    this.notice(msg, this.boss.accent);
    if (flawless) {
      this.run.block += 1; // unmarked through the whole stage — a guard charge comes back
      this.refreshHud();
      this.time.delayedCall(700, () => {
        if (gen === this.arenaGen) this.floatGuard(this.hero.x + 24, GROUND_Y - 90, 1);
      });
    }
    this.clearArenaObjs();
    this.arenaWard++;
    this.arenaDealIdx = 0;
    this.arenaWardMissed = false;
    if (this.boss.arena === "goring" && this.arenaWard < 3) {
      this.gorrachSurface(msg, "", `${this.arenaWard} / 3`);
      const R = this.arenaRect();
      const emblem = this.aReg(this.inBox(this.add.image(R.cx, R.cy, gorrachToken(this, "gold")).setDisplaySize(130, 130), true));
      this.tweens.add({ targets: emblem, angle: 12, duration: 250, yoyo: true, ease: "Sine.easeInOut" });
    }
    if(this.boss.arena === "shells" && this.arenaWard < 3) {
      this.malgrimSurface("Defence broken","Get ready for the next attack.",`${Math.min(this.arenaWard,3)} / 3`);
      const R=this.arenaRect();
      this.aReg(this.inBox(this.add.text(R.cx,R.cy,"DEFENCE BROKEN",{fontFamily:"system-ui, sans-serif",fontSize:"32px",fontStyle:"bold",color:"#ffe0a3"}).setOrigin(.5).setDepth(52)));
    }
    if (this.boss.arena === "rimes") {
      this.frostSurface(this.arenaWard < 3 ? "Ice broken" : "Heart shattered", "", `${this.arenaWard} / 3`);
      const R = this.arenaRect();
      const x = R.cx, y = R.y + 104 + (R.h - 150) / 2;
      const aftershock = this.aReg(this.inBox(this.add.graphics().setDepth(44), true));
      iceCracks(aftershock, x, y, Math.min(300, R.h - 185), 2);
      this.tweens.add({ targets: aftershock, alpha: 0, duration: 1100 });
      this.aReg(this.inBox(iceBurst(this, x, y, 110), true));
    }
    if (taunt)
      this.time.delayedCall(950, () => {
        if (gen === this.arenaGen && this.arenaActive) this.notice(taunt, this.boss.accent);
      });
    this.time.delayedCall(gapMs, () => {
      if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
      next();
    });
  }

  /** Title card for a stage: name, then the rules, then the game starts. */
  private arenaStageIntro(gen: number, title: string, sub: string, start: () => void) {
    if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
    // Gorrach teaches through his wind-up and arena cues, without a rules card.
    if (this.boss.arena === "goring" || this.boss.arena === "rimes") { start(); return; }
    if(this.boss.arena === "shells") {
      this.clearArenaObjs();
      const names=["Find the openings","Break the falling spells","Return his fire"];
      const rules=["Tap gold targets. Leave red traps alone.","Tap gold. Swipe blue along its arrow.","Tap when gold reaches your guard. Ignore red."];
      this.malgrimSurface(names[this.arenaWard],rules[this.arenaWard],"GET READY");
    }
    if(this.boss.arena !== "shells") this.notice(title, "#ffd24a");
    this.time.delayedCall(850, () => {
      if (gen !== this.arenaGen) return;
      if (this.boss.arena !== "shells") this.notice(sub, "#ffd7a0");
    });
    this.time.delayedCall(1700, () => {
      if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
      start();
    });
  }

  /** The warden reels from a landed blow (or just flashes, if his pack has no hurt art). */
  private bossReact() {
    if (!this.orc || this.orcDying) return;
    const k = this.boss.key;
    if (this.boss.arena === "rimes") this.aReg(this.inBox(iceBurst(this, this.orc.x, GROUND_Y - 50, 35), false));
    if (this.boss.hasHurt) {
      this.orc.play(`${k}-hurt`).once("animationcomplete", () => {
        if (this.orc && this.orcAnim === k && !this.orcDying) this.orc.play(`${k}-idle`);
      });
    } else {
      this.orc.setTintFill(0xffffff);
      this.time.delayedCall(90, () => this.orc?.clearTint());
      this.tweens.add({ targets: this.orc, x: this.orc.x + 14, duration: 90, yoyo: true, ease: "Quad.easeOut" });
    }
    this.cameras.main.shake(180, 0.006);
  }

  /** He swings/casts, then drops back to idle. */
  private bossSwing() {
    if (!this.orc || this.orcDying) return;
    const k = this.boss.key;
    if (this.boss.arena === "rimes") {
      const frost = this.aReg(this.inBox(this.add.graphics().setDepth(28), false));
      frost.fillStyle(0x8bdcf4, .22).fillEllipse(this.orc.x, GROUND_Y - 2, 120, 17);
      frost.lineStyle(2, 0xdcfaff, .7).lineBetween(this.orc.x - 54, GROUND_Y - 4, this.orc.x + 54, GROUND_Y - 4);
      this.tweens.add({ targets: frost, alpha: 0, duration: 700, onComplete: () => frost.destroy() });
      for (let i = 0; i < 5; i++) {
        const x = this.orc.x - 50 + i * 25;
        const spike = this.aReg(this.inBox(this.add.image(x, GROUND_Y + 2, frostSpike(this)).setOrigin(.5, 1)
          .setDisplaySize(15, 26 + i % 2 * 12).setFlipY(true).setAlpha(.8).setDepth(29), false));
        const sy = spike.scaleY;
        spike.scaleY = 0;
        this.tweens.add({ targets: spike, scaleY: sy, duration: 160, delay: i * 35, ease: "Back.easeOut" });
        this.tweens.add({ targets: spike, alpha: 0, duration: 400, delay: 300, onComplete: () => spike.destroy() });
      }
    }
    if (this.boss.arena === "goring") {
      const dust = this.aReg(this.inBox(this.add.particles(this.orc.x, GROUND_Y - 3, "spark", {
        speedX: { min: -85, max: 65 }, speedY: { min: -45, max: -12 }, gravityY: 100,
        lifespan: 430, scale: { start: .65, end: 0 }, tint: [0xc09a64, 0xe2c393], emitting: false,
      }).setDepth(29), false));
      dust.explode(9);
      this.aTimer(this.time.delayedCall(500, () => dust.destroy()));
    }
    this.orc.play(`${k}-attack`).once("animationcomplete", () => {
      if (this.orc && this.orcAnim === k && !this.orcDying) this.orc.play(`${k}-idle`);
    });
  }

  /** The arena's playfield: the rect the retracted board left behind. */
  private arenaRect() {
    return { x: GRID_X, y: GRID_Y, w: this.boardWidth, h: this.boardHeight, cx: GRID_X + this.boardWidth / 2, cy: GRID_Y + this.boardHeight / 2 };
  }

  private malgrimSurface(title: string, instruction: string, progress: string) {
    const art=malgrimArena(this,this.arenaRect(),Math.min(3,this.arenaWard+1),title,instruction,progress,this.run.biome === "forest");
    this.aReg(this.inBox(art.root));
    return art.tally;
  }

  private frostSurface(title: string, cue: string, progress: string) {
    const art = bossArenaArt(this, this.arenaRect(), "snow", title, cue, progress);
    this.aReg(this.inBox(art.root, true));
    return art.tally;
  }

  private gorrachSurface(title: string, subtitle: string, progress: string) {
    const art = gorrachArena(this, this.arenaRect(), Math.min(3, this.arenaWard + 1), title, subtitle, progress);
    this.aReg(this.inBox(art.root, true));
    return art.tally;
  }

  private gorrachImpact(x: number, y: number, color: number) {
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const chip = this.aReg(this.inBox(this.add.rectangle(x, y, 8, 4, color).setDepth(51), true));
      this.tweens.add({ targets: chip, x: x + Math.cos(angle) * 65, y: y + Math.sin(angle) * 42,
        alpha: 0, angle: i * 37, duration: 300, ease: "Quad.easeOut", onComplete: () => chip.destroy() });
    }
  }

  /** Close enough to read as a duel, with feet grounded on one shared ledge. */
  private gorrachDuel() {
    const R = this.arenaRect(), y = R.y + Math.min(220, R.h * .43);
    const floor = this.aReg(this.inBox(this.add.graphics().setDepth(41)));
    floor.fillStyle(0x171d15, .65).fillEllipse(R.cx, y + 10, R.w * .64, 30);
    floor.lineStyle(3, 0x908353, .6).lineBetween(R.cx - R.w * .28, y + 9, R.cx + R.w * .28, y + 9);
    const bull = this.aReg(this.inBox(this.add.sprite(R.cx + 95, y, "mino-idle")
      .setOrigin(.5, .9).setScale(.92).setFlipX(this.boss.faceLeft).setDepth(45).play("mino-idle")));
    const you = this.aReg(this.inBox(this.add.sprite(R.cx - 105, y, PLAYER_TEXTURE)
      .setOrigin(.5, HERO_ORIGIN).setScale(2.8 / PLAYER_DENSITY).setDepth(45).play("hero-idle")));
    return { bull, you };
  }

  private gorrachPlate(x: number, y: number, r: number, kind: "gold" | "red" | "blue" | "hidden") {
    const root = this.add.container(x, y).setDepth(44);
    root.add(this.add.image(0, 0, gorrachToken(this, kind)).setDisplaySize(r * 2.35, r * 2.35));
    return this.aReg(this.inBox(root, true));
  }

  private spellToken(x:number,y:number,r:number,kind:"gold"|"red"|"blue") {
    const root=this.add.container(x,y).setDepth(44);
    root.add(this.add.image(0,0,this.boss.arena === "rimes" ? frostCrystal(this,kind) : malgrimToken(this,kind)).setDisplaySize(r*2.5,r*2.5));
    return this.aReg(this.inBox(root));
  }

  // ---- the grammar's shared parts -------------------------------------------
  // Everything below is boss-agnostic on purpose: the wardens differ in theme
  // and staging, never in vocabulary. See the G_* colours up top.

  /** Swung before the blow was there to meet: no damage, but you are committed. */
  private earlySwing(x: number, y: number) {
    // committing the blade early is the whole cost: the lockout usually eats the
    // real window, so the punishment lands as a missed parry rather than as damage
    this.swingLockUntil = this.time.now + EARLY_SWING_LOCK_MS;
    this.playCombo(["hero-attack"], "hero-idle");
    this.sfx("swing1", 0.24);
    this.floatChip(x, y - 62, "too early!", { size: 17, tint: [0xd0d4dc, 0xb9c0cc, 0x8a8f98, 0x6a707c], stroke: "#14171f" });
  }

  /**
   * An orb BREAKS: wedges of it spin off under gravity and fade. Used for taps
   * and for a cut taken the wrong way — anything that smashes rather than slices.
   */
  private orbShatter(x: number, y: number, r: number, colour: number, pieces = 7, force = 1) {
    for (let i = 0; i < pieces; i++) {
      const a = (360 / pieces) * i + Math.random() * 24;
      const rad = Phaser.Math.DegToRad(a);
      const w = r * (0.34 + Math.random() * 0.3);
      const shard = this.aReg(
        this.inBox(
          this.add
            .triangle(x, y, 0, 0, w, -w * 0.5, w * 0.4, w * 0.7, colour, 0.95)
            .setDepth(48)
            .setAngle(a),
        ),
      );
      const speed = (70 + Math.random() * 130) * force;
      this.tweens.add({
        targets: shard,
        x: x + Math.cos(rad) * speed,
        y: y + Math.sin(rad) * speed + 70, // gravity pulls the pieces down as they fly
        angle: a + (Math.random() * 320 - 160),
        alpha: 0,
        scale: 0.35,
        duration: 420 + Math.random() * 220,
        ease: "Quad.easeOut",
        onComplete: () => shard.destroy(),
      });
    }
    const flash = this.aReg(this.inBox(this.add.circle(x, y, r * 0.9, 0xffffff, 0.85).setDepth(49)));
    this.tweens.add({ targets: flash, scale: 1.7, alpha: 0, duration: 190, onComplete: () => flash.destroy() });
  }

  /**
   * An orb is CLEAVED along the stroke: it falls into two halves that slide
   * apart perpendicular to the cut, tumble, and drop away — the fruit-ninja
   * read, so a clean slice never looks like a tap.
   */
  private orbCut(x: number, y: number, r: number, colour: number, ang: number) {
    // the blade's path, flashed across the orb
    const slash = this.aReg(
      this.inBox(this.add.rectangle(x, y, r * 4.2, 5, 0xffffff, 0.95).setAngle(ang).setDepth(50)),
    );
    this.tweens.add({ targets: slash, alpha: 0, scaleX: 1.35, duration: 260, onComplete: () => slash.destroy() });

    // two half-discs, split down the stroke
    const half = (from: number, sign: number) => {
      const piece = this.aReg(this.inBox(this.add.arc(x, y, r, from, from + 180, false, colour, 0.95).setDepth(48)));
      const perp = Phaser.Math.DegToRad(ang + 90 * sign);
      this.tweens.add({
        targets: piece,
        x: x + Math.cos(perp) * (r * 1.5),
        y: y + Math.sin(perp) * (r * 1.5) + 80, // they part, then fall
        angle: 45 * sign,
        alpha: 0,
        duration: 520,
        ease: "Quad.easeOut",
        onComplete: () => piece.destroy(),
      });
    };
    half(ang, 1);
    half(ang + 180, -1);
    this.cameras.main.shake(110, 0.004);
  }

  /**
   * The blade streak: a tapering ribbon along the last few drag points, drawn
   * only while an arena actually wants cutting. It is what makes a swipe feel
   * like a swing rather than a gesture the game happened to accept.
   */
  private drawSwipeTrail() {
    const live = this.arenaActive && this.swipeTargets.length > 0;
    if (!live) {
      if (this.trailGfx) {
        this.trailGfx.destroy();
        this.trailGfx = null;
      }
      this.trailPts.length = 0;
      return;
    }
    const now = this.time.now;
    const p = this.input.activePointer;
    if (p.isDown) {
      const l = this.toLocal(p.x, p.y);
      const last = this.trailPts[this.trailPts.length - 1];
      if (!last || Phaser.Math.Distance.Between(last.x, last.y, l.x, l.y) > 6) this.trailPts.push({ x: l.x, y: l.y, t: now });
    }
    while (this.trailPts.length && now - this.trailPts[0].t > TRAIL_LIFE_MS) this.trailPts.shift();
    if (!this.trailGfx) this.trailGfx = this.inBox(this.add.graphics().setDepth(62));
    const g = this.trailGfx;
    g.clear();
    for (let i = 1; i < this.trailPts.length; i++) {
      const a = this.trailPts[i - 1];
      const b = this.trailPts[i];
      const age = 1 - (now - b.t) / TRAIL_LIFE_MS; // newest segments are fattest and brightest
      g.lineStyle(Math.max(1, 11 * age), 0xffffff, 0.65 * age);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  /**
   * A GOLD node: tap it once. Returns the circle so the stage can move it,
   * time it out, or kill it. `onTap` fires at most once.
   */
  private goldNode(x: number, y: number, r: number, onTap: () => void, gate?: () => boolean) {
    const g = (this.boss.arena === "goring" ? this.gorrachPlate(x,y,r,"gold") : this.spellToken(x,y,r,"gold")).setInteractive(new Phaser.Geom.Circle(0,0,r),Phaser.Geom.Circle.Contains);
    let spent = false;
    g.on("pointerdown", () => {
      if (spent) return;
      if (gate && !gate()) {
        this.earlySwing(g.x, g.y); // struck before it was there to strike
        return;
      }
      spent = true;
      this.sfx("hit3", 0.5, 1.15);
      this.orbShatter(g.x, g.y, r, G_GOLD, 7); // it BREAKS — shards, not a fade
      g.destroy();
      onTap();
    });
    this.tweens.add({ targets: g, scale: 1.08, duration: 380, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    return g;
  }

  /**
   * A RED node: the lie among the gold. Tapping it is the mistake — it never
   * rewards, it only ever costs, and it looks nothing like gold.
   */
  private redNode(x: number, y: number, r: number, onTouched: () => void) {
    const g = (this.boss.arena === "goring" ? this.gorrachPlate(x,y,r,"red") : this.spellToken(x,y,r,"red")).setInteractive(new Phaser.Geom.Circle(0,0,r),Phaser.Geom.Circle.Contains);
    let spent = false;
    g.on("pointerdown", () => {
      if (spent) return;
      spent = true;
      this.sfx("fireball1", 0.4, 0.8);
      this.orbShatter(g.x, g.y, r, G_RED, 9, 1.5); // it bursts in your hand
      g.destroy();
      onTouched();
    });
    // red never pulses invitingly — it sits there and glowers
    this.tweens.add({ targets: g, alpha: 0.65, duration: 520, yoyo: true, repeat: -1 });
    return g;
  }

  /**
   * Watch every drag so BLUE nodes can be cut. One reader for the whole scene:
   * a drag is only judged when an arena is live and something is actually
   * asking to be cut, so ordinary board swaps are never touched.
   */
  private installSwipeReader() {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (!this.arenaActive || !this.swipeTargets.length) return;
      this.swipeFrom = this.toLocal(p.x, p.y);
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      const from = this.swipeFrom;
      this.swipeFrom = null;
      if (!from || !this.arenaActive || !this.swipeTargets.length) return;
      const to = this.toLocal(p.x, p.y);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      if (Math.hypot(dx, dy) < SWIPE_MIN) return; // a tap, not a cut
      const ang = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
      for (const t of [...this.swipeTargets]) {
        if (!t.alive || !this.segHitsCircle(from.x, from.y, to.x, to.y, t.x, t.y, t.r)) continue;
        t.alive = false; // the node re-arms itself if it was gated shut
        if (Math.abs(Phaser.Math.Angle.ShortestBetween(ang, SWIPE_ANGLE[t.dir])) <= SWIPE_TOL) t.onHit(ang);
        else t.onWrong?.();
      }
    });
  }

  /** Did the drag segment pass through this circle? */
  private segHitsCircle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number) {
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby || 1;
    const t = Phaser.Math.Clamp(((cx - ax) * abx + (cy - ay) * aby) / len2, 0, 1);
    return Phaser.Math.Distance.Between(ax + abx * t, ay + aby * t, cx, cy) <= r;
  }

  /**
   * A BLUE node: cut across it the way its arrow points. Committed at an
   * instant like a tap, but with a direction to read — that is the whole reason
   * blue exists as a separate colour.
   */
  private swipeNode(x: number, y: number, r: number, dir: SwipeDir, onHit: () => void, onWrong?: () => void, gate?: () => boolean) {
    const ring = this.boss.arena === "goring" ? this.gorrachPlate(x,y,r,"blue") : this.spellToken(x,y,r,"blue");
    const arrow = this.aReg(
      this.inBox(
        this.add
          .text(x, y, SWIPE_GLYPH[dir], { fontFamily: EMOJI_FONT, fontStyle: "bold", fontSize: `${Math.round(r * 1.5)}px`, color: "#ffffff" })
          .setOrigin(0.5)
          .setDepth(45),
      ),
    );
    // a little drift along the cut line, so the direction reads without reading
    const off = dir === "left" ? [-8, 0] : dir === "right" ? [8, 0] : dir === "up" ? [0, -8] : [0, 8];
    this.tweens.add({ targets: arrow, x: x + off[0], y: y + off[1], duration: 420, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    const entry = { x, y, r: r + 14, dir, alive: true, onHit: (_ang: number) => {}, onWrong };
    const kill = () => {
      entry.alive = false;
      this.tweens.killTweensOf(arrow);
      ring.destroy();
      arrow.destroy();
    };
    entry.onHit = (ang: number) => {
      if (gate && !gate()) {
        entry.alive = true; // it was not yet there to cut — stay up
        this.earlySwing(entry.x, entry.y);
        return;
      }
      this.sfx("swing2", 0.45, 1.1);
      this.orbCut(entry.x, entry.y, r, G_BLUE, ang); // cleave it along the stroke
      kill();
      onHit();
    };
    entry.onWrong = () => {
      if (gate && !gate()) {
        entry.alive = true;
        this.earlySwing(entry.x, entry.y);
        return;
      }
      this.sfx("swing1", 0.3, 0.9);
      this.orbShatter(entry.x, entry.y, r, G_BLUE, 5); // hacked apart, not cleanly cut
      kill();
      onWrong?.();
    };
    this.swipeTargets.push(entry);
    return {
      get alive() {
        return entry.alive;
      },
      move(nx: number, ny: number) {
        entry.x = nx;
        entry.y = ny;
        ring.setPosition(nx, ny);
        arrow.setPosition(nx, ny);
      },
      destroy: kill,
    };
  }

  /**
   * One incoming arena hit on the hero. A warden's blow PIERCES the guard: it
   * lands in full whatever the shield count says, and the pool is not spent.
   *
   * The guard used to turn these, which quietly gutted the whole fight — a
   * player who banked shields on the board could eat every colour mistake for
   * free, so the rules had no stakes. Now the only defence is playing well.
   *
   * `times` is the severity: a RED violation lands twice.
   */
  private arenaStrikeHero(times = ARENA_MISS_STRIKES) {
    const hits = Math.max(1, times);
    let net = 0;
    for (let i = 0; i < hits; i++) net += pierceStrike(this.run);
    this.refreshHud();

    // Say plainly that the shield did NOT apply. Without this the guard counter
    // sits there untouched while the skull creeps and it reads as a bug.
    if (this.run.block > 0)
      this.floatChip(this.hero.x + 30, GROUND_Y - 112, "🛡 PIERCED", {
        size: 18,
        tint: [0xffd9d0, 0xff9d8a, 0xd2543a, 0x8a2d1f],
        stroke: "#1a0a04",
        font: EMOJI_FONT,
      });

    this.heroKnock = Math.max(this.heroKnock, times > 1 ? KNOCK_RED : KNOCK_MISS);
    this.cameras.main.shake(times > 1 ? 380 : 260, times > 1 ? 0.014 : 0.009);
    this.hero.setTint(times > 1 ? 0xff6a4a : 0xffa060);
    this.time.delayedCall(times > 1 ? 300 : 200, () => this.hero.clearTint());
    this.sfx(this.pick(["hit1", "hit2", "hit3"]), 0.5, times > 1 ? 0.85 : 1);
    haptic("damage");
    void net;
    // a heavy blow bleeds the screen red, so the difference is felt, not read
    if (times > 1) {
      const flash = this.inBox(this.add.rectangle(this.boardCenter, GRID_Y + this.boardHeight / 2, this.boardWidth, this.boardHeight, G_RED, 0.28).setDepth(70));
      this.tweens.add({ targets: flash, fillAlpha: 0, duration: 420, onComplete: () => flash.destroy() });
    }
  }

  /**
   * A RED slip, offered to the Warding Bell first.
   *
   * Returns true if a bell ate it, in which case the CALLER MUST ABORT: no
   * strike, no lost notch, no broken flawless run — the mistake simply did not
   * happen. Softening the damage (what the bell used to do) was the wrong shape
   * for a charm: RED is the one rule the grammar never bends, so forgiving the
   * rule outright reads far better than quietly discounting the bill.
   */
  private bellForgives(): boolean {
    if (this.run.bellCharges <= 0) return false;
    this.run.bellCharges--;
    this.refreshHud();
    this.sfx("block3", 0.6, 1.55);
    this.sfx("pickup", 0.4, 1.7);
    this.notice(
      this.run.bellCharges > 0
        ? `Safety Bell saved you · ${this.run.bellCharges} left`
        : "Safety Bell used · mistake cancelled",
      "#ffd24a",
    );
    // a warding ring flares off the hero so the save is unmistakable
    const ring = this.inBox(
      this.add.circle(this.hero.x, GROUND_Y - 46, 34, 0x000000, 0).setStrokeStyle(5, 0xffd24a, 1).setDepth(52),
    );
    this.tweens.add({ targets: ring, scale: 3.4, alpha: 0, duration: 520, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
    buzz(18);
    return true;
  }

  /** The boss bar is the stage meter — drain it to the current beats-done mark. */
  private drainBossBar() {
    if (!this.bossBar) return;
    this.tweens.killTweensOf(this.bossBar.fill);
    this.tweens.add({
      targets: this.bossBar.fill,
      scaleX: Math.max(0, 1 - this.arenaDealsDone / (this.boss.steps + (this.hasBossFinale() ? 3 : 0))),
      duration: 260,
      ease: "Quad.easeOut",
    });
  }

  /** Malgrim's stage router — his three wards, in order. */
  private malgrimIntro(gen: number) {
    const c = BOSS_STAGES.malgrim[0];
    this.arenaStageIntro(gen, c.title, c.sub, () => this.emberCourt(gen, 0));
  }

  /**
   * STAGE 1 · TARGETS (reaction: GOLD vs RED)
   *
   * His images flare across the pit and fade fast. Tap the GOLD ones; the RED
   * ones are lies and burn you. Nothing to memorise and no shell to track —
   * the whole test is reading colour and reaching it before it goes.
   */
  private emberCourt(gen: number, wave: number) {
    if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
    this.clearArenaObjs();
    const R = this.arenaRect();
    const WAVES = [
      { golds: 4, reds: 2, life: 1500, gap: 460 },
      { golds: 5, reds: 3, life: 1250, gap: 380 },
      { golds: 6, reds: 4, life: 1050, gap: 300 },
    ];
    const cfg = WAVES[wave];
    let struck = 0;
    let done = false;
    const tally = this.malgrimSurface("Find the openings",`Wave ${wave+1} / 3 · Tap gold. Avoid red.`,`0 / ${cfg.golds}`);

    const finishWave = () => {
      if (done) return;
      done = true;
      this.arenaDealsDone++;
      this.drainBossBar();
      this.time.delayedCall(600, () => {
        if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
        if (wave + 1 >= WAVES.length) {
          const c = BOSS_STAGES.malgrim[1];
          this.arenaStageClear(gen, "A WARD BREAKS", BOSS_STAGES.malgrim[0].taunt, () =>
            this.arenaStageIntro(gen, c.title, c.sub, () => this.emberFall(gen, 0)),
          );
        } else {
          this.notice("again, faster", "#ffd24a");
          this.emberCourt(gen, wave + 1);
        }
      });
    };
    const burn = () => {
      if (done || this.bellForgives()) return;
      this.arenaWardMissed = true;
      this.notice("Avoid the red spells", "#ff8a6a");
      this.arenaStrikeHero(ARENA_RED_STRIKES);
    };

    // images flare in on a drum; each fades on its own clock, hit or not
    let spawned = 0;
    const total = cfg.golds + cfg.reds;
    const order = Phaser.Utils.Array.Shuffle([
      ...Array<boolean>(cfg.golds).fill(true),
      ...Array<boolean>(cfg.reds).fill(false),
    ]) as boolean[];
    const positions=Phaser.Utils.Array.Shuffle(Array.from({length:12},(_,i)=>({
      x:R.x+86+(i%4)*(R.w-172)/3,
      y:R.y+168+Math.floor(i/4)*(R.h-296)/2,
    })));
    this.aTimer(
      this.time.addEvent({
        delay: cfg.gap,
        repeat: total - 1,
        callback: () => {
          if (done || gen !== this.arenaGen || !this.arenaActive) return;
          const {x,y}=positions[spawned%positions.length];
          const isGold = order[spawned++];
          this.sfx("spell", 0.26, isGold ? 1.35 : 0.85);
          this.bossSwing();
          // his silhouette behind each image, so the court still reads as HIM
          const fig = this.aReg(
            this.inBox(
              this.add
                .sprite(x, y + 26, "boss-idle")
                .setOrigin(0.5, BOSS_ORIGIN)
                .setScale(0.62)
                .setFlipX(true)
                .setAlpha(0.5)
                .setTint(isGold ? 0xffe6a0 : 0xff7a6a)
                .setDepth(42)
                .play("boss-idle"),
            ),
          );
          const node = isGold
            ? this.goldNode(x, y, 46, () => {
                struck++;
                tally.setText(`${struck} / ${cfg.golds}`);
                this.playCombo(["hero-attack2"], "hero-idle");
                this.bossReact();
                if (struck >= cfg.golds) finishWave();
              })
            : this.redNode(x, y, 46, burn);
          // A draining ring makes the target's remaining lifetime readable.
          const clock=this.aReg(this.inBox(this.add.graphics().setDepth(43)));
          const life={remaining:1};
          this.tweens.add({targets:life,remaining:0,duration:cfg.life,onUpdate:()=>{
            if(!node.scene) {clock.clear();return;}
            clock.clear().lineStyle(3,isGold?0xffd68c:0xe57a82,.8);
            clock.beginPath();clock.arc(x,y,57,-Math.PI/2,-Math.PI/2+Math.PI*2*life.remaining,false);clock.strokePath();
          },onComplete:()=>clock.destroy()});
          node.once("destroy",()=>{this.tweens.killTweensOf(life);clock.destroy();if(fig.scene)fig.destroy();});
          this.time.delayedCall(cfg.life, () => {
            // a tapped node destroys itself, so only fade what is still alive
            const live = [fig, node].filter((o) => o.scene);
            if (!live.length) return;
            this.tweens.add({ targets: live, alpha: 0, duration: 200, onComplete: () => live.forEach((o) => o.destroy()) });
          });
        },
      }),
    );
    // every image has had its moment — judge the wave
    this.aTimer(
      this.time.addEvent({
        delay: cfg.gap * total + cfg.life + 500,
        callback: () => {
          if (done || gen !== this.arenaGen || !this.arenaActive) return;
          done = true;
          this.arenaWardMissed = true;
          this.notice("Missed a target", "#ff8a6a");
          this.arenaStrikeHero();
          this.time.delayedCall(900, () => {
            if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
            this.emberCourt(gen, wave); // same wave, a fresh court
          });
        },
      }),
    );
  }

  /**
   * STAGE 2 · FALLING TARGETS (reaction: a falling line of GOLD / BLUE / RED)
   *
   * His fire rains down four channels. GOLD embers want a tap, BLUE ones want a
   * cut along the arrow, and RED ones want nothing at all — let them hit the
   * floor. Anything gold or blue that lands is a strike against you. Tempo
   * climbs each round; the read never changes.
   */
  private emberFall(gen: number, round: number) {
    if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
    this.clearArenaObjs();
    const R = this.arenaRect();
    const ROUNDS = [
      { need: 5, dropMs: 2100, gap: 900, redChance: 0.25 },
      { need: 6, dropMs: 1700, gap: 720, redChance: 0.3 },
      { need: 7, dropMs: 1400, gap: 560, redChance: 0.35 },
    ];
    const cfg = ROUNDS[round];
    let struck = 0;
    let done = false;

    const tally = this.malgrimSurface("Break the falling spells",`Wave ${round+1} / 3 · Tap gold. Swipe blue.`,`0 / ${cfg.need}`);

    const LANES = 4;
    const laneX = (i: number) => R.x + R.w * (0.22 + 0.185 * i);
    const topY = R.y + 146;
    const floorY = R.y + R.h - 92;
    for(let i=0;i<LANES;i++) {
      this.aReg(this.inBox(this.add.rectangle(laneX(i),(topY+floorY)/2,R.w*.15,floorY-topY+30,0x81bbd0,.035).setStrokeStyle(1,0x91bace,.08).setDepth(41)));
      this.aReg(this.inBox(this.add.ellipse(laneX(i),floorY,72,16,0xd8ad72,.12).setStrokeStyle(1,0xd8ad72,.4).setDepth(41)));
    }
    // the floor line: what reaches this has beaten you
    this.aReg(this.inBox(this.add.rectangle(R.cx, floorY, R.w - 60, 4, 0x7d6a4a, 0.8).setDepth(41)));

    const score = () => {
      struck++;
      tally.setText(`${struck} / ${cfg.need}`);
      this.bossReact();
      if (struck < cfg.need || done) return;
      done = true;
      this.arenaDealsDone++;
      this.drainBossBar();
      this.time.delayedCall(500, () => {
        if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
        if (round + 1 >= ROUNDS.length) {
          const c = BOSS_STAGES.malgrim[2];
          this.arenaStageClear(gen, "TWO DOWN", BOSS_STAGES.malgrim[1].taunt, () =>
            this.arenaStageIntro(gen, c.title, c.sub, () => this.startTennis(gen)),
          );
        } else {
          this.notice("again, faster", "#ffd24a");
          this.emberFall(gen, round + 1);
        }
      });
    };
    const slip = (why: string, times = ARENA_MISS_STRIKES) => {
      if (done) return;
      this.arenaWardMissed = true;
      this.notice(why, "#ff8a6a");
      this.arenaStrikeHero(times);
    };

    this.aTimer(
      this.time.addEvent({
        delay: cfg.gap,
        loop: true,
        callback: () => {
          if (done || gen !== this.arenaGen || !this.arenaActive) return;
          const x = laneX((Math.random() * LANES) | 0);
          const roll = Math.random();
          const kind: "gold" | "blue" | "red" = roll < cfg.redChance ? "red" : roll < cfg.redChance + 0.38 ? "blue" : "gold";
          const carrier = { y: topY };
          let handled = false;
          this.sfx("fireball1", 0.22, kind === "red" ? 0.8 : 1.3);
          this.bossSwing();

          let node: { move: (x: number, y: number) => void; destroy: () => void };
          if (kind === "blue") {
            const dir = (["up", "down", "left", "right"] as SwipeDir[])[(Math.random() * 4) | 0];
            node = this.swipeNode(x, topY, 34, dir, () => {
              handled = true;
              score();
            }, () => {
              handled = true;
              slip("wrong way");
            });
          } else if (kind === "gold") {
            const g = this.goldNode(x, topY, 34, () => {
              handled = true;
              score();
            });
            node = { move: (nx, ny) => g.setPosition(nx, ny), destroy: () => g.destroy() };
          } else {
            const g = this.redNode(x, topY, 34, () => {
              handled = true;
              if (!this.bellForgives()) slip("never the red ones", ARENA_RED_STRIKES);
            });
            node = { move: (nx, ny) => g.setPosition(nx, ny), destroy: () => g.destroy() };
          }

          this.tweens.add({
            targets: carrier,
            y: floorY,
            duration: cfg.dropMs,
            ease: "Linear",
            onUpdate: () => node.move(x, carrier.y),
            onComplete: () => {
              node.destroy();
              if (handled || done || gen !== this.arenaGen) return;
              // red is SUPPOSED to land; anything else landing is on you
              if (kind !== "red") slip(kind === "blue" ? "Swipe the blue spells" : "Missed a target");
            },
          });
        },
      }),
    );
  }


  // ---- WARD III: FIREBALL TENNIS — return his fire ---------------------------
  // He serves from the far court; the lower playfield carries the timing cue.
  // Tap the playfield as the spell reaches its guard marker
  // to reflect it back into him. Whiffs lock the swing briefly, so mashing
  // loses; his wind-up sometimes throws NOTHING; and the RED ball is a lie that
  // only hurts you if you swing at it. Three returns break the last ward.
  // This is the stage the grammar was built from: GOLD is the ball you strike,
  // RED is the one you must not touch.
  private startTennis(gen: number) {
    if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
    this.clearArenaObjs();
    const R=this.arenaRect();
    const rally=this.malgrimSurface("Return his fire","Tap when gold reaches the ring. Ignore red.",`1 / ${TENNIS_SHOTS.length}`);
    const targetX=R.x+112, serveX=R.x+R.w-92, trackY=R.cy+15;
    this.aReg(this.inBox(this.add.rectangle(R.cx,trackY,R.w-140,116,0x080f18,.7).setStrokeStyle(1,0x7e9eb5,.2).setDepth(41)));
    this.aReg(this.inBox(this.add.rectangle((targetX+serveX)/2,trackY,serveX-targetX,2,0xb9d1df,.3).setDepth(42)));
    const guard=this.aReg(this.inBox(this.add.circle(targetX,trackY,48,0xe7bd62,.08).setStrokeStyle(4,0xffd78c,.9).setDepth(43)));
    const prompt=this.aReg(this.inBox(this.add.text(R.cx,trackY+108,"Watch the incoming spell",{fontFamily:"system-ui, sans-serif",fontSize:"26px",fontStyle:"bold",color:"#d3dfeb"}).setOrigin(.5).setDepth(46)));
    this.aReg(this.inBox(this.add.text(targetX,trackY-88,"YOUR GUARD",{fontFamily:"system-ui, sans-serif",fontSize:"18px",fontStyle:"bold",color:"#ffe0a3"}).setOrigin(.5).setDepth(46)));
    this.aReg(this.inBox(this.add.text(serveX,trackY-88,"INCOMING",{fontFamily:"system-ui, sans-serif",fontSize:"18px",fontStyle:"bold",color:"#a9bbc9"}).setOrigin(.5).setDepth(46)));
    const reg = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.arenaObjs.push(o);
      return o;
    };
    const shots = TENNIS_SHOTS;
    const MX = PADIN + UI_W - 96; // his end of the court

    this.bossHold = true; // the far court is his own ground — do not drag him back to the hero
    // Malgrim re-materialises across the lane, staff raised
    if (this.orc) {
      this.tweens.killTweensOf(this.orc);
      this.orc.setPosition(MX, GROUND_Y).setFlipX(true).setAlpha(0).play("boss-idle");
      this.tweens.add({ targets: this.orc, alpha: 1, duration: 380 });
      const puff = this.inBox(
        this.add.image(MX, GROUND_Y - 44, "orb").setBlendMode(Phaser.BlendModes.ADD).setTint(0xff8a4a).setScale(0.8).setDepth(30),
      );
      this.tweens.add({ targets: puff, scale: 2.6, alpha: 0, duration: 420, onComplete: () => puff.destroy() });
      this.sfx("spell", 0.45, 0.85);
    }

    // the racket: a full-court tap catcher (timing is everything)
    const catcher = reg(this.inBox(this.add.rectangle(this.boardCenter, GRID_Y + this.boardHeight / 2, this.boardWidth, this.boardHeight, 0xffffff, 0.001).setDepth(60).setInteractive()));

    type Ball = { img: Phaser.GameObjects.Image; arrival: number; kind: "gold" | "red"; alive: boolean };
    let balls: Ball[] = [];
    let lockoutUntil = 0;
    let resolving = false; // true only BETWEEN volleys, so a rally can stay live
    let goldsLeft = 0; // golds still to return in this volley
    let token = 0; // stale launches from an abandoned volley must not join the next
    const echoes=new Map<Ball,Phaser.GameObjects.Image>();
    this.aTimer(this.time.addEvent({delay:30,loop:true,callback:()=>{
      for(const [ball,echo] of echoes) if(!ball.alive || !ball.img.scene || !balls.includes(ball)) {echo.destroy();echoes.delete(ball);}
      for(const ball of balls) {
        if(!ball.alive || !ball.img.scene) continue;
        let echo=echoes.get(ball);
        if(!echo) {echo=reg(this.inBox(this.add.image(serveX,trackY,malgrimToken(this,ball.kind)).setDisplaySize(82,82).setDepth(45)));echoes.set(ball,echo);}
        const ratio=Phaser.Math.Clamp((ball.img.x-(this.hero.x+64))/(MX-34-(this.hero.x+64)),0,1);
        echo.setPosition(targetX+(serveX-targetX)*ratio,trackY);
      }
      const ready=balls.find(b=>b.alive && this.time.now>=b.arrival-winEarly() && this.time.now<=b.arrival+winLate());
      guard.setFillStyle(ready?.kind==="gold"?0xffd78c:0xe7bd62,ready?.kind==="gold"?.28:.06);
      if(!resolving) prompt.setText(ready ? ready.kind==="gold" ? "TAP NOW" : "LET RED PASS" : balls.length ? "Wait for the ring…" : "Watch Malgrim’s cast");
      prompt.setColor(ready?.kind==="gold"?"#ffe2a0":ready?.kind==="red"?"#ffb0ae":"#d3dfeb");
    }}));

    const cfgNow = () => shots[Math.min(this.arenaDealIdx, shots.length - 1)];
    const winEarly = () => cfgNow().early ?? TENNIS_EARLY_MS;
    const winLate = () => cfgNow().late ?? TENNIS_LATE_MS;

    const clearBalls = () => {
      for (const b of balls) {
        this.tweens.killTweensOf(b.img);
        b.img.destroy();
      }
      balls = [];
    };

    const failContinue = (msg: string, times = ARENA_MISS_STRIKES) => {
      if (gen !== this.arenaGen || resolving) return;
      resolving = true;
      token++; // abandon anything still queued for the volley we just lost
      this.arenaWardMissed = true;
      clearBalls();
      this.arenaStrikeHero(times);
      this.notice(msg, "#ff8a6a");
      this.time.delayedCall(1000, () => {
        if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
        throwShot(); // the same volley again, from the top
      });
    };

    /** The whole volley is answered: bank it and move the rally on. */
    const volleyWon = () => {
      if (resolving) return;
      resolving = true;
      token++;
      clearBalls();
      this.arenaDealsDone++;
      this.arenaDealIdx++;
      this.drainBossBar();
      if (this.arenaDealIdx >= shots.length) {
        this.time.delayedCall(650, () => {
          if (gen !== this.arenaGen || this.run.over) return;
          this.arenaStageClear(gen, "STAGE COMPLETE", "", () => this.completeBossArena(gen), 900);
        });
        return;
      }
      rally.setText(`${this.arenaDealIdx + 1} / ${shots.length}`);
      this.time.delayedCall(shots[this.arenaDealIdx - 1].restMs ?? 900, () => {
        if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
        throwShot();
      });
    };

    /** One gold struck true: it flies back and burns him. */
    const reflected = (b: Ball) => {
      prompt.setText("RETURNED!").setColor("#b7f3d7");
      this.tweens.add({targets:guard,scale:1.14,duration:120,yoyo:true});
      b.alive = false;
      goldsLeft--;
      this.tweens.killTweensOf(b.img);
      balls = balls.filter((x) => x !== b);
      this.playCombo(["hero-attack2"], "hero-idle");
      this.sfx("swing2", 0.4);
      this.sfx(this.pick(["block1", "block2", "block3"]), 0.5);
      buzz(22);
      b.img.setTint(0xffe0a0); // struck true — it flies back hot
      const last = goldsLeft <= 0;
      this.tweens.add({
        targets: b.img,
        x: MX - 22,
        y: GROUND_Y - 52,
        duration: Math.max(300, cfgNow().castMs * 0.45),
        ease: "Quad.easeIn",
        onComplete: () => {
          b.img.destroy();
          if (gen !== this.arenaGen) return;
          const burst = this.inBox(
            this.add
              .particles(MX - 20, GROUND_Y - 50, "spark", {
                speed: { min: 100, max: 300 }, lifespan: { min: 200, max: 480 },
                scale: { start: 1.4, end: 0 }, blendMode: "ADD", tint: 0xffc070, emitting: false,
              })
              .setDepth(46),
          );
          burst.explode(24);
          this.time.delayedCall(600, () => burst.destroy());
          this.cameras.main.shake(220, 0.007);
          this.sfx("hit3", 0.55);
          this.bossReact();
          // mid-volley returns read as a chain, not as progress
          if (!last) this.floatChip(MX - 40, GROUND_Y - 110, "×" + (cfgNow().balls ?? 1), { size: 20 });
          if (last) volleyWon();
        },
      });
    };

    const onTap = () => {
      if (gen !== this.arenaGen || !this.arenaActive || resolving || this.run.over) return;
      const now = this.time.now;
      if (now < lockoutUntil) return; // still recovering from the whiff
      const inWin = balls.find((b) => b.alive && now >= b.arrival - winEarly() && now <= b.arrival + winLate());
      if (!inWin) {
        // a swing at nothing — his fakes and your nerves conspire
        lockoutUntil = now + TENNIS_WHIFF_LOCK_MS;
        this.playCombo(["hero-attack"], "hero-idle");
        this.sfx("swing1", 0.25);
        if (balls.some((b) => b.alive))
          this.floatChip(this.hero.x + 30, GROUND_Y - 96, "early!", { size: 18, tint: [0xd0d4dc, 0xb9c0cc, 0x8a8f98, 0x6a707c], stroke: "#14171f" });
        return;
      }
      if (inWin.kind === "red") {
        // he sold you the lie — it detonates in your swing
        const burst = this.inBox(
          this.add
            .particles(inWin.img.x, inWin.img.y, "spark", {
              speed: { min: 80, max: 240 }, lifespan: { min: 200, max: 460 },
              scale: { start: 1.2, end: 0 }, blendMode: "ADD", tint: G_RED, emitting: false,
            })
            .setDepth(47),
        );
        burst.explode(20);
        this.time.delayedCall(600, () => burst.destroy());
        if (this.bellForgives()) {
          // the lie pops harmlessly and the rally carries on — the golds in
          // this volley are still yours to return
          inWin.alive = false;
          this.tweens.killTweensOf(inWin.img);
          inWin.img.destroy();
          balls = balls.filter((b) => b !== inWin);
          return;
        }
        failContinue("never swing at red", ARENA_RED_STRIKES);
        return;
      }
      reflected(inWin);
    };
    catcher.on("pointerdown", onTap);

    const launch = (kind: "gold" | "red", flightMs: number, delayMs: number, mine: number) => {
      if (kind === "gold") goldsLeft++; // counted at schedule time so the volley knows its size
      this.time.delayedCall(delayMs, () => {
        if (gen !== this.arenaGen || this.run.over || !this.arenaActive || mine !== token) return;
        const zx = this.hero.x + 64;
        const zy = GROUND_Y - 42;
        const color = kind === "gold" ? G_GOLD : G_RED;
        const img = reg(this.inBox(this.add.image(MX - 34, GROUND_Y - 54, "bolt").setBlendMode(Phaser.BlendModes.ADD).setTint(color).setScale(1.5).setDepth(46)));
        const b: Ball = { img, arrival: this.time.now + flightMs, kind, alive: true };
        balls.push(b);
        this.sfx(kind === "gold" ? "fireball2" : "fireball3", 0.4, kind === "red" ? 1.3 : 1);
        if (this.orc && !this.orcDying) this.bossSwing(); // a fresh cast per ball — the barrage is HIS effort
        this.tweens.add({
          targets: img,
          x: zx,
          y: zy,
          duration: flightMs,
          ease: "Linear",
          onComplete: () => {
            if (!b.alive || gen !== this.arenaGen || !img.scene) return;
            // past the guard: the late window still lives while it closes the gap
            this.tweens.add({
              targets: img,
              x: this.hero.x + 4,
              y: GROUND_Y - 40,
              duration: 130,
              ease: "Linear",
              onComplete: () => {
                if (!b.alive || gen !== this.arenaGen || !img.scene) return;
                b.alive = false;
                if (b.kind === "gold") {
                  const burst = this.inBox(
                    this.add
                      .particles(img.x, img.y, "spark", {
                        speed: { min: 80, max: 260 }, lifespan: { min: 200, max: 460 },
                        scale: { start: 1.2, end: 0 }, blendMode: "ADD", tint: 0xff8844, emitting: false,
                      })
                      .setDepth(47),
                  );
                  burst.explode(18);
                  this.time.delayedCall(600, () => burst.destroy());
                  img.destroy();
                  failContinue("his fire finds you");
                } else {
                  // the red drifts past, revealed as nothing — well left alone
                  this.tweens.add({ targets: img, x: img.x - 90, alpha: 0, duration: 280, onComplete: () => img.destroy() });
                  this.sfx("swap", 0.25, 1.4);
                }
              },
            });
          },
        });
      });
    };

    const throwShot = () => {
      if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
      resolving = false;
      clearBalls();
      goldsLeft = 0;
      const mine = ++token;
      const cfg = cfgNow();
      const n = cfg.balls ?? 1;
      const doFake = Math.random() < (cfg.fake ?? 0);
      if (cfg.call) this.notice(cfg.call, n >= 3 ? "#ff8a6a" : "#8ff4ff");
      if (n >= 3) this.cameras.main.shake(260, 0.005); // the crescendo announces itself
      if (this.orc && !this.orcDying) this.bossSwing();
      this.sfx("fireball1", 0.3, 0.85);

      const fire = (extraDelay: number) => {
        for (let i = 0; i < n; i++) {
          // the first ball of a volley is always real — a volley of pure lies
          // would just be a pause you had to sit through
          const kind: "gold" | "red" = i > 0 && Math.random() < (cfg.redChance ?? 0) ? "red" : "gold";
          launch(kind, cfg.castMs * (doFake ? 0.85 : 1), extraDelay + i * (cfg.stagger ?? 0), mine);
        }
      };

      this.time.delayedCall(240, () => {
        if (gen !== this.arenaGen || this.run.over || !this.arenaActive || mine !== token) return;
        if (doFake) {
          // nothing leaves his hand — then the REAL volley, fast and mean
          this.time.delayedCall(460, () => {
            if (gen !== this.arenaGen || this.run.over || !this.arenaActive || mine !== token) return;
            if (this.orc && !this.orcDying) this.bossSwing();
            fire(180);
          });
        } else fire(0);
      });
    };

    throwShot();
  }

  private hasBossFinale() {
    return (this.boss.arena === "shells" || this.boss.arena === "rimes") && this.run.killed + 1 >= RUN_COMPLETE_AT;
  }

  private startBossFinale(gen: number) {
    if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
    const kind = this.boss.arena;
    if (kind === "goring" || kind === "slime") { this.completeBossArena(gen, true); return; }
    this.clearArenaObjs();
    this.arenaWard = 3;
    this.arenaDealsDone = this.boss.steps;
    this.bossHold = false;
    this.orc?.setAlpha(1).play(`${this.boss.key}-idle`);
    this.drainBossBar();
    let progress = 0;
    const finale = createBossFinale({
      scene: this, rect: this.arenaRect(), kind, theme: this.run.biome as BossTheme,
      bossKey: this.boss.key, bossOrigin: this.boss.origin, flip: this.boss.faceLeft,
      alive: () => gen === this.arenaGen && !this.run.over && this.arenaActive,
      hurt: () => { this.arenaWardMissed = true; this.bossSwing(); this.arenaStrikeHero(); },
      hit: (fraction) => {
        if (fraction <= progress) return;
        progress = fraction; this.arenaDealsDone = this.boss.steps + 3 * fraction;
        this.drainBossBar(); this.bossReact(); this.playCombo(["hero-attack2"], "hero-idle");
      },
      sound: (key) => this.sfx(key, .4),
      win: () => this.completeBossArena(gen, true),
    });
    this.aReg(this.inBox(finale, true));
    this.writeCheckpoint(true);
  }

  /** Gorrach and the slime end after three stages; wizard/ice add a floor-20 finale. */
  private completeBossArena(gen: number, finaleCleared = false) {
    if (gen !== this.arenaGen || this.run.over || !this.arenaActive || !this.orc || this.orcDying || this.run.enemy?.kind !== "boss") return;
    if (this.hasBossFinale() && !finaleCleared) { this.startBossFinale(gen); return; }
    // Retire stage callbacks before awarding the kill, so it can only pay once.
    this.arenaGen++;
    this.clearArenaObjs();
    this.arenaActive = false;
    this.bossHold = false;
    this.layout();
    this.tweens.killTweensOf(this.hero);
    this.heroLockX = true;
    this.orc.setAlpha(1).clearTint();
    dealDamage(this.run, this.run.enemy.hp, true);
    this.killOrc(900); // normal defeat animation, bounty, chest and run progression
    this.surgeAfterKill(180);
    this.showBoard();
  }

  // ================= GORRACH'S GORING RUN (plains boss arena) =================
  // The plains warden never trades blows on the board. The board
  // retracts and he takes the pit it leaves behind for three horns, each its
  // own game: a dodge, a memory, and a shoving match.

  private goringIntro(gen: number) {
    const c = BOSS_STAGES.gorrach[0];
    this.arenaStageIntro(gen, c.title, c.sub, () => this.goringCharge(gen, 0));
  }

  /** Three readable charges: choose a path, dodge, then punish the opening. */
  private goringCharge(gen: number, idx: number) {
    if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
    this.clearArenaObjs();
    const R = this.arenaRect(), cfg = GORE_CHARGES[idx];
    this.gorrachSurface("Dodge the charge", "Tap a clear path", `${idx + 1} / ${GORE_CHARGES.length}`);
    const laneTop = R.y + 108, laneH = (R.h - 160) / GORE_LANES;
    const laneY = (i: number) => laneTop + laneH * (i + .72);
    const heroX = R.x + R.w * .23, bullX = R.x + R.w - 108;
    const heroScale = Math.min(2.6, laneH / 42) / PLAYER_DENSITY;
    const bullScale = Math.min(.85, laneH / 130);
    let heroLane = 1, settled = false;
    this.bossHold = false;
    this.orc?.setAlpha(1).play("mino-idle");

    const dressing = this.aReg(this.inBox(this.add.graphics().setDepth(41)));
    const lanes: Phaser.GameObjects.Rectangle[] = [];
    const warnings: Phaser.GameObjects.Graphics[] = [];
    for (let i = 0; i < GORE_LANES; i++) {
      const top = laneTop + i * laneH;
      dressing.fillStyle(0x655437, .55).fillRoundedRect(R.x + 24, top + 5, R.w - 48, laneH - 10, 12);
      dressing.lineStyle(2, 0xae9260, .23).lineBetween(R.x + 36, top + 9, R.x + R.w - 36, top + 9);
      for (let j = 0; j < 25; j++) {
        const x = R.x + 38 + j * (R.w - 86) / 25;
        dressing.fillStyle(j % 3 ? 0x302e20 : 0xb39866, .24);
        dressing.fillRect(x, top + laneH * .76 + (j % 3) * 3, 8 + j % 7, 3);
      }
      lanes.push(this.aReg(this.inBox(this.add.rectangle(R.cx, top + laneH / 2, R.w - 48, laneH - 10, 0xe9c47c, .001)
        .setDepth(42).setInteractive({ useHandCursor: true }))));
      const warning = this.aReg(this.inBox(this.add.graphics().setDepth(43).setAlpha(0)));
      warning.fillStyle(0xad382d, .33).fillRoundedRect(R.x + 26, top + 6, R.w - 52, laneH - 12, 10);
      warning.lineStyle(3, 0xffb078, .9).lineBetween(R.x + 36, top + laneH - 10, R.x + R.w - 36, top + laneH - 10);
      for (let x = R.x + 65; x < R.x + R.w - 45; x += 63) {
        const y = top + laneH * .46;
        warning.lineStyle(5, 0xffb078, .7).strokePoints([{ x: x + 12, y: y - 12 }, { x, y }, { x: x + 12, y: y + 12 }]);
      }
      warnings.push(warning);
    }
    const selected = this.aReg(this.inBox(this.add.rectangle(R.x + 29, laneY(heroLane) - laneH * .22, 5, laneH - 24, 0xe9d19b).setDepth(44)));
    const shadow = this.aReg(this.inBox(this.add.ellipse(heroX, laneY(heroLane) + 3, 65, 15, 0x11180e, .45).setDepth(44)));
    const tok = this.aReg(this.inBox(this.add.sprite(heroX, laneY(heroLane), PLAYER_TEXTURE)
      .setOrigin(.5, HERO_ORIGIN).setScale(heroScale).setDepth(45).play("hero-idle")));
    const live = () => gen === this.arenaGen && !this.run.over && this.arenaActive && !!tok.scene;
    lanes.forEach((lane, i) => lane.on("pointerdown", () => {
      if (!live() || settled || i === heroLane) return;
      heroLane = i;
      this.tweens.killTweensOf(tok); this.tweens.killTweensOf(shadow);
      tok.play("hero-walk", true);
      selected.y = laneY(i) - laneH * .22;
      this.sfx("step3", .35, 1.15);
      this.tweens.add({ targets: shadow, y: laneY(i) + 3, duration: 140, ease: "Sine.easeOut" });
      this.tweens.add({ targets: tok, y: laneY(i), duration: 140, ease: "Sine.easeOut", onComplete: () => tok.play("hero-idle", true) });
    }));

    void (async () => {
      await this.arenaWait(420);
      if (!live()) return;
      const lit = Phaser.Utils.Array.Shuffle([0, 1, 2]).slice(0, cfg.blind);
      const runLane = lit[(Math.random() * lit.length) | 0];
      const bull = this.aReg(this.inBox(this.add.sprite(bullX, laneY(runLane), "mino-idle")
        .setOrigin(.5, .9).setScale(bullScale).setFlipX(this.boss.faceLeft).setDepth(46).play("mino-walk")));
      const hoofShadow = this.aReg(this.inBox(this.add.ellipse(bullX, laneY(runLane) + 4, 94, 20, 0x11180e, .45).setDepth(44)));
      bull.setAlpha(0);
      this.tweens.add({ targets: bull, alpha: 1, duration: 140 });
      this.sfx("step5", .5, .7);
      for (const i of lit) {
        warnings[i].setAlpha(.7);
        this.tweens.add({ targets: warnings[i], alpha: 1, duration: 170, yoyo: true, repeat: -1 });
      }
      // A planted silhouette, dust and backward lean sell the wind-up.
      this.tweens.add({ targets: bull, x: bullX + 12, duration: cfg.tell, ease: "Quad.easeIn" });
      const dust = this.aReg(this.inBox(this.add.particles(0, 0, "spark", {
        speed: { min: 25, max: 90 }, angle: { min: 210, max: 320 }, lifespan: { min: 180, max: 360 },
        scale: { start: .6, end: 0 }, tint: [0xb89561, 0xe0c18a], quantity: 1, frequency: 65,
      }).setDepth(45).startFollow(bull, 22, 0), true));
      await this.arenaWait(cfg.tell);
      if (!live()) return;
      for (const i of lit) {
        this.tweens.killTweensOf(warnings[i]);
        warnings[i].setAlpha(i === runLane ? 1 : 0);
      }
      this.bossSwing();
      this.sfx("swing3", .5, .6);
      const fromX = bull.x, toX = R.x + 76;
      // Match the quadratic movement curve: a hit occurs when his body arrives.
      const impactMs = cfg.run * Math.sqrt((fromX - heroX) / (fromX - toX));
      this.tweens.add({ targets: [bull, hoofShadow], x: toX, duration: cfg.run, ease: "Quad.easeIn", onComplete: () => {
        dust.stop();
        this.tweens.add({ targets: [bull, hoofShadow], alpha: 0, duration: 180 });
      } });
      await this.arenaWait(impactMs);
      if (!live() || settled) return;
      settled = true;
      if (heroLane === runLane) {
        this.arenaWardMissed = true;
        tok.setTintFill(0xff8060);
        this.tweens.add({ targets: tok, x: tok.x - 36, angle: -25, alpha: .4, duration: 250, ease: "Quad.easeOut" });
        this.notice("Caught by the charge", "#ffae88");
        this.arenaStrikeHero();
        this.aTimer(this.time.delayedCall(1050, () => this.goringCharge(gen, idx)));
        return;
      }
      this.sfx("swing1", .3, 1.3);
      selected.setFillStyle(0xafd298);
      this.arenaDealsDone++;
      this.drainBossBar();
      this.gorrachImpact(tok.x, tok.y - 30, 0xbdd99c);
      const gx = R.cx + R.w * .1;
      this.goldNode(gx, laneY(runLane) - 22, 40, () => {
        if (!live()) return;
        this.playCombo(["hero-attack2"], "hero-idle");
        tok.play("hero-attack2").once("animationcomplete", () => tok.scene && tok.play("hero-idle"));
        this.bossReact();
        this.gorrachImpact(gx, laneY(runLane) - 22, 0xffd88c);
        this.run.block++;
        this.refreshHud();
      });
      this.aTimer(this.time.delayedCall(950, () => {
        if (!live()) return;
        if (idx + 1 < GORE_CHARGES.length) this.goringCharge(gen, idx + 1);
        else this.arenaStageClear(gen, "CHARGE BROKEN", "", () => this.goringParry(gen, 0), 800);
      }));
    })();
  }


  /**
   * STAGE 2 · COUNTER (a real parry: read it late, commit on the beat)
   *
   * It used to be "answer before a deadline", which is not a timing test at all
   * — you could respond the instant a prompt appeared, at no cost, so the long
   * windows never mattered and it played far too easy. Three things fix that:
   *
   *   1. THE PARRY HAS A BEAT. The ring closes over his wind-up and only the
   *      last `window` ms count. Swing early and you whiff and are locked out,
   *      which usually costs you the real window — the tennis model.
   *   2. HE DISGUISES THE SWING. The mark is blank until `reveal` of the way
   *      through, so you cannot pre-commit; you read colour late and act fast.
   *   3. IT ROAMS, AND IT DOUBLES. Later rounds place the mark anywhere in the
   *      pit and eventually throw two at once, staggered.
   *
   * RED is still a feint: letting it pass is the correct read and scores.
   */
  private goringParry(gen: number, round: number) {
    if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
    this.clearArenaObjs();
    const R = this.arenaRect();
    const cfg = PARRY_ROUNDS[round];
    let parried = 0;
    let done = false;
    let lockedUntil = 0;
    this.bossHold = false;
    if (this.orc) this.tweens.add({ targets: this.orc, alpha: 1, duration: 300 });

    const tally = this.gorrachSurface("Turn his axe", "Gold: tap · Blue: swipe · Red: wait", `0 / ${cfg.need}`);
    const { bull, you } = this.gorrachDuel();

    const finish = () => {
      done = true;
      this.arenaDealsDone++;
      this.drainBossBar();
      this.time.delayedCall(500, () => {
        if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
        if (round + 1 >= PARRY_ROUNDS.length) {
          this.arenaStageClear(gen, "GUARD BROKEN", "", () => this.goringHorns(gen), 800);
        } else {
          this.notice("again, faster", "#8ff4ff");
          this.goringParry(gen, round + 1);
        }
      });
    };

    const good = (label: string) => {
      if (done) return;
      parried++;
      tally.setText(`${parried} / ${cfg.need}`);
      this.playCombo(["hero-attack2"], "hero-idle");
      this.sfx(this.pick(["block1", "block2", "block3"]), 0.5);
      buzz(22);
      this.cameras.main.shake(150, 0.005);
      this.bossReact();
      you.play("hero-attack2").once("animationcomplete", () => you.scene && you.play("hero-idle"));
      this.gorrachImpact(R.cx, you.y - 45, 0xffdca0);
      this.tweens.add({ targets: bull, x: bull.x + 26, duration: 150, yoyo: true, ease: "Quad.easeOut" });
      this.floatChip(R.cx, R.y + R.h * .5, label, { size: 24, tint: [0xd8ffd0, 0xa9e6a9, 0x5aa85a, 0x2f6b2f] });
      if (parried >= cfg.need) finish();
    };

    const bad = (why: string, times = ARENA_MISS_STRIKES) => {
      if (done) return;
      this.arenaWardMissed = true;
      this.notice(why, "#ff8a6a");
      this.bossSwing();
      this.tweens.add({ targets: you, x: you.x - 20, duration: 180, yoyo: true, ease: "Quad.easeOut" });
      this.arenaStrikeHero(times);
      lockedUntil = this.time.now + (times > 1 ? ARENA_RED_LOCK_MS : 300);
    };

    /** One disguised swing: blank mark -> colour -> the beat -> resolution. */
    const prompt = (delayMs: number, onResolved: () => void) => {
      this.time.delayedCall(delayMs, () => {
        if (done || gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
        const x = cfg.roam ? R.cx + (Math.random() * 2 - 1) * R.w * 0.26 : R.cx;
        const y = R.y + R.h * .66 + (cfg.roam ? (Math.random() * 2 - 1) * R.h * .035 : 0);
        const kind: "blue" | "gold" | "red" = Math.random() < cfg.red ? "red" : Math.random() < 0.62 ? "blue" : "gold";
        this.bossSwing();
        bull.play("mino-attack").once("animationcomplete", () => bull.scene && bull.play("mino-idle"));
        this.sfx("swing3", 0.4, 0.75);

        // the wind-up: a ring closing on the mark. It only ARMS at the end.
        const ring = this.aReg(this.inBox(this.add.circle(x, y, 98, 0x000000, 0).setStrokeStyle(5, 0xccb78f, .8).setDepth(46)));
        this.tweens.add({ targets: ring, scale: .56, duration: cfg.windup, ease: "Linear" });
        // blank until he commits — no pre-reading the swing
        const blank = this.gorrachPlate(x, y, 50, "hidden");

        // the only moment an answer counts: armed, not whiff-locked, not stunned
        const armAt = this.time.now + cfg.windup - cfg.window;
        const gate = () => this.time.now >= armAt && this.time.now >= this.swingLockUntil && this.time.now >= lockedUntil;
        let answered = false;
        let node: { destroy: () => void } | null = null;

        // ...he shows his hand partway through
        this.time.delayedCall(cfg.windup * cfg.reveal, () => {
          if (answered || done || gen !== this.arenaGen) return;
          blank.destroy();
          if (kind === "blue") {
            const dir = (["up", "down", "left", "right"] as SwipeDir[])[(Math.random() * 4) | 0];
            const n = this.swipeNode(x, y, 50, dir, () => {
              answered = true;
              ring.destroy();
              good("TURNED!");
              onResolved();
            }, () => {
              answered = true;
              ring.destroy();
              bad("wrong way — it lands");
              onResolved();
            }, gate);
            node = n;
          } else if (kind === "gold") {
            const g = this.goldNode(x, y, 50, () => {
              answered = true;
              ring.destroy();
              good("COUNTER!");
              onResolved();
            }, gate);
            node = { destroy: () => g.destroy() };
          } else {
            const g = this.redNode(x, y, 50, () => {
              answered = true;
              ring.destroy();
              if (!this.bellForgives()) bad("a feint — you swung at nothing", ARENA_RED_STRIKES);
              onResolved(); // fires either way, or the wave never winds up again
            });
            node = { destroy: () => g.destroy() };
          }
        });

        // the beat: the ring flares white for the only moment that counts
        this.time.delayedCall(cfg.windup - cfg.window, () => {
          if (answered || done || gen !== this.arenaGen || !ring.scene) return;
          ring.setStrokeStyle(5, 0xffffff, 1);
          this.sfx("pickup", 0.25, 1.6);
        });

        this.time.delayedCall(cfg.windup, () => {
          if (answered || done || gen !== this.arenaGen) return;
          answered = true;
          node?.destroy();
          if (blank.scene) blank.destroy();
          if (ring.scene) ring.destroy();
          // letting a FEINT go by is the correct read — everything else is a hit
          if (kind === "red") good("READ HIM!");
          else bad(kind === "blue" ? "uncut — it lands" : "too slow");
          onResolved();
        });
      });
    };

    /** A set of prompts; when they have all resolved, he winds up again. */
    const wave = () => {
      if (done || gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
      let left = cfg.prompts;
      const oneDone = () => {
        if (--left > 0 || done) return;
        this.time.delayedCall(cfg.rest, wave);
      };
      for (let i = 0; i < cfg.prompts; i++) prompt(i * (cfg.stagger ?? 0), oneDone);
    };

    this.time.delayedCall(600, wave);
  }

  /**
   * STAGE 3 · TIMING (tap gold / avoid red)
   *
   * Horns are locked and a mark sweeps the bar. Tap it on GOLD to shove him a
   * notch; five successful shoves break him. The gold window narrows gently
   * and the zones drift slowly within separate slots. A miss or timeout causes
   * a strike; red causes a heavier strike. Earned pips and boss-bar progress
   * always stay banked. Each attempt allows several passes of the needle.
   */
  private goringHorns(gen: number) {
    if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
    this.clearArenaObjs();
    const R = this.arenaRect();
    const tally = this.gorrachSurface("Lock horns", "Tap on gold · Avoid red", `0 / ${HORNS_NOTCHES}`);
    this.bossHold = false;
    if (this.orc) {
      this.tweens.killTweensOf(this.orc);
      this.orc.setAlpha(1).play("mino-idle");
    }
    let notch = 0;
    let lockedUntil = 0;
    const baseDone = this.arenaDealsDone; // horns I + II already banked

    const BW = R.w * 0.74;
    const BH = 54;
    const bx0 = R.cx - BW / 2;
    const by = R.y + R.h * .64;
    this.aReg(this.inBox(gorrachTimingFrame(this, R.cx, by, BW, BH), true));
    const gold = this.aReg(this.inBox(this.add.rectangle(R.cx, by, 10, BH, G_GOLD, 0.9).setStrokeStyle(2, G_GOLD_EDGE, 1).setDepth(42)));
    const reds = Array.from({ length: HORNS_MAX_REDS }, () =>
      this.aReg(this.inBox(this.add.rectangle(R.cx, by, 10, BH, G_RED, 0.85).setStrokeStyle(2, G_RED_EDGE, 1).setDepth(42).setVisible(false))),
    );
    const zoneMarks = this.aReg(this.inBox(this.add.graphics().setDepth(43)));
    const paintZoneMarks = () => {
      zoneMarks.clear().lineStyle(3, 0xffdfbe, .45);
      for (const red of reds) if (red.visible) {
        for (let x = red.x - red.width / 2 + 8; x < red.x + red.width / 2 - 8; x += 16)
          zoneMarks.lineBetween(x, by + BH / 2 - 7, x + 8, by - BH / 2 + 7);
      }
      zoneMarks.lineStyle(3, 0xfff3bb, .9);
      zoneMarks.strokePoints([{x:gold.x,y:by-12},{x:gold.x+8,y:by},{x:gold.x,y:by+12},{x:gold.x-8,y:by}],true);
    };
    const mark = this.aReg(this.inBox(this.add.rectangle(bx0, by, 8, BH + 22, 0xfff8de).setStrokeStyle(2, 0x302719).setDepth(44)));
    const pointer = this.aReg(this.inBox(this.add.triangle(bx0, by - BH / 2 - 15, 0, 0, 20, 0, 10, 10, 0xfff1bf).setDepth(45)));

    // The attempt clock: a timeout causes a strike, never a lost shove.
    const CW = BW;
    this.aReg(this.inBox(this.add.rectangle(R.cx, by - BH / 2 - 26, CW + 6, 14, 0x0a0b0f, 0.85).setDepth(43)));
    const clock = this.aReg(this.inBox(this.add.rectangle(bx0, by - BH / 2 - 26, CW, 9, 0xffd7a0).setOrigin(0, 0.5).setDepth(44)));
    let clockTween: Phaser.Tweens.Tween | null = null;

    const pips: Phaser.GameObjects.Arc[] = [];
    for (let i = 0; i < HORNS_NOTCHES; i++)
      pips.push(this.aReg(this.inBox(this.add.circle(R.cx - (HORNS_NOTCHES - 1) * 20 + i * 40, by + 96, 12, 0x2a2118, 1).setStrokeStyle(3, 0x7d6a4a, 1).setDepth(43))));
    const paintPips = () => {
      pips.forEach((p, i) => p.setFillStyle(i < notch ? G_GOLD : 0x2a2118, 1).setStrokeStyle(3, i < notch ? 0xffe7af : 0x7d6a4a));
      tally.setText(`${notch} / ${HORNS_NOTCHES}`);
    };
    const { bull, you } = this.gorrachDuel();

    let sweep: Phaser.Tweens.Tween | null = null;
    // every zone owns a SLOT and only drifts inside it, so they can never
    // overlap however hard the drift is pushed
    type Zone = { obj: Phaser.GameObjects.Rectangle; home: number; slack: number; phase: number };
    let zones: Zone[] = [];
    let drift = 0;

    const restart = () => {
      const step = HORNS_STEPS[Math.min(notch, HORNS_STEPS.length - 1)];
      const gw = BW * step.gold;
      const rw = BW * step.red;
      const live = reds.slice(0, step.reds);
      reds.forEach((r, i) => r.setVisible(i < step.reds));
      gold.setSize(gw, BH);
      live.forEach((r) => r.setSize(rw, BH));

      const slotN = 1 + step.reds;
      const seg = BW / slotN;
      const order = Phaser.Utils.Array.Shuffle([...Array(slotN).keys()]);
      const members: { obj: Phaser.GameObjects.Rectangle; w: number }[] = [{ obj: gold, w: gw }, ...live.map((r) => ({ obj: r, w: rw }))];
      zones = members.map((m, k) => {
        const slot = order[k];
        const slack = Math.max(0, (seg - m.w) / 2 - 4);
        const home = bx0 + slot * seg + seg / 2;
        m.obj.x = home;
        return { obj: m.obj, home, slack, phase: Math.random() * Math.PI * 2 };
      });
      drift = step.drift;
      paintZoneMarks();

      sweep?.stop();
      mark.x = bx0;
      sweep = this.tweens.add({ targets: mark, x: bx0 + BW, duration: step.sweep, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

      clockTween?.stop();
      clock.setScale(1, 1);
      clockTween = this.tweens.add({
        targets: clock,
        scaleX: 0,
        duration: step.clock,
        ease: "Linear",
        onComplete: () => {
          if (gen !== this.arenaGen || notch >= HORNS_NOTCHES) return;
          lose("too slow — he takes ground");
        },
      });
    };

    const inZone = (z: Phaser.GameObjects.Rectangle) => z.visible && Math.abs(mark.x - z.x) <= z.width / 2;

    const shove = () => {
      notch++;
      this.arenaDealsDone = baseDone + notch;
      this.drainBossBar();
      paintPips();
      this.sfx("hit3", 0.55, 1 + notch * 0.05);
      this.sfx(this.pick(["block1", "block2", "block3"]), 0.35);
      buzz(22);
      this.cameras.main.shake(160, 0.006);
      this.playCombo(["hero-attack2"], "hero-idle");
      this.bossReact();
      you.play("hero-attack2").once("animationcomplete", () => you.scene && you.play("hero-idle"));
      this.gorrachImpact(gold.x, by, 0xffdda0);
      this.tweens.add({ targets: bull, x: bull.x + 34, duration: 160, yoyo: true, ease: "Quad.easeOut" });
      this.tweens.add({ targets: you, x: you.x + 16, duration: 160, ease: "Quad.easeOut" });
      if (this.orc) this.tweens.add({ targets: this.orc, x: this.orc.x + 20, duration: 200, ease: "Quad.easeOut" });
      this.floatChip(bull.x, bull.y - 90, "SHOVE!", { size: 22, tint: [0xd8ffd0, 0xa9e6a9, 0x5aa85a, 0x2f6b2f] });
      if (notch >= HORNS_NOTCHES) {
        sweep?.stop();
        clockTween?.stop();
        this.arenaStageClear(gen, "STAGE COMPLETE", "", () => this.completeBossArena(gen), 900);
        return;
      }
      restart();
    };

    const lose = (why: string, times = ARENA_MISS_STRIKES) => {
      lockedUntil = this.time.now + (times > 1 ? ARENA_RED_LOCK_MS : 420);
      this.arenaWardMissed = true;
      // Earned shoves, filled pips and drained boss health stay secured.
      this.sfx("swing1", 0.3);
      this.notice(why, "#ff8a6a");
      this.tweens.add({ targets: you, x: you.x - (times > 1 ? 40 : 22), duration: 200, yoyo: true, ease: "Quad.easeOut" });
      this.arenaStrikeHero(times);
      if (gen === this.arenaGen && !this.run.over && this.arenaActive) restart();
    };

    restart();
    paintPips();

    // the drift: zones slide inside their slots, so the timing you learned on
    // the last notch is never quite the timing you need on this one
    this.aTimer(
      this.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          if (gen !== this.arenaGen || this.run.over || !this.arenaActive || notch >= HORNS_NOTCHES) return;
          pointer.x = mark.x;
          if (drift <= 0) return;
          const t = this.time.now / 1000;
          for (const z of zones) z.obj.x = z.home + Math.sin(t * drift + z.phase) * z.slack;
          paintZoneMarks();
        },
      }),
    );

    const catcher = this.aReg(this.inBox(this.add.rectangle(this.boardCenter, GRID_Y + this.boardHeight / 2, this.boardWidth, this.boardHeight, 0xffffff, 0.001).setDepth(60).setInteractive()));
    catcher.on("pointerdown", () => {
      if (gen !== this.arenaGen || this.run.over || !this.arenaActive || notch >= HORNS_NOTCHES) return;
      if (this.time.now < lockedUntil) return;
      if (reds.some(inZone)) {
        if (!this.bellForgives()) lose("not on red", ARENA_RED_STRIKES);
        return;
      }
      if (inZone(gold)) {
        shove();
        return;
      }
      // A miss costs a strike; red adds a heavier strike and longer lockout.
      // Neither changes the number of successful shoves already earned.
      lose("Missed the timing window");
    });
  }


  // ================= THE THREE RIMES (snow boss arena) =================
  // The Hoarfrost Warden never moves from where he plants his feet. He works on
  // the pit instead: he seals it, he calls a blizzard, and at the last he
  // opens his own frozen heart — for as long as the ring lets you reach it.

  private rimesIntro(gen: number) {
    const c = BOSS_STAGES.hoarfrost[0];
    this.arenaStageIntro(gen, c.title, c.sub, () => this.rimeIce(gen));
  }

  /**
   * STAGE 1 · BREAK THE ICE (all three colours, at speed)
   *
   * He seals the pit and it crusts over. GOLD plates want a tap, BLUE plates
   * want a cut along their grain, RED plates want nothing at all — touch one and
   * the cold bites. The seal fills FASTER the more plates you leave standing, so
   * you cannot simply wait out the reds.
   */
  private rimeIce(gen: number) {
    if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
    this.clearArenaObjs();
    const R = this.arenaRect();
    let cleared = 0;
    let freeze = 0; // 0..1 — the seal closing
    let done = false;
    type Plate = { kind: "gold" | "blue" | "red"; obj: Phaser.GameObjects.Image; damage: Phaser.GameObjects.Graphics; x: number; y: number; taps: number; cut?: { destroy: () => void } };
    const plates = new Set<Plate>();

    const label = this.frostSurface("Break the ice", "Gold: tap · Blue: swipe · Red: avoid", `0 / ${RIME_PLATES_TO_CLEAR}`);
    const MW = R.w - 60;
    this.aReg(this.inBox(this.add.rectangle(R.cx, R.y + 111, MW + 6, 12, 0x0a0b0f, 0.85).setDepth(48)));
    const meter = this.aReg(this.inBox(this.add.rectangle(R.cx - MW / 2, R.y + 111, MW, 7, G_BLUE).setOrigin(0, 0.5).setScale(0, 1).setDepth(49)));
    const frostEdge = this.aReg(this.inBox(this.add.graphics().setDepth(41), true));
    const paintPlate = (pl: Plate) => {
      const g = pl.damage.clear();
      if (pl.kind !== "gold") return;
      iceCracks(g, 0, 0, 86, RIME_PLATE_TAPS - pl.taps);
      g.fillStyle(0x061723, .9).fillRoundedRect(-26, 47, 52, 15, 6);
      for (let i = 0; i < RIME_PLATE_TAPS; i++) g.fillStyle(i < pl.taps ? 0xffdea0 : 0x42525a)
        .fillRoundedRect(-18 + i * 14, 51, 9, 7, 2);
    };
    const removePlate = (pl: Plate) => {
      plates.delete(pl); pl.cut?.destroy();
      this.tweens.killTweensOf(pl.obj);
      pl.obj.destroy(); pl.damage.destroy();
    };

    const shatter = (pl: Plate) => {
      if (done || !plates.has(pl)) return;
      this.aReg(this.inBox(iceBurst(this, pl.x, pl.y, 48), true));
      removePlate(pl);
      this.sfx("block2", 0.4, 1.3);
      cleared++;
      label.setText(`${cleared} / ${RIME_PLATES_TO_CLEAR}`);
      if (cleared % 4 === 0 && cleared < RIME_PLATES_TO_CLEAR) {
        this.arenaDealsDone++;
        this.drainBossBar();
        this.bossReact();
        this.notice("the seal cracks", "#8ff4ff");
      }
      if (cleared >= RIME_PLATES_TO_CLEAR) {
        done = true;
        this.arenaDealsDone++;
        const c = BOSS_STAGES.hoarfrost[1];
        this.arenaStageClear(gen, "THE SEAL BREAKS", BOSS_STAGES.hoarfrost[0].taunt, () =>
          this.arenaStageIntro(gen, c.title, c.sub, () => this.rimeWhiteout(gen, 0)),
        );
      }
    };

    const spawnPlate = () => {
      if (done || gen !== this.arenaGen || !this.arenaActive || this.run.over || plates.size >= RIME_MAX_PLATES) return;
      let x = 0, y = 0, room = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        x = R.x + 90 + Math.random() * (R.w - 180);
        y = R.y + 171 + Math.random() * (R.h - 261);
        if ([...plates].every(p => Math.hypot(p.x - x, p.y - y) > 105)) { room = true; break; }
      }
      if (!room) return;
      const roll = Math.random();
      const kind: Plate["kind"] = roll < 0.55 ? "gold" : roll < 0.8 ? "blue" : "red";
      const obj = this.aReg(
        this.inBox(
          this.add
            .image(x, y, frostCrystal(this,kind))
            .setAngle(Math.random() * 40 - 20)
            .setScale(0)
            .setDepth(43)
            .setInteractive({ useHandCursor: true }),
        ),
      );
      const damage = this.aReg(this.inBox(this.add.graphics({ x, y }).setDepth(46), true));
      const pl: Plate = { kind, obj, damage, x, y, taps: RIME_PLATE_TAPS };
      plates.add(pl);
      paintPlate(pl);
      if (kind === "blue") {
        obj.setVisible(false).disableInteractive(); // the swipe node supplies its own crystal
        // a blue plate carries its grain: cut that way and it splits
        const dir = (["up", "down", "left", "right"] as SwipeDir[])[(Math.random() * 4) | 0];
        pl.cut = this.swipeNode(x, y, 40, dir, () => shatter(pl), () => {
          this.arenaWardMissed = true;
          removePlate(pl);
          this.notice("wrong way", "#ff8a6a");
          this.sfx("swing1", 0.3);
        });
      }
      this.tweens.add({ targets: obj, scale: .78, duration: 220, ease: "Back.easeOut" });
      this.sfx("swap", 0.22, 1.5);
      obj.on("pointerdown", () => {
        if (done || gen !== this.arenaGen || !this.arenaActive || this.run.over || !plates.has(pl)) return;
        if (pl.kind === "red") {
          // ✖ — the one plate that never wanted touching
          this.aReg(this.inBox(iceBurst(this, x, y, 36), true));
          removePlate(pl);
          if (this.bellForgives()) return;
          this.arenaWardMissed = true;
          this.notice("not the red ones", "#ff8a6a");
          this.sfx("hit2", 0.5);
          this.arenaStrikeHero(ARENA_RED_STRIKES);
          return;
        }
        if (pl.kind !== "gold") return; // blue is resolved by its cut node
        pl.taps--;
        this.sfx(this.pick(["hit1", "hit2"]), 0.35, 1.4 + (RIME_PLATE_TAPS - pl.taps) * 0.12);
        this.tweens.killTweensOf(obj);
        obj.setScale(.78);
        this.tweens.add({ targets: obj, scaleX: 0.67, scaleY: .88, duration: 70, yoyo: true });
        if (pl.taps > 0) {
          paintPlate(pl);
          this.aReg(this.inBox(iceBurst(this, x, y, 32, .35), true));
          return;
        }
        shatter(pl);
      });
    };

    for (let i = 0; i < 3; i++) spawnPlate();
    this.aTimer(this.time.addEvent({ delay: RIME_PLATE_SPAWN_MS, loop: true, callback: spawnPlate }));

    this.aTimer(
      this.time.addEvent({
        delay: 60,
        loop: true,
        callback: () => {
          if (done || gen !== this.arenaGen || !this.arenaActive) return;
          freeze += (60 / RIME_FREEZE_MS) * (1 + 0.5 * Math.max(0, plates.size - 1));
          meter.scaleX = Math.min(1, freeze);
          meter.setFillStyle(freeze > .75 ? 0xffbc87 : 0x8ddeed);
          frostEdge.clear();
          for (let i = 0; i < 12; i++) {
            const x = R.x + 24 + i * (R.w - 48) / 11, height = (14 + i * 17 % 42) * freeze;
            frostEdge.fillStyle(0xb1e6f6, .12 + freeze * .22)
              .fillTriangle(x - 12, R.y + R.h - 8, x + 12, R.y + R.h - 8, x - 3, R.y + R.h - 8 - height);
          }
          if (freeze < 1) return;
          // sealed: he closes his fist, the pit re-crusts and the thaw starts over
          freeze = 0.3;
          this.arenaWardMissed = true;
          this.bossSwing();
          this.notice("the seal closes", "#ff8a6a");
          this.arenaStrikeHero();
          for (const pl of plates) removePlate(pl);
          spawnPlate();
          spawnPlate();
        },
      }),
    );
  }

  /**
   * STAGE 2 · DODGE THE ICE (reaction: dodge RED, tap GOLD)
   *
   * A blizzard takes the pit. RED icicle columns telegraph, then fall — your
   * scout is a token you drag clear of them. GOLD warmth-motes drift through and
   * want a tap. This is the one stage with no BLUE, and deliberately so: moving
   * the scout IS a drag, so a cut here would fight the dodging for the same
   * gesture. Two colours is the honest answer.
   */
  private rimeWhiteout(gen: number, round: number) {
    if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
    this.clearArenaObjs();
    const R = this.arenaRect();
    const ROUNDS = [
      { motes: 4, dropMs: 1500, tellMs: 900, cols: 1 },
      { motes: 5, dropMs: 1250, tellMs: 750, cols: 2 },
      { motes: 6, dropMs: 1000, tellMs: 620, cols: 2 },
    ];
    const cfg = ROUNDS[round];
    let caught = 0;
    let done = false;

    const tally = this.frostSurface("Weather the storm", "Drag to dodge · Tap gold warmth", `0 / ${cfg.motes}`);

    // your scout, dragged along the floor of the pit
    const floorY = R.y + R.h - 74;
    const iceFloor = this.aReg(this.inBox(this.add.graphics().setDepth(41)));
    iceFloor.fillStyle(0x06202c,.9).fillRoundedRect(R.x+22,floorY+3,R.w-44,28,8);
    iceFloor.fillGradientStyle(0xa4deed,0xa4deed,0x24485e,0x24485e,.55).fillRoundedRect(R.x+22,floorY+3,R.w-44,24,8);
    iceFloor.lineStyle(3,0xe1f8ff,.7).lineBetween(R.x+30,floorY+3,R.x+R.w-30,floorY+3);
    for(let x=R.x+50;x<R.x+R.w-40;x+=69)
      iceFloor.lineStyle(2,0x204d68,.8).strokePoints([{x,y:floorY+6},{x:x+9,y:floorY+12},{x:x+5,y:floorY+20}]);
    const wind = this.aReg(this.inBox(this.add.graphics().setDepth(41), true));
    for (let i = 0; i < 9; i++) {
      const x = R.x + 65 + i * 89 % (R.w - 130), y = R.y + 141 + i * 53 % (R.h - 250);
      wind.lineStyle(i % 3 ? 1 : 2, 0xc5efff, .1 + round * .04).lineBetween(x, y, x + 29, y + 6);
    }
    this.tweens.add({ targets: wind, x: -32, y: 7, alpha: .3, duration: 750 - round * 100, yoyo: true, repeat: -1 });
    const shadow = this.aReg(this.inBox(this.add.ellipse(R.cx, floorY + 3, 60, 13, 0x03121e, .65).setDepth(42), true));
    const tok = this.aReg(
      this.inBox(this.add.sprite(R.cx, floorY, PLAYER_TEXTURE).setOrigin(0.5, HERO_ORIGIN).setScale(2.2 / PLAYER_DENSITY).setDepth(46).play("hero-idle")),
    );


    const fail = (why: string, times = ARENA_MISS_STRIKES) => {
      if (done) return;
      this.arenaWardMissed = true;
      this.notice(why, "#ff8a6a");
      this.arenaStrikeHero(times);
    };

    // GOLD warmth drifts across; tapping one banks it
    this.aTimer(
      this.time.addEvent({
        delay: 900,
        loop: true,
        callback: () => {
          if (done || gen !== this.arenaGen || !this.arenaActive) return;
          const y = R.y + 151 + Math.random() * (R.h - 301);
          const node = this.goldNode(R.x + R.w + 40, y, 30, () => {
            if (done || gen !== this.arenaGen || !this.arenaActive || this.run.over) return;
            caught++;
            tally.setText(`${caught} / ${cfg.motes}`);
            this.sfx("pickup", 0.4, 1.2);
            const warmth = this.aReg(this.inBox(this.add.ellipse(tok.x, floorY - 24, 70, 88, 0xffd386, .25).setDepth(43), true));
            this.tweens.add({ targets: warmth, alpha: 0, scale: 1.25, duration: 420, onComplete: () => warmth.destroy() });
            if (caught >= cfg.motes && !done) {
              done = true;
              this.arenaDealsDone++;
              this.drainBossBar();
              this.aTimer(this.time.delayedCall(500, () => {
                if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
                if (round + 1 >= ROUNDS.length) {
                  const c = BOSS_STAGES.hoarfrost[2];
                  this.arenaStageClear(gen, "THE STORM PASSES", BOSS_STAGES.hoarfrost[1].taunt, () =>
                    this.arenaStageIntro(gen, c.title, c.sub, () => this.rimeHeart(gen)),
                  );
                } else {
                  this.notice("the storm deepens", "#8ff4ff");
                  this.rimeWhiteout(gen, round + 1);
                }
              }));
            }
          });
          const halo = this.add.image(0, 0, "orb").setTint(0xffc568).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(105, 105).setAlpha(.28);
          node.addAt(halo, 0);
          const trail = this.add.graphics();
          for (let i = 0; i < 4; i++) trail.fillStyle(0xffd68b, .25 - i * .045).fillCircle(28 + i * 11, 4 + Math.sin(i) * 5, 3 - i * .4);
          node.addAt(trail, 0);
          this.tweens.add({
            targets: node,
            x: R.x - 40,
            duration: 4200,
            ease: "Linear",
            onComplete: () => node.scene && node.destroy(), // may already be caught
          });
        },
      }),
    );

    // RED columns: a telegraph, then the fall. Be elsewhere.
    this.aTimer(
      this.time.addEvent({
        delay: cfg.dropMs,
        loop: true,
        callback: () => {
          if (done || gen !== this.arenaGen || !this.arenaActive) return;
          this.bossSwing();
          for (let c = 0; c < cfg.cols; c++) {
            const cx = R.x + 90 + Math.random() * (R.w - 180);
            const tell = this.aReg(this.inBox(this.add.graphics().setDepth(42), true));
            // Exactly the same 104px width as the landing collision, with a quiet column
            // and a strong footprint so the floor tells the player where to move.
            tell.fillStyle(0xf47588, .12).fillRect(cx - 52, R.y + 126, 104, floorY - R.y - 119);
            tell.lineStyle(2, 0xff9baa, .6).lineBetween(cx - 52, R.y + 132, cx - 52, floorY + 8);
            tell.lineBetween(cx + 52, R.y + 132, cx + 52, floorY + 8);
            tell.fillStyle(0xa83c57, .75).fillRoundedRect(cx - 52, floorY - 5, 104, 19, 5);
            for (let i = 0; i < 6; i++) tell.lineStyle(3, 0xffb7bd, .6).lineBetween(cx - 45 + i * 16, floorY + 10, cx - 36 + i * 16, floorY - 1);
            const warning = this.aReg(this.inBox(this.add.rectangle(cx, floorY - 7, 104, 4, 0xffc0c7).setScale(0, 1).setDepth(44), true));
            this.tweens.add({ targets: warning, scaleX: 1, duration: cfg.tellMs, ease: "Linear" });
            const spike = this.aReg(this.inBox(this.add.image(cx, R.y + 137, frostSpike(this)).setOrigin(.5, 0).setDisplaySize(51, 108).setDepth(47).setAlpha(.5), true));
            this.tweens.add({ targets: spike, alpha: 1, duration: cfg.tellMs });
            this.aTimer(this.time.delayedCall(cfg.tellMs, () => {
              if (done || gen !== this.arenaGen || !this.arenaActive || this.run.over) return;
              tell.destroy();
              warning.destroy();
              this.sfx("fireball1", 0.3, 1.5);
              this.tweens.add({
                targets: spike,
                y: floorY - 99,
                duration: 260,
                ease: "Quad.easeIn",
                onComplete: () => {
                  if (done || gen !== this.arenaGen || !this.arenaActive || this.run.over) return;
                  this.cameras.main.shake(140, 0.005);
                  this.sfx("hit1", 0.35, 1.4);
                  this.aReg(this.inBox(iceBurst(this, cx, floorY, 38, .75), true));
                  if (Math.abs(tok.x - cx) < 52 && !this.bellForgives()) fail("the ice finds you", ARENA_RED_STRIKES);
                  this.tweens.add({ targets: spike, alpha: 0, duration: 260, onComplete: () => spike.destroy() });
                },
              });
            }));
          }
        },
      }),
    );

    this.aTimer(
      this.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          if (done || gen !== this.arenaGen || !this.arenaActive) return;
          // drag anywhere along the lower half of the pit to run the scout
          const p = this.input.activePointer;
          if (p.isDown) {
            const l = this.toLocal(p.x, p.y);
            if (l.y > R.y + R.h * 0.4) {
              const target = Phaser.Math.Clamp(l.x, R.x + 40, R.x + R.w - 40);
              tok.setFlipX(target < tok.x).play(Math.abs(target-tok.x)>3 ? "hero-walk" : "hero-idle",true);
              tok.x = Phaser.Math.Linear(tok.x,target,.45);
            }
          } else {
            tok.play("hero-idle",true);
          }
          shadow.x = tok.x;
        },
      }),
    );
  }


  /** RIME III: his core turns behind a ring of shards. One gap. Four clean hits. */
  private rimeHeart(gen: number) {
    if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
    this.clearArenaObjs();
    const R = this.arenaRect();
    const CX = R.cx;
    const CY = R.y + 104 + (R.h - 150) / 2;
    const RAD = Math.min(150, (R.h - 220) / 2);
    const STRIKE = 180; // the blade comes in from the hero's side — always due left
    let hits = 0;
    let gapAngle = Math.random() * 360;
    let dir = 1;
    let lockedUntil = 0;
    let done = false;

    const tally = this.frostSurface("The frozen heart", "Strike when the gap faces the arrow", `0 / ${HEART_HITS}`);
    // the strike line: your blade comes from here, so the gap must be HERE
    const bladeX = Math.max(R.x + 43, CX - RAD - 91);
    const blade = this.aReg(this.inBox(this.add.graphics().setDepth(46), true));
    blade.fillStyle(0x0a1a28, .9).fillRoundedRect(bladeX - 23, CY - 24, 49, 48, 9);
    blade.lineStyle(2, 0x8da7af, .6).strokeRoundedRect(bladeX - 23, CY - 24, 49, 48, 9);
    blade.fillStyle(0xffdd93).fillTriangle(bladeX + 19, CY, bladeX - 9, CY - 11, bladeX - 9, CY + 11);
    blade.fillStyle(0xffffff, .65).fillTriangle(bladeX + 19, CY, bladeX - 9, CY - 11, bladeX - 9, CY);
    const beam = this.aReg(this.inBox(this.add.graphics().setDepth(42), true));
    const ring = this.aReg(this.inBox(this.add.graphics().setDepth(44), true));
    const fracture = this.aReg(this.inBox(this.add.graphics().setDepth(46), true));
    const cooldown = this.aReg(this.inBox(this.add.graphics().setDepth(47), true));
    this.aReg(this.inBox(this.add.ellipse(CX, CY + RAD + 23, RAD * 1.65, 24, 0x020b16, .55).setDepth(41), true));
    const core = this.aReg(
      this.inBox(this.add.image(CX, CY, frostHeart(this)).setDisplaySize(106,106).setDepth(44).setInteractive({ useHandCursor: true })),
    );
    const glow = this.aReg(this.inBox(this.add.image(CX, CY, "orb").setBlendMode(Phaser.BlendModes.ADD).setTint(G_GOLD).setScale(2.4).setAlpha(0.5).setDepth(43)));

    const shards: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < HEART_SHARDS; i++)
      shards.push(this.aReg(this.inBox(this.add.image(CX, CY, frostSpike(this)).setDisplaySize(27,57).setDepth(45))));
    // Container children render in insertion order, regardless of their scene depth.
    this.puzzleBox.bringToTop(fracture);
    this.puzzleBox.bringToTop(cooldown);

    const gapHalf = () => lerp(HEART_GAP_FROM, HEART_GAP_TO, hits / Math.max(1, HEART_HITS - 1));
    const spin = () => lerp(HEART_SPIN_FROM, HEART_SPIN_TO, Math.min(1, hits / 3));
    const place = () => {
      const g = gapHalf();
      const span = 360 - 2 * g;
      const open = Math.abs(Phaser.Math.Angle.ShortestBetween(gapAngle, STRIKE)) <= g;
      const ready = open && this.time.now >= lockedUntil;
      const from = Phaser.Math.DegToRad(gapAngle + g), to = Phaser.Math.DegToRad(gapAngle + 360 - g);
      ring.clear();
      ring.lineStyle(24, 0x2b536f, .95).beginPath().arc(CX, CY, RAD, from, to).strokePath();
      ring.lineStyle(14, 0x9fdcef, .6).beginPath().arc(CX, CY, RAD, from, to).strokePath();
      ring.lineStyle(2, 0xe0faff, .9).beginPath().arc(CX, CY, RAD + 11, from, to).strokePath();
      ring.lineStyle(2, 0x5284a3, .9).beginPath().arc(CX, CY, RAD - 11, from, to).strokePath();
      for (const angle of [from, to]) {
        const x = CX + Math.cos(angle) * RAD, y = CY + Math.sin(angle) * RAD;
        ring.fillStyle(0xe1fbff).fillCircle(x, y, 5);
      }
      beam.clear();
      beam.lineStyle(2, ready ? 0xffe3a2 : 0x849cad, ready ? .85 : .35).lineBetween(bladeX + 27, CY, CX - RAD - 16, CY);
      if (ready) {
        beam.fillStyle(0xffd990, .13).fillTriangle(bladeX + 20, CY, CX, CY - 23, CX, CY + 23);
        beam.lineStyle(4, 0xffe8b3, .8).lineBetween(bladeX + 20, CY, CX, CY);
      }
      core.setTint(ready ? 0xffffff : 0x7a96ac);
      glow.setAlpha(ready ? .65 : .16).setScale(ready ? 2.8 + Math.sin(this.time.now / 110) * .12 : 2.1);
      blade.setAlpha(this.time.now < lockedUntil ? .4 : 1);
      cooldown.clear();
      if (this.time.now < lockedUntil) {
        const left = (lockedUntil - this.time.now) / HEART_LOCK_MS;
        cooldown.lineStyle(4, 0xb4d2df, .8).beginPath().arc(CX, CY, 64, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2).strokePath();
      }
      for (let i = 0; i < HEART_SHARDS; i++) {
        const a = gapAngle + g + ((i + 0.5) * span) / HEART_SHARDS;
        const rad = Phaser.Math.DegToRad(a);
        shards[i].setPosition(CX + Math.cos(rad) * RAD, CY + Math.sin(rad) * RAD).setAngle(a + 90);
      }
    };
    place();

    this.aTimer(
      this.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          if (done || gen !== this.arenaGen || !this.arenaActive) return;
          gapAngle = (gapAngle + dir * spin() * 0.016 + 360) % 360;
          place();
        },
      }),
    );

    core.on("pointerdown", () => {
      if (done || gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
      if (this.time.now < lockedUntil) {
        // say so — a dead tap with no answer reads as a broken button
        this.sfx("swap", 0.2, 0.6);
        return;
      }
      const open = Math.abs(Phaser.Math.Angle.ShortestBetween(gapAngle, STRIKE)) <= gapHalf();
      if (!open) {
        // a shard takes the blade — the ring bucks and reverses on you
        if (this.bellForgives()) return; // the shard turns nothing — swing again
        lockedUntil = this.time.now + HEART_LOCK_MS;
        dir *= -1;
        this.arenaWardMissed = true;
        this.sfx("block1", 0.5, 0.8);
        this.notice("Hit blocked · wait for the gap", "#ff8a6a");
        this.cameras.main.shake(200, 0.007);
        this.tweens.add({ targets: shards, alpha: 0.5, duration: 120, yoyo: true });
        this.aReg(this.inBox(iceBurst(this, CX - RAD, CY, 32, .55), true));
        this.arenaStrikeHero(ARENA_RED_STRIKES);
        return;
      }
      hits++;
      dir *= Math.random() < 0.5 ? -1 : 1; // and it may turn anyway — never settle in
      tally.setText(`${hits} / ${HEART_HITS}`);
      this.playCombo(["hero-attack2"], "hero-idle");
      this.sfx("hit3", 0.6, 0.9 + hits * 0.08);
      buzz(26);
      this.bossReact();
      this.arenaDealsDone++;
      this.drainBossBar();
      iceCracks(fracture.clear(), CX, CY, 94, Math.min(2, hits));
      this.aReg(this.inBox(iceBurst(this, CX, CY, 60), true));
      const slash = this.aReg(this.inBox(this.add.graphics().setDepth(51), true));
      slash.fillStyle(0xfff6d3, .95).fillTriangle(bladeX + 16, CY, CX + 65, CY - 6, CX + 45, CY + 8);
      this.tweens.add({ targets: slash, alpha: 0, duration: 220, onComplete: () => slash.destroy() });
      this.tweens.killTweensOf(core);
      core.setDisplaySize(106, 106);
      this.tweens.add({ targets: core, scale: 0.7, duration: 120, yoyo: true });
      if (hits >= HEART_HITS) {
        done = true;
        this.arenaStageClear(gen, "STAGE COMPLETE", "", () => this.completeBossArena(gen), 900);
      }
    });
  }

  /** Retract the puzzle — the tiles sink away so the portals own the space. */
  private hideBoard(): Promise<void> {
    return new Promise((res) => {
      let pending = 0;
      for (let r = 0; r < this.boardRows; r++)
        for (let c = 0; c < this.boardCols; c++) {
          const t = this.tiles[r][c];
          if (!t) continue;
          pending++;
          this.tweens.add({
            targets: t,
            alpha: 0,
            y: t.y + 30,
            duration: 240,
            delay: c * 16,
            ease: "Quad.easeIn",
            onComplete: () => {
              t.y -= 30; // park it back on its cell, just invisible
              if (--pending === 0) res();
            },
          });
        }
      if (pending === 0) res();
    });
  }

  /** The board rises back into play. */
  private showBoard() {
    for (let r = 0; r < this.boardRows; r++)
      for (let c = 0; c < this.boardCols; c++) {
        const t = this.tiles[r][c];
        if (!t) continue;
        this.tweens.killTweensOf(t);
        t.setAlpha(0).setPosition(this.xFor(c), this.yFor(r));
        this.tweens.add({ targets: t, alpha: 1, duration: 280, delay: (c + r) * 12 });
      }
  }

  /** Death (or scene teardown) mid-game: clear the props, restore the board. */
  private teardownArena() {
    this.arenaGen++;
    this.clearArenaObjs();
    this.arenaActive = false;
    this.slimeAdds.forEach(slime => slime.anims.pause());
    this.layout();
    if (this.orc) {
      this.tweens.killTweensOf(this.orc);
      this.orc.setAlpha(1);
    }
    this.showBoard();
  }

  /**
   * The goblin hurls a bomb: it leaves the hand partway into the throw, arcs to
   * the hero (fuse burning), and bursts on arrival. Returns ms until it lands,
   * so the strike's hurt FX can wait for the boom.
   */
  private throwGoblinBomb(): number {
    const LEAD = 430; // bomb leaves the hand this far into the throw anim
    const FLIGHT = 430; // arc time to the hero
    this.time.delayedCall(LEAD, () => {
      if (!this.orc || this.orcDying || this.run.over) return;
      const sx = this.orc.x - 24;
      const sy = GROUND_Y - 62;
      const tx = this.hero.x + 12;
      const ty = GROUND_Y - 28;
      const bomb = this.inBox(this.add.sprite(sx, sy, "goblin-bomb", 0).setScale(0.62).setDepth(46).play("goblin-bomb-spin"));
      this.sfx("fireball1", 0.3, 1.25);
      this.arcTo(bomb, sx, sy, tx, ty, FLIGHT, 64, () => {
        bomb.destroy();
        const burst = this.inBox(
          this.add
            .particles(tx, ty, "spark", { speed: { min: 90, max: 260 }, lifespan: { min: 200, max: 480 }, scale: { start: 1.3, end: 0 }, blendMode: "ADD", tint: 0xffb050, emitting: false })
            .setDepth(46),
        );
        burst.explode(20);
        this.time.delayedCall(600, () => burst.destroy());
        this.sfx(this.pick(["hit2", "hit3"]), 0.5);
      });
    });
    return LEAD + FLIGHT;
  }

  /**
   * An enemy attack. The blow is applied ON CONTACT — partway into the attack
   * animation (or when a thrown bomb lands) — not the instant the swing starts.
   * Pressure drives the hero's x every frame, so applying it up front shoved the
   * player back before the sword had even come down.
   * `pierce` ignores banked guard for this one hit (the tutorial's demo).
   */
  private strike(force = false, pierce = false, slowMotion = false) {
    if (!force && this.tutorial?.active) return; // the tutorial scripts its own strikes
    if (this.run.over || this.phase !== "fight" || this.orcDying || this.ambushResolving || !this.orc || !this.run.enemy) return;
    const isBoss = this.orcAnim === this.boss.key;

    // pick the attack: the goblin alternates a melee swing (steps in) and a
    // thrown bomb (arcs across, landing later than a swing would)
    let attackKey = `${this.orcAnim}-attack`;
    let doLunge = !!this.orcRig?.lunge;
    let bomb = false;
    if (this.orcAnim === "goblin" && !slowMotion && Math.random() < 0.5) {
      attackKey = "goblin-throw";
      bomb = true;
      doLunge = false;
    } else if (this.orcAnim === "goblin") doLunge = true;

    // the wind-up is audible immediately; the hit is not
    if (isBoss) this.sfx(this.pick(["fireball1", "fireball2", "fireball3"]), 0.55); // fire roars across the gap
    else this.sfx("slimeatk", 0.3);

    const attackingFoe = this.orc;
    const motionScale = slowMotion ? 1.6 : 1;
    if (slowMotion) attackingFoe.anims.timeScale = 1 / motionScale;
    attackingFoe.play(attackKey).once("animationcomplete", () => {
      if (slowMotion && attackingFoe.active) attackingFoe.anims.timeScale = 1;
      if (this.orc === attackingFoe && !this.orcDying) this.orc.play(`${this.orcAnim}-idle`);
    });
    // One coordinated attack, with exactly one guard/pressure transaction below.
    const rear = this.rearFoe;
    if (rear) rear.sprite.play(`${rear.rig.prefix}-attack`).once("animationcomplete", () => {
      if (this.rearFoe === rear && rear.enemy.hp > 0) rear.sprite.play(`${rear.rig.prefix}-idle`);
    });

    // when the blow actually connects
    const animMs = (this.anims.get(attackKey)?.duration ?? 300) * motionScale;
    const contactMs = bomb ? this.throwGoblinBomb() : Math.round(animMs * (this.orcRig?.hitAt ?? 0.55));

    // a charging foe SURGES so its rush PEAKS on contact — driven through orcGap
    // so update()'s per-frame x-control doesn't fight it
    if (doLunge && !this.orcDying) {
      const rest = this.orcGap;
      const lungeMs = 130 * motionScale;
      this.tweens.add({
        targets: this,
        orcGap: Math.max(48, rest - 54),
        duration: lungeMs,
        delay: Math.max(0, contactMs - lungeMs),
        yoyo: true,
        ease: "Quad.easeIn",
        onComplete: () => (this.orcGap = rest),
      });
    }

    // ---- THE BLOW LANDS ----
    this.time.delayedCall(contactMs, () => {
      // fell mid-swing? then it never connects
      if (this.run.over || this.orcDying || (this.ambushResolving && !this.orcEnemy?.hp) || !this.run.enemy || this.orc !== attackingFoe) return;
      const saved = pierce ? this.run.block : null;
      if (pierce) this.run.block = 0;
      const blockBefore = this.run.block;
      const net = enemyStrike(this.run);
      const blocked = this.run.block < blockBefore;
      const used = blockBefore - this.run.block;
      if (saved !== null) this.run.block = saved; // the demo only pretends to be unguarded

      if (blocked) {
        this.sfx(this.pick(["block1", "block2", "block3"]), 0.45);
        if (used > 1)
          this.floatChip(this.hero.x + 28, GROUND_Y - 100, `-${used}🛡`, {
            size: 20,
            tint: [0xeef6ff, 0xbfe0ff, 0x6ea8e0, 0x3a6a9a],
            stroke: "#050d16",
            font: EMOJI_FONT,
          }); // deep foes chew through the guard — the cost is shown, not hidden
        this.showBlockImpact(isBoss, net <= 0);
        this.boardGuardRipple(); // the guard's clang rings around the puzzle frame too
      }

      if (net > 0) {
        haptic("damage");
        if (slowMotion) this.heroKnock = Math.max(this.heroKnock, KNOCK_MISS * 1.35);
        this.cameras.main.shake((isBoss ? 260 : 150) * (slowMotion ? 1.35 : 1), isBoss ? 0.009 : 0.006);
        this.hero.setTint(isBoss ? 0xffa060 : 0xff8888); // seared vs. slimed
        this.time.delayedCall((isBoss ? 200 : 130) * (slowMotion ? 1.6 : 1), () => this.hero.clearTint());
        this.boardHitReact(isBoss); // the blow lands where the player is LOOKING: on the board
      } else if (blocked) {
        // PERFECT block: run.ts banked the riposte shove (BLOCK_PUSHBACK) — the
        // hero steps up via update(); sell the foe being knocked away too
        if (!this.orc || this.orcDying) return;
        const rest = this.orcGap; // strikes are seconds apart — no overlap to guard
        this.tweens.add({
          targets: this,
          orcGap: rest + 34,
          duration: 150,
          yoyo: true,
          ease: "Quad.easeOut",
          onComplete: () => (this.orcGap = rest),
        });
        buzz(18);
        this.floatChip(this.hero.x + 34, GROUND_Y - 96, "SHOVE!", {
          size: 22,
          tint: [0xeef6ff, 0xbfe0ff, 0x6ea8e0, 0x3a6a9a],
          stroke: "#050d16",
        });
      }
      this.refreshHud();
    });
  }

  /** A clean guard read: luminous crest, contact sparks, and a tiny foe recoil. */
  private showBlockImpact(isBoss: boolean, fullyBlocked: boolean) {
    const root = this.inBox(this.add.container(this.hero.x + 13, GROUND_Y - 48).setDepth(47));
    const halo = this.add
      .ellipse(0, 0, 70, 90, 0x4aaeff, fullyBlocked ? 0.28 : 0.2)
      .setStrokeStyle(isBoss ? 5 : 4, 0xc8efff, 0.95)
      .setBlendMode(Phaser.BlendModes.ADD);

    const crest = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    crest.fillStyle(0x58bfff, fullyBlocked ? 0.42 : 0.3);
    crest.lineStyle(3, 0xe7f8ff, 1);
    crest.beginPath();
    crest.moveTo(0, -34);
    crest.lineTo(27, -23);
    crest.lineTo(23, 13);
    crest.lineTo(0, 34);
    crest.lineTo(-23, 13);
    crest.lineTo(-27, -23);
    crest.closePath();
    crest.fillPath();
    crest.strokePath();
    crest.lineStyle(3, 0xffffff, 0.9);
    crest.beginPath();
    crest.moveTo(-12, -2);
    crest.lineTo(-2, 9);
    crest.lineTo(15, -13);
    crest.strokePath();

    const sparks = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    sparks.lineStyle(isBoss ? 4 : 3, 0xe7f8ff, 1);
    for (const [x1, y1, x2, y2] of [
      [31, -20, 45, -30],
      [36, 0, 52, 0],
      [31, 20, 45, 30],
    ]) {
      sparks.beginPath();
      sparks.moveTo(x1, y1);
      sparks.lineTo(x2, y2);
      sparks.strokePath();
    }
    root.add([halo, crest, sparks]);
    root.setAlpha(0).setScale(isBoss ? 0.65 : 0.55);

    this.tweens.add({
      targets: root,
      alpha: 1,
      scale: isBoss ? 1.12 : 1,
      duration: 75,
      ease: "Back.easeOut",
      onComplete: () =>
        this.tweens.add({
          targets: root,
          alpha: 0,
          scale: isBoss ? 1.3 : 1.18,
          duration: isBoss ? 310 : 240,
          ease: "Quad.easeOut",
          onComplete: () => root.destroy(),
        }),
    });

    const foe = this.orc;
    if (foe && !this.orcDying) {
      const x = foe.x;
      this.tweens.add({ targets: foe, x: x + (isBoss ? 8 : 12), duration: 70, yoyo: true, ease: "Quad.easeOut" });
    }
    if (fullyBlocked) this.cameras.main.shake(isBoss ? 100 : 75, isBoss ? 0.003 : 0.002);
  }

  // ---- lane -> board intrusion: the fight reaches down into the puzzle -------

  /**
   * STRIKE_TELE_MS before each strike, dread bleeds over the board's top rows
   * and a "!" pops over the foe — the board-watcher feels it coming, and the
   * cue itself invites a glance up. Fires blind; guards decide if it shows.
   */
  private strikeTelegraph() {
    if (this.run.over || this.phase !== "fight" || !this.orc || this.orcDying || this.tutorial?.active || this.arenaActive) return;
    const shade = this.inBox(this.add.rectangle(this.boardCenter, GRID_Y + 16, this.boardWidth, 32, 0x8a1622, 0).setDepth(40));
    const rim = this.inBox(this.add.rectangle(this.boardCenter, GRID_Y - 3, this.boardWidth, 3, 0xff4a3a, 0).setDepth(40).setBlendMode(Phaser.BlendModes.ADD), true);
    this.tweens.add({ targets: shade, fillAlpha: 0.2, duration: STRIKE_TELE_MS * 0.55, ease: "Sine.easeIn" });
    this.tweens.add({ targets: rim, fillAlpha: 0.7, duration: STRIKE_TELE_MS * 0.55, ease: "Sine.easeIn" });
    // release right as the blow lands (or would have — strike() re-checks the world)
    this.time.delayedCall(STRIKE_TELE_MS + 60, () => {
      this.tweens.add({ targets: [shade, rim], fillAlpha: 0, duration: 160, onComplete: () => { shade.destroy(); rim.destroy(); } });
    });
    const bang = this.inBox(
      this.add
        .text(this.orc.x + 6, GROUND_Y - 92, "!", { fontFamily: "monospace", fontStyle: "bold", fontSize: "30px", color: "#ff5a4a", stroke: "#1a0508", strokeThickness: 6 })
        .setOrigin(0.5)
        .setDepth(48)
        .setScale(0.2),
    );
    this.tweens.add({ targets: bang, scale: 1, duration: 160, ease: "Back.easeOut" });
    this.tweens.add({ targets: bang, alpha: 0, duration: 180, delay: STRIKE_TELE_MS - 160, onComplete: () => bang.destroy() });
  }

  /**
   * An unblocked hit rattles the puzzle itself: every settled tile shudders in
   * its cell (angle only — never fights the x/y of swaps and falls), a red wash
   * flashes over the board, and a claw-streak rakes across it.
   */
  private boardHitReact(isBoss: boolean) {
    for (let r = 0; r < this.boardRows; r++)
      for (let c = 0; c < this.boardCols; c++) {
        const t = this.tiles[r][c];
        if (!t) continue;
        const a = (Math.random() * 2 - 1) * (isBoss ? 5 : 3.5);
        this.tweens.add({ targets: t, angle: a, duration: 45, yoyo: true, repeat: 1, ease: "Sine.easeInOut", delay: Math.random() * 60 });
      }
    const wash = this.inBox(this.add.rectangle(this.boardCenter, GRID_Y + this.boardHeight / 2, this.boardWidth, this.boardHeight, 0xc03028, isBoss ? 0.16 : 0.11).setDepth(44));
    this.tweens.add({ targets: wash, fillAlpha: 0, duration: 260, ease: "Quad.easeOut", onComplete: () => wash.destroy() });
    // three raking claw lines, upper-right to lower-left across the board face
    const claw = this.inBox(this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(45).setAlpha(0.85));
    const cx0 = this.boardCenter + this.boardWidth * 0.22;
    const cy0 = GRID_Y + this.boardHeight * 0.18;
    for (let i = 0; i < 3; i++) {
      claw.lineStyle(i === 1 ? 5 : 3, 0xff6a4a, 0.9);
      claw.beginPath();
      claw.moveTo(cx0 + i * 34, cy0 + i * 10);
      claw.lineTo(cx0 - this.boardWidth * 0.34 + i * 34, cy0 + this.boardHeight * 0.5 + i * 10);
      claw.strokePath();
    }
    this.tweens.add({ targets: claw, alpha: 0, duration: 300, ease: "Quad.easeOut", onComplete: () => claw.destroy() });
  }

  /** A held block answers on the board too: a steel-blue ring pulses off the frame. */
  private boardGuardRipple() {
    const ring = this.inBox(
      this.add
        .rectangle(this.boardCenter, GRID_Y + this.boardHeight / 2, this.boardWidth + 10, this.boardHeight + 10)
        .setStrokeStyle(4, 0x7ec4ff, 0.9)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(44),
    );
    this.tweens.add({ targets: ring, scaleX: 1.035, scaleY: 1.07, alpha: 0, duration: 340, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
  }

  // ================= treasure chests (the dopamine blast) =================

  /** A chest rolls in from the right; the hero jogs up to it like a foe. */
  private spawnChest(walkMs = WALK_IN_MS) {
    if (this.run.over) return;
    this.phase = "advance";
    this.hero.play("hero-walk", true);

    const body = this.add.image(0, 0, "chest-closed").setOrigin(0.5, 1).setScale(2);
    const tag = this.add.text(0, -92, "🔑", { fontFamily: EMOJI_FONT, fontSize: "20px" }).setOrigin(0.5);
    const cont = this.inBox(this.add.container(ENTER_X, GROUND_Y + 2, [body, tag]));
    this.chest = cont;
    this.tweens.add({ targets: tag, y: -100, duration: 520, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }); // bobbing key hint
    this.tweens.add({
      targets: cont,
      x: this.heroXForPressure() + ENGAGE_GAP,
      duration: walkMs,
      ease: "Sine.easeOut",
      onComplete: () => this.reachChest(),
    });
  }

  private reachChest() {
    if (this.run.over || !this.chest) return;
    this.phase = "chest"; // pressure + strikes hold — a reward moment, not a fight
    this.hero.play("hero-idle", true);
    if (this.skeletonCharges <= 0 && this.run.resources.keys < CHEST_KEY_COST) {
      this.awaitingChest = false;
      this.chestActive = false;
      this.chestLocked();
      return;
    }
    this.awaitingChest = true;
    this.chestActive = true; // wait safely: no matching, pressure or item timers
    this.clearSelection();
    this.down = null;
    this.hideTip();
    this.writeCheckpoint(true);
    void this.openChest();
  }

  /** No key banked: the chest rattles shut and the road moves on. */
  private chestLocked() {
    const cont = this.chest!;
    const lock = this.inBox(
      this.add
        .text(cont.x, cont.y - 112, "🔒 need a key!", { fontFamily: EMOJI_FONT, fontSize: "16px", color: "#ff9d6a", stroke: "#2a0c06", strokeThickness: 4 })
        .setOrigin(0.5),
    );
    this.tweens.add({ targets: cont, x: cont.x + 5, duration: 55, yoyo: true, repeat: 5 });
    this.sfx("swap", 0.4, 0.8);
    this.tweens.add({ targets: lock, y: lock.y - 22, alpha: 0, duration: 1000, delay: 350, onComplete: () => lock.destroy() });
    this.bossChestNext = false; // the hoard scrolls away unopened
    this.time.delayedCall(950, () => {
      if (this.run.over) return;
      this.phase = "advance"; // stride past it — the world pans it away
      this.hero.play("hero-walk", true);
      this.chest = null;
      this.tweens.add({ targets: cont, x: -90, duration: 1500, ease: "Sine.easeIn", onComplete: () => cont.destroy() });
      this.advanceRoad(1600);
    });
  }

  /** ===== THE BLAST ===== VS-style takeover: veil, rattle, god rays, erupting loot. */
  private async openChest() {
    if (!this.chest || this.run.over) return;
    const cont = this.chest!;
    this.chestActive = true;
    this.runProgress.setVisible(false);
    // One overlay keeps reward text clear of lane cropping and HUD decoration.
    const CX = CXC;
    const CY = Math.round(CENTER_DH * 0.42);
    const veil = this.add.rectangle(0, 0, 1, 1, 0x05060a, 0).setDepth(89);
    const overlay = this.add.container(0, 0).setDepth(90);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { overlay.add(o); return o; };
    const local = (x: number, y: number) => ({ x: (x - overlay.x) / overlay.scaleX, y: (y - overlay.y) / overlay.scaleY });
    const layoutReveal = () => {
      const scale = Math.min(1.15, (this.scale.width - 24) / CENTER_DW, (this.scale.height - 48) / 660);
      overlay.setScale(scale).setPosition(this.scale.width / 2 - CX * scale, this.scale.height / 2 - CY * scale);
      veil.setPosition(this.scale.width / 2, this.scale.height / 2).setSize(this.scale.width, this.scale.height);
    };
    layoutReveal();
    this.scale.on("resize", layoutReveal);
    const stopRevealLayout = () => this.scale.off("resize", layoutReveal);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stopRevealLayout);
    this.chestFast = false;

    // Bring the closed chest into the screen centre before accepting a tap.
    // Nothing is spent or rolled until the player opens this enlarged chest.
    const chestScreen = this.toScreen(cont.x, cont.y);
    const chestAt = local(chestScreen.x, chestScreen.y);
    this.tweens.add({ targets: veil, fillAlpha: 0.82, duration: 380 });
    const big = add(this.add.image(chestAt.x, chestAt.y - 30, "chest-closed").setScale(2).setDepth(62));
    cont.destroy();
    this.chest = null;
    await this.tweenP(big, { x: CX, y: CY, scale: 3.6, duration: 620, ease: "Cubic.easeInOut" });
    const prompt = add(this.add.text(CX, CY + 130, "Tap to open", {
      fontFamily: EMOJI_FONT, fontStyle: "bold", fontSize: `${Math.ceil(18 / overlay.scaleX)}px`,
      color: "#fff2b0", backgroundColor: "#15251e", padding: { x: 14, y: 8 },
    }).setOrigin(0.5));
    const opened = await new Promise<boolean>(resolve => {
      const cancel = () => resolve(false);
      const finish = () => {
        if (!this.awaitingChest || this.run.over) return;
        haptic("tap");
        this.awaitingChest = false;
        big.disableInteractive();
        prompt.destroy();
        this.events.off(Phaser.Scenes.Events.SHUTDOWN, cancel);
        resolve(true);
      };
      big.setInteractive({ useHandCursor: true }).once("pointerdown", finish);
      prompt.setInteractive({ useHandCursor: true }).once("pointerdown", finish);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, cancel);
    });
    if (!opened) return;
    this.chestsOpened++;
    this.chestFast = false;
    // a dedicated SKIP button (not "tap anywhere") — random taps during the
    // reveal no longer accidentally fast-forward the payout
    const skipBtn = this.add
      .text(this.scale.width - 14, 14, "skip ▸", {
        fontFamily: "monospace", fontStyle: "bold", fontSize: "16px", color: "#dfe3ea",
        backgroundColor: "#14171f", padding: { x: 12, y: 12 },
      })
      .setOrigin(1, 0)
      .setDepth(98)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => (this.chestFast = true));
    const repositionSkip = () => skipBtn.setPosition(this.scale.width - 14, 14);
    this.scale.on("resize", repositionSkip);

    // the banked key flies from the HUD down into the lock — unless a Skeleton
    // Key is armed, in which case a ghostly one turns the lock for free
    const freeOpen = this.skeletonCharges > 0;
    if (freeOpen) this.skeletonCharges--;
    else this.run.resources.keys -= CHEST_KEY_COST;
    this.refreshHud();
    this.pendingChest = this.rollChest();
    this.writeCheckpoint(true);
    const ks = local(this.resIcons[3].x, this.resIcons[3].y); // fly from the keys counter
    const key = add(
      this.add
        .text(ks.x, ks.y, freeOpen ? "🗝️" : "🔑", { fontFamily: EMOJI_FONT, fontSize: "22px" })
        .setOrigin(0.5)
        .setDepth(66)
        .setAlpha(freeOpen ? 0.8 : 1),
    );
    await this.tweenP(key, { x: CX, y: CY, scale: 0.8, angle: 90, duration: 480, ease: "Quad.easeIn" });
    key.destroy();
    this.sfx("chest_unlock", 0.6);
    this.tweens.add({ targets: big, angle: 3, duration: 60, yoyo: true, repeat: 3 });
    await this.cwait(500);

    // anticipation — three rattles, light bleeding from the seam... then a still beat
    const seam = add(this.add.rectangle(CX, CY - 26, 120, 5, 0xfff3c0, 0).setDepth(63).setBlendMode(Phaser.BlendModes.ADD));
    this.tweens.add({ targets: seam, fillAlpha: 0.95, scaleX: 1.25, duration: 900 });
    for (let i = 0; i < 3; i++) {
      this.tweens.add({ targets: big, angle: 2.2 + i * 1.3, duration: 46, yoyo: true, repeat: 5 });
      this.sfx("coin2", 0.2 + i * 0.1, 1.15 + i * 0.1); // muffled jingle from inside
      await this.cwait(330);
    }
    await this.cwait(340); // ...silence
    seam.destroy();

    // POP — flash, shake, god rays, coin eruption
    big.setTexture("chest-open");
    const flash = add(this.add.rectangle(CX, CENTER_DH / 2, CENTER_DW, CENTER_DH, 0xfff6d8, 0.9).setDepth(67));
    this.tweens.add({ targets: flash, fillAlpha: 0, duration: 260, ease: "Quad.easeOut", onComplete: () => flash.destroy() });
    this.cameras.main.shake(280, 0.011);
    this.sfx("chest_creak", 0.7);
    haptic("reward");
    this.sfx("coin_pour", 0.85);
    const mkRay = (alpha: number, scale: number, angle: number) =>
      add(this.add.image(CX, CY - 14, "godray").setDepth(61).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(0.4).setAngle(angle).setData("a", alpha).setData("s", scale));
    const rays = [mkRay(0.6, 2.9, 0), mkRay(0.35, 3.8, 15)];
    for (const r of rays) {
      this.tweens.add({ targets: r, alpha: r.getData("a"), scale: r.getData("s"), duration: 550, ease: "Quad.easeOut" });
      this.tweens.add({ targets: r, angle: r.angle + (r.angle ? -360 : 360), duration: r.angle ? 14000 : 11000, repeat: -1 });
    }
    const coins = add(
      this.add
        .particles(CX, CY - 20, "coin", {
          speed: { min: 380, max: 760 }, angle: { min: 235, max: 305 }, gravityY: 1150,
          lifespan: { min: 900, max: 1400 }, scale: { min: 0.9, max: 1.6 }, rotate: { min: 0, max: 360 },
          emitting: false,
        })
        .setDepth(63),
    );
    const sparks = add(
      this.add
        .particles(CX, CY - 20, "spark", {
          speed: { min: 200, max: 620 }, angle: { min: 220, max: 320 }, gravityY: 700,
          lifespan: { min: 500, max: 1000 }, scale: { start: 1.4, end: 0 }, blendMode: "ADD",
          emitting: false,
        })
        .setDepth(63),
    );
    coins.explode(30);
    sparks.explode(46);
    const title = add(
      this.add
        .text(CX, CY - 190, "TREASURE!", { fontFamily: "monospace", fontStyle: "bold", fontSize: "44px", color: "#ffffff", stroke: "#3a1d08", strokeThickness: 8 })
        .setOrigin(0.5)
        .setDepth(65)
        .setScale(2.6)
        .setAlpha(0),
    );
    title.setTint(0xfff6c8, 0xffe08a, 0xf2a93b, 0xc9761f); // gold gradient
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 260, ease: "Back.easeOut" });
    await this.cwait(680);

    // reveals — one at a time, hidden count, best pull saved for last
    const pulls = this.pendingChest!;
    const rowY = CY + 160;
    const rowX = (i: number) => CX - ((pulls.length - 1) * 92) / 2 + i * 92;
    const collected: { t: Phaser.GameObjects.Text; pull: ChestPull }[] = [];
    for (let i = 0; i < pulls.length; i++) {
      const pull = pulls[i];
      this.sfx(`combo${Math.min(2 + i, 6)}`, 0.5, 1 + i * 0.03); // escalating sting per pull
      const orb = add(this.add.image(CX, CY - 24, "orb").setDepth(64).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5));
      this.tweens.add({ targets: big, angle: 1.6, duration: 50, yoyo: true, repeat: 2 });
      sparks.explode(pull.kind === "item" ? 30 : 12);
      await this.tweenP(orb, { y: CY - 150, scale: pull.kind === "item" ? 2.1 : 1.5, duration: 340, ease: "Quad.easeOut" });
      orb.destroy();
      this.sfx(this.pick(["coin1", "coin2", "coin3"]), 0.55);
      if (pull.kind === "item") {
        this.cameras.main.shake(160, 0.006);
        this.sfx("pickup", 0.6, 0.9);
      }
      const label = pull.kind === "item" ? `${pull.icon} ${pull.item?.name ?? "NEW ITEM"}!` : `${pull.icon} +${pull.n}`;
      const t = add(
        this.add
          .text(CX, CY - 150, label, {
            fontFamily: EMOJI_FONT, fontStyle: "bold", fontSize: `${Math.max(30, Math.ceil(20 / overlay.scaleX))}px`,
            color: pull.kind === "item" ? "#ffd0f4" : pull.kind === "treasure" ? "#bfe6ff" : "#fff2b0",
            stroke: "#101820", strokeThickness: 3,
            backgroundColor: "rgba(13, 23, 30, 0.88)", padding: { x: 14, y: 8 },
            align: "center", wordWrap: { width: GRID_W - 48 },
          })
          .setOrigin(0.5)
          .setDepth(64)
          .setScale(0.2),
      );
      this.tweens.add({ targets: t, scale: 1.12, duration: 200, ease: "Back.easeOut" });
      // Keep the readable item card outside the scaled animation layer.
      if (pull.kind === "item" && pull.item && !this.chestFast) {
        t.setVisible(false);
        await new Promise<void>(resolve => {
          const finish = () => {
            this.input.off("pointerdown", finish);
            this.events.off(Phaser.Scenes.Events.SHUTDOWN, removeCard);
            removeCard();
            resolve();
          };
          const removeCard = showChestReward(pull.item!, finish);
          // The canvas Skip control can still finish the current reveal.
          this.input.once("pointerdown", finish);
          this.events.once(Phaser.Scenes.Events.SHUTDOWN, removeCard);
        });
        t.setVisible(true);
      } else {
        await this.cwait(560);
      }
      t.setText(pull.kind === "item" ? pull.icon : `${pull.icon} +${pull.n}`).setFontSize(Math.ceil(15 / (overlay.scaleX * .72)));
      this.tweens.add({ targets: t, x: rowX(i), y: rowY, scale: 0.72, duration: 230, ease: "Quad.easeInOut" }); // tuck into the row
      collected.push({ t, pull });
    }
    await this.cwait(430);

    // cash out — rewards zip to the HUD / item slots while the world fades back in
    this.tweens.add({ targets: veil, fillAlpha: 0, duration: 600, delay: 150, onComplete: () => veil.destroy() });
    for (const r of rays) this.tweens.add({ targets: r, alpha: 0, duration: 500, onComplete: () => r.destroy() });
    this.tweens.add({ targets: title, alpha: 0, y: title.y - 30, duration: 400, onComplete: () => title.destroy() });
    this.tweens.add({ targets: big, alpha: 0, y: CY + 30, duration: 500, delay: 200, onComplete: () => big.destroy() });
    const itemTargets = this.itemSlots.filter((s) => !s.item);
    let itemTarget = 0;
    const payouts: Promise<void>[] = [];
    for (let i = 0; i < collected.length; i++) {
      const { t, pull } = collected[i];
      const slot = pull.kind === "item" ? itemTargets[itemTarget++] : undefined;
      // slots + resource counter are screen-space panels; the reveal lives in the centre column
      const tgt = slot ? local(slot.x, slot.y) : local(this.resIcons[0].x, this.resIcons[0].y);
      const tx = tgt.x;
      const ty = tgt.y;
      payouts.push(new Promise<void>(resolve => this.tweens.add({
        targets: t, x: tx, y: ty, scale: 0.25, duration: this.chestFast ? 90 : 330, delay: i * (this.chestFast ? 25 : 110), ease: "Cubic.easeIn",
        onComplete: () => {
          t.destroy();
          this.applyPull(pull, slot); // resources tick up as each one lands
          this.sfx(this.pick(["coin1", "coin3"]), 0.4, 1 + i * 0.06);
          resolve();
        },
      })));
    }
    await Promise.all(payouts);
    await this.cwait(100);
    this.sfx("pouch", 0.6);
    // the whole haul's score lands as one gold thump right where the chest stood
    const chestScore = pulls.reduce((s, p) => s + 25 + p.n * 2, 0);
    this.floatScore(CX, CY - 40, chestScore, { size: 42, sparkle: true });
    coins.destroy();
    sparks.destroy();

    // back to the road
    this.scale.off("resize", repositionSkip);
    skipBtn.destroy();
    this.scale.off("resize", layoutReveal);
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, stopRevealLayout);
    overlay.destroy();
    veil.destroy();
    this.pendingChest = null;
    this.chestActive = false;
    this.writeCheckpoint(true);
    this.drawRunProgress();
    if (!this.run.over) {
      this.advanceRoad();
      this.refreshHud();
    }
  }

  /** Slot-machine pull table: 2 guaranteed, diminishing extras, item + resource floor. */
  private rollChest(): ChestPull[] {
    let count = 2;
    if (Math.random() < 0.6) count++;
    if (Math.random() < 0.32) count++;
    if (Math.random() < 0.16) count++;
    if (this.panCharges > 0) {
      this.panCharges--; // Prospector's Pan: this chest was worked in advance
      count += PAN_EXTRA_PULLS;
    }
    const bossHoard = this.bossChestNext;
    this.bossChestNext = false;
    const emptySlots = this.itemSlots.filter((s) => !s.item).length;
    return rollChestPulls(count, emptySlots, bossHoard); // resources first; jackpot items land last
  }

  private applyPull(pull: ChestPull, itemSlot?: ItemSlotUI) {
    if (this.pendingChest?.includes(pull)) this.pendingChest = this.pendingChest.filter(p => p !== pull);
    const r = this.run.resources;
    if (pull.kind === "wood") r.wood += pull.n;
    else if (pull.kind === "ore") r.ore += pull.n;
    else if (pull.kind === "treasure") r.treasure += pull.n;
    else if (pull.item) this.fillSlot(pull.item, itemSlot);
    this.run.score += 25 + pull.n * 2;
    this.refreshHud();
  }

  /** Drop a chest item into the first empty HUD slot with a golden pop. */
  private fillSlot(def: ItemDef, preferred?: ItemSlotUI) {
    const slot = preferred && !preferred.item ? preferred : this.itemSlots.find((s) => !s.item);
    if (!slot) return;
    slot.item = def;
    const icon = this.add.text(slot.x, slot.y, def.glyph, { fontFamily: EMOJI_FONT, fontSize: `${Math.round(slot.s * 0.52)}px` }).setOrigin(0.5).setScale(0.2);
    slot.icon = icon;
    slot.plus.setVisible(false);
    const glow = this.add.rectangle(slot.x, slot.y, slot.s, slot.s, 0xffe08a, 0.55);
    this.tweens.add({ targets: glow, alpha: 0, duration: 420, onComplete: () => glow.destroy() });
    this.tweens.add({ targets: icon, scale: 1, duration: 320, ease: "Back.easeOut" });
  }

  /** A choreography beat — collapses to a blink once the player taps to skip. */
  private cwait(ms: number): Promise<void> {
    return new Promise((res) => this.time.delayedCall(this.chestFast ? Math.min(ms, 70) : ms, res));
  }

  /** Promise-wrapped tween; runs near-instant once the player has tapped to skip. */
  private tweenP(target: object, cfg: { duration: number } & Record<string, unknown>): Promise<void> {
    return new Promise((res) =>
      this.tweens.add({ targets: target, ...cfg, duration: this.chestFast ? Math.min(cfg.duration, 90) : cfg.duration, onComplete: () => res() }),
    );
  }

  /** Dev: force the next respawn to be a chest (console: __mb.debugChest()). */
  public debugChest() {
    this.run.resources.keys = Math.max(this.run.resources.keys, CHEST_KEY_COST);
    this.sinceChest = CHEST_EVERY - 1;
    if (this.orc && !this.orcDying) {
      this.run.enemy = null;
      this.killOrc(0);
    }
  }

  /** Dev: rig a clean 2-step cascade (clear 3 -> a tile drops to make the next 3) to preview combo pacing. */
  public debugCombo() {
    if (this.busy || this.run.over || this.chestActive) return;
    this.empowered = newEmpowered(); this.empoweredTiles.clear();
    this.busy = true;
    const P = SWORD; // 0
    const Q = 2; // shield
    const b = this.boardRows - 1; // bottom row
    // Column 0: a vertical P-triple at the bottom with Q directly above (spacer over that).
    this.grid[b][0] = P;
    this.grid[b - 1][0] = P;
    this.grid[b - 2][0] = P;
    this.grid[b - 3][0] = Q;
    this.grid[b - 4][0] = 4; // spacer (treasure) — won't chain further
    // Columns 1 & 2: Q waiting at the bottom. It only completes a horizontal triple once
    // column 0's P's clear and its Q drops down — that's the second cascade. Offset fillers above.
    for (const c of [1, 2]) {
      this.grid[b][c] = Q;
      for (let r = b - 1; r >= 0; r--) this.grid[r][c] = (r + c) % 2 === 0 ? 5 : 6; // never pre-match
    }
    if (this.grid[b][3] === Q) this.grid[b][3] = 4; // keep the Q match width 3
    for (let r = 0; r < this.boardRows; r++)
      for (let c = 0; c < this.boardCols; c++) {
        this.tiles[r][c]?.destroy();
        this.tiles[r][c] = this.makeTile(r, c, this.grid[r][c]);
      }
    void this.resolve().then(() => {
      if (!this.run.over && !hasPossibleMove(this.grid)) this.rebuildBoard();
      this.busy = false;
    });
  }

  // ================= run items (tap to use; src/items.ts) =================

  /** Tap a filled slot: run the item (or arm its board-targeting). */
  private useSlot(i: number) {
    const slot = this.itemSlots[i];
    const def = slot.item;
    if (!def) return;
    if (this.run.over || this.runCompleteShown || this.ambushResolving || this.chestActive || this.tutorial?.active) return;
    this.hideTip();
    if (this.targeting) {
      // tapping the armed slot again (or any slot) backs out of aiming
      this.cancelTargeting();
      return;
    }

    const reason = itemUseReason(def, {
      arena: this.arenaActive, boss: this.run.enemy?.kind === "boss",
      hasEnemy: this.phase === "fight" && !!this.orc && !this.orcDying && !!this.run.enemy,
      boardBusy: this.busy, hasMaterials: this.grid.some((row) => row.some((t) => t === WOOD || t === ORE)),
      burning: this.burnLeft > 0, sunder: this.run.sunderEdge,
    });
    if (reason) {
      this.notice(reason, "#9aa0ab");
      return;
    }
    this.clearSelection();
    this.clearHint();

    // aimed items arm targeting and consume only when the shot lands
    if (def.target !== "none") {
      this.enterTargeting(def, slot);
      return;
    }

    switch (def.id) {
      case "shears":
        if (this.run.biome !== "forest" || !ambushRear(this.run)) {
          this.notice("Save this for a forest ambush with two enemies. Item kept.", "#9aa0ab"); return;
        }
        this.castStorm(AMBUSH_FLASK_DMG, 0xffa040, "Ember flask!");
        break;
      case "thawflask":
      case "lockpick": {
        const reward = useZoneSupply(def.id, this.run.biome, this.run.zone!, this.run.killed);
        if (reward.reason) { this.notice(reward.reason, "#9aa0ab"); return; }
        this.run.resources.wood += reward.wood;
        this.run.resources.treasure += reward.gems;
        this.run.score += (reward.wood + reward.gems) * 2;
        this.drawZonePatches();
        this.notice(def.id === "thawflask" ? "Ice melted · protected for 3 encounters"
          : `Cache opened · +${reward.gems} gems`, def.id === "thawflask" ? "#b7e8ff" : "#ffe0a0");
        this.sfx(def.id === "lockpick" ? "chest_unlock" : "pickup", .45);
        break;
      }
      case "whetstone":
        this.run.whetstone += WHETSTONE_CHARGES;
        this.notice(`Sharpened · next ${WHETSTONE_CHARGES} sword matches have 5-tile power`, "#ffe08a");
        break;
      case "stormcall":
        this.castStorm();
        break;
      case "warhorn":
        this.hornLeft += WARHORN_SECS;
        this.run.surgeMult = 2;
        this.notice("Rally Horn · kills push you back twice as far", "#ffe08a");
        this.sfx("summon", 0.45, 1.5);
        break;
      case "cinderflask": {
        this.burnLeft = Math.max(this.burnLeft, BURN_SECS);
        this.burnAcc = 0;
        this.notice("Fire Bomb · 2 damage/sec", "#ff9d6a");
        this.sfx(this.pick(["fireball1", "fireball2", "fireball3"]), 0.5);
        this.orc?.setTint(0xff9060);
        this.time.delayedCall(220, () => this.orc?.clearTint());
        break;
      }
      case "wardsalve":
        if (this.run.pierceMult <= SALVE_MULT) {
          this.notice("Boss Armor is already active. Item kept.", "#9aa0ab");
          return; // not consumed
        }
        this.run.pierceMult = SALVE_MULT;
        this.notice("Boss Armor active · boss hits push you back half as far", "#8fd0ff");
        this.sfx("pickup", 0.45, 0.9);
        break;
      case "wardbell":
        this.run.bellCharges += BELL_CHARGES;
        this.notice(
          this.run.bellCharges > 1
            ? `Safety Bell ready · ${this.run.bellCharges} saved mistakes`
            : "Safety Bell ready · one saved mistake",
          "#ffd24a",
        );
        this.sfx("block3", 0.5, 1.4);
        break;
      case "waystone":
        this.freezeLeft += WAYSTONE_SECS;
        this.notice("Time Stop · steady push paused", "#8fd0ff");
        this.sfx("spell", 0.4, 0.7);
        break;
      case "bulwark": {
        this.run.block += BULWARK_BLOCK;
        this.notice("guard up!", "#8fd0ff");
        this.sfx(this.pick(["block1", "block2", "block3"]), 0.5);
        const sh = this.inBox(
          this.add.text(this.hero.x, GROUND_Y - 96, "🛡️", { fontFamily: EMOJI_FONT, fontSize: "30px" }).setOrigin(0.5).setDepth(49).setScale(0.3),
        );
        this.tweens.add({ targets: sh, scale: 1.2, duration: 220, ease: "Back.easeOut" });
        this.tweens.add({ targets: sh, y: sh.y - 40, alpha: 0, duration: 700, delay: 250, onComplete: () => sh.destroy() });
        break;
      }
      case "hearth":
        this.notice("Revive is automatic. Keep it in your inventory.", "#ff9d7a");
        return; // NOT consumed by tapping
      case "spurs":
        if (this.spursActive) {
          this.notice("This enemy is already slowed. Item kept.", "#9aa0ab");
          return; // not consumed
        }
        this.spursActive = true;
        this.notice("Slow Trap · enemy attacks slowed", "#8fd0ff");
        this.sfx("swap", 0.4, 0.7);
        break;
      case "dice":
        void this.diceReroll();
        break;
      case "lodestone":
        void this.lodestonePull();
        break;
      case "skeleton":
        this.skeletonCharges++;
        this.notice("Spare Key ready · next chest opens free", "#ffe08a");
        this.sfx("chest_unlock", 0.5, 1.2);
        break;
      case "pan":
        this.panCharges++;
        this.notice(`Bonus Loot · next chest gives +${PAN_EXTRA_PULLS} rewards`, "#ffe08a");
        this.sfx("coin2", 0.5);
        break;
      case "ledger":
        this.ledgerLeft += LEDGER_SECS;
        this.run.resMult = 2;
        this.notice("Double Resources active · wood, stone and gems ×2", "#ffe08a");
        this.sfx("coin3", 0.5);
        break;
    }
    this.consumeSlot(slot);
    this.refreshHud();
    buzz(16);
  }

  /** Clear a slot back to its empty "+" state (with a little flash). */
  private consumeSlot(slot: ItemSlotUI) {
    slot.item = null;
    slot.icon?.destroy();
    slot.icon = null;
    slot.plus.setVisible(true);
    const glow = this.add.rectangle(slot.x, slot.y, slot.s, slot.s, 0xffffff, 0.4);
    this.tweens.add({ targets: glow, alpha: 0, duration: 300, onComplete: () => glow.destroy() });
    this.sfx("pickup", 0.35, 0.9);
  }

  /** Stormcall Scroll: an instant spell blast through the normal combat pipeline. */
  private castStorm(raw = STORMCALL_DMG, tint = 0x8fd0ff, message = "LIGHTNING!") {
    const res = castBlast(this.run, raw);
    const spell: SpellOutcome = { dmg: res.dmg, tier: 4, mod: res.mod, burn: false, splash: res.splash };
    this.updateEnemyBar();
    if (this.orcEnemy?.ambush) {
      void this.finishAmbushHit(spell, res.killed, 0, tint);
    } else if (res.killed) {
      this.heroLockX = true;
      const impactAt = this.performCast(spell, true, 0, tint);
      this.surgeAfterKill(impactAt + 120);
    } else {
      this.performCast(spell, false, 0, tint);
    }
    this.notice(message, "#bfe6ff");
    this.refreshHud();
  }

  /** Vagrant's Dice: the whole board rerolls. */
  private async diceReroll() {
    this.busy = true;
    this.sfx("swap", 0.5, 1.2);
    await this.animatedReshuffle();
    await this.resolve(); // a fresh spread never opens matched, but cascades stay safe
    this.busy = false;
  }

  /**
   * Deal a fresh board with ceremony: tiles scatter out, the new spread pops in.
   * Used by the Dice AND by the deadlock guard — a silent instant rebuild reads
   * as a bug ("my board just reset?!"), so the reshuffle always announces itself.
   */
  private async animatedReshuffle(msg?: string) {
    this.clearSelection();
    this.clearHint();
    if (msg) this.notice(msg, "#8fd0ff");
    this.boardFlash(0.18);
    const outs: Promise<void>[] = [];
    for (let r = 0; r < this.boardRows; r++)
      for (let c = 0; c < this.boardCols; c++) {
        const t = this.tiles[r][c];
        if (!t) continue;
        outs.push(new Promise((res) => this.tweens.add({ targets: t, scale: 0, angle: 90, duration: 160, delay: (r + c) * 8, onComplete: () => res() })));
      }
    await Promise.all(outs);
    this.rebuildBoard();
    for (let g = 0; g < 10 && !hasPossibleMove(this.grid); g++) this.rebuildBoard(); // never deal a dead board
    for (let r = 0; r < this.boardRows; r++)
      for (let c = 0; c < this.boardCols; c++) {
        const t = this.tiles[r][c];
        if (!t) continue;
        t.setScale(0);
        this.tweens.add({ targets: t, scale: 1, duration: 180, delay: (r + c) * 8, ease: "Back.easeOut" });
      }
    this.sfx(`tile${1 + ((Math.random() * TILE_SFX) | 0)}`, 0.4);
    await new Promise<void>((res) => this.time.delayedCall(360, res));
  }

  /** Lodestone: rip every wood + ore tile into the pack, then let the board settle. */
  private async lodestonePull() {
    this.busy = true;
    this.syncEmpoweredCell();
    const charged = this.empowered.charges.filter(p => p.cell && (p.type === WOOD || p.type === ORE));
    const counts: Record<number, number> = {};
    const cells: Coord[] = [];
    for (let r = 0; r < this.boardRows; r++)
      for (let c = 0; c < this.boardCols; c++)
        if (this.grid[r][c] === WOOD || this.grid[r][c] === ORE) cells.push({ r, c });
    if (!cells.length) {
      this.busy = false;
      this.notice("no wood or stone on the board", "#9aa0ab");
      return;
    }
    this.sfx("coin_pour", 0.5);
    if (charged.length) this.consumeEmpowered(charged.map(p => p.id));
    buzz(20);
    const fades: Promise<void>[] = [];
    for (const cell of cells) {
      const type = this.grid[cell.r][cell.c];
      counts[type] = (counts[type] ?? 0) + 1;
      const t = this.tiles[cell.r][cell.c];
      if (t) fades.push(this.shatter(t, type));
      this.tiles[cell.r][cell.c] = null;
      this.grid[cell.r][cell.c] = EMPTY;
    }
    await Promise.all(fades);
    const outcome = applyMatches(this.run, counts, itemPowerBonuses(charged, counts));
    this.notice(`+${outcome.gained.wood} 🪵  +${outcome.gained.ore} 🪨`, "#fff2b0");
    this.refreshHud();
    await this.collapse();
    await this.resolve();
    if (!this.run.over && !hasPossibleMove(this.grid)) await this.animatedReshuffle("no moves left — fresh tiles");
    this.busy = false;
  }

  // ---- aimed items: Sapper's Charge (cell) & Chromatic Prism (type) ----------

  private enterTargeting(def: ItemDef, slot: ItemSlotUI) {
    this.targeting = { def, slot };
    const label = def.target === "cell" ? `${def.glyph} tap a tile to detonate` : `${def.glyph} tap a tile — its kind turns to swords`;
    const ring = this.inBox(
      this.add.rectangle(this.boardCenter, GRID_Y + this.boardHeight / 2, this.boardWidth + 6, this.boardHeight + 6).setStrokeStyle(3, 0xffe08a, 0.9).setDepth(72),
    );
    this.tweens.add({ targets: ring, alpha: 0.35, duration: 420, yoyo: true, repeat: -1 });
    const txtBg = this.inBox(this.add.rectangle(this.boardCenter, GRID_Y + 26, 460, 34, 0x0e1015, 0.88).setStrokeStyle(2, 0x8a6d3a).setDepth(73));
    const txt = this.inBox(
      this.add
        .text(this.boardCenter, GRID_Y + 26, `${label} · tap elsewhere to cancel`, { fontFamily: EMOJI_FONT, fontSize: "18px", color: "#ffe08a" })
        .setOrigin(0.5)
        .setDepth(74),
    );
    this.targetObjs = [ring, txtBg, txt];
    this.sfx("pickup", 0.4, 1.2);
  }

  private cancelTargeting() {
    for (const o of this.targetObjs) o.destroy();
    this.targetObjs = [];
    this.targeting = null;
  }

  private onTargetTap(p: Phaser.Input.Pointer) {
    const armed = this.targeting!;
    const cell = this.cellAt(p.x, p.y);
    if (!cell || this.busy) {
      this.cancelTargeting(); // off-board (or mid-settle) = back out, item kept
      return;
    }
    if (armed.def.id === "prism" && this.grid[cell.r][cell.c] === SWORD) {
      this.notice("already swords — pick another kind", "#9aa0ab");
      return; // stay armed
    }
    this.cancelTargeting();
    this.consumeSlot(armed.slot);
    buzz(20);
    if (armed.def.id === "sapper") void this.detonate(cell);
    else void this.prismConvert(this.grid[cell.r][cell.c]);
  }

  /** Sapper's Charge: 3×3 blast — every destroyed tile counts as matched. */
  private async detonate(center: Coord) {
    this.busy = true;
    this.syncEmpoweredCell();
    const charged=this.empowered.charges.filter(p => p.cell && Math.abs(p.cell.r-center.r)<=SAPPER_RADIUS && Math.abs(p.cell.c-center.c)<=SAPPER_RADIUS);
    if(charged.length)this.consumeEmpowered(charged.map(p => p.id));
    const counts: Record<number, number> = {};
    const fades: Promise<void>[] = [];
    this.sfx("fireball1", 0.6, 0.9);
    this.cameras.main.shake(240, 0.009);
    this.boardFlash(0.3);
    const bx = this.xFor(center.c);
    const by = this.yFor(center.r);
    const boom = this.inBox(this.add.image(bx, by, "spark").setDepth(70).setBlendMode(Phaser.BlendModes.ADD).setScale(2));
    this.tweens.add({ targets: boom, scale: 14, alpha: 0, duration: 380, ease: "Quad.easeOut", onComplete: () => boom.destroy() });
    for (let r = center.r - SAPPER_RADIUS; r <= center.r + SAPPER_RADIUS; r++)
      for (let c = center.c - SAPPER_RADIUS; c <= center.c + SAPPER_RADIUS; c++) {
        if (r < 0 || r >= this.boardRows || c < 0 || c >= this.boardCols || this.grid[r][c] === EMPTY) continue;
        const type = this.grid[r][c];
        counts[type] = (counts[type] ?? 0) + 1;
        const t = this.tiles[r][c];
        if (t) fades.push(this.shatter(t, type));
        this.tiles[r][c] = null;
        this.grid[r][c] = EMPTY;
      }
    await Promise.all(fades);
    const outcome = applyMatches(this.run, counts, itemPowerBonuses(charged, counts));
    await this.tutorial?.onCascade(counts);
    for (let i = 0; i < (counts[POTION] ?? 0); i++) drinkPotion(this.run);
    if (outcome.damage > 0) await this.onCombat(outcome, outcome.swords);
    this.refreshHud();
    await this.collapse();
    await this.resolve();
    if (!this.run.over && !hasPossibleMove(this.grid)) await this.animatedReshuffle("no moves left — fresh tiles");
    this.busy = false;
  }

  /** Chromatic Prism: every tile of the picked kind transmutes into swords. */
  private async prismConvert(srcType: number) {
    this.busy = true;
    this.syncEmpoweredCell();
    for (const charge of this.empowered.charges) if(charge.type===srcType) charge.type=SWORD;
    this.empowered.layouts={};
    this.sfx("spell", 0.6);
    this.boardFlash(0.22);
    const converts: Coord[] = [];
    for (let r = 0; r < this.boardRows; r++)
      for (let c = 0; c < this.boardCols; c++) if (this.grid[r][c] === srcType) converts.push({ r, c });
    for (const { r, c } of converts) {
      this.grid[r][c] = SWORD;
      for (const [id,tile] of this.empoweredTiles) if(this.tiles[r][c]===tile)this.empoweredTiles.delete(id);
      this.tiles[r][c]?.destroy();
      const t = this.makeTile(r, c, SWORD);
      this.tiles[r][c] = t;
      t.setScale(0.2);
      this.tweens.add({ targets: t, scale: 1, duration: 240, delay: (r + c) * 14, ease: "Back.easeOut" });
      const glint = this.inBox(this.add.image(this.xFor(c), this.yFor(r), "spark").setDepth(70).setBlendMode(Phaser.BlendModes.ADD).setScale(0.6));
      this.tweens.add({ targets: glint, scale: 2.2, alpha: 0, duration: 320, delay: (r + c) * 14, onComplete: () => glint.destroy() });
    }
    this.notice(`${converts.length} tiles turn to swords`, "#ffd0f4");
    await new Promise<void>((res) => this.time.delayedCall(480, res));
    await this.resolve(); // freshly-forged swords may already line up — let them sing
    if (!this.run.over && !hasPossibleMove(this.grid)) await this.animatedReshuffle("no moves left — fresh tiles");
    this.busy = false;
  }

  // ---- item tooltips (hover on mouse, press-and-hold on touch) ---------------

  private showTip(i: number) {
    const slot = this.itemSlots[i];
    const def = slot.item;
    if (!def || this.chestActive) return;
    if (this.tipFor === i && this.tip) return;
    this.hideTip();
    this.tipFor = i;

    const W_TIP = Math.min(380, this.scale.width - 24);
    const PAD = 14;
    const name = this.add
      .text(PAD, PAD, def.name, { fontFamily: EMOJI_FONT, fontStyle: "bold", fontSize: "17px", color: "#ffe08a" })
      .setOrigin(0, 0);
    const tier = this.add
      .text(PAD, PAD + 28, def.tier, { fontFamily: EMOJI_FONT, fontSize: "15px", color: TIER_COLORS[def.tier] })
      .setOrigin(0, 0);
    const desc = this.add
      .text(PAD, PAD + 52, def.desc, { fontFamily: EMOJI_FONT, fontSize: "17px", color: "#e7ebf1", lineSpacing: 5, wordWrap: { width: W_TIP - PAD * 2 } })
      .setOrigin(0, 0);
    const hint = this.add
      .text(PAD, PAD + 60 + desc.height, `▸ ${def.hint}`, { fontFamily: EMOJI_FONT, fontSize: "16px", color: "#9fe0ff", wordWrap: { width: W_TIP - PAD * 2 } })
      .setOrigin(0, 0);
    const hTip = PAD + 60 + desc.height + hint.height + PAD;
    const bg = this.add.graphics();
    bg.fillStyle(0x0e1015, 0.96);
    bg.fillRoundedRect(0, 0, W_TIP, hTip, 8);
    bg.lineStyle(2, 0x8a6d3a, 1);
    bg.strokeRoundedRect(0, 0, W_TIP, hTip, 8);

    // slots hug the right edge — the card sits to their left, clamped on-screen
    const x = Math.max(6, slot.x - slot.s / 2 - 10 - W_TIP);
    const y = Math.min(Math.max(6, slot.y - hTip / 2), this.scale.height - hTip - 6);
    this.tip = this.add.container(x, y, [bg, name, tier, desc, hint]).setDepth(95).setAlpha(0);
    this.tweens.add({ targets: this.tip, alpha: 1, duration: 120 });
  }

  private hideTip(i?: number) {
    if (i !== undefined && this.tipFor !== i) return;
    this.tip?.destroy();
    this.tip = null;
    this.tipFor = -1;
  }

  /** Small floating notice over the board (item feedback, gentle refusals). */
  private notice(msg: string, color = "#ffe08a") {
    if (this.activeNotice?.active) {
      this.tweens.killTweensOf(this.activeNotice);
      this.activeNotice.destroy();
    }
    const inLane = this.arenaActive && this.boss.arena === "shells";
    const at = this.toScreen(inLane ? CXC : this.boardCenter, inLane ? this.laneRectD().y + 82 : GRID_Y + 24);
    const t = this.add.text(at.x, at.y, msg, {
      fontFamily: EMOJI_FONT, fontStyle: "bold", fontSize: "18px", color,
      backgroundColor: "#101b20", padding: { x: 12, y: 8 }, align: "center",
      wordWrap: { width: Math.max(180, GRID_W * this.centerBaseScale - 48) },
    }).setOrigin(0.5, 0).setDepth(85).setAlpha(0);
    this.activeNotice = t;
    this.tweens.add({ targets: t, alpha: 1, duration: 120 });
    this.tweens.add({ targets: t, alpha: 0, duration: 250, delay: 1800, onComplete: () => t.destroy() });
  }

  /** Dev: grant an item by id (or a random one) — console: __mb.debugItem("sapper"). */
  public debugItem(id?: string) {
    const def = id ? itemById(id) : rollItem(false);
    if (!def) return `unknown item: ${id}`;
    this.fillSlot(def);
    return def.name;
  }

  // ================= first-run tutorial host API (src/tutorial.ts drives these) =================

  /** design-local -> screen px (the centre column is scaled + centred by layout()). */
  public toScreen(x: number, y: number) {
    if (y >= GRID_Y) return {x:this.puzzleBox.x+x*this.puzzleScale,y:this.puzzleBox.y+y*this.puzzleScale};
    return { x: this.centerBox.x + x * this.centerScale, y: this.centerBox.y + y * this.centerScale };
  }
  public uiScale() {
    return this.centerScale;
  }
  public laneRectD() {
    const top = (this.portraitLaneTop - this.centerBaseY) / this.centerBaseScale;
    return { x: GRID_X, y: top, w: UI_W, h: LANE_Y + LANE_H - top };
  }
  public boardRectD() {
    return { x: GRID_X, y: GRID_Y, w: this.boardWidth, h: this.boardHeight };
  }
  public cellRectD(r: number, c: number) {
    return { x: GRID_X + c * TILE, y: GRID_Y + r * TILE, w: TILE, h: TILE };
  }
  /** Bounding box of HUD resource rows [from..to] (wood, ore, treasure, keys) — already screen px. */
  public resourceRowsRect(from: number, to: number) {
    const bounds = [...this.resIcons.slice(from, to + 1), ...this.resVals.slice(from, to + 1)].map(o => o.getBounds());
    const left = Math.min(...bounds.map(b => b.left)) - 4;
    const top = Math.min(...bounds.map(b => b.top)) - 4;
    return { x: left, y: top, w: Math.max(...bounds.map(b => b.right)) + 4 - left, h: Math.max(...bounds.map(b => b.bottom)) + 4 - top };
  }
  /** Scripted strike for the tutorial beats; pierce ignores banked block (the knockback demo). */
  public demoStrike(pierce: boolean, slowMotion = false): boolean {
    if (this.run.over || this.phase !== "fight" || !this.orc || this.orcDying || !this.run.enemy) return false;
    this.strike(true, pierce, slowMotion); // pierce is honoured at CONTACT, not up front
    return true;
  }
  /**
   * The kill punch-in: in a hair, then straight back out.
   *
   * This used to chain two cam.zoomTo() calls, the second fired from the first
   * one's progress callback. If anything interrupted that hand-off — a second
   * kill, a scene pause, the tutorial retaking the view — the camera was left
   * sitting at 1.035 forever, which crops the outer 3.5% of the screen and eats
   * the corners of the HUD. Tweening zoom directly, killing any prior tween and
   * pinning the final value, makes the return unconditional.
   */
  private punchCamera(to = PUNCH_KILL, inMs = 60, outMs = 140) {
    // While the tutorial has the lane framed, the shell is already mid-zoom and
    // the punch stacks on top of it — kill the demo foe during that framing and
    // the two transforms fight, which is exactly how the camera used to end up
    // stranded. The tutorial owns the view for those few seconds; let it.
    if (this.tutorialHitFocus || to <= 1) return;
    const cam = this.cameras.main;
    cam.zoomEffect.reset();
    this.tweens.killTweensOf(cam);
    this.tweens.add({
      targets: cam,
      zoom: to,
      duration: inMs,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: cam,
          zoom: 1,
          duration: outMs,
          ease: "Sine.easeOut",
          onComplete: () => {
            cam.zoom = 1; // land exactly on 1 however the tween ended
          },
        });
      },
    });
  }

  /**
   * Put the camera back to dead centre, unzoomed. Shake perturbs scroll while it
   * runs and the punch-in touches zoom, so anything that promises "the view is
   * normal again" has to say so explicitly rather than assume.
   */
  private settleCamera() {
    const cam = this.cameras.main;
    this.tweens.killTweensOf(cam);
    cam.zoomEffect.reset();
    cam.shakeEffect.reset();
    cam.setZoom(1);
    cam.setScroll(0, 0);
  }

  /** Pause the sword resolve until the lane is framed, then slow this one hero combo. */
  public focusTutorialSword(onComplete: () => void) {
    this.tutorialSwordSlow = true;
    this.focusTutorialHit(() => this.time.delayedCall(180, onComplete));
  }
  /** Frame the lane tightly for the tutorial's first enemy counterattack. */
  public focusTutorialHit(onComplete: () => void) {
    const target = this.tutorialHitView();
    if (
      this.tutorialHitFocus &&
      Math.abs(this.centerScale - target.scale) < 0.001 &&
      Math.abs(this.centerBox.x - target.x) < 0.5 &&
      Math.abs(this.centerBox.y - target.y) < 0.5
    ) {
      onComplete();
      return;
    }
    this.tutorialHitFocus = true;
    this.tweenTutorialView(target, 520, "Sine.easeInOut", onComplete);
  }
  /** Return the responsive shell to its normal framing before the board lesson resumes. */
  public restoreTutorialView(onComplete?: () => void, immediate = false) {
    this.tutorialHitFocus = false;
    // the shell tween below restores the CENTRE COLUMN; the camera is a separate
    // transform, and a punch-in or shake caught mid-flight would otherwise stay
    // applied and leave the HUD clipped at the corners
    this.settleCamera();
    const base = { x: this.centerBaseX, y: this.centerBaseY, scale: this.centerBaseScale };
    if (immediate) {
      this.tutorialViewTween?.stop();
      this.tutorialViewTween = null;
      this.tutorialViewTweenDone = null;
      this.applyCenterView(base.x, base.y, base.scale);
      onComplete?.();
      return;
    }
    this.tweenTutorialView(base, 420, "Sine.easeInOut", onComplete);
  }
  private tutorialHitView() {
    const zoom = 1.36;
    const laneCx = CXC;
    const laneCy = LANE_Y + LANE_H / 2;
    const scale = this.centerBaseScale * zoom;
    const anchorX = this.centerBaseX + laneCx * this.centerBaseScale;
    const anchorY = this.centerBaseY + laneCy * this.centerBaseScale;
    return { x: anchorX - laneCx * scale, y: anchorY - laneCy * scale, scale };
  }
  private applyCenterView(x: number, y: number, scale: number) {
    this.centerScale = scale;
    this.centerBox.setPosition(x, y).setScale(scale);
  }
  private tweenTutorialView(
    target: { x: number; y: number; scale: number },
    duration: number,
    ease: string,
    onComplete?: () => void,
  ) {
    this.tutorialViewTween?.stop();
    this.tutorialViewTweenDone = onComplete ?? null;
    const view = { x: this.centerBox.x, y: this.centerBox.y, scale: this.centerScale };
    this.tutorialViewTween = this.tweens.add({
      targets: view,
      x: target.x,
      y: target.y,
      scale: target.scale,
      duration,
      ease,
      onUpdate: () => this.applyCenterView(view.x, view.y, view.scale),
      onComplete: () => {
        this.applyCenterView(target.x, target.y, target.scale);
        this.tutorialViewTween = null;
        const done = this.tutorialViewTweenDone;
        this.tutorialViewTweenDone = null;
        done?.();
      },
    });
  }
  public markTutorialSeen() {
    this.tutorial = null;
    this.meta.tutorialSeen = true;
    saveMeta(this.meta);
  }
  /**
   * Plant a one-swap match of `type` near the bottom middle of the board:
   * T T · in the bottom row with the third T waiting one row up — dragging it
   * down completes the row. Any accidental matches the plant creates are
   * scrubbed (without touching the planted cells), then changed sprites rebuilt.
   */
  public rigSwapMatch(type: number): { from: Coord; to: Coord } {
    const b = this.boardRows - 1;
    const c0 = Math.floor(this.boardCols / 2) - 1;
    const changed = new Set<string>();
    const set = (r: number, c: number, t: number) => {
      if (this.grid[r][c] === t) return;
      this.grid[r][c] = t;
      changed.add(r + "," + c);
    };
    set(b, c0, type);
    set(b, c0 + 1, type);
    set(b - 1, c0 + 2, type);
    if (this.grid[b][c0 + 2] === type) set(b, c0 + 2, (type + 1) % TYPES); // don't pre-complete the row
    const planted = new Set([`${b},${c0}`, `${b},${c0 + 1}`, `${b - 1},${c0 + 2}`]);
    for (let guard = 0; guard < 60; guard++) {
      const ms = findMatches(this.grid);
      if (!ms.length) break;
      for (const m of ms) {
        const cell = m.cells.find((x) => !planted.has(`${x.r},${x.c}`)) ?? m.cells[0];
        set(cell.r, cell.c, (this.grid[cell.r][cell.c] + 1 + ((Math.random() * (TYPES - 1)) | 0)) % TYPES);
      }
    }
    changed.forEach((key) => {
      const [r, c] = key.split(",").map(Number);
      this.tiles[r][c]?.destroy();
      this.tiles[r][c] = this.makeTile(r, c, this.grid[r][c]);
    });
    return { from: { r: b - 1, c: c0 + 2 }, to: { r: b, c: c0 + 2 } };
  }

  /** Float one damage number per swing, timed so it pops as each hit lands. */
  private showHits(hits: number[], combo: string[], mod: DamageMod, tempo = 1) {
    let t = 0;
    combo.forEach((key, i) => {
      const dmg = hits[i] ?? 0;
      if (dmg > 0)
        this.time.delayedCall(t + 100 * tempo, () => {
          this.floatDamage(dmg, i === 0, mod);
          if (i === 0) this.teachDefense(mod); // name the rule as the first blow lands
        });
      t += (this.anims.get(key)?.duration ?? 300) * tempo;
    });
  }

  /**
   * Floating reward chip — the pop/rise/fade renderer behind every "+N".
   * Tint picks the identity: gold = score, steel-blue = guard. Sizes are
   * DESIGN px (the centre column scales on small screens), so floors stay
   * generous or a 3-match's "+6" vanishes into the board.
   */
  private floatChip(
    x: number,
    y: number,
    label: string,
    opts: { size: number; delay?: number; sparkle?: boolean; tint?: [number, number, number, number]; stroke?: string; font?: string },
  ) {
    const spawn = () => {
      const size = opts.size;
      const t = this.inBox(
        this.add
          .text(x + (Math.random() * 18 - 9), y, label, {
            fontFamily: opts.font ?? "monospace",
            fontStyle: "bold",
            fontSize: `${size}px`,
            color: "#ffffff",
            stroke: opts.stroke ?? "#1a0a04",
            strokeThickness: Math.max(5, Math.round(size / 4)),
          })
          .setOrigin(0.5)
          .setDepth(66)
          .setScale(0.2)
          .setAngle(Math.random() * 8 - 4), // a little tilt so repeats don't stamp
      );
      t.setShadow(0, 4, "rgba(0,0,0,0.85)", 8, true, true); // lifts it off any tile colour
      const [a, b, c, d] = opts.tint ?? [0xfff6c8, 0xffe08a, 0xf2a93b, 0xc9761f]; // default: the game's gold
      t.setTint(a, b, c, d);
      this.tweens.add({ targets: t, scale: 1.12, duration: 200, ease: "Back.easeOut" });
      this.tweens.add({ targets: t, scale: 1, duration: 120, delay: 200 }); // settle off the overshoot
      this.tweens.add({
        targets: t,
        y: y - 60 - size,
        alpha: 0,
        angle: 0,
        duration: 950,
        delay: 380,
        ease: "Quad.easeOut",
        onComplete: () => t.destroy(),
      });
      if (opts.sparkle) {
        // a glint of sparks behind the big paydays
        const sp = this.inBox(
          this.add
            .particles(x, y, "spark", {
              speed: { min: 60, max: 190 },
              lifespan: { min: 250, max: 520 },
              scale: { start: 1.0, end: 0 },
              blendMode: "ADD",
              emitting: false,
            })
            .setDepth(65),
        );
        sp.explode(10);
        this.time.delayedCall(700, () => sp.destroy());
      }
    };
    if (opts.delay) this.time.delayedCall(opts.delay, spawn);
    else spawn();
  }

  /** Gold "+N" score number (matches, kills, chests). Distinct from amber -damage. */
  private floatScore(x: number, y: number, n: number, opts: { size?: number; delay?: number; sparkle?: boolean } = {}) {
    if (n <= 0) return;
    const size = opts.size ?? Math.min(52, 32 + Math.floor(n / 4)); // bigger wins land bigger
    this.floatChip(x, y, `+${n}`, { size, delay: opts.delay, sparkle: opts.sparkle });
  }

  /** Steel-blue "+N🛡" guard chip — shields pay protection, not points. */
  private floatGuard(x: number, y: number, n: number, delay?: number) {
    if (n <= 0) return;
    this.floatChip(x, y, `+${n}🛡`, {
      size: 30,
      delay,
      tint: [0xeef6ff, 0xbfe0ff, 0x6ea8e0, 0x3a6a9a],
      stroke: "#050d16",
      font: EMOJI_FONT,
    });
  }

  private floatDamage(n: number, big = true, mod: DamageMod = "none", target = this.orc) {
    const x = (target?.x ?? SAFE_X) + (Math.random() * 26 - 13);
    const y = GROUND_Y - 64 - (big ? 0 : 8);
    // the defense speaks through the number: gray = soaked, hot gold = tore through
    const size = (big ? 28 : 18) + (mod === "weak" ? 6 : mod === "resist" ? -3 : 0);
    const color = mod === "resist" ? "#aab2bd" : mod === "weak" ? "#ffd24a" : big ? "#fff2b0" : "#ffca66";
    const stroke = mod === "resist" ? "#20242b" : "#38180c";
    const t = this.inBox(this.add
      .text(x, y, `-${n}`, {
        fontFamily: "monospace",
        fontStyle: "bold",
        fontSize: `${this.worldFont(size, 18)}px`,
        color,
        stroke,
        strokeThickness: big ? 5 : 4,
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setScale(0.3));
    // punchy pop-in, then rise and fade
    this.tweens.add({ targets: t, scale: big ? 1.1 : 0.9, duration: 150, ease: "Back.easeOut" });
    this.tweens.add({
      targets: t,
      y: y - (big ? 56 : 42),
      alpha: 0,
      duration: big ? 780 : 620,
      delay: 120,
      ease: "Quad.easeOut",
      onComplete: () => t.destroy(),
    });
  }

  /** Combo hitstop: hold the board a beat + callout, then release into shake + flash. */
  private async comboBeat(depth: number): Promise<void> {
    const d = Math.min(depth, 5);
    this.showCombo(depth);
    this.sfx(`combo${Math.min(depth, 6)}`, 0.16, 1 + d * 0.035);
    await new Promise<void>((res) => this.time.delayedCall(65 + d * 15, res));
    this.cameras.main.shake(140, 0.003 + 0.0015 * d);
    this.boardFlash(0.14 + 0.05 * d);
  }

  private showCombo(depth: number) {
    const tint = ["#ffe08a", "#ffd24a", "#ff9d3a", "#ff6a3a", "#ff466a"][Math.min(depth - 2, 4)];
    const t = this.inBox(this.add
      .text(this.boardCenter, GRID_Y + this.boardHeight * 0.32, `COMBO ×${depth}`, {
        fontFamily: "monospace",
        fontStyle: "bold",
        fontSize: `${22 + Math.min(depth, 5) * 4}px`,
        color: tint,
        stroke: "#2a0c06",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(70)
      .setScale(0.4));
    this.tweens.add({ targets: t, scale: 1, duration: 170, ease: "Back.easeOut" });
    this.tweens.add({ targets: t, y: t.y - 26, alpha: 0, duration: 720, delay: 260, ease: "Quad.easeIn", onComplete: () => t.destroy() });
  }

  private boardFlash(alpha: number) {
    const f = this.inBox(this.add.rectangle(this.boardCenter, GRID_Y + this.boardHeight / 2, this.boardWidth, this.boardHeight, 0xffffff, alpha).setDepth(45));
    this.tweens.add({ targets: f, alpha: 0, duration: 200, ease: "Quad.easeOut", onComplete: () => f.destroy() });
  }

  private showGameOver() {
    this.overShown = true;
    this.fadeOutMusic(900); // the song dies with him
    this.orc?.stop();
    this.rearFoe?.sprite.stop();
    this.tweens.killTweensOf(this.hero);
    this.hero.anims.nextAnim = null;
    this.hero.anims.nextAnimsQueue.length = 0;
    this.hero.play("hero-death"); // the hero falls where the dark caught him
    // the big flat death pose sprawls left of the skull and off the lane — clamp it back on
    this.hero.x = Math.max(this.hero.x, PADIN + 8 + DEATH_BODY_LEFT * HERO_SCALE);

    // the caravan keeps what you carried: bank resources + quest stats
    const r = this.run.resources;
    bankRun(loadMeta(), { wood: r.wood, ore: r.ore, treasure: r.treasure, kills: this.run.killed, chests: this.chestsOpened });

    this.time.delayedCall(850, () => this.renderRunResults(false));
  }

  private renderRunResults(won: boolean) {
    this.clearSelection();
    this.clearHint();
    this.cancelTargeting();
    this.hideTip();
    const r = this.run.resources;
    showResults(this, {
      won, depth: this.run.killed, score: this.run.score,
      cascade: this.bestCascade,
      wood: r.wood, ore: r.ore, treasure: r.treasure,
      record: this.run.killed > this.meta.bestDepth,
      reason: this.run.endReason,
    });
  }

  // --- tile tweens (shared by swap / collapse) ---
  private moveTo(t: Phaser.GameObjects.Container, r: number, c: number): Promise<void> {
    this.tweens.killTweensOf(t);
    return new Promise((res) => {
      // Replacements below ice fade in with their drop. A separate fade would
      // be canceled by killTweensOf above, leaving full cells invisible.
      this.tweens.add({ targets: t, x: this.xFor(c), y: this.yFor(r), alpha: 1, duration: 105, ease: "Quad.easeOut", onComplete: () => {
        if (t.scene) settleTile(this, t);
        res();
      } });
    });
  }
  /** Shared, low-cost metallic glint: staggered per tile so the board never strobes in unison. */
  private buildTilePolish() {
    if (!this.textures.exists(TILE_SHINE_KEY)) {
      const cv = document.createElement("canvas");
      cv.width = FACE * TILE_SHINE_FRAMES;
      cv.height = FACE;
      const g = cv.getContext("2d")!;

      // Frames 0 and 10 stay transparent. Across 1..9, a warm-white diagonal
      // highlight crosses the iron frame and icon, clipped to the tile silhouette.
      for (let frame = 1; frame < TILE_SHINE_FRAMES - 1; frame++) {
        const ox = frame * FACE;
        const p = (frame - 1) / (TILE_SHINE_FRAMES - 3);
        g.save();
        g.translate(ox, 0);
        const inset = 2;
        const radius = 7;
        g.beginPath();
        g.moveTo(inset + radius, inset);
        g.lineTo(FACE - inset - radius, inset);
        g.quadraticCurveTo(FACE - inset, inset, FACE - inset, inset + radius);
        g.lineTo(FACE - inset, FACE - inset - radius);
        g.quadraticCurveTo(FACE - inset, FACE - inset, FACE - inset - radius, FACE - inset);
        g.lineTo(inset + radius, FACE - inset);
        g.quadraticCurveTo(inset, FACE - inset, inset, FACE - inset - radius);
        g.lineTo(inset, inset + radius);
        g.quadraticCurveTo(inset, inset, inset + radius, inset);
        g.closePath();
        g.clip();

        g.translate(FACE / 2, FACE / 2);
        g.rotate(-Math.PI / 7);
        const sweepX = lerp(-FACE * 0.9, FACE * 0.9, p);
        const broad = g.createLinearGradient(sweepX - 15, 0, sweepX + 15, 0);
        broad.addColorStop(0, "rgba(255,246,205,0)");
        broad.addColorStop(0.34, "rgba(255,246,205,0.08)");
        broad.addColorStop(0.5, "rgba(255,255,240,0.22)");
        broad.addColorStop(0.66, "rgba(255,246,205,0.08)");
        broad.addColorStop(1, "rgba(255,246,205,0)");
        g.fillStyle = broad;
        g.fillRect(sweepX - 16, -FACE, 32, FACE * 2);

        // A fine specular edge gives the sweep a crisp pixel-art glint without
        // washing out the saturated icon colours underneath.
        g.fillStyle = "rgba(255,255,255,0.1)";
        g.fillRect(sweepX - 1, -FACE, 2, FACE * 2);
        g.restore();
      }

      const sheet = this.textures.addCanvas(TILE_SHINE_KEY, cv);
      // Passing a Texture makes Phaser retain its existing key while slicing it.
      if (sheet) this.textures.addSpriteSheet("", sheet, { frameWidth: FACE, frameHeight: FACE });
      sheet?.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    if (!this.anims.exists(TILE_SHINE_ANIM)) {
      this.anims.create({
        key: TILE_SHINE_ANIM,
        frames: this.anims.generateFrameNumbers(TILE_SHINE_KEY, { start: 0, end: TILE_SHINE_FRAMES - 1 }),
        frameRate: 8,
        repeat: -1,
      });
    }
  }
  // ---- zone-dressed HUD rails: per-biome panel tint + baked fringe art -------

  /**
   * The HUD rails reflect the road: panel body/stroke tinted to the zone, plus
   * hand-baked tileable fringe strips (original canvas art, not world textures)
   * hugging the panel edges. Muted colors + alpha keep the text the first read.
   * A new biome = one more branch here.
   */
  private buildPanelTheme(): {
    kind: "plains" | "forest" | "snow" | "dungeon";
    body: number;
    edge: number;
    decor: { key: string; edge: "top" | "bottom" | "side"; h: number; alpha: number }[];
  } {
    if (this.meta.biome === "dungeon") {
      this.bakeDungeonPanelArt();
      return {
        kind: "dungeon",
        body: 0x141218,
        edge: 0x453e52,
        decor: [
          { key: "ui-dungeon-chains", edge: "top", h: 46, alpha: 0.95 },
          { key: "ui-dungeon-rubble", edge: "bottom", h: 36, alpha: 0.95 },
        ],
      };
    }
    if (this.meta.biome === "snow") {
      this.bakeSnowPanelArt();
      return {
        kind: "snow",
        body: 0x10151d,
        edge: 0x3a4a63,
        decor: [
          { key: "ui-snow-icicles", edge: "top", h: 44, alpha: 0.95 },
          { key: "ui-snow-drift", edge: "bottom", h: 48, alpha: 0.95 },
        ],
      };
    }
    if (this.meta.biome === "forest") {
      this.bakeForestPanelArt();
      return {
        kind: "forest",
        body: 0x0f1511,
        edge: 0x2c4a33,
        decor: [
          { key: "ui-forest-canopy", edge: "top", h: 64, alpha: 0.95 },
          { key: "ui-forest-litter", edge: "bottom", h: 30, alpha: 0.9 },
          { key: "ui-forest-vine", edge: "side", h: 14, alpha: 0.8 },
        ],
      };
    }
    // plains (and the default for roads not yet dressed)
    this.bakePlainsPanelArt();
    return {
      kind: "plains",
      body: 0x131a10,
      edge: 0x3a512b,
      decor: [
        { key: "ui-plains-grass", edge: "bottom", h: 56, alpha: 0.95 },
        { key: "ui-plains-sky", edge: "top", h: 24, alpha: 0.6 },
      ],
    };
  }

  /** A single leaf: pointed oval on a stem angle, filled + veined. */
  private drawLeaf(g: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number, fill: string) {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    const w = len * 0.32;
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(w, len * 0.35, 0, len);
    g.quadraticCurveTo(-w, len * 0.35, 0, 0);
    g.fill();
    g.strokeStyle = "rgba(10,20,10,0.35)";
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(0, len * 0.12);
    g.lineTo(0, len * 0.88);
    g.stroke();
    g.restore();
  }

  /** Plains rails: a deep meadow fringe (bottom) and a sunlit sky whisper (top). */
  private bakePlainsPanelArt() {
    if (!this.textures.exists("ui-plains-grass")) {
      const cv = document.createElement("canvas");
      cv.width = 256;
      cv.height = 56;
      const g = cv.getContext("2d")!;
      // low meadow mounds behind the blades
      g.fillStyle = "rgba(42,66,32,0.55)";
      for (const [mx, mr] of [[40, 70], [140, 95], [230, 65]] as const) {
        g.beginPath();
        g.ellipse(mx, 70, mr, 26, 0, Math.PI, 0);
        g.fill();
      }
      // a DEEP stand of grass: leaning quadratic strokes in four greens
      const greens = ["#3c6030", "#4a7538", "#578a45", "#2e4d26"];
      for (let i = 0; i < 170; i++) {
        const x = 3 + Math.random() * 250;
        const h = 12 + Math.random() * 40;
        const lean = (Math.random() * 2 - 1) * 11;
        g.strokeStyle = greens[i % greens.length];
        g.lineWidth = 1.3 + Math.random() * 1.6;
        g.beginPath();
        g.moveTo(x, 56);
        g.quadraticCurveTo(x + lean * 0.3, 56 - h * 0.6, x + lean, 56 - h);
        g.stroke();
      }
      // golden wheat stalks swaying above the green
      for (let i = 0; i < 8; i++) {
        const x = 14 + Math.random() * 228;
        const h = 36 + Math.random() * 16;
        const lean = (Math.random() * 2 - 1) * 7;
        g.strokeStyle = "#c9b25a";
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x, 56);
        g.quadraticCurveTo(x + lean * 0.4, 56 - h * 0.6, x + lean, 56 - h);
        g.stroke();
        g.fillStyle = "#d8c26a";
        for (let k = 0; k < 5; k++) {
          g.beginPath();
          g.ellipse(x + lean + (k % 2 === 0 ? -1.9 : 1.9), 56 - h + k * 2.8, 2, 3.2, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      // wildflowers + a few white daisies riding the blades
      const petals = ["#ffd94a", "#ffe9a8", "#dfa0c0", "#e8e2f0"];
      for (let i = 0; i < 16; i++) {
        const x = 12 + Math.random() * 232;
        const y = 56 - (10 + Math.random() * 26);
        g.fillStyle = petals[i % petals.length];
        g.beginPath();
        g.arc(x, y, 2.3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "rgba(90,60,20,0.8)";
        g.beginPath();
        g.arc(x, y, 0.9, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 6; i++) {
        const x = 20 + Math.random() * 216;
        const y = 56 - (14 + Math.random() * 22);
        g.fillStyle = "#f2f2ea";
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          g.beginPath();
          g.arc(x + Math.cos(a) * 2.4, y + Math.sin(a) * 2.4, 1.5, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "#ffd94a";
        g.beginPath();
        g.arc(x, y, 1.4, 0, Math.PI * 2);
        g.fill();
      }
      this.textures.addCanvas("ui-plains-grass", cv);
    }
    if (!this.textures.exists("ui-plains-sky")) {
      const cv = document.createElement("canvas");
      cv.width = 256;
      cv.height = 24;
      const g = cv.getContext("2d")!;
      // a warm sun-glow breaking in from the strip's edge
      const sun = g.createRadialGradient(232, 4, 1, 232, 4, 18);
      sun.addColorStop(0, "rgba(255,224,138,0.6)");
      sun.addColorStop(1, "rgba(255,224,138,0)");
      g.fillStyle = sun;
      g.fillRect(206, 0, 50, 24);
      // soft cloud puffs + distant birds
      g.fillStyle = "rgba(215,228,240,0.35)";
      for (const [cx0, cy0, s] of [[52, 9, 1], [126, 15, 0.7], [182, 11, 0.85]] as const) {
        for (const [ox, oy, r] of [[-10, 2, 6], [0, 0, 8], [10, 2, 6], [4, 4, 6]] as const) {
          g.beginPath();
          g.arc(cx0 + ox * s, cy0 + oy * s, r * s, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.strokeStyle = "rgba(200,215,230,0.55)";
      g.lineWidth = 1;
      for (const [bx, by] of [[96, 7], [107, 10], [102, 15]] as const) {
        g.beginPath();
        g.moveTo(bx - 3, by + 2);
        g.quadraticCurveTo(bx, by, bx + 3, by + 2);
        g.stroke();
      }
      this.textures.addCanvas("ui-plains-sky", cv);
    }
    // the meadow's visitor: pale wings baked once, tinted per butterfly
    if (!this.textures.exists("ui-butterfly")) {
      const cv = document.createElement("canvas");
      cv.width = 12;
      cv.height = 10;
      const g = cv.getContext("2d")!;
      g.fillStyle = "#f4f4f8";
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(6 + s * 3, 3.4, 3.1, 2.4, s * 0.5, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(6 + s * 2.4, 6.8, 2.2, 1.8, s * 0.9, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = "#2a2016";
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(6, 1.5);
      g.lineTo(6, 8.5);
      g.stroke();
      this.textures.addCanvas("ui-butterfly", cv);
    }
  }

  /** Forest rails: layered hanging canopy (top), mushroomed litter (bottom), climbing side vines. */
  private bakeForestPanelArt() {
    if (!this.textures.exists("ui-forest-canopy")) {
      const cv = document.createElement("canvas");
      cv.width = 256;
      cv.height = 64;
      const g = cv.getContext("2d")!;
      // BACK canopy layer: dense, dark, short — depth behind the bright leaves
      const backs = ["#16301a", "#1c3a1f"];
      for (let x = 0; x < 256; x += 5) {
        this.drawLeaf(g, x + Math.random() * 4, Math.random() * 6, 16 + Math.random() * 16, (Math.random() * 2 - 1) * 0.7, backs[(Math.random() * 2) | 0]);
      }
      // the vine the leaves hang from
      g.strokeStyle = "#243b22";
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(0, 3);
      for (let x = 0; x <= 256; x += 16) g.quadraticCurveTo(x - 8, 3 + (x % 32 === 0 ? 3 : -2), x, 3);
      g.stroke();
      // FRONT canopy: brighter clusters, longest in the dips
      const deeps = ["#274d2b", "#356338", "#3f7a42", "#4d9450"];
      for (let x = 4; x < 256; x += 8 + Math.random() * 7) {
        const n = 2 + ((Math.random() * 3) | 0);
        for (let k = 0; k < n; k++) {
          const len = 14 + Math.random() * 28;
          const ang = (Math.random() * 2 - 1) * 0.55;
          this.drawLeaf(g, x + (Math.random() * 8 - 4), 2 + Math.random() * 6, len, ang, deeps[(Math.random() * deeps.length) | 0]);
        }
      }
      // trailing tendrils reaching further down than the leaves dare
      for (const tx of [30, 116, 200]) {
        const x = tx + Math.random() * 22;
        const depth = 46 + Math.random() * 16;
        g.strokeStyle = "#2a4526";
        g.lineWidth = 1.7;
        g.beginPath();
        g.moveTo(x, 4);
        let side = 1;
        for (let y = 12; y <= depth; y += 8) {
          g.quadraticCurveTo(x + side * 5, y - 4, x, y);
          side = -side;
        }
        g.stroke();
        for (let y = 12; y < depth; y += 10) this.drawLeaf(g, x, y, 8 + Math.random() * 5, (y % 2 === 0 ? 1 : -1) * 1.2, "#356338");
      }
      this.textures.addCanvas("ui-forest-canopy", cv);
    }
    if (!this.textures.exists("ui-forest-litter")) {
      const cv = document.createElement("canvas");
      cv.width = 256;
      cv.height = 30;
      const g = cv.getContext("2d")!;
      // moss line along the very bottom
      g.fillStyle = "rgba(38,58,34,0.6)";
      g.beginPath();
      g.moveTo(0, 30);
      for (let x = 0; x <= 256; x += 12) g.lineTo(x, 23 + Math.random() * 5);
      g.lineTo(256, 30);
      g.fill();
      // fallen leaves, flat and scattered
      const fallen = ["#4a5a2c", "#5d6b34", "#6b5a2a", "#3a4a24"];
      for (let i = 0; i < 34; i++) {
        const x = 4 + Math.random() * 248;
        const y = 14 + Math.random() * 13;
        this.drawLeaf(g, x, y, 8 + Math.random() * 8, Math.PI / 2 + (Math.random() * 2 - 1) * 1.1, fallen[i % fallen.length]);
      }
      // toadstools poking through the litter (red-capped + little brown)
      for (const [mx, big] of [[36 + Math.random() * 40, true], [150 + Math.random() * 60, true], [96 + Math.random() * 30, false], [218 + Math.random() * 24, false]] as const) {
        const x = mx;
        if (big) {
          g.fillStyle = "#e0d4c0";
          g.fillRect(x - 1.8, 19, 3.6, 9);
          g.fillStyle = "#b03830";
          g.beginPath();
          g.arc(x, 20, 6.2, Math.PI, 0);
          g.fill();
          g.fillStyle = "#f0e8e0";
          for (const [dx, dy] of [[-2.8, -2], [1.1, -3.4], [3.4, -1.1]] as const) {
            g.beginPath();
            g.arc(x + dx, 20 + dy, 0.95, 0, Math.PI * 2);
            g.fill();
          }
        } else {
          g.fillStyle = "#cabb9a";
          g.fillRect(x - 1.2, 23, 2.4, 6);
          g.fillStyle = "#8a6a3a";
          g.beginPath();
          g.arc(x, 23.4, 3.6, Math.PI, 0);
          g.fill();
        }
      }
      this.textures.addCanvas("ui-forest-litter", cv);
    }
    // side vine: a winding climber, tileable vertically down the rail's edge
    if (!this.textures.exists("ui-forest-vine")) {
      const cv = document.createElement("canvas");
      cv.width = 14;
      cv.height = 128;
      const g = cv.getContext("2d")!;
      g.strokeStyle = "#2a4526";
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(7, 0);
      let side = 1;
      for (let y = 16; y <= 128; y += 16) {
        g.quadraticCurveTo(7 + side * 4, y - 8, 7, y);
        side = -side;
      }
      g.stroke();
      const vineGreens = ["#356338", "#274d2b"];
      for (let y = 6; y < 124; y += 11) {
        const s2 = y % 22 < 11 ? 1 : -1;
        this.drawLeaf(g, 7 + s2 * 2, y, 8 + Math.random() * 4, s2 * (Math.PI / 2 + 0.5), vineGreens[(Math.random() * 2) | 0]);
      }
      this.textures.addCanvas("ui-forest-vine", cv);
    }
    // a single pale leaf, tinted per fall
    if (!this.textures.exists("ui-leaf")) {
      const cv = document.createElement("canvas");
      cv.width = 12;
      cv.height = 16;
      const g = cv.getContext("2d")!;
      this.drawLeaf(g, 6, 1, 13, 0, "#cfe0c4");
      this.textures.addCanvas("ui-leaf", cv);
    }
  }

  /** Snow rails: an icicle-fanged frost line (top) and deep drifts with buried pines (bottom). */
  private bakeSnowPanelArt() {
    if (!this.textures.exists("ui-snow-icicles")) {
      const cv = document.createElement("canvas");
      cv.width = 256;
      cv.height = 44;
      const g = cv.getContext("2d")!;
      // packed frost line the icicles grow from
      g.fillStyle = "rgba(214,230,245,0.85)";
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(256, 0);
      g.lineTo(256, 5);
      for (let x = 256; x >= 0; x -= 10) g.lineTo(x, 4 + Math.random() * 4);
      g.closePath();
      g.fill();
      // icicles: tapering translucent fangs, a bright edge on each
      for (let x = 5; x < 256; x += 7 + Math.random() * 10) {
        const len = 8 + Math.random() * (Math.random() < 0.25 ? 34 : 18);
        const w = 2 + Math.random() * 3;
        const grad = g.createLinearGradient(0, 4, 0, 4 + len);
        grad.addColorStop(0, "rgba(200,224,244,0.9)");
        grad.addColorStop(1, "rgba(170,210,240,0.25)");
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(x - w, 4);
        g.lineTo(x + w, 4);
        g.lineTo(x + (Math.random() * 2 - 1), 4 + len);
        g.closePath();
        g.fill();
        g.strokeStyle = "rgba(240,250,255,0.55)";
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(x - w + 0.5, 4);
        g.lineTo(x, 4 + len * 0.9);
        g.stroke();
      }
      this.textures.addCanvas("ui-snow-icicles", cv);
    }
    if (!this.textures.exists("ui-snow-drift")) {
      const cv = document.createElement("canvas");
      cv.width = 256;
      cv.height = 48;
      const g = cv.getContext("2d")!;
      // back drift: dusk-blue shadow mounds
      g.fillStyle = "rgba(150,175,205,0.5)";
      for (const [mx, mr, my] of [[30, 70, 60], [130, 90, 62], [225, 70, 58]] as const) {
        g.beginPath();
        g.ellipse(mx, my, mr, 30, 0, Math.PI, 0);
        g.fill();
      }
      // little snowed-under pines poking out of the back drift
      for (const px of [46, 152, 232]) {
        const x = px + Math.random() * 10;
        const h = 18 + Math.random() * 10;
        g.fillStyle = "#1e3a2a";
        for (let t = 0; t < 3; t++) {
          const w = 9 - t * 2.4;
          const y = 48 - 14 - (t * h) / 3.2;
          g.beginPath();
          g.moveTo(x - w, y);
          g.lineTo(x + w, y);
          g.lineTo(x, y - h / 2.4);
          g.closePath();
          g.fill();
        }
        g.fillStyle = "rgba(235,244,252,0.9)"; // snow caught on the boughs
        g.beginPath();
        g.ellipse(x, 48 - 14 - h * 0.62, 5, 1.8, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(x + 2, 48 - 14 - h * 0.3, 6.5, 2, 0, 0, Math.PI * 2);
        g.fill();
      }
      // front drift: bright wind-carved snow
      g.fillStyle = "rgba(228,240,250,0.95)";
      g.beginPath();
      g.moveTo(0, 48);
      let y = 34;
      for (let x = 0; x <= 256; x += 16) {
        y = 30 + Math.sin(x * 0.06) * 5 + Math.random() * 3;
        g.quadraticCurveTo(x - 8, y - 4, x, y);
      }
      g.lineTo(256, 48);
      g.closePath();
      g.fill();
      // sparkles in the crust
      g.fillStyle = "rgba(255,255,255,0.95)";
      for (let i = 0; i < 22; i++) {
        const sx = 4 + Math.random() * 248;
        const sy = 36 + Math.random() * 10;
        g.fillRect(sx, sy, 1.2, 1.2);
      }
      this.textures.addCanvas("ui-snow-drift", cv);
    }
  }

  /** Dungeon rails: chain-and-cobweb fringe (top), ember-lit rubble with old bones (bottom). */
  private bakeDungeonPanelArt() {
    if (!this.textures.exists("ui-dungeon-chains")) {
      const cv = document.createElement("canvas");
      cv.width = 256;
      cv.height = 46;
      const g = cv.getContext("2d")!;
      // a rough stone lintel the chains bolt into
      g.fillStyle = "rgba(58,60,72,0.9)";
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(256, 0);
      g.lineTo(256, 6);
      for (let x = 256; x >= 0; x -= 14) g.lineTo(x, 5 + Math.random() * 3);
      g.closePath();
      g.fill();
      // cobwebs sagging in the corners of each tile-repeat
      g.strokeStyle = "rgba(200,205,215,0.28)";
      g.lineWidth = 1;
      for (const wx of [10, 132]) {
        for (let k = 1; k <= 4; k++) {
          g.beginPath();
          g.moveTo(wx - 10, 4);
          g.quadraticCurveTo(wx + k * 7 - 12, 6 + k * 5, wx + k * 9, 4);
          g.stroke();
        }
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          g.moveTo(wx + k * 10 - 4, 4);
          g.lineTo(wx + k * 6, 20 - k * 3);
          g.stroke();
        }
      }
      // hanging chains of varied fall, a hook on each
      for (const [chx, ln] of [[34, 30], [78, 18], [120, 36], [176, 24], [222, 32]] as const) {
        g.strokeStyle = "#4a4c5c";
        g.lineWidth = 1.4;
        for (let y = 6; y < 6 + ln; y += 6) {
          g.strokeRect(chx - 1.6, y, 3.2, 5); // links
        }
        g.fillStyle = "#585a6a";
        g.beginPath();
        g.arc(chx, 6 + ln + 3, 3, Math.PI * 0.8, Math.PI * 2.4); // the hook
        g.stroke();
      }
      this.textures.addCanvas("ui-dungeon-chains", cv);
    }
    if (!this.textures.exists("ui-dungeon-rubble")) {
      const cv = document.createElement("canvas");
      cv.width = 256;
      cv.height = 36;
      const g = cv.getContext("2d")!;
      // the rubble line
      g.fillStyle = "rgba(48,50,60,0.9)";
      g.beginPath();
      g.moveTo(0, 36);
      for (let x = 0; x <= 256; x += 10) g.lineTo(x, 26 + Math.random() * 6);
      g.lineTo(256, 36);
      g.fill();
      // tumbled stone blocks
      g.strokeStyle = "rgba(20,20,26,0.8)";
      g.lineWidth = 1;
      for (let i = 0; i < 16; i++) {
        const x = 4 + Math.random() * 244;
        const y = 24 + Math.random() * 8;
        const w = 6 + Math.random() * 9;
        const h = 4 + Math.random() * 5;
        g.fillStyle = `rgba(${62 + (Math.random() * 14) | 0},${64 + (Math.random() * 14) | 0},${76 + (Math.random() * 14) | 0},0.95)`;
        g.save();
        g.translate(x, y);
        g.rotate((Math.random() * 2 - 1) * 0.3);
        g.fillRect(-w / 2, -h / 2, w, h);
        g.strokeRect(-w / 2, -h / 2, w, h);
        g.restore();
      }
      // old bones in the shadow of the stones
      g.strokeStyle = "#b8b2a4";
      g.lineWidth = 1.6;
      for (const [bx, by, ang] of [[52, 30, 0.4], [190, 31, -0.25]] as const) {
        g.save();
        g.translate(bx, by);
        g.rotate(ang);
        g.beginPath();
        g.moveTo(-5, 0);
        g.lineTo(5, 0);
        g.stroke();
        for (const ex of [-5, 5]) for (const ey of [-1.6, 1.6]) { g.beginPath(); g.arc(ex, ey, 1.3, 0, Math.PI * 2); g.fillStyle = "#b8b2a4"; g.fill(); }
        g.restore();
      }
      // a skull half-buried, watching
      const sx = 120 + Math.random() * 16;
      g.fillStyle = "#c4beb0";
      g.beginPath();
      g.arc(sx, 30, 4.4, Math.PI, 0);
      g.fill();
      g.fillRect(sx - 4.4, 30, 8.8, 3);
      g.fillStyle = "#141218";
      g.fillRect(sx - 2.6, 28.4, 1.8, 2);
      g.fillRect(sx + 0.8, 28.4, 1.8, 2);
      // embers breathing in the cracks
      for (let i = 0; i < 9; i++) {
        const x = 8 + Math.random() * 240;
        const y = 30 + Math.random() * 4;
        g.fillStyle = `rgba(255,${120 + (Math.random() * 60) | 0},40,${0.35 + Math.random() * 0.4})`;
        g.fillRect(x, y, 1.4, 1.4);
      }
      this.textures.addCanvas("ui-dungeon-rubble", cv);
    }
  }

  // ---- panel critters: small living touches wandering the rails --------------

  /** Living touches over the rails, by zone: wings, leaf-fall, snowfall, or dust and embers. */
  private buildPanelLife(kind: "plains" | "forest" | "snow" | "dungeon") {
    for (const side of ["left", "right"] as const) {
      if (kind === "plains") {
        for (const tint of [0xffd070, 0xd8a8e8]) this.spawnButterfly(side, tint);
        for (let i = 0; i < 4; i++) this.spawnMote(side, i * 1100);
      } else if (kind === "forest") {
        for (let i = 0; i < 3; i++) this.spawnFallingLeaf(side, i * 2300);
        for (let i = 0; i < 3; i++) this.spawnFirefly(side);
      } else if (kind === "snow") {
        for (let i = 0; i < 5; i++) this.spawnSnowfall(side, i * 1300);
        for (let i = 0; i < 3; i++) this.spawnTwinkle(side);
      } else {
        for (let i = 0; i < 4; i++) this.spawnDust(side, i * 1500);
        for (let i = 0; i < 3; i++) this.spawnEmber(side, i * 1900);
      }
    }
  }

  /** A wander target inside a rail (margins keep critters off the frame). */
  private panelPoint(side: "left" | "right", mx = 12, my = 18) {
    const r = side === "left" ? this.panelRectL : this.panelRectR;
    return {
      r,
      x: r.x + mx + Math.random() * Math.max(1, r.width - mx * 2),
      y: r.y + my + Math.random() * Math.max(1, r.height - my * 2),
    };
  }

  /** A meadow butterfly: wingbeat via scaleX, lazy wander, rests between hops. */
  private spawnButterfly(side: "left" | "right", tint: number) {
    const p0 = this.panelPoint(side);
    const b = this.add.image(p0.x, p0.y, "ui-butterfly").setTint(tint).setAlpha(0.95);
    this.tweens.add({ targets: b, scaleX: 0.4, duration: 120 + Math.random() * 60, yoyo: true, repeat: -1 });
    const wander = () => {
      if (!b.active) return;
      const p = this.panelPoint(side);
      b.setFlipX(p.x < b.x);
      const d = Phaser.Math.Distance.Between(b.x, b.y, p.x, p.y);
      this.tweens.add({
        targets: b,
        x: p.x,
        y: p.y,
        duration: 900 + d * 18,
        ease: "Sine.easeInOut",
        onComplete: () => this.time.delayedCall(400 + Math.random() * 2600, wander),
      });
    };
    wander();
  }

  /** Sunlit pollen: a gold mote drifting up out of the grass, then reborn elsewhere. */
  private spawnMote(side: "left" | "right", delay: number) {
    const m = this.add.image(0, 0, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe9a0).setScale(0.3).setAlpha(0);
    const drift = () => {
      if (!m.active) return;
      const p = this.panelPoint(side);
      m.setPosition(p.x, Math.min(p.r.bottom - 26, p.y + 30)).setAlpha(0);
      const ms = 3800 + Math.random() * 2600;
      this.tweens.add({ targets: m, alpha: { from: 0, to: 0.75 }, duration: ms * 0.35, yoyo: true, hold: ms * 0.3 });
      this.tweens.add({
        targets: m,
        y: m.y - 50 - Math.random() * 40,
        x: m.x + (Math.random() * 30 - 15),
        duration: ms,
        ease: "Sine.easeOut",
        onComplete: () => this.time.delayedCall(300 + Math.random() * 1200, drift),
      });
    };
    this.time.delayedCall(delay, drift);
  }

  /** A leaf lets go of the canopy: sways down the rail, tumbling, fades at the litter. */
  private spawnFallingLeaf(side: "left" | "right", delay: number) {
    const tints = [0x6fae5e, 0x4f8a48, 0x9aa04a, 0xc0803a];
    const leaf = this.add.image(0, 0, "ui-leaf").setAlpha(0);
    const fall = () => {
      if (!leaf.active) return;
      const r = side === "left" ? this.panelRectL : this.panelRectR;
      const x0 = r.x + 10 + Math.random() * Math.max(1, r.width - 20);
      leaf
        .setPosition(x0, r.y + 52)
        .setAlpha(0)
        .setTint(tints[(Math.random() * tints.length) | 0])
        .setScale(0.7 + Math.random() * 0.5);
      const ms = 5200 + Math.random() * 3600;
      const sway = 14 + Math.random() * 12;
      const rot = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2);
      this.tweens.add({ targets: leaf, alpha: 0.85, duration: 600 });
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: ms,
        onUpdate: (tw) => {
          const u = tw.getValue() ?? 0;
          leaf.setPosition(x0 + Math.sin(u * Math.PI * 3) * sway, r.y + 52 + u * (r.height - 86));
          leaf.setRotation(Math.sin(u * Math.PI * 2) * 0.6 * rot);
          if (u > 0.85) leaf.setAlpha(0.85 * (1 - (u - 0.85) / 0.15));
        },
        onComplete: () => this.time.delayedCall(600 + Math.random() * 2400, fall),
      });
    };
    this.time.delayedCall(delay, fall);
  }

  /** A rail snowflake: white mote swaying down the panel, melting into the drift. */
  private spawnSnowfall(side: "left" | "right", delay: number) {
    const flake = this.add.image(0, 0, "spark").setTint(0xf0f8ff).setAlpha(0);
    const fall = () => {
      if (!flake.active) return;
      const r = side === "left" ? this.panelRectL : this.panelRectR;
      const x0 = r.x + 8 + Math.random() * Math.max(1, r.width - 16);
      flake.setPosition(x0, r.y + 46).setAlpha(0).setScale(0.25 + Math.random() * 0.3);
      const ms = 6000 + Math.random() * 4000;
      const sway = 8 + Math.random() * 10;
      this.tweens.add({ targets: flake, alpha: 0.8, duration: 700 });
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: ms,
        onUpdate: (tw) => {
          const u = tw.getValue() ?? 0;
          flake.setPosition(x0 + Math.sin(u * Math.PI * 4) * sway, r.y + 46 + u * (r.height - 96));
          if (u > 0.88) flake.setAlpha(0.8 * (1 - (u - 0.88) / 0.12)); // melts into the drift
        },
        onComplete: () => this.time.delayedCall(300 + Math.random() * 1500, fall),
      });
    };
    this.time.delayedCall(delay, fall);
  }

  /** Dungeon dust: a faint grey speck drifting slantwise through the torchlight. */
  private spawnDust(side: "left" | "right", delay: number) {
    const m = this.add.image(0, 0, "spark").setTint(0x8a8698).setAlpha(0).setScale(0.2);
    const drift = () => {
      if (!m.active) return;
      const p = this.panelPoint(side);
      m.setPosition(p.x, p.y).setAlpha(0);
      const ms = 5000 + Math.random() * 4000;
      this.tweens.add({ targets: m, alpha: { from: 0, to: 0.4 }, duration: ms * 0.4, yoyo: true, hold: ms * 0.2 });
      this.tweens.add({
        targets: m,
        x: m.x + (Math.random() * 40 - 20),
        y: m.y + 24 + Math.random() * 30, // dust settles, slowly
        duration: ms,
        ease: "Sine.easeInOut",
        onComplete: () => this.time.delayedCall(400 + Math.random() * 1600, drift),
      });
    };
    this.time.delayedCall(delay, drift);
  }

  /** A stray ember: rises out of the rubble cracks, gutters, and dies. */
  private spawnEmber(side: "left" | "right", delay: number) {
    const e = this.add.image(0, 0, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(0xff9040).setAlpha(0).setScale(0.28);
    const rise = () => {
      if (!e.active) return;
      const r = side === "left" ? this.panelRectL : this.panelRectR;
      e.setPosition(r.x + 10 + Math.random() * Math.max(1, r.width - 20), r.bottom - 30).setAlpha(0);
      const ms = 2600 + Math.random() * 2200;
      this.tweens.add({ targets: e, alpha: { from: 0, to: 0.85 }, duration: ms * 0.3, yoyo: true, hold: ms * 0.15 });
      this.tweens.add({
        targets: e,
        y: e.y - 40 - Math.random() * 50,
        x: e.x + (Math.random() * 24 - 12),
        duration: ms,
        ease: "Sine.easeOut",
        onComplete: () => this.time.delayedCall(600 + Math.random() * 2600, rise),
      });
    };
    this.time.delayedCall(delay, rise);
  }

  /** A frost twinkle: a cold star that flares somewhere new each breath. */
  private spawnTwinkle(side: "left" | "right") {
    const t = this.add.image(0, 0, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(0xcfe8ff).setAlpha(0).setScale(0.3);
    const glint = () => {
      if (!t.active) return;
      const p = this.panelPoint(side);
      t.setPosition(p.x, p.y).setAlpha(0).setScale(0.25);
      this.tweens.add({
        targets: t,
        alpha: { from: 0, to: 0.9 },
        scale: { from: 0.25, to: 0.55 },
        duration: 500 + Math.random() * 400,
        yoyo: true,
        ease: "Sine.easeInOut",
        onComplete: () => this.time.delayedCall(600 + Math.random() * 2600, glint),
      });
    };
    this.time.delayedCall(Math.random() * 2000, glint);
  }

  /** A firefly: additive glow, breathing pulse, slow aimless drift. */
  private spawnFirefly(side: "left" | "right") {
    const p0 = this.panelPoint(side);
    const f = this.add.image(p0.x, p0.y, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(0xd8ff9a).setScale(0.5).setAlpha(0.2);
    this.tweens.add({
      targets: f,
      alpha: { from: 0.15, to: 0.9 },
      scale: { from: 0.4, to: 0.62 },
      duration: 700 + Math.random() * 500,
      yoyo: true,
      repeat: -1,
      hold: Math.random() * 400,
    });
    const wander = () => {
      if (!f.active) return;
      const p = this.panelPoint(side);
      this.tweens.add({
        targets: f,
        x: p.x,
        y: p.y,
        duration: 2600 + Math.random() * 2600,
        ease: "Sine.easeInOut",
        onComplete: () => this.time.delayedCall(200 + Math.random() * 1400, wander),
      });
    };
    wander();
  }

  /** A spectral sword, point-up: the projectile sword matches send at the foe. */
  private buildBladeArt() {
    if (this.textures.exists("blade-spect")) return;
    const cv = document.createElement("canvas");
    cv.width = 18;
    cv.height = 48;
    const g = cv.getContext("2d")!;
    // blade: elongated diamond, steel core with a white-hot edge
    g.beginPath();
    g.moveTo(9, 0); // tip
    g.lineTo(13, 30);
    g.lineTo(9, 34);
    g.lineTo(5, 30);
    g.closePath();
    const grad = g.createLinearGradient(0, 0, 0, 34);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.5, "#cfe4ff");
    grad.addColorStop(1, "#8fb4e0");
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 1.4;
    g.stroke();
    // crossguard + grip
    g.fillStyle = "#e8f2ff";
    g.fillRect(2, 33, 14, 4);
    g.fillStyle = "#a8c4e8";
    g.fillRect(7, 37, 4, 9);
    this.textures.addCanvas("blade-spect", cv);
  }

  /** A light red wash with stronger edges, fitted only to the visible combat panel. */
  private buildVignetteArt() {
    if (this.textures.exists("lane-peril")) return;
    const S = 256;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const g = cv.getContext("2d")!;
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.62);
    gr.addColorStop(0, "rgba(230,48,58,0.18)");
    gr.addColorStop(0.55, "rgba(230,48,58,0.3)");
    gr.addColorStop(0.85, "rgba(211,34,46,0.72)");
    gr.addColorStop(1, "rgba(170,22,36,0.95)");
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    this.textures.addCanvas("lane-peril", cv)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  /** Bake the chest + blast textures once: pixel chest (closed/open), god rays, coin, spark, orb. */
  private buildChestArt() {
    if (this.textures.exists("chest-closed")) return;

    const chest = (open: boolean) => {
      const cv = document.createElement("canvas");
      cv.width = 48;
      cv.height = 40;
      const g = cv.getContext("2d")!;
      const px = (x: number, y: number, w: number, h: number, c: string) => {
        g.fillStyle = c;
        g.fillRect(x, y, w, h);
      };
      if (open) {
        px(5, 0, 38, 10, "#3a2212"); // lid thrown back — we see its underside
        px(5, 0, 38, 2, "#57341d");
        px(7, 2, 34, 2, "#241207");
        px(4, 10, 40, 8, "#120a05"); // open mouth
        px(6, 14, 36, 4, "#f2cd6f"); // gold heaped inside
        px(8, 12, 10, 2, "#fff3c0"); // glint on the hoard
        px(26, 13, 8, 2, "#e8b84f");
      } else {
        px(3, 4, 42, 12, "#7c4a28"); // domed lid
        px(5, 2, 38, 3, "#9c6436");
        px(3, 13, 42, 3, "#57341d"); // lid lip
      }
      px(3, open ? 18 : 16, 42, open ? 18 : 20, "#6b4023"); // body
      px(3, 33, 42, 3, "#4a2a15"); // ground shadow edge
      px(16, open ? 20 : 18, 1, 13, "#57341d"); // plank seams
      px(31, open ? 20 : 18, 1, 13, "#57341d");
      for (const sx of [7, 36]) {
        px(sx, open ? 10 : 4, 5, open ? 26 : 32, "#d9a441"); // gold straps
        px(sx, open ? 10 : 4, 2, open ? 26 : 32, "#f2cd6f");
        px(sx + 1, 30, 2, 2, "#8a6420"); // rivet
      }
      px(20, open ? 19 : 14, 8, 10, "#e8b84f"); // lock plate
      px(21, open ? 20 : 15, 6, 8, "#d9a441");
      px(23, open ? 22 : 17, 2, 3, "#241207"); // keyhole
      px(23, open ? 24 : 19, 2, 3, "#3a2212");
      this.textures.addCanvas(open ? "chest-open" : "chest-closed", cv);
    };
    chest(false);
    chest(true);

    // starburst god rays — alternating fat/thin wedges, alpha falling off radially
    const rays = document.createElement("canvas");
    rays.width = rays.height = 256;
    const rg = rays.getContext("2d")!;
    rg.fillStyle = "#fff6d0";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + (i % 2 ? 0.09 : 0);
      const hw = i % 2 ? 0.075 : 0.115;
      rg.beginPath();
      rg.moveTo(128, 128);
      rg.lineTo(128 + Math.cos(a - hw) * 128, 128 + Math.sin(a - hw) * 128);
      rg.lineTo(128 + Math.cos(a + hw) * 128, 128 + Math.sin(a + hw) * 128);
      rg.closePath();
      rg.fill();
    }
    const grad = rg.createRadialGradient(128, 128, 10, 128, 128, 128);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.75)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    rg.globalCompositeOperation = "destination-in";
    rg.fillStyle = grad;
    rg.fillRect(0, 0, 256, 256);
    this.textures.addCanvas("godray", rays);

    // coin / spark / orb sprites for the eruption + reveals
    const disc = (size: number, key: string, paint: (g: CanvasRenderingContext2D) => void) => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = size;
      paint(cv.getContext("2d")!);
      this.textures.addCanvas(key, cv);
    };
    disc(12, "coin", (g) => {
      g.fillStyle = "#b8862e";
      g.beginPath();
      g.arc(6, 6, 5.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#f2c14e";
      g.beginPath();
      g.arc(6, 6, 4.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff3c0";
      g.fillRect(3, 3, 2, 2); // glint
    });
    disc(16, "spark", (g) => {
      const gr = g.createRadialGradient(8, 8, 0, 8, 8, 8);
      gr.addColorStop(0, "rgba(255,250,230,1)");
      gr.addColorStop(1, "rgba(255,250,230,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 16, 16);
    });
    disc(32, "orb", (g) => {
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, "rgba(255,251,232,1)");
      gr.addColorStop(0.45, "rgba(242,193,78,0.85)");
      gr.addColorStop(1, "rgba(242,193,78,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 32, 32);
    });
    // spell bolt: near-white core so a runtime tint decides the school
    // (fire orange for staff matches, storm blue for the Stormcall Scroll)
    disc(28, "bolt", (g) => {
      const gr = g.createRadialGradient(14, 14, 0, 14, 14, 14);
      gr.addColorStop(0, "rgba(255,255,250,1)");
      gr.addColorStop(0.4, "rgba(255,235,200,0.95)");
      gr.addColorStop(0.75, "rgba(255,220,170,0.45)");
      gr.addColorStop(1, "rgba(255,220,170,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 28, 28);
    });
  }

  /** Break the complete tile face apart, with its short material accent on top. */
  private shatter(t: Phaser.GameObjects.Container, type: number): Promise<void> {
    this.tweens.killTweensOf(tileVisual(t));
    if (tileEffectsEnabled()) {
      this.tileShatter.burst(this.puzzleBox, t.x, t.y, type);
      tileClearBurst(this, this.puzzleBox, t.x, t.y, type);
      t.destroy();
      return new Promise((res) => this.time.delayedCall(90, res));
    }
    return new Promise((res) => this.tweens.add({ targets: t, alpha: 0,
      duration: 90, ease: "Quad.easeOut",
      onComplete: () => { t.destroy(); res(); } }));
  }
  private async collapse() {
    const anims: Promise<void>[] = [];
    for (let c = 0; c < this.boardCols; c++) {
      // Ice holds its tile until thawed. Refill each side of it independently.
      const barriers = [-1, ...Array.from({length:this.boardRows},(_,r)=>r)
        .filter(r => this.grid[r][c] !== EMPTY && this.isIceLocked({r,c})), this.boardRows];
      for (let part = 0; part < barriers.length - 1; part++) {
        const top = barriers[part] + 1, bottom = barriers[part+1] - 1;
        let write = bottom;
        for (let r = bottom; r >= top; r--) {
          const t = this.tiles[r][c];
          if (!t) continue;
          if (write !== r) {
            this.grid[write][c] = this.grid[r][c];
            this.grid[r][c] = EMPTY;
            this.tiles[write][c] = t;
            this.tiles[r][c] = null;
            anims.push(this.moveTo(t, write, c));
          }
          write--;
        }
        const spawned = write - top + 1;
        for (let r = write; r >= top; r--) {
          const type = randomType();
          this.grid[r][c] = type;
          const t = this.makeTile(r, c, type);
          t.y = this.yFor(top === 0 ? r - spawned : top);
          if (top > 0) t.setAlpha(0);
          this.tiles[r][c] = t;
          anims.push(this.moveTo(t, r, c));
        }
      }
    }
    await Promise.all(anims);
  }
  private rebuildBoard() {
    this.clearSelection();
    this.syncEmpoweredCell();
    const oldGrid=this.grid;
    this.empoweredTiles.clear();
    for (let r = 0; r < this.boardRows; r++)
      for (let c = 0; c < this.boardCols; c++) {
        this.tiles[r][c]?.destroy();
        this.tiles[r][c] = null;
      }
    this.grid = makeInitialGrid(Math.random, this.boardCols, this.boardRows);
    reflowEmpowered(this.empowered,oldGrid,this.grid);
    for (let r = 0; r < this.boardRows; r++)
      for (let c = 0; c < this.boardCols; c++) this.tiles[r][c] = this.makeTile(r, c, this.grid[r][c]);
    reflowIce(this.run.biome, this.run.zone!, this.grid);
  }
}

// Text uploads inherit the renderer's pixel-art filtering on EVERY update,
// including setText, setFontSize and setResolution. Restore linear filtering
// after uploading so scaled glyphs keep their antialiased edges.
const updateText = Phaser.GameObjects.Text.prototype.updateText;
Phaser.GameObjects.Text.prototype.updateText = function () {
  const result = updateText.call(this);
  this.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return result;
};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  // The page supplies the dark backdrop. Transparency lets the pause menu's
  // canvas sit above the DOM caravan without replacing it with the legacy camp.
  transparent: true,
  pixelArt: true,
  // RESIZE: canvas fills the #game element (100vw x 100vh); the scene re-lays-out on resize
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [TitleScene, CampScene, GameScene, MenuScene], // boot: title -> camp; DEPART starts the run, death returns; menu overlays camp/run
});

// pixelArt: true is right for the sprites but forces nearest-neighbour onto
// TEXT glyph textures too — any scaled text (centre column, floating chips,
// the title) renders jagged. Patch the factory so every Text object created
// anywhere gets linear filtering; the sprites keep their crunch.
const textFactory = Phaser.GameObjects.GameObjectFactory.prototype.text;
Phaser.GameObjects.GameObjectFactory.prototype.text = function (
  this: Phaser.GameObjects.GameObjectFactory,
  ...args: Parameters<typeof textFactory>
) {
  const t = textFactory.apply(this, args);
  t.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  // Phaser Text defaults to a 1× backing canvas. Real phones commonly render at
  // 2–3× DPR, so without this the browser enlarges a low-resolution glyph atlas.
  t.setResolution(Math.min(Math.max(window.devicePixelRatio || 1, 1), 2));
  return t;
};

// Master volume, once, for the whole session — every scene mixes under the same
// ceiling. (Setting this inside a scene made loudness depend on scene history.)
game.sound.volume = 0.7;

// Keep the audio alive when the window merely loses FOCUS (second monitor,
// a notification stealing it): the game stays visible and keeps running, so
// silent-but-scrolling reads as "the sound randomly cut out". Page-hidden
// still pauses everything as normal.
game.sound.pauseOnBlur = false;

// Audio watchdog: corporate browsers (Edge/Chrome efficiency modes, sleeping
// tabs) and Bluetooth headset profile flips can suspend the AudioContext
// mid-session and never hand it back — sound vanishes for stretches until
// something forces a resume. Nudge it awake on every user signal plus a slow
// heartbeat. Harmless where the context is healthy or HTML5 audio is in use.
const nudgeAudio = () => {
  const ctx = (game.sound as unknown as { context?: AudioContext }).context;
  if (ctx && ctx.state !== "running") void ctx.resume().catch(() => undefined);
};
window.addEventListener("focus", nudgeAudio);
document.addEventListener("visibilitychange", nudgeAudio);
window.addEventListener("pointerdown", nudgeAudio, { passive: true });
window.setInterval(nudgeAudio, 5000);

// Mobile browsers resize the visible viewport when the toolbar shows/hides (and on
// rotate) without always firing a plain "resize"; re-fit the canvas on those too.
const refit = () => {
  const host = document.getElementById("game")!;
  const width = Math.round(host.clientWidth);
  const height = Math.round(host.clientHeight);
  if (width && height && (game.scale.width !== width || game.scale.height !== height)) {
    game.scale.resize(width, height);
  }
};
new ResizeObserver(refit).observe(document.getElementById("game")!);
window.addEventListener("resize", refit);
window.visualViewport?.addEventListener("resize", () => {
  refit();
});
window.addEventListener("orientationchange", () =>
  setTimeout(() => {
    refit();
  }, 120),
);

game.events.once(Phaser.Core.Events.DESTROY, initHaptics());

// Dev-only handle for debugging; stripped from production builds.
if (import.meta.env.DEV) (globalThis as unknown as { __mbGame: Phaser.Game }).__mbGame = game;
