import Phaser from 'phaser';
import { DEBUG } from '../config/GameConfig';
import { Depth } from '../utils/Constants';
import type { Bot } from '../entities/Bot';
import type { MatchContext } from '../systems/MatchContext';

const FONT = 'Consolas, Menlo, monospace';

/**
 * World-space debug gizmos: colliders, nav grid, loot points, zone centre and per-bot
 * state labels. Off by default; toggled with F1 or ?debug=1.
 */
export class DebugOverlay {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly stats: Phaser.GameObjects.Text;
  private enabled: boolean = DEBUG.enabled;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: MatchContext,
    private readonly bots: readonly Bot[],
  ) {
    this.graphics = scene.add.graphics().setDepth(Depth.Debug);
    this.stats = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#9ef0a0',
        backgroundColor: '#000000b0',
        padding: { x: 6, y: 4 },
      })
      .setDepth(Depth.Debug)
      .setVisible(false);
    for (let i = 0; i < bots.length; i++) {
      const label = scene.add
        .text(0, 0, '', { fontFamily: FONT, fontSize: '10px', color: '#9ef0a0' })
        .setOrigin(0.5, 1)
        .setDepth(Depth.Debug)
        .setVisible(false);
      this.labels.push(label);
    }
    this.setEnabled(this.enabled);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): void {
    this.setEnabled(!this.enabled);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.graphics.setVisible(enabled);
    this.stats.setVisible(enabled);
    for (const label of this.labels) label.setVisible(false);
  }

  update(): void {
    if (!this.enabled) return;
    const g = this.graphics;
    g.clear();

    const cam = this.scene.cameras.main;
    const view = cam.worldView;

    if (DEBUG.showFps) this.drawStats(cam);

    if (DEBUG.showNavGrid) {
      g.fillStyle(0xff0044, 0.12);
      const viewRect = { x: view.x, y: view.y, w: view.width, h: view.height };
      for (const cell of this.ctx.map.navGrid.debugCells(viewRect)) {
        g.fillRect(cell.x, cell.y, this.ctx.map.navGrid.cellSize, this.ctx.map.navGrid.cellSize);
      }
    }

    if (DEBUG.showColliders) {
      g.lineStyle(1, 0x00ffcc, 0.55);
      for (const b of this.ctx.map.buildings) {
        for (const wall of b.walls) {
          if (wall.x > view.right || wall.x + wall.w < view.x) continue;
          if (wall.y > view.bottom || wall.y + wall.h < view.y) continue;
          g.strokeRect(wall.x, wall.y, wall.w, wall.h);
        }
      }
      for (const obs of this.ctx.map.obstacles) {
        if (obs.x < view.x - 80 || obs.x > view.right + 80) continue;
        if (obs.y < view.y - 80 || obs.y > view.bottom + 80) continue;
        if (obs.shape === 'circle') g.strokeCircle(obs.x, obs.y, obs.radius);
        else g.strokeRect(obs.x - obs.w / 2, obs.y - obs.h / 2, obs.w, obs.h);
      }
      g.lineStyle(1, 0xffee00, 0.8);
      for (const c of this.ctx.combatants) {
        if (!c.alive) continue;
        g.strokeCircle(c.x, c.y, c.radius);
      }
    }

    if (DEBUG.showLootPoints) {
      g.fillStyle(0xffffff, 0.35);
      for (const point of this.ctx.map.lootPoints) {
        g.fillCircle(point.x, point.y, 3);
      }
    }

    // Zone centre cross.
    const zone = this.ctx.zone;
    g.lineStyle(2, 0x59d6ff, 0.8);
    g.lineBetween(zone.center.x - 20, zone.center.y, zone.center.x + 20, zone.center.y);
    g.lineBetween(zone.center.x, zone.center.y - 20, zone.center.x, zone.center.y + 20);

    if (DEBUG.showBotState) {
      this.bots.forEach((bot, i) => {
        const label = this.labels[i];
        if (!label) return;
        const visible =
          bot.alive &&
          bot.x > view.x - 40 &&
          bot.x < view.right + 40 &&
          bot.y > view.y - 40 &&
          bot.y < view.bottom + 40;
        label.setVisible(visible);
        if (!visible) return;
        label.setPosition(bot.x, bot.y - 40);
        label.setText(`${bot.state}${bot.target ? ' >' + bot.target.combatantName : ''}`);

        // Path preview.
        g.lineStyle(1, 0x9ef0a0, 0.5);
        let px = bot.x;
        let py = bot.y;
        for (let j = bot.pathIndex; j < bot.path.length; j++) {
          const wp = bot.path[j];
          if (!wp) break;
          g.lineBetween(px, py, wp.x, wp.y);
          px = wp.x;
          py = wp.y;
        }
      });
    }
  }

  /** Anchored to the camera's top-left and un-zoomed so it stays readable. */
  private drawStats(cam: Phaser.Cameras.Scene2D.Camera): void {
    const zone = this.ctx.zone;
    const player = this.ctx.player;
    const aliveBots = this.bots.filter((b) => b.alive).length;
    const loop = this.scene.game.loop;
    this.stats.setScale(1 / cam.zoom);
    // Sits below the HUD's vitals panel so the two do not overlap.
    this.stats.setPosition(cam.worldView.x + 10 / cam.zoom, cam.worldView.y + 110 / cam.zoom);
    this.stats.setText(
      [
        `fps ${loop.actualFps.toFixed(0)}  delta ${loop.delta.toFixed(1)}ms`,
        `seed ${this.ctx.map.seed}  t ${(this.ctx.matchTimeMs / 1000).toFixed(1)}s`,
        `alive ${this.ctx.aliveCount} (bots ${aliveBots})  loot ${this.ctx.loot.count}`,
        `bullets ${this.ctx.combat.activeBulletCount}`,
        `zone ${zone.state} p${zone.phaseIndex + 1} r${zone.radius.toFixed(0)} @ ${zone.center.x.toFixed(0)},${zone.center.y.toFixed(0)}`,
        `player ${player ? `${player.x.toFixed(0)},${player.y.toFixed(0)} hp ${player.health.toFixed(0)}` : '-'}`,
      ].join('\n'),
    );
  }

  destroy(): void {
    this.graphics.destroy();
    this.stats.destroy();
    for (const label of this.labels) label.destroy();
  }
}
