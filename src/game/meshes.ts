import * as THREE from 'three';
import {
  BuildingLot,
  BuildingTheme,
  CanalBoat,
  CoffeeKiosk,
  DeliveryStop,
  DuckCrossing,
  GreenWavePickup,
  HazardKind,
  JumpRamp,
  MechanicGarage,
  ParcelKind,
  PersonAppearance,
  RivalCourier,
  SkyBalloon,
  StreetProp,
  TILE_SIZE,
  TopperId,
  TrafficHazard,
  TrafficSignal,
  TreeProp,
  VehicleId,
} from './types';

/**
 * Marks a BufferGeometry or Material as shared across level rebuilds
 * so GameCanvas's level disposal routine preserves cached assets.
 */
function markShared<T extends THREE.BufferGeometry | THREE.Material>(asset: T): T {
  asset.userData.shared = true;
  return asset;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.MeshStandardMaterial>();

function getCachedStandardMat(
  colorHex: number,
  roughness: number = 0.65,
  metalness: number = 0.04,
  emissiveHex: number = 0x000000,
  emissiveIntensity: number = 0,
): THREE.MeshStandardMaterial {
  const key = `${colorHex}_${roughness.toFixed(2)}_${metalness.toFixed(2)}_${emissiveHex}_${emissiveIntensity.toFixed(2)}`;
  let mat = matCache.get(key);
  if (!mat) {
    mat = markShared(
      new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness,
        metalness,
        emissive: emissiveHex,
        emissiveIntensity,
      }),
    );
    matCache.set(key, mat);
  }
  return mat;
}

/**
 * Creates a rounded 2D shape extruded along Y (centered on X/Z, bottom at Y = 0)
 * so every block in the miniature city has soft architectural bevels.
 */
export function createBeveledBlockGeometry(
  width: number,
  height: number,
  depth: number,
  radius: number = 0.16,
  bevel: number = 0.055,
): THREE.BufferGeometry {
  const key = `bev_${width.toFixed(3)}_${height.toFixed(3)}_${depth.toFixed(3)}_${radius.toFixed(3)}_${bevel.toFixed(3)}`;
  const existing = geoCache.get(key);
  if (existing) return existing;

  const hw = Math.max(0.04, width * 0.5 - bevel);
  const hd = Math.max(0.04, depth * 0.5 - bevel);
  const r = Math.min(radius, hw * 0.85, hd * 0.85);

  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

  const extrudeDepth = Math.max(0.025, height - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: extrudeDepth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 5,
  });

  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  geo.computeVertexNormals();
  markShared(geo);
  geoCache.set(key, geo);
  return geo;
}

function getSharedGeo(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = markShared(factory());
    geoCache.set(key, g);
  }
  return g;
}

export interface ProceduralTextures {
  outerRoadTex: THREE.CanvasTexture;
  innerPaverTex: THREE.CanvasTexture;
  plazaPaverTex: THREE.CanvasTexture;
  woodBridgeTex: THREE.CanvasTexture;
  clayBumpTex: THREE.CanvasTexture;
  shadowDiscTex: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextures {
  // 1. Outer Asphalt Boulevard with crisp curb edges & golden lane dashes
  const roadCanvas = document.createElement('canvas');
  roadCanvas.width = 256;
  roadCanvas.height = 256;
  const rctx = roadCanvas.getContext('2d')!;
  rctx.fillStyle = '#7b869c';
  rctx.fillRect(0, 0, 256, 256);
  // Subtle sidewalk gutter border
  rctx.strokeStyle = '#9aa5ba';
  rctx.lineWidth = 12;
  rctx.strokeRect(6, 6, 244, 244);
  // Subtle asphalt grain
  rctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 60; i++) {
    rctx.fillRect((i * 47) % 240, (i * 83) % 240, 4, 4);
  }
  // Warm golden-yellow center dashes
  rctx.fillStyle = '#fcc936';
  rctx.beginPath();
  rctx.roundRect(119, 32, 18, 68, 7);
  rctx.roundRect(119, 156, 18, 68, 7);
  rctx.roundRect(32, 119, 68, 18, 7);
  rctx.roundRect(156, 119, 68, 18, 7);
  rctx.fill();
  const outerRoadTex = new THREE.CanvasTexture(roadCanvas);
  outerRoadTex.colorSpace = THREE.SRGBColorSpace;
  outerRoadTex.wrapS = THREE.RepeatWrapping;
  outerRoadTex.wrapT = THREE.RepeatWrapping;
  outerRoadTex.repeat.set(1 / TILE_SIZE, 1 / TILE_SIZE);
  outerRoadTex.offset.set(0.5, 0.5);
  outerRoadTex.anisotropy = maxAnisotropy;

  // 2. Inner Avenue Cobblestone / Modular Pavers with crisp two-way center lane dashes!
  const paverCanvas = document.createElement('canvas');
  paverCanvas.width = 256;
  paverCanvas.height = 256;
  const pctx = paverCanvas.getContext('2d')!;
  pctx.fillStyle = '#aeb9cc';
  pctx.fillRect(0, 0, 256, 256);
  pctx.fillStyle = '#d8e0ed';
  pctx.beginPath();
  pctx.roundRect(10, 10, 106, 106, 14);
  pctx.roundRect(140, 10, 106, 106, 14);
  pctx.roundRect(10, 140, 106, 106, 14);
  pctx.roundRect(140, 140, 106, 106, 14);
  pctx.fill();
  // Crisp white/amber two-way center lane dividers
  pctx.fillStyle = '#fff9db';
  pctx.beginPath();
  pctx.roundRect(121, 30, 14, 62, 6);
  pctx.roundRect(121, 164, 14, 62, 6);
  pctx.roundRect(30, 121, 62, 14, 6);
  pctx.roundRect(164, 121, 62, 14, 6);
  pctx.fill();
  const innerPaverTex = new THREE.CanvasTexture(paverCanvas);
  innerPaverTex.colorSpace = THREE.SRGBColorSpace;
  innerPaverTex.wrapS = THREE.RepeatWrapping;
  innerPaverTex.wrapT = THREE.RepeatWrapping;
  innerPaverTex.repeat.set(1 / TILE_SIZE, 1 / TILE_SIZE);
  innerPaverTex.offset.set(0.5, 0.5);
  innerPaverTex.anisotropy = maxAnisotropy;

  // 3. Warm Sandstone / Terracotta Courtyard & Town Plaza Tiles
  const plazaCanvas = document.createElement('canvas');
  plazaCanvas.width = 256;
  plazaCanvas.height = 256;
  const zctx = plazaCanvas.getContext('2d')!;
  zctx.fillStyle = '#e7d6bd';
  zctx.fillRect(0, 0, 256, 256);
  const tileShades = ['#f6ead7', '#f0dec4', '#f8efe0', '#ecd7ba'];
  const cell = 64;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      zctx.fillStyle = tileShades[(r + c) % tileShades.length];
      zctx.beginPath();
      zctx.roundRect(c * cell + 4, r * cell + 4, cell - 8, cell - 8, 9);
      zctx.fill();
    }
  }
  const plazaPaverTex = new THREE.CanvasTexture(plazaCanvas);
  plazaPaverTex.colorSpace = THREE.SRGBColorSpace;
  plazaPaverTex.wrapS = THREE.RepeatWrapping;
  plazaPaverTex.wrapT = THREE.RepeatWrapping;
  plazaPaverTex.repeat.set(1 / TILE_SIZE, 1 / TILE_SIZE);
  plazaPaverTex.offset.set(0.5, 0.5);
  plazaPaverTex.anisotropy = maxAnisotropy;

  // 4. Timber Canal Bridge Planks with bolted side stringers
  const bridgeCanvas = document.createElement('canvas');
  bridgeCanvas.width = 256;
  bridgeCanvas.height = 256;
  const bctx = bridgeCanvas.getContext('2d')!;
  bctx.fillStyle = '#c8733d';
  bctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6; i++) {
    bctx.fillStyle = i % 2 === 0 ? '#fad682' : '#f1c364';
    bctx.beginPath();
    bctx.roundRect(18, 6 + i * 42, 220, 35, 8);
    bctx.fill();
    // Subtle nail heads
    bctx.fillStyle = '#b56533';
    bctx.beginPath();
    bctx.arc(32, 23 + i * 42, 3.5, 0, Math.PI * 2);
    bctx.arc(224, 23 + i * 42, 3.5, 0, Math.PI * 2);
    bctx.fill();
  }
  const woodBridgeTex = new THREE.CanvasTexture(bridgeCanvas);
  woodBridgeTex.colorSpace = THREE.SRGBColorSpace;
  woodBridgeTex.wrapS = THREE.RepeatWrapping;
  woodBridgeTex.wrapT = THREE.RepeatWrapping;
  woodBridgeTex.repeat.set(1 / TILE_SIZE, 1 / TILE_SIZE);
  woodBridgeTex.offset.set(0.5, 0.5);
  woodBridgeTex.anisotropy = maxAnisotropy;

  // 5. Soft Architectural Micro-Grain Bump Map
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 128;
  bumpCanvas.height = 128;
  const mctx = bumpCanvas.getContext('2d')!;
  const img = mctx.createImageData(128, 128);
  let s = 42;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const v = 120 + ((s >>> 24) & 15);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  mctx.putImageData(img, 0, 0);
  const clayBumpTex = new THREE.CanvasTexture(bumpCanvas);
  clayBumpTex.wrapS = THREE.RepeatWrapping;
  clayBumpTex.wrapT = THREE.RepeatWrapping;
  clayBumpTex.repeat.set(2, 2);

  // 6. Soft Radial Contact Shadow Disc
  const shadCanvas = document.createElement('canvas');
  shadCanvas.width = 128;
  shadCanvas.height = 128;
  const sctx = shadCanvas.getContext('2d')!;
  const grad = sctx.createRadialGradient(64, 64, 10, 64, 64, 60);
  grad.addColorStop(0, 'rgba(30, 52, 78, 0.44)');
  grad.addColorStop(0.65, 'rgba(30, 52, 78, 0.16)');
  grad.addColorStop(1, 'rgba(30, 52, 78, 0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);
  const shadowDiscTex = new THREE.CanvasTexture(shadCanvas);
  shadowDiscTex.colorSpace = THREE.SRGBColorSpace;

  return {
    outerRoadTex,
    innerPaverTex,
    plazaPaverTex,
    woodBridgeTex,
    clayBumpTex,
    shadowDiscTex,
    dispose: () => {
      outerRoadTex.dispose();
      innerPaverTex.dispose();
      plazaPaverTex.dispose();
      woodBridgeTex.dispose();
      clayBumpTex.dispose();
      shadowDiscTex.dispose();
    },
  };
}

let cachedShadowMat: THREE.MeshBasicMaterial | null = null;
function getShadowMaterial(shadowTex: THREE.CanvasTexture): THREE.MeshBasicMaterial {
  if (!cachedShadowMat || cachedShadowMat.map !== shadowTex) {
    cachedShadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.78,
    });
    cachedShadowMat.userData.shared = true;
  }
  return cachedShadowMat;
}

