import Phaser from "phaser";

/** Small painted spell tokens, shared by the arena and its timing display. */
export function malgrimToken(scene: Phaser.Scene, kind: "gold" | "red" | "blue") {
  const key = `malgrim-${kind}`;
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, 128, 128)!;
  const c = texture.context;
  const colors = kind === "gold" ? ["#fff2b4", "#e8a638", "#673415"]
    : kind === "red" ? ["#ffaea0", "#b93843", "#3e1628"] : ["#d5fbff", "#4cbbdb", "#183e6a"];
  const glow = c.createRadialGradient(64,64,32,64,64,64);
  glow.addColorStop(0,colors[1]+"88"); glow.addColorStop(1,colors[1]+"00");
  c.fillStyle=glow; c.fillRect(0,0,128,128);
  const body=c.createRadialGradient(48,38,4,64,70,52);
  body.addColorStop(0,colors[0]); body.addColorStop(.35,colors[1]); body.addColorStop(1,colors[2]);
  c.beginPath();
  if(kind==="red") {
    for(let i=0;i<16;i++){const a=i*Math.PI/8; const r=i%2?43:53; const x=64+Math.cos(a)*r,y=64+Math.sin(a)*r; i?c.lineTo(x,y):c.moveTo(x,y);}
    c.closePath();
  } else c.arc(64,64,49,0,Math.PI*2);
  c.fillStyle=body; c.fill(); c.strokeStyle=colors[0]; c.lineWidth=3; c.stroke();
  c.beginPath(); c.arc(64,64,40,0,Math.PI*2); c.strokeStyle=colors[0]+"66"; c.lineWidth=2; c.stroke();
  c.strokeStyle="#fff6de"; c.fillStyle="#fff6de"; c.lineWidth=6; c.lineCap="round";
  if(kind==="red") {c.beginPath();c.moveTo(51,51);c.lineTo(77,77);c.moveTo(77,51);c.lineTo(51,77);c.stroke();}
  if(kind==="gold") {c.beginPath();c.moveTo(64,40);c.lineTo(81,64);c.lineTo(64,88);c.lineTo(47,64);c.closePath();c.stroke();c.beginPath();c.arc(64,64,5,0,Math.PI*2);c.fill();}
  texture.refresh();
  return key;
}

export function malgrimArena(scene: Phaser.Scene, R: {x:number;y:number;w:number;h:number;cx:number;cy:number}, stage:number, title:string, instruction:string, progress:string) {
  const root=scene.add.container(R.x,R.y).setDepth(40);
  const g=scene.add.graphics();
  g.fillStyle(0x101923,1);g.fillRoundedRect(0,0,R.w,R.h,18);
  g.lineStyle(2,0x80613e,.8);g.strokeRoundedRect(3,3,R.w-6,R.h-6,16);
  g.fillStyle(0x1e2930,1);g.fillRoundedRect(10,10,R.w-20,98,12);
  // Etched stone rings and seams give the play area structure without noise.
  g.lineStyle(1,0xc19757,.08);
  for(let r=100;r<R.w*.6;r+=68)g.strokeEllipse(R.w/2,R.h*.55,r*2,r*1.3);
  for(let y=150;y<R.h-55;y+=86)g.lineBetween(18,y,R.w-18,y);
  g.fillStyle(0x080f18,.7);g.fillRoundedRect(12,R.h-58,R.w-24,46,10);
  root.add(g);
  const text=(x:number,y:number,value:string,size:number,color:string)=>scene.add.text(x,y,value,{fontFamily:"system-ui, sans-serif",fontSize:`${size}px`,fontStyle:"bold",color}).setOrigin(0,0);
  root.add(text(22,18,title,26,"#fff0d5"));
  root.add(text(22,57,instruction,20,"#c4cfda"));
  const tally=text(R.w-24,20,progress,23,"#ffe1a0").setOrigin(1,0);root.add(tally);
  for(let i=0;i<3;i++) {
    const x=22+i*27;
    root.add(scene.add.rectangle(x+7,91,18,4,i<stage?0xf3ca77:0x47535d));
  }
  const legends=[ ["gold","Tap"],["blue","Swipe"],["red","Avoid"] ] as const;
  legends.forEach(([kind,label],i)=>{
    const x=R.w*(i+.5)/3;
    root.add(scene.add.image(x-40,R.h-35,malgrimToken(scene,kind)).setDisplaySize(28,28));
    root.add(text(x-19,R.h-48,label,21,kind==="red"?"#ffada9":kind==="blue"?"#adebff":"#ffe4aa"));
  });
  // Sparse rising embers behind targets, always below interaction layers.
  for(let i=0;i<8;i++) {
    const ember=scene.add.circle(28+(i*.137%1)*(R.w-56),R.h-80,1.5+i%2,0xe8ad62,.25);
    root.add(ember);
    const tween=scene.tweens.add({targets:ember,y:125,alpha:0,duration:4200+i*230,delay:i*380,repeat:-1});
    ember.once("destroy",()=>tween.stop());
  }
  return {root,tally};
}
