import Phaser from 'phaser';
import { EVENT_WEIGHTS, FOG, MATCH_EVENTS, RADAR, SUPPLY, ZONE_VARIANTS } from '../config/EventConfig';
import type { LootProfile } from '../config/LootConfig';
import { ABILITY_POOL } from '../config/SignalConfig';
import { WORLD } from '../config/GameConfig';
import { TEX_SCALE } from '../graphics/TextureFactory';
import {
  AmmoType,
  ArmorLevel,
  Depth,
  GameEvent,
  LootType,
  MatchEventKind,
  Rarity,
  SignalAbility,
  Tex,
  ZonePattern,
} from '../utils/Constants';
import type { Vec2 } from '../utils/Constants';
import type { Rng } from '../utils/RandomUtils';
import { Weapon } from '../entities/Weapon';
import type { MatchContext } from './MatchContext';

export interface MatchVariant {
  weather: 'clear' | 'fog';
  zonePattern: ZonePattern;
  specialEvents: MatchEventKind[];
  signalAbility: SignalAbility;
  lootProfile: LootProfile;
}

export interface RadarBlip {
  x: number;
  y: number;
  until: number;
}

export interface SupplySite {
  x: number;
  y: number;
  until: number;
  landed: boolean;
  landsAt: number;
}

/**
 * Chooses what kind of match this is, then runs at most two short world events.
 *
 * Everything here is controlled randomness: one event at a time, never in the opening,
 * always announced in four words or fewer, so the player can always tell what changed.
 */
export class MatchDirector {
  private ctx!: MatchContext;
  variant: MatchVariant = {
    weather: 'clear',
    zonePattern: ZonePattern.Standard,
    specialEvents: [],
    signalAbility: SignalAbility.Dash,
    lootProfile: 'balanced',
  };

  /** Non-null while fog is up. */
  private fogUntil = 0;
  private fogOverlay: Phaser.GameObjects.Rectangle | null = null;

  radarBlips: RadarBlip[] = [];
  supplySites: SupplySite[] = [];

  private queued: Array<{ kind: MatchEventKind; atMs: number }> = [];
  private firedCount = 0;
  private crates: Phaser.GameObjects.Image[] = [];

  bind(ctx: MatchContext): void {
    this.ctx = ctx;
  }

  /**
   * Rolls the match variant. `matchesPlayed` gates the more exotic options so a new
   * player's first games teach the basic rules without surprises.
   */
  roll(rng: Rng, matchesPlayed: number): MatchVariant {
    const veteran = matchesPlayed >= ZONE_VARIANTS.unlockAfterMatches;
    const zonePattern = veteran
      ? rng.weighted(ZONE_VARIANTS.weights)
      : ZonePattern.Standard;

    const events: MatchEventKind[] = [];
    if (veteran || matchesPlayed >= 1) {
      for (let slot = 0; slot < MATCH_EVENTS.maxPerMatch; slot++) {
        if (!rng.bool(MATCH_EVENTS.triggerChance)) continue;
        const kind = rng.weighted(EVENT_WEIGHTS);
        // Fog twice in one match would be miserable; everything else can repeat.
        if (kind === MatchEventKind.Fog && events.includes(MatchEventKind.Fog)) continue;
        events.push(kind);
      }
    }

    const lootProfile: LootProfile = rng.weighted([
      { value: 'balanced' as LootProfile, weight: 60 },
      { value: 'weaponRich' as LootProfile, weight: 25 },
      { value: 'scarce' as LootProfile, weight: 15 },
    ]);

    this.variant = {
      weather: 'clear',
      zonePattern,
      specialEvents: events,
      signalAbility: rng.pick(ABILITY_POOL),
      lootProfile,
    };
    return this.variant;
  }

  /** Schedules the rolled events across the mid-game. */
  start(): void {
    this.queued = [];
    this.firedCount = 0;
    let at = MATCH_EVENTS.earliestMs;
    for (const kind of this.variant.specialEvents) {
      this.queued.push({ kind, atMs: at });
      at += MATCH_EVENTS.minGapMs + this.ctx.rng.range(0, 20000);
    }
  }

  /** Bot sight and the fog overlay both read this. */
  get visionMultiplier(): number {
    return this.ctx.now < this.fogUntil ? FOG.visionMult : 1;
  }

  get fogActive(): boolean {
    return this.ctx.now < this.fogUntil;
  }

  update(delta: number): void {
    void delta;
    if (!this.ctx.running) return;

    if (this.queued.length > 0 && this.firedCount < MATCH_EVENTS.maxPerMatch) {
      const next = this.queued[0];
      // Never overlap events - one thing happens at a time.
      if (next && this.ctx.matchTimeMs >= next.atMs && !this.fogActive) {
        this.queued.shift();
        this.firedCount++;
        this.fire(next.kind);
      }
    }

    if (this.fogOverlay && !this.fogActive) {
      this.ctx.events.emit(GameEvent.MatchEventEnded, MatchEventKind.Fog);
      this.fogOverlay.destroy();
      this.fogOverlay = null;
    }

    const now = this.ctx.now;
    this.radarBlips = this.radarBlips.filter((b) => b.until > now);

    for (const site of this.supplySites) {
      if (!site.landed && now >= site.landsAt) this.landSupply(site);
    }
    this.supplySites = this.supplySites.filter((s) => s.until > now || !s.landed);
  }

