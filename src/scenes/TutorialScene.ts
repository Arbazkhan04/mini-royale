import Phaser from 'phaser';
import { COMBAT, MATCH, PALETTE, ZONE } from '../config/GameConfig';
import { SIGNAL } from '../config/SignalConfig';
import { AudioSystem } from '../systems/AudioSystem';
import { SceneKey } from '../utils/Constants';
import { Storage } from '../utils/Storage';

const FONT = 'Trebuchet MS, Segoe UI, sans-serif';

/** A label/description pair. The label is the thing you remember, the text explains it. */
interface TutorialRow {
  readonly label: string;
  readonly text: string;
}

interface TutorialPage {
  readonly title: string;
  readonly tagline: string;
  readonly accent: string;
  readonly rows: readonly TutorialRow[];
}

export interface TutorialSceneData {
  /** True when this is the automatic first-run showing rather than a menu visit. */
  firstRun?: boolean;
}

/**
 * Every number quoted to the player is read back out of `config/` rather than typed into
 * the copy, so retuning the zone or the Final Signal can never leave the tutorial lying.
 */
function buildPages(touch: boolean): TutorialPage[] {
  const totalMs = ZONE.phases.reduce((t, p) => t + p.waitMs + p.shrinkMs, 0);
  const minutes = Math.round((totalMs / 60000) * 10) / 10;
  const firstDps = ZONE.phases[0]!.damagePerSecond;
  const lastDps = ZONE.phases[ZONE.phases.length - 1]!.damagePerSecond;
  const captureSeconds = Math.round(SIGNAL.finalCaptureMs / 1000);
  const coreFrom = Math.round(SIGNAL.spawnWindowMs[0] / 1000);
  const coreTo = Math.round(SIGNAL.spawnWindowMs[1] / 1000);
  const pingSeconds = Math.round(SIGNAL.pingIntervalMs / 1000);

  const lethality: TutorialRow = COMBAT.playerOneShotKills
    ? {
        label: 'ONE SHOT',
        text: 'Every bullet you land kills instantly, straight through armour and shields. Landing the first shot is the whole game.',
      }
    : {
        label: 'TRADE FIRE',
        text: 'Enemies take several hits to bring down, so cover and reloads decide most fights.',
      };

  const controlRows: readonly TutorialRow[] = touch
    ? [
        { label: 'LEFT STICK', text: 'Move. It appears wherever you put your thumb down.' },
        { label: 'RIGHT SIDE', text: 'Aim. Drag to turn, and FIRE shoots where you point.' },
        { label: 'R  /  HEAL', text: 'Reload, and use your best bandage or medkit.' },
        { label: 'PICK UP', text: 'Appears only when there is something at your feet worth taking.' },
        { label: 'SIGNAL', text: 'Appears only once you are carrying the Signal Core.' },
      ]
    : [
        { label: 'WASD', text: 'Move. Arrow keys work too.' },
        { label: 'MOUSE', text: 'Aim. Left click fires, and holding it keeps firing on automatics.' },
        { label: 'R', text: 'Reload. Do it behind cover, never mid-duel.' },
        { label: 'E  /  Q', text: 'Pick up what you are standing on, and use your best heal.' },
        { label: 'SPACE', text: 'Use your Signal ability, once you are carrying the core.' },
      ];

  return [
    {
      title: 'THE GOAL',
      tagline: `${MATCH.totalCombatants} drop in. One walks out.`,
      accent: '#f4d03f',
      rows: [
        {
          label: 'SURVIVE',
          text: `Stay alive while ${MATCH.botCount} other fighters hunt each other. Last one standing wins the level.`,
        },
        lethality,
        {
          label: 'NOT FRAGILE',
          text: 'You still have 100 health and take normal damage, so a fight you shoot first is a fight you win.',
        },
        {
          label: 'NO WAITING',
          text: 'There is no countdown. PLAY drops you straight in holding a PX-9 and a spare magazine.',
        },
      ],
    },
    {
      title: 'CONTROLS',
      tagline: touch ? 'Everything is on screen.' : 'Left hand moves, right hand aims.',
      accent: '#9df5ff',
      rows: controlRows,
    },
    {
      title: 'YOUR FIRST MINUTE',
      tagline: 'The opening is free. Spend it well.',
      accent: '#7ce8a0',
      rows: [
        {
          label: 'KEEP MOVING',
          text: 'Standing still is how you get found and killed. Never hold one spot for long.',
        },
        {
          label: 'LOOT HARD',
          text: 'Enemies start unarmed and spend the first minute hunting for a gun. That window belongs to you.',
        },
        {
          label: 'GO AND GET',
          text: 'A real rifle or shotgun, body armour, and two heals. Buildings hold the good loot.',
        },
        {
          label: 'THEN PICK',
          text: 'Fights you start from cover, at an angle, on someone who has not seen you.',
        },
      ],
    },
    {
      title: 'THE CIRCLE',
      tagline: `It closes in ${ZONE.phases.length} steps over about ${minutes} minutes.`,
      accent: '#ff9a4a',
      rows: [
        {
          label: 'IT SHRINKS',
          text: 'The safe area gets smaller each phase. Everyone is squeezed toward everyone else.',
        },
        {
          label: `${ZONE.warningLeadSeconds}s WARNING`,
          text: 'You always get a warning before it moves. Travel then, not when the damage starts.',
        },
        {
          label: 'OUTSIDE HURTS',
          text: `${firstDps} health per second early on, ${lastDps} per second at the end. Being late in the last phase kills you.`,
        },
        {
          label: 'READ THE MAP',
          text: 'The minimap bottom right shows the circle. Stay ahead of it, not level with it.',
        },
      ],
    },
    {
      title: 'HOW TO WIN',
      tagline: 'Two ways out. Either one takes the level.',
      accent: '#f4d03f',
      rows: [
        {
          label: 'WAY ONE',
          text: 'Be the last one alive. Kill them yourself, or let them kill each other and finish who is left.',
        },
        {
          label: 'WAY TWO',
          text: `At ${SIGNAL.finalSurvivors} survivors a FINAL SIGNAL capture point opens in the middle of the circle.`,
        },
        {
          label: 'HOLD IT',
          text: `Stand in it alone for ${captureSeconds} seconds and you win outright, without killing the last two.`,
        },
        {
          label: 'CONTESTED',
          text: 'If anyone else steps inside, progress freezes until you clear them out.',
        },
        {
          label: 'STEP OUT',
          text: 'Leaving only drains progress at half speed, so ducking out for one fight will not undo you.',
        },
      ],
    },
    {
      title: 'THE SIGNAL CORE',
      tagline: 'Powerful, and it paints a target on you.',
      accent: '#b85fe0',
      rows: [
        {
          label: `${coreFrom}-${coreTo}s IN`,
          text: 'A core appears in the open inside the circle, marked on your minimap.',
        },
        {
          label: 'THE PRIZE',
          text: 'One random ability for the match: dash, shield, scan, sprint or blink.',
        },
        {
          label: 'THE PRICE',
          text: `Every ${pingSeconds} seconds your rough position is broadcast to everyone, and nearby enemies come hunting.`,
        },
        {
          label: 'OPTIONAL',
          text: 'You can win the level without ever touching it. While you are learning, leave it alone.',
        },
      ],
    },
    {
      title: 'LEVELS',
      tagline: 'The run only ever moves forward.',
      accent: '#9df5ff',
      rows: [
        { label: 'WIN', text: 'You advance a level, and it is saved. NEXT LEVEL starts the following match.' },
        { label: 'LOSE', text: 'You retry the same level. You never go backwards.' },
        {
          label: 'IT HARDENS',
          text: 'Each level puts more veteran enemies in the lobby. The map, the weapons and the circle stay the same.',
        },
        {
          label: 'PLAY IT SAFE',
          text: 'Most levels are won with three or four kills and good positioning, not fifteen kills.',
        },
      ],
    },
  ];
}

