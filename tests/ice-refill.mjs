import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the actual scene's refill and movement methods, including tween
// cancellation: a logic-only full-grid check misses invisible replacement tiles.
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const sceneClass = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'GameScene');
const methods = sceneClass.members.filter(n => ['collapse', 'moveTo'].includes(n.name?.getText(ast)))
  .map(n => n.getText(ast)).join('\n');
const js = ts.transpileModule(`
  const EMPTY = -1, randomType = () => 4, settleTile = () => {};
  export class RefillHarness { ${methods} }
`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { RefillHarness } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

for (const [cols, rows] of [[7, 7], [10, 5]]) for (const frozenRow of [0, 2]) {
  const scene = new RefillHarness(), pending = new Set();
  let frozen = true;
  Object.assign(scene, {
    boardCols: cols, boardRows: rows,
    grid: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (r + c) % 7)),
    xFor: c => c * 92, yFor: r => r * 92,
    isIceLocked: ({ r, c }) => frozen && c === 2 && r === frozenRow,
    makeTile(r, c, type) {
      return { x: this.xFor(c), y: this.yFor(r), type, alpha: 1, scene,
        setAlpha(alpha) { this.alpha = alpha; return this; } };
    },
    tweens: {
      killTweensOf(target) { for (const tween of pending) if (tween.targets === target) pending.delete(tween); },
      add(tween) { pending.add(tween); }
    }
  });
  scene.tiles = scene.grid.map((row, r) => row.map((type, c) => scene.makeTile(r, c, type)));
  const clear = r => { scene.grid[r][2] = -1; scene.tiles[r][2] = null; };
  const settle = async () => {
    const done = scene.collapse();
    for (const tween of [...pending]) {
      for (const key of ['x', 'y', 'alpha']) if (key in tween) tween.targets[key] = tween[key];
      pending.delete(tween);
      tween.onComplete?.();
    }
    await done;
    scene.tiles.forEach((row, r) => row.forEach((tile, c) => {
      assert.ok(tile, 'every cell has a tile');
      assert.equal(tile.alpha, 1, `refill visible at ${r},${c} below ice row ${frozenRow} (${cols}×${rows})`);
      assert.equal(tile.type, scene.grid[r][c]);
      assert.equal(tile.x, scene.xFor(c));
      assert.equal(tile.y, scene.yFor(r));
    }));
  };
  const held = scene.tiles[frozenRow][2];
  for (let r = frozenRow + 1; r < Math.min(rows, frozenRow + 4); r++) clear(r);
  if (frozenRow > 0) clear(0);
  await settle();
  assert.equal(scene.tiles[frozenRow][2], held, 'ice holds its original tile while both sides refill');
  frozen = false;
  clear(rows - 1);
  await settle();
  assert.equal(scene.tiles[frozenRow + 1][2], held, 'thawed tile falls on the next clear');
}
console.log('Ice refill: visible replacements, anchored ice and falling after thaw pass in both board shapes.');
