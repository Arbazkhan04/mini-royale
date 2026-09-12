import { MATCH, WORLD } from '../config/GameConfig';
import { LootTier } from '../config/LootConfig';
import { ObstacleKind, SurfaceKind, TerrainKind, Tex } from '../utils/Constants';
import type { Rect, Vec2 } from '../utils/Constants';
import { circleRectOverlap, distanceSq, expandRect, pointInRect } from '../utils/MathUtils';
import { Rng } from '../utils/RandomUtils';
import { Building } from './Building';
import { CoverObject } from './CoverObject';
import type { Decal, LootPoint, MapArea, MapData, TerrainPatch } from './MapData';
import { NavGrid } from './NavGrid';

const WALL_T = 16;
const DOOR_W = 78;
export const NAV_CELL = 25;
/** Cell size for the placement grid used while generating the map. */
const PLACE_CELL = 120;
/** Grid inflation for walkability - a touch under the body radius so doorways stay open. */
export const NAV_INFLATE = 13;

/** Hit points for the wooden things that can be shot apart. */
export const COVER_HP = {
  door: 130,
  fence: 70,
  crate: 110,
  barricade: 95,
} as const;

interface BuildingSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  floor: SurfaceKind;
  name: string;
  doors: Array<'n' | 's' | 'e' | 'w'>;
  lootTier: LootTier;
  lootCount: number;
  rooms?: number;
  roofColor?: number;
  roofShade?: number;
  wallColor?: number;
}

/**
 * Builds the Mini Royale island: a fixed set of named districts whose contents
 * (house rotation, clutter, tree placement, loot points) are randomised per seed.
 */
export class MapGenerator {
  private readonly rng: Rng;
  private readonly terrain: TerrainPatch[] = [];
  private readonly decals: Decal[] = [];
  private readonly buildings: Building[] = [];
  private readonly obstacles: CoverObject[] = [];
  private readonly lootPoints: LootPoint[] = [];
  private readonly areas: MapArea[] = [];
  private readonly doorGuards: Vec2[] = [];
  /**
   * Uniform grid over the obstacle list. Placement tests used to scan every obstacle
   * placed so far, which is quadratic and was the bulk of map generation time.
   */
  private readonly placementGrid = new Map<number, CoverObject[]>();
  private readonly lootGrid = new Map<number, Vec2[]>();

  private constructor(readonly seed: number) {
    this.rng = new Rng(seed);
  }

  static generate(seed: number): MapData {
    return new MapGenerator(seed).build();
  }

  private build(): MapData {
    this.buildTerrain();
    this.buildRoads();
    this.buildTown();
    this.buildWarehouseCompound();
    this.buildCentralComplex();
    this.buildCheckpoint();
    this.buildForest();
    this.buildOpenField();
    this.buildOutskirts();
    this.scatterWorldClutter();
    this.scatterDecals();

    const navGrid = this.buildNavGrid();
    const spawnPoints = this.buildSpawnPoints(navGrid);
    this.pruneLootPoints(navGrid);

    return {
      seed: this.seed,
      width: WORLD.width,
      height: WORLD.height,
      terrain: this.terrain,
      decals: this.decals,
      buildings: this.buildings,
      obstacles: this.obstacles,
      lootPoints: this.lootPoints,
      spawnPoints,
      areas: this.areas,
      navGrid,
    };
  }

  // ---------------------------------------------------------------- terrain

  private buildTerrain(): void {
    const rng = this.rng;
    // Broad dirt/sand blotches so the ground never reads as a flat green sheet.
    for (let i = 0; i < 26; i++) {
      const w = rng.range(240, 620);
      this.terrain.push({
        kind: rng.bool(0.7) ? TerrainKind.Dirt : TerrainKind.Sand,
        x: rng.range(120, WORLD.width - 120),
        y: rng.range(120, WORLD.height - 120),
        w,
        h: w * rng.range(0.55, 1.0),
        rotation: rng.range(0, Math.PI),
        shape: 'ellipse',
        alpha: rng.range(0.35, 0.62),
      });
    }
    // Darker grass variation.
    for (let i = 0; i < 30; i++) {
      const w = rng.range(300, 780);
      this.terrain.push({
        kind: TerrainKind.Grass,
        x: rng.range(100, WORLD.width - 100),
        y: rng.range(100, WORLD.height - 100),
        w,
        h: w * rng.range(0.5, 1.1),
        rotation: rng.range(0, Math.PI),
        shape: 'ellipse',
        alpha: rng.range(0.2, 0.4),
      });
    }
  }

  private buildRoads(): void {
    const road = (x: number, y: number, w: number, h: number): void => {
      this.terrain.push({
        kind: TerrainKind.Road,
        x: x + w / 2,
        y: y + h / 2,
        w,
        h,
        rotation: 0,
        shape: 'rect',
        alpha: 1,
      });
    };
    // Main cross.
    road(0, 1160, WORLD.width, 130);
    road(1430, 0, 130, WORLD.height);
    // Town loop.
    road(940, 470, 1120, 96);
    road(940, 470, 96, 620);
    road(1964, 470, 96, 620);
    // Compound access road.
    road(2180, 1225, 96, 700);
    // Checkpoint spur.
    road(240, 1000, 700, 90);
  }

