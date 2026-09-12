import Phaser from 'phaser';
import { PALETTE } from '../config/GameConfig';
import { WEAPONS } from '../config/WeaponConfig';
import type { WeaponId, WeaponStats } from '../config/WeaponConfig';
import { Tex, weaponTexture } from '../utils/Constants';
import { Rng } from '../utils/RandomUtils';

/**
 * Every texture is generated at 2x and drawn at half scale, which keeps rotating
 * sprites crisp on high-DPI screens without shipping any image files.
 */
export const TEX_SS = 2;
export const TEX_SCALE = 1 / TEX_SS;

/** Weapon sprites are authored in a fixed box; barrels are scaled to drawLength. */
export const WEAPON_TEX_UNITS = { width: 56, height: 26, gripX: 5, barrelLength: 46 };

type DrawFn = (g: Phaser.GameObjects.Graphics, w: number, h: number, rng: Rng) => void;

export class TextureFactory {
  private readonly rng = new Rng(0xa11ce);

  constructor(private readonly scene: Phaser.Scene) {}

  /** Creates every runtime texture. Safe to call once from BootScene. */
  generateAll(): void {
    this.groundTiles();
    this.floors();
    this.softTextures();
    this.props();
    this.characters();
    this.icons();
    this.weapons();
    this.signalArt();
  }

  // ------------------------------------------------------------------ helpers

  private shape(key: string, units: number, unitsH: number, draw: DrawFn): void {
    if (this.scene.textures.exists(key)) return;
    const w = Math.round(units * TEX_SS);
    const h = Math.round(unitsH * TEX_SS);
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g, w, h, this.rng);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private canvas(
    key: string,
    units: number,
    unitsH: number,
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  ): void {
    if (this.scene.textures.exists(key)) return;
    const w = Math.round(units * TEX_SS);
    const h = Math.round(unitsH * TEX_SS);
    const tex = this.scene.textures.createCanvas(key, w, h);
    if (!tex) return;
    const ctx = tex.getContext();
    draw(ctx, w, h);
    tex.refresh();
  }

  // ------------------------------------------------------------------ ground

  private groundTiles(): void {
    const tile = 160;
    this.tileTexture(Tex.Grass, tile, PALETTE.grassA, [PALETTE.grassB, PALETTE.grassC, 0x437f45], 46, 10, 26);
    this.tileTexture(Tex.Dirt, tile, PALETTE.dirt, [0x7d6440, 0x97794d, 0x6f5936], 40, 12, 30);
    this.tileTexture(Tex.Sand, tile, PALETTE.sand, [0xb59a63, 0xc9b078, 0xa78f5c], 38, 12, 30);
    this.tileTexture(Tex.Road, tile, PALETTE.road, [0x55595f, 0x63676e, 0x4e5257], 34, 10, 26);
    this.tileTexture(Tex.Concrete, tile, PALETTE.concrete, [0x848a92, 0x969ca4, 0x7c828a], 30, 12, 30);
  }

