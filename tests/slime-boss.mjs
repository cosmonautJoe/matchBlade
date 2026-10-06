import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const cache = new Map();
function url(name) {
  if (cache.has(name)) return cache.get(name);
  let js = ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  js = js.replace(/from ["']\.\/([^"']+)["']/g, (_, dep) => `from "${url(dep)}"`);
  const result = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
  cache.set(name, result); return result;
}
const { BOSS_FOR_BIOME, SLIME_GOALS, restoreSlimeProgress, slimeBeats, slimeSwipeCut,
  slimeRushWave, slimeRushHits } = await import(url('slime-boss'));
const { readCheckpoint } = await import(url('run-save'));
const run = await import(url('run'));

assert.deepEqual(BOSS_FOR_BIOME, { plains: 'gorrach', forest: 'slime', snow: 'hoarfrost', dungeon: 'malgrim' });
assert.deepEqual(restoreSlimeProgress(), { phase: 0, cleared: 0 });
for (let phase = 0; phase < 3; phase++) {
  const saved = { phase, cleared: SLIME_GOALS[phase] - 1 };
  assert.deepEqual(restoreSlimeProgress(saved), saved, 'partial hits/defeats survive resume');
  assert.deepEqual(restoreSlimeProgress({ phase, cleared: 500 }), { phase, cleared: SLIME_GOALS[phase] });
  assert.equal(slimeBeats({ phase, cleared: 0 }), phase * 3);
  assert.deepEqual(restoreSlimeProgress(undefined, phase), { phase, cleared: 0 }, 'old wizard stages carry forward');
}
assert.equal(slimeBeats({ phase: 2, cleared: 4 }), 10);
assert.deepEqual(restoreSlimeProgress(undefined, 3), { phase: 2, cleared: 4 }, 'completed legacy core fight stays complete');
for (const saved of [null, {}, { phase: 9, cleared: 1 }, { phase: 1, cleared: -2 }, { phase: 1, cleared: NaN }])
  assert.deepEqual(restoreSlimeProgress(saved), { phase: 0, cleared: 0 });
assert.deepEqual(restoreSlimeProgress(undefined, Infinity), { phase: 0, cleared: 0 });

const left = { x: 100, y: 250 }, right = { x: 450, y: 250 };
const fast = [{ x: 270, y: 80 }, { x: 270, y: 430 }];
assert.deepEqual(slimeSwipeCut(fast, left, right), { x: 270, y: 250 }, 'swept hit works between distant pointer events');
assert.deepEqual(slimeSwipeCut([...fast].reverse(), left, right), { x: 270, y: 250 }, 'either swipe direction works');
const slow = Array.from({ length: 41 }, (_, i) => ({ x: 270, y: 210 + i * 2 }));
assert.deepEqual(slimeSwipeCut(slow, left, right), { x: 270, y: 250 }, 'small successive moves form a valid swipe');
assert.equal(slimeSwipeCut([{ x: 270, y: 249 }, { x: 271, y: 251 }], left, right), null, 'jitter cannot cut');
assert.equal(slimeSwipeCut([{ x: 270, y: 250 }], left, right), null, 'tap cannot cut');
assert.equal(slimeSwipeCut([{ x: 120, y: 250 }, { x: 430, y: 250 }], left, right), null, 'dragging along the link cannot cut');
assert.equal(slimeSwipeCut([{ x: 270, y: 150 }, { x: 270, y: 220 }], left, right), null, 'must cross the link');
assert.equal(slimeSwipeCut([{ x: 490, y: 150 }, { x: 490, y: 350 }], left, right), null, 'distant swipes miss');
assert.deepEqual(slimeSwipeCut([{ x: 458, y: 150 }, { x: 458, y: 350 }], left, right), right, 'slight endpoint overshoot is forgiven');
assert.equal(slimeSwipeCut(fast, left, left), null, 'a collapsed link is not cuttable');
assert.ok(slimeSwipeCut([{ x: 140, y: 170 }, { x: 240, y: 290 }, { x: 350, y: 190 }], left, right),
  'curved strokes are checked segment by segment, even if both ends are on the same side');
