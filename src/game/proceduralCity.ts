import {
  BoostPad,
  BuildingLot,
  BuildingTheme,
  CanalBoat,
  CityArchetype,
  CoffeeKiosk,
  CourtyardWallSegment,
  DeliveryStop,
  DuckCrossing,
  GeneratedCity,
  GreenWavePickup,
  GridCoord,
  HazardKind,
  HazardPhase,
  JumpRamp,
  LevelConfig,
  MechanicGarage,
  ParcelKind,
  PersonAppearance,
  RIGHT_LANE_OFFSET,
  RivalCourier,
  ShiftAtmosphere,
  SidewalkPedestrian,
  SignalAxisState,
  SkyBalloon,
  StreetProp,
  TILE_SIZE,
  TileType,
  TrafficHazard,
  TrafficSignal,
  TreeProp,
  VIPRole,
  WorldPos,
} from './types';

export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function mulberry32() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DISTRICT_THEMES: { name: string; archetype: CityArchetype }[] = [
  { name: 'Winding Canal Harbor', archetype: CityArchetype.WindingCanalHarbor },
  { name: 'Twin-River Archipelago', archetype: CityArchetype.TwinRiverArchipelago },
  { name: 'Old Town Moat & Spires', archetype: CityArchetype.DowntownMoatRing },
  { name: 'Serpentine Port District', archetype: CityArchetype.SerpentinePortMaze },
  { name: 'Sakura Quay & Bridges', archetype: CityArchetype.TwinRiverArchipelago },
  { name: 'Grand Citadel Canals', archetype: CityArchetype.DowntownMoatRing },
  { name: 'Harborfront Labyrinth', archetype: CityArchetype.SerpentinePortMaze },
  { name: 'Metropolis Island Rush', archetype: CityArchetype.SerpentinePortMaze },
];

const SKIN_TONES = [0xf7d5bc, 0xebbc9a, 0xd19870, 0x9b6443, 0xfbe0ce];
const HAIR_COLORS = [0x2c221e, 0x593a27, 0x8c5230, 0xd49b4b, 0x3b3f4c, 0xa84a32];
const TOP_COLORS = [0x4ea8de, 0xf4845f, 0x52b788, 0xf7b267, 0x9b89f5, 0xf2709c, 0x3d5a80];
const BOTTOM_COLORS = [0x354f6b, 0x4a5568, 0x6c584c, 0x2b3a4a, 0x5c677d, 0xd8c3a5];
const HAIR_STYLES: PersonAppearance['hairStyle'][] = [
  'short',
  'ponytail',
  'bun',
  'curly',
  'cap',
  'sunhat',
];

const CUSTOMER_PROFILES: {
  name: string;
  parcel: string;
  kind: ParcelKind;
  vip: VIPRole;
  hat: number;
  shirt: number;
}[] = [
  { name: 'Maya', parcel: 'Matcha Pocket Tin', kind: ParcelKind.Small, vip: 'none', hat: 0xf4845f, shirt: 0x4ea8de },
  { name: 'Chef Peppe', parcel: 'Piping-Hot Brick Pizza', kind: ParcelKind.HotExpress, vip: 'chef', hat: 0xffffff, shirt: 0xe63946 },
  { name: 'Leo', parcel: 'Heavy Vinyl Turntable Crate', kind: ParcelKind.Large, vip: 'none', hat: 0x52b788, shirt: 0xf7b267 },
  { name: 'Mayor Tock', parcel: 'Clocktower Brass Seal', kind: ParcelKind.Fragile, vip: 'mayor', hat: 0xffbe0b, shirt: 0x3d5a80 },
  { name: 'Capt. Marina', parcel: 'Harbor Brass Compass', kind: ParcelKind.Small, vip: 'captain', hat: 0x1d3557, shirt: 0x4ea8de },
  { name: 'Chloe', parcel: 'Artisan Espresso Machine Crate', kind: ParcelKind.Large, vip: 'none', hat: 0x9b89f5, shirt: 0xf7d060 },
  { name: 'Hana', parcel: 'Glass Botanical Terrarium', kind: ParcelKind.Fragile, vip: 'none', hat: 0xf2709c, shirt: 0x52b788 },
  { name: 'Mateo', parcel: 'Sizzling Ramen Bento', kind: ParcelKind.HotExpress, vip: 'none', hat: 0xff6b35, shirt: 0x2ec4b6 },
  { name: 'Yuki', parcel: 'Tiered Wedding Cake Box', kind: ParcelKind.Fragile, vip: 'none', hat: 0xe56b8f, shirt: 0x8ecae6 },
];

const BRICK_PALETTE = [0xf8c94e, 0xdc7e44, 0x5ba85d, 0xf5dc93];
const VEHICLE_PALETTE = [0xf48c46, 0xf9c74f, 0x56b4e9, 0xf2789f, 0x68c478, 0x8e9aaf];

function makeAppearance(rng: () => number, overrideTop?: number, overrideAccent?: number): PersonAppearance {
  return {
    skinColor: SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)],
    hairColor: HAIR_COLORS[Math.floor(rng() * HAIR_COLORS.length)],
    hairStyle: HAIR_STYLES[Math.floor(rng() * HAIR_STYLES.length)],
    topColor: overrideTop ?? TOP_COLORS[Math.floor(rng() * TOP_COLORS.length)],
    bottomColor: BOTTOM_COLORS[Math.floor(rng() * BOTTOM_COLORS.length)],
    accentColor: overrideAccent ?? TOP_COLORS[Math.floor(rng() * TOP_COLORS.length)],
    hasBag: rng() < 0.45,
  };
}

export function getLevelConfig(level: number): LevelConfig {
  const safeLevel = Math.max(1, Math.floor(level));
  const themeEntry = DISTRICT_THEMES[(safeLevel - 1) % DISTRICT_THEMES.length];
  const gridSize = safeLevel === 1 ? 15 : safeLevel <= 3 ? 17 : 19;
  const finalStops = Math.min(9, 3 + safeLevel);
  const baseTime = 78 + finalStops * 9 - Math.min(22, (safeLevel - 1) * 3);
  const timeLimitSec = Math.max(60, baseTime);

  const atmosCycle: ShiftAtmosphere[] = [
    ShiftAtmosphere.SunnyHarbor,
    ShiftAtmosphere.GoldenSunset,
    ShiftAtmosphere.TwilightNeon,
  ];
  const atmosphere = atmosCycle[(safeLevel - 1) % atmosCycle.length];
  const hasSunshower = safeLevel >= 4 && safeLevel % 2 === 0;

  return {
    level: safeLevel,
    districtName: themeEntry.name,
    archetype: themeEntry.archetype,
    atmosphere,
    hasSunshower,
    gridSize,
    stopCount: finalStops,
    timeLimitSec,
    cruiserCount: Math.min(10, 5 + safeLevel),
    scooterCount: safeLevel >= 2 ? Math.min(5, Math.floor((safeLevel + 1) / 2)) : 1,
    bridgeGateCount: safeLevel >= 2 ? Math.min(3, Math.floor(safeLevel / 2)) : 0,
    boostPadCount: Math.min(6, 3 + Math.floor(safeLevel / 2)),
    signalCount: Math.min(8, 4 + safeLevel),
  };
}

export const PEDESTRIAN_RADIUS = 0.22;

export function isDrivableTile(tile: TileType): boolean {
  return (
    tile === TileType.InnerRoad ||
    tile === TileType.OuterRoad ||
    tile === TileType.Bridge
  );
}

export function isWalkablePedestrianTile(tile: TileType | undefined): boolean {
  return (
    tile === TileType.Grass ||
    tile === TileType.Plaza ||
    tile === TileType.OuterMeadow
  );
}

export function getTreeObstacleRadius(tree: TreeProp): number {
  if (tree.variant === 'bush') return 0.34 * tree.scale;
  if (tree.variant === 'cypress') return 0.34 * tree.scale;
  return 0.5 * tree.scale;
}

export function getStreetPropObstacleRadius(prop: StreetProp): number {
  switch (prop.kind) {
    case 'fountain':
      return 0.8;
    case 'cafe_umbrella':
      return 0.6;
    case 'bench':
      return 0.4;
    case 'flower_planter':
      return 0.3;
    case 'streetlamp':
    case 'mailbox':
    case 'hydrant':
      return 0.22;
  }
}

export function isPedestrianPointClear(
  x: number,
  z: number,
  tiles: TileType[][],
  totalGridSize: number,
  trees: TreeProp[],
  streetProps: StreetProp[],
  stops: DeliveryStop[],
  brickWalls: CourtyardWallSegment[],
  extraPad: number = 0.04,
  kiosks: CoffeeKiosk[] = [],
  garages: MechanicGarage[] = [],
): boolean {
  const margin = PEDESTRIAN_RADIUS + extraPad;
  const cornerChecks = [
    [-margin, -margin],
    [margin, -margin],
    [-margin, margin],
    [margin, margin],
  ];
  for (const [ox, oz] of cornerChecks) {
    const gc = worldToGrid(x + ox, z + oz, totalGridSize);
    if (!isWalkablePedestrianTile(tiles[gc.row]?.[gc.col])) {
      return false;
    }
  }

  for (const t of trees) {
    const minDist = getTreeObstacleRadius(t) + margin;
    const dx = x - t.x;
    const dz = z - t.z;
    if (dx * dx + dz * dz < minDist * minDist) return false;
  }

  for (const sp of streetProps) {
    const minDist = getStreetPropObstacleRadius(sp) + margin;
    const dx = x - sp.x;
    const dz = z - sp.z;
    if (dx * dx + dz * dz < minDist * minDist) return false;
  }

  for (const k of kiosks) {
    const dx = x - k.kioskX;
    const dz = z - k.kioskZ;
    if (dx * dx + dz * dz < 0.82 * 0.82) return false;
  }

  for (const g of garages) {
    const dx = x - g.garageX;
    const dz = z - g.garageZ;
    if (dx * dx + dz * dz < 0.86 * 0.86) return false;
  }

  for (const stop of stops) {
    const cw = gridToWorld(stop.citizenCoord, totalGridSize);
    const dx = x - cw.x;
    const dz = z - cw.z;
    if (dx * dx + dz * dz < 0.72 * 0.72) return false;
  }

  for (const bw of brickWalls) {
    const dx = x - bw.x;
    const dz = z - bw.z;
    if (Math.abs(dx) > 1.35 || Math.abs(dz) > 1.35) continue;
    const cosY = Math.cos(bw.yaw);
    const sinY = Math.sin(bw.yaw);
    const localAlong = dx * cosY - dz * sinY;
    const localPerp = dx * sinY + dz * cosY;
    if (Math.abs(localAlong) < 1.05 + margin && Math.abs(localPerp) < 0.2 + margin) {
      return false;
    }
  }

  return true;
}

