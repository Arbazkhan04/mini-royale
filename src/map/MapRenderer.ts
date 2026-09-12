import Phaser from 'phaser';
import { PALETTE, WORLD } from '../config/GameConfig';
import { TEX_SCALE } from '../graphics/TextureFactory';
import { Depth, ObstacleKind, SurfaceKind, TerrainKind, Tex } from '../utils/Constants';
import { damp } from '../utils/MathUtils';
import type { Building } from './Building';
import type { CoverObject } from './CoverObject';
import type { MapData } from './MapData';
import type { SceneCuller } from '../systems/SceneCuller';

const TERRAIN_TEX: Record<TerrainKind, string> = {
  [TerrainKind.Grass]: Tex.Grass,
  [TerrainKind.Dirt]: Tex.Dirt,
  [TerrainKind.Road]: Tex.Road,
  [TerrainKind.Sand]: Tex.Sand,
  [TerrainKind.Concrete]: Tex.Concrete,
};

const TERRAIN_TINT: Record<TerrainKind, number> = {
  [TerrainKind.Grass]: 0x3e7a42,
  [TerrainKind.Dirt]: PALETTE.dirt,
  [TerrainKind.Road]: PALETTE.road,
  [TerrainKind.Sand]: PALETTE.sand,
  [TerrainKind.Concrete]: PALETTE.concrete,
};

const PROP_TEX: Partial<Record<ObstacleKind, string>> = {
  [ObstacleKind.Crate]: Tex.Crate,
  [ObstacleKind.Door]: Tex.Door,
  [ObstacleKind.Barricade]: Tex.Barricade,
  [ObstacleKind.Sandbag]: Tex.Sandbag,
  [ObstacleKind.Table]: Tex.Table,
  [ObstacleKind.Shelf]: Tex.Shelf,
  [ObstacleKind.Locker]: Tex.Locker,
};

const FLOOR_TEX: Record<SurfaceKind, string> = {
  [SurfaceKind.Wood]: Tex.FloorWood,
  [SurfaceKind.Concrete]: Tex.FloorConcrete,
  [SurfaceKind.Tile]: Tex.FloorTile,
};

interface RoofView {
  building: Building;
  roof: Phaser.GameObjects.Image;
  trim: Phaser.GameObjects.Graphics;
  drop: Phaser.GameObjects.Graphics;
  alpha: number;
}

interface CoverView {
  parts: Phaser.GameObjects.GameObject[];
  cracks: Phaser.GameObjects.Image | null;
  stage: number;
}

interface CanopyView {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  alpha: number;
}

/**
 * Draws the static world: ground, terrain blotches, roads, decals, building floors,
 * walls, props and roofs. Also handles the two dynamic bits of world rendering -
 * fading roofs when the player steps inside and thinning tree canopies overhead.
 */
export class MapRenderer {
  private readonly roofs: RoofView[] = [];
  private readonly canopies: CanopyView[] = [];
  /** Views for destructible cover, keyed by CoverObject id. */
  private readonly coverViews = new Map<number, CoverView>();