for (const angle of [-.5, .5, Math.PI / 2]) {
  const center = { x: 300, y: 280 }, dx = Math.cos(angle), dy = Math.sin(angle);
  const a = { x: center.x - dx * 130, y: center.y - dy * 130 };
  const b = { x: center.x + dx * 130, y: center.y + dy * 130 };
  const swipe = [{ x: center.x - dy * 75, y: center.y + dx * 75 },
    { x: center.x + dy * 75, y: center.y - dx * 75 }];
  const cut = slimeSwipeCut(swipe, a, b);
  assert.ok(cut && Math.hypot(cut.x - center.x, cut.y - center.y) < .001, 'angled connections use the same hit geometry');
}

const defeated = [false, false, false, false];
assert.deepEqual(slimeRushWave(defeated, 0), [0], 'the opening attack is a single slime');
defeated[0] = true;
assert.deepEqual(slimeRushWave(defeated, 1), [1], 'the second attack is also a single');
assert.deepEqual(slimeRushWave(defeated, 2), [2], 'a missed wave advances without restoring a defeated slime');
defeated[1] = true;
assert.deepEqual(slimeRushWave(defeated, 3), [2, 3], 'the last two always rush together');
const rushTargets = [{ id: 2, x: 220, y: 320, radius: 40 }, { id: 3, x: 420, y: 320, radius: 40 }];
assert.deepEqual(slimeRushHits({ x: 120, y: 320 }, { x: 550, y: 320 }, rushTargets), [2, 3],
  'a fast sweeping slash can defeat both slimes between pointer events');
assert.deepEqual(slimeRushHits({ x: 550, y: 320 }, { x: 120, y: 320 }, rushTargets), [3, 2],
  'reverse swipes resolve both hits in slash order');
assert.deepEqual(slimeRushHits({ x: 220, y: 320 }, { x: 220, y: 320 }, rushTargets), [],
  'holding a stationary pointer over a slime does not hit');
assert.deepEqual(slimeRushHits({ x: 120, y: 270 }, { x: 550, y: 270 }, rushTargets), [], 'off-target swipes miss');
assert.deepEqual(slimeRushHits({ x: 220, y: 320 }, { x: 222, y: 320 }, rushTargets), [2],
  'a slow drag keeps connecting after the gesture has armed');
defeated[2] = true;
assert.deepEqual(slimeRushWave(defeated, 0), [3], 'one survivor cannot bring its defeated partner back');
defeated[3] = true;
assert.deepEqual(slimeRushWave(defeated, 0), [], 'a cleared swarm has no more attacks');

for (const depth of [9, 19]) {
  const state = run.newRun(0, 6, 'forest');
  state.killed = depth; state.enemy = run.makeEnemy(depth, 'forest', () => 0); state.pressure = .4;
  const checkpoint = { version: 1, savedAt: 1, run: state,
    grid: Array.from({ length: 7 }, () => [0, 1, 2, 3, 4, 5, 6]),
    items: [null, null, null, null, null, null], chestsOpened: 0, sinceChest: 0,
    bestCascade: 0, rainy: false, arenaWard: 2, slimeBoss: { phase: 2, cleared: 2 }, pendingChest: null,
    buffs: { freezeLeft: 0, hornLeft: 0, ledgerLeft: 0, burnLeft: 0, burnAcc: 0,
      skeletonCharges: 0, panCharges: 0, spursActive: false, bossChestNext: false } };
  const meta = { biome: 'forest', activeRun: checkpoint };
  assert.deepEqual(readCheckpoint(meta).slimeBoss, { phase: 2, cleared: 2 });
  delete checkpoint.slimeBoss;
  assert.deepEqual(readCheckpoint(meta).slimeBoss, { phase: 2, cleared: 0 });
  assert.equal(run.dealDamage(state, 9999), false, 'ordinary matching cannot skip the boss arena');
  assert.equal(state.killed, depth);
  assert.equal(run.dealDamage(state, state.enemy.hp, true), true, 'arena completion defeats the boss');
  assert.equal(state.killed, depth + 1, 'all four slimes count as one boss encounter');
  assert.equal(run.dealDamage(state, 9999, true), false, 'completion cannot award a second kill');
  assert.equal(readCheckpoint(meta).slimeBoss, undefined, 'cleared encounter cannot carry a stale boss phase');
}
console.log('Slime boss: recovery, tether swipes, rush waves, sweeping hits and one-time completion passed.');
