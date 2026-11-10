import {
  gridToWorld,
  isDrivableTile,
  worldToGrid,
} from './proceduralCity';
import {
  checkDeliveryEligibility,
  getActiveStop,
  isPositionDrivable,
} from './rules';
import {
  CountdownStage,
  DeliveryStop,
  GeneratedCity,
  GridCoord,
  HazardKind,
  ParcelKind,
  RIGHT_LANE_OFFSET,
  TILE_SIZE,
  TopperId,
  TruckState,
  VehicleId,
} from './types';

export const DEMO_DURATION_SEC = 45;

export type DemoSceneId =
  | 'scene1_swoop_launch'
  | 'scene2_bullseye_fever'
  | 'scene3_canal_jump'
  | 'scene4_clash_shield'
  | 'scene5_finale_orbit';

export interface DemoDirectorState {
  active: boolean;
  elapsedSec: number;
  durationSec: number;
  sceneId: DemoSceneId;
  vehicleId: VehicleId;
  topperId: TopperId;
  transitionZoomAlpha: number; // 0 = street chase/hero cam, 1 = high bird's-eye island drone view
  cameraZoomScale: number; // < 1 zooms closer for stunt/clash/toss emphasis, > 1 pulls wider
  cameraYawOffset: number; // Dramatic side-angle offset during canal jump & victory
  firedScene2Boost: boolean;
  firedScene3Boost: boolean;
  firedScene4Horn: boolean;
  firedScene4Shield: boolean;
  deliverCooldown: number;
}

export interface DemoStepOutput {
  completed: boolean;
  changedScene: DemoSceneId | null;
  changedVehicle: { vehicleId: VehicleId; topperId: TopperId } | null;
  gasForCountdown: boolean;
  throttle: number;
  steer: number;
  wantsBoost: boolean;
  wantsDrift: boolean;
  wantsHorn: boolean;
  wantsDeliver: boolean;
  triggerGarageSaveShowcase: boolean;
}

interface SceneSpec {
  id: DemoSceneId;
  startSec: number;
  endSec: number;
  vehicleId: VehicleId;
  topperId: TopperId;
}

export const DEMO_SCENES: readonly SceneSpec[] = [
  {
    id: 'scene1_swoop_launch',
    startSec: 0,
    endSec: 9.0,
    vehicleId: VehicleId.ClassicVan,
    topperId: TopperId.Beacon,
  },
  {
    id: 'scene2_bullseye_fever',
    startSec: 9.0,
    endSec: 18.5,
    vehicleId: VehicleId.KeiTruck,
    topperId: TopperId.EspressoCup,
  },
  {
    id: 'scene3_canal_jump',
    startSec: 18.5,
    endSec: 27.5,
    vehicleId: VehicleId.VespaTrike,
    topperId: TopperId.PartyBalloons,
  },
  {
    id: 'scene4_clash_shield',
    startSec: 27.5,
    endSec: 36.5,
    vehicleId: VehicleId.ArmoredVan,
    topperId: TopperId.RubberDuck,
  },
  {
    id: 'scene5_finale_orbit',
    startSec: 36.5,
    endSec: DEMO_DURATION_SEC,
    vehicleId: VehicleId.ClassicVan,
    topperId: TopperId.PartyBalloons,
  },
];

function wrapAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function smoothstep01(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

export function createDemoDirectorState(): DemoDirectorState {
  return {
    active: false,
    elapsedSec: 0,
    durationSec: DEMO_DURATION_SEC,
    sceneId: 'scene1_swoop_launch',
    vehicleId: VehicleId.ClassicVan,
    topperId: TopperId.Beacon,
    transitionZoomAlpha: 0,
    cameraZoomScale: 1,
    cameraYawOffset: 0,
    firedScene2Boost: false,
    firedScene3Boost: false,
    firedScene4Horn: false,
    firedScene4Shield: false,
    deliverCooldown: 0,
  };
}

export function getDemoSceneAtTime(elapsedSec: number): SceneSpec {
  for (let i = DEMO_SCENES.length - 1; i >= 0; i--) {
    if (elapsedSec >= DEMO_SCENES[i].startSec) {
      return DEMO_SCENES[i];
    }
  }
  return DEMO_SCENES[0];
}

/**
 * Computes continuous drone zoom-out / swoop-in transition alpha [0..1]
 * peaking at 1.0 right at each scene boundary (9.0s, 18.5s, 27.5s, 36.5s)
 * and rising smoothly to a panoramic island finale in the last 3 seconds (42s..45s).
 */
export function computeDemoTransitionZoom(elapsedSec: number): number {
  const boundaries = [9.0, 18.5, 27.5, 36.5];
  const halfOut = 0.85;
  const halfIn = 0.95;

  let peakAlpha = 0;
  for (const b of boundaries) {
    if (elapsedSec >= b - halfOut && elapsedSec <= b) {
      peakAlpha = Math.max(
        peakAlpha,
        smoothstep01((elapsedSec - (b - halfOut)) / halfOut),
      );
    } else if (elapsedSec > b && elapsedSec <= b + halfIn) {
      peakAlpha = Math.max(
        peakAlpha,
        1 - smoothstep01((elapsedSec - b) / halfIn),
      );
    }
  }

  // Grand Finale panoramic zoom-out across final 3.0 seconds (42.0s -> 45.0s)
  if (elapsedSec >= DEMO_DURATION_SEC - 3.0) {
    const finaleT = (elapsedSec - (DEMO_DURATION_SEC - 3.0)) / 3.0;
    peakAlpha = Math.max(peakAlpha, smoothstep01(finaleT) * 0.92);
  }

  return Math.max(0, Math.min(1, peakAlpha));
}

/**
 * Pure steering & throttle autopilot that follows the forward road path in the right-hand lane
 * or cruises cleanly around drivable city intersections when free-roaming.
 */
export function computeAutopilotDrive(
  truck: TruckState,
  city: GeneratedCity,
  roadPath: { x: number; z: number; yaw: number }[],
): { throttle: number; steer: number; wantsDrift: boolean } {
  const N = city.totalGridSize;
  let targetX = truck.x + Math.sin(truck.yaw) * TILE_SIZE;
  let targetZ = truck.z + Math.cos(truck.yaw) * TILE_SIZE;

  if (roadPath.length >= 2) {
    const pickIdx = Math.min(2, roadPath.length - 1);
    const node = roadPath[pickIdx];
    const rightX = -Math.cos(node.yaw) * (RIGHT_LANE_OFFSET * 0.85);
    const rightZ = Math.sin(node.yaw) * (RIGHT_LANE_OFFSET * 0.85);
    targetX = node.x + rightX;
    targetZ = node.z + rightZ;
  } else {
    // Free-roam fallback: pick drivable neighbor most aligned with current heading
    const gc = worldToGrid(truck.x, truck.z, N);
    const dirs: { dc: number; dr: number; yaw: number }[] = [
      { dc: 1, dr: 0, yaw: Math.PI / 2 },
      { dc: -1, dr: 0, yaw: -Math.PI / 2 },
      { dc: 0, dr: 1, yaw: 0 },
      { dc: 0, dr: -1, yaw: Math.PI },
    ];
    let bestScore = -Infinity;
    let bestNeighbor: { gc: GridCoord; yaw: number } | null = null;
    for (const d of dirs) {
      const nc = gc.col + d.dc;
      const nr = gc.row + d.dr;
      if (!isDrivableTile(city.tiles[nr]?.[nc])) continue;
      const align = Math.cos(wrapAngle(d.yaw - truck.yaw));
      // Strongly avoid reversing 180° unless dead-end
      const score = align < -0.7 ? -2 : align;
      if (score > bestScore) {
        bestScore = score;
        bestNeighbor = { gc: { col: nc, row: nr }, yaw: d.yaw };
      }
    }
    if (bestNeighbor) {
      const wp = gridToWorld(bestNeighbor.gc, N);
      targetX = wp.x - Math.cos(bestNeighbor.yaw) * (RIGHT_LANE_OFFSET * 0.85);
      targetZ = wp.z + Math.sin(bestNeighbor.yaw) * (RIGHT_LANE_OFFSET * 0.85);
    }
  }

  const dx = targetX - truck.x;
  const dz = targetZ - truck.z;
  const desiredYaw = Math.hypot(dx, dz) > 0.15 ? Math.atan2(dx, dz) : truck.yaw;
  const yawErr = wrapAngle(desiredYaw - truck.yaw);

  const steer = Math.max(-1, Math.min(1, yawErr * 2.35));
  const sharpTurn = Math.abs(yawErr) > 0.62;
  const throttle = sharpTurn && truck.speed > 5.8 ? 0.55 : 1.0;
  const wantsDrift = Math.abs(yawErr) > 0.72 && truck.speed > 5.6;

  return { throttle, steer, wantsDrift };
}

function placeTruckOnApproachToStop(
  truck: TruckState,
  city: GeneratedCity,
  stop: DeliveryStop,
  speed: number,
): void {
  const N = city.totalGridSize;
  const dirs: { dc: number; dr: number; yaw: number }[] = [
    { dc: 1, dr: 0, yaw: Math.PI / 2 },
    { dc: -1, dr: 0, yaw: -Math.PI / 2 },
    { dc: 0, dr: 1, yaw: 0 },
    { dc: 0, dr: -1, yaw: Math.PI },
  ];

  // Find a drivable neighbor behind stop.roadCoord so van approaches stop cleanly!
  for (const d of dirs) {
    const back1 = {
      col: stop.roadCoord.col - d.dc,
      row: stop.roadCoord.row - d.dr,
    };
    if (!isDrivableTile(city.tiles[back1.row]?.[back1.col])) continue;

    const back2 = {
      col: stop.roadCoord.col - d.dc * 2,
      row: stop.roadCoord.row - d.dr * 2,
    };
    const useTwoBack = isDrivableTile(city.tiles[back2.row]?.[back2.col]);
    const startCoord = useTwoBack ? back2 : back1;
    const wp = gridToWorld(startCoord, N);
    const rightX = -Math.cos(d.yaw) * (RIGHT_LANE_OFFSET * 0.82);
    const rightZ = Math.sin(d.yaw) * (RIGHT_LANE_OFFSET * 0.82);
    const candX = wp.x + rightX;
    const candZ = wp.z + rightZ;
    if (isPositionDrivable(city, candX, candZ)) {
      truck.x = candX;
      truck.z = candZ;
      truck.y = 0;
      truck.vy = 0;
      truck.yaw = d.yaw;
      truck.speed = speed;
      truck.vx = Math.sin(d.yaw) * speed;
      truck.vz = Math.cos(d.yaw) * speed;
      truck.isWrongWay = false;
      truck.wrongWayTimer = 0;
      return;
    }
  }
}

function stageScene2BullseyeAndFever(truck: TruckState, city: GeneratedCity): void {
  const activeStop = getActiveStop(city.stops);
  if (!activeStop) return;
  // Ensure active parcel can be tossed on the move for a slick Bullseye showcase!
  if (activeStop.parcelKind === ParcelKind.Large) {
    activeStop.parcelKind = ParcelKind.HotExpress;
  }
  truck.thermalTimer = truck.thermalMaxSec;
  truck.fragileIntact = true;
  truck.boostCooldown = 0;
  placeTruckOnApproachToStop(truck, city, activeStop, 5.2);
}

function stageScene3CanalRampJump(truck: TruckState, city: GeneratedCity): void {
  if (city.jumpRamps.length === 0) return;
  const ramp = city.jumpRamps[0];
  ramp.cooldown = 0;

  const fwdX = Math.sin(ramp.yaw);
  const fwdZ = Math.cos(ramp.yaw);
  let chosenDist = 1.3;
  for (let d = 4.2; d >= 1.2; d -= 0.35) {
    const cx = ramp.x - fwdX * d;
    const cz = ramp.z - fwdZ * d;
    const midX = ramp.x - fwdX * (d * 0.5);
    const midZ = ramp.z - fwdZ * (d * 0.5);
    if (
      isPositionDrivable(city, cx, cz) &&
      isPositionDrivable(city, midX, midZ)
    ) {
      chosenDist = d;
      break;
    }
  }

  truck.x = ramp.x - fwdX * chosenDist;
  truck.z = ramp.z - fwdZ * chosenDist;
  truck.y = 0;
  truck.vy = 0;
  truck.yaw = ramp.yaw;
  const launchApproachSpd = 6.3;
  truck.speed = launchApproachSpd;
  truck.vx = fwdX * launchApproachSpd;
  truck.vz = fwdZ * launchApproachSpd;
  truck.boostCooldown = 0;
  truck.isWrongWay = false;
  truck.wrongWayTimer = 0;
}

function stageScene4ClashAndShield(truck: TruckState, city: GeneratedCity): void {
  const N = city.totalGridSize;
  truck.health = truck.maxHealth;
  truck.invulnTimer = 0;
  truck.hasBumperShield = false;
  truck.boostCooldown = 0;

  // Find a 3-tile straight inner/outer road corridor for a clean cinematic clash!
  let stagedCorridor = false;
  for (let r = 2; r < N - 2 && !stagedCorridor; r++) {
    for (let c = 2; c < N - 4 && !stagedCorridor; c++) {
      if (
        isDrivableTile(city.tiles[r][c]) &&
        isDrivableTile(city.tiles[r][c + 1]) &&
        isDrivableTile(city.tiles[r][c + 2])
      ) {
        const pStart = gridToWorld({ col: c, row: r }, N);
        const pAhead = gridToWorld({ col: c + 2, row: r }, N);
        const laneZ = pStart.z + RIGHT_LANE_OFFSET * 0.85;
        if (
          isPositionDrivable(city, pStart.x, laneZ) &&
          isPositionDrivable(city, pAhead.x, laneZ)
        ) {
          truck.x = pStart.x;
          truck.z = laneZ;
          truck.y = 0;
          truck.vy = 0;
          truck.yaw = Math.PI / 2;
          truck.speed = 6.6;
          truck.vx = 6.6;
          truck.vz = 0;

          const cruiser = city.hazards.find((h) => h.kind === HazardKind.Cruiser);
          if (cruiser) {
            cruiser.x = pStart.x + 3.45;
            cruiser.z = laneZ;
            cruiser.yaw = -Math.PI / 2;
            cruiser.waypoints = [
              { x: pAhead.x + 1.5, z: laneZ },
              { x: pStart.x - 1.5, z: laneZ },
            ];
            cruiser.waypointIndex = 1;
            cruiser.currentSpeed = cruiser.speed;
            cruiser.stoppedAtSignal = false;
            cruiser.crashCooldown = 0;
            cruiser.honkCooldown = 0;
            cruiser.bumpTimer = 0;
            cruiser.bumpVx = 0;
            cruiser.bumpVz = 0;
          }
          stagedCorridor = true;
        }
      }
    }
  }
}

function stageScene5FinaleDelivery(truck: TruckState, city: GeneratedCity): void {
  if (city.stops.length === 0) return;
  for (let i = 0; i < city.stops.length - 1; i++) {
    city.stops[i].delivered = true;
  }
  const finalStop = city.stops[city.stops.length - 1];
  finalStop.delivered = false;
  if (finalStop.parcelKind === ParcelKind.Large) {
    finalStop.parcelKind = ParcelKind.Small;
  }
  truck.fragileIntact = true;
  truck.thermalTimer = truck.thermalMaxSec;
  truck.health = truck.maxHealth;
  placeTruckOnApproachToStop(truck, city, finalStop, 5.0);
}

/**
 * Steps the 45-second Choreographed Autopilot Demo Director!
 */
export function stepDemoDirector(
  demo: DemoDirectorState,
  truck: TruckState,
  city: GeneratedCity,
  roadPath: { x: number; z: number; yaw: number }[],
  countdownStage: CountdownStage,
  dt: number,
): DemoStepOutput {
  if (!demo.active) {
    return {
      completed: false,
      changedScene: null,
      changedVehicle: null,
      gasForCountdown: false,
      throttle: 0,
      steer: 0,
      wantsBoost: false,
      wantsDrift: false,
      wantsHorn: false,
      wantsDeliver: false,
      triggerGarageSaveShowcase: false,
    };
  }

  const stepDt = Math.max(0.001, Math.min(dt, 0.25));
  demo.elapsedSec += stepDt;
  if (demo.deliverCooldown > 0) {
    demo.deliverCooldown = Math.max(0, demo.deliverCooldown - stepDt);
  }

  // Keep van hull safe inside the demo sandbox so a lucky double-bump never aborts the 45s showcase!
  if (truck.health < 2) {
    truck.health = Math.max(2, truck.maxHealth);
  }

  if (demo.elapsedSec >= demo.durationSec) {
    demo.active = false;
    return {
      completed: true,
      changedScene: null,
      changedVehicle: null,
      gasForCountdown: false,
      throttle: 0,
      steer: 0,
      wantsBoost: false,
      wantsDrift: false,
      wantsHorn: false,
      wantsDeliver: false,
      triggerGarageSaveShowcase: false,
    };
  }

  const spec = getDemoSceneAtTime(demo.elapsedSec);
  let changedScene: DemoSceneId | null = null;
  let changedVehicle: { vehicleId: VehicleId; topperId: TopperId } | null = null;

  if (spec.id !== demo.sceneId) {
    demo.sceneId = spec.id;
    changedScene = spec.id;
    if (
      spec.vehicleId !== demo.vehicleId ||
      spec.topperId !== demo.topperId
    ) {
      demo.vehicleId = spec.vehicleId;
      demo.topperId = spec.topperId;
      changedVehicle = {
        vehicleId: spec.vehicleId,
        topperId: spec.topperId,
      };
    }

    if (spec.id === 'scene2_bullseye_fever') {
      stageScene2BullseyeAndFever(truck, city);
    } else if (spec.id === 'scene3_canal_jump') {
      stageScene3CanalRampJump(truck, city);
    } else if (spec.id === 'scene4_clash_shield') {
      stageScene4ClashAndShield(truck, city);
    } else if (spec.id === 'scene5_finale_orbit') {
      stageScene5FinaleDelivery(truck, city);
    }
  }

  demo.transitionZoomAlpha = computeDemoTransitionZoom(demo.elapsedSec);

  // Per-scene camera framing accents (hero close-ups on stunts/clashes/tosses!)
  if (demo.sceneId === 'scene3_canal_jump') {
    const localT = demo.elapsedSec - 18.5;
    const stuntWindow = localT >= 0.6 && localT <= 4.0;
    const targetScale = stuntWindow ? 0.74 : 0.9;
    const targetYawOff = stuntWindow ? 0.44 : 0.12;
    demo.cameraZoomScale += (targetScale - demo.cameraZoomScale) * Math.min(1, stepDt * 4.5);
    demo.cameraYawOffset += (targetYawOff - demo.cameraYawOffset) * Math.min(1, stepDt * 4.5);
  } else if (demo.sceneId === 'scene4_clash_shield') {
    const localT = demo.elapsedSec - 27.5;
    const clashWindow = localT >= 0.4 && localT <= 3.6;
    const targetScale = clashWindow ? 0.78 : 0.92;
    const targetYawOff = clashWindow ? -0.26 : 0;
    demo.cameraZoomScale += (targetScale - demo.cameraZoomScale) * Math.min(1, stepDt * 4.5);
    demo.cameraYawOffset += (targetYawOff - demo.cameraYawOffset) * Math.min(1, stepDt * 4.5);
  } else if (demo.sceneId === 'scene2_bullseye_fever') {
    demo.cameraZoomScale += (0.86 - demo.cameraZoomScale) * Math.min(1, stepDt * 4.0);
    demo.cameraYawOffset += (0 - demo.cameraYawOffset) * Math.min(1, stepDt * 4.0);
  } else {
    demo.cameraZoomScale += (1.0 - demo.cameraZoomScale) * Math.min(1, stepDt * 4.0);
    demo.cameraYawOffset += (0 - demo.cameraYawOffset) * Math.min(1, stepDt * 4.0);
  }

  // Scene 1 Rocket Start timing: hold gas cleanly when countdown reaches "1"!
  const gasForCountdown = countdownStage === 1 || countdownStage === 0;

  let { throttle, steer, wantsDrift } = computeAutopilotDrive(
    truck,
    city,
    roadPath,
  );
  let wantsBoost = false;
  let wantsHorn = false;
  let wantsDeliver = false;
  let triggerGarageSaveShowcase = false;

  // Scene-specific choreographed action triggers:
  if (demo.sceneId === 'scene2_bullseye_fever') {
    const localT = demo.elapsedSec - 9.0;
    if (!demo.firedScene2Boost && localT > 3.8 && truck.boostCooldown <= 0) {
      demo.firedScene2Boost = true;
      wantsBoost = true;
    }
  } else if (demo.sceneId === 'scene3_canal_jump') {
    const localT = demo.elapsedSec - 18.5;
    // Hold dead-straight heading into the yellow Canal Jump Ramp during the first 1.9s!
    if (localT < 1.9 && city.jumpRamps.length > 0) {
      const ramp = city.jumpRamps[0];
      const dxR = ramp.x - truck.x;
      const dzR = ramp.z - truck.z;
      const along = dxR * Math.sin(ramp.yaw) + dzR * Math.cos(ramp.yaw);
      if (along > -0.4) {
        const aimYaw = Math.atan2(dxR, dzR);
        steer = Math.max(-1, Math.min(1, wrapAngle(aimYaw - truck.yaw) * 3.0));
        throttle = 1.0;
        wantsDrift = false;
      }
    }
    if (!demo.firedScene3Boost && localT > 0.35) {
      demo.firedScene3Boost = true;
      wantsBoost = true;
    }
  } else if (demo.sceneId === 'scene4_clash_shield') {
    const localT = demo.elapsedSec - 27.5;
    // Drive straight into the staged traffic clash for the first 1.6s!
    if (localT < 1.6) {
      steer = 0;
      throttle = 1.0;
      wantsDrift = false;
    }
    if (!demo.firedScene4Horn && localT > 2.6) {
      demo.firedScene4Horn = true;
      wantsHorn = true;
    }
    if (!demo.firedScene4Shield && localT > 4.6) {
      demo.firedScene4Shield = true;
      triggerGarageSaveShowcase = true;
    }
  }

  // Automatic Bullseye / Express Toss whenever in range of an active stop
  // (In Scenes 1-4 keep at least 1 stop undelivered so the stage doesn't end before Scene 5!)
  const undeliveredCount = city.stops.filter((s) => !s.delivered).length;
  const allowDeliveryNow =
    demo.sceneId === 'scene5_finale_orbit' || undeliveredCount > 1;

  if (allowDeliveryNow && demo.deliverCooldown <= 0) {
    const activeStop = getActiveStop(city.stops);
    const elig = checkDeliveryEligibility(truck, activeStop, city.totalGridSize);
    if (elig.needsBrakeForLarge) {
      throttle = -1;
    } else if (elig.canBullseyeToss || (elig.canExpressToss && elig.distance < 3.4)) {
      wantsDeliver = true;
      demo.deliverCooldown = 1.1;
    }
  }

  return {
    completed: false,
    changedScene,
    changedVehicle,
    gasForCountdown,
    throttle,
    steer,
    wantsBoost,
    wantsDrift,
    wantsHorn,
    wantsDeliver,
    triggerGarageSaveShowcase,
  };
}
