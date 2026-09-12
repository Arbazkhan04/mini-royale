import { AmmoType, Rarity, WeaponType } from '../utils/Constants';

export type WeaponId =
  | 'knife'
  | 'pistol'
  | 'smg'
  | 'ar'
  | 'shotgun'
  | 'sniper'
  | 'lmg'
  | 'burst';

export interface WeaponStats {
  readonly id: WeaponId;
  readonly name: string;
  readonly shortName: string;
  readonly type: WeaponType;
  readonly ammo: AmmoType;
  /** Damage per bullet (per pellet for shotguns). */
  readonly damage: number;
  readonly fireRateMs: number;
  readonly magazine: number;
  readonly reloadMs: number;
  readonly bulletSpeed: number;
  /** Max travel distance in world units. */
  readonly range: number;
  /** Base cone half-angle in degrees. */
  readonly spreadDeg: number;
  /** Extra spread while the shooter is moving. */
  readonly moveSpreadDeg: number;
  /** Aim kick applied per shot, in degrees. */
  readonly recoilDeg: number;
  readonly pellets: number;
  readonly auto: boolean;
  /** Shots per burst for burst weapons (1 = not a burst weapon). */
  readonly burst: number;
  readonly burstDelayMs: number;
  /** Movement speed multiplier while holding this weapon. */
  readonly moveSpeedMult: number;
  /** Movement multiplier applied briefly after firing (heavy weapons brace). */
  readonly fireMoveSpeedMult: number;
  readonly shake: 'none' | 'light' | 'medium' | 'heavy';
  readonly sound: string;
  readonly bulletLength: number;
  readonly bulletColor: number;
  /** Bots prefer weapons with a higher score at a matching engagement range. */
  readonly aiScore: number;
  readonly aiIdealRange: number;
  /** Weapon draw length in world units (visual). */
  readonly drawLength: number;
  readonly drawWidth: number;

  // ---- utility identity (see the weapon table in the README) ----
  /** How far the shot is heard, in world units. Drives bot awareness and the sound cue. */
  readonly noiseRadius: number;
  /** Damage a single projectile deals to destructible wooden cover. */
  readonly coverDamage: number;
  /** True when a round continues through one thin wooden object. */
  readonly penetratesWood: boolean;
  /** Time to bring this weapon up after a slot change. */
  readonly swapMs: number;
  /**
   * Multiplier on touch aim assist. A shotgun is forgiving at the range it works at; a
   * sniper is not, because a rifle that snaps onto targets plays itself.
   */
  readonly aimAssist: number;
  /** One-line identity shown when the weapon is first picked up. */
  readonly tagline: string;
}

const W = (s: WeaponStats): WeaponStats => s;

