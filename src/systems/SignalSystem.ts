import Phaser from 'phaser';
import { ABILITIES, SIGNAL } from '../config/SignalConfig';
import type { AbilityDef } from '../config/SignalConfig';
import { WORLD } from '../config/GameConfig';
import { fillAnnulus } from '../graphics/GraphicsUtils';
import { Depth, GameEvent, NoiseKind, SignalAbility } from '../utils/Constants';
import type { Vec2 } from '../utils/Constants';
import { angleBetween, clamp, distance } from '../utils/MathUtils';
import type { Combatant } from '../entities/Combatant';
import { SignalCore } from '../entities/SignalCore';
import type { BotAISystem } from './BotAISystem';
import type { MatchContext } from './MatchContext';

export interface SignalPing {
  x: number;
  y: number;
  radius: number;
  /** Scene time the reveal expires. */
  until: number;
}

export interface FinalSignalState {
  active: boolean;
  point: Vec2 | null;
  radius: number;
  progressMs: number;
  totalMs: number;
  owner: Combatant | null;
  contested: boolean;
}

/**
 * The Signal Core: the match's second objective and the game's identity.
 *
 * One core, one ability per match, and a periodic broadcast of the holder's rough
 * position. That single loop is what turns a plain battle royale into "everyone knows
 * roughly where the powerful player is".
 */
export class SignalSystem {
  private ctx!: MatchContext;
  private ai!: BotAISystem;

  /** The ability this match hands out. Picked once, so the match has a clear identity. */
  ability: AbilityDef = ABILITIES[SignalAbility.Dash];

  core: SignalCore | null = null;
  holder: Combatant | null = null;
  corePosition: Vec2 | null = null;

  ping: SignalPing | null = null;
  /** Enemy reveal from a Drone Scan or a Radar Pulse. */
  reveal: { until: number; ids: Set<number> } | null = null;

  readonly final: FinalSignalState = {
    active: false,
    point: null,
    radius: SIGNAL.finalRadius,
    progressMs: 0,
    totalMs: SIGNAL.finalCaptureMs,
    owner: null,
    contested: false,
  };

  private spawnAtMs = 0;
  private spawned = false;
  private nextPingAt = 0;
  private readonly cooldowns = new Map<number, number>();
  private graphics!: Phaser.GameObjects.Graphics;
  private finished = false;

  bind(ctx: MatchContext, ai: BotAISystem): void {
    this.ctx = ctx;
    this.ai = ai;
    // Above building floors so the capture ring is never hidden indoors, but below
    // props and characters.
    this.graphics = ctx.scene.add.graphics().setDepth(Depth.LowObstacle - 1);
  }

  /** Takes the match's ability from the director and picks when the core drops. */
  start(ability: SignalAbility): void {
    const rng = this.ctx.rng;
    this.ability = ABILITIES[ability];
    this.spawnAtMs = rng.range(SIGNAL.spawnWindowMs[0], SIGNAL.spawnWindowMs[1]);
    this.spawned = false;
    this.finished = false;
  }

  get abilityReadyRatio(): number {
    const player = this.ctx.player;
    if (!player) return 1;
    return this.cooldownRatio(player);
  }

  cooldownRatio(c: Combatant): number {
    const until = this.cooldowns.get(c.combatantId) ?? 0;
    if (this.ctx.now >= until) return 1;
    return clamp(1 - (until - this.ctx.now) / this.ability.cooldownMs, 0, 1);
  }

  // ------------------------------------------------------------------ frame

  update(delta: number): void {
    if (!this.ctx.running) return;

    if (!this.spawned && this.ctx.matchTimeMs >= this.spawnAtMs) this.spawnCore();
    if (this.core) {
      this.core.animate(this.ctx.now);
      this.checkPickup();
    }
    this.updatePings();
    this.updateFinalSignal(delta);
    this.draw();
  }

  // ------------------------------------------------------------------ core lifecycle

  private spawnCore(): void {
    this.spawned = true;
    const point = this.pickSpawnPoint();
    this.placeCore(point.x, point.y, false);
    this.ctx.events.emit(GameEvent.SignalSpawned, point);
    this.ctx.events.emit(GameEvent.Announce, {
      text: 'SIGNAL DETECTED',
      sub: 'Grab it for a power',
      color: 0x2ee6ff,
      durationMs: 2600,
    });
    this.ctx.audio.play('signal');
  }

