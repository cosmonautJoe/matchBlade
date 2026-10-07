/**
 * Native system menus share the camp's readable, responsive UI.
 * The caller remains paused; save slots snapshot camp progress, never the live run.
 */
import Phaser from "phaser";
import { defaultMeta, loadMeta, saveMeta, readSlot, saveToSlot, loadFromSlot, SAVE_SLOTS, BIOME_LABELS } from "./meta";
import { audioSettings, setAudioSettings, sfxV } from "./audio";
import { tileEffectsEnabled, setTileEffectsEnabled, TILE_EFFECTS_CHANGED } from "./tile-effects";
import { haptic, hapticsEnabled, setHapticsEnabled, hapticsNote, testHaptics, stopHaptics } from "./haptics";
import "./ui-theme";
import "./menu.css";

type View = "main" | "options" | "save" | "load" | "confirm";
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") => {
  const element = document.createElement(tag); element.className = className; element.textContent = text; return element;
};

export class MenuScene extends Phaser.Scene {
  private from = "camp";
  private direct: View | null = null;
  private overlay!: HTMLDivElement;
  private back: () => void = () => this.resume();
  private leaving = false;

  constructor() { super("menu"); }
  init(data: { from?: string; view?: View }) { this.from = data?.from ?? "camp"; this.direct = data?.view ?? null; }

