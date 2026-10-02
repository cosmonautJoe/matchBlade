import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/board.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { makeInitialGrid, findMatches, findHint, swap, collapseAndRefill, EMPTY, reflowBoard } =
  await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
let seed = 421;
const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 2 ** 32);

for (const [cols, rows] of [[7, 7], [10, 5]]) {
  for (let round = 0; round < 50; round++) {
    const g = makeInitialGrid(random, cols, rows);
    assert.equal(g.length, rows);
    assert.ok(g.every(row => row.length === cols));
    assert.equal(findMatches(g).length, 0);
    const hint = findHint(g);
    if (hint) {
      swap(g, hint.a, hint.b);
      const matches = findMatches(g);
      assert.ok(matches.length);
      for (const match of matches) for (const {r, c} of match.cells) g[r][c] = EMPTY;
      collapseAndRefill(g, random);
      assert.ok(!g.flat().includes(EMPTY));
    }
  }
}

// Matches and refill must include the landscape-only rightmost columns.
const edge = Array.from({length: 5}, (_, r) => Array.from({length: 10}, (_, c) => (r + c) % 6));
edge[0][9] = edge[1][9] = edge[2][9] = 7;
assert.ok(findMatches(edge).some(m => m.cells.some(c => c.c === 9) && m.len === 3));
edge[4][9] = EMPTY;
collapseAndRefill(edge, random);
assert.notEqual(edge[4][9], EMPTY);
console.log('Board layout checks passed: 7×7, 10×5, matching and refill.');

const bagOf = (grid, reserve) => [...grid.flat(), ...(grid.length === 7 ? [reserve] : [])].sort();
for (const [cols, rows] of [[7,7], [10,5]]) for (let round=0; round<500; round++) {
  const original=makeInitialGrid(random,cols,rows);
  let current=original, layouts={};
  for (let i=0; i<6; i++) {
    const next=reflowBoard(current,current.length===7,layouts);
    assert.ok(next, 'stable boards can reflow');
    const reserve=current.length===7 ? next.layouts.reserve : layouts.reserve;
    assert.deepEqual(bagOf(next.grid,next.layouts.reserve),bagOf(current,reserve), 'rotation conserves all 50 tiles including the reserve');
    assert.equal(findMatches(next.grid).length,0,'rotation grants no matches');
    assert.ok(findHint(next.grid),'reflow must leave a legal move');
    current=next.grid; layouts=JSON.parse(JSON.stringify(next.layouts)); // save/load also preserves arrangements
    if(i%2) assert.deepEqual(current,original,'rotating back restores exact cells');
  }
  const hint=findHint(current); swap(current,hint.a,hint.b);
  for(const match of findMatches(current)) for(const {r,c} of match.cells) current[r][c]=EMPTY;
  collapseAndRefill(current,random);
  while(findMatches(current).length) {
    for(const match of findMatches(current)) for(const {r,c} of match.cells) current[r][c]=EMPTY;
    collapseAndRefill(current,random);
  }
  const afterMove=reflowBoard(current,current.length===7,layouts);
  assert.ok(afterMove);
  const back=reflowBoard(afterMove.grid,current.length!==7,afterMove.layouts);
  assert.deepEqual(back.grid,current,'returning after play must never resurrect consumed tiles');
}
console.log('Reflow checks passed: 1,000 tile bags, round trips, legal moves, completed matches and serialized layout memory.');

// Run the production resize methods against a minimal rendering stub. A rotation
// must defer reflow while a cascade or boss is active, then fit the new board.
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', main, ts.ScriptTarget.Latest, true);
const scene = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'GameScene');
const methods = scene.members.filter(n => ['layout', 'layoutWide', 'applyCenterView', 'syncBoardOrientation'].includes(n.name?.getText(ast)))
  .map(n => n.getText(ast)).join('\n');
const layoutModule = `
${js}
const GRID_W=644, GRID_X=8, GRID_Y=318, LANE_H=300, LANE_Y=8, UI_W=644;
const HERO_SCALE=3.15, PLAYER_DENSITY=1;
const Phaser={Math:{Clamp:(v,lo,hi)=>Math.max(lo,Math.min(hi,v))}};
export class LayoutHarness {
  get boardWidth(){return this.boardCols*92;}
  get boardHeight(){return this.boardRows*92;}
  get boardCenter(){return 8+this.boardWidth/2;}
  ${methods}
}`;
const layoutJs = ts.transpileModule(layoutModule, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const {LayoutHarness} = await import(`data:text/javascript;base64,${Buffer.from(layoutJs).toString('base64')}`);
const display = () => new Proxy({}, { get: (object, key) => {
  if (key in object) return object[key];
  if (key === 'setPosition') return (x, y) => { object.x=x; object.y=y; return object.proxy; };
  if (key === 'setScale') return scale => { object.scale=scale; return object.proxy; };
  return () => object.proxy;
}});
const stub = () => { const d=display(); d.proxy=d; return d; };
for (const [cols, rows] of [[7, 7], [10, 5]]) {
  const view = new LayoutHarness();
  const grid = Object.freeze(makeInitialGrid(random, cols, rows).map(row => Object.freeze(row)));
  const pendingMove = Object.freeze({r: 1, c: 2});
  Object.assign(view, {
    boardCols:cols, boardRows:rows, grid, down:pendingMove, selected:pendingMove,
    boardLayouts:{}, boardFrame:stub(), run:{}, tiles:grid.map(row=>row.map(()=>stub())),
    makeTile:()=>stub(), clearHint:()=>{}, clearSelection:()=>{},
    safeInsets:()=>({l:0,r:0,t:0,b:0}),
    layoutBossBar:()=>{}, layoutLaneBackdrop:()=>{}, layoutPanels:()=>{}, refreshHud:()=>{}, worldFont:()=>15,
    hero:stub(),
    centerBox:stub(), puzzleBox:stub(), runProgressRect:stub(), laneGuard:stub(),
    defBadge:stub(), laneMutes:[], add:{graphics:()=>stub()}, time:{delayedCall:()=>{}},
  });
  for (let i=0; i<100; i++) {
    view.busy=i%3===0; view.arenaActive=i%3===1;
    view.scale=i%2 ? {width:844,height:390} : {width:393,height:704};
    const previousGrid=view.grid;
    view.layout();
    if(view.busy || view.arenaActive) assert.equal(view.grid,previousGrid,'active moves/challenges defer reflow');
    else {
      assert.equal(view.boardCols,view.scale.width>view.scale.height?10:7);
      assert.equal(findMatches(view.grid).length,0);
    }
    const left=view.puzzleBox.x+8*view.puzzleScale;
    const top=view.puzzleBox.y+318*view.puzzleScale;
    assert.ok(left>=0 && left+view.boardCols*92*view.puzzleScale<=view.scale.width);
    assert.ok(top>=0 && top+view.boardRows*92*view.puzzleScale<=view.scale.height);
  }
}
console.log('Rotation regression passed: 200 resizes reflow stable boards, defer busy boards and stay inside the viewport.');
