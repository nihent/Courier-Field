import React from 'react';
import { pokoAudio } from '../game/audio';

interface TitleOverlayProps {
  selectedLevel?: number;
  highestUnlockedLevel?: number;
  muted: boolean;
  onSelectLevel?: (lvl: number) => void;
  onStart: () => void;
  onToggleMute: () => void;
}

const WELCOME_COURIER_LETTERS: Array<{
  ch: string;
  x: number;
  y: number;
  rot: number;
}> = [
  { ch: 'C', x: 102, y: 78, rot: -6 },
  { ch: 'O', x: 158, y: 72, rot: 3 },
  { ch: 'U', x: 216, y: 70, rot: -3 },
  { ch: 'R', x: 274, y: 71, rot: 3 },
  { ch: 'I', x: 319, y: 72, rot: -2 },
  { ch: 'E', x: 361, y: 74, rot: 4 },
  { ch: 'R', x: 416, y: 78, rot: -4 },
];

const WELCOME_FIELD_LETTERS: Array<{
  ch: string;
  x: number;
  y: number;
  rot: number;
}> = [
  { ch: 'F', x: 164, y: 140, rot: -5 },
  { ch: 'I', x: 207, y: 137, rot: 2 },
  { ch: 'E', x: 251, y: 136, rot: -3 },
  { ch: 'L', x: 301, y: 137, rot: 3 },
  { ch: 'D', x: 356, y: 140, rot: -3 },
];

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  muted,
  onStart,
  onToggleMute,
}) => {
  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center p-4 bg-[#241309]/55 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-heading"
    >
      {/* Top-Right Top-Tufted Terracotta Squircle Audio Button */}
      <div className="fixed top-3 right-3 sm:top-5 sm:right-5 z-30">
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleMute();
          }}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          className="group pointer-events-auto relative w-14 h-15 flex items-center justify-center cursor-pointer transition-transform duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFF3B0]"
        >
          <svg
            viewBox="0 0 64 68"
            className="absolute inset-0 w-full h-full drop-shadow-[0_4px_0_rgba(62,21,6,0.45)]"
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id="muteTerracottaGrad"
                x1="32"
                y1="4"
                x2="32"
                y2="63"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#F5803D" />
                <stop offset="52%" stopColor="#E45A25" />
                <stop offset="100%" stopColor="#CA4216" />
              </linearGradient>
            </defs>
            <path
              d="M23 13 C26 11, 29 6, 32 3 C35 6, 38 11, 41 13 L44 13 C53 13, 58 18, 58 28 L58 47 C58 57, 52 63, 42 63 L22 63 C12 63, 6 57, 6 47 L6 28 C6 18, 11 13, 20 13 Z"
              fill="url(#muteTerracottaGrad)"
              stroke="#8B2A0E"
              strokeWidth="3.4"
              strokeLinejoin="round"
            />
            <path
              d="M14 20 C18 17, 25 16, 32 10 C39 16, 46 17, 50 20"
              stroke="#FFB27E"
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity="0.65"
            />
            <circle cx="15" cy="52" r="3" fill="#B53711" opacity="0.55" />
            <circle cx="50" cy="49" r="2.5" fill="#B53711" opacity="0.5" />
          </svg>

          {muted ? (
            <svg
              viewBox="0 0 28 28"
              className="relative z-10 w-7 h-7 mt-1 drop-shadow-[0_2px_0_#8B2A0E]"
              fill="none"
            >
              <path
                d="M13 6.5L7.5 11H4v6h3.5L13 21.5V6.5z"
                fill="#FFF8E3"
                stroke="#7A240B"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M23.5 10.5l-5.5 7M18 10.5l5.5 7"
                stroke="#FFE066"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg
              viewBox="0 0 28 28"
              className="relative z-10 w-7 h-7 mt-1 drop-shadow-[0_2px_0_#8B2A0E]"
              fill="none"
            >
              <path
                d="M13 6.5L7.5 11H4v6h3.5L13 21.5V6.5z"
                fill="#FFF8E3"
                stroke="#7A240B"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M17.5 10.5a5 5 0 010 7M21 7.5a9 9 0 010 13"
                stroke="#FFF8E3"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Single Centered Illustrated Storybook Welcome Dialogue */}
      <div className="pointer-events-auto relative overflow-hidden rounded-[34px] border-[4px] border-[#61270E] shadow-[0_14px_34px_rgba(28,11,3,0.52),inset_0_-7px_0_#C88242] p-5 sm:px-7 sm:py-6 w-full max-w-[660px] my-auto flex flex-col gap-3.5 bg-[#F5C882]">
        {/* Illustrated Dusk-to-Sunlit-Avenue Backdrop SVG */}
        <svg
          viewBox="0 0 630 480"
          preserveAspectRatio="xMidYMid slice"
          className="pointer-events-none absolute inset-0 w-full h-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="welcomeSkyAvenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9A84BC" />
              <stop offset="25%" stopColor="#DF9787" />
              <stop offset="54%" stopColor="#F8CF88" />
              <stop offset="100%" stopColor="#E6AD66" />
            </linearGradient>
            <radialGradient id="welcomeSunGlow" cx="50%" cy="36%" r="46%">
              <stop offset="0%" stopColor="#FFF5C8" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#F8CF88" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect width="630" height="480" fill="url(#welcomeSkyAvenue)" />
          <rect width="630" height="480" fill="url(#welcomeSunGlow)" />

          {/* Soft twilight stars */}
          <circle cx="132" cy="24" r="2" fill="#FFF7DE" opacity="0.7" />
          <circle cx="228" cy="16" r="1.5" fill="#FFF7DE" opacity="0.55" />
          <circle cx="412" cy="19" r="2" fill="#FFF7DE" opacity="0.65" />
          <circle cx="496" cy="28" r="1.6" fill="#FFF7DE" opacity="0.55" />

          {/* Hand-illustrated coral-blossom tree canopies & branches in upper corners */}
          <g>
            {/* Left tree trunk + organic scalloped coral blossom puffs */}
            <path
              d="M32 132 Q42 96 58 70"
              stroke="#7A4422"
              strokeWidth="9"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M-8 62 C-4 34, 24 22, 48 30 C64 18, 94 24, 102 46 C116 54, 114 78, 94 86 C76 96, 44 96, 26 90 C6 94, -12 80, -8 62 Z"
              fill="#EA6256"
              opacity="0.9"
            />
            <path
              d="M6 50 C14 34, 38 28, 56 36 C70 28, 90 34, 94 50 C78 58, 42 60, 6 50 Z"
              fill="#F78572"
              opacity="0.75"
            />

            {/* Right tree trunk + organic scalloped coral blossom puffs */}
            <path
              d="M598 132 Q586 96 570 70"
              stroke="#7A4422"
              strokeWidth="9"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M528 48 C536 24, 566 18, 584 30 C606 22, 634 34, 638 62 C642 80, 624 94, 604 90 C586 96, 554 96, 536 86 C516 78, 514 56, 528 48 Z"
              fill="#EA6256"
              opacity="0.9"
            />
            <path
              d="M536 50 C542 34, 562 28, 578 36 C596 28, 616 34, 624 50 C588 60, 552 58, 536 50 Z"
              fill="#F78572"
              opacity="0.75"
            />
          </g>

          {/* Warm sunlit sandstone side buildings */}
          <path
            d="M0 78 L66 106 L50 315 L0 335 Z"
            fill="#EDBA70"
            opacity="0.82"
          />
          <path
            d="M12 135 L44 146 L38 228 L8 224 Z"
            fill="#D89852"
            opacity="0.45"
          />
          <path
            d="M630 76 L564 106 L580 315 L630 335 Z"
            fill="#EDBA70"
            opacity="0.82"
          />
          <path
            d="M618 135 L586 146 L592 228 L622 224 Z"
            fill="#D89852"
            opacity="0.45"
          />

          {/* Sunlit perspective avenue stripes */}
          <polygon
            points="245,215 180,215 0,400 0,480 86,480"
            fill="#D39252"
            opacity="0.34"
          />
          <polygon
            points="285,215 258,215 118,480 182,480"
            fill="#D39252"
            opacity="0.28"
          />
          <polygon
            points="385,215 450,215 630,400 630,480 544,480"
            fill="#D39252"
            opacity="0.34"
          />
          <polygon
            points="345,215 372,215 512,480 448,480"
            fill="#D39252"
            opacity="0.28"
          />
        </svg>

        {/* Subtle inner cream highlight border */}
        <div
          className="pointer-events-none absolute inset-[3px] rounded-[29px] border-2 border-[#FFF6DC]/45"
          aria-hidden="true"
        />

        {/* Row 1: "Welcome to COURIER FIELD" Interlocking 3D Cartoon Logo Lockup */}
        <div className="relative z-10 flex flex-col items-center text-center pt-0.5">
          <div
            style={{ fontFamily: "'Skranji', 'Lilita One', cursive" }}
            className="text-sm sm:text-base font-bold tracking-wider text-[#FFF9E6] drop-shadow-[0_2px_0_#6B2D12]"
          >
            Welcome to
          </div>

          <h1 id="welcome-heading" className="sr-only">
            Welcome to Courier Field
          </h1>

          <svg
            viewBox="0 0 520 158"
            className="w-full max-w-[445px] h-auto -mt-1.5 select-none drop-shadow-[0_5px_0_rgba(58,26,10,0.34)]"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id="courierGoldFill"
                x1="0"
                y1="14"
                x2="0"
                y2="86"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#FFF570" />
                <stop offset="50%" stopColor="#FFB52B" />
                <stop offset="100%" stopColor="#E67116" />
              </linearGradient>

              <linearGradient
                id="fieldLimeFill"
                x1="0"
                y1="84"
                x2="0"
                y2="150"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#DCF866" />
                <stop offset="55%" stopColor="#93D535" />
                <stop offset="100%" stopColor="#61A61D" />
              </linearGradient>

              <linearGradient id="cubeLimeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#CEF459" />
                <stop offset="100%" stopColor="#77BC22" />
              </linearGradient>
            </defs>

            {/* Floating playful lime cubes on the top-right matching reference logo */}
            <g transform="translate(458, 22) rotate(12)">
              <rect
                x="0"
                y="0"
                width="24"
                height="24"
                rx="6"
                fill="url(#cubeLimeGrad)"
                stroke="#3D2212"
                strokeWidth="5.5"
              />
              <path
                d="M5 6 H14"
                stroke="#F4FFBD"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </g>
            <g transform="translate(446, 51) rotate(-8)">
              <rect
                x="0"
                y="0"
                width="15"
                height="15"
                rx="4.5"
                fill="url(#cubeLimeGrad)"
                stroke="#3D2212"
                strokeWidth="5"
              />
            </g>

            {/* Top Word: COURIER (Tightly interlocked 3D Cocoa Bevel + Golden-Amber Fill) */}
            <g
              style={{
                fontFamily: "'Skranji', 'Lilita One', sans-serif",
                fontWeight: 700,
                fontSize: '74px',
              }}
              textAnchor="middle"
            >
              {WELCOME_COURIER_LETTERS.map((item, idx) => (
                <g
                  key={`c-shadow-${idx}`}
                  transform={`translate(${item.x}, ${item.y + 7}) rotate(${item.rot})`}
                >
                  <text
                    fill="#3D2212"
                    stroke="#3D2212"
                    strokeWidth="15"
                    strokeLinejoin="round"
                  >
                    {item.ch}
                  </text>
                </g>
              ))}
              {WELCOME_COURIER_LETTERS.map((item, idx) => (
                <g
                  key={`c-main-${idx}`}
                  transform={`translate(${item.x}, ${item.y}) rotate(${item.rot})`}
                >
                  <text
                    fill="url(#courierGoldFill)"
                    stroke="#3D2212"
                    strokeWidth="13"
                    strokeLinejoin="round"
                    style={{ paintOrder: 'stroke fill' }}
                  >
                    {item.ch}
                  </text>
                </g>
              ))}
            </g>

            {/* Bottom Word: FIELD (Tightly interlocked 3D Cocoa Bevel + Spring-Lime Fill) */}
            <g
              style={{
                fontFamily: "'Skranji', 'Lilita One', sans-serif",
                fontWeight: 700,
                fontSize: '72px',
              }}
              textAnchor="middle"
            >
              {WELCOME_FIELD_LETTERS.map((item, idx) => (
                <g
                  key={`f-shadow-${idx}`}
                  transform={`translate(${item.x}, ${item.y + 7}) rotate(${item.rot})`}
                >
                  <text
                    fill="#382110"
                    stroke="#382110"
                    strokeWidth="15"
                    strokeLinejoin="round"
                  >
                    {item.ch}
                  </text>
                </g>
              ))}
              {WELCOME_FIELD_LETTERS.map((item, idx) => (
                <g
                  key={`f-main-${idx}`}
                  transform={`translate(${item.x}, ${item.y}) rotate(${item.rot})`}
                >
                  <text
                    fill="url(#fieldLimeFill)"
                    stroke="#382110"
                    strokeWidth="13"
                    strokeLinejoin="round"
                    style={{ paintOrder: 'stroke fill' }}
                  >
                    {item.ch}
                  </text>
                </g>
              ))}
            </g>

            {/* Cute half-lidded cartoon eye peeking inside the 'D' of FIELD */}
            <g transform="translate(358, 117) rotate(-4)">
              <ellipse
                cx="0"
                cy="0"
                rx="12"
                ry="13.5"
                fill="#FFFFFF"
                stroke="#382110"
                strokeWidth="3.2"
              />
              <path
                d="M-11.5 -2 Q0 -14 11.5 -2 L11.5 -6 Q0 -15 -11.5 -6 Z"
                fill="#8BCE31"
              />
              <path
                d="M-11 -2 Q0 1 11 -2"
                stroke="#382110"
                strokeWidth="2.4"
                fill="none"
              />
              <circle cx="-2" cy="2.5" r="3.8" fill="#23160C" />
              <circle cx="-3.4" cy="1.1" r="1.3" fill="#FFFFFF" />
            </g>
          </svg>

          {/* Concise Fun Mission Pitch */}
          <p className="mt-5 text-xs sm:text-[13.5px] font-extrabold text-[#4B1C08] leading-snug text-balance max-w-[490px]">
            Hop in your courier van, race the shift clock, and keep the whole
            island smiling!
          </p>
        </div>

        {/* Row 2: Three Top-Tufted Game Objective Cards */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 items-stretch gap-3 text-center pt-1.5">
          {/* Card 1: Deliver Packages! */}
          <div className="relative rounded-[22px] bg-gradient-to-b from-[#DF682E] via-[#C84A1B] to-[#AE3911] border-[3px] border-[#7D240B] shadow-[inset_0_2px_0_rgba(255,190,145,0.5),inset_0_-4px_0_#8F2B0E,0_4px_0_rgba(72,22,6,0.3)] px-3.5 py-3 flex flex-col items-center justify-start gap-1.5">
            <svg
              viewBox="0 0 36 16"
              className="pointer-events-none absolute -top-[12px] left-1/2 -translate-x-1/2 w-8 h-3.5"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 16 L2 11 C9 10.5, 14 5.5, 18 2 C22 5.5, 27 10.5, 34 11 L34 16 Z"
                fill="#DF682E"
              />
              <path
                d="M2 11 C9 10.5, 14 5.5, 18 2 C22 5.5, 27 10.5, 34 11"
                stroke="#7D240B"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="w-10 h-10 rounded-full bg-gradient-to-b from-[#7BE0FF] to-[#2B89BA] border-[2.5px] border-[#5C230C] shadow-[inset_0_2px_0_rgba(255,255,255,0.55)] flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 36 36"
                className="w-7 h-7"
                fill="none"
                aria-hidden="true"
              >
                {/* Target Drop Ring + Golden Parcel */}
                <ellipse
                  cx="18"
                  cy="27"
                  rx="11"
                  ry="3.6"
                  fill="#6BF25C"
                  stroke="#4A200A"
                  strokeWidth="2"
                />
                <path
                  d="M18 5L8 10v11.5L18 27l10-5.5V10L18 5z"
                  fill="#FFB22E"
                  stroke="#5C230C"
                  strokeWidth="2.3"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 10l10 5 10-5M18 15v12"
                  stroke="#5C230C"
                  strokeWidth="2.1"
                />
                <path
                  d="M13.5 7.5l9.5 5"
                  stroke="#FFF59E"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div
              style={{ fontFamily: "'Skranji', 'Lilita One', cursive" }}
              className="text-[#FFF8E3] text-[15.5px] leading-tight font-bold drop-shadow-[0_2px_0_#6B1E08]"
            >
              Deliver Packages!
            </div>
            <p className="text-[#FFF6DE] text-[11.5px] leading-snug font-bold text-balance drop-shadow-[0_1.5px_0_rgba(74,20,5,0.85)]">
              Follow road arrows, obey signals, and toss parcels into customer
              rings!
            </p>
          </div>

          {/* Card 2: Score Big Points! */}
          <div className="relative rounded-[22px] bg-gradient-to-b from-[#DF682E] via-[#C84A1B] to-[#AE3911] border-[3px] border-[#7D240B] shadow-[inset_0_2px_0_rgba(255,190,145,0.5),inset_0_-4px_0_#8F2B0E,0_4px_0_rgba(72,22,6,0.3)] px-3.5 py-3 flex flex-col items-center justify-start gap-1.5">
            <svg
              viewBox="0 0 36 16"
              className="pointer-events-none absolute -top-[12px] left-1/2 -translate-x-1/2 w-8 h-3.5"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 16 L2 11 C9 10.5, 14 5.5, 18 2 C22 5.5, 27 10.5, 34 11 L34 16 Z"
                fill="#DF682E"
              />
              <path
                d="M2 11 C9 10.5, 14 5.5, 18 2 C22 5.5, 27 10.5, 34 11"
                stroke="#7D240B"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="w-10 h-10 rounded-full bg-gradient-to-b from-[#7BE0FF] to-[#2B89BA] border-[2.5px] border-[#5C230C] shadow-[inset_0_2px_0_rgba(255,255,255,0.55)] flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 36 36"
                className="w-7 h-7"
                fill="none"
                aria-hidden="true"
              >
                {/* Golden Coin + Combo Bolt */}
                <circle
                  cx="15"
                  cy="19"
                  r="9.5"
                  fill="#FFE338"
                  stroke="#5C230C"
                  strokeWidth="2.3"
                />
                <circle
                  cx="15"
                  cy="19"
                  r="6"
                  stroke="#E58C08"
                  strokeWidth="1.8"
                />
                <path
                  d="M25.5 5l-5.5 10h4.5L22 26l8.5-12h-4.6L25.5 5z"
                  fill="#FFF275"
                  stroke="#5C230C"
                  strokeWidth="2.1"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div
              style={{ fontFamily: "'Skranji', 'Lilita One', cursive" }}
              className="text-[#FFF8E3] text-[15.5px] leading-tight font-bold drop-shadow-[0_2px_0_#6B1E08]"
            >
              Score Big Points!
            </div>
            <p className="text-[#FFF6DE] text-[11.5px] leading-snug font-bold text-balance drop-shadow-[0_1.5px_0_rgba(74,20,5,0.85)]">
              Hit bullseyes for 2x Fever combos and collect coins for new vans
              &amp; toppers!
            </p>
          </div>

          {/* Card 3: Unlock New Levels! */}
          <div className="relative rounded-[22px] bg-gradient-to-b from-[#DF682E] via-[#C84A1B] to-[#AE3911] border-[3px] border-[#7D240B] shadow-[inset_0_2px_0_rgba(255,190,145,0.5),inset_0_-4px_0_#8F2B0E,0_4px_0_rgba(72,22,6,0.3)] px-3.5 py-3 flex flex-col items-center justify-start gap-1.5">
            <svg
              viewBox="0 0 36 16"
              className="pointer-events-none absolute -top-[12px] left-1/2 -translate-x-1/2 w-8 h-3.5"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 16 L2 11 C9 10.5, 14 5.5, 18 2 C22 5.5, 27 10.5, 34 11 L34 16 Z"
                fill="#DF682E"
              />
              <path
                d="M2 11 C9 10.5, 14 5.5, 18 2 C22 5.5, 27 10.5, 34 11"
                stroke="#7D240B"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="w-10 h-10 rounded-full bg-gradient-to-b from-[#7BE0FF] to-[#2B89BA] border-[2.5px] border-[#5C230C] shadow-[inset_0_2px_0_rgba(255,255,255,0.55)] flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 36 36"
                className="w-7 h-7"
                fill="none"
                aria-hidden="true"
              >
                {/* Golden Mastery Star + Island Pennant */}
                <path
                  d="M18 5.5l3.6 7.2 8 1.2-5.8 5.6 1.4 8-7.2-3.8-7.2 3.8 1.4-8-5.8-5.6 8-1.2L18 5.5z"
                  fill="#FFE63B"
                  stroke="#5C230C"
                  strokeWidth="2.3"
                  strokeLinejoin="round"
                />
                <circle cx="18" cy="18.5" r="2.6" fill="#FFF9C4" />
              </svg>
            </div>
            <div
              style={{ fontFamily: "'Skranji', 'Lilita One', cursive" }}
              className="text-[#FFF8E3] text-[15.5px] leading-tight font-bold drop-shadow-[0_2px_0_#6B1E08]"
            >
              Unlock New Levels!
            </div>
            <p className="text-[#FFF6DE] text-[11.5px] leading-snug font-bold text-balance drop-shadow-[0_1.5px_0_rgba(74,20,5,0.85)]">
              Finish every stop before time runs out to earn 3 stars and reach
              new islands!
            </p>
          </div>
        </div>

        {/* Row 3: Responsive Controls Row (Touch Pedals on Mobile, Keyboard on Desktop) */}
        <div className="relative z-10 flex sm:hidden items-center justify-center text-center text-[11.5px] font-extrabold text-[#4B1C08] -my-0.5">
          <span>
            <span className="text-[#9E2B0A]">Touch Pedals</span> Drive, Turn &amp; Brake ·{' '}
            <span className="text-[#9E2B0A]">Tap Parcel</span> Drop!
          </span>
        </div>
        <div className="relative z-10 hidden sm:flex flex-nowrap items-center justify-center gap-x-1.5 text-center text-xs font-extrabold text-[#4B1C08] whitespace-nowrap -my-0.5">
          <span>
            <span className="text-[#9E2B0A]">W/↑</span> Drive
          </span>
          <span aria-hidden="true" className="text-[#8B4C20]">
            ·
          </span>
          <span>
            <span className="text-[#9E2B0A]">S/↓</span> Brake
          </span>
          <span aria-hidden="true" className="text-[#8B4C20]">
            ·
          </span>
          <span>
            <span className="text-[#9E2B0A]">A/D</span> Turn
          </span>
          <span aria-hidden="true" className="text-[#8B4C20]">
            ·
          </span>
          <span>
            <span className="text-[#9E2B0A]">Space</span> Drop
          </span>
          <span aria-hidden="true" className="text-[#8B4C20]">
            ·
          </span>
          <span>
            <span className="text-[#9E2B0A]">Shift</span> Boost
          </span>
          <span aria-hidden="true" className="text-[#8B4C20]">
            ·
          </span>
          <span>
            <span className="text-[#9E2B0A]">Q</span> Horn
          </span>
          <span aria-hidden="true" className="text-[#8B4C20]">
            ·
          </span>
          <span>
            <span className="text-[#9E2B0A]">Esc</span> Pause
          </span>
        </div>

        {/* Row 4: Big Terracotta Speech-Tail Fun-Font Primary CTA Button (Distortion-Free on Mobile & Desktop) */}
        <button
          type="button"
          data-start="true"
          onClick={(e) => {
            e.currentTarget.blur();
            pokoAudio.playUiClick();
            onStart();
          }}
          className="group relative z-10 mt-1 w-full h-[64px] sm:h-[68px] rounded-[26px] bg-gradient-to-b from-[#F8843E] via-[#E85D25] to-[#CE4316] border-[3.5px] border-[#8B290D] shadow-[inset_0_3px_0_rgba(255,198,150,0.62),inset_0_-5px_0_#A33210,0_5px_0_rgba(88,28,8,0.38)] flex items-center justify-center cursor-pointer whitespace-nowrap transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:brightness-105 active:translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7A240B]"
        >
          {/* Fixed-aspect Top-Right Curved Speech Horn seamlessly fused onto button rim */}
          <svg
            viewBox="0 0 46 24"
            className="pointer-events-none absolute -top-[16px] right-7 sm:right-9 w-11 h-6"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2 23 L2 16 C14 16, 23 9.5, 29 2.5 C34 9.5, 38 15, 44 16 L44 23 Z"
              fill="#F8843E"
            />
            <path
              d="M2 15.5 C14 15.5, 23 9.5, 29 2.5 C34 9.5, 38 14.5, 44 15.5"
              stroke="#8B290D"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* Signature organic darker terracotta pebble spots */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-5 bottom-2.5 w-5 h-3 rounded-full bg-[#B73912]/55"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-12 bottom-3 w-2 h-2 rounded-full bg-[#B73912]/55"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-5 bottom-3.5 w-4 h-2.5 rounded-full bg-[#B73912]/55"
          />

          {/* Button Foreground: Sky-Blue Dispatch Emblem + Bouncy Cream Fun Font */}
          <span className="relative z-10 flex items-center justify-center gap-3">
            <svg
              viewBox="0 0 36 36"
              className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 drop-shadow-[0_2px_0_#7D240B]"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="18"
                cy="17"
                r="12"
                stroke="#6BD4FF"
                strokeWidth="3.2"
              />
              <circle
                cx="18"
                cy="17"
                r="7"
                stroke="#AEEBFF"
                strokeWidth="2.8"
              />
              <path
                d="M18 14 L22 30 L18 26.5 L14 30 Z"
                fill="#7BE0FF"
                stroke="#4D1D0A"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
            <span
              style={{ fontFamily: "'Skranji', 'Lilita One', cursive" }}
              className="text-[#FFF8E3] text-2xl sm:text-[30px] font-bold tracking-[0.06em] drop-shadow-[0_3px_0_#8B290D] group-hover:scale-[1.02] transition-transform"
            >
              START GAME
            </span>
          </span>
        </button>
      </div>
    </div>
  );
};

