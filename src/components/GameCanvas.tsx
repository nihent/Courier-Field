import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { pokoAudio } from '../game/audio';
import {
  CitizenStopRig,
  CoffeeKioskRig,
  CrashBurstRig,
  HazardRig,
  IslandBirdRig,
  MechanicGarageRig,
  PersonRig,
  RivalCourierRig,
  ToyTruckRig,
  TrafficSignalRig,
  WindStreakRig,
  createBeveledBlockGeometry,
  createCanalBoatMesh,
  createCitizenStopRig,
  createCoffeeKioskMesh,
  createCrashBurstMesh,
  createDetailedPersonMesh,
  createDuckCrossingMesh,
  createGreenWaveMesh,
  createHazardMesh,
  createIslandBirdMesh,
  createJumpRampMesh,
  createMechanicGarageMesh,
  createMiniParcelMesh,
  createPastelBuildingMesh,
  createProceduralTextures,
  createRivalCourierMesh,
  createSkyBalloonMesh,
  createSpinningCoinMesh,
  createStreetPropMesh,
  createToyTruckMesh,
  createTrafficSignalMesh,
  createTreeMesh,
  createWindStreakMesh,
} from '../game/meshes';
import {
  findForwardRoadPath,
  generateProceduralCity,
  gridToWorld,
  worldToGrid,
} from '../game/proceduralCity';
import { VEHICLE_SPECS, computeRunRewards } from '../game/progression';
import {
  BOOST_COOLDOWN_MAX_SEC,
  COMBO_WINDOW_SEC,
  CountdownMode,
  FEVER_COMBO_THRESHOLD,
  ParcelStackWobbleState,
  ROCKET_START_POINTS,
  StartCountdownState,
  WRONG_WAY_LIMIT_SEC,
  applyRocketStartToTruck,
  calculateDeliveryScore,
  checkDeliveryEligibility,
  createInitialTruckState,
  createParcelStackWobbleState,
  createStartCountdownState,
  evaluateRunStatus,
  getActiveStop,
  stepCoffeeKiosks,
  stepDuckCrossings,
  stepHazardsAndCollisions,
  stepMechanicGarages,
  stepMovingCustomers,
  stepParcelStackWobble,
  stepPedestriansPhysics,
  stepRivalCourier,
  stepStartCountdown,
  stepTrafficSignals,
  stepTruckPhysics,
  triggerMusicalHorn,
} from '../game/rules';
import {
  DemoDirectorState,
  createDemoDirectorState,
  stepDemoDirector,
} from '../game/demoDirector';
import { resetTouchControls, touchControls } from '../game/touchControls';
import {
  CanalBoat,
  CrashEvent,
  DuckCrossing,
  GamePhase,
  GeneratedCity,
  GreenWavePickup,
  HazardKind,
  HazardPhase,
  HudBannerEvent,
  HudState,
  OutcomeKind,
  ParcelKind,
  QuestKind,
  RunSnapshot,
  ShiftAtmosphere,
  SidewalkPedestrian,
  SignalAxisState,
  SkyBalloon,
  TILE_SIZE,
  TileType,
  TopperId,
  TruckState,
  VehicleId,
} from '../game/types';
import { MinimapSnapshot } from './GameHud';

// Pre-allocated scratch math helpers (Zero GC in per-frame tick!)
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.24);
const _intersectPt = new THREE.Vector3();

const PARTICLE_POOL_SIZE = 96;
const BREADCRUMB_MAX = 42;
const FLYING_PARCEL_POOL = 4;
const FLYING_COIN_POOL = 8;
const CRASH_BURST_POOL = 6;

// Elevated Top-Down "Heading-Up" Google Maps 3D Chase Camera Constants
const CHASE_BASE_FOV = 30;
const CHASE_LOOK_AHEAD = 4.8;
const CHASE_BACK_DIST = 21.5;
const CHASE_UP_HEIGHT = 26.0;

