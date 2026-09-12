import Phaser from 'phaser';
import { VIEW } from '../config/GameConfig';
import { Depth, GameEvent } from '../utils/Constants';
import type { MatchContext } from '../systems/MatchContext';

const MAX_ENTRIES = 5;
const ENTRY_LIFE_MS = 7000;
const FONT = 'Trebuchet MS, Segoe UI, sans-serif';

export interface KillEventPayload {
  victim: string;
  killer: string | null;
  weapon: string;
  victimIsPlayer: boolean;
  killerIsPlayer: boolean;
}

interface FeedEntry {
  text: Phaser.GameObjects.Text;
  bg: Phaser.GameObjects.Graphics;
  bornAt: number;
}

/** Rolling top-right elimination feed. */
export class KillFeed {
  private readonly container: Phaser.GameObjects.Container;
  private readonly entries: FeedEntry[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: MatchContext,
  ) {
    this.container = scene.add.container(0, 0).setDepth(Depth.Debug - 2);
    this.layout();
    ctx.events.on(GameEvent.Kill, this.onKill, this);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
  }

  private layout(): void {
    const narrow = this.scene.scale.width < VIEW.narrowBreakpoint;
    const pad = narrow ? 10 : 20;
    // Slots in under the counters, or under the minimap when it moves up on phones.
    const top = narrow ? pad + 60 + 104 + 8 : pad + 74;
    this.container.setPosition(this.scene.scale.width - pad, top);
    this.reflow();
  }

  private onKill(payload: KillEventPayload): void {
    const label = payload.killer
      ? `${payload.killer} eliminated ${payload.victim}`
      : `${payload.victim} was eliminated by ${payload.weapon}`;
    const suffix = payload.killer ? `  ·  ${payload.weapon}` : '';

    const color = payload.killerIsPlayer ? '#f4d03f' : payload.victimIsPlayer ? '#ff6b81' : '#dbe4ee';
    const text = this.scene.add
      .text(0, 0, label + suffix, {
        fontFamily: FONT,
        fontSize: this.scene.scale.width < VIEW.narrowBreakpoint ? '10px' : '13px',
        color,
      })
      .setOrigin(1, 0);
    text.setShadow(0, 1, '#000000', 2);

    const bg = this.scene.add.graphics();
    const entry: FeedEntry = { text, bg, bornAt: this.scene.time.now };
    this.container.add([bg, text]);
    this.entries.unshift(entry);

    while (this.entries.length > MAX_ENTRIES) {
      const removed = this.entries.pop();
      removed?.text.destroy();
      removed?.bg.destroy();
    }
    this.reflow();
  }

  private reflow(): void {
    let y = 0;
    for (const entry of this.entries) {
      entry.text.setPosition(-8, y + 4);
      entry.bg.clear();
      entry.bg.fillStyle(0x0d1420, 0.6);
      entry.bg.fillRoundedRect(-entry.text.width - 16, y, entry.text.width + 16, 22, 6);
      y += 26;
    }
  }

  update(): void {
    const now = this.scene.time.now;
    let dirty = false;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i] as FeedEntry;
      const age = now - entry.bornAt;
      if (age > ENTRY_LIFE_MS) {
        entry.text.destroy();
        entry.bg.destroy();
        this.entries.splice(i, 1);
        dirty = true;
        continue;
      }
      // Fade the last second so entries do not pop out.
      const alpha = age > ENTRY_LIFE_MS - 900 ? (ENTRY_LIFE_MS - age) / 900 : 1;
      entry.text.setAlpha(alpha);
      entry.bg.setAlpha(alpha);
    }
    if (dirty) this.reflow();
  }

  destroy(): void {
    this.ctx.events.off(GameEvent.Kill, this.onKill, this);
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.container.destroy(true);
  }
}
