/** Permanent upgrade milestones; match size still controls the attack combo. */
export function weaponGrade(level: number): 0 | 1 | 2 | 3 | 4 {
  return level >= 9 ? 4 : level >= 6 ? 3 : level >= 3 ? 2 : level >= 1 ? 1 : 0;
}

export function swordStyle(level: number) {
  const grade = weaponGrade(level);
  return {
    grade,
    edge: [0xe5ecf3, 0xeffcff, 0xe6fbff, 0xf7fdff, 0xfff5d2][grade],
    accent: [0x8295a5, 0xa7d1df, 0x63bfdc, 0x8ccff2, 0xeebc65][grade],
    scale: 1 + grade * .095,
    soundRate: 1 - grade * .035,
  };
}

export function spellStyle(level: number) {
  const grade = weaponGrade(level);
  return {
    grade,
    edge: [0xe9b8ff, 0xeacfff, 0xf3ddff, 0xfbeeff, 0xfff5d8][grade],
    accent: [0xb34cec, 0xbe66f4, 0xbb76ff, 0xd095ff, 0xe9b7ff][grade],
    core: [0xf1d3ff, 0xf6dfff, 0xfaf0ff, 0xffffff, 0xfffcf0][grade],
    scale: 1 + grade * .09,
    soundRate: 1.12 - grade * .035,
  };
}
