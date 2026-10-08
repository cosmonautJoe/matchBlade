import { companionById, type CompanionId, type RescuePayment } from "./companions";
import type { PetPose } from "./companion-motion";
import "./companions.css";
import { resourceAmounts } from "./ui-resources";

/** Small hand-built pixel silhouettes, shared by the rescue and campsite. */
export function drawCompanion(ctx: CanvasRenderingContext2D, id: CompanionId, x: number, feet: number, scale: number, time: number,
  pose: Partial<PetPose> = {}) {
  // Keep pets small in both the campsite and rescue portrait.
  if (id !== "moss") scale *= .65;
  ctx.save(); ctx.translate(Math.round(x),Math.round(feet)); ctx.scale(scale * (pose.facing ?? 1),scale);
  const rect=(color:string,x:number,y:number,w:number,h:number)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
  const blink=time%5.9>5.7 || pose.action === "sleep";
  if (!pose.flying && !pose.hopping && pose.action!=="hang") rect("#17212a55",-10,-1,20,2);
  const bob=pose.flying || pose.hopping ? 0 : pose.walking ? (Math.sin(time*16)>0?-1:0) : Math.sin(time*2.4)>.8?-1:0;
  ctx.translate(0,bob);
  if(pose.action==="sniff" || pose.action==="dig")ctx.rotate(Math.sin(time*7)*.04);
  if(id==="bramble") {
    rect("#563728",-10,-11,16,9); rect("#d98038",-9,-10,14,7);
    const tail=Math.sin(time*2)>0?0:1;
    rect("#8b4929",-17,-8+tail,8,5);rect("#edbd79",-18,-9+tail,4,4);
    rect("#442d29",1,-20,3,7);rect("#442d29",8,-20,3,7);
    rect("#ed9849",0,-16,12,9);rect("#f4dbad",5,-10,9,3);
    rect("#342b2b",12,-10,2,2);rect("#342b2b",8,-14,2,blink?1:2);
    const stride=pose.walking?Math.round(Math.sin(time*12)*2):0;
    rect("#865030",-6-stride,-4,2,3);rect("#865030",4+stride,-4,2,3);
    rect("#4e3127",-7+stride,-4,3,4);rect("#4e3127",3-stride,-4,3,4);
  } else if(id==="pip") {
    rect("#172a38",-9,-10,10,7);rect("#457990",-8,-9,9,3);
    rect("#172a38",-13,-6,7,3);rect("#21384b",-5,-15,11,12);
    rect("#edf0dd",-1,-10,6,6);rect("#233442",0,-20,8,10);
    rect("#697e7c",8,-15,4,2);rect("#fff5ce",5,-18,2,blink?1:2);
    if (pose.flying) {
      // Eight wing poses: lift, spread, downstroke and recovery. Legs tuck up.
      const tip = [-16,-18,-16,-14,-11,-9,-11,-14][Math.floor(time*14)%8];
      for(let i=0;i<3;i++) {
        const wy=Math.round(-12+(tip+12)*i/2);
        rect(i===2?"#d8e4d8":i===1?"#4d8094":"#243f51",-3-i*2,wy,3,3);
      }
      rect("#af8b56",0,-5,3,2);
    } else {
      rect("#af8b56",-2,-3,2,3);rect("#af8b56",3,-3,2,3);
      if(time%9<1){rect("#4d8094",-6,-13,3,2);rect("#d8e4d8",-7,-14,2,2);}
    }
  } else if(id==="moss") {
    rect("#354431",-12,-11,20,8);rect("#75844a",-9,-15,14,4);
    rect("#8e9c55",-11,-11,17,6);rect("#c1be73",-9,-11,4,3);
    rect("#526538",-4,-13,2,8);rect("#526538",-10,-8,15,2);
    rect("#b8bd74",7,-8,7,5);rect("#303a32",11,-7,1,blink?1:2);
    const step=pose.walking?Math.round(Math.sin(time*5)):0;
    rect("#8f9e64",-9-step,-4,4,4);rect("#8f9e64",3+step,-4,4,4);
  } else if(id==="hazel") {
    // Tall curled tail, small round ears, warm chestnut fur.
    const tail=Math.round(Math.sin(time*3));
    rect("#533b30",-14,-24+tail,8,17);rect("#bd7540",-13,-23+tail,7,13);
    rect("#e3a267",-12,-22+tail,4,4);rect("#533b30",-8,-19+tail,3,11);
    rect("#674332",-8,-13,16,10);rect("#b87442",-7,-12,14,8);
    rect("#e3bd84",2,-10,5,6);rect("#70442f",2,-23,4,5);rect("#bb7b43",3,-22,2,3);
    rect("#c5874a",0,-19,11,10);rect("#eac692",7,-13,6,3);
    rect("#30282a",8,-17,2,blink?1:2);rect("#30282a",12,-13,2,2);
    const step=pose.walking?Math.round(Math.sin(time*18)*2):0;
    rect("#674332",-6-step,-4,5,4);rect("#674332",5+step,-4,4,4);
    if(pose.action==="nibble" || pose.action==="dig") {
      rect("#5b3b2e",7,-7,4,4);rect("#d2a261",7,-8,4,2);
      rect("#e3bd84",4,-7+(Math.floor(time*8)%2),4,2);
    }
  } else if(id==="hush") {
    // Broad facial discs distinguish the owl from Pip, without oversized wings.
    rect("#3d3540",-8,-21,16,18);rect("#8e7b69",-7,-20,14,16);
    rect("#c8b793",-5,-12,10,8);rect("#615047",-9,-24,5,5);rect("#615047",4,-24,5,5);
    rect("#a68d70",-8,-23,16,10);rect("#ead8aa",-6,-21,5,7);rect("#ead8aa",1,-21,5,7);
    rect("#272c35",-4,-19,2,blink?1:3);rect("#272c35",3,-19,2,blink?1:3);
    rect("#cda15b",-1,-15,2,3);rect("#68513f",-5,-3,3,3);rect("#68513f",3,-3,3,3);
    if(pose.flying) {
      const lift=[-4,-7,-5,-1,2,3,1,-1][Math.floor(time*12)%8];
      for(const side of [-1,1])for(let i=0;i<3;i++)rect(i===2?"#c0a782":"#6d5e57",side<0?-9-i*2:7+i*2,-13+lift*i/2,3,4);
    } else {rect("#6d5e57",-8,-12,3,8);rect("#6d5e57",5,-12,3,8);}
  } else if(id==="flurry") {
    const alert=pose.action==="watch", ear=alert?0:2;
    rect("#718795",-10,-12,19,10);rect("#d9e6df",-9,-12,17,9);
    rect("#f7f2de",-12,-9,5,5);rect("#f4f0df",3,-19,10,12);
    rect("#7b91a0",3,-31+ear,3,13);rect("#e9ebdf",4,-30+ear,2,12);
    rect("#879ca5",8,-30-ear,3,12);rect("#f6f1df",9,-29-ear,2,11);
    rect("#dbb3ad",5,-28+ear,1,7);rect("#29394b",10,-16,2,blink?1:2);
    rect("#bd8f8d",13,-13,2,2);rect("#a4b8be",-7,-6,7,6);rect("#eef0df",-6,-3,8,3);
    rect("#b1c3c5",7,-4,6,4);
  } else if(id==="rime") {
    // Long low stoat body, black tail tip, rounded ears, quick little paws.
    const tail=Math.round(Math.sin(time*4)*2);
    rect("#869ba9",-14,-7+tail,7,3);rect("#273544",-17,-7+tail,4,3);
    rect("#7c92a0",-10,-10,19,7);rect("#e3e8dc",-9,-10,17,6);
    rect("#f4f0d7",-7,-6,15,3);rect("#8097a4",6,-18,3,5);rect("#e5e8db",7,-17,2,4);
    rect("#f2efdc",5,-14,10,8);rect("#e8c4ae",13,-9,3,2);
    rect("#253541",12,-12,2,blink?1:2);
    const step=pose.walking?Math.round(Math.sin(time*21)*2):0;
    rect("#81949d",-7-step,-4,3,4);rect("#81949d",7+step,-4,3,4);
    if(pose.action==="groom")rect("#cad7d3",10,-10+(Math.floor(time*8)%3),3,3);
  } else if(id==="echo") {
    const hanging=pose.action==="hang";
    if(hanging){ctx.translate(0,-23);ctx.scale(1,-1);}
    rect("#272937",-4,-13,9,11);rect("#73617d",-3,-12,7,8);
    rect("#453f54",-5,-19,10,8);rect("#726078",-5,-24,3,6);rect("#726078",3,-24,3,6);
    rect("#e6c298",-3,-17,2,blink?1:2);rect("#e6c298",2,-17,2,blink?1:2);
    if(pose.flying) {
      const lift=[-5,-8,-5,-1,3,4,2,-1][Math.floor(time*18)%8];
      for(const side of [-1,1]) {
        rect("#292a3c",side<0?-10:4,-12+lift/2,7,5);
        rect("#5e4e72",side<0?-13:9,-12+lift,5,4);
        rect("#938097",side<0?-14:12,-13+lift,3,2);
      }
    } else {rect("#393345",-5,-12,3,9);rect("#393345",3,-12,3,9);}
    rect("#95829b",-2,-3,1,3);rect("#95829b",2,-3,1,3);
  } else if(id==="flint") {
    rect("#3d363c",-12,-12,23,10);rect("#756775",-11,-12,20,8);
    rect("#a48e99",-9,-13,10,3);rect("#584f5e",-10,-4,5,4);
    rect("#8d7a86",3,-15,9,10);rect("#c99391",10,-11,6,3);rect("#eab0a1",14,-11,2,2);
    rect("#2b2932",8,-13,1,blink?1:2);
    const dig=pose.action==="dig"?Math.floor(time*10)%3:pose.walking?Math.round(Math.sin(time*10)):0;
    rect("#cba397",4+dig,-5,7,4);rect("#e4caba",6+dig,-2,1,2);rect("#e4caba",9+dig,-2,1,2);
    if(pose.action==="dig")for(let i=0;i<3;i++)rect("#8f7758",-14-i*3,-2-Math.round((time*3+i)%3),2,2);
  }
  ctx.restore();
}

