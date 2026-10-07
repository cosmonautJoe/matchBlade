/**
 * matchBlade — first-run tutorial (plays once; meta.tutorialSeen).
 *
 * A step-driven overlay on the LIVE run scene: everything dims except a
 * spotlight hole, a card explains one idea, and two beats are hands-on —
 * match swords to attack the enemy, then match shields and watch a scripted
 * counter-strike bounce off the guard. While the tutorial is up the scene
 * holds the run harmless (no enemy strikes, no scroll pressure) and the
 * board unlocks only for the hands-on steps, so nothing can kill the player
 * mid-lesson. Skippable; progress persists so it runs exactly once.
 *
 * The host (GameScene) implements TutorialHost: geometry lookups, a planted
 * one-swap match (rigSwapMatch), and a scripted enemy strike (demoStrike).
 * It pings us with onCascade/onBoardSettled as the board resolves.
 */

import Phaser from "phaser";
import { SWORD, SHIELD } from "./run";
import type { Coord } from "./board";
import { UI, UI_FONT } from "./ui-theme";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Pt {
  x: number;
  y: number;
}

export interface TutorialHost extends Phaser.Scene {
  toScreen(x: number, y: number): Pt; // design-local -> screen px
  uiScale(): number;
  laneRectD(): Rect; // design-local
  boardRectD(): Rect; // design-local
  cellRectD(r: number, c: number): Rect; // design-local
  resourceRowsRect(from: number, to: number): Rect; // HUD panel — already screen px
  rigSwapMatch(type: number): { from: Coord; to: Coord };
  demoStrike(pierce: boolean, slowMotion?: boolean): boolean;
  focusTutorialSword(onComplete: () => void): void;
  focusTutorialHit(onComplete: () => void): void;
  restoreTutorialView(onComplete?: () => void, immediate?: boolean): void;
  markTutorialSeen(): void;
}

// mirror main.ts: text-first stack so emoji render on iOS without garbling digits
const EMOJI_FONT =
  'system-ui,-apple-system,"Segoe UI",Roboto,"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const STEPS = 8;
const DIM = 0x05060a;

const COPY: { title: string; body: string }[] = [
  {
    title: "Clear the road",
    body: "Match tiles to fight and collect supplies. Everything you collect comes back to camp.",
  },
  {
    title: "Make your move",
    body: "Drag to swap, or tap two neighbouring tiles. Match 3 or more of the same type to activate them.",
  },
  {
    title: "Your first attack",
    body: "Match ⚔️ swords for melee damage or purple fireballs for spell damage. Make the highlighted swap to attack.",
  },
  {
    title: "Keep your ground",
    body: "Time and enemy hits push you toward the skull ☠. Defeating an enemy moves you forward. Reach the skull and the run ends.",
  },
  {
    title: "Raise your guard",
    body: "Match 🛡️ shields to gain guard charges. They block regular enemy hits. Make the highlighted match.",
  },
  {
    title: "Keys open chests",
    body: "Save keys for the chests along the road. Each chest costs one key. Unused keys reset after a run.",
  },
  {
    title: "Build your caravan",
    body: "Keep all collected 🪵 wood, 🪨 stone and 💎 gems, even if you lose. Spend them at camp on permanent upgrades and items.",
  },
  {
    title: "One more trick",
    body: "Match 4 to create a ×2 tile, or 5+ for ×3. Match it later to multiply that group's reward. Random ×2 tiles appear too.",
  },
];
// step 4's second beat, after the scripted strike clangs off the guard
const BLOCKED_COPY = {
  title: "Hit blocked",
  body: "Blocked! Guard charges took the hit for you. Match more shields to refill them.",
};

