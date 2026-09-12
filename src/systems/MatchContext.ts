import type Phaser from 'phaser';
import type { MapData } from '../map/MapData';
import type { Rng } from '../utils/RandomUtils';
import type { Combatant } from '../entities/Combatant';
import type { Player } from '../entities/Player';
import type { CollisionSystem } from './CollisionSystem';
import type { CombatSystem } from './CombatSystem';
import type { LootSystem } from './LootSystem';
import type { ZoneSystem } from './ZoneSystem';
import type { ParticleSystem } from './ParticleSystem';
import type { AudioSystem } from './AudioSystem';
import type { AimAssist } from './AimAssist';
import type { NoiseSystem } from './NoiseSystem';
import type { SignalSystem } from './SignalSystem';
import type { MatchDirector } from './MatchDirector';
import type { Bot } from '../entities/Bot';
import type { CoverObject } from '../map/CoverObject';

/**
 * The shared service bundle handed to entities and systems.
 *
 * Everything gameplay related goes through this interface rather than reaching into
 * GameScene, which keeps the door open for a server-authoritative implementation later:
 * a networked build can supply its own MatchContext without touching entity code.
 */
export interface MatchContext {
  readonly scene: Phaser.Scene;
  readonly map: MapData;
  readonly rng: Rng;
  readonly events: Phaser.Events.EventEmitter;

  readonly collision: CollisionSystem;
  readonly combat: CombatSystem;
  readonly loot: LootSystem;
  readonly zone: ZoneSystem;
  readonly effects: ParticleSystem;
  readonly audio: AudioSystem;
  readonly noise: NoiseSystem;
  readonly aimAssist: AimAssist;
  readonly signal: SignalSystem;
  readonly director: MatchDirector;

  readonly combatants: Combatant[];
  readonly bots: Bot[];
  readonly player: Player;
  /** True when the session is running on a touch device; drives prompt wording. */
  readonly isTouch: boolean;

  /** Scene time in ms, refreshed once per frame. */
  now: number;
  /** Time since the match actually started (after the countdown). */
  matchTimeMs: number;
  aliveCount: number;
  /** True once the countdown has finished and combat is live. */
  running: boolean;

  reportKill(victim: Combatant, killer: Combatant | null, cause: string): void;
  /** Broadcast a gunshot so nearby bots can investigate. */
  reportGunshot(x: number, y: number, source: Combatant, loudness: number): void;
  /** Applies damage to a destructible object and handles its destruction. */
  damageCover(cover: CoverObject, amount: number, hitX: number, hitY: number): void;
  /** Ends the match because someone completed the Final Signal capture. */
  finishByCapture(winner: Combatant): void;
}
