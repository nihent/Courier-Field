export enum TileType {
  Water = 0,
  Grass = 1,
  InnerRoad = 2,
  OuterRoad = 3,
  Bridge = 4,
  Building = 5,
  Courtyard = 6,
  OuterMeadow = 7,
  Plaza = 8,
}

export enum CityArchetype {
  WindingCanalHarbor = 'winding_canal_harbor',
  TwinRiverArchipelago = 'twin_river_archipelago',
  DowntownMoatRing = 'downtown_moat_ring',
  SerpentinePortMaze = 'serpentine_port_maze',
}

export enum ShiftAtmosphere {
  SunnyHarbor = 'sunny_harbor',
  GoldenSunset = 'golden_sunset',
  TwilightNeon = 'twilight_neon',
}

export enum VehicleId {
  ClassicVan = 'classic_van',
  KeiTruck = 'kei_truck',
  VespaTrike = 'vespa_trike',
  ArmoredVan = 'armored_van',
}

export enum TopperId {
  Beacon = 'beacon',
  RubberDuck = 'rubber_duck',
  EspressoCup = 'espresso_cup',
  PartyBalloons = 'party_balloons',
}

export enum GamePhase {
  Title = 'title',
  Playing = 'playing',
  Paused = 'paused',
  GameOver = 'gameover',
}

export enum OutcomeKind {
  None = 'none',
  Victory = 'victory',
  OutOfTime = 'out_of_time',
  Breakdown = 'breakdown',
}

export enum HazardKind {
  Cruiser = 'cruiser',
  ScooterDash = 'scooter_dash',
  BridgeGate = 'bridge_gate',
}

export enum HazardPhase {
  Idle = 'idle',
  Windup = 'windup',
  Active = 'active',
  Recovery = 'recovery',
}

export enum ParcelKind {
  Small = 'small',
  Large = 'large',
  Fragile = 'fragile',
  HotExpress = 'hot_express',
}

export type VIPRole = 'none' | 'chef' | 'mayor' | 'captain';

export enum SignalAxisState {
  NSGreen = 'ns_green',
  NSYellow = 'ns_yellow',
  EWGreen = 'ew_green',
  EWYellow = 'ew_yellow',
}

export type TicketKind = 'wrong_way' | 'red_light';

export type CrashKind =
  | 'vehicle'
  | 'building'
  | 'prop'
  | 'gate'
  | 'rival'
  | 'ai_vehicle';

export type CrashSeverity = 'bump' | 'crash';

export interface CrashEvent {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  kind: CrashKind;
  severity: CrashSeverity;
  label: string;
  involvesPlayer: boolean;
  hazardId?: string;
  rivalHit?: boolean;
}

export type CountdownStage = 3 | 2 | 1 | 0 | null;

export type RocketStartStatus =
  | 'idle'
  | 'ready'
  | 'primed'
  | 'sputter'
  | 'launched';

export interface HonkEvent {
  hazardId: string;
  x: number;
  z: number;
  isBus: boolean;
}

export enum BuildingTheme {
  PeriwinkleTower = 0,
  PinkPinTower = 1,
  ApricotArchShop = 2,
  SkyBlueCafe = 3,
  SunnyHeartShop = 4,
  TerracottaBakery = 5,
  MintMansardApartments = 6,
  ClockTowerHall = 7,
}

export interface GridCoord {
  col: number;
  row: number;
}

export interface WorldPos {
  x: number;
  z: number;
}

export interface PersonAppearance {
  skinColor: number;
  hairColor: number;
  hairStyle: 'short' | 'ponytail' | 'bun' | 'curly' | 'cap' | 'sunhat';
  topColor: number;
  bottomColor: number;
  accentColor: number;
  hasBag: boolean;
}

export interface DeliveryStop {
  index: number; // 1-based route order (#1, #2, ...)
  id: string;
  customerName: string;
  parcelLabel: string;
  parcelKind: ParcelKind;
  vipRole: VIPRole;
  isBoomerangTrigger?: boolean;
  isBonusStop?: boolean;
  isMovingCustomer?: boolean;
  patrolStart?: WorldPos;
  patrolEnd?: WorldPos;
  liveCitizenX?: number;
  liveCitizenZ?: number;
  hatColor: number;
  shirtColor: number;
  appearance: PersonAppearance;
  roadCoord: GridCoord;
  citizenCoord: GridCoord;
  delivered: boolean;
  deliveredViaToss: boolean;
  deliveredBullseye?: boolean;
}

