/** Station animation lives in map coordinates, independently of touch targets. */
export function animateVillage(map: HTMLElement, art: HTMLImageElement, motionButton: HTMLButtonElement) {
  const canvas = document.createElement("canvas");
  canvas.className = "village-animation";
  canvas.setAttribute("aria-hidden", "true");
  map.append(canvas);
  const ctx = canvas.getContext("2d")!;
  const sheet = new Image();
  sheet.src = `${import.meta.env.BASE_URL}camp/village-npcs-v2.png`;
  const player = new Image();
  player.src = `${import.meta.env.BASE_URL}camp/village-player.png`;
  // Each 362px cell has different padding. Walking X follows the head/body
  // center, not the planted foot (which alternates sides during the stride).
  // Y stays on the ground baseline; idle retains its two-boot midpoint.
  const playerAnchors = [
    [229,332],[200.5,330],[179.5,328],[161.5,335],
    [224.5,320],[202.5,313],[180.5,318],[161,318],
    // Idle uses the midpoint between both boots, independent of which boot
    // contains more opaque pixels in a particular pose.
    [221,302],[199.5,303],[180.5,303],[162.5,303],
  ] as const;
  let preference: string | null = null;
  try { preference = localStorage.getItem("matchblade-camp-motion"); } catch { /* Storage may be unavailable. */ }
  let enabled = preference !== "off";
  const arrivalDuration = 4.6;
  let arrival = enabled ? 0 : arrivalDuration;
  const updateButton = () => {
    motionButton.textContent = enabled ? "Ⅱ Pause camp animation" : "▶ Play camp animation";
    motionButton.setAttribute("aria-pressed", String(enabled));
  };
  const toggle = () => {
    enabled = !enabled;
    if (!enabled) arrival = arrivalDuration;
    preference = enabled ? "on" : "off";
    try { localStorage.setItem("matchblade-camp-motion", preference); } catch { /* Keep the session preference. */ }
    last = performance.now();
    updateButton(); draw();
  };
  motionButton.addEventListener("click", toggle);
  updateButton();
  let wide = false, destroyed = false, visible = true, request = 0, last = 0;
  let elapsed = 0;
  const size = () => {
    wide = map.clientWidth > map.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(map.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(map.clientHeight * dpr));
    draw();
  };
  const sprite = (row: number, frame: number, x: number, feet: number, size: number, mirrored = false, lean = 0) => {
    if (!sheet.complete || !sheet.naturalWidth) return;
    const w = sheet.naturalWidth / 8, h = sheet.naturalHeight / 4;
    ctx.save(); ctx.translate(x,feet);
    ctx.rotate(lean);
    if (mirrored) ctx.scale(-1,1);
    ctx.drawImage(sheet, frame * w, row * h, w, h, -size / 2, -size * .96, size, size);
    ctx.restore();
  };
  const glow = (x: number, y: number, r: number, color: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, "transparent");
    ctx.globalAlpha = alpha; ctx.fillStyle = g; ctx.fillRect(x-r,y-r,r*2,r*2); ctx.globalAlpha = 1;
  };
  const flame = (x: number, y: number, scale: number, t: number) => {
    ctx.save(); ctx.translate(x,y); ctx.scale(scale,scale);
    for (let i=0;i<7;i++) {
      const phase = (t * .8 + i / 7) % 1;
      ctx.globalAlpha = (1-phase)*.8;
      ctx.fillStyle = i%2 ? "#ffb43c" : "#ffe994";
      ctx.fillRect(Math.sin(i*7+t*2)*12*(1-phase),-phase*45,4,7);
    }
    ctx.restore();
  };
  const draw = () => {
    const W = wide ? 1536 : 1024, H = wide ? 1024 : 1536;
    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
    ctx.clearRect(0,0,W,H); ctx.imageSmoothingEnabled = true;
    const t = elapsed;
    // Short actions separated by long, staggered idle holds. Each pose advances
    // quickly enough to read as an action rather than a sequence of stills.
    const action = (period: number, offset: number, duration: number) => {
      const phase = (t + offset) % period;
      return phase < duration ? Math.min(7, Math.floor(phase / duration * 8)) : 0;
    };
    const smithTime = (t + 5) % 12;
    const smithFrame = action(12, 5, 1.6);
    const wizardFrame = action(17, 9, 2.4);
    sprite(0, action(14, 1, 2), wide ? 391 : 236, wide ? 473 : 595, wide ? 130 : 128);
    sprite(1, smithFrame, wide ? 1214 : 799, wide ? 474 : 650, wide ? 148 : 145, true);
    sprite(2, wizardFrame, wide ? 1220 : 836, wide ? 742 : 1119, wide ? 154 : 154);
    // Open the scroll shortly after arrival, hold it long enough to read,
    // then roll it away. The quiet weight shift continues between actions.
    const questTime = (t + 17.2) % 18;
    const questFrames = [0,1,2,3,4,3,4,5,6,7];
    const questFrame = questTime < 5 ? questFrames[Math.floor(questTime / .5)] : 0;
    sprite(3, questFrame, wide ? 420 : 322, wide ? 710 : 1100, wide ? 151 : 130, false, Math.sin(t*1.3)*.012);
    // Put the anvil in front of the smith's legs using the clean background.
    if (art.complete && art.naturalWidth) {
      const box = wide ? [1137,422,82,53] : [718,611,87,69];
      const [x,y,w,h] = box;
      ctx.drawImage(art,x/W*art.naturalWidth,y/H*art.naturalHeight,w/W*art.naturalWidth,h/H*art.naturalHeight,x,y,w,h);
    }
    const fx = wide ? 1300 : 880, fy = wide ? 387 : 572;
    flame(fx,fy,1,t); flame(wide?775:517,wide?468:771,1.15,t+.3);
    glow(fx,fy,50,"#ffa027",.12+Math.sin(t*9)*.035);
    // One short spark burst, synchronized with the hammer's downstroke.
    if(smithTime > 1 && smithTime < 1.3) {
      const p = (smithTime-1)/.3;
      for(let i=0;i<9;i++) {
        const a = Math.PI+(i/8)*Math.PI;
        ctx.fillStyle = `rgba(255,${180+i*7},85,${1-p})`;
        ctx.fillRect((wide?1175:762)+Math.cos(a)*p*42,(wide?430:620)+Math.sin(a)*p*35+p*p*18,3,3);
      }
    }
    // Spell motes orbit the study orb during the casting pose.
    const mx = wide ? 1094 : 754, my = wide ? 654 : 1044;
    if(wizardFrame>=3 && wizardFrame<=5) {
      glow(mx,my,42,"#62cfff",.4);
      for(let i=0;i<8;i++) {
        const a = t*2+i*Math.PI/4;
        ctx.fillStyle="#bdf5ff"; ctx.fillRect(mx+Math.cos(a)*27,my+Math.sin(a)*18,3,3);
      }
    }
    // Quest-board glints point to the scrolls without moving the label.
    const qx = wide ? 322 : 169, qy = wide ? 614 : 1017;
    glow(qx,qy,24,"#ffdf8b",.09+.07*Math.sin(t*1.3));
    // Warp the painted water itself inside shoreline masks. The bridge, rocks,
    // and banks remain static; highlights alone were invisible on a phone.
    const pools = wide
      ? [[[391,839],[470,844],[550,854],[643,855],[663,870],[579,883],[479,877],[403,859]],
         [[882,873],[965,880],[1060,875],[1160,876],[1140,900],[1060,908],[953,897],[882,886]]]
      : [[[112,1269],[180,1287],[260,1308],[340,1327],[425,1328],[425,1374],[345,1379],[260,1358],[200,1338],[112,1300]],
         [[604,1345],[680,1345],[750,1315],[808,1322],[816,1347],[859,1360],[877,1382],[826,1425],[740,1410],[685,1384],[604,1380]]];
    if(art.complete && art.naturalWidth) for(const points of pools) {
      ctx.save(); ctx.beginPath();
      points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath(); ctx.clip();
      const minX=Math.min(...points.map(p=>p[0])), maxX=Math.max(...points.map(p=>p[0]));
      const minY=Math.min(...points.map(p=>p[1])), maxY=Math.max(...points.map(p=>p[1]));
      for(let y=minY;y<maxY;y+=3) {
        const shift=Math.sin(y*.13-t*3)*5+Math.sin(y*.07+t*2)*3;
        ctx.drawImage(art,(minX-10+shift)/W*art.naturalWidth,y/H*art.naturalHeight,(maxX-minX+20)/W*art.naturalWidth,3/H*art.naturalHeight,minX-10,y,maxX-minX+20,3);
      }
      ctx.restore();
    }
    const streams = wide
      ? [[470,855,165,17],[935,882,190,14]]
      : [[260,1343,165,19],[681,1364,102,17],[756,1393,79,15]];
    for(const [x,y,w,h] of streams) for(let i=0;i<16;i++) {
      const phase = (t*.28+i*.173)%1;
      ctx.fillStyle=`rgba(200,248,255,${Math.sin(phase*Math.PI)*.65})`;
      ctx.fillRect(x+phase*w,y+(i*19)%h,10+i%12,3);
    }
    const waterfalls = wide
      ? [[95,300,12,20]]
      : [[801,1309,15,28],[899,1360,12,28]];
    for(const [x,y,w,h] of waterfalls) {
      for(let i=0;i<12;i++) {
        const p=(t*1.3+i*.13)%1;
        ctx.fillStyle=`rgba(228,252,255,${.2+Math.sin(p*Math.PI)*.65})`;
        ctx.fillRect(x+i%4*w/4-p*9,y+p*h,4,11);
      }
    }
    // The arrival uses the same route in both layouts: center of the south
    // trail, center of the bridge, then the clearing below the campfire.
    // Its progress survives rotation; resizing never starts another arrival.
    if (player.complete && player.naturalWidth) {
      const progress = Math.min(1, arrival / arrivalDuration);
      const walking = progress < 1;
      const x = W*.5 + progress*(wide ? 2 : 8);
      const y = (H+65)*(1-progress) + (wide ? 665 : 965)*progress;
      const frame = walking ? Math.floor(arrival*12)%8 : 8+Math.floor(t*3)%4;
      const cellW = player.naturalWidth/4, cellH = player.naturalHeight/3;
      const size = wide ? 132 : 148;
      ctx.fillStyle="rgba(25,22,16,.2)";
      ctx.beginPath(); ctx.ellipse(x,y-3,size*.18,size*.055,0,0,Math.PI*2); ctx.fill();
      const [anchorX,anchorY] = playerAnchors[frame];
      ctx.drawImage(player,(frame%4)*cellW,Math.floor(frame/4)*cellH,cellW,cellH,x-size*anchorX/362,y-size*anchorY/362,size,size);
    }
    // Start over the clearing so the passing shade is visible on arrival.
    // A few soft lobes read as clouds rather than uniform screen dimming.
    for(let i=0;i<2;i++) {
      const travel=(t/38+.38+i*.49)%1;
      const x=-W*.45+travel*W*1.9, y=H*(.29+i*.36)+Math.sin(t*.035+i)*H*.035;
      ctx.save(); ctx.translate(x,y); ctx.scale(1,.7);
      const radius=W*.29;
      for (const [dx,dy,scale,opacity] of [[0,0,1,.18],[-.58,.15,.65,.085],[.58,-.12,.72,.095]]) {
        const r=radius*scale, cx=radius*dx, cy=radius*dy;
        const shade=ctx.createRadialGradient(cx,cy,r*.12,cx,cy,r);
        shade.addColorStop(0,`rgba(19,35,49,${opacity})`);
        shade.addColorStop(.48,`rgba(19,35,49,${opacity*.75})`);
        shade.addColorStop(1,"rgba(19,35,49,0)");
        ctx.fillStyle=shade; ctx.fillRect(cx-r,cy-r,r*2,r*2);
      }
      ctx.restore();
    }
    // Four individually staggered leaves, with gaps between passes.
    for(let i=0;i<4;i++) {
      const phase=(t+i*7.7)%34;
      if(phase>15) continue;
      const p=phase/15;
      const x=W*(.08+i*.2)+p*W*.18+Math.sin(p*9+i)*12;
      const y=H*(.06+i*.17)+p*H*.24;
      ctx.save(); ctx.translate(x,y); ctx.rotate(p*7+i);
      ctx.scale(.45+Math.abs(Math.sin(p*8+i))*.55,1);
      ctx.globalAlpha=Math.min(1,p*7,(1-p)*7)*.75;
      ctx.fillStyle=i%2 ? "#b3a353" : "#91a765";
      ctx.beginPath(); ctx.ellipse(0,0,3,7,.4,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle="#536a39"; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(-2,-5); ctx.lineTo(2,5); ctx.stroke(); ctx.restore();
    }
  };
  const tick = (now: number) => {
    if(destroyed) return;
    if(visible && !document.hidden && enabled && now-last>=1000/24) {
      const delta = map.closest(".is-system-paused") ? 0 : Math.min((now-last)/1000, .1);
      elapsed += delta;
      if(player.complete && player.naturalWidth && art.complete && art.naturalWidth) arrival = Math.min(arrivalDuration,arrival+delta);
      last=now; draw();
    }
    request=requestAnimationFrame(tick);
  };
  const observer=new ResizeObserver(size); observer.observe(map);
  const intersection=new IntersectionObserver(entries => { visible=entries[0].isIntersecting; }); intersection.observe(map);
  sheet.onload=draw; player.onload=draw; art.addEventListener("load",draw);
  size(); request=requestAnimationFrame(tick);
  return () => {
    destroyed=true; cancelAnimationFrame(request); observer.disconnect(); intersection.disconnect();
    art.removeEventListener("load",draw);
    motionButton.removeEventListener("click",toggle); sheet.onload=null; player.onload=null; canvas.remove();
  };
}
