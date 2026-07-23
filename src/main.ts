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
import {
  W,
  H,
  TYPES,
  EMPTY,
  type Coord,
  makeInitialGrid,
  randomType,
  findMatches,
  findHint,
  swap,
  hasPossibleMove,
} from "./board";
import {
  type RunState,
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
  drinkPotion,
  enemyStrike,
  spawnNext,
  scroll,
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
  rollItem,
  rollChestPulls,
  TIER_COLORS,
  STORMCALL_DMG,
  WARHORN_SECS,
  WAYSTONE_SECS,
  BULWARK_BLOCK,
  BURN_DPS,
  BURN_SECS,
  SPURS_STRIKE_MS,
  HEARTH_PRESSURE,
  LEDGER_SECS,
  WHETSTONE_CHARGES,
  PAN_EXTRA_PULLS,
  SAPPER_RADIUS,
} from "./items";
import { CampScene } from "./camp";
import { MenuScene } from "./menu";
import { TitleScene } from "./title";
import { sfxV, ambV, musicV, audioSettings, setAudioSettings, setSoundLevel } from "./audio";
import { type MetaState, loadMeta, saveMeta, bankRun, questById, questProgress, forgeCap } from "./meta";
import { Tutorial } from "./tutorial";

// ---- layout ---------------------------------------------------------------
// The centre column (runner lane over the match board) is authored in these fixed
// "design" coordinates and lives inside `centerBox`, which layout() scales + centres
// to the live viewport. Side panels (resources / item slots) fill the leftover width,
// so the game fills any landscape screen — phone or desktop — with no letterboxing.
const TILE = 92;
const GRID_W = W * TILE; // 10*92 = 920
const GRID_H = H * TILE; // 5*92 = 460
const PADIN = 12; // inner padding of the centre column
// Keep the runner as a shallow cinematic strip so the puzzle owns most of a
// landscape phone. The whole centre can then scale up without stretching tiles.
const LANE_H = 160; // compact, but tall enough for the combat silhouettes to breathe
const GRID_GAP = 14; // gap between lane and board

const LANE_Y = PADIN;
const GRID_X = PADIN; // board / lane left inset (design-local)
const GRID_Y = LANE_Y + LANE_H + GRID_GAP; // board top (design-local)
const CENTER_DW = GRID_W + PADIN * 2; // 944 — centre-column design width
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
const FLOOR_H = 32; // grassy ground band the characters stand on
const GROUND_Y = LANE_Y + LANE_H - FLOOR_H; // feet / floor-surface line
// Foot fraction measured from each sheet (lowest opaque pixel) so they sit on the ground.
const HERO_ORIGIN = 0.734; // WarriorMan feet at y47/64
const SLIME_ORIGIN = 0.656; // slime base at y41/64
const SKULL_X = PADIN + 28; // death marker at the far left of the lane
const SAFE_X = PADIN + 430; // hero x at pressure 0 — a longer runway to the skull reads as more starting health
const ENGAGE_GAP = 160; // combat spacing inside the compact runner strip
const ENTER_X = CENTER_DW + 80; // enemies walk in from off the right
const HERO_SCALE = 2.7;
const SLIME_SCALE = 2.7;
// boss: the Cindermage (Evil Wizard pack, CC0) — 150x150 frames, feet at y101, faces right natively
const BOSS_SCALE = 1.25;
const BOSS_ORIGIN = 0.675;
const BOSS_ENGAGE_GAP = 220; // the robe and fire breath still need a wider stance
const BOSS_NAME = "MALGRIM THE CINDERMAGE";
// ---- Malgrim's Infernal Shell Game (the boss is a MODE BREAK) ---------------
// The scroll stops, the board retracts, burning portals rise in its place and
// Malgrim hides among decoys. Tap the REAL one (cyan staff glint) before he
// casts; each correct hit cracks one of his three wards. Decoy taps / timeouts
// fire a fireball — guard charges from the puzzle phase absorb them.
// Three wards, and every ward is its own mechanic:
//   I  FIND HIM         — spot the cyan glint among red decoys (reaction)
//   II TRACK HIM        — he glints, then everyone cloaks and SHUFFLES (tracking)
//   III RETURN HIS FIRE — fireball tennis. He takes the far court and serves
//                         with a shrinking timing ring; tap as the ball meets
//                         your guard to reflect it into him. Rallies speed up,
//                         he fakes wind-ups, and the VIOLET ball is a lie — it
//                         passes harmlessly unless you swing at it. Three
//                         returns break the final ward.
// Wards I/II: his cast is a visible ember bar; a hit in its RED tail
// (ARENA_CRIT_FRAC) shatters the whole ward at once — the daring end early.
// Ward III entries: castMs = the serve's FLIGHT time; fake/pair are chances.
type ArenaDeal = { portals: number; decoys: number; castMs: number; hops: number; swaps: number; fake?: number; pair?: number };
const ARENA_WARDS: { title: string; sub: string; taunt: string; deals: ArenaDeal[] }[] = [
  {
    title: "WARD I — FIND HIM",
    sub: "the REAL Cindermage glints cyan — tap him before his cast fills",
    taunt: "“Amusing, scout. Again!”",
    deals: [
      { portals: 4, decoys: 2, castMs: 2600, hops: 0, swaps: 0 },
      { portals: 5, decoys: 3, castMs: 2200, hops: 0, swaps: 0 },
    ],
  },
  {
    title: "WARD II — TRACK HIM",
    sub: "watch the glint… then follow him through the shuffle",
    taunt: "“Your eyes betray you!”",
    deals: [
      { portals: 6, decoys: 3, castMs: 2100, hops: 0, swaps: 2 },
      { portals: 6, decoys: 4, castMs: 1800, hops: 0, swaps: 3 },
    ],
  },
  {
    title: "WARD III — RETURN HIS FIRE",
    sub: "tap as his fire meets your guard — and NEVER swing at the violet",
    taunt: "“BURN WITH ME!”",
    deals: [
      { portals: 0, decoys: 0, castMs: 1350, hops: 0, swaps: 0, fake: 0, pair: 0 },
      { portals: 0, decoys: 0, castMs: 1100, hops: 0, swaps: 0, fake: 0.5, pair: 0 },
      { portals: 0, decoys: 0, castMs: 950, hops: 0, swaps: 0, fake: 0.25, pair: 0.65 },
    ],
  },
];
const ARENA_TOTAL_DEALS = ARENA_WARDS.reduce((s, w) => s + w.deals.length, 0);
const ARENA_CRIT_FRAC = 0.68; // cast fraction where the bar burns red — hits here break the whole ward
const ARENA_FIREBALL_MS = 420; // his punishment bolt's flight time
// fireball tennis timing (ward III)
const TENNIS_EARLY_MS = 140; // the tap window opens this early before the ball meets the guard
const TENNIS_LATE_MS = 110; // ...and forgives this much lateness
const TENNIS_WHIFF_LOCK_MS = 380; // a swing at nothing leaves you open — mashing loses
const TENNIS_PAIR_STAGGER_MS = 280; // the violet lie leads, the true fire follows
const RAIN_CHANCE = 0.35; // some runs the sky weeps — ambience swaps + rain streaks
const DEATH_BODY_LEFT = 27; // px the flat death pose extends left of the sprite x (measured in warrior.png); used to keep the corpse on-lane
const HP_W = 70;

// ---- runner tuning (safe to tweak / turn into upgrades later) --------------
const SCROLL_PER_SEC = 0.02; // pressure gained per second while engaged
const STRIKE_MS = 4800; // enemy strike cadence
// spell casts (staff matches): the bolt leaves the staff partway into the cast,
// flies, and everything downstream (damage number, hurt, death) lands on impact
const CAST_LEAD_MS = 320;
const BOLT_FLIGHT_MS = 340;
// board<->lane stitching: matches launch FROM the tiles, the fight answers back
// ONTO the board — so the runner is felt even when the eye never leaves the puzzle
const STRIKE_TELE_MS = 700; // dread creeps over the board this long before a strike
const BLADE_FLIGHT_MS = 360; // spectral blades: matched sword tiles -> the foe
const VIGNETTE_FROM = 0.45; // pressure where the red edge-glow starts bleeding in
const VIGNETTE_MAX = 0.34; // its ceiling alpha at pressure 1 (heartbeat rides on top)
const SPELL_BURN_SECS = 6; // a Pyroclasm (5-match) leaves the foe burning this long
const WALK_IN_MS = 850; // time for a new enemy to march into range
const TILE_SFX = 17; // number of tile-match sound variations (tile1..tileN)
const FACE = TILE - 8; // 84px tile face — sliced into chaotic shards on a match
const SHARD_PATTERNS = 3; // pre-baked crack patterns per tile type (variety)
const WORLD_SCROLL = 170; // px/sec the world pans while the hero is running
const FLOOR_SCALE = 1.6; // show the grass chunk chunky so the blades read like the reference
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
};

// ---- ironbound relic tiles (logical order mirrors board.ts / run.ts) -------
// Each source is an exact 84×84 composite face. The same texture is rendered on
// the board and copied into the crack canvases, so matched shards keep the art.
const TILE_ART = [
  { key: "tile-sword", file: "tiles/sword.png" },
  { key: "tile-staff", file: "tiles/staff.png" },
  { key: "tile-shield", file: "tiles/shield.png" },
  { key: "tile-key", file: "tiles/key.png" },
  { key: "tile-treasure", file: "tiles/treasure.png" },
  { key: "tile-wood", file: "tiles/wood.png" },
  { key: "tile-ore", file: "tiles/ore.png" },
] as const;
// The potion face is composited at runtime from the treasure tile's ironbound
// frame (buildPotionArt) — swap for a real tiles/potion.png when one is drawn.
const POTION_ART_KEY = "tile-potion";
const tileArtKey = (type: number) => (type === POTION ? POTION_ART_KEY : TILE_ART[type].key);
const TILE_SHINE_KEY = "tile-shine";
const TILE_SHINE_ANIM = "tile-shine-sweep";
const TILE_SHINE_FRAMES = 11; // empty bookends + 9-frame diagonal glint
// Text-FIRST so iOS Safari draws real digit/letter glyphs; emoji fall back per-glyph to
// the system emoji font. (Leading with an emoji font garbles ASCII digits on iPhone.)
const EMOJI_FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// --- haptics ---------------------------------------------------------------
// navigator.vibrate covers Android & most browsers. iOS Safari has NO Vibration
// API, but (17.4+) fires a light haptic when an <input switch> toggles, so we
// keep a hidden one and click it as a fallback. Native-app haptics (Capacitor)
// would be the reliable iPhone route later.
let hapticSwitch: HTMLElement | null = null;
function initHaptics() {
  if (hapticSwitch || typeof document === "undefined") return;
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;opacity:0;pointer-events:none;overflow:hidden";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", ""); // Safari 17.4+ switch control
  label.appendChild(input);
  document.body.appendChild(label);
  hapticSwitch = label;
}
function buzz(ms = 14) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms);
  else hapticSwitch?.click(); // iOS 17.4+ fallback (fixed light tap)
}

class GameScene extends Phaser.Scene {
  // board
  private grid: number[][] = [];
  private tiles: (Phaser.GameObjects.Container | null)[][] = [];
  private frags: { o: Phaser.GameObjects.Image; vx: number; vy: number; vr: number; life: number }[] = []; // falling tile pieces
  private shardSets: Record<number, { key: string; cx: number; cy: number }[][]> = {}; // pre-baked crack shards per type
  private busy = false;
  private down: { coord: Coord; x: number; y: number } | null = null;

  // runner
  private run!: RunState;
  private phase: "advance" | "fight" | "chest" | "arena" = "advance"; // arena = boss shell game (no scroll/strikes/pan)
  private parallax: { sprite: Phaser.GameObjects.TileSprite; scroll: number }[] = [];
  private world: RunBiome = RUN_BIOMES.plains; // backdrop set for the current biome
  private floor!: Phaser.GameObjects.TileSprite;
  private hero!: Phaser.GameObjects.Sprite;
  private orc: Phaser.GameObjects.Sprite | null = null;
  private orcAnim = "orc"; // anim-key prefix of the current foe (orc / orc2 / orc3 / boss)
  private orcDefense: Defense = "none"; // the current foe's armor school (badge + callouts)
  private defenseTaught = false; // first resisted/weak hit per foe shows a callout
  private defBadge!: Phaser.GameObjects.Text; // 🛡⚔ / 🛡🪄 beside the HP bar

  // Malgrim's Infernal Shell Game (boss arena — see ARENA_WARDS)
  private arenaActive = false;
  private arenaGen = 0; // generation counter: stale arena timers bail out
  private arenaObjs: Phaser.GameObjects.GameObject[] = []; // live portal/figure props
  private arenaWard = 0; // which ward we're breaking (0..2)
  private arenaDealIdx = 0; // which deal within the ward
  private arenaDealsDone = 0; // drives the boss bar drain (out of ARENA_TOTAL_DEALS)
  private arenaWardMissed = false; // a flawless ward refunds a guard charge
  private orcGap = ENGAGE_GAP; // engage distance for the current foe (wider for the boss)
  private orcDying = false;
  private bossBar: { root: Phaser.GameObjects.Container; fill: Phaser.GameObjects.Rectangle } | null = null;
  private rainy = false; // rolled per run: rain ambience + streaks over the lane
  private amb: Phaser.Sound.BaseSound | null = null; // looping forest bed under the run
  private music: Phaser.Sound.BaseSound | null = null; // the run's song (journey on the road, war-drums at the boss)
  private musicBase = 0; // current track's design volume — audio-changed re-levels against it
  private heroLockX = false; // freeze hero x while a killing swing lands, then surge
  private enemyHpBar!: Phaser.GameObjects.Rectangle;
  private enemyHpBg!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private resIcons: Phaser.GameObjects.Text[] = []; // 🪵 🪨 💎 🔑 icons (left panel)
  private resVals: Phaser.GameObjects.Text[] = []; // matching counts, positioned tight to each icon
  private overShown = false;
  private runCompleteShown = false; // the second boss fell — victory banner up
  private lastScoreShown = 0; // pulse the SCORE readout only when it climbs

  // responsive shell: the lane + board live in centerBox (design coords), scaled to
  // fit the viewport; the side panels flank it and absorb the leftover width.
  private centerBox!: Phaser.GameObjects.Container;
  private centerScale = 1;
  private leftPanel!: Phaser.GameObjects.Rectangle;
  private rightPanel!: Phaser.GameObjects.Rectangle;
  private gearText!: Phaser.GameObjects.Text;
  private menuBtn!: Phaser.GameObjects.Text; // ☰ opens the pause menu (Esc works too)
  private hintBtn!: Phaser.GameObjects.Text; // 💡 lights up a valid swap on the board
  private hintObjs: Phaser.GameObjects.GameObject[] = []; // active hint rings (cleared on next move)
  private rotateHint!: Phaser.GameObjects.Text;

  // chests
  private chest: Phaser.GameObjects.Container | null = null; // the lane chest (body + key tag)
  private chestActive = false; // takeover sequence running — board input is frozen
  private chestFast = false; // the skip ▸ button shortens every remaining beat
  private sinceChest = 0; // kills since the last chest
  private chestsOpened = 0; // opened this run (banked into meta quest stats on death)
  private meta!: MetaState; // snapshot at run start — drives the in-run quest HUD
  private questText!: Phaser.GameObjects.Text;
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
  private inkActive = false; // Cartographer's Ink: road forecast on for the rest of the run
  private bossChestNext = false; // the chest rolling in is the boss hoard (richer item table)
  private targeting: { def: ItemDef; slot: ItemSlotUI } | null = null;
  private targetObjs: Phaser.GameObjects.GameObject[] = []; // banner + board ring while aiming
  private tip: Phaser.GameObjects.Container | null = null; // shared tooltip panel (screen-space)
  private tipFor: number = -1; // slot index the tooltip is showing for
  private holdTimer: Phaser.Time.TimerEvent | null = null; // touch press-and-hold -> tooltip
  private holdShown = false; // this press already showed the tooltip -> release must not use
  private buffText!: Phaser.GameObjects.Text; // live item-buff readout (left panel)
  private buffStr = ""; // last rendered buff line (skip redundant setText)

  // ---- peril feedback: the fight reaching the player's peripheral vision ----
  private vignette: Phaser.GameObjects.Image | null = null; // full-viewport red edge-glow
  private vignetteA = 0; // eased alpha (lerps toward the pressure-driven target)
  private heartPhase = 0; // heartbeat accumulator — beats faster as the skull nears
  private laneGuard!: Phaser.GameObjects.Container; // in-lane 🛡️×N badge (top-left)
  private laneGuardText!: Phaser.GameObjects.Text;
  private laneGuardLast = -1; // last shown count — drives the gain-bounce / spend-flash

  constructor() {
    super("game");
  }

