import Phaser from 'phaser';
import { VIEW } from '../config/GameConfig';
import { Depth, GameEvent } from '../utils/Constants';
import type { MatchContext } from '../systems/MatchContext';

const FONT = 'Trebuchet MS, Segoe UI, sans-serif';

export interface AnnouncePayload {
  /** Four words at most - it has to be readable at a glance mid-fight. */
  text: string;
  sub?: string;
  color?: number;
  durationMs?: number;
}

interface ActiveAnnouncement extends AnnouncePayload {
  bornAt: number;
}

/**
 * Short banners under the zone timer: SIGNAL DETECTED, RADAR PULSE, ZONE CLOSING.
 *
 * Announcements queue instead of stacking, sit above the action rather than across it,
 * and never pause the game.
 */
export class Announcer {
  private readonly container: Phaser.GameObjects.Container;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly sub: Phaser.GameObjects.Text;

  private queue: AnnouncePayload[] = [];
  private active: ActiveAnnouncement | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: MatchContext,
  ) {
    this.panel = scene.add.graphics();
    this.title = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '26px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5, 0.5);
    this.title.setShadow(0, 3, '#000000', 6, false, true);
    this.sub = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '13px', color: '#c8d4e0' })
      .setOrigin(0.5, 0.5);
    this.sub.setShadow(0, 2, '#000000', 4);

    this.container = scene.add
      .container(0, 0, [this.panel, this.title, this.sub])
      .setDepth(Depth.Debug + 4)
      .setVisible(false);

    ctx.events.on(GameEvent.Announce, this.push, this);
  }

  push(payload: AnnouncePayload): void {
    // A fresh banner replaces a stale one rather than piling up.
    if (this.active && this.scene.time.now - this.active.bornAt > 700) this.active = null;
    if (!this.active) this.show(payload);
    else if (this.queue.length < 3) this.queue.push(payload);
  }

  private show(payload: AnnouncePayload): void {
    this.active = { ...payload, bornAt: this.scene.time.now };
    const color = payload.color ?? 0xffffff;
    this.title.setText(payload.text).setColor(`#${color.toString(16).padStart(6, '0')}`);
    this.sub.setText(payload.sub ?? '');
    this.sub.setVisible(Boolean(payload.sub));
    this.container.setVisible(true).setAlpha(1);
    this.layout();

    this.scene.tweens.killTweensOf(this.container);
    this.container.setScale(1.08);
    this.scene.tweens.add({ targets: this.container, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  layout(): void {
    const w = this.scene.scale.width;
    const narrow = w < VIEW.narrowBreakpoint;
    // Sits below the zone timer and the Final Signal readout, never across the action.
    const y = narrow ? 108 : 132;
    this.container.setPosition(w / 2, y);

    this.title.setFontSize(narrow ? 19 : 26).setPosition(0, this.sub.visible ? -10 : 0);
    this.sub.setFontSize(narrow ? 11 : 13).setPosition(0, 13);

    const panelW = Math.max(this.title.width, this.sub.width) + (narrow ? 32 : 52);
    const panelH = this.sub.visible ? (narrow ? 50 : 60) : narrow ? 32 : 40;
    this.panel.clear();
    this.panel.fillStyle(0x0a1119, 0.72);
    this.panel.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 10);
    this.panel.lineStyle(2, 0x2a3a4d, 0.9);
    this.panel.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 10);
  }

  update(): void {
    if (!this.active) {
      const next = this.queue.shift();
      if (next) this.show(next);
      return;
    }
    const age = this.scene.time.now - this.active.bornAt;
    const life = this.active.durationMs ?? 2200;
    if (age > life) {
      this.active = null;
      const next = this.queue.shift();
      if (next) this.show(next);
      else {
        this.scene.tweens.add({
          targets: this.container,
          alpha: 0,
          duration: 260,
          onComplete: () => this.container.setVisible(false),
        });
      }
    }
  }

  destroy(): void {
    this.ctx.events.off(GameEvent.Announce, this.push, this);
    this.container.destroy(true);
  }
}
