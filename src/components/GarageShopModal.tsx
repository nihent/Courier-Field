import React, { useState } from 'react';
import { pokoAudio } from '../game/audio';
import {
  SPIN_COST_COINS,
  SPIN_WHEEL_SLICES,
  SpinWheelSlice,
  TOPPER_SPECS,
  VEHICLE_SPECS,
} from '../game/progression';
import { PlayerProgression, TopperId, VehicleId } from '../game/types';

interface GarageShopModalProps {
  open: boolean;
  progression: PlayerProgression;
  onSelectOrBuyVehicle: (id: VehicleId) => void;
  onSelectOrBuyTopper: (id: TopperId) => void;
  onSpinWheel: () => { slice: SpinWheelSlice | null; usedToken: boolean };
  onClose: () => void;
}

type ShopTab = 'fleet' | 'toppers' | 'spin';

export const GarageShopModal: React.FC<GarageShopModalProps> = ({
  open,
  progression,
  onSelectOrBuyVehicle,
  onSelectOrBuyTopper,
  onSpinWheel,
  onClose,
}) => {
  const [tab, setTab] = useState<ShopTab>('fleet');
  const [wheelDeg, setWheelDeg] = useState<number>(0);
  const [spinning, setSpinning] = useState<boolean>(false);
  const [lastSpinReward, setLastSpinReward] = useState<SpinWheelSlice | null>(
    null,
  );

  if (!open) return null;

  const canSpin =
    !spinning &&
    (progression.spinTokens > 0 || progression.coins >= SPIN_COST_COINS);

  const handleTriggerSpin = () => {
    if (!canSpin) return;
    pokoAudio.playUiClick();
    const res = onSpinWheel();
    if (!res.slice) return;
    setSpinning(true);
    setLastSpinReward(null);
    // Align landing slice under top pointer (6 slices = 60 deg each)
    const sliceCenterDeg = res.slice.index * 60 + 30;
    const nextRot =
      wheelDeg + 1080 + ((360 - sliceCenterDeg - (wheelDeg % 360) + 360) % 360);
    setWheelDeg(nextRot);
    window.setTimeout(() => {
      setSpinning(false);
      setLastSpinReward(res.slice);
      pokoAudio.playSpinReward();
    }, 850);
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-4 bg-black/45 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="garage-shop-heading"
    >
      <div className="pointer-events-auto arcade-panel rounded-3xl p-4 sm:p-6 w-full max-w-[560px] my-auto flex flex-col gap-3.5">
        {/* Header Banner + Coin / Spin Token Balance */}
        <div className="arcade-pill-brown rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-extrabold text-[#ffee1f] tracking-wide">
              Courier Depot &amp; Customization
            </div>
            <h2
              id="garage-shop-heading"
              className="arcade-stroke text-white text-2xl sm:text-3xl leading-tight"
            >
              GARAGE SHOP
            </h2>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="bg-[#2b1b08] border-2 border-[#140c04] rounded-full px-3 py-1 flex items-center gap-1.5">
              <span className="inline-block w-3.5 h-3.5 rounded-full bg-[#ffe524] border border-[#140c04]" />
              <span
                className="arcade-stroke-sm text-[#ffe524] text-base leading-none"
                aria-label={`${progression.coins} coins available`}
              >
                {progression.coins.toLocaleString()}
              </span>
            </div>
            {progression.spinTokens > 0 && (
              <span className="text-[11px] font-extrabold text-[#6bf25c]">
                {progression.spinTokens} Free Spin{' '}
                {progression.spinTokens === 1 ? 'Token' : 'Tokens'}!
              </span>
            )}
          </div>
        </div>

        {/* 3 Arcade Category Tabs */}
        <div
          className="grid grid-cols-3 gap-2"
          role="tablist"
          aria-label="Shop categories"
        >
          {(
            [
              { id: 'fleet', label: 'FLEET VANS' },
              { id: 'toppers', label: 'ROOF TOPPERS' },
              { id: 'spin', label: 'LUCKY SPIN' },
            ] as { id: ShopTab; label: string }[]
          ).map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  pokoAudio.playUiClick();
                  setTab(t.id);
                }}
                className={`${
                  active ? 'arcade-btn-gold' : 'arcade-pill-brown'
                } py-2 px-2 rounded-xl cursor-pointer text-center relative`}
              >
                <span className="arcade-stroke-sm text-white text-xs sm:text-sm">
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Unlockable Fleet Vehicles */}
        {tab === 'fleet' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {(Object.values(VEHICLE_SPECS) as (typeof VEHICLE_SPECS)[VehicleId][]).map(
              (v) => {
                const owned = progression.unlockedVehicles.includes(v.id);
                const equipped = progression.selectedVehicle === v.id;
                const canAfford = progression.coins >= v.costCoins;

                return (
                  <div
                    key={v.id}
                    className="arcade-pill-brown rounded-2xl p-3 flex flex-col justify-between gap-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="arcade-stroke-sm text-white text-base leading-snug">
                          {v.name}
                        </div>
                        <div className="text-[11px] font-bold text-[#ffe8a3] mt-0.5">
                          {v.tagline}
                        </div>
                      </div>
                      <span
                        className="w-5 h-5 rounded-lg border-2 border-[#140c04] shrink-0 mt-0.5"
                        style={{ backgroundColor: v.accentHex }}
                        aria-hidden="true"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={!owned && !canAfford}
                      onClick={() => {
                        pokoAudio.playUiClick();
                        onSelectOrBuyVehicle(v.id);
                      }}
                      className={`${
                        equipped
                          ? 'arcade-btn-green'
                          : owned
                            ? 'arcade-btn-cream'
                            : canAfford
                              ? 'arcade-btn-gold'
                              : 'bg-stone-700 border-2 border-[#140c04] opacity-60 cursor-not-allowed'
                      } w-full py-2 px-3 rounded-xl cursor-pointer text-center`}
                    >
                      <span className="arcade-stroke-sm text-white text-sm">
                        {equipped
                          ? 'EQUIPPED'
                          : owned
                            ? 'EQUIP VEHICLE'
                            : `UNLOCK · ${v.costCoins} COINS`}
                      </span>
                    </button>
                  </div>
                );
              },
            )}
          </div>
        )}

        {/* Tab 2: 3D Roof Toppers */}
        {tab === 'toppers' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {(Object.values(TOPPER_SPECS) as (typeof TOPPER_SPECS)[TopperId][]).map(
              (tp) => {
                const owned = progression.unlockedToppers.includes(tp.id);
                const equipped = progression.selectedTopper === tp.id;
                const canAfford = progression.coins >= tp.costCoins;

                return (
                  <div
                    key={tp.id}
                    className="arcade-pill-brown rounded-2xl p-3 flex flex-col justify-between gap-2.5"
                  >
                    <div>
                      <div className="arcade-stroke-sm text-white text-base leading-snug">
                        {tp.name}
                      </div>
                      <div className="text-[11px] font-bold text-[#ffe8a3] mt-0.5">
                        {tp.tagline}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!owned && !canAfford}
                      onClick={() => {
                        pokoAudio.playUiClick();
                        onSelectOrBuyTopper(tp.id);
                      }}
                      className={`${
                        equipped
                          ? 'arcade-btn-green'
                          : owned
                            ? 'arcade-btn-cream'
                            : canAfford
                              ? 'arcade-btn-gold'
                              : 'bg-stone-700 border-2 border-[#140c04] opacity-60 cursor-not-allowed'
                      } w-full py-2 px-3 rounded-xl cursor-pointer text-center`}
                    >
                      <span className="arcade-stroke-sm text-white text-sm">
                        {equipped
                          ? 'EQUIPPED'
                          : owned
                            ? 'EQUIP TOPPER'
                            : `UNLOCK · ${tp.costCoins} COINS`}
                      </span>
                    </button>
                  </div>
                );
              },
            )}
          </div>
        )}

        {/* Tab 3: Lucky Dispatch Spin Wheel */}
        {tab === 'spin' && (
          <div className="arcade-pill-brown rounded-2xl p-4 flex flex-col items-center gap-3">
            <div className="relative w-44 h-44 flex items-center justify-center">
              {/* Top Golden Pointer */}
              <svg
                viewBox="0 0 36 28"
                className="w-8 h-7 absolute -top-2.5 z-10 drop-shadow-sm"
                aria-hidden="true"
              >
                <polygon
                  points="4,3 32,3 18,25"
                  fill="#ffe524"
                  stroke="#140c04"
                  strokeWidth="3.2"
                  strokeLinejoin="round"
                />
              </svg>

              {/* Rotating 6-Slice Arcade Wheel */}
              <svg
                viewBox="0 0 120 120"
                className="w-40 h-40 transition-transform duration-700 ease-out"
                style={{ transform: `rotate(${wheelDeg}deg)` }}
                aria-hidden="true"
              >
                <circle
                  cx="60"
                  cy="60"
                  r="56"
                  fill="#173763"
                  stroke="#140c04"
                  strokeWidth="4"
                />
                {SPIN_WHEEL_SLICES.map((s, idx) => {
                  const a0 = ((idx * 60 - 90) * Math.PI) / 180;
                  const a1 = (((idx + 1) * 60 - 90) * Math.PI) / 180;
                  const x0 = 60 + 50 * Math.cos(a0);
                  const y0 = 60 + 50 * Math.sin(a0);
                  const x1 = 60 + 50 * Math.cos(a1);
                  const y1 = 60 + 50 * Math.sin(a1);
                  return (
                    <path
                      key={s.index}
                      d={`M60 60 L${x0.toFixed(1)} ${y0.toFixed(1)} A50 50 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`}
                      fill={s.colorHex}
                      stroke="#140c04"
                      strokeWidth="2.4"
                    />
                  );
                })}
                <circle
                  cx="60"
                  cy="60"
                  r="14"
                  fill="#ffe524"
                  stroke="#140c04"
                  strokeWidth="3.2"
                />
                <circle cx="60" cy="60" r="5" fill="#ff2430" />
              </svg>
            </div>

            {lastSpinReward ? (
              <div className="bg-[#2b1b08] border-2 border-[#140c04] rounded-xl px-4 py-1.5 text-center">
                <div className="arcade-stroke-sm text-[#6bf25c] text-base">
                  WON: {lastSpinReward.label}!
                </div>
                <div className="text-[11px] font-bold text-[#ffe8a3]">
                  {lastSpinReward.detail}
                </div>
              </div>
            ) : (
              <div className="text-xs font-bold text-[#ffe8a3] text-center">
                Win up to +500 Jackpot Coins or a Free Bumper Shield!
              </div>
            )}

            <button
              type="button"
              disabled={!canSpin}
              onClick={handleTriggerSpin}
              className={`${
                canSpin
                  ? 'arcade-btn-gold'
                  : 'bg-stone-700 border-2 border-[#140c04] opacity-60 cursor-not-allowed'
              } w-full max-w-xs py-2.5 px-5 rounded-2xl cursor-pointer`}
            >
              <span className="arcade-stroke text-white text-base sm:text-lg">
                {spinning
                  ? 'SPINNING...'
                  : progression.spinTokens > 0
                    ? `FREE TOKEN SPIN (${progression.spinTokens})`
                    : `SPIN WHEEL · ${SPIN_COST_COINS} COINS`}
              </span>
            </button>
          </div>
        )}

        {/* Resume Route CTA */}
        <button
          type="button"
          onClick={() => {
            pokoAudio.playUiClick();
            onClose();
          }}
          className="arcade-btn-cream w-full py-3 px-5 rounded-2xl cursor-pointer"
        >
          <span className="arcade-stroke text-white text-lg">
            BACK TO SHIFT
          </span>
        </button>
      </div>
    </div>
  );
};
