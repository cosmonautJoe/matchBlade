/**
 * matchBlade — pause / system menu (Esc or the ☰ button).
 *
 * Launched OVER the camp or the run; the scene underneath is paused, so
 * strikes, scroll pressure, chest choreography and cutscenes all hold their
 * breath while this is open. Views: main, options (channel faders from
 * audio.ts), save/load (three snapshot slots from meta.ts), and a reusable
 * confirm step for the destructive moves.
 *
 * The ACTIVE save auto-persists constantly; "Save Game" snapshots it into a
 * slot, "Load Game" restores a snapshot (and rebuilds the world at camp).
 */

import Phaser from "phaser";
import { defaultMeta, loadMeta, saveMeta, readSlot, saveToSlot, loadFromSlot, SAVE_SLOTS } from "./meta";
import { audioSettings, setAudioSettings, sfxV } from "./audio";

const EMOJI_FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

type View = "main" | "options" | "save" | "load" | "confirm";

export class MenuScene extends Phaser.Scene {
  private from = "camp"; // scene key we paused (resume target)
  private direct: View | null = null; // opened straight to one view (title's LOAD GAME) — back resumes, not showMain
  private root: Phaser.GameObjects.Container | null = null;
  private view: View = "main";
  private dragging: ((px: number) => void) | null = null; // active slider, if any

  constructor() {
    super("menu");
  }

  init(data: { from?: string; view?: View }) {
    this.from = data?.from ?? "camp";
    this.direct = data?.view ?? null;
  }