  /** Somewhere walkable, out in the open, comfortably inside the current circle. */
  private pickSpawnPoint(): Vec2 {
    const rng = this.ctx.rng;
    const zone = this.ctx.zone;
    for (let i = 0; i < 60; i++) {
      const p = rng.pointInCircle(zone.center.x, zone.center.y, Math.max(200, zone.radius * 0.62));
      if (p.x < 200 || p.x > WORLD.width - 200 || p.y < 200 || p.y > WORLD.height - 200) continue;
      if (!this.ctx.map.navGrid.isWalkable(p.x, p.y)) continue;
      if (this.ctx.collision.isPointBlocked(p.x, p.y, 40)) continue;
      return p;
    }
    return { x: zone.center.x, y: zone.center.y };
  }

  private placeCore(x: number, y: number, dropped: boolean): void {
    this.core?.destroy();
    this.core = new SignalCore(this.ctx.scene, x, y);
    if (dropped) this.core.playDropAnimation();
    this.corePosition = { x, y };
  }

  private checkPickup(): void {
    const pos = this.corePosition;
    if (!pos) return;
    for (const c of this.ctx.combatants) {
      if (!c.alive) continue;
      if (distance(c.x, c.y, pos.x, pos.y) > SIGNAL.pickupRadius) continue;
      this.giveTo(c);
      return;
    }
  }

  private giveTo(c: Combatant): void {
    this.core?.destroy();
    this.core = null;
    this.corePosition = null;
    this.holder = c;
    c.setSignalHolder(true);
    // The first ping is a full interval away, so pickup is not instantly punished.
    this.nextPingAt = this.ctx.now + SIGNAL.pingIntervalMs;
    this.cooldowns.set(c.combatantId, 0);

    this.ctx.effects.lootPickup(c.x, c.y, 0x2ee6ff);
    this.ctx.audio.play('signalTake', c.x, c.y);
    this.ctx.events.emit(GameEvent.SignalTaken, c);

    if (c.isPlayer) {
      this.ctx.events.emit(GameEvent.AbilityChanged, this.ability);
      this.ctx.events.emit(GameEvent.Announce, {
        text: this.ability.name,
        sub: this.ctx.isTouch ? 'TAP SIGNAL — ACTIVATE' : 'SPACE — ACTIVATE',
        color: this.ability.color,
        durationMs: 2200,
      });
    } else {
      this.ctx.events.emit(GameEvent.Announce, {
        text: 'SIGNAL TAKEN',
        sub: `${c.combatantName} has the Signal`,
        color: 0x2ee6ff,
        durationMs: 1800,
      });
    }
  }

  /** Called by the match when anyone dies. */
  onDeath(c: Combatant): void {
    if (this.holder !== c) return;
    this.holder.setSignalHolder(false);
    this.holder = null;
    this.ping = null;
    this.placeCore(c.x, c.y, true);
    this.ctx.events.emit(GameEvent.SignalDropped, this.corePosition);
    this.ctx.events.emit(GameEvent.Announce, {
      text: 'SIGNAL DROPPED',
      sub: 'Up for grabs',
      color: 0x2ee6ff,
      durationMs: 1800,
    });
  }

  // ------------------------------------------------------------------ detection

  private updatePings(): void {
    if (this.ping && this.ctx.now > this.ping.until) this.ping = null;
    if (this.reveal && this.ctx.now > this.reveal.until) this.reveal = null;

    const holder = this.holder;
    if (!holder || !holder.alive) return;
    if (this.ctx.now < this.nextPingAt) return;
    this.nextPingAt = this.ctx.now + SIGNAL.pingIntervalMs;

    // Approximate, never exact: the broadcast point is jittered inside a wide circle.
    const rng = this.ctx.rng;
    const jitter = rng.pointInCircle(holder.x, holder.y, SIGNAL.pingJitter);
    this.ping = {
      x: jitter.x,
      y: jitter.y,
      radius: SIGNAL.pingRadius,
      until: this.ctx.now + SIGNAL.pingRevealMs,
    };
    this.ctx.events.emit(GameEvent.SignalPing, this.ping);
    this.ctx.events.emit(GameEvent.Announce, {
      text: 'SIGNAL HOLDER DETECTED',
      sub: holder.isPlayer ? 'They know roughly where you are' : undefined,
      color: 0xffb648,
      durationMs: 1900,
    });
    this.ctx.audio.play('ping');

    // Nearby bots converge on the broadcast area.
    for (const bot of this.ctx.bots) {
      if (!bot.alive || bot === holder) continue;
      if (distance(bot.x, bot.y, holder.x, holder.y) > SIGNAL.botHuntRadius) continue;
      this.ai.alertToSignal(bot, this.ping.x, this.ping.y);
    }
  }

