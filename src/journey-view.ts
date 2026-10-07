import type { CaravanJourney } from "./caravan-progress";
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
  summary.append(el("strong", "", "Your growing caravan"), el("span", "", `${earned}/${journey.milestones.length} additions`));
  journal.append(summary, el("p", "mb-journey-note", "New companions, workspaces and road pennants travel with you."));
  const list = el("div", "mb-journey-milestones");
  for (const milestone of journey.milestones) {
    const item = el("div", `mb-milestone${milestone.earned ? " is-earned" : ""}`);
    const icon = el("span", "mb-milestone-icon", milestone.earned ? milestone.icon : "·"); icon.setAttribute("aria-hidden", "true");
    const copy = el("div", ""); copy.append(el("strong", "", milestone.name), el("small", "", milestone.earned ? "On your caravan ✓" : milestone.detail));
    item.append(icon, copy); list.append(item);
  }
  journal.append(list); root.append(route, journal);
  return root;
}
