import type { MetaState } from "./meta";
import { itemById } from "./items";
import "./village-hub.css";
import { animateVillage } from "./village-animation";

type Actions = { shop: () => void; forge: () => void; magic: () => void; quests: () => void; start: () => void; menu: () => void };

/** A responsive map with native controls; artwork never contains functional text. */
export function createVillageHub(meta: MetaState, zone: string, actions: Actions) {
  const root = document.createElement("section");
  root.className = "village-hub";
  root.setAttribute("aria-label", "Camp village");
  root.innerHTML = `
    <header class="village-header"><div><strong>⛺ CAMP</strong><span class="village-zone"></span></div><div class="village-resources"></div><button class="village-menu" aria-label="Open menu">☰</button></header>
    <div class="village-viewport"><div class="village-map"><img class="village-art" src="${import.meta.env.BASE_URL}camp/village-hub-arrival.png" alt="Forest camp with connected paths to the shop, forge, quest board and magic study. A signposted woodland trail leads north out of camp; a bridge crosses the creek to the south." draggable="false"></div></div>
    <footer class="village-prep"><h2>Get ready for the next run</h2><p class="village-packed"></p><div class="village-slots" aria-label="Packed items"></div><button class="village-start">Start run →</button><p class="village-tip">Tap a station to prepare.</p></footer>`;
  const map = root.querySelector<HTMLElement>(".village-map")!;
  const viewport = root.querySelector<HTMLElement>(".village-viewport")!;
  const art = root.querySelector<HTMLImageElement>(".village-art")!;
  root.querySelector(".village-zone")!.textContent = zone;
  const button = (id: string, label: string, action: () => void) => {
    const b = document.createElement("button");
    b.className = `village-station village-station--${id}`;
    b.setAttribute("aria-label", label);
    const caption = document.createElement("span");
    caption.className = "village-station-label";
    caption.textContent = label;
    b.append(caption);
    b.addEventListener("click", action);
    map.append(b);
  };
  button("shop", "Shop", actions.shop);
  button("forge", "Forge", actions.forge);
  button("quests", "Quests", actions.quests);
  button("magic", "Magic", actions.magic);
  button("depart", "Depart ↗", actions.start);
  root.querySelector(".village-menu")!.addEventListener("click", actions.menu);
  root.querySelector(".village-start")!.addEventListener("click", actions.start);
  // Phaser listens globally; DOM input must not trigger canvas NPCs underneath.
  for (const event of ["pointerdown", "pointerup", "pointermove", "wheel"]) root.addEventListener(event, e => e.stopPropagation());
  document.getElementById("game")!.append(root);
  const fit = () => {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    const landscape = root.clientWidth > root.clientHeight;
    const ratio = landscape ? 1.5 : 2 / 3;
    root.classList.toggle("is-landscape", landscape);
    const src = `${import.meta.env.BASE_URL}camp/${landscape ? "village-hub-wide-arrival.png" : "village-hub-arrival.png"}`;
    if (art.getAttribute("src") !== src) art.src = src;
    const width = Math.min(w, h * ratio);
    map.style.width = `${width}px`;
    map.style.height = `${width / ratio}px`;
  };
  const observer = new ResizeObserver(fit);
  observer.observe(viewport); fit();
  const motionButton = document.createElement("button");
  motionButton.className = "village-motion";
  root.querySelector(".village-tip")!.replaceWith(motionButton);
  const stopAnimation = animateVillage(map, art, motionButton);
  const refresh = () => {
    root.querySelector(".village-resources")!.textContent = `🪵 ${meta.wood}  🪨 ${meta.ore}  💎 ${meta.treasure}`;
    root.querySelector(".village-packed")!.textContent = `${zone} · Items packed ${meta.stockedItems.length}/3`;
    const slots = root.querySelector(".village-slots")!;
    slots.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const item = itemById(meta.stockedItems[i]);
      const slot = document.createElement("button");
      slot.className = "village-slot";
      slot.textContent = item?.glyph ?? "+";
      slot.title = item ? `${item.name}: ${item.desc}` : "Visit the item shop";
      slot.setAttribute("aria-label", slot.title);
      slot.addEventListener("click", actions.shop);
      slots.append(slot);
    }
  };
  refresh();
  return { root, refresh, destroy: () => { stopAnimation(); observer.disconnect(); root.remove(); } };
}
