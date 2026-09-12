import Phaser from 'phaser';
import { PERF } from '../config/GameConfig';
import { TEX_SCALE } from '../graphics/TextureFactory';
import { Depth, Tex, WeaponType } from '../utils/Constants';
import type { Combatant } from '../entities/Combatant';

interface Particle {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  drag: number;
  life: number;
  maxLife: number;
  scaleFrom: number;
  scaleTo: number;
  alphaFrom: number;
  alphaTo: number;
  spin: number;
  active: boolean;
}

interface FloatingText {
  text: Phaser.GameObjects.Text;
  vy: number;
  life: number;
  maxLife: number;
  active: boolean;
}

/**
 * Pooled particle and floating-text effects. Everything is driven by a single manual
 * update loop instead of per-effect tweens, which keeps allocations flat during fights.
 */
export class ParticleSystem {
  private readonly pool: Particle[] = [];
  private readonly texts: FloatingText[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  // ------------------------------------------------------------------ pool

  private acquire(texture: string): Particle | null {
    for (const p of this.pool) {
      if (!p.active) {
        p.sprite.setTexture(texture);
        return p;
      }
    }
    if (this.pool.length >= PERF.maxParticles) return null;
    const sprite = this.scene.add.image(0, 0, texture).setActive(false).setVisible(false);
    sprite.setDepth(Depth.Effect);
    const particle: Particle = {
      sprite,
      vx: 0,
      vy: 0,
      drag: 0,
      life: 0,
      maxLife: 1,
      scaleFrom: 1,
      scaleTo: 1,
      alphaFrom: 1,
      alphaTo: 0,
      spin: 0,
      active: false,
    };
    this.pool.push(particle);
    return particle;
  }

  private emit(
    texture: string,
    x: number,
    y: number,
    opts: {
      vx?: number;
      vy?: number;
      drag?: number;
      lifeMs: number;
      scaleFrom: number;
      scaleTo?: number;
      alphaFrom?: number;
      alphaTo?: number;
      tint?: number;
      rotation?: number;
      spin?: number;
      depth?: number;
      blend?: Phaser.BlendModes;
    },
  ): Particle | null {
    const p = this.acquire(texture);
    if (!p) return null;
    p.active = true;
    p.vx = opts.vx ?? 0;
    p.vy = opts.vy ?? 0;
    p.drag = opts.drag ?? 3;
    p.life = 0;
    p.maxLife = opts.lifeMs;
    p.scaleFrom = opts.scaleFrom;
    p.scaleTo = opts.scaleTo ?? opts.scaleFrom;
    p.alphaFrom = opts.alphaFrom ?? 1;
    p.alphaTo = opts.alphaTo ?? 0;
    p.spin = opts.spin ?? 0;

    const s = p.sprite;
    s.setActive(true).setVisible(true);
    s.setPosition(x, y);
    s.setScale(p.scaleFrom);
    s.setAlpha(p.alphaFrom);
    s.setRotation(opts.rotation ?? 0);
    s.setDepth(opts.depth ?? Depth.Effect);
    s.setBlendMode(opts.blend ?? Phaser.BlendModes.NORMAL);
    if (opts.tint !== undefined) s.setTint(opts.tint);
    else s.clearTint();
    return p;
  }

  update(delta: number): void {
    const dt = delta / 1000;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life += delta;
      const t = p.life / p.maxLife;
      if (t >= 1) {
        p.active = false;
        p.sprite.setActive(false).setVisible(false);
        continue;
      }
      const dragFactor = Math.max(0, 1 - p.drag * dt);
      p.vx *= dragFactor;
      p.vy *= dragFactor;
      const s = p.sprite;
      s.x += p.vx * dt;
      s.y += p.vy * dt;
      s.setScale(p.scaleFrom + (p.scaleTo - p.scaleFrom) * t);
      s.setAlpha(p.alphaFrom + (p.alphaTo - p.alphaFrom) * t);
      if (p.spin !== 0) s.rotation += p.spin * dt;
    }

    for (const ft of this.texts) {
      if (!ft.active) continue;
      ft.life += delta;
      const t = ft.life / ft.maxLife;
      if (t >= 1) {
        ft.active = false;
        ft.text.setActive(false).setVisible(false);
        continue;
      }
      ft.text.y += ft.vy * dt;
      ft.text.setAlpha(1 - t * t);
      ft.text.setScale(1 + (1 - t) * 0.25);
    }
  }

  // ------------------------------------------------------------------ effects

