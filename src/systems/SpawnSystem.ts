import { BOT_PROFILES, BOT_SKILL_WEIGHTS } from '../config/BotConfig';
import { WEAPONS } from '../config/WeaponConfig';
import { Rarity } from '../utils/Constants';
import { Weapon } from '../entities/Weapon';
import { SLOT_PRIMARY } from '../entities/Inventory';
import type { Combatant } from '../entities/Combatant';
import { MATCH, PALETTE, PLAYER, WORLD } from '../config/GameConfig';
import type { Vec2 } from '../utils/Constants';
import { distanceSq } from '../utils/MathUtils';
import { generateBotNames } from '../utils/RandomUtils';
import { Bot } from '../entities/Bot';
import { Player } from '../entities/Player';
import type { InputSystem } from './InputSystem';
import type { MatchContext } from './MatchContext';

const BOT_COLORS = [
  0xd8734a, 0xc45b6b, 0xb8695f, 0xd0885a, 0xa8636e,
  0xc97a52, 0xbf6a4f, 0xd46a6a, 0xb07158, 0xcf7f68,
];

const BOT_ACCENTS = [0xf0d4c0, 0xe8c8bc, 0xf2ded0, 0xecd0c2];

export interface PopulateResult {
  player: Player;
  bots: Bot[];
}

/**
 * Places the human and the AI field on the map at the start of a match.
 * Spawn points come pre-separated from the map generator; this adds a second pass so a
 * degenerate seed still cannot drop two combatants on top of each other.
 */
export class SpawnSystem {
  static populate(ctx: MatchContext, input: InputSystem, level = 1): PopulateResult {
    const rng = ctx.rng;
    const skillWeights = SpawnSystem.skillWeightsForLevel(level);
    const points = SpawnSystem.pickSpawnPoints(ctx, MATCH.totalCombatants);
    const names = generateBotNames(rng, MATCH.botCount);

    const playerSpawn = points[0] as Vec2;
    const player = new Player(
      ctx,
      {
        id: 0,
        name: 'You',
        x: playerSpawn.x,
        y: playerSpawn.y,
        isPlayer: true,
        bodyColor: PALETTE.playerBody,
        accentColor: PALETTE.playerAccent,
      },
      input,
    );

    const bots: Bot[] = [];
    for (let i = 0; i < MATCH.botCount; i++) {
      const spawn = points[i + 1] as Vec2;
      const skill = rng.weighted(skillWeights);
      const profile = BOT_PROFILES[skill];
      const bot = new Bot(
        ctx,
        {
          id: i + 1,
          name: names[i] ?? `Bot${i}`,
          x: spawn.x,
          y: spawn.y,
          isPlayer: false,
          bodyColor: BOT_COLORS[i % BOT_COLORS.length] as number,
          accentColor: BOT_ACCENTS[i % BOT_ACCENTS.length] as number,
          speedMultiplier: PLAYER.botSpeedMult * rng.range(0.96, 1.04),
        },
        profile,
      );
      bot.nextThinkAt = ctx.now + rng.range(0, 400);
      bots.push(bot);
    }

    SpawnSystem.armWithSidearm(player);
    if (MATCH.botsStartArmed) {
      for (const bot of bots) SpawnSystem.armWithSidearm(bot);
    }

    return { player, bots };
  }

  /**
   * Later levels field tougher lobbies: the mix shifts from mostly rookies at level 1
   * to mostly veterans by level 10. Nothing else about the bots changes.
   */
  private static skillWeightsForLevel(level: number): typeof BOT_SKILL_WEIGHTS {
    const t = Math.min(1, Math.max(0, (level - 1) / 9));
    return [
      { value: BOT_SKILL_WEIGHTS[0]!.value, weight: 52 - 42 * t },
      { value: BOT_SKILL_WEIGHTS[1]!.value, weight: 38 },
      { value: BOT_SKILL_WEIGHTS[2]!.value, weight: 10 + 42 * t },
    ];
  }

  /**
   * Drops a combatant in with the basic sidearm and a spare magazine. Looting still
   * decides the match - it is how you get a real gun, armor and heals - but the player
   * never spends their first thirty seconds unable to shoot back.
   */
  private static armWithSidearm(c: Combatant): void {
    const id = MATCH.startingWeapon;
    const weapon = new Weapon(id, Rarity.Common);
    c.inventory.equip(weapon, SLOT_PRIMARY);
    c.inventory.addAmmo(WEAPONS[id].ammo, MATCH.startingSpareAmmo);
    c.selectSlot(SLOT_PRIMARY);
  }

  /**
   * Takes the map's pre-spread grid drops in a random order. The generator already
   * guarantees the spacing, so this only shuffles and tops up if a seed came up short.
   */
  private static pickSpawnPoints(ctx: MatchContext, count: number): Vec2[] {
    const rng = ctx.rng;
    const grid = ctx.map.navGrid;
    const chosen = rng.shuffle([...ctx.map.spawnPoints]).slice(0, count);
    const minSepSq = MATCH.minSpawnSeparation * MATCH.minSpawnSeparation * 0.3;

    let guard = 0;
    while (chosen.length < count && guard++ < 4000) {
      const x = rng.range(240, WORLD.width - 240);
      const y = rng.range(240, WORLD.height - 240);
      if (!grid.isWalkable(x, y)) continue;
      let ok = true;
      for (const c of chosen) {
        if (distanceSq(x, y, c.x, c.y) < minSepSq) {
          ok = false;
          break;
        }
      }
      if (ok) chosen.push({ x, y });
    }
    while (chosen.length < count) chosen.push({ x: WORLD.width / 2, y: WORLD.height / 2 });
    return chosen;
  }
}
