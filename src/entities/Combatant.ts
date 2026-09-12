import Phaser from 'phaser';
import { HEAL, MATCH, PALETTE, PLAYER } from '../config/GameConfig';
import { TEX_SCALE, WEAPON_TEX_UNITS } from '../graphics/TextureFactory';
import { Depth, Tex, WeaponType, weaponTexture } from '../utils/Constants';
import { angleDelta, clamp, damp } from '../utils/MathUtils';
import type { MatchContext } from '../systems/MatchContext';
import { Inventory, SLOT_MELEE } from './Inventory';
import type { SlotIndex } from './Inventory';
import type { Weapon } from './Weapon';

const BODY_UNITS = 40;
const BODY_DISPLAY = 34;
/** Seen from above the head sits in the middle of the torso, so it stays small. */
const HEAD_DISPLAY = 17;
const HAND_DISPLAY = 8;
const GLOVE_COLOR = 0x2f353c;
const GRIP = { x: 10, y: 5 };

export type HealKind = 'bandage' | 'medkit';

export interface CombatantOptions {
  id: number;
  name: string;
  x: number;
  y: number;
  isPlayer: boolean;
  bodyColor: number;
  accentColor: number;
  speedMultiplier?: number;
}

export interface MatchStats {
  kills: number;
  damageDealt: number;
  shotsFired: number;
  shotsHit: number;
  survivedMs: number;
  placement: number;
}

/**
 * Base class for anything that walks, shoots and dies. Handles rendering, procedural
 * animation, movement integration, reloading and healing; decisions come from Player
 * (input) or Bot (AI).
 */
export abstract class Combatant extends Phaser.GameObjects.Container {
  readonly combatantId: number;
  readonly combatantName: string;
  readonly isPlayer: boolean;
  readonly radius = PLAYER.radius;
  readonly inventory = new Inventory();
  readonly stats: MatchStats = {
    kills: 0,
    damageDealt: 0,
    shotsFired: 0,
    shotsHit: 0,
    survivedMs: 0,
    placement: 0,
  };

  health: number = PLAYER.maxHealth;
  readonly maxHealth: number = PLAYER.maxHealth;
  alive = true;

  /** Desired movement direction, magnitude 0..1. Written by input or AI. */
  readonly moveInput = new Phaser.Math.Vector2(0, 0);
  aimAngle = 0;
  /** Target aim, smoothed into aimAngle. */
  desiredAim = 0;
  wantsToFire = false;

  speedMultiplier: number;
  /** Radians per second the character rotates toward its desired aim. */
  turnSpeed: number = PLAYER.turnSpeed;
  spawnProtectionUntil = 0;
  lastFireAt = -9999;
  lastDamagedAt = -9999;
  lastDamageFrom: Combatant | null = null;

  healing: HealKind | null = null;
  healEndsAt = 0;
  healStartedAt = 0;

  // ---- Signal ability state (written by SignalSystem) ----
  hasSignal = false;
  /** Temporary damage pool that soaks hits before armor. */
  shield = 0;
  shieldUntil = 0;
  speedBoostUntil = 0;
  speedBoostMult = 1;
  dashUntil = 0;
  private dashVX = 0;
  private dashVY = 0;

  protected readonly bodyColor: number;
  protected readonly accentColor: number;

  protected readonly shadow: Phaser.GameObjects.Image;
  protected readonly backpack: Phaser.GameObjects.Image;
  protected readonly torso: Phaser.GameObjects.Image;
  protected readonly weaponSprite: Phaser.GameObjects.Image;
  protected readonly frontHand: Phaser.GameObjects.Image;
  protected readonly backHand: Phaser.GameObjects.Image;
  protected readonly head: Phaser.GameObjects.Image;
  private readonly signalAura: Phaser.GameObjects.Image;

  private walkPhase = 0;
  private recoilKick = 0;
  private hitFlash = 0;
  private lastFootstepAt = 0;
  private lastWeaponKey = '';
  private currentSpeed = 0;