  /** Enemy ids currently revealed on the minimap by a scan or radar pulse. */
  revealedIds(): ReadonlySet<number> | null {
    if (!this.reveal || this.ctx.now > this.reveal.until) return null;
    return this.reveal.ids;
  }

  /** Used by the Radar Pulse event and the Drone Scan ability. */
  revealCombatants(ids: Iterable<number>, durationMs: number): void {
    this.reveal = { until: this.ctx.now + durationMs, ids: new Set(ids) };
  }

  // ------------------------------------------------------------------ abilities

  hasAbility(c: Combatant): boolean {
    return this.holder === c;
  }

  /** Returns true when the ability actually fired. */
  useAbility(c: Combatant): boolean {
    if (this.holder !== c || !c.alive) return false;
    const until = this.cooldowns.get(c.combatantId) ?? 0;
    if (this.ctx.now < until) return false;
    this.cooldowns.set(c.combatantId, this.ctx.now + this.ability.cooldownMs);

    const def = this.ability;
    switch (def.id) {
      case SignalAbility.Dash:
        c.startDash(c.rotation, def.power * (1000 / def.durationMs) * 0.22, def.durationMs);
        this.ctx.effects.dashTrail(c.x, c.y, c.rotation, def.color);
        break;
      case SignalAbility.ShieldPulse:
        c.grantShield(def.power, def.durationMs);
        this.ctx.effects.abilityBurst(c.x, c.y, def.color);
        break;
      case SignalAbility.SpeedBoost:
        c.grantSpeed(def.power, def.durationMs);
        this.ctx.effects.abilityBurst(c.x, c.y, def.color);
        break;
      case SignalAbility.DroneScan: {
        const ids: number[] = [];
        for (const other of this.ctx.combatants) {
          if (other === c || !other.alive) continue;
          if (distance(c.x, c.y, other.x, other.y) <= def.power) ids.push(other.combatantId);
        }
        this.revealCombatants(ids, def.durationMs);
        this.ctx.effects.scanPulse(c.x, c.y, def.power, def.color);
        break;
      }
      case SignalAbility.Teleport: {
        const target = this.blinkTarget(c, def.power);
        this.ctx.effects.abilityBurst(c.x, c.y, def.color);
        c.setPosition(target.x, target.y);
        c.arcadeBody.reset(target.x, target.y);
        this.ctx.effects.abilityBurst(target.x, target.y, def.color);
        break;
      }
      default:
        break;
    }

    this.ctx.audio.play('ability', c.x, c.y);
    this.ctx.noise.emitKind(c.x, c.y, NoiseKind.Reload, c, 1.4);
    this.ctx.events.emit(GameEvent.AbilityUsed, c, def);
    return true;
  }

  /** Blink stops short of the first wall so it can never drop anyone inside geometry. */
  private blinkTarget(c: Combatant, maxDistance: number): Vec2 {
    const dx = Math.cos(c.rotation);
    const dy = Math.sin(c.rotation);
    const hit = this.ctx.collision.raycastStatic(
      c.x,
      c.y,
      c.x + dx * maxDistance,
      c.y + dy * maxDistance,
      false,
    );
    const travel = hit ? Math.max(0, maxDistance * hit.hit.t - c.radius - 6) : maxDistance;
    let x = c.x + dx * travel;
    let y = c.y + dy * travel;
    if (!this.ctx.map.navGrid.isWalkable(x, y)) {
      const safe = this.ctx.map.navGrid.nearestWalkable(x, y, 5);
      if (safe) {
        x = safe.x;
        y = safe.y;
      }
    }
    return { x, y };
  }

