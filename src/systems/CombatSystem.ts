import Phaser from 'phaser';
import { ARMOR, CAMERA_SHAKE, COMBAT } from '../config/GameConfig';
import { ArmorLevel, GameEvent } from '../utils/Constants';
import { angleBetween, clamp, degToRad, distance, pointSegmentDistance } from '../utils/MathUtils';
import { Bullet } from '../entities/Bullet';
import type { Combatant } from '../entities/Combatant';
import type { MatchContext } from './MatchContext';

export interface FireIntent {
  /** Trigger is held down this frame. */
  held: boolean;
  /** Trigger went down this frame (required by semi-automatic weapons). */
  pressed: boolean;
}

export interface DamageInfo {
  amount: number;
  source: Combatant | null;
  weaponLabel: string;
  headshot: boolean;
  /** Direction the damage came from, for the player's damage indicator. */
  fromAngle: number;
}

/**
 * Firing, projectile simulation and the damage pipeline.
 *
 * Damage flows: base -> headshot -> helmet -> body armor (absorb + durability) -> health.
 */
export class CombatSystem {
  private readonly bullets: Bullet[] = [];
  private ctx!: MatchContext;

  constructor(private readonly scene: Phaser.Scene) {}

  bind(ctx: MatchContext): void {
    this.ctx = ctx;
  }

  get activeBulletCount(): number {
    let n = 0;
    for (const b of this.bullets) if (b.active) n++;
    return n;
  }

  // ------------------------------------------------------------------ firing

  /** Entry point for both the player and the AI. Returns true when a shot happened. */
  tryFire(shooter: Combatant, intent: FireIntent): boolean {
    if (!shooter.alive || !this.ctx.running) return false;
    const weapon = shooter.weapon;

    if (weapon.isMelee) {
      if (!intent.held && !intent.pressed) return false;
      if (this.ctx.now < weapon.nextShotAt) return false;
      this.meleeSwing(shooter);
      return true;
    }

    // Mid-burst rounds keep firing even after the trigger is released.
    const continuingBurst = weapon.base.burst > 1 && weapon.burstRemaining > 0;
    if (!continuingBurst) {
      if (weapon.base.auto ? !intent.held : !intent.pressed) return false;
    }

    if (weapon.reloading) return false;
    if (this.ctx.now < weapon.nextShotAt) return false;

    if (weapon.isEmpty) {
      if (intent.pressed) {
        this.ctx.audio.play('empty', shooter.x, shooter.y);
        weapon.nextShotAt = this.ctx.now + 320;
        shooter.tryReload();
      }
      return false;
    }

    this.fireWeapon(shooter);
    return true;
  }

  private fireWeapon(shooter: Combatant): void {
    const weapon = shooter.weapon;
    const stats = weapon.base;
    const now = this.ctx.now;

    const muzzle = shooter.muzzlePoint();
    const baseAngle = shooter.rotation;

    let spread = weapon.spreadDeg;
    if (shooter.isMoving) spread += stats.moveSpreadDeg;
    spread += (Math.abs(weapon.recoil) * 180) / Math.PI * 0.35;

    for (let i = 0; i < stats.pellets; i++) {
      const jitter = degToRad(this.ctx.rng.gaussian() * spread);
      const angle = baseAngle + jitter;
      const bullet = this.acquireBullet();
      bullet.launch(
        muzzle.x,
        muzzle.y,
        angle,
        stats.bulletSpeed,
        stats.range,
        weapon.damage,
        shooter,
        stats.shortName,
        stats.bulletColor,
        stats.bulletLength,
        stats.pellets > 1,
        stats.coverDamage,
        stats.penetratesWood ? 1 : 0,
        shooter.isPlayer ? this.ctx.aimAssist.hitPadding : 0,
      );
    }

    weapon.registerShot(now);
    shooter.onFired();
    shooter.stats.shotsFired += stats.pellets;

    this.ctx.effects.muzzleFlash(muzzle.x, muzzle.y, baseAngle, stats.type);
    this.ctx.effects.shellCasing(muzzle.x, muzzle.y, baseAngle);
    this.ctx.audio.play(stats.sound, shooter.x, shooter.y);
    this.ctx.reportGunshot(shooter.x, shooter.y, shooter, stats.noiseRadius);

    if (shooter.isPlayer && stats.shake !== 'none') {
      const shake = CAMERA_SHAKE[stats.shake];
      this.scene.cameras.main.shake(shake.duration, shake.intensity, true);
    }

    if (weapon.isEmpty) shooter.tryReload();
  }

