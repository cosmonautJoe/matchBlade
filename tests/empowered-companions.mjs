import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const cache=new Map();
function url(name){
  if(cache.has(name))return cache.get(name);
  let js=ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  js=js.replace(/from ["']\.\/([^"']+)["']/g,(_,dep)=>`from "${url(dep)}"`);
  const value=`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;cache.set(name,value);return value;
}
const r=await import(url('run')), e=await import(url('empowered')), b=await import(url('board')), c=await import(url('companions'));
const durableEnemy=()=>{const s=r.newRun();s.enemy.hp=1000;s.enemy.maxHp=1000;return s;};
for(const type of [r.SWORD,r.STAFF,r.SHIELD]) for(const count of [3,4,5]) {
  const base=r.applyMatches(durableEnemy(),{[type]:count});
  const powered=r.applyMatches(durableEnemy(),{[type]:count},{type,count});
  assert.equal(powered.damage,base.damage*2);assert.equal(powered.guard,base.guard*2);
}
const s=durableEnemy();s.whetstone=2;
const sharpened=r.applyMatches(s,{0:3},{type:0,count:3});
assert.equal(s.whetstone,1,'double power must consume only one whetstone charge');
assert.equal(sharpened.damage,18);
const grid=[[0,0,0,5,0,0,0],[1,2,0,4,5,6,1],[2,1,0,5,6,1,2]];
assert.deepEqual(e.empoweredMatch(b.findMatches(grid),{r:0,c:1}),{type:0,count:5},'crossed match joins once; separate sword group receives no bonus');
assert.equal(r.applyMatches(durableEnemy(),{0:6},{type:0,count:3}).damage,14,'unrelated group is not doubled');
let seed=3189;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
const portrait=b.makeInitialGrid(rand,7,7), pos=portrait.flatMap((row,r)=>row.flatMap((t,c)=>t===0?[{r,c}]:[]))[0];
let state={...e.newEmpowered(),type:0,cell:pos};
const wide=b.reflowBoard(portrait,true);assert.ok(wide);
e.reflowEmpowered(state,portrait,wide.grid);assert.equal(wide.grid[state.cell.r][state.cell.c],0);
state=JSON.parse(JSON.stringify(state));
const tall=b.reflowBoard(wide.grid,false,wide.layouts);assert.ok(tall);
e.reflowEmpowered(state,wide.grid,tall.grid);assert.deepEqual(state.cell,pos,'rotation and save/reload restore the same charge');
const missed=c.newRescueState();assert.equal(c.rollRescue(missed,'plains',4,[],()=>.99),null);
assert.equal(c.rollRescue(missed,'plains',4,[],()=>0),null,'same encounter cannot reroll on reload');
assert.equal(c.rollRescue(missed,'plains',5,['bramble'],()=>0),'pip');
missed.pending=null;assert.equal(c.rollRescue(missed,'plains',6,[],()=>0),null,'one rescue per run');
assert.equal(c.rollRescue(c.newRescueState(),'forest',5,[],()=>0),'hazel');
assert.equal(c.rollRescue(c.newRescueState(),'plains',5,['bramble','pip','moss'],()=>0),null);
const party=durableEnemy();party.companions=['bramble','pip'];party.killed=3;r.dealDamage(party,1000);
assert.equal(party.resources.wood,3);assert.equal(party.resources.ore,3);assert.equal(party.resources.treasure,0);
r.dealDamage(party,1000);assert.equal(party.resources.ore,3,'dead enemy cannot pay companion rewards twice');
// Every zone offers only its own missing pets; unavailable supplies never consume a rescue.
for(const biome of ['plains','forest','snow','dungeon']) {
  const pets=c.COMPANIONS.filter(p=>p.biome===biome), owned=[];
  assert.ok(pets.length>=2);
  for(const pet of pets) {
    const state=c.newRescueState();
    assert.equal(c.rollRescue(state,biome,4,owned,()=>0,false),null);
    assert.equal(state.encountered,false);
    assert.equal(c.rollRescue(state,biome,5,owned,()=>0,true),pet.id);
    const resumed=JSON.parse(JSON.stringify(state));
    assert.equal(c.rollRescue(resumed,biome,6,owned,()=>.99),pet.id,'pending rescue survives reload');
    owned.push(pet.id);
  }
  assert.equal(c.rollRescue(c.newRescueState(),biome,5,owned,()=>0),null);
}
const pack={wood:2,keys:1}, bank={wood:1};
assert.equal(c.payForRescue('wood',pack,bank),true);
assert.deepEqual(pack,{wood:0,keys:1});assert.equal(bank.wood,0);
assert.equal(c.payForRescue('wood',pack,bank),false,'no partial deduction on a failed payment');
assert.equal(c.payForRescue('key',pack,bank),true);assert.equal(pack.keys,0);
assert.equal(c.payForRescue('key',pack,bank),false);
assert.deepEqual(c.cleanCompanions(['hush','hush','echo','old-invalid']),['hush','echo']);
const boosted=durableEnemy();boosted.companions=['hazel','hush','flurry','rime','flint'];boosted.resMult=2;
const haul=r.applyMatches(boosted,{[r.WOOD]:4,[r.ORE]:4,[r.SHIELD]:4});
assert.equal(haul.gained.wood,11);assert.equal(haul.gained.ore,11);assert.equal(haul.guard,4);
const small=r.applyMatches(boosted,{[r.WOOD]:3,[r.ORE]:3,[r.SHIELD]:3});
assert.equal(small.gained.wood,6);assert.equal(small.gained.ore,6);assert.equal(small.guard,1);
for(const defense of ['none','hide','ward']) for(const spellBonus of [0,24]) for(const count of [3,4,5]) {
  const base=durableEnemy(), owl=durableEnemy();base.enemy.defense=owl.enemy.defense=defense;owl.companions=['hush'];
  base.spellBonus=owl.spellBonus=spellBonus;
  const damage=r.applyMatches(base,{[r.STAFF]:count}).damage;
  assert.equal(r.applyMatches(owl,{[r.STAFF]:count}).damage,damage+Math.max(2,Math.round(damage*.2)));
}
const boss=durableEnemy();boss.enemy.kind='boss';boss.companions=['hush'];
assert.equal(r.applyMatches(boss,{[r.STAFF]:5}).damage,0,'pets do not bypass boss arenas');
const guardBefore=boosted.block;r.drinkPotion(boosted);assert.equal(boosted.block-guardBefore,4);
const bat=durableEnemy();bat.companions=['echo'];bat.killed=4;r.dealDamage(bat,1000);assert.equal(bat.resources.keys,1);
r.dealDamage(bat,1000);assert.equal(bat.resources.keys,1);
assert.equal(r.newRun(0,Infinity,'plains',0,['moss','moss']).block,2,'starting guard is granted once');
for(const depth of [2,5,8,11,14,17]) {
  const turtle=durableEnemy();turtle.companions=['moss'];turtle.killed=depth;
  r.dealDamage(turtle,1000);
  const guard=turtle.block;
  assert.equal(guard,depth===17?3:2,'Moss keeps supplying guard throughout the run');
  r.dealDamage(turtle,1000);assert.equal(turtle.block,guard,'repeat damage cannot pay guard again');
  r.spawnNext(turtle);turtle.enemy.kind='orc';turtle.pressure=.5;
  assert.equal(r.enemyStrike(turtle),0,'each refill covers at least one normal attack at its depth');
  assert.equal(turtle.block,guard-r.guardCost(turtle.killed));
}
for(const biome of ['plains','forest','snow','dungeon']) {
  const crew=r.newRun(0,Infinity,biome,0,c.COMPANIONS.map(p=>p.id));crew.resMult=2;
  for(let depth=0;depth<20;depth++) {r.spawnNext(crew);r.dealDamage(crew,10000,true);}
  assert.equal(crew.block,15,'Moss grants 15 total guard over a full run');
  assert.deepEqual(crew.resources,{wood:15,ore:15,treasure:0,keys:4},'fixed rewards stack without item multiplication');
}
// Saved recruitment and camp routines work for the expanded roster in both screen shapes.
const saves=await import(url('run-save')), motion=await import(url('companion-motion'));
const turtleCheckpoint={version:1,run:r.newRun(0,Infinity,'plains',0,['moss']),grid:portrait,items:Array(6).fill(null),pendingChest:null,buffs:{}};
turtleCheckpoint.run.killed=3;turtleCheckpoint.run.block=0;
for(let reload=0;reload<3;reload++) {
  turtleCheckpoint.run=saves.readCheckpoint({biome:'plains',activeRun:turtleCheckpoint}).run;
  assert.equal(turtleCheckpoint.run.block,0,'reloading does not restore spent starting or periodic guard');
}
r.spawnNext(turtleCheckpoint.run);r.dealDamage(turtleCheckpoint.run,1000);
assert.equal(turtleCheckpoint.run.block,0,'next refill still waits for the sixth defeat');
for(const pet of c.COMPANIONS) {
  const checkpoint={version:1,run:{...r.newRun(),companions:[pet.id]},grid:portrait,items:Array(6).fill(null),pendingChest:null,buffs:{},rescue:{rolledDepth:5,encountered:true,pending:pet.id}};
  assert.equal(saves.readCheckpoint({biome:'plains',activeRun:checkpoint}).rescue.pending,pet.id);
  for(const [width,height] of [[320,330],[393,380],[820,500]]) {
    const layout={width,height,cart:{x:width*.2,y:height*.1,width:width*.76,expanded:false}};
    const positions=new Set();
    for(let t=0;t<100;t+=.5) {
      const pose=motion.petCampPose(pet.id,t,layout);positions.add(`${Math.round(pose.x)},${Math.round(pose.y)}`);
      assert.ok(Number.isFinite(pose.x)&&Number.isFinite(pose.y));
      assert.ok(pose.x>=22&&pose.x<=width-22,`${pet.id} left screen`);
    }
    assert.ok(positions.size>5,`${pet.id} should move around camp`);
  }
}
console.log('Empowered damage, rotation/save continuity, and companion rescue/reward checks passed.');
