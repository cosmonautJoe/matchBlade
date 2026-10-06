/** Player preference for tile glisten and shattering, independent of OS motion settings. */
const KEY = "matchblade-tile-effects-v1";
export const TILE_EFFECTS_CHANGED = "tile-effects-changed";

function load(): boolean {
  try { return localStorage.getItem(KEY) !== "false"; }
  catch { return true; }
}

let enabled = load();

export function tileEffectsEnabled(): boolean { return enabled; }

export function setTileEffectsEnabled(value: boolean): void {
  enabled = value;
  try { localStorage.setItem(KEY, String(value)); }
  catch { /* Keep the preference for this session if storage is unavailable. */ }
}
