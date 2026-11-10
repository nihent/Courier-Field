import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PEDESTRIAN_RADIUS,
  findForwardRoadPath,
  findRoadPath,
  generateProceduralCity,
  getLevelConfig,
  getStreetPropObstacleRadius,
  getTreeObstacleRadius,
  gridToWorld,
  isDrivableTile,
  isWalkablePedestrianTile,
  worldToGrid,
} from './proceduralCity';
import {
  claimQuest,
  computeRunRewards,
  createDefaultProgression,
  executeLuckySpin,
  incrementQuestProgress,
  purchaseOrSelectTopper,
  purchaseOrSelectVehicle,
} from './progression';
import {
  FEVER_COMBO_THRESHOLD,
   ROCKET_START_BOOST_SEC,
  RIVAL_CAPSULE,
  TRUCK_CAPSULE,
  applyRocketStartToTruck,
  calculateDeliveryScore,
  checkDeliveryEligibility,
  closestCapsuleContact,
  createInitialTruckState,
  createParcelStackWobbleState,
  createStartCountdownState,
  evaluateRunStatus,
  getActiveStop,
  getHazardCapsuleSpec,
  isPositionDrivable,
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
} from './rules';
import {
  HazardKind,
  HazardPhase,
  OutcomeKind,
  ParcelKind,
  RIGHT_LANE_OFFSET,
  SignalAxisState,
  TILE_SIZE,
  TopperId,
  VehicleId,
} from './types';

test('procedural levels 1..8 generate city-wide boulevard trees, traffic signals, right-hand traffic, and kiosks', () => {
  const seenArchetypes = new Set<string>();

  for (let level = 1; level <= 8; level++) {
    const city = generateProceduralCity(level);
    seenArchetypes.add(city.config.archetype);
    assert.equal(city.stops.length, city.config.stopCount, `Level ${level} stop count mismatch`);
    assert.ok(city.config.gridSize >= 15, `Level ${level} gridSize should be >= 15`);

    // City-wide distributed trees, signals, coffee kiosks, balloons, buildings, pedestrians
    assert.ok(city.buildings.length >= 25, `Level ${level} should have >= 25 buildings, got ${city.buildings.length}`);
    assert.ok(city.trees.length >= 85, `Level ${level} should have >= 85 distributed city trees, got ${city.trees.length}`);
    assert.ok(city.trafficSignals.length >= 3, `Level ${level} should have >= 3 traffic signals, got ${city.trafficSignals.length}`);
    assert.ok(city.coffeeKiosks.length >= 1, `Level ${level} should have >= 1 espresso kiosk, got ${city.coffeeKiosks.length}`);
    assert.ok(city.skyBalloons.length >= 2, `Level ${level} should have >= 2 harbor sky balloons`);
    assert.ok(city.pedestrians.length >= 5, `Level ${level} should have strolling pedestrians`);

    // Verify trees are genuinely spread across the city alongside buildings (not clumped in one park block)
    let buildingsWithNearbyTrees = 0;
    for (const b of city.buildings) {
      const bw = gridToWorld(b.coord, city.totalGridSize);
      const hasTreeNearBlock = city.trees.some(
        (t) => Math.hypot(t.x - bw.x, t.z - bw.z) < TILE_SIZE * 0.85,
      );
      if (hasTreeNearBlock) buildingsWithNearbyTrees += 1;
    }
    assert.ok(
      buildingsWithNearbyTrees >= Math.floor(city.buildings.length * 0.65),
      `Level ${level} should plant boulevard trees across >= 65% of building blocks (${buildingsWithNearbyTrees}/${city.buildings.length})`,
    );

    // Spawn tile and forward tile (+X) must be open drivable roads
    const spawnTile = city.tiles[city.spawnCoord.row][city.spawnCoord.col];
    const forwardTile = city.tiles[city.spawnCoord.row][city.spawnCoord.col + 1];
    assert.equal(isDrivableTile(spawnTile), true, `Level ${level} spawn tile not drivable`);
    assert.equal(isDrivableTile(forwardTile), true, `Level ${level} forward tile blocked`);

    // Every ordered stop must have a valid BFS road path and parcel kind
    let prev = city.spawnCoord;
    for (const stop of city.stops) {
      assert.ok(stop.appearance.skinColor > 0, 'Customer should have realistic appearance');
      assert.ok(
        stop.parcelKind === ParcelKind.Small ||
          stop.parcelKind === ParcelKind.Large ||
          stop.parcelKind === ParcelKind.Fragile ||
          stop.parcelKind === ParcelKind.HotExpress,
        'Stop must have Small, Large, Fragile, or HotExpress parcelKind',
      );
      const path = findRoadPath(city.tiles, prev, stop.roadCoord);
      assert.ok(path.length >= 1, `Level ${level} stop #${stop.index} unreachable`);
      prev = stop.roadCoord;
    }

    // Truck spawns in right-hand lane (+Z offset when facing East +X) and survives 8s idle
    const truck = createInitialTruckState(city);
    const spawnCenter = gridToWorld(city.spawnCoord, city.totalGridSize);
    assert.ok(truck.z > spawnCenter.z + 0.25, 'Eastbound courier van should spawn in Right-Hand Lane (+Z)');
    assert.equal(isPositionDrivable(city, truck.x, truck.z), true);
    for (let i = 0; i < 160; i++) {
      stepTrafficSignals(city.trafficSignals, 0.05);
      stepHazardsAndCollisions(city.hazards, truck, 0.05, city.trafficSignals);
    }
    assert.equal(truck.health, 3, `Level ${level} truck took unfair idle damage at spawn`);
  }

  assert.equal(seenArchetypes.size, 4, 'All 4 distinct complex city archetypes should appear across levels');
});