  create() {
    stopHaptics(); this.leaving = false;
    const focus = document.activeElement;
    const camp = document.querySelector<HTMLElement>(".caravan-hub, .village-hub");
    const wasInert = camp?.inert ?? false;
    const cameras = this.from === "camp" ? this.scene.get(this.from).cameras.cameras.map(camera => ({ camera, visible: camera.visible })) : [];
    for (const { camera } of cameras) camera.setVisible(false);
    if (camp) { camp.inert = true; camp.classList.add("is-system-paused"); }
    this.overlay = node("div", "mb-system");
    for (const event of ["pointerdown", "pointerup", "pointermove", "click", "wheel"])
      this.overlay.addEventListener(event, e => e.stopPropagation());
    const keyboard = (event: KeyboardEvent) => {
      if (!this.scene.isActive()) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.back(); return; }
      if (event.key !== "Tab") return;
      const list = Array.from(this.overlay.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)"));
      const first = list[0], last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard, true);
    (this.game.canvas.parentElement ?? document.body).append(this.overlay);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.overlay.remove(); document.removeEventListener("keydown", keyboard, true);
      if (camp) { camp.inert = wasInert; camp.classList.remove("is-system-paused"); }
      for (const { camera, visible } of cameras) camera.setVisible(visible);
      if (focus instanceof HTMLElement && focus.isConnected) focus.focus({ preventScroll: true });
    });
    if (this.direct === "load") this.showSlots("load"); else this.showMain();
  }

  private sfx(key = "swap", volume = .25) {
    if (this.cache.audio.exists(key)) this.sound.play(key, { volume: sfxV(volume) });
  }
  private button(text: string, action: () => void, style = "") {
    const button = node("button", style, text); button.type = "button";
    button.onclick = () => { if (this.leaving) return; this.sfx(); action(); };
    return button;
  }
  private panel(title: string, back: () => void, className = "") {
    this.back = back; this.overlay.replaceChildren();
    const panel = node("section", "mb-system-panel");
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-label", title);
    const header = node("header", "mb-system-header"), close = this.button("×", back, "mb-system-close");
    close.setAttribute("aria-label", title === "Paused" ? "Resume game" : "Back");
    header.append(node("h2", "", title), close);
    const body = node("div", "mb-system-content " + className);
    panel.append(header, body); this.overlay.append(panel); close.focus({ preventScroll: true });
    return body;
  }
  private resume() {
    if (this.leaving) return; this.leaving = true;
    this.scene.stop(); this.scene.resume(this.from);
  }
  private restartToCamp() {
    if (this.leaving) return; this.leaving = true;
    this.scene.stop(this.from); this.scene.start("camp");
  }
  private showMain() {
    const body = this.panel("Paused", () => this.resume(), "mb-system-main");
    body.append(this.button("Resume game →", () => this.resume(), "mb-system-primary"));
    if (this.from === "game") body.append(this.button("Return to camp", () =>
      this.confirmStep("Head back to camp?", "This run will end. You keep every resource you collected.", "Return to camp", () => {
        const game = this.scene.get("game") as unknown as { bankAndRetreat?: () => void };
        game.bankAndRetreat?.(); this.restartToCamp();
      }, () => this.showMain(), false)));
    body.append(this.button("Settings", () => this.showOptions()));
    const saves = node("div", "mb-system-grid");
    saves.append(this.button("Save game", () => this.showSlots("save")), this.button("Load game", () => this.showSlots("load")));
    body.append(saves, this.button("Start a new game", () =>
      this.confirmStep("Start over?", "Your current journey, upgrades and resources will reset. Saved slots are kept.", "New game", () => {
        saveMeta(defaultMeta()); this.restartToCamp();
      }, () => this.showMain()), "mb-system-quiet"),
      node("p", "mb-system-note mb-system-autosave", "Progress saves automatically"));
  }
  private showOptions() {
    const body = this.panel("Settings", () => this.showMain());
    const audio = audioSettings();
    for (const [key, name] of [["sfx", "Sound effects"], ["amb", "Ambience"], ["music", "Music"]] as const) {
      const row = node("label", "mb-system-slider"), output = node("output", "", Math.round(audio[key] * 100) + "%");
      const input = node("input"); input.type = "range"; input.min = "0"; input.max = "100"; input.step = "1"; input.value = String(Math.round(audio[key] * 100));
      input.setAttribute("aria-label", name);
      input.oninput = () => { output.value = input.value + "%"; setAudioSettings({ [key]: Number(input.value) / 100 }); this.game.events.emit("audio-changed"); };
      input.onchange = () => this.sfx("pickup", .3);
      row.append(node("span", "", name), output, input); body.append(row);
    }
    this.toggle(body, "Tile effects", "Glisten and tile shattering", tileEffectsEnabled, () => {
      setTileEffectsEnabled(!tileEffectsEnabled()); this.game.events.emit(TILE_EFFECTS_CHANGED);
    });
    const note = node("p", "mb-system-note", hapticsNote()); note.setAttribute("role", "status");
    this.toggle(body, "Vibration", "Feedback for matches and rewards", hapticsEnabled, () => {
      setHapticsEnabled(!hapticsEnabled()); note.textContent = hapticsNote(); if (hapticsEnabled()) haptic("tap");
    });
    body.append(note);
    const controls = node("div", "mb-system-grid");
    controls.append(this.button("Test vibration", () => {
      const attempted = testHaptics();
      note.textContent = !hapticsEnabled() ? "Turn vibration on to test." : attempted
        ? "No tap? Check your device vibration settings." : "Vibration is unavailable in this browser.";
    }), this.button("Done", () => this.showMain()));
    body.append(controls);
  }
  private toggle(parent: HTMLElement, title: string, detail: string, value: () => boolean, change: () => void) {
    const row = node("div", "mb-system-toggle"), copy = node("div");
    copy.append(node("strong", "", title), node("small", "", detail));
    const button = this.button("", () => { change(); update(); });
    button.setAttribute("role", "switch"); button.setAttribute("aria-label", title);
    const update = () => { button.setAttribute("aria-checked", String(value())); button.textContent = value() ? "On" : "Off"; };
    update(); row.append(copy, button); parent.append(row);
  }
  private showSlots(mode: "save" | "load", receipt = "") {
    const back = () => this.direct ? this.resume() : this.showMain();
    const body = this.panel(mode === "save" ? "Save your journey" : "Load a journey", back);
    body.append(node("p", "mb-system-note", mode === "save" ? "Keep a copy of your camp progress. Runs recover through autosave." : "Choose a saved camp. Loading replaces your current progress."));
    if (receipt) { const status = node("p", "mb-system-note", receipt); status.setAttribute("role", "status"); body.append(status); }
    for (let n = 1; n <= SAVE_SLOTS; n++) {
      const slot = readSlot(n);
      const use = () => {
        if (mode === "save") {
          const save = () => { saveToSlot(n, loadMeta()); this.sfx("coin3", .4); this.showSlots("save"); };
          if (slot) this.confirmStep("Replace save " + n + "?", "The older copy in this slot will be replaced by your current camp progress.", "Replace save", save, () => this.showSlots("save"));
          else save();
        } else this.confirmStep("Load save " + n + "?", "This replaces your current progress with the selected camp. An unfinished run will be discarded.", "Load game", () => {
          if (loadFromSlot(n)) this.restartToCamp(); else this.showSlots("load", "This save could not be loaded.");
        }, () => this.showSlots("load"));
      };
      const button = this.button("", use, "mb-system-slot");
      button.disabled = mode === "load" && !slot;
      const copy = node("span");
      copy.append(node("strong", "", slot ? BIOME_LABELS[slot.meta.biome] ?? slot.meta.biome : "Empty slot"));
      copy.append(node("small", "", slot ? "Depth " + slot.meta.bestDepth + " · Sword level " + slot.meta.swordLevel : mode === "save" ? "Save your camp here" : "No saved journey"));
      if (slot) copy.append(node("small", "mb-slot-date", new Date(slot.savedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })));
      button.append(node("span", "", String(n).padStart(2, "0")), copy, node("span", "", slot || mode === "save" ? "→" : "—"));
      body.append(button);
    }
    body.append(this.button("Back", back));
  }
  private confirmStep(title: string, message: string, label: string, yes: () => void, back: () => void, danger = true) {
    const body = this.panel(title, back);
    body.append(node("p", "mb-system-confirm", message));
    const choices = node("div", "mb-system-grid");
    const cancel = this.button("Cancel", back);
    choices.append(cancel, this.button(label, yes, danger ? "mb-system-danger" : ""));
    body.append(choices); cancel.focus({ preventScroll: true });
  }
}
