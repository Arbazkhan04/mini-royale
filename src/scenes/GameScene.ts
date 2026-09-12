import Phaser from 'phaser';
import { ONBOARDING } from '../config/EventConfig';
import { MATCH, VIEW, WORLD } from '../config/GameConfig';
import { MapGenerator } from '../map/MapGenerator';
import { MapRenderer } from '../map/MapRenderer';
import type { CoverObject } from '../map/CoverObject';
import type { MapData } from '../map/MapData';
import { AimAssist } from '../systems/AimAssist';
import { AudioSystem } from '../systems/AudioSystem';
import { BotAISystem } from '../systems/BotAISystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { InputSystem } from '../systems/InputSystem';
import { LootSystem } from '../systems/LootSystem';
import { MatchDirector } from '../systems/MatchDirector';
import type { MatchContext } from '../systems/MatchContext';
import { NoiseSystem } from '../systems/NoiseSystem';
import { ParticleSystem } from '../systems/ParticleSystem';
import { SceneCuller } from '../systems/SceneCuller';
import { SignalSystem } from '../systems/SignalSystem';
import { SpawnSystem } from '../systems/SpawnSystem';
import { TutorialSystem } from '../systems/TutorialSystem';
import { ZoneSystem } from '../systems/ZoneSystem';
import { Bot } from '../entities/Bot';
import type { Combatant } from '../entities/Combatant';
import type { Player } from '../entities/Player';
import { Weapon } from '../entities/Weapon';
import { DebugOverlay } from '../ui/DebugOverlay';
import type { KillEventPayload } from '../ui/KillFeed';
import { AmmoType, GameEvent, LootType, NoiseKind, Rarity, SceneKey } from '../utils/Constants';
import { clamp, distance } from '../utils/MathUtils';
import { Rng, randomSeed } from '../utils/RandomUtils';
import { Storage, accuracyPercent, computeScore } from '../utils/Storage';
import type { MatchResult } from '../utils/Storage';

export interface GameSceneData {
  seed?: number;
}

/**
 * Match orchestrator. It owns the systems and the frame order; all gameplay rules live
 * in the systems themselves so this file stays a thin, readable conductor.
 */
export class GameScene extends Phaser.Scene {
  private ctx!: MatchContext;
  private map!: MapData;
  private mapRenderer!: MapRenderer;
  private culler!: SceneCuller;

  private inputSystem!: InputSystem;
  private collision!: CollisionSystem;
  private combat!: CombatSystem;
  private loot!: LootSystem;
  private zone!: ZoneSystem;
  private effects!: ParticleSystem;
  private audio!: AudioSystem;
  private ai!: BotAISystem;
  private noise!: NoiseSystem;
  private aimAssist!: AimAssist;
  private signal!: SignalSystem;
  private director!: MatchDirector;
  private tutorial!: TutorialSystem;
  private debug!: DebugOverlay;

  private player!: Player;
  private bots: Bot[] = [];
  private combatants: Combatant[] = [];

  private seed = 0;
  private matchesPlayed = 0;
  private level = 1;
  /** Accumulated match time. Summing delta keeps this in step with the zone and event
   *  timers even if the tab is backgrounded and the wall clock races ahead. */
  private matchElapsedMs = 0;
  private countdownValue = MATCH.countdownSeconds;
  private finished = false;
  private paused = false;

  constructor() {
    super(SceneKey.Game);
  }

