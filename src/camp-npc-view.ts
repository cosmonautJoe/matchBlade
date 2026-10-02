type ExitFrame = (progress: number, from: DOMRect, to: DOMRect) => void;
export type CampNpc = "shop" | "quests" | "forge" | "magic" | "unknown";

export function campNpcCaption(npc: CampNpc, camp: HTMLElement) {
  switch (npc) {
    case "quests": return { name: "The guide", detail: "Goals and rewards" };
    case "forge": return { name: camp.classList.contains("has-forge") ? "Wren" : "The forge", detail: "Sword upgrades" };
    case "magic": return { name: "Aldwin", detail: "Staff upgrades" };
    case "unknown": return { name: "Unknown traveler", detail: "Room for someone new" };
    default: return { name: "The merchant", detail: "Supplies for the road" };
  }
}

/** A gentle close-up of a live caravan NPC or their still-locked workspace. */
export function createCampNpcView(camp: HTMLElement, host: HTMLElement, npc: CampNpc, animate: boolean) {
  const scenery = camp.querySelector<HTMLCanvasElement>(".caravan-scenery");
  const art = camp.querySelector<HTMLCanvasElement>(".caravan-art");
  const vehicle = camp.querySelector<HTMLElement>(".caravan-vehicle");
  const environment = camp.querySelector<HTMLElement>(".caravan-environment");
  if (!scenery || !art || !vehicle || !environment)
    return { destroy: () => {}, close: (done: () => void, _onFrame?: ExitFrame) => done() };
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  host.prepend(canvas);
  const ctx = canvas.getContext("2d")!;
  const started = performance.now();
  // The isolated visual fixture can exercise camera motion on reduced-motion CI hosts.
  // This override is absent from production builds and never applies on the player's origin.
  const previewMotion = import.meta.env.DEV && location.port === "5174" &&
    sessionStorage.getItem("matchblade-preview-shop-motion") === "on";
  const reducedMotion = () => !previewMotion && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = animate && !reducedMotion() ? 420 : 0;
  let frame = 0, last = 0;
  let camera = { scale: 1, x: 0, y: 0 };
  let exit: { started: number; bounds: DOMRect; camera: typeof camera; done: () => void; onFrame?: ExitFrame } | null = null;
  const draw = (now: number) => {
    frame = requestAnimationFrame(draw);
    if (document.hidden || now - last < (exit || now - started < duration ? 16 : 33)) return;
    last = now;
    const env = environment.getBoundingClientRect();
    const exitT = exit ? Math.min(1, (now - exit.started) / 440) : 0;
    const exitEase = exitT * exitT * (3 - 2 * exitT);
    exit?.onFrame?.(exitEase, exit.bounds, env);
    const bounds = host.getBoundingClientRect();
    const wagon = vehicle.getBoundingClientRect();
    const w = bounds.width, h = bounds.height;
    if (!w || !h || !wagon.width) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(w * dpr), height = Math.round(h * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    if (exit) {
      // Keep one fixed-size canvas throughout the exit. Animate its crop, not its
      // backing buffer or DOM bounds; the real camp stays hidden underneath it.
      const mix = (a: number, b: number) => a + (b - a) * exitEase;
      ctx.beginPath();
      ctx.rect(mix(exit.bounds.left, env.left) - bounds.left,
        mix(exit.bounds.top, env.top) - bounds.top,
        mix(exit.bounds.width, env.width), mix(exit.bounds.height, env.height));
      ctx.clip();
    }
    ctx.fillStyle = "#24352b"; ctx.fillRect(0, 0, w, h);
    const grown = camp.classList.contains("is-expanded");
    const wagonScale = wagon.width / 480;
    const x = wagon.left - env.left, y = wagon.top - env.top;
    const focus = npc === "quests" ? (grown ? [318, 158] : [302, 244])
      : npc === "forge" ? (grown ? [335, 260] : [428, 273])
      : npc === "magic" || npc === "unknown" ? (grown ? [180, 158] : [384, 210])
      : (grown ? [151, 260] : [147, 239]);
    const npcX = x + focus[0] * wagonScale;
    const npcY = y + focus[1] * wagonScale;
    // Keep surrounding caravan details in frame rather than filling it with the NPC.
    const zoom = Math.max(1, Math.min(1.6, Math.min(w / 320, h / 260) / wagonScale));
    const t = duration ? Math.min(1, (now - started) / duration) : 1;
    const ease = 1 - Math.pow(1 - t, 3);
    let scale = 1 + (zoom - 1) * ease;
    const initialX = env.left - bounds.left, initialY = env.top - bounds.top;
    // Avoid exposing empty canvas past the scenery on the rightmost workspaces.
    const targetX = Math.min(0, Math.max(w - env.width * zoom, w * .5 - npcX * zoom));
    let tx = initialX + (targetX - initialX) * ease;
    let ty = initialY + (h * .47 - npcY * zoom - initialY) * ease;
    if (exit) {
      scale = exit.camera.scale + (1 - exit.camera.scale) * exitEase;
      tx = exit.camera.x + (env.left - exit.camera.x) * exitEase - bounds.left;
      ty = exit.camera.y + (env.top - exit.camera.y) * exitEase - bounds.top;
    }
    camera = { scale, x: tx + bounds.left, y: ty + bounds.top };
    ctx.translate(tx, ty); ctx.scale(scale, scale);
    ctx.drawImage(scenery, 0, 0, env.width, env.height);
    ctx.drawImage(art, x, y, wagon.width, wagon.height);
    ctx.restore();
    if (exit && exitT === 1) { const done = exit.done; exit = null; done(); }
  };
  draw(performance.now());
  return {
    destroy: () => { cancelAnimationFrame(frame); exit = null; canvas.remove(); },
    close: (done: () => void, onFrame?: ExitFrame) => {
      if (exit) return;
      if (reducedMotion() || document.hidden) { done(); return; }
      const bounds = host.getBoundingClientRect(), env = environment.getBoundingClientRect();
      const left = Math.min(bounds.left, env.left), top = Math.min(bounds.top, env.top);
      const union = new DOMRect(left, top, Math.max(bounds.right, env.right) - left,
        Math.max(bounds.bottom, env.bottom) - top);
      const parent = host.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
      exit = { started: performance.now(), bounds, camera: { ...camera }, done, onFrame };
      Object.assign(host.style, { position: "absolute", zIndex: "2", background: "transparent",
        left: `${union.left - parent.left}px`, top: `${union.top - parent.top}px`,
        width: `${union.width}px`, height: `${union.height}px` });
      // Paint the enlarged surface before the next browser frame can stretch it.
      cancelAnimationFrame(frame); last = 0; draw(performance.now());
    },
  };
}
