import { COMPANIONS, type CompanionId } from "./companions";
import { drawCompanion } from "./companion-view";

/** Read-only collection. All rescued pets help automatically from the next run. */
export function showCompanionCollection(owned: readonly CompanionId[], onClose: () => void) {
  const root=document.createElement("div");root.className="companion-collection";
  root.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="pet-book-title"><header><div><small>YOUR TRAVELING COMPANY</small><h2 id="pet-book-title">Pets</h2></div><button aria-label="Close pet collection">✕</button></header><p>Every rescued pet helps on future runs, in every zone. No need to equip them.</p><div class="pet-book-list"></div><p class="pet-book-note">On the road: use 1 key or 3 wood to open a cage. Pets stay with you even if the run ends.</p></section>';
  const list=root.querySelector(".pet-book-list")!;
  for(const [biome,label] of [["plains","Grass Plains"],["forest","Forest"],["snow","Snow"],["dungeon","Dungeon"]]) {
    const pets=COMPANIONS.filter(c=>c.biome===biome);
    const heading=document.createElement("h3");heading.textContent=`${label} · ${pets.filter(c=>owned.includes(c.id)).length}/${pets.length}`;list.append(heading);
    for(const pet of pets) {
      const found=owned.includes(pet.id), card=document.createElement("article");
      card.className=found?"pet-book-card":"pet-book-card is-undiscovered";
      const art=document.createElement("canvas");art.width=56;art.height=56;art.setAttribute("aria-hidden","true");
      drawCompanion(art.getContext("2d")!,pet.id,28,48,1.7,0);
      const text=document.createElement("div"), name=document.createElement("strong"), detail=document.createElement("p"), personality=document.createElement("small");
      name.textContent=found?`${pet.name} · ${pet.species}`:"Unfamiliar tracks";
      detail.textContent=found?pet.benefit:`Keep exploring the ${label.toLowerCase()}.`;
      personality.textContent=found?pet.personality:"Not yet met";
      text.append(name,detail,personality);card.append(art,text);list.append(card);
    }
  }
  let destroyed=false;
  const destroy=()=>{if(destroyed)return;destroyed=true;root.remove();};
  const close=()=>{destroy();onClose();};
  const button=root.querySelector<HTMLButtonElement>("header button")!;button.onclick=close;
  root.addEventListener("click",event=>{if(event.target===root)close();});
  root.addEventListener("keydown",event=>{
    event.stopPropagation();
    if(event.key==="Escape"){event.preventDefault();close();}
    if(event.key==="Tab"){event.preventDefault();button.focus();}
  });
  for(const event of ["pointerdown","pointerup","pointermove","touchstart","touchend","click","wheel"])root.addEventListener(event,e=>e.stopPropagation());
  document.getElementById("game")!.append(root);button.focus();
  return {destroy};
}