  // ---------------------------------------------------------------- districts

  private buildTown(): void {
    this.areas.push({ name: 'Ridgeline', x: 1500, y: 760, radius: 640 });
    const rng = this.rng;
    const specs: BuildingSpec[] = [
      { x: 1060, y: 250, w: 250, h: 190, floor: SurfaceKind.Wood, name: 'House', doors: ['s'], lootTier: LootTier.Normal, lootCount: 3 },
      { x: 1400, y: 230, w: 300, h: 210, floor: SurfaceKind.Wood, name: 'House', doors: ['s', 'e'], lootTier: LootTier.Normal, lootCount: 4, rooms: 1 },
      { x: 1790, y: 250, w: 240, h: 190, floor: SurfaceKind.Wood, name: 'House', doors: ['s'], lootTier: LootTier.Normal, lootCount: 3 },
      { x: 1075, y: 620, w: 260, h: 230, floor: SurfaceKind.Tile, name: 'Store', doors: ['n', 'e'], lootTier: LootTier.Rich, lootCount: 5, rooms: 1 },
      { x: 1740, y: 610, w: 280, h: 240, floor: SurfaceKind.Wood, name: 'House', doors: ['n', 'w'], lootTier: LootTier.Normal, lootCount: 4, rooms: 1 },
      { x: 1370, y: 640, w: 330, h: 260, floor: SurfaceKind.Concrete, name: 'Town Hall', doors: ['n', 's'], lootTier: LootTier.Rich, lootCount: 6, rooms: 2 },
      { x: 1050, y: 930, w: 230, h: 175, floor: SurfaceKind.Wood, name: 'Shed', doors: ['e'], lootTier: LootTier.Sparse, lootCount: 2 },
      { x: 1800, y: 940, w: 240, h: 180, floor: SurfaceKind.Wood, name: 'Shed', doors: ['w'], lootTier: LootTier.Sparse, lootCount: 2 },
    ];
    for (const spec of specs) this.createBuilding(spec);

    // Street furniture between the houses.
    for (let i = 0; i < 16; i++) {
      const x = rng.range(1000, 2060);
      const y = rng.range(220, 1120);
      this.tryPlace(() => this.makeProp(x, y, rng.weighted([
        { value: ObstacleKind.Crate, weight: 4 },
        { value: ObstacleKind.Barrel, weight: 3 },
        { value: ObstacleKind.Bush, weight: 4 },
        { value: ObstacleKind.Tree, weight: 3 },
        { value: ObstacleKind.Rock, weight: 2 },
      ])));
    }
    this.addFenceLine(1010, 1130, 1330, 1130);
    this.addFenceLine(1760, 1130, 2070, 1130);
    this.scatterLootPoints(1000, 200, 1080, 950, 10, LootTier.Normal);
  }

  private buildWarehouseCompound(): void {
    this.areas.push({ name: 'Depot', x: 2470, y: 1640, radius: 520 });
    const rng = this.rng;
    this.terrain.push({
      kind: TerrainKind.Concrete,
      x: 2470,
      y: 1640,
      w: 780,
      h: 800,
      rotation: 0,
      shape: 'rect',
      alpha: 0.85,
    });

    this.createBuilding({
      x: 2170, y: 1310, w: 420, h: 300, floor: SurfaceKind.Concrete, name: 'Warehouse A',
      doors: ['s', 'w'], lootTier: LootTier.Rich, lootCount: 7, rooms: 1,
      roofColor: 0x5a6570, roofShade: 0x46505a, wallColor: 0xa8adb4,
    });
    this.createBuilding({
      x: 2360, y: 1720, w: 460, h: 320, floor: SurfaceKind.Concrete, name: 'Warehouse B',
      doors: ['n', 'w', 'e'], lootTier: LootTier.Rich, lootCount: 8, rooms: 2,
      roofColor: 0x5a6570, roofShade: 0x46505a, wallColor: 0xa8adb4,
    });
    this.createBuilding({
      x: 2130, y: 1700, w: 170, h: 150, floor: SurfaceKind.Concrete, name: 'Office',
      doors: ['e'], lootTier: LootTier.Normal, lootCount: 2,
      roofColor: 0x5a6570, roofShade: 0x46505a, wallColor: 0xa8adb4,
    });

    // Container stacks and pallets in the yard.
    for (let i = 0; i < 22; i++) {
      const x = rng.range(2100, 2900);
      const y = rng.range(1260, 2080);
      this.tryPlace(() => this.makeProp(x, y, rng.weighted([
        { value: ObstacleKind.Crate, weight: 6 },
        { value: ObstacleKind.Barrel, weight: 4 },
        { value: ObstacleKind.Sandbag, weight: 2 },
      ])));
    }
    this.addFenceLine(2080, 1240, 2900, 1240);
    this.addFenceLine(2900, 1240, 2900, 2100);
    this.addFenceLine(2080, 2100, 2760, 2100);
    this.scatterLootPoints(2100, 1260, 800, 820, 10, LootTier.Normal);
  }

