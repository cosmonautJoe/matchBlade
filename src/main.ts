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
  swap,
  hasPossibleMove,
} from "./board";
import {
  type RunState,
  type MatchOutcome,
  SWORD,
  KEY,
  TREASURE,
  WOOD,
  ORE,
  newRun,
  applyMatches,
  dealDamage,
  enemyStrike,
  spawnNext,
  scroll,
  BLOCK_PER_SHIELD,
  BOSS_EVERY,
  BOSS_SCROLL_MULT,
  BOSS_BOUNTY,
  BOSS_SURGE,
} from "./run";
import {
  type ItemDef,
  itemById,
  rollItem,
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
import { type MetaState, loadMeta, saveMeta, bankRun, questById, questProgress } from "./meta";
import { Tutorial } from "./tutorial";

// ---- layout ---------------------------------------------------------------
// The centre column (runner lane over the match board) is authored in these fixed
// "design" coordinates and lives inside `centerBox`, which layout() scales + centres
// to the live viewport. Side panels (resources / item slots) fill the leftover width,
// so the game fills any landscape screen — phone or desktop — with no letterboxing.
const TILE = 84;
const GRID_W = W * TILE; // 11*84 = 924
const GRID_H = H * TILE; // 5*84 = 420
const PADIN = 12; // inner padding of the centre column
const LANE_H = 240; // runner strip height (design)
const GRID_GAP = 14; // gap between lane and board

const LANE_Y = PADIN;
const GRID_X = PADIN; // board / lane left inset (design-local)
const GRID_Y = LANE_Y + LANE_H + GRID_GAP; // board top (design-local)
const CENTER_DW = GRID_W + PADIN * 2; // 948 — centre-column design width
const CENTER_DH = GRID_Y + GRID_H + PADIN; // centre-column design height
const CXC = CENTER_DW / 2; // centre-column horizontal centre (design-local)
const UI_W = GRID_W; // lane inner width

const SLOT_N = 6; // item slots down the right panel

// treasure chests — the Vampire-Survivors-style dopamine blast (DESIGN.md §4)
const CHEST_EVERY = 3; // a chest rolls in after every Nth kill
const CHEST_KEY_COST = 1; // banked keys needed to pop it
type ChestPull = { kind: "wood" | "ore" | "treasure" | "item"; n: number; icon: string; item?: ItemDef };
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
const FLOOR_H = 40; // grassy ground band the characters stand on
const GROUND_Y = LANE_Y + LANE_H - FLOOR_H; // feet / floor-surface line
// Foot fraction measured from each sheet (lowest opaque pixel) so they sit on the ground.
const HERO_ORIGIN = 0.734; // WarriorMan feet at y47/64
const SLIME_ORIGIN = 0.656; // slime base at y41/64
const SKULL_X = PADIN + 28; // death marker at the far left of the lane
const SAFE_X = PADIN + 300; // hero x at pressure 0
const ENGAGE_GAP = 180; // enemy centre sits this far right of the hero when fighting (widened for bigger sprites)
const ENTER_X = CENTER_DW + 80; // enemies walk in from off the right
const HERO_SCALE = 3.8; // WarriorMan in the taller lane
const SLIME_SCALE = 3.7; // ground slime
// boss: the Cindermage (Evil Wizard pack, CC0) — 150x150 frames, feet at y101, faces right natively
const BOSS_SCALE = 3.4;
const BOSS_ORIGIN = 0.675;
const BOSS_ENGAGE_GAP = 240; // the big robe (and his fire breath) needs a wider stance
const BOSS_NAME = "MALGRIM THE CINDERMAGE";
const RAIN_CHANCE = 0.35; // some runs the sky weeps — ambience swaps + rain streaks
const DEATH_BODY_LEFT = 27; // px the flat death pose extends left of the sprite x (measured in warrior.png); used to keep the corpse on-lane
const HP_W = 70;

// ---- runner tuning (safe to tweak / turn into upgrades later) --------------
const SCROLL_PER_SEC = 0.02; // pressure gained per second while engaged
const STRIKE_MS = 4800; // enemy strike cadence
const WALK_IN_MS = 850; // time for a new enemy to march into range
const TILE_SFX = 17; // number of tile-match sound variations (tile1..tileN)
const FACE = TILE - 8; // tile face square (64) — sliced into chaotic shards on a match
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

// ---- placeholder tile look (see DESIGN.md §3) -----------------------------
const TILE_COLORS = [
  0xd94b4b, // 0 sword     red
  0x9b59b6, // 1 staff     purple
  0x4b7bd9, // 2 shield    blue
  0x54c26e, // 3 key       green
  0xf2c14e, // 4 treasure  gold
  0x9c6b3f, // 5 wood      brown
  0x8a8f98, // 6 ore       gray
];
// icon per tile type: sword, staff, shield, key, treasure, wood, ore
const TILE_GLYPH = ["⚔️", "🪄", "🛡️", "🔑", "💎", "🪵", "🪨"];
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
  private phase: "advance" | "fight" | "chest" = "advance";
  private parallax: { sprite: Phaser.GameObjects.TileSprite; scroll: number }[] = [];
  private world: RunBiome = RUN_BIOMES.plains; // backdrop set for the current biome
  private floor!: Phaser.GameObjects.TileSprite;
  private hero!: Phaser.GameObjects.Sprite;
  private orc: Phaser.GameObjects.Sprite | null = null;
  private orcAnim = "orc"; // anim-key prefix of the current foe (orc / orc2 / orc3 / boss)
  private orcGap = ENGAGE_GAP; // engage distance for the current foe (wider for the boss)
  private orcDying = false;
  private bossBar: { root: Phaser.GameObjects.Container; fill: Phaser.GameObjects.Rectangle } | null = null;
  private rainy = false; // rolled per run: rain ambience + streaks over the lane
  private amb: Phaser.Sound.BaseSound | null = null; // looping forest bed under the run
  private heroLockX = false; // freeze hero x while a killing swing lands, then surge
  private enemyHpBar!: Phaser.GameObjects.Rectangle;
  private enemyHpBg!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private resIcons: Phaser.GameObjects.Text[] = []; // 🪵 🪨 💎 🔑 icons (left panel)
  private resVals: Phaser.GameObjects.Text[] = []; // matching counts, positioned tight to each icon
  private overShown = false;
  private lastScoreShown = 0; // pulse the SCORE readout only when it climbs

  // responsive shell: the lane + board live in centerBox (design coords), scaled to
  // fit the viewport; the side panels flank it and absorb the leftover width.
  private centerBox!: Phaser.GameObjects.Container;
  private centerScale = 1;
  private leftPanel!: Phaser.GameObjects.Rectangle;
  private rightPanel!: Phaser.GameObjects.Rectangle;
  private gearText!: Phaser.GameObjects.Text;
  private rotateHint!: Phaser.GameObjects.Text;

  // chests
  private chest: Phaser.GameObjects.Container | null = null; // the lane chest (body + key tag)
  private chestActive = false; // takeover sequence running — board input is frozen
  private chestFast = false; // tap-to-skip: shortens every remaining beat
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
    };
    for (const [k, f] of Object.entries(audio)) if (!this.cache.audio.exists(k)) this.load.audio(k, `sounds/${f}`);
    for (let i = 1; i <= TILE_SFX; i++)
      if (!this.cache.audio.exists(`tile${i}`)) this.load.audio(`tile${i}`, `sounds/tile${i}.wav`); // random tile-match sfx
  }

  create() {
    this.meta = loadMeta();
    this.run = newRun(this.meta.swordLevel); // forge levels bite through the whole run
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
    this.tip = null;
    this.tipFor = -1;
    this.holdTimer = null;
    this.holdShown = false;
    this.buffStr = "";
    this.buildTileFaces();
    this.buildChestArt();

    this.sound.volume = 0.7; // master sfx level

    this.buildAnims();
    this.buildGrassGround();
    this.buildPanels();
    this.centerBox = this.add.container(0, 0);
    this.buildLane();
    this.buildBoard();
    this.buildInput();
    this.layout();
    this.scale.off("resize", this.layout, this);
    this.scale.on("resize", this.layout, this);
    // the ScaleManager is global — drop our handler when the camp takes over
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off("resize", this.layout, this));

    // ambient forest bed under the whole run (rain variant on wet runs); the
    // sound manager outlives the scene, so stop it when the camp takes over
    this.amb = this.sound.add(this.rainy ? "amb_rain" : "amb_day", { volume: 0, loop: true });
    this.amb.play();
    this.tweens.add({ targets: this.amb, volume: this.rainy ? 0.34 : 0.22, duration: 1400 });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.amb?.stop();
      this.amb = null;
    });

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

    // strike cadence self-schedules so Scout's Spurs can stretch the interval mid-run
    const strikeLoop = () => {
      this.strike();
      this.time.delayedCall(this.spursActive ? SPURS_STRIKE_MS : STRIKE_MS, strikeLoop);
    };
    this.time.delayedCall(STRIKE_MS, strikeLoop);
    this.time.addEvent({ delay: 270, loop: true, callback: () => this.footstep() }); // hero jog cadence

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

  /** Reserve the side panels first (they must always show), then fit the centre column between them. */
  private layout() {
    const vw = this.scale.width;
    const vh = this.scale.height;
    const ins = this.safeInsets(); // stay clear of the notch + home indicator
    const x0 = ins.l;
    const y0 = ins.t;
    const uw = Math.max(120, vw - ins.l - ins.r);
    const uh = Math.max(120, vh - ins.t - ins.b);
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const leftW = Math.round(clamp(uw * 0.15, 118, 300));
    const rightW = Math.round(clamp(uw * 0.1, 84, 220));
    const availW = Math.max(80, uw - leftW - rightW);
    const s = Math.min(availW / CENTER_DW, uh / CENTER_DH);
    this.centerScale = s;
    const cw = CENTER_DW * s;
    const ch = CENTER_DH * s;
    const cx = Math.round(x0 + leftW + (availW - cw) / 2);
    const cy = Math.round(y0 + (uh - ch) / 2);
    this.centerBox.setScale(s).setPosition(cx, cy);
    // panels fill from the usable edges up to the centre; the reserve above guarantees
    // each is at least leftW / rightW wide, so they never vanish.
    this.layoutPanels(x0, y0, uw, uh, cx, cw);
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
    const padX = lLeft + 18;
    const rowH = Math.min(48, uh * 0.1);
    const topY = y0 + Math.max(26, uh * 0.11);
    for (let i = 0; i < this.resIcons.length; i++) {
      const y = Math.round(topY + i * rowH);
      this.resIcons[i].setPosition(padX, y);
      this.resVals[i].setPosition(padX + 40, y);
    }
    this.scoreText.setPosition(padX, Math.round(topY + this.resIcons.length * rowH + 16));
    this.questText.setPosition(padX, Math.round(topY + this.resIcons.length * rowH + 92));
    this.buffText.setPosition(padX, Math.round(topY + this.resIcons.length * rowH + 196));
    this.gearText.setPosition(padX, y0 + uh - 14);

    // right: item slots, vertical, centred
    const gap = 10;
    const slot = Math.max(24, Math.min(rw - 22, (uh * 0.92) / SLOT_N - gap));
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

    this.hero = this.inBox(
      this.add.sprite(SAFE_X, GROUND_Y, "warrior").setOrigin(0.5, HERO_ORIGIN).setScale(HERO_SCALE).play("hero-idle"),
    );

    this.enemyHpBg = this.inBox(this.add.rectangle(0, 0, HP_W, 10, 0x000000, 0.55).setOrigin(0.5).setVisible(false));
    this.enemyHpBar = this.inBox(this.add.rectangle(0, 0, HP_W, 10, 0xe05a5a).setOrigin(0, 0.5).setVisible(false));

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
    const rect = this.add.rectangle(0, 0, TILE - 8, TILE - 8, TILE_COLORS[type]).setStrokeStyle(2, 0x000000, 0.25);
    const disc = this.add.circle(0, 0, 23, 0x0a0a0a, 0.32); // keeps icons legible on any tile colour
    const label = this.add.text(0, 0, TILE_GLYPH[type], { fontFamily: EMOJI_FONT, fontSize: "34px" }).setOrigin(0.5);
    return this.inBox(this.add.container(this.xFor(c), this.yFor(r), [rect, disc, label]).setData("type", type));
  }

  // --- input ---
  private buildInput() {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.targeting) {
        this.onTargetTap(p); // an armed item is waiting for its board tap
        return;
      }
      if (this.busy || this.run.over || this.chestActive || this.tutorial?.lockBoard) return;
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
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
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
    if (this.orc && this.phase === "fight") this.orc.x = heroX + this.orcGap; // enemy pushes the hero toward the skull
    if (this.orc) {
      const barY = GROUND_Y - 56; // above the slime's head
      this.enemyHpBg.setPosition(this.orc.x, barY);
      this.enemyHpBar.setPosition(this.orc.x - HP_W / 2, barY);
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

    if (this.run.over && !this.overShown) {
      if (this.tryHearthRevive()) return; // the charm burns so you don't
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
    if (this.burnLeft > 0) {
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
    const parts: string[] = [];
    if (this.run.block >= BLOCK_PER_SHIELD / 2) parts.push(`🛡️×${Math.ceil(this.run.block / BLOCK_PER_SHIELD)}`);
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
    // the current engagement resolves first and isn't part of the forecast
    if (this.phase !== "chest" && !this.chest) {
      k++;
      sc++;
      if (this.run.enemy?.kind === "boss" || (this.orcAnim === "boss" && this.orc)) sc = CHEST_EVERY; // his hoard follows him out
    }
    while (out.length < n) {
      if (sc >= CHEST_EVERY) {
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

    // pick a slime variant: green early, blue joins mid-run, blue/dark deep (deeper foes look tougher)
    const k = this.run.killed;
    const pool = k < 3 ? ["orc"] : k < 8 ? ["orc", "orc2"] : ["orc2", "orc3"];
    this.orcAnim = Phaser.Utils.Array.GetRandom(pool);
    const idleTex = this.orcAnim === "orc" ? "slime-idle" : this.orcAnim === "orc2" ? "slime2-idle" : "slime3-idle";

    const orc = this.inBox(
      this.add.sprite(ENTER_X, GROUND_Y, idleTex).setOrigin(0.5, SLIME_ORIGIN).setScale(SLIME_SCALE).play(`${this.orcAnim}-walk`),
    );
    this.orc = orc;
    this.sfx(this.pick(["squish1", "squish2"]), 0.32, 0.95 + Math.random() * 0.1); // one squelch as it bounces in
    this.enemyHpBg.setVisible(true);
    this.enemyHpBar.setVisible(true);
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
    this.orcGap = BOSS_ENGAGE_GAP;
    this.hero.play("hero-walk", true);
    this.sfx("summon", 0.55, 0.9);
    buzz(30);

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
      .text(0, -10, `☠ ${BOSS_NAME}`, { fontFamily: "monospace", fontStyle: "bold", fontSize: "13px", color: "#ffb3a0" })
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
    let swordHits = 0; // sword-clearing steps so far this action (1st = combo, 2nd+ = spell)
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
      const resCells: { x: number; y: number }[] = []; // where the scoring (resource/key) tiles sat
      cleared.forEach((key) => {
        const [r, c] = key.split(",").map(Number);
        const ty = this.grid[r][c];
        if (ty === WOOD || ty === ORE || ty === TREASURE || ty === KEY) resCells.push({ x: this.xFor(c), y: this.yFor(r) });
        const t = this.tiles[r][c];
        if (t) fades.push(this.shatter(t, ty));
        this.tiles[r][c] = null;
        this.grid[r][c] = EMPTY;
      });
      await Promise.all(fades);

      const outcome = applyMatches(this.run, counts);
      // the haul pays out where it was matched — a gold "+N" over the cleared tiles
      const resScore = (outcome.gained.wood + outcome.gained.ore + outcome.gained.treasure + outcome.gained.keys) * 2;
      if (resScore > 0 && resCells.length) {
        const cx = resCells.reduce((s, p) => s + p.x, 0) / resCells.length;
        const cy = resCells.reduce((s, p) => s + p.y, 0) / resCells.length;
        this.floatScore(cx, cy, resScore, { delay: 70, size: Math.min(52, 32 + Math.floor(resScore / 4) + depth * 3) });
      }
      this.tutorial?.onCascade(counts);
      const swords = outcome.swords; // effective count — Wren's Whetstone can upgrade the swing
      if (swords > 0) swordHits++;
      this.onCombat(outcome, swords, swordHits);
      // non-combat clear — a random tile-match sound (1 of TILE_SFX), slight pitch variation
      if (outcome.damage <= 0) this.sfx(`tile${1 + ((Math.random() * TILE_SFX) | 0)}`, 0.4, 0.97 + Math.random() * 0.06);
      this.refreshHud();

      await this.collapse();
    }
  }

  private onCombat(outcome: MatchOutcome, swords: number, swordHits: number) {
    if (outcome.damage <= 0 || !this.orc || this.orcDying) return;

    this.updateEnemyBar();

    // Attack scales with the sword match: 3 -> Attack, 4 -> +Attack 2, 5+ -> +Attack 3.
    // A cascade's SECOND sword hit fires the Spell (blue sword) instead. Staff-only
    // hits (swords === 0) just do a basic swing.
    const combo =
      swords > 0 && swordHits >= 2
        ? ["hero-spell"]
        : swords >= 5
          ? ["hero-attack", "hero-attack2", "hero-attack3"]
          : swords === 4
            ? ["hero-attack", "hero-attack2"]
            : ["hero-attack"];

    this.playComboSfx(combo);
    this.showHits(outcome.hits, combo);

    if (outcome.killed) {
      // Play the full combo IN PLACE (x frozen), then surge forward.
      this.heroLockX = true;
      this.playCombo(combo);
      const ms = this.comboMs(combo);
      this.time.delayedCall(ms, () => {
        if (this.run.over) {
          this.heroLockX = false;
          return;
        }
        this.hero.play("hero-walk", true);
        this.tweens.add({ targets: this.hero, x: this.heroXForPressure(), duration: 320, ease: "Quad.easeOut" });
        // Release off a clock timer, not the tween, so x-control always returns to update().
        this.time.delayedCall(320, () => (this.heroLockX = false));
      });
      this.killOrc(ms + 420); // hold the next foe until the combo + surge finishes
    } else {
      this.playCombo(combo, this.heroBaseAnim()); // combo, then fall back to idle/run
      this.orc.play(`${this.orcAnim}-hurt`).once("animationcomplete", () => {
        if (this.orc && !this.orcDying) this.orc.play(`${this.orcAnim}-${this.phase === "fight" ? "idle" : "walk"}`);
      });
    }
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

  // ---- sfx ----
  private sfx(key: string, volume = 0.5, rate = 1) {
    if (this.cache.audio.exists(key)) this.sound.play(key, { volume, rate });
  }
  private pick(a: string[]): string {
    return a[(Math.random() * a.length) | 0];
  }
  /** Hero footfalls while running to the next foe (dirt on the grass map). */
  private footstep() {
    if (this.run.over || this.phase !== "advance") return;
    if (this.hero.anims.currentAnim?.key !== "hero-walk") return;
    this.sfx(this.pick(["step1", "step2", "step3", "step4", "step5"]), 0.28, 0.95 + Math.random() * 0.1);
  }
  /** Swings + impacts synced to the combo (or the spell's whoosh + impact). */
  private playComboSfx(combo: string[]) {
    const HITS = ["hit1", "hit2", "hit3"];
    if (combo[0] === "hero-spell") {
      this.sfx("spell", 0.6);
      this.time.delayedCall(140, () => this.sfx(this.pick(HITS), 0.5));
      return;
    }
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
    // NB: the hero's swing-then-surge is sequenced in onCombat so the attack plays.

    const dying = this.orc;
    this.orc = null;
    if (dying) {
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
    if (wasBoss) this.bossSpoils(dying?.x ?? SAFE_X + BOSS_ENGAGE_GAP);

    this.time.delayedCall(Math.max(760, afterMs), () => {
      if (this.run.over) return;
      if (++this.sinceChest >= CHEST_EVERY && !this.tutorial?.active) {
        this.sinceChest = 0;
        this.spawnChest(); // treasure interlude — the next foe waits its turn (held during the tutorial)
      } else {
        spawnNext(this.run);
        this.spawnOrc();
      }
      this.refreshHud();
    });
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

  private strike(force = false) {
    if (!force && this.tutorial?.active) return; // the tutorial scripts its own strikes
    if (this.run.over || this.phase !== "fight" || this.orcDying || !this.orc || !this.run.enemy) return;
    const blockBefore = this.run.block;
    const net = enemyStrike(this.run);
    const isBoss = this.orcAnim === "boss";
    if (isBoss) this.sfx(this.pick(["fireball1", "fireball2", "fireball3"]), 0.55); // fire roars across the gap
    else this.sfx("slimeatk", 0.3); // slime lunges
    if (this.run.block < blockBefore) // armour soaked some/all of it -> clang on contact
      this.time.delayedCall(90, () => this.sfx(this.pick(["block1", "block2", "block3"]), 0.45));
    this.orc.play(`${this.orcAnim}-attack`).once("animationcomplete", () => {
      if (this.orc && !this.orcDying) this.orc.play(`${this.orcAnim}-idle`);
    });
    if (net > 0) {
      this.cameras.main.shake(isBoss ? 260 : 150, isBoss ? 0.009 : 0.006);
      this.hero.setTint(isBoss ? 0xffa060 : 0xff8888); // seared vs. slimed
      this.time.delayedCall(isBoss ? 200 : 130, () => this.hero.clearTint());
    }
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
      spawnNext(this.run);
      this.spawnOrc(1600);
    });
  }

  /** ===== THE BLAST ===== VS-style takeover: veil, rattle, god rays, erupting loot. */
  private async openChest() {
    const cont = this.chest!;
    this.chestActive = true;
    this.chestsOpened++;
    this.chestFast = false;
    const skip = () => (this.chestFast = true); // any tap fast-forwards the remaining beats
    this.input.on("pointerdown", skip);

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
      await this.cwait(560);
      this.tweens.add({ targets: t, x: rowX(i), y: rowY, scale: 0.72, duration: 230, ease: "Quad.easeInOut" }); // tuck into the row
      collected.push({ t, pull });
    }
    await this.cwait(430);

    // cash out — rewards zip to the HUD / item slots while the world fades back in
    this.tweens.add({ targets: veil, fillAlpha: 0, duration: 600, delay: 150, onComplete: () => veil.destroy() });
    for (const r of rays) this.tweens.add({ targets: r, alpha: 0, duration: 500, onComplete: () => r.destroy() });
    this.tweens.add({ targets: title, alpha: 0, y: title.y - 30, duration: 400, onComplete: () => title.destroy() });
    this.tweens.add({ targets: big, alpha: 0, y: CY + 30, duration: 500, delay: 200, onComplete: () => big.destroy() });
    for (let i = 0; i < collected.length; i++) {
      const { t, pull } = collected[i];
      const slot = pull.kind === "item" ? this.itemSlots.find((s) => !s.icon) : null;
      // slots + resource counter are screen-space panels; the reveal lives in the centre column
      const tgt = slot ? this.toLocal(slot.x, slot.y) : this.toLocal(this.resIcons[0].x, this.resIcons[0].y);
      const tx = tgt.x;
      const ty = tgt.y;
      this.tweens.add({
        targets: t, x: tx, y: ty, scale: 0.25, duration: 330, delay: i * 110, ease: "Cubic.easeIn",
        onComplete: () => {
          t.destroy();
          this.applyPull(pull); // resources tick up as each one lands
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
    this.input.off("pointerdown", skip);
    this.chestActive = false;
    if (!this.run.over) {
      spawnNext(this.run);
      this.spawnOrc();
      this.refreshHud();
    }
  }

  /** Slot-machine pull table: 2 guaranteed, diminishing "one more!" odds, rare item. */
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
    const canItem = this.itemSlots.some((s) => !s.item);
    const pulls: ChestPull[] = [];
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      if (r < 0.14 && canItem && !pulls.some((p) => p.kind === "item")) {
        const def = rollItem(bossHoard);
        pulls.push({ kind: "item", n: 1, icon: def.glyph, item: def });
      } else if (r < 0.4) pulls.push({ kind: "treasure", n: 2 + ((Math.random() * 3) | 0), icon: "💎" });
      else if (r < 0.7) pulls.push({ kind: "wood", n: 4 + ((Math.random() * 5) | 0), icon: "🪵" });
      else pulls.push({ kind: "ore", n: 4 + ((Math.random() * 5) | 0), icon: "🪨" });
    }
    const rank = { wood: 0, ore: 0, treasure: 1, item: 2 } as const;
    return pulls.sort((a, b) => rank[a.kind] - rank[b.kind]); // best pull lands last
  }

  private applyPull(pull: ChestPull) {
    const r = this.run.resources;
    if (pull.kind === "wood") r.wood += pull.n;
    else if (pull.kind === "ore") r.ore += pull.n;
    else if (pull.kind === "treasure") r.treasure += pull.n;
    else if (pull.item) this.fillSlot(pull.item);
    this.run.score += 25 + pull.n * 2;
    this.refreshHud();
  }

  /** Drop a chest item into the first empty HUD slot with a golden pop. */
  private fillSlot(def: ItemDef) {
    const slot = this.itemSlots.find((s) => !s.item);
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
    const killed = dealDamage(this.run, STORMCALL_DMG);
    const zero = { wood: 0, ore: 0, treasure: 0, keys: 0 };
    // swords=1 + swordHits=2 routes onCombat into the hero-spell animation
    this.onCombat({ damage: STORMCALL_DMG, hits: [STORMCALL_DMG], killed, gained: zero, swords: 1 }, 1, 2);
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
    if (outcome.swords > 0) this.onCombat(outcome, outcome.swords, 1);
    else if (outcome.damage > 0) this.onCombat(outcome, 0, 1); // staff-only blast still swings
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
  private showHits(hits: number[], combo: string[]) {
    if (combo[0] === "hero-spell") {
      const total = hits.reduce((a, b) => a + b, 0);
      this.time.delayedCall(150, () => this.floatDamage(total, true));
      return;
    }
    let t = 0;
    combo.forEach((key, i) => {
      const dmg = hits[i] ?? 0;
      if (dmg > 0) this.time.delayedCall(t + 100, () => this.floatDamage(dmg, i === 0));
      t += this.anims.get(key)?.duration ?? 300;
    });
  }

  /**
   * Floating score number — the gold-gradient "+N" that pops wherever points are
   * earned (matches, kills, chests). Distinct from floatDamage (amber "-N"):
   * score is always gold, always "+", and scales with the size of the win.
   */
  private floatScore(x: number, y: number, n: number, opts: { size?: number; delay?: number; sparkle?: boolean } = {}) {
    if (n <= 0) return;
    const spawn = () => {
      // Sizes are DESIGN px (the centre column scales down on small screens), so
      // the floor has to be generous or a 3-match's "+6" vanishes into the board.
      const size = opts.size ?? Math.min(52, 32 + Math.floor(n / 4)); // bigger wins land bigger
      const t = this.inBox(
        this.add
          .text(x + (Math.random() * 18 - 9), y, `+${n}`, {
            fontFamily: "monospace",
            fontStyle: "bold",
            fontSize: `${size}px`,
            color: "#ffffff",
            stroke: "#1a0a04",
            strokeThickness: Math.max(5, Math.round(size / 4)),
          })
          .setOrigin(0.5)
          .setDepth(66)
          .setScale(0.2)
          .setAngle(Math.random() * 8 - 4), // a little tilt so repeats don't stamp
      );
      t.setShadow(0, 4, "rgba(0,0,0,0.85)", 8, true, true); // lifts it off any tile colour
      t.setTint(0xfff6c8, 0xffe08a, 0xf2a93b, 0xc9761f); // the game's gold gradient
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

  private floatDamage(n: number, big = true) {
    const x = (this.orc?.x ?? SAFE_X) + (Math.random() * 26 - 13);
    const y = GROUND_Y - 64 - (big ? 0 : 8);
    const t = this.inBox(this.add
      .text(x, y, `-${n}`, {
        fontFamily: "monospace",
        fontStyle: "bold",
        fontSize: big ? "28px" : "18px",
        color: big ? "#fff2b0" : "#ffca66",
        stroke: "#38180c",
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
  /** Paint one tile face (colour + disc + emoji) to an offscreen canvas. */
  private faceCanvas(type: number, S: number): HTMLCanvasElement {
    const cv = document.createElement("canvas");
    cv.width = S;
    cv.height = S;
    const cx = cv.getContext("2d")!;
    cx.fillStyle = "#" + TILE_COLORS[type].toString(16).padStart(6, "0");
    cx.fillRect(0, 0, S, S);
    cx.strokeStyle = "rgba(0,0,0,0.25)";
    cx.lineWidth = 2;
    cx.strokeRect(1, 1, S - 2, S - 2);
    cx.fillStyle = "rgba(10,10,10,0.32)";
    cx.beginPath();
    cx.arc(S / 2, S / 2, 23, 0, Math.PI * 2);
    cx.fill();
    cx.font = '34px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.fillText(TILE_GLYPH[type], S / 2, S / 2 + 2);
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
  scene: [CampScene, GameScene], // boot into camp; DEPART starts the run, death returns
});

// Mobile browsers resize the visible viewport when the toolbar shows/hides (and on
// rotate) without always firing a plain "resize"; re-fit the canvas on those too.
const refit = () => game.scale.refresh();
window.visualViewport?.addEventListener("resize", refit);
window.addEventListener("orientationchange", () => setTimeout(refit, 120));

initHaptics(); // set up the iOS haptic fallback element

// Dev-only handle for debugging; stripped from production builds.
if (import.meta.env.DEV) (globalThis as unknown as { __mbGame: Phaser.Game }).__mbGame = game;