export function gridToWorld(coord: GridCoord, totalGridSize: number): WorldPos {
  const half = (totalGridSize - 1) * 0.5;
  return {
    x: (coord.col - half) * TILE_SIZE,
    z: (coord.row - half) * TILE_SIZE,
  };
}

export function worldToGrid(x: number, z: number, totalGridSize: number): GridCoord {
  const half = (totalGridSize - 1) * 0.5;
  const col = Math.round(x / TILE_SIZE + half);
  const row = Math.round(z / TILE_SIZE + half);
  return {
    col: Math.max(0, Math.min(totalGridSize - 1, col)),
    row: Math.max(0, Math.min(totalGridSize - 1, row)),
  };
}

export function findRoadPath(
  tiles: TileType[][],
  start: GridCoord,
  goal: GridCoord,
): GridCoord[] {
  const rows = tiles.length;
  const cols = tiles[0]?.length ?? 0;
  if (
    start.row < 0 ||
    start.row >= rows ||
    start.col < 0 ||
    start.col >= cols ||
    goal.row < 0 ||
    goal.row >= rows ||
    goal.col < 0 ||
    goal.col >= cols
  ) {
    return [];
  }
  if (start.col === goal.col && start.row === goal.row) {
    return [start];
  }

  const visited = new Uint8Array(rows * cols);
  const parent = new Int32Array(rows * cols).fill(-1);
  const queue: number[] = [];

  const startIdx = start.row * cols + start.col;
  const goalIdx = goal.row * cols + goal.col;
  visited[startIdx] = 1;
  queue.push(startIdx);

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    if (curr === goalIdx) break;
    const cRow = Math.floor(curr / cols);
    const cCol = curr % cols;

    for (let d = 0; d < 4; d++) {
      const nCol = cCol + dirs[d][0];
      const nRow = cRow + dirs[d][1];
      if (nCol < 0 || nCol >= cols || nRow < 0 || nRow >= rows) continue;
      const nIdx = nRow * cols + nCol;
      if (visited[nIdx]) continue;
      if (!isDrivableTile(tiles[nRow][nCol]) && nIdx !== goalIdx) continue;
      visited[nIdx] = 1;
      parent[nIdx] = curr;
      queue.push(nIdx);
    }
  }

  if (!visited[goalIdx]) return [];

  const path: GridCoord[] = [];
  let trace = goalIdx;
  while (trace !== -1) {
    path.push({ col: trace % cols, row: Math.floor(trace / cols) });
    trace = parent[trace];
  }
  path.reverse();
  return path;
}

/**
 * Forward-only Google Maps route pathfinder:
 * Forbids stepping 180° backward out of `start` along `-currentYaw` whenever any
 * forward, left, or right continuation exists — so route arrows NEVER tell the
 * courier van to reverse or drive backward!
 */
export function findForwardRoadPath(
  tiles: TileType[][],
  start: GridCoord,
  currentYaw: number,
  goal: GridCoord,
): GridCoord[] {
  const rows = tiles.length;
  const cols = tiles[0]?.length ?? 0;
  if (
    start.row < 0 ||
    start.row >= rows ||
    start.col < 0 ||
    start.col >= cols ||
    goal.row < 0 ||
    goal.row >= rows ||
    goal.col < 0 ||
    goal.col >= cols
  ) {
    return [];
  }
  if (start.col === goal.col && start.row === goal.row) {
    return [start];
  }

  const backCol = start.col - Math.round(Math.sin(currentYaw));
  const backRow = start.row - Math.round(Math.cos(currentYaw));

  const visited = new Uint8Array(rows * cols);
  const parent = new Int32Array(rows * cols).fill(-1);
  const queue: number[] = [];

  const startIdx = start.row * cols + start.col;
  const goalIdx = goal.row * cols + goal.col;
  visited[startIdx] = 1;
  queue.push(startIdx);

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    if (curr === goalIdx) break;
    const cRow = Math.floor(curr / cols);
    const cCol = curr % cols;

    for (let d = 0; d < 4; d++) {
      const nCol = cCol + dirs[d][0];
      const nRow = cRow + dirs[d][1];
      if (nCol < 0 || nCol >= cols || nRow < 0 || nRow >= rows) continue;
      // Never route 180-degrees backward out of the van's current tile!
      if (curr === startIdx && nCol === backCol && nRow === backRow) {
        continue;
      }
      const nIdx = nRow * cols + nCol;
      if (visited[nIdx]) continue;
      if (!isDrivableTile(tiles[nRow][nCol]) && nIdx !== goalIdx) continue;
      visited[nIdx] = 1;
      parent[nIdx] = curr;
      queue.push(nIdx);
    }
  }

  if (!visited[goalIdx]) {
    return findRoadPath(tiles, start, goal);
  }

  const path: GridCoord[] = [];
  let trace = goalIdx;
  while (trace !== -1) {
    path.push({ col: trace % cols, row: Math.floor(trace / cols) });
    trace = parent[trace];
  }
  path.reverse();
  return path;
}

function carveRoadLine(
  tiles: TileType[][],
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  roadType: TileType.InnerRoad | TileType.OuterRoad,
) {
  let r = r1;
  let c = c1;
  while (true) {
    tiles[r][c] = tiles[r][c] === TileType.Water ? TileType.Bridge : roadType;
    if (r === r2 && c === c2) break;
    if (r !== r2) r += Math.sign(r2 - r);
    else if (c !== c2) c += Math.sign(c2 - c);
  }
}