export class Tutorial {
  private g: TutorialHost;
  private objs: Phaser.GameObjects.GameObject[] = []; // current step's visuals
  private step = 0;
  private phase = 0; // sub-beat inside a step (3: strike landed; 4: blocked card)
  private waitType: number | null = null; // tile type a hands-on step waits for
  private matched = false; // waitType cleared during the current resolve?
  private rig: { from: Coord; to: Coord } | null = null;
  private armed = false; // tap-to-continue live (debounced against the opening tap)
  private done = false;

  constructor(host: TutorialHost) {
    this.g = host;
  }

  /** GameScene gates strikes / scroll / chests on this. */
  get active(): boolean {
    return !this.done;
  }
  /** Board input stays locked except while a hands-on step waits for its match. */
  get lockBoard(): boolean {
    return !this.done && this.waitType === null;
  }

  start() {
    this.g.input.on("pointerdown", this.onTap);
    this.g.scale.on("resize", this.onResize, this);
    this.g.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    // let the scene's fade-in + the hero's jog land before the first card
    this.g.time.delayedCall(600, () => {
      if (!this.done) this.setStep(0);
    });
  }

  /** resolve() reports each cascade's cleared counts. */
  onCascade(counts: Record<number, number>): Promise<void> | void {
    if (this.waitType === null || (counts[this.waitType] ?? 0) < 3) return;
    const firstMatch = !this.matched;
    this.matched = true;
    if (firstMatch && this.step === 2) {
      // The board has explained the input; now move the player's eye to the
      // consequence. Resolve pauses here until the camera has reached the lane,
      // so the hero cannot finish swinging during the push-in.
      this.clearVisuals();
      return new Promise<void>((resolve) => this.g.focusTutorialSword(resolve));
    }
  }

  /** trySwap() reports when the board has fully settled after a player move. */
  onBoardSettled() {
    if (this.done || this.waitType === null) return;
    if (!this.matched) {
      // the cascade may have chewed through the planted move — re-plant, re-point
      this.rig = this.g.rigSwapMatch(this.waitType);
      this.render();
      return;
    }
    const step = this.step;
    this.waitType = null; // board locks again while the beat plays out
    this.clearVisuals(); // drop every overlay — the hero's answer plays out unobstructed
    if (step === 2) {
      // let the hero's combo land, then move to the knockback lesson
      this.g.time.delayedCall(1250, () => {
        if (!this.done && this.step === 2) this.setStep(3);
      });
    } else if (step === 4) {
      // shields banked — after a beat the foe swings into the guard
      this.g.time.delayedCall(900, () =>
        this.tryDemo(false, 8, () => {
          if (this.done || this.step !== 4) return;
          this.phase = 1;
          this.render();
          this.armTap(500);
        }),
      );
    }
  }

  // ---- step machine ---------------------------------------------------------

  private onTap = () => {
    if (this.done || !this.armed) return;
    this.armed = false;
    if (this.step >= STEPS - 1) this.finish();
    else if (this.step === 3) {
      // Let the lane breathe back out before the shield lesson needs the full board.
      this.g.restoreTutorialView(() => {
        if (!this.done && this.step === 3) this.setStep(4);
      });
    }
    else this.setStep(this.step + 1);
  };

  private onResize() {
    if (!this.done) this.render();
  }

  private setStep(n: number) {
    this.step = n;
    this.phase = 0;
    this.armed = false;
    this.matched = false;
    this.waitType = null;
    if (n === 2 || n === 4) {
      this.waitType = n === 2 ? SWORD : SHIELD;
      this.rig = this.g.rigSwapMatch(this.waitType);
    }
    if (n === 3) {
      // Push in on the lane before the card and demonstration appear. The foe's
      // melee is slowed only for this beat so contact and lost ground read clearly.
      this.clearVisuals();
      this.g.focusTutorialHit(() => {
        if (this.done || this.step !== 3) return;
        this.render();
        this.g.time.delayedCall(650, () =>
          this.tryDemo(
            true,
            8,
            () => {
              if (this.done || this.step !== 3) return;
              this.phase = 1;
              this.render();
              this.armTap(500);
            },
            true,
          ),
        );
      });
    } else {
      this.render();
      if (this.waitType === null) this.armTap();
    }
  }

