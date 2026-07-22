/**
 * matchBlade — persisted audio settings (channel faders).
 *
 * Three channels the options menu exposes: sound effects, ambience beds, and
 * music (no tracks yet — the fader is wired for the day one lands). Scenes
 * multiply their per-call volumes through sfxV()/ambV()/musicV(), so the
 * sliders act as channel faders over the existing mix. Changes broadcast on
 * game.events as "audio-changed" so looping beds can re-level live.
 */

export interface AudioSettings {
  sfx: number; // 0..1
  amb: number;
  music: number;
}

const KEY = "matchblade-audio-v1";

function clamp01(v: unknown, fallback: number): number {
  const n = typeof v === "number" && isFinite(v) ? v : fallback;
  return Math.max(0, Math.min(1, n));
}

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Partial<AudioSettings>) : {};
    return { sfx: clamp01(p.sfx, 1), amb: clamp01(p.amb, 1), music: clamp01(p.music, 0.8) };
  } catch {
    return { sfx: 1, amb: 1, music: 0.8 };
  }
}

let S: AudioSettings = load();

export function audioSettings(): AudioSettings {
  return S;
}

export function setAudioSettings(patch: Partial<AudioSettings>): void {
  S = { sfx: clamp01(patch.sfx ?? S.sfx, 1), amb: clamp01(patch.amb ?? S.amb, 1), music: clamp01(patch.music ?? S.music, 0.8) };
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch {
    /* private mode — settings just don't persist */
  }
}

/** Scale a per-call volume by its channel fader. */
export function sfxV(v = 1): number {
  return v * S.sfx;
}
export function ambV(v = 1): number {
  return v * S.amb;
}
export function musicV(v = 1): number {
  return v * S.music;
}