  private buildCentralComplex(): void {
    this.areas.push({ name: 'The Vault', x: 1520, y: 1600, radius: 420 });
    this.terrain.push({
      kind: TerrainKind.Concrete,
      x: 1520,
      y: 1600,
      w: 620,
      h: 560,
      rotation: 0,
      shape: 'rect',
      alpha: 0.9,
    });
    this.createBuilding({
      x: 1280, y: 1380, w: 340, h: 260, floor: SurfaceKind.Tile, name: 'Vault North',
      doors: ['s', 'e'], lootTier: LootTier.Rich, lootCount: 7, rooms: 1,
      roofColor: 0x4d5a63, roofShade: 0x3b464e, wallColor: 0xc2c7cc,
    });
    this.createBuilding({
      x: 1420, y: 1700, w: 380, h: 280, floor: SurfaceKind.Tile, name: 'Vault South',
      doors: ['n', 'w', 'e'], lootTier: LootTier.Rich, lootCount: 8, rooms: 2,
      roofColor: 0x4d5a63, roofShade: 0x3b464e, wallColor: 0xc2c7cc,
    });

    const rng = this.rng;
    for (let i = 0; i < 14; i++) {
      const x = rng.range(1240, 1830);
      const y = rng.range(1340, 2010);
      this.tryPlace(() => this.makeProp(x, y, rng.weighted([
        { value: ObstacleKind.Sandbag, weight: 5 },
        { value: ObstacleKind.Crate, weight: 4 },
        { value: ObstacleKind.Barrel, weight: 3 },
      ])));
    }
    this.scatterLootPoints(1240, 1340, 600, 680, 8, LootTier.Rich);
  }

  private buildCheckpoint(): void {
    this.areas.push({ name: 'Checkpoint', x: 560, y: 1180, radius: 380 });
    this.createBuilding({
      x: 330, y: 1180, w: 220, h: 170, floor: SurfaceKind.Concrete, name: 'Guard Post',
      doors: ['e'], lootTier: LootTier.Normal, lootCount: 3,
      roofColor: 0x5d6b52, roofShade: 0x475440, wallColor: 0xa9b09c,
    });
    this.createBuilding({
      x: 640, y: 1250, w: 190, h: 150, floor: SurfaceKind.Concrete, name: 'Bunker',
      doors: ['n'], lootTier: LootTier.Rich, lootCount: 4,
      roofColor: 0x5d6b52, roofShade: 0x475440, wallColor: 0xa9b09c,
    });

    // Barricade line across the road: sandbags that stop bullets and wooden barricades
    // that only stop them for a while.
    for (let i = 0; i < 6; i++) {
      this.tryPlace(() =>
        this.makeSandbag(this.rng.range(340, 900), this.rng.range(1000, 1120), this.rng.bool()),
      );
    }
    for (let i = 0; i < 5; i++) {
      this.tryPlace(() =>
        this.makeProp(
          this.rng.range(300, 900),
          this.rng.range(960, 1160),
          ObstacleKind.Barricade,
          this.rng.bool(),
        ),
      );
    }
    for (let i = 0; i < 10; i++) {
      const x = this.rng.range(260, 900);
      const y = this.rng.range(950, 1500);
      this.tryPlace(() => this.makeProp(x, y, this.rng.weighted([
        { value: ObstacleKind.Barrel, weight: 4 },
        { value: ObstacleKind.Crate, weight: 3 },
        { value: ObstacleKind.Rock, weight: 3 },
        { value: ObstacleKind.Tree, weight: 3 },
      ])));
    }
    this.scatterLootPoints(280, 950, 640, 560, 7, LootTier.Normal);
  }

  private buildForest(): void {
    this.areas.push({ name: 'Blackpine', x: 690, y: 2200, radius: 620 });
    const rng = this.rng;
    for (let i = 0; i < 150; i++) {
      const x = rng.range(180, 1200);
      const y = rng.range(1700, 2830);
      // Thin the trees near the edges so the forest has a soft border.
      const edge = Math.min(1, Math.min(x - 180, 1200 - x, y - 1700, 2830 - y) / 220);
      if (rng.next() > 0.35 + edge * 0.65) continue;
      this.tryPlace(() => this.makeTree(x, y, rng.range(0.85, 1.35)));
    }
    for (let i = 0; i < 34; i++) {
      const x = rng.range(200, 1200);
      const y = rng.range(1700, 2830);
      this.tryPlace(() => this.makeProp(x, y, rng.weighted([
        { value: ObstacleKind.Bush, weight: 6 },
        { value: ObstacleKind.Rock, weight: 4 },
      ])));
    }
    this.createBuilding({
      x: 520, y: 2020, w: 220, h: 180, floor: SurfaceKind.Wood, name: 'Cabin',
      doors: ['e'], lootTier: LootTier.Normal, lootCount: 3,
      roofColor: 0x4f4132, roofShade: 0x3c3126,
    });
    this.createBuilding({
      x: 880, y: 2520, w: 200, h: 160, floor: SurfaceKind.Wood, name: 'Cabin',
      doors: ['n'], lootTier: LootTier.Normal, lootCount: 3,
      roofColor: 0x4f4132, roofShade: 0x3c3126,
    });
    this.scatterLootPoints(200, 1750, 1000, 1050, 9, LootTier.Sparse);
  }

