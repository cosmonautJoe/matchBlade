# Caravan artwork

`starter.png` and `expanded.png` are transparent vehicle assets. They contain no scenery or characters. Keep them independent of biome backgrounds.

The original approved concept and generated source files remain in the Codex generated-images folder. These project copies are used at runtime.

`src/caravan.ts` owns the vehicle's logical coordinates, NPC layers, unlock indicators and independent fitting. `CampScene` supplies biome art and the existing service actions/save state. The existing village art remains available via the development-only `?village-preview` route; the roadside camp via `?legacy-camp`.

Progression: starter wagon → workshop caravan when the smith joins → mage fills the reserved study when recruited. Recruitment is read from MetaState, so the same caravan follows the player across environments. No separate vehicle save or reset is introduced.

Art source: generated with the image-generation tool from the approved caravan concept. Starter source `exec-c455a111-f540-47c9-88eb-4ea79328351b.png`; expanded source `exec-c5719e7d-c2ee-425e-ae55-80deb3a729e7.png`.

Development QA: `/tests/caravan-preview.html` renders the real component with disposable in-memory crew/biome fixtures. It never reads or writes the player's save. Test 393×852, 320×568, 852×393 and desktop; select each crew stage and biome, pause motion, and use keyboard focus to check room targets. The preview is not a production build entry.
