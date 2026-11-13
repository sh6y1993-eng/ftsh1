import React, { useEffect } from 'react';
import { RotateCcw, Home, Play, BookOpen, Timer, CheckCircle2, Flame } from 'lucide-react';
import { sounds } from '../utils/audio';
import confetti from 'canvas-confetti';
import { DailyChallengeTask } from '../types/game';

export interface MatchPlayerSummary {
  name: string;
  score: number;
  wordsCount: number;
  color?: string;
  roundWins?: number;
}

interface ResultsModalProps {
  stars: number;
  timeSpent: number;
  score: number;
  earnedXP: number;
  earnedCoins: number;
  levelUp?: boolean;
  levelNumber?: number;
  totalLevels?: number;
  wordsFoundCount?: number;
  totalWordsCount?: number;
  playerName?: string;
  winnerName?: string;
  isWinner?: boolean;
  categoryName?: string;
  matchPlayers?: MatchPlayerSummary[];
  bonusCoins?: number;
  totalXP?: number;
  streakReward?: { currentStreak: number; bonusCoins: number; longestStreak: number } | null;
  completedDailyTasks?: DailyChallengeTask[];
  hintsUsedCount?: number;
  primaryButtonLabel?: string;
  homeButtonLabel?: string;
  primaryButtonDisabled?: boolean;
  onNextLevel: () => void;
  onReplay: () => void;
  onExit: () => void;
  onHome?: () => void;
}