  /** Melee is a short arc test rather than a projectile. */
  private meleeSwing(shooter: Combatant): void {
    const weapon = shooter.weapon;
    weapon.registerShot(this.ctx.now);
    shooter.onFired();
    shooter.stats.shotsFired += 1;
    this.ctx.audio.play('melee', shooter.x, shooter.y);
    this.ctx.effects.meleeArc(shooter.x, shooter.y, shooter.rotation);

    const reach = weapon.base.range;
    const halfArc = degToRad(COMBAT.meleeArcDeg / 2);

    // A knife can hack a door open, just slowly.
    const swingX = shooter.x + Math.cos(shooter.rotation) * reach * 0.7;
    const swingY = shooter.y + Math.sin(shooter.rotation) * reach * 0.7;
    const coverHit = this.ctx.collision.raycastStatic(shooter.x, shooter.y, swingX, swingY, false);
    if (coverHit?.collider.source?.destructible) {
      this.ctx.damageCover(
        coverHit.collider.source,
        weapon.base.coverDamage,
        coverHit.hit.x,
        coverHit.hit.y,
      );
    }
    for (const other of this.ctx.combatants) {
      if (other === shooter || !other.alive) continue;
      const d = distance(shooter.x, shooter.y, other.x, other.y);
      if (d > reach + other.radius) continue;
      const angle = angleBetween(shooter.x, shooter.y, other.x, other.y);
      if (Math.abs(Phaser.Math.Angle.Wrap(angle - shooter.rotation)) > halfArc) continue;
      if (!this.ctx.collision.hasLineOfSight(shooter.x, shooter.y, other.x, other.y)) continue;
      shooter.stats.shotsHit += 1;
      this.applyDamage(other, {
        amount: weapon.damage,
        source: shooter,
        weaponLabel: weapon.shortName,
        headshot: false,
        fromAngle: angle,
      });
      break;
    }
  }

  // ------------------------------------------------------------------ projectiles

  private recycleCursor = 0;

  private acquireBullet(): Bullet {
    for (const b of this.bullets) {
      if (!b.active) return b;
    }
    if (this.bullets.length < COMBAT.maxBullets) {
      const bullet = new Bullet(this.scene);
      this.bullets.push(bullet);
      return bullet;
    }
    // Pool exhausted: recycle round-robin so no single shooter starves the others.
    const recycled = this.bullets[this.recycleCursor % this.bullets.length] as Bullet;
    this.recycleCursor = (this.recycleCursor + 1) % this.bullets.length;
    recycled.deactivate();
    return recycled;
  }

  update(delta: number): void {
    const dt = delta / 1000;
    for (const bullet of this.bullets) {
      if (!bullet.active) continue;
      let step = bullet.speed * dt;
      if (step > bullet.remaining) step = bullet.remaining;
      const x0 = bullet.x;
      const y0 = bullet.y;
      const x1 = x0 + bullet.dirX * step;
      const y1 = y0 + bullet.dirY * step;

      const staticHit = this.ctx.collision.raycastStatic(x0, y0, x1, y1, true, bullet.ignoreColliderId);
      const entityHit = this.findEntityHit(bullet, x0, y0, x1, y1);

      const staticT = staticHit ? staticHit.hit.t : Infinity;
      const entityT = entityHit ? entityHit.t : Infinity;

      if (entityT <= staticT && entityHit) {
        const target = entityHit.target;
        const hx = x0 + (x1 - x0) * entityHit.t;
        const hy = y0 + (y1 - y0) * entityHit.t;
        this.onBulletHitCombatant(bullet, target, hx, hy);
        bullet.deactivate();
        continue;
      }
      if (staticHit) {
        const cover = staticHit.collider.source;
        const wooden = cover !== null && cover.destructible;
        if (wooden && cover) {
          this.ctx.damageCover(cover, bullet.coverDamage, staticHit.hit.x, staticHit.hit.y);
        } else {
          this.ctx.effects.impact(staticHit.hit.x, staticHit.hit.y, staticHit.hit.nx, staticHit.hit.ny);
          this.ctx.audio.play('impact', staticHit.hit.x, staticHit.hit.y, 0.5);
        }

        // Sniper rounds carry on through one thin wooden object.
        if (wooden && cover && cover.thin && bullet.penetrationsLeft > 0) {
          bullet.penetrationsLeft--;
          bullet.ignoreColliderId = staticHit.collider.id;
          const travelled = step * staticHit.hit.t;
          bullet.setPosition(
            staticHit.hit.x + bullet.dirX * 8,
            staticHit.hit.y + bullet.dirY * 8,
          );
          bullet.remaining -= travelled + 8;
          if (bullet.remaining <= 0.5) bullet.deactivate();
          continue;
        }

        bullet.deactivate();
        continue;
      }

      bullet.setPosition(x1, y1);
      bullet.remaining -= step;
      if (bullet.remaining <= 0.5) bullet.deactivate();
    }
  }

  private findEntityHit(
    bullet: Bullet,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): { t: number; target: Combatant } | null {
    let best: { t: number; target: Combatant } | null = null;
    for (const c of this.ctx.combatants) {
      if (!c.alive || c.combatantId === bullet.ownerId) continue;
      if (this.ctx.now < c.spawnProtectionUntil) continue;
      const d = pointSegmentDistance(c.x, c.y, x0, y0, x1, y1);
      if (d > c.radius + bullet.hitPadding) continue;
      // Approximate the hit fraction by projecting the body centre onto the segment.
      const segLen = Math.hypot(x1 - x0, y1 - y0) || 1;
      const t = clamp(((c.x - x0) * (x1 - x0) + (c.y - y0) * (y1 - y0)) / (segLen * segLen), 0, 1);
      if (!best || t < best.t) best = { t, target: c };
    }
    return best;
  }

