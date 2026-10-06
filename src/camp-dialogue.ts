import type { MetaState } from "./meta";

export type CampSpeaker = "player" | "quests" | "shop" | "forge" | "magic";
export type CampLine = readonly [CampSpeaker, string];
export const SPEAKERS: Record<CampSpeaker, string> = {
  player: "You", quests: "The guide", shop: "The merchant", forge: "Wren", magic: "Aldwin",
};

// Provisional story setup lives here, separate from progression and combat.
export const CAMP_INTRO: readonly CampLine[] = [
  ["quests", "Hello, traveler! You look like you could use a minute."],
  ["player", "I'm looking for my wife and son. They were taken from our home. The tracks led this way."],
  ["quests", "I'm sorry. We haven't seen them, but we can ask at every stop."],
  ["player", "Are you heading down this road?"],
  ["quests", "That's the plan. The creatures ahead have us stuck here. This cart isn't getting through on its own."],
  ["quests", "Help us clear the road and you can travel with us. We'll share our supplies and help you keep looking."],
  ["player", "I can do that. I just need to keep moving."],
  ["quests", "Then you've got a place here. Catch your breath. We'll be ready when you are."],
];

type Conversation = { id: string; lines: readonly CampLine[]; biome?: string; companion?: string };
export const CAMP_CHAT: readonly Conversation[] = [
  { id: "bramble-sticks", companion: "bramble", lines: [["quests", "Bramble brought more sticks."], ["player", "And one of my gloves."], ["quests", "At least you've got it back."]] },
  { id: "pip-spoon", companion: "pip", lines: [["shop", "Pip. That's a spoon. We need that."], ["quests", "Try trading a bottle cap."], ["shop", "I'm negotiating with a bird now."]] },
  { id: "moss-watch", companion: "moss", lines: [["player", "Moss hasn't moved for an hour."], ["quests", "Neither has anyone touched your bag. Good work, Moss."]] },
  { id: "hazel-stash", companion: "hazel", lines: [["shop", "There's a nut in the till."], ["quests", "Hazel's putting something away."], ["shop", "I'd prefer coins."]] },
  { id: "hazel-check", companion: "hazel", lines: [["player", "She's dug that same hole three times."], ["quests", "Checking the inventory. Thorough little thing."]] },
  { id: "hush-stare", companion: "hush", lines: [["quests", "Hush has been watching you pack."], ["player", "Am I doing it wrong?"], ["quests", "Apparently."]] },
  { id: "hush-quiet", companion: "hush", lines: [["forge", "Sorry, Hush. Last nail."], ["player", "He heard that the last time too."]] },
  { id: "flurry-leaf", companion: "flurry", lines: [["player", "Flurry just jumped at a leaf."], ["quests", "It was moving quite suddenly."]] },
  { id: "flurry-blanket", companion: "flurry", lines: [["shop", "That blanket is reserved now, apparently."], ["player", "She looks comfortable."], ["shop", "She looks impossible to move."]] },
  { id: "rime-sleeve", companion: "rime", lines: [["player", "Something's asleep in my sleeve."], ["quests", "Rime. Use the other coat."]] },
  { id: "rime-clean", companion: "rime", lines: [["forge", "How does Rime stay that clean?"], ["quests", "Doesn't do any of the washing up, for a start."]] },
  { id: "echo-roost", companion: "echo", lines: [["quests", "Mind the awning. Echo's asleep."], ["shop", "I hung a little sign. He keeps hanging from that too."]] },
  { id: "echo-key", companion: "echo", lines: [["player", "Another key. Where does he find them?"], ["quests", "Places we're too big to look."]] },
  { id: "flint-stone", companion: "flint", lines: [["player", "Flint brought me this stone."], ["forge", "Good weight. Smooth edges. He knows what he's doing."]] },
  { id: "flint-hole", companion: "flint", lines: [["shop", "No digging under the wheel, please."], ["quests", "He's moved six inches to the left."], ["shop", "I'll take it."]] },
  { id: "guide-map", lines: [["quests", "Same road, three different names on this map. Very helpful."]] },
  { id: "guide-kettle", lines: [["quests", "Kettle's still warm, if anyone wants some."]] },
  { id: "guide-records", lines: [["quests", "I've kept a record of the roads we've cleared."], ["player", "And all the animals we've picked up?"], ["quests", "They've got their own page."]] },
  { id: "guide-wheel", lines: [["quests", "I'll check the wheels before we leave. The left one sounded unhappy."]] },
  { id: "boots", lines: [["quests", "How are your boots holding up?"], ["player", "Better than my feet."], ["quests", "There's clean cloth under the seat. Take some."]] },
  { id: "watch", lines: [["player", "I can take first watch."], ["quests", "You took it yesterday. Get some sleep. I'll wake you if we need you."]] },
  { id: "quiet", lines: [["quests", "You don't have to fill the silence, you know."], ["player", "Thanks."], ["quests", "Any time."]] },
  { id: "pace", lines: [["player", "How far until the next stop?"], ["quests", "Half a day, with a clear road. A full day if that wheel gets worse."]] },
  { id: "son", lines: [["player", "My son would be asking what's in every box."], ["quests", "I'd give him the inventory. Keep him busy for a while."], ["player", "He'd probably correct it."]] },
  { id: "merchant-count", lines: [["shop", "Two bottles, three maps... Who put a potato in here?"]] },
  { id: "merchant-sign", lines: [["shop", "I should make a sign. Something that says 'please don't squeeze the supplies.'"]] },
  { id: "merchant-tea", lines: [["shop", "Tea is free. The cup comes back to me."]] },
  { id: "receipts", lines: [["quests", "Do you really need a receipt for firewood?"], ["shop", "Only if you want to know where our money went."], ["quests", "Into the fire, mostly."]] },
  { id: "discount", lines: [["player", "Any discount for carrying the heavy boxes?"], ["shop", "Already included."], ["player", "Of course it is."]] },
  { id: "apples", lines: [["shop", "Last apple. Anyone?"], ["quests", "Split it."], ["shop", "That was a much nicer answer than I expected."]] },
  { id: "packing", lines: [["quests", "Can we leave a little space by the door?"], ["shop", "That's the empty-box pile."], ["quests", "It still takes up space."]] },
  { id: "smith-edge", lines: [["forge", "Whoever used this blade to open a tin owes me ten minutes."]] },
  { id: "smith-coals", lines: [["forge", "Coals are good. Finally. Nobody put anything wet in there."]] },
  { id: "smith-tools", lines: [["forge", "Small hammer, small nail. It's a system. Please use it."]] },
  { id: "sword-care", lines: [["forge", "Leave your sword here when you eat. I'll check the edge."], ["player", "It feels fine."], ["forge", "Good. Let's keep it that way."]] },
  { id: "squeak", lines: [["quests", "Can you fix that squeak?"], ["forge", "The wheel or the cupboard?"], ["quests", "There's a cupboard squeak now?"], ["forge", "Not for much longer."]] },
  { id: "nails", lines: [["shop", "I could sell those spare nails."], ["forge", "They're holding your shelf up tomorrow."], ["shop", "I'll mark them reserved."]] },
  { id: "lunch", lines: [["quests", "Lunch is ready."], ["forge", "One more strike."], ["shop", "She said that six strikes ago."], ["forge", "Then stop counting and save me some."]] },
  { id: "mage-notes", lines: [["magic", "That's either an important formula or yesterday's shopping list."]] },
  { id: "mage-mug", lines: [["magic", "Where did I put my... Ah. Holding it. Good."]] },
  { id: "mage-light", lines: [["magic", "A reading light that doesn't attract insects. That would be useful."]] },
  { id: "warm-tea", lines: [["shop", "Can you keep this tea warm?"], ["magic", "Easily."], ["shop", "Warm, Aldwin. Not boiling."], ["magic", "An important distinction."]] },
  { id: "magic-hammer", lines: [["magic", "Have you considered a hammer that swings itself?"], ["forge", "Have you considered where my fingers are?"], ["magic", "I'll revise the design."]] },
  { id: "stars", lines: [["quests", "Can you find north without the map?"], ["magic", "With a clear sky, yes."], ["quests", "And with clouds?"], ["magic", "I'd like the map back."]] },
  { id: "lesson", lines: [["player", "How long did it take you to learn all this?"], ["magic", "I'll let you know when I've learned all of it."]] },
  { id: "missing-spoon", lines: [["shop", "Has anyone seen the good spoon?"], ["forge", "Define good."], ["magic", "The one that isn't bent?"], ["quests", "We had one that wasn't bent?"]] },
  { id: "roof", lines: [["quests", "Roof's leaking over my seat."], ["forge", "I'll patch it."], ["magic", "I could keep the rain off."], ["shop", "Patch first. Experiment somewhere dry."]] },
  { id: "supper", lines: [["quests", "Same stew tonight. Any objections?"], ["shop", "Not if someone else washes up."], ["forge", "I'll do it."], ["magic", "I'll dry."], ["player", "Then I'll get the water."]] },
  { id: "plains-wind", biome: "plains", lines: [["quests", "Nice breeze today. Shame about all the dust."]] },
  { id: "forest-birds", biome: "forest", lines: [["quests", "Hear that bird? Same call all morning."], ["player", "Maybe it's lost too."], ["quests", "At least it's asking for directions."]] },
  { id: "forest-damp", biome: "forest", lines: [["forge", "Everything's damp. Even the things under the dry things."]] },
  { id: "snow-socks", biome: "snow", lines: [["quests", "Dry socks before bed. I'm serious."], ["player", "Yes, I remember yesterday."], ["quests", "Your toes remember too."]] },
  { id: "dungeon-echo", biome: "dungeon", lines: [["shop", "Could we stop somewhere with a window next time?"], ["quests", "It's on the list."]] },
];

