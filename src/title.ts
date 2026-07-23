/**
 * TitleScene — the landing screen. The biome's parallax breathes behind a dark
 * veil, the name hangs over three bobbing tiles, and one button sets out for
 * camp. Deliberately light: no menus here, the camp is the real hub.
 */
import Phaser from "phaser";
import { biomeDef } from "./camp";
import { loadMeta, readSlot, SAVE_SLOTS } from "./meta";

const PARALLAX_SRC_H = 216; // vnitti layer source height (shared with camp/run)
const GROUND_FRAC = 0.8; // ground line as a fraction of viewport height

const TILE_DECOR = [
  { key: "tile-sword", file: "tiles/sword.png" },
  { key: "tile-staff", file: "tiles/staff.png" },
  { key: "tile-shield", file: "tiles/shield.png" },
];

export class TitleScene extends Phaser.Scene {
  private parallax: { sprite: Phaser.GameObjects.TileSprite; drift: number }[] = [];
  private ground!: Phaser.GameObjects.TileSprite;
  private veil!: Phaser.GameObjects.Rectangle;
  private title!: Phaser.GameObjects.Text;
  private tagline!: Phaser.GameObjects.Text;
  private tiles: Phaser.GameObjects.Image[] = [];
  private btnStart!: Phaser.GameObjects.Container;
  private btnLoad!: Phaser.GameObjects.Container;
  private foot!: Phaser.GameObjects.Text;
  private starting = false;
  private uiScale = 1; // layout()'s shrink factor — hover/press tweens scale off this

  constructor() {
    super("title");
  }

  preload() {
    const biome = biomeDef(loadMeta().biome);
    const img = (key: string, file: string) => {
      if (!this.textures.exists(key)) this.load.image(key, file);
    };
    for (const l of biome.parallax) img(l.key, l.file);
    img(biome.floor.key, biome.floor.file);
    for (const t of TILE_DECOR) img(t.key, t.file);
  }

