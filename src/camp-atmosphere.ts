export type CampShelter = { x: number; y: number; width: number; expanded: boolean };
type Point = readonly [number, number];

// Top silhouette in the shared 480 × 370 cart coordinates. The small cart's
// outboard anvil also shelters its work area. All space under the roof is dry,
// including transparent gaps in the illustration and open NPC workspaces.
const STARTER_ROOF: readonly Point[] = [[37,164],[53,149],[65,130],[79,132],[98,137],
  [140,137],[146,133],[157,139],[220,139],[227,133],[238,140],[294,140],
  [303,133],[315,139],[384,137],[402,130],[414,135],[426,166],[426,251],[460,251]];
const EXPANDED_ROOF: readonly Point[] = [[26,123],[60,94],[92,48],[105,48],[123,53],
  [163,53],[173,48],[186,58],[220,58],[228,53],[240,62],[279,62],[289,56],
  [302,60],[344,60],[350,56],[362,65],[395,67],[395,42],[429,42],[429,94],[452,117]];

export function campRoofY(x: number, shelter: CampShelter): number {
  if (shelter.width <= 0) return Infinity;
  const scale = shelter.width / 480, localX = (x - shelter.x) / scale;
  const points = shelter.expanded ? EXPANDED_ROOF : STARTER_ROOF;
  let top = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax,ay] = points[i-1], [bx,by] = points[i];
    if (localX < ax || localX > bx) continue;
    const y = bx === ax ? Math.min(ay,by) : ay + (by-ay)*(localX-ax)/(bx-ax);
    top = Math.min(top,shelter.y+y*scale);
  }
  return top;
}

type Flake = { x: number; y: number; size: number; speed: number; phase: number; front: boolean; resting: number };

