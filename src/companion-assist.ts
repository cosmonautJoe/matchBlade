import Phaser from "phaser";
import { drawCompanion } from "./companion-view";
import { companionById, type CompanionId } from "./companions";
import { TILE_KEYS } from "./tile-art";

export type CompanionAssistKind = "wood" | "ore" | "keys" | "guard" | "magic";
type Assist = { id: CompanionId; kind: CompanionAssistKind; amount: number; queuedAt: number };
type Playing = Assist & { age: number; duration: number };

const FRAME_W = 128, FRAME_H = 112, FEET = 104, FRAMES = 16;
const FLYERS = new Set<CompanionId>(["pip", "hush", "echo"]);
const COLORS: Record<CompanionAssistKind, number> = {
  wood: 0xe8c490, ore: 0xd6e3e6, keys: 0xffdf82, guard: 0x99dbff, magic: 0xdbb8ff,
};
const TILE: Record<CompanionAssistKind, number> = { wood: 5, ore: 6, keys: 3, guard: 2, magic: 1 };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => { const p = clamp(n); return p * p * (3 - 2 * p); };
const caption = (assist: Assist) => assist.kind === "magic"
  ? companionById(assist.id)!.name : `+${assist.amount}`;

/** Bake the existing camp pet drawing, including its original movement poses. */
function petTexture(scene: Phaser.Scene, id: CompanionId) {
  const key = `companion-assist-${id}-v1`;
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement("canvas");
  canvas.width = FRAME_W * FRAMES;
  canvas.height = FRAME_H * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (let row = 0; row < 2; row++) for (let i = 0; i < FRAMES; i++) {
    ctx.save(); ctx.translate(i * FRAME_W, row * FRAME_H);
    // Moving and settled rows share exactly the same canvas/feet alignment.
    drawCompanion(ctx, id, FRAME_W / 2, FEET, 3.2, i / 16, {
      walking: row === 0 && !FLYERS.has(id), flying: FLYERS.has(id),
      hopping: id === "flurry" && row === 0,
      action: row === 1 && (id === "hazel" || id === "flint") ? "dig" : "watch",
    });
    ctx.restore();
  }
  const texture = scene.textures.addCanvas(key, canvas)!;
  for (let i = 0; i < FRAMES * 2; i++)
    texture.add(i, 0, i % FRAMES * FRAME_W, Math.floor(i / FRAMES) * FRAME_H, FRAME_W, FRAME_H);
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

/**
 * Feedback only: show this after the companion's real reward is applied.
 * Lives in the same coordinate space as the hero, so resize and lane clipping
 * are inherited. No wall-clock timers or extra rewards are created here.
 */
export function createCompanionAssists(
  scene: Phaser.Scene, parent: Phaser.GameObjects.Container,
  hero: Phaser.GameObjects.Sprite, groundY: number,
) {
  const root = scene.add.container(0, 0).setDepth(19).setVisible(false);
  parent.add(root);
  const accent = scene.add.graphics();
  const pet = scene.add.image(0, 0, "__WHITE").setOrigin(.5, FEET / FRAME_H);
  const delivery = scene.add.image(0, 0, "__WHITE").setDisplaySize(24, 24);
  const amount = scene.add.text(0, 0, "", {
    fontFamily: "Arial, sans-serif", fontSize: "22px", fontStyle: "bold",
    color: "#f8fbf1", stroke: "#15202b", strokeThickness: 4,
  }).setResolution(2).setOrigin(0, .5);
  root.add([accent, pet, delivery, amount]);
  let clock = 0, playing: Playing | null = null, queue: Assist[] = [], destroyed = false;
  const magicLastShown = new Map<CompanionId, number>();

  const begin = (next: Assist) => {
    playing = { ...next, age: 0, duration: next.id === "moss" ? 1280 : 1120 };
    pet.setTexture(petTexture(scene, next.id), 0);
    delivery.setTexture(TILE_KEYS[TILE[next.kind]]).setDisplaySize(24, 24);
    amount.setText(caption(next));
    root.setVisible(true);
  };

  const clear = () => {
    playing = null; queue = [];
    if (!destroyed) { root.setVisible(false); accent.clear(); }
  };

  const update = (_time: number, delta: number) => {
    if (destroyed || !hero.scene || !parent.scene) return;
    // Hidden boss/chest scenes should never accumulate delayed pet appearances.
    if (!parent.visible || !hero.visible || parent.alpha === 0) { clear(); return; }
    const dt = Math.min(delta, 80) * scene.time.timeScale;
    clock += dt;
    if (!playing) {
      queue = queue.filter(entry => clock - entry.queuedAt < 1600);
      const next = queue.shift();
      if (!next) return;
      begin(next);
    }
    const a = playing!;
    a.age += dt;
    const p = clamp(a.age / a.duration), incoming = p < .34, outgoing = p > .7;
    const airborne = FLYERS.has(a.id), guard = a.kind === "guard";
    // Work near the feet/belt. Nothing rises into the enemy-name or HP strip.
    const startX = Math.max(28, hero.x - 128);
    const assistX = Math.max(36, hero.x + (guard ? 36 : -44));
    const x = incoming ? Phaser.Math.Linear(startX, assistX, ease(p / .34))
      : outgoing ? Phaser.Math.Linear(assistX, startX, ease((p - .7) / .3)) : assistX;
    const moving = incoming || outgoing;
    const hop = a.id === "flurry" && moving ? Math.abs(Math.sin(p * Math.PI * 5)) * 13
      : a.id === "hazel" && incoming ? Math.abs(Math.sin(p * Math.PI * 7)) * 4 : 0;
    const flight = airborne ? 24 + Math.sin(p * Math.PI) * 8 + Math.sin(p * Math.PI * 4) * 2 : 0;
    const y = groundY - 2 - flight - hop;
    const alpha = clamp(p / .1) * clamp((1 - p) / .14);
    root.setAlpha(alpha);
    pet.setFrame((moving ? 0 : FRAMES) + Math.floor(a.age / 65) % FRAMES)
      .setPosition(x, y).setFlipX(outgoing).setScale(1, guard && !moving ? .88 : 1);

    accent.clear();
    const tint = COLORS[a.kind], impact = clamp((p - .31) / .42);
    const strength = Math.sin(impact * Math.PI);
    if (airborne) accent.fillStyle(0x152229, .12 * alpha).fillEllipse(x, groundY - 1, 26, 5);
    if (moving && !airborne) {
      // A few low dust flecks make the scamper read without adding a particle emitter.
      for (let i = 0; i < 3; i++) {
        const t = (p * 6 + i / 3) % 1;
        accent.fillStyle(0xb9b598, (1 - t) * .32)
          .fillRect(x + (outgoing ? 1 : -1) * (18 + t * 22), groundY - 3 - t * 5, 3, 2);
      }
    }
    if (guard && strength > 0) {
      const sx = x + 12, sy = groundY - 26;
      accent.fillStyle(0x76bfff, .13 * strength);
      accent.lineStyle(2, tint, .9 * strength);
      accent.beginPath(); accent.moveTo(sx - 21, sy - 22);
      accent.lineTo(sx, sy - 29); accent.lineTo(sx + 21, sy - 22);
      accent.lineTo(sx + 18, sy + 1); accent.lineTo(sx, sy + 17);
      accent.lineTo(sx - 18, sy + 1); accent.closePath(); accent.fillPath(); accent.strokePath();
    } else if (a.kind === "magic" && strength > 0) {
      for (let i = 0; i < 5; i++) {
        const t = (impact + i / 5) % 1;
        const px = Phaser.Math.Linear(x + 10, hero.x + 30, t);
        const py = Phaser.Math.Linear(y - 18, groundY - 42, t) - Math.sin(t * Math.PI) * 12;
        accent.fillStyle(i % 2 ? 0xf8eaff : tint, strength * (1 - t) * .9)
          .fillCircle(px, py, i % 2 ? 2 : 3);
      }
    }

    // Carry the real resource tile, then deliver it toward the hero's belt.
    const resource = a.kind === "wood" || a.kind === "ore" || a.kind === "keys";
    const transfer = ease((p - .36) / .28);
    const iconX = Phaser.Math.Linear(x + 13, hero.x + 15, transfer);
    const iconY = Phaser.Math.Linear(y - (airborne ? 3 : 15), groundY - 37, transfer)
      - Math.sin(transfer * Math.PI) * 13;
    delivery.setVisible(resource ? p < .75 : p >= .36 && p < .82)
      .setPosition(resource ? iconX : x + 15, resource ? iconY : groundY - 48)
      .setAlpha(resource ? 1 - clamp((p - .65) / .12) : strength);
    const rewardP = clamp((p - .48) / .38);
    amount.setVisible(p > .48 && p < .86)
      .setPosition(hero.x + 31, groundY - 36 - rewardP * 13)
      .setAlpha(Math.sin(rewardP * Math.PI));

    if (p >= 1) { playing = null; root.setVisible(false); }
  };

  const show = (id: CompanionId, kind: CompanionAssistKind, value = 1) => {
    if (destroyed || !scene.sys.isActive() || !parent.visible || !hero.visible) return;
    // Hush helps every fireball cast; only occasionally bring the owl into the lane.
    // Its caption names the helper, because combat owns the exact damage bonus.
    if (kind === "magic") {
      if (clock - (magicLastShown.get(id) ?? -Infinity) < 4000) return;
      magicLastShown.set(id, clock);
    }
    const reward = Math.max(1, Math.round(value));
    if (playing?.id === id && playing.kind === kind && playing.age < playing.duration * .66) {
      playing.amount += reward;
      amount.setText(caption(playing));
      return;
    }
    const pending = queue.find(entry => entry.id === id && entry.kind === kind);
    if (pending) { pending.amount += reward; pending.queuedAt = clock; return; }
    const entry = { id, kind, amount: reward, queuedAt: clock };
    if (!playing) begin(entry);
    else {
      // Never replay a long backlog of old resource payouts during the next fight.
      queue = queue.filter(item => clock - item.queuedAt < 1600);
      if (queue.length < 2) queue.push(entry);
    }
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true; playing = null; queue = []; magicLastShown.clear();
    scene.events.off(Phaser.Scenes.Events.UPDATE, update);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, destroy);
    parent.off(Phaser.GameObjects.Events.DESTROY, destroy);
    hero.off(Phaser.GameObjects.Events.DESTROY, destroy);
    root.destroy();
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);
  parent.once(Phaser.GameObjects.Events.DESTROY, destroy);
  hero.once(Phaser.GameObjects.Events.DESTROY, destroy);
  return { show, clear, destroy };
}