export function availableCampChat(meta: MetaState) {
  const present = new Set<CampSpeaker>(["player", "quests"]);
  if (meta.peddlerArrived) present.add("shop");
  if (meta.blacksmithHired) present.add("forge");
  if (meta.wizardHired) present.add("magic");
  return CAMP_CHAT.filter(chat => (!chat.biome || chat.biome === meta.biome) &&
    (!chat.companion || meta.companions.some(id => id === chat.companion)) && chat.lines.every(([who]) => present.has(who)));
}

const recent: string[] = [];
const REACTIONS = {
  purchase: ["shop", ["Packed and ready. Hope it comes in handy.", "Good choice. I've set it aside for your next run.", "That's yours. Try to bring yourself back too.", "One less thing to worry about out there."]],
  restock: ["shop", ["Let me check the other crate.", "Here's what else I've got.", "Different stock. Same careful packing."]],
  sword: ["forge", ["There. Better edge, same grip.", "Try that. You should feel the difference.", "Sharpened and checked. You're good to go."]],
  staff: ["magic", ["That should give it a little more punch.", "All set. Give it a try out there.", "Better. And nothing caught fire this time."]],
  smith: ["forge", ["Thanks for the space. I've already sharpened your sword.", "I'll keep your gear in shape. You keep the road clear."]],
  mage: ["magic", ["Glad to be aboard. Let's work on those fireballs.", "A workspace of my own. I'll try to keep it tidy."]],
  quest: ["quests", ["Thanks. Every bit helps us keep moving.", "No rush. Come back in one piece.", "I'll keep track of that for you."]],
  reward: ["quests", ["Nicely done. Here's what we promised.", "You took care of it. Thank you.", "That helps everyone here. You've earned this."]],
} as const;
export type CampReaction = keyof typeof REACTIONS;
const lastReaction = new Map<CampReaction, string>();
export function campReaction(event: CampReaction): CampLine {
  const [speaker, lines] = REACTIONS[event];
  const choices = lines.filter(line => line !== lastReaction.get(event));
  const text = choices[Math.floor(Math.random() * choices.length)];
  lastReaction.set(event, text);
  return [speaker, text];
}

