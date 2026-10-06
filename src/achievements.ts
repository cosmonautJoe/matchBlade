import type { MetaState } from "./meta";
import { COMPANIONS } from "./companions";

type Achievement = { id: string; name: string; description: string; icon: string; target: number; value: (m: MetaState) => number };
/** Permanent badges, separate from the quests that pay out regular supplies. */
export const ACHIEVEMENTS: readonly Achievement[] = [
  {id:"first-quest",name:"Helping Out",description:"Complete your first caravan quest.",icon:"✓",target:1,value:m=>m.questsRewarded.length},
  {id:"ten-quests",name:"Someone to Count On",description:"Complete 10 caravan quests.",icon:"▤",target:10,value:m=>m.questsRewarded.length},
  {id:"first-pet",name:"Room for One More",description:"Rescue your first pet.",icon:"🐾",target:1,value:m=>m.companions.length},
  {id:"three-pets",name:"Good Company",description:"Rescue 3 different pets.",icon:"🐾",target:3,value:m=>m.companions.length},
  {id:"all-pets",name:"Full House",description:"Rescue all 9 pets.",icon:"🐾",target:COMPANIONS.length,value:m=>m.companions.length},
  {id:"forge",name:"Open for Business",description:"Set up Wren's forge.",icon:"⚒",target:1,value:m=>Number(m.blacksmithHired)},
  {id:"mage",name:"A Little Magic",description:"Recruit Aldwin to the caravan.",icon:"✦",target:1,value:m=>Number(m.wizardHired)},
  {id:"plains-clear",name:"Open Road",description:"Defeat the final Plains boss.",icon:"☀",target:1,value:m=>Number(m.clearedBiomes.includes("plains"))},
  {id:"forest-clear",name:"Through the Trees",description:"Defeat the final Forest boss.",icon:"♣",target:1,value:m=>Number(m.clearedBiomes.includes("forest"))},
  {id:"snow-clear",name:"Over the Pass",description:"Defeat the final Snow boss.",icon:"❄",target:1,value:m=>Number(m.clearedBiomes.includes("snow"))},
  {id:"dungeon-clear",name:"Out of the Dark",description:"Defeat the final Dungeon boss.",icon:"◆",target:1,value:m=>Number(m.clearedBiomes.includes("dungeon"))},
  {id:"hundred-enemies",name:"Clearing the Way",description:"Defeat 100 enemies across your runs.",icon:"⚔",target:100,value:m=>m.slain},
];
export const achievementById = (id: string) => ACHIEVEMENTS.find(a=>a.id===id);
export function cleanAchievements(ids: unknown): string[] {
  return Array.isArray(ids)?[...new Set(ids.filter((id):id is string=>typeof id==="string" && !!achievementById(id)))]:[];
}
export function achievementProgress(m: MetaState, a: Achievement) {
  return {have:m.achievements.includes(a.id)?a.target:Math.max(0,Math.min(a.target,a.value(m))),need:a.target};
}
export function unlockAchievements(m: MetaState): Achievement[] {
  const earned=ACHIEVEMENTS.filter(a=>!m.achievements.includes(a.id) && a.value(m)>=a.target);
  m.achievements.push(...earned.map(a=>a.id));
  return earned;
}