  private fire(kind: MatchEventKind): void {
    switch (kind) {
      case MatchEventKind.Fog:
        this.startFog();
        break;
      case MatchEventKind.RadarPulse:
        this.radarPulse();
        break;
      case MatchEventKind.SupplyDrop:
        this.supplyDrop();
        break;
      default:
        break;
    }
    this.ctx.events.emit(GameEvent.MatchEventStarted, kind);
  }

  // ------------------------------------------------------------------ fog

  private startFog(): void {
    const duration = this.ctx.rng.range(FOG.durationMs[0], FOG.durationMs[1]);
    this.fogUntil = this.ctx.now + duration;
    this.variant.weather = 'fog';

    // A flat wash over the world rather than real occlusion: cheap, and instantly
    // readable as "you cannot see as far right now".
    this.fogOverlay = this.ctx.scene.add
      .rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width * 3, WORLD.height * 3, FOG.color, 0)
      .setDepth(Depth.Roof + 2);
    this.ctx.scene.tweens.add({
      targets: this.fogOverlay,
      fillAlpha: FOG.alpha,
      duration: 1800,
    });

    this.ctx.events.emit(GameEvent.Announce, {
      text: FOG.announcement,
      sub: 'Sightlines are short',
      color: 0xc8d4e0,
      durationMs: 2600,
    });
    this.ctx.audio.play('zoneWarning');
  }

  // ------------------------------------------------------------------ radar

  private radarPulse(): void {
    const rng = this.ctx.rng;
    const until = this.ctx.now + RADAR.revealMs;
    this.radarBlips = [];
    for (const c of this.ctx.combatants) {
      if (!c.alive || c.isPlayer) continue;
      const p = rng.pointInCircle(c.x, c.y, RADAR.jitter);
      this.radarBlips.push({ x: p.x, y: p.y, until });
    }
    this.ctx.events.emit(GameEvent.Announce, {
      text: RADAR.announcement,
      sub: 'Everyone is on the map',
      color: 0x59d6ff,
      durationMs: 2400,
    });
    this.ctx.audio.play('ping');
  }

  // ------------------------------------------------------------------ supply

  private supplyDrop(): void {
    const zone = this.ctx.zone;
    const rng = this.ctx.rng;
    for (let i = 0; i < SUPPLY.crates; i++) {
      let point: Vec2 = { x: zone.center.x, y: zone.center.y };
      for (let attempt = 0; attempt < 40; attempt++) {
        const p = rng.pointInCircle(zone.center.x, zone.center.y, Math.max(160, zone.radius * 0.7));
        if (!this.ctx.map.navGrid.isWalkable(p.x, p.y)) continue;
        if (this.ctx.collision.isPointBlocked(p.x, p.y, 46)) continue;
        point = p;
        break;
      }
      this.supplySites.push({
        x: point.x,
        y: point.y,
        landsAt: this.ctx.now + SUPPLY.fallMs,
        until: this.ctx.now + SUPPLY.fallMs + SUPPLY.markerMs,
        landed: false,
      });
    }
    this.ctx.events.emit(GameEvent.Announce, {
      text: SUPPLY.announcement,
      sub: 'High-value crates',
      color: 0xf4d03f,
      durationMs: 2600,
    });
    this.ctx.audio.play('supply');
  }

  private landSupply(site: SupplySite): void {
    site.landed = true;
    const scene = this.ctx.scene;

    const crate = scene.add.image(site.x, site.y - 90, Tex.SupplyCrate);
    crate.setScale(TEX_SCALE * 1.1);
    crate.setDepth(Depth.LowObstacle + 1);
    crate.setAlpha(0.9);
    this.crates.push(crate);

    scene.tweens.add({
      targets: crate,
      y: site.y,
      alpha: 1,
      duration: 420,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.ctx.effects.splinterBurst(site.x, site.y, 0.8);
        this.ctx.audio.play('break', site.x, site.y);
        this.scatterSupplyLoot(site.x, site.y);
      },
    });

    this.ctx.events.emit(GameEvent.SupplyDropLanded, { x: site.x, y: site.y });
  }

  /** Rich loot around the crate: a good gun, armor and heals worth fighting over. */
  private scatterSupplyLoot(x: number, y: number): void {
    const rng = this.ctx.rng;
    const place = (index: number): Vec2 => {
      const a = (index / 5) * Math.PI * 2 + rng.range(0, 1);
      const r = rng.range(34, 62);
      return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
    };

    const gunSpot = place(0);
    const weaponId = rng.pick(['ar', 'sniper', 'lmg', 'shotgun'] as const);
    const rarity = rng.weighted([
      { value: Rarity.Rare, weight: 55 },
      { value: Rarity.Epic, weight: 45 },
    ]);
    this.ctx.loot
      .spawn(gunSpot.x, gunSpot.y, { kind: LootType.Weapon, weapon: new Weapon(weaponId, rarity) })
      .playDropAnimation();

    const armorSpot = place(1);
    this.ctx.loot
      .spawn(armorSpot.x, armorSpot.y, { kind: LootType.Armor, level: ArmorLevel.Three })
      .playDropAnimation();

    const medSpot = place(2);
    this.ctx.loot.spawn(medSpot.x, medSpot.y, { kind: LootType.Medkit, count: 2 }).playDropAnimation();

    const ammoSpot = place(3);
    this.ctx.loot
      .spawn(ammoSpot.x, ammoSpot.y, { kind: LootType.Ammo, ammo: AmmoType.Medium, amount: 60 })
      .playDropAnimation();
  }

  reset(): void {
    this.fogOverlay?.destroy();
    this.fogOverlay = null;
    for (const crate of this.crates) crate.destroy();
    this.crates = [];
    this.radarBlips = [];
    this.supplySites = [];
  }
}