export function createCampDialogue(root: HTMLElement, meta: MetaState, options: {
  anchor: (speaker: CampSpeaker) => { x: number; y: number };
  highlight: (speaker?: CampSpeaker) => void;
  onIntroEnd: () => void;
}) {
  const environment = root.querySelector<HTMLElement>(".caravan-environment")!;
  const prep = root.querySelector<HTMLElement>(".caravan-prep")!;
  const intro = document.createElement("section");
  intro.className = "caravan-dialogue"; intro.hidden = true;
  intro.setAttribute("aria-label", "Meeting the caravan");
  intro.innerHTML = '<small>MEETING THE CARAVAN</small><nav><button class="camp-skip">Skip intro</button><button class="camp-next">Continue →</button></nav>';
  prep.append(intro);
  const next = intro.querySelector<HTMLButtonElement>(".camp-next")!;
  const bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = "caravan-chat"; bubble.hidden = true;
  bubble.innerHTML = '<strong></strong><p></p><small aria-hidden="true">▸</small>';
  bubble.title = "Tap to continue";
  environment.append(bubble);
  let activeIntro = false, arrival = 1, line = -1;
  let idle = 16 + Math.random() * 10, remaining = 0, exchange: readonly CampLine[] = [], index = 0;
  let speaker: CampSpeaker | undefined;
  let pendingReply: CampLine | undefined;
  const write = (el: HTMLElement, value: CampLine) => {
    speaker = value[0];
    el.dataset.speaker = speaker;
    el.querySelector("strong")!.textContent = SPEAKERS[speaker];
    el.querySelector("p")!.textContent = value[1];
    options.highlight(speaker);
  };
  const clearChat = () => { bubble.hidden = true; exchange = []; speaker = undefined; options.highlight(); };
  const activity = (event?: Event) => {
    // Bubble presses advance the exchange instead of dismissing idle chatter.
    if (event?.target instanceof Node && bubble.contains(event.target)) return;
    if (activeIntro) return;
    clearChat(); idle = 28 + Math.random() * 22;
  };
  root.addEventListener("pointerdown", activity);
  root.addEventListener("keydown", activity);
  const end = () => {
    if (!activeIntro) return;
    activeIntro = false; arrival = 1; intro.hidden = true;
    root.classList.remove("is-intro");
    root.querySelector<HTMLElement>(".caravan-vehicle")!.inert = false;
    clearChat(); bubble.setAttribute("aria-live", "off");
    options.onIntroEnd(); idle = 25 + Math.random() * 20;
    root.querySelector<HTMLButtonElement>(".caravan-start")!.focus({ preventScroll: true });
  };
  const advance = () => {
    if (++line >= CAMP_INTRO.length) { end(); return; }
    write(bubble, CAMP_INTRO[line]); bubble.hidden = false; placeBubble();
    next.disabled = false;
    next.textContent = line === CAMP_INTRO.length - 1 ? "Join the caravan →" : "Continue →";
  };
  next.addEventListener("click", advance);
  intro.querySelector(".camp-skip")!.addEventListener("click", end);
  const placeBubble = () => {
    if (!speaker || bubble.hidden) return;
    const point = options.anchor(speaker), width = bubble.offsetWidth;
    const left = Math.max(8, Math.min(environment.clientWidth - width - 8, point.x - width / 2));
    bubble.style.left = `${left}px`;
    bubble.style.setProperty("--tail-x", `${Math.max(18, Math.min(width - 18, point.x - left))}px`);
    bubble.style.top = `${Math.max(8, Math.min(environment.clientHeight - bubble.offsetHeight - 8, point.y - bubble.offsetHeight - 12))}px`;
  };
  const speak = () => {
    const value = exchange[index];
    write(bubble, value); bubble.hidden = false;
    remaining = Math.max(4, value[1].split(/\s+/).length * .29 + 1.7);
    placeBubble();
  };
  const advanceChat = () => {
    if (!exchange.length) return;
    if (++index < exchange.length) speak();
    else { clearChat(); idle = 35 + Math.random() * 25; }
  };
  bubble.addEventListener("click", () => {
    if (activeIntro) { if (arrival === 1) advance(); }
    else advanceChat();
  });
  return {
    get active() { return activeIntro; },
    get arrival() { return arrival; },
    say(line: CampLine) { pendingReply = line; },
    startIntro() {
      clearChat(); activeIntro = true; arrival = 0; line = -1;
      root.classList.add("is-intro"); intro.hidden = false;
      root.querySelector<HTMLElement>(".caravan-vehicle")!.inert = true;
      bubble.setAttribute("aria-live", "polite");
      next.disabled = true; next.textContent = "Arriving…";
    },
    tick(dt: number, allowed: boolean, heroReady: boolean) {
      if (!allowed) { if (!activeIntro) activity(); return; }
      if (activeIntro) {
        placeBubble();
        if (arrival < 1 && heroReady) {
          arrival = Math.min(1, arrival + dt / 2.6);
          if (arrival === 1) advance();
        }
        return;
      }
      if (pendingReply) {
        clearChat(); exchange = [pendingReply]; pendingReply = undefined; index = 0;
        bubble.setAttribute("aria-live", "polite");
        speak();
        return;
      }
      if (exchange.length) {
        remaining -= dt; placeBubble();
        if (remaining <= 0) advanceChat();
      } else if ((idle -= dt) <= 0) {
        const available = availableCampChat(meta);
        const pool = available.filter(chat => !recent.includes(chat.id));
        const choices = pool.length ? pool : available.filter(chat => chat.id !== recent.at(-1));
        if (!choices.length) { idle = 30; return; }
        const choice = choices[Math.floor(Math.random() * choices.length)];
        recent.push(choice.id); if (recent.length > 8) recent.shift();
        exchange = choice.lines; index = 0; speak();
      }
    },
    destroy() { root.removeEventListener("pointerdown", activity); root.removeEventListener("keydown", activity); intro.remove(); bubble.remove(); },
  };
}
