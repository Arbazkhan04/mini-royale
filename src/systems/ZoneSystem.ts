import Phaser from 'phaser';
import { PALETTE, WORLD, ZONE } from '../config/GameConfig';
import { ZONE_VARIANTS } from '../config/EventConfig';
import { Depth, GameEvent, ZonePattern } from '../utils/Constants';
import type { Vec2 } from '../utils/Constants';
import { clamp, distance, lerp } from '../utils/MathUtils';
import { strokeDashedCircle } from '../graphics/GraphicsUtils';
import type { MatchContext } from './MatchContext';

export type ZonePhaseState = 'waiting' | 'shrinking' | 'finished';

export interface ZoneCircle {
  center: Vec2;
  radius: number;
}

/**
 * The shrinking safe circle.
 *
 * Each phase waits, then interpolates the circle toward a randomised smaller circle that
 * is guaranteed to sit inside the previous one. Combatants outside take escalating damage.
 */
export class ZoneSystem {
  center: Vec2 = { x: WORLD.width / 2, y: WORLD.height / 2 };
  radius: number = ZONE.startRadius;

  nextCenter: Vec2 = { x: WORLD.width / 2, y: WORLD.height / 2 };
  nextRadius: number = ZONE.startRadius;

  phaseIndex = -1;
  state: ZonePhaseState = 'waiting';
  /** Milliseconds left in the current wait or shrink. */
  timerMs = 0;

  /** Standard, moving or split. Chosen per match by the MatchDirector. */
  pattern: ZonePattern = ZonePattern.Standard;
  /** Second safe circle during a split zone; null the rest of the time. */
  extra: ZoneCircle | null = null;
  private extraTarget: ZoneCircle | null = null;
  private extraFrom: ZoneCircle | null = null;

  private fromCenter: Vec2 = { x: 0, y: 0 };
  private fromRadius = 0;
  private phaseDurationMs = 0;
  private damageAccumulatorMs = 0;
  private warned = false;
  private ctx!: MatchContext;

  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly nextGraphics: Phaser.GameObjects.Graphics;
  private readonly danger: Phaser.GameObjects.Rectangle;
  private readonly dangerMask: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(Depth.ZoneOverlay);
    this.graphics.setScrollFactor(1);
    this.nextGraphics = scene.add.graphics().setDepth(Depth.ZoneOverlay - 1);