  private decorTimer: Phaser.Time.TimerEvent | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: MapData,
    private readonly culler: SceneCuller,
  ) {}

  /** Registers a point-sized static object for view culling. */
  private track<T extends Phaser.GameObjects.GameObject & { setVisible(v: boolean): unknown }>(
    obj: T,
    x: number,
    y: number,
  ): T {
    this.culler.add(obj, x, y);
    return obj;
  }

  /** Registers an area-sized static object (walls, roofs, wide terrain blobs). */
  private trackRect<T extends Phaser.GameObjects.GameObject & { setVisible(v: boolean): unknown }>(
    obj: T,
    x: number,
    y: number,
    w: number,
    h: number,
  ): T {
    this.culler.addRect(obj, x, y, w, h);
    return obj;
  }

  /**
   * Builds everything the match needs to be playable. Purely decorative scatter is left
   * to `buildDecorations`, which spreads its work across the opening countdown.
   */
  build(): void {
    this.drawGround();
    this.drawTerrain();
    this.drawBuildingFloors();
    this.drawObstacles();
    this.drawWalls();
    this.drawRoofs();
    this.drawWorldBorder();
  }

  /**
   * Grass tufts and pebbles, added a slice at a time. They are invisible to gameplay, so
   * trickling them in during the countdown keeps the click-to-match transition snappy.
   */
  buildDecorations(): void {
    const decals = this.map.decals;
    const perTick = 160;
    let index = 0;
    this.decorTimer = this.scene.time.addEvent({
      delay: 30,
      repeat: Math.ceil(decals.length / perTick),
      callback: () => {
        const end = Math.min(decals.length, index + perTick);
        for (; index < end; index++) {
          const decal = decals[index];
          if (!decal) continue;
          const img = this.scene.add.image(decal.x, decal.y, decal.tex);
          img.setScale(TEX_SCALE * decal.scale);
          img.setRotation(decal.rotation);
          img.setAlpha(decal.alpha);
          img.setTint(decal.tint);
          img.setDepth(Depth.Decal);
          this.track(img, decal.x, decal.y);
        }
      },
    });
  }

  // ------------------------------------------------------------------ ground

  /**
   * Fills a rect with repeated copies of a texture.
   *
   * Phaser's TileSprite allocates a canvas the size of its *display area*, so a
   * world-sized one costs a 9-megapixel allocation and ~60ms on its own. A grid of plain
   * Images batches into the same draw call and costs almost nothing to create; edge tiles
   * are cropped so the fill stops exactly on the rect.
   */
  private tiledRect(
    x: number,
    y: number,
    w: number,
    h: number,
    textureKey: string,
    depth: number,
    alpha = 1,
    tint?: number,
  ): Phaser.GameObjects.Image[] {
    const frame = this.scene.textures.getFrame(textureKey);
    const tileW = frame.width * TEX_SCALE;
    const tileH = frame.height * TEX_SCALE;
    const out: Phaser.GameObjects.Image[] = [];

    for (let ty = 0; ty < h; ty += tileH) {
      for (let tx = 0; tx < w; tx += tileW) {
        const img = this.scene.add.image(x + tx, y + ty, textureKey);
        img.setOrigin(0, 0).setScale(TEX_SCALE).setDepth(depth).setAlpha(alpha);
        if (tint !== undefined) img.setTint(tint);
        const cropW = Math.min(tileW, w - tx);
        const cropH = Math.min(tileH, h - ty);
        if (cropW < tileW - 0.01 || cropH < tileH - 0.01) {
          img.setCrop(0, 0, cropW / TEX_SCALE, cropH / TEX_SCALE);
        }
        this.track(img, x + tx + cropW / 2, y + ty + cropH / 2);
        out.push(img);
      }
    }
    return out;
  }

  private drawGround(): void {
    this.tiledRect(0, 0, WORLD.width, WORLD.height, Tex.Grass, Depth.Ground);
  }

  private drawTerrain(): void {
    for (const patch of this.map.terrain) {
      if (patch.shape === 'rect') {
        // Roads and concrete slabs keep hard edges, so they are tiled from the top-left.
        this.tiledRect(
          patch.x - patch.w / 2,
          patch.y - patch.h / 2,
          patch.w,
          patch.h,
          TERRAIN_TEX[patch.kind],
          Depth.Ground + 2,
          patch.alpha,
        );
      } else {
        // Organic patches use a feathered blob so terrain transitions stay soft.
        const blob = this.scene.add.image(patch.x, patch.y, Tex.Blob);
        blob.setDisplaySize(patch.w, patch.h);
        blob.setRotation(patch.rotation);
        blob.setTint(TERRAIN_TINT[patch.kind]);
        blob.setAlpha(patch.alpha);
        blob.setDepth(Depth.Ground + 1);
        this.trackRect(blob, patch.x - patch.w / 2, patch.y - patch.h / 2, patch.w, patch.h);
      }
    }
  }

  private drawWorldBorder(): void {
    // Not culled: it is four big rects that frame the entire map.
    const g = this.scene.add.graphics().setDepth(Depth.Roof + 1);
    g.fillStyle(0x0b0f14, 0.55);
    const m = WORLD.margin;
    g.fillRect(-400, -400, WORLD.width + 800, m + 400);
    g.fillRect(-400, WORLD.height - m, WORLD.width + 800, m + 400);
    g.fillRect(-400, -400, m + 400, WORLD.height + 800);
    g.fillRect(WORLD.width - m, -400, m + 400, WORLD.height + 800);
    g.lineStyle(4, 0x1c2128, 0.9);
    g.strokeRect(m, m, WORLD.width - m * 2, WORLD.height - m * 2);
  }

  // ------------------------------------------------------------------ buildings

  private drawBuildingFloors(): void {
    for (const b of this.map.buildings) {
      this.tiledRect(b.x, b.y, b.w, b.h, FLOOR_TEX[b.floor], Depth.Floor);

      const shade = this.scene.add.graphics().setDepth(Depth.FloorDecal);
      shade.fillStyle(0x000000, 0.12);
      shade.fillRect(b.x, b.y, b.w, 18);
      shade.fillRect(b.x, b.y, 18, b.h);
      this.trackRect(shade, b.x, b.y, b.w, b.h);
    }
  }

  /**
   * One Graphics per building rather than one for the whole map: a Graphics re-emits its
   * entire command buffer every frame, so a single map-wide one can never be culled.
   */
  private drawWalls(): void {
    for (const b of this.map.buildings) {
      const g = this.scene.add.graphics().setDepth(Depth.Obstacle);
      const shadow = this.scene.add.graphics().setDepth(Depth.Obstacle - 1);
      this.trackRect(g, b.x - 20, b.y - 20, b.w + 40, b.h + 40);
      this.trackRect(shadow, b.x - 20, b.y - 20, b.w + 40, b.h + 40);
      for (const wall of b.walls) {
        shadow.fillStyle(0x000000, 0.28);
        shadow.fillRect(wall.x + 5, wall.y + 6, wall.w, wall.h);

        g.fillStyle(PALETTE.outline, 1);
        g.fillRect(wall.x, wall.y, wall.w, wall.h);
        g.fillStyle(b.wallColor, 1);
        g.fillRect(wall.x + 2, wall.y + 2, wall.w - 4, wall.h - 4);
        // Top-left highlight gives the walls a bit of relief.
        g.fillStyle(0xffffff, 0.18);
        g.fillRect(wall.x + 2, wall.y + 2, wall.w - 4, Math.min(4, wall.h - 4));
        g.fillStyle(0x000000, 0.16);
        g.fillRect(wall.x + 2, wall.y + wall.h - 6, wall.w - 4, 4);
      }
      // Door thresholds so openings read clearly from the outside.
      for (const door of b.doors) {
        g.fillStyle(0x2f2a24, 0.55);
        if (door.side === 'n' || door.side === 's') {
          g.fillRect(door.x - door.width / 2, door.y - 8, door.width, 16);
        } else {
          g.fillRect(door.x - 8, door.y - door.width / 2, 16, door.width);
        }
      }
    }
  }

  private drawRoofs(): void {
    for (const b of this.map.buildings) {
      if (!b.hasRoof) continue;
      // Offset drop shadow lifts the structure off the ground.
      const drop = this.scene.add.graphics().setDepth(Depth.Roof - 1);
      drop.fillStyle(0x000000, 0.32);
      drop.fillRoundedRect(b.x + 4, b.y + 10, b.w + 12, b.h + 12, 6);

      // The roof pattern is noise-like, so a single stretched Image reads the same as a
      // tiled one and keeps the fade to a single alpha write.
      const roof = this.scene.add.image(b.x - 6, b.y - 6, Tex.Roof);
      roof.setOrigin(0, 0);
      roof.setDisplaySize(b.w + 12, b.h + 12);
      roof.setTint(b.roofColor);
      roof.setDepth(Depth.Roof);

      const trim = this.scene.add.graphics().setDepth(Depth.Roof);
      trim.lineStyle(5, b.roofShadeColor, 1);
      trim.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
      trim.lineStyle(2, 0x000000, 0.35);
      trim.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
      // A diagonal ridge line hints at a pitched roof.
      trim.lineStyle(3, b.roofShadeColor, 0.5);
      trim.lineBetween(b.x - 6, b.y - 6, b.x + b.w + 6, b.y + b.h + 6);
      trim.lineBetween(b.x + b.w + 6, b.y - 6, b.x - 6, b.y + b.h + 6);
      // Light rakes across the roof from the top-left.
      trim.fillStyle(0xffffff, 0.1);
      trim.fillRect(b.x - 6, b.y - 6, b.w + 12, (b.h + 12) * 0.34);
      trim.fillStyle(0x000000, 0.14);
      trim.fillRect(b.x - 6, b.y + b.h * 0.72, b.w + 12, (b.h + 12) * 0.34);

      this.trackRect(roof, b.x - 10, b.y - 10, b.w + 20, b.h + 20);
      this.trackRect(trim, b.x - 10, b.y - 10, b.w + 20, b.h + 20);
      this.trackRect(drop, b.x - 10, b.y - 10, b.w + 30, b.h + 30);

      this.roofs.push({ building: b, roof, trim, drop, alpha: 1 });
    }
  }

  // ------------------------------------------------------------------ props

  private drawObstacles(): void {
    for (const obs of this.map.obstacles) {
      this.drawObstacle(obs);
    }
  }

  /** A soft shadow blob under a prop. Individual sprites so the culler can drop them. */
  private addShadow(x: number, y: number, size: number, alpha = 0.38): Phaser.GameObjects.Image {
    const shadow = this.scene.add.image(x, y, Tex.Shadow);
    shadow.setDisplaySize(size, size).setAlpha(alpha).setDepth(Depth.Decal + 1);
    return this.track(shadow, x, y);
  }

  private drawObstacle(obs: CoverObject): void {
    const scene = this.scene;
    switch (obs.kind) {
      case ObstacleKind.Tree: {
        const scale = obs.scale;
        this.addShadow(obs.x + 10, obs.y + 12, 96 * scale, 0.4);
        const trunk = scene.add.image(obs.x, obs.y, Tex.TreeTrunk);
        trunk.setDisplaySize(obs.radius * 2.4, obs.radius * 2.4).setDepth(Depth.LowObstacle);
        this.track(trunk, obs.x, obs.y);
        const canopyTex = obs.variant === 0 ? Tex.TreeCanopy : Tex.TreeCanopyDark;
        const canopy = scene.add.image(obs.x - 4, obs.y - 7, canopyTex);
        const canopySize = 96 * scale * (obs.variant === 2 ? 1.12 : 1);
        canopy.setDisplaySize(canopySize, canopySize);
        canopy.setRotation(obs.variant * 1.1);
        canopy.setDepth(Depth.Obstacle + 4);
        this.track(canopy, obs.x, obs.y);
        this.canopies.push({ sprite: canopy, x: obs.x, y: obs.y, alpha: 1 });
        break;
      }
      case ObstacleKind.Bush: {
        const bush = scene.add.image(obs.x, obs.y, Tex.Bush);
        const size = obs.radius * 2.3 * obs.scale;
        bush.setDisplaySize(size, size);
        bush.setRotation(obs.variant * 0.9);
        bush.setAlpha(0.92);
        bush.setDepth(Depth.Obstacle + 2);
        this.track(bush, obs.x, obs.y);
        break;
      }
      case ObstacleKind.Rock: {
        this.addShadow(obs.x + 5, obs.y + 6, obs.radius * 2.6, 0.4);
        const rock = scene.add.image(obs.x, obs.y, Tex.Rock);
        rock.setDisplaySize(obs.radius * 2.25, obs.radius * 2.25);
        rock.setRotation(obs.variant * 1.4);
        rock.setDepth(Depth.LowObstacle);
        this.track(rock, obs.x, obs.y);
        break;
      }
      case ObstacleKind.Barrel:
        this.roundProp(obs, Tex.Barrel, obs.radius * 2.35);
        break;
      case ObstacleKind.Crate:
      case ObstacleKind.Sandbag:
      case ObstacleKind.Table:
      case ObstacleKind.Shelf:
      case ObstacleKind.Locker:
      case ObstacleKind.Door:
      case ObstacleKind.Barricade:
        this.rectProp(obs, PROP_TEX[obs.kind] as string);
        break;
      case ObstacleKind.Fence:
        this.drawFence(obs);
        break;
      default:
        break;
    }
  }

  private roundProp(obs: CoverObject, tex: string, size: number): void {
    const shadow = this.addShadow(obs.x + 4, obs.y + 5, size * 1.25);
    const img = this.scene.add.image(obs.x, obs.y, tex);
    img.setDisplaySize(size, size);
    img.setDepth(Depth.LowObstacle);
    this.track(img, obs.x, obs.y);
    this.registerCover(obs, [img, shadow]);
  }

  /** Rect props are stretched to the collider size so visuals and collision agree. */
  private rectProp(obs: CoverObject, tex: string): void {
    const rotated = obs.h > obs.w;
    const shadow = this.addShadow(obs.x + 4, obs.y + 5, Math.max(obs.w, obs.h) * 1.25, 0.34);
    const img = this.scene.add.image(obs.x, obs.y, tex);
    if (rotated) {
      // The art is authored horizontally, so a tall collider rotates the sprite.
      img.setRotation(Math.PI / 2);
      img.setDisplaySize(obs.h, obs.w);
    } else {
      img.setDisplaySize(obs.w, obs.h);
    }
    img.setDepth(obs.kind === ObstacleKind.Door ? Depth.LowObstacle + 2 : Depth.LowObstacle);
    this.track(img, obs.x, obs.y);
    this.registerCover(obs, [img, shadow]);
  }

  /** Destructible props keep a handle so they can crack and then disappear. */
  private registerCover(obs: CoverObject, parts: Phaser.GameObjects.GameObject[]): void {
    if (!obs.destructible) return;
    this.coverViews.set(obs.id, { parts, cracks: null, stage: 0 });
  }

  /** Called when a destructible object takes a hit; shows progressive damage. */
  showCoverDamage(obs: CoverObject): void {
    const view = this.coverViews.get(obs.id);
    if (!view) return;
    const stage = obs.damageStage;
    if (stage === view.stage) return;
    view.stage = stage;
    if (stage === 0) return;
    if (!view.cracks) {
      const cracks = this.scene.add.image(obs.x, obs.y, Tex.Cracks);
      cracks.setDisplaySize(Math.max(obs.w, 26), Math.max(obs.h, 26));
      cracks.setTint(0x1b1208);
      cracks.setDepth(Depth.LowObstacle + 3);
      this.track(cracks, obs.x, obs.y);
      view.cracks = cracks;
      view.parts.push(cracks);
    }
    view.cracks.setAlpha(stage === 1 ? 0.35 : 0.7);
  }

  /** Called once the object is destroyed - the sprite pops and is removed. */
  removeCover(obs: CoverObject): void {
    const view = this.coverViews.get(obs.id);
    if (view) {
      this.coverViews.delete(obs.id);
      for (const part of view.parts) part.destroy();
    }
  }

  private drawFence(obs: CoverObject): void {
    const g = this.scene.add.graphics().setDepth(Depth.LowObstacle);
    const b = obs.bounds;
    g.fillStyle(0x000000, 0.22);
    g.fillRect(b.x + 3, b.y + 4, b.w, b.h);
    g.fillStyle(PALETTE.outline, 1);
    g.fillRect(b.x, b.y, b.w, b.h);
    g.fillStyle(0x8a7b63, 1);
    g.fillRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
    const horizontal = b.w > b.h;
    const steps = Math.max(2, Math.floor((horizontal ? b.w : b.h) / 28));
    g.fillStyle(0x6d6047, 1);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (horizontal) g.fillRect(b.x + b.w * t - 3, b.y - 3, 6, b.h + 6);
      else g.fillRect(b.x - 3, b.y + b.h * t - 3, b.w + 6, 6);
    }
    this.trackRect(g, b.x - 6, b.y - 6, b.w + 12, b.h + 12);
    this.registerCover(obs, [g]);
  }

  // ------------------------------------------------------------------ dynamic

  /** Stops the deferred decoration pass; called when the match ends. */
  stopDecorations(): void {
    this.decorTimer?.remove();
    this.decorTimer = null;
  }

  /** Fades roofs the player is standing under and thins overhead canopies. */
  update(playerX: number, playerY: number, delta: number): void {
    for (const view of this.roofs) {
      const inside = view.building.contains(playerX, playerY, 10);
      const target = inside ? 0.16 : 1;
      view.alpha = damp(view.alpha, target, 0.22, delta);
      view.roof.setAlpha(view.alpha);
      view.trim.setAlpha(view.alpha);
      view.drop.setAlpha(view.alpha);
    }

    for (const canopy of this.canopies) {
      const dx = canopy.x - playerX;
      const dy = canopy.y - playerY;
      const near = dx * dx + dy * dy < 68 * 68;
      const target = near ? 0.5 : 1;
      if (Math.abs(canopy.alpha - target) < 0.01) continue;
      canopy.alpha = damp(canopy.alpha, target, 0.25, delta);
      canopy.sprite.setAlpha(canopy.alpha);
    }
  }
}
