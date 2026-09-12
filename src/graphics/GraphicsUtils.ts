import type Phaser from 'phaser';

/**
 * Fills the ring between two radii.
 *
 * A very wide `strokeCircle` looks like an annulus in theory but Phaser triangulates
 * thick strokes per segment, which produces visible spokes, so the ring is built from
 * explicit quads instead.
 */
export const fillAnnulus = (
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  color: number,
  alpha: number,
  segments = 64,
): void => {
  if (outerRadius <= innerRadius || alpha <= 0) return;
  g.fillStyle(color, alpha);
  const step = (Math.PI * 2) / segments;
  for (let i = 0; i < segments; i++) {
    const a0 = i * step;
    const a1 = a0 + step;
    const cos0 = Math.cos(a0);
    const sin0 = Math.sin(a0);
    const cos1 = Math.cos(a1);
    const sin1 = Math.sin(a1);
    const ix0 = cx + cos0 * innerRadius;
    const iy0 = cy + sin0 * innerRadius;
    const ix1 = cx + cos1 * innerRadius;
    const iy1 = cy + sin1 * innerRadius;
    const ox0 = cx + cos0 * outerRadius;
    const oy0 = cy + sin0 * outerRadius;
    const ox1 = cx + cos1 * outerRadius;
    const oy1 = cy + sin1 * outerRadius;
    // Two explicit triangles per segment: path filling triangulates the whole ring as
    // one polygon and floods the middle, which is exactly what must stay clear.
    g.fillTriangle(ix0, iy0, ox0, oy0, ox1, oy1);
    g.fillTriangle(ix0, iy0, ox1, oy1, ix1, iy1);
  }
};

/** Dashed circle outline, used for the next safe zone. */
export const strokeDashedCircle = (
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  radius: number,
  dashLength: number,
  gapLength: number,
): void => {
  if (radius <= 1) return;
  const circumference = Math.PI * 2 * radius;
  const segments = Math.max(8, Math.floor(circumference / (dashLength + gapLength)));
  const dashAngle = (dashLength / circumference) * Math.PI * 2;
  const step = (Math.PI * 2) / segments;
  for (let i = 0; i < segments; i++) {
    const a0 = i * step;
    g.beginPath();
    g.arc(cx, cy, radius, a0, a0 + dashAngle, false);
    g.strokePath();
  }
};
