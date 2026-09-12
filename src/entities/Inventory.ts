import { AMMO_CAPACITY } from '../config/WeaponConfig';
import { ARMOR, HEAL } from '../config/GameConfig';
import { AmmoType, ArmorLevel } from '../utils/Constants';
import { Weapon } from './Weapon';

export type SlotIndex = 0 | 1 | 2;
export const SLOT_PRIMARY: SlotIndex = 0;
export const SLOT_SECONDARY: SlotIndex = 1;
export const SLOT_MELEE: SlotIndex = 2;

/**
 * Arcade-simple loadout: two gun slots, a permanent melee slot, ammo pools and heals.
 * Shared by the player and every bot so pickup rules are identical for both.
 */
export class Inventory {
  primary: Weapon | null = null;
  secondary: Weapon | null = null;
  melee: Weapon = new Weapon('knife');
  activeSlot: SlotIndex = SLOT_MELEE;

  readonly ammo: Record<AmmoType, number> = {
    [AmmoType.None]: 0,
    [AmmoType.Light]: 0,
    [AmmoType.Medium]: 0,
    [AmmoType.Shells]: 0,
    [AmmoType.Sniper]: 0,
  };

  bandages = 0;
  medkits = 0;

  armorLevel: ArmorLevel = ArmorLevel.None;
  armorDurability = 0;
  helmetLevel: ArmorLevel = ArmorLevel.None;
  helmetDurability = 0;

  get activeWeapon(): Weapon {
    if (this.activeSlot === SLOT_PRIMARY && this.primary) return this.primary;
    if (this.activeSlot === SLOT_SECONDARY && this.secondary) return this.secondary;
    return this.melee;
  }

  weaponAt(slot: SlotIndex): Weapon | null {
    if (slot === SLOT_PRIMARY) return this.primary;
    if (slot === SLOT_SECONDARY) return this.secondary;
    return this.melee;
  }

  get hasGun(): boolean {
    return this.primary !== null || this.secondary !== null;
  }

  /** Switches slots, skipping empty gun slots. Returns true when the slot changed. */
  selectSlot(slot: SlotIndex): boolean {
    if (slot === this.activeSlot) return false;
    if (slot !== SLOT_MELEE && this.weaponAt(slot) === null) return false;
    this.activeSlot = slot;
    return true;
  }

  /** Cycles to the next slot that actually holds something. */
  cycleSlot(direction = 1): boolean {
    const order: SlotIndex[] = [SLOT_PRIMARY, SLOT_SECONDARY, SLOT_MELEE];
    const available = order.filter((s) => this.weaponAt(s) !== null);
    if (available.length <= 1) return false;
    const idx = available.indexOf(this.activeSlot);
    const next = available[(idx + direction + available.length) % available.length] as SlotIndex;
    return this.selectSlot(next);
  }

  /** First free gun slot, or null when both are taken. */
  freeGunSlot(): SlotIndex | null {
    if (this.primary === null) return SLOT_PRIMARY;
    if (this.secondary === null) return SLOT_SECONDARY;
    return null;
  }

  /**
   * Puts a gun into a slot. Returns the weapon that was displaced (if any) so the
   * caller can drop it on the ground.
   */
  equip(weapon: Weapon, slot: SlotIndex): Weapon | null {
    if (slot === SLOT_MELEE) return weapon;
    const previous = slot === SLOT_PRIMARY ? this.primary : this.secondary;
    if (slot === SLOT_PRIMARY) this.primary = weapon;
    else this.secondary = weapon;
    return previous;
  }

  reserveFor(weapon: Weapon): number {
    return this.ammo[weapon.ammoType] ?? 0;
  }

  /** Adds ammo up to the carry cap; returns the amount that did not fit. */
  addAmmo(type: AmmoType, amount: number): number {
    if (type === AmmoType.None) return amount;
    const cap = AMMO_CAPACITY[type];
    const space = cap - this.ammo[type];
    const taken = Math.max(0, Math.min(space, amount));
    this.ammo[type] += taken;
    return amount - taken;
  }

  takeAmmo(type: AmmoType, amount: number): number {
    const taken = Math.min(this.ammo[type], amount);
    this.ammo[type] -= taken;
    return taken;
  }

  hasAmmoSpace(type: AmmoType): boolean {
    if (type === AmmoType.None) return false;
    return this.ammo[type] < AMMO_CAPACITY[type];
  }

  addBandages(count: number): number {
    const space = HEAL.bandage.maxCarry - this.bandages;
    const taken = Math.max(0, Math.min(space, count));
    this.bandages += taken;
    return count - taken;
  }

  addMedkits(count: number): number {
    const space = HEAL.medkit.maxCarry - this.medkits;
    const taken = Math.max(0, Math.min(space, count));
    this.medkits += taken;
    return count - taken;
  }

  /** Equips body armor when it is an upgrade. Returns true when taken. */
  equipArmor(level: ArmorLevel): boolean {
    if (level <= this.armorLevel) return false;
    this.armorLevel = level;
    this.armorDurability = ARMOR.durability[level] ?? 0;
    return true;
  }

  equipHelmet(level: ArmorLevel): boolean {
    if (level <= this.helmetLevel) return false;
    this.helmetLevel = level;
    this.helmetDurability = ARMOR.helmetDurability[level] ?? 0;
    return true;
  }

  get armorPercent(): number {
    const max = ARMOR.durability[this.armorLevel] ?? 0;
    if (max <= 0) return 0;
    return this.armorDurability / max;
  }

  /** Total reserve + magazine ammo for the active weapon, for AI decisions. */
  totalAmmoFor(weapon: Weapon | null): number {
    if (!weapon || !weapon.usesAmmo) return Infinity;
    return weapon.ammoInMag + this.reserveFor(weapon);
  }
}
