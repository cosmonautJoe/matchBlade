import type { RunState } from "./run";
import type { RunCheckpoint } from "./run-save";
import { itemById } from "./items";
import "./active-effects.css";

export type ActiveEffect = { id: string; icon: string; name: string; status: string; detail: string };
export function activeItemEffects(run: RunState, buffs: RunCheckpoint["buffs"], items: (string | null)[], road: string[], timersPaused: boolean): ActiveEffect[] {
  const effects: ActiveEffect[] = [];
  const add = (id: string, status: string, name?: string) => {
    const item = itemById(id)!;
    effects.push({ id, icon: item.glyph, name: name ?? item.name, status, detail: item.desc });
  };
  const timer = (id: string, seconds: number, name?: string) => {
    if (seconds > 0) {
      add(id, `${Math.ceil(seconds)}s${timersPaused ? " · paused" : ""}`, name);
      if (timersPaused) effects[effects.length - 1].detail += " Timer resumes during regular combat.";
    }
  };
  timer("waystone", buffs.freezeLeft);
  timer("warhorn", buffs.hornLeft);
  timer("ledger", buffs.ledgerLeft);
  timer("cinderflask", buffs.burnLeft, "Burning");
  if (run.whetstone > 0) add("whetstone", `${run.whetstone} ${run.whetstone === 1 ? "match" : "matches"}`);
  if (buffs.spursActive) add("spurs", "This enemy");
  if (run.bellCharges > 0) add("wardbell", `${run.bellCharges} ${run.bellCharges === 1 ? "save" : "saves"}`);
  if (run.pierceMult < 1) add("wardsalve", "This run");
  if (buffs.skeletonCharges > 0) add("skeleton", `${buffs.skeletonCharges} ${buffs.skeletonCharges === 1 ? "chest" : "chests"}`);
  if (buffs.panCharges > 0) add("pan", `${buffs.panCharges} ${buffs.panCharges === 1 ? "chest" : "chests"}`);
  if (buffs.inkActive) add("ink", road.join(" → "));
  const revives = items.filter(id => id === "hearth").length;
  if (revives) add("hearth", `${revives} ready`);
  // Guard from a potion joins the same pool as matched shields.
  if (run.block > 0) effects.push({ id: "guard", icon: "🛡️", name: "Guard", status: `×${run.block}`,
    detail: "Guard from shields and Shield Potions. Stronger enemies spend more per hit. Boss attacks bypass guard." });
  return effects;
}

export function createActiveEffects() {
  const root = document.createElement("div");
  root.className = "active-effects";
  root.setAttribute("role", "list"); root.setAttribute("aria-label", "Active item effects");
  root.tabIndex = 0; root.hidden = true;
  for (const event of ["pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "touchstart", "touchend", "keydown", "wheel"])
    root.addEventListener(event, e => e.stopPropagation());
  document.getElementById("game")!.append(root);
  let visible = false, count = 0, signature = "";
  const syncVisibility = () => { root.hidden = !visible || !count; };
  return {
    root,
    show(value: boolean) { visible = value; syncVisibility(); },
    place(x: number, y: number, width: number, height: number, wide: boolean) {
      root.classList.toggle("is-wide", wide);
      Object.assign(root.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: wide ? "auto" : `${height}px`, maxHeight: `${height}px` });
    },
    update(effects: ActiveEffect[]) {
      count = effects.length; syncVisibility();
      const next = JSON.stringify(effects); if (next === signature) return; signature = next;
      const fragment = document.createDocumentFragment();
      for (const effect of effects) {
        const chip = document.createElement("div");
        chip.className = "active-effect"; chip.setAttribute("role", "listitem");
        chip.title = `${effect.name}: ${effect.status}. ${effect.detail}`;
        chip.setAttribute("aria-label", chip.title);
        const icon = document.createElement("span"); icon.className = "effect-icon"; icon.textContent = effect.icon; icon.setAttribute("aria-hidden", "true");
        const value = document.createElement("span"); value.className = "effect-status";
        const timer = effect.status.match(/^\d+s/), charges = effect.status.match(/\d+/);
        value.textContent = timer ? timer[0] : effect.id !== "ink" && charges ? `×${charges[0]}` : "✓";
        if (effect.status.includes("paused")) chip.classList.add("is-paused");
        chip.append(icon, value); fragment.append(chip);
      }
      const x = root.scrollLeft, y = root.scrollTop;
      root.replaceChildren(fragment); root.scrollLeft = x; root.scrollTop = y;
    },
    destroy() { root.remove(); },
  };
}
