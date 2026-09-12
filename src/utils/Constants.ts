/**
 * Shared enums, string keys and small value objects.
 * Nothing in here may import scenes or entities - it is the bottom of the dependency graph.
 */

export enum GameState {
  Boot = 'boot',
  Menu = 'menu',
  Countdown = 'countdown',
  Playing = 'playing',
  Paused = 'paused',
  Finished = 'finished',
}

export enum WeaponType {
  Melee = 'melee',
  Pistol = 'pistol',
  SMG = 'smg',
  AssaultRifle = 'ar',
  Shotgun = 'shotgun',
  Sniper = 'sniper',
  LMG = 'lmg',
}

export enum AmmoType {
  None = 'none',
  Light = 'light',
  Medium = 'medium',
  Shells = 'shells',
  Sniper = 'sniperAmmo',
}

export enum LootType {
  Weapon = 'weapon',
  Ammo = 'ammo',
  Armor = 'armor',
  Helmet = 'helmet',
  Bandage = 'bandage',
  Medkit = 'medkit',
}

export enum Rarity {
  Common = 'common',
  Uncommon = 'uncommon',
  Rare = 'rare',
  Epic = 'epic',
}

export enum ArmorLevel {
  None = 0,
  One = 1,
  Two = 2,
  Three = 3,
}

export enum BotState {
  Idle = 'idle',
  Explore = 'explore',
  Loot = 'loot',
  MoveToZone = 'zone',
  SearchEnemy = 'search',
  Attack = 'attack',
  TakeCover = 'cover',
  Heal = 'heal',
  Flee = 'flee',
  Dead = 'dead',
}

export enum BotSkill {
  Beginner = 'beginner',
  Average = 'average',
  Skilled = 'skilled',
}

export enum SignalAbility {
  Dash = 'dash',
  ShieldPulse = 'shield',
  DroneScan = 'scan',
  SpeedBoost = 'speed',
  Teleport = 'teleport',
}

export enum MatchEventKind {
  Fog = 'fog',
  RadarPulse = 'radar',
  SupplyDrop = 'supply',
}

export enum ZonePattern {
  Standard = 'standard',
  Moving = 'moving',
  Split = 'split',
}

export enum NoiseKind {
  Walk = 'walk',
  Run = 'run',
  Reload = 'reload',
  Door = 'door',
  Gunshot = 'gunshot',
}

export enum ObstacleKind {
  Tree = 'tree',
  Rock = 'rock',
  Crate = 'crate',
  Bush = 'bush',
  Barrel = 'barrel',
  Fence = 'fence',
  Sandbag = 'sandbag',
  Table = 'table',
  Shelf = 'shelf',
  Locker = 'locker',
  Wall = 'wall',
  Door = 'door',
  Barricade = 'barricade',
}

export enum TerrainKind {
  Grass = 'grass',
  Dirt = 'dirt',
  Road = 'road',
  Sand = 'sand',
  Concrete = 'concrete',
}

export enum SurfaceKind {
  Wood = 'wood',
  Concrete = 'concrete',
  Tile = 'tile',
}

/** Render layer ordering. Entities add a small y-based bias on top of Entity. */
export const Depth = {
  Ground: 0,
  Decal: 5,
  Floor: 10,
  FloorDecal: 12,
  Shadow: 18,
  Loot: 20,
  LowObstacle: 24,
  Entity: 40,
  Bullet: 70,
  Obstacle: 75,
  Effect: 85,
  Roof: 95,
  ZoneOverlay: 120,
  Debug: 150,
} as const;