  constructor(
    readonly ctx: MatchContext,
    opts: CombatantOptions,
  ) {
    super(ctx.scene, opts.x, opts.y);
    this.combatantId = opts.id;
    this.combatantName = opts.name;
    this.isPlayer = opts.isPlayer;
    this.bodyColor = opts.bodyColor;
    this.accentColor = opts.accentColor;
    this.speedMultiplier = opts.speedMultiplier ?? 1;

    const scene = ctx.scene;

    this.shadow = scene.add
      .image(2, 3, Tex.Shadow)
      .setScale(TEX_SCALE * (46 / 64))
      .setAlpha(0.5);
    this.backpack = scene.add
      .image(-9, 0, Tex.Backpack)
      .setScale(TEX_SCALE * 0.62)
      .setTint(this.accentColor);
    this.torso = scene.add
      .image(0, 0, Tex.Body)
      .setScale(TEX_SCALE * (BODY_DISPLAY / BODY_UNITS))
      .setTint(this.bodyColor);
    this.weaponSprite = scene.add.image(GRIP.x, GRIP.y, weaponTexture('knife'));
    this.weaponSprite.setOrigin(WEAPON_TEX_UNITS.gripX / WEAPON_TEX_UNITS.width, 0.5);
    this.backHand = scene.add
      .image(GRIP.x, GRIP.y + 1, Tex.Hand)
      .setScale(TEX_SCALE * (HAND_DISPLAY / 14))
      .setTint(GLOVE_COLOR);
    this.frontHand = scene.add
      .image(GRIP.x + 10, GRIP.y - 1, Tex.Hand)
      .setScale(TEX_SCALE * (HAND_DISPLAY / 14))
      .setTint(GLOVE_COLOR);
    this.signalAura = scene.add
      .image(0, 0, Tex.Ring)
      .setScale(TEX_SCALE * 0.95)
      .setTint(0x2ee6ff)
      .setAlpha(0.9)
      .setVisible(false);
    this.head = scene.add
      .image(1, 0, Tex.Head)
      .setScale(TEX_SCALE * (HEAD_DISPLAY / 24))
      .setTint(PALETTE.skin);

    this.add([
      this.shadow,
      this.signalAura,
      this.backpack,
      this.torso,
      this.weaponSprite,
      this.backHand,
      this.frontHand,
      this.head,
    ]);

    this.setDepth(Depth.Entity);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.arcadeBody;
    body.setCircle(this.radius, -this.radius, -this.radius);
    body.setCollideWorldBounds(true);
    body.setDamping(false);
    body.setMaxVelocity(520, 520);

    this.spawnProtectionUntil = ctx.now + MATCH.spawnProtectionMs;
    this.refreshWeaponSprite();
  }

  get arcadeBody(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }

  get weapon(): Weapon {
    return this.inventory.activeWeapon;
  }

  get isMoving(): boolean {
    return this.currentSpeed > 24;
  }

  get healProgress(): number {
    if (!this.healing) return 0;
    const total = this.healEndsAt - this.healStartedAt;
    if (total <= 0) return 1;
    return clamp((this.ctx.now - this.healStartedAt) / total, 0, 1);
  }

  // ------------------------------------------------------------------ lifecycle

  /** Per-frame integration. Subclasses call super.update after setting inputs. */
  override update(_time: number, delta: number): void {
    if (!this.alive) return;
    const now = this.ctx.now;

    this.updateWeaponTiming(now, delta);
    this.updateHealing(now);
    this.integrateMovement(delta);
    this.updateAim(delta);
    this.updateAnimation(delta);
    this.setDepth(Depth.Entity + this.y * 0.001);
  }

  private updateWeaponTiming(now: number, delta: number): void {
    const weapon = this.weapon;
    weapon.decayRecoil(delta);
    if (weapon.reloading && now >= weapon.reloadEndsAt) {
      const reserve = this.inventory.reserveFor(weapon);
      const used = weapon.finishReload(reserve);
      this.inventory.takeAmmo(weapon.ammoType, used);
      this.onInventoryChanged();
    }
  }

  private updateHealing(now: number): void {
    if (!this.healing) return;
    if (now >= this.healEndsAt) {
      const kind = this.healing;
      this.healing = null;
      if (kind === 'bandage') {
        this.health = Math.min(HEAL.bandage.cap, this.health + HEAL.bandage.heal);
      } else {
        this.health = Math.min(HEAL.medkit.cap, this.health + HEAL.medkit.heal);
      }
      this.ctx.effects.healBurst(this.x, this.y);
      this.ctx.audio.play('heal', this.x, this.y);
      this.onHealthChanged();
      this.onInventoryChanged();
    }
  }

  private integrateMovement(delta: number): void {
    const body = this.arcadeBody;
    const dt = delta / 1000;

    // A dash overrides normal acceleration entirely for its short window.
    if (this.ctx.now < this.dashUntil) {
      body.setVelocity(this.dashVX, this.dashVY);
      this.currentSpeed = Math.hypot(this.dashVX, this.dashVY);
      return;
    }

    const speed = this.currentMaxSpeed();

    const input = this.moveInput;
    const len = input.length();
    let targetX = 0;
    let targetY = 0;
    if (len > 0.001) {
      const nx = input.x / Math.max(len, 1);
      const ny = input.y / Math.max(len, 1);
      const mag = Math.min(1, len);
      targetX = nx * speed * mag;
      targetY = ny * speed * mag;
    }

    const accel = len > 0.001 ? PLAYER.acceleration : PLAYER.deceleration;
    const vx = this.approach(body.velocity.x, targetX, accel * dt);
    const vy = this.approach(body.velocity.y, targetY, accel * dt);
    body.setVelocity(vx, vy);
    this.currentSpeed = Math.hypot(vx, vy);

    if (this.currentSpeed > speed * 0.6 && this.ctx.now - this.lastFootstepAt > 260) {
      this.lastFootstepAt = this.ctx.now;
      this.ctx.effects.footstepDust(this.x, this.y - 2);
    }
  }

