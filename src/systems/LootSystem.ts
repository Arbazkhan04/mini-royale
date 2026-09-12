import Phaser from 'phaser';
import { COMBAT, RARITY_COLOR } from '../config/GameConfig';
import {
  AMMO_WEIGHTS,
  ARMOR_WEIGHTS,
  LOOT_PROFILES,
  LOOT_SPAWN_CHANCE,
  LOOT_TABLE,
  LOOT_VISUAL,
  RARITY_WEIGHTS,
  WEAPON_STARTER_AMMO,
  WEAPON_WEIGHTS,
} from '../config/LootConfig';
import type { LootTier } from '../config/LootConfig';
import { AMMO_PICKUP_AMOUNT, WEAPONS } from '../config/WeaponConfig';
import type { WeaponId } from '../config/WeaponConfig';
import { AmmoType, ArmorLevel, GameEvent, LootType } from '../utils/Constants';
import { distanceSq } from '../utils/MathUtils';
import type { Combatant } from '../entities/Combatant';
import { LootItem } from '../entities/LootItem';
import type { LootPayload } from '../entities/LootItem';
import { SLOT_PRIMARY, SLOT_SECONDARY } from '../entities/Inventory';
import type { SlotIndex } from '../entities/Inventory';
import { Weapon } from '../entities/Weapon';
import type { MatchContext } from './MatchContext';

const GRID = 220;

export interface PickupPrompt {
  text: string;
  itemId: number;
}

/**
 * Ground loot: initial spawning, spatial lookup, pickup rules and death drops.
 * The same `applyPickup` path is used by the player and by bots.
 */
export class LootSystem {
  private readonly items: LootItem[] = [];
  private readonly grid = new Map<number, LootItem[]>();
  private ctx!: MatchContext;
  private currentPromptId = -1;
  private highlighted: LootItem | null = null;
  private nextItemId = 1;
  private readonly itemIds = new WeakMap<LootItem, number>();

  constructor(private readonly scene: Phaser.Scene) {}

  bind(ctx: MatchContext): void {
    this.ctx = ctx;
  }

  get count(): number {
    return this.items.length;
  }

  // ------------------------------------------------------------------ spawning

  /** Rolls the map's loot points into actual items. */
  spawnInitialLoot(): void {
    const rng = this.ctx.rng;
    const profile = LOOT_PROFILES[this.ctx.director.variant.lootProfile];
    for (const point of this.ctx.map.lootPoints) {
      if (rng.next() > LOOT_SPAWN_CHANCE[point.tier] * profile.spawnMult) continue;
      const payload = this.rollPayload(point.tier);
      this.spawn(point.x, point.y, payload);
    }
  }

  private rollPayload(tier: LootTier): LootPayload {
    const rng = this.ctx.rng;
    const bias = LOOT_PROFILES[this.ctx.director.variant.lootProfile].weaponBias;
    const type = rng.weighted(
      LOOT_TABLE[tier].map((entry) => ({
        value: entry.type,
        weight: entry.type === LootType.Weapon ? entry.weight * bias : entry.weight,
      })),
    );
    switch (type) {
      case LootType.Weapon: {
        const id = rng.weighted(WEAPON_WEIGHTS[tier] as Array<{ value: WeaponId; weight: number }>);
        const rarity = rng.weighted(RARITY_WEIGHTS[tier]);
        return { kind: LootType.Weapon, weapon: new Weapon(id, rarity) };
      }
      case LootType.Ammo: {
        const ammo = rng.weighted(AMMO_WEIGHTS);
        const base = AMMO_PICKUP_AMOUNT[ammo];
        return { kind: LootType.Ammo, ammo, amount: Math.round(base * rng.range(0.8, 1.3)) };
      }
      case LootType.Armor:
        return { kind: LootType.Armor, level: rng.weighted(ARMOR_WEIGHTS[tier]) };
      case LootType.Helmet:
        return { kind: LootType.Helmet, level: rng.weighted(ARMOR_WEIGHTS[tier]) };
      case LootType.Medkit:
        return { kind: LootType.Medkit, count: 1 };
      case LootType.Bandage:
      default:
        return { kind: LootType.Bandage, count: rng.int(1, 3) };
    }
  }

