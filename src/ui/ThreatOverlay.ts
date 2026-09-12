import Phaser from 'phaser';
import { THREAT_INDICATOR } from '../config/GameConfig';
import { Depth } from '../utils/Constants';
import { distance } from '../utils/MathUtils';
import type { Combatant } from '../entities/Combatant';
import type { MatchContext } from '../systems/MatchContext';

interface Threat {
  enemy: Combatant;
  /** 0 at the edge of the indicator range, 1 right on top of you. */
  urgency: number;
}

/**
 * What the game knows about enemies near you, drawn over the world.
 *
 * Two things share this overlay because they answer the same question - *who am I fighting
 * and where are they* - at the two moments it matters:
 *
 *  - **Off-screen chevrons.** A phone shows a fraction of the world, so an enemy shooting
 *    you from behind is invisible and unanswerable. A marker on the screen edge points at
 *    them. It requires line of sight, so it never reveals someone hiding behind a wall:
 *    it only tells you about a fight you are already in. Anyone who has actually shot you
 *    stays marked briefly even after breaking line of sight, because by then you know.
 *  - **The soft-lock bracket.** When aim assist has chosen a target, it says so. An assist
 *    that silently decides where your shots go is confusing; one that shows its pick reads
 *    as the game helping.
 */
export class ThreatOverlay {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly threats: Threat[] = [];
  private enabled: boolean = THREAT_INDICATOR.enabled;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: MatchContext,
  ) {
    this.graphics = scene.add.graphics().setDepth(Depth.Debug - 2);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.graphics.setVisible(enabled);
  }

  update(): void {
    const g = this.graphics;
    g.clear();
    if (!this.enabled) return;

    const player = this.ctx.player;
    if (!player || !player.alive) return;

    // The world camera belongs to the game scene; this overlay lives in the UI scene.
    const camera = this.ctx.scene.cameras.main;
    const view = camera.worldView;
    const zoom = camera.zoom;
    const screenW = this.scene.scale.width;
    const screenH = this.scene.scale.height;

    const toScreenX = (worldX: number): number => (worldX - view.x) * zoom;
    const toScreenY = (worldY: number): number => (worldY - view.y) * zoom;

    this.collectThreats(player);

    const margin = THREAT_INDICATOR.edgeMargin;
    const px = toScreenX(player.x);
    const py = toScreenY(player.y);

    for (const threat of this.threats) {
      const ex = toScreenX(threat.enemy.x);
      const ey = toScreenY(threat.enemy.y);
      const onScreen = ex >= 0 && ex <= screenW && ey >= 0 && ey <= screenH;
      if (onScreen) continue;

      // Point from the player toward the enemy, and park the chevron on the edge box.
      const angle = Math.atan2(ey - py, ex - px);
      const point = this.edgePoint(px, py, angle, margin, screenW, screenH);
      this.drawChevron(g, point.x, point.y, angle, threat.urgency);
    }

    const locked = this.ctx.aimAssist.target;
    if (locked && locked.alive) {
      this.drawLock(g, toScreenX(locked.x), toScreenY(locked.y), locked.radius * zoom);
    }
  }

  /** Alive enemies in range that either have a clear line to you, or recently shot you. */
  private collectThreats(player: Combatant): void {
    this.threats.length = 0;
    const now = this.ctx.now;

    for (const other of this.ctx.combatants) {
      if (other === player || !other.alive) continue;
      const dist = distance(player.x, player.y, other.x, other.y);
      if (dist > THREAT_INDICATOR.range) continue;

      const recentAttacker =
        player.lastDamageFrom === other &&
        now - player.lastDamagedAt < THREAT_INDICATOR.recentAttackerMs;
      if (
        !recentAttacker &&
        !this.ctx.collision.hasLineOfSight(player.x, player.y, other.x, other.y)
      ) {
        continue;
      }

      this.threats.push({ enemy: other, urgency: 1 - dist / THREAT_INDICATOR.range });
    }

    // Closest first, so a crowded moment shows the ones that matter.
    this.threats.sort((a, b) => b.urgency - a.urgency);
    if (this.threats.length > THREAT_INDICATOR.maxShown) {
      this.threats.length = THREAT_INDICATOR.maxShown;
    }
  }

  /**
   * Where a ray leaving (px, py) at `angle` crosses the inset screen box. Scaling the ray
   * to each wall and keeping the nearest crossing handles all four sides and both corners
   * without special cases.
   */
  private edgePoint(
    px: number,
    py: number,
    angle: number,
    margin: number,
    screenW: number,
    screenH: number,
  ): { x: number; y: number } {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const left = margin;
    const right = screenW - margin;
    const top = margin;
    const bottom = screenH - margin;

    let travel = Infinity;
    if (dx > 1e-4) travel = Math.min(travel, (right - px) / dx);
    else if (dx < -1e-4) travel = Math.min(travel, (left - px) / dx);
    if (dy > 1e-4) travel = Math.min(travel, (bottom - py) / dy);
    else if (dy < -1e-4) travel = Math.min(travel, (top - py) / dy);
    if (!Number.isFinite(travel) || travel < 0) travel = 0;

    return {
      x: Phaser.Math.Clamp(px + dx * travel, left, right),
      y: Phaser.Math.Clamp(py + dy * travel, top, bottom),
    };
  }

  private drawChevron(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    angle: number,
    urgency: number,
  ): void {
    const size = 11 + urgency * 7;
    const alpha = 0.4 + urgency * 0.5;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Triangle pointing outward along the bearing to the enemy.
    const tipX = x + cos * size;
    const tipY = y + sin * size;
    const leftX = x - cos * size * 0.5 - sin * size * 0.72;
    const leftY = y - sin * size * 0.5 + cos * size * 0.72;
    const rightX = x - cos * size * 0.5 + sin * size * 0.72;
    const rightY = y - sin * size * 0.5 - cos * size * 0.72;

    g.fillStyle(0x000000, alpha * 0.45);
    g.fillTriangle(tipX + 1, tipY + 2, leftX + 1, leftY + 2, rightX + 1, rightY + 2);
    g.fillStyle(0xff5566, alpha);
    g.fillTriangle(tipX, tipY, leftX, leftY, rightX, rightY);
  }

  private drawLock(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    radius: number,
  ): void {
    const r = radius + 9;
    const arm = r * 0.55;
    g.lineStyle(2, 0xffd45e, 0.85);
    // Four corner brackets rather than a full ring: it reads as a reticle, not as a
    // health bar, and it never hides the enemy underneath it.
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      g.beginPath();
      g.moveTo(x + sx * r, y + sy * r - sy * arm);
      g.lineTo(x + sx * r, y + sy * r);
      g.lineTo(x + sx * r - sx * arm, y + sy * r);
      g.strokePath();
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