test('pedestrian physics never walks into distributed boulevard trees, bushes, street props, roads, or water across 200 steps', () => {
  for (let level = 1; level <= 8; level++) {
    const city = generateProceduralCity(level);
    const truck = createInitialTruckState(city);
    assert.ok(city.pedestrians.length >= 5, `Level ${level} should spawn pedestrians`);

    for (let step = 0; step < 200; step++) {
      stepPedestriansPhysics(city.pedestrians, city, truck, 0.05);

      for (const ped of city.pedestrians) {
        const gc = worldToGrid(ped.x, ped.z, city.totalGridSize);
        const tile = city.tiles[gc.row]?.[gc.col];
        assert.equal(
          isWalkablePedestrianTile(tile),
          true,
          `Level ${level} step ${step}: pedestrian ${ped.id} entered non-walkable tile ${tile}`,
        );

        for (const tree of city.trees) {
          const dist = Math.hypot(ped.x - tree.x, ped.z - tree.z);
          const minSafe = getTreeObstacleRadius(tree) + PEDESTRIAN_RADIUS - 0.02;
          assert.ok(
            dist >= minSafe,
            `Level ${level} step ${step}: pedestrian ${ped.id} overlapped tree (${tree.variant}) at dist=${dist.toFixed(3)} < ${minSafe.toFixed(3)}`,
          );
        }

        for (const prop of city.streetProps) {
          const dist = Math.hypot(ped.x - prop.x, ped.z - prop.z);
          const minSafe = getStreetPropObstacleRadius(prop) + PEDESTRIAN_RADIUS - 0.02;
          assert.ok(
            dist >= minSafe,
            `Level ${level} step ${step}: pedestrian ${ped.id} overlapped street prop (${prop.kind}) at dist=${dist.toFixed(3)} < ${minSafe.toFixed(3)}`,
          );
        }
      }
    }

    const totalMoved = city.pedestrians.reduce((acc, p) => acc + p.strideDistance, 0);
    assert.ok(totalMoved > city.pedestrians.length * 4, `Level ${level} pedestrians should actively stroll`);
  }
});

test('forward-only driving physics prohibits reverse (brakes to 0) and supports Left/Right turns & manual boost', () => {
  const city = generateProceduralCity(1);
  const truck = createInitialTruckState(city);
  const startX = truck.x;
  const startYaw = truck.yaw; // Math.PI / 2 (East, +X)

  // 1. Straight ahead + manual boost
  const res = stepTruckPhysics(
    truck,
    { throttle: 1, steer: 0, wantsBoost: true },
    city,
    0.04,
  );
  assert.equal(res.activatedManualBoost, true);
  for (let i = 0; i < 15; i++) {
    stepTruckPhysics(truck, { throttle: 1, steer: 0, wantsBoost: false }, city, 0.04);
  }
  assert.ok(truck.x > startX + 1.5, 'Straight throttle should accelerate forward along van heading');
  assert.ok(Math.abs(truck.yaw - startYaw) < 0.08, 'Straight throttle should maintain street heading');

  // 2. Brake Only — S / ArrowDown (throttle: -1) decelerates to 0 and NEVER reverses backward!
  const brakeTruck = createInitialTruckState(city);
  for (let i = 0; i < 12; i++) {
    stepTruckPhysics(brakeTruck, { throttle: 1, steer: 0, wantsBoost: false }, city, 0.04);
  }
  assert.ok(brakeTruck.speed > 4.0, 'Van should be moving forward before braking');

  let minXDuringBrake = brakeTruck.x;
  for (let i = 0; i < 30; i++) {
    const prevX = brakeTruck.x;
    stepTruckPhysics(brakeTruck, { throttle: -1, steer: 0, wantsBoost: false }, city, 0.04);
    assert.equal(brakeTruck.isBraking, true, 'Holding S/Down should activate brake taillights');
    assert.ok(brakeTruck.x >= prevX - 1e-6, 'Braking must NEVER move the van backward');
    minXDuringBrake = Math.min(minXDuringBrake, brakeTruck.x);
  }
  assert.equal(brakeTruck.speed, 0, 'Holding brake should bring van cleanly to 0 speed');
  assert.equal(brakeTruck.vx, 0, 'Stopped van should have zero X velocity');

  // 3. Forward-only pathfinding never routes backward 180 deg when forward streets exist
  const spawnNext = { col: city.spawnCoord.col + 1, row: city.spawnCoord.row };
  const forwardRoute = findForwardRoadPath(city.tiles, spawnNext, Math.PI / 2, city.spawnCoord);
  assert.ok(forwardRoute.length >= 2, 'Forward road path should find a loop around the block');
  if (forwardRoute.length >= 2) {
    assert.notDeepEqual(
      forwardRoute[1],
      city.spawnCoord,
      'First step of forward-only route must NEVER point backward behind the van',
    );
  }

  // 4. Early Left Turn inside a 1-tile corridor glides forward and turns Left (-Z) at crossroad
  const corridorTruck = createInitialTruckState(city);
  const corridorStartZ = corridorTruck.z;
  for (let i = 0; i < 45; i++) {
    stepTruckPhysics(corridorTruck, { throttle: 1, steer: -1, wantsBoost: false }, city, 0.04);
  }
  assert.ok(
    corridorTruck.z < corridorStartZ - 2.0,
    `Holding Left early in a corridor should glide to the crossroad and turn Left (-Z), deltaZ=${(corridorTruck.z - corridorStartZ).toFixed(2)}`,
  );
});

