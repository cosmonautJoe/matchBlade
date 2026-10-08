import { BIOME_ORDER, BIOME_LABELS, unlockedBiomes, type MetaState } from "./meta";

export type CaravanMilestone = { id: string; name: string; detail: string; earned: boolean; icon: string };
export function caravanMilestones(meta: MetaState): CaravanMilestone[] {
  return [
    { id: "supplies", name: "Merchant joined", detail: "Bring back your first gem to meet the merchant.", earned: meta.peddlerArrived, icon: "▣" },
    { id: "forge", name: "Forge built", detail: "Build the forge to unlock sword upgrades.", earned: meta.blacksmithHired, icon: "⚒" },
    { id: "pets", name: "First companion", detail: "Rescue a pet along the road.", earned: meta.companions.length > 0, icon: "♧" },
    { id: "magic", name: meta.wizardHired ? "Aldwin joined" : "Room for someone new", detail: meta.wizardHired ? "Spell upgrades are available." : "Keep exploring to meet another traveler.", earned: meta.wizardHired, icon: "✦" },
    ...BIOME_ORDER.map((biome, index) => ({ id: biome, name: unlockedBiomes(meta).includes(biome) ? BIOME_LABELS[biome] : "Uncharted road",
      detail: "Defeat this road's final boss.", earned: meta.clearedBiomes.includes(biome), icon: String(index + 1) })),
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
