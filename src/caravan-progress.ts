import { BIOME_ORDER, BIOME_LABELS, unlockedBiomes, type MetaState } from "./meta";

export type CaravanMilestone = { id: string; name: string; detail: string; earned: boolean; icon: string };
export function caravanMilestones(meta: MetaState): CaravanMilestone[] {
  return [
    { id: "supplies", name: "Supplies aboard", detail: "Meet the merchant to add a roof pack.", earned: meta.peddlerArrived, icon: "▣" },
    { id: "forge", name: "Traveling workshop", detail: "Build the forge to fit a tool chest.", earned: meta.blacksmithHired, icon: "⚒" },
    { id: "pets", name: "A place to rest", detail: "Rescue your first pet to add a sheltered straw bed.", earned: meta.companions.length > 0, icon: "♧" },
    { id: "magic", name: meta.wizardHired ? "Aldwin's lantern" : "Room for someone new", detail: meta.wizardHired ? "A little light for the long road." : "Keep exploring to meet another traveler.", earned: meta.wizardHired, icon: "✦" },
    ...BIOME_ORDER.map((biome, index) => ({ id: biome, name: unlockedBiomes(meta).includes(biome) ? BIOME_LABELS[biome] + " pennant" : "Uncharted road",
      detail: "Clear this road's final boss to hang its pennant.", earned: meta.clearedBiomes.includes(biome), icon: String(index + 1) })),
  ];
}

export function caravanJourney(meta: MetaState) {
  const unlocked = unlockedBiomes(meta);
  return {
    stops: BIOME_ORDER.map((biome, i) => ({ id: biome, label: unlocked.includes(biome) ? ["Plains", "Forest", "Pass", "Delve"][i] : "Unknown",
      state: biome === meta.biome ? "current" : meta.clearedBiomes.includes(biome) ? "cleared" : unlocked.includes(biome) ? "open" : "locked" })),
    milestones: caravanMilestones(meta),
  };
}
export type CaravanJourney = ReturnType<typeof caravanJourney>;

/** Small fitted pixel-art accessories, in the cart's own 480 × 370 coordinates. */
export function drawCaravanMilestones(ctx: CanvasRenderingContext2D, meta: MetaState, grown: boolean, time: number) {
  ctx.save();
  const px = (color: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  const dark = "#352725", wood = "#98623a", trim = "#d5a660";
  if (meta.peddlerArrived) {
    // A strapped canvas pack rests directly on the roof, behind the leather ribs.
    const x = grown ? 133 : 112, y = grown ? 47 : 135;
    px(dark,x,y-13,35,15); px("#536545",x+2,y-11,31,11);
    px("#839267",x+3,y-11,27,3); px("#bd9d69",x+8,y-12,3,14); px("#bd9d69",x+26,y-12,3,14);
    px("#f1d496",x+8,y-5,4,3); px(dark,x+10,y-4,1,1);
  }
  if (meta.companions.length) {
    // The chassis shelters this low basket. No new platform or floating structure.
    const x = 165, y = grown ? 326 : 334;
    px(dark,x-2,y-15,45,19); px("#574135",x,y-14,41,12);
    px("#d7b77e",x+3,y-7,35,6); px("#f2d797",x+7,y-7,8,2); px("#a88956",x+23,y-5,12,2);
    px(wood,x,y,41,6); px(trim,x+1,y,39,2);
    for (let i=3;i<40;i+=7) px("#5b3b2a",x+i,y+2,2,4);
    px(dark,x-2,y-15,3,21); px(dark,x+41,y-15,3,21);
  }
  if (meta.blacksmithHired) {
    // Fastened to the front rail, clear of the blacksmith and the forge opening.
    const x=278, y=301;
    px(dark,x,y,37,18); px(wood,x+2,y+2,33,14); px(trim,x+2,y+2,33,3);
    px("#57616b",x+6,y+1,4,17); px("#57616b",x+27,y+1,4,17);
    px("#d5bd83",x+16,y+7,5,5); px(dark,x+18,y+9,1,2);
    px(dark,x+10,y-5,17,6); px("#abb8bb",x+12,y-5,12,4); px("#795537",x+21,y-2,3,7);
  }
  if (meta.wizardHired) {
    // A small crystal lantern hangs from the upper roof beam.
    const x=211, y=100;
    px(dark,x,y-19,2,18); px(trim,x,y-17,1,13);
    px(dark,x-7,y-1,16,23); px("#b09259",x-5,y,12,3); px("#5c4b73",x-5,y+3,12,14);
    const pulse=.7+Math.sin(time*1.5)*.12;
    ctx.globalAlpha=pulse; px("#d1beef",x-2,y+5,6,10); px("#fff1ed",x,y+7,2,6); ctx.globalAlpha=1;
    px(trim,x-5,y+18,12,3);
  }
  const colors=["#809365","#4d8983","#91c9df","#a58abb"];
  BIOME_ORDER.forEach((biome,i) => {
    if (!meta.clearedBiomes.includes(biome)) return;
    // Sewn keepsakes form a row along the deck fascia. Each road has its own mark.
    const x=(grown?271:164)+i*22, y=grown?198:287;
    const sway=Math.round(Math.sin(time*1.3+i)*1);
    px(dark,x-1,y-1,19,22); px(trim,x,y,17,2);
    for(let col=0;col<15;col++) px(colors[i],x+1+col,y+2,1,15+Math.round(4*(1-Math.abs(col-7)/7))+sway);
    const ink="#f6e2b2";
    if(i===0) {px(ink,x+8,y+6,2,8);px(ink,x+5,y+8,8,2);}
    if(i===1) {px(ink,x+7,y+5,4,3);px(ink,x+5,y+8,8,3);px(ink,x+8,y+11,2,4);}
    if(i===2) {px(ink,x+8,y+5,2,10);px(ink,x+4,y+9,10,2);px(ink,x+6,y+7,6,6);px(colors[i],x+7,y+8,4,4);}
    if(i===3) {px(ink,x+7,y+5,4,10);px(ink,x+5,y+8,8,4);}
  });
  ctx.restore();
}