test('traffic signals cycle phases, stop AI cruisers on red, and issue Wrong-Way & Red-Light tickets', () => {
  const city = generateProceduralCity(2);
  const sig = city.trafficSignals[0];
  assert.ok(sig, 'City should have traffic signals');

  // Force signal to NSGreen (so East/West traffic has a RED light!)
  sig.state = SignalAxisState.NSGreen;
  sig.timer = 5.0;

  // Place an Eastbound AI cruiser just West of the intersection approaching the Red signal
  const cruiser = city.hazards.find((h) => h.kind === HazardKind.Cruiser);
  assert.ok(cruiser, 'City should have Cruiser vehicles');
  cruiser.waypoints = [
    { x: sig.x - 4.0, z: sig.z + 0.44 },
    { x: sig.x + 4.0, z: sig.z + 0.44 },
  ];
  cruiser.waypointIndex = 1;
  cruiser.x = sig.x - 1.85; // inside the [1.05 .. 2.35] stop-bar detection zone
  cruiser.z = sig.z + 0.44;
  cruiser.currentSpeed = cruiser.speed;

  const idleTruck = createInitialTruckState(city);
  idleTruck.x = -999; // far away so no collision
  for (let i = 0; i < 15; i++) {
    stepHazardsAndCollisions([cruiser], idleTruck, 0.05, [sig]);
  }
  assert.equal(cruiser.stoppedAtSignal, true, 'Eastbound AI vehicle must stop at Red signal');
  assert.ok(cruiser.currentSpeed < 0.25, 'Stopped AI vehicle speed should decelerate near 0');

  // Wrong-Way Ticket: driving Eastbound in the oncoming Left Lane (-Z offset) for > 1.75s
  const wrongTruck = createInitialTruckState(city);
  const spawnCenter = gridToWorld(city.spawnCoord, city.totalGridSize);
  let gotWrongWay = false;
  for (let i = 0; i < 55; i++) {
    wrongTruck.x = spawnCenter.x + 0.8;
    wrongTruck.z = spawnCenter.z - 0.55; // oncoming left lane!
    wrongTruck.yaw = Math.PI / 2;
    wrongTruck.vx = 5.5;
    wrongTruck.vz = 0;
    wrongTruck.speed = 5.5;
    const step = stepTruckPhysics(
      wrongTruck,
      { throttle: 1, steer: 0, wantsBoost: false },
      city,
      0.05,
    );
    if (step.issuedTicket === 'wrong_way') gotWrongWay = true;
  }
  assert.equal(gotWrongWay, true, 'Driving in oncoming left lane should issue a wrong_way ticket');
  assert.equal(wrongTruck.ticketsCount, 1);

  // Red-Light Ticket: speeding Eastbound across an intersection while NSGreen (Red for E/W)
  const runnerTruck = createInitialTruckState(city);
  runnerTruck.x = sig.x - 0.35;
  runnerTruck.z = sig.z + 0.44;
  runnerTruck.yaw = Math.PI / 2;
  runnerTruck.vx = 7.5;
  runnerTruck.vz = 0;
  runnerTruck.speed = 7.5;
  const redStep = stepTruckPhysics(
    runnerTruck,
    { throttle: 1, steer: 0, wantsBoost: false },
    city,
    0.05,
  );
  assert.equal(redStep.issuedTicket, 'red_light', 'Speeding through a red traffic signal should issue a red_light ticket');
});

test('Small, Large, and Fragile parcel mechanics and Espresso Kiosks work accurately', () => {
  const city = generateProceduralCity(2);
  const truck = createInitialTruckState(city);
  const stop = getActiveStop(city.stops);
  assert.ok(stop);
  const stopWorld = gridToWorld(stop.roadCoord, city.totalGridSize);

  // 1. Large Parcel requires braking (speed <= 3.1) to unload!
  stop.parcelKind = ParcelKind.Large;
  truck.x = stopWorld.x + 1.2;
  truck.z = stopWorld.z;
  truck.speed = 7.2; // moving too fast!
  const fastLarge = checkDeliveryEligibility(truck, stop, city.totalGridSize);
  assert.equal(fastLarge.canAutoDrop, false, 'Large crate cannot be dropped at high speed');
  assert.equal(fastLarge.canExpressToss, false, 'Large crate cannot be unloaded at high speed');
  assert.equal(fastLarge.needsBrakeForLarge, true, 'HUD should prompt player to Brake to Unload');

  truck.speed = 1.5; // braked curbside!
  const brakedLarge = checkDeliveryEligibility(truck, stop, city.totalGridSize);
  assert.equal(brakedLarge.canExpressToss, true, 'Braked van can unload Large crate with Space/E');
  assert.equal(brakedLarge.needsBrakeForLarge, false);

  // 2. Fragile Parcel awards +90 pristine care bonus when unbumped, 0 when bumped
  const pristineScore = calculateDeliveryScore(0, 0, true, 1, ParcelKind.Fragile, true);
  const bumpedScore = calculateDeliveryScore(0, 0, true, 1, ParcelKind.Fragile, false);
  assert.equal(pristineScore.pristineBonus, 90);
  assert.equal(bumpedScore.pristineBonus, 0);
  assert.equal(pristineScore.pointsAwarded - bumpedScore.pointsAwarded, 90);

  // 3. Espresso Kiosk pickup clears boostCooldown, triggers boostTimer, and enters cooldown
  const kiosk = city.coffeeKiosks[0];
  assert.ok(kiosk);
  truck.boostCooldown = 2.5;
  truck.x = kiosk.roadX;
  truck.z = kiosk.roadZ;
  const picked = stepCoffeeKiosks(city.coffeeKiosks, truck, 0.05);
  assert.equal(picked?.id, kiosk.id);
  assert.equal(truck.boostCooldown, 0);
  assert.ok(truck.boostTimer >= 1.4);
  assert.ok(kiosk.cooldown > 10);

  // 4. Win/loss evaluation
  assert.equal(evaluateRunStatus(city.stops, 30, 3), OutcomeKind.None);
  assert.equal(evaluateRunStatus(city.stops, 0, 3), OutcomeKind.OutOfTime);
  assert.equal(evaluateRunStatus(city.stops, 30, 0), OutcomeKind.Breakdown);
  for (const s of city.stops) s.delivered = true;
  assert.equal(evaluateRunStatus(city.stops, 12, 2), OutcomeKind.Victory);
});

test('difficulty and scooter hazard windup telegraph work accurately', () => {
  const lv1 = getLevelConfig(1);
  const lv4 = getLevelConfig(4);
  assert.ok(lv4.gridSize > lv1.gridSize);
  assert.ok(lv4.stopCount > lv1.stopCount);

  const city = generateProceduralCity(3);
  const scooter = city.hazards.find((h) => h.kind === HazardKind.ScooterDash);
  assert.ok(scooter, 'Level 3 should include a ScooterDash hazard');
  scooter.phase = HazardPhase.Idle;
  scooter.phaseTimer = 0;

  const truck = createInitialTruckState(city);
  truck.x = scooter.x + 4.0;
  truck.z = scooter.z;

  const ev1 = stepHazardsAndCollisions([scooter], truck, 0.05);
  assert.equal(scooter.phase, HazardPhase.Windup);
  assert.equal(ev1.startedWindups.length, 1);

  for (let i = 0; i < 16; i++) {
    stepHazardsAndCollisions([scooter], truck, 0.05);
  }
  assert.equal(scooter.phase, HazardPhase.Active);
});

