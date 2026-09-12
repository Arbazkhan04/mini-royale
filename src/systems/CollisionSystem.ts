import Phaser from 'phaser';
import { ObstacleKind } from '../utils/Constants';
import type { Circle, Rect, Vec2 } from '../utils/Constants';
import {
  circleRectOverlap,
  distanceSq,
  expandRect,
  pointSegmentDistance,
  rectsOverlap,
  segmentCircle,
  segmentRect,
} from '../utils/MathUtils';
import type { RayHit } from '../utils/MathUtils';
import type { CoverObject } from '../map/CoverObject';
import type { MapData } from '../map/MapData';
import { NAV_CELL, NAV_INFLATE } from '../map/MapGenerator';

export interface StaticCollider {
  id: number;
  /** Set when the object has been destroyed; the collider stops existing for queries. */
  disabled: boolean;
  rect: Rect | null;
  circle: Circle | null;
  blocksBullets: boolean;
  blocksMovement: boolean;
  source: CoverObject | null;
  /** Set for building walls. */
  buildingId: number;
}

export interface StaticRayResult {
  hit: RayHit;
  collider: StaticCollider;
}

const CELL = 150;

/**
 * Owns two views of world geometry:
 *  - Arcade static bodies, used for entity movement resolution.
 *  - A spatial hash of raw shapes, used for bullet raycasts, line-of-sight and AI cover
 *    queries. Bullets are swept manually because arcade overlap tunnels through thin
 *    walls at sniper velocities.
 */
