import { SignalAbility, Tex } from '../utils/Constants';

export interface AbilityDef {
  readonly id: SignalAbility;
  /** Shown in the pickup banner and on the HUD chip. */
  readonly name: string;
  readonly icon: string;
  readonly color: number;
  readonly cooldownMs: number;
  /** Length of the effect for timed abilities; 0 for instant ones. */
  readonly durationMs: number;
  /** Ability-specific magnitude: dash/blink distance, shield points, scan radius. */
  readonly power: number;
  /** Four words at most - it has to read at a glance mid-fight. */
  readonly blurb: string;
}

/**
 * One ability is drawn per match. They are deliberately simple and self-explanatory:
 * the player should understand what they got from the banner alone.
 */
export const ABILITIES: Record<SignalAbility, AbilityDef> = {
  [SignalAbility.Dash]: {
    id: SignalAbility.Dash,
    name: 'DASH',
    icon: Tex.AbilityDash,
    color: 0x59d6ff,
    cooldownMs: 6000,
    durationMs: 220,
    power: 330,
    blurb: 'Burst of speed forward',
  },
  [SignalAbility.ShieldPulse]: {
    id: SignalAbility.ShieldPulse,
    name: 'SHIELD',
    icon: Tex.AbilityShield,
    color: 0x7ce8a0,
    cooldownMs: 13000,
    durationMs: 5000,
    power: 70,
    blurb: 'Absorbs incoming damage',
  },
  [SignalAbility.DroneScan]: {
    id: SignalAbility.DroneScan,
    name: 'SCAN',
    icon: Tex.AbilityScan,
    color: 0xf4d03f,
    cooldownMs: 16000,
    durationMs: 4500,
    power: 950,
    blurb: 'Reveals nearby enemies',
  },
  [SignalAbility.SpeedBoost]: {
    id: SignalAbility.SpeedBoost,
    name: 'SPRINT',
    icon: Tex.AbilitySpeed,
    color: 0xff9a4a,
    cooldownMs: 11000,
    durationMs: 5000,
    power: 1.4,
    blurb: 'Move much faster',
  },
  [SignalAbility.Teleport]: {
    id: SignalAbility.Teleport,
    name: 'BLINK',
    icon: Tex.AbilityTeleport,
    color: 0xb85fe0,
    cooldownMs: 14000,
    durationMs: 0,
    power: 260,
    blurb: 'Jump toward your aim',
  },
};

export const ABILITY_POOL: readonly SignalAbility[] = [
  SignalAbility.Dash,
  SignalAbility.ShieldPulse,
  SignalAbility.DroneScan,
  SignalAbility.SpeedBoost,
  SignalAbility.Teleport,
];

export const SIGNAL = {
  /** The core drops somewhere in this window, well after the opening loot phase. */
  spawnWindowMs: [60000, 90000] as [number, number],
  pickupRadius: 54,
  /** How often the holder's rough position is broadcast to everyone. */
  pingIntervalMs: 18000,
  /** How long the detection circle stays on the minimap. */
  pingRevealMs: 4000,
  /** Radius of the "approximate area" circle - never an exact position. */
  pingRadius: 300,
  /** The broadcast point is jittered inside this radius. */
  pingJitter: 130,
  /** Bots inside this range will actively hunt a detected holder. */
  botHuntRadius: 1500,

  // ---- Final Signal ----
  /** Survivor count that triggers the capture objective. */
  finalSurvivors: 3,
  finalCaptureMs: 20000,
  finalRadius: 165,
  /** Progress lost per second while nobody is holding the point. */
  finalDecayPerSecond: 0.5,
} as const;
