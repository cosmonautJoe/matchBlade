/** The forest boss uses three dedicated arena games; the wizard waits in the dungeon. */
export const BOSS_FOR_BIOME: Record<string, string> = {
  plains: "gorrach", forest: "slime", snow: "hoarfrost", dungeon: "malgrim",
};
export const SLIME_GOALS = [3, 3, 4] as const;
export const SLIME_SCALES = [5.8, 3.9, 2.7] as const;
export const SLIME_GAPS = [190, 150, 112] as const;
export type SlimeProgress = { phase: 0 | 1 | 2; cleared: number };

export function restoreSlimeProgress(saved?: SlimeProgress, oldWard = 0): SlimeProgress {
  const phase = saved?.phase;
  if (saved && phase !== undefined && Number.isInteger(phase) && phase >= 0 && phase <= 2 &&
      Number.isInteger(saved.cleared) && saved.cleared >= 0) {
    return { phase, cleared: Math.min(SLIME_GOALS[phase], saved.cleared) };
  }
  // Carry completed wizard stages forward when loading an older forest checkpoint.
  const ward = Number.isFinite(oldWard) ? Math.max(0, Math.floor(oldWard)) : 0;
  return { phase: Math.min(2, ward) as 0 | 1 | 2, cleared: ward >= 3 ? SLIME_GOALS[2] : 0 };
}

export function slimeBeats(p: SlimeProgress): number {
  return SLIME_GOALS.slice(0, p.phase).reduce<number>((a, n) => a + n, 0) + p.cleared;
}

export type SlimePoint = { x: number; y: number };

/** Singles introduce the rush; the last two survivors always attack together. */
export function slimeRushWave(defeated: readonly boolean[], cursor: number): number[] {
  const remaining = defeated.flatMap((gone, i) => gone ? [] : [i]);
  if (remaining.length <= 2) return remaining;
  const next = remaining.find(i => i >= cursor) ?? remaining[0];
  return [next];
}

/** Sweep the current pointer segment across every airborne target, in slash order. */
export function slimeRushHits(a: SlimePoint, b: SlimePoint,
  targets: readonly (SlimePoint & { id: number; radius: number })[]): number[] {
  const dx = b.x - a.x, dy = b.y - a.y, lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1) return [];
  return targets.map(target => {
    const t = Math.max(0, Math.min(1, ((target.x - a.x) * dx + (target.y - a.y) * dy) / lengthSq));
    return { id: target.id, t, hit: Math.hypot(target.x - a.x - dx * t, target.y - a.y - dy * t) <= target.radius };
  }).filter(target => target.hit).sort((a, b) => a.t - b.t).map(target => target.id);
}

/** Test the whole stroke, so both slow drags and fast swipes can sever a thin link. */
export function slimeSwipeCut(stroke: readonly SlimePoint[], a: SlimePoint, b: SlimePoint,
  minTravel = 24, endPadding = 18): SlimePoint | null {
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  if (stroke.length < 2 || length < 1) return null;
  const ux = dx / length, uy = dy / length;
  const sides = stroke.map(p => (p.y - a.y) * ux - (p.x - a.x) * uy);
  // A tap, jitter or movement along the goo cannot count as a cut.
  if (Math.max(...sides) - Math.min(...sides) < minTravel) return null;
  for (let i = 1; i < stroke.length; i++) {
    const from = sides[i - 1], to = sides[i];
    if (from * to > 0 || Math.abs(from - to) < .001) continue;
    const t = from / (from - to), p = stroke[i - 1], q = stroke[i];
    const x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t;
    const along = (x - a.x) * ux + (y - a.y) * uy;
    if (along < -endPadding || along > length + endPadding) continue;
    const clamped = Math.max(0, Math.min(length, along));
    return { x: a.x + ux * clamped, y: a.y + uy * clamped };
  }
  return null;
}
