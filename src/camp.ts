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

const DH = 560; // design height for the prop layer (smaller = more zoomed in)
const DW = 1080; // full design width of the camp spread (smaller = more zoomed in; clamps vw/DW)
const CONTENT_CX = -55; // horizontal centre of the visible window — keeps the DEPART portal fully in frame
const GROUND_FRAC = 0.8; // ground line as a fraction of viewport height
const PARALLAX_SRC_H = 216; // vnitti layer source height

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
  // autumn / winter: same shape — GandalfHardcore floor atlas rows + Glacial/Autumn parallax sets.
};

const BIOME = "plains"; // the caravan's current stop (meta progression will drive this)

// Static camp dressing, baked from the in-camp editor (positions are FINAL — no squeeze).
type Prop = { key: string; x: number; y: number; s: number; depth: number; frame?: number; flip?: boolean };
const PROPS: Prop[] = [
  // backdrop
  { key: "tree2", x: -485, y: 3, s: 1.35, depth: 1, flip: true },
  { key: "birch1", x: 308, y: 7, s: 1.5, depth: 2 },
  { key: "clothesline", x: -94, y: 2, s: 1.35, depth: 2 },
  // homestead
  { key: "tarp_tent", x: -297, y: 1, s: 2.0, depth: 5 },
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
  { key: "rocks_small1", x: -148, y: 1, s: 1.2, depth: 8 },
  { key: "rocks_small2", x: 25, y: 1, s: 1.2, depth: 8 },
  { key: "tuft_tiny", x: -203, y: 3, s: 1.5, depth: 8 },
  { key: "tuft_tiny", x: 57, y: 0, s: 1.4, depth: 8 },
  { key: "tall_grass", x: 284, y: 5, s: 1.5, depth: 8, frame: 0 },
  { key: "tall_grass", x: 305, y: 5, s: 1.4, depth: 8, frame: 1 },
];

export class CampScene extends Phaser.Scene {
  private parallax: { sprite: Phaser.GameObjects.TileSprite; drift: number }[] = [];
  private clouds: { img: Phaser.GameObjects.Image; speed: number; fy: number; base: number }[] = []; // high drifting clouds
  private ground!: Phaser.GameObjects.TileSprite;
  private propBox!: Phaser.GameObjects.Container;
  private biomeLabel!: Phaser.GameObjects.Text;
  private hero!: Phaser.GameObjects.Sprite;
  private fireSnd: Phaser.Sound.BaseSound | null = null;
  private departing = false;

  // dev layout editor: drag props around, then copy the layout as JSON
  private campScale = 1;
  private editMode = false;
  private editable: EditableProp[] = [];
  private editBtn?: Phaser.GameObjects.Text;
  private copyBtn?: Phaser.GameObjects.Text;
  private portalHit?: Phaser.GameObjects.Rectangle;

  constructor() {
    super("camp");
  }

  preload() {
    const biome = CAMP_BIOMES[BIOME];
    const img = (key: string, file: string) => {
      if (!this.textures.exists(key)) this.load.image(key, file);
    };
    for (const l of biome.parallax) img(l.key, l.file);
    img(biome.floor.key, biome.floor.file);

    // hero (shared with GameScene — whoever loads first wins)
    if (!this.textures.exists("warrior")) this.load.spritesheet("warrior", "sprites/warrior.png", { frameWidth: 80, frameHeight: 64 });

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
  }