export const WEAPONS: Record<WeaponId, WeaponStats> = {
  knife: W({
    id: 'knife',
    name: 'Combat Knife',
    shortName: 'Knife',
    type: WeaponType.Melee,
    ammo: AmmoType.None,
    damage: 34,
    fireRateMs: 460,
    magazine: 0,
    reloadMs: 0,
    bulletSpeed: 0,
    range: 62,
    spreadDeg: 0,
    moveSpreadDeg: 0,
    recoilDeg: 0,
    pellets: 1,
    auto: true,
    burst: 1,
    burstDelayMs: 0,
    moveSpeedMult: 1.08,
    fireMoveSpeedMult: 1,
    shake: 'none',
    sound: 'melee',
    bulletLength: 0,
    bulletColor: 0xffffff,
    aiScore: 5,
    aiIdealRange: 60,
    drawLength: 16,
    drawWidth: 4,
    noiseRadius: 90,
    coverDamage: 12,
    penetratesWood: false,
    swapMs: 200,
    aimAssist: 1.3,
    tagline: 'Silent. Desperate.',
  }),
  pistol: W({
    id: 'pistol',
    name: 'PX-9 Sidearm',
    shortName: 'PX-9',
    type: WeaponType.Pistol,
    ammo: AmmoType.Light,
    damage: 20,
    fireRateMs: 190,
    magazine: 12,
    reloadMs: 1350,
    bulletSpeed: 1150,
    range: 620,
    spreadDeg: 1.6,
    moveSpreadDeg: 1.8,
    recoilDeg: 1.5,
    pellets: 1,
    auto: false,
    burst: 1,
    burstDelayMs: 0,
    moveSpeedMult: 1.04,
    fireMoveSpeedMult: 1,
    shake: 'light',
    sound: 'pistol',
    bulletLength: 12,
    bulletColor: 0xffe08a,
    aiScore: 20,
    aiIdealRange: 320,
    drawLength: 20,
    drawWidth: 5,
    noiseRadius: 520,
    coverDamage: 10,
    penetratesWood: false,
    swapMs: 170,
    aimAssist: 1.0,
    tagline: 'Quick draw, quick feet',
  }),
  smg: W({
    id: 'smg',
    name: 'SC-11 SMG',
    shortName: 'SC-11',
    type: WeaponType.SMG,
    ammo: AmmoType.Light,
    damage: 14,
    fireRateMs: 76,
    magazine: 30,
    reloadMs: 1750,
    bulletSpeed: 1080,
    range: 560,
    spreadDeg: 4.2,
    moveSpreadDeg: 2.4,
    recoilDeg: 1.1,
    pellets: 1,
    auto: true,
    burst: 1,
    burstDelayMs: 0,
    moveSpeedMult: 1.0,
    fireMoveSpeedMult: 0.94,
    shake: 'light',
    sound: 'smg',
    bulletLength: 13,
    bulletColor: 0xffe08a,
    aiScore: 42,
    aiIdealRange: 280,
    drawLength: 26,
    drawWidth: 6,
    noiseRadius: 620,
    coverDamage: 8,
    penetratesWood: false,
    swapMs: 250,
    aimAssist: 1.15,
    tagline: 'Run-and-gun close range',
  }),
  ar: W({
    id: 'ar',
    name: 'AR-27 Rifle',
    shortName: 'AR-27',
    type: WeaponType.AssaultRifle,
    ammo: AmmoType.Medium,
    damage: 22,
    fireRateMs: 118,
    magazine: 30,
    reloadMs: 2100,
    bulletSpeed: 1420,
    range: 900,
    spreadDeg: 2.3,
    moveSpreadDeg: 2.2,
    recoilDeg: 1.4,
    pellets: 1,
    auto: true,
    burst: 1,
    burstDelayMs: 0,
    moveSpeedMult: 0.97,
    fireMoveSpeedMult: 0.9,
    shake: 'medium',
    sound: 'rifle',
    bulletLength: 16,
    bulletColor: 0xfff0b0,
    aiScore: 65,
    aiIdealRange: 470,
    drawLength: 32,
    drawWidth: 6,
    noiseRadius: 760,
    coverDamage: 12,
    penetratesWood: false,
    swapMs: 300,
    aimAssist: 1.0,
    tagline: 'Good at everything',
  }),
  burst: W({
    id: 'burst',
    name: 'BR-3 Burst',
    shortName: 'BR-3',
    type: WeaponType.AssaultRifle,
    ammo: AmmoType.Medium,
    damage: 25,
    fireRateMs: 420,
    magazine: 27,
    reloadMs: 2000,
    bulletSpeed: 1480,
    range: 950,
    spreadDeg: 1.4,
    moveSpreadDeg: 2.0,
    recoilDeg: 1.2,
    pellets: 1,
    auto: true,
    burst: 3,
    burstDelayMs: 68,
    moveSpeedMult: 0.98,
    fireMoveSpeedMult: 0.92,
    shake: 'medium',
    sound: 'rifle',
    bulletLength: 16,
    bulletColor: 0xfff0b0,
    aiScore: 62,
    aiIdealRange: 520,
    drawLength: 31,
    drawWidth: 6,
    noiseRadius: 740,
    coverDamage: 12,
    penetratesWood: false,
    swapMs: 300,
    aimAssist: 0.95,
    tagline: 'Three-round punch',
  }),
  shotgun: W({
    id: 'shotgun',
    name: 'SG-12 Breacher',
    shortName: 'SG-12',
    type: WeaponType.Shotgun,
    ammo: AmmoType.Shells,
    damage: 10,
    fireRateMs: 780,
    magazine: 5,
    reloadMs: 2600,
    bulletSpeed: 900,
    range: 300,
    spreadDeg: 9.5,
    moveSpreadDeg: 2.5,
    recoilDeg: 3.4,
    pellets: 8,
    auto: false,
    burst: 1,
    burstDelayMs: 0,
    moveSpeedMult: 0.99,
    fireMoveSpeedMult: 0.8,
    shake: 'heavy',
    sound: 'shotgun',
    bulletLength: 9,
    bulletColor: 0xffd27a,
    aiScore: 55,
    aiIdealRange: 170,
    drawLength: 30,
    drawWidth: 7,
    noiseRadius: 900,
    coverDamage: 22,
    penetratesWood: false,
    swapMs: 320,
    aimAssist: 1.7,
    tagline: 'Blows doors off hinges',
  }),
  sniper: W({
    id: 'sniper',
    name: 'LR-50 Longbow',
    shortName: 'LR-50',
    type: WeaponType.Sniper,
    ammo: AmmoType.Sniper,
    damage: 75,
    fireRateMs: 1250,
    magazine: 5,
    reloadMs: 2900,
    bulletSpeed: 2400,
    range: 1600,
    spreadDeg: 0.35,
    moveSpreadDeg: 4.5,
    recoilDeg: 2.6,
    pellets: 1,
    auto: false,
    burst: 1,
    burstDelayMs: 0,
    moveSpeedMult: 0.93,
    fireMoveSpeedMult: 0.6,
    shake: 'heavy',
    sound: 'sniper',
    bulletLength: 26,
    bulletColor: 0xffffff,
    aiScore: 70,
    aiIdealRange: 900,
    drawLength: 38,
    drawWidth: 5,
    noiseRadius: 950,
    coverDamage: 30,
    penetratesWood: true,
    swapMs: 420,
    aimAssist: 0.15,
    tagline: 'Shoots through wood',
  }),
  lmg: W({
    id: 'lmg',
    name: 'MG-88 Suppressor',
    shortName: 'MG-88',
    type: WeaponType.LMG,
    ammo: AmmoType.Medium,
    damage: 19,
    fireRateMs: 95,
    magazine: 45,
    reloadMs: 3600,
    bulletSpeed: 1300,
    range: 850,
    spreadDeg: 3.6,
    moveSpreadDeg: 3.6,
    recoilDeg: 1.0,
    pellets: 1,
    auto: true,
    burst: 1,
    burstDelayMs: 0,
    moveSpeedMult: 0.86,
    fireMoveSpeedMult: 0.62,
    shake: 'medium',
    sound: 'lmg',
    bulletLength: 17,
    bulletColor: 0xfff0b0,
    aiScore: 68,
    aiIdealRange: 430,
    drawLength: 35,
    drawWidth: 8,
    noiseRadius: 800,
    coverDamage: 26,
    penetratesWood: false,
    swapMs: 480,
    aimAssist: 0.85,
    tagline: 'Chews through cover',
  }),
};