  create(data: GameSceneData): void {
    this.seed = data.seed ?? randomSeed();
    this.finished = false;
    this.paused = false;
    const save = Storage.load();
    this.matchesPlayed = save.matchesPlayed;
    this.level = save.level;

    this.audio = (this.registry.get('audio') as AudioSystem | undefined) ?? new AudioSystem();
    this.registry.set('audio', this.audio);
    this.audio.unlock();

    const buildStartedAt = performance.now();
    this.map = MapGenerator.generate(this.seed);

    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBackgroundColor('#1d2a1f');
    this.cameras.main.fadeIn(260, 8, 12, 18);

    this.culler = new SceneCuller();
    this.mapRenderer = new MapRenderer(this, this.map, this.culler);
    this.mapRenderer.build();

    this.collision = new CollisionSystem(this, this.map);
    this.combat = new CombatSystem(this);
    this.loot = new LootSystem(this);
    this.zone = new ZoneSystem(this);
    this.effects = new ParticleSystem(this);
    this.ai = new BotAISystem();
    this.noise = new NoiseSystem();
    this.aimAssist = new AimAssist();
    this.signal = new SignalSystem();
    this.director = new MatchDirector();
    this.tutorial = new TutorialSystem();
    this.inputSystem = new InputSystem(this);

    const events = new Phaser.Events.EventEmitter();
    const rng = new Rng(this.seed ^ 0x5f3759df);
    const scene = this;

    this.ctx = {
      scene: this,
      map: this.map,
      rng,
      events,
      collision: this.collision,
      combat: this.combat,
      loot: this.loot,
      zone: this.zone,
      effects: this.effects,
      audio: this.audio,
      noise: this.noise,
      aimAssist: this.aimAssist,
      signal: this.signal,
      director: this.director,
      combatants: this.combatants,
      bots: this.bots,
      get player(): Player {
        return scene.player;
      },
      isTouch: this.sys.game.device.input.touch,
      now: this.time.now,
      matchTimeMs: 0,
      aliveCount: MATCH.totalCombatants,
      running: false,
      reportKill: (victim, killer, cause) => this.onKill(victim, killer, cause),
      reportGunshot: (x, y, source, radius) => this.onGunshot(x, y, source, radius),
      damageCover: (cover, amount, hitX, hitY) => this.onCoverDamaged(cover, amount, hitX, hitY),
      finishByCapture: (winner) => this.onCaptureWin(winner),
    };

    this.combat.bind(this.ctx);
    this.loot.bind(this.ctx);
    this.zone.bind(this.ctx);
    this.ai.bind(this.ctx);
    this.signal.bind(this.ctx, this.ai);
    this.director.bind(this.ctx);
    this.tutorial.bind(this.ctx, this.matchesPlayed);
    this.aimAssist.bind(this.ctx);

    // The director decides what kind of match this is before anything is placed.
    const variant = this.director.roll(rng, this.matchesPlayed);
    const staticGroup = this.collision.buildPhysics();
    this.loot.spawnInitialLoot();
    this.zone.start(variant.zonePattern);
    this.signal.start(variant.signalAbility);
    this.director.start();

    const { player, bots } = SpawnSystem.populate(this.ctx, this.inputSystem, this.level);
    this.player = player;
    this.bots = bots;
    this.combatants.push(player, ...bots);
    this.ctx.bots.push(...bots);
    this.noise.bind(this.ctx, this.ai, this.bots);
    this.applyOnboarding();

    this.physics.add.collider(this.combatants, staticGroup);
    this.physics.add.collider(this.combatants, this.combatants);

    this.debug = new DebugOverlay(this, this.ctx, this.bots);
    if (new URLSearchParams(window.location.search).get('debug') === '1') {
      this.debug.setEnabled(true);
    }

    this.ctx.events.on(GameEvent.SupplyDropLanded, this.onSupplyLanded, this);

    this.setupCamera();
    // Scatter decoration trickles in during the countdown rather than blocking the click.
    this.mapRenderer.buildDecorations();
    this.scene.launch(SceneKey.UI, { ctx: this.ctx, input: this.inputSystem, level: this.level });
    this.startCountdown();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    if (this.debug.isEnabled) {
      // Match setup is the one place a frame hitch is visible, so keep it measurable.
      console.info(`[last-signal] match built in ${(performance.now() - buildStartedAt).toFixed(1)}ms`);
    }
  }

  // ------------------------------------------------------------------ setup

  /**
   * Onboarding through encounter design rather than tutorial text: for the first couple
   * of matches, nearby bots react slowly and a starter weapon is placed within sight.
   */
  private applyOnboarding(): void {
    if (this.matchesPlayed >= ONBOARDING.gentleMatches) return;

    for (const bot of this.bots) {
      if (distance(bot.x, bot.y, this.player.x, this.player.y) > ONBOARDING.gentleRadius) continue;
      bot.gentleUntil = this.time.now + 45000;
    }

    const rng = this.ctx.rng;
    for (let attempt = 0; attempt < 40; attempt++) {
      const angle = rng.range(0, Math.PI * 2);
      const dist = ONBOARDING.starterWeaponDistance * rng.range(0.6, 1.2);
      const x = this.player.x + Math.cos(angle) * dist;
      const y = this.player.y + Math.sin(angle) * dist;
      if (!this.map.navGrid.isWalkable(x, y)) continue;
      if (this.collision.isPointBlocked(x, y, 26)) continue;
      this.loot.spawn(x, y, {
        kind: LootType.Weapon,
        weapon: new Weapon(rng.pick(['pistol', 'smg'] as const), Rarity.Common),
      });
      this.loot.spawn(x + 34, y + 12, { kind: LootType.Ammo, ammo: AmmoType.Light, amount: 60 });
      break;
    }
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.startFollow(this.player, true, VIEW.followLerp, VIEW.followLerp);
    cam.setDeadzone(30, 24);
    this.applyZoom();
  }

