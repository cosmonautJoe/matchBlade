/**
 * TitleScene — the landing screen. The biome's parallax breathes behind a dark
 * veil, the name hangs over three bobbing tiles, and one button sets out for
 * camp. Deliberately light: no menus here, the camp is the real hub.
 */
import Phaser from "phaser";
import { version as APP_VERSION } from "../package.json";
import { biomeDef } from "./camp";
import { loadMeta, readSlot, SAVE_SLOTS } from "./meta";
import { readCheckpoint } from "./run-save";
import { musicV, setSoundLevel } from "./audio";
import { TILE_KEYS, TILE_TEXTURE_DENSITY, preloadTileArt, prepareTileArt } from "./tile-art";

const PARALLAX_SRC_H = 216; // vnitti layer source height (shared with camp/run)
const GROUND_FRAC = 0.8; // ground line as a fraction of viewport height

const TILE_DECOR = TILE_KEYS.slice(0, 3);

export class TitleScene extends Phaser.Scene {
  private parallax: { sprite: Phaser.GameObjects.TileSprite; drift: number }[] = [];
  private ground!: Phaser.GameObjects.TileSprite;
  private veil!: Phaser.GameObjects.Rectangle;
  private title!: Phaser.GameObjects.Text;
  private card!: Phaser.GameObjects.Graphics;
  private eyebrow!: Phaser.GameObjects.Text;
  private saveInfo!: Phaser.GameObjects.Text;
  private tagline!: Phaser.GameObjects.Text;
  private tiles: Phaser.GameObjects.Image[] = [];
  private btnStart!: Phaser.GameObjects.Container;
  private btnLoad!: Phaser.GameObjects.Container;
  private foot!: Phaser.GameObjects.Text;
  private version!: Phaser.GameObjects.Text; // build number, bottom-right
  private starting = false;
  private uiScale = 1; // layout()'s shrink factor — hover/press tweens scale off this
  private uiScaleY = 1;

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
    preloadTileArt(this);
    if (!this.cache.audio.exists("music_menu")) this.load.audio("music_menu", "sounds/music_menu.mp3"); // A Great Journey (Overworld)
  }

  create() {
    prepareTileArt(this);
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
    this.veil = this.add.rectangle(0, 0, 8, 8, 0x070e18, 0.66).setOrigin(0, 0).setDepth(10);
    this.card = this.add.graphics().setDepth(11);
    this.eyebrow = this.add.text(0, 0, "PUZZLE COMBAT · ONE MORE RUN", {
      fontFamily: '"Segoe UI", system-ui, sans-serif', fontSize: "13px", fontStyle: "bold", color: "#82efcd", letterSpacing: 3,
    }).setOrigin(0.5).setDepth(20);

    this.title = this.add
      .text(0, 0, "matchBlade", { fontFamily: '"Segoe UI", system-ui, sans-serif', fontStyle: "bold", fontSize: "76px", color: "#f1f6ff" })
      .setOrigin(0.5)
      .setDepth(20);
    this.title.setShadow(0, 4, "rgba(0,0,0,0.3)", 12, true, true);

    this.tagline = this.add
      .text(0, 0, "Match tiles. Beat enemies. Upgrade your next run.", { fontFamily: '"Segoe UI", system-ui, sans-serif', fontSize: "17px", color: "#b7c7d8" })
      .setOrigin(0.5)
      .setDepth(20);

    // three tiles of the trade bob under the name, each on its own beat
    // (the bob tweens are (re)built by layout(), pinned to the laid-out y)
    TILE_DECOR.forEach((key, i) => {
      const img = this.add.image(0, 0, key).setDepth(20).setScale(0.8 / TILE_TEXTURE_DENSITY).setAngle(i === 1 ? 0 : i === 0 ? -5 : 5);
      this.tiles.push(img);
    });

    // LOAD GAME only lights up once a snapshot exists to load
    let hasSave = false;
    for (let n = 1; n <= SAVE_SLOTS; n++) if (readSlot(n)) hasSave = true;
    const returning = meta.campIntroSeen || meta.slain > 0;
    this.btnStart = this.buildButton(readCheckpoint(meta) ? "RESUME RUN  →" : returning ? "CONTINUE  →" : "LET'S PLAY  →", true, () => this.setOut());
    this.btnLoad = this.buildButton("LOAD GAME", false, hasSave ? () => this.openLoad() : null);
    this.saveInfo = this.add.text(0, 0, returning ? `BEST DEPTH  ${meta.bestDepth}     ·     SWORD LEVEL  ${meta.swordLevel}` : "SWAP TO ATTACK   ·   MATCH TO DEFEND", {
      fontFamily: '"Segoe UI", system-ui, sans-serif', fontSize: "12px", fontStyle: "bold", color: "#91a7bc", letterSpacing: 1,
    }).setOrigin(0.5).setDepth(20);
    this.foot = this.add
      .text(0, 0, "Progress saves automatically. Pick up where you left off.", { fontFamily: '"Segoe UI", system-ui, sans-serif', fontSize: "12px", color: "#91a7bc" })
      .setOrigin(0.5, 1)
      .setDepth(20);
    // Import the version directly so Vite watches package.json during development.
    this.version = this.add
      .text(0, 0, `v${APP_VERSION}`, { fontFamily: "monospace", fontStyle: "bold", fontSize: "13px", color: "#ffffff", stroke: "#0a0b0f", strokeThickness: 4 })
      .setOrigin(1, 1)
      .setDepth(20);

    // lay out first (it also starts the tile bobs), THEN fade in over it — the
    // bob and fade are separate tweens, so they coexist; a mid-intro resize just
    // snaps everything visible (layout resets alpha), which is fine.
    this.layout();
    this.title.setAlpha(0);
    this.tweens.add({ targets: this.title, alpha: 1, duration: 600, ease: "Sine.easeOut" });
    for (const o of [this.tagline, this.btnStart, this.btnLoad, this.foot, this.version, ...this.tiles]) {
      o.setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 500, delay: 350, ease: "Sine.easeOut" });
    }

    this.scale.off("resize", this.layout, this);
    this.scale.on("resize", this.layout, this);
    this.input.keyboard?.on("keydown-ENTER", () => { if (!this.scene.isActive("menu")) this.setOut(); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off("resize", this.layout, this));

    // "A Great Journey" under the title — straight in at its level, no fade.
    // setSoundLevel writes the level into the sound's config too, so Phaser's
    // internal re-applies (loop restart, blur-resume, unlock) keep OUR level.
    const music = this.sound.add("music_menu", { loop: true });
    const level = () => setSoundLevel(music, musicV(0.2));
    music.play();
    level();
    this.sound.once(Phaser.Sound.Events.UNLOCKED, level);
    this.game.events.on("audio-changed", level); // options slider / 🎵 mute re-level live
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("audio-changed", level);
      this.sound.off(Phaser.Sound.Events.UNLOCKED, level);
      music.stop();
    });
  }

  /** A menu button: gold + breathing glow for the primary, quiet steel otherwise. */
  private buildButton(text: string, primary: boolean, cb: (() => void) | null): Phaser.GameObjects.Container {
    const enabled = !!cb;
    const w = 330;
    const h = primary ? 58 : 48;
    const edge = !enabled ? 0x2a3746 : primary ? 0x82efcd : 0x4a5a74;
    const ink = !enabled ? "#69798a" : primary ? "#0a2426" : "#cfd8e8";
    const bg = this.add.rectangle(0, 0, w, h, primary ? 0x82efcd : 0x15212f, 1).setStrokeStyle(1, edge);
    const label = this.add
      .text(0, 0, text, { fontFamily: '"Segoe UI", system-ui, sans-serif', fontStyle: "bold", fontSize: "18px", color: ink, letterSpacing: 1 })
      .setOrigin(0.5);
    const parts: Phaser.GameObjects.GameObject[] = [bg, label];
    if (primary && enabled) {
      const glow = this.add.rectangle(0, 0, w + 10, h + 10, 0x82efcd, 0.06).setBlendMode(Phaser.BlendModes.ADD);
      parts.unshift(glow);
      this.tweens.add({ targets: glow, alpha: 0.16, duration: 1100, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
    const c = this.add.container(0, 0, parts).setDepth(20).setSize(w, h);
    if (enabled)
      c.setInteractive({ useHandCursor: true })
        .on("pointerover", () => this.tweens.add({ targets: c, scaleX: this.uiScale * 1.05, scaleY: this.uiScaleY * 1.05, duration: 120, ease: "Quad.easeOut" }))
        .on("pointerout", () => this.tweens.add({ targets: c, scaleX: this.uiScale, scaleY: this.uiScaleY, duration: 120, ease: "Quad.easeOut" }))
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
    this.tweens.add({ targets: this.btnStart, scaleX: this.uiScale * 0.94, scaleY: this.uiScaleY * 0.94, duration: 80, yoyo: true });
    const vw = this.scale.width;
    const vh = this.scale.height;
    const out = this.add.rectangle(vw / 2, vh / 2, vw * 2, vh * 2, 0x05060a, 0).setDepth(50);
    this.tweens.add({ targets: out, fillAlpha: 1, duration: 420, ease: "Quad.easeIn", onComplete: () => this.scene.start(readCheckpoint(loadMeta()) ? "game" : "camp") });
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
    this.tweens.killTweensOf([this.btnStart, this.btnLoad]);
    // Reflow can cancel the delayed intro fade while its buttons are still transparent.
    this.btnStart.setAlpha(1);
    this.btnLoad.setAlpha(1);
    // Phone typography uses screen pixels instead of shrinking the desktop
    // card (which reduced 12px copy to just 7px on a 393px-wide phone).
    if (vw < 600 && vh >= vw) {
      const cardW = vw - 32;
      const cardH = Math.min(500, vh - 32);
      const top = Math.round((vh - cardH) / 2);
      const contentW = cardW - 32;
      this.card.clear().fillStyle(0x0c1724, 0.96).fillRoundedRect(16, top, cardW, cardH, 18);
      this.card.lineStyle(1, 0x3d5966, 0.8).strokeRoundedRect(16, top, cardW, cardH, 18);
      this.eyebrow.setText("PUZZLE COMBAT").setScale(1).setFontSize(12).setPosition(cx, top + cardH * .09);
      this.title.setScale(1).setFontSize(Math.min(48, contentW / 5.5)).setPosition(cx, top + cardH * .2);
      this.tagline.setText("Match tiles. Beat enemies.\nUpgrade your next run.").setScale(1).setFontSize(16)
        .setWordWrapWidth(contentW).setAlign("center").setPosition(cx, top + cardH * .32);
      this.tiles.forEach((t, i) => {
        this.tweens.killTweensOf(t);
        t.setAlpha(1).setScale(.72 / TILE_TEXTURE_DENSITY).setPosition(cx + (i - 1) * 82, top + cardH * .48);
        this.tweens.add({ targets: t, y: t.y + 5, duration: 1500 + i * 180, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      });
      this.saveInfo.setScale(1).setFontSize(13).setWordWrapWidth(contentW).setAlign("center").setPosition(cx, top + cardH * .6);
      this.uiScale = Math.min(1, contentW / 330);
      this.uiScaleY = 1;
      this.btnStart.setScale(this.uiScale, 1).setPosition(cx, top + cardH * .73);
      this.btnLoad.setScale(this.uiScale, 1).setPosition(cx, top + cardH * .73 + 62);
      this.foot.setText("Progress saves automatically.").setScale(1).setFontSize(13).setPosition(cx, top + cardH - 16);
      this.version.setScale(1).setFontSize(12).setPosition(vw - 14, vh - 10);
      return;
    }
    this.tagline.setText("Match tiles. Beat enemies. Upgrade your next run.").setFontSize(17);
    this.foot.setText("Progress saves automatically. Pick up where you left off.");
    if (vh < 520 && vw >= 600) {
      const left = vw * 0.28, right = vw * 0.73;
      this.uiScale = Math.min(1, (vw * 0.43 - 20) / 330);
      this.uiScaleY = this.uiScale;
      this.card.clear().fillStyle(0x0c1724, 0.96).fillRoundedRect(16, 12, vw - 32, vh - 24, 18);
      this.card.lineStyle(1, 0x3d5966).strokeRoundedRect(16, 12, vw - 32, vh - 24, 18);
      this.eyebrow.setText("PUZZLE COMBAT").setScale(1).setFontSize(15).setPosition(left, vh * 0.2);
      this.title.setScale(1).setFontSize(44).setPosition(left, vh * 0.34);
      this.tagline.setScale(1).setFontSize(17).setWordWrapWidth(vw * 0.4).setAlign("center").setPosition(left, vh * 0.5);
      this.tiles.forEach((t, i) => {
        this.tweens.killTweensOf(t);
        t.setAlpha(1).setScale(0.65 / TILE_TEXTURE_DENSITY).setPosition(left + (i - 1) * 72, vh * 0.74);
      });
      this.saveInfo.setScale(1).setFontSize(15).setWordWrapWidth(vw * 0.39).setAlign("center").setPosition(right, vh * 0.25);
      this.btnStart.setScale(this.uiScale).setPosition(right, vh * 0.46);
      this.btnLoad.setScale(this.uiScale).setPosition(right, vh * 0.46 + 66);
      this.foot.setText("Progress saves automatically.").setScale(1).setFontSize(15).setPosition(right, vh - 40);
      this.version.setScale(1).setPosition(vw - 26, vh - 17);
      return;
    }
    this.title.setFontSize(76);
    this.eyebrow.setText("PUZZLE COMBAT · ONE MORE RUN").setFontSize(13);
    this.tagline.setWordWrapWidth(0);
    this.saveInfo.setFontSize(12).setWordWrapWidth(0);
    this.foot.setFontSize(12);
    const s = Math.min(1.3, (vw - 32) / 600, (vh - 24) / 540);
    const cy = vh / 2;
    const copyScale = s;
    const buttonScale = s;
    this.uiScale = buttonScale;
    this.uiScaleY = buttonScale;
    this.card.clear().fillStyle(0x0c1724, 0.94).fillRoundedRect(cx - 300 * s, cy - 270 * s, 600 * s, 540 * s, 22 * s);
    this.card.lineStyle(1, 0x3d5966, 0.8).strokeRoundedRect(cx - 300 * s, cy - 270 * s, 600 * s, 540 * s, 22 * s);
    this.eyebrow.setScale(s).setPosition(cx, cy - 218 * s);
    this.title.setScale(s).setPosition(cx, cy - 157 * s);
    this.tagline.setScale(copyScale).setPosition(cx, cy - 94 * s);
    this.saveInfo.setScale(s).setPosition(cx, cy + 56 * s);
    this.tiles.forEach((t, i) => {
      this.tweens.killTweensOf(t); // rebuild the bob pinned to the fresh y (also ends any fade — snap visible)
      t.setAlpha(1);
      t.setScale(0.95 * s / TILE_TEXTURE_DENSITY).setPosition(cx + (i - 1) * 105 * s, cy - 14 * s);
      this.tweens.add({ targets: t, y: t.y + 7, duration: 1500 + i * 180, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: i * 260 });
    });
    this.btnStart.setScale(buttonScale).setPosition(cx, cy + 117 * s);
    this.btnLoad.setScale(buttonScale).setPosition(cx, cy + 179 * s);
    this.foot.setScale(s).setPosition(cx, cy + 239 * s);
    this.version.setScale(Math.min(1, copyScale)).setPosition(vw - 14, vh - 10);
  }

  update(_t: number, delta: number) {
    const d = delta / 1000;
    for (const p of this.parallax) if (p.drift) p.sprite.tilePositionX += (p.drift * d) / p.sprite.tileScaleX;
  }
}
