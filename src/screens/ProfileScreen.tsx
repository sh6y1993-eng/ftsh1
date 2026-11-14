import React, { useState, useMemo, useEffect } from 'react';
import {
  PlayerProfile,
  ScreenState,
  AchievementCategory,
  FriendProfileSummary
} from '../types/game';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_GROUPS,
  PLAYER_TITLES,
  COSMETIC_ITEMS,
  CATEGORIES,
  findCategoryById,
  getLevelConfig
} from '../engine/gameCategories';
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
  BarChart3,
  Crown,
  Coins,
  Copy,
  DownloadCloud,
  UserPlus,
  ShoppingBag,
  Gift
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
import {
  saveUserToLocalMap,
  syncProfileWithSupabase,
  exportAccountRecoveryCode,
  restoreAccountFromRecoveryInput,
  getAllKnownPlayers,
  safeApiJson
} from '../services/supabaseClient';

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

type AccordionSection =
  | 'ACHIEVEMENTS'
  | 'TITLES_STORE'
  | 'FRIENDS_COMPARE'
  | 'STATS'
  | 'AVATAR'
  | 'RECOVERY'
  | null;

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  user,
  onUpdateUser,
  onNavigate
}) => {
  const [openSection, setOpenSection] = useState<AccordionSection>('ACHIEVEMENTS');
  const [selectedAchGroup, setSelectedAchGroup] = useState<AchievementCategory | 'ALL'>('ALL');
  const [activeChartTab, setActiveChartTab] = useState<'PROGRESSION' | 'ACCURACY_SPEED' | 'CATEGORIES'>('PROGRESSION');
  const [editName, setEditName] = useState(user.displayName);
  const [savingProfile, setSavingProfile] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [allPlayers, setAllPlayers] = useState<PlayerProfile[]>([]);

  // Friends state
  const [friendUsernameInput, setFriendUsernameInput] = useState('');
  const [compareFriend, setCompareFriend] = useState<FriendProfileSummary | null>(null);

  // Account recovery state
  const [recoveryInput, setRecoveryInput] = useState('');
  const [copiedRecovery, setCopiedRecovery] = useState(false);

  useEffect(() => {
    setEditName(user.displayName);
  }, [user.displayName]);

  useEffect(() => {
    getAllKnownPlayers(user).then(players => {
      setAllPlayers(players);
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

      const catObj = findCategoryById(catId);
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

  // Dynamic per-player KPI & Top Card Calculations
  const playerStats = useMemo(() => {
    const completedStages = Math.max(stageMetrics.length, user.completedLevelsCount || 0);
    const totalStars = stageMetrics.reduce((acc, m) => acc + m.stars, 0);
    const avgAccuracy =
      stageMetrics.length > 0
        ? Math.round(stageMetrics.reduce((acc, m) => acc + m.accuracy, 0) / stageMetrics.length)
        : 100;
    const avgSolveTime =
      stageMetrics.length > 0
        ? Math.round(stageMetrics.reduce((acc, m) => acc + m.bestTime, 0) / stageMetrics.length)
        : 0;
    const fastestTime =
      stageMetrics.length > 0
        ? [...stageMetrics].sort((a, b) => a.bestTime - b.bestTime)[0].bestTime
        : 0;
    const threeStarCount = stageMetrics.filter(m => m.stars === 3).length;
    const threeStarRate = stageMetrics.length > 0 ? Math.round((threeStarCount / stageMetrics.length) * 100) : 0;

    const totalScore =
      typeof user.totalScore === 'number' && user.totalScore > 0
        ? user.totalScore
        : stageMetrics.reduce((sum, m) => sum + m.score, 0);

    const totalWordsFound =
      typeof user.totalWordsFound === 'number' && user.totalWordsFound > 0
        ? user.totalWordsFound
        : stageMetrics.reduce((sum, m) => sum + m.wordCount, 0);

    const onlineWins = user.multiplayerWins || 0;
    const onlineLosses = user.multiplayerLosses || 0;
    const totalWins = completedStages + onlineWins;
    const totalMatches = completedStages + onlineWins + onlineLosses;
    let winRate = 0;
    if (totalMatches > 0) {
      const matchWinRatio = (totalWins / totalMatches) * 100;
      winRate = completedStages > 0 ? Math.round((matchWinRatio + avgAccuracy) / 2) : Math.round(matchWinRatio);
    }

    const perfectStages =
      typeof user.perfectStagesCount === 'number'
        ? user.perfectStagesCount
        : stageMetrics.filter(m => m.accuracy >= 100).length;

    const fastStages =
      typeof user.fastStagesCount === 'number'
        ? user.fastStagesCount
        : stageMetrics.filter(m => m.bestTime < 45).length;

    const streakDays = Math.max(
      user.dailyStreak?.currentStreak || 1,
      user.dailyStreak?.longestStreak || 1,
      user.dailyStreak?.streakHistory?.length || 1
    );

    return {
      completedStages,
      totalStars,
      avgAccuracy,
      avgSolveTime,
      fastestTime,
      threeStarRate,
      totalScore,
      totalWordsFound,
      onlineWins,
      onlineLosses,
      totalWins,
      totalMatches,
      winRate,
      perfectStages,
      fastStages,
      streakDays
    };
  }, [
    stageMetrics,
    user.completedLevelsCount,
    user.totalScore,
    user.totalWordsFound,
    user.multiplayerWins,
    user.multiplayerLosses,
    user.perfectStagesCount,
    user.fastStagesCount,
    user.dailyStreak
  ]);

  // Calculate current progress for any achievement
  const getAchievementProgress = (achId: string, category: AchievementCategory, target: number) => {
    let current = 0;
    if (category === 'EXPLORATION') {
      current = playerStats.totalWordsFound;
    } else if (category === 'SPEED') {
      if (achId === 'ach_speed_45s') {
        current = playerStats.fastestTime > 0 && playerStats.fastestTime < 45 ? 1 : playerStats.fastStages > 0 ? 1 : 0;
      } else if (achId === 'ach_speed_30s') {
        current = playerStats.fastestTime > 0 && playerStats.fastestTime < 30 ? 1 : 0;
      } else {
        current = playerStats.fastStages;
      }
    } else if (category === 'ACCURACY') {
      current = playerStats.perfectStages;
    } else if (category === 'CHALLENGE') {
      current = playerStats.totalWins;
    } else if (category === 'CONSISTENCY') {
      current = playerStats.streakDays;
    }
    return Math.min(target, current);
  };

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

  const handleToggleSection = (sec: AccordionSection) => {
    sounds.playTap();
    setOpenSection(prev => (prev === sec ? null : sec));
  };

  const persistAndSyncProfile = async (updated: PlayerProfile, toastMessage?: string) => {
    const saved = saveUserToLocalMap(updated);
    onUpdateUser(saved);
    await syncProfileWithSupabase(saved);
    if (toastMessage) {
      setStatusMsg(toastMessage);
      setTimeout(() => setStatusMsg(''), 3800);
    }
  };

  const handleSaveProfileChanges = async (newAvatarUrl?: string, newDisplayName?: string) => {
    sounds.playTap();
    setSavingProfile(true);
    setStatusMsg('');
    const nextDisplayName = (newDisplayName ?? editName).trim() || user.displayName;
    const nextAvatar = newAvatarUrl || user.avatar;

    try {
      const apiData = await safeApiJson<{ success?: boolean; user?: PlayerProfile }>('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          displayName: nextDisplayName,
          avatar: nextAvatar
        })
      });

      const updated: PlayerProfile = {
        ...(apiData?.user || user),
        displayName: nextDisplayName,
        avatar: nextAvatar
      };
      sounds.playVictory();
      await persistAndSyncProfile(updated, 'تم تحديث بيانات ملفك الشخصي بنجاح ✓');
    } catch {
      await persistAndSyncProfile(
        { ...user, displayName: nextDisplayName, avatar: nextAvatar },
        'تم حفظ الاسم والصورة الرمزية بنجاح ✓'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleEquipOrBuyTitle = async (titleLabel: string, coinPrice?: number) => {
    sounds.playTap();
    const unlocked = user.unlockedTitles || ['مستكشف الحروف'];
    if (unlocked.includes(titleLabel)) {
      sounds.playVictory();
      await persistAndSyncProfile(
        { ...user, selectedTitle: titleLabel },
        `👑 تم تفعيل لقب «${titleLabel}» في ملفك الشخصي!`
      );
      return;
    }

    if (coinPrice && (user.coins || 0) >= coinPrice) {
      sounds.playVictory();
      await persistAndSyncProfile(
        {
          ...user,
          coins: (user.coins || 0) - coinPrice,
          unlockedTitles: [...unlocked, titleLabel],
          selectedTitle: titleLabel
        },
        `🎉 مبروك! اشتريت وفعلت لقب «${titleLabel}» مقابل ${coinPrice} عملة فتّشها!`
      );
    } else {
      sounds.playError();
      setStatusMsg('هذا اللقب يُفتح عبر إنجازاتك أو بشرائه بعملات فتّشها الكافية!');
      setTimeout(() => setStatusMsg(''), 3500);
    }
  };

  const handleEquipOrBuyCosmetic = async (cosmeticId: string, name: string, coinCost: number) => {
    sounds.playTap();
    const unlocked = user.unlockedCosmetics || ['frame_default_cyan'];
    if (unlocked.includes(cosmeticId)) {
      sounds.playVictory();
      await persistAndSyncProfile(
        { ...user, selectedCosmetic: cosmeticId },
        `✨ تم تفعيل المظهر التجميلي «${name}»!`
      );
      return;
    }

    if ((user.coins || 0) >= coinCost) {
      sounds.playVictory();
      await persistAndSyncProfile(
        {
          ...user,
          coins: (user.coins || 0) - coinCost,
          unlockedCosmetics: [...unlocked, cosmeticId],
          selectedCosmetic: cosmeticId
        },
        `✨ تم شراء وتفعيل المظهر «${name}» مقابل ${coinCost} عملة فتّشها!`
      );
    } else {
      sounds.playError();
      setStatusMsg(`تحتاج إلى ${coinCost} عملة فتّشها لشراء «${name}»!`);
      setTimeout(() => setStatusMsg(''), 3500);
    }
  };

  const handleClaimEconomyReward = async (type: 'DAILY' | 'WEEKLY') => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const weekKey = `${new Date().getFullYear()}_W${Math.ceil(new Date().getDate() / 7)}`;
    const storageKey = `fatteshha_reward_${type}_${user.username}`;
    const lastClaim = localStorage.getItem(storageKey);

    if ((type === 'DAILY' && lastClaim === todayKey) || (type === 'WEEKLY' && lastClaim === weekKey)) {
      sounds.playError();
      setStatusMsg(
        type === 'DAILY'
          ? 'لقد استلمت مكافأتك اليومية اليوم بالفعل! عد غداً 🎁'
          : 'لقد استلمت المكافأة الأسبوعية هذا الأسبوع بالفعل! 🎉'
      );
      setTimeout(() => setStatusMsg(''), 3500);
      return;
    }

    sounds.playVictory();
    localStorage.setItem(storageKey, type === 'DAILY' ? todayKey : weekKey);
    const addCoins = type === 'DAILY' ? 120 : 450;
    const addHints = type === 'DAILY' ? 2 : 6;
    const addXP = type === 'DAILY' ? 80 : 250;
    const nextXP = (user.xp || 0) + addXP;

    await persistAndSyncProfile(
      {
        ...user,
        coins: (user.coins || 0) + addCoins,
        hintsRemaining: (user.hintsRemaining || 0) + addHints,
        xp: nextXP,
        level: Math.floor(nextXP / 300) + 1
      },
      type === 'DAILY'
        ? `🎁 استلمت المكافأة اليومية: +${addCoins} عملة فتّشها و +${addHints} تلميحات!`
        : `👑 استلمت المكافأة الأسبوعية: +${addCoins} عملة فتّشها و +${addHints} تلميحات!`
    );
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    sounds.playTap();
    const cleanTarget = friendUsernameInput.trim().toLowerCase().replace(/^@/, '');
    if (!cleanTarget || cleanTarget === user.username.toLowerCase()) {
      setStatusMsg('يرجى إدخال اسم مستخدم صحيح لصديقك');
      return;
    }

    // Search in known players or create friend summary
    const foundPlayer = allPlayers.find(
      p =>
        p.username.toLowerCase() === cleanTarget ||
        p.displayName.toLowerCase() === friendUsernameInput.trim().toLowerCase()
    );

    const newFriend: FriendProfileSummary = {
      id: foundPlayer ? foundPlayer.id : `usr_${cleanTarget}`,
      username: foundPlayer ? foundPlayer.username : cleanTarget,
      displayName: foundPlayer ? foundPlayer.displayName : friendUsernameInput.trim(),
      avatar: foundPlayer
        ? foundPlayer.avatar
        : '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
      level: foundPlayer ? foundPlayer.level : 2,
      xp: foundPlayer ? foundPlayer.xp : 420,
      totalScore: foundPlayer ? foundPlayer.totalScore : 1850,
      totalWordsFound: foundPlayer ? (foundPlayer.totalWordsFound || 18) : 18,
      completedLevelsCount: foundPlayer ? Object.keys(foundPlayer.completedLevels || {}).length : 3,
      multiplayerWins: foundPlayer ? foundPlayer.multiplayerWins : 2,
      multiplayerLosses: foundPlayer ? foundPlayer.multiplayerLosses : 0,
      selectedTitle: foundPlayer?.selectedTitle || 'صائد الكلمات',
      onlineStatus: 'ONLINE'
    };

    const existingFriends = (user.friends || []).map(f => String(f));
    if (existingFriends.some(f => f.toLowerCase() === newFriend.username.toLowerCase())) {
      setStatusMsg('هذا الصديق مضاف بالفعل في قائمتك!');
      return;
    }

    setFriendUsernameInput('');
    setCompareFriend(newFriend);
    sounds.playVictory();
    await persistAndSyncProfile(
      {
        ...user,
        friends: [...existingFriends, newFriend.username]
      },
      `👥 تمت إضافة «${newFriend.displayName}» إلى قائمة الأصدقاء!`
    );
  };

  const handleClaimDailyTask = async (taskId: string) => {
    sounds.playTap();
    try {
      const data = await safeApiJson<{
        success?: boolean;
        user?: PlayerProfile;
        rewardCoins?: number;
        rewardXP?: number;
      }>('/api/daily-challenges/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, taskId })
      });
      if (data?.success && data.user) {
        sounds.playVictory();
        await persistAndSyncProfile(
          data.user,
          `كفو! استلمت +${data.rewardCoins} عملة فتّشها و +${data.rewardXP} XP 🎉`
        );
      }
    } catch {
      // ignore
    }
  };

  const handleRerollDailyTasks = async () => {
    sounds.playTap();
    const data = await safeApiJson<{ success?: boolean; user?: PlayerProfile }>(
      '/api/daily-challenges/reroll',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username })
      }
    );
    if (data?.success && data.user) {
      await persistAndSyncProfile(data.user, 'تم توليد 3 تحديات يومية عشوائية جديدة!');
    }
  };

  const handleResetProgress = async () => {
    sounds.playTap();
    const resetUser: PlayerProfile = {
      ...user,
      completedLevels: {},
      completedLevelsCount: 0,
      totalScore: 0,
      totalWordsFound: 0
    };
    await persistAndSyncProfile(resetUser, 'تم تصفير نجوم ومراحل هذا اللاعب بنجاح.');
  };

  const handleCopyRecoveryCode = () => {
    sounds.playTap();
    const code = exportAccountRecoveryCode(user);
    navigator.clipboard.writeText(code);
    setCopiedRecovery(true);
    setStatusMsg('تم نسخ رمز استعادة الحساب والتقدم! احتفظ به لاستعادة حسابك على أي جهاز آخر 📋');
    setTimeout(() => {
      setCopiedRecovery(false);
      setStatusMsg('');
    }, 3500);
  };

  const handleRestoreAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    sounds.playTap();
    try {
      const restored = await restoreAccountFromRecoveryInput(recoveryInput);
      sounds.playVictory();
      onUpdateUser(restored);
      setRecoveryInput('');
      setStatusMsg(`✅ تمت استعادة الحساب «${restored.displayName}» وتقدمه الكامل بنجاح!`);
      setTimeout(() => setStatusMsg(''), 4000);
    } catch (err: any) {
      sounds.playError();
      setStatusMsg(err?.message || 'تعذر استعادة الحساب، تأكد من صحة الرمز');
    }
  };

  const currentLevel = user.level || 1;
  const currentXP = user.xp || 0;
  const targetXP = currentLevel * 300;
  const xpInLevel = currentXP % 300;
  const xpFillPercent = Math.min(100, Math.max(8, Math.round((xpInLevel / 300) * 100)));
  const dailyTasks = user.dailyChallenges?.tasks || [];
  const activeTitle = user.selectedTitle || 'مستكشف الحروف';
  const activeCosmeticObj =
    COSMETIC_ITEMS.find(c => c.id === user.selectedCosmetic) || COSMETIC_ITEMS[0];

  const filteredAchievements = useMemo(() => {
    if (selectedAchGroup === 'ALL') return ACHIEVEMENTS;
    return ACHIEVEMENTS.filter(a => a.category === selectedAchGroup);
  }, [selectedAchGroup]);

  return (
    <div
      dir="rtl"
      className="safe-screen fixed inset-0 z-40 w-full h-dvh bg-[#02131f] flex flex-col overflow-y-auto overflow-x-hidden select-none"
    >
      {/* Ambient dark-teal blurred backdrop */}
      <div
        className="fixed inset-0 bg-cover bg-center scale-110 blur-3xl opacity-30 pointer-events-none"
        style={{
          backgroundImage: `url('/assets/images/login_kuwaiti_mascot_1794483388654.jpg')`
        }}
      />
      <div className="fixed inset-0 bg-gradient-to-b from-[#031d2e]/90 via-[#021420]/95 to-[#010c14] pointer-events-none" />

      <div className="relative z-10 w-full flex-1 flex flex-col bg-gradient-to-b from-[#031b2b]/90 via-[#031522]/95 to-[#010e17]">
        {/* 1. Top Header & Kuwait Skyline with Avatar & Cosmetic Frame */}
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
              <rect x="8" y="108" width="22" height="55" fill="#093854" />
              <rect x="34" y="118" width="16" height="45" fill="#072d44" />
              <polygon points="68,20 72,162 64,162" fill="url(#profTowerLit)" />
              <circle cx="68" cy="88" r="14.5" fill="#0d4466" stroke="#38bdf8" strokeWidth="1.2" />
              <circle cx="68" cy="58" r="9" fill="#0d4466" stroke="#38bdf8" strokeWidth="1" />
              <polygon points="96,52 99,162 93,162" fill="url(#profTowerLit)" />
              <circle cx="96" cy="105" r="9.5" fill="#0d4466" stroke="#38bdf8" strokeWidth="1" />
              <rect x="114" y="112" width="20" height="50" fill="#08324b" />
              <rect x="345" y="122" width="18" height="40" fill="#062639" />
              <rect x="368" y="108" width="18" height="54" fill="#08324b" />
              <polygon points="396,38 400,162 392,162" fill="url(#profTowerLit)" />
              <circle cx="396" cy="96" r="11" fill="#0d4466" stroke="#38bdf8" strokeWidth="1.2" />
              <polygon points="416,66 419,162 413,162" fill="url(#profTowerLit)" />
              <polygon points="444,10 450,162 438,162" fill="url(#profTowerLit)" />
              <circle cx="444" cy="82" r="16.5" fill="#0d4466" stroke="#7dd3fc" strokeWidth="1.5" />
              <circle cx="444" cy="48" r="10.5" fill="#0d4466" stroke="#7dd3fc" strokeWidth="1.2" />
              <path d="M0,154 Q250,134 500,154 L500,180 L0,180 Z" fill="#021522" />
            </svg>
          </div>

          {/* Top Bar */}
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
              ملفي الشخصي المستقل
            </h1>

            <div className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/60 flex items-center gap-1.5 text-xs font-black text-amber-300">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>{user.coins ?? 150} عملة فتّشها</span>
            </div>
          </div>

          {/* Center Circular Avatar with Active Cosmetic Frame */}
          <div className="relative z-20 mt-1">
            <div
              className="w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.85)] transition-all"
              style={{
                background: activeCosmeticObj.previewGradient
              }}
            >
              <div className="w-full h-full rounded-full overflow-hidden border-[3px] border-[#041824] bg-[#0a2e46]">
                <img
                  src={user.avatar || '/assets/images/login_kuwaiti_mascot_1794483388654.jpg'}
                  alt={user.displayName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-top scale-105"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleToggleSection('AVATAR')}
              className="absolute bottom-0 -right-1 w-10 h-10 rounded-full bg-gradient-to-b from-[#b5ff2b] to-[#76c800] hover:brightness-110 active:scale-95 border-[2.5px] border-[#031826] shadow-lg flex items-center justify-center cursor-pointer transition-transform"
              title="تعديل الاسم أو تغيير الصورة الرمزية"
            >
              <svg className="w-5 h-5 text-[#041824]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
              </svg>
            </button>
          </div>

          {/* Player Name, Active Title Badge & Level */}
          <div className="relative z-20 text-center mt-2.5 flex flex-col items-center">
            <h2 className="text-2xl sm:text-[26px] font-black text-white leading-tight drop-shadow">
              {user.displayName}
            </h2>

            {/* Active Player Title Pill (نظام الألقاب) */}
            <button
              type="button"
              onClick={() => handleToggleSection('TITLES_STORE')}
              className="mt-1 px-3.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/25 via-yellow-400/20 to-amber-500/25 border border-amber-400/70 text-amber-300 text-xs font-black flex items-center gap-1.5 shadow cursor-pointer hover:scale-105 transition-transform"
              title="تغيير اللقب الفعال"
            >
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>اللقب: {activeTitle}</span>
            </button>

            <p className="text-xs sm:text-sm font-extrabold text-[#d1e4f0] mt-1 tabular-nums">
              المستوى {currentLevel} • الخبرة الإجمالية {currentXP.toLocaleString()} XP
            </p>
          </div>

          {/* Rounded XP Pill Bar */}
          <div
            dir="ltr"
            className="relative z-20 w-[88%] max-w-[440px] mt-2 h-9 rounded-full bg-[#061c2b] border-[2px] border-[#29526b] px-1.5 flex items-center justify-between gap-2 shadow-[inset_0_2px_5px_rgba(0,0,0,0.75)]"
          >
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

            <span className="text-white font-black text-xs sm:text-sm font-mono tabular-nums pr-2 shrink-0">
              {currentXP.toLocaleString()} / {targetXP.toLocaleString()} XP
            </span>
          </div>
        </div>

        {/* Status Feedback Toast */}
        {statusMsg && (
          <div className="w-full max-w-4xl mx-auto px-4 sm:px-8 mb-2">
            <div className="px-3 py-2 rounded-2xl bg-lime-500/20 border border-lime-400/50 text-lime-200 text-xs font-black text-center">
              {statusMsg}
            </div>
          </div>
        )}

        {/* 2. Comprehensive Player Profile Metrics Grid (جميع متطلبات ملف اللاعب) */}
        <div className="relative z-20 w-full max-w-4xl lg:max-w-5xl mx-auto px-4 sm:px-8 pt-1 pb-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="rounded-2xl p-3 bg-[#092638]/95 border border-cyan-500/35 text-center flex flex-col items-center justify-center">
              <span className="text-lg">🏆</span>
              <span className="text-lg sm:text-xl font-black text-amber-300 tabular-nums mt-0.5">
                {playerStats.totalScore.toLocaleString()}
              </span>
              <span className="text-[11px] font-extrabold text-slate-300">إجمالي النقاط</span>
            </div>

            <div className="rounded-2xl p-3 bg-[#092638]/95 border border-cyan-500/35 text-center flex flex-col items-center justify-center">
              <span className="text-lg">🔤</span>
              <span className="text-lg sm:text-xl font-black text-cyan-300 tabular-nums mt-0.5">
                {playerStats.totalWordsFound.toLocaleString()}
              </span>
              <span className="text-[11px] font-extrabold text-slate-300">الكلمات المكتشفة</span>
            </div>

            <div className="rounded-2xl p-3 bg-[#092638]/95 border border-cyan-500/35 text-center flex flex-col items-center justify-center">
              <span className="text-lg">🗺️</span>
              <span className="text-lg sm:text-xl font-black text-lime-300 tabular-nums mt-0.5">
                {playerStats.completedStages}
              </span>
              <span className="text-[11px] font-extrabold text-slate-300">المراحل المنجزة</span>
            </div>

            <div className="rounded-2xl p-3 bg-[#092638]/95 border border-cyan-500/35 text-center flex flex-col items-center justify-center">
              <span className="text-lg">⚔️</span>
              <span className="text-lg sm:text-xl font-black text-emerald-300 tabular-nums mt-0.5">
                {playerStats.totalWins} فوز / {playerStats.onlineLosses} خسارة
              </span>
              <span className="text-[11px] font-extrabold text-slate-300">سجل التحديات</span>
            </div>

            <div className="rounded-2xl p-3 bg-[#092638]/95 border border-cyan-500/35 text-center flex flex-col items-center justify-center">
              <span className="text-lg">🪙</span>
              <span className="text-lg sm:text-xl font-black text-amber-400 tabular-nums mt-0.5">
                {(user.coins ?? 150).toLocaleString()}
              </span>
              <span className="text-[11px] font-extrabold text-slate-300">عملات فتّشها</span>
            </div>

            <div className="rounded-2xl p-3 bg-[#092638]/95 border border-cyan-500/35 text-center flex flex-col items-center justify-center">
              <span className="text-lg">🔥</span>
              <span className="text-lg sm:text-xl font-black text-orange-300 tabular-nums mt-0.5">
                {playerStats.streakDays} يوم
              </span>
              <span className="text-[11px] font-extrabold text-slate-300">أيام الاستمرارية</span>
            </div>
          </div>
        </div>

        {/* 3. Expandable Sections */}
        <div className="relative z-20 w-full max-w-4xl lg:max-w-5xl mx-auto px-4 sm:px-8 pb-10 space-y-3">
          {/* ================================================================= */}
          {/* SECTION 1: الإنجازات مقسمة إلى 5 مجموعات (مع جوائز XP وعملات وألقاب) */}
          {/* ================================================================= */}
          <div className="rounded-[22px] overflow-hidden border border-[#244e68] bg-gradient-to-b from-[#0b2b3d] to-[#061a26] shadow-lg">
            <button
              type="button"
              onClick={() => handleToggleSection('ACHIEVEMENTS')}
              className="w-full h-16 px-5 flex items-center justify-between cursor-pointer hover:brightness-110 transition-all"
            >
              <div className="flex items-center gap-3.5">
                <Award className="w-8 h-8 text-amber-400 shrink-0" />
                <div className="text-right">
                  <span className="text-base sm:text-lg font-black text-white block">
                    الإنجازات (5 مجموعات: الاستكشاف • السرعة • الدقة • التحدي • الاستمرارية)
                  </span>
                  <span className="text-[11px] text-amber-300 font-bold">
                    تمنحك نقاط خبرة XP، عملات فتّشها، ألقاباً رسمية، ومظاهر تجميلية
                  </span>
                </div>
              </div>
              <ChevronDown
                className={`w-6 h-6 text-[#94b8d0] transition-transform duration-200 ${
                  openSection === 'ACHIEVEMENTS' ? 'rotate-180 text-white' : ''
                }`}
              />
            </button>

            {openSection === 'ACHIEVEMENTS' && (
              <div className="px-4 pb-5 pt-3 border-t border-[#1b3d52] space-y-4 bg-[#04131d]">
                {/* 5 Achievement Group Filter Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setSelectedAchGroup('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 cursor-pointer transition-all ${
                      selectedAchGroup === 'ALL'
                        ? 'bg-amber-400 text-slate-950 shadow'
                        : 'bg-[#072030] text-slate-300 border border-slate-700'
                    }`}
                  >
                    الكل ({ACHIEVEMENTS.length})
                  </button>
                  {ACHIEVEMENT_GROUPS.map(g => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setSelectedAchGroup(g.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 cursor-pointer transition-all ${
                        selectedAchGroup === g.id
                          ? 'bg-cyan-400 text-slate-950 shadow'
                          : 'bg-[#072030] text-slate-300 border border-slate-700 hover:border-cyan-400/50'
                      }`}
                    >
                      <span>🏅</span>
                      <span>{g.label}</span>
                    </button>
                  ))}
                </div>

                {/* Achievements List */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {filteredAchievements.map(ach => {
                    const isUnlocked = user.achievements?.includes(ach.id);
                    const progressVal = getAchievementProgress(ach.id, ach.category, ach.target);
                    const pct = Math.min(100, Math.round((progressVal / ach.target) * 100));

                    return (
                      <div
                        key={ach.id}
                        className={`p-3.5 rounded-2xl border flex flex-col justify-between gap-2.5 transition-all ${
                          isUnlocked
                            ? 'border-amber-400/60 bg-gradient-to-br from-amber-500/15 to-emerald-500/10'
                            : 'border-[#1d435a] bg-[#072030]/80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                isUnlocked
                                  ? 'bg-amber-400 text-slate-950 font-black shadow'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {isUnlocked ? <Check className="w-5 h-5 stroke-[3]" /> : <Lock className="w-4 h-4" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] px-2 py-0.2 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-black">
                                  {ach.categoryLabel}
                                </span>
                                <span className="text-xs sm:text-sm font-black text-white">
                                  {ach.title}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-300 font-bold mt-0.5">
                                {ach.description}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-bold">
                            <span className="text-slate-400">
                              التقدم: {progressVal} / {ach.target}
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                              <span className="px-2 py-0.2 rounded-md bg-amber-400/20 text-amber-300 font-black">
                                +{ach.xpReward} XP
                              </span>
                              <span className="px-2 py-0.2 rounded-md bg-lime-400/20 text-lime-300 font-black">
                                +{ach.coinReward} 🪙
                              </span>
                              {ach.titleReward && (
                                <span className="px-2 py-0.2 rounded-md bg-purple-500/25 border border-purple-400/40 text-purple-200 font-black">
                                  👑 لقب: {ach.titleReward}
                                </span>
                              )}
                              {ach.cosmeticReward && (
                                <span className="px-2 py-0.2 rounded-md bg-cyan-500/25 border border-cyan-400/40 text-cyan-200 font-black">
                                  ✨ مظهر تجميلي
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${isUnlocked ? 100 : pct}%`,
                                background: isUnlocked
                                  ? 'linear-gradient(90deg, #facc15 0%, #10b981 100%)'
                                  : 'linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)'
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Daily Challenges Subsection */}
                <div className="pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-lime-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>مهام وتحديات اليوم (تكسبك عملات فتّشها و XP)</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleRerollDailyTasks}
                      className="text-[11px] font-bold text-amber-400 hover:text-amber-300 cursor-pointer"
                    >
                      🔄 تبديل المهام
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {dailyTasks.map(task => {
                      const pct = Math.min(100, Math.round((task.current / task.target) * 100));
                      return (
                        <div
                          key={task.id}
                          className="p-3 rounded-2xl bg-[#072030] border border-[#1d435a] space-y-1.5"
                        >
                          <div className="text-xs font-black text-white">{task.description}</div>
                          <div className="text-[11px] font-bold text-amber-400">
                            +{task.rewardCoins} عملة فتّشها · +{task.rewardXP} XP
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-slate-950 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${pct}%`,
                                  background: task.completed ? '#10b981' : '#84cc16'
                                }}
                              />
                            </div>
                            <span className="text-[11px] font-mono font-bold text-slate-300">
                              {task.current}/{task.target}
                            </span>
                            {task.completed && !task.claimed && (
                              <button
                                type="button"
                                onClick={() => handleClaimDailyTask(task.id)}
                                className="px-2 py-0.5 rounded-lg bg-lime-400 text-slate-950 font-black text-[10px] cursor-pointer"
                              >
                                استلام
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* SECTION 2: نظام الألقاب والمظاهر التجميلية ومتجر عملات فتّشها       */}
          {/* ================================================================= */}
          <div className="rounded-[22px] overflow-hidden border border-[#244e68] bg-gradient-to-b from-[#0b2b3d] to-[#061a26] shadow-lg">
            <button
              type="button"
              onClick={() => handleToggleSection('TITLES_STORE')}
              className="w-full h-16 px-5 flex items-center justify-between cursor-pointer hover:brightness-110 transition-all"
            >
              <div className="flex items-center gap-3.5">
                <Crown className="w-8 h-8 text-amber-400 shrink-0" />
                <div className="text-right">
                  <span className="text-base sm:text-lg font-black text-white block">
                    نظام الألقاب • المظاهر التجميلية • ومتجر «عملات فتّشها»
                  </span>
                  <span className="text-[11px] text-cyan-300 font-bold">
                    مستكشف الحروف • صائد الكلمات • ملك السرعة • أسطورة فتّشها • بطل الكويت
                  </span>
                </div>
              </div>
              <ChevronDown
                className={`w-6 h-6 text-[#94b8d0] transition-transform duration-200 ${
                  openSection === 'TITLES_STORE' ? 'rotate-180 text-white' : ''
                }`}
              />
            </button>

            {openSection === 'TITLES_STORE' && (
              <div className="px-4 pb-5 pt-3 border-t border-[#1b3d52] space-y-5 bg-[#04131d]">
                {/* Daily & Weekly Rewards */}
                <div>
                  <h4 className="text-xs font-black text-lime-400 mb-2 flex items-center gap-1.5">
                    <Gift className="w-4 h-4" />
                    <span>المكافآت اليومية والأسبوعية المجانية:</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="p-3.5 rounded-2xl bg-[#072030] border border-lime-400/40 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-black text-white">🎁 المكافأة اليومية</div>
                        <div className="text-[11px] text-amber-300 font-bold">
                          +120 عملة فتّشها • +2 تلميح • +80 XP
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleClaimEconomyReward('DAILY')}
                        className="px-3.5 py-1.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-black text-xs cursor-pointer"
                      >
                        استلام اليومية
                      </button>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-[#072030] border border-amber-400/40 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-black text-white">👑 المكافأة الأسبوعية الكبرى</div>
                        <div className="text-[11px] text-amber-300 font-bold">
                          +450 عملة فتّشها • +6 تلميحات • +250 XP
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleClaimEconomyReward('WEEKLY')}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs cursor-pointer"
                      >
                        استلام الأسبوعية
                      </button>
                    </div>
                  </div>
                </div>

                {/* Player Titles Grid */}
                <div>
                  <h4 className="text-xs font-black text-amber-300 mb-2 flex items-center gap-1.5">
                    <Crown className="w-4 h-4" />
                    <span>ألقاب اللاعبين الرسمية (اختر لقبك ليظهر في ملفك ولوحة الصدارة):</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {PLAYER_TITLES.map(t => {
                      const isUnlocked = (user.unlockedTitles || ['مستكشف الحروف']).includes(t.name);
                      const isEquipped = activeTitle === t.name;
                      return (
                        <div
                          key={t.id}
                          className={`p-3 rounded-2xl border flex flex-col justify-between gap-2 ${
                            isEquipped
                              ? 'border-amber-400 bg-amber-500/15'
                              : isUnlocked
                              ? 'border-cyan-400/40 bg-[#072030]'
                              : 'border-slate-800 bg-slate-950/60'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-950 font-black text-sm shrink-0"
                              style={{ backgroundColor: t.badgeColor }}
                            >
                              👑
                            </span>
                            <div>
                              <div className="text-xs sm:text-sm font-black text-white">{t.name}</div>
                              <div className="text-[10px] text-slate-400 font-bold">{t.unlockRequirement}</div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleEquipOrBuyTitle(t.name, t.coinPrice)}
                            className={`w-full py-1.5 rounded-xl font-black text-xs cursor-pointer transition-all ${
                              isEquipped
                                ? 'bg-emerald-500 text-slate-950'
                                : isUnlocked
                                ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950'
                                : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                            }`}
                          >
                            {isEquipped
                              ? '✓ اللقب الفعال حالياً'
                              : isUnlocked
                              ? 'تفعيل هذا اللقب'
                              : `فتح اللقب (${t.coinPrice} 🪙)`}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Cosmetics / Frames Grid */}
                <div>
                  <h4 className="text-xs font-black text-cyan-300 mb-2 flex items-center gap-1.5">
                    <ShoppingBag className="w-4 h-4" />
                    <span>المظاهر والعناصر التجميلية (إطارات الصورة الرمزية):</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {COSMETIC_ITEMS.map(item => {
                      const isUnlocked = (user.unlockedCosmetics || ['frame_default_cyan']).includes(item.id);
                      const isEquipped = (user.selectedCosmetic || 'frame_default_cyan') === item.id;
                      return (
                        <div
                          key={item.id}
                          className={`p-3 rounded-2xl border flex flex-col items-center text-center justify-between gap-2 ${
                            isEquipped
                              ? 'border-lime-400 bg-lime-500/15'
                              : 'border-[#1d435a] bg-[#072030]'
                          }`}
                        >
                          <div
                            className="w-12 h-12 rounded-full p-1 shadow-md"
                            style={{ background: item.previewGradient }}
                          >
                            <div className="w-full h-full rounded-full bg-[#041824] flex items-center justify-center text-xs font-black text-white">
                              ✨
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-black text-white">{item.name}</div>
                            <div className="text-[10px] text-slate-400 font-bold mt-0.5">{item.description}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleEquipOrBuyCosmetic(item.id, item.name, item.coinPrice)}
                            className={`w-full py-1.5 rounded-xl font-black text-xs cursor-pointer ${
                              isEquipped
                                ? 'bg-lime-400 text-slate-950'
                                : isUnlocked
                                ? 'bg-cyan-400 text-slate-950'
                                : 'bg-amber-400 text-slate-950'
                            }`}
                          >
                            {isEquipped
                              ? '✓ مفعّل'
                              : isUnlocked
                              ? 'تفعيل المظهر'
                              : `شراء (${item.coinPrice} 🪙)`}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* SECTION 3: قائمة الأصدقاء ومقارنة تقدم الأصدقاء                     */}
          {/* ================================================================= */}
          <div className="rounded-[22px] overflow-hidden border border-[#244e68] bg-gradient-to-b from-[#0b2b3d] to-[#061a26] shadow-lg">
            <button
              type="button"
              onClick={() => handleToggleSection('FRIENDS_COMPARE')}
              className="w-full h-16 px-5 flex items-center justify-between cursor-pointer hover:brightness-110 transition-all"
            >
              <div className="flex items-center gap-3.5">
                <Users className="w-8 h-8 text-cyan-400 shrink-0" />
                <div className="text-right">
                  <span className="text-base sm:text-lg font-black text-white block">
                    قائمة الأصدقاء ومقارنة التقدم ({user.friends?.length || 0})
                  </span>
                  <span className="text-[11px] text-slate-300 font-bold">
                    أضف أصدقاءك وقارن مستواك، نقاطك، وعدد مراحل الفوز معهم مباشرة
                  </span>
                </div>
              </div>
              <ChevronDown
                className={`w-6 h-6 text-[#94b8d0] transition-transform duration-200 ${
                  openSection === 'FRIENDS_COMPARE' ? 'rotate-180 text-white' : ''
                }`}
              />
            </button>

            {openSection === 'FRIENDS_COMPARE' && (
              <div className="px-4 pb-5 pt-3 border-t border-[#1b3d52] space-y-4 bg-[#04131d]">
                {/* Add Friend Form */}
                <form onSubmit={handleAddFriend} className="flex gap-2">
                  <input
                    type="text"
                    value={friendUsernameInput}
                    onChange={e => setFriendUsernameInput(e.target.value)}
                    placeholder="أدخل اسم مستخدم الصديق لإضافته ومقارنة التقدم معه..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#072030] border border-[#244e68] text-white text-xs font-bold focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>إضافة صديق</span>
                  </button>
                </form>

                {/* Friends List */}
                {(user.friends || []).length === 0 ? (
                  <div className="p-4 rounded-2xl bg-[#072030]/60 border border-slate-800 text-center text-xs text-slate-400 font-bold">
                    لا يوجد أصدقاء مضافون بعد. أضف صديقك بالأعلى لمقارنة تقدمكما في «فتّشها»!
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(user.friends || []).map(friendKey => {
                      const cleanKey = String(friendKey).toLowerCase();
                      const matchedPlayer = allPlayers.find(p => p.username.toLowerCase() === cleanKey);
                      const fr: FriendProfileSummary = {
                        id: matchedPlayer?.id || `usr_${cleanKey}`,
                        username: matchedPlayer?.username || String(friendKey),
                        displayName: matchedPlayer?.displayName || String(friendKey),
                        avatar: matchedPlayer?.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
                        level: matchedPlayer?.level || 2,
                        xp: matchedPlayer?.xp || 420,
                        totalScore: matchedPlayer?.totalScore || 1850,
                        totalWordsFound: matchedPlayer?.totalWordsFound || 18,
                        completedLevelsCount: matchedPlayer ? Object.keys(matchedPlayer.completedLevels || {}).length : 3,
                        multiplayerWins: matchedPlayer?.multiplayerWins || 2,
                        multiplayerLosses: matchedPlayer?.multiplayerLosses || 0,
                        selectedTitle: matchedPlayer?.selectedTitle || 'صائد الكلمات',
                        onlineStatus: 'ONLINE'
                      };
                      const isComparing = compareFriend?.username === fr.username;
                      return (
                        <div
                          key={fr.username}
                          className={`p-3 rounded-2xl border flex items-center justify-between gap-2 ${
                            isComparing
                              ? 'border-amber-400 bg-amber-500/15'
                              : 'border-[#1d435a] bg-[#072030]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <img
                              src={fr.avatar}
                              alt={fr.displayName}
                              className="w-10 h-10 rounded-full object-cover border border-cyan-400"
                            />
                            <div>
                              <div className="text-xs font-black text-white">{fr.displayName}</div>
                              <div className="text-[11px] text-cyan-300 font-bold">
                                المستوى {fr.level} • {fr.xp} XP • {fr.completedLevelsCount || 0} مراحل
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              sounds.playTap();
                              setCompareFriend(fr);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[11px] cursor-pointer"
                          >
                            مقارنة التقدم ⚔️
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Side-by-Side Friend Progress Comparison Card */}
                {compareFriend && (
                  <div className="p-4 rounded-2xl bg-gradient-to-b from-[#092b42] to-[#051826] border-2 border-amber-400/60 space-y-3">
                    <div className="flex items-center justify-between border-b border-cyan-500/25 pb-2">
                      <span className="text-xs sm:text-sm font-black text-amber-300">
                        ⚔️ مقارنة التقدم: أنت مقابل «{compareFriend.displayName}»
                      </span>
                      <button
                        type="button"
                        onClick={() => setCompareFriend(null)}
                        className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
                      >
                        إغلاق المقارنة
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs items-center">
                      <div className="font-black text-lime-300">{user.displayName} (أنت)</div>
                      <div className="text-[11px] font-bold text-slate-400">المعيار</div>
                      <div className="font-black text-cyan-300">{compareFriend.displayName}</div>

                      <div className="p-2 rounded-xl bg-slate-950/60 font-black text-white tabular-nums">
                        {user.level}
                      </div>
                      <div className="text-[11px] font-bold text-amber-300">المستوى</div>
                      <div className="p-2 rounded-xl bg-slate-950/60 font-black text-white tabular-nums">
                        {compareFriend.level}
                      </div>

                      <div className="p-2 rounded-xl bg-slate-950/60 font-black text-white tabular-nums">
                        {user.xp} XP
                      </div>
                      <div className="text-[11px] font-bold text-amber-300">الخبرة XP</div>
                      <div className="p-2 rounded-xl bg-slate-950/60 font-black text-white tabular-nums">
                        {compareFriend.xp} XP
                      </div>

                      <div className="p-2 rounded-xl bg-slate-950/60 font-black text-white tabular-nums">
                        {playerStats.totalWordsFound} كلمة
                      </div>
                      <div className="text-[11px] font-bold text-amber-300">الكلمات المكتشفة</div>
                      <div className="p-2 rounded-xl bg-slate-950/60 font-black text-white tabular-nums">
                        {compareFriend.totalWordsFound || 18} كلمة
                      </div>

                      <div className="p-2 rounded-xl bg-slate-950/60 font-black text-white tabular-nums">
                        {playerStats.completedStages} مرحلة
                      </div>
                      <div className="text-[11px] font-bold text-amber-300">المراحل المنجزة</div>
                      <div className="p-2 rounded-xl bg-slate-950/60 font-black text-white tabular-nums">
                        {compareFriend.completedLevelsCount || 3} مرحلة
                      </div>

                      <div className="p-2 rounded-xl bg-slate-950/60 font-black text-white tabular-nums">
                        {playerStats.totalWins}
                      </div>
                      <div className="text-[11px] font-bold text-amber-300">إجمالي الفوز</div>
                      <div className="p-2 rounded-xl bg-slate-950/60 font-black text-white tabular-nums">
                        {compareFriend.multiplayerWins}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* SECTION 4: إحصائيات اللعب والرسوم البيانية                          */}
          {/* ================================================================= */}
          <div className="rounded-[22px] overflow-hidden border border-[#244e68] bg-gradient-to-b from-[#0b2b3d] to-[#061a26] shadow-lg">
            <button
              type="button"
              onClick={() => handleToggleSection('STATS')}
              className="w-full h-16 px-5 flex items-center justify-between cursor-pointer hover:brightness-110 transition-all"
            >
              <div className="flex items-center gap-3.5">
                <BarChart3 className="w-8 h-8 text-sky-400 shrink-0" />
                <span className="text-base sm:text-lg font-black text-white">إحصائيات اللعب التفصيلية</span>
              </div>
              <ChevronDown
                className={`w-6 h-6 text-[#94b8d0] transition-transform duration-200 ${
                  openSection === 'STATS' ? 'rotate-180 text-white' : ''
                }`}
              />
            </button>

            {openSection === 'STATS' && (
              <div className="px-4 pb-4 pt-3 border-t border-[#1b3d52] space-y-4 bg-[#04131d]">
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

                {stageMetrics.length > 0 && (
                  <div className="h-52 w-full" dir="ltr">
                    {activeChartTab === 'PROGRESSION' && (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={stageMetrics} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="shortLabel" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                          <YAxis yAxisId="left" stroke="#f59e0b" tick={{ fill: '#f59e0b', fontSize: 10 }} />
                          <YAxis yAxisId="right" orientation="right" stroke="#38bdf8" tick={{ fill: '#38bdf8', fontSize: 10 }} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Area yAxisId="left" type="monotone" dataKey="score" name="النقاط" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.25} />
                          <Line yAxisId="right" type="monotone" dataKey="bestTime" name="الزمن (ث)" stroke="#38bdf8" strokeWidth={2.5} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                    {activeChartTab === 'ACCURACY_SPEED' && (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={stageMetrics} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="shortLabel" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                          <YAxis domain={[0, 100]} stroke="#10b981" tick={{ fill: '#10b981', fontSize: 10 }} />
                          <Tooltip />
                          <Area type="monotone" dataKey="accuracy" name="الدقة (%)" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                    {activeChartTab === 'CATEGORIES' && (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categoryBreakdown} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                          <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="stars" name="النجوم" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="avgAccuracy" name="الدقة (%)" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                )}

                <div className="h-44 w-full bg-[#072030]/60 rounded-2xl border border-[#1d435a] p-2" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="68%" data={radarData}>
                      <PolarGrid stroke="#334155" />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: '#cbd5e1', fontSize: 10, fontWeight: 700 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
                      <Radar name={user.displayName} dataKey="value" stroke="#a3e635" strokeWidth={2} fill="#84cc16" fillOpacity={0.35} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {playerStats.totalStars > 0 && (
                  <button
                    type="button"
                    onClick={handleResetProgress}
                    className="w-full py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>تصفير نجوم وإحصائيات هذا اللاعب</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* SECTION 5: تخصيص الاسم والصورة الرمزية                             */}
          {/* ================================================================= */}
          <div className="rounded-[22px] overflow-hidden border border-[#244e68] bg-gradient-to-b from-[#0b2b3d] to-[#061a26] shadow-lg">
            <button
              type="button"
              onClick={() => handleToggleSection('AVATAR')}
              className="w-full h-16 px-5 flex items-center justify-between cursor-pointer hover:brightness-110 transition-all"
            >
              <div className="flex items-center gap-3.5">
                <span className="text-2xl">📸</span>
                <span className="text-base sm:text-lg font-black text-white">
                  تخصيص اسم اللاعب والصورة الرمزية والشخصية
                </span>
              </div>
              <ChevronDown
                className={`w-6 h-6 text-[#94b8d0] transition-transform duration-200 ${
                  openSection === 'AVATAR' ? 'rotate-180 text-white' : ''
                }`}
              />
            </button>

            {openSection === 'AVATAR' && (
              <div className="px-4 pb-5 pt-3 border-t border-[#1b3d52] space-y-4 bg-[#04131d]">
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
                        </button>
                      );
                    })}
                  </div>
                </div>

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
                      className="px-4 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-black text-xs cursor-pointer"
                    >
                      حفظ الاسم
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* SECTION 6: استعادة الحساب والتقدم عند تغيير الجهاز                  */}
          {/* ================================================================= */}
          <div className="rounded-[22px] overflow-hidden border border-[#244e68] bg-gradient-to-b from-[#0b2b3d] to-[#061a26] shadow-lg">
            <button
              type="button"
              onClick={() => handleToggleSection('RECOVERY')}
              className="w-full h-16 px-5 flex items-center justify-between cursor-pointer hover:brightness-110 transition-all"
            >
              <div className="flex items-center gap-3.5">
                <DownloadCloud className="w-8 h-8 text-lime-400 shrink-0" />
                <div className="text-right">
                  <span className="text-base sm:text-lg font-black text-white block">
                    استعادة الحساب والتقدم عند تغيير الجهاز
                  </span>
                  <span className="text-[11px] text-lime-300 font-bold">
                    انسخ رمز الاستعادة الفوري أو استعد حسابك وتقدمك الكامل من أي جهاز آخر
                  </span>
                </div>
              </div>
              <ChevronDown
                className={`w-6 h-6 text-[#94b8d0] transition-transform duration-200 ${
                  openSection === 'RECOVERY' ? 'rotate-180 text-white' : ''
                }`}
              />
            </button>

            {openSection === 'RECOVERY' && (
              <div className="px-4 pb-5 pt-3 border-t border-[#1b3d52] space-y-4 bg-[#04131d]">
                <div className="p-3.5 rounded-2xl bg-[#072030] border border-cyan-500/35 space-y-2">
                  <div className="text-xs font-black text-white">
                    1. نسخ رمز استعادة حسابك الحالي («{user.displayName}»):
                  </div>
                  <p className="text-[11px] text-slate-300 font-bold">
                    يحتوي هذا الرمز المشفر على مستواك، عملات فتّشها، مراحل الفوز، الألقاب، والمظاهر لتنتقل بها لأي هاتف أو تلفزيون فوراً:
                  </p>
                  <button
                    type="button"
                    onClick={handleCopyRecoveryCode}
                    className="w-full py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {copiedRecovery ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedRecovery ? 'تم نسخ رمز الاستعادة بنجاح!' : 'نسخ رمز استعادة الحساب والتقدم'}</span>
                  </button>
                </div>

                <form onSubmit={handleRestoreAccount} className="p-3.5 rounded-2xl bg-[#072030] border border-lime-400/35 space-y-2.5">
                  <div className="text-xs font-black text-lime-300">
                    2. هل غيرت جهازك؟ أدخل رمز الاستعادة أو اسم المستخدم لاسترجاع تقدمك:
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={recoveryInput}
                      onChange={e => setRecoveryInput(e.target.value)}
                      placeholder="الصق رمز الاستعادة (FTS-...) أو اسم المستخدم..."
                      dir="ltr"
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#03131d] border border-[#244e68] text-white text-xs font-mono focus:outline-none focus:border-lime-400"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-black text-xs shrink-0 cursor-pointer"
                    >
                      استعادة الآن
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