export function generateProceduralCity(
  level: number,
  customSeed?: number,
): GeneratedCity {
  const config = getLevelConfig(level);
  const seed = customSeed ?? (level * 9173 + 214747);
  const rng = createRng(seed);

  const margin = 3;
  const G = config.gridSize; // 15, 17, or 19
  const totalGridSize = G + margin * 2;
  const minP = margin;
  const maxP = margin + G - 1;
  const mid = margin + Math.floor(G / 2);

  // Base terrain: scenic lush northern/western hillside banks + cerulean harbor bay on south/east flanks!
  const tiles: TileType[][] = Array.from({ length: totalGridSize }, (_, r) =>
    Array.from({ length: totalGridSize }, (__, c) => {
      if (r < margin && c >= margin - 2) return TileType.OuterMeadow;
      if (c < margin && r <= mid + 1) return TileType.OuterMeadow;
      return TileType.Water;
    }),
  );

  // Fill playable landmass with lush Grass first
  for (let r = minP; r <= maxP; r++) {
    for (let c = minP; c <= maxP; c++) {
      tiles[r][c] = TileType.Grass;
    }
  }

  // Carve Archetype-Specific Complex Canals, Harbor Bays & Multi-Island Street Networks!
  if (config.archetype === CityArchetype.WindingCanalHarbor) {
    // Scenic stepped S-curve canal + southeast harbor cove!
    for (let r = maxP - 3; r <= maxP; r++) {
      for (let c = maxP - 3; c <= maxP; c++) {
        tiles[r][c] = TileType.Water;
      }
    }
    // Winding river stepping across the city
    const bendR1 = minP + 4;
    const bendR2 = maxP - 5;
    const canalC1 = mid - 2;
    const canalC2 = mid + 2;
    for (let r = 0; r <= bendR1; r++) tiles[r][canalC1] = TileType.Water;
    for (let c = canalC1; c <= canalC2; c++) tiles[bendR1][c] = TileType.Water;
    for (let r = bendR1; r <= bendR2; r++) tiles[r][canalC2] = TileType.Water;
    for (let c = 0; c <= canalC2; c++) tiles[bendR2][c] = TileType.Water;

    // Asymmetric coastal & boulevard network (not a uniform box!)
    carveRoadLine(tiles, minP, minP, minP, maxP, TileType.OuterRoad);
    carveRoadLine(tiles, minP, minP, maxP, minP, TileType.OuterRoad);
    carveRoadLine(tiles, maxP, minP, maxP, maxP - 4, TileType.OuterRoad);
    carveRoadLine(tiles, maxP - 4, maxP - 4, maxP, maxP - 4, TileType.OuterRoad);
    carveRoadLine(tiles, maxP - 4, maxP - 4, maxP - 4, maxP, TileType.OuterRoad);
    carveRoadLine(tiles, minP, maxP, maxP - 4, maxP, TileType.OuterRoad);

    // Winding interior avenues & dogleg T-junctions
    carveRoadLine(tiles, minP + 2, minP, minP + 2, maxP - 2, TileType.InnerRoad);
    carveRoadLine(tiles, mid, minP, mid, maxP, TileType.InnerRoad);
    carveRoadLine(tiles, maxP - 2, minP, maxP - 2, maxP - 4, TileType.InnerRoad);

    carveRoadLine(tiles, minP, minP + 3, maxP, minP + 3, TileType.InnerRoad);
    carveRoadLine(tiles, minP, mid, bendR2 - 1, mid, TileType.InnerRoad);
    carveRoadLine(tiles, mid, mid - 1, maxP, mid - 1, TileType.InnerRoad);
    carveRoadLine(tiles, minP, maxP - 3, maxP - 4, maxP - 3, TileType.InnerRoad);
  } else if (config.archetype === CityArchetype.TwinRiverArchipelago) {
    // Branching Y/Twin canals carving 5 irregular islands
    const rCanalA = minP + 4;
    const rCanalB = maxP - 4;
    const cCanalA = mid - 2;
    const cCanalB = mid + 3;

    for (let c = 0; c < totalGridSize; c++) {
      tiles[rCanalA][c] = c < mid + 2 ? TileType.Water : tiles[rCanalA][c];
      tiles[rCanalB][c] = c > minP + 3 ? TileType.Water : tiles[rCanalB][c];
    }
    for (let r = 0; r < totalGridSize; r++) {
      if (r <= rCanalB) tiles[r][cCanalA] = TileType.Water;
      if (r >= rCanalA) tiles[r][cCanalB] = TileType.Water;
    }
    // Southwest harbor inlet
    for (let r = maxP - 2; r <= maxP; r++) {
      for (let c = minP; c <= minP + 2; c++) {
        tiles[r][c] = TileType.Water;
      }
    }

    // Perimeter & island-hopping roads
    carveRoadLine(tiles, minP, minP, minP, maxP, TileType.OuterRoad);
    carveRoadLine(tiles, minP, maxP, maxP, maxP, TileType.OuterRoad);
    carveRoadLine(tiles, minP, minP, maxP - 3, minP, TileType.OuterRoad);
    carveRoadLine(tiles, maxP - 3, minP, maxP - 3, minP + 3, TileType.OuterRoad);
    carveRoadLine(tiles, maxP - 3, minP + 3, maxP, minP + 3, TileType.OuterRoad);
    carveRoadLine(tiles, maxP, minP + 3, maxP, maxP, TileType.OuterRoad);

    // Offset staggered avenues across the 5 islands
    carveRoadLine(tiles, minP + 2, minP, minP + 2, maxP, TileType.InnerRoad);
    carveRoadLine(tiles, mid, minP, mid, maxP, TileType.InnerRoad);
    carveRoadLine(tiles, mid + 3, minP + 3, mid + 3, maxP, TileType.InnerRoad);

    carveRoadLine(tiles, minP, minP + 3, maxP, minP + 3, TileType.InnerRoad);
    carveRoadLine(tiles, minP, mid, maxP, mid, TileType.InnerRoad);
    carveRoadLine(tiles, minP + 2, mid + 5, maxP, mid + 5, TileType.InnerRoad);
  } else if (config.archetype === CityArchetype.DowntownMoatRing) {
    // Central Citadel Island surrounded by a rectangular Water Moat!
    const moatMinR = mid - 3;
    const moatMaxR = mid + 3;
    const moatMinC = mid - 3;
    const moatMaxC = mid + 3;

    for (let i = moatMinC; i <= moatMaxC; i++) {
      tiles[moatMinR][i] = TileType.Water;
      tiles[moatMaxR][i] = TileType.Water;
    }
    for (let i = moatMinR; i <= moatMaxR; i++) {
      tiles[i][moatMinC] = TileType.Water;
      tiles[i][moatMaxC] = TileType.Water;
    }
    // Feeder canal to outer sea
    for (let c = moatMaxC; c < totalGridSize; c++) {
      tiles[mid + 1][c] = TileType.Water;
    }

    // Outer Grand Boulevard + Radial Drawbridges into Citadel Island!
    carveRoadLine(tiles, minP, minP, minP, maxP, TileType.OuterRoad);
    carveRoadLine(tiles, maxP, minP, maxP, maxP, TileType.OuterRoad);
    carveRoadLine(tiles, minP, minP, maxP, minP, TileType.OuterRoad);
    carveRoadLine(tiles, minP, maxP, maxP, maxP, TileType.OuterRoad);

    // 4 Radial Avenues + Inner Citadel Ring + Neighborhood Side Streets
    carveRoadLine(tiles, mid, minP, mid, maxP, TileType.InnerRoad);
    carveRoadLine(tiles, minP, mid, maxP, mid, TileType.InnerRoad);
    carveRoadLine(tiles, moatMinR + 1, moatMinC + 1, moatMinR + 1, moatMaxC - 1, TileType.InnerRoad);
    carveRoadLine(tiles, moatMaxR - 1, moatMinC + 1, moatMaxR - 1, moatMaxC - 1, TileType.InnerRoad);
    carveRoadLine(tiles, minP + 2, minP, minP + 2, maxP, TileType.InnerRoad);
    carveRoadLine(tiles, maxP - 2, minP, maxP - 2, maxP, TileType.InnerRoad);
    carveRoadLine(tiles, minP, minP + 2, maxP, minP + 2, TileType.InnerRoad);
    carveRoadLine(tiles, minP, maxP - 2, maxP, maxP - 2, TileType.InnerRoad);
  } else {
    // SerpentinePortMaze: Grand dual-canal port with staggered dogleg streets!
    const c1 = minP + 5;
    const c2 = maxP - 5;
    for (let r = 0; r < totalGridSize; r++) {
      if (r <= maxP - 3) tiles[r][c1] = TileType.Water;
      if (r >= minP + 3) tiles[r][c2] = TileType.Water;
    }
    for (let c = c1; c <= c2; c++) {
      tiles[mid][c] = TileType.Water;
    }

    carveRoadLine(tiles, minP, minP, minP, maxP, TileType.OuterRoad);
    carveRoadLine(tiles, maxP, minP, maxP, maxP, TileType.OuterRoad);
    carveRoadLine(tiles, minP, minP, maxP, minP, TileType.OuterRoad);
    carveRoadLine(tiles, minP, maxP, maxP, maxP, TileType.OuterRoad);

    for (let r = minP + 2; r <= maxP - 2; r += 3) {
      if (r === mid) continue;
      carveRoadLine(tiles, r, minP, r, maxP, TileType.InnerRoad);
    }
    for (let c = minP + 2; c <= maxP - 2; c += 3) {
      if (c === c1 || c === c2) continue;
      carveRoadLine(tiles, minP, c, maxP, c, TileType.InnerRoad);
    }
  }

  // Procedurally prune 2-4 redundant bridge/road segments to make each run's route genuinely twisty & tactical (while guaranteeing 100% connectivity!)
  const prunableBridges: GridCoord[] = [];
  for (let r = minP + 1; r <= maxP - 1; r++) {
    for (let c = minP + 1; c <= maxP - 1; c++) {
      if (tiles[r][c] === TileType.Bridge) {
        prunableBridges.push({ col: c, row: r });
      }
    }
  }
  const pruneTarget = Math.min(3, Math.floor(prunableBridges.length / 3));
  let pruned = 0;
  for (let attempt = 0; attempt < prunableBridges.length && pruned < pruneTarget; attempt++) {
    const idx = Math.floor(rng() * prunableBridges.length);
    const cand = prunableBridges[idx];
    if (tiles[cand.row][cand.col] !== TileType.Bridge) continue;
    tiles[cand.row][cand.col] = TileType.Water;
    if (areAllRoadsConnected(tiles)) {
      pruned++;
    } else {
      tiles[cand.row][cand.col] = TileType.Bridge;
    }
  }

  // Cleanup any isolated double-wide bridge artifacts next to water so bridges always span cleanly
  for (let r = minP; r <= maxP; r++) {
    for (let c = minP; c <= maxP; c++) {
      if (tiles[r][c] === TileType.Bridge) {
        const hasRoadNeighbor =
          isDrivableTile(tiles[r - 1]?.[c]) ||
          isDrivableTile(tiles[r + 1]?.[c]) ||
          isDrivableTile(tiles[r]?.[c - 1]) ||
          isDrivableTile(tiles[r]?.[c + 1]);
        if (!hasRoadNeighbor) {
          tiles[r][c] = TileType.Water;
        }
      }
    }
  }

  // Choose scenic, open Spawn Point in the heart of the city facing East (+X)
  let spawnCoord: GridCoord = { col: mid - 1, row: mid };
  let foundSpawn = false;
  for (let r = mid + 2; r >= mid - 2; r--) {
    for (let c = mid - 3; c <= mid + 1; c++) {
      if (
        tiles[r]?.[c] === TileType.InnerRoad &&
        isDrivableTile(tiles[r]?.[c + 1]) &&
        isDrivableTile(tiles[r]?.[c + 2])
      ) {
        spawnCoord = { col: c, row: r };
        foundSpawn = true;
        break;
      }
    }
    if (foundSpawn) break;
  }
  if (!foundSpawn) {
    for (let r = maxP - 1; r >= minP + 1; r--) {
      for (let c = minP + 1; c <= maxP - 2; c++) {
        if (isDrivableTile(tiles[r][c]) && isDrivableTile(tiles[r][c + 1])) {
          spawnCoord = { col: c, row: r };
          foundSpawn = true;
          break;
        }
      }
      if (foundSpawn) break;
    }
  }
  const spawnYaw = Math.PI / 2;

  // Select well-distributed Delivery Stops across the islands
  interface StopCandidate {
    citizenCoord: GridCoord;
    roadCoord: GridCoord;
  }
  const stopCandidates: StopCandidate[] = [];
  const cardinalDirs = [
    { dc: 1, dr: 0 },
    { dc: -1, dr: 0 },
    { dc: 0, dr: 1 },
    { dc: 0, dr: -1 },
  ];

  for (let r = minP + 1; r <= maxP - 1; r++) {
    for (let c = minP + 1; c <= maxP - 1; c++) {
      if (tiles[r][c] !== TileType.Grass) continue;
      for (const d of cardinalDirs) {
        const rc = c + d.dc;
        const rr = r + d.dr;
        const adj = tiles[rr]?.[rc];
        if (adj === TileType.InnerRoad || adj === TileType.OuterRoad) {
          const distSpawn =
            Math.abs(rc - spawnCoord.col) + Math.abs(rr - spawnCoord.row);
          if (distSpawn >= 4) {
            stopCandidates.push({
              citizenCoord: { col: c, row: r },
              roadCoord: { col: rc, row: rr },
            });
            break;
          }
        }
      }
    }
  }

  for (let i = stopCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = stopCandidates[i];
    stopCandidates[i] = stopCandidates[j];
    stopCandidates[j] = tmp;
  }

  const chosenRaw: StopCandidate[] = [];
  for (const cand of stopCandidates) {
    if (chosenRaw.length >= config.stopCount) break;
    const tooClose = chosenRaw.some(
      (prev) =>
        Math.abs(prev.roadCoord.col - cand.roadCoord.col) +
          Math.abs(prev.roadCoord.row - cand.roadCoord.row) <
        4,
    );
    if (tooClose) continue;
    if (findRoadPath(tiles, spawnCoord, cand.roadCoord).length >= 2) {
      chosenRaw.push(cand);
    }
  }
  if (chosenRaw.length < config.stopCount) {
    for (const cand of stopCandidates) {
      if (chosenRaw.length >= config.stopCount) break;
      const dup = chosenRaw.some(
        (p) =>
          p.citizenCoord.col === cand.citizenCoord.col &&
          p.citizenCoord.row === cand.citizenCoord.row,
      );
      if (!dup && findRoadPath(tiles, spawnCoord, cand.roadCoord).length >= 2) {
        chosenRaw.push(cand);
      }
    }
  }

  // Order stops to zigzag across bridges & neighborhoods!
  const orderedRaw: StopCandidate[] = [];
  const remaining = [...chosenRaw];
  let cursor = spawnCoord;
  while (remaining.length > 0) {
    remaining.sort((a, b) => {
      const da = findRoadPath(tiles, cursor, a.roadCoord).length;
      const db = findRoadPath(tiles, cursor, b.roadCoord).length;
      return da - db;
    });
    const pickIdx = remaining.length >= 3 && rng() > 0.45 ? 1 : 0;
    const next = remaining.splice(pickIdx, 1)[0];
    orderedRaw.push(next);
    cursor = next.roadCoord;
  }

  const stops: DeliveryStop[] = orderedRaw.map((item, idx) => {
    const profile = CUSTOMER_PROFILES[(idx + (level - 1) * 2) % CUSTOMER_PROFILES.length];
    tiles[item.citizenCoord.row][item.citizenCoord.col] = TileType.Courtyard;
    const cw = gridToWorld(item.citizenCoord, totalGridSize);
    const rw = gridToWorld(item.roadCoord, totalGridSize);
    const toRoadYaw = Math.atan2(rw.x - cw.x, rw.z - cw.z);
    const latX = Math.cos(toRoadYaw) * 0.26;
    const latZ = -Math.sin(toRoadYaw) * 0.26;
    const isMoving = idx % 3 === 1;
    return {
      index: idx + 1,
      id: `stop-${level}-${idx + 1}`,
      customerName: profile.name,
      parcelLabel: profile.parcel,
      parcelKind: profile.kind,
      vipRole: profile.vip,
      isBoomerangTrigger: idx === 1 && orderedRaw.length >= 4,
      isMovingCustomer: isMoving,
      patrolStart: isMoving ? { x: cw.x - latX, z: cw.z - latZ } : undefined,
      patrolEnd: isMoving ? { x: cw.x + latX, z: cw.z + latZ } : undefined,
      liveCitizenX: cw.x,
      liveCitizenZ: cw.z,
      hatColor: profile.hat,
      shirtColor: profile.shirt,
      appearance: makeAppearance(rng, profile.shirt, profile.hat),
      roadCoord: item.roadCoord,
      citizenCoord: item.citizenCoord,
      delivered: false,
      deliveredViaToss: false,
    };
  });

  // Populate EVERY block with Rich Architecture AND Distributed Real-City Boulevard Trees!
  const buildings: BuildingLot[] = [];
  const brickWalls: CourtyardWallSegment[] = [];
  const trees: TreeProp[] = [];
  const streetProps: StreetProp[] = [];
  const coffeeKiosks: CoffeeKiosk[] = [];
  const mechanicGarages: MechanicGarage[] = [];
  const pedestrians: SidewalkPedestrian[] = [];

  const roofFeatures: BuildingLot['roofFeature'][] = [
    'water_tower',
    'skylight',
    'ac_units',
    'garden',
    'pin',
  ];
  const treeVariants: TreeProp['variant'][] = [
    'oak',
    'pine',
    'sakura',
    'cypress',
    'autumn',
  ];

  // Plant welcoming yard trees on Courtyard (delivery stop) tiles away from the road front!
  for (const stop of stops) {
    const cw = gridToWorld(stop.citizenCoord, totalGridSize);
    const rw = gridToWorld(stop.roadCoord, totalGridSize);
    const backDx = Math.sign(cw.x - rw.x) || 0.72;
    const backDz = Math.sign(cw.z - rw.z) || -0.72;
    const tv = treeVariants[(stop.index * 3 + level) % treeVariants.length];
    trees.push({
      x: cw.x + (backDx !== 0 ? backDx * 0.78 : 0.76),
      z: cw.z + (backDz !== 0 ? backDz * 0.78 : -0.76),
      variant: tv,
      scale: 0.84 + rng() * 0.18,
      tintHex: getTreeHex(tv, rng),
    });
  }

  for (let r = minP; r <= maxP; r++) {
    for (let c = minP; c <= maxP; c++) {
      if (tiles[r][c] !== TileType.Grass) continue;

      let facingYaw = 0;
      let roadAdj = false;
      if (isDrivableTile(tiles[r + 1]?.[c])) {
        facingYaw = 0;
        roadAdj = true;
      } else if (isDrivableTile(tiles[r - 1]?.[c])) {
        facingYaw = Math.PI;
        roadAdj = true;
      } else if (isDrivableTile(tiles[r]?.[c + 1])) {
        facingYaw = Math.PI / 2;
        roadAdj = true;
      } else if (isDrivableTile(tiles[r]?.[c - 1])) {
        facingYaw = -Math.PI / 2;
        roadAdj = true;
      }

      const blocksSpawnView =
        Math.abs(r - spawnCoord.row) <= 1 &&
        c >= spawnCoord.col - 2 &&
        c <= spawnCoord.col;

      const wp = gridToWorld({ col: c, row: r }, totalGridSize);
      const roll = rng();

      if (!blocksSpawnView && roll < 0.62) {
        // Architectural Building Lot + Real-City Sidewalk Boulevard Street Trees on EVERY Block!
        tiles[r][c] = TileType.Building;
        const maxThemeIdx = roadAdj ? 7 : 8;
        const theme = Math.floor(rng() * maxThemeIdx) as BuildingTheme;
        const distCenter = Math.hypot(r - mid, c - mid);
        const isHighRise =
          theme === BuildingTheme.PeriwinkleTower ||
          theme === BuildingTheme.PinkPinTower ||
          theme === BuildingTheme.ClockTowerHall ||
          distCenter < 3.5;
        const floors = roadAdj
          ? isHighRise && rng() < 0.52
            ? 3
            : 2
          : isHighRise
            ? 3 + Math.floor(rng() * 2)
            : 2 + Math.floor(rng() * 2);
        const roofFeat =
          theme === BuildingTheme.ClockTowerHall
            ? 'clock'
            : theme === BuildingTheme.PinkPinTower
              ? 'pin'
              : roofFeatures[Math.floor(rng() * roofFeatures.length)];

        buildings.push({
          coord: { col: c, row: r },
          theme,
          floors,
          facingYaw,
          hasAwning:
            theme === BuildingTheme.ApricotArchShop ||
            theme === BuildingTheme.SkyBlueCafe ||
            theme === BuildingTheme.TerracottaBakery ||
            rng() < 0.5,
          hasBalconies: floors >= 3 && rng() < 0.65,
          roofFeature: roofFeat,
        });

        // Plant 1-2 real sidewalk boulevard trees along the building's lawn setback (outside building footprint, inside curb!)
        const fx = Math.sin(facingYaw);
        const fz = Math.cos(facingYaw);
        const rx = Math.cos(facingYaw);
        const rz = -Math.sin(facingYaw);

        if (rng() < 0.88) {
          const sideSign = (r + c) % 2 === 0 ? 1 : -1;
          const vA = treeVariants[(r * 7 + c * 5) % treeVariants.length];
          trees.push({
            x: wp.x + fx * 0.96 + rx * (0.94 * sideSign),
            z: wp.z + fz * 0.96 + rz * (0.94 * sideSign),
            variant: vA,
            scale: 0.74 + rng() * 0.22,
            tintHex: getTreeHex(vA, rng),
          });
        }
        if (rng() < 0.52) {
          const vB = treeVariants[(r * 3 + c * 11 + 2) % treeVariants.length];
          trees.push({
            x: wp.x - fx * 0.94 - rx * 0.92,
            z: wp.z - fz * 0.94 - rz * 0.92,
            variant: vB,
            scale: 0.72 + rng() * 0.24,
            tintHex: getTreeHex(vB, rng),
          });
        }

        // Add corner sidewalk mailbox or flower planter opposite the street tree
        if (roadAdj && rng() < 0.5) {
          const propSide = (r + c) % 2 === 0 ? -1 : 1;
          streetProps.push({
            kind: rng() < 0.5 ? 'mailbox' : 'flower_planter',
            x: wp.x + fx * 0.98 + rx * (0.86 * propSide),
            z: wp.z + fz * 0.98 + rz * (0.86 * propSide),
            yaw: facingYaw,
            accentHex: rng() < 0.5 ? 0x3b82f6 : 0xef4444,
          });
        }
      } else if (
        roadAdj &&
        coffeeKiosks.length < 3 &&
        Math.abs(r - spawnCoord.row) + Math.abs(c - spawnCoord.col) >= 4 &&
        rng() < 0.28
      ) {
        // Fun Interactive City Perk: Roadside Drive-Thru Espresso Boost Kiosk!
        tiles[r][c] = TileType.Plaza;
        const fx = Math.sin(facingYaw);
        const fz = Math.cos(facingYaw);
        const roadCoord: GridCoord = {
          col: c + Math.round(fx),
          row: r + Math.round(fz),
        };
        const rw = gridToWorld(roadCoord, totalGridSize);
        coffeeKiosks.push({
          id: `kiosk-${coffeeKiosks.length + 1}`,
          kioskX: wp.x + fx * 0.25,
          kioskZ: wp.z + fz * 0.25,
          roadX: rw.x,
          roadZ: rw.z,
          yaw: facingYaw,
          cooldown: 0,
        });
        // Shade tree behind the espresso kiosk!
        const kv = treeVariants[(r + c) % treeVariants.length];
        trees.push({
          x: wp.x - fx * 0.68 + 0.45,
          z: wp.z - fz * 0.68 - 0.35,
          variant: kv,
          scale: 0.86,
          tintHex: getTreeHex(kv, rng),
        });
      } else if (
        roadAdj &&
        mechanicGarages.length < 2 &&
        Math.abs(r - spawnCoord.row) + Math.abs(c - spawnCoord.col) >= 4 &&
        rng() < 0.32
      ) {
        // Roadside Wrench Mechanic Pit-Stop Garage (Repairs +1 Hull & Bumper Shield!)
        tiles[r][c] = TileType.Plaza;
        const fx = Math.sin(facingYaw);
        const fz = Math.cos(facingYaw);
        const roadCoord: GridCoord = {
          col: c + Math.round(fx),
          row: r + Math.round(fz),
        };
        const rw = gridToWorld(roadCoord, totalGridSize);
        mechanicGarages.push({
          id: `garage-${mechanicGarages.length + 1}`,
          garageX: wp.x + fx * 0.22,
          garageZ: wp.z + fz * 0.22,
          roadX: rw.x,
          roadZ: rw.z,
          yaw: facingYaw,
          cooldown: 0,
        });
        const gv = treeVariants[(r * 3 + c) % treeVariants.length];
        trees.push({
          x: wp.x - fx * 0.7 - 0.42,
          z: wp.z - fz * 0.7 - 0.36,
          variant: gv,
          scale: 0.84,
          tintHex: getTreeHex(gv, rng),
        });
      } else if (roll < 0.85) {
        // Furnished Town Plaza / Cafe Patio / Fountain Square with natural corner shade trees!
        tiles[r][c] = TileType.Plaza;
        const subRoll = rng();
        if (subRoll < 0.36) {
          streetProps.push({
            kind: 'fountain',
            x: wp.x,
            z: wp.z,
            yaw: 0,
            accentHex: 0x5cc8f8,
          });
          const fTree = treeVariants[(r * 5 + c) % treeVariants.length];
          trees.push({
            x: wp.x - 0.82,
            z: wp.z - 0.82,
            variant: fTree,
            scale: 0.82,
            tintHex: getTreeHex(fTree, rng),
          });
          trees.push({
            x: wp.x + 0.82,
            z: wp.z - 0.8,
            variant: 'bush',
            scale: 0.85,
            tintHex: 0x6ec25a,
          });
        } else {
          streetProps.push({
            kind: 'cafe_umbrella',
            x: wp.x - 0.46,
            z: wp.z - 0.46,
            yaw: rng() * Math.PI,
            accentHex: rng() < 0.5 ? 0xf2709c : 0xff9f1c,
          });
          streetProps.push({
            kind: 'bench',
            x: wp.x - 0.42,
            z: wp.z + 0.14,
            yaw: facingYaw,
            accentHex: 0xc6824b,
          });
          const cTree = treeVariants[(r + c * 3) % treeVariants.length];
          trees.push({
            x: wp.x + 0.62,
            z: wp.z - 0.54,
            variant: cTree,
            scale: 0.88 + rng() * 0.16,
            tintHex: getTreeHex(cTree, rng),
          });
        }
      } else {
        // Pocket Neighborhood Green (varied 1-2 trees + flowering shrub, leaving promenade open!)
        const v1 = treeVariants[Math.floor(rng() * treeVariants.length)];
        trees.push({
          x: wp.x - 0.52 + (rng() - 0.5) * 0.22,
          z: wp.z - 0.5 + (rng() - 0.5) * 0.2,
          variant: v1,
          scale: 0.9 + rng() * 0.24,
          tintHex: getTreeHex(v1, rng),
        });
        if (rng() < 0.65) {
          const v2 = treeVariants[Math.floor(rng() * treeVariants.length)];
          trees.push({
            x: wp.x + 0.54 + (rng() - 0.5) * 0.2,
            z: wp.z - 0.48 + (rng() - 0.5) * 0.2,
            variant: v2,
            scale: 0.76 + rng() * 0.2,
            tintHex: getTreeHex(v2, rng),
          });
        } else {
          trees.push({
            x: wp.x + 0.52,
            z: wp.z - 0.52,
            variant: 'bush',
            scale: 0.84,
            tintHex: 0x6ec958,
          });
        }
      }
    }
  }

  // Guarantee at least 1 Wrench Mechanic Pit-Stop Garage if random roll missed
  if (mechanicGarages.length === 0) {
    for (let r = minP + 1; r <= maxP - 1 && mechanicGarages.length === 0; r++) {
      for (let c = minP + 1; c <= maxP - 1 && mechanicGarages.length === 0; c++) {
        if (tiles[r][c] !== TileType.Grass) continue;
        if (Math.abs(r - spawnCoord.row) + Math.abs(c - spawnCoord.col) < 4) continue;
        let gyaw: number | null = null;
        if (isDrivableTile(tiles[r + 1]?.[c])) gyaw = 0;
        else if (isDrivableTile(tiles[r - 1]?.[c])) gyaw = Math.PI;
        else if (isDrivableTile(tiles[r]?.[c + 1])) gyaw = Math.PI / 2;
        else if (isDrivableTile(tiles[r]?.[c - 1])) gyaw = -Math.PI / 2;
        if (gyaw === null) continue;
        tiles[r][c] = TileType.Plaza;
        const wp = gridToWorld({ col: c, row: r }, totalGridSize);
        const fx = Math.sin(gyaw);
        const fz = Math.cos(gyaw);
        const rw = gridToWorld(
          { col: c + Math.round(fx), row: r + Math.round(fz) },
          totalGridSize,
        );
        mechanicGarages.push({
          id: 'garage-1',
          garageX: wp.x + fx * 0.22,
          garageZ: wp.z + fz * 0.22,
          roadX: rw.x,
          roadZ: rw.z,
          yaw: gyaw,
          cooldown: 0,
        });
      }
    }
  }

  // Add Streetlamps & Fire Hydrants tucked neatly at outer curb corners
  for (let r = minP; r <= maxP; r++) {
    for (let c = minP; c <= maxP; c++) {
      const t = tiles[r][c];
      if (t !== TileType.Grass && t !== TileType.Plaza && t !== TileType.Courtyard) continue;
      const wp = gridToWorld({ col: c, row: r }, totalGridSize);

      if ((r + c) % 2 === 0 && isDrivableTile(tiles[r + 1]?.[c])) {
        streetProps.push({
          kind: 'streetlamp',
          x: wp.x - 1.02,
          z: wp.z + 1.04,
          yaw: 0,
          accentHex: 0xffe699,
        });
      } else if ((r + c) % 3 === 0 && isDrivableTile(tiles[r]?.[c + 1])) {
        streetProps.push({
          kind: 'hydrant',
          x: wp.x + 1.04,
          z: wp.z - 1.0,
          yaw: 0,
          accentHex: 0xe63946,
        });
      }
    }
  }

  // Courtyard & Waterfront Multi-Brick Walls (placed BEFORE pedestrian promenade verification!)
  for (let r = minP; r <= maxP; r++) {
    for (let c = minP; c <= maxP; c++) {
      const t = tiles[r][c];
      if (t !== TileType.Grass && t !== TileType.Courtyard && t !== TileType.Plaza) continue;
      const wp = gridToWorld({ col: c, row: r }, totalGridSize);
      const edgeOffset = TILE_SIZE * 0.44;
      const checkEdges = [
        { dr: -1, dc: 0, ox: 0, oz: -edgeOffset, yaw: 0 },
        { dr: 1, dc: 0, ox: 0, oz: edgeOffset, yaw: 0 },
        { dr: 0, dc: -1, ox: -edgeOffset, oz: 0, yaw: Math.PI / 2 },
        { dr: 0, dc: 1, ox: edgeOffset, oz: 0, yaw: Math.PI / 2 },
      ];
      for (const e of checkEdges) {
        const nt = tiles[r + e.dr]?.[c + e.dc];
        const isStopFront = stops.some(
          (s) =>
            s.citizenCoord.col === c &&
            s.citizenCoord.row === r &&
            s.roadCoord.col === c + e.dc &&
            s.roadCoord.row === r + e.dr,
        );
        if (isStopFront) continue;
        if (nt === TileType.Water || (t === TileType.Courtyard && isDrivableTile(nt) && rng() < 0.5)) {
          brickWalls.push({
            x: wp.x + e.ox,
            z: wp.z + e.oz,
            yaw: e.yaw,
            colorHex: BRICK_PALETTE[(r * 7 + c * 3) % BRICK_PALETTE.length],
          });
        }
      }
    }
  }

  // Verify segment helper: checks every 0.14 world units so pedestrians NEVER touch a tree, prop, or wall!
  const isSegmentClear = (a: WorldPos, b: WorldPos): boolean => {
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    if (dist < 0.8) return false;
    const steps = Math.max(4, Math.ceil(dist / 0.14));
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const sx = a.x + (b.x - a.x) * u;
      const sz = a.z + (b.z - a.z) * u;
      if (
        !isPedestrianPointClear(
          sx,
          sz,
          tiles,
          totalGridSize,
          trees,
          streetProps,
          stops,
          brickWalls,
          0.03,
          coffeeKiosks,
          mechanicGarages,
        )
      ) {
        return false;
      }
    }
    return true;
  };

  // Spawn Obstacle-Verified Strolling Pedestrians along clear park promenades & plazas!
  for (let r = minP; r <= maxP && pedestrians.length < 22; r++) {
    for (let c = minP; c <= maxP && pedestrians.length < 22; c++) {
      const t = tiles[r][c];
      if (t !== TileType.Grass && t !== TileType.Plaza) continue;
      const wp = gridToWorld({ col: c, row: r }, totalGridSize);

      // Avoid stacking multiple pedestrians in the same spot
      if (pedestrians.some((p) => Math.hypot(p.x - wp.x, p.z - wp.z) < 1.9)) {
        continue;
      }

      const candidateRoutes: WorldPos[][] = [];

      // 1. Multi-tile East-West sunny sidewalk promenade
      const rightTile = tiles[r]?.[c + 1];
      if (rightTile === TileType.Grass || rightTile === TileType.Plaza) {
        const wp2 = gridToWorld({ col: c + 1, row: r }, totalGridSize);
        const rightTile2 = tiles[r]?.[c + 2];
        const wpEnd =
          rightTile2 === TileType.Grass || rightTile2 === TileType.Plaza
            ? gridToWorld({ col: c + 2, row: r }, totalGridSize)
            : wp2;
        for (const zOff of [0.54, 0.36, 0.24]) {
          candidateRoutes.push([
            { x: wp.x - 0.52, z: wp.z + zOff },
            { x: wpEnd.x + 0.52, z: wpEnd.z + zOff },
          ]);
        }
      }

      // 2. Multi-tile North-South promenade
      const downTile = tiles[r + 1]?.[c];
      if (downTile === TileType.Grass || downTile === TileType.Plaza) {
        const wp2 = gridToWorld({ col: c, row: r + 1 }, totalGridSize);
        for (const xOff of [0.56, -0.56, 0.38]) {
          candidateRoutes.push([
            { x: wp.x + xOff, z: wp.z - 0.48 },
            { x: wp2.x + xOff, z: wp2.z + 0.48 },
          ]);
        }
      }

      // 3. Single-tile clear East-West or North-South sidewalk stroll
      for (const zOff of [0.56, 0.42, 0.28]) {
        candidateRoutes.push([
          { x: wp.x - 0.54, z: wp.z + zOff },
          { x: wp.x + 0.54, z: wp.z + zOff },
        ]);
      }
      for (const xOff of [0.58, -0.58, 0.34]) {
        candidateRoutes.push([
          { x: wp.x + xOff, z: wp.z - 0.5 },
          { x: wp.x + xOff, z: wp.z + 0.5 },
        ]);
      }

      let chosenWaypoints: WorldPos[] | null = null;
      for (const route of candidateRoutes) {
        let allClear = true;
        for (let seg = 0; seg < route.length - 1; seg++) {
          if (!isSegmentClear(route[seg], route[seg + 1])) {
            allClear = false;
            break;
          }
        }
        if (allClear) {
          chosenWaypoints = route;
          break;
        }
      }

      if (chosenWaypoints && (pedestrians.length < 10 || rng() < 0.82)) {
        const startPt = chosenWaypoints[0];
        const nextPt = chosenWaypoints[1];
        const initU = 0.2 + rng() * 0.6;
        const px = startPt.x + (nextPt.x - startPt.x) * initU;
        const pz = startPt.z + (nextPt.z - startPt.z) * initU;
        const yaw = Math.atan2(nextPt.x - startPt.x, nextPt.z - startPt.z);

        pedestrians.push({
          id: `ped-${pedestrians.length + 1}`,
          x: px,
          z: pz,
          vx: 0,
          vz: 0,
          yaw,
          walkSpeed: 1.15 + rng() * 0.55,
          strideDistance: rng() * 6,
          waypoints: chosenWaypoints,
          waypointIndex: rng() < 0.5 ? 1 : 0,
          pauseTimer: rng() * 0.6,
          waveTimer: 0,
          appearance: makeAppearance(rng),
        });
      }
    }
  }

  // Outer Meadow Skyline Towers & Dense Woodland Groves
  for (let r = 0; r < totalGridSize; r++) {
    for (let c = 0; c < totalGridSize; c++) {
      if (tiles[r][c] !== TileType.OuterMeadow) continue;
      const wp = gridToWorld({ col: c, row: r }, totalGridSize);
      if (r <= margin - 2 && c >= mid - 2 && c <= maxP + 1 && rng() < 0.58) {
        tiles[r][c] = TileType.Building;
        const landmarkThemes = [
          BuildingTheme.PeriwinkleTower,
          BuildingTheme.PinkPinTower,
          BuildingTheme.ClockTowerHall,
          BuildingTheme.MintMansardApartments,
        ];
        buildings.push({
          coord: { col: c, row: r },
          theme: landmarkThemes[(c + r) % landmarkThemes.length],
          floors: 3 + ((c + r) % 3),
          facingYaw: 0,
          hasAwning: false,
          hasBalconies: true,
          roofFeature: (c + r) % 2 === 0 ? 'water_tower' : 'pin',
        });
      } else {
        const v = treeVariants[(r * 5 + c * 3) % treeVariants.length];
        trees.push({
          x: wp.x - 0.35 + (rng() - 0.5) * 0.35,
          z: wp.z - 0.25 + (rng() - 0.5) * 0.35,
          variant: v,
          scale: 0.95 + rng() * 0.38,
          tintHex: getTreeHex(v, rng),
        });
        if (rng() < 0.65) {
          const vB = treeVariants[(r * 3 + c * 7 + 1) % treeVariants.length];
          trees.push({
            x: wp.x + 0.45 + (rng() - 0.5) * 0.3,
            z: wp.z + 0.42 + (rng() - 0.5) * 0.3,
            variant: vB,
            scale: 0.8 + rng() * 0.28,
            tintHex: getTreeHex(vB, rng),
          });
        }
      }
    }
  }

  // Scenic Canal Boats & Sailboats cruising along open water channels!
  const canalBoats: CanalBoat[] = [];
  const boatColors = [0xf4845f, 0x4ea8de, 0xf9c74f, 0x52b788, 0xf2709c];
  for (let r = 1; r < totalGridSize - 1 && canalBoats.length < 7; r++) {
    for (let c = 1; c < totalGridSize - 2 && canalBoats.length < 7; c++) {
      if (
        tiles[r][c] === TileType.Water &&
        tiles[r][c + 1] === TileType.Water &&
        tiles[r][c + 2] === TileType.Water &&
        rng() < 0.14
      ) {
        const p1 = gridToWorld({ col: c, row: r }, totalGridSize);
        const p2 = gridToWorld({ col: c + 2, row: r }, totalGridSize);
        const overlap = canalBoats.some((b) => Math.hypot(b.x - p1.x, b.z - p1.z) < 4.5);
        if (!overlap) {
          canalBoats.push({
            id: `boat-${canalBoats.length + 1}`,
            x: p1.x,
            z: p1.z,
            yaw: Math.PI / 2,
            hullColor: boatColors[canalBoats.length % boatColors.length],
            cabinColor: 0xfff8eb,
            hasSail: canalBoats.length % 2 === 0,
            patrolStart: p1,
            patrolEnd: p2,
            speed: 0.9 + rng() * 0.5,
            phaseOffset: rng() * Math.PI * 2,
          });
        }
      } else if (
        tiles[r][c] === TileType.Water &&
        tiles[r + 1]?.[c] === TileType.Water &&
        tiles[r + 2]?.[c] === TileType.Water &&
        rng() < 0.14
      ) {
        const p1 = gridToWorld({ col: c, row: r }, totalGridSize);
        const p2 = gridToWorld({ col: c, row: r + 2 }, totalGridSize);
        const overlap = canalBoats.some((b) => Math.hypot(b.x - p1.x, b.z - p1.z) < 4.5);
        if (!overlap) {
          canalBoats.push({
            id: `boat-${canalBoats.length + 1}`,
            x: p1.x,
            z: p1.z,
            yaw: 0,
            hullColor: boatColors[canalBoats.length % boatColors.length],
            cabinColor: 0xfff8eb,
            hasSail: canalBoats.length % 2 === 1,
            patrolStart: p1,
            patrolEnd: p2,
            speed: 0.9 + rng() * 0.5,
            phaseOffset: rng() * Math.PI * 2,
          });
        }
      }
    }
  }

  // Crosswalk Zebra Stripes & Real-City Intersection Traffic Signals!
  const crosswalks: { x: number; z: number; yaw: number }[] = [];
  const trafficSignals: TrafficSignal[] = [];
  const signalCandidates: GridCoord[] = [];

  for (let r = minP + 1; r <= maxP - 1; r++) {
    for (let c = minP + 1; c <= maxP - 1; c++) {
      if (tiles[r][c] !== TileType.InnerRoad && tiles[r][c] !== TileType.OuterRoad) continue;
      const n = isDrivableTile(tiles[r - 1]?.[c]);
      const s = isDrivableTile(tiles[r + 1]?.[c]);
      const e = isDrivableTile(tiles[r]?.[c + 1]);
      const w = isDrivableTile(tiles[r]?.[c - 1]);
      const deg = (n ? 1 : 0) + (s ? 1 : 0) + (e ? 1 : 0) + (w ? 1 : 0);
      if (deg >= 3) {
        const wp = gridToWorld({ col: c, row: r }, totalGridSize);
        if (n && tiles[r - 1][c] !== TileType.Bridge) {
          crosswalks.push({ x: wp.x, z: wp.z - TILE_SIZE * 0.44, yaw: 0 });
        }
        if (e && tiles[r][c + 1] !== TileType.Bridge) {
          crosswalks.push({ x: wp.x + TILE_SIZE * 0.44, z: wp.z, yaw: Math.PI / 2 });
        }
        const distFromSpawn = Math.abs(c - spawnCoord.col) + Math.abs(r - spawnCoord.row);
        const overlapsRing =
          stops.some((st) => st.roadCoord.col === c && st.roadCoord.row === r) ||
          coffeeKiosks.some((k) => Math.hypot(wp.x - k.roadX, wp.z - k.roadZ) < 1.5) ||
          mechanicGarages.some((g) => Math.hypot(wp.x - g.roadX, wp.z - g.roadZ) < 1.5);
        if (distFromSpawn >= 2 && (n || s) && (e || w) && !overlapsRing) {
          if (deg === 4) {
            signalCandidates.unshift({ col: c, row: r });
          } else {
            signalCandidates.push({ col: c, row: r });
          }
        }
      }
    }
  }

  // Space out Traffic Signals by >= 3 tiles so major intersections feel realistic and readable!
  for (const cand of signalCandidates) {
    if (trafficSignals.length >= config.signalCount) break;
    const tooClose = trafficSignals.some(
      (sig) =>
        Math.abs(sig.coord.col - cand.col) + Math.abs(sig.coord.row - cand.row) < 3,
    );
    if (tooClose) continue;
    const wp = gridToWorld(cand, totalGridSize);
    const startEWGreen = trafficSignals.length % 2 === 0;
    trafficSignals.push({
      id: `signal-${trafficSignals.length + 1}`,
      coord: cand,
      x: wp.x,
      z: wp.z,
      state: startEWGreen ? SignalAxisState.EWGreen : SignalAxisState.NSGreen,
      timer: 4.0 + (trafficSignals.length % 3) * 1.6,
    });
  }

  // Ensure at least one intersection ahead of spawn has a visible Traffic Signal on Stage 1+!
  if (trafficSignals.length === 0 && signalCandidates.length > 0) {
    const first = signalCandidates[0];
    const wp = gridToWorld(first, totalGridSize);
    trafficSignals.push({
      id: 'signal-1',
      coord: first,
      x: wp.x,
      z: wp.z,
      state: SignalAxisState.EWGreen,
      timer: 5.5,
    });
  }

  // Floating Pastel Hot-Air Balloons over the scenic outer harbor!
  const skyBalloons: SkyBalloon[] = [
    {
      id: 'balloon-1',
      baseX: -G * TILE_SIZE * 0.45,
      baseY: 11.2,
      baseZ: -G * TILE_SIZE * 0.42,
      orbitRadius: 3.6,
      speed: 0.16,
      phaseOffset: 0.4,
      primaryColor: 0xff8fab,
      stripeColor: 0xfff8eb,
    },
    {
      id: 'balloon-2',
      baseX: G * TILE_SIZE * 0.46,
      baseY: 12.0,
      baseZ: G * TILE_SIZE * 0.38,
      orbitRadius: 4.2,
      speed: 0.13,
      phaseOffset: 2.5,
      primaryColor: 0xffca3a,
      stripeColor: 0x56b4e9,
    },
  ];

  // Water Foam Clouds
  const waterClouds: WorldPos[] = [];
  for (let r = 0; r < totalGridSize; r++) {
    for (let c = 0; c < totalGridSize; c++) {
      if (tiles[r][c] === TileType.Water && rng() < 0.18) {
        const wp = gridToWorld({ col: c, row: r }, totalGridSize);
        waterClouds.push({
          x: wp.x + (rng() - 0.5) * 0.4,
          z: wp.z + (rng() - 0.5) * 0.4,
        });
      }
    }
  }

  // Straightaway Boost Pads (offset into Right-Hand Lane!)
  const boostPads: BoostPad[] = [];
  const straightCandidates: { coord: GridCoord; yaw: number }[] = [];
  for (let r = minP; r <= maxP; r++) {
    for (let c = minP; c <= maxP; c++) {
      if (!isDrivableTile(tiles[r][c])) continue;
      if (Math.abs(c - spawnCoord.col) + Math.abs(r - spawnCoord.row) <= 3) continue;
      if (stops.some((s) => s.roadCoord.col === c && s.roadCoord.row === r)) continue;
      const horiz = isDrivableTile(tiles[r]?.[c - 1]) && isDrivableTile(tiles[r]?.[c + 1]);
      const vert = isDrivableTile(tiles[r - 1]?.[c]) && isDrivableTile(tiles[r + 1]?.[c]);
      if (horiz && !vert) straightCandidates.push({ coord: { col: c, row: r }, yaw: Math.PI / 2 });
      else if (vert && !horiz) straightCandidates.push({ coord: { col: c, row: r }, yaw: 0 });
    }
  }
  for (let i = straightCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = straightCandidates[i];
    straightCandidates[i] = straightCandidates[j];
    straightCandidates[j] = tmp;
  }
  for (const item of straightCandidates.slice(0, config.boostPadCount)) {
    boostPads.push({
      id: `boost-${boostPads.length + 1}`,
      coord: item.coord,
      yaw: item.yaw,
    });
  }

  // Build Traffic Vehicles strictly in Right-Hand Lanes around continuous multi-block loops!
  const hazards: TrafficHazard[] = [];
  const rightHandLoops = extractRightHandTrafficLoops(tiles, spawnCoord, totalGridSize, rng);

  for (let i = 0; i < Math.min(config.cruiserCount, rightHandLoops.length); i++) {
    const loop = rightHandLoops[i];
    const startWp = loop[0];
    const nextWp = loop[1];
    const yaw = Math.atan2(nextWp.x - startWp.x, nextWp.z - startWp.z);
    const topSpd = 3.4 + Math.min(2.2, level * 0.25) + (i % 2) * 0.35;
    hazards.push({
      id: `cruiser-${i + 1}`,
      kind: HazardKind.Cruiser,
      phase: HazardPhase.Active,
      phaseTimer: 0,
      x: startWp.x,
      z: startWp.z,
      yaw,
      speed: topSpd,
      currentSpeed: topSpd,
      colorHex: VEHICLE_PALETTE[i % VEHICLE_PALETTE.length],
      isBus: i % 3 === 1,
      stoppedAtSignal: false,
      waypoints: loop,
      waypointIndex: 1,
      dashStart: startWp,
      dashEnd: nextWp,
    });
  }

  // Express Scooter Couriers in Right-Hand Lane on straight corridors away from spawn
  const scooterCorridors = extractSafeRoadCorridors(tiles, spawnCoord, totalGridSize);
  for (let i = 0; i < Math.min(config.scooterCount, scooterCorridors.length); i++) {
    const corr = scooterCorridors[i];
    const rawA = corr[0];
    const rawB = corr[1];
    const yaw = Math.atan2(rawB.x - rawA.x, rawB.z - rawA.z);
    const rightX = -Math.cos(yaw) * RIGHT_LANE_OFFSET;
    const rightZ = Math.sin(yaw) * RIGHT_LANE_OFFSET;
    const pA = { x: rawA.x + rightX, z: rawA.z + rightZ };
    const pB = { x: rawB.x + rightX, z: rawB.z + rightZ };
    const sSpd = 7.4 + Math.min(2.4, level * 0.3);
    hazards.push({
      id: `scooter-${i + 1}`,
      kind: HazardKind.ScooterDash,
      phase: HazardPhase.Idle,
      phaseTimer: 1.2 + i * 0.7,
      x: pA.x,
      z: pA.z,
      yaw,
      speed: sSpd,
      currentSpeed: 0,
      colorHex: 0xff595e,
      waypoints: [pA, pB],
      waypointIndex: 1,
      dashStart: pA,
      dashEnd: pB,
    });
  }

  // Timed Canal Bridge Gates
  const activeBridges: GridCoord[] = [];
  for (let r = minP + 1; r <= maxP - 1; r++) {
    for (let c = minP + 1; c <= maxP - 1; c++) {
      if (
        tiles[r][c] === TileType.Bridge &&
        Math.abs(c - spawnCoord.col) + Math.abs(r - spawnCoord.row) >= 5
      ) {
        activeBridges.push({ col: c, row: r });
      }
    }
  }
  for (let i = 0; i < Math.min(config.bridgeGateCount, activeBridges.length); i++) {
    const bc = activeBridges[i];
    const wp = gridToWorld(bc, totalGridSize);
    const horizRoad =
      isDrivableTile(tiles[bc.row]?.[bc.col - 1]) ||
      isDrivableTile(tiles[bc.row]?.[bc.col + 1]);
    hazards.push({
      id: `gate-${i + 1}`,
      kind: HazardKind.BridgeGate,
      phase: HazardPhase.Idle,
      phaseTimer: 3.6 + i * 2.2,
      x: wp.x,
      z: wp.z,
      yaw: horizRoad ? Math.PI / 2 : 0,
      speed: 0,
      currentSpeed: 0,
      colorHex: 0xf6b93b,
      waypoints: [wp],
      waypointIndex: 0,
      dashStart: wp,
      dashEnd: wp,
    });
  }

  // Canal Jump Ramps placed on bridge approaches (launching over bridges & closed BridgeGates!)
  const jumpRamps: JumpRamp[] = [];
  const bridgeRampTargets =
    activeBridges.length > 0
      ? activeBridges
      : (() => {
          const allB: GridCoord[] = [];
          for (let r = minP + 1; r <= maxP - 1; r++) {
            for (let c = minP + 1; c <= maxP - 1; c++) {
              if (
                tiles[r][c] === TileType.Bridge &&
                Math.abs(c - spawnCoord.col) + Math.abs(r - spawnCoord.row) >= 3
              ) {
                allB.push({ col: c, row: r });
              }
            }
          }
          return allB;
        })();

  for (const bc of bridgeRampTargets) {
    if (jumpRamps.length >= 2) break;
    const dirs = [
      { dc: 1, dr: 0, yaw: Math.PI / 2 },
      { dc: -1, dr: 0, yaw: -Math.PI / 2 },
      { dc: 0, dr: 1, yaw: 0 },
      { dc: 0, dr: -1, yaw: Math.PI },
    ];
    for (const d of dirs) {
      const appCol = bc.col - d.dc;
      const appRow = bc.row - d.dr;
      const appTile = tiles[appRow]?.[appCol];
      if (
        (appTile === TileType.InnerRoad || appTile === TileType.OuterRoad) &&
        !stops.some((s) => s.roadCoord.col === appCol && s.roadCoord.row === appRow)
      ) {
        const appWp = gridToWorld({ col: appCol, row: appRow }, totalGridSize);
        const rightX = -Math.cos(d.yaw) * (RIGHT_LANE_OFFSET * 0.75);
        const rightZ = Math.sin(d.yaw) * (RIGHT_LANE_OFFSET * 0.75);
        const rx = appWp.x + Math.sin(d.yaw) * (TILE_SIZE * 0.26) + rightX;
        const rz = appWp.z + Math.cos(d.yaw) * (TILE_SIZE * 0.26) + rightZ;
        if (!jumpRamps.some((jr) => Math.hypot(jr.x - rx, jr.z - rz) < 3.0)) {
          jumpRamps.push({
            id: `ramp-${jumpRamps.length + 1}`,
            x: rx,
            z: rz,
            yaw: d.yaw,
            cooldown: 0,
          });
          break;
        }
      }
    }
  }

  // Waddling Duckling Family Crossings along scenic zebra crosswalks away from spawn!
  const duckCrossings: DuckCrossing[] = [];
  const spawnWp = gridToWorld(spawnCoord, totalGridSize);
  for (const cw of crosswalks) {
    if (duckCrossings.length >= 2) break;
    if (Math.hypot(cw.x - spawnWp.x, cw.z - spawnWp.z) < TILE_SIZE * 4) continue;
    if (duckCrossings.some((d) => Math.hypot(d.start.x - cw.x, d.start.z - cw.z) < 8)) {
      continue;
    }
    const acrossX = Math.cos(cw.yaw) * 0.92;
    const acrossZ = -Math.sin(cw.yaw) * 0.92;
    const startPt = { x: cw.x - acrossX, z: cw.z - acrossZ };
    const endPt = { x: cw.x + acrossX, z: cw.z + acrossZ };
    const initPhase = rng() * Math.PI * 2;
    const initU = 0.5 - 0.5 * Math.cos(initPhase);
    const dirSign = Math.sin(initPhase) >= 0 ? 1 : -1;
    duckCrossings.push({
      id: `ducks-${duckCrossings.length + 1}`,
      start: startPt,
      end: endPt,
      x: startPt.x + (endPt.x - startPt.x) * initU,
      z: startPt.z + (endPt.z - startPt.z) * initU,
      yaw: Math.atan2(
        (endPt.x - startPt.x) * dirSign,
        (endPt.z - startPt.z) * dirSign,
      ),
      phase: initPhase,
      speed: 0.95,
      politeBonusClaimed: false,
    });
  }

  // Green-Wave Signal Transponder Pickups on straightaways!
  const greenWavePickups: GreenWavePickup[] = [];
  for (const item of straightCandidates.slice(
    config.boostPadCount,
    config.boostPadCount + 2,
  )) {
    const wp = gridToWorld(item.coord, totalGridSize);
    const rightX = -Math.cos(item.yaw) * RIGHT_LANE_OFFSET;
    const rightZ = Math.sin(item.yaw) * RIGHT_LANE_OFFSET;
    greenWavePickups.push({
      id: `gwave-${greenWavePickups.length + 1}`,
      x: wp.x + rightX,
      z: wp.z + rightZ,
      cooldown: 0,
    });
  }

  // Rival Express Van ("Zoomy Blitz") racing toward a Golden Bonus Drop!
  let rivalCourier: RivalCourier | null = null;
  if (rightHandLoops.length >= 2) {
    const rLoop = rightHandLoops[rightHandLoops.length - 1];
    const rStart = rLoop[0];
    const rNext = rLoop[1];
    const bonusNode = rLoop[Math.min(3, rLoop.length - 1)];
    rivalCourier = {
      id: `rival-${level}`,
      x: rStart.x,
      z: rStart.z,
      yaw: Math.atan2(rNext.x - rStart.x, rNext.z - rStart.z),
      speed: 4.3 + Math.min(1.8, level * 0.2),
      waypoints: rLoop,
      waypointIndex: 1,
      bonusDropPos: { x: bonusNode.x, z: bonusNode.z },
      bonusClaimed: false,
      rivalWonBonus: false,
    };
  }

  return {
    config,
    seed,
    totalGridSize,
    margin,
    tiles,
    crosswalks,
    spawnCoord,
    spawnYaw,
    stops,
    bonusCandidateStop: null,
    buildings,
    brickWalls,
    trees,
    streetProps,
    trafficSignals,
    coffeeKiosks,
    mechanicGarages,
    jumpRamps,
    duckCrossings,
    greenWavePickups,
    rivalCourier,
    skyBalloons,
    canalBoats,
    pedestrians,
    waterClouds,
    boostPads,
    hazards,
  };
}

