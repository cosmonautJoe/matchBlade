import type { ItemDef } from "./items";
import "./chest-reward.css";

/** Reward copy uses CSS pixels, so phone text never shrinks with the game art. */
export function showChestReward(item: ItemDef, onContinue: () => void) {
  const panel = document.createElement("section");
  panel.className = "chest-reward";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "chest-reward-name");

  const heading = document.createElement("h2");
  heading.id = "chest-reward-name";
  heading.textContent = `${item.glyph} ${item.name}`;
  const content = document.createElement("div");
  content.className = "chest-reward-copy";
  const description = document.createElement("p");
  description.textContent = item.desc;
  const hint = document.createElement("p");
  hint.className = "chest-reward-hint";
  hint.textContent = item.hint;
  content.append(description, hint);
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Continue";
  button.addEventListener("click", onContinue);
  panel.addEventListener("pointerdown", e => e.stopPropagation());
  panel.append(heading, content, button);
  document.getElementById("game")!.append(panel);
  button.focus({ preventScroll: true });
  return () => panel.remove();
}
