import { SCORE } from '../config/GameConfig';
import { LEGACY_STORAGE_KEY, STORAGE_KEY } from './Constants';

export interface MatchResult {
  victory: boolean;
  /** The level this match was played at. */
  level: number;
  placement: number;
  totalCombatants: number;
  kills: number;
  damage: number;
  survivedMs: number;
  shotsFired: number;
  shotsHit: number;
  score: number;
  seed: number;
}

export interface SaveData {
  /** Current level. Goes up on a win, never down on a loss. */
  level: number;
  /** The how-to-play screen shows itself once, then only on request. */
  tutorialSeen: boolean;
  bestLevel: number;
  matchesPlayed: number;
  wins: number;
  bestScore: number;
  mostKills: number;
  totalKills: number;
  totalDamage: number;
  bestPlacement: number;
}

const DEFAULT_SAVE: SaveData = {
  level: 1,
  tutorialSeen: false,
  bestLevel: 1,
  matchesPlayed: 0,
  wins: 0,
  bestScore: 0,
  mostKills: 0,
  totalKills: 0,
  totalDamage: 0,
  bestPlacement: 99,
};

/** Small localStorage-backed profile. Every access is guarded - storage can throw. */
export class Storage {
  static load(): SaveData {
    try {
      const raw =
        window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SAVE };
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return {
        level: Math.max(1, Number(parsed.level) || 1),
        tutorialSeen: parsed.tutorialSeen === true,
        bestLevel: Math.max(1, Number(parsed.bestLevel) || 1),
        matchesPlayed: Number(parsed.matchesPlayed) || 0,
        wins: Number(parsed.wins) || 0,
        bestScore: Number(parsed.bestScore) || 0,
        mostKills: Number(parsed.mostKills) || 0,
        totalKills: Number(parsed.totalKills) || 0,
        totalDamage: Number(parsed.totalDamage) || 0,
        bestPlacement: Number(parsed.bestPlacement) || 99,
      };
    } catch {
      return { ...DEFAULT_SAVE };
    }
  }

  static save(data: SaveData): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* private mode or storage disabled - progression simply is not persisted */
    }
  }

  /** Called when the player closes the how-to-play screen, however they got there. */
  static markTutorialSeen(): void {
    const data = Storage.load();
    if (data.tutorialSeen) return;
    data.tutorialSeen = true;
    Storage.save(data);
  }

  static record(result: MatchResult): SaveData {
    const data = Storage.load();
    data.matchesPlayed += 1;
    // Winning advances a level; losing lets you retry the same one.
    if (result.victory) {
      data.wins += 1;
      data.level += 1;
      data.bestLevel = Math.max(data.bestLevel, data.level);
    }
    data.bestScore = Math.max(data.bestScore, result.score);
    data.mostKills = Math.max(data.mostKills, result.kills);
    data.totalKills += result.kills;
    data.totalDamage += Math.round(result.damage);
    data.bestPlacement = Math.min(data.bestPlacement, result.placement);
    Storage.save(data);
    return data;
  }

  static reset(): void {
    Storage.save({ ...DEFAULT_SAVE });
  }
}

/** Score formula: kills, damage, survival, placement and a victory bonus. */
export const computeScore = (
  kills: number,
  damage: number,
  survivedMs: number,
  placement: number,
  totalCombatants: number,
  victory: boolean,
): number => {
  const placementBonus = Math.max(0, totalCombatants - placement) * SCORE.placementStep;
  return Math.round(
    kills * SCORE.perKill +
      damage * SCORE.perDamage +
      (survivedMs / 1000) * SCORE.perSurvivalSecond +
      placementBonus +
      (victory ? SCORE.victoryBonus : 0),
  );
};

export const accuracyPercent = (hits: number, fired: number): number =>
  fired <= 0 ? 0 : Math.round((hits / fired) * 1000) / 10;
