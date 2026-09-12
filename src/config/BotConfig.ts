import { BotSkill } from '../utils/Constants';

export interface BotProfile {
  readonly skill: BotSkill;
  readonly label: string;
  /** Seconds before a newly spotted enemy is acted on. */
  readonly reactionMs: [number, number];
  /** Radians of aim error at point blank, scaled up with distance. */
  readonly aimErrorBase: number;
  /** Extra aim error per 1000 units of distance. */
  readonly aimErrorPerUnit: number;
  /** How fast the bot swings its aim toward the target (rad/s). */
  readonly aimTurnSpeed: number;
  /** Fraction of target velocity the bot leads its shots by. */
  readonly leadFactor: number;
  /** Base detection radius with clear line of sight. */
  readonly viewDistance: number;
  /** Field of view half-angle in degrees; targets outside take longer to notice. */
  readonly fovDeg: number;
  /** Per-think chance to notice an enemy inside view distance. */
  readonly noticeChance: number;
  /** Health fraction at which the bot looks for cover and heals. */
  readonly healThreshold: number;
  /** Health fraction at which the bot disengages. */
  readonly fleeThreshold: number;
  /** Preference for using cover, 0..1. */
  readonly coverAffinity: number;
  /** Multiplier on how long the bot keeps firing without a refreshed sighting. */
  readonly persistence: number;
  /** Trigger discipline: chance to hold fire when the shot is bad. */
  readonly discipline: number;
  readonly strafeAmount: number;
}

export const BOT_PROFILES: Record<BotSkill, BotProfile> = {
  [BotSkill.Beginner]: {
    skill: BotSkill.Beginner,
    label: 'Rookie',
    reactionMs: [460, 860],
    aimErrorBase: 0.11,
    aimErrorPerUnit: 0.23,
    aimTurnSpeed: 3.4,
    leadFactor: 0.15,
    viewDistance: 520,
    fovDeg: 105,
    noticeChance: 0.4,
    healThreshold: 0.5,
    fleeThreshold: 0.32,
    coverAffinity: 0.35,
    persistence: 0.8,
    discipline: 0.25,
    strafeAmount: 0.35,
  },
  [BotSkill.Average]: {
    skill: BotSkill.Average,
    label: 'Regular',
    reactionMs: [280, 520],
    aimErrorBase: 0.068,
    aimErrorPerUnit: 0.155,
    aimTurnSpeed: 5.2,
    leadFactor: 0.42,
    viewDistance: 660,
    fovDeg: 130,
    noticeChance: 0.58,
    healThreshold: 0.55,
    fleeThreshold: 0.35,
    coverAffinity: 0.6,
    persistence: 1.0,
    discipline: 0.45,
    strafeAmount: 0.6,
  },
  [BotSkill.Skilled]: {
    skill: BotSkill.Skilled,
    label: 'Veteran',
    reactionMs: [160, 330],
    aimErrorBase: 0.038,
    aimErrorPerUnit: 0.098,
    aimTurnSpeed: 7.4,
    leadFactor: 0.75,
    viewDistance: 780,
    fovDeg: 155,
    noticeChance: 0.75,
    healThreshold: 0.6,
    fleeThreshold: 0.38,
    coverAffinity: 0.85,
    persistence: 1.25,
    discipline: 0.62,
    strafeAmount: 0.85,
  },
};

/** Relative frequency of each skill tier when populating a match. */
export const BOT_SKILL_WEIGHTS: ReadonlyArray<{ value: BotSkill; weight: number }> = [
  { value: BotSkill.Beginner, weight: 34 },
  { value: BotSkill.Average, weight: 44 },
  { value: BotSkill.Skilled, weight: 22 },
];

export const BOT_AI = {
  /** Loot within this radius is considered worth a detour. */
  lootScanRadius: 620,
  /** Cover objects are looked for inside this radius. */
  coverScanRadius: 340,
  /** Gunfire within this radius may be heard and investigated. */
  hearingRadius: 620,
  /** Chance a heard shot is actually investigated - stops whole-lobby pile-ups. */
  investigateChance: 0.5,
  /** A sighting is forgotten after this long without a refresh. */
  memoryMs: 4200,
  /** Distance at which a waypoint counts as reached. */
  arriveRadius: 46,
  /** How long a bot commits to an explore destination before re-picking. */
  exploreCommitMs: 9000,
  /** Time in the same spot before the bot considers itself stuck. */
  stuckMs: 900,
  stuckDistance: 26,
  /** Bots start heading for the circle once the timer drops below this. */
  zonePanicSeconds: 14,
  /** Keep this much margin inside the zone edge. */
  zoneSafetyMargin: 140,
  /** Bots stop hunting loot once they are reasonably kitted. */
  satisfiedAmmoRatio: 1.2,
  reloadWhenBelow: 0.28,
  /** Delay between switching targets, prevents twitchy retargeting. */
  retargetMs: 700,
  /** Melee bots charge instead of running away. */
  desperateChargeRange: 260,
  /**
   * Opening phase. Everyone drops in unarmed, so for the first stretch of the match
   * bots concentrate on kitting up and only fight what walks into their lap. Without
   * this the whole lobby trades kills inside the first thirty seconds.
   */
  openingPhaseMs: 40000,
  openingEngageRange: 280,
  /** Chance a bot holds an area instead of immediately picking a new destination. */
  holdChance: 0.55,
  holdMs: [5000, 15000] as [number, number],
} as const;
