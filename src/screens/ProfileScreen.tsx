import React, { useState, useMemo, useEffect } from 'react';
import { PlayerProfile, ScreenState } from '../types/game';
import { ACHIEVEMENTS, CATEGORIES, getLevelConfig } from '../engine/gameCategories';
import {
  Award,
  Star,
  Lock,
  Check,
  ChevronDown,
  RotateCcw,
  Users,
  Sparkles,
  Clock,
  Target,
  BarChart3
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { sounds } from '../utils/audio';

interface ProfileScreenProps {
  user: PlayerProfile;
  onUpdateUser: (user: PlayerProfile) => void;
  onNavigate: (screen: ScreenState) => void;
}

interface ParsedStageMetric {
  key: string;
  categoryId: string;
  categoryName: string;
  levelNumber: number;
  stageLabel: string;
  shortLabel: string;
  stars: number;
  bestTime: number;
  score: number;
  accuracy: number;
  wordCount: number;
  wordsPerMinute: number;
  secondsPerWord: number;
  completedAt: string;
}

const AVATAR_GALLERY = [
  {
    id: 'mascot',
    label: 'شخصية فتّشها',
    url: '/assets/images/login_kuwaiti_mascot_1794483388654.jpg'
  },
  {
    id: 'boy',
    label: 'شاب كويتي',
    url: '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg'
  },
  {
    id: 'girl',
    label: 'فتاة كويتية',
    url: '/assets/images/avatar_kuwaiti_girl_1794404783186.jpg'
  },
  {
    id: 'trophy',
    label: 'كأس البطولة',
    url: '/assets/images/game_trophy_kuwait_1794404783493.jpg'
  },
  {
    id: 'hero',
    label: 'أبراج الكويت',
    url: '/assets/images/hero_fatteshha_cover_1794404782445.jpg'
  }
];

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  user,
  onUpdateUser,
  onNavigate
}) => {
  const [openSection, setOpenSection] = useState<'ACHIEVEMENTS' | 'STATS' | 'AVATAR' | null>(null);
  const [activeChartTab, setActiveChartTab] = useState<'PROGRESSION' | 'ACCURACY_SPEED' | 'CATEGORIES'>('PROGRESSION');
  const [editName, setEditName] = useState(user.displayName);
  const [savingProfile, setSavingProfile] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [allPlayers, setAllPlayers] = useState<PlayerProfile[]>([]);

  useEffect(() => {
    setEditName(user.displayName);
  }, [user.displayName]);

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.users)) {
          setAllPlayers(data.users);
        }
      })
      .catch(() => {
        // ignore
      });
  }, [user]);

  // Parse user's completedLevels into structured analytics records
  const stageMetrics: ParsedStageMetric[] = useMemo(() => {
    const rawMap = user.completedLevels || {};
    const entries = Object.entries(rawMap);

    const parsed: ParsedStageMetric[] = entries.map(([key, val], idx) => {
      const lastUnderscore = key.lastIndexOf('_');
      const catId = lastUnderscore > -1 ? key.substring(0, lastUnderscore) : 'kuwait_heritage';
      const lvlNum = lastUnderscore > -1 ? parseInt(key.substring(lastUnderscore + 1), 10) || 1 : idx + 1;

      const catObj = CATEGORIES.find(c => c.id === catId);
      const categoryName = catObj ? catObj.name : 'الكويت';
      const levelCfg = getLevelConfig(catId, lvlNum);
      const wordCount = levelCfg.wordCount || 5;

      const bestTime = Math.max(5, val.bestTime || 45);
      const derivedAccuracy =
        typeof val.accuracy === 'number'
          ? val.accuracy
          : Math.min(100, Math.max(78, Math.round(100 - Math.max(0, bestTime - 35) * 0.35)));

      const wordsPerMinute = Number(((wordCount / bestTime) * 60).toFixed(1));
      const secondsPerWord = Number((bestTime / wordCount).toFixed(1));

      return {
        key,
        categoryId: catId,
        categoryName,
        levelNumber: lvlNum,
        stageLabel: `${categoryName} - مرحلة ${lvlNum}`,
        shortLabel: `م${idx + 1} (#${lvlNum})`,
        stars: val.stars || 1,
        bestTime,
        score: val.score || 500,
        accuracy: derivedAccuracy,
        wordCount,
        wordsPerMinute,
        secondsPerWord,
        completedAt: val.completedAt || ''
      };
    });

    return parsed.sort((a, b) => {
      if (a.completedAt && b.completedAt) {
        return a.completedAt.localeCompare(b.completedAt);
      }
      return a.levelNumber - b.levelNumber;
    });
  }, [user.completedLevels]);

  // Dynamic per-player KPI & Top 3 Card Calculations
  const playerStats = useMemo(() => {
    const completedStages = stageMetrics.length;
    const totalStars = stageMetrics.reduce((acc, m) => acc + m.stars, 0);
    const avgAccuracy =
      completedStages > 0
        ? Math.round(stageMetrics.reduce((acc, m) => acc + m.accuracy, 0) / completedStages)
        : 0;
    const avgSolveTime =
      completedStages > 0
        ? Math.round(stageMetrics.reduce((acc, m) => acc + m.bestTime, 0) / completedStages)
        : 0;
    const fastestTime =
      completedStages > 0
        ? [...stageMetrics].sort((a, b) => a.bestTime - b.bestTime)[0].bestTime
        : 0;
    const threeStarCount = stageMetrics.filter(m => m.stars === 3).length;
    const threeStarRate = completedStages > 0 ? Math.round((threeStarCount / completedStages) * 100) : 0;

    // Top 3 Cards:
    // 1. فوز (Wins) = completed solo stages + online multiplayer wins
    const totalWins = completedStages + (user.multiplayerWins || 0);
    // 2. مباراة (Matches) = completed solo stages + online wins + online losses
    const totalMatches = completedStages + (user.multiplayerWins || 0) + (user.multiplayerLosses || 0);
    // 3. نسبة الفوز (Win / Success Rate %)
    let winRate = 0;
    if (totalMatches > 0) {
      const matchWinRatio = (totalWins / totalMatches) * 100;
      winRate = completedStages > 0 ? Math.round((matchWinRatio + avgAccuracy) / 2) : Math.round(matchWinRatio);
    }

    return {
      completedStages,
      totalStars,
      avgAccuracy,
      avgSolveTime,
      fastestTime,
      threeStarRate,
      totalWins,
      totalMatches,
      winRate
    };
  }, [stageMetrics, user.multiplayerWins, user.multiplayerLosses]);

  // Category breakdown for Recharts BarChart
  const categoryBreakdown = useMemo(() => {
    return CATEGORIES.map(cat => {
      const catRecords = stageMetrics.filter(m => m.categoryId === cat.id);
      const count = catRecords.length;
      const avgAcc =
        count > 0 ? Math.round(catRecords.reduce((s, r) => s + r.accuracy, 0) / count) : 0;
      const avgSpeed =
        count > 0 ? Math.round(catRecords.reduce((s, r) => s + r.bestTime, 0) / count) : 0;
      const stars = catRecords.reduce((s, r) => s + r.stars, 0);

      return {
        id: cat.id,
        name: cat.name.split(' ')[0],
        fullName: cat.name,
        completed: count,
        avgAccuracy: avgAcc,
        avgTime: avgSpeed,
        stars
      };
    });
  }, [stageMetrics]);

  // Radar Chart Data
  const radarData = useMemo(() => {
    const speedScore =
      playerStats.completedStages > 0 && playerStats.avgSolveTime > 0
        ? Math.min(100, Math.max(20, Math.round(115 - playerStats.avgSolveTime)))
        : 0;

    return [
      { metric: 'دقة التحديد', value: playerStats.avgAccuracy || 0, fullMark: 100 },
      { metric: 'سرعة الحل', value: speedScore, fullMark: 100 },
      { metric: 'إتقان النجوم', value: playerStats.threeStarRate || 0, fullMark: 100 },
      { metric: 'نسبة الفوز', value: playerStats.winRate || 0, fullMark: 100 },
      { metric: 'الخبرة والمستوى', value: Math.min(100, user.level * 15), fullMark: 100 }
    ];
  }, [playerStats, user.level]);

  const handleToggleSection = (sec: 'ACHIEVEMENTS' | 'STATS' | 'AVATAR') => {
    sounds.playTap();
    setOpenSection(prev => (prev === sec ? null : sec));
  };

  const handleSaveProfileChanges = async (newAvatarUrl?: string, newDisplayName?: string) => {
    sounds.playTap();
    setSavingProfile(true);
    setStatusMsg('');
    try {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          displayName: (newDisplayName ?? editName).trim() || user.displayName,
          avatar: newAvatarUrl || user.avatar
        })
      });
      const data = await res.json();
      if (data.success && data.user) {
        sounds.playVictory();
        onUpdateUser(data.user);
        setStatusMsg('تم تحديث بيانات ملفك الشخصي بنجاح ✓');
        setTimeout(() => setStatusMsg(''), 3500);
      }
    } catch {
      setStatusMsg('تعذر حفظ التغييرات حالياً');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleClaimDailyTask = async (taskId: string) => {
    sounds.playTap();
    try {
      const res = await fetch('/api/daily-challenges/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, taskId })
      });
      const data = await res.json();
      if (data.success && data.user) {
        sounds.playVictory();
        onUpdateUser(data.user);
        setStatusMsg(`كفو! استلمت +${data.rewardCoins} عملة و +${data.rewardXP} XP 🎉`);
      }
    } catch {
      // ignore
    }
  };

  const handleRerollDailyTasks = async () => {
    sounds.playTap();
    try {
      const res = await fetch('/api/daily-challenges/reroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username })
      });
      const data = await res.json();
      if (data.success && data.user) {
        onUpdateUser(data.user);
        setStatusMsg('تم توليد 3 تحديات يومية عشوائية جديدة!');
      }
    } catch {
      // ignore
    }
  };

  const handleResetProgress = async () => {
    sounds.playTap();
    try {
      const res = await fetch('/api/progress/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username })
      });
      const data = await res.json();
      if (data.success && data.user) {
        onUpdateUser(data.user);
        setStatusMsg('تم تصفير نجوم ومراحل هذا اللاعب بنجاح.');
      }
    } catch {
      setStatusMsg('تعذر تصفير البيانات');
    }
  };

  const handleSwitchPlayer = async (targetUsername: string) => {
    sounds.playTap();
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'x-user-id': targetUsername }
      });
      const data = await res.json();
      if (data.success && data.user) {
        onUpdateUser(data.user);
        setStatusMsg(`تم التبديل إلى حساب اللاعب: ${data.user.displayName}`);
        setTimeout(() => setStatusMsg(''), 3000);
      }
    } catch {
      // ignore
    }
  };

  const currentLevel = user.level || 1;
  const currentXP = user.xp || 0;
  const targetXP = currentLevel * 300;
  const xpInLevel = currentXP % 300;
  const xpFillPercent = Math.min(100, Math.max(8, Math.round((xpInLevel / 300) * 100)));
  const shortName = user.displayName?.split(' ')[0] || user.displayName;
  const dailyTasks = user.dailyChallenges?.tasks || [];

  return (
    <div
      dir="rtl"
      className="safe-screen fixed inset-0 z-40 w-full h-dvh bg-[#02131f] flex flex-col overflow-y-auto overflow-x-hidden select-none"
    >
      {/* Ambient dark-teal blurred backdrop for all device viewports */}
      <div
        className="fixed inset-0 bg-cover bg-center scale-110 blur-3xl opacity-30 pointer-events-none"
        style={{
          backgroundImage: `url('/assets/images/login_kuwaiti_mascot_1794483388654.jpg')`
        }}
      />
      <div className="fixed inset-0 bg-gradient-to-b from-[#031d2e]/90 via-[#021420]/95 to-[#010c14] pointer-events-none" />

      {/* Main Responsive Frame matching the Profile design across phones, laptops & TVs */}
      <div className="relative z-10 w-full flex-1 flex flex-col bg-gradient-to-b from-[#031b2b]/90 via-[#031522]/95 to-[#010e17]">
        
        {/* 1. Top Header & Kuwait Skyline with Avatar */}
        <div className="relative w-full pt-5 pb-3 flex flex-col items-center shrink-0">
          {/* Kuwait Skyline Silhouette Backdrop */}
          <div className="absolute inset-x-0 top-10 h-44 sm:h-52 pointer-events-none overflow-hidden opacity-95">
            <svg viewBox="0 0 500 180" className="w-full h-full object-cover" preserveAspectRatio="none">
              <defs>
                <linearGradient id="profSkyGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#042235" stopOpacity="0.1" />
                  <stop offset="65%" stopColor="#0e4f73" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#021522" stopOpacity="1" />
                </linearGradient>
                <linearGradient id="profTowerLit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.95" />
                  <stop offset="55%" stopColor="#0c4a6e" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#fef08a" stopOpacity="0.9" />
                </linearGradient>
              </defs>
              <rect width="500" height="180" fill="url(#profSkyGlow)" />

              {/* Left Kuwait Towers & City Buildings */}
              <rect x="8" y="108" width="22" height="55" fill="#093854" />
              <rect x="34" y="118" width="16" height="45" fill="#072d44" />
              {/* Left Main Tower */}
              <polygon points="68,20 72,162 64,162" fill="url(#profTowerLit)" />
              <circle cx="68" cy="88" r="14.5" fill="#0d4466" stroke="#38bdf8" strokeWidth="1.2" />
              <circle cx="68" cy="58" r="9" fill="#0d4466" stroke="#38bdf8" strokeWidth="1" />
              {/* Left Second Tower */}
              <polygon points="96,52 99,162 93,162" fill="url(#profTowerLit)" />
              <circle cx="96" cy="105" r="9.5" fill="#0d4466" stroke="#38bdf8" strokeWidth="1" />
              <rect x="114" y="112" width="20" height="50" fill="#08324b" />
              <rect x="138" y="124" width="18" height="38" fill="#062639" />

              {/* Right Kuwait Towers & City Buildings */}
              <rect x="345" y="122" width="18" height="40" fill="#062639" />
              <rect x="368" y="108" width="18" height="54" fill="#08324b" />
              {/* Right Second Tower */}
              <polygon points="396,38 400,162 392,162" fill="url(#profTowerLit)" />
              <circle cx="396" cy="96" r="11" fill="#0d4466" stroke="#38bdf8" strokeWidth="1.2" />
              <circle cx="396" cy="70" r="7" fill="#0d4466" stroke="#38bdf8" strokeWidth="1" />
              {/* Right Needle */}
              <polygon points="416,66 419,162 413,162" fill="url(#profTowerLit)" />
              {/* Right Main Tall Tower */}
              <polygon points="444,10 450,162 438,162" fill="url(#profTowerLit)" />
              <circle cx="444" cy="82" r="16.5" fill="#0d4466" stroke="#7dd3fc" strokeWidth="1.5" />
              <circle cx="444" cy="48" r="10.5" fill="#0d4466" stroke="#7dd3fc" strokeWidth="1.2" />
              <rect x="466" y="102" width="22" height="60" fill="#093854" />

              {/* Curved Dark Horizon Base */}
              <path d="M0,154 Q250,134 500,154 L500,180 L0,180 Z" fill="#021522" />
            </svg>
          </div>

          {/* Top Bar: Left Back Arrow + Centered Title "ملفي الشخصي" */}
          <div dir="ltr" className="relative z-20 w-full max-w-5xl mx-auto px-6 sm:px-8 flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onNavigate('HOME');
              }}
              className="w-10 h-10 rounded-full hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center text-white cursor-pointer"
              title="رجوع للرئيسية"
            >
              <svg className="w-7 h-7 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </button>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight drop-shadow-[0_3px_8px_rgba(0,0,0,0.85)]">
              ملفي الشخصي
            </h1>

            <span className="w-10" aria-hidden="true" />
          </div>

          {/* Center Circular Avatar with Metallic Frame & Lime-Green Edit Pencil Badge */}
          <div className="relative z-20 mt-1">
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1.5 bg-gradient-to-b from-[#fef3c7] via-[#cbd5e1] to-[#475569] shadow-[0_10px_28px_rgba(0,0,0,0.85)]">
              <div className="w-full h-full rounded-full overflow-hidden border-[3px] border-[#041824] bg-[#0a2e46]">
                <img
                  src={user.avatar || '/assets/images/login_kuwaiti_mascot_1794483388654.jpg'}
                  alt={user.displayName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-top scale-105"
                />
              </div>
            </div>

            {/* Overlapping Lime-Green Pencil Edit Button on Bottom-Right */}
            <button
              type="button"
              onClick={() => handleToggleSection('AVATAR')}
              className="absolute bottom-0 -right-1 w-10 h-10 rounded-full bg-gradient-to-b from-[#b5ff2b] to-[#76c800] hover:brightness-110 active:scale-95 border-[2.5px] border-[#031826] shadow-lg flex items-center justify-center cursor-pointer transition-transform"
              title="تعديل الاسم أو تغيير الصورة"
            >
              <svg className="w-5 h-5 text-[#041824]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
              </svg>
            </button>
          </div>

          {/* Player Name & Level Subtitle */}
          <div className="relative z-20 text-center mt-2.5">
            <h2 className="text-2xl sm:text-[26px] font-black text-white leading-tight drop-shadow">
              {shortName}
            </h2>
            <p className="text-sm sm:text-base font-extrabold text-[#d1e4f0] mt-0.5 tabular-nums">
              {currentLevel} المستوى
            </p>
          </div>

          {/* Rounded XP Pill Bar matching the reference screenshot */}
          <div
            dir="ltr"
            className="relative z-20 w-[88%] max-w-[440px] mt-2.5 h-9 rounded-full bg-[#061c2b] border-[2px] border-[#29526b] px-1.5 flex items-center justify-between gap-2 shadow-[inset_0_2px_5px_rgba(0,0,0,0.75)]"
          >
            {/* Left Side: Cyan Level Badge + Lime Progress Bar */}
            <div className="flex-1 h-6 rounded-full bg-[#03111b] flex items-center overflow-hidden p-0.5">
              <div className="h-5 min-w-[26px] px-1.5 rounded-full bg-gradient-to-b from-[#38bdf8] to-[#0284c7] text-white font-black text-xs flex items-center justify-center shrink-0 shadow tabular-nums z-10">
                {currentLevel}
              </div>
              <div
                className="h-full rounded-r-full transition-all duration-500 -ml-1 pl-1"
                style={{
                  width: `${xpFillPercent}%`,
                  background: 'linear-gradient(90deg, #84cc16 0%, #a3e635 100%)'
                }}
              />
            </div>

            {/* Right Side: XP / Target XP */}
            <span className="text-white font-black text-xs sm:text-sm font-mono tabular-nums pr-2 shrink-0">
              {currentXP.toLocaleString()} / {targetXP.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Status Feedback Toast */}
        {statusMsg && (
          <div className="w-full max-w-4xl mx-auto px-4 sm:px-8 mb-2">
            <div className="px-3 py-2 rounded-2xl bg-lime-500/20 border border-lime-400/40 text-lime-300 text-xs font-black text-center">
              {statusMsg}
            </div>
          </div>
        )}

        {/* 2. Three Dynamic Stat Cards Row (فوز | مباراة | نسبة الفوز) */}
        <div dir="ltr" className="relative z-20 w-full max-w-4xl lg:max-w-5xl mx-auto px-4 sm:px-8 pt-2 pb-3 grid grid-cols-3 gap-3 sm:gap-5">
          {/* Left Card: فوز (Wins) */}
          <div
            className="rounded-[24px] p-3 sm:p-4 flex flex-col items-center justify-between min-h-[128px] sm:min-h-[144px]"
            style={{
              background: 'linear-gradient(180deg, #0b2e42 0%, #061c29 100%)',
              border: '1.5px solid #234f69',
              boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.15), 0 6px 16px rgba(0,0,0,0.5)'
            }}
          >
            {/* Golden Trophy SVG */}
            <svg className="w-11 h-11 shrink-0 drop-shadow" viewBox="0 0 48 48">
              <path d="M14,10 H34 V20 C34,27 29,31 24,31 C19,31 14,27 14,20 Z" fill="#facc15" stroke="#713f12" strokeWidth="2" />
              <path d="M14,13 H9 C9,20 11,23 14,23" fill="none" stroke="#eab308" strokeWidth="3" strokeLinecap="round" />
              <path d="M34,13 H39 C39,20 37,23 34,23" fill="none" stroke="#eab308" strokeWidth="3" strokeLinecap="round" />
              <rect x="21" y="31" width="6" height="7" fill="#eab308" />
              <rect x="15" y="38" width="18" height="4.5" rx="2" fill="#ca8a04" />
            </svg>
            <span className="text-2xl sm:text-3xl font-black text-white tabular-nums leading-none mt-1">
              {playerStats.totalWins}
            </span>
            <span className="text-sm sm:text-base font-extrabold text-[#d1e4f0]">
              فوز
            </span>
          </div>

          {/* Center Card: مباراة (Matches Played) */}
          <div
            className="rounded-[24px] p-3 sm:p-4 flex flex-col items-center justify-between min-h-[128px] sm:min-h-[144px]"
            style={{
              background: 'linear-gradient(180deg, #0b2e42 0%, #061c29 100%)',
              border: '1.5px solid #234f69',
              boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.15), 0 6px 16px rgba(0,0,0,0.5)'
            }}
          >
            {/* Sky-Blue Gamepad SVG */}
            <svg className="w-12 h-11 shrink-0 drop-shadow" viewBox="0 0 64 48">
              <path
                d="M16,10 H48 C55,10 60,16 61,25 L62,34 C63,40 58,45 52,45 C48,45 45,42 42,37 H22 C19,42 16,45 12,45 C6,45 1,40 2,34 L3,25 C4,16 9,10 16,10 Z"
                fill="#38bdf8"
                stroke="#041824"
                strokeWidth="2.5"
              />
              <rect x="15" y="21" width="9" height="3" rx="1" fill="#041824" />
              <rect x="18" y="18" width="3" height="9" rx="1" fill="#041824" />
              <circle cx="46" cy="19" r="2.2" fill="#041824" />
              <circle cx="50" cy="23" r="2.2" fill="#041824" />
              <circle cx="42" cy="23" r="2.2" fill="#041824" />
              <circle cx="46" cy="27" r="2.2" fill="#041824" />
            </svg>
            <span className="text-2xl sm:text-3xl font-black text-white tabular-nums leading-none mt-1">
              {playerStats.totalMatches}
            </span>
            <span className="text-sm sm:text-base font-extrabold text-[#facc15]">
              مباراة
            </span>
          </div>

          {/* Right Card: نسبة الفوز (Win Rate %) */}
          <div
            className="rounded-[24px] p-3 sm:p-4 flex flex-col items-center justify-between min-h-[128px] sm:min-h-[144px]"
            style={{
              background: 'linear-gradient(180deg, #0b2e42 0%, #061c29 100%)',
              border: '1.5px solid #234f69',
              boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.15), 0 6px 16px rgba(0,0,0,0.5)'
            }}
          >
            {/* Red & White Bullseye Target with Dart SVG */}
            <svg className="w-11 h-11 shrink-0 drop-shadow" viewBox="0 0 48 48">
              <circle cx="23" cy="25" r="17" fill="#ef4444" stroke="#7f1d1d" strokeWidth="2" />
              <circle cx="23" cy="25" r="11.5" fill="#f8fafc" />
              <circle cx="23" cy="25" r="6.5" fill="#ef4444" />
              <circle cx="23" cy="25" r="2.5" fill="#f8fafc" />
              {/* Dart hitting bullseye from top-right */}
              <line x1="23" y1="25" x2="39" y2="9" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
              <polygon points="35,9 43,5 39,13" fill="#38bdf8" />
            </svg>
            <span className="text-2xl sm:text-3xl font-black text-white tabular-nums leading-none mt-1">
              {playerStats.winRate}%
            </span>
            <span className="text-sm sm:text-base font-extrabold text-[#d1e4f0]">
              نسبة الفوز
            </span>
          </div>
        </div>

        {/* 3. Three Expandable Accordion Rows matching the screenshot */}
        <div className="relative z-20 w-full max-w-4xl lg:max-w-5xl mx-auto px-4 sm:px-8 pb-8 space-y-3">
          
          {/* Row 1: الإنجازات (Achievements & Daily Challenges) */}
          <div className="rounded-[22px] overflow-hidden border border-[#244e68] bg-gradient-to-b from-[#0b2b3d] to-[#061a26] shadow-lg">
            <button
              type="button"
              onClick={() => handleToggleSection('ACHIEVEMENTS')}
              className="w-full h-16 px-5 flex items-center justify-between cursor-pointer hover:brightness-110 transition-all"
            >
              {/* Right side in RTL: Golden Trophy Icon + "الإنجازات" */}
              <div className="flex items-center gap-3.5">
                <svg className="w-9 h-9 shrink-0 drop-shadow" viewBox="0 0 48 48">
                  <path d="M14,10 H34 V20 C34,27 29,31 24,31 C19,31 14,27 14,20 Z" fill="#facc15" stroke="#713f12" strokeWidth="2" />
                  <path d="M14,13 H9 C9,20 11,23 14,23" fill="none" stroke="#eab308" strokeWidth="3" strokeLinecap="round" />
                  <path d="M34,13 H39 C39,20 37,23 34,23" fill="none" stroke="#eab308" strokeWidth="3" strokeLinecap="round" />
                  <rect x="21" y="31" width="6" height="7" fill="#eab308" />
                  <rect x="15" y="38" width="18" height="4.5" rx="2" fill="#ca8a04" />
                </svg>
                <span className="text-lg sm:text-xl font-black text-white">الإنجازات</span>
              </div>

              {/* Left side in RTL: Chevron Down */}
              <ChevronDown
                className={`w-6 h-6 text-[#94b8d0] stroke-[2.8] transition-transform duration-200 ${
                  openSection === 'ACHIEVEMENTS' ? 'rotate-180 text-white' : ''
                }`}
              />
            </button>

            {openSection === 'ACHIEVEMENTS' && (
              <div className="px-4 pb-4 pt-2 border-t border-[#1b3d52] space-y-4 bg-[#04131d]">
                {/* Daily Challenges Subsection */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-lime-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>التحديات اليومية (3 مهام عشوائية)</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleRerollDailyTasks}
                      className="text-[11px] font-bold text-amber-400 hover:text-amber-300 cursor-pointer"
                    >
                      🔄 تبديل التحديات
                    </button>
                  </div>

                  <div className="space-y-2">
                    {dailyTasks.map(task => {
                      const pct = Math.min(100, Math.round((task.current / task.target) * 100));
                      return (
                        <div
                          key={task.id}
                          className="p-3 rounded-2xl bg-[#072030] border border-[#1d435a] space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-black text-white">{task.description}</span>
                            <span className="text-[11px] font-bold text-amber-400 tabular-nums">
                              +{task.rewardCoins} عملة · +{task.rewardXP} XP
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <div className="flex-1 h-2 rounded-full bg-slate-950 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${pct}%`,
                                  background: task.completed ? '#10b981' : '#84cc16'
                                }}
                              />
                            </div>
                            <span className="text-[11px] font-mono font-bold text-slate-300 tabular-nums">
                              {task.current}/{task.target}
                            </span>
                            {task.completed && !task.claimed && (
                              <button
                                type="button"
                                onClick={() => handleClaimDailyTask(task.id)}
                                className="px-2.5 py-0.5 rounded-lg bg-lime-400 text-slate-950 font-black text-[10px]"
                              >
                                استلام
                              </button>
                            )}
                            {task.claimed && (
                              <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5">
                                <Check className="w-3 h-3" /> مكتمل
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Achievements Badges Subsection */}
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                    <span className="font-bold text-white">الأوسمة الكويتية</span>
                    <span className="tabular-nums">
                      {user.achievements?.filter(a => !a.startsWith('mission_')).length || 0} / {ACHIEVEMENTS.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-0.5">
                    {ACHIEVEMENTS.map(ach => {
                      const isUnlocked = user.achievements?.includes(ach.id);
                      return (
                        <div
                          key={ach.id}
                          className={`p-2.5 rounded-xl border flex items-center justify-between ${
                            isUnlocked
                              ? 'border-amber-400/40 bg-amber-500/10'
                              : 'border-slate-800 bg-slate-950/50 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                isUnlocked ? 'bg-amber-400/20 text-amber-400' : 'bg-slate-800 text-slate-500'
                              }`}
                            >
                              {isUnlocked ? <Award className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                            </div>
                            <div className="text-right">
                              <div className="text-xs font-bold text-white">{ach.title}</div>
                              <div className="text-[11px] text-slate-400">{ach.description}</div>
                            </div>
                          </div>
                          <span className="text-[11px] font-bold text-amber-400 tabular-nums shrink-0">
                            +{ach.xpReward} XP
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Row 2: إحصائيات اللعب (Game Statistics & Interactive Recharts) */}
          <div className="rounded-[22px] overflow-hidden border border-[#244e68] bg-gradient-to-b from-[#0b2b3d] to-[#061a26] shadow-lg">
            <button
              type="button"
              onClick={() => handleToggleSection('STATS')}
              className="w-full h-16 px-5 flex items-center justify-between cursor-pointer hover:brightness-110 transition-all"
            >
              {/* Right side in RTL: Blue Bar Chart Icon + "إحصائيات اللعب" */}
              <div className="flex items-center gap-3.5">
                <svg className="w-9 h-9 shrink-0 drop-shadow" viewBox="0 0 48 48">
                  <rect x="8" y="28" width="7" height="12" rx="2" fill="#0ea5e9" />
                  <rect x="18" y="20" width="7" height="20" rx="2" fill="#38bdf8" />
                  <rect x="28" y="10" width="8" height="30" rx="2" fill="#7dd3fc" />
                </svg>
                <span className="text-lg sm:text-xl font-black text-white">إحصائيات اللعب</span>
              </div>

              {/* Left side in RTL: Chevron Down */}
              <ChevronDown
                className={`w-6 h-6 text-[#94b8d0] stroke-[2.8] transition-transform duration-200 ${
                  openSection === 'STATS' ? 'rotate-180 text-white' : ''
                }`}
              />
            </button>

            {openSection === 'STATS' && (
              <div className="px-4 pb-4 pt-3 border-t border-[#1b3d52] space-y-4 bg-[#04131d]">
                {/* Quick KPI Mini Grid */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 rounded-xl bg-[#072030] border border-[#1d435a]">
                    <Target className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                    <div className="text-sm font-black text-emerald-400 tabular-nums">
                      {playerStats.avgAccuracy}%
                    </div>
                    <div className="text-[10px] text-slate-400">متوسط الدقة</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#072030] border border-[#1d435a]">
                    <Clock className="w-4 h-4 text-sky-400 mx-auto mb-1" />
                    <div className="text-sm font-black text-sky-400 tabular-nums">
                      {playerStats.avgSolveTime} ث
                    </div>
                    <div className="text-[10px] text-slate-400">متوسط الزمن</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#072030] border border-[#1d435a]">
                    <Star className="w-4 h-4 text-amber-400 mx-auto mb-1 fill-current" />
                    <div className="text-sm font-black text-amber-400 tabular-nums">
                      {playerStats.totalStars}
                    </div>
                    <div className="text-[10px] text-slate-400">إجمالي النجوم</div>
                  </div>
                </div>

                {/* Chart Mode Tabs */}
                <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setActiveChartTab('PROGRESSION')}
                    className={`flex-1 py-1.5 rounded-lg transition-colors ${
                      activeChartTab === 'PROGRESSION'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    النقاط والسرعة
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveChartTab('ACCURACY_SPEED')}
                    className={`flex-1 py-1.5 rounded-lg transition-colors ${
                      activeChartTab === 'ACCURACY_SPEED'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    منحنى الدقة
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveChartTab('CATEGORIES')}
                    className={`flex-1 py-1.5 rounded-lg transition-colors ${
                      activeChartTab === 'CATEGORIES'
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    التصنيفات
                  </button>
                </div>

                {/* Recharts Viewport */}
                {stageMetrics.length === 0 ? (
                  <div className="py-8 text-center bg-slate-950/60 rounded-2xl border border-slate-800 p-4">
                    <BarChart3 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-300">
                      لا توجد مراحل منجزة لحساب «{user.displayName}» بعد
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1 mb-3">
                      أكمل مرحلة واحدة على الأقل ليظهر منحنى السرعة والدقة الخاص بك
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigate('CATEGORIES')}
                      className="px-4 py-1.5 rounded-xl bg-lime-400 text-slate-950 font-black text-xs"
                    >
                      ابدأ اللعب الآن
                    </button>
                  </div>
                ) : (
                  <div className="h-56 w-full" dir="ltr">
                    {activeChartTab === 'PROGRESSION' && (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={stageMetrics} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="shortLabel" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                          <YAxis yAxisId="left" stroke="#f59e0b" tick={{ fill: '#f59e0b', fontSize: 10 }} />
                          <YAxis yAxisId="right" orientation="right" stroke="#38bdf8" tick={{ fill: '#38bdf8', fontSize: 10 }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              borderRadius: '10px',
                              color: '#f8fafc',
                              fontSize: '11px'
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Area
                            yAxisId="left"
                            type="monotone"
                            dataKey="score"
                            name="النقاط"
                            stroke="#f59e0b"
                            fill="#f59e0b"
                            fillOpacity={0.25}
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="bestTime"
                            name="الزمن (ث)"
                            stroke="#38bdf8"
                            strokeWidth={2.5}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}

                    {activeChartTab === 'ACCURACY_SPEED' && (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={stageMetrics} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="shortLabel" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                          <YAxis domain={[0, 100]} stroke="#10b981" tick={{ fill: '#10b981', fontSize: 10 }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              borderRadius: '10px',
                              color: '#f8fafc',
                              fontSize: '11px'
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Area
                            type="monotone"
                            dataKey="accuracy"
                            name="الدقة (%)"
                            stroke="#10b981"
                            fill="#10b981"
                            fillOpacity={0.3}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}

                    {activeChartTab === 'CATEGORIES' && (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categoryBreakdown} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                          <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              borderRadius: '10px',
                              color: '#f8fafc',
                              fontSize: '11px'
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Bar dataKey="stars" name="النجوم" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="avgAccuracy" name="الدقة (%)" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                )}

                {/* Skill Radar Chart */}
                <div className="h-48 w-full bg-[#072030]/60 rounded-2xl border border-[#1d435a] p-2" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="68%" data={radarData}>
                      <PolarGrid stroke="#334155" />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: '#cbd5e1', fontSize: 10, fontWeight: 700 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
                      <Radar
                        name={user.displayName}
                        dataKey="value"
                        stroke="#a3e635"
                        strokeWidth={2}
                        fill="#84cc16"
                        fillOpacity={0.35}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* Reset Player Stats Button */}
                {playerStats.totalStars > 0 && (
                  <button
                    type="button"
                    onClick={handleResetProgress}
                    className="w-full py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>تصفير نجوم وإحصائيات هذا اللاعب</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Row 3: تغيير الصورة (Change Avatar, Edit Name & Switch Active Player) */}
          <div className="rounded-[22px] overflow-hidden border border-[#244e68] bg-gradient-to-b from-[#0b2b3d] to-[#061a26] shadow-lg">
            <button
              type="button"
              onClick={() => handleToggleSection('AVATAR')}
              className="w-full h-16 px-5 flex items-center justify-between cursor-pointer hover:brightness-110 transition-all"
            >
              {/* Right side in RTL: Sky-Blue Camera Icon + "تغيير الصورة" */}
              <div className="flex items-center gap-3.5">
                <svg className="w-9 h-9 shrink-0 drop-shadow" viewBox="0 0 48 48">
                  <rect x="6" y="14" width="36" height="26" rx="6" fill="#38bdf8" stroke="#041824" strokeWidth="2.5" />
                  <path d="M16,14 L19,9 H29 L32,14 Z" fill="#7dd3fc" stroke="#041824" strokeWidth="2.2" />
                  <circle cx="24" cy="27" r="7.5" fill="#f8fafc" stroke="#041824" strokeWidth="2.5" />
                  <circle cx="24" cy="27" r="3.5" fill="#0284c7" />
                  <circle cx="35" cy="20" r="2" fill="#041824" />
                </svg>
                <span className="text-lg sm:text-xl font-black text-white">تغيير الصورة</span>
              </div>

              {/* Left side in RTL: Chevron Down */}
              <ChevronDown
                className={`w-6 h-6 text-[#94b8d0] stroke-[2.8] transition-transform duration-200 ${
                  openSection === 'AVATAR' ? 'rotate-180 text-white' : ''
                }`}
              />
            </button>

            {openSection === 'AVATAR' && (
              <div className="px-4 pb-5 pt-3 border-t border-[#1b3d52] space-y-4 bg-[#04131d]">
                {/* Avatar Picker Grid */}
                <div>
                  <span className="block text-xs font-bold text-slate-300 mb-2.5">
                    اختر الصورة الرمزية لحساب «{user.displayName}»:
                  </span>
                  <div className="grid grid-cols-5 gap-2.5">
                    {AVATAR_GALLERY.map(item => {
                      const isSelected = user.avatar === item.url;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={savingProfile}
                          onClick={() => handleSaveProfileChanges(item.url, editName)}
                          className={`relative rounded-2xl p-1 border-2 transition-all cursor-pointer flex flex-col items-center gap-1 ${
                            isSelected
                              ? 'border-lime-400 bg-lime-400/15 scale-105'
                              : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
                          }`}
                        >
                          <img
                            src={item.url}
                            alt={item.label}
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 rounded-full object-cover"
                          />
                          <span className="text-[10px] font-bold text-slate-300 line-clamp-1">
                            {item.label}
                          </span>
                          {isSelected && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-lime-400 text-slate-950 flex items-center justify-center">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Edit Display Name Input */}
                <div className="pt-2 border-t border-slate-800/80">
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    تعديل الاسم المعروض للاعب:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="اسم اللاعب..."
                      className="flex-1 px-3.5 py-2 rounded-xl bg-[#072030] border border-[#244e68] text-white text-xs font-bold focus:outline-none focus:border-lime-400"
                    />
                    <button
                      type="button"
                      disabled={savingProfile}
                      onClick={() => handleSaveProfileChanges(user.avatar, editName)}
                      className="px-4 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-black text-xs transition-colors cursor-pointer"
                    >
                      حفظ الاسم
                    </button>
                  </div>
                </div>

                {/* Quick Player Switcher so user can see stats dynamically change per player */}
                <div className="pt-3 border-t border-slate-800/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      <span>تبديل اللاعب النشط لمعاينة بياناته المستقلة:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate('PROFILES')}
                      className="text-[11px] text-sky-400 hover:underline font-bold cursor-pointer"
                    >
                      إدارة كل الحسابات ←
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {allPlayers.map(p => {
                      const isCurrent = p.username === user.username;
                      const pWins = Object.keys(p.completedLevels || {}).length + (p.multiplayerWins || 0);
                      return (
                        <button
                          key={p.username}
                          type="button"
                          onClick={() => handleSwitchPlayer(p.username)}
                          className={`p-2 rounded-xl border text-right flex items-center justify-between transition-all cursor-pointer ${
                            isCurrent
                              ? 'border-lime-400 bg-lime-400/10'
                              : 'border-slate-800 bg-[#072030]/70 hover:border-slate-600'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <img
                              src={p.avatar}
                              alt={p.displayName}
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-full object-cover shrink-0"
                            />
                            <div className="truncate">
                              <div className="text-xs font-bold text-white truncate">{p.displayName}</div>
                              <div className="text-[10px] text-slate-400 tabular-nums">
                                مستوى {p.level} · {pWins} فوز
                              </div>
                            </div>
                          </div>
                          {isCurrent && <Check className="w-3.5 h-3.5 text-lime-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
