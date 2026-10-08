import Phaser from "phaser";
import { openCampPanel } from "./camp-ui";
import { loadMeta, roadOpen, nextBiome, advanceBiome, questDone, questById, currentQuests, BIOME_LABELS } from "./meta";
import { endOfRunCopy, campGoal } from "./run-advice";
import { prepareResourceIcons, resourceIcon } from "./ui-resources";
import { campaignStory, type CampaignStory } from "./campaign-story";
import type { RunState } from "./run";
import "./results.css";

export interface RunResult {
  won: boolean;
  depth: number;
  score: number;
  cascade: number;
  wood: number;
  ore: number;
  treasure: number;
  record: boolean;
  reason?: RunState["endReason"];
  /** Captured before bankRun marks the road cleared. */
  firstClear?: boolean;
  biome?: string;
}

/** One readable line at a time; the whole bubble advances on tap or keyboard. */
function discoveryCard(story: CampaignStory, biome: string): HTMLElement {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = "") => {
    const node = document.createElement(tag);
    node.className = cls;
    node.textContent = text;
    return node;
  };
  const card = el("section", `mb-results-story${story.ending ? " is-ending" : ""}`);
  card.dataset.zone = biome;
  card.setAttribute("aria-label", story.title);
  const chapter = el("p", "mb-results-story-chapter", `${story.ending ? "Journey complete" : `Road ${story.chapter} of 4`} · ${BIOME_LABELS[biome] ?? biome}`);
  card.append(chapter, el("h3", "mb-results-story-title", story.title), el("p", "mb-results-story-discovery", story.discovery));
  const bubble = el("button", "mb-results-story-bubble");
  bubble.type = "button";
  const speaker = el("strong", "mb-results-story-speaker");
  const words = el("span", "mb-results-story-words");
  const step = el("span", "mb-results-story-step");
  const spoken = el("span", "mb-results-story-spoken");
  spoken.setAttribute("aria-live", "polite");
  spoken.setAttribute("aria-atomic", "true");
  spoken.append(speaker, words);
  bubble.append(spoken, step);
  const ending = el("div", "mb-results-story-resolution");
  ending.hidden = true;
  ending.setAttribute("role", "status");
  ending.append(el("p", "", story.resolution));
  if (story.ending) ending.append(el("p", "mb-results-story-replay-note", "Your journey is complete. Keep exploring, finish quests and revisit any road from camp."));
  const replay = el("button", "mb-results-story-replay", "Read again ↺");
  replay.type = "button";
  ending.append(replay);
  let index = 0;
  const paint = () => {
    const line = story.lines[index];
    speaker.textContent = line.speaker;
    words.textContent = line.text;
    step.textContent = `${index + 1} / ${story.lines.length} · ${index === story.lines.length - 1 ? "Finish" : "Continue"} →`;
    bubble.setAttribute("aria-label", `${line.speaker}: ${line.text}. ${index === story.lines.length - 1 ? "Finish conversation" : "Continue conversation"}.`);
  };
  bubble.addEventListener("click", () => {
    if (++index < story.lines.length) { paint(); return; }
    bubble.hidden = true;
    ending.hidden = false;
    replay.focus({ preventScroll: true });
  });
  replay.addEventListener("click", () => {
    index = 0;
    paint();
    ending.hidden = true;
    bubble.hidden = false;
    bubble.focus({ preventScroll: true });
  });
  paint();
  card.append(bubble, ending);
  return card;
}