  private buildOpenField(): void {
    this.areas.push({ name: 'Dry Flats', x: 1900, y: 2480, radius: 560 });
    const rng = this.rng;
    this.terrain.push({
      kind: TerrainKind.Sand,
      x: 1950,
      y: 2500,
      w: 900,
      h: 620,
      rotation: rng.range(-0.2, 0.2),
      shape: 'ellipse',
      alpha: 0.55,
    });
    this.createBuilding({
      x: 1760, y: 2320, w: 330, h: 250, floor: SurfaceKind.Wood, name: 'Barn',
      doors: ['n', 's'], lootTier: LootTier.Normal, lootCount: 5, rooms: 1,
      roofColor: 0x8a4b3a, roofShade: 0x6b3a2d,
    });
    for (let i = 0; i < 26; i++) {
      const x = rng.range(1350, 2700);
      const y = rng.range(2180, 2860);
      this.tryPlace(() => this.makeProp(x, y, rng.weighted([
        { value: ObstacleKind.Rock, weight: 5 },
        { value: ObstacleKind.Bush, weight: 5 },
        { value: ObstacleKind.Tree, weight: 2 },
        { value: ObstacleKind.Crate, weight: 1 },
      ])));
    }
    this.addFenceLine(1360, 2200, 1360, 2700);
    this.scatterLootPoints(1400, 2200, 1200, 620, 7, LootTier.Sparse);
  }

  private buildOutskirts(): void {
    this.areas.push({ name: 'Northgate', x: 470, y: 420, radius: 400 });
    this.areas.push({ name: 'Eastwatch', x: 2560, y: 560, radius: 400 });

    this.createBuilding({
      x: 320, y: 300, w: 250, h: 200, floor: SurfaceKind.Wood, name: 'Farmhouse',
      doors: ['s', 'e'], lootTier: LootTier.Normal, lootCount: 4, rooms: 1,
      roofColor: 0x71543d, roofShade: 0x584130,
    });
    this.createBuilding({
      x: 640, y: 560, w: 190, h: 160, floor: SurfaceKind.Wood, name: 'Silo Shed',
      doors: ['n'], lootTier: LootTier.Sparse, lootCount: 2,
      roofColor: 0x71543d, roofShade: 0x584130,
    });
    this.createBuilding({
      x: 2400, y: 330, w: 300, h: 220, floor: SurfaceKind.Concrete, name: 'Watch Station',
      doors: ['w', 's'], lootTier: LootTier.Rich, lootCount: 5, rooms: 1,
      roofColor: 0x55606b, roofShade: 0x424c56,
    });
    this.createBuilding({
      x: 2620, y: 700, w: 210, h: 170, floor: SurfaceKind.Concrete, name: 'Radio Hut',
      doors: ['w'], lootTier: LootTier.Normal, lootCount: 3,
      roofColor: 0x55606b, roofShade: 0x424c56,
    });
    this.createBuilding({
      x: 300, y: 2620, w: 210, h: 170, floor: SurfaceKind.Wood, name: 'Outpost',
      doors: ['n'], lootTier: LootTier.Normal, lootCount: 3,
      roofColor: 0x4f4132, roofShade: 0x3c3126,
    });
    this.createBuilding({
      x: 2560, y: 2560, w: 240, h: 190, floor: SurfaceKind.Concrete, name: 'Pump House',
      doors: ['w'], lootTier: LootTier.Normal, lootCount: 3,
      roofColor: 0x55606b, roofShade: 0x424c56,
    });

    this.scatterLootPoints(260, 260, 620, 560, 6, LootTier.Normal);
    this.scatterLootPoints(2320, 260, 620, 700, 6, LootTier.Normal);
    this.scatterLootPoints(2300, 2400, 620, 480, 5, LootTier.Sparse);
    this.scatterLootPoints(240, 2450, 520, 420, 4, LootTier.Sparse);
  }

  /** Fills the leftover space so no quadrant of the map is empty. */
  private scatterWorldClutter(): void {
    const rng = this.rng;
    for (let i = 0; i < 240; i++) {
      const x = rng.range(WORLD.margin + 40, WORLD.width - WORLD.margin - 40);
      const y = rng.range(WORLD.margin + 40, WORLD.height - WORLD.margin - 40);
      this.tryPlace(() => {
        const kind = rng.weighted([
          { value: ObstacleKind.Tree, weight: 8 },
          { value: ObstacleKind.Bush, weight: 7 },
          { value: ObstacleKind.Rock, weight: 5 },
          { value: ObstacleKind.Crate, weight: 2 },
          { value: ObstacleKind.Barrel, weight: 1 },
        ]);
        return this.makeProp(x, y, kind);
      });
    }
    this.scatterLootPoints(WORLD.margin, WORLD.margin, WORLD.width - WORLD.margin * 2, WORLD.height - WORLD.margin * 2, 22, LootTier.Sparse);
  }