test('progression shop, toppers, lucky spin wheel, quests, and 3-star mastery rewards work deterministically', () => {
  let prog = createDefaultProgression();
  assert.equal(prog.coins, 300);
  assert.equal(prog.spinTokens, 1);

  // Unlock Captain Quackers topper (250 coins) -> 50 coins left
  const topRes = purchaseOrSelectTopper(prog, TopperId.RubberDuck);
  assert.equal(topRes.purchased, true);
  assert.equal(topRes.next.coins, 50);
  assert.equal(topRes.next.selectedTopper, TopperId.RubberDuck);
  prog = topRes.next;

  // Use initial Free Spin token (rngValue = 0.92 -> slice 5: Shield + 200 coins)
  const spinRes = executeLuckySpin(prog, 0.92);
  assert.equal(spinRes.usedToken, true);
  assert.equal(spinRes.next.spinTokens, 0);
  assert.equal(spinRes.next.coins, 250);
  assert.equal(spinRes.next.nextFreeShield, true);
  prog = spinRes.next;

  // Progress & claim a quest -> rotates in a fresh quest and awards coins
  const firstQuest = prog.quests[0];
  prog = incrementQuestProgress(prog, firstQuest.kind, firstQuest.target);
  assert.equal(prog.quests[0].progress, firstQuest.target);
  const claimed = claimQuest(prog, firstQuest.id);
  assert.equal(claimed.coins, prog.coins + firstQuest.rewardCoins);
  assert.notEqual(claimed.quests[0].id, firstQuest.id, 'Claimed quest should rotate');
  prog = claimed;

  // Give enough coins to unlock Mint Gelato Kei-Truck (450 coins)
  prog = { ...prog, coins: 600 };
  const vehRes = purchaseOrSelectVehicle(prog, VehicleId.KeiTruck);
  assert.equal(vehRes.purchased, true);
  assert.equal(vehRes.next.selectedVehicle, VehicleId.KeiTruck);

  // Mastery stars: clean 0-ticket fast victory = 3 stars + spin token
  const perfectRun = computeRunRewards(OutcomeKind.Victory, 1800, 5, 0, 18);
  assert.equal(perfectRun.starsEarned, 3);
  assert.equal(perfectRun.earnedSpinToken, true);
  assert.ok(perfectRun.coinsEarned >= 450);
});

test('fleet vehicle perks, canal jump ramps over bridge gates, mechanic shield, horn, ducks, and bullseye fever work', () => {
  const city = generateProceduralCity(2);
  assert.ok(city.mechanicGarages.length >= 1, 'Level should generate at least 1 Mechanic Garage');

  // 1. Armored Step-Van has 5 HP and Fragile Shock-Absorber
  const armored = createInitialTruckState(city, VehicleId.ArmoredVan, false);
  assert.equal(armored.maxHealth, 5);
  assert.equal(armored.shockAbsorberAvailable, true);

  // 2. Vespa Trike extends Small toss range by +1.6m
  const trike = createInitialTruckState(city, VehicleId.VespaTrike, false);
  const stop = getActiveStop(city.stops)!;
  stop.parcelKind = ParcelKind.Small;
  const padPos = gridToWorld(stop.roadCoord, city.totalGridSize);
  trike.x = padPos.x + 6.1; // Outside normal 5.3m Small range, inside 6.9m Trike range!
  trike.z = padPos.z;
  const trikeElig = checkDeliveryEligibility(trike, stop, city.totalGridSize);
  assert.equal(trikeElig.canExpressToss, true, 'VespaTrike should reach 6.1m Small toss');

  // 3. Bullseye center toss awards +2 combo steps, Fever mode at >= 4 combo, and HotExpress thermal bonus
  const hotBullseye = calculateDeliveryScore(
    2,
    5.0,
    true,
    2,
    ParcelKind.HotExpress,
    true,
    { bullseye: true, thermalTimer: 9.5, vipRole: 'chef', ticketsCount: 0 },
  );
  assert.equal(hotBullseye.nextCombo, FEVER_COMBO_THRESHOLD);
  assert.equal(hotBullseye.isFever, true);
  assert.equal(hotBullseye.bullseyeBonus, 85);
  assert.equal(hotBullseye.thermalBonus, 110);
  assert.equal(hotBullseye.vipBonus, 90);
  assert.ok(hotBullseye.coinsAwarded >= 80, 'Fever + Bullseye + VIP should double coin tip');

  // 4. Canal Jump Ramp launches truck airborne (y > 0.4) and clears closed BridgeGate!
  if (city.jumpRamps.length === 0) {
    city.jumpRamps.push({
      id: 'test-ramp',
      x: armored.x + 0.2,
      z: armored.z,
      yaw: armored.yaw,
      cooldown: 0,
    });
  }
  const ramp = city.jumpRamps[0];
  armored.x = ramp.x;
  armored.z = ramp.z;
  armored.vx = 6.5;
  armored.speed = 6.5;
  const jumpStep = stepTruckPhysics(armored, { throttle: 1, steer: 0, wantsBoost: false }, city, 0.05);
  assert.equal(jumpStep.activatedJumpRamp, true);
  assert.ok(armored.vy > 5.0, 'Jump ramp should impart upward velocity');
  stepTruckPhysics(armored, { throttle: 1, steer: 0, wantsBoost: false }, city, 0.05);
  assert.ok(armored.y > 0.36, 'Airborne truck should clear BridgeGate height threshold');

  // 5. Mechanic Garage grants Bumper Shield, which absorbs a traffic hit without losing HP!
  const gar = city.mechanicGarages[0];
  armored.y = 0;
  armored.vy = 0;
  armored.health = 4;
  armored.hasBumperShield = false;
  armored.x = gar.roadX;
  armored.z = gar.roadZ;
  const serviced = stepMechanicGarages(city.mechanicGarages, armored, 0.05);
  assert.equal(serviced?.id, gar.id);
  assert.equal(armored.health, 5);
  assert.equal(armored.hasBumperShield, true);

  const cruiser = city.hazards.find((h) => h.kind === HazardKind.Cruiser)!;
  armored.invulnTimer = 0;
  armored.x = cruiser.x + 0.3;
  armored.z = cruiser.z;
  const shieldEv = stepHazardsAndCollisions([cruiser], armored, 0.02);
  assert.equal(shieldEv.shieldAbsorbed, true);
  assert.equal(armored.health, 5, 'Bumper shield must preserve Hull HP on crash');
  assert.equal(armored.hasBumperShield, false);

  // 6. Slipstream Near-Miss awards nearMissCount and recharges boostCooldown
  armored.invulnTimer = 0;
  cruiser.nearMissCooldown = 0;
  cruiser.bumpTimer = 0;
  cruiser.bumpVx = 0;
  cruiser.bumpVz = 0;
  const latNx = -Math.cos(cruiser.yaw);
  const latNz = Math.sin(cruiser.yaw);
  armored.x = cruiser.x + latNx * 0.96; // side-by-side lane pass within [0.02 .. 0.72] capsule surface gap!
  armored.z = cruiser.z + latNz * 0.96;
  armored.yaw = cruiser.yaw + Math.PI;
  armored.speed = 6.8;
  armored.isWrongWay = false;
  armored.boostCooldown = 2.0;
  const nearEv = stepHazardsAndCollisions([cruiser], armored, 0.02);
  assert.equal(nearEv.nearMissCount, 1);
  assert.ok(armored.boostCooldown < 1.3);

  // 7. Musical Horn calms winding ScooterDash hazards & Polite Duck Crossing yield works
  const city3 = generateProceduralCity(3);
  const scoot = city3.hazards.find((h) => h.kind === HazardKind.ScooterDash)!;
  scoot.phase = HazardPhase.Windup;
  const hornTruck = createInitialTruckState(city3);
  hornTruck.x = scoot.x + 3.0;
  hornTruck.z = scoot.z;
  const hornOut = triggerMusicalHorn(hornTruck, [scoot], city3.pedestrians, city3.duckCrossings);
  assert.equal(hornOut?.calmedScooters, 1);
  assert.equal(scoot.phase, HazardPhase.Idle, 'Musical horn should calm winding scooter');

  if (city3.duckCrossings.length > 0) {
    const duck = city3.duckCrossings[0];
    hornTruck.x = duck.x + 1.8;
    hornTruck.z = duck.z;
    hornTruck.isBraking = true;
    hornTruck.speed = 1.2;
    const polite = stepDuckCrossings(city3.duckCrossings, hornTruck, 0.04);
    assert.ok(polite, 'Braking politely near duck crossing should award bonus');
  }

  // 8. Moving porch customers & Rival Courier step cleanly
  stepMovingCustomers(city3.stops, 1.5);
  if (city3.rivalCourier) {
    hornTruck.x = city3.rivalCourier.bonusDropPos.x;
    hornTruck.z = city3.rivalCourier.bonusDropPos.z;
    const rivRes = stepRivalCourier(city3.rivalCourier, hornTruck, 0.04);
    assert.equal(rivRes, 'player_claimed');
  }
});

