import { MatchEventKind, ZonePattern } from '../utils/Constants';

/**
 * Match events are deliberately rare and short. Two per match, one at a time, each with
 * a loud four-word announcement so the player always knows what changed and why.
 */
export const MATCH_EVENTS = {
  maxPerMatch: 2,
  /** Nothing fires before this - the opening should stay calm and readable. */
  earliestMs: 55000,
  /** Minimum quiet time between two events. */
  minGapMs: 50000,
  /** Chance a slot is used at all, so not every match feels scripted. */
  triggerChance: 0.78,
} as const;

export const FOG = {
  durationMs: [20000, 30000] as [number, number],
  /** Bot view distance and the player's effective sight are cut to this fraction. */
  visionMult: 0.55,
  /** Screen overlay strength. */
  alpha: 0.42,
  color: 0xb9c6d4,
  announcement: 'FOG ROLLING IN',
} as const;

export const RADAR = {
  revealMs: 4000,
  announcement: 'RADAR PULSE',
  /** Blips are jittered by this much - it is a sweep, not a tracker. */
  jitter: 110,
} as const;

export const SUPPLY = {
  crates: 2,
  /** How long the marker sits on the minimap after landing. */
  markerMs: 45000,
  fallMs: 1400,
  announcement: 'SUPPLY DROP INBOUND',
} as const;

export const EVENT_WEIGHTS: ReadonlyArray<{ value: MatchEventKind; weight: number }> = [
  { value: MatchEventKind.SupplyDrop, weight: 40 },
  { value: MatchEventKind.RadarPulse, weight: 32 },
  { value: MatchEventKind.Fog, weight: 28 },
];

/**
 * Zone variants stay off until the player has some matches behind them, so the first
 * few games teach one simple rule: get inside the circle.
 */
export const ZONE_VARIANTS = {
  unlockAfterMatches: 3,
  weights: [
    { value: ZonePattern.Standard, weight: 55 },
    { value: ZonePattern.Moving, weight: 27 },
    { value: ZonePattern.Split, weight: 18 },
  ] as ReadonlyArray<{ value: ZonePattern; weight: number }>,
  /** Moving zone: how far the centre drifts per second while closed. */
  moveDriftPerSecond: 11,
  /** Split zone: which phase splits into two circles. */
  splitPhaseIndex: 2,
  splitMergePhaseIndex: 3,
} as const;

/** Onboarding: the first couple of matches ease the player in through encounter design. */
export const ONBOARDING = {
  gentleMatches: 2,
  /** Bots near the player start slower to react and less eager to push. */
  gentleReactionMult: 1.9,
  gentleNoticeMult: 0.55,
  gentleRadius: 900,
  /** A starter weapon is placed this close to the player's drop on gentle matches. */
  starterWeaponDistance: 190,
} as const;