export function createNumberPinTexture(
  num: number,
  bgHex: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);

  // Drop shadow pointer teardrop
  ctx.fillStyle = 'rgba(28, 46, 70, 0.28)';
  ctx.beginPath();
  ctx.arc(64, 58, 44, 0, Math.PI * 2);
  ctx.fill();

  // Cream outer pointer pin
  ctx.fillStyle = '#fffdf8';
  ctx.beginPath();
  ctx.arc(64, 52, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(42, 84);
  ctx.lineTo(64, 116);
  ctx.lineTo(86, 84);
  ctx.closePath();
  ctx.fill();

  // Inner badge circle
  ctx.fillStyle = bgHex;
  ctx.beginPath();
  ctx.arc(64, 52, 35, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 46px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 64, 54);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export interface ToyTruckRig {
  root: THREE.Group;
  shadowMesh: THREE.Mesh;
  bodyTiltGroup: THREE.Group;
  wheels: THREE.Group[];
  frontWheelSteerGroups: THREE.Group[];
  parcelBoxes: THREE.Group[];
  bodyMaterials: THREE.MeshStandardMaterial[];
  taillightMat: THREE.MeshStandardMaterial;
  headlightCones: THREE.Group;
  shieldRing: THREE.Mesh;
  topperPivot: THREE.Group;
  setVehicleStyle: (vehicleId: VehicleId) => void;
  setTopper: (topperId: TopperId) => void;
}

/**
 * High-detail sculpted courier vehicle rig supporting 4 distinct Fleet Livery/Body packages,
 * 4 swap-ready 3D Roof Toppers, Twilight Headlight Cones, and Bumper Shield Aura Ring!
 */
export function createToyTruckMesh(
  shadowTex: THREE.CanvasTexture,
  clayBump: THREE.CanvasTexture,
  maxParcels: number = 9,
  initialVehicle: VehicleId = VehicleId.ClassicVan,
  initialTopper: TopperId = TopperId.Beacon,
): ToyTruckRig {
  const root = new THREE.Group();

  const shadowMesh = new THREE.Mesh(
    getSharedGeo('truck_shad', () => new THREE.PlaneGeometry(1.75, 2.35)),
    getShadowMaterial(shadowTex),
  );
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.025;
  root.add(shadowMesh);

  const bodyTiltGroup = new THREE.Group();
  root.add(bodyTiltGroup);

  const cabMat = new THREE.MeshStandardMaterial({
    color: 0xf48836,
    roughness: 0.52,
    metalness: 0.08,
    bumpMap: clayBump,
    bumpScale: 0.005,
  });
  const cargoMat = new THREE.MeshStandardMaterial({
    color: 0xfff6e6,
    roughness: 0.48,
    metalness: 0.05,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xffb703,
    roughness: 0.42,
    metalness: 0.06,
  });
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xff4d5a,
    roughness: 0.22,
    metalness: 0.05,
    emissive: 0xe63946,
    emissiveIntensity: 0.5,
  });

  const darkTrimMat = getCachedStandardMat(0x2f3847, 0.72, 0.14);
  const chromeMat = getCachedStandardMat(0xe8eef5, 0.25, 0.45);
  const glassMat = getCachedStandardMat(0x6ec6f5, 0.12, 0.28);
  const headlightMat = getCachedStandardMat(0xfff6b8, 0.18, 0.05, 0xffd54f, 0.75);
  const beaconMat = getCachedStandardMat(0xffbe0b, 0.2, 0.08, 0xff9f1c, 0.65);
  const woodRailMat = getCachedStandardMat(0xc98848, 0.7, 0.03);

  // 1. Underbody Chassis Frame + Front/Rear Bumpers + Optional Bullbar
  const chassis = new THREE.Mesh(
    createBeveledBlockGeometry(1.02, 0.18, 1.82, 0.1, 0.025),
    darkTrimMat,
  );
  chassis.position.y = 0.14;
  bodyTiltGroup.add(chassis);

  const frontBumper = new THREE.Mesh(
    createBeveledBlockGeometry(1.12, 0.15, 0.22, 0.07, 0.02),
    chromeMat,
  );
  frontBumper.position.set(0, 0.17, 0.88);
  const rearBumper = new THREE.Mesh(
    createBeveledBlockGeometry(1.1, 0.14, 0.2, 0.06, 0.02),
    chromeMat,
  );
  rearBumper.position.set(0, 0.17, -0.88);
  bodyTiltGroup.add(frontBumper, rearBumper);

  // Heavy Bullbar (visible on ArmoredVan!)
  const bullbarGroup = new THREE.Group();
  const bbBar = new THREE.Mesh(
    createBeveledBlockGeometry(1.14, 0.26, 0.1, 0.04, 0.015),
    chromeMat,
  );
  bbBar.position.set(0, 0.3, 0.98);
  bullbarGroup.add(bbBar);
  bodyTiltGroup.add(bullbarGroup);

  // Kei-Truck Timber Flatbed Side Rails (visible on KeiTruck!)
  const keiBedGroup = new THREE.Group();
  for (const sx of [-0.48, 0.48]) {
    const rail = new THREE.Mesh(
      createBeveledBlockGeometry(0.08, 0.28, 1.06, 0.03, 0.01),
      woodRailMat,
    );
    rail.position.set(sx, 0.42, -0.32);
    keiBedGroup.add(rail);
  }
  const keiFloor = new THREE.Mesh(
    createBeveledBlockGeometry(1.06, 0.18, 1.08, 0.08, 0.02),
    cargoMat,
  );
  keiFloor.position.set(0, 0.26, -0.32);
  keiBedGroup.add(keiFloor);
  bodyTiltGroup.add(keiBedGroup);

  // Enclosed Box-Van Cargo Compartment (visible on ClassicVan & ArmoredVan; slimmed on VespaTrike)
  const enclosedCargoGroup = new THREE.Group();
  const cargoBox = new THREE.Mesh(
    createBeveledBlockGeometry(1.08, 0.82, 1.08, 0.12, 0.035),
    cargoMat,
  );
  cargoBox.position.set(0, 0.26, -0.32);
  cargoBox.castShadow = true;
  enclosedCargoGroup.add(cargoBox);

  const cargoBand = new THREE.Mesh(
    createBeveledBlockGeometry(1.105, 0.2, 1.09, 0.11, 0.02),
    cabMat,
  );
  cargoBand.position.set(0, 0.46, -0.32);
  enclosedCargoGroup.add(cargoBand);

  const goldPinStripe = new THREE.Mesh(
    createBeveledBlockGeometry(1.115, 0.07, 1.095, 0.1, 0.015),
    stripeMat,
  );
  goldPinStripe.position.set(0, 0.63, -0.32);
  enclosedCargoGroup.add(goldPinStripe);

  const rearDoor = new THREE.Mesh(
    createBeveledBlockGeometry(0.76, 0.6, 0.06, 0.05, 0.015),
    chromeMat,
  );
  rearDoor.position.set(0, 0.36, -0.85);
  enclosedCargoGroup.add(rearDoor);
  bodyTiltGroup.add(enclosedCargoGroup);

  const tailGeo = getSharedGeo('van_tail', () => new THREE.BoxGeometry(0.14, 0.09, 0.05));
  for (const tx of [-0.38, 0.38]) {
    const tl = new THREE.Mesh(tailGeo, taillightMat);
    tl.position.set(tx, 0.32, -0.87);
    bodyTiltGroup.add(tl);
  }

  // 3. Sculpted Cab-Forward Driver Cabin + Aerodynamic Roof Fairing
  const cabLower = new THREE.Mesh(
    createBeveledBlockGeometry(1.02, 0.44, 0.72, 0.14, 0.035),
    cabMat,
  );
  cabLower.position.set(0, 0.26, 0.54);
  cabLower.castShadow = true;
  bodyTiltGroup.add(cabLower);

  const cabUpper = new THREE.Mesh(
    createBeveledBlockGeometry(0.96, 0.38, 0.56, 0.12, 0.03),
    cabMat,
  );
  cabUpper.position.set(0, 0.6, 0.46);
  cabUpper.castShadow = true;
  bodyTiltGroup.add(cabUpper);

  const fairing = new THREE.Mesh(
    createBeveledBlockGeometry(0.88, 0.16, 0.38, 0.1, 0.025),
    cabMat,
  );
  fairing.position.set(0, 0.94, 0.38);
  fairing.rotation.x = 0.22;
  bodyTiltGroup.add(fairing);

  // Swap-Ready 3D Roof Topper Pivot on Cab Roof!
  const topperPivot = new THREE.Group();
  topperPivot.position.set(0, 1.03, 0.5);
  bodyTiltGroup.add(topperPivot);

  const topperMeshes: Record<TopperId, THREE.Group> = {
    [TopperId.Beacon]: (() => {
      const g = new THREE.Group();
      const bar = new THREE.Mesh(
        createBeveledBlockGeometry(0.46, 0.09, 0.14, 0.04, 0.015),
        beaconMat,
      );
      g.add(bar);
      return g;
    })(),
    [TopperId.RubberDuck]: (() => {
      const g = new THREE.Group();
      const yellowMat = getCachedStandardMat(0xffdf24, 0.38, 0.04);
      const beakMat = getCachedStandardMat(0xff7b00, 0.4, 0.04);
      const eyeMat = getCachedStandardMat(0x140c04, 0.2, 0.05);
      const body = new THREE.Mesh(
        getSharedGeo('top_duck_b', () => new THREE.SphereGeometry(0.18, 12, 10)),
        yellowMat,
      );
      body.scale.set(1.0, 0.82, 1.2);
      body.position.y = 0.12;
      const head = new THREE.Mesh(
        getSharedGeo('top_duck_h', () => new THREE.SphereGeometry(0.13, 12, 10)),
        yellowMat,
      );
      head.position.set(0, 0.27, 0.09);
      const beak = new THREE.Mesh(
        getSharedGeo('top_duck_bk', () => new THREE.BoxGeometry(0.11, 0.045, 0.1)),
        beakMat,
      );
      beak.position.set(0, 0.25, 0.22);
      for (const ex of [-0.06, 0.06]) {
        const eye = new THREE.Mesh(
          getSharedGeo('top_duck_e', () => new THREE.SphereGeometry(0.022, 8, 6)),
          eyeMat,
        );
        eye.position.set(ex, 0.29, 0.19);
        g.add(eye);
      }
      g.add(body, head, beak);
      return g;
    })(),
    [TopperId.EspressoCup]: (() => {
      const g = new THREE.Group();
      const creamM = getCachedStandardMat(0xfff8ec, 0.45, 0.04);
      const mintM = getCachedStandardMat(0x2ec4b6, 0.4, 0.06);
      const espM = getCachedStandardMat(0x4a2c18, 0.35, 0.05);
      const saucer = new THREE.Mesh(
        getSharedGeo('top_saucer', () => new THREE.CylinderGeometry(0.24, 0.18, 0.045, 14)),
        creamM,
      );
      const cup = new THREE.Mesh(
        getSharedGeo('top_cup', () => new THREE.CylinderGeometry(0.18, 0.13, 0.24, 14)),
        mintM,
      );
      cup.position.y = 0.14;
      const crema = new THREE.Mesh(
        getSharedGeo('top_crema', () => new THREE.CylinderGeometry(0.16, 0.16, 0.025, 12)),
        espM,
      );
      crema.position.y = 0.255;
      g.add(saucer, cup, crema);
      return g;
    })(),
    [TopperId.PartyBalloons]: (() => {
      const g = new THREE.Group();
      const cols = [0xff595e, 0xffca3a, 0x38bdf8];
      const offs = [
        [-0.16, 0.42, -0.04],
        [0.0, 0.52, 0.05],
        [0.16, 0.4, -0.03],
      ];
      const strGeo = getSharedGeo(
        'top_b_str',
        () => new THREE.CylinderGeometry(0.01, 0.01, 0.42, 6),
      );
      const balGeo = getSharedGeo(
        'top_b_sph',
        () => new THREE.SphereGeometry(0.13, 12, 10),
      );
      offs.forEach(([bx, by, bz], idx) => {
        const s = new THREE.Mesh(strGeo, chromeMat);
        s.position.set(bx * 0.5, by * 0.48, bz * 0.5);
        const b = new THREE.Mesh(
          balGeo,
          getCachedStandardMat(cols[idx], 0.35, 0.05),
        );
        b.scale.set(1, 1.18, 1);
        b.position.set(bx, by, bz);
        g.add(s, b);
      });
      return g;
    })(),
  };

  Object.values(topperMeshes).forEach((m) => {
    m.visible = false;
    topperPivot.add(m);
  });

  // 4. Windshield, Side Cab Windows, Wing Mirrors, Slatted Grille & Headlights
  const windshield = new THREE.Mesh(
    createBeveledBlockGeometry(0.84, 0.27, 0.1, 0.05, 0.015),
    glassMat,
  );
  windshield.position.set(0, 0.67, 0.72);
  windshield.rotation.x = -0.14;
  bodyTiltGroup.add(windshield);

  const sideCabWin = new THREE.Mesh(
    createBeveledBlockGeometry(0.99, 0.23, 0.36, 0.04, 0.015),
    glassMat,
  );
  sideCabWin.position.set(0, 0.67, 0.47);
  bodyTiltGroup.add(sideCabWin);

  const mirrorGeo = getSharedGeo('van_mirror', () => new THREE.BoxGeometry(0.08, 0.13, 0.05));
  for (const mx of [-0.54, 0.54]) {
    const mirror = new THREE.Mesh(mirrorGeo, darkTrimMat);
    mirror.position.set(mx, 0.66, 0.66);
    bodyTiltGroup.add(mirror);
  }

  const grille = new THREE.Mesh(
    createBeveledBlockGeometry(0.52, 0.18, 0.06, 0.04, 0.01),
    darkTrimMat,
  );
  grille.position.set(0, 0.36, 0.89);
  const badge = new THREE.Mesh(
    getSharedGeo('van_badge', () => new THREE.CylinderGeometry(0.065, 0.065, 0.04, 12)),
    stripeMat,
  );
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0, 0.37, 0.92);
  bodyTiltGroup.add(grille, badge);

  const hlGeo = getSharedGeo('van_hl', () => {
    const g = new THREE.CylinderGeometry(0.095, 0.095, 0.06, 14);
    g.rotateX(Math.PI / 2);
    return g;
  });
  for (const hx of [-0.35, 0.35]) {
    const hl = new THREE.Mesh(hlGeo, headlightMat);
    hl.position.set(hx, 0.38, 0.9);
    bodyTiltGroup.add(hl);
  }

  // Volumetric-style Warm 3D Headlight Cones for Twilight Neon Shifts!
  const headlightCones = new THREE.Group();
  const coneGeo = getSharedGeo('van_hl_cone', () => {
    const g = new THREE.ConeGeometry(0.78, 3.8, 16, 1, true);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, 1.95);
    return g;
  });
  const coneMat = markShared(
    new THREE.MeshBasicMaterial({
      color: 0xfff3b0,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  for (const hx of [-0.34, 0.34]) {
    const beam = new THREE.Mesh(coneGeo, coneMat);
    beam.position.set(hx, 0.32, 0.92);
    beam.rotation.x = 0.07;
    headlightCones.add(beam);
  }
  headlightCones.visible = false;
  bodyTiltGroup.add(headlightCones);

  // Protective Cyan Bumper-Shield Aura Ring (visible when hasBumperShield is true!)
  const shieldRing = new THREE.Mesh(
    getSharedGeo('van_shield_ring', () => new THREE.TorusGeometry(1.18, 0.065, 10, 28)),
    markShared(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.78,
      }),
    ),
  );
  shieldRing.rotation.x = Math.PI / 2;
  shieldRing.position.set(0, 0.34, 0);
  shieldRing.visible = false;
  bodyTiltGroup.add(shieldRing);

  // 5. Roof Cargo Rack Rails + Dynamic Stack of Taped Parcels
  const rackRail = new THREE.Mesh(
    createBeveledBlockGeometry(0.92, 0.06, 0.94, 0.06, 0.015),
    darkTrimMat,
  );
  rackRail.position.set(0, 1.07, -0.32);
  bodyTiltGroup.add(rackRail);

  // 6. Four Rimmed Tires
  const tireGeo = getSharedGeo('van_tire', () => {
    const g = new THREE.CylinderGeometry(0.21, 0.21, 0.16, 18);
    g.rotateZ(Math.PI / 2);
    return g;
  });
  const rimGeo = getSharedGeo('van_rim', () => {
    const g = new THREE.CylinderGeometry(0.115, 0.115, 0.175, 14);
    g.rotateZ(Math.PI / 2);
    return g;
  });
  const capGeo = getSharedGeo('van_cap', () => {
    const g = new THREE.CylinderGeometry(0.05, 0.05, 0.19, 10);
    g.rotateZ(Math.PI / 2);
    return g;
  });

  const wheels: THREE.Group[] = [];
  const frontWheelSteerGroups: THREE.Group[] = [];
  const wheelOffsets = [
    [-0.51, 0.21, 0.54],
    [0.51, 0.21, 0.54],
    [-0.51, 0.21, -0.46],
    [0.51, 0.21, -0.46],
  ];
  wheelOffsets.forEach(([wx, wy, wz], idx) => {
    const spinGroup = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, darkTrimMat);
    const rim = new THREE.Mesh(rimGeo, chromeMat);
    const cap = new THREE.Mesh(capGeo, stripeMat);
    spinGroup.add(tire, rim, cap);

    if (idx < 2) {
      const steerPivot = new THREE.Group();
      steerPivot.position.set(wx, wy, wz);
      steerPivot.add(spinGroup);
      bodyTiltGroup.add(steerPivot);
      frontWheelSteerGroups.push(steerPivot);
    } else {
      spinGroup.position.set(wx, wy, wz);
      bodyTiltGroup.add(spinGroup);
    }
    wheels.push(spinGroup);
  });

  const parcelBoxes: THREE.Group[] = [];
  const boxColors = [0xf5be72, 0xff94b2, 0x7fd0f8, 0xfcd868, 0x9ee07a];
  const boxKinds: ParcelKind[] = [
    ParcelKind.Small,
    ParcelKind.HotExpress,
    ParcelKind.Large,
    ParcelKind.Fragile,
  ];
  for (let i = 0; i < maxParcels; i++) {
    const pGroup = createMiniParcelMesh(
      boxColors[i % boxColors.length],
      boxKinds[i % boxKinds.length],
    );
    pGroup.scale.multiplyScalar(0.84);
    const layer = Math.floor(i / 2);
    const side = i % 2 === 0 ? -0.2 : 0.2;
    const bx = maxParcels === 1 ? 0 : side;
    const by = 1.13 + layer * 0.24;
    const bz = -0.32 + ((layer % 2) - 0.5) * 0.16;
    const brotY = ((i * 37) % 16 - 8) * 0.025;
    pGroup.position.set(bx, by, bz);
    pGroup.rotation.y = brotY;
    pGroup.userData.baseX = bx;
    pGroup.userData.baseY = by;
    pGroup.userData.baseZ = bz;
    pGroup.userData.baseRotY = brotY;
    pGroup.userData.layer = layer;
    bodyTiltGroup.add(pGroup);
    parcelBoxes.push(pGroup);
  }

  const setVehicleStyle = (vid: VehicleId) => {
    const isKei = vid === VehicleId.KeiTruck;
    const isTrike = vid === VehicleId.VespaTrike;
    const isArmored = vid === VehicleId.ArmoredVan;

    keiBedGroup.visible = isKei;
    enclosedCargoGroup.visible = !isKei;
    rackRail.visible = !isKei;
    bullbarGroup.visible = isArmored;

    enclosedCargoGroup.scale.set(isTrike ? 0.78 : 1.0, isTrike ? 0.88 : 1.0, 1.0);
    cabLower.scale.set(isTrike ? 0.72 : 1.0, 1.0, 1.0);
    cabUpper.scale.set(isTrike ? 0.74 : 1.0, 1.0, 1.0);

    // Adjust parcel stack height for open Kei flatbed vs roof rack
    parcelBoxes.forEach((pGroup, idx) => {
      const layer = Math.floor(idx / 2);
      const nextBaseY = (isKei ? 0.48 : 1.13) + layer * 0.24;
      pGroup.userData.baseY = nextBaseY;
      pGroup.position.y = nextBaseY;
    });

    if (vid === VehicleId.KeiTruck) {
      cabMat.color.setHex(0x2ec4b6);
      cargoMat.color.setHex(0xfff9ef);
      stripeMat.color.setHex(0xffbe0b);
    } else if (vid === VehicleId.VespaTrike) {
      cabMat.color.setHex(0xe63946);
      cargoMat.color.setHex(0xfff4e6);
      stripeMat.color.setHex(0xffd166);
    } else if (vid === VehicleId.ArmoredVan) {
      cabMat.color.setHex(0x2b59c3);
      cargoMat.color.setHex(0xeef4ff);
      stripeMat.color.setHex(0xffbe0b);
    } else {
      cabMat.color.setHex(0xf48836);
      cargoMat.color.setHex(0xfff6e6);
      stripeMat.color.setHex(0xffb703);
    }
  };

  const setTopper = (tid: TopperId) => {
    (Object.keys(topperMeshes) as TopperId[]).forEach((k) => {
      topperMeshes[k].visible = k === tid;
    });
  };

  setVehicleStyle(initialVehicle);
  setTopper(initialTopper);

  return {
    root,
    shadowMesh,
    bodyTiltGroup,
    wheels,
    frontWheelSteerGroups,
    parcelBoxes,
    bodyMaterials: [cabMat, cargoMat, stripeMat],
    taillightMat,
    headlightCones,
    shieldRing,
    topperPivot,
    setVehicleStyle,
    setTopper,
  };
}