  private approach(current: number, target: number, maxDelta: number): number {
    const diff = target - current;
    if (Math.abs(diff) <= maxDelta) return target;
    return current + Math.sign(diff) * maxDelta;
  }

  currentMaxSpeed(): number {
    let speed = PLAYER.baseSpeed * this.speedMultiplier * this.weapon.base.moveSpeedMult;
    if (this.healing) speed *= PLAYER.healMoveSpeedMult;
    if (this.ctx.now - this.lastFireAt < 220) speed *= this.weapon.base.fireMoveSpeedMult;
    if (this.ctx.now < this.speedBoostUntil) speed *= this.speedBoostMult;
    return speed;
  }

  // ------------------------------------------------------------------ signal state

  setSignalHolder(holding: boolean): void {
    this.hasSignal = holding;
    this.signalAura.setVisible(holding);
  }

  /** Overrides movement with a fixed velocity for a short burst. */
  startDash(angle: number, speed: number, durationMs: number): void {
    this.dashUntil = this.ctx.now + durationMs;
    this.dashVX = Math.cos(angle) * speed;
    this.dashVY = Math.sin(angle) * speed;
    this.cancelHeal();
  }

  grantShield(amount: number, durationMs: number): void {
    this.shield = amount;
    this.shieldUntil = this.ctx.now + durationMs;
  }

  grantSpeed(multiplier: number, durationMs: number): void {
    this.speedBoostMult = multiplier;
    this.speedBoostUntil = this.ctx.now + durationMs;
  }

  /** Consumes shield first; returns the damage left over for armor and health. */
  absorbWithShield(amount: number): number {
    if (this.ctx.now > this.shieldUntil || this.shield <= 0) return amount;
    const taken = Math.min(this.shield, amount);
    this.shield -= taken;
    return amount - taken;
  }

  get shieldActive(): boolean {
    return this.ctx.now < this.shieldUntil && this.shield > 0;
  }

  private updateAim(delta: number): void {
    const diff = angleDelta(this.aimAngle, this.desiredAim);
    const step = (this.turnSpeed * delta) / 1000;
    this.aimAngle += clamp(diff, -step, step);
    this.rotation = this.aimAngle + this.weapon.recoil * 0.35;
  }