function getTreeHex(v: TreeProp['variant'], rng: () => number): number {
  if (v === 'sakura') return rng() < 0.5 ? 0xff9ec4 : 0xffb5d2;
  if (v === 'autumn') return rng() < 0.5 ? 0xf5b841 : 0xee893e;
  if (v === 'pine') return rng() < 0.5 ? 0x4da35a : 0x5bb366;
  if (v === 'cypress') return 0x469652;
  return rng() < 0.5 ? 0x7cd458 : 0x8bde64;
}

/**
 * Extracts closed rectangular multi-block traffic loops where EVERY leg is offset
 * by `+RIGHT_LANE_OFFSET` to the right of its travel heading (both Clockwise and
 * Counter-Clockwise loops!), so AI sedans and buses always stay strictly in their
 * proper Right-Hand Lane without ever making mid-street 180° flips or hitting spawn!
 */
function extractRightHandTrafficLoops(
  tiles: TileType[][],
  spawn: GridCoord,
  totalGridSize: number,
  rng: () => number,
): WorldPos[][] {
  const rows = tiles.length;
  const cols = tiles[0]?.length ?? 0;
  const rectCandidates: { r1: number; c1: number; r2: number; c2: number }[] = [];

  for (let r1 = 2; r1 < rows - 5; r1++) {
    for (let c1 = 2; c1 < cols - 5; c1++) {
      if (!isDrivableTile(tiles[r1][c1])) continue;
      for (let r2 = r1 + 2; r2 <= Math.min(rows - 3, r1 + 7); r2++) {
        if (!isDrivableTile(tiles[r2][c1])) break;
        for (let c2 = c1 + 2; c2 <= Math.min(cols - 3, c1 + 7); c2++) {
          let validRect = true;
          for (let c = c1; c <= c2; c++) {
            if (!isDrivableTile(tiles[r1][c]) || !isDrivableTile(tiles[r2][c])) {
              validRect = false;
              break;
            }
          }
          if (!validRect) continue;
          for (let r = r1; r <= r2; r++) {
            if (!isDrivableTile(tiles[r][c1]) || !isDrivableTile(tiles[r][c2])) {
              validRect = false;
              break;
            }
          }
          if (!validRect) continue;
          rectCandidates.push({ r1, c1, r2, c2 });
        }
      }
    }
  }

  // Deterministic shuffle for variety across city districts
  for (let i = rectCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = rectCandidates[i];
    rectCandidates[i] = rectCandidates[j];
    rectCandidates[j] = tmp;
  }

  const spawnW = gridToWorld(spawn, totalGridSize);
  const L = RIGHT_LANE_OFFSET;
  const loops: WorldPos[][] = [];

  for (const rect of rectCandidates) {
    if (loops.length >= 14) break;
    const tl = gridToWorld({ col: rect.c1, row: rect.r1 }, totalGridSize);
    const br = gridToWorld({ col: rect.c2, row: rect.r2 }, totalGridSize);

    const clockwise = loops.length % 2 === 0;
    const rawPts: WorldPos[] = clockwise
      ? [
          { x: tl.x + L, z: tl.z + L }, // Eastbound right lane (z = tl.z + L)
          { x: br.x - L, z: tl.z + L }, // Southbound right lane (x = br.x - L)
          { x: br.x - L, z: br.z - L }, // Westbound right lane (z = br.z - L)
          { x: tl.x + L, z: br.z - L }, // Northbound right lane (x = tl.x + L)
        ]
      : [
          { x: br.x + L, z: tl.z - L }, // Westbound right lane (z = tl.z - L)
          { x: tl.x - L, z: tl.z - L }, // Southbound right lane (x = tl.x - L)
          { x: tl.x - L, z: br.z + L }, // Eastbound right lane (z = br.z + L)
          { x: br.x + L, z: br.z + L }, // Northbound right lane (x = br.x + L)
        ];

    // Rotate starting corner so the car begins at least 6.5 units away from player spawn!
    let bestShift = -1;
    let bestDist = 0;
    for (let s = 0; s < 4; s++) {
      const d = Math.hypot(rawPts[s].x - spawnW.x, rawPts[s].z - spawnW.z);
      if (d > 6.5 && d > bestDist) {
        bestDist = d;
        bestShift = s;
      }
    }
    if (bestShift === -1) continue;

    const rotated = [
      rawPts[bestShift],
      rawPts[(bestShift + 1) % 4],
      rawPts[(bestShift + 2) % 4],
      rawPts[(bestShift + 3) % 4],
    ];

    // Avoid spawning two cruisers right on top of each other on frame 0
    const startClash = loops.some(
      (existing) =>
        Math.hypot(existing[0].x - rotated[0].x, existing[0].z - rotated[0].z) < 3.4,
    );
    if (!startClash) {
      loops.push(rotated);
    }
  }

  return loops;
}

