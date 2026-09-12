import Phaser from 'phaser';
import { TEX_SCALE } from '../graphics/TextureFactory';
import { Depth, Tex } from '../utils/Constants';

const CORE_COLOR = 0x2ee6ff;

/**
 * The Signal Core lying on the ground.
 *
 * It is deliberately over-designed compared with ordinary loot - a rotating ring, a
 * pulsing halo and a beacon column - so a new player can tell at a glance that it is not
 * just another gun.
 */
export class SignalCore extends Phaser.GameObjects.Container {
  private readonly halo: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Image;
  private readonly outerRing: Phaser.GameObjects.Image;
  private readonly core: Phaser.GameObjects.Image;
  private readonly beacon: Phaser.GameObjects.Image;
  private seed = Math.random() * Math.PI * 2;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.halo = scene.add
      .image(0, 0, Tex.SoftGlow)
      .setScale(TEX_SCALE * 2.6)
      .setTint(CORE_COLOR)
      .setAlpha(0.35)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.outerRing = scene.add
      .image(0, 0, Tex.Ring)
      .setScale(TEX_SCALE * 1.5)
      .setTint(CORE_COLOR)
      .setAlpha(0.5);
    this.ring = scene.add
      .image(0, 0, Tex.Ring)
      .setScale(TEX_SCALE * 1.05)
      .setTint(0xffffff)
      .setAlpha(0.8);
    this.beacon = scene.add
      .image(0, -46, Tex.SoftGlow)
      .setScale(TEX_SCALE * 0.5, TEX_SCALE * 2.2)
      .setTint(CORE_COLOR)
      .setAlpha(0.28)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.core = scene.add.image(0, 0, Tex.SignalCore).setScale(TEX_SCALE);

    this.add([this.halo, this.beacon, this.outerRing, this.ring, this.core]);
    this.setDepth(Depth.Effect - 2);
    scene.add.existing(this);
  }

  /** Cosmetic animation; driven from SignalSystem so it stops with the match. */
  animate(time: number): void {
    const pulse = Math.sin(time * 0.004 + this.seed);
    this.core.setScale(TEX_SCALE * (1 + pulse * 0.08));
    this.core.rotation += 0.004;
    this.ring.rotation -= 0.012;
    this.outerRing.rotation += 0.006;
    this.outerRing.setScale(TEX_SCALE * (1.5 + pulse * 0.16));
    this.halo.setAlpha(0.3 + pulse * 0.12);
    this.beacon.setAlpha(0.22 + pulse * 0.1);
  }

  /** Pops the core when it is dropped by a dying holder. */
  playDropAnimation(): void {
    this.setScale(0.3);
    this.scene.tweens.add({ targets: this, scale: 1, duration: 320, ease: 'Back.easeOut' });
  }
}