  private scatterDecals(): void {
    const rng = this.rng;
    for (let i = 0; i < 620; i++) {
      const x = rng.range(20, WORLD.width - 20);
      const y = rng.range(20, WORLD.height - 20);
      if (this.insideAnyBuilding(x, y, 6)) continue;
      const isTuft = rng.bool(0.72);
      this.decals.push({
        tex: isTuft ? Tex.GrassTuft : Tex.Pebble,
        x,
        y,
        rotation: rng.range(0, Math.PI * 2),
        scale: rng.range(0.6, 1.25),
        alpha: isTuft ? rng.range(0.35, 0.7) : rng.range(0.25, 0.5),
        tint: isTuft
          ? rng.pick([0x63a15a, 0x4f8c4a, 0x7ab070])
          : rng.pick([0x9a9384, 0x8a8375, 0xb0a897]),
      });
    }
  }

  // ---------------------------------------------------------------- builders

  private createBuilding(spec: BuildingSpec): Building {
    const rng = this.rng;
    const b = new Building({
      x: spec.x,
      y: spec.y,
      w: spec.w,
      h: spec.h,
      floor: spec.floor,
      name: spec.name,
      roofColor: spec.roofColor,
      roofShadeColor: spec.roofShade,
      wallColor: spec.wallColor,
    });

    const gapsN: Array<{ start: number; end: number }> = [];
    const gapsS: Array<{ start: number; end: number }> = [];
    const gapsW: Array<{ start: number; end: number }> = [];
    const gapsE: Array<{ start: number; end: number }> = [];

    for (const side of spec.doors) {
      if (side === 'n' || side === 's') {
        const cx = spec.x + rng.range(spec.w * 0.28, spec.w * 0.72);
        const gap = { start: cx - DOOR_W / 2, end: cx + DOOR_W / 2 };
        const doorY = side === 'n' ? spec.y + WALL_T / 2 : spec.y + spec.h - WALL_T / 2;
        (side === 'n' ? gapsN : gapsS).push(gap);
        b.doors.push({ side, x: cx, y: doorY, width: DOOR_W });
        this.doorGuards.push({ x: cx, y: side === 'n' ? doorY - 46 : doorY + 46 });
      } else {
        const cy = spec.y + rng.range(spec.h * 0.28, spec.h * 0.72);
        const gap = { start: cy - DOOR_W / 2, end: cy + DOOR_W / 2 };
        const doorX = side === 'w' ? spec.x + WALL_T / 2 : spec.x + spec.w - WALL_T / 2;
        (side === 'w' ? gapsW : gapsE).push(gap);
        b.doors.push({ side, x: doorX, y: cy, width: DOOR_W });
        this.doorGuards.push({ x: side === 'w' ? doorX - 46 : doorX + 46, y: cy });
      }
    }

    b.addWallWithGaps('h', spec.y, spec.x, spec.x + spec.w, WALL_T, gapsN);
    b.addWallWithGaps('h', spec.y + spec.h - WALL_T, spec.x, spec.x + spec.w, WALL_T, gapsS);
    b.addWallWithGaps('v', spec.x, spec.y, spec.y + spec.h, WALL_T, gapsW);
    b.addWallWithGaps('v', spec.x + spec.w - WALL_T, spec.y, spec.y + spec.h, WALL_T, gapsE);

    this.addDoors(b);
    this.addInteriorWalls(b, spec, rng);
    this.addFurniture(b, spec, rng);
    this.addBuildingLoot(b, spec, rng);

    this.buildings.push(b);
    return b;
  }

  /**
   * Boards up every entrance except the first, so a building always has one clear way
   * in while the rest are breachable wooden doors worth a shotgun shell.
   */
  private addDoors(b: Building): void {
    b.doors.forEach((door, index) => {
      if (index === 0) return;
      const horizontal = door.side === 'n' || door.side === 's';
      const obj = new CoverObject({
        kind: ObstacleKind.Door,
        x: door.x,
        y: door.y,
        shape: 'rect',
        w: horizontal ? door.width - 4 : 14,
        h: horizontal ? 14 : door.width - 4,
        blocksMovement: true,
        blocksBullets: true,
        tall: false,
        destructible: true,
        hitPoints: COVER_HP.door,
        thin: true,
      });
      this.addObstacle(obj);
      b.furniture.push(obj);
    });
  }

