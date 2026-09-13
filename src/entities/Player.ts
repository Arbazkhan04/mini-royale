import { PLAYER, TOUCH_AIM } from '../config/GameConfig';
import { GameEvent } from '../utils/Constants';
import { angleBetween, angleDelta, degToRad } from '../utils/MathUtils';
import type { InputSystem } from '../systems/InputSystem';
import type { MatchContext } from '../systems/MatchContext';
import { Combatant } from './Combatant';
import type { CombatantOptions } from './Combatant';
import { SLOT_MELEE, SLOT_PRIMARY, SLOT_SECONDARY } from './Inventory';

/**
 * The human-controlled combatant. Reads a normalised InputSystem state and forwards
 * every state change to the UI through the match event bus.
 */
export class Player extends Combatant {
  private previousFiring = false;

  constructor(
    ctx: MatchContext,
    opts: CombatantOptions,
    private readonly playerInput: InputSystem,
  ) {
    super(ctx, opts);
  }

  override update(time: number, delta: number): void {
    if (!this.alive) return;

    if (this.ctx.running) {
      this.readInput(delta);
    } else {
      this.moveInput.set(0, 0);
      this.wantsToFire = false;
    }

    super.update(time, delta);
    this.ctx.events.emit(GameEvent.PlayerHealProgress, this.healing ? this.healProgress : 0);
    const weapon = this.weapon;
    this.ctx.events.emit(
      GameEvent.PlayerReloadProgress,
      weapon.reloading ? weapon.reloadProgress(this.ctx.now) : 0,
    );
  }

  private readInput(delta: number): void {
    const input = this.playerInput;
    this.moveInput.set(input.moveX, input.moveY);
    this.desiredAim = angleBetween(this.x, this.y, input.aimWorldX, input.aimWorldY);

    const firing = this.aimAndDecideFiring(input, delta);

    if (input.consume('ability')) this.ctx.signal.useAbility(this);
    if (input.consume('reload')) this.tryReload();
    if (input.consume('interact')) this.ctx.loot.tryPickup(this);
    if (input.consume('heal')) this.useBestHeal();
    if (input.consume('slot1')) this.selectSlot(SLOT_PRIMARY);
    if (input.consume('slot2')) this.selectSlot(SLOT_SECONDARY);
    if (input.consume('slot3')) this.selectSlot(SLOT_MELEE);
    if (input.consume('swap')) {
      this.inventory.cycleSlot(1);
      this.refreshWeaponSprite();
      this.onInventoryChanged();
    }

    const edge = firing && !this.previousFiring;
    this.previousFiring = firing;
    this.wantsToFire = firing;

    if (firing) {
      // On touch a held trigger keeps re-arming the press, so a semi-automatic cycles at
      // its own fire rate instead of needing one tap per round. `tryFire` still gates on
      // `nextShotAt`, so this is exactly a perfectly-timed tap and never faster.
      const autoRepeat = TOUCH_AIM.autoRepeatSemiAuto && this.ctx.isTouch;
      this.ctx.combat.tryFire(this, { held: true, pressed: edge || autoRepeat });
    }
  }

  /**
   * Sets `desiredAim` and `turnSpeed`, and reports whether the trigger is down.
   *
   * There are three ways to shoot on touch, in descending order of how specific the
   * player was about who they meant:
   *
   *  1. **Tapping an enemy** names a target outright. The gun swings onto them, the aim
   *     assist is bypassed entirely - there is nothing left to assist with - and fire is
   *     held until the barrel is actually lined up, so the first round is not thrown into
   *     the ground mid-swing.
   *  2. **Pointing the aim stick at someone** means "that one", and fires on its own.
   *  3. **Holding FIRE** means "shoot whatever is roughly over there", and gets the wide
   *     70-degree snap.
   */
  private aimAndDecideFiring(input: InputSystem, delta: number): boolean {
    const tap = input.tapTarget;
    if (tap && !tap.alive) input.setTapTarget(null);

    if (tap && tap.alive) {
      const toTap = angleBetween(this.x, this.y, tap.x, tap.y);
      this.desiredAim = toTap;
      this.turnSpeed = PLAYER.turnSpeed * TOUCH_AIM.tapTurnSpeedMult;
      this.ctx.aimAssist.forceLock(tap);
      return Math.abs(angleDelta(this.aimAngle, toTap)) <= degToRad(TOUCH_AIM.tapFireToleranceDeg);
    }

    // Read the trigger before aiming: holding FIRE is what escalates the assist from a
    // nudge to actually swinging the gun onto the target. On touch the aim stick is a
    // trigger too, so that pointing at someone and shooting them is one thumb's work.
    const stickFiring =
      TOUCH_AIM.fireWhileAiming &&
      input.aimStickHeld &&
      this.ctx.aimAssist.hasAutoFireTarget(this, this.desiredAim);
    const firing = input.firing || stickFiring;

    const assist = this.ctx.aimAssist.apply(this, this.desiredAim, delta, firing);
    this.desiredAim = assist.aim;
    this.turnSpeed = PLAYER.turnSpeed * assist.turnSpeedMult;
    return firing;
  }

  /** Q uses the most appropriate consumable for the current health. */
  useBestHeal(): boolean {
    const inv = this.inventory;
    if (this.healing) {
      this.cancelHeal();
      return false;
    }
    const wantsMedkit = this.health <= 45 || inv.bandages === 0;
    if (wantsMedkit && inv.medkits > 0 && this.health < this.maxHealth) {
      return this.startHeal('medkit');
    }
    if (inv.bandages > 0 && this.health < 75) return this.startHeal('bandage');
    if (inv.medkits > 0 && this.health < this.maxHealth) return this.startHeal('medkit');
    this.ctx.events.emit(GameEvent.Notice, 'No healing items');
    return false;
  }

  protected override onHealthChanged(): void {
    this.ctx.events.emit(GameEvent.PlayerHealthChanged, this.health, this.inventory);
  }

  protected override onInventoryChanged(): void {
    this.ctx.events.emit(GameEvent.PlayerInventoryChanged, this.inventory, this.weapon);
  }

  protected override onDeath(): void {
    this.ctx.events.emit(GameEvent.PlayerHealthChanged, 0, this.inventory);
  }
}
