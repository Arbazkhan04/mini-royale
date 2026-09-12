import Phaser from 'phaser';
import { PALETTE } from '../config/GameConfig';

const FONT = 'Trebuchet MS, Segoe UI, sans-serif';

export interface ButtonOptions {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly fontSize?: number;
  readonly radius?: number;
  readonly onClick: () => void;
  /** Fired on press, before `onClick`. Scenes use it for the UI click sound. */
  readonly onPress?: () => void;
}

type ButtonState = 'idle' | 'hover' | 'pressed';

const FILL: Record<ButtonState, number> = {
  idle: 0x16222f,
  hover: 0x2a4a63,
  pressed: 0x3d6c8f,
};

/**
 * The menu, result and how-to-play screens all use this.
 *
 * The important part is the pressed state. Phaser processes input before it renders, so
 * painting the press synchronously inside the `pointerdown` handler puts a lit, slightly
 * sunken button on screen in the *same* frame as the tap - before any scene transition
 * work begins. Without it a button that hands off to another scene looks dead for the
 * couple of hundred milliseconds the handoff takes, which reads as the game being slow
 * rather than as the game working. Touch has no hover state at all, so there it is the
 * only feedback a press ever gets.
 */
export function createButton(
  scene: Phaser.Scene,
  opts: ButtonOptions,
): Phaser.GameObjects.Container {
  const { label, width, height, fontSize = 26, radius = 12, onClick, onPress } = opts;

  const g = scene.add.graphics();
  let state: ButtonState = 'idle';

  const draw = (next: ButtonState): void => {
    state = next;
    g.clear();
    g.fillStyle(FILL[next], 0.95);
    g.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
    g.lineStyle(3, next === 'idle' ? 0x2f4356 : PALETTE.gold, 1);
    g.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);
  };
  draw('idle');

  const text = scene.add
    .text(0, 0, label, {
      fontFamily: FONT,
      fontSize: `${fontSize}px`,
      color: '#ffffff',
      fontStyle: 'bold',
    })
    .setOrigin(0.5, 0.5);
  text.setShadow(0, 3, '#000000', 5);

  const container = scene.add.container(0, 0, [g, text]);
  container.setSize(width, height);
  // The hit area is NOT centred on the container even though its children are. Phaser adds
  // the object's displayOrigin (half the size, here) to the local point before testing, so
  // a rectangle at (-w/2, -h/2) ends up shifted a half-button up and left: the visible
  // right and bottom halves stop responding and clicks dead-centre land exactly on the
  // excluded edge. Anchoring it at (0, 0) is what lines the hit area up with the button.
  container.setInteractive(
    new Phaser.Geom.Rectangle(0, 0, width, height),
    Phaser.Geom.Rectangle.Contains,
  );

  container.on('pointerover', () => {
    if (state !== 'pressed') draw('hover');
  });
  container.on('pointerout', () => {
    draw('idle');
    container.setScale(1);
  });
  container.on('pointerdown', () => {
    // Paint first, act second: this is what makes the tap feel immediate.
    draw('pressed');
    container.setScale(0.97);
    onPress?.();
    onClick();
  });
  // A press that ends without the scene changing (a no-op button, a cancelled tap) has to
  // find its way back to a normal state.
  container.on('pointerup', () => {
    if (!container.scene) return;
    draw('hover');
    container.setScale(1);
  });

  return container;
}
