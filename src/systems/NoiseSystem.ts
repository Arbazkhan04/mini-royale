import { GameEvent, NoiseKind } from '../utils/Constants';
import { angleBetween, distance } from '../utils/MathUtils';
import type { Bot } from '../entities/Bot';
import type { Combatant } from '../entities/Combatant';
import type { BotAISystem } from './BotAISystem';
import type { MatchContext } from './MatchContext';

/** Radii for the noises that are not weapon fire. Gunshots use the weapon's own value. */
export const NOISE_RADIUS: Record<NoiseKind, number> = {
  [NoiseKind.Walk]: 110,
  [NoiseKind.Run]: 210,
  [NoiseKind.Reload]: 280,
  [NoiseKind.Door]: 440,
  [NoiseKind.Gunshot]: 700,
};

/** Only these are worth an on-screen cue; footsteps would just be noise on the HUD. */
const PLAYER_CUE_KINDS = new Set<NoiseKind>([NoiseKind.Gunshot, NoiseKind.Door, NoiseKind.Reload]);

export interface NoiseCue {
  /** Direction from the player to the sound, in radians. */
  angle: number;
  /** 0..1, how close/loud it was. */
  strength: number;
  kind: NoiseKind;
}

const MOVEMENT_SAMPLE_MS = 380;

/**
 * Sound awareness.
 *
 * Noise never hands out exact positions. Bots get a fuzzy point to investigate, and the
 * player gets a single directional arrow for the loudest thing they can currently hear.
 */
export class NoiseSystem {
  private ctx!: MatchContext;
  private ai!: BotAISystem;
  private bots: readonly Bot[] = [];

  /** Strongest cue collected this frame; flushed once per update. */
  private pendingCue: NoiseCue | null = null;
  private lastCueAt = -9999;
  private movementTimer = 0;

  bind(ctx: MatchContext, ai: BotAISystem, bots: readonly Bot[]): void {
    this.ctx = ctx;
    this.ai = ai;
    this.bots = bots;
  }

  /**
   * Reports a noise at a world position. `radius` is how far it carries; listeners closer
   * than that may react, with certainty falling off toward the edge.
   */
  emit(x: number, y: number, radius: number, kind: NoiseKind, source: Combatant | null): void {
    if (radius <= 0) return;

    for (const bot of this.bots) {
      if (!bot.alive || bot === source) continue;
      const d = distance(bot.x, bot.y, x, y);
      if (d > radius) continue;
      // Louder and closer sounds are more likely to actually be acted on.
      const strength = 1 - d / radius;
      this.ai.hearNoise(bot, x, y, strength, kind);
    }

    const player = this.ctx.player;
    if (!player || !player.alive || source === player) return;
    if (!PLAYER_CUE_KINDS.has(kind)) return;
    const d = distance(player.x, player.y, x, y);
    if (d > radius) return;
    const strength = 1 - d / radius;
    if (!this.pendingCue || strength > this.pendingCue.strength) {
      this.pendingCue = { angle: angleBetween(player.x, player.y, x, y), strength, kind };
    }
  }

  /** Convenience for the common case. */
  emitKind(x: number, y: number, kind: NoiseKind, source: Combatant | null, scale = 1): void {
    this.emit(x, y, NOISE_RADIUS[kind] * scale, kind, source);
  }

  update(delta: number): void {
    this.sampleMovement(delta);

    if (this.pendingCue) {
      // One cue at a time, and never more than a few per second.
      if (this.ctx.now - this.lastCueAt > 260) {
        this.lastCueAt = this.ctx.now;
        this.ctx.events.emit(GameEvent.NoiseHeard, this.pendingCue);
      }
      this.pendingCue = null;
    }
  }

  /** Footsteps are sampled on a timer rather than emitted per frame. */
  private sampleMovement(delta: number): void {
    this.movementTimer += delta;
    if (this.movementTimer < MOVEMENT_SAMPLE_MS) return;
    this.movementTimer = 0;

    for (const c of this.ctx.combatants) {
      if (!c.alive) continue;
      const speed = Math.hypot(c.arcadeBody.velocity.x, c.arcadeBody.velocity.y);
      if (speed < 30) continue;
      const kind = speed > 150 ? NoiseKind.Run : NoiseKind.Walk;
      this.emitKind(c.x, c.y, kind, c);
    }
  }
}
