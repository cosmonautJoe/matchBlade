import Phaser from "phaser";
import "./camp-ui.css";
import { createCampNpcView, campNpcCaption, type CampNpc } from "./camp-npc-view";

export interface PanelAction {
  label: string;
  enabled?: boolean;
  secondary?: boolean;
  run?: () => void;
  closeAfter?: boolean;
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
  npc?: CampNpc;
  cards: PanelCard[];
  footer?: string;
  reply?: { speaker: string; text: string };
  actions?: PanelAction[];
  onClose: () => void;
}

/** Native text and scrolling stay at CSS-pixel size, independent of the pixel-art canvas. */
export function openCampPanel(scene: Phaser.Scene, model: CampPanel): () => void {
  const previousFocus = document.activeElement as HTMLElement | null;
  const overlay = document.createElement("div");
  const isShop = model.kind === "shop";
  const npc = model.npc ?? (isShop ? "shop" : undefined);
  const camp = npc ? document.querySelector<HTMLElement>(".caravan-hub") : null;
  let closing = false;
  let merchantView: ReturnType<typeof createCampNpcView> | null = null;
  const requestClose = (done = model.onClose) => {
    if (closing) return;
    if (!merchantView) { done(); return; }
    closing = true;
    overlay.classList.add("is-closing");
    camp?.classList.remove("is-serving");
    camp?.classList.add("is-service-closing");
    // Keep the modal input shield until camera and camp agree on the final frame.
    dialog.inert = true;
    merchantView.close(done, (progress, from, to) => {
      const portrait = overlay.clientHeight > overlay.clientWidth;
      const x = portrait ? 0 : (to.right - from.right) * progress;
      const y = portrait ? (to.bottom - from.bottom) * progress : 0;
      dialog.style.transform = `translate(${x}px, ${y}px)`;
      dialog.style.opacity = String(1 - Math.max(0, (progress - .8) / .2));
    });
  };
  overlay.className = `mb-panel-overlay${npc ? " mb-panel-overlay--npc" : ""}`;
  const dialog = document.createElement("section");
  dialog.className = `mb-panel mb-panel--${model.kind ?? "upgrade"}${npc ? " mb-panel--npc" : ""}`;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", model.title);
  const merchant = document.createElement("aside");
  merchant.className = "mb-npc-view";
  if (npc && camp) {
    const caption = campNpcCaption(npc, camp);
    merchant.setAttribute("aria-label", `${caption.name} at the caravan`);
    merchant.innerHTML = '<div class="mb-npc-caption"><strong></strong><span></span></div>';
    merchant.querySelector("strong")!.textContent = caption.name;
    merchant.querySelector("span")!.textContent = caption.detail;
    overlay.append(merchant);
    overlay.classList.add("has-npc");
  }
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
    button.addEventListener("click", () => {
      if (closing) return;
      if (def.closeAfter) requestClose(def.run ?? model.onClose);
      else def.run?.();
    });
    return button;
  };
  const header = el("header", "mb-panel-header");
  const heading = el("div", "mb-heading");
  heading.append(el("h2", "", model.title), el("p", "mb-subtitle", model.subtitle));
  const close = action({ label: "✕", secondary: true, run: requestClose });
  close.classList.add("mb-close");
  close.setAttribute("aria-label", "Close panel");
  header.append(heading, close);
  dialog.append(header);
  const content = el("div", "mb-panel-content");
  if (model.reply) {
    const reply = el("aside", "mb-npc-reply");
    reply.setAttribute("role", "status");
    reply.append(el("strong", "", model.reply.speaker), el("p", "", model.reply.text));
    content.append(reply);
  }
  const cards = el("div", "mb-cards");
  const offers = el("nav", "mb-shop-offers");
  offers.setAttribute("aria-label", "Shop stock");
  const offerButtons: HTMLButtonElement[] = [];
  const articles: HTMLElement[] = [];
  if (isShop && model.cards.length > 1) dialog.append(offers);
  for (const card of model.cards) {
    const article = el("article", "mb-card");
    if (isShop) {
      const index = articles.length;
      article.hidden = index !== 0;
      const offer = action({ label: "", run: () => {
        articles.forEach((node, i) => { node.hidden = i !== index; });
        offerButtons.forEach((node, i) => node.setAttribute("aria-pressed", String(i === index)));
        content.scrollTop = 0;
      } });
      offer.className = "mb-shop-offer";
      offer.setAttribute("aria-label", card.title);
      offer.setAttribute("aria-pressed", String(index === 0));
      offer.append(el("span", "", card.icon ?? "◆"), el("strong", "", card.title));
      offers.append(offer);
      offerButtons.push(offer);
      articles.push(article);
    }
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
    if (event.key === "Escape") requestClose();
    if (closing) { event.preventDefault(); return; }
    if (event.key !== "Tab") return;
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]
      .filter(button => !button.closest("[hidden]"));
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  document.getElementById("game")!.append(overlay);
  // Use the camp's exact divider, including its header and safe areas. Services
  // replace the preparation area without moving the scene/panel boundary.
  const environment = camp?.querySelector<HTMLElement>(".caravan-environment");
  const prep = camp?.querySelector<HTMLElement>(".caravan-prep");
  const syncBounds = () => {
    if (!environment || !prep) return;
    const parent = document.getElementById("game")!.getBoundingClientRect();
    const e = environment.getBoundingClientRect(), p = prep.getBoundingClientRect();
    const landscape = matchMedia("(orientation: landscape)").matches;
    Object.assign(overlay.style, {
      top: `${Math.min(e.top, p.top) - parent.top}px`,
      left: `${Math.min(e.left, p.left) - parent.left}px`,
      right: `${parent.right - Math.max(e.right, p.right)}px`,
      bottom: `${parent.bottom - Math.max(e.bottom, p.bottom)}px`,
    });
    overlay.style.setProperty("--npc-panel-size", `${landscape ? p.width : p.height}px`);
  };
  const layoutObserver = new ResizeObserver(syncBounds);
  if (environment && prep) { layoutObserver.observe(environment); layoutObserver.observe(prep); syncBounds(); }
  // The close-up samples the live camp art; the camp itself keeps its original framing.
  const wasInert = camp?.inert ?? false;
  if (camp) { camp.classList.add("is-serving"); camp.inert = true; }
  merchantView = camp && npc ? createCampNpcView(camp, merchant, npc, !model.reply) : null;
  if (npc) overlay.addEventListener("click", event => {
    if (event.target === overlay) requestClose();
  });
  close.focus({ preventScroll: true });
  const dispose = () => {
    layoutObserver.disconnect();
    merchantView?.destroy();
    if (camp) {
      camp.classList.remove("is-serving");
      camp.classList.remove("is-service-closing");
      camp.inert = wasInert;
    }
    overlay.remove();
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, dispose);
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, dispose);
  return dispose;
}
