import Phaser from 'phaser';
import { ARMOR, PALETTE, RARITY_COLOR, RARITY_LABEL, VIEW } from '../config/GameConfig';
import { AMMO_LABEL } from '../config/WeaponConfig';
import { TEX_SCALE } from '../graphics/TextureFactory';
import { ArmorLevel, Depth, GameEvent, NoiseKind, Tex, weaponTexture } from '../utils/Constants';
import { clamp, damp, formatTime } from '../utils/MathUtils';
import type { Inventory } from '../entities/Inventory';
import { SLOT_MELEE, SLOT_PRIMARY, SLOT_SECONDARY } from '../entities/Inventory';
import type { Weapon } from '../entities/Weapon';
import type { MatchContext } from '../systems/MatchContext';
import type { PickupPrompt } from '../systems/LootSystem';
import type { AbilityDef } from '../config/SignalConfig';
import type { NoiseCue } from '../systems/NoiseSystem';
import type { HintPayload } from '../systems/TutorialSystem';
import { minimapSizeFor } from './Minimap';

const FONT = 'Trebuchet MS, Segoe UI, sans-serif';
const ARMOR_NUMERALS = ['', 'I', 'II', 'III'];

interface HudMetrics {
  w: number;
  h: number;
  narrow: boolean;
  pad: number;
  vitalsW: number;
  vitalsH: number;
  countersW: number;
  zoneW: number;
  zoneH: number;
  weaponX: number;
  weaponY: number;
  weaponW: number;
  weaponH: number;
  slotSize: number;
  slotsX: number;
  slotsY: number;
  /** True when the slot row sits above the weapon block instead of beside it. */
  slotsStacked: boolean;
}

interface DamageArrow {
  image: Phaser.GameObjects.Image;
  angle: number;
  life: number;
}

/**
 * The in-match heads-up display: vitals, weapon and ammo, slots, alive/kill counters,
 * the zone timer, pickup prompts, notices and directional damage indicators.
 */
export class HUD {
  private readonly root: Phaser.GameObjects.Container;

  private readonly vitalsPanel: Phaser.GameObjects.Graphics;
  private readonly healthBar: Phaser.GameObjects.Graphics;
  private readonly healthText: Phaser.GameObjects.Text;
  private readonly armorText: Phaser.GameObjects.Text;
  private readonly helmetIcon: Phaser.GameObjects.Image;

  private readonly weaponPanel: Phaser.GameObjects.Graphics;
  private readonly weaponIcon: Phaser.GameObjects.Image;
  private readonly weaponName: Phaser.GameObjects.Text;
  private readonly weaponRarity: Phaser.GameObjects.Text;
  private readonly ammoText: Phaser.GameObjects.Text;
  private readonly ammoTypeText: Phaser.GameObjects.Text;
  private readonly progressBar: Phaser.GameObjects.Graphics;
  private readonly progressLabel: Phaser.GameObjects.Text;

  private readonly slotGraphics: Phaser.GameObjects.Graphics;
  private readonly slotIcons: Phaser.GameObjects.Image[] = [];
  private readonly slotLabels: Phaser.GameObjects.Text[] = [];

  private readonly countersPanel: Phaser.GameObjects.Graphics;
  private readonly aliveText: Phaser.GameObjects.Text;
  private readonly killsText: Phaser.GameObjects.Text;

  private readonly zonePanel: Phaser.GameObjects.Graphics;
  private readonly zoneLabel: Phaser.GameObjects.Text;
  private readonly zoneTimer: Phaser.GameObjects.Text;

  private readonly promptText: Phaser.GameObjects.Text;
  private readonly noticeText: Phaser.GameObjects.Text;
  private readonly healsText: Phaser.GameObjects.Text;

  private readonly damageEdge: Phaser.GameObjects.Graphics;
  private damageFlash = 0;
  private readonly lowHealthEdge: Phaser.GameObjects.Graphics;
  private readonly arrows: DamageArrow[] = [];

  // Signal ability chip
  private readonly abilityPanel: Phaser.GameObjects.Graphics;
  private readonly abilityIcon: Phaser.GameObjects.Image;
  private readonly abilityKey: Phaser.GameObjects.Text;
  private ability: AbilityDef | null = null;

  // Contextual teaching + sound awareness
  private readonly hintText: Phaser.GameObjects.Text;
  private hintUntil = 0;
  private readonly cueText: Phaser.GameObjects.Text;
  private readonly cueArrow: Phaser.GameObjects.Image;
  private cue: NoiseCue | null = null;
  private cueUntil = 0;

