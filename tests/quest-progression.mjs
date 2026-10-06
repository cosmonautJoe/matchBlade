import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const modules=new Map();
function url(name) {
  if(modules.has(name))return modules.get(name);
  let code=ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`,import.meta.url),'utf8'),
    {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  code=code.replace(/from ["']\.\/([^"']+)["']/g,(_,dep)=>`from "${url(dep)}"`);
  const value=`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;modules.set(name,value);return value;
}
const storage=new Map();let writes=0;
globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>{writes++;storage.set(key,value);}};
const m=await import(url('meta')), a=await import(url('achievements')), pets=await import(url('companions'));
let save=m.defaultMeta();
m.prepareCampProgress(save);
assert.deepEqual(save.active.map(q=>q.id),['slay25','chests5','wood60']);
const initialWrites=writes;m.prepareCampProgress(save);assert.equal(writes,initialWrites,'idle refresh does not keep saving');
m.bankRun(save,{wood:20,ore:3,treasure:0,kills:10,chests:1});
assert.equal(m.prepareCampProgress(save).paid.length,0,'partial quests stay active');
m.bankRun(save,{wood:40,ore:3,treasure:0,kills:15,chests:4});
assert.equal(save.treasure,0,'quest rewards wait for camp');
const beforeSettlement=writes, receipt=m.prepareCampProgress(save);
assert.equal(writes,beforeSettlement+1,'payment, replacement quests and badges save atomically');
assert.equal(receipt.paid.length,3);assert.equal(save.treasure,30);
assert.deepEqual(save.active.map(q=>q.id),['hire','depth10','slay60']);
assert.equal(save.active.find(q=>q.id==='slay60').base,25);
assert.equal(m.questProgress(save,save.active.find(q=>q.id==='depth10')).have,0,'new run objectives do not use an earlier run');
assert.ok(save.achievements.includes('first-quest'));
save=m.loadMeta();m.prepareCampProgress(save);assert.equal(save.treasure,30,'reload cannot duplicate payouts');
assert.equal(save.progressNotice.quests.length,3,'unseen receipt survives reload');
m.acknowledgeProgress(save);assert.deepEqual(m.loadMeta().progressNotice,{quests:[],achievements:[]});
save.wood=100;save.ore=100;assert.equal(m.unlockForge(save),true);
assert.deepEqual(m.prepareCampProgress(save).paid.map(q=>q.id),['hire'],'camp upgrades settle their own quests');
assert.equal(save.treasure,45);assert.ok(save.achievements.includes('forge'));
m.prepareCampProgress(save);assert.equal(save.treasure,45);
// Checkpointed runs keep their original quest baselines and no payment occurs mid-run.
save.activeRun={version:1};save.slain=999;
const active=JSON.stringify(save.active), currency=save.treasure;
assert.equal(m.prepareCampProgress(save).paid.length,0);assert.equal(JSON.stringify(save.active),active);assert.equal(save.treasure,currency);
delete save.activeRun;
// Every road keeps its own slots, counters and single-run objectives.
assert.deepEqual(m.unlockedBiomes(m.defaultMeta()),['plains']);
assert.equal(m.travelToBiome(m.defaultMeta(),'forest'),false,'a locked road cannot be entered');
save.clearedBiomes=['plains'];
save.companions=['pip'];save.stockedItems=['ward'];save.wizardHired=true;save.staffLevel=2;
const carried=structuredClone(m.currentQuests(save));
const plainsProgress=carried.map(q=>m.questProgress(save,q));
assert.equal(m.advanceBiome(save),true);
assert.deepEqual(m.currentQuests(save,'plains'),carried);
assert.deepEqual(m.currentQuests(save).map(q=>q.id),['f_slay50','f_chests10','f_wood120']);
assert.equal(save.active.length,6,'old quests do not consume destination slots');
const live={wood:35,ore:9,kills:12,chests:2};
assert.deepEqual(carried.map(q=>m.questProgress(save,q,live)),plainsProgress,'live runs do not advance other roads');
m.bankRun(save,{...live,treasure:3});
assert.deepEqual(carried.map(q=>m.questProgress(save,q)),plainsProgress,'banked runs do not advance other roads');
assert.equal(save.fulfilledRuns.includes('depth10'),false,'forest run cannot fulfill plains depth objective');
assert.equal(m.questProgress(save,m.currentQuests(save)[0]).have,12);
const bank=[save.wood,save.ore,save.treasure];
assert.equal(m.travelToBiome(save,'plains'),true);
assert.deepEqual([save.wood,save.ore,save.treasure],bank);
assert.deepEqual(save.companions,['pip']);assert.deepEqual(save.stockedItems,['ward']);
assert.equal(save.staffLevel,2);assert.equal(save.wizardHired,true);
assert.deepEqual(m.currentQuests(save),carried);
assert.deepEqual(m.unlockedBiomes(save),['plains','forest']);
assert.equal(m.travelToBiome(save,'snow'),false);
save=m.loadMeta();assert.equal(save.active.length,6,'reload retains all zone boards');
assert.equal(m.travelToBiome(save,'forest'),true);
assert.equal(m.questProgress(save,m.currentQuests(save)[0]).have,12,'returning resumes progress');
const beforeBlocked=JSON.stringify(save);save.activeRun={version:1};
assert.equal(m.travelToBiome(save,'plains'),false,'travel cannot discard a suspended run');
delete save.activeRun;assert.equal(JSON.stringify(save),beforeBlocked);
save.clearedBiomes=['plains','forest','snow'];m.saveMeta(save);
assert.equal(m.travelToBiome(save,'dungeon'),true);assert.equal(m.travelToBiome(save,'plains'),true);
assert.deepEqual(m.unlockedBiomes(m.loadMeta()),[...m.BIOME_ORDER],'return trips never relock later areas');
// Older mixed-area saves keep earned progress, including completed-but-unpaid quests.
let legacy=m.migrateMeta({...m.defaultMeta(),zoneStats:undefined,biome:'forest',slain:120,chestsOpened:9,
  active:[{id:'slay25',base:100},{id:'f_slay50',base:110},{id:'chests5',base:0}]});
