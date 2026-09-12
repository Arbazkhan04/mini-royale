import Phaser from 'phaser';
import { TEX_SCALE } from '../graphics/TextureFactory';
import { Depth, Tex } from '../utils/Constants';
import type { Combatant } from './Combatant';

/**
 * A pooled projectile. Bullets are swept manually by CombatSystem rather than driven by
 * arcade physics so that fast rounds cannot tunnel through thin walls.
 */
export class Bullet extends Phaser.GameObjects.Image {
  owner: Combatant | null = null;
  ownerId = -1;
  damage = 0;
  speed = 0;
  dirX = 0;
  dirY = 0;
  remaining = 0;
  weaponLabel = '';
  /** Set for shotgun pellets so hit feedback can be toned down. */
  isPellet = false;
  /** Damage this round deals to destructible wooden cover. */
  coverDamage = 0;
  /** Rounds that punch through thin wood have one pass available. */
  penetrationsLeft = 0;
  /** Collider this bullet has already passed through, so it cannot re-hit it. */
  ignoreColliderId = -1;
  /** Extra hit radius from touch aim assistance; zero for everyone else. */
  hitPadding = 0;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, Tex.Bullet);
    scene.add.existing(this);
    this.setDepth(Depth.Bullet);
    this.setActive(false);
    this.setVisible(false);
  }

  launch(
    x: number,
    y: number,
    angle: number,
    speed: number,
    range: number,
    damage: number,
    owner: Combatant,
    label: string,
    color: number,
    length: number,
    isPellet: boolean,
    coverDamage: number,
    penetrations: number,
    hitPadding: number,
  ): void {
    this.setPosition(x, y);
    this.setRotation(angle);
    this.dirX = Math.cos(angle);
    this.dirY = Math.sin(angle);
    this.speed = speed;
    this.remaining = range;
    this.damage = damage;
    this.owner = owner;
    this.ownerId = owner.combatantId;
    this.weaponLabel = label;
    this.isPellet = isPellet;
    this.coverDamage = coverDamage;
    this.penetrationsLeft = penetrations;
    this.hitPadding = hitPadding;
    this.ignoreColliderId = -1;
    this.setTint(color);
    this.setScale(TEX_SCALE * (length / 32), TEX_SCALE * 0.85);
    this.setAlpha(1);
    this.setActive(true);
    this.setVisible(true);
  }

  deactivate(): void {
    this.setActive(false);
    this.setVisible(false);
    this.owner = null;
    this.ownerId = -1;
  }
}
