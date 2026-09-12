import type Phaser from 'phaser';

/** Anything that can be hidden when it is off-screen. */
interface Cullable {
  setVisible(value: boolean): unknown;
  readonly scene: Phaser.Scene | undefined;
}

const CELL = 320;
/** Extra margin so objects pop in before they reach the screen edge. */
const MARGIN = 240;

/**
 * Visibility culling for static scenery.
 *
 * Phaser submits every object on the display list to the renderer each frame - there is
 * no built-in bounds culling - so a map made of ~2300 ground tiles, decals and props costs
 * 2300 transform-and-batch operations per frame even though only a couple of hundred are
 * on screen. Bucketing them by grid cell and toggling `visible` as the camera moves keeps
 * the per-frame cost proportional to what you can actually see.
 *
 * Only cells that enter or leave the view are touched, so a stationary camera costs
 * nothing at all.
 */
export class SceneCuller {
  private readonly cells = new Map<number, Cullable[]>();
  private visible = new Set<number>();
  private lastRange = { minX: 1, maxX: 0, minY: 1, maxY: 0 };
  private registered = 0;

  get objectCount(): number {
    return this.registered;
  }

  private static key(cx: number, cy: number): number {
    return cy * 4096 + cx;
  }

  /** Registers a static object at a world position. */
  add(obj: Cullable, x: number, y: number): void {
    const key = SceneCuller.key(Math.floor(x / CELL), Math.floor(y / CELL));
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(obj);
    else this.cells.set(key, [obj]);
    this.registered++;
    // Everything starts hidden; the first update reveals what is on screen.
    obj.setVisible(false);
  }

  /** Registers an object that spans an area, so it shows while any part is in view. */
  addRect(obj: Cullable, x: number, y: number, w: number, h: number): void {
    const minX = Math.floor(x / CELL);
    const maxX = Math.floor((x + w) / CELL);
    const minY = Math.floor(y / CELL);
    const maxY = Math.floor((y + h) / CELL);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const key = SceneCuller.key(cx, cy);
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(obj);
        else this.cells.set(key, [obj]);
      }
    }
    this.registered++;
    obj.setVisible(false);
  }

  update(camera: Phaser.Cameras.Scene2D.Camera): void {
    const view = camera.worldView;
    const minX = Math.floor((view.x - MARGIN) / CELL);
    const maxX = Math.floor((view.right + MARGIN) / CELL);
    const minY = Math.floor((view.y - MARGIN) / CELL);
    const maxY = Math.floor((view.bottom + MARGIN) / CELL);

    const last = this.lastRange;
    if (minX === last.minX && maxX === last.maxX && minY === last.minY && maxY === last.maxY) {
      return;
    }
    this.lastRange = { minX, maxX, minY, maxY };

    const next = new Set<number>();
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const key = SceneCuller.key(cx, cy);
        next.add(key);
        if (this.visible.has(key)) continue;
        this.setCellVisible(key, true);
      }
    }
    for (const key of this.visible) {
      if (!next.has(key)) this.setCellVisible(key, false);
    }
    this.visible = next;
  }

  private setCellVisible(key: number, visible: boolean): void {
    const bucket = this.cells.get(key);
    if (!bucket) return;
    for (const obj of bucket) {
      // Destroyed objects lose their scene reference; skip rather than throw.
      if (!obj.scene) continue;
      obj.setVisible(visible);
    }
  }

  /** Forces a full refresh, e.g. after the camera teleports. */
  invalidate(): void {
    this.lastRange = { minX: 1, maxX: 0, minY: 1, maxY: 0 };
  }

  reset(): void {
    this.cells.clear();
    this.visible.clear();
    this.registered = 0;
    this.invalidate();
  }
}
