import React, { useState } from 'react';
import { PlayerProfile, ScreenState, FriendProfileSummary } from '../types/game';
import { Bell, Plus, X, Sparkles, Flame, Users, UserPlus } from 'lucide-react';
import { DailyChallengesModal } from '../components/DailyChallengesModal';
import { DailyStreakModal } from '../components/DailyStreakModal';
import { FriendsModal } from '../components/FriendsModal';
import { StoreModal } from '../components/StoreModal';
import { getNameGlowClass } from '../engine/gameCategories';
import { sounds } from '../utils/audio';

interface HomeScreenProps {
  user: PlayerProfile | null;
  onNavigate: (screen: ScreenState) => void;
  onStartCategory: (categoryId: string) => void;
  onUpdateUser?: (user: PlayerProfile) => void;
  onJoinFriendRoom?: (roomCode: string) => void;
  onInviteFriendToNewPrivateRoom?: (friend: FriendProfileSummary) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  user,
  onNavigate,
  onUpdateUser,
  onJoinFriendRoom,
  onInviteFriendToNewPrivateRoom
}) => {
  const [activeModal, setActiveModal] = useState<'STORE' | 'MISSIONS' | 'NOTIFICATIONS' | 'STREAK' | 'FRIENDS' | null>(null);

  const displayName = user?.displayName?.split(' ')[0] || 'لاعب';
  const displayLevel = user?.level ?? 1;
  const displayCoins = user?.coins ?? 100;
  const displayGems = user?.hintsRemaining ?? 5;
  const currentXP = user?.xp ?? 0;
  const targetXP = displayLevel * 300;
  const xpInCurrentLevel = currentXP % 300;
  const xpPercent = Math.min(100, Math.round((xpInCurrentLevel / 300) * 100));

  // Daily Streak Tracking State
  const currentStreak = user?.dailyStreak?.currentStreak ?? 1;
  const longestStreak = user?.dailyStreak?.longestStreak ?? Math.max(1, currentStreak);
  const completedToday = user?.dailyStreak?.completedToday ?? false;
  const todayBonusCoins = user?.dailyStreak?.todayBonusCoins ?? 0;
  const nextBonusCoins = user?.dailyStreak?.nextBonusCoins ?? (50 + Math.min(currentStreak + 1, 14) * 20);

  const dailyTasks = user?.dailyChallenges?.tasks || [
    {
      id: 'dc_find_5_in_3m',
      type: 'FIND_WORDS_IN_TIME' as const,
      title: 'صَيْد الكلمات السريع',
      description: 'اختر 5 كلمات في أقل من 3 دقائق',
      current: 0,
      target: 5,
      timeLimitSeconds: 180,
      rewardCoins: 150,
      rewardXP: 120,
      completed: false,
      claimed: false
    },
    {
      id: 'dc_speed_45s',
      type: 'SPEED_45S' as const,
      title: 'سرعة البرق',
      description: 'أكمل مرحلة في أقل من 45 ثانية',
      current: 0,
      target: 1,
      timeLimitSeconds: 45,
      rewardCoins: 250,
      rewardXP: 200,
      completed: false,
      claimed: false
    },
    {
      id: 'dc_no_hints',
      type: 'NO_HINTS_STAGE' as const,
      title: 'اعتمد على ذاتك',
      description: 'أكمل مرحلة كاملة بدون استخدام أي تلميح',
      current: 0,
      target: 1,
      rewardCoins: 175,
      rewardXP: 140,
      completed: false,
      claimed: false
    }
  ];

  const handleClaimDailyTask = async (taskId: string) => {
    if (!user) return;
    sounds.playTap();
    try {
      const res = await fetch('/api/daily-challenges/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, taskId })
      });
      const data = await res.json();
      if (data.success && data.user && onUpdateUser) {
        sounds.playVictory();
        onUpdateUser(data.user);
      }
    } catch {
      // ignore
    }
  };

  const handleRerollDailyTasks = async () => {
    if (!user) return;
    sounds.playTap();
    try {
      const res = await fetch('/api/daily-challenges/reroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username })
      });
      const data = await res.json();
      if (data.success && data.user && onUpdateUser) {
        onUpdateUser(data.user);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div
      dir="rtl"
      className="safe-screen fixed inset-0 z-40 w-full h-dvh bg-[#021521] flex flex-col justify-between overflow-y-auto overflow-x-hidden select-none"
    >
      {/* Ambient dark navy-teal background for all device viewports */}
      <div
        className="fixed inset-0 bg-cover bg-center scale-110 blur-3xl opacity-30 pointer-events-none"
        style={{
          backgroundImage: `url('/assets/images/login_kuwaiti_mascot_1794483388654.jpg')`
        }}
      />
      <div className="fixed inset-0 bg-gradient-to-b from-[#031d2e]/85 via-[#021420]/95 to-[#010d15] pointer-events-none" />

      {/* Main Responsive Game Hub Container adapting to phone models, tablets, laptops & TVs */}
      <div className="relative z-10 w-full flex-1 flex flex-col justify-between bg-gradient-to-b from-[#031d2d]/90 via-[#031826]/95 to-[#02121d]">
        
        {/* 1. Top Status Bar (Gems on Right, Coins in Center, Bell & Friends on Left) */}
        <div dir="ltr" className="relative z-20 w-full max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-8 pt-4 pb-2 gap-2">
          {/* Left: Notification Bell & Friends Circles */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                setActiveModal('NOTIFICATIONS');
              }}
              className="w-11 h-11 rounded-full bg-[#092b3e]/90 hover:bg-[#0d3850] border border-[#22506a] flex items-center justify-center text-white shadow-md active:scale-95 transition-all cursor-pointer"
              title="الإشعارات"
            >
              <Bell className="w-5 h-5 fill-white text-white" />
            </button>

            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                setActiveModal('FRIENDS');
              }}
              className="relative h-11 px-3.5 rounded-full bg-[#092b3e]/95 hover:bg-[#0d3850] border border-sky-400/55 flex items-center gap-1.5 text-white shadow-md active:scale-95 transition-all cursor-pointer"
              title="الأصدقاء والدعوات المباشرة"
            >
              <Users className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-black hidden sm:inline">الأصدقاء</span>
              <span className="w-2 h-2 rounded-full bg-lime-400 animate-pulse" />
            </button>
          </div>

          {/* Center: Gold Coins Pill */}
          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              setActiveModal('STORE');
            }}
            className="flex items-center gap-2 bg-[#072232]/95 hover:bg-[#0b2d42] border border-[#234e67] rounded-full px-2 py-1 shadow-md active:scale-95 transition-all cursor-pointer"
          >
            {/* Gold Coin Icon */}
            <div className="w-7 h-7 rounded-full bg-gradient-to-b from-[#ffd84d] to-[#e08b00] border-2 border-[#fff1a8] shadow-inner flex items-center justify-center">
              <div className="w-4 h-4 rounded-full border border-[#b86e00]/60 bg-[#ffbf1a]" />
            </div>
            <span className="font-extrabold text-[#ffd524] text-base sm:text-lg tracking-tight tabular-nums px-1">
              {displayCoins.toLocaleString()}
            </span>
            <div className="w-6 h-6 rounded-full bg-[#0c3b49] border border-[#2b6f82] flex items-center justify-center text-white">
              <Plus className="w-4 h-4 stroke-[3]" />
            </div>
          </button>

          {/* Right: Pink Gems Pill */}
          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              setActiveModal('STORE');
            }}
            className="flex items-center gap-2 bg-[#072232]/95 hover:bg-[#0b2d42] border border-[#234e67] rounded-full px-2 py-1 shadow-md active:scale-95 transition-all cursor-pointer"
          >
            {/* Pink Diamond Gem SVG */}
            <svg className="w-7 h-7 shrink-0 drop-shadow" viewBox="0 0 32 32">
              <polygon points="8,6 24,6 29,13 16,27 3,13" fill="#ec4899" />
              <polygon points="8,6 24,6 21,13 11,13" fill="#f9a8d4" />
              <polygon points="11,13 21,13 16,27" fill="#db2777" />
              <polygon points="3,13 11,13 16,27" fill="#be185d" />
              <polygon points="21,13 29,13 16,27" fill="#9d174d" />
            </svg>
            <span className="font-extrabold text-white text-base sm:text-lg tracking-tight tabular-nums px-1">
              {displayGems}
            </span>
            <div className="w-6 h-6 rounded-full bg-[#0c3b49] border border-[#2b6f82] flex items-center justify-center text-white">
              <Plus className="w-4 h-4 stroke-[3]" />
            </div>
          </button>
        </div>

        {/* 2. Hero Avatar & Kuwait Towers Skyline Section */}
        <div className="relative w-full pt-2 pb-3 flex flex-col items-center">
          {/* Kuwait Skyline Silhouette Backdrop */}
          <div className="absolute inset-x-0 top-0 h-36 sm:h-44 pointer-events-none overflow-hidden opacity-90">
            <svg viewBox="0 0 500 160" className="w-full h-full object-cover" preserveAspectRatio="none">
              <defs>
                <linearGradient id="skyGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#05263b" stopOpacity="0.2" />
                  <stop offset="70%" stopColor="#0e4f73" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#031a29" stopOpacity="1" />
                </linearGradient>
                <linearGradient id="towerLit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
                  <stop offset="50%" stopColor="#0c4a6e" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#fde047" stopOpacity="0.85" />
                </linearGradient>
              </defs>
              <rect width="500" height="160" fill="url(#skyGlow)" />
              {/* Left Kuwait Towers & City Buildings */}
              <rect x="10" y="95" width="18" height="55" fill="#09354f" />
              <rect x="32" y="105" width="15" height="45" fill="#072b40" />
              {/* Left Main Tower */}
              <polygon points="62,18 65,148 59,148" fill="url(#towerLit)" />
              <circle cx="62" cy="78" r="14" fill="#0d4466" stroke="#38bdf8" strokeWidth="1" />
              <circle cx="62" cy="52" r="9" fill="#0d4466" stroke="#38bdf8" strokeWidth="1" />
              {/* Left Second Tower */}
              <polygon points="90,45 93,148 87,148" fill="url(#towerLit)" />
              <circle cx="90" cy="95" r="10" fill="#0d4466" stroke="#38bdf8" strokeWidth="1" />
              <rect x="110" y="100" width="22" height="50" fill="#08324b" />
              <rect x="136" y="112" width="18" height="38" fill="#062639" />

              {/* Right Kuwait Towers & City Buildings */}
              <rect x="355" y="110" width="20" height="40" fill="#062639" />
              <rect x="380" y="98" width="22" height="52" fill="#08324b" />
              {/* Right Second Tower */}
              <polygon points="415,42 418,148 412,148" fill="url(#towerLit)" />
              <circle cx="415" cy="92" r="10" fill="#0d4466" stroke="#38bdf8" strokeWidth="1" />
              {/* Right Main Tower */}
              <polygon points="448,14 452,148 444,148" fill="url(#towerLit)" />
              <circle cx="448" cy="74" r="15" fill="#0d4466" stroke="#38bdf8" strokeWidth="1" />
              <circle cx="448" cy="46" r="9.5" fill="#0d4466" stroke="#38bdf8" strokeWidth="1" />
              <rect x="472" y="92" width="20" height="58" fill="#09354f" />

              {/* Curved Dark Horizon Base */}
              <path d="M0,142 Q250,124 500,142 L500,160 L0,160 Z" fill="#031927" />
            </svg>
          </div>

          {/* Center Circular Avatar with Metallic Frame & Level 12 Badge */}
          <div
            onClick={() => {
              sounds.playTap();
              onNavigate('PROFILE');
            }}
            className="relative z-10 cursor-pointer group"
            title="اضغط لعرض الملف الشخصي وإحصائيات Recharts"
          >
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1.5 bg-gradient-to-b from-[#f8fafc] via-[#94a3b8] to-[#334155] shadow-[0_8px_28px_rgba(0,0,0,0.85)]">
              <div className="w-full h-full rounded-full overflow-hidden border-[3px] border-[#041824] bg-[#0a2e46]">
                <img
                  src={user?.avatar || '/assets/images/login_kuwaiti_mascot_1794483388654.jpg'}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-top scale-110 group-hover:scale-115 transition-transform"
                />
              </div>
            </div>

            {/* Overlapping Lime-Green Level Badge on Bottom-Right */}
            <div className="absolute -bottom-1 -right-2 w-10 h-10 rounded-full bg-gradient-to-b from-[#b5ff2b] to-[#71c200] border-2 border-[#031826] shadow-lg flex items-center justify-center">
              <span className="text-[#041824] font-black text-sm tabular-nums">{displayLevel}</span>
            </div>
          </div>

          {/* Player Name, Level Text, and XP Progress Bar */}
          <div className="relative z-10 w-[84%] max-w-[340px] mt-2">
            <div dir="ltr" className="flex items-center justify-between text-xs sm:text-sm font-extrabold px-1 mb-1.5">
              <span className="text-white drop-shadow">
                {displayLevel} المستوى
              </span>
              <button
                type="button"
                onClick={() => {
                  sounds.playTap();
                  onNavigate('PROFILE');
                }}
                className={`text-base sm:text-lg font-black tracking-tight cursor-pointer flex items-center gap-1 ${getNameGlowClass(user?.equippedNameGlow)}`}
              >
                <span>{displayName}</span>
                {user?.isVip && <span className="text-xs">👑</span>}
              </button>
              <span className="text-slate-300 font-mono text-xs tabular-nums">
                {currentXP} / {targetXP}
              </span>
            </div>

            {/* XP Bar Track */}
            <div
              dir="ltr"
              onClick={() => {
                sounds.playTap();
                onNavigate('PROFILE');
              }}
              className="w-full h-4 rounded-full bg-[#04131e] border border-[#284e66] p-[2px] flex items-center shadow-inner cursor-pointer"
            >
              {/* Small Cyan Gem/XP Indicator on Left */}
              <div className="w-4 h-3 rounded-full bg-[#38bdf8] shrink-0 mr-0.5 shadow-[0_0_8px_#38bdf8]" />
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${xpPercent}%`,
                  background: 'linear-gradient(90deg, #84cc16 0%, #a3e635 70%, #2563eb 100%)'
                }}
              />
            </div>

            {/* Daily Streak Tracking Pill on Home Screen */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                setActiveModal('STREAK');
              }}
              className="mt-2.5 w-full rounded-2xl px-3.5 py-2 flex items-center justify-between gap-2 transition-all hover:brightness-110 active:scale-[0.98] cursor-pointer shadow-lg"
              style={{
                background: completedToday
                  ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.22) 0%, rgba(245, 158, 11, 0.25) 100%)'
                  : 'linear-gradient(90deg, rgba(249, 115, 22, 0.22) 0%, rgba(234, 179, 8, 0.2) 100%)',
                border: completedToday
                  ? '1.5px solid rgba(52, 211, 153, 0.65)'
                  : '1.5px solid rgba(251, 191, 36, 0.65)',
                boxShadow: '0 0 18px rgba(245, 158, 11, 0.2)'
              }}
              title="اضغط لعرض مكافآت سلسلة الأيام المتتالية"
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-b from-amber-300 to-orange-500 flex items-center justify-center shadow-[0_0_10px_rgba(249,115,22,0.7)] shrink-0">
                  <Flame className="w-4 h-4 text-slate-950 fill-slate-950" />
                </div>
                <div className="text-right leading-tight">
                  <div className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                    <span>سلسلة التتابع اليومي:</span>
                    <span className="text-amber-300">{currentStreak} أيام 🔥</span>
                  </div>
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-300 block">
                    {completedToday
                      ? `✓ أكملت مرحلة اليوم (+${todayBonusCoins || 70} عملة مستلمة)`
                      : `أكمل مرحلة اليوم لتربح +${nextBonusCoins} عملة إضافية!`}
                  </span>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-black shrink-0 ${
                  completedToday
                    ? 'bg-emerald-400 text-slate-950'
                    : 'bg-amber-400 text-slate-950 animate-pulse'
                }`}
              >
                {completedToday ? 'مكتمل اليوم ✓' : `+${nextBonusCoins} 🪙`}
              </span>
            </button>

            {/* Friends & Unique Username Quick Pill on Home Screen */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                setActiveModal('FRIENDS');
              }}
              className="mt-2 w-full rounded-2xl px-3.5 py-2 flex items-center justify-between gap-2 transition-all hover:brightness-110 active:scale-[0.98] cursor-pointer shadow-lg bg-[#051d2e]/90 border border-sky-400/50"
              title="إضافة أصدقاء بالمعرف الفريد أو دعوتهم لغرفة خاصة"
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-b from-sky-400 to-blue-600 flex items-center justify-center shadow-[0_0_10px_rgba(56,189,248,0.6)] shrink-0">
                  <Users className="w-4 h-4 text-slate-950" />
                </div>
                <div className="text-right leading-tight">
                  <div className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                    <span>الأصدقاء والدعوات</span>
                    <span dir="ltr" className="text-[11px] font-mono text-sky-300">
                      (@{user?.username || 'ahmad_kwt'})
                    </span>
                  </div>
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-300 block">
                    أضف أصدقاءك بمعرفهم الفريد وادعهم مباشرة لغرفة خاصة 🔒
                  </span>
                </div>
              </div>

              <span className="px-2.5 py-1 rounded-full bg-sky-400 text-slate-950 text-[10px] font-black flex items-center gap-1 shrink-0">
                <UserPlus className="w-3 h-3" />
                <span>إدارة الأصدقاء ({user?.friends?.length ?? 2})</span>
              </span>
            </button>
          </div>
        </div>

        {/* 3. Main Action Buttons Grid */}
        <div className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-8 space-y-3.5 my-auto">
          {/* Primary Giant Lime-Green Button: اللعب الآن */}
          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              onNavigate('CATEGORIES');
            }}
            className="w-full h-20 sm:h-22 rounded-[26px] bg-gradient-to-b from-[#b8ff33] via-[#9cf216] to-[#73c400] hover:brightness-105 active:scale-[0.98] transition-all px-7 shadow-[0_10px_28px_rgba(142,230,14,0.35),inset_0_2px_2px_rgba(255,255,255,0.6)] border-2 border-[#c9ff66] flex items-center justify-between cursor-pointer"
          >
            {/* Dark Navy Gamepad Icon on the Right (start in RTL) */}
            <svg className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 drop-shadow-md" viewBox="0 0 64 48">
              <path
                d="M16,10 H48 C55,10 60,16 61,25 L62,34 C63,40 58,45 52,45 C48,45 45,42 42,37 H22 C19,42 16,45 12,45 C6,45 1,40 2,34 L3,25 C4,16 9,10 16,10 Z"
                fill="#071925"
              />
              {/* D-Pad on Left of Controller */}
              <rect x="14" y="21" width="10" height="3.5" rx="1" fill="#ffffff" />
              <rect x="17.25" y="17.75" width="3.5" height="10" rx="1" fill="#ffffff" />
              {/* Colored Action Buttons on Right of Controller */}
              <circle cx="46" cy="19" r="2.2" fill="#facc15" />
              <circle cx="50.5" cy="23" r="2.2" fill="#facc15" />
              <circle cx="41.5" cy="23" r="2.2" fill="#ffffff" />
              <circle cx="46" cy="27" r="2.2" fill="#a3e635" />
            </svg>

            <span className="text-[#051924] font-black text-3xl sm:text-4xl tracking-tight">
              اللعب الآن
            </span>

            <span className="w-6 shrink-0" aria-hidden="true" />
          </button>

          {/* 2-Column Row: لعب محلي (Right) & اللعب أونلاين (Left) */}
          <div className="grid grid-cols-2 gap-3.5 sm:gap-4">
            {/* Right Card in RTL: لعب محلي */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onNavigate('GAME_LOCAL');
              }}
              className="h-28 sm:h-32 rounded-[24px] bg-gradient-to-b from-[#0b6978] via-[#074b57] to-[#042d36] hover:brightness-110 active:scale-[0.98] transition-all border-2 border-[#1d96a8]/80 shadow-[0_8px_20px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center gap-2 p-3 cursor-pointer"
            >
              {/* Lime-Green Gamepad Controller SVG */}
              <svg className="w-14 h-11 shrink-0 drop-shadow" viewBox="0 0 64 46">
                <path
                  d="M16,8 H48 C55,8 60,14 61,23 L62,32 C63,38 58,43 52,43 C48,43 45,40 42,35 H22 C19,40 16,43 12,43 C6,43 1,38 2,32 L3,23 C4,14 9,8 16,8 Z"
                  fill="#9ef01a"
                  stroke="#052630"
                  strokeWidth="2.5"
                />
                <rect x="14" y="19" width="10" height="3.5" rx="1" fill="#052630" />
                <rect x="17.25" y="15.75" width="3.5" height="10" rx="1" fill="#052630" />
                <circle cx="46" cy="17" r="2.3" fill="#052630" />
                <circle cx="50.5" cy="21" r="2.3" fill="#052630" />
                <circle cx="41.5" cy="21" r="2.3" fill="#052630" />
                <circle cx="46" cy="25" r="2.3" fill="#052630" />
              </svg>
              <span className="text-white font-extrabold text-lg sm:text-xl tracking-tight">
                لعب محلي
              </span>
            </button>

            {/* Left Card in RTL: اللعب أونلاين */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onNavigate('ONLINE_LOBBY');
              }}
              className="h-28 sm:h-32 rounded-[24px] bg-gradient-to-b from-[#2d3875] via-[#212556] to-[#15163a] hover:brightness-110 active:scale-[0.98] transition-all border-2 border-[#5964b5]/80 shadow-[0_8px_20px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center gap-2 p-3 cursor-pointer"
            >
              {/* Three Players Silhouettes SVG (Purple Center + White Sides) */}
              <svg className="w-14 h-11 shrink-0 drop-shadow" viewBox="0 0 64 46">
                {/* Left White Player */}
                <circle cx="16" cy="17" r="6" fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />
                <path d="M6,36 C6,29 12,26 16,26 C20,26 25,29 25,36 Z" fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />
                {/* Right White Player */}
                <circle cx="48" cy="17" r="6" fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />
                <path d="M39,36 C39,29 44,26 48,26 C52,26 58,29 58,36 Z" fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />
                {/* Center Purple Player */}
                <circle cx="32" cy="14" r="7.5" fill="#c084fc" stroke="#0f172a" strokeWidth="2.2" />
                <path d="M18,38 C18,29 24,25 32,25 C40,25 46,29 46,38 Z" fill="#a855f7" stroke="#0f172a" strokeWidth="2.2" />
              </svg>
              <span className="text-white font-extrabold text-lg sm:text-xl tracking-tight">
                اللعب أونلاين
              </span>
            </button>
          </div>

          {/* 3-Column Row: المتجر (Right) ، المهام (Center) ، التصنيفات (Left) */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {/* Right Card in RTL: المتجر */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                setActiveModal('STORE');
              }}
              className="h-24 sm:h-28 rounded-[20px] bg-gradient-to-b from-[#133e52] to-[#082230] hover:brightness-110 active:scale-95 transition-all border border-[#2f6782] shadow-lg flex flex-col items-center justify-center gap-1.5 p-2 cursor-pointer"
            >
              {/* Red & White Awning Store Icon SVG */}
              <svg className="w-10 h-10 shrink-0 drop-shadow" viewBox="0 0 48 48">
                <rect x="8" y="20" width="32" height="22" rx="3" fill="#475569" stroke="#0f172a" strokeWidth="2" />
                <rect x="13" y="26" width="10" height="10" rx="1.5" fill="#38bdf8" />
                <rect x="26" y="26" width="9" height="16" rx="1.5" fill="#1e293b" />
                {/* Awning stripes */}
                <path d="M6,20 L10,10 H38 L42,20 Z" fill="#ef4444" stroke="#0f172a" strokeWidth="2" />
                <path d="M14,20 L16,10 H22 L21,20 Z" fill="#ffffff" />
                <path d="M27,20 L26,10 H32 L34,20 Z" fill="#ffffff" />
              </svg>
              <span className="text-white font-extrabold text-base sm:text-lg">
                المتجر
              </span>
            </button>

            {/* Center Card: المهام (with Red Notification Badge) */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                setActiveModal('MISSIONS');
              }}
              className="relative h-24 sm:h-28 rounded-[20px] bg-gradient-to-b from-[#133e52] to-[#082230] hover:brightness-110 active:scale-95 transition-all border border-[#2f6782] shadow-lg flex flex-col items-center justify-center gap-1.5 p-2 cursor-pointer"
            >
              {/* Red Alert Badge */}
              <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-gradient-to-b from-[#ff4d4d] to-[#dc2626] border border-white/40 shadow-md flex items-center justify-center text-white text-xs font-black">
                !
              </div>
              {/* Checklist Clipboard with Green Checkmark SVG */}
              <svg className="w-10 h-10 shrink-0 drop-shadow" viewBox="0 0 48 48">
                <rect x="10" y="8" width="28" height="34" rx="4" fill="#e2e8f0" stroke="#0f172a" strokeWidth="2" />
                <line x1="15" y1="16" x2="25" y2="16" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
                <line x1="15" y1="24" x2="23" y2="24" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
                <line x1="15" y1="32" x2="21" y2="32" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
                <path d="M22,26 L27,32 L39,16" fill="none" stroke="#65a30d" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-white font-extrabold text-base sm:text-lg">
                المهام
              </span>
            </button>

            {/* Left Card in RTL: التصنيفات */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onNavigate('LEADERBOARD');
              }}
              className="h-24 sm:h-28 rounded-[20px] bg-gradient-to-b from-[#133e52] to-[#082230] hover:brightness-110 active:scale-95 transition-all border border-[#2f6782] shadow-lg flex flex-col items-center justify-center gap-1.5 p-2 cursor-pointer"
            >
              {/* Golden Trophy Cup SVG */}
              <svg className="w-10 h-10 shrink-0 drop-shadow" viewBox="0 0 48 48">
                <path d="M14,10 H34 V20 C34,27 29,31 24,31 C19,31 14,27 14,20 Z" fill="#facc15" stroke="#854d0e" strokeWidth="2" />
                <path d="M14,13 H9 C9,20 11,23 14,23" fill="none" stroke="#eab308" strokeWidth="3" strokeLinecap="round" />
                <path d="M34,13 H39 C39,20 37,23 34,23" fill="none" stroke="#eab308" strokeWidth="3" strokeLinecap="round" />
                <rect x="21" y="31" width="6" height="7" fill="#eab308" />
                <rect x="15" y="38" width="18" height="4" rx="2" fill="#ca8a04" />
              </svg>
              <span className="text-white font-extrabold text-base sm:text-lg">
                التصنيفات
              </span>
            </button>
          </div>
        </div>

        {/* 4. Bottom Navigation Bar matching the 5 icons in the screenshot */}
        <nav
          dir="ltr"
          className="relative z-20 mt-4 w-full bg-[#02121c]/95 border-t border-[#163a4f] px-3 py-2.5 flex items-center justify-center"
        >
          <div className="w-full max-w-5xl flex items-center justify-around">
            {/* Left Tab (Active): الرئيسية */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onNavigate('HOME');
              }}
              className="flex flex-col items-center gap-1 text-[#a3e635] cursor-pointer"
            >
              <svg className="w-6 h-6 fill-current drop-shadow-[0_0_8px_rgba(163,230,53,0.5)]" viewBox="0 0 24 24">
                <path d="M12 3L3 10.5h2v9.5h5.5v-6h3v6H19v-9.5h2L12 3z" />
              </svg>
              <span className="text-xs font-black">الرئيسية</span>
            </button>

            {/* Tab 2: المراحل */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onNavigate('CATEGORIES');
              }}
              className="flex flex-col items-center gap-1 text-[#7ea1b7] hover:text-white transition-colors cursor-pointer"
            >
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
              <span className="text-xs font-bold">المراحل</span>
            </button>

            {/* Tab 3: التصنيفات */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onNavigate('LEADERBOARD');
              }}
              className="flex flex-col items-center gap-1 text-[#7ea1b7] hover:text-white transition-colors cursor-pointer"
            >
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M18 4V3H6v1H2v4c0 2.21 1.79 4 4 4 .45 0 .88-.08 1.28-.22C8.34 13.73 9.97 15.14 11 15.7V19H7v2h10v-2h-4v-3.3c1.03-.56 2.66-1.97 3.72-3.92.4.14.83.22 1.28.22 2.21 0 4-1.79 4-4V4h-4zM4 8V6h2v3.82C4.84 9.4 4 8.3 4 8zm16 0c0 .3-.84 1.4-2 1.82V6h2v2z" />
              </svg>
              <span className="text-xs font-bold">التصنيفات</span>
            </button>

            {/* Tab 4: الأصدقاء */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onNavigate('PROFILES');
              }}
              className="flex flex-col items-center gap-1 text-[#7ea1b7] hover:text-white transition-colors cursor-pointer"
            >
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
              </svg>
              <span className="text-xs font-bold">الأصدقاء</span>
            </button>

            {/* Right Tab: الإعدادات */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onNavigate('SETTINGS');
              }}
              className="flex flex-col items-center gap-1 text-[#7ea1b7] hover:text-white transition-colors cursor-pointer"
            >
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
              </svg>
              <span className="text-xs font-bold">الإعدادات</span>
            </button>
          </div>
        </nav>
      </div>

      {/* Comprehensive Fatteshha Store Modal (المتجر الشامل) */}
      <StoreModal
        isOpen={activeModal === 'STORE'}
        onClose={() => setActiveModal(null)}
        user={user}
        onUpdateUser={onUpdateUser}
        onNavigate={onNavigate}
        initialTab="OFFERS"
      />

      {/* Daily Challenges Modal (التحديات اليومية - 3 مهام) */}
      <DailyChallengesModal
        isOpen={activeModal === 'MISSIONS'}
        onClose={() => setActiveModal(null)}
        dateKey={user?.dailyChallenges?.dateKey}
        streakCount={currentStreak}
        tasks={dailyTasks}
        onClaimTask={handleClaimDailyTask}
        onStartTask={() => {
          setActiveModal(null);
          onNavigate('CATEGORIES');
        }}
        onOpenProfile={() => {
          setActiveModal(null);
          onNavigate('PROFILE');
        }}
        onRerollTasks={handleRerollDailyTasks}
      />

      {/* Daily Streak Modal (نافذة سلسلة التتابع اليومي ومكافآت العملات - التصميم المرفق) */}
      <DailyStreakModal
        isOpen={activeModal === 'STREAK'}
        onClose={() => setActiveModal(null)}
        currentStreak={currentStreak}
        longestStreak={longestStreak}
        completedToday={completedToday}
        nextBonusCoins={nextBonusCoins}
        onActionClick={() => {
          setActiveModal(null);
          onNavigate('CATEGORIES');
        }}
      />

      {/* Notifications Modal (الإشعارات) */}
      {activeModal === 'NOTIFICATIONS' && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#072233] border border-[#2d5b75] rounded-3xl p-6 max-w-sm w-full text-right shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>تنبيهات فتّشها</span>
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300 mb-5">
              <div className="p-3 rounded-2xl bg-[#041622] border border-[#25465c]">
                <span className="font-bold text-lime-400 block mb-0.5">مكافأة الدخول اليومي جاهزة! 🎁</span>
                <span>استلم عملاتك المجانية من قسم «المهام» وتحدَّ أصدقاءك في الغرف المباشرة.</span>
              </div>
              <div className="p-3 rounded-2xl bg-[#041622] border border-[#25465c]">
                <span className="font-bold text-sky-400 block mb-0.5">تحديث التحليلات والرسوم البيانية 📊</span>
                <span>اضغط على صورتك الرمزية لاستعراض منحنى سرعتك ودقتك في حل المراحل.</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null);
                  onNavigate('AUTH');
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs"
              >
                صفحة تسجيل الدخول
              </button>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-lime-400 text-slate-950 font-black text-xs"
              >
                حسناً
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Friends & Direct Invites Modal */}
      <FriendsModal
        isOpen={activeModal === 'FRIENDS'}
        onClose={() => setActiveModal(null)}
        currentUser={user}
        onJoinRoomCode={code => {
          setActiveModal(null);
          if (onJoinFriendRoom) {
            onJoinFriendRoom(code);
          } else {
            onNavigate('ONLINE_JOIN');
          }
        }}
        onCreatePrivateRoomAndInvite={friend => {
          setActiveModal(null);
          if (onInviteFriendToNewPrivateRoom) {
            onInviteFriendToNewPrivateRoom(friend);
          } else {
            onNavigate('ONLINE_LOBBY');
          }
        }}
        onUpdateUser={onUpdateUser}
      />
    </div>
  );
};