  /**
   * Keeps the visible slice of the world roughly constant across screen sizes by
   * mapping the *smaller* screen dimension to a fixed world span. Scaling off the larger
   * dimension instead would zoom a portrait phone right into the player's boots.
   */
  private applyZoom(): void {
    const touch = this.sys.game.device.input.touch && this.scale.width < 1000;
    const span = touch ? VIEW.touchViewSpan : VIEW.desktopViewSpan;
    const shortest = Math.min(this.scale.width, this.scale.height);
    this.cameras.main.setZoom(clamp(shortest / span, VIEW.minZoom, VIEW.maxZoom));
  }

  private startCountdown(): void {
    this.countdownValue = MATCH.countdownSeconds;

    // No countdown: the player is in control from the first frame.
    if (this.countdownValue <= 0) {
      // The opening banner is raised by UIScene once it exists - scene.launch is
      // deferred, so anything emitted here would be shouted at an empty room.
      this.beginMatch();
      return;
    }

    this.ctx.running = false;
    this.ctx.events.emit(GameEvent.CountdownTick, this.countdownValue);
    this.audio.play('countdown');

    this.time.addEvent({
      delay: 1000,
      repeat: MATCH.countdownSeconds,
      callback: () => {
        this.countdownValue -= 1;
        if (this.countdownValue > 0) {
          this.ctx.events.emit(GameEvent.CountdownTick, this.countdownValue);
          this.audio.play('countdown');
        } else if (this.countdownValue === 0) {
          this.ctx.events.emit(GameEvent.CountdownTick, 0);
          this.audio.play('countdown');
          this.beginMatch();
        }
      },
    });
  }

  private beginMatch(): void {
    this.ctx.running = true;
    this.matchElapsedMs = 0;
    for (const c of this.combatants) c.spawnProtectionUntil = this.time.now + MATCH.spawnProtectionMs;
    this.ctx.events.emit(GameEvent.MatchStart);
  }

  // ------------------------------------------------------------------ frame

  override update(time: number, delta: number): void {
    const dt = Math.min(delta, 50);
    this.ctx.now = time;
    if (this.ctx.running) this.matchElapsedMs += dt;
    this.ctx.matchTimeMs = this.matchElapsedMs;

    // Input is polled even while paused so the pause key can release the game again.
    this.inputSystem.update(this.player.x, this.player.y);
    if (this.inputSystem.consume('debug')) this.debug.toggle();
    if (this.inputSystem.consume('pause')) this.togglePause();
    if (this.paused) {
      this.inputSystem.clearPending();
      return;
    }

    this.audio.setListener(this.player.x, this.player.y);

    for (const c of this.combatants) c.update(time, dt);
    if (this.ctx.running) this.ai.update(dt, this.bots);
    this.combat.update(dt);
    this.zone.update(dt);
    this.signal.update(dt);
    this.director.update(dt);
    this.noise.update(dt);
    this.loot.update(time);
    this.effects.update(dt);
    this.tutorial.update();
    this.mapRenderer.update(this.player.x, this.player.y, dt);
    this.culler.update(this.cameras.main);
    this.updateCameraLead(dt);
    this.debug.update();

    if (this.ctx.running && this.player.alive) {
      this.player.stats.survivedMs = this.ctx.matchTimeMs;
    }

  }

  /** Nudges the camera toward the aim point so you can see where you are shooting. */
  private updateCameraLead(delta: number): void {
    const cam = this.cameras.main;
    const dx = this.inputSystem.aimWorldX - this.player.x;
    const dy = this.inputSystem.aimWorldY - this.player.y;
    const targetX = clamp(dx * VIEW.aimLeadFactor, -VIEW.aimLeadMax, VIEW.aimLeadMax);
    const targetY = clamp(dy * VIEW.aimLeadFactor, -VIEW.aimLeadMax, VIEW.aimLeadMax);
    const t = 1 - Math.pow(0.86, delta / 16.667);
    cam.followOffset.x += (-targetX - cam.followOffset.x) * t;
    cam.followOffset.y += (-targetY - cam.followOffset.y) * t;
  }

  private togglePause(): void {
    if (this.finished) return;
    this.paused = !this.paused;
    if (this.paused) this.physics.world.pause();
    else this.physics.world.resume();
    this.scene.get(SceneKey.UI)?.events.emit('pause-changed', this.paused);
  }

  // ------------------------------------------------------------------ world events

  private onGunshot(x: number, y: number, source: Combatant, radius: number): void {
    this.ctx.events.emit(GameEvent.Gunshot, x, y, source.combatantId);
    this.noise.emit(x, y, radius, NoiseKind.Gunshot, source);
  }

