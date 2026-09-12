/**
 * Seeded deterministic RNG (mulberry32). Every match creates one instance from a seed so
 * a match can be reproduced, and so map generation is stable across systems.
 */
export class Rng {
  private state: number;

  constructor(public readonly seed: number) {
    this.state = seed >>> 0;
  }

  /** float in [0,1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** float in [min,max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** integer in [min,max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  bool(chance = 0.5): boolean {
    return this.next() < chance;
  }

  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick called with an empty array');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Picks by relative weight. Weights must be non-negative and not all zero. */
  weighted<T>(entries: ReadonlyArray<{ value: T; weight: number }>): T {
    let total = 0;
    for (const e of entries) total += Math.max(0, e.weight);
    let roll = this.next() * total;
    for (const e of entries) {
      roll -= Math.max(0, e.weight);
      if (roll <= 0) return e.value;
    }
    return entries[entries.length - 1]!.value;
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }

  /** Gaussian-ish value in roughly [-1,1], concentrated near 0. Used for aim error. */
  gaussian(): number {
    return (this.next() + this.next() + this.next() - 1.5) / 1.5;
  }

  pointInCircle(cx: number, cy: number, radius: number): { x: number; y: number } {
    const a = this.next() * Math.PI * 2;
    const r = Math.sqrt(this.next()) * radius;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  }
}

export const randomSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0;

const FIRST_NAMES = [
  'Raven', 'Hunter', 'Viper', 'Ghost', 'Echo', 'Nomad', 'Rook', 'Falcon',
  'Cobra', 'Wolf', 'Ember', 'Frost', 'Bandit', 'Static', 'Onyx', 'Pilot',
  'Wraith', 'Talon', 'Comet', 'Drift', 'Havoc', 'Jinx', 'Kite', 'Lynx',
  'Maverick', 'Nova', 'Orbit', 'Pike', 'Quartz', 'Rebel', 'Saber', 'Tundra',
  'Umbra', 'Vandal', 'Warden', 'Zephyr', 'Ash', 'Blitz', 'Cinder', 'Dune',
];

const SUFFIXES = ['', '', '', '', '_X', '77', '99', 'TV', '_HD', '01', 'Z', '_GG'];

/** Generates a set of unique arcade-style bot names. */
export const generateBotNames = (rng: Rng, count: number): string[] => {
  const pool = rng.shuffle([...FIRST_NAMES]);
  const names: string[] = [];
  const used = new Set<string>();
  let i = 0;
  while (names.length < count) {
    const base = pool[i % pool.length] as string;
    const suffix = i < pool.length ? (rng.bool(0.25) ? rng.pick(SUFFIXES) : '') : rng.pick(SUFFIXES.slice(4));
    const name = `${base}${suffix}`;
    if (!used.has(name)) {
      used.add(name);
      names.push(name);
    }
    i++;
    if (i > count * 12) break;
  }
  while (names.length < count) names.push(`Rookie${names.length}`);
  return names;
};
