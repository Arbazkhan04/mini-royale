import Phaser from 'phaser';
import type { InputSystem } from '../systems/InputSystem';
import type { MatchContext } from '../systems/MatchContext';
import { Announcer } from '../ui/Announcer';
import { Crosshair } from '../ui/Crosshair';
import { ThreatOverlay } from '../ui/ThreatOverlay';
import { HUD } from '../ui/HUD';
import { InventoryUI } from '../ui/InventoryUI';
import { KillFeed } from '../ui/KillFeed';
import { Minimap } from '../ui/Minimap';
import { TouchControls } from '../ui/TouchControls';
import { GameEvent, SceneKey } from '../utils/Constants';

const FONT = 'Trebuchet MS, Segoe UI, sans-serif';

export interface UISceneData {
  ctx: MatchContext;
  input: InputSystem;
  level: number;
}

/**
 * Screen-space UI, run in parallel with GameScene so it is unaffected by camera zoom
 * and shake. Reads match state through MatchContext and the event bus.
 */
export class UIScene extends Phaser.Scene {
  private ctx!: MatchContext;
  private inputSystem!: InputSystem;

  private hud!: HUD;
  private minimap!: Minimap;
  private killFeed!: KillFeed;
  private crosshair!: Crosshair;
  private threats!: ThreatOverlay;
  private inventory!: InventoryUI;
  private announcer!: Announcer;
  private touch: TouchControls | null = null;

  private centerText!: Phaser.GameObjects.Text;
  private pauseOverlay!: Phaser.GameObjects.Container;
  private isTouchDevice = false;

  constructor() {
    super(SceneKey.UI);
  }