/**
 * The one place the game explains itself in words.
 *
 * The rest of the onboarding is contextual (see `systems/TutorialSystem.ts`) and never
 * pauses play. This screen exists because the win conditions - particularly the Final
 * Signal capture - cannot be discovered reliably by just playing.
 */
export class TutorialScene extends Phaser.Scene {
  private audio!: AudioSystem;
  private pages: TutorialPage[] = [];
  private index = 0;
  private firstRun = false;

  private panel!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private taglineText!: Phaser.GameObjects.Text;
  private counterText!: Phaser.GameObjects.Text;
  private body!: Phaser.GameObjects.Container;
  private dotGraphics!: Phaser.GameObjects.Graphics;
  private dotHits: Phaser.GameObjects.Zone[] = [];
  private prevButton!: Phaser.GameObjects.Container;
  private nextButton!: Phaser.GameObjects.Container;
  private nextLabel!: Phaser.GameObjects.Text;
  private skipText!: Phaser.GameObjects.Text;
  private leaving = false;

  constructor() {
    super(SceneKey.Tutorial);
  }

  create(data: TutorialSceneData): void {
    this.audio = (this.registry.get('audio') as AudioSystem | undefined) ?? new AudioSystem();
    this.registry.set('audio', this.audio);

    this.firstRun = data?.firstRun === true;
    this.leaving = false;
    this.index = 0;
    this.pages = buildPages(this.sys.game.device.input.touch);

    this.cameras.main.setBackgroundColor('#0b1119');
    this.cameras.main.fadeIn(180, 8, 12, 18);

    this.panel = this.add.graphics();
    this.titleText = this.add.text(0, 0, '', {
      fontFamily: FONT,
      fontSize: '34px',
      color: '#f4d03f',
      fontStyle: 'bold',
    });
    this.titleText.setShadow(0, 4, '#000000', 8);
    this.taglineText = this.add.text(0, 0, '', {
      fontFamily: FONT,
      fontSize: '15px',
      color: '#8fa3b8',
    });
    this.counterText = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '13px', color: '#5f6c7a' })
      .setOrigin(1, 0);

    this.body = this.add.container(0, 0);
    this.dotGraphics = this.add.graphics();
    this.dotHits = this.pages.map((_, i) => {
      // A generous invisible hit area - the dots themselves are far too small to tap.
      const hit = this.add
        .zone(0, 0, 26, 30)
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.jumpTo(i));
      return hit;
    });

    this.prevButton = this.makeButton('BACK', 132, 46, () => this.go(-1));
    const next = this.makeButton('NEXT', 176, 46, () => this.go(1));
    this.nextButton = next;
    this.nextLabel = next.getAt(1) as Phaser.GameObjects.Text;

    this.skipText = this.add
      .text(0, 0, 'SKIP', { fontFamily: FONT, fontSize: '13px', color: '#5f6c7a' })
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.skipText.on('pointerover', () => this.skipText.setColor('#9df5ff'));
    this.skipText.on('pointerout', () => this.skipText.setColor('#5f6c7a'));
    this.skipText.on('pointerdown', () => this.close());

    const keyboard = this.input.keyboard;
    keyboard?.on('keydown-RIGHT', () => this.go(1));
    keyboard?.on('keydown-LEFT', () => this.go(-1));
    keyboard?.on('keydown-SPACE', () => this.go(1));
    keyboard?.on('keydown-ENTER', () => this.go(1));
    keyboard?.on('keydown-ESC', () => this.close());

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });

    this.layout();
  }

  private go(direction: number): void {
    if (this.leaving) return;
    const target = this.index + direction;
    if (target < 0) return;
    if (target >= this.pages.length) {
      this.close();
      return;
    }
    this.index = target;
    this.audio.unlock();
    this.audio.play('uiClick');
    this.layout();
  }

  private jumpTo(page: number): void {
    if (this.leaving || page === this.index) return;
    this.index = page;
    this.audio.unlock();
    this.audio.play('uiClick');
    this.layout();
  }

  /** Marking it seen here rather than on entry means a closed tab does not skip it. */
  private close(): void {
    if (this.leaving) return;
    this.leaving = true;
    Storage.markTutorialSeen();
    this.audio.unlock();
    this.audio.play('uiClick');
    const cam = this.cameras.main;
    cam.resetFX();
    cam.fadeOut(160, 8, 12, 18);
    this.time.delayedCall(170, () => this.scene.start(SceneKey.Menu));
  }

  // ---------------------------------------------------------------- rendering

  private layout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const page = this.pages[this.index]!;

    const panelW = Math.min(720, w - 32);
    const pad = panelW < 480 ? 20 : 34;
    const narrow = panelW < 520;
    const headerH = narrow ? 96 : 110;
    const footerH = narrow ? 108 : 122;
    const maxPanelH = h - 32;

    // The rows are laid out first so the panel can be sized to the page rather than every
    // page sharing one fixed height and the short ones ending in dead space.
    const bodyHeight = this.renderRows(page, panelW - pad * 2, narrow, maxPanelH - headerH - footerH);
    const panelH = Math.min(
      maxPanelH,
      Math.max(narrow ? 290 : 330, headerH + bodyHeight + footerH),
    );
    const left = (w - panelW) / 2;
    const top = (h - panelH) / 2;
    this.body.setPosition(left + pad, top + headerH);

    this.panel.clear();
    this.panel.fillStyle(0x121c27, 0.96);
    this.panel.fillRoundedRect(left, top, panelW, panelH, 16);
    this.panel.lineStyle(3, 0x2f4356, 1);
    this.panel.strokeRoundedRect(left, top, panelW, panelH, 16);
    // A short accent rule under the heading, tinted per page.
    const accent = Phaser.Display.Color.HexStringToColor(page.accent).color;
    this.panel.fillStyle(accent, 0.9);
    this.panel.fillRect(left + pad, top + (narrow ? 78 : 88), 54, 3);

    this.titleText
      .setFontSize(narrow ? 26 : 34)
      .setColor(page.accent)
      .setText(page.title)
      .setPosition(left + pad, top + (narrow ? 26 : 30));
    this.taglineText
      .setFontSize(narrow ? 13 : 15)
      .setText(page.tagline)
      .setWordWrapWidth(panelW - pad * 2)
      .setPosition(left + pad, top + (narrow ? 56 : 66));
    this.counterText
      .setText(`${this.index + 1} / ${this.pages.length}`)
      .setPosition(left + panelW - pad, top + (narrow ? 30 : 36));

    const footerY = top + panelH - (narrow ? 56 : 64);
    this.prevButton.setPosition(left + pad + 66, footerY).setVisible(this.index > 0);
    this.nextButton.setPosition(left + panelW - pad - 88, footerY);
    const last = this.index === this.pages.length - 1;
    this.nextLabel.setText(last ? (this.firstRun ? 'GOT IT' : 'DONE') : 'NEXT');

    // SKIP and the page dots share the bottom rule, clear of the button row above them.
    const bottomRuleY = top + panelH - (narrow ? 20 : 24);
    this.skipText.setPosition(left + pad, bottomRuleY).setOrigin(0, 0.5).setVisible(!last);
    this.renderDots(left + panelW / 2, bottomRuleY);
  }

  /**
   * Lays the page out at the largest type size that still fits the space available, so a
   * long page on a short window shrinks rather than running off the bottom.
   */
  private renderRows(
    page: TutorialPage,
    width: number,
    narrow: boolean,
    available: number,
  ): number {
    const sizes = narrow ? [13, 12, 11, 10] : [15, 14, 13, 12];
    let height = 0;
    for (let i = 0; i < sizes.length; i++) {
      height = this.layoutRows(page, width, narrow, sizes[i]!);
      if (height <= available) break;
    }
    return height;
  }

  /**
   * Rows are positioned by hand rather than with one wrapped Text block so the label column
   * stays aligned on wide screens and collapses to stacked lines on a phone. Coordinates
   * are relative to `this.body`, which the caller places.
   */
  private layoutRows(
    page: TutorialPage,
    width: number,
    narrow: boolean,
    textSize: number,
  ): number {
    this.body.removeAll(true);
    const labelWidth = 124;
    const gap = Math.max(9, textSize - 1);
    let cursor = 0;

    for (const row of page.rows) {
      const label = this.add.text(0, cursor, row.label, {
        fontFamily: FONT,
        fontSize: `${Math.max(10, textSize - 3)}px`,
        color: page.accent,
        fontStyle: 'bold',
      });
      const textX = narrow ? 0 : labelWidth;
      const textY = narrow ? cursor + textSize + 4 : cursor - 2;
      const text = this.add.text(textX, textY, row.text, {
        fontFamily: FONT,
        fontSize: `${textSize}px`,
        color: '#c4d2e0',
        wordWrap: { width: narrow ? width : width - labelWidth },
        lineSpacing: 3,
      });
      this.body.add([label, text]);
      cursor = Math.max(text.y + text.height, label.y + label.height) + gap;
    }
    return Math.max(0, cursor - gap);
  }

  /**
   * The hit zones are built once in `create` and only moved here. Rebuilding interactive
   * objects on every layout - which a resize can trigger at any moment - risks handing a
   * pointer that is already down to a brand new zone, and silently jumping the page.
   */
  private renderDots(centerX: number, y: number): void {
    const spacing = 18;
    const startX = centerX - ((this.pages.length - 1) * spacing) / 2;
    this.dotGraphics.clear();
    for (let i = 0; i < this.pages.length; i++) {
      const active = i === this.index;
      const x = startX + i * spacing;
      this.dotGraphics.fillStyle(active ? PALETTE.gold : 0x3c4e60, 1);
      this.dotGraphics.fillCircle(x, y, active ? 5 : 3.5);
      this.dotHits[i]?.setPosition(x, y);
    }
  }

  private makeButton(
    label: string,
    width: number,
    height: number,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    const draw = (hover: boolean): void => {
      g.clear();
      g.fillStyle(hover ? 0x2a4a63 : 0x16222f, 0.95);
      g.fillRoundedRect(-width / 2, -height / 2, width, height, 10);
      g.lineStyle(2, hover ? PALETTE.gold : 0x2f4356, 1);
      g.strokeRoundedRect(-width / 2, -height / 2, width, height, 10);
    };
    draw(false);

    const text = this.add
      .text(0, 0, label, { fontFamily: FONT, fontSize: '19px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5, 0.5);

    const container = this.add.container(0, 0, [g, text]);
    container.setSize(width, height);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      Phaser.Geom.Rectangle.Contains,
    );
    container.on('pointerover', () => draw(true));
    container.on('pointerout', () => draw(false));
    container.on('pointerdown', onClick);
    return container;
  }
}