  /** Destructible cover: crack it, then remove it from physics, nav and the renderer. */
  private onCoverDamaged(cover: CoverObject, amount: number, hitX: number, hitY: number): void {
    if (!cover.destructible || cover.destroyed) return;
    const destroyed = cover.applyDamage(amount);
    if (destroyed) {
      this.collision.destroyCover(cover);
      this.mapRenderer.removeCover(cover);
      this.effects.splinterBurst(cover.x, cover.y, 1);
      this.audio.play('break', cover.x, cover.y);
      this.noise.emitKind(cover.x, cover.y, NoiseKind.Door, null);
    } else {
      this.mapRenderer.showCoverDamage(cover);
      this.effects.splinterBurst(hitX, hitY, 0.35);
      this.audio.play('wood', hitX, hitY, 0.6);
    }
  }

  private onSupplyLanded(point: { x: number; y: number }): void {
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      if (distance(bot.x, bot.y, point.x, point.y) > 1400) continue;
      this.ai.alertToSignal(bot, point.x, point.y);
    }
  }

  private onCaptureWin(winner: Combatant): void {
    if (this.finished) return;
    this.ctx.events.emit(GameEvent.Announce, {
      text: winner.isPlayer ? 'SIGNAL CAPTURED' : 'SIGNAL LOST',
      sub: winner.isPlayer ? undefined : `${winner.combatantName} took the Final Signal`,
      color: winner.isPlayer ? 0x2ee6ff : 0xff6b81,
      durationMs: 2400,
    });
    if (!winner.isPlayer) this.player.stats.placement = Math.max(2, this.ctx.aliveCount);
    else this.player.stats.placement = 1;
    this.endMatch(winner.isPlayer);
  }

  private onKill(victim: Combatant, killer: Combatant | null, cause: string): void {
    victim.stats.placement = this.ctx.aliveCount;
    victim.stats.survivedMs = this.ctx.matchTimeMs;
    this.ctx.aliveCount = Math.max(0, this.ctx.aliveCount - 1);
    this.signal.onDeath(victim);

    const payload: KillEventPayload = {
      victim: victim.combatantName,
      killer: killer ? killer.combatantName : null,
      weapon: cause,
      victimIsPlayer: victim.isPlayer,
      killerIsPlayer: killer?.isPlayer ?? false,
    };
    this.ctx.events.emit(GameEvent.Kill, payload);
    this.ctx.events.emit(GameEvent.AliveCountChanged, this.ctx.aliveCount);

    if (killer?.isPlayer && !victim.isPlayer) {
      this.ctx.events.emit(GameEvent.Announce, {
        text: `ELIMINATED ${victim.combatantName.toUpperCase()}`,
        color: 0xf4d03f,
        durationMs: 1500,
      });
    }

    if (victim.isPlayer) {
      this.endMatch(false);
      return;
    }
    if (this.ctx.aliveCount <= 1 && this.player.alive) {
      this.player.stats.placement = 1;
      this.endMatch(true);
    }
  }

  private endMatch(victory: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.ctx.running = false;
    this.combat.reset();

    const stats = this.player.stats;
    const survivedMs = this.ctx.matchTimeMs;
    const placement = victory ? 1 : Math.max(1, stats.placement || this.ctx.aliveCount + 1);
    const score = computeScore(
      stats.kills,
      stats.damageDealt,
      survivedMs,
      placement,
      MATCH.totalCombatants,
      victory,
    );

    const result: MatchResult = {
      victory,
      level: this.level,
      placement,
      totalCombatants: MATCH.totalCombatants,
      kills: stats.kills,
      damage: Math.round(stats.damageDealt),
      survivedMs,
      shotsFired: stats.shotsFired,
      shotsHit: stats.shotsHit,
      score,
      seed: this.seed,
    };

    const save = Storage.record(result);
    this.audio.play(victory ? 'victory' : 'death');
    this.ctx.events.emit(GameEvent.MatchEnd, result);

    this.time.delayedCall(victory ? 1400 : 1700, () => {
      this.scene.stop(SceneKey.UI);
      this.scene.start(SceneKey.Result, {
        result,
        save,
        accuracy: accuracyPercent(result.shotsHit, result.shotsFired),
      });
    });
  }

  private onShutdown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
    this.ctx.events.off(GameEvent.SupplyDropLanded, this.onSupplyLanded, this);
    this.inputSystem.destroy();
    this.debug.destroy();
    this.mapRenderer.stopDecorations();
    this.culler.reset();
    this.loot.reset();
    this.effects.reset();
    this.zone.reset();
    this.signal.reset();
    this.director.reset();
    this.combatants.length = 0;
    this.bots = [];
  }
}
