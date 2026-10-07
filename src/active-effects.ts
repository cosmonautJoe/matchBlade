import type { RunState } from "./run";
import type { RunCheckpoint } from "./run-save";
import { itemById } from "./items";
import "./active-effects.css";
import { COMPANIONS } from "./companions";
import { roadEnemiesLeft, roadOptions, ROAD_FORK_BONUS } from "./road-fork";

export type ActiveEffect = { id: string; icon: string; name: string; status: string; detail: string };
export function activeItemEffects(run: RunState, buffs: RunCheckpoint["buffs"], items: (string | null)[], timersPaused: boolean): ActiveEffect[] {
  const effects: ActiveEffect[] = [];
  const left = roadEnemiesLeft(run.roadFork, run.killed);
  const detour = roadOptions(run.biome).find(option => option.id === run.roadFork?.choice);
  if (left && detour) effects.push({ id: "road-detour", icon: detour.icon, name: detour.name,
    status: `${left} ${left === 1 ? "enemy" : "enemies"} left`,
    detail: `Collect ${ROAD_FORK_BONUS} bonus ${detour.resource} after each of the next ${left} ${left === 1 ? "enemy" : "enemies"}. This supply detour adds to your normal loot. Resources go back to camp even if the run ends.`,
  });
  const pets=COMPANIONS.filter(pet=>run.companions?.includes(pet.id));
  if(pets.length)effects.push({id:"companions",icon:"🐾",name:"Companion bonuses",status:String(pets.length),
    detail:pets.map(pet=>`${pet.name}: ${pet.benefit}`).join("\n\n")});
  const zone = run.zone;
  if (zone && run.biome === "snow" && zone.thawUntil > run.killed) effects.push({
    id: "thawflask", icon: "♨️", name: "Thaw protection", status: `${zone.thawUntil - run.killed} encounters`,
    detail: "New ice cannot form until this many more enemies are defeated.",
  });
  if (zone && run.biome === "dungeon" && zone.caches < 3) effects.push({
    id: "zone-cache", icon: "🧰", name: "Treasure lock", status: `${zone.locks}/3`,
    detail: "Three key matches open a bonus cache for 3 gems. Your keys are kept. Up to three caches per run.",
  });
  if (zone?.marks.length && run.biome === "snow") effects.push({
    id: "zone-patches", icon: "❄️", name: "Ice", status: String(zone.marks.length),
    detail: "Tap a frozen tile three times to break its ice. Matching beside it or through it breaks the ice immediately.",
  });
  const add = (id: string, status: string, name?: string) => {
    const item = itemById(id)!;
    effects.push({ id, icon: item.glyph, name: name ?? item.name, status, detail: item.desc });
  };
  const timer = (id: string, seconds: number, name?: string) => {
    if (seconds > 0) {
      add(id, `${Math.ceil(seconds)}s${timersPaused ? " · paused" : ""}`, name);
      if (timersPaused) effects[effects.length - 1].detail += " Timer resumes during regular combat.";
    }
  };
  timer("waystone", buffs.freezeLeft);
  timer("warhorn", buffs.hornLeft);
  timer("ledger", buffs.ledgerLeft);
  timer("cinderflask", buffs.burnLeft, "Burning");
  if (run.whetstone > 0) {
    add("whetstone", `${run.whetstone} ${run.whetstone === 1 ? "match" : "matches"}`);
    effects[effects.length-1].detail = "Sword matches attack with at least 5 tiles of power. Each match uses one charge.";
  }
  if (buffs.spursActive) add("spurs", "This enemy");
  if (run.bellCharges > 0) add("wardbell", `${run.bellCharges} ${run.bellCharges === 1 ? "save" : "saves"}`);
  if (run.pierceMult < 1) add("wardsalve", "This run");
  if (buffs.skeletonCharges > 0) add("skeleton", `${buffs.skeletonCharges} ${buffs.skeletonCharges === 1 ? "chest" : "chests"}`);
  if (buffs.panCharges > 0) add("pan", `${buffs.panCharges} ${buffs.panCharges === 1 ? "chest" : "chests"}`);
  const revives = items.filter(id => id === "hearth").length;
  if (revives) add("hearth", `${revives} ready`);
  // Guard from a potion joins the same pool as matched shields.
  if (run.block > 0) effects.push({ id: "guard", icon: "🛡️", name: "Guard", status: `×${run.block}`,
    detail: "Guard from shields, potions and companions. Stronger enemies spend more per hit. Boss attacks bypass guard." });
  return effects;
}

