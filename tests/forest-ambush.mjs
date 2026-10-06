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
const r = await import(url('run'));
const { readCheckpoint } = await import(url('run-save'));
const forest = () => {
  const s = r.newRun(0, Infinity, 'forest');
  s.killed = 4; s.pressure = .6; s.enemy = r.makeEnemy(4, 'forest', () => 0);
  return s;
};
for (const biome of ['plains', 'forest', 'snow', 'dungeon']) {
  const encounters = Array.from({ length: 20 }, (_, depth) => r.makeEnemy(depth, biome, () => 0));
  assert.equal(encounters.filter(e => e.ambush).length, biome === 'forest' ? 2 : 0);
  assert.equal(encounters[9].kind, 'boss'); assert.equal(encounters[19].kind, 'boss');
}

let s = forest(), front = s.enemy, rear = r.ambushRear(s);
const before = rear.hp;
r.applyMatches(s, { [r.SWORD]: 3 });
assert.equal(rear.hp, before, 'swords only hit the front member');
const power = r.enemyHitPower(front), interval = r.attackInterval(s);
s.block = r.guardCost(s.killed);
assert.equal(r.enemyStrike(s), 0); assert.equal(s.block, 0, 'one attack spends one set of guard');
const pressure = s.pressure;
assert.equal(r.enemyStrike(s), power);
assert.equal(s.pressure, pressure + power, 'the pair has one hit, not two');
assert.equal(r.dealDamage(s, front.hp), false);
assert.equal(s.enemy, rear); assert.equal(s.killed, 4);
assert.equal(r.attackInterval(s), interval, 'promotion preserves the shared attack cadence');
assert.deepEqual(s.resources, { wood: 0, ore: 0, treasure: 0, keys: 0 });
assert.equal(r.dealDamage(s, rear.hp), true);
assert.equal(s.killed, 5); assert.equal(s.enemy, null);
assert.deepEqual(s.resources, { wood: 4, ore: 2, treasure: 0, keys: 0 });
const awarded = structuredClone(s.resources);
assert.equal(r.dealDamage(s, 100), false); assert.deepEqual(s.resources, awarded);

s = forest(); front = s.enemy; rear = r.ambushRear(s);
const fire = r.applyMatches(s, { [r.STAFF]: 3 });
assert.equal(fire.spell.dmg, 14, 'fire burns through front hide');
assert.equal(fire.spell.splash.dmg, 5, 'rear ward uses its own resistance');
assert.equal(front.hp, 0); assert.equal(rear.hp, before - 5);
assert.equal(s.enemy, rear); assert.equal(fire.killed, false);

s = forest(); front = s.enemy; rear = r.ambushRear(s);
front.hp = front.maxHp = 50; rear.hp = 2;
assert.equal(r.castBlast(s, 9).killed, false);
assert.equal(s.enemy, front); assert.equal(rear.hp, 0); assert.equal(r.ambushRear(s), null);
assert.equal(s.killed, 4, 'rear dying first must not award an encounter');
assert.equal(r.castBlast(s, 100).killed, true); assert.equal(s.killed, 5);
assert.deepEqual(s.resources, awarded);

s = forest(); s.swordBonus = 30; s.spellBonus = 100;
const mixed = r.applyMatches(s, { [r.SWORD]: 5, [r.STAFF]: 5 });
assert.equal(mixed.killed, true); assert.equal(s.killed, 5);
assert.equal(s.pressure, .6 - r.ADVANCE_PER_KILL, 'one recovery surge for the pair');
assert.deepEqual(s.resources, awarded, 'a mixed cascade cannot double-pay supplies');
s = forest(); s.sunderEdge = true;
assert.equal(r.applyMatches(s, { [r.SWORD]: 3 }).killed, false, 'sunder still targets only the front');
assert.equal(r.applyMatches(s, { [r.SWORD]: 3 }).killed, true);

// Save/load after either member falls, plus migration of an old pending forest fork.
const checkpoint = state => ({ version: 1, savedAt: 1, run: state,
  grid: Array.from({ length: 7 }, () => Array(7).fill(0)), items: Array(6).fill(null),
  chestsOpened: 0, sinceChest: 0, bestCascade: 0, rainy: false, arenaWard: 0, pendingChest: null,
  buffs: { freezeLeft: 0, hornLeft: 0, ledgerLeft: 0, burnLeft: 0, burnAcc: 0,
    skeletonCharges: 0, panCharges: 0, spursActive: false, bossChestNext: false } });
for (const casualty of ['front', 'rear', 'neither']) {
  s = forest();
  if (casualty === 'front') r.dealDamage(s, s.enemy.hp);
  if (casualty === 'rear') r.dealDamage(s, 1, false, 100);
  s.zone.marks = [6, 7];
  s.roadFork = { pending: true, choice: 'wood', startDepth: 4, paidThrough: 4 };
  const recovered = readCheckpoint({ biome: 'forest', activeRun: checkpoint(s) });
  assert.ok(recovered);
  assert.deepEqual(recovered.run.enemy, s.enemy, 'both health values and survivor identity persist');
  assert.deepEqual(recovered.run.zone.marks, []);
  assert.equal(recovered.run.roadFork.pending, false); assert.equal(recovered.run.roadFork.choice, null);
  assert.equal(r.castBlast(recovered.run, 1000).killed, true);
  assert.deepEqual(recovered.run.resources, awarded);
}
console.log('Forest ambush: targeting, shared attacks, both death orders, rewards and save migration passed.');