/** Texture keys generated procedurally in BootScene. */
export const Tex = {
  Grass: 'tex-grass',
  Dirt: 'tex-dirt',
  Sand: 'tex-sand',
  Road: 'tex-road',
  Concrete: 'tex-concrete',
  FloorWood: 'tex-floor-wood',
  FloorConcrete: 'tex-floor-concrete',
  FloorTile: 'tex-floor-tile',
  Roof: 'tex-roof',
  Shadow: 'tex-shadow',
  SignalCore: 'tex-signal-core',
  SignalShard: 'tex-signal-shard',
  SupplyCrate: 'tex-supply-crate',
  AbilityDash: 'tex-ability-dash',
  AbilityShield: 'tex-ability-shield',
  AbilityScan: 'tex-ability-scan',
  AbilitySpeed: 'tex-ability-speed',
  AbilityTeleport: 'tex-ability-teleport',
  Cracks: 'tex-cracks',
  Door: 'tex-door',
  Barricade: 'tex-barricade',
  Splinter: 'tex-splinter',
  Blob: 'tex-blob',
  SoftGlow: 'tex-soft-glow',
  Spark: 'tex-spark',
  Smoke: 'tex-smoke',
  Blood: 'tex-blood',
  Bullet: 'tex-bullet',
  Pellet: 'tex-pellet',
  Muzzle: 'tex-muzzle',
  TreeCanopy: 'tex-tree-canopy',
  TreeCanopyDark: 'tex-tree-canopy-dark',
  TreeTrunk: 'tex-tree-trunk',
  Bush: 'tex-bush',
  Rock: 'tex-rock',
  Crate: 'tex-crate',
  Barrel: 'tex-barrel',
  Sandbag: 'tex-sandbag',
  Table: 'tex-table',
  Shelf: 'tex-shelf',
  Locker: 'tex-locker',
  GrassTuft: 'tex-grass-tuft',
  Pebble: 'tex-pebble',
  Body: 'tex-body',
  Head: 'tex-head',
  Hand: 'tex-hand',
  Backpack: 'tex-backpack',
  LootPad: 'tex-loot-pad',
  Ring: 'tex-ring',
  Vest: 'tex-vest',
  HelmetIcon: 'tex-helmet',
  BandageIcon: 'tex-bandage',
  MedkitIcon: 'tex-medkit',
  AmmoBox: 'tex-ammo-box',
  Arrow: 'tex-arrow',
} as const;

/** Prefix for procedurally generated weapon silhouettes: `wpn-<weaponId>`. */
export const WEAPON_TEX_PREFIX = 'wpn-';
export const weaponTexture = (id: string): string => `${WEAPON_TEX_PREFIX}${id}`;

export const SceneKey = {
  Boot: 'BootScene',
  Menu: 'MenuScene',
  Tutorial: 'TutorialScene',
  Game: 'GameScene',
  UI: 'UIScene',
  Result: 'ResultScene',
} as const;

/** Events emitted on the match event bus (decoupled from Phaser scene wiring). */
export const GameEvent = {
  MatchStart: 'match:start',
  MatchEnd: 'match:end',
  CountdownTick: 'match:countdown',
  Kill: 'combat:kill',
  Damage: 'combat:damage',
  PlayerDamaged: 'player:damaged',
  PlayerHealthChanged: 'player:health',
  PlayerInventoryChanged: 'player:inventory',
  PlayerPromptChanged: 'player:prompt',
  PlayerHealProgress: 'player:heal-progress',
  PlayerReloadProgress: 'player:reload-progress',
  AliveCountChanged: 'match:alive',
  ZonePhaseChanged: 'zone:phase',
  ZoneWarning: 'zone:warning',
  Gunshot: 'world:gunshot',
  Notice: 'ui:notice',
  /** Short all-caps banner shown centre screen. */
  Announce: 'ui:announce',
  /** Contextual teaching prompt (never modal). */
  Hint: 'ui:hint',
  /** Directional cue for a heard noise. */
  NoiseHeard: 'ui:noise',

  SignalSpawned: 'signal:spawned',
  SignalTaken: 'signal:taken',
  SignalDropped: 'signal:dropped',
  SignalPing: 'signal:ping',
  AbilityChanged: 'signal:ability',
  AbilityUsed: 'signal:ability-used',
  FinalSignalStarted: 'signal:final-start',
  FinalSignalProgress: 'signal:final-progress',

  MatchEventStarted: 'event:start',
  MatchEventEnded: 'event:end',
  SupplyDropLanded: 'event:supply',
} as const;

export const STORAGE_KEY = 'last-signal-save-v1';
/** Previous branding; read once so existing progress carries over. */
export const LEGACY_STORAGE_KEY = 'mini-royale-save-v1';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}
