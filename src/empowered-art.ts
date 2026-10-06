import Phaser from "phaser";

export const POWER_COLORS = [0xffc56c, 0xda9cff, 0x8ce5ff];

/** Decoration belongs to the tile, so gravity and swaps carry the whole effect. */
export function decorateEmpowered(scene: Phaser.Scene, tile: Phaser.GameObjects.Container, type: number) {
  if (tile.getData("empowered")) return;
  tile.setData("empowered", true);
  const color = POWER_COLORS[type] ?? POWER_COLORS[0];
  const aura = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  const rim = scene.add.graphics();
  const plate = scene.add.rectangle(23, 25, 31, 23, 0x15131e, .95).setStrokeStyle(1, color, .8);
  const badge = scene.add.text(23, 25, "×2", { fontFamily: '"Pixelify Sans", monospace', fontSize: "20px", fontStyle: "bold", color: "#fff8dc", stroke: "#161523", strokeThickness: 2 }).setOrigin(.5);
  const visual = (tile.getData("visual") ?? tile) as Phaser.GameObjects.Container;
  visual.add([aura, rim, plate, badge]);
  const shine = tile.getData("shine") as Phaser.GameObjects.Sprite | undefined;
  shine?.destroy(); tile.setData("shine", null);
  const phase = { t: 0 };
  const draw = () => {
    const t = phase.t;
    aura.clear().lineStyle(11, color, .1 + Math.sin(t * Math.PI * 2) * .035).strokeRoundedRect(-39,-39,78,78,10);
    rim.clear().lineStyle(2, color, .85).strokeRoundedRect(-38,-38,76,76,8);
    // Chasing comets follow the edge, leaving a short tapering trail.
    for (let comet = 0; comet < 2; comet++) for (let tail = 6; tail >= 0; tail--) {
      const p = ((t + comet * .5 - tail * .009 + 1) % 1) * 4;
      const side = Math.floor(p), u = p - side;
      const x = side === 0 ? -35 + u*70 : side === 1 ? 35 : side === 2 ? 35-u*70 : -35;
      const y = side === 0 ? -35 : side === 1 ? -35+u*70 : side === 2 ? 35 : 35-u*70;
      aura.fillStyle(tail === 0 ? 0xffffff : color, (7-tail)/8).fillCircle(x,y,tail === 0 ? 3 : 2);
    }
    for (const [x,y] of [[-33,-33],[33,33]]) rim.fillStyle(0xfff6d3).fillPoints([{x,y:y-5},{x:x+3,y},{x,y:y+5},{x:x-3,y}],true);
  };
  draw();
  const tween = scene.tweens.add({ targets: phase, t: 1, duration: 2300, repeat: -1, onUpdate: draw });
  tile.once("destroy", () => tween.remove());
}

export function empoweredBurst(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, type: number) {
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
  const label=scene.add.text(x,y-25,type===2?"GUARD ×2":"POWER ×2",{fontFamily:'"Pixelify Sans", monospace',fontSize:"22px",fontStyle:"bold",color:"#fff1c9",stroke:"#161321",strokeThickness:5}).setOrigin(.5);
  parent.add(label);
  scene.tweens.add({targets:label,y:y-85,alpha:0,delay:200,duration:700,onComplete:()=>label.destroy()});
}
