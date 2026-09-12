import { SurfaceKind } from '../utils/Constants';
import type { Rect, Vec2 } from '../utils/Constants';
import { pointInRect } from '../utils/MathUtils';
import type { CoverObject } from './CoverObject';
import type { LootPoint } from './MapData';

export interface DoorGap {
  /** Side of the building the door sits on. */
  side: 'n' | 's' | 'e' | 'w';
  /** World position of the middle of the opening. */
  x: number;
  y: number;
  width: number;
}

export interface BuildingOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  floor: SurfaceKind;
  name: string;
  hasRoof?: boolean;
  roofColor?: number;
  roofShadeColor?: number;
  wallColor?: number;
}

let nextBuildingId = 1;

/**
 * A rectangular structure made of axis-aligned wall segments with door gaps.
 * Interior furniture and loot points are attached by the generator.
 */
export class Building {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly floor: SurfaceKind;
  readonly name: string;
  readonly hasRoof: boolean;
  readonly roofColor: number;
  readonly roofShadeColor: number;
  readonly wallColor: number;

  /** Solid wall rectangles in world space. */
  readonly walls: Rect[] = [];
  readonly doors: DoorGap[] = [];
  readonly furniture: CoverObject[] = [];
  readonly lootPoints: LootPoint[] = [];

  constructor(opts: BuildingOptions) {
    this.id = nextBuildingId++;
    this.x = opts.x;
    this.y = opts.y;
    this.w = opts.w;
    this.h = opts.h;
    this.floor = opts.floor;
    this.name = opts.name;
    this.hasRoof = opts.hasRoof ?? true;
    this.roofColor = opts.roofColor ?? 0x6d5b4a;
    this.roofShadeColor = opts.roofShadeColor ?? 0x55463a;
    this.wallColor = opts.wallColor ?? 0xb9b3a4;
  }

  get bounds(): Rect {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  get center(): Vec2 {
    return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
  }

  addWall(x: number, y: number, w: number, h: number): void {
    if (w <= 0 || h <= 0) return;
    this.walls.push({ x, y, w, h });
  }

  /**
   * Builds one side of the building, leaving gaps where doors are.
   * `gaps` are 1D intervals along the wall axis, in world coordinates.
   */
  addWallWithGaps(
    axis: 'h' | 'v',
    fixed: number,
    from: number,
    to: number,
    thickness: number,
    gaps: Array<{ start: number; end: number }>,
  ): void {
    const sorted = [...gaps].sort((a, b) => a.start - b.start);
    let cursor = from;
    for (const gap of sorted) {
      const start = Math.max(from, gap.start);
      const end = Math.min(to, gap.end);
      if (end <= cursor) continue;
      if (start > cursor) {
        if (axis === 'h') this.addWall(cursor, fixed, start - cursor, thickness);
        else this.addWall(fixed, cursor, thickness, start - cursor);
      }
      cursor = Math.max(cursor, end);
    }
    if (cursor < to) {
      if (axis === 'h') this.addWall(cursor, fixed, to - cursor, thickness);
      else this.addWall(fixed, cursor, thickness, to - cursor);
    }
  }

  /** Inside the outer footprint (used to fade the roof and to pick indoor spawns). */
  contains(px: number, py: number, padding = 0): boolean {
    return pointInRect(px, py, {
      x: this.x - padding,
      y: this.y - padding,
      w: this.w + padding * 2,
      h: this.h + padding * 2,
    });
  }

  /** Nearest doorway to a world position - bots path to this before entering. */
  nearestDoor(px: number, py: number): DoorGap | null {
    let best: DoorGap | null = null;
    let bestDist = Infinity;
    for (const door of this.doors) {
      const d = (door.x - px) ** 2 + (door.y - py) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = door;
      }
    }
    return best;
  }
}