  create() {
    this.departing = false;
    this.parallax = [];
    this.clouds = [];
    this.editable = [];
    this.editMode = false;
    const biome = CAMP_BIOMES[BIOME];

    // ground texture: seamless grass-top slice cropped from the biome's floor atlas
    if (!this.textures.exists("camp-ground")) {
      const src = this.textures.get(biome.floor.key).getSourceImage() as HTMLImageElement;
      const cv = document.createElement("canvas");
      cv.width = biome.floor.w;
      cv.height = biome.floor.h;
      const cx = cv.getContext("2d")!;
      cx.imageSmoothingEnabled = false;
      cx.drawImage(src, biome.floor.sx, biome.floor.sy, biome.floor.w, biome.floor.h, 0, 0, biome.floor.w, biome.floor.h);
      this.textures.addCanvas("camp-ground", cv);
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
    this.ground = this.add.tileSprite(0, 0, 8, 8, "camp-ground").setOrigin(0, 0);

    // --- the camp itself (design coords, anchored to the ground line) ---
    this.propBox = this.add.container(0, 0);
    this.buildCamp();

    // biome tag, top-left
    this.biomeLabel = this.add
      .text(14, 10, `⛺ CAMP — ${biome.label}`, { fontFamily: "monospace", fontStyle: "bold", fontSize: "15px", color: "#dfe3ea", stroke: "#0a0b0f", strokeThickness: 4 })
      .setDepth(50);

    if (import.meta.env.DEV) this.buildEditor();

    this.layout();
    this.scale.off("resize", this.layout, this);
    this.scale.on("resize", this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.layout, this);
      this.fireSnd?.stop();
      this.fireSnd = null;
    });

    this.fireSnd = this.sound.add("camp_fire", { volume: 0.22, loop: true });
    this.fireSnd.play();
    this.cameras.main.fadeIn(350, 5, 6, 10);

    if (import.meta.env.DEV) (globalThis as unknown as { __mbCamp: CampScene }).__mbCamp = this;
  }

  private buildAnims() {
    const mk = (key: string, tex: string, start: number, end: number, fps: number) => {
      if (this.anims.exists(key)) return;
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(tex, { start, end }), frameRate: fps, repeat: -1 });
    };
    mk("hero-idle", "warrior", 0, 7, 8);
    mk("hero-walk", "warrior", 48, 55, 15);
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
    const glow = (x: number, y: number, scale: number, a: number) => {
      const g = this.add.image(x, y, "camp-glow").setBlendMode(Phaser.BlendModes.ADD).setScale(scale).setAlpha(a).setDepth(9);
      this.propBox.add(g);
      this.tweens.add({ targets: g, alpha: a * 0.55, scale: scale * 0.92, duration: 380, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    };

    for (const p of PROPS) put(p);

    // hero stands in the middle of camp
    this.hero = this.add.sprite(-47, 2, "warrior").setOrigin(0.5, 0.734).setScale(2.1).setDepth(7).play("hero-idle");
    this.propBox.add(this.hero);

    // blacksmith placeholder: glowing furnace + plaque (tap -> coming soon)
    const furnace = sprite("furnace", "furnace-burn", 138, 0, 2.1, 5);
    glow(138, -46, 2.4, 0.26);
    this.plaque(138, -152, "⚒ BLACKSMITH");
    furnace.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
      if (!this.editMode) this.toast("The blacksmith joins the caravan soon…");
    });

    // DEPART: humming portal (right side of camp)
    const portal = sprite("portal", "portal-spin", 445, 9, 2.6, 5);
    glow(445, -60, 2.6, 0.3);
    const sign = this.plaque(363, -194, "DEPART ▶");
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

  private toast(msg: string) {
    const vw = this.scale.width;
    const t = this.add
      .text(vw / 2, this.scale.height * 0.28, msg, {
        fontFamily: "monospace", fontStyle: "bold", fontSize: "17px", color: "#fff2b0", stroke: "#2a0c06", strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, y: t.y - 8, duration: 220 });
    this.tweens.add({ targets: t, alpha: 0, duration: 400, delay: 1400, onComplete: () => t.destroy() });
  }

  /** Head out: the hero jogs off toward the portal, the day fades, the run begins. */
  private depart() {
    if (this.departing || this.editMode) return;
    this.departing = true;
    this.hero.play("hero-walk");
    this.tweens.add({ targets: this.hero, x: 900, duration: 1100, ease: "Sine.easeIn" });
    this.tweens.add({ targets: this.fireSnd, volume: 0, duration: 700 });
    this.cameras.main.fadeOut(750, 5, 6, 10);
    this.time.delayedCall(800, () => this.scene.start("game"));
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
    this.editBtn?.setPosition(vw - 14, 10);
    this.copyBtn?.setPosition(vw - 14, 40);
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
