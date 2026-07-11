/**
 * matchBlade — first-run tutorial (plays once; meta.tutorialSeen).
 *
 * A step-driven overlay on the LIVE run scene: everything dims except a
 * spotlight hole, a card explains one idea, and two beats are hands-on —
 * match swords to strike the foe, then match shields and watch a scripted
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
  demoStrike(pierce: boolean): boolean;
  markTutorialSeen(): void;
}

// mirror main.ts: text-first stack so emoji render on iOS without garbling digits
const EMOJI_FONT =
  'system-ui,-apple-system,"Segoe UI",Roboto,"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const STEPS = 8;
const DIM = 0x05060a;

const COPY: { title: string; body: string }[] = [
  {
    title: "THE ROAD AHEAD",
    body: "You scout ahead of the caravan, clearing the road. A foe blocks the way — fights are won down on the board.",
  },
  {
    title: "THE BOARD",
    body: "Drag a tile onto a neighbour to swap them. Line up 3 or more of a kind to clear them.",
  },
  {
    title: "SWORDS STRIKE",
    body: "Matching ⚔️ swords cuts the foe ahead — 🪄 staves wound too. Try it: make the highlighted swap.",
  },
  {
    title: "HOLD THE LINE",
    body: "Foes hit back. Every strike you take shoves you toward the skull ☠ — reach it and the run ends.",
  },
  {
    title: "SHIELDS GUARD",
    body: "Match 🛡️ shields to raise your guard — a guarded scout gives no ground. Try it.",
  },
  {
    title: "KEYS OPEN CHESTS",
    body: "Treasure chests roll in as you clear the road. Match 🔑 keys to bank them — a banked key pops the next chest wide open.",
  },
  {
    title: "GATHER FOR THE CARAVAN",
    body: "🪵 wood, 🪨 ore and 💎 gems ride home when the run ends. Spend them at camp to grow the caravan — and more uses are on the way.",
  },
  {
    title: "GO, SCOUT",
    body: "That's the basics. Clear the road — the caravan follows.",
  },
];
// step 4's second beat, after the scripted strike clangs off the guard
const BLOCKED_COPY = {
  title: "BLOCKED!",
  body: "Your guard soaked the hit — no ground lost. Guard wears off as it blocks, so keep it topped up.",
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
  onCascade(counts: Record<number, number>) {
    if (this.waitType !== null && (counts[this.waitType] ?? 0) >= 3) this.matched = true;
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
    this.render();
    if (n === 3) {
      // let the card land, then the foe demonstrates: one scripted strike, guard ignored
      this.g.time.delayedCall(800, () =>
        this.tryDemo(true, 8, () => {
          if (this.done || this.step !== 3) return;
          this.phase = 1;
          this.render();
          this.armTap(500);
        }),
      );
    } else if (this.waitType === null) {
      this.armTap();
    }
  }

  /** Fire a scripted strike once a live foe is engaged, retrying between fights. */
  private tryDemo(pierce: boolean, retries: number, then: () => void) {
    if (this.done) return;
    if (this.g.demoStrike(pierce)) {
      this.g.time.delayedCall(900, then); // let the shove / clang read
      return;
    }
    if (retries > 0) this.g.time.delayedCall(450, () => this.tryDemo(pierce, retries - 1, then));
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
    this.g.markTutorialSeen();
  }

  /** Scene shutdown mid-tutorial: drop everything, save nothing. */
  private teardown() {
    if (this.done) return;
    this.done = true;
    this.g.input.off("pointerdown", this.onTap);
    this.g.scale.off("resize", this.onResize, this);
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
        const hole = boardHole();
        this.dim(hole);
        this.card(COPY[this.step], hole, false);
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
    ring.lineStyle(3, 0xffe08a, 0.9);
    ring.strokeRoundedRect(h.x, h.y, h.w, h.h, 10);
    this.g.tweens.add({ targets: ring, alpha: 0.85, duration: 300 });
  }

  /** The step card: dark panel, gold title, body, progress dots, optional tap hint. */
  private card(copy: { title: string; body: string }, hole: Rect | null, tap: boolean) {
    const vw = this.g.scale.width;
    const vh = this.g.scale.height;
    const w = Math.min(600, vw - 40);
    const pad = 20;
    const titleT = this.g.add.text(0, 0, copy.title, {
      fontFamily: "monospace",
      fontStyle: "bold",
      fontSize: "21px",
      color: "#ffe08a",
    });
    const bodyT = this.g.add.text(0, 0, copy.body, {
      fontFamily: EMOJI_FONT,
      fontSize: "16px",
      color: "#dfe3ea",
      lineSpacing: 6,
      wordWrap: { width: w - pad * 2 },
    });
    const dotsT = this.g.add.text(0, 0, Array.from({ length: STEPS }, (_, i) => (i <= this.step ? "●" : "○")).join(" "), {
      fontFamily: "monospace",
      fontSize: "11px",
      color: "#8a6d3a",
    });
    const hH = pad + titleT.height + 10 + bodyT.height + 14 + 16 + pad;
    // sit clear of the spotlight: below it when it's in the top half, above it otherwise
    let cy: number;
    if (!hole) cy = vh / 2;
    else if (hole.y + hole.h / 2 < vh / 2) cy = Math.min(vh - hH / 2 - 14, hole.y + hole.h + 18 + hH / 2);
    else cy = Math.max(hH / 2 + 14, hole.y - 18 - hH / 2);
    const cont = this.keep(this.g.add.container(vw / 2, cy).setDepth(94));
    const gfx = this.g.add.graphics();
    gfx.fillStyle(0x0e1015, 0.96);
    gfx.fillRoundedRect(-w / 2, -hH / 2, w, hH, 12);
    gfx.lineStyle(2, 0x8a6d3a, 0.9);
    gfx.strokeRoundedRect(-w / 2, -hH / 2, w, hH, 12);
    titleT.setPosition(-w / 2 + pad, -hH / 2 + pad);
    bodyT.setPosition(-w / 2 + pad, titleT.y + titleT.height + 10);
    dotsT.setPosition(-w / 2 + pad, hH / 2 - pad + 4).setOrigin(0, 1);
    cont.add([gfx, titleT, bodyT, dotsT]);
    if (tap) {
      const tapT = this.g.add
        .text(w / 2 - pad, hH / 2 - pad + 4, "tap to continue ▸", { fontFamily: "monospace", fontSize: "13px", color: "#9aa0ab" })
        .setOrigin(1, 1);
      cont.add(tapT);
      this.g.tweens.add({ targets: tapT, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    }
    cont.setScale(0.94).setAlpha(0);
    this.g.tweens.add({ targets: cont, scale: 1, alpha: 1, duration: 240, ease: "Back.easeOut" });
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
        .text(vw - 14, 12, "skip tutorial ✕", {
          fontFamily: "monospace",
          fontSize: "14px",
          color: "#9aa0ab",
          backgroundColor: "rgba(20,23,31,0.9)",
          padding: { x: 10, y: 6 },
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
    const s = this.g.uiScale();
    return { x: p.x, y: p.y, w: r.w * s, h: r.h * s };
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