/** Small canvas lighting/particle passes; no extra WebGL context on phones. */
export function createCampAtmosphere(biome: string) {
  let width = 0, height = 0, time = 0, seed = 8193;
  let flakes: Flake[] = [];
  const rayCanvas = biome === "forest" ? document.createElement("canvas") : null;
  const rayCtx = rayCanvas?.getContext("2d");
  const gust = () => Math.max(0, Math.sin(time * .55)) ** 2;
  // Shared horizontal breeze in screen pixels/second; small particle swirls sit on top.
  const wind = () => biome === "plains" ? 12 + gust() * 26
    : biome === "forest" ? 7 + Math.sin(time * .45) * 4
    : biome === "snow" ? 5 + Math.sin(time * .8) * 10 : 0;
  const random = () => ((seed = (Math.imul(seed,1664525)+1013904223) >>> 0) / 4294967296);
  const surfaceAt = (x: number, size: number, shelter: CampShelter) => Math.min(height*.91,
    campRoofY(x,shelter),campRoofY(x+size/2,shelter),campRoofY(x+size,shelter));
  const reset = (flake: Flake, w: number, shelter: CampShelter, initial = false) => {
    flake.x = random()*w;
    const roof = surfaceAt(flake.x,flake.size,shelter);
    flake.y = initial ? random()*Math.max(0,roof-flake.size-5) : -flake.size-random()*20;
    flake.resting = 0;
  };

  const softLight = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) => {
    const g = ctx.createRadialGradient(x,y,0,x,y,radius);
    g.addColorStop(0,color);g.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=g;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
  };

  const fallingLayer = (ctx: CanvasRenderingContext2D, front: boolean, shelter: CampShelter) => {
    ctx.save();
    for (const flake of flakes) {
      if (flake.front !== front) continue;
      const surface = surfaceAt(flake.x,flake.size,shelter);
      // Also mask while paused/resizing: no flake can show below a moving roof.
      if (flake.y+flake.size > surface+.5) continue;
      ctx.globalAlpha=(front ? .92 : .62)*(flake.resting ? Math.min(1,flake.resting/.65) : 1);
      const x=Math.round(flake.x), y=Math.round(flake.y);
      const size=flake.size;
      if(biome==="forest") {
        ctx.save();ctx.translate(x+size/2,y+size/2);
        ctx.rotate(flake.resting ? flake.phase : flake.phase+Math.sin(time*1.5+flake.phase)*1.1);
        ctx.scale(flake.resting ? 1 : .3+Math.abs(Math.cos(time*2+flake.phase))*.7,1);
        ctx.fillStyle=["#d9ad58","#acc563","#d58a4b"][Math.floor(flake.phase)%3];
        ctx.fillRect(-size*.35,-size*.2,size*.7,size*.4);
        ctx.fillRect(-size*.2,-size*.35,size*.4,size*.7);
        ctx.fillStyle="#596135";ctx.fillRect(-size*.28,0,size*.7,1);
        ctx.restore();
      } else {
        ctx.fillStyle=front?"#f8fcff":"#dcecf7";
        if(flake.resting)ctx.fillRect(x,y+size-1,size,1);
        else if(size>=4) {
          // Chunky, simple snow crystals read at phone size without huge blobs.
          const arm=Math.max(1,Math.round(size/3)), mid=Math.floor((size-arm)/2);
          ctx.fillRect(x+mid,y,arm,size);ctx.fillRect(x,y+mid,size,arm);
          ctx.globalAlpha*=.45;ctx.fillRect(x+1,y+1,size-2,size-2);
        } else ctx.fillRect(x,y,size,size);
      }
    }
    ctx.restore();
  };

  const plainsWind = (ctx: CanvasRenderingContext2D) => {
    ctx.save();ctx.lineCap="round";
    for(let i=0;i<3;i++) {
      const phase=(time/(6.5+i)+i*.29)%1;
      const x=-110+phase*(width+220), y=height*(.2+i*.23)+Math.sin(phase*Math.PI*2+i)*12;
      const length=Math.min(150,width*.32), alpha=Math.sin(phase*Math.PI)**2*(.3+gust()*.2);
      ctx.strokeStyle=`rgba(251,245,204,${alpha})`;ctx.lineWidth=i===1?2:1.5;
      ctx.beginPath();ctx.moveTo(x-length,y+4);
      ctx.bezierCurveTo(x-length*.65,y-12,x-length*.32,y+10,x,y);
      ctx.stroke();
      ctx.globalAlpha=.55;ctx.beginPath();ctx.moveTo(x-length*.65,y+9);
      ctx.quadraticCurveTo(x-length*.3,y+15,x-8,y+9);ctx.stroke();ctx.globalAlpha=1;
    }
    ctx.restore();
  };

  const bats = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    for(let i=0;i<2;i++) {
      // Short fly-bys separated by empty sky, with an occasional second bat.
      const period=15+i*6, clock=time+(i?10.8:1.3), elapsed=clock%period;
      const duration=3.2+i*.5;
      if(elapsed>duration)continue;
      const phase=elapsed/duration, pass=Math.floor(clock/period);
      const direction=(pass+i)%2?-1:1, travel=-35+phase*(width+70);
      const x=direction===1?travel:width-travel;
      const y=height*(.23+i*.2+(pass%3)*.025-.05*phase)+Math.sin(phase*Math.PI)*Math.min(5,height*.015);
      // Quick wingbeat bursts and brief spread-wing glides, not slow hovering.
      const beat=elapsed%1.25, glide=beat>.85;
      const flap=glide?-5:-3+Math.sin(elapsed*Math.PI*12)*7;
      const span=12+i*2;
      ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(direction,1);
      ctx.rotate(-.08+Math.sin(phase*Math.PI)*.06);
      ctx.globalAlpha=.85;ctx.strokeStyle="#655974";ctx.lineWidth=.8;
      // Side-on, swept wings and a horizontal body avoid a butterfly silhouette.
      ctx.fillStyle="#292638";
      ctx.beginPath();ctx.moveTo(1,0);ctx.lineTo(-8,3-flap*.45);
      ctx.lineTo(-5,5);ctx.lineTo(-2,2);ctx.closePath();ctx.fill();
      ctx.fillStyle="#101222";
      ctx.beginPath();ctx.moveTo(0,-1);ctx.lineTo(-6,-3+flap*.5);
      ctx.lineTo(-span,-4+flap);ctx.lineTo(-span*.72,2+flap*.35);
      ctx.lineTo(-6,0);ctx.lineTo(-4,3);ctx.lineTo(2,1);
      ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillRect(-4,-1,10,4);ctx.fillRect(3,-3,4,4);ctx.fillRect(3,-5,2,3);
      ctx.beginPath();ctx.moveTo(-3,0);ctx.lineTo(-9,3);ctx.lineTo(-3,3);ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  return {
    update(dt: number, w: number, h: number, shelter: CampShelter, animate: boolean) {
      if(w<=0 || h<=0)return;
      if(w!==width || h!==height) {
        width=w;height=h;
        const count=biome==="snow" ? Math.min(100,Math.max(38,Math.round(w*h/5000)))
          : biome==="forest" ? Math.min(34,Math.max(18,Math.round(w*h/11000))) : 0;
        flakes=Array.from({length:count},(_,i)=>{
          const front=i%2===0;
          const size=biome==="forest" ? (front?8:5)+Math.floor(random()*3)
            : front?4+Math.floor(random()*3):2+Math.floor(random()*2);
          const flake:Flake={x:0,y:0,size,speed:(front?23:13)+random()*14,phase:random()*Math.PI*2,front,resting:0};
          reset(flake,w,shelter,true);return flake;
        });
      }
      if(!animate)return;
      dt=Math.min(dt,.06);time+=dt;
      if(biome!=="snow" && biome!=="forest")return;
      for(const flake of flakes) {
        if(flake.resting>0) {
          flake.resting-=dt;
          if(flake.resting<=0)reset(flake,w,shelter);
          continue;
        }
        const oldX=flake.x, oldY=flake.y;
        flake.x+=(wind() + (biome==="forest" ? Math.sin(time*1.4+flake.phase)*12 : Math.sin(time*.8+flake.phase)*6))*dt;
        flake.y+=flake.speed*dt;
        // Sweep a few short segments so drifting flakes cannot skip a roof edge.
        for(let step=1;step<=3;step++) {
          const x=oldX+(flake.x-oldX)*step/3, y=oldY+(flake.y-oldY)*step/3;
          const surface=surfaceAt(x,flake.size,shelter);
          if(y+flake.size>=surface) {
            flake.x=x;flake.y=surface-flake.size;flake.resting=.65+random()*.4;break;
          }
        }
        if(flake.x < -4 || flake.x > w+4 || flake.y>h)reset(flake,w,shelter);
      }
    },
    background(ctx: CanvasRenderingContext2D, shelter: CampShelter) {
      if(!width || !height)return;
      ctx.save();
      if(biome==="forest") {
        const wash=ctx.createLinearGradient(0,0,0,height);
        wash.addColorStop(0,"rgba(21,65,49,.13)");wash.addColorStop(.6,"rgba(43,83,64,.025)");wash.addColorStop(1,"rgba(95,142,101,.08)");
        ctx.fillStyle=wash;ctx.fillRect(0,0,width,height);
        // A few gaps in the canopy: brighter narrow cores with wide soft edges.
        // Fade the isolated ray layer vertically without masking the scenery.
        if(rayCanvas && rayCtx) {
          if(rayCanvas.width!==width || rayCanvas.height!==height) {
            rayCanvas.width=width;rayCanvas.height=height;
          }
          rayCtx.clearRect(0,0,width,height);
          for(let i=0;i<3;i++) {
            const x=width*[-.08,.23,.56][i]+Math.sin(time*.12+i*2)*width*.018;
            const breadth=Math.min(100,width*[.17,.105,.14][i]);
            const strength=.3+Math.sin(time*.23+i*1.6)*.045;
            rayCtx.save();rayCtx.transform(1,0,.34,1,0,0);
            const ray=rayCtx.createLinearGradient(x,0,x+breadth,0);
            ray.addColorStop(0,"rgba(255,244,190,0)");
            ray.addColorStop(.3,`rgba(255,244,190,${strength*.38})`);
            ray.addColorStop(.5,`rgba(255,249,211,${strength})`);
            ray.addColorStop(.7,`rgba(255,244,190,${strength*.38})`);
            ray.addColorStop(1,"rgba(255,244,190,0)");
            rayCtx.fillStyle=ray;rayCtx.fillRect(x,0,breadth,height);rayCtx.restore();
          }
          rayCtx.save();rayCtx.globalCompositeOperation="destination-in";
          const fade=rayCtx.createLinearGradient(0,0,0,height);
          fade.addColorStop(0,"rgba(0,0,0,.2)");fade.addColorStop(.15,"rgba(0,0,0,.9)");
          fade.addColorStop(.4,"#000");fade.addColorStop(.78,"rgba(0,0,0,.3)");fade.addColorStop(1,"rgba(0,0,0,0)");
          rayCtx.fillStyle=fade;rayCtx.fillRect(0,0,width,height);rayCtx.restore();
          ctx.drawImage(rayCanvas,0,0);
        }
        softLight(ctx,width*(.72+Math.sin(time*.1)*.08),height*.35,width*.55,"rgba(185,212,119,.08)");
        fallingLayer(ctx,false,shelter);
      } else if(biome==="snow") {
        const wash=ctx.createLinearGradient(0,0,0,height);
        wash.addColorStop(0,"rgba(116,162,207,.12)");wash.addColorStop(.55,"rgba(154,206,231,.035)");wash.addColorStop(1,"rgba(209,235,244,.1)");
        ctx.fillStyle=wash;ctx.fillRect(0,0,width,height);
        softLight(ctx,width*(.25+Math.sin(time*.08)*.1),height*.65,width*.7,"rgba(221,243,250,.075)");
        fallingLayer(ctx,false,shelter);
      } else if(biome==="plains") {
        softLight(ctx,width*.22,height*.2,width*.8,"rgba(255,221,134,.1)");
        softLight(ctx,width*((time*.014)%1.7-.35),height*.4,width*.45,"rgba(38,67,62,.13)");
        plainsWind(ctx);
      } else if(biome==="dungeon") {
        softLight(ctx,width*.65,height*.25,width*.7,"rgba(136,114,171,.1)");
        bats(ctx);
      }
      ctx.restore();
    },
    foreground(ctx: CanvasRenderingContext2D, shelter: CampShelter) {
      ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
      if(!width || !height)return;
      if(biome==="snow")fallingLayer(ctx,true,shelter);
      else if(biome==="forest") {
        fallingLayer(ctx,true,shelter);
        ctx.save();
        // A handful of slow pollen/firefly flecks; never a full-screen swarm.
        for(let i=0;i<8;i++) {
          const x=width*(.1+((i*.137+time*.003)% .8))+Math.sin(time*.5+i)*6;
          const y=height*(.2+(i%4)*.17)+Math.sin(time*.32+i*1.7)*9;
          const alpha=.3+Math.pow((Math.sin(time*.8+i*2)+1)/2,3)*.55;
          softLight(ctx,x,y,8,`rgba(207,232,128,${alpha*.3})`);
          ctx.fillStyle=`rgba(228,237,167,${alpha})`;ctx.fillRect(Math.round(x),Math.round(y),2.5,2.5);
        }
        ctx.restore();
      } else if(biome==="plains") {
        ctx.save();
        // Seeds and loose blades make the direction of the breeze visible.
        for(let i=0;i<14;i++) {
          const phase=(time/(7+i%4)+i*.071)%1;
          const x=-10+phase*(width+20),y=height*(.28+(i%5)*.13)+Math.sin(time*1.7+i)*12;
          if(y+4>campRoofY(x,shelter))continue;
          ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.rotate(Math.sin(time*2+i)*.7);
          ctx.globalAlpha=.8;ctx.fillStyle=i%3?"#c5c678":"#f1e8b8";
          ctx.fillRect(-3,0,i%3?6:3,2);ctx.restore();
        }
        ctx.restore();
      }
    },
    wind,
    windSway: () => biome==="plains" ? Math.sin(time*1.9)*(.045+.11*gust()) : 0,
  };
}