test('solid 3D vehicle & obstacle collisions prevent ghosting/pass-through and emit crash events', () => {
  const city = generateProceduralCity(3);
  const spawnCenter = gridToWorld(city.spawnCoord, city.totalGridSize);

  // 1. Opposite right-hand lanes (±0.44 = 0.88 lateral spacing) pass cleanly with ZERO false overlap!
  const laneContact = closestCapsuleContact(
    spawnCenter.x,
    spawnCenter.z + RIGHT_LANE_OFFSET,
    Math.PI / 2,
    TRUCK_CAPSULE,
    spawnCenter.x,
    spawnCenter.z - RIGHT_LANE_OFFSET,
    -Math.PI / 2,
    { halfSeg: 0.46, rLat: 0.37 },
  );
  assert.ok(
    laneContact.penetration < -0.1,
    `Opposite right-hand lanes must stay clear without clipping, got penetration=${laneContact.penetration.toFixed(3)}`,
  );

  // 2. Hero Van vs AI Cruiser: physical separation + rebound + CrashEvent, AND zero pass-through even while invulnTimer > 0!
  const truck = createInitialTruckState(city);
  const cruiserA = structuredClone(
    city.hazards.find((h) => h.kind === HazardKind.Cruiser)!,
  );
  cruiserA.x = spawnCenter.x + 0.55;
  cruiserA.z = spawnCenter.z + RIGHT_LANE_OFFSET;
  cruiserA.yaw = -Math.PI / 2;
  cruiserA.waypoints = [
    { x: cruiserA.x + 2, z: cruiserA.z },
    { x: cruiserA.x - 2, z: cruiserA.z },
  ];
  cruiserA.waypointIndex = 1;
  cruiserA.currentSpeed = 3.2;
  cruiserA.crashCooldown = 0;

  truck.x = cruiserA.x - 0.32; // Overlapping head-on!
  truck.z = cruiserA.z;
  truck.yaw = Math.PI / 2;
  truck.vx = 6.5;
  truck.vz = 0;
  truck.speed = 6.5;
  truck.invulnTimer = 0;

  const hitEv = stepHazardsAndCollisions([cruiserA], truck, 0.016, [], city);
  const postHitContact = closestCapsuleContact(
    truck.x,
    truck.z,
    truck.yaw,
    TRUCK_CAPSULE,
    cruiserA.x,
    cruiserA.z,
    cruiserA.yaw,
    getHazardCapsuleSpec(cruiserA),
  );
  assert.ok(
    postHitContact.penetration <= 0.001,
    `Hero van and Cruiser must separate with zero pass-through, got penetration=${postHitContact.penetration.toFixed(4)}`,
  );
  assert.ok(truck.vx < -1.5, 'Hero van should physically bounce backward on head-on vehicle crash');
  assert.ok((cruiserA.bumpTimer ?? 0) > 0.2, 'Hit AI Cruiser should receive bump recoil');
  assert.ok(
    hitEv.crashEvents.some((e) => e.kind === 'vehicle' && e.involvesPlayer),
    'Vehicle collision should emit a player vehicle CrashEvent',
  );

  // Even while invulnTimer > 0, forcing overlap again MUST still physically separate without ghosting!
  assert.ok(truck.invulnTimer > 1.0);
  const hpAfterFirstHit = truck.health;
  truck.x = cruiserA.x - 0.25;
  truck.z = cruiserA.z;
  truck.vx = 5.0;
  stepHazardsAndCollisions([cruiserA], truck, 0.016, [], city);
  const postInvulnContact = closestCapsuleContact(
    truck.x,
    truck.z,
    truck.yaw,
    TRUCK_CAPSULE,
    cruiserA.x,
    cruiserA.z,
    cruiserA.yaw,
    getHazardCapsuleSpec(cruiserA),
  );
  assert.ok(
    postInvulnContact.penetration <= 0.001,
    'Vehicles must NEVER pass through each other even during post-hit invulnTimer',
  );
  assert.equal(truck.health, hpAfterFirstHit, 'Post-hit invulnTimer should prevent double HP loss while still separating');

  // 3. AI Cruiser vs AI Cruiser collision separates both cars and emits ai_vehicle CrashEvent!
  const cruiserB = structuredClone(cruiserA);
  cruiserB.id = 'cruiser-b-test';
  cruiserA.x = spawnCenter.x + 0.2;
  cruiserA.z = spawnCenter.z + RIGHT_LANE_OFFSET;
  cruiserA.yaw = Math.PI / 2;
  cruiserA.waypoints = [
    { x: cruiserA.x - 2, z: cruiserA.z },
    { x: cruiserA.x + 2, z: cruiserA.z },
  ];
  cruiserA.waypointIndex = 1;
  cruiserA.currentSpeed = 3.0;
  cruiserA.bumpTimer = 0;
  cruiserA.bumpVx = 0;
  cruiserA.bumpVz = 0;
  cruiserA.crashCooldown = 0;

  cruiserB.x = cruiserA.x + 0.35; // Overlapping head-on!
  cruiserB.z = cruiserA.z;
  cruiserB.yaw = -Math.PI / 2;
  cruiserB.waypoints = [
    { x: cruiserB.x + 2, z: cruiserB.z },
    { x: cruiserB.x - 2, z: cruiserB.z },
  ];
  cruiserB.waypointIndex = 1;
  cruiserB.currentSpeed = 3.0;
  cruiserB.bumpTimer = 0;
  cruiserB.bumpVx = 0;
  cruiserB.bumpVz = 0;
  cruiserB.crashCooldown = 0;

  const farTruck = createInitialTruckState(city);
  farTruck.x = -999;
  const aiCrashEv = stepHazardsAndCollisions([cruiserA, cruiserB], farTruck, 0.01, []);
  const aiContact = closestCapsuleContact(
    cruiserA.x,
    cruiserA.z,
    cruiserA.yaw,
    getHazardCapsuleSpec(cruiserA),
    cruiserB.x,
    cruiserB.z,
    cruiserB.yaw,
    getHazardCapsuleSpec(cruiserB),
  );
  assert.ok(
    aiContact.penetration <= 0.001,
    `Two AI Cruisers must separate cleanly without passing through each other, got penetration=${aiContact.penetration.toFixed(4)}`,
  );
  assert.ok(
    aiCrashEv.crashEvents.some((e) => e.kind === 'ai_vehicle' && !e.involvesPlayer),
    'AI-vs-AI collision should emit an ai_vehicle CrashEvent',
  );

  // 4. Hero Van vs Rival Courier ("Zoomy Blitz") separates solidly and emits rival CrashEvent!
  if (city.rivalCourier) {
    const rv = city.rivalCourier;
    rv.x = spawnCenter.x + 0.6;
    rv.z = spawnCenter.z + RIGHT_LANE_OFFSET;
    rv.yaw = -Math.PI / 2;
    rv.crashCooldown = 0;

    const rTruck = createInitialTruckState(city);
    rTruck.x = rv.x - 0.3;
    rTruck.z = rv.z;
    rTruck.yaw = Math.PI / 2;
    rTruck.vx = 6.0;
    rTruck.speed = 6.0;

    const rvEv = stepHazardsAndCollisions([], rTruck, 0.016, [], city);
    const rvContact = closestCapsuleContact(
      rTruck.x,
      rTruck.z,
      rTruck.yaw,
      TRUCK_CAPSULE,
      rv.x,
      rv.z,
      rv.yaw,
      RIVAL_CAPSULE,
    );
    assert.ok(rvContact.penetration <= 0.001, 'Hero van and Rival Courier must separate solidly');
    assert.ok(
      rvEv.crashEvents.some((e) => e.kind === 'rival' && e.rivalHit),
      'Colliding with Rival Courier should emit a rival CrashEvent',
    );
  }

  // 5. Driving into a curb/building wall bounces physically and emits a building CrashEvent!
  const wallTruck = createInitialTruckState(city);
  wallTruck.yaw = 0; // Face +Z directly toward the South curb/building edge of the E-W spawn road!
  wallTruck.vx = 0;
  wallTruck.vz = 7.2;
  wallTruck.speed = 7.2;
  let sawWallCrash = false;
  for (let step = 0; step < 25; step++) {
    const res = stepTruckPhysics(
      wallTruck,
      { throttle: 1, steer: 0, wantsBoost: false },
      city,
      0.04,
    );
    if (res.crashEvents.some((e) => e.kind === 'building' || e.kind === 'prop')) {
      sawWallCrash = true;
      break;
    }
  }
  assert.equal(sawWallCrash, true, 'Ramming a building/curb wall should emit a solid crash event');
  assert.equal(
    isPositionDrivable(city, wallTruck.x, wallTruck.z),
    true,
    'Rebounded van must remain on drivable road geometry without clipping inside buildings',
  );
});

