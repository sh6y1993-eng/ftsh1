import React, { useState, useEffect, useRef } from 'react';
import {
  PlayerProfile,
  ScreenState,
  HintType,
  UnifiedDailyChallengePayload,
  WordPlacement
} from '../types/game';
import { HINT_DEFINITIONS } from '../engine/gameCategories';
import { getKuwaitMonthDays } from '../engine/dailyChallengeEngine';
import { normalizeArabicWord } from '../engine/wordSearch';
import { GameBoard } from '../components/GameBoard';
import { WordBank } from '../components/WordBank';
import {
  ArrowRight,
  Clock,
  Trophy,
  Flame,
  Calendar,
  Sparkles,
  Lightbulb,
  Coins,
  CheckCircle2,
  Play,
  Award,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { apiFetch as fetch, saveUserToLocalMap, syncProfileWithSupabase } from '../services/supabaseClient';

interface DailyChallengeScreenProps {
  user: PlayerProfile | null;
  onUpdateUser?: (user: PlayerProfile) => void;
  onNavigate: (screen: ScreenState) => void;
  tvMode?: boolean;
}

type DailyTab = 'PLAY' | 'LEADERBOARD' | 'STREAK' | 'SEASON';

export const DailyChallengeScreen: React.FC<DailyChallengeScreenProps> = ({
  user,
  onUpdateUser,
  onNavigate,
  tvMode = false
}) => {
  const [activeTab, setActiveTab] = useState<DailyTab>('PLAY');
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<'DAILY' | 'WEEKLY'>('DAILY');
  const [payload, setPayload] = useState<UnifiedDailyChallengePayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [starting, setStarting] = useState<boolean>(false);
  const [finishing, setFinishing] = useState<boolean>(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(90);
  const [nextResetCountdown, setNextResetCountdown] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [showHintsModal, setShowHintsModal] = useState<boolean>(false);
  const [revealedCells, setRevealedCells] = useState<{ row: number; col: number; label?: string }[]>([]);
  const [hintCell, setHintCell] = useState<{ row: number; col: number } | null>(null);
  const [hintPlacement, setHintPlacement] = useState<WordPlacement | null>(null);
  const [showWordLengths, setShowWordLengths] = useState<boolean>(false);
  const [dimUnusedCells, setDimUnusedCells] = useState<boolean>(false);
  const [verifiedPlacements, setVerifiedPlacements] = useState<WordPlacement[]>([]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const finishTriggeredRef = useRef<boolean>(false);
  const username = user?.username || 'ahmad_kwt';

  const hydrateFromChallenge = (p: UnifiedDailyChallengePayload) => {
    setPayload(p);
    setRemainingSeconds(p.attempt.remainingSeconds ?? 90);
    setNextResetCountdown(p.nextResetSeconds ?? 3600);
    setRevealedCells(p.attempt.revealedCells || []);
    setShowWordLengths(Boolean(p.attempt.showWordLengths));
    setDimUnusedCells(
      Array.isArray(p.attempt.removedDistractorCells) &&
        p.attempt.removedDistractorCells.length > 0
    );
    const mappedPlacements: WordPlacement[] = (p.targetWords || []).map(tw => ({
      word: tw.word,
      displayWord: tw.displayWord,
      cells: tw.cells || [],
      direction: tw.direction || 'RIGHT_TO_LEFT',
      color: tw.color || '#38bdf8'
    }));
    setVerifiedPlacements(mappedPlacements);
  };

  const fetchTodayChallenge = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/unified-daily/today?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      const ch: UnifiedDailyChallengePayload | undefined = data.challenge || data.payload;
      if (data.success && ch) {
        hydrateFromChallenge(ch);
      }
    } catch {
      setStatusMessage('تعذر الاتصال بخادم تحدي فتّشها اليومي.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTodayChallenge();
  }, [username]);

  // Countdown until next Kuwait midnight
  useEffect(() => {
    const iv = setInterval(() => {
      setNextResetCountdown(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // Active 90-second challenge countdown timer synced with server attempt
  useEffect(() => {
    if (!payload || payload.attempt.status !== 'IN_PROGRESS') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (!finishTriggeredRef.current) {
            finishTriggeredRef.current = true;
            handleFinishChallenge();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [payload?.attempt.status]);

  const handleStartOrResumeChallenge = async () => {
    if (starting) return;
    sounds.playTap();
    setStarting(true);
    finishTriggeredRef.current = false;
    try {
      const res = await fetch('/api/unified-daily/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      const data = await res.json();
      const ch: UnifiedDailyChallengePayload | undefined = data.challenge || data.payload;
      if (data.success && ch) {
        hydrateFromChallenge(ch);
        if (data.resumed) {
          setStatusMessage('🔄 تم استكمال محاولتك اليومية من نفس الثانية والكلمات المكتشفة!');
        } else {
          setStatusMessage('🔥 انطلق تحدي فتّشها اليومي الموحد (8 كلمات في 90 ثانية)!');
        }
      } else {
        setStatusMessage(data.error || data.message || 'تعذر بدء التحدي اليومي.');
      }
    } catch {
      setStatusMessage('حدث خطأ في الاتصال بالخادم.');
    } finally {
      setStarting(false);
    }
  };

  const handleFinishChallenge = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      const res = await fetch('/api/unified-daily/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          requestId: `daily_finish_${payload?.dateKey}_${username}`
        })
      });
      const data = await res.json();
      const ch: UnifiedDailyChallengePayload | undefined = data.challenge || data.payload;
      if (data.success && ch) {
        sounds.playVictory();
        hydrateFromChallenge(ch);
        if (data.user && onUpdateUser) {
          const saved = saveUserToLocalMap(data.user);
          onUpdateUser(saved);
          syncProfileWithSupabase(saved);
        }
        setStatusMessage('🏆 تم اعتماد نتيجتك في لوحة متصدري تحدي فتّشها اليومي وصرف المكافأة!');
      }
    } catch {
      // ignore
    } finally {
      setFinishing(false);
    }
  };

  const handleWordFound = async (word: string, selectedCells?: { row: number; col: number }[]) => {
    if (!payload || payload.attempt.status !== 'IN_PROGRESS') return;
    if (payload.attempt.wordsFound.includes(word)) return;

    if (selectedCells && selectedCells.length >= 2) {
      setVerifiedPlacements(prev =>
        prev.map(wp =>
          wp.word === word || normalizeArabicWord(wp.word) === normalizeArabicWord(word)
            ? { ...wp, cells: selectedCells }
            : wp
        )
      );
    }

    try {
      const res = await fetch('/api/unified-daily/verify-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, word, cells: selectedCells })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.valid) {
        sounds.playError();
        return;
      }

      sounds.playWordFound();
      const ch: UnifiedDailyChallengePayload | undefined = data.challenge || data.payload;
      if (ch) {
        hydrateFromChallenge(ch);
      }
      const returnedCells = Array.isArray(data.cells) && data.cells.length >= 2 ? data.cells : selectedCells;
      if (returnedCells && returnedCells.length >= 2) {
        setVerifiedPlacements(prev =>
          prev.map(wp =>
            wp.word === word || normalizeArabicWord(wp.word) === normalizeArabicWord(word)
              ? { ...wp, cells: returnedCells }
              : wp
          )
        );
      }
      if (data.user && onUpdateUser) {
        const saved = saveUserToLocalMap(data.user);
        onUpdateUser(saved);
        syncProfileWithSupabase(saved);
      }
      if (data.completedNow) {
        sounds.playVictory();
        setStatusMessage('🎉 كفووو! اكتشفت جميع الكلمات الـ 8 وتم اعتماد نتيجتك ومكافأتك!');
      } else {
        setStatusMessage(`✅ كفو! تم التحقق من كلمة «${data.displayWord || word}» من الخادم!`);
      }
    } catch {
      sounds.playError();
    }
  };

  const handleUseDailyHint = async (hintType: HintType) => {
    if (!payload || payload.attempt.status !== 'IN_PROGRESS') return;
    sounds.playTap();
    try {
      const res = await fetch('/api/unified-daily/use-hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          hintType,
          requestId: `daily_hint_${hintType}_${Date.now()}`
        })
      });
      const data = await res.json();
      setShowHintsModal(false);
      if (!res.ok || !data.success) {
        sounds.playError();
        setStatusMessage(data.error || data.message || 'رصيد التلميحات أو العملات غير كافٍ.');
        return;
      }

      sounds.playHint();
      if (data.user && onUpdateUser) {
        const saved = saveUserToLocalMap(data.user);
        onUpdateUser(saved);
        syncProfileWithSupabase(saved);
      }
      const ch: UnifiedDailyChallengePayload | undefined = data.challenge || data.payload;
      if (ch) {
        hydrateFromChallenge(ch);
      }

      const effect = data.hintEffect;
      if (effect?.revealedCells?.length > 0 && hintType === 'WORD_START') {
        setHintCell(effect.revealedCells[effect.revealedCells.length - 1]);
      }
      if (effect?.autoCompletedPlacement) {
        setHintPlacement(effect.autoCompletedPlacement);
        setTimeout(() => setHintPlacement(null), 4000);
      }
      setStatusMessage('💡 تم تطبيق التلميح وتحديث النقاط من الخادم!');
    } catch {
      sounds.playError();
    }
  };

  const handleClaimMilestone = async (days: 3 | 7 | 14 | 30) => {
    sounds.playTap();
    try {
      const res = await fetch('/api/unified-daily/claim-streak-milestone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          milestoneDays: days,
          requestId: `streak_ms_${days}_${username}`
        })
      });
      const data = await res.json();
      if (data.success) {
        sounds.playVictory();
        if (data.user && onUpdateUser) {
          const saved = saveUserToLocalMap(data.user);
          onUpdateUser(saved);
          syncProfileWithSupabase(saved);
        }
        const ch: UnifiedDailyChallengePayload | undefined = data.challenge || data.payload;
        if (ch) {
          hydrateFromChallenge(ch);
        }
        setStatusMessage(`🎉 تم استلام مكافأة سلسلة ${days} يوم!`);
      } else {
        sounds.playError();
        setStatusMessage(data.error || 'لا يمكن استلام هذه المكافأة حالياً.');
      }
    } catch {
      sounds.playError();
    }
  };

  const formatCountdown = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const attemptStatus = payload?.attempt.status || 'NOT_STARTED';
  const isFinished = attemptStatus === 'COMPLETED' || attemptStatus === 'EXPIRED';
  const isPlaying = attemptStatus === 'IN_PROGRESS';
  const calendarMonthDays = payload
    ? getKuwaitMonthDays(payload.dateKey, payload.dailyStreak?.completedDates || [])
    : [];
  const completedDatesSet = new Set(payload?.dailyStreak?.completedDates || []);
  const activeSeasonalEvent = payload?.seasonalEvents?.[0];

  return (
    <div
      dir="rtl"
      className="safe-screen min-h-dvh w-full bg-[#031521] text-white flex flex-col justify-between p-3 sm:p-6 overflow-y-auto select-none"
      style={{
        background: 'radial-gradient(circle at 50% 15%, #0c3554 0%, #041624 55%, #020b12 100%)'
      }}
    >
      <div className="max-w-5xl w-full mx-auto space-y-4">
        {/* Top Bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap bg-[#062235]/90 border border-cyan-500/40 rounded-3xl px-4 py-3 shadow-xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onNavigate('HOME');
              }}
              className="w-10 h-10 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-cyan-400/40 flex items-center justify-center text-white cursor-pointer"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-xl font-black text-white">
                  تحدي فتّشها اليومي الموحد
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/60 text-amber-300 text-[11px] font-black">
                  توقيت الكويت (Asia/Kuwait) 🇰🇼
                </span>
              </div>
              <p className="text-xs text-slate-300 font-bold mt-0.5">
                {payload?.title || 'تحدٍ واحد يومياً لجميع اللاعبين: 8 كلمات • 90 ثانية • محاولة تنافسية واحدة'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="px-3 py-1.5 rounded-2xl bg-slate-950/90 border border-cyan-500/35 text-xs font-black flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span className="text-slate-300">التحدي القادم:</span>
              <span className="font-mono text-cyan-300">{formatCountdown(nextResetCountdown)}</span>
            </div>

            <div className="px-3 py-1.5 rounded-2xl bg-slate-950/90 border border-amber-400/40 text-xs font-black flex items-center gap-2">
              <span className="text-amber-300 flex items-center gap-1">
                <Coins className="w-3.5 h-3.5" />
                {user?.coins ?? 150}
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-cyan-300 flex items-center gap-1">
                <Lightbulb className="w-3.5 h-3.5" />
                {user?.hintsRemaining ?? 5}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { id: 'PLAY' as DailyTab, label: 'شبكة التحدي اليومي', icon: <Play className="w-4 h-4" /> },
            { id: 'LEADERBOARD' as DailyTab, label: 'لوحة المتصدرين', icon: <Trophy className="w-4 h-4" /> },
            { id: 'STREAK' as DailyTab, label: 'السلسلة والتقويم', icon: <Flame className="w-4 h-4" /> },
            { id: 'SEASON' as DailyTab, label: 'التحديات الموسمية', icon: <Sparkles className="w-4 h-4" /> }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                sounds.playTap();
                setActiveTab(tab.id);
              }}
              className={`py-2.5 px-3 rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 border-amber-200 shadow-lg'
                  : 'bg-[#061e30] text-slate-200 border-cyan-500/30 hover:border-cyan-400'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Status Feedback Banner */}
        {statusMessage && (
          <div className="p-3 rounded-2xl bg-cyan-500/15 border border-cyan-400/50 text-cyan-200 text-xs font-black text-center">
            {statusMessage}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 1: DAILY CHALLENGE ARENA                                      */}
        {/* ================================================================= */}
        {activeTab === 'PLAY' && (
          <div className="space-y-4">
            {loading ? (
              <div className="p-12 rounded-3xl bg-[#061f31] border border-cyan-500/30 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
                <p className="text-sm font-black text-slate-200">جاري تحميل تحدي فتّشها اليومي الموحد...</p>
              </div>
            ) : !payload ? (
              <div className="p-8 rounded-3xl bg-[#061f31] border border-rose-500/40 text-center">
                <p className="text-sm font-black text-rose-300">تعذر تحميل التحدي اليومي.</p>
              </div>
            ) : attemptStatus === 'NOT_STARTED' ? (
              <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-[#082b44] to-[#041624] border-2 border-amber-400/60 shadow-2xl text-center space-y-5">
                <div className="w-16 h-16 rounded-3xl bg-amber-400/20 border-2 border-amber-400 flex items-center justify-center mx-auto text-amber-300 shadow-lg">
                  <Trophy className="w-9 h-9" />
                </div>
                <div className="space-y-2 max-w-xl mx-auto">
                  <span className="px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-black">
                    تحدي اليوم: {payload.dateKey} • {payload.categoryName}
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black text-white">
                    هل أنت مستعد لتحدي فتّشها اليومي؟
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 font-bold leading-relaxed">
                    نفس الشبكة والكلمات الـ 8 لجميع لاعبي فتّشها اليوم! لديك <strong className="text-amber-300">90 ثانية</strong> ومحاولة تنافسية واحدة فقط اليوم. إذا انقطع اتصالك، يُحفظ تقدمك وتستكمل من نفس الثانية دون إعادة المحاولة.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto">
                  <div className="p-3 rounded-2xl bg-slate-950/75 border border-cyan-500/30">
                    <div className="text-lg font-black text-cyan-300">8 كلمات</div>
                    <div className="text-[11px] text-slate-400 font-bold">شبكة موحدة 10×10</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-950/75 border border-amber-400/30">
                    <div className="text-lg font-black text-amber-300">90 ثانية</div>
                    <div className="text-[11px] text-slate-400 font-bold">مؤقت محمي بالخادم</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-950/75 border border-lime-400/30">
                    <div className="text-lg font-black text-lime-300">محاولة 1</div>
                    <div className="text-[11px] text-slate-400 font-bold">منافسة عادلة 100%</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleStartOrResumeChallenge}
                  disabled={starting}
                  className="px-8 py-4 rounded-2xl bg-gradient-to-b from-[#b8ff33] to-[#65a30d] hover:brightness-105 text-slate-950 font-black text-base sm:text-lg shadow-[0_10px_28px_rgba(132,204,22,0.4)] cursor-pointer inline-flex items-center gap-2"
                >
                  <Play className="w-5 h-5 fill-slate-950" />
                  <span>{starting ? 'جاري فتح التحدي...' : 'ابدأ تحدي اليوم الآن ⚡'}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Live HUD */}
                <div className="p-3.5 rounded-2xl bg-[#072235] border border-cyan-400/45 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <span className="px-3 py-1 rounded-xl bg-amber-400/20 border border-amber-400/50 text-amber-300 text-xs font-black">
                      الكلمات: {payload.attempt.wordsFound.length} / {payload.totalWords}
                    </span>
                    <span className="px-3 py-1 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 text-xs font-black">
                      التلميحات المستخدمة: {payload.attempt.hintsUsedCount}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div
                      className={`px-4 py-1.5 rounded-xl font-mono font-black text-sm flex items-center gap-1.5 border ${
                        isFinished
                          ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300'
                          : remainingSeconds <= 20
                          ? 'bg-rose-950/90 border-rose-500 text-rose-300 animate-pulse'
                          : 'bg-slate-950 border-cyan-400/50 text-cyan-300'
                      }`}
                    >
                      <Clock className="w-4 h-4" />
                      <span>
                        {isFinished
                          ? `الوقت المستغرق: ${payload.attempt.elapsedSeconds}ث`
                          : `المتبقي: ${formatTimer(remainingSeconds)}`}
                      </span>
                    </div>

                    {isPlaying && (
                      <button
                        type="button"
                        onClick={() => {
                          sounds.playTap();
                          setShowHintsModal(true);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-400/60 text-emerald-200 text-xs font-black flex items-center gap-1.5 cursor-pointer"
                      >
                        <Lightbulb className="w-4 h-4 text-emerald-300" />
                        <span>استخدام تلميح</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Finished Breakdown Banner */}
                {isFinished && payload.attempt.scoreBreakdown && (
                  <div className="p-5 rounded-3xl bg-gradient-to-b from-[#09324b] to-[#051a29] border-2 border-lime-400/65 shadow-2xl space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-6 h-6 text-lime-400" />
                        <h3 className="text-lg font-black text-white">
                          {attemptStatus === 'COMPLETED'
                            ? 'أنهيت تحدي فتّشها اليومي بنجاح!'
                            : 'انتهى وقت تحدي فتّشها اليومي!'}
                        </h3>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-lime-400 text-slate-950 text-xs font-black">
                        إجمالي النقاط: {payload.attempt.scoreBreakdown.totalScore} نقطة 🏆
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-950/75 border border-slate-800">
                        <div className="text-slate-400 font-bold">نقاط الكلمات</div>
                        <div className="text-sm font-black text-white mt-0.5">
                          +{payload.attempt.scoreBreakdown.wordsScore}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950/75 border border-slate-800">
                        <div className="text-slate-400 font-bold">مكافأة السرعة</div>
                        <div className="text-sm font-black text-cyan-300 mt-0.5">
                          +{payload.attempt.scoreBreakdown.speedBonus}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950/75 border border-slate-800">
                        <div className="text-slate-400 font-bold">مكافأة الإكمال</div>
                        <div className="text-sm font-black text-lime-300 mt-0.5">
                          +{payload.attempt.scoreBreakdown.completionBonus}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950/75 border border-slate-800">
                        <div className="text-slate-400 font-bold">بدون تلميحات</div>
                        <div className="text-sm font-black text-emerald-300 mt-0.5">
                          +{payload.attempt.scoreBreakdown.noHintsBonus}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-amber-400/15 border border-amber-400/45">
                        <div className="text-amber-300 font-bold">المكافأة المعتمدة</div>
                        <div className="text-sm font-black text-amber-300 mt-0.5">
                          +{payload.attempt.scoreBreakdown.earnedCoins} 🪙 • +{payload.attempt.scoreBreakdown.earnedXP} XP
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Word Bank */}
                <WordBank
                  wordPlacements={verifiedPlacements}
                  foundWords={payload.attempt.wordsFound}
                  showWordLengths={showWordLengths}
                />

                {/* Game Board */}
                <div className="relative">
                  <GameBoard
                    grid={payload.grid}
                    gridSize={payload.gridSize}
                    wordPlacements={verifiedPlacements}
                    foundWords={payload.attempt.wordsFound}
                    onWordSelected={handleWordFound}
                    hintCell={hintCell}
                    hintPlacement={hintPlacement}
                    revealedCells={revealedCells}
                    dimUnusedCells={dimUnusedCells}
                    tvMode={tvMode}
                    boardThemeId={user?.equippedBoardTheme}
                    trailStyleId={user?.equippedTrail}
                    frozenSeconds={isFinished ? 1 : 0}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: DAILY & WEEKLY LEADERBOARDS                                */}
        {/* ================================================================= */}
        {activeTab === 'LEADERBOARD' && payload && (
          <div className="p-5 rounded-3xl bg-[#061f31] border border-cyan-500/35 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <span>لوحة متصدري تحدي فتّشها اليومي</span>
                </h3>
                <p className="text-xs text-slate-300 font-bold">
                  ترتيب تنافسي موثّق من الخادم حسب النقاط والسرعة ({payload.dateKey})
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLeaderboardPeriod('DAILY')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black cursor-pointer ${
                    leaderboardPeriod === 'DAILY'
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-slate-900 text-slate-300'
                  }`}
                >
                  متصدرو اليوم ({payload.dateKey})
                </button>
                <button
                  type="button"
                  onClick={() => setLeaderboardPeriod('WEEKLY')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black cursor-pointer ${
                    leaderboardPeriod === 'WEEKLY'
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-slate-900 text-slate-300'
                  }`}
                >
                  متصدرو الأسبوع ({payload.weekKey})
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {(leaderboardPeriod === 'DAILY'
                ? payload.dailyLeaderboard
                : payload.weeklyLeaderboard
              ).length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-950/60 border border-slate-800 text-center text-xs font-bold text-slate-400">
                  لا توجد نتائج مسجلة بعد في هذه الفترة — كن أول المتصدرين الآن! 🏆
                </div>
              ) : (
                (leaderboardPeriod === 'DAILY'
                  ? payload.dailyLeaderboard
                  : payload.weeklyLeaderboard
                ).map((entry, idx) => (
                  <div
                    key={`${entry.username}_${idx}`}
                    className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${
                      entry.username === username
                        ? 'bg-amber-400/15 border-amber-400/60'
                        : 'bg-slate-950/75 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                          idx === 0
                            ? 'bg-amber-400 text-slate-950'
                            : idx === 1
                            ? 'bg-slate-300 text-slate-950'
                            : idx === 2
                            ? 'bg-amber-700 text-white'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <img
                        src={entry.avatar}
                        alt={entry.displayName}
                        className="w-9 h-9 rounded-full object-cover border border-cyan-400/50"
                      />
                      <div>
                        <div className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                          <span>{entry.displayName}</span>
                          {entry.selectedTitle && (
                            <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px]">
                              {entry.selectedTitle}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-bold">
                          الكلمات: {entry.wordsFoundCount}/8 • الوقت: {entry.elapsedSeconds}ث
                        </div>
                      </div>
                    </div>

                    <div className="text-left">
                      <div className="text-sm font-black text-amber-300">{entry.score} نقطة</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: STREAK & ACHIEVEMENT CALENDAR                              */}
        {/* ================================================================= */}
        {activeTab === 'STREAK' && payload && (
          <div className="p-5 rounded-3xl bg-[#061f31] border border-amber-400/40 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-b from-amber-300 to-orange-500 flex items-center justify-center text-slate-950 shadow-lg">
                  <Flame className="w-7 h-7 fill-slate-950" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    سلسلة التحدي اليومي وتقويم الإنجاز
                  </h3>
                  <p className="text-xs text-slate-300 font-bold">
                    السلسلة الحالية: <span className="text-amber-300">{payload.dailyStreak.currentStreak} يوم</span> • أطول سلسلة:{' '}
                    <span className="text-cyan-300">{payload.dailyStreak.longestStreak} يوم</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Streak Milestones (7, 14, 30 days) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { days: 7 as const, coins: 300, xp: 350, title: 'مواظب التحدي اليومي' },
                { days: 14 as const, coins: 600, xp: 700, title: 'بطل الاستمرارية' },
                { days: 30 as const, coins: 1500, xp: 1800, title: 'أسطورة التحدي اليومي' }
              ].map(ms => {
                const reached =
                  Math.max(payload.dailyStreak.currentStreak, payload.dailyStreak.longestStreak) >=
                  ms.days;
                const claimed = payload.dailyStreak.milestonesClaimed.includes(ms.days);
                return (
                  <div
                    key={ms.days}
                    className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 ${
                      reached
                        ? 'bg-emerald-950/35 border-emerald-400/55'
                        : 'bg-slate-950/70 border-slate-800'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-black text-amber-300">سلسلة {ms.days} يوم متتالي</div>
                      <div className="text-sm font-black text-white mt-0.5">لقب: {ms.title}</div>
                      <div className="text-[11px] text-lime-300 font-bold mt-1">
                        +{ms.coins} عملة • +{ms.xp} XP
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!reached || claimed}
                      onClick={() => handleClaimMilestone(ms.days)}
                      className={`w-full py-2 rounded-xl text-xs font-black ${
                        claimed
                          ? 'bg-slate-800 text-emerald-300 cursor-default'
                          : reached
                          ? 'bg-lime-400 hover:bg-lime-300 text-slate-950 cursor-pointer'
                          : 'bg-slate-900 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {claimed
                        ? 'تم الاستلام ✓'
                        : reached
                        ? 'استلام المكافأة 🎁'
                        : `متبقي ${Math.max(0, ms.days - payload.dailyStreak.currentStreak)} يوم`}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Monthly Calendar Grid */}
            <div className="space-y-2">
              <div className="text-xs font-black text-cyan-300 flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                <span>تقويم إنجازات الشهر الحالي (توقيت الكويت):</span>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {calendarMonthDays.map(day => {
                  const isCompleted = completedDatesSet.has(day.dateKey);
                  return (
                    <div
                      key={day.dateKey}
                      className={`p-2 rounded-xl border text-center ${
                        isCompleted
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                          : day.isToday
                          ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className="text-[10px] font-mono">{day.dayNumber}</div>
                      <div className="text-xs font-black mt-0.5">
                        {isCompleted ? '✓' : day.isToday ? 'اليوم' : '•'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: SEASONAL CHALLENGES                                        */}
        {/* ================================================================= */}
        {activeTab === 'SEASON' && activeSeasonalEvent && (
          <div className="p-6 rounded-3xl bg-gradient-to-b from-[#092b44] to-[#041523] border-2 border-amber-400/55 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-400 flex items-center justify-center text-lg font-black text-amber-300">
                  🏆
                </div>
                <div>
                  <span className="px-2.5 py-0.5 rounded-full bg-lime-400 text-slate-950 text-[10px] font-black">
                    {activeSeasonalEvent.badgeText}
                  </span>
                  <h3 className="text-lg font-black text-white mt-0.5">
                    {activeSeasonalEvent.title}
                  </h3>
                  <p className="text-xs text-amber-300 font-bold">{activeSeasonalEvent.subtitle}</p>
                </div>
              </div>
              <div className="px-3.5 py-2 rounded-2xl bg-slate-950/80 border border-amber-400/40 text-xs font-black text-amber-300">
                مضاعف الموسم: ×{activeSeasonalEvent.bonusMultiplier}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/75 border border-cyan-500/30 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <Award className="w-5 h-5 text-cyan-400" />
                <div>
                  <div className="text-xs font-black text-white">
                    اللقب الموسمي الحصري: «{activeSeasonalEvent.rewardTitle}»
                  </div>
                  <div className="text-[11px] text-slate-400 font-bold">
                    من {activeSeasonalEvent.startsAtDate} إلى {activeSeasonalEvent.endsAtDate}
                  </div>
                </div>
              </div>
              <span className="px-3 py-1 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-black flex items-center gap-1">
                <ShieldCheck className="w-4 h-4" />
                <span>مفعّل تلقائياً في تحدي اليوم</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 5 Hints Modal for Daily Challenge */}
      {showHintsModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm ios-modal-scroll"
          onClick={() => setShowHintsModal(false)}
        >
          <div className="min-h-dvh w-full flex items-start sm:items-center justify-center px-3 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] sm:p-5">
            <div
              className="max-w-md w-full rounded-3xl p-5 bg-[#072235] border-2 border-emerald-400/60 space-y-3 my-0 sm:my-auto"
              onClick={e => e.stopPropagation()}
            >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h4 className="text-base font-black text-white flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-emerald-300" />
                <span>التلميحات الخمسة (تحدي اليوم)</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowHintsModal(false)}
                className="text-xs text-slate-400 hover:text-white font-bold cursor-pointer"
              >
                إغلاق
              </button>
            </div>
            <div className="space-y-2">
              {HINT_DEFINITIONS.map(h => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => handleUseDailyHint(h.id)}
                  className="w-full p-3 rounded-2xl bg-slate-950/85 hover:bg-slate-900 border border-cyan-500/35 flex items-center justify-between gap-2 text-right cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Lightbulb className="w-5 h-5 text-amber-300 shrink-0" />
                    <div>
                      <div className="text-xs font-black text-white">{h.name}</div>
                      <div className="text-[11px] text-slate-400 font-bold">{h.description}</div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-xl bg-amber-400 text-slate-950 text-[11px] font-black shrink-0">
                    {h.hintCost} 💡 أو {h.coinCost} 🪙
                  </span>
                </button>
              ))}
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
};
