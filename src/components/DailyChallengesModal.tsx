import React from 'react';
import { DailyChallengeTask } from '../types/game';
import { X, Check } from 'lucide-react';
import { sounds } from '../utils/audio';

interface DailyChallengesModalProps {
  isOpen: boolean;
  onClose: () => void;
  dateKey?: string;
  streakCount?: number;
  tasks: DailyChallengeTask[];
  onClaimTask: (taskId: string) => void;
  onStartTask: () => void;
  onOpenProfile: () => void;
  onRerollTasks?: () => void;
}

/**
 * Format YYYY-MM-DD into DD-MM-YYYY to match "12-11-2026" in the reference design
 */
function formatDisplayDate(rawDate?: string): string {
  const fallback = new Date().toISOString().slice(0, 10);
  const src = rawDate || fallback;
  const parts = src.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return src;
}

/**
 * Custom 3D Artwork Icons for each Daily Challenge card matching the reference image
 */
const ChallengeTaskArtwork: React.FC<{ type: string; index: number }> = ({ type, index }) => {
  // 1. Golden 3D Lightning Bolt (صَيْد الكلمات السريع)
  if (type === 'FIND_WORDS_IN_TIME' || type === 'FIND_TOTAL_WORDS' || index === 0) {
    return (
      <svg className="w-12 h-14 sm:w-14 sm:h-16 shrink-0 drop-shadow-[0_0_14px_rgba(250,204,21,0.55)]" viewBox="0 0 64 72">
        <defs>
          <linearGradient id="boltGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="45%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#ea580c" />
          </linearGradient>
        </defs>
        <polygon
          points="38,4 12,38 30,38 22,68 54,30 34,30"
          fill="url(#boltGold)"
          stroke="#fde047"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <polygon
          points="36,10 17,35 30,35 26,54 46,32 33,32"
          fill="#fef9c3"
          opacity="0.45"
        />
      </svg>
    );
  }

  // 2. 3D Blue Stopwatch with Golden Speed Lines (سرعة البرق)
  if (type === 'SPEED_45S' || type === 'EARN_THREE_STARS' || index === 1) {
    return (
      <svg className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 drop-shadow-[0_4px_12px_rgba(56,189,248,0.45)]" viewBox="0 0 76 68">
        <defs>
          <linearGradient id="watchRim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="50%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#1e3a8a" />
          </linearGradient>
          <radialGradient id="watchFace" cx="45%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="75%" stopColor="#e0f2fe" />
            <stop offset="100%" stopColor="#93c5fd" />
          </radialGradient>
        </defs>
        {/* Speed Motion Lines on Left */}
        <rect x="2" y="24" width="14" height="4" rx="2" fill="#f59e0b" />
        <rect x="6" y="33" width="12" height="4" rx="2" fill="#fbbf24" />
        <rect x="1" y="42" width="16" height="4" rx="2" fill="#ea580c" />

        {/* Top Stopwatch Button & Ring */}
        <rect x="41" y="5" width="10" height="5" rx="2" fill="#cbd5e1" stroke="#0f172a" strokeWidth="1.5" />
        <rect x="44" y="9" width="4" height="5" fill="#94a3b8" />
        {/* Side Angled Button */}
        <g transform="rotate(35 62 16)">
          <rect x="59" y="12" width="6" height="6" rx="1.5" fill="#38bdf8" stroke="#0f172a" strokeWidth="1.2" />
        </g>

        {/* Outer Blue Metallic Case */}
        <circle cx="46" cy="39" r="24" fill="url(#watchRim)" stroke="#082f49" strokeWidth="2.5" />
        {/* Inner White/Cyan Clock Face */}
        <circle cx="46" cy="39" r="18.5" fill="url(#watchFace)" stroke="#0284c7" strokeWidth="1.5" />

        {/* Red/Cyan Quarter Accent */}
        <path d="M46,23 A16,16 0 0,1 62,39 L46,39 Z" fill="#38bdf8" opacity="0.35" />

        {/* Clock Ticks */}
        <line x1="46" y1="22.5" x2="46" y2="25.5" stroke="#1e3a8a" strokeWidth="2" strokeLinecap="round" />
        <line x1="46" y1="52.5" x2="46" y2="55.5" stroke="#1e3a8a" strokeWidth="2" strokeLinecap="round" />
        <line x1="29.5" y1="39" x2="32.5" y2="39" stroke="#1e3a8a" strokeWidth="2" strokeLinecap="round" />
        <line x1="59.5" y1="39" x2="62.5" y2="39" stroke="#1e3a8a" strokeWidth="2" strokeLinecap="round" />

        {/* Clock Hands */}
        <line x1="46" y1="39" x2="46" y2="28" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="46" y1="39" x2="54" y2="43" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="46" cy="39" r="2.8" fill="#ef4444" />
      </svg>
    );
  }

  // 3. Red & White Bullseye Target with Golden Arrow (اعتمد على ذاتك)
  return (
    <svg className="w-13 h-13 sm:w-15 sm:h-15 shrink-0 drop-shadow-[0_4px_12px_rgba(239,68,68,0.45)]" viewBox="0 0 68 68">
      {/* Outer Red Ring */}
      <circle cx="32" cy="36" r="25" fill="#dc2626" stroke="#450a0a" strokeWidth="2.5" />
      {/* White Ring */}
      <circle cx="32" cy="36" r="18" fill="#f8fafc" />
      {/* Inner Red Ring */}
      <circle cx="32" cy="36" r="11" fill="#ef4444" />
      {/* Center White Bullseye */}
      <circle cx="32" cy="36" r="4.5" fill="#ffffff" />

      {/* Dart / Arrow Hitting Center from Top-Right */}
      <line x1="32" y1="36" x2="57" y2="11" stroke="#78350f" strokeWidth="3.5" strokeLinecap="round" />
      {/* Golden Arrow Feathers */}
      <polygon points="51,11 61,5 58,15" fill="#facc15" stroke="#713f12" strokeWidth="1" />
      <polygon points="54,14 64,8 57,18" fill="#eab308" stroke="#713f12" strokeWidth="1" />
      {/* Arrowhead tip shadow */}
      <circle cx="32" cy="36" r="2.2" fill="#0f172a" />
    </svg>
  );
};

