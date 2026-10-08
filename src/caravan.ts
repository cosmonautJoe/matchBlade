import { BLACKSMITH_COST, WIZARD_COST, canAfford, forgeCost, forgeCap, wizardAvailable, roadOpen, nextBiome, BIOME_LABELS, saveMeta, campQuestFocus, type MetaState } from "./meta";
import { itemById } from "./items";
import { campGoal } from "./run-advice";
import { createCampDialogue } from "./camp-dialogue";
import { PLAYER_SOURCE, preparePlayerSheet, drawPlayerFrame, playerIdleFrame } from "./player-art";
import "./caravan.css";
import { COMPANIONS, type CompanionId } from "./companions";
import { drawCompanion } from "./companion-view";
import { drawCaravanWeather } from "./caravan-weather";
import { petCampPose } from "./companion-motion";
import { showCompanionCollection } from "./companion-collection";
import { createCampAtmosphere } from "./camp-atmosphere";
import { createCaravanSmoke } from "./caravan-smoke";
import { caravanMilestones } from "./caravan-progress";
import { resourceAmounts } from "./ui-resources";

type Service = "shop" | "forge" | "magic" | "quests";

// Balance camp silhouettes without shrinking touch targets or combat portraits.
// Moss's shared artwork skips the .65 reduction applied to the other pets.
const CAMP_PET_ART_SCALE: Record<CompanionId, number> = {
  moss: .65,
  bramble: .9, hazel: .9, flint: .9,
  flurry: .85, rime: .85,
  pip: 1, hush: 1, echo: 1,
};
type Actions = Record<Service | "start" | "menu", () => void> & { travel?: () => void; routes?: () => void; previewZone?: () => void; canTalk?: () => boolean; introEnded?: () => void };
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
    <div class="caravan-environment"><canvas class="caravan-scenery" aria-hidden="true"></canvas><div class="caravan-vehicle"><canvas class="caravan-art" aria-hidden="true"></canvas></div><canvas class="caravan-atmosphere" aria-hidden="true"></canvas><p class="caravan-announcement" role="status" aria-live="polite"></p></div>
    <footer class="caravan-prep">
      <div class="caravan-prep-info"><h2>Get ready for the next run</h2><button class="caravan-goal"><strong></strong><span></span><progress></progress></button><button class="caravan-quest-summary"><strong>Quests</strong><span></span><progress></progress></button><p class="caravan-packed"></p><button class="caravan-travel" hidden></button></div>
      <div class="caravan-prep-actions"><div class="caravan-services"></div><button class="caravan-start"><canvas class="caravan-start-scene" width="112" height="60" aria-hidden="true"></canvas><span class="caravan-start-label">Start run<small>The road is waiting</small></span><span class="caravan-start-arrow" aria-hidden="true">➜</span></button></div>
    </footer>`;
  root.querySelector(".caravan-zone")!.textContent = environment.label;
  if (actions.routes) {
    const label = root.querySelector(".caravan-zone")!.parentElement!;
    const button = document.createElement("button");
    button.className = "caravan-zone-switch";
    button.title = "Choose an area";
    button.setAttribute("aria-label", `Choose an area. Current camp: ${environment.label}`);
    button.setAttribute("aria-haspopup", "dialog");
    button.append(...Array.from(label.childNodes));
    label.replaceWith(button);
    button.addEventListener("click", event => {
      if (dialogue.active) return;
      if (import.meta.env.DEV && event.shiftKey && actions.previewZone) actions.previewZone();
      else actions.routes?.();
    });
  }
  const viewport = root.querySelector<HTMLElement>(".caravan-environment")!;
  const journeyButton = document.createElement("button");
  journeyButton.className = "caravan-journey";
  journeyButton.setAttribute("aria-haspopup", "dialog");
  journeyButton.onclick = () => { if (!dialogue.active) actions.routes?.(); };
  journeyButton.hidden = !actions.routes;
  viewport.append(journeyButton);
  const vehicle = root.querySelector<HTMLElement>(".caravan-vehicle")!;
  const art = root.querySelector<HTMLCanvasElement>(".caravan-art")!;
  const scenery = root.querySelector<HTMLCanvasElement>(".caravan-scenery")!;
  const weatherCanvas = root.querySelector<HTMLCanvasElement>(".caravan-atmosphere")!;
  const weather = weatherCanvas.getContext("2d")!;
  const atmosphere = createCampAtmosphere(meta.biome);
  const smoke = createCaravanSmoke();
  const a = art.getContext("2d")!, bg = scenery.getContext("2d")!;
  const startArt = root.querySelector<HTMLCanvasElement>(".caravan-start-scene")!.getContext("2d")!;
  const companions = COMPANIONS.filter(c => meta.companions.includes(c.id)).map(def => {
    const button=document.createElement("button");button.className="caravan-companion";
    button.setAttribute("aria-label",`${def.name}, ${def.species}. ${def.benefit}`);
    button.title=`${def.name} · ${def.benefit}`;
    const canvas=document.createElement("canvas");canvas.width=44;canvas.height=44;canvas.setAttribute("aria-hidden","true");button.append(canvas);
    button.onclick=()=>{if(!dialogue.active)announce(`${def.name}: ${def.personality} ${def.benefit}`);};
    viewport.append(button);
    return {def,button,ctx:canvas.getContext("2d")!};
  });
  const petBook=document.createElement("button");petBook.className="caravan-pet-book";
  petBook.textContent=`Pets ${companions.length}/${COMPANIONS.length}`;
  petBook.setAttribute("aria-label","Open pet collection");viewport.append(petBook);
  let collection: ReturnType<typeof showCompanionCollection> | null=null;
  petBook.onclick=()=>{
    if(dialogue.active || collection)return;
    root.inert=true;
    collection=showCompanionCollection(meta.companions,()=>{collection=null;root.inert=false;petBook.focus();});
  };
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
  // Camp opens alive by default; the pause button remains an explicit opt-out.
  let moving = true;
  const motion = root.querySelector<HTMLButtonElement>(".caravan-motion")!;
  const updateMotion = () => { root.classList.toggle("is-motion-paused", !moving); motion.textContent = moving ? "Ⅱ" : "▶"; motion.setAttribute("aria-label", moving ? "Pause camp animation" : "Play camp animation"); motion.setAttribute("aria-pressed", String(!moving)); };
  motion.addEventListener("click", () => { moving = !moving; updateMotion(); });
  updateMotion();
  root.querySelector(".caravan-menu")!.addEventListener("click", actions.menu);
  root.querySelector(".caravan-start")!.addEventListener("click", () => { if (!dialogue.active) actions.start(); });
  root.querySelector(".caravan-goal")!.addEventListener("click", () => { const goal = campGoal(meta); if (goal) actions[goal.service](); });
  root.querySelector(".caravan-quest-summary")!.addEventListener("click", actions.quests);
  root.querySelector(".caravan-travel")!.addEventListener("click", () => actions.travel?.());
  for (const name of ["pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "touchstart", "touchend", "click", "wheel"]) root.addEventListener(name, e => e.stopPropagation());
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
    if(id==="quests") {
      shortcut.classList.add("caravan-quest-service");
      shortcut.lastElementChild!.append(document.createElement("progress"));
    }
    shortcut.addEventListener("click", actions[id]);
    root.querySelector(".caravan-services")!.append(shortcut); shortcuts.set(id, shortcut);
  }
  document.getElementById("game")!.append(root);
  const dialogue = createCampDialogue(root, meta, {
    anchor: speaker => {
      if (speaker === "player") return { x: playerX + 108 * playerScale, y: viewport.clientHeight * .91 - 95 * playerScale };
      const bounds = stations.get(speaker)!.getBoundingClientRect(), env = viewport.getBoundingClientRect();
      return { x: bounds.left + bounds.width / 2 - env.left, y: bounds.top - env.top };
    },
    highlight: speaker => { for (const [id, station] of stations) station.classList.toggle("is-speaking", id === speaker); },
    onIntroEnd: () => { meta.caravanIntroSeen = true; meta.campIntroSeen = true; saveMeta(meta); actions.introEnded?.(); },
  });
  // Fixed logical pixel grid; responsive scaling never changes saved progression.
  art.width = 480; art.height = 370;
  const fit = () => {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    scenery.width = Math.max(1, Math.round(w)); scenery.height = Math.max(1, Math.round(h));
    weatherCanvas.width = scenery.width; weatherCanvas.height = scenery.height;
    const portrait = root.clientHeight > root.clientWidth;
    // Wide, shallow scenery can crop the art's transparent sky without shrinking the crew.
    const visibleArtHeight = portrait ? 370 : grown ? 334 : 287;
    const baseWidth = Math.max(1, Math.min(w * .98, (h - 24) * 480 / visibleArtHeight, 830) * (portrait ? .85 : 1));
    const width = baseWidth * .92;
    // Keep the player readable while giving the smaller wagon more breathing room.
    playerScale = baseWidth / 480;
    playerX = (w - baseWidth) / 2 - 72 * playerScale - Math.max(12, Math.min(28, w * .035));
    const rightShift = Math.max(0, Math.min(w * .04, (w - width) / 2 - 8));
    vehicle.style.left = `${w / 2 + rightShift}px`;
    vehicle.style.width = `${width}px`; vehicle.style.height = `${width * 370 / 480}px`;
    // Set the wheels slightly into the grass rather than above its edge.
    vehicle.style.bottom = `${h * .09 - 20 * width / 480 - 8}px`;
  };
  const observer = new ResizeObserver(fit); observer.observe(viewport); fit();
  const announce = (message: string) => {
    announcement.textContent = message;
    announcement.classList.toggle("is-progress",message.startsWith("✓") || message.startsWith("★"));
    noticeUntil = performance.now() + 6000;
  };
  const refresh = () => {
    const milestones = caravanMilestones(meta), earned = milestones.filter(m => m.earned).length;
    journeyButton.textContent = `Journey · ${meta.clearedBiomes.length}/4 roads →`;
    journeyButton.title = `${earned}/${milestones.length} caravan milestones. View your journey.`;
    const forgeReady = !meta.blacksmithHired && canAfford(meta, BLACKSMITH_COST);
    const swordCost = forgeCost(meta.swordLevel);
    const swordMaxed = meta.swordLevel >= forgeCap(meta.biome);
    const swordReady = meta.blacksmithHired && !swordMaxed && canAfford(meta, { ore: swordCost });
    const goal = campGoal(meta);
    const goalButton = root.querySelector<HTMLButtonElement>(".caravan-goal")!;
    goalButton.hidden = !goal;
    if (goal) {
      goalButton.querySelector("strong")!.textContent = `${goal.ready ? "Ready now" : "Next upgrade"}: ${goal.name} →`;
      goalButton.querySelector("span")!.textContent = goal.ready ? goal.benefit : `Need ${goal.missing}`;
      goalButton.title = goal.benefit;
      const progress = goalButton.querySelector("progress")!;
      progress.max = goal.need; progress.value = goal.have;
      progress.setAttribute("aria-label", `Materials for ${goal.name}`);
    }
    const next = meta.blacksmithHired || meta.wizardHired;
    if (next !== grown) {
      grown = next;
      fit();
      if (grown) announce("Your caravan has expanded. Welcome aboard!");
    }
    root.classList.toggle("is-expanded", grown);
    const travel = root.querySelector<HTMLButtonElement>(".caravan-travel")!;
    travel.hidden = !roadOpen(meta) || !actions.travel;
    travel.textContent = `Travel to ${BIOME_LABELS[nextBiome(meta) ?? ""]} →`;
    root.classList.toggle("has-mage", meta.wizardHired);
    root.classList.toggle("has-forge", meta.blacksmithHired);
    root.querySelector(".caravan-resources")!.replaceChildren(resourceAmounts({ wood: meta.wood, ore: meta.ore, treasure: meta.treasure }, true));
    const focus=campQuestFocus(meta);
    const progressNews=meta.progressNotice.quests.length+meta.progressNotice.achievements.length;
    const summary = root.querySelector<HTMLButtonElement>(".caravan-quest-summary")!;
    summary.querySelector("strong")!.textContent = progressNews ? "Rewards collected ✓" : "Quests";
    summary.querySelector("span")!.textContent = focus
      ? `${focus.quest.shortLabel} · ${focus.progress.have}/${focus.progress.need}` : "View achievements";
    summary.title = focus ? `${focus.quest.label}: ${focus.progress.have}/${focus.progress.need}` : "Quests & achievements";
    const summaryMeter = summary.querySelector("progress")!;
    summaryMeter.hidden = !focus;
    if (focus) {
      summaryMeter.max = focus.progress.need; summaryMeter.value = focus.progress.have;
      summaryMeter.setAttribute("aria-label", summary.title);
    }
    const questMeter=shortcuts.get("quests")!.querySelector("progress")!;
    questMeter.hidden=!focus;
    if(focus) {
      questMeter.max=focus.progress.need;questMeter.value=focus.progress.have;
      questMeter.setAttribute("aria-label",`${focus.quest.label}: ${focus.progress.have} of ${focus.progress.need}`);
    }
    const labels: Record<Service, [string, string]> = {
      quests: [progressNews ? "Quests · ✓" : "Quests", focus
        ? `${focus.quest.shortLabel} · ${focus.progress.have}/${focus.progress.need}`
        : "Complete · View achievements"],
      shop: [meta.peddlerArrived ? "Item shop" : "Meet the merchant", meta.peddlerArrived ? "Pack for your run" : "Bring back your first gem"],
      forge: [meta.blacksmithHired ? swordReady ? "Upgrade sword" : "Sword upgrades" : "Unlock forge", meta.blacksmithHired
        ? swordMaxed ? `Level ${meta.swordLevel} · Area max` : swordReady ? "↑ Upgrade ready" : `Level ${meta.swordLevel} · Need ${swordCost - meta.ore} stone`
        : forgeReady ? "Ready to build" : `${BLACKSMITH_COST.wood} wood · ${BLACKSMITH_COST.ore} stone`],
      magic: [meta.wizardHired ? "Magic upgrades" : wizardAvailable(meta.biome) ? "Recruit mage" : "Unknown traveler", meta.wizardHired ? `Spell level ${meta.staffLevel}` : wizardAvailable(meta.biome) ? `${WIZARD_COST.wood} wood · ${WIZARD_COST.ore} stone · ${WIZARD_COST.treasure} gems` : "Keep exploring"],
    };
    for (const [id, b] of shortcuts) {
      const [title, detail] = labels[id];
      b.querySelector("strong")!.textContent = title; b.querySelector("small")!.textContent = detail;
      if (id === "forge" && swordReady) b.querySelector("small")!.innerHTML = '<span class="caravan-ready-full">↑ Upgrade ready</span><span class="caravan-ready-short" aria-hidden="true">↑ Ready</span>';
      const description = id === "forge" && swordReady
        ? `${title}. Upgrade ready: level ${meta.swordLevel} to ${meta.swordLevel + 1} for ${swordCost} stone.`
        : `${title}. ${detail}`;
      b.title = description; b.setAttribute("aria-label", description);
      b.querySelector(".caravan-icon")!.textContent = id === "magic" && !meta.wizardHired && !wizardAvailable(meta.biome) ? "?" : glyphs[id];
      const station = stations.get(id)!;
      station.setAttribute("aria-label", description); station.title = description;
      station.querySelector("span")!.textContent = title;
      station.classList.toggle("is-locked", id === "forge" && !meta.blacksmithHired || id === "magic" && !meta.wizardHired);
      const ready = id === "quests" && progressNews > 0 || goal?.ready && goal.service === id || id === "forge" && (forgeReady || swordReady)
        || id === "magic" && !meta.wizardHired && wizardAvailable(meta.biome) && canAfford(meta, WIZARD_COST);
      b.classList.toggle("is-ready", ready); station.classList.toggle("is-ready", ready);
      b.classList.toggle("is-build-ready", id === "forge" && forgeReady);
      station.classList.toggle("is-build-ready", id === "forge" && forgeReady);
      b.classList.toggle("is-upgrade-ready", id === "forge" && swordReady);
      station.classList.toggle("is-upgrade-ready", id === "forge" && swordReady);
    }
    stations.get("magic")!.hidden = !grown;
    const items = meta.stockedItems.map(id => itemById(id)?.name).filter(Boolean);
    const roadTip: Record<string, string> = {
      forest: "Watch the bushes · ambushers carry extra supplies",
      snow: "Tap ice three times or match beside it",
      dungeon: "Key matches unlock bonus treasure",
    };
    const packed = root.querySelector<HTMLElement>(".caravan-packed")!;
    packed.textContent = items.length ? `Packed ${items.length}/3 · ${items.join(", ")}` : roadTip[meta.biome] ?? "Keep every resource you collect, even if the run ends";
    packed.title = packed.textContent;
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
    const visible = !document.hidden && root.style.visibility !== "hidden" && !root.classList.contains("is-departing");
    const paused = root.classList.contains("is-system-paused");
    const animating = moving && !paused;
    if (!paused) dialogue.tick(dt, visible && !collection && (actions.canTalk?.() ?? true), imageReady(hero) && imageReady(grown ? expanded : starter) && imageReady(crew));
    if (!visible) return;
    if (animating) time += dt;
    const buttonTime = moving && !root.classList.contains("is-serving") ? time : 0;
    startArt.clearRect(0,0,112,60);startArt.imageSmoothingEnabled=false;
    // A tiny playable-world vignette makes the departure feel like an invitation.
    startArt.fillStyle="#496665";startArt.fillRect(0,0,112,60);
    startArt.fillStyle="#789080";startArt.beginPath();startArt.moveTo(0,35);startArt.lineTo(30,9);startArt.lineTo(58,32);startArt.lineTo(90,18);startArt.lineTo(112,32);startArt.lineTo(112,60);startArt.lineTo(0,60);startArt.fill();
    // Scroll the current camp's actual floor atlas beneath the miniature runner.
    if(imageReady(floor)) {
      const f=environment.floor, tileWidth=f.w*.5, offset=buttonTime*38%tileWidth;
      for(let x=-offset;x<112;x+=tileWidth)
        startArt.drawImage(floor,f.sx,f.sy,f.w,f.h,Math.round(x),46,tileWidth,f.h*.5);
    }
    if(imageReady(hero))drawPlayerFrame(startArt,preparePlayerSheet(hero),buttonTime?48+Math.floor(buttonTime*12)%8:playerIdleFrame(0),-7,-15,108,86);
    const petEnv=viewport.getBoundingClientRect(), petCart=vehicle.getBoundingClientRect();
    // Keep pets modest beside the crew and draw at the display's actual density.
    const petDpr=Math.max(1,window.devicePixelRatio||1);
    const petPixels=Math.round(Math.max(48,Math.min(64,44*petCart.width/art.width*1.25))*petDpr);
    const petSize=petPixels/petDpr;
    const petLayout={width:scenery.width,height:scenery.height,petInset:petSize/2+2,cart:{x:petCart.left-petEnv.left,y:petCart.top-petEnv.top,width:petCart.width,expanded:grown}};
    viewport.style.setProperty("--camp-pet-size",`${petSize}px`);
    for(const {def,button,ctx} of companions) {
      button.hidden=dialogue.active;
      if(ctx.canvas.width!==petPixels)ctx.canvas.width=ctx.canvas.height=petPixels;
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,petPixels,petPixels);
      ctx.setTransform(petPixels/44,0,0,petPixels/44,0,0);ctx.imageSmoothingEnabled=false;
      // Pets follow camp's explicit Play/Pause control, like the NPCs.
      const petTime=time;
      const pose=petCampPose(def.id,petTime,petLayout);
      // The feet sit at y=38 on the 44px artwork; keep that anchor on the ground/roof.
      button.style.left=`${Math.round((petEnv.left+pose.x-petSize/2)*petDpr)/petDpr-petEnv.left}px`;
      button.style.top=`${Math.round((petEnv.top+pose.y-petSize*38/44)*petDpr)/petDpr-petEnv.top}px`;button.style.bottom="auto";
      drawCompanion(ctx,def.id,22,38,1.35*CAMP_PET_ART_SCALE[def.id],petTime,pose);
    }
    if (noticeUntil && now > noticeUntil) { announcement.textContent = ""; announcement.classList.remove("is-progress"); noticeUntil = 0; }
    const w = scenery.width, h = scenery.height;
    const envBounds=viewport.getBoundingClientRect(), cartBounds=vehicle.getBoundingClientRect();
    const shelter={x:cartBounds.left-envBounds.left,y:cartBounds.top-envBounds.top,width:cartBounds.width,expanded:grown};
    atmosphere.update(dt,w,h,shelter,animating);
    smoke.update(dt,meta.blacksmithHired && imageReady(expanded),animating,
      atmosphere.wind() / Math.max(.1, shelter.width / 480));
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
    atmosphere.background(bg,shelter);
    smoke.draw(bg,shelter);
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
      if (kind === "grass" || kind === "bush")
        bg.transform(1,0,atmosphere.windSway()*(kind === "bush" ? .3 : 1),1,0,0);
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
      const arrival = dialogue.arrival;
      const f = arrival < 1 ? 48 + Math.floor(arrival * 2.6 * 15) % 8 : playerIdleFrame(time);
      const fromX = -216 * s;
      const x = arrival < 1 ? fromX + (playerX - fromX) * arrival : playerX;
      drawPlayerFrame(bg, preparePlayerSheet(hero), f,
        x, groundY - 127 * s, 216 * s, 173 * s);
    }
    a.clearRect(0,0,480,370); a.imageSmoothingEnabled = false;
    const im = grown ? expanded : starter;
    // Image rectangles and hotspot coordinates are versioned together below.
    const rect = grown ? {x:8,y:36,w:464,h:338} : {x:8,y:83,w:464,h:309};
    if(imageReady(im)) {
      a.drawImage(im,rect.x,rect.y,rect.w,rect.h);
      drawCaravanWeather(a,meta.biome,grown);
    }
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
    atmosphere.foreground(weather,shelter);
  };
  refresh(); frame=requestAnimationFrame(draw);
  return { root, refresh, announce, say: dialogue.say, startIntro: dialogue.startIntro,
    forgeBurst: () => smoke.burst(),
    destroy: () => { destroyed=true; collection?.destroy(); cancelAnimationFrame(frame); observer.disconnect(); dialogue.destroy(); root.remove(); } };
}