  /** Fire a scripted strike once a live foe is engaged, retrying between fights. */
  private tryDemo(pierce: boolean, retries: number, then: () => void, slowMotion = false) {
    if (this.done) return;
    if (this.g.demoStrike(pierce, slowMotion)) {
      this.g.time.delayedCall(slowMotion ? 1250 : 900, then); // let the shove / clang read
      return;
    }
    if (retries > 0) this.g.time.delayedCall(450, () => this.tryDemo(pierce, retries - 1, then, slowMotion));
    else then(); // no foe showed up — don't strand the player, the words carry it
  }

  private armTap(delay = 420) {
    const s = this.step;
    const p = this.phase;
    this.g.time.delayedCall(delay, () => {
      if (!this.done && this.step === s && this.phase === p) this.armed = true;
    });
  }

  private finish() {
    if (this.done) return;
    this.done = true;
    this.waitType = null;
    this.g.input.off("pointerdown", this.onTap);
    this.g.scale.off("resize", this.onResize, this);
    const objs = this.objs;
    this.objs = [];
    for (const o of objs) this.g.tweens.add({ targets: o, alpha: 0, duration: 240, onComplete: () => o.destroy() });
    this.g.restoreTutorialView();
    this.g.markTutorialSeen();
  }

  /** Scene shutdown mid-tutorial: drop everything, save nothing. */
  private teardown() {
    if (this.done) return;
    this.done = true;
    this.g.input.off("pointerdown", this.onTap);
    this.g.scale.off("resize", this.onResize, this);
    this.g.restoreTutorialView(undefined, true);
    for (const o of this.objs) o.destroy();
    this.objs = [];
  }

  // ---- rendering --------------------------------------------------------------

  /** Redraw the current step from scratch (also our resize handler). */
  private render() {
    this.clearVisuals();
    const boardHole = () => this.toScreenRect(this.g.boardRectD());
    const laneHole = () => this.toScreenRect(this.g.laneRectD());
    switch (this.step) {
      case 0:
      case 1: {
        const hole = this.step === 0 ? laneHole() : boardHole();
        this.dim(hole);
        this.card(COPY[this.step], hole, true);
        break;
      }
      case 2:
      case 4: {
        if (this.step === 4 && this.phase === 1) {
          const hole = laneHole();
          this.dim(hole);
          this.card(BLOCKED_COPY, hole, true);
          break;
        }
        // hands-on: keep BOTH the lane and the board bright — the player must
        // see the swap AND the hero act on it. A slim banner up in the sky
        // carries the instruction instead of a lane-covering card.
        const hole = this.union(laneHole(), boardHole());
        this.dim(hole);
        this.banner(
          this.step === 2
            ? "⚔️ Match 3 swords to attack the enemy — make the highlighted swap"
            : "🛡️ Match 3 shields to raise your guard — make the highlighted swap",
        );
        this.pointAtRig();
        break;
      }
      case 3: {
        const hole = laneHole();
        this.dim(hole);
        this.card(COPY[3], hole, this.phase === 1);
        break;
      }
      case 5:
      case 6: {
        const hole = this.step === 5 ? this.g.resourceRowsRect(3, 3) : this.g.resourceRowsRect(0, 2);
        this.dim(this.pad(hole, 6));
        this.card(COPY[this.step], hole, true);
        break;
      }
      case 7: {
        this.dim(null);
        this.card(COPY[7], null, true);
        break;
      }
    }
    this.skipButton();
  }

