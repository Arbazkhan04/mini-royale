import Phaser from 'phaser';
import { PALETTE, TOUCH_AIM } from '../config/GameConfig';
import { Depth } from '../utils/Constants';
import type { Combatant } from '../entities/Combatant';
import type { InputAction, InputSystem } from '../systems/InputSystem';
import type { MatchContext } from '../systems/MatchContext';

const FONT = 'Trebuchet MS, Segoe UI, sans-serif';

interface TouchButton {
  action: InputAction | 'fire';
  circle: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  radius: number;
  /** Ability button only appears once the player is holding the Signal. */
  conditional?: boolean;
}

/**
 * On-screen controls, created only on touch-capable devices.
 * Left half = movement stick, right half = aim stick, plus action buttons.
 */
export class TouchControls {
  private readonly container: Phaser.GameObjects.Container;
  private readonly moveBase: Phaser.GameObjects.Arc;
  private readonly moveThumb: Phaser.GameObjects.Arc;
  private readonly aimBase: Phaser.GameObjects.Arc;
  private readonly aimThumb: Phaser.GameObjects.Arc;
  private readonly buttons: TouchButton[] = [];

  private movePointerId = -1;
  private moveOrigin = new Phaser.Math.Vector2();
  private aimPointerId = -1;
  private aimOrigin = new Phaser.Math.Vector2();
  private firePointerId = -1;
  private tapPointerId = -1;
  private tapReleaseTimer: Phaser.Time.TimerEvent | null = null;
  private targetAcquired = false;

