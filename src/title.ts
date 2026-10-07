/**
 * Title screen: animated biome scenery behind native, readable menu controls.
 */
import Phaser from "phaser";
import { version as APP_VERSION } from "../package.json";
import { biomeDef } from "./camp";
import { loadMeta, readSlot, SAVE_SLOTS } from "./meta";
import { readCheckpoint } from "./run-save";
import { musicV, setSoundLevel } from "./audio";
import { TILE_KEYS, preloadTileArt, prepareTileArt } from "./tile-art";
import "./title.css";

const PARALLAX_SRC_H = 216;
const GROUND_FRAC = 0.8;

export class TitleScene extends Phaser.Scene {
  private parallax: { sprite: Phaser.GameObjects.TileSprite; drift: number }[] = [];
  private ground!: Phaser.GameObjects.TileSprite;
  private veil!: Phaser.GameObjects.Rectangle;
  private ui?: HTMLElement;
  private starting = false;

  constructor() {
    super("title");
  }

  preload() {
    const biome = biomeDef(loadMeta().biome);
    const img = (key: string, file: string) => {
      if (!this.textures.exists(key)) this.load.image(key, file);
    };
    for (const layer of biome.parallax) img(layer.key, layer.file);
    img(biome.floor.key, biome.floor.file);
    preloadTileArt(this);
    if (!this.cache.audio.exists("music_menu")) this.load.audio("music_menu", "sounds/music_menu.mp3");
  }