test('bird-eye 3-2-1-GO countdown swoop and Rocket Start timing state machine work deterministically', () => {
  // 1. Fresh run countdown progresses 3 -> 2 -> 1 -> 0 (GO!) -> null and eases swoopAlpha 0 -> 1
  const cd = createStartCountdownState('full');
  assert.equal(cd.stage, 3);
  assert.equal(cd.isFrozen, true);
  assert.equal(cd.swoopAlpha, 0);

  // Early throttle mash during "3" triggers sputter lock, then releasing gas before "1" recovers!
  const earlyStep = stepStartCountdown(cd, true, 0.1);
  assert.equal(earlyStep.triggeredSputter, true);
  assert.equal(cd.rocketStatus, 'sputter');
  assert.equal(cd.earlyLocked, true);

  // Release gas and step down into stage "2" then into the "1" sweet-spot window
  const seenStages: Array<number | null> = [cd.stage];
  const readStage = (): number | null => cd.stage;
  while (cd.isFrozen && readStage() !== 1) {
    const ev = stepStartCountdown(cd, false, 0.08);
    const curStage = readStage();
    if (ev.changedStage !== null || curStage !== seenStages[seenStages.length - 1]) {
      seenStages.push(curStage);
    }
  }
  assert.deepEqual(seenStages, [3, 2, 1], 'Countdown must step sequentially through 3 -> 2 -> 1');
  assert.equal(cd.earlyLocked, false, 'Releasing throttle should clear early sputter lock');
  assert.equal(cd.rocketStatus, 'ready', 'Entering stage 1 idle should expose ready window');
  assert.ok(cd.swoopAlpha > 0.25 && cd.swoopAlpha < 1, 'Camera swoopAlpha should smoothly interpolate mid-dive');

  // Hold gas cleanly during "1" sweet-spot until GO! unlocks
  let unlockedGo = false;
  let launchedRocket = false;
  for (let i = 0; i < 20 && cd.isFrozen; i++) {
    const ev = stepStartCountdown(cd, true, 0.08);
    if (!cd.isFrozen) {
      unlockedGo = ev.justUnlockedGo;
      launchedRocket = ev.triggeredRocketStart;
    } else {
      assert.equal(cd.rocketStatus, 'primed');
      assert.ok(ev.revIntensity > 1.0);
    }
  }
  assert.equal(unlockedGo, true, 'Countdown reaching 0s must unlock GO!');
  assert.equal(launchedRocket, true, 'Holding gas on 1 must trigger Rocket Start at GO!');
  assert.equal(cd.stage, 0);
  assert.equal(cd.swoopAlpha, 1);
  assert.equal(cd.rocketStatus, 'launched');

  // Verify applyRocketStartToTruck grants turbo boost, wheelie hop, and launch velocity
  const city = generateProceduralCity(1);
  const truck = createInitialTruckState(city);
  applyRocketStartToTruck(truck);
  assert.ok(truck.boostTimer >= ROCKET_START_BOOST_SEC);
  assert.ok(truck.speed > 7.5, 'Rocket Start should launch courier van at boost speed');
  assert.ok(truck.pitchAngle < -0.1, 'Rocket Start should pitch front up into a joyful wheelie');

  // Stepping past goHoldSec clears stage to null
  for (let i = 0; i < 12; i++) {
    stepStartCountdown(cd, true, 0.08);
  }
  assert.equal(cd.stage, null, 'GO! badge should clear cleanly after goHoldSec');

  // 2. Holding throttle continuously from start without releasing triggers sputter instead of Rocket Start
  const mashCd = createStartCountdownState('quick');
  let mashLaunched = false;
  let mashSputtered = false;
  while (mashCd.isFrozen) {
    const ev = stepStartCountdown(mashCd, true, 0.08);
    if (ev.triggeredRocketStart) mashLaunched = true;
    if (ev.triggeredSputter) mashSputtered = true;
  }
  assert.equal(mashLaunched, false, 'Continuous early mashing must NOT award Rocket Start');
  assert.equal(mashSputtered, true, 'Continuous early mashing should sputter harmlessly');
});