  preload() {
    // CampScene boots first and shares several keys (hero, parallax, floor) —
    // guard every load so re-entering the run never re-queues existing assets.
    const sheet = (key: string, file: string, fw: number, fh: number) => {
      if (!this.textures.exists(key)) this.load.spritesheet(key, `sprites/${file}`, { frameWidth: fw, frameHeight: fh });
    };
    // hero: WarriorMan — one 10x3 sheet of 80x64 frames (row0 idle, row1 attack)
    sheet("warrior", "warrior.png", 80, 64);
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
    // boss: the Cindermage (Evil Wizard pack, CC0) — every BOSS_EVERYth foe
    sheet("boss-idle", "boss_idle.png", 150, 150);
    sheet("boss-move", "boss_move.png", 150, 150);
    sheet("boss-attack", "boss_attack.png", 150, 150);
    sheet("boss-hurt", "boss_hurt.png", 150, 150);
    sheet("boss-death", "boss_death.png", 150, 150);
    // world backdrop for the current biome: parallax layers + floor atlas (meta.biome picks the set)
    this.world = RUN_BIOMES[loadMeta().biome] ?? RUN_BIOMES.plains;
    const img = (key: string, file: string) => {
      if (!this.textures.exists(key)) this.load.image(key, file);
    };
    for (const tile of TILE_ART) img(tile.key, tile.file);
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
      // music (xDeviruchi, CC-BY): the road's song + the boss's war-drums
      music_journey: "music_journey.mp3", music_boss: "music_boss.mp3",
    };
    for (const [k, f] of Object.entries(audio)) if (!this.cache.audio.exists(k)) this.load.audio(k, `sounds/${f}`);
    for (let i = 1; i <= TILE_SFX; i++)
      if (!this.cache.audio.exists(`tile${i}`)) this.load.audio(`tile${i}`, `sounds/tile${i}.wav`); // random tile-match sfx
  }

  create() {
    this.meta = loadMeta();
    this.run = newRun(this.meta.swordLevel, forgeCap(this.meta.biome)); // forge levels bite all run; at the zone cap the blade sunders
    this.chestsOpened = 0;
    this.busy = false;
    this.down = null;
    this.orc = null;
    this.orcDying = false;
    this.orcGap = ENGAGE_GAP;
    this.bossBar = null;
    this.rainy = Math.random() < RAIN_CHANCE;
    this.heroLockX = false;
    this.overShown = false;
    this.runCompleteShown = false;
    this.lastScoreShown = 0;
    this.phase = "advance";
    this.parallax = [];
    this.frags = [];
    this.chest = null;
    this.chestActive = false;
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
    this.inkActive = false;
    this.bossChestNext = false;
    this.targeting = null;
    this.targetObjs = [];
    this.hintObjs = [];
    this.arenaActive = false;
    this.arenaGen++;
    this.arenaObjs = [];
    this.arenaWard = 0;
    this.arenaDealIdx = 0;
    this.arenaDealsDone = 0;
    this.arenaWardMissed = false;
    this.tip = null;
    this.tipFor = -1;
    this.holdTimer = null;
    this.holdShown = false;
    this.buffStr = "";
    this.buildPotionArt(); // before the filter pass + shard baking so it's a full citizen
    // The rest of the game keeps crisp nearest-neighbour sampling, but these
    // detailed composite faces need linear minification when the responsive
    // shell displays them below their native 84px size.
    for (const tile of TILE_ART) this.textures.get(tile.key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textures.get(POTION_ART_KEY).setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.buildTilePolish();
    this.buildTileFaces();
    this.buildChestArt();
    this.buildBladeArt();
    this.buildVignetteArt();
    this.vignette = null;
    this.vignetteA = 0;
    this.heartPhase = 0;

    // (master volume is set once at boot, below the game config — setting it
    // here made the first camp visit of a session 43% louder than everything
    // after it, since the global manager started at 1.0 until the first run)

    this.buildAnims();
    this.buildGrassGround();
    this.buildPanels();
    this.centerBox = this.add.container(0, 0);
    this.buildLane();
    this.buildBoard();
    this.buildInput();
    // danger vignette: screen-space (NOT the centre column) so it hugs the viewport edges
    this.vignette = this.add.image(0, 0, "vignette").setDepth(76).setAlpha(0);
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
    // the road's song under it all (the boss swaps in his own war-drums)
    this.music = null;
    this.playMusic("music_journey", 0.26, 1600);
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
      this.amb?.stop();
      this.amb = null;
      this.music?.stop();
      this.music = null;
    });

    // pause menu: Esc (desktop) or the ☰ chip (see buildPanels)
    this.input.keyboard?.on("keydown-ESC", () => this.openMenu());

    this.cameras.main.fadeIn(300, 5, 6, 10);
    // intro: the hero jogs in from off the left edge to meet the first foe.
    // Slow both approaches together so the hero's run reads at a natural pace.
    const INTRO_MS = 1550;
    this.spawnOrc(INTRO_MS);
    this.hero.setX(-30);
    this.heroLockX = true;
    this.hero.play("hero-walk", true);
    this.tweens.add({
      targets: this.hero,
      x: SAFE_X,
      duration: INTRO_MS - 40, // arrive just before the slime, so enterFight's idle looks right
      ease: "Sine.easeOut",
      onComplete: () => (this.heroLockX = false),
    });

    // strike cadence self-schedules so Scout's Spurs can stretch the interval mid-run;
    // each strike casts its dread over the board first (strikeTelegraph)
    const strikeLoop = () => {
      this.strike();
      const wait = this.spursActive ? SPURS_STRIKE_MS : STRIKE_MS;
      this.time.delayedCall(wait - STRIKE_TELE_MS, () => this.strikeTelegraph());
      this.time.delayedCall(wait, strikeLoop);
    };
    this.time.delayedCall(STRIKE_MS - STRIKE_TELE_MS, () => this.strikeTelegraph());
    this.time.delayedCall(STRIKE_MS, strikeLoop);
    this.time.addEvent({ delay: 270, loop: true, callback: () => this.footstep() }); // hero jog cadence

    // the Peddler's goods: items bought at camp arrive already packed in slots
    const stocked = this.meta.stockedItems ?? [];
    if (stocked.length) {
      this.meta.stockedItems = [];
      saveMeta(this.meta);
      this.time.delayedCall(900, () => {
        for (const id of stocked) {
          const def = itemById(id);
          if (def) this.fillSlot(def);
        }
        this.notice("the Peddler's goods ride with you", "#ffe08a");
      });
    }

    // first time into the puzzle: the guided tutorial runs over the live scene
    // (it gates strikes / scroll / board input itself; see src/tutorial.ts).
    // ?tutorial on the URL force-replays it — handy for testing on devices.
    const replay = new URLSearchParams(location.search).has("tutorial");
    if (!this.meta.tutorialSeen || replay) {
      this.tutorial = new Tutorial(this);
      this.tutorial.start();
    }

    if (import.meta.env.DEV) (globalThis as unknown as { __mb: GameScene }).__mb = this;
  }

  private buildAnims() {
    const mk = (key: string, tex: string, start: number, end: number, fps: number, repeat: number) => {
      if (this.anims.exists(key)) return;
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(tex, { start, end }), frameRate: fps, repeat });
    };
    // hero (WarriorMan full sheet 80x64, 16 cols x 25 rows) — official row order:
    // row0 Idle (0-7), row2 Walk (32-39), row3 Run (48-55). Attack combo rows:
    // row9 Attack (144-150), row10 Attack 2 (160-164), row11 Attack 3 (176-183),
    // row12 Spell (192-207, blue sword). NB: row4 is Jump, row6 Jump-Attack — not ground play.
    mk("hero-idle", "warrior", 0, 7, 8, -1);
    mk("hero-walk", "warrior", 48, 55, 15, -1);
    mk("hero-attack", "warrior", 144, 150, 18, 0);
    mk("hero-attack2", "warrior", 160, 164, 18, 0);
    mk("hero-attack3", "warrior", 176, 183, 18, 0);
    mk("hero-spell", "warrior", 192, 207, 18, 0);
    mk("hero-death", "warrior", 368, 374, 10, 0); // row 23 Death (plays on game over)
    // enemy slime — front-facing row 0 of each 64x64 sheet (keep orc-* keys)
    mk("orc-idle", "slime-idle", 0, 5, 6, -1);
    mk("orc-walk", "slime-walk", 0, 7, 10, -1);
    mk("orc-hurt", "slime-hurt", 0, 4, 12, 0);
    mk("orc-death", "slime-death", 0, 9, 12, 0);
    mk("orc-attack", "slime-walk", 0, 7, 12, 0); // slime lunges (reuse run)
    // variant anims mirror the orc-* frame layout (orc2 = blue slime, orc3 = dark slime)
    for (const [p, n] of [["orc2", "2"], ["orc3", "3"]] as const) {
      mk(`${p}-idle`, `slime${n}-idle`, 0, 5, 6, -1);
      mk(`${p}-walk`, `slime${n}-walk`, 0, 7, 10, -1);
      mk(`${p}-hurt`, `slime${n}-hurt`, 0, 4, 12, 0);
      mk(`${p}-death`, `slime${n}-death`, 0, 9, 12, 0);
      mk(`${p}-attack`, `slime${n}-walk`, 0, 7, 12, 0);
    }
    // boss anims plug into the same `${orcAnim}-*` key scheme the slimes use
    mk("boss-idle", "boss-idle", 0, 7, 8, -1);
    mk("boss-walk", "boss-move", 0, 7, 10, -1);
    mk("boss-attack", "boss-attack", 0, 7, 14, 0);
    mk("boss-hurt", "boss-hurt", 0, 3, 12, 0);
    mk("boss-death", "boss-death", 0, 4, 10, 0);
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
  private cellAt(x: number, y: number): Coord | null {
    const p = this.toLocal(x, y); // pointer is screen px; the board lives in the scaled centre column
    const c = Math.floor((p.x - GRID_X) / TILE);
    const r = Math.floor((p.y - GRID_Y) / TILE);
    if (c < 0 || c >= W || r < 0 || r >= H) return null;
    return { r, c };
  }
  private heroXForPressure() {
    return lerp(SAFE_X, SKULL_X, this.run.pressure);
  }
  private heroBaseAnim() {
    return this.phase === "fight" ? "hero-idle" : "hero-walk";
  }

  // --- responsive shell helpers ---
  /** Parent a game-world object into the scaled centre column. */
  private inBox<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.centerBox.add(o);
    return o;
  }
  /** screen px -> design-local. */
  private toLocal(sx: number, sy: number) {
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
    const vw = this.scale.width;
    const vh = this.scale.height;
    const ins = this.safeInsets(); // stay clear of the notch + home indicator
    const x0 = ins.l;
    const y0 = ins.t;
    const uw = Math.max(120, vw - ins.l - ins.r);
    const uh = Math.max(120, vh - ins.t - ins.b);
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    // Rails are sized for their contents, not used as buckets for spare width.
    // The resource rail gets extra room for quest and active-buff text.
    const leftW = Math.round(clamp(uw * 0.14, 160, 220));
    const rightW = Math.round(clamp(uw * 0.065, 72, 132));
    const availW = Math.max(80, uw - leftW - rightW);
    const s = Math.min(availW / CENTER_DW, uh / CENTER_DH);
    this.centerScale = s;
    const cw = CENTER_DW * s;
    const ch = CENTER_DH * s;
    const shellW = leftW + cw + rightW;
    const shellX = Math.round(x0 + (uw - shellW) / 2);
    const cx = Math.round(shellX + leftW);
    const cy = Math.round(y0 + (uh - ch) / 2);
    this.centerBox.setScale(s).setPosition(cx, cy);
    this.vignette?.setPosition(vw / 2, vh / 2).setDisplaySize(vw, vh);
    this.layoutPanels(shellX, y0, shellW, uh, cx, cw);
  }

  /** Left panel = resources / score / gear; right panel = the vertical item-slot rack. Always visible. */
  private layoutPanels(x0: number, y0: number, uw: number, uh: number, cx: number, cw: number) {
    const lLeft = x0;
    const lw = cx - x0; // left panel: usable-left -> centre-left
    const rLeft = cx + cw;
    const rw = x0 + uw - rLeft; // right panel: centre-right -> usable-right
    const midY = y0 + uh / 2;
    this.leftPanel.setPosition(lLeft + lw / 2, midY).setSize(lw - 8, uh - 8);
    this.rightPanel.setPosition(rLeft + rw / 2, midY).setSize(rw - 8, uh - 8);
    this.rotateHint.setPosition(x0 + uw / 2, y0 + 6).setVisible(uw < uh); // portrait hint; panels still show

    // resources: icon + number rows, positioned exactly so there's no emoji-spacing drift
    const padX = lLeft + 12;
    const rowH = Math.min(44, uh * 0.09);
    const topY = y0 + Math.max(26, uh * 0.11);
    for (let i = 0; i < this.resIcons.length; i++) {
      const y = Math.round(topY + i * rowH);
      this.resIcons[i].setPosition(padX, y);
      this.resVals[i].setPosition(padX + 35, y);
    }
    this.scoreText.setPosition(padX, Math.round(topY + this.resIcons.length * rowH + 16));
    this.questText.setPosition(padX, Math.round(topY + this.resIcons.length * rowH + 92));
    this.buffText.setPosition(padX, Math.round(topY + this.resIcons.length * rowH + 196));
    this.hintBtn.setPosition(padX, y0 + uh - 52);
    this.gearText.setPosition(padX, y0 + uh - 14);
    this.menuBtn.setPosition(x0 + uw - 10, y0 + 6);

    // right: item slots, vertical, centred
    const gap = 8;
    const slot = Math.max(24, Math.min(rw - 16, (uh * 0.92) / SLOT_N - gap));
    const totalH = SLOT_N * slot + (SLOT_N - 1) * gap;
    for (let i = 0; i < SLOT_N; i++) {
      const x = rLeft + rw / 2;
      const y = Math.round(y0 + (uh - totalH) / 2 + slot / 2 + i * (slot + gap));
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
    this.leftPanel = this.add.rectangle(0, 0, 10, 10, 0x14171f).setStrokeStyle(2, 0x2a2d38);
    this.rightPanel = this.add.rectangle(0, 0, 10, 10, 0x14171f).setStrokeStyle(2, 0x2a2d38);

    // resources: one icon + one number per row, positioned explicitly so spacing is exact
    const RES_GLYPHS = ["🪵", "🪨", "💎", "🔑"];
    this.resIcons = [];
    this.resVals = [];
    for (const g of RES_GLYPHS) {
      this.resIcons.push(this.add.text(0, 0, g, { fontFamily: EMOJI_FONT, fontSize: "26px" }).setOrigin(0, 0.5));
      this.resVals.push(
        this.add.text(0, 0, "0", { fontFamily: "monospace", fontStyle: "bold", fontSize: "24px", color: "#dfe3ea" }).setOrigin(0, 0.5),
      );
    }
    this.scoreText = this.add
      .text(0, 0, "", { fontFamily: "monospace", fontSize: "15px", color: "#ffe08a", lineSpacing: 8 })
      .setOrigin(0, 0);
    this.questText = this.add
      .text(0, 0, "", { fontFamily: "monospace", fontSize: "12px", color: "#a9c8a9", lineSpacing: 7 })
      .setOrigin(0, 0);
    this.menuBtn = this.add
      .text(0, 0, "☰", { fontFamily: "monospace", fontStyle: "bold", fontSize: "24px", color: "#c7ccd6", stroke: "#0a0b0f", strokeThickness: 4 })
      .setOrigin(1, 0)
      .setDepth(80)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.openMenu());
    this.hintBtn = this.add
      .text(0, 0, "💡 hint", { fontFamily: EMOJI_FONT, fontStyle: "bold", fontSize: "15px", color: "#1a1205", backgroundColor: "#ffd94a", padding: { x: 10, y: 6 } })
      .setOrigin(0, 1)
      .setDepth(50)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.showHint());
    this.gearText = this.add.text(0, 0, "⚙", { fontFamily: EMOJI_FONT, fontSize: "26px", color: "#c7ccd6" }).setOrigin(0, 1);
    // dev-only combo rig — in production an accidental tap here instantly rewrote
    // the whole board mid-run ("my board just reset?!"), so the gear ships hidden
    if (import.meta.env.DEV) this.gearText.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.debugCombo());
    else this.gearText.setVisible(false);
    this.rotateHint = this.add
      .text(0, 0, "↻ rotate to landscape", { fontFamily: "monospace", fontSize: "16px", color: "#9aa0ab" })
      .setOrigin(0.5, 0)
      .setVisible(false);

    // live item-buff readout (charges, timers, armed keys, the road forecast)
    this.buffText = this.add
      .text(0, 0, "", { fontFamily: EMOJI_FONT, fontSize: "13px", color: "#9fc4e8", lineSpacing: 7 })
      .setOrigin(0, 0);

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
    const r = this.run.resources;
    const vals = [r.wood, r.ore, r.treasure, r.keys];
    for (let i = 0; i < this.resVals.length; i++) this.resVals[i].setText(`${vals[i]}`);
    this.scoreText.setText(`DEPTH   ${this.run.killed}\n\nSCORE   ${this.run.score}`);
    if (this.run.score > this.lastScoreShown) {
      this.lastScoreShown = this.run.score;
      this.tweens.killTweensOf(this.scoreText);
      this.scoreText.setScale(1);
      this.tweens.add({ targets: this.scoreText, scale: 1.09, duration: 90, yoyo: true }); // a little thump as it climbs
    }
    // accepted quests, with progress counting this run's haul live
    const live = { kills: this.run.killed, chests: this.chestsOpened, wood: r.wood, ore: r.ore };
    const lines = this.meta.active.map((aq) => {
      const q = questById(aq.id);
      if (!q) return "";
      const p = questProgress(this.meta, aq, live);
      return `${p.have >= p.need ? "✓" : "·"} ${q.shortLabel.padEnd(14)} ${p.have}/${p.need}`;
    });
    this.questText.setText(lines.length ? `QUESTS\n${lines.join("\n")}` : "");
  }

  // --- runner lane (all objects live in centerBox, design-local coords) ---
  private buildLane() {
    // --- parallax world backdrop, back-to-front (each layer fills the lane) ---
    const pscale = LANE_H / PARALLAX_SRC_H; // fit the 216-tall layers into the lane
    this.parallax = [];
    for (const { key, scroll: s } of this.world.parallax) {
      const ts = this.inBox(this.add.tileSprite(CXC, LANE_Y + LANE_H / 2, UI_W, LANE_H, key)).setTileScale(pscale);
      this.parallax.push({ sprite: ts, scroll: s });
    }

    // ground band the hero runs along
    this.floor = this.inBox(this.add.tileSprite(CXC, GROUND_Y + FLOOR_H / 2, UI_W, FLOOR_H, this.world.groundKey)).setTileScale(FLOOR_SCALE);

    // wet runs read overcast: a cool wash over the backdrop, under the characters
    if (this.rainy) this.inBox(this.add.rectangle(CXC, LANE_Y + LANE_H / 2, UI_W, LANE_H, 0x0a1626, 0.16));

    this.inBox(this.add.rectangle(CXC, LANE_Y + LANE_H / 2, UI_W, LANE_H).setStrokeStyle(2, 0x2a2d38)); // border
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
      const bg = this.add.rectangle(0, 0, 36, 30, 0x0c1018, 0.72).setStrokeStyle(2, 0x3a4152, 0.9);
      const ic = this.add.text(0, 1, "", { fontFamily: EMOJI_FONT, fontSize: "15px" }).setOrigin(0.5);
      const slash = this.add.line(0, 0, -9, 9, 9, -9, 0xff6a5a, 1).setLineWidth(2).setVisible(false);
      this.inBox(this.add.container(x, LANE_Y + 22, [bg, ic, slash]).setDepth(30));
      const paint = () => {
        const m = isMuted();
        ic.setText(glyphFor(m)).setAlpha(m ? 0.4 : 1);
        slash.setVisible(m);
      };
      paint();
      bg.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
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
      this.add.sprite(SAFE_X, GROUND_Y, "warrior").setOrigin(0.5, HERO_ORIGIN).setScale(HERO_SCALE).play("hero-idle"),
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
  }

  // --- board ---
  private buildBoard() {
    this.inBox(this.add.rectangle(CXC, GRID_Y + GRID_H / 2, GRID_W + 8, GRID_H + 8, 0x0e1015).setStrokeStyle(2, 0x2a2d38));
    this.grid = makeInitialGrid();
    this.tiles = Array.from({ length: H }, () => Array<Phaser.GameObjects.Container | null>(W).fill(null));
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) this.tiles[r][c] = this.makeTile(r, c, this.grid[r][c]);
  }
  private makeTile(r: number, c: number, type: number): Phaser.GameObjects.Container {
    const face = this.add.image(0, 0, tileArtKey(type)).setDisplaySize(FACE, FACE);
    const shine = this.add
      .sprite(0, 0, TILE_SHINE_KEY, 0)
      .setDisplaySize(FACE, FACE)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.4);
    shine.play({
      key: TILE_SHINE_ANIM,
      delay: Phaser.Math.Between(500, 7200),
      repeat: -1,
      repeatDelay: Phaser.Math.Between(6500, 9000),
      showBeforeDelay: true,
    });
    return this.inBox(this.add.container(this.xFor(c), this.yFor(r), [face, shine]).setData("type", type));
  }

  // --- input ---
  private buildInput() {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.targeting) {
        this.onTargetTap(p); // an armed item is waiting for its board tap
        return;
      }
      if (this.busy || this.run.over || this.chestActive || this.arenaActive || this.tutorial?.lockBoard) return;
      const coord = this.cellAt(p.x, p.y);
      if (coord) this.down = { coord, x: p.x, y: p.y };
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (!this.down || this.busy || this.run.over || this.chestActive || this.tutorial?.lockBoard) {
        this.down = null;
        return;
      }
      const { coord, x, y } = this.down;
      this.down = null;
      const dx = p.x - x;
      const dy = p.y - y;
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
        // a TAP (not a drag): the rare potion tile is drunk in place
        if (this.grid[coord.r][coord.c] === POTION) void this.drinkPotionAt(coord);
        return;
      }
      const target: Coord =
        Math.abs(dx) > Math.abs(dy)
          ? { r: coord.r, c: coord.c + (dx > 0 ? 1 : -1) }
          : { r: coord.r + (dy > 0 ? 1 : -1), c: coord.c };
      if (target.c < 0 || target.c >= W || target.r < 0 || target.r >= H) return;
      void this.trySwap(coord, target);
    });
  }

  // --- per-frame: scroll pressure (only while engaged) + sprite placement ---
  update(_time: number, delta: number) {
    const dts = delta / 1000;
    this.tickItems(dts);

    // the tutorial holds the run harmless — no scroll pressure while it teaches.
    // Boss fights ease the scroll (BOSS_SCROLL_MULT): no intermediate kills = no relief.
    // The Waystone freezes the world's breath entirely.
    if (this.phase === "fight" && !this.run.over && !this.tutorial?.active && this.freezeLeft <= 0)
      scroll(this.run, SCROLL_PER_SEC * (this.run.enemy?.kind === "boss" ? BOSS_SCROLL_MULT : 1) * dts);

    // pan the world while the hero runs to the next foe; hold still in a fight
    const worldSpeed = this.phase === "advance" && !this.run.over ? WORLD_SCROLL : 0;
    if (worldSpeed > 0) {
      const d = worldSpeed * (delta / 1000);
      // each layer moves at its depth factor; tilePositionX is texture-space (magnified by tileScale)
      for (const p of this.parallax) p.sprite.tilePositionX += (d * p.scroll) / p.sprite.tileScaleX;
      this.floor.tilePositionX += d / this.floor.tileScaleX;
    }

    const heroX = this.heroXForPressure();
    if (!this.heroLockX) this.hero.x = heroX; // held put while a killing swing lands
    // enemy pushes the hero toward the skull. NOT while it's dying: a killing
    // blow drops pressure instantly, and chaining the corpse to the new heroX
    // would teleport it forward (visible during a spell kill's bolt flight) —
    // the dead stay where they fell; the hero surges up past them instead.
    if (this.orc && this.phase === "fight" && !this.orcDying) this.orc.x = heroX + this.orcGap;
    if (this.orc) {
      const barY = GROUND_Y - 56; // above the slime's head
      this.enemyHpBg.setPosition(this.orc.x, barY);
      this.enemyHpBar.setPosition(this.orc.x - HP_W / 2, barY);
      this.defBadge.setPosition(this.orc.x + HP_W / 2 + 6, barY);
    }

    // sliced tile pieces: gravity + tumble, fading out as they fall away
    if (this.frags.length) {
      const dt = Math.min(0.05, delta / 1000);
      for (let i = this.frags.length - 1; i >= 0; i--) {
        const f = this.frags[i];
        f.vy += 1500 * dt; // gravity
        f.o.x += f.vx * dt;
        f.o.y += f.vy * dt;
        f.o.rotation += f.vr * dt;
        f.life -= dt;
        if (f.life < 0.3) f.o.setAlpha(Math.max(0, f.life / 0.3));
        if (f.life <= 0) {
          f.o.destroy();
          this.frags.splice(i, 1);
        }
      }
    }

    // peril vignette: past VIGNETTE_FROM the skull's pull bleeds red in from the
    // screen edges — felt in peripheral vision without ever looking up. Near the
    // end a heartbeat rides on top, quickening as the ground runs out.
    if (this.vignette) {
      const p = this.run.pressure;
      let target = 0;
      if (!this.run.over && !this.overShown && !this.runCompleteShown && p > VIGNETTE_FROM) {
        const t = Math.min(1, (p - VIGNETTE_FROM) / (1 - VIGNETTE_FROM));
        target = t * t * VIGNETTE_MAX;
        if (p > 0.7) {
          this.heartPhase += dts * (1.2 + p * 1.8) * Math.PI * 2;
          const thump = Math.pow(Math.max(0, Math.sin(this.heartPhase)), 3);
          target += thump * 0.09 * ((p - 0.7) / 0.3);
        }
      }
      this.vignetteA += (target - this.vignetteA) * Math.min(1, dts * 7);
      this.vignette.setAlpha(Math.max(0, this.vignetteA));
    }

    if (this.run.over && !this.overShown) {
      if (this.tryHearthRevive()) return; // the charm burns so you don't (mid-arena, the game resumes)
      if (this.arenaActive) this.teardownArena();
      this.showGameOver();
    }
  }

  /** Per-frame item bookkeeping: timed buffs decay, the burn ticks, the readout refreshes. */
  private tickItems(dts: number) {
    if (this.run.over) return;

    // Waystone: frozen scroll + a cool wash over the lane while it holds
    if (this.freezeLeft > 0) {
      this.freezeLeft = Math.max(0, this.freezeLeft - dts);
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
      this.hornLeft = Math.max(0, this.hornLeft - dts);
      this.run.surgeMult = this.hornLeft > 0 ? 2 : 1;
    }
    if (this.ledgerLeft > 0) {
      this.ledgerLeft = Math.max(0, this.ledgerLeft - dts);
      this.run.resMult = this.ledgerLeft > 0 ? 2 : 1;
    }

    // Cinder Flask: the foe burns — one tick per second while it lives
    // (held during the boss arena: wards fall to taps there, not to fire)
    if (this.burnLeft > 0 && !this.arenaActive) {
      if (this.run.enemy && this.orc && !this.orcDying) {
        this.burnLeft = Math.max(0, this.burnLeft - dts);
        this.burnAcc += dts;
        while (this.burnAcc >= 1 && this.run.enemy) {
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
        }
      } else {
        this.burnLeft = 0; // nothing left to burn
        this.burnAcc = 0;
      }
    }

    this.renderBuffs();
  }

  /** The buff readout under the quests: charges, timers, armed keys, the road ahead. */
  private renderBuffs() {
    // lane guard badge: count + a bounce on gain / red flash on spend
    if (this.run.block !== this.laneGuardLast) {
      const gained = this.run.block > this.laneGuardLast && this.laneGuardLast >= 0;
      const spent = this.run.block < this.laneGuardLast;
      this.laneGuardLast = this.run.block;
      this.laneGuardText.setText(`×${this.run.block}`).setColor(this.run.block > 0 ? "#bfe0ff" : "#6a707c");
      if (gained || spent) {
        this.tweens.killTweensOf(this.laneGuard);
        this.laneGuard.setScale(1);
        this.tweens.add({ targets: this.laneGuard, scale: gained ? 1.22 : 0.86, duration: 100, yoyo: true, ease: "Quad.easeOut" });
        if (spent) {
          this.laneGuardText.setTint(0xff7a6a);
          this.time.delayedCall(240, () => this.laneGuardText.clearTint());
        }
      }
    }
    const parts: string[] = [];
    // (guard charges live on the in-lane badge now, not in this readout)
    if (this.run.whetstone > 0) parts.push(`🗡️×${this.run.whetstone}`);
    if (this.hornLeft > 0) parts.push(`📯${Math.ceil(this.hornLeft)}s`);
    if (this.freezeLeft > 0) parts.push(`🗿${Math.ceil(this.freezeLeft)}s`);
    if (this.ledgerLeft > 0) parts.push(`📒${Math.ceil(this.ledgerLeft)}s`);
    if (this.burnLeft > 0) parts.push(`🔥${Math.ceil(this.burnLeft)}s`);
    if (this.spursActive) parts.push("🥾");
    if (this.skeletonCharges > 0) parts.push(`🗝️×${this.skeletonCharges}`);
    if (this.panCharges > 0) parts.push(`⛏️×${this.panCharges}`);
    const lines: string[] = [];
    for (let i = 0; i < parts.length; i += 3) lines.push(parts.slice(i, i + 3).join("  "));
    if (this.inkActive) lines.push(`ROAD ▸ ${this.roadAhead().join(" ")}`);
    const str = lines.join("\n");
    if (str !== this.buffStr) {
      this.buffStr = str;
      this.buffText.setText(str);
    }
  }

  /** Cartographer's Ink: simulate the spawn chain to name the next three encounters. */
  private roadAhead(n = 3): string[] {
    const out: string[] = [];
    let k = this.run.killed; // kills banked so far
    let sc = this.sinceChest;
    const chestHasRoom = this.itemSlots.some((s) => !s.item);
    // the current engagement resolves first and isn't part of the forecast
    if (this.phase !== "chest" && !this.chest) {
      k++;
      sc++;
      if (this.run.enemy?.kind === "boss" || (this.orcAnim === "boss" && this.orc)) sc = CHEST_EVERY; // his hoard follows him out
    }
    while (out.length < n) {
      if (sc >= CHEST_EVERY && chestHasRoom) {
        out.push("📦");
        sc = 0;
        continue;
      }
      const boss = (k + 1) % BOSS_EVERY === 0;
      out.push(boss ? "☠" : "👾");
      k++;
      sc = boss ? CHEST_EVERY : sc + 1; // a boss kill always rolls his hoard in next
    }
    return out;
  }

  /** Hearth Charm: consumes itself at the moment of death and drags you back. */
  private tryHearthRevive(): boolean {
    const slot = this.itemSlots.find((s) => s.item?.id === "hearth");
    if (!slot) return false;
    this.consumeSlot(slot);
    this.run.over = false;
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
    this.notice("THE HEARTH-CHARM BURNS", "#ff9d7a");
    this.refreshHud();
    return true;
  }

  // ================= combat / runner =================

  private spawnOrc(walkMs = WALK_IN_MS) {
    if (this.run.over) return;
    if (!this.run.enemy) spawnNext(this.run);
    if (!this.run.enemy) return;
    if (this.run.enemy.kind === "boss") {
      this.spawnBoss();
      return;
    }
    this.orcDying = false;
    this.phase = "advance";
    this.orcGap = ENGAGE_GAP;
    this.hero.play("hero-walk", true); // stride forward while the foe approaches

    // the variant (and its defense) is rolled in run.ts makeEnemy — dress to match
    const variant = this.run.enemy.variant;
    this.orcAnim = variant === "green" ? "orc" : variant === "blue" ? "orc2" : "orc3";
    this.orcDefense = this.run.enemy.defense;
    this.defenseTaught = false;
    const idleTex = this.orcAnim === "orc" ? "slime-idle" : this.orcAnim === "orc2" ? "slime2-idle" : "slime3-idle";

    const orc = this.inBox(
      this.add.sprite(ENTER_X, GROUND_Y, idleTex).setOrigin(0.5, SLIME_ORIGIN).setScale(SLIME_SCALE).play(`${this.orcAnim}-walk`),
    );
    this.orc = orc;
    this.sfx(this.pick(["squish1", "squish2"]), 0.32, 0.95 + Math.random() * 0.1); // one squelch as it bounces in
    this.enemyHpBg.setVisible(true);
    this.enemyHpBar.setVisible(true);
    this.defBadge.setText(this.orcDefense === "hide" ? "🛡⚔" : this.orcDefense === "ward" ? "🛡🪄" : "").setVisible(this.orcDefense !== "none");
    if (this.orcDefense !== "none") {
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
    if (this.orcAnim === "boss") {
      this.startBossArena(); // Malgrim doesn't trade blows — he plays his shell game
      return;
    }
    this.phase = "fight";
    this.orc.play(`${this.orcAnim}-idle`);
    this.hero.play("hero-idle", true);
  }

  /** ===== THE BOSS ===== the Cindermage strides in under a darkening sky. */
  private spawnBoss() {
    if (this.run.over) return;
    this.orcDying = false;
    this.phase = "advance";
    this.orcAnim = "boss";
    this.orcDefense = this.run.enemy?.defense ?? "ward"; // his wards drink magic — bring a blade
    this.defenseTaught = false;
    this.defBadge.setVisible(false); // the boss bar carries his ward mark instead
    this.orcGap = BOSS_ENGAGE_GAP;
    this.hero.play("hero-walk", true);
    this.sfx("summon", 0.55, 0.9);
    buzz(30);
    this.playMusic("music_boss", 0.32, 1200); // his war-drums drown the road's song

    // the lane darkens for his approach; the veil lifts as he plants his staff
    const veil = this.inBox(this.add.rectangle(CXC, LANE_Y + LANE_H / 2, UI_W, LANE_H, 0x1a0505, 0).setDepth(20));
    this.tweens.add({ targets: veil, fillAlpha: 0.38, duration: 800 });

    const orc = this.inBox(
      this.add
        .sprite(ENTER_X, GROUND_Y, "boss-idle")
        .setOrigin(0.5, BOSS_ORIGIN)
        .setScale(BOSS_SCALE)
        .setFlipX(true) // pack faces right; he walks in from the right, glaring left
        .play("boss-walk"),
    );
    this.orc = orc;

    // name banner over the lane while he closes the distance
    const nm = this.inBox(
      this.add
        .text(CXC, LANE_Y + 64, BOSS_NAME, {
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
    nm.setTint(0xfff2d0, 0xffd280, 0xf2903b, 0xc9581f); // ember gradient
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
    const root = this.add.container(CXC, LANE_Y + 30).setDepth(31);
    const label = this.add
      .text(0, -10, `☠ ${BOSS_NAME} · 🛡🪄`, { fontFamily: EMOJI_FONT, fontStyle: "bold", fontSize: "13px", color: "#ffb3a0" })
      .setOrigin(0.5, 1);
    const bg = this.add.rectangle(0, 0, BW, BH, 0x000000, 0.6).setStrokeStyle(2, 0x8a2d2d);
    const fill = this.add.rectangle(-BW / 2 + 2, 0, BW - 4, BH - 4, 0xe05a5a).setOrigin(0, 0.5);
    root.add([bg, fill, label]);
    this.inBox(root);
    root.setAlpha(0);
    this.tweens.add({ targets: root, alpha: 1, duration: 400, delay: 350 });
    fill.scaleX = 0;
    this.tweens.add({ targets: fill, scaleX: 1, duration: 1500, delay: 400, ease: "Quad.easeOut" }); // dramatic fill-up
    this.bossBar = { root, fill };
  }

  private hideBossBar() {
    this.bossBar?.root.destroy();
    this.bossBar = null;
  }

  private updateEnemyBar() {
    const e = this.run.enemy;
    const frac = e && !this.orcDying ? Math.max(0, e.hp / e.maxHp) : 0;
    this.enemyHpBar.scaleX = frac;
    if (this.bossBar) {
      this.tweens.killTweensOf(this.bossBar.fill); // first hit cancels the intro fill-up
      this.bossBar.fill.scaleX = frac;
    }
  }

  private async trySwap(a: Coord, b: Coord) {
    this.busy = true;
    this.clearHint(); // a move settles the board — any hint is stale now
    const ta = this.tiles[a.r][a.c];
    const tb = this.tiles[b.r][b.c];
    if (!ta || !tb) {
      this.busy = false;
      return;
    }
    swap(this.grid, a, b);
    const makesMatch = findMatches(this.grid).length > 0;
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

    await this.resolve();
    if (!this.run.over && !hasPossibleMove(this.grid)) await this.animatedReshuffle("no moves left — fresh tiles");
    this.tutorial?.onBoardSettled();
    this.busy = false;
  }

  private async resolve() {
    let depth = 0; // cascade depth — rising pitch on the match pop
    while (true) {
      const matches = findMatches(this.grid);
      if (matches.length === 0) break;
      depth++;
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

      buzz(depth > 1 ? 22 : 14); // haptic tick as the tiles shatter (deeper cascade = longer buzz on Android)
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
        const t = this.tiles[r][c];
        if (t) fades.push(this.shatter(t, ty));
        this.tiles[r][c] = null;
        this.grid[r][c] = EMPTY;
      });
      await Promise.all(fades);

      const scoreBefore = this.run.score;
      const outcome = applyMatches(this.run, counts);
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
      this.tutorial?.onCascade(counts);
      // keys bank per MATCH, not per tile — fly only as many chips as were kept
      if (resFly[KEY]) resFly[KEY] = resFly[KEY].slice(0, outcome.gained.keys);
      this.flyResources(resFly); // the goods themselves stream off the board into the rail
      this.onCombat(outcome, outcome.swords, swordCells, staffCells); // effective count — Wren's Whetstone can upgrade the swing
      // non-combat clear — a random tile-match sound (1 of TILE_SFX), slight pitch variation
      if (outcome.damage <= 0) this.sfx(`tile${1 + ((Math.random() * TILE_SFX) | 0)}`, 0.4, 0.97 + Math.random() * 0.06);
      this.refreshHud();

      await this.collapse();
    }
  }

  private onCombat(outcome: MatchOutcome, swords: number, swordCells: { x: number; y: number }[] = [], staffCells: { x: number; y: number }[] = []) {
    if (outcome.damage <= 0 || !this.orc || this.orcDying) return;

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
      this.playComboSfx(combo);
      this.showHits(outcome.hits, combo, outcome.swordMod);
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
    const meleeMs = hasMelee ? this.comboMs(combo) : 0;
    const spell = outcome.spell;

    if (outcome.killed) {
      // Everything plays IN PLACE (x frozen); the surge waits for the last act.
      this.heroLockX = true;
      if (hasMelee) this.playCombo(combo);
      if (spell) {
        const impactAt = this.performCast(spell, true, meleeMs, undefined, staffCells);
        this.surgeAfterKill(impactAt + 120);
      } else {
        this.surgeAfterKill(meleeMs);
        this.killOrc(meleeMs + 420); // hold the next foe until the combo + surge finishes
      }
    } else {
      if (hasMelee) {
        this.playCombo(combo, spell ? undefined : this.heroBaseAnim()); // the cast takes over if one follows
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
  private performCast(spell: SpellOutcome, killed: boolean, delayMs: number, tint = 0xffa040, fromCells: { x: number; y: number }[] = []): number {
    if (killed) this.orcDying = true; // freeze hurt/strike reactions; killOrc re-affirms at impact
    this.time.delayedCall(delayMs, () => {
      this.playCombo(["hero-spell"], killed ? undefined : this.heroBaseAnim());
      this.sfx("spell", 0.55);
      if (fromCells.length) this.gatherSpell(fromCells, tint); // the matched tiles feed the staff
      this.time.delayedCall(CAST_LEAD_MS, () => this.launchBolt(spell, killed, tint));
    });
    return delayMs + CAST_LEAD_MS + BOLT_FLIGHT_MS;
  }

  /** The projectile itself — sized by tier, trailing sparks, bursting on arrival. */
  private launchBolt(spell: SpellOutcome, killed: boolean, tint: number) {
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
        this.spellImpact(spell, killed, tint, tx, ty);
      },
    });
  }

  /** Impact: burst + shake scaled by tier, the damage number, burn, hurt or death. */
  private spellImpact(spell: SpellOutcome, killed: boolean, tint: number, x: number, y: number) {
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
    this.floatDamage(spell.dmg, t >= 4, spell.mod);
    this.teachDefense(spell.mod);
    if (spell.burn && this.run.enemy && !killed) {
      this.burnLeft = Math.max(this.burnLeft, SPELL_BURN_SECS); // Pyroclasm sticks
      this.burnAcc = 0;
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
          const tgt = this.toLocal(icon.x + 14, icon.y);
          const chip = this.inBox(this.add.image(cell.x, cell.y, tileArtKey(ty)).setDepth(66).setScale(0.34).setAngle(Math.random() * 20 - 10));
          // a quick lift first, then the swoop — reads as "plucked, then carried off"
          const mx = (cell.x + tgt.x) / 2 + (Math.random() * 50 - 25);
          const my = Math.min(cell.y, tgt.y) - 90 - Math.random() * 50;
          this.tweens.add({ targets: chip, scale: 0.42, duration: 90, yoyo: true });
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
              if (u > 0.55) chip.setScale(0.42 - (u - 0.55) * 0.45); // shrink into the rail
            },
            onComplete: () => {
              chip.destroy();
              // the row answers: icon + count bounce as the goods thunk in
              for (const o of [icon, val]) {
                this.tweens.killTweensOf(o);
                o.setScale(1);
                this.tweens.add({ targets: o, scale: 1.3, duration: 90, yoyo: true, ease: "Quad.easeOut" });
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
    const label = mod === "weak" ? "WEAK!" : this.orcDefense === "hide" ? "IRON HIDE!" : "SPELL WARD!";
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
  private playCombo(keys: string[], then?: string) {
    const tail = then ? [...keys.slice(1), then] : keys.slice(1);
    this.hero.play(keys[0]);
    // Drop any leftover chain from a prior hit (Phaser keeps one in nextAnim, rest queued).
    this.hero.anims.nextAnim = null;
    this.hero.anims.nextAnimsQueue.length = 0;
    if (tail.length) this.hero.chain(tail);
  }

  private comboMs(keys: string[]): number {
    return keys.reduce((s, k) => s + (this.anims.get(k)?.duration ?? 300), 0);
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
  private fadeSoundOut(snd: Phaser.Sound.BaseSound, ms: number) {
    this.tweens.killTweensOf(snd);
    const from = (snd as unknown as { volume: number }).volume;
    this.tweens.addCounter({
      from,
      to: 0,
      duration: ms,
      onUpdate: (tw) => setSoundLevel(snd, tw.getValue() ?? 0),
      onComplete: () => snd.stop(),
    });
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
  private openMenu() {
    if (this.scene.isActive("menu")) return;
    this.scene.launch("menu", { from: "game" });
    this.scene.pause();
  }

  /** Menu retreat: end the run early, banking the haul as if the scout had fallen. */
  public bankAndRetreat() {
    if (this.run.over || this.overShown || this.runCompleteShown) return; // death/victory paths bank themselves
    const r = this.run.resources;
    bankRun(loadMeta(), { wood: r.wood, ore: r.ore, treasure: r.treasure, kills: this.run.killed, chests: this.chestsOpened });
  }

  private clearHint() {
    for (const o of this.hintObjs) o.destroy();
    this.hintObjs = [];
  }

  /** Drink a tapped potion tile: ground regained + guard raised, in green. */
  private async drinkPotionAt(cell: Coord) {
    this.busy = true;
    this.clearHint();
    this.sfx("pickup", 0.55, 0.85);
    buzz(16);

    // the tile shatters like any match...
    const t = this.tiles[cell.r][cell.c];
    if (t) void this.shatter(t, POTION);
    this.tiles[cell.r][cell.c] = null;
    this.grid[cell.r][cell.c] = EMPTY;

    // ...and the tonic hits: pressure relief (hero strides right via update) + guard
    drinkPotion(this.run);
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
    this.floatGuard(this.hero.x + 30, GROUND_Y - 76, 2, 220); // the tonic hardens the guard too
    this.notice("the tonic takes hold — ground regained", "#a9f5c0");

    await this.collapse();
    await this.resolve(); // the refill can cascade like any clear
    if (!this.run.over && !hasPossibleMove(this.grid)) await this.animatedReshuffle("no moves left — fresh tiles");
    this.busy = false;
  }

  /** Light up a valid swap: two pulsing gold rings on the tiles to trade. */
  private showHint() {
    if (this.busy || this.run.over || this.chestActive || this.arenaActive || this.tutorial?.active || this.targeting) return;
    this.clearHint();
    const h = findHint(this.grid);
    if (!h) {
      this.notice("no moves — the board will refresh", "#9aa0ab");
      return;
    }
    buzz(12);
    this.sfx("pickup", 0.4, 1.2);
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
  private playComboSfx(combo: string[]) {
    const HITS = ["hit1", "hit2", "hit3"];
    let t = 0;
    combo.forEach((key, i) => {
      this.time.delayedCall(t, () => this.sfx(["swing1", "swing2", "swing3"][Math.min(i, 2)], 0.28));
      this.time.delayedCall(t + 100, () => this.sfx(this.pick(HITS), 0.5));
      t += this.anims.get(key)?.duration ?? 300;
    });
  }

  private killOrc(afterMs = 760) {
    const wasBoss = this.orcAnim === "boss";
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
      const cam = this.cameras.main;
      cam.zoomTo(1.035, 70, Phaser.Math.Easing.Quadratic.Out, true, (_c: Phaser.Cameras.Scene2D.Camera, prog: number) => {
        if (prog === 1) cam.zoomTo(1, 160, Phaser.Math.Easing.Sine.Out, true);
      });
      this.tweens.killTweensOf(dying);
      dying.play(`${this.orcAnim}-death`);
      dying.once("animationcomplete", () => {
        this.tweens.add({ targets: dying, alpha: 0, duration: wasBoss ? 700 : 260, onComplete: () => dying.destroy() });
      });
      // the kill bounty pops over the corpse as the final swing lands
      this.floatScore(dying.x + 14, GROUND_Y - 104, wasBoss ? 400 : 100, {
        size: wasBoss ? 44 : 34,
        sparkle: true,
        delay: Math.max(0, afterMs - 420),
      });
    }
    if (wasBoss) {
      this.bossSpoils(dying?.x ?? SAFE_X + BOSS_ENGAGE_GAP);
      // his drums die with him: the road's song returns — unless the road is done
      if (this.run.killed < RUN_COMPLETE_AT) this.playMusic("music_journey", 0.26, 1600);
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
    if (this.run.over) return;
    if (this.run.killed >= RUN_COMPLETE_AT) {
      this.showRunComplete();
      return;
    }
    spawnNext(this.run);
    this.spawnOrc(walkMs);
  }

  /** Victory: the second boss is down, the hoard is looted — home to camp. */
  private showRunComplete() {
    if (this.runCompleteShown || this.overShown) return;
    this.runCompleteShown = true;
    this.fadeOutMusic(1200); // quiet under the victory fanfare
    this.phase = "advance"; // he strides on while the banner flies — a victory walk
    this.hero.play("hero-walk", true);

    // the caravan keeps everything: bank resources + quest stats, same as a fall
    const r = this.run.resources;
    bankRun(loadMeta(), { wood: r.wood, ore: r.ore, treasure: r.treasure, kills: this.run.killed, chests: this.chestsOpened });

    this.sfx("combo6", 0.55);
    this.time.delayedCall(400, () => this.sfx("coin_pour", 0.5));
    const w = this.scale.width;
    const h = this.scale.height;
    const veil = this.add.rectangle(w / 2, h / 2, w, h, 0x05060a, 0.62).setAlpha(0).setDepth(80);
    const title = this.add
      .text(w / 2, h / 2 - 56, "THE ROAD IS CLEARED", { fontFamily: "monospace", fontStyle: "bold", fontSize: "34px", color: "#ffe08a" })
      .setOrigin(0.5)
      .setDepth(81)
      .setAlpha(0);
    title.setTint(0xfff6c8, 0xffe08a, 0xf2a93b, 0xc9761f);
    const stats = this.add
      .text(w / 2, h / 2 - 10, `Depth ${this.run.killed}    Score ${this.run.score}`, { fontFamily: "monospace", fontSize: "20px", color: "#ffe08a" })
      .setOrigin(0.5)
      .setDepth(81)
      .setAlpha(0);
    const banked = this.add
      .text(w / 2, h / 2 + 26, `hauled home  🪵 ${r.wood}   🪨 ${r.ore}   💎 ${r.treasure}`, { fontFamily: EMOJI_FONT, fontSize: "17px", color: "#a9e6a9" })
      .setOrigin(0.5)
      .setDepth(81)
      .setAlpha(0);
    const hint = this.add
      .text(w / 2, h / 2 + 68, "tap to return to camp", { fontFamily: "monospace", fontSize: "16px", color: "#9aa0ab" })
      .setOrigin(0.5)
      .setDepth(81)
      .setAlpha(0);
    this.tweens.add({ targets: veil, alpha: 0.62, duration: 500, delay: 300 });
    this.tweens.add({ targets: [title, stats, banked], alpha: 1, duration: 400, delay: 500 });
    this.tweens.add({ targets: hint, alpha: 1, duration: 350, delay: 700 });
    this.tweens.add({ targets: hint, alpha: 0.3, duration: 700, yoyo: true, repeat: -1, delay: 1100 });
    this.time.delayedCall(900, () => this.input.once("pointerdown", () => this.scene.start("camp")));
  }

  /** The Cindermage falls: flash, quake, treasure bounty, and a chest rolls in next. */
  private bossSpoils(x: number) {
    this.hideBossBar();
    buzz(40);
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
        .text(CXC, LANE_Y + 96, "CINDERMAGE FELLED!", {
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

  /** Dev: rig the next foe to be the boss (console: __mb.debugBoss()). */
  public debugBoss() {
    this.run.killed = BOSS_EVERY - 1;
    this.sinceChest = -999; // skip the chest interlude for this test
    if (this.orc && !this.orcDying) {
      this.run.enemy = null;
      this.killOrc(0);
    }
  }

  // ================= MALGRIM'S INFERNAL SHELL GAME (boss arena) =================
  // A mode break: the scroll stops (phase "arena"), the board retracts, burning
  // portals rise where it stood and Malgrim hides among fiery decoys. Tap the
  // REAL one (cyan staff glint) before he casts to crack a ward; wrong taps and
  // timeouts fire a fireball that the puzzle phase's guard charges can absorb.
  // Three wards, each round faster and busier, then a finishing strike.

  private arenaWait(ms: number): Promise<void> {
    return new Promise((res) => this.time.delayedCall(ms, res));
  }

  private clearArenaObjs() {
    for (const o of this.arenaObjs) {
      this.tweens.killTweensOf(o); // killed tweens never fire onComplete — no phantom hits
      o.destroy();
    }
    this.arenaObjs = [];
  }

  /** Even spread of portal mouths across the retracted board's rect. */
  private arenaPortalSpots(n: number): { x: number; y: number }[] {
    const rows = n <= 3 ? 1 : n <= 6 ? 2 : 3;
    const cols = 3;
    const out: { x: number; y: number }[] = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        out.push({ x: GRID_X + ((c + 0.5) / cols) * GRID_W, y: GRID_Y + ((r + 0.5) / rows) * GRID_H });
    return out;
  }

  private startBossArena() {
    this.arenaActive = true;
    const gen = ++this.arenaGen;
    this.phase = "arena"; // stationary arena: no scroll, no strikes, no world pan
    this.arenaWard = 0;
    this.arenaDealIdx = 0;
    this.arenaDealsDone = 0;
    this.arenaWardMissed = false;
    this.orc?.play("boss-idle");
    this.hero.play("hero-idle", true);
    this.notice("MALGRIM'S INFERNAL SHELL GAME", "#ff9d6a");

    // he quits the lane in a burst of embers — the game moves to the portals
    this.time.delayedCall(600, () => {
      if (gen !== this.arenaGen || !this.orc) return;
      this.sfx("spell", 0.5, 0.8);
      const puff = this.inBox(
        this.add.image(this.orc.x, GROUND_Y - 40, "orb").setBlendMode(Phaser.BlendModes.ADD).setTint(0xff8a4a).setScale(1).setDepth(30),
      );
      this.tweens.add({ targets: puff, scale: 3, alpha: 0, duration: 450, onComplete: () => puff.destroy() });
      this.tweens.add({ targets: this.orc, alpha: 0, duration: 300 });
    });

    void (async () => {
      while (this.busy) await this.arenaWait(120); // let any final cascade settle first
      if (gen !== this.arenaGen || this.run.over) return;
      await this.hideBoard();
      await this.arenaWait(420);
      if (gen !== this.arenaGen || this.run.over) return;
      this.showWardIntro(gen);
    })();
  }

  /** Announce the ward's rules (each ward is a new game), then deal. */
  private showWardIntro(gen: number) {
    if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
    const w = ARENA_WARDS[this.arenaWard];
    this.notice(w.title, "#ffd24a");
    this.time.delayedCall(850, () => {
      if (gen !== this.arenaGen) return;
      this.notice(w.sub, "#ffd7a0");
    });
    this.time.delayedCall(1650, () => {
      if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
      if (this.arenaWard === 2) this.startTennis(gen); // the final ward is a duel, not a deal
      else this.playArenaDeal(gen);
    });
  }

  /** One deal of the shell game — retried on a miss, advanced on a hit. */
  private playArenaDeal(gen: number) {
    if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
    const cfg = ARENA_WARDS[this.arenaWard].deals[this.arenaDealIdx];
    const spots = this.arenaPortalSpots(cfg.portals);
    const reg = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.arenaObjs.push(o);
      return o;
    };

    // burning portals flare up across the retracted board
    const havePortalTex = this.textures.exists("portal");
    spots.forEach((s, i) => {
      const p = havePortalTex
        ? reg(this.inBox(this.add.sprite(s.x, s.y + 26, "portal").setTint(0xff9a5a).setScale(0).setDepth(40).play("portal-spin")))
        : reg(this.inBox(this.add.image(s.x, s.y + 26, "orb").setTint(0xff7a3a).setScale(0).setDepth(40)));
      this.tweens.add({ targets: p, scale: havePortalTex ? 1.6 : 2.2, duration: 260, delay: i * 40, ease: "Back.easeOut" });
    });
    this.sfx("summon", 0.35, 1.25);

    void (async () => {
      await this.arenaWait(520);
      if (gen !== this.arenaGen || this.run.over) return;

      // feints: ghostly hops before he settles (tapping ghosts does nothing)
      for (let h = 0; h < cfg.hops; h++) {
        const at = spots[(Math.random() * spots.length) | 0];
        const ghost = reg(
          this.inBox(
            this.add
              .sprite(at.x, at.y + 24, "boss-idle")
              .setOrigin(0.5, BOSS_ORIGIN)
              .setScale(0.8)
              .setFlipX(true)
              .setAlpha(0.45)
              .setTint(0xffc9a0)
              .setDepth(41),
          ),
        );
        this.sfx("spell", 0.3, 1.3 + h * 0.15);
        this.tweens.add({ targets: ghost, alpha: 0, duration: 300, delay: 120 });
        await this.arenaWait(340);
        ghost.destroy();
        if (gen !== this.arenaGen || this.run.over) return;
      }

      // the deal: one real Malgrim, cfg.decoys burning fakes
      const order = Phaser.Utils.Array.Shuffle(spots.map((_, i) => i));
      const realIdx = order[0];
      const decoyIdxs = order.slice(1, 1 + cfg.decoys);
      type Figure = { fig: Phaser.GameObjects.Sprite; glow: Phaser.GameObjects.Image | null; isReal: boolean };
      const figures: Figure[] = [];
      let stage: "watch" | "live" = "watch";
      let settled = false;
      let castTween: Phaser.Tweens.Tween | null = null;
      const settle = () => {
        if (settled || gen !== this.arenaGen) return false;
        settled = true;
        castTween?.stop();
        return true;
      };
      const realOf = () => figures.find((f) => f.isReal)!;

      const mkFigure = (i: number, isReal: boolean) => {
        const s = spots[i];
        let glow: Phaser.GameObjects.Image | null = null;
        if (!isReal) {
          glow = reg(
            this.inBox(this.add.image(s.x, s.y - 14, "orb").setBlendMode(Phaser.BlendModes.ADD).setTint(0xff4030).setScale(1.7).setAlpha(0.3).setDepth(40)),
          );
          this.tweens.add({ targets: glow, alpha: 0.14, duration: 420, yoyo: true, repeat: -1 });
        }
        const fig = reg(
          this.inBox(
            this.add
              .sprite(s.x, s.y + 24, "boss-idle")
              .setOrigin(0.5, BOSS_ORIGIN)
              .setScale(0.4)
              .setFlipX(true)
              .setDepth(42)
              .play("boss-idle"),
          ),
        );
        if (!isReal) fig.setTint(0xff6a55); // decoys burn red (until the cloak)
        this.tweens.add({ targets: fig, scale: 0.85, duration: 200, ease: "Back.easeOut" });
        const entry: Figure = { fig, glow, isReal };
        fig.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
          if (stage !== "live") return; // no taps while he's still dealing
          if (entry.isReal) this.arenaHit(gen, settle, fig, castFrac());
          else this.arenaFail(gen, settle, "decoy", realOf().fig, fig);
        });
        figures.push(entry);
        return entry;
      };

      for (const d of decoyIdxs) mkFigure(d, false);
      const real = mkFigure(realIdx, true);
      this.sfx(this.pick(["squish1", "squish2"]), 0.2, 1.3);

      // the tell: a cyan glint off the true staff (longer when he's about to shuffle)
      await this.arenaWait(240);
      if (gen !== this.arenaGen || settled) return;
      const glint = reg(
        this.inBox(
          this.add.image(real.fig.x + 10, real.fig.y - 58, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(0x8ff4ff).setScale(0.6).setAlpha(0).setDepth(43),
        ),
      );
      this.tweens.add({ targets: glint, alpha: 1, scale: 1.6, duration: 130, yoyo: true, repeat: cfg.swaps > 0 ? 4 : 2, onComplete: () => glint.destroy() });
      this.sfx("pickup", 0.3, 1.5);

      // WARD II: everyone cloaks to the same flame, then the shuffle — TRACK him
      if (cfg.swaps > 0) {
        await this.arenaWait(760); // let the glint be seen
        if (gen !== this.arenaGen || settled) return;
        for (const f of figures) {
          f.fig.setTint(0xb06a48); // identical cloaks — colour tells you nothing now
          f.glow?.destroy();
          f.glow = null;
        }
        this.sfx("spell", 0.35, 0.9);
        for (let sw = 0; sw < cfg.swaps; sw++) {
          const a = figures[(Math.random() * figures.length) | 0];
          let b = a;
          while (b === a) b = figures[(Math.random() * figures.length) | 0];
          const ax = a.fig.x, ay = a.fig.y, bx = b.fig.x, by = b.fig.y;
          this.sfx("spell", 0.3, 1.35 + sw * 0.1);
          // a squash-dip while the pair trade places (position and scale on separate tweens)
          this.tweens.add({ targets: [a.fig, b.fig], scale: 0.68, duration: 180, yoyo: true, ease: "Sine.easeInOut" });
          this.tweens.add({ targets: a.fig, x: bx, y: by, duration: 360, ease: "Sine.easeInOut" });
          this.tweens.add({ targets: b.fig, x: ax, y: ay, duration: 360, ease: "Sine.easeInOut" });
          await this.arenaWait(420);
          if (gen !== this.arenaGen || settled) return;
        }
      }

      // LIVE: his cast burns up the ember bar — the red tail is the crit gamble
      stage = "live";
      const barW = 320;
      const bx0 = CXC - barW / 2;
      const by0 = GRID_Y - 4;
      reg(this.inBox(this.add.rectangle(CXC, by0, barW + 6, 16, 0x0a0b0f, 0.85).setDepth(44)));
      reg(
        this.inBox(
          this.add
            .rectangle(bx0 + barW * ARENA_CRIT_FRAC, by0, barW * (1 - ARENA_CRIT_FRAC), 12, 0x8a1f1f, 0.9)
            .setOrigin(0, 0.5)
            .setDepth(45),
        ),
      );
      const castFill = reg(this.inBox(this.add.rectangle(bx0, by0, barW, 10, 0xffa040).setOrigin(0, 0.5).setScale(0, 1).setDepth(46)));
      const castFrac = () => castFill.scaleX;
      castTween = this.tweens.add({
        targets: castFill,
        scaleX: 1,
        duration: cfg.castMs,
        onComplete: () => this.arenaFail(gen, settle, "timeout", realOf().fig, realOf().fig),
      });
    })();
  }

  /** One incoming arena hit on the hero: guard turns it, otherwise the skull creeps. */
  private arenaStrikeHero() {
    const hadGuard = this.run.block > 0;
    const blockBefore = this.run.block;
    const net = enemyStrike(this.run);
    this.refreshHud();
    const used = blockBefore - this.run.block;
    if (used > 1)
      this.floatChip(this.hero.x + 28, GROUND_Y - 100, `-${used}🛡`, {
        size: 20,
        tint: [0xeef6ff, 0xbfe0ff, 0x6ea8e0, 0x3a6a9a],
        stroke: "#050d16",
        font: EMOJI_FONT,
      });
    if (hadGuard && net <= 0) {
      this.time.delayedCall(60, () => this.sfx(this.pick(["block1", "block2", "block3"]), 0.5));
      this.showBlockImpact(true, true);
    } else {
      this.cameras.main.shake(260, 0.009);
      this.hero.setTint(0xffa060);
      this.time.delayedCall(200, () => this.hero.clearTint());
      buzz(24);
    }
  }

  /** The boss bar is the ward meter — drain it to the current deals-done mark. */
  private drainBossBar() {
    if (!this.bossBar) return;
    this.tweens.killTweensOf(this.bossBar.fill);
    this.tweens.add({
      targets: this.bossBar.fill,
      scaleX: Math.max(0, 1 - this.arenaDealsDone / ARENA_TOTAL_DEALS),
      duration: 260,
      ease: "Quad.easeOut",
    });
  }

  // ---- WARD III: FIREBALL TENNIS — return his fire ---------------------------
  // He serves from the far court; every ball carries a shrinking timing ring.
  // Tap (anywhere — the screen is your racket) as the ball meets the guard ring
  // to reflect it back into him. Whiffs lock the swing briefly, so mashing
  // loses; his wind-up sometimes throws NOTHING; and the violet ball is a lie
  // that only hurts you if you swing at it. Three returns break the last ward.
  private startTennis(gen: number) {
    if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
    const reg = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.arenaObjs.push(o);
      return o;
    };
    const shots = ARENA_WARDS[2].deals;
    const MX = PADIN + UI_W - 96; // his end of the court

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

    // the guard ring: meet the ball HERE
    const zone = reg(this.inBox(this.add.ellipse(this.hero.x + 64, GROUND_Y - 42, 66, 66).setStrokeStyle(4, 0x8ff4ff, 0.9).setDepth(43)));
    this.tweens.add({ targets: zone, alpha: 0.45, duration: 480, yoyo: true, repeat: -1 });

    // the racket: a full-court tap catcher (timing is everything)
    const catcher = reg(this.inBox(this.add.rectangle(CXC, CENTER_DH / 2, CENTER_DW, CENTER_DH, 0xffffff, 0.001).setDepth(60).setInteractive()));

    type Ball = { img: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Ellipse; arrival: number; kind: "fire" | "violet"; alive: boolean };
    let balls: Ball[] = [];
    let lockoutUntil = 0;
    let resolving = false; // between serves / while a return flies

    const clearBalls = () => {
      for (const b of balls) {
        this.tweens.killTweensOf(b.img);
        this.tweens.killTweensOf(b.ring);
        b.img.destroy();
        b.ring.destroy();
      }
      balls = [];
    };

    const failContinue = (msg: string) => {
      if (gen !== this.arenaGen) return;
      resolving = true;
      this.arenaWardMissed = true;
      clearBalls();
      this.arenaStrikeHero();
      this.notice(msg, "#ff8a6a");
      this.time.delayedCall(1000, () => {
        if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
        throwShot();
      });
    };

    const reflected = (b: Ball) => {
      resolving = true;
      b.alive = false;
      this.tweens.killTweensOf(b.img);
      b.ring.destroy();
      this.playCombo(["hero-attack2"], "hero-idle");
      this.sfx("swing2", 0.4);
      this.sfx(this.pick(["block1", "block2", "block3"]), 0.5);
      this.tweens.add({ targets: zone, scaleX: 1.35, scaleY: 1.35, duration: 110, yoyo: true, ease: "Quad.easeOut" });
      buzz(22);
      b.img.setTint(0xffe0a0); // struck true — it flies back hot
      clearBalls_except(b);
      this.tweens.add({
        targets: b.img,
        x: MX - 22,
        y: GROUND_Y - 52,
        duration: Math.max(320, shots[Math.min(this.arenaDealIdx, shots.length - 1)].castMs * 0.5),
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
          if (this.orc && !this.orcDying) {
            this.orc.play("boss-hurt").once("animationcomplete", () => {
              if (this.orc && this.orcAnim === "boss" && !this.orcDying) this.orc.play("boss-idle");
            });
          }
          this.arenaDealsDone++;
          this.arenaDealIdx++;
          this.drainBossBar();
          if (this.arenaDealIdx >= shots.length) {
            this.time.delayedCall(650, () => {
              if (gen !== this.arenaGen || this.run.over) return;
              this.crackWard(gen, false);
            });
          } else {
            this.notice(this.arenaDealIdx === 1 ? "RETURNED!" : "AGAIN — FASTER!", "#8ff4ff");
            this.time.delayedCall(1100, () => {
              if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
              throwShot();
            });
          }
        },
      });
    };
    const clearBalls_except = (keep: Ball) => {
      for (const b of balls) {
        if (b === keep) continue;
        this.tweens.killTweensOf(b.img);
        this.tweens.killTweensOf(b.ring);
        b.img.destroy();
        b.ring.destroy();
      }
      balls = [keep];
    };

    const onTap = () => {
      if (gen !== this.arenaGen || !this.arenaActive || resolving || this.run.over) return;
      const now = this.time.now;
      if (now < lockoutUntil) return; // still recovering from the whiff
      const inWin = balls.find((b) => b.alive && now >= b.arrival - TENNIS_EARLY_MS && now <= b.arrival + TENNIS_LATE_MS);
      if (!inWin) {
        // a swing at nothing — his fakes and your nerves conspire
        lockoutUntil = now + TENNIS_WHIFF_LOCK_MS;
        this.playCombo(["hero-attack"], "hero-idle");
        this.sfx("swing1", 0.25);
        if (balls.some((b) => b.alive))
          this.floatChip(this.hero.x + 30, GROUND_Y - 96, "early!", { size: 18, tint: [0xd0d4dc, 0xb9c0cc, 0x8a8f98, 0x6a707c], stroke: "#14171f" });
        return;
      }
      if (inWin.kind === "violet") {
        // he sold you the lie — it detonates in your swing
        const burst = this.inBox(
          this.add
            .particles(inWin.img.x, inWin.img.y, "spark", {
              speed: { min: 80, max: 240 }, lifespan: { min: 200, max: 460 },
              scale: { start: 1.2, end: 0 }, blendMode: "ADD", tint: 0xb06aff, emitting: false,
            })
            .setDepth(47),
        );
        burst.explode(20);
        this.time.delayedCall(600, () => burst.destroy());
        failContinue("the VIOLET was a lie!");
        return;
      }
      reflected(inWin);
    };
    catcher.on("pointerdown", onTap);

    const launch = (kind: "fire" | "violet", flightMs: number, delayMs: number) => {
      this.time.delayedCall(delayMs, () => {
        if (gen !== this.arenaGen || this.run.over || !this.arenaActive || resolving) return;
        const zx = this.hero.x + 64;
        const zy = GROUND_Y - 42;
        const color = kind === "fire" ? 0xff7733 : 0xb06aff;
        const img = reg(this.inBox(this.add.image(MX - 34, GROUND_Y - 54, "bolt").setBlendMode(Phaser.BlendModes.ADD).setTint(color).setScale(1.5).setDepth(46)));
        const ring = reg(this.inBox(this.add.ellipse(img.x, img.y, 130, 130).setStrokeStyle(3, color, 0.85).setDepth(46)));
        const b: Ball = { img, ring, arrival: this.time.now + flightMs, kind, alive: true };
        balls.push(b);
        this.sfx(kind === "fire" ? "fireball2" : "fireball3", 0.4, kind === "violet" ? 1.3 : 1);
        this.tweens.add({ targets: ring, scaleX: 0.42, scaleY: 0.42, duration: flightMs, ease: "Linear" }); // the timing ring closes at the guard
        this.tweens.add({
          targets: img,
          x: zx,
          y: zy,
          duration: flightMs,
          ease: "Linear",
          onUpdate: () => ring.setPosition(img.x, img.y),
          onComplete: () => {
            ring.destroy();
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
                if (b.kind === "fire") {
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
                  failContinue("his fire finds you!");
                } else {
                  // the violet drifts past, revealed as nothing — well left alone
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
      const cfg = shots[Math.min(this.arenaDealIdx, shots.length - 1)];
      zone.setPosition(this.hero.x + 64, GROUND_Y - 42); // the guard follows the hero's ground
      const doFake = Math.random() < (cfg.fake ?? 0);
      const doPair = !doFake && Math.random() < (cfg.pair ?? 0);
      if (this.orc && !this.orcDying) {
        this.orc.play("boss-attack").once("animationcomplete", () => {
          if (this.orc && this.orcAnim === "boss" && !this.orcDying) this.orc.play("boss-idle");
        });
      }
      this.sfx("fireball1", 0.3, 0.85);
      this.time.delayedCall(240, () => {
        if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
        if (doFake) {
          // nothing leaves his hand — then the REAL serve, fast and mean
          this.time.delayedCall(460, () => {
            if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
            if (this.orc && !this.orcDying) this.orc.play("boss-attack");
            launch("fire", cfg.castMs * 0.85, 180);
          });
        } else if (doPair) {
          launch("violet", cfg.castMs, 0);
          launch("fire", cfg.castMs, TENNIS_PAIR_STAGGER_MS);
        } else {
          launch("fire", cfg.castMs, 0);
        }
      });
    };

    throwShot();
  }

  /** Found him: lunge, land the blow — a red-zone hit shatters the whole ward. */
  private arenaHit(gen: number, settle: () => boolean, fig: Phaser.GameObjects.Sprite, castFrac: number) {
    if (!settle()) return;
    const crit = castFrac >= ARENA_CRIT_FRAC; // the daring strike, mid-cast
    this.sfx("hit3", 0.55);
    buzz(crit ? 30 : 20);
    fig.setTintFill(0xffffff);
    this.time.delayedCall(90, () => fig.clearTint());

    // the hero lunges from the lane; the blow lands as sparks at the portal
    this.heroLockX = true;
    this.playCombo(["hero-attack2"], "hero-idle");
    this.sfx("swing2", 0.35);
    this.tweens.add({ targets: this.hero, x: this.hero.x + 26, duration: 140, yoyo: true, ease: "Quad.easeOut" });
    const slash = this.inBox(
      this.add
        .particles(fig.x, fig.y - 20, "spark", {
          speed: { min: 120, max: 320 }, lifespan: { min: 200, max: 480 },
          scale: { start: crit ? 1.8 : 1.3, end: 0 }, blendMode: "ADD", tint: crit ? 0xfff2b0 : 0xbfefff, emitting: false,
        })
        .setDepth(44),
    );
    slash.explode(crit ? 40 : 22);
    this.time.delayedCall(700, () => slash.destroy());

    this.time.delayedCall(300, () => {
      if (gen !== this.arenaGen) return;
      this.heroLockX = false;
      const ward = ARENA_WARDS[this.arenaWard];

      if (crit) {
        // struck him with the cast burning red — the ENTIRE ward gives way
        this.arenaDealsDone += ward.deals.length - this.arenaDealIdx;
        this.crackWard(gen, true);
        return;
      }

      this.arenaDealsDone++;
      this.arenaDealIdx++;
      this.drainBossBar();
      if (this.arenaDealIdx >= ward.deals.length) {
        this.crackWard(gen, false);
      } else {
        this.cameras.main.shake(150, 0.005);
        this.sfx("block3", 0.4, 1.2);
        this.notice("STAGGERED — once more!", "#bfefff");
        this.clearArenaObjs();
        this.time.delayedCall(750, () => {
          if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
          this.playArenaDeal(gen);
        });
      }
    });
  }

  /** A ward gives out: fanfare, flawless refund, his taunt, then the next game. */
  private crackWard(gen: number, whole: boolean) {
    const flawless = !this.arenaWardMissed;
    this.drainBossBar();
    this.cameras.main.shake(whole ? 300 : 220, whole ? 0.01 : 0.007);
    this.sfx(`combo${3 + this.arenaWard}`, 0.55); // combo3/4/5 as the wards fall
    this.notice(
      whole
        ? "PERFECT — THE WARD SHATTERS WHOLE!"
        : this.arenaWard === 0
          ? "A WARD SHATTERS!"
          : this.arenaWard === 1
            ? "ANOTHER WARD BREAKS!"
            : "HIS LAST WARD FALLS!",
      whole ? "#ffd24a" : "#8ff4ff",
    );
    if (flawless) {
      this.run.block += 1; // your poise holds — a guard charge comes back
      this.refreshHud();
      this.time.delayedCall(700, () => {
        if (gen === this.arenaGen) this.floatGuard(this.hero.x + 24, GROUND_Y - 90, 1);
      });
    }
    const taunt = ARENA_WARDS[this.arenaWard].taunt;
    this.clearArenaObjs();

    this.arenaWard++;
    this.arenaDealIdx = 0;
    this.arenaWardMissed = false;
    const done = this.arenaWard >= ARENA_WARDS.length;
    if (!done)
      this.time.delayedCall(950, () => {
        if (gen === this.arenaGen && this.arenaActive) this.notice(taunt, "#ff9d6a");
      });
    this.time.delayedCall(done ? 800 : 1900, () => {
      if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
      if (done) this.arenaExecution(gen);
      else this.showWardIntro(gen);
    });
  }

  /** A decoy, or too slow: the real Malgrim answers with fire. Guard absorbs it. */
  private arenaFail(
    gen: number,
    settle: () => boolean,
    why: "decoy" | "timeout",
    realFig: Phaser.GameObjects.Sprite,
    tapped: Phaser.GameObjects.Sprite,
  ) {
    if (!settle()) return;
    this.arenaWardMissed = true; // the flawless refund is off the table this ward
    if (why === "decoy") {
      this.notice("a decoy!", "#ff8a6a");
      const puff = this.inBox(this.add.image(tapped.x, tapped.y - 16, "orb").setBlendMode(Phaser.BlendModes.ADD).setTint(0xff5030).setScale(1).setDepth(44));
      this.tweens.add({ targets: puff, scale: 2.6, alpha: 0, duration: 380, onComplete: () => puff.destroy() });
      this.sfx("fireball1", 0.35, 0.8);
    } else {
      this.notice("too slow — he casts!", "#ff8a6a");
    }

    // his punishment bolt streaks from wherever he truly stands
    const bolt = this.inBox(
      this.add.image(realFig.x, realFig.y - 20, "bolt").setBlendMode(Phaser.BlendModes.ADD).setTint(0xff7733).setScale(1.5).setDepth(46),
    );
    this.sfx(this.pick(["fireball2", "fireball3"]), 0.5);
    this.tweens.add({
      targets: bolt,
      x: this.hero.x + 8,
      y: GROUND_Y - 40,
      duration: ARENA_FIREBALL_MS,
      ease: "Sine.easeIn",
      onComplete: () => {
        bolt.destroy();
        if (gen !== this.arenaGen) return;
        this.arenaStrikeHero();
        this.clearArenaObjs();
        this.time.delayedCall(800, () => {
          if (gen !== this.arenaGen || this.run.over || !this.arenaActive) return;
          this.playArenaDeal(gen); // same deal, fresh shuffle
        });
      },
    });
  }

  /** Third ward down: he staggers back into the lane, helpless. One tap ends it. */
  private arenaExecution(gen: number) {
    if (gen !== this.arenaGen || this.run.over || !this.orc) return;
    this.clearArenaObjs();
    this.notice("HE IS EXPOSED — STRIKE HIM DOWN!", "#ffd24a");
    this.sfx("summon", 0.45, 0.8);

    // he re-materialises in the lane, drained and flickering
    this.orc.setAlpha(0).setTint(0x9a94b8).play("boss-hurt");
    this.tweens.add({ targets: this.orc, alpha: 1, duration: 420 });
    this.orc.once("animationcomplete", () => {
      if (this.orc && this.orcAnim === "boss") this.orc.play("boss-idle");
    });

    const ring = this.arenaObjs[this.arenaObjs.push(
      this.inBox(this.add.ellipse(this.orc.x, GROUND_Y - 34, 96, 116).setStrokeStyle(4, 0xffd24a, 0.95).setDepth(44)),
    ) - 1] as Phaser.GameObjects.Ellipse;
    this.tweens.add({ targets: ring, scaleX: 1.18, scaleY: 1.18, alpha: 0.4, duration: 480, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    const zone = this.arenaObjs[this.arenaObjs.push(
      this.inBox(this.add.rectangle(this.orc.x, GROUND_Y - 40, 150, 170, 0xffffff, 0.001).setDepth(45).setInteractive({ useHandCursor: true })),
    ) - 1] as Phaser.GameObjects.Rectangle;
    zone.on("pointerdown", () => this.arenaFinisher(gen));
  }

  /** The finishing strike: dash across the arena and end him. */
  private arenaFinisher(gen: number) {
    if (gen !== this.arenaGen || this.run.over || !this.orc || this.orcDying) return;
    this.clearArenaObjs(); // ring + tap zone
    this.heroLockX = true;
    this.hero.play("hero-walk", true);
    this.sfx("swing3", 0.5);
    this.tweens.add({
      targets: this.hero,
      x: this.orc.x - 52,
      duration: 260,
      ease: "Quad.easeIn",
      onComplete: () => {
        if (gen !== this.arenaGen || this.run.over) {
          this.heroLockX = false;
          return;
        }
        this.playCombo(["hero-attack3"]);
        this.sfx("combo6", 0.6);
        buzz(40);
        this.cameras.main.shake(320, 0.012);
        const flash = this.inBox(this.add.rectangle(CXC, LANE_Y + LANE_H / 2, UI_W, LANE_H, 0xfff2d8, 0.85).setDepth(48));
        this.tweens.add({ targets: flash, fillAlpha: 0, duration: 420, onComplete: () => flash.destroy() });
        this.time.delayedCall(260, () => {
          if (gen !== this.arenaGen) return;
          if (this.run.enemy) dealDamage(this.run, this.run.enemy.hp); // the killing blow: score, surge, the lot
          this.killOrc(700); // death + bossSpoils + the road onward
          this.surgeAfterKill(800);
          this.arenaActive = false;
          this.time.delayedCall(1100, () => this.showBoard()); // the puzzle rises back as the coins rain
        });
      },
    });
  }

  /** Retract the puzzle — the tiles sink away so the portals own the space. */
  private hideBoard(): Promise<void> {
    return new Promise((res) => {
      let pending = 0;
      for (let r = 0; r < H; r++)
        for (let c = 0; c < W; c++) {
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
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
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
    if (this.orc) {
      this.tweens.killTweensOf(this.orc);
      this.orc.setAlpha(1);
    }
    this.showBoard();
  }

  private strike(force = false) {
    if (!force && this.tutorial?.active) return; // the tutorial scripts its own strikes
    if (this.run.over || this.phase !== "fight" || this.orcDying || !this.orc || !this.run.enemy) return;
    const blockBefore = this.run.block;
    const net = enemyStrike(this.run);
    const isBoss = this.orcAnim === "boss";
    const blocked = this.run.block < blockBefore;
    if (isBoss) this.sfx(this.pick(["fireball1", "fireball2", "fireball3"]), 0.55); // fire roars across the gap
    else this.sfx("slimeatk", 0.3); // slime lunges
    if (blocked) // armour soaked some/all of it -> flare + clang on contact
      this.time.delayedCall(90, () => {
        this.sfx(this.pick(["block1", "block2", "block3"]), 0.45);
        const used = blockBefore - this.run.block;
        if (used > 1)
          this.floatChip(this.hero.x + 28, GROUND_Y - 100, `-${used}🛡`, {
            size: 20,
            tint: [0xeef6ff, 0xbfe0ff, 0x6ea8e0, 0x3a6a9a],
            stroke: "#050d16",
            font: EMOJI_FONT,
          }); // deep foes chew through the guard — the cost is shown, not hidden
        this.showBlockImpact(isBoss, net <= 0);
        this.boardGuardRipple(); // the guard's clang rings around the puzzle frame too
      });
    this.orc.play(`${this.orcAnim}-attack`).once("animationcomplete", () => {
      if (this.orc && !this.orcDying) this.orc.play(`${this.orcAnim}-idle`);
    });
    if (net > 0) {
      this.cameras.main.shake(isBoss ? 260 : 150, isBoss ? 0.009 : 0.006);
      this.hero.setTint(isBoss ? 0xffa060 : 0xff8888); // seared vs. slimed
      this.time.delayedCall(isBoss ? 200 : 130, () => this.hero.clearTint());
      this.boardHitReact(isBoss); // the blow lands where the player is LOOKING: on the board
    } else if (blocked) {
      // PERFECT block: run.ts already banked the riposte shove (BLOCK_PUSHBACK)
      // — the hero steps up via update(); sell the foe being knocked away too
      this.time.delayedCall(120, () => {
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
      });
    }
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
    const shade = this.inBox(this.add.rectangle(CXC, GRID_Y + 16, GRID_W, 32, 0x8a1622, 0).setDepth(40));
    const rim = this.inBox(this.add.rectangle(CXC, GRID_Y - 3, GRID_W, 3, 0xff4a3a, 0).setDepth(40).setBlendMode(Phaser.BlendModes.ADD));
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
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        const t = this.tiles[r][c];
        if (!t) continue;
        const a = (Math.random() * 2 - 1) * (isBoss ? 5 : 3.5);
        this.tweens.add({ targets: t, angle: a, duration: 45, yoyo: true, repeat: 1, ease: "Sine.easeInOut", delay: Math.random() * 60 });
      }
    const wash = this.inBox(this.add.rectangle(CXC, GRID_Y + GRID_H / 2, GRID_W, GRID_H, 0xc03028, isBoss ? 0.16 : 0.11).setDepth(44));
    this.tweens.add({ targets: wash, fillAlpha: 0, duration: 260, ease: "Quad.easeOut", onComplete: () => wash.destroy() });
    // three raking claw lines, upper-right to lower-left across the board face
    const claw = this.inBox(this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(45).setAlpha(0.85));
    const cx0 = CXC + GRID_W * 0.22;
    const cy0 = GRID_Y + GRID_H * 0.18;
    for (let i = 0; i < 3; i++) {
      claw.lineStyle(i === 1 ? 5 : 3, 0xff6a4a, 0.9);
      claw.beginPath();
      claw.moveTo(cx0 + i * 34, cy0 + i * 10);
      claw.lineTo(cx0 - GRID_W * 0.34 + i * 34, cy0 + GRID_H * 0.5 + i * 10);
      claw.strokePath();
    }
    this.tweens.add({ targets: claw, alpha: 0, duration: 300, ease: "Quad.easeOut", onComplete: () => claw.destroy() });
  }

  /** A held block answers on the board too: a steel-blue ring pulses off the frame. */
  private boardGuardRipple() {
    const ring = this.inBox(
      this.add
        .rectangle(CXC, GRID_Y + GRID_H / 2, GRID_W + 10, GRID_H + 10)
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
    if (this.skeletonCharges > 0 || this.run.resources.keys >= CHEST_KEY_COST) void this.openChest();
    else this.chestLocked();
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
    const cont = this.chest!;
    this.chestActive = true;
    this.chestsOpened++;
    this.chestFast = false;
    // a dedicated SKIP button (not "tap anywhere") — random taps during the
    // reveal no longer accidentally fast-forward the payout
    const skipBtn = this.add
      .text(this.scale.width - 14, 14, "skip ▸", {
        fontFamily: "monospace", fontStyle: "bold", fontSize: "14px", color: "#dfe3ea",
        backgroundColor: "#14171f", padding: { x: 10, y: 6 },
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
    const ks = this.toLocal(this.resIcons[3].x, this.resIcons[3].y); // fly from the keys counter
    const key = this.inBox(
      this.add
        .text(ks.x, ks.y, freeOpen ? "🗝️" : "🔑", { fontFamily: EMOJI_FONT, fontSize: "22px" })
        .setOrigin(0.5)
        .setDepth(66)
        .setAlpha(freeOpen ? 0.8 : 1),
    );
    await this.tweenP(key, { x: cont.x, y: cont.y - 40, scale: 0.8, angle: 90, duration: 480, ease: "Quad.easeIn" });
    key.destroy();
    this.sfx("chest_unlock", 0.6);
    this.tweens.add({ targets: cont, angle: 3, duration: 60, yoyo: true, repeat: 3 });
    await this.cwait(500);

    // takeover — the world dims, the chest takes centre stage
    const CX = CXC;
    const CY = Math.round(CENTER_DH * 0.42); // blast centres on the centre column
    const veil = this.inBox(this.add.rectangle(CX, CENTER_DH / 2, CENTER_DW, CENTER_DH, 0x05060a, 0).setDepth(60));
    this.tweens.add({ targets: veil, fillAlpha: 0.82, duration: 380 });
    const big = this.inBox(this.add.image(cont.x, cont.y - 30, "chest-closed").setScale(2).setDepth(62));
    cont.destroy();
    this.chest = null;
    await this.tweenP(big, { x: CX, y: CY, scale: 3.6, duration: 620, ease: "Cubic.easeInOut" });

    // anticipation — three rattles, light bleeding from the seam... then a still beat
    const seam = this.inBox(this.add.rectangle(CX, CY - 26, 120, 5, 0xfff3c0, 0).setDepth(63).setBlendMode(Phaser.BlendModes.ADD));
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
    const flash = this.inBox(this.add.rectangle(CX, CENTER_DH / 2, CENTER_DW, CENTER_DH, 0xfff6d8, 0.9).setDepth(67));
    this.tweens.add({ targets: flash, fillAlpha: 0, duration: 260, ease: "Quad.easeOut", onComplete: () => flash.destroy() });
    this.cameras.main.shake(280, 0.011);
    this.sfx("chest_creak", 0.7);
    this.sfx("coin_pour", 0.85);
    const mkRay = (alpha: number, scale: number, angle: number) =>
      this.inBox(this.add.image(CX, CY - 14, "godray").setDepth(61).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(0.4).setAngle(angle).setData("a", alpha).setData("s", scale));
    const rays = [mkRay(0.6, 2.9, 0), mkRay(0.35, 3.8, 15)];
    for (const r of rays) {
      this.tweens.add({ targets: r, alpha: r.getData("a"), scale: r.getData("s"), duration: 550, ease: "Quad.easeOut" });
      this.tweens.add({ targets: r, angle: r.angle + (r.angle ? -360 : 360), duration: r.angle ? 14000 : 11000, repeat: -1 });
    }
    const coins = this.inBox(
      this.add
        .particles(CX, CY - 20, "coin", {
          speed: { min: 380, max: 760 }, angle: { min: 235, max: 305 }, gravityY: 1150,
          lifespan: { min: 900, max: 1400 }, scale: { min: 0.9, max: 1.6 }, rotate: { min: 0, max: 360 },
          emitting: false,
        })
        .setDepth(63),
    );
    const sparks = this.inBox(
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
    const title = this.inBox(
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
    const pulls = this.rollChest();
    const rowY = CY + 160;
    const rowX = (i: number) => CX - ((pulls.length - 1) * 92) / 2 + i * 92;
    const collected: { t: Phaser.GameObjects.Text; pull: ChestPull }[] = [];
    for (let i = 0; i < pulls.length; i++) {
      const pull = pulls[i];
      this.sfx(`combo${Math.min(2 + i, 6)}`, 0.5, 1 + i * 0.03); // escalating sting per pull
      const orb = this.inBox(this.add.image(CX, CY - 24, "orb").setDepth(64).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5));
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
      const t = this.inBox(
        this.add
          .text(CX, CY - 150, label, {
            fontFamily: EMOJI_FONT, fontStyle: "bold", fontSize: pull.kind === "item" ? "30px" : "26px",
            color: pull.kind === "item" ? "#ffd0f4" : pull.kind === "treasure" ? "#bfe6ff" : "#fff2b0",
            stroke: "#2a0c06", strokeThickness: 6,
          })
          .setOrigin(0.5)
          .setDepth(64)
          .setScale(0.2),
      );
      this.tweens.add({ targets: t, scale: 1.12, duration: 200, ease: "Back.easeOut" });
      // items bring their tooltip to the reveal: what it does + how it's used,
      // so the player learns the tool while the spotlight is on it (skip collapses this)
      if (pull.kind === "item" && pull.item) {
        const desc = this.inBox(
          this.add
            .text(CX, CY - 118, pull.item.desc, {
              fontFamily: "monospace", fontSize: "17px", color: "#efe6d4",
              stroke: "#14100c", strokeThickness: 4, align: "center", wordWrap: { width: 480 },
            })
            .setOrigin(0.5, 0)
            .setDepth(64)
            .setAlpha(0),
        );
        const how = this.inBox(
          this.add
            .text(CX, CY - 118, `· ${pull.item.hint} ·`, {
              fontFamily: "monospace", fontStyle: "bold", fontSize: "14px", color: "#c9a86a",
              stroke: "#14100c", strokeThickness: 3,
            })
            .setOrigin(0.5, 0)
            .setDepth(64)
            .setAlpha(0),
        );
        how.setY(desc.y + desc.height + 10);
        this.tweens.add({ targets: [desc, how], alpha: 1, duration: 220, delay: 140 });
        // read at your own pace — the reveal holds until a tap (skip ▸ still blows through)
        const go = this.inBox(
          this.add
            .text(CX, how.y + 34, "tap ▸", { fontFamily: "monospace", fontStyle: "bold", fontSize: "15px", color: "#9aa4b4", stroke: "#14100c", strokeThickness: 3 })
            .setOrigin(0.5, 0)
            .setDepth(64)
            .setAlpha(0),
        );
        this.tweens.add({ targets: go, alpha: 0.9, duration: 300, delay: 500, yoyo: true, repeat: -1 });
        await this.waitTap();
        this.tweens.add({ targets: [desc, how, go], alpha: 0, duration: 180, onComplete: () => { desc.destroy(); how.destroy(); go.destroy(); } });
      } else {
        await this.cwait(560);
      }
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
    for (let i = 0; i < collected.length; i++) {
      const { t, pull } = collected[i];
      const slot = pull.kind === "item" ? itemTargets[itemTarget++] : undefined;
      // slots + resource counter are screen-space panels; the reveal lives in the centre column
      const tgt = slot ? this.toLocal(slot.x, slot.y) : this.toLocal(this.resIcons[0].x, this.resIcons[0].y);
      const tx = tgt.x;
      const ty = tgt.y;
      this.tweens.add({
        targets: t, x: tx, y: ty, scale: 0.25, duration: 330, delay: i * 110, ease: "Cubic.easeIn",
        onComplete: () => {
          t.destroy();
          this.applyPull(pull, slot); // resources tick up as each one lands
          this.sfx(this.pick(["coin1", "coin3"]), 0.4, 1 + i * 0.06);
        },
      });
    }
    await this.cwait(collected.length * 110 + 430);
    this.sfx("pouch", 0.6);
    // the whole haul's score lands as one gold thump right where the chest stood
    const chestScore = pulls.reduce((s, p) => s + 25 + p.n * 2, 0);
    this.floatScore(CX, CY - 40, chestScore, { size: 42, sparkle: true });
    coins.destroy();
    sparks.destroy();

    // back to the road
    this.scale.off("resize", repositionSkip);
    skipBtn.destroy();
    this.chestActive = false;
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

  /** Hold a chest beat until the player taps (anywhere). Skipping waives the wait. */
  private waitTap(): Promise<void> {
    if (this.chestFast) return Promise.resolve();
    return new Promise((res) => this.input.once("pointerdown", () => res()));
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
    this.busy = true;
    const P = SWORD; // 0
    const Q = 2; // shield
    const b = H - 1; // bottom row
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
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
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
    if (this.run.over || this.chestActive || this.tutorial?.active) return;
    if (this.arenaActive) {
      this.notice("not while Malgrim plays his game", "#9aa0ab");
      return;
    }
    this.hideTip();
    if (this.targeting) {
      // tapping the armed slot again (or any slot) backs out of aiming
      this.cancelTargeting();
      return;
    }

    const needsFoe = def.id === "stormcall" || def.id === "cinderflask" || def.id === "spurs";
    if (needsFoe && (this.phase !== "fight" || !this.orc || this.orcDying || !this.run.enemy)) {
      this.notice("no foe before you", "#9aa0ab");
      return;
    }
    const needsBoard = def.target !== "none" || def.id === "dice" || def.id === "lodestone";
    if (needsBoard && this.busy) {
      this.notice("the board is still settling", "#9aa0ab");
      return;
    }

    // aimed items arm targeting and consume only when the shot lands
    if (def.target !== "none") {
      this.enterTargeting(def, slot);
      return;
    }

    switch (def.id) {
      case "whetstone":
        this.run.whetstone += WHETSTONE_CHARGES;
        this.notice(`whetstone — next ${WHETSTONE_CHARGES} sword matches strike full combos`, "#ffe08a");
        break;
      case "stormcall":
        this.castStorm();
        break;
      case "warhorn":
        this.hornLeft += WARHORN_SECS;
        this.run.surgeMult = 2;
        this.notice("the horn sounds — kills surge twice as far", "#ffe08a");
        this.sfx("summon", 0.45, 1.5);
        break;
      case "cinderflask": {
        this.burnLeft = Math.max(this.burnLeft, BURN_SECS);
        this.burnAcc = 0;
        this.notice("the foe catches fire", "#ff9d6a");
        this.sfx(this.pick(["fireball1", "fireball2", "fireball3"]), 0.5);
        this.orc?.setTint(0xff9060);
        this.time.delayedCall(220, () => this.orc?.clearTint());
        break;
      }
      case "waystone":
        this.freezeLeft += WAYSTONE_SECS;
        this.notice("the world holds its breath", "#8fd0ff");
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
        this.notice("the charm keeps itself — it acts when death comes", "#ff9d7a");
        return; // NOT consumed by tapping
      case "spurs":
        if (this.spursActive) {
          this.notice("this foe is already slowed", "#9aa0ab");
          return; // not consumed
        }
        this.spursActive = true;
        this.notice("the foe's strikes slow", "#8fd0ff");
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
        this.notice("the next chest opens free", "#ffe08a");
        this.sfx("chest_unlock", 0.5, 1.2);
        break;
      case "pan":
        this.panCharges++;
        this.notice(`the next chest yields +${PAN_EXTRA_PULLS} pulls`, "#ffe08a");
        this.sfx("coin2", 0.5);
        break;
      case "ledger":
        this.ledgerLeft += LEDGER_SECS;
        this.run.resMult = 2;
        this.notice("resource matches pay double", "#ffe08a");
        this.sfx("coin3", 0.5);
        break;
      case "ink":
        if (this.inkActive) {
          this.notice("the road is already charted", "#9aa0ab");
          return; // not consumed
        }
        this.inkActive = true;
        this.notice("the road ahead reveals itself", "#8fd0ff");
        this.sfx("pickup", 0.5, 1.1);
        break;
    }
    this.consumeSlot(slot);
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
  private castStorm() {
    const res = castBlast(this.run, STORMCALL_DMG); // storm magic minds the ward like any spell
    const spell: SpellOutcome = { dmg: res.dmg, tier: 4, mod: res.mod, burn: false };
    this.updateEnemyBar();
    if (res.killed) {
      this.heroLockX = true;
      const impactAt = this.performCast(spell, true, 0, 0x8fd0ff); // storm-blue bolt
      this.surgeAfterKill(impactAt + 120);
    } else {
      this.performCast(spell, false, 0, 0x8fd0ff);
    }
    this.notice("STORMCALL!", "#bfe6ff");
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
    if (msg) this.notice(msg, "#8fd0ff");
    this.boardFlash(0.18);
    const outs: Promise<void>[] = [];
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        const t = this.tiles[r][c];
        if (!t) continue;
        outs.push(new Promise((res) => this.tweens.add({ targets: t, scale: 0, angle: 90, duration: 160, delay: (r + c) * 8, onComplete: () => res() })));
      }
    await Promise.all(outs);
    this.rebuildBoard();
    for (let g = 0; g < 10 && !hasPossibleMove(this.grid); g++) this.rebuildBoard(); // never deal a dead board
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
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
    const counts: Record<number, number> = {};
    const cells: Coord[] = [];
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++)
        if (this.grid[r][c] === WOOD || this.grid[r][c] === ORE) cells.push({ r, c });
    if (!cells.length) {
      this.busy = false;
      this.notice("no wood or ore on the board", "#9aa0ab");
      return;
    }
    this.sfx("coin_pour", 0.5);
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
    const outcome = applyMatches(this.run, counts);
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
      this.add.rectangle(CXC, GRID_Y + GRID_H / 2, GRID_W + 6, GRID_H + 6).setStrokeStyle(3, 0xffe08a, 0.9).setDepth(72),
    );
    this.tweens.add({ targets: ring, alpha: 0.35, duration: 420, yoyo: true, repeat: -1 });
    const txtBg = this.inBox(this.add.rectangle(CXC, GRID_Y + 26, 460, 34, 0x0e1015, 0.88).setStrokeStyle(2, 0x8a6d3a).setDepth(73));
    const txt = this.inBox(
      this.add
        .text(CXC, GRID_Y + 26, `${label} · tap elsewhere to cancel`, { fontFamily: EMOJI_FONT, fontSize: "15px", color: "#ffe08a" })
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
        if (r < 0 || r >= H || c < 0 || c >= W || this.grid[r][c] === EMPTY) continue;
        const type = this.grid[r][c];
        counts[type] = (counts[type] ?? 0) + 1;
        const t = this.tiles[r][c];
        if (t) fades.push(this.shatter(t, type));
        this.tiles[r][c] = null;
        this.grid[r][c] = EMPTY;
      }
    await Promise.all(fades);
    const outcome = applyMatches(this.run, counts);
    this.tutorial?.onCascade(counts);
    if (outcome.damage > 0) this.onCombat(outcome, outcome.swords); // swings and/or a cast, as the blast decided
    this.refreshHud();
    await this.collapse();
    await this.resolve();
    if (!this.run.over && !hasPossibleMove(this.grid)) await this.animatedReshuffle("no moves left — fresh tiles");
    this.busy = false;
  }

  /** Chromatic Prism: every tile of the picked kind transmutes into swords. */
  private async prismConvert(srcType: number) {
    this.busy = true;
    this.sfx("spell", 0.6);
    this.boardFlash(0.22);
    const converts: Coord[] = [];
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) if (this.grid[r][c] === srcType) converts.push({ r, c });
    for (const { r, c } of converts) {
      this.grid[r][c] = SWORD;
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

    const W_TIP = 236;
    const PAD = 12;
    const name = this.add
      .text(PAD, PAD, def.name, { fontFamily: EMOJI_FONT, fontStyle: "bold", fontSize: "15px", color: "#ffe08a" })
      .setOrigin(0, 0);
    const tier = this.add
      .text(W_TIP - PAD, PAD + 1, def.tier, { fontFamily: "monospace", fontSize: "11px", color: TIER_COLORS[def.tier] })
      .setOrigin(1, 0);
    const desc = this.add
      .text(PAD, PAD + 24, def.desc, { fontFamily: EMOJI_FONT, fontSize: "13px", color: "#dfe3ea", lineSpacing: 5, wordWrap: { width: W_TIP - PAD * 2 } })
      .setOrigin(0, 0);
    const hint = this.add
      .text(PAD, PAD + 28 + desc.height, `▸ ${def.hint}`, { fontFamily: "monospace", fontSize: "11px", color: "#8fd0ff" })
      .setOrigin(0, 0);
    const hTip = PAD + 28 + desc.height + hint.height + PAD;
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
    const t = this.inBox(
      this.add
        .text(CXC, GRID_Y + 54, msg, { fontFamily: EMOJI_FONT, fontStyle: "bold", fontSize: "19px", color, stroke: "#0a0b0f", strokeThickness: 5 })
        .setOrigin(0.5)
        .setDepth(75)
        .setScale(0.4),
    );
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: "Back.easeOut" });
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 800, delay: 500, ease: "Quad.easeIn", onComplete: () => t.destroy() });
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
    return { x: this.centerBox.x + x * this.centerScale, y: this.centerBox.y + y * this.centerScale };
  }
  public uiScale() {
    return this.centerScale;
  }
  public laneRectD() {
    return { x: GRID_X, y: LANE_Y, w: UI_W, h: LANE_H };
  }
  public boardRectD() {
    return { x: GRID_X, y: GRID_Y, w: GRID_W, h: GRID_H };
  }
  public cellRectD(r: number, c: number) {
    return { x: GRID_X + c * TILE, y: GRID_Y + r * TILE, w: TILE, h: TILE };
  }
  /** Bounding box of HUD resource rows [from..to] (wood, ore, treasure, keys) — already screen px. */
  public resourceRowsRect(from: number, to: number) {
    const a = this.resIcons[from];
    const b = this.resIcons[to];
    return { x: a.x - 10, y: a.y - 22, w: 180, h: b.y - a.y + 44 };
  }
  /** Scripted strike for the tutorial beats; pierce ignores banked block (the knockback demo). */
  public demoStrike(pierce: boolean): boolean {
    if (this.run.over || this.phase !== "fight" || !this.orc || this.orcDying || !this.run.enemy) return false;
    if (pierce) {
      const saved = this.run.block;
      this.run.block = 0;
      this.strike(true);
      this.run.block = saved;
    } else this.strike(true);
    return true;
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
    const b = H - 1;
    const c0 = Math.floor(W / 2) - 1;
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
  private showHits(hits: number[], combo: string[], mod: DamageMod) {
    let t = 0;
    combo.forEach((key, i) => {
      const dmg = hits[i] ?? 0;
      if (dmg > 0)
        this.time.delayedCall(t + 100, () => {
          this.floatDamage(dmg, i === 0, mod);
          if (i === 0) this.teachDefense(mod); // name the rule as the first blow lands
        });
      t += this.anims.get(key)?.duration ?? 300;
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

  private floatDamage(n: number, big = true, mod: DamageMod = "none") {
    const x = (this.orc?.x ?? SAFE_X) + (Math.random() * 26 - 13);
    const y = GROUND_Y - 64 - (big ? 0 : 8);
    // the defense speaks through the number: gray = soaked, hot gold = tore through
    const size = (big ? 28 : 18) + (mod === "weak" ? 6 : mod === "resist" ? -3 : 0);
    const color = mod === "resist" ? "#aab2bd" : mod === "weak" ? "#ffd24a" : big ? "#fff2b0" : "#ffca66";
    const stroke = mod === "resist" ? "#20242b" : "#38180c";
    const t = this.inBox(this.add
      .text(x, y, `-${n}`, {
        fontFamily: "monospace",
        fontStyle: "bold",
        fontSize: `${size}px`,
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
    // combo stingers removed for now (files still load; re-add this.sfx(`combo${…}`) to bring back)
    await new Promise<void>((res) => this.time.delayedCall(300 + d * 60, res)); // the slow-down beat
    this.cameras.main.shake(140, 0.003 + 0.0015 * d);
    this.boardFlash(0.14 + 0.05 * d);
  }

  private showCombo(depth: number) {
    const tint = ["#ffe08a", "#ffd24a", "#ff9d3a", "#ff6a3a", "#ff466a"][Math.min(depth - 2, 4)];
    const t = this.inBox(this.add
      .text(CXC, GRID_Y + GRID_H * 0.32, `COMBO ×${depth}`, {
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
    const f = this.inBox(this.add.rectangle(CXC, GRID_Y + GRID_H / 2, GRID_W, GRID_H, 0xffffff, alpha).setDepth(45));
    this.tweens.add({ targets: f, alpha: 0, duration: 200, ease: "Quad.easeOut", onComplete: () => f.destroy() });
  }

  private showGameOver() {
    this.overShown = true;
    this.fadeOutMusic(900); // the song dies with him
    this.orc?.stop();
    this.hero.play("hero-death"); // the hero falls where the dark caught him
    // the big flat death pose sprawls left of the skull and off the lane — clamp it back on
    this.hero.x = Math.max(this.hero.x, PADIN + 8 + DEATH_BODY_LEFT * HERO_SCALE);

    // the caravan keeps what you carried: bank resources + quest stats
    const r = this.run.resources;
    bankRun(loadMeta(), { wood: r.wood, ore: r.ore, treasure: r.treasure, kills: this.run.killed, chests: this.chestsOpened });

    // let the death animation land, then fade in the game-over screen (full viewport)
    this.time.delayedCall(850, () => {
      const w = this.scale.width;
      const h = this.scale.height;
      const veil = this.add.rectangle(w / 2, h / 2, w, h, 0x05060a, 0.72).setAlpha(0).setDepth(80);
      const title = this.add
        .text(w / 2, h / 2 - 56, "THE DARK TAKES YOU", { fontFamily: "monospace", fontStyle: "bold", fontSize: "34px", color: "#e6e8ee" })
        .setOrigin(0.5)
        .setDepth(81)
        .setAlpha(0);
      const stats = this.add
        .text(w / 2, h / 2 - 10, `Depth ${this.run.killed}    Score ${this.run.score}`, { fontFamily: "monospace", fontSize: "20px", color: "#ffe08a" })
        .setOrigin(0.5)
        .setDepth(81)
        .setAlpha(0);
      const banked = this.add
        .text(w / 2, h / 2 + 26, `banked  🪵 ${r.wood}   🪨 ${r.ore}   💎 ${r.treasure}`, { fontFamily: EMOJI_FONT, fontSize: "17px", color: "#a9e6a9" })
        .setOrigin(0.5)
        .setDepth(81)
        .setAlpha(0);
      const hint = this.add
        .text(w / 2, h / 2 + 68, "tap to return to camp", { fontFamily: "monospace", fontSize: "16px", color: "#9aa0ab" })
        .setOrigin(0.5)
        .setDepth(81)
        .setAlpha(0);
      this.tweens.add({ targets: veil, alpha: 0.72, duration: 400 });
      this.tweens.add({ targets: [title, stats, banked], alpha: 1, duration: 400 });
      this.tweens.add({ targets: hint, alpha: 1, duration: 350 });
      this.tweens.add({ targets: hint, alpha: 0.3, duration: 700, yoyo: true, repeat: -1, delay: 400 });
      this.time.delayedCall(500, () => this.input.once("pointerdown", () => this.scene.start("camp"))); // lick your wounds, spend, retry
    });
  }

  // --- tile tweens (shared by swap / collapse) ---
  private moveTo(t: Phaser.GameObjects.Container, r: number, c: number): Promise<void> {
    return new Promise((res) => {
      this.tweens.add({ targets: t, x: this.xFor(c), y: this.yFor(r), duration: 140, ease: "Quad.easeInOut", onComplete: () => res() });
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
  /** Copy one composite tile face to an offscreen canvas for crack slicing. */
  /**
   * Composite the potion tile face: the treasure tile's ironbound frame with
   * its inset repainted dark and a glowing flask stamped in. Placeholder until
   * a real tiles/potion.png is drawn — keeps the shared frame silhouette.
   */
  private buildPotionArt() {
    if (this.textures.exists(POTION_ART_KEY)) return;
    const src = this.textures.get("tile-treasure").getSourceImage() as HTMLImageElement;
    const cv = document.createElement("canvas");
    cv.width = cv.height = 84;
    const g = cv.getContext("2d")!;
    g.drawImage(src, 0, 0, 84, 84);
    // repaint the inset so the treasure icon vanishes beneath a dark apothecary green
    g.beginPath();
    g.roundRect(15, 15, 54, 54, 9);
    g.fillStyle = "#101712";
    g.fill();
    g.strokeStyle = "rgba(140,220,170,0.14)";
    g.lineWidth = 2;
    g.stroke();
    // a soft green glow behind the flask so it reads as the special tile it is
    const gr = g.createRadialGradient(42, 44, 2, 42, 44, 27);
    gr.addColorStop(0, "rgba(120,255,170,0.55)");
    gr.addColorStop(1, "rgba(120,255,170,0)");
    g.fillStyle = gr;
    g.fillRect(15, 15, 54, 54);
    g.font = '34px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("🧪", 42, 46);
    this.textures.addCanvas(POTION_ART_KEY, cv);
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

  /** Radial red edge-glow, stretched to the viewport — the peril vignette. */
  private buildVignetteArt() {
    if (this.textures.exists("vignette")) return;
    const S = 256;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const g = cv.getContext("2d")!;
    const gr = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.66);
    gr.addColorStop(0, "rgba(200,36,48,0)");
    gr.addColorStop(0.7, "rgba(200,36,48,0.5)");
    gr.addColorStop(1, "rgba(140,16,28,1)");
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    this.textures.addCanvas("vignette", cv);
  }

  private faceCanvas(type: number, S: number): HTMLCanvasElement {
    const cv = document.createElement("canvas");
    cv.width = S;
    cv.height = S;
    const cx = cv.getContext("2d")!;
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = "high";
    const src = this.textures.get(tileArtKey(type)).getSourceImage() as CanvasImageSource;
    cx.drawImage(src, 0, 0, S, S);
    return cv;
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

  /** Irregular crack pattern: a jittered impact point fanned out to random boundary points. */
  private crackTriangles(S: number): { x: number; y: number }[][] {
    const cx = S / 2 + (Math.random() * 2 - 1) * S * 0.22;
    const cy = S / 2 + (Math.random() * 2 - 1) * S * 0.22;
    const bp: { x: number; y: number }[] = [];
    const stepFrac = () => 0.38 + Math.random() * 0.32; // random spacing along each edge
    bp.push({ x: 0, y: 0 });
    let x = 0;
    while (x < S) { x = Math.min(S, x + S * stepFrac()); if (x < S - 1) bp.push({ x, y: 0 }); }
    bp.push({ x: S, y: 0 });
    let y = 0;
    while (y < S) { y = Math.min(S, y + S * stepFrac()); if (y < S - 1) bp.push({ x: S, y }); }
    bp.push({ x: S, y: S });
    x = S;
    while (x > 0) { x = Math.max(0, x - S * stepFrac()); if (x > 1) bp.push({ x, y: S }); }
    bp.push({ x: 0, y: S });
    y = S;
    while (y > 0) { y = Math.max(0, y - S * stepFrac()); if (y > 1) bp.push({ x: 0, y }); }
    return bp.map((a, i) => [{ x: cx, y: cy }, a, bp[(i + 1) % bp.length]]);
  }

  /** Pre-bake a few crack patterns per tile type; each shard is the face clipped to a triangle. */
  private buildTileFaces() {
    if (Object.keys(this.shardSets).length) return; // build once (survives scene restarts)
    const S = FACE;
    for (let type = 0; type < TYPES; type++) {
      const face = this.faceCanvas(type, S);
      const patterns: { key: string; cx: number; cy: number }[][] = [];
      for (let p = 0; p < SHARD_PATTERNS; p++) {
        patterns.push(
          this.crackTriangles(S).map((tri, i) => {
            const key = `sh${type}_${p}_${i}`;
            const cv = document.createElement("canvas");
            cv.width = S;
            cv.height = S;
            const ctx = cv.getContext("2d")!;
            ctx.beginPath();
            ctx.moveTo(tri[0].x, tri[0].y);
            ctx.lineTo(tri[1].x, tri[1].y);
            ctx.lineTo(tri[2].x, tri[2].y);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(face, 0, 0);
            this.textures.addCanvas(key, cv);
            return { key, cx: (tri[0].x + tri[1].x + tri[2].x) / 3, cy: (tri[0].y + tri[1].y + tri[2].y) / 3 };
          }),
        );
      }
      this.shardSets[type] = patterns;
    }
  }

  /** Shatter the tile into irregular shards that fly apart, tumble, and fall. */
  private shatter(t: Phaser.GameObjects.Container, type: number): Promise<void> {
    const S = FACE;
    const patterns = this.shardSets[type];
    const shards = patterns[(Math.random() * patterns.length) | 0];
    for (const sh of shards) {
      const ox = sh.cx - S / 2; // shard centroid offset from the tile centre
      const oy = sh.cy - S / 2;
      const img = this.inBox(this.add.image(t.x + ox, t.y + oy, sh.key).setOrigin(sh.cx / S, sh.cy / S).setDepth(41));
      this.frags.push({
        o: img,
        vx: ox * 5 + (Math.random() * 2 - 1) * 40, // burst outward from the impact...
        vy: oy * 3 - 90 - Math.random() * 130, //      ...with an upward pop
        vr: (Math.random() * 2 - 1) * 8,
        life: 0.8 + Math.random() * 0.4,
      });
    }
    t.destroy();
    return new Promise((res) => this.time.delayedCall(90, res));
  }
  private async collapse() {
    const anims: Promise<void>[] = [];
    for (let c = 0; c < W; c++) {
      let write = H - 1;
      for (let r = H - 1; r >= 0; r--) {
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
      const spawned = write + 1;
      for (let r = write; r >= 0; r--) {
        const type = randomType();
        this.grid[r][c] = type;
        const t = this.makeTile(r, c, type);
        t.y = this.yFor(r - spawned);
        this.tiles[r][c] = t;
        anims.push(this.moveTo(t, r, c));
      }
    }
    await Promise.all(anims);
  }
  private rebuildBoard() {
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        this.tiles[r][c]?.destroy();
        this.tiles[r][c] = null;
      }
    this.grid = makeInitialGrid();
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) this.tiles[r][c] = this.makeTile(r, c, this.grid[r][c]);
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0a0b0f",
  pixelArt: true,
  // RESIZE: canvas fills the #game element (100vw x 100vh); the scene re-lays-out on resize
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [TitleScene, CampScene, GameScene, MenuScene], // boot: title -> camp; DEPART starts the run, death returns; menu overlays camp/run
});

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
// Portrait is a hard pause: Safari cannot reliably lock an iPhone's orientation,
// so the DOM rotate gate covers the canvas while the run stops advancing.
let portraitPaused = false;
const refit = () => game.scale.refresh();
const enforceLandscape = () => {
  const portrait = window.innerHeight > window.innerWidth;
  if (portrait && !portraitPaused) {
    portraitPaused = true;
    game.loop.sleep();
  } else if (!portrait && portraitPaused) {
    portraitPaused = false;
    game.loop.wake();
    refit();
  }
};
window.visualViewport?.addEventListener("resize", () => {
  refit();
  enforceLandscape();
});
window.addEventListener("orientationchange", () =>
  setTimeout(() => {
    refit();
    enforceLandscape();
  }, 120),
);

// Installed web apps and supporting mobile browsers may grant a real lock after
// user activation. Failure is expected on ordinary iPhone Safari and is harmless.
const tryLandscapeLock = () => {
  const standalone =
    window.matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (value: "landscape") => Promise<void>;
  };
  if (standalone && orientation?.lock) void orientation.lock("landscape").catch(() => undefined);
};
window.addEventListener("pointerdown", tryLandscapeLock, { once: true, passive: true });
enforceLandscape();

initHaptics(); // set up the iOS haptic fallback element

// Dev-only handle for debugging; stripped from production builds.
if (import.meta.env.DEV) (globalThis as unknown as { __mbGame: Phaser.Game }).__mbGame = game;
