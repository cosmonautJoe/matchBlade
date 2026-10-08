import type Phaser from "phaser";
import { prepareTileArt, TILE_KEYS } from "./tile-art";
import "./ui-resources.css";

export const RESOURCE_INFO = {
  wood: { name: "Wood", tile: 5, glyph: "🪵" },
  ore: { name: "Stone", tile: 6, glyph: "🪨" },
  treasure: { name: "Gems", tile: 4, glyph: "💎" },
  keys: { name: "Keys", tile: 3, glyph: "🔑" },
} as const;
export type ResourceKey = keyof typeof RESOURCE_INFO;
export type ResourceCost = Partial<Record<ResourceKey, number>>;
const sources: Partial<Record<ResourceKey, string>> = {};

/** Reuse the exact tile artwork at native DOM resolution, cached across menus. */
export function prepareResourceIcons(scene: Phaser.Scene) {
  prepareTileArt(scene);
  for (const key of Object.keys(RESOURCE_INFO) as ResourceKey[])
    sources[key] ??= scene.textures.getBase64(TILE_KEYS[RESOURCE_INFO[key].tile]);
}

export function resourceIcon(key: ResourceKey) {
  const icon = document.createElement("img");
  icon.className = "mb-resource-icon";
  icon.src = sources[key] ?? "";
  icon.alt = RESOURCE_INFO[key].name;
  icon.width = icon.height = 24;
  return icon;
}

export function resourceAmounts(values: ResourceCost, compact = false) {
  const strip = document.createElement("span");
  strip.className = "mb-resources";
  for (const key of Object.keys(RESOURCE_INFO) as ResourceKey[]) {
    const amount = values[key];
    if (amount === undefined) continue;
    const chip = document.createElement("span");
    chip.className = "mb-resource-value";
    chip.setAttribute("aria-label", `${amount.toLocaleString()} ${RESOURCE_INFO[key].name.toLowerCase()}`);
    chip.title = chip.getAttribute("aria-label")!;
    const value = document.createElement("span");
    value.textContent = compact && amount >= 10000
      ? Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(amount)
      : amount.toLocaleString();
    const icon = resourceIcon(key); icon.alt = "";
    value.setAttribute("aria-hidden", "true");
    chip.append(icon, value); strip.append(chip);
  }
  return strip;
}

export function resourceRequirements(cost: ResourceCost, have: ResourceCost) {
  const list = document.createElement("dl"); list.className = "mb-materials";
  list.setAttribute("aria-label", "Materials available and required");
  for (const key of Object.keys(RESOURCE_INFO) as ResourceKey[]) {
    const need = cost[key];
    if (need === undefined) continue;
    const available = have[key] ?? 0;
    const row = document.createElement("div"); row.className = "mb-material-row";
    row.classList.toggle("is-ready", available >= need);
    const name = document.createElement("dt");
    const icon = resourceIcon(key); icon.alt = "";
    name.append(icon, RESOURCE_INFO[key].name);
    const value = document.createElement("dd");
    value.textContent = `${available.toLocaleString()} / ${need.toLocaleString()}`;
    value.setAttribute("aria-label", `${available} available, ${need} needed`);
    row.append(name, value); list.append(row);
  }
  return list;
}

/** Legacy descriptive copy can still use resource tokens, with consistent artwork. */
export function resourceText(node: HTMLElement, text: string) {
  node.replaceChildren();
  for (const part of text.split(/(🪵|🪨|💎|🔑)/u)) {
    const key = (Object.keys(RESOURCE_INFO) as ResourceKey[]).find(key => RESOURCE_INFO[key].glyph === part);
    node.append(key ? resourceIcon(key) : document.createTextNode(part));
  }
}