test('wobbly roof-rack parcel stack spring-damper sways on turns, braking, and jump landings', () => {
  const city = generateProceduralCity(1);
  const truck = createInitialTruckState(city);
  const wobble = createParcelStackWobbleState(truck.yaw);

  // 1. High-speed turn induces outward centrifugal roll
  truck.speed = 7.5;
  for (let i = 0; i < 8; i++) {
    truck.yaw += 0.09;
    stepParcelStackWobble(wobble, truck, 0.03);
  }
  assert.ok(Math.abs(wobble.roll) > 0.08, `Turning at speed should sway parcel stack roll, got ${wobble.roll.toFixed(3)}`);

  // 2. Hard braking pitches stack forward
  for (let i = 0; i < 6; i++) {
    truck.speed = Math.max(0, truck.speed - 1.2);
    stepParcelStackWobble(wobble, truck, 0.03);
  }
  assert.ok(wobble.pitch > 0.04, `Hard braking should pitch parcel stack forward, got ${wobble.pitch.toFixed(3)}`);

  // 3. Touching down from an airborne Canal Ramp jump triggers vertical bounce
  truck.y = 0.45;
  stepParcelStackWobble(wobble, truck, 0.03);
  assert.equal(wobble.wasAirborne, true);
  truck.y = 0;
  stepParcelStackWobble(wobble, truck, 0.03);
  assert.ok(wobble.bounceY > 0.015 || wobble.bounceVel > 0.5, 'Landing from jump should trigger parcel stack bounce');
});

