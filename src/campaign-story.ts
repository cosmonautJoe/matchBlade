export interface CampaignStoryLine {
  speaker: string;
  text: string;
}

export interface CampaignStory {
  chapter: number;
  title: string;
  discovery: string;
  lines: readonly CampaignStoryLine[];
  resolution: string;
  ending?: boolean;
}

/** First-clear discoveries follow the original camp introduction. Progress is
 * derived from clearedBiomes, so loading a save never needs a second story flag. */
export const CAMPAIGN_STORIES: Readonly<Record<string, CampaignStory>> = {
  plains: {
    chapter: 1,
    title: "A familiar keepsake",
    discovery: "Beside the wagon tracks lies a small wooden fox, missing one ear.",
    lines: [
      { speaker: "You", text: "My son's. I carved it for him. He takes it everywhere." },
      { speaker: "The guide", text: "These tracks turn into the forest. Looks like we're on the right road." },
      { speaker: "You", text: "Let's keep moving. They can't be too far ahead." },
    ],
    resolution: "The wagon tracks lead into High Forest.",
  },
  forest: {
    chapter: 2,
    title: "A message left behind",
    discovery: "Inside a hollow tree, you find a folded note tucked beneath a stone.",
    lines: [
      { speaker: "You", text: "That's her handwriting. 'We're both safe. They're taking us over the pass. Keep following.'" },
      { speaker: "The guide", text: "She knew you'd come looking. She's leaving you a trail." },
      { speaker: "You", text: "Then we follow it. Both safe... That's what I needed to hear." },
    ],
    resolution: "Your family is alive. Their trail crosses Glacial Pass.",
  },
  snow: {
    chapter: 3,
    title: "Two names on the list",
    discovery: "At an abandoned guard post, a prisoner transfer lists your wife and son. Destination: the Delve.",
    lines: [
      { speaker: "The guide", text: "The old entrance is below the pass. That's where the wagons were heading." },
      { speaker: "You", text: "We're close. Leave room for two more." },
      { speaker: "The guide", text: "Already done. We'll be waiting right here." },
    ],
    resolution: "Your family is being held inside the Delve.",
  },
  dungeon: {
    chapter: 4,
    title: "Room for two more",
    discovery: "Beyond the last locked door, your wife is holding your son's hand. Both are safe.",
    lines: [
      { speaker: "Your son", text: "You found us!" },
      { speaker: "You", text: "I'm here. We're going home." },
      { speaker: "Your wife", text: "All that way... You didn't come alone?" },
      { speaker: "The guide", text: "We'll do introductions at the cart. First, let's get you out of here." },
    ],
    resolution: "Your family climbs aboard. For the first time, the road ahead can wait.",
    ending: true,
  },
};

export function campaignStory(biome: string): CampaignStory | undefined {
  return CAMPAIGN_STORIES[biome];
}
