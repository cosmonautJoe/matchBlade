import type { CampShelter } from "./camp-atmosphere";

type Puff = { age: number; life: number; size: number; rise: number; drift: number; phase: number; windX: number; velocity: number };

/** Pixel-edged smoke in cart coordinates, drawn on the scenery so it can rise above the roof. */
export function createCaravanSmoke() {
  const puffs: Puff[] = [];
  let lit = false, untilNext = 0, burstAge = 10;
  const emit = (boost: number, wind: number, age = 0) => {
    if (puffs.length >= 32) return;
    puffs.push({ age, life: 3.2 + Math.random() * .8, size: (4 + Math.random() * 2) * (1 + boost * .85),
      rise: 17 + Math.random() * 5 + boost * 11, drift: (Math.random() - .5) * 3,
      phase: Math.random() * Math.PI * 2,
      windX: wind * Math.max(0, age - .6), velocity: wind * Math.min(1, age / .65) });
  };
  return {
    burst() { burstAge = 0; untilNext = 0; },
    update(dt: number, active: boolean, animate: boolean, wind: number) {
      if (!active) { puffs.length = 0; lit = false; return; }
      if (!lit) {
        lit = true;
        // Start with an established trail, including when motion is disabled.
        for (let i = 8; i >= 0; i--) emit(0, wind, i * .36);
      }
      if (!animate) return;
      const step = Math.min(.1, dt);
      burstAge += step;
      const boost = Math.min(1, burstAge / .22) * Math.max(0, 1 - burstAge / 3);
      for (let i = puffs.length - 1; i >= 0; i--) {
        const puff = puffs[i];
        puff.age += step;
        // Heat lifts fresh smoke first. Older puffs gradually catch the breeze;
        // integrating their motion keeps a changing gust from snapping the plume.
        const target = wind * Math.min(1, puff.age / .65);
        puff.velocity += (target - puff.velocity) * (1 - Math.exp(-step * 3));
        puff.windX += puff.velocity * step;
        if (puff.age >= puff.life) puffs.splice(i, 1);
      }
      untilNext -= step;
      if (untilNext <= 0) { emit(boost, wind); untilNext = .38 - boost * .24; }
    },
    draw(ctx: CanvasRenderingContext2D, cart: CampShelter) {
      if (!lit || !cart.expanded || cart.width <= 0) return;
      const scale = cart.width / 480;
      ctx.save();
      // Center of the expanded cart's chimney opening; its lip covers the source.
      ctx.translate(cart.x + 412 * scale, cart.y + 43 * scale);
      ctx.scale(scale, scale);
      const blob = (x: number, y: number, radius: number) => {
        // One path avoids darker seams between the overlapping pixel clusters.
        ctx.beginPath();
        ctx.rect(x - radius * .55, y - radius, radius * 1.1, radius * 2);
        ctx.rect(x - radius, y - radius * .55, radius * 2, radius * 1.1);
        ctx.rect(x - radius * .8, y - radius * .8, radius * 1.6, radius * 1.6);
        ctx.fill();
      };
      for (const puff of puffs) {
        const t = puff.age / puff.life;
        const x = Math.round(puff.windX + puff.drift * puff.age + Math.sin(puff.phase + puff.age * 1.6) * puff.age * 2);
        const y = -Math.round(puff.age * puff.rise + 3);
        const radius = Math.round(puff.size + t * 10);
        const opacity = Math.min(1, puff.age / .14) * Math.pow(1 - t, 1.35);
        ctx.globalAlpha = opacity * .3; ctx.fillStyle = "#666e70";
        blob(x + 1, y + 2, radius + 1);
        ctx.globalAlpha = opacity * .6; ctx.fillStyle = "#cecbbd";
        blob(x, y, radius);
        ctx.globalAlpha = opacity * .2; ctx.fillStyle = "#f0e6cb";
        blob(x - radius * .2, y - radius * .25, Math.max(2, radius * .6));
      }
      ctx.restore();
    },
  };
}