  private onBulletHitCombatant(bullet: Bullet, target: Combatant, hx: number, hy: number): void {
    const shooter = bullet.owner;
    const headshot = !bullet.isPellet && this.ctx.rng.next() < COMBAT.headshotChanceZone;
    if (shooter) shooter.stats.shotsHit += 1;
    this.ctx.effects.bloodSpray(hx, hy, bullet.dirX, bullet.dirY, bullet.isPellet ? 0.5 : 1);
    this.applyDamage(target, {
      amount: bullet.damage * (headshot ? COMBAT.headshotMultiplier : 1),
      source: shooter,
      weaponLabel: bullet.weaponLabel,
      headshot,
      fromAngle: Math.atan2(bullet.dirY, bullet.dirX) + Math.PI,
    });
  }

  // ------------------------------------------------------------------ damage

  /** The single funnel every damage source goes through, including the zone. */
  applyDamage(target: Combatant, info: DamageInfo): void {
    if (!target.alive) return;
    if (info.source && this.ctx.now < target.spawnProtectionUntil) return;

    let damage = info.amount;
    const inv = target.inventory;

    // One-shot mode: the player's rounds go straight through shield and armor. Damage
    // taken by the player is never affected by this.
    const shooter = info.source;
    if (COMBAT.playerOneShotKills && shooter !== null && shooter.isPlayer) {
      const dealt = Math.max(1, Math.ceil(target.health));
      target.registerHitTaken(shooter);
      target.applyHealth(0);
      shooter.stats.damageDealt += dealt;
      this.ctx.effects.damageNumber(target.x, target.y - 26, dealt, true);
      this.ctx.audio.play('hitmarker', target.x, target.y, 0.5);
      this.kill(target, shooter, info.weaponLabel);
      return;
    }

    // Signal shield soaks first, then the helmet, then body armor.
    const beforeShield = damage;
    damage = target.absorbWithShield(damage);
    const shieldAbsorbed = beforeShield - damage;
    if (shieldAbsorbed > 0) this.ctx.effects.shieldHit(target.x, target.y);

    if (info.headshot && inv.helmetLevel > ArmorLevel.None) {
      const reduce = ARMOR.helmetMitigation[inv.helmetLevel] ?? 0;
      const absorbed = damage * reduce;
      damage -= absorbed;
      inv.helmetDurability -= absorbed;
      if (inv.helmetDurability <= 0) {
        inv.helmetLevel = ArmorLevel.None;
        inv.helmetDurability = 0;
      }
    }

    let armorAbsorbed = 0;
    if (inv.armorLevel > ArmorLevel.None && inv.armorDurability > 0) {
      const reduce = ARMOR.mitigation[inv.armorLevel] ?? 0;
      const absorbed = Math.min(damage * reduce, inv.armorDurability);
      armorAbsorbed = absorbed;
      damage -= absorbed;
      inv.armorDurability -= absorbed;
      if (inv.armorDurability <= 0) {
        inv.armorLevel = ArmorLevel.None;
        inv.armorDurability = 0;
      }
    }

    damage = Math.max(shieldAbsorbed > 0 && damage <= 0 ? 0 : 1, Math.round(damage));
    if (armorAbsorbed > 0) {
      this.ctx.effects.armorHit(target.x, target.y, Math.cos(info.fromAngle + Math.PI), Math.sin(info.fromAngle + Math.PI));
    }
    target.registerHitTaken(info.source);
    target.applyHealth(target.health - damage);

    if (info.source) {
      info.source.stats.damageDealt += damage;
      if (info.source.isPlayer) {
        this.ctx.effects.damageNumber(target.x, target.y - 26, damage, info.headshot);
        this.ctx.audio.play('hitmarker', target.x, target.y, 0.4);
      }
    }

    if (target.isPlayer) {
      this.ctx.events.emit(GameEvent.PlayerDamaged, damage, info.fromAngle, target.health);
      const shake = CAMERA_SHAKE.light;
      this.scene.cameras.main.shake(shake.duration, shake.intensity * 1.4, true);
      this.ctx.audio.play('playerHit', target.x, target.y);
    }

    if (target.health <= 0) {
      this.kill(target, info.source, info.weaponLabel);
    }
  }

  kill(target: Combatant, killer: Combatant | null, weaponLabel: string): void {
    if (!target.alive) return;
    target.die();
    if (killer && killer !== target) killer.stats.kills += 1;
    this.ctx.loot.dropLootFrom(target);
    this.ctx.audio.play('death', target.x, target.y);
    this.ctx.reportKill(target, killer, weaponLabel);
  }

  /** Clears all live projectiles, used when the match ends. */
  reset(): void {
    for (const b of this.bullets) b.deactivate();
  }
}
