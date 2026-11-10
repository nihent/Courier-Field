import {
  OutcomeKind,
  PlayerProgression,
  QuestItem,
  QuestKind,
  TopperId,
  VehicleId,
} from './types';

export interface VehicleSpec {
  id: VehicleId;
  name: string;
  tagline: string;
  costCoins: number;
  maxSpeedMult: number;
  turnSpeedMult: number;
  accelMult: number;
  maxHealth: number;
  smallTossRangeBonus: number;
  hasShockAbsorber: boolean;
  accentHex: string;
}

export const VEHICLE_SPECS: Record<VehicleId, VehicleSpec> = {
  [VehicleId.ClassicVan]: {
    id: VehicleId.ClassicVan,
    name: 'Classic Parcel Van',
    tagline: 'Balanced handling · 3 Hull HP',
    costCoins: 0,
    maxSpeedMult: 1.0,
    turnSpeedMult: 1.0,
    accelMult: 1.0,
    maxHealth: 3,
    smallTossRangeBonus: 0,
    hasShockAbsorber: false,
    accentHex: '#f48836',
  },
  [VehicleId.KeiTruck]: {
    id: VehicleId.KeiTruck,
    name: 'Mint Gelato Kei-Truck',
    tagline: 'Razor 90° drift turns · +12% Accel',
    costCoins: 450,
    maxSpeedMult: 1.05,
    turnSpeedMult: 1.24,
    accelMult: 1.15,
    maxHealth: 3,
    smallTossRangeBonus: 0.4,
    hasShockAbsorber: false,
    accentHex: '#2ec4b6',
  },
  [VehicleId.VespaTrike]: {
    id: VehicleId.VespaTrike,
    name: 'Turbo Espresso Trike',
    tagline: '+14% Top Speed · +1.6m Toss Reach',
    costCoins: 850,
    maxSpeedMult: 1.14,
    turnSpeedMult: 1.28,
    accelMult: 1.2,
    maxHealth: 2,
    smallTossRangeBonus: 1.6,
    hasShockAbsorber: false,
    accentHex: '#ff4d6d',
  },
  [VehicleId.ArmoredVan]: {
    id: VehicleId.ArmoredVan,
    name: 'Heavy Bullion Step-Van',
    tagline: '5 Hull HP · Fragile Shock-Absorber',
    costCoins: 1250,
    maxSpeedMult: 0.97,
    turnSpeedMult: 0.96,
    accelMult: 0.98,
    maxHealth: 5,
    smallTossRangeBonus: 0.3,
    hasShockAbsorber: true,
    accentHex: '#3a86ff',
  },
};

export interface TopperSpec {
  id: TopperId;
  name: string;
  tagline: string;
  costCoins: number;
}

export const TOPPER_SPECS: Record<TopperId, TopperSpec> = {
  [TopperId.Beacon]: {
    id: TopperId.Beacon,
    name: 'Amber Dispatch Bar',
    tagline: 'Standard courier roof beacon',
    costCoins: 0,
  },
  [TopperId.RubberDuck]: {
    id: TopperId.RubberDuck,
    name: 'Captain Quackers',
    tagline: 'Lucky harbor ducky hood buddy',
    costCoins: 250,
  },
  [TopperId.EspressoCup]: {
    id: TopperId.EspressoCup,
    name: 'Giant Espresso Cup',
    tagline: 'Spinning cafe crema sign',
    costCoins: 400,
  },
  [TopperId.PartyBalloons]: {
    id: TopperId.PartyBalloons,
    name: 'Festival Helium Trio',
    tagline: 'Bobbing pastel sky balloons',
    costCoins: 600,
  },
};

const QUEST_TEMPLATES: {
  kind: QuestKind;
  title: string;
  target: number;
  rewardCoins: number;
}[] = [
  {
    kind: 'bullseye_drops',
    title: 'Land 3 Bullseye Center Drops',
    target: 3,
    rewardCoins: 220,
  },
  {
    kind: 'express_tosses',
    title: 'Complete 4 Express Tosses',
    target: 4,
    rewardCoins: 200,
  },
  {
    kind: 'pitstops_used',
    title: 'Visit 2 Espresso or Wrench Stops',
    target: 2,
    rewardCoins: 180,
  },
  {
    kind: 'near_misses',
    title: 'Pull Off 3 Clean Traffic Near-Misses',
    target: 3,
    rewardCoins: 240,
  },
  {
    kind: 'clean_deliveries',
    title: 'Deliver 5 Parcels with 0 Tickets',
    target: 5,
    rewardCoins: 260,
  },
];

