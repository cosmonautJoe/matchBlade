import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const modules = new Map();
function url(name) {
  if (modules.has(name)) return modules.get(name);
  let code = ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'),
    {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  code = code.replace(/import ["'][^"']+\.css["'];?/g, '')
    .replace(/from ["']\.\/([^"']+)["']/g, (_, dep) => `from "${url(dep)}"`);
  const result = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  modules.set(name, result); return result;
}
const f = await import(url('road-fork')), r = await import(url('run'));
const saves = await import(url('run-save')), effects = await import(url('active-effects'));
const storage = new Map();
globalThis.localStorage = {getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
const m = await import(url('meta'));
const checkpoint = (run, wide = false) => ({version:1,run,grid:Array.from({length:wide?5:7},()=>Array(wide?10:7).fill(0)),
  items:Array(6).fill(null),pendingChest:null,buffs:{},rescue:{rolledDepth:5,encountered:false,pending:null}});
const restore = (run, wide) => saves.readCheckpoint({biome:run.biome,activeRun:checkpoint(structuredClone(run),wide)}).run;
const fork = f.newRoadFork();
assert.equal(f.chooseRoad(fork,'wood'),false);
assert.equal(f.offerRoadFork(fork,4),false);
assert.equal(f.offerRoadFork(fork,5),true);
assert.deepEqual(f.restoreRoadFork(fork,5),fork,'pending choice survives reload');
assert.equal(f.offerRoadFork(fork,5),true,'reopening the same fork keeps its depth');
assert.equal(f.chooseRoad(fork,'wood'),true);
assert.equal(f.chooseRoad(fork,'ore'),false,'rapid second taps cannot change the route');
assert.equal(f.offerRoadFork(fork,6),false,'only one fork per run');
assert.equal(f.offerRoadFork(f.newRoadFork(),6),true,'rescue can defer the fork one encounter');
assert.equal(f.offerRoadFork(f.newRoadFork(),7),false,'no fork on the approach to the boss');
for (const biome of ['plains','forest','snow','dungeon']) for (const choice of ['wood','ore']) {
  let run = r.newRun(0,Infinity,biome);run.killed=5;run.enemy=null;run.resMult=2;
  assert.equal(f.offerRoadFork(run.roadFork,5),true);
  run=restore(run,false);assert.equal(run.roadFork.pending,true);
  assert.equal(f.chooseRoad(run.roadFork,choice),true);
  const startingBoardResources={...run.resources};
  assert.equal(f.claimRoadBonus(run.roadFork,5),null,'the enemy before the fork never pays');
  for (let kill = 6; kill <= 9; kill++) {
    r.spawnNext(run);run.enemy.hp=100;
    assert.equal(r.dealDamage(run,1),false);assert.equal(run.resources[choice],Math.min(3,kill-6)*3);
    assert.equal(r.dealDamage(run,1000),true);
    assert.equal(run.resources[choice],Math.min(3,kill-5)*3,'fixed reward is neither multiplied nor extended');
    assert.equal(r.dealDamage(run,1000),false);
    run=restore(run,kill%2===0);
    assert.equal(f.claimRoadBonus(run.roadFork,kill),null,'reload/rotation cannot repay a kill');
    assert.equal(f.roadEnemiesLeft(run.roadFork,run.killed),Math.max(0,8-kill));
    const chips=effects.activeItemEffects(run,{},[],false).filter(e=>e.id==='road-detour');
    assert.equal(chips.length,kill<8?1:0);
    if(chips.length)assert.ok(chips[0].detail.includes(choice==='wood'?'wood':'stone'));
  }
  assert.equal(run.resources[choice],9);
  assert.equal(run.resources[choice==='wood'?'ore':'wood'],startingBoardResources[choice==='wood'?'ore':'wood']);
  const meta=m.defaultMeta();meta.biome=biome;
  m.bankRun(meta,{...run.resources,kills:run.killed,chests:0});
  assert.equal(m.loadMeta()[choice],9,'detour supplies bank on an ended run');
  assert.equal(meta.zoneStats[biome][choice==='wood'?'totalWood':'totalOre'],9,'supplies count for the correct area quests');
}
const old=r.newRun();delete old.roadFork;
assert.deepEqual(restore(old,false).roadFork,f.newRoadFork(),'older checkpoints remain usable');
for(const bad of [{...fork,choice:'gems'},{...fork,startDepth:99},{...fork,paidThrough:-1},{...fork,pending:true}])
  assert.deepEqual(f.restoreRoadFork(bad,6),f.newRoadFork());
console.log('Fork choices, per-defeat payouts, expiry, active effects, recovery/rotation and banked quest resources passed.');
