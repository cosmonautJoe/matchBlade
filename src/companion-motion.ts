import type { CompanionId } from "./companions";
import { campRoofY } from "./camp-atmosphere";

type Point = { x: number; y: number };
type BirdPose = Point & { flying: boolean; hopping: boolean; facing: number };
export type PetPose = BirdPose & { walking: boolean; action: "watch" | "sniff" | "sleep" | "dig" | "nibble" | "groom" | "hang" };
type Stop = { point: Point; travel: number; rest: number; action: PetPose["action"]; motion?: "fly" | "hop" };

/** A complete out-and-back routine; pauses belong to the animal, not a shared timer. */
function routine(time: number, home: Point, stops: Stop[]): PetPose {
  let t=time%stops.reduce((total,stop)=>total+stop.travel+stop.rest,0), from=home;
  for(const stop of stops) {
    const facing=stop.point.x>=from.x?1:-1;
    if(t<stop.travel) {
      const p=t/stop.travel, u=p*p*(3-2*p);
      const flying=stop.motion==="fly", hopping=stop.motion==="hop";
      const lift=flying?Math.sin(p*Math.PI)*18:hopping?Math.abs(Math.sin(p*Math.PI*3))*7:0;
      return {x:from.x+(stop.point.x-from.x)*u,y:from.y+(stop.point.y-from.y)*u-lift,
        facing,flying,hopping,walking:!flying&&!hopping,action:"watch"};
    }
    t-=stop.travel;
    if(t<stop.rest)return {...stop.point,facing,flying:false,hopping:false,walking:false,action:stop.action};
    t-=stop.rest;from=stop.point;
  }
  return {...home,facing:1,flying:false,hopping:false,walking:false,action:"watch"};
}

export function petCampPose(id: CompanionId, time: number, layout: {
  width: number; height: number; cart: {x: number; y: number; width: number; expanded: boolean};
}): PetPose {
  const {width:w,height:h,cart}=layout, scale=cart.width/480;
  const clamp=(x:number)=>Math.max(22,Math.min(w-22,x));
  const ground=(x:number):Point=>({x:clamp(w*x),y:h*.91});
  const perch=(x:number,y:number):Point=>({x:clamp(cart.x+x*scale),y:Math.max(34,cart.y+y*scale)});
  const roof=(localX:number):Point=>{
    const x=clamp(cart.x+localX*scale), y=campRoofY(x,cart);
    return {x,y:Math.max(34,Number.isFinite(y)?y:cart.y+140*scale)};
  };
  const left=roof(cart.expanded?211:190), right=roof(cart.expanded?325:367);
  if(id==="pip")return {...birdCampPose(time,ground(.24),left,roof(270)),walking:false,action:"watch"};
  if(id==="hush")return routine(time,right,[
    {point:right,travel:0,rest:15,action:"watch"},
    {point:roof(cart.expanded?370:340),travel:3,rest:13,action:"sleep",motion:"fly"},
    {point:right,travel:3.5,rest:9,action:"watch",motion:"fly"},
  ]);
  if(id==="echo") {
    const roost=perch(cart.expanded?130:105,cart.expanded?86:165);
    return routine(time,roost,[
      {point:roost,travel:0,rest:11,action:"hang"},
      {point:{x:clamp(w*.42),y:Math.max(45,left.y-37)},travel:2,rest:0,action:"watch",motion:"fly"},
      {point:{x:clamp(w*.72),y:Math.max(50,right.y-14)},travel:2.3,rest:0,action:"watch",motion:"fly"},
      {point:roost,travel:3,rest:15,action:"hang",motion:"fly"},
    ]);
  }
  const routes: Record<Exclude<CompanionId,"pip"|"hush"|"echo">, {a:number;b:number;out:number;back:number;rest:number;home:number;action:PetPose["action"];motion?:"hop"}> = {
    bramble:{a:.09,b:.23,out:5,back:5,rest:7,home:7,action:"sniff"},
    moss:{a:.30,b:.36,out:11,back:13,rest:9,home:8,action:"watch"},
    hazel:{a:.48,b:.41,out:1.8,back:2.2,rest:6,home:9,action:"dig"},
    flurry:{a:.61,b:.72,out:2.8,back:3.5,rest:10,home:8,action:"watch",motion:"hop"},
    rime:{a:.79,b:.86,out:2,back:2.6,rest:9,home:13,action:"groom"},
    flint:{a:.94,b:.88,out:5,back:6,rest:12,home:11,action:"dig"},
  };
  const r=routes[id], home=ground(r.a);
  return routine(time,home,[
    {point:home,travel:0,rest:r.home,action:id==="hazel"?"nibble":id==="rime"?"sleep":r.action},
    {point:ground(r.b),travel:r.out,rest:r.rest,action:r.action,motion:r.motion},
    {point:home,travel:r.back,rest:1,action:r.action,motion:r.motion},
  ]);
}

/** Positions are supplied from the live wagon, so perches follow its scale. */
export function birdCampPose(time: number, ground: Point, roofLeft: Point, roofRight: Point): BirdPose {
  const t = time % 40;
  const hopEnd = { x: ground.x + 14, y: ground.y };
  const rest = (point: Point, facing = 1): BirdPose => ({ ...point, flying: false, hopping: false, facing });
  const travel = (from: Point, to: Point, progress: number, lift: number, flying = true): BirdPose => {
    const u = progress * progress * (3 - 2 * progress);
    return {
      x: from.x + (to.x - from.x) * u,
      y: from.y + (to.y - from.y) * u - Math.sin(Math.PI * progress) ** 2 * lift,
      facing: to.x >= from.x ? 1 : -1, flying, hopping: !flying,
    };
  };
  if (t < 3) return rest(ground);
  if (t < 4.2) return travel(ground,hopEnd,(t-3)/1.2,6,false);
  if (t < 6) return rest(hopEnd);
  if (t < 8.8) return travel(hopEnd,roofLeft,(t-6)/2.8,18);
  if (t < 19) return rest(roofLeft);
  if (t < 20.8) return travel(roofLeft,roofRight,(t-19)/1.8,24);
  if (t < 33) return rest(roofRight,-1);
  if (t < 36) return travel(roofRight,ground,(t-33)/3,20);
  return rest(ground,-1);
}
