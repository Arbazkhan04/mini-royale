import Phaser from 'phaser';
import { PALETTE } from '../config/GameConfig';
import { AudioSystem } from '../systems/AudioSystem';
import { createButton } from '../ui/Button';
import { SceneKey } from '../utils/Constants';
import { formatTime } from '../utils/MathUtils';
import { randomSeed } from '../utils/RandomUtils';
import type { MatchResult, SaveData } from '../utils/Storage';

const FONT = 'Trebuchet MS, Segoe UI, sans-serif';

export interface ResultSceneData {
  result: MatchResult;
  save: SaveData;
  accuracy: number;
}

/** End-of-match summary with placement, stats and replay options. */
export class ResultScene extends Phaser.Scene {
  private resultData!: ResultSceneData;
  private audio!: AudioSystem;
  private root!: Phaser.GameObjects.Container;
  private replaying = false;

  constructor() {
    super(SceneKey.Result);
  }

  create(data: ResultSceneData): void {
    this.resultData = data;
    this.replaying = false;
    this.audio = (this.registry.get('audio') as AudioSystem | undefined) ?? new AudioSystem();
    this.cameras.main.setBackgroundColor('#0b0f14');
    this.cameras.main.fadeIn(320, 8, 12, 18);

    this.root = this.add.container(0, 0);
    this.build();
    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
  }

  private build(): void {
    const { result, save, accuracy } = this.resultData;
    const victory = result.victory;

    const banner = this.add.graphics().setName('banner');

    const levelLine = this.add
      .text(0, 0, victory ? `LEVEL ${result.level} COMPLETE` : `LEVEL ${result.level}`, {
        fontFamily: FONT,
        fontSize: '15px',
        color: victory ? '#9df5ff' : '#8fa3b8',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5)
      .setName('level');

    const headline = this.add
      .text(0, 0, victory ? 'VICTORY' : 'ELIMINATED', {
        fontFamily: FONT,
        fontSize: '58px',
        color: victory ? '#f4d03f' : '#ff6b81',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5)
      .setName('headline');
    headline.setShadow(0, 6, '#000000', 12, false, true);

    const placement = this.add
      .text(0, 0, `#${result.placement} / ${result.totalCombatants}`, {
        fontFamily: FONT,
        fontSize: '30px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5)
      .setName('placement');

    const rows: Array<[string, string]> = [
      ['KILLS', `${result.kills}`],
      ['DAMAGE', `${result.damage}`],
      ['SURVIVED', formatTime(result.survivedMs / 1000)],
      ['ACCURACY', `${accuracy}%`],
      ['SCORE', result.score.toLocaleString()],
    ];
    const statsText = this.add
      .text(0, 0, rows.map(([k, v]) => `${k.padEnd(10, ' ')}${v}`).join('\n'), {
        fontFamily: 'Consolas, Menlo, monospace',
        fontSize: '18px',
        color: '#dbe4ee',
        lineSpacing: 8,
        align: 'left',
      })
      .setOrigin(0.5, 0.5)
      .setName('stats');

    const career = this.add
      .text(
        0,
        0,
        `CAREER   level ${save.level}   ·   best level ${save.bestLevel}   ·   wins ${save.wins}   ·   best score ${save.bestScore}`,
        { fontFamily: FONT, fontSize: '13px', color: '#7d8b9c' },
      )
      .setOrigin(0.5, 0.5)
      .setName('career');

    // Winning moves you on; losing lets you take the same level again.
    const nextLabel = victory ? `NEXT LEVEL  ${result.level + 1}` : 'RETRY LEVEL';
    const playAgain = this.button(nextLabel, 250, 54, () => this.replay());
    playAgain.setName('play-again');

    const menu = this.button('MENU', 200, 46, () => {
      this.scene.start(SceneKey.Menu);
    });

    menu.setName('menu');

    this.root.add([banner, levelLine, headline, placement, statsText, career, playAgain, menu]);

    // Keyboard shortcuts for fast replays, armed after a short beat so a key still held
    // from the final fight cannot skip the summary.
    this.time.delayedCall(500, () => {
      this.input.keyboard?.on('keydown-SPACE', () => this.replay());
      this.input.keyboard?.on('keydown-ESC', () => this.scene.start(SceneKey.Menu));
    });
  }

  /** Same fade-then-build handoff the menu uses, so replays feel instant too. */
  private replay(): void {
    if (this.replaying) return;
    this.replaying = true;
    const seed = randomSeed();
    const cam = this.cameras.main;
    cam.resetFX();
    cam.fadeOut(110, 8, 12, 18);
    this.time.delayedCall(120, () => this.scene.start(SceneKey.Game, { seed }));
  }


  private button(
    label: string,
    width: number,
    height: number,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    return createButton(this, {
      label,
      width,
      height,
      fontSize: 20,
      onClick,
      onPress: () => this.audio.play('uiClick'),
    });
  }

  private layout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const compact = h < 620;

    const banner = this.root.getByName('banner') as Phaser.GameObjects.Graphics;
    banner.clear();
    banner.fillStyle(this.resultData.result.victory ? 0x2a2410 : 0x2a1218, 0.9);
    banner.fillRect(0, h * 0.08, w, h * 0.16);
    banner.lineStyle(2, this.resultData.result.victory ? PALETTE.gold : PALETTE.danger, 0.5);
    banner.lineBetween(0, h * 0.08, w, h * 0.08);
    banner.lineBetween(0, h * 0.24, w, h * 0.24);

    (this.root.getByName('level') as Phaser.GameObjects.Text).setPosition(cx, h * 0.105);
    (this.root.getByName('headline') as Phaser.GameObjects.Text)
      .setFontSize(compact ? 40 : 58)
      .setPosition(cx, h * 0.17);
    (this.root.getByName('placement') as Phaser.GameObjects.Text).setPosition(cx, h * 0.3);
    (this.root.getByName('stats') as Phaser.GameObjects.Text).setPosition(cx, h * 0.48);
    (this.root.getByName('career') as Phaser.GameObjects.Text).setPosition(cx, h * 0.62);
    (this.root.getByName('play-again') as Phaser.GameObjects.Container).setPosition(cx, h * 0.73);
    (this.root.getByName('menu') as Phaser.GameObjects.Container).setPosition(cx, h * 0.84);
  }
}
