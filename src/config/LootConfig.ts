import { AmmoType, ArmorLevel, LootType, Rarity } from '../utils/Constants';
import type { WeaponId } from './WeaponConfig';

/** Loot points are tagged by the richness of the area they belong to. */
export enum LootTier {
  Sparse = 'sparse',
  Normal = 'normal',
  Rich = 'rich',
}

export interface LootRoll {
  readonly type: LootType;
  readonly weight: number;
}

/**
 * Per-match loot flavour. Kept to three coarse options so the game still feels learnable:
 * players notice "lots of guns" or "thin pickings" without needing it explained.
 */
export type LootProfile = 'balanced' | 'weaponRich' | 'scarce';

export const LOOT_PROFILES: Record<LootProfile, { spawnMult: number; weaponBias: number }> = {
  balanced: { spawnMult: 1, weaponBias: 1 },
  weaponRich: { spawnMult: 1.08, weaponBias: 1.5 },
  scarce: { spawnMult: 0.82, weaponBias: 0.9 },
};

/** Chance a given loot point actually spawns something this match. */
export const LOOT_SPAWN_CHANCE: Record<LootTier, number> = {
  [LootTier.Sparse]: 0.55,
  [LootTier.Normal]: 0.78,
  [LootTier.Rich]: 0.95,
};

export const LOOT_TABLE: Record<LootTier, readonly LootRoll[]> = {
  [LootTier.Sparse]: [
    { type: LootType.Weapon, weight: 22 },
    { type: LootType.Ammo, weight: 34 },
    { type: LootType.Bandage, weight: 22 },
    { type: LootType.Medkit, weight: 6 },
    { type: LootType.Armor, weight: 11 },
    { type: LootType.Helmet, weight: 5 },
  ],
  [LootTier.Normal]: [
    { type: LootType.Weapon, weight: 30 },
    { type: LootType.Ammo, weight: 30 },
    { type: LootType.Bandage, weight: 17 },
    { type: LootType.Medkit, weight: 7 },
    { type: LootType.Armor, weight: 11 },
    { type: LootType.Helmet, weight: 5 },
  ],
  [LootTier.Rich]: [
    { type: LootType.Weapon, weight: 37 },
    { type: LootType.Ammo, weight: 24 },
    { type: LootType.Bandage, weight: 12 },
    { type: LootType.Medkit, weight: 10 },
    { type: LootType.Armor, weight: 11 },
    { type: LootType.Helmet, weight: 6 },
  ],
};

export const WEAPON_WEIGHTS: Record<LootTier, ReadonlyArray<{ value: WeaponId; weight: number }>> = {
  [LootTier.Sparse]: [
    { value: 'pistol', weight: 34 },
    { value: 'smg', weight: 24 },
    { value: 'shotgun', weight: 18 },
    { value: 'ar', weight: 12 },
    { value: 'burst', weight: 7 },
    { value: 'lmg', weight: 3 },
    { value: 'sniper', weight: 2 },
  ],
  [LootTier.Normal]: [
    { value: 'pistol', weight: 20 },
    { value: 'smg', weight: 22 },
    { value: 'shotgun', weight: 18 },
    { value: 'ar', weight: 20 },
    { value: 'burst', weight: 10 },
    { value: 'lmg', weight: 5 },
    { value: 'sniper', weight: 5 },
  ],
  [LootTier.Rich]: [
    { value: 'pistol', weight: 6 },
    { value: 'smg', weight: 15 },
    { value: 'shotgun', weight: 16 },
    { value: 'ar', weight: 24 },
    { value: 'burst', weight: 14 },
    { value: 'lmg', weight: 12 },
    { value: 'sniper', weight: 13 },
  ],
};

export const RARITY_WEIGHTS: Record<LootTier, ReadonlyArray<{ value: Rarity; weight: number }>> = {
  [LootTier.Sparse]: [
    { value: Rarity.Common, weight: 66 },
    { value: Rarity.Uncommon, weight: 26 },
    { value: Rarity.Rare, weight: 7 },
    { value: Rarity.Epic, weight: 1 },
  ],
  [LootTier.Normal]: [
    { value: Rarity.Common, weight: 48 },
    { value: Rarity.Uncommon, weight: 33 },
    { value: Rarity.Rare, weight: 15 },
    { value: Rarity.Epic, weight: 4 },
  ],
  [LootTier.Rich]: [
    { value: Rarity.Common, weight: 22 },
    { value: Rarity.Uncommon, weight: 33 },
    { value: Rarity.Rare, weight: 30 },
    { value: Rarity.Epic, weight: 15 },
  ],
};

export const ARMOR_WEIGHTS: Record<LootTier, ReadonlyArray<{ value: ArmorLevel; weight: number }>> = {
  [LootTier.Sparse]: [
    { value: ArmorLevel.One, weight: 72 },
    { value: ArmorLevel.Two, weight: 25 },
    { value: ArmorLevel.Three, weight: 3 },
  ],
  [LootTier.Normal]: [
    { value: ArmorLevel.One, weight: 52 },
    { value: ArmorLevel.Two, weight: 37 },
    { value: ArmorLevel.Three, weight: 11 },
  ],
  [LootTier.Rich]: [
    { value: ArmorLevel.One, weight: 24 },
    { value: ArmorLevel.Two, weight: 44 },
    { value: ArmorLevel.Three, weight: 32 },
  ],
};

export const AMMO_WEIGHTS: ReadonlyArray<{ value: AmmoType; weight: number }> = [
  { value: AmmoType.Light, weight: 36 },
  { value: AmmoType.Medium, weight: 34 },
  { value: AmmoType.Shells, weight: 17 },
  { value: AmmoType.Sniper, weight: 13 },
];

export const LOOT_VISUAL = {
  padRadius: 17,
  bobAmplitude: 2.4,
  bobSpeed: 0.0032,
  pickupRadius: 46,
  /** Ammo/heals are hoovered up automatically inside this radius when there is room. */
  autoPickupRadius: 34,
  highlightRadius: 58,
} as const;

/** Ammo handed out alongside a freshly looted weapon so it is immediately usable. */
export const WEAPON_STARTER_AMMO = 1.6;
