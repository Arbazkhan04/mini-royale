import Phaser from 'phaser';
import type { Combatant } from '../entities/Combatant';

export interface VirtualInputState {
  moveX: number;
  moveY: number;
  /** Absolute aim angle in radians, or null when the stick is idle. */
  aimAngle: number | null;
  firing: boolean;
}

export type InputAction =
  | 'ability'
  | 'reload'
  | 'interact'
  | 'heal'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'swap'
  | 'inventory'
  | 'pause'
  | 'debug';

/**
 * Normalises desktop (keyboard + mouse) and touch input into a single state object.
 * Gameplay code never reads raw Phaser input, which is what makes mobile support a
 * matter of writing into `virtual` rather than special-casing the player.
 */
export class InputSystem {
  readonly virtual: VirtualInputState = { moveX: 0, moveY: 0, aimAngle: null, firing: false };

  moveX = 0;
  moveY = 0;
  aimWorldX = 0;
  aimWorldY = 0;
  /** Set when aiming comes from a stick rather than a world-space pointer. */
  aimAngleOverride: number | null = null;
  firing = false;
  touchMode = false;
  /** True while a thumb is actually on the aim stick, as opposed to the kept direction. */
  aimStickHeld = false;
  /** Enemy the player tapped directly. Overrides the sticks until the thumb lifts. */
  tapTarget: Combatant | null = null;

  private readonly keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private readonly pending = new Set<InputAction>();
  private pointerDown = false;
  private lastPointerWorld = new Phaser.Math.Vector2(0, 0);

  constructor(private readonly scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (kb) {
      const map: Record<string, number> = {
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        upArrow: Phaser.Input.Keyboard.KeyCodes.UP,
        downArrow: Phaser.Input.Keyboard.KeyCodes.DOWN,
        leftArrow: Phaser.Input.Keyboard.KeyCodes.LEFT,
        rightArrow: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        reload: Phaser.Input.Keyboard.KeyCodes.R,
        interact: Phaser.Input.Keyboard.KeyCodes.E,
        heal: Phaser.Input.Keyboard.KeyCodes.Q,
        slot1: Phaser.Input.Keyboard.KeyCodes.ONE,
        slot2: Phaser.Input.Keyboard.KeyCodes.TWO,
        slot3: Phaser.Input.Keyboard.KeyCodes.THREE,
        inventory: Phaser.Input.Keyboard.KeyCodes.TAB,
        pause: Phaser.Input.Keyboard.KeyCodes.ESC,
        debug: Phaser.Input.Keyboard.KeyCodes.F1,
        ability: Phaser.Input.Keyboard.KeyCodes.SPACE,
      };
      for (const [name, code] of Object.entries(map)) {
        this.keys[name] = kb.addKey(code, true, false);
      }
      // Tab would otherwise move focus out of the canvas.
      kb.addCapture([
        Phaser.Input.Keyboard.KeyCodes.TAB,
        Phaser.Input.Keyboard.KeyCodes.SPACE,
        Phaser.Input.Keyboard.KeyCodes.F1,
      ]);
    }

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    scene.input.on(Phaser.Input.Events.GAME_OUT, this.onPointerUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch) {
      this.touchMode = true;
      return;
    }
    this.pointerDown = true;
  }

  private onPointerUp(): void {
    this.pointerDown = false;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch) {
      this.touchMode = true;
      return;
    }
    this.lastPointerWorld.set(pointer.worldX, pointer.worldY);
  }

  /** Called once per frame before gameplay updates. */
  update(playerX: number, playerY: number): void {
    const k = this.keys;
    const down = (name: string): boolean => (k[name] ? (k[name] as Phaser.Input.Keyboard.Key).isDown : false);

    let mx = 0;
    let my = 0;
    if (down('left') || down('leftArrow')) mx -= 1;
    if (down('right') || down('rightArrow')) mx += 1;
    if (down('up') || down('upArrow')) my -= 1;
    if (down('down') || down('downArrow')) my += 1;

    // Touch joystick wins whenever it is being used.
    if (this.virtual.moveX !== 0 || this.virtual.moveY !== 0) {
      mx = this.virtual.moveX;
      my = this.virtual.moveY;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    this.moveX = mx;
    this.moveY = my;

    if (this.virtual.aimAngle !== null) {
      this.aimAngleOverride = this.virtual.aimAngle;
      this.aimWorldX = playerX + Math.cos(this.virtual.aimAngle) * 300;
      this.aimWorldY = playerY + Math.sin(this.virtual.aimAngle) * 300;
    } else {
      this.aimAngleOverride = null;
      const pointer = this.scene.input.activePointer;
      if (!pointer.wasTouch) {
        const cam = this.scene.cameras.main;
        const world = cam.getWorldPoint(pointer.x, pointer.y);
        this.lastPointerWorld.set(world.x, world.y);
      }
      this.aimWorldX = this.lastPointerWorld.x;
      this.aimWorldY = this.lastPointerWorld.y;
    }

    // Space is the Signal ability, so firing is mouse/touch only.
    this.firing = this.virtual.firing || (this.pointerDown && !this.touchMode);

    this.pollKey('ability', 'ability');
    this.pollKey('reload', 'reload');
    this.pollKey('interact', 'interact');
    this.pollKey('heal', 'heal');
    this.pollKey('slot1', 'slot1');
    this.pollKey('slot2', 'slot2');
    this.pollKey('slot3', 'slot3');
    this.pollKey('inventory', 'inventory');
    this.pollKey('pause', 'pause');
    this.pollKey('debug', 'debug');
  }

  private pollKey(keyName: string, action: InputAction): void {
    const key = this.keys[keyName];
    if (key && Phaser.Input.Keyboard.JustDown(key)) this.pending.add(action);
  }

  /** Queues an action from a touch button. */
  press(action: InputAction): void {
    this.pending.add(action);
  }

  /** Consumes a one-shot action. */
  consume(action: InputAction): boolean {
    if (!this.pending.has(action)) return false;
    this.pending.delete(action);
    return true;
  }

  clearPending(): void {
    this.pending.clear();
  }

  setVirtualMove(x: number, y: number): void {
    this.virtual.moveX = x;
    this.virtual.moveY = y;
  }

  setVirtualAim(angle: number | null): void {
    this.virtual.aimAngle = angle;
  }

  setVirtualFire(firing: boolean): void {
    this.virtual.firing = firing;
  }

  setAimStickHeld(held: boolean): void {
    this.aimStickHeld = held;
  }

  setTapTarget(target: Combatant | null): void {
    this.tapTarget = target;
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.onPointerUp, this);
  }
}