  muzzleFlash(x: number, y: number, angle: number, type: WeaponType): void {
    const big = type === WeaponType.Shotgun || type === WeaponType.Sniper || type === WeaponType.LMG;
    this.emit(Tex.Muzzle, x, y, {
      lifeMs: big ? 90 : 62,
      scaleFrom: TEX_SCALE * (big ? 1.15 : 0.8),
      scaleTo: TEX_SCALE * (big ? 1.4 : 0.95),
      alphaFrom: 0.95,
      rotation: angle,
      tint: 0xfff0b8,
      drag: 0,
      blend: Phaser.BlendModes.ADD,
    });
    this.emit(Tex.SoftGlow, x, y, {
      lifeMs: 110,
      scaleFrom: TEX_SCALE * (big ? 1.5 : 1.0),
      scaleTo: TEX_SCALE * (big ? 2.1 : 1.4),
      alphaFrom: 0.55,
      tint: 0xffd27a,
      drag: 0,
      blend: Phaser.BlendModes.ADD,
    });
    for (let i = 0; i < (big ? 5 : 3); i++) {
      const a = angle + (Math.random() - 0.5) * 0.55;
      const speed = 120 + Math.random() * 220;
      this.emit(Tex.Spark, x, y, {
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        lifeMs: 150 + Math.random() * 120,
        scaleFrom: TEX_SCALE * 0.7,
        scaleTo: TEX_SCALE * 0.2,
        tint: 0xffd06a,
        rotation: a,
        drag: 5,
        blend: Phaser.BlendModes.ADD,
      });
    }
    this.emit(Tex.Smoke, x, y, {
      vx: Math.cos(angle) * 40,
      vy: Math.sin(angle) * 40,
      lifeMs: 380,
      scaleFrom: TEX_SCALE * 0.35,
      scaleTo: TEX_SCALE * 0.95,
      alphaFrom: 0.28,
      tint: 0xd8d2c6,
      drag: 2,
    });
  }

  shellCasing(x: number, y: number, angle: number): void {
    const a = angle + Math.PI / 2 + (Math.random() - 0.5) * 0.5;
    const speed = 90 + Math.random() * 90;
    this.emit(Tex.Spark, x, y, {
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      lifeMs: 520,
      scaleFrom: TEX_SCALE * 0.5,
      scaleTo: TEX_SCALE * 0.42,
      alphaFrom: 1,
      alphaTo: 0,
      tint: 0xd4a94a,
      spin: 14,
      drag: 4,
      depth: Depth.Decal + 1,
    });
  }

  impact(x: number, y: number, nx: number, ny: number): void {
    const base = Math.atan2(ny, nx);
    for (let i = 0; i < 5; i++) {
      const a = base + (Math.random() - 0.5) * 1.5;
      const speed = 90 + Math.random() * 200;
      this.emit(Tex.Spark, x, y, {
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        lifeMs: 200 + Math.random() * 160,
        scaleFrom: TEX_SCALE * 0.55,
        scaleTo: TEX_SCALE * 0.15,
        tint: 0xffe6a0,
        rotation: a,
        drag: 6,
        blend: Phaser.BlendModes.ADD,
      });
    }
    this.emit(Tex.Smoke, x, y, {
      lifeMs: 320,
      scaleFrom: TEX_SCALE * 0.25,
      scaleTo: TEX_SCALE * 0.7,
      alphaFrom: 0.4,
      tint: 0xcfc8bb,
      drag: 3,
    });
  }