export function createMiniParcelMesh(
  colorHex: number = 0xf4be74,
  kind: ParcelKind = ParcelKind.Small,
): THREE.Group {
  const g = new THREE.Group();

  if (kind === ParcelKind.Large) {
    // Heavy Slatted Timber Freight Crate with Dual Dark Steel Cargo Straps!
    const crateMat = getCachedStandardMat(0xd99b52, 0.74, 0.03);
    const strapMat = getCachedStandardMat(0x2d3748, 0.48, 0.35);
    const badgeMat = getCachedStandardMat(colorHex, 0.42, 0.05);

    const crate = new THREE.Mesh(
      createBeveledBlockGeometry(0.46, 0.34, 0.44, 0.04, 0.018),
      crateMat,
    );
    crate.castShadow = true;

    const strapGeo = getSharedGeo(
      'crate_strap',
      () => new THREE.BoxGeometry(0.475, 0.355, 0.055),
    );
    const strap1 = new THREE.Mesh(strapGeo, strapMat);
    strap1.position.set(0, 0.172, -0.12);
    const strap2 = new THREE.Mesh(strapGeo, strapMat);
    strap2.position.set(0, 0.172, 0.12);

    const topManifest = new THREE.Mesh(
      getSharedGeo('crate_lbl', () => new THREE.BoxGeometry(0.18, 0.02, 0.14)),
      badgeMat,
    );
    topManifest.position.set(0, 0.345, 0);

    g.add(crate, strap1, strap2, topManifest);
    return g;
  }

  if (kind === ParcelKind.Fragile) {
    // Pastel Gift / Glass Box with Crossed Satin Ribbon & 3D Bow!
    const giftMat = getCachedStandardMat(0xfff1f5, 0.45, 0.04);
    const ribbonMat = getCachedStandardMat(0xf43f5e, 0.34, 0.08);

    const box = new THREE.Mesh(
      createBeveledBlockGeometry(0.36, 0.26, 0.36, 0.05, 0.018),
      giftMat,
    );
    box.castShadow = true;

    const ribA = new THREE.Mesh(
      getSharedGeo('frag_rib_a', () => new THREE.BoxGeometry(0.065, 0.272, 0.372)),
      ribbonMat,
    );
    ribA.position.y = 0.132;
    const ribB = new THREE.Mesh(
      getSharedGeo('frag_rib_b', () => new THREE.BoxGeometry(0.372, 0.272, 0.065)),
      ribbonMat,
    );
    ribB.position.y = 0.132;

    const bowLoopGeo = getSharedGeo(
      'frag_bow',
      () => new THREE.TorusGeometry(0.055, 0.02, 8, 12),
    );
    const bowL = new THREE.Mesh(bowLoopGeo, ribbonMat);
    bowL.position.set(-0.045, 0.285, 0);
    bowL.rotation.z = 0.45;
    const bowR = new THREE.Mesh(bowLoopGeo, ribbonMat);
    bowR.position.set(0.045, 0.285, 0);
    bowR.rotation.z = -0.45;

    g.add(box, ribA, ribB, bowL, bowR);
    return g;
  }

  if (kind === ParcelKind.HotExpress) {
    // Crimson Insulated Thermal Pizza / Bento Carrier with Gold Foil Trim!
    const bagMat = getCachedStandardMat(0xe63946, 0.42, 0.06, 0xff4d00, 0.18);
    const goldMat = getCachedStandardMat(0xffd166, 0.3, 0.25);
    const bag = new THREE.Mesh(
      createBeveledBlockGeometry(0.4, 0.22, 0.4, 0.055, 0.018),
      bagMat,
    );
    bag.castShadow = true;
    const clasp = new THREE.Mesh(
      getSharedGeo('hot_clasp', () => new THREE.BoxGeometry(0.14, 0.06, 0.415)),
      goldMat,
    );
    clasp.position.y = 0.11;
    g.add(bag, clasp);
    return g;
  }

  // ParcelKind.Small — Nimble Express Flyer Carton
  const boxMat = getCachedStandardMat(colorHex, 0.66, 0.02);
  const tapeMat = getCachedStandardMat(0xfff8e8, 0.36, 0.05);
  const labelMat = getCachedStandardMat(0x10b981, 0.42, 0.04);

  const box = new THREE.Mesh(
    createBeveledBlockGeometry(0.32, 0.19, 0.32, 0.045, 0.016),
    boxMat,
  );
  box.castShadow = true;

  const tapeA = new THREE.Mesh(
    getSharedGeo('parcel_tape_s', () => new THREE.BoxGeometry(0.075, 0.202, 0.332)),
    tapeMat,
  );
  tapeA.position.y = 0.098;

  const shippingLabel = new THREE.Mesh(
    getSharedGeo('parcel_lbl_s', () => new THREE.BoxGeometry(0.11, 0.015, 0.09)),
    labelMat,
  );
  shippingLabel.position.set(0.07, 0.195, 0.05);

  g.add(box, tapeA, shippingLabel);
  return g;
}

/**
 * Realistic, well-proportioned articulated miniature human rig (~1.12 units tall)
 * with hip-pivoted trousers & sneakers, tailored torso/collar/satchel, shoulder-pivoted
 * sleeves & skin-tone hands, neck, facial features, and 6 distinct 3D hairstyles/hats.
 */
export interface PersonRig {
  root: THREE.Group;
  bodyBounce: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  headGroup: THREE.Group;
}

export function createDetailedPersonMesh(
  appearance: PersonAppearance,
  shadowTex: THREE.CanvasTexture,
): PersonRig {
  const root = new THREE.Group();

  const shad = new THREE.Mesh(
    getSharedGeo('person_shad', () => new THREE.PlaneGeometry(0.82, 0.82)),
    getShadowMaterial(shadowTex),
  );
  shad.rotation.x = -Math.PI / 2;
  shad.position.y = 0.018;
  root.add(shad);

  const bodyBounce = new THREE.Group();
  root.add(bodyBounce);

  const skinMat = getCachedStandardMat(appearance.skinColor, 0.58, 0.02);
  const hairMat = getCachedStandardMat(appearance.hairColor, 0.72, 0.03);
  const topMat = getCachedStandardMat(appearance.topColor, 0.65, 0.03);
  const bottomMat = getCachedStandardMat(appearance.bottomColor, 0.74, 0.02);
  const accentMat = getCachedStandardMat(appearance.accentColor, 0.52, 0.05);
  const shoeMat = getCachedStandardMat(0x2d3340, 0.68, 0.06);
  const soleMat = getCachedStandardMat(0xf8fafc, 0.45, 0.02);
  const eyeMat = getCachedStandardMat(0x1f2430, 0.2, 0.05);
  const strawMat = getCachedStandardMat(0xf3d48e, 0.72, 0.02);
  const leatherMat = getCachedStandardMat(0x9c5a34, 0.64, 0.06);

  // 1. Hip-Pivoted Left & Right Legs + Sneakers
  const legGeo = getSharedGeo('p_leg', () => new THREE.CapsuleGeometry(0.064, 0.22, 5, 10));
  const shoeGeo = createBeveledBlockGeometry(0.135, 0.075, 0.21, 0.04, 0.015);
  const soleGeo = getSharedGeo('p_sole', () => new THREE.BoxGeometry(0.14, 0.025, 0.215));

  const makeLeg = (xOff: number): THREE.Group => {
    const hip = new THREE.Group();
    hip.position.set(xOff, 0.42, 0);
    const trouser = new THREE.Mesh(legGeo, bottomMat);
    trouser.position.y = -0.15;
    trouser.castShadow = true;
    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(0, -0.39, 0.035);
    const sole = new THREE.Mesh(soleGeo, soleMat);
    sole.position.set(0, -0.405, 0.035);
    hip.add(trouser, shoe, sole);
    return hip;
  };

  const leftLeg = makeLeg(-0.088);
  const rightLeg = makeLeg(0.088);
  bodyBounce.add(leftLeg, rightLeg);

  // 2. Pelvis, Tailored Jacket/Shirt Torso, Collar & Optional Messenger Satchel
  const pelvis = new THREE.Mesh(
    getSharedGeo('p_pelvis', () => new THREE.CylinderGeometry(0.145, 0.135, 0.11, 14)),
    bottomMat,
  );
  pelvis.position.y = 0.43;
  bodyBounce.add(pelvis);

  const torso = new THREE.Mesh(
    createBeveledBlockGeometry(0.32, 0.34, 0.2, 0.075, 0.025),
    topMat,
  );
  torso.position.y = 0.46;
  torso.castShadow = true;
  bodyBounce.add(torso);

  const collar = new THREE.Mesh(
    getSharedGeo('p_collar', () => new THREE.CylinderGeometry(0.095, 0.115, 0.055, 12)),
    soleMat,
  );
  collar.position.y = 0.8;
  bodyBounce.add(collar);

  if (appearance.hasBag) {
    const bagPouch = new THREE.Mesh(
      createBeveledBlockGeometry(0.09, 0.16, 0.17, 0.03, 0.01),
      leatherMat,
    );
    bagPouch.position.set(0.18, 0.43, 0.02);
    const strap = new THREE.Mesh(
      getSharedGeo('p_strap', () => new THREE.BoxGeometry(0.34, 0.04, 0.22)),
      leatherMat,
    );
    strap.position.set(0.01, 0.61, 0);
    strap.rotation.z = -0.68;
    bodyBounce.add(bagPouch, strap);
  }

  // 3. Shoulder-Pivoted Left & Right Arms + Hands
  const armSleeveGeo = getSharedGeo('p_arm', () => new THREE.CapsuleGeometry(0.052, 0.19, 5, 10));
  const handGeo = getSharedGeo('p_hand', () => new THREE.SphereGeometry(0.052, 10, 8));

  const makeArm = (xOff: number): THREE.Group => {
    const shoulder = new THREE.Group();
    shoulder.position.set(xOff, 0.74, 0);
    const sleeve = new THREE.Mesh(armSleeveGeo, topMat);
    sleeve.position.y = -0.11;
    sleeve.castShadow = true;
    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.y = -0.24;
    shoulder.add(sleeve, hand);
    return shoulder;
  };

  const leftArm = makeArm(-0.205);
  const rightArm = makeArm(0.205);
  leftArm.rotation.z = 0.1;
  rightArm.rotation.z = -0.1;
  bodyBounce.add(leftArm, rightArm);

  // 4. Neck, Realistic Head, Ears, Nose, Eyes, Brows & 3D Hairstyles
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.81, 0);
  bodyBounce.add(headGroup);

  const neck = new THREE.Mesh(
    getSharedGeo('p_neck', () => new THREE.CylinderGeometry(0.058, 0.068, 0.08, 10)),
    skinMat,
  );
  neck.position.y = 0.03;
  headGroup.add(neck);

  const cranium = new THREE.Mesh(
    getSharedGeo('p_head', () => new THREE.SphereGeometry(0.165, 18, 14)),
    skinMat,
  );
  cranium.scale.set(0.95, 1.05, 0.98);
  cranium.position.y = 0.19;
  cranium.castShadow = true;
  headGroup.add(cranium);

  // Ears & Sculpted Nose
  const earGeo = getSharedGeo('p_ear', () => new THREE.SphereGeometry(0.036, 8, 8));
  for (const ex of [-0.155, 0.155]) {
    const ear = new THREE.Mesh(earGeo, skinMat);
    ear.position.set(ex, 0.185, -0.01);
    headGroup.add(ear);
  }
  const nose = new THREE.Mesh(
    getSharedGeo('p_nose', () => new THREE.SphereGeometry(0.028, 8, 8)),
    skinMat,
  );
  nose.position.set(0, 0.175, 0.162);
  headGroup.add(nose);

  // Expressive Eyes & Eyebrows
  const eyeGeo = getSharedGeo('p_eye', () => new THREE.SphereGeometry(0.022, 8, 8));
  const browGeo = getSharedGeo('p_brow', () => new THREE.BoxGeometry(0.044, 0.012, 0.015));
  for (const sx of [-0.058, 0.058]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(sx, 0.2, 0.152);
    const brow = new THREE.Mesh(browGeo, hairMat);
    brow.position.set(sx, 0.236, 0.15);
    headGroup.add(eye, brow);
  }

  // Base Hair Cap (shared across hair variants)
  const hairCrown = new THREE.Mesh(
    getSharedGeo(
      'p_hair_crown',
      () => new THREE.SphereGeometry(0.174, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
    ),
    hairMat,
  );
  hairCrown.position.y = 0.205;
  hairCrown.rotation.x = -0.22;
  headGroup.add(hairCrown);

  if (appearance.hairStyle === 'short') {
    const quiff = new THREE.Mesh(
      getSharedGeo('p_quiff', () => new THREE.SphereGeometry(0.075, 10, 8)),
      hairMat,
    );
    quiff.scale.set(1.5, 0.65, 0.9);
    quiff.position.set(0.02, 0.33, 0.11);
    headGroup.add(quiff);
  } else if (appearance.hairStyle === 'ponytail') {
    const tail = new THREE.Mesh(
      getSharedGeo('p_ponytail', () => new THREE.CapsuleGeometry(0.05, 0.14, 4, 8)),
      hairMat,
    );
    tail.position.set(0, 0.18, -0.19);
    tail.rotation.x = 0.55;
    headGroup.add(tail);
  } else if (appearance.hairStyle === 'bun') {
    const bun = new THREE.Mesh(
      getSharedGeo('p_bun', () => new THREE.SphereGeometry(0.082, 12, 10)),
      hairMat,
    );
    bun.position.set(0, 0.34, -0.11);
    headGroup.add(bun);
  } else if (appearance.hairStyle === 'curly') {
    const curlGeo = getSharedGeo('p_curl', () => new THREE.SphereGeometry(0.078, 10, 8));
    for (const [cx, cy, cz] of [
      [-0.12, 0.27, 0.02],
      [0.12, 0.27, 0.02],
      [0, 0.34, 0.05],
      [0, 0.26, -0.12],
    ]) {
      const c = new THREE.Mesh(curlGeo, hairMat);
      c.position.set(cx, cy, cz);
      headGroup.add(c);
    }
  } else if (appearance.hairStyle === 'cap') {
    const capDome = new THREE.Mesh(
      getSharedGeo(
        'p_cap_dome',
        () => new THREE.SphereGeometry(0.178, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.48),
      ),
      accentMat,
    );
    capDome.position.y = 0.22;
    const visor = new THREE.Mesh(
      getSharedGeo('p_cap_visor', () => new THREE.CylinderGeometry(0.15, 0.15, 0.022, 14, 1, false, -0.9, 1.8)),
      accentMat,
    );
    visor.position.set(0, 0.245, 0.08);
    headGroup.add(capDome, visor);
  } else if (appearance.hairStyle === 'sunhat') {
    const brim = new THREE.Mesh(
      getSharedGeo('p_hat_brim', () => new THREE.CylinderGeometry(0.29, 0.3, 0.024, 18)),
      strawMat,
    );
    brim.position.y = 0.31;
    const crown = new THREE.Mesh(
      getSharedGeo('p_hat_top', () => new THREE.CylinderGeometry(0.15, 0.165, 0.1, 16)),
      strawMat,
    );
    crown.position.y = 0.36;
    const ribbon = new THREE.Mesh(
      getSharedGeo('p_hat_rib', () => new THREE.CylinderGeometry(0.168, 0.168, 0.026, 16)),
      accentMat,
    );
    ribbon.position.y = 0.325;
    headGroup.add(brim, crown, ribbon);
  }

  return {
    root,
    bodyBounce,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    headGroup,
  };
}

export interface CitizenStopRig {
  citizenGroup: THREE.Group;
  person: PersonRig;
  pinSprite: THREE.Sprite;
  excitementBadge: THREE.Group;
  padGroup: THREE.Group;
  outerRing: THREE.Mesh;
  bullseyeRing: THREE.Mesh;
  overviewBeam: THREE.Group;
  deliveredParcel: THREE.Group;
  disposeTextures: () => void;
}

