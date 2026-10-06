import Phaser from "phaser";
import { roadEnemiesLeft, type RoadChoice, type RoadForkState } from "./road-fork";

const PROPS = ["tree1", "tree2", "bush_small", "log_pile", "crate_tall", "frozen_pine",
  "rockpile_big", "rocks_med", "rocks_small1", "rocks_small2", "snow_drift"] as const;

export function preloadRoadScenery(scene: Phaser.Scene) {
  for (const key of PROPS) if (!scene.textures.exists(key)) scene.load.image(key, `camp/${key}.png`);
}

type Prop = { root: Phaser.GameObjects.Container; halfWidth: number; speed: number };

/** Grounded scenery for the supply detour, behind the road and all combat actors. */
export class RoadScenery {
  private root: Phaser.GameObjects.Container;
  private props: Prop[] = [];
  private choice: RoadChoice | null = null;
  private opacity = 0;
  private span: number;

  constructor(private scene: Phaser.Scene, parent: Phaser.GameObjects.Container, private biome: string,
    private left: number, private width: number, private ground: number,
    fork: RoadForkState | undefined, depth: number) {
    this.root = scene.add.container(0, 0).setAlpha(0);
    parent.add(this.root);
    this.span = width * 1.9;
    this.sync(fork, depth);
    // Restored runs already stand inside their chosen route.
    if (this.choice) { this.opacity = 1; this.root.setAlpha(1); }
  }

  private sync(fork: RoadForkState | undefined, depth: number) {
    const choice = roadEnemiesLeft(fork, depth) > 0 ? fork!.choice : null;
    if (choice === this.choice) return;
    this.choice = choice;
    if (!choice) return; // Let the departing scenery fade instead of popping away.
    this.root.removeAll(true);
    this.props = [];
    this.opacity = 0;
    const snow = this.biome === "snow", underground = this.biome === "dungeon";
    if (choice === "wood") {
      for (let i = 0; i < 5; i++) {
        const key = underground ? (i % 2 ? "crate_tall" : "log_pile")
          : snow ? "frozen_pine" : i % 2 ? "tree2" : "tree1";
        this.add(key, -.12 + i * .4, underground ? 58 + i % 2 * 22 : 156 + i % 3 * 23, .72, -2,
          snow ? 0xe2f0ff : underground ? 0xb5a192 : this.biome === "forest" ? 0xbad0a5 : 0xe0e1bc, i % 2 === 0);
      }
      for (let i = 0; i < 6; i++) {
        const key = i % 2 === 0 ? "log_pile" : snow ? "snow_drift" : underground ? "log_pile" : "bush_small";
        this.add(key, .08 + i * .3, 23 + i % 3 * 7, .93, 2, snow ? 0xd7e7ed : 0xd5d4ae, i % 2 === 0);
      }
    } else {
      for (let i = 0; i < 6; i++) {
        this.add(i % 2 ? "rocks_med" : "rockpile_big", -.06 + i * .32, 55 + i % 3 * 16, .8, 2,
          snow ? 0xc0dfef : underground ? 0x9296ab : 0xe0d3b9, i % 2 === 0);
      }
      for (let i = 0; i < 7; i++) {
        this.add(i % 2 ? "rocks_small1" : "rocks_small2", .13 + i * .26, 15 + i % 3 * 5, .96, 3,
          snow ? 0xd0eafa : underground ? 0xa0a3b8 : 0xe5dcc4, i % 2 === 0);
      }
    }
  }

  private add(key: string, at: number, height: number, speed: number, offsetY: number, tint: number, flip: boolean) {
    const image = this.scene.add.image(0, 0, key).setOrigin(.5, 1).setTint(tint).setFlipX(flip);
    image.setScale(height / image.height);
    const shadow = this.scene.add.ellipse(0, -1, image.displayWidth * .65, 7, 0x131c19, .22);
    const root = this.scene.add.container(this.left + at * this.width, this.ground + offsetY, [shadow, image]);
    this.root.add(root);
    this.props.push({ root, halfWidth: image.displayWidth / 2, speed });
  }

  update(delta: number, travel: number, fork: RoadForkState | undefined, depth: number) {
    this.sync(fork, depth);
    const target = this.choice ? 1 : 0;
    this.opacity += (target - this.opacity) * (1 - Math.exp(-Math.min(delta, 100) / 400));
    this.root.setAlpha(this.opacity).setVisible(this.opacity > .002);
    if (this.opacity <= .002) return;
    for (const prop of this.props) {
      prop.root.x -= travel * prop.speed;
      while (prop.root.x + prop.halfWidth < this.left) prop.root.x += this.span;
    }
  }
}