export function createInitialQuests(offset: number = 0): QuestItem[] {
  const picked: QuestItem[] = [];
  for (let i = 0; i < 3; i++) {
    const tpl = QUEST_TEMPLATES[(offset + i) % QUEST_TEMPLATES.length];
    picked.push({
      id: `quest-${offset}-${i}-${tpl.kind}`,
      kind: tpl.kind,
      title: tpl.title,
      progress: 0,
      target: tpl.target,
      rewardCoins: tpl.rewardCoins,
      claimed: false,
    });
  }
  return picked;
}

export function createDefaultProgression(): PlayerProgression {
  return {
    coins: 300,
    spinTokens: 1,
    unlockedVehicles: [VehicleId.ClassicVan],
    selectedVehicle: VehicleId.ClassicVan,
    unlockedToppers: [TopperId.Beacon],
    selectedTopper: TopperId.Beacon,
    districtStars: {},
    quests: createInitialQuests(0),
    nextFreeShield: false,
  };
}

const STORAGE_KEY = 'courier_field_save_v1';

export function loadProgression(): PlayerProgression {
  if (typeof window === 'undefined') return createDefaultProgression();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProgression();
    const parsed = JSON.parse(raw) as Partial<PlayerProgression>;
    const base = createDefaultProgression();
    return {
      coins: typeof parsed.coins === 'number' ? Math.max(0, parsed.coins) : base.coins,
      spinTokens:
        typeof parsed.spinTokens === 'number'
          ? Math.max(0, parsed.spinTokens)
          : base.spinTokens,
      unlockedVehicles: Array.isArray(parsed.unlockedVehicles) && parsed.unlockedVehicles.length > 0
        ? (parsed.unlockedVehicles as VehicleId[])
        : base.unlockedVehicles,
      selectedVehicle:
        parsed.selectedVehicle && VEHICLE_SPECS[parsed.selectedVehicle]
          ? parsed.selectedVehicle
          : base.selectedVehicle,
      unlockedToppers: Array.isArray(parsed.unlockedToppers) && parsed.unlockedToppers.length > 0
        ? (parsed.unlockedToppers as TopperId[])
        : base.unlockedToppers,
      selectedTopper:
        parsed.selectedTopper && TOPPER_SPECS[parsed.selectedTopper]
          ? parsed.selectedTopper
          : base.selectedTopper,
      districtStars:
        parsed.districtStars && typeof parsed.districtStars === 'object'
          ? parsed.districtStars
          : {},
      quests:
        Array.isArray(parsed.quests) && parsed.quests.length === 3
          ? parsed.quests
          : base.quests,
      nextFreeShield: Boolean(parsed.nextFreeShield),
    };
  } catch {
    return createDefaultProgression();
  }
}

export function saveProgression(prog: PlayerProgression): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prog));
  } catch {
    // Ignore storage quota errors in sandboxed iframes
  }
}

export function incrementQuestProgress(
  prog: PlayerProgression,
  kind: QuestKind,
  amount: number = 1,
): PlayerProgression {
  let changed = false;
  const nextQuests = prog.quests.map((q) => {
    if (q.kind !== kind || q.claimed || q.progress >= q.target) return q;
    changed = true;
    return {
      ...q,
      progress: Math.min(q.target, q.progress + amount),
    };
  });
  return changed ? { ...prog, quests: nextQuests } : prog;
}

export function claimQuest(
  prog: PlayerProgression,
  questId: string,
): PlayerProgression {
  const idx = prog.quests.findIndex((q) => q.id === questId);
  if (idx === -1) return prog;
  const q = prog.quests[idx];
  if (q.claimed || q.progress < q.target) return prog;

  // Replace claimed quest with a fresh rotating quest so players always have goals!
  const usedKinds = new Set(prog.quests.map((item) => item.kind));
  const replacementTpl =
    QUEST_TEMPLATES.find((t) => !usedKinds.has(t.kind)) ??
    QUEST_TEMPLATES[(idx + 2) % QUEST_TEMPLATES.length];

  const nextQuests = [...prog.quests];
  nextQuests[idx] = {
    id: `quest-${Date.now()}-${idx}-${replacementTpl.kind}`,
    kind: replacementTpl.kind,
    title: replacementTpl.title,
    progress: 0,
    target: replacementTpl.target,
    rewardCoins: replacementTpl.rewardCoins,
    claimed: false,
  };

  return {
    ...prog,
    coins: prog.coins + q.rewardCoins,
    quests: nextQuests,
  };
}

