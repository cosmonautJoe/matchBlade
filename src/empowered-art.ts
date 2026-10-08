import Phaser from "phaser";
import { tileEffectsEnabled } from "./tile-effects";

export const POWER_COLORS = [0xffc56c, 0xda9cff, 0x8ce5ff, 0xead084, 0x9ae9ef, 0xf3d29f, 0xcad5e7];
export const EMPOWER_GATHER_MS = 280;

/** Decoration belongs to the tile, so gravity and swaps carry the whole effect. */
export function decorateEmpowered(scene: Phaser.Scene, tile: Phaser.GameObjects.Container, type: number, multiplier: 2 | 3 = 2, birthDelay = 0) {
  if (tile.getData("empowered")) return;
  tile.setData("empowered", multiplier);
  const color = POWER_COLORS[type] ?? POWER_COLORS[0];
  const aura = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  const rim = scene.add.graphics();
  const plate = scene.add.rectangle(0, 0, 31, 23, multiplier === 3 ? 0x654821 : 0x15131e, .95).setStrokeStyle(1, multiplier === 3 ? 0xffe3a0 : color, .8);
  const badge = scene.add.text(0, 0, `×${multiplier}`, { fontFamily: '"Pixelify Sans", monospace', fontSize: "20px", fontStyle: "bold", color: "#fff8dc", stroke: "#161523", strokeThickness: 2 }).setOrigin(.5).setResolution(3);
  const stamp = scene.add.container(23, 25, [plate, badge]);
  const decoration = scene.add.container(0, 0, [aura, rim, stamp]);
  const visual = (tile.getData("visual") ?? tile) as Phaser.GameObjects.Container;
  visual.add(decoration);
  if (birthDelay > 0) {
    decoration.setAlpha(0); stamp.setScale(.4);
    scene.tweens.add({ targets: decoration, alpha: 1, delay: birthDelay, duration: 100 });
    scene.tweens.add({ targets: stamp, scale: 1, delay: birthDelay, duration: 220, ease: "Back.easeOut" });
  }
  const shine = tile.getData("shine") as Phaser.GameObjects.Sprite | undefined;
  shine?.destroy(); tile.setData("shine", null);
  const phase = { t: 0 };
  const draw = () => {
    const t = phase.t;
    aura.clear().lineStyle(11, color, .1 + Math.sin(t * Math.PI * 2) * .035).strokeRoundedRect(-39,-39,78,78,10);
    rim.clear().lineStyle(2, color, .85).strokeRoundedRect(-38,-38,76,76,8);
    // Chasing comets follow the edge, leaving a short tapering trail.
    for (let comet = 0; comet < multiplier; comet++) for (let tail = 6; tail >= 0; tail--) {
      const p = ((t + comet / multiplier - tail * .009 + 1) % 1) * 4;
      const side = Math.floor(p), u = p - side;
      const x = side === 0 ? -35 + u*70 : side === 1 ? 35 : side === 2 ? 35-u*70 : -35;
      const y = side === 0 ? -35 : side === 1 ? -35+u*70 : side === 2 ? 35 : 35-u*70;
      aura.fillStyle(tail === 0 ? 0xffffff : color, (7-tail)/8).fillCircle(x,y,tail === 0 ? 3 : 2);
    }
    for (const [x,y] of [[-33,-33],[33,33]]) rim.fillStyle(0xfff6d3).fillPoints([{x,y:y-5},{x:x+3,y},{x,y:y+5},{x:x-3,y}],true);
  };
  draw();
  const tween = scene.tweens.add({ targets: phase, t: 1, duration: 2300, repeat: -1, onUpdate: draw });
  tile.once("destroy", () => { tween.remove(); scene.tweens.killTweensOf([decoration, stamp]); });
}

export function empoweredBurst(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, type: number, multiplier: 2 | 3 = 2) {
  const color = POWER_COLORS[type];
  const ring = scene.add.circle(x,y,22).setStrokeStyle(5,color).setBlendMode(Phaser.BlendModes.ADD);
  parent.add(ring);
  scene.tweens.add({targets:ring,scale:3.5,alpha:0,duration:430,onComplete:()=>ring.destroy()});
  for(let i=0;i<12;i++) {
    const angle=i*Math.PI/6;
    const spark=scene.add.rectangle(x,y, i%2?4:7, i%2?11:7,color).setRotation(angle).setBlendMode(Phaser.BlendModes.ADD);
    parent.add(spark);
    scene.tweens.add({targets:spark,x:x+Math.cos(angle)*100,y:y+Math.sin(angle)*100,alpha:0,scale:.2,duration:450+i*15,ease:"Cubic.easeOut",onComplete:()=>spark.destroy()});
  }
  const label=scene.add.text(x,y-25,`${type===2?"GUARD":type>=3?"LOOT":"POWER"} ×${multiplier}`,{fontFamily:'"Pixelify Sans", monospace',fontSize:"22px",fontStyle:"bold",color:"#fff1c9",stroke:"#161321",strokeThickness:5}).setOrigin(.5);
  parent.add(label);
  scene.tweens.add({targets:label,y:y-85,alpha:0,delay:200,duration:700,onComplete:()=>label.destroy()});
}

