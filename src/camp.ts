/**
 * matchBlade — camp scene (the hub between runs).
 *
 * A flat, cozy roadside camp in the current biome: parallax sky over a thick
 * earth band, tents + campfire + blacksmith placeholder dressed from the
 * GandalfHardcore packs. The DEPART portal on the right starts a run
 * (GameScene); dying in a run returns here.
 *
 * Layout: sky/ground are drawn full-bleed in screen space; the props live in a
 * ground-anchored container (`propBox`) scaled by viewport height, so the camp
 * stays composed on any landscape screen and reflows on resize/rotate.
 *
 * Biomes: everything visual routes through CAMP_BIOMES so the same camp can be
 * redressed per biome (plains now; autumn/winter floors + parallax later).
 */

import Phaser from "phaser";
import {
  type MetaState,
  loadMeta,
  saveMeta,
  canAfford,
  spend,
  BLACKSMITH_COST,
  forgeCost,
  questById,
  questProgress,
  questDone,
  offeredQuests,
  acceptQuest,
  collectQuestRewards,
  allQuestsDone,
  roadOpen,
  advanceBiome,
  nextBiome,
  MAX_ACTIVE,
} from "./meta";
import { ITEMS, type ItemDef, type ItemTier, TIER_COLORS } from "./items";
import { sfxV, ambV } from "./audio";

const DH = 480; // design height for the prop layer (smaller = more zoomed in)
const DW = 940; // full design width of the camp spread (smaller = more zoomed in; clamps vw/DW)
const CONTENT_CX = 30; // horizontal centre of the visible window — keeps the DEPART portal (design x≈445) fully in frame at the tighter zoom
const GROUND_FRAC = 0.8; // ground line as a fraction of viewport height
const PARALLAX_SRC_H = 216; // vnitti layer source height
// Text-FIRST stack: real fonts draw digits/letters, emoji fall back per-glyph to the
// system emoji font. Leading with an emoji font (as before) made iOS Safari render bare
// ASCII digits with the emoji font's keycap glyphs — the garbled numbers in the quest UI.
const EMOJI_FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

// ---- the Peddler (diamond shop; arrives once you bank a gem) ---------------
const PEDDLER_X = -238; // her pitch, between the tarp tent and the campfire path
const PEDDLER_SCALE = 1.25; // knight frames hold a 48px figure (vs the hero's 26) — keep her near hero height
// Feet measured off the sheets (frames are 80 tall with empty space below the
// boots): idle bottoms out at row 63, the run cycle at row 66 — so each anim
// gets its own origin or she floats above the ground line.
const PEDDLER_ORIGIN_IDLE = 63 / 80;
const PEDDLER_ORIGIN_WALK = 66 / 80;
const PEDDLER_PRICES: Record<ItemTier, number> = { common: 10, uncommon: 20, rare: 35 };
const PEDDLER_REROLL = 5; // 💎 to spin fresh wares
const MAX_STOCKED = 3; // items you can pack for one run

type EditableProp = { obj: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject; key: string; frame?: number };
type LayerDef = { key: string; file: string; drift: number }; // drift px/s (clouds)
type BiomeDef = {
  label: string;
  parallax: LayerDef[];
  floor: { key: string; file: string; sx: number; sy: number; w: number; h: number };
};

const CAMP_BIOMES: Record<string, BiomeDef> = {
  plains: {
    label: "GRASS PLAINS",
    // vnitti layers keep their low horizon clouds; buildClouds() adds high clouds on top.
    parallax: [
      { key: "grass-sky", file: "worlds/grass/sky.png", drift: 0 },
      { key: "grass-clouds-mid", file: "worlds/grass/clouds_mid.png", drift: 4 },
      { key: "grass-mtn-far", file: "worlds/grass/mountains_far.png", drift: 0 },
      { key: "grass-mtn", file: "worlds/grass/mountains.png", drift: 0 },
      { key: "grass-clouds-front", file: "worlds/grass/clouds_front.png", drift: 7 },
      { key: "grass-hill", file: "worlds/grass/hill.png", drift: 0 },
    ],
    floor: { key: "grass-floor", file: "worlds/grass/floor.png", sx: 16, sy: 0, w: 64, h: 96 },
  },
  forest: {
    label: "HIGH FOREST",
    // layered jungle parallax (plx1 flat sky .. plx5 foreground trees); high clouds still drift on top.
    parallax: [
      { key: "forest-sky", file: "worlds/forest/plx1.png", drift: 0 },
      { key: "forest-far", file: "worlds/forest/plx2.png", drift: 0 },
      { key: "forest-mid", file: "worlds/forest/plx3.png", drift: 0 },
      { key: "forest-near", file: "worlds/forest/plx4.png", drift: 0 },
      { key: "forest-front", file: "worlds/forest/plx5.png", drift: 0 },
    ],
    floor: { key: "forest-floor", file: "worlds/forest/floor.png", sx: 0, sy: 0, w: 112, h: 96 },
  },
  // autumn / winter: same shape — GandalfHardcore floor atlas rows + Glacial/Autumn parallax sets.
};

/** The biome def for a saved biome key, defaulting to plains for unknown values. */
function biomeDef(key: string): BiomeDef {
  return CAMP_BIOMES[key] ?? CAMP_BIOMES.plains;
}

// Static camp dressing, baked from the in-camp editor (positions are FINAL — no squeeze).
type Prop = { key: string; x: number; y: number; s: number; depth: number; frame?: number; flip?: boolean };
const PROPS: Prop[] = [
  // backdrop
  { key: "tree2", x: -485, y: 3, s: 1.35, depth: 1, flip: true },
  { key: "birch1", x: 308, y: 7, s: 1.5, depth: 2 },
  { key: "clothesline", x: -337, y: 1, s: 1.35, depth: 2 },
  // homestead
  { key: "tarp_tent", x: -86, y: 2, s: 2.0, depth: 5 },
  { key: "table_apples", x: -434, y: 4, s: 1.5, depth: 5 },
  { key: "barrel", x: -199, y: 1, s: 1.5, depth: 5 },
  { key: "rocks_med", x: -538, y: 2, s: 1.4, depth: 5 },
  // blacksmith yard
  { key: "crate_tall", x: 205, y: 1, s: 1.5, depth: 5 },
  { key: "crate", x: 241, y: 0, s: 1.4, depth: 5 },
  { key: "basket_stack", x: 191, y: 1, s: 1.6, depth: 5 },
  { key: "crate", x: -165, y: 3, s: 1.5, depth: 6 },
  // front dressing
  { key: "bush_small", x: 45, y: 0, s: 1.4, depth: 8 },
  { key: "rocks_grass", x: 62, y: 1, s: 1.4, depth: 8 },
  { key: "rocks_small1", x: -354, y: 3, s: 1.2, depth: 8 },
  { key: "rocks_small2", x: 27, y: 3, s: 1.2, depth: 8 },
  { key: "tuft_tiny", x: -203, y: 3, s: 1.5, depth: 8 },
  { key: "tuft_tiny", x: 57, y: 0, s: 1.4, depth: 8 },
  { key: "tall_grass", x: 284, y: 5, s: 1.5, depth: 8, frame: 0 },
  { key: "tall_grass", x: 305, y: 5, s: 1.4, depth: 8, frame: 1 },
];

// Wren steps out of the tarp tent when hired — follow it wherever the layout puts it.
const TENT_X = PROPS.find((p) => p.key === "tarp_tent")?.x ?? -86;

export class CampScene extends Phaser.Scene {
  private parallax: { sprite: Phaser.GameObjects.TileSprite; drift: number }[] = [];
  private clouds: { img: Phaser.GameObjects.Image; speed: number; fy: number; base: number }[] = []; // high drifting clouds
  private ground!: Phaser.GameObjects.TileSprite;
  private propBox!: Phaser.GameObjects.Container;
  private biomeLabel!: Phaser.GameObjects.Text;
  private hero!: Phaser.GameObjects.Sprite;
  private fireSnd: Phaser.Sound.BaseSound | null = null;
  private ambSnd: Phaser.Sound.BaseSound | null = null; // looping night-forest bed
  private departing = false;

  // meta progression (persistent across runs)
  private meta!: MetaState;
  private resText!: Phaser.GameObjects.Text;
  private smith: Phaser.GameObjects.Sprite | null = null;
  private tentMark: Phaser.GameObjects.GameObject[] = []; // gold "?" over the unhired smith's tent
  private panelOpen = false;
  private panelBox: Phaser.GameObjects.Container | null = null;