export function purchaseOrSelectVehicle(
  prog: PlayerProgression,
  vehicleId: VehicleId,
): { next: PlayerProgression; purchased: boolean; success: boolean } {
  const spec = VEHICLE_SPECS[vehicleId];
  if (!spec) return { next: prog, purchased: false, success: false };
  if (prog.unlockedVehicles.includes(vehicleId)) {
    return {
      next: { ...prog, selectedVehicle: vehicleId },
      purchased: false,
      success: true,
    };
  }
  if (prog.coins < spec.costCoins) {
    return { next: prog, purchased: false, success: false };
  }
  return {
    next: {
      ...prog,
      coins: prog.coins - spec.costCoins,
      unlockedVehicles: [...prog.unlockedVehicles, vehicleId],
      selectedVehicle: vehicleId,
    },
    purchased: true,
    success: true,
  };
}

export function purchaseOrSelectTopper(
  prog: PlayerProgression,
  topperId: TopperId,
): { next: PlayerProgression; purchased: boolean; success: boolean } {
  const spec = TOPPER_SPECS[topperId];
  if (!spec) return { next: prog, purchased: false, success: false };
  if (prog.unlockedToppers.includes(topperId)) {
    return {
      next: { ...prog, selectedTopper: topperId },
      purchased: false,
      success: true,
    };
  }
  if (prog.coins < spec.costCoins) {
    return { next: prog, purchased: false, success: false };
  }
  return {
    next: {
      ...prog,
      coins: prog.coins - spec.costCoins,
      unlockedToppers: [...prog.unlockedToppers, topperId],
      selectedTopper: topperId,
    },
    purchased: true,
    success: true,
  };
}

export interface SpinWheelSlice {
  index: number;
  label: string;
  detail: string;
  colorHex: string;
  coinsAward: number;
  grantsShield: boolean;
}

export const SPIN_WHEEL_SLICES: SpinWheelSlice[] = [
  {
    index: 0,
    label: '+150 Coins',
    detail: 'Courier Tip Pouch',
    colorHex: '#ff3b3b',
    coinsAward: 150,
    grantsShield: false,
  },
  {
    index: 1,
    label: 'Bumper Shield',
    detail: 'Free Next-Shift Shield + 80 Coins',
    colorHex: '#2ee54d',
    coinsAward: 80,
    grantsShield: true,
  },
  {
    index: 2,
    label: '+300 Coins',
    detail: 'Express Route Bonus',
    colorHex: '#ffdf24',
    coinsAward: 300,
    grantsShield: false,
  },
  {
    index: 3,
    label: '+180 Coins',
    detail: 'Harbor Stamp Bounty',
    colorHex: '#38bdf8',
    coinsAward: 180,
    grantsShield: false,
  },
  {
    index: 4,
    label: '+500 JACKPOT!',
    detail: 'Golden Dispatch Vault',
    colorHex: '#f97316',
    coinsAward: 500,
    grantsShield: false,
  },
  {
    index: 5,
    label: 'Shield + 200',
    detail: 'Armored Shift Starter',
    colorHex: '#a855f7',
    coinsAward: 200,
    grantsShield: true,
  },
];

export const SPIN_COST_COINS = 200;

export function executeLuckySpin(
  prog: PlayerProgression,
  rngValue: number = Math.random(),
): {
  next: PlayerProgression;
  slice: SpinWheelSlice | null;
  usedToken: boolean;
} {
  const canUseToken = prog.spinTokens > 0;
  if (!canUseToken && prog.coins < SPIN_COST_COINS) {
    return { next: prog, slice: null, usedToken: false };
  }
  const idx =
    Math.floor(Math.max(0, Math.min(0.9999, rngValue)) * SPIN_WHEEL_SLICES.length);
  const slice = SPIN_WHEEL_SLICES[idx];

  const baseCoins = canUseToken ? prog.coins : prog.coins - SPIN_COST_COINS;
  return {
    next: {
      ...prog,
      spinTokens: canUseToken ? prog.spinTokens - 1 : prog.spinTokens,
      coins: baseCoins + slice.coinsAward,
      nextFreeShield: prog.nextFreeShield || slice.grantsShield,
    },
    slice,
    usedToken: canUseToken,
  };
}

export function computeRunRewards(
  outcome: OutcomeKind,
  score: number,
  deliveredCount: number,
  ticketsCount: number,
  timeRemainingSec: number,
): { coinsEarned: number; starsEarned: number; earnedSpinToken: boolean } {
  if (outcome !== OutcomeKind.Victory) {
    const consolation = Math.max(25, deliveredCount * 28 + Math.floor(score * 0.06));
    return {
      coinsEarned: consolation,
      starsEarned: 0,
      earnedSpinToken: false,
    };
  }

  let stars = 1;
  if (ticketsCount === 0 || timeRemainingSec >= 14) stars = 2;
  if (ticketsCount === 0 && timeRemainingSec >= 12) stars = 3;

  const coinsEarned = Math.round(140 + score * 0.14 + stars * 45);
  return {
    coinsEarned,
    starsEarned: stars,
    earnedSpinToken: true,
  };
}