  // ------------------------------------------------------------------ final signal

  private updateFinalSignal(delta: number): void {
    if (this.finished) return;
    if (!this.final.active) {
      if (this.ctx.aliveCount > SIGNAL.finalSurvivors) return;
      this.activateFinal();
      return;
    }
    const point = this.final.point;
    if (!point) return;

    // Keep the objective inside the circle as it closes.
    const zone = this.ctx.zone;
    if (distance(point.x, point.y, zone.center.x, zone.center.y) > Math.max(40, zone.radius - 60)) {
      point.x = zone.center.x;
      point.y = zone.center.y;
    }

    const inside: Combatant[] = [];
    for (const c of this.ctx.combatants) {
      if (!c.alive) continue;
      if (distance(c.x, c.y, point.x, point.y) <= this.final.radius) inside.push(c);
    }

    this.final.contested = inside.length > 1;
    if (inside.length === 1) {
      const owner = inside[0] as Combatant;
      if (this.final.owner !== owner) {
        this.final.owner = owner;
        this.final.progressMs = Math.max(0, this.final.progressMs * 0.5);
      }
      this.final.progressMs += delta;
    } else if (!this.final.contested) {
      this.final.progressMs = Math.max(
        0,
        this.final.progressMs - delta * SIGNAL.finalDecayPerSecond,
      );
      if (this.final.progressMs <= 0) this.final.owner = null;
    }

    this.ctx.events.emit(GameEvent.FinalSignalProgress, {
      progressMs: this.final.progressMs,
      totalMs: this.final.totalMs,
      owner: this.final.owner,
      contested: this.final.contested,
    });

    if (this.final.progressMs >= this.final.totalMs && this.final.owner) {
      this.finished = true;
      this.ctx.finishByCapture(this.final.owner);
    }
  }

  private activateFinal(): void {
    const zone = this.ctx.zone;
    this.final.active = true;
    this.final.point = { x: zone.center.x, y: zone.center.y };
    this.final.progressMs = 0;
    this.final.owner = null;
    this.ctx.events.emit(GameEvent.FinalSignalStarted, this.final.point);
    this.ctx.events.emit(GameEvent.Announce, {
      text: 'FINAL SIGNAL',
      sub: 'Hold the circle for 20s to win',
      color: 0x2ee6ff,
      durationMs: 3000,
    });
    this.ctx.audio.play('signal');
  }

  // ------------------------------------------------------------------ render

  private draw(): void {
    const g = this.graphics;
    g.clear();

    if (this.final.active && this.final.point) {
      const p = this.final.point;
      const ratio = clamp(this.final.progressMs / this.final.totalMs, 0, 1);
      const pulse = 0.6 + Math.sin(this.ctx.now * 0.005) * 0.2;

      g.fillStyle(0x2ee6ff, 0.1 + ratio * 0.14);
      g.fillCircle(p.x, p.y, this.final.radius);
      fillAnnulus(g, p.x, p.y, this.final.radius - 6, this.final.radius, 0x2ee6ff, pulse, 48);

      // Capture progress reads as a filling arc around the objective.
      if (ratio > 0) {
        g.lineStyle(9, this.final.contested ? 0xffb648 : 0x9df5ff, 0.95);
        g.beginPath();
        g.arc(
          p.x,
          p.y,
          this.final.radius + 12,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * ratio,
          false,
        );
        g.strokePath();
      }
    }

    // A pointer toward the core so nobody loses it in the trees.
    const player = this.ctx.player;
    if (this.corePosition && player && player.alive) {
      const d = distance(player.x, player.y, this.corePosition.x, this.corePosition.y);
      if (d > 420) {
        const a = angleBetween(player.x, player.y, this.corePosition.x, this.corePosition.y);
        const r = 120;
        g.fillStyle(0x2ee6ff, 0.5);
        g.fillCircle(player.x + Math.cos(a) * r, player.y + Math.sin(a) * r, 6);
      }
    }
  }

  reset(): void {
    this.core?.destroy();
    this.core = null;
    this.graphics?.clear();
    this.cooldowns.clear();
  }
}
