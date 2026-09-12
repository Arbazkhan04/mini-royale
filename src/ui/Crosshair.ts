import Phaser from 'phaser';
import { Depth } from '../utils/Constants';
import { clamp, damp } from '../utils/MathUtils';
import type { MatchContext } from '../systems/MatchContext';

/**
 * Screen-space crosshair that opens up with weapon spread, movement and recoil, and
 * flashes on a confirmed hit. Hidden on touch devices, where aiming is stick-driven.
 */
export class Crosshair {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private spread = 10;
  private hitFlash = 0;
  private enabled = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: MatchContext,
  ) {
    this.graphics = scene.add.graphics().setDepth(Depth.Debug + 1);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.graphics.setVisible(enabled);
  }

  flashHit(): void {
    this.hitFlash = 1;
  }

  update(delta: number): void {
    if (!this.enabled) return;
    const g = this.graphics;
    g.clear();

    const player = this.ctx.player;
    if (!player || !player.alive) return;

    const pointer = this.scene.input.activePointer;
    const x = pointer.x;
    const y = pointer.y;

    const weapon = player.weapon;
    let target = 8 + weapon.spreadDeg * 2.4;
    if (player.isMoving) target += weapon.base.moveSpreadDeg * 2.2;
    target += Math.abs(weapon.recoil) * 90;
    if (weapon.isMelee) target = 10;
    this.spread = damp(this.spread, clamp(target, 6, 60), 0.3, delta);

    this.hitFlash = Math.max(0, this.hitFlash - delta / 260);
    const color = this.hitFlash > 0 ? 0xff6b81 : 0xffffff;
    const alpha = weapon.reloading ? 0.35 : 0.9;

    const len = 8;
    g.lineStyle(2, 0x000000, alpha * 0.6);
    this.drawCross(g, x, y, this.spread + 1, len + 1);
    g.lineStyle(2, color, alpha);
    this.drawCross(g, x, y, this.spread, len);
    g.fillStyle(color, alpha * 0.9);
    g.fillCircle(x, y, 1.6);
  }

  private drawCross(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    gap: number,
    len: number,
  ): void {
    g.lineBetween(x - gap - len, y, x - gap, y);
    g.lineBetween(x + gap, y, x + gap + len, y);
    g.lineBetween(x, y - gap - len, x, y - gap);
    g.lineBetween(x, y + gap, x, y + gap + len);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