export function createActiveEffects() {
  const game = document.getElementById("game")!;
  const root = document.createElement("div");
  root.className = "active-effects";
  root.setAttribute("role", "group"); root.setAttribute("aria-label", "Active effects and zone features");
  root.tabIndex = 0; root.hidden = true;
  const detail = document.createElement("section");
  detail.id = "active-effect-detail"; detail.className = "effect-detail"; detail.hidden = true;
  detail.setAttribute("role", "region"); detail.setAttribute("aria-labelledby", "effect-detail-name");
  detail.innerHTML = '<header><span class="effect-detail-icon" aria-hidden="true"></span><h3 id="effect-detail-name"></h3><button type="button" aria-label="Close effect details">✕</button></header><p class="effect-detail-status"></p><p id="effect-detail-description"></p>';
  const title = detail.querySelector("h3")!, description = detail.querySelector("#effect-detail-description")!;
  const detailIcon = detail.querySelector(".effect-detail-icon")!, detailStatus = detail.querySelector(".effect-detail-status")!;
  const chips = new Map<string, { button: HTMLButtonElement; icon: HTMLSpanElement; value: HTMLSpanElement }>();
  let current = new Map<string, ActiveEffect>(), selected: string | null = null;
  for (const node of [root,detail])
    for (const event of ["pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "touchstart", "touchend", "keydown", "click", "wheel"])
      node.addEventListener(event, e => e.stopPropagation());
  game.append(root,detail);
  let visible = false, count = 0, signature = "";
  const close = (restoreFocus = false) => {
    const button = selected ? chips.get(selected)?.button : null;
    button?.setAttribute("aria-expanded","false");button?.removeAttribute("aria-describedby");
    selected = null; detail.hidden = true;
    if(restoreFocus && button?.isConnected && !root.hidden)button.focus({preventScroll:true});
  };
  const placeDetail = () => {
    if(!selected || detail.hidden)return;
    const button=chips.get(selected)?.button;
    if(!button){close();return;}
    const bounds=game.getBoundingClientRect(), anchor=button.getBoundingClientRect();
    const inset=8, width=Math.min(320,Math.max(0,bounds.width-inset*2));
    detail.style.width=`${width}px`;detail.style.maxHeight=`${Math.max(0,bounds.height-inset*2)}px`;
    const height=detail.offsetHeight, above=anchor.top-bounds.top-height-8;
    const y=above>=inset?above:anchor.bottom-bounds.top+8;
    detail.style.left=`${Math.max(inset,Math.min(bounds.width-width-inset,anchor.left-bounds.left+anchor.width/2-width/2))}px`;
    detail.style.top=`${Math.max(inset,Math.min(bounds.height-height-inset,y))}px`;
  };
  const refreshDetail = () => {
    if(!selected)return;
    const effect=current.get(selected);
    if(!effect || root.hidden){close();return;}
    title.textContent=effect.name;description.textContent=effect.detail;
    detailIcon.textContent=effect.icon;detailStatus.textContent=effect.status;
    detail.hidden=false;placeDetail();
  };
  const toggle = (id: string) => {
    if(selected===id){close();return;}
    close();selected=id;
    chips.get(id)?.button.setAttribute("aria-expanded","true");
    chips.get(id)?.button.setAttribute("aria-describedby","effect-detail-description");
    refreshDetail();
  };
  detail.querySelector("button")!.addEventListener("click",()=>close(true));
  const outside = (event: PointerEvent) => {
    if(event.target instanceof Node && !root.contains(event.target) && !detail.contains(event.target))close();
  };
  const escape = (event: KeyboardEvent) => {
    if(selected && event.key==="Escape") {event.preventDefault();event.stopPropagation();close(true);}
  };
  document.addEventListener("pointerdown",outside,true);
  document.addEventListener("keydown",escape,true);
  window.addEventListener("resize",placeDetail);
  root.addEventListener("scroll",()=>close(),{passive:true});
  const syncVisibility = () => { root.hidden = !visible || !count; if(root.hidden)close(); };
  return {
    root,
    show(value: boolean) { visible = value; syncVisibility(); },
    place(x: number, y: number, width: number, height: number, wide: boolean) {
      root.classList.toggle("is-wide", wide);
      Object.assign(root.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: wide ? "auto" : `${height}px`, maxHeight: `${height}px` });
      placeDetail();
    },
    update(effects: ActiveEffect[]) {
      count = effects.length; syncVisibility();
      const next = JSON.stringify(effects); if (next === signature) return; signature = next;
      current = new Map(effects.map(effect=>[effect.id,effect]));
      if(selected && !current.has(selected))close();
      for(const [id,chip] of chips) if(!current.has(id)){chip.button.remove();chips.delete(id);}
      for (const effect of effects) {
        let chip = chips.get(effect.id);
        if(!chip) {
          const button=document.createElement("button");button.type="button";button.className="active-effect";
          button.setAttribute("aria-controls",detail.id);button.setAttribute("aria-expanded","false");
          const icon=document.createElement("span");icon.className="effect-icon";icon.setAttribute("aria-hidden","true");
          const value=document.createElement("span");value.className="effect-status";
          button.append(icon,value);button.addEventListener("click",()=>toggle(effect.id));
          chip={button,icon,value};chips.set(effect.id,chip);
        }
        chip.button.setAttribute("aria-label",`${effect.name}: ${effect.status}. Show effect details`);
        chip.icon.textContent=effect.icon;
        const timer = effect.status.match(/^\d+s/), charges = effect.status.match(/\d+/);
        chip.value.textContent = effect.id === "zone-cache" ? effect.status : timer ? timer[0] : charges ? `×${charges[0]}` : "✓";
        chip.button.classList.toggle("is-paused",effect.status.includes("paused"));
      }
      // Keep buttons alive through timer ticks so a press/focus is never lost.
      effects.forEach((effect,index)=>{
        const button=chips.get(effect.id)!.button;
        if(root.children[index]!==button)root.insertBefore(button,root.children[index]??null);
      });
      refreshDetail();
    },
    destroy() {
      document.removeEventListener("pointerdown",outside,true);document.removeEventListener("keydown",escape,true);
      window.removeEventListener("resize",placeDetail);root.remove();detail.remove();chips.clear();
    },
  };
}
