/** Shared, optional tactile feedback. Device support is best-effort, never a game requirement. */
const STORAGE_KEY = "matchblade-haptics-v1";
const CUES = {
  tap: { pattern: [8], priority: 0 },
  match: { pattern: [16], priority: 1 },
  combo: { pattern: [18, 30, 24], priority: 2 },
  damage: { pattern: [38, 40, 24], priority: 3 },
  reward: { pattern: [12, 35, 22], priority: 2 },
  victory: { pattern: [20, 50, 25, 60, 40], priority: 4 },
} as const;
type Cue = keyof typeof CUES;

function loadPreference() {
  try { return localStorage.getItem(STORAGE_KEY) !== "false"; }
  catch { return true; }
}

let enabled = loadPreference();
let busyUntil = 0, activePriority = -1;
let switchLabel: HTMLLabelElement | null = null;
let dispose: (() => void) | null = null;

export function hapticsEnabled() { return enabled; }

export function stopHaptics() {
  busyUntil = 0; activePriority = -1;
  try { navigator.vibrate?.(0); }
  catch { /* Unsupported or restricted browser; gameplay must continue. */ }
}

export function setHapticsEnabled(value: boolean) {
  enabled = value;
  try { localStorage.setItem(STORAGE_KEY, String(value)); }
  catch { /* Keep the setting for this session when storage is unavailable. */ }
  if (!value) stopHaptics();
}

/** Safari's switch may provide one light tap during a gesture, never custom patterns. */
export function initHaptics(): () => void {
  if (dispose) return dispose;
  if (typeof document === "undefined") return () => {};
  if (typeof navigator.vibrate !== "function" && navigator.maxTouchPoints > 0) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    if ("switch" in input) {
      switchLabel = document.createElement("label");
      switchLabel.setAttribute("aria-hidden", "true");
      switchLabel.style.cssText = "position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden";
      switchLabel.append(input);
      document.body.append(switchLabel);
    }
  }
  const onVisibility = () => { if (document.hidden) stopHaptics(); };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", stopHaptics);
  dispose = () => {
    stopHaptics();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", stopHaptics);
    switchLabel?.remove(); switchLabel = null; dispose = null;
  };
  return dispose;
}

function pulse(pattern: readonly number[], priority: number): boolean {
  if (!enabled || typeof navigator === "undefined" || typeof document === "undefined" || document.hidden) return false;
  const now = performance.now();
  // Several effects can land together; a damage/reward cue wins over incidental taps.
  if (now < busyUntil && priority <= activePriority) return false;
  let attempted = false;
  try {
    if (typeof navigator.vibrate === "function") {
      attempted = navigator.vibrate([...pattern]);
    } else if (switchLabel && navigator.userActivation?.isActive) {
      switchLabel.click();
      attempted = true; // An attempt, not confirmation that iOS produced a physical tap.
    }
  } catch { /* Browser restrictions must not interrupt input or animation. */ }
  if (attempted) {
    activePriority = priority;
    busyUntil = now + Math.max(85, pattern.reduce((sum, ms) => sum + ms, 0) + 55);
  }
  return attempted;
}

export function haptic(cue: Cue): boolean {
  const { pattern, priority } = CUES[cue];
  return pulse(pattern, priority);
}

/** Existing boss/item impact hooks share the same setting and overlap protection. */
export function buzz(ms = 14): boolean {
  if (!Number.isFinite(ms) || ms <= 0) return false;
  return pulse([Math.min(50, Math.round(ms))], ms >= 24 ? 2 : 1);
}

export function hapticsNote(): string {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function")
    return "Light taps · Requires device support";
  if (switchLabel) return "Light taps only · iPhone support varies";
  return "Vibration unavailable in this browser";
}

export function testHaptics(): boolean {
  stopHaptics();
  return haptic("reward");
}