export function showCompanionRescue(id: CompanionId, alreadyRescued: boolean,
  supplies: () => { keys: number; wood: number }, rescue: (payment: RescuePayment) => boolean, leave: () => void) {
  const def=companionById(id)!;
  const root=document.createElement("div"); root.className="companion-rescue";
  root.innerHTML=`<section role="dialog" aria-modal="true" aria-labelledby="rescue-title"><span class="rescue-eyebrow">A STOP ON THE ROAD</span><h2 id="rescue-title"></h2><div class="rescue-cage"><canvas width="240" height="160" aria-hidden="true"></canvas><span class="rescue-bars"></span><span class="rescue-lock">◆</span></div><p class="rescue-copy"></p><p class="rescue-benefit"></p><div class="rescue-options"><button data-payment="key">Use 1 key</button><button data-payment="wood">Make lever · 3 wood</button><small></small></div><button class="rescue-continue">Leave for now</button></section>`;
  const title=root.querySelector("h2")!, copy=root.querySelector<HTMLElement>(".rescue-copy")!, benefit=root.querySelector<HTMLElement>(".rescue-benefit")!;
  const options=root.querySelector<HTMLElement>(".rescue-options")!, next=root.querySelector<HTMLButtonElement>(".rescue-continue")!;
  const payments=[...options.querySelectorAll<HTMLButtonElement>("button")];
  payments[0].replaceChildren(document.createTextNode("Unlock cage"), resourceAmounts({ keys: 1 }));
  payments[1].replaceChildren(document.createTextNode("Make a lever"), resourceAmounts({ wood: 3 }));
  const ctx=root.querySelector("canvas")!.getContext("2d")!;
  let freed=alreadyRescued, frame=0, destroyed=false;
  const update=()=>{
    const pack=supplies();
    root.classList.toggle("is-freed",freed); title.textContent=freed?`${def.name} joined you!`:`${def.name} · ${def.species}`;
    copy.textContent=freed?def.greeting:"A stuck cage by the road. Unlock it, or make a lever to pry it open.";
    benefit.textContent=`From your next run: ${def.benefit}`;
    options.hidden=freed; next.textContent=freed?"Back to the road →":"Leave for now";
    next.classList.toggle("is-secondary",!freed);
    payments[0].disabled=freed || pack.keys<1;payments[1].disabled=freed || pack.wood<3;
    options.querySelector("small")!.replaceChildren(resourceAmounts(pack), document.createTextNode("Available · bag + camp"));
  };
  for(const button of payments)button.onclick=()=>{
    if(freed)return;
    if(!rescue(button.dataset.payment as RescuePayment)){update();return;}
    freed=true;update();next.focus();
  };
  next.onclick=()=>{destroy();leave();};
  const draw=(now:number)=>{
    if(destroyed)return;
    frame=requestAnimationFrame(draw); if(root.hidden||document.hidden)return;
    ctx.clearRect(0,0,240,160);ctx.imageSmoothingEnabled=false;
    const time=now/1000;
    const ground={plains:"#7f9560",forest:"#536d49",snow:"#d7e7e5",dungeon:"#777084"}[def.biome];
    ctx.fillStyle="#594e45";ctx.fillRect(40,133,160,3);ctx.fillStyle=ground;ctx.fillRect(38,129,165,4);
    for(let i=0;i<7;i++){ctx.fillStyle=ground;ctx.fillRect(43+i*23,125+i%3,3,5);}
    drawCompanion(ctx,id,120+(freed?Math.sin(time*1.8)*5:0),130,4,time,{walking:freed});
  };
  const stop=(e:Event)=>e.stopPropagation();
  for(const name of ["pointerdown","pointerup","touchstart","touchend","click"])root.addEventListener(name,stop);
  const focusTrap=(e:KeyboardEvent)=>{
    e.stopPropagation();
    if(e.key==="Tab"){
      const buttons=freed?[next]:[...payments.filter(b=>!b.disabled),next];
      const i=buttons.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault();buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();
    }
  };
  root.addEventListener("keydown",focusTrap);
  const oldFocus=document.activeElement;
  const destroy=()=>{if(destroyed)return;destroyed=true;cancelAnimationFrame(frame);root.remove();if(oldFocus instanceof HTMLElement)oldFocus.focus();};
  document.getElementById("game")!.append(root);update();(freed?next:payments.find(b=>!b.disabled)??next).focus();frame=requestAnimationFrame(draw);
  return {root,destroy};
}