  create() {
    const vw = this.scale.width;
    const vh = this.scale.height;
    this.add.rectangle(vw / 2, vh / 2, vw, vh, 0x05060a, 0.7).setInteractive(); // swallow taps to the world

    this.input.keyboard?.on("keydown-ESC", () => {
      if (this.view === "main" || this.direct) this.resume();
      else this.showMain();
    });
    // slider dragging is scene-wide so the knob can't be "dropped" mid-drag
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.dragging && p.isDown) this.dragging(p.x);
    });
    this.input.on("pointerup", () => {
      if (this.dragging) {
        this.dragging = null;
        this.sfx("pickup", 0.35); // an audible ping at the new level
      }
    });

    if (this.direct === "load") this.showSlots("load");
    else this.showMain();
  }

  private sfx(key: string, volume = 0.5) {
    if (this.cache.audio.exists(key)) this.sound.play(key, { volume: sfxV(volume) });
  }

  // ---- shared bits ----------------------------------------------------------

  private freshRoot(h: number): { box: Phaser.GameObjects.Container; x: number; y: number; w: number } {
    this.root?.destroy();
    const vw = this.scale.width;
    const vh = this.scale.height;
    const W = Math.min(480, vw - 40);
    const box = this.add.container(0, 0).setDepth(10);
    const bg = this.add.rectangle(vw / 2, vh / 2, W, h, 0x14171f, 0.98).setStrokeStyle(3, 0x2a2d38);
    box.add(bg);
    this.root = box;
    return { box, x: vw / 2, y: vh / 2 - h / 2, w: W };
  }

  private title(box: Phaser.GameObjects.Container, x: number, y: number, label: string) {
    box.add(
      this.add.text(x, y + 30, label, { fontFamily: "monospace", fontStyle: "bold", fontSize: "22px", color: "#ffe08a" }).setOrigin(0.5),
    );
  }

  private button(
    box: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
    label: string,
    cb: (() => void) | null,
    opts: { danger?: boolean; small?: boolean } = {},
  ) {
    const enabled = !!cb;
    const h = opts.small ? 34 : 44;
    const base = !enabled ? 0x2a2d38 : opts.danger ? 0x5e2e2e : 0x2e5e34;
    const edge = !enabled ? 0x3a3f4b : opts.danger ? 0xc26e54 : 0x54c26e;
    const rect = this.add.rectangle(x, y, w, h, base).setStrokeStyle(2, edge);
    const txt = this.add
      .text(x, y, label, { fontFamily: EMOJI_FONT, fontStyle: "bold", fontSize: opts.small ? "14px" : "16px", color: enabled ? "#eef5ee" : "#6a707c" })
      .setOrigin(0.5);
    if (enabled)
      rect.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
        this.sfx("swap", 0.25);
        cb();
      });
    box.add([rect, txt]);
  }

  private resume() {
    this.scene.stop();
    this.scene.resume(this.from);
  }

  /** Tear the world down and rebuild at camp (new game / loaded slot). */
  private restartToCamp() {
    this.scene.stop(this.from);
    this.scene.start("camp");
  }

  // ---- views ----------------------------------------------------------------

  private showMain() {
    this.view = "main";
    const inRun = this.from === "game"; // retreat only means something mid-run
    const H = inRun ? 472 : 414;
    const { box, x, y, w } = this.freshRoot(H);
    this.title(box, x, y, "— PAUSED —");
    const bw = w - 80;
    let by = y + 92;
    const step = 58;
    this.button(box, x, by, bw, "resume", () => this.resume());
    if (inRun)
      this.button(box, x, (by += step), bw, "return to camp", () =>
        this.confirmStep(
          "Retreat to camp? The run ends here —\nyour haul banks as if you'd fallen.",
          "retreat",
          () => {
            const g = this.scene.get("game") as unknown as { bankAndRetreat?: () => void };
            g.bankAndRetreat?.(); // the caravan keeps what the scout carried
            this.restartToCamp();
          },
          () => this.showMain(),
        ),
      );
    this.button(box, x, (by += step), bw, "new game", () => this.confirmStep(
      "Start over? The caravan's road, oaths, and bank all reset.\n(Save slots are kept.)",
      "start anew",
      () => {
        saveMeta(defaultMeta());
        this.restartToCamp();
      },
      () => this.showMain(),
    ));
    this.button(box, x, (by += step), bw, "save game", () => this.showSlots("save"));
    this.button(box, x, (by += step), bw, "load game", () => this.showSlots("load"));
    this.button(box, x, (by += step), bw, "options", () => this.showOptions());
    box.add(
      this.add
        .text(x, y + H - 22, "esc closes · progress auto-saves as you play", { fontFamily: "monospace", fontSize: "11px", color: "#6a707c" })
        .setOrigin(0.5),
    );
  }

  private showOptions() {
    this.view = "options";
    const { box, x, y, w } = this.freshRoot(330);
    this.title(box, x, y, "OPTIONS");
    const s = audioSettings();
    let sy = y + 92;
    this.slider(box, x, sy, w, "effects", s.sfx, (v) => setAudioSettings({ sfx: v }));
    this.slider(box, x, (sy += 64), w, "ambience", s.amb, (v) => setAudioSettings({ amb: v }));
    this.slider(box, x, (sy += 64), w, "music", s.music, (v) => setAudioSettings({ music: v }), "(coming soon)");
    this.button(box, x, y + 330 - 40, 160, "back", () => this.showMain(), { small: true });
  }

  /** Label + draggable fader + live percentage. Changes broadcast immediately. */
  private slider(
    box: Phaser.GameObjects.Container,
    cx: number,
    yy: number,
    w: number,
    label: string,
    value: number,
    onChange: (v: number) => void,
    note?: string,
  ) {
    const left = cx - w / 2 + 34;
    const tw = 190; // track width
    const tx = cx + w / 2 - 34 - tw; // track left
    box.add(this.add.text(left, yy - 9, label, { fontFamily: "monospace", fontSize: "15px", color: "#dfe3ea" }));
    if (note) box.add(this.add.text(left, yy + 9, note, { fontFamily: "monospace", fontSize: "10px", color: "#6a707c" }));
    const track = this.add.rectangle(tx + tw / 2, yy, tw, 8, 0x0a0c11).setStrokeStyle(2, 0x2a2d38);
    const fill = this.add.rectangle(tx, yy, Math.max(1, tw * value), 6, 0xffd94a).setOrigin(0, 0.5);
    const knob = this.add.circle(tx + tw * value, yy, 10, 0xffe08a).setStrokeStyle(2, 0x5a3a08);
    const pct = this.add
      .text(tx + tw + 12, yy, `${Math.round(value * 100)}`, { fontFamily: "monospace", fontSize: "13px", color: "#bfe6ff" })
      .setOrigin(0, 0.5);
    box.add([track, fill, knob, pct]);

    const apply = (px: number) => {
      const v = Phaser.Math.Clamp((px - tx) / tw, 0, 1);
      fill.width = Math.max(1, tw * v);
      knob.x = tx + tw * v;
      pct.setText(`${Math.round(v * 100)}`);
      onChange(v);
      this.game.events.emit("audio-changed"); // looping beds re-level live
    };
    const zone = this.add.rectangle(tx + tw / 2, yy, tw + 28, 32, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    zone.on("pointerdown", (p: Phaser.Input.Pointer) => {
      apply(p.x);
      this.dragging = apply;
    });
    box.add(zone);
  }

  private showSlots(mode: "save" | "load") {
    this.view = mode;
    const { box, x, y, w } = this.freshRoot(380);
    this.title(box, x, y, mode === "save" ? "SAVE GAME" : "LOAD GAME");
    box.add(
      this.add
        .text(x, y + 56, mode === "save" ? "snapshot your journey into a slot" : "return to a snapshot (current progress is replaced)", {
          fontFamily: "monospace", fontSize: "12px", color: "#9aa0ab",
        })
        .setOrigin(0.5),
    );

    let sy = y + 104;
    for (let n = 1; n <= SAVE_SLOTS; n++) {
      const slot = readSlot(n);
      const label = slot
        ? `${n} ▸ ${(slot.meta.biome || "plains").toUpperCase()} · depth ${slot.meta.bestDepth} · 💎${slot.meta.treasure}\n     ${slot.meta.questsRewarded.length} oaths kept · ${new Date(slot.savedAt).toLocaleString()}`
        : `${n} ▸ — empty —`;
      const canUse = mode === "save" || !!slot;
      this.slotRow(box, x, sy, w - 60, label, !canUse ? null : () => {
        if (mode === "save") {
          const doSave = () => {
            saveToSlot(n, loadMeta());
            this.sfx("coin3", 0.5);
            this.showSlots("save");
          };
          if (slot) this.confirmStep(`Overwrite slot ${n}?`, "overwrite", doSave, () => this.showSlots("save"));
          else doSave();
        } else {
          this.confirmStep(
            `Load slot ${n}? Your current road is abandoned\nfor the snapshot's.`,
            "load it",
            () => {
              if (loadFromSlot(n)) this.restartToCamp();
            },
            () => this.showSlots("load"),
          );
        }
      });
      sy += 66;
    }
    // launched straight here (title's LOAD GAME): back returns to the title, not the pause menu
    this.button(box, x, y + 380 - 40, 160, "back", () => (this.direct ? this.resume() : this.showMain()), { small: true });
  }

  /** A two-line slot row (taller than a button, left-aligned label). */
  private slotRow(box: Phaser.GameObjects.Container, x: number, y: number, w: number, label: string, cb: (() => void) | null) {
    const enabled = !!cb;
    const rect = this.add.rectangle(x, y, w, 56, enabled ? 0x1c2029 : 0x14171f).setStrokeStyle(2, enabled ? 0x3a4152 : 0x2a2d38);
    const txt = this.add
      .text(x - w / 2 + 14, y, label, { fontFamily: EMOJI_FONT, fontSize: "13px", color: enabled ? "#dfe3ea" : "#5a6068", lineSpacing: 4 })
      .setOrigin(0, 0.5);
    if (enabled)
      rect.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
        this.sfx("swap", 0.25);
        cb();
      });
    box.add([rect, txt]);
  }

  /** Inline confirm view for the irreversible moves. */
  private confirmStep(message: string, yesLabel: string, yes: () => void, back: () => void) {
    this.view = "confirm";
    const { box, x, y, w } = this.freshRoot(240);
    this.title(box, x, y, "ARE YOU SURE?");
    box.add(
      this.add
        .text(x, y + 104, message, { fontFamily: EMOJI_FONT, fontSize: "15px", color: "#dfe3ea", align: "center", lineSpacing: 6 })
        .setOrigin(0.5),
    );
    this.button(box, x - (w - 80) / 4 - 6, y + 240 - 44, (w - 92) / 2, yesLabel, yes, { danger: true });
    this.button(box, x + (w - 80) / 4 + 6, y + 240 - 44, (w - 92) / 2, "back", back);
  }
}
