/**
 * matchBlade — persisted audio settings (channel faders + quick mutes).
 *
 * Three channels the options menu exposes: sound effects, ambience beds, and
 * music (xDeviruchi's 8-bit Fantasy pack: title/journey/boss beds). Scenes
 * multiply their per-call volumes through sfxV()/ambV()/musicV(), so the
 * sliders act as channel faders over the existing mix. On top of the faders
 * sit two persisted quick-mute switches (the in-lane 🔊/🎵 chips): muteSound
 * silences effects + ambience, muteMusic the music beds — without touching
 * the slider levels underneath. Changes broadcast on game.events as
 * "audio-changed" so looping beds can re-level live.
 */

export interface AudioSettings {
  sfx: number; // 0..1
  amb: number;
  music: number;
  muteSound: boolean; // quick-toggle: effects + ambience
  muteMusic: boolean; // quick-toggle: music beds
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
    return { sfx: clamp01(p.sfx, 1), amb: clamp01(p.amb, 1), music: clamp01(p.music, 0.8), muteSound: p.muteSound === true, muteMusic: p.muteMusic === true };
  } catch {
    return { sfx: 1, amb: 1, music: 0.8, muteSound: false, muteMusic: false };
  }
}

let S: AudioSettings = load();

export function audioSettings(): AudioSettings {
  return S;
}

export function setAudioSettings(patch: Partial<AudioSettings>): void {
  S = {
    sfx: clamp01(patch.sfx ?? S.sfx, 1),
    amb: clamp01(patch.amb ?? S.amb, 1),
    music: clamp01(patch.music ?? S.music, 0.8),
    muteSound: patch.muteSound ?? S.muteSound,
    muteMusic: patch.muteMusic ?? S.muteMusic,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch {
    /* private mode — settings just don't persist */
  }
}

/**
 * Set a looping bed's level so it STAYS set. Phaser re-runs applyConfig on
 * every internal (re)start of a sound's buffer source — loop restarts, tab
 * blur/refocus resumes, audio-unlock deferred starts — and that resets volume
 * to the sound's stored config (default 1, i.e. full blast). Writing the level
 * into currentConfig as well makes every one of those re-applies restore OUR
 * level instead of clobbering it. This was the "music suddenly loud" bug.
 */
export function setSoundLevel(snd: unknown, v: number): void {
  const s = snd as { volume: number; currentConfig?: { volume?: number } };
  s.volume = v;
  if (s.currentConfig) s.currentConfig.volume = v;
}

/** Scale a per-call volume by its channel fader (zeroed while quick-muted). */
export function sfxV(v = 1): number {
  return S.muteSound ? 0 : v * S.sfx;
}
export function ambV(v = 1): number {
  return S.muteSound ? 0 : v * S.amb;
}
export function musicV(v = 1): number {
  return S.muteMusic ? 0 : v * S.music;
}
