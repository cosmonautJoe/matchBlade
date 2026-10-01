import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/board.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { makeInitialGrid, findMatches, findHint, swap, collapseAndRefill, EMPTY } =
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

// Run the production resize methods against a minimal rendering stub. A rotation
// must preserve cell positions and pending moves, even with a cascade or boss active.
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', main, ts.ScriptTarget.Latest, true);
const scene = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'GameScene');
const methods = scene.members.filter(n => ['layout', 'layoutWide', 'applyCenterView'].includes(n.name?.getText(ast)))
  .map(n => n.getText(ast)).join('\n');
const layoutModule = `
const GRID_W=644, GRID_X=8, GRID_Y=318, LANE_H=300, LANE_Y=8, UI_W=644;
const Phaser={Math:{Clamp:(v,lo,hi)=>Math.max(lo,Math.min(hi,v))}};
export class LayoutHarness {
  get boardWidth(){return this.boardCols*92;}
  get boardHeight(){return this.boardRows*92;}
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
    safeInsets:()=>({l:0,r:0,t:0,b:0}),
    layoutBossBar:()=>{}, layoutPanels:()=>{}, refreshHud:()=>{}, worldFont:()=>15,
    centerBox:stub(), puzzleBox:stub(), runProgressRect:stub(), laneGuard:stub(),
    defBadge:stub(), laneMutes:[], add:{graphics:()=>stub()}, time:{delayedCall:()=>{}},
  });
  for (let i=0; i<100; i++) {
    view.busy=i%3===0; view.arenaActive=i%3===1;
    view.scale=i%2 ? {width:844,height:390} : {width:393,height:704};
    view.layout();
    assert.equal(view.grid, grid, 'resize cannot replace the board');
    assert.equal(view.boardCols, cols);
    assert.equal(view.boardRows, rows);
    assert.equal(view.down, pendingMove, 'resize cannot cancel a pending move');
    const left=view.puzzleBox.x+8*view.puzzleScale;
    const top=view.puzzleBox.y+318*view.puzzleScale;
    assert.ok(left>=0 && left+cols*92*view.puzzleScale<=view.scale.width);
    assert.ok(top>=0 && top+rows*92*view.puzzleScale<=view.scale.height);
  }
}
console.log('Rotation regression passed: 200 resizes preserve board shape, cells and pending moves.');