  /** Dim everything but `hole` (null = full veil) with a soft gold frame on the hole. */
  private dim(hole: Rect | null) {
    const vw = this.g.scale.width;
    const vh = this.g.scale.height;
    const mk = (x: number, y: number, w: number, h: number) => {
      if (w <= 0 || h <= 0) return;
      const r = this.keep(this.g.add.rectangle(x, y, w, h, DIM, 0.74).setOrigin(0).setDepth(90).setAlpha(0));
      this.g.tweens.add({ targets: r, alpha: 1, duration: 230 });
    };
    if (!hole) {
      mk(0, 0, vw, vh);
      return;
    }
    const h = this.pad(hole, 6);
    mk(0, 0, vw, h.y);
    mk(0, h.y + h.h, vw, vh - h.y - h.h);
    mk(0, h.y, h.x, h.h);
    mk(h.x + h.w, h.y, vw - h.x - h.w, h.h);
    const ring = this.keep(this.g.add.graphics().setDepth(92).setAlpha(0));
    ring.lineStyle(2, 0xf1d395, 0.9);
    ring.strokeRoundedRect(h.x, h.y, h.w, h.h, 12);
    this.g.tweens.add({ targets: ring, alpha: 0.85, duration: 300 });
  }

  /** The step card: dark panel, gold title, body, progress dots, optional tap hint. */
  private card(copy: { title: string; body: string }, hole: Rect | null, tap: boolean) {
    const vw = this.g.scale.width;
    const vh = this.g.scale.height;
    const w = Math.min(600, vw - 40);
    const pad = 20;
    const titleT = this.g.add.text(0, 0, copy.title, {
      fontFamily: UI_FONT,
      fontStyle: "bold",
      fontSize: "23px",
      color: UI.gold,
    });
    const bodyT = this.g.add.text(0, 0, copy.body, {
      fontFamily: EMOJI_FONT,
      fontSize: "17px",
      color: UI.text,
      lineSpacing: 5,
      wordWrap: { width: w - pad * 2 },
    });
    const dotsT = this.g.add.text(0, 0, `${this.step + 1} / ${STEPS}`, {
      fontFamily: UI_FONT,
      fontSize: "14px",
      color: UI.muted,
    });
    const hH = pad + titleT.height + 10 + bodyT.height + 14 + 16 + pad;
    // sit clear of the spotlight: below it when it's in the top half, above it otherwise
    let cy: number;
    if (!hole) cy = vh / 2;
    else if (hole.y + hole.h / 2 < vh / 2) cy = Math.min(vh - hH / 2 - 14, hole.y + hole.h + 18 + hH / 2);
    else cy = Math.max(hH / 2 + 14, hole.y - 18 - hH / 2);
    const cont = this.keep(this.g.add.container(vw / 2, cy).setDepth(94));
    const gfx = this.g.add.graphics();
    gfx.fillStyle(0x080e14, .25);
    gfx.fillRoundedRect(-w / 2, -hH / 2 + 5, w, hH, 20);
    gfx.fillStyle(UI.panel, 0.98);
    gfx.fillRoundedRect(-w / 2, -hH / 2, w, hH, 20);
    gfx.lineStyle(1, UI.border, 1);
    gfx.strokeRoundedRect(-w / 2, -hH / 2, w, hH, 20);
    gfx.fillStyle(0xf1d395, .8);
    gfx.fillRoundedRect(-w / 2 + pad, hH / 2 - 8, (w - pad * 2) * (this.step + 1) / STEPS, 3, 2);
    titleT.setPosition(-w / 2 + pad, -hH / 2 + pad);
    bodyT.setPosition(-w / 2 + pad, titleT.y + titleT.height + 10);
    dotsT.setPosition(-w / 2 + pad, hH / 2 - pad + 4).setOrigin(0, 1);
    cont.add([gfx, titleT, bodyT, dotsT]);
    if (tap) {
      const tapT = this.g.add
        .text(w / 2 - pad, hH / 2 - pad + 4, "Tap to continue →", { fontFamily: UI_FONT, fontSize: "15px", color: UI.gold })
        .setOrigin(1, 1);
      cont.add(tapT);
      this.g.tweens.add({ targets: tapT, alpha: 0.8, duration: 1000, yoyo: true, repeat: -1 });
    }
    cont.setY(cy + 6).setAlpha(0);
    this.g.tweens.add({ targets: cont, y: cy, alpha: 1, duration: 180, ease: "Cubic.easeOut" });
  }