  create(data: UISceneData): void {
    this.ctx = data.ctx;
    this.inputSystem = data.input;
    this.isTouchDevice = this.sys.game.device.input.touch;

    this.hud = new HUD(this, this.ctx);
    this.minimap = new Minimap(this, this.ctx);
    this.killFeed = new KillFeed(this, this.ctx);
    this.crosshair = new Crosshair(this, this.ctx);
    this.threats = new ThreatOverlay(this, this.ctx);
    this.inventory = new InventoryUI(this, this.ctx);
    this.announcer = new Announcer(this, this.ctx);

    if (this.isTouchDevice) {
      this.touch = new TouchControls(this, this.inputSystem, this.ctx);
      this.crosshair.setEnabled(false);
    } else {
      this.input.setDefaultCursor('none');
    }

    this.centerText = this.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: '72px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5)
      .setDepth(500);
    this.centerText.setShadow(0, 6, '#000000', 10, false, true);

    this.buildPauseOverlay();
    this.layout();

    this.announcer.push({
      text: `LEVEL ${data.level}`,
      sub: 'Last one standing wins',
      color: 0x9df5ff,
      durationMs: 2400,
    });

    this.ctx.events.on(GameEvent.CountdownTick, this.onCountdown, this);
    this.ctx.events.on(GameEvent.ZonePhaseChanged, this.onZonePhase, this);
    this.ctx.events.on(GameEvent.MatchEnd, this.onMatchEnd, this);
    this.ctx.events.on(GameEvent.AliveCountChanged, this.onAliveCount, this);
    this.ctx.events.on(GameEvent.PlayerPromptChanged, this.onPrompt, this);
    this.events.on('pause-changed', this.onPauseChanged, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  private buildPauseOverlay(): void {
    const bg = this.add.rectangle(0, 0, 10, 10, 0x050a10, 0.72).setOrigin(0, 0);
    const title = this.add
      .text(0, 0, 'PAUSED', {
        fontFamily: FONT,
        fontSize: '48px',
        color: '#f4d03f',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5);
    const hint = this.add
      .text(0, 0, 'Press ESC to resume', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#c8d4e0',
      })
      .setOrigin(0.5, 0.5);
    this.pauseOverlay = this.add.container(0, 0, [bg, title, hint]).setDepth(600).setVisible(false);
    bg.setName('pause-bg');
    title.setName('pause-title');
    hint.setName('pause-hint');
  }

  private layout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.centerText.setPosition(w / 2, h * 0.38);

    const bg = this.pauseOverlay.getByName('pause-bg') as Phaser.GameObjects.Rectangle;
    bg.setSize(w, h);
    (this.pauseOverlay.getByName('pause-title') as Phaser.GameObjects.Text).setPosition(w / 2, h / 2 - 20);
    (this.pauseOverlay.getByName('pause-hint') as Phaser.GameObjects.Text).setPosition(w / 2, h / 2 + 28);

    this.hud?.layout();
    this.announcer?.layout();
  }

  // ------------------------------------------------------------------ events

  private onCountdown(value: number): void {
    const label = value > 0 ? `${value}` : 'GO';
    this.showCenterText(label, value > 0 ? '#ffffff' : '#5fd36b', value > 0 ? 800 : 700);
  }

  private onZonePhase(payload: { phase: number; total: number; state: string }): void {
    if (payload.state !== 'shrinking') return;
    this.announcer.push({ text: 'ZONE CLOSING', color: 0xff6b81, durationMs: 2000 });
  }

  private onAliveCount(count: number): void {
    if (count === 3) {
      this.announcer.push({ text: '3 SURVIVORS', color: 0xf4d03f, durationMs: 2000 });
    }
  }

  private onMatchEnd(payload: { victory: boolean }): void {
    this.showCenterText(payload.victory ? 'VICTORY' : 'ELIMINATED', payload.victory ? '#f4d03f' : '#ff6b81', 2400, 62);
    this.crosshair.setEnabled(false);
    this.touch?.setVisible(false);
  }

  /** Keeps the touch pickup button in step with the interaction prompt. */
  private onPrompt(prompt: unknown): void {
    this.touch?.setInteractAvailable(prompt !== null);
  }

  private onPauseChanged(paused: boolean): void {
    this.pauseOverlay.setVisible(paused);
  }

  private showCenterText(label: string, color: string, durationMs: number, size = 72): void {
    this.centerText.setText(label).setColor(color).setFontSize(size).setAlpha(1).setScale(1.4);
    this.tweens.killTweensOf(this.centerText);
    this.tweens.add({ targets: this.centerText, scale: 1, duration: 240, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: this.centerText,
      alpha: 0,
      delay: Math.max(0, durationMs - 300),
      duration: 300,
    });
  }

  // ------------------------------------------------------------------ frame

  override update(_time: number, delta: number): void {
    if (this.inputSystem.consume('inventory')) {
      this.inventory.toggle();
    }
    if (this.inventory.isOpen) this.inventory.refresh();

    this.hud.update(delta);
    this.minimap.update(delta);
    this.killFeed.update();
    this.crosshair.update(delta);
    this.threats.update();
    this.announcer.update();
    this.touch?.setAbilityAvailable(this.ctx.signal.hasAbility(this.ctx.player));
    // The aim thumb turns red while the stick is on a target, because at that moment the
    // stick is the trigger and it needs to look like one.
    this.touch?.setTargetAcquired(
      this.inputSystem.tapTarget !== null ||
        (this.inputSystem.aimStickHeld &&
          this.ctx.aimAssist.hasAutoFireTarget(this.ctx.player, this.ctx.player.desiredAim)),
    );
  }

  private onShutdown(): void {
    this.ctx.events.off(GameEvent.CountdownTick, this.onCountdown, this);
    this.ctx.events.off(GameEvent.ZonePhaseChanged, this.onZonePhase, this);
    this.ctx.events.off(GameEvent.MatchEnd, this.onMatchEnd, this);
    this.ctx.events.off(GameEvent.AliveCountChanged, this.onAliveCount, this);
    this.ctx.events.off(GameEvent.PlayerPromptChanged, this.onPrompt, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.input.setDefaultCursor('default');
    this.hud.destroy();
    this.minimap.destroy();
    this.killFeed.destroy();
    this.crosshair.destroy();
    this.inventory.destroy();
    this.announcer.destroy();
    this.touch?.destroy();
  }
}
