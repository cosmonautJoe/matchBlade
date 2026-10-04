# Player artwork

The game uses the original `warrior.png` sprite sheet: 80×64 cells, 16 columns, with feet anchored at y=47. Camp, regular combat, and bosses all share it through `src/player-art.ts`.

Original animations and timing are restored: idle 0–7 at 8 fps, run 48–55 at 15 fps, attacks 144–150 / 160–164 / 176–183 at 18 fps, spell 192–207 at 18 fps, and defeat 368–374 at 10 fps.

`player-caravan.png` and `player-rig.png` are unused experiments retained for reference. Neither is loaded by the game.

Development preview: `/tests/player-preview.html` provides playback, frame stepping, pose strips, and chained attacks using the original artwork.
