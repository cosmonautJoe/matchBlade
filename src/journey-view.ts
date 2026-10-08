import type { CaravanJourney } from "./caravan-progress";
import { campaignStory } from "./campaign-story";
import "./journey.css";

const el = (tag: string, cls: string, text = "") => {
  const node = document.createElement(tag); node.className = cls; node.textContent = text; return node;
};
export function renderJourney(journey: CaravanJourney) {
  const root = el("section", "mb-journey");
  const route = el("ol", "mb-journey-route"); route.setAttribute("aria-label", "Your road so far");
  journey.stops.forEach((stop,i) => {
    const station = el("li", `mb-journey-stop is-${stop.state}`); station.dataset.zone = stop.id;
    if (stop.state === "current") station.setAttribute("aria-current", "location");
    const mark = el("span", "mb-journey-mark", stop.state === "cleared" ? "✓" : stop.state === "locked" ? "?" : String(i+1));
    mark.setAttribute("aria-hidden", "true");
    station.append(mark, el("strong", "", stop.label), el("small", "", stop.state === "current" ? "You are here" : stop.state === "cleared" ? "Cleared" : stop.state === "open" ? "Next stop" : "Unexplored"));
    route.append(station);
  });
  const journal = document.createElement("details"); journal.className = "mb-journey-journal";
  const earned = journey.milestones.filter(m => m.earned).length;
  const summary = el("summary", "");
  summary.append(el("strong", "", "Caravan milestones"), el("span", "", `${earned}/${journey.milestones.length} completed`));
  journal.append(summary, el("p", "mb-journey-note", "Your crew, companions and the roads you've cleared."));
  const list = el("div", "mb-journey-milestones");
  for (const milestone of journey.milestones) {
    const item = el("div", `mb-milestone${milestone.earned ? " is-earned" : ""}`);
    const icon = el("span", "mb-milestone-icon", milestone.earned ? milestone.icon : "·"); icon.setAttribute("aria-hidden", "true");
    const copy = el("div", ""); copy.append(el("strong", "", milestone.name), el("small", "", milestone.earned ? "Completed ✓" : milestone.detail));
    item.append(icon, copy); list.append(item);
  }
  journal.append(list); root.append(route, journal);
  // Cleared milestones are the saved source of truth. Open/debug-unlocked roads
  // and a current-but-uncleared stop must not reveal their discoveries.
  const clearedRoads = journey.milestones.filter(milestone => milestone.earned && campaignStory(milestone.id));
  if (clearedRoads.length) {
    const discoveries = el("section", "mb-journey-discoveries");
    discoveries.setAttribute("aria-label", "Discoveries along the road");
    discoveries.append(el("h3", "", "Discoveries"));
    for (const road of clearedRoads) {
      const story = campaignStory(road.id)!;
      const entry = document.createElement("details");
      entry.className = "mb-journey-discovery";
      entry.dataset.zone = road.id;
      const heading = el("summary", "");
      heading.append(el("span", "mb-journey-discovery-zone", road.name), el("strong", "", story.title));
      const body = el("div", "mb-journey-discovery-body");
      body.append(el("p", "mb-journey-discovery-setting", story.discovery));
      const conversation = el("dl", "mb-journey-conversation");
      for (const line of story.lines) {
        const turn = el("div", "");
        turn.append(el("dt", "", line.speaker), el("dd", "", line.text));
        conversation.append(turn);
      }
      body.append(conversation, el("p", "mb-journey-discovery-resolution", story.resolution));
      if (story.ending) body.append(el("p", "mb-journey-discovery-setting", "Your family is safe. You can keep exploring with the caravan."));
      entry.append(heading, body);
      discoveries.append(entry);
    }
    root.append(discoveries);
  }
  return root;
}
