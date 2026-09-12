import Phaser from 'phaser';
import { PALETTE, VIEW, WORLD } from '../config/GameConfig';
import { Depth, GameEvent, ObstacleKind } from '../utils/Constants';
import type { MatchContext } from '../systems/MatchContext';
import { fillAnnulus } from '../graphics/GraphicsUtils';

/** Shared so the HUD can keep the weapon slots clear of the map. */
export const minimapSizeFor = (width: number): number =>
  width < VIEW.narrowBreakpoint
    ? 104
    : Math.round(Math.min(210, Math.max(130, width * 0.16)));

interface GunfireBlip {
  x: number;
  y: number;
  life: number;
}

/**
 * Corner minimap. Terrain is baked once into a render texture; only the player marker,
 * the two zone circles and nearby gunfire blips are redrawn each frame.
 */
export class Minimap {
  private readonly container: Phaser.GameObjects.Container;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly terrain: Phaser.GameObjects.RenderTexture;
  private readonly dynamic: Phaser.GameObjects.Graphics;
  private readonly playerMarker: Phaser.GameObjects.Graphics;
  private readonly blips: GunfireBlip[] = [];

  private readonly maskShape: Phaser.GameObjects.Graphics;
  private size = 190;
  private scaleFactor = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: MatchContext,
  ) {
    this.size = minimapSizeFor(scene.scale.width);
    this.scaleFactor = this.size / WORLD.width;

    this.terrain = scene.add.renderTexture(0, 0, this.size, this.size).setOrigin(0, 0);
    this.dynamic = scene.add.graphics();
    this.playerMarker = scene.add.graphics();
    this.frame = scene.add.graphics();

    this.container = scene.add
      .container(0, 0, [this.terrain, this.dynamic, this.playerMarker, this.frame])
      .setDepth(Depth.Debug - 1);

    // The danger ring is drawn far larger than the map, so the whole widget is clipped.
    this.maskShape = scene.make.graphics({ x: 0, y: 0 }, false);
    this.container.setMask(this.maskShape.createGeometryMask());

    this.bakeTerrain();
    this.layout();

    this.ctx.events.on(GameEvent.Gunshot, this.onGunshot, this);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
  }

  /** Draws the static world overview once into a render texture. */
  private bakeTerrain(): void {
    const s = this.scaleFactor;
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);

    g.fillStyle(0x35682f, 1);
    g.fillRect(0, 0, this.size, this.size);

    for (const patch of this.ctx.map.terrain) {
      if (patch.shape !== 'rect') continue;
      g.fillStyle(0x4a4e54, 0.9);
      g.fillRect(
        (patch.x - patch.w / 2) * s,
        (patch.y - patch.h / 2) * s,
        patch.w * s,
        patch.h * s,
      );
    }

    // Forests read as darker green clusters.
    g.fillStyle(0x27512a, 0.85);
    for (const obs of this.ctx.map.obstacles) {
      if (obs.kind !== ObstacleKind.Tree) continue;
      g.fillCircle(obs.x * s, obs.y * s, Math.max(1, obs.radius * s * 2.4));
    }

    for (const building of this.ctx.map.buildings) {
      g.fillStyle(0x2b3138, 1);
      g.fillRect(building.x * s, building.y * s, building.w * s, building.h * s);
      g.lineStyle(1, 0x8d949c, 0.8);
      g.strokeRect(building.x * s, building.y * s, building.w * s, building.h * s);
    }

    g.lineStyle(2, 0x1c2128, 0.9);
    g.strokeRect(0, 0, this.size, this.size);

    this.terrain.draw(g, 0, 0);
    g.destroy();
  }

  layout(): void {
    const narrow = this.scene.scale.width < VIEW.narrowBreakpoint;
    const pad = narrow ? 10 : 18;
    const x = this.scene.scale.width - this.size - pad;
    // On phones the bottom-right corner belongs to the thumb buttons, so the map moves
    // up under the alive/kill counters instead.
    const y = narrow ? pad + 60 : this.scene.scale.height - this.size - pad;
    this.container.setPosition(x, y);

    this.maskShape.clear();
    this.maskShape.fillStyle(0xffffff, 1);
    this.maskShape.fillRect(x, y, this.size, this.size);

    this.frame.clear();
    this.frame.lineStyle(3, 0x2a3a4d, 1);
    this.frame.strokeRoundedRect(-2, -2, this.size + 4, this.size + 4, 8);
    this.frame.lineStyle(1, 0x0b0f14, 0.9);
    this.frame.strokeRoundedRect(-4, -4, this.size + 8, this.size + 8, 9);
  }

  private onGunshot(x: number, y: number): void {
    const player = this.ctx.player;
    if (!player) return;
    const d = Phaser.Math.Distance.Between(player.x, player.y, x, y);
    // Only shots the player could plausibly hear show up.
    if (d > 1100) return;
    this.blips.push({ x, y, life: 1 });
    if (this.blips.length > 24) this.blips.shift();
  }

  update(delta: number): void {
    const s = this.scaleFactor;
    const zone = this.ctx.zone;
    const g = this.dynamic;
    g.clear();

    // Danger wash outside the circle. With a split zone the ring maths stops working,
    // so the two safe circles are simply outlined instead.
    if (!zone.extra) {
      fillAnnulus(
        g,
        zone.center.x * s,
        zone.center.y * s,
        Math.max(0, zone.radius * s),
        this.size * 2,
        PALETTE.danger,
        0.28,
        48,
      );
    }

    for (const circle of zone.circles) {
      g.lineStyle(2, PALETTE.safeZone, 0.95);
      g.strokeCircle(circle.center.x * s, circle.center.y * s, Math.max(1, circle.radius * s));
    }

    if (zone.state !== 'finished') {
      g.lineStyle(1.5, 0xffffff, 0.7);
      g.strokeCircle(
        zone.nextCenter.x * s,
        zone.nextCenter.y * s,
        Math.max(1, zone.nextRadius * s),
      );
    }

    // ---- objectives ----
    const signal = this.ctx.signal;
    const core = signal.corePosition;
    if (core) {
      const pulse = 0.6 + Math.sin(this.scene.time.now * 0.006) * 0.35;
      g.fillStyle(0x2ee6ff, pulse);
      g.fillCircle(core.x * s, core.y * s, 4.5);
      g.lineStyle(1.5, 0x9df5ff, pulse);
      g.strokeCircle(core.x * s, core.y * s, 8);
    }

    const ping = signal.ping;
    if (ping && this.scene.time.now < ping.until) {
      const fade = (ping.until - this.scene.time.now) / 4000;
      g.fillStyle(0xffb648, 0.22 * fade);
      g.fillCircle(ping.x * s, ping.y * s, ping.radius * s);
      g.lineStyle(1.5, 0xffb648, 0.85 * fade);
      g.strokeCircle(ping.x * s, ping.y * s, ping.radius * s);
    }

    const final = signal.final;
    if (final.active && final.point) {
      g.lineStyle(2, 0x9df5ff, 0.9);
      g.strokeCircle(final.point.x * s, final.point.y * s, Math.max(3, final.radius * s));
    }

    for (const site of this.ctx.director.supplySites) {
      g.fillStyle(PALETTE.gold, 0.85);
      g.fillRect(site.x * s - 3, site.y * s - 3, 6, 6);
      g.lineStyle(1, 0x000000, 0.6);
      g.strokeRect(site.x * s - 3, site.y * s - 3, 6, 6);
    }

    // Radar sweep and drone scan both show approximate enemy positions, briefly.
    for (const blip of this.ctx.director.radarBlips) {
      const fade = (blip.until - this.scene.time.now) / 4000;
      if (fade <= 0) continue;
      g.fillStyle(PALETTE.danger, 0.75 * fade);
      g.fillCircle(blip.x * s, blip.y * s, 3);
    }
    const revealed = signal.revealedIds();
    if (revealed) {
      for (const c of this.ctx.combatants) {
        if (!c.alive || c.isPlayer || !revealed.has(c.combatantId)) continue;
        g.fillStyle(PALETTE.danger, 0.8);
        g.fillCircle(c.x * s, c.y * s, 3);
      }
    }

    for (let i = this.blips.length - 1; i >= 0; i--) {
      const blip = this.blips[i] as GunfireBlip;
      blip.life -= delta / 2200;
      if (blip.life <= 0) {
        this.blips.splice(i, 1);
        continue;
      }
      g.fillStyle(PALETTE.gold, blip.life * 0.8);
      g.fillCircle(blip.x * s, blip.y * s, 2 + (1 - blip.life) * 4);
    }

    const player = this.ctx.player;
    const marker = this.playerMarker;
    marker.clear();
    if (player && player.alive) {
      const px = player.x * s;
      const py = player.y * s;
      marker.fillStyle(0xffffff, 0.35);
      marker.fillCircle(px, py, 6);
      marker.fillStyle(PALETTE.playerBody, 1);
      marker.fillCircle(px, py, 3.5);
      // Facing wedge.
      marker.lineStyle(2, 0xffffff, 0.95);
      marker.lineBetween(
        px,
        py,
        px + Math.cos(player.rotation) * 9,
        py + Math.sin(player.rotation) * 9,
      );
    }
  }

  destroy(): void {
    this.ctx.events.off(GameEvent.Gunshot, this.onGunshot, this);
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.container.clearMask(true);
    this.container.destroy(true);
  }
}
