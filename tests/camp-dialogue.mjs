import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Dialogue selection must never introduce a recruit before they join the cart.
const js = ts.transpileModule(readFileSync(new URL('../src/camp-dialogue.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { CAMP_CHAT, CAMP_INTRO, availableCampChat } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
assert.equal(new Set(CAMP_CHAT.map(c => c.id)).size, CAMP_CHAT.length);
assert.ok(CAMP_CHAT.length >= 30);
for (const biome of ['plains', 'forest', 'snow', 'dungeon']) {
  for (let mask = 0; mask < 8; mask++) {
    const meta = { biome, peddlerArrived: !!(mask & 1), blacksmithHired: !!(mask & 2), wizardHired: !!(mask & 4) };
    const allowed = new Set(['player', 'quests', ...(meta.peddlerArrived ? ['shop'] : []),
      ...(meta.blacksmithHired ? ['forge'] : []), ...(meta.wizardHired ? ['magic'] : [])]);
    const pool = availableCampChat(meta);
    assert.ok(pool.length >= 8, 'the initial camp has variety even with no recruits');
    for (const chat of pool) {
      assert.ok(!chat.biome || chat.biome === biome);
      assert.ok(chat.lines.every(([who, text]) => allowed.has(who) && text.length > 0));
    }
    if (mask === 7) assert.ok(pool.some(c => new Set(c.lines.map(l => l[0])).size >= 4));
  }
}
assert.ok(CAMP_INTRO.every(([who]) => who === 'player' || who === 'quests'));
console.log('Camp dialogue: all 32 biome/crew combinations, unique conversations, ensemble variety and first-arrival speakers passed.');