/** The cleared match folds into its surviving tile: an earned, readable upgrade. */
export function empoweredGather(scene: Phaser.Scene, parent: Phaser.GameObjects.Container,
  cells: { x: number; y: number }[], target: Phaser.GameObjects.Container, type: number, multiplier: 2 | 3 = 2): Promise<void> {
  if (!tileEffectsEnabled()) return Promise.resolve();
  const color = POWER_COLORS[type], accent = multiplier === 3 ? 0xffd77a : color;
  const sources = cells.filter(cell => cell.x !== target.x || cell.y !== target.y);
  const ink = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  parent.add(ink);
  return new Promise(resolve => {
    const phase = { ms: 0 };
    let finished = false, tween: Phaser.Tweens.Tween | undefined;
    const finish = () => {
      if (finished) return;
      finished = true;
      tween?.remove(); ink.destroy();
      target.off("destroy", finish);
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, finish);
      resolve();
    };
    const draw = () => {
      ink.clear();
      const x = target.x, y = target.y;
      for (const [i, cell] of sources.entries()) {
        const delay = Math.min(i * 10, 80);
        const u = Phaser.Math.Clamp((phase.ms - delay) / (EMPOWER_GATHER_MS - 20 - delay), 0, 1);
        const dx = x - cell.x, dy = y - cell.y, length = Math.max(1, Math.hypot(dx, dy));
        const bend = Math.min(45, length * .2) * (i % 2 ? -1 : 1);
        const mx = (cell.x + x) / 2 - dy / length * bend, my = (cell.y + y) / 2 + dx / length * bend;
        const point = (t: number) => ({ x: (1-t)**2*cell.x+2*(1-t)*t*mx+t*t*x, y: (1-t)**2*cell.y+2*(1-t)*t*my+t*t*y });
        if (u >= 1) continue;
        const head = u * u;
        const fade = Math.min(1, u * 8 + .15) * Math.min(1, (1-u) * 7);
        // Curved, tapered streams carry light out of the exact tiles that cleared.
        for (let tail = 7; tail >= 0; tail--) {
          const p = point(Math.max(0, head - tail * .032));
          const strength = (8-tail)/8;
          ink.fillStyle(accent, fade * strength * .12).fillCircle(p.x, p.y, 8 * strength);
          ink.fillStyle(tail ? color : 0xfffae8, fade * strength).fillCircle(p.x, p.y, (tail ? 2.4 : 3.7) * strength);
        }
        ink.fillStyle(color, Math.max(0, 1-phase.ms/150) * .18).fillCircle(cell.x, cell.y, 26);
      }
      const gather = Math.min(1, phase.ms / EMPOWER_GATHER_MS);
      if (phase.ms < EMPOWER_GATHER_MS) {
        const r = 49 - gather * 12;
        ink.lineStyle(2, accent, .2 + gather * .5).strokeRoundedRect(x-r, y-r, r*2, r*2, 10);
        ink.fillStyle(color, gather * .09).fillCircle(x, y, 26);
      } else {
        resolve(); // The board can fall as soon as the charge arrives; the halo follows its tile.
        const t = Math.min(1, (phase.ms - EMPOWER_GATHER_MS) / 200);
        const r = 38 + t * 17;
        ink.lineStyle(3 * (1-t) + .5, accent, (1-t) * .8).strokeRoundedRect(x-r, y-r, r*2, r*2, 10);
        ink.fillStyle(0xfff5dc, (1-t)**2 * .22).fillRoundedRect(x-35,y-35,70,70,8);
        for (let i = 0; i < (multiplier === 3 ? 8 : 4); i++) {
          const angle = i * Math.PI * 2 / (multiplier === 3 ? 8 : 4) + Math.PI/4;
          const cx = x + Math.cos(angle)*r, cy = y + Math.sin(angle)*r, size = (1-t)*5;
          ink.lineStyle(1.5, accent, 1-t).lineBetween(cx-size,cy,cx+size,cy).lineBetween(cx,cy-size,cx,cy+size);
        }
      }
    };
    draw();
    tween = scene.tweens.add({ targets: phase, ms: EMPOWER_GATHER_MS + 200, duration: EMPOWER_GATHER_MS + 200,
      onUpdate: draw, onComplete: finish });
    target.once("destroy", finish);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, finish);
  });
}
