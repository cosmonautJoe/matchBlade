import { BLACKSMITH_COST, WIZARD_COST, canAfford, forgeCost, forgeCap, studyCost, studyCap, wizardAvailable, type MetaState } from "./meta";
import type { RunState } from "./run";

export function endOfRunCopy(reason: RunState["endReason"], won: boolean) {
  if (won) return { title: "Both bosses defeated", tip: "You cleared this road. Your haul is saved at camp." };
  if (reason === "boss") return { title: "A boss attack pushed you to the skull", tip: "Watch the boss challenge cues. Regular shields don't block piercing attacks." };
  if (reason === "enemy") return { title: "An enemy hit pushed you to the skull", tip: "Match shields to block hits. Defeating enemies gives you room to recover." };
  return { title: "You reached the skull", tip: "Time keeps pushing you back. Match swords or staves to defeat enemies and move forward." };
}

export function nextUpgrade(m: MetaState): { title: string; lines: string[] } {
  const choices: { name: string; cost: { wood?: number; ore?: number; treasure?: number } }[] = [];
  if (!m.blacksmithHired) choices.push({ name: "Unlock the forge", cost: BLACKSMITH_COST });
  else if (m.swordLevel < forgeCap(m.biome)) choices.push({ name: `Sword level ${m.swordLevel + 1}`, cost: { ore: forgeCost(m.swordLevel) } });
  if (wizardAvailable(m.biome)) {
    if (!m.wizardHired) choices.push({ name: "Recruit the mage", cost: WIZARD_COST });
    else if (m.staffLevel < studyCap(m.biome)) choices.push({ name: `Staff level ${m.staffLevel + 1}`, cost: { ore: studyCost(m.staffLevel) } });
  }
  const next = choices.find(c => canAfford(m, c.cost)) ?? choices[0];
  if (!next) return { title: "Gear ready for this area", lines: ["Your available permanent upgrades are complete. Pack items for your next run."] };
  const costs = Object.entries(next.cost).map(([key, value]) => `${value} ${key === "treasure" ? "gems" : key}`).join(" · ");
  const missing = Object.entries(next.cost).filter(([key, value]) => value > m[key as "wood" | "ore" | "treasure"])
    .map(([key, value]) => `${value - m[key as "wood" | "ore" | "treasure"]} ${key === "treasure" ? "gems" : key}`).join(" · ");
  return { title: missing ? `Next goal: ${next.name}` : `Ready now: ${next.name}`,
    lines: [costs, missing ? `Still needed: ${missing}` : "You can afford this at camp."] };
}