  create() {
    this.parallax = [];
    this.tiles = [];
    this.starting = false;
    const meta = loadMeta();
    const biome = biomeDef(meta.biome);

    // ground texture: same seamless grass-top slice the camp bakes (shared key)
    const groundKey = `camp-ground-${meta.biome}`;
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

    for (const l of biome.parallax) {
      const ts = this.add.tileSprite(0, 0, 8, 8, l.key).setOrigin(0, 0);
      this.parallax.push({ sprite: ts, drift: l.drift });
    }
    this.ground = this.add.tileSprite(0, 0, 8, 8, groundKey).setOrigin(0, 0);
    // dusk veil: the world recedes so the name carries the screen
    this.veil = this.add.rectangle(0, 0, 8, 8, 0x070910, 0.42).setOrigin(0, 0).setDepth(10);

    this.title = this.add
      .text(0, 0, "matchBlade", { fontFamily: "monospace", fontStyle: "bold", fontSize: "64px", color: "#ffffff", stroke: "#1a0a04", strokeThickness: 10 })
      .setOrigin(0.5)
      .setDepth(20);
    this.title.setTint(0xfff6c8, 0xffe08a, 0xf2a93b, 0xc9761f); // the game's gold
    this.title.setShadow(0, 6, "rgba(0,0,0,0.8)", 10, true, true);

    this.tagline = this.add
      .text(0, 0, "match tiles · fight the dark · clear the road", { fontFamily: "monospace", fontSize: "17px", color: "#aeb9c8", stroke: "#0a0b0f", strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(20);

    // three tiles of the trade bob under the name, each on its own beat
    // (the bob tweens are (re)built by layout(), pinned to the laid-out y)
    TILE_DECOR.forEach((t, i) => {
      const img = this.add.image(0, 0, t.key).setDepth(20).setScale(0.8).setAngle(i === 1 ? 0 : i === 0 ? -5 : 5);
      this.tiles.push(img);
    });

    // LOAD GAME only lights up once a snapshot exists to load
    let hasSave = false;
    for (let n = 1; n <= SAVE_SLOTS; n++) if (readSlot(n)) hasSave = true;
    this.btnStart = this.buildButton("START GAME", true, () => this.setOut());
    this.btnLoad = this.buildButton("LOAD GAME", false, hasSave ? () => this.openLoad() : null);
    this.foot = this.add
      .text(0, 0, "an early build — your camp saves itself", { fontFamily: "monospace", fontSize: "12px", color: "#5d6675", stroke: "#0a0b0f", strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(20);

    // lay out first (it also starts the tile bobs), THEN fade in over it — the
    // bob and fade are separate tweens, so they coexist; a mid-intro resize just
    // snaps everything visible (layout resets alpha), which is fine.
    this.layout();
    this.title.setAlpha(0);
    this.tweens.add({ targets: this.title, alpha: 1, duration: 600, ease: "Sine.easeOut" });
    for (const o of [this.tagline, this.btnStart, this.btnLoad, this.foot, ...this.tiles]) {
      o.setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 500, delay: 350, ease: "Sine.easeOut" });
    }

    this.scale.off("resize", this.layout, this);
    this.scale.on("resize", this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off("resize", this.layout, this));
  }

  /** A menu button: gold + breathing glow for the primary, quiet steel otherwise. */
  private buildButton(text: string, primary: boolean, cb: (() => void) | null): Phaser.GameObjects.Container {
    const enabled = !!cb;
    const w = 250;
    const h = primary ? 60 : 50;
    const edge = !enabled ? 0x3a3f4b : primary ? 0xf2a93b : 0x4a5a74;
    const ink = !enabled ? "#5d6675" : primary ? "#ffe08a" : "#cfd8e8";
    const bg = this.add.rectangle(0, 0, w, h, primary ? 0x14110a : 0x10131a, 0.88).setStrokeStyle(primary ? 3 : 2, edge, 0.95);
    const label = this.add
      .text(0, 0, text, { fontFamily: "monospace", fontStyle: "bold", fontSize: primary ? "24px" : "19px", color: ink, stroke: "#0a0b0f", strokeThickness: 5 })
      .setOrigin(0.5);
    const parts: Phaser.GameObjects.GameObject[] = [bg, label];
    if (primary && enabled) {
      const glow = this.add.rectangle(0, 0, w + 10, h + 10, 0xffe08a, 0.06).setBlendMode(Phaser.BlendModes.ADD);
      parts.unshift(glow);
      this.tweens.add({ targets: glow, alpha: 0.16, duration: 1100, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
    const c = this.add.container(0, 0, parts).setDepth(20).setSize(w, h);
    if (enabled)
      c.setInteractive({ useHandCursor: true })
        .on("pointerover", () => this.tweens.add({ targets: c, scale: this.uiScale * 1.05, duration: 120, ease: "Quad.easeOut" }))
        .on("pointerout", () => this.tweens.add({ targets: c, scale: this.uiScale, duration: 120, ease: "Quad.easeOut" }))
        .on("pointerdown", cb);
    return c;
  }

  /** LOAD GAME: the pause menu's load view, straight over the title. */
  private openLoad() {
    if (this.starting) return;
    this.scene.launch("menu", { from: "title", view: "load" });
    this.scene.pause();
  }

  /** Flash, fade the screen down, and hand over to camp. */
  private setOut() {
    if (this.starting) return;
    this.starting = true;
    this.tweens.add({ targets: this.btnStart, scale: this.uiScale * 0.94, duration: 80, yoyo: true });
    const vw = this.scale.width;
    const vh = this.scale.height;
    const out = this.add.rectangle(vw / 2, vh / 2, vw * 2, vh * 2, 0x05060a, 0).setDepth(50);
    this.tweens.add({ targets: out, fillAlpha: 1, duration: 420, ease: "Quad.easeIn", onComplete: () => this.scene.start("camp") });
  }

  /** Full-bleed reflow, mirroring the camp: sky spans, ground bands, UI stacks off centre. */
  private layout() {
    const vw = this.scale.width;
    const vh = this.scale.height;
    const groundY = Math.round(vh * GROUND_FRAC);
    for (const p of this.parallax) {
      p.sprite.setPosition(0, 0).setSize(vw, groundY);
      const sc = groundY / PARALLAX_SRC_H;
      p.sprite.setTileScale(sc, sc);
    }
    const bandH = vh - groundY;
    this.ground.setPosition(0, groundY).setSize(vw, bandH);
    const gsc = bandH / 96;
    this.ground.setTileScale(gsc, gsc);
    this.veil.setPosition(0, 0).setSize(vw, vh);

    const cx = vw / 2;
    const s = Math.min(1, vw / 760, vh / 560); // one shrink factor keeps the stack on small phones
    this.uiScale = s;
    this.title.setScale(s).setPosition(cx, vh * 0.26);
    this.tagline.setScale(s).setPosition(cx, vh * 0.26 + 58 * s);
    this.tiles.forEach((t, i) => {
      this.tweens.killTweensOf(t); // rebuild the bob pinned to the fresh y (also ends any fade — snap visible)
      t.setAlpha(1);
      t.setScale(0.8 * s).setPosition(cx + (i - 1) * 110 * s, vh * 0.52);
      this.tweens.add({ targets: t, y: t.y + 7, duration: 1500 + i * 180, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: i * 260 });
    });
    this.btnStart.setScale(s).setPosition(cx, vh * 0.7);
    this.btnLoad.setScale(s).setPosition(cx, vh * 0.7 + 72 * s);
    this.foot.setScale(s).setPosition(cx, vh - 10);
  }

  update(_t: number, delta: number) {
    const d = delta / 1000;
    for (const p of this.parallax) if (p.drift) p.sprite.tilePositionX += (p.drift * d) / p.sprite.tileScaleX;
  }
}