/**
 * Stacked 3D Gold Coins Icon matching the left side of each challenge card
 */
const StackedCoinsIcon: React.FC = () => (
  <svg className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 drop-shadow" viewBox="0 0 36 36">
    <defs>
      <linearGradient id="coinGoldGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="50%" stopColor="#facc15" />
        <stop offset="100%" stopColor="#ca8a04" />
      </linearGradient>
    </defs>
    {/* Bottom Coin */}
    <ellipse cx="14" cy="26" rx="10" ry="5" fill="#b45309" />
    <ellipse cx="14" cy="24" rx="10" ry="5" fill="url(#coinGoldGrad)" stroke="#78350f" strokeWidth="1.2" />
    {/* Middle Coin */}
    <ellipse cx="16" cy="19" rx="10" ry="5" fill="#b45309" />
    <ellipse cx="16" cy="17" rx="10" ry="5" fill="url(#coinGoldGrad)" stroke="#78350f" strokeWidth="1.2" />
    {/* Top Coin */}
    <ellipse cx="14" cy="12" rx="10" ry="5" fill="#b45309" />
    <ellipse cx="14" cy="10" rx="10" ry="5" fill="url(#coinGoldGrad)" stroke="#78350f" strokeWidth="1.2" />
    {/* Front Tilted Coin */}
    <circle cx="25" cy="22" r="7.5" fill="url(#coinGoldGrad)" stroke="#78350f" strokeWidth="1.4" />
    <circle cx="25" cy="22" r="4.8" fill="none" stroke="#b45309" strokeWidth="1" />
  </svg>
);

/**
 * 3D Cyan/Blue Hexagon XP Badge Icon matching the left side of each challenge card
 */
