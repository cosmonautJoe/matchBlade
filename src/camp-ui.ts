import Phaser from "phaser";
import "./camp-ui.css";

export interface PanelAction {
  label: string;
  enabled?: boolean;
  secondary?: boolean;
  run?: () => void;
}
export interface PanelCard {
  title: string;
  icon?: string;
  tag?: string;
  lines: string[];
  progress?: { have: number; need: number };
  action?: PanelAction;
}
export interface CampPanel {
  title: string;
  subtitle: string;
  kind?: "shop" | "quests" | "upgrade";
  cards: PanelCard[];
  footer?: string;
  actions?: PanelAction[];
  onClose: () => void;
}

/** Native text and scrolling stay at CSS-pixel size, independent of the pixel-art canvas. */
export function openCampPanel(scene: Phaser.Scene, model: CampPanel): () => void {
  const previousFocus = document.activeElement as HTMLElement | null;
  const overlay = document.createElement("div");
  overlay.className = "mb-panel-overlay";
  const dialog = document.createElement("section");
  dialog.className = `mb-panel mb-panel--${model.kind ?? "upgrade"}`;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", model.title);
  overlay.append(dialog);
  const el = (tag: string, cls: string, text = "") => {
    const node = document.createElement(tag);
    node.className = cls;
    node.textContent = text;
    return node;
  };
  const action = (def: PanelAction) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `mb-action${def.secondary ? " mb-action--secondary" : ""}`;
    button.textContent = def.label;
    button.disabled = def.enabled === false;
    button.addEventListener("click", () => def.run?.());
    return button;
  };
  const header = el("header", "mb-panel-header");
  const heading = el("div", "mb-heading");
  heading.append(el("h2", "", model.title), el("p", "mb-subtitle", model.subtitle));
  const close = action({ label: "✕", secondary: true, run: model.onClose });
  close.classList.add("mb-close");
  close.setAttribute("aria-label", "Close panel");
  header.append(heading, close);
  dialog.append(header);
  const content = el("div", "mb-panel-content");
  const cards = el("div", "mb-cards");
  for (const card of model.cards) {
    const article = el("article", "mb-card");
    const top = el("div", "mb-card-heading");
    if (card.icon) {
      const icon = el("span", "mb-card-icon", card.icon);
      icon.setAttribute("aria-hidden", "true");
      top.append(icon);
    }
    const names = el("div", "");
    if (card.tag) names.append(el("p", "mb-tag", card.tag));
    names.append(el("h3", "", card.title));
    top.append(names);
    article.append(top);
    for (const line of card.lines.filter(Boolean)) article.append(el("p", "mb-description", line));
    if (card.progress) {
      const { have, need } = card.progress;
      const meter = document.createElement("progress");
      meter.max = Math.max(1, need);
      meter.value = Math.min(have, need);
      meter.setAttribute("aria-label", card.title);
      article.append(el("p", "mb-progress-label", `${have} / ${need}`), meter);
    }
    if (card.action) article.append(action(card.action));
    cards.append(article);
  }
  content.append(cards);
  dialog.append(content);
  const footer = el("footer", "mb-panel-footer");
  if (model.footer) footer.append(el("p", "mb-footer-copy", model.footer));
  const controls = el("div", "mb-footer-actions");
  for (const def of model.actions ?? []) controls.append(action(def));
  footer.append(controls);
  dialog.append(footer);

  // Keep taps, scrolling and keyboard navigation out of the underlying scene.
  for (const event of ["pointerdown", "pointerup", "pointermove", "wheel", "click"])
    overlay.addEventListener(event, (e) => e.stopPropagation());
  overlay.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") model.onClose();
    if (event.key !== "Tab") return;
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  document.getElementById("game")!.append(overlay);
  close.focus({ preventScroll: true });
  const dispose = () => {
    overlay.remove();
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, dispose);
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, dispose);
  return dispose;
}
