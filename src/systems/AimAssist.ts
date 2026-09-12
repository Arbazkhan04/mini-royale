import { AIM_ASSIST } from '../config/GameConfig';
import { angleBetween, angleDelta, clamp, degToRad, distance } from '../utils/MathUtils';
import type { Combatant } from '../entities/Combatant';
import type { MatchContext } from './MatchContext';

export interface AimAssistResult {
  /** Aim angle after assistance. */
  aim: number;
  /** Multiplier applied to the player's turn speed this frame. */
  turnSpeedMult: number;
  /** Who the assist is currently helping with, so the UI can mark them. */
  target: Combatant | null;
}

/**
 * Aim help for touch input.
 *
 * Aiming a twin-stick shooter with a thumb is materially harder than with a mouse: the
 * stick is small, your hand covers the screen, and enemies arrive from outside a phone's
 * narrow view. So touch gets real assistance, in three escalating steps:
 *
 *  1. **Sweeping.** Crossing an enemy slows the aim sweep so a thumb can settle on them.
 *  2. **Nearly lined up.** Inside `strongConeDeg` the aim is pulled hard toward the enemy,
 *     fading to nothing by `mildConeDeg`. Everything is a capped rate per second, so the
 *     player is always turning faster than the assist and can always override it.
 *  3. **Holding FIRE.** The search cone widens to `fireConeDeg` and the gun is swung onto
 *     the target outright. This is the one place the assist genuinely aims for you, and it
 *     is deliberate: pointing the stick in an enemy's general direction and pulling the
 *     trigger should hit, because that is as precise as a thumb usefully gets.
 *
 * A soft lock holds the chosen target for `softLockMs` so the aim cannot flicker between
 * two enemies, and swinging `softLockBreakDeg` away drops it at once - the player always
 * wins a disagreement. Every target needs line of sight, so the assist can never pull onto
 * someone through a wall, and per-weapon `aimAssist` scales the whole thing: a shotgun is
 * forgiving, a sniper is very nearly raw.
 */
export class AimAssist {
  private ctx!: MatchContext;
  enabled = false;
  private locked: Combatant | null = null;
  private lockedUntil = 0;

  bind(ctx: MatchContext): void {
    this.ctx = ctx;
    this.enabled = ctx.isTouch ? AIM_ASSIST.enabledOnTouch : AIM_ASSIST.enabledOnDesktop;
    this.locked = null;
    this.lockedUntil = 0;
  }

  /** Extra radius added to enemies when resolving the player's bullets. */
  get hitPadding(): number {
    return this.enabled ? AIM_ASSIST.hitTolerance : 0;
  }

  /**
   * Fire-hold cone for a weapon strength, hard-capped: a shotgun should be forgiving in a
   * doorway scramble, but no weapon may swing onto someone standing behind you.
   */
  private static fireCone(strength: number): number {
    return Math.min(
      degToRad(AIM_ASSIST.fireConeMaxDeg),
      degToRad(AIM_ASSIST.fireConeDeg) * strength,
    );
  }

  /** The current soft-locked enemy, for the on-screen marker. */
  get target(): Combatant | null {
    return this.locked;
  }

  apply(player: Combatant, desiredAim: number, delta: number, firing: boolean): AimAssistResult {
    const none: AimAssistResult = { aim: desiredAim, turnSpeedMult: 1, target: null };
    if (!this.enabled || !player.alive) {
      this.clear();
      return none;
    }

    const weapon = player.weapon.base;
    const strength = weapon.aimAssist;
    if (strength <= 0) {
      this.clear();
      return none;
    }

    const range = Math.min(AIM_ASSIST.maxRange, weapon.range);
    const target = this.resolveTarget(player, desiredAim, firing, range, strength);
    if (!target) return none;

    const toTarget = angleBetween(player.x, player.y, target.x, target.y);
    const off = angleDelta(desiredAim, toTarget);
    const absOff = Math.abs(off);

    // Holding FIRE: swing onto the target rather than nudging toward it.
    if (firing && absOff <= AimAssist.fireCone(strength)) {
      return { aim: toTarget, turnSpeedMult: AIM_ASSIST.fireTurnSpeedMult, target };
    }

    const strongCone = degToRad(AIM_ASSIST.strongConeDeg) * strength;
    const mildCone = degToRad(AIM_ASSIST.mildConeDeg) * strength;
    if (absOff > mildCone) return none;

    // Full rate inside the strong cone, tapering to the mild rate at the outer edge.
    let pullDeg = AIM_ASSIST.strongPullDegPerSecond;
    if (absOff > strongCone) {
      const t = (absOff - strongCone) / Math.max(1e-4, mildCone - strongCone);
      pullDeg += (AIM_ASSIST.mildPullDegPerSecond - AIM_ASSIST.strongPullDegPerSecond) * t;
    }

    const maxStep = degToRad(pullDeg * strength) * (delta / 1000);
    const aim = desiredAim + clamp(off, -maxStep, maxStep);
    const closeness = 1 - absOff / mildCone;
    return { aim, turnSpeedMult: 1 - AIM_ASSIST.sweepSlowdown * closeness, target };
  }

  /**
   * Best enemy for the current aim, or the one held from a moment ago.
   *
   * Ranking is angle first with distance only as a tie-break, which gives the priority
   * order that reads correctly to a player: someone under the crosshair beats someone
   * beside it, and someone beside it beats someone merely close.
   */
  private resolveTarget(
    player: Combatant,
    aim: number,
    firing: boolean,
    range: number,
    strength: number,
  ): Combatant | null {
    // The search cone has to scale with the weapon too. Scaling only the pull would let a
    // forgiving weapon widen its assist in theory while never finding anything to aim at.
    const cone = firing
      ? AimAssist.fireCone(strength)
      : degToRad(AIM_ASSIST.mildConeDeg) * strength;
    let best: Combatant | null = null;
    let bestScore = Infinity;

    for (const other of this.ctx.combatants) {
      if (other === player || !other.alive) continue;
      const dist = distance(player.x, player.y, other.x, other.y);
      if (dist > range) continue;
      const off = Math.abs(angleDelta(aim, angleBetween(player.x, player.y, other.x, other.y)));
      if (off > cone) continue;
      // Angle dominates; distance only separates two enemies at a similar angle.
      const score = off + (dist / range) * 0.14;
      if (score >= bestScore) continue;
      if (!this.ctx.collision.hasLineOfSight(player.x, player.y, other.x, other.y)) continue;
      bestScore = score;
      best = other;
    }

    if (best) {
      this.locked = best;
      this.lockedUntil = this.ctx.now + AIM_ASSIST.softLockMs;
      return best;
    }

    // Nothing in the cone this frame. Hold the previous target briefly so an enemy who
    // strafes out of the cone for a moment does not make the assist stutter.
    const held = this.locked;
    if (held && this.ctx.now < this.lockedUntil && this.isViable(player, held, range)) {
      const off = Math.abs(angleDelta(aim, angleBetween(player.x, player.y, held.x, held.y)));
      if (off <= degToRad(AIM_ASSIST.softLockBreakDeg)) return held;
    }

    this.clear();
    return null;
  }

  private isViable(player: Combatant, target: Combatant, range: number): boolean {
    if (!target.alive) return false;
    if (distance(player.x, player.y, target.x, target.y) > range) return false;
    return this.ctx.collision.hasLineOfSight(player.x, player.y, target.x, target.y);
  }

  private clear(): void {
    this.locked = null;
    this.lockedUntil = 0;
  }
}