test('ambient AI cruisers emit rate-limited honkEvents when queued at red lights or buzzed by fast courier van', () => {
  const city = generateProceduralCity(2);
  const sig = city.trafficSignals[0];
  sig.state = SignalAxisState.NSGreen; // Red for East/West
  sig.timer = 8.0;

  const cruiser = structuredClone(
    city.hazards.find((h) => h.kind === HazardKind.Cruiser)!,
  );
  cruiser.waypoints = [
    { x: sig.x - 4.0, z: sig.z + 0.44 },
    { x: sig.x + 4.0, z: sig.z + 0.44 },
  ];
  cruiser.waypointIndex = 1;
  cruiser.x = sig.x - 1.8;
  cruiser.z = sig.z + 0.44;
  cruiser.honkCooldown = 0;
  cruiser.stoppedDuration = 0;

  const truck = createInitialTruckState(city);
  truck.x = sig.x + 8.0; // Within 32m hearing range, clear of collision
  truck.z = sig.z - 4.0;
  truck.speed = 0;

  // 1. Impatiently queued at red signal > 1.3s emits a honkEvent + honkVisualTimer
  let totalHonks = 0;
  for (let i = 0; i < 40; i++) {
    const ev = stepHazardsAndCollisions([cruiser], truck, 0.05, [sig]);
    totalHonks += ev.honkEvents.length;
  }
  assert.equal(totalHonks, 1, 'Queued AI car should honk once and enter honkCooldown');
  assert.ok((cruiser.honkCooldown ?? 0) > 3.0, 'Honking AI car should have a multi-second cooldown');

  // 2. Fast-passing courier van startles a cruising AI car when cooldown is ready
  cruiser.honkCooldown = 0;
  cruiser.honkVisualTimer = 0;
  cruiser.x = sig.x + 6.0; // Past the signal
  cruiser.waypoints = [
    { x: sig.x + 4.0, z: sig.z - 0.44 },
    { x: sig.x + 14.0, z: sig.z - 0.44 },
  ];
  cruiser.waypointIndex = 1;

  truck.x = cruiser.x + 0.5;
  truck.z = cruiser.z + 0.88; // Adjacent lane, within 4.6m!
  truck.speed = 6.8;
  const buzzEv = stepHazardsAndCollisions([cruiser], truck, 0.04, []);
  assert.equal(buzzEv.honkEvents.length, 1, 'Zooming closely past an AI car should trigger a startled honk');
  assert.ok((cruiser.honkVisualTimer ?? 0) > 0.5, 'Honking car should activate its 3D comic honk wave ring timer');
});

test('45-second Autopilot Demo Director choreographs all 5 scenes, swaps fleet vehicles, hits yellow ramp & clash, and finishes cleanly', async () => {
  const {
    DEMO_DURATION_SEC,
    computeDemoTransitionZoom,
    createDemoDirectorState,
    stepDemoDirector,
  } = await import('./demoDirector');
  const { isPositionDrivable } = await import('./rules');

  assert.equal(DEMO_DURATION_SEC, 45);

  // Transition zoom peaks at 1.0 right on scene swap boundaries and rises at 45s finale
  assert.equal(computeDemoTransitionZoom(4.0), 0);
  assert.equal(computeDemoTransitionZoom(9.0), 1);
  assert.equal(computeDemoTransitionZoom(18.5), 1);
  assert.equal(computeDemoTransitionZoom(27.5), 1);
  assert.equal(computeDemoTransitionZoom(36.5), 1);
  assert.ok(computeDemoTransitionZoom(44.9) > 0.88);

  const city = generateProceduralCity(1);
  const truck = createInitialTruckState(city, VehicleId.ClassicVan, false);
  const demo = createDemoDirectorState();
  demo.active = true;

  const seenScenes = new Set<string>([demo.sceneId]);
  const seenVehicles = new Set<VehicleId>([demo.vehicleId]);
  let triggeredJumpRamp = false;
  let triggeredTrafficClash = false;
  let triggeredShieldSave = false;
  let completedAtEnd = false;

  // Simulate full 45.0s showcase at 20Hz (0.05s steps)
  for (let step = 0; step < 920; step++) {
    const cdStage = demo.elapsedSec < 0.7 ? 3 : demo.elapsedSec < 1.3 ? 1 : null;
    const out = stepDemoDirector(demo, truck, city, [], cdStage, 0.05);
    if (cdStage === 1) {
      assert.equal(out.gasForCountdown, true, 'Demo autopilot holds gas on 1 for Rocket Start');
    }
    if (out.changedScene) {
      seenScenes.add(out.changedScene);
      assert.equal(
        isPositionDrivable(city, truck.x, truck.z),
        true,
        `Scene ${out.changedScene} must stage truck on a drivable street coordinate`,
      );
    }
    if (out.changedVehicle) {
      seenVehicles.add(out.changedVehicle.vehicleId);
    }
    if (out.triggerGarageSaveShowcase) {
      triggeredShieldSave = true;
    }
    if (out.completed) {
      completedAtEnd = true;
      break;
    }

    if (cdStage === null) {
      const phys = stepTruckPhysics(
        truck,
        {
          throttle: out.throttle,
          steer: out.steer,
          wantsBoost: out.wantsBoost,
          wantsDrift: out.wantsDrift,
        },
        city,
        0.05,
      );
      if (phys.activatedJumpRamp) {
        triggeredJumpRamp = true;
      }
      const haz = stepHazardsAndCollisions(
        city.hazards,
        truck,
        0.05,
        city.trafficSignals,
        city,
      );
      if (haz.crashEvents.some((c) => c.involvesPlayer)) {
        triggeredTrafficClash = true;
      }
    }
  }

  assert.equal(completedAtEnd, true, 'Demo reel must complete cleanly at 45 seconds');
  assert.equal(demo.active, false, 'Demo state deactivates automatically upon completion');
  assert.deepEqual(
    Array.from(seenScenes),
    [
      'scene1_swoop_launch',
      'scene2_bullseye_fever',
      'scene3_canal_jump',
      'scene4_clash_shield',
      'scene5_finale_orbit',
    ],
    'Demo reel must progress through all 5 choreographed scenes in order',
  );
  assert.equal(seenVehicles.size, 4, 'Demo reel should showcase all 4 fleet vehicles');
  assert.equal(triggeredJumpRamp, true, 'Scene 3 must launch off the yellow Canal Jump Ramp');
  assert.equal(triggeredTrafficClash, true, 'Scene 4 must showcase a 3D vehicle clash');
  assert.equal(triggeredShieldSave, true, 'Scene 4 must showcase the Wrench Pit-Stop shield save');
});


