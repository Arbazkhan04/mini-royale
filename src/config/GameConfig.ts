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
  /** Desktop aims raw: a mouse does not need the help and the pull fights the hand. */
  enabledOnDesktop: false,
  /** Extra world units added to an enemy's radius for the player's own bullets. */
  hitTolerance: 9,

  // ---- tiers, measured from where the stick is pointing to where the enemy is ----
  /** Inside this half-angle the shot is "basically lined up" and the pull is strong. */
  strongConeDeg: 15,
  /** From strongConeDeg out to here the pull fades away. Past it there is none. */
  mildConeDeg: 25,
  /** Correction rate at dead centre, degrees per second. */
  strongPullDegPerSecond: 200,
  /** Correction rate at the outer edge of the mild cone. */
  mildPullDegPerSecond: 55,

  // ---- holding FIRE ----
  /** Holding FIRE widens the search this far and swings the gun onto the target. */
  fireConeDeg: 70,
  /** Ceiling on the fire cone after the weapon multiplier, so nothing aims behind you. */
  fireConeMaxDeg: 100,
  /** Turn speed multiplier while swinging onto a target under fire. */
  fireTurnSpeedMult: 2.6,

  // ---- soft lock ----
  /** A chosen target stays chosen this long, so the aim cannot flicker between two. */
  softLockMs: 400,
  /** Deliberately swinging this far off drops the lock at once - the player wins. */
  softLockBreakDeg: 85,

  /** Assist reach: the weapon's own range, capped here. */
  maxRange: 900,
  /** Fraction the aim sweep slows by while crossing a target, so a thumb can settle. */
  sweepSlowdown: 0.4,
} as const;

/**
 * One-thumb shooting.
 *
 * Aiming with the right stick and then reaching for a separate FIRE button is the single
 * most awkward thing about a twin-stick shooter on a phone - it needs a third thumb, or a
 * pause between aiming and shooting that a firefight does not give you. So the aim stick
 * is also the trigger: drag it toward an enemy and the gun fires on its own.
 *
 * It only fires when there is actually someone to shoot, inside a cone narrow enough that
 * it reads as intent rather than accident. Sweeping the stick past an enemy on your way
 * somewhere else does not empty your magazine, and turning to look around never costs a
 * round. The FIRE button still works and still gets the wider 70-degree snap, for
 * suppressing fire and for anyone who prefers the two-thumb way.
 */
export const TOUCH_AIM = {
  fireWhileAiming: true,
  /** Half-angle that counts as "pointing at them", before the weapon multiplier. */
  autoFireConeDeg: 18,
  /**
   * Holding the trigger re-taps a semi-automatic weapon at its own fire rate.
   *
   * A mouse click per shot is nothing; a thumb tapping a screen button as fast as a PX-9
   * can cycle is not realistic, and without this a semi-auto on a phone fires one round
   * and stops, which reads as the gun being broken. Desktop keeps click-per-shot.
   */
  autoRepeatSemiAuto: true,

  /**
   * Tap an enemy to shoot them.
   *
   * The most direct expression of what a player actually wants: I can see him, shoot him.
   * No stick to line up and no button to find - touch the enemy on screen and the gun
   * swings onto him and fires, and keeps firing while your thumb stays down.
   */
  tapToShoot: true,
  /** How near the tap has to land, in screen pixels. Enemies are small; thumbs are not. */
  tapRadiusPx: 62,
  /** Turn speed multiplier while swinging onto a tapped enemy. */
  tapTurnSpeedMult: 4,
  /** Hold fire until the gun is this close to lined up, so the first shot is not thrown away. */
  tapFireToleranceDeg: 14,
  /**
   * A tap keeps shooting this long after the thumb lifts.
   *
   * Without it a quick tap does nothing at all: the gun is still swinging round when the
   * finger comes up, so the trigger never gets a chance to release. Holding stays down as
   * long as you like; this only guarantees that a tap always means at least one shot.
   */
  tapCommitMs: 340,

  /**
   * Touch aiming is absolute, the way a mouse is: the gun points at the spot you touched,
   * not in the direction you dragged from some origin.
   *
   * This is the whole model. Touch anywhere and the gun swings to face that point and
   * fires; drag and it follows your finger; let go and it stops. A relative stick asks you
   * to translate "he is up and to the left" into a thumb vector, which is exactly the step
   * that made shooting hard, and it is a step a mouse never asks for.
   */
  absoluteTouchAim: true,
  /** The FIRE button is redundant once touching the screen shoots. */
  showFireButton: false,
  /** A touch shorter than this is a tap, and keeps firing through the commit window. */
  tapMaxMs: 260,
} as const;

/**
 * Screen-edge markers for enemies you cannot see but who can see you.
 *
 * Line of sight is required, so this never reveals someone hiding behind a wall - it only
 * tells you about a fight you are already in, which is the thing a 60-degree phone view
 * takes away from you.
 */
export const THREAT_INDICATOR = {
  enabled: true,
  /** Enemies further out than this are not shown even with a clear line. */
  range: 820,
  /** Someone who shot you stays marked this long even after breaking line of sight. */
  recentAttackerMs: 4000,
  /** Inset from the screen edge, in pixels. */
  edgeMargin: 46,
  maxShown: 4,
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
