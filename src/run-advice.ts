import { BLACKSMITH_COST, WIZARD_COST, canAfford, forgeCost, forgeCap, studyCost, studyCap, wizardAvailable, type MetaState } from "./meta";
import type { RunState } from "./run";

export function endOfRunCopy(reason: RunState["endReason"], won: boolean) {
  if (won) return { title: "Both bosses defeated", tip: "You cleared this road. Your haul is saved at camp." };
  if (reason === "boss") return { title: "A boss attack pushed you to the skull", tip: "Watch the boss challenge cues. Regular shields don't block piercing attacks." };
  if (reason === "enemy") return { title: "An enemy hit pushed you to the skull", tip: "Match shields to block hits. Defeating enemies gives you room to recover." };
  return { title: "You reached the skull", tip: "Time keeps pushing you back. Match swords or fireballs to defeat enemies and move forward." };
}

export function campGoal(m: MetaState) {
  const choices: { name: string; service: "forge" | "magic"; benefit: string; cost: { wood?: number; ore?: number; treasure?: number } }[] = [];
  if (!m.blacksmithHired) choices.push({ name: "Unlock the forge", service: "forge", benefit: "Includes sword level 1 · basic sword damage 5 → 10", cost: BLACKSMITH_COST });
  else if (m.swordLevel < forgeCap(m.biome)) choices.push({ name: `Sword level ${m.swordLevel + 1}`, service: "forge", benefit: m.swordLevel + 1 === forgeCap(m.biome) ? "One sword match defeats regular enemies in this area" : "+5 damage on every sword match", cost: { ore: forgeCost(m.swordLevel) } });
  if (wizardAvailable(m.biome)) {
    if (!m.wizardHired) choices.push({ name: "Recruit the mage", service: "magic", benefit: "Expand the caravan and unlock spell upgrades", cost: WIZARD_COST });
    else if (m.staffLevel < studyCap(m.biome)) choices.push({ name: `Spell level ${m.staffLevel + 1}`, service: "magic", benefit: "+4 damage on every fireball match", cost: { ore: studyCost(m.staffLevel) } });
  }
  const next = choices.find(c => canAfford(m, c.cost)) ?? choices[0];
  if (!next) return null;
  const resourceName = (key: string) => key === "treasure" ? "gems" : key === "ore" ? "stone" : key;
  const costs = Object.entries(next.cost).map(([key, value]) => `${value} ${resourceName(key)}`).join(" · ");
  const missing = Object.entries(next.cost).filter(([key, value]) => value > m[key as "wood" | "ore" | "treasure"])
    .map(([key, value]) => `${value - m[key as "wood" | "ore" | "treasure"]} ${resourceName(key)}`).join(" · ");
  const have = Object.entries(next.cost).reduce((sum, [key, value]) => sum + Math.min(value, m[key as "wood" | "ore" | "treasure"]), 0);
  const need = Object.values(next.cost).reduce((sum, n) => sum + n, 0);
  return { ...next, costs, missing, ready: !missing, have, need };
}

export function nextUpgrade(m: MetaState): { title: string; lines: string[] } {
  const next = campGoal(m);
  if (!next) return { title: "Gear ready for this area", lines: ["Your available permanent upgrades are complete. Pack items for your next run."] };
  const { missing, costs } = next;
  return { title: missing ? `Next goal: ${next.name}` : `Ready now: ${next.name}`,
    lines: [next.benefit, costs, missing ? `Still needed: ${missing}` : "You can afford this at camp."] };
}
