import Phaser from 'phaser';
import { MATCH, PALETTE } from '../config/GameConfig';
import { TEX_SCALE } from '../graphics/TextureFactory';
import { AudioSystem } from '../systems/AudioSystem';
import { SceneKey, Tex } from '../utils/Constants';
import { Rng, randomSeed } from '../utils/RandomUtils';
import { Storage } from '../utils/Storage';

const FONT = 'Trebuchet MS, Segoe UI, sans-serif';

interface DriftProp {
  image: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  spin: number;
}

/** Title screen: play, stats, and a couple of settings. */
export class MenuScene extends Phaser.Scene {
  private audio!: AudioSystem;
  private props: DriftProp[] = [];
  private root!: Phaser.GameObjects.Container;
  private volumeLabel!: Phaser.GameObjects.Text;
  private starting = false;

  constructor() {
    super(SceneKey.Menu);
  }

  create(): void {
    this.audio = (this.registry.get('audio') as AudioSystem | undefined) ?? new AudioSystem();
    this.registry.set('audio', this.audio);

    // First ever launch goes straight to how-to-play. Handing over before any of the menu
    // is built avoids a frame of title screen flashing past on the way there.
    if (!Storage.load().tutorialSeen) {
      this.scene.start(SceneKey.Tutorial, { firstRun: true });
      return;
    }

    this.starting = false;
    this.cameras.main.setBackgroundColor('#101820');
    this.cameras.main.fadeIn(220, 8, 12, 18);
    this.buildBackdrop();
    this.buildUi();

    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => this.audio.unlock());
    this.input.keyboard?.once('keydown', () => this.audio.unlock());
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
  }

  /** Slowly drifting props behind the menu so the title screen is not a flat colour. */
  private buildBackdrop(): void {
    const rng = new Rng(randomSeed());
    const w = this.scale.width;
    const h = this.scale.height;

    const ground = this.add.tileSprite(0, 0, w, h, Tex.Grass).setOrigin(0, 0);
    ground.setTileScale(TEX_SCALE, TEX_SCALE);
    ground.setAlpha(0.5);
    ground.setName('menu-ground');

    const textures = [Tex.TreeCanopy, Tex.TreeCanopyDark, Tex.Rock, Tex.Crate, Tex.Bush, Tex.Barrel];
    for (let i = 0; i < 22; i++) {
      const image = this.add
        .image(rng.range(0, w), rng.range(0, h), rng.pick(textures))
        .setScale(TEX_SCALE * rng.range(0.5, 1.1))
        .setAlpha(rng.range(0.18, 0.42))
        .setRotation(rng.range(0, Math.PI * 2));
      this.props.push({
        image,
        vx: rng.range(-14, 14),
        vy: rng.range(-14, 14),
        spin: rng.range(-0.25, 0.25),
      });
    }

    const vignette = this.add.graphics();
    vignette.fillStyle(0x070b11, 0.55);
    vignette.fillRect(0, 0, w, h);
    vignette.setName('menu-vignette');
  }

  private buildUi(): void {
    const save = Storage.load();
    this.root = this.add.container(0, 0);

    const title = this.add
      .text(0, 0, 'LAST SIGNAL', {
        fontFamily: FONT,
        fontSize: '64px',
        color: '#f4d03f',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5);
    title.setShadow(0, 6, '#000000', 12, false, true);
    title.setName('title');

    const subtitle = this.add
      .text(0, 0, `${MATCH.totalCombatants} DROP IN  ·  ONE SIGNAL  ·  ONE WALKS OUT`, {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#8fa3b8',
      })
      .setOrigin(0.5, 0.5);
    subtitle.setName('subtitle');

    const levelLine = this.add
      .text(0, 0, `LEVEL ${save.level}`, {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#9df5ff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5);
    levelLine.setShadow(0, 3, '#000000', 6);
    levelLine.setName('level');

    const playButton = this.makeButton('PLAY', 240, 58, () => this.startMatch());
    playButton.setName('play');

    const howToButton = this.makeButton(
      'HOW TO PLAY',
      240,
      42,
      // firstRun is passed explicitly: scene.start with no data reuses whatever the
      // scene was last started with, which would leave this looking like a first run.
      () => this.scene.start(SceneKey.Tutorial, { firstRun: false }),
      17,
    );
    howToButton.setName('howto');

    const stats = this.add
      .text(
        0,
        0,
        [
          `BEST LEVEL  ${save.bestLevel}`,
          `MATCHES  ${save.matchesPlayed}`,
          `WINS  ${save.wins}`,
          `BEST SCORE  ${save.bestScore}`,
          `MOST KILLS  ${save.mostKills}`,
          save.bestPlacement < 99 ? `BEST PLACEMENT  #${save.bestPlacement}` : 'BEST PLACEMENT  —',
        ].join('     '),
        { fontFamily: FONT, fontSize: '13px', color: '#7d8b9c', align: 'center' },
      )
      .setOrigin(0.5, 0.5);
    stats.setName('stats');

    const touch = this.sys.game.device.input.touch;
    const controls = this.add
      .text(
        0,
        0,
        touch
          ? 'Left stick move   ·   Right side aim   ·   FIRE to shoot   ·   E pick up   ·   SIGNAL for your ability'
          : 'WASD move   ·   Mouse aim   ·   Click fire   ·   R reload   ·   E pick up   ·   Q heal   ·   SPACE signal ability',
        { fontFamily: FONT, fontSize: '12px', color: '#5f6c7a', align: 'center', wordWrap: { width: 620 } },
      )
      .setOrigin(0.5, 0.5);
    controls.setName('controls');

    this.volumeLabel = this.add
      .text(0, 0, this.volumeText(), { fontFamily: FONT, fontSize: '13px', color: '#8fa3b8' })
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });
    this.volumeLabel.on('pointerdown', () => {
      this.audio.unlock();
      const next = this.audio.volume >= 0.99 ? 0 : Math.min(1, this.audio.volume + 0.25);
      this.audio.setVolume(next);
      this.audio.play('uiClick');
      this.volumeLabel.setText(this.volumeText());
    });
    this.volumeLabel.setName('volume');

    this.root.add([
      title,
      subtitle,
      levelLine,
      playButton,
      howToButton,
      stats,
      controls,
      this.volumeLabel,
    ]);
    this.layout();
  }

  private volumeText(): string {
    return `SOUND  ${Math.round(this.audio.volume * 100)}%   (click to change)`;
  }

  private makeButton(
    label: string,
    width: number,
    height: number,
    onClick: () => void,
    fontSize = 26,
  ): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    const draw = (hover: boolean): void => {
      g.clear();
      g.fillStyle(hover ? 0x2a4a63 : 0x16222f, 0.95);
      g.fillRoundedRect(-width / 2, -height / 2, width, height, 12);
      g.lineStyle(3, hover ? PALETTE.gold : 0x2f4356, 1);
      g.strokeRoundedRect(-width / 2, -height / 2, width, height, 12);
    };
    draw(false);

    const text = this.add
      .text(0, 0, label, {
        fontFamily: FONT,
        fontSize: `${fontSize}px`,
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5);
    text.setShadow(0, 3, '#000000', 5);

    const container = this.add.container(0, 0, [g, text]);
    container.setSize(width, height);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      Phaser.Geom.Rectangle.Contains,
    );
    container.on('pointerover', () => {
      draw(true);
      this.tweens.add({ targets: container, scale: 1.04, duration: 120 });
    });
    container.on('pointerout', () => {
      draw(false);
      this.tweens.add({ targets: container, scale: 1, duration: 120 });
    });
    container.on('pointerdown', () => {
      this.audio.unlock();
      this.audio.play('uiClick');
      onClick();
    });
    return container;
  }

  private layout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const compact = h < 560;

    const ground = this.children.getByName('menu-ground') as Phaser.GameObjects.TileSprite | null;
    ground?.setSize(w, h);
    const vignette = this.children.getByName('menu-vignette') as Phaser.GameObjects.Graphics | null;
    if (vignette) {
      vignette.clear();
      vignette.fillStyle(0x070b11, 0.55);
      vignette.fillRect(0, 0, w, h);
    }

    const title = this.root.getByName('title') as Phaser.GameObjects.Text;
    const subtitle = this.root.getByName('subtitle') as Phaser.GameObjects.Text;
    const play = this.root.getByName('play') as Phaser.GameObjects.Container;
    const howto = this.root.getByName('howto') as Phaser.GameObjects.Container;
    const stats = this.root.getByName('stats') as Phaser.GameObjects.Text;
    const controls = this.root.getByName('controls') as Phaser.GameObjects.Text;
    const volume = this.root.getByName('volume') as Phaser.GameObjects.Text;

    // Long info lines have to wrap on narrow screens or they run off both edges.
    const wrapWidth = Math.max(220, w - 48);
    stats.setFontSize(w < 520 ? 12 : 13);
    stats.setWordWrapWidth(wrapWidth);
    controls.setWordWrapWidth(wrapWidth);
    subtitle.setFontSize(w < 520 ? 13 : 15);

    title.setFontSize(compact ? 42 : Math.min(72, w * 0.09));
    title.setPosition(cx, h * (compact ? 0.2 : 0.24));
    subtitle.setPosition(cx, h * (compact ? 0.3 : 0.33));
    const levelText = this.root.getByName('level') as Phaser.GameObjects.Text;
    levelText.setFontSize(compact ? 18 : 22).setPosition(cx, h * (compact ? 0.38 : 0.41));
    play.setPosition(cx, h * (compact ? 0.45 : 0.49));
    howto.setPosition(cx, h * (compact ? 0.55 : 0.585));
    stats.setPosition(cx, h * (compact ? 0.65 : 0.68));
    volume.setPosition(cx, h * (compact ? 0.73 : 0.755));
    controls.setPosition(cx, h * (compact ? 0.85 : 0.87));
  }

  /**
   * Building a match is a couple of frames of work. Fading out first means the click is
   * acknowledged immediately and the hitch happens behind a black screen rather than
   * looking like a frozen button.
   */
  private startMatch(): void {
    if (this.starting) return;
    this.starting = true;
    const seed = randomSeed();
    const cam = this.cameras.main;
    // resetFX first: a fade that is still running would otherwise swallow this one, and
    // the switch is driven by a timer rather than the fade callback so it can never hang.
    cam.resetFX();
    cam.fadeOut(170, 8, 12, 18);
    this.time.delayedCall(180, () => this.scene.start(SceneKey.Game, { seed }));
  }

  override update(_time: number, delta: number): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const dt = delta / 1000;
    for (const prop of this.props) {
      prop.image.x += prop.vx * dt;
      prop.image.y += prop.vy * dt;
      prop.image.rotation += prop.spin * dt;
      if (prop.image.x < -80) prop.image.x = w + 80;
      if (prop.image.x > w + 80) prop.image.x = -80;
      if (prop.image.y < -80) prop.image.y = h + 80;
      if (prop.image.y > h + 80) prop.image.y = -80;
    }
  }
}
