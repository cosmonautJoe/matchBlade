import { BLACKSMITH_COST, WIZARD_COST, canAfford, wizardAvailable, roadOpen, nextBiome, type MetaState } from "./meta";
import { itemById } from "./items";
import { PLAYER_SOURCE, preparePlayerSheet, drawPlayerFrame, playerIdleFrame } from "./player-art";
import "./caravan.css";

type Service = "shop" | "forge" | "magic" | "quests";
type Actions = Record<Service | "start" | "menu", () => void> & { travel?: () => void };
type Environment = {
  label: string;
  parallax: { file: string; drift: number }[];
  floor: { file: string; sx: number; sy: number; w: number; h: number };
};

/** The caravan has its own art, coordinates, crew and scale. Biomes only supply scenery. */
export function createCaravan(meta: MetaState, environment: Environment, actions: Actions) {
  const root = document.createElement("section");
  root.className = "caravan-hub";
  root.setAttribute("aria-label", "Traveling caravan");
  root.innerHTML = `
    <header class="caravan-header"><div><strong>CAMP</strong><span class="caravan-zone"></span></div><div class="caravan-resources"></div><button class="caravan-motion" aria-label="Pause camp animation">Ⅱ</button><button class="caravan-menu" aria-label="Open menu">☰</button></header>
    <div class="caravan-environment"><canvas class="caravan-scenery" aria-hidden="true"></canvas><div class="caravan-vehicle"><canvas class="caravan-art" aria-hidden="true"></canvas></div><p class="caravan-announcement" role="status" aria-live="polite"></p></div>
    <footer class="caravan-prep"><h2>Get ready for the next run</h2><div class="caravan-services"></div><p class="caravan-packed"></p><button class="caravan-travel" hidden></button><button class="caravan-start">Start run →</button></footer>`;
  root.querySelector(".caravan-zone")!.textContent = environment.label;
  const viewport = root.querySelector<HTMLElement>(".caravan-environment")!;
  const vehicle = root.querySelector<HTMLElement>(".caravan-vehicle")!;
  const art = root.querySelector<HTMLCanvasElement>(".caravan-art")!;
  const scenery = root.querySelector<HTMLCanvasElement>(".caravan-scenery")!;
  const a = art.getContext("2d")!, bg = scenery.getContext("2d")!;
  const announcement = root.querySelector<HTMLElement>(".caravan-announcement")!;
  const load = (path: string) => { const im = new Image(); im.src = import.meta.env.BASE_URL + path; return im; };
  const starter = load("caravan/starter.png"), expanded = load("caravan/expanded.png");
  const crew = load("camp/village-npcs-v2.png");
  const hero = load(PLAYER_SOURCE);
  const layers = environment.parallax.map(p => ({ ...p, image: load(p.file) }));
  const highClouds = [load("camp/cloud5.png"), load("camp/cloud3.png"), load("camp/cloud4.png")];
  const floor = load(environment.floor.file);
  const groundArt = {
    bush: load("camp/bush_small.png"),
    grass: load("camp/tuft_tiny.png"),
    stone: load("camp/rocks_small2.png"),
  };
  const leafyGround = meta.biome === "plains" || meta.biome === "forest";
  let playerScale = 1, playerX = 0;
  let grown = meta.blacksmithHired || meta.wizardHired;
  let destroyed = false, frame = 0, time = 0, last = 0, noticeUntil = 0;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let moving = !reduce.matches;
  let pausedByUser = false;
  const motion = root.querySelector<HTMLButtonElement>(".caravan-motion")!;
  const updateMotion = () => { motion.textContent = moving ? "Ⅱ" : "▶"; motion.setAttribute("aria-label", moving ? "Pause camp animation" : "Play camp animation"); motion.setAttribute("aria-pressed", String(!moving)); };
  motion.addEventListener("click", () => { moving = !moving; pausedByUser = true; updateMotion(); });
  const reduced = () => { if (!pausedByUser) { moving = !reduce.matches; updateMotion(); } };
  reduce.addEventListener("change", reduced);
  updateMotion();
  root.querySelector(".caravan-menu")!.addEventListener("click", actions.menu);
  root.querySelector(".caravan-start")!.addEventListener("click", actions.start);
  root.querySelector(".caravan-travel")!.addEventListener("click", () => actions.travel?.());
  for (const name of ["pointerdown", "pointerup", "pointermove", "wheel"]) root.addEventListener(name, e => e.stopPropagation());
  const stations = new Map<Service, HTMLButtonElement>();
  const shortcuts = new Map<Service, HTMLButtonElement>();
  const glyphs: Record<Service, string> = { quests: "▤", shop: "◆", forge: "⚒", magic: "✦" };
  for (const id of ["quests", "shop", "forge", "magic"] as const) {
    const hotspot = document.createElement("button");
    hotspot.className = `caravan-station caravan-station--${id}`;
    hotspot.innerHTML = `<span></span>`;
    hotspot.addEventListener("click", actions[id]);
    vehicle.append(hotspot); stations.set(id, hotspot);
    const shortcut = document.createElement("button");
    shortcut.className = "caravan-service";
    shortcut.innerHTML = `<span class="caravan-icon" aria-hidden="true">${glyphs[id]}</span><span><strong></strong><small></small></span>`;
    shortcut.addEventListener("click", actions[id]);
    root.querySelector(".caravan-services")!.append(shortcut); shortcuts.set(id, shortcut);
  }
  document.getElementById("game")!.append(root);
  // Fixed logical pixel grid; responsive scaling never changes saved progression.
  art.width = 480; art.height = 370;
  const fit = () => {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    scenery.width = Math.max(1, Math.round(w)); scenery.height = Math.max(1, Math.round(h));
    const portraitScale = root.clientHeight > root.clientWidth ? .85 : 1;
    const baseWidth = Math.max(1, Math.min(w * .98, (h - 24) * 480 / 370, 830) * portraitScale);
    const width = baseWidth * .92;
    // Keep the player readable while giving the smaller wagon more breathing room.
    playerScale = baseWidth / 480;
    playerX = (w - baseWidth) / 2 - 72 * playerScale - Math.max(12, Math.min(28, w * .035));
    const rightShift = Math.max(0, Math.min(w * .04, (w - width) / 2 - 8));
    vehicle.style.left = `${w / 2 + rightShift}px`;
    vehicle.style.width = `${width}px`; vehicle.style.height = `${width * 370 / 480}px`;
    // Both sprite variants plant their wheel baseline at logical y=350.
    vehicle.style.bottom = `${h * .09 - 20 * width / 480}px`;
  };
  const observer = new ResizeObserver(fit); observer.observe(viewport); fit();
  const announce = (message: string) => { announcement.textContent = message; noticeUntil = performance.now() + 5000; };
  const refresh = () => {
    const next = meta.blacksmithHired || meta.wizardHired;
    if (next !== grown) {
      grown = next;
      if (grown) announce("Your caravan has expanded. Welcome aboard!");
    }
    root.classList.toggle("is-expanded", grown);
    const travel = root.querySelector<HTMLButtonElement>(".caravan-travel")!;
    travel.hidden = !roadOpen(meta) || !actions.travel;
    travel.textContent = `New area unlocked: ${nextBiome(meta)} →`;
    root.classList.toggle("has-mage", meta.wizardHired);
    root.querySelector(".caravan-resources")!.textContent = `🪵 ${meta.wood}  🪨 ${meta.ore}  💎 ${meta.treasure}`;
    const labels: Record<Service, [string, string]> = {
      quests: ["Quests", "Goals & rewards"],
      shop: [meta.peddlerArrived ? "Item shop" : "Meet the merchant", meta.peddlerArrived ? "Pack for your run" : "Bring back your first gem"],
      forge: [meta.blacksmithHired ? "Sword upgrades" : "Unlock forge", meta.blacksmithHired ? `Sword level ${meta.swordLevel}` : `${BLACKSMITH_COST.wood} wood · ${BLACKSMITH_COST.ore} ore`],
      magic: [meta.wizardHired ? "Magic upgrades" : wizardAvailable(meta.biome) ? "Recruit mage" : "Unknown traveler", meta.wizardHired ? `Staff level ${meta.staffLevel}` : wizardAvailable(meta.biome) ? `${WIZARD_COST.wood} wood · ${WIZARD_COST.ore} ore · ${WIZARD_COST.treasure} gems` : "Keep exploring"],
    };
    for (const [id, b] of shortcuts) {
      const [title, detail] = labels[id];
      b.querySelector("strong")!.textContent = title; b.querySelector("small")!.textContent = detail;
      b.querySelector(".caravan-icon")!.textContent = id === "magic" && !meta.wizardHired && !wizardAvailable(meta.biome) ? "?" : glyphs[id];
      const station = stations.get(id)!;
      station.setAttribute("aria-label", `${title}. ${detail}`); station.title = `${title} · ${detail}`;
      station.querySelector("span")!.textContent = title;
      station.classList.toggle("is-locked", id === "forge" && !meta.blacksmithHired || id === "magic" && !meta.wizardHired);
      const ready = id === "forge" && !meta.blacksmithHired && canAfford(meta, BLACKSMITH_COST)
        || id === "magic" && !meta.wizardHired && wizardAvailable(meta.biome) && canAfford(meta, WIZARD_COST);
      b.classList.toggle("is-ready", ready); station.classList.toggle("is-ready", ready);
    }
    stations.get("magic")!.hidden = !grown;
    const items = meta.stockedItems.map(id => itemById(id)?.name).filter(Boolean);
    root.querySelector(".caravan-packed")!.textContent = items.length ? `Packed ${items.length}/3 · ${items.join(", ")}` : "Pack up to 3 items for your next run";
  };
  const imageReady = (im: HTMLImageElement) => im.complete && im.naturalWidth > 0;
  const sprite = (row: number, x: number, feet: number, size: number, period: number) => {
    if (!imageReady(crew)) return;
    const phase = (time + row * 3) % period;
    const f = phase < 1.8 ? Math.min(7, Math.floor(phase / 1.8 * 8)) : 0;
    const sw = crew.naturalWidth / 8, sh = crew.naturalHeight / 4;
    a.drawImage(crew, f * sw, row * sh, sw, sh, Math.round(x-size/2), Math.round(feet-size), size, size);
  };
  const draw = (now: number) => {
    if (destroyed) return;
    frame = requestAnimationFrame(draw);
    if (now - last < 33) return;
    const dt = Math.min(.1, (now-last)/1000); last = now;
    if (document.hidden || root.style.visibility === "hidden") return;
    if (moving) time += dt;
    if (noticeUntil && now > noticeUntil) { announcement.textContent = ""; noticeUntil = 0; }
    const w = scenery.width, h = scenery.height;
    bg.imageSmoothingEnabled = false;
    bg.fillStyle = "#719aae"; bg.fillRect(0,0,w,h);
    // Scenery scale depends only on the viewport, never on caravan level.
    for (const [index, layer] of layers.entries()) if (imageReady(layer.image)) {
      // The original cloud layers are horizon fog with a solid lower edge.
      // Use isolated cloud sprites high in the sky instead of lifting that edge.
      if (layer.file.includes("/clouds")) continue;
      const scale = h / layer.image.naturalHeight;
      const lw = layer.image.naturalWidth * scale;
      const offset = layer.drift ? time * layer.drift % lw : 0;
      for (let x=-offset; x<w; x+=lw) bg.drawImage(layer.image,Math.round(x),0,Math.ceil(lw),h);
      if (index === 0 && /worlds\/(grass|snow)\//.test(layer.file)) {
        highClouds.forEach((cloud, i) => {
          if (!imageReady(cloud)) return;
          const cw = Math.min(w * [.42, .5, .3][i], h * .5);
          const ch = cw * cloud.naturalHeight / cloud.naturalWidth;
          const cx = ((w * [.12, .73, .43][i] - time * (3 + i) + cw) % (w + cw) + w + cw) % (w + cw) - cw;
          bg.drawImage(cloud, Math.round(cx), Math.round(h * [.06, .14, .25][i]), cw, ch);
        });
      }
    }
    const groundY = h * .91;
    if (imageReady(floor)) {
      const f=environment.floor, unit=2;
      for(let x=0;x<w;x+=f.w*unit) bg.drawImage(floor,f.sx,f.sy,f.w,f.h,x,groundY,f.w*unit,f.h*unit);
    }
    // Small, fixed clusters frame the campsite without covering the crew or steps.
    // Keep them in scenery space so caravan upgrades don't enlarge the vegetation.
    const groundScale = Math.max(.85, Math.min(1.5, h / 340));
    const groundProp = (kind: keyof typeof groundArt, x: number, scale: number, inset = 1, flip = false) => {
      const im = groundArt[kind];
      if (!imageReady(im)) return;
      const pw = Math.round(im.naturalWidth * scale * groundScale);
      const ph = Math.round(im.naturalHeight * scale * groundScale);
      bg.save();
      bg.translate(Math.round(w * x), Math.round(groundY + inset));
      if (flip) bg.scale(-1, 1);
      bg.drawImage(im, -Math.round(pw / 2), -ph, pw, ph);
      bg.restore();
    };
    if (leafyGround) {
      groundProp("bush", .025, 1.05);
      groundProp("bush", .97, .8, 2, true);
      groundProp("grass", .075, .95, 3);
      groundProp("grass", .19, .7, 2, true);
      groundProp("grass", .83, .8, 3);
      groundProp("grass", .925, 1, 3, true);
      if (w > 600) {
        groundProp("grass", .115, .75, 2);
        groundProp("bush", .88, .7, 1, true);
      }
    }
    groundProp("stone", .16, .5, 3);
    groundProp("stone", .9, .6, 3, true);
    // Player positioning is independent of the vehicle, so moving the wagon
    // right leaves clear standing space and never clips the sword at its edge.
    if (imageReady(hero)) {
      const s = playerScale;
      const f = playerIdleFrame(time);
      drawPlayerFrame(bg, preparePlayerSheet(hero), f,
        playerX, groundY - 127 * s, 216 * s, 173 * s);
    }
    a.clearRect(0,0,480,370); a.imageSmoothingEnabled = false;
    const im = grown ? expanded : starter;
    // Image rectangles and hotspot coordinates are versioned together below.
    const rect = grown ? {x:8,y:36,w:464,h:338} : {x:8,y:83,w:464,h:309};
    if(imageReady(im)) a.drawImage(im,rect.x,rect.y,rect.w,rect.h);
    if (grown) {
      if(meta.peddlerArrived) sprite(0,151,287,67,14);
      sprite(3,318,189,65,17);
      if(meta.blacksmithHired) sprite(1,335,294,72,12);
      if(meta.wizardHired) sprite(2,180,193,70,19);
      else { a.fillStyle="#d1b78d";a.fillRect(139,142,49,27); a.fillStyle="#795e45";a.fillRect(160,142,5,27); }
      if(meta.blacksmithHired) {
        for(let i=0;i<4;i++) {
          const phase=(time*1.5+i*.23)%1;
          a.fillStyle=i%2?"#ffb83d":"#ffe5a1";
          a.fillRect(382+i*3,259-phase*17,4,8+phase*4);
        }
      }
    } else {
      if(meta.peddlerArrived) sprite(0,147,279,80,14);
      sprite(3,302,284,79,17);
    }
  };
  refresh(); frame=requestAnimationFrame(draw);
  return { root, refresh, announce, destroy: () => { destroyed=true; cancelAnimationFrame(frame); observer.disconnect(); reduce.removeEventListener("change",reduced); root.remove(); } };
}