export const ResultsModal: React.FC<ResultsModalProps> = ({
  stars,
  timeSpent,
  score,
  earnedXP,
  earnedCoins,
  levelUp = false,
  levelNumber = 1,
  totalLevels = 4,
  wordsFoundCount = 5,
  totalWordsCount = 5,
  playerName,
  winnerName,
  isWinner = true,
  categoryName,
  matchPlayers = [],
  bonusCoins,
  totalXP,
  streakReward,
  completedDailyTasks = [],
  hintsUsedCount,
  primaryButtonLabel = 'المرحلة التالية',
  homeButtonLabel = 'الرئيسية',
  primaryButtonDisabled = false,
  onNextLevel,
  onReplay,
  onExit,
  onHome
}) => {
  useEffect(() => {
    try {
      confetti({
        particleCount: 95,
        spread: 85,
        origin: { y: 0.55 }
      });
    } catch {
      // safe
    }
  }, []);

  const formatTimeArabic = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (mins === 0) {
      return `${secs} ثانية`;
    }
    const minsLabel = mins === 1 ? 'دقيقة' : mins === 2 ? 'دقيقتين' : `${mins} دقائق`;
    return `${minsLabel} و ${secs} ثانية`;
  };

  // Dynamic calculation for Bonus Coins & Total XP row
  const dailyTasksCoins = completedDailyTasks.reduce((sum, t) => sum + (t.rewardCoins || 0), 0);
  const dailyTasksXP = completedDailyTasks.reduce((sum, t) => sum + (t.rewardXP || 0), 0);
  const streakCoins = streakReward?.bonusCoins || 0;

  const computedBonusCoins =
    typeof bonusCoins === 'number'
      ? bonusCoins
      : dailyTasksCoins + streakCoins > 0
      ? dailyTasksCoins + streakCoins
      : Math.max(25, stars * 55 + 25);

  const computedTotalXP =
    typeof totalXP === 'number'
      ? totalXP
      : earnedXP + dailyTasksXP + (stars >= 2 ? 70 : 35);

  const headerTitle = winnerName
    ? isWinner
      ? 'مبروك الفوز!'
      : `الفائز: ${winnerName}`
    : 'مبروك الفوز!';

  const subtitleName = winnerName || playerName;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#010b14]/88 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-5 overflow-y-auto select-none"
      dir="rtl"
    >
      <div className="relative w-full max-w-2xl my-auto pt-12 sm:pt-14">
        {/* ================================================================= */}
        {/* TOP SKYLINE SILHOUETTE + FLOATING CONFETTI BEHIND CARD            */}
        {/* ================================================================= */}
        <div className="pointer-events-none absolute -top-2 inset-x-4 h-28 z-0 overflow-visible">
          <svg viewBox="0 0 600 120" className="w-full h-full">
            <defs>
              <linearGradient id="vicTowerGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0.1" />
              </linearGradient>
            </defs>
            {/* Left Kuwait City Skyline */}
            <g fill="url(#vicTowerGlow)" opacity="0.75">
              <rect x="45" y="68" width="14" height="52" rx="1.5" />
              <rect x="64" y="55" width="18" height="65" rx="1.5" />
              <polygon points="90,35 98,18 106,35 106,120 90,120" />
              <rect x="114" y="60" width="20" height="60" rx="1.5" />
              <rect x="140" y="48" width="16" height="72" rx="1.5" />
              <rect x="162" y="72" width="15" height="48" rx="1.5" />
            </g>

            {/* Right Iconic 3 Kuwait Towers */}
            <g fill="url(#vicTowerGlow)" opacity="0.9">
              {/* Main Tower */}
              <polygon points="488,8 492,8 496,120 484,120" />
              <circle cx="490" cy="54" r="14" fill="#38bdf8" stroke="#bae6fd" strokeWidth="1.2" />
              <circle cx="490" cy="30" r="8.5" fill="#7dd3fc" stroke="#e0f2fe" strokeWidth="1" />
              {/* Middle Tower */}
              <polygon points="462,28 465,28 468,120 459,120" />
              <circle cx="463.5" cy="68" r="10" fill="#38bdf8" stroke="#bae6fd" strokeWidth="1" />
              {/* Needle Tower */}
              <polygon points="442,44 444,44 446,120 440,120" />
              <rect x="510" y="66" width="18" height="54" rx="1.5" opacity="0.65" />
              <rect x="534" y="78" width="14" height="42" rx="1.5" opacity="0.5" />
            </g>

            {/* Confetti Shapes */}
            <rect x="155" y="18" width="12" height="6" rx="2" fill="#facc15" transform="rotate(-25 155 18)" />
            <rect x="405" y="16" width="10" height="6" rx="2" fill="#f97316" transform="rotate(20 405 16)" />
            <rect x="440" y="22" width="13" height="6" rx="2" fill="#fde047" transform="rotate(-18 440 22)" />
            <circle cx="210" cy="24" r="3" fill="#34d399" />
          </svg>
        </div>

        {/* ================================================================= */}
        {/* TOP 3D GOLDEN CROWN + LAUREL BANNER «مبروك الفوز!»                 */}
        {/* ================================================================= */}
        <div className="absolute -top-3 inset-x-0 z-30 flex flex-col items-center pointer-events-none">
          {/* 3D Royal Golden Crown SVG */}
          <svg viewBox="0 0 140 75" className="w-24 sm:w-28 h-14 sm:h-16 -mb-3 drop-shadow-[0_6px_16px_rgba(250,204,21,0.55)]">
            <defs>
              <linearGradient id="crownGold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fef08a" />
                <stop offset="45%" stopColor="#facc15" />
                <stop offset="100%" stopColor="#ca8a04" />
              </linearGradient>
            </defs>
            <path
              d="M22,58 L14,24 L42,40 L70,12 L98,40 L126,24 L118,58 Z"
              fill="url(#crownGold)"
              stroke="#fef9c3"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <rect x="20" y="56" width="100" height="12" rx="5" fill="url(#crownGold)" stroke="#a16207" strokeWidth="1.5" />
            {/* Crown Pearls */}
            <circle cx="14" cy="20" r="4.5" fill="#fde047" stroke="#ca8a04" strokeWidth="1" />
            <circle cx="42" cy="24" r="3.5" fill="#fde047" />
            <circle cx="70" cy="8" r="5.5" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.2" />
            <circle cx="98" cy="24" r="3.5" fill="#fde047" />
            <circle cx="126" cy="20" r="4.5" fill="#fde047" stroke="#ca8a04" strokeWidth="1" />
            {/* Emerald Jewels */}
            <polygon points="70,32 76,40 70,48 64,40" fill="#10b981" stroke="#065f46" strokeWidth="1.2" />
            <circle cx="40" cy="46" r="3.5" fill="#10b981" />
            <circle cx="100" cy="46" r="3.5" fill="#10b981" />
          </svg>

          {/* Ribbon Banner with Golden Laurel Wreaths */}
          <div className="relative flex items-center justify-center">
            {/* Left Golden Laurel Wreath */}
            <svg viewBox="0 0 60 80" className="w-10 sm:w-12 h-14 sm:h-16 -ml-4 z-20 drop-shadow">
              <path
                d="M48,68 C22,58 14,35 28,10"
                fill="none"
                stroke="#facc15"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <ellipse cx="22" cy="52" rx="8" ry="4" transform="rotate(-35 22 52)" fill="#fde047" />
              <ellipse cx="18" cy="36" rx="8" ry="4" transform="rotate(-15 18 36)" fill="#facc15" />
              <ellipse cx="22" cy="20" rx="8" ry="4" transform="rotate(15 22 20)" fill="#fde047" />
              <ellipse cx="34" cy="46" rx="7" ry="3.5" transform="rotate(25 34 46)" fill="#eab308" />
              <ellipse cx="30" cy="30" rx="7" ry="3.5" transform="rotate(40 30 30)" fill="#facc15" />
            </svg>

            {/* Center Banner Plaque */}
            <div
              className="px-8 sm:px-12 py-2 sm:py-2.5 rounded-[26px] border-2 border-[#facc15] shadow-[0_6px_28px_rgba(250,204,21,0.4)] z-10"
              style={{
                background: 'linear-gradient(180deg, #102a3f 0%, #071624 100%)'
              }}
            >
              <h2
                className="text-2xl sm:text-4xl font-black text-white tracking-tight whitespace-nowrap"
                style={{
                  textShadow: '0 3px 10px rgba(0, 0, 0, 0.8), 0 0 16px rgba(250, 204, 21, 0.45)'
                }}
              >
                {headerTitle}
              </h2>
            </div>

            {/* Right Golden Laurel Wreath */}
            <svg viewBox="0 0 60 80" className="w-10 sm:w-12 h-14 sm:h-16 -mr-4 z-20 drop-shadow scale-x-[-1]">
              <path
                d="M48,68 C22,58 14,35 28,10"
                fill="none"
                stroke="#facc15"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <ellipse cx="22" cy="52" rx="8" ry="4" transform="rotate(-35 22 52)" fill="#fde047" />
              <ellipse cx="18" cy="36" rx="8" ry="4" transform="rotate(-15 18 36)" fill="#facc15" />
              <ellipse cx="22" cy="20" rx="8" ry="4" transform="rotate(15 22 20)" fill="#fde047" />
              <ellipse cx="34" cy="46" rx="7" ry="3.5" transform="rotate(25 34 46)" fill="#eab308" />
              <ellipse cx="30" cy="30" rx="7" ry="3.5" transform="rotate(40 30 30)" fill="#facc15" />
            </svg>
          </div>
        </div>

        {/* ================================================================= */}
        {/* MAIN NEON CYAN VICTORY PANEL                                      */}
        {/* ================================================================= */}
        <div
          className="relative z-10 rounded-[36px] px-4 sm:px-8 pt-14 sm:pt-16 pb-6 sm:pb-7 overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #072336 0%, #041624 55%, #03101b 100%)',
            border: '2.5px solid #38bdf8',
            boxShadow:
              '0 0 42px rgba(56, 189, 248, 0.4), inset 0 0 28px rgba(56, 189, 248, 0.16)'
          }}
        >
          {/* Left Waving Kuwait Flag Corner */}
          <div className="pointer-events-none absolute top-3 left-2 w-28 sm:w-36 h-20 opacity-95">
            <svg viewBox="0 0 180 110" className="w-full h-full drop-shadow-lg">
              <path d="M10,20 Q85,5 165,30 L155,50 Q80,25 18,40 Z" fill="#007A3D" />
              <path d="M18,40 Q80,25 155,50 L145,70 Q75,45 25,60 Z" fill="#FFFFFF" />
              <path d="M25,60 Q75,45 145,70 L135,90 Q70,65 32,82 Z" fill="#CE1126" />
              <polygon points="10,20 48,32 42,64 32,82" fill="#000000" />
            </svg>
          </div>

          {/* Right Waving Kuwait Flag Corner */}
          <div className="pointer-events-none absolute top-3 right-2 w-28 sm:w-36 h-20 opacity-95 scale-x-[-1]">
            <svg viewBox="0 0 180 110" className="w-full h-full drop-shadow-lg">
              <path d="M10,20 Q85,5 165,30 L155,50 Q80,25 18,40 Z" fill="#007A3D" />
              <path d="M18,40 Q80,25 155,50 L145,70 Q75,45 25,60 Z" fill="#FFFFFF" />
              <path d="M25,60 Q75,45 145,70 L135,90 Q70,65 32,82 Z" fill="#CE1126" />
              <polygon points="10,20 48,32 42,64 32,82" fill="#000000" />
            </svg>
          </div>

          {/* Subtitle with Dynamic Player / Match Name */}
          <div className="relative z-10 text-center mb-3">
            <p className="text-base sm:text-xl font-black text-white">
              <span className="text-[#facc15]">أحسنت{subtitleName ? ` يا ${subtitleName}` : ''}!</span>{' '}
              <span>لقد أكملت الجولة بنجاح 🎉</span>
            </p>
            {categoryName && (
              <span className="text-xs font-bold text-cyan-300 block mt-0.5">
                تصنيف: {categoryName}
              </span>
            )}
          </div>

          {/* 3 Large 3D Stars Row */}
          <div className="relative z-10 flex items-center justify-center gap-3 sm:gap-4 mb-2.5" dir="ltr">
            {[1, 2, 3].map(s => {
              const earned = s <= stars;
              return (
                <div
                  key={s}
                  className={`transition-transform duration-300 ${
                    earned ? 'scale-105 drop-shadow-[0_0_18px_rgba(250,204,21,0.75)]' : 'opacity-85'
                  }`}
                >
                  <svg viewBox="0 0 80 80" className="w-14 h-14 sm:w-18 sm:h-18">
                    <defs>
                      <linearGradient id={`starGrad_${s}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fef08a" />
                        <stop offset="50%" stopColor="#facc15" />
                        <stop offset="100%" stopColor="#d97706" />
                      </linearGradient>
                    </defs>
                    <polygon
                      points="40,6 50,27 73,30 56,46 61,69 40,58 19,69 24,46 7,30 30,27"
                      fill={earned ? `url(#starGrad_${s})` : '#0b1e2d'}
                      stroke={earned ? '#fef9c3' : '#eab308'}
                      strokeWidth="3"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              );
            })}
          </div>

          {/* 3-Star Criteria Explanation Badges (قواعد النجوم الثلاث) */}
          <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 mb-4 max-w-xl mx-auto px-2" dir="rtl">
            {/* Star 1: Complete Stage */}
            <div
              className="px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 shadow-sm border"
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                borderColor: 'rgba(52, 211, 153, 0.65)',
                color: '#6ee7b7'
              }}
              title="النجمة الأولى: إكمال المرحلة وحل جميع الكلمات بنجاح"
            >
              <span className="text-amber-300">⭐ ١</span>
              <span>إكمال المرحلة</span>
              <span className="text-emerald-400 font-bold">✓</span>
            </div>

            {/* Star 2: No Hints Used */}
            {(() => {
              const noHints = typeof hintsUsedCount === 'number' ? hintsUsedCount === 0 : true;
              return (
                <div
                  className={`px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 shadow-sm border transition-all ${
                    noHints
                      ? 'bg-emerald-950/40 border-emerald-400/60 text-emerald-300'
                      : 'bg-rose-950/30 border-rose-500/40 text-rose-300 line-through opacity-85'
                  }`}
                  title="النجمة الثانية: عدم استخدام أي وسيلة مساعدة (تلميح)"
                >
                  <span className="text-amber-300 no-underline">⭐ ٢</span>
                  <span>بدون مساعدة</span>
                  <span className={noHints ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {noHints ? '✓' : '✗'}
                  </span>
                </div>
              );
            })()}

            {/* Star 3: Finished in less than 1 minute */}
            {(() => {
              const underOneMinute = timeSpent < 60;
              return (
                <div
                  className={`px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 shadow-sm border transition-all ${
                    underOneMinute
                      ? 'bg-amber-950/40 border-amber-400/70 text-amber-200'
                      : 'bg-rose-950/30 border-rose-500/40 text-rose-300 line-through opacity-85'
                  }`}
                  title="النجمة الثالثة: إكمال المرحلة بأقل من دقيقة واحدة (أقل من 60 ثانية)"
                >
                  <span className="text-amber-300 no-underline">⭐ ٣</span>
                  <span>أقل من دقيقة</span>
                  <span className={underOneMinute ? 'text-amber-300 font-bold' : 'text-rose-400 font-bold'}>
                    {underOneMinute ? `✓ (${timeSpent}ث)` : `✗ (${timeSpent}ث)`}
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Level Up or Daily Streak Celebration Pill */}
          {(levelUp || streakReward) && (
            <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 mb-4">
              {levelUp && (
                <div className="px-3.5 py-1 rounded-full bg-amber-400/20 border border-amber-400/60 text-amber-300 text-xs font-black">
                  🎉 ارتقيت إلى مستوى جديد!
                </div>
              )}
              {streakReward && (
                <div className="px-3.5 py-1 rounded-full bg-orange-500/20 border border-orange-400/60 text-orange-200 text-xs font-black flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-orange-400 fill-orange-400" />
                  <span>
                    سلسلة التتابع اليومي: {streakReward.currentStreak} أيام متتالية (+{streakReward.bonusCoins} عملة!)
                  </span>
                </div>
              )}
            </div>
          )}

          {/* =============================================================== */}
          {/* ROW 1: GREEN NEON ROUND REWARDS BOX (🏆 مكافآت الجولة:)          */}
          {/* =============================================================== */}
          <div className="relative z-10 mt-3 mb-4">
            {/* Floating Tab Badge on Top-Right */}
            <div
              className="absolute -top-4 right-5 z-20 px-4 py-1 rounded-full flex items-center gap-2 text-xs sm:text-sm font-black text-white shadow-lg"
              style={{
                background: 'linear-gradient(180deg, #0c3b2e 0%, #06231b 100%)',
                border: '2px solid #34d399',
                boxShadow: '0 0 14px rgba(52, 211, 153, 0.45)'
              }}
            >
              <span>🏆</span>
              <span>مكافآت الجولة:</span>
            </div>

            <div
              className="w-full rounded-[26px] p-3.5 sm:p-4 pt-5"
              style={{
                background: 'linear-gradient(180deg, rgba(16, 85, 62, 0.55) 0%, rgba(6, 38, 29, 0.75) 100%)',
                border: '2px solid #34d399',
                boxShadow: '0 0 24px rgba(16, 185, 129, 0.3), inset 0 0 18px rgba(16, 185, 129, 0.18)'
              }}
            >
              <div className="rounded-2xl bg-[#041821]/90 border border-emerald-500/30 py-3 px-4 grid grid-cols-2 items-center divide-x divide-x-reverse divide-slate-700/80">
                {/* Right Half: Gold Coins / Points */}
                <div className="flex items-center justify-center gap-3 px-2">
                  {/* Stacked Gold Coins SVG */}
                  <svg viewBox="0 0 48 44" className="w-10 h-10 sm:w-11 sm:h-11 shrink-0 drop-shadow">
                    <ellipse cx="18" cy="32" rx="12" ry="5" fill="#d97706" />
                    <ellipse cx="18" cy="29" rx="12" ry="5" fill="#fbbf24" stroke="#fef08a" strokeWidth="1" />
                    <ellipse cx="18" cy="23" rx="12" ry="5" fill="#d97706" />
                    <ellipse cx="18" cy="20" rx="12" ry="5" fill="#facc15" stroke="#fef08a" strokeWidth="1" />
                    <circle cx="32" cy="26" r="11" fill="#f59e0b" stroke="#fef08a" strokeWidth="1.5" />
                    <circle cx="32" cy="26" r="7.5" fill="#fbbf24" />
                  </svg>
                  <div className="text-center leading-tight">
                    <div className="text-xl sm:text-2xl font-black text-[#facc15] tabular-nums" dir="ltr">
                      +{earnedCoins}
                    </div>
                    <div className="text-xs font-bold text-slate-200">نقطة</div>
                  </div>
                </div>

                {/* Left Half: Blue Hexagon XP */}
                <div className="flex items-center justify-center gap-3 px-2">
                  <div className="relative w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow">
                      <polygon
                        points="24,3 43,14 43,34 24,45 5,34 5,14"
                        fill="#0284c7"
                        stroke="#7dd3fc"
                        strokeWidth="2.5"
                      />
                    </svg>
                    <span className="absolute text-xs font-black text-white tracking-tighter">XP</span>
                  </div>
                  <div className="text-center leading-tight">
                    <div className="text-xl sm:text-2xl font-black text-[#38bdf8] tabular-nums" dir="ltr">
                      +{earnedXP} XP
                    </div>
                    <div className="text-xs font-bold text-slate-200">خبرة</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* =============================================================== */}
          {/* ROW 2: TWO-COLUMN STATS (Right: Stage/Time/Words, Left: Score)  */}
          {/* =============================================================== */}
          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-12 gap-3.5 mb-3.5">
            {/* Right Box (7 cols on sm): Match Details List */}
            <div
              className="sm:col-span-7 rounded-2xl p-3.5 sm:p-4 flex flex-col justify-center space-y-2.5 text-xs sm:text-sm"
              style={{
                background: 'rgba(6, 26, 42, 0.92)',
                border: '1.5px solid rgba(56, 189, 248, 0.35)'
              }}
            >
              {/* Row 1: Stage / Round */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/90">
                <div className="flex items-center gap-2 text-slate-200 font-bold">
                  <BookOpen className="w-4 h-4 text-cyan-300 shrink-0" />
                  <span>{matchPlayers.length > 0 ? 'الجولة:' : 'المرحلة:'}</span>
                </div>
                <span className="font-black text-white tabular-nums" dir="ltr">
                  {levelNumber} / {totalLevels}
                </span>
              </div>

              {/* Row 2: Time Spent */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/90">
                <div className="flex items-center gap-2 text-slate-200 font-bold">
                  <Timer className="w-4 h-4 text-cyan-300 shrink-0" />
                  <span>الوقت المستغرق:</span>
                </div>
                <span className="font-black text-white">{formatTimeArabic(timeSpent)}</span>
              </div>

              {/* Row 3: Correct Words */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-200 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>الكلمات الصحيحة:</span>
                </div>
                <span className="font-black text-white tabular-nums" dir="ltr">
                  {wordsFoundCount} / {totalWordsCount}
                </span>
              </div>
            </div>

            {/* Left Box (5 cols on sm): Total Score Card */}
            <div
              className="sm:col-span-5 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3"
              style={{
                background: 'rgba(6, 26, 42, 0.92)',
                border: '1.5px solid rgba(56, 189, 248, 0.35)'
              }}
            >
              <div className="text-right flex-1">
                <span className="text-xs sm:text-sm font-bold text-slate-200 block mb-1">
                  إجمالي النقاط:
                </span>
                <span className="text-3xl sm:text-4xl font-black text-[#facc15] tabular-nums tracking-tight">
                  {score}
                </span>
              </div>

              {/* Golden Trophy SVG */}
              <svg viewBox="0 0 64 64" className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 drop-shadow-[0_4px_12px_rgba(250,204,21,0.45)]">
                <path
                  d="M18,12 H46 V26 C46,36 39,42 32,42 C25,42 18,36 18,26 Z"
                  fill="#facc15"
                  stroke="#fef08a"
                  strokeWidth="2"
                />
                <path d="M18,16 H10 C10,26 13,30 18,30" fill="none" stroke="#eab308" strokeWidth="4" strokeLinecap="round" />
                <path d="M46,16 H54 C54,26 51,30 46,30" fill="none" stroke="#eab308" strokeWidth="4" strokeLinecap="round" />
                <rect x="28" y="42" width="8" height="9" fill="#eab308" />
                <rect x="20" y="51" width="24" height="6" rx="3" fill="#ca8a04" stroke="#fde047" strokeWidth="1" />
              </svg>
            </div>
          </div>

          {/* Dynamic Players Breakdown (Shown in Online 1v1 or Local Multiplayer) */}
          {matchPlayers.length > 0 && (
            <div
              className="relative z-10 rounded-2xl p-3 mb-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs"
              style={{
                background: 'rgba(4, 18, 30, 0.92)',
                border: '1.5px solid rgba(56, 189, 248, 0.3)'
              }}
            >
              {matchPlayers.map((mp, idx) => (
                <div
                  key={`${mp.name}_${idx}`}
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: mp.color || (idx === 0 ? '#38bdf8' : '#ec4899') }}
                    />
                    <span className="font-black text-white truncate">{mp.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 font-black">
                      صاد {mp.wordsCount} كلمات
                    </span>
                    <span className="font-black text-amber-400 tabular-nums">{mp.score} نقطة</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* =============================================================== */}
          {/* ROW 3: EXTRA BONUS COINS & TOTAL XP BAR                         */}
          {/* =============================================================== */}
          <div
            className="relative z-10 rounded-2xl py-2.5 px-4 mb-5 grid grid-cols-2 items-center divide-x divide-x-reverse divide-slate-700/80"
            style={{
              background: 'rgba(6, 26, 42, 0.92)',
              border: '1.5px solid rgba(56, 189, 248, 0.35)'
            }}
          >
            {/* Right Half: Extra Bonus Coins */}
            <div className="flex items-center justify-center gap-3 px-2">
              <svg viewBox="0 0 48 44" className="w-9 h-9 shrink-0 drop-shadow">
                <ellipse cx="18" cy="32" rx="12" ry="5" fill="#d97706" />
                <ellipse cx="18" cy="29" rx="12" ry="5" fill="#fbbf24" />
                <circle cx="31" cy="25" r="10" fill="#facc15" stroke="#fef08a" strokeWidth="1.2" />
              </svg>
              <div className="text-center leading-tight">
                <div className="text-lg sm:text-xl font-black text-[#facc15] tabular-nums" dir="ltr">
                  +{computedBonusCoins}
                </div>
                <div className="text-[11px] sm:text-xs font-bold text-slate-200">مكافأة إضافية</div>
              </div>
            </div>

            {/* Left Half: Total XP with Blue Ribbon Medal */}
            <div className="flex items-center justify-center gap-3 px-2">
              <svg viewBox="0 0 44 48" className="w-8 h-9 shrink-0 drop-shadow">
                <polygon points="15,28 10,45 18,40 22,46 24,28" fill="#0284c7" />
                <polygon points="29,28 34,45 26,40 22,46 20,28" fill="#0369a1" />
                <circle cx="22" cy="18" r="13" fill="#38bdf8" stroke="#bae6fd" strokeWidth="2" />
                <polygon
                  points="22,10 24.5,15 30,15.8 26,19.5 27,25 22,22.2 17,25 18,19.5 14,15.8 19.5,15"
                  fill="#ffffff"
                />
              </svg>
              <div className="text-center leading-tight">
                <div className="text-lg sm:text-xl font-black text-[#38bdf8] tabular-nums" dir="ltr">
                  +{computedTotalXP} XP
                </div>
                <div className="text-[11px] sm:text-xs font-bold text-slate-200">إجمالي الخبرة</div>
              </div>
            </div>
          </div>

          {/* =============================================================== */}
          {/* ROW 4: BOTTOM 3 ACTION PILL BUTTONS                             */}
          {/* =============================================================== */}
          <div className="relative z-10 grid grid-cols-12 gap-2.5 sm:gap-3.5 items-center">
            {/* Right Button (5 cols): Primary Golden Pill (المرحلة التالية) */}
            <button
              type="button"
              disabled={primaryButtonDisabled}
              onClick={() => {
                sounds.playTap();
                onNextLevel();
              }}
              className="col-span-5 h-13 sm:h-14 rounded-full font-black text-sm sm:text-lg text-[#071925] flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(250,204,21,0.5)] active:scale-95 transition-all cursor-pointer disabled:opacity-60"
              style={{
                background: 'linear-gradient(180deg, #fde047 0%, #facc15 55%, #ca8a04 100%)',
                border: '2px solid #fef9c3'
              }}
            >
              <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              <span className="truncate">{primaryButtonLabel}</span>
            </button>

            {/* Center Button (3 cols): Dark Teal Metallic Pill (إعادة) */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onReplay();
              }}
              className="col-span-3 h-13 sm:h-14 rounded-full font-black text-xs sm:text-base text-white flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer hover:brightness-110"
              style={{
                background: 'linear-gradient(180deg, #163d57 0%, #0a2236 100%)',
                border: '1.5px solid rgba(125, 211, 252, 0.55)',
                boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.25)'
              }}
            >
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
              <span>إعادة</span>
            </button>

            {/* Left Button (4 cols): Dark Teal Metallic Pill (الرئيسية) */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                if (onHome) {
                  onHome();
                } else {
                  onExit();
                }
              }}
              className="col-span-4 h-13 sm:h-14 rounded-full font-black text-xs sm:text-base text-white flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer hover:brightness-110"
              style={{
                background: 'linear-gradient(180deg, #163d57 0%, #0a2236 100%)',
                border: '1.5px solid rgba(125, 211, 252, 0.55)',
                boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.25)'
              }}
            >
              <Home className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
              <span className="truncate">{homeButtonLabel}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
