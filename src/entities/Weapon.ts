import { RARITY_MODIFIERS, WEAPONS } from '../config/WeaponConfig';
import type { WeaponId, WeaponStats } from '../config/WeaponConfig';
import { AmmoType, Rarity, WeaponType } from '../utils/Constants';

/**
 * A concrete weapon instance. Base stats come from WeaponConfig; rarity applies a
 * modest multiplier on top. Fire/reload timing state lives here so bots and the player
 * share exactly the same weapon behaviour.
 */
export class Weapon {
  readonly base: WeaponStats;
  readonly damage: number;
  readonly magazineSize: number;
  readonly reloadMs: number;
  readonly spreadDeg: number;

  ammoInMag: number;
  /** Timestamp (scene time) when this weapon may fire again. */
  nextShotAt = 0;
  reloading = false;
  reloadEndsAt = 0;
  reloadStartedAt = 0;
  /** Remaining shots in the current burst. */
  burstRemaining = 0;
  /** Accumulated recoil in radians, decays over time. */
  recoil = 0;

  constructor(
    readonly id: WeaponId,
    readonly rarity: Rarity = Rarity.Common,
    fullMag = true,
  ) {
    this.base = WEAPONS[id];
    const mod = RARITY_MODIFIERS[rarity];
    this.damage = Math.round(this.base.damage * mod.damageMult * 10) / 10;
    this.magazineSize = Math.max(0, Math.round(this.base.magazine * mod.magazineMult));
    this.reloadMs = Math.round(this.base.reloadMs * mod.reloadMult);
    this.spreadDeg = this.base.spreadDeg * mod.spreadMult;
    this.ammoInMag = fullMag ? this.magazineSize : 0;
  }

  get name(): string {
    return this.base.name;
  }

  get shortName(): string {
    return this.base.shortName;
  }

  get type(): WeaponType {
    return this.base.type;
  }

  get ammoType(): AmmoType {
    return this.base.ammo;
  }

  get isMelee(): boolean {
    return this.base.type === WeaponType.Melee;
  }

  get usesAmmo(): boolean {
    return this.base.ammo !== AmmoType.None;
  }

  get isEmpty(): boolean {
    return this.usesAmmo && this.ammoInMag <= 0;
  }

  /** 0..1 progress through an active reload. */
  reloadProgress(now: number): number {
    if (!this.reloading) return 0;
    const total = this.reloadEndsAt - this.reloadStartedAt;
    if (total <= 0) return 1;
    return Math.min(1, (now - this.reloadStartedAt) / total);
  }

  canFire(now: number): boolean {
    if (this.reloading) return false;
    if (now < this.nextShotAt) return false;
    return !this.isEmpty;
  }

  /** Registers a shot and returns the time cost, handling burst cadence. */
  registerShot(now: number): void {
    if (this.usesAmmo) this.ammoInMag = Math.max(0, this.ammoInMag - 1);
    this.recoil += (this.base.recoilDeg * Math.PI) / 180;
    if (this.base.burst > 1) {
      if (this.burstRemaining <= 0) this.burstRemaining = this.base.burst;
      this.burstRemaining--;
      this.nextShotAt =
        this.burstRemaining > 0 ? now + this.base.burstDelayMs : now + this.base.fireRateMs;
    } else {
      this.nextShotAt = now + this.base.fireRateMs;
    }
  }

  startReload(now: number, reserve: number): boolean {
    if (!this.usesAmmo || this.reloading) return false;
    if (this.ammoInMag >= this.magazineSize) return false;
    if (reserve <= 0) return false;
    this.reloading = true;
    this.reloadStartedAt = now;
    this.reloadEndsAt = now + this.reloadMs;
    this.burstRemaining = 0;
    return true;
  }

  cancelReload(): void {
    this.reloading = false;
  }

  /** Completes a pending reload; returns how much reserve ammo was consumed. */
  finishReload(reserve: number): number {
    this.reloading = false;
    const needed = Math.max(0, this.magazineSize - this.ammoInMag);
    const taken = Math.min(needed, reserve);
    this.ammoInMag += taken;
    return taken;
  }

  /** Recoil decays toward zero; call every frame. */
  decayRecoil(deltaMs: number): void {
    if (this.recoil === 0) return;
    const decay = Math.exp(-deltaMs / 90);
    this.recoil *= decay;
    if (Math.abs(this.recoil) < 0.0005) this.recoil = 0;
  }

  clone(): Weapon {
    const w = new Weapon(this.id, this.rarity, false);
    w.ammoInMag = this.ammoInMag;
    return w;
  }
}
