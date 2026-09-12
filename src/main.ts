import Phaser from 'phaser';
import { VIEW } from './config/GameConfig';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { ResultScene } from './scenes/ResultScene';
import { TutorialScene } from './scenes/TutorialScene';
import { UIScene } from './scenes/UIScene';

const showFatalError = (message: string): void => {
  const box = document.getElementById('fatal-error');
  const text = document.getElementById('fatal-error-message');
  if (text) text.textContent = message;
  if (box) box.style.display = 'flex';
  document.getElementById('boot-splash')?.remove();
};

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#101820',
  scale: {
    // RESIZE keeps one world scale across devices; scenes re-layout on the resize event.
    // The initial size must be concrete - percentage sizes resolve to a 0x0 canvas.
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: window.innerWidth || VIEW.width,
    height: window.innerHeight || VIEW.height,
    expandParent: true,
    // Never let the canvas collapse to zero - a 0x0 WebGL framebuffer is fatal.
    min: { width: 320, height: 240 },
    max: { width: 3840, height: 2160 },
  },
  render: {
    antialias: true,
    roundPixels: false,
    powerPreference: 'high-performance',
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
      fps: 60,
      fixedStep: true,
    },
  },
  fps: {
    target: 60,
    min: 30,
  },
  // The game synthesises its own audio, so Phaser's sound manager stays out of the way.
  audio: { noAudio: true },
  disableContextMenu: true,
  scene: [BootScene, MenuScene, TutorialScene, GameScene, UIScene, ResultScene],
};

const boot = (): void => {
  try {
    const parent = document.getElementById('game-root');
    config.scale = {
      ...config.scale,
      width: parent?.clientWidth || window.innerWidth || VIEW.width,
      height: parent?.clientHeight || window.innerHeight || VIEW.height,
    };
    const game = new Phaser.Game(config);

    // Stop the page from scrolling or zooming under the canvas on touch devices.
    const prevent = (event: Event): void => event.preventDefault();
    document.addEventListener('touchmove', prevent, { passive: false });
    document.addEventListener('gesturestart', prevent as EventListener);
    window.addEventListener('contextmenu', prevent);

    window.addEventListener('resize', () => {
      game.scale.refresh();
    });

    if (import.meta.env.DEV) {
      // Handy console handle while developing; stripped from production builds.
      (window as unknown as Record<string, unknown>).__miniRoyale = game;
    }
  } catch (error) {
    showFatalError(error instanceof Error ? error.message : String(error));
  }
};

/**
 * A container that is still 0x0 (hidden iframes, embedded players, some mobile browsers)
 * makes WebGL build zero-sized framebuffers and the renderer dies on boot, so wait for a
 * real size first. The poll uses timers rather than requestAnimationFrame because rAF is
 * suspended while a tab is hidden, and it gives up after a moment so a permanently
 * hidden host still boots at the fallback resolution.
 */
const MAX_LAYOUT_WAIT_MS = 3000;
const waitForLayout = (startedAt = Date.now()): void => {
  const parent = document.getElementById('game-root');
  const ready = (parent?.clientWidth ?? 0) > 0 && (parent?.clientHeight ?? 0) > 0;
  // Wall-clock, not tick count: background tabs throttle timers to about one per second.
  if (ready || Date.now() - startedAt >= MAX_LAYOUT_WAIT_MS) {
    boot();
    return;
  }
  window.setTimeout(() => waitForLayout(startedAt), 50);
};

waitForLayout();
