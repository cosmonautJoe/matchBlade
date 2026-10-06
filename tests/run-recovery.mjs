import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const cache = new Map();
function url(name) {
  if (cache.has(name)) return cache.get(name);
  let js = ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'),
    {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  js = js.replace(/from ["']\.\/([^"']+)["']/g, (_, dep) => `from "${url(dep)}"`);
  const encoded = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
  cache.set(name, encoded); return encoded;
}
const storage = new Map();
globalThis.localStorage = {getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
const meta = await import(url('meta'));
const run = await import(url('run'));
const board = await import(url('board'));
const {readCheckpoint} = await import(url('run-save'));
const {nextUpgrade,endOfRunCopy} = await import(url('run-advice'));
const fixture = () => ({version:1,savedAt:Date.now(),run:run.newRun(0,3,'plains',0),
  grid:board.makeInitialGrid(()=>Math.random(),10,5),items:['hearth',null,null,null,null,null],
  chestsOpened:2,sinceChest:1,bestCascade:3,rainy:false,arenaWard:1,
  pendingChest:[{kind:'wood',n:8,icon:'wood'}],
  buffs:{freezeLeft:4,hornLeft:0,ledgerLeft:8,burnLeft:0,burnAcc:0,skeletonCharges:1,panCharges:0,spursActive:false,bossChestNext:false}});

let m = meta.defaultMeta();
m.activeRun=fixture(); m.activeRun.run.pressure=.72; m.activeRun.run.resources.keys=2;
meta.saveMeta(m);
let loaded = meta.loadMeta(), recovered=readCheckpoint(loaded);
assert.deepEqual(recovered,m.activeRun,'checkpoint round-trip preserves board, inventory, boss stage, buffs and pending loot');
recovered.grid[0][0]=-1;
assert.notEqual(loaded.activeRun.grid[0][0],-1,'restoration does not mutate stored checkpoint');
loaded.activeRun.grid[0][0]=-1;
assert.equal(readCheckpoint(loaded),null,'reject partial cascades');
loaded.activeRun=fixture(); loaded.activeRun.grid={length:5};
assert.equal(readCheckpoint(loaded),null,'ignore malformed board');
loaded.activeRun=fixture(); loaded.activeRun.run.over=true;
assert.equal(readCheckpoint(loaded),null,'never resume a completed run');

m=meta.defaultMeta(); m.activeRun=fixture();
const rotated=board.reflowBoard(m.activeRun.grid,false);
m.activeRun.grid=rotated.grid; m.activeRun.boardLayouts=rotated.layouts;
meta.saveMeta(m);
recovered=readCheckpoint(meta.loadMeta());
assert.deepEqual(recovered.boardLayouts,rotated.layouts,'orientation memory and spare tile survive recovery');
assert.deepEqual(board.reflowBoard(recovered.grid,true,recovered.boardLayouts).grid,rotated.layouts.landscape);
m.activeRun.boardLayouts={portrait:[[99]],reserve:-1};
assert.equal(readCheckpoint(m).boardLayouts,undefined,'malformed layout memory cannot break a valid run');

m=meta.defaultMeta(); m.activeRun=fixture();
meta.bankRun(m,{wood:12,ore:9,treasure:8,kills:20,chests:3});
loaded=meta.loadMeta();
assert.equal(loaded.wood,12); assert.equal(loaded.activeRun,undefined);
assert.equal(meta.roadOpen(loaded),true,'final boss unlocks travel without quests');
assert.equal(loaded.questsRewarded.length,0);
assert.equal(meta.advanceBiome(loaded),true);
assert.equal(loaded.biome,'forest');
assert.equal(meta.roadOpen(loaded),false,'next zone needs its own boss clear');

m=meta.defaultMeta(); m.questsRewarded=meta.PLAINS_QUESTS.map(q=>q.id);
meta.saveMeta(m);
assert.equal(meta.roadOpen(meta.loadMeta()),false,'new saves cannot unlock roads with quests');
const legacy={...m}; delete legacy.clearedBiomes;
assert.equal(meta.roadOpen(meta.migrateMeta(legacy)),true,'legacy unlocked roads remain unlocked');
m=meta.defaultMeta(); m.activeRun=fixture(); meta.saveToSlot(1,m);
assert.equal(meta.readSlot(1).meta.activeRun,undefined,'camp slots do not duplicate active runs');
meta.loadFromSlot(1); assert.equal(readCheckpoint(meta.loadMeta()),null);

m=meta.defaultMeta(); m.wood=30;m.ore=30;
assert.match(nextUpgrade(m).title,/Ready now.*forge/);
m.blacksmithHired=true;
assert.match(nextUpgrade(m).title,/Sword level 1/);
m.ore=0;
assert.match(nextUpgrade(m).lines.join(' '),/Still needed: 20 stone/);
for (const [fn,reason] of [[s=>run.scroll(s,1),'pressure'],[run.enemyStrike,'enemy'],[run.pierceStrike,'boss']]) {
  const s=run.newRun(0,3,'plains',0); run.spawnNext(s); s.pressure=.999; fn(s);
  assert.equal(s.endReason,reason);
  assert.ok(endOfRunCopy(reason,false).tip.length>20);
}
console.log('Recovery, atomic settlement, boss unlocks, legacy migration, save slots, defeat reasons and upgrade advice passed.');
