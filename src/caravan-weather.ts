type RoofPatch = readonly [x: number, y: number, width: number];

// Coordinates belong to the existing 480 × 370 caravan canvas. Patches sit on
// canvas roof sections, between the straps; neither base image is modified.
const ROOF: Record<"starter" | "expanded", readonly RoofPatch[]> = {
  starter: [[98,140,28],[162,142,43],[237,143,45],[319,142,25],[356,140,23]],
  expanded: [[133,55,27],[197,59,20],[241,63,26],[306,61,24],[366,68,21]],
};

export function drawCaravanWeather(ctx: CanvasRenderingContext2D, biome: string, expanded: boolean) {
  if (biome === "plains") return;
  const roof = ROOF[expanded ? "expanded" : "starter"];
  ctx.save();
  const pixel = (color: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = color; ctx.fillRect(x,y,w,h);
  };
  if (biome === "snow") {
    for (const [i,[x,y,w]] of roof.entries()) {
      // Uneven, shallow deposits with a cool lower edge and a bright upper lip.
      // Leave gaps along the roof so its green canvas and leather remain clear.
      const height = i % 2 ? 4 : 5;
      pixel("#aac8d7",x,y,w,2);
      pixel("#e2edf0",x+1,y-height+2,w-2,height);
      pixel("#edf5f3",x+4,y-height,w-10,2);
      pixel("#fbfcf4",x+6,y-height,w-15,1);
      pixel("#c5dce4",x+w-5,y+1,3,2);
    }
    // A little settled snow on the end cap / chimney, away from the workspaces.
    const [x,y,w] = expanded ? [400,44,25] : [65,134,9];
    pixel("#c5dce4",x,y,w,2);
    pixel("#eff6f3",x+1,y-2,w-3,2);
  } else if (biome === "forest") {
    // Individual leaves, not a tint or a new roof texture.
    for (const [i,[x,y,w]] of roof.entries()) {
      if (i === 3) continue;
      const lx=x+Math.floor(w*.45), ly=y+3+i%2;
      pixel(i%2 ? "#b9a05c" : "#9eaa61",lx,ly,5,2);
      pixel(i%2 ? "#d1b775" : "#c1c684",lx+1,ly-1,3,1);
      pixel("#6a6741",lx+4,ly+2,2,1);
    }
  } else if (biome === "dungeon") {
    // Fine stone dust collects on upward-facing surfaces; shelves stay intact.
    for (const [i,[x,y,w]] of roof.entries()) {
      if(i%2)continue;
      pixel("#b8b6af99",x+4,y+2,7,1);
      pixel("#dbd4c080",x+7,y+3,3,1);
      pixel("#b8b6af80",x+w-6,y+2,2,1);
    }
  }
  ctx.restore();
}