  /** Slim one-line strip pinned to the top of the screen (over the lane's sky,
   *  clear of the action at ground level) — used by the hands-on steps. */
  private banner(text: string) {
    const vw = this.g.scale.width;
    const portrait = this.g.scale.height > vw;
    const w = Math.min(700, vw - (portrait ? 24 : 270));
    const t = this.g.add
      .text(0, 0, text, {
        fontFamily: EMOJI_FONT,
        fontSize: "16px",
        color: "#ffe08a",
        align: "center",
        wordWrap: { width: w - 32 },
      })
      .setOrigin(0.5);
    const bw = t.width + 36;
    const bh = t.height + 20;
    const cont = this.keep(this.g.add.container(vw / 2, (portrait ? 56 : 10) + bh / 2).setDepth(94));
    const gfx = this.g.add.graphics();
    gfx.fillStyle(UI.panel, 0.98);
    gfx.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 14);
    gfx.lineStyle(1, UI.border, 1);
    gfx.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 14);
    cont.add([gfx, t]);
    cont.setAlpha(0);
    this.g.tweens.add({ targets: cont, alpha: 1, duration: 240 });
  }

  /** White pulse ring around the planted swap + a hand miming the drag. */
  private pointAtRig() {
    if (!this.rig) return;
    const a = this.toScreenRect(this.g.cellRectD(this.rig.from.r, this.rig.from.c));
    const b = this.toScreenRect(this.g.cellRectD(this.rig.to.r, this.rig.to.c));
    const u = this.union(a, b);
    const ring = this.keep(this.g.add.graphics().setDepth(93));
    ring.lineStyle(3, 0xffffff, 0.95);
    ring.strokeRoundedRect(u.x + 3, u.y + 3, u.w - 6, u.h - 6, 8);
    this.g.tweens.add({ targets: ring, alpha: 0.35, duration: 650, yoyo: true, repeat: -1 });
    const hand = this.keep(
      this.g.add
        .text(a.x + a.w * 0.55, a.y + a.h * 0.62, "👆", { fontFamily: EMOJI_FONT, fontSize: "38px" })
        .setOrigin(0.4, 0.15)
        .setDepth(96)
        .setAlpha(0.95),
    );
    this.g.tweens.add({
      targets: hand,
      x: b.x + b.w * 0.55,
      y: b.y + b.h * 0.62,
      duration: 700,
      hold: 260,
      repeatDelay: 420,
      ease: "Sine.easeInOut",
      repeat: -1,
    });
  }

  private skipButton() {
    const vw = this.g.scale.width;
    const t = this.keep(
      this.g.add
        .text(vw - 12, 12, "Skip intro ×", {
          fontFamily: UI_FONT,
          fontSize: "15px",
          color: UI.text,
          backgroundColor: "rgba(37,46,52,0.96)",
          padding: { x: 12, y: 12 },
        })
        .setOrigin(1, 0)
        .setDepth(97),
    );
    t.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.finish());
  }

  // ---- small utils --------------------------------------------------------------

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }
  private clearVisuals() {
    for (const o of this.objs) o.destroy();
    this.objs = [];
  }
  private toScreenRect(r: Rect): Rect {
    const p = this.g.toScreen(r.x, r.y);
    const end = this.g.toScreen(r.x + r.w, r.y + r.h);
    return { x: p.x, y: p.y, w: end.x - p.x, h: end.y - p.y };
  }
  private pad(r: Rect, n: number): Rect {
    return { x: r.x - n, y: r.y - n, w: r.w + n * 2, h: r.h + n * 2 };
  }
  private union(a: Rect, b: Rect): Rect {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  }
}
