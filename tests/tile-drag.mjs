import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(readFileSync(new URL('../src/tile-drag.ts',import.meta.url),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {TileSwapPreview,dragSwapTarget}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const origin={r:3,c:3};
assert.equal(dragSwapTarget(origin,5,8,92,7,7),null,'a tap or pulled-back drag cannot commit');
assert.deepEqual(dragSwapTarget(origin,48,5,92,7,7),{r:3,c:4});
assert.deepEqual(dragSwapTarget(origin,-3,-48,92,7,7),{r:2,c:3});
assert.deepEqual(dragSwapTarget({r:2,c:8},45,0,92,10,5),{r:2,c:9},'landscape keeps adjacent swaps');
assert.equal(dragSwapTarget({r:0,c:0},-50,0,92,7,7),null,'cannot preview off the board');
assert.deepEqual(dragSwapTarget(origin,400,20,92,7,7),{r:3,c:4},'a long swipe moves only one cell');

// Exercise preview retargeting and interruption without a renderer or changing game saves.
const pending=new Map();
const scene={tweens:{killTweensOf:tile=>pending.delete(tile),add:({targets,x,y,onComplete})=>pending.set(targets,{x,y,onComplete})}};
const finish=()=>{for(const [tile,p] of pending){tile.setPosition(p.x,p.y);p.onComplete?.();}pending.clear();};
const tile=(x,y)=>({scene, x,y, parentContainer:{moveAbove(){}}, setPosition(x,y){this.x=x;this.y=y;return this;}});
const a=tile(0,0), b=tile(92,0), c=tile(0,92);
const positions=()=>[a,b,c].map(({x,y})=>[x,y]);
const home=[[0,0],[92,0],[0,92]];
const preview=new TileSwapPreview(scene);
preview.show(a,b,{x:0,y:0},{x:92,y:0});finish();
assert.ok(a.x>0&&a.x<92&&b.x>0&&b.x<92,'preview is visibly partial');
preview.show(a,c,{x:0,y:0},{x:0,y:92});finish();
assert.deepEqual([b.x,b.y],[92,0],'previous neighbor returns when direction changes');
preview.cancel(true);
assert.deepEqual(positions(),home,'interruption restores every displaced tile');
assert.equal(pending.size,0,'cancellation leaves no competing position tween');

preview.show(a,b,{x:0,y:0},{x:92,y:0});finish();
const beforeRelease=positions();
preview.commit(a,b);
assert.deepEqual(positions(),beforeRelease,'release continues from visible positions, without snapping');
assert.equal(pending.size,0,'the real swap takes sole control of movement');

a.setPosition(0,0);b.setPosition(92,0);
preview.show(a,b,{x:0,y:0},{x:92,y:0});finish();
preview.cancel();finish();
assert.deepEqual(positions(),home,'pulling back restores the unswapped board');
preview.show(a,b,{x:0,y:0},{x:92,y:0});finish();
preview.cancel(); // a return animation has begun, then the user pauses or rotates
preview.cancel(true);
assert.deepEqual(positions(),home,'interrupted return animations restore the board immediately');
assert.equal(pending.size,0);
console.log('Drag preview: threshold, edges, both layouts, retargeting, cancellation and release continuity passed.');