const HexXPBadgeIcon: React.FC = () => (
  <svg className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]" viewBox="0 0 36 36">
    <defs>
      <linearGradient id="xpHexGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="55%" stopColor="#0284c7" />
        <stop offset="100%" stopColor="#1d4ed8" />
      </linearGradient>
    </defs>
    <polygon
      points="18,2 32,10 32,26 18,34 4,26 4,10"
      fill="url(#xpHexGrad)"
      stroke="#bae6fd"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <polygon
      points="18,5 29,11.5 29,24.5 18,31 7,24.5 7,11.5"
      fill="none"
      stroke="#0369a1"
      strokeWidth="1"
    />
    <text
      x="18"
      y="22"
      textAnchor="middle"
      fill="#ffffff"
      fontSize="11.5"
      fontWeight="900"
      fontFamily="Cairo, sans-serif"
    >
      XP
    </text>
  </svg>
);

export const DailyChallengesModal: React.FC<DailyChallengesModalProps> = ({
  isOpen,
  onClose,
  dateKey,
  streakCount = 1,
  tasks,
  onClaimTask,
  onStartTask,
  onOpenProfile,
  onRerollTasks
}) => {
  if (!isOpen) return null;

  const formattedDate = formatDisplayDate(dateKey);

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-[#010a12]/80 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-5 overflow-y-auto select-none"
    >
      {/* Main Neon Cyan-Bordered Panel matching the uploaded reference image */}
      <div
        className="relative w-full max-w-[600px] rounded-[30px] sm:rounded-[38px] overflow-hidden animate-in zoom-in-95 duration-200 my-auto"
        style={{
          background: 'linear-gradient(180deg, #062235 0%, #031521 45%, #020f18 100%)',
          border: '2.5px solid #38bdf8',
          boxShadow:
            '0 0 42px rgba(56, 189, 248, 0.45), inset 0 0 28px rgba(14, 165, 233, 0.22), 0 20px 60px rgba(0, 0, 0, 0.9)'
        }}
      >
        {/* Top Edge Bright Specular Glow */}
        <div
          className="pointer-events-none absolute inset-x-16 top-0 h-[3px] rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, #bae6fd 50%, transparent 100%)',
            boxShadow: '0 0 18px 3px #38bdf8'
          }}
        />
        {/* Bottom Edge Bright Specular Glow */}
        <div
          className="pointer-events-none absolute inset-x-16 bottom-0 h-[3px] rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, #bae6fd 50%, transparent 100%)',
            boxShadow: '0 0 18px 3px #38bdf8'
          }}
        />

        {/* ==================== 1. HEADER SECTION ==================== */}
        <div className="relative pt-4 sm:pt-6 pb-3 sm:pb-4 px-4 sm:px-6 overflow-hidden">
          {/* Top-Left Circular Close Button (in visual layout) */}
          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              onClose();
            }}
            className="absolute top-3.5 left-3.5 sm:top-5 sm:left-5 z-30 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#0d3349]/95 hover:bg-[#144763] active:scale-95 border border-[#5299be] shadow-[0_4px_14px_rgba(0,0,0,0.6)] flex items-center justify-center text-white transition-all cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 stroke-[3]" />
          </button>

          {/* Left Waving 3D Kuwait Flag Illustration */}
          <svg
            className="pointer-events-none absolute left-0 top-9 sm:top-10 w-32 sm:w-44 h-24 sm:h-28 z-10 opacity-95 drop-shadow-[0_6px_12px_rgba(0,0,0,0.7)]"
            viewBox="0 0 190 115"
            preserveAspectRatio="xMinYMid meet"
          >
            <defs>
              <linearGradient id="dcFlagG" x1="0" y1="0" x2="1" y2="0.2">
                <stop offset="0%" stopColor="#007a2f" />
                <stop offset="55%" stopColor="#00a843" />
                <stop offset="100%" stopColor="#006627" />
              </linearGradient>
              <linearGradient id="dcFlagW" x1="0" y1="0" x2="1" y2="0.2">
                <stop offset="0%" stopColor="#e2e8f0" />
                <stop offset="55%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#94a3b8" />
              </linearGradient>
              <linearGradient id="dcFlagR" x1="0" y1="0" x2="1" y2="0.2">
                <stop offset="0%" stopColor="#b91c1c" />
                <stop offset="55%" stopColor="#ef4444" />
                <stop offset="100%" stopColor="#7f1d1d" />
              </linearGradient>
            </defs>
            {/* Green Top Wave */}
            <path
              d="M0,26 Q48,14 95,28 T175,25 L155,48 Q105,52 60,42 T0,54 Z"
              fill="url(#dcFlagG)"
            />
            {/* White Middle Wave */}
            <path
              d="M0,54 Q52,38 100,48 T155,48 L138,70 Q92,70 48,62 T0,80 Z"
              fill="url(#dcFlagW)"
            />
            {/* Red Bottom Wave */}
            <path
              d="M0,80 Q48,60 95,68 T138,70 L118,90 Q75,86 35,96 T0,110 Z"
              fill="url(#dcFlagR)"
            />
            {/* Black Trapezoid on Left */}
            <polygon points="0,26 42,42 42,66 0,110" fill="#090d14" opacity="0.9" />
          </svg>

          {/* Right Glowing Blue Kuwait Towers & Skyline Illustration */}
          <svg
            className="pointer-events-none absolute right-1 top-1 sm:right-3 sm:top-2 w-28 sm:w-36 h-28 sm:h-32 z-10 opacity-95"
            viewBox="0 0 150 135"
          >
            <defs>
              <linearGradient id="dcTowerGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e0f2fe" />
                <stop offset="50%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#fde047" />
              </linearGradient>
              <radialGradient id="dcSkyAura" cx="55%" cy="75%" r="50%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.55" />
                <stop offset="65%" stopColor="#0284c7" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#031521" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="150" height="135" fill="url(#dcSkyAura)" />
            {/* Background City Silhouettes */}
            <g fill="#0c4a6e" opacity="0.85">
              <rect x="18" y="96" width="12" height="34" />
              <rect x="33" y="84" width="14" height="46" />
              <rect x="50" y="92" width="11" height="38" />
              <rect x="108" y="82" width="14" height="48" />
              <rect x="125" y="90" width="14" height="40" />
            </g>
            {/* Left Kuwait Tower */}
            <polygon points="62,24 66,130 58,130" fill="url(#dcTowerGlow)" />
            <circle cx="62" cy="82" r="9.5" fill="#0284c7" stroke="#bae6fd" strokeWidth="1.2" />
            <circle cx="62" cy="58" r="6" fill="#0369a1" stroke="#bae6fd" strokeWidth="1" />
            {/* Middle Needle */}
            <polygon points="77,46 80,130 74,130" fill="url(#dcTowerGlow)" />
            {/* Main Tall Right Kuwait Tower */}
            <polygon points="94,8 99,130 89,130" fill="url(#dcTowerGlow)" />
            <circle cx="94" cy="70" r="13" fill="#0284c7" stroke="#e0f2fe" strokeWidth="1.4" />
            <circle cx="94" cy="42" r="8" fill="#0369a1" stroke="#e0f2fe" strokeWidth="1.2" />
            {/* Bottom Golden Horizon Glow */}
            <ellipse cx="82" cy="130" rx="55" ry="6" fill="#fde047" opacity="0.45" />
          </svg>

          {/* Center Title + Gold Medal & Calendar Icons */}
          <div className="relative z-20 flex flex-col items-center text-center pt-1 sm:pt-1.5 px-8 sm:px-14">
            <div dir="ltr" className="flex items-center justify-center gap-1.5 sm:gap-2.5">
              {/* Left: Golden Calendar Checkmark Icon */}
              <svg className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 drop-shadow-[0_2px_8px_rgba(250,204,21,0.5)]" viewBox="0 0 40 40">
                <rect x="5" y="8" width="30" height="27" rx="5" fill="none" stroke="#facc15" strokeWidth="3.2" />
                <line x1="5" y1="16" x2="35" y2="16" stroke="#facc15" strokeWidth="3" />
                <line x1="13" y1="4" x2="13" y2="10" stroke="#facc15" strokeWidth="3.2" strokeLinecap="round" />
                <line x1="27" y1="4" x2="27" y2="10" stroke="#facc15" strokeWidth="3.2" strokeLinecap="round" />
                <polyline
                  points="14,24 18.5,28.5 27,19.5"
                  fill="none"
                  stroke="#facc15"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              {/* Center Arabic Title */}
              <h2
                dir="rtl"
                className="text-xl sm:text-[31px] font-black text-white tracking-tight leading-tight drop-shadow-[0_3px_10px_rgba(0,0,0,0.95)]"
              >
                التَّحَدِّيات اليَوميَّة (3 مَهام)
              </h2>

              {/* Right: Golden Ribbon Medal Icon */}
              <svg className="w-8 h-9 sm:w-10 sm:h-11 shrink-0 drop-shadow-[0_2px_8px_rgba(250,204,21,0.5)]" viewBox="0 0 40 44">
                <polygon points="13,24 8,41 16,37 19,42 21,26" fill="#eab308" />
                <polygon points="27,24 32,41 24,37 21,42 19,26" fill="#ca8a04" />
                <circle cx="20" cy="16" r="11" fill="#facc15" stroke="#fef08a" strokeWidth="2" />
                <circle cx="20" cy="16" r="6" fill="#a16207" />
              </svg>
            </div>

            {/* Subtitle */}
            <p className="text-xs sm:text-[15px] font-bold text-[#e2f1fa] mt-1.5 sm:mt-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              أكمل المهام اليومية للحصول على عملات وخبرة (XP) إضافية!
            </p>
          </div>

          {/* Glowing Cyan Horizontal Divider Line */}
          <div
            className="relative z-20 mt-3 sm:mt-4 h-[2px] w-full rounded-full"
            style={{
              background:
                'linear-gradient(90deg, rgba(56,189,248,0.05) 0%, rgba(56,189,248,0.85) 50%, rgba(56,189,248,0.05) 100%)',
              boxShadow: '0 0 12px rgba(56,189,248,0.75)'
            }}
          />
        </div>

        {/* ==================== 2. DATE & DAILY STREAK SUB-HEADER ==================== */}
        <div
          dir="ltr"
          className="px-4 sm:px-6 pb-3 flex flex-wrap items-center justify-between gap-2.5"
        >
          {/* Left Pill: Flame + "تتابع مهامك يومياً" */}
          <button
            type="button"
            onClick={() => {
              if (onRerollTasks) {
                sounds.playTap();
                onRerollTasks();
              }
            }}
            className="h-10 sm:h-11 px-4 sm:px-5 rounded-full bg-gradient-to-b from-[#332407] via-[#1f1604] to-[#120c02] hover:brightness-115 active:scale-95 border-[1.8px] border-[#eab308] shadow-[0_0_15px_rgba(234,179,8,0.25),inset_0_1px_2px_rgba(254,240,138,0.35)] flex items-center gap-2 transition-all cursor-pointer"
            title="اضغط لتجديد أو تتابع مهامك اليومية"
          >
            <span className="text-[#facc15] font-black text-xs sm:text-sm tracking-tight">
              تتابع مهامك يومياً {streakCount > 0 ? `(${streakCount} 🔥)` : ''}
            </span>
            {/* 3D Flame SVG */}
            <svg className="w-5 h-5 sm:w-6 sm:h-6 shrink-0 drop-shadow-[0_0_6px_rgba(249,115,22,0.8)]" viewBox="0 0 28 32">
              <path
                d="M15,2 C15,2 24,10 24,19 C24,25.5 19.5,30 14,30 C8.5,30 4,25.5 4,19 C4,14 7,9.5 9.5,7 C9.5,7 8.5,12 11.5,13.5 C10.5,9 15,2 15,2 Z"
                fill="#f97316"
              />
              <path
                d="M14,12 C14,12 19.5,16.5 19.5,21.5 C19.5,25.5 17,28.5 14,28.5 C11,28.5 8.5,25.5 8.5,21.5 C8.5,18 11,14.5 14,12 Z"
                fill="#facc15"
              />
            </svg>
          </button>

          {/* Right Pill: Date Badge + "تاريخ اليوم:" */}
          <div className="h-10 sm:h-11 rounded-full bg-[#061c2c] border border-[#2c6687] p-1 pl-1.5 pr-3.5 flex items-center gap-2.5 shadow-inner">
            {/* Inner Cyan Date Pill */}
            <div className="h-8 sm:h-8.5 px-3 sm:px-3.5 rounded-full bg-gradient-to-b from-[#0b3b59] to-[#062438] border border-[#38bdf8]/60 flex items-center justify-center shadow-[0_0_10px_rgba(56,189,248,0.25)]">
              <span className="font-mono font-black text-xs sm:text-sm text-[#22d3ee] tracking-wide tabular-nums">
                {formattedDate}
              </span>
            </div>

            <span dir="rtl" className="text-white font-black text-xs sm:text-sm">
              تاريخ اليوم:
            </span>

            {/* White Calendar Grid Icon */}
            <svg className="w-5 h-5 sm:w-5.5 sm:h-5.5 text-white shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="3" y="4" width="18" height="17" rx="3" />
              <line x1="8" y1="2" x2="8" y2="6" strokeLinecap="round" />
              <line x1="16" y1="2" x2="16" y2="6" strokeLinecap="round" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <circle cx="8" cy="13.5" r="1" fill="currentColor" />
              <circle cx="12" cy="13.5" r="1" fill="currentColor" />
              <circle cx="16" cy="13.5" r="1" fill="currentColor" />
              <circle cx="8" cy="17.5" r="1" fill="currentColor" />
              <circle cx="12" cy="17.5" r="1" fill="currentColor" />
              <circle cx="16" cy="17.5" r="1" fill="currentColor" />
            </svg>
          </div>
        </div>

        {/* ==================== 3. THREE DAILY CHALLENGE CARDS ==================== */}
        <div className="px-4 sm:px-6 space-y-3 sm:space-y-3.5 pb-4">
          {tasks.map((task, idx) => {
            const isCompleted = task.completed;
            const progressPct = Math.min(100, Math.round((task.current / Math.max(1, task.target)) * 100));

            return (
              <div
                key={task.id}
                dir="ltr"
                className="relative rounded-[22px] sm:rounded-[26px] p-3.5 sm:p-4 transition-all duration-200 overflow-hidden"
                style={
                  isCompleted
                    ? {
                        background:
                          'linear-gradient(90deg, #063d28 0%, #053322 50%, #042419 100%)',
                        border: '2px solid #22c55e',
                        boxShadow:
                          '0 0 22px rgba(34, 197, 94, 0.28), inset 0 1px 3px rgba(134, 239, 172, 0.35)'
                      }
                    : {
                        background:
                          'linear-gradient(90deg, #0b2b40 0%, #071f30 55%, #051624 100%)',
                        border: '2px solid #3b7da1',
                        boxShadow:
                          '0 6px 18px rgba(0, 0, 0, 0.45), inset 0 1px 2px rgba(186, 230, 253, 0.25)'
                      }
                }
              >
                <div className="flex items-center justify-between gap-3 sm:gap-4">
                  {/* LEFT COLUMN: Coins + XP Rewards & Action Button */}
                  <div className="flex flex-col items-center justify-between gap-2.5 shrink-0 pr-2 sm:pr-3 border-r border-white/10">
                    {/* Rewards Row: Coins + XP */}
                    <div className="flex items-center gap-2 sm:gap-3">
                      {/* Gold Coins */}
                      <div className="flex items-center gap-1">
                        <StackedCoinsIcon />
                        <span className="font-black text-base sm:text-xl text-[#facc15] tabular-nums drop-shadow">
                          +{task.rewardCoins}
                        </span>
                      </div>

                      {/* Cyan XP */}
                      <div className="flex items-center gap-1">
                        <HexXPBadgeIcon />
                        <span className="font-black text-base sm:text-xl text-[#22d3ee] tabular-nums drop-shadow">
                          +{task.rewardXP}
                        </span>
                      </div>
                    </div>

                    {/* Action Pill Button */}
                    {isCompleted ? (
                      task.claimed ? (
                        <div
                          dir="rtl"
                          className="w-36 sm:w-44 h-9 sm:h-10 rounded-full bg-gradient-to-b from-[#76e014] via-[#54b806] to-[#398600] border-2 border-[#bef264] shadow-[0_4px_14px_rgba(101,163,13,0.45),inset_0_1.5px_2px_rgba(255,255,255,0.6)] flex items-center justify-center gap-1.5 text-[#04180b] font-black text-xs sm:text-sm"
                        >
                          <Check className="w-4 h-4 stroke-[3.5]" />
                          <span>{idx === 0 ? 'تمت المكافأة' : 'مكتمل'}</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          dir="rtl"
                          onClick={() => onClaimTask(task.id)}
                          className="w-36 sm:w-44 h-9 sm:h-10 rounded-full bg-gradient-to-b from-[#8cf21b] via-[#65cc0a] to-[#459c00] hover:brightness-110 active:scale-95 border-2 border-[#d9f99d] shadow-[0_0_18px_rgba(132,204,22,0.65),inset_0_1.5px_2px_rgba(255,255,255,0.7)] flex items-center justify-center gap-1.5 text-[#04180b] font-black text-xs sm:text-sm animate-pulse cursor-pointer"
                        >
                          <Check className="w-4 h-4 stroke-[3.5]" />
                          <span>استلم المكافأة</span>
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        dir="rtl"
                        onClick={() => {
                          sounds.playTap();
                          onStartTask();
                        }}
                        className="w-36 sm:w-44 h-9 sm:h-10 rounded-full bg-gradient-to-b from-[#38bdf8] via-[#0284c7] to-[#0369a1] hover:brightness-110 active:scale-95 border-2 border-[#7dd3fc] shadow-[0_4px_14px_rgba(2,132,199,0.5),inset_0_1.5px_2px_rgba(255,255,255,0.55)] flex items-center justify-center gap-1.5 text-white font-black text-xs sm:text-sm transition-all cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                          <polygon points="6,4 20,12 6,20" />
                        </svg>
                        <span>ابدأ الآن</span>
                      </button>
                    )}
                  </div>

                  {/* RIGHT COLUMN: Title, Description, Icon & Progress Bar */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between gap-2.5">
                    <div className="flex items-center justify-end gap-3">
                      <div dir="rtl" className="text-right min-w-0">
                        <h3 className="text-base sm:text-xl font-black text-white leading-snug truncate drop-shadow">
                          {task.title}
                        </h3>
                        <p className="text-xs sm:text-sm font-bold text-[#d5e8f3] mt-0.5 line-clamp-1">
                          {task.description}
                        </p>
                      </div>

                      {/* 3D Task Artwork Icon */}
                      <ChallengeTaskArtwork type={task.type} index={idx} />
                    </div>

                    {/* Progress Bar Row */}
                    <div className="flex items-center gap-2.5 sm:gap-3 pt-0.5">
                      <span className="font-mono font-black text-xs sm:text-base text-white tabular-nums shrink-0">
                        {task.current} / {task.target}
                      </span>

                      <div className="flex-1 h-3 sm:h-3.5 rounded-full bg-[#03131e]/90 border border-white/20 p-[2px] shadow-inner overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${progressPct}%`,
                            background:
                              progressPct > 0
                                ? 'linear-gradient(90deg, #22c55e 0%, #4ade80 100%)'
                                : 'transparent',
                            boxShadow: progressPct > 0 ? '0 0 10px rgba(74, 222, 128, 0.8)' : 'none'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ==================== 4. BOTTOM GOLDEN PROFILE CTA BUTTON ==================== */}
        <div className="px-4 sm:px-6 pb-5 sm:pb-6 pt-1">
          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              onOpenProfile();
            }}
            className="w-full h-13 sm:h-15 rounded-full bg-gradient-to-b from-[#fde047] via-[#facc15] to-[#ca8a04] hover:brightness-105 active:scale-[0.99] border-[2.5px] border-[#fef08a] shadow-[0_6px_26px_rgba(250,204,21,0.45),inset_0_2px_3px_rgba(255,255,255,0.75)] flex items-center justify-center gap-3 text-[#090d14] font-black text-base sm:text-xl transition-all cursor-pointer"
          >
            {/* Profile Silhouette Icon */}
            <svg className="w-6 h-6 sm:w-7 sm:h-7 stroke-current shrink-0" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M5 20c0-3.8 3.1-6.5 7-6.5s7 2.7 7 6.5" />
            </svg>
            <span>عرض ملفي الشخصي والأوسمة المتاحة</span>
          </button>
        </div>
      </div>
    </div>
  );
};
