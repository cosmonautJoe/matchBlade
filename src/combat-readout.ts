import { ambushRear, guardCost, type RunState, type EnemyVariant } from "./run";
import "./combat-readout.css";

const NAMES: Record<EnemyVariant, string> = {
  green: "Slime", blue: "Ward slime", dark: "Armored slime", boar: "Boar",
  goblin: "Goblin", mushroom: "Sporecap", eye: "Watcher", skeleton: "Skeleton",
  frostskel: "Frozen skeleton", icelem: "Ice elemental", boss: "Boss",
};

export function combatCue(s: RunState) {
  const foe = s.enemy;
  if (!foe) return { name: "Moving on", tip: "Every defeated enemy gives you room to recover." };
  const rear = ambushRear(s);
  if (rear) return { name: `Ambush · ${Math.ceil(foe.hp)} + ${Math.ceil(rear.hp)} HP`, tip: "" };
  const guard = guardCost(s.killed);
  let tip = foe.defense === "hide" ? "Match fireballs · resists swords"
    : foe.defense === "ward" ? "Match swords · resists magic" : "";
  if (foe.spores !== undefined) tip = `Fireballs clear spores${foe.spores ? ` ×${foe.spores}` : ""} · shields prevent them`;
  else if (s.pressure >= .7) tip = "Near the skull! Defeat an enemy to recover";
  else if (guard > 1) tip = [tip, `Block costs ${guard}`].filter(Boolean).join(" · ");
  return { name: `${NAMES[foe.variant]} · ${Math.max(0, Math.ceil(foe.hp))} HP`, tip };
}

/** CSS-sized text stays legible when the pixel-art battlefield scales. */
export function createCombatReadout() {
  const root = document.createElement("div");
  root.className = "combat-readout";
  root.innerHTML = '<div><strong></strong></div><p></p>';
  root.hidden = true;
  document.getElementById("game")!.append(root);
  const name = root.querySelector("strong")!, tip = root.querySelector("p")!;
  const set = (el: Element, value: string) => { if (el.textContent !== value) el.textContent = value; };
  return {
    root,
    update(s: RunState, rect: { x: number; y: number; width: number; floorY: number; header: boolean }, visible: boolean) {
      root.hidden = !visible;
      if (!visible) return;
      const cue = combatCue(s);
      set(name, cue.name);
      set(tip, cue.tip);
      tip.hidden = !cue.tip;
      root.classList.toggle("is-danger", s.pressure >= .7);
      root.classList.toggle("is-header", rect.header);
      tip.style.top = rect.header ? "" : `${rect.floorY - rect.y + 2}px`;
      root.style.left = `${rect.x}px`; root.style.top = `${rect.y}px`; root.style.width = `${rect.width}px`;
    },
    destroy() { root.remove(); },
  };
}

