import { GameEvent } from '../utils/Constants';
import type { MatchContext } from './MatchContext';

export interface HintPayload {
  key: string;
  text: string;
  durationMs: number;
}

interface HintRule {
  key: string;
  /** Desktop text. */
  text: string;
  /** Touch text; falls back to the desktop wording. */
  touchText?: string;
  durationMs: number;
  /** Only shown while the player is new at this. */
  basicsOnly?: boolean;
  when: (ctx: MatchContext) => boolean;
}

/** Basic movement/aim prompts stop appearing once the player clearly knows them. */
const BASICS_MATCH_LIMIT = 3;

/**
 * Contextual teaching.
 *
 * There is no tutorial screen and nothing ever pauses: a single line appears when a
 * mechanic first becomes relevant, then never again that match. Rules are evaluated in
 * order, and only the first matching un-shown rule fires.
 */
export class TutorialSystem {
  private ctx!: MatchContext;
  private readonly shown = new Set<string>();
  private nextCheckAt = 0;
  private lastHintAt = -9999;

  private readonly rules: HintRule[] = [
    {
      key: 'move',
      text: 'WASD — MOVE     MOUSE — AIM',
      touchText: 'DRAG LEFT SIDE TO MOVE',
      durationMs: 4200,
      basicsOnly: true,
      when: (ctx) => ctx.matchTimeMs > 300,
    },
    {
      key: 'fire',
      text: 'LEFT CLICK — FIRE',
      touchText: 'TAP AN ENEMY TO SHOOT HIM',
      durationMs: 3200,
      basicsOnly: true,
      when: (ctx) => ctx.player.inventory.hasGun,
    },
    {
      key: 'reload',
      text: 'R — RELOAD',
      touchText: 'TAP R TO RELOAD',
      durationMs: 2600,
      when: (ctx) => {
        const w = ctx.player.weapon;
        return w.usesAmmo && w.ammoInMag === 0 && ctx.player.inventory.reserveFor(w) > 0;
      },
    },
    {
      key: 'heal',
      text: 'Q — HEAL',
      touchText: 'HEAL BUTTON TO PATCH UP',
      durationMs: 2600,
      when: (ctx) => {
        const inv = ctx.player.inventory;
        return ctx.player.health < 70 && inv.bandages + inv.medkits > 0;
      },
    },
    {
      key: 'zone-outside',
      text: 'RETURN TO THE SAFE ZONE',
      durationMs: 2600,
      when: (ctx) => ctx.player.alive && !ctx.zone.isInside(ctx.player.x, ctx.player.y),
    },
    {
      key: 'zone-warning',
      text: 'GET INSIDE THE SAFE ZONE',
      durationMs: 2800,
      when: (ctx) => ctx.zone.state === 'shrinking',
    },
    {
      key: 'signal-ability',
      text: 'SPACE — USE SIGNAL ABILITY',
      touchText: 'TAP SIGNAL TO USE IT',
      durationMs: 3000,
      when: (ctx) => ctx.signal.hasAbility(ctx.player),
    },
    {
      key: 'signal-risk',
      text: 'HOLDING THE SIGNAL REVEALS YOU',
      durationMs: 3000,
      when: (ctx) => ctx.signal.hasAbility(ctx.player) && ctx.matchTimeMs > 0,
    },
  ];

  bind(ctx: MatchContext, matchesPlayed: number): void {
    this.ctx = ctx;
    this.shown.clear();
    // Veterans skip the movement basics entirely.
    if (matchesPlayed >= BASICS_MATCH_LIMIT) {
      for (const rule of this.rules) if (rule.basicsOnly) this.shown.add(rule.key);
    }
  }

  update(): void {
    if (!this.ctx.running) return;
    const now = this.ctx.now;
    if (now < this.nextCheckAt) return;
    this.nextCheckAt = now + 220;
    // One lesson at a time, with breathing room between them.
    if (now - this.lastHintAt < 2600) return;

    const player = this.ctx.player;
    if (!player || !player.alive) return;

    for (const rule of this.rules) {
      if (this.shown.has(rule.key)) continue;
      if (!rule.when(this.ctx)) continue;
      this.shown.add(rule.key);
      this.lastHintAt = now;
      const text = this.ctx.isTouch ? (rule.touchText ?? rule.text) : rule.text;
      const payload: HintPayload = { key: rule.key, text, durationMs: rule.durationMs };
      this.ctx.events.emit(GameEvent.Hint, payload);
      return;
    }
  }
}
