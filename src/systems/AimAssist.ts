import { AIM_ASSIST } from '../config/GameConfig';
import { angleBetween, angleDelta, clamp, degToRad, distance } from '../utils/MathUtils';
import type { Combatant } from '../entities/Combatant';
import type { MatchContext } from './MatchContext';

export interface AimAssistResult {
  /** Aim angle after assistance. */
  aim: number;
  /** Multiplier applied to the player's turn speed this frame. */
  turnSpeedMult: number;
}

const NO_ASSIST: AimAssistResult = { aim: 0, turnSpeedMult: 1 };

/**
 * Light aim help for touch input only.
 *
 * This is deliberately *not* auto-aim: it never tracks a target and never moves the
 * reticle on its own. It does three small things, all capped per second so a player can
 * always override them:
 *  - widens the hit tolerance of the player's own bullets a little,
 *  - slows the aim sweep while it passes across an enemy, so a thumb can settle on them,
 *  - nudges the aim a couple of degrees toward a target that is already almost lined up.
 *
 * Desktop gets none of it.
 */
export class AimAssist {
  private ctx!: MatchContext;
  enabled = false;

  bind(ctx: MatchContext): void {
    this.ctx = ctx;
    this.enabled = ctx.isTouch && AIM_ASSIST.enabledOnTouch;
  }

  /** Extra radius added to enemies when resolving the player's bullets. */
  get hitPadding(): number {
    return this.enabled ? AIM_ASSIST.hitTolerance : 0;
  }

  apply(player: Combatant, desiredAim: number, delta: number): AimAssistResult {
    if (!this.enabled) return { ...NO_ASSIST, aim: desiredAim };

    const target = this.findTarget(player, desiredAim);
    if (!target) return { ...NO_ASSIST, aim: desiredAim };

    const toTarget = angleBetween(player.x, player.y, target.x, target.y);
    const off = angleDelta(desiredAim, toTarget);
    const cone = degToRad(AIM_ASSIST.coneDeg);
    const absOff = Math.abs(off);
    if (absOff > cone) return { ...NO_ASSIST, aim: desiredAim };

    // Closer to lined up = more help, fading to nothing at the edge of the cone.
    const closeness = 1 - absOff / cone;
    const turnSpeedMult = 1 - AIM_ASSIST.sweepSlowdown * closeness;

    let aim = desiredAim;
    const dist = distance(player.x, player.y, target.x, target.y);
    if (dist < AIM_ASSIST.magnetRange) {
      // A hard per-second cap keeps this a nudge rather than a tracker.
      const maxNudge = degToRad(AIM_ASSIST.magnetDegPerSecond) * (delta / 1000);
      const falloff = 1 - dist / AIM_ASSIST.magnetRange;
      aim = desiredAim + clamp(off, -maxNudge * falloff, maxNudge * falloff);
    }

    return { aim, turnSpeedMult };
  }

  /** Nearest visible enemy inside the assist cone. */
  private findTarget(player: Combatant, aim: number): Combatant | null {
    const cone = degToRad(AIM_ASSIST.coneDeg);
    let best: Combatant | null = null;
    let bestOff = cone;

    for (const other of this.ctx.combatants) {
      if (other === player || !other.alive) continue;
      const dist = distance(player.x, player.y, other.x, other.y);
      if (dist > AIM_ASSIST.magnetRange * 1.6) continue;
      const off = Math.abs(angleDelta(aim, angleBetween(player.x, player.y, other.x, other.y)));
      if (off >= bestOff) continue;
      if (!this.ctx.collision.hasLineOfSight(player.x, player.y, other.x, other.y)) continue;
      bestOff = off;
      best = other;
    }
    return best;
  }
}