export function createCitizenStopRig(
  stop: DeliveryStop,
  citizenWorld: { x: number; z: number },
  roadWorld: { x: number; z: number },
  shadowTex: THREE.CanvasTexture,
  maxAnisotropy: number,
): CitizenStopRig {
  const citizenGroup = new THREE.Group();
  citizenGroup.position.set(citizenWorld.x, 0.42, citizenWorld.z);
  const lookYaw = Math.atan2(
    roadWorld.x - citizenWorld.x,
    roadWorld.z - citizenWorld.z,
  );
  citizenGroup.rotation.y = lookYaw;

  const person = createDetailedPersonMesh(stop.appearance, shadowTex);
  citizenGroup.add(person.root);

  // Distinct VIP Customer Headgear (Chef Toque, Mayor Crown, Harbor Captain Cap)
  if (stop.vipRole === 'chef') {
    const toqueMat = getCachedStandardMat(0xffffff, 0.4, 0.02);
    const toque = new THREE.Mesh(
      getSharedGeo('vip_toque', () => new THREE.CylinderGeometry(0.16, 0.13, 0.22, 12)),
      toqueMat,
    );
    toque.position.set(0, 0.42, 0);
    person.headGroup.add(toque);
  } else if (stop.vipRole === 'mayor') {
    const crownMat = getCachedStandardMat(0xffd700, 0.25, 0.45, 0xffb703, 0.25);
    const crown = new THREE.Mesh(
      getSharedGeo('vip_crown', () => new THREE.CylinderGeometry(0.15, 0.13, 0.12, 8)),
      crownMat,
    );
    crown.position.set(0, 0.38, 0);
    person.headGroup.add(crown);
  } else if (stop.vipRole === 'captain') {
    const navyMat = getCachedStandardMat(0x1d3557, 0.45, 0.1);
    const cap = new THREE.Mesh(
      getSharedGeo('vip_cap', () => new THREE.CylinderGeometry(0.17, 0.15, 0.09, 14)),
      navyMat,
    );
    cap.position.set(0, 0.36, 0.02);
    person.headGroup.add(cap);
  }

  // Cute front-yard home mailbox & welcome stone next to the waiting customer
  const postMat = getCachedStandardMat(0x8d5b3c, 0.78, 0.02);
  const boxMat = getCachedStandardMat(stop.hatColor, 0.48, 0.08);
  const post = new THREE.Mesh(
    getSharedGeo('stop_post', () => new THREE.CylinderGeometry(0.035, 0.04, 0.44, 8)),
    postMat,
  );
  post.position.set(-0.46, 0.22, 0.42);
  const mbox = new THREE.Mesh(
    createBeveledBlockGeometry(0.2, 0.16, 0.28, 0.05, 0.015),
    boxMat,
  );
  mbox.position.set(-0.46, 0.42, 0.42);
  citizenGroup.add(post, mbox);

  // Delivered Parcel Prop matched to stop's ParcelKind (hidden until delivered)
  const deliveredParcel = createMiniParcelMesh(stop.hatColor, stop.parcelKind);
  deliveredParcel.position.set(0.28, 0.02, 0.46);
  deliveredParcel.visible = false;
  citizenGroup.add(deliveredParcel);

  // Numbered Teardrop Route Pin Sprite above Customer
  const hexStr = '#' + stop.hatColor.toString(16).padStart(6, '0');
  const pinTex = createNumberPinTexture(stop.index, hexStr, maxAnisotropy);
  const pinMat = new THREE.SpriteMaterial({ map: pinTex, transparent: true });
  const pinSprite = new THREE.Sprite(pinMat);
  pinSprite.position.set(0, 1.9, 0);
  pinSprite.scale.set(0.92, 0.92, 0.92);
  citizenGroup.add(pinSprite);

  // Road Delivery Drop Zone Ring + Inner Glowing Gold Bullseye Target Ring!
  const padGroup = new THREE.Group();
  padGroup.position.set(roadWorld.x, 0.254, roadWorld.z);

  const outerRingMat = markShared(
    new THREE.MeshBasicMaterial({
      color: 0xffb703,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const outerRing = new THREE.Mesh(
    getSharedGeo('pad_ring', () => new THREE.RingGeometry(0.74, 0.96, 28)),
    outerRingMat,
  );
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.02;

  const bullseyeRing = new THREE.Mesh(
    getSharedGeo('pad_bullseye', () => new THREE.RingGeometry(0.22, 0.4, 24)),
    getSharedBasicMat(0xfff35c, 0.95),
  );
  bullseyeRing.rotation.x = -Math.PI / 2;
  bullseyeRing.position.y = 0.024;

  const innerFill = new THREE.Mesh(
    getSharedGeo('pad_fill', () => new THREE.CircleGeometry(0.72, 24)),
    getSharedBasicMat(0xffe699, 0.34),
  );
  innerFill.rotation.x = -Math.PI / 2;
  innerFill.position.y = 0.014;

  // Tall Bird's-Eye Overview Sky-Pillar so Active Stop #1 pops unmistakably during the 3-2-1 flyover!
  const overviewBeam = createOverviewBeaconMesh(0xffdf24, 0xff9f1c);
  padGroup.add(innerFill, outerRing, bullseyeRing, overviewBeam);

  // Floating Cheerful 3D Excitement Star/Heart Charm beside active/celebrating customer!
  const excitementBadge = new THREE.Group();
  excitementBadge.position.set(0.38, 1.48, 0.14);
  const charmMat = getCachedStandardMat(0xffe524, 0.22, 0.12, 0xffbe0b, 0.85);
  const heartMat = getCachedStandardMat(0xff5c8a, 0.25, 0.06, 0xff477e, 0.7);
  const charmCore = new THREE.Mesh(
    getSharedGeo('cust_charm_oct', () => new THREE.OctahedronGeometry(0.11, 0)),
    charmMat,
  );
  const charmHalo = new THREE.Mesh(
    getSharedGeo('cust_charm_ring', () => new THREE.TorusGeometry(0.15, 0.022, 8, 16)),
    heartMat,
  );
  excitementBadge.add(charmCore, charmHalo);
  excitementBadge.visible = false;
  citizenGroup.add(excitementBadge);

  return {
    citizenGroup,
    person,
    pinSprite,
    excitementBadge,
    padGroup,
    outerRing,
    bullseyeRing,
    overviewBeam,
    deliveredParcel,
    disposeTextures: () => {
      pinTex.dispose();
      pinMat.dispose();
    },
  };
}

const basicMatCache = new Map<string, THREE.MeshBasicMaterial>();
function getSharedBasicMat(colorHex: number, opacity: number): THREE.MeshBasicMaterial {
  const key = `${colorHex}_${opacity.toFixed(2)}`;
  let m = basicMatCache.get(key);
  if (!m) {
    m = markShared(
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      }),
    );
    basicMatCache.set(key, m);
  }
  return m;
}

/**
 * 8 High-Detail Architectural Building Models with recessed framed windows,
 * projecting sills, ground-floor shopfronts, striped scalloped awnings,
 * upper balconies, Mansard roofs, civic clocktowers, and rooftop water towers/HVAC/gardens.
 */
export function createPastelBuildingMesh(
  lot: BuildingLot,
  worldPos: { x: number; z: number },
  _clayBump: THREE.CanvasTexture,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(worldPos.x, 0.42, worldPos.z);
  group.rotation.y = lot.facingYaw;

  const paletteMap: Record<
    BuildingTheme,
    { wall: number; trim: number; accent: number; window: number; roof: number }
  > = {
    [BuildingTheme.PeriwinkleTower]: {
      wall: 0x95a5f6,
      trim: 0xf1f4ff,
      accent: 0xfcd259,
      window: 0x4d68b8,
      roof: 0x7e8ee0,
    },
    [BuildingTheme.PinkPinTower]: {
      wall: 0xf698c4,
      trim: 0xfff5fa,
      accent: 0xf48c46,
      window: 0x5c769e,
      roof: 0xe37ead,
    },
    [BuildingTheme.ApricotArchShop]: {
      wall: 0xf6b963,
      trim: 0xfff6e5,
      accent: 0xe76f51,
      window: 0x62a8d8,
      roof: 0xe29d48,
    },
    [BuildingTheme.SkyBlueCafe]: {
      wall: 0x7acbf6,
      trim: 0xf5fbff,
      accent: 0xf2709c,
      window: 0x3f88b8,
      roof: 0x5cb3e2,
    },
    [BuildingTheme.SunnyHeartShop]: {
      wall: 0xfbdf72,
      trim: 0xfffdf0,
      accent: 0xf4799b,
      window: 0x5898c4,
      roof: 0xe8c44f,
    },
    [BuildingTheme.TerracottaBakery]: {
      wall: 0xe88e5d,
      trim: 0xfff3e6,
      accent: 0x52b788,
      window: 0x599cc7,
      roof: 0xcf7344,
    },
    [BuildingTheme.MintMansardApartments]: {
      wall: 0x98dfbf,
      trim: 0xf7fff9,
      accent: 0xf4a261,
      window: 0x497999,
      roof: 0x4a576b, // Parisian slate Mansard roof!
    },
    [BuildingTheme.ClockTowerHall]: {
      wall: 0xf4e4c8,
      trim: 0xfffcf5,
      accent: 0xd97f45,
      window: 0x4c7399,
      roof: 0x4ea898, // Copper-verdigris spire!
    },
  };

  const colors = paletteMap[lot.theme];
  const wallMat = getCachedStandardMat(colors.wall, 0.7, 0.03);
  const trimMat = getCachedStandardMat(colors.trim, 0.48, 0.04);
  const winMat = getCachedStandardMat(colors.window, 0.16, 0.24);
  const accentMat = getCachedStandardMat(colors.accent, 0.46, 0.06);
  const roofMat = getCachedStandardMat(colors.roof, 0.62, 0.06);
  const darkMetalMat = getCachedStandardMat(0x374151, 0.55, 0.25);
  const woodMat = getCachedStandardMat(0xa46338, 0.72, 0.03);
  const foliageMat = getCachedStandardMat(0x69c655, 0.68, 0.02);

  // Compact 0.68 footprint leaves a lush green sidewalk setback on every block for real boulevard street trees!
  const w = TILE_SIZE * 0.68;
  const h = 0.98 + lot.floors * 0.66;

  // 1. Stone Foundation Plinth + Ground-Floor Rusticated Band
  const plinth = new THREE.Mesh(
    createBeveledBlockGeometry(w * 1.05, 0.18, w * 1.05, 0.12, 0.03),
    trimMat,
  );
  plinth.receiveShadow = true;
  group.add(plinth);

  // 2. Main Facade Body + Subtle Corner Pilasters
  const body = new THREE.Mesh(
    createBeveledBlockGeometry(w, h, w, 0.14, 0.045),
    wallMat,
  );
  body.position.y = 0.12;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Mid-belt architectural stringcourse above ground floor
  const belt = new THREE.Mesh(
    createBeveledBlockGeometry(w * 1.03, 0.08, w * 1.03, 0.12, 0.02),
    trimMat,
  );
  belt.position.y = 0.76;
  group.add(belt);

  // 3. Crown Cornice & Optional Parisian Mansard Roof
  const corniceY = 0.12 + h - 0.03;
  const cornice = new THREE.Mesh(
    createBeveledBlockGeometry(w * 1.06, 0.15, w * 1.06, 0.13, 0.03),
    trimMat,
  );
  cornice.position.y = corniceY;
  cornice.castShadow = true;
  group.add(cornice);

  let roofTopY = corniceY + 0.14;
  if (lot.theme === BuildingTheme.MintMansardApartments) {
    const mansard = new THREE.Mesh(
      getSharedGeo('b_mansard', () => {
        const g = new THREE.CylinderGeometry(w * 0.54, w * 0.73, 0.52, 4);
        g.rotateY(Math.PI / 4);
        return g;
      }),
      roofMat,
    );
    mansard.position.y = roofTopY + 0.24;
    mansard.castShadow = true;
    group.add(mansard);
    roofTopY += 0.5;
  }

  // 4. Recessed Framed Windows + Bottom Window Sills + Optional Balconies
  const winPaneGeo = getSharedGeo('b_win_pane', () => new THREE.BoxGeometry(0.3, 0.34, 0.05));
  const winFrameGeo = getSharedGeo('b_win_frame', () => new THREE.BoxGeometry(0.36, 0.4, 0.03));
  const sillGeo = getSharedGeo('b_win_sill', () => new THREE.BoxGeometry(0.42, 0.05, 0.1));
  const balcSlabGeo = getSharedGeo('b_balc_slab', () => new THREE.BoxGeometry(0.56, 0.055, 0.24));
  const balcRailGeo = getSharedGeo('b_balc_rail', () => new THREE.BoxGeometry(0.54, 0.14, 0.22));

  for (let fl = 1; fl < lot.floors; fl++) {
    const wy = 0.54 + fl * 0.64;
    if (wy + 0.24 > h) break;
    for (const wx of [-0.42, 0.42]) {
      // Front & Back windows with frames & sills
      for (const dir of [1, -1]) {
        const zFace = dir * (w * 0.49);
        const frame = new THREE.Mesh(winFrameGeo, trimMat);
        frame.position.set(wx, wy, zFace);
        const pane = new THREE.Mesh(winPaneGeo, winMat);
        pane.position.set(wx, wy, zFace + dir * 0.015);
        const sill = new THREE.Mesh(sillGeo, trimMat);
        sill.position.set(wx, wy - 0.2, zFace + dir * 0.03);
        group.add(frame, pane, sill);
      }

      // Left & Right side windows
      for (const dir of [1, -1]) {
        const xFace = dir * (w * 0.49);
        const paneS = new THREE.Mesh(winPaneGeo, winMat);
        paneS.rotation.y = Math.PI / 2;
        paneS.position.set(xFace + dir * 0.01, wy, wx);
        const sillS = new THREE.Mesh(sillGeo, trimMat);
        sillS.rotation.y = Math.PI / 2;
        sillS.position.set(xFace + dir * 0.025, wy - 0.2, wx);
        group.add(paneS, sillS);
      }
    }

    // Projecting Front Balcony on upper floor
    if (lot.hasBalconies && fl === 1) {
      const bSlab = new THREE.Mesh(balcSlabGeo, trimMat);
      bSlab.position.set(0.42, wy - 0.2, w * 0.55);
      const bRail = new THREE.Mesh(balcRailGeo, darkMetalMat);
      bRail.position.set(0.42, wy - 0.1, w * 0.55);
      group.add(bSlab, bRail);
    }
  }

  // 5. Ground-Floor Storefront: Timber Doorway + Showcase Window + Striped Awning!
  const doorFrame = new THREE.Mesh(
    createBeveledBlockGeometry(0.48, 0.54, 0.1, 0.1, 0.02),
    trimMat,
  );
  doorFrame.position.set(-0.34, 0.14, w * 0.48);
  const doorLeaf = new THREE.Mesh(
    createBeveledBlockGeometry(0.32, 0.44, 0.12, 0.06, 0.015),
    woodMat,
  );
  doorLeaf.position.set(-0.34, 0.14, w * 0.49);

  // Storefront Display Window on right half of ground floor
  const shopWindowFrame = new THREE.Mesh(
    getSharedGeo('b_shop_wf', () => new THREE.BoxGeometry(0.68, 0.42, 0.06)),
    trimMat,
  );
  shopWindowFrame.position.set(0.34, 0.42, w * 0.485);
  const shopWindowGlass = new THREE.Mesh(
    getSharedGeo('b_shop_wg', () => new THREE.BoxGeometry(0.58, 0.34, 0.08)),
    winMat,
  );
  shopWindowGlass.position.set(0.34, 0.42, w * 0.49);
  group.add(doorFrame, doorLeaf, shopWindowFrame, shopWindowGlass);

  if (lot.hasAwning) {
    // 5-stripe sloped storefront awning canopy!
    const stripeGeo = getSharedGeo('b_awn_seg', () => new THREE.BoxGeometry(0.31, 0.07, 0.36));
    for (let s = 0; s < 5; s++) {
      const seg = new THREE.Mesh(stripeGeo, s % 2 === 0 ? accentMat : trimMat);
      seg.position.set(-0.62 + s * 0.31, 0.72, w * 0.58);
      seg.rotation.x = 0.38;
      seg.castShadow = true;
      group.add(seg);
    }
  }

  // 6. Detailed Architectural Rooftop Props!
  if (lot.roofFeature === 'clock' || lot.theme === BuildingTheme.ClockTowerHall) {
    // Stepped Civic Belfry Clocktower + 4 Clock Dials + Verdigris Spire!
    const belfry = new THREE.Mesh(
      createBeveledBlockGeometry(0.86, 0.76, 0.86, 0.08, 0.025),
      wallMat,
    );
    belfry.position.y = roofTopY;
    belfry.castShadow = true;
    const spire = new THREE.Mesh(
      getSharedGeo('b_spire', () => {
        const g = new THREE.ConeGeometry(0.62, 0.72, 4);
        g.rotateY(Math.PI / 4);
        return g;
      }),
      roofMat,
    );
    spire.position.y = roofTopY + 1.1;
    spire.castShadow = true;
    group.add(belfry, spire);

    const dialGeo = getSharedGeo('b_dial', () => new THREE.CylinderGeometry(0.22, 0.22, 0.04, 16));
    const handGeo = getSharedGeo('b_hand', () => new THREE.BoxGeometry(0.03, 0.14, 0.05));
    for (let d = 0; d < 4; d++) {
      const dialPivot = new THREE.Group();
      dialPivot.position.y = roofTopY + 0.42;
      dialPivot.rotation.y = (d * Math.PI) / 2;
      const dial = new THREE.Mesh(dialGeo, trimMat);
      dial.rotation.x = Math.PI / 2;
      dial.position.z = 0.43;
      const hand = new THREE.Mesh(handGeo, darkMetalMat);
      hand.position.set(0.02, 0.04, 0.45);
      hand.rotation.z = -0.5;
      dialPivot.add(dial, hand);
      group.add(dialPivot);
    }
  } else if (lot.roofFeature === 'water_tower') {
    // Classic Timber Rooftop Water Tank on 4 Legs!
    const legGeo = getSharedGeo('wt_leg', () => new THREE.CylinderGeometry(0.03, 0.035, 0.34, 6));
    for (const [lx, lz] of [
      [-0.18, -0.18],
      [0.18, -0.18],
      [-0.18, 0.18],
      [0.18, 0.18],
    ]) {
      const leg = new THREE.Mesh(legGeo, darkMetalMat);
      leg.position.set(0.28 + lx, roofTopY + 0.16, -0.24 + lz);
      group.add(leg);
    }
    const barrel = new THREE.Mesh(
      getSharedGeo('wt_barrel', () => new THREE.CylinderGeometry(0.28, 0.28, 0.42, 14)),
      woodMat,
    );
    barrel.position.set(0.28, roofTopY + 0.5, -0.24);
    barrel.castShadow = true;
    const cap = new THREE.Mesh(
      getSharedGeo('wt_cap', () => new THREE.ConeGeometry(0.32, 0.22, 14)),
      roofMat,
    );
    cap.position.set(0.28, roofTopY + 0.82, -0.24);
    group.add(barrel, cap);
  } else if (lot.roofFeature === 'ac_units') {
    // Twin HVAC Condenser Units + Dark Fan Grilles!
    const acBoxGeo = createBeveledBlockGeometry(0.46, 0.26, 0.38, 0.04, 0.015);
    const fanGeo = getSharedGeo('ac_fan', () => new THREE.CylinderGeometry(0.13, 0.13, 0.03, 12));
    for (const ax of [-0.28, 0.3]) {
      const ac = new THREE.Mesh(acBoxGeo, trimMat);
      ac.position.set(ax, roofTopY, -0.16);
      const fan = new THREE.Mesh(fanGeo, darkMetalMat);
      fan.position.set(ax, roofTopY + 0.26, -0.16);
      group.add(ac, fan);
    }
  } else if (lot.roofFeature === 'garden') {
    // Rooftop Planter Box + Green Shrubs!
    const planter = new THREE.Mesh(
      createBeveledBlockGeometry(1.05, 0.18, 0.52, 0.06, 0.02),
      woodMat,
    );
    planter.position.set(0, roofTopY, 0.22);
    const shrubGeo = getSharedGeo('rg_shrub', () => new THREE.SphereGeometry(0.18, 10, 8));
    for (const sx of [-0.3, 0, 0.3]) {
      const sh = new THREE.Mesh(shrubGeo, foliageMat);
      sh.position.set(sx, roofTopY + 0.24, 0.22);
      group.add(sh);
    }
    group.add(planter);
  } else if (lot.roofFeature === 'pin') {
    const pad = new THREE.Mesh(
      createBeveledBlockGeometry(0.68, 0.12, 0.68, 0.1, 0.02),
      trimMat,
    );
    pad.position.y = roofTopY;
    const torus = new THREE.Mesh(
      getSharedGeo('roof_torus', () => new THREE.TorusGeometry(0.22, 0.075, 12, 20)),
      accentMat,
    );
    torus.position.y = roofTopY + 0.36;
    group.add(pad, torus);
  } else {
    // Sloped Studio Skylight
    const skylightBase = new THREE.Mesh(
      createBeveledBlockGeometry(0.84, 0.18, 0.62, 0.08, 0.02),
      trimMat,
    );
    skylightBase.position.set(-0.1, roofTopY, 0);
    const skylightGlass = new THREE.Mesh(
      getSharedGeo('roof_sky_g', () => new THREE.BoxGeometry(0.7, 0.08, 0.48)),
      winMat,
    );
    skylightGlass.position.set(-0.1, roofTopY + 0.18, 0);
    group.add(skylightBase, skylightGlass);
  }

  return group;
}

/**
 * 6 Lush Tree & Foliage Varieties:
 * - 'oak': Multi-crown volumetric canopy + forked timber branch
 * - 'pine': 4-tiered Alpine evergreen conifer
 * - 'sakura': Pastel cherry blossom canopy + dark bark trunk
 * - 'cypress': Tall tapered Mediterranean cypress
 * - 'autumn': Multi-crown golden/amber maple
 * - 'bush': Manicured park shrub with colorful flower buds
 */
export function createTreeMesh(
  prop: TreeProp,
  shadowTex: THREE.CanvasTexture,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(prop.x, 0.42, prop.z);
  g.scale.setScalar(prop.scale);

  const isBush = prop.variant === 'bush';
  const shadow = new THREE.Mesh(
    getSharedGeo(isBush ? 'bush_shad' : 'tree_shad', () =>
      new THREE.PlaneGeometry(isBush ? 0.85 : 1.25, isBush ? 0.85 : 1.25),
    ),
    getShadowMaterial(shadowTex),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  g.add(shadow);

  const leafMat = getCachedStandardMat(prop.tintHex, 0.66, 0.02);
  // Secondary highlight foliage shade for volumetric multi-puff depth
  const lightColor = new THREE.Color(prop.tintHex).offsetHSL(0.01, 0.04, 0.06).getHex();
  const leafHighlightMat = getCachedStandardMat(lightColor, 0.62, 0.02);

  if (isBush) {
    const mainPuff = new THREE.Mesh(
      getSharedGeo('bush_m', () => new THREE.SphereGeometry(0.28, 12, 10)),
      leafMat,
    );
    mainPuff.scale.set(1.2, 0.82, 1.1);
    mainPuff.position.y = 0.2;
    const sidePuff = new THREE.Mesh(
      getSharedGeo('bush_s', () => new THREE.SphereGeometry(0.2, 10, 8)),
      leafHighlightMat,
    );
    sidePuff.position.set(0.18, 0.16, 0.1);

    const budMat = getCachedStandardMat(0xff8fab, 0.45, 0.02);
    const budGeo = getSharedGeo('bush_bud', () => new THREE.SphereGeometry(0.055, 8, 6));
    for (const [bx, by, bz] of [
      [-0.12, 0.34, 0.14],
      [0.14, 0.3, -0.08],
      [0.04, 0.36, 0.16],
    ]) {
      const bud = new THREE.Mesh(budGeo, budMat);
      bud.position.set(bx, by, bz);
      g.add(bud);
    }
    g.add(mainPuff, sidePuff);
    return g;
  }

  const barkHex = prop.variant === 'sakura' ? 0x6d4534 : 0xa96938;
  const trunkMat = getCachedStandardMat(barkHex, 0.84, 0.02);

  const trunk = new THREE.Mesh(
    getSharedGeo('tree_trunk', () => new THREE.CylinderGeometry(0.095, 0.155, 0.56, 10)),
    trunkMat,
  );
  trunk.position.y = 0.28;
  trunk.castShadow = true;
  g.add(trunk);

  if (prop.variant === 'pine') {
    const t1 = new THREE.Mesh(
      getSharedGeo('pine_1', () => new THREE.ConeGeometry(0.5, 0.52, 14)),
      leafMat,
    );
    t1.position.y = 0.58;
    t1.castShadow = true;
    const t2 = new THREE.Mesh(
      getSharedGeo('pine_2', () => new THREE.ConeGeometry(0.4, 0.48, 14)),
      leafHighlightMat,
    );
    t2.position.y = 0.88;
    t2.castShadow = true;
    const t3 = new THREE.Mesh(
      getSharedGeo('pine_3', () => new THREE.ConeGeometry(0.28, 0.42, 12)),
      leafMat,
    );
    t3.position.y = 1.16;
    t3.castShadow = true;
    g.add(t1, t2, t3);
  } else if (prop.variant === 'cypress') {
    const c1 = new THREE.Mesh(
      getSharedGeo('cyp_1', () => new THREE.SphereGeometry(0.28, 12, 12)),
      leafMat,
    );
    c1.scale.set(0.95, 1.85, 0.95);
    c1.position.y = 0.78;
    c1.castShadow = true;
    const c2 = new THREE.Mesh(
      getSharedGeo('cyp_2', () => new THREE.ConeGeometry(0.22, 0.62, 12)),
      leafHighlightMat,
    );
    c2.position.y = 1.32;
    c2.castShadow = true;
    g.add(c1, c2);
  } else {
    // Volumetric Multi-Crown Canopy ('oak', 'sakura', 'autumn') + Side Branch!
    const branch = new THREE.Mesh(
      getSharedGeo('tree_branch', () => new THREE.CylinderGeometry(0.04, 0.06, 0.28, 7)),
      trunkMat,
    );
    branch.position.set(0.14, 0.5, 0.05);
    branch.rotation.z = -0.65;
    g.add(branch);

    const pMain = new THREE.Mesh(
      getSharedGeo('puff_main', () => new THREE.SphereGeometry(0.42, 16, 14)),
      leafMat,
    );
    pMain.scale.set(1.08, 0.92, 1.06);
    pMain.position.set(-0.04, 0.82, 0);
    pMain.castShadow = true;

    const pTop = new THREE.Mesh(
      getSharedGeo('puff_top', () => new THREE.SphereGeometry(0.31, 14, 12)),
      leafHighlightMat,
    );
    pTop.position.set(0.06, 1.08, -0.04);
    pTop.castShadow = true;

    const pRight = new THREE.Mesh(
      getSharedGeo('puff_side', () => new THREE.SphereGeometry(0.29, 12, 10)),
      leafHighlightMat,
    );
    pRight.position.set(0.28, 0.72, 0.14);

    const pLeft = new THREE.Mesh(
      getSharedGeo('puff_side', () => new THREE.SphereGeometry(0.29, 12, 10)),
      leafMat,
    );
    pLeft.position.set(-0.24, 0.74, -0.14);

    g.add(pMain, pTop, pRight, pLeft);
  }

  return g;
}

/**
 * Rich Urban Street Furniture:
 * streetlamp, tiered stone water fountain, cafe umbrella patio table,
 * slatted park bench, postal mailbox, fire hydrant, and sidewalk flower planter.
 */
export function createStreetPropMesh(
  prop: StreetProp,
  shadowTex: THREE.CanvasTexture,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(prop.x, 0.42, prop.z);
  g.rotation.y = prop.yaw;

  const ironMat = getCachedStandardMat(0x2f3948, 0.58, 0.32);
  const stoneMat = getCachedStandardMat(0xede6da, 0.65, 0.04);
  const woodMat = getCachedStandardMat(0xb97442, 0.72, 0.03);
  const accentMat = getCachedStandardMat(prop.accentHex, 0.48, 0.06);

  if (prop.kind === 'streetlamp') {
    const base = new THREE.Mesh(
      getSharedGeo('lamp_base', () => new THREE.CylinderGeometry(0.08, 0.12, 0.22, 10)),
      ironMat,
    );
    base.position.y = 0.11;
    const pole = new THREE.Mesh(
      getSharedGeo('lamp_pole', () => new THREE.CylinderGeometry(0.038, 0.048, 1.28, 8)),
      ironMat,
    );
    pole.position.y = 0.74;
    pole.castShadow = true;
    const arm = new THREE.Mesh(
      getSharedGeo('lamp_arm', () => new THREE.BoxGeometry(0.28, 0.04, 0.04)),
      ironMat,
    );
    arm.position.set(0.11, 1.36, 0);
    const lanternMat = getCachedStandardMat(0xfff5c0, 0.2, 0.05, 0xffd166, 0.85);
    const bulb = new THREE.Mesh(
      getSharedGeo('lamp_bulb', () => new THREE.SphereGeometry(0.115, 12, 10)),
      lanternMat,
    );
    bulb.position.set(0.22, 1.28, 0);
    const cap = new THREE.Mesh(
      getSharedGeo('lamp_cap', () => new THREE.ConeGeometry(0.13, 0.09, 10)),
      ironMat,
    );
    cap.position.set(0.22, 1.4, 0);
    g.add(base, pole, arm, bulb, cap);
    return g;
  }

  if (prop.kind === 'fountain') {
    const waterMat = getCachedStandardMat(0x4ac6f8, 0.15, 0.1, 0x26a6df, 0.22);
    const foamMat = getCachedStandardMat(0xf4fbff, 0.3, 0.02);

    const outerBasin = new THREE.Mesh(
      getSharedGeo('fnt_basin', () => new THREE.CylinderGeometry(0.76, 0.72, 0.26, 12)),
      stoneMat,
    );
    outerBasin.position.y = 0.13;
    outerBasin.castShadow = true;

    const poolWater = new THREE.Mesh(
      getSharedGeo('fnt_water', () => new THREE.CylinderGeometry(0.66, 0.66, 0.05, 12)),
      waterMat,
    );
    poolWater.position.y = 0.25;

    const pedestal = new THREE.Mesh(
      getSharedGeo('fnt_ped', () => new THREE.CylinderGeometry(0.15, 0.2, 0.48, 10)),
      stoneMat,
    );
    pedestal.position.y = 0.42;

    const upperBowl = new THREE.Mesh(
      getSharedGeo('fnt_bowl', () => new THREE.CylinderGeometry(0.38, 0.18, 0.16, 12)),
      stoneMat,
    );
    upperBowl.position.y = 0.68;
    upperBowl.castShadow = true;

    const jet = new THREE.Mesh(
      getSharedGeo('fnt_jet', () => new THREE.SphereGeometry(0.13, 10, 8)),
      foamMat,
    );
    jet.scale.set(0.9, 1.4, 0.9);
    jet.position.y = 0.86;

    g.add(outerBasin, poolWater, pedestal, upperBowl, jet);
    return g;
  }

  if (prop.kind === 'cafe_umbrella') {
    const creamMat = getCachedStandardMat(0xfffaf0, 0.5, 0.02);
    const shad = new THREE.Mesh(
      getSharedGeo('umb_shad', () => new THREE.PlaneGeometry(1.15, 1.15)),
      getShadowMaterial(shadowTex),
    );
    shad.rotation.x = -Math.PI / 2;
    shad.position.y = 0.015;
    g.add(shad);

    const tableTop = new THREE.Mesh(
      getSharedGeo('umb_tbl', () => new THREE.CylinderGeometry(0.34, 0.34, 0.05, 14)),
      creamMat,
    );
    tableTop.position.y = 0.36;
    const pole = new THREE.Mesh(
      getSharedGeo('umb_pole', () => new THREE.CylinderGeometry(0.032, 0.035, 0.96, 8)),
      ironMat,
    );
    pole.position.y = 0.48;
    const canopy = new THREE.Mesh(
      getSharedGeo('umb_canopy', () => new THREE.ConeGeometry(0.62, 0.26, 8)),
      accentMat,
    );
    canopy.position.y = 0.98;
    canopy.castShadow = true;

    // 2 cute bistro chairs
    const seatGeo = getSharedGeo('umb_seat', () => new THREE.CylinderGeometry(0.13, 0.13, 0.04, 10));
    for (const cx of [-0.44, 0.44]) {
      const chair = new THREE.Mesh(seatGeo, woodMat);
      chair.position.set(cx, 0.22, 0);
      g.add(chair);
    }

    g.add(tableTop, pole, canopy);
    return g;
  }

  if (prop.kind === 'bench') {
    const seat = new THREE.Mesh(
      createBeveledBlockGeometry(0.68, 0.06, 0.26, 0.02, 0.01),
      woodMat,
    );
    seat.position.y = 0.2;
    seat.castShadow = true;
    const backrest = new THREE.Mesh(
      createBeveledBlockGeometry(0.68, 0.2, 0.05, 0.02, 0.01),
      woodMat,
    );
    backrest.position.set(0, 0.3, -0.11);
    const legGeo = getSharedGeo('bnch_leg', () => new THREE.BoxGeometry(0.05, 0.22, 0.24));
    for (const lx of [-0.26, 0.26]) {
      const leg = new THREE.Mesh(legGeo, ironMat);
      leg.position.set(lx, 0.11, 0);
      g.add(leg);
    }
    g.add(seat, backrest);
    return g;
  }

  if (prop.kind === 'mailbox') {
    const body = new THREE.Mesh(
      createBeveledBlockGeometry(0.24, 0.44, 0.22, 0.06, 0.015),
      accentMat,
    );
    body.position.y = 0.06;
    body.castShadow = true;
    const dome = new THREE.Mesh(
      getSharedGeo('mb_dome', () => new THREE.CylinderGeometry(0.11, 0.11, 0.23, 12)),
      accentMat,
    );
    dome.rotation.z = Math.PI / 2;
    dome.position.y = 0.48;
    g.add(body, dome);
    return g;
  }

  if (prop.kind === 'hydrant') {
    const cyl = new THREE.Mesh(
      getSharedGeo('hyd_cyl', () => new THREE.CylinderGeometry(0.09, 0.105, 0.34, 10)),
      accentMat,
    );
    cyl.position.y = 0.17;
    cyl.castShadow = true;
    const topCap = new THREE.Mesh(
      getSharedGeo('hyd_cap', () => new THREE.SphereGeometry(0.095, 10, 8)),
      accentMat,
    );
    topCap.position.y = 0.35;
    const nozzle = new THREE.Mesh(
      getSharedGeo('hyd_noz', () => new THREE.CylinderGeometry(0.032, 0.032, 0.26, 8)),
      stoneMat,
    );
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.y = 0.25;
    g.add(cyl, topCap, nozzle);
    return g;
  }

  // 'flower_planter'
  const box = new THREE.Mesh(
    createBeveledBlockGeometry(0.46, 0.18, 0.24, 0.04, 0.015),
    woodMat,
  );
  const greenery = new THREE.Mesh(
    getSharedGeo('flw_grn', () => new THREE.BoxGeometry(0.4, 0.1, 0.18)),
    getCachedStandardMat(0x5ec252, 0.7, 0.02),
  );
  greenery.position.y = 0.2;
  const bloom = new THREE.Mesh(
    getSharedGeo('flw_blm', () => new THREE.SphereGeometry(0.06, 8, 6)),
    accentMat,
  );
  bloom.position.set(0, 0.27, 0);
  g.add(box, greenery, bloom);
  return g;
}

/**
 * Canal Boats & Sailboats cruising along open water channels.
 */
export function createCanalBoatMesh(boat: CanalBoat): THREE.Group {
  const g = new THREE.Group();
  g.position.set(boat.x, 0.06, boat.z);
  g.rotation.y = boat.yaw;

  const hullMat = getCachedStandardMat(boat.hullColor, 0.52, 0.06);
  const deckMat = getCachedStandardMat(boat.cabinColor, 0.48, 0.03);
  const woodMat = getCachedStandardMat(0xa56336, 0.72, 0.02);
  const glassMat = getCachedStandardMat(0x5bb6e8, 0.16, 0.24);
  const ringMat = getCachedStandardMat(0xff595e, 0.45, 0.04);

  // Main Boat Hull + Tapered Bow Nose
  const hull = new THREE.Mesh(
    createBeveledBlockGeometry(0.76, 0.26, 1.38, 0.16, 0.04),
    hullMat,
  );
  hull.castShadow = true;

  const bow = new THREE.Mesh(
    getSharedGeo('boat_bow', () => {
      const c = new THREE.ConeGeometry(0.38, 0.52, 4);
      c.rotateX(Math.PI / 2);
      c.rotateZ(Math.PI / 4);
      return c;
    }),
    hullMat,
  );
  bow.scale.set(1, 0.55, 1);
  bow.position.set(0, 0.13, 0.82);

  const deck = new THREE.Mesh(
    createBeveledBlockGeometry(0.64, 0.06, 1.24, 0.12, 0.015),
    deckMat,
  );
  deck.position.y = 0.24;
  g.add(hull, bow, deck);

  if (boat.hasSail) {
    // Graceful Sailboat with wooden mast + billowing cream mainsail!
    const mast = new THREE.Mesh(
      getSharedGeo('boat_mast', () => new THREE.CylinderGeometry(0.028, 0.038, 1.45, 8)),
      woodMat,
    );
    mast.position.set(0, 0.96, 0.08);
    const sailShapeGeo = getSharedGeo('boat_sail', () => {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(0, 1.12);
      s.quadraticCurveTo(-0.34, 0.48, -0.62, 0.04);
      s.closePath();
      const eg = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
      eg.rotateY(Math.PI / 2);
      return eg;
    });
    const sail = new THREE.Mesh(sailShapeGeo, deckMat);
    sail.position.set(-0.015, 0.42, 0.06);
    sail.castShadow = true;
    g.add(mast, sail);
  } else {
    // Cozy Windowed Canal Launch Cabin + Lifebuoy!
    const cabin = new THREE.Mesh(
      createBeveledBlockGeometry(0.54, 0.34, 0.72, 0.08, 0.02),
      deckMat,
    );
    cabin.position.set(0, 0.28, -0.06);
    cabin.castShadow = true;
    const cabinWin = new THREE.Mesh(
      getSharedGeo('boat_win', () => new THREE.BoxGeometry(0.56, 0.15, 0.48)),
      glassMat,
    );
    cabinWin.position.set(0, 0.46, -0.04);
    const buoy = new THREE.Mesh(
      getSharedGeo('boat_buoy', () => new THREE.TorusGeometry(0.085, 0.028, 8, 14)),
      ringMat,
    );
    buoy.rotation.y = Math.PI / 2;
    buoy.position.set(0.28, 0.42, -0.1);
    g.add(cabin, cabinWin, buoy);
  }

  return g;
}

export interface HazardRig {
  hazard: TrafficHazard;
  root: THREE.Group;
  bodyTiltGroup?: THREE.Group;
  hitFlashMat?: THREE.MeshStandardMaterial;
  honkRingGroup?: THREE.Group;
  warningBeacon?: THREE.Mesh;
  aimStrip?: THREE.Mesh;
  gateArm?: THREE.Group;
}

export function createHazardMesh(
  hazard: TrafficHazard,
  shadowTex: THREE.CanvasTexture,
): HazardRig {
  const root = new THREE.Group();
  root.position.set(hazard.x, 0.24, hazard.z);
  root.rotation.y = hazard.yaw;

  const tireMat = getCachedStandardMat(0x2f3746, 0.82, 0.08);
  const rimMat = getCachedStandardMat(0xe8eef5, 0.3, 0.35);
  const glassMat = getCachedStandardMat(0x6ec3f0, 0.14, 0.26);
  const creamMat = getCachedStandardMat(0xfff9ed, 0.46, 0.04);
  const hlMat = getCachedStandardMat(0xfff5b5, 0.2, 0.05, 0xffd54f, 0.6);
  const tlMat = getCachedStandardMat(0xff4d5a, 0.25, 0.05, 0xe63946, 0.5);

  if (hazard.kind === HazardKind.Cruiser) {
    // Per-instance body material so only the specific bumped car flashes & wobbles!
    const bodyMat = new THREE.MeshStandardMaterial({
      color: hazard.colorHex,
      roughness: 0.52,
      metalness: 0.08,
    });
    const bodyTiltGroup = new THREE.Group();
    root.add(bodyTiltGroup);

    if (hazard.isBus) {
      // Detailed Lane-Proportioned City Minibus / Shuttle!
      const shad = new THREE.Mesh(
        getSharedGeo('bus_shad', () => new THREE.PlaneGeometry(1.22, 2.15)),
        getShadowMaterial(shadowTex),
      );
      shad.rotation.x = -Math.PI / 2;
      shad.position.y = 0.02;
      root.add(shad);

      const lowerBus = new THREE.Mesh(
        createBeveledBlockGeometry(0.84, 0.42, 1.74, 0.12, 0.03),
        bodyMat,
      );
      lowerBus.position.y = 0.16;
      lowerBus.castShadow = true;

      const upperBus = new THREE.Mesh(
        createBeveledBlockGeometry(0.8, 0.38, 1.66, 0.12, 0.028),
        creamMat,
      );
      upperBus.position.y = 0.52;
      upperBus.castShadow = true;

      const busWindows = new THREE.Mesh(
        createBeveledBlockGeometry(0.82, 0.23, 1.42, 0.05, 0.015),
        glassMat,
      );
      busWindows.position.y = 0.61;

      const frontGlass = new THREE.Mesh(
        getSharedGeo('bus_fg', () => new THREE.BoxGeometry(0.68, 0.24, 0.08)),
        glassMat,
      );
      frontGlass.position.set(0, 0.62, 0.81);

      const acPod = new THREE.Mesh(
        createBeveledBlockGeometry(0.52, 0.09, 0.64, 0.07, 0.02),
        bodyMat,
      );
      acPod.position.set(0, 0.9, -0.08);

      const wGeo = getSharedGeo('car_wheel', () => {
        const g = new THREE.CylinderGeometry(0.16, 0.16, 0.13, 14);
        g.rotateZ(Math.PI / 2);
        return g;
      });
      for (const [wx, wz] of [
        [-0.39, 0.5],
        [0.39, 0.5],
        [-0.39, -0.5],
        [0.39, -0.5],
      ]) {
        const w = new THREE.Mesh(wGeo, tireMat);
        w.position.set(wx, 0.16, wz);
        root.add(w);
      }

      bodyTiltGroup.add(lowerBus, upperBus, busWindows, frontGlass, acPod);
      const honkRingGroup = createVehicleHonkRingGroup(1.36);
      root.add(honkRingGroup);
      return {
        hazard,
        root,
        bodyTiltGroup,
        hitFlashMat: bodyMat,
        honkRingGroup,
      };
    }

    // Detailed Lane-Proportioned Sculpted Sedan / Hatchback!
    const shad = new THREE.Mesh(
      getSharedGeo('car_shad', () => new THREE.PlaneGeometry(1.12, 1.72)),
      getShadowMaterial(shadowTex),
    );
    shad.rotation.x = -Math.PI / 2;
    shad.position.y = 0.02;
    root.add(shad);

    const lowerBody = new THREE.Mesh(
      createBeveledBlockGeometry(0.78, 0.3, 1.38, 0.12, 0.03),
      bodyMat,
    );
    lowerBody.position.y = 0.14;
    lowerBody.castShadow = true;

    const cabin = new THREE.Mesh(
      createBeveledBlockGeometry(0.68, 0.27, 0.78, 0.1, 0.026),
      bodyMat,
    );
    cabin.position.set(0, 0.4, -0.05);
    cabin.castShadow = true;

    const cabinGlass = new THREE.Mesh(
      createBeveledBlockGeometry(0.7, 0.19, 0.66, 0.07, 0.015),
      glassMat,
    );
    cabinGlass.position.set(0, 0.44, -0.04);

    const frontGlass = new THREE.Mesh(
      getSharedGeo('car_fg', () => new THREE.BoxGeometry(0.6, 0.19, 0.08)),
      glassMat,
    );
    frontGlass.position.set(0, 0.44, 0.33);

    const hlGeo = getSharedGeo('car_hl', () => new THREE.SphereGeometry(0.068, 10, 8));
    for (const hx of [-0.26, 0.26]) {
      const hl = new THREE.Mesh(hlGeo, hlMat);
      hl.position.set(hx, 0.27, 0.68);
      const tl = new THREE.Mesh(hlGeo, tlMat);
      tl.position.set(hx, 0.27, -0.68);
      root.add(hl, tl);
    }

    const wGeo = getSharedGeo('car_wheel', () => {
      const g = new THREE.CylinderGeometry(0.16, 0.16, 0.13, 14);
      g.rotateZ(Math.PI / 2);
      return g;
    });
    const rGeo = getSharedGeo('car_rim', () => {
      const g = new THREE.CylinderGeometry(0.085, 0.085, 0.145, 10);
      g.rotateZ(Math.PI / 2);
      return g;
    });
    for (const [wx, wz] of [
      [-0.36, 0.4],
      [0.36, 0.4],
      [-0.36, -0.4],
      [0.36, -0.4],
    ]) {
      const w = new THREE.Mesh(wGeo, tireMat);
      w.position.set(wx, 0.16, wz);
      const r = new THREE.Mesh(rGeo, rimMat);
      r.position.set(wx, 0.16, wz);
      root.add(w, r);
    }

    bodyTiltGroup.add(lowerBody, cabin, cabinGlass, frontGlass);
    const honkRingGroup = createVehicleHonkRingGroup(0.98);
    root.add(honkRingGroup);
    return {
      hazard,
      root,
      bodyTiltGroup,
      hitFlashMat: bodyMat,
      honkRingGroup,
    };
  }

  if (hazard.kind === HazardKind.ScooterDash) {
    // Detailed Vespa Courier Scooter + Rider + Per-Instance Windup Beacon & Sight-Line!
    const scooterMat = new THREE.MeshStandardMaterial({
      color: 0xff595e,
      roughness: 0.44,
      metalness: 0.1,
    });
    const bodyTiltGroup = new THREE.Group();
    root.add(bodyTiltGroup);
    const jacketMat = getCachedStandardMat(0x3a86ff, 0.62, 0.04);
    const skinMat = getCachedStandardMat(0xf4cca8, 0.58, 0.02);

    const deck = new THREE.Mesh(
      createBeveledBlockGeometry(0.42, 0.18, 0.98, 0.1, 0.025),
      scooterMat,
    );
    deck.position.y = 0.15;
    deck.castShadow = true;

    const apron = new THREE.Mesh(
      createBeveledBlockGeometry(0.38, 0.46, 0.16, 0.08, 0.02),
      scooterMat,
    );
    apron.position.set(0, 0.26, 0.34);
    apron.rotation.x = -0.18;

    const handlebar = new THREE.Mesh(
      getSharedGeo('sct_bar', () => new THREE.CylinderGeometry(0.025, 0.025, 0.52, 8)),
      rimMat,
    );
    handlebar.rotation.z = Math.PI / 2;
    handlebar.position.set(0, 0.72, 0.28);

    const sWheelGeo = getSharedGeo('sct_whl', () => {
      const g = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 12);
      g.rotateZ(Math.PI / 2);
      return g;
    });
    for (const wz of [-0.34, 0.38]) {
      const sw = new THREE.Mesh(sWheelGeo, tireMat);
      sw.position.set(0, 0.15, wz);
      root.add(sw);
    }

    // Courier Rider Torso + Helmeted Head + Rear Delivery Top-Box
    const riderTorso = new THREE.Mesh(
      createBeveledBlockGeometry(0.28, 0.32, 0.2, 0.06, 0.02),
      jacketMat,
    );
    riderTorso.position.set(0, 0.36, -0.04);
    riderTorso.rotation.x = 0.18;

    const riderFace = new THREE.Mesh(
      getSharedGeo('sct_head', () => new THREE.SphereGeometry(0.145, 14, 12)),
      skinMat,
    );
    riderFace.position.set(0, 0.79, 0.01);

    const helmet = new THREE.Mesh(
      getSharedGeo(
        'sct_helm',
        () => new THREE.SphereGeometry(0.162, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
      ),
      creamMat,
    );
    helmet.position.set(0, 0.81, -0.01);
    helmet.rotation.x = -0.25;

    const topBox = createMiniParcelMesh(0xffca3a);
    topBox.scale.setScalar(0.82);
    topBox.position.set(0, 0.34, -0.36);

    // Per-instance telegraph meshes (not marked shared because visibility/emissive/disposal is per-level)
    const warningBeacon = new THREE.Mesh(
      getSharedGeo('haz_beacon', () => new THREE.SphereGeometry(0.17, 12, 10)),
      new THREE.MeshStandardMaterial({
        color: 0xffe066,
        emissive: 0xff9f1c,
        emissiveIntensity: 1.15,
        roughness: 0.2,
      }),
    );
    warningBeacon.position.set(0, 1.18, 0);
    warningBeacon.visible = false;

    const aimStrip = new THREE.Mesh(
      getSharedGeo('haz_aim', () => new THREE.PlaneGeometry(0.46, 5.2)),
      new THREE.MeshBasicMaterial({
        color: 0xff595e,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
      }),
    );
    aimStrip.rotation.x = -Math.PI / 2;
    aimStrip.position.set(0, 0.03, 2.8);
    aimStrip.visible = false;

    bodyTiltGroup.add(
      deck,
      apron,
      handlebar,
      riderTorso,
      riderFace,
      helmet,
      topBox,
    );
    root.add(warningBeacon, aimStrip);
    return {
      hazard,
      root,
      bodyTiltGroup,
      hitFlashMat: scooterMat,
      warningBeacon,
      aimStrip,
    };
  }

  // BridgeGate: Operator Gatehouse Booth + Twin Posts + Striped Boom Barrier!
  const postMat = getCachedStandardMat(0xd97b45, 0.64, 0.05);
  const redStripeMat = getCachedStandardMat(0xe63946, 0.45, 0.05);

  const postGeo = createBeveledBlockGeometry(0.28, 0.74, 0.28, 0.06, 0.02);
  const postL = new THREE.Mesh(postGeo, postMat);
  postL.position.set(-0.94, 0, 0);
  const postR = new THREE.Mesh(postGeo, postMat);
  postR.position.set(0.94, 0, 0);

  const gateArm = new THREE.Group();
  gateArm.position.set(-0.88, 0.54, 0);
  const segGeo = getSharedGeo('gate_seg', () => new THREE.BoxGeometry(0.36, 0.13, 0.13));
  for (let s = 0; s < 5; s++) {
    const seg = new THREE.Mesh(segGeo, s % 2 === 0 ? redStripeMat : creamMat);
    seg.position.set(0.18 + s * 0.35, 0, 0);
    gateArm.add(seg);
  }
  gateArm.rotation.z = Math.PI * 0.44;

  const warningBeacon = new THREE.Mesh(
    getSharedGeo('haz_beacon', () => new THREE.SphereGeometry(0.15, 12, 10)),
    new THREE.MeshStandardMaterial({
      color: 0xffbe0b,
      emissive: 0xff9f1c,
      emissiveIntensity: 0.2,
      roughness: 0.25,
    }),
  );
  warningBeacon.position.set(-0.94, 0.84, 0);

  root.add(postL, postR, gateArm, warningBeacon);
  return { hazard, root, warningBeacon, gateArm };
}

export interface TrafficSignalRig {
  signal: TrafficSignal;
  root: THREE.Group;
  ewRedMat: THREE.MeshStandardMaterial;
  ewYellowMat: THREE.MeshStandardMaterial;
  ewGreenMat: THREE.MeshStandardMaterial;
  nsRedMat: THREE.MeshStandardMaterial;
  nsYellowMat: THREE.MeshStandardMaterial;
  nsGreenMat: THREE.MeshStandardMaterial;
}

/**
 * 3D Intersection Traffic Signal Rig:
 * Corner pole with twin cantilevered arms extending over the E/W and N/S road approaches,
 * yellow signal housings, and glowing Red / Yellow / Green bulbs visible from top-down chase view!
 */
export function createTrafficSignalMesh(signal: TrafficSignal): TrafficSignalRig {
  const root = new THREE.Group();
  // Anchor mast cleanly on the SE sidewalk curb corner outside the asphalt road lanes!
  const cornerOff = TILE_SIZE * 0.51;
  root.position.set(signal.x + cornerOff, 0.25, signal.z + cornerOff);

  const poleMat = getCachedStandardMat(0x2d3748, 0.52, 0.36);
  const housingMat = getCachedStandardMat(0xf5b700, 0.44, 0.1);
  const stopLineMat = getCachedStandardMat(0xffffff, 0.5, 0.02);

  // Base & Mast
  const base = new THREE.Mesh(
    getSharedGeo('sig_base', () => new THREE.CylinderGeometry(0.11, 0.15, 0.22, 10)),
    poleMat,
  );
  base.position.y = 0.11;
  const mast = new THREE.Mesh(
    getSharedGeo('sig_mast', () => new THREE.CylinderGeometry(0.055, 0.068, 2.05, 10)),
    poleMat,
  );
  mast.position.y = 1.05;
  mast.castShadow = true;
  root.add(base, mast);

  // Crisp White Intersection Stop Bars on the 4 approaches!
  const stopBarGeo = getSharedGeo(
    'sig_stop_bar',
    () => new THREE.BoxGeometry(0.92, 0.016, 0.14),
  );
  // Relative to SE corner (signal.x + cornerOff, signal.z + cornerOff), intersection center is (-cornerOff, -cornerOff)
  const cx = -cornerOff;
  const cz = -cornerOff;
  const barDist = TILE_SIZE * 0.48;
  // Northbound stop bar (East right lane, South of intersection)
  const barN = new THREE.Mesh(stopBarGeo, stopLineMat);
  barN.position.set(cx + 0.44, 0.01, cz + barDist);
  // Southbound stop bar (West right lane, North of intersection)
  const barS = new THREE.Mesh(stopBarGeo, stopLineMat);
  barS.position.set(cx - 0.44, 0.01, cz - barDist);
  // Eastbound stop bar (South right lane, West of intersection)
  const barE = new THREE.Mesh(stopBarGeo, stopLineMat);
  barE.rotation.y = Math.PI / 2;
  barE.position.set(cx - barDist, 0.01, cz + 0.44);
  // Westbound stop bar (North right lane, East of intersection)
  const barW = new THREE.Mesh(stopBarGeo, stopLineMat);
  barW.rotation.y = Math.PI / 2;
  barW.position.set(cx + barDist, 0.01, cz - 0.44);
  root.add(barN, barS, barE, barW);

  // Arm 1 extending West (-X) over N/S traffic lanes
  const armNS = new THREE.Mesh(
    getSharedGeo('sig_arm_ns', () => new THREE.BoxGeometry(1.32, 0.065, 0.065)),
    poleMat,
  );
  armNS.position.set(-0.66, 1.98, 0);
  const boxNS = new THREE.Mesh(
    createBeveledBlockGeometry(0.76, 0.22, 0.28, 0.05, 0.015),
    housingMat,
  );
  boxNS.position.set(-0.88, 1.88, 0);
  root.add(armNS, boxNS);

  // Arm 2 extending North (-Z) over E/W traffic lanes
  const armEW = new THREE.Mesh(
    getSharedGeo('sig_arm_ew', () => new THREE.BoxGeometry(0.065, 0.065, 1.32)),
    poleMat,
  );
  armEW.position.set(0, 1.98, -0.66);
  const boxEW = new THREE.Mesh(
    createBeveledBlockGeometry(0.28, 0.22, 0.76, 0.05, 0.015),
    housingMat,
  );
  boxEW.position.set(0, 1.88, -0.88);
  root.add(armEW, boxEW);

  // Per-signal bulb materials (updated every frame from signal.state!)
  const makeBulbMat = (hex: number) =>
    new THREE.MeshStandardMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: 0.1,
      roughness: 0.22,
    });

  const nsRedMat = makeBulbMat(0xff3b30);
  const nsYellowMat = makeBulbMat(0xffcc00);
  const nsGreenMat = makeBulbMat(0x28cd41);

  const ewRedMat = makeBulbMat(0xff3b30);
  const ewYellowMat = makeBulbMat(0xffcc00);
  const ewGreenMat = makeBulbMat(0x28cd41);

  const bulbGeo = getSharedGeo('sig_bulb', () => new THREE.SphereGeometry(0.088, 12, 10));

  // Place bulbs proudly on TOP and SIDES of each housing so they read unmistakably from the elevated chase camera!
  const nsR = new THREE.Mesh(bulbGeo, nsRedMat);
  nsR.position.set(-1.1, 2.08, 0);
  const nsY = new THREE.Mesh(bulbGeo, nsYellowMat);
  nsY.position.set(-0.88, 2.08, 0);
  const nsG = new THREE.Mesh(bulbGeo, nsGreenMat);
  nsG.position.set(-0.66, 2.08, 0);

  const ewR = new THREE.Mesh(bulbGeo, ewRedMat);
  ewR.position.set(0, 2.08, -1.1);
  const ewY = new THREE.Mesh(bulbGeo, ewYellowMat);
  ewY.position.set(0, 2.08, -0.88);
  const ewG = new THREE.Mesh(bulbGeo, ewGreenMat);
  ewG.position.set(0, 2.08, -0.66);

  root.add(nsR, nsY, nsG, ewR, ewY, ewG);

  return {
    signal,
    root,
    ewRedMat,
    ewYellowMat,
    ewGreenMat,
    nsRedMat,
    nsYellowMat,
    nsGreenMat,
  };
}

