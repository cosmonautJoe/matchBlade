import Phaser from "phaser";
import { findMatches, hasPossibleMove, swap, type Coord } from "./board";
import { bossArenaArt, type ArenaBounds, type BossTheme } from "./boss-arena-art";

type FinaleOptions = {
  scene: Phaser.Scene; rect: ArenaBounds; theme: BossTheme; kind: "shells" | "rimes";
  bossKey: string; bossOrigin: number; flip: boolean;
  alive: () => boolean; hurt: () => void; hit: (fraction: number) => void;
  win: () => void; sound: (key: string) => void;
};

/** A finale owns its input, clocks and tweens; destroying it retires all callbacks. */
export function createBossFinale(o: FinaleOptions) {
  const { scene, rect: R } = o;
  const titles = { shells: ["Connect the wards", "Trace through three matching seals"], rimes: ["Crack the lake", "Match tiles to connect cracks upward"] };
  const [title, cue] = titles[o.kind];
  const art = bossArenaArt(scene, R, o.theme, title, cue, "", true);
  const root = art.root;
  let dead = false, finished = false;
  const clocks: Phaser.Time.TimerEvent[] = [];
  const objects: Phaser.GameObjects.GameObject[] = [];
  const listeners: [string, (...args: any[]) => void][] = [];
  const live = () => !dead && !finished && o.alive();
  const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => { root.add(object); objects.push(object); return object; };
  const later = (ms: number, fn: () => void) => clocks.push(scene.time.delayedCall(ms, () => { if (live()) fn(); }));
  const listen = (event: string, fn: (...args: any[]) => void) => { scene.input.on(event, fn); listeners.push([event, fn]); };
  const local = (p: Phaser.Input.Pointer) => root.getWorldTransformMatrix().applyInverse(p.x, p.y);
  const text = (x: number, y: number, value: string, size = 22, color = "#e4ebdc") => add(scene.add.text(x, y, value,
    { fontFamily: "system-ui, sans-serif", fontSize: `${size}px`, fontStyle: "bold", color }).setOrigin(.5));
  const burst = (x: number, y: number, color: number) => {
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      const chip = add(scene.add.rectangle(x, y, 6, 3, color));
      scene.tweens.add({ targets: chip, x: x + Math.cos(a) * 65, y: y + Math.sin(a) * 45, alpha: 0, angle: i * 30, duration: 430, onComplete: () => chip.destroy() });
    }
  };
  const complete = () => {
    if (!live()) return;
    finished = true; o.hit(1); o.sound("combo3");
    clocks.push(scene.time.delayedCall(900, () => { if (!dead && o.alive()) o.win(); }));
  };
  root.once("destroy", () => {
    dead = true;
    for (const clock of clocks) clock.remove(false);
    for (const [event, fn] of listeners) scene.input.off(event, fn);
    for (const object of objects) scene.tweens.killTweensOf(object);
  });

  if (o.kind === "shells") {
    const cx = R.w/2, cy = R.h*.57, rx = Math.min(R.w*.33,240), ry = Math.min((R.h-195)/2,180);
    const barrier = add(scene.add.graphics());
    barrier.lineStyle(3,0x95c49b,.35).strokeEllipse(cx,cy,rx*1.5,ry*1.4);
    const mage = add(scene.add.sprite(cx,cy+55,`${o.bossKey}-idle`).setOrigin(.5,o.bossOrigin).setScale(1.15).setFlipX(o.flip).play(`${o.bossKey}-idle`));
    const line = add(scene.add.graphics());
    const seals: {x:number;y:number;kind:number;root:Phaser.GameObjects.Container;art:Phaser.GameObjects.Graphics}[]=[];
    for(let i=0;i<6;i++) {
      const a=-Math.PI/2+i*Math.PI/3, x=cx+Math.cos(a)*rx, y=cy+Math.sin(a)*ry;
      const node=add(scene.add.container(x,y)), g=scene.add.graphics(); node.add(g); seals.push({x,y,kind:0,root:node,art:g});
    }
    let round=0, route:number[]=[], tracing=false, epoch=0, ready=false;
    const caption=text(cx,R.h-58,"",23,"#cbe4b1");
    const draw = () => seals.forEach((s,i)=>{
      const g=s.art, active=route.includes(i), target=s.kind===round;
      g.clear().fillStyle(0x10221f,.95).fillCircle(0,0,35);
      g.lineStyle(active?5:3,active?0xffe7a0:target?0xb8db9a:0x678b86,active?1:.8).strokeCircle(0,0,35);
      g.lineStyle(4,active?0xffe7a0:0xc7e2d2);
      if(s.kind===0)g.strokePoints([{x:0,y:-18},{x:15,y:0},{x:0,y:18},{x:-15,y:0}],true);
      if(s.kind===1)g.strokeTriangle(0,-17,17,14,-17,14);
      if(s.kind===2){g.lineBetween(0,18,0,-17);g.lineBetween(0,0,-16,-12);g.lineBetween(0,0,16,-12);}
    });
    const reset = () => { route=[];tracing=false;line.clear();draw(); };
    const setup = () => {
      const e=++epoch;reset();ready=true;
      const bag=Phaser.Utils.Array.Shuffle([round,round,round,(round+1)%3,(round+2)%3,(round+1)%3]);
      seals.forEach((s,i)=>s.kind=bag[i]); draw();
      caption.setText(["Connect the diamonds","Connect the triangles","Connect the branches"][round]);
      art.tally.setText(`${round} / 3`);
      later(7500,()=>{ if(e!==epoch)return; mage.play(`${o.bossKey}-attack`);
        scene.tweens.add({targets:seals.map(s=>s.root),alpha:.45,duration:220,yoyo:true,repeat:2});
        later(1400,()=>{if(e!==epoch)return;reset();o.hurt();mage.play(`${o.bossKey}-idle`);setup();});
      });
    };
    const visit = (p: Phaser.Input.Pointer) => {
      if(!live()||!ready)return;const pt=local(p), i=seals.findIndex(s=>Math.hypot(pt.x-s.x,pt.y-s.y)<40);
      if(i<0||route.includes(i))return;
      if(seals[i].kind!==round){if(tracing){reset();o.sound("swap");}return;}
      if(!tracing){tracing=true;route=[];}
      route.push(i);o.sound("pickup");draw();line.clear().lineStyle(5,0xe6e7a7,.9);
      for(let j=1;j<route.length;j++){const a=seals[route[j-1]],b=seals[route[j]];line.lineBetween(a.x,a.y,b.x,b.y);}
      if(route.length===3){
        epoch++;tracing=false;ready=false;round++;o.hit(round/3);burst(cx,cy,0xd5e9a2);o.sound("block2");
        art.tally.setText(`${round} / 3`);
        barrier.setAlpha(1-round/3);
        if(round===3){caption.setText("BARRIER BROKEN");complete();}else later(650,setup);
      }
    };
    let pressed=false;
    listen("pointerdown",(p:Phaser.Input.Pointer)=>{if(!live()||!ready)return;pressed=true;reset();visit(p);});
    listen("pointermove",(p:Phaser.Input.Pointer)=>{if(pressed&&p.isDown&&tracing)visit(p);});
    listen("pointerup",()=>{pressed=false;if(live()&&tracing)reset();});
    setup();
  } else {
    const wide=R.w>R.h, cols=wide?8:6, rows=wide?3:4, cell=Math.min((R.w-72)/cols,(R.h-195)/rows);
    const left=(R.w-cols*cell)/2, top=R.h-48-rows*cell;
    const guardian=add(scene.add.sprite(R.w/2,top+6,`${o.bossKey}-idle`).setOrigin(.5,o.bossOrigin).setScale(Math.min(.9,(top-103)/92)).setFlipX(o.flip).play(`${o.bossKey}-idle`));
    const bed=add(scene.add.graphics());
    bed.fillStyle(0x28627a,.7).fillRoundedRect(left-8,top-6,cols*cell+16,rows*cell+12,12);
    const types=["tile-sword","tile-staff","tile-shield","tile-key"];
    let grid:number[][]=[], busy=false, selected:Coord|null=null, down:Coord|null=null, matches=0;
    const tiles:Phaser.GameObjects.Image[][]=Array.from({length:rows},()=>[]);
    const sources=[(rows-1)*cols+cols/2-1,(rows-1)*cols+cols/2];
    const cracks=new Set<number>(sources);
    let connected=new Set<number>();
    const newGrid=()=>{
      do { grid=Array.from({length:rows},()=>Array(cols).fill(-1));
        for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
          let t:number;do{t=Math.floor(Math.random()*4);}while(c>1&&grid[r][c-1]===t&&grid[r][c-2]===t||r>1&&grid[r-1][c]===t&&grid[r-2][c]===t);grid[r][c]=t;
        }
      }while(!hasPossibleMove(grid));
    };newGrid();
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)tiles[r][c]=add(scene.add.image(left+(c+.5)*cell,top+(r+.5)*cell,types[grid[r][c]]).setDisplaySize(cell-7,cell-7));
    const ice=add(scene.add.graphics()), selection=add(scene.add.graphics());
    const paint=()=>{
      connected=new Set<number>();const queue=[...sources];
      while(queue.length){const n=queue.pop()!;if(connected.has(n)||!cracks.has(n))continue;connected.add(n);
        const r=Math.floor(n/cols),c=n%cols;if(r>0)queue.push(n-cols);if(r<rows-1)queue.push(n+cols);if(c>0)queue.push(n-1);if(c<cols-1)queue.push(n+1);
      }
      ice.clear();
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
        const n=r*cols+c,x=left+c*cell,y=top+r*cell;
        ice.fillStyle(0x9edced,cracks.has(n)?.07:.24).fillRoundedRect(x+4,y+4,cell-8,cell-8,5);
        ice.lineStyle(2,0xb9efff,.35).strokeRoundedRect(x+4,y+4,cell-8,cell-8,5);
        if(cracks.has(n)){
          ice.lineStyle(connected.has(n)?4:2,connected.has(n)?0xe0fbff:0x73bed8,.95);
          ice.strokePoints([{x:x+cell*.5,y},{x:x+cell*.37,y:y+cell*.36},{x:x+cell*.61,y:y+cell*.65},{x:x+cell*.5,y:y+cell}]);
          for(const next of [n+1])if(c<cols-1&&cracks.has(next))ice.lineBetween(x+cell*.5,y+cell*.5,x+cell*1.5,y+cell*.5);
        }
      }
      const reached=rows-1-Math.min(...[...connected].map(n=>Math.floor(n/cols)));
      art.tally.setText(`${reached} / ${rows-1}`);o.hit(reached/(rows-1));
      return reached===rows-1;
    };paint();
    const at=(p:Phaser.Input.Pointer):Coord|null=>{const pt=local(p),c=Math.floor((pt.x-left)/cell),r=Math.floor((pt.y-top)/cell);return r>=0&&r<rows&&c>=0&&c<cols?{r,c}:null;};
    const select=(p:Coord|null)=>{selected=p;selection.clear();if(p)selection.lineStyle(4,0xffe4a1).strokeRoundedRect(left+p.c*cell+2,top+p.r*cell+2,cell-4,cell-4,6);};
    const resolve=()=>{
      const hits=findMatches(grid);
      if(!hits.length){busy=false;if(!hasPossibleMove(grid)){newGrid();for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)tiles[r][c].setTexture(types[grid[r][c]]);}return;}
      const cleared=new Set(hits.flatMap(m=>m.cells.map(p=>p.r*cols+p.c)));
      for(const n of cleared){const r=Math.floor(n/cols),c=n%cols;cracks.add(n);grid[r][c]=-1;burst(left+(c+.5)*cell,top+(r+.5)*cell,0xb9edff);tiles[r][c].setAlpha(.15);}
      o.sound("block2");
      if(paint()){
        guardian.play(`${o.bossKey}-hurt`);scene.tweens.add({targets:guardian,y:guardian.y+60,alpha:0,duration:700});
        for(const row of tiles)for(const tile of row)scene.tweens.add({targets:tile,y:tile.y+25,alpha:.2,duration:650});
        complete();return;
      }
      later(260,()=>{
        for(let c=0;c<cols;c++){
          const survivors=grid.map(row=>row[c]).filter(t=>t>=0), missing=rows-survivors.length;
          for(let r=0;r<rows;r++)grid[r][c]=r<missing?Math.floor(Math.random()*4):survivors[r-missing];
        }
        for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
          const tile=tiles[r][c];tile.setTexture(types[grid[r][c]]).setAlpha(1).setY(top+(r+.5)*cell-12);
          scene.tweens.add({targets:tile,y:top+(r+.5)*cell,duration:180,ease:"Sine.easeOut"});
        }
        later(200,resolve);
      });
    };
    const move=(a:Coord,b:Coord)=>{
      if(busy||!live()||Math.abs(a.r-b.r)+Math.abs(a.c-b.c)!==1)return;
      select(null);swap(grid,a,b);
      if(!findMatches(grid).length){swap(grid,a,b);o.sound("swap");return;}
      matches++;
      if(matches%4===0){
        guardian.play(`${o.bossKey}-attack`).once("animationcomplete",()=>live()&&guardian.play(`${o.bossKey}-idle`));
        later(650,()=>{o.hurt();burst(R.w/2,top,0xe0f8ff);});
      }
      busy=true;const ta=tiles[a.r][a.c],tb=tiles[b.r][b.c];tiles[a.r][a.c]=tb;tiles[b.r][b.c]=ta;
      scene.tweens.add({targets:ta,x:left+(b.c+.5)*cell,y:top+(b.r+.5)*cell,duration:160});
      scene.tweens.add({targets:tb,x:left+(a.c+.5)*cell,y:top+(a.r+.5)*cell,duration:160});later(170,resolve);
    };
    listen("pointerdown",(p:Phaser.Input.Pointer)=>{if(busy||!live())return;down=at(p);if(!down)return;if(selected&&Math.abs(selected.r-down.r)+Math.abs(selected.c-down.c)===1){move(selected,down);down=null;}else select(down);});
    listen("pointerup",(p:Phaser.Input.Pointer)=>{const end=at(p),start=down;down=null;if(start&&end)move(start,end);});
  }
  return root;
}