export interface BuildingLot {
  coord: GridCoord;
  theme: BuildingTheme;
  floors: number;
  facingYaw: number;
  hasAwning: boolean;
  hasBalconies: boolean;
  roofFeature: 'water_tower' | 'skylight' | 'ac_units' | 'garden' | 'pin' | 'clock';
}

export interface CourtyardWallSegment {
  x: number;
  z: number;
  yaw: number;
  colorHex: number;
}

export interface TreeProp {
  x: number;
  z: number;
  variant: 'oak' | 'pine' | 'autumn' | 'sakura' | 'cypress' | 'bush';
  scale: number;
  tintHex: number;
}

export type StreetPropKind =
  | 'streetlamp'
  | 'fountain'
  | 'cafe_umbrella'
  | 'bench'
  | 'mailbox'
  | 'hydrant'
  | 'flower_planter';

export interface StreetProp {
  kind: StreetPropKind;
  x: number;
  z: number;
  yaw: number;
  accentHex: number;
  geyserTimer?: number;
}

export interface TrafficSignal {
  id: string;
  coord: GridCoord;
  x: number;
  z: number;
  state: SignalAxisState;
  timer: number;
}

export interface CoffeeKiosk {
  id: string;
  kioskX: number;
  kioskZ: number;
  roadX: number;
  roadZ: number;
  yaw: number;
  cooldown: number;
}

export interface MechanicGarage {
  id: string;
  garageX: number;
  garageZ: number;
  roadX: number;
  roadZ: number;
  yaw: number;
  cooldown: number;
}

export interface JumpRamp {
  id: string;
  x: number;
  z: number;
  yaw: number;
  cooldown: number;
}

export interface DuckCrossing {
  id: string;
  start: WorldPos;
  end: WorldPos;
  x: number;
  z: number;
  yaw: number;
  phase: number;
  speed: number;
  politeBonusClaimed: boolean;
}

export interface GreenWavePickup {
  id: string;
  x: number;
  z: number;
  cooldown: number;
}

export interface RivalCourier {
  id: string;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  waypoints: WorldPos[];
  waypointIndex: number;
  bonusDropPos: WorldPos;
  bonusClaimed: boolean;
  rivalWonBonus: boolean;
  bumpTimer?: number;
  bumpVx?: number;
  bumpVz?: number;
  crashCooldown?: number;
}

export interface SkyBalloon {
  id: string;
  baseX: number;
  baseY: number;
  baseZ: number;
  orbitRadius: number;
  speed: number;
  phaseOffset: number;
  primaryColor: number;
  stripeColor: number;
}

export interface CanalBoat {
  id: string;
  x: number;
  z: number;
  yaw: number;
  hullColor: number;
  cabinColor: number;
  hasSail: boolean;
  patrolStart: WorldPos;
  patrolEnd: WorldPos;
  speed: number;
  phaseOffset: number;
}

export interface SidewalkPedestrian {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  walkSpeed: number;
  strideDistance: number;
  waypoints: WorldPos[];
  waypointIndex: number;
  pauseTimer: number;
  waveTimer: number;
  appearance: PersonAppearance;
}

export interface BoostPad {
  id: string;
  coord: GridCoord;
  yaw: number;
}

export interface TrafficHazard {
  id: string;
  kind: HazardKind;
  phase: HazardPhase;
  phaseTimer: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  currentSpeed: number;
  colorHex: number;
  isBus?: boolean;
  stoppedAtSignal?: boolean;
  nearMissCooldown?: number;
  calmedByHornTimer?: number;
  waypoints: WorldPos[];
  waypointIndex: number;
  dashStart: WorldPos;
  dashEnd: WorldPos;
  bumpTimer?: number;
  bumpVx?: number;
  bumpVz?: number;
  crashCooldown?: number;
  honkCooldown?: number;
  honkVisualTimer?: number;
  stoppedDuration?: number;
}

export interface LevelConfig {
  level: number;
  districtName: string;
  archetype: CityArchetype;
  atmosphere: ShiftAtmosphere;
  hasSunshower: boolean;
  gridSize: number; // Interior playable city grid (15, 17, 19)
  stopCount: number;
  timeLimitSec: number;
  cruiserCount: number;
  scooterCount: number;
  bridgeGateCount: number;
  boostPadCount: number;
  signalCount: number;
}

