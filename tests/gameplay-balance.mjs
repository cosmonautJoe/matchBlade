import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const cache = new Map();
function url(name) {
  if (cache.has(name)) return cache.get(name);
  let js = ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'),
    {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  js = js.replace(/import ["'][^"']+\.css["'];/g, '');
  js = js.replace(/from ["']\.\/([^"']+)["']/g, (_, dep) => `from "${url(dep)}"`);
  const encoded = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
  cache.set(name, encoded); return encoded;
}
globalThis.localStorage = {getItem:()=>null,setItem:()=>{}};
const run = await import(url('run')), meta = await import(url('meta'));
const board = await import(url('board')), items = await import(url('items'));
const {campGoal} = await import(url('run-advice'));
const {combatCue} = await import(url('combat-readout'));
const {activeItemEffects} = await import(url('active-effects'));
const effectBuffs = {freezeLeft:0,hornLeft:0,ledgerLeft:0,burnLeft:0,burnAcc:0,
  skeletonCharges:0,panCharges:0,spursActive:false,inkActive:false,bossChestNext:false};
assert.deepEqual(activeItemEffects(run.newRun(),effectBuffs,[],[],false),[]);
const effectRun=run.newRun(); effectRun.pierceMult=.5; effectRun.bellCharges=2; effectRun.whetstone=3; effectRun.block=6;
const effects=activeItemEffects(effectRun,{...effectBuffs,freezeLeft:.2,hornLeft:15,ledgerLeft:20,burnLeft:4,
  skeletonCharges:2,panCharges:1,spursActive:true,inkActive:true},['hearth','hearth'],['👾','📦','☠'],true);
assert.equal(effects.length,13,'all ongoing item effects, revive and shared guard are represented');
assert.equal(effects.find(e=>e.id==='waystone').status,'1s · paused');
assert.equal(effects.find(e=>e.id==='wardbell').status,'2 saves');
assert.equal(effects.find(e=>e.id==='wardsalve').status,'This run');
assert.equal(effects.find(e=>e.id==='hearth').status,'2 ready');
assert.equal(effects.find(e=>e.id==='ink').status,'👾 → 📦 → ☠');
assert.equal(activeItemEffects(run.newRun(),effectBuffs,[],[],false).length,0,'expired and spent effects disappear');
console.log('Active effects: timers, paused state, charges, boss protection, revive, forecast and expiration passed.');
let m=meta.defaultMeta();
assert.equal(meta.unlockForge(m),false);
m.wood=20; m.ore=20;
assert.equal(campGoal(m).ready,true);
assert.equal(meta.unlockForge(m),true);
assert.deepEqual([m.wood,m.ore,m.swordLevel],[0,0,1]);
assert.equal(meta.unlockForge(m),false,'cannot buy the forge twice');
assert.equal(meta.migrateMeta({...m,swordLevel:0}).swordLevel,1,'existing smith owners get included level');
const before=run.newRun(),after=run.newRun(1);
assert.equal(run.applyMatches(before,{0:3}).damage,5);
assert.equal(run.applyMatches(after,{0:3}).damage,10);
assert.equal(run.attackInterval(before),6000);
before.killed=8; assert.equal(run.attackInterval(before),4800);
assert.ok(run.roadScrollRate(run.newRun()) < run.roadScrollRate(before));
let s=run.newRun(0,6,'forest'); s.killed=1; s.enemy=run.makeEnemy(1,'forest');
assert.equal(s.enemy.variant,'mushroom');
const first=run.enemyStrike(s), second=run.enemyStrike(s);
assert.ok(second>first,'unblocked spores strengthen the next attack');
assert.equal(s.enemy.spores,2);
s.block=1; run.enemyStrike(s); assert.equal(s.enemy.spores,2,'full block adds no spores');
s.enemy.hp=100;
run.applyMatches(s,{1:3}); assert.equal(s.enemy.spores,0,'staff matches clear spores');
assert.match(combatCue(s).tip,/Staves clear spores/);
const checkpoint=JSON.parse(JSON.stringify(s));
assert.equal(checkpoint.enemy.spores,0,'spores survive checkpoint serialization');
s.enemy=run.makeEnemy(0,'forest'); assert.equal(s.enemy.defense,'ward');
assert.match(combatCue(s).tip,/Match swords/);
s.enemy=run.makeEnemy(1,'plains'); assert.equal(s.enemy.spores,undefined);
let seed=8421;
const rng=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
for (const slots of [0,1,6]) for(let i=0;i<200;i++) {
  const pulls=items.rollChestPulls(3,slots,false,rng);
  assert.equal(pulls.length,3);
  assert.ok(pulls.some(p=>p.kind==='wood'||p.kind==='ore'));
  assert.ok(pulls.filter(p=>p.kind==='item').length<=slots);
}
console.log('Forge purchase/migration, first upgrade damage, early pacing, forest counters and chest guarantees passed.');

// Repeatable balance probe using actual board/run rules. This is a greedy bot,
// NOT a claim about human completion rates. Excludes bosses and active items.
function countsFor(grid) {
  const cells=new Set(board.findMatches(grid).flatMap(m=>m.cells.map(p=>`${p.r},${p.c}`)));
  const counts={};
  for(const key of cells){const [r,c]=key.split(',').map(Number);counts[grid[r][c]]=(counts[grid[r][c]]??0)+1;}
  return {cells,counts};
}
function probe(level, biome, cols, rows, trial) {
  seed=1000+trial;
  const s=run.newRun(level,biome==='forest'?6:3,biome);
  let grid=board.makeInitialGrid(rng,cols,rows),time=0,clock=0,moves=0,slots=6,chests=0;
  const tick=(seconds)=>{
    if(!s.enemy)return;
    run.scroll(s,run.roadScrollRate(s)*seconds); clock+=seconds*1000;
    while(clock>=run.attackInterval(s)&&!s.over){clock-=run.attackInterval(s);run.enemyStrike(s);}
    time+=seconds;
  };
  while(!s.over&&s.killed<9&&moves<180) {
    let best=null;
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)for(const [dr,dc] of [[0,1],[1,0]]){
      const a={r,c},b={r:r+dr,c:c+dc};if(b.r>=rows||b.c>=cols)continue;
      board.swap(grid,a,b);const {counts}=countsFor(grid);board.swap(grid,a,b);
      if(!Object.keys(counts).length)continue;
      const copy=structuredClone(s),out=run.applyMatches(copy,counts);
      const value=Math.min(out.damage,s.enemy?.hp??0)*2+(out.killed?12:0)
        +out.guard*(s.block<3?5:.5)+out.gained.keys*(s.resources.keys<2?4:.5)
        +out.gained.wood+out.gained.ore+out.gained.treasure*.5;
      if(!best||value>best.value)best={a,b,value};
    }
    if(!best){grid=board.makeInitialGrid(rng,cols,rows);continue;}
    // 3 seconds to find a move, 1 second to swap and resolve the first wave.
    tick(4); if(s.over)break;
    board.swap(grid,best.a,best.b);moves++;
    let waves=0;
    for(;;){
      const {cells,counts}=countsFor(grid);if(!cells.size)break;
      if(waves++)tick(.7);
      if(s.over)break;
      run.applyMatches(s,counts);
      for(const cell of cells){const [r,c]=cell.split(',').map(Number);grid[r][c]=board.EMPTY;}
      board.collapseAndRefill(grid,rng);
    }
    if(!s.enemy&&!s.over){
      if(s.killed%3===0&&slots>0&&s.resources.keys>0){
        s.resources.keys--;chests++;
        const count=2+(rng()<.6?1:0)+(rng()<.32?1:0)+(rng()<.16?1:0);
        for(const p of items.rollChestPulls(count,slots,false,rng)) {
          if(p.kind==='item')slots--;else s.resources[p.kind]+=p.n;
        }
        time+=6;
      }
      s.enemy=run.makeEnemy(s.killed,biome,rng);clock=0;time+=2;
    }
    // Real potion taps consume a tile, with gravity/refill and subsequent matches.
    // Leave potions untouched here: this intentionally omits their safety benefit.
  }
  return {depth:s.killed,seconds:time,wood:s.resources.wood,ore:s.resources.ore,gems:s.resources.treasure,chests};
}
for(const [biome,level] of [['plains',0],['plains',1],['forest',3]])for(const [cols,rows] of [[7,7],[10,5]]){
  const runs=Array.from({length:60},(_,i)=>probe(level,biome,cols,rows,i));
  const avg=k=>Math.round(runs.reduce((a,r)=>a+r[k],0)/runs.length*10)/10;
  console.log(JSON.stringify({biome,level,board:`${cols}x${rows}`,reachedBoss:runs.filter(r=>r.depth>=9).length+'/60',meanDepth:avg('depth'),seconds:avg('seconds'),wood:avg('wood'),ore:avg('ore'),gems:avg('gems')}));
}