  bloodSpray(x: number, y: number, dx: number, dy: number, intensity: number): void {
    const count = Math.max(3, Math.round(7 * intensity));
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < count; i++) {
      const a = base + (Math.random() - 0.5) * 1.1;
      const speed = 110 + Math.random() * 190 * intensity;
      this.emit(Tex.Blood, x, y, {
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        lifeMs: 300 + Math.random() * 220,
        scaleFrom: TEX_SCALE * (0.4 + Math.random() * 0.5) * intensity,
        scaleTo: TEX_SCALE * 0.12,
        tint: 0xc0243a,
        drag: 5,
      });
    }
    // A short-lived ground stain sells the hit without leaking objects.
    this.emit(Tex.Blood, x + dx * 6, y + dy * 6, {
      lifeMs: 2600,
      scaleFrom: TEX_SCALE * 1.1 * intensity,
      scaleTo: TEX_SCALE * 1.5 * intensity,
      alphaFrom: 0.5,
      alphaTo: 0,
      tint: 0x8c1a2a,
      drag: 0,
      depth: Depth.Decal,
    });
  }

  /** Sparks off body armor - visually distinct from a flesh hit. */
  armorHit(x: number, y: number, dx: number, dy: number): void {
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < 6; i++) {
      const a = base + (Math.random() - 0.5) * 1.6;
      this.emit(Tex.Spark, x, y, {
        vx: Math.cos(a) * (140 + Math.random() * 200),
        vy: Math.sin(a) * (140 + Math.random() * 200),
        lifeMs: 220 + Math.random() * 160,
        scaleFrom: TEX_SCALE * 0.6,
        scaleTo: TEX_SCALE * 0.1,
        tint: 0x9fd6ff,
        rotation: a,
        drag: 6,
        blend: Phaser.BlendModes.ADD,
      });
    }
  }

  /** Hexagonal flare when a Signal shield soaks a hit. */
  shieldHit(x: number, y: number): void {
    this.emit(Tex.Ring, x, y, {
      lifeMs: 320,
      scaleFrom: TEX_SCALE * 0.7,
      scaleTo: TEX_SCALE * 1.2,
      alphaFrom: 0.9,
      tint: 0x7ce8a0,
      drag: 0,
      blend: Phaser.BlendModes.ADD,
    });
  }

  footstepDust(x: number, y: number): void {
    this.emit(Tex.Smoke, x, y, {
      vx: (Math.random() - 0.5) * 24,
      vy: (Math.random() - 0.5) * 24,
      lifeMs: 420,
      scaleFrom: TEX_SCALE * 0.2,
      scaleTo: TEX_SCALE * 0.5,
      alphaFrom: 0.22,
      tint: 0xd9cfbc,
      drag: 3,
      depth: Depth.Decal + 1,
    });
  }

  deathBurst(x: number, y: number, color: number): void {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 240;
      this.emit(Tex.Blood, x, y, {
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        lifeMs: 420 + Math.random() * 260,
        scaleFrom: TEX_SCALE * 0.8,
        scaleTo: TEX_SCALE * 0.15,
        tint: i % 3 === 0 ? color : 0xc0243a,
        drag: 4,
      });
    }
    this.emit(Tex.SoftGlow, x, y, {
      lifeMs: 460,
      scaleFrom: TEX_SCALE * 0.6,
      scaleTo: TEX_SCALE * 2.4,
      alphaFrom: 0.5,
      tint: 0xff6b6b,
      drag: 0,
      blend: Phaser.BlendModes.ADD,
    });
  }

  healBurst(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit(Tex.Spark, x, y, {
        vx: Math.cos(a) * 60,
        vy: Math.sin(a) * 60 - 40,
        lifeMs: 560,
        scaleFrom: TEX_SCALE * 0.6,
        scaleTo: TEX_SCALE * 0.1,
        tint: 0x6bdc8a,
        rotation: a,
        drag: 2,
        blend: Phaser.BlendModes.ADD,
      });
    }
  }

  /** Continuous green pulse under a combatant while they bandage. */
  healingAura(target: Combatant): void {
    this.emit(Tex.Ring, target.x, target.y, {
      lifeMs: 700,
      scaleFrom: TEX_SCALE * 0.4,
      scaleTo: TEX_SCALE * 1.3,
      alphaFrom: 0.75,
      tint: 0x6bdc8a,
      drag: 0,
      depth: Depth.Decal + 3,
    });
  }

  meleeArc(x: number, y: number, angle: number): void {
    this.emit(Tex.Muzzle, x + Math.cos(angle) * 26, y + Math.sin(angle) * 26, {
      lifeMs: 130,
      scaleFrom: TEX_SCALE * 0.7,
      scaleTo: TEX_SCALE * 1.1,
      alphaFrom: 0.6,
      rotation: angle,
      tint: 0xdfe8f2,
      drag: 0,
    });
  }

  lootPickup(x: number, y: number, color: number): void {
    this.emit(Tex.Ring, x, y, {
      lifeMs: 380,
      scaleFrom: TEX_SCALE * 0.35,
      scaleTo: TEX_SCALE * 1.1,
      alphaFrom: 0.9,
      tint: color,
      drag: 0,
      depth: Depth.Loot + 1,
    });
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit(Tex.Spark, x, y, {
        vx: Math.cos(a) * 90,
        vy: Math.sin(a) * 90,
        lifeMs: 320,
        scaleFrom: TEX_SCALE * 0.5,
        scaleTo: TEX_SCALE * 0.1,
        tint: color,
        rotation: a,
        drag: 5,
        blend: Phaser.BlendModes.ADD,
      });
    }
  }

  /** Wood shards when destructible cover takes damage or breaks apart. */
  splinterBurst(x: number, y: number, intensity: number): void {
    const count = Math.round(4 + 8 * intensity);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 240 * intensity;
      this.emit(Tex.Splinter, x, y, {
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        lifeMs: 380 + Math.random() * 320,
        scaleFrom: TEX_SCALE * (0.7 + Math.random() * 0.6),
        scaleTo: TEX_SCALE * 0.4,
        tint: Math.random() < 0.5 ? 0x9a6f42 : 0x6f5029,
        rotation: a,
        spin: (Math.random() - 0.5) * 18,
        drag: 4,
      });
    }
    this.emit(Tex.Smoke, x, y, {
      lifeMs: 420,
      scaleFrom: TEX_SCALE * 0.3,
      scaleTo: TEX_SCALE * 0.9,
      alphaFrom: 0.35 * intensity,
      tint: 0xc9b294,
      drag: 3,
    });
  }

  /** Streak left behind by a dash. */
  dashTrail(x: number, y: number, angle: number, color: number): void {
    for (let i = 0; i < 6; i++) {
      const back = angle + Math.PI;
      const dist = i * 16;
      this.emit(Tex.SoftGlow, x + Math.cos(back) * dist, y + Math.sin(back) * dist, {
        lifeMs: 260 + i * 30,
        scaleFrom: TEX_SCALE * (0.9 - i * 0.1),
        scaleTo: TEX_SCALE * 0.2,
        alphaFrom: 0.5 - i * 0.06,
        tint: color,
        drag: 0,
        blend: Phaser.BlendModes.ADD,
      });
    }
  }

  /** Generic ability activation flash. */
  abilityBurst(x: number, y: number, color: number): void {
    this.emit(Tex.Ring, x, y, {
      lifeMs: 480,
      scaleFrom: TEX_SCALE * 0.4,
      scaleTo: TEX_SCALE * 2.0,
      alphaFrom: 0.95,
      tint: color,
      drag: 0,
      depth: Depth.Effect,
    });
    this.emit(Tex.SoftGlow, x, y, {
      lifeMs: 380,
      scaleFrom: TEX_SCALE * 0.6,
      scaleTo: TEX_SCALE * 2.2,
      alphaFrom: 0.6,
      tint: color,
      drag: 0,
      blend: Phaser.BlendModes.ADD,
    });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.emit(Tex.Spark, x, y, {
        vx: Math.cos(a) * 220,
        vy: Math.sin(a) * 220,
        lifeMs: 380,
        scaleFrom: TEX_SCALE * 0.7,
        scaleTo: TEX_SCALE * 0.1,
        tint: color,
        rotation: a,
        drag: 4,
        blend: Phaser.BlendModes.ADD,
      });
    }
  }

  /** Expanding sweep for the drone scan. */
  scanPulse(x: number, y: number, radius: number, color: number): void {
    this.emit(Tex.Ring, x, y, {
      lifeMs: 900,
      scaleFrom: TEX_SCALE * 0.4,
      scaleTo: (radius * 2) / 72,
      alphaFrom: 0.8,
      alphaTo: 0,
      tint: color,
      drag: 0,
      depth: Depth.Effect,
    });
  }

  zonePulse(x: number, y: number, radius: number): void {
    this.emit(Tex.Ring, x, y, {
      lifeMs: 900,
      scaleFrom: (radius * 2) / 72,
      scaleTo: ((radius * 2) / 72) * 1.04,
      alphaFrom: 0.5,
      tint: 0x59d6ff,
      drag: 0,
      depth: Depth.ZoneOverlay - 1,
    });
  }

  damageNumber(x: number, y: number, amount: number, headshot: boolean): void {
    let slot = this.texts.find((t) => !t.active);
    if (!slot) {
      if (this.texts.length >= 14) return;
      const text = this.scene.add
        .text(0, 0, '', {
          fontFamily: 'Trebuchet MS, sans-serif',
          fontSize: '16px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5, 0.5)
        .setDepth(Depth.Effect + 5);
      text.setShadow(0, 2, '#000000', 3);
      slot = { text, vy: -46, life: 0, maxLife: 700, active: false };
      this.texts.push(slot);
    }
    slot.active = true;
    slot.life = 0;
    slot.maxLife = 720;
    slot.vy = -48;
    slot.text
      .setActive(true)
      .setVisible(true)
      .setPosition(x + (Math.random() - 0.5) * 16, y)
      .setAlpha(1)
      .setText(headshot ? `${amount}!` : `${amount}`)
      .setColor(headshot ? '#ffd257' : '#ffffff')
      .setFontSize(headshot ? 20 : 16);
  }

  reset(): void {
    for (const p of this.pool) {
      p.active = false;
      p.sprite.setActive(false).setVisible(false);
    }
    for (const t of this.texts) {
      t.active = false;
      t.text.setActive(false).setVisible(false);
    }
  }
}