  /** Blotchy repeating tile. Blobs are drawn wrapped so the seams disappear. */
  private tileTexture(
    key: string,
    units: number,
    base: number,
    blobColors: number[],
    blobCount: number,
    minR: number,
    maxR: number,
  ): void {
    this.shape(key, units, units, (g, w, h, rng) => {
      g.fillStyle(base, 1);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < blobCount; i++) {
        const color = blobColors[rng.int(0, blobColors.length - 1)] as number;
        const r = rng.range(minR, maxR) * TEX_SS * 0.5;
        const x = rng.range(0, w);
        const y = rng.range(0, h);
        g.fillStyle(color, rng.range(0.25, 0.6));
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            g.fillCircle(x + ox * w, y + oy * h, r);
          }
        }
      }
    });
  }

  private floors(): void {
    this.shape(Tex.FloorWood, 128, 128, (g, w, h, rng) => {
      g.fillStyle(PALETTE.woodFloor, 1);
      g.fillRect(0, 0, w, h);
      const plank = h / 6;
      for (let i = 0; i < 6; i++) {
        g.fillStyle(rng.bool() ? 0x9d7a52 : 0xb28e63, rng.range(0.35, 0.75));
        g.fillRect(0, i * plank, w, plank - 2);
        g.fillStyle(0x6f5638, 0.35);
        g.fillRect(0, i * plank + plank - 2, w, 2);
      }
    });

    this.shape(Tex.FloorConcrete, 128, 128, (g, w, h, rng) => {
      g.fillStyle(0x9aa0a6, 1);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        g.fillStyle(rng.bool() ? 0x8d939a : 0xa7adb3, rng.range(0.2, 0.5));
        g.fillCircle(rng.range(0, w), rng.range(0, h), rng.range(6, 22));
      }
      g.lineStyle(2, 0x7f858b, 0.5);
      g.strokeRect(0, 0, w, h);
    });

    this.shape(Tex.FloorTile, 128, 128, (g, w, h) => {
      const cell = w / 4;
      for (let cy = 0; cy < 4; cy++) {
        for (let cx = 0; cx < 4; cx++) {
          g.fillStyle((cx + cy) % 2 === 0 ? 0xc3c8cd : 0xb0b6bc, 1);
          g.fillRect(cx * cell, cy * cell, cell, cell);
        }
      }
      g.lineStyle(1.5, 0x9aa0a6, 0.6);
      for (let i = 0; i <= 4; i++) {
        g.lineBetween(i * cell, 0, i * cell, h);
        g.lineBetween(0, i * cell, w, i * cell);
      }
    });

    this.shape(Tex.Roof, 128, 128, (g, w, h, rng) => {
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, w, h);
      const row = h / 8;
      for (let i = 0; i < 8; i++) {
        g.fillStyle(0x000000, i % 2 === 0 ? 0.06 : 0.12);
        g.fillRect(0, i * row, w, row);
        for (let j = 0; j < 6; j++) {
          g.fillStyle(0x000000, rng.range(0.03, 0.09));
          g.fillRect(rng.range(0, w), i * row, rng.range(6, 20), row);
        }
      }
    });
  }

  // ------------------------------------------------------------------ soft / fx

  private softTextures(): void {
    this.canvas(Tex.Shadow, 64, 64, (ctx, w, h) => {
      const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(0,0,0,0.45)');
      grad.addColorStop(0.6, 'rgba(0,0,0,0.22)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    });

    // Soft terrain blotch: opaque core, feathered edge, a little grain.
    this.canvas(Tex.Blob, 128, 128, (ctx, w, h) => {
      const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.55, 'rgba(255,255,255,0.92)');
      grad.addColorStop(0.82, 'rgba(255,255,255,0.45)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 90; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * (w / 2);
        ctx.globalAlpha = Math.random() * 0.35;
        ctx.beginPath();
        ctx.arc(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, 2 + Math.random() * 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    });

    this.canvas(Tex.SoftGlow, 64, 64, (ctx, w, h) => {
      const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    });

    this.canvas(Tex.Smoke, 40, 40, (ctx, w, h) => {
      const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(255,255,255,0.85)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    });

    this.shape(Tex.Spark, 10, 4, (g, w, h) => {
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(0, 0, w, h, h / 2);
    });

    this.shape(Tex.Blood, 12, 12, (g, w) => {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(w / 2, w / 2, w / 2);
    });

    this.shape(Tex.Bullet, 32, 6, (g, w, h) => {
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(0, 0, w, h, h / 2);
      g.fillStyle(0xffffff, 0.45);
      g.fillRoundedRect(0, h * 0.25, w, h * 0.5, h * 0.25);
    });

    this.shape(Tex.Pellet, 14, 5, (g, w, h) => {
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(0, 0, w, h, h / 2);
    });

    // Muzzle flash: a hot core with three flame tongues.
    this.shape(Tex.Muzzle, 46, 34, (g, w, h) => {
      const cy = h / 2;
      g.fillStyle(0xffffff, 0.95);
      g.beginPath();
      g.moveTo(0, cy - h * 0.16);
      g.lineTo(w * 0.62, cy - h * 0.06);
      g.lineTo(w, cy);
      g.lineTo(w * 0.62, cy + h * 0.06);
      g.lineTo(0, cy + h * 0.16);
      g.closePath();
      g.fillPath();
      g.fillStyle(0xffffff, 0.7);
      g.beginPath();
      g.moveTo(w * 0.1, cy - h * 0.42);
      g.lineTo(w * 0.66, cy - h * 0.08);
      g.lineTo(w * 0.1, cy - h * 0.02);
      g.closePath();
      g.fillPath();
      g.beginPath();
      g.moveTo(w * 0.1, cy + h * 0.42);
      g.lineTo(w * 0.66, cy + h * 0.08);
      g.lineTo(w * 0.1, cy + h * 0.02);
      g.closePath();
      g.fillPath();
    });

    this.shape(Tex.Ring, 72, 72, (g, w) => {
      g.lineStyle(Math.max(2, w * 0.045), 0xffffff, 1);
      g.strokeCircle(w / 2, w / 2, w / 2 - w * 0.05);
    });

    this.shape(Tex.Arrow, 26, 22, (g, w, h) => {
      g.fillStyle(0xffffff, 1);
      g.beginPath();
      g.moveTo(w, h / 2);
      g.lineTo(0, 0);
      g.lineTo(w * 0.3, h / 2);
      g.lineTo(0, h);
      g.closePath();
      g.fillPath();
    });
  }

  // ------------------------------------------------------------------ props

  private props(): void {
    const outline = PALETTE.outline;

    this.shape(Tex.TreeCanopy, 118, 118, (g, w, _h, rng) => {
      const c = w / 2;
      g.fillStyle(0x2f6b39, 1);
      g.fillCircle(c, c, c * 0.86);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + rng.range(-0.2, 0.2);
        const r = c * rng.range(0.5, 0.7);
        g.fillCircle(c + Math.cos(a) * c * 0.42, c + Math.sin(a) * c * 0.42, r);
      }
      g.fillStyle(0x3d8548, 0.95);
      for (let i = 0; i < 7; i++) {
        const a = rng.range(0, Math.PI * 2);
        const d = rng.range(0, c * 0.42);
        g.fillCircle(c + Math.cos(a) * d - c * 0.08, c + Math.sin(a) * d - c * 0.08, c * rng.range(0.22, 0.38));
      }
      g.fillStyle(0x54a05c, 0.8);
      g.fillCircle(c - c * 0.24, c - c * 0.26, c * 0.34);
      g.fillStyle(0x66b46c, 0.55);
      g.fillCircle(c - c * 0.3, c - c * 0.32, c * 0.18);
    });

    this.shape(Tex.TreeCanopyDark, 118, 118, (g, w, _h, rng) => {
      const c = w / 2;
      g.fillStyle(0x27563b, 1);
      g.fillCircle(c, c, c * 0.84);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + rng.range(-0.25, 0.25);
        g.fillCircle(c + Math.cos(a) * c * 0.4, c + Math.sin(a) * c * 0.4, c * rng.range(0.48, 0.66));
      }
      g.fillStyle(0x336a47, 0.9);
      g.fillCircle(c - c * 0.2, c - c * 0.22, c * 0.42);
      g.fillStyle(0x428057, 0.6);
      g.fillCircle(c - c * 0.28, c - c * 0.3, c * 0.2);
    });

    this.shape(Tex.TreeTrunk, 32, 32, (g, w) => {
      const c = w / 2;
      g.fillStyle(outline, 1);
      g.fillCircle(c, c, c * 0.92);
      g.fillStyle(0x6b4a2f, 1);
      g.fillCircle(c, c, c * 0.78);
      g.fillStyle(0x83603f, 1);
      g.fillCircle(c - c * 0.12, c - c * 0.12, c * 0.42);
    });

    this.shape(Tex.Bush, 76, 76, (g, w, _h, rng) => {
      const c = w / 2;
      g.fillStyle(0x2c5d34, 1);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        g.fillCircle(c + Math.cos(a) * c * 0.4, c + Math.sin(a) * c * 0.4, c * rng.range(0.42, 0.58));
      }
      g.fillStyle(0x3d7a42, 0.95);
      for (let i = 0; i < 6; i++) {
        const a = rng.range(0, Math.PI * 2);
        g.fillCircle(c + Math.cos(a) * c * 0.28, c + Math.sin(a) * c * 0.28, c * rng.range(0.24, 0.36));
      }
      g.fillStyle(0x529a56, 0.6);
      g.fillCircle(c - c * 0.22, c - c * 0.24, c * 0.26);
    });

    this.shape(Tex.Rock, 68, 68, (g, w, _h, rng) => {
      const c = w / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const sides = 8;
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const r = c * rng.range(0.72, 0.94);
        pts.push({ x: c + Math.cos(a) * r, y: c + Math.sin(a) * r });
      }
      g.fillStyle(outline, 1);
      g.beginPath();
      pts.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
      g.closePath();
      g.fillPath();
      g.fillStyle(0x8b9096, 1);
      g.beginPath();
      pts.forEach((p, i) => {
        const x = c + (p.x - c) * 0.88;
        const y = c + (p.y - c) * 0.88;
        return i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      });
      g.closePath();
      g.fillPath();
      g.fillStyle(0xa8adb3, 0.9);
      g.fillCircle(c - c * 0.2, c - c * 0.22, c * 0.34);
      g.fillStyle(0x6e7379, 0.55);
      g.fillCircle(c + c * 0.24, c + c * 0.26, c * 0.28);
    });

    this.shape(Tex.Crate, 58, 58, (g, w, h) => {
      g.fillStyle(outline, 1);
      g.fillRoundedRect(0, 0, w, h, 5);
      g.fillStyle(0x9a7343, 1);
      g.fillRoundedRect(3, 3, w - 6, h - 6, 4);
      g.fillStyle(0xb98b52, 1);
      g.fillRect(w * 0.12, h * 0.12, w * 0.76, h * 0.28);
      g.lineStyle(4, 0x76552f, 1);
      g.lineBetween(w * 0.1, h * 0.5, w * 0.9, h * 0.5);
      g.lineBetween(w * 0.5, h * 0.1, w * 0.5, h * 0.9);
      g.lineStyle(3, 0x000000, 0.18);
      g.strokeRoundedRect(4, 4, w - 8, h - 8, 4);
    });

    this.shape(Tex.Barrel, 42, 42, (g, w) => {
      const c = w / 2;
      g.fillStyle(outline, 1);
      g.fillCircle(c, c, c * 0.96);
      g.fillStyle(0xb4543f, 1);
      g.fillCircle(c, c, c * 0.84);
      g.lineStyle(3, 0x8a3f2f, 1);
      g.strokeCircle(c, c, c * 0.6);
      g.strokeCircle(c, c, c * 0.32);
      g.fillStyle(0xd47a5f, 0.75);
      g.fillCircle(c - c * 0.24, c - c * 0.26, c * 0.24);
    });

    this.shape(Tex.Sandbag, 96, 36, (g, w, h) => {
      g.fillStyle(outline, 1);
      g.fillRoundedRect(0, 0, w, h, h * 0.45);
      const bags = 4;
      for (let i = 0; i < bags; i++) {
        const bw = w / bags;
        g.fillStyle(i % 2 === 0 ? 0xa89465 : 0x99875b, 1);
        g.fillRoundedRect(i * bw + 3, 3, bw - 6, h - 6, h * 0.35);
        g.fillStyle(0xc0ad80, 0.5);
        g.fillRoundedRect(i * bw + 6, 6, bw - 12, h * 0.3, h * 0.2);
      }
    });

    this.shape(Tex.Table, 92, 62, (g, w, h) => {
      g.fillStyle(outline, 1);
      g.fillRoundedRect(0, 0, w, h, 6);
      g.fillStyle(0x8f6a44, 1);
      g.fillRoundedRect(3, 3, w - 6, h - 6, 5);
      g.fillStyle(0xa87f52, 1);
      g.fillRoundedRect(w * 0.08, h * 0.1, w * 0.84, h * 0.4, 4);
      g.lineStyle(2, 0x6d4f31, 0.8);
      g.strokeRoundedRect(6, 6, w - 12, h - 12, 4);
    });

    this.shape(Tex.Shelf, 106, 38, (g, w, h) => {
      g.fillStyle(outline, 1);
      g.fillRoundedRect(0, 0, w, h, 4);
      g.fillStyle(0x7c6a55, 1);
      g.fillRoundedRect(3, 3, w - 6, h - 6, 3);
      for (let i = 0; i < 4; i++) {
        g.fillStyle(i % 2 === 0 ? 0x9c8869 : 0x8b7a5f, 1);
        g.fillRect(6 + i * ((w - 12) / 4), 7, (w - 12) / 4 - 4, h - 14);
      }
    });

    this.shape(Tex.Locker, 56, 74, (g, w, h) => {
      g.fillStyle(outline, 1);
      g.fillRoundedRect(0, 0, w, h, 5);
      g.fillStyle(0x53707d, 1);
      g.fillRoundedRect(3, 3, w - 6, h - 6, 4);
      g.fillStyle(0x668894, 1);
      g.fillRect(w * 0.12, h * 0.08, w * 0.34, h * 0.84);
      g.fillStyle(0x3f5761, 1);
      g.fillRect(w * 0.52, h * 0.08, w * 0.36, h * 0.84);
      g.fillStyle(0xdfe6ea, 0.8);
      g.fillCircle(w * 0.5, h * 0.5, 3);
    });

    this.shape(Tex.GrassTuft, 22, 22, (g, w, h) => {
      g.fillStyle(0xffffff, 1);
      for (let i = 0; i < 5; i++) {
        const x = (w / 6) * (i + 1);
        g.fillTriangle(x - 2, h, x + 2, h, x + (i % 2 === 0 ? -3 : 3), h * 0.25);
      }
    });

    this.shape(Tex.Pebble, 14, 14, (g, w) => {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(w * 0.35, w * 0.5, w * 0.22);
      g.fillCircle(w * 0.65, w * 0.42, w * 0.16);
      g.fillCircle(w * 0.55, w * 0.7, w * 0.13);
    });
  }

  // ------------------------------------------------------------------ characters

  private characters(): void {
    const outline = PALETTE.outline;

    // Torso: a rounded capsule with shoulders, drawn facing +x.
    this.shape(Tex.Body, 40, 36, (g, w, h) => {
      g.fillStyle(outline, 1);
      g.fillRoundedRect(0, 0, w, h, h * 0.44);
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(3, 3, w - 6, h - 6, (h - 6) * 0.44);
      // Darker back half gives a readable facing direction.
      g.fillStyle(0x000000, 0.16);
      g.fillRoundedRect(3, 3, (w - 6) * 0.42, h - 6, (h - 6) * 0.44);
      g.fillStyle(0xffffff, 0.35);
      g.fillRoundedRect(w * 0.52, 6, w * 0.34, h * 0.26, 6);
    });

    this.shape(Tex.Head, 24, 24, (g, w) => {
      const c = w / 2;
      g.fillStyle(outline, 1);
      g.fillCircle(c, c, c);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(c, c, c - 3);
      g.fillStyle(0x000000, 0.14);
      g.beginPath();
      g.arc(c, c, c - 3, Math.PI * 0.55, Math.PI * 1.45, false);
      g.closePath();
      g.fillPath();
    });

    this.shape(Tex.Hand, 14, 14, (g, w) => {
      const c = w / 2;
      g.fillStyle(outline, 1);
      g.fillCircle(c, c, c);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(c, c, c - 2.5);
    });

    this.shape(Tex.Backpack, 22, 26, (g, w, h) => {
      g.fillStyle(outline, 1);
      g.fillRoundedRect(0, 0, w, h, 5);
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(2.5, 2.5, w - 5, h - 5, 4);
      g.fillStyle(0x000000, 0.2);
      g.fillRect(w * 0.2, h * 0.35, w * 0.6, h * 0.18);
    });
  }

  // ------------------------------------------------------------------ icons

  private icons(): void {
    const outline = PALETTE.outline;

    this.shape(Tex.LootPad, 46, 46, (g, w) => {
      const c = w / 2;
      g.fillStyle(0x000000, 0.28);
      g.fillCircle(c, c, c * 0.94);
      g.lineStyle(Math.max(2, w * 0.06), 0xffffff, 0.9);
      g.strokeCircle(c, c, c * 0.8);
    });

    this.shape(Tex.Vest, 38, 38, (g, w, h) => {
      g.fillStyle(outline, 1);
      g.fillRoundedRect(w * 0.16, h * 0.1, w * 0.68, h * 0.8, 7);
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(w * 0.2, h * 0.14, w * 0.6, h * 0.72, 6);
      g.fillStyle(0x000000, 0.25);
      g.fillRect(w * 0.44, h * 0.14, w * 0.12, h * 0.72);
      g.fillStyle(0x000000, 0.18);
      g.fillRect(w * 0.2, h * 0.42, w * 0.6, h * 0.1);
    });

    this.shape(Tex.HelmetIcon, 38, 34, (g, w, h) => {
      g.fillStyle(outline, 1);
      g.beginPath();
      g.arc(w / 2, h * 0.66, w * 0.38, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      g.fillStyle(0xffffff, 1);
      g.beginPath();
      g.arc(w / 2, h * 0.64, w * 0.32, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      g.fillStyle(outline, 1);
      g.fillRoundedRect(w * 0.1, h * 0.62, w * 0.8, h * 0.14, 4);
    });

    this.shape(Tex.BandageIcon, 36, 36, (g, w, h) => {
      g.fillStyle(outline, 1);
      g.fillRoundedRect(w * 0.08, h * 0.34, w * 0.84, h * 0.32, 8);
      g.fillStyle(0xf3f1e6, 1);
      g.fillRoundedRect(w * 0.12, h * 0.38, w * 0.76, h * 0.24, 6);
      g.fillStyle(0xd8d3c0, 1);
      g.fillRect(w * 0.38, h * 0.38, w * 0.24, h * 0.24);
      g.fillStyle(0xe05c5c, 1);
      g.fillRect(w * 0.44, h * 0.42, w * 0.12, h * 0.16);
    });

    this.shape(Tex.MedkitIcon, 38, 34, (g, w, h) => {
      g.fillStyle(outline, 1);
      g.fillRoundedRect(w * 0.06, h * 0.14, w * 0.88, h * 0.72, 6);
      g.fillStyle(0xe8e8e8, 1);
      g.fillRoundedRect(w * 0.1, h * 0.18, w * 0.8, h * 0.64, 5);
      g.fillStyle(0xd94a4a, 1);
      g.fillRect(w * 0.42, h * 0.28, w * 0.16, h * 0.44);
      g.fillRect(w * 0.28, h * 0.42, w * 0.44, h * 0.16);
    });

    this.shape(Tex.AmmoBox, 34, 30, (g, w, h) => {
      g.fillStyle(outline, 1);
      g.fillRoundedRect(w * 0.06, h * 0.16, w * 0.88, h * 0.7, 5);
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(w * 0.1, h * 0.2, w * 0.8, h * 0.62, 4);
      g.fillStyle(0x000000, 0.25);
      g.fillRect(w * 0.1, h * 0.42, w * 0.8, h * 0.1);
      g.fillStyle(0x000000, 0.35);
      g.fillRect(w * 0.36, h * 0.2, w * 0.1, h * 0.62);
      g.fillRect(w * 0.56, h * 0.2, w * 0.1, h * 0.62);
    });
  }

  // ------------------------------------------------------------------ signal + events

  /** Objective art. These must never read as ordinary loot, so they get their own shapes. */
  private signalArt(): void {
    const hexPath = (g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number): void => {
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
    };

    this.shape(Tex.SignalCore, 52, 52, (g, w) => {
      const c = w / 2;
      g.fillStyle(0x0d2a33, 1);
      hexPath(g, c, c, c * 0.94);
      g.fillPath();
      g.fillStyle(0x2ee6ff, 1);
      hexPath(g, c, c, c * 0.78);
      g.fillPath();
      g.fillStyle(0x0a1a22, 1);
      hexPath(g, c, c, c * 0.58);
      g.fillPath();
      g.fillStyle(0x9df5ff, 1);
      hexPath(g, c, c, c * 0.34);
      g.fillPath();
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(c, c, c * 0.16);
      g.lineStyle(2.5, 0x2ee6ff, 0.9);
      hexPath(g, c, c, c * 0.88);
      g.strokePath();
    });

    this.shape(Tex.SignalShard, 24, 24, (g, w) => {
      const c = w / 2;
      g.fillStyle(0x0a1a22, 1);
      hexPath(g, c, c, c * 0.95);
      g.fillPath();
      g.fillStyle(0x2ee6ff, 1);
      hexPath(g, c, c, c * 0.7);
      g.fillPath();
      g.fillStyle(0xd6fbff, 1);
      hexPath(g, c, c, c * 0.32);
      g.fillPath();
    });

    this.shape(Tex.SupplyCrate, 78, 78, (g, w, h) => {
      g.fillStyle(PALETTE.outline, 1);
      g.fillRoundedRect(0, 0, w, h, 7);
      g.fillStyle(0x3f4a55, 1);
      g.fillRoundedRect(4, 4, w - 8, h - 8, 6);
      g.fillStyle(0x53606d, 1);
      g.fillRect(w * 0.1, h * 0.1, w * 0.8, h * 0.34);
      // Hazard stripes read as "valuable" from a long way off.
      g.fillStyle(0xf4d03f, 1);
      for (let i = 0; i < 4; i++) g.fillRect(w * (0.12 + i * 0.2), h * 0.52, w * 0.1, h * 0.34);
      g.fillStyle(0xe05c5c, 1);
      g.fillRect(w * 0.08, h * 0.46, w * 0.84, h * 0.05);
      g.lineStyle(3, 0x27303a, 1);
      g.strokeRoundedRect(6, 6, w - 12, h - 12, 5);
    });

    const iconBox = 36;
    this.shape(Tex.AbilityDash, iconBox, iconBox, (g, w, h) => {
      g.fillStyle(0xffffff, 1);
      for (let i = 0; i < 2; i++) {
        const x = w * (0.24 + i * 0.3);
        g.beginPath();
        g.moveTo(x, h * 0.22);
        g.lineTo(x + w * 0.24, h * 0.5);
        g.lineTo(x, h * 0.78);
        g.lineTo(x + w * 0.08, h * 0.5);
        g.closePath();
        g.fillPath();
      }
    });

    this.shape(Tex.AbilityShield, iconBox, iconBox, (g, w, h) => {
      g.fillStyle(0xffffff, 1);
      g.beginPath();
      g.moveTo(w * 0.5, h * 0.14);
      g.lineTo(w * 0.84, h * 0.3);
      g.lineTo(w * 0.84, h * 0.56);
      g.lineTo(w * 0.5, h * 0.88);
      g.lineTo(w * 0.16, h * 0.56);
      g.lineTo(w * 0.16, h * 0.3);
      g.closePath();
      g.fillPath();
      g.fillStyle(0x000000, 0.35);
      g.fillRect(w * 0.46, h * 0.28, w * 0.08, h * 0.4);
      g.fillRect(w * 0.3, h * 0.42, w * 0.4, h * 0.08);
    });

    this.shape(Tex.AbilityScan, iconBox, iconBox, (g, w, h) => {
      const c = w / 2;
      g.lineStyle(3, 0xffffff, 1);
      for (let i = 1; i <= 3; i++) {
        g.beginPath();
        g.arc(c, h * 0.78, c * 0.24 * i, Math.PI * 1.15, Math.PI * 1.85, false);
        g.strokePath();
      }
      g.fillStyle(0xffffff, 1);
      g.fillCircle(c, h * 0.78, 3);
    });

    this.shape(Tex.AbilitySpeed, iconBox, iconBox, (g, w, h) => {
      g.fillStyle(0xffffff, 1);
      g.beginPath();
      g.moveTo(w * 0.58, h * 0.1);
      g.lineTo(w * 0.28, h * 0.54);
      g.lineTo(w * 0.48, h * 0.54);
      g.lineTo(w * 0.4, h * 0.9);
      g.lineTo(w * 0.74, h * 0.42);
      g.lineTo(w * 0.52, h * 0.42);
      g.closePath();
      g.fillPath();
    });

    this.shape(Tex.AbilityTeleport, iconBox, iconBox, (g, w, h) => {
      g.lineStyle(3, 0xffffff, 1);
      g.strokeCircle(w * 0.34, h * 0.5, w * 0.2);
      g.strokeCircle(w * 0.68, h * 0.5, w * 0.14);
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(w * 0.5, h * 0.34, w * 0.5, h * 0.66, w * 0.78, h * 0.5);
    });

    this.shape(Tex.Cracks, 64, 64, (g, w, h, rng) => {
      g.lineStyle(2.5, 0xffffff, 1);
      for (let i = 0; i < 7; i++) {
        let x = rng.range(w * 0.2, w * 0.8);
        let y = rng.range(h * 0.2, h * 0.8);
        for (let seg = 0; seg < 4; seg++) {
          const nx = x + rng.range(-w * 0.22, w * 0.22);
          const ny = y + rng.range(-h * 0.22, h * 0.22);
          g.lineBetween(x, y, nx, ny);
          x = nx;
          y = ny;
        }
      }
    });

    // Wooden things share one visual language so "this can be broken" reads instantly.
    this.shape(Tex.Door, 80, 20, (g, w, h) => {
      g.fillStyle(PALETTE.outline, 1);
      g.fillRoundedRect(0, 0, w, h, 3);
      g.fillStyle(0x9a6f42, 1);
      g.fillRoundedRect(2, 2, w - 4, h - 4, 2);
      g.fillStyle(0x8a6038, 1);
      for (let i = 0; i < 6; i++) g.fillRect(4 + i * ((w - 8) / 6), 3, (w - 8) / 6 - 3, h - 6);
      g.fillStyle(0x6b4a2a, 1);
      g.fillRect(4, h * 0.44, w - 8, 3);
      g.fillStyle(0xd8c48f, 1);
      g.fillCircle(w * 0.86, h * 0.5, 2.6);
    });

    this.shape(Tex.Barricade, 104, 20, (g, w, h) => {
      g.fillStyle(PALETTE.outline, 1);
      g.fillRoundedRect(0, 0, w, h, 3);
      g.fillStyle(0x8f6a41, 1);
      g.fillRoundedRect(2, 2, w - 4, h - 4, 2);
      g.fillStyle(0x6f5029, 1);
      g.fillRect(w * 0.14, 2, 5, h - 4);
      g.fillRect(w * 0.5 - 2, 2, 5, h - 4);
      g.fillRect(w * 0.84, 2, 5, h - 4);
      g.fillStyle(0xa88052, 0.7);
      g.fillRect(4, 4, w - 8, 4);
    });

    this.shape(Tex.Splinter, 14, 6, (g, w, h) => {
      g.fillStyle(0xffffff, 1);
      g.beginPath();
      g.moveTo(0, h * 0.5);
      g.lineTo(w * 0.6, 0);
      g.lineTo(w, h * 0.4);
      g.lineTo(w * 0.5, h);
      g.closePath();
      g.fillPath();
    });
  }

  // ------------------------------------------------------------------ weapons

  private weapons(): void {
    (Object.keys(WEAPONS) as WeaponId[]).forEach((id) => {
      const stats = WEAPONS[id];
      this.shape(weaponTexture(id), WEAPON_TEX_UNITS.width, WEAPON_TEX_UNITS.height, (g, w, h) => {
        this.drawWeapon(g, w, h, stats);
      });
    });
  }

  /** Side-profile weapon silhouettes drawn from the grip at the left. */
  private drawWeapon(
    g: Phaser.GameObjects.Graphics,
    w: number,
    h: number,
    stats: WeaponStats,
  ): void {
    const cy = h / 2;
    const dark = 0x23282f;
    const metal = 0x4a525c;
    const light = 0x6d7681;
    const wood = 0x7a5a3a;

    const bar = (x: number, y: number, bw: number, bh: number, color: number, radius = 2): void => {
      g.fillStyle(dark, 1);
      g.fillRoundedRect(x - 1.5, y - 1.5, bw + 3, bh + 3, radius + 1);
      g.fillStyle(color, 1);
      g.fillRoundedRect(x, y, bw, bh, radius);
    };

    switch (stats.id) {
      case 'knife':
        bar(w * 0.05, cy - h * 0.09, w * 0.22, h * 0.18, wood, 3);
        g.fillStyle(dark, 1);
        g.beginPath();
        g.moveTo(w * 0.27, cy - h * 0.14);
        g.lineTo(w * 0.72, cy - h * 0.03);
        g.lineTo(w * 0.72, cy + h * 0.08);
        g.lineTo(w * 0.27, cy + h * 0.14);
        g.closePath();
        g.fillPath();
        g.fillStyle(0xc9d2da, 1);
        g.beginPath();
        g.moveTo(w * 0.29, cy - h * 0.1);
        g.lineTo(w * 0.68, cy - h * 0.02);
        g.lineTo(w * 0.68, cy + h * 0.05);
        g.lineTo(w * 0.29, cy + h * 0.1);
        g.closePath();
        g.fillPath();
        break;

      case 'pistol':
        bar(w * 0.06, cy - h * 0.02, w * 0.16, h * 0.34, dark, 3);
        bar(w * 0.08, cy - h * 0.2, w * 0.54, h * 0.2, metal, 3);
        bar(w * 0.5, cy - h * 0.14, w * 0.22, h * 0.1, light, 2);
        break;

      case 'smg':
        bar(w * 0.08, cy - h * 0.02, w * 0.14, h * 0.3, dark, 3);
        bar(w * 0.04, cy - h * 0.18, w * 0.66, h * 0.2, metal, 3);
        bar(w * 0.58, cy - h * 0.13, w * 0.3, h * 0.1, light, 2);
        bar(w * 0.3, cy + h * 0.06, w * 0.1, h * 0.3, dark, 2);
        break;

      case 'ar':
      case 'burst':
        bar(w * 0.04, cy - h * 0.14, w * 0.24, h * 0.18, dark, 3);
        bar(w * 0.2, cy - h * 0.02, w * 0.13, h * 0.3, dark, 3);
        bar(w * 0.18, cy - h * 0.2, w * 0.56, h * 0.22, metal, 3);
        bar(w * 0.66, cy - h * 0.13, w * 0.3, h * 0.1, light, 2);
        bar(w * 0.4, cy + h * 0.04, w * 0.11, h * 0.34, dark, 2);
        if (stats.id === 'burst') {
          g.fillStyle(0xf0c674, 1);
          g.fillRect(w * 0.52, cy - h * 0.3, w * 0.1, h * 0.08);
        }
        break;

      case 'shotgun':
        bar(w * 0.03, cy - h * 0.12, w * 0.26, h * 0.2, wood, 3);
        bar(w * 0.24, cy - h * 0.02, w * 0.12, h * 0.28, dark, 3);
        bar(w * 0.2, cy - h * 0.2, w * 0.74, h * 0.22, metal, 3);
        bar(w * 0.5, cy + h * 0.02, w * 0.3, h * 0.14, wood, 3);
        break;

      case 'sniper':
        bar(w * 0.02, cy - h * 0.12, w * 0.26, h * 0.2, wood, 3);
        bar(w * 0.24, cy - h * 0.02, w * 0.11, h * 0.28, dark, 3);
        bar(w * 0.18, cy - h * 0.16, w * 0.78, h * 0.16, metal, 3);
        bar(w * 0.36, cy - h * 0.34, w * 0.32, h * 0.13, light, 3);
        g.fillStyle(0x8ad3ff, 0.9);
        g.fillCircle(w * 0.66, cy - h * 0.27, h * 0.05);
        break;

      case 'lmg':
      default:
        bar(w * 0.02, cy - h * 0.14, w * 0.22, h * 0.2, dark, 3);
        bar(w * 0.2, cy - h * 0.02, w * 0.13, h * 0.3, dark, 3);
        bar(w * 0.16, cy - h * 0.24, w * 0.6, h * 0.28, metal, 3);
        bar(w * 0.7, cy - h * 0.14, w * 0.28, h * 0.12, light, 2);
        bar(w * 0.36, cy + h * 0.06, w * 0.22, h * 0.34, dark, 3);
        g.fillStyle(light, 1);
        g.fillRect(w * 0.24, cy - h * 0.32, w * 0.3, h * 0.08);
        break;
    }
  }
}