  private readonly stickRadius = 62;
  private readonly thumbRadius = 28;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly input: InputSystem,
    private readonly ctx: MatchContext,
  ) {
    this.moveBase = scene.add.circle(0, 0, this.stickRadius, 0xffffff, 0.08).setStrokeStyle(2, 0xffffff, 0.25);
    this.moveThumb = scene.add.circle(0, 0, this.thumbRadius, 0xffffff, 0.22).setStrokeStyle(2, 0xffffff, 0.4);
    this.aimBase = scene.add.circle(0, 0, this.stickRadius, 0xffffff, 0.06).setStrokeStyle(2, 0xffffff, 0.2);
    this.aimThumb = scene.add.circle(0, 0, this.thumbRadius, PALETTE.gold, 0.25).setStrokeStyle(2, PALETTE.gold, 0.5);

    this.container = scene.add
      .container(0, 0, [this.moveBase, this.moveThumb, this.aimBase, this.aimThumb])
      .setDepth(Depth.Debug + 3);

    this.createButton('fire', 'FIRE', 46);
    this.createButton('ability', 'SIGNAL', 34, true);
    this.createButton('reload', 'R', 29);
    this.createButton('heal', 'HEAL', 29);
    this.createButton('interact', 'PICK UP', 29, true);
    this.createButton('swap', 'SWAP', 28);

    this.setSticksVisible(false);
    this.layout();

    scene.input.addPointer(3);
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
  }

  private createButton(
    action: InputAction | 'fire',
    label: string,
    radius: number,
    conditional = false,
  ): void {
    const accent =
      action === 'fire' ? PALETTE.danger : action === 'ability' ? 0x2ee6ff : 0xffffff;
    const circle = this.scene.add
      .circle(0, 0, radius, accent, action === 'fire' ? 0.3 : action === 'ability' ? 0.26 : 0.14)
      .setStrokeStyle(2, accent, 0.55);
    const text = this.scene.add
      .text(0, 0, label, {
        fontFamily: FONT,
        fontSize:
          action === 'fire' ? '15px' : action === 'ability' || action === 'interact' ? '11px' : '12px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5);
    if (conditional) {
      circle.setVisible(false);
      text.setVisible(false);
    }
    this.container.add([circle, text]);
    this.buttons.push({ action, circle, label: text, radius, conditional });
  }

  /** Conditional buttons appear only while they would actually do something. */
  private setButtonAvailable(action: InputAction | 'fire', available: boolean): void {
    for (const button of this.buttons) {
      if (button.action !== action || !button.conditional) continue;
      button.circle.setVisible(available);
      button.label.setVisible(available);
    }
  }

  setAbilityAvailable(available: boolean): void {
    this.setButtonAvailable('ability', available);
  }

  /** The pickup button only exists when there is something in reach to pick up. */
  setInteractAvailable(available: boolean): void {
    this.setButtonAvailable('interact', available);
  }

  private layout(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;

    // Arranged as an arc around the fire button so nothing lands under the thumb.
    const positions: Record<string, { x: number; y: number }> = {
      fire: { x: w - 92, y: h - 118 },
      ability: { x: w - 92, y: h - 300 },
      reload: { x: w - 176, y: h - 88 },
      interact: { x: w - 178, y: h - 174 },
      heal: { x: w - 106, y: h - 214 },
      swap: { x: w - 36, y: h - 196 },
    };
    for (const button of this.buttons) {
      const pos = positions[button.action] ?? { x: w - 80, y: h - 80 };
      button.circle.setPosition(pos.x, pos.y);
      button.label.setPosition(pos.x, pos.y);
    }
  }

  private setSticksVisible(visible: boolean): void {
    this.moveBase.setVisible(visible);
    this.moveThumb.setVisible(visible);
  }

  private buttonAt(x: number, y: number): TouchButton | null {
    for (const button of this.buttons) {
      if (!button.circle.visible) continue;
      const dx = x - button.circle.x;
      const dy = y - button.circle.y;
      if (dx * dx + dy * dy <= (button.radius + 10) ** 2) return button;
    }
    return null;
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    const button = this.buttonAt(pointer.x, pointer.y);
    if (button) {
      if (button.action === 'fire') {
        this.firePointerId = pointer.id;
        this.input.setVirtualFire(true);
      } else {
        this.input.press(button.action);
      }
      button.circle.setScale(0.9);
      return;
    }

    // Tapping an enemy beats both sticks: the player has named who they want to shoot,
    // which is more specific than any direction a stick could express.
    if (TOUCH_AIM.tapToShoot && this.tapPointerId === -1) {
      const enemy = this.enemyAt(pointer.x, pointer.y);
      if (enemy) {
        this.tapPointerId = pointer.id;
        this.tapReleaseTimer?.remove();
        this.tapReleaseTimer = null;
        this.input.setTapTarget(enemy);
        this.setTargetAcquired(true);
        return;
      }
    }

    if (pointer.x < this.scene.scale.width * 0.5) {
      if (this.movePointerId !== -1) return;
      this.movePointerId = pointer.id;
      this.moveOrigin.set(pointer.x, pointer.y);
      this.moveBase.setPosition(pointer.x, pointer.y);
      this.moveThumb.setPosition(pointer.x, pointer.y);
      this.setSticksVisible(true);
    } else {
      if (this.aimPointerId !== -1) return;
      this.aimPointerId = pointer.id;
      this.aimOrigin.set(pointer.x, pointer.y);
      this.aimBase.setPosition(pointer.x, pointer.y).setVisible(true);
      this.aimThumb.setPosition(pointer.x, pointer.y).setVisible(true);
      this.input.setAimStickHeld(true);
    }
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.movePointerId) {
      const dx = pointer.x - this.moveOrigin.x;
      const dy = pointer.y - this.moveOrigin.y;
      const len = Math.hypot(dx, dy);
      const clamped = Math.min(len, this.stickRadius);
      const nx = len > 0.001 ? dx / len : 0;
      const ny = len > 0.001 ? dy / len : 0;
      this.moveThumb.setPosition(
        this.moveOrigin.x + nx * clamped,
        this.moveOrigin.y + ny * clamped,
      );
      const strength = Math.min(1, len / this.stickRadius);
      this.input.setVirtualMove(nx * strength, ny * strength);
    } else if (pointer.id === this.aimPointerId) {
      const dx = pointer.x - this.aimOrigin.x;
      const dy = pointer.y - this.aimOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len < 12) return;
      const nx = dx / len;
      const ny = dy / len;
      const clamped = Math.min(len, this.stickRadius);
      this.aimThumb.setPosition(this.aimOrigin.x + nx * clamped, this.aimOrigin.y + ny * clamped);
      this.input.setVirtualAim(Math.atan2(dy, dx));
    }
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    for (const button of this.buttons) button.circle.setScale(1);
    if (pointer.id === this.tapPointerId) {
      this.tapPointerId = -1;
      // Do not drop the target the instant the thumb lifts. The gun may still be swinging
      // round, and "I tapped him and nothing happened" is the worst possible outcome.
      this.tapReleaseTimer?.remove();
      this.tapReleaseTimer = this.scene.time.delayedCall(TOUCH_AIM.tapCommitMs, () => {
        this.tapReleaseTimer = null;
        this.input.setTapTarget(null);
        this.setTargetAcquired(false);
      });
    }
    if (pointer.id === this.firePointerId) {
      this.firePointerId = -1;
      this.input.setVirtualFire(false);
    }
    if (pointer.id === this.movePointerId) {
      this.movePointerId = -1;
      this.input.setVirtualMove(0, 0);
      this.setSticksVisible(false);
    }
    if (pointer.id === this.aimPointerId) {
      this.aimPointerId = -1;
      this.aimBase.setVisible(false);
      this.aimThumb.setVisible(false);
      this.input.setAimStickHeld(false);
      this.setTargetAcquired(false);
      // Aim direction is kept so the character does not snap back on release.
    }
  }

  /**
   * The enemy nearest a touch point, within `tapRadiusPx`. Enemies are a few pixels across
   * on a phone, so the tap target is deliberately much larger than the sprite, and ties go
   * to whoever is closest to where the thumb actually landed.
   */
  private enemyAt(screenX: number, screenY: number): Combatant | null {
    const camera = this.ctx.scene.cameras.main;
    const view = camera.worldView;
    const zoom = camera.zoom;
    let best: Combatant | null = null;
    let bestDistance: number = TOUCH_AIM.tapRadiusPx;

    for (const other of this.ctx.combatants) {
      if (other === this.ctx.player || !other.alive) continue;
      const dx = (other.x - view.x) * zoom - screenX;
      const dy = (other.y - view.y) * zoom - screenY;
      const d = Math.hypot(dx, dy);
      if (d < bestDistance) {
        bestDistance = d;
        best = other;
      }
    }
    return best;
  }

  /**
   * Turns the aim thumb red while the stick is pointed at someone. The stick is firing on
   * its own at that moment, so it has to look like a trigger being pulled.
   */
  setTargetAcquired(acquired: boolean): void {
    if (acquired === this.targetAcquired) return;
    this.targetAcquired = acquired;
    const colour = acquired ? PALETTE.danger : PALETTE.gold;
    this.aimThumb.setFillStyle(colour, acquired ? 0.42 : 0.25);
    this.aimThumb.setStrokeStyle(2, colour, acquired ? 0.9 : 0.5);
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  destroy(): void {
    this.tapReleaseTimer?.remove();
    this.tapReleaseTimer = null;
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.container.destroy(true);
  }
}