  // quest-giver state marker + cutscene actors
  private goddess: Phaser.GameObjects.Sprite | null = null;
  private wayMark: Phaser.GameObjects.GameObject[] = []; // !/? over the Wayfarer (state-driven)
  private furnace: Phaser.GameObjects.Sprite | null = null;
  private furnaceLitObjs: Phaser.GameObjects.GameObject[] = []; // glow + plaque, only while lit
  private departSign: Phaser.GameObjects.Container | null = null;
  private cutscene = false; // arrival cutscene running — camp input held

  // the Peddler: armored road-merchant selling run items for diamonds
  private peddler: Phaser.GameObjects.Sprite | null = null;
  private shopOffers: ItemDef[] = []; // this visit's three wares

  // dev layout editor: drag props around, then copy the layout as JSON
  private campScale = 1;
  private editMode = false;
  private editable: EditableProp[] = [];
  private editBtn?: Phaser.GameObjects.Text;
  private copyBtn?: Phaser.GameObjects.Text;
  private menuBtn!: Phaser.GameObjects.Text; // ☰ opens the pause menu (Esc works too)
  private portalHit?: Phaser.GameObjects.Rectangle;

  constructor() {
    super("camp");
  }

  preload() {
    const biome = biomeDef(loadMeta().biome);
    const img = (key: string, file: string) => {
      if (!this.textures.exists(key)) this.load.image(key, file);
    };
    for (const l of biome.parallax) img(l.key, l.file);
    img(biome.floor.key, biome.floor.file);

    // hero (shared with GameScene — whoever loads first wins)
    if (!this.textures.exists("warrior")) this.load.spritesheet("warrior", "sprites/warrior.png", { frameWidth: 80, frameHeight: 64 });
    // NPCs: the blacksmith (WarriorWoman sheet, same layout as the hero) + the quest-giving Wayfarer
    if (!this.textures.exists("smith")) this.load.spritesheet("smith", "sprites/smith.png", { frameWidth: 80, frameHeight: 64 });
    if (!this.textures.exists("goddess")) this.load.spritesheet("goddess", "camp/goddess.png", { frameWidth: 64, frameHeight: 64 });
    // the Peddler (knight pack — idle 4x64x80, run 8x80x80; measured from the sheets)
    if (!this.textures.exists("knight-idle")) this.load.spritesheet("knight-idle", "sprites/knight_idle.png", { frameWidth: 64, frameHeight: 80 });
    if (!this.textures.exists("knight-run")) this.load.spritesheet("knight-run", "sprites/knight_run.png", { frameWidth: 80, frameHeight: 80 });

    // camp props
    const P = "camp/";
    for (const k of [
      "tent_large", "tent_small", "tarp_tent", "tree1", "tree2", "tree3", "birch1", "clothesline",
      "log_pile", "table_apples", "tomatoes", "crate", "crate_tall", "barrel", "cattails",
      "cook_pot", "basket_stack",
      "bush_wide", "bush_med", "bush_small", "rocks_grass", "rocks_med", "rocks_small1", "rocks_small2",
      "rockpile_big", "tuft_tiny",
    ])
      img(k, `${P}${k}.png`);
    this.load.spritesheet("campfire", `${P}campfire.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet("furnace", `${P}furnace_sawmill.png`, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet("torch", `${P}torch.png`, { frameWidth: 32, frameHeight: 32 }); // 6x4 grid; lit loop = frames 6-17
    this.load.spritesheet("portal", `${P}portal.png`, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet("tall_grass", `${P}tall_grass.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet("water", `${P}water.png`, { frameWidth: 32, frameHeight: 32 }); // 20 frames per row
    for (const n of [3, 4, 5, 6]) img(`cloud${n}`, `${P}cloud${n}.png`);

    if (!this.cache.audio.exists("camp_fire")) this.load.audio("camp_fire", "sounds/camp_fire.mp3");
    if (!this.cache.audio.exists("amb_night")) this.load.audio("amb_night", "sounds/amb_night.mp3"); // crickets round the fire
    for (const [k, f] of [["pickup", "pickup.mp3"], ["coin3", "coin3.mp3"], ["pouch", "pouch.mp3"]] as const)
      if (!this.cache.audio.exists(k)) this.load.audio(k, `sounds/${f}`);
  }

  create() {
    this.departing = false;
    this.parallax = [];
    this.clouds = [];
    this.editable = [];
    this.editMode = false;
    this.panelOpen = false;
    this.panelBox = null;
    this.smith = null;
    this.goddess = null;
    this.wayMark = [];
    this.furnace = null;
    this.furnaceLitObjs = [];
    this.departSign = null;
    this.cutscene = false;
    this.peddler = null;
    this.meta = loadMeta();
    this.rollShopOffers();
    const biome = biomeDef(this.meta.biome);
    const groundKey = `camp-ground-${this.meta.biome}`; // per-biome so a road-onward rebuilds it

    // ground texture: seamless grass-top slice cropped from the biome's floor atlas
    if (!this.textures.exists(groundKey)) {
      const src = this.textures.get(biome.floor.key).getSourceImage() as HTMLImageElement;
      const cv = document.createElement("canvas");
      cv.width = biome.floor.w;
      cv.height = biome.floor.h;
      const cx = cv.getContext("2d")!;
      cx.imageSmoothingEnabled = false;
      cx.drawImage(src, biome.floor.sx, biome.floor.sy, biome.floor.w, biome.floor.h, 0, 0, biome.floor.w, biome.floor.h);
      this.textures.addCanvas(groundKey, cv);
    }
    // soft radial glow for fire/torch light
    if (!this.textures.exists("camp-glow")) {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 64;
      const g = cv.getContext("2d")!;
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,180,90,0.9)");
      gr.addColorStop(1, "rgba(255,180,90,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      this.textures.addCanvas("camp-glow", cv);
    }

    this.buildAnims();

    // --- screen-space backdrop (sized in layout()) ---
    for (const l of biome.parallax) {
      const ts = this.add.tileSprite(0, 0, 8, 8, l.key).setOrigin(0, 0);
      this.parallax.push({ sprite: ts, drift: l.drift });
    }
    this.buildClouds(); // high clouds drift above the mountains, below the props
    this.ground = this.add.tileSprite(0, 0, 8, 8, groundKey).setOrigin(0, 0);

    // --- the camp itself (design coords, anchored to the ground line) ---
    this.propBox = this.add.container(0, 0);
    this.buildCamp();

    // biome tag + banked resources, top-left
    this.biomeLabel = this.add
      .text(14, 10, `⛺ CAMP — ${biome.label}`, { fontFamily: "monospace", fontStyle: "bold", fontSize: "15px", color: "#dfe3ea", stroke: "#0a0b0f", strokeThickness: 4 })
      .setDepth(50);
    // TEMP debug: tap the biome tag to flip plains<->forest instantly (preview both worlds; remove before release)
    this.biomeLabel.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
      if (this.editMode || this.panelOpen || this.departing || this.cutscene) return;
      this.meta.biome = this.meta.biome === "forest" ? "plains" : "forest";
      saveMeta(this.meta);
      this.scene.restart();
    });
    this.resText = this.add
      .text(14, 34, "", { fontFamily: EMOJI_FONT, fontSize: "17px", color: "#dfe3ea", stroke: "#0a0b0f", strokeThickness: 4 })
      .setDepth(50);
    this.refreshResources();
    this.menuBtn = this.add
      .text(0, 0, "☰", { fontFamily: "monospace", fontStyle: "bold", fontSize: "24px", color: "#c7ccd6", stroke: "#0a0b0f", strokeThickness: 4 })
      .setOrigin(1, 0)
      .setDepth(70)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.openMenu());

    // NB: quest rewards are no longer auto-paid on arrival — the Wayfarer holds
    // them (her gold "?" invites the visit) and pays when you see her.

    if (import.meta.env.DEV) this.buildEditor();

    this.layout();
    this.scale.off("resize", this.layout, this);
    this.scale.on("resize", this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.layout, this);
      this.fireSnd?.stop();
      this.fireSnd = null;
      this.ambSnd?.stop();
      this.ambSnd = null;
    });

    this.fireSnd = this.sound.add("camp_fire", { volume: ambV(0.22), loop: true });
    this.fireSnd.play();
    this.ambSnd = this.sound.add("amb_night", { volume: ambV(0.16), loop: true }); // the wilds hum past the firelight
    this.ambSnd.play();
    // the ambience fader re-levels the beds live while the options slider moves
    const onAudio = () => {
      if (this.fireSnd) (this.fireSnd as unknown as { volume: number }).volume = ambV(0.22);
      if (this.ambSnd) (this.ambSnd as unknown as { volume: number }).volume = ambV(0.16);
    };
    this.game.events.on("audio-changed", onAudio);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off("audio-changed", onAudio));
    // pause menu: Esc (desktop) or the ☰ chip top-right
    this.input.keyboard?.on("keydown-ESC", () => this.openMenu());
    this.cameras.main.fadeIn(350, 5, 6, 10);

    // arrival moments, one per visit: the first-ever walk-in outranks the
    // Peddler, who turns up the first time you come home with a diamond banked
    const replayIntro = new URLSearchParams(location.search).has("intro");
    if (!this.meta.campIntroSeen || replayIntro) this.playIntro();
    else if (!this.meta.peddlerArrived && this.meta.treasure >= 1) this.playPeddlerArrival();
    else this.refreshWayfarerMark();

    if (import.meta.env.DEV) (globalThis as unknown as { __mbCamp: CampScene }).__mbCamp = this;
  }

  private buildAnims() {
    const mk = (key: string, tex: string, start: number, end: number, fps: number) => {
      if (this.anims.exists(key)) return;
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(tex, { start, end }), frameRate: fps, repeat: -1 });
    };
    mk("hero-idle", "warrior", 0, 7, 8);
    mk("hero-walk", "warrior", 48, 55, 15);
    mk("smith-idle", "smith", 0, 7, 8);
    mk("smith-walk", "smith", 48, 55, 12);
    mk("peddler-idle", "knight-idle", 0, 3, 5);
    mk("peddler-walk", "knight-run", 0, 7, 11);
    // NB: the goddess sheet is a walk cycle (no idle) — the Wayfarer holds a static
    // frame + a gentle float instead (see buildCamp), so she doesn't march in place.
    mk("campfire-burn", "campfire", 0, 9, 10);
    mk("furnace-burn", "furnace", 0, 5, 8);
    mk("torch-burn", "torch", 6, 17, 12); // the lit mounted torch (rows 1-2), no unlit head
    mk("portal-spin", "portal", 0, 9, 10);
    // water sheet: 20 frames per 32px row (row*20 .. row*20+19)
    mk("water-fall-top", "water", 60, 79, 14); // row 3 — lip of the falls
    mk("water-fall-mid", "water", 80, 99, 14); // row 4 — falling column
    mk("water-splash", "water", 100, 119, 14); // row 5 — churn at the base
    mk("water-surface", "water", 140, 159, 10); // row 7 — calm pool surface
  }

  /** Populate propBox: every prop stands on y=0 (the ground line), origin bottom-centre. */
  /** A handful of fluffy clouds drifting high across the open sky (y/scale set in layout()). */
  private buildClouds() {
    // [key, fx (initial x fraction), fy (y fraction of sky), base scale, speed px/s]
    const defs: [string, number, number, number, number][] = [
      ["cloud5", 0.12, 0.14, 0.7, 6],
      ["cloud4", 0.42, 0.24, 0.75, 10],
      ["cloud3", 0.66, 0.11, 0.85, 5],
      ["cloud6", 0.88, 0.19, 0.45, 4],
      ["cloud4", 0.03, 0.3, 0.55, 12],
    ];
    const vw = this.scale.width;
    for (const [key, fx, fy, base, speed] of defs) {
      const img = this.add.image(fx * vw, 0, key).setOrigin(0.5, 0.5).setAlpha(0.92);
      this.clouds.push({ img, speed, fy, base });
    }
  }

  private buildCamp() {
    const put = (p: Prop) => {
      const im = this.add.image(p.x, p.y, p.key, p.frame).setOrigin(0.5, 1).setScale(p.s).setDepth(p.depth);
      if (p.flip) im.setFlipX(true);
      this.propBox.add(im);
      this.editable.push({ obj: im, key: p.key, frame: p.frame });
      return im;
    };
    const sprite = (key: string, anim: string, x: number, y: number, scale: number, depth: number) => {
      const sp = this.add.sprite(x, y, key).setOrigin(0.5, 1).setScale(scale).setDepth(depth).play(anim);
      this.propBox.add(sp);
      this.editable.push({ obj: sp, key: `anim:${anim}` });
      return sp;
    };
    for (const p of PROPS) {
      const im = put(p);
      // the tarp tent hides the reluctant blacksmith until she's hired
      if (p.key === "tarp_tent") {
        im.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.tentTapped());
        if (!this.meta.blacksmithHired) {
          // gold glowing "?" — someone's in there
          const qGlow = this.add
            .image(p.x, -104, "camp-glow")
            .setBlendMode(Phaser.BlendModes.ADD)
            .setTint(0xffd24a)
            .setScale(1.6)
            .setAlpha(0.55)
            .setDepth(9);
          const qMark = this.add
            .text(p.x, -104, "?", { fontFamily: "monospace", fontStyle: "bold", fontSize: "34px", color: "#ffd94a", stroke: "#5a3a08", strokeThickness: 6 })
            .setOrigin(0.5)
            .setDepth(10);
          this.propBox.add(qGlow);
          this.propBox.add(qMark);
          this.tweens.add({ targets: qMark, y: -114, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
          this.tweens.add({ targets: qGlow, alpha: 0.25, scale: 1.35, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
          this.tentMark = [qGlow, qMark];
        }
      }
    }

    // hero stands in the middle of camp
    this.hero = this.add.sprite(-47, 2, "warrior").setOrigin(0.5, 0.734).setScale(2.1).setDepth(7).play("hero-idle");
    this.propBox.add(this.hero);

    // the Wayfarer — quest giver waiting by the road out (static frame + gentle float).
    // Her !/? marker is state-driven — see refreshWayfarerMark().
    this.goddess = this.add.sprite(300, 2, "goddess").setOrigin(0.5, 1).setScale(1.9).setDepth(6).setFrame(0);
    this.propBox.add(this.goddess);
    this.tweens.add({ targets: this.goddess, y: -5, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.goddess.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.goddessTapped());

    // blacksmith's furnace — COLD until Wren is hired (she lights it herself);
    // the plaque + firelight only exist while the forge is actually manned
    this.furnace = sprite("furnace", "furnace-burn", 138, 0, 2.1, 5);
    this.furnace.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.furnaceTapped());
    if (this.meta.blacksmithHired) {
      this.lightFurnace(false);
      this.smith = this.add.sprite(85, 2, "smith").setOrigin(0.5, 0.734).setScale(2.1).setDepth(6).play("smith-idle");
      this.propBox.add(this.smith);
      this.smith.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.furnaceTapped());
    } else {
      this.furnace.stop().setFrame(0).setTint(0x6f7b8e); // dead coals in the morning light
    }

    // the Peddler's pitch — only once she's followed the glitter into camp
    if (this.meta.peddlerArrived) this.buildPeddler(false);

    // DEPART: humming portal (right side of camp)
    const portal = sprite("portal", "portal-spin", 445, 9, 2.6, 5);
    this.addGlow(445, -60, 2.6, 0.3);
    const sign = this.plaque(363, -194, "DEPART ▶");
    this.departSign = sign;
    this.tweens.add({ targets: sign, y: -200, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    const hit = this.add.rectangle(445, -80, 220, 220, 0xffffff, 0).setDepth(10).setInteractive({ useHandCursor: true });
    this.propBox.add(hit);
    this.portalHit = hit;
    hit.on("pointerdown", () => this.depart());
    portal.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.depart());
  }

  /** Wooden plaque with a label — returns the container so callers can tween it. */
  private plaque(x: number, y: number, label: string): Phaser.GameObjects.Container {
    const w = 26 + label.length * 11;
    const bg = this.add.rectangle(0, 0, w, 30, 0x6b4023).setStrokeStyle(3, 0x3a2212);
    const grain = this.add.rectangle(0, -6, w - 10, 3, 0x7c4a28);
    const txt = this.add.text(0, 0, label, { fontFamily: "monospace", fontStyle: "bold", fontSize: "15px", color: "#ffe08a" }).setOrigin(0.5);
    const cont = this.add.container(x, y, [bg, grain, txt]).setDepth(10);
    cont.setSize(w, 30);
    this.propBox.add(cont);
    this.editable.push({ obj: cont, key: `plaque:${label}` });
    return cont;
  }

  /** Soft additive firelight, breathing. Returns the image so callers can keep/kill it. */
  private addGlow(x: number, y: number, scale: number, a: number): Phaser.GameObjects.Image {
    const g = this.add.image(x, y, "camp-glow").setBlendMode(Phaser.BlendModes.ADD).setScale(scale).setAlpha(a).setDepth(9);
    this.propBox.add(g);
    this.tweens.add({ targets: g, alpha: a * 0.55, scale: scale * 0.92, duration: 380, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    return g;
  }

  /** The forge comes alive: fire animation, firelight, and the BLACKSMITH plaque. */
  private lightFurnace(ceremony: boolean) {
    if (!this.furnace || this.furnaceLitObjs.length) return;
    this.furnace.clearTint();
    this.furnace.play("furnace-burn");
    const g = this.addGlow(138, -46, 2.4, 0.26);
    const plq = this.plaque(138, -152, "⚒ BLACKSMITH");
    this.furnaceLitObjs = [g, plq];
    if (ceremony) {
      // she strikes the flint: a warm flash and the plaque pops into place
      const flash = this.add.image(138, -46, "camp-glow").setBlendMode(Phaser.BlendModes.ADD).setScale(0.6).setAlpha(0.95).setDepth(11);
      this.propBox.add(flash);
      this.tweens.add({ targets: flash, scale: 4.4, alpha: 0, duration: 700, ease: "Quad.easeOut", onComplete: () => flash.destroy() });
      plq.setScale(0.2);
      this.tweens.add({ targets: plq, scale: 1, duration: 320, ease: "Back.easeOut" });
      this.sfx("pickup", 0.5);
    }
  }

  /**
   * The Wayfarer's marker is her state, at a glance:
   *   big gold "?"  — a sworn oath is DONE; she has payment waiting (top priority)
   *   big gold "!"  — new oaths to swear (or the road onward is open)
   *   small gray "?" — oaths in progress, nothing to do at the board yet
   *   nothing        — no offers, nothing sworn (pool exhausted, journey's end)
   */
  private refreshWayfarerMark() {
    for (const o of this.wayMark) o.destroy();
    this.wayMark = [];
    if (!this.goddess) return;
    const anyDone = this.meta.active.some((aq) => questDone(this.meta, aq));
    const hasOffers = offeredQuests(this.meta).length > 0;
    const road = roadOpen(this.meta);

    let glyph: string;
    let big: boolean;
    if (anyDone) [glyph, big] = ["?", true];
    else if (hasOffers || road) [glyph, big] = ["!", true];
    else if (this.meta.active.length) [glyph, big] = ["?", false];
    else return;

    const x = 300;
    const y = big ? -156 : -142;
    if (big) {
      const g = this.add.image(x, y, "camp-glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd24a).setScale(2.2).setAlpha(0.6).setDepth(9);
      this.propBox.add(g);
      this.tweens.add({ targets: g, alpha: 0.28, scale: 1.7, duration: 650, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.wayMark.push(g);
    }
    const t = this.add
      .text(x, y, glyph, {
        fontFamily: "monospace",
        fontStyle: "bold",
        fontSize: big ? "48px" : "24px",
        color: big ? "#ffd94a" : "#9aa0ab",
        stroke: big ? "#5a3a08" : "#1a1d24",
        strokeThickness: big ? 8 : 5,
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.propBox.add(t);
    this.tweens.add({ targets: t, y: y - (big ? 12 : 7), duration: 650, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    if (big) this.tweens.add({ targets: t, scale: 1.14, duration: 650, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.wayMark.push(t);
  }

  // ===== cutscenes: a shared letterboxed dialog engine + the camp's scenes =====

  /**
   * Letterboxed, tap-to-advance, typewriter dialog. Optional `prelude` plays
   * first (an entrance walk etc.) and must call `finish()` when the speaker is
   * in place — it returns a fast-forward that snaps the world to that state.
   * Taps complete the line, then advance; `skip ▸` bails. Cleans itself up and
   * hands `onEnd(skipped)` the scene-specific consequences.
   */
  private cinematicDialog(opts: {
    name: string;
    speaker?: () => Phaser.GameObjects.Sprite | null; // whose head the bubble rises from
    lines: { text: string; cue?: () => void; name?: string; speaker?: () => Phaser.GameObjects.Sprite | null }[];
    prelude?: (finish: () => void) => () => void;
    onEnd: (skipped: boolean) => void;
  }) {
    this.cutscene = true;
    const vw = this.scale.width;
    const vh = this.scale.height;
    const cleanup: Phaser.GameObjects.GameObject[] = [];
    let lineTimer: Phaser.Time.TimerEvent | null = null;

    const barH = Math.round(vh * 0.09);
    const mkBar = (oy: 0 | 1) =>
      this.add.rectangle(0, oy ? vh : 0, vw, barH, 0x05060a, 0.94).setOrigin(0, oy).setDepth(94).setScale(1, 0);
    const top = mkBar(0);
    const bot = mkBar(1);
    this.tweens.add({ targets: [top, bot], scaleY: 1, duration: 500, ease: "Sine.easeOut" });
    cleanup.push(top, bot);

    const catcher = this.add.rectangle(vw / 2, vh / 2, vw, vh, 0xffffff, 0.001).setDepth(96).setInteractive();
    const skip = this.add
      .text(vw - 14, barH + 10, "skip ▸", { fontFamily: "monospace", fontSize: "14px", color: "#9aa0ab", backgroundColor: "#14171f", padding: { x: 8, y: 4 } })
      .setOrigin(1, 0)
      .setDepth(97)
      .setInteractive({ useHandCursor: true });
    cleanup.push(catcher, skip);

    // --- speech bubble: a parchment pop rising from the speaker's head ---
    const speakerAnchor = (fn?: () => Phaser.GameObjects.Sprite | null): { x: number; y: number } => {
      const sp = (fn ?? opts.speaker)?.();
      if (!sp) return { x: vw / 2, y: barH + 48 };
      const b = sp.getBounds(); // world/screen bounds — folds in the propBox transform
      return { x: b.centerX, y: b.top + 4 };
    };

    let bubble: { root: Phaser.GameObjects.Container; body: Phaser.GameObjects.Text; hint: Phaser.GameObjects.Text; full: string } | null = null;
    const clearBubble = () => {
      bubble?.root.destroy();
      bubble = null;
    };

    const buildBubble = (name: string, anchor: { x: number; y: number }, fullText: string) => {
      clearBubble();
      const P = 13;
      const maxW = Math.min(360, Math.max(220, vw * 0.5));
      const nameT = this.add.text(0, 0, name, { fontFamily: "monospace", fontStyle: "bold", fontSize: "12px", color: "#7a4a12" });
      const body = this.add.text(0, 0, fullText, { fontFamily: EMOJI_FONT, fontSize: "15px", color: "#26262e", wordWrap: { width: maxW - P * 2 }, lineSpacing: 5 });
      const bw = Math.min(maxW, Math.max(nameT.width, body.width) + P * 2);
      const nameH = nameT.height;
      const bodyH = body.height;
      const bh = P + nameH + 5 + bodyH + P;
      const tailH = 15;
      // centre the bubble over the head, clamped on-screen; container sits at the
      // bubble centre so it can pop in from its own middle
      const cx = Phaser.Math.Clamp(anchor.x, 12 + bw / 2, vw - 12 - bw / 2);
      const topY = Math.max(barH + 10, anchor.y - tailH - bh);
      const cyc = topY + bh / 2;
      const lx = -bw / 2;
      const ty = -bh / 2;
      const by = bh / 2; // bubble bottom edge (relative)
      const ax = anchor.x - cx; // head, relative to the container centre
      const ay = anchor.y - cyc;
      const tbx = Phaser.Math.Clamp(ax, lx + 20, lx + bw - 20); // tail base, kept on the bubble
      const tipY = Math.max(ay, by + tailH);
      const g = this.add.graphics();
      g.fillStyle(0xf4ecd8, 0.98); // parchment
      g.fillRoundedRect(lx, ty, bw, bh, 10);
      g.fillTriangle(tbx - 11, by - 1, tbx + 11, by - 1, ax, tipY); // tail toward the speaker
      g.lineStyle(3, 0x8a6d3a, 1);
      g.strokeRoundedRect(lx, ty, bw, bh, 10);
      g.beginPath();
      g.moveTo(tbx - 11, by);
      g.lineTo(ax, tipY);
      g.lineTo(tbx + 11, by);
      g.strokePath();
      nameT.setPosition(lx + P, ty + P - 2);
      body.setPosition(lx + P, ty + P + nameH + 4).setText(""); // typewriter fills it
      const hint = this.add.text(bw / 2 - 9, bh / 2 - 6, "▾", { fontFamily: "monospace", fontSize: "14px", color: "#8a6d3a" }).setOrigin(1, 1).setVisible(false);
      this.tweens.add({ targets: hint, alpha: 0.3, duration: 500, yoyo: true, repeat: -1 });
      const root = this.add.container(cx, cyc, [g, nameT, body, hint]).setDepth(97).setScale(0.7).setAlpha(0);
      this.tweens.add({ targets: root, scale: 1, alpha: 1, duration: 200, ease: "Back.easeOut" });
      bubble = { root, body, hint, full: fullText };
      return bubble;
    };

    let li = -1;
    let typing = false;
    let started = false; // prelude finished, dialog running
    let ended = false;

    const showLine = (i: number) => {
      const ln = opts.lines[i];
      const b = buildBubble(ln.name ?? opts.name, speakerAnchor(ln.speaker), ln.text);
      typing = true;
      let ci = 0;
      lineTimer?.remove(false);
      lineTimer = this.time.addEvent({
        delay: 16,
        repeat: ln.text.length - 1,
        callback: () => {
          ci++;
          b.body.setText(ln.text.slice(0, ci));
          if (ci >= ln.text.length) {
            typing = false;
            b.hint.setVisible(true);
          }
        },
      });
      ln.cue?.();
    };

    const end = (skipped: boolean) => {
      if (ended) return;
      ended = true;
      lineTimer?.remove(false);
      clearBubble();
      for (const o of cleanup) o.destroy();
      this.cutscene = false;
      opts.onEnd(skipped);
    };

    const advance = () => {
      if (ended) return;
      if (typing) {
        lineTimer?.remove(false); // finish the line instantly
        if (bubble) {
          bubble.body.setText(bubble.full);
          bubble.hint.setVisible(true);
        }
        typing = false;
        return;
      }
      li++;
      if (li < opts.lines.length) showLine(li);
      else end(false);
    };

    const finish = () => {
      if (started || ended) return;
      started = true;
      advance(); // line 0
    };
    const fastForward = opts.prelude ? opts.prelude(finish) : (finish(), () => {});

    skip.on("pointerdown", () => {
      if (!started) fastForward(); // snap the entrance into place first
      end(true);
    });
    catcher.on("pointerdown", () => {
      if (!started) {
        fastForward(); // hurry the entrance, straight to the first line
        return;
      }
      advance();
    });
  }

  /** First arrival: the scout walks into camp and the Wayfarer lays out the deal. */
  private playIntro() {
    let walkTween: Phaser.Tweens.Tween | null = null;
    this.cinematicDialog({
      name: "THE WAYFARER",
      speaker: () => this.goddess,
      lines: [
        { text: "So you're the scout. The caravan can roll no further — the wilds ahead have swallowed the road." },
        {
          text: "I hold the list of what we lack. Swear my oaths, and haul what I ask back to camp — all of it is found beyond that portal.",
          cue: () => {
            if (this.departSign)
              this.tweens.add({ targets: this.departSign, scale: 1.3, duration: 260, yoyo: true, repeat: 2, ease: "Sine.easeInOut" });
            const pg = this.addGlow(445, -60, 3.4, 0.5);
            this.time.delayedCall(1800, () => pg.destroy());
          },
        },
        {
          text: "And mind the tarp tent — a smith sulks inside. Past the tenth floor, an unforged blade will not carry you.",
          cue: () => {
            for (const o of this.tentMark)
              this.tweens.add({ targets: o, scale: (o as Phaser.GameObjects.Text).scale * 1.5, duration: 260, yoyo: true, repeat: 2, ease: "Sine.easeInOut" });
          },
        },
      ],
      prelude: (finish) => {
        // the walk: in from beyond the camp's edge, slow and road-weary
        this.hero.setX(-860).play("hero-walk");
        walkTween = this.tweens.add({
          targets: this.hero,
          x: -47,
          duration: 4400,
          ease: "Sine.easeOut",
          onComplete: () => {
            this.hero.play("hero-idle");
            this.time.delayedCall(600, finish);
          },
        });
        return () => {
          walkTween?.stop();
          this.hero.setX(-47).play("hero-idle");
          finish();
        };
      },
      onEnd: (skipped) => {
        this.hero.setX(-47).play("hero-idle");
        this.meta.campIntroSeen = true;
        saveMeta(this.meta);
        this.refreshWayfarerMark();
        if (skipped) this.toast("the Wayfarer waits by the portal");
      },
    });
  }

  // ===== the Peddler: gems for gear =====

  /** Roll this visit's three wares (distinct, never boss trophies). */
  private rollShopOffers() {
    const pool = ITEMS.filter((i) => !i.bossOnly);
    Phaser.Utils.Array.Shuffle(pool);
    this.shopOffers = pool.slice(0, 3);
  }

  /** Play a peddler anim with its matching foot-line origin (the sheets differ). */
  private peddlerPlay(anim: "peddler-idle" | "peddler-walk") {
    this.peddler?.setOrigin(0.5, anim === "peddler-walk" ? PEDDLER_ORIGIN_WALK : PEDDLER_ORIGIN_IDLE).play(anim);
  }

  /** Stand her at her pitch with her goods. `entrance` = the arrival ceremony. */
  private buildPeddler(entrance: boolean) {
    const ped = this.add.sprite(entrance ? -880 : PEDDLER_X, 2, "knight-idle").setScale(PEDDLER_SCALE).setDepth(7);
    this.propBox.add(ped);
    this.peddler = ped;
    this.peddlerPlay(entrance ? "peddler-walk" : "peddler-idle");
    ped.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.peddlerTapped());
    if (!entrance) this.buildPeddlerGoods(false);
  }

  /** Her stall: a crate, a basket, and the shingle. Pops in during the arrival. */
  private buildPeddlerGoods(pop: boolean) {
    const goods: Phaser.GameObjects.GameObject[] = [];
    const crate = this.add.image(PEDDLER_X - 52, 1, "crate").setOrigin(0.5, 1).setScale(1.4).setDepth(6);
    const basket = this.add.image(PEDDLER_X + 44, 1, "basket_stack").setOrigin(0.5, 1).setScale(1.5).setDepth(6);
    this.propBox.add(crate);
    this.propBox.add(basket);
    const plq = this.plaque(PEDDLER_X, -132, "💰 PEDDLER");
    goods.push(crate, basket, plq);
    for (const g of goods) {
      const im = g as Phaser.GameObjects.Image;
      im.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.peddlerTapped());
    }
    if (pop) {
      goods.forEach((g, i) => {
        const im = g as Phaser.GameObjects.Image;
        const s = im.scaleX;
        im.setScale(0);
        this.tweens.add({ targets: im, scale: s, duration: 300, delay: 150 + i * 140, ease: "Back.easeOut" });
      });
      this.sfx("pouch", 0.5);
    }
  }

  /** She followed the glitter: walks in, unpacks, and makes her pitch. Once. */
  private playPeddlerArrival() {
    this.buildPeddler(true);
    let walkTween: Phaser.Tweens.Tween | null = null;
    let unpacked = false;
    const unpack = () => {
      if (unpacked) return;
      unpacked = true;
      this.peddlerPlay("peddler-idle");
      this.buildPeddlerGoods(true);
    };
    this.cinematicDialog({
      name: "THE PEDDLER",
      speaker: () => this.peddler,
      lines: [
        { text: "Hold there, scout. Is that the glitter of diamonds I hear in your pockets? Sweetest sound on any road." },
        {
          text: "They call me the Peddler. Gems for gear — have a look at my wares, and your next run leaves camp already armed.",
          cue: () => {
            if (this.peddler)
              this.tweens.add({ targets: this.peddler, scale: PEDDLER_SCALE * 1.1, duration: 260, yoyo: true, repeat: 1, ease: "Sine.easeInOut" });
          },
        },
      ],
      prelude: (finish) => {
        walkTween = this.tweens.add({
          targets: this.peddler,
          x: PEDDLER_X,
          duration: 3600,
          ease: "Sine.easeOut",
          onComplete: () => {
            unpack();
            this.time.delayedCall(800, finish);
          },
        });
        return () => {
          walkTween?.stop();
          this.peddler?.setX(PEDDLER_X);
          unpack();
          finish();
        };
      },
      onEnd: () => {
        this.peddler?.setX(PEDDLER_X);
        unpack();
        this.meta.peddlerArrived = true;
        saveMeta(this.meta);
        this.refreshWayfarerMark();
        this.toast("the Peddler has set up shop 💰");
      },
    });
  }

  /** Her shop: three wares for diamonds, packed into your slots for the NEXT run. */
  private peddlerTapped() {
    if (this.editMode || this.panelOpen || this.cutscene) return;
    this.closePanel();
    this.panelOpen = true;

    const vw = this.scale.width;
    const vh = this.scale.height;
    const stocked = this.meta.stockedItems;
    const W = 600;
    const H = 176 + this.shopOffers.length * 46 + 64;
    const box = this.add.container(0, 0).setDepth(90);
    const veil = this.add.rectangle(vw / 2, vh / 2, vw, vh, 0x05060a, 0.62).setInteractive();
    const bg = this.add.rectangle(vw / 2, vh / 2, W, H, 0x14171f).setStrokeStyle(3, 0x2a2d38);
    const title = this.add
      .text(vw / 2, vh / 2 - H / 2 + 32, "💰 THE PEDDLER", { fontFamily: EMOJI_FONT, fontStyle: "bold", fontSize: "20px", color: "#ffe08a" })
      .setOrigin(0.5);
    const bank = this.add
      .text(vw / 2, vh / 2 - H / 2 + 60, `your gems: 💎 ${this.meta.treasure}`, { fontFamily: EMOJI_FONT, fontSize: "15px", color: "#bfe6ff" })
      .setOrigin(0.5);
    box.add([veil, bg, title, bank]);

    const left = vw / 2 - W / 2 + 26;
    let y = vh / 2 - H / 2 + 96;
    for (const item of this.shopOffers) {
      const price = PEDDLER_PRICES[item.tier];
      const afford = this.meta.treasure >= price;
      const room = stocked.length < MAX_STOCKED;
      box.add(this.add.text(left, y, `${item.glyph} ${item.name}`, { fontFamily: EMOJI_FONT, fontSize: "16px", color: "#dfe3ea" }));
      box.add(this.add.text(left + 250, y + 2, item.tier, { fontFamily: "monospace", fontSize: "12px", color: TIER_COLORS[item.tier] }));
      const bx = vw / 2 + W / 2 - 88;
      const ok = afford && room;
      const rect = this.add.rectangle(bx, y + 10, 124, 32, ok ? 0x2e5e34 : 0x2a2d38).setStrokeStyle(2, ok ? 0x54c26e : 0x3a3f4b);
      const bt = this.add
        .text(bx, y + 10, `BUY 💎${price}`, { fontFamily: EMOJI_FONT, fontStyle: "bold", fontSize: "13px", color: ok ? "#dff5df" : "#6a707c" })
        .setOrigin(0.5);
      if (ok)
        rect.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
          spend(this.meta, { treasure: price });
          this.meta.stockedItems.push(item.id);
          saveMeta(this.meta);
          this.shopOffers = this.shopOffers.filter((o) => o !== item);
          this.refreshResources();
          this.sfx("coin3", 0.55);
          this.toast(`packed for the road: ${item.glyph} ${item.name}`);
          this.closePanel();
          this.peddlerTapped(); // reopen with the ware sold out
        });
      box.add([rect, bt]);
      y += 46;
    }
    if (!this.shopOffers.length) {
      box.add(this.add.text(vw / 2, y + 6, "「 Sold out. The road restocks me — come back after a run. 」", { fontFamily: EMOJI_FONT, fontSize: "14px", color: "#ffe08a" }).setOrigin(0.5));
      y += 34;
    }

    const packLine = stocked.length
      ? `packed for next run (${stocked.length}/${MAX_STOCKED}):  ${stocked.map((id) => ITEMS.find((i) => i.id === id)?.glyph ?? "?").join(" ")}`
      : `packed for next run:  — none —  (max ${MAX_STOCKED})`;
    box.add(this.add.text(vw / 2, vh / 2 + H / 2 - 78, packLine, { fontFamily: EMOJI_FONT, fontSize: "14px", color: "#a9e6a9" }).setOrigin(0.5));

    // footer: reroll the wares / leave
    const cby = vh / 2 + H / 2 - 36;
    const canReroll = this.meta.treasure >= PEDDLER_REROLL && this.shopOffers.length > 0;
    const rrect = this.add.rectangle(vw / 2 - 90, cby, 160, 36, canReroll ? 0x3a3a5e : 0x2a2d38).setStrokeStyle(2, canReroll ? 0x7a7ad0 : 0x3a3f4b);
    const rt = this.add
      .text(vw / 2 - 90, cby, `reroll 💎${PEDDLER_REROLL}`, { fontFamily: EMOJI_FONT, fontSize: "14px", color: canReroll ? "#d0d0ff" : "#6a707c" })
      .setOrigin(0.5);
    if (canReroll)
      rrect.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
        spend(this.meta, { treasure: PEDDLER_REROLL });
        this.rollShopOffers();
        this.refreshResources();
        this.sfx("pickup", 0.5);
        this.closePanel();
        this.peddlerTapped();
      });
    const crect = this.add.rectangle(vw / 2 + 90, cby, 140, 36, 0x2a2d38).setStrokeStyle(2, 0x3a3f4b).setInteractive({ useHandCursor: true });
    const ct = this.add.text(vw / 2 + 90, cby, "good day", { fontFamily: "monospace", fontSize: "14px", color: "#dfe3ea" }).setOrigin(0.5);
    crect.on("pointerdown", () => this.closePanel());
    box.add([rrect, rt, crect, ct]);

    this.panelBox = box;
  }

  /** Dev: relive the Peddler's arrival (console: __mbCamp.debugPeddler()). */
  public debugPeddler() {
    this.meta.treasure = Math.max(this.meta.treasure, 25);
    this.meta.peddlerArrived = false;
    this.meta.campIntroSeen = true;
    saveMeta(this.meta);
    this.scene.restart();
  }

  private toast(msg: string) {
    const vw = this.scale.width;
    const t = this.add
      .text(vw / 2, this.scale.height * 0.28, msg, {
        fontFamily: "monospace", fontStyle: "bold", fontSize: "17px", color: "#fff2b0", stroke: "#2a0c06", strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(95)
      .setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, y: t.y - 8, duration: 220 });
    this.tweens.add({ targets: t, alpha: 0, duration: 400, delay: 1400, onComplete: () => t.destroy() });
  }

  // ===== meta: resources / blacksmith / forge / quests =====

  private sfx(key: string, volume = 0.5) {
    if (this.cache.audio.exists(key)) this.sound.play(key, { volume: sfxV(volume) });
  }

  /** Pause the camp under the system menu (Esc / ☰). Held while a panel/cutscene runs. */
  private openMenu() {
    if (this.scene.isActive("menu") || this.editMode || this.panelOpen || this.cutscene || this.departing) return;
    this.scene.launch("menu", { from: "camp" });
    this.scene.pause();
  }

  private refreshResources() {
    this.resText.setText(`🪵 ${this.meta.wood}   🪨 ${this.meta.ore}   💎 ${this.meta.treasure}`);
  }

  /** Simple modal panel: dim veil + title + lines + buttons. One at a time. */
  private panel(title: string, lines: string[], buttons: { label: string; enabled?: boolean; cb?: () => void }[]) {
    this.closePanel();
    this.panelOpen = true;
    const vw = this.scale.width;
    const vh = this.scale.height;
    const box = this.add.container(0, 0).setDepth(90);
    const veil = this.add.rectangle(vw / 2, vh / 2, vw, vh, 0x05060a, 0.62).setInteractive(); // swallow taps
    const H = 150 + lines.length * 26 + 54;
    const W = 470;
    const bg = this.add.rectangle(vw / 2, vh / 2, W, H, 0x14171f).setStrokeStyle(3, 0x2a2d38);
    const titleT = this.add
      .text(vw / 2, vh / 2 - H / 2 + 34, title, { fontFamily: "monospace", fontStyle: "bold", fontSize: "20px", color: "#ffe08a" })
      .setOrigin(0.5);
    box.add([veil, bg, titleT]);
    lines.forEach((ln, i) => {
      box.add(
        this.add
          .text(vw / 2, vh / 2 - H / 2 + 74 + i * 26, ln, { fontFamily: EMOJI_FONT, fontSize: "16px", color: "#dfe3ea" })
          .setOrigin(0.5),
      );
    });
    // buttons along the bottom
    const bw = Math.min(190, (W - 40) / buttons.length - 10);
    const totalW = buttons.length * bw + (buttons.length - 1) * 12;
    buttons.forEach((b, i) => {
      const bx = vw / 2 - totalW / 2 + bw / 2 + i * (bw + 12);
      const by = vh / 2 + H / 2 - 38;
      const enabled = b.enabled !== false;
      const rect = this.add.rectangle(bx, by, bw, 40, enabled ? 0x2e5e34 : 0x2a2d38).setStrokeStyle(2, enabled ? 0x54c26e : 0x3a3f4b);
      const txt = this.add
        .text(bx, by, b.label, { fontFamily: EMOJI_FONT, fontSize: "15px", color: enabled ? "#dff5df" : "#6a707c" })
        .setOrigin(0.5);
      if (enabled)
        rect.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
          this.closePanel();
          b.cb?.();
        });
      box.add([rect, txt]);
    });
    this.panelBox = box;
  }

  private closePanel() {
    this.panelBox?.destroy();
    this.panelBox = null;
    this.panelOpen = false;
    this.refreshWayfarerMark(); // accepting/paying oaths changes her marker
  }

  /** The reluctant smith, hiding in the tarp tent until paid. */
  private tentTapped() {
    if (this.editMode || this.panelOpen || this.cutscene) return;
    if (this.meta.blacksmithHired) {
      this.toast("the tent is empty — Wren works the forge now");
      return;
    }
    const afford = canAfford(this.meta, BLACKSMITH_COST);
    this.panel(
      "A VOICE FROM THE TENT",
      [
        `"Hmph. The road took my tools and my nerve."`,
        `"Bring me 🪵 ${BLACKSMITH_COST.wood} and 🪨 ${BLACKSMITH_COST.ore} and I'll light that furnace."`,
        ``,
        `your bank:  🪵 ${this.meta.wood}   🪨 ${this.meta.ore}`,
      ],
      [
        { label: `HIRE  🪵${BLACKSMITH_COST.wood} 🪨${BLACKSMITH_COST.ore}`, enabled: afford, cb: () => this.hireSmith() },
        { label: "maybe later" },
      ],
    );
  }

  private hireSmith() {
    spend(this.meta, BLACKSMITH_COST);
    this.meta.blacksmithHired = true;
    saveMeta(this.meta);
    this.refreshResources();
    this.sfx("pouch", 0.6);
    for (const m of this.tentMark) m.destroy(); // the "?" is answered
    this.tentMark = [];
    // Wren steps out of the tent and walks to her forge (pace scales with the trip)
    const smith = this.add.sprite(TENT_X, 2, "smith").setOrigin(0.5, 0.734).setScale(2.1).setDepth(6).play("smith-walk");
    this.propBox.add(smith);
    this.smith = smith;
    this.tweens.add({
      targets: smith,
      x: 85,
      duration: Math.max(900, Math.abs(85 - TENT_X) * 7),
      ease: "Sine.easeInOut",
      onComplete: () => {
        smith.play("smith-idle");
        this.lightFurnace(true); // she keeps her word — the furnace roars to life
        this.toast("Wren the blacksmith joins the caravan! ⚒");
        this.refreshWayfarerMark(); // a "hire" oath may now be ready to turn in
        if (this.meta.active.some((aq) => questDone(this.meta, aq)))
          this.time.delayedCall(1500, () => this.toast("an oath is fulfilled — the Wayfarer has your payment"));
      },
    });
  }

  /** Wren's forge: buy permanent sword damage, scaling ore cost. */
  private furnaceTapped() {
    if (this.editMode || this.panelOpen || this.cutscene) return;
    if (!this.meta.blacksmithHired) {
      this.toast("the furnace is cold… someone in that tent might know its trade");
      return;
    }
    const cost = forgeCost(this.meta.swordLevel);
    const afford = canAfford(this.meta, { ore: cost });
    this.panel(
      "⚒ WREN'S FORGE",
      [
        `blade edge:  +${this.meta.swordLevel} → +${this.meta.swordLevel + 1} first-strike damage`,
        ``,
        `your bank:  🪨 ${this.meta.ore}`,
      ],
      [
        { label: `FORGE  🪨${cost}`, enabled: afford, cb: () => this.forgeUpgrade(cost) },
        { label: "not yet" },
      ],
    );
  }

  private forgeUpgrade(cost: number) {
    spend(this.meta, { ore: cost });
    this.meta.swordLevel++;
    saveMeta(this.meta);
    this.refreshResources();
    this.sfx("pickup", 0.65);
    this.toast(`the edge sings — sword damage +${this.meta.swordLevel} ⚔`);
    this.refreshWayfarerMark(); // a forge oath may now be ready to turn in
    if (this.meta.active.some((aq) => questDone(this.meta, aq)))
      this.time.delayedCall(1500, () => this.toast("an oath is fulfilled — the Wayfarer has your payment"));
  }

  /** The Wayfarer's quest board: accepted quests with progress + new offers to accept. */
  private goddessTapped() {
    if (this.editMode || this.panelOpen || this.cutscene) return;

    // turn-ins happen HERE: she pays every kept oath the moment you see her
    const rewarded = collectQuestRewards(this.meta);
    if (rewarded.length) {
      this.refreshResources();
      rewarded.forEach((q, i) =>
        this.time.delayedCall(250 + i * 1200, () => {
          this.sfx("coin3", 0.5);
          this.toast(`oath kept: ${q.label}  +${q.reward} 💎`);
        }),
      );
    }

    this.closePanel();
    this.panelOpen = true;

    const vw = this.scale.width;
    const vh = this.scale.height;
    const active = this.meta.active;
    const offers = offeredQuests(this.meta);
    const rows = Math.max(1, active.length + offers.length) + (active.length && offers.length ? 1 : 0);
    const W = 600;
    const H = 168 + rows * 34 + 56;
    const box = this.add.container(0, 0).setDepth(90);
    const veil = this.add.rectangle(vw / 2, vh / 2, vw, vh, 0x05060a, 0.62).setInteractive();
    const bg = this.add.rectangle(vw / 2, vh / 2, W, H, 0x14171f).setStrokeStyle(3, 0x2a2d38);
    const title = this.add
      .text(vw / 2, vh / 2 - H / 2 + 32, "THE WAYFARER", { fontFamily: "monospace", fontStyle: "bold", fontSize: "20px", color: "#ffe08a" })
      .setOrigin(0.5);
    box.add([veil, bg, title]);

    const left = vw / 2 - W / 2 + 26;
    let y = vh / 2 - H / 2 + 72;
    const line = (txt: string, color = "#dfe3ea", size = "15px") => {
      const t = this.add.text(left, y, txt, { fontFamily: EMOJI_FONT, fontSize: size, color });
      box.add(t);
      return t;
    };

    if (active.length) {
      line(`— sworn (${active.length}/${MAX_ACTIVE}) —`, "#8a8f98", "13px");
      y += 26;
      for (const aq of active) {
        const q = questById(aq.id)!;
        const p = questProgress(this.meta, aq);
        const done = p.have >= p.need;
        line(`${done ? "✅" : "▫️"} ${q.label}   (${p.have}/${p.need})`, done ? "#a9e6a9" : "#dfe3ea");
        y += 34;
      }
    }
    if (offers.length) {
      line(`— the Wayfarer offers —`, "#8a8f98", "13px");
      y += 26;
      for (const q of offers) {
        line(`${q.label}   +${q.reward}💎`);
        // ACCEPT button on the row
        const bx = vw / 2 + W / 2 - 78;
        const rect = this.add.rectangle(bx, y + 10, 104, 30, 0x2e5e34).setStrokeStyle(2, 0x54c26e).setInteractive({ useHandCursor: true });
        const bt = this.add.text(bx, y + 10, "ACCEPT", { fontFamily: "monospace", fontStyle: "bold", fontSize: "13px", color: "#dff5df" }).setOrigin(0.5);
        rect.on("pointerdown", () => {
          if (acceptQuest(this.meta, q.id)) {
            this.sfx("pickup", 0.55);
            this.toast(`sworn: ${q.label}`);
            this.closePanel();
            this.goddessTapped(); // reopen with refreshed board
          }
        });
        box.add([rect, bt]);
        y += 34;
      }
    }
    const cleared = allQuestsDone(this.meta);
    const canTravel = roadOpen(this.meta); // pool cleared AND a next biome exists
    if (!active.length && !offers.length) {
      line(cleared ? "「 Every oath is kept. The road onward lies open. 」" : "「 Rest. The road will ask more of you soon. 」", "#ffe08a");
      y += 34;
    } else {
      y += 6;
      const foot = cleared
        ? "「 Every oath is kept. The road onward lies open. 」"
        : "「 Keep every oath on my list, and I will open the road. 」";
      box.add(this.add.text(vw / 2, vh / 2 + H / 2 - 78, foot, { fontFamily: EMOJI_FONT, fontSize: "14px", color: "#ffe08a" }).setOrigin(0.5));
    }

    // bottom button: travel onward once the road is open, otherwise just close
    const cbx = vw / 2;
    const cby = vh / 2 + H / 2 - 36;
    if (canTravel) {
      const next = nextBiome(this.meta)!;
      const label = `▸ take the road to the ${next === "forest" ? "High Forest" : next} ▸`;
      const crect = this.add.rectangle(cbx, cby, 300, 40, 0x2e5e34).setStrokeStyle(2, 0x54c26e).setInteractive({ useHandCursor: true });
      const ct = this.add.text(cbx, cby, label, { fontFamily: "monospace", fontStyle: "bold", fontSize: "14px", color: "#dff5df" }).setOrigin(0.5);
      crect.on("pointerdown", () => this.travelOnward());
      box.add([crect, ct]);
    } else {
      const crect = this.add.rectangle(cbx, cby, 150, 38, 0x2a2d38).setStrokeStyle(2, 0x3a3f4b).setInteractive({ useHandCursor: true });
      const ct = this.add.text(cbx, cby, "onward", { fontFamily: "monospace", fontSize: "15px", color: "#dfe3ea" }).setOrigin(0.5);
      crect.on("pointerdown", () => this.closePanel());
      box.add([crect, ct]);
    }

    this.panelBox = box;
  }

  /** The road is open — break camp and rebuild the scene in the next biome. */
  private travelOnward() {
    if (this.departing) return;
    this.departing = true;
    this.closePanel();
    const next = nextBiome(this.meta);
    if (!advanceBiome(this.meta) || !next) {
      this.departing = false;
      return;
    }
    this.sfx("pickup", 0.6);
    this.toast("the caravan breaks camp…");
    this.cameras.main.fadeOut(900, 6, 8, 12);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.restart());
  }

  /** Head out: the hero jogs off toward the portal, the day fades, the run begins. */
  private depart() {
    if (this.departing || this.editMode || this.panelOpen || this.cutscene) return;
    this.departing = true;
    this.hero.play("hero-walk");
    // a slow, deliberate jog to the portal — then a gentle fade well after he sets off
    this.tweens.add({ targets: this.hero, x: 700, duration: 2300, ease: "Sine.easeIn" });
    this.tweens.add({ targets: this.fireSnd, volume: 0, duration: 1800 });
    this.tweens.add({ targets: this.ambSnd, volume: 0, duration: 1800 });
    this.time.delayedCall(1400, () => this.cameras.main.fadeOut(1300, 5, 6, 10));
    this.time.delayedCall(2750, () => this.scene.start("game"));
  }

  // ===== dev layout editor: toggle ✎, drag anything, 📋 copies the layout JSON =====
  private buildEditor() {
    const mkBtn = (label: string) =>
      this.add
        .text(0, 0, label, { fontFamily: "monospace", fontSize: "16px", color: "#dfe3ea", backgroundColor: "#14171f", padding: { x: 8, y: 4 } })
        .setOrigin(1, 0)
        .setDepth(70)
        .setInteractive({ useHandCursor: true });
    this.editBtn = mkBtn("✎ edit");
    this.copyBtn = mkBtn("📋 copy layout").setVisible(false);

    // selection badge: tap a prop -> red ✕ pops at its corner; tap the ✕ to hide it
    const boundsOf = (o: EditableProp["obj"]) => (o as unknown as Phaser.GameObjects.Sprite).getBounds();
    const badge = this.add
      .text(0, 0, "✕", { fontFamily: "monospace", fontStyle: "bold", fontSize: "20px", color: "#ffffff", backgroundColor: "#c0392b", padding: { x: 7, y: 2 } })
      .setOrigin(0.5)
      .setDepth(72)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    const tag = this.add
      .text(0, 0, "", { fontFamily: "monospace", fontSize: "12px", color: "#ffe08a", backgroundColor: "#14171f", padding: { x: 5, y: 2 } })
      .setOrigin(0, 1)
      .setDepth(72)
      .setVisible(false);

    let dragging: EditableProp | null = null;
    let selected: EditableProp | null = null;
    const showSel = (e: EditableProp | null) => {
      selected = e;
      if (!e || !e.obj.visible) {
        badge.setVisible(false);
        tag.setVisible(false);
        return;
      }
      const b = boundsOf(e.obj);
      badge.setPosition(b.right, b.top).setVisible(true);
      tag.setText(`${e.key} @${Math.round(e.obj.x)},${Math.round(e.obj.y)}`).setPosition(b.left, b.top - 4).setVisible(true);
    };
    const removeSel = () => {
      if (!selected) return;
      const s = selected;
      s.obj.setVisible(false);
      this.editable = this.editable.filter((x) => x !== s);
      this.toast(`hid ${s.key} — tell me: remove ${s.key} @${Math.round(s.obj.x)} to delete it for good`);
      showSel(null);
      dragging = null;
    };

    this.editBtn.on("pointerdown", () => {
      this.editMode = !this.editMode;
      this.editBtn!.setText(this.editMode ? "✔ done" : "✎ edit").setColor(this.editMode ? "#ffe08a" : "#dfe3ea");
      this.copyBtn!.setVisible(this.editMode);
      this.portalHit?.setVisible(!this.editMode); // don't let the big depart zone swallow drags
      if (!this.editMode) showSel(null);
      this.toast(this.editMode ? "tap a prop to select · drag to move · tap ✕ to hide · 📋 copies layout" : "edit mode off");
    });
    this.copyBtn.on("pointerdown", () => {
      const layout = this.editable.map((e) => ({
        key: e.key,
        x: Math.round(e.obj.x),
        y: Math.round(e.obj.y),
        scale: +e.obj.scaleX.toFixed(2),
        ...(e.frame !== undefined ? { frame: e.frame } : {}),
      }));
      const json = JSON.stringify(layout, null, 1);
      navigator.clipboard?.writeText(json).then(
        () => this.toast("layout copied — paste it to Claude to bake it in"),
        () => console.log(json),
      );
      console.log("[camp layout]", json);
    });

    // manual drag / select: convert screen px -> propBox-local (inside the scaled container)
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (!this.editMode) return;
      // tapped the ✕ badge -> remove the selected prop
      if (selected && badge.visible && Phaser.Geom.Rectangle.Contains(boundsOf(badge), p.x, p.y)) {
        removeSel();
        return;
      }
      const lx = (p.x - this.propBox.x) / this.campScale;
      const ly = (p.y - this.propBox.y) / this.campScale;
      let best: { e: EditableProp; d: number } | null = null;
      for (const e of this.editable) {
        const d = Phaser.Math.Distance.Between(lx, ly, e.obj.x, e.obj.y - 20);
        if (d < 90 && (!best || d < best.d)) best = { e, d };
      }
      dragging = best?.e ?? null;
      showSel(dragging);
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.editMode || !dragging || !p.isDown) return;
      dragging.obj.x = Math.round((p.x - this.propBox.x) / this.campScale);
      dragging.obj.y = Math.round((p.y - this.propBox.y) / this.campScale);
      showSel(dragging);
    });
    this.input.on("pointerup", () => (dragging = null));
  }

  /** Full-bleed reflow: sky + earth span the viewport; the camp scales off height. */
  private layout() {
    const vw = this.scale.width;
    const vh = this.scale.height;
    const groundY = Math.round(vh * GROUND_FRAC);
    for (const p of this.parallax) {
      p.sprite.setPosition(0, 0).setSize(vw, groundY);
      const sc = groundY / PARALLAX_SRC_H;
      p.sprite.setTileScale(sc, sc);
    }
    for (const c of this.clouds) c.img.setY(Math.round(c.fy * groundY)).setScale((c.base * groundY) / PARALLAX_SRC_H);

    const bandH = vh - groundY;
    this.ground.setPosition(0, groundY).setSize(vw, bandH);
    const gsc = bandH / 96; // one vertical repeat: grass lip on top, dirt below
    this.ground.setTileScale(gsc, gsc);

    this.campScale = Math.min(vh / DH, vw / DW); // fit by height AND width — never sprawl past the edges
    // offset so the (asymmetric) composition is visually centred: hill far-left, portal right edge
    this.propBox.setPosition(Math.round(vw / 2 - CONTENT_CX * this.campScale), groundY).setScale(this.campScale);
    this.biomeLabel.setPosition(14, 10);
    this.menuBtn.setPosition(vw - 14, 8);
    this.editBtn?.setPosition(vw - 14, 44); // dev buttons stack under the menu chip
    this.copyBtn?.setPosition(vw - 14, 74);
  }

  update(_t: number, delta: number) {
    const d = delta / 1000;
    for (const p of this.parallax) if (p.drift) p.sprite.tilePositionX += (p.drift * d) / p.sprite.tileScaleX;
    const vw = this.scale.width;
    for (const c of this.clouds) {
      c.img.x -= c.speed * d;
      const hw = c.img.displayWidth / 2;
      if (c.img.x < -hw) c.img.x = vw + hw; // wrap around
    }
  }
}