  private updateAnimation(delta: number): void {
    const moving = this.currentSpeed > 20;
    const speedRatio = clamp(this.currentSpeed / PLAYER.baseSpeed, 0, 1.4);
    this.walkPhase += (delta / 1000) * (6 + speedRatio * 7);

    const bob = moving ? Math.sin(this.walkPhase) : 0;
    const sway = moving ? Math.cos(this.walkPhase) : 0;

    this.torso.y = bob * 0.9;
    this.torso.scaleY = TEX_SCALE * (BODY_DISPLAY / BODY_UNITS) * (1 + Math.abs(bob) * 0.03);
    this.head.y = bob * 0.5;
    this.head.x = 1 + sway * 0.4;
    this.backpack.y = bob * 0.7;

    this.recoilKick = damp(this.recoilKick, 0, 0.25, delta);

    const isMelee = this.weapon.type === WeaponType.Melee;
    const gripX = GRIP.x - this.recoilKick;
    const swing = isMelee ? Math.sin(this.walkPhase) * 1.6 : sway * 1.1;
    this.weaponSprite.x = gripX;
    this.weaponSprite.y = GRIP.y + (isMelee ? swing * 0.4 : 0);
    this.backHand.x = gripX + 2 + swing * 0.3;
    this.backHand.y = GRIP.y + 1;
    const reach = this.weapon.base.drawLength * (isMelee ? 0.5 : 0.6);
    this.frontHand.x = gripX + reach;
    this.frontHand.y = GRIP.y - 1 + (isMelee ? swing * 0.5 : 0);

    if (this.signalAura.visible) {
      const pulse = 1 + Math.sin(this.ctx.now * 0.006) * 0.12;
      this.signalAura.setScale(TEX_SCALE * 0.95 * pulse);
      this.signalAura.setAlpha(0.65 + Math.sin(this.ctx.now * 0.006) * 0.2);
      this.signalAura.rotation -= 0.02;
    }

    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - delta / 220);
      const t = this.hitFlash;
      const tint = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(this.bodyColor),
        Phaser.Display.Color.ValueToColor(0xffffff),
        100,
        Math.round(t * 100),
      );
      this.torso.setTint(Phaser.Display.Color.GetColor(tint.r, tint.g, tint.b));
    } else {
      this.torso.setTint(this.bodyColor);
    }
  }

  // ------------------------------------------------------------------ actions

  /** Keeps the held-weapon sprite in sync with the active slot. */
  refreshWeaponSprite(): void {
    const weapon = this.weapon;
    const key = weaponTexture(weapon.id);
    if (key === this.lastWeaponKey) return;
    this.lastWeaponKey = key;
    this.weaponSprite.setTexture(key);
    const scale = (weapon.base.drawLength / WEAPON_TEX_UNITS.barrelLength) * TEX_SCALE;
    this.weaponSprite.setScale(scale);
    this.weaponSprite.setVisible(true);
  }

  selectSlot(slot: SlotIndex): void {
    if (!this.inventory.selectSlot(slot)) return;
    this.weapon.cancelReload();
    this.refreshWeaponSprite();
    this.onInventoryChanged();
  }

  /** Auto-selects the best available slot, used after picking up a first gun. */
  selectBestSlot(): void {
    const inv = this.inventory;
    if (inv.primary) inv.selectSlot(0);
    else if (inv.secondary) inv.selectSlot(1);
    else inv.selectSlot(SLOT_MELEE);
    this.refreshWeaponSprite();
    this.onInventoryChanged();
  }

  tryReload(): boolean {
    const weapon = this.weapon;
    if (!weapon.usesAmmo) return false;
    const reserve = this.inventory.reserveFor(weapon);
    if (!weapon.startReload(this.ctx.now, reserve)) return false;
    this.cancelHeal();
    this.ctx.audio.play('reload', this.x, this.y);
    this.onInventoryChanged();
    return true;
  }

  startHeal(kind: HealKind): boolean {
    if (this.healing) return false;
    const inv = this.inventory;
    if (kind === 'bandage') {
      if (inv.bandages <= 0 || this.health >= HEAL.bandage.cap) return false;
      inv.bandages--;
    } else {
      if (inv.medkits <= 0 || this.health >= this.maxHealth) return false;
      inv.medkits--;
    }
    this.healing = kind;
    this.healStartedAt = this.ctx.now;
    this.healEndsAt = this.ctx.now + (kind === 'bandage' ? HEAL.bandage.timeMs : HEAL.medkit.timeMs);
    this.weapon.cancelReload();
    this.ctx.effects.healingAura(this);
    this.onInventoryChanged();
    return true;
  }

  cancelHeal(): void {
    if (!this.healing) return;
    // The consumable is refunded so a cancelled heal never silently eats an item.
    if (this.healing === 'bandage') this.inventory.addBandages(1);
    else this.inventory.addMedkits(1);
    this.healing = null;
    this.onInventoryChanged();
  }

  /** Muzzle position in world space, used to spawn bullets and flashes. */
  muzzlePoint(): { x: number; y: number } {
    const len = GRIP.x + this.weapon.base.drawLength * 0.95;
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    return {
      x: this.x + cos * len - sin * GRIP.y,
      y: this.y + sin * len + cos * GRIP.y,
    };
  }

  onFired(): void {
    this.lastFireAt = this.ctx.now;
    this.recoilKick = Math.min(5, 1.4 + this.weapon.base.recoilDeg * 0.7);
    this.cancelHeal();
  }

  /** Feedback + bookkeeping for taking a hit. The damage maths lives in CombatSystem. */
  registerHitTaken(from: Combatant | null): void {
    this.hitFlash = 1;
    this.lastDamagedAt = this.ctx.now;
    if (from) this.lastDamageFrom = from;
    this.cancelHeal();
  }

  applyHealth(newHealth: number): void {
    this.health = clamp(newHealth, 0, this.maxHealth);
    this.onHealthChanged();
  }

  die(): void {
    if (!this.alive) return;
    this.alive = false;
    this.healing = null;
    this.moveInput.set(0, 0);
    const body = this.arcadeBody;
    body.setVelocity(0, 0);
    body.enable = false;

    this.setDepth(Depth.Decal + 2);
    this.ctx.effects.deathBurst(this.x, this.y, this.bodyColor);
    this.ctx.scene.tweens.add({
      targets: this,
      alpha: 0.55,
      scale: 0.86,
      rotation: this.rotation + (this.ctx.rng.bool() ? 0.9 : -0.9),
      duration: 420,
      ease: 'Cubic.easeOut',
    });
    this.onDeath();
  }

  /** Hooks for subclasses / UI wiring. */
  protected onHealthChanged(): void {}
  protected onInventoryChanged(): void {}
  protected onDeath(): void {}

  override destroy(fromScene?: boolean): void {
    super.destroy(fromScene);
  }
}
