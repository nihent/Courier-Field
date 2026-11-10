import {
  PEDESTRIAN_RADIUS,
  getStreetPropObstacleRadius,
  getTreeObstacleRadius,
  gridToWorld,
  isDrivableTile,
  isPedestrianPointClear,
  isWalkablePedestrianTile,
  worldToGrid,
} from './proceduralCity';
import { VEHICLE_SPECS } from './progression';
import {
  CoffeeKiosk,
  CountdownStage,
  CrashEvent,
  DeliveryStop,
  DuckCrossing,
  GeneratedCity,
  HazardKind,
  HazardPhase,
  HonkEvent,
  MechanicGarage,
  OutcomeKind,
  ParcelKind,
  RIGHT_LANE_OFFSET,
  RivalCourier,
  RocketStartStatus,
  SidewalkPedestrian,
  SignalAxisState,
  TILE_SIZE,
  TicketKind,
  TrafficHazard,
  TrafficSignal,
  TruckState,
  VIPRole,
  VehicleId,
  WorldPos,
} from './types';

export const TRUCK_MAX_SPEED = 8.6;
export const TRUCK_BOOST_SPEED = 13.4;
export const TRUCK_RADIUS = 0.46;
export const AUTO_DROP_RADIUS = 1.6;
export const BULLSEYE_PAD_RADIUS = 1.05;
export const EXPRESS_TOSS_RADIUS = 4.2;
export const SMALL_TOSS_RADIUS = 5.3;
export const LARGE_UNLOAD_RADIUS = 2.45;
export const LARGE_MAX_UNLOAD_SPEED = 3.1;
export const COMBO_WINDOW_SEC = 8.0;
export const FEVER_COMBO_THRESHOLD = 4;
export const MAX_CONCURRENT_SCOOTER_ATTACKS = 2;
export const BOOST_COOLDOWN_MAX_SEC = 3.2;
export const WRONG_WAY_LIMIT_SEC = 1.75;

export interface TruckInput {
  throttle: number; // -1 (brake to stop; reverse prohibited!) .. +1 (drive straight ahead)
  steer: number; // -1 (turn left) .. +1 (turn right)
  wantsBoost: boolean;
  wantsDrift?: boolean;
}

function wrapAngleRad(a: number): number {
  let w = a;
  while (w > Math.PI) w -= Math.PI * 2;
  while (w < -Math.PI) w += Math.PI * 2;
  return w;
}

function countDrivableNeighbors(city: GeneratedCity, col: number, row: number): number {
  let deg = 0;
  if (isDrivableTile(city.tiles[row]?.[col + 1])) deg++;
  if (isDrivableTile(city.tiles[row]?.[col - 1])) deg++;
  if (isDrivableTile(city.tiles[row + 1]?.[col])) deg++;
  if (isDrivableTile(city.tiles[row - 1]?.[col])) deg++;
  return deg;
}

export interface VehicleCapsuleSpec {
  halfSeg: number;
  rLat: number;
}

// Calibrated to 3D mesh footprints while keeping opposite right-hand lanes (±0.44 = 0.88 spacing) cleanly clear!
export const TRUCK_CAPSULE: VehicleCapsuleSpec = { halfSeg: 0.36, rLat: 0.37 };
export const RIVAL_CAPSULE: VehicleCapsuleSpec = { halfSeg: 0.38, rLat: 0.37 };

export function getHazardCapsuleSpec(h: TrafficHazard): VehicleCapsuleSpec {
  if (h.kind === HazardKind.Cruiser) {
    return h.isBus
      ? { halfSeg: 0.46, rLat: 0.37 }
      : { halfSeg: 0.34, rLat: 0.35 };
  }
  if (h.kind === HazardKind.ScooterDash) {
    return { halfSeg: 0.22, rLat: 0.25 };
  }
  return { halfSeg: 0.65, rLat: 0.28 };
}

export interface CapsuleContactResult {
  dist: number;
  penetration: number;
  nx: number;
  nz: number;
  cx: number;
  cz: number;
}

/**
 * Exact 2D oriented capsule-vs-capsule contact solver on the XZ road plane.
 * Normal (nx, nz) points from B toward A; penetration > 0 indicates solid 3D overlap.
 */
export function closestCapsuleContact(
  ax: number,
  az: number,
  yawA: number,
  specA: VehicleCapsuleSpec,
  bx: number,
  bz: number,
  yawB: number,
  specB: VehicleCapsuleSpec,
): CapsuleContactResult {
  const fxA = Math.sin(yawA);
  const fzA = Math.cos(yawA);
  const fxB = Math.sin(yawB);
  const fzB = Math.cos(yawB);

  const dx = ax - bx;
  const dz = az - bz;
  const b = fxA * fxB + fzA * fzB;
  const c = fxA * dx + fzA * dz;
  const f = fxB * dx + fzB * dz;
  const denom = 1 - b * b;

  let s = 0;
  let t = 0;
  if (denom > 1e-5) {
    s = Math.max(-specA.halfSeg, Math.min(specA.halfSeg, (b * f - c) / denom));
    t = b * s + f;
    if (t < -specB.halfSeg) {
      t = -specB.halfSeg;
      s = Math.max(-specA.halfSeg, Math.min(specA.halfSeg, b * t - c));
    } else if (t > specB.halfSeg) {
      t = specB.halfSeg;
      s = Math.max(-specA.halfSeg, Math.min(specA.halfSeg, b * t - c));
    }
  } else {
    const sB0 = -c - b * specB.halfSeg;
    const sB1 = -c + b * specB.halfSeg;
    const lo = Math.max(-specA.halfSeg, Math.min(sB0, sB1));
    const hi = Math.min(specA.halfSeg, Math.max(sB0, sB1));
    s = lo <= hi ? 0.5 * (lo + hi) : lo > specA.halfSeg ? specA.halfSeg : -specA.halfSeg;
    t = Math.max(-specB.halfSeg, Math.min(specB.halfSeg, b * s + f));
    s = Math.max(-specA.halfSeg, Math.min(specA.halfSeg, b * t - c));
  }

  const px = ax + fxA * s;
  const pz = az + fzA * s;
  const qx = bx + fxB * t;
  const qz = bz + fzB * t;
  const vx = px - qx;
  const vz = pz - qz;
  const dist = Math.hypot(vx, vz);

  let nx = 0;
  let nz = 1;
  const minSep = specA.rLat + specB.rLat;
  let penetration = minSep - dist;

  if (dist > 1e-4) {
    nx = vx / dist;
    nz = vz / dist;
  } else {
    const cd = Math.hypot(dx, dz);
    if (cd > 1e-4) {
      nx = dx / cd;
      nz = dz / cd;
    } else {
      nx = -fzB;
      nz = fxB;
    }
    // Segments intersect (dist ~ 0): compute exact separation needed along (nx, nz) so segments clear by minSep
    const projSpan =
      Math.abs(fxA * nx + fzA * nz) * specA.halfSeg +
      Math.abs(fxB * nx + fzB * nz) * specB.halfSeg +
      minSep;
    penetration = Math.max(penetration, projSpan - (dx * nx + dz * nz));
  }

  return {
    dist,
    penetration,
    nx,
    nz,
    cx: (px + qx) * 0.5,
    cz: (pz + qz) * 0.5,
  };
}

function findBlockingBridgeGate(
  city: GeneratedCity,
  x: number,
  z: number,
  radius: number,
  truckY: number,
): TrafficHazard | null {
  if (truckY > 0.35) return null;
  for (const h of city.hazards) {
    if (h.kind === HazardKind.BridgeGate && h.phase === HazardPhase.Active) {
      if (Math.abs(x - h.x) < 0.85 + radius && Math.abs(z - h.z) < 0.85 + radius) {
        return h;
      }
    }
  }
  return null;
}

export function createInitialTruckState(
  city: GeneratedCity,
  vehicleId: VehicleId = VehicleId.ClassicVan,
  startWithShield: boolean = false,
): TruckState {
  const spec = VEHICLE_SPECS[vehicleId] ?? VEHICLE_SPECS[VehicleId.ClassicVan];
  const spawnPos = gridToWorld(city.spawnCoord, city.totalGridSize);
  const rightX = -Math.cos(city.spawnYaw) * RIGHT_LANE_OFFSET;
  const rightZ = Math.sin(city.spawnYaw) * RIGHT_LANE_OFFSET;
  return {
    vehicleId,
    x: spawnPos.x + rightX,
    y: 0,
    z: spawnPos.z + rightZ,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: city.spawnYaw,
    speed: 0,
    isBraking: false,
    isDrifting: false,
    driftChargeAccum: 0,
    boostTimer: 0,
    boostCooldown: 0,
    invulnTimer: 0,
    health: spec.maxHealth,
    maxHealth: spec.maxHealth,
    hasBumperShield: startWithShield,
    shockAbsorberAvailable: spec.hasShockAbsorber,
    greenWaveTimer: 0,
    hornCooldown: 0,
    distanceTraveled: 0,
    squashY: 1,
    squashVel: 0,
    rollAngle: 0,
    pitchAngle: 0,
    steerAngle: 0,
    isWrongWay: false,
    wrongWayTimer: 0,
    ticketCooldown: 0,
    ticketsCount: 0,
    lastSignalCellKey: '',
    fragileIntact: true,
    thermalTimer: 18,
    thermalMaxSec: 18,
    wallCrashCooldown: 0,
  };
}