export interface CoffeeKioskRig {
  kiosk: CoffeeKiosk;
  boothGroup: THREE.Group;
  cupGroup: THREE.Group;
  roadRingGroup: THREE.Group;
}

/**
 * Roadside Drive-Thru Espresso Boost Kiosk:
 * Cozy mint-and-cream coffee stand on the lawn + spinning giant espresso cup rooftop sign +
 * glowing emerald curbside drive-thru pickup ring!
 */
export function createCoffeeKioskMesh(
  kiosk: CoffeeKiosk,
  shadowTex: THREE.CanvasTexture,
): CoffeeKioskRig {
  const boothGroup = new THREE.Group();
  boothGroup.position.set(kiosk.kioskX, 0.42, kiosk.kioskZ);
  boothGroup.rotation.y = kiosk.yaw;

  const shad = new THREE.Mesh(
    getSharedGeo('kiosk_shad', () => new THREE.PlaneGeometry(1.4, 1.4)),
    getShadowMaterial(shadowTex),
  );
  shad.rotation.x = -Math.PI / 2;
  shad.position.y = 0.015;
  boothGroup.add(shad);

  const boothMat = getCachedStandardMat(0xfff8ec, 0.55, 0.04);
  const mintMat = getCachedStandardMat(0x2ec4b6, 0.46, 0.06);
  const woodMat = getCachedStandardMat(0x9c6644, 0.7, 0.03);
  const espressoMat = getCachedStandardMat(0x4a2c18, 0.35, 0.05);

  const cabin = new THREE.Mesh(
    createBeveledBlockGeometry(0.96, 0.88, 0.86, 0.12, 0.03),
    boothMat,
  );
  cabin.castShadow = true;
  boothGroup.add(cabin);

  const counter = new THREE.Mesh(
    createBeveledBlockGeometry(0.78, 0.08, 0.24, 0.04, 0.015),
    woodMat,
  );
  counter.position.set(0, 0.42, 0.46);
  const awning = new THREE.Mesh(
    createBeveledBlockGeometry(1.04, 0.14, 0.42, 0.06, 0.02),
    mintMat,
  );
  awning.position.set(0, 0.76, 0.38);
  awning.rotation.x = 0.28;
  boothGroup.add(counter, awning);

  // Giant Rooftop Espresso Cup Sign!
  const cupGroup = new THREE.Group();
  cupGroup.position.set(0, 0.94, 0);
  const saucer = new THREE.Mesh(
    getSharedGeo('kiosk_saucer', () => new THREE.CylinderGeometry(0.32, 0.24, 0.06, 16)),
    boothMat,
  );
  const cupBody = new THREE.Mesh(
    getSharedGeo('kiosk_cup', () => new THREE.CylinderGeometry(0.24, 0.17, 0.32, 16)),
    mintMat,
  );
  cupBody.position.y = 0.18;
  cupBody.castShadow = true;
  const crema = new THREE.Mesh(
    getSharedGeo('kiosk_crema', () => new THREE.CylinderGeometry(0.21, 0.21, 0.03, 14)),
    espressoMat,
  );
  crema.position.y = 0.33;
  const handle = new THREE.Mesh(
    getSharedGeo('kiosk_hdl', () => new THREE.TorusGeometry(0.085, 0.028, 8, 12)),
    boothMat,
  );
  handle.position.set(0.23, 0.19, 0);
  cupGroup.add(saucer, cupBody, crema, handle);
  boothGroup.add(cupGroup);

  // Glowing Drive-Thru Pickup Ring on adjacent road!
  const roadRingGroup = new THREE.Group();
  roadRingGroup.position.set(kiosk.roadX, 0.256, kiosk.roadZ);
  const ring = new THREE.Mesh(
    getSharedGeo('kiosk_ring', () => new THREE.RingGeometry(0.56, 0.78, 24)),
    getSharedBasicMat(0x10b981, 0.88),
  );
  ring.rotation.x = -Math.PI / 2;
  const fill = new THREE.Mesh(
    getSharedGeo('kiosk_fill', () => new THREE.CircleGeometry(0.54, 20)),
    getSharedBasicMat(0x6ee7b7, 0.32),
  );
  fill.rotation.x = -Math.PI / 2;
  roadRingGroup.add(fill, ring);

  return { kiosk, boothGroup, cupGroup, roadRingGroup };
}

