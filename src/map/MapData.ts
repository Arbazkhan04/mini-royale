import type { TerrainKind, Vec2 } from '../utils/Constants';
import type { LootTier } from '../config/LootConfig';
import type { Building } from './Building';
import type { CoverObject } from './CoverObject';
import type { NavGrid } from './NavGrid';

export interface TerrainPatch {
  kind: TerrainKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  shape: 'rect' | 'ellipse';
  alpha: number;
}

export interface Decal {
  /** Texture key for the scatter sprite. */
  tex: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  alpha: number;
  tint: number;
}

export interface LootPoint {
  x: number;
  y: number;
  tier: LootTier;
  /** Set when the point lives inside a building, used for bot indoor looting. */
  buildingId?: number;
}

export interface MapArea {
  name: string;
  x: number;
  y: number;
  radius: number;
}

export interface MapData {
  seed: number;
  width: number;
  height: number;
  terrain: TerrainPatch[];
  decals: Decal[];
  buildings: Building[];
  obstacles: CoverObject[];
  lootPoints: LootPoint[];
  spawnPoints: Vec2[];
  areas: MapArea[];
  navGrid: NavGrid;
}
