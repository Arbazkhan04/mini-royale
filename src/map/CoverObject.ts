import { ObstacleKind } from '../utils/Constants';
import type { Rect } from '../utils/Constants';
import { pointSegmentDistance } from '../utils/MathUtils';

export type ObstacleShape = 'circle' | 'rect';

export interface ObstacleOptions {
  kind: ObstacleKind;
  x: number;
  y: number;
  shape: ObstacleShape;
  radius?: number;
  w?: number;
  h?: number;
  blocksMovement?: boolean;
  blocksBullets?: boolean;
  /** Tall objects render above entities (tree canopies, high walls). */
  tall?: boolean;
  /** Soft objects (bushes) conceal but never block. */
  concealment?: number;
  variant?: number;
  scale?: number;
  /** Wooden things can be shot apart; concrete and rock cannot. */
  destructible?: boolean;
  hitPoints?: number;
  /** Thin wooden objects are what sniper rounds punch through. */
  thin?: boolean;
}

let nextObstacleId = 1;

/**
 * A single piece of world cover: tree, rock, crate, fence post, furniture...
 * Pure data plus geometry helpers - rendering lives in MapRenderer.
 */
export class CoverObject {
  readonly id: number;
  readonly kind: ObstacleKind;
  readonly shape: ObstacleShape;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly w: number;
  readonly h: number;
  readonly blocksMovement: boolean;
  readonly blocksBullets: boolean;
  readonly tall: boolean;
  readonly concealment: number;
  readonly variant: number;
  readonly scale: number;
  readonly destructible: boolean;
  readonly maxHp: number;
  readonly thin: boolean;
  hp: number;
  destroyed = false;

  constructor(opts: ObstacleOptions) {
    this.id = nextObstacleId++;
    this.kind = opts.kind;
    this.shape = opts.shape;
    this.x = opts.x;
    this.y = opts.y;
    this.radius = opts.radius ?? 0;
    this.w = opts.w ?? 0;
    this.h = opts.h ?? 0;
    this.blocksMovement = opts.blocksMovement ?? true;
    this.blocksBullets = opts.blocksBullets ?? true;
    this.tall = opts.tall ?? false;
    this.concealment = opts.concealment ?? 0;
    this.variant = opts.variant ?? 0;
    this.scale = opts.scale ?? 1;
    this.destructible = opts.destructible ?? false;
    this.maxHp = opts.hitPoints ?? 0;
    this.hp = this.maxHp;
    this.thin = opts.thin ?? false;
  }

  /** 0 = untouched, 1 = cracked, 2 = badly damaged. Drives the damage overlay. */
  get damageStage(): number {
    if (!this.destructible || this.maxHp <= 0) return 0;
    const ratio = this.hp / this.maxHp;
    if (ratio > 0.66) return 0;
    if (ratio > 0.33) return 1;
    return 2;
  }

  /** Returns true when this hit destroyed the object. */
  applyDamage(amount: number): boolean {
    if (!this.destructible || this.destroyed) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.destroyed = true;
      return true;
    }
    return false;
  }

  /** Axis-aligned bounds in world space (top-left origin). */
  get bounds(): Rect {
    if (this.shape === 'circle') {
      return { x: this.x - this.radius, y: this.y - this.radius, w: this.radius * 2, h: this.radius * 2 };
    }
    return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
  }

  /** Rough radius used for proximity queries. */
  get extent(): number {
    return this.shape === 'circle' ? this.radius : Math.max(this.w, this.h) * 0.5;
  }

  /**
   * True when this object sits between `fromX/Y` and `atX/Y` - i.e. crouching here
   * would break line of fire. Used by bots when picking cover.
   */
  shieldsFrom(atX: number, atY: number, fromX: number, fromY: number): boolean {
    if (!this.blocksBullets) return false;
    return pointSegmentDistance(this.x, this.y, atX, atY, fromX, fromY) < this.extent + 6;
  }
}

export const isSolid = (o: CoverObject): boolean => o.blocksMovement;