  spawn(x: number, y: number, payload: LootPayload): LootItem {
    const item = new LootItem(this.scene, x, y, payload);
    this.itemIds.set(item, this.nextItemId++);
    this.items.push(item);
    this.addToGrid(item);
    return item;
  }

  idOf(item: LootItem): number {
    return this.itemIds.get(item) ?? -1;
  }

  private cellKey(x: number, y: number): number {
    return Math.floor(y / GRID) * 4096 + Math.floor(x / GRID);
  }

  private addToGrid(item: LootItem): void {
    const key = this.cellKey(item.x, item.y);
    let bucket = this.grid.get(key);
    if (!bucket) {
      bucket = [];
      this.grid.set(key, bucket);
    }
    bucket.push(item);
  }

  private removeFromGrid(item: LootItem): void {
    const bucket = this.grid.get(this.cellKey(item.x, item.y));
    if (!bucket) return;
    const idx = bucket.indexOf(item);
    if (idx >= 0) bucket.splice(idx, 1);
  }

  /** All live items whose cell is within `radius` of a point. */
  queryNearby(x: number, y: number, radius: number): LootItem[] {
    const out: LootItem[] = [];
    const minX = Math.floor((x - radius) / GRID);
    const maxX = Math.floor((x + radius) / GRID);
    const minY = Math.floor((y - radius) / GRID);
    const maxY = Math.floor((y + radius) / GRID);
    const rSq = radius * radius;
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const bucket = this.grid.get(cy * 4096 + cx);
        if (!bucket) continue;
        for (const item of bucket) {
          if (item.consumed) continue;
          if (distanceSq(x, y, item.x, item.y) <= rSq) out.push(item);
        }
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ frame

  update(time: number): void {
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    for (const item of this.items) {
      if (item.consumed) continue;
      const onScreen =
        item.x > view.x - 120 &&
        item.x < view.right + 120 &&
        item.y > view.y - 120 &&
        item.y < view.bottom + 120;
      // Off-screen loot is hidden as well as un-animated: Phaser has no bounds culling,
      // so every visible object is transformed and batched every frame.
      if (item.visible !== onScreen) item.setVisible(onScreen);
      if (onScreen) item.animate(time);
    }

    // Ammo and consumables are hoovered up on contact for everyone.
    for (const c of this.ctx.combatants) {
      if (!c.alive) continue;
      const nearby = this.queryNearby(c.x, c.y, LOOT_VISUAL.autoPickupRadius);
      for (const item of nearby) {
        if (!item.isAutoPickup) continue;
        if (this.canAutoTake(c, item)) this.applyPickup(c, item);
      }
    }

    this.updatePlayerPrompt();
  }

  private canAutoTake(c: Combatant, item: LootItem): boolean {
    const p = item.payload;
    if (p.kind === LootType.Ammo) return c.inventory.hasAmmoSpace(p.ammo);
    return false;
  }

  private updatePlayerPrompt(): void {
    const player = this.ctx.player;
    if (!player || !player.alive) {
      this.setHighlight(null);
      if (this.currentPromptId !== -1) {
        this.currentPromptId = -1;
        this.ctx.events.emit(GameEvent.PlayerPromptChanged, null);
      }
      return;
    }
    const best = this.bestPickupFor(player, LOOT_VISUAL.pickupRadius);
    this.setHighlight(best);
    const id = best ? this.idOf(best) : -1;
    if (id === this.currentPromptId) return;
    this.currentPromptId = id;
    if (!best) {
      this.ctx.events.emit(GameEvent.PlayerPromptChanged, null);
      return;
    }
    const prompt: PickupPrompt = { text: this.promptTextFor(player, best), itemId: id };
    this.ctx.events.emit(GameEvent.PlayerPromptChanged, prompt);
  }

  /** Swapping is always spelled out, so nobody loses a gun by surprise. */
  private promptTextFor(c: Combatant, item: LootItem): string {
    const p = item.payload;
    if (p.kind === LootType.Weapon && c.inventory.freeGunSlot() === null) {
      const replaced = c.inventory.weaponAt(
        c.inventory.activeSlot === SLOT_SECONDARY ? SLOT_SECONDARY : SLOT_PRIMARY,
      );
      if (replaced) return `REPLACE ${replaced.shortName} WITH ${p.weapon.shortName}`;
    }
    return `Pick up ${item.label}`;
  }

  private setHighlight(item: LootItem | null): void {
    if (this.highlighted === item) return;
    this.highlighted?.setHighlighted(false);
    this.highlighted = item;
    this.highlighted?.setHighlighted(true);
  }

  // ------------------------------------------------------------------ pickup

  /** Best item a combatant would benefit from inside `radius`. */
  bestPickupFor(c: Combatant, radius: number): LootItem | null {
    const nearby = this.queryNearby(c.x, c.y, radius);
    let best: LootItem | null = null;
    let bestScore = -Infinity;
    for (const item of nearby) {
      const score = this.scoreFor(c, item);
      if (score <= 0) continue;
      const d = distanceSq(c.x, c.y, item.x, item.y);
      const total = score * 1000 - d * 0.01;
      if (total > bestScore) {
        bestScore = total;
        best = item;
      }
    }
    return best;
  }

  /** How useful an item is to a combatant right now. <= 0 means "ignore". */
  scoreFor(c: Combatant, item: LootItem): number {
    if (item.consumed) return 0;
    const inv = c.inventory;
    const p = item.payload;
    switch (p.kind) {
      case LootType.Weapon: {
        const free = inv.freeGunSlot();
        if (free !== null) return 100;
        const current = inv.primary;
        const other = inv.secondary;
        const incoming = this.weaponValue(p.weapon);
        const worst = Math.min(
          current ? this.weaponValue(current) : -1,
          other ? this.weaponValue(other) : -1,
        );
        return incoming > worst + 4 ? 85 : 8;
      }
      case LootType.Ammo:
        return inv.hasAmmoSpace(p.ammo) ? (this.needsAmmo(c, p.ammo) ? 40 : 15) : 0;
      case LootType.Armor:
        return p.level > inv.armorLevel ? 80 : 0;
      case LootType.Helmet:
        return p.level > inv.helmetLevel ? 60 : 0;
      case LootType.Bandage:
        return inv.bandages < 8 ? (c.health < 80 ? 50 : 20) : 0;
      case LootType.Medkit:
        return inv.medkits < 4 ? (c.health < 60 ? 52 : 26) : 0;
      default:
        return 0;
    }
  }

  private needsAmmo(c: Combatant, ammo: AmmoType): boolean {
    const inv = c.inventory;
    for (const weapon of [inv.primary, inv.secondary]) {
      if (weapon && weapon.ammoType === ammo) return inv.reserveFor(weapon) < weapon.magazineSize * 2;
    }
    return false;
  }

  /** Simple desirability score used for weapon comparisons by bots and swap prompts. */
  weaponValue(weapon: Weapon): number {
    const stats = WEAPONS[weapon.id];
    const rarityBonus = { common: 0, uncommon: 3, rare: 6, epic: 10 }[weapon.rarity] ?? 0;
    return stats.aiScore + rarityBonus;
  }

  /** Explicit pickup (E / bot decision). Returns true when something was taken. */
  tryPickup(c: Combatant): boolean {
    const item = this.bestPickupFor(c, LOOT_VISUAL.pickupRadius);
    if (!item) return false;
    return this.applyPickup(c, item);
  }

  applyPickup(c: Combatant, item: LootItem): boolean {
    if (item.consumed) return false;
    const inv = c.inventory;
    const p = item.payload;
    let taken = false;

    switch (p.kind) {
      case LootType.Weapon: {
        let slot = inv.freeGunSlot();
        if (slot === null) {
          slot = (inv.activeSlot === SLOT_SECONDARY ? SLOT_SECONDARY : SLOT_PRIMARY) as SlotIndex;
        }
        const replaced = inv.equip(p.weapon, slot);
        inv.addAmmo(p.weapon.ammoType, Math.round(p.weapon.magazineSize * WEAPON_STARTER_AMMO));
        if (replaced) {
          this.spawn(c.x + this.ctx.rng.range(-18, 18), c.y + this.ctx.rng.range(-18, 18), {
            kind: LootType.Weapon,
            weapon: replaced,
          }).playDropAnimation();
        }
        c.selectSlot(slot);
        taken = true;
        break;
      }
      case LootType.Ammo: {
        const leftover = inv.addAmmo(p.ammo, p.amount);
        if (leftover < p.amount) {
          taken = true;
          if (leftover > 0) {
            p.amount = leftover;
            return this.finishPartialPickup(c, false);
          }
        }
        break;
      }
      case LootType.Armor:
        taken = inv.equipArmor(p.level);
        break;
      case LootType.Helmet:
        taken = inv.equipHelmet(p.level);
        break;
      case LootType.Bandage: {
        const leftover = inv.addBandages(p.count);
        taken = leftover < p.count;
        if (leftover > 0) {
          p.count = leftover;
          return this.finishPartialPickup(c, taken);
        }
        break;
      }
      case LootType.Medkit: {
        const leftover = inv.addMedkits(p.count);
        taken = leftover < p.count;
        if (leftover > 0) {
          p.count = leftover;
          return this.finishPartialPickup(c, taken);
        }
        break;
      }
      default:
        break;
    }

    if (!taken) return false;
    this.consume(item, c);
    return true;
  }

  /** Item was only partly absorbed; it stays on the ground with the remainder. */
  private finishPartialPickup(c: Combatant, taken: boolean): boolean {
    if (taken) {
      this.ctx.audio.play('pickup', c.x, c.y, 0.7);
      if (c.isPlayer) this.ctx.events.emit(GameEvent.PlayerInventoryChanged, c.inventory, c.weapon);
    }
    return taken;
  }

  private consume(item: LootItem, by: Combatant): void {
    item.consumed = true;
    this.removeFromGrid(item);
    const idx = this.items.indexOf(item);
    if (idx >= 0) this.items.splice(idx, 1);
    if (this.highlighted === item) this.highlighted = null;

    const color =
      item.payload.kind === LootType.Weapon
        ? (RARITY_COLOR[item.payload.weapon.rarity] ?? 0xffffff)
        : 0xffffff;
    this.ctx.effects.lootPickup(item.x, item.y, color);
    this.ctx.audio.play('pickup', by.x, by.y, 0.8);
    item.destroy();

    if (by.isPlayer) {
      this.ctx.events.emit(GameEvent.PlayerInventoryChanged, by.inventory, by.weapon);
      this.ctx.events.emit(GameEvent.Notice, `Picked up ${item.label}`);
      this.currentPromptId = -1;
    }
  }

  // ------------------------------------------------------------------ drops

  /** Scatters a dead combatant's kit on the ground. */
  dropLootFrom(c: Combatant): void {
    const inv = c.inventory;
    const rng = this.ctx.rng;
    const drop = (payload: LootPayload): void => {
      let x = c.x + rng.range(-COMBAT.deathDropRadius, COMBAT.deathDropRadius);
      let y = c.y + rng.range(-COMBAT.deathDropRadius, COMBAT.deathDropRadius);
      if (this.ctx.collision.isPointBlocked(x, y, 12)) {
        x = c.x;
        y = c.y;
      }
      this.spawn(x, y, payload).playDropAnimation();
    };

    if (inv.primary) drop({ kind: LootType.Weapon, weapon: inv.primary });
    if (inv.secondary) drop({ kind: LootType.Weapon, weapon: inv.secondary });

    for (const ammo of [AmmoType.Light, AmmoType.Medium, AmmoType.Shells, AmmoType.Sniper]) {
      const held = inv.ammo[ammo];
      if (held <= 0) continue;
      const amount = Math.min(held, Math.round(AMMO_PICKUP_AMOUNT[ammo] * rng.range(0.6, 1.2)));
      if (amount > 0) drop({ kind: LootType.Ammo, ammo, amount });
    }

    if (inv.armorLevel > ArmorLevel.None && inv.armorPercent > 0.25) {
      drop({ kind: LootType.Armor, level: inv.armorLevel });
    }
    if (inv.helmetLevel > ArmorLevel.None) drop({ kind: LootType.Helmet, level: inv.helmetLevel });
    if (inv.bandages > 0) drop({ kind: LootType.Bandage, count: Math.min(inv.bandages, 3) });
    if (inv.medkits > 0) drop({ kind: LootType.Medkit, count: Math.min(inv.medkits, 2) });

    inv.primary = null;
    inv.secondary = null;
  }

  /** Minimap/debug access to live loot. */
  allItems(): readonly LootItem[] {
    return this.items;
  }

  reset(): void {
    for (const item of this.items) item.destroy();
    this.items.length = 0;
    this.grid.clear();
    this.highlighted = null;
    this.currentPromptId = -1;
  }
}