export const LOOTABLE_WEAPONS: readonly WeaponId[] = [
  'pistol',
  'smg',
  'ar',
  'burst',
  'shotgun',
  'sniper',
  'lmg',
];

export interface RarityModifier {
  readonly damageMult: number;
  readonly magazineMult: number;
  readonly reloadMult: number;
  readonly spreadMult: number;
}

/** Deliberately gentle so rarity is a nice-to-have, not a match decider. */
export const RARITY_MODIFIERS: Record<Rarity, RarityModifier> = {
  [Rarity.Common]: { damageMult: 1.0, magazineMult: 1.0, reloadMult: 1.0, spreadMult: 1.0 },
  [Rarity.Uncommon]: { damageMult: 1.06, magazineMult: 1.0, reloadMult: 0.95, spreadMult: 0.94 },
  [Rarity.Rare]: { damageMult: 1.12, magazineMult: 1.15, reloadMult: 0.9, spreadMult: 0.86 },
  [Rarity.Epic]: { damageMult: 1.2, magazineMult: 1.3, reloadMult: 0.82, spreadMult: 0.76 },
};

export const RARITY_ORDER: readonly Rarity[] = [
  Rarity.Common,
  Rarity.Uncommon,
  Rarity.Rare,
  Rarity.Epic,
];

export const rarityRank = (r: Rarity): number => RARITY_ORDER.indexOf(r);

export const AMMO_LABEL: Record<AmmoType, string> = {
  [AmmoType.None]: '--',
  [AmmoType.Light]: 'Light',
  [AmmoType.Medium]: 'Medium',
  [AmmoType.Shells]: 'Shells',
  [AmmoType.Sniper]: 'Sniper',
};

export const AMMO_COLOR: Record<AmmoType, number> = {
  [AmmoType.None]: 0x8d949c,
  [AmmoType.Light]: 0xf0c674,
  [AmmoType.Medium]: 0x7fbf5f,
  [AmmoType.Shells]: 0xe06a5a,
  [AmmoType.Sniper]: 0x6f8ff0,
};

/** Max reserve ammo a combatant can carry per type. */
export const AMMO_CAPACITY: Record<AmmoType, number> = {
  [AmmoType.None]: 0,
  [AmmoType.Light]: 240,
  [AmmoType.Medium]: 180,
  [AmmoType.Shells]: 48,
  [AmmoType.Sniper]: 36,
};

/** How much a single ground pickup gives. */
export const AMMO_PICKUP_AMOUNT: Record<AmmoType, number> = {
  [AmmoType.None]: 0,
  [AmmoType.Light]: 40,
  [AmmoType.Medium]: 30,
  [AmmoType.Shells]: 8,
  [AmmoType.Sniper]: 6,
};
