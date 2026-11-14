import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Category, LevelInfo, PlayerProfile, ScreenState, HintType } from '../types/game';
import { generateWordSearchGrid, GeneratedBoard } from '../engine/wordSearch';
import {
  KUWAITI_PRAISES,
  KUWAITI_MISTAKES,
  KUWAITI_HINT_MESSAGES,
  HINT_DEFINITIONS
} from '../engine/gameCategories';
import { GameBoard } from '../components/GameBoard';
import { WordBank } from '../components/WordBank';
import { TVRemoteHint } from '../components/TVRemoteHint';
import { DailyChallengesModal } from '../components/DailyChallengesModal';
import { StoreModal } from '../components/StoreModal';
import {
  Lightbulb,
  Clock,
  Trophy,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  Target,
  Volume2,
  VolumeX,
  Settings,
  Info,
  Maximize2,
  Copy,
  Check,
  Users,
  Tv,
  Coins,
  BookOpen,
  Search,
  Star,
  Shuffle,
  ShoppingBag,
  X
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { saveUserToLocalMap, syncProfileWithSupabase } from '../services/supabaseClient';

interface SoloGameScreenProps {
  category: Category;
  levelInfo: LevelInfo;
  user: PlayerProfile | null;
  onUpdateUser?: (user: PlayerProfile) => void;
  onNavigate?: (screen: ScreenState) => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
  onToggleTV?: () => void;
  onLevelComplete: (
    stars: number,
    timeSpent: number,
    score: number,
    accuracy: number,
    wordsFoundCount: number,
    hintsUsedCount: number,
    doubleBoostActive?: boolean
  ) => void;
  onExit: () => void;
  tvMode: boolean;
  replayTrigger?: number;
}

export const SoloGameScreen: React.FC<SoloGameScreenProps> = ({
  category,
  levelInfo,
  user,
  onUpdateUser,
  onNavigate,
  isMuted = false,
  onToggleMute,
  onToggleTV,
  onLevelComplete,
  onExit,
  tvMode,
  replayTrigger = 0
}) => {
  const [board, setBoard] = useState<GeneratedBoard | null>(null);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const STAGE_TIME_LIMIT = 120; // 2 minutes per stage (دقيقتين لكل مرحلة)
  const [mistakes, setMistakes] = useState(0);
  const [hintsUsedCount, setHintsUsedCount] = useState(0);
  const [score, setScore] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string>('');
  const [hintCell, setHintCell] = useState<{ row: number; col: number } | null>(null);
  const [hintPlacement, setHintPlacement] = useState<import('../types/game').WordPlacement | null>(null);
  const [revealedCells, setRevealedCells] = useState<{ row: number; col: number; label?: string }[]>([]);
  const [showWordLengths, setShowWordLengths] = useState(false);
  const [dimUnusedCells, setDimUnusedCells] = useState(false);
  const [hintsAvailable, setHintsAvailable] = useState(user?.hintsRemaining ?? 5);
  const [dailyToast, setDailyToast] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showDailyModal, setShowDailyModal] = useState(false);
  const [showHintsPickerModal, setShowHintsPickerModal] = useState(false);
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [freezeSecondsRemaining, setFreezeSecondsRemaining] = useState(0);
  const [doubleBoostActive, setDoubleBoostActive] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hintTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync hintsAvailable when active user changes
  useEffect(() => {
    if (typeof user?.hintsRemaining === 'number') {
      setHintsAvailable(user.hintsRemaining);
    }
  }, [user?.hintsRemaining, user?.username]);

  // Dynamic room/stage code per category & level
  const stageRoomCode = `KWT${levelInfo.levelNumber.toString().padStart(2, '0')}`;

  // Store the initial board for this stage so Android TV mode can always reuse the exact same letter layout
  const stageInitialBoardRef = useRef<{ stageKey: string; board: GeneratedBoard } | null>(null);
  const stageKey = `${category.id}_${levelInfo.levelNumber}_${levelInfo.words.join(',')}`;

  // Initialize or replay board for this stage:
  // In Android TV mode (tvMode === true), replaying keeps the exact same letter positions and layout.
  // In Phone mode (tvMode === false), replaying regenerates and shuffles word positions for a fresh challenge.
  const initGame = useCallback(
    (isReplay: boolean = false) => {
      let chosenBoard: GeneratedBoard;

      if (isReplay && tvMode && stageInitialBoardRef.current?.stageKey === stageKey) {
        // Android TV Mode: Retain the exact same letter arrangement and coordinates
        const original = stageInitialBoardRef.current.board;
        chosenBoard = {
          grid: original.grid.map((row) => [...row]),
          gridSize: original.gridSize,
          wordPlacements: original.wordPlacements.map((wp) => ({
            ...wp,
            cells: wp.cells.map((c) => ({ ...c }))
          }))
        };
      } else {
        // Phone Mode (or initial launch): Generate randomized grid with shuffled letter positions
        chosenBoard = generateWordSearchGrid(levelInfo.words, levelInfo.gridSize);
        stageInitialBoardRef.current = { stageKey, board: chosenBoard };
      }

      setBoard(chosenBoard);
      setFoundWords([]);
      setMistakes(0);
      setHintsUsedCount(0);
      setScore(0);
      setSeconds(0);
      setIsPaused(false);
      setIsTimedOut(false);
      setHintCell(null);
      setHintPlacement(null);
      setRevealedCells([]);
      setShowWordLengths(false);
      setDimUnusedCells(false);
      setFreezeSecondsRemaining(0);
      setDoubleBoostActive(false);
      setStatusBanner(
        isReplay
          ? tvMode
            ? '📺 وضع التلفزيون (Android TV): تم تثبيت ترتيب الحروف بنفس مواقعها الأصلية!'
            : '🔀 وضع الهاتف: تم تغيير وترتيب مواقع الحروف لشبكة جديدة وتحدٍ متجدد!'
          : ''
      );
    },
    [category.id, levelInfo.levelNumber, levelInfo.words, levelInfo.gridSize, tvMode, stageKey]
  );

  // Initial stage mount or level transition
  useEffect(() => {
    initGame(false);
  }, [category.id, levelInfo.levelNumber]);

  // Replay trigger from Results Modal
  const lastReplayTriggerRef = useRef(replayTrigger);
  useEffect(() => {
    if (replayTrigger && replayTrigger !== lastReplayTriggerRef.current) {
      lastReplayTriggerRef.current = replayTrigger;
      initGame(true);
    }
  }, [replayTrigger, initGame]);

  // Game timer loop (2-minute countdown timer / 120 seconds max, pauses during FREEZE_TIME)
  useEffect(() => {
    if (isPaused || !board || isTimedOut) return;

    timerRef.current = setInterval(() => {
      if (freezeSecondsRemaining > 0) {
        setFreezeSecondsRemaining(f => Math.max(0, f - 1));
        return;
      }
      setSeconds(s => {
        const next = s + 1;
        if (next >= STAGE_TIME_LIMIT) {
          if (timerRef.current) clearInterval(timerRef.current);
          setIsTimedOut(true);
          sounds.playError();
          return STAGE_TIME_LIMIT;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, board, isTimedOut, freezeSecondsRemaining]);

  // Handle word discovery
  const handleWordFound = (word: string) => {
    if (foundWords.includes(word)) return;

    sounds.playWordFound();
    const updated = [...foundWords, word];
    setFoundWords(updated);

    // Calculate score points (100 base + 15 per letter)
    const pts = 100 + word.length * 15;
    setScore(s => s + pts);

    // Kuwaiti praise
    const praise = KUWAITI_PRAISES[Math.floor(Math.random() * KUWAITI_PRAISES.length)];
    setStatusBanner(praise);
    setHintCell(null);
    if (hintPlacement?.word === word) {
      setHintPlacement(null);
    }

    // Update real-time word-based Daily Challenges
    if (user?.username) {
      fetch('/api/daily-challenges/word-found', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, elapsedSeconds: seconds })
      })
        .then(r => r.json())
        .then(data => {
          if (data.success && data.user && onUpdateUser) {
            onUpdateUser(data.user);
          }
          if (Array.isArray(data.newlyCompleted) && data.newlyCompleted.length > 0) {
            const doneTask = data.newlyCompleted[0];
            setDailyToast(
              `🎉 أنجزت تحدي الجولة: «${doneTask.description}» (+${doneTask.rewardCoins} عملة و +${doneTask.rewardXP} XP)`
            );
            setTimeout(() => setDailyToast(''), 5000);
          }
        })
        .catch(() => {
          // ignore network error
        });
    }

    // Check if stage completed!
    if (board && updated.length >= board.wordPlacements.length) {
      if (timerRef.current) clearInterval(timerRef.current);
      sounds.playVictory();

      // Star calculation strictly adhering to user requirements:
      // Star 1: Awarded for completing the stage
      const star1 = true;
      // Star 2: Awarded if no hints/assistance tools were used
      const star2 = hintsUsedCount === 0;
      // Star 3: Awarded if completed in under 1 minute (< 60 seconds)
      const star3 = seconds < 60;

      const stars = 1 + (star2 ? 1 : 0) + (star3 ? 1 : 0);

      const totalAttempts = updated.length + mistakes;
      const finalAccuracy =
        totalAttempts > 0 ? Math.round((updated.length / totalAttempts) * 100) : 100;

      setTimeout(() => {
        onLevelComplete(
          stars,
          seconds,
          score + pts,
          finalAccuracy,
          updated.length,
          hintsUsedCount,
          doubleBoostActive
        );
      }, 650);
    }
  };

  // Use Solo Power-Ups (FREEZE_TIME or DOUBLE_BOOST)
  const handleUsePowerUp = (puId: 'FREEZE_TIME' | 'DOUBLE_BOOST') => {
    if (!user || !onUpdateUser) return;
    const owned = user.powerUps?.[puId] || 0;
    if (owned <= 0) {
      sounds.playError();
      setShowStoreModal(true);
      return;
    }

    if (puId === 'FREEZE_TIME') {
      if (freezeSecondsRemaining > 0) return;
      sounds.playVictory();
      setFreezeSecondsRemaining(30);
      setStatusBanner('❄️ تم تفعيل تجميد الوقت لمدة 30 ثانية كاملة!');
    } else if (puId === 'DOUBLE_BOOST') {
      if (doubleBoostActive) return;
      sounds.playVictory();
      setDoubleBoostActive(true);
      setStatusBanner('⚡ تم تفعيل مضاعف العملات والخبرة (2x) لهذه المرحلة!');
    }

    const updated = saveUserToLocalMap({
      ...user,
      powerUps: {
        ...(user.powerUps || {}),
        [puId]: Math.max(0, owned - 1)
      }
    });
    onUpdateUser(updated);
    syncProfileWithSupabase(updated);
  };

  // Handle wrong selection mistake
  const handleWordMistake = () => {
    setMistakes(m => m + 1);
    const mistakeMsg = KUWAITI_MISTAKES[Math.floor(Math.random() * KUWAITI_MISTAKES.length)];
    setStatusBanner(mistakeMsg);
  };

  // Execute any of the 5 proposed Hint Types (using Hints balance OR عملات فتّشها)
  const handleApplyHintType = async (hintType: HintType) => {
    if (!board) return;
    const remaining = board.wordPlacements.filter(p => !foundWords.includes(p.word));
    if (remaining.length === 0) return;

    const def = HINT_DEFINITIONS.find(h => h.id === hintType) || HINT_DEFINITIONS[0];
    const currentCoins = user?.coins ?? 150;

    let nextHints = hintsAvailable;
    let nextCoins = currentCoins;

    if (hintsAvailable >= def.hintCost) {
      nextHints = Math.max(0, hintsAvailable - def.hintCost);
    } else if (currentCoins >= def.coinCost) {
      nextCoins = Math.max(0, currentCoins - def.coinCost);
    } else {
      sounds.playError();
      setStatusBanner(`رصيدك لا يكفي لتلميح «${def.name}»! افتح متجر عملات فتّشها أو استلم مكافأتك اليومية 💡`);
      setShowHintsPickerModal(false);
      setShowStoreModal(true);
      return;
    }

    sounds.playHint();
    setHintsAvailable(nextHints);
    setHintsUsedCount(c => c + 1);
    setShowHintsPickerModal(false);

    if (user && onUpdateUser) {
      const updated = saveUserToLocalMap({
        ...user,
        hintsRemaining: nextHints,
        coins: nextCoins
      });
      onUpdateUser(updated);
      syncProfileWithSupabase(updated);
    }

    const target = remaining[0];

    if (hintType === 'SINGLE_LETTER') {
      // 1. كشف حرف واحد
      const unrevealedCell =
        target.cells.find(
          c => !revealedCells.some(rc => rc.row === c.row && rc.col === c.col)
        ) || target.cells[Math.floor(Math.random() * target.cells.length)];

      setRevealedCells(prev => [...prev, { row: unrevealedCell.row, col: unrevealedCell.col, label: 'حرف 💡' }]);
      setStatusBanner(`🔤 تلميح (كشف حرف واحد): تم تمييز حرف من كلمة مطلوبة على الشبكة!`);
    } else if (hintType === 'WORD_START') {
      // 2. إظهار مكان بداية الكلمة
      const startCell = target.cells[0];
      setRevealedCells(prev => [
        ...prev.filter(rc => !(rc.row === startCell.row && rc.col === startCell.col)),
        { row: startCell.row, col: startCell.col, label: '١ • بداية' }
      ]);
      setHintCell(startCell);
      setStatusBanner(`🎯 تلميح (بداية الكلمة): الكلمة «${target.displayWord}» تبدأ من الخانة الذهبية المرقمة بـ (١ • بداية)!`);
    } else if (hintType === 'WORD_LENGTH') {
      // 3. إظهار عدد الحروف
      setShowWordLengths(true);
      setStatusBanner(`📏 تلميح (عدد الحروف): تم إظهار عدد حروف كل كلمة متبقية في بنك الكلمات!`);
    } else if (hintType === 'REMOVE_UNUSED') {
      // 4. إزالة الحروف غير المستخدمة
      setDimUnusedCells(true);
      setStatusBanner(`🧹 تلميح (إزالة الحروف غير المستخدمة): تم تعتيم الحروف الزائدة وبقيت حروف الكلمات فقط!`);
    } else if (hintType === 'FULL_WORD') {
      // 5. كشف كلمة كاملة مقابل تكلفة أعلى
      setHintPlacement(target);
      setStatusBanner(
        `${KUWAITI_HINT_MESSAGES[Math.floor(Math.random() * KUWAITI_HINT_MESSAGES.length)]} — تم كشف الكلمة الكاملة «${target.displayWord}»! 🌟`
      );
      if (hintTimeoutRef.current) {
        clearTimeout(hintTimeoutRef.current);
      }
      hintTimeoutRef.current = setTimeout(() => {
        setHintPlacement(null);
      }, 4500);
      // Also auto-claim the word for the player after a brief highlight
      handleWordFound(target.word);
    }
  };

  const handleCopyRoomCode = () => {
    sounds.playTap();
    navigator.clipboard.writeText(stageRoomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleToggleFullscreen = () => {
    sounds.playTap();
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    } catch {
      // ignore if blocked by iframe permissions
    }
  };

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const remainingSeconds = Math.max(0, STAGE_TIME_LIMIT - seconds);

  const totalAttemptsSoFar = foundWords.length + mistakes;
  const currentAccuracy =
    totalAttemptsSoFar > 0 ? Math.round((foundWords.length / totalAttemptsSoFar) * 100) : 100;

  if (!board) return null;

  const totalStageWords = board.wordPlacements.length;

  // Dynamic round / daily challenges for the active player
  const activeChallenges =
    user?.dailyChallenges?.tasks && user.dailyChallenges.tasks.length >= 3
      ? user.dailyChallenges.tasks.slice(0, 3)
      : [
          {
            id: 'fallback_1',
            type: 'FIND_WORDS_IN_TIME' as const,
            title: 'صَيْد الكلمات السريع',
            description: `اختر ${totalStageWords} كلمات في أقل من 3 دقائق`,
            current: foundWords.length,
            target: totalStageWords,
            rewardCoins: 150,
            rewardXP: 120,
            completed: foundWords.length >= totalStageWords,
            claimed: false
          },
          {
            id: 'fallback_2',
            type: 'SPEED_45S' as const,
            title: 'سرعة البرق',
            description: 'أكمل مرحلة في أقل من 45 ثانية',
            current: foundWords.length >= totalStageWords && seconds <= 45 ? 1 : 0,
            target: 1,
            rewardCoins: 250,
            rewardXP: 200,
            completed: foundWords.length >= totalStageWords && seconds <= 45,
            claimed: false
          },
          {
            id: 'fallback_3',
            type: 'NO_HINTS_STAGE' as const,
            title: 'اعتمد على ذاتك',
            description: 'أكمل مرحلة كاملة بدون استخدام أي تلميح',
            current: foundWords.length >= totalStageWords && hintsUsedCount === 0 ? 1 : 0,
            target: 1,
            rewardCoins: 175,
            rewardXP: 140,
            completed: foundWords.length >= totalStageWords && hintsUsedCount === 0,
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

  return (
    <div
      className="min-h-screen w-full relative overflow-hidden flex flex-col justify-between pb-8 select-none"
      style={{
        background:
          'radial-gradient(circle at 50% 22%, #0b2d48 0%, #051626 52%, #020b14 100%)'
      }}
      dir="rtl"
    >
      {/* ===================================================================== */}
      {/* DECORATIVE KUWAIT TOWERS SKYLINE & WAVING FLAGS (MATCHING DESIGN)     */}
      {/* ===================================================================== */}
      {/* Top-Left Kuwaiti Flag Ribbon */}
      <div className="pointer-events-none absolute top-10 -left-10 w-52 h-16 opacity-90 -rotate-12 z-0 hidden sm:block">
        <svg viewBox="0 0 240 80" className="w-full h-full drop-shadow-[0_6px_16px_rgba(0,0,0,0.6)]">
          <path d="M0,15 Q120,-5 240,25 L240,42 Q120,12 0,32 Z" fill="#007A3D" />
          <path d="M0,32 Q120,12 240,42 L240,58 Q120,28 0,48 Z" fill="#FFFFFF" />
          <path d="M0,48 Q120,28 240,58 L240,75 Q120,45 0,65 Z" fill="#CE1126" />
          <polygon points="0,15 55,28 55,52 0,65" fill="#000000" />
        </svg>
      </div>

      {/* Bottom-Left Kuwait Skyline & Waving Flag */}
      <div className="pointer-events-none absolute bottom-0 left-0 w-72 sm:w-96 h-56 z-0 opacity-95">
        <svg viewBox="0 0 400 240" className="w-full h-full">
          <defs>
            <linearGradient id="cyanGlowLeft" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#0369a1" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          {/* Glowing City Buildings Left */}
          <g fill="url(#cyanGlowLeft)" opacity="0.65">
            <rect x="25" y="105" width="18" height="95" rx="2" />
            <rect x="48" y="80" width="22" height="120" rx="2" />
            <polygon points="80,55 92,30 104,55 104,200 80,200" />
            <rect x="112" y="95" width="26" height="105" rx="2" />
            <rect x="145" y="115" width="20" height="85" rx="2" />
            <rect x="172" y="130" width="18" height="70" rx="2" />
          </g>
          {/* Waving Kuwait Flag Bottom Left */}
          <path d="M-10,130 Q110,165 260,215 L260,240 L-10,240 Z" fill="#007A3D" />
          <path d="M-10,152 Q110,185 260,228 L260,240 L-10,240 Z" fill="#FFFFFF" />
          <path d="M-10,174 Q110,205 260,238 L260,240 L-10,240 Z" fill="#CE1126" />
          <polygon points="-10,125 45,155 35,205 -10,215" fill="#000000" />
        </svg>
      </div>

      {/* Bottom-Right Kuwait Towers & Waving Flag */}
      <div className="pointer-events-none absolute bottom-0 right-0 w-72 sm:w-96 h-56 z-0 opacity-95">
        <svg viewBox="0 0 400 240" className="w-full h-full">
          <defs>
            <linearGradient id="cyanGlowRight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.15" />
            </linearGradient>
          </defs>
          {/* Iconic Three Kuwait Towers Silhouette Right */}
          <g fill="url(#cyanGlowRight)">
            {/* Main Tower */}
            <polygon points="338,20 343,20 347,195 334,195" />
            <circle cx="340.5" cy="88" r="18" fill="#38bdf8" opacity="0.85" />
            <circle cx="340.5" cy="56" r="11" fill="#7dd3fc" opacity="0.9" />
            {/* Second Tower */}
            <polygon points="368,45 372,45 376,195 364,195" />
            <circle cx="370" cy="105" r="13" fill="#38bdf8" opacity="0.85" />
            {/* Third Needle Tower */}
            <polygon points="315,65 318,65 321,195 312,195" />
          </g>
          {/* Waving Kuwait Flag Bottom Right */}
          <path d="M410,130 Q290,165 140,215 L140,240 L410,240 Z" fill="#007A3D" />
          <path d="M410,152 Q290,185 140,228 L140,240 L410,240 Z" fill="#FFFFFF" />
          <path d="M410,174 Q290,205 140,238 L140,240 L410,240 Z" fill="#CE1126" />
        </svg>
      </div>

      {/* ===================================================================== */}
      {/* MAIN CONTENT WRAPPER                                                  */}
      {/* ===================================================================== */}
      <div className="relative z-10 max-w-6xl w-full mx-auto px-3 sm:px-6 pt-2.5 space-y-2.5">
        {/* ------------------------------------------------------------------- */}
        {/* ROW 1: TOP ARENA HEADER BAR (Logo + Room Code + Utility Icons)       */}
        {/* ------------------------------------------------------------------- */}
        <div className="flex items-center justify-between gap-2 pb-1" dir="ltr">
          {/* Left Cluster: Back Button + Room Code Pill + Word Counter Pill */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                sounds.playTap();
                onExit();
              }}
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-white transition-transform active:scale-95 cursor-pointer"
              style={{
                background: 'linear-gradient(180deg, #12334e 0%, #081b2c 100%)',
                border: '1.5px solid rgba(56, 189, 248, 0.55)',
                boxShadow: '0 0 15px rgba(14, 165, 233, 0.25)'
              }}
              title="رجوع"
            >
              <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
            </button>

            {/* Room Code Pill */}
            <button
              onClick={handleCopyRoomCode}
              className="h-11 px-3.5 rounded-2xl flex items-center gap-2.5 text-white transition-transform active:scale-95 cursor-pointer"
              style={{
                background: 'linear-gradient(180deg, #102e47 0%, #071827 100%)',
                border: '1.5px solid rgba(56, 189, 248, 0.5)',
                boxShadow: '0 0 15px rgba(14, 165, 233, 0.2)'
              }}
              title="نسخ رمز المرحلة / الغرفة"
            >
              <div className="text-center leading-tight">
                <span className="text-[10px] text-slate-300 font-bold block">رمز الغرفة</span>
                <span className="text-sm sm:text-base font-black font-mono tracking-wider text-white">
                  {stageRoomCode}
                </span>
              </div>
              {copiedCode ? (
                <Check className="w-4 h-4 text-lime-400 shrink-0" />
              ) : (
                <Copy className="w-4 h-4 text-cyan-400 shrink-0" />
              )}
            </button>

            {/* Progress / Players Pill */}
            <div
              className="h-11 px-3.5 rounded-2xl hidden sm:flex items-center gap-2 text-white font-black text-sm tabular-nums"
              style={{
                background: 'linear-gradient(180deg, #102e47 0%, #071827 100%)',
                border: '1.5px solid rgba(56, 189, 248, 0.45)'
              }}
            >
              <Users className="w-4 h-4 text-cyan-300" />
              <span>
                {foundWords.length}/{totalStageWords}
              </span>
            </div>
          </div>

          {/* Center Brand Logo with Glowing Skyline */}
          <div className="flex items-center justify-center gap-3">
            {/* Left Mini Skyline Silhouette */}
            <svg viewBox="0 0 100 50" className="w-20 h-11 hidden md:block opacity-85">
              <rect x="15" y="20" width="8" height="30" fill="#38bdf8" opacity="0.5" />
              <rect x="27" y="12" width="10" height="38" fill="#38bdf8" opacity="0.7" />
              <polygon points="44,8 49,0 54,8 54,50 44,50" fill="#67e8f9" opacity="0.85" />
              <rect x="58" y="18" width="12" height="32" fill="#0284c7" opacity="0.6" />
              <rect x="74" y="25" width="9" height="25" fill="#38bdf8" opacity="0.4" />
            </svg>

            <div className="text-center" dir="rtl">
              <div className="flex items-center justify-center gap-1">
                <span
                  className="text-2xl sm:text-3xl font-black text-white tracking-tight"
                  style={{
                    textShadow: '0 3px 12px rgba(56, 189, 248, 0.55)'
                  }}
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

            {/* Right Mini Kuwait Towers Silhouette */}
            <svg viewBox="0 0 100 50" className="w-20 h-11 hidden md:block opacity-90">
              <polygon points="32,4 35,4 37,50 30,50" fill="#67e8f9" />
              <circle cx="33.5" cy="22" r="6" fill="#38bdf8" />
              <circle cx="33.5" cy="12" r="3.5" fill="#bae6fd" />
              <polygon points="48,10 50,10 52,50 46,50" fill="#38bdf8" />
              <circle cx="49" cy="27" r="4.5" fill="#7dd3fc" />
              <polygon points="20,16 22,16 23,50 19,50" fill="#38bdf8" />
            </svg>
          </div>

          {/* Right Cluster: 4 Square-Rounded Utility Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                sounds.playTap();
                onToggleMute?.();
              }}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center text-white transition-transform active:scale-95 cursor-pointer"
              style={{
                background: 'linear-gradient(180deg, #12334e 0%, #081b2c 100%)',
                border: '1.5px solid rgba(125, 211, 252, 0.5)'
              }}
              title={isMuted ? 'تشغيل الصوت' : 'كتم الصوت'}
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5 text-rose-400" />
              ) : (
                <Volume2 className="w-5 h-5 text-white" />
              )}
            </button>

            <button
              onClick={() => {
                sounds.playTap();
                onNavigate?.('SETTINGS');
              }}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center text-white transition-transform active:scale-95 cursor-pointer"
              style={{
                background: 'linear-gradient(180deg, #12334e 0%, #081b2c 100%)',
                border: '1.5px solid rgba(125, 211, 252, 0.5)'
              }}
              title="الإعدادات"
            >
              <Settings className="w-5 h-5 text-white" />
            </button>

            <button
              onClick={() => {
                sounds.playTap();
                setShowInfoModal(prev => !prev);
              }}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl hidden sm:flex items-center justify-center text-white transition-transform active:scale-95 cursor-pointer"
              style={{
                background: 'linear-gradient(180deg, #12334e 0%, #081b2c 100%)',
                border: '1.5px solid rgba(125, 211, 252, 0.5)'
              }}
              title="معلومات المرحلة"
            >
              <Info className="w-5 h-5 text-white" />
            </button>

            <button
              onClick={handleToggleFullscreen}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl hidden sm:flex items-center justify-center text-white transition-transform active:scale-95 cursor-pointer"
              style={{
                background: 'linear-gradient(180deg, #12334e 0%, #081b2c 100%)',
                border: '1.5px solid rgba(125, 211, 252, 0.5)'
              }}
              title="ملء الشاشة"
            >
              <Maximize2 className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* ROW 2: MAIN CAPSULE NAVIGATION & DYNAMIC PLAYER BAR                 */}
        {/* ------------------------------------------------------------------- */}
        <div
          className="w-full rounded-full px-3 sm:px-5 py-2 flex items-center justify-between gap-2 flex-wrap"
          style={{
            background: 'linear-gradient(180deg, rgba(10, 35, 56, 0.95) 0%, rgba(5, 19, 32, 0.98) 100%)',
            border: '1.5px solid rgba(56, 189, 248, 0.55)',
            boxShadow: '0 0 24px rgba(14, 165, 233, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.15)'
          }}
        >
          {/* Right Zone (RTL): Back Arrow + Brand + Tagline */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                sounds.playTap();
                onExit();
              }}
              className="w-8 h-8 rounded-full bg-slate-800/90 hover:bg-slate-700 border border-cyan-400/40 flex items-center justify-center text-white cursor-pointer"
              title="رجوع للمراحل"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <span className="text-lg sm:text-xl font-black text-white">فتّشها</span>
            <span
              className="hidden md:inline-block text-[11px] font-bold text-amber-300 px-2.5 py-0.5 rounded-lg"
              style={{
                background: 'rgba(245, 158, 11, 0.14)',
                border: '1px solid rgba(251, 191, 36, 0.45)'
              }}
            >
              تحداك في كل كلمة
            </span>
          </div>

          {/* Center Zone: Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7 text-xs sm:text-sm font-extrabold">
            <button
              onClick={() => sounds.playTap()}
              className="text-white relative py-1 cursor-pointer whitespace-nowrap"
            >
              <span>اللعب الآن</span>
              <span className="absolute bottom-0 inset-x-0 h-0.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
            </button>
            <button
              onClick={() => {
                sounds.playTap();
                onExit();
              }}
              className="text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              المراحل
            </button>
            <button
              onClick={() => {
                sounds.playTap();
                onNavigate?.('LEADERBOARD');
              }}
              className="text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              المتصدرين
            </button>
            <button
              onClick={() => {
                sounds.playTap();
                onNavigate?.('SETTINGS');
              }}
              className="text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              الإعدادات
            </button>
          </nav>

          {/* Left Zone (RTL): Dynamic Player Coins/Hints + TV + Sound + Active Player Capsule */}
          <div className="flex items-center gap-2">
            {/* Coins & Hints Capsule (Opens Fatteshha Economy Store) */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                setShowStoreModal(true);
              }}
              className="px-3 py-1 rounded-full flex items-center gap-2 text-xs font-black tabular-nums cursor-pointer hover:brightness-110 transition-all"
              style={{
                background: 'rgba(6, 20, 34, 0.9)',
                border: '1px solid rgba(56, 189, 248, 0.35)'
              }}
              title="متجر عملات فتّشها والمكافآت اليومية"
            >
              <span className="flex items-center gap-1 text-amber-400">
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                <span>{user?.coins ?? 150}</span>
              </span>
              <span className="text-slate-600">/</span>
              <span className="flex items-center gap-1 text-cyan-300">
                <span>{hintsAvailable}</span>
                <Lightbulb className="w-3.5 h-3.5 text-cyan-400" />
              </span>
              <ShoppingBag className="w-3.5 h-3.5 text-lime-400 ml-0.5" />
            </button>

            {/* TV Mode Button */}
            <button
              onClick={() => {
                sounds.playTap();
                onToggleTV?.();
              }}
              className={`px-3 py-1 rounded-full text-xs font-extrabold hidden sm:flex items-center gap-1.5 border transition-colors cursor-pointer ${
                tvMode
                  ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                  : 'bg-slate-900/90 border-cyan-400/35 text-slate-200 hover:text-white'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>بث TV</span>
            </button>

            {/* Mute Button */}
            <button
              onClick={() => {
                sounds.playTap();
                onToggleMute?.();
              }}
              className="w-8 h-8 rounded-full bg-slate-900/90 border border-emerald-400/40 flex items-center justify-center text-emerald-400 hover:text-emerald-300 cursor-pointer"
              title={isMuted ? 'تشغيل الصوت' : 'كتم الصوت'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Dynamic Active Player Capsule */}
            <button
              onClick={() => {
                sounds.playTap();
                onNavigate?.('PROFILE');
              }}
              className="pl-3 pr-1.5 py-1 rounded-full flex items-center gap-2 cursor-pointer transition-transform active:scale-95"
              style={{
                background: 'linear-gradient(180deg, #102b42 0%, #071726 100%)',
                border: '1.5px solid rgba(251, 191, 36, 0.55)'
              }}
              title="الملف الشخصي وتبديل اللاعب"
            >
              <img
                src={user?.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg'}
                alt={user?.displayName || 'لاعب'}
                className="w-7 h-7 rounded-full object-cover border border-amber-400"
              />
              <span className="text-xs font-black text-amber-300 truncate max-w-[110px]">
                {user?.displayName || 'ضيف #981'}
              </span>
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* ROW 3: STAGE TITLE & LIVE METERS BAR                                */}
        {/* ------------------------------------------------------------------- */}
        <div
          className="max-w-4xl mx-auto rounded-2xl px-3.5 sm:px-5 py-2.5 flex items-center justify-between gap-3 flex-wrap"
          style={{
            background: 'linear-gradient(180deg, rgba(9, 32, 52, 0.92) 0%, rgba(5, 18, 31, 0.96) 100%)',
            border: '1.5px solid rgba(56, 189, 248, 0.45)',
            boxShadow: '0 0 20px rgba(14, 165, 233, 0.15)'
          }}
        >
          {/* Right Side: Back Arrow + Dynamic Category & Stage Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                sounds.playTap();
                onExit();
              }}
              className="w-9 h-9 rounded-full bg-slate-800/90 hover:bg-slate-700 border border-cyan-400/35 flex items-center justify-center text-slate-200 hover:text-white transition-colors cursor-pointer"
              title="رجوع للمراحل"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="text-right leading-tight">
              <span className="text-xs font-extrabold text-amber-400 block">{category.name}</span>
              <h3 className="text-sm sm:text-base font-black text-white">{levelInfo.title}</h3>
            </div>
          </div>

          {/* Left Side: Score, Accuracy, Timer, Hint, Shuffle */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Score Pill */}
            <div
              className="px-3.5 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-black text-amber-300 tabular-nums"
              style={{
                background: 'rgba(20, 32, 48, 0.9)',
                border: '1.5px solid rgba(251, 191, 36, 0.55)'
              }}
            >
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>{score > 0 ? `${score} نقطة` : 'نقطة'}</span>
            </div>

            {/* Accuracy Pill */}
            <div
              className="px-3.5 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-black text-emerald-400 tabular-nums"
              style={{
                background: 'rgba(10, 35, 42, 0.9)',
                border: '1.5px solid rgba(16, 185, 129, 0.55)'
              }}
              title="دقة التحديد"
            >
              <Target className="w-4 h-4 text-emerald-400" />
              <span>{currentAccuracy}%</span>
            </div>

            {/* 2-Minute Stage Countdown Timer Pill */}
            <div
              className={`px-3.5 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-black font-mono tabular-nums transition-all ${
                freezeSecondsRemaining > 0
                  ? 'bg-cyan-950/95 text-cyan-200 border-2 border-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.65)]'
                  : remainingSeconds <= 20
                  ? 'bg-rose-950/90 text-rose-300 border-2 border-rose-500 animate-pulse'
                  : remainingSeconds <= 60
                  ? 'bg-amber-950/90 text-amber-300 border border-amber-500/70'
                  : 'bg-slate-900/90 text-cyan-300 border border-cyan-400/50'
              }`}
              title={`مؤقت المرحلة: متبقي ${formatTime(remainingSeconds)} من دقيقتين (المستغرق: ${seconds} ثانية)`}
            >
              <Clock
                className={`w-4 h-4 ${
                  freezeSecondsRemaining > 0
                    ? 'text-cyan-300'
                    : remainingSeconds <= 20
                    ? 'text-rose-400 animate-bounce'
                    : remainingSeconds <= 60
                    ? 'text-amber-400'
                    : 'text-cyan-400'
                }`}
              />
              <span>
                {freezeSecondsRemaining > 0
                  ? `❄️ مجمد (${freezeSecondsRemaining}ث)`
                  : formatTime(remainingSeconds)}
              </span>
              {freezeSecondsRemaining === 0 && (
                <span className="text-[10px] text-slate-400 font-sans hidden sm:inline">(دقيقتين)</span>
              )}
            </div>

            {/* 5 Hint Types Picker Button */}
            <button
              onClick={() => {
                sounds.playTap();
                setShowHintsPickerModal(true);
              }}
              className="px-3.5 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-black text-emerald-200 transition-transform active:scale-95 cursor-pointer tabular-nums"
              style={{
                background: 'linear-gradient(180deg, #0d4a4d 0%, #072c30 100%)',
                border: '1.5px solid rgba(52, 211, 153, 0.65)',
                boxShadow: '0 0 12px rgba(16, 185, 129, 0.25)'
              }}
              title="اختر نوع التلميح (5 أنواع تلميحات ذكية)"
            >
              <Lightbulb className="w-4 h-4 text-emerald-300" />
              <span>التلميحات الـ5 ({hintsAvailable})</span>
            </button>

            {/* Fatteshha Store Button */}
            <button
              onClick={() => {
                sounds.playTap();
                setShowStoreModal(true);
              }}
              className="px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-black text-amber-200 transition-transform active:scale-95 cursor-pointer"
              style={{
                background: 'linear-gradient(180deg, #452708 0%, #291603 100%)',
                border: '1.5px solid rgba(251, 191, 36, 0.65)'
              }}
              title="متجر عملات فتّشها والمكافآت"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-amber-300" />
              <span>المتجر</span>
            </button>

            {/* Shuffle / Reset Grid Button */}
            <button
              onClick={() => {
                sounds.playTap();
                initGame(true);
              }}
              className="w-9 h-9 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-cyan-400/35 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
              title={tvMode ? 'إعادة ضبط الجولة مع تثبيت الحروف للتلفزيون' : 'إعادة خلط وتغيير أماكن الحروف'}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* ROW 3.5: LIVE 3-STAR CRITERIA TRACKER (متابعة قواعد النجوم الثلاث)   */}
        {/* ------------------------------------------------------------------- */}
        <div
          className="max-w-4xl mx-auto rounded-2xl px-3.5 sm:px-4 py-2 flex items-center justify-between gap-2 text-xs flex-wrap shadow-md"
          style={{
            background: 'linear-gradient(180deg, rgba(7, 24, 40, 0.95) 0%, rgba(3, 14, 24, 0.98) 100%)',
            border: '1.5px solid rgba(56, 189, 248, 0.35)',
            boxShadow: '0 0 15px rgba(2, 132, 199, 0.12)'
          }}
        >
          <div className="flex items-center gap-1.5 text-amber-300 font-black text-xs shrink-0">
            <span>🏆</span>
            <span>شروط النجوم:</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            {/* Star 1 */}
            <div
              className="flex items-center gap-1 font-bold text-[11px] sm:text-xs text-emerald-300"
              title="النجمة الأولى: إكمال المرحلة وحل جميع الكلمات المطلوبة"
            >
              <span className="text-amber-400 font-black">⭐ ١</span>
              <span>إنهاء المرحلة</span>
              <span className="text-emerald-400 font-black">✓</span>
            </div>

            <span className="text-slate-600 hidden sm:inline">•</span>

            {/* Star 2 */}
            <div
              className={`flex items-center gap-1 font-bold text-[11px] sm:text-xs transition-colors ${
                hintsUsedCount === 0 ? 'text-emerald-300' : 'text-slate-500 line-through opacity-75'
              }`}
              title="النجمة الثانية: عدم استخدام أي وسيلة مساعدة (تلميح)"
            >
              <span className="text-amber-400 font-black">⭐ ٢</span>
              <span>بدون وسيلة مساعدة</span>
              <span className={hintsUsedCount === 0 ? 'text-emerald-400 font-black' : 'text-rose-400 font-black'}>
                {hintsUsedCount === 0 ? '✓' : '✗'}
              </span>
            </div>

            <span className="text-slate-600 hidden sm:inline">•</span>

            {/* Star 3 */}
            <div
              className={`flex items-center gap-1 font-bold text-[11px] sm:text-xs transition-colors ${
                seconds < 60 ? 'text-amber-300' : 'text-slate-500 line-through opacity-75'
              }`}
              title="النجمة الثالثة: إكمال المرحلة بأقل من دقيقة (أقل من 60 ثانية)"
            >
              <span className="text-amber-400 font-black">⭐ ٣</span>
              <span>أقل من دقيقة</span>
              <span className={seconds < 60 ? 'text-amber-300 font-black' : 'text-rose-400 font-black'}>
                {seconds < 60 ? `✓ (${Math.max(0, 60 - seconds)}ث متبقية)` : '✗ تجاوزت'}
              </span>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* ROW 4: ROUND / DAILY CHALLENGES BAR (تحديات الجولة)                  */}
        {/* ------------------------------------------------------------------- */}
        <div
          onClick={() => {
            sounds.playTap();
            setShowDailyModal(true);
          }}
          className="max-w-4xl mx-auto rounded-full px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto text-xs cursor-pointer hover:brightness-110 transition-all"
          style={{
            background: 'linear-gradient(180deg, rgba(8, 28, 46, 0.92) 0%, rgba(4, 16, 28, 0.96) 100%)',
            border: '1.5px solid rgba(56, 189, 248, 0.4)'
          }}
          title="اضغط لفتح نافذة التحديات اليومية والمكافآت"
        >
          <span className="text-amber-400 font-black whitespace-nowrap shrink-0">
            تحديات الجولة:
          </span>

          <div className="flex items-center gap-2 overflow-x-auto">
            {activeChallenges.map((task) => (
              <div
                key={task.id}
                className={`px-3 py-1 rounded-full border flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  task.completed
                    ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                    : 'bg-slate-950/80 border-cyan-400/30 text-slate-200'
                }`}
              >
                <span className="font-bold">{task.description}</span>
                <span className="font-mono font-black text-amber-400 tabular-nums">
                  ({task.current}/{task.target})
                </span>
              </div>
            ))}
          </div>
        </div>

        {dailyToast && (
          <div className="max-w-xl mx-auto bg-lime-500/20 border border-lime-400/60 text-lime-200 px-4 py-2 rounded-full text-xs font-black text-center animate-bounce">
            {dailyToast}
          </div>
        )}

        {/* ------------------------------------------------------------------- */}
        {/* ROW 5: STAGE INSTRUCTION / LIVE COMMENTARY CAPSULE                  */}
        {/* ------------------------------------------------------------------- */}
        <div className="flex justify-center">
          <div
            className="px-6 py-2 rounded-full flex items-center justify-center gap-2.5 text-xs sm:text-sm font-black text-white shadow-lg"
            style={{
              background: 'linear-gradient(180deg, rgba(14, 46, 72, 0.95) 0%, rgba(7, 24, 40, 0.98) 100%)',
              border: '1.5px solid rgba(56, 189, 248, 0.55)',
              boxShadow: '0 0 18px rgba(14, 165, 233, 0.22)'
            }}
          >
            <span className="w-6 h-6 rounded-lg bg-amber-400/20 border border-amber-400/50 flex items-center justify-center text-amber-300 shrink-0">
              <BookOpen className="w-3.5 h-3.5" />
            </span>
            <span>
              {statusBanner
                ? statusBanner
                : `مرحلة ${levelInfo.levelNumber}/${category.totalLevels} • ${levelInfo.title} - اختر ${totalStageWords} كلمات!`}
            </span>
          </div>
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* ROW 6: REQUIRED WORDS PANEL (الكلمات المطلوبة)                      */}
        {/* ------------------------------------------------------------------- */}
        <div className="max-w-4xl mx-auto">
          <WordBank
            wordPlacements={board.wordPlacements}
            foundWords={foundWords}
            hintWord={hintPlacement?.word || null}
            showWordLengths={showWordLengths}
          />
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* ROW 6.5: QUICK 5 HINT TYPES BAR (أنواع التلميحات الخمسة المقترحة)   */}
        {/* ------------------------------------------------------------------- */}
        <div className="max-w-4xl mx-auto">
          <div
            className="rounded-2xl px-3 py-2 flex items-center justify-between gap-2 overflow-x-auto"
            style={{
              background: 'linear-gradient(180deg, rgba(7, 26, 43, 0.92) 0%, rgba(4, 15, 25, 0.96) 100%)',
              border: '1.5px solid rgba(52, 211, 153, 0.4)'
            }}
          >
            <div className="flex items-center gap-1.5 text-xs font-black text-emerald-300 shrink-0">
              <Lightbulb className="w-4 h-4 text-amber-300" />
              <span>وسائل المساعدة:</span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
              {/* Quick Power-Ups in Stage */}
              <button
                type="button"
                onClick={() => handleUsePowerUp('FREEZE_TIME')}
                className={`px-2.5 py-1 rounded-xl border text-[11px] font-black flex items-center gap-1 shrink-0 cursor-pointer transition-all ${
                  freezeSecondsRemaining > 0
                    ? 'bg-cyan-500/30 border-cyan-300 text-cyan-100'
                    : 'bg-[#082c42] hover:bg-[#0d3f5e] border-cyan-400/50 text-cyan-200'
                }`}
                title="تجميد الوقت 30 ثانية"
              >
                <span>❄️ تجميد الوقت</span>
                <span className="px-1.5 rounded-full bg-cyan-400/20 text-cyan-200 font-mono text-[10px]">
                  ×{user?.powerUps?.FREEZE_TIME ?? 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleUsePowerUp('DOUBLE_BOOST')}
                className={`px-2.5 py-1 rounded-xl border text-[11px] font-black flex items-center gap-1 shrink-0 cursor-pointer transition-all ${
                  doubleBoostActive
                    ? 'bg-amber-400 text-slate-950 border-amber-200'
                    : 'bg-[#2a2208] hover:bg-[#40340c] border-amber-400/50 text-amber-200'
                }`}
                title="مضاعف العملات والخبرة 2x"
              >
                <span>{doubleBoostActive ? '⚡ مضاعف 2x مُفعّل ✓' : '⚡ مضاعف 2x'}</span>
                {!doubleBoostActive && (
                  <span className="px-1.5 rounded-full bg-amber-400/20 text-amber-200 font-mono text-[10px]">
                    ×{user?.powerUps?.DOUBLE_BOOST ?? 0}
                  </span>
                )}
              </button>

              {HINT_DEFINITIONS.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => handleApplyHintType(h.id)}
                  className="px-2.5 py-1 rounded-xl bg-[#0b2940] hover:bg-[#123d5e] border border-cyan-400/35 hover:border-amber-400/70 text-[11px] font-black text-white flex items-center gap-1.5 shrink-0 cursor-pointer transition-all active:scale-95"
                  title={`${h.description} (التكلفة: ${h.hintCost} تلميح أو ${h.coinCost} عملة فتّشها)`}
                >
                  <span>{h.badge}</span>
                  <span>{h.name}</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-400/20 border border-amber-400/50 text-amber-300 font-mono text-[10px]">
                    {hintsAvailable >= h.hintCost ? `${h.hintCost}💡` : `${h.coinCost}🪙`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* ROW 7: THE LETTER GRID TABLE (طاولة الحروف)                         */}
        {/* ------------------------------------------------------------------- */}
        <div className="flex justify-center pt-1">
          <GameBoard
            grid={board.grid}
            gridSize={board.gridSize}
            wordPlacements={board.wordPlacements}
            foundWords={foundWords}
            onWordSelected={handleWordFound}
            onWordMistake={handleWordMistake}
            hintCell={hintCell}
            hintPlacement={hintPlacement}
            revealedCells={revealedCells}
            dimUnusedCells={dimUnusedCells}
            boardThemeId={user?.equippedBoardTheme}
            trailStyleId={user?.equippedTrail}
            tvMode={tvMode}
          />
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 5 HINT TYPES MODAL (أنواع التلميحات الخمسة بعملات فتّشها أو الرصيد)     */}
      {/* ===================================================================== */}
      {showHintsPickerModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4"
          dir="rtl"
          onClick={() => setShowHintsPickerModal(false)}
        >
          <div
            className="max-w-lg w-full rounded-3xl p-5 sm:p-6 text-right border-2 border-emerald-400/60 shadow-[0_0_40px_rgba(16,185,129,0.3)] space-y-4"
            style={{
              background: 'linear-gradient(180deg, #08263a 0%, #041320 100%)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-400/20 border border-emerald-400/50 flex items-center justify-center text-emerald-300">
                  <Lightbulb className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    أنواع التلميحات المساعدة (5 خيارات)
                  </h3>
                  <span className="text-xs text-slate-300 font-bold">
                    رصيدك: <strong className="text-cyan-300">{hintsAvailable} تلميح 💡</strong> •{' '}
                    <strong className="text-amber-300">{user?.coins ?? 150} عملة فتّشها 🪙</strong>
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHintsPickerModal(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              {HINT_DEFINITIONS.map((h, idx) => (
                <div
                  key={h.id}
                  className="p-3 rounded-2xl bg-[#051a29] border border-cyan-500/30 hover:border-emerald-400/60 flex items-center justify-between gap-3 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-slate-900 border border-cyan-400/30 flex items-center justify-center text-xs font-black text-amber-300 shrink-0">
                      {h.badge}
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-black text-white">
                        {idx + 1}. {h.name}
                      </div>
                      <div className="text-[11px] text-slate-300 font-bold">{h.description}</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleApplyHintType(h.id)}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-b from-[#a3e635] to-[#65a30d] text-slate-950 font-black text-xs shrink-0 cursor-pointer shadow hover:brightness-110 active:scale-95"
                  >
                    {hintsAvailable >= h.hintCost
                      ? `استخدام (${h.hintCost} 💡)`
                      : `شراء (${h.coinCost} 🪙)`}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Fatteshha Store Modal */}
      <StoreModal
        isOpen={showStoreModal}
        onClose={() => setShowStoreModal(false)}
        user={user}
        onUpdateUser={onUpdateUser}
        onNavigate={onNavigate}
        initialTab="POWERUPS"
      />

      {/* Stage Info Modal (when clicking ⓘ) */}
      {showInfoModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowInfoModal(false)}
        >
          <div
            className="max-w-md w-full rounded-3xl p-6 text-right border border-cyan-400/50 shadow-2xl"
            style={{
              background: 'linear-gradient(180deg, #0c2942 0%, #051320 100%)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h4 className="text-lg font-black text-white mb-2">
              معلومات المرحلة ({category.name} - مرحلة #{levelInfo.levelNumber})
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              اسحب بالماوس أو بإصبعك (أو بالأسهم في ريموت التلفزيون) لتحديد الكلمات المطلوبة في جميع الاتجاهات (أفقي، عمودي، أو قطري).
            </p>
            <div className="text-xs text-amber-300 font-bold space-y-1.5 mb-4 p-3 rounded-2xl bg-slate-900/80 border border-slate-700/60">
              <div className="text-cyan-300 font-black mb-1">⭐ قواعد الحصول على النجوم الثلاث:</div>
              <div className="flex items-center gap-2">
                <span className="text-amber-400">⭐ النجمة الأولى:</span>
                <span className="text-slate-200">مجرد إكمال المرحلة وإيجاد جميع الكلمات.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-amber-400">⭐⭐ النجمة الثانية:</span>
                <span className="text-slate-200">عدم استخدام أي وسيلة مساعدة (تلميح) إطلاقاً.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-amber-400">⭐⭐⭐ النجمة الثالثة:</span>
                <span className="text-slate-200">إنهاء المرحلة بأقل من دقيقة (من المؤقت المحدد بدقيقتين).</span>
              </div>
            </div>
            <button
              onClick={() => setShowInfoModal(false)}
              className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs cursor-pointer shadow-md"
            >
              فهمت، لنكمل اللعب!
            </button>
          </div>
        </div>
      )}

      {/* Stage Timeout Modal (انتهى الوقت المحدد للمرحلة - التصميم الكويتي النيون الفاخر) */}
      {isTimedOut && (
        <div
          className="fixed inset-0 z-50 bg-[#010912]/88 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto select-none"
          dir="rtl"
        >
          {/* ================================================================= */}
          {/* BACKGROUND CITY SKYLINE & WAVING KUWAIT FLAGS IN BACKDROP        */}
          {/* ================================================================= */}
          <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
            {/* Left Skyline Silhouette */}
            <div className="absolute bottom-0 left-0 w-80 sm:w-96 h-56 opacity-60">
              <svg viewBox="0 0 320 200" className="w-full h-full">
                <defs>
                  <linearGradient id="toCityGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#0369a1" stopOpacity="0.05" />
                  </linearGradient>
                </defs>
                <g fill="url(#toCityGlow)">
                  <rect x="20" y="80" width="18" height="120" rx="1.5" />
                  <rect x="42" y="65" width="22" height="135" rx="1.5" />
                  <polygon points="75,40 85,20 95,40 95,200 75,200" />
                  <rect x="102" y="75" width="24" height="125" rx="1.5" />
                  <rect x="132" y="90" width="18" height="110" rx="1.5" />
                  <rect x="156" y="105" width="20" height="95" rx="1.5" />
                  <rect x="182" y="60" width="22" height="140" rx="1.5" />
                </g>
              </svg>
            </div>

            {/* Right Kuwait Towers Silhouette */}
            <div className="absolute bottom-0 right-0 w-80 sm:w-96 h-64 opacity-75">
              <svg viewBox="0 0 320 240" className="w-full h-full">
                <defs>
                  <linearGradient id="toTowersGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity="0.1" />
                  </linearGradient>
                </defs>
                <g fill="url(#toTowersGlow)">
                  {/* Main Kuwait Tower */}
                  <polygon points="218,15 222,15 226,240 214,240" />
                  <circle cx="220" cy="90" r="26" fill="#38bdf8" stroke="#bae6fd" strokeWidth="2" />
                  <circle cx="220" cy="48" r="15" fill="#7dd3fc" stroke="#e0f2fe" strokeWidth="1.5" />
                  {/* Middle Tower */}
                  <polygon points="172,45 176,45 180,240 168,240" />
                  <circle cx="174" cy="118" r="19" fill="#38bdf8" stroke="#bae6fd" strokeWidth="1.8" />
                  {/* Needle Tower */}
                  <polygon points="138,70 140,70 143,240 135,240" />
                  <rect x="250" y="125" width="22" height="115" rx="2" opacity="0.6" />
                  <rect x="278" y="145" width="26" height="95" rx="2" opacity="0.5" />
                </g>
              </svg>
            </div>

            {/* Bottom-Left Kuwait Flag Ribbon */}
            <div className="absolute -bottom-6 -left-10 w-72 h-32 opacity-95">
              <svg viewBox="0 0 280 120" className="w-full h-full drop-shadow-[0_8px_20px_rgba(0,0,0,0.8)]">
                <path d="M-10,35 Q130,80 290,105 L290,120 L-10,120 Z" fill="#007A3D" />
                <path d="M-10,55 Q130,95 290,115 L290,120 L-10,120 Z" fill="#FFFFFF" />
                <path d="M-10,75 Q130,110 290,120 L290,120 L-10,120 Z" fill="#CE1126" />
                <polygon points="-10,30 50,65 40,110 -10,120" fill="#000000" />
              </svg>
            </div>

            {/* Bottom-Right Kuwait Flag Ribbon */}
            <div className="absolute -bottom-6 -right-10 w-72 h-32 opacity-95 -scale-x-100">
              <svg viewBox="0 0 280 120" className="w-full h-full drop-shadow-[0_8px_20px_rgba(0,0,0,0.8)]">
                <path d="M-10,35 Q130,80 290,105 L290,120 L-10,120 Z" fill="#007A3D" />
                <path d="M-10,55 Q130,95 290,115 L290,120 L-10,120 Z" fill="#FFFFFF" />
                <path d="M-10,75 Q130,110 290,120 L290,120 L-10,120 Z" fill="#CE1126" />
                <polygon points="-10,30 50,65 40,110 -10,120" fill="#000000" />
              </svg>
            </div>
          </div>

          {/* ================================================================= */}
          {/* MAIN MODAL CARD (MATCHING THE ATTACHED SCREENSHOT EXACTLY)        */}
          {/* ================================================================= */}
          <div
            className="relative z-10 w-full max-w-2xl my-auto pt-14 pb-6 px-4 sm:px-8 rounded-[36px] sm:rounded-[40px] text-center overflow-visible border-[2.5px] border-cyan-400 shadow-[0_0_45px_rgba(56,189,248,0.45),0_0_25px_rgba(244,63,94,0.3)] animate-in zoom-in-95 duration-200"
            style={{
              background: 'linear-gradient(180deg, #051b2c 0%, #03131f 65%, #020c15 100%)'
            }}
          >
            {/* Top-Left Circular Close Button */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onExit();
              }}
              className="absolute top-4 left-4 sm:top-5 sm:left-5 z-30 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#072439]/90 border border-cyan-400/60 flex items-center justify-center text-white hover:text-cyan-300 hover:border-cyan-300 transition-colors shadow-lg cursor-pointer"
              title="إغلاق والعودة"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Top Hourglass & Kuwait Flags Artwork */}
            <div className="relative mx-auto -mt-20 sm:-mt-24 mb-2 flex items-center justify-center">
              {/* Left Waving Kuwait Flag */}
              <div className="absolute -left-12 sm:-left-20 top-6 w-32 sm:w-44 h-20 sm:h-24 pointer-events-none opacity-90 z-0">
                <svg viewBox="0 0 200 90" className="w-full h-full drop-shadow-[0_6px_14px_rgba(0,0,0,0.6)]">
                  <path d="M0,15 Q100,-5 200,25 L200,42 Q100,12 0,32 Z" fill="#007A3D" />
                  <path d="M0,32 Q100,12 200,42 L200,58 Q100,28 0,48 Z" fill="#FFFFFF" />
                  <path d="M0,48 Q100,28 200,58 L200,75 Q100,45 0,65 Z" fill="#CE1126" />
                  <polygon points="0,15 45,28 45,52 0,65" fill="#000000" />
                </svg>
              </div>

              {/* Right Waving Kuwait Flag */}
              <div className="absolute -right-12 sm:-right-20 top-6 w-32 sm:w-44 h-20 sm:h-24 pointer-events-none opacity-90 z-0 -scale-x-100">
                <svg viewBox="0 0 200 90" className="w-full h-full drop-shadow-[0_6px_14px_rgba(0,0,0,0.6)]">
                  <path d="M0,15 Q100,-5 200,25 L200,42 Q100,12 0,32 Z" fill="#007A3D" />
                  <path d="M0,32 Q100,12 200,42 L200,58 Q100,28 0,48 Z" fill="#FFFFFF" />
                  <path d="M0,48 Q100,28 200,58 L200,75 Q100,45 0,65 Z" fill="#CE1126" />
                  <polygon points="0,15 45,28 45,52 0,65" fill="#000000" />
                </svg>
              </div>

              {/* 3D Glowing Red Hourglass with Burst Rays */}
              <div className="relative z-10 w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center">
                {/* Red Burst Glow Behind */}
                <div className="absolute inset-0 bg-red-600/40 rounded-full blur-xl scale-125 pointer-events-none animate-pulse" />
                <svg viewBox="0 0 100 120" className="w-20 h-24 sm:w-24 sm:h-28 drop-shadow-[0_0_24px_rgba(239,68,68,0.85)]">
                  <defs>
                    <linearGradient id="hgWoodGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" />
                      <stop offset="35%" stopColor="#b91c1c" />
                      <stop offset="100%" stopColor="#450a0a" />
                    </linearGradient>
                    <linearGradient id="hgSandGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fef08a" />
                      <stop offset="60%" stopColor="#facc15" />
                      <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                    <radialGradient id="hgGlowCenter" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#fca5a5" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
                    </radialGradient>
                  </defs>

                  {/* Radiating Rays */}
                  <g stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" opacity="0.9">
                    <line x1="14" y1="18" x2="3" y2="8" />
                    <line x1="28" y1="10" x2="22" y2="0" />
                    <line x1="72" y1="10" x2="78" y2="0" />
                    <line x1="86" y1="18" x2="97" y2="8" />
                    <line x1="10" y1="60" x2="0" y2="60" />
                    <line x1="90" y1="60" x2="100" y2="60" />
                  </g>

                  {/* Top Wooden Rim */}
                  <ellipse cx="50" cy="14" rx="36" ry="10" fill="url(#hgWoodGrad)" stroke="#fca5a5" strokeWidth="1.8" />
                  <rect x="18" y="14" width="64" height="4" fill="#7f1d1d" />

                  {/* Glass Outer Shell */}
                  <path
                    d="M26,16 C26,45 44,56 48,60 C44,64 26,75 26,104 L74,104 C74,75 56,64 52,60 C56,56 74,45 74,16 Z"
                    fill="rgba(255, 255, 255, 0.14)"
                    stroke="#fda4af"
                    strokeWidth="2.2"
                  />

                  {/* Sand in Upper Bulb */}
                  <path d="M32,28 C37,42 47,56 50,58 C53,56 63,42 68,28 Z" fill="url(#hgSandGrad)" opacity="0.95" />

                  {/* Sand Falling Stream */}
                  <line x1="50" y1="58" x2="50" y2="94" stroke="#fef08a" strokeWidth="2.5" strokeDasharray="3,1" />

                  {/* Sand Heap in Lower Bulb */}
                  <ellipse cx="50" cy="100" rx="20" ry="7" fill="url(#hgSandGrad)" />

                  {/* 2 Outer Wood Columns */}
                  <rect x="16" y="16" width="6" height="88" rx="3" fill="url(#hgWoodGrad)" stroke="#fca5a5" strokeWidth="1" />
                  <rect x="78" y="16" width="6" height="88" rx="3" fill="url(#hgWoodGrad)" stroke="#fca5a5" strokeWidth="1" />

                  {/* Bottom Wooden Rim */}
                  <rect x="18" y="102" width="64" height="4" fill="#7f1d1d" />
                  <ellipse cx="50" cy="106" rx="36" ry="10" fill="url(#hgWoodGrad)" stroke="#fca5a5" strokeWidth="1.8" />
                </svg>
              </div>
            </div>

            {/* =============================================================== */}
            {/* RED NEON GLOWING BANNER: انتهى الوقت المحدد للمرحلة!               */}
            {/* =============================================================== */}
            <div className="relative z-10 inline-block mb-3">
              <div
                className="px-6 sm:px-10 py-2 sm:py-2.5 rounded-full border-2 border-[#ff3366] shadow-[0_0_28px_rgba(255,51,102,0.7)]"
                style={{
                  background: 'linear-gradient(90deg, #88001b 0%, #dc2626 50%, #88001b 100%)'
                }}
              >
                <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-wide drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                  انتهى الوقت المحدد للمرحلة!
                </h2>
              </div>
            </div>

            {/* Subtitle Description */}
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed max-w-lg mx-auto mb-5 sm:mb-6 font-bold">
              <span>انتهت الدقيقتين (120 ثانية) المخصصة للمرحلة قبل العثور على جميع الكلمات </span>
              <span className="text-[#facc15] font-black text-sm sm:text-base block sm:inline mt-1 sm:mt-0">
                ({foundWords.length} من أصل {board.wordPlacements.length} كلمات).
              </span>
            </p>

            {/* =============================================================== */}
            {/* RULES BOX: قواعد النجوم في اللعبة:                              */}
            {/* =============================================================== */}
            <div className="relative z-10 mb-4 sm:mb-5">
              {/* Floating Tab Header */}
              <div
                className="absolute -top-3.5 right-1/2 translate-x-1/2 z-20 px-5 sm:px-6 py-1 rounded-full text-xs sm:text-sm font-black text-white shadow-lg border border-cyan-400"
                style={{
                  background: 'linear-gradient(180deg, #094563 0%, #052639 100%)',
                  boxShadow: '0 0 16px rgba(56, 189, 248, 0.45)'
                }}
              >
                قواعد النجوم في اللعبة:
              </div>

              {/* Rules Inner Card Container */}
              <div
                className="w-full rounded-[26px] sm:rounded-[30px] p-4 sm:p-5 pt-7 sm:pt-8 bg-[#042033]/92 border border-cyan-400/50 shadow-[0_0_25px_rgba(2,132,199,0.2)] flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6"
              >
                {/* Right Side (in RTL): 3 Stacked Star Rows */}
                <div className="w-full md:w-3/5 space-y-2">
                  {/* Row 1 */}
                  <div className="w-full bg-[#052940]/90 rounded-xl px-4 py-2 flex items-center justify-between border border-cyan-500/25 shadow-sm">
                    <span className="text-xs sm:text-sm font-bold text-right">
                      <span className="text-amber-300 font-black">النجمة 1 : </span>
                      <span className="text-white">إنهاء المرحلة بنجاح.</span>
                    </span>
                    <Star className="w-5 h-5 text-amber-400 fill-amber-400 shrink-0 drop-shadow-[0_0_8px_rgba(250,204,21,0.7)]" />
                  </div>

                  {/* Row 2 */}
                  <div className="w-full bg-[#052940]/90 rounded-xl px-4 py-2 flex items-center justify-between border border-cyan-500/25 shadow-sm">
                    <span className="text-xs sm:text-sm font-bold text-right">
                      <span className="text-amber-300 font-black">النجمة 2 : </span>
                      <span className="text-white">بدون أي وسيلة مساعدة.</span>
                    </span>
                    <Star className="w-5 h-5 text-amber-400 fill-amber-400 shrink-0 drop-shadow-[0_0_8px_rgba(250,204,21,0.7)]" />
                  </div>

                  {/* Row 3 */}
                  <div className="w-full bg-[#052940]/90 rounded-xl px-4 py-2 flex items-center justify-between border border-cyan-500/25 shadow-sm">
                    <span className="text-xs sm:text-sm font-bold text-right">
                      <span className="text-amber-300 font-black">النجمة 3 : </span>
                      <span className="text-white">إنهاء بأقل من دقيقة واحدة.</span>
                    </span>
                    <Star className="w-5 h-5 text-amber-400 fill-amber-400 shrink-0 drop-shadow-[0_0_8px_rgba(250,204,21,0.7)]" />
                  </div>
                </div>

                {/* Left Side (in RTL): 3D Golden Star Cluster Artwork */}
                <div className="w-full md:w-2/5 flex items-center justify-center py-2 relative">
                  {/* Ambient Yellow Glow */}
                  <div className="absolute w-28 h-28 bg-amber-400/25 rounded-full blur-xl pointer-events-none" />

                  <div className="relative flex items-center justify-center gap-1" dir="ltr">
                    {/* Left Small Star */}
                    <div className="relative -rotate-12 transition-transform hover:scale-110">
                      <svg viewBox="0 0 60 60" className="w-10 h-10 sm:w-12 sm:h-12 drop-shadow-[0_0_12px_rgba(250,204,21,0.8)]">
                        <polygon
                          points="30,4 37,20 54,23 42,35 45,52 30,44 15,52 18,35 6,23 23,20"
                          fill="url(#goldStarGradModal)"
                          stroke="#fef9c3"
                          strokeWidth="2"
                        />
                      </svg>
                    </div>

                    {/* Center Big Star */}
                    <div className="relative z-10 -translate-y-2 scale-110 transition-transform hover:scale-125">
                      <svg viewBox="0 0 60 60" className="w-14 h-14 sm:w-16 sm:h-16 drop-shadow-[0_0_18px_rgba(250,204,21,0.95)]">
                        <defs>
                          <linearGradient id="goldStarGradModal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#fffbeb" />
                            <stop offset="30%" stopColor="#fef08a" />
                            <stop offset="65%" stopColor="#facc15" />
                            <stop offset="100%" stopColor="#d97706" />
                          </linearGradient>
                        </defs>
                        <polygon
                          points="30,4 37,20 54,23 42,35 45,52 30,44 15,52 18,35 6,23 23,20"
                          fill="url(#goldStarGradModal)"
                          stroke="#ffffff"
                          strokeWidth="2.5"
                        />
                      </svg>
                    </div>

                    {/* Right Small Star */}
                    <div className="relative rotate-12 transition-transform hover:scale-110">
                      <svg viewBox="0 0 60 60" className="w-10 h-10 sm:w-12 sm:h-12 drop-shadow-[0_0_12px_rgba(250,204,21,0.8)]">
                        <polygon
                          points="30,4 37,20 54,23 42,35 45,52 30,44 15,52 18,35 6,23 23,20"
                          fill="url(#goldStarGradModal)"
                          stroke="#fef9c3"
                          strokeWidth="2"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* =============================================================== */}
            {/* ACTION BUTTON 1: YELLOW PRIMARY REPLAY BUTTON                   */}
            {/* =============================================================== */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                initGame(true);
              }}
              className="w-full py-3.5 sm:py-4 px-5 sm:px-6 rounded-full flex items-center justify-between border-2 border-[#fff380] shadow-[0_0_25px_rgba(250,204,21,0.65)] hover:shadow-[0_0_35px_rgba(250,204,21,0.85)] cursor-pointer transition-transform active:scale-98 mb-3"
              style={{
                background: 'linear-gradient(180deg, #ffd700 0%, #ffaa00 100%)'
              }}
            >
              {/* Circular Arrow on Right */}
              <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 text-slate-950 stroke-[2.5]" />

              {/* Main Text */}
              <span className="text-slate-950 font-black text-sm sm:text-base lg:text-lg tracking-wide">
                {tvMode
                  ? 'إعادة المرحلة فوراً (نفس مواقع الحروف للتلفزيون)'
                  : 'إعادة المرحلة فوراً (تغيير مواقع الحروف)'}
              </span>

              {/* Blue Shuffle / TV Pill Badge on Left */}
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#093557] border border-cyan-400/60 flex items-center justify-center text-cyan-300 shadow-md">
                {tvMode ? <Tv className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-300" /> : <Shuffle className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-300" />}
              </div>
            </button>

            {/* =============================================================== */}
            {/* MODE STATUS PILL: وضع الهاتف / وضع التلفزيون                     */}
            {/* =============================================================== */}
            <div
              className="w-full py-2.5 px-4 rounded-full bg-[#032338]/95 border border-cyan-400/50 flex items-center justify-center gap-2 text-xs sm:text-sm font-black text-white shadow-[0_0_15px_rgba(56,189,248,0.3)] mb-3"
            >
              <span>
                {tvMode
                  ? 'وضع التلفزيون: تم تثبيت مواقع الحروف لتسهيل اللعب بالريموت.'
                  : 'وضع الهاتف: تم تفعيل خلط وتغيير أماكن الحروف عند الإعادة لتحدٍ جديد.'}
              </span>
              <span className="text-base">{tvMode ? '📺' : '💡'}</span>
            </div>

            {/* =============================================================== */}
            {/* ACTION BUTTON 2: CYAN SECONDARY (+60 SECONDS EXTENSION)         */}
            {/* =============================================================== */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                const extendCount = user?.powerUps?.TIME_EXTEND || 0;
                if (extendCount > 0 && user && onUpdateUser) {
                  const updated = saveUserToLocalMap({
                    ...user,
                    powerUps: {
                      ...(user.powerUps || {}),
                      TIME_EXTEND: Math.max(0, extendCount - 1)
                    }
                  });
                  onUpdateUser(updated);
                  syncProfileWithSupabase(updated);
                }
                setSeconds(s => Math.max(0, s - 60));
                setIsTimedOut(false);
              }}
              className="w-full py-3 sm:py-3.5 px-5 sm:px-6 rounded-full flex items-center justify-center gap-2.5 border-2 border-cyan-400 shadow-[0_0_22px_rgba(56,189,248,0.4)] hover:shadow-[0_0_30px_rgba(56,189,248,0.6)] cursor-pointer transition-transform active:scale-98 text-white font-black text-sm sm:text-base mb-3"
              style={{
                background: 'linear-gradient(180deg, #053b59 0%, #032133 100%)'
              }}
            >
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-cyan-500/25 border border-cyan-400 flex items-center justify-center text-cyan-300">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-300" />
              </div>
              <span>
                {(user?.powerUps?.TIME_EXTEND || 0) > 0
                  ? `⏳ استخدام تذكرة تمديد (+60ث) • لديك ×${user?.powerUps?.TIME_EXTEND}`
                  : 'تمديد دقيقة إضافية (+60 ثانية) للمواصلة'}
              </span>
            </button>

            {/* =============================================================== */}
            {/* ACTION 3: RETURN TO STAGES LIST LINK                            */}
            {/* =============================================================== */}
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onExit();
              }}
              className="text-slate-300 hover:text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 mx-auto pt-1 transition-colors cursor-pointer group"
            >
              <RotateCcw className="w-4 h-4 text-slate-400 group-hover:text-cyan-300 -scale-x-100 transition-colors" />
              <span>العودة لقائمة المراحل</span>
            </button>
          </div>
        </div>
      )}

      {/* Daily Challenges Modal */}
      <DailyChallengesModal
        isOpen={showDailyModal}
        onClose={() => setShowDailyModal(false)}
        dateKey={user?.dailyChallenges?.dateKey}
        tasks={activeChallenges}
        onClaimTask={handleClaimDailyTask}
        onStartTask={() => setShowDailyModal(false)}
        onOpenProfile={() => {
          setShowDailyModal(false);
          onNavigate?.('PROFILE');
        }}
      />

      {/* Android TV Remote Navigation Bar */}
      {tvMode && <TVRemoteHint />}
    </div>
  );
};