  create() {
    prepareTileArt(this);
    this.parallax = [];
    this.starting = false;
    const meta = loadMeta();
    const biome = biomeDef(meta.biome);
    const groundKey = `camp-ground-${meta.biome}`;
    if (!this.textures.exists(groundKey)) {
      const src = this.textures.get(biome.floor.key).getSourceImage() as HTMLImageElement;
      const canvas = document.createElement("canvas");
      canvas.width = biome.floor.w;
      canvas.height = biome.floor.h;
      const context = canvas.getContext("2d")!;
      context.imageSmoothingEnabled = false;
      context.drawImage(src, biome.floor.sx, biome.floor.sy, biome.floor.w, biome.floor.h, 0, 0, biome.floor.w, biome.floor.h);
      this.textures.addCanvas(groundKey, canvas);
    }
    for (const layer of biome.parallax) {
      const sprite = this.add.tileSprite(0, 0, 8, 8, layer.key).setOrigin(0, 0);
      this.parallax.push({ sprite, drift: layer.drift });
    }
    this.ground = this.add.tileSprite(0, 0, 8, 8, groundKey).setOrigin(0, 0);
    this.veil = this.add.rectangle(0, 0, 8, 8, 0x0d1319, 0.46).setOrigin(0, 0).setDepth(10);
    this.buildMenu();
    this.layout();

    const onPause = () => { if (this.ui) this.ui.hidden = true; };
    const onResume = () => {
      if (this.ui) {
        this.ui.hidden = false;
        this.ui.querySelector<HTMLButtonElement>(".mb-title-load")?.focus({ preventScroll: true });
      }
    };
    this.scale.on("resize", this.layout, this);
    this.events.on(Phaser.Scenes.Events.PAUSE, onPause);
    this.events.on(Phaser.Scenes.Events.RESUME, onResume);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.layout, this);
      this.events.off(Phaser.Scenes.Events.PAUSE, onPause);
      this.events.off(Phaser.Scenes.Events.RESUME, onResume);
      this.ui?.remove();
      this.ui = undefined;
    });

    const music = this.sound.add("music_menu", { loop: true });
    const level = () => setSoundLevel(music, musicV(0.2));
    music.play();
    level();
    this.sound.once(Phaser.Sound.Events.UNLOCKED, level);
    this.game.events.on("audio-changed", level);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("audio-changed", level);
      this.sound.off(Phaser.Sound.Events.UNLOCKED, level);
      music.stop();
      music.destroy();
    });
  }

  private buildMenu() {
    this.ui?.remove();
    const meta = loadMeta();
    const returning = meta.campIntroSeen || meta.slain > 0;
    const hasSave = Array.from({ length: SAVE_SLOTS }, (_, index) => readSlot(index + 1)).some(Boolean);
    const root = document.createElement("section");
    root.className = "mb-title-screen";
    root.setAttribute("aria-labelledby", "mb-title-name");
    root.innerHTML = `
      <div class="mb-title-card">
        <div class="mb-title-intro">
          <h1 class="mb-title-name" id="mb-title-name">match<span>Blade</span></h1>
          <p class="mb-title-tagline">Clear the road.<br>Build your caravan.</p>
          <div class="mb-title-tiles" aria-hidden="true"></div>
        </div>
        <div class="mb-title-menu">
          <div class="mb-title-stats" aria-label="Your progress">
            <div><span>Best depth</span><strong data-stat="depth"></strong></div>
            <div><span>Sword level</span><strong data-stat="sword"></strong></div>
          </div>
          <button class="mb-title-play" type="button"><span class="mb-title-play-label"></span><span class="mb-title-arrow" aria-hidden="true">→</span></button>
          <button class="mb-title-load" type="button">Load game</button>
          <p class="mb-title-autosave"><span aria-hidden="true">✓</span> Progress saves automatically</p>
        </div>
      </div>
      <span class="mb-title-version"></span>`;
    const stats = root.querySelector<HTMLElement>(".mb-title-stats")!;
    stats.hidden = !returning;
    root.querySelector('[data-stat="depth"]')!.textContent = String(meta.bestDepth);
    root.querySelector('[data-stat="sword"]')!.textContent = String(meta.swordLevel);
    root.querySelector(".mb-title-play-label")!.textContent = readCheckpoint(meta) ? "Resume run" : returning ? "Continue" : "Play";
    root.querySelector(".mb-title-version")!.textContent = `v${APP_VERSION}`;
    root.querySelector<HTMLButtonElement>(".mb-title-play")!.addEventListener("click", event => { event.stopPropagation(); this.setOut(); });
    const load = root.querySelector<HTMLButtonElement>(".mb-title-load")!;
    load.hidden = !hasSave;
    load.addEventListener("click", event => { event.stopPropagation(); this.openLoad(); });

    // Reuse the game's full-resolution tile faces; only the artwork is rasterized.
    const tiles = root.querySelector(".mb-title-tiles")!;
    for (const key of TILE_KEYS.slice(0, 3)) {
      const source = this.textures.get(key).getSourceImage() as HTMLCanvasElement;
      const tile = document.createElement("img");
      tile.src = source.toDataURL();
      tile.alt = "";
      tile.draggable = false;
      tiles.append(tile);
    }
    this.ui = root;
    (this.game.canvas.parentElement ?? document.body).append(root);
  }

  private openLoad() {
    if (this.starting || this.scene.isActive("menu")) return;
    this.scene.launch("menu", { from: "title", view: "load" });
    this.scene.pause();
  }

  private setOut() {
    if (this.starting || !this.scene.isActive() || this.scene.isActive("menu")) return;
    this.starting = true;
    this.ui?.classList.add("is-leaving");
    this.ui?.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = true; });
    const { width, height } = this.scale;
    const out = this.add.rectangle(width / 2, height / 2, width * 2, height * 2, 0x05060a, 0).setDepth(50);
    this.tweens.add({
      targets: out, fillAlpha: 1, duration: 340, ease: "Quad.easeIn",
      onComplete: () => this.scene.start(readCheckpoint(loadMeta()) ? "game" : "camp"),
    });
  }

  private layout() {
    const { width, height } = this.scale;
    const groundY = Math.round(height * GROUND_FRAC);
    for (const layer of this.parallax) {
      layer.sprite.setPosition(0, 0).setSize(width, groundY).setTileScale(groundY / PARALLAX_SRC_H);
    }
    const bandH = height - groundY;
    this.ground.setPosition(0, groundY).setSize(width, bandH).setTileScale(bandH / 96);
    this.veil.setPosition(0, 0).setSize(width, height);
  }

  update(_t: number, delta: number) {
    for (const layer of this.parallax) if (layer.drift) layer.sprite.tilePositionX += layer.drift * delta / 1000 / layer.sprite.tileScaleX;
  }
}