/** Rewards have already been banked by the caller. Text never scales with the board. */
export function showResults(scene: Phaser.Scene, result: RunResult) {
  prepareResourceIcons(scene);
  const meta = loadMeta();
  const outcome = endOfRunCopy(result.reason, result.won);
  const unlocked = roadOpen(meta);
  const completed=currentQuests(meta).filter(aq=>questDone(meta,aq)).map(aq=>questById(aq.id)!);
  const goal = campGoal(meta);
  const biome = result.biome ?? meta.biome;
  const story = result.won ? campaignStory(biome) : undefined;
  const firstDiscovery = !!story && !!result.firstClear;
  const campaignComplete = firstDiscovery && story!.ending;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = "") => {
    const node = document.createElement(tag);
    node.className = cls;
    node.textContent = text;
    return node;
  };
  const content = el("div", "mb-results");
  if (firstDiscovery) content.append(discoveryCard(story!, biome));
  const stats = el("dl", "mb-results-stats");
  stats.setAttribute("aria-label", "Run statistics");
  for (const [label, value, suffix] of [
    ["Depth", String(result.depth), "/ 20"],
    ["Score", result.score.toLocaleString(), ""],
    ["Best cascade", `×${Math.max(1, result.cascade)}`, ""],
  ]) {
    const stat = el("div", "mb-results-stat");
    const number = el("dd", "mb-results-number", value);
    if (suffix) number.append(el("span", "mb-results-suffix", ` ${suffix}`));
    stat.append(el("dt", "mb-results-label", label), number);
    stats.append(stat);
  }
  content.append(stats);
  if (result.record) content.append(el("p", "mb-results-record", "New personal best"));

  const resources = [
    { key: "wood", label: "Wood", tile: 5, amount: result.wood },
    { key: "ore", label: "Stone", tile: 6, amount: result.ore },
    { key: "treasure", label: "Gems", tile: 4, amount: result.treasure },
  ] as const;
  const rewards = el("section", "mb-results-rewards");
  rewards.append(el("h3", "mb-results-section-title", "Saved to camp"));
  const haul = el("dl", "mb-results-haul");
  for (const resource of resources) {
    const reward = el("div", "mb-results-reward");
    const label = el("dt", "mb-results-label", resource.label);
    const icon = resourceIcon(resource.key);
    icon.classList.add("mb-results-resource-icon"); icon.alt = "";
    label.prepend(icon);
    reward.append(label, el("dd", "mb-results-amount", `+${resource.amount.toLocaleString()}`));
    haul.append(reward);
  }
  rewards.append(haul);
  content.append(rewards);

  if (completed.length) {
    const receipt = el("div", "mb-results-notice");
    receipt.append(
      el("strong", "", `${completed.length} quest${completed.length === 1 ? "" : "s"} complete`),
      el("p", "", `+${completed.reduce((sum, q) => sum + q.reward, 0)} gems on return to camp`),
    );
    content.append(receipt);
  }
  if (goal) {
    const upgrade = el("section", "mb-results-upgrade");
    const heading = el("div", "mb-results-upgrade-heading");
    const name = el("div", "");
    name.append(el("p", "mb-results-label", "Next upgrade"), el("h3", "mb-results-goal-name", goal.name));
    heading.append(name);
    if (goal.ready) heading.append(el("span", "mb-results-ready", "Ready at camp"));
    upgrade.append(heading, el("p", "mb-results-benefit", goal.benefit));
    const costs = el("div", "mb-results-costs");
    for (const resource of resources) {
      const need = goal.cost[resource.key];
      if (!need) continue;
      const have = meta[resource.key];
      const cost = el("div", "mb-results-cost");
      const row = el("div", "mb-results-cost-heading");
      row.append(el("span", "", resource.label), el("span", "mb-results-cost-value", `${have.toLocaleString()} / ${need.toLocaleString()}`));
      const meter = el("progress", "");
      meter.max = need;
      meter.value = Math.min(have, need);
      meter.setAttribute("aria-label", `${resource.label} for ${goal.name}`);
      cost.append(row, meter);
      costs.append(cost);
    }
    upgrade.append(costs);
    if (!goal.ready) upgrade.append(el("p", "mb-results-remaining", `${goal.missing} to go`));
    content.append(upgrade);
  }
  if (unlocked) {
    const notice = el("div", "mb-results-notice");
    notice.append(el("strong", "", `${BIOME_LABELS[nextBiome(meta)!]} unlocked`), el("p", "", "Your next road is ready."));
    content.append(notice);
  }
  if (story && !firstDiscovery) {
    const recap = el("details", "mb-results-story-recap");
    recap.append(el("summary", "", story.ending ? "Revisit the ending" : "Revisit this road's discovery"), discoveryCard(story, biome));
    content.append(recap);
  }
  let leaving = false;
  const leave = () => {
    if (leaving) return;
    leaving = true;
    close();
    scene.scene.start("camp");
  };
  const close = openCampPanel(scene, {
    title: campaignComplete ? "Together again" : result.won ? "Road complete!" : "Run ended",
    subtitle: campaignComplete ? "Your family is safe. The road home is open." : firstDiscovery ? `${BIOME_LABELS[biome]} cleared · A new discovery` : result.won ? "Both bosses defeated" : outcome.title,
    kind: "results",
    cards: [],
    content,
    actions: [
      ...(unlocked ? [{ label: `Travel to ${BIOME_LABELS[nextBiome(meta)!]} →`, run: () => { advanceBiome(loadMeta()); leave(); } }] : []),
      { label: campaignComplete ? "Return to the caravan →" : "Back to camp →", secondary: unlocked, run: leave },
    ],
    onClose: leave,
  });
}
