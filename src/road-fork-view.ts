import { roadOptions, ROAD_FORK_BONUS, ROAD_FORK_ENEMIES, type RoadChoice } from "./road-fork";
import "./road-fork.css";
import { resourceAmounts } from "./ui-resources";

/** A pocket-sized map, drawn on a fixed pixel grid to suit the game art. */
function drawFork(ctx: CanvasRenderingContext2D, biome: string, selected?: RoadChoice) {
  const snow = biome === "snow", underground = biome === "dungeon";
  ctx.clearRect(0, 0, 288, 102);
  ctx.fillStyle = underground ? "#33363d" : snow ? "#a5c2c3" : "#566c45";
  ctx.fillRect(0, 0, 288, 102);
  const rect = (color: string, x: number, y: number, w: number, h: number) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  for (let i = 0; i < 66; i++) rect(underground ? "#42434b" : snow ? "#cadcda" : "#6c7c4a", i * 47 % 286, i * 23 % 100, 3, 2);
  // Continuous branching tracks: both destinations connect to the incoming road.
  const path = (points: readonly (readonly number[])[], color: string, width: number) => {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.stroke();
  };
  const left = [[144, 104], [144, 76], [122, 62], [82, 52], [48, 33], [28, -5]];
  const right = [[144, 104], [144, 76], [166, 62], [205, 52], [236, 31], [260, -5]];
  for (const [id, points] of [["wood", left], ["ore", right]] as const) {
    path(points, "#34352e", 18);
    path(points, selected === id ? "#ddbd7a" : "#a99570", 12);
    path(points, selected === id ? "#f3db9d" : "#bdab85", 3);
  }
  const tree = (x: number, y: number) => {
    if (underground) { // Stored timber makes the wood route plausible underground.
      rect("#342e2d", x - 8, y - 9, 20, 12); rect("#926643", x - 7, y - 8, 18, 9);
      rect("#c59961", x + 6, y - 7, 5, 7); rect("#674c3a", x - 5, y - 4, 15, 2); return;
    }
    rect("#453b30", x - 2, y - 9, 5, 13);
    for (let n = 0; n < 4; n++) {
      rect("#293e38", x - 5 - n * 3, y - 29 + n * 6, 10 + n * 6, 7);
      rect(snow ? "#e5ede0" : "#9bad63", x - 4 - n * 3, y - 30 + n * 6, 8 + n * 5, 2);
      rect("#50634b", x - 3 - n * 2, y - 26 + n * 6, 6 + n * 4, 3);
    }
  };
  [[17, 63], [71, 32], [94, 81], [42, 90], [108, 39]].forEach(([x, y]) => tree(x, y));
  for (const [x, y, s] of [[195, 21, 1], [262, 73, 1.5], [208, 86, 1], [275, 40, .8]]) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    rect("#343b43", -9, -9, 20, 12); rect("#84939a", -8, -12, 15, 12);
    rect(snow ? "#e4eeeb" : "#bec9c6", -5, -14, 11, 4); rect("#5b6b78", 3, -8, 8, 9); ctx.restore();
  }
  // A small fork sign and incoming boot prints anchor the choice to the road.
  rect("#483529", 142, 36, 4, 30); rect("#795634", 129, 35, 25, 8); rect("#dfbd77", 130, 36, 21, 2);
  rect("#795634", 140, 46, 22, 8); rect("#dfbd77", 143, 47, 18, 2);
  rect("#eee2b1", 131, 38, 3, 3); rect("#eee2b1", 156, 49, 3, 3);
  for (let y = 81; y < 101; y += 8) { rect("#6d5941", 139, y, 2, 3); rect("#6d5941", 147, y + 4, 2, 3); }
}

export function showRoadFork(biome: string, onChoose: (choice: RoadChoice) => void, onPause: () => void) {
  const previousFocus = document.activeElement as HTMLElement | null;
  const root = document.createElement("div"); root.className = "road-fork";
  root.innerHTML = '<section role="dialog" aria-modal="true" aria-labelledby="fork-title" aria-describedby="fork-description"><header><span>A FORK IN THE ROAD</span><button type="button" class="fork-pause" aria-label="Pause game">Ⅱ</button></header><h2 id="fork-title">Which way?</h2><p id="fork-description">Take a short detour for supplies.</p><canvas class="fork-map" width="288" height="102" aria-hidden="true"></canvas><div class="fork-options"></div><p class="fork-footer">The road waits while you choose.</p></section>';
  const canvas = root.querySelector<HTMLCanvasElement>("canvas")!, ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false; drawFork(ctx, biome);
  let selected = false, destroyed = false;
  const options = root.querySelector(".fork-options")!;
  const buttons = roadOptions(biome).map(def => {
    const button = document.createElement("button"); button.type = "button"; button.dataset.path = def.id;
    const name = document.createElement("strong"), reward = document.createElement("span"), duration = document.createElement("small");
    name.textContent = def.name;
    reward.append(resourceAmounts({ [def.id]: ROAD_FORK_BONUS }), ` bonus ${def.resource} per enemy`);
    duration.textContent = `Next ${ROAD_FORK_ENEMIES} enemies`;
    button.append(name, reward, duration);
    const highlight = () => { if (!selected) drawFork(ctx, biome, def.id); };
    button.addEventListener("pointerenter", highlight); button.addEventListener("focus", highlight);
    button.addEventListener("click", () => {
      if (selected || destroyed) return;
      selected = true; drawFork(ctx, biome, def.id);
      root.classList.add("is-chosen"); button.classList.add("is-selected");
      buttons.forEach(b => { b.disabled = true; });
      root.querySelector(".fork-footer")!.textContent = `${def.name} · Let's go`;
      onChoose(def.id);
    });
    options.append(button); return button;
  });
  const pause = root.querySelector<HTMLButtonElement>(".fork-pause")!;
  pause.onclick = onPause;
  root.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); onPause(); }
    if (event.key === "Tab") {
      const controls = [pause, ...buttons.filter(b => !b.disabled)];
      const at = controls.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault(); controls[(at + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
    }
  });
  for (const event of ["pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "touchstart", "touchend", "click", "wheel"])
    root.addEventListener(event, e => e.stopPropagation());
  document.getElementById("game")!.append(root);
  buttons[0].focus({ preventScroll: true });
  return { root, destroy() {
    if (destroyed) return; destroyed = true; root.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  } };
}
