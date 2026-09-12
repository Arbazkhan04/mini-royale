import Phaser from 'phaser';
import { TextureFactory } from '../graphics/TextureFactory';
import { SceneKey } from '../utils/Constants';

/**
 * Generates every runtime texture and hands off to the menu.
 * There are no external asset loads, so boot is a single synchronous pass.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  create(): void {
    new TextureFactory(this).generateAll();

    // Fade out the HTML splash now that the canvas has something to show.
    const splash = document.getElementById('boot-splash');
    if (splash) {
      splash.classList.add('hidden');
      window.setTimeout(() => splash.remove(), 600);
    }

    this.scene.start(SceneKey.Menu);
  }
}