export class CollisionSystem {
  private readonly buckets = new Map<number, StaticCollider[]>();
  private readonly all: StaticCollider[] = [];
  private readonly bushes: CoverObject[] = [];
  private readonly byCover = new Map<number, StaticCollider>();
  private readonly zones = new Map<number, Phaser.GameObjects.Zone>();
  private nextColliderId = 1;
  staticGroup!: Phaser.Physics.Arcade.StaticGroup;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: MapData,
  ) {
    this.buildColliders();
  }

  private buildColliders(): void {
    for (const building of this.map.buildings) {
      for (const wall of building.walls) {
        this.addCollider({
          id: 0,
          disabled: false,
          rect: wall,
          circle: null,
          blocksBullets: true,
          blocksMovement: true,
          source: null,
          buildingId: building.id,
        });
      }
    }
    for (const obs of this.map.obstacles) {
      if (obs.kind === ObstacleKind.Bush) {
        this.bushes.push(obs);
        continue;
      }
      if (!obs.blocksMovement && !obs.blocksBullets) continue;
      this.addCollider({
        id: 0,
        disabled: false,
        rect: obs.shape === 'rect' ? obs.bounds : null,
        circle: obs.shape === 'circle' ? { x: obs.x, y: obs.y, r: obs.radius } : null,
        blocksBullets: obs.blocksBullets,
        blocksMovement: obs.blocksMovement,
        source: obs,
        buildingId: 0,
      });
    }
  }

  private addCollider(c: StaticCollider): void {
    c.id = this.nextColliderId++;
    this.all.push(c);
    if (c.source) this.byCover.set(c.source.id, c);
    const b = c.rect ?? {
      x: (c.circle as Circle).x - (c.circle as Circle).r,
      y: (c.circle as Circle).y - (c.circle as Circle).r,
      w: (c.circle as Circle).r * 2,
      h: (c.circle as Circle).r * 2,
    };
    const minX = Math.floor(b.x / CELL);
    const maxX = Math.floor((b.x + b.w) / CELL);
    const minY = Math.floor(b.y / CELL);
    const maxY = Math.floor((b.y + b.h) / CELL);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const key = cy * 4096 + cx;
        let bucket = this.buckets.get(key);
        if (!bucket) {
          bucket = [];
          this.buckets.set(key, bucket);
        }
        bucket.push(c);
      }
    }
  }

  /** Creates the arcade static bodies used for walking collision. */
  buildPhysics(): Phaser.Physics.Arcade.StaticGroup {
    this.staticGroup = this.scene.physics.add.staticGroup();
    for (const c of this.all) {
      if (!c.blocksMovement) continue;
      if (c.rect) {
        const zone = this.scene.add.zone(c.rect.x + c.rect.w / 2, c.rect.y + c.rect.h / 2, c.rect.w, c.rect.h);
        this.scene.physics.add.existing(zone, true);
        this.staticGroup.add(zone);
        this.zones.set(c.id, zone);
      } else if (c.circle) {
        const r = c.circle.r;
        const zone = this.scene.add.zone(c.circle.x, c.circle.y, r * 2, r * 2);
        this.scene.physics.add.existing(zone, true);
        const body = zone.body as Phaser.Physics.Arcade.StaticBody;
        body.setCircle(r);
        body.updateFromGameObject();
        this.staticGroup.add(zone);
        this.zones.set(c.id, zone);
      }
    }
    return this.staticGroup;
  }

  // ------------------------------------------------------------------ queries

  /** Collects colliders whose bucket overlaps the given segment. */
  private collectAlongSegment(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    out: Set<StaticCollider>,
  ): void {
    const minX = Math.floor(Math.min(x0, x1) / CELL);
    const maxX = Math.floor(Math.max(x0, x1) / CELL);
    const minY = Math.floor(Math.min(y0, y1) / CELL);
    const maxY = Math.floor(Math.max(y0, y1) / CELL);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const bucket = this.buckets.get(cy * 4096 + cx);
        if (!bucket) continue;
        for (const c of bucket) out.add(c);
      }
    }
  }

  private readonly scratchSet = new Set<StaticCollider>();

  /** Nearest static hit along a segment, or null. */
  raycastStatic(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    bulletsOnly = true,
    ignoreId = -1,
  ): StaticRayResult | null {
    const dx = x1 - x0;
    const dy = y1 - y0;
    this.scratchSet.clear();
    this.collectAlongSegment(x0, y0, x1, y1, this.scratchSet);

    let best: StaticRayResult | null = null;
    for (const c of this.scratchSet) {
      if (c.disabled || c.id === ignoreId) continue;
      if (bulletsOnly && !c.blocksBullets) continue;
      let hit: RayHit | null = null;
      if (c.rect) hit = segmentRect(x0, y0, dx, dy, c.rect);
      else if (c.circle) hit = segmentCircle(x0, y0, dx, dy, c.circle);
      if (hit && (!best || hit.t < best.hit.t)) best = { hit, collider: c };
    }
    return best;
  }

  hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    return this.raycastStatic(x0, y0, x1, y1, true) === null;
  }

  /** True when a point sits inside foliage, which lowers the chance of being spotted. */
  concealmentAt(x: number, y: number): number {
    let best = 0;
    for (const bush of this.bushes) {
      const r = bush.radius;
      if (distanceSq(x, y, bush.x, bush.y) < r * r) best = Math.max(best, bush.concealment);
    }
    return best;
  }

  /** Soft repulsion from nearby solid geometry, used for bot steering. */
  avoidanceVector(x: number, y: number, radius: number): Vec2 {
    let ax = 0;
    let ay = 0;
    const minX = Math.floor((x - radius) / CELL);
    const maxX = Math.floor((x + radius) / CELL);
    const minY = Math.floor((y - radius) / CELL);
    const maxY = Math.floor((y + radius) / CELL);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const bucket = this.buckets.get(cy * 4096 + cx);
        if (!bucket) continue;
        for (const c of bucket) {
          if (c.disabled || !c.blocksMovement) continue;
          let nx = 0;
          let ny = 0;
          let dist = 0;
          if (c.circle) {
            const dx = x - c.circle.x;
            const dy = y - c.circle.y;
            const d = Math.hypot(dx, dy);
            dist = d - c.circle.r;
            if (d > 0.001) {
              nx = dx / d;
              ny = dy / d;
            }
          } else if (c.rect) {
            const cxp = Math.max(c.rect.x, Math.min(x, c.rect.x + c.rect.w));
            const cyp = Math.max(c.rect.y, Math.min(y, c.rect.y + c.rect.h));
            const dx = x - cxp;
            const dy = y - cyp;
            const d = Math.hypot(dx, dy);
            dist = d;
            if (d > 0.001) {
              nx = dx / d;
              ny = dy / d;
            }
          }
          if (dist < radius && dist >= 0) {
            const strength = 1 - dist / radius;
            ax += nx * strength * 1.4;
            ay += ny * strength * 1.4;
          }
        }
      }
    }
    return { x: ax, y: ay };
  }

  /**
   * Finds a spot near `x,y` that breaks line of fire from `threat`.
   * Candidates are sampled behind nearby solid objects; cheap enough to run at AI rate.
   */
  findCoverPoint(
    x: number,
    y: number,
    threatX: number,
    threatY: number,
    searchRadius: number,
  ): Vec2 | null {
    let best: Vec2 | null = null;
    let bestScore = Infinity;
    const radiusSq = searchRadius * searchRadius;

    const minX = Math.floor((x - searchRadius) / CELL);
    const maxX = Math.floor((x + searchRadius) / CELL);
    const minY = Math.floor((y - searchRadius) / CELL);
    const maxY = Math.floor((y + searchRadius) / CELL);
    const seen = new Set<StaticCollider>();

    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const bucket = this.buckets.get(cy * 4096 + cx);
        if (!bucket) continue;
        for (const c of bucket) {
          if (seen.has(c) || c.disabled || !c.blocksBullets) continue;
          seen.add(c);
          const center = c.circle
            ? { x: c.circle.x, y: c.circle.y }
            : { x: (c.rect as Rect).x + (c.rect as Rect).w / 2, y: (c.rect as Rect).y + (c.rect as Rect).h / 2 };
          if (distanceSq(center.x, center.y, x, y) > radiusSq) continue;

          const extent = c.circle ? c.circle.r : Math.max((c.rect as Rect).w, (c.rect as Rect).h) * 0.5;
          if (extent < 14) continue;
          const away = Math.atan2(center.y - threatY, center.x - threatX);
          const spot = {
            x: center.x + Math.cos(away) * (extent + 24),
            y: center.y + Math.sin(away) * (extent + 24),
          };
          if (!this.map.navGrid.isWalkable(spot.x, spot.y)) continue;
          if (this.hasLineOfSight(spot.x, spot.y, threatX, threatY)) continue;
          const score = distanceSq(spot.x, spot.y, x, y);
          if (score < bestScore) {
            bestScore = score;
            best = spot;
          }
        }
      }
    }
    return best;
  }

  /** True when the straight line from a to b passes close to a solid object. */
  isShieldedBy(ax: number, ay: number, bx: number, by: number, obj: CoverObject): boolean {
    return pointSegmentDistance(obj.x, obj.y, ax, ay, bx, by) < obj.extent;
  }

  /** Looks up the collider backing a destructible cover object. */
  colliderFor(cover: CoverObject): StaticCollider | undefined {
    return this.byCover.get(cover.id);
  }

  /**
   * Removes a destroyed piece of cover from every representation: the arcade body, the
   * raycast hash and the navigation grid. Bots re-path through the new gap on their own.
   */
  destroyCover(cover: CoverObject): void {
    const collider = this.byCover.get(cover.id);
    if (!collider || collider.disabled) return;
    collider.disabled = true;
    const zone = this.zones.get(collider.id);
    if (zone) {
      this.staticGroup.remove(zone, true, true);
      this.zones.delete(collider.id);
    }
    this.refreshNavAround(cover.bounds);
  }

  /** Recomputes walkability for a small region after geometry changed. */
  private refreshNavAround(bounds: Rect): void {
    const grid = this.map.navGrid;
    const region = expandRect(bounds, NAV_INFLATE + NAV_CELL * 2);
    grid.clearRect(region);
    for (const c of this.all) {
      if (c.disabled || !c.blocksMovement) continue;
      const b = c.rect ?? {
        x: (c.circle as Circle).x - (c.circle as Circle).r,
        y: (c.circle as Circle).y - (c.circle as Circle).r,
        w: (c.circle as Circle).r * 2,
        h: (c.circle as Circle).r * 2,
      };
      if (!rectsOverlap(b, region)) continue;
      if (c.rect) grid.blockRect(c.rect, NAV_INFLATE);
      else if (c.circle) grid.blockCircle(c.circle.x, c.circle.y, c.circle.r, NAV_INFLATE);
    }
  }

  /** Simple overlap test used when placing dropped loot. */
  isPointBlocked(x: number, y: number, radius: number): boolean {
    const minX = Math.floor((x - radius) / CELL);
    const maxX = Math.floor((x + radius) / CELL);
    const minY = Math.floor((y - radius) / CELL);
    const maxY = Math.floor((y + radius) / CELL);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const bucket = this.buckets.get(cy * 4096 + cx);
        if (!bucket) continue;
        for (const c of bucket) {
          if (c.disabled || !c.blocksMovement) continue;
          if (c.circle) {
            const r = c.circle.r + radius;
            if (distanceSq(x, y, c.circle.x, c.circle.y) < r * r) return true;
          } else if (c.rect && circleRectOverlap({ x, y, r: radius }, c.rect)) {
            return true;
          }
        }
      }
    }
    return false;
  }
}