export function isPositionDrivable(
  city: GeneratedCity,
  x: number,
  z: number,
  radius: number = TRUCK_RADIUS,
  truckY: number = 0,
): boolean {
  const offsets = [
    [-radius, -radius],
    [radius, -radius],
    [-radius, radius],
    [radius, radius],
  ];
  for (const [ox, oz] of offsets) {
    const gc = worldToGrid(x + ox, z + oz, city.totalGridSize);
    const tile = city.tiles[gc.row]?.[gc.col];
    if (tile === undefined || !isDrivableTile(tile)) {
      return false;
    }
    // Airborne vans soaring off a Canal Jump Ramp clear closed BridgeGate barriers!
    if (truckY <= 0.35) {
      for (const h of city.hazards) {
        if (h.kind === HazardKind.BridgeGate && h.phase === HazardPhase.Active) {
          const dx = Math.abs(x + ox - h.x);
          const dz = Math.abs(z + oz - h.z);
          if (dx < 0.85 && dz < 0.85) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

export interface PhysicsStepResult {
  hitCurb: boolean;
  absorbedCurbWithShock: boolean;
  triggeredBoostPad: boolean;
  activatedManualBoost: boolean;
  activatedJumpRamp: boolean;
  pickedGreenWave: boolean;
  splashedHydrantPos: WorldPos | null;
  issuedTicket: TicketKind | null;
  crashEvents: CrashEvent[];
}

export function stepTruckPhysics(
  truck: TruckState,
  input: TruckInput,
  city: GeneratedCity,
  dt: number,
): PhysicsStepResult {
  const clampedDt = Math.min(dt, 0.05);
  let hitCurb = false;
  let absorbedCurbWithShock = false;
  let triggeredBoostPad = false;
  let activatedManualBoost = false;
  let activatedJumpRamp = false;
  let pickedGreenWave = false;
  let splashedHydrantPos: WorldPos | null = null;
  let issuedTicket: TicketKind | null = null;
  const crashEvents: CrashEvent[] = [];

  const spec = VEHICLE_SPECS[truck.vehicleId] ?? VEHICLE_SPECS[VehicleId.ClassicVan];
  const prevSpeed = truck.speed;
  const prevYaw = truck.yaw;

  if (truck.boostTimer > 0) {
    truck.boostTimer = Math.max(0, truck.boostTimer - clampedDt);
  }
  if (truck.boostCooldown > 0) {
    truck.boostCooldown = Math.max(0, truck.boostCooldown - clampedDt);
  }
  if (truck.invulnTimer > 0) {
    truck.invulnTimer = Math.max(0, truck.invulnTimer - clampedDt);
  }
  if (truck.ticketCooldown > 0) {
    truck.ticketCooldown = Math.max(0, truck.ticketCooldown - clampedDt);
  }
  if (truck.greenWaveTimer > 0) {
    truck.greenWaveTimer = Math.max(0, truck.greenWaveTimer - clampedDt);
  }
  if (truck.hornCooldown > 0) {
    truck.hornCooldown = Math.max(0, truck.hornCooldown - clampedDt);
  }
  if (truck.wallCrashCooldown && truck.wallCrashCooldown > 0) {
    truck.wallCrashCooldown = Math.max(0, truck.wallCrashCooldown - clampedDt);
  }

  // Parabolic Canal Jump Ramp flight physics!
  if (truck.y > 0 || truck.vy > 0) {
    truck.vy -= 17.2 * clampedDt;
    truck.y += truck.vy * clampedDt;
    if (truck.y <= 0) {
      truck.y = 0;
      truck.vy = 0;
      truck.squashY = 0.75;
      truck.squashVel = 4.4;
      truck.pitchAngle = 0.06;
    }
  }

  // Trigger manual boost if requested and off cooldown
  if (input.wantsBoost && truck.boostCooldown <= 0) {
    truck.boostTimer = 1.15;
    truck.boostCooldown = BOOST_COOLDOWN_MAX_SEC;
    truck.squashY = 0.78;
    truck.squashVel = 4.2;
    truck.pitchAngle = -0.075;
    activatedManualBoost = true;
  }

  // Spring-damper squash-and-stretch recovery
  const springForce = (1.0 - truck.squashY) * 38.0 - truck.squashVel * 7.5;
  truck.squashVel += springForce * clampedDt;
  truck.squashY = Math.max(
    0.68,
    Math.min(1.32, truck.squashY + truck.squashVel * clampedDt),
  );

  const throttleIn = Math.max(-1, Math.min(1, input.throttle));
  const steerIn = Math.max(-1, Math.min(1, input.steer));
  const isBraking = throttleIn < -0.05;
  truck.isBraking = isBraking;

  // Corner Drift-Charge: carving a sharp turn at speed recharges Turbo faster!
  const canDrift =
    !isBraking &&
    Math.abs(steerIn) > 0.45 &&
    truck.speed > 4.6 &&
    truck.y <= 0.05;
  if (canDrift && (input.wantsDrift || truck.speed > 6.2)) {
    truck.isDrifting = true;
    truck.driftChargeAccum += clampedDt;
    truck.boostCooldown = Math.max(0, truck.boostCooldown - clampedDt * 1.35);
  } else {
    truck.isDrifting = false;
    truck.driftChargeAccum = Math.max(0, truck.driftChargeAccum - clampedDt * 1.5);
  }

  // 1. Vehicle-Relative Forward Steering + Intersection Corner-Entry Assist:
  //    steer < 0 = Turn Left (+yaw), steer > 0 = Turn Right (-yaw).
  //    Reverse is strictly prohibited — S / ArrowDown only applies wheel brakes!
  const halfPi = Math.PI * 0.5;
  if (Math.abs(steerIn) > 0.01 && !isBraking) {
    const turnDir = -steerIn;
    const driftTurnBonus = truck.isDrifting ? 1.14 : 1.0;
    const turnSpeedRad = 3.9 * spec.turnSpeedMult * driftTurnBonus;
    let nextYaw = wrapAngleRad(truck.yaw + turnDir * turnSpeedRad * clampedDt);

    const cardinalYaw = Math.round(truck.yaw / halfPi) * halfPi;
    const cardFwdX = Math.sin(cardinalYaw);
    const cardFwdZ = Math.cos(cardinalYaw);
    const turnSign = turnDir >= 0 ? 1 : -1;
    const sideYaw = cardinalYaw + turnSign * halfPi;
    const sideColStep = Math.round(Math.sin(sideYaw));
    const sideRowStep = Math.round(Math.cos(sideYaw));
    const aheadColStep = Math.round(cardFwdX);
    const aheadRowStep = Math.round(cardFwdZ);

    const gcNow = worldToGrid(truck.x, truck.z, city.totalGridSize);
    const gcAhead = worldToGrid(
      truck.x + cardFwdX * (TILE_SIZE * 0.42),
      truck.z + cardFwdZ * (TILE_SIZE * 0.42),
      city.totalGridSize,
    );

    const sideOpen =
      isDrivableTile(
        city.tiles[gcNow.row + sideRowStep]?.[gcNow.col + sideColStep],
      ) ||
      isDrivableTile(
        city.tiles[gcAhead.row + sideRowStep]?.[gcAhead.col + sideColStep],
      );
    const aheadOpen = isDrivableTile(
      city.tiles[gcNow.row + aheadRowStep]?.[gcNow.col + aheadColStep],
    );

    if (!sideOpen && aheadOpen) {
      const maxLean = 0.42;
      const rel = wrapAngleRad(nextYaw - cardinalYaw);
      const clampedRel = Math.max(-maxLean, Math.min(maxLean, rel));
      nextYaw = wrapAngleRad(cardinalYaw + clampedRel);
    }

    truck.yaw = nextYaw;
  } else if (!isBraking && (throttleIn > 0.05 || truck.boostTimer > 0)) {
    const nearestCardinal = Math.round(truck.yaw / halfPi) * halfPi;
    const cardDiff = wrapAngleRad(nearestCardinal - truck.yaw);
    if (Math.abs(cardDiff) < 0.72) {
      truck.yaw = wrapAngleRad(
        truck.yaw + cardDiff * (1 - Math.exp(-8.5 * clampedDt)),
      );
    }
  }

  // 2. Forward-Only Throttle & Crisp Curbside Braking (Reverse Prohibited!)
  const fwdX = Math.sin(truck.yaw);
  const fwdZ = Math.cos(truck.yaw);
  const topFwdSpeed =
    (truck.boostTimer > 0 ? TRUCK_BOOST_SPEED : TRUCK_MAX_SPEED) *
    spec.maxSpeedMult;

  let effThrottle = Math.max(0, throttleIn);
  if (!isBraking && effThrottle < 0.05 && Math.abs(steerIn) > 0.05) {
    effThrottle = 0.68;
  }

  const wetGripMult = city.config.hasSunshower ? 0.86 : 1.0;

  if (isBraking) {
    truck.boostTimer = 0;
    const brakeDecay = Math.exp(-16.0 * wetGripMult * clampedDt);
    truck.vx *= brakeDecay;
    truck.vz *= brakeDecay;
    if (Math.hypot(truck.vx, truck.vz) < 0.12) {
      truck.vx = 0;
      truck.vz = 0;
    }
  } else if (truck.boostTimer > 0) {
    const targetVx = fwdX * topFwdSpeed;
    const targetVz = fwdZ * topFwdSpeed;
    const accelRate = 1 - Math.exp(-12.5 * spec.accelMult * clampedDt);
    truck.vx += (targetVx - truck.vx) * accelRate;
    truck.vz += (targetVz - truck.vz) * accelRate;
  } else if (effThrottle > 0.01) {
    const targetSpd = effThrottle * topFwdSpeed;
    const targetVx = fwdX * targetSpd;
    const targetVz = fwdZ * targetSpd;
    const accelRate = 1 - Math.exp(-13.0 * spec.accelMult * wetGripMult * clampedDt);
    truck.vx += (targetVx - truck.vx) * accelRate;
    truck.vz += (targetVz - truck.vz) * accelRate;
  } else {
    const drag = Math.exp(-9.5 * clampedDt);
    truck.vx *= drag;
    truck.vz *= drag;
    if (Math.hypot(truck.vx, truck.vz) < 0.06) {
      truck.vx = 0;
      truck.vz = 0;
    }
  }

  if (truck.invulnTimer <= 0 && (truck.wallCrashCooldown ?? 0) <= 0) {
    const fwdProj = truck.vx * fwdX + truck.vz * fwdZ;
    if (fwdProj < 0) {
      truck.vx -= fwdX * fwdProj;
      truck.vz -= fwdZ * fwdProj;
    }
  }

  // 3. Axis-Separated Movement + Intersection Corner Slide + Solid Wall/Gate/Prop Crash Rebound
  const prevX = truck.x;
  const prevZ = truck.z;
  const rightLaneX = -Math.cos(truck.yaw) * RIGHT_LANE_OFFSET;
  const rightLaneZ = Math.sin(truck.yaw) * RIGHT_LANE_OFFSET;

  const handleCurbBump = (heavy: boolean = false) => {
    hitCurb = true;
    if (truck.shockAbsorberAvailable) {
      truck.shockAbsorberAvailable = false;
      absorbedCurbWithShock = true;
    } else {
      truck.fragileIntact = false;
    }
    truck.squashY = heavy ? 1.2 : 1.12;
    truck.squashVel = heavy ? -3.2 : -2.3;
    truck.pitchAngle = heavy ? 0.085 : 0.065;
  };

  const emitWallOrGateCrash = (
    contactX: number,
    contactZ: number,
    nx: number,
    nz: number,
    impactSpeed: number,
    blockingGate: TrafficHazard | null,
  ) => {
    if ((truck.wallCrashCooldown ?? 0) > 0) return;
    truck.wallCrashCooldown = 0.45;
    truck.boostTimer = 0;
    const isHeavy = impactSpeed > 5.0 || Boolean(blockingGate && impactSpeed > 3.2);
    handleCurbBump(isHeavy);
    if (blockingGate) {
      blockingGate.bumpTimer = 0.4;
      crashEvents.push({
        x: contactX,
        y: 0.56,
        z: contactZ,
        nx,
        nz,
        kind: 'gate',
        severity: isHeavy ? 'crash' : 'bump',
        label: 'Clang! Drawbridge Gate!',
        involvesPlayer: true,
        hazardId: blockingGate.id,
      });
    } else {
      crashEvents.push({
        x: contactX,
        y: 0.46,
        z: contactZ,
        nx,
        nz,
        kind: 'building',
        severity: isHeavy ? 'crash' : 'bump',
        label: isHeavy ? 'Wall Crash!' : 'Curb Bonk!',
        involvesPlayer: true,
      });
    }
  };

  const nextX = truck.x + truck.vx * clampedDt;
  if (isPositionDrivable(city, nextX, truck.z, TRUCK_RADIUS, truck.y)) {
    truck.x = nextX;
  } else {
    const gc = worldToGrid(truck.x, truck.z, city.totalGridSize);
    const stepCol = nextX < truck.x ? -1 : 1;
    let turnRow = gc.row;
    if (!isDrivableTile(city.tiles[gc.row]?.[gc.col + stepCol])) {
      if (isDrivableTile(city.tiles[gc.row + 1]?.[gc.col + stepCol])) {
        turnRow = gc.row + 1;
      } else if (isDrivableTile(city.tiles[gc.row - 1]?.[gc.col + stepCol])) {
        turnRow = gc.row - 1;
      }
    }
    const roadCenter = gridToWorld(
      { col: gc.col, row: turnRow },
      city.totalGridSize,
    );
    const targetLaneZ = roadCenter.z + rightLaneZ;
    const nudgeZ =
      truck.z +
      Math.sign(targetLaneZ - truck.z) *
        Math.min(Math.abs(targetLaneZ - truck.z), 7.8 * clampedDt);
    if (isPositionDrivable(city, nextX, nudgeZ, TRUCK_RADIUS, truck.y)) {
      truck.x = nextX;
      truck.z = nudgeZ;
    } else {
      const axisSpd = Math.abs(truck.vx);
      const gate = findBlockingBridgeGate(city, nextX, truck.z, TRUCK_RADIUS, truck.y);
      if (axisSpd > 2.1 || (gate && axisSpd > 1.0)) {
        const dirSign = Math.sign(truck.vx) || 1;
        emitWallOrGateCrash(
          truck.x + dirSign * 0.58,
          truck.z,
          -dirSign,
          0,
          Math.max(axisSpd, prevSpeed * 0.8),
          gate,
        );
        truck.vx = -dirSign * Math.max(2.1, Math.min(4.6, axisSpd * 0.48));
      } else {
        truck.vx = 0;
      }
    }
  }

  const nextZ = truck.z + truck.vz * clampedDt;
  if (isPositionDrivable(city, truck.x, nextZ, TRUCK_RADIUS, truck.y)) {
    truck.z = nextZ;
  } else {
    const gc = worldToGrid(truck.x, truck.z, city.totalGridSize);
    const stepRow = nextZ < truck.z ? -1 : 1;
    let turnCol = gc.col;
    if (!isDrivableTile(city.tiles[gc.row + stepRow]?.[gc.col])) {
      if (isDrivableTile(city.tiles[gc.row + stepRow]?.[gc.col + 1])) {
        turnCol = gc.col + 1;
      } else if (isDrivableTile(city.tiles[gc.row + stepRow]?.[gc.col - 1])) {
        turnCol = gc.col - 1;
      }
    }
    const roadCenter = gridToWorld(
      { col: turnCol, row: gc.row },
      city.totalGridSize,
    );
    const targetLaneX = roadCenter.x + rightLaneX;
    const nudgeX =
      truck.x +
      Math.sign(targetLaneX - truck.x) *
        Math.min(Math.abs(targetLaneX - truck.x), 7.8 * clampedDt);
    if (isPositionDrivable(city, nudgeX, nextZ, TRUCK_RADIUS, truck.y)) {
      truck.x = nudgeX;
      truck.z = nextZ;
    } else {
      const axisSpd = Math.abs(truck.vz);
      const gate = findBlockingBridgeGate(city, truck.x, nextZ, TRUCK_RADIUS, truck.y);
      if (axisSpd > 2.1 || (gate && axisSpd > 1.0)) {
        const dirSign = Math.sign(truck.vz) || 1;
        emitWallOrGateCrash(
          truck.x,
          truck.z + dirSign * 0.58,
          0,
          -dirSign,
          Math.max(axisSpd, prevSpeed * 0.8),
          gate,
        );
        truck.vz = -dirSign * Math.max(2.1, Math.min(4.6, axisSpd * 0.48));
      } else {
        truck.vz = 0;
      }
    }
  }

  // Solid 3D Collision against Roadside Street Props, Kiosk Booths & Garage Structures
  if (truck.y <= 0.35) {
    const resolveStaticCircle = (ox: number, oz: number, obsRadius: number, propLabel: string) => {
      const dx = truck.x - ox;
      const dz = truck.z - oz;
      if (Math.abs(dx) > 1.8 || Math.abs(dz) > 1.8) return;
      const minD = obsRadius + 0.38;
      const d = Math.hypot(dx, dz);
      if (d < minD) {
        const nx = d > 1e-4 ? dx / d : Math.sin(truck.yaw + Math.PI);
        const nz = d > 1e-4 ? dz / d : Math.cos(truck.yaw + Math.PI);
        const candX = ox + nx * (minD + 0.015);
        const candZ = oz + nz * (minD + 0.015);
        if (isPositionDrivable(city, candX, candZ, TRUCK_RADIUS * 0.9, truck.y)) {
          truck.x = candX;
          truck.z = candZ;
        }
        const vn = truck.vx * nx + truck.vz * nz;
        if (vn < 0) {
          const bounce = Math.max(2.0, Math.min(4.4, -vn * 0.52 + 1.4));
          truck.vx += nx * (-vn + bounce);
          truck.vz += nz * (-vn + bounce);
        }
        const imp = Math.max(prevSpeed, Math.hypot(truck.vx, truck.vz));
        if ((truck.wallCrashCooldown ?? 0) <= 0 && imp > 1.9) {
          truck.wallCrashCooldown = 0.45;
          truck.boostTimer = 0;
          handleCurbBump(imp > 5.0);
          crashEvents.push({
            x: ox + nx * obsRadius,
            y: 0.5,
            z: oz + nz * obsRadius,
            nx,
            nz,
            kind: 'prop',
            severity: imp > 5.0 ? 'crash' : 'bump',
            label: propLabel,
            involvesPlayer: true,
          });
        }
      }
    };

    for (const sp of city.streetProps) {
      if (sp.kind === 'hydrant') continue;
      resolveStaticCircle(sp.x, sp.z, getStreetPropObstacleRadius(sp), 'Prop Bonk!');
    }
    for (const k of city.coffeeKiosks) {
      resolveStaticCircle(k.kioskX, k.kioskZ, 0.5, 'Kiosk Bumper Tap!');
    }
    for (const g of city.mechanicGarages) {
      resolveStaticCircle(g.garageX, g.garageZ, 0.56, 'Garage Post Bump!');
    }
  }

  const gcAfter = worldToGrid(truck.x, truck.z, city.totalGridSize);
  const centerAfter = gridToWorld(gcAfter, city.totalGridSize);
  const roadDeg = countDrivableNeighbors(city, gcAfter.col, gcAfter.row);

  if (
    Math.abs(steerIn) < 0.02 &&
    !isBraking &&
    roadDeg <= 2 &&
    Math.hypot(truck.vx, truck.vz) > 1.2
  ) {
    const curLatRight =
      (truck.x - centerAfter.x) * -Math.cos(truck.yaw) +
      (truck.z - centerAfter.z) * Math.sin(truck.yaw);
    if (curLatRight >= -0.14) {
      if (Math.abs(fwdX) > 0.92) {
        const targetZ = centerAfter.z + Math.sign(fwdX) * RIGHT_LANE_OFFSET;
        const dzErr = targetZ - truck.z;
        const pullZ =
          truck.z + Math.sign(dzErr) * Math.min(Math.abs(dzErr), 2.1 * clampedDt);
        if (isPositionDrivable(city, truck.x, pullZ, TRUCK_RADIUS, truck.y)) {
          truck.z = pullZ;
        }
      } else if (Math.abs(fwdZ) > 0.92) {
        const targetX = centerAfter.x - Math.sign(fwdZ) * RIGHT_LANE_OFFSET;
        const dxErr = targetX - truck.x;
        const pullX =
          truck.x + Math.sign(dxErr) * Math.min(Math.abs(dxErr), 2.1 * clampedDt);
        if (isPositionDrivable(city, pullX, truck.z, TRUCK_RADIUS, truck.y)) {
          truck.x = pullX;
        }
      }
    }
  }

  const dxActual = truck.x - prevX;
  const dzActual = truck.z - prevZ;
  const stepDist = Math.hypot(dxActual, dzActual);
  const signedMove = dxActual * fwdX + dzActual * fwdZ;
  truck.distanceTraveled += Math.max(0, signedMove >= 0 ? stepDist : 0);
  truck.speed = stepDist / Math.max(clampedDt, 0.0001);

  // 4. Wrong-Way Lane Enforcement & Ticket Citation!
  const latRightNow =
    (truck.x - centerAfter.x) * -Math.cos(truck.yaw) +
    (truck.z - centerAfter.z) * Math.sin(truck.yaw);
  if (roadDeg <= 2 && truck.speed > 1.75 && latRightNow < -0.16 && truck.y <= 0.2) {
    truck.isWrongWay = true;
    if (truck.ticketCooldown <= 0) {
      truck.wrongWayTimer += clampedDt;
      if (truck.wrongWayTimer >= WRONG_WAY_LIMIT_SEC) {
        issuedTicket = 'wrong_way';
        truck.ticketsCount += 1;
        truck.fragileIntact = false;
        truck.ticketCooldown = 4.2;
        truck.wrongWayTimer = 0;
        truck.isWrongWay = false;
      }
    }
  } else {
    truck.isWrongWay = false;
    truck.wrongWayTimer = Math.max(0, truck.wrongWayTimer - clampedDt * 2.4);
  }

  // 5. Intersection Red-Light Enforcement & Ticket Citation (bypassed during Green-Wave or Air Jump!)
  if (city.trafficSignals.length > 0 && truck.greenWaveTimer <= 0 && truck.y <= 0.25) {
    if (truck.lastSignalCellKey) {
      const prevSig = city.trafficSignals.find(
        (s) => s.id === truck.lastSignalCellKey,
      );
      if (!prevSig || Math.hypot(truck.x - prevSig.x, truck.z - prevSig.z) > 1.55) {
        truck.lastSignalCellKey = '';
      }
    }

    for (const sig of city.trafficSignals) {
      const dSig = Math.hypot(truck.x - sig.x, truck.z - sig.z);
      if (dSig < 1.05 && sig.id !== truck.lastSignalCellKey) {
        truck.lastSignalCellKey = sig.id;
        if (truck.speed > 2.3 && truck.ticketCooldown <= 0 && !issuedTicket) {
          const movingEW = Math.abs(fwdX) >= Math.abs(fwdZ);
          const runningRed = movingEW
            ? sig.state === SignalAxisState.NSGreen ||
              sig.state === SignalAxisState.NSYellow
            : sig.state === SignalAxisState.EWGreen ||
              sig.state === SignalAxisState.EWYellow;
          if (runningRed) {
            issuedTicket = 'red_light';
            truck.ticketsCount += 1;
            truck.fragileIntact = false;
            truck.ticketCooldown = 4.0;
          }
        }
        break;
      }
    }
  }

  // 6. Front-Wheel Steering Angle + Chassis Suspension Roll & Pitch!
  const appliedYawDelta = wrapAngleRad(truck.yaw - prevYaw);
  const yawRate = appliedYawDelta / Math.max(clampedDt, 0.001);

  const targetSteer = Math.max(-0.46, Math.min(0.46, -steerIn * 0.44));
  truck.steerAngle +=
    (targetSteer - truck.steerAngle) * (1 - Math.exp(-16.0 * clampedDt));

  const speedNorm = Math.min(1.2, truck.speed / TRUCK_MAX_SPEED);
  const targetRoll = Math.max(
    -0.14,
    Math.min(0.14, yawRate * speedNorm * (truck.isDrifting ? 0.032 : 0.024)),
  );
  truck.rollAngle +=
    (targetRoll - truck.rollAngle) * (1 - Math.exp(-12.0 * clampedDt));

  const longAccel = (truck.speed - prevSpeed) / Math.max(clampedDt, 0.001);
  const airPitch = truck.y > 0.05 ? Math.max(-0.22, Math.min(0.18, -truck.vy * 0.03)) : null;
  const targetPitch =
    airPitch !== null
      ? airPitch
      : isBraking && truck.speed > 0.5
        ? 0.075
        : Math.max(-0.085, Math.min(0.085, -longAccel * 0.0042));
  truck.pitchAngle +=
    (targetPitch - truck.pitchAngle) * (1 - Math.exp(-11.0 * clampedDt));

  // 7. Check Boost Pads
  if (truck.boostTimer <= 0.25 && !isBraking && truck.y <= 0.15) {
    for (const pad of city.boostPads) {
      const pw = gridToWorld(pad.coord, city.totalGridSize);
      if (Math.hypot(truck.x - pw.x, truck.z - pw.z) < TILE_SIZE * 0.48) {
        truck.boostTimer = 1.35;
        truck.squashY = 0.76;
        truck.squashVel = 4.6;
        truck.pitchAngle = -0.08;
        triggeredBoostPad = true;
        break;
      }
    }
  }

  // 8. Check Canal Jump Ramps!
  for (const ramp of city.jumpRamps) {
    if (ramp.cooldown > 0) {
      ramp.cooldown = Math.max(0, ramp.cooldown - clampedDt);
    } else if (
      truck.y <= 0.05 &&
      truck.speed > 3.0 &&
      Math.hypot(truck.x - ramp.x, truck.z - ramp.z) < 1.18
    ) {
      ramp.cooldown = 3.2;
      truck.vy = 6.9;
      truck.y = 0.12;
      truck.boostTimer = Math.max(truck.boostTimer, 0.85);
      truck.squashY = 1.18;
      truck.squashVel = 2.8;
      activatedJumpRamp = true;
    }
  }

  // 9. Check Green-Wave Signal Transponder Pickups!
  for (const gw of city.greenWavePickups) {
    if (gw.cooldown > 0) {
      gw.cooldown = Math.max(0, gw.cooldown - clampedDt);
    } else if (Math.hypot(truck.x - gw.x, truck.z - gw.z) < 1.25) {
      gw.cooldown = 20.0;
      truck.greenWaveTimer = 7.5;
      const movingEW = Math.abs(fwdX) >= Math.abs(fwdZ);
      for (const sig of city.trafficSignals) {
        sig.state = movingEW ? SignalAxisState.EWGreen : SignalAxisState.NSGreen;
        sig.timer = 7.5;
      }
      pickedGreenWave = true;
    }
  }

  // 10. Check Roadside Fire Hydrant Geyser Splash (cools Turbo engine!)
  for (const sp of city.streetProps) {
    if (sp.kind !== 'hydrant') continue;
    if (sp.geyserTimer && sp.geyserTimer > 0) {
      sp.geyserTimer = Math.max(0, sp.geyserTimer - clampedDt);
    } else if (
      truck.speed > 4.2 &&
      Math.hypot(truck.x - sp.x, truck.z - sp.z) < 1.38
    ) {
      sp.geyserTimer = 2.8;
      truck.boostCooldown = Math.max(0, truck.boostCooldown - 1.4);
      splashedHydrantPos = { x: sp.x, z: sp.z };
    }
  }

  return {
    hitCurb,
    absorbedCurbWithShock,
    triggeredBoostPad,
    activatedManualBoost,
    activatedJumpRamp,
    pickedGreenWave,
    splashedHydrantPos,
    issuedTicket,
    crashEvents,
  };
}

/**
 * Steps 4-phase intersection Traffic Signals:
 * EWGreen (6.5s) -> EWYellow (1.8s) -> NSGreen (6.5s) -> NSYellow (1.8s)
 */
export function stepTrafficSignals(signals: TrafficSignal[], dt: number): void {
  const clampedDt = Math.min(dt, 0.05);
  for (const sig of signals) {
    sig.timer -= clampedDt;
    if (sig.timer <= 0) {
      if (sig.state === SignalAxisState.EWGreen) {
        sig.state = SignalAxisState.EWYellow;
        sig.timer = 1.8;
      } else if (sig.state === SignalAxisState.EWYellow) {
        sig.state = SignalAxisState.NSGreen;
        sig.timer = 6.5;
      } else if (sig.state === SignalAxisState.NSGreen) {
        sig.state = SignalAxisState.NSYellow;
        sig.timer = 1.8;
      } else {
        sig.state = SignalAxisState.EWGreen;
        sig.timer = 6.5;
      }
    }
  }
}

/**
 * Steps Drive-Thru Roadside Espresso Boost Kiosks!
 */
export function stepCoffeeKiosks(
  kiosks: CoffeeKiosk[],
  truck: TruckState,
  dt: number,
): CoffeeKiosk | null {
  const clampedDt = Math.min(dt, 0.05);
  let picked: CoffeeKiosk | null = null;
  for (const k of kiosks) {
    if (k.cooldown > 0) {
      k.cooldown = Math.max(0, k.cooldown - clampedDt);
    } else if (
      !picked &&
      Math.hypot(truck.x - k.roadX, truck.z - k.roadZ) < 1.35
    ) {
      k.cooldown = 16.0;
      truck.boostCooldown = 0;
      truck.boostTimer = Math.max(truck.boostTimer, 1.45);
      truck.squashY = 0.8;
      truck.squashVel = 4.0;
      picked = k;
    }
  }
  return picked;
}

/**
 * Steps Roadside Wrench Mechanic Pit-Stop Garages (+1 Hull HP & Bumper Shield!)
 */
export function stepMechanicGarages(
  garages: MechanicGarage[],
  truck: TruckState,
  dt: number,
): MechanicGarage | null {
  const clampedDt = Math.min(dt, 0.05);
  let serviced: MechanicGarage | null = null;
  for (const g of garages) {
    if (g.cooldown > 0) {
      g.cooldown = Math.max(0, g.cooldown - clampedDt);
    } else if (
      !serviced &&
      (truck.health < truck.maxHealth || !truck.hasBumperShield) &&
      Math.hypot(truck.x - g.roadX, truck.z - g.roadZ) < 1.4
    ) {
      g.cooldown = 18.0;
      truck.health = Math.min(truck.maxHealth, truck.health + 1);
      truck.hasBumperShield = true;
      truck.squashY = 0.82;
      truck.squashVel = 3.8;
      serviced = g;
    }
  }
  return serviced;
}

/**
 * Steps Waddling Duckling Family Crossings + Polite Braking Bonus!
 */
export function stepDuckCrossings(
  ducks: DuckCrossing[],
  truck: TruckState,
  dt: number,
): DuckCrossing | null {
  const clampedDt = Math.min(dt, 0.05);
  let politeRewardDuck: DuckCrossing | null = null;

  for (const d of ducks) {
    d.phase += clampedDt * d.speed;
    if (d.speed > 0.95) {
      d.speed = Math.max(0.95, d.speed - clampedDt * 0.8);
    }
    const u = 0.5 - 0.5 * Math.cos(d.phase);
    const dirSign = Math.sin(d.phase) >= 0 ? 1 : -1;
    const dx = d.end.x - d.start.x;
    const dz = d.end.z - d.start.z;
    d.x = d.start.x + dx * u;
    d.z = d.start.z + dz * u;
    d.yaw = Math.atan2(dx * dirSign, dz * dirSign);

    const dist = Math.hypot(truck.x - d.x, truck.z - d.z);
    if (
      !d.politeBonusClaimed &&
      dist > 0.9 &&
      dist < 3.6 &&
      (truck.isBraking || (truck.speed > 0.1 && truck.speed < 3.4))
    ) {
      d.politeBonusClaimed = true;
      politeRewardDuck = d;
    }
  }
  return politeRewardDuck;
}

/**
 * Steps Moving Porch Customers smoothly oscillating along their courtyard front!
 */
export function stepMovingCustomers(
  stops: DeliveryStop[],
  visualClock: number,
): void {
  for (const s of stops) {
    if (s.delivered || !s.isMovingCustomer || !s.patrolStart || !s.patrolEnd) {
      continue;
    }
    const u = 0.5 + 0.5 * Math.sin(visualClock * 2.1 + s.index);
    s.liveCitizenX = s.patrolStart.x + (s.patrolEnd.x - s.patrolStart.x) * u;
    s.liveCitizenZ = s.patrolStart.z + (s.patrolEnd.z - s.patrolStart.z) * u;
  }
}

/**
 * Steps Rival Courier ("Zoomy Blitz") racing toward the Golden Bonus Drop!
 */
export function stepRivalCourier(
  rival: RivalCourier | null,
  truck: TruckState,
  dt: number,
): 'player_claimed' | 'rival_claimed' | null {
  if (!rival || rival.waypoints.length < 2) return null;
  const clampedDt = Math.min(dt, 0.05);

  if (rival.bumpTimer && rival.bumpTimer > 0) {
    rival.bumpTimer = Math.max(0, rival.bumpTimer - clampedDt);
  }
  if (rival.crashCooldown && rival.crashCooldown > 0) {
    rival.crashCooldown = Math.max(0, rival.crashCooldown - clampedDt);
  }
  if (rival.bumpVx || rival.bumpVz) {
    const bvx = rival.bumpVx ?? 0;
    const bvz = rival.bumpVz ?? 0;
    rival.x += bvx * clampedDt;
    rival.z += bvz * clampedDt;
    const decay = Math.exp(-9.5 * clampedDt);
    rival.bumpVx = Math.abs(bvx * decay) < 0.04 ? 0 : bvx * decay;
    rival.bumpVz = Math.abs(bvz * decay) < 0.04 ? 0 : bvz * decay;
  }

  const target = rival.waypoints[rival.waypointIndex];
  const dx = target.x - rival.x;
  const dz = target.z - rival.z;
  const dist = Math.hypot(dx, dz);

  if (dist < 0.2) {
    rival.waypointIndex = (rival.waypointIndex + 1) % rival.waypoints.length;
    const nextT = rival.waypoints[rival.waypointIndex];
    rival.yaw = Math.atan2(nextT.x - rival.x, nextT.z - rival.z);
  } else {
    const bumpSlow = (rival.bumpTimer ?? 0) > 0.15 ? 0.35 : 1.0;
    const step = Math.min(dist, rival.speed * bumpSlow * clampedDt);
    rival.x += (dx / dist) * step;
    rival.z += (dz / dist) * step;
    rival.yaw = Math.atan2(dx, dz);
  }

  if (!rival.bonusClaimed && !rival.rivalWonBonus) {
    const playerDist = Math.hypot(
      truck.x - rival.bonusDropPos.x,
      truck.z - rival.bonusDropPos.z,
    );
    if (playerDist < 1.85) {
      rival.bonusClaimed = true;
      return 'player_claimed';
    }
  }

  return null;
}

/**
 * Friendly Musical Horn [Q / H]: calms winding scooters, waves pedestrians, and hurries ducklings!
 */
export function triggerMusicalHorn(
  truck: TruckState,
  hazards: TrafficHazard[],
  pedestrians: SidewalkPedestrian[],
  ducks: DuckCrossing[],
): { calmedScooters: number; wavedPedestrians: number; hurriedDucks: number } | null {
  if (truck.hornCooldown > 0) return null;
  truck.hornCooldown = 1.05;

  let calmedScooters = 0;
  let wavedPedestrians = 0;
  let hurriedDucks = 0;

  for (const h of hazards) {
    if (
      h.kind === HazardKind.ScooterDash &&
      Math.hypot(truck.x - h.x, truck.z - h.z) < 11.5
    ) {
      h.calmedByHornTimer = 2.6;
      if (h.phase === HazardPhase.Windup) {
        h.phase = HazardPhase.Idle;
        h.phaseTimer = 2.6;
      }
      calmedScooters++;
    }
  }

  for (const p of pedestrians) {
    if (Math.hypot(truck.x - p.x, truck.z - p.z) < 7.5) {
      p.waveTimer = 1.35;
      wavedPedestrians++;
    }
  }

  for (const d of ducks) {
    if (Math.hypot(truck.x - d.x, truck.z - d.z) < 8.0) {
      d.speed = 2.25;
      hurriedDucks++;
    }
  }

  return { calmedScooters, wavedPedestrians, hurriedDucks };
}

/**
 * Obstacle-aware pedestrian locomotion physics
 */
export function stepPedestriansPhysics(
  pedestrians: SidewalkPedestrian[],
  city: GeneratedCity,
  truck: TruckState,
  dt: number,
): void {
  const clampedDt = Math.min(dt, 0.05);
  if (clampedDt <= 0 || pedestrians.length === 0) return;

  const N = city.totalGridSize;

  for (let i = 0; i < pedestrians.length; i++) {
    const p = pedestrians[i];
    if (p.waypoints.length < 2) continue;

    const distToTruck = Math.hypot(truck.x - p.x, truck.z - p.z);
    if (distToTruck < 3.3 && truck.speed > 1.8 && p.waveTimer <= 0) {
      p.waveTimer = 1.05;
    }

    if (p.waveTimer > 0) {
      p.waveTimer = Math.max(0, p.waveTimer - clampedDt);
      p.vx *= Math.exp(-10 * clampedDt);
      p.vz *= Math.exp(-10 * clampedDt);
      const lookTruckYaw = Math.atan2(truck.x - p.x, truck.z - p.z);
      let dYaw = lookTruckYaw - p.yaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      p.yaw += dYaw * (1 - Math.exp(-10 * clampedDt));
      continue;
    }

    if (p.pauseTimer > 0) {
      p.pauseTimer = Math.max(0, p.pauseTimer - clampedDt);
      p.vx *= Math.exp(-12 * clampedDt);
      p.vz *= Math.exp(-12 * clampedDt);
      continue;
    }

    const target = p.waypoints[p.waypointIndex];
    const toX = target.x - p.x;
    const toZ = target.z - p.z;
    const distTarget = Math.hypot(toX, toZ);

    if (distTarget < 0.16) {
      p.waypointIndex = (p.waypointIndex + 1) % p.waypoints.length;
      p.pauseTimer = 0.45 + ((i * 37) % 5) * 0.12;
      p.vx = 0;
      p.vz = 0;
      continue;
    }

    let desVx = (toX / distTarget) * p.walkSpeed;
    let desVz = (toZ / distTarget) * p.walkSpeed;

    let repX = 0;
    let repZ = 0;

    for (const t of city.trees) {
      const dx = p.x - t.x;
      const dz = p.z - t.z;
      if (Math.abs(dx) > 1.5 || Math.abs(dz) > 1.5) continue;
      const d = Math.hypot(dx, dz);
      const safeR = getTreeObstacleRadius(t) + PEDESTRIAN_RADIUS + 0.28;
      if (d > 0.001 && d < safeR) {
        const push = ((safeR - d) / safeR) * 2.8;
        repX += (dx / d) * push;
        repZ += (dz / d) * push;
      }
    }

    for (const sp of city.streetProps) {
      const dx = p.x - sp.x;
      const dz = p.z - sp.z;
      if (Math.abs(dx) > 1.5 || Math.abs(dz) > 1.5) continue;
      const d = Math.hypot(dx, dz);
      const safeR = getStreetPropObstacleRadius(sp) + PEDESTRIAN_RADIUS + 0.24;
      if (d > 0.001 && d < safeR) {
        const push = ((safeR - d) / safeR) * 2.6;
        repX += (dx / d) * push;
        repZ += (dz / d) * push;
      }
    }

    for (let j = 0; j < pedestrians.length; j++) {
      if (i === j) continue;
      const other = pedestrians[j];
      const dx = p.x - other.x;
      const dz = p.z - other.z;
      if (Math.abs(dx) > 0.95 || Math.abs(dz) > 0.95) continue;
      const d = Math.hypot(dx, dz);
      const personalSpace = PEDESTRIAN_RADIUS * 2 + 0.28;
      if (d > 0.001 && d < personalSpace) {
        const push = ((personalSpace - d) / personalSpace) * 2.2;
        repX += (dx / d - (dz / d) * 0.45) * push;
        repZ += (dz / d + (dx / d) * 0.45) * push;
      }
    }

    desVx += repX;
    desVz += repZ;
    const desMag = Math.hypot(desVx, desVz);
    if (desMag > p.walkSpeed * 1.15) {
      desVx = (desVx / desMag) * (p.walkSpeed * 1.15);
      desVz = (desVz / desMag) * (p.walkSpeed * 1.15);
    }

    const blend = 1 - Math.exp(-10.0 * clampedDt);
    p.vx += (desVx - p.vx) * blend;
    p.vz += (desVz - p.vz) * blend;

    const prevX = p.x;
    const prevZ = p.z;
    let candX = prevX + p.vx * clampedDt;
    let candZ = prevZ + p.vz * clampedDt;

    for (const t of city.trees) {
      const dx = candX - t.x;
      const dz = candZ - t.z;
      if (Math.abs(dx) > 1.3 || Math.abs(dz) > 1.3) continue;
      const minD = getTreeObstacleRadius(t) + PEDESTRIAN_RADIUS + 0.02;
      const d = Math.hypot(dx, dz);
      if (d < minD) {
        const nx = d > 0.0001 ? dx / d : 1;
        const nz = d > 0.0001 ? dz / d : 0;
        candX = t.x + nx * minD;
        candZ = t.z + nz * minD;
      }
    }

    for (const sp of city.streetProps) {
      const dx = candX - sp.x;
      const dz = candZ - sp.z;
      if (Math.abs(dx) > 1.3 || Math.abs(dz) > 1.3) continue;
      const minD = getStreetPropObstacleRadius(sp) + PEDESTRIAN_RADIUS + 0.02;
      const d = Math.hypot(dx, dz);
      if (d < minD) {
        const nx = d > 0.0001 ? dx / d : 1;
        const nz = d > 0.0001 ? dz / d : 0;
        candX = sp.x + nx * minD;
        candZ = sp.z + nz * minD;
      }
    }

    const gcCenter = worldToGrid(candX, candZ, N);
    const tileOk = isWalkablePedestrianTile(city.tiles[gcCenter.row]?.[gcCenter.col]);
    const fullClear =
      tileOk &&
      isPedestrianPointClear(
        candX,
        candZ,
        city.tiles,
        N,
        city.trees,
        city.streetProps,
        city.stops,
        city.brickWalls,
        0.0,
        city.coffeeKiosks,
        city.mechanicGarages,
      );

    if (fullClear) {
      p.x = candX;
      p.z = candZ;
    } else {
      p.x = prevX;
      p.z = prevZ;
      p.vx = 0;
      p.vz = 0;
      p.waypointIndex = (p.waypointIndex + 1) % p.waypoints.length;
      p.pauseTimer = 0.35;
    }

    const moved = Math.hypot(p.x - prevX, p.z - prevZ);
    p.strideDistance += moved;

    if (moved > 0.0015) {
      const targetYaw = Math.atan2(p.x - prevX, p.z - prevZ);
      let dYaw = targetYaw - p.yaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      p.yaw += dYaw * (1 - Math.exp(-12.0 * clampedDt));
    }
  }
}

export function getActiveStop(stops: DeliveryStop[]): DeliveryStop | null {
  for (const s of stops) {
    if (!s.delivered) return s;
  }
  return null;
}

export interface DeliveryCheck {
  canAutoDrop: boolean;
  canExpressToss: boolean;
  canBullseyeToss: boolean;
  needsBrakeForLarge: boolean;
  distance: number;
}

export function checkDeliveryEligibility(
  truck: TruckState,
  stop: DeliveryStop | null,
  totalGridSize: number,
): DeliveryCheck {
  if (!stop || stop.delivered) {
    return {
      canAutoDrop: false,
      canExpressToss: false,
      canBullseyeToss: false,
      needsBrakeForLarge: false,
      distance: Infinity,
    };
  }
  const spec = VEHICLE_SPECS[truck.vehicleId] ?? VEHICLE_SPECS[VehicleId.ClassicVan];
  const padPos = gridToWorld(stop.roadCoord, totalGridSize);
  const baseCitizen = gridToWorld(stop.citizenCoord, totalGridSize);
  const cx = stop.liveCitizenX ?? baseCitizen.x;
  const cz = stop.liveCitizenZ ?? baseCitizen.z;

  const distPad = Math.hypot(truck.x - padPos.x, truck.z - padPos.z);
  const distCitizen = Math.hypot(truck.x - cx, truck.z - cz);
  const effectiveTossDist = Math.min(distPad, distCitizen);
  const isBullseye =
    distPad <= BULLSEYE_PAD_RADIUS ||
    (effectiveTossDist >= 1.55 && effectiveTossDist <= 2.6);

  if (stop.parcelKind === ParcelKind.Large) {
    const inLargeZone =
      distPad <= LARGE_UNLOAD_RADIUS ||
      effectiveTossDist <= LARGE_UNLOAD_RADIUS + 0.25;
    const slowEnough = truck.speed <= LARGE_MAX_UNLOAD_SPEED;
    return {
      canAutoDrop: distPad <= AUTO_DROP_RADIUS && slowEnough,
      canExpressToss: inLargeZone && slowEnough,
      canBullseyeToss: distPad <= BULLSEYE_PAD_RADIUS && slowEnough,
      needsBrakeForLarge: inLargeZone && !slowEnough,
      distance: effectiveTossDist,
    };
  }

  if (
    stop.parcelKind === ParcelKind.Small ||
    stop.parcelKind === ParcelKind.HotExpress
  ) {
    const maxRange = SMALL_TOSS_RADIUS + spec.smallTossRangeBonus;
    const canToss = effectiveTossDist <= maxRange;
    return {
      canAutoDrop: distPad <= AUTO_DROP_RADIUS,
      canExpressToss: canToss,
      canBullseyeToss: canToss && isBullseye,
      needsBrakeForLarge: false,
      distance: effectiveTossDist,
    };
  }

  // ParcelKind.Fragile
  const fragRange = EXPRESS_TOSS_RADIUS + spec.smallTossRangeBonus * 0.5;
  const canToss = effectiveTossDist <= fragRange;
  return {
    canAutoDrop: distPad <= AUTO_DROP_RADIUS,
    canExpressToss: canToss,
    canBullseyeToss: canToss && isBullseye,
    needsBrakeForLarge: false,
    distance: effectiveTossDist,
  };
}

export interface DeliveryReward {
  pointsAwarded: number;
  coinsAwarded: number;
  timeBonusSec: number;
  nextCombo: number;
  pristineBonus: number;
  thermalBonus: number;
  bullseyeBonus: number;
  vipBonus: number;
  isFever: boolean;
}

export function calculateDeliveryScore(
  currentCombo: number,
  comboTimer: number,
  viaExpressToss: boolean,
  level: number,
  parcelKind: ParcelKind = ParcelKind.Small,
  fragileIntact: boolean = true,
  options?: {
    bullseye?: boolean;
    thermalTimer?: number;
    vipRole?: VIPRole;
    ticketsCount?: number;
  },
): DeliveryReward {
  const bullseye = Boolean(options?.bullseye);
  const thermalTimer = options?.thermalTimer ?? 0;
  const vipRole = options?.vipRole ?? 'none';
  const ticketsCount = options?.ticketsCount ?? 0;

  const comboStep = bullseye ? 2 : 1;
  const nextCombo = comboTimer > 0 ? currentCombo + comboStep : comboStep;
  const isFever = nextCombo >= FEVER_COMBO_THRESHOLD;

  const kindBase =
    parcelKind === ParcelKind.Large
      ? 260
      : parcelKind === ParcelKind.HotExpress
        ? 210
        : parcelKind === ParcelKind.Fragile
          ? 185
          : 150;
  const basePoints = kindBase + (level - 1) * 25;
  const tossBonus = viaExpressToss ? 75 : 0;
  const pristineBonus =
    parcelKind === ParcelKind.Fragile && fragileIntact ? 90 : 0;
  const thermalBonus =
    parcelKind === ParcelKind.HotExpress && thermalTimer > 0 ? 110 : 0;
  const bullseyeBonus = bullseye ? 85 : 0;
  const vipBonus =
    vipRole === 'chef'
      ? 90
      : vipRole === 'captain'
        ? 100
        : vipRole === 'mayor' && ticketsCount === 0
          ? 120
          : 0;

  const comboMultiplier = (1 + (nextCombo - 1) * 0.25) * (isFever ? 1.25 : 1.0);
  const pointsAwarded = Math.round(
    (basePoints +
      tossBonus +
      pristineBonus +
      thermalBonus +
      bullseyeBonus +
      vipBonus) *
      comboMultiplier,
  );

  const mayorTimeExtra = vipRole === 'mayor' && ticketsCount === 0 ? 5 : 0;
  const timeBonusSec =
    (parcelKind === ParcelKind.Large ? 5 : viaExpressToss ? 4 : 3) +
    mayorTimeExtra;

  const coinsAwarded =
    (25 + (bullseye ? 15 : 0) + (vipBonus > 0 ? 20 : 0)) * (isFever ? 2 : 1);

  return {
    pointsAwarded,
    coinsAwarded,
    timeBonusSec,
    nextCombo,
    pristineBonus,
    thermalBonus,
    bullseyeBonus,
    vipBonus,
    isFever,
  };
}

export interface HazardStepEvents {
  startedWindups: TrafficHazard[];
  playerHitBy: TrafficHazard | null;
  shieldAbsorbed: boolean;
  nearMissCount: number;
  crashEvents: CrashEvent[];
  honkEvents: HonkEvent[];
}

function clampHazardMove(
  city: GeneratedCity | undefined,
  curX: number,
  curZ: number,
  candX: number,
  candZ: number,
): { x: number; z: number; moved: boolean } {
  if (!city || isPositionDrivable(city, candX, candZ, 0.32, 0)) {
    return { x: candX, z: candZ, moved: true };
  }
  if (isPositionDrivable(city, candX, curZ, 0.32, 0)) {
    return { x: candX, z: curZ, moved: true };
  }
  if (isPositionDrivable(city, curX, candZ, 0.32, 0)) {
    return { x: curX, z: candZ, moved: true };
  }
  return { x: curX, z: curZ, moved: false };
}

export function stepHazardsAndCollisions(
  hazards: TrafficHazard[],
  truck: TruckState,
  dt: number,
  signals: TrafficSignal[] = [],
  city?: GeneratedCity,
): HazardStepEvents {
  const clampedDt = Math.min(dt, 0.05);
  const startedWindups: TrafficHazard[] = [];
  let playerHitBy: TrafficHazard | null = null;
  let shieldAbsorbed = false;
  let nearMissCount = 0;
  const crashEvents: CrashEvent[] = [];
  const honkEvents: HonkEvent[] = [];

  let activeScooterAttackers = hazards.filter(
    (h) =>
      h.kind === HazardKind.ScooterDash &&
      (h.phase === HazardPhase.Windup || h.phase === HazardPhase.Active),
  ).length;

  for (let i = 0; i < hazards.length; i++) {
    const h = hazards[i];
    if (h.nearMissCooldown && h.nearMissCooldown > 0) {
      h.nearMissCooldown = Math.max(0, h.nearMissCooldown - clampedDt);
    }
    if (h.calmedByHornTimer && h.calmedByHornTimer > 0) {
      h.calmedByHornTimer = Math.max(0, h.calmedByHornTimer - clampedDt);
    }
    if (h.bumpTimer && h.bumpTimer > 0) {
      h.bumpTimer = Math.max(0, h.bumpTimer - clampedDt);
    }
    if (h.crashCooldown && h.crashCooldown > 0) {
      h.crashCooldown = Math.max(0, h.crashCooldown - clampedDt);
    }
    if (h.honkCooldown && h.honkCooldown > 0) {
      h.honkCooldown = Math.max(0, h.honkCooldown - clampedDt);
    }
    if (h.honkVisualTimer && h.honkVisualTimer > 0) {
      h.honkVisualTimer = Math.max(0, h.honkVisualTimer - clampedDt);
    }
    if (h.bumpVx || h.bumpVz) {
      const bvx = h.bumpVx ?? 0;
      const bvz = h.bumpVz ?? 0;
      const stepped = clampHazardMove(
        city,
        h.x,
        h.z,
        h.x + bvx * clampedDt,
        h.z + bvz * clampedDt,
      );
      h.x = stepped.x;
      h.z = stepped.z;
      const decay = Math.exp(-9.5 * clampedDt);
      h.bumpVx = Math.abs(bvx * decay) < 0.04 ? 0 : bvx * decay;
      h.bumpVz = Math.abs(bvz * decay) < 0.04 ? 0 : bvz * decay;
    }

    if (h.kind === HazardKind.Cruiser) {
      const target = h.waypoints[h.waypointIndex];
      const dx = target.x - h.x;
      const dz = target.z - h.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 0.16) {
        h.waypointIndex = (h.waypointIndex + 1) % h.waypoints.length;
        const nextT = h.waypoints[h.waypointIndex];
        h.yaw = Math.atan2(nextT.x - h.x, nextT.z - h.z);
      } else {
        const dirX = dx / dist;
        const dirZ = dz / dist;
        h.yaw = Math.atan2(dirX, dirZ);

        let mustStop = false;
        for (const sig of signals) {
          const sx = sig.x - h.x;
          const sz = sig.z - h.z;
          const aheadProj = sx * dirX + sz * dirZ;
          const latProj = Math.abs(sx * -dirZ + sz * dirX);
          if (aheadProj > 1.05 && aheadProj < 2.35 && latProj < 0.85) {
            const movingEW = Math.abs(dirX) >= Math.abs(dirZ);
            const greenForMe = movingEW
              ? sig.state === SignalAxisState.EWGreen
              : sig.state === SignalAxisState.NSGreen;
            if (!greenForMe) {
              mustStop = true;
              break;
            }
          }
        }

        if (!mustStop) {
          for (let j = 0; j < hazards.length; j++) {
            if (i === j) continue;
            const other = hazards[j];
            const ox = other.x - h.x;
            const oz = other.z - h.z;
            const ahead = ox * dirX + oz * dirZ;
            const lat = Math.abs(ox * -dirZ + oz * dirX);

            if (other.kind === HazardKind.BridgeGate) {
              if (
                other.phase !== HazardPhase.Idle &&
                ahead > 0.55 &&
                ahead < 2.45 &&
                lat < 0.9
              ) {
                mustStop = true;
                break;
              }
              continue;
            }

            if (other.kind === HazardKind.Cruiser) {
              const cosDiff = Math.cos(other.yaw - h.yaw);
              // Same-lane queuing OR crossing-vehicle yield inside an intersection
              if (cosDiff > 0.55 && ahead > 0.45 && ahead < 2.25 && lat < 0.52) {
                mustStop = true;
                break;
              }
              if (
                Math.abs(cosDiff) <= 0.55 &&
                ahead > 0.35 &&
                ahead < 1.85 &&
                lat < 0.68 &&
                other.currentSpeed > 0.4
              ) {
                // Deterministic tie-breaker so two perpendicular cars don't deadlock forever
                if (i > j || other.currentSpeed > h.currentSpeed + 0.3) {
                  mustStop = true;
                  break;
                }
              }
            } else if (
              other.kind === HazardKind.ScooterDash &&
              other.phase === HazardPhase.Active &&
              ahead > 0.3 &&
              ahead < 2.0 &&
              lat < 0.65
            ) {
              mustStop = true;
              break;
            }
          }
        }

        // Politely yield behind a slow/stopped Player Van in the same lane so AI cars don't endlessly rear-end a parked player
        if (!mustStop && truck.y < 0.4 && truck.speed < 2.5) {
          const tx = truck.x - h.x;
          const tz = truck.z - h.z;
          const ahead = tx * dirX + tz * dirZ;
          const lat = Math.abs(tx * -dirZ + tz * dirX);
          if (ahead > 0.6 && ahead < 2.25 && lat < 0.55) {
            mustStop = true;
          }
        }

        if (!mustStop && city?.rivalCourier) {
          const rx = city.rivalCourier.x - h.x;
          const rz = city.rivalCourier.z - h.z;
          const ahead = rx * dirX + rz * dirZ;
          const lat = Math.abs(rx * -dirZ + rz * dirX);
          if (ahead > 0.5 && ahead < 2.05 && lat < 0.55) {
            mustStop = true;
          }
        }

        h.stoppedAtSignal = mustStop;
        h.stoppedDuration = mustStop ? (h.stoppedDuration ?? 0) + clampedDt : 0;

        // Ambient AI Car & Minibus Honking when queued at signals/intersections or buzzed closely by player!
        if (honkEvents.length < 2 && (h.honkCooldown ?? 0) <= 0) {
          const distToTruck = Math.hypot(truck.x - h.x, truck.z - h.z);
          const impatientQueue =
            mustStop &&
            (h.stoppedDuration ?? 0) >= 1.25 + (i % 3) * 0.45 &&
            distToTruck <= 32;
          const startledBySpeedingVan =
            distToTruck < 4.6 && truck.speed > 5.4 && truck.y < 0.4;
          if (impatientQueue || startledBySpeedingVan) {
            h.honkCooldown = 5.4 + (i % 4) * 1.5;
            h.honkVisualTimer = 0.72;
            honkEvents.push({
              hazardId: h.id,
              x: h.x,
              z: h.z,
              isBus: Boolean(h.isBus),
            });
          }
        }

        const targetSpd = mustStop || (h.bumpTimer ?? 0) > 0.18 ? 0 : h.speed;
        h.currentSpeed +=
          (targetSpd - h.currentSpeed) * (1 - Math.exp(-11.0 * clampedDt));
        if (h.currentSpeed > 0.02) {
          const step = Math.min(dist, h.currentSpeed * clampedDt);
          const candX = h.x + dirX * step;
          const candZ = h.z + dirZ * step;
          if (!city || isPositionDrivable(city, candX, candZ, 0.32, 0)) {
            h.x = candX;
            h.z = candZ;
          } else {
            h.currentSpeed = 0;
          }
        }
      }
    } else if (h.kind === HazardKind.ScooterDash) {
      h.phaseTimer -= clampedDt;
      if (h.phase === HazardPhase.Idle) {
        const distToPlayer = Math.hypot(truck.x - h.x, truck.z - h.z);
        if (
          (h.calmedByHornTimer ?? 0) <= 0 &&
          h.phaseTimer <= 0 &&
          distToPlayer < 12.5 &&
          activeScooterAttackers < MAX_CONCURRENT_SCOOTER_ATTACKS
        ) {
          h.phase = HazardPhase.Windup;
          h.phaseTimer = 0.65;
          activeScooterAttackers++;
          startedWindups.push(h);
        }
      } else if (h.phase === HazardPhase.Windup) {
        const dx = h.dashEnd.x - h.x;
        const dz = h.dashEnd.z - h.z;
        h.yaw = Math.atan2(dx, dz);
        if (h.phaseTimer <= 0) {
          h.phase = HazardPhase.Active;
          h.phaseTimer = 2.8;
        }
      } else if (h.phase === HazardPhase.Active) {
        const dx = h.dashEnd.x - h.x;
        const dz = h.dashEnd.z - h.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.25 || h.phaseTimer <= 0) {
          const revYaw = Math.atan2(
            h.dashStart.x - h.dashEnd.x,
            h.dashStart.z - h.dashEnd.z,
          );
          const shiftX = -Math.cos(revYaw) * (RIGHT_LANE_OFFSET * 2);
          const shiftZ = Math.sin(revYaw) * (RIGHT_LANE_OFFSET * 2);
          const nextStart = {
            x: h.dashEnd.x + shiftX,
            z: h.dashEnd.z + shiftZ,
          };
          const nextEnd = {
            x: h.dashStart.x + shiftX,
            z: h.dashStart.z + shiftZ,
          };
          h.dashStart = nextStart;
          h.dashEnd = nextEnd;
          h.x = nextStart.x;
          h.z = nextStart.z;
          h.yaw = revYaw;
          h.phase = HazardPhase.Recovery;
          h.phaseTimer = 1.4;
        } else {
          const slowMult = (h.bumpTimer ?? 0) > 0.15 ? 0.35 : 1.0;
          const step = Math.min(dist, h.speed * slowMult * clampedDt);
          h.x += (dx / dist) * step;
          h.z += (dz / dist) * step;
          h.yaw = Math.atan2(dx, dz);
        }
      } else if (h.phase === HazardPhase.Recovery) {
        if (h.phaseTimer <= 0) {
          h.phase = HazardPhase.Idle;
          h.phaseTimer = 0.8;
        }
      }
    } else if (h.kind === HazardKind.BridgeGate) {
      h.phaseTimer -= clampedDt;
      if (h.phase === HazardPhase.Idle && h.phaseTimer <= 0) {
        h.phase = HazardPhase.Windup;
        h.phaseTimer = 1.25;
        startedWindups.push(h);
      } else if (h.phase === HazardPhase.Windup && h.phaseTimer <= 0) {
        h.phase = HazardPhase.Active;
        h.phaseTimer = 2.2;
      } else if (h.phase === HazardPhase.Active && h.phaseTimer <= 0) {
        h.phase = HazardPhase.Idle;
        h.phaseTimer = 4.6;
      }
    }
  }

  // 2. Pairwise AI-vs-AI Solid 3D Capsule Separation (Zero Ghosting Between Cars/Scooters/Rival!)
  for (let i = 0; i < hazards.length; i++) {
    const a = hazards[i];
    if (a.kind === HazardKind.BridgeGate) continue;
    const specA = getHazardCapsuleSpec(a);

    for (let j = i + 1; j < hazards.length; j++) {
      const b = hazards[j];
      if (b.kind === HazardKind.BridgeGate) continue;
      if (Math.abs(a.x - b.x) > 2.4 || Math.abs(a.z - b.z) > 2.4) continue;

      const specB = getHazardCapsuleSpec(b);
      const contact = closestCapsuleContact(
        a.x,
        a.z,
        a.yaw,
        specA,
        b.x,
        b.z,
        b.yaw,
        specB,
      );
      if (contact.penetration > 0) {
        const totalSep = contact.penetration + 0.024;
        const origAx = a.x;
        const origAz = a.z;
        const moveA = clampHazardMove(
          city,
          a.x,
          a.z,
          a.x + contact.nx * (totalSep * 0.52),
          a.z + contact.nz * (totalSep * 0.52),
        );
        a.x = moveA.x;
        a.z = moveA.z;
        const movedA = (a.x - origAx) * contact.nx + (a.z - origAz) * contact.nz;
        const remForB = Math.max(totalSep * 0.52, totalSep - movedA);
        const origBx = b.x;
        const origBz = b.z;
        const moveB = clampHazardMove(
          city,
          b.x,
          b.z,
          b.x - contact.nx * remForB,
          b.z - contact.nz * remForB,
        );
        b.x = moveB.x;
        b.z = moveB.z;
        const movedB = (origBx - b.x) * contact.nx + (origBz - b.z) * contact.nz;
        if (movedA + movedB < totalSep - 0.002) {
          const extraA = totalSep - (movedA + movedB);
          const moveA2 = clampHazardMove(
            city,
            a.x,
            a.z,
            a.x + contact.nx * extraA,
            a.z + contact.nz * extraA,
          );
          a.x = moveA2.x;
          a.z = moveA2.z;
        }

        const aSpd = a.kind === HazardKind.Cruiser ? a.currentSpeed : a.phase === HazardPhase.Active ? a.speed : 0;
        const bSpd = b.kind === HazardKind.Cruiser ? b.currentSpeed : b.phase === HazardPhase.Active ? b.speed : 0;
        const relSpd = Math.hypot(
          Math.sin(a.yaw) * aSpd - Math.sin(b.yaw) * bSpd,
          Math.cos(a.yaw) * aSpd - Math.cos(b.yaw) * bSpd,
        );

        a.currentSpeed *= 0.25;
        b.currentSpeed *= 0.25;
        a.bumpVx = contact.nx * 1.9;
        a.bumpVz = contact.nz * 1.9;
        b.bumpVx = -contact.nx * 1.9;
        b.bumpVz = -contact.nz * 1.9;
        a.bumpTimer = Math.max(a.bumpTimer ?? 0, 0.36);
        b.bumpTimer = Math.max(b.bumpTimer ?? 0, 0.36);

        if (
          (relSpd > 0.85 || contact.penetration > 0.06) &&
          (a.crashCooldown ?? 0) <= 0 &&
          (b.crashCooldown ?? 0) <= 0
        ) {
          a.crashCooldown = 0.9;
          b.crashCooldown = 0.9;
          crashEvents.push({
            x: contact.cx,
            y: 0.48,
            z: contact.cz,
            nx: contact.nx,
            nz: contact.nz,
            kind: 'ai_vehicle',
            severity: 'bump',
            label: 'Traffic Fender-Bender!',
            involvesPlayer: false,
            hazardId: a.id,
          });
        }
      }
    }

    // AI Hazard vs Rival Courier ("Zoomy Blitz") solid separation
    if (city?.rivalCourier) {
      const rv = city.rivalCourier;
      if (Math.abs(a.x - rv.x) <= 2.4 && Math.abs(a.z - rv.z) <= 2.4) {
        const contact = closestCapsuleContact(
          a.x,
          a.z,
          a.yaw,
          specA,
          rv.x,
          rv.z,
          rv.yaw,
          RIVAL_CAPSULE,
        );
        if (contact.penetration > 0) {
          const halfPush = contact.penetration * 0.54 + 0.012;
          const moveA = clampHazardMove(
            city,
            a.x,
            a.z,
            a.x + contact.nx * halfPush,
            a.z + contact.nz * halfPush,
          );
          const moveRv = clampHazardMove(
            city,
            rv.x,
            rv.z,
            rv.x - contact.nx * halfPush,
            rv.z - contact.nz * halfPush,
          );
          a.x = moveA.x;
          a.z = moveA.z;
          rv.x = moveRv.x;
          rv.z = moveRv.z;
          a.currentSpeed *= 0.25;
          a.bumpTimer = Math.max(a.bumpTimer ?? 0, 0.36);
          rv.bumpTimer = Math.max(rv.bumpTimer ?? 0, 0.36);
        }
      }
    }
  }

  // 3. Unconditional Solid 3D Hero Van vs Hazards & Rival Courier Separation + Crash Events
  if (truck.y < 0.45) {
    for (let i = 0; i < hazards.length; i++) {
      const h = hazards[i];
      if (h.kind === HazardKind.BridgeGate) continue;
      if (Math.abs(truck.x - h.x) > 2.6 || Math.abs(truck.z - h.z) > 2.6) continue;

      const specH = getHazardCapsuleSpec(h);
      const contact = closestCapsuleContact(
        truck.x,
        truck.z,
        truck.yaw,
        TRUCK_CAPSULE,
        h.x,
        h.z,
        h.yaw,
        specH,
      );

      if (contact.penetration > 0) {
        // Always separate physically even if truck.invulnTimer > 0 so vehicles NEVER ghost through each other!
        const totalSep = contact.penetration + 0.025;
        const origHx = h.x;
        const origHz = h.z;
        const moveH = clampHazardMove(
          city,
          h.x,
          h.z,
          h.x - contact.nx * (totalSep * 0.38),
          h.z - contact.nz * (totalSep * 0.38),
        );
        h.x = moveH.x;
        h.z = moveH.z;
        const hazMoved = (origHx - h.x) * contact.nx + (origHz - h.z) * contact.nz;
        const remTruck = Math.max(totalSep * 0.65, totalSep - hazMoved);
        const candTruckX = truck.x + contact.nx * remTruck;
        const candTruckZ = truck.z + contact.nz * remTruck;
        if (!city || isPositionDrivable(city, candTruckX, candTruckZ, TRUCK_RADIUS * 0.9, truck.y)) {
          truck.x = candTruckX;
          truck.z = candTruckZ;
        } else {
          const moveHFull = clampHazardMove(
            city,
            h.x,
            h.z,
            h.x - contact.nx * (totalSep - hazMoved),
            h.z - contact.nz * (totalSep - hazMoved),
          );
          h.x = moveHFull.x;
          h.z = moveHFull.z;
        }

        const hazSpd =
          h.kind === HazardKind.Cruiser
            ? h.currentSpeed
            : h.phase === HazardPhase.Active
              ? h.speed
              : 0;
        const relVn =
          (truck.vx - Math.sin(h.yaw) * hazSpd) * contact.nx +
          (truck.vz - Math.cos(h.yaw) * hazSpd) * contact.nz;

        const reboundSpd = Math.max(3.6, Math.min(6.4, Math.abs(relVn) * 0.55 + 3.1));
        truck.vx = contact.nx * reboundSpd;
        truck.vz = contact.nz * reboundSpd;
        truck.boostTimer = 0;
        truck.wallCrashCooldown = Math.max(truck.wallCrashCooldown ?? 0, 0.38);

        h.currentSpeed *= 0.2;
        h.bumpVx = -contact.nx * 3.2;
        h.bumpVz = -contact.nz * 3.2;
        h.bumpTimer = 0.48;

        const canHurt =
          h.kind === HazardKind.Cruiser ||
          h.phase === HazardPhase.Active ||
          truck.speed > 2.6;

        let heavyCrash = false;
        if (!playerHitBy && truck.invulnTimer <= 0 && canHurt) {
          playerHitBy = h;
          heavyCrash = true;
          if (truck.hasBumperShield) {
            truck.hasBumperShield = false;
            shieldAbsorbed = true;
            truck.invulnTimer = 1.25;
            truck.squashY = 1.16;
            truck.squashVel = -2.6;
          } else {
            truck.health = Math.max(0, truck.health - 1);
            truck.fragileIntact = false;
            truck.invulnTimer = 1.65;
            truck.squashY = 1.26;
            truck.squashVel = -3.9;
            truck.pitchAngle = 0.095;
          }
        } else {
          truck.squashY = Math.max(truck.squashY, 1.14);
          truck.squashVel = Math.min(truck.squashVel, -2.2);
        }

        if ((h.crashCooldown ?? 0) <= 0) {
          h.crashCooldown = 0.52;
          if (h.kind === HazardKind.Cruiser) {
            h.honkVisualTimer = 0.75;
          }
          crashEvents.push({
            x: contact.cx,
            y: 0.54,
            z: contact.cz,
            nx: contact.nx,
            nz: contact.nz,
            kind: 'vehicle',
            severity: heavyCrash ? 'crash' : 'bump',
            label: h.isBus
              ? 'Minibus Crash!'
              : h.kind === HazardKind.ScooterDash
                ? 'Scooter Fender-Bender!'
                : 'Traffic Crash!',
            involvesPlayer: true,
            hazardId: h.id,
          });
        }
      } else if (
        truck.invulnTimer <= 0 &&
        (h.kind === HazardKind.Cruiser ||
          (h.kind === HazardKind.ScooterDash && h.phase === HazardPhase.Active))
      ) {
        const surfaceGap = -contact.penetration;
        if (
          surfaceGap >= 0.02 &&
          surfaceGap <= 0.72 &&
          truck.speed > 5.0 &&
          !truck.isWrongWay &&
          (h.nearMissCooldown ?? 0) <= 0
        ) {
          h.nearMissCooldown = 4.5;
          truck.boostCooldown = Math.max(0, truck.boostCooldown - 0.85);
          nearMissCount += 1;
        }
      }
    }

    // Solid 3D Hero Van vs Rival Courier ("Zoomy Blitz") Collision & Trading-Paint Bounce!
    if (city?.rivalCourier) {
      const rv = city.rivalCourier;
      if (Math.abs(truck.x - rv.x) <= 2.6 && Math.abs(truck.z - rv.z) <= 2.6) {
        const contact = closestCapsuleContact(
          truck.x,
          truck.z,
          truck.yaw,
          TRUCK_CAPSULE,
          rv.x,
          rv.z,
          rv.yaw,
          RIVAL_CAPSULE,
        );
        if (contact.penetration > 0) {
          const totalSep = contact.penetration + 0.025;
          const origRvX = rv.x;
          const origRvZ = rv.z;
          const moveRv = clampHazardMove(
            city,
            rv.x,
            rv.z,
            rv.x - contact.nx * (totalSep * 0.45),
            rv.z - contact.nz * (totalSep * 0.45),
          );
          rv.x = moveRv.x;
          rv.z = moveRv.z;
          const rvMoved = (origRvX - rv.x) * contact.nx + (origRvZ - rv.z) * contact.nz;
          const remTruck = Math.max(totalSep * 0.58, totalSep - rvMoved);
          const candTruckX = truck.x + contact.nx * remTruck;
          const candTruckZ = truck.z + contact.nz * remTruck;
          if (isPositionDrivable(city, candTruckX, candTruckZ, TRUCK_RADIUS * 0.9, truck.y)) {
            truck.x = candTruckX;
            truck.z = candTruckZ;
          } else {
            const moveRvFull = clampHazardMove(
              city,
              rv.x,
              rv.z,
              rv.x - contact.nx * (totalSep - rvMoved),
              rv.z - contact.nz * (totalSep - rvMoved),
            );
            rv.x = moveRvFull.x;
            rv.z = moveRvFull.z;
          }

          truck.vx = contact.nx * 4.4;
          truck.vz = contact.nz * 4.4;
          truck.wallCrashCooldown = Math.max(truck.wallCrashCooldown ?? 0, 0.38);
          truck.squashY = 1.2;
          truck.squashVel = -3.1;
          if (!truck.hasBumperShield) {
            truck.fragileIntact = false;
          }

          rv.bumpVx = -contact.nx * 3.8;
          rv.bumpVz = -contact.nz * 3.8;
          rv.bumpTimer = 0.5;

          if ((rv.crashCooldown ?? 0) <= 0) {
            rv.crashCooldown = 0.55;
            crashEvents.push({
              x: contact.cx,
              y: 0.56,
              z: contact.cz,
              nx: contact.nx,
              nz: contact.nz,
              kind: 'rival',
              severity: 'crash',
              label: 'Bumped Zoomy Blitz!',
              involvesPlayer: true,
              rivalHit: true,
            });
          }
        }
      }
    }
  }

  return {
    startedWindups,
    playerHitBy,
    shieldAbsorbed,
    nearMissCount,
    crashEvents,
    honkEvents,
  };
}

export function evaluateRunStatus(
  stops: DeliveryStop[],
  timeRemainingSec: number,
  health: number,
): OutcomeKind {
  if (stops.length > 0 && stops.every((s) => s.delivered)) {
    return OutcomeKind.Victory;
  }
  if (health <= 0) {
    return OutcomeKind.Breakdown;
  }
  if (timeRemainingSec <= 0) {
    return OutcomeKind.OutOfTime;
  }
  return OutcomeKind.None;
}

/**
 * Pure 3 - 2 - 1 - GO! Bird's-Eye Camera Swoop & Rocket Start Timing Mini-Game State Machine
 */
export type CountdownMode = 'full' | 'quick' | 'instant';

export interface StartCountdownState {
  mode: CountdownMode;
  totalSec: number;
  remainingSec: number; // > 0 during 3..2..1, <= 0 once GO! unlocks driving
  goHoldSec: number; // > 0 while "GO!" badge stays on screen after unlock
  stage: CountdownStage;
  isFrozen: boolean; // True while 3..2..1 is counting down (shift timer & truck motion paused)
  swoopAlpha: number; // 0 = high bird's-eye island overview, 1 = locked into chase camera
  earlyLocked: boolean; // True if throttle was mashed too early without releasing
  primed: boolean; // True if throttle was timed cleanly in the "1" sweet-spot window
  rocketStatus: RocketStartStatus;
}

export interface CountdownStepEvents {
  changedStage: CountdownStage;
  justUnlockedGo: boolean;
  triggeredRocketStart: boolean;
  triggeredSputter: boolean;
  revIntensity: number; // > 0 when van should rumble & puff exhaust during countdown
}

export const ROCKET_START_POINTS = 75;
export const ROCKET_START_BOOST_SEC = 1.55;

export function createStartCountdownState(
  mode: CountdownMode = 'full',
): StartCountdownState {
  if (mode === 'instant') {
    return {
      mode,
      totalSec: 0,
      remainingSec: 0,
      goHoldSec: 0,
      stage: null,
      isFrozen: false,
      swoopAlpha: 1,
      earlyLocked: false,
      primed: false,
      rocketStatus: 'idle',
    };
  }
  const totalSec = mode === 'quick' ? 1.5 : 2.4;
  return {
    mode,
    totalSec,
    remainingSec: totalSec,
    goHoldSec: mode === 'quick' ? 0.48 : 0.62,
    stage: 3,
    isFrozen: true,
    swoopAlpha: 0,
    earlyLocked: false,
    primed: false,
    rocketStatus: 'idle',
  };
}

function quinticSmoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function stepStartCountdownSingle(
  state: StartCountdownState,
  throttleHeld: boolean,
  clampedDt: number,
): CountdownStepEvents {
  const prevStage = state.stage;
  let changedStage: CountdownStage = null;
  let justUnlockedGo = false;
  let triggeredRocketStart = false;
  let triggeredSputter = false;
  let revIntensity = 0;

  if (!state.isFrozen) {
    state.swoopAlpha = 1;
    if (state.goHoldSec > 0) {
      state.goHoldSec = Math.max(0, state.goHoldSec - clampedDt);
      state.stage = state.goHoldSec > 0 ? 0 : null;
      if (state.stage !== prevStage) {
        changedStage = state.stage;
      }
    } else {
      state.stage = null;
    }
    return {
      changedStage,
      justUnlockedGo: false,
      triggeredRocketStart: false,
      triggeredSputter: false,
      revIntensity: 0,
    };
  }

  const beatLen = Math.max(0.25, state.totalSec / 3);
  const sweetSpotThreshold = beatLen * 1.15; // Sweet spot opens right around "1" appearing!

  // Evaluate Rocket Start throttle timing before stepping remainingSec
  if (!throttleHeld) {
    // Releasing gas clears an early-mash lock so skilled players can recover before "1"!
    state.earlyLocked = false;
    state.primed = false;
    state.rocketStatus = state.remainingSec <= sweetSpotThreshold ? 'ready' : 'idle';
  } else if (state.remainingSec > sweetSpotThreshold + 0.16 && !state.primed) {
    if (!state.earlyLocked) {
      triggeredSputter = true;
    }
    state.earlyLocked = true;
    state.rocketStatus = 'sputter';
  } else if (!state.earlyLocked && state.remainingSec <= sweetSpotThreshold) {
    state.primed = true;
    state.rocketStatus = 'primed';
    revIntensity = 1.25;
  }

  state.remainingSec = Math.max(0, state.remainingSec - clampedDt);
  const rawProgress =
    state.totalSec > 0 ? 1 - state.remainingSec / state.totalSec : 1;
  // Hold slightly high over the island for the first 18% so the full city reads clearly, then dive smoothly!
  const diveT = Math.max(0, (rawProgress - 0.14) / 0.86);
  state.swoopAlpha = quinticSmoothstep(diveT);

  if (state.remainingSec <= 0) {
    state.isFrozen = false;
    state.swoopAlpha = 1;
    state.stage = 0;
    justUnlockedGo = true;
    changedStage = 0;

    if (state.primed && !state.earlyLocked) {
      triggeredRocketStart = true;
      state.rocketStatus = 'launched';
    } else if (state.earlyLocked) {
      triggeredSputter = true;
      state.rocketStatus = 'sputter';
    } else {
      state.rocketStatus = 'idle';
    }
  } else {
    const nextStage: 3 | 2 | 1 =
      state.remainingSec > beatLen * 2
        ? 3
        : state.remainingSec > beatLen
          ? 2
          : 1;
    state.stage = nextStage;
    if (nextStage !== prevStage) {
      changedStage = nextStage;
    }
    if (revIntensity === 0 && (nextStage === 2 || nextStage === 1)) {
      revIntensity = nextStage === 1 ? 0.95 : 0.65;
    }
    if (!throttleHeld && state.remainingSec <= sweetSpotThreshold) {
      state.rocketStatus = 'ready';
    }
  }

  return {
    changedStage,
    justUnlockedGo,
    triggeredRocketStart,
    triggeredSputter,
    revIntensity,
  };
}

export function stepStartCountdown(
  state: StartCountdownState,
  throttleHeld: boolean,
  dt: number,
): CountdownStepEvents {
  const totalDt = Math.max(0, Math.min(dt, 0.35));
  if (totalDt <= 0.1) {
    return stepStartCountdownSingle(state, throttleHeld, totalDt);
  }
  const steps = Math.ceil(totalDt / 0.1);
  const subDt = totalDt / steps;
  const startStage = state.stage;
  let justUnlockedGo = false;
  let triggeredRocketStart = false;
  let triggeredSputter = false;
  let revIntensity = 0;

  for (let i = 0; i < steps; i++) {
    const sub = stepStartCountdownSingle(state, throttleHeld, subDt);
    if (sub.justUnlockedGo) justUnlockedGo = true;
    if (sub.triggeredRocketStart) triggeredRocketStart = true;
    if (sub.triggeredSputter) triggeredSputter = true;
    revIntensity = Math.max(revIntensity, sub.revIntensity);
  }

  return {
    changedStage: state.stage !== startStage ? state.stage : null,
    justUnlockedGo,
    triggeredRocketStart,
    triggeredSputter,
    revIntensity,
  };
}

export function applyRocketStartToTruck(truck: TruckState): void {
  truck.boostTimer = Math.max(truck.boostTimer, ROCKET_START_BOOST_SEC);
  truck.boostCooldown = 0;
  const launchSpd = TRUCK_BOOST_SPEED * 0.88;
  truck.speed = launchSpd;
  truck.vx = Math.sin(truck.yaw) * launchSpd;
  truck.vz = Math.cos(truck.yaw) * launchSpd;
  truck.pitchAngle = -0.15; // Joyful mini wheelie pitch hop!
  truck.squashY = 0.78;
  truck.squashVel = 3.9;
}

/**
 * Pure Roof-Rack Parcel Stack Spring-Damper Wobble Physics
 */
export interface ParcelStackWobbleState {
  roll: number;
  rollVel: number;
  pitch: number;
  pitchVel: number;
  bounceY: number;
  bounceVel: number;
  prevYaw: number;
  prevSpeed: number;
  wasAirborne: boolean;
}

export function createParcelStackWobbleState(
  initialYaw: number = 0,
): ParcelStackWobbleState {
  return {
    roll: 0,
    rollVel: 0,
    pitch: 0,
    pitchVel: 0,
    bounceY: 0,
    bounceVel: 0,
    prevYaw: initialYaw,
    prevSpeed: 0,
    wasAirborne: false,
  };
}

export function stepParcelStackWobble(
  wobble: ParcelStackWobbleState,
  truck: TruckState,
  dt: number,
): void {
  const clampedDt = Math.max(0.001, Math.min(dt, 0.05));
  const yawDelta = wrapAngleRad(truck.yaw - wobble.prevYaw);
  const yawRate = yawDelta / clampedDt;
  const longAccel = (truck.speed - wobble.prevSpeed) / clampedDt;
  const isAirborne = truck.y > 0.08;

  // Landing bounce impulse when touching down from a Canal Ramp jump!
  if (wobble.wasAirborne && !isAirborne) {
    wobble.bounceVel += 1.65;
    wobble.rollVel += (yawRate >= 0 ? 1 : -1) * 1.4;
  }

  wobble.prevYaw = truck.yaw;
  wobble.prevSpeed = truck.speed;
  wobble.wasAirborne = isAirborne;

  // Centrifugal outward lean on turns + extra sway while drifting
  const speedNorm = Math.min(1.3, truck.speed / TRUCK_MAX_SPEED);
  const driftMult = truck.isDrifting ? 1.45 : 1.0;
  const targetRoll = Math.max(
    -0.42,
    Math.min(0.42, -yawRate * speedNorm * 0.095 * driftMult),
  );
  // Nod forward under braking, tilt back under boost/acceleration
  const targetPitch = Math.max(
    -0.28,
    Math.min(0.28, -longAccel * 0.016),
  );

  const kSpring = 36;
  const cDamp = 6.2;

  const rollAcc = (targetRoll - wobble.roll) * kSpring - wobble.rollVel * cDamp;
  wobble.rollVel += rollAcc * clampedDt;
  wobble.roll = Math.max(-0.5, Math.min(0.5, wobble.roll + wobble.rollVel * clampedDt));

  const pitchAcc =
    (targetPitch - wobble.pitch) * kSpring - wobble.pitchVel * cDamp;
  wobble.pitchVel += pitchAcc * clampedDt;
  wobble.pitch = Math.max(
    -0.36,
    Math.min(0.36, wobble.pitch + wobble.pitchVel * clampedDt),
  );

  const bounceAcc = -wobble.bounceY * 48 - wobble.bounceVel * 7.5;
  wobble.bounceVel += bounceAcc * clampedDt;
  wobble.bounceY = Math.max(
    -0.06,
    Math.min(0.18, wobble.bounceY + wobble.bounceVel * clampedDt),
  );
}
