import Phaser from 'phaser';
import { ARMOR, RARITY_COLOR, RARITY_LABEL } from '../config/GameConfig';
import { AMMO_CAPACITY, AMMO_LABEL } from '../config/WeaponConfig';
import { TEX_SCALE } from '../graphics/TextureFactory';
import { AmmoType, ArmorLevel, Depth, weaponTexture } from '../utils/Constants';
import { SLOT_MELEE, SLOT_PRIMARY, SLOT_SECONDARY } from '../entities/Inventory';
import type { MatchContext } from '../systems/MatchContext';

const FONT = 'Trebuchet MS, Segoe UI, sans-serif';
const PANEL_W = 420;
const PANEL_H = 300;

/**
 * Tab-toggled loadout panel. Intentionally a flat read-only summary rather than a
 * drag-and-drop grid - the game is meant to be played without pausing to manage bags.
 */
export class InventoryUI {
  private readonly container: Phaser.GameObjects.Container;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly slotTexts: Phaser.GameObjects.Text[] = [];
  private readonly slotIcons: Phaser.GameObjects.Image[] = [];
  private readonly ammoText: Phaser.GameObjects.Text;
  private readonly gearText: Phaser.GameObjects.Text;
  private readonly hintText: Phaser.GameObjects.Text;
  private open = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: MatchContext,
  ) {
    this.panel = scene.add.graphics();
    this.title = this.text(24, 18, 'LOADOUT', 20, '#f4d03f', 'bold');
    this.ammoText = this.text(24, 176, '', 13, '#c8d4e0');
    this.gearText = this.text(230, 176, '', 13, '#c8d4e0');
    this.hintText = this.text(24, PANEL_H - 32, 'TAB close   ·   1 / 2 / 3 switch   ·   Q heal', 12, '#7d8b9c');

    for (let i = 0; i < 3; i++) {
      this.slotIcons.push(
        scene.add.image(52, 74 + i * 34, weaponTexture('knife')).setScale(TEX_SCALE * 0.6),
      );
      this.slotTexts.push(this.text(84, 64 + i * 34, '', 14, '#ffffff'));
    }

    this.container = scene.add
      .container(0, 0, [
        this.panel,
        this.title,
        ...this.slotIcons,
        ...this.slotTexts,
        this.ammoText,
        this.gearText,
        this.hintText,
      ])
      .setDepth(Depth.Debug + 2)
      .setVisible(false);

    this.draw();
    this.layout();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
  }

  private text(
    x: number,
    y: number,
    value: string,
    size: number,
    color: string,
    style: '' | 'bold' = '',
  ): Phaser.GameObjects.Text {
    const t = this.scene.add.text(x, y, value, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      color,
      fontStyle: style,
    });
    t.setShadow(0, 1, '#000000', 2);
    return t;
  }

  private draw(): void {
    this.panel.clear();
    this.panel.fillStyle(0x0b111a, 0.94);
    this.panel.fillRoundedRect(0, 0, PANEL_W, PANEL_H, 14);
    this.panel.lineStyle(2, 0x2a3a4d, 1);
    this.panel.strokeRoundedRect(0, 0, PANEL_W, PANEL_H, 14);
  }

  private layout(): void {
    this.container.setPosition(
      Math.round(this.scene.scale.width / 2 - PANEL_W / 2),
      Math.round(this.scene.scale.height / 2 - PANEL_H / 2),
    );
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.container.setVisible(open);
    if (open) this.refresh();
  }

  get isOpen(): boolean {
    return this.open;
  }

  refresh(): void {
    const player = this.ctx.player;
    if (!player) return;
    const inv = player.inventory;
    const slots = [SLOT_PRIMARY, SLOT_SECONDARY, SLOT_MELEE];
    const names = ['PRIMARY', 'SECONDARY', 'MELEE'];

    slots.forEach((slot, i) => {
      const weapon = inv.weaponAt(slot);
      const icon = this.slotIcons[i];
      const label = this.slotTexts[i];
      if (!icon || !label) return;
      if (!weapon) {
        icon.setVisible(false);
        label.setText(`${names[i]}   —  empty`).setColor('#5f6c7a');
        return;
      }
      icon.setVisible(true).setTexture(weaponTexture(weapon.id));
      const rarity = weapon.isMelee ? '' : ` · ${RARITY_LABEL[weapon.rarity] ?? ''}`;
      const ammo = weapon.usesAmmo ? `   ${weapon.ammoInMag}/${inv.reserveFor(weapon)}` : '';
      label
        .setText(`${names[i]}  ${weapon.name}${rarity}${ammo}`)
        .setColor(
          weapon.isMelee
            ? '#c8d4e0'
            : `#${(RARITY_COLOR[weapon.rarity] ?? 0xffffff).toString(16).padStart(6, '0')}`,
        );
    });

    const ammoLines = [AmmoType.Light, AmmoType.Medium, AmmoType.Shells, AmmoType.Sniper]
      .map((t) => `${AMMO_LABEL[t]}: ${inv.ammo[t]} / ${AMMO_CAPACITY[t]}`)
      .join('\n');
    this.ammoText.setText(`AMMO\n${ammoLines}`);

    const armorLine =
      inv.armorLevel === ArmorLevel.None
        ? 'Armor: none'
        : `Armor: L${inv.armorLevel} (${Math.ceil(inv.armorDurability)}/${ARMOR.durability[inv.armorLevel]})`;
    const helmetLine =
      inv.helmetLevel === ArmorLevel.None ? 'Helmet: none' : `Helmet: L${inv.helmetLevel}`;
    this.gearText.setText(
      `GEAR\n${armorLine}\n${helmetLine}\nBandages: ${inv.bandages}\nMedkits: ${inv.medkits}`,
    );
  }

  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.container.destroy(true);
  }
}