const progress=(state,id)=>m.questProgress(state,state.active.find(q=>q.id===id)).have;
assert.equal(progress(legacy,'slay25'),20);assert.equal(progress(legacy,'f_slay50'),10);
m.prepareCampProgress(legacy);assert.equal(legacy.treasure,0,'away-area rewards wait for that camp');
m.bankRun(legacy,{wood:0,ore:0,treasure:0,kills:5,chests:0});
assert.equal(progress(legacy,'slay25'),20);assert.equal(progress(legacy,'f_slay50'),15);
m.saveMeta(legacy);legacy=m.loadMeta();assert.equal(progress(legacy,'slay25'),20);
assert.equal(m.travelToBiome(legacy,'plains'),true);assert.equal(legacy.treasure,10);
m.bankRun(legacy,{wood:0,ore:0,treasure:0,kills:5,chests:0});
m.prepareCampProgress(legacy);assert.equal(legacy.treasure,20);
assert.equal(m.travelToBiome(legacy,'forest'),true);assert.equal(progress(legacy,'f_slay50'),15);
m.saveToSlot(2,legacy);assert.equal(m.loadFromSlot(2),true);
legacy=m.loadMeta();assert.equal(progress(legacy,'f_slay50'),15);
assert.equal(m.travelToBiome(legacy,'plains'),true);assert.equal(legacy.treasure,20,'travel/reload/slots cannot repeat rewards');
let forest=m.defaultMeta();forest.biome='forest';m.prepareCampProgress(forest);
assert.deepEqual(forest.active.map(q=>q.id),['f_slay50','f_chests10','f_wood120']);
// Old saves gain earned badges, preserve completed quests, and clean duplicate IDs.
const old=m.migrateMeta({...m.defaultMeta(),achievements:undefined,progressNotice:undefined,
  companions:pets.COMPANIONS.map(p=>p.id),blacksmithHired:true,wizardHired:true,slain:100,
  clearedBiomes:['plains','forest','snow','dungeon'],questsRewarded:m.PLAINS_QUESTS.map(q=>q.id)});
m.prepareCampProgress(old);assert.equal(old.achievements.length,a.ACHIEVEMENTS.length);
const oldGems=old.treasure;m.prepareCampProgress(old);assert.equal(old.treasure,oldGems);
m.saveToSlot(1,old);assert.equal(m.readSlot(1).meta.achievements.length,a.ACHIEVEMENTS.length);
assert.equal(m.defaultMeta().achievements.length,0,'new game resets badges with the rest of the save');
const dirty=m.migrateMeta({...old,active:[{id:'slay25',base:0},{id:'unknown',base:0}],achievements:['forge','forge','missing']});
assert.equal(dirty.active.length,0);assert.deepEqual(dirty.achievements,['forge']);
// Fresh-start fallback also handles a whole set of already-met upgrade objectives.
const upgraded=m.defaultMeta();upgraded.blacksmithHired=true;upgraded.swordLevel=3;
upgraded.questsRewarded=['slay25','chests5','wood60','depth10','slay60','ore80','chests12'];
m.prepareCampProgress(upgraded);
assert.ok(upgraded.questsRewarded.includes('hire')&&upgraded.questsRewarded.includes('forge2'));
assert.equal(upgraded.treasure,35);assert.deepEqual(upgraded.active.map(q=>q.id),['depth16']);
console.log('Automatic quests, area travel, isolated progress, legacy migration, rewards, achievements and save slots passed.');
