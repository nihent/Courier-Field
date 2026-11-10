import React from 'react';
import { pokoAudio } from '../game/audio';
import { PlayerProgression } from '../game/types';

interface QuestsRulesModalProps {
  open: boolean;
  progression: PlayerProgression;
  onClaimQuest: (questId: string) => void;
  onClose: () => void;
}

export const QuestsRulesModal: React.FC<QuestsRulesModalProps> = ({
  open,
  progression,
  onClaimQuest,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-4 bg-black/45 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quests-modal-heading"
    >
      <div className="pointer-events-auto arcade-panel rounded-3xl p-4 sm:p-6 w-full max-w-[520px] my-auto flex flex-col gap-3.5">
        {/* Header */}
        <div className="arcade-pill-brown rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-extrabold text-[#ffee1f] tracking-wide">
              Clipboard Bounties &amp; Handbook
            </div>
            <h2
              id="quests-modal-heading"
              className="arcade-stroke text-white text-2xl sm:text-3xl leading-tight"
            >
              SHIFT QUESTS
            </h2>
          </div>

          <div className="bg-[#2b1b08] border-2 border-[#140c04] rounded-full px-3 py-1 flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-3.5 rounded-full bg-[#ffe524] border border-[#140c04]" />
            <span className="arcade-stroke-sm text-[#ffe524] text-base leading-none">
              {progression.coins.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 3 Rotating Shift Quests */}
        <div className="flex flex-col gap-2">
          {progression.quests.map((q) => {
            const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
            const readyToClaim = q.progress >= q.target && !q.claimed;

            return (
              <div
                key={q.id}
                className="arcade-pill-brown rounded-2xl p-3 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="arcade-stroke-sm text-white text-sm sm:text-base truncate">
                    {q.title}
                  </div>
                  <div className="mt-1.5 h-4 bg-[#2b1b08] border-2 border-[#140c04] rounded-full overflow-hidden relative">
                    <div
                      className="h-full arcade-bar-gold transition-all duration-200"
                      style={{ width: `${pct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold text-white drop-shadow">
                      {q.progress}/{q.target}
                    </span>
                  </div>
                </div>

                {readyToClaim ? (
                  <button
                    type="button"
                    onClick={() => {
                      pokoAudio.playSpinReward();
                      onClaimQuest(q.id);
                    }}
                    className="arcade-btn-green py-2 px-3.5 rounded-xl cursor-pointer shrink-0"
                  >
                    <span className="arcade-stroke-sm text-white text-xs sm:text-sm">
                      CLAIM +{q.rewardCoins}
                    </span>
                  </button>
                ) : (
                  <div className="bg-[#2b1b08] border-2 border-[#140c04] rounded-xl px-3 py-1.5 shrink-0 text-center">
                    <span className="arcade-stroke-sm text-[#ffe524] text-xs sm:text-sm">
                      +{q.rewardCoins}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Compact Field Handbook */}
        <div className="bg-[#fffdf5] border-[2.5px] border-[#1d1205] rounded-2xl p-3 text-xs font-semibold text-slate-800 flex flex-col gap-1.5">
          <div>
            <strong className="font-display text-[#2b1b08]">
              Driving &amp; Horn [Q]:
            </strong>{' '}
            Keep in the <strong>Right Lane</strong>, obey signals (or grab{' '}
            <strong>Green-Wave Orbs</strong>), and honk <strong>[Q]</strong> to calm
            scooters &amp; hurry ducklings!
          </div>
          <div>
            <strong className="font-display text-[#784812]">
              Parcels &amp; Bullseyes:
            </strong>{' '}
            Drop on the inner <strong>Gold Bullseye</strong> for +2x Combo! Deliver{' '}
            <strong>Hot Thermal</strong> bags fast, brake for <strong>Large Crates</strong>,
            and hit <strong>Wrench Garages</strong> for Hull + Shield!
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            pokoAudio.playUiClick();
            onClose();
          }}
          className="arcade-btn-gold w-full py-3 px-5 rounded-2xl cursor-pointer"
        >
          <span className="arcade-stroke text-white text-lg sm:text-xl">
            RESUME SHIFT
          </span>
        </button>
      </div>
    </div>
  );
};
