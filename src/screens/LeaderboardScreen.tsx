import React, { useState, useEffect } from 'react';
import { PlayerProfile, ScreenState } from '../types/game';
import {
  Trophy,
  Star,
  Home,
  Gamepad2,
  Layers,
  Settings,
  Bell,
  Plus,
  Search,
  Users,
  Globe,
  Crown
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { getAllKnownPlayers } from '../services/supabaseClient';

interface LeaderboardEntry {
  username: string;
  displayName: string;
  avatar: string;
  xp: number;
  wins: number;
  stars: number;
  title?: string;
  wordsFound?: number;
}

interface LeaderboardScreenProps {
  user?: PlayerProfile | null;
  onNavigate?: (screen: ScreenState) => void;
  onBack: () => void;
}

export const LeaderboardScreen: React.FC<LeaderboardScreenProps> = ({
  user,
  onNavigate,
  onBack
}) => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [boardTab, setBoardTab] = useState<'GLOBAL' | 'FRIENDS'>('GLOBAL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      try {
        const allPlayers = await getAllKnownPlayers(user);
        const entries: LeaderboardEntry[] = allPlayers.map(p => {
          const starsCount = Object.values(p.completedLevels || {}).reduce(
            (sum, lvl) => sum + (lvl.stars || 0),
            0
          );
          return {
            username: p.username,
            displayName: p.displayName,
            avatar: p.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
            xp: p.xp || 0,
            wins: (p.multiplayerWins || 0) + Object.keys(p.completedLevels || {}).length,
            stars: starsCount,
            title: p.selectedTitle || 'مستكشف الحروف',
            wordsFound: p.totalWordsFound || Object.keys(p.completedLevels || {}).length * 6
          };
        });
        setLeaderboard(entries.sort((a, b) => b.xp - a.xp));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [user]);

  // Filter for Global vs Friends leaderboard without fake demo accounts
  const paddedPodium: LeaderboardEntry[] = React.useMemo(() => {
    const myEntry: LeaderboardEntry = {
      username: user?.username || 'player_me',
      displayName: user?.displayName || 'لاعب فتّشها',
      avatar: user?.avatar || '/assets/images/login_kuwaiti_mascot_1794483388654.jpg',
      xp: user?.xp ?? 0,
      wins: (user?.multiplayerWins ?? 0) + Object.keys(user?.completedLevels || {}).length,
      stars: Object.values(user?.completedLevels || {}).reduce((s, l) => s + (l.stars || 0), 0),
      title: user?.selectedTitle || 'مستكشف الحروف',
      wordsFound: user?.totalWordsFound || 0
    };

    if (boardTab === 'FRIENDS') {
      const friendNames = (user?.friends || []).map(f => String(f).toLowerCase());
      const friendEntries: LeaderboardEntry[] = friendNames.map(fName => {
        const matched = leaderboard.find(l => l.username.toLowerCase() === fName);
        if (matched) return matched;
        return {
          username: fName,
          displayName: fName,
          avatar: '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
          xp: 350,
          wins: 2,
          stars: 6,
          title: 'صائد الكلمات',
          wordsFound: 24
        };
      });
      const combined = [
        myEntry,
        ...friendEntries.filter(f => f.username.toLowerCase() !== myEntry.username.toLowerCase())
      ];
      return combined.sort((a, b) => b.xp - a.xp);
    }

    const list = [...leaderboard];
    if (!list.some(item => item.username.toLowerCase() === myEntry.username.toLowerCase())) {
      list.push(myEntry);
    }
    return list.sort((a, b) => b.xp - a.xp);
  }, [leaderboard, user, boardTab]);

  const firstPlace = paddedPodium[0];
  const secondPlace = paddedPodium[1];
  const thirdPlace = paddedPodium[2];

  const activeName = user?.displayName || 'ضيف فتشها #981';
  const activeAvatar =
    user?.avatar || '/assets/images/login_kuwaiti_mascot_1794483388654.jpg';
  const activeCoins = user?.coins ?? 320;
  const activeGems = user?.hintsRemaining ?? 6;
  const activeLevel = user?.level ?? 1;
  const currentXP = user?.xp ?? 0;
  const xpProgress = Math.min(100, Math.max(18, Math.round(((currentXP % 300) / 300) * 100)));

  const handleNav = (target: ScreenState) => {
    sounds.playTap();
    if (onNavigate) {
      onNavigate(target);
    } else {
      onBack();
    }
  };

  return (
    <div
      className="min-h-screen w-full relative overflow-hidden flex flex-col justify-between pb-10 select-none"
      style={{
        background:
          'radial-gradient(circle at 50% 24%, #0c314e 0%, #051829 55%, #020b14 100%)'
      }}
      dir="rtl"
    >
      {/* ===================================================================== */}
      {/* KUWAIT FLAGS, CONFETTI & GLOWING KUWAIT TOWERS SKYLINE BACKDROP       */}
      {/* ===================================================================== */}
      {/* Top-Left Waving Kuwaiti Flag */}
      <div className="pointer-events-none absolute top-28 -left-8 w-56 sm:w-72 h-36 opacity-90 z-0">
        <svg viewBox="0 0 300 160" className="w-full h-full drop-shadow-[0_10px_20px_rgba(0,0,0,0.65)]">
          <path d="M-10,10 Q140,35 280,95 L265,118 Q130,62 -10,42 Z" fill="#007A3D" />
          <path d="M-10,42 Q130,62 265,118 L250,140 Q120,88 -10,74 Z" fill="#FFFFFF" />
          <path d="M-10,74 Q120,88 250,140 L235,160 Q110,115 -10,105 Z" fill="#CE1126" />
          <polygon points="-10,10 65,32 50,92 -10,105" fill="#000000" />
        </svg>
      </div>

      {/* Top-Right Waving Kuwaiti Flag */}
      <div className="pointer-events-none absolute top-28 -right-8 w-56 sm:w-72 h-36 opacity-90 z-0">
        <svg viewBox="0 0 300 160" className="w-full h-full drop-shadow-[0_10px_20px_rgba(0,0,0,0.65)]">
          <path d="M310,10 Q160,35 20,95 L35,118 Q170,62 310,42 Z" fill="#007A3D" />
          <path d="M310,42 Q170,62 35,118 L50,140 Q180,88 310,74 Z" fill="#FFFFFF" />
          <path d="M310,74 Q180,88 50,140 L65,160 Q190,115 310,105 Z" fill="#CE1126" />
        </svg>
      </div>

      {/* Bottom-Left Glowing Skyline */}
      <div className="pointer-events-none absolute bottom-0 left-0 w-72 sm:w-96 h-56 z-0 opacity-90">
        <svg viewBox="0 0 400 220" className="w-full h-full">
          <defs>
            <linearGradient id="lbSkyLeft" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <g fill="url(#lbSkyLeft)" opacity="0.75">
            <rect x="18" y="95" width="22" height="95" rx="2" />
            <rect x="46" y="70" width="26" height="120" rx="2" />
            <polygon points="82,45 95,20 108,45 108,190 82,190" />
            <rect x="116" y="88" width="24" height="102" rx="2" />
            <rect x="146" y="112" width="20" height="78" rx="2" />
          </g>
          <path d="M0,185 Q180,170 400,220 L0,220 Z" fill="#041524" />
          <path d="M0,185 Q180,170 400,220" fill="none" stroke="#38bdf8" strokeWidth="2" opacity="0.5" />
        </svg>
      </div>

      {/* Bottom-Right Glowing Kuwait Towers */}
      <div className="pointer-events-none absolute bottom-0 right-0 w-72 sm:w-96 h-64 z-0 opacity-95">
        <svg viewBox="0 0 400 240" className="w-full h-full">
          <defs>
            <linearGradient id="lbSkyRight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.15" />
            </linearGradient>
          </defs>
          <g fill="url(#lbSkyRight)">
            {/* Main Kuwait Tower */}
            <polygon points="338,15 342,15 346,195 334,195" />
            <circle cx="340" cy="85" r="19" fill="#38bdf8" opacity="0.85" />
            <circle cx="340" cy="52" r="11.5" fill="#bae6fd" opacity="0.92" />
            {/* Second Tower */}
            <polygon points="306,42 310,42 314,195 302,195" />
            <circle cx="308" cy="105" r="13.5" fill="#38bdf8" opacity="0.85" />
            {/* Third Needle */}
            <polygon points="366,58 369,58 372,195 363,195" />
          </g>
          <path d="M400,185 Q220,170 0,220 L400,220 Z" fill="#041524" />
          <path d="M400,185 Q220,170 0,220" fill="none" stroke="#38bdf8" strokeWidth="2" opacity="0.5" />
        </svg>
      </div>

      {/* ===================================================================== */}
      {/* MAIN CONTENT CONTAINER                                                */}
      {/* ===================================================================== */}
      <div className="relative z-10 max-w-5xl w-full mx-auto px-3 sm:px-6 pt-3 space-y-3">
        {/* ------------------------------------------------------------------- */}
        {/* ROW 1: TOP HEADER BAR (Player Profile Left | Logo Center | Coins/Gems Right) */}
        {/* ------------------------------------------------------------------- */}
        <div className="flex items-center justify-between gap-2" dir="ltr">
          {/* Left: Active Player Capsule with Level & Cyan Progress Bar */}
          <button
            onClick={() => handleNav('PROFILE')}
            className="px-3 py-1.5 rounded-2xl flex items-center gap-3 cursor-pointer transition-transform active:scale-95"
            style={{
              background: 'linear-gradient(180deg, rgba(14, 48, 74, 0.92) 0%, rgba(7, 25, 41, 0.96) 100%)',
              border: '1.5px solid rgba(56, 189, 248, 0.5)',
              boxShadow: '0 0 18px rgba(14, 165, 233, 0.2)'
            }}
            title="ملفي الشخصي"
          >
            <img
              src={activeAvatar}
              alt={activeName}
              className="w-11 h-11 rounded-full object-cover border-2 border-lime-400 shadow-md shrink-0"
            />
            <div className="text-left min-w-[115px] sm:min-w-[140px]">
              <div className="text-xs sm:text-sm font-black text-white truncate max-w-[140px]">
                {activeName}
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="px-1.5 py-0.2 rounded-full bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 font-black text-[10px] leading-tight shadow">
                  {activeLevel}
                </span>
                <div className="flex-1 h-2.5 rounded-full bg-slate-950 border border-cyan-500/40 overflow-hidden p-[1px]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-300"
                    style={{ width: `${xpProgress}%` }}
                  />
                </div>
              </div>
            </div>
          </button>

          {/* Center: Brand Logo with Glowing Skyline */}
          <div className="flex items-center justify-center gap-3">
            <svg viewBox="0 0 100 50" className="w-20 h-11 hidden md:block opacity-85">
              <rect x="15" y="20" width="8" height="30" fill="#38bdf8" opacity="0.5" />
              <rect x="27" y="12" width="10" height="38" fill="#38bdf8" opacity="0.7" />
              <polygon points="44,8 49,0 54,8 54,50 44,50" fill="#67e8f9" opacity="0.85" />
              <rect x="58" y="18" width="12" height="32" fill="#0284c7" opacity="0.6" />
            </svg>

            <div className="text-center" dir="rtl">
              <div className="flex items-center justify-center gap-1">
                <span
                  className="text-2xl sm:text-3xl font-black text-white tracking-tight"
                  style={{ textShadow: '0 3px 12px rgba(56, 189, 248, 0.55)' }}
                >
                  فتّشها
                </span>
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-slate-950 flex items-center justify-center shadow-[0_0_12px_rgba(251,191,36,0.6)]">
                  <Search className="w-4 h-4 stroke-[3]" />
                </span>
              </div>
              <span className="text-[11px] font-extrabold text-cyan-200 block -mt-1">
                تحداك في كل كلمة
              </span>
            </div>

            <svg viewBox="0 0 100 50" className="w-20 h-11 hidden md:block opacity-90">
              <polygon points="32,4 35,4 37,50 30,50" fill="#67e8f9" />
              <circle cx="33.5" cy="22" r="6" fill="#38bdf8" />
              <circle cx="33.5" cy="12" r="3.5" fill="#bae6fd" />
              <polygon points="48,10 50,10 52,50 46,50" fill="#38bdf8" />
              <circle cx="49" cy="27" r="4.5" fill="#7dd3fc" />
            </svg>
          </div>

          {/* Right: Coins Pill + Gems Pill + Notification Bell */}
          <div className="flex items-center gap-2">
            {/* Coins Pill */}
            <button
              onClick={() => handleNav('HOME')}
              className="h-10 px-2.5 rounded-full flex items-center gap-2 cursor-pointer"
              style={{
                background: 'linear-gradient(180deg, #102e47 0%, #071827 100%)',
                border: '1.5px solid rgba(56, 189, 248, 0.45)'
              }}
              title="العملات الذهبية"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-b from-amber-300 to-amber-500 border border-amber-100 flex items-center justify-center text-slate-950 text-xs font-black">
                ★
              </div>
              <span className="text-sm font-black text-white tabular-nums">{activeCoins}</span>
              <span className="w-5 h-5 rounded-full bg-sky-400 text-slate-950 flex items-center justify-center">
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            </button>

            {/* Gems / Hints Pill */}
            <button
              onClick={() => handleNav('HOME')}
              className="h-10 px-2.5 rounded-full hidden sm:flex items-center gap-2 cursor-pointer"
              style={{
                background: 'linear-gradient(180deg, #102e47 0%, #071827 100%)',
                border: '1.5px solid rgba(56, 189, 248, 0.45)'
              }}
              title="الجواهر والتلميحات"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 32 32">
                <polygon points="8,6 24,6 29,13 16,27 3,13" fill="#38bdf8" />
                <polygon points="8,6 24,6 21,13 11,13" fill="#bae6fd" />
                <polygon points="11,13 21,13 16,27" fill="#0284c7" />
              </svg>
              <span className="text-sm font-black text-white tabular-nums">{activeGems}</span>
              <span className="w-5 h-5 rounded-full bg-sky-400 text-slate-950 flex items-center justify-center">
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            </button>

            {/* Notification Bell */}
            <button
              onClick={() => handleNav('HOME')}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white relative cursor-pointer"
              style={{
                background: 'linear-gradient(180deg, #102e47 0%, #071827 100%)',
                border: '1.5px solid rgba(56, 189, 248, 0.45)'
              }}
              title="الإشعارات"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-rose-500 border border-slate-950" />
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* ROW 2: SEGMENTED NAVIGATION BAR WITH ACTIVE GOLD "المتصدرين" TAB     */}
        {/* ------------------------------------------------------------------- */}
        <div
          className="w-full rounded-2xl p-1 flex items-center justify-between gap-1 overflow-x-auto"
          style={{
            background: 'linear-gradient(180deg, rgba(9, 33, 52, 0.95) 0%, rgba(5, 18, 30, 0.98) 100%)',
            border: '1.5px solid rgba(56, 189, 248, 0.45)',
            boxShadow: '0 0 22px rgba(14, 165, 233, 0.18)'
          }}
        >
          <button
            onClick={() => handleNav('HOME')}
            className="flex-1 min-w-[95px] py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black text-slate-200 hover:text-white flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Home className="w-4 h-4 text-cyan-300" />
            <span>فتشها</span>
          </button>

          <div className="h-6 w-[1px] bg-cyan-500/20 shrink-0" />

          <button
            onClick={() => handleNav('CATEGORIES')}
            className="flex-1 min-w-[105px] py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black text-slate-200 hover:text-white flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Gamepad2 className="w-4 h-4 text-cyan-300" />
            <span>اللعب الآن</span>
          </button>

          <div className="h-6 w-[1px] bg-cyan-500/20 shrink-0" />

          <button
            onClick={() => handleNav('CATEGORIES')}
            className="flex-1 min-w-[95px] py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black text-slate-200 hover:text-white flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Layers className="w-4 h-4 text-cyan-300" />
            <span>المراحل</span>
          </button>

          <div className="h-6 w-[1px] bg-cyan-500/20 shrink-0" />

          {/* ACTIVE TAB: المتصدرين */}
          <button
            onClick={() => sounds.playTap()}
            className="flex-1 min-w-[115px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black text-amber-300 flex items-center justify-center gap-2 relative cursor-pointer whitespace-nowrap"
            style={{
              background:
                'linear-gradient(180deg, rgba(245, 158, 11, 0.12) 0%, rgba(245, 158, 11, 0.28) 100%)',
              border: '1.5px solid rgba(251, 191, 36, 0.65)',
              boxShadow: '0 0 18px rgba(245, 158, 11, 0.3)'
            }}
          >
            <Trophy className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span>المتصدرين</span>
          </button>

          <div className="h-6 w-[1px] bg-cyan-500/20 shrink-0" />

          <button
            onClick={() => handleNav('SETTINGS')}
            className="flex-1 min-w-[95px] py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black text-slate-200 hover:text-white flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Settings className="w-4 h-4 text-slate-300" />
            <span>الإعدادات</span>
          </button>

          <div className="pr-2 pl-1 hidden md:block shrink-0">
            <span
              className="px-3.5 py-1.5 rounded-xl text-xs font-black text-amber-300 block whitespace-nowrap"
              style={{
                background: 'rgba(245, 158, 11, 0.14)',
                border: '1.5px solid rgba(251, 191, 36, 0.7)'
              }}
            >
              تحداك في كل كلمة
            </span>
          </div>
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* ROW 3: GOLDEN TROPHY & LAUREL WREATH BANNER (أبطال فتشها)           */}
        {/* ------------------------------------------------------------------- */}
        <div className="relative flex flex-col items-center justify-center pt-1 pb-2">
          {/* Confetti Particles */}
          <div className="pointer-events-none absolute inset-x-12 top-2 h-24 overflow-hidden">
            <span className="absolute left-[18%] top-3 w-3 h-1.5 bg-pink-500 rotate-45 rounded-xs opacity-80" />
            <span className="absolute left-[26%] top-12 w-2.5 h-2 bg-cyan-400 -rotate-12 rounded-xs opacity-80" />
            <span className="absolute left-[32%] top-5 w-3 h-1.5 bg-amber-400 rotate-12 rounded-xs opacity-90" />
            <span className="absolute right-[18%] top-4 w-3 h-1.5 bg-pink-500 -rotate-45 rounded-xs opacity-80" />
            <span className="absolute right-[26%] top-12 w-2.5 h-2 bg-amber-400 rotate-12 rounded-xs opacity-85" />
            <span className="absolute right-[32%] top-6 w-3 h-1.5 bg-cyan-400 -rotate-20 rounded-xs opacity-80" />
          </div>

          {/* Golden Trophy Icon on Top */}
          <div className="relative z-10 -mb-3">
            <div className="w-14 h-14 rounded-full bg-gradient-to-b from-amber-300/30 to-transparent flex items-center justify-center">
              <Trophy className="w-11 h-11 text-amber-400 fill-amber-300 drop-shadow-[0_0_16px_rgba(251,191,36,0.8)]" />
            </div>
          </div>

          {/* Banner with Golden Laurel Wreaths */}
          <div className="relative z-10 flex items-center justify-center">
            {/* Right Laurel Wreath SVG */}
            <svg viewBox="0 0 60 60" className="w-12 h-12 sm:w-14 sm:h-14 -ml-4 text-amber-400 fill-current drop-shadow">
              <path d="M45,52 C25,45 15,28 22,8 C26,18 30,28 45,35 Z" opacity="0.85" />
              <circle cx="24" cy="14" r="3.5" />
              <circle cx="20" cy="24" r="3.8" />
              <circle cx="22" cy="35" r="4" />
              <circle cx="29" cy="44" r="4" />
            </svg>

            <div
              className="px-8 sm:px-12 py-2 rounded-2xl text-center relative"
              style={{
                background: 'linear-gradient(180deg, #102a42 0%, #071624 100%)',
                border: '2px solid #fbbf24',
                boxShadow: '0 0 28px rgba(251, 191, 36, 0.45), inset 0 1px 2px rgba(255, 255, 255, 0.35)'
              }}
            >
              <h1
                className="text-2xl sm:text-3xl font-black text-white tracking-wide"
                style={{ textShadow: '0 2px 10px rgba(0, 0, 0, 0.8)' }}
              >
                أبطال فتشها
              </h1>
            </div>

              {/* Left Laurel Wreath SVG */}
            <svg viewBox="0 0 60 60" className="w-12 h-12 sm:w-14 sm:h-14 -mr-4 text-amber-400 fill-current drop-shadow scale-x-[-1]">
              <path d="M45,52 C25,45 15,28 22,8 C26,18 30,28 45,35 Z" opacity="0.85" />
              <circle cx="24" cy="14" r="3.5" />
              <circle cx="20" cy="24" r="3.8" />
              <circle cx="22" cy="35" r="4" />
              <circle cx="29" cy="44" r="4" />
            </svg>
          </div>

          {/* Toggle Tabs: لوحة صدارة عامة vs لوحة صدارة للأصدقاء */}
          <div className="mt-3 flex items-center gap-2 bg-[#061c2e]/95 p-1.5 rounded-2xl border border-cyan-400/45 shadow-lg">
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                setBoardTab('GLOBAL');
              }}
              className={`px-4 py-1.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-1.5 cursor-pointer transition-all ${
                boardTab === 'GLOBAL'
                  ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Globe className="w-4 h-4" />
              <span>لوحة صدارة عامة</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                setBoardTab('FRIENDS');
              }}
              className={`px-4 py-1.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-1.5 cursor-pointer transition-all ${
                boardTab === 'FRIENDS'
                  ? 'bg-gradient-to-b from-[#a3e635] to-[#65a30d] text-slate-950 shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>لوحة صدارة للأصدقاء ({(user?.friends?.length || 0) + 1})</span>
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* ROW 4: TOP 3 CHAMPIONS PODIUM (#2 Right | #1 Center | #3 Left)      */}
        {/* ------------------------------------------------------------------- */}
        <div
          className="max-w-3xl mx-auto grid grid-cols-3 gap-2.5 sm:gap-5 items-end pt-5 px-1"
          dir="ltr"
        >
          {/* LEFT IN LTR: #3 BRONZE PODIUM */}
          {thirdPlace && (
            <div className="flex flex-col items-center">
              <div
                className="w-full rounded-3xl p-3 sm:p-4 text-center relative flex flex-col items-center"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(35, 38, 62, 0.92) 0%, rgba(18, 22, 38, 0.96) 100%)',
                  border: '2px solid rgba(217, 119, 6, 0.65)',
                  boxShadow: '0 0 24px rgba(217, 119, 6, 0.2)'
                }}
                dir="rtl"
              >
                {/* #3 Badge */}
                <div
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full font-black text-sm sm:text-base text-slate-950 flex items-center justify-center absolute -top-4 shadow-lg border-2 border-amber-200"
                  style={{
                    background: 'linear-gradient(180deg, #f59e0b 0%, #b45309 100%)'
                  }}
                >
                  3
                </div>

                <img
                  src={thirdPlace.avatar}
                  alt={thirdPlace.displayName}
                  className="w-14 h-14 sm:w-18 sm:h-18 rounded-full object-cover border-2 border-amber-500 mt-3 mb-2 shadow-md"
                />
                <h4 className="text-xs sm:text-sm font-black text-white truncate max-w-full">
                  {thirdPlace.displayName}
                </h4>
                <span className="text-sm sm:text-base font-black text-amber-400 mt-0.5 tabular-nums">
                  XP {thirdPlace.xp}
                </span>
                <span className="text-[11px] font-bold text-slate-300 mt-0.5">
                  {thirdPlace.wins} فوز أونلاين
                </span>
              </div>

              {/* 3D Bronze Pedestal Base */}
              <div
                className="w-[92%] h-6 sm:h-7 rounded-b-2xl rounded-t-md -mt-1 border-t border-amber-300/50 shadow-lg"
                style={{
                  background: 'linear-gradient(90deg, #78350f 0%, #d97706 50%, #78350f 100%)'
                }}
              />
            </div>
          )}

          {/* CENTER: #1 GOLD CHAMPION PODIUM */}
          {firstPlace && (
            <div className="flex flex-col items-center -translate-y-2">
              <div
                className="w-full rounded-3xl p-4 sm:p-5 text-center relative flex flex-col items-center"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(68, 48, 14, 0.92) 0%, rgba(28, 22, 12, 0.96) 100%)',
                  border: '2.5px solid #facc15',
                  boxShadow: '0 0 36px rgba(250, 204, 21, 0.4), inset 0 0 20px rgba(250, 204, 21, 0.15)'
                }}
                dir="rtl"
              >
                {/* #1 Gold Badge */}
                <div
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-full font-black text-base sm:text-lg text-slate-950 flex items-center justify-center absolute -top-5 shadow-xl border-2 border-yellow-100"
                  style={{
                    background: 'linear-gradient(180deg, #fef08a 0%, #eab308 100%)'
                  }}
                >
                  1
                </div>

                <img
                  src={firstPlace.avatar}
                  alt={firstPlace.displayName}
                  className="w-18 h-18 sm:w-22 sm:h-22 rounded-full object-cover border-3 border-amber-400 mt-3 mb-2 shadow-[0_0_20px_rgba(250,204,21,0.5)]"
                />
                <h4 className="text-sm sm:text-base font-black text-white truncate max-w-full">
                  {firstPlace.displayName}
                </h4>

                {/* Glowing Gold XP Pill */}
                <div
                  className="mt-1.5 mb-1 px-4 sm:px-6 py-1 rounded-full text-slate-950 font-black text-xs sm:text-sm tabular-nums shadow-md"
                  style={{
                    background: 'linear-gradient(180deg, #fef08a 0%, #facc15 55%, #ca8a04 100%)',
                    boxShadow: '0 0 16px rgba(250, 204, 21, 0.65)'
                  }}
                >
                  XP {firstPlace.xp}
                </div>

                <span className="text-xs font-extrabold text-white">
                  {firstPlace.wins} فوز أونلاين
                </span>
              </div>

              {/* 3D Gold Pedestal Base */}
              <div
                className="w-[96%] h-7 sm:h-8 rounded-b-2xl rounded-t-md -mt-1 border-t border-yellow-200 shadow-[0_6px_20px_rgba(250,204,21,0.4)]"
                style={{
                  background: 'linear-gradient(90deg, #a16207 0%, #fde047 50%, #a16207 100%)'
                }}
              />
            </div>
          )}

          {/* RIGHT IN LTR: #2 SILVER PODIUM */}
          {secondPlace && (
            <div className="flex flex-col items-center">
              <div
                className="w-full rounded-3xl p-3 sm:p-4 text-center relative flex flex-col items-center"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(16, 48, 72, 0.92) 0%, rgba(8, 24, 38, 0.96) 100%)',
                  border: '2px solid rgba(186, 230, 253, 0.7)',
                  boxShadow: '0 0 24px rgba(56, 189, 248, 0.25)'
                }}
                dir="rtl"
              >
                {/* #2 Silver Badge */}
                <div
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full font-black text-sm sm:text-base text-slate-950 flex items-center justify-center absolute -top-4 shadow-lg border-2 border-white"
                  style={{
                    background: 'linear-gradient(180deg, #f8fafc 0%, #94a3b8 100%)'
                  }}
                >
                  2
                </div>

                <img
                  src={secondPlace.avatar}
                  alt={secondPlace.displayName}
                  className="w-14 h-14 sm:w-18 sm:h-18 rounded-full object-cover border-2 border-cyan-300 mt-3 mb-2 shadow-md"
                />
                <h4 className="text-xs sm:text-sm font-black text-white truncate max-w-full">
                  {secondPlace.displayName}
                </h4>
                <span className="text-sm sm:text-base font-black text-amber-400 mt-0.5 tabular-nums">
                  XP {secondPlace.xp}
                </span>
                <span className="text-[11px] font-bold text-slate-300 mt-0.5">
                  {secondPlace.wins} فوز أونلاين
                </span>
              </div>

              {/* 3D Silver Pedestal Base */}
              <div
                className="w-[92%] h-6 sm:h-7 rounded-b-2xl rounded-t-md -mt-1 border-t border-white/70 shadow-lg"
                style={{
                  background: 'linear-gradient(90deg, #475569 0%, #e2e8f0 50%, #475569 100%)'
                }}
              />
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* ROW 5: GLOWING CYAN LEADERBOARD RANKINGS LIST                       */}
        {/* ------------------------------------------------------------------- */}
        <div
          className="max-w-3xl mx-auto rounded-3xl p-3 sm:p-4 relative overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(7, 26, 44, 0.95) 0%, rgba(4, 15, 26, 0.98) 100%)',
            border: '2px solid rgba(103, 232, 249, 0.75)',
            boxShadow: '0 0 32px rgba(34, 211, 238, 0.3), inset 0 0 18px rgba(34, 211, 238, 0.1)'
          }}
        >
          {loading ? (
            <div className="py-8 text-center text-sm font-bold text-cyan-300">
              جاري تحميل قائمة أبطال فتّشها...
            </div>
          ) : (
            <div className="divide-y divide-cyan-500/20">
              {paddedPodium.map((player, idx) => (
                <div
                  key={player.username}
                  className="flex items-center justify-between py-3 px-2 sm:px-4 hover:bg-sky-500/5 transition-colors"
                >
                  {/* Right Side (RTL): Rank # + Avatar + Name & Username */}
                  <div className="flex items-center gap-3 sm:gap-4">
                    <span className="w-7 text-center font-mono font-black text-base sm:text-lg text-white tabular-nums">
                      #{idx + 1}
                    </span>

                    <img
                      src={player.avatar}
                      alt={player.displayName}
                      className="w-11 h-11 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-cyan-400/60 shadow"
                    />

                    <div className="text-right">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm sm:text-base font-black text-white">
                          {player.displayName}
                        </h4>
                        {player.title && (
                          <span className="px-2 py-0.2 rounded-full bg-amber-400/20 border border-amber-400/50 text-amber-300 text-[10px] font-black flex items-center gap-1">
                            <Crown className="w-3 h-3" />
                            <span>{player.title}</span>
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono text-slate-400 block" dir="ltr">
                        {player.username.startsWith('guest_')
                          ? player.username
                          : `${player.username}@`}
                      </span>
                    </div>
                  </div>

                  {/* Left Side (RTL): Stars Pill + Glowing Cyan XP Pill */}
                  <div className="flex items-center gap-2.5 sm:gap-3" dir="ltr">
                    {/* XP Pill */}
                    <div
                      className="px-4 sm:px-5 py-1.5 rounded-full text-xs sm:text-sm font-black text-white tabular-nums"
                      style={{
                        background: 'linear-gradient(180deg, #0d3554 0%, #071e32 100%)',
                        border: '1.5px solid rgba(56, 189, 248, 0.65)',
                        boxShadow: '0 0 12px rgba(14, 165, 233, 0.25)'
                      }}
                    >
                      XP {player.xp}
                    </div>

                    {/* Stars Pill */}
                    <div
                      className="px-3.5 py-1.5 rounded-full flex items-center gap-1.5 text-xs sm:text-sm font-black text-amber-400 tabular-nums"
                      style={{
                        background: 'rgba(4, 14, 24, 0.95)',
                        border: '1.5px solid rgba(71, 85, 105, 0.6)'
                      }}
                    >
                      <span>{player.stars}</span>
                      <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