/**
 * Extracts verified continuous road straightaways that never pass within 2 tiles of spawn!
 */
function extractSafeRoadCorridors(
  tiles: TileType[][],
  spawn: GridCoord,
  totalGridSize: number,
): WorldPos[][] {
  const rows = tiles.length;
  const cols = tiles[0]?.length ?? 0;
  const corridors: WorldPos[][] = [];

  for (let r = 0; r < rows; r++) {
    if (Math.abs(r - spawn.row) <= 1) continue;
    let runStart = -1;
    for (let c = 0; c <= cols; c++) {
      const ok = c < cols && isDrivableTile(tiles[r][c]);
      if (ok && runStart === -1) {
        runStart = c;
      } else if (!ok && runStart !== -1) {
        if (c - runStart >= 5) {
          const a = gridToWorld({ col: runStart, row: r }, totalGridSize);
          const b = gridToWorld({ col: c - 1, row: r }, totalGridSize);
          corridors.push([a, b]);
        }
        runStart = -1;
      }
    }
  }

  for (let c = 0; c < cols; c++) {
    if (Math.abs(c - spawn.col) <= 2) continue;
    let runStart = -1;
    for (let r = 0; r <= rows; r++) {
      const ok = r < rows && isDrivableTile(tiles[r][c]);
      if (ok && runStart === -1) {
        runStart = r;
      } else if (!ok && runStart !== -1) {
        if (r - runStart >= 5) {
          const a = gridToWorld({ col: c, row: runStart }, totalGridSize);
          const b = gridToWorld({ col: c, row: r - 1 }, totalGridSize);
          corridors.push([a, b]);
        }
        runStart = -1;
      }
    }
  }

  return corridors;
}

function areAllRoadsConnected(tiles: TileType[][]): boolean {
  const rows = tiles.length;
  const cols = tiles[0]?.length ?? 0;
  let firstRoad: GridCoord | null = null;
  let totalRoads = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isDrivableTile(tiles[r][c])) {
        totalRoads++;
        if (!firstRoad) firstRoad = { col: c, row: r };
      }
    }
  }
  if (!firstRoad) return false;

  const visited = new Uint8Array(rows * cols);
  const queue: number[] = [firstRoad.row * cols + firstRoad.col];
  visited[queue[0]] = 1;
  let count = 0;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    count++;
    const r = Math.floor(curr / cols);
    const c = curr % cols;
    for (const [dc, dr] of dirs) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const idx = nr * cols + nc;
      if (!visited[idx] && isDrivableTile(tiles[nr][nc])) {
        visited[idx] = 1;
        queue.push(idx);
      }
    }
  }

  return count === totalRoads;
}
