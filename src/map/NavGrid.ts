import type { Rect, Vec2 } from '../utils/Constants';
import { clamp } from '../utils/MathUtils';

const SQRT2 = Math.SQRT2;

/**
 * Coarse walkability grid + A*.
 *
 * Bots would either jam against walls with pure steering or eat the frame budget with
 * per-frame pathfinding, so paths are solved on a 25-unit grid, cached, and the solves
 * are rate limited by BotAISystem. Node bookkeeping uses typed arrays that are reused
 * between solves to keep allocations out of the hot loop.
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;

  private readonly blocked: Uint8Array;
  private readonly gScore: Float32Array;
  private readonly fScore: Float32Array;
  private readonly cameFrom: Int32Array;
  private readonly visitState: Uint8Array;
  /** Stamp lets us skip clearing the big arrays between solves. */
  private readonly stamp: Int32Array;
  private currentStamp = 0;

  private readonly heap: Int32Array;
  private heapSize = 0;

  constructor(
    readonly worldWidth: number,
    readonly worldHeight: number,
    readonly cellSize: number,
  ) {
    this.cols = Math.ceil(worldWidth / cellSize);
    this.rows = Math.ceil(worldHeight / cellSize);
    const count = this.cols * this.rows;
    this.blocked = new Uint8Array(count);
    this.gScore = new Float32Array(count);
    this.fScore = new Float32Array(count);
    this.cameFrom = new Int32Array(count);
    this.visitState = new Uint8Array(count);
    this.stamp = new Int32Array(count);
    this.heap = new Int32Array(count + 1);
  }

  index(cx: number, cy: number): number {
    return cy * this.cols + cx;
  }

  cellX(worldX: number): number {
    return clamp(Math.floor(worldX / this.cellSize), 0, this.cols - 1);
  }

  cellY(worldY: number): number {
    return clamp(Math.floor(worldY / this.cellSize), 0, this.rows - 1);
  }

  centerOf(cx: number, cy: number): Vec2 {
    return { x: (cx + 0.5) * this.cellSize, y: (cy + 0.5) * this.cellSize };
  }

  isBlockedCell(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return true;
    return this.blocked[this.index(cx, cy)] === 1;
  }

  isWalkable(worldX: number, worldY: number): boolean {
    return !this.isBlockedCell(this.cellX(worldX), this.cellY(worldY));
  }

  /** Marks every cell whose centre falls inside `rect` grown by `inflate`. */
  blockRect(rect: Rect, inflate: number): void {
    const minX = this.cellX(rect.x - inflate);
    const maxX = this.cellX(rect.x + rect.w + inflate);
    const minY = this.cellY(rect.y - inflate);
    const maxY = this.cellY(rect.y + rect.h + inflate);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const c = this.centerOf(cx, cy);
        if (
          c.x >= rect.x - inflate &&
          c.x <= rect.x + rect.w + inflate &&
          c.y >= rect.y - inflate &&
          c.y <= rect.y + rect.h + inflate
        ) {
          this.blocked[this.index(cx, cy)] = 1;
        }
      }
    }
  }

  /** Marks every cell whose centre falls inside `rect` walkable again. */
  clearRect(rect: Rect): void {
    const minX = this.cellX(rect.x);
    const maxX = this.cellX(rect.x + rect.w);
    const minY = this.cellY(rect.y);
    const maxY = this.cellY(rect.y + rect.h);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const c = this.centerOf(cx, cy);
        if (c.x >= rect.x && c.x <= rect.x + rect.w && c.y >= rect.y && c.y <= rect.y + rect.h) {
          this.blocked[this.index(cx, cy)] = 0;
        }
      }
    }
  }

  blockCircle(x: number, y: number, radius: number, inflate: number): void {
    const r = radius + inflate;
    const minX = this.cellX(x - r);
    const maxX = this.cellX(x + r);
    const minY = this.cellY(y - r);
    const maxY = this.cellY(y + r);
    const rSq = r * r;
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const c = this.centerOf(cx, cy);
        const dx = c.x - x;
        const dy = c.y - y;
        if (dx * dx + dy * dy <= rSq) this.blocked[this.index(cx, cy)] = 1;
      }
    }
  }

  /** Seals the outer ring so paths never hug the world edge. */
  blockBorder(thicknessCells: number): void {
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        if (
          cx < thicknessCells ||
          cy < thicknessCells ||
          cx >= this.cols - thicknessCells ||
          cy >= this.rows - thicknessCells
        ) {
          this.blocked[this.index(cx, cy)] = 1;
        }
      }
    }
  }

  /** Nearest walkable cell centre to a world point, searched in rings. */
  nearestWalkable(worldX: number, worldY: number, maxRings = 10): Vec2 | null {
    const sx = this.cellX(worldX);
    const sy = this.cellY(worldY);
    if (!this.isBlockedCell(sx, sy)) return this.centerOf(sx, sy);
    for (let ring = 1; ring <= maxRings; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
          const cx = sx + dx;
          const cy = sy + dy;
          if (!this.isBlockedCell(cx, cy)) return this.centerOf(cx, cy);
        }
      }
    }
    return null;
  }

  /** Bresenham-style walkability check between two world points. */
  hasClearLine(x0: number, y0: number, x1: number, y1: number): boolean {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (this.cellSize * 0.5));
    if (steps <= 0) return true;
    const dx = (x1 - x0) / steps;
    const dy = (y1 - y0) / steps;
    for (let i = 1; i <= steps; i++) {
      if (this.isBlockedCell(this.cellX(x0 + dx * i), this.cellY(y0 + dy * i))) return false;
    }
    return true;
  }

  /**
   * A* between two world points. Returns smoothed waypoints (excluding the start),
   * or null when unreachable inside `maxNodes`.
   */
  findPath(
    startX: number,
    startY: number,
    goalX: number,
    goalY: number,
    maxNodes = 3500,
  ): Vec2[] | null {
    const start = this.nearestWalkable(startX, startY, 6);
    const goal = this.nearestWalkable(goalX, goalY, 8);
    if (!start || !goal) return null;

    const sx = this.cellX(start.x);
    const sy = this.cellY(start.y);
    const gx = this.cellX(goal.x);
    const gy = this.cellY(goal.y);
    const startIdx = this.index(sx, sy);
    const goalIdx = this.index(gx, gy);

    if (startIdx === goalIdx) return [{ x: goalX, y: goalY }];

    this.currentStamp++;
    this.heapSize = 0;

    this.touch(startIdx);
    this.gScore[startIdx] = 0;
    this.fScore[startIdx] = this.heuristic(sx, sy, gx, gy);
    this.cameFrom[startIdx] = -1;
    this.heapPush(startIdx);

    let expanded = 0;
    let found = false;

    while (this.heapSize > 0 && expanded < maxNodes) {
      const current = this.heapPop();
      if (this.visitState[current] === 2) continue; // stale duplicate from lazy decrease-key
      if (current === goalIdx) {
        found = true;
        break;
      }
      this.visitState[current] = 2;
      expanded++;

      const cx = current % this.cols;
      const cy = (current - cx) / this.cols;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
          const nIdx = this.index(nx, ny);
          if (this.blocked[nIdx] === 1) continue;
          // No corner cutting: both orthogonal neighbours must be open.
          if (dx !== 0 && dy !== 0) {
            if (this.blocked[this.index(cx + dx, cy)] === 1) continue;
            if (this.blocked[this.index(cx, cy + dy)] === 1) continue;
          }
          this.touch(nIdx);
          if (this.visitState[nIdx] === 2) continue;
          const step = dx !== 0 && dy !== 0 ? SQRT2 : 1;
          const tentative = (this.gScore[current] as number) + step;
          if (this.visitState[nIdx] === 1 && tentative >= (this.gScore[nIdx] as number)) continue;
          this.cameFrom[nIdx] = current;
          this.gScore[nIdx] = tentative;
          this.fScore[nIdx] = tentative + this.heuristic(nx, ny, gx, gy);
          if (this.visitState[nIdx] !== 1) {
            this.visitState[nIdx] = 1;
            this.heapPush(nIdx);
          } else {
            this.heapPush(nIdx); // lazy decrease-key: duplicates are filtered on pop
          }
        }
      }
    }

    if (!found) return null;

    const cells: number[] = [];
    let node = goalIdx;
    let guard = 0;
    while (node !== -1 && guard++ < 4096) {
      cells.push(node);
      node = this.cameFrom[node] as number;
    }
    cells.reverse();

    const points: Vec2[] = cells.map((idx) => {
      const cx = idx % this.cols;
      const cy = (idx - cx) / this.cols;
      return this.centerOf(cx, cy);
    });
    points[points.length - 1] = { x: goalX, y: goalY };
    return this.smooth({ x: startX, y: startY }, points);
  }

  /** Drops waypoints that a straight line already covers. */
  private smooth(from: Vec2, points: Vec2[]): Vec2[] {
    if (points.length <= 2) return points;
    const out: Vec2[] = [];
    let anchor = from;
    let i = 0;
    while (i < points.length) {
      let furthest = i;
      for (let j = points.length - 1; j > i; j--) {
        const p = points[j] as Vec2;
        if (this.hasClearLine(anchor.x, anchor.y, p.x, p.y)) {
          furthest = j;
          break;
        }
      }
      const chosen = points[furthest] as Vec2;
      out.push(chosen);
      anchor = chosen;
      if (furthest === points.length - 1) break;
      i = furthest + 1;
    }
    return out;
  }

  private heuristic(ax: number, ay: number, bx: number, by: number): number {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    // Octile distance.
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  }

  /** Resets per-node bookkeeping lazily using the solve stamp. */
  private touch(idx: number): void {
    if (this.stamp[idx] !== this.currentStamp) {
      this.stamp[idx] = this.currentStamp;
      this.gScore[idx] = Infinity;
      this.fScore[idx] = Infinity;
      this.cameFrom[idx] = -1;
      this.visitState[idx] = 0;
    }
  }

  private heapPush(idx: number): void {
    let i = ++this.heapSize;
    this.heap[i] = idx;
    while (i > 1) {
      const parent = i >> 1;
      if ((this.fScore[this.heap[parent] as number] as number) <= (this.fScore[idx] as number)) break;
      this.heap[i] = this.heap[parent] as number;
      this.heap[parent] = idx;
      i = parent;
    }
  }

  private heapPop(): number {
    const top = this.heap[1] as number;
    this.heap[1] = this.heap[this.heapSize--] as number;
    let i = 1;
    for (;;) {
      const left = i << 1;
      const right = left + 1;
      let smallest = i;
      if (
        left <= this.heapSize &&
        (this.fScore[this.heap[left] as number] as number) < (this.fScore[this.heap[smallest] as number] as number)
      ) {
        smallest = left;
      }
      if (
        right <= this.heapSize &&
        (this.fScore[this.heap[right] as number] as number) < (this.fScore[this.heap[smallest] as number] as number)
      ) {
        smallest = right;
      }
      if (smallest === i) break;
      const tmp = this.heap[i] as number;
      this.heap[i] = this.heap[smallest] as number;
      this.heap[smallest] = tmp;
      i = smallest;
    }
    return top;
  }

  /** Debug helper - returns blocked cells inside a viewport rect. */
  debugCells(view: Rect): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    const minX = this.cellX(view.x);
    const maxX = this.cellX(view.x + view.w);
    const minY = this.cellY(view.y);
    const maxY = this.cellY(view.y + view.h);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        if (this.blocked[this.index(cx, cy)] === 1) out.push({ x: cx * this.cellSize, y: cy * this.cellSize });
      }
    }
    return out;
  }
}