    this.danger = scene.add
      .rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width * 3, WORLD.height * 3, PALETTE.danger, 0.17)
      .setDepth(Depth.ZoneOverlay - 2);
    this.dangerMask = scene.make.graphics({ x: 0, y: 0 }, false);
    const mask = this.dangerMask.createGeometryMask();
    mask.invertAlpha = true;
    this.danger.setMask(mask);
  }

  bind(ctx: MatchContext): void {
    this.ctx = ctx;
  }

  start(pattern: ZonePattern = ZonePattern.Standard): void {
    this.pattern = pattern;
    this.center = { x: WORLD.width / 2, y: WORLD.height / 2 };
    this.radius = ZONE.startRadius;
    this.extra = null;
    this.extraTarget = null;
    this.extraFrom = null;
    this.phaseIndex = -1;
    this.beginNextPhase();
  }

  /** Every live safe circle. One normally, two during a split. */
  get circles(): ZoneCircle[] {
    const list: ZoneCircle[] = [{ center: this.center, radius: this.radius }];
    if (this.extra) list.push(this.extra);
    return list;
  }

  get damagePerSecond(): number {
    const idx = clamp(this.phaseIndex, 0, ZONE.phases.length - 1);
    return ZONE.phases[idx]?.damagePerSecond ?? 1;
  }

  get isFinalPhase(): boolean {
    return this.phaseIndex >= ZONE.phases.length - 1;
  }

  get secondsRemaining(): number {
    return Math.max(0, this.timerMs / 1000);
  }

  isInside(x: number, y: number, margin = 0): boolean {
    if (distance(x, y, this.center.x, this.center.y) <= this.radius - margin) return true;
    const extra = this.extra;
    if (extra && distance(x, y, extra.center.x, extra.center.y) <= extra.radius - margin) return true;
    return false;
  }

  /** Closest safe point for a combatant to head toward. */
  safeTarget(x: number, y: number, margin: number): Vec2 {
    // While shrinking, aim at where the circle is going, not where it is.
    let target = this.state === 'shrinking' ? this.nextCenter : this.center;
    let targetRadius = this.state === 'shrinking' ? this.nextRadius : this.radius;

    // With two circles, head for whichever is closer.
    const other = this.state === 'shrinking' ? this.extraTarget : this.extra;
    if (other) {
      const dMain = distance(x, y, target.x, target.y) - targetRadius;
      const dOther = distance(x, y, other.center.x, other.center.y) - other.radius;
      if (dOther < dMain) {
        target = other.center;
        targetRadius = other.radius;
      }
    }
    const d = distance(x, y, target.x, target.y);
    const safeRadius = Math.max(40, targetRadius - margin);
    if (d <= safeRadius) return { x, y };
    const t = safeRadius / Math.max(d, 1);
    return {
      x: target.x + (x - target.x) * t,
      y: target.y + (y - target.y) * t,
    };
  }

  private beginNextPhase(): void {
    this.phaseIndex++;
    if (this.phaseIndex >= ZONE.phases.length) {
      this.state = 'finished';
      this.timerMs = 0;
      return;
    }
    const phase = ZONE.phases[this.phaseIndex];
    if (!phase) {
      this.state = 'finished';
      return;
    }

    this.nextRadius = phase.radius;
    this.nextCenter = this.pickNextCenter(phase.radius);
    this.planSplit();
    this.state = 'waiting';
    this.timerMs = phase.waitMs;
    this.phaseDurationMs = phase.waitMs;
    this.warned = false;

    this.ctx.events.emit(GameEvent.ZonePhaseChanged, {
      phase: this.phaseIndex + 1,
      total: ZONE.phases.length,
      state: this.state,
      radius: this.radius,
      nextRadius: this.nextRadius,
    });
  }

  /** Random center guaranteed to keep the new circle inside the current one. */
  private pickNextCenter(newRadius: number): Vec2 {
    const rng = this.ctx.rng;
    const maxDrift = Math.max(0, this.radius - newRadius);
    const angle = rng.range(0, Math.PI * 2);
    // Bias slightly toward the middle so late circles do not hug the map edge.
    const drift = Math.sqrt(rng.next()) * maxDrift * 0.82;
    let x = this.center.x + Math.cos(angle) * drift;
    let y = this.center.y + Math.sin(angle) * drift;
    x = clamp(x, newRadius * 0.35, WORLD.width - newRadius * 0.35);
    y = clamp(y, newRadius * 0.35, WORLD.height - newRadius * 0.35);
    return { x, y };
  }

  /** Split zones fork into two circles for a phase, then converge again. */
  private planSplit(): void {
    if (this.pattern !== ZonePattern.Split) {
      this.extraTarget = null;
      return;
    }
    if (this.phaseIndex === ZONE_VARIANTS.splitPhaseIndex) {
      const rng = this.ctx.rng;
      const angle = rng.range(0, Math.PI * 2);
      const offset = this.radius * 0.55;
      const radius = this.nextRadius * 0.72;
      this.nextRadius = radius;
      this.nextCenter = {
        x: clamp(this.center.x + Math.cos(angle) * offset, radius, WORLD.width - radius),
        y: clamp(this.center.y + Math.sin(angle) * offset, radius, WORLD.height - radius),
      };
      this.extraTarget = {
        center: {
          x: clamp(this.center.x - Math.cos(angle) * offset, radius, WORLD.width - radius),
          y: clamp(this.center.y - Math.sin(angle) * offset, radius, WORLD.height - radius),
        },
        radius,
      };
      this.ctx.events.emit(GameEvent.Announce, {
        text: 'ZONE SPLITTING',
        sub: 'Two safe circles',
        color: 0x59d6ff,
        durationMs: 2600,
      });
    } else if (this.phaseIndex > ZONE_VARIANTS.splitPhaseIndex) {
      this.extraTarget = null;
      if (this.extra) {
        this.ctx.events.emit(GameEvent.Announce, {
          text: 'ZONES MERGING',
          sub: 'One circle left',
          color: 0x59d6ff,
          durationMs: 2400,
        });
      }
    }
  }

  update(delta: number): void {
    // Nothing ticks until the match is actually live, so the shrink timer can never
    // run down while the player is still waiting to take control.
    if (!this.ctx.running) {
      this.draw();
      return;
    }
    if (this.state === 'finished') {
      this.applyZoneDamage(delta);
      this.draw();
      return;
    }

    this.timerMs -= delta;

    if (this.state === 'waiting') {
      const secondsLeft = this.timerMs / 1000;
      if (!this.warned && secondsLeft <= ZONE.warningLeadSeconds) {
        this.warned = true;
        this.ctx.events.emit(GameEvent.ZoneWarning, Math.ceil(secondsLeft));
        this.ctx.audio.play('zoneWarning');
      }
      if (this.pattern === ZonePattern.Moving) {
        // The circle creeps toward its next position instead of sitting still.
        const step = (ZONE_VARIANTS.moveDriftPerSecond * delta) / 1000;
        const dx = this.nextCenter.x - this.center.x;
        const dy = this.nextCenter.y - this.center.y;
        const len = Math.hypot(dx, dy);
        if (len > 1) {
          this.center = {
            x: this.center.x + (dx / len) * Math.min(step, len),
            y: this.center.y + (dy / len) * Math.min(step, len),
          };
        }
      }
      if (this.timerMs <= 0) {
        const phase = ZONE.phases[this.phaseIndex];
        this.state = 'shrinking';
        this.timerMs = phase ? phase.shrinkMs : 15000;
        this.phaseDurationMs = this.timerMs;
        this.fromCenter = { ...this.center };
        this.fromRadius = this.radius;
        this.extraFrom = this.extra
          ? { center: { ...this.extra.center }, radius: this.extra.radius }
          : null;
        this.ctx.audio.play('zoneShrink');
        this.ctx.events.emit(GameEvent.ZonePhaseChanged, {
          phase: this.phaseIndex + 1,
          total: ZONE.phases.length,
          state: this.state,
          radius: this.radius,
          nextRadius: this.nextRadius,
        });
      }
    } else if (this.state === 'shrinking') {
      const t = 1 - clamp(this.timerMs / Math.max(1, this.phaseDurationMs), 0, 1);
      this.radius = lerp(this.fromRadius, this.nextRadius, t);
      this.center = {
        x: lerp(this.fromCenter.x, this.nextCenter.x, t),
        y: lerp(this.fromCenter.y, this.nextCenter.y, t),
      };
      // The second circle either forms, shrinks alongside, or collapses into the first.
      if (this.extraTarget) {
        const from = this.extraFrom ?? { center: { ...this.fromCenter }, radius: this.fromRadius };
        this.extra = {
          center: {
            x: lerp(from.center.x, this.extraTarget.center.x, t),
            y: lerp(from.center.y, this.extraTarget.center.y, t),
          },
          radius: lerp(from.radius, this.extraTarget.radius, t),
        };
      } else if (this.extra) {
        const from = this.extraFrom ?? this.extra;
        this.extra = {
          center: {
            x: lerp(from.center.x, this.nextCenter.x, t),
            y: lerp(from.center.y, this.nextCenter.y, t),
          },
          radius: lerp(from.radius, this.nextRadius, t),
        };
      }

      if (this.timerMs <= 0) {
        this.radius = this.nextRadius;
        this.center = { ...this.nextCenter };
        this.extra = this.extraTarget
          ? { center: { ...this.extraTarget.center }, radius: this.extraTarget.radius }
          : null;
        this.beginNextPhase();
      }
    }

    this.applyZoneDamage(delta);
    this.draw();
  }

  private applyZoneDamage(delta: number): void {
    if (!this.ctx.running) return;
    this.damageAccumulatorMs += delta;
    if (this.damageAccumulatorMs < ZONE.damageTickMs) return;
    const ticks = Math.floor(this.damageAccumulatorMs / ZONE.damageTickMs);
    this.damageAccumulatorMs -= ticks * ZONE.damageTickMs;
    const dps = this.damagePerSecond;

    for (const c of this.ctx.combatants) {
      if (!c.alive) continue;
      if (this.isInside(c.x, c.y)) continue;
      const angle = Math.atan2(this.center.y - c.y, this.center.x - c.x);
      this.ctx.combat.applyDamage(c, {
        amount: dps * ticks,
        source: null,
        weaponLabel: 'the storm',
        headshot: false,
        fromAngle: angle + Math.PI,
      });
    }
  }

  private draw(): void {
    const g = this.graphics;
    g.clear();

    // The danger area is a world-sized red wash with the safe circles punched out of it
    // by an inverted mask, which works for one circle or two without special cases.
    this.dangerMask.clear();
    this.dangerMask.fillStyle(0xffffff, 1);
    for (const circle of this.circles) {
      this.dangerMask.fillCircle(circle.center.x, circle.center.y, circle.radius);
    }
    this.danger.setAlpha(this.state === 'shrinking' ? 0.26 : 0.17);

    const pulse = 0.72 + Math.sin(this.scene.time.now * 0.006) * 0.18;
    for (const circle of this.circles) {
      g.lineStyle(7, PALETTE.safeZone, pulse);
      g.strokeCircle(circle.center.x, circle.center.y, circle.radius);
      g.lineStyle(2, 0xffffff, 0.4 * pulse);
      g.strokeCircle(circle.center.x, circle.center.y, circle.radius - 5);
    }

    const ng = this.nextGraphics;
    ng.clear();
    if (this.state !== 'finished') {
      ng.lineStyle(3, PALETTE.nextZone, 0.55);
      strokeDashedCircle(ng, this.nextCenter.x, this.nextCenter.y, this.nextRadius, 26, 18);
      if (this.extraTarget) {
        strokeDashedCircle(
          ng,
          this.extraTarget.center.x,
          this.extraTarget.center.y,
          this.extraTarget.radius,
          26,
          18,
        );
      }
    }
  }

  /** Label shown in the HUD. */
  statusText(): string {
    if (this.state === 'finished') return 'FINAL ZONE';
    if (this.state === 'shrinking') return 'ZONE IS CLOSING';
    return 'ZONE SHRINKING IN';
  }

  reset(): void {
    this.graphics.clear();
    this.nextGraphics.clear();
    this.danger.clearMask(true);
    this.danger.destroy();
  }
}