  // Final Signal capture readout
  private readonly finalPanel: Phaser.GameObjects.Graphics;
  private readonly finalText: Phaser.GameObjects.Text;

  private displayedHealth = 100;
  private targetHealth = 100;
  private noticeUntil = 0;
  private reloadProgress = 0;
  private healProgress = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: MatchContext,
  ) {
    this.root = scene.add.container(0, 0).setDepth(Depth.Debug);

    // Below the panels and minimap so a hit never washes out the readouts.
    this.damageEdge = scene.add.graphics().setDepth(Depth.Debug - 3);

    this.vitalsPanel = scene.add.graphics();
    this.healthBar = scene.add.graphics();
    this.healthText = this.makeText(0, 0, '100', 18, '#ffffff', 'bold');
    this.armorText = this.makeText(0, 0, '', 12, '#9fd6ff');
    this.helmetIcon = scene.add.image(0, 0, Tex.HelmetIcon).setScale(TEX_SCALE * 0.5).setVisible(false);

    this.weaponPanel = scene.add.graphics();
    this.weaponIcon = scene.add.image(0, 0, weaponTexture('knife')).setScale(TEX_SCALE * 0.8);
    this.weaponName = this.makeText(0, 0, 'Combat Knife', 15, '#ffffff', 'bold');
    this.weaponRarity = this.makeText(0, 0, '', 11, '#b7c0cc');
    this.ammoText = this.makeText(0, 0, '--', 24, '#ffffff', 'bold');
    this.ammoTypeText = this.makeText(0, 0, '', 11, '#8fa3b8');
    this.progressBar = scene.add.graphics();
    this.progressLabel = this.makeText(0, 0, '', 12, '#f4d03f', 'bold');

    this.slotGraphics = scene.add.graphics();
    for (let i = 0; i < 3; i++) {
      this.slotIcons.push(scene.add.image(0, 0, weaponTexture('knife')).setScale(TEX_SCALE * 0.5));
      this.slotLabels.push(this.makeText(0, 0, `${i + 1}`, 11, '#8fa3b8'));
    }

    this.countersPanel = scene.add.graphics();
    this.aliveText = this.makeText(0, 0, 'ALIVE 16', 15, '#ffffff', 'bold');
    this.killsText = this.makeText(0, 0, 'KILLS 0', 15, '#f4d03f', 'bold');

    this.zonePanel = scene.add.graphics();
    this.zoneLabel = this.makeText(0, 0, 'ZONE SHRINKING IN', 11, '#9fd6ff');
    this.zoneTimer = this.makeText(0, 0, '00:45', 20, '#ffffff', 'bold');

    this.lowHealthEdge = scene.add.graphics();

    this.abilityPanel = scene.add.graphics();
    this.abilityIcon = scene.add.image(0, 0, Tex.SignalShard).setScale(TEX_SCALE * 0.9).setVisible(false);
    this.abilityKey = this.makeText(0, 0, '', 10, '#9fd6ff', 'bold');
    this.abilityKey.setOrigin(0.5, 0.5).setVisible(false);

    this.hintText = this.makeText(0, 0, '', 14, '#9fd6ff', 'bold');
    this.cueText = this.makeText(0, 0, '', 13, '#ffd257', 'bold');
    this.cueArrow = scene.add
      .image(0, 0, Tex.Arrow)
      .setScale(TEX_SCALE * 0.9)
      .setTint(0xffd257)
      .setVisible(false);

    this.finalPanel = scene.add.graphics();
    this.finalText = this.makeText(0, 0, '', 13, '#9df5ff', 'bold');
    this.finalText.setOrigin(0.5, 0.5);

    this.promptText = this.makeText(0, 0, '', 15, '#ffffff', 'bold');
    this.noticeText = this.makeText(0, 0, '', 14, '#f4d03f');
    this.healsText = this.makeText(0, 0, '', 12, '#c8d4e0');

    this.root.add([
      this.vitalsPanel,
      this.healthBar,
      this.healthText,
      this.armorText,
      this.helmetIcon,
      this.weaponPanel,
      this.weaponIcon,
      this.weaponName,
      this.weaponRarity,
      this.ammoText,
      this.ammoTypeText,
      this.progressBar,
      this.progressLabel,
      this.slotGraphics,
      ...this.slotIcons,
      ...this.slotLabels,
      this.countersPanel,
      this.aliveText,
      this.killsText,
      this.zonePanel,
      this.zoneLabel,
      this.zoneTimer,
      this.promptText,
      this.noticeText,
      this.healsText,
      this.lowHealthEdge,
      this.abilityPanel,
      this.abilityIcon,
      this.abilityKey,
      this.hintText,
      this.cueArrow,
      this.cueText,
      this.finalPanel,
      this.finalText,
    ]);

    this.bindEvents();
    this.layout();

    // The UI scene starts after the combatants exist, so pull the opening loadout
    // rather than waiting for the next change event.
    const player = ctx.player;
    if (player) {
      this.onHealth(player.health, player.inventory);
      this.onInventory(player.inventory, player.weapon);
    }
  }

  private makeText(
    x: number,
    y: number,
    value: string,
    size: number,
    color: string,
    style: '' | 'bold' = '',
  ): Phaser.GameObjects.Text {
    const text = this.scene.add.text(x, y, value, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      color,
      fontStyle: style,
    });
    text.setShadow(0, 2, '#000000', 3, false, true);
    return text;
  }

  private bindEvents(): void {
    const events = this.ctx.events;
    events.on(GameEvent.PlayerHealthChanged, this.onHealth, this);
    events.on(GameEvent.PlayerInventoryChanged, this.onInventory, this);
    events.on(GameEvent.PlayerDamaged, this.onDamaged, this);
    events.on(GameEvent.PlayerPromptChanged, this.onPrompt, this);
    events.on(GameEvent.Notice, this.onNotice, this);
    events.on(GameEvent.AbilityChanged, this.onAbility, this);
    events.on(GameEvent.Hint, this.onHint, this);
    events.on(GameEvent.NoiseHeard, this.onNoise, this);
    events.on(GameEvent.PlayerReloadProgress, (p: number) => (this.reloadProgress = p));
    events.on(GameEvent.PlayerHealProgress, (p: number) => (this.healProgress = p));
    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
  }

  // ------------------------------------------------------------------ layout

  /** Single source of truth for HUD geometry, shared by layout and slot rendering. */
  private metrics(): HudMetrics {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const narrow = w < VIEW.narrowBreakpoint;
    const pad = narrow ? 10 : 20;
    const vitalsW = narrow ? 112 : 260;
    const vitalsH = narrow ? 54 : 62;
    const countersW = narrow ? 88 : 130;
    const zoneW = narrow ? 110 : 190;
    const zoneH = narrow ? 46 : 56;
    const weaponW = narrow ? 200 : 320;
    const weaponH = narrow ? 60 : 82;
    const slotSize = narrow ? 36 : 48;
    const weaponX = narrow ? pad : w / 2 - weaponW / 2;
    const weaponY = h - (narrow ? 78 : 108);
    // Slots normally sit beside the weapon block, but they move above it whenever that
    // would push them under the minimap (or under the thumb buttons on phones).
    const slotRowW = slotSize * 3 + 12;
    const rightLimit = w - (narrow ? 0 : minimapSizeFor(w) + 30);
    const fitsBeside = !narrow && weaponX + weaponW + 12 + slotRowW <= rightLimit;
    const slotsX = fitsBeside
      ? weaponX + weaponW + 12
      : narrow
        ? weaponX
        : w / 2 - slotRowW / 2;
    const slotsY = fitsBeside ? weaponY : weaponY - slotSize - 18;
    return {
      w, h, narrow, pad, vitalsW, vitalsH, countersW, zoneW, zoneH,
      weaponX, weaponY, weaponW, weaponH, slotSize, slotsX, slotsY,
      slotsStacked: !fitsBeside,
    };
  }

  layout(): void {
    const m = this.metrics();

    this.vitalsPanel.clear();
    this.panel(this.vitalsPanel, m.pad, m.pad, m.vitalsW, m.vitalsH);
    this.healthText.setFontSize(m.narrow ? 15 : 18).setPosition(m.pad + 12, m.pad + 6);
    this.armorText.setFontSize(m.narrow ? 10 : 12).setPosition(m.pad + 12, m.pad + m.vitalsH - 16);
    this.helmetIcon.setPosition(m.pad + m.vitalsW - 20, m.pad + 18);

    this.weaponPanel.clear();
    this.panel(this.weaponPanel, m.weaponX, m.weaponY, m.weaponW, m.weaponH);
    this.weaponIcon.setPosition(m.weaponX + (m.narrow ? 34 : 44), m.weaponY + m.weaponH / 2);
    this.weaponIcon.setScale(TEX_SCALE * (m.narrow ? 0.6 : 0.8));
    this.weaponName
      .setFontSize(m.narrow ? 12 : 15)
      .setPosition(m.weaponX + (m.narrow ? 64 : 84), m.weaponY + (m.narrow ? 8 : 10));
    this.weaponRarity
      .setFontSize(m.narrow ? 9 : 11)
      .setPosition(m.weaponX + (m.narrow ? 64 : 84), m.weaponY + (m.narrow ? 26 : 30));
    this.ammoText
      .setFontSize(m.narrow ? 18 : 24)
      .setOrigin(1, 0)
      .setPosition(m.weaponX + m.weaponW - 12, m.weaponY + (m.narrow ? 8 : 12));
    this.ammoTypeText
      .setOrigin(1, 0)
      .setPosition(m.weaponX + m.weaponW - 12, m.weaponY + (m.narrow ? 34 : 42));
    this.progressLabel.setOrigin(0.5, 1).setPosition(m.w / 2, m.weaponY - 8);

    for (let i = 0; i < 3; i++) {
      const x = m.slotsX + i * (m.slotSize + 6);
      this.slotIcons[i]?.setPosition(x + m.slotSize / 2, m.slotsY + m.slotSize / 2 + 6);
      this.slotLabels[i]?.setPosition(x + 5, m.slotsY + 3);
    }

    this.countersPanel.clear();
    this.panel(this.countersPanel, m.w - m.pad - m.countersW, m.pad, m.countersW, m.vitalsH);
    this.aliveText
      .setFontSize(m.narrow ? 12 : 15)
      .setPosition(m.w - m.pad - m.countersW + 10, m.pad + 7);
    this.killsText
      .setFontSize(m.narrow ? 12 : 15)
      .setPosition(m.w - m.pad - m.countersW + 10, m.pad + (m.narrow ? 28 : 33));

    this.zonePanel.clear();
    this.panel(this.zonePanel, m.w / 2 - m.zoneW / 2, m.pad, m.zoneW, m.zoneH);
    this.zoneLabel.setFontSize(m.narrow ? 9 : 11).setOrigin(0.5, 0).setPosition(m.w / 2, m.pad + 6);
    this.zoneTimer
      .setFontSize(m.narrow ? 16 : 20)
      .setOrigin(0.5, 0)
      .setPosition(m.w / 2, m.pad + (m.narrow ? 20 : 24));

    const promptY = m.slotsStacked ? m.slotsY - 12 : m.weaponY - 34;
    this.promptText.setFontSize(m.narrow ? 13 : 15).setOrigin(0.5, 1).setPosition(m.w / 2, promptY);
    this.noticeText
      .setFontSize(m.narrow ? 12 : 14)
      .setOrigin(0.5, 1)
      .setPosition(m.w / 2, promptY - 22);
    this.healsText
      .setFontSize(m.narrow ? 10 : 12)
      .setOrigin(0, 0)
      .setPosition(m.pad + 12, m.pad + m.vitalsH + 6);
    this.healsText.setWordWrapWidth(m.narrow ? Math.max(140, m.w * 0.55) : 420);

    // Ability chip: opposite the weapon slots so the bottom bar stays balanced.
    const chip = m.narrow ? 44 : 56;
    const chipX = m.narrow ? m.weaponX + m.weaponW + 10 : m.weaponX - 12 - chip;
    const chipY = m.weaponY + (m.weaponH - chip) / 2;
    this.abilityPanel.clear();
    if (this.ability) {
      this.abilityPanel.fillStyle(0x0d1420, 0.8);
      this.abilityPanel.fillRoundedRect(chipX, chipY, chip, chip, 10);
      this.abilityPanel.lineStyle(2, this.ability.color, 0.9);
      this.abilityPanel.strokeRoundedRect(chipX, chipY, chip, chip, 10);
    }
    this.abilityIcon.setPosition(chipX + chip / 2, chipY + chip / 2 - 4);
    this.abilityIcon.setScale(TEX_SCALE * (chip / 52));
    this.abilityKey.setPosition(chipX + chip / 2, chipY + chip - 9).setFontSize(m.narrow ? 8 : 10);

    this.hintText
      .setFontSize(m.narrow ? 12 : 14)
      .setOrigin(0.5, 1)
      .setPosition(m.w / 2, promptY - 44);

    this.finalText.setFontSize(m.narrow ? 11 : 13).setPosition(m.w / 2, m.pad + m.zoneH + 14);

    this.cueText.setOrigin(0.5, 0.5);

    for (const arrow of this.arrows) {
      arrow.image.setPosition(m.w / 2, m.h / 2);
    }
  }

  private panel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    g.fillStyle(0x0d1420, 0.72);
    g.fillRoundedRect(x, y, w, h, 10);
    g.lineStyle(2, 0x2a3a4d, 1);
    g.strokeRoundedRect(x, y, w, h, 10);
  }

  // ------------------------------------------------------------------ events

  private onHealth(health: number, inventory: Inventory): void {
    this.targetHealth = health;
    this.updateArmorText(inventory);
  }

  private updateArmorText(inv: Inventory): void {
    if (inv.armorLevel === ArmorLevel.None) {
      this.armorText.setText('NO ARMOR').setColor('#6f7c8a');
    } else {
      // Tier as a numeral and durability as a percentage - the mitigation maths behind it
      // is never shown mid-match.
      const max = ARMOR.durability[inv.armorLevel] ?? 1;
      const percent = Math.ceil((inv.armorDurability / max) * 100);
      this.armorText
        .setText(`ARMOR ${ARMOR_NUMERALS[inv.armorLevel] ?? ''}  ${percent}%`)
        .setColor('#9fd6ff');
    }
    this.helmetIcon.setVisible(inv.helmetLevel > ArmorLevel.None);
    this.healsText.setText(
      `Bandages ${inv.bandages}   Medkits ${inv.medkits}    [Q] heal   [E] pick up`,
    );
  }

  private onInventory(inv: Inventory, weapon: Weapon): void {
    this.weaponIcon.setTexture(weaponTexture(weapon.id));
    this.weaponName.setText(weapon.name);
    if (weapon.isMelee) {
      this.weaponRarity.setText('Melee').setColor('#b7c0cc');
      this.ammoText.setText('--');
      this.ammoTypeText.setText('');
    } else {
      const color = RARITY_COLOR[weapon.rarity] ?? 0xffffff;
      this.weaponRarity
        .setText(RARITY_LABEL[weapon.rarity] ?? '')
        .setColor(`#${color.toString(16).padStart(6, '0')}`);
      this.ammoText.setText(`${weapon.ammoInMag} / ${inv.reserveFor(weapon)}`);
      this.ammoTypeText.setText(AMMO_LABEL[weapon.ammoType]);
    }
    this.updateArmorText(inv);
    this.refreshSlots(inv);
  }

  private refreshSlots(inv: Inventory): void {
    const m = this.metrics();
    this.slotGraphics.clear();
    const slots = [SLOT_PRIMARY, SLOT_SECONDARY, SLOT_MELEE];
    slots.forEach((slot, i) => {
      const weapon = inv.weaponAt(slot);
      const x = m.slotsX + i * (m.slotSize + 6);
      const active = inv.activeSlot === slot;
      this.slotGraphics.fillStyle(active ? 0x1d2f45 : 0x0d1420, active ? 0.92 : 0.68);
      this.slotGraphics.fillRoundedRect(x, m.slotsY, m.slotSize, m.slotSize + 12, 8);
      this.slotGraphics.lineStyle(
        2,
        active ? PALETTE.gold : weapon ? (RARITY_COLOR[weapon.rarity] ?? 0x2a3a4d) : 0x2a3a4d,
        active ? 1 : 0.7,
      );
      this.slotGraphics.strokeRoundedRect(x, m.slotsY, m.slotSize, m.slotSize + 12, 8);

      const icon = this.slotIcons[i];
      if (icon) {
        icon.setVisible(weapon !== null);
        if (weapon) {
          icon.setTexture(weaponTexture(weapon.id));
          icon.setPosition(x + m.slotSize / 2, m.slotsY + m.slotSize / 2 + 6);
          icon.setScale(TEX_SCALE * (m.slotSize / 62));
        }
      }
      this.slotLabels[i]?.setPosition(x + 5, m.slotsY + 3);
    });
  }

  private onAbility(ability: AbilityDef): void {
    this.ability = ability;
    this.abilityIcon.setTexture(ability.icon).setTint(ability.color).setVisible(true);
    this.abilityKey.setText(this.ctx.isTouch ? 'SIGNAL' : 'SPACE').setVisible(true);
    this.layout();
  }

  private onHint(hint: HintPayload): void {
    this.hintText.setText(hint.text).setAlpha(1);
    this.hintUntil = this.scene.time.now + hint.durationMs;
  }

  private onNoise(cue: NoiseCue): void {
    // Only ever one cue on screen, and only if it is louder than what is already there.
    if (this.cue && this.scene.time.now < this.cueUntil && cue.strength < this.cue.strength) return;
    this.cue = cue;
    this.cueUntil = this.scene.time.now + 1100;
    const label =
      cue.kind === NoiseKind.Gunshot ? 'GUNFIRE' : cue.kind === NoiseKind.Door ? 'BREACH' : 'RELOAD';
    this.cueText.setText(label);
  }

  private onDamaged(_amount: number, fromAngle: number): void {
    // A short flash around the edges rather than a wash over the whole screen, so
    // taking a hit never hides what you are shooting at.
    this.damageFlash = 1;
    this.pushDamageArrow(fromAngle);
  }

  private pushDamageArrow(angle: number): void {
    let slot = this.arrows.find((a) => a.life <= 0);
    if (!slot) {
      if (this.arrows.length >= 6) return;
      const image = this.scene.add
        .image(0, 0, Tex.Arrow)
        .setScale(TEX_SCALE * 1.1)
        .setTint(PALETTE.danger)
        .setVisible(false);
      slot = { image, angle: 0, life: 0 };
      this.arrows.push(slot);
      this.root.add(image);
    }
    slot.angle = angle;
    slot.life = 1;
    slot.image.setVisible(true);
  }

  private onPrompt(prompt: PickupPrompt | null): void {
    if (!prompt) {
      this.promptText.setText('');
      return;
    }
    // Touch says "tap", desktop names the key.
    const verb = this.ctx.isTouch ? 'TAP' : '[E]';
    this.promptText.setText(`${verb}  ${prompt.text}`);
  }

  private onNotice(message: string): void {
    this.noticeText.setText(message).setAlpha(1);
    this.noticeUntil = this.scene.time.now + 1800;
  }

  // ------------------------------------------------------------------ frame

  update(delta: number): void {
    const m = this.metrics();
    const w = m.w;

    this.displayedHealth = damp(this.displayedHealth, this.targetHealth, 0.25, delta);
    const ratio = clamp(this.displayedHealth / 100, 0, 1);

    this.healthBar.clear();
    const barX = m.pad + 12;
    const barY = m.pad + (m.narrow ? 25 : 32);
    const barW = m.vitalsW - 24;
    this.healthBar.fillStyle(0x1a2430, 0.9);
    this.healthBar.fillRoundedRect(barX, barY, barW, 8, 4);
    const color = ratio > 0.5 ? 0x5fd36b : ratio > 0.25 ? PALETTE.gold : PALETTE.danger;
    this.healthBar.fillStyle(color, 1);
    this.healthBar.fillRoundedRect(barX, barY, Math.max(2, barW * ratio), 8, 4);
    this.healthText.setText(`${Math.max(0, Math.ceil(this.targetHealth))}`);

    // Armor durability sits directly under the health bar.
    const inv = this.ctx.player?.inventory;
    if (inv && inv.armorLevel > ArmorLevel.None) {
      const max = ARMOR.durability[inv.armorLevel] ?? 1;
      const aRatio = clamp(inv.armorDurability / max, 0, 1);
      this.healthBar.fillStyle(0x1a2430, 0.9);
      this.healthBar.fillRoundedRect(barX, barY + 12, barW, 5, 3);
      this.healthBar.fillStyle(0x59a6ff, 1);
      this.healthBar.fillRoundedRect(barX, barY + 12, Math.max(2, barW * aRatio), 5, 3);
    }

    // Ammo / reload / heal progress.
    const player = this.ctx.player;
    if (player) {
      const weapon = player.weapon;
      if (!weapon.isMelee) {
        this.ammoText.setText(`${weapon.ammoInMag} / ${player.inventory.reserveFor(weapon)}`);
      }
    }

    this.progressBar.clear();
    const progress = this.healProgress > 0 ? this.healProgress : this.reloadProgress;
    if (progress > 0) {
      const pw = m.narrow ? 180 : 240;
      const px = w / 2 - pw / 2;
      const py = m.weaponY - (m.narrow ? 16 : 18);
      this.progressBar.fillStyle(0x0d1420, 0.8);
      this.progressBar.fillRoundedRect(px, py, pw, 8, 4);
      this.progressBar.fillStyle(this.healProgress > 0 ? 0x5fd36b : PALETTE.gold, 1);
      this.progressBar.fillRoundedRect(px, py, pw * progress, 8, 4);
      this.progressLabel.setText(this.healProgress > 0 ? 'HEALING' : 'RELOADING');
      this.progressLabel.setPosition(w / 2, py - 4);
    } else {
      this.progressLabel.setText('');
    }

    this.updateAbility(m);
    this.updateHint();
    this.updateCue(delta, m);
    this.updateFinalSignal(m);
    this.updateLowHealth(ratio, m);
    this.updateDamageEdge(delta, m);

    this.aliveText.setText(`ALIVE ${this.ctx.aliveCount}`);
    this.killsText.setText(`KILLS ${this.ctx.player ? this.ctx.player.stats.kills : 0}`);

    const zone = this.ctx.zone;
    this.zoneLabel.setText(zone.statusText());
    this.zoneTimer.setText(zone.state === 'finished' ? '--:--' : formatTime(zone.secondsRemaining));
    const urgent = zone.state === 'shrinking' || zone.secondsRemaining < 10;
    this.zoneTimer.setColor(urgent ? '#ff6b81' : '#ffffff');

    if (this.noticeUntil > 0 && this.scene.time.now > this.noticeUntil) {
      this.noticeText.setAlpha(Math.max(0, this.noticeText.alpha - delta / 400));
      if (this.noticeText.alpha <= 0) {
        this.noticeText.setText('');
        this.noticeUntil = 0;
      }
    }

    // Directional damage arrows orbit the screen centre.
    const cx = w / 2;
    const cy = m.h / 2;
    for (const arrow of this.arrows) {
      if (arrow.life <= 0) continue;
      arrow.life -= delta / 1400;
      if (arrow.life <= 0) {
        arrow.image.setVisible(false);
        continue;
      }
      const radius = Math.min(w, m.h) * 0.22;
      arrow.image.setPosition(cx + Math.cos(arrow.angle) * radius, cy + Math.sin(arrow.angle) * radius);
      arrow.image.setRotation(arrow.angle);
      arrow.image.setAlpha(clamp(arrow.life, 0, 1) * 0.85);
    }
  }

  /** Cooldown ring around the ability icon. */
  private updateAbility(m: HudMetrics): void {
    if (!this.ability) return;
    const chip = m.narrow ? 44 : 56;
    const chipX = m.narrow ? m.weaponX + m.weaponW + 10 : m.weaponX - 12 - chip;
    const chipY = m.weaponY + (m.weaponH - chip) / 2;
    const ratio = this.ctx.signal.abilityReadyRatio;

    this.abilityPanel.clear();
    this.abilityPanel.fillStyle(0x0d1420, 0.8);
    this.abilityPanel.fillRoundedRect(chipX, chipY, chip, chip, 10);
    this.abilityPanel.lineStyle(2, ratio >= 1 ? this.ability.color : 0x2a3a4d, 0.95);
    this.abilityPanel.strokeRoundedRect(chipX, chipY, chip, chip, 10);

    if (ratio < 1) {
      // Dark sweep that empties as the ability comes back.
      this.abilityPanel.fillStyle(0x000000, 0.55);
      this.abilityPanel.slice(
        chipX + chip / 2,
        chipY + chip / 2,
        chip * 0.62,
        -Math.PI / 2 + Math.PI * 2 * ratio,
        -Math.PI / 2 + Math.PI * 2,
        false,
      );
      this.abilityPanel.fillPath();
    } else {
      const pulse = 0.5 + Math.sin(this.scene.time.now * 0.006) * 0.25;
      this.abilityPanel.lineStyle(2, this.ability.color, pulse);
      this.abilityPanel.strokeRoundedRect(chipX - 3, chipY - 3, chip + 6, chip + 6, 12);
    }
    this.abilityIcon.setAlpha(ratio >= 1 ? 1 : 0.45);
  }

  private updateHint(): void {
    if (this.hintText.text === '') return;
    const now = this.scene.time.now;
    if (now > this.hintUntil) {
      this.hintText.setAlpha(Math.max(0, this.hintText.alpha - 0.05));
      if (this.hintText.alpha <= 0) this.hintText.setText('');
    }
  }

  /** A single directional cue for the loudest thing the player can hear. */
  private updateCue(delta: number, m: HudMetrics): void {
    void delta;
    const now = this.scene.time.now;
    if (!this.cue || now > this.cueUntil) {
      this.cueArrow.setVisible(false);
      this.cueText.setText('');
      this.cue = null;
      return;
    }
    const life = (this.cueUntil - now) / 1100;
    const radius = Math.min(m.w, m.h) * 0.3;
    const cx = m.w / 2;
    const cy = m.h / 2;
    const x = cx + Math.cos(this.cue.angle) * radius;
    const y = cy + Math.sin(this.cue.angle) * radius;
    this.cueArrow.setVisible(true).setPosition(x, y).setRotation(this.cue.angle);
    this.cueArrow.setAlpha(life * 0.9);
    this.cueText
      .setPosition(cx + Math.cos(this.cue.angle) * (radius + 26), cy + Math.sin(this.cue.angle) * (radius + 26))
      .setAlpha(life * 0.9);
  }

  private updateFinalSignal(m: HudMetrics): void {
    const final = this.ctx.signal.final;
    this.finalPanel.clear();
    if (!final.active) {
      this.finalText.setText('');
      return;
    }
    const seconds = Math.floor(final.progressMs / 1000);
    const total = Math.round(final.totalMs / 1000);
    const holder = final.contested ? 'CONTESTED' : final.owner ? final.owner.combatantName : '--';
    this.finalText.setText(`FINAL SIGNAL   ${holder}   ${seconds} / ${total}`);
    this.finalText.setColor(final.owner?.isPlayer ? '#9df5ff' : final.contested ? '#ffb648' : '#c8d4e0');

    const w = this.finalText.width + 24;
    const x = m.w / 2 - w / 2;
    const y = m.pad + m.zoneH + 4;
    this.finalPanel.fillStyle(0x0a1119, 0.7);
    this.finalPanel.fillRoundedRect(x, y, w, 20, 6);
    this.finalPanel.fillStyle(0x2ee6ff, 0.28);
    this.finalPanel.fillRoundedRect(x, y, w * (final.progressMs / final.totalMs), 20, 6);
  }

  /** Decaying red border pulse for a hit taken. */
  private updateDamageEdge(delta: number, m: HudMetrics): void {
    this.damageEdge.clear();
    if (this.damageFlash <= 0) return;
    this.damageFlash = Math.max(0, this.damageFlash - delta / 340);
    const band = Math.min(m.w, m.h) * 0.16;
    this.damageEdge.fillStyle(PALETTE.danger, this.damageFlash * 0.42);
    this.damageEdge.fillRect(0, 0, m.w, band);
    this.damageEdge.fillRect(0, m.h - band, m.w, band);
    this.damageEdge.fillRect(0, 0, band, m.h);
    this.damageEdge.fillRect(m.w - band, 0, band, m.h);
  }

  /** A quiet red vignette at low health instead of a constantly flashing screen. */
  private updateLowHealth(ratio: number, m: HudMetrics): void {
    this.lowHealthEdge.clear();
    if (ratio > 0.3) return;
    const pulse = 0.18 + Math.sin(this.scene.time.now * 0.004) * 0.07;
    const band = Math.min(m.w, m.h) * 0.12;
    this.lowHealthEdge.fillStyle(PALETTE.danger, pulse * (1 - ratio / 0.3));
    this.lowHealthEdge.fillRect(0, 0, m.w, band);
    this.lowHealthEdge.fillRect(0, m.h - band, m.w, band);
    this.lowHealthEdge.fillRect(0, 0, band, m.h);
    this.lowHealthEdge.fillRect(m.w - band, 0, band, m.h);
  }

  setVisible(visible: boolean): void {
    this.root.setVisible(visible);
  }

  destroy(): void {
    this.damageEdge.destroy();
    const events = this.ctx.events;
    events.off(GameEvent.PlayerHealthChanged, this.onHealth, this);
    events.off(GameEvent.PlayerInventoryChanged, this.onInventory, this);
    events.off(GameEvent.PlayerDamaged, this.onDamaged, this);
    events.off(GameEvent.PlayerPromptChanged, this.onPrompt, this);
    events.off(GameEvent.Notice, this.onNotice, this);
    events.off(GameEvent.AbilityChanged, this.onAbility, this);
    events.off(GameEvent.Hint, this.onHint, this);
    events.off(GameEvent.NoiseHeard, this.onNoise, this);
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.root.destroy(true);
  }
}