export interface GeneratedCity {
  config: LevelConfig;
  seed: number;
  totalGridSize: number;
  margin: number;
  tiles: TileType[][]; // [row][col]
  crosswalks: { x: number; z: number; yaw: number }[];
  spawnCoord: GridCoord;
  spawnYaw: number;
  stops: DeliveryStop[];
  bonusCandidateStop: DeliveryStop | null;
  buildings: BuildingLot[];
  brickWalls: CourtyardWallSegment[];
  trees: TreeProp[];
  streetProps: StreetProp[];
  trafficSignals: TrafficSignal[];
  coffeeKiosks: CoffeeKiosk[];
  mechanicGarages: MechanicGarage[];
  jumpRamps: JumpRamp[];
  duckCrossings: DuckCrossing[];
  greenWavePickups: GreenWavePickup[];
  rivalCourier: RivalCourier | null;
  skyBalloons: SkyBalloon[];
  canalBoats: CanalBoat[];
  pedestrians: SidewalkPedestrian[];
  waterClouds: WorldPos[];
  boostPads: BoostPad[];
  hazards: TrafficHazard[];
}

export interface TruckState {
  vehicleId: VehicleId;
  x: number;
  y: number; // > 0 when airborne off a Canal Jump Ramp!
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  speed: number;
  isBraking: boolean;
  isDrifting: boolean;
  driftChargeAccum: number;
  boostTimer: number;
  boostCooldown: number;
  invulnTimer: number;
  health: number;
  maxHealth: number;
  hasBumperShield: boolean;
  shockAbsorberAvailable: boolean;
  greenWaveTimer: number;
  hornCooldown: number;
  distanceTraveled: number;
  squashY: number;
  squashVel: number;
  rollAngle: number;
  pitchAngle: number;
  steerAngle: number;
  isWrongWay: boolean;
  wrongWayTimer: number;
  ticketCooldown: number;
  ticketsCount: number;
  lastSignalCellKey: string;
  fragileIntact: boolean;
  thermalTimer: number;
  thermalMaxSec: number;
  wallCrashCooldown?: number;
}

export type QuestKind =
  | 'bullseye_drops'
  | 'express_tosses'
  | 'clean_deliveries'
  | 'pitstops_used'
  | 'near_misses';

export interface QuestItem {
  id: string;
  kind: QuestKind;
  title: string;
  progress: number;
  target: number;
  rewardCoins: number;
  claimed: boolean;
}

export interface PlayerProgression {
  coins: number;
  spinTokens: number;
  unlockedVehicles: VehicleId[];
  selectedVehicle: VehicleId;
  unlockedToppers: TopperId[];
  selectedTopper: TopperId;
  districtStars: Record<number, number>; // level -> 1..3 stars
  quests: QuestItem[];
  nextFreeShield: boolean;
}

export interface RunSnapshot {
  level: number;
  districtName: string;
  outcome: OutcomeKind;
  score: number;
  bestScore: number;
  coinsEarned: number;
  starsEarned: number;
  earnedSpinToken: boolean;
  deliveredCount: number;
  totalStops: number;
  bullseyeCount: number;
  timeRemainingSec: number;
  elapsedSec: number;
  maxCombo: number;
  healthRemaining: number;
  ticketsCount: number;
}

export interface HudBannerEvent {
  id: number;
  label: string;
  detail: string;
  tone: 'emerald' | 'amber' | 'rose';
}

export interface HudState {
  level: number;
  districtName: string;
  atmosphere: ShiftAtmosphere;
  deliveredCount: number;
  totalStops: number;
  timeRemainingSec: number;
  score: number;
  coins: number;
  bestScore: number;
  combo: number;
  comboTimer: number;
  isFever: boolean;
  health: number;
  maxHealth: number;
  hasBumperShield: boolean;
  greenWaveTimer: number;
  nextStopIndex: number;
  nextCustomerName: string;
  nextParcelLabel: string;
  nextParcelKind: ParcelKind;
  nextVipRole: VIPRole;
  thermalPct: number; // 0..1 when HotExpress active
  fragileIntact: boolean;
  nextStopAppearance: PersonAppearance | null;
  distanceToStopMeters: number;
  bearingToStopRad: number;
  canExpressToss: boolean;
  canBullseyeToss: boolean;
  needsBrakeForLarge: boolean;
  isWrongWay: boolean;
  wrongWayProgress: number; // 0..1 gauge toward wrong-way ticket
  ticketsCount: number;
  boostReady: boolean;
  boostCharge: number;
  isBoosting: boolean;
  isDrifting: boolean;
  speedKmh: number;
  bannerEvent: HudBannerEvent | null;
  countdownStage?: CountdownStage;
  rocketStartStatus?: RocketStartStatus;
  demoActive?: boolean;
  demoRemainingSec?: number;
}

export const TILE_SIZE = 2.6;
export const RIGHT_LANE_OFFSET = 0.44;