function wrapAngleRad(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

interface FlyingParcel {
  active: boolean;
  t: number;
  duration: number;
  sx: number;
  sy: number;
  sz: number;
  tx: number;
  ty: number;
  tz: number;
  mesh: THREE.Group;
  onLand?: () => void;
}

interface FlyingCoin {
  active: boolean;
  delay: number;
  t: number;
  duration: number;
  sx: number;
  sy: number;
  sz: number;
  coinIdx: number;
  mesh: THREE.Group;
}

interface SpawnedIslandBird {
  rig: IslandBirdRig;
  centerX: number;
  centerZ: number;
  orbitRadiusX: number;
  orbitRadiusZ: number;
  baseY: number;
  speed: number;
  phase: number;
  flapSpeed: number;
}

interface PooledCrashBurst {
  active: boolean;
  t: number;
  duration: number;
  baseScale: number;
  rig: CrashBurstRig;
}

export interface GameCanvasProps {
  phase: GamePhase;
  activeLevel: number;
  runNonce: number; // Increments on Restart or New Run
  bestScore: number;
  selectedVehicle: VehicleId;
  selectedTopper: TopperId;
  walletCoins: number;
  startWithShield: boolean;
  minimapRef: React.RefObject<MinimapSnapshot>;
  onHudUpdate: (hud: HudState) => void;
  onPhaseChange: (nextPhase: GamePhase) => void;
  onRunFinished: (snapshot: RunSnapshot) => void;
  onAwardLiveCoins: (delta: number) => void;
  onQuestEvent: (kind: QuestKind, amount?: number) => void;
  onConsumeStartShield: () => void;
}

export function GameCanvas({
  phase,
  activeLevel,
  runNonce,
  bestScore,
  selectedVehicle,
  selectedTopper,
  walletCoins,
  startWithShield,
  minimapRef,
  onHudUpdate,
  onPhaseChange,
  onRunFinished,
  onAwardLiveCoins,
  onQuestEvent,
  onConsumeStartShield,
}: GameCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const minimapSnapRef = useRef(minimapRef);
  minimapSnapRef.current = minimapRef;

  // Store latest props/callbacks in refs so HUD state never recreates WebGL context!
  const phaseRef = useRef(phase);
  const levelRef = useRef(activeLevel);
  const bestScoreRef = useRef(bestScore);
  const vehicleRef = useRef(selectedVehicle);
  const topperRef = useRef(selectedTopper);
  const walletCoinsRef = useRef(walletCoins);
  const startShieldRef = useRef(startWithShield);
  const onHudUpdateRef = useRef(onHudUpdate);
  const onPhaseChangeRef = useRef(onPhaseChange);
  const onRunFinishedRef = useRef(onRunFinished);
  const onAwardLiveCoinsRef = useRef(onAwardLiveCoins);
  const onQuestEventRef = useRef(onQuestEvent);
  const onConsumeStartShieldRef = useRef(onConsumeStartShield);

  phaseRef.current = phase;
  levelRef.current = activeLevel;
  bestScoreRef.current = bestScore;
  vehicleRef.current = selectedVehicle;
  topperRef.current = selectedTopper;
  walletCoinsRef.current = walletCoins;
  startShieldRef.current = startWithShield;
  onHudUpdateRef.current = onHudUpdate;
  onPhaseChangeRef.current = onPhaseChange;
  onRunFinishedRef.current = onRunFinished;
  onAwardLiveCoinsRef.current = onAwardLiveCoins;
  onQuestEventRef.current = onQuestEvent;
  onConsumeStartShieldRef.current = onConsumeStartShield;

  // Function pointers to rebuild level scene or swap cosmetics cleanly without tearing down WebGL
  const loadLevelFnRef = useRef<((lvl: number, resetScore: boolean) => void) | null>(
    null,
  );
  const syncCosmeticsFnRef = useRef<
    ((veh: VehicleId, top: TopperId) => void) | null
  >(null);
  const prevLevelRef = useRef<number>(activeLevel);
  const prevNonceRef = useRef<number>(runNonce);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software WebGL Detection (per threejs & ultra-mode directives)
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initRect = container.getBoundingClientRect();
    const initW = Math.max(320, initRect.width || window.innerWidth);
    const initH = Math.max(240, initRect.height || window.innerHeight);
    renderer.setSize(initW, initH);
    renderer.domElement.setAttribute('data-testid', 'game-canvas');
    renderer.domElement.tabIndex = 0;
    renderer.domElement.className = 'block w-full h-full outline-none';
    container.appendChild(renderer.domElement);

    // WebGL context loss safety
    const onContextLost = (e: Event) => e.preventDefault();
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    // 2. Scene, Vivid Sky-Cerulean Water Backdrop & Studio Environment
    const scene = new THREE.Scene();
    const skyWaterHex = 0x4bb7ef;
    scene.background = new THREE.Color(skyWaterHex);
    scene.fog = new THREE.Fog(skyWaterHex, 58, 125);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.36;
    pmremGenerator.dispose();

    // 3. Elevated Top-Down Heading-Up Chase Camera (miniature-diorama telephoto FOV behind the back of the van!)
    const aspect = initW / initH;
    const camera = new THREE.PerspectiveCamera(
      aspect < 0.95 ? 42 : CHASE_BASE_FOV,
      aspect,
      1.5,
      340,
    );
    const camLookTarget = new THREE.Vector3(0, 0.35, 0);
    camera.position.set(0, CHASE_UP_HEIGHT, -CHASE_BACK_DIST);
    camera.lookAt(camLookTarget);

    // 4. Warm/Cool Color-Temperature 3-Point Daylight Rig
    const hemiLight = new THREE.HemisphereLight(0xd4f0ff, 0x9ed95c, 0.72);
    hemiLight.position.set(0, 40, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff2d2, 1.48);
    sunLight.position.set(18, 32, 14);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.set(1024, 1024);
    const shadowBound = 29;
    sunLight.shadow.camera.left = -shadowBound;
    sunLight.shadow.camera.right = shadowBound;
    sunLight.shadow.camera.top = shadowBound;
    sunLight.shadow.camera.bottom = -shadowBound;
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 85;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);
    scene.add(sunLight.target);

    const rimLight = new THREE.DirectionalLight(0xbbe6ff, 0.38);
    rimLight.position.set(-16, 18, -18);
    scene.add(rimLight);

    // Endless Sky-Cerulean Canal Water Plane
    const waterGeo = new THREE.PlaneGeometry(260, 260);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x3eaee8,
      roughness: 0.32,
      metalness: 0.04,
    });
    const waterPlane = new THREE.Mesh(waterGeo, waterMat);
    waterPlane.rotation.x = -Math.PI / 2;
    waterPlane.position.y = 0.0;
    waterPlane.receiveShadow = true;
    scene.add(waterPlane);

    // Shared Textures & Beveled Tile Geometries
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const textures = createProceduralTextures(maxAniso);

    const sharedGeos = {
      curbBlock: createBeveledBlockGeometry(TILE_SIZE * 0.99, 0.24, TILE_SIZE * 0.99, 0.14, 0.03),
      grassCap: createBeveledBlockGeometry(TILE_SIZE * 0.97, 0.22, TILE_SIZE * 0.97, 0.14, 0.035),
      roadSlab: createBeveledBlockGeometry(TILE_SIZE * 0.995, 0.24, TILE_SIZE * 0.995, 0.08, 0.025),
      bridgeDeck: createBeveledBlockGeometry(TILE_SIZE * 0.96, 0.2, TILE_SIZE * 0.96, 0.1, 0.025),
      brickSeg: createBeveledBlockGeometry(TILE_SIZE * 0.3, 0.36, 0.3, 0.06, 0.022),
      crosswalkStripe: new THREE.BoxGeometry(0.18, 0.016, 0.72),
      cloudPuff: new THREE.SphereGeometry(0.28, 12, 10),
      chevronGeo: new THREE.ConeGeometry(0.32, 0.62, 4),
      particleSphere: new THREE.SphereGeometry(0.16, 8, 8),
    };
    sharedGeos.chevronGeo.rotateX(Math.PI / 2);

    const sharedMats = {
      creamCurb: new THREE.MeshStandardMaterial({
        color: 0xf6f5ed,
        roughness: 0.65,
        metalness: 0.02,
      }),
      grassLush: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.78,
        metalness: 0.02,
        bumpMap: textures.clayBumpTex,
        bumpScale: 0.008,
      }),
      plazaSurface: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.plazaPaverTex,
        roughness: 0.64,
        metalness: 0.03,
      }),
      outerMeadow: new THREE.MeshStandardMaterial({
        color: 0xaee36d,
        roughness: 0.82,
        metalness: 0.01,
      }),
      innerRoad: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.innerPaverTex,
        roughness: 0.68,
        metalness: 0.03,
      }),
      outerRoad: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.outerRoadTex,
        roughness: 0.72,
        metalness: 0.03,
      }),
      woodBridge: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.woodBridgeTex,
        roughness: 0.62,
        metalness: 0.03,
      }),
      brickBase: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.68,
        metalness: 0.03,
      }),
      crosswalkWhite: new THREE.MeshStandardMaterial({
        color: 0xfbfdff,
        roughness: 0.55,
        metalness: 0.02,
      }),
      cloudWhite: new THREE.MeshStandardMaterial({
        color: 0xfafeff,
        roughness: 0.45,
        metalness: 0.0,
      }),
      boostPadMat: new THREE.MeshStandardMaterial({
        color: 0x26d09c,
        emissive: 0x10b981,
        emissiveIntensity: 0.45,
        roughness: 0.25,
      }),
      breadcrumbMat: new THREE.MeshStandardMaterial({
        color: 0xff7b29,
        emissive: 0xff9f1c,
        emissiveIntensity: 0.52,
        roughness: 0.25,
      }),
      particleMat: new THREE.MeshBasicMaterial({
        color: 0xffffff,
      }),
    };

    // Pooled Zero-GC Particle InstancedMesh
    const particleMesh = new THREE.InstancedMesh(
      sharedGeos.particleSphere,
      sharedMats.particleMat,
      PARTICLE_POOL_SIZE,
    );
    particleMesh.frustumCulled = false;
    particleMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(PARTICLE_POOL_SIZE * 3),
      3,
    );
    scene.add(particleMesh);

    const particles: PooledParticle[] = Array.from(
      { length: PARTICLE_POOL_SIZE },
      () => ({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        r: 1,
        g: 1,
        b: 1,
      }),
    );
    let particleRingCursor = 0;

    function spawnParticleBurst(
      x: number,
      y: number,
      z: number,
      count: number,
      palette: number[],
      speedScale: number = 1.0,
    ) {
      for (let i = 0; i < count; i++) {
        const p = particles[particleRingCursor];
        particleRingCursor = (particleRingCursor + 1) % PARTICLE_POOL_SIZE;
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const spd = (1.6 + Math.random() * 2.8) * speedScale;
        const hex = palette[i % palette.length];
        _color.setHex(hex);
        p.active = true;
        p.x = x;
        p.y = y;
        p.z = z;
        p.vx = Math.cos(angle) * spd;
        p.vy = (2.4 + Math.random() * 2.8) * speedScale;
        p.vz = Math.sin(angle) * spd;
        p.maxLife = 0.42 + Math.random() * 0.28;
        p.life = p.maxLife;
        p.size = 0.75 + Math.random() * 0.65;
        p.r = _color.r;
        p.g = _color.g;
        p.b = _color.b;
      }
    }

    // Golden Route Breadcrumb Chevrons (InstancedMesh)
    const breadcrumbMesh = new THREE.InstancedMesh(
      sharedGeos.chevronGeo,
      sharedMats.breadcrumbMat,
      BREADCRUMB_MAX,
    );
    breadcrumbMesh.frustumCulled = false;
    scene.add(breadcrumbMesh);

    // Flying Parcel Pool
    const flyingParcels: FlyingParcel[] = Array.from(
      { length: FLYING_PARCEL_POOL },
      () => {
        const mesh = createMiniParcelMesh(0xf6be6d);
        mesh.visible = false;
        scene.add(mesh);
        return {
          active: false,
          t: 0,
          duration: 0.36,
          sx: 0,
          sy: 0,
          sz: 0,
          tx: 0,
          ty: 0,
          tz: 0,
          mesh,
        };
      },
    );

    // Pooled Spinning Gold Tip Coins tossed from cheering customers onto the Courier Van roof!
    const flyingCoins: FlyingCoin[] = Array.from(
      { length: FLYING_COIN_POOL },
      () => {
        const mesh = createSpinningCoinMesh();
        mesh.visible = false;
        scene.add(mesh);
        return {
          active: false,
          delay: 0,
          t: 0,
          duration: 0.44,
          sx: 0,
          sy: 0,
          sz: 0,
          coinIdx: 0,
          mesh,
        };
      },
    );
    let flyingCoinCursor = 0;

    // Pooled Zero-GC 3D Comic Starburst + Shockwave Crash Effects
    const crashBursts: PooledCrashBurst[] = Array.from(
      { length: CRASH_BURST_POOL },
      () => {
        const rig = createCrashBurstMesh();
        scene.add(rig.root);
        return {
          active: false,
          t: 0,
          duration: 0.44,
          baseScale: 1.0,
          rig,
        };
      },
    );
    let crashBurstCursor = 0;

    function spawnCrashBurstEffect(ev: CrashEvent) {
      const slot = crashBursts[crashBurstCursor];
      crashBurstCursor = (crashBurstCursor + 1) % CRASH_BURST_POOL;
      const isHeavy = ev.severity === 'crash';
      slot.active = true;
      slot.t = 0;
      slot.duration = isHeavy ? 0.5 : 0.36;
      slot.baseScale = !ev.involvesPlayer ? 0.72 : isHeavy ? 1.18 : 0.86;
      slot.rig.root.position.set(ev.x, ev.y + 0.18, ev.z);
      slot.rig.root.rotation.y = camYaw;
      slot.rig.starBurstGroup.scale.setScalar(0.2);
      slot.rig.shockRing.scale.setScalar(0.35);
      slot.rig.shockRingMat.opacity = 0.92;
      slot.rig.dizzyOrbitGroup.position.y = 0;
      slot.rig.root.visible = true;

      spawnParticleBurst(
        ev.x,
        ev.y + 0.12,
        ev.z,
        !ev.involvesPlayer ? 10 : isHeavy ? 24 : 14,
        ev.kind === 'rival'
          ? [0xffdf24, 0xa855f7, 0xffffff, 0xff595e]
          : [0xffdf24, 0xff595e, 0xffffff, 0xff9f1c, 0xcbd5e1],
        !ev.involvesPlayer ? 0.85 : isHeavy ? 1.35 : 0.98,
      );
    }

    // Persistent Hero Truck Rig + Flanking 3D Near-Miss Wind-Streak Ribbons
    const truckRig: ToyTruckRig = createToyTruckMesh(
      textures.shadowDiscTex,
      textures.clayBumpTex,
      9,
      vehicleRef.current,
      topperRef.current,
    );
    const windStreakRig: WindStreakRig = createWindStreakMesh();
    truckRig.root.add(windStreakRig.root);
    scene.add(truckRig.root);

    // Level World Container (rebuilt cleanly per level)
    let levelGroup = new THREE.Group();
    scene.add(levelGroup);

    let currentCity: GeneratedCity = generateProceduralCity(levelRef.current);
    let truckState: TruckState = createInitialTruckState(
      currentCity,
      vehicleRef.current,
      startShieldRef.current,
    );
    let camYaw = truckState.yaw;
    let citizenRigs: CitizenStopRig[] = [];
    let hazardRigs: HazardRig[] = [];
    let signalRigs: TrafficSignalRig[] = [];
    let kioskRigs: CoffeeKioskRig[] = [];
    let garageRigs: MechanicGarageRig[] = [];
    let duckRigs: { data: DuckCrossing; mesh: THREE.Group }[] = [];
    let greenWaveRigs: { data: GreenWavePickup; mesh: THREE.Group }[] = [];
    let rivalRig: RivalCourierRig | null = null;
    let balloonRigs: { data: SkyBalloon; mesh: THREE.Group }[] = [];
    let pedestrianRigs: { data: SidewalkPedestrian; rig: PersonRig }[] = [];
    let boatRigs: { data: CanalBoat; mesh: THREE.Group }[] = [];
    let birdRigs: SpawnedIslandBird[] = [];
    let rampBeaconGroups: THREE.Group[] = [];

    // Simulation state
    let score = 0;
    let combo = 0;
    let comboTimer = 0;
    let maxCombo = 0;
    let bullseyeCount = 0;
    let timeRemainingSec = currentCity.config.timeLimitSec;
    let elapsedSec = 0;
    let hitstopTimer = 0;
    let cameraTrauma = 0;
    let hitFlashTimer = 0;
    let finishDelayTimer = -1;
    let pendingOutcome: OutcomeKind = OutcomeKind.None;
    let lastHudEmitTime = 0;
    let lastPathCalcTime = -1;
    let cachedRoadPath: { x: number; z: number; yaw: number }[] = [];
    let bannerEvent: HudBannerEvent | null = null;
    let bannerTimer = 0;
    let bannerSeq = 0;
    let lastTickedSecond = -1;
    let feverTrailAccum = 0;
    let sunshowerAccum = 0;
    let countdownState: StartCountdownState = createStartCountdownState('instant');
    let parcelWobble: ParcelStackWobbleState = createParcelStackWobbleState(
      truckState.yaw,
    );
    let windStreakTimer = 0;
    let victoryOrbitAngle = 0;
    let victoryConfettiAccum = 0;
    let birdChirpTimer = 1.8;
    let treeFlutterCooldown = 0;
    let revExhaustAccum = 0;
    let lastStartedLevel = -1;
    let demoState: DemoDirectorState = createDemoDirectorState();
    let demoSandboxCoins = walletCoinsRef.current;

    function awardRunCoins(delta: number) {
      if (delta <= 0) return;
      if (demoState.active) {
        demoSandboxCoins += delta;
      } else {
        onAwardLiveCoinsRef.current(delta);
      }
    }

    function recordQuestEvent(kind: QuestKind, amount: number = 1) {
      if (demoState.active) return;
      onQuestEventRef.current(kind, amount);
    }

    // Unified Input State (hoisted so buildCityScene always starts with clean held/edge keys!)
    const keysHeld = new Set<string>();
    const keysJustPressed = new Set<string>();
    let spaceBufferTimer = 0;
    let pointerDown = false;
    let pointerClientX = 0;
    let pointerClientY = 0;

    function clearAllInputs() {
      keysHeld.clear();
      keysJustPressed.clear();
      pointerDown = false;
      spaceBufferTimer = 0;
      resetTouchControls();
    }

    function disposeLevelGroup() {
      for (const cr of citizenRigs) {
        cr.disposeTextures();
      }
      citizenRigs = [];
      hazardRigs = [];
      signalRigs = [];
      kioskRigs = [];
      garageRigs = [];
      duckRigs = [];
      greenWaveRigs = [];
      rivalRig = null;
      balloonRigs = [];
      pedestrianRigs = [];
      boatRigs = [];
      birdRigs = [];
      rampBeaconGroups = [];
      for (const fc of flyingCoins) {
        fc.active = false;
        fc.mesh.visible = false;
      }
      for (const fp of flyingParcels) {
        fp.active = false;
        fp.mesh.visible = false;
        fp.onLand = undefined;
      }
      scene.remove(levelGroup);
      levelGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          if (
            !m.geometry.userData?.shared &&
            !Object.values(sharedGeos).includes(m.geometry as never)
          ) {
            m.geometry.dispose();
          }
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) {
            if (
              !mat.userData?.shared &&
              !Object.values(sharedMats).includes(mat as never)
            ) {
              mat.dispose();
            }
          }
        }
      });
      levelGroup = new THREE.Group();
      scene.add(levelGroup);
    }

    function syncTruckParcelStack() {
      const remaining = currentCity.stops.filter((s) => !s.delivered).length;
      truckRig.parcelBoxes.forEach((box, idx) => {
        box.visible = idx < remaining;
      });
    }

    function syncMinimapSnapshot() {
      const snap = minimapSnapRef.current.current;
      if (!snap) return;
      const activeStop = getActiveStop(currentCity.stops);
      snap.city = currentCity;
      snap.truckX = truckState.x;
      snap.truckZ = truckState.z;
      snap.truckYaw = truckState.yaw;
      snap.activeStopIndex = activeStop ? activeStop.index : -1;
    }

    function refreshForwardRoadPath() {
      const activeStop = getActiveStop(currentCity.stops);
      if (!activeStop) {
        cachedRoadPath = [];
        return;
      }
      const startGc = worldToGrid(
        truckState.x,
        truckState.z,
        currentCity.totalGridSize,
      );
      const rawPath = findForwardRoadPath(
        currentCity.tiles,
        startGc,
        truckState.yaw,
        activeStop.roadCoord,
      );
      const fwdX = Math.sin(truckState.yaw);
      const fwdZ = Math.cos(truckState.yaw);
      cachedRoadPath = [];
      for (let i = 0; i < rawPath.length; i++) {
        const wp = gridToWorld(rawPath[i], currentCity.totalGridSize);
        const nextWp =
          i + 1 < rawPath.length
            ? gridToWorld(rawPath[i + 1], currentCity.totalGridSize)
            : wp;
        const yaw =
          i + 1 < rawPath.length
            ? Math.atan2(nextWp.x - wp.x, nextWp.z - wp.z)
            : cachedRoadPath.length > 0
              ? cachedRoadPath[cachedRoadPath.length - 1].yaw
              : truckState.yaw;

        // Skip any node behind the van's rear bumper so no road arrow ever points backward!
        if (i > 0 && i < rawPath.length - 1) {
          const alongFwd =
            (wp.x - truckState.x) * fwdX + (wp.z - truckState.z) * fwdZ;
          if (alongFwd < -0.35) continue;
        }
        // Also ensure chevron yaw never points >105° backward relative to the van on the first step!
        const relStepYaw = wrapAngleRad(yaw - truckState.yaw);
        const safeYaw =
          cachedRoadPath.length <= 1 && Math.abs(relStepYaw) > Math.PI * 0.58
            ? wrapAngleRad(
                truckState.yaw + Math.sign(relStepYaw || 1) * Math.PI * 0.5,
              )
            : yaw;
        cachedRoadPath.push({ x: wp.x, z: wp.z, yaw: safeYaw });
      }
    }

    function emitHudSnapshot() {
      const activeStop = getActiveStop(currentCity.stops);
      const elig = checkDeliveryEligibility(
        truckState,
        activeStop,
        currentCity.totalGridSize,
      );
      const deliveredCount = currentCity.stops.filter((s) => s.delivered).length;
      const padPos = activeStop
        ? gridToWorld(activeStop.roadCoord, currentCity.totalGridSize)
        : { x: truckState.x, z: truckState.z };
      const dxStop = padPos.x - truckState.x;
      const dzStop = padPos.z - truckState.z;
      const distMeters = activeStop
        ? Math.max(0, Math.round(Math.hypot(dxStop, dzStop) * 4.5))
        : 0;

      // Forward-Only Turn-by-Turn Compass Bearing (Straight / Left / Right — NEVER Back!):
      let bearingRad = 0;
      if (activeStop) {
        if (cachedRoadPath.length === 0) {
          refreshForwardRoadPath();
        }
        const lookAheadNode =
          cachedRoadPath.length >= 2
            ? cachedRoadPath[Math.min(2, cachedRoadPath.length - 1)]
            : padPos;
        const navDx = lookAheadNode.x - truckState.x;
        const navDz = lookAheadNode.z - truckState.z;
        const rawWorldBearing =
          Math.hypot(navDx, navDz) > 0.25
            ? Math.atan2(navDx, navDz)
            : truckState.yaw;
        const rawRel = wrapAngleRad(truckState.yaw - rawWorldBearing);
        // Clamp strictly to [-92°, +92°] so the HUD arrow never points backward!
        const maxTurnAngle = Math.PI * 0.51;
        bearingRad = Math.max(-maxTurnAngle, Math.min(maxTurnAngle, rawRel));
      }

      const boostCharge =
        truckState.boostCooldown <= 0
          ? 1
          : Math.max(
              0,
              Math.min(1, 1 - truckState.boostCooldown / BOOST_COOLDOWN_MAX_SEC),
            );

      const thermalPct =
        activeStop?.parcelKind === ParcelKind.HotExpress &&
        truckState.thermalMaxSec > 0
          ? Math.max(
              0,
              Math.min(1, truckState.thermalTimer / truckState.thermalMaxSec),
            )
          : 0;

      syncMinimapSnapshot();

      onHudUpdateRef.current({
        level: currentCity.config.level,
        districtName: currentCity.config.districtName,
        atmosphere: currentCity.config.atmosphere,
        deliveredCount,
        totalStops: currentCity.stops.length,
        timeRemainingSec: Math.max(0, Math.ceil(timeRemainingSec)),
        score: Math.round(score),
        coins: demoState.active ? demoSandboxCoins : walletCoinsRef.current,
        bestScore: Math.max(bestScoreRef.current, Math.round(score)),
        combo,
        comboTimer,
        isFever: combo >= FEVER_COMBO_THRESHOLD && comboTimer > 0,
        health: truckState.health,
        maxHealth: truckState.maxHealth,
        hasBumperShield: truckState.hasBumperShield,
        greenWaveTimer: truckState.greenWaveTimer,
        nextStopIndex: activeStop
          ? activeStop.index
          : currentCity.stops.length,
        nextCustomerName: activeStop ? activeStop.customerName : 'All Delivered!',
        nextParcelLabel: activeStop ? activeStop.parcelLabel : 'Route Complete',
        nextParcelKind: activeStop ? activeStop.parcelKind : ParcelKind.Small,
        nextVipRole: activeStop ? activeStop.vipRole : 'none',
        thermalPct,
        fragileIntact: truckState.fragileIntact,
        nextStopAppearance: activeStop ? activeStop.appearance : null,
        distanceToStopMeters: distMeters,
        bearingToStopRad: bearingRad,
        canExpressToss: elig.canExpressToss,
        canBullseyeToss: elig.canBullseyeToss,
        needsBrakeForLarge: elig.needsBrakeForLarge,
        isWrongWay: truckState.isWrongWay,
        wrongWayProgress: Math.min(
          1,
          truckState.wrongWayTimer / WRONG_WAY_LIMIT_SEC,
        ),
        ticketsCount: truckState.ticketsCount,
        boostReady: truckState.boostCooldown <= 0,
        boostCharge,
        isBoosting: truckState.boostTimer > 0,
        isDrifting: truckState.isDrifting,
        speedKmh: Math.round(truckState.speed * 6.5),
        bannerEvent,
        countdownStage: countdownState.stage,
        rocketStartStatus: countdownState.rocketStatus,
        demoActive: demoState.active,
        demoRemainingSec: demoState.active
          ? Math.max(1, Math.ceil(demoState.durationSec - demoState.elapsedSec))
          : 0,
      });
    }

    function applyAtmosphereRig(atm: ShiftAtmosphere) {
      if (atm === ShiftAtmosphere.GoldenSunset) {
        scene.background = new THREE.Color(0xf4976c);
        scene.fog = new THREE.Fog(0xf4976c, 58, 128);
        waterMat.color.setHex(0x2b8cbe);
        sunLight.color.setHex(0xffb36b);
        sunLight.intensity = 1.62;
        hemiLight.color.setHex(0xffd6a5);
        hemiLight.groundColor.setHex(0x8ab17d);
        hemiLight.intensity = 0.78;
        rimLight.color.setHex(0xfde68a);
        rimLight.intensity = 0.44;
        truckRig.headlightCones.visible = false;
      } else if (atm === ShiftAtmosphere.TwilightNeon) {
        scene.background = new THREE.Color(0x1d3557);
        scene.fog = new THREE.Fog(0x1d3557, 54, 122);
        waterMat.color.setHex(0x152844);
        sunLight.color.setHex(0xa8dadc);
        sunLight.intensity = 0.96;
        hemiLight.color.setHex(0x5289b5);
        hemiLight.groundColor.setHex(0x2b4560);
        hemiLight.intensity = 0.92;
        rimLight.color.setHex(0xf72585);
        rimLight.intensity = 0.45;
        truckRig.headlightCones.visible = true;
      } else {
        scene.background = new THREE.Color(0x4bb7ef);
        scene.fog = new THREE.Fog(0x4bb7ef, 58, 125);
        waterMat.color.setHex(0x3eaee8);
        sunLight.color.setHex(0xfff2d2);
        sunLight.intensity = 1.48;
        hemiLight.color.setHex(0xd4f0ff);
        hemiLight.groundColor.setHex(0x9ed95c);
        hemiLight.intensity = 0.72;
        rimLight.color.setHex(0xbbe6ff);
        rimLight.intensity = 0.38;
        truckRig.headlightCones.visible = false;
      }
    }

    function buildCityScene(lvl: number, resetScore: boolean) {
      clearAllInputs();
      disposeLevelGroup();
      currentCity = generateProceduralCity(lvl);
      const grantShield =
        !demoState.active &&
        startShieldRef.current &&
        phaseRef.current === GamePhase.Playing;
      const activeVeh = demoState.active
        ? demoState.vehicleId
        : vehicleRef.current;
      const activeTop = demoState.active
        ? demoState.topperId
        : topperRef.current;
      truckState = createInitialTruckState(
        currentCity,
        activeVeh,
        grantShield,
      );
      if (grantShield) {
        onConsumeStartShieldRef.current();
      }
      truckRig.setVehicleStyle(activeVeh);
      truckRig.setTopper(activeTop);
      applyAtmosphereRig(currentCity.config.atmosphere);
      pokoAudio.setFeverMode(false);

      if (resetScore) {
        score = 0;
      }
      combo = 0;
      comboTimer = 0;
      maxCombo = 0;
      bullseyeCount = 0;
      timeRemainingSec = currentCity.config.timeLimitSec;
      elapsedSec = 0;
      hitstopTimer = 0;
      cameraTrauma = 0;
      hitFlashTimer = 0;
      finishDelayTimer = -1;
      pendingOutcome = OutcomeKind.None;
      lastPathCalcTime = -1;
      cachedRoadPath = [];
      bannerEvent = null;
      bannerTimer = 0;
      lastTickedSecond = -1;

      // Count tiles for InstancedMesh batching
      const islandCurbCoords: { x: number; z: number }[] = [];
      const grassCoords: { x: number; z: number; isMeadow: boolean }[] = [];
      const plazaCoords: { x: number; z: number }[] = [];
      const innerRoadCoords: { x: number; z: number }[] = [];
      const outerRoadCoords: { x: number; z: number }[] = [];
      const bridgeCoords: { x: number; z: number; rotatePlanks: boolean }[] = [];

      const N = currentCity.totalGridSize;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const t = currentCity.tiles[r][c];
          if (t === TileType.Water) continue;
          const wp = gridToWorld({ col: c, row: r }, N);
          if (t === TileType.InnerRoad) {
            innerRoadCoords.push(wp);
          } else if (t === TileType.OuterRoad) {
            outerRoadCoords.push(wp);
          } else if (t === TileType.Bridge) {
            const horizWater =
              currentCity.tiles[r]?.[c - 1] === TileType.Water ||
              currentCity.tiles[r]?.[c + 1] === TileType.Water;
            bridgeCoords.push({ ...wp, rotatePlanks: horizWater });
          } else if (t === TileType.Plaza || t === TileType.Courtyard) {
            islandCurbCoords.push(wp);
            plazaCoords.push(wp);
          } else {
            islandCurbCoords.push(wp);
            grassCoords.push({
              ...wp,
              isMeadow: t === TileType.OuterMeadow,
            });
          }
        }
      }

      // 1A. Instanced Cream Island Curbs under all land tiles
      if (islandCurbCoords.length > 0) {
        const curbInst = new THREE.InstancedMesh(
          sharedGeos.curbBlock,
          sharedMats.creamCurb,
          islandCurbCoords.length,
        );
        curbInst.receiveShadow = true;
        islandCurbCoords.forEach((g, idx) => {
          _pos.set(g.x, 0.0, g.z);
          _quat.identity();
          _scale.set(1, 1, 1);
          _mat4.compose(_pos, _quat, _scale);
          curbInst.setMatrixAt(idx, _mat4);
        });
        curbInst.instanceMatrix.needsUpdate = true;
        curbInst.computeBoundingSphere();
        levelGroup.add(curbInst);
      }

      // 1B. Instanced Lush Pastel Grass Caps
      if (grassCoords.length > 0) {
        const capInst = new THREE.InstancedMesh(
          sharedGeos.grassCap,
          sharedMats.grassLush,
          grassCoords.length,
        );
        capInst.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(grassCoords.length * 3),
          3,
        );
        capInst.receiveShadow = true;

        grassCoords.forEach((g, idx) => {
          _pos.set(g.x, 0.21, g.z);
          _quat.identity();
          _scale.set(1, 1, 1);
          _mat4.compose(_pos, _quat, _scale);
          capInst.setMatrixAt(idx, _mat4);

          _color.setHex(
            g.isMeadow ? 0xb4e875 : idx % 2 === 0 ? 0xa3de60 : 0xace36a,
          );
          capInst.setColorAt(idx, _color);
        });
        capInst.instanceMatrix.needsUpdate = true;
        if (capInst.instanceColor) capInst.instanceColor.needsUpdate = true;
        capInst.computeBoundingSphere();
        levelGroup.add(capInst);
      }

      // 1C. Instanced Warm Sandstone Plaza & Courtyard Caps
      if (plazaCoords.length > 0) {
        const plazaInst = new THREE.InstancedMesh(
          sharedGeos.grassCap,
          sharedMats.plazaSurface,
          plazaCoords.length,
        );
        plazaInst.receiveShadow = true;
        plazaCoords.forEach((p, idx) => {
          _pos.set(p.x, 0.21, p.z);
          _quat.identity();
          _scale.set(1, 1, 1);
          _mat4.compose(_pos, _quat, _scale);
          plazaInst.setMatrixAt(idx, _mat4);
        });
        plazaInst.instanceMatrix.needsUpdate = true;
        plazaInst.computeBoundingSphere();
        levelGroup.add(plazaInst);
      }

      // 2. Instanced Inner Modular Paver Roads
      if (innerRoadCoords.length > 0) {
        const innerInst = new THREE.InstancedMesh(
          sharedGeos.roadSlab,
          sharedMats.innerRoad,
          innerRoadCoords.length,
        );
        innerInst.receiveShadow = true;
        innerRoadCoords.forEach((p, idx) => {
          _pos.set(p.x, 0.01, p.z);
          _quat.identity();
          _scale.set(1, 1, 1);
          _mat4.compose(_pos, _quat, _scale);
          innerInst.setMatrixAt(idx, _mat4);
        });
        innerInst.instanceMatrix.needsUpdate = true;
        innerInst.computeBoundingSphere();
        levelGroup.add(innerInst);
      }

      // 3. Instanced Outer Asphalt Boulevard
      if (outerRoadCoords.length > 0) {
        const outerInst = new THREE.InstancedMesh(
          sharedGeos.roadSlab,
          sharedMats.outerRoad,
          outerRoadCoords.length,
        );
        outerInst.receiveShadow = true;
        outerRoadCoords.forEach((p, idx) => {
          _pos.set(p.x, 0.01, p.z);
          _quat.identity();
          _scale.set(1, 1, 1);
          _mat4.compose(_pos, _quat, _scale);
          outerInst.setMatrixAt(idx, _mat4);
        });
        outerInst.instanceMatrix.needsUpdate = true;
        outerInst.computeBoundingSphere();
        levelGroup.add(outerInst);
      }

      // 4. Instanced Wooden Canal Bridges + Terracotta Bridge Abutments
      if (bridgeCoords.length > 0) {
        const bridgeInst = new THREE.InstancedMesh(
          sharedGeos.bridgeDeck,
          sharedMats.woodBridge,
          bridgeCoords.length,
        );
        bridgeInst.receiveShadow = true;
        bridgeInst.castShadow = true;
        bridgeCoords.forEach((b, idx) => {
          _pos.set(b.x, 0.06, b.z);
          _euler.set(0, b.rotatePlanks ? 0 : Math.PI / 2, 0);
          _quat.setFromEuler(_euler);
          _scale.set(1, 1, 1);
          _mat4.compose(_pos, _quat, _scale);
          bridgeInst.setMatrixAt(idx, _mat4);
        });
        bridgeInst.instanceMatrix.needsUpdate = true;
        bridgeInst.computeBoundingSphere();
        levelGroup.add(bridgeInst);
      }

      // 5. Instanced Multi-Colored Courtyard Toy Brick Walls (3 alternating bricks per segment just like reference!)
      if (currentCity.brickWalls.length > 0) {
        const brickSubColors = [0xf8c94e, 0xdc7e44, 0x5ba85d, 0xf5dc93];
        const totalBricks = currentCity.brickWalls.length * 3;
        const brickInst = new THREE.InstancedMesh(
          sharedGeos.brickSeg,
          sharedMats.brickBase,
          totalBricks,
        );
        brickInst.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(totalBricks * 3),
          3,
        );
        brickInst.castShadow = true;
        brickInst.receiveShadow = true;
        currentCity.brickWalls.forEach((bw, idx) => {
          const cosY = Math.cos(bw.yaw);
          const sinY = Math.sin(bw.yaw);
          for (let sub = 0; sub < 3; sub++) {
            const along = (sub - 1) * (TILE_SIZE * 0.31);
            // Local X offset rotated by yaw
            const bx = bw.x + along * cosY;
            const bz = bw.z - along * sinY;
            const bHeightScale = sub === 1 ? 1.08 : 0.96;
            _pos.set(bx, 0.42, bz);
            _euler.set(0, bw.yaw, 0);
            _quat.setFromEuler(_euler);
            _scale.set(1, bHeightScale, 1);
            _mat4.compose(_pos, _quat, _scale);
            const flatIdx = idx * 3 + sub;
            brickInst.setMatrixAt(flatIdx, _mat4);
            _color.setHex(brickSubColors[(idx + sub) % brickSubColors.length]);
            brickInst.setColorAt(flatIdx, _color);
          }
        });
        brickInst.instanceMatrix.needsUpdate = true;
        if (brickInst.instanceColor) brickInst.instanceColor.needsUpdate = true;
        brickInst.computeBoundingSphere();
        levelGroup.add(brickInst);
      }

      // 6. Cute White Water Foam Clouds
      if (currentCity.waterClouds.length > 0) {
        const cloudInst = new THREE.InstancedMesh(
          sharedGeos.cloudPuff,
          sharedMats.cloudWhite,
          currentCity.waterClouds.length * 2,
        );
        currentCity.waterClouds.forEach((wc, idx) => {
          _pos.set(wc.x - 0.14, 0.02, wc.z);
          _quat.identity();
          _scale.set(1.1, 0.35, 0.9);
          _mat4.compose(_pos, _quat, _scale);
          cloudInst.setMatrixAt(idx * 2, _mat4);

          _pos.set(wc.x + 0.16, 0.02, wc.z + 0.08);
          _scale.set(0.85, 0.3, 0.75);
          _mat4.compose(_pos, _quat, _scale);
          cloudInst.setMatrixAt(idx * 2 + 1, _mat4);
        });
        cloudInst.instanceMatrix.needsUpdate = true;
        cloudInst.computeBoundingSphere();
        levelGroup.add(cloudInst);
      }

      // 7. Turbo Boost Pads on Straightaways
      for (const pad of currentCity.boostPads) {
        const pw = gridToWorld(pad.coord, N);
        const padGroup = new THREE.Group();
        padGroup.position.set(pw.x, 0.255, pw.z);
        padGroup.rotation.y = pad.yaw;
        for (const zOff of [-0.36, 0, 0.36]) {
          const chev = new THREE.Mesh(sharedGeos.chevronGeo, sharedMats.boostPadMat);
          chev.position.set(0, 0.02, zOff);
          chev.scale.set(1.2, 0.35, 0.9);
          padGroup.add(chev);
        }
        levelGroup.add(padGroup);
      }

      // 7B. Instanced Zebra Crosswalk Stripes at Intersections
      if (currentCity.crosswalks.length > 0) {
        const totalStripes = currentCity.crosswalks.length * 4;
        const cwInst = new THREE.InstancedMesh(
          sharedGeos.crosswalkStripe,
          sharedMats.crosswalkWhite,
          totalStripes,
        );
        currentCity.crosswalks.forEach((cw, idx) => {
          const cosY = Math.cos(cw.yaw);
          const sinY = Math.sin(cw.yaw);
          for (let s = 0; s < 4; s++) {
            const offset = (s - 1.5) * 0.44;
            _pos.set(cw.x + offset * cosY, 0.252, cw.z - offset * sinY);
            _euler.set(0, cw.yaw, 0);
            _quat.setFromEuler(_euler);
            _scale.set(1, 1, 1);
            _mat4.compose(_pos, _quat, _scale);
            cwInst.setMatrixAt(idx * 4 + s, _mat4);
          }
        });
        cwInst.instanceMatrix.needsUpdate = true;
        cwInst.computeBoundingSphere();
        levelGroup.add(cwInst);
      }

      // 8. Architectural Buildings, Lush Trees, Street Furniture & Canal Boats
      for (const lot of currentCity.buildings) {
        const wp = gridToWorld(lot.coord, N);
        levelGroup.add(createPastelBuildingMesh(lot, wp, textures.clayBumpTex));
      }
      for (const tree of currentCity.trees) {
        levelGroup.add(createTreeMesh(tree, textures.shadowDiscTex));
      }
      for (const sp of currentCity.streetProps) {
        levelGroup.add(createStreetPropMesh(sp, textures.shadowDiscTex));
      }
      for (const boat of currentCity.canalBoats) {
        const bMesh = createCanalBoatMesh(boat);
        levelGroup.add(bMesh);
        boatRigs.push({ data: boat, mesh: bMesh });
      }

      // 8B. Strolling Sidewalk & Plaza Pedestrians!
      for (const ped of currentCity.pedestrians) {
        const pRig = createDetailedPersonMesh(ped.appearance, textures.shadowDiscTex);
        pRig.root.position.set(ped.x, 0.42, ped.z);
        pRig.root.rotation.y = ped.yaw;
        levelGroup.add(pRig.root);
        pedestrianRigs.push({ data: ped, rig: pRig });
      }

      // 9. Articulated Delivery Customers & Drop Pads
      for (const stop of currentCity.stops) {
        const cw = gridToWorld(stop.citizenCoord, N);
        const rw = gridToWorld(stop.roadCoord, N);
        const rig = createCitizenStopRig(
          stop,
          cw,
          rw,
          textures.shadowDiscTex,
          maxAniso,
        );
        levelGroup.add(rig.citizenGroup, rig.padGroup);
        citizenRigs.push(rig);
      }

      // 10. Dynamic Traffic & Bridge Gate Hazards
      for (const h of currentCity.hazards) {
        const hRig = createHazardMesh(h, textures.shadowDiscTex);
        levelGroup.add(hRig.root);
        hazardRigs.push(hRig);
      }

      // 11. 3D Intersection Traffic Signals, Drive-Thru Espresso Kiosks & Harbor Sky Balloons!
      for (const sig of currentCity.trafficSignals) {
        const sRig = createTrafficSignalMesh(sig);
        levelGroup.add(sRig.root);
        signalRigs.push(sRig);
      }
      for (const kiosk of currentCity.coffeeKiosks) {
        const kRig = createCoffeeKioskMesh(kiosk, textures.shadowDiscTex);
        levelGroup.add(kRig.boothGroup, kRig.roadRingGroup);
        kioskRigs.push(kRig);
      }
      for (const bal of currentCity.skyBalloons) {
        const balMesh = createSkyBalloonMesh(bal);
        levelGroup.add(balMesh);
        balloonRigs.push({ data: bal, mesh: balMesh });
      }

      // 12. Mechanic Garages, Canal Jump Ramps, Duckling Crossings, Green-Wave Orbs & Rival Courier!
      for (const gar of currentCity.mechanicGarages) {
        const gRig = createMechanicGarageMesh(gar, textures.shadowDiscTex);
        levelGroup.add(gRig.bayGroup, gRig.roadRingGroup);
        garageRigs.push(gRig);
      }
      for (const ramp of currentCity.jumpRamps) {
        const rampGroup = createJumpRampMesh(ramp);
        rampGroup.children.forEach((ch) => {
          if (ch.userData?.isOverviewShortcut) {
            rampBeaconGroups.push(ch as THREE.Group);
          }
        });
        levelGroup.add(rampGroup);
      }
      for (const duck of currentCity.duckCrossings) {
        const dMesh = createDuckCrossingMesh(duck);
        levelGroup.add(dMesh);
        duckRigs.push({ data: duck, mesh: dMesh });
      }
      for (const gw of currentCity.greenWavePickups) {
        const gwMesh = createGreenWaveMesh(gw);
        levelGroup.add(gwMesh);
        greenWaveRigs.push({ data: gw, mesh: gwMesh });
      }
      if (currentCity.rivalCourier) {
        rivalRig = createRivalCourierMesh(
          currentCity.rivalCourier,
          textures.shadowDiscTex,
        );
        levelGroup.add(rivalRig.vanGroup, rivalRig.bonusDropGroup);
      }

      // 13. Flocking 3D Songbirds & Harbor Seagulls circling parks, trees, and canals!
      const birdPalettes: [number, number][] = [
        [0x70d6ff, 0x1d4ed8], // Sky bluebird
        [0xffe524, 0xf59e0b], // Sunny goldfinch
        [0xff8fab, 0xe11d48], // Coral blossom robin
        [0x9ef01a, 0x15803d], // Meadow parakeet
        [0xfefae0, 0x64748b], // Harbor seagull
      ];
      const islandHalfSpan = (currentCity.totalGridSize * TILE_SIZE) * 0.42;
      const birdCount = 9;
      for (let bi = 0; bi < birdCount; bi++) {
        const isHarborGull = bi >= 6;
        const [bodyHex, wingHex] = isHarborGull
          ? birdPalettes[4]
          : birdPalettes[bi % 4];
        const bRig = createIslandBirdMesh(bodyHex, wingHex);
        const anchorTree =
          !isHarborGull && currentCity.trees.length > 0
            ? currentCity.trees[(bi * 5) % currentCity.trees.length]
            : null;
        const angle = (bi / birdCount) * Math.PI * 2;
        const cx = anchorTree
          ? anchorTree.x
          : Math.cos(angle) * (islandHalfSpan * 0.85);
        const cz = anchorTree
          ? anchorTree.z
          : Math.sin(angle) * (islandHalfSpan * 0.85);
        levelGroup.add(bRig.root);
        birdRigs.push({
          rig: bRig,
          centerX: cx,
          centerZ: cz,
          orbitRadiusX: isHarborGull ? 6.8 + (bi % 3) * 1.8 : 2.8 + (bi % 3) * 1.1,
          orbitRadiusZ: isHarborGull ? 5.2 + (bi % 2) * 1.6 : 2.3 + (bi % 2) * 0.9,
          baseY: isHarborGull ? 4.8 + (bi % 3) * 0.55 : 3.05 + (bi % 3) * 0.42,
          speed: isHarborGull ? 0.72 + (bi % 3) * 0.12 : 1.15 + (bi % 3) * 0.18,
          phase: bi * 1.37,
          flapSpeed: isHarborGull ? 9.5 : 14.5,
        });
      }

      // Reset parcel wobble & wind streaks
      parcelWobble = createParcelStackWobbleState(truckState.yaw);
      windStreakTimer = 0;
      windStreakRig.root.visible = false;
      victoryOrbitAngle = 0;
      victoryConfettiAccum = 0;
      birdChirpTimer = 1.4;
      treeFlutterCooldown = 0;
      revExhaustAccum = 0;

      // Initialize 3 - 2 - 1 - GO! Bird's-Eye Island Overview Swoop when starting a Playing shift!
      if (phaseRef.current === GamePhase.Playing) {
        const isSameStageRetry = lastStartedLevel === lvl;
        const cdMode: CountdownMode = demoState.active
          ? 'quick'
          : isSameStageRetry
            ? 'quick'
            : 'full';
        if (!demoState.active) {
          lastStartedLevel = lvl;
        }
        countdownState = createStartCountdownState(cdMode);
        pokoAudio.playCountdownBeep(3);
        if (currentCity.config.atmosphere !== ShiftAtmosphere.TwilightNeon) {
          pokoAudio.playBirdChirp(0.7);
        }
      } else {
        countdownState = createStartCountdownState('instant');
      }

      // Position truck at spawn & set initial camera (Bird's-Eye Overview on Playing start, Chase on Title!)
      truckRig.root.position.set(truckState.x, 0.24, truckState.z);
      truckRig.root.rotation.y = truckState.yaw;
      truckRig.shieldRing.visible = truckState.hasBumperShield;
      camYaw = truckState.yaw;
      if (countdownState.isFrozen) {
        const isPortrait = camera.aspect < 0.95;
        const islandSpan = currentCity.totalGridSize * TILE_SIZE;
        const ovwYaw = demoState.active
          ? Math.PI / 2 - 0.34
          : truckState.yaw - 0.34;
        const ovwHeight = islandSpan * (isPortrait ? 1.56 : 1.44);
        const ovwBack = islandSpan * (isPortrait ? 1.04 : 0.94);
        camLookTarget.set(0, 0.4, 0);
        camera.position.set(
          -Math.sin(ovwYaw) * ovwBack,
          ovwHeight,
          -Math.cos(ovwYaw) * ovwBack,
        );
        camera.lookAt(camLookTarget);
        if (scene.fog instanceof THREE.Fog) {
          scene.fog.near = 155;
          scene.fog.far = 290;
        }
      } else {
        camLookTarget.set(
          truckState.x + Math.sin(camYaw) * CHASE_LOOK_AHEAD,
          0.35,
          truckState.z + Math.cos(camYaw) * CHASE_LOOK_AHEAD,
        );
        camera.position.set(
          camLookTarget.x - Math.sin(camYaw) * CHASE_BACK_DIST,
          camLookTarget.y + CHASE_UP_HEIGHT,
          camLookTarget.z - Math.cos(camYaw) * CHASE_BACK_DIST,
        );
        camera.lookAt(camLookTarget);
      }
      waterPlane.position.set(camLookTarget.x, 0.0, camLookTarget.z);
      sunLight.position.set(camLookTarget.x + 18, 32, camLookTarget.z + 14);
      sunLight.target.position.copy(camLookTarget);
      syncTruckParcelStack();
      refreshForwardRoadPath();
      emitHudSnapshot();

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }
    }

    function startDemoReel() {
      touchControls.demoTogglePulse = false;
      demoState = createDemoDirectorState();
      demoState.active = true;
      demoSandboxCoins = walletCoinsRef.current;
      buildCityScene(1, true);
    }

    function stopDemoReel() {
      touchControls.demoTogglePulse = false;
      demoState = createDemoDirectorState();
      pokoAudio.setFeverMode(false);
      buildCityScene(levelRef.current, true);
    }

    loadLevelFnRef.current = (lvl: number, resetScore: boolean) => {
      demoState = createDemoDirectorState();
      buildCityScene(lvl, resetScore);
    };
    syncCosmeticsFnRef.current = (veh: VehicleId, top: TopperId) => {
      if (demoState.active) return;
      truckRig.setVehicleStyle(veh);
      truckRig.setTopper(top);
      const spec = VEHICLE_SPECS[veh] ?? VEHICLE_SPECS[VehicleId.ClassicVan];
      if (truckState.vehicleId !== veh) {
        truckState.vehicleId = veh;
        const hpDelta = spec.maxHealth - truckState.maxHealth;
        truckState.maxHealth = spec.maxHealth;
        truckState.health = Math.max(
          1,
          Math.min(spec.maxHealth, truckState.health + Math.max(0, hpDelta)),
        );
        truckState.shockAbsorberAvailable = spec.hasShockAbsorber;
        emitHudSnapshot();
      }
    };
    buildCityScene(levelRef.current, true);

    // 5. Unified Input Listeners (held vs justPressed, Space buffer, focus-loss reset, pointer steer)
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(
          e.code,
        )
      ) {
        if (phaseRef.current === GamePhase.Playing) {
          e.preventDefault();
        }
      }
      if (
        e.code === 'Escape' &&
        !e.repeat &&
        demoState.active &&
        phaseRef.current === GamePhase.Playing
      ) {
        e.preventDefault();
        clearAllInputs();
        pokoAudio.playUiClick();
        stopDemoReel();
        return;
      }
      if (phaseRef.current === GamePhase.Playing) {
        if (!keysHeld.has(e.code)) {
          keysJustPressed.add(e.code);
        }
        keysHeld.add(e.code);

        if (e.code === 'Space' || e.code === 'KeyE') {
          spaceBufferTimer = 0.14;
        }
      }

      if (
        (e.code === 'Escape' || e.code === 'KeyP') &&
        !e.repeat &&
        (phaseRef.current === GamePhase.Playing ||
          phaseRef.current === GamePhase.Paused)
      ) {
        clearAllInputs();
        pokoAudio.playUiClick();
        onPhaseChangeRef.current(
          phaseRef.current === GamePhase.Playing
            ? GamePhase.Paused
            : GamePhase.Playing,
        );
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeld.delete(e.code);
    };

    const onBlurOrHidden = () => {
      clearAllInputs();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (phaseRef.current !== GamePhase.Playing) return;
      if (e.button !== 0) return;
      pointerDown = true;
      pointerClientX = e.clientX;
      pointerClientY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointerDown) return;
      pointerClientX = e.clientX;
      pointerClientY = e.clientY;
    };

    const onPointerUp = () => {
      pointerDown = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlurOrHidden);
    const onVisChange = () => {
      if (document.hidden) onBlurOrHidden();
    };
    document.addEventListener('visibilitychange', onVisChange);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    function screenToWorldOnRoad(clientX: number, clientY: number): THREE.Vector3 | null {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_ndc, camera);
      return _raycaster.ray.intersectPlane(_groundPlane, _intersectPt);
    }

    // ResizeObserver for crisp projection without hardcoded viewport sizes
    const updateCameraSize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(320, rect.width);
      const h = Math.max(240, rect.height);
      const asp = w / h;
      camera.fov = asp < 0.95 ? 42 : CHASE_BASE_FOV;
      camera.aspect = asp;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObs = new ResizeObserver(updateCameraSize);
    resizeObs.observe(container);

    // Complete delivery helper
    function triggerParcelDelivery(
      viaExpressToss: boolean,
      isBullseye: boolean = false,
    ) {
      const activeStop = getActiveStop(currentCity.stops);
      if (!activeStop || activeStop.delivered) return;

      activeStop.delivered = true;
      activeStop.deliveredViaToss = viaExpressToss;

      const wasFragileIntact = truckState.fragileIntact;
      const reward = calculateDeliveryScore(
        combo,
        comboTimer,
        viaExpressToss,
        currentCity.config.level,
        activeStop.parcelKind,
        wasFragileIntact,
        {
          bullseye: isBullseye,
          thermalTimer: truckState.thermalTimer,
          vipRole: activeStop.vipRole,
          ticketsCount: truckState.ticketsCount,
        },
      );
      score += reward.pointsAwarded;
      combo = reward.nextCombo;
      maxCombo = Math.max(maxCombo, combo);
      comboTimer = COMBO_WINDOW_SEC;
      if (isBullseye) {
        bullseyeCount += 1;
        recordQuestEvent('bullseye_drops', 1);
      }
      if (viaExpressToss) {
        recordQuestEvent('express_tosses', 1);
      }
      if (truckState.ticketsCount === 0) {
        recordQuestEvent('clean_deliveries', 1);
      }
      awardRunCoins(reward.coinsAwarded);
      pokoAudio.setFeverMode(reward.isFever);

      const boomerangBonusPts = activeStop.isBoomerangTrigger ? 150 : 0;
      const boomerangTimeSec = activeStop.isBoomerangTrigger ? 4 : 0;
      score += boomerangBonusPts;

      timeRemainingSec = Math.min(
        currentCity.config.timeLimitSec + 22,
        timeRemainingSec + reward.timeBonusSec + boomerangTimeSec,
      );

      // Reset fragile handling & hot express thermal status fresh for the upcoming parcel!
      truckState.fragileIntact = true;
      truckState.thermalTimer = truckState.thermalMaxSec;
      truckState.squashY = 0.82;
      truckState.squashVel = 3.6;
      syncTruckParcelStack();
      lastPathCalcTime = -1;
      refreshForwardRoadPath();

      const dropLabel = activeStop.isBoomerangTrigger
        ? 'Boomerang Rush Bonus!'
        : isBullseye
          ? 'Bullseye Perfect Toss!'
          : reward.thermalBonus > 0
            ? 'Piping-Hot Express!'
            : reward.vipBonus > 0
              ? 'VIP Priority Bonus!'
              : activeStop.parcelKind === ParcelKind.Large
                ? 'Heavy Crate Unloaded!'
                : reward.pristineBonus > 0
                  ? 'Pristine Fragile Bonus!'
                  : viaExpressToss
                    ? 'Express Toss!'
                    : 'Curbside Drop!';

      bannerEvent = {
        id: ++bannerSeq,
        label: dropLabel,
        detail: `+${reward.pointsAwarded + boomerangBonusPts} pts · +${reward.coinsAwarded} Coins`,
        tone:
          isBullseye || reward.isFever || reward.pristineBonus > 0 || viaExpressToss
            ? 'emerald'
            : 'amber',
      };
      bannerTimer = 2.05;

      pokoAudio.playTossWhoosh();
      pokoAudio.playDeliverySuccess(combo, viaExpressToss, isBullseye);

      // Launch visible 3D parcel arc to citizen!
      const stopIdx = activeStop.index - 1;
      const cRig = citizenRigs[stopIdx];
      const cw = gridToWorld(activeStop.citizenCoord, currentCity.totalGridSize);
      const targetX = activeStop.liveCitizenX ?? cw.x;
      const targetZ = activeStop.liveCitizenZ ?? cw.z;

      const fp =
        flyingParcels.find((item) => !item.active) ?? flyingParcels[0];
      fp.active = true;
      fp.t = 0;
      fp.duration = viaExpressToss ? 0.34 : 0.24;
      fp.sx = truckState.x;
      fp.sy = 1.25 + truckState.y;
      fp.sz = truckState.z;
      fp.tx = targetX;
      fp.ty = 0.65;
      fp.tz = targetZ;
      fp.mesh.visible = true;
      fp.onLand = () => {
        if (cRig) {
          cRig.deliveredParcel.visible = true;
          cRig.pinSprite.visible = false;
          cRig.padGroup.visible = false;
        }
        spawnParticleBurst(
          targetX,
          1.0,
          targetZ,
          isBullseye ? 24 : 18,
          [0xffd166, 0xff70a6, 0x70d6ff, 0x9ef01a],
          isBullseye ? 1.35 : 1.15,
        );

        // Customer excitedly tosses 4 spinning 3D Gold Tip Coins onto the Courier Van roof!
        const tipCount = isBullseye ? 4 : 3;
        for (let c = 0; c < tipCount; c++) {
          const fc = flyingCoins[flyingCoinCursor];
          flyingCoinCursor = (flyingCoinCursor + 1) % FLYING_COIN_POOL;
          fc.active = true;
          fc.delay = c * 0.085;
          fc.t = 0;
          fc.duration = 0.44;
          fc.sx = targetX;
          fc.sy = 1.18;
          fc.sz = targetZ;
          fc.coinIdx = c;
          fc.mesh.visible = false;
        }
      };

      emitHudSnapshot();
    }

    // 6. Main Simulation & Render Loop (with software-WebGL afterDraw pacing!)
    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let visualClock = 0;

    function afterDraw(cb: () => void) {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
      const cdDt = Math.min(Math.max(rawDt, 0.001), 0.35);
      visualClock += dt;

      const currentPhase = phaseRef.current;

      // Hit flash decay
      if (hitFlashTimer > 0) {
        hitFlashTimer = Math.max(0, hitFlashTimer - dt);
        for (const mat of truckRig.bodyMaterials) {
          mat.emissive.setHex(hitFlashTimer > 0 ? 0xffffff : 0x000000);
          mat.emissiveIntensity = hitFlashTimer > 0 ? 0.65 : 0;
        }
      }

      // Camera trauma decay
      if (cameraTrauma > 0) {
        cameraTrauma = Math.max(0, cameraTrauma - dt * 1.9);
      }

      if (bannerTimer > 0) {
        bannerTimer = Math.max(0, bannerTimer - cdDt);
        if (bannerTimer <= 0 && bannerEvent) {
          bannerEvent = null;
          emitHudSnapshot();
        }
      }

      // Update continuous speed-reactive van engine hum
      pokoAudio.updateEngine(
        truckState.speed,
        truckState.boostTimer > 0,
        currentPhase === GamePhase.Playing &&
          finishDelayTimer < 0 &&
          !countdownState.isFrozen,
      );

      if (windStreakTimer > 0) {
        windStreakTimer = Math.max(0, windStreakTimer - dt);
      }
      if (treeFlutterCooldown > 0) {
        treeFlutterCooldown = Math.max(0, treeFlutterCooldown - dt);
      }

      if (currentPhase === GamePhase.Title) {
        // Live World Heading-Up Preview behind the parked Courier Van!
        stepTrafficSignals(currentCity.trafficSignals, dt * 0.85);
        stepHazardsAndCollisions(
          currentCity.hazards,
          truckState,
          dt * 0.65,
          currentCity.trafficSignals,
          currentCity,
        );
        stepPedestriansPhysics(
          currentCity.pedestrians,
          currentCity,
          truckState,
          dt * 0.85,
        );
        const titleYaw = truckState.yaw + Math.sin(visualClock * 0.35) * 0.14;
        const dampAlpha = 1 - Math.exp(-3.5 * dt);
        camYaw = wrapAngleRad(camYaw + wrapAngleRad(titleYaw - camYaw) * dampAlpha);
        const leadX = truckState.x + Math.sin(camYaw) * CHASE_LOOK_AHEAD;
        const leadZ = truckState.z + Math.cos(camYaw) * CHASE_LOOK_AHEAD;
        camLookTarget.x += (leadX - camLookTarget.x) * dampAlpha;
        camLookTarget.y += (0.35 - camLookTarget.y) * dampAlpha;
        camLookTarget.z += (leadZ - camLookTarget.z) * dampAlpha;
        camera.position.set(
          camLookTarget.x - Math.sin(camYaw) * CHASE_BACK_DIST,
          camLookTarget.y + CHASE_UP_HEIGHT,
          camLookTarget.z - Math.cos(camYaw) * CHASE_BACK_DIST,
        );
        camera.lookAt(camLookTarget);
        waterPlane.position.set(camLookTarget.x, 0.0, camLookTarget.z);
      } else if (currentPhase === GamePhase.Playing) {
        // Toggle 45-second Choreographed Demo Reel [Bottom HUD Timer Button or T]
        if (touchControls.demoTogglePulse || keysJustPressed.has('KeyT')) {
          touchControls.demoTogglePulse = false;
          keysJustPressed.delete('KeyT');
          if (demoState.active) {
            stopDemoReel();
          } else {
            startDemoReel();
          }
        }

        const demoOut = demoState.active
          ? stepDemoDirector(
              demoState,
              truckState,
              currentCity,
              cachedRoadPath,
              countdownState.stage,
              cdDt,
            )
          : null;

        if (demoOut?.completed) {
          stopDemoReel();
        } else {
          if (demoOut?.changedVehicle) {
            const nextVeh = demoOut.changedVehicle.vehicleId;
            const nextTop = demoOut.changedVehicle.topperId;
            truckRig.setVehicleStyle(nextVeh);
            truckRig.setTopper(nextTop);
            const spec =
              VEHICLE_SPECS[nextVeh] ?? VEHICLE_SPECS[VehicleId.ClassicVan];
            truckState.vehicleId = nextVeh;
            truckState.maxHealth = spec.maxHealth;
            truckState.health = spec.maxHealth;
            truckState.shockAbsorberAvailable = spec.hasShockAbsorber;
            truckState.squashY = 1.15;
            truckState.squashVel = -2.2;
            spawnParticleBurst(
              truckState.x,
              0.7,
              truckState.z,
              18,
              [0xffe524, 0x38bdf8, 0xff70a6, 0xffffff],
              1.1,
            );
          }

          if (demoOut?.changedScene) {
            camYaw = truckState.yaw;
            parcelWobble = createParcelStackWobbleState(truckState.yaw);
            lastPathCalcTime = -1;
            syncTruckParcelStack();
            refreshForwardRoadPath();
            if (demoOut.changedScene === 'scene2_bullseye_fever') {
              combo = 2;
              comboTimer = COMBO_WINDOW_SEC;
              bannerEvent = {
                id: ++bannerSeq,
                label: 'Kei Truck · Bullseye Rush!',
                detail: 'Curbside Toss & 2x Fever Showcase',
                tone: 'emerald',
              };
              bannerTimer = 1.5;
            } else if (demoOut.changedScene === 'scene3_canal_jump') {
              bannerEvent = {
                id: ++bannerSeq,
                label: 'Zippy Trike · Canal Stunt!',
                detail: 'Lining Up on Yellow Jump Ramp!',
                tone: 'amber',
              };
              bannerTimer = 1.4;
            } else if (demoOut.changedScene === 'scene4_clash_shield') {
              pokoAudio.setFeverMode(false);
              combo = 0;
              comboTimer = 0;
              bannerEvent = {
                id: ++bannerSeq,
                label: 'Step-Van · Rush-Hour Clash!',
                detail: '3D Traffic Impact & Shield Pit-Stop',
                tone: 'amber',
              };
              bannerTimer = 1.45;
            } else if (demoOut.changedScene === 'scene5_finale_orbit') {
              finishDelayTimer = -1;
              pendingOutcome = OutcomeKind.None;
              bannerEvent = {
                id: ++bannerSeq,
                label: 'Final Parcel · Stage Finale!',
                detail: 'Delivering Last Package!',
                tone: 'emerald',
              };
              bannerTimer = 1.4;
            }
            emitHudSnapshot();
          }

          if (demoOut?.triggerGarageSaveShowcase) {
            truckState.hasBumperShield = true;
            truckState.health = truckState.maxHealth;
            pokoAudio.playMechanicWrench();
            bannerEvent = {
              id: ++bannerSeq,
              label: 'Wrench Pit-Stop!',
              detail: 'Hull Repaired & Bumper Shield Ready!',
              tone: 'emerald',
            };
            bannerTimer = 1.75;
            spawnParticleBurst(
              truckState.x,
              0.8,
              truckState.z,
              16,
              [0x38bdf8, 0xffdf24, 0xffffff],
              1.05,
            );
            emitHudSnapshot();
          }
        }

        if (spaceBufferTimer > 0) {
          spaceBufferTimer = Math.max(0, spaceBufferTimer - dt);
        }

        // Ambient Sunny & Sunset Songbird Chirps!
        if (currentCity.config.atmosphere !== ShiftAtmosphere.TwilightNeon) {
          birdChirpTimer -= dt;
          if (birdChirpTimer <= 0) {
            birdChirpTimer = 3.8 + Math.random() * 3.8;
            pokoAudio.playBirdChirp(
              currentCity.config.atmosphere === ShiftAtmosphere.SunnyHarbor
                ? 0.82
                : 0.6,
            );
          }
        }

        // Quick-skip flyover if player explicitly presses Enter after overview has begun
        if (
          !demoState.active &&
          countdownState.isFrozen &&
          countdownState.remainingSec > 0.06 &&
          countdownState.remainingSec < countdownState.totalSec - 0.3 &&
          keysJustPressed.has('Enter')
        ) {
          countdownState.remainingSec = 0.03;
        }

        const gasHeldForCountdown = demoState.active
          ? Boolean(demoOut?.gasForCountdown)
          : keysHeld.has('KeyW') ||
            keysHeld.has('ArrowUp') ||
            touchControls.gas ||
            pointerDown;

        if (countdownState.isFrozen || countdownState.stage !== null) {
          const prevRocketStatus = countdownState.rocketStatus;
          const cdEv = stepStartCountdown(
            countdownState,
            gasHeldForCountdown,
            cdDt,
          );

          if (cdEv.changedStage !== null) {
            if (
              cdEv.changedStage === 3 ||
              cdEv.changedStage === 2 ||
              cdEv.changedStage === 1 ||
              cdEv.changedStage === 0
            ) {
              pokoAudio.playCountdownBeep(cdEv.changedStage);
            }
          }

          if (countdownState.isFrozen) {
            // Keep living island animated while shift timer & van position stay frozen!
            stepTrafficSignals(currentCity.trafficSignals, dt * 0.9);
            stepPedestriansPhysics(
              currentCity.pedestrians,
              currentCity,
              truckState,
              dt * 0.9,
            );
            stepMovingCustomers(currentCity.stops, visualClock);

            if (cdEv.triggeredSputter) {
              pokoAudio.playEngineSputter();
              truckState.squashY = 1.09;
              spawnParticleBurst(
                truckState.x - Math.sin(truckState.yaw) * 0.95,
                0.35,
                truckState.z - Math.cos(truckState.yaw) * 0.95,
                6,
                [0x94a3b8, 0xcbd5e1, 0x64748b],
                0.55,
              );
            } else if (cdEv.revIntensity > 0) {
              pokoAudio.playCountdownRev(cdEv.revIntensity);
              truckState.squashY =
                1 + Math.sin(visualClock * 42) * 0.045 * cdEv.revIntensity;
              revExhaustAccum += dt;
              if (revExhaustAccum > 0.11) {
                revExhaustAccum = 0;
                spawnParticleBurst(
                  truckState.x - Math.sin(truckState.yaw) * 0.92,
                  0.34,
                  truckState.z - Math.cos(truckState.yaw) * 0.92,
                  countdownState.rocketStatus === 'primed' ? 4 : 2,
                  countdownState.rocketStatus === 'primed'
                    ? [0xffe524, 0xff9f1c, 0xffffff]
                    : [0xffffff, 0xe2e8f0],
                  0.52,
                );
              }
            } else {
              truckState.squashY += (1 - truckState.squashY) * Math.min(1, dt * 10);
            }
          }

          if (cdEv.justUnlockedGo) {
            if (cdEv.triggeredRocketStart) {
              applyRocketStartToTruck(truckState);
              score += ROCKET_START_POINTS;
              pokoAudio.playRocketStart();
              windStreakTimer = 0.9;
              cameraTrauma = Math.max(cameraTrauma, 0.28);
              spawnParticleBurst(
                truckState.x - Math.sin(truckState.yaw) * 0.95,
                0.42,
                truckState.z - Math.cos(truckState.yaw) * 0.95,
                22,
                [0xffe524, 0xff9f1c, 0x70e4ff, 0xffffff],
                1.35,
              );
              bannerEvent = {
                id: ++bannerSeq,
                label: 'Rocket Start!',
                detail: `+${ROCKET_START_POINTS} pts · Turbo Launch!`,
                tone: 'emerald',
              };
              bannerTimer = 1.95;
            } else if (cdEv.triggeredSputter) {
              pokoAudio.playEngineSputter();
              bannerEvent = {
                id: ++bannerSeq,
                label: 'Early Gas Sputter!',
                detail: 'Hold Gas on "1" Next Time!',
                tone: 'amber',
              };
              bannerTimer = 1.45;
            }
          }

          if (
            cdEv.changedStage !== null ||
            prevRocketStatus !== countdownState.rocketStatus ||
            cdEv.justUnlockedGo
          ) {
            emitHudSnapshot();
          }
        }

        // Simulation-level Hitstop on heavy impacts
        let simDt = countdownState.isFrozen ? 0 : dt;
        if (hitstopTimer > 0) {
          hitstopTimer = Math.max(0, hitstopTimer - dt);
          simDt = 0;
        }

        if (simDt > 0 && finishDelayTimer < 0) {
          elapsedSec += simDt;
          timeRemainingSec = Math.max(0, timeRemainingSec - simDt);

          // Countdown tick audio cue on final 10 seconds
          const ceilSec = Math.ceil(timeRemainingSec);
          if (ceilSec > 0 && ceilSec <= 10 && ceilSec !== lastTickedSecond) {
            lastTickedSecond = ceilSec;
            pokoAudio.playTimerTick(ceilSec <= 5);
          }

          if (comboTimer > 0) {
            comboTimer = Math.max(0, comboTimer - simDt);
            if (comboTimer <= 0) {
              combo = 0;
              pokoAudio.setFeverMode(false);
            }
          }

          // Google Maps Heading-Up Vehicle-Relative Controls (Keyboard + Multi-Touch Mobile Deck, or Demo Autopilot):
          let throttle = 0;
          let steer = 0;
          let wantsHorn = false;
          if (demoState.active && demoOut) {
            throttle = demoOut.throttle;
            steer = demoOut.steer;
            wantsHorn = demoOut.wantsHorn;
            touchControls.hornPulse = false;
          } else {
            if (keysHeld.has('KeyW') || keysHeld.has('ArrowUp') || touchControls.gas) {
              throttle += 1;
            }
            if (keysHeld.has('KeyS') || keysHeld.has('ArrowDown') || touchControls.brake) {
              throttle -= 1;
            }
            if (keysHeld.has('KeyA') || keysHeld.has('ArrowLeft')) steer -= 1;
            if (keysHeld.has('KeyD') || keysHeld.has('ArrowRight')) steer += 1;
            if (touchControls.steerTouchActive) {
              steer += touchControls.steerAnalog;
            } else {
              if (touchControls.steerLeft) steer -= 1;
              if (touchControls.steerRight) steer += 1;
            }
            throttle = Math.max(-1, Math.min(1, throttle));
            steer = Math.max(-1, Math.min(1, steer));

            wantsHorn =
              keysJustPressed.has('KeyQ') ||
              keysJustPressed.has('KeyH') ||
              touchControls.hornPulse;
            touchControls.hornPulse = false;
          }

          // Musical Horn [Q / H / Mobile Horn Button]
          if (wantsHorn) {
            const hornRes = triggerMusicalHorn(
              truckState,
              currentCity.hazards,
              currentCity.pedestrians,
              currentCity.duckCrossings,
            );
            if (hornRes) {
              pokoAudio.playMusicalHorn();
              truckState.squashY = 1.12;
              truckState.squashVel = -2.0;
              if (hornRes.calmedScooters > 0 || hornRes.hurriedDucks > 0) {
                bannerEvent = {
                  id: ++bannerSeq,
                  label:
                    hornRes.calmedScooters > 0
                      ? 'Honk! Scooters Calmed!'
                      : 'Quack! Ducks Hurrying!',
                  detail: 'Friendly Musical Horn',
                  tone: 'emerald',
                };
                bannerTimer = 1.45;
                emitHudSnapshot();
              }
            }
          }

          const anyTouchDeckHeld =
            touchControls.gas ||
            touchControls.brake ||
            touchControls.steerTouchActive ||
            touchControls.steerLeft ||
            touchControls.steerRight;

          // Optional pointer hold-to-steer on the road (projected relative to van heading)
          if (
            !demoState.active &&
            !anyTouchDeckHeld &&
            Math.abs(throttle) < 0.01 &&
            Math.abs(steer) < 0.01 &&
            pointerDown
          ) {
            const worldPt = screenToWorldOnRoad(pointerClientX, pointerClientY);
            if (worldPt) {
              const dx = worldPt.x - truckState.x;
              const dz = worldPt.z - truckState.z;
              const dist = Math.hypot(dx, dz);
              if (dist > 0.45) {
                const fwdX = Math.sin(truckState.yaw);
                const fwdZ = Math.cos(truckState.yaw);
                const rightX = -Math.cos(truckState.yaw);
                const rightZ = Math.sin(truckState.yaw);
                const fwdDot = (dx * fwdX + dz * fwdZ) / dist;
                const rightDot = (dx * rightX + dz * rightZ) / dist;
                throttle = fwdDot < -0.35 ? -1 : 1;
                steer = Math.max(-1, Math.min(1, rightDot * 1.8));
              }
            }
          }

          const activeStop = getActiveStop(currentCity.stops);
          if (activeStop?.parcelKind === ParcelKind.HotExpress) {
            truckState.thermalTimer = Math.max(
              0,
              truckState.thermalTimer - simDt,
            );
          }

          const preElig = checkDeliveryEligibility(
            truckState,
            activeStop,
            currentCity.totalGridSize,
          );

          const usedTouchDeliver = demoState.active
            ? Boolean(demoOut?.wantsDeliver)
            : touchControls.deliverPulse;
          touchControls.deliverPulse = false;
          if (usedTouchDeliver) {
            spaceBufferTimer = 0.16;
          }

          // Consume buffered Space/E/Touch-Deliver: if in Express Toss range, toss parcel! Otherwise trigger Turbo Boost!
          let wantsBoost = demoState.active
            ? Boolean(demoOut?.wantsBoost)
            : keysJustPressed.has('ShiftLeft') ||
              keysJustPressed.has('ShiftRight') ||
              touchControls.boostPulse;
          touchControls.boostPulse = false;
          if (spaceBufferTimer > 0) {
            const demoBlockEarlyFinalDrop =
              demoState.active &&
              demoState.sceneId !== 'scene5_finale_orbit' &&
              currentCity.stops.filter((s) => !s.delivered).length <= 1;
            if (preElig.canExpressToss && !demoBlockEarlyFinalDrop) {
              spaceBufferTimer = 0;
              triggerParcelDelivery(true, preElig.canBullseyeToss);
            } else if (
              !demoState.active &&
              (keysJustPressed.has('Space') || usedTouchDeliver) &&
              truckState.boostCooldown <= 0
            ) {
              spaceBufferTimer = 0;
              wantsBoost = true;
            }
          }

          // Step intersection traffic signals (or force green during Green-Wave transponder!)
          stepTrafficSignals(currentCity.trafficSignals, simDt);

          const physEvents = stepTruckPhysics(
            truckState,
            {
              throttle,
              steer,
              wantsBoost,
              wantsDrift: demoState.active
                ? Boolean(demoOut?.wantsDrift)
                : keysHeld.has('KeyC'),
            },
            currentCity,
            simDt,
          );

          // Leafy boulevard breeze & songbird flutter when zooming past park trees!
          if (truckState.speed > 6.2 && treeFlutterCooldown <= 0) {
            for (let ti = 0; ti < currentCity.trees.length; ti++) {
              const tr = currentCity.trees[ti];
              if (tr.variant === 'bush') continue;
              const dTree = Math.hypot(truckState.x - tr.x, truckState.z - tr.z);
              if (dTree < 2.25) {
                treeFlutterCooldown = 2.8;
                spawnParticleBurst(
                  tr.x,
                  1.25,
                  tr.z,
                  5,
                  [tr.tintHex, 0xfef08a, 0xffffff],
                  0.62,
                );
                if (
                  currentCity.config.atmosphere !== ShiftAtmosphere.TwilightNeon
                ) {
                  pokoAudio.playBirdChirp(0.78);
                }
                break;
              }
            }
          }

          if (physEvents.issuedTicket) {
            const isWrongWayTicket = physEvents.issuedTicket === 'wrong_way';
            const penaltyPts = isWrongWayTicket ? 75 : 60;
            score = Math.max(0, score - penaltyPts);
            timeRemainingSec = Math.max(1, timeRemainingSec - 3);
            combo = 0;
            comboTimer = 0;
            pokoAudio.setFeverMode(false);
            pokoAudio.playTicketCitation();
            cameraTrauma = Math.max(cameraTrauma, 0.34);
            hitFlashTimer = 0.07;
            bannerEvent = {
              id: ++bannerSeq,
              label: isWrongWayTicket
                ? 'Wrong-Way Ticket!'
                : 'Red-Light Ticket!',
              detail: `-${penaltyPts} pts · -3s`,
              tone: 'rose',
            };
            bannerTimer = 2.35;
            emitHudSnapshot();
          } else if (physEvents.activatedJumpRamp) {
            score += 80;
            pokoAudio.playJumpLaunch();
            windStreakTimer = Math.max(windStreakTimer, 0.65);
            cameraTrauma = Math.max(cameraTrauma, 0.28);
            bannerEvent = {
              id: ++bannerSeq,
              label: 'Canal Ramp Jump!',
              detail: '+80 pts · Air Stunt!',
              tone: 'emerald',
            };
            bannerTimer = 1.65;
            spawnParticleBurst(
              truckState.x,
              0.45,
              truckState.z,
              14,
              [0xffdf24, 0xffffff, 0x38bdf8],
              1.1,
            );
            emitHudSnapshot();
          } else if (physEvents.pickedGreenWave) {
            score += 75;
            pokoAudio.playCoffeePickup();
            bannerEvent = {
              id: ++bannerSeq,
              label: 'Green-Wave Transponder!',
              detail: '+75 pts · Signals Cleared 7.5s',
              tone: 'emerald',
            };
            bannerTimer = 1.85;
            spawnParticleBurst(
              truckState.x,
              0.65,
              truckState.z,
              14,
              [0x10b981, 0xfef08a, 0xffffff],
              1.0,
            );
            emitHudSnapshot();
          } else if (physEvents.splashedHydrantPos) {
            score += 40;
            pokoAudio.playHydrantSplash();
            spawnParticleBurst(
              physEvents.splashedHydrantPos.x,
              0.55,
              physEvents.splashedHydrantPos.z,
              18,
              [0x38bdf8, 0xbae6fd, 0xffffff],
              1.25,
            );
          } else if (
            physEvents.activatedManualBoost ||
            physEvents.triggeredBoostPad
          ) {
            pokoAudio.playBoost();
            windStreakTimer = Math.max(windStreakTimer, 0.45);
            cameraTrauma = Math.max(cameraTrauma, 0.24);
            spawnParticleBurst(
              truckState.x,
              0.38,
              truckState.z,
              10,
              [0xffffff, 0x70d6ff, 0x38e4ae],
              0.85,
            );
          }

          if (physEvents.crashEvents.length > 0) {
            const wallEv = physEvents.crashEvents[0];
            spawnCrashBurstEffect(wallEv);
            pokoAudio.playCrashImpact(wallEv.severity, wallEv.kind);
            cameraTrauma = Math.max(
              cameraTrauma,
              wallEv.severity === 'crash' ? 0.54 : 0.3,
            );
            hitFlashTimer = Math.max(
              hitFlashTimer,
              wallEv.severity === 'crash' ? 0.08 : 0.05,
            );
            if (wallEv.severity === 'crash') {
              hitstopTimer = Math.max(hitstopTimer, 0.035);
            }
            if (!physEvents.issuedTicket) {
              bannerEvent = {
                id: ++bannerSeq,
                label: physEvents.absorbedCurbWithShock
                  ? 'Shock-Absorber Saved Cargo!'
                  : wallEv.label,
                detail: physEvents.absorbedCurbWithShock
                  ? 'Step-Van Heavy Suspension'
                  : wallEv.kind === 'gate'
                    ? 'Wait for Bridge or Hit Ramp!'
                    : 'Bumper Rebound!',
                tone: wallEv.severity === 'crash' ? 'rose' : 'amber',
              };
              bannerTimer = 1.45;
              emitHudSnapshot();
            }
          } else if (physEvents.absorbedCurbWithShock) {
            pokoAudio.playCurbBump();
            bannerEvent = {
              id: ++bannerSeq,
              label: 'Shock-Absorber Saved Fragile!',
              detail: 'Step-Van Heavy Suspension',
              tone: 'amber',
            };
            bannerTimer = 1.4;
          } else if (physEvents.hitCurb) {
            pokoAudio.playCurbBump();
          }

          // Check Roadside Drive-Thru Espresso Boost Kiosks!
          const pickedCoffee = stepCoffeeKiosks(
            currentCity.coffeeKiosks,
            truckState,
            simDt,
          );
          if (pickedCoffee) {
            score += 65;
            timeRemainingSec = Math.min(
              currentCity.config.timeLimitSec + 22,
              timeRemainingSec + 3,
            );
            recordQuestEvent('pitstops_used', 1);
            pokoAudio.playCoffeePickup();
            bannerEvent = {
              id: ++bannerSeq,
              label: 'Espresso Boost!',
              detail: '+65 pts · +3s & Full Turbo',
              tone: 'emerald',
            };
            bannerTimer = 1.95;
            spawnParticleBurst(
              pickedCoffee.roadX,
              0.8,
              pickedCoffee.roadZ,
              14,
              [0x34d399, 0xfde68a, 0xffffff],
              1.0,
            );
            emitHudSnapshot();
          }

          // Check Wrench Mechanic Pit-Stop Garages!
          const servicedGarage = stepMechanicGarages(
            currentCity.mechanicGarages,
            truckState,
            simDt,
          );
          if (servicedGarage) {
            score += 55;
            recordQuestEvent('pitstops_used', 1);
            pokoAudio.playMechanicWrench();
            bannerEvent = {
              id: ++bannerSeq,
              label: 'Wrench Pit-Stop!',
              detail: '+1 Hull HP & Bumper Shield',
              tone: 'emerald',
            };
            bannerTimer = 1.95;
            spawnParticleBurst(
              servicedGarage.roadX,
              0.8,
              servicedGarage.roadZ,
              16,
              [0x38bdf8, 0xffdf24, 0xffffff],
              1.05,
            );
            emitHudSnapshot();
          }

          // Step Duckling Family Crossings + Polite Yield Bonus!
          const politeDuck = stepDuckCrossings(
            currentCity.duckCrossings,
            truckState,
            simDt,
          );
          if (politeDuck) {
            score += 95;
            awardRunCoins(30);
            pokoAudio.playDuckQuack();
            bannerEvent = {
              id: ++bannerSeq,
              label: 'Polite Duck Yield!',
              detail: '+95 pts · +30 Coins',
              tone: 'emerald',
            };
            bannerTimer = 1.85;
            emitHudSnapshot();
          }

          // Step Moving Porch Customers & Rival Courier ("Zoomy Blitz")
          stepMovingCustomers(currentCity.stops, visualClock);
          const rivalStatus = stepRivalCourier(
            currentCity.rivalCourier,
            truckState,
            simDt,
          );
          if (rivalStatus === 'player_claimed' && currentCity.rivalCourier) {
            score += 250;
            awardRunCoins(75);
            pokoAudio.playSpinReward();
            bannerEvent = {
              id: ++bannerSeq,
              label: 'Beat Zoomy Blitz!',
              detail: '+250 pts · +75 Bonus Coins',
              tone: 'emerald',
            };
            bannerTimer = 2.15;
            spawnParticleBurst(
              currentCity.rivalCourier.bonusDropPos.x,
              0.9,
              currentCity.rivalCourier.bonusDropPos.z,
              22,
              [0xffdf24, 0xa855f7, 0xffffff],
              1.3,
            );
            emitHudSnapshot();
          }

          // Auto-drop check if player drove onto the golden delivery pad (respecting Large Crate brake check!)
          const postStop = getActiveStop(currentCity.stops);
          const postElig = checkDeliveryEligibility(
            truckState,
            postStop,
            currentCity.totalGridSize,
          );
          const demoKeepLastStopForFinale =
            demoState.active &&
            demoState.sceneId !== 'scene5_finale_orbit' &&
            currentCity.stops.filter((s) => !s.delivered).length <= 1;
          if (postElig.canAutoDrop && !demoKeepLastStopForFinale) {
            triggerParcelDelivery(false, postElig.canBullseyeToss);
          }

          // Step obstacle-aware sidewalk & plaza pedestrians
          stepPedestriansPhysics(
            currentCity.pedestrians,
            currentCity,
            truckState,
            simDt,
          );

          // Step traffic & bridge hazards + Solid 3D Vehicle Separation, Crash Events & Ambient Car Honks!
          const hazEvents = stepHazardsAndCollisions(
            currentCity.hazards,
            truckState,
            simDt,
            currentCity.trafficSignals,
            currentCity,
          );
          for (const wh of hazEvents.startedWindups) {
            pokoAudio.playWindupTelegraph(wh.kind === HazardKind.BridgeGate);
          }
          for (const hev of hazEvents.honkEvents) {
            const distH = Math.hypot(hev.x - truckState.x, hev.z - truckState.z);
            if (distH < 34) {
              const volScale = Math.max(0.22, 1 - distH / 36);
              pokoAudio.playAmbientCarHorn(hev.isBus, volScale);
            }
          }

          let playerCrashEv: CrashEvent | null = null;
          for (const cev of hazEvents.crashEvents) {
            if (cev.involvesPlayer) {
              playerCrashEv = cev;
              spawnCrashBurstEffect(cev);
            } else if (
              Math.hypot(cev.x - truckState.x, cev.z - truckState.z) < 28
            ) {
              spawnCrashBurstEffect(cev);
              if (Math.hypot(cev.x - truckState.x, cev.z - truckState.z) < 22) {
                pokoAudio.playAiFenderBender();
              }
            }
          }

          if (hazEvents.shieldAbsorbed) {
            pokoAudio.playCrashImpact('bump', 'vehicle');
            pokoAudio.playMechanicWrench();
            hitFlashTimer = 0.06;
            cameraTrauma = Math.max(cameraTrauma, 0.38);
            bannerEvent = {
              id: ++bannerSeq,
              label: 'Bumper Shield Saved You!',
              detail: 'Combo & Hull Preserved',
              tone: 'amber',
            };
            bannerTimer = 1.75;
            spawnParticleBurst(
              truckState.x,
              0.7,
              truckState.z,
              16,
              [0x38bdf8, 0xffffff, 0xfef08a],
              1.1,
            );
            emitHudSnapshot();
          } else if (hazEvents.playerHitBy) {
            pokoAudio.playCrashImpact('crash', 'vehicle');
            pokoAudio.setFeverMode(false);
            hitstopTimer = 0.055; // Crisp 55ms heavy impact hitstop!
            hitFlashTimer = 0.095;
            cameraTrauma = Math.min(1.0, cameraTrauma + 0.72);
            combo = 0;
            comboTimer = 0;
            bannerEvent = {
              id: ++bannerSeq,
              label: playerCrashEv?.label ?? 'Traffic Crash!',
              detail: `${truckState.health}/${truckState.maxHealth} Van Hull`,
              tone: 'rose',
            };
            bannerTimer = 1.8;
            emitHudSnapshot();
          } else if (playerCrashEv) {
            pokoAudio.playCrashImpact(playerCrashEv.severity, playerCrashEv.kind);
            hitFlashTimer = 0.07;
            cameraTrauma = Math.max(cameraTrauma, 0.44);
            if (playerCrashEv.kind === 'rival') {
              hitstopTimer = Math.max(hitstopTimer, 0.038);
            }
            bannerEvent = {
              id: ++bannerSeq,
              label: playerCrashEv.label,
              detail:
                playerCrashEv.kind === 'rival'
                  ? 'Trading Paint with Rival!'
                  : 'Solid Bumper Bounce!',
              tone: 'amber',
            };
            bannerTimer = 1.45;
            emitHudSnapshot();
          } else if (hazEvents.nearMissCount > 0) {
            const pts = 45 * hazEvents.nearMissCount;
            score += pts;
            recordQuestEvent('near_misses', hazEvents.nearMissCount);
            pokoAudio.playNearMissWhoosh();
            windStreakTimer = Math.max(windStreakTimer, 0.56);
            if (!bannerEvent || bannerTimer < 0.6) {
              bannerEvent = {
                id: ++bannerSeq,
                label: 'Slipstream Near-Miss!',
                detail: `+${pts} pts · +Turbo Charge`,
                tone: 'emerald',
              };
              bannerTimer = 1.25;
              emitHudSnapshot();
            }
          }

          // Express Fever rainbow exhaust sparkles + Sunshower raindrops!
          if (combo >= FEVER_COMBO_THRESHOLD && comboTimer > 0 && truckState.speed > 1.5) {
            feverTrailAccum += simDt;
            if (feverTrailAccum > 0.09) {
              feverTrailAccum = 0;
              spawnParticleBurst(
                truckState.x - Math.sin(truckState.yaw) * 0.9,
                0.35 + truckState.y,
                truckState.z - Math.cos(truckState.yaw) * 0.9,
                2,
                [0xffdf24, 0xff70a6, 0x38bdf8, 0x9ef01a],
                0.45,
              );
            }
          }
          if (currentCity.config.hasSunshower) {
            sunshowerAccum += simDt;
            if (sunshowerAccum > 0.14) {
              sunshowerAccum = 0;
              spawnParticleBurst(
                truckState.x + (Math.random() - 0.5) * 14,
                3.2,
                truckState.z + (Math.random() - 0.5) * 14,
                2,
                [0xbae6fd, 0x7dd3fc],
                0.35,
              );
            }
          }

          // Check Victory / Defeat Outcome
          const outcome = evaluateRunStatus(
            currentCity.stops,
            timeRemainingSec,
            truckState.health,
          );
          if (outcome !== OutcomeKind.None) {
            pendingOutcome = outcome;
            finishDelayTimer = outcome === OutcomeKind.Victory ? 1.55 : 0.52;
            victoryOrbitAngle = 0;
            victoryConfettiAccum = 0;
            pokoAudio.setFeverMode(false);
            if (outcome === OutcomeKind.Victory) {
              // Time-left mastery bonus + Stage Clear Confetti Finale!
              score += Math.round(timeRemainingSec * 15);
              pokoAudio.playStageClear();
              spawnParticleBurst(
                truckState.x,
                1.4,
                truckState.z,
                28,
                [0xffe524, 0xff70a6, 0x38bdf8, 0x9ef01a, 0xa855f7],
                1.45,
              );
              bannerEvent = {
                id: ++bannerSeq,
                label: 'Stage Complete!',
                detail: 'All Parcels Delivered!',
                tone: 'emerald',
              };
              bannerTimer = 1.6;
            } else {
              pokoAudio.playGameOver();
            }
            emitHudSnapshot();
          }
        } else if (finishDelayTimer >= 0) {
          finishDelayTimer -= dt;
          if (pendingOutcome === OutcomeKind.Victory) {
            // Smooth celebratory coast + Orbiting Confetti Finale!
            truckState.speed *= Math.exp(-4.5 * dt);
            victoryOrbitAngle += dt * 1.45;
            victoryConfettiAccum += dt;
            if (victoryConfettiAccum > 0.28) {
              victoryConfettiAccum = 0;
              spawnParticleBurst(
                truckState.x + (Math.random() - 0.5) * 2.4,
                1.5,
                truckState.z + (Math.random() - 0.5) * 2.4,
                16,
                [0xffe524, 0xff70a6, 0x38bdf8, 0x9ef01a, 0xffffff],
                1.25,
              );
            }
          }
          if (finishDelayTimer <= 0) {
            if (demoState.active) {
              // Hold celebratory confetti & Victory Orbit inside the demo until 45s completes!
              finishDelayTimer = 0.25;
            } else {
              finishDelayTimer = -1;
              clearAllInputs();
              pokoAudio.setFeverMode(false);
              const deliveredCount = currentCity.stops.filter(
                (s) => s.delivered,
              ).length;
              const finalScore = Math.round(score);
              const ceilLeft = Math.max(0, Math.ceil(timeRemainingSec));
              const runRewards = computeRunRewards(
                pendingOutcome,
                finalScore,
                deliveredCount,
                truckState.ticketsCount,
                ceilLeft,
              );
              onRunFinishedRef.current({
                level: currentCity.config.level,
                districtName: currentCity.config.districtName,
                outcome: pendingOutcome,
                score: finalScore,
                bestScore: Math.max(bestScoreRef.current, finalScore),
                coinsEarned: runRewards.coinsEarned,
                starsEarned: runRewards.starsEarned,
                earnedSpinToken: runRewards.earnedSpinToken,
                deliveredCount,
                totalStops: currentCity.stops.length,
                bullseyeCount,
                timeRemainingSec: ceilLeft,
                elapsedSec: Math.round(elapsedSec),
                maxCombo,
                healthRemaining: truckState.health,
                ticketsCount: truckState.ticketsCount,
              });
            }
          }
        }

        // Camera Framing: Bird's-Eye 3-2-1 Island Swoop / Demo Drone Zoom -> Heading-Up Chase -> Victory Orbit!
        const isPortraitMobile = camera.aspect < 0.95;
        const zoomScale = demoState.active ? demoState.cameraZoomScale : 1;
        const yawOffset = demoState.active ? demoState.cameraYawOffset : 0;
        const activeLookAhead =
          (isPortraitMobile ? 6.1 : CHASE_LOOK_AHEAD) *
          (demoState.active ? 0.8 + 0.2 * zoomScale : 1);
        const activeBackDist =
          (isPortraitMobile ? CHASE_BACK_DIST * 1.07 : CHASE_BACK_DIST) *
          zoomScale;
        const activeUpHeight =
          (isPortraitMobile ? CHASE_UP_HEIGHT * 1.07 : CHASE_UP_HEIGHT) *
          zoomScale;
        const targetLookY = isPortraitMobile ? -0.45 : 0.35;

        const demoZoomOut = demoState.active ? demoState.transitionZoomAlpha : 0;
        const swoopA = Math.min(countdownState.swoopAlpha, 1 - demoZoomOut);
        // Keep fog pushed back during high Bird's-Eye overview so the entire miniature island sparkles crisply!
        if (scene.fog instanceof THREE.Fog) {
          const baseFogNear =
            currentCity.config.atmosphere === ShiftAtmosphere.TwilightNeon
              ? 54
              : 58;
          const baseFogFar =
            currentCity.config.atmosphere === ShiftAtmosphere.TwilightNeon
              ? 122
              : 128;
          const ovwFactor = 1 - swoopA;
          scene.fog.near = baseFogNear + ovwFactor * 98;
          scene.fog.far = baseFogFar + ovwFactor * 165;
        }

        if (swoopA < 0.999) {
          // Cinematic Bird's-Eye Island Overview diving smoothly to/from street or Victory Orbit!
          const inVictory =
            finishDelayTimer >= 0 && pendingOutcome === OutcomeKind.Victory;
          camYaw = wrapAngleRad(truckState.yaw + yawOffset);
          let chaseLeadX = truckState.x + Math.sin(camYaw) * activeLookAhead;
          let chaseLeadY = targetLookY;
          let chaseLeadZ = truckState.z + Math.cos(camYaw) * activeLookAhead;
          let chaseCamX = chaseLeadX - Math.sin(camYaw) * activeBackDist;
          let chaseCamY = targetLookY + activeUpHeight;
          let chaseCamZ = chaseLeadZ - Math.cos(camYaw) * activeBackDist;

          if (inVictory) {
            const orbitYaw = camYaw + victoryOrbitAngle;
            const orbitLerp = Math.min(1, victoryOrbitAngle / 0.8);
            const vicDist = activeBackDist * (1 - 0.24 * orbitLerp);
            const vicHeight = activeUpHeight * (1 - 0.28 * orbitLerp);
            chaseLeadX = truckState.x;
            chaseLeadY = 0.55;
            chaseLeadZ = truckState.z;
            chaseCamX = chaseLeadX - Math.sin(orbitYaw) * vicDist;
            chaseCamY = chaseLeadY + vicHeight;
            chaseCamZ = chaseLeadZ - Math.cos(orbitYaw) * vicDist;
          }

          const islandSpan = currentCity.totalGridSize * TILE_SIZE;
          const ovwYaw = demoState.active
            ? Math.PI / 2 - 0.34 + demoState.elapsedSec * 0.04
            : truckState.yaw - 0.34 * (1 - swoopA);
          const ovwHeight = islandSpan * (isPortraitMobile ? 1.56 : 1.44);
          const ovwBack = islandSpan * (isPortraitMobile ? 1.04 : 0.94);
          const ovwCamX = -Math.sin(ovwYaw) * ovwBack;
          const ovwCamY = ovwHeight;
          const ovwCamZ = -Math.cos(ovwYaw) * ovwBack;

          const arcLift = Math.sin(swoopA * Math.PI) * 4.5;

          camLookTarget.set(
            chaseLeadX * swoopA,
            0.4 * (1 - swoopA) + chaseLeadY * swoopA,
            chaseLeadZ * swoopA,
          );
          camera.position.set(
            ovwCamX + (chaseCamX - ovwCamX) * swoopA,
            ovwCamY + (chaseCamY - ovwCamY) * swoopA + arcLift,
            ovwCamZ + (chaseCamZ - ovwCamZ) * swoopA,
          );
          camera.lookAt(camLookTarget);
        } else if (
          finishDelayTimer >= 0 &&
          pendingOutcome === OutcomeKind.Victory
        ) {
          // Celebratory Stage-Clear 3D Victory Orbit around the Courier Van!
          const orbitYaw = camYaw + victoryOrbitAngle;
          const orbitLerp = Math.min(1, victoryOrbitAngle / 0.8);
          const vicDist = activeBackDist * (1 - 0.24 * orbitLerp);
          const vicHeight = activeUpHeight * (1 - 0.28 * orbitLerp);
          const followDamp = 1 - Math.exp(-8.0 * dt);
          camLookTarget.x += (truckState.x - camLookTarget.x) * followDamp;
          camLookTarget.y += (0.55 - camLookTarget.y) * followDamp;
          camLookTarget.z += (truckState.z - camLookTarget.z) * followDamp;
          camera.position.set(
            camLookTarget.x - Math.sin(orbitYaw) * vicDist,
            camLookTarget.y + vicHeight,
            camLookTarget.z - Math.cos(orbitYaw) * vicDist,
          );
          camera.lookAt(camLookTarget);
        } else {
          const desiredCamYaw = wrapAngleRad(truckState.yaw + yawOffset);
          const yawDamp = 1 - Math.exp(-7.5 * dt);
          camYaw = wrapAngleRad(
            camYaw + wrapAngleRad(desiredCamYaw - camYaw) * yawDamp,
          );

          const followDamp = 1 - Math.exp(-9.5 * dt);
          const leadX = truckState.x + Math.sin(camYaw) * activeLookAhead;
          const leadZ = truckState.z + Math.cos(camYaw) * activeLookAhead;
          camLookTarget.x += (leadX - camLookTarget.x) * followDamp;
          camLookTarget.y += (targetLookY - camLookTarget.y) * followDamp;
          camLookTarget.z += (leadZ - camLookTarget.z) * followDamp;

          const rightX = -Math.cos(camYaw);
          const rightZ = Math.sin(camYaw);
          const shakeAmt = cameraTrauma * cameraTrauma * 0.45;
          const shakeLat =
            shakeAmt > 0.001 ? Math.sin(visualClock * 53) * shakeAmt : 0;
          const shakeFwd =
            shakeAmt > 0.001 ? Math.cos(visualClock * 47) * shakeAmt : 0;

          camera.position.set(
            camLookTarget.x -
              Math.sin(camYaw) * activeBackDist +
              rightX * shakeLat +
              Math.sin(camYaw) * shakeFwd,
            camLookTarget.y + activeUpHeight,
            camLookTarget.z -
              Math.cos(camYaw) * activeBackDist +
              rightZ * shakeLat +
              Math.cos(camYaw) * shakeFwd,
          );
          camera.lookAt(camLookTarget);
        }

        waterPlane.position.set(camLookTarget.x, 0.0, camLookTarget.z);
        sunLight.position.set(camLookTarget.x + 18, 32, camLookTarget.z + 14);
        sunLight.target.position.copy(camLookTarget);

        // Keep minimap snapshot smooth every frame while throttling React HUD state to ~8Hz
        syncMinimapSnapshot();
        if (now - lastHudEmitTime > 125) {
          lastHudEmitTime = now;
          emitHudSnapshot();
        }
      }

      keysJustPressed.clear();

      // 7. Update Visual Meshes (Truck Gait/Roll/Pitch/Steer/Jump/Shield, Citizens, Pedestrians, Hazards, Particles)
      truckRig.root.position.set(
        truckState.x,
        0.24 + truckState.y,
        truckState.z,
      );
      truckRig.root.rotation.y = truckState.yaw;
      // Keep contact shadow anchored flush to the road surface even while airborne off a Canal Ramp!
      truckRig.shadowMesh.position.y = 0.025 - truckState.y;
      const airShadowScale = Math.max(0.62, 1 - truckState.y * 0.22);
      truckRig.shadowMesh.scale.set(airShadowScale, airShadowScale, 1);

      truckRig.shieldRing.visible = truckState.hasBumperShield;
      if (truckState.hasBumperShield) {
        truckRig.shieldRing.rotation.z = visualClock * 1.8;
      }
      truckRig.topperPivot.rotation.y = Math.sin(visualClock * 2.4) * 0.16;

      // Blink gently during invulnerability frames
      truckRig.root.visible =
        truckState.invulnTimer <= 0 ||
        Math.floor(truckState.invulnTimer * 16) % 2 === 0;

      // Distance-synced suspension bounce + body roll/pitch + squash-and-stretch + front wheel steering!
      const gaitBob =
        truckState.y > 0.05
          ? 0
          : Math.abs(Math.sin(truckState.distanceTraveled * 2.8)) *
            Math.min(1, truckState.speed / 5) *
            0.055;
      const invScaleXZ = 1 / Math.sqrt(truckState.squashY);
      truckRig.bodyTiltGroup.position.y = gaitBob;
      truckRig.bodyTiltGroup.rotation.z = truckState.rollAngle;
      truckRig.bodyTiltGroup.rotation.x =
        truckState.pitchAngle - Math.min(0.22, truckState.vy * 0.022);
      truckRig.bodyTiltGroup.scale.set(
        invScaleXZ,
        truckState.squashY,
        invScaleXZ,
      );
      for (const sg of truckRig.frontWheelSteerGroups) {
        sg.rotation.y = truckState.steerAngle;
      }
      for (const w of truckRig.wheels) {
        w.rotation.x = truckState.distanceTraveled * 2.4;
      }
      // Glow brake taillights bright crimson when braking!
      truckRig.taillightMat.emissiveIntensity = truckState.isBraking ? 1.9 : 0.45;

      // Wobbly Roof-Rack Parcel Stack Spring-Damper Sway!
      stepParcelStackWobble(parcelWobble, truckState, dt);
      for (let pi = 0; pi < truckRig.parcelBoxes.length; pi++) {
        const box = truckRig.parcelBoxes[pi];
        if (!box.visible) continue;
        const layer = (box.userData.layer as number) ?? Math.floor(pi / 2);
        const bx = (box.userData.baseX as number) ?? 0;
        const by = (box.userData.baseY as number) ?? 1.13;
        const bz = (box.userData.baseZ as number) ?? -0.32;
        const brotY = (box.userData.baseRotY as number) ?? 0;
        box.position.x = bx - Math.sin(parcelWobble.roll) * layer * 0.14;
        box.position.y = by + parcelWobble.bounceY * (1 + layer * 0.35);
        box.position.z = bz + Math.sin(parcelWobble.pitch) * layer * 0.12;
        box.rotation.z = parcelWobble.roll * (0.45 + layer * 0.25);
        box.rotation.x = parcelWobble.pitch * (0.42 + layer * 0.22);
        box.rotation.y = brotY + parcelWobble.roll * 0.12 * (pi % 2 === 0 ? 1 : -1);
      }

      // 3D Near-Miss & Rocket-Start Slipstream Wind-Streak Ribbons!
      windStreakRig.root.visible = windStreakTimer > 0;
      if (windStreakTimer > 0) {
        const wsPulse = Math.min(1, windStreakTimer / 0.28);
        const streakSlide = ((visualClock * 18) % 1) * 0.75 - 0.35;
        windStreakRig.leftRibbon.position.z = -streakSlide;
        windStreakRig.rightRibbon.position.z = -streakSlide * 0.85;
        windStreakRig.leftRibbon.scale.set(1, 1, 0.65 + wsPulse * 0.65);
        windStreakRig.rightRibbon.scale.set(1, 1, 0.65 + wsPulse * 0.65);
      }

      // Overview Sky-Beacons scale tall during 3-2-1 Bird's-Eye Swoop and tuck down smoothly when driving!
      const overviewVisibilityFactor = Math.max(0, 1 - countdownState.swoopAlpha * 1.05);
      for (const rb of rampBeaconGroups) {
        rb.visible = overviewVisibilityFactor > 0.04;
        if (rb.visible) {
          rb.scale.set(
            0.78,
            0.25 + overviewVisibilityFactor * 0.95,
            0.78,
          );
        }
      }

      // Update Articulated Waiting Customers (plus Excitement Charm, Overview Beam & Bullseye Ring!)
      const activeStop = getActiveStop(currentCity.stops);
      citizenRigs.forEach((cr, idx) => {
        const stop = currentCity.stops[idx];
        if (!stop) return;
        if (
          stop.liveCitizenX !== undefined &&
          stop.liveCitizenZ !== undefined
        ) {
          cr.citizenGroup.position.set(
            stop.liveCitizenX,
            0.42,
            stop.liveCitizenZ,
          );
        }
        const isNext = activeStop?.id === stop.id;
        if (stop.delivered) {
          const hop = Math.abs(Math.sin(visualClock * 6 + idx)) * 0.14;
          cr.person.bodyBounce.position.y = hop;
          cr.person.rightArm.rotation.x = -2.5;
          cr.person.leftArm.rotation.x = -2.5;
          cr.person.rightArm.rotation.z = -0.3 + Math.sin(visualClock * 11) * 0.25;
          cr.person.leftArm.rotation.z = 0.3 - Math.sin(visualClock * 11) * 0.25;
          cr.excitementBadge.visible = true;
          cr.excitementBadge.position.y = 1.62 + hop * 0.9;
          cr.excitementBadge.rotation.y = visualClock * 4.6;
          cr.overviewBeam.visible = false;
        } else if (isNext) {
          cr.person.bodyBounce.position.y =
            Math.abs(Math.sin(visualClock * 4.8)) * 0.08;
          cr.person.rightArm.rotation.x = -2.55;
          cr.person.rightArm.rotation.z =
            -0.25 + Math.sin(visualClock * 10.5) * 0.36;
          cr.person.headGroup.rotation.y = Math.sin(visualClock * 3.2) * 0.18;
          cr.pinSprite.position.y = 1.96 + Math.sin(visualClock * 4.5) * 0.12;
          cr.pinSprite.scale.setScalar(
            1.04 + overviewVisibilityFactor * 0.55,
          );
          cr.excitementBadge.visible = true;
          cr.excitementBadge.position.y =
            1.48 + Math.sin(visualClock * 5.8) * 0.09;
          cr.excitementBadge.rotation.y = visualClock * 3.4;
          const pulseScale = 1 + Math.sin(visualClock * 5.5) * 0.1;
          cr.outerRing.scale.set(pulseScale, pulseScale, 1);
          const bullScale = 1 + Math.cos(visualClock * 7.2) * 0.12;
          cr.bullseyeRing.scale.set(bullScale, bullScale, 1);
          cr.padGroup.visible = true;
          cr.overviewBeam.visible = true;
          cr.overviewBeam.scale.set(
            0.9 + overviewVisibilityFactor * 0.35,
            0.22 + overviewVisibilityFactor * 1.15,
            0.9 + overviewVisibilityFactor * 0.35,
          );
        } else {
          cr.person.bodyBounce.position.y =
            Math.abs(Math.sin(visualClock * 2.0 + idx)) * 0.02;
          cr.person.rightArm.rotation.x = 0;
          cr.person.rightArm.rotation.z = -0.1;
          cr.person.headGroup.rotation.y =
            Math.sin(visualClock * 1.5 + idx) * 0.24;
          cr.pinSprite.position.y = 1.84 + Math.sin(visualClock * 2.5 + idx) * 0.05;
          cr.pinSprite.scale.setScalar(
            0.78 + overviewVisibilityFactor * 0.38,
          );
          cr.excitementBadge.visible = false;
          cr.padGroup.visible = false;
          cr.overviewBeam.visible = false;
        }
      });

      // Animate Obstacle-Free Sidewalk & Plaza Pedestrians (distance-synced stride, zero skating!)
      for (const item of pedestrianRigs) {
        const p = item.data;
        item.rig.root.position.set(p.x, 0.42, p.z);
        item.rig.root.rotation.y = p.yaw;

        if (p.waveTimer > 0) {
          item.rig.leftLeg.rotation.x = 0;
          item.rig.rightLeg.rotation.x = 0;
          item.rig.leftArm.rotation.x = 0;
          item.rig.rightArm.rotation.x = -2.45;
          item.rig.rightArm.rotation.z =
            -0.25 + Math.sin(visualClock * 11.5) * 0.32;
          item.rig.bodyBounce.position.y =
            Math.abs(Math.sin(visualClock * 5.2)) * 0.04;
        } else {
          const curSpd = Math.hypot(p.vx, p.vz);
          const speedRatio = Math.min(
            1,
            curSpd / Math.max(0.5, p.walkSpeed),
          );
          const stride = Math.sin(p.strideDistance * 3.8) * speedRatio;
          item.rig.leftLeg.rotation.x = stride * 0.54;
          item.rig.rightLeg.rotation.x = -stride * 0.54;
          item.rig.leftArm.rotation.x = -stride * 0.45;
          item.rig.rightArm.rotation.x = stride * 0.45;
          item.rig.rightArm.rotation.z = -0.1;
          item.rig.bodyBounce.position.y = Math.abs(stride) * 0.036;
        }
      }

      // Animate Canal Boats & Sailboats gently cruising and bobbing on the water!
      for (const bItem of boatRigs) {
        const b = bItem.data;
        const dx = b.patrolEnd.x - b.patrolStart.x;
        const dz = b.patrolEnd.z - b.patrolStart.z;
        const dist = Math.max(0.5, Math.hypot(dx, dz));
        const omega = (b.speed / dist) * 0.9;
        const phase = visualClock * omega + b.phaseOffset;
        const u = 0.5 - 0.5 * Math.cos(phase);
        const dirSign = Math.sin(phase) >= 0 ? 1 : -1;

        const bobY = 0.055 + Math.sin(visualClock * 2.4 + b.phaseOffset) * 0.025;
        bItem.mesh.position.set(
          b.patrolStart.x + dx * u,
          bobY,
          b.patrolStart.z + dz * u,
        );
        bItem.mesh.rotation.y = Math.atan2(dx * dirSign, dz * dirSign);
        bItem.mesh.rotation.z = Math.sin(visualClock * 1.9 + b.phaseOffset) * 0.04;
      }

      // Animate Flocking 3D Songbirds & Harbor Seagulls!
      for (const bird of birdRigs) {
        const angle = visualClock * bird.speed + bird.phase;
        const bx = bird.centerX + Math.cos(angle) * bird.orbitRadiusX;
        const bz = bird.centerZ + Math.sin(angle) * bird.orbitRadiusZ;
        const vx = -Math.sin(angle) * bird.orbitRadiusX * bird.speed;
        const vz = Math.cos(angle) * bird.orbitRadiusZ * bird.speed;
        const by = bird.baseY + Math.sin(angle * 2.1) * 0.28;

        bird.rig.root.position.set(bx, by, bz);
        bird.rig.root.rotation.y = Math.atan2(vx, vz);
        bird.rig.root.rotation.z = -0.26; // Graceful inward bank along curved flight path!
        bird.rig.root.rotation.x = Math.cos(angle * 2.1) * 0.08;

        // Naturalistic flap-flap-glide cadence!
        const glideCycle = Math.sin(visualClock * 1.7 + bird.phase);
        const flapAmp = glideCycle > 0.55 ? 0.14 : 0.66;
        const flap = Math.sin(visualClock * bird.flapSpeed + bird.phase) * flapAmp;
        bird.rig.leftWingPivot.rotation.z = flap;
        bird.rig.rightWingPivot.rotation.z = -flap;
      }

      // Update Traffic & Gate Hazard Visuals + Crash Wobble, Hit-Flash & 3D Comic Honk Rings!
      for (const hr of hazardRigs) {
        const h = hr.hazard;
        hr.root.position.set(h.x, 0.24, h.z);
        hr.root.rotation.y = h.yaw;

        if (hr.honkRingGroup) {
          const hvt = h.honkVisualTimer ?? 0;
          hr.honkRingGroup.visible = hvt > 0;
          if (hvt > 0) {
            const prog = 1 - Math.min(1, hvt / 0.72);
            const popScale = 0.55 + Math.sin(prog * Math.PI) * 0.75;
            hr.honkRingGroup.scale.setScalar(popScale);
            hr.honkRingGroup.rotation.y = camYaw - h.yaw;
          }
        }

        if (hr.bodyTiltGroup && hr.hitFlashMat) {
          const bt = h.bumpTimer ?? 0;
          if (bt > 0) {
            hr.bodyTiltGroup.rotation.z = Math.sin(bt * 38) * bt * 0.44;
            hr.bodyTiltGroup.rotation.x = Math.cos(bt * 31) * bt * 0.3;
            const sy = Math.max(0.75, 1 + Math.sin(bt * 26) * bt * 0.32);
            const sxz = 1 / Math.sqrt(sy);
            hr.bodyTiltGroup.scale.set(sxz, sy, sxz);
            hr.hitFlashMat.emissive.setHex(0xfff3b0);
            hr.hitFlashMat.emissiveIntensity = Math.min(0.85, bt * 1.9);
          } else {
            hr.bodyTiltGroup.rotation.set(0, 0, 0);
            hr.bodyTiltGroup.scale.set(1, 1, 1);
            hr.hitFlashMat.emissiveIntensity = 0;
          }
        }

        if (h.kind === HazardKind.ScooterDash) {
          const isWinding = h.phase === HazardPhase.Windup;
          if (hr.warningBeacon) {
            hr.warningBeacon.visible = isWinding;
            if (isWinding) {
              const s = 1 + Math.sin(visualClock * 28) * 0.28;
              hr.warningBeacon.scale.setScalar(s);
            }
          }
          if (hr.aimStrip) {
            hr.aimStrip.visible = isWinding;
          }
        } else if (h.kind === HazardKind.BridgeGate && hr.gateArm) {
          const gateBumpWobble =
            (h.bumpTimer ?? 0) > 0
              ? Math.sin((h.bumpTimer ?? 0) * 42) * (h.bumpTimer ?? 0) * 0.35
              : 0;
          const targetRot =
            h.phase === HazardPhase.Active
              ? gateBumpWobble
              : h.phase === HazardPhase.Windup
                ? Math.PI * 0.22 + Math.sin(visualClock * 22) * 0.08
                : Math.PI * 0.44;
          hr.gateArm.rotation.z +=
            (targetRot - hr.gateArm.rotation.z) * (1 - Math.exp(-12 * dt));
          if (hr.warningBeacon) {
            const mat = hr.warningBeacon.material as THREE.MeshStandardMaterial;
            mat.emissiveIntensity =
              h.phase === HazardPhase.Windup
                ? 0.6 + Math.abs(Math.sin(visualClock * 20)) * 1.4
                : h.phase === HazardPhase.Active
                  ? 1.0
                  : 0.15;
          }
        }
      }

      const greenWaveOverride = truckState.greenWaveTimer > 0;
      for (const sr of signalRigs) {
        const st = sr.signal.state;
        const ewG = greenWaveOverride || st === SignalAxisState.EWGreen;
        const ewY = !greenWaveOverride && st === SignalAxisState.EWYellow;
        const ewR = !ewG && !ewY;
        const nsG = greenWaveOverride || st === SignalAxisState.NSGreen;
        const nsY = !greenWaveOverride && st === SignalAxisState.NSYellow;
        const nsR = !nsG && !nsY;

        sr.ewGreenMat.emissiveIntensity = ewG ? 1.45 : 0.05;
        sr.ewYellowMat.emissiveIntensity = ewY ? 1.45 : 0.05;
        sr.ewRedMat.emissiveIntensity = ewR ? 1.45 : 0.05;

        sr.nsGreenMat.emissiveIntensity = nsG ? 1.45 : 0.05;
        sr.nsYellowMat.emissiveIntensity = nsY ? 1.45 : 0.05;
        sr.nsRedMat.emissiveIntensity = nsR ? 1.45 : 0.05;
      }

      for (const kr of kioskRigs) {
        const ready = kr.kiosk.cooldown <= 0;
        kr.roadRingGroup.visible = ready;
        kr.cupGroup.rotation.y = visualClock * (ready ? 1.65 : 0.45);
        kr.cupGroup.position.y =
          0.94 + (ready ? Math.sin(visualClock * 3.5) * 0.05 : 0);
      }

      for (const gr of garageRigs) {
        const ready = gr.garage.cooldown <= 0;
        gr.roadRingGroup.visible = ready;
        gr.wrenchGroup.rotation.y = visualClock * (ready ? 1.8 : 0.5);
        gr.wrenchGroup.position.y =
          1.28 + (ready ? Math.sin(visualClock * 3.8) * 0.05 : 0);
      }

      for (const dr of duckRigs) {
        dr.mesh.position.set(dr.data.x, 0.25, dr.data.z);
        dr.mesh.rotation.y = dr.data.yaw;
        dr.mesh.rotation.z = Math.sin(visualClock * 11 + dr.data.phase) * 0.09;
      }

      for (const gwr of greenWaveRigs) {
        const ready = gwr.data.cooldown <= 0;
        gwr.mesh.visible = ready;
        if (ready) {
          gwr.mesh.position.y = 0.62 + Math.sin(visualClock * 3.6) * 0.08;
          gwr.mesh.rotation.y = visualClock * 2.1;
        }
      }

      if (rivalRig && currentCity.rivalCourier) {
        const rv = currentCity.rivalCourier;
        rivalRig.vanGroup.position.set(rv.x, 0.24, rv.z);
        rivalRig.vanGroup.rotation.y = rv.yaw;
        const rbt = rv.bumpTimer ?? 0;
        if (rbt > 0) {
          rivalRig.bodyTiltGroup.rotation.z = Math.sin(rbt * 38) * rbt * 0.44;
          rivalRig.bodyTiltGroup.rotation.x = Math.cos(rbt * 31) * rbt * 0.3;
          const sy = Math.max(0.75, 1 + Math.sin(rbt * 26) * rbt * 0.32);
          const sxz = 1 / Math.sqrt(sy);
          rivalRig.bodyTiltGroup.scale.set(sxz, sy, sxz);
          rivalRig.hitFlashMat.emissive.setHex(0xfff3b0);
          rivalRig.hitFlashMat.emissiveIntensity = Math.min(0.85, rbt * 1.9);
        } else {
          rivalRig.bodyTiltGroup.rotation.set(0, 0, 0);
          rivalRig.bodyTiltGroup.scale.set(1, 1, 1);
          rivalRig.hitFlashMat.emissiveIntensity = 0;
        }
        rivalRig.bonusDropGroup.visible = !rv.bonusClaimed && !rv.rivalWonBonus;
        if (rivalRig.bonusDropGroup.visible) {
          rivalRig.bonusDropGroup.rotation.y = visualClock * 2.2;
          rivalRig.bonusDropGroup.position.y =
            0.65 + Math.sin(visualClock * 3.5) * 0.08;
          rivalRig.bonusOverviewBeam.visible = overviewVisibilityFactor > 0.03;
          if (rivalRig.bonusOverviewBeam.visible) {
            rivalRig.bonusOverviewBeam.scale.set(
              0.88,
              0.25 + overviewVisibilityFactor * 1.05,
              0.88,
            );
          }
        }
      }

      for (const br of balloonRigs) {
        const b = br.data;
        const t = visualClock * b.speed + b.phaseOffset;
        br.mesh.position.set(
          b.baseX + Math.cos(t) * b.orbitRadius,
          b.baseY + Math.sin(t * 1.8) * 0.42,
          b.baseZ + Math.sin(t) * (b.orbitRadius * 0.65),
        );
        br.mesh.rotation.y = t * 0.35;
      }

      // Update Forward-Only Route Breadcrumb Chevrons along live road path to Active Stop!
      if (activeStop && currentPhase === GamePhase.Playing) {
        if (visualClock - lastPathCalcTime > 0.22) {
          lastPathCalcTime = visualClock;
          refreshForwardRoadPath();
        }
      } else {
        cachedRoadPath = [];
      }

      for (let i = 0; i < BREADCRUMB_MAX; i++) {
        if (i + 1 < cachedRoadPath.length) {
          const node = cachedRoadPath[i + 1];
          const wave = Math.sin(visualClock * 6 - i * 0.7) * 0.04;
          _pos.set(node.x, 0.29 + wave, node.z);
          _euler.set(0, node.yaw, 0);
          _quat.setFromEuler(_euler);
          _scale.set(0.95, 0.45, 0.95);
          _mat4.compose(_pos, _quat, _scale);
          breadcrumbMesh.setMatrixAt(i, _mat4);
        } else {
          _pos.set(0, -50, 0);
          _quat.identity();
          _scale.set(0.001, 0.001, 0.001);
          _mat4.compose(_pos, _quat, _scale);
          breadcrumbMesh.setMatrixAt(i, _mat4);
        }
      }
      breadcrumbMesh.instanceMatrix.needsUpdate = true;

      // Update Flying Parcels
      for (const fp of flyingParcels) {
        if (!fp.active) continue;
        fp.t += dt;
        const u = Math.min(1, fp.t / fp.duration);
        const arc = Math.sin(u * Math.PI) * 1.65;
        fp.mesh.position.set(
          fp.sx + (fp.tx - fp.sx) * u,
          fp.sy + (fp.ty - fp.sy) * u + arc,
          fp.sz + (fp.tz - fp.sz) * u,
        );
        fp.mesh.rotation.y += dt * 9;
        fp.mesh.rotation.x = Math.sin(u * Math.PI * 2) * 0.35;
        if (u >= 1) {
          fp.active = false;
          fp.mesh.visible = false;
          fp.onLand?.();
          fp.onLand = undefined;
        }
      }

      // Update Spinning Gold Tip Coins tossed from cheering customers onto the moving Courier Van!
      for (const fc of flyingCoins) {
        if (!fc.active) continue;
        if (fc.delay > 0) {
          fc.delay -= dt;
          if (fc.delay > 0) continue;
          fc.mesh.visible = true;
        }
        fc.t += dt;
        const u = Math.min(1, fc.t / fc.duration);
        const arc = Math.sin(u * Math.PI) * 2.15;
        const targetRoofX = truckState.x;
        const targetRoofY = 1.38 + truckState.y;
        const targetRoofZ = truckState.z;
        fc.mesh.position.set(
          fc.sx + (targetRoofX - fc.sx) * u,
          fc.sy + (targetRoofY - fc.sy) * u + arc,
          fc.sz + (targetRoofZ - fc.sz) * u,
        );
        fc.mesh.rotation.y += dt * 16;
        fc.mesh.rotation.x = Math.sin(u * Math.PI) * 0.4;
        if (u >= 1) {
          fc.active = false;
          fc.mesh.visible = false;
          pokoAudio.playCoinTossClink(fc.coinIdx);
          truckState.squashY = Math.max(0.88, truckState.squashY - 0.035);
          spawnParticleBurst(
            targetRoofX,
            targetRoofY + 0.1,
            targetRoofZ,
            4,
            [0xffe524, 0xffffff, 0xff9f1c],
            0.6,
          );
        }
      }

      // Update Pooled 3D Cartoon Crash Starbursts + Shockwaves
      for (const cb of crashBursts) {
        if (!cb.active) continue;
        cb.t += dt;
        const u = Math.min(1, cb.t / cb.duration);
        if (u >= 1) {
          cb.active = false;
          cb.rig.root.visible = false;
          continue;
        }
        cb.rig.root.rotation.y = camYaw;
        const starPop =
          u < 0.2
            ? (u / 0.2) * 1.25 * cb.baseScale
            : Math.max(0.02, (1 - (u - 0.2) / 0.8) * 1.15 * cb.baseScale);
        cb.rig.starBurstGroup.scale.setScalar(starPop);
        cb.rig.starBurstGroup.rotation.z = Math.sin(u * Math.PI * 3.5) * 0.32;
        cb.rig.shockRing.scale.setScalar((0.42 + u * 2.05) * cb.baseScale);
        cb.rig.shockRingMat.opacity = (1 - u) * 0.92;
        cb.rig.dizzyOrbitGroup.position.y = u * 0.52;
        cb.rig.dizzyOrbitGroup.rotation.y = cb.t * 11.5;
        cb.rig.dizzyOrbitGroup.scale.setScalar(Math.max(0.05, (1 - u * 0.65) * cb.baseScale));
      }

      // Update Zero-GC Particle Pool
      let anyParticleChanged = false;
      for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
        const p = particles[i];
        if (p.active) {
          anyParticleChanged = true;
          p.life -= dt;
          if (p.life <= 0) {
            p.active = false;
            _pos.set(0, -50, 0);
            _scale.setScalar(0.001);
          } else {
            p.vy -= 9.8 * dt;
            p.x += p.vx * dt;
            p.y = Math.max(0.26, p.y + p.vy * dt);
            p.z += p.vz * dt;
            const s = (p.life / p.maxLife) * p.size;
            _pos.set(p.x, p.y, p.z);
            _scale.setScalar(s);
            _color.setRGB(p.r, p.g, p.b);
            particleMesh.setColorAt(i, _color);
          }
          _quat.identity();
          _mat4.compose(_pos, _quat, _scale);
          particleMesh.setMatrixAt(i, _mat4);
        }
      }
      if (anyParticleChanged) {
        particleMesh.instanceMatrix.needsUpdate = true;
        if (particleMesh.instanceColor) {
          particleMesh.instanceColor.needsUpdate = true;
        }
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    // Initialize particle matrices off-screen once
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      _pos.set(0, -50, 0);
      _quat.identity();
      _scale.setScalar(0.001);
      _mat4.compose(_pos, _quat, _scale);
      particleMesh.setMatrixAt(i, _mat4);
    }
    particleMesh.instanceMatrix.needsUpdate = true;

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      pokoAudio.setMusicPlaying(false);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObs.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlurOrHidden);
      document.removeEventListener('visibilitychange', onVisChange);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);

      disposeLevelGroup();
      for (const cb of crashBursts) {
        cb.rig.shockRingMat.dispose();
      }
      Object.values(sharedGeos).forEach((g) => g.dispose());
      Object.values(sharedMats).forEach((m) => m.dispose());
      waterGeo.dispose();
      waterMat.dispose();
      textures.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Trigger clean level rebuild when activeLevel or runNonce changes without tearing down WebGLRenderer!
  useEffect(() => {
    if (
      prevLevelRef.current !== activeLevel ||
      prevNonceRef.current !== runNonce
    ) {
      const resetScore = activeLevel === 1 || prevNonceRef.current !== runNonce;
      prevLevelRef.current = activeLevel;
      prevNonceRef.current = runNonce;
      loadLevelFnRef.current?.(activeLevel, resetScore);
    }
  }, [activeLevel, runNonce]);

  // Swap 3D vehicle body & roof topper live when equipped in Garage Shop!
  useEffect(() => {
    syncCosmeticsFnRef.current?.(selectedVehicle, selectedTopper);
  }, [selectedVehicle, selectedTopper]);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 w-full h-full overflow-hidden"
      aria-label="Poko Parcel 3D Toy City Viewport"
    />
  );
}
