import React from 'react';
import { pokoAudio } from '../game/audio';
import { GamePhase, OutcomeKind, RunSnapshot } from '../game/types';

interface StatusModalProps {
  phase: GamePhase;
  snapshot: RunSnapshot | null;
  currentLevel: number;
  onResume: () => void;
  onRestart: () => void;
  onNextLevel: () => void;
  onOpenShop: () => void;
  onBackToTitle: () => void;
}

export const StatusModal: React.FC<StatusModalProps> = ({
  phase,
  snapshot,
  currentLevel,
  onResume,
  onRestart,
  onNextLevel,
  onOpenShop,
  onBackToTitle,
}) => {
  if (phase !== GamePhase.Paused && phase !== GamePhase.GameOver) {
    return null;
  }

  const isPaused = phase === GamePhase.Paused;
  const isVictory = snapshot?.outcome === OutcomeKind.Victory;
  const isBreakdown = snapshot?.outcome === OutcomeKind.Breakdown;
  const starsEarned = snapshot?.starsEarned ?? 0;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/45"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-heading"
    >
      <div className="pointer-events-auto arcade-panel rounded-3xl p-5 sm:p-6 w-full max-w-md flex flex-col gap-4">
        {isPaused ? (
          <>
            <div className="arcade-pill-brown rounded-2xl px-4 py-3 text-center">
              <div className="text-xs font-extrabold text-[#ffee1f] tracking-wide">
                Stage {currentLevel} Paused
              </div>
              <h2
                id="modal-heading"
                className="arcade-stroke text-white text-2xl sm:text-3xl mt-0.5 leading-tight"
              >
                Coffee Break &amp; Rules
              </h2>
            </div>

            <div className="bg-[#fffdf5] border-[2.5px] border-[#1d1205] rounded-2xl p-3.5 text-xs font-semibold text-slate-800 flex flex-col gap-2">
              <div>
                <strong className="font-display text-sm text-[#2b1b08]">
                  1. Forward Controls &amp; Horn [Q]:
                </strong>{' '}
                <strong>W / ↑</strong> Drive · <strong>S / ↓</strong> Brake (No Reverse) ·{' '}
                <strong>A / ← D / →</strong> Turn · <strong>Q</strong> Horn calms scooters!
              </div>
              <div>
                <strong className="font-display text-sm text-[#784812]">
                  2. Right Lane, Ramps &amp; Pit-Stops:
                </strong>{' '}
                Keep Right, hit <strong>Jump Ramps</strong> over canal gates, and visit{' '}
                <strong>Espresso</strong> or <strong>Wrench</strong> bays!
              </div>
              <div>
                <strong className="font-display text-sm text-[#146c1c]">
                  3. Bullseye &amp; Parcels [Space]:
                </strong>{' '}
                Hit the inner <strong>Gold Bullseye</strong> for +2x Combo, deliver{' '}
                <strong>Hot Thermal</strong> bags fast, and brake for <strong>Large Crates</strong>!
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  pokoAudio.playUiClick();
                  onResume();
                }}
                className="arcade-btn-gold w-full py-3 px-5 rounded-2xl cursor-pointer whitespace-nowrap"
              >
                <span className="arcade-stroke text-white text-lg sm:text-xl">
                  RESUME ROUTE
                </span>
              </button>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    pokoAudio.playUiClick();
                    onOpenShop();
                  }}
                  className="arcade-btn-green py-2.5 px-4 rounded-2xl cursor-pointer whitespace-nowrap"
                >
                  <span className="arcade-stroke-sm text-white text-sm sm:text-base">
                    GARAGE SHOP
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    pokoAudio.playUiClick();
                    onRestart();
                  }}
                  className="arcade-btn-cream py-2.5 px-4 rounded-2xl cursor-pointer whitespace-nowrap"
                >
                  <span className="arcade-stroke-sm text-white text-sm sm:text-base">
                    RESTART STAGE
                  </span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  pokoAudio.playUiClick();
                  onBackToTitle();
                }}
                className="arcade-btn-cream w-full py-2.5 px-5 rounded-2xl cursor-pointer whitespace-nowrap"
              >
                <span className="arcade-stroke-sm text-white text-base sm:text-lg">
                  WELCOME SCREEN
                </span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="arcade-pill-brown rounded-2xl px-4 py-3 text-center">
              <div className="text-xs font-extrabold text-[#ffee1f] tracking-wide">
                Stage {snapshot?.level ?? currentLevel} ·{' '}
                {snapshot?.districtName ?? 'Island Quarter'}
              </div>
              <h2
                id="modal-heading"
                className="arcade-stroke text-white text-2xl sm:text-3xl mt-0.5 leading-tight"
              >
                {isVictory
                  ? 'ALL PARCELS DELIVERED!'
                  : isBreakdown
                    ? 'VAN NEEDS REPAIRS!'
                    : 'SHIFT TIME UP!'}
              </h2>
              {/* 3 Golden Mastery Stars */}
              <div
                className="flex items-center justify-center gap-2 mt-2"
                aria-label={`${starsEarned} of 3 mastery stars earned`}
              >
                {[1, 2, 3].map((st) => (
                  <svg
                    key={st}
                    viewBox="0 0 36 36"
                    className="w-8 h-8 drop-shadow-sm"
                    aria-hidden="true"
                  >
                    <path
                      d="M18 3l4.6 8.9 9.8 1.6-7 7.1 1.6 9.8L18 25.9 9 30.4l1.6-9.8-7-7.1 9.8-1.6L18 3z"
                      fill={st <= starsEarned ? '#ffe524' : '#2b1b08'}
                      stroke="#140c04"
                      strokeWidth="2.6"
                      strokeLinejoin="round"
                    />
                  </svg>
                ))}
              </div>
            </div>

            {/* 3 Reference-1 Espresso Mastery / Progress Stat Tiles */}
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="arcade-pill-brown rounded-2xl p-2.5">
                <div className="text-[11px] font-extrabold text-[#ffee1f]">
                  {isVictory ? 'Time Left' : 'Deliveries'}
                </div>
                <div className="arcade-stroke-sm text-white text-xl mt-0.5">
                  {isVictory
                    ? `${snapshot?.timeRemainingSec ?? 0}s`
                    : `${snapshot?.deliveredCount ?? 0}/${snapshot?.totalStops ?? 0}`}
                </div>
              </div>

              <div className="arcade-pill-brown rounded-2xl p-2.5">
                <div className="text-[11px] font-extrabold text-[#ffee1f]">
                  Score
                </div>
                <div className="arcade-stroke-sm text-[#ffe524] text-xl mt-0.5">
                  {(snapshot?.score ?? 0).toLocaleString()}
                </div>
              </div>

              <div className="arcade-pill-brown rounded-2xl p-2.5">
                <div className="text-[11px] font-extrabold text-[#6bf25c]">
                  Coins Won
                </div>
                <div className="arcade-stroke-sm text-[#ffe524] text-xl mt-0.5">
                  +{snapshot?.coinsEarned ?? 0}
                </div>
              </div>
            </div>

            <div className="text-center text-xs font-extrabold text-[#382307] -mt-1">
              Traffic Record:{' '}
              {(snapshot?.ticketsCount ?? 0) === 0 ? (
                <span className="text-[#146c1c]">Clean Driving · 0 Tickets</span>
              ) : (
                <span className="text-[#d90429]">
                  {snapshot?.ticketsCount}{' '}
                  {snapshot?.ticketsCount === 1 ? 'Ticket' : 'Tickets'} Issued
                </span>
              )}
              {snapshot?.earnedSpinToken ? (
                <span className="text-[#7c3aed]"> · +1 Spin Token!</span>
              ) : null}
            </div>

            <div className="flex flex-col gap-2.5">
              {isVictory ? (
                <>
                  <button
                    type="button"
                    data-start="true"
                    onClick={() => {
                      pokoAudio.playUiClick();
                      onNextLevel();
                    }}
                    className="arcade-btn-gold w-full py-3.5 px-5 rounded-2xl cursor-pointer whitespace-nowrap"
                  >
                    <span className="arcade-stroke text-white text-lg sm:text-xl">
                      NEXT STAGE (STAGE {(snapshot?.level ?? currentLevel) + 1})
                    </span>
                  </button>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        pokoAudio.playUiClick();
                        onOpenShop();
                      }}
                      className="arcade-btn-green py-2.5 px-4 rounded-2xl cursor-pointer whitespace-nowrap"
                    >
                      <span className="arcade-stroke-sm text-white text-sm sm:text-base">
                        GARAGE &amp; SPIN
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        pokoAudio.playUiClick();
                        onBackToTitle();
                      }}
                      className="arcade-btn-cream py-2.5 px-4 rounded-2xl cursor-pointer whitespace-nowrap"
                    >
                      <span className="arcade-stroke-sm text-white text-sm sm:text-base">
                        WELCOME SCREEN
                      </span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    data-start="true"
                    onClick={() => {
                      pokoAudio.playUiClick();
                      onRestart();
                    }}
                    className="arcade-btn-gold w-full py-3.5 px-5 rounded-2xl cursor-pointer whitespace-nowrap"
                  >
                    <span className="arcade-stroke text-white text-lg sm:text-xl">
                      TRY AGAIN
                    </span>
                  </button>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        pokoAudio.playUiClick();
                        onOpenShop();
                      }}
                      className="arcade-btn-green py-2.5 px-4 rounded-2xl cursor-pointer whitespace-nowrap"
                    >
                      <span className="arcade-stroke-sm text-white text-sm sm:text-base">
                        GARAGE SHOP
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        pokoAudio.playUiClick();
                        onBackToTitle();
                      }}
                      className="arcade-btn-cream py-2.5 px-4 rounded-2xl cursor-pointer whitespace-nowrap"
                    >
                      <span className="arcade-stroke-sm text-white text-sm sm:text-base">
                        WELCOME SCREEN
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