/**
 * Pastel Striped Hot-Air Balloon drifting serenely over the outer harbor!
 */
export function createSkyBalloonMesh(balloon: SkyBalloon): THREE.Group {
  const g = new THREE.Group();
  g.position.set(balloon.baseX, balloon.baseY, balloon.baseZ);

  const mainMat = getCachedStandardMat(balloon.primaryColor, 0.56, 0.02);
  const stripeMat = getCachedStandardMat(balloon.stripeColor, 0.52, 0.03);
  const basketMat = getCachedStandardMat(0xb97a45, 0.78, 0.02);
  const ropeMat = getCachedStandardMat(0x475569, 0.6, 0.2);
  const flameMat = getCachedStandardMat(0xffbe0b, 0.2, 0.05, 0xff9f1c, 0.9);

  // Sculpted Envelope + Equatorial Accent Band + Throat Skirt
  const envelope = new THREE.Mesh(
    getSharedGeo('bal_env', () => new THREE.SphereGeometry(1.18, 18, 14)),
    mainMat,
  );
  envelope.scale.set(1, 1.18, 1);
  envelope.position.y = 1.65;

  const band = new THREE.Mesh(
    getSharedGeo('bal_band', () => new THREE.CylinderGeometry(1.19, 1.15, 0.36, 18)),
    stripeMat,
  );
  band.position.y = 1.62;

  const skirt = new THREE.Mesh(
    getSharedGeo('bal_skirt', () => new THREE.CylinderGeometry(0.62, 0.32, 0.48, 14)),
    stripeMat,
  );
  skirt.position.y = 0.58;

  const burner = new THREE.Mesh(
    getSharedGeo('bal_burn', () => new THREE.SphereGeometry(0.11, 8, 8)),
    flameMat,
  );
  burner.position.y = 0.32;

  const cableGeo = getSharedGeo('bal_cbl', () => new THREE.CylinderGeometry(0.016, 0.016, 0.42, 6));
  for (const [cx, cz] of [
    [-0.18, -0.18],
    [0.18, -0.18],
    [-0.18, 0.18],
    [0.18, 0.18],
  ]) {
    const c = new THREE.Mesh(cableGeo, ropeMat);
    c.position.set(cx, 0.22, cz);
    g.add(c);
  }

  const basket = new THREE.Mesh(
    createBeveledBlockGeometry(0.46, 0.32, 0.46, 0.06, 0.02),
    basketMat,
  );
  basket.position.y = -0.12;

  g.add(envelope, band, skirt, burner, basket);
  return g;
}

