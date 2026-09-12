/** Global tuning values. Gameplay code must read from here rather than hard-coding numbers. */

export const WORLD = {
  width: 3000,
  height: 3000,
  /** Entities are kept this far from the world edge. */
  margin: 40,
} as const;

export const VIEW = {
  width: 1280,
  height: 720,
  /** Smallest screen dimension is mapped to this many world units. */
  desktopViewSpan: 760,
  touchViewSpan: 640,
  minZoom: 0.45,
  maxZoom: 2.2,
  /** Below this width the UI switches to its narrow layout. */
  narrowBreakpoint: 560,
  /** Camera follow smoothing (higher = snappier). */
  followLerp: 0.09,
  /** How far the camera leans toward the aim point, as a fraction of the offset. */
  aimLeadFactor: 0.22,
  aimLeadMax: 170,
} as const;

export const MATCH = {
  totalCombatants: 16,
  botCount: 15,
  /**
    * The match is live the moment the scene appears - a countdown you cannot move
    * during is dead time, and the zone clock is already running behind it.
    */
  countdownSeconds: 0,
  /**
    * The player drops with this so the first fight can happen immediately. Bots still
    * start unarmed and have to loot, which keeps the opening minute survivable.
    */
  startingWeapon: 'pistol' as const,
  startingSpareAmmo: 48,
  botsStartArmed: false,
  /** Minimum spacing enforced between spawn points. Wide enough that nobody starts
   *  inside someone else's sight line, which is what keeps early fights from cascading. */
  minSpawnSeparation: 620,
  /** Safety window after spawn where damage taken is ignored. */
  spawnProtectionMs: 1500,
} as const;

export const PLAYER = {
  radius: 15,
  maxHealth: 100,
  baseSpeed: 218,
  acceleration: 2400,
  deceleration: 2100,
  /** Multiplier applied while shooting a heavy weapon. */
  heavyFireSpeedMult: 0.62,
  healMoveSpeedMult: 0.42,
  turnSpeed: 14,
  /** Bots move slightly slower so a good player can create distance. */
  botSpeedMult: 0.94,
} as const;

export const ARMOR = {
  /** Damage fraction absorbed per armor level (index = level). */
  mitigation: [0, 0.15, 0.25, 0.35],
  /** Max durability per level. */
  durability: [0, 50, 75, 110],
  /** Helmet reduces headshot-zone damage by this fraction. */
  helmetMitigation: [0, 0.15, 0.25, 0.35],
  helmetDurability: [0, 30, 45, 60],
} as const;

export const HEAL = {
  bandage: { heal: 25, cap: 75, timeMs: 2000, maxCarry: 8 },
  medkit: { heal: 100, cap: 100, timeMs: 4000, maxCarry: 4 },
} as const;

export const ZONE = {
  /** Radius shrink phases. `waitMs` is the calm period before the circle starts moving. */
  phases: [
    { radius: 2050, waitMs: 45000, shrinkMs: 22000, damagePerSecond: 1 },
    { radius: 1350, waitMs: 40000, shrinkMs: 20000, damagePerSecond: 2 },
    { radius: 820, waitMs: 35000, shrinkMs: 18000, damagePerSecond: 4 },
    { radius: 420, waitMs: 30000, shrinkMs: 16000, damagePerSecond: 7 },
    { radius: 130, waitMs: 25000, shrinkMs: 20000, damagePerSecond: 12 },
  ],
  startRadius: 2250,
  damageTickMs: 1000,
  warningLeadSeconds: 10,
} as const;

export const COMBAT = {
  maxBullets: 400,
  /** Fraction of the body radius counted as the "head" for helmet mitigation. */
  headshotChanceZone: 0.28,
  headshotMultiplier: 1.55,
  /**
   * Player shots kill in one hit. This is the single biggest difficulty dial in the
   * game - set it false for a conventional time-to-kill. It only applies to damage the
   * player deals; incoming damage is unchanged.
   */
  playerOneShotKills: true,
  /** Loot dropped on death is scattered inside this radius. */
  deathDropRadius: 46,
  meleeArcDeg: 70,
} as const;

/**
 * Touch aim help. Small, capped, and off on desktop - see systems/AimAssist.ts for why
 * each value exists.
 */
export const AIM_ASSIST = {
  enabledOnTouch: true,
  /** Extra world units added to an enemy's radius for the player's own bullets. */
  hitTolerance: 7,
  /** Half-angle of the cone in which any assistance applies at all. */
  coneDeg: 7,
  /** Fraction the aim sweep slows by when passing across a target. */
  sweepSlowdown: 0.45,
  /** Maximum correction per second, so it can never track a moving target. */
  magnetDegPerSecond: 34,
  magnetRange: 340,
} as const;

export const CAMERA_SHAKE = {
  light: { duration: 90, intensity: 0.0022 },
  medium: { duration: 140, intensity: 0.0042 },
  heavy: { duration: 220, intensity: 0.0075 },
} as const;

export const SCORE = {
  perKill: 100,
  perDamage: 0.1,
  perSurvivalSecond: 2,
  victoryBonus: 500,
  /** Placement bonus = (totalCombatants - placement) * placementStep. */
  placementStep: 25,
} as const;

export const PERF = {
  /** Bot AI "think" rate in Hz - movement still updates every frame. */
  botThinkHz: 7,
  /** Max A* path solves per frame across all bots. */
  pathSolvesPerFrame: 2,
  maxParticles: 260,
  /** Entities further than this from the camera skip cosmetic updates. */
  cullPadding: 260,
} as const;

export const DEBUG = {
  /** Toggle at runtime with F1 (or ?debug=1 in the URL). */
  enabled: false,
  showFps: true,
  showBotState: true,
  showColliders: true,
  showLootPoints: false,
  showNavGrid: false,
} as const;

export const PALETTE = {
  grassA: 0x4c8a4a,
  grassB: 0x3f7a41,
  grassC: 0x578f4f,
  dirt: 0x8a6f45,
  sand: 0xbfa46a,
  road: 0x5b5f66,
  concrete: 0x8d949c,
  water: 0x3a6ea5,
  wall: 0xb9b3a4,
  wallShade: 0x7d786c,
  roof: 0x6d5b4a,
  roofDark: 0x55463a,
  woodFloor: 0xa9855c,
  tileFloor: 0xb8bcc0,
  playerBody: 0x4aa3e0,
  playerAccent: 0xdcecf7,
  botBody: 0xd8734a,
  botBodyAlt: 0xc45b6b,
  skin: 0xe8b18a,
  outline: 0x1c2128,
  safeZone: 0x59d6ff,
  nextZone: 0xffffff,
  danger: 0xff3b5c,
  ui: 0xe8eef5,
  gold: 0xf4d03f,
} as const;

export const RARITY_COLOR: Record<string, number> = {
  common: 0xb7c0cc,
  uncommon: 0x5fd36b,
  rare: 0x4aa3e0,
  epic: 0xb85fe0,
};

export const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
};
