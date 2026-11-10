import React, { useEffect, useId, useRef, useState } from 'react';
import { resetTouchControls, touchControls } from '../game/touchControls';
import {
  GeneratedCity,
  HazardKind,
  HudState,
  ParcelKind,
  PersonAppearance,
  SignalAxisState,
  TILE_SIZE,
  TileType,
} from '../game/types';

export interface MinimapSnapshot {
  city: GeneratedCity | null;
  truckX: number;
  truckZ: number;
  truckYaw: number;
  activeStopIndex: number;
}

interface GameHudProps {
  hud: HudState;
  minimapRef: React.RefObject<MinimapSnapshot>;
  muted: boolean;
  hasClaimableQuest: boolean;
  hasFreeSpin: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onOpenQuests: () => void;
  onOpenShop: () => void;
  onRestart: () => void;
}

function toHexColor(num: number): string {
  return '#' + num.toString(16).padStart(6, '0');
}

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.ceil(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function triggerWindowKeyPulse(code: string): void {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }),
  );
  window.setTimeout(() => {
    window.dispatchEvent(
      new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }),
    );
  }, 65);
}

const CustomerPortraitSvg: React.FC<{ appearance: PersonAppearance | null }> = ({
  appearance,
}) => {
  const skin = appearance ? toHexColor(appearance.skinColor) : '#f7d5bc';
  const hair = appearance ? toHexColor(appearance.hairColor) : '#593a27';
  const top = appearance ? toHexColor(appearance.topColor) : '#4ea8de';
  const accent = appearance ? toHexColor(appearance.accentColor) : '#f4845f';
  const isHat =
    appearance?.hairStyle === 'cap' || appearance?.hairStyle === 'sunhat';

  return (
    <svg
      viewBox="0 0 40 40"
      className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-xl bg-sky-100 border-[2.5px] border-[#1d1205]"
      aria-hidden="true"
    >
      <path
        d="M8 39c1-7 5.5-10.5 12-10.5S31 32 32 39"
        fill={top}
        stroke="#1d1205"
        strokeWidth="2.4"
      />
      <path
        d="M16 29l4 3.5 4-3.5"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle
        cx="20"
        cy="19"
        r="8.5"
        fill={skin}
        stroke="#1d1205"
        strokeWidth="2.4"
      />
      {isHat ? (
        <>
          <path
            d="M11 16c0-5.5 4-9 9-9s9 3.5 9 9H11z"
            fill={accent}
            stroke="#1d1205"
            strokeWidth="2.2"
          />
          <rect
            x="8"
            y="14.5"
            width="24"
            height="3"
            rx="1.5"
            fill={appearance?.hairStyle === 'sunhat' ? '#f3d48e' : accent}
            stroke="#1d1205"
            strokeWidth="2"
          />
        </>
      ) : (
        <path
          d="M11.5 18c0-6 3.8-9.5 8.5-9.5s8.5 3.5 8.5 9.5c-2-2.2-5-3.2-8.5-3.2s-6.5 1-8.5 3.2z"
          fill={hair}
          stroke="#1d1205"
          strokeWidth="2.2"
        />
      )}
      <circle cx="17" cy="19.5" r="1.4" fill="#1d1205" />
      <circle cx="23" cy="19.5" r="1.4" fill="#1d1205" />
      <path
        d="M17.8 23.2q2.2 1.8 4.4 0"
        stroke="#7c2d12"
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
};

/** Glossy red notification badge ("!") matching Reference 4 */
const RedAlertBadge: React.FC = () => (
  <svg
    viewBox="0 0 28 28"
    className="w-5 h-5 md:w-6 md:h-6 absolute -top-1 -right-1 drop-shadow-sm pointer-events-none"
    aria-hidden="true"
  >
    <circle
      cx="14"
      cy="14"
      r="11.5"
      fill="#ff1f2d"
      stroke="#1d1205"
      strokeWidth="2.8"
    />
    <path
      d="M7.5 10.5A8 8 0 0118.5 6"
      stroke="#ff9aa2"
      strokeWidth="2.4"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M15.2 7.2l-1.6 8.2"
      stroke="#ffffff"
      strokeWidth="3.6"
      strokeLinecap="round"
    />
    <circle cx="13.2" cy="19.8" r="2" fill="#ffffff" />
  </svg>
);

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  minimapRef,
  muted,
  hasClaimableQuest,
  hasFreeSpin,
  onToggleMute,
  onPause,
  onOpenQuests,
  onOpenShop,
  onRestart,
}) => {
  const starClipId = useId();
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const steerRockerRef = useRef<HTMLDivElement | null>(null);
  const steerPointerIdRef = useRef<number | null>(null);
  const gasPointerIdRef = useRef<number | null>(null);
  const brakePointerIdRef = useRef<number | null>(null);

  // Discrete pressed visual state for mobile touch buttons (updates only on press/release)
  const [steerUiSide, setSteerUiSide] = useState<'none' | 'left' | 'right'>('none');
  const [gasPressed, setGasPressed] = useState(false);
  const [brakePressed, setBrakePressed] = useState(false);

  useEffect(() => {
    return () => {
      resetTouchControls();
    };
  }, []);

  const updateSteerFromClientX = (clientX: number) => {
    const el = steerRockerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const norm = ((clientX - rect.left) / rect.width) * 2 - 1; // -1 .. +1
    if (Math.abs(norm) < 0.08) {
      touchControls.steerAnalog = 0;
      touchControls.steerLeft = false;
      touchControls.steerRight = false;
      setSteerUiSide('none');
    } else if (norm < 0) {
      const mag = Math.min(1, Math.max(0.45, Math.abs(norm) * 1.25));
      touchControls.steerAnalog = -mag;
      touchControls.steerLeft = true;
      touchControls.steerRight = false;
      setSteerUiSide('left');
    } else {
      const mag = Math.min(1, Math.max(0.45, Math.abs(norm) * 1.25));
      touchControls.steerAnalog = mag;
      touchControls.steerLeft = false;
      touchControls.steerRight = true;
      setSteerUiSide('right');
    }
  };

  const releaseSteerRocker = () => {
    steerPointerIdRef.current = null;
    touchControls.steerTouchActive = false;
    touchControls.steerAnalog = 0;
    touchControls.steerLeft = false;
    touchControls.steerRight = false;
    setSteerUiSide('none');
  };

  const isLowTime = hud.timeRemainingSec <= 12;
  const isCriticalHealth = hud.health === 1;
  const deliveryPct = Math.round(
    (hud.deliveredCount / Math.max(1, hud.totalStops)) * 100,
  );
  const boostPct = Math.round(Math.max(0, Math.min(1, hud.boostCharge)) * 100);
  const streakMultiplier = Math.max(1, hud.combo + 1);
  const compassDeg = (hud.bearingToStopRad * 180) / Math.PI;
  const isPreGoCountdown =
    hud.countdownStage !== null &&
    hud.countdownStage !== undefined &&
    hud.countdownStage > 0;
  const showMobileBanner =
    Boolean(hud.bannerEvent) &&
    hud.countdownStage === null &&
    hud.bannerEvent?.label !== 'Rocket Start!';

  const activeRewardPoints =
    hud.nextParcelKind === ParcelKind.Large
      ? 260
      : hud.nextParcelKind === ParcelKind.HotExpress
        ? hud.thermalPct > 0
          ? 320
          : 210
        : hud.nextParcelKind === ParcelKind.Fragile
          ? hud.fragileIntact
            ? 275
            : 185
          : 150;

  // Lightweight 10Hz 2D Canvas Heading-Up GPS Radar
  useEffect(() => {
    let pulseTick = 0;
    const drawMap = () => {
      const cvs = mapCanvasRef.current;
      const snap = minimapRef.current;
      if (!cvs || !snap || !snap.city) return;
      const ctx = cvs.getContext('2d');
      if (!ctx) return;

      pulseTick += 1;
      const city = snap.city;
      const N = city.totalGridSize;
      const size = cvs.width;
      const cell = 5.2;

      const worldToMap = (wx: number, wz: number) => {
        const half = (N - 1) * 0.5;
        const gc = wx / TILE_SIZE + half;
        const gr = wz / TILE_SIZE + half;
        return {
          mx: (gc + 0.5) * cell,
          my: (gr + 0.5) * cell,
        };
      };

      const vanPt = worldToMap(snap.truckX, snap.truckZ);
      const vanScreenX = size * 0.5;
      const vanScreenY = size * 0.62;

      ctx.fillStyle = '#4bb7ef';
      ctx.fillRect(0, 0, size, size);

      ctx.save();
      ctx.translate(vanScreenX, vanScreenY);
      ctx.rotate(snap.truckYaw + Math.PI);
      ctx.translate(-vanPt.mx, -vanPt.my);

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const t = city.tiles[r][c];
          if (t === TileType.Water) continue;
          if (t === TileType.InnerRoad || t === TileType.OuterRoad) {
            ctx.fillStyle = '#f8f5ec';
          } else if (t === TileType.Bridge) {
            ctx.fillStyle = '#e7b171';
          } else if (t === TileType.Building) {
            ctx.fillStyle = '#8ec96b';
          } else {
            ctx.fillStyle = '#a7e074';
          }
          ctx.fillRect(
            c * cell,
            r * cell,
            Math.ceil(cell) + 0.4,
            Math.ceil(cell) + 0.4,
          );
        }
      }

      for (const sig of city.trafficSignals) {
        const { mx, my } = worldToMap(sig.x, sig.z);
        const ewGo =
          sig.state === SignalAxisState.EWGreen ||
          sig.state === SignalAxisState.EWYellow;
        ctx.fillStyle = ewGo ? '#10b981' : '#ef4444';
        ctx.fillRect(mx - 2.1, my - 2.1, 4.2, 4.2);
      }

      for (const kiosk of city.coffeeKiosks) {
        if (kiosk.cooldown > 0) continue;
        const { mx, my } = worldToMap(kiosk.roadX, kiosk.roadZ);
        ctx.fillStyle = '#2dd4bf';
        ctx.strokeStyle = '#1d1205';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(mx, my, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      for (const gar of city.mechanicGarages) {
        if (gar.cooldown > 0) continue;
        const { mx, my } = worldToMap(gar.roadX, gar.roadZ);
        ctx.fillStyle = '#38bdf8';
        ctx.strokeStyle = '#1d1205';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      if (
        city.rivalCourier &&
        !city.rivalCourier.bonusClaimed &&
        !city.rivalCourier.rivalWonBonus
      ) {
        const bp = worldToMap(
          city.rivalCourier.bonusDropPos.x,
          city.rivalCourier.bonusDropPos.z,
        );
        ctx.fillStyle = '#ffee1f';
        ctx.strokeStyle = '#7c3aed';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(bp.mx, bp.my, 3.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const rv = worldToMap(city.rivalCourier.x, city.rivalCourier.z);
        ctx.fillStyle = '#a855f7';
        ctx.beginPath();
        ctx.arc(rv.mx, rv.my, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const h of city.hazards) {
        const { mx, my } = worldToMap(h.x, h.z);
        ctx.fillStyle =
          h.kind === HazardKind.BridgeGate ? '#f59e0b' : '#ef4444';
        ctx.beginPath();
        ctx.arc(mx, my, 2.1, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const stop of city.stops) {
        const mx = (stop.roadCoord.col + 0.5) * cell;
        const my = (stop.roadCoord.row + 0.5) * cell;
        if (stop.delivered) {
          ctx.fillStyle = '#26c42f';
          ctx.beginPath();
          ctx.arc(mx, my, 2.8, 0, Math.PI * 2);
          ctx.fill();
        } else if (stop.index === snap.activeStopIndex) {
          const ringR = 5.4 + Math.sin(pulseTick * 0.55) * 1.8;
          ctx.strokeStyle = '#ffdf24';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(mx, my, ringR, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#ff9914';
          ctx.strokeStyle = '#1d1205';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(mx, my, 3.9, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = '#fffbeb';
          ctx.strokeStyle = '#1d1205';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(mx, my, 2.7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      ctx.restore();

      // Heading-Up Courier Van Chevron
      ctx.save();
      ctx.translate(vanScreenX, vanScreenY);
      ctx.fillStyle = '#ffdf24';
      ctx.strokeStyle = '#1d1205';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, -5.8);
      ctx.lineTo(-4.2, 4.2);
      ctx.lineTo(0, 2.0);
      ctx.lineTo(4.2, 4.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    drawMap();
    const id = window.setInterval(drawMap, 100);
    return () => window.clearInterval(id);
  }, [minimapRef]);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-2.5 sm:p-4 select-none">
      {/* Subtle low-HP warm peripheral border cue */}
      {isCriticalHealth && (
        <div
          className="fixed inset-0 pointer-events-none border-8 border-rose-500/45 rounded-none"
          aria-hidden="true"
        />
      )}

      {/* TOP ROW: Reference 1 Resource Pills + Center Desktop Alerts + Reference 2 Top-Right Boost & Clock (Hidden on Mobile during 3-2-1!) */}
      <div
        className={`${
          isPreGoCountdown ? 'hidden md:flex' : 'flex'
        } flex-col gap-1.5`}
      >
        <div className="flex items-start justify-between gap-1.5 sm:gap-2">
          {/* LEFT COLUMN: Reference 1 Top-Left Resource Pills + Reference 4 Left-Edge Dock Buttons */}
          <div className="flex flex-col items-start gap-1.5 md:gap-2.5 min-w-0">
            {/* Reference 1: 3-Pill Horizontal Resource Bar (Responsive for both 375px Mobile & 1440px Desktop!) */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 md:gap-5">
              {/* Pill 1: Tilted Golden Level Star + Golden Delivery Progress Bar */}
              <div className="flex items-center">
                <div className="relative w-10 h-10 md:w-14 md:h-14 -mr-3.5 md:-mr-5 z-10 shrink-0 flex items-center justify-center">
                  <svg
                    viewBox="0 0 56 56"
                    className="w-full h-full drop-shadow-sm overflow-visible"
                    aria-hidden="true"
                  >
                    <defs>
                      <clipPath id={starClipId}>
                        <path d="M26.0 7.85 Q28.0 4.8 30.0 7.85 L35.01 15.48 Q36.35 17.51 38.70 18.15 L47.50 20.56 Q51.02 21.52 48.74 24.37 L43.03 31.49 Q41.51 33.39 41.62 35.82 L42.05 44.93 Q42.22 48.58 38.81 47.29 L30.28 44.06 Q28.0 43.2 25.72 44.06 L17.19 47.29 Q13.78 48.58 13.95 44.93 L14.38 35.82 Q14.49 33.39 12.97 31.49 L7.26 24.37 Q4.98 21.52 8.50 20.56 L17.30 18.15 Q19.65 17.51 20.99 15.48 Z" />
                      </clipPath>
                    </defs>
                    <g transform="rotate(-6 28 29)">
                      <g clipPath={`url(#${starClipId})`}>
                        <rect x="0" y="0" width="56" height="56" fill="#ffe629" />
                        <path
                          d="M56 17 L56 56 L0 56 L12 33 L28.5 29.5 Z"
                          fill="#f59e0b"
                        />
                        <ellipse
                          cx="25"
                          cy="16"
                          rx="4.4"
                          ry="6.5"
                          transform="rotate(-16 25 16)"
                          fill="#fffad6"
                          opacity="0.92"
                        />
                      </g>
                      <path
                        d="M26.0 7.85 Q28.0 4.8 30.0 7.85 L35.01 15.48 Q36.35 17.51 38.70 18.15 L47.50 20.56 Q51.02 21.52 48.74 24.37 L43.03 31.49 Q41.51 33.39 41.62 35.82 L42.05 44.93 Q42.22 48.58 38.81 47.29 L30.28 44.06 Q28.0 43.2 25.72 44.06 L17.19 47.29 Q13.78 48.58 13.95 44.93 L14.38 35.82 Q14.49 33.39 12.97 31.49 L7.26 24.37 Q4.98 21.52 8.50 20.56 L17.30 18.15 Q19.65 17.51 20.99 15.48 Z"
                        fill="none"
                        stroke="#140c04"
                        strokeWidth="3.8"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </g>
                  </svg>
                  <span
                    className="absolute inset-0 flex items-center justify-center pt-1 md:pt-1.5 arcade-stroke text-white text-sm md:text-2xl leading-none"
                    aria-label={`Stage ${hud.level}`}
                  >
                    {hud.level}
                  </span>
                </div>

                <div
                  className="arcade-pill-brown rounded-full h-8 md:h-10 w-[78px] sm:w-28 md:w-40 relative overflow-hidden flex items-center justify-end pr-2 md:pr-3.5 pl-4 md:pl-6"
                  aria-label={`Deliveries ${hud.deliveredCount} of ${hud.totalStops}`}
                >
                  <div
                    className={`absolute left-0 top-0 bottom-0 arcade-bar-gold transition-all duration-200 ${
                      deliveryPct < 100 ? 'border-r-[2.5px] border-[#140c04]' : ''
                    }`}
                    style={{ width: `${Math.max(26, deliveryPct)}%` }}
                  />
                  <span className="relative z-10 arcade-stroke-sm text-white text-xs sm:text-sm md:text-lg leading-none">
                    {hud.deliveredCount}/{hud.totalStops}
                  </span>
                </div>
              </div>

              {/* Pill 2: Gold Coin Score Counter */}
              <div className="flex items-center">
                <svg
                  viewBox="0 0 48 48"
                  className="w-8 h-8 md:w-13 md:h-13 -mr-3.5 md:-mr-5 z-10 shrink-0 drop-shadow-sm"
                  aria-hidden="true"
                >
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    fill="#ffe524"
                    stroke="#140c04"
                    strokeWidth="3.6"
                  />
                  <circle
                    cx="24"
                    cy="24"
                    r="14"
                    fill="#df8f0d"
                    stroke="#b86b00"
                    strokeWidth="2"
                  />
                  <path
                    d="M24 13v22M28.5 18.2c0-2-2-3.2-4.5-3.2s-4.5 1.2-4.5 3.1c0 4.3 9 2.6 9 7.4 0 2.1-2 3.5-4.5 3.5s-4.5-1.3-4.5-3.4"
                    stroke="#ffe629"
                    strokeWidth="3.4"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>

                <div
                  className="arcade-pill-brown rounded-full h-8 md:h-10 min-w-[64px] sm:min-w-[96px] md:min-w-[148px] pl-4 md:pl-6 pr-2.5 md:pr-4 flex items-center justify-center gap-1"
                  aria-label={`Coins ${hud.coins}, Score ${hud.score}`}
                >
                  <span className="arcade-stroke text-white text-sm sm:text-lg md:text-2xl leading-none">
                    {hud.coins.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Pill 3: Faceted Red Ruby Hull Counter + Golden Square Pause Cap (Visible on BOTH Mobile & Desktop!) */}
              <div className="flex items-center">
                <svg
                  viewBox="0 0 48 48"
                  className="w-8 h-8 md:w-13 md:h-13 -mr-3 md:-mr-4 z-10 shrink-0 drop-shadow-sm"
                  aria-hidden="true"
                >
                  <polygon
                    points="14,8 34,8 44,20 24,43 4,20"
                    fill="#ff2430"
                    stroke="#140c04"
                    strokeWidth="3.6"
                    strokeLinejoin="round"
                  />
                  <polygon points="14,8 24,8 17,20 4,20" fill="#ff99a3" />
                  <polygon points="34,8 44,20 31,20 24,8" fill="#d90429" />
                  <polygon points="4,20 17,20 24,43" fill="#e0112b" />
                  <polygon points="31,20 44,20 24,43" fill="#ad031b" />
                  <polygon points="17,20 31,20 24,43" fill="#ff3b47" />
                  <line
                    x1="4"
                    y1="20"
                    x2="44"
                    y2="20"
                    stroke="#140c04"
                    strokeWidth="2"
                    strokeOpacity="0.45"
                  />
                </svg>

                <div
                  className="arcade-pill-brown rounded-l-full rounded-r-xl h-8 md:h-10 min-w-[54px] md:min-w-[110px] pl-3.5 md:pl-5 pr-2.5 md:pr-4 flex items-center justify-center gap-1"
                  aria-label={`Van integrity ${hud.health} of ${hud.maxHealth}${
                    hud.hasBumperShield ? ', bumper shield active' : ''
                  }`}
                >
                  <span
                    className={`arcade-stroke text-sm sm:text-lg md:text-2xl leading-none ${
                      isCriticalHealth ? 'text-[#ffdf24]' : 'text-white'
                    }`}
                  >
                    {hud.health}/{hud.maxHealth}
                  </span>
                  {hud.hasBumperShield && (
                    <span
                      className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 rounded-full bg-[#38bdf8] border-2 border-[#140c04] shrink-0"
                      title="Bumper Shield Active"
                    />
                  )}
                </div>

                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Pause game [P]"
                  title="Pause [P]"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onPause();
                  }}
                  className="pointer-events-auto arcade-cap-gold -ml-1.5 md:-ml-2 z-10 w-9 h-9 md:w-11 md:h-11 rounded-xl flex items-center justify-center cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 md:w-5 md:h-5" fill="none">
                    <rect
                      x="5.5"
                      y="4.5"
                      width="5"
                      height="15"
                      rx="1.5"
                      fill="#ffffff"
                      stroke="#140c04"
                      strokeWidth="2.4"
                    />
                    <rect
                      x="13.5"
                      y="4.5"
                      width="5"
                      height="15"
                      rx="1.5"
                      fill="#ffffff"
                      stroke="#140c04"
                      strokeWidth="2.4"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Reference 4: Left-Edge Semicircular Docked Action Buttons (Compact on Mobile, Full Size on Desktop) */}
            <div className="pointer-events-auto -ml-2.5 sm:-ml-4 flex flex-col items-start gap-1.5 md:gap-2.5 mt-0.5 md:mt-1.5">
              {/* Button 1: TURBO Wheel (with Red "!" Badge when Boost Ready) */}
              <button
                type="button"
                tabIndex={-1}
                aria-label="Trigger turbo boost wheel [Shift]"
                title="Turbo Boost [Shift]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  touchControls.boostPulse = true;
                  triggerWindowKeyPulse('ShiftLeft');
                }}
                className="hidden md:flex arcade-dock-tab rounded-r-[34px] pl-3 pr-4 pt-2 pb-1.5 flex-col items-center relative cursor-pointer"
              >
                {hud.boostReady && <RedAlertBadge />}
                <svg
                  viewBox="0 0 56 56"
                  className="w-12 h-12 sm:w-13 sm:h-13 drop-shadow-sm"
                  aria-hidden="true"
                >
                  <circle
                    cx="28"
                    cy="29"
                    r="22"
                    fill="#173763"
                    stroke="#140c04"
                    strokeWidth="3.5"
                  />
                  <path d="M28 29L28 10A19 19 0 0144.5 19.5Z" fill="#ff3b3b" />
                  <path d="M28 29L44.5 19.5A19 19 0 0144.5 38.5Z" fill="#2ee54d" />
                  <path d="M28 29L44.5 38.5A19 19 0 0128 48Z" fill="#ffdf24" />
                  <path d="M28 29L28 48A19 19 0 0111.5 38.5Z" fill="#ff3b3b" />
                  <path d="M28 29L11.5 38.5A19 19 0 0111.5 19.5Z" fill="#ffdf24" />
                  <path d="M28 29L11.5 19.5A19 19 0 0128 10Z" fill="#2ee54d" />
                  <circle
                    cx="28"
                    cy="29"
                    r="19"
                    fill="none"
                    stroke="#140c04"
                    strokeWidth="2.4"
                  />
                  <polygon
                    points="18,7 38,7 28,27"
                    fill="#ffdf24"
                    stroke="#140c04"
                    strokeWidth="3"
                    strokeLinejoin="round"
                  />
                  <circle
                    cx="28"
                    cy="29"
                    r="6"
                    fill="#ffdf24"
                    stroke="#140c04"
                    strokeWidth="2.8"
                  />
                  <circle cx="28" cy="29" r="2.6" fill="#ff2430" />
                </svg>
                <span className="-mt-1.5 arcade-stroke-sm text-white text-sm sm:text-base uppercase leading-none">
                  {hud.isBoosting ? 'ACTIVE' : 'TURBO'}
                </span>
              </button>

              {/* Button 2: Golden Stopwatch RETRY */}
              <button
                type="button"
                tabIndex={-1}
                aria-label="Restart level [R]"
                title="Restart Stage [R]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onRestart();
                }}
                className="arcade-dock-tab rounded-r-[26px] md:rounded-r-[34px] pl-2.5 md:pl-3 pr-3 md:pr-4 pt-1.5 md:pt-2 pb-1 md:pb-1.5 flex flex-col items-center relative cursor-pointer"
              >
                <svg
                  viewBox="0 0 56 56"
                  className="w-9 h-9 md:w-13 md:h-13 drop-shadow-sm"
                  aria-hidden="true"
                >
                  <polygon
                    points="31,5 43,10 39,16 28,11"
                    fill="#ffdf24"
                    stroke="#140c04"
                    strokeWidth="3"
                    strokeLinejoin="round"
                  />
                  <circle
                    cx="27"
                    cy="31"
                    r="20"
                    fill="#ffbf14"
                    stroke="#140c04"
                    strokeWidth="3.5"
                  />
                  <path
                    d="M13 21A17 17 0 0138 16"
                    stroke="#fff394"
                    strokeWidth="3"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <circle
                    cx="27"
                    cy="31"
                    r="13.5"
                    fill="#ffffff"
                    stroke="#140c04"
                    strokeWidth="2.4"
                  />
                  <path
                    d="M25.5 21.5l1.5 9.5"
                    stroke="#140c04"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                  />
                  <circle cx="27" cy="31" r="2.6" fill="#140c04" />
                  <circle cx="18" cy="27" r="1.5" fill="#475569" />
                  <circle cx="36" cy="27" r="1.5" fill="#475569" />
                  <circle cx="21" cy="38" r="1.5" fill="#475569" />
                  <circle cx="33" cy="38" r="1.5" fill="#475569" />
                </svg>
                <span className="-mt-1 md:-mt-1.5 arcade-stroke-sm text-white text-[11px] md:text-base uppercase leading-none">
                  RETRY
                </span>
              </button>

              {/* Button 3: Wooden Clipboard with Red Checkmark QUESTS (Reference 4!) */}
              <button
                type="button"
                tabIndex={-1}
                aria-label="Open shift quests and rules [J]"
                title="Shift Quests & Handbook [J]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenQuests();
                }}
                className="arcade-dock-tab rounded-r-[26px] md:rounded-r-[34px] pl-2.5 md:pl-3 pr-3 md:pr-4 pt-1.5 md:pt-2 pb-1 md:pb-1.5 flex flex-col items-center relative cursor-pointer"
              >
                {(hasClaimableQuest || hud.ticketsCount > 0) && <RedAlertBadge />}
                <svg
                  viewBox="0 0 56 56"
                  className="w-9 h-9 md:w-13 md:h-13 drop-shadow-sm"
                  aria-hidden="true"
                >
                  <g transform="rotate(-9 28 28)">
                    <rect
                      x="11"
                      y="10"
                      width="32"
                      height="38"
                      rx="5"
                      fill="#a4662c"
                      stroke="#140c04"
                      strokeWidth="3.4"
                    />
                    <rect
                      x="21"
                      y="6"
                      width="12"
                      height="7"
                      rx="3"
                      fill="#b87a3d"
                      stroke="#140c04"
                      strokeWidth="2.8"
                    />
                    <rect
                      x="15.5"
                      y="15"
                      width="23"
                      height="28"
                      rx="2"
                      fill="#ffffff"
                      stroke="#140c04"
                      strokeWidth="2.2"
                    />
                    <path
                      d="M19.5 22h15M19.5 29h15M19.5 36h11"
                      stroke="#94a3b8"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                    />
                  </g>
                  <path
                    d="M14 28l9 9 22-20"
                    stroke="#140c04"
                    strokeWidth="8.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  <path
                    d="M14 28l9 9 22-20"
                    stroke="#ff1f2d"
                    strokeWidth="4.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
                <span className="-mt-1 md:-mt-1.5 arcade-stroke-sm text-white text-[11px] md:text-base uppercase leading-none">
                  QUESTS
                </span>
              </button>
            </div>
          </div>

          {/* CENTER EPHEMERAL CALLOUTS ON DESKTOP (md+) */}
          <div className="hidden md:flex flex-col items-center gap-1.5 pt-1">
            {hud.isWrongWay && (
              <div className="arcade-pill-brown border-[#1d1205] rounded-full px-4 py-1.5 flex items-center gap-2.5 whitespace-nowrap">
                <span className="arcade-stroke-sm text-[#ff4d5a] text-sm sm:text-base">
                  WRONG WAY! KEEP RIGHT
                </span>
                <span className="w-16 h-3 bg-black/50 rounded-full overflow-hidden border-2 border-[#1d1205]">
                  <span
                    className="block h-full arcade-bar-gold transition-all duration-75"
                    style={{
                      width: `${Math.round(Math.min(100, hud.wrongWayProgress * 100))}%`,
                    }}
                  />
                </span>
              </div>
            )}

            {hud.bannerEvent && (
              <div
                key={hud.bannerEvent.id}
                className="arcade-boost-rim rounded-full p-1 whitespace-nowrap"
              >
                <div className="bg-[#493214] border-2 border-[#1d1205] rounded-full px-4 py-1 flex items-center gap-2">
                  <span
                    className={`arcade-stroke-sm text-sm sm:text-base ${
                      hud.bannerEvent.tone === 'emerald'
                        ? 'text-[#6bf25c]'
                        : hud.bannerEvent.tone === 'amber'
                          ? 'text-[#ffee1f]'
                          : 'text-[#ff5c6a]'
                    }`}
                  >
                    {hud.bannerEvent.label}
                  </span>
                  <span className="arcade-stroke-sm text-white text-xs sm:text-sm">
                    {hud.bannerEvent.detail}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* TOP-RIGHT: Reference 2 Golden-Rimmed BOOST Capsule (md+) + Outlined White Clock Timer */}
          <div className="flex flex-col items-end md:items-center shrink-0">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Activate turbo boost [Shift]"
              title="Turbo Boost [Shift]"
              onClick={(e) => {
                e.currentTarget.blur();
                touchControls.boostPulse = true;
                triggerWindowKeyPulse('ShiftLeft');
              }}
              className="hidden md:block pointer-events-auto arcade-boost-rim rounded-full p-1 cursor-pointer"
            >
              <div
                className="bg-[#493214] border-[2.5px] border-[#1d1205] rounded-full px-5 py-1 relative overflow-hidden flex items-center gap-2"
                role="progressbar"
                aria-label="Turbo boost charge"
                aria-valuenow={boostPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                {!hud.boostReady && !hud.isBoosting && (
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-amber-400/25 transition-all duration-100"
                    style={{ width: `${boostPct}%` }}
                  />
                )}
                <span className="relative z-10 arcade-stroke-sm text-white text-xl leading-none">
                  x{streakMultiplier}
                </span>
                <span
                  className={`relative z-10 arcade-stroke text-2xl leading-none ${
                    hud.isFever
                      ? 'text-[#ff70a6]'
                      : hud.isBoosting
                        ? 'text-[#6bf25c]'
                        : hud.boostReady
                          ? 'text-[#ffee1f]'
                          : 'text-amber-200/80'
                  }`}
                >
                  {hud.isFever ? 'FEVER!' : 'BOOST'}
                </span>
              </div>
            </button>

            {/* Reference 2: Outlined White Clock Icon + MM:SS Timer */}
            <div className="flex items-center gap-1 md:gap-1.5 md:mt-1.5">
              <svg
                viewBox="0 0 28 28"
                className="w-5 h-5 md:w-7 md:h-7 shrink-0 drop-shadow-sm"
                aria-hidden="true"
              >
                <circle
                  cx="14"
                  cy="14"
                  r="11"
                  fill="#ffffff"
                  stroke="#1d1205"
                  strokeWidth="3.2"
                />
                <path
                  d="M14 8v6.2l4 3"
                  stroke="#1d1205"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
              <span
                className={`arcade-stroke text-base sm:text-xl md:text-2xl leading-none ${
                  isLowTime ? 'text-[#ff5964]' : 'text-white'
                }`}
                aria-label={`${hud.timeRemainingSec} seconds left`}
              >
                {formatClock(hud.timeRemainingSec)}
              </span>
            </div>

            <div className="mt-0.5 md:mt-1 arcade-pill-brown rounded-full px-2.5 md:px-3 py-0.5 flex items-center gap-1.5 md:gap-2">
              <span className="arcade-stroke-sm text-[#ffee1f] text-[10px] md:text-xs leading-none">
                {hud.score.toLocaleString()} PTS
              </span>
              {hud.greenWaveTimer > 0 && (
                <span className="arcade-stroke-sm text-[#6bf25c] text-[10px] md:text-xs leading-none">
                  · WAVE
                </span>
              )}
              {hud.ticketsCount > 0 && (
                <span className="arcade-stroke-sm text-[#ff6b78] text-[10px] md:text-xs leading-none">
                  · {hud.ticketsCount} TKT
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CENTER STORYBOOK 3 - 2 - 1 - GO! COUNTDOWN & ROCKET START OVERLAY */}
      {hud.countdownStage !== null && hud.countdownStage !== undefined && (
        <div
          key={`cd-${hud.countdownStage}`}
          data-testid="hud-countdown-badge"
          className={`pointer-events-none fixed inset-0 flex flex-col items-center z-30 px-4 ${
            hud.countdownStage > 0
              ? 'justify-center pb-6 md:pb-0 md:justify-start md:pt-20'
              : 'justify-start pt-14 md:pt-20'
          }`}
        >
          <div
            className={`arcade-boost-rim rounded-[2rem] p-1 md:p-1.5 shadow-xl transition-transform duration-150 ${
              hud.countdownStage === 0 ? 'scale-100 md:scale-105' : 'scale-100'
            }`}
          >
            <div
              className={`${
                hud.countdownStage === 0
                  ? 'bg-[#2ea836] px-6 py-1.5 sm:px-10 sm:py-3.5 min-w-[140px] sm:min-w-[220px]'
                  : `${
                      hud.rocketStartStatus === 'primed'
                        ? 'bg-[#f59e0b]'
                        : 'bg-[#493214]'
                    } px-7 py-2.5 sm:px-10 sm:py-3.5 min-w-[168px] sm:min-w-[220px]`
              } border-[3.5px] border-[#140c04] rounded-[1.65rem] flex flex-col items-center`}
            >
              <span className="arcade-stroke-sm text-[#ffee1f] text-[10px] sm:text-xs uppercase tracking-wider leading-none mb-1">
                {hud.countdownStage === 0
                  ? hud.rocketStartStatus === 'launched'
                    ? 'TURBO ROCKET LAUNCH!'
                    : 'SHIFT STARTED!'
                  : `STAGE ${hud.level} · ${hud.districtName}`}
              </span>
              <span
                className={`arcade-stroke-lg leading-none ${
                  hud.countdownStage === 0
                    ? 'text-white text-4xl sm:text-7xl'
                    : hud.countdownStage === 1
                      ? 'text-[#6bf25c] text-6xl sm:text-7xl'
                      : 'text-[#ffee1f] text-6xl sm:text-7xl'
                }`}
              >
                {hud.countdownStage === 0 ? 'GO!' : hud.countdownStage}
              </span>
            </div>
          </div>

          {hud.countdownStage > 0 && (
            <div className="mt-2.5 arcade-pill-brown rounded-full px-4 py-1 border-2 border-[#140c04]">
              <span
                className={`arcade-stroke-sm text-xs sm:text-sm ${
                  hud.rocketStartStatus === 'primed'
                    ? 'text-[#6bf25c]'
                    : hud.rocketStartStatus === 'sputter'
                      ? 'text-[#ff6b78]'
                      : hud.countdownStage === 1
                        ? 'text-[#ffee1f]'
                        : 'text-white'
                }`}
              >
                {hud.rocketStartStatus === 'primed' ? (
                  'ROCKET START CHARGED! KEEP HOLDING!'
                ) : hud.rocketStartStatus === 'sputter' ? (
                  'TOO EARLY! RELEASE & HOLD ON 1!'
                ) : hud.countdownStage === 1 ? (
                  <>
                    <span className="md:hidden">
                      HOLD SCREEN NOW FOR ROCKET START!
                    </span>
                    <span className="hidden md:inline">
                      HOLD GAS [W / ▲] NOW FOR ROCKET START!
                    </span>
                  </>
                ) : (
                  'SPOT YOUR ROUTE · READY ON 1!'
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {/* BOTTOM PERIMETER: Desktop Action Trio (md+) + Mobile Dual-Thumb Arcade Deck (<md) + Responsive GPS Radar */}
      <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-2 md:gap-3">
        {/* Left spacer on desktop so the Reference 3 action trio sits centered across the bottom! */}
        <div className="hidden lg:block w-[122px] shrink-0" aria-hidden="true" />

        {/* DESKTOP BOTTOM ACTION BAR (md+) */}
        <div className="hidden md:flex pointer-events-auto items-end gap-5 mx-auto">
          <button
            type="button"
            tabIndex={-1}
            data-testid="hud-demo-timer-btn"
            aria-label={
              hud.demoActive
                ? 'Stop 45s demo reel [T]'
                : 'Start 45s demo reel [T]'
            }
            title={
              hud.demoActive
                ? 'Click to Stop Demo Reel [T / Esc]'
                : '45s Hands-Free Gameplay Demo Reel [T]'
            }
            onClick={(e) => {
              e.currentTarget.blur();
              touchControls.demoTogglePulse = true;
            }}
            className={`arcade-circle-btn w-15 h-15 rounded-full flex items-center justify-center shrink-0 cursor-pointer relative ${
              hud.demoActive ? 'ring-3 ring-[#6bf25c]' : ''
            }`}
          >
            <svg
              viewBox="0 0 36 36"
              className="w-10 h-10"
              fill="none"
              aria-hidden="true"
            >
              {/* Top Stopwatch Plunger & Side Clicker */}
              <path
                d="M14 4h8M18 4v3.5M26.5 8.5l2.2-2.2"
                stroke="#140c04"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
              <path
                d="M14.5 4h7"
                stroke="#ffe524"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              {/* Stopwatch Body */}
              <circle
                cx="18"
                cy="20"
                r="12"
                fill={hud.demoActive ? '#2ea836' : '#ffe524'}
                stroke="#140c04"
                strokeWidth="2.8"
              />
              <circle
                cx="18"
                cy="20"
                r="9.2"
                fill={hud.demoActive ? '#1f7a26' : '#493214'}
              />
            </svg>
            <span className="absolute inset-0 pt-2 flex items-center justify-center arcade-stroke-sm text-white text-xs leading-none tabular-nums">
              {hud.demoActive ? `${hud.demoRemainingSec ?? 45}s` : '45s'}
            </span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? 'Unmute audio [M]' : 'Mute audio [M]'}
            title="Mute / Unmute [M]"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="arcade-circle-btn w-15 h-15 rounded-full flex items-center justify-center shrink-0 cursor-pointer"
          >
            {muted ? (
              <svg viewBox="0 0 28 28" className="w-8 h-8" fill="none">
                <path
                  d="M13 6L7.5 10.5H4v7h3.5L13 22V6z"
                  fill="#ffffff"
                  stroke="#140c04"
                  strokeWidth="2.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M24 10l-6 8M18 10l6 8"
                  stroke="#ff2430"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 28 28" className="w-8 h-8" fill="none">
                <path
                  d="M13 6L7.5 10.5H4v7h3.5L13 22V6z"
                  fill="#ffffff"
                  stroke="#140c04"
                  strokeWidth="2.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M18 10a5.5 5.5 0 010 8M21.5 7a9.5 9.5 0 010 14"
                  stroke="#ffffff"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Honk musical horn [Q]"
            title="Musical Horn [Q] — Calms Scooters & Hurries Ducklings!"
            onClick={(e) => {
              e.currentTarget.blur();
              touchControls.hornPulse = true;
              triggerWindowKeyPulse('KeyQ');
            }}
            className="arcade-circle-btn w-14 h-14 rounded-full flex items-center justify-center shrink-0 cursor-pointer"
          >
            <svg viewBox="0 0 28 28" className="w-7 h-7" fill="none" aria-hidden="true">
              <path
                d="M6 12h4l8-5v14l-8-5H6a2 2 0 01-2-2v0a2 2 0 012-2z"
                fill="#ffe524"
                stroke="#140c04"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <path
                d="M21 10a5 5 0 010 8"
                stroke="#ffffff"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Deliver parcel to active stop [Space]"
            onClick={(e) => {
              e.currentTarget.blur();
              touchControls.deliverPulse = true;
              triggerWindowKeyPulse('Space');
            }}
            className={`${
              hud.canExpressToss ? 'arcade-btn-green' : 'arcade-btn-gold'
            } rounded-2xl px-5 pt-2.5 pb-2.5 min-w-[356px] flex flex-col gap-1.5 cursor-pointer relative`}
          >
            <div
              className="absolute -top-6 left-1/2 -translate-x-1/2 pointer-events-none flex items-center justify-center"
              aria-hidden="true"
            >
              <svg viewBox="0 0 56 56" className="w-12 h-12 drop-shadow-sm">
                <g stroke="#fff59d" strokeWidth="3" strokeLinecap="round" opacity="0.85">
                  <line x1="28" y1="3" x2="28" y2="9" />
                  <line x1="11" y1="10" x2="15" y2="14" />
                  <line x1="45" y1="10" x2="41" y2="14" />
                  <line x1="5" y1="24" x2="11" y2="24" />
                  <line x1="51" y1="24" x2="45" y2="24" />
                </g>
                <ellipse cx="28" cy="46" rx="11" ry="3.5" fill="rgba(20,12,4,0.28)" />
                <path
                  d="M28 11L13 18.5v16L28 42l15-7.5v-16L28 11z"
                  fill={
                    hud.nextParcelKind === ParcelKind.HotExpress
                      ? '#ef233c'
                      : hud.nextParcelKind === ParcelKind.Large
                        ? '#ff9f1c'
                        : hud.nextParcelKind === ParcelKind.Fragile
                          ? '#ff75a0'
                          : '#fff3b0'
                  }
                  stroke="#140c04"
                  strokeWidth="3.2"
                  strokeLinejoin="round"
                />
                <path
                  d="M13 18.5L28 26l15-7.5M28 26v16"
                  stroke="#140c04"
                  strokeWidth="2.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M20.5 14.8l15 7.5"
                  stroke="#ffe524"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <div className="flex items-center justify-between gap-3 w-full">
              <div className="flex items-center gap-2 min-w-0">
                <CustomerPortraitSvg appearance={hud.nextStopAppearance} />
                <div className="text-left min-w-0">
                  <div className="font-display text-base text-[#2b1b08] leading-none truncate">
                    #{hud.nextStopIndex} {hud.nextCustomerName}
                    {hud.nextVipRole !== 'none' ? ' ★' : ''}
                  </div>
                  <div className="text-[11px] font-extrabold text-[#5c3809] truncate mt-0.5 max-w-[175px]">
                    {hud.nextParcelKind === ParcelKind.HotExpress
                      ? `HOT (${Math.round(hud.thermalPct * 100)}%) · ${hud.nextParcelLabel}`
                      : hud.nextParcelLabel}
                  </div>
                </div>
              </div>

              {hud.deliveredCount < hud.totalStops && (
                <div className="flex items-center gap-1.5 bg-[#493214] border-[2.5px] border-[#140c04] rounded-xl px-2.5 py-1 shrink-0">
                  <svg
                    viewBox="0 0 24 24"
                    className="w-4 h-4 transition-transform duration-100"
                    style={{ transform: `rotate(${Math.round(compassDeg)}deg)` }}
                    aria-hidden="true"
                  >
                    <path
                      d="M12 2.5l6.5 16.5L12 15.2 5.5 19 12 2.5z"
                      fill="#ffee1f"
                      stroke="#140c04"
                      strokeWidth="2.2"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="arcade-stroke-sm text-white text-sm leading-none">
                    {hud.distanceToStopMeters}m
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 pt-0.5">
              <svg
                viewBox="0 0 28 28"
                className="w-6 h-6 shrink-0"
                aria-hidden="true"
              >
                <circle
                  cx="14"
                  cy="14"
                  r="11.5"
                  fill="#ffe524"
                  stroke="#140c04"
                  strokeWidth="2.8"
                />
                <circle cx="14" cy="14" r="8" fill="#df8f0d" />
                <path
                  d="M14 8v12M16.5 10.8c0-1.1-1.1-1.8-2.5-1.8s-2.5.7-2.5 1.7c0 2.4 5 1.5 5 4.1 0 1.2-1.1 1.9-2.5 1.9s-2.5-.7-2.5-1.8"
                  stroke="#ffe629"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>

              <span className="arcade-stroke-sm text-white text-lg leading-none whitespace-nowrap">
                {hud.needsBrakeForLarge
                  ? `BRAKE [S/↓] · +${activeRewardPoints}`
                  : hud.canBullseyeToss
                    ? `BULLSEYE [SPACE]! · +${activeRewardPoints + 85}`
                    : hud.canExpressToss
                      ? `DELIVER [SPACE] · +${activeRewardPoints}`
                      : hud.nextParcelKind === ParcelKind.Large
                        ? `LARGE CRATE · +${activeRewardPoints}`
                        : hud.nextParcelKind === ParcelKind.HotExpress
                          ? `HOT EXPRESS · +${activeRewardPoints}`
                          : hud.nextParcelKind === ParcelKind.Fragile
                            ? hud.fragileIntact
                              ? `FRAGILE · +${activeRewardPoints}`
                              : `BUMPED · +${activeRewardPoints}`
                            : `TOSS [SPACE] · +${activeRewardPoints}`}
              </span>
            </div>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Open garage shop and lucky spin [G]"
            title="Garage Fleet, Toppers & Lucky Spin [G]"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenShop();
            }}
            className="flex flex-col items-center pb-1.5 cursor-pointer transition-transform hover:-translate-y-0.5 active:translate-y-0.5 shrink-0 relative"
          >
            {hasFreeSpin && <RedAlertBadge />}
            <svg
              viewBox="0 0 60 52"
              className="w-15 h-13 drop-shadow-sm"
              aria-hidden="true"
            >
              <rect
                x="9"
                y="22"
                width="42"
                height="26"
                rx="3"
                fill="#f8fafc"
                stroke="#140c04"
                strokeWidth="3.4"
              />
              <rect
                x="14"
                y="27"
                width="15"
                height="13"
                rx="2"
                fill="#29b6f6"
                stroke="#140c04"
                strokeWidth="2.6"
              />
              <rect
                x="34"
                y="27"
                width="11"
                height="21"
                rx="2"
                fill="#1e88e5"
                stroke="#140c04"
                strokeWidth="2.6"
              />
              <path
                d="M6 21L11 7h38l5 14a6 6 0 01-12 0 6 6 0 01-12 0 6 6 0 01-12 0 6 6 0 01-12 0z"
                fill="#ffffff"
                stroke="#140c04"
                strokeWidth="3.4"
                strokeLinejoin="round"
              />
              <path d="M6 21L11 7h9l-2 14a6 6 0 01-12 0z" fill="#ff3b24" />
              <path d="M30 21l-1-14h10l3 14a6 6 0 01-12 0z" fill="#ff3b24" />
              <path
                d="M6 21L11 7h38l5 14a6 6 0 01-12 0 6 6 0 01-12 0 6 6 0 01-12 0 6 6 0 01-12 0z"
                fill="none"
                stroke="#140c04"
                strokeWidth="3.4"
                strokeLinejoin="round"
              />
            </svg>
            <span className="-mt-2.5 arcade-stroke-sm text-white text-base uppercase leading-tight">
              SHOP
            </span>
          </button>
        </div>

        {/* MOBILE DUAL-THUMB ARCADE TOUCH DECK (< md): Hidden during 3-2-1, appears cleanly on GO! */}
        <div
          className={`${
            isPreGoCountdown ? 'hidden' : 'flex md:hidden'
          } pointer-events-auto flex-col gap-1.5 w-full touch-none`}
        >
          {/* Compact Bottom-Tucked Status Chip (keeps vertical center & forward 3D road 100% unobstructed!) */}
          {(hud.isWrongWay || (showMobileBanner && hud.bannerEvent)) && (
            <div className="pointer-events-none self-center max-w-[92%]">
              {hud.isWrongWay ? (
                <div className="arcade-pill-brown border-[#1d1205] rounded-full px-2.5 py-0.5 flex items-center gap-1.5 whitespace-nowrap">
                  <span className="arcade-stroke-sm text-[#ff4d5a] text-[11px] leading-none">
                    WRONG WAY · KEEP RIGHT
                  </span>
                  <span className="w-10 h-2 bg-black/50 rounded-full overflow-hidden border border-[#1d1205]">
                    <span
                      className="block h-full arcade-bar-gold transition-all duration-75"
                      style={{
                        width: `${Math.round(Math.min(100, hud.wrongWayProgress * 100))}%`,
                      }}
                    />
                  </span>
                </div>
              ) : hud.bannerEvent ? (
                <div
                  key={hud.bannerEvent.id}
                  className="bg-[#493214]/95 border-2 border-[#1d1205] rounded-full px-2.5 py-0.5 flex items-center gap-1.5 truncate shadow-sm"
                >
                  <span
                    className={`arcade-stroke-sm text-[11px] leading-none shrink-0 ${
                      hud.bannerEvent.tone === 'emerald'
                        ? 'text-[#6bf25c]'
                        : hud.bannerEvent.tone === 'amber'
                          ? 'text-[#ffee1f]'
                          : 'text-[#ff5c6a]'
                    }`}
                  >
                    {hud.bannerEvent.label}
                  </span>
                </div>
              ) : null}
            </div>
          )}

          {/* Upper Compact Strip: [Mute] + [Horn] + [Tap-to-Deliver Active Stop Card] + [Shop Icon] */}
          <div className="flex items-center gap-1.5 w-full">
            <button
              type="button"
              tabIndex={-1}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="arcade-circle-btn w-11 h-11 rounded-full flex items-center justify-center shrink-0 cursor-pointer"
            >
              {muted ? (
                <svg viewBox="0 0 28 28" className="w-6 h-6" fill="none">
                  <path
                    d="M13 6L7.5 10.5H4v7h3.5L13 22V6z"
                    fill="#ffffff"
                    stroke="#140c04"
                    strokeWidth="2.6"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M24 10l-6 8M18 10l6 8"
                    stroke="#ff2430"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 28 28" className="w-6 h-6" fill="none">
                  <path
                    d="M13 6L7.5 10.5H4v7h3.5L13 22V6z"
                    fill="#ffffff"
                    stroke="#140c04"
                    strokeWidth="2.6"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M18 10a5.5 5.5 0 010 8M21.5 7a9.5 9.5 0 010 14"
                    stroke="#ffffff"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Honk musical horn"
              onPointerDown={(e) => {
                e.preventDefault();
                touchControls.hornPulse = true;
              }}
              className="arcade-circle-btn w-11 h-11 rounded-full flex items-center justify-center shrink-0 cursor-pointer"
            >
              <svg viewBox="0 0 28 28" className="w-6 h-6" fill="none" aria-hidden="true">
                <path
                  d="M6 12h4l8-5v14l-8-5H6a2 2 0 01-2-2v0a2 2 0 012-2z"
                  fill="#ffe524"
                  stroke="#140c04"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M21 10a5 5 0 010 8"
                  stroke="#ffffff"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Tap to deliver parcel to active stop"
              onPointerDown={(e) => {
                e.preventDefault();
                touchControls.deliverPulse = true;
              }}
              className={`${
                hud.canExpressToss ? 'arcade-btn-green' : 'arcade-btn-gold'
              } flex-1 min-w-0 rounded-2xl px-2.5 py-1.5 flex items-center justify-between gap-2 cursor-pointer`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <CustomerPortraitSvg appearance={hud.nextStopAppearance} />
                <div className="text-left min-w-0">
                  <div className="font-display text-xs text-[#2b1b08] leading-tight truncate">
                    #{hud.nextStopIndex} {hud.nextCustomerName}
                    {hud.nextVipRole !== 'none' ? ' ★' : ''}
                  </div>
                  <div className="arcade-stroke-sm text-white text-[11px] leading-tight truncate">
                    {hud.needsBrakeForLarge
                      ? `HOLD BRAKE · +${activeRewardPoints}`
                      : hud.canBullseyeToss
                        ? `BULLSEYE TAP! +${activeRewardPoints + 85}`
                        : hud.canExpressToss
                          ? `TAP TO DELIVER! +${activeRewardPoints}`
                          : `${
                              hud.nextParcelKind === ParcelKind.Large
                                ? 'CRATE'
                                : hud.nextParcelKind === ParcelKind.HotExpress
                                  ? `HOT ${Math.round(hud.thermalPct * 100)}%`
                                  : hud.nextParcelKind === ParcelKind.Fragile
                                    ? hud.fragileIntact
                                      ? 'FRAGILE'
                                      : 'BUMPED'
                                    : 'PARCEL'
                            } · +${activeRewardPoints}`}
                  </div>
                </div>
              </div>

              {hud.deliveredCount < hud.totalStops && (
                <div className="flex items-center gap-1 bg-[#493214] border-2 border-[#140c04] rounded-xl px-2 py-1 shrink-0">
                  <svg
                    viewBox="0 0 24 24"
                    className="w-3.5 h-3.5 transition-transform duration-100"
                    style={{ transform: `rotate(${Math.round(compassDeg)}deg)` }}
                    aria-hidden="true"
                  >
                    <path
                      d="M12 2.5l6.5 16.5L12 15.2 5.5 19 12 2.5z"
                      fill="#ffee1f"
                      stroke="#140c04"
                      strokeWidth="2.2"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="arcade-stroke-sm text-white text-xs leading-none">
                    {hud.distanceToStopMeters}m
                  </span>
                </div>
              )}
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Open garage shop"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenShop();
              }}
              className="flex flex-col items-center justify-center min-w-[46px] min-h-[46px] cursor-pointer relative shrink-0"
            >
              {hasFreeSpin && <RedAlertBadge />}
              <svg
                viewBox="0 0 60 52"
                className="w-11 h-9 drop-shadow-sm"
                aria-hidden="true"
              >
                <rect
                  x="9"
                  y="22"
                  width="42"
                  height="26"
                  rx="3"
                  fill="#f8fafc"
                  stroke="#140c04"
                  strokeWidth="3.4"
                />
                <rect
                  x="14"
                  y="27"
                  width="15"
                  height="13"
                  rx="2"
                  fill="#29b6f6"
                  stroke="#140c04"
                  strokeWidth="2.6"
                />
                <rect
                  x="34"
                  y="27"
                  width="11"
                  height="21"
                  rx="2"
                  fill="#1e88e5"
                  stroke="#140c04"
                  strokeWidth="2.6"
                />
                <path
                  d="M6 21L11 7h38l5 14a6 6 0 01-12 0 6 6 0 01-12 0 6 6 0 01-12 0 6 6 0 01-12 0z"
                  fill="#ffffff"
                  stroke="#140c04"
                  strokeWidth="3.4"
                  strokeLinejoin="round"
                />
                <path d="M6 21L11 7h9l-2 14a6 6 0 01-12 0z" fill="#ff3b24" />
                <path d="M30 21l-1-14h10l3 14a6 6 0 01-12 0z" fill="#ff3b24" />
                <path
                  d="M6 21L11 7h38l5 14a6 6 0 01-12 0 6 6 0 01-12 0 6 6 0 01-12 0 6 6 0 01-12 0z"
                  fill="none"
                  stroke="#140c04"
                  strokeWidth="3.4"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {/* Lower Dual-Thumb Arcade Driving Row: [◀ STEER RIGHT ▶] + [BOOST] + [BRAKE ▼ | DRIVE ▲] */}
          <div className="flex items-stretch gap-1.5 w-full">
            {/* Left Thumb Slide-Capable Steering Rocker */}
            <div
              ref={steerRockerRef}
              role="group"
              aria-label="Steering controls"
              onPointerDown={(e) => {
                e.preventDefault();
                steerPointerIdRef.current = e.pointerId;
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  // Ignore synthetic pointer events without active pointerId
                }
                touchControls.steerTouchActive = true;
                updateSteerFromClientX(e.clientX);
              }}
              onPointerMove={(e) => {
                if (steerPointerIdRef.current !== e.pointerId) return;
                updateSteerFromClientX(e.clientX);
              }}
              onPointerUp={(e) => {
                if (steerPointerIdRef.current !== e.pointerId) return;
                releaseSteerRocker();
              }}
              onPointerCancel={(e) => {
                if (steerPointerIdRef.current !== e.pointerId) return;
                releaseSteerRocker();
              }}
              className="flex-[1.2] grid grid-cols-2 gap-1.5 touch-none"
            >
              <button
                type="button"
                tabIndex={-1}
                aria-label="Steer left"
                className={`arcade-btn-gold h-[56px] rounded-2xl flex items-center justify-center cursor-pointer transition-transform ${
                  steerUiSide === 'left' ? 'translate-y-0.5 brightness-110' : ''
                }`}
              >
                <span className="arcade-stroke-sm text-white text-xs">LEFT</span>
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Steer right"
                className={`arcade-btn-gold h-[56px] rounded-2xl flex items-center justify-center cursor-pointer transition-transform ${
                  steerUiSide === 'right' ? 'translate-y-0.5 brightness-110' : ''
                }`}
              >
                <span className="arcade-stroke-sm text-white text-xs">RIGHT</span>
              </button>
            </div>

            {/* Center Thumb Turbo Boost Pill */}
            <button
              type="button"
              tabIndex={-1}
              aria-label="Activate mobile turbo boost"
              onPointerDown={(e) => {
                e.preventDefault();
                touchControls.boostPulse = true;
              }}
              className="arcade-boost-rim rounded-2xl p-1 min-w-[78px] h-[56px] flex items-stretch cursor-pointer shrink-0"
            >
              <div className="bg-[#493214] border-2 border-[#1d1205] rounded-xl px-2 w-full relative overflow-hidden flex flex-col items-center justify-center">
                {!hud.boostReady && !hud.isBoosting && (
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-amber-400/30 transition-all duration-100"
                    style={{ width: `${boostPct}%` }}
                  />
                )}
                <span className="relative z-10 arcade-stroke-sm text-white text-[11px] leading-none">
                  x{streakMultiplier}
                </span>
                <span
                  className={`relative z-10 arcade-stroke-sm text-xs leading-tight ${
                    hud.isFever
                      ? 'text-[#ff70a6]'
                      : hud.isBoosting
                        ? 'text-[#6bf25c]'
                        : hud.boostReady
                          ? 'text-[#ffee1f]'
                          : 'text-amber-200/80'
                  }`}
                >
                  {hud.isFever ? 'FEVER!' : 'BOOST'}
                </span>
              </div>
            </button>

            {/* Right Thumb Brake & Gas Pedals */}
            <div className="flex-[1.2] grid grid-cols-2 gap-1.5 touch-none">
              <button
                type="button"
                tabIndex={-1}
                aria-label="Hold brake"
                onPointerDown={(e) => {
                  e.preventDefault();
                  brakePointerIdRef.current = e.pointerId;
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {
                    // Ignore synthetic pointer events
                  }
                  touchControls.brake = true;
                  setBrakePressed(true);
                }}
                onPointerUp={(e) => {
                  if (brakePointerIdRef.current !== e.pointerId) return;
                  brakePointerIdRef.current = null;
                  touchControls.brake = false;
                  setBrakePressed(false);
                }}
                onPointerCancel={(e) => {
                  if (brakePointerIdRef.current !== e.pointerId) return;
                  brakePointerIdRef.current = null;
                  touchControls.brake = false;
                  setBrakePressed(false);
                }}
                className={`arcade-btn-cream h-[56px] rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-transform ${
                  brakePressed ? 'translate-y-0.5 brightness-95' : ''
                }`}
              >
                <span className="arcade-stroke-sm text-[#ff5964] text-xs leading-none">
                  BRAKE
                </span>
                <span className="text-[10px] font-extrabold text-[#493214] leading-tight mt-0.5">
                  STOP
                </span>
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Hold gas pedal to drive"
                onPointerDown={(e) => {
                  e.preventDefault();
                  gasPointerIdRef.current = e.pointerId;
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {
                    // Ignore synthetic pointer events
                  }
                  touchControls.gas = true;
                  setGasPressed(true);
                }}
                onPointerUp={(e) => {
                  if (gasPointerIdRef.current !== e.pointerId) return;
                  gasPointerIdRef.current = null;
                  touchControls.gas = false;
                  setGasPressed(false);
                }}
                onPointerCancel={(e) => {
                  if (gasPointerIdRef.current !== e.pointerId) return;
                  gasPointerIdRef.current = null;
                  touchControls.gas = false;
                  setGasPressed(false);
                }}
                className={`arcade-btn-green h-[56px] rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-transform ${
                  gasPressed ? 'translate-y-0.5 brightness-110' : ''
                }`}
              >
                <span className="arcade-stroke-sm text-white text-sm leading-none">
                  DRIVE
                </span>
                <span className="text-[10px] font-extrabold text-[#0b3b12] leading-tight mt-0.5">
                  GO ▲
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Heading-Up GPS Radar: Upper-Right under clock on Mobile (<md, hidden during 3-2-1), Bottom-Right on Desktop (md+) */}
        <div
          className={`${
            isPreGoCountdown ? 'hidden md:flex' : 'flex'
          } fixed right-2.5 top-[64px] md:static flex-col items-center arcade-pill-brown rounded-xl md:rounded-2xl p-1 md:p-1.5 shrink-0 z-10`}
        >
          <canvas
            ref={mapCanvasRef}
            width={106}
            height={106}
            data-testid="hud-minimap"
            aria-label="Courier GPS route minimap"
            className="block w-[72px] h-[72px] md:w-[106px] md:h-[106px] rounded-lg md:rounded-xl border-2 border-[#140c04]"
          />
          <div className="w-full flex items-center justify-between px-1 md:px-1.5 pt-0.5 md:pt-1">
            <span className="arcade-stroke-sm text-[#ffee1f] text-[9px] md:text-xs leading-none">
              GPS
            </span>
            <span className="arcade-stroke-sm text-white text-[9px] md:text-xs leading-none">
              {hud.speedKmh} KM/H
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