export interface MechanicGarageRig {
  garage: MechanicGarage;
  bayGroup: THREE.Group;
  wrenchGroup: THREE.Group;
  roadRingGroup: THREE.Group;
}

/**
 * Roadside Wrench Mechanic Pit-Stop Garage (+1 Hull HP & Cyan Bumper Shield!)
 */
export function createMechanicGarageMesh(
  garage: MechanicGarage,
  shadowTex: THREE.CanvasTexture,
): MechanicGarageRig {
  const bayGroup = new THREE.Group();
  bayGroup.position.set(garage.garageX, 0.42, garage.garageZ);
  bayGroup.rotation.y = garage.yaw;

  const shad = new THREE.Mesh(
    getSharedGeo('gar_shad', () => new THREE.PlaneGeometry(1.5, 1.5)),
    getShadowMaterial(shadowTex),
  );
  shad.rotation.x = -Math.PI / 2;
  shad.position.y = 0.015;
  bayGroup.add(shad);

  const brickMat = getCachedStandardMat(0x3a86ff, 0.54, 0.08);
  const creamMat = getCachedStandardMat(0xfff8eb, 0.48, 0.04);
  const chromeMat = getCachedStandardMat(0xe2e8f0, 0.25, 0.55);
  const goldMat = getCachedStandardMat(0xffbe0b, 0.38, 0.12);

  const bay = new THREE.Mesh(
    createBeveledBlockGeometry(1.06, 0.9, 0.9, 0.12, 0.03),
    creamMat,
  );
  bay.castShadow = true;
  const roof = new THREE.Mesh(
    createBeveledBlockGeometry(1.14, 0.16, 0.98, 0.08, 0.02),
    brickMat,
  );
  roof.position.y = 0.88;
  const shutter = new THREE.Mesh(
    createBeveledBlockGeometry(0.68, 0.58, 0.08, 0.04, 0.015),
    chromeMat,
  );
  shutter.position.set(0, 0.28, 0.44);
  bayGroup.add(bay, roof, shutter);

  // Spinning Rooftop Chrome Wrench Sign!
  const wrenchGroup = new THREE.Group();
  wrenchGroup.position.set(0, 1.28, 0);
  const shaft = new THREE.Mesh(
    getSharedGeo('gar_w_shaft', () => new THREE.BoxGeometry(0.11, 0.46, 0.06)),
    goldMat,
  );
  const jawTop = new THREE.Mesh(
    getSharedGeo('gar_w_jaw', () => new THREE.TorusGeometry(0.12, 0.045, 8, 12, Math.PI * 1.4)),
    chromeMat,
  );
  jawTop.position.y = 0.25;
  jawTop.rotation.z = 0.8;
  wrenchGroup.add(shaft, jawTop);
  bayGroup.add(wrenchGroup);

  const roadRingGroup = new THREE.Group();
  roadRingGroup.position.set(garage.roadX, 0.256, garage.roadZ);
  const ring = new THREE.Mesh(
    getSharedGeo('gar_ring', () => new THREE.RingGeometry(0.56, 0.8, 24)),
    getSharedBasicMat(0x38bdf8, 0.9),
  );
  ring.rotation.x = -Math.PI / 2;
  const fill = new THREE.Mesh(
    getSharedGeo('gar_fill', () => new THREE.CircleGeometry(0.54, 20)),
    getSharedBasicMat(0xbae6fd, 0.34),
  );
  fill.rotation.x = -Math.PI / 2;
  roadRingGroup.add(fill, ring);

  return { garage, bayGroup, wrenchGroup, roadRingGroup };
}

/**
 * Yellow-and-Amber Chevron Canal Jump Ramp!
 */
export function createJumpRampMesh(ramp: JumpRamp): THREE.Group {
  const g = new THREE.Group();
  g.position.set(ramp.x, 0.25, ramp.z);
  g.rotation.y = ramp.yaw;

  const rampMat = getCachedStandardMat(0xffbe0b, 0.42, 0.1, 0xf59e0b, 0.25);
  const stripeMat = getCachedStandardMat(0x1f2937, 0.55, 0.15);

  const wedgeGeo = getSharedGeo('jump_wedge', () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.55, 0);
    shape.lineTo(0.55, 0);
    shape.lineTo(0.55, 0.32);
    shape.closePath();
    const eg = new THREE.ExtrudeGeometry(shape, { depth: 0.92, bevelEnabled: false });
    eg.rotateY(-Math.PI / 2);
    eg.translate(0.46, 0, 0);
    return eg;
  });
  const wedge = new THREE.Mesh(wedgeGeo, rampMat);
  wedge.castShadow = true;

  const sideRailGeo = getSharedGeo('jump_rail', () => new THREE.BoxGeometry(0.06, 0.12, 1.08));
  for (const sx of [-0.46, 0.46]) {
    const sr = new THREE.Mesh(sideRailGeo, stripeMat);
    sr.position.set(sx, 0.16, 0);
    sr.rotation.x = -0.26;
    g.add(sr);
  }
  g.add(wedge);
  const rampBeam = createOverviewBeaconMesh(0x38bdf8, 0xffbe0b);
  rampBeam.scale.set(0.72, 0.72, 0.72);
  rampBeam.userData.isOverviewShortcut = true;
  g.add(rampBeam);
  return g;
}

/**
 * Waddling Mama Duck + 3 Golden Ducklings Family!
 */
export function createDuckCrossingMesh(duck: DuckCrossing): THREE.Group {
  const g = new THREE.Group();
  g.position.set(duck.x, 0.25, duck.z);
  g.rotation.y = duck.yaw;

  const mamaMat = getCachedStandardMat(0xfff3b0, 0.48, 0.02);
  const chickMat = getCachedStandardMat(0xffdf24, 0.42, 0.02);
  const beakMat = getCachedStandardMat(0xff7b00, 0.4, 0.03);
  const bodyGeo = getSharedGeo('duck_body', () => new THREE.SphereGeometry(0.14, 10, 8));
  const headGeo = getSharedGeo('duck_head', () => new THREE.SphereGeometry(0.095, 10, 8));
  const beakGeo = getSharedGeo('duck_beak', () => new THREE.BoxGeometry(0.07, 0.03, 0.08));

  for (let i = 0; i < 4; i++) {
    const d = new THREE.Group();
    const s = i === 0 ? 1.0 : 0.62;
    const mat = i === 0 ? mamaMat : chickMat;
    const b = new THREE.Mesh(bodyGeo, mat);
    b.scale.set(0.95, 0.8, 1.2);
    b.position.y = 0.11;
    const h = new THREE.Mesh(headGeo, mat);
    h.position.set(0, 0.22, 0.08);
    const bk = new THREE.Mesh(beakGeo, beakMat);
    bk.position.set(0, 0.21, 0.17);
    d.add(b, h, bk);
    d.scale.setScalar(s);
    d.position.set(0, 0, -i * 0.28);
    g.add(d);
  }

  return g;
}

