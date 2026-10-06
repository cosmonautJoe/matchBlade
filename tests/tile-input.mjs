import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,
  {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const read = file => readFileSync(new URL(`../src/${file}.ts`,import.meta.url),'utf8');
const boardUrl = moduleUrl(read('board')), dragUrl = moduleUrl(read('tile-drag'));
const {findMatches} = await import(boardUrl);
// Exercise the actual scene input handlers and swap validation, without a renderer.
const source = ts.createSourceFile('main.ts',read('main'),ts.ScriptTarget.Latest,true);
const game = source.statements.find(s => ts.isClassDeclaration(s) && s.name?.text === 'GameScene');
const names = ['xFor','yFor','cellAt','buildInput','previewTileDrag','clearSelection','releaseTilePress','trySwap'];
const methods = names.map(name => {
  const member = game.members.find(m => m.name?.getText(source) === name);
  assert.ok(member, `Missing scene method: ${name}`);
  return member.getText(source);
}).join('\n');
const {InputHarness} = await import(moduleUrl(`
  import {TileSwapPreview,dragSwapTarget} from '${dragUrl}';
  import {swap,findMatches,hasPossibleMove} from '${boardUrl}';
  const TILE=92, GRID_X=8, GRID_Y=318, SLOT_N=6;
  const Phaser={Scenes:{Events:{PAUSE:'pause',SHUTDOWN:'shutdown'}},Core:{Events:{BLUR:'blur'}}};
  const liftTile=()=>{};
  export class InputHarness { ${methods} }
`));
const {TileSwapPreview} = await import(dragUrl);
const noop = () => {};
function harness(cols,rows,scale) {
  const scene = new InputHarness(), handlers = new Map();
  const tile = (r,c) => ({scene, x:8+(c+.5)*92, y:318+(r+.5)*92,
    parentContainer:{moveAbove:noop}, setPosition(x,y){this.x=x;this.y=y;return this;}});
  Object.assign(scene, {
    boardCols:cols,boardRows:rows,puzzleScale:scale,puzzleBox:{x:12,y:47},
    grid:Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>(r+c*2)%7)),
    tiles:Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>tile(r,c))),
    run:{over:false},empowered:{moves:0},
    selection:{setVisible(){return this;},setPosition(){return this;}},
    input:{on:(event,fn)=>handlers.set(event,fn)},events:{on:noop,once:noop},
    game:{events:{on:noop},canvas:{addEventListener:noop}},
    tweens:{killTweensOf:noop,add({targets,x,y,onComplete}){targets.setPosition(x,y);onComplete?.();}},
    clearHint:noop,sfx:noop,isIceLocked:()=>false,
    moveTo:async(t,r,c)=>t.setPosition(scene.xFor(c),scene.yFor(r)),
    resolve:async()=>{scene.matches=findMatches(scene.grid);},
    animatedReshuffle:async()=>assert.fail('Unexpected reshuffle'),
  });
  scene.grid[0][2]=scene.grid[0][3]=scene.grid[1][4]=1;
  scene.grid[0][4]=2;
  assert.equal(findMatches(scene.grid).length,0,'fixture starts without matches');
  scene.swapPreview=new TileSwapPreview(scene);
  const swap=scene.trySwap.bind(scene);
  scene.trySwap=(a,b)=>scene.pending=swap(a,b);
  scene.buildInput();
  const point=(c,r)=>({x:12+(8+(c+.5)*92)*scale,y:47+(318+(r+.5)*92)*scale,
    id:0,wasTouch:true,isDown:true,wasCanceled:false});
  return {scene,point,async drag(from,to,canceled=false){
    handlers.get('pointerdown')(from);
    handlers.get('pointermove')(to);
    handlers.get('pointerup')({...to,isDown:false,wasCanceled:canceled});
    await scene.pending;
  }};
}

for(const [cols,rows,scale] of [[7,7,.59],[7,7,1],[10,5,.82]]) {
  for(const upward of [true,false]) {
    const h=harness(cols,rows,scale);
    await h.drag(h.point(4,upward?1:0),h.point(4,upward?0:1));
    assert.ok(h.scene.matches?.some(m=>m.dir==='h' && m.cells.every(c=>c.r===0)),
      `Top-row match works ${upward?'upward':'downward'} at ${cols}x${rows}`);
  }
  const edge=harness(cols,rows,scale);
  // Release four design pixels above the first row: a small finger overshoot.
  await edge.drag(edge.point(4,1),edge.point(4,-.5-4/92));
  assert.ok(edge.scene.matches?.length,'Small overshoot above top row must still finish the upward match');

  for(const [endRow,canceled] of [[-1.2,false],[0,true]]) {
    const h=harness(cols,rows,scale), before=structuredClone(h.scene.grid);
    await h.drag(h.point(4,1),h.point(4,endRow),canceled);
    assert.deepEqual(h.scene.grid,before,'Far-off-board release or canceled touch must not swap');
    assert.equal(h.scene.matches,undefined);
  }
}
console.log('Tile input: top-row matches in both directions, edge overshoot, cancellation and both board layouts passed.');
