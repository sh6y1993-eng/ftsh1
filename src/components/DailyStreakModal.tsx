import React from 'react';
import { X, Check, ChevronLeft } from 'lucide-react';
import { sounds } from '../utils/audio';

interface DailyStreakModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStreak?: number;
  longestStreak?: number;
  completedToday?: boolean;
  nextBonusCoins?: number;
  onActionClick?: () => void;
}

export const DailyStreakModal: React.FC<DailyStreakModalProps> = ({
  isOpen,
  onClose,
  currentStreak = 2,
  longestStreak = 2,
  completedToday = false,
  nextBonusCoins = 110,
  onActionClick
}) => {
  if (!isOpen) return null;

  // The 7 days reward progression matching the design:
  // Day 1: 70+
  // Day 2: 90+
  // Day 3: 110+
  // Day 4: 130+
  // Day 5: 150+
  // Day 6: 170+
  // Day 7: 190+
  const daysData = [
    { day: 1, reward: 70, type: 'check' },
    { day: 2, reward: 90, type: 'check' },
    { day: 3, reward: 110, type: 'gold_gift' },
    { day: 4, reward: 130, type: 'blue_gift' },
    { day: 5, reward: 150, type: 'blue_gift' },
    { day: 6, reward: 170, type: 'purple_gift' },
    { day: 7, reward: 190, type: 'crown' }
  ];

  // Active / highlighted target day. If player has streak 2 and didn't complete today, target day is 3.
  const activeTargetDay = completedToday
    ? Math.min(7, currentStreak)
    : Math.min(7, Math.max(1, currentStreak + 1));

  const targetReward = daysData.find(d => d.day === activeTargetDay)?.reward ?? nextBonusCoins;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-[#010a12]/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto select-none"
      onClick={onClose}
    >
      {/* Outer Glow Container & Card */}
      <div
        className="relative w-full max-w-[620px] rounded-[32px] sm:rounded-[38px] overflow-hidden animate-in zoom-in-95 duration-200 my-auto text-center"
        style={{
          background: 'linear-gradient(180deg, #072235 0%, #031521 45%, #020f18 100%)',
          border: '2.5px solid #38bdf8',
          boxShadow:
            '0 0 45px rgba(56, 189, 248, 0.45), inset 0 0 30px rgba(14, 165, 233, 0.22), 0 24px 60px rgba(0, 0, 0, 0.95)'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top Edge Specular Neon Line */}
        <div
          className="pointer-events-none absolute inset-x-14 top-0 h-[3px] rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, #bae6fd 50%, transparent 100%)',
            boxShadow: '0 0 18px 3px #38bdf8'
          }}
        />

        {/* ========================================================================= */}
        {/* HEADER: Close Button + 3D Flag + Towers Skyline + Title + Flame           */}
        {/* ========================================================================= */}
        <div className="relative pt-4 sm:pt-6 pb-2 px-4 sm:px-6 overflow-hidden">
          {/* Top-Left Circular Close Button */}
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

          {/* Left Waving 3D Kuwait Flag SVG Illustration */}
          <svg
            className="pointer-events-none absolute left-0 top-7 sm:top-8 w-28 sm:w-36 h-20 sm:h-24 z-10 opacity-95 drop-shadow-[0_6px_12px_rgba(0,0,0,0.7)]"
            viewBox="0 0 190 115"
            preserveAspectRatio="xMinYMid meet"
          >
            <defs>
              <linearGradient id="streakFlagG" x1="0" y1="0" x2="1" y2="0.2">
                <stop offset="0%" stopColor="#007a2f" />
                <stop offset="55%" stopColor="#00a63e" />
                <stop offset="100%" stopColor="#005820" />
              </linearGradient>
              <linearGradient id="streakFlagW" x1="0" y1="0" x2="1" y2="0.2">
                <stop offset="0%" stopColor="#e2e8f0" />
                <stop offset="50%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#cbd5e1" />
              </linearGradient>
              <linearGradient id="streakFlagR" x1="0" y1="0" x2="1" y2="0.2">
                <stop offset="0%" stopColor="#be123c" />
                <stop offset="50%" stopColor="#e11d48" />
                <stop offset="100%" stopColor="#9f1239" />
              </linearGradient>
            </defs>
            {/* Green Wave */}
            <path d="M0,26 Q48,14 95,28 T175,25 L155,48 Q105,52 60,42 T0,54 Z" fill="url(#streakFlagG)" />
            {/* White Wave */}
            <path d="M0,54 Q52,38 100,48 T155,48 L138,70 Q92,70 48,62 T0,80 Z" fill="url(#streakFlagW)" />
            {/* Red Wave */}
            <path d="M0,80 Q48,60 95,68 T138,70 L118,90 Q75,86 35,96 T0,110 Z" fill="url(#streakFlagR)" />
            {/* Black Trapezoid */}
            <polygon points="0,26 42,42 42,66 0,110" fill="#090d14" opacity="0.9" />
          </svg>

          {/* Right Glowing Cyan Kuwait Towers & Skyline */}
          <svg
            className="pointer-events-none absolute right-1 top-1 sm:right-3 sm:top-2 w-28 sm:w-34 h-24 sm:h-28 z-10 opacity-95"
            viewBox="0 0 150 135"
          >
            <defs>
              <linearGradient id="streakTowerGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e0f2fe" />
                <stop offset="50%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#fde047" />
              </linearGradient>
              <radialGradient id="streakSkyAura" cx="55%" cy="75%" r="50%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.55" />
                <stop offset="65%" stopColor="#0284c7" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#031521" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="150" height="135" fill="url(#streakSkyAura)" />
            <g fill="#0c4a6e" opacity="0.85">
              <rect x="18" y="96" width="12" height="34" />
              <rect x="33" y="84" width="14" height="46" />
              <rect x="50" y="92" width="11" height="38" />
              <rect x="108" y="82" width="14" height="48" />
              <rect x="125" y="90" width="14" height="40" />
            </g>
            <polygon points="62,24 66,130 58,130" fill="url(#streakTowerGlow)" />
            <circle cx="62" cy="82" r="9.5" fill="#0284c7" stroke="#bae6fd" strokeWidth="1.2" />
            <circle cx="62" cy="58" r="6" fill="#0369a1" stroke="#bae6fd" strokeWidth="1" />
            <polygon points="77,46 80,130 74,130" fill="url(#streakTowerGlow)" />
          </svg>

          {/* Centered Golden Title with Calendar and 3D Flame */}
          <div className="relative z-20 flex items-center justify-center gap-2.5 sm:gap-3">
            {/* Calendar Check Icon */}
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-b from-[#ffd84d] to-[#d97706] p-[1.5px] shadow-[0_0_15px_rgba(250,204,21,0.5)] shrink-0">
              <div className="w-full h-full rounded-[10px] bg-[#0c2436] flex items-center justify-center">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-[#ffd524]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <polyline points="9 16 11 18 15 14" strokeWidth="3" />
                </svg>
              </div>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              سلسلة التتابع اليومي
            </h2>

            {/* Glowing 3D Flame */}
            <div className="relative w-8 h-8 sm:w-10 sm:h-10 shrink-0 flex items-center justify-center">
              <svg className="w-7 h-7 sm:w-9 sm:h-9 drop-shadow-[0_0_12px_rgba(249,115,22,0.9)]" viewBox="0 0 32 36">
                <path
                  d="M16,2 C16,2 27,11 27,21.5 C27,28.5 22,34 16,34 C10,34 5,28.5 5,21.5 C5,16 8.5,10.5 11.5,8 C11.5,8 10.5,13.5 14,15 C13,10 16,2 16,2 Z"
                  fill="url(#headerFlameGradOuter)"
                />
                <path
                  d="M16,13 C16,13 22,18 22,23.5 C22,28 19,31.5 16,31.5 C13,31.5 10,28 10,23.5 C10,19.5 13,15.5 16,13 Z"
                  fill="url(#headerFlameGradInner)"
                />
                <defs>
                  <linearGradient id="headerFlameGradOuter" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffedd5" />
                    <stop offset="35%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#dc2626" />
                  </linearGradient>
                  <linearGradient id="headerFlameGradInner" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="50%" stopColor="#fde047" />
                    <stop offset="100%" stopColor="#f97316" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* STATS HERO: 2 Cyan Glowing Cards with Golden Laurel Wreaths               */}
        {/* Right: السلسلة الحالية (Flame) | Left: أطول سلسلة (Trophy)                */}
        {/* ========================================================================= */}
        <div className="px-4 sm:px-6 pt-2 pb-3">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 max-w-[540px] mx-auto">
            {/* Right Card (in RTL): السلسلة الحالية */}
            <div
              className="relative rounded-2xl sm:rounded-3xl p-3 sm:p-4 text-center border-2"
              style={{
                background: 'linear-gradient(180deg, #072d47 0%, #041928 100%)',
                borderColor: '#0284c7',
                boxShadow: '0 0 20px rgba(2, 132, 199, 0.4), inset 0 0 12px rgba(56, 189, 248, 0.2)'
              }}
            >
              <span className="text-xs sm:text-sm font-black text-slate-200 block mb-1">
                السلسلة الحالية
              </span>

              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                {/* Right Laurel Wreath */}
                <svg className="w-5 h-8 sm:w-6 sm:h-10 text-[#facc15]" viewBox="0 0 24 40" fill="currentColor">
                  <path d="M12,2 C10,8 6,14 2,18 C6,19 11,16 13,10 Z M15,12 C14,18 10,24 5,28 C9,28 14,25 16,19 Z M18,22 C17,28 14,33 9,37 C13,36 17,33 19,27 Z" />
                </svg>

                {/* 3D Flame Icon */}
                <svg className="w-7 h-7 sm:w-9 sm:h-9 drop-shadow-[0_0_10px_rgba(249,115,22,0.85)]" viewBox="0 0 32 36">
                  <path
                    d="M16,2 C16,2 27,11 27,21.5 C27,28.5 22,34 16,34 C10,34 5,28.5 5,21.5 C5,16 8.5,10.5 11.5,8 C11.5,8 10.5,13.5 14,15 C13,10 16,2 16,2 Z"
                    fill="#f97316"
                  />
                  <path
                    d="M16,13 C16,13 22,18 22,23.5 C22,28 19,31.5 16,31.5 C13,31.5 10,28 10,23.5 C10,19.5 13,15.5 16,13 Z"
                    fill="#fde047"
                  />
                </svg>

                {/* Number & Unit */}
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-black text-[#facc15] tracking-tight">
                    {currentStreak}
                  </span>
                  <span className="text-base sm:text-lg font-black text-white">
                    أيام
                  </span>
                </div>

                {/* Left Laurel Wreath (Flipped) */}
                <svg className="w-5 h-8 sm:w-6 sm:h-10 text-[#facc15] scale-x-[-1]" viewBox="0 0 24 40" fill="currentColor">
                  <path d="M12,2 C10,8 6,14 2,18 C6,19 11,16 13,10 Z M15,12 C14,18 10,24 5,28 C9,28 14,25 16,19 Z M18,22 C17,28 14,33 9,37 C13,36 17,33 19,27 Z" />
                </svg>
              </div>
            </div>

            {/* Left Card (in RTL): أطول سلسلة */}
            <div
              className="relative rounded-2xl sm:rounded-3xl p-3 sm:p-4 text-center border-2"
              style={{
                background: 'linear-gradient(180deg, #072d47 0%, #041928 100%)',
                borderColor: '#0284c7',
                boxShadow: '0 0 20px rgba(2, 132, 199, 0.4), inset 0 0 12px rgba(56, 189, 248, 0.2)'
              }}
            >
              <span className="text-xs sm:text-sm font-black text-slate-200 block mb-1">
                أطول سلسلة
              </span>

              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                {/* Right Laurel Wreath */}
                <svg className="w-5 h-8 sm:w-6 sm:h-10 text-[#facc15]" viewBox="0 0 24 40" fill="currentColor">
                  <path d="M12,2 C10,8 6,14 2,18 C6,19 11,16 13,10 Z M15,12 C14,18 10,24 5,28 C9,28 14,25 16,19 Z M18,22 C17,28 14,33 9,37 C13,36 17,33 19,27 Z" />
                </svg>

                {/* Golden Trophy Cup */}
                <div className="w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center">
                  <svg className="w-6 h-6 sm:w-8 sm:h-8 drop-shadow-[0_0_10px_rgba(250,204,21,0.85)]" viewBox="0 0 48 48">
                    <path d="M14,10 H34 V20 C34,27 29,31 24,31 C19,31 14,27 14,20 Z" fill="#facc15" stroke="#ca8a04" strokeWidth="1.5" />
                    <path d="M14,13 H9 C9,20 11,23 14,23" fill="none" stroke="#eab308" strokeWidth="2.5" strokeLinecap="round" />
                    <path d="M34,13 H39 C39,20 37,23 34,23" fill="none" stroke="#eab308" strokeWidth="2.5" strokeLinecap="round" />
                    <rect x="21" y="31" width="6" height="7" fill="#eab308" />
                    <rect x="15" y="38" width="18" height="4" rx="2" fill="#ca8a04" />
                  </svg>
                </div>

                {/* Number & Unit */}
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-black text-[#38bdf8] tracking-tight">
                    {longestStreak}
                  </span>
                  <span className="text-base sm:text-lg font-black text-white">
                    أيام
                  </span>
                </div>

                {/* Left Laurel Wreath (Flipped) */}
                <svg className="w-5 h-8 sm:w-6 sm:h-10 text-[#facc15] scale-x-[-1]" viewBox="0 0 24 40" fill="currentColor">
                  <path d="M12,2 C10,8 6,14 2,18 C6,19 11,16 13,10 Z M15,12 C14,18 10,24 5,28 C9,28 14,25 16,19 Z M18,22 C17,28 14,33 9,37 C13,36 17,33 19,27 Z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Motivational Sparkle Subtitle */}
        <div className="px-4 sm:px-6 py-2 flex items-center justify-center gap-2">
          {/* Sparkle Icon */}
          <svg className="w-4 h-4 text-[#facc15] shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12,2 L14.5,9.5 L22,12 L14.5,14.5 L12,22 L9.5,14.5 L2,12 L9.5,9.5 Z" />
          </svg>
          <p className="text-xs sm:text-sm font-black text-white leading-relaxed">
            سجّل دخولك يومياً للحفاظ على سلسلة التتابع والحصول على مكافآت إضافية كل يوم!
          </p>
          <svg className="w-4 h-4 text-[#facc15] shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12,2 L14.5,9.5 L22,12 L14.5,14.5 L12,22 L9.5,14.5 L2,12 L9.5,9.5 Z" />
          </svg>
        </div>

        {/* ========================================================================= */}
        {/* 7-DAY PROGRESSION TRACK (Days 1 -> 7)                                     */}
        {/* ========================================================================= */}
        <div className="px-3 sm:px-6 py-3">
          {/* Outer Rounded Container with Neon Border */}
          <div
            className="relative rounded-2xl sm:rounded-3xl p-3 sm:p-4 border"
            style={{
              background: 'linear-gradient(180deg, #051a2a 0%, #03101c 100%)',
              borderColor: '#0284c7',
              boxShadow: 'inset 0 0 16px rgba(2, 132, 199, 0.3)'
            }}
          >
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
              {daysData.map(item => {
                const isCompleted = item.day <= currentStreak;
                const isTarget = item.day === activeTargetDay;

                return (
                  <div key={item.day} className="relative flex flex-col items-center">
                    {/* Top Yellow Down-Arrow Pointer for the Current Target Day */}
                    {isTarget && (
                      <div className="absolute -top-3 sm:-top-3.5 z-20 animate-bounce">
                        <svg className="w-4 h-3 sm:w-5 sm:h-3.5 text-[#facc15]" viewBox="0 0 16 12" fill="currentColor">
                          <polygon points="8,12 0,0 16,0" />
                        </svg>
                      </div>
                    )}

                    {/* Day Card */}
                    <div
                      className={`w-full rounded-xl sm:rounded-2xl p-1.5 sm:p-2.5 flex flex-col items-center justify-between transition-all min-h-[96px] sm:min-h-[118px] border-2 ${
                        isTarget
                          ? 'border-[#facc15] shadow-[0_0_20px_rgba(250,204,21,0.65),inset_0_0_12px_rgba(250,204,21,0.3)] bg-gradient-to-b from-[#3a2804] to-[#1a1202]'
                          : isCompleted
                          ? 'border-[#10b981] shadow-[0_0_14px_rgba(16,185,129,0.4)] bg-gradient-to-b from-[#063324] to-[#021811]'
                          : 'border-[#0c4a6e] bg-gradient-to-b from-[#08263d] to-[#031321]'
                      }`}
                    >
                      {/* Day Label */}
                      <span className="text-[11px] sm:text-xs font-black text-white">
                        اليوم {item.day}
                      </span>

                      {/* Icon Section */}
                      <div className="my-auto flex items-center justify-center">
                        {isCompleted ? (
                          /* Green Check Circle */
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-500/25 border-2 border-[#10b981] flex items-center justify-center shadow-[0_0_10px_#10b981]">
                            <Check className="w-4 h-4 sm:w-5 sm:h-5 text-[#34d399] stroke-[3.5]" />
                          </div>
                        ) : item.type === 'gold_gift' ? (
                          /* Golden 3D Gift Box */
                          <svg className="w-8 h-8 sm:w-10 sm:h-10 drop-shadow-[0_0_8px_rgba(250,204,21,0.7)]" viewBox="0 0 40 40">
                            <defs>
                              <linearGradient id="goldBox" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#fde047" />
                                <stop offset="50%" stopColor="#eab308" />
                                <stop offset="100%" stopColor="#a16207" />
                              </linearGradient>
                            </defs>
                            <rect x="8" y="14" width="24" height="20" rx="3" fill="url(#goldBox)" stroke="#ca8a04" strokeWidth="1" />
                            <rect x="6" y="10" width="28" height="6" rx="2" fill="#fef08a" stroke="#ca8a04" strokeWidth="1" />
                            <rect x="18" y="10" width="4" height="24" fill="#ffffff" opacity="0.8" />
                            {/* Ribbon Bow */}
                            <ellipse cx="16" cy="8" rx="4" ry="2.5" fill="#fef08a" />
                            <ellipse cx="24" cy="8" rx="4" ry="2.5" fill="#fef08a" />
                            <circle cx="20" cy="9" r="2" fill="#eab308" />
                          </svg>
                        ) : item.type === 'blue_gift' ? (
                          /* Blue 3D Gift Box */
                          <svg className="w-8 h-8 sm:w-10 sm:h-10 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]" viewBox="0 0 40 40">
                            <defs>
                              <linearGradient id="blueBox" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#38bdf8" />
                                <stop offset="50%" stopColor="#0284c7" />
                                <stop offset="100%" stopColor="#0369a1" />
                              </linearGradient>
                            </defs>
                            <rect x="8" y="14" width="24" height="20" rx="3" fill="url(#blueBox)" stroke="#0284c7" strokeWidth="1" />
                            <rect x="6" y="10" width="28" height="6" rx="2" fill="#bae6fd" stroke="#0284c7" strokeWidth="1" />
                            <rect x="18" y="10" width="4" height="24" fill="#ffffff" opacity="0.85" />
                            <ellipse cx="16" cy="8" rx="4" ry="2.5" fill="#bae6fd" />
                            <ellipse cx="24" cy="8" rx="4" ry="2.5" fill="#bae6fd" />
                            <circle cx="20" cy="9" r="2" fill="#38bdf8" />
                          </svg>
                        ) : item.type === 'purple_gift' ? (
                          /* Purple 3D Gift Box */
                          <svg className="w-8 h-8 sm:w-10 sm:h-10 drop-shadow-[0_0_8px_rgba(192,132,252,0.7)]" viewBox="0 0 40 40">
                            <defs>
                              <linearGradient id="purpleBox" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#c084fc" />
                                <stop offset="50%" stopColor="#9333ea" />
                                <stop offset="100%" stopColor="#6b21a8" />
                              </linearGradient>
                            </defs>
                            <rect x="8" y="14" width="24" height="20" rx="3" fill="url(#purpleBox)" stroke="#9333ea" strokeWidth="1" />
                            <rect x="6" y="10" width="28" height="6" rx="2" fill="#facc15" stroke="#ca8a04" strokeWidth="1" />
                            <rect x="18" y="10" width="4" height="24" fill="#facc15" />
                            <ellipse cx="16" cy="8" rx="4" ry="2.5" fill="#fef08a" />
                            <ellipse cx="24" cy="8" rx="4" ry="2.5" fill="#fef08a" />
                            <circle cx="20" cy="9" r="2" fill="#ca8a04" />
                          </svg>
                        ) : (
                          /* Day 7 Golden Crown */
                          <svg className="w-8 h-8 sm:w-10 sm:h-10 drop-shadow-[0_0_10px_rgba(250,204,21,0.9)]" viewBox="0 0 40 40">
                            <defs>
                              <linearGradient id="crownGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#fffbeb" />
                                <stop offset="40%" stopColor="#facc15" />
                                <stop offset="100%" stopColor="#ca8a04" />
                              </linearGradient>
                            </defs>
                            <path
                              d="M6,28 L8,15 L14,21 L20,10 L26,21 L32,15 L34,28 Z"
                              fill="url(#crownGrad)"
                              stroke="#ca8a04"
                              strokeWidth="1.2"
                            />
                            <rect x="6" y="27" width="28" height="4.5" rx="2" fill="#eab308" stroke="#ca8a04" strokeWidth="1" />
                            {/* Crown Jewels */}
                            <circle cx="20" cy="29.2" r="1.3" fill="#38bdf8" />
                            <circle cx="12" cy="29.2" r="1.1" fill="#ec4899" />
                            <circle cx="28" cy="29.2" r="1.1" fill="#10b981" />
                            {/* Crown Tips Balls */}
                            <circle cx="8" cy="14" r="1.3" fill="#fef08a" />
                            <circle cx="20" cy="9" r="1.5" fill="#fef08a" />
                            <circle cx="32" cy="14" r="1.3" fill="#fef08a" />
                          </svg>
                        )}
                      </div>

                      {/* Coins Reward Pill */}
                      <div className="flex items-center justify-center gap-1 mt-1">
                        {/* Coin Stack SVG */}
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 drop-shadow" viewBox="0 0 20 20">
                          <ellipse cx="10" cy="15" rx="7" ry="2.5" fill="#ca8a04" />
                          <ellipse cx="10" cy="13" rx="7" ry="2.5" fill="#eab308" />
                          <ellipse cx="10" cy="11" rx="7" ry="2.5" fill="#ca8a04" />
                          <ellipse cx="10" cy="9" rx="7" ry="2.5" fill="#facc15" />
                          <ellipse cx="10" cy="7" rx="7" ry="2.5" fill="#fef08a" />
                        </svg>
                        <span
                          dir="ltr"
                          className={`text-[11px] sm:text-xs font-black tabular-nums ${
                            isCompleted ? 'text-white' : 'text-[#facc15]'
                          }`}
                        >
                          +{item.reward}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* BOTTOM BIG GOLDEN ACTION BUTTON                                           */}
        {/* ========================================================================= */}
        <div className="px-4 sm:px-6 pt-2 pb-5 sm:pb-6">
          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              if (onActionClick) {
                onActionClick();
              } else {
                onClose();
              }
            }}
            className="w-full h-14 sm:h-16 rounded-full bg-gradient-to-r from-[#ffe033] via-[#ffcc00] to-[#e69900] hover:brightness-105 active:scale-[0.98] transition-all px-4 sm:px-6 flex items-center justify-between shadow-[0_10px_28px_rgba(255,204,0,0.45),inset_0_2px_4px_rgba(255,255,255,0.7)] border-2 border-[#fff380] cursor-pointer"
          >
            {/* Left: 3D Stack of Gold Coins */}
            <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 flex items-center justify-center drop-shadow-md">
              <svg className="w-full h-full" viewBox="0 0 48 48">
                <defs>
                  <linearGradient id="bigCoinFace" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fffbeb" />
                    <stop offset="30%" stopColor="#fde047" />
                    <stop offset="100%" stopColor="#d97706" />
                  </linearGradient>
                </defs>
                {/* Back coin */}
                <ellipse cx="28" cy="22" rx="14" ry="7" fill="#b45309" />
                <ellipse cx="28" cy="20" rx="14" ry="7" fill="url(#bigCoinFace)" stroke="#78350f" strokeWidth="1" />
                <ellipse cx="28" cy="20" rx="9" ry="4.5" fill="none" stroke="#ca8a04" strokeWidth="1.2" />
                {/* Front coin */}
                <ellipse cx="18" cy="30" rx="15" ry="7.5" fill="#92400e" />
                <ellipse cx="18" cy="27" rx="15" ry="7.5" fill="url(#bigCoinFace)" stroke="#78350f" strokeWidth="1" />
                <ellipse cx="18" cy="27" rx="10" ry="5" fill="none" stroke="#ca8a04" strokeWidth="1.2" />
              </svg>
            </div>

            {/* Middle: Text with dynamic points */}
            <span className="text-[#3b2400] font-black text-base sm:text-xl tracking-tight flex-1 text-center">
              {completedToday
                ? `أكملت تسجيل اليوم! عُد غداً لتربح +${targetReward} نقطة!`
                : `لا تفوّت تسجيل دخولك غداً واربح +${targetReward} نقطة!`}
            </span>

            {/* Right: Golden Chevron Arrow */}
            <div className="w-8 h-8 rounded-full bg-[#3b2400]/10 flex items-center justify-center shrink-0">
              <ChevronLeft className="w-6 h-6 text-[#3b2400] stroke-[3.5]" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
