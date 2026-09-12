import Phaser from 'phaser';
import { PALETTE, RARITY_COLOR, RARITY_LABEL } from '../config/GameConfig';
import { LOOT_VISUAL } from '../config/LootConfig';
import { AMMO_COLOR, AMMO_LABEL } from '../config/WeaponConfig';
import { TEX_SCALE } from '../graphics/TextureFactory';
import { AmmoType, ArmorLevel, Depth, LootType, Tex, weaponTexture } from '../utils/Constants';
import { Weapon } from './Weapon';

export type LootPayload =
  | { kind: LootType.Weapon; weapon: Weapon }
  | { kind: LootType.Ammo; ammo: AmmoType; amount: number }
  | { kind: LootType.Armor; level: ArmorLevel }
  | { kind: LootType.Helmet; level: ArmorLevel }
  | { kind: LootType.Bandage; count: number }
  | { kind: LootType.Medkit; count: number };

const ARMOR_NAME = ['', 'Level 1 Armor', 'Level 2 Armor', 'Level 3 Armor'];
const HELMET_NAME = ['', 'Level 1 Helmet', 'Level 2 Helmet', 'Level 3 Helmet'];

/** A pickup lying on the ground. Cheap container of a pad, an icon and a glow. */
export class LootItem extends Phaser.GameObjects.Container {
  consumed = false;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly pad: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly countText: Phaser.GameObjects.Text | null = null;
  private nameLabel: Phaser.GameObjects.Text | null = null;
  private bobSeed: number;
  private highlighted = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly payload: LootPayload,
  ) {
    super(scene, x, y);
    this.bobSeed = Math.random() * Math.PI * 2;

    const color = this.accentColor();
    this.glow = scene.add
      .image(0, 0, Tex.SoftGlow)
      .setScale(TEX_SCALE * 1.15)
      .setTint(color)
      .setAlpha(0.32);
    this.pad = scene.add.image(0, 0, Tex.LootPad).setScale(TEX_SCALE * 0.82).setTint(color);
    this.icon = scene.add.image(0, -2, this.iconTexture()).setScale(this.iconScale());
    if (this.iconTint() !== null) this.icon.setTint(this.iconTint() as number);

    this.add([this.glow, this.pad, this.icon]);

    const count = this.stackCount();
    if (count > 1) {
      this.countText = scene.add
        .text(12, 8, `x${count}`, {
          fontFamily: 'Trebuchet MS, sans-serif',
          fontSize: '11px',
          color: '#ffffff',
        })
        .setOrigin(0.5, 0.5);
      this.countText.setShadow(0, 1, '#000000', 2);
      this.add(this.countText);
    }

    this.setDepth(Depth.Loot);
    scene.add.existing(this);
  }

  /** Cosmetic float; called from LootSystem for on-screen items only. */
  animate(time: number): void {
    const bob = Math.sin(time * LOOT_VISUAL.bobSpeed + this.bobSeed) * LOOT_VISUAL.bobAmplitude;
    this.icon.y = -2 + bob;
    this.glow.setAlpha(0.28 + Math.sin(time * 0.004 + this.bobSeed) * 0.08);
    if (this.highlighted) {
      this.pad.setScale(TEX_SCALE * (0.9 + Math.sin(time * 0.012) * 0.05));
    }
  }

  setHighlighted(on: boolean): void {
    if (this.highlighted === on) return;
    this.highlighted = on;
    this.pad.setAlpha(on ? 1 : 0.85);
    this.pad.setScale(TEX_SCALE * (on ? 0.92 : 0.82));
    this.glow.setAlpha(on ? 0.5 : 0.32);

    // Only the item you are about to take is labelled - never a wall of floating text.
    if (on && !this.nameLabel) {
      const p = this.payload;
      const rarity = p.kind === LootType.Weapon ? (RARITY_LABEL[p.weapon.rarity] ?? '') : '';
      const color = this.accentColor();
      this.nameLabel = this.scene.add
        .text(0, -26, rarity ? `${this.label}
${rarity.toUpperCase()}` : this.label, {
          fontFamily: 'Trebuchet MS, sans-serif',
          fontSize: '12px',
          color: `#${color.toString(16).padStart(6, '0')}`,
          align: 'center',
          lineSpacing: 1,
        })
        .setOrigin(0.5, 1);
      this.nameLabel.setShadow(0, 2, '#000000', 3);
      this.add(this.nameLabel);
    }
    this.nameLabel?.setVisible(on);
  }

  /** Plays the drop animation used when loot falls from a corpse. */
  playDropAnimation(): void {
    this.setScale(0.2);
    this.scene.tweens.add({
      targets: this,
      scale: 1,
      duration: 260,
      ease: 'Back.easeOut',
    });
  }

  // ------------------------------------------------------------------ description

  get label(): string {
    const p = this.payload;
    switch (p.kind) {
      case LootType.Weapon:
        return p.weapon.name;
      case LootType.Ammo:
        return `${AMMO_LABEL[p.ammo]} Ammo x${p.amount}`;
      case LootType.Armor:
        return ARMOR_NAME[p.level] ?? 'Armor';
      case LootType.Helmet:
        return HELMET_NAME[p.level] ?? 'Helmet';
      case LootType.Bandage:
        return p.count > 1 ? `Bandage x${p.count}` : 'Bandage';
      case LootType.Medkit:
        return p.count > 1 ? `Medkit x${p.count}` : 'Medkit';
      default:
        return 'Item';
    }
  }

  /** Ammo and consumables are hoovered up on contact; weapons/armor need a keypress. */
  get isAutoPickup(): boolean {
    return this.payload.kind === LootType.Ammo;
  }

  private stackCount(): number {
    const p = this.payload;
    if (p.kind === LootType.Bandage || p.kind === LootType.Medkit) return p.count;
    return 1;
  }

  private accentColor(): number {
    const p = this.payload;
    switch (p.kind) {
      case LootType.Weapon:
        return RARITY_COLOR[p.weapon.rarity] ?? PALETTE.ui;
      case LootType.Ammo:
        return AMMO_COLOR[p.ammo];
      case LootType.Armor:
      case LootType.Helmet:
        return p.level >= ArmorLevel.Three ? 0xb85fe0 : p.level === ArmorLevel.Two ? 0x4aa3e0 : 0x5fd36b;
      case LootType.Bandage:
        return 0xe8e2d0;
      case LootType.Medkit:
        return 0xe05c5c;
      default:
        return PALETTE.ui;
    }
  }

  private iconTexture(): string {
    const p = this.payload;
    switch (p.kind) {
      case LootType.Weapon:
        return weaponTexture(p.weapon.id);
      case LootType.Ammo:
        return Tex.AmmoBox;
      case LootType.Armor:
        return Tex.Vest;
      case LootType.Helmet:
        return Tex.HelmetIcon;
      case LootType.Bandage:
        return Tex.BandageIcon;
      case LootType.Medkit:
      default:
        return Tex.MedkitIcon;
    }
  }

  private iconScale(): number {
    const p = this.payload;
    if (p.kind === LootType.Weapon) return TEX_SCALE * 0.62;
    return TEX_SCALE * 0.72;
  }

  private iconTint(): number | null {
    const p = this.payload;
    if (p.kind === LootType.Ammo) return AMMO_COLOR[p.ammo];
    if (p.kind === LootType.Armor || p.kind === LootType.Helmet) {
      return p.level >= ArmorLevel.Three ? 0xcf9bf0 : p.level === ArmorLevel.Two ? 0x8ec9f0 : 0x9ee0a4;
    }
    return null;
  }
}