/**
 * Glowing Emerald Green-Wave Signal Transponder Orb!
 */
export function createGreenWaveMesh(gw: GreenWavePickup): THREE.Group {
  const g = new THREE.Group();
  g.position.set(gw.x, 0.62, gw.z);

  const orbMat = getCachedStandardMat(0x10b981, 0.18, 0.15, 0x34d399, 0.95);
  const ringMat = getCachedStandardMat(0xfef08a, 0.25, 0.35, 0xfacc15, 0.5);

  const core = new THREE.Mesh(
    getSharedGeo('gw_core', () => new THREE.OctahedronGeometry(0.24, 1)),
    orbMat,
  );
  const halo = new THREE.Mesh(
    getSharedGeo('gw_halo', () => new THREE.TorusGeometry(0.36, 0.038, 8, 20)),
    ringMat,
  );
  halo.rotation.x = Math.PI / 3;
  g.add(core, halo);
  return g;
}

export interface RivalCourierRig {
  vanGroup: THREE.Group;
  bodyTiltGroup: THREE.Group;
  hitFlashMat: THREE.MeshStandardMaterial;
  bonusDropGroup: THREE.Group;
  bonusOverviewBeam: THREE.Group;
}

/**
 * Rival Express Van ("Zoomy Blitz") in Royal Violet & Lightning Gold + Spinning Golden Bonus Drop Crate!
 */
export function createRivalCourierMesh(
  rival: RivalCourier,
  shadowTex: THREE.CanvasTexture,
): RivalCourierRig {
  const vanGroup = new THREE.Group();
  vanGroup.position.set(rival.x, 0.24, rival.z);
  vanGroup.rotation.y = rival.yaw;

  const shad = new THREE.Mesh(
    getSharedGeo('riv_shad', () => new THREE.PlaneGeometry(1.3, 1.9)),
    getShadowMaterial(shadowTex),
  );
  shad.rotation.x = -Math.PI / 2;
  shad.position.y = 0.02;
  vanGroup.add(shad);

  const purpleMat = new THREE.MeshStandardMaterial({
    color: 0x7c3aed,
    roughness: 0.42,
    metalness: 0.12,
  });
  const goldMat = getCachedStandardMat(0xffdf24, 0.3, 0.2, 0xf59e0b, 0.35);
  const glassMat = getCachedStandardMat(0x6ec6f5, 0.14, 0.28);
  const tireMat = getCachedStandardMat(0x1f2937, 0.8, 0.1);

  const bodyTiltGroup = new THREE.Group();
  vanGroup.add(bodyTiltGroup);

  const body = new THREE.Mesh(
    createBeveledBlockGeometry(0.92, 0.68, 1.56, 0.12, 0.03),
    purpleMat,
  );
  body.position.y = 0.2;
  body.castShadow = true;

  const stripe = new THREE.Mesh(
    createBeveledBlockGeometry(0.94, 0.12, 1.58, 0.1, 0.015),
    goldMat,
  );
  stripe.position.y = 0.44;

  const win = new THREE.Mesh(
    getSharedGeo('riv_win', () => new THREE.BoxGeometry(0.76, 0.22, 0.1)),
    glassMat,
  );
  win.position.set(0, 0.62, 0.74);

  const wGeo = getSharedGeo('car_wheel', () => {
    const g = new THREE.CylinderGeometry(0.16, 0.16, 0.13, 14);
    g.rotateZ(Math.PI / 2);
    return g;
  });
  for (const [wx, wz] of [
    [-0.44, 0.46],
    [0.44, 0.46],
    [-0.44, -0.46],
    [0.44, -0.46],
  ]) {
    const w = new THREE.Mesh(wGeo, tireMat);
    w.position.set(wx, 0.16, wz);
    vanGroup.add(w);
  }
  bodyTiltGroup.add(body, stripe, win);

  // Golden Bonus Drop Crate floating on the Rival's target intersection!
  const bonusDropGroup = new THREE.Group();
  bonusDropGroup.position.set(rival.bonusDropPos.x, 0.65, rival.bonusDropPos.z);
  const crate = new THREE.Mesh(
    createBeveledBlockGeometry(0.52, 0.52, 0.52, 0.08, 0.025),
    goldMat,
  );
  const ring = new THREE.Mesh(
    getSharedGeo('riv_bonus_ring', () => new THREE.RingGeometry(0.62, 0.84, 24)),
    getSharedBasicMat(0xffdf24, 0.9),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.38;
  const bonusOverviewBeam = createOverviewBeaconMesh(0xffdf24, 0xa855f7);
  bonusOverviewBeam.position.y = -0.36;
  bonusOverviewBeam.scale.set(0.88, 0.9, 0.88);
  bonusDropGroup.add(crate, ring, bonusOverviewBeam);

  return {
    vanGroup,
    bodyTiltGroup,
    hitFlashMat: purpleMat,
    bonusDropGroup,
    bonusOverviewBeam,
  };
}

export interface CrashBurstRig {
  root: THREE.Group;
  starBurstGroup: THREE.Group;
  shockRing: THREE.Mesh;
  shockRingMat: THREE.MeshBasicMaterial;
  dizzyOrbitGroup: THREE.Group;
}

/**
 * Playful 3D Cartoon Arcade Crash Burst:
 * - Layered 8-point coral-red & golden-yellow extruded comic starburst
 * - Expanding ground-parallel shockwave ring
 * - 3 orbiting mini golden dizzy stars
 */
export function createCrashBurstMesh(): CrashBurstRig {
  const root = new THREE.Group();
  root.visible = false;

  const starGeo = getSharedGeo('crash_star_8pt', () => {
    const pts = 8;
    const shape = new THREE.Shape();
    for (let i = 0; i < pts * 2; i++) {
      const r = i % 2 === 0 ? 0.68 : 0.28;
      const a = (i / (pts * 2)) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 1,
    });
    g.center();
    return g;
  });

  const outerMat = getCachedStandardMat(0xff3b2f, 0.25, 0.05, 0xff595e, 0.85);
  const innerMat = getCachedStandardMat(0xffe524, 0.2, 0.05, 0xffdf24, 0.95);
  const outlineMat = getCachedStandardMat(0x1d1205, 0.6, 0.02);

  const starBurstGroup = new THREE.Group();
  // Tilted toward the elevated chase camera so the comic POW star reads clearly from above & behind!
  starBurstGroup.rotation.x = -Math.PI * 0.34;

  const starBackOutline = new THREE.Mesh(starGeo, outlineMat);
  starBackOutline.scale.set(1.12, 1.12, 0.8);
  starBackOutline.position.z = -0.03;

  const starOuter = new THREE.Mesh(starGeo, outerMat);
  const starInner = new THREE.Mesh(starGeo, innerMat);
  starInner.scale.set(0.62, 0.62, 1.35);
  starInner.rotation.z = Math.PI / 8;

  starBurstGroup.add(starBackOutline, starOuter, starInner);
  root.add(starBurstGroup);

  const shockRingGeo = getSharedGeo(
    'crash_shock_ring',
    () => new THREE.RingGeometry(0.46, 0.72, 24),
  );
  const shockRingMat = new THREE.MeshBasicMaterial({
    color: 0xfff3b0,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shockRing = new THREE.Mesh(shockRingGeo, shockRingMat);
  shockRing.rotation.x = -Math.PI / 2;
  shockRing.position.y = -0.18;
  root.add(shockRing);

  const dizzyOrbitGroup = new THREE.Group();
  const miniStarGeo = getSharedGeo(
    'crash_mini_octa',
    () => new THREE.OctahedronGeometry(0.12, 0),
  );
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const ms = new THREE.Mesh(miniStarGeo, innerMat);
    ms.position.set(Math.cos(a) * 0.56, 0.28, Math.sin(a) * 0.56);
    dizzyOrbitGroup.add(ms);
  }
  root.add(dizzyOrbitGroup);

  return {
    root,
    starBurstGroup,
    shockRing,
    shockRingMat,
    dizzyOrbitGroup,
  };
}

/**
 * Tall Vertical Diorama Light-Pillar + Sky Ring for the 3-2-1 Bird's-Eye Overview!
 */
export function createOverviewBeaconMesh(
  beamHex: number = 0xffdf24,
  ringHex: number = 0xff9f1c,
): THREE.Group {
  const g = new THREE.Group();
  const pillarGeo = getSharedGeo('ovw_pillar', () => {
    const cyl = new THREE.CylinderGeometry(0.28, 0.56, 7.6, 16, 1, true);
    cyl.translate(0, 3.8, 0);
    return cyl;
  });
  const pillar = new THREE.Mesh(pillarGeo, getSharedBasicMat(beamHex, 0.28));
  const coreGeo = getSharedGeo('ovw_core', () => {
    const cyl = new THREE.CylinderGeometry(0.09, 0.18, 8.2, 12, 1, true);
    cyl.translate(0, 4.1, 0);
    return cyl;
  });
  const core = new THREE.Mesh(coreGeo, getSharedBasicMat(0xffffff, 0.48));

  const skyHalo = new THREE.Mesh(
    getSharedGeo('ovw_halo', () => new THREE.RingGeometry(0.65, 0.96, 24)),
    getSharedBasicMat(ringHex, 0.85),
  );
  skyHalo.rotation.x = -Math.PI / 2;
  skyHalo.position.y = 0.08;

  g.add(pillar, core, skyHalo);
  return g;
}

/**
 * Cute 3D Comic Sound-Wave Honk Ring + Exclamation Accent above Honking AI Vehicles!
 */
function createVehicleHonkRingGroup(roofY: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(0, roofY, 0.22);
  g.visible = false;

  const goldMat = getCachedStandardMat(0xffe524, 0.22, 0.08, 0xffbe0b, 0.9);
  const coralMat = getCachedStandardMat(0xff595e, 0.25, 0.06, 0xff3b30, 0.85);

  const innerWave = new THREE.Mesh(
    getSharedGeo('honk_wave_in', () => new THREE.TorusGeometry(0.22, 0.032, 8, 18)),
    goldMat,
  );
  innerWave.rotation.x = Math.PI / 2;

  const outerWave = new THREE.Mesh(
    getSharedGeo('honk_wave_out', () => new THREE.TorusGeometry(0.38, 0.026, 8, 20)),
    coralMat,
  );
  outerWave.rotation.x = Math.PI / 2;

  // Floating 3D Comic "!" Honk Accent
  const bangStem = new THREE.Mesh(
    getSharedGeo('honk_bang_stem', () => new THREE.CapsuleGeometry(0.038, 0.16, 4, 8)),
    goldMat,
  );
  bangStem.position.set(0, 0.26, 0);
  const bangDot = new THREE.Mesh(
    getSharedGeo('honk_bang_dot', () => new THREE.SphereGeometry(0.045, 8, 6)),
    coralMat,
  );
  bangDot.position.set(0, 0.08, 0);

  g.add(innerWave, outerWave, bangStem, bangDot);
  return g;
}

/**
 * Composite 6-Part Articulated 3D Island Songbird / Seagull Rig
 * (Plump body, head, beak, fanned tail, and flapping left/right wing pivots!)
 */
export interface IslandBirdRig {
  root: THREE.Group;
  leftWingPivot: THREE.Group;
  rightWingPivot: THREE.Group;
}

export function createIslandBirdMesh(
  bodyHex: number = 0xfefae0,
  wingAccentHex: number = 0x38bdf8,
): IslandBirdRig {
  const root = new THREE.Group();

  const bodyMat = getCachedStandardMat(bodyHex, 0.48, 0.03);
  const accentMat = getCachedStandardMat(wingAccentHex, 0.44, 0.04);
  const beakMat = getCachedStandardMat(0xff9f1c, 0.36, 0.04);
  const eyeMat = getCachedStandardMat(0x140c04, 0.2, 0.05);

  const body = new THREE.Mesh(
    getSharedGeo('bird_body', () => new THREE.SphereGeometry(0.13, 12, 10)),
    bodyMat,
  );
  body.scale.set(0.88, 0.78, 1.38);

  const head = new THREE.Mesh(
    getSharedGeo('bird_head', () => new THREE.SphereGeometry(0.092, 10, 8)),
    bodyMat,
  );
  head.position.set(0, 0.08, 0.14);

  const beak = new THREE.Mesh(
    getSharedGeo('bird_beak', () => {
      const c = new THREE.ConeGeometry(0.034, 0.1, 8);
      c.rotateX(Math.PI / 2);
      return c;
    }),
    beakMat,
  );
  beak.position.set(0, 0.075, 0.245);

  const eyeGeo = getSharedGeo('bird_eye', () => new THREE.SphereGeometry(0.018, 6, 6));
  for (const ex of [-0.058, 0.058]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(ex, 0.095, 0.195);
    root.add(eye);
  }

  const tail = new THREE.Mesh(
    getSharedGeo('bird_tail', () => new THREE.BoxGeometry(0.13, 0.025, 0.15)),
    accentMat,
  );
  tail.position.set(0, 0.02, -0.2);
  tail.rotation.x = 0.22;

  const wingGeo = getSharedGeo('bird_wing', () => {
    const g = createBeveledBlockGeometry(0.32, 0.03, 0.16, 0.035, 0.01);
    return g;
  });
  const wingTipGeo = getSharedGeo('bird_wing_tip', () =>
    new THREE.BoxGeometry(0.14, 0.024, 0.11),
  );

  const leftWingPivot = new THREE.Group();
  leftWingPivot.position.set(-0.08, 0.04, 0.02);
  const lwMain = new THREE.Mesh(wingGeo, bodyMat);
  lwMain.position.set(-0.15, -0.015, 0);
  const lwTip = new THREE.Mesh(wingTipGeo, accentMat);
  lwTip.position.set(-0.31, 0, -0.015);
  leftWingPivot.add(lwMain, lwTip);

  const rightWingPivot = new THREE.Group();
  rightWingPivot.position.set(0.08, 0.04, 0.02);
  const rwMain = new THREE.Mesh(wingGeo, bodyMat);
  rwMain.position.set(0.15, -0.015, 0);
  const rwTip = new THREE.Mesh(wingTipGeo, accentMat);
  rwTip.position.set(0.31, 0, -0.015);
  rightWingPivot.add(rwMain, rwTip);

  root.add(body, head, beak, tail, leftWingPivot, rightWingPivot);
  root.scale.setScalar(1.22);
  return { root, leftWingPivot, rightWingPivot };
}

/**
 * Near-Miss & Rocket-Start 3D Aerodynamic Slipstream Wind-Streak Ribbons flanking the Courier Van!
 */
export interface WindStreakRig {
  root: THREE.Group;
  leftRibbon: THREE.Group;
  rightRibbon: THREE.Group;
}

export function createWindStreakMesh(): WindStreakRig {
  const root = new THREE.Group();
  root.visible = false;

  const streakWhite = getSharedBasicMat(0xffffff, 0.86);
  const streakCyan = getSharedBasicMat(0x70e4ff, 0.78);
  const streakGold = getSharedBasicMat(0xffe524, 0.82);

  const ribbonGeo = getSharedGeo(
    'wind_ribbon',
    () => new THREE.BoxGeometry(0.055, 0.045, 1.85),
  );
  const subGeo = getSharedGeo(
    'wind_sub',
    () => new THREE.BoxGeometry(0.038, 0.035, 1.25),
  );

  const makeSide = (sign: number): THREE.Group => {
    const side = new THREE.Group();
    const r1 = new THREE.Mesh(ribbonGeo, streakWhite);
    r1.position.set(sign * 0.68, 0.56, -0.15);
    const r2 = new THREE.Mesh(subGeo, streakCyan);
    r2.position.set(sign * 0.79, 0.36, -0.45);
    const r3 = new THREE.Mesh(subGeo, streakGold);
    r3.position.set(sign * 0.64, 0.82, -0.35);
    side.add(r1, r2, r3);
    return side;
  };

  const leftRibbon = makeSide(-1);
  const rightRibbon = makeSide(1);
  root.add(leftRibbon, rightRibbon);
  return { root, leftRibbon, rightRibbon };
}

/**
 * Gleaming 3D Arcade Gold Tip Coin tossed by celebrating customers onto the Courier Van roof!
 */
export function createSpinningCoinMesh(): THREE.Group {
  const g = new THREE.Group();
  const coinGold = getCachedStandardMat(0xffe524, 0.22, 0.38, 0xf59e0b, 0.55);
  const rimGold = getCachedStandardMat(0xff9f1c, 0.28, 0.32, 0xd97706, 0.35);

  const disc = new THREE.Mesh(
    getSharedGeo('tip_coin_disc', () => {
      const c = new THREE.CylinderGeometry(0.18, 0.18, 0.052, 16);
      c.rotateX(Math.PI / 2);
      return c;
    }),
    coinGold,
  );
  const rim = new THREE.Mesh(
    getSharedGeo('tip_coin_rim', () => new THREE.TorusGeometry(0.175, 0.024, 8, 18)),
    rimGold,
  );
  const emblem = new THREE.Mesh(
    getSharedGeo('tip_coin_bar', () => new THREE.BoxGeometry(0.055, 0.18, 0.068)),
    rimGold,
  );
  g.add(disc, rim, emblem);
  return g;
}