  private addInteriorWalls(b: Building, spec: BuildingSpec, rng: Rng): void {
    const rooms = spec.rooms ?? 0;
    if (rooms <= 0) return;
    const vertical = spec.w >= spec.h;
    for (let i = 0; i < rooms; i++) {
      const t = (i + 1) / (rooms + 1);
      if (vertical) {
        const wx = spec.x + spec.w * t - WALL_T / 2;
        const gapCy = spec.y + rng.range(spec.h * 0.25, spec.h * 0.75);
        b.addWallWithGaps('v', wx, spec.y + WALL_T, spec.y + spec.h - WALL_T, WALL_T, [
          { start: gapCy - DOOR_W / 2, end: gapCy + DOOR_W / 2 },
        ]);
      } else {
        const wy = spec.y + spec.h * t - WALL_T / 2;
        const gapCx = spec.x + rng.range(spec.w * 0.25, spec.w * 0.75);
        b.addWallWithGaps('h', wy, spec.x + WALL_T, spec.x + spec.w - WALL_T, WALL_T, [
          { start: gapCx - DOOR_W / 2, end: gapCx + DOOR_W / 2 },
        ]);
      }
    }
  }

  private addFurniture(b: Building, spec: BuildingSpec, rng: Rng): void {
    const count = Math.round((spec.w * spec.h) / 16000);
    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const x = rng.range(spec.x + WALL_T + 34, spec.x + spec.w - WALL_T - 34);
        const y = rng.range(spec.y + WALL_T + 34, spec.y + spec.h - WALL_T - 34);
        if (this.overlapsWalls(b, x, y, 30)) continue;
        if (this.nearDoor(x, y, 62)) continue;
        if (this.overlapsObstacle(x, y, 30)) continue;
        const kind = rng.weighted([
          { value: ObstacleKind.Table, weight: 4 },
          { value: ObstacleKind.Shelf, weight: 4 },
          { value: ObstacleKind.Locker, weight: 3 },
          { value: ObstacleKind.Crate, weight: 4 },
        ]);
        const obj = this.makeProp(x, y, kind, rng.bool());
        this.addObstacle(obj);
        b.furniture.push(obj);
        break;
      }
    }
  }

  private addBuildingLoot(b: Building, spec: BuildingSpec, rng: Rng): void {
    for (let i = 0; i < spec.lootCount; i++) {
      for (let attempt = 0; attempt < 14; attempt++) {
        const x = rng.range(spec.x + WALL_T + 26, spec.x + spec.w - WALL_T - 26);
        const y = rng.range(spec.y + WALL_T + 26, spec.y + spec.h - WALL_T - 26);
        if (this.overlapsWalls(b, x, y, 22)) continue;
        if (this.overlapsObstacle(x, y, 24)) continue;
        this.addLootPoint({ x, y, tier: spec.lootTier, buildingId: b.id });
        break;
      }
    }
  }

  private scatterLootPoints(
    x: number,
    y: number,
    w: number,
    h: number,
    count: number,
    tier: LootTier,
  ): void {
    const rng = this.rng;
    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < 16; attempt++) {
        const px = rng.range(x, x + w);
        const py = rng.range(y, y + h);
        if (this.insideAnyBuilding(px, py, 24)) continue;
        if (this.overlapsObstacle(px, py, 26)) continue;
        this.addLootPoint({ x: px, y: py, tier });
        break;
      }
    }
  }

  private addFenceLine(x1: number, y1: number, x2: number, y2: number): void {
    const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
    const length = horizontal ? x2 - x1 : y2 - y1;
    const segment = 96;
    const steps = Math.max(1, Math.floor(Math.abs(length) / segment));
    for (let i = 0; i < steps; i++) {
      // Occasional gaps keep fences from being impassable walls.
      if (this.rng.bool(0.14)) continue;
      const t = (i + 0.5) / steps;
      const px = horizontal ? x1 + length * t : x1;
      const py = horizontal ? y1 : y1 + length * t;
      if (this.insideAnyBuilding(px, py, 20) || this.nearDoor(px, py, 70)) continue;
      this.addObstacle(
        new CoverObject({
          kind: ObstacleKind.Fence,
          x: px,
          y: py,
          shape: 'rect',
          w: horizontal ? segment - 6 : 10,
          h: horizontal ? 10 : segment - 6,
          blocksMovement: true,
          blocksBullets: false,
          tall: false,
          variant: this.rng.int(0, 2),
          destructible: true,
          hitPoints: COVER_HP.fence,
          thin: true,
        }),
      );
    }
  }

  // ---------------------------------------------------------------- props

  private makeTree(x: number, y: number, scale: number): CoverObject {
    return new CoverObject({
      kind: ObstacleKind.Tree,
      x,
      y,
      shape: 'circle',
      radius: 15 * scale,
      blocksMovement: true,
      blocksBullets: true,
      tall: true,
      scale,
      variant: this.rng.int(0, 2),
    });
  }

  private makeSandbag(x: number, y: number, horizontal: boolean): CoverObject {
    return new CoverObject({
      kind: ObstacleKind.Sandbag,
      x,
      y,
      shape: 'rect',
      w: horizontal ? 84 : 30,
      h: horizontal ? 30 : 84,
      blocksMovement: true,
      blocksBullets: true,
      tall: false,
      variant: this.rng.int(0, 2),
    });
  }

  private makeProp(x: number, y: number, kind: ObstacleKind, rotated = false): CoverObject {
    const rng = this.rng;
    switch (kind) {
      case ObstacleKind.Tree:
        return this.makeTree(x, y, rng.range(0.8, 1.3));
      case ObstacleKind.Bush:
        return new CoverObject({
          kind,
          x,
          y,
          shape: 'circle',
          radius: rng.range(24, 34),
          blocksMovement: false,
          blocksBullets: false,
          tall: true,
          concealment: 0.55,
          scale: rng.range(0.85, 1.25),
          variant: rng.int(0, 2),
        });
      case ObstacleKind.Rock:
        return new CoverObject({
          kind,
          x,
          y,
          shape: 'circle',
          radius: rng.range(20, 32),
          tall: false,
          scale: rng.range(0.9, 1.3),
          variant: rng.int(0, 2),
        });
      case ObstacleKind.Barrel:
        return new CoverObject({
          kind,
          x,
          y,
          shape: 'circle',
          radius: 18,
          tall: false,
          variant: rng.int(0, 2),
        });
      case ObstacleKind.Sandbag:
        return this.makeSandbag(x, y, rng.bool());
      case ObstacleKind.Table:
        return new CoverObject({
          kind,
          x,
          y,
          shape: 'rect',
          w: rotated ? 52 : 82,
          h: rotated ? 82 : 52,
          blocksBullets: false,
          tall: false,
          variant: rng.int(0, 1),
        });
      case ObstacleKind.Shelf:
        return new CoverObject({
          kind,
          x,
          y,
          shape: 'rect',
          w: rotated ? 30 : 96,
          h: rotated ? 96 : 30,
          tall: false,
          variant: rng.int(0, 1),
        });
      case ObstacleKind.Locker:
        return new CoverObject({
          kind,
          x,
          y,
          shape: 'rect',
          w: rotated ? 60 : 44,
          h: rotated ? 44 : 60,
          tall: false,
          variant: rng.int(0, 1),
        });
      case ObstacleKind.Barricade:
        return new CoverObject({
          kind,
          x,
          y,
          shape: 'rect',
          w: rotated ? 18 : 104,
          h: rotated ? 104 : 18,
          tall: false,
          variant: rng.int(0, 1),
          destructible: true,
          hitPoints: COVER_HP.barricade,
          thin: true,
        });
      case ObstacleKind.Crate:
      default:
        return new CoverObject({
          kind: ObstacleKind.Crate,
          x,
          y,
          shape: 'rect',
          w: 50,
          h: 50,
          tall: false,
          scale: rng.range(0.9, 1.15),
          variant: rng.int(0, 2),
          destructible: true,
          hitPoints: COVER_HP.crate,
        });
    }
  }

  // ---------------------------------------------------------------- placement helpers

  private static cellKey(x: number, y: number): number {
    return Math.floor(y / PLACE_CELL) * 4096 + Math.floor(x / PLACE_CELL);
  }

  /** All obstacles go through here so the placement grid never drifts out of sync. */
  private addObstacle(obj: CoverObject): void {
    this.obstacles.push(obj);
    const pad = obj.extent;
    const minX = Math.floor((obj.x - pad) / PLACE_CELL);
    const maxX = Math.floor((obj.x + pad) / PLACE_CELL);
    const minY = Math.floor((obj.y - pad) / PLACE_CELL);
    const maxY = Math.floor((obj.y + pad) / PLACE_CELL);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const key = cy * 4096 + cx;
        const bucket = this.placementGrid.get(key);
        if (bucket) bucket.push(obj);
        else this.placementGrid.set(key, [obj]);
      }
    }
  }

  private addLootPoint(point: LootPoint): void {
    this.lootPoints.push(point);
    const key = MapGenerator.cellKey(point.x, point.y);
    const bucket = this.lootGrid.get(key);
    if (bucket) bucket.push(point);
    else this.lootGrid.set(key, [point]);
  }

  private tryPlace(factory: () => CoverObject): void {
    const obj = factory();
    const pad = obj.extent + 8;
    if (obj.x < WORLD.margin + pad || obj.x > WORLD.width - WORLD.margin - pad) return;
    if (obj.y < WORLD.margin + pad || obj.y > WORLD.height - WORLD.margin - pad) return;
    if (this.insideAnyBuilding(obj.x, obj.y, obj.extent + 26)) return;
    if (this.nearDoor(obj.x, obj.y, obj.extent + 56)) return;
    if (this.overlapsObstacle(obj.x, obj.y, obj.extent + 10)) return;
    if (this.overlapsLootPoint(obj.x, obj.y, obj.extent + 24)) return;
    this.addObstacle(obj);
  }

  private insideAnyBuilding(x: number, y: number, padding: number): boolean {
    for (const b of this.buildings) {
      if (pointInRect(x, y, expandRect(b.bounds, padding))) return true;
    }
    return false;
  }

  private nearDoor(x: number, y: number, radius: number): boolean {
    const rSq = radius * radius;
    for (const d of this.doorGuards) {
      if (distanceSq(x, y, d.x, d.y) < rSq) return true;
    }
    return false;
  }

  private overlapsObstacle(x: number, y: number, radius: number): boolean {
    const minX = Math.floor((x - radius) / PLACE_CELL);
    const maxX = Math.floor((x + radius) / PLACE_CELL);
    const minY = Math.floor((y - radius) / PLACE_CELL);
    const maxY = Math.floor((y + radius) / PLACE_CELL);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const bucket = this.placementGrid.get(cy * 4096 + cx);
        if (!bucket) continue;
        for (const o of bucket) {
          if (o.shape === 'circle') {
            const r = o.radius + radius;
            if (distanceSq(x, y, o.x, o.y) < r * r) return true;
          } else if (circleRectOverlap({ x, y, r: radius }, o.bounds)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private overlapsLootPoint(x: number, y: number, radius: number): boolean {
    const rSq = radius * radius;
    const minX = Math.floor((x - radius) / PLACE_CELL);
    const maxX = Math.floor((x + radius) / PLACE_CELL);
    const minY = Math.floor((y - radius) / PLACE_CELL);
    const maxY = Math.floor((y + radius) / PLACE_CELL);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const bucket = this.lootGrid.get(cy * 4096 + cx);
        if (!bucket) continue;
        for (const p of bucket) {
          if (distanceSq(x, y, p.x, p.y) < rSq) return true;
        }
      }
    }
    return false;
  }

  private overlapsWalls(b: Building, x: number, y: number, radius: number): boolean {
    for (const w of b.walls) {
      if (circleRectOverlap({ x, y, r: radius }, w)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- nav + spawns

  private buildNavGrid(): NavGrid {
    const grid = new NavGrid(WORLD.width, WORLD.height, NAV_CELL);
    grid.blockBorder(Math.ceil(WORLD.margin / NAV_CELL));
    for (const b of this.buildings) {
      for (const wall of b.walls) grid.blockRect(wall as Rect, NAV_INFLATE);
    }
    for (const o of this.obstacles) {
      if (!o.blocksMovement) continue;
      if (o.shape === 'circle') grid.blockCircle(o.x, o.y, o.radius, NAV_INFLATE);
      else grid.blockRect(o.bounds, NAV_INFLATE);
    }
    return grid;
  }

  /**
   * Spawn points are laid out on a jittered grid rather than sampled at random.
   * Sixteen random points in a 3000x3000 map inevitably clump - nearest neighbours land
   * ~350 units apart - and every match then opens with a chain of point-blank fights.
   * A grid guarantees even coverage and roughly 450-650 units between drops.
   */
  private buildSpawnPoints(grid: NavGrid): Vec2[] {
    const rng = this.rng;
    const inset = 210;
    const cols = 4;
    const rows = 4;
    const usableW = WORLD.width - inset * 2;
    const usableH = WORLD.height - inset * 2;
    const cellW = usableW / cols;
    const cellH = usableH / rows;
    const jitter = Math.min(cellW, cellH) * 0.17;

    const points: Vec2[] = [];
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const centerX = inset + cellW * (cx + 0.5);
        const centerY = inset + cellH * (cy + 0.5);
        const point = this.findSpawnNear(grid, centerX, centerY, jitter, rng);
        if (point) points.push(point);
      }
    }

    // Spare drops for safety, spread between the grid cells.
    for (let i = 0; i < 8; i++) {
      const centerX = inset + rng.range(0, usableW);
      const centerY = inset + rng.range(0, usableH);
      const point = this.findSpawnNear(grid, centerX, centerY, 90, rng);
      if (!point) continue;
      let tooClose = false;
      for (const p of points) {
        if (distanceSq(p.x, p.y, point.x, point.y) < 430 * 430) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) points.push(point);
    }

    while (points.length < MATCH.totalCombatants) {
      points.push({ x: WORLD.width / 2, y: WORLD.height / 2 });
    }
    return points;
  }

  /** Walkable, outdoor point within `spread` of a target position. */
  private findSpawnNear(
    grid: NavGrid,
    x: number,
    y: number,
    spread: number,
    rng: Rng,
  ): Vec2 | null {
    for (let attempt = 0; attempt < 60; attempt++) {
      // Widen the search slowly so a blocked cell centre still finds open ground.
      const radius = spread * (1 + attempt / 12);
      const candidate = rng.pointInCircle(x, y, radius);
      if (candidate.x < WORLD.margin + 60 || candidate.x > WORLD.width - WORLD.margin - 60) continue;
      if (candidate.y < WORLD.margin + 60 || candidate.y > WORLD.height - WORLD.margin - 60) continue;
      if (!grid.isWalkable(candidate.x, candidate.y)) continue;
      if (this.insideAnyBuilding(candidate.x, candidate.y, 40)) continue;
      return candidate;
    }
    return null;
  }

  /** Drops loot points that ended up inside geometry after everything was placed. */
  private pruneLootPoints(grid: NavGrid): void {
    const kept: LootPoint[] = [];
    for (const p of this.lootPoints) {
      if (!grid.isWalkable(p.x, p.y)) {
        const near = grid.nearestWalkable(p.x, p.y, 3);
        if (!near) continue;
        kept.push({ ...p, x: near.x, y: near.y });
      } else {
        kept.push(p);
      }
    }
    this.lootPoints.length = 0;
    this.lootPoints.push(...kept);
  }
}
