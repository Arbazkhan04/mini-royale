import type { Circle, Rect, Vec2 } from './Constants';

export const TAU = Math.PI * 2;

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Frame-rate independent exponential smoothing. `t` is the fraction closed per 16.7ms. */
export const damp = (a: number, b: number, t: number, deltaMs: number): number =>
  lerp(a, b, 1 - Math.pow(1 - t, deltaMs / 16.667));

export const distance = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(bx - ax, by - ay);

export const distanceSq = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};

export const angleBetween = (ax: number, ay: number, bx: number, by: number): number =>
  Math.atan2(by - ay, bx - ax);

/** Shortest signed difference between two angles, in (-PI, PI]. */
export const angleDelta = (from: number, to: number): number => {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

export const rotateTowards = (from: number, to: number, maxStep: number): number => {
  const d = angleDelta(from, to);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
};

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

export const normalize = (v: Vec2): Vec2 => {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
};

/** Maps `v` from [inMin,inMax] to [outMin,outMax], clamped. */
export const mapRange = (
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number => {
  if (inMax - inMin === 0) return outMin;
  return clamp(outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin), Math.min(outMin, outMax), Math.max(outMin, outMax));
};

export const pointInRect = (px: number, py: number, r: Rect): boolean =>
  px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

export const pointInCircle = (px: number, py: number, c: Circle): boolean =>
  distanceSq(px, py, c.x, c.y) <= c.r * c.r;

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const circleRectOverlap = (c: Circle, r: Rect): boolean => {
  const nx = clamp(c.x, r.x, r.x + r.w);
  const ny = clamp(c.y, r.y, r.y + r.h);
  return distanceSq(c.x, c.y, nx, ny) <= c.r * c.r;
};

export const rectCenter = (r: Rect): Vec2 => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export const expandRect = (r: Rect, by: number): Rect => ({
  x: r.x - by,
  y: r.y - by,
  w: r.w + by * 2,
  h: r.h + by * 2,
});

export interface RayHit {
  t: number;
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/**
 * Segment (px,py)->(px+dx,py+dy) against an axis-aligned rect.
 * Returns the entry hit with normal, or null. Slab method.
 */
export const segmentRect = (
  px: number,
  py: number,
  dx: number,
  dy: number,
  r: Rect,
): RayHit | null => {
  let tMin = 0;
  let tMax = 1;
  let nx = 0;
  let ny = 0;

  // X slab
  if (Math.abs(dx) < 1e-9) {
    if (px < r.x || px > r.x + r.w) return null;
  } else {
    const inv = 1 / dx;
    let t1 = (r.x - px) * inv;
    let t2 = (r.x + r.w - px) * inv;
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      nx = sign;
      ny = 0;
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }

  // Y slab
  if (Math.abs(dy) < 1e-9) {
    if (py < r.y || py > r.y + r.h) return null;
  } else {
    const inv = 1 / dy;
    let t1 = (r.y - py) * inv;
    let t2 = (r.y + r.h - py) * inv;
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      nx = 0;
      ny = sign;
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }

  if (tMin < 0 || tMin > 1) return null;
  return { t: tMin, x: px + dx * tMin, y: py + dy * tMin, nx, ny };
};

/** Segment against a circle; returns the nearest entry hit or null. */
export const segmentCircle = (
  px: number,
  py: number,
  dx: number,
  dy: number,
  c: Circle,
): RayHit | null => {
  const fx = px - c.x;
  const fy = py - c.y;
  const a = dx * dx + dy * dy;
  if (a < 1e-9) return null;
  const b = 2 * (fx * dx + fy * dy);
  const cc = fx * fx + fy * fy - c.r * c.r;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0 || t > 1) return null;
  const hx = px + dx * t;
  const hy = py + dy * t;
  const len = Math.hypot(hx - c.x, hy - c.y) || 1;
  return { t, x: hx, y: hy, nx: (hx - c.x) / len, ny: (hy - c.y) / len };
};

/** Shortest distance from point to segment. */
export const pointSegmentDistance = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number => {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-9) return distance(px, py, ax, ay);
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / lenSq, 0, 1);
  return distance(px, py, ax + abx * t, ay + aby * t);
};

export const formatTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
};
