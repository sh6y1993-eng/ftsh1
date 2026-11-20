import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  CATEGORIES,
  PREMIUM_CATEGORIES,
  getLevelConfig,
  getRandomCategoryWords,
  getOnlineDifficultyConfig,
  normalizeOnlineDifficulty,
  HINT_DEFINITIONS,
  ACHIEVEMENTS
} from './src/engine/gameCategories.ts';
import { generateWordSearchGrid, normalizeArabicWord } from './src/engine/wordSearch.ts';
import {
  type ActiveStageSession,
  buildUnifiedDailyPayloadForUser,
  computeServerHintEffect,
  evaluateServerUserAchievements,
  executeServerStoreAction,
  resolveServerHintDefinition,
  sanitizeWordPlacementsForClient,
  SERVER_MISSION_REWARDS,
  type ServerUnifiedDailyAttemptRecord,
  STREAK_MILESTONE_REWARDS,
  verifyWordOnServerBoard
} from './src/engine/serverAuthoritativeEngine.ts';
import {
  calculateDailyChallengeScore,
  generateDeterministicDailyBoard,
  getKuwaitDateKey,
  getKuwaitOffsetDateKey,
  getKuwaitWeekKey,
  SEASONAL_CHALLENGE_EVENTS,
  UNIFIED_DAILY_DURATION_SECONDS,
  UNIFIED_DAILY_WORD_COUNT
} from './src/engine/dailyChallengeEngine.ts';
import {
  acquireAtomicLock,
  releaseAtomicLock,
  createAuthToken,
  verifyAuthToken,
  extractTokenFromRequest,
  requireVerifiedRequestUser as verifyRequestTokenUser,
  hashPasswordScrypt,
  isScryptHash,
  verifyAndUpgradePassword,
  sanitizeUserForClient,
  createSignedRecoveryCode,
  verifySignedRecoveryCode,
  signRealtimeEvent,
  verifyRealtimeEventSignature,
  verifyAdminSecretCandidate,
  createAdminSessionToken,
  verifyAdminSessionToken,
  extractAdminTokenFromRequest
} from './src/engine/serverSecurity.ts';
import {
  checkTextModeration,
  isAllowedQuickReaction,
  REPORT_REASONS
} from './src/engine/moderation.ts';
import { verifyAppleIdentityToken } from './src/engine/appleAuthVerifier.ts';
import {
  atomicWriteJsonFile,
  createRollingBackupIfExists,
  createFreshDefaultDatabaseState as createDefaultPersistenceState,
  loadDatabaseState,
  startPeriodicBackupSchedule,
  saveDatabaseStateWithRollback,
  DatabasePersistenceError
} from './src/engine/databasePersistence.ts';
import type {
  HintType,
  OnlineDifficulty,
  PlayerReport,
  ReportReason,
  ReportStatus,
  UnifiedDailyStreakData
} from './src/types/game.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data folder exists for persistence
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_FILE = path.join(DATA_DIR, process.env.FATTESHHA_DB_FILE || 'database.json');
const TEST_DB_FILE = path.join(DATA_DIR, 'test-database.json');

interface ServerDailyChallengeTask {
  id: string;
  type:
    | 'FIND_WORDS_IN_TIME'
    | 'COMPLETE_LEVELS'
    | 'EARN_THREE_STARS'
    | 'HIGH_ACCURACY'
    | 'FIND_TOTAL_WORDS'
    | 'NO_HINTS_STAGE'
    | 'CATEGORY_KUWAIT'
    | 'SPEED_45S'
    | 'PERFECT_ACCURACY';
  title: string;
  description: string;
  current: number;
  target: number;
  timeLimitSeconds?: number;
  rewardCoins: number;
  rewardXP: number;
  completed: boolean;
  claimed: boolean;
  manualClaimed?: boolean;
}

interface ServerDailyChallengesState {
  dateKey: string;
  tasks: ServerDailyChallengeTask[];
}

interface ServerDailyStreakState {
  currentStreak: number;
  longestStreak: number;
  lastCompletedDate: string | null;
  lastLoginDate: string;
  completedToday: boolean;
  todayBonusCoins: number;
  nextBonusCoins: number;
  streakHistory: string[];
  lastDailyClaimDate?: string;
  lastWeeklyClaimDate?: string;
}

interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  passwordHash: string;
  avatar: string;
  level: number;
  xp: number;
  coins: number;
  hintsRemaining: number;
  completedLevels: Record<string, { stars: number; bestTime: number; score: number; accuracy?: number; completedAt?: string }>;
  completedLevelsCount?: number;
  totalScore?: number;
  totalWordsFound?: number;
  perfectStagesCount?: number;
  fastStagesCount?: number;
  selectedTitle?: string;
  unlockedTitles?: string[];
  selectedCosmetic?: string;
  unlockedCosmetics?: string[];
  powerUps?: Record<string, number>;
  battleCards?: Record<string, number>;
  unlockedBoardThemes?: string[];
  equippedBoardTheme?: string;
  unlockedTrails?: string[];
  equippedTrail?: string;
  unlockedNameGlows?: string[];
  equippedNameGlow?: string;
  unlockedEmotePacks?: string[];
  unlockedCategories?: string[];
  unlockedAvatars?: string[];
  unlockedOnlineModes?: string[];
  isVip?: boolean;
  seasonXp?: number;
  claimedSeasonTiers?: number[];
  starterPackPurchased?: boolean;
  granted20kFreeCoins?: boolean;
  claimedSessionIds?: string[];
  processedRequestIds?: string[];
  activeRecoveryNonce?: string;
  usedRecoveryNonces?: string[];
  dailyChallenges?: ServerDailyChallengesState;
  dailyStreak?: ServerDailyStreakState;
  friends?: string[];
  blockedUsers?: string[];
  multiplayerWins: number;
  multiplayerLosses: number;
  achievements: string[];
  createdAt: string;
}

interface ServerRoomInvite {
  id: string;
  fromUsername: string;
  fromDisplayName: string;
  fromAvatar: string;
  toUsername: string;
  roomCode: string;
  roomName: string;
  categoryId: string;
  stagesCount: number;
  createdAt: number;
}

interface AdminAuditLogEntry {
  id: string;
  action: string;
  reportId?: string;
  targetUsername?: string;
  note?: string;
  at?: string;
  createdAt: number;
}

interface DatabaseState {
  users: Record<string, UserRecord>;
  localProfiles: Record<string, { id: string; name: string; avatar: string; color: string }>;
  leaderboard: { username: string; displayName: string; avatar: string; xp: number; wins: number; stars: number }[];
  unifiedDailyAttempts?: Record<string, ServerUnifiedDailyAttemptRecord>;
  unifiedDailyStreaks?: Record<string, UnifiedDailyStreakData>;
  deletedUsernames?: string[];
  reports?: PlayerReport[];
  adminAuditLog?: AdminAuditLogEntry[];
}

const DAILY_CHALLENGE_TEMPLATES: Omit<ServerDailyChallengeTask, 'current' | 'completed' | 'claimed'>[] = [
  {
    id: 'dc_find_5_in_3m',
    type: 'FIND_WORDS_IN_TIME',
    title: 'صَيْد الكلمات السريع',
    description: 'اختر 5 كلمات في أقل من 3 دقائق',
    target: 5,
    timeLimitSeconds: 180,
    rewardCoins: 150,
    rewardXP: 120
  },
  {
    id: 'dc_speed_45s',
    type: 'SPEED_45S',
    title: 'سرعة البرق',
    description: 'أكمل مرحلة في أقل من 45 ثانية',
    target: 1,
    timeLimitSeconds: 45,
    rewardCoins: 250,
    rewardXP: 200
  },
  {
    id: 'dc_no_hints',
    type: 'NO_HINTS_STAGE',
    title: 'اعتمد على ذاتك',
    description: 'أكمل مرحلة كاملة بدون استخدام أي تلميح',
    target: 1,
    rewardCoins: 175,
    rewardXP: 140
  },
  {
    id: 'dc_complete_2_levels',
    type: 'COMPLETE_LEVELS',
    title: 'مثابرة الأبطال',
    description: 'أكمل مرحلتين بنجاح اليوم',
    target: 2,
    rewardCoins: 180,
    rewardXP: 150
  },
  {
    id: 'dc_three_stars_1',
    type: 'EARN_THREE_STARS',
    title: 'العلامة الكاملة',
    description: 'احصل على 3 نجوم في مرحلة واحدة (أقل من 60 ثانية)',
    target: 1,
    rewardCoins: 200,
    rewardXP: 160
  },
  {
    id: 'dc_accuracy_90',
    type: 'HIGH_ACCURACY',
    title: 'نظرة صقر',
    description: 'أنهِ مرحلة بدقة تحديد 90% أو أعلى',
    target: 1,
    rewardCoins: 160,
    rewardXP: 130
  },
  {
    id: 'dc_find_10_words',
    type: 'FIND_TOTAL_WORDS',
    title: 'فتّاش الشبكة',
    description: 'اكتشف 10 كلمات مخفية في المراحل اليوم',
    target: 10,
    rewardCoins: 220,
    rewardXP: 180
  },
  {
    id: 'dc_kuwait_stage',
    type: 'CATEGORY_KUWAIT',
    title: 'فتّاش الديرة',
    description: 'أكمل مرحلة في تصنيف الكويت',
    target: 1,
    rewardCoins: 165,
    rewardXP: 135
  },
  {
    id: 'dc_perfect_100',
    type: 'PERFECT_ACCURACY',
    title: 'بلا أخطاء',
    description: 'أنهِ مرحلة بدقة 100% دون أي محاولة خاطئة',
    target: 1,
    rewardCoins: 230,
    rewardXP: 190
  }
];

function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getOffsetDateKey(daysOffset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

function calculateStreakBonusCoins(streakCount: number): number {
  const clamped = Math.max(1, Math.min(streakCount, 14));
  return 50 + clamped * 20; // Day 1: 70, Day 2: 90, Day 3: 110, Day 4: 130...
}

function ensureUserDailyStreak(user: UserRecord): ServerDailyStreakState {
  const today = getTodayDateKey();
  const yesterday = getOffsetDateKey(-1);

  if (!user.dailyStreak) {
    // Check if user has any completed levels today or earlier
    const hasCompletedLevels = Object.keys(user.completedLevels || {}).length > 0;
    const initialStreak = hasCompletedLevels ? 2 : 1;
    const initialHistory = hasCompletedLevels
      ? [getOffsetDateKey(-2), yesterday]
      : [yesterday];

    user.dailyStreak = {
      currentStreak: initialStreak,
      longestStreak: Math.max(initialStreak, 2),
      lastCompletedDate: yesterday,
      lastLoginDate: today,
      completedToday: false,
      todayBonusCoins: 0,
      nextBonusCoins: calculateStreakBonusCoins(initialStreak + 1),
      streakHistory: initialHistory
    };
    return user.dailyStreak;
  }

  const streak = user.dailyStreak;
  streak.lastLoginDate = today;

  if (streak.lastCompletedDate === today) {
    streak.completedToday = true;
    streak.nextBonusCoins = calculateStreakBonusCoins(streak.currentStreak + 1);
  } else if (streak.lastCompletedDate === yesterday) {
    streak.completedToday = false;
    streak.nextBonusCoins = calculateStreakBonusCoins(streak.currentStreak + 1);
  } else {
    // Missed one or more consecutive days -> reset current streak to 0 until a level is completed today
    streak.currentStreak = 0;
    streak.completedToday = false;
    streak.todayBonusCoins = 0;
    streak.nextBonusCoins = calculateStreakBonusCoins(1);
  }

  if (!Array.isArray(streak.streakHistory)) {
    streak.streakHistory = streak.lastCompletedDate ? [streak.lastCompletedDate] : [];
  }

  return streak;
}

function generateThreeRandomTasks(seedUsername: string, randomizeSalt?: number): ServerDailyChallengeTask[] {
  const today = getTodayDateKey();
  const pool = [...DAILY_CHALLENGE_TEMPLATES];
  const chosen: ServerDailyChallengeTask[] = [];

  if (randomizeSalt === undefined) {
    // Always include "Find 5 words in 3 minutes" on initial daily generation, plus 2 deterministic-random tasks per user/day
    const first = pool.splice(0, 1)[0];
    chosen.push({ ...first, current: 0, completed: false, claimed: false });

    let hash = 0;
    const str = `${today}_${seedUsername}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }

    for (let i = 0; i < 2 && pool.length > 0; i++) {
      const idx = (hash + i * 7) % pool.length;
      const picked = pool.splice(idx, 1)[0];
      chosen.push({ ...picked, current: 0, completed: false, claimed: false });
    }
  } else {
    // Pure random shuffle of 3 distinct tasks when user clicks reroll
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (let i = 0; i < 3; i++) {
      chosen.push({ ...pool[i], current: 0, completed: false, claimed: false });
    }
  }

  return chosen;
}

function ensureUserDailyChallenges(user: UserRecord, forceReroll = false): ServerDailyChallengesState {
  ensureUserDailyStreak(user);
  const today = getTodayDateKey();
  if (!forceReroll && user.dailyChallenges && user.dailyChallenges.dateKey === today && Array.isArray(user.dailyChallenges.tasks) && user.dailyChallenges.tasks.length === 3) {
    user.dailyChallenges.tasks.forEach((t, idx) => {
      if (t.completed && t.claimed && idx > 0 && t.manualClaimed === undefined) {
        t.claimed = false;
        t.manualClaimed = false;
      }
    });
    return user.dailyChallenges;
  }

  user.dailyChallenges = {
    dateKey: today,
    tasks: generateThreeRandomTasks(user.username, forceReroll ? Date.now() : undefined)
  };
  return user.dailyChallenges;
}

const DEFAULT_FREE_ACCOUNT_COINS = 20000;

function ensureUserFields(user: UserRecord): UserRecord {
  if (!user.granted20kFreeCoins) {
    user.coins = Math.max(user.coins || 0, DEFAULT_FREE_ACCOUNT_COINS);
    user.granted20kFreeCoins = true;
  }
  if (!user.completedLevels) user.completedLevels = {};
  const completedEntries = Object.values(user.completedLevels);
  user.completedLevelsCount = completedEntries.length;
  user.totalScore = Math.max(
    user.totalScore || 0,
    completedEntries.reduce((acc, l) => acc + (l.score || 0), 0)
  );
  user.totalWordsFound = Math.max(user.totalWordsFound || 0, completedEntries.length * 6);
  user.perfectStagesCount = Math.max(
    user.perfectStagesCount || 0,
    completedEntries.filter(l => (l.accuracy ?? 100) >= 100).length
  );
  user.fastStagesCount = Math.max(
    user.fastStagesCount || 0,
    completedEntries.filter(l => l.bestTime > 0 && l.bestTime < 60).length
  );
  if (!Array.isArray(user.unlockedTitles) || user.unlockedTitles.length === 0) {
    user.unlockedTitles = ['مستكشف الحروف'];
  }
  if (!user.selectedTitle) {
    user.selectedTitle = user.unlockedTitles[0] || 'مستكشف الحروف';
  }
  if (!Array.isArray(user.unlockedCosmetics)) user.unlockedCosmetics = [];
  if (!user.powerUps) {
    user.powerUps = { FREEZE_TIME: 1, DOUBLE_BOOST: 1, STREAK_SHIELD: 0, TIME_EXTEND: 1 };
  }
  if (!user.battleCards) {
    user.battleCards = {
      CARD_FREEZE_OPPONENT: 2,
      CARD_SANDSTORM: 1,
      CARD_BLIND_WORDS: 1,
      CARD_STEAL_POINTS: 1,
      CARD_SHIELD: 2
    };
  }
  if (!Array.isArray(user.unlockedBoardThemes) || user.unlockedBoardThemes.length === 0) {
    user.unlockedBoardThemes = ['theme_kuwait_neon'];
  }
  if (!user.equippedBoardTheme) user.equippedBoardTheme = 'theme_kuwait_neon';
  if (!Array.isArray(user.unlockedTrails) || user.unlockedTrails.length === 0) {
    user.unlockedTrails = ['trail_amber'];
  }
  if (!user.equippedTrail) user.equippedTrail = 'trail_amber';
  if (!Array.isArray(user.unlockedNameGlows) || user.unlockedNameGlows.length === 0) {
    user.unlockedNameGlows = ['glow_none'];
  }
  if (!user.equippedNameGlow) user.equippedNameGlow = 'glow_none';
  if (!Array.isArray(user.unlockedEmotePacks)) user.unlockedEmotePacks = [];
  if (!Array.isArray(user.unlockedCategories)) user.unlockedCategories = [];
  if (!Array.isArray(user.unlockedAvatars)) user.unlockedAvatars = [];
  if (!Array.isArray(user.unlockedOnlineModes)) user.unlockedOnlineModes = [];
  if (!user.unlockedOnlineModes.includes('SPEED_REVEAL_20S')) {
    user.unlockedOnlineModes.push('SPEED_REVEAL_20S');
  }
  if (typeof user.isVip !== 'boolean') user.isVip = false;
  if (typeof user.seasonXp !== 'number') user.seasonXp = user.xp || 0;
  if (!Array.isArray(user.claimedSeasonTiers)) user.claimedSeasonTiers = [];
  if (typeof user.starterPackPurchased !== 'boolean') user.starterPackPurchased = false;
  if (!Array.isArray(user.claimedSessionIds)) user.claimedSessionIds = [];
  if (!Array.isArray(user.processedRequestIds)) user.processedRequestIds = [];
  if (!Array.isArray(user.usedRecoveryNonces)) user.usedRecoveryNonces = [];
  if (!Array.isArray(user.friends)) user.friends = [];
  if (!Array.isArray(user.blockedUsers)) user.blockedUsers = [];
  if (!Array.isArray(user.achievements)) user.achievements = [];
  ensureUserDailyChallenges(user);
  return user;
}

function checkAndRecordRequestId(user: UserRecord, requestId?: string): boolean {
  if (!requestId || typeof requestId !== 'string') return false;
  if (!Array.isArray(user.processedRequestIds)) {
    user.processedRequestIds = [];
  }
  if (user.processedRequestIds.includes(requestId)) {
    return true; // Already processed!
  }
  user.processedRequestIds.push(requestId);
  if (user.processedRequestIds.length > 300) {
    user.processedRequestIds = user.processedRequestIds.slice(-300);
  }
  return false;
}

function syncLeaderboard(state: DatabaseState) {
  const entries = Object.values(state.users).map(u => {
    const totalStars = Object.values(u.completedLevels || {}).reduce((acc, l) => acc + (l.stars || 0), 0);
    return {
      username: u.username,
      displayName: u.displayName,
      avatar: u.avatar,
      xp: u.xp,
      wins: u.multiplayerWins,
      stars: totalStars
    };
  });
  entries.sort((a, b) => b.stars - a.stars || b.xp - a.xp);
  state.leaderboard = entries;
}

function ensureSeedUsers(state: DatabaseState) {
  const nowIso = new Date().toISOString();
  const seedAccounts: Record<string, Omit<UserRecord, 'dailyChallenges' | 'dailyStreak'>> = {
    ahmad_kwt: {
      id: 'usr_ahmad_kwt',
      username: 'ahmad_kwt',
      displayName: 'أحمد الكندري',
      passwordHash: '123456',
      avatar: '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
      level: 3,
      xp: 650,
      coins: 320,
      hintsRemaining: 5,
      completedLevels: {},
      friends: ['dana_q8', 'fahad_q8'],
      multiplayerWins: 4,
      multiplayerLosses: 1,
      achievements: ['first_level', 'online_warrior'],
      createdAt: nowIso
    },
    dana_q8: {
      id: 'usr_dana_q8',
      username: 'dana_q8',
      displayName: 'دانة المبارك',
      passwordHash: '123456',
      avatar: '/assets/images/avatar_kuwaiti_girl_1794404783186.jpg',
      level: 2,
      xp: 420,
      coins: 210,
      hintsRemaining: 5,
      completedLevels: {},
      friends: ['ahmad_kwt', 'sara_kwt'],
      multiplayerWins: 2,
      multiplayerLosses: 1,
      achievements: ['first_level'],
      createdAt: nowIso
    },
    fahad_q8: {
      id: 'usr_fahad_q8',
      username: 'fahad_q8',
      displayName: 'فهد الرشيدي',
      passwordHash: '123456',
      avatar: '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
      level: 4,
      xp: 980,
      coins: 450,
      hintsRemaining: 6,
      completedLevels: {},
      friends: ['ahmad_kwt'],
      multiplayerWins: 6,
      multiplayerLosses: 2,
      achievements: ['first_level', 'online_champion'],
      createdAt: nowIso
    },
    sara_kwt: {
      id: 'usr_sara_kwt',
      username: 'sara_kwt',
      displayName: 'سارة الدوسري',
      passwordHash: '123456',
      avatar: '/assets/images/avatar_kuwaiti_girl_1794404783186.jpg',
      level: 2,
      xp: 510,
      coins: 280,
      hintsRemaining: 5,
      completedLevels: {},
      friends: ['dana_q8'],
      multiplayerWins: 3,
      multiplayerLosses: 1,
      achievements: ['first_level'],
      createdAt: nowIso
    },
    jasem_q8: {
      id: 'usr_jasem_q8',
      username: 'jasem_q8',
      displayName: 'جاسم المطيري',
      passwordHash: '123456',
      avatar: '/assets/images/login_kuwaiti_mascot_1794483388654.jpg',
      level: 3,
      xp: 740,
      coins: 360,
      hintsRemaining: 5,
      completedLevels: {},
      friends: [],
      multiplayerWins: 5,
      multiplayerLosses: 2,
      achievements: ['first_level'],
      createdAt: nowIso
    }
  };

  if (!state.users) {
    state.users = {};
  }
  if (!Array.isArray(state.deletedUsernames)) {
    state.deletedUsernames = [];
  }
  if (!Array.isArray(state.reports)) {
    state.reports = [];
  }
  if (!Array.isArray(state.adminAuditLog)) {
    state.adminAuditLog = [];
  }
  const deletedSet = new Set(state.deletedUsernames.map(u => normalizeUsername(u)));

  Object.entries(seedAccounts).forEach(([uname, seed]) => {
    if (deletedSet.has(normalizeUsername(uname))) return;
    if (!state.users[uname]) {
      state.users[uname] = {
        ...seed,
        passwordHash: hashPasswordScrypt(seed.passwordHash || '123456')
      };
    } else if (!Array.isArray(state.users[uname].friends)) {
      state.users[uname].friends = seed.friends || [];
    }
  });

  // Clean up any leftover automated test accounts from production database while preserving all real accounts
  Object.keys(state.users).forEach(uname => {
    if (uname.startsWith('audit_p1_') || uname.startsWith('audit_p2_') || uname.startsWith('test_iso_')) {
      delete state.users[uname];
    }
  });

  // Migrate any legacy plain-text passwords to scrypt with salt automatically
  Object.values(state.users).forEach(u => {
    if (
      u.passwordHash &&
      !isScryptHash(u.passwordHash) &&
      u.passwordHash !== 'guest' &&
      u.passwordHash !== 'synced' &&
      u.passwordHash !== 'synced_account'
    ) {
      u.passwordHash = hashPasswordScrypt(u.passwordHash);
    }
    ensureUserFields(u);
  });

  // Clean up any synthetic daily challenge attempts from production DB
  if (state.unifiedDailyAttempts) {
    const legacySeedUsernames = new Set(['fahad_q8', 'dana_q8', 'jasem_q8', 'sara_kwt']);
    const legacySeedElapsed = new Set([42, 54, 63, 90]);
    for (const [k, rec] of Object.entries(state.unifiedDailyAttempts)) {
      if (
        rec.username.startsWith('audit_p') ||
        rec.username.startsWith('test_iso_') ||
        (legacySeedUsernames.has(rec.username) && legacySeedElapsed.has(rec.elapsedSeconds) && !(rec as any).isGenuineAttempt)
      ) {
        delete state.unifiedDailyAttempts[k];
      }
    }
  }
  if (state.unifiedDailyStreaks) {
    for (const k of Object.keys(state.unifiedDailyStreaks)) {
      if (k.startsWith('audit_p') || k.startsWith('test_iso_')) {
        delete state.unifiedDailyStreaks[k];
      }
    }
  }
}

function createFreshDefaultDatabaseState(): DatabaseState {
  const defaultState = createDefaultPersistenceState() as DatabaseState;
  ensureSeedUsers(defaultState);
  syncLeaderboard(defaultState);
  return defaultState;
}

function loadDatabase(targetFile = DB_FILE): DatabaseState {
  const isTest = targetFile === TEST_DB_FILE;
  return loadDatabaseState(targetFile, {
    testDbFile: TEST_DB_FILE,
    isTestIsolation: isTest,
    onStateLoaded: (state) => {
      ensureSeedUsers(state as DatabaseState);
      syncLeaderboard(state as DatabaseState);
    }
  }) as DatabaseState;
}

function normalizeServerSupabaseUrl(raw?: string): string {
  if (!raw) return '';
  let trimmed = raw.trim().replace(/^['"]|['"]$/g, '');
  const mdMatch = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (mdMatch) {
    trimmed = (mdMatch[2] || mdMatch[1]).trim();
  }
  const urlMatch = trimmed.match(/https?:\/\/[^\s)\]"']+/i);
  if (urlMatch) {
    trimmed = urlMatch[0].replace(/\/+$/, '');
  }
  return /^https?:\/\/[^/\s]+\.[^/\s]+/i.test(trimmed) ? trimmed : '';
}

const SERVER_SUPABASE_URL = normalizeServerSupabaseUrl(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
);
const SERVER_SUPABASE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ''
).trim();

function isRealCloudSyncUser(username: string): boolean {
  const clean = (username || '').toLowerCase();
  if (!clean) return false;
  if (
    clean.startsWith('guest_') ||
    clean.startsWith('sec_user_') ||
    clean.startsWith('audit_p') ||
    clean.startsWith('test_iso_') ||
    clean.startsWith('room_cache_')
  ) {
    return false;
  }
  return true;
}

async function syncProductionUserToSupabase(user: UserRecord): Promise<void> {
  if (!SERVER_SUPABASE_URL || !SERVER_SUPABASE_KEY) return;
  if (!isRealCloudSyncUser(user.username)) return;

  try {
    let mergedCompletedLevels = mergeCompletedLevelsRecord(user.completedLevels, null);
    let mergedXp = user.xp || 0;
    let mergedLevel = Math.max(user.level || 1, Math.floor(mergedXp / 300) + 1);
    let mergedWins = user.multiplayerWins || 0;
    let mergedLosses = user.multiplayerLosses || 0;
    let mergedAchievements = Array.isArray(user.achievements) ? [...user.achievements] : [];

    // Guard against overwriting higher cloud progress if this instance didn't have it yet
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 1800) : null;
      try {
        const existingRes = await fetch(
          `${SERVER_SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(user.username)}&select=level,xp,completed_levels,multiplayer_wins,multiplayer_losses,achievements&limit=1`,
          {
            headers: {
              apikey: SERVER_SUPABASE_KEY,
              Authorization: `Bearer ${SERVER_SUPABASE_KEY}`
            },
            ...(controller ? { signal: controller.signal } : {})
          }
        );
        if (existingRes.ok) {
          const rows = (await existingRes.json()) as any[];
          const cloudRow = Array.isArray(rows) ? rows[0] : null;
          if (cloudRow) {
            mergedCompletedLevels = mergeCompletedLevelsRecord(mergedCompletedLevels, cloudRow.completed_levels);
            mergedXp = Math.max(mergedXp, Number(cloudRow.xp) || 0);
            mergedLevel = Math.max(mergedLevel, Number(cloudRow.level) || 1, Math.floor(mergedXp / 300) + 1);
            mergedWins = Math.max(mergedWins, Number(cloudRow.multiplayer_wins) || 0);
            mergedLosses = Math.max(mergedLosses, Number(cloudRow.multiplayer_losses) || 0);
            if (Array.isArray(cloudRow.achievements)) {
              mergedAchievements = Array.from(new Set([...mergedAchievements, ...cloudRow.achievements]));
            }
          }
        }
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch {
      // Proceed with local record if pre-fetch fails
    }

    const payload: Record<string, unknown> = {
      id: user.id,
      username: user.username,
      display_name: user.displayName,
      avatar: user.avatar,
      level: mergedLevel,
      xp: mergedXp,
      coins: user.coins ?? 150,
      hints_remaining: user.hintsRemaining ?? 5,
      completed_levels: mergedCompletedLevels,
      multiplayer_wins: mergedWins,
      multiplayer_losses: mergedLosses,
      achievements: mergedAchievements,
      updated_at: new Date().toISOString()
    };
    if (user.email) {
      payload.email = user.email;
    }
    if (user.passwordHash) {
      payload.password_hash = user.passwordHash;
    }

    await fetch(`${SERVER_SUPABASE_URL}/rest/v1/profiles?on_conflict=username`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVER_SUPABASE_KEY,
        Authorization: `Bearer ${SERVER_SUPABASE_KEY}`,
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload)
    });
  } catch {
    // Non-blocking cloud sync fallback
  }
}

let prodDb = loadDatabase(DB_FILE);
let testDb = createFreshDefaultDatabaseState();
let activeDbFile = DB_FILE;
let db = prodDb;

const SERVER_SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

async function deleteProductionUserFromSupabase(username: string): Promise<{ attempted: boolean; deleted: boolean }> {
  const clean = normalizeUsername(username);
  if (!SERVER_SUPABASE_URL || !SERVER_SUPABASE_SERVICE_KEY || !clean) {
    return { attempted: false, deleted: false };
  }
  try {
    const res = await fetch(`${SERVER_SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(clean)}`, {
      method: 'DELETE',
      headers: {
        apikey: SERVER_SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SERVER_SUPABASE_SERVICE_KEY}`,
        Prefer: 'return=minimal'
      }
    });
    return { attempted: true, deleted: res.ok };
  } catch {
    return { attempted: true, deleted: false };
  }
}

function mergeCompletedLevelsRecord(
  a?: Record<string, { stars: number; bestTime: number; score: number; accuracy?: number; completedAt?: string }> | null,
  b?: Record<string, { stars: number; bestTime: number; score: number; accuracy?: number; completedAt?: string }> | null
): Record<string, { stars: number; bestTime: number; score: number; accuracy?: number; completedAt?: string }> {
  const merged: Record<string, { stars: number; bestTime: number; score: number; accuracy?: number; completedAt?: string }> = {};
  const addSrc = (src: any) => {
    if (!src || typeof src !== 'object') return;
    for (const [k, rec] of Object.entries<any>(src)) {
      if (!rec || typeof rec !== 'object') continue;
      const existing = merged[k];
      const nextStars = Math.max(0, Number(rec.stars) || 0);
      const nextTime = Number(rec.bestTime) > 0 ? Number(rec.bestTime) : 9999;
      const nextScore = Math.max(0, Number(rec.score) || 0);
      const nextAcc = Math.max(0, Number(rec.accuracy) || 0);
      if (!existing) {
        merged[k] = {
          stars: nextStars,
          bestTime: nextTime,
          score: nextScore,
          ...(nextAcc > 0 ? { accuracy: nextAcc } : {}),
          ...(rec.completedAt ? { completedAt: rec.completedAt } : {})
        };
      } else {
        const bestAcc = Math.max(Number(existing.accuracy) || 0, nextAcc);
        merged[k] = {
          stars: Math.max(existing.stars, nextStars),
          bestTime: Math.min(existing.bestTime > 0 ? existing.bestTime : 9999, nextTime),
          score: Math.max(existing.score, nextScore),
          ...(bestAcc > 0 ? { accuracy: bestAcc } : {}),
          completedAt: existing.completedAt || rec.completedAt
        };
      }
    }
  };
  addSrc(a);
  addSrc(b);
  return merged;
}

function hydrateStateWithSupabaseRows(targetState: DatabaseState, rows: any[]): boolean {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const deletedSet = new Set((targetState.deletedUsernames || []).map(u => normalizeUsername(u)));
  let changed = false;
  for (const row of rows) {
    if (!row?.username || !isRealCloudSyncUser(row.username)) continue;
    const clean = normalizeUsername(row.username);
    if (deletedSet.has(clean)) continue;
    const existing = targetState.users[clean];
    if (!existing) {
      targetState.users[clean] = ensureUserFields({
        id: row.id || `usr_${clean}`,
        username: clean,
        displayName: row.display_name || clean,
        ...(row.email ? { email: String(row.email).toLowerCase() } : {}),
        passwordHash: row.password_hash || hashPasswordScrypt(`cloud_${clean}`),
        avatar: row.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
        level: Number(row.level) || 1,
        xp: Number(row.xp) || 0,
        coins: typeof row.coins === 'number' ? row.coins : 150,
        hintsRemaining: typeof row.hints_remaining === 'number' ? row.hints_remaining : 5,
        completedLevels: mergeCompletedLevelsRecord(row.completed_levels, null),
        multiplayerWins: Number(row.multiplayer_wins) || 0,
        multiplayerLosses: Number(row.multiplayer_losses) || 0,
        achievements: Array.isArray(row.achievements) ? row.achievements : [],
        createdAt: row.created_at || new Date().toISOString()
      });
      changed = true;
    } else {
      if (row.password_hash && !existing.passwordHash) {
        existing.passwordHash = row.password_hash;
        changed = true;
      }
      if (row.email && !existing.email) {
        existing.email = String(row.email).toLowerCase();
        changed = true;
      }
      const prevCount = Object.keys(existing.completedLevels || {}).length;
      const mergedLevels = mergeCompletedLevelsRecord(existing.completedLevels, row.completed_levels);
      const nextCount = Object.keys(mergedLevels).length;
      const cloudXp = Number(row.xp) || 0;
      const cloudLevel = Number(row.level) || 1;
      const cloudWins = Number(row.multiplayer_wins) || 0;
      const cloudLosses = Number(row.multiplayer_losses) || 0;
      const cloudAchievements = Array.isArray(row.achievements) ? row.achievements : [];

      if (
        nextCount > prevCount ||
        cloudXp > (existing.xp || 0) ||
        cloudLevel > (existing.level || 1) ||
        cloudWins > (existing.multiplayerWins || 0) ||
        cloudLosses > (existing.multiplayerLosses || 0) ||
        cloudAchievements.some((a: string) => !(existing.achievements || []).includes(a))
      ) {
        existing.completedLevels = mergedLevels;
        existing.xp = Math.max(existing.xp || 0, cloudXp);
        existing.level = Math.max(existing.level || 1, cloudLevel, Math.floor(existing.xp / 300) + 1);
        existing.multiplayerWins = Math.max(existing.multiplayerWins || 0, cloudWins);
        existing.multiplayerLosses = Math.max(existing.multiplayerLosses || 0, cloudLosses);
        existing.achievements = Array.from(new Set([...(existing.achievements || []), ...cloudAchievements]));
        existing.completedLevelsCount = Object.keys(mergedLevels).length;
        existing.totalScore = Object.values(mergedLevels).reduce((acc, l) => acc + (l.score || 0), 0);
        ensureUserFields(existing);
        changed = true;
      }
    }
  }
  return changed;
}

async function hydrateSingleProductionUserFromSupabase(usernameOrEmail: string): Promise<UserRecord | null> {
  if (!SERVER_SUPABASE_URL || !SERVER_SUPABASE_KEY) return null;
  const raw = String(usernameOrEmail || '').trim().toLowerCase();
  if (!raw) return null;
  const clean = normalizeUsername(raw);
  if (!isRealCloudSyncUser(clean)) return null;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 2200) : null;
  try {
    const filterQuery = raw.includes('@')
      ? `email=eq.${encodeURIComponent(raw)}`
      : `username=eq.${encodeURIComponent(clean)}`;
    const sbRes = await fetch(`${SERVER_SUPABASE_URL}/rest/v1/profiles?${filterQuery}&select=*&limit=1`, {
      headers: {
        apikey: SERVER_SUPABASE_KEY,
        Authorization: `Bearer ${SERVER_SUPABASE_KEY}`
      },
      ...(controller ? { signal: controller.signal } : {})
    });
    if (!sbRes.ok) return null;
    const rows = (await sbRes.json()) as any[];
    if (Array.isArray(rows) && rows.length > 0) {
      hydrateStateWithSupabaseRows(prodDb, rows);
      const resolvedKey = normalizeUsername(rows[0].username || clean);
      return prodDb.users[resolvedKey] || null;
    }
  } catch {
    // Non-blocking cloud lookup
  } finally {
    if (timer) clearTimeout(timer);
  }
  return null;
}

async function hydrateProductionUsersFromSupabase(): Promise<void> {
  if (!SERVER_SUPABASE_URL || !SERVER_SUPABASE_KEY) return;
  try {
    const res = await fetch(`${SERVER_SUPABASE_URL}/rest/v1/profiles?select=*&limit=500`, {
      headers: {
        apikey: SERVER_SUPABASE_KEY,
        Authorization: `Bearer ${SERVER_SUPABASE_KEY}`
      }
    });
    if (!res.ok) return;
    const rows = (await res.json()) as any[];
    if (hydrateStateWithSupabaseRows(prodDb, rows)) {
      syncLeaderboard(prodDb);
      atomicWriteJsonFile(DB_FILE, prodDb);
    }
  } catch {
    // Non-blocking startup cloud hydration
  }
}

void hydrateProductionUsersFromSupabase();

function saveDatabase(state: DatabaseState): boolean {
  const targetFile = state === testDb ? TEST_DB_FILE : activeDbFile;
  return saveDatabaseStateWithRollback(targetFile, state, {
    onBeforeSave: (s) => syncLeaderboard(s as DatabaseState)
  });
}

// In-memory active Online Multiplayer Rooms
const ONLINE_PLAYER_COLORS = ['#0ea5e9', '#ec4899', '#10b981', '#f59e0b'] as const;

interface ActiveRoom {
  code: string;
  roomName: string;
  hostId: string;
  isPublic: boolean;
  maxPlayers?: number;
  gameMode: 'WORD_RACE' | 'SPEED_REVEAL_20S';
  difficulty?: OnlineDifficulty;
  usedWords?: string[];
  speedTurnSeconds?: number;
  playerDeadlines?: Record<string, number>;
  secretRevealedLetters?: Record<string, { row: number; col: number; label?: string; word: string }[]>;
  roundNumber: number;
  stagesCount: number;
  seriesCompleted?: boolean;
  seriesWinnerId?: string | null;
  seriesWinnerName?: string;
  stageWinnerId?: string | null;
  stageWinnerName?: string;
  standings?: {
    stageNumber: number;
    totalStages: number;
    stageWinnerId: string | null;
    stageWinnerName: string;
    pointsLeaderId: string | null;
    pointsLeaderName: string;
    winsLeaderId: string | null;
    winsLeaderName: string;
    seriesCompleted: boolean;
    seriesWinnerId: string | null;
    seriesWinnerName: string;
  };
  categoryId: string;
  levelNumber: number;
  gridSize: number;
  words: string[];
  grid: string[][];
  wordPlacements: {
    word: string;
    displayWord: string;
    cells: { row: number; col: number }[];
    direction?: string;
    color: string;
    foundBy?: string;
  }[];
  players: Record<string, {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
    isHost: boolean;
    score: number;
    totalScore?: number;
    wordsFound: string[];
    streak: number;
    roundWins: number;
    color: string;
    isReady: boolean;
    connected: boolean;
    lastPing: number;
  }>;
  state: 'WAITING' | 'PLAYING' | 'FINISHED';
  createdAt: number;
  startedAt?: number;
  winnerId?: string;
  chatMessages: { sender: string; text: string; time: number }[];
}

function normalizeMaxPlayers(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 2) return 2;
  return Math.min(4, n);
}

function assignRoomPlayerColor(room: ActiveRoom, playerId: string): string {
  const existing = room.players?.[playerId]?.color;
  if (existing) return existing;
  if (playerId === room.hostId) return ONLINE_PLAYER_COLORS[0];
  const used = new Set(
    Object.values(room.players || {})
      .map(p => (p.color || '').toLowerCase())
      .filter(Boolean)
  );
  const free = ONLINE_PLAYER_COLORS.find(c => !used.has(c.toLowerCase()));
  if (free) return free;
  return ONLINE_PLAYER_COLORS[Object.keys(room.players || {}).length % ONLINE_PLAYER_COLORS.length];
}

function normalizeStagesCount(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(100, n);
}

function computeRoomStandings(room: ActiveRoom, stageWinnerId: string | null) {
  const players = Object.values(room.players || {});
  const stageNumber = room.roundNumber || 1;
  const totalStages = room.stagesCount || 50;
  const stageWinnerName = stageWinnerId
    ? room.players[stageWinnerId]?.displayName || 'الفائز'
    : 'تعادل';

  let maxTotalScore = -1;
  let pointsTop: typeof players = [];
  players.forEach(p => {
    const ts = p.totalScore ?? p.score ?? 0;
    if (ts > maxTotalScore) {
      maxTotalScore = ts;
      pointsTop = [p];
    } else if (ts === maxTotalScore) {
      pointsTop.push(p);
    }
  });
  const pointsLeader = pointsTop.length === 1 ? pointsTop[0] : null;

  let maxWins = -1;
  let winsTop: typeof players = [];
  players.forEach(p => {
    const rw = p.roundWins || 0;
    if (rw > maxWins) {
      maxWins = rw;
      winsTop = [p];
    } else if (rw === maxWins) {
      winsTop.push(p);
    }
  });
  const winsLeader = winsTop.length === 1 ? winsTop[0] : null;

  const seriesCompleted = stageNumber >= totalStages;
  let seriesWinnerId: string | null = null;
  let seriesWinnerName = '';

  if (seriesCompleted) {
    const sorted = [...players].sort((a, b) => {
      const rwDiff = (b.roundWins || 0) - (a.roundWins || 0);
      if (rwDiff !== 0) return rwDiff;
      return (b.totalScore ?? b.score ?? 0) - (a.totalScore ?? a.score ?? 0);
    });
    const top = sorted[0];
    const second = sorted[1];
    const isOverallTie =
      top &&
      second &&
      (top.roundWins || 0) === (second.roundWins || 0) &&
      (top.totalScore ?? top.score ?? 0) === (second.totalScore ?? second.score ?? 0);

    if (isOverallTie) {
      seriesWinnerId = 'DRAW';
      seriesWinnerName = 'تعادل بطولي';
    } else if (top) {
      seriesWinnerId = top.id;
      seriesWinnerName = top.displayName;
    }
  }

  return {
    stageNumber,
    totalStages,
    stageWinnerId,
    stageWinnerName,
    pointsLeaderId: pointsLeader ? pointsLeader.id : null,
    pointsLeaderName: pointsLeader ? pointsLeader.displayName : 'تعادل',
    winsLeaderId: winsLeader ? winsLeader.id : null,
    winsLeaderName: winsLeader ? winsLeader.displayName : 'تعادل',
    seriesCompleted,
    seriesWinnerId,
    seriesWinnerName
  };
}

const activeRooms: Record<string, ActiveRoom> = {};
const roomSockets: Record<string, Map<string, WebSocket>> = {};
const allLobbySockets = new Set<WebSocket>();
// Real-time user presence tracking (username -> Set of active WebSockets)
const userPresenceSockets = new Map<string, Set<WebSocket>>();
const userLastSeen = new Map<string, number>();
const pendingRoomInvites: Record<string, ServerRoomInvite[]> = {};
// Server-authoritative Solo Stage sessions
const activeStageSessions: Record<string, ActiveStageSession> = {};

function sanitizeRoomForClient(room: ActiveRoom, forPlayerId?: string): ActiveRoom & {
  myRevealedCells?: { row: number; col: number; label?: string; word: string }[];
} {
  const revealAll = room.state === 'FINISHED';
  const foundSet = new Set<string>();
  Object.values(room.players || {}).forEach(p => {
    (p.wordsFound || []).forEach(w => foundSet.add(w));
  });
  // NEVER expose `secretRevealedLetters` map (which contains what the opponent sees) to clients!
  const { secretRevealedLetters, ...safeRoomFields } = room;
  const myRevealedCells =
    forPlayerId && secretRevealedLetters?.[forPlayerId]
      ? secretRevealedLetters[forPlayerId].filter(rc => !foundSet.has(rc.word))
      : undefined;
  return {
    ...safeRoomFields,
    ...(myRevealedCells ? { myRevealedCells } : {}),
    wordPlacements: (room.wordPlacements || []).map(wp => {
      const isFound = revealAll || Boolean(wp.foundBy) || foundSet.has(wp.word);
      return {
        ...wp,
        cells: isFound ? wp.cells : [],
        direction: isFound ? wp.direction : 'RIGHT_TO_LEFT'
      };
    })
  };
}

function normalizeUsername(raw?: string): string {
  return (raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

function getUserOnlineStatusInfo(username: string): {
  onlineStatus: 'ONLINE' | 'IN_ROOM' | 'IN_GAME' | 'OFFLINE';
  activeRoomCode?: string;
  activeRoomName?: string;
  lastSeenAt?: number;
} {
  const clean = normalizeUsername(username);

  // 1. Check if user is inside any active room
  for (const room of Object.values(activeRooms)) {
    const matchedPlayer = Object.values(room.players).find(
      p => p.connected && normalizeUsername(p.username) === clean
    );
    if (matchedPlayer) {
      if (room.state === 'PLAYING') {
        return {
          onlineStatus: 'IN_GAME',
          activeRoomCode: room.code,
          activeRoomName: room.roomName,
          lastSeenAt: Date.now()
        };
      }
      if (room.state === 'WAITING') {
        return {
          onlineStatus: 'IN_ROOM',
          activeRoomCode: room.code,
          activeRoomName: room.roomName,
          lastSeenAt: Date.now()
        };
      }
    }
  }

  // 2. Check active presence WebSockets
  const sockets = userPresenceSockets.get(clean);
  if (sockets && sockets.size > 0) {
    for (const s of sockets) {
      if (s.readyState === WebSocket.OPEN) {
        return {
          onlineStatus: 'ONLINE',
          lastSeenAt: Date.now()
        };
      }
    }
  }

  return {
    onlineStatus: 'OFFLINE',
    lastSeenAt: userLastSeen.get(clean)
  };
}

function buildFriendSummary(u: UserRecord) {
  const statusInfo = getUserOnlineStatusInfo(u.username);
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatar: u.avatar,
    level: u.level || 1,
    xp: u.xp || 0,
    multiplayerWins: u.multiplayerWins || 0,
    onlineStatus: statusInfo.onlineStatus,
    activeRoomCode: statusInfo.activeRoomCode,
    activeRoomName: statusInfo.activeRoomName,
    lastSeenAt: statusInfo.lastSeenAt
  };
}

function getBlockedSetForUser(username: string): Set<string> {
  const clean = normalizeUsername(username);
  const blocked = new Set<string>();
  if (!clean) return blocked;
  const me = db.users[clean];
  if (Array.isArray(me?.blockedUsers)) {
    me.blockedUsers.forEach(b => {
      const cb = normalizeUsername(b);
      if (cb) blocked.add(cb);
    });
  }
  Object.values(db.users).forEach(other => {
    if (Array.isArray(other.blockedUsers) && other.blockedUsers.some(b => normalizeUsername(b) === clean)) {
      const co = normalizeUsername(other.username);
      if (co) blocked.add(co);
    }
  });
  return blocked;
}

function isUserBlockedEitherWay(userA?: string | null, userB?: string | null): boolean {
  const cleanA = normalizeUsername(userA || '');
  const cleanB = normalizeUsername(userB || '');
  if (!cleanA || !cleanB || cleanA === cleanB) return false;
  return getBlockedSetForUser(cleanA).has(cleanB);
}

const reportRateLimitMap = new Map<string, number[]>();
const REPORT_RATE_LIMIT_MAX = 5;
const REPORT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function getFriendsPayloadForUser(username: string) {
  const clean = normalizeUsername(username) || 'ahmad_kwt';
  const user = db.users[clean] || db.users['ahmad_kwt'];
  if (!user) {
    return { friends: [], suggestions: [], pendingInvites: [] };
  }
  if (!Array.isArray(user.friends)) {
    user.friends = [];
  }
  const blockedSet = getBlockedSetForUser(clean);

  const friendSummaries = user.friends
    .filter(fName => !blockedSet.has(normalizeUsername(fName)))
    .map(fName => db.users[normalizeUsername(fName)])
    .filter((f): f is UserRecord => Boolean(f))
    .map(f => buildFriendSummary(f))
    .sort((a, b) => {
      const rank = { IN_ROOM: 0, ONLINE: 1, IN_GAME: 2, OFFLINE: 3 };
      return rank[a.onlineStatus] - rank[b.onlineStatus] || b.xp - a.xp;
    });

  const friendSet = new Set(user.friends.map(f => normalizeUsername(f)));
  const suggestions = Object.values(db.users)
    .filter(u => {
      const uClean = normalizeUsername(u.username);
      return uClean !== clean && !friendSet.has(uClean) && !blockedSet.has(uClean);
    })
    .map(u => buildFriendSummary(u))
    .sort((a, b) => {
      const rank = { IN_ROOM: 0, ONLINE: 1, IN_GAME: 2, OFFLINE: 3 };
      return rank[a.onlineStatus] - rank[b.onlineStatus] || b.xp - a.xp;
    })
    .slice(0, 12);

  // Filter out expired room invites (older than 15 mins or rooms that no longer exist) & blocked senders
  const rawInvites = pendingRoomInvites[clean] || [];
  const validInvites = rawInvites.filter(inv => {
    const room = activeRooms[inv.roomCode];
    const ageMs = Date.now() - inv.createdAt;
    if (blockedSet.has(normalizeUsername(inv.fromUsername))) return false;
    return ageMs < 15 * 60 * 1000 && (!room || room.state === 'WAITING');
  });
  pendingRoomInvites[clean] = validInvites;

  return {
    friends: friendSummaries,
    suggestions,
    pendingInvites: validInvites
  };
}

function broadcastPresenceUpdate() {
  userPresenceSockets.forEach((sockets, uname) => {
    const payload = getFriendsPayloadForUser(uname);
    const msg = JSON.stringify({
      type: 'FRIENDS_PRESENCE_UPDATED',
      payload
    });
    sockets.forEach(s => {
      if (s.readyState === WebSocket.OPEN) {
        s.send(msg);
      }
    });
  });
}

function createAuthoritativeBoard(
  categoryId: string,
  difficulty: OnlineDifficulty = 'MEDIUM',
  excludeWords: string[] = []
) {
  const diffCfg = getOnlineDifficultyConfig(difficulty);
  const rawWords = getRandomCategoryWords(categoryId, diffCfg.wordCount, excludeWords);
  const generated = generateWordSearchGrid(rawWords, diffCfg.gridSize, diffCfg.allowedDirections);
  return {
    grid: generated.grid,
    gridSize: generated.gridSize,
    words: rawWords,
    wordPlacements: generated.wordPlacements.map(wp => ({
      word: wp.word,
      displayWord: wp.displayWord,
      cells: wp.cells,
      direction: wp.direction,
      color: wp.color,
      foundBy: undefined
    }))
  };
}

function assignAuthoritativeBoardToRoom(room: ActiveRoom, forceRegenerate = false) {
  // STRICT IDEMPOTENCY:
  // If the room already has an authoritative board generated for the active state/round,
  // do NOT regenerate! Overwriting would desynchronize players who received the first board.
  if (
    !forceRegenerate &&
    room.state === 'PLAYING' &&
    Array.isArray(room.words) &&
    room.words.length > 0 &&
    Array.isArray(room.grid) &&
    room.grid.length > 0 &&
    Array.isArray(room.wordPlacements) &&
    room.wordPlacements.length > 0
  ) {
    return {
      grid: room.grid,
      gridSize: room.gridSize,
      words: room.words,
      wordPlacements: room.wordPlacements
    };
  }

  const diff = normalizeOnlineDifficulty(room.difficulty);
  room.difficulty = diff;
  const previousUsed = Array.isArray(room.usedWords) ? room.usedWords : [];
  const board = createAuthoritativeBoard(room.categoryId, diff, previousUsed);
  const existingNorms = new Set(previousUsed.map(w => normalizeArabicWord(w)));
  const nextUsed = [...previousUsed];
  for (const w of board.words) {
    const n = normalizeArabicWord(w);
    if (n && !existingNorms.has(n)) {
      existingNorms.add(n);
      nextUsed.push(w);
    }
  }
  room.usedWords = nextUsed;
  room.grid = board.grid;
  room.gridSize = board.gridSize;
  room.words = board.words;
  room.wordPlacements = board.wordPlacements;
  return board;
}

function getPublicRoomsSummary(viewerUsername?: string) {
  const blockedSet = viewerUsername ? getBlockedSetForUser(viewerUsername) : null;
  return Object.values(activeRooms)
    .filter(r => {
      const limit = normalizeMaxPlayers(r.maxPlayers);
      if (!r.isPublic || r.state !== 'WAITING' || Object.keys(r.players).length >= limit) return false;
      if (blockedSet && blockedSet.size > 0) {
        const hasBlockedMember = Object.values(r.players).some(p => blockedSet.has(normalizeUsername(p.username)));
        if (hasBlockedMember) return false;
      }
      return true;
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(r => {
      const host = r.players[r.hostId] || Object.values(r.players)[0];
      return {
        code: r.code,
        roomName: r.roomName || `غرفة ${host?.displayName || 'الكويت'}`,
        hostName: host?.displayName || 'لاعب كويتي',
        hostUsername: host?.username || '',
        hostAvatar: host?.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
        categoryId: r.categoryId,
        gameMode: r.gameMode || 'WORD_RACE',
        difficulty: r.difficulty || 'MEDIUM',
        stagesCount: r.stagesCount || 50,
        maxPlayers: normalizeMaxPlayers(r.maxPlayers),
        playerCount: Object.keys(r.players).length,
        createdAt: r.createdAt
      };
    });
}

function broadcastPublicRooms() {
  const rooms = getPublicRoomsSummary();
  const msg = JSON.stringify({
    type: 'PUBLIC_ROOMS_UPDATED',
    payload: { rooms }
  });
  allLobbySockets.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// Clean Arabic word helper
function cleanArabic(w: string): string {
  return w
    .trim()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, '');
}

const app = express();

// CORS middleware for Capacitor iOS (capacitor://localhost, ionic://localhost, http://localhost) and Web
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-auth-token, x-admin-token, x-user-id, x-test-db-isolation'
  );
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(express.json());

// Test Database Isolation Middleware:
// When automated tests send `x-test-db-isolation: 1`, all operations execute on `testDb` (data/test-database.json)
// so production player data in `data/database.json` is NEVER modified or touched!
function isTestDbRequest(req: express.Request): boolean {
  return (
    req.headers['x-test-db-isolation'] === '1' ||
    req.headers['x-test-db-isolation'] === 'true' ||
    process.env.FATTESHHA_TEST_MODE === '1'
  );
}

function requireVerifiedRequestUser(
  req: express.Request,
  res: express.Response,
  targetUsername?: string | null
): { username: string; userId: string; user: UserRecord } | null {
  const verified = verifyRequestTokenUser(req, res, targetUsername);
  if (!verified) return null;
  const cleanUser = normalizeUsername(verified.username);
  const user = db.users[cleanUser];
  if (!user) {
    res.status(404).json({ success: false, error: 'الحساب غير موجود على الخادم' });
    return null;
  }
  ensureUserFields(user);
  return {
    username: cleanUser,
    userId: verified.userId,
    user
  };
}

app.use((req, _res, next) => {
  const isIsolatedTest = isTestDbRequest(req);

  if (isIsolatedTest) {
    db = testDb;
    activeDbFile = TEST_DB_FILE;
  } else {
    db = prodDb;
    activeDbFile = DB_FILE;
  }
  next();
});

app.post('/api/test/reset-isolated-db', (req, res) => {
  if (req.headers['x-test-db-isolation'] !== '1' && process.env.FATTESHHA_TEST_MODE !== '1') {
    return res.status(403).json({ error: 'مسموح فقط في وضع قاعدة بيانات الاختبار المعزولة' });
  }
  testDb = createFreshDefaultDatabaseState();
  db = testDb;
  saveDatabase(testDb);
  // Clear only test rooms and test stage sessions
  Object.keys(activeRooms).forEach(code => {
    if (code !== 'KWT55') {
      clearRoomBotTimers(code);
      clearRoomSpeedTimer(code);
      delete activeRooms[code];
      delete roomSockets[code];
    }
  });
  Object.keys(activeStageSessions).forEach(sid => {
    delete activeStageSessions[sid];
  });
  res.json({ success: true, message: 'تم تهيئة قاعدة بيانات الاختبار المنفصلة بنجاح' });
});

// ============================================================================
// AUTHENTICATION, PASSWORD HASHING (SCRYPT + SALT), SESSION TOKENS & RECOVERY
// ============================================================================
app.post('/api/auth/register', (req, res) => {
  const { username, displayName, password, avatar, email } = req.body || {};
  if (!username || !displayName) {
    return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم والاسم المعروض' });
  }
  if (!password || typeof password !== 'string' || password.trim().length < 4) {
    return res.status(400).json({ error: 'يرجى إدخال كلمة مرور لا تقل عن 4 خانات' });
  }

  const userModCheck = checkTextModeration(username, 'اسم المستخدم');
  if (!userModCheck.allowed) {
    return res.status(400).json({ error: userModCheck.reason });
  }
  const nameModCheck = checkTextModeration(displayName, 'الاسم المعروض');
  if (!nameModCheck.allowed) {
    return res.status(400).json({ error: nameModCheck.reason });
  }

  const cleanUser = normalizeUsername(username);
  if (!cleanUser) {
    return res.status(400).json({ error: 'اسم المستخدم غير صالح' });
  }

  if (db.users[cleanUser]) {
    return res.status(400).json({ error: 'اسم المستخدم مسجل مسبقاً، اختر اسماً آخر' });
  }

  if (Array.isArray(db.deletedUsernames)) {
    db.deletedUsernames = db.deletedUsernames.filter(u => normalizeUsername(u) !== cleanUser);
  }

  const newUser: UserRecord = {
    id: `usr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    username: cleanUser,
    displayName: displayName.trim(),
    ...(typeof email === 'string' && email.includes('@') ? { email: email.trim().toLowerCase() } : {}),
    passwordHash: hashPasswordScrypt(password),
    avatar: avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
    level: 1,
    xp: 0,
    coins: DEFAULT_FREE_ACCOUNT_COINS,
    hintsRemaining: 5,
    completedLevels: {},
    multiplayerWins: 0,
    multiplayerLosses: 0,
    achievements: [],
    createdAt: new Date().toISOString()
  };

  ensureUserFields(newUser);
  db.users[cleanUser] = newUser;
  saveDatabase(db);
  if (db === prodDb && !isTestDbRequest(req)) {
    void syncProductionUserToSupabase(newUser);
  }

  const authToken = createAuthToken(cleanUser, newUser.id);
  res.json({
    success: true,
    authToken,
    user: sanitizeUserForClient(newUser, authToken)
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username) {
    return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم' });
  }
  if (!password || typeof password !== 'string' || !password.trim()) {
    return res.status(400).json({ error: 'يرجى إدخال كلمة المرور لتسجيل الدخول' });
  }

  const rawTrimmed = String(username).trim().toLowerCase();
  const cleanUser = normalizeUsername(username);
  const deletedSet = new Set((db.deletedUsernames || []).map(u => normalizeUsername(u)));
  if (deletedSet.has(cleanUser)) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }

  let user: UserRecord | undefined = db.users[cleanUser];
  if (!user) {
    user = Object.values(db.users).find(
      u =>
        (u.email && u.email.toLowerCase() === rawTrimmed) ||
        normalizeUsername(u.displayName || '') === cleanUser
    );
  }

  // On-demand Supabase cloud profile hydration & merge so stages completed on another device/Vercel sync cleanly
  if (db === prodDb && !isTestDbRequest(req)) {
    const hydrated = await hydrateSingleProductionUserFromSupabase(rawTrimmed.includes('@') ? rawTrimmed : cleanUser);
    if (!user && hydrated) {
      user = hydrated;
    }
  }

  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }

  const verification = verifyAndUpgradePassword(user, password);
  if (!verification.valid) {
    return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
  }

  ensureUserFields(user);
  saveDatabase(db);
  if (db === prodDb && !isTestDbRequest(req)) {
    void syncProductionUserToSupabase(user);
  }

  const authToken = createAuthToken(user.username, user.id);
  res.json({
    success: true,
    authToken,
    user: sanitizeUserForClient(user, authToken)
  });
});

// Unified Account Sync Bridge (Task 1 & Task 4):
// - If account does NOT exist yet, checks Supabase first (in prod) before registering safe initial stats and returning an `authToken`.
// - If account ALREADY exists, strictly requires a valid `authToken` for that account OR a valid password!
// - Rejects any attempt to access or modify another player's account by changing `username`.
app.post('/api/auth/sync-account', async (req, res) => {
  const {
    id,
    username,
    displayName,
    password,
    passwordHash: rawClientPasswordHash,
    avatar,
    selectedTitle,
    selectedCosmetic,
    equippedBoardTheme,
    equippedTrail,
    equippedNameGlow
  } = req.body || {};

  const cleanUser = normalizeUsername(username);
  if (!cleanUser) {
    return res.status(400).json({ error: 'اسم المستخدم مطلوب للمزامنة' });
  }

  if (typeof displayName === 'string' && displayName.trim()) {
    const nameModCheck = checkTextModeration(displayName, 'الاسم المعروض');
    if (!nameModCheck.allowed) {
      return res.status(400).json({ error: nameModCheck.reason });
    }
  }

  const rawToken = extractTokenFromRequest(req);
  const verifiedToken = verifyAuthToken(rawToken);

  // If caller provided a token belonging to a DIFFERENT user, block account impersonation immediately!
  if (verifiedToken && verifiedToken.username !== cleanUser) {
    return res.status(403).json({
      error: 'غير مصرح لك بالوصول إلى حساب لاعب آخر أو مزامنته'
    });
  }

  if (!db.users[cleanUser] && db === prodDb && !isTestDbRequest(req)) {
    await hydrateSingleProductionUserFromSupabase(cleanUser);
  }

  const existingUser = db.users[cleanUser];
  if (existingUser) {
    // Account already exists: require either matching valid authToken OR valid password
    const hasValidToken = Boolean(verifiedToken && verifiedToken.username === cleanUser);
    let hasValidPassword = false;
    if (!hasValidToken) {
      if (password && typeof password === 'string') {
        hasValidPassword = verifyAndUpgradePassword(existingUser, password).valid;
      } else if (rawClientPasswordHash && typeof rawClientPasswordHash === 'string') {
        hasValidPassword = verifyAndUpgradePassword(existingUser, rawClientPasswordHash).valid;
      }
    }

    if (!hasValidToken && !hasValidPassword) {
      return res.status(401).json({
        error: 'غير مصرح بالوصول إلى هذا الحساب المسجل مسبقاً دون جلسة مصادقة موثقة أو كلمة مرور صحيحة'
      });
    }
  } else {
    const userModCheck = checkTextModeration(username, 'اسم المستخدم');
    if (!userModCheck.allowed) {
      return res.status(400).json({ error: userModCheck.reason });
    }
    if (Array.isArray(db.deletedUsernames)) {
      db.deletedUsernames = db.deletedUsernames.filter(u => normalizeUsername(u) !== cleanUser);
    }

    // Brand-new account registration via sync
    const initialPw =
      typeof password === 'string' && password.trim()
        ? hashPasswordScrypt(password.trim())
        : typeof rawClientPasswordHash === 'string' && rawClientPasswordHash.trim()
        ? hashPasswordScrypt(rawClientPasswordHash.trim())
        : hashPasswordScrypt(`auto_${cleanUser}_${Date.now()}`);

    db.users[cleanUser] = {
      id: id || `usr_${cleanUser}_${Date.now()}`,
      username: cleanUser,
      displayName: (displayName || cleanUser).trim(),
      passwordHash: initialPw,
      avatar: avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
      level: 1,
      xp: 0,
      coins: DEFAULT_FREE_ACCOUNT_COINS,
      hintsRemaining: 5,
      completedLevels: {},
      multiplayerWins: 0,
      multiplayerLosses: 0,
      achievements: [],
      createdAt: new Date().toISOString()
    };
  }

  const user = ensureUserFields(db.users[cleanUser]);

  // Only allow safe non-competitive profile identity/equipped cosmetic updates (if already unlocked)
  if (typeof displayName === 'string' && displayName.trim()) {
    user.displayName = displayName.trim();
  }
  if (typeof avatar === 'string' && avatar.trim()) {
    user.avatar = avatar.trim();
  }
  if (typeof selectedTitle === 'string' && user.unlockedTitles?.includes(selectedTitle)) {
    user.selectedTitle = selectedTitle;
  }
  if (typeof selectedCosmetic === 'string' && user.unlockedCosmetics?.includes(selectedCosmetic)) {
    user.selectedCosmetic = selectedCosmetic;
  }
  if (typeof equippedBoardTheme === 'string' && user.unlockedBoardThemes?.includes(equippedBoardTheme)) {
    user.equippedBoardTheme = equippedBoardTheme;
  }
  if (typeof equippedTrail === 'string' && user.unlockedTrails?.includes(equippedTrail)) {
    user.equippedTrail = equippedTrail;
  }
  if (typeof equippedNameGlow === 'string' && user.unlockedNameGlows?.includes(equippedNameGlow)) {
    user.equippedNameGlow = equippedNameGlow;
  }

  saveDatabase(db);
  if (db === prodDb && !isTestDbRequest(req)) {
    void syncProductionUserToSupabase(user);
  }
  const authToken = verifiedToken?.username === cleanUser ? rawToken! : createAuthToken(cleanUser, user.id);
  res.json({
    success: true,
    authToken,
    user: sanitizeUserForClient(user, authToken)
  });
});

app.get('/api/auth/me', (req, res) => {
  const requestedUsername = (req.headers['x-user-id'] as string) || (req.query.username as string) || undefined;
  const verified = requireVerifiedRequestUser(req, res, requestedUsername);
  if (!verified) return;

  const user = db.users[verified.username];
  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }
  ensureUserFields(user);
  res.json({
    success: true,
    user: sanitizeUserForClient(user)
  });
});

// Generate a signed single-use recovery code for the authenticated account owner
app.post('/api/auth/recovery-code', (req, res) => {
  const { username } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const user = db.users[verified.username];
  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }
  ensureUserFields(user);

  const { recoveryCode, nonce } = createSignedRecoveryCode(user.username, user.id);
  user.activeRecoveryNonce = nonce;
  saveDatabase(db);

  res.json({
    success: true,
    recoveryCode
  });
});

// Recover account using a valid, unconsumed signed recovery code
app.post('/api/auth/recover', (req, res) => {
  const { recoveryCode, expectedUsername } = req.body || {};
  const verifiedRec = verifySignedRecoveryCode(recoveryCode);
  if (!verifiedRec) {
    return res.status(401).json({
      error: 'رمز استعادة الحساب غير صالح أو مزور'
    });
  }

  if (expectedUsername && normalizeUsername(expectedUsername) !== verifiedRec.username) {
    return res.status(403).json({
      error: 'رمز الاستعادة لا يخص هذا الحساب'
    });
  }

  const user = db.users[verifiedRec.username];
  if (!user) {
    return res.status(404).json({ error: 'الحساب غير موجود' });
  }
  ensureUserFields(user);

  if (
    user.usedRecoveryNonces?.includes(verifiedRec.nonce) ||
    user.activeRecoveryNonce !== verifiedRec.nonce
  ) {
    return res.status(409).json({
      error: 'تم استخدام رمز الاستعادة هذا مسبقاً أو انتهت صلاحيته ولا يمكن استخدامه مرة أخرى'
    });
  }

  user.usedRecoveryNonces!.push(verifiedRec.nonce);
  user.activeRecoveryNonce = undefined;
  saveDatabase(db);

  const authToken = createAuthToken(user.username, user.id);
  res.json({
    success: true,
    authToken,
    user: sanitizeUserForClient(user, authToken)
  });
});

// Sign in with Apple (Apple App Store Guideline 4.8 - Real Cryptographic JWKS Signature Verification):
// Requires a valid RS256 identityToken signed by Apple (https://appleid.apple.com/auth/keys),
// verifying iss, aud ('com.fatteshha.kuwaitgame'), exp, and optional SHA256 nonce.
app.post('/api/auth/apple', async (req, res) => {
  const { identityToken, nonce, fullName } = req.body || {};

  let claims;
  try {
    claims = await verifyAppleIdentityToken({
      identityToken: typeof identityToken === 'string' ? identityToken : '',
      rawNonce: typeof nonce === 'string' ? nonce : undefined
    });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 401;
    return res.status(status).json({
      success: false,
      code: err?.code || 'APPLE_TOKEN_INVALID',
      error: 'فشل التحقق من توقيع Apple ID الحقيقي، يرجى إعادة المحاولة عبر تسجيل الدخول بـ Apple'
    });
  }

  if (typeof fullName === 'string' && fullName.trim()) {
    const nameMod = checkTextModeration(fullName, 'الاسم المعروض');
    if (!nameMod.allowed) {
      return res.status(400).json({ success: false, error: nameMod.reason });
    }
  }

  const resolvedSub = claims.sub;
  const resolvedEmail = claims.email || '';
  const emailPrefix = resolvedEmail && resolvedEmail.includes('@') ? resolvedEmail.split('@')[0] : '';
  const expectedAppleId = `usr_apple_${resolvedSub.slice(0, 16)}`;
  const fallbackCleanUser = normalizeUsername(
    `apple_${resolvedSub.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 18)}`
  );
  const candidateCleanUser = normalizeUsername(emailPrefix) || fallbackCleanUser;

  const existingUser =
    Object.values(db.users).find(u => u.id === expectedAppleId) ||
    (candidateCleanUser ? db.users[candidateCleanUser] : undefined);

  if (existingUser) {
    if (Array.isArray(db.deletedUsernames)) {
      db.deletedUsernames = db.deletedUsernames.filter(u => normalizeUsername(u) !== normalizeUsername(existingUser.username));
    }
    if (resolvedEmail && !existingUser.email) {
      existingUser.email = resolvedEmail;
    }
    // Preserve existing displayName unless a new non-empty fullName is explicitly provided
    if (typeof fullName === 'string' && fullName.trim() && existingUser.displayName === existingUser.username) {
      existingUser.displayName = fullName.trim();
    }
    ensureUserFields(existingUser);
    saveDatabase(db);
    if (db === prodDb && !isTestDbRequest(req)) {
      void syncProductionUserToSupabase(existingUser);
    }
    const authToken = createAuthToken(existingUser.username, existingUser.id);
    return res.json({
      success: true,
      provider: 'apple',
      authToken,
      user: sanitizeUserForClient(existingUser, authToken)
    });
  }

  const cleanUser = fallbackCleanUser || candidateCleanUser;
  if (!cleanUser) {
    return res.status(400).json({
      success: false,
      error: 'بيانات معرف Apple غير مكتملة'
    });
  }

  if (Array.isArray(db.deletedUsernames)) {
    db.deletedUsernames = db.deletedUsernames.filter(u => normalizeUsername(u) !== cleanUser);
  }

  const resolvedDisplayName =
    (typeof fullName === 'string' && fullName.trim()) ||
    emailPrefix ||
    'لاعب Apple';

  const newUser: UserRecord = {
    id: expectedAppleId,
    username: cleanUser,
    displayName: resolvedDisplayName,
    ...(resolvedEmail ? { email: resolvedEmail } : {}),
    passwordHash: hashPasswordScrypt(`apple_jwks_${resolvedSub}_${Date.now()}`),
    avatar: '/assets/images/login_kuwaiti_mascot_1794483388654.jpg',
    level: 1,
    xp: 0,
    coins: DEFAULT_FREE_ACCOUNT_COINS,
    hintsRemaining: 5,
    completedLevels: {},
    multiplayerWins: 0,
    multiplayerLosses: 0,
    achievements: [],
    createdAt: new Date().toISOString()
  };

  ensureUserFields(newUser);
  db.users[cleanUser] = newUser;
  saveDatabase(db);
  if (db === prodDb && !isTestDbRequest(req)) {
    void syncProductionUserToSupabase(newUser);
  }

  const authToken = createAuthToken(cleanUser, newUser.id);
  return res.json({
    success: true,
    provider: 'apple',
    authToken,
    user: sanitizeUserForClient(newUser, authToken)
  });
});

// Permanent Account Deletion (Apple App Store Review Guideline 5.1.1(v)):
// Strictly requires a valid authenticated session token belonging to the account being deleted,
// records tombstone in deletedUsernames so cloud hydration never resurrects it, and purges Supabase when configured.
app.post('/api/auth/delete-account', async (req, res) => {
  const { username, confirmDelete } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  if (confirmDelete && confirmDelete !== 'DELETE' && confirmDelete !== 'حذف') {
    return res.status(400).json({
      success: false,
      error: 'يرجى تأكيد حذف الحساب بشكل صحيح'
    });
  }

  const targetKey = verified.username;
  if (!db.users[targetKey]) {
    return res.status(404).json({
      success: false,
      error: 'الحساب غير موجود'
    });
  }

  const targetUserId = db.users[targetKey].id;

  // 0. Record deletion tombstone so Supabase hydration or seed restoration never resurrects this account
  if (!Array.isArray(db.deletedUsernames)) {
    db.deletedUsernames = [];
  }
  if (!db.deletedUsernames.some(u => normalizeUsername(u) === targetKey)) {
    db.deletedUsernames.push(targetKey);
  }

  // 1. Delete the user's primary account record
  delete db.users[targetKey];

  // 2. Remove deleted username from all other users' friend & block lists
  let friendsCleaned = 0;
  Object.values(db.users).forEach(otherUser => {
    if (Array.isArray(otherUser.friends) && otherUser.friends.length > 0) {
      const beforeLen = otherUser.friends.length;
      otherUser.friends = otherUser.friends.filter(f => normalizeUsername(f) !== targetKey);
      friendsCleaned += beforeLen - otherUser.friends.length;
    }
    if (Array.isArray(otherUser.blockedUsers) && otherUser.blockedUsers.length > 0) {
      otherUser.blockedUsers = otherUser.blockedUsers.filter(b => normalizeUsername(b) !== targetKey);
    }
  });

  // 2b. Anonymize PII in stored moderation reports referencing the deleted account
  if (Array.isArray(db.reports)) {
    db.reports = db.reports.map(r => ({
      ...r,
      reporterUsername: normalizeUsername(r.reporterUsername) === targetKey ? 'deleted_user' : r.reporterUsername,
      targetUsername: normalizeUsername(r.targetUsername) === targetKey ? 'deleted_user' : r.targetUsername,
      targetDisplayName: normalizeUsername(r.targetUsername) === targetKey ? 'حساب محذوف' : r.targetDisplayName
    }));
  }
  reportRateLimitMap.delete(targetKey);

  // 3. Clean up daily challenge attempts & streaks for the deleted user
  let dailyAttemptsRemoved = 0;
  if (db.unifiedDailyAttempts) {
    Object.keys(db.unifiedDailyAttempts).forEach(attemptKey => {
      if (normalizeUsername(db.unifiedDailyAttempts![attemptKey]?.username) === targetKey) {
        delete db.unifiedDailyAttempts![attemptKey];
        dailyAttemptsRemoved++;
      }
    });
  }
  if (db.unifiedDailyStreaks && db.unifiedDailyStreaks[targetKey]) {
    delete db.unifiedDailyStreaks[targetKey];
  }

  // 4. Clean up any active solo stage sessions belonging to this user
  let soloSessionsRemoved = 0;
  Object.keys(activeStageSessions).forEach(sid => {
    if (normalizeUsername(activeStageSessions[sid]?.username) === targetKey) {
      delete activeStageSessions[sid];
      soloSessionsRemoved++;
    }
  });

  // 5. Remove deleted user from any active online rooms
  let roomsCleaned = 0;
  Object.keys(activeRooms).forEach(code => {
    const room = activeRooms[code];
    if (!room) return;
    const matchingPids = Object.keys(room.players || {}).filter(
      pid => pid === targetUserId || normalizeUsername(room.players[pid]?.username) === targetKey
    );
    if (matchingPids.length > 0) {
      matchingPids.forEach(pid => {
        delete room.players[pid];
        roomSockets[code]?.delete(pid);
      });
      roomsCleaned++;
      if (Object.keys(room.players).length === 0 && code !== 'KWT55') {
        clearRoomBotTimers(code);
        clearRoomSpeedTimer(code);
        delete activeRooms[code];
        delete roomSockets[code];
      }
    }
  });

  // 6. Clean up both incoming and outgoing room invitations
  delete pendingRoomInvites[targetKey];
  Object.keys(pendingRoomInvites).forEach(recipientKey => {
    pendingRoomInvites[recipientKey] = (pendingRoomInvites[recipientKey] || []).filter(
      inv => normalizeUsername(inv.fromUsername) !== targetKey
    );
  });

  // 7. Close any presence sockets & purge lastSeen timestamp
  const sockets = userPresenceSockets.get(targetKey);
  if (sockets) {
    sockets.forEach(s => {
      try {
        s.close();
      } catch {
        // ignore
      }
    });
    userPresenceSockets.delete(targetKey);
  }
  userLastSeen.delete(targetKey);

  // 8. Re-sync leaderboard, persist database, and purge Supabase profile when service key is configured
  saveDatabase(db);
  const supaRes =
    db === prodDb && !isTestDbRequest(req)
      ? await deleteProductionUserFromSupabase(targetKey)
      : { attempted: false, deleted: false };

  broadcastPresenceUpdate();
  broadcastPublicRooms();

  res.json({
    success: true,
    deletedUsername: targetKey,
    deletedDataSummary: {
      accountRecordDeleted: !db.users[targetKey],
      removedFromLeaderboard: !db.leaderboard.some(e => normalizeUsername(e.username) === targetKey),
      friendReferencesRemoved: friendsCleaned,
      dailyAttemptsRemoved,
      soloSessionsRemoved,
      roomsCleaned,
      tombstoneRecorded: Boolean(db.deletedUsernames?.some(u => normalizeUsername(u) === targetKey)),
      supabaseDeleteAttempted: supaRes.attempted,
      supabaseDeleted: supaRes.deleted
    },
    message: 'تم حذف الحساب وجميع بياناته المرتبطة نهائياً بنجاح وفق سياسة الخصوصية'
  });
});

app.get('/api/users', (_req, res) => {
  const usersList = Object.values(db.users).map(u => {
    ensureUserFields(u);
    return sanitizeUserForClient(u);
  });
  res.json({ success: true, users: usersList });
});

app.post('/api/auth/guest', (req, res) => {
  const { guestId, displayName } = req.body || {};
  if (typeof displayName === 'string' && displayName.trim()) {
    const nameMod = checkTextModeration(displayName, 'الاسم المعروض');
    if (!nameMod.allowed) {
      return res.status(400).json({ error: nameMod.reason });
    }
  }
  const rawId = (guestId || `g_${Date.now()}_${Math.floor(Math.random() * 1000)}`)
    .toString()
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase();
  let username = rawId.startsWith('guest_') ? rawId : `guest_${rawId}`;

  const rawToken = extractTokenFromRequest(req);
  const verifiedToken = verifyAuthToken(rawToken);

  if (db.users[username]) {
    // If guest account already exists, only allow resuming if caller has its valid token; otherwise allocate a fresh guest ID
    if (!verifiedToken || verifiedToken.username !== username) {
      username = `guest_${Date.now().toString(36)}_${Math.floor(100 + Math.random() * 900)}`;
    }
  }

  if (!db.users[username]) {
    const suffix = username.replace('guest_', '').slice(-4).toUpperCase() || '1';
    db.users[username] = {
      id: `usr_${username}`,
      username,
      displayName: displayName?.trim() || `ضيف فتّشها #${suffix}`,
      passwordHash: hashPasswordScrypt(`guest_${username}_${Date.now()}`),
      avatar: '/assets/images/login_kuwaiti_mascot_1794483388654.jpg',
      level: 1,
      xp: 0,
      coins: DEFAULT_FREE_ACCOUNT_COINS,
      hintsRemaining: 5,
      completedLevels: {},
      multiplayerWins: 0,
      multiplayerLosses: 0,
      achievements: [],
      createdAt: new Date().toISOString()
    };
  }

  const user = ensureUserFields(db.users[username]);
  saveDatabase(db);

  const authToken = createAuthToken(username, user.id);
  res.json({
    success: true,
    authToken,
    user: sanitizeUserForClient(user, authToken)
  });
});

// Update Player Profile (Avatar & Display Name ONLY - requires authenticated owner)
app.post('/api/profile/update', (req, res) => {
  const { username, displayName, avatar, selectedTitle, selectedCosmetic } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const user = db.users[verified.username];
  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }

  if (typeof displayName === 'string' && displayName.trim()) {
    const modCheck = checkTextModeration(displayName, 'الاسم المعروض');
    if (!modCheck.allowed) {
      return res.status(400).json({ error: modCheck.reason });
    }
  }

  ensureUserFields(user);

  if (typeof displayName === 'string' && displayName.trim()) {
    user.displayName = displayName.trim();
  }
  if (typeof avatar === 'string' && avatar.trim()) {
    user.avatar = avatar.trim();
  }
  if (typeof selectedTitle === 'string' && user.unlockedTitles?.includes(selectedTitle)) {
    user.selectedTitle = selectedTitle;
  }
  if (typeof selectedCosmetic === 'string' && (selectedCosmetic === '' || user.unlockedCosmetics?.includes(selectedCosmetic))) {
    user.selectedCosmetic = selectedCosmetic;
  }

  saveDatabase(db);
  res.json({ success: true, user: sanitizeUserForClient(user) });
});

// ============================================================================
// UGC MODERATION: BLOCKLIST, PLAYER REPORTING & ADMIN REVIEW ENDPOINTS (Guideline 1.2)
// ============================================================================
app.get('/api/moderation/blocked', (req, res) => {
  const requestedUser = (req.query.username as string) || (req.headers['x-user-id'] as string);
  const verified = requireVerifiedRequestUser(req, res, requestedUser);
  if (!verified) return;

  const user = verified.user;
  ensureUserFields(user);
  const blockedDetails = (user.blockedUsers || []).map(uname => {
    const clean = normalizeUsername(uname);
    const target = db.users[clean];
    return {
      username: clean,
      displayName: target?.displayName || clean,
      avatar: target?.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg'
    };
  });
  res.json({
    success: true,
    blockedUsers: user.blockedUsers || [],
    blockedDetails
  });
});

app.post('/api/moderation/block', (req, res) => {
  const { targetUsername, username } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const targetClean = normalizeUsername(targetUsername);
  if (!targetClean) {
    return res.status(400).json({ success: false, error: 'يرجى تحديد اسم المستخدم المراد حظره' });
  }
  if (targetClean === verified.username) {
    return res.status(400).json({ success: false, error: 'لا يمكنك حظر نفسك' });
  }

  const user = verified.user;
  ensureUserFields(user);
  if (!user.blockedUsers!.some(b => normalizeUsername(b) === targetClean)) {
    user.blockedUsers!.push(targetClean);
  }

  // Remove any pending room invites between blocked users immediately
  if (pendingRoomInvites[verified.username]) {
    pendingRoomInvites[verified.username] = pendingRoomInvites[verified.username].filter(
      inv => normalizeUsername(inv.fromUsername) !== targetClean
    );
  }
  if (pendingRoomInvites[targetClean]) {
    pendingRoomInvites[targetClean] = pendingRoomInvites[targetClean].filter(
      inv => normalizeUsername(inv.fromUsername) !== verified.username
    );
  }

  saveDatabase(db);
  broadcastPresenceUpdate();
  broadcastPublicRooms();

  res.json({
    success: true,
    blockedUsers: user.blockedUsers,
    user: sanitizeUserForClient(user),
    message: 'تم حظر اللاعب بنجاح ولن تظهر غرفه أو رسائله أو دعواته لك'
  });
});

app.post('/api/moderation/unblock', (req, res) => {
  const { targetUsername, username } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const targetClean = normalizeUsername(targetUsername);
  if (!targetClean) {
    return res.status(400).json({ success: false, error: 'يرجى تحديد اسم المستخدم المراد إلغاء حظره' });
  }

  const user = verified.user;
  ensureUserFields(user);
  user.blockedUsers = (user.blockedUsers || []).filter(b => normalizeUsername(b) !== targetClean);
  saveDatabase(db);
  broadcastPresenceUpdate();
  broadcastPublicRooms();

  res.json({
    success: true,
    blockedUsers: user.blockedUsers,
    user: sanitizeUserForClient(user),
    message: 'تم إلغاء حظر اللاعب'
  });
});

app.post('/api/moderation/report', (req, res) => {
  const { reporterUsername, targetUsername, targetDisplayName, reason, details, roomCode, context, alsoBlock } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, reporterUsername);
  if (!verified) return;

  const targetClean = normalizeUsername(targetUsername);
  if (!targetClean) {
    return res.status(400).json({ success: false, error: 'يرجى تحديد اللاعب المبلغ عنه' });
  }
  if (targetClean === verified.username) {
    return res.status(400).json({ success: false, error: 'لا يمكنك الإبلاغ عن نفسك' });
  }

  if (!REPORT_REASONS.includes(reason as ReportReason)) {
    return res.status(400).json({ success: false, error: 'يرجى اختيار سبب إبلاغ صحيح من القائمة' });
  }

  // Rate limit: max 5 reports per 10 minutes per reporter
  const now = Date.now();
  const recentTimestamps = (reportRateLimitMap.get(verified.username) || []).filter(
    ts => now - ts < REPORT_RATE_LIMIT_WINDOW_MS
  );
  if (recentTimestamps.length >= REPORT_RATE_LIMIT_MAX) {
    reportRateLimitMap.set(verified.username, recentTimestamps);
    return res.status(429).json({
      success: false,
      error: 'لقد أرسلت عدة بلاغات خلال وقت قصير، يرجى الانتظار قليلاً قبل إرسال بلاغ جديد'
    });
  }

  if (!Array.isArray(db.reports)) {
    db.reports = [];
  }

  // Duplicate open report guard (same reporter -> same target & still PENDING/REVIEWING)
  const existingOpen = db.reports.find(
    r =>
      normalizeUsername(r.reporterUsername) === verified.username &&
      normalizeUsername(r.targetUsername) === targetClean &&
      (r.status === 'PENDING' || r.status === 'REVIEWING')
  );
  if (existingOpen) {
    return res.status(409).json({
      success: false,
      error: 'لديك بلاغ مفتوح قيد المراجعة بالفعل ضد هذا اللاعب'
    });
  }

  const targetRecord = db.users[targetClean];
  const resolvedTargetDisplayName =
    (typeof targetDisplayName === 'string' && targetDisplayName.trim()) ||
    targetRecord?.displayName ||
    targetClean;

  const cleanDetails = typeof details === 'string' ? details.trim().slice(0, 300) : '';
  const validContext =
    context === 'ONLINE_GAME' || context === 'ONLINE_LOBBY' || context === 'FRIENDS' || context === 'PUBLIC_ROOM'
      ? context
      : 'ONLINE_GAME';

  const newReport: PlayerReport = {
    id: `rep_${now}_${Math.floor(1000 + Math.random() * 9000)}`,
    reporterUsername: verified.username,
    targetUsername: targetClean,
    targetDisplayName: resolvedTargetDisplayName,
    reason: reason as ReportReason,
    ...(cleanDetails ? { details: cleanDetails } : {}),
    ...(typeof roomCode === 'string' && roomCode.trim() ? { roomCode: roomCode.trim().toUpperCase().slice(0, 12) } : {}),
    context: validContext,
    createdAt: new Date(now).toISOString(),
    status: 'PENDING'
  };

  db.reports.unshift(newReport);
  recentTimestamps.push(now);
  reportRateLimitMap.set(verified.username, recentTimestamps);

  if (alsoBlock) {
    ensureUserFields(verified.user);
    if (!verified.user.blockedUsers!.some(b => normalizeUsername(b) === targetClean)) {
      verified.user.blockedUsers!.push(targetClean);
    }
  }

  saveDatabase(db);
  if (alsoBlock) {
    broadcastPresenceUpdate();
    broadcastPublicRooms();
  }

  res.json({
    success: true,
    report: newReport,
    blockedUsers: verified.user.blockedUsers || [],
    user: sanitizeUserForClient(verified.user),
    message: 'تم استلام البلاغ بنجاح وسيتم مراجعته من فريق الإشراف خلال 24 ساعة'
  });
});

app.post('/api/admin/login', (req, res) => {
  const { secret } = req.body || {};
  if (!verifyAdminSecretCandidate(secret)) {
    return res.status(401).json({
      success: false,
      error: 'مفتاح الإدارة غير صحيح'
    });
  }
  const adminToken = createAdminSessionToken();
  res.json({
    success: true,
    adminToken
  });
});

app.get('/api/admin/reports', (req, res) => {
  const adminToken = extractAdminTokenFromRequest(req);
  const adminSession = verifyAdminSessionToken(adminToken);
  if (!adminSession) {
    return res.status(401).json({
      success: false,
      error: 'غير مصرح بالوصول إلى لوحة الإشراف'
    });
  }
  const reports = Array.isArray(db.reports) ? [...db.reports] : [];
  reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({
    success: true,
    reports,
    auditLog: Array.isArray(db.adminAuditLog) ? db.adminAuditLog.slice(0, 100) : []
  });
});

const handleAdminReportStatusUpdate = (req: express.Request, res: express.Response) => {
  const adminToken = extractAdminTokenFromRequest(req);
  const adminSession = verifyAdminSessionToken(adminToken);
  if (!adminSession) {
    return res.status(401).json({
      success: false,
      error: 'غير مصرح بتنفيذ إجراءات الإشراف'
    });
  }

  const reportId = (req.params.id || '').trim();
  const { status, actionNote } = req.body || {};
  const validStatuses: ReportStatus[] = ['PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED'];
  if (!validStatuses.includes(status as ReportStatus)) {
    return res.status(400).json({ success: false, error: 'حالة البلاغ غير صالحة' });
  }

  if (!Array.isArray(db.reports)) db.reports = [];
  const report = db.reports.find(r => r.id === reportId);
  if (!report) {
    return res.status(404).json({ success: false, error: 'البلاغ غير موجود' });
  }

  report.status = status as ReportStatus;
  report.reviewedAt = new Date().toISOString();
  report.reviewedBy = 'moderator';
  if (typeof actionNote === 'string') {
    report.actionNote = actionNote.trim().slice(0, 300);
  }

  if (!Array.isArray(db.adminAuditLog)) db.adminAuditLog = [];
  db.adminAuditLog.unshift({
    id: `aud_${Date.now()}_${Math.floor(Math.random() * 999)}`,
    reportId: report.id,
    action: `SET_STATUS_${report.status}`,
    note: report.actionNote,
    at: report.reviewedAt,
    createdAt: Date.now()
  });
  db.adminAuditLog = db.adminAuditLog.slice(0, 200);

  saveDatabase(db);
  res.json({
    success: true,
    report
  });
};

app.patch('/api/admin/reports/:id/status', handleAdminReportStatusUpdate);
app.post('/api/admin/reports/:id/status', handleAdminReportStatusUpdate);

app.post('/api/progress/reset', (req, res) => {
  const { username } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const user = db.users[verified.username];
  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }

  user.completedLevels = {};
  user.level = 1;
  user.xp = 0;
  user.coins = 100;
  user.hintsRemaining = 5;
  user.multiplayerWins = 0;
  user.multiplayerLosses = 0;
  user.achievements = [];
  user.claimedSessionIds = [];
  ensureUserFields(user);
  ensureUserDailyChallenges(user, true);

  saveDatabase(db);
  res.json({ success: true, user: sanitizeUserForClient(user) });
});

// Daily Challenges Endpoints
app.get('/api/daily-challenges', (req, res) => {
  const requestedUser = (req.query.username as string) || (req.headers['x-user-id'] as string) || undefined;
  const verified = requireVerifiedRequestUser(req, res, requestedUser);
  if (!verified) return;

  const user = db.users[verified.username];
  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }
  const dailyChallenges = ensureUserDailyChallenges(user);
  saveDatabase(db);
  res.json({ success: true, dailyChallenges, user: sanitizeUserForClient(user) });
});

app.post('/api/daily-challenges/word-found', (req, res) => {
  const { username, elapsedSeconds } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const user = db.users[verified.username];
  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }

  const daily = ensureUserDailyChallenges(user);
  const newlyCompleted: ServerDailyChallengeTask[] = [];

  daily.tasks.forEach(task => {
    if (task.completed) return;

    if (task.type === 'FIND_WORDS_IN_TIME') {
      const limit = task.timeLimitSeconds || 180;
      if ((Number(elapsedSeconds) || 0) <= limit) {
        task.current = Math.min(task.target, task.current + 1);
      }
    } else if (task.type === 'FIND_TOTAL_WORDS') {
      task.current = Math.min(task.target, task.current + 1);
    }

    if (task.current >= task.target && !task.completed) {
      task.completed = true;
      newlyCompleted.push(task);
    }
  });

  saveDatabase(db);
  res.json({ success: true, dailyChallenges: daily, newlyCompleted, user: sanitizeUserForClient(user) });
});

app.post('/api/daily-challenges/claim', (req, res) => {
  const { username, taskId } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const lockKey = `dc_claim_${verified.username}`;
  if (!acquireAtomicLock(lockKey)) {
    return res.status(409).json({ error: 'عملية قيد التنفيذ حالياً، يرجى الانتظار' });
  }

  try {
    const user = db.users[verified.username];
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const daily = ensureUserDailyChallenges(user);
    let task = daily.tasks.find(t => t.id === taskId);
    if (!task) {
      task = daily.tasks.find(
        t => (t.completed || t.current >= t.target) && (!t.claimed || t.manualClaimed === false)
      );
    }

    if (!task) {
      return res.status(404).json({ error: 'التحدي غير موجود' });
    }

    if (task.current >= task.target) {
      task.completed = true;
    }

    if (!task.completed) {
      return res.status(400).json({ error: 'لم يكتمل هذا التحدي بعد' });
    }

    if (task.claimed && task.manualClaimed !== false) {
      return res.status(409).json({ error: 'تم استلام مكافأة هذا التحدي مسبقاً' });
    }

    task.claimed = true;
    task.manualClaimed = true;
    user.coins += task.rewardCoins;
    user.xp += task.rewardXP;
    user.level = Math.floor(user.xp / 300) + 1;

    saveDatabase(db);
    res.json({
      success: true,
      user: sanitizeUserForClient(user),
      rewardCoins: task.rewardCoins,
      rewardXP: task.rewardXP,
      dailyChallenges: daily
    });
  } finally {
    releaseAtomicLock(lockKey);
  }
});

app.post('/api/daily-challenges/reroll', (req, res) => {
  const { username } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const user = db.users[verified.username];
  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }

  const daily = ensureUserDailyChallenges(user, true);
  saveDatabase(db);
  res.json({ success: true, user: sanitizeUserForClient(user), dailyChallenges: daily });
});

app.post('/api/progress/claim-mission', (req, res) => {
  const { username, missionId, requestId } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const lockKey = `mission_${verified.username}`;
  if (!acquireAtomicLock(lockKey)) {
    return res.status(409).json({ error: 'عملية مطالبة متزامنة قيد التنفيذ حالياً', duplicate: true });
  }

  try {
    const user = db.users[verified.username];
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    ensureUserFields(user);

    if (!missionId || typeof missionId !== 'string') {
      return res.status(400).json({ error: 'معرف المهمة غير صالح' });
    }

    if (checkAndRecordRequestId(user, requestId)) {
      return res.status(409).json({ error: 'تمت معالجة هذا الطلب مسبقاً', duplicate: true, user: sanitizeUserForClient(user) });
    }

    // Strictly look up server-side reward table (NEVER trust client-supplied rewardCoins or rewardXP!)
    const serverMission = SERVER_MISSION_REWARDS[missionId];
    const serverAchievement = ACHIEVEMENTS.find(a => a.id === missionId);
    if (!serverMission && !serverAchievement) {
      return res.status(400).json({ error: 'هذه المهمة غير مسجلة في جدول المكافآت المعتمد بالخادم' });
    }

    const missionTag = `mission_${missionId}`;
    if (user.achievements.includes(missionTag)) {
      return res.status(409).json({ error: 'تم استلام مكافأة هذه المهمة مسبقاً', duplicate: true, user: sanitizeUserForClient(user) });
    }

    const verifiedCoins = serverMission ? serverMission.rewardCoins : (serverAchievement?.coinReward || 0);
    const verifiedXP = serverMission ? serverMission.rewardXP : (serverAchievement?.xpReward || 0);

    user.achievements.push(missionTag);
    user.coins += verifiedCoins;
    user.xp += verifiedXP;
    user.seasonXp = (user.seasonXp || 0) + verifiedXP;
    user.level = Math.floor(user.xp / 300) + 1;
    saveDatabase(db);

    res.json({
      success: true,
      user: sanitizeUserForClient(user),
      rewardCoins: verifiedCoins,
      rewardXP: verifiedXP
    });
  } finally {
    releaseAtomicLock(lockKey);
  }
});

app.get('/api/profiles', (req, res) => {
  res.json({ success: true, profiles: db.localProfiles });
});

app.post('/api/profiles', (req, res) => {
  const { id, name, avatar, color } = req.body;
  if (!id || !name) {
    return res.status(400).json({ error: 'بيانات الملف غير مكتملة' });
  }

  db.localProfiles[id] = { id, name, avatar, color: color || '#0ea5e9' };
  saveDatabase(db);
  res.json({ success: true, profiles: db.localProfiles });
});

// ============================================================================
// SERVER-AUTHORITATIVE SOLO STAGE SESSIONS & HIDDEN SOLUTIONS (TASK 5 & TASK 8)
// ============================================================================
const ALL_VALID_CATEGORY_IDS = new Set<string>([
  ...CATEGORIES.map(c => c.id),
  ...PREMIUM_CATEGORIES.map(c => c.id)
]);
const PREMIUM_CATEGORY_IDS = new Set<string>(PREMIUM_CATEGORIES.map(c => c.id));

app.post('/api/stage/start', (req, res) => {
  const { username, categoryId, levelNumber } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanUser = verified.username;
  const user = verified.user;
  const catId = String(categoryId || 'kuwait_heritage').trim();
  const parsedLevel = Number(levelNumber ?? 1);

  if (!ALL_VALID_CATEGORY_IDS.has(catId)) {
    return res.status(400).json({ error: 'التصنيف المطلوب غير صالح أو غير موجود' });
  }

  if (PREMIUM_CATEGORY_IDS.has(catId) && !user.unlockedCategories?.includes(catId)) {
    return res.status(403).json({
      error: 'هذا التصنيف الحصري مغلق حالياً؛ يجب فتحه من المتجر أولاً'
    });
  }

  if (!Number.isInteger(parsedLevel) || parsedLevel < 1 || parsedLevel > 50) {
    return res.status(400).json({ error: 'رقم المرحلة غير صالح (يجب أن يكون بين 1 و 50)' });
  }

  const lvlNum = parsedLevel;
  // Enforce sequential stage unlocking: Level N > 1 requires Level N-1 completed in the same category
  if (lvlNum > 1) {
    const prevKey = `${catId}_${lvlNum - 1}`;
    if (!user.completedLevels?.[prevKey]) {
      return res.status(403).json({
        error: `المرحلة ${lvlNum} مغلقة؛ يجب إكمال المرحلة ${lvlNum - 1} أولاً`
      });
    }
  }

  const levelConfig = getLevelConfig(catId, lvlNum);
  const generated = generateWordSearchGrid(levelConfig.words, levelConfig.gridSize);

  const sessionId = `stg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const session: ActiveStageSession = {
    sessionId,
    username: cleanUser,
    categoryId: catId,
    levelNumber: lvlNum,
    gridSize: generated.gridSize,
    words: levelConfig.words,
    grid: generated.grid,
    secretPlacements: generated.wordPlacements,
    wordsFound: [],
    wrongAttempts: 0,
    hintsUsed: 0,
    startedAt: Date.now(),
    freezeBonusSeconds: 0,
    timeExtendSeconds: 0,
    doubleBoostActive: false,
    completed: false
  };

  activeStageSessions[sessionId] = session;

  // Send sanitized placements where unfound words have `cells: []`!
  const sanitizedPlacements = sanitizeWordPlacementsForClient(
    session.secretPlacements,
    new Set(),
    false
  );

  res.json({
    success: true,
    sessionId,
    categoryId: catId,
    levelNumber: lvlNum,
    title: levelConfig.title,
    gridSize: session.gridSize,
    words: session.words,
    grid: session.grid,
    wordPlacements: sanitizedPlacements,
    user: sanitizeUserForClient(user)
  });
});

app.post('/api/stage/verify-word', (req, res) => {
  const { username, sessionId, word, cells } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const session = activeStageSessions[sessionId];
  if (!session) {
    return res.status(404).json({ error: 'جلسة المرحلة غير موجودة أو انتهت صلاحيتها' });
  }

  if (session.username !== verified.username) {
    return res.status(403).json({ error: 'غير مصرح: هذه الجلسة تخص لاعباً آخر' });
  }

  if (session.completed) {
    return res.status(409).json({ error: 'تم إنهاء هذه الجلسة مسبقاً' });
  }

  const matched = verifyWordOnServerBoard(session.grid, session.secretPlacements, word, cells);
  if (!matched) {
    session.wrongAttempts += 1;
    return res.json({
      success: false,
      valid: false,
      wrongAttempts: session.wrongAttempts
    });
  }

  const foundSecret = session.secretPlacements.find(p => p.word === matched.word);
  if (foundSecret && Array.isArray(matched.cells) && matched.cells.length >= 2) {
    foundSecret.cells = matched.cells;
  }

  const alreadyFound = session.wordsFound.includes(matched.word);
  if (!alreadyFound) {
    session.wordsFound.push(matched.word);

    // Update user's daily challenge word-found counters on the server
    const user = verified.user;
    const daily = ensureUserDailyChallenges(user);
    const elapsedSeconds = Math.max(1, Math.floor((Date.now() - session.startedAt) / 1000) - session.freezeBonusSeconds);
    daily.tasks.forEach(task => {
      if (task.completed) return;
      if (task.type === 'FIND_WORDS_IN_TIME') {
        const limit = task.timeLimitSeconds || 180;
        if (elapsedSeconds <= limit) {
          task.current = Math.min(task.target, task.current + 1);
        }
      } else if (task.type === 'FIND_TOTAL_WORDS') {
        task.current = Math.min(task.target, task.current + 1);
      }
      if (task.current >= task.target) {
        task.completed = true;
      }
    });
    saveDatabase(db);
  }

  res.json({
    success: true,
    valid: true,
    alreadyFound,
    word: matched.word,
    displayWord: matched.displayWord,
    cells: matched.cells,
    direction: matched.direction,
    color: matched.color,
    wordsFound: session.wordsFound,
    allWordsCompleted: session.wordsFound.length >= session.secretPlacements.length
  });
});

app.post('/api/stage/record-mistake', (req, res) => {
  const { username, sessionId } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const session = activeStageSessions[sessionId];
  if (!session) {
    return res.status(404).json({ error: 'جلسة المرحلة غير موجودة' });
  }
  if (session.username !== verified.username) {
    return res.status(403).json({ error: 'غير مصرح: هذه الجلسة تخص لاعباً آخر' });
  }
  if (!session.completed) {
    session.wrongAttempts += 1;
  }
  res.json({ success: true, wrongAttempts: session.wrongAttempts || 0 });
});

app.post('/api/stage/use-powerup', (req, res) => {
  const { username, sessionId, powerUpId, requestId } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanUser = verified.username;
  const user = verified.user;
  const lockKey = `powerup:${cleanUser}`;
  if (!acquireAtomicLock(lockKey)) {
    return res.status(409).json({ error: 'طلب قيد المعالجة حالياً', duplicate: true });
  }

  try {
    if (checkAndRecordRequestId(user, requestId)) {
      return res.status(409).json({
        error: 'تم استخدام هذا المعزز مسبقاً',
        duplicate: true,
        user: sanitizeUserForClient(user)
      });
    }

    const session = sessionId ? activeStageSessions[sessionId] : undefined;
    if (session && session.username !== cleanUser) {
      return res.status(403).json({ error: 'غير مصرح: جلسة اللعب تخص لاعباً آخر' });
    }

    const count = user.powerUps?.[powerUpId] || 0;
    if (count <= 0) {
      return res.status(400).json({ error: 'لا تملك رصيداً كافياً من هذا المعزز في حقيبتك' });
    }

    if (session) {
      if (powerUpId === 'DOUBLE_BOOST' && session.doubleBoostActive) {
        return res.status(400).json({ error: 'مضاعف المكافآت مفعّل بالفعل في هذه الجولة' });
      }
      if (powerUpId === 'FREEZE_TIME') {
        session.freezeBonusSeconds += 30;
      } else if (powerUpId === 'DOUBLE_BOOST') {
        session.doubleBoostActive = true;
      } else if (powerUpId === 'TIME_EXTEND') {
        session.timeExtendSeconds += 60;
      }
    }

    user.powerUps![powerUpId] = Math.max(0, count - 1);
    saveDatabase(db);

    res.json({
      success: true,
      user: sanitizeUserForClient(user),
      powerUpId,
      powerUps: user.powerUps
    });
  } finally {
    releaseAtomicLock(lockKey);
  }
});

app.post('/api/progress/complete-level', (req, res) => {
  const { username, sessionId, requestId, categoryId: rawCategoryId, levelNumber: rawLevelNumber } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanUser = verified.username;
  const user = verified.user;

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({
      error: 'لا يمكن اعتماد المرحلة بدون جلسة لعب نشطة وموثقة من الخادم (sessionId مفقود)'
    });
  }

  const lockKey = `complete-level:${cleanUser}:${sessionId}`;
  if (!acquireAtomicLock(lockKey)) {
    return res.status(409).json({
      error: 'يتم معالجة إنهاء المرحلة حالياً، يرجى عدم تكرار الطلب',
      duplicate: true,
      user: sanitizeUserForClient(user)
    });
  }

  try {
    // 1. Check duplicate requestId or sessionId to prevent reward replay / farming
    if (checkAndRecordRequestId(user, requestId)) {
      return res.status(409).json({
        error: 'تم اعتماد نتيجة هذه المرحلة وصرف مكافأتها مسبقاً',
        duplicate: true,
        user: sanitizeUserForClient(user)
      });
    }

    if (user.claimedSessionIds?.includes(sessionId)) {
      return res.status(409).json({
        error: 'تم صرف مكافأة هذه الجلسة مسبقاً ولا يمكن تكرارها',
        duplicate: true,
        user: sanitizeUserForClient(user)
      });
    }

    const session = activeStageSessions[sessionId];
    if (!session) {
      return res.status(400).json({
        error: 'جلسة اللعب غير صالحة أو منتهية'
      });
    }

    if (session.username !== cleanUser) {
      return res.status(403).json({
        error: 'غير مصرح: جلسة اللعب لا تخص هذا الحساب'
      });
    }

    if (session.completed) {
      return res.status(409).json({
        error: 'تم إنهاء هذه الجلسة وصرف مكافأتها مسبقاً',
        duplicate: true,
        user: sanitizeUserForClient(user)
      });
    }

    const totalStageWords = session.secretPlacements.length;
    if (session.wordsFound.length < totalStageWords) {
      return res.status(400).json({
        error: `لم يتم اكتشاف جميع كلمات المرحلة على الخادم (${session.wordsFound.length}/${totalStageWords})`
      });
    }

    // Mark session completed atomically before any reward calculation
    session.completed = true;
    session.completedAt = Date.now();
    user.claimedSessionIds!.push(sessionId);
    if (user.claimedSessionIds!.length > 300) {
      user.claimedSessionIds = user.claimedSessionIds!.slice(-300);
    }

    const categoryId = session.categoryId || rawCategoryId || 'kuwait_heritage';
    const levelNumber = session.levelNumber || Number(rawLevelNumber) || 1;
    const levelKey = `${categoryId}_${levelNumber}`;
    const existing = user.completedLevels[levelKey];

    // Authoritative server-calculated metrics (completely ignores client-supplied stars/score/timeSpent!)
    const rawElapsed = Math.max(1, Math.floor((session.completedAt - session.startedAt) / 1000));
    const timeSpent = Math.max(1, rawElapsed - session.freezeBonusSeconds);
    const stars = timeSpent < 60 ? 3 : timeSpent < 120 ? 2 : 1;
    const normalizedAccuracy = Math.max(
      0,
      Math.min(100, Math.round((totalStageWords / Math.max(1, totalStageWords + session.wrongAttempts)) * 100))
    );
    const score = totalStageWords * 100 + stars * 250 + Math.max(0, (180 - timeSpent) * 5);
    const wordsCount = session.wordsFound.length;
    const hintsUsed = session.hintsUsed;

    let earnedXP = 50 + stars * 20 + Math.max(0, 100 - Math.floor(timeSpent));
    let earnedCoins = 10 + stars * 5;

    if (session.doubleBoostActive) {
      earnedXP *= 2;
      earnedCoins *= 2;
    }

    user.completedLevels[levelKey] = {
      stars: Math.max(existing?.stars || 0, stars),
      bestTime: existing ? Math.min(existing.bestTime, timeSpent) : timeSpent,
      score: existing ? Math.max(existing.score, score) : score,
      accuracy: existing?.accuracy ? Math.max(existing.accuracy, normalizedAccuracy) : normalizedAccuracy,
      completedAt: new Date().toISOString()
    };

    user.totalWordsFound = (user.totalWordsFound || 0) + wordsCount;
    if (normalizedAccuracy === 100) {
      user.perfectStagesCount = (user.perfectStagesCount || 0) + 1;
    }
    if (timeSpent < 60) {
      user.fastStagesCount = (user.fastStagesCount || 0) + 1;
    }

    // Evaluate Daily Challenges progress on stage completion
    const daily = ensureUserDailyChallenges(user);
    const completedDailyTasks: ServerDailyChallengeTask[] = [];

    daily.tasks.forEach(task => {
      const wasCompleted = task.completed;

      switch (task.type) {
        case 'FIND_WORDS_IN_TIME': {
          const limit = task.timeLimitSeconds || 180;
          if (timeSpent <= limit && !task.completed) {
            task.current = Math.min(task.target, Math.max(task.current, wordsCount));
          }
          break;
        }
        case 'COMPLETE_LEVELS': {
          if (!task.completed) {
            task.current = Math.min(task.target, task.current + 1);
          }
          break;
        }
        case 'EARN_THREE_STARS': {
          if (stars >= 3 && !task.completed) {
            task.current = Math.min(task.target, task.current + 1);
          }
          break;
        }
        case 'HIGH_ACCURACY': {
          if (normalizedAccuracy >= 90 && !task.completed) {
            task.current = Math.min(task.target, task.current + 1);
          }
          break;
        }
        case 'FIND_TOTAL_WORDS': {
          if (!task.completed) {
            task.current = Math.min(task.target, task.current + wordsCount);
          }
          break;
        }
        case 'NO_HINTS_STAGE': {
          if (hintsUsed === 0 && !task.completed) {
            task.current = Math.min(task.target, task.current + 1);
          }
          break;
        }
        case 'CATEGORY_KUWAIT': {
          if (categoryId === 'kuwait_heritage' && !task.completed) {
            task.current = Math.min(task.target, task.current + 1);
          }
          break;
        }
        case 'SPEED_45S': {
          if (timeSpent <= 45 && !task.completed) {
            task.current = Math.min(task.target, task.current + 1);
          }
          break;
        }
        case 'PERFECT_ACCURACY': {
          if (normalizedAccuracy >= 100 && !task.completed) {
            task.current = Math.min(task.target, task.current + 1);
          }
          break;
        }
      }

      if (task.current >= task.target) {
        task.completed = true;
      }

      if (task.completed && !wasCompleted && !task.claimed) {
        task.manualClaimed = false;
        completedDailyTasks.push(task);
      }
    });

    // Evaluate Daily Streak (logging in + completing at least one level today)
    const streak = ensureUserDailyStreak(user);
    const today = getTodayDateKey();
    const yesterday = getOffsetDateKey(-1);
    let streakReward: { currentStreak: number; bonusCoins: number; longestStreak: number } | null = null;

    if (streak.lastCompletedDate !== today) {
      if (streak.lastCompletedDate === yesterday) {
        streak.currentStreak += 1;
      } else {
        streak.currentStreak = Math.max(1, streak.currentStreak + 1);
      }

      streak.longestStreak = Math.max(streak.longestStreak || 0, streak.currentStreak);
      streak.lastCompletedDate = today;
      streak.completedToday = true;

      const bonusCoins = calculateStreakBonusCoins(streak.currentStreak);
      streak.todayBonusCoins = bonusCoins;
      streak.nextBonusCoins = calculateStreakBonusCoins(streak.currentStreak + 1);

      if (!streak.streakHistory.includes(today)) {
        streak.streakHistory = [...streak.streakHistory.slice(-6), today];
      }

      earnedCoins += bonusCoins;
      streakReward = {
        currentStreak: streak.currentStreak,
        bonusCoins,
        longestStreak: streak.longestStreak
      };
    }

    const previousXP = user.xp;
    user.xp += earnedXP;
    user.seasonXp = (user.seasonXp || 0) + earnedXP;
    user.coins += earnedCoins;
    user.level = Math.floor(user.xp / 300) + 1;
    user.totalScore = Object.values(user.completedLevels).reduce((acc: number, l: any) => acc + (l.score || 0), 0);
    user.completedLevelsCount = Object.keys(user.completedLevels).length;

    // Evaluate all 5 achievement groups on the server
    const achResult = evaluateServerUserAchievements(user);
    earnedCoins += achResult.bonusCoins;
    earnedXP += achResult.bonusXP;

    saveDatabase(db);
    if (db === prodDb && !isTestDbRequest(req)) {
      void syncProductionUserToSupabase(user);
    }

    res.json({
      success: true,
      user: sanitizeUserForClient(user),
      verifiedResult: {
        stars,
        timeSpent,
        score,
        accuracy: normalizedAccuracy,
        wordsFoundCount: wordsCount,
        hintsUsedCount: hintsUsed,
        doubleBoostApplied: session.doubleBoostActive
      },
      earnedXP,
      earnedCoins,
      newlyUnlockedAchievements: achResult.newlyUnlocked,
      completedDailyTasks,
      streakReward,
      levelUp: user.level > Math.floor(previousXP / 300) + 1
    });
  } finally {
    releaseAtomicLock(lockKey);
  }
});

// ============================================================================
// SERVER-VALIDATED HINTS & STORE ECONOMY (TASK 6)
// ============================================================================
app.post('/api/hints/use', (req, res) => {
  const { username, hintType, sessionId, alreadyRevealedCells, requestId } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanUser = verified.username;
  const user = verified.user;
  const lockKey = `hints-use:${cleanUser}`;
  if (!acquireAtomicLock(lockKey)) {
    return res.status(409).json({
      error: 'طلب التلميح قيد المعالجة حالياً',
      duplicate: true,
      user: sanitizeUserForClient(user)
    });
  }

  try {
    if (checkAndRecordRequestId(user, requestId)) {
      return res.status(409).json({
        error: 'تم تنفيذ طلب التلميح هذا مسبقاً',
        duplicate: true,
        user: sanitizeUserForClient(user)
      });
    }

    const hintDef = resolveServerHintDefinition(hintType || 'SINGLE_LETTER');
    if (!hintDef) {
      return res.status(400).json({ error: `نوع التلميح غير صالح: ${String(hintType)}` });
    }
    const selectedType: HintType = hintDef.id;

    const session = sessionId ? activeStageSessions[sessionId] : undefined;
    if (sessionId && session) {
      if (session.username !== cleanUser) {
        return res.status(403).json({ error: 'غير مصرح: لا يمكنك استخدام تلميح في جلسة لاعب آخر' });
      }
      if (session.completed) {
        return res.status(409).json({ error: 'تم إنهاء هذه الجلسة مسبقاً' });
      }
    }

    const clientHints = Number(req.body?.clientHintsRemaining);
    if (
      user.hintsRemaining < hintDef.hintCost &&
      Number.isFinite(clientHints) &&
      clientHints >= hintDef.hintCost &&
      clientHints <= 50
    ) {
      user.hintsRemaining = Math.floor(clientHints);
    }

    let usedFreeHints = false;
    if (user.hintsRemaining >= hintDef.hintCost) {
      user.hintsRemaining -= hintDef.hintCost;
      usedFreeHints = true;
    } else if (user.coins >= hintDef.coinCost) {
      user.coins -= hintDef.coinCost;
    } else {
      return res.status(400).json({
        error: `رصيد التلميحات أو العملات غير كافٍ (يتطلب ${hintDef.hintCost} تلميح أو ${hintDef.coinCost} عملة)`
      });
    }

    let hintEffect: ReturnType<typeof computeServerHintEffect> | undefined;
    if (session && !session.completed) {
      session.hintsUsed += 1;
      hintEffect = computeServerHintEffect({
        hintType: selectedType,
        gridSize: session.gridSize,
        secretPlacements: session.secretPlacements,
        alreadyFoundWords: session.wordsFound,
        alreadyRevealedCells: Array.isArray(alreadyRevealedCells) ? alreadyRevealedCells : []
      });

      if (hintEffect.autoCompletedPlacement) {
        const wp = hintEffect.autoCompletedPlacement;
        if (!session.wordsFound.includes(wp.word)) {
          session.wordsFound.push(wp.word);
        }
      }
    }

    saveDatabase(db);

    res.json({
      success: true,
      hintType: selectedType,
      usedFreeHints,
      hintsRemaining: user.hintsRemaining,
      coins: user.coins,
      user: sanitizeUserForClient(user),
      hintEffect,
      allWordsCompleted: session ? session.wordsFound.length >= session.secretPlacements.length : false
    });
  } finally {
    releaseAtomicLock(lockKey);
  }
});

const ALLOWED_HINT_PACKAGES: Record<number, number> = {
  1: 25,
  3: 50,
  5: 100,
  15: 250
};

app.post('/api/hints/buy', (req, res) => {
  const { username, amount, requestId } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanUser = verified.username;
  const user = verified.user;
  const lockKey = `hints-buy:${cleanUser}`;
  if (!acquireAtomicLock(lockKey)) {
    return res.status(409).json({
      error: 'عملية الشراء قيد المعالجة حالياً',
      duplicate: true,
      user: sanitizeUserForClient(user)
    });
  }

  try {
    if (checkAndRecordRequestId(user, requestId)) {
      return res.status(409).json({
        error: 'تم تنفيذ عملية الشراء هذه مسبقاً',
        duplicate: true,
        user: sanitizeUserForClient(user)
      });
    }

    const parsedAmount = Number(amount);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'كمية التلميحات غير صالحة' });
    }

    // Strictly enforce server-side package pricing (ignores client-supplied `cost`!)
    const serverCost = ALLOWED_HINT_PACKAGES[parsedAmount] ?? parsedAmount * 25;

    if (user.coins < serverCost) {
      return res.status(400).json({ error: 'العملات غير كافية لشراء التلميحات' });
    }

    user.coins -= serverCost;
    user.hintsRemaining += parsedAmount;
    saveDatabase(db);

    res.json({
      success: true,
      hintsRemaining: user.hintsRemaining,
      coins: user.coins,
      costPaid: serverCost,
      user: sanitizeUserForClient(user)
    });
  } finally {
    releaseAtomicLock(lockKey);
  }
});

app.post('/api/store/action', (req, res) => {
  const { username, action, payload, requestId } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanUser = verified.username;
  const user = verified.user;
  const lockKey = `store-action:${cleanUser}`;
  if (!acquireAtomicLock(lockKey)) {
    return res.status(409).json({
      error: 'عملية المتجر قيد المعالجة حالياً',
      duplicate: true,
      user: sanitizeUserForClient(user)
    });
  }

  try {
    if (checkAndRecordRequestId(user, requestId)) {
      return res.status(409).json({
        error: 'تم تنفيذ طلب المتجر هذا مسبقاً',
        duplicate: true,
        user: sanitizeUserForClient(user)
      });
    }

    const today = getKuwaitDateKey();
    const result = executeServerStoreAction(user, action, payload || {}, today);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error, user: sanitizeUserForClient(user) });
    }

    saveDatabase(db);
    res.json({
      success: true,
      message: result.message,
      mysteryReward: result.mysteryReward,
      user: sanitizeUserForClient(user)
    });
  } finally {
    releaseAtomicLock(lockKey);
  }
});

// ============================================================================
// UNIFIED DAILY CHALLENGE SYSTEM («تحدي فتّشها اليومي الموحد» - TASK 8C)
// 8 Words, 90 Seconds, 10x10 Grid, Asia/Kuwait Timezone, 1 Attempt/Day
// ============================================================================
function hasClientDateManipulation(req: express.Request): boolean {
  const qOffset = req.query?.simOffsetDays;
  const bOffset = req.body?.simOffsetDays;
  const clientDate = req.query?.dateKey || req.body?.dateKey || req.body?.clientDate;
  if (qOffset !== undefined && Number(qOffset) !== 0) return true;
  if (bOffset !== undefined && Number(bOffset) !== 0) return true;
  if (clientDate !== undefined) return true;
  return false;
}

function getAuthoritativeDailyNowMs(req: express.Request): number {
  // Only in isolated test DB mode can an internal test header simulate Kuwait midnight transition
  if (isTestDbRequest(req) && req.headers['x-test-kuwait-now-ms']) {
    const parsed = Number(req.headers['x-test-kuwait-now-ms']);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return Date.now();
}

app.get('/api/unified-daily/today', (req, res) => {
  if (hasClientDateManipulation(req)) {
    return res.status(400).json({
      error: 'ممنوع التلاعب بتاريخ التحدي اليومي؛ الخادم يعتمد توقيت الكويت الرسمي فقط'
    });
  }

  const tokenPayload = verifyAuthToken(extractTokenFromRequest(req));
  const rawUser = tokenPayload?.username || (req.query.username as string) || (req.headers['x-user-id'] as string) || 'ahmad_kwt';
  const cleanUser = normalizeUsername(rawUser) || 'ahmad_kwt';
  const nowMs = getAuthoritativeDailyNowMs(req);

  if (db.users[cleanUser]) {
    ensureUserFields(db.users[cleanUser]);
  }

  const payload = buildUnifiedDailyPayloadForUser(db, cleanUser, nowMs);
  saveDatabase(db);
  res.json({
    success: true,
    challenge: payload,
    user: db.users[cleanUser] ? sanitizeUserForClient(db.users[cleanUser]) : undefined
  });
});

app.post('/api/unified-daily/start', (req, res) => {
  if (hasClientDateManipulation(req)) {
    return res.status(400).json({
      error: 'ممنوع التلاعب بتاريخ التحدي اليومي؛ الخادم يعتمد توقيت الكويت الرسمي فقط'
    });
  }

  const { username } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanUser = verified.username;
  const user = verified.user;
  const nowMs = getAuthoritativeDailyNowMs(req);
  const dateKey = getKuwaitDateKey(nowMs);
  const weekKey = getKuwaitWeekKey(dateKey);

  const lockKey = `daily-start:${cleanUser}:${dateKey}`;
  if (!acquireAtomicLock(lockKey)) {
    return res.status(409).json({ error: 'طلب بدء التحدي قيد المعالجة حالياً' });
  }

  try {
    if (!db.unifiedDailyAttempts) db.unifiedDailyAttempts = {};
    const attemptKey = `${dateKey}_${cleanUser}`;
    const existing = db.unifiedDailyAttempts[attemptKey];

    // If player already finished or expired today's attempt, block starting a new attempt!
    if (existing && (existing.status === 'COMPLETED' || existing.status === 'EXPIRED')) {
      const payload = buildUnifiedDailyPayloadForUser(db, cleanUser, nowMs);
      return res.status(409).json({
        error: 'لقد استنفدت محاولتك التنافسية اليومية لهذا اليوم. عد غداً في منتصف الليل بتوقيت الكويت!',
        alreadyFinished: true,
        challenge: payload,
        user: sanitizeUserForClient(user)
      });
    }

    // If IN_PROGRESS, resume existing attempt without resetting timer or granting a new attempt!
    if (!existing) {
      const newAttempt: ServerUnifiedDailyAttemptRecord & { isGenuineAttempt?: boolean } = {
        key: attemptKey,
        dateKey,
        weekKey,
        username: cleanUser,
        displayName: user.displayName,
        avatar: user.avatar,
        selectedTitle: user.selectedTitle || 'مستكشف الحروف',
        status: 'IN_PROGRESS',
        startedAt: nowMs,
        completedAt: null,
        elapsedSeconds: 0,
        wordsFound: [],
        hintsUsedCount: 0,
        wrongAttempts: 0,
        revealedCells: [],
        removedDistractorCells: [],
        showWordLengths: false,
        scoreBreakdown: {
          wordsScore: 0,
          speedBonus: 0,
          completionBonus: 0,
          noHintsBonus: 0,
          totalScore: 0,
          earnedCoins: 0,
          earnedXP: 0
        },
        rewardClaimed: false,
        isGenuineAttempt: true
      };
      db.unifiedDailyAttempts[attemptKey] = newAttempt;
    }

    const payload = buildUnifiedDailyPayloadForUser(db, cleanUser, nowMs);
    saveDatabase(db);
    res.json({
      success: true,
      resumed: Boolean(existing),
      challenge: payload,
      user: sanitizeUserForClient(user)
    });
  } finally {
    releaseAtomicLock(lockKey);
  }
});

function finalizeUnifiedDailyAttemptOnServer(
  dbState: DatabaseState,
  user: UserRecord,
  attempt: ServerUnifiedDailyAttemptRecord,
  nowMs: number
) {
  const activeSeason = SEASONAL_CHALLENGE_EVENTS.find(s => s.active);
  const seasonalMultiplier = activeSeason ? activeSeason.bonusMultiplier : 1;

  const elapsed = attempt.startedAt
    ? Math.max(1, Math.min(UNIFIED_DAILY_DURATION_SECONDS, Math.floor((nowMs - attempt.startedAt) / 1000)))
    : UNIFIED_DAILY_DURATION_SECONDS;
  const remaining = Math.max(0, UNIFIED_DAILY_DURATION_SECONDS - elapsed);

  const allFound = attempt.wordsFound.length >= UNIFIED_DAILY_WORD_COUNT;
  attempt.status = allFound ? 'COMPLETED' : 'EXPIRED';
  attempt.completedAt = nowMs;
  attempt.elapsedSeconds = allFound ? elapsed : UNIFIED_DAILY_DURATION_SECONDS;
  (attempt as ServerUnifiedDailyAttemptRecord & { isGenuineAttempt?: boolean }).isGenuineAttempt = true;

  attempt.scoreBreakdown = calculateDailyChallengeScore({
    wordsFoundCount: attempt.wordsFound.length,
    totalWords: UNIFIED_DAILY_WORD_COUNT,
    remainingSeconds: allFound ? remaining : 0,
    hintsUsedCount: attempt.hintsUsedCount,
    seasonalMultiplier
  });

  // One-time atomic reward & streak update
  if (!attempt.rewardClaimed) {
    attempt.rewardClaimed = true;
    user.coins += attempt.scoreBreakdown.earnedCoins;
    user.xp += attempt.scoreBreakdown.earnedXP;
    user.seasonXp = (user.seasonXp || 0) + attempt.scoreBreakdown.earnedXP;
    user.level = Math.floor(user.xp / 300) + 1;
    user.totalWordsFound = (user.totalWordsFound || 0) + attempt.wordsFound.length;

    if (!dbState.unifiedDailyStreaks) dbState.unifiedDailyStreaks = {};
    const streak = dbState.unifiedDailyStreaks[user.username] || {
      currentStreak: 0,
      longestStreak: 0,
      lastCompletedDate: null,
      completedDates: [],
      milestonesClaimed: []
    };

    const yesterdayKey = getKuwaitOffsetDateKey(-1, nowMs);
    if (streak.lastCompletedDate !== attempt.dateKey) {
      if (streak.lastCompletedDate === yesterdayKey) {
        streak.currentStreak += 1;
      } else {
        streak.currentStreak = 1;
      }
      streak.longestStreak = Math.max(streak.longestStreak || 0, streak.currentStreak);
      streak.lastCompletedDate = attempt.dateKey;
      if (!streak.completedDates.includes(attempt.dateKey)) {
        streak.completedDates.push(attempt.dateKey);
      }
    }
    dbState.unifiedDailyStreaks[user.username] = streak;
    evaluateServerUserAchievements(user);
  }
}

app.post('/api/unified-daily/verify-word', (req, res) => {
  if (hasClientDateManipulation(req)) {
    return res.status(400).json({
      error: 'ممنوع التلاعب بتاريخ التحدي اليومي؛ الخادم يعتمد توقيت الكويت الرسمي فقط'
    });
  }

  const { username, word, cells } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanUser = verified.username;
  const user = verified.user;
  const nowMs = getAuthoritativeDailyNowMs(req);
  const dateKey = getKuwaitDateKey(nowMs);

  const attemptKey = `${dateKey}_${cleanUser}`;
  const attempt = db.unifiedDailyAttempts?.[attemptKey];
  if (!attempt || attempt.status !== 'IN_PROGRESS') {
    return res.status(400).json({ error: 'لا توجد محاولة تحدٍ يومي نشطة حالياً' });
  }

  // Check if 90s time limit already expired on the server
  const elapsedNow = attempt.startedAt ? Math.floor((nowMs - attempt.startedAt) / 1000) : 0;
  if (elapsedNow >= UNIFIED_DAILY_DURATION_SECONDS) {
    finalizeUnifiedDailyAttemptOnServer(db, user, attempt, nowMs);
    const payload = buildUnifiedDailyPayloadForUser(db, cleanUser, nowMs);
    saveDatabase(db);
    return res.status(400).json({
      error: 'انتهى الوقت المحدد للتحدي اليومي (90 ثانية)',
      expired: true,
      challenge: payload,
      user: sanitizeUserForClient(user)
    });
  }

  const board = generateDeterministicDailyBoard(dateKey);
  const matched = verifyWordOnServerBoard(board.grid, board.wordPlacements, word, cells);
  if (!matched) {
    attempt.wrongAttempts += 1;
    saveDatabase(db);
    return res.json({
      success: false,
      valid: false,
      wrongAttempts: attempt.wrongAttempts
    });
  }

  if (!attempt.wordsFound.includes(matched.word)) {
    attempt.wordsFound.push(matched.word);
  }

  // If all 8 words are found, automatically finalize and award on the server!
  let completedNow = false;
  if (attempt.wordsFound.length >= UNIFIED_DAILY_WORD_COUNT) {
    finalizeUnifiedDailyAttemptOnServer(db, user, attempt, nowMs);
    completedNow = true;
  }

  const payload = buildUnifiedDailyPayloadForUser(db, cleanUser, nowMs);
  saveDatabase(db);

  res.json({
    success: true,
    valid: true,
    word: matched.word,
    displayWord: matched.displayWord,
    cells: matched.cells,
    color: matched.color,
    direction: matched.direction,
    completedNow,
    challenge: payload,
    user: sanitizeUserForClient(user)
  });
});

app.post('/api/unified-daily/use-hint', (req, res) => {
  if (hasClientDateManipulation(req)) {
    return res.status(400).json({
      error: 'ممنوع التلاعب بتاريخ التحدي اليومي؛ الخادم يعتمد توقيت الكويت الرسمي فقط'
    });
  }

  const { username, hintType, requestId } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanUser = verified.username;
  const user = verified.user;
  const nowMs = getAuthoritativeDailyNowMs(req);
  const dateKey = getKuwaitDateKey(nowMs);

  const lockKey = `daily-hint:${cleanUser}:${dateKey}`;
  if (!acquireAtomicLock(lockKey)) {
    return res.status(409).json({ error: 'طلب التلميح قيد المعالجة حالياً', duplicate: true });
  }

  try {
    if (checkAndRecordRequestId(user, requestId)) {
      return res.status(409).json({
        error: 'تم تنفيذ طلب التلميح مسبقاً',
        duplicate: true,
        user: sanitizeUserForClient(user)
      });
    }

    const attemptKey = `${dateKey}_${cleanUser}`;
    const attempt = db.unifiedDailyAttempts?.[attemptKey];
    if (!attempt || attempt.status !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'لا توجد محاولة تحدٍ يومي نشطة حالياً' });
    }

    const hintDef = resolveServerHintDefinition(hintType || 'SINGLE_LETTER');
    if (!hintDef) {
      return res.status(400).json({ error: 'نوع التلميح غير صالح' });
    }
    const selectedType: HintType = hintDef.id;

    if (user.hintsRemaining >= hintDef.hintCost) {
      user.hintsRemaining -= hintDef.hintCost;
    } else if (user.coins >= hintDef.coinCost) {
      user.coins -= hintDef.coinCost;
    } else {
      return res.status(400).json({ error: 'رصيد التلميحات أو العملات غير كافٍ' });
    }

    const board = generateDeterministicDailyBoard(dateKey);
    attempt.hintsUsedCount += 1;

    const effect = computeServerHintEffect({
      hintType: selectedType,
      gridSize: board.gridSize,
      secretPlacements: board.wordPlacements,
      alreadyFoundWords: attempt.wordsFound,
      alreadyRevealedCells: attempt.revealedCells || []
    });

    attempt.revealedCells = effect.revealedCells;
    if (effect.removedDistractorCells.length > 0) {
      attempt.removedDistractorCells = effect.removedDistractorCells;
    }
    if (effect.showWordLengths) {
      attempt.showWordLengths = true;
    }
    if (effect.autoCompletedPlacement && !attempt.wordsFound.includes(effect.autoCompletedPlacement.word)) {
      attempt.wordsFound.push(effect.autoCompletedPlacement.word);
    }

    let completedNow = false;
    if (attempt.wordsFound.length >= UNIFIED_DAILY_WORD_COUNT) {
      finalizeUnifiedDailyAttemptOnServer(db, user, attempt, nowMs);
      completedNow = true;
    }

    const payload = buildUnifiedDailyPayloadForUser(db, cleanUser, nowMs);
    saveDatabase(db);

    res.json({
      success: true,
      hintEffect: effect,
      completedNow,
      challenge: payload,
      user: sanitizeUserForClient(user)
    });
  } finally {
    releaseAtomicLock(lockKey);
  }
});

app.post('/api/unified-daily/finish', (req, res) => {
  if (hasClientDateManipulation(req)) {
    return res.status(400).json({
      error: 'ممنوع التلاعب بتاريخ التحدي اليومي؛ الخادم يعتمد توقيت الكويت الرسمي فقط'
    });
  }

  const { username, requestId } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanUser = verified.username;
  const user = verified.user;
  const nowMs = getAuthoritativeDailyNowMs(req);
  const dateKey = getKuwaitDateKey(nowMs);

  const lockKey = `daily-finish:${cleanUser}:${dateKey}`;
  if (!acquireAtomicLock(lockKey)) {
    return res.status(409).json({
      error: 'يتم معالجة إنهاء التحدي اليومي حالياً',
      duplicate: true,
      user: sanitizeUserForClient(user)
    });
  }

  try {
    if (checkAndRecordRequestId(user, requestId)) {
      const payload = buildUnifiedDailyPayloadForUser(db, cleanUser, nowMs);
      return res.status(409).json({
        error: 'تم اعتماد نتيجة التحدي اليومي وصرف مكافأته مسبقاً',
        duplicate: true,
        challenge: payload,
        user: sanitizeUserForClient(user)
      });
    }

    const attemptKey = `${dateKey}_${cleanUser}`;
    const attempt = db.unifiedDailyAttempts?.[attemptKey];
    if (!attempt) {
      return res.status(400).json({ error: 'لم تبدأ محاولة التحدي اليومي بعد' });
    }

    if (attempt.rewardClaimed) {
      const payload = buildUnifiedDailyPayloadForUser(db, cleanUser, nowMs);
      return res.status(409).json({
        error: 'تم اعتماد نتيجة التحدي اليومي وصرف مكافأته مسبقاً ولا يمكن تكرارها',
        duplicate: true,
        challenge: payload,
        user: sanitizeUserForClient(user)
      });
    }

    finalizeUnifiedDailyAttemptOnServer(db, user, attempt, nowMs);
    const payload = buildUnifiedDailyPayloadForUser(db, cleanUser, nowMs);
    saveDatabase(db);

    res.json({
      success: true,
      challenge: payload,
      scoreBreakdown: attempt.scoreBreakdown,
      user: sanitizeUserForClient(user)
    });
  } finally {
    releaseAtomicLock(lockKey);
  }
});

app.post('/api/unified-daily/claim-streak-milestone', (req, res) => {
  const { username, milestoneDays, requestId } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanUser = verified.username;
  const user = verified.user;
  const lockKey = `daily-milestone:${cleanUser}`;
  if (!acquireAtomicLock(lockKey)) {
    return res.status(409).json({ error: 'طلب استلام الإنجاز قيد المعالجة', duplicate: true });
  }

  try {
    if (checkAndRecordRequestId(user, requestId)) {
      return res.status(409).json({
        error: 'تمت معالجة هذا الطلب مسبقاً',
        duplicate: true,
        user: sanitizeUserForClient(user)
      });
    }

    const days = Number(milestoneDays);
    const rewardDef = STREAK_MILESTONE_REWARDS[days];
    if (!rewardDef) {
      return res.status(400).json({ error: 'إنجاز السلسلة غير صالح' });
    }

    const streak = db.unifiedDailyStreaks?.[cleanUser];
    const bestStreak = Math.max(streak?.currentStreak || 0, streak?.longestStreak || 0);
    if (!streak || bestStreak < days) {
      return res.status(400).json({ error: `لم تصل سلسلتك إلى ${days} أيام بعد` });
    }

    if (!Array.isArray(streak.milestonesClaimed)) {
      streak.milestonesClaimed = [];
    }
    if (streak.milestonesClaimed.includes(days)) {
      return res.status(409).json({
        error: 'تم استلام مكافأة هذا الإنجاز مسبقاً',
        duplicate: true,
        user: sanitizeUserForClient(user)
      });
    }

    streak.milestonesClaimed.push(days);
    user.coins += rewardDef.coins;
    user.xp += rewardDef.xp;
    user.seasonXp = (user.seasonXp || 0) + rewardDef.xp;
    user.hintsRemaining += rewardDef.hints;
    user.level = Math.floor(user.xp / 300) + 1;
    if (rewardDef.title && !user.unlockedTitles?.includes(rewardDef.title)) {
      user.unlockedTitles!.push(rewardDef.title);
      user.selectedTitle = rewardDef.title;
    }

    const nowMs = getAuthoritativeDailyNowMs(req);
    const payload = buildUnifiedDailyPayloadForUser(db, cleanUser, nowMs);
    saveDatabase(db);
    res.json({
      success: true,
      reward: rewardDef,
      challenge: payload,
      user: sanitizeUserForClient(user)
    });
  } finally {
    releaseAtomicLock(lockKey);
  }
});

app.get('/api/unified-daily/leaderboard', (req, res) => {
  if (hasClientDateManipulation(req)) {
    return res.status(400).json({
      error: 'ممنوع التلاعب بتاريخ التحدي اليومي؛ الخادم يعتمد توقيت الكويت الرسمي فقط'
    });
  }
  const rawUser = (req.query.username as string) || 'ahmad_kwt';
  const nowMs = getAuthoritativeDailyNowMs(req);
  const payload = buildUnifiedDailyPayloadForUser(db, normalizeUsername(rawUser) || 'ahmad_kwt', nowMs);
  res.json({
    success: true,
    dateKey: payload.dateKey,
    weekKey: payload.weekKey,
    dailyLeaderboard: payload.dailyLeaderboard,
    weeklyLeaderboard: payload.weeklyLeaderboard
  });
});

app.get('/api/leaderboard', (req, res) => {
  res.json({ success: true, leaderboard: db.leaderboard.slice(0, 20) });
});

app.get('/api/online/rooms', (req, res) => {
  const tokenPayload = verifyAuthToken(extractTokenFromRequest(req));
  res.json({ success: true, rooms: getPublicRoomsSummary(tokenPayload?.username) });
});

// ============================================================================
// FRIEND SYSTEM & DIRECT PRIVATE ROOM INVITE ENDPOINTS
// ============================================================================
app.get('/api/friends', (req, res) => {
  const rawUser = (req.query.username as string) || (req.headers['x-user-id'] as string);
  const verified = requireVerifiedRequestUser(req, res, rawUser);
  if (!verified) return;

  const payload = getFriendsPayloadForUser(verified.username);
  res.json({
    success: true,
    ...payload
  });
});

app.get('/api/friends/search', (req, res) => {
  const q = normalizeUsername((req.query.q as string) || '');
  const tokenPayload = verifyAuthToken(extractTokenFromRequest(req));
  const rawUser = tokenPayload?.username || (req.query.username as string) || (req.headers['x-user-id'] as string) || 'ahmad_kwt';
  const cleanUser = normalizeUsername(rawUser) || 'ahmad_kwt';
  const currentUser = db.users[cleanUser];
  const friendSet = new Set((currentUser?.friends || []).map(f => normalizeUsername(f)));
  const blockedSet = getBlockedSetForUser(cleanUser);

  const results = Object.values(db.users)
    .filter(u => {
      const uClean = normalizeUsername(u.username);
      if (uClean === cleanUser || blockedSet.has(uClean)) return false;
      if (!q) return true;
      return (
        uClean.includes(q) ||
        u.displayName.toLowerCase().includes(q)
      );
    })
    .map(u => ({
      ...buildFriendSummary(u),
      isFriend: friendSet.has(normalizeUsername(u.username))
    }))
    .slice(0, 15);

  res.json({ success: true, results });
});

app.post('/api/friends/add', (req, res) => {
  const { username, friendUsername } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanUser = verified.username;
  const user = verified.user;
  const targetClean = normalizeUsername(friendUsername);

  if (!targetClean) {
    return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم الفريد للصديق' });
  }

  if (targetClean === cleanUser) {
    return res.status(400).json({ error: 'لا يمكنك إضافة نفسك كصديق' });
  }

  const targetUser = db.users[targetClean];
  if (!targetUser) {
    return res.status(404).json({
      error: `لم يتم العثور على لاعب باسم المستخدم «@${targetClean}». تأكد من كتابة المعرف بشكل صحيح (مثال: dana_q8 أو fahad_q8)`
    });
  }

  if (isUserBlockedEitherWay(cleanUser, targetClean)) {
    return res.status(403).json({ error: 'لا يمكن إضافة هذا اللاعب لوجود حظر بين الحسابين' });
  }

  if (!Array.isArray(user.friends)) user.friends = [];
  if (!Array.isArray(targetUser.friends)) targetUser.friends = [];

  if (user.friends.some((f: string) => normalizeUsername(f) === targetClean)) {
    return res.status(400).json({ error: `اللاعب «${targetUser.displayName}» مضاف بالفعل في قائمة أصدقائك` });
  }

  user.friends.push(targetUser.username);
  if (!targetUser.friends.some((f: string) => normalizeUsername(f) === cleanUser)) {
    targetUser.friends.push(user.username);
  }

  saveDatabase(db);
  broadcastPresenceUpdate();

  const payload = getFriendsPayloadForUser(cleanUser);
  res.json({
    success: true,
    addedFriend: buildFriendSummary(targetUser),
    user: sanitizeUserForClient(user),
    ...payload
  });
});

app.post('/api/friends/remove', (req, res) => {
  const { username, friendUsername } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanUser = verified.username;
  const user = verified.user;
  const targetClean = normalizeUsername(friendUsername);

  user.friends = (user.friends || []).filter((f: string) => normalizeUsername(f) !== targetClean);
  const targetUser = db.users[targetClean];
  if (targetUser && Array.isArray(targetUser.friends)) {
    targetUser.friends = targetUser.friends.filter((f: string) => normalizeUsername(f) !== cleanUser);
  }

  saveDatabase(db);
  broadcastPresenceUpdate();

  const payload = getFriendsPayloadForUser(cleanUser);
  res.json({
    success: true,
    user: sanitizeUserForClient(user),
    ...payload
  });
});

app.post('/api/friends/invite', (req, res) => {
  const { fromUsername, toUsername, roomCode, roomName, categoryId, stagesCount } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, fromUsername);
  if (!verified) return;

  const senderClean = verified.username;
  const senderUser = verified.user;
  const targetClean = normalizeUsername(toUsername);
  const cleanCode = (roomCode || '').trim().toUpperCase();

  if (!targetClean || !cleanCode) {
    return res.status(400).json({ error: 'بيانات الدعوة غير مكتملة' });
  }

  const targetUser = db.users[targetClean];
  if (!targetUser) {
    return res.status(404).json({ error: 'اللاعب المدعو غير موجود' });
  }

  if (isUserBlockedEitherWay(senderClean, targetClean)) {
    return res.status(403).json({ error: 'لا يمكن إرسال دعوة لهذا اللاعب لوجود حظر بين الحسابين' });
  }

  const room = activeRooms[cleanCode];
  if (room) {
    const isSenderInRoom = Object.values(room.players).some(
      p => normalizeUsername(p.username) === senderClean
    );
    if (!isSenderInRoom) {
      return res.status(403).json({ error: 'لا يمكنك إرسال دعوة لغرفة لست عضواً فيها' });
    }
  }

  const invite: ServerRoomInvite = {
    id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    fromUsername: senderUser.username,
    fromDisplayName: senderUser.displayName || 'صديق',
    fromAvatar: senderUser.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
    toUsername: targetUser.username,
    roomCode: cleanCode,
    roomName: roomName || room?.roomName || `غرفة ${senderUser.displayName || 'خاصة'}`,
    categoryId: categoryId || room?.categoryId || 'kuwait_heritage',
    stagesCount: Number(stagesCount) || room?.stagesCount || 50,
    createdAt: Date.now()
  };

  if (!pendingRoomInvites[targetClean]) {
    pendingRoomInvites[targetClean] = [];
  }
  // Avoid duplicate invites for same roomCode
  pendingRoomInvites[targetClean] = [
    invite,
    ...pendingRoomInvites[targetClean].filter(i => i.roomCode !== cleanCode)
  ].slice(0, 10);

  // Push real-time WebSocket notification to all active sockets of targetClean
  const targetSockets = userPresenceSockets.get(targetClean);
  let deliveredLive = false;
  if (targetSockets) {
    const wsMsg = JSON.stringify({
      type: 'ROOM_INVITE_RECEIVED',
      payload: { invite }
    });
    targetSockets.forEach(s => {
      if (s.readyState === WebSocket.OPEN) {
        s.send(wsMsg);
        deliveredLive = true;
      }
    });
  }

  res.json({
    success: true,
    invite,
    deliveredLive
  });
});

app.post('/api/friends/invites/dismiss', (req, res) => {
  const { username, inviteId, roomCode } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanUser = verified.username;
  if (pendingRoomInvites[cleanUser]) {
    pendingRoomInvites[cleanUser] = pendingRoomInvites[cleanUser].filter(
      inv => inv.id !== inviteId && inv.roomCode !== roomCode
    );
  }
  res.json({
    success: true,
    pendingInvites: pendingRoomInvites[cleanUser] || []
  });
});

// Database schema endpoint for documentation
app.get('/api/schema', (req, res) => {
  const sql = `
-- Fatteshha Database Schema (PostgreSQL / Supabase / SQLite Compatible)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar TEXT,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  coins INTEGER DEFAULT 100,
  hints_remaining INTEGER DEFAULT 5,
  multiplayer_wins INTEGER DEFAULT 0,
  multiplayer_losses INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS completed_levels (
  user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  level_number INTEGER NOT NULL,
  stars INTEGER NOT NULL,
  best_time REAL NOT NULL,
  score INTEGER NOT NULL,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, category_id, level_number),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS achievements (
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, achievement_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS online_matches (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  category_id TEXT NOT NULL,
  level_number INTEGER NOT NULL,
  winner_id TEXT,
  duration_seconds REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
  `;
  res.type('text/plain').send(sql);
});

// Create HTTP server for Express and WebSockets
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcastToRoom(roomCode: string, payload: unknown, excludePlayerId?: string) {
  const sockets = roomSockets[roomCode];
  if (!sockets) return;

  const msg = JSON.stringify(payload);
  sockets.forEach((ws, pId) => {
    if (excludePlayerId && pId === excludePlayerId) return;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateServerRoomCode(_prefix = 'KWT'): string {
  // High-entropy 5-character alphanumeric server-only room code (32^5 = 33.5M combinations)
  for (let attempt = 0; attempt < 500; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) {
      const idx = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
      code += ROOM_CODE_ALPHABET[idx];
    }
    if (!activeRooms[code]) {
      return code;
    }
  }
  return `K${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

// ============================================================================
// REST API ENDPOINTS FOR MULTIPLAYER ROOMS (FAIL-SAFE FOR IFRAME & WS TIMEOUTS)
// ============================================================================
app.get('/api/rooms/public', (req, res) => {
  const tokenPayload = verifyAuthToken(extractTokenFromRequest(req));
  res.json({ success: true, rooms: getPublicRoomsSummary(tokenPayload?.username) });
});

app.get('/api/rooms/:code', (req, res) => {
  const cleanCode = (req.params.code || '').trim().toUpperCase();
  const room = activeRooms[cleanCode];
  if (!room) {
    return res.status(404).json({ success: false, message: 'الغرفة غير موجودة' });
  }
  res.json({ success: true, room: sanitizeRoomForClient(room) });
});

app.get('/api/rooms/active-for-player/:username', (req, res) => {
  const cleanUser = normalizeUsername(req.params.username);
  const playerId = (req.query.playerId as string) || '';
  const foundRoom = Object.values(activeRooms).find(r =>
    Object.values(r.players).some(
      p => (playerId && p.id === playerId) || (cleanUser && normalizeUsername(p.username) === cleanUser)
    )
  );
  if (!foundRoom) {
    return res.json({ success: true, room: null });
  }
  res.json({ success: true, room: sanitizeRoomForClient(foundRoom) });
});

app.post('/api/rooms/rejoin', (req, res) => {
  const { code, playerId, username } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanCode = (code || '').trim().toUpperCase();
  const cleanUser = verified.username;
  const room = activeRooms[cleanCode];
  if (!room) {
    return res.status(404).json({ success: false, message: 'الغرفة غير موجودة أو انتهت' });
  }

  const matchedPlayer = Object.values(room.players).find(
    p => normalizeUsername(p.username) === cleanUser || (playerId && p.id === playerId && normalizeUsername(p.username) === cleanUser)
  );

  if (!matchedPlayer) {
    return res.status(403).json({ success: false, message: 'لست مسجلاً في هذه المباراة' });
  }

  matchedPlayer.connected = true;
  matchedPlayer.lastPing = Date.now();

  const sanitized = sanitizeRoomForClient(room);
  broadcastToRoom(cleanCode, {
    type: 'PLAYER_RECONNECTED',
    payload: {
      playerId: matchedPlayer.id,
      playerName: matchedPlayer.displayName,
      room: sanitized
    }
  });

  res.json({
    success: true,
    room: sanitized
  });
});

app.post('/api/rooms/create', (req, res) => {
  const { code, roomName, player, categoryId, levelNumber, stagesCount, isPublic, gameMode, difficulty, maxPlayers } = req.body || {};
  if (!player || !player.id) {
    return res.status(400).json({ success: false, message: 'بيانات اللاعب مفقودة أو غير صالحة' });
  }

  const verified = requireVerifiedRequestUser(req, res, player.username);
  if (!verified) return;

  if (typeof roomName === 'string' && roomName.trim()) {
    const modCheck = checkTextModeration(roomName, 'اسم الغرفة');
    if (!modCheck.allowed) {
      return res.status(400).json({ success: false, error: modCheck.reason, message: modCheck.reason });
    }
  }

  const requestedMode = gameMode === 'SPEED_REVEAL_20S' ? 'SPEED_REVEAL_20S' : 'WORD_RACE';

  // Reject any attempt to supply a duplicate or custom room code from the client
  if (code !== undefined && code !== null && String(code).trim() !== '') {
    const requestedCode = String(code).trim().toUpperCase();
    if (activeRooms[requestedCode]) {
      return res.status(409).json({
        success: false,
        error: 'رمز الغرفة مستخدم بالفعل ولا يمكن الكتابة فوق غرفة قائمة',
        message: 'رمز الغرفة مستخدم بالفعل ولا يمكن الكتابة فوق غرفة قائمة'
      });
    }
    return res.status(400).json({
      success: false,
      error: 'يتم توليد رمز الغرفة حصرياً من الخادم ولا يُقبل رمز مخصص من العميل',
      message: 'يتم توليد رمز الغرفة حصرياً من الخادم ولا يُقبل رمز مخصص من العميل'
    });
  }

  const roomCode = generateServerRoomCode(isPublic ? 'PUB' : 'KWT');
  const cleanName = (roomName || `غرفة ${verified.user.displayName?.split(' ')[0] || 'أحمد'}`).trim();
  const resolvedDifficulty = normalizeOnlineDifficulty(difficulty);
  const diffCfg = getOnlineDifficultyConfig(resolvedDifficulty);
  const resolvedMaxPlayers = normalizeMaxPlayers(maxPlayers);

  activeRooms[roomCode] = {
    code: roomCode,
    roomName: cleanName,
    hostId: player.id,
    isPublic: Boolean(isPublic),
    maxPlayers: resolvedMaxPlayers,
    gameMode: requestedMode,
    difficulty: resolvedDifficulty,
    usedWords: [],
    speedTurnSeconds: requestedMode === 'SPEED_REVEAL_20S' ? 20 : undefined,
    roundNumber: 1,
    stagesCount: normalizeStagesCount(stagesCount),
    seriesCompleted: false,
    categoryId: categoryId || 'kuwait_heritage',
    levelNumber: Number(levelNumber) || 1,
    gridSize: diffCfg.gridSize,
    words: [],
    grid: [],
    wordPlacements: [],
    players: {
      [player.id]: {
        ...player,
        username: verified.username,
        displayName: player.displayName || verified.user.displayName,
        isHost: true,
        score: 0,
        totalScore: 0,
        wordsFound: [],
        streak: 0,
        roundWins: 0,
        color: ONLINE_PLAYER_COLORS[0],
        isReady: true,
        connected: true,
        lastPing: Date.now()
      }
    },
    state: 'WAITING',
    createdAt: Date.now(),
    chatMessages: []
  };

  if (!roomSockets[roomCode]) {
    roomSockets[roomCode] = new Map();
  }

  broadcastPublicRooms();
  broadcastPresenceUpdate();

  res.json({
    success: true,
    room: sanitizeRoomForClient(activeRooms[roomCode])
  });
});

app.post('/api/rooms/join', (req, res) => {
  const { code, player } = req.body || {};
  if (!player || !player.id) {
    return res.status(400).json({ success: false, message: 'بيانات اللاعب مفقودة أو غير صالحة' });
  }

  const verified = requireVerifiedRequestUser(req, res, player.username);
  if (!verified) return;

  const cleanCode = (code || '').trim().toUpperCase();
  const room = activeRooms[cleanCode];

  if (!room) {
    return res.status(404).json({
      success: false,
      message: `الغرفة ذات الرمز (${cleanCode}) غير متوفرة حالياً أو انتهت.`
    });
  }

  // Allow existing player (by id or verified username) to rejoin even if state === 'PLAYING'
  const existingByUsername = Object.values(room.players).find(
    p => p.id === player.id || normalizeUsername(p.username) === verified.username
  );
  const targetPlayerId = existingByUsername ? existingByUsername.id : player.id;

  if (room.state !== 'WAITING' && !room.players[targetPlayerId]) {
    return res.status(400).json({
      success: false,
      message: 'المباراة بدأت بالفعل في هذه الغرفة ولا يمكن الانضمام الآن'
    });
  }

  if (!room.players[targetPlayerId]) {
    const blockedConflict = Object.values(room.players).some(p => isUserBlockedEitherWay(verified.username, p.username));
    if (blockedConflict) {
      return res.status(403).json({
        success: false,
        message: 'لا يمكن الانضمام إلى هذه الغرفة لوجود حظر بين اللاعبين'
      });
    }
  }

  const isHost = room.hostId === targetPlayerId;
  const maxAllowed = normalizeMaxPlayers(room.maxPlayers);
  const existingCount = Object.keys(room.players).length;
  if (existingCount >= maxAllowed && !room.players[targetPlayerId]) {
    return res.status(400).json({
      success: false,
      message: `الغرفة ممتلئة باللاعبين (الحد الأقصى ${maxAllowed} لاعبين)`
    });
  }

  const baseName = player.displayName || verified.user.displayName;
  const otherNames = new Set(
    Object.values(room.players)
      .filter(p => p.id !== targetPlayerId)
      .map(p => p.displayName)
  );
  let finalDisplayName = room.players[targetPlayerId]?.displayName || baseName;
  if (!room.players[targetPlayerId] && otherNames.has(baseName)) {
    finalDisplayName = `${baseName} (${existingCount + 1})`;
  }

  const seatColor = assignRoomPlayerColor(room, targetPlayerId);

  room.players[targetPlayerId] = {
    ...player,
    id: targetPlayerId,
    username: verified.username,
    displayName: finalDisplayName,
    isHost,
    score: room.players[targetPlayerId]?.score || 0,
    totalScore: room.players[targetPlayerId]?.totalScore ?? room.players[targetPlayerId]?.score ?? 0,
    wordsFound: room.players[targetPlayerId]?.wordsFound || [],
    streak: room.players[targetPlayerId]?.streak || 0,
    roundWins: room.players[targetPlayerId]?.roundWins || 0,
    color: seatColor,
    isReady: true,
    connected: true,
    lastPing: Date.now()
  };

  const sanitized = sanitizeRoomForClient(room);
  broadcastToRoom(cleanCode, {
    type: 'ROOM_UPDATED',
    payload: { room: sanitized }
  });

  broadcastPublicRooms();
  broadcastPresenceUpdate();

  res.json({
    success: true,
    room: sanitized
  });
});

// Pre-seed default room 'KWT55' so entering the default code in Join Room succeeds instantly!
if (!activeRooms['KWT55']) {
  const hostId = 'bot_host_dhari';
  activeRooms['KWT55'] = {
    code: 'KWT55',
    roomName: 'غرفة ديوانية الكويت',
    hostId,
    isPublic: true,
    gameMode: 'WORD_RACE',
    roundNumber: 1,
    stagesCount: 50,
    categoryId: 'kuwait_heritage',
    levelNumber: 1,
    gridSize: 10,
    words: [],
    grid: [],
    wordPlacements: [],
    players: {
      [hostId]: {
        id: hostId,
        username: 'dhari_kwt',
        displayName: 'ضاري المطيري',
        avatar: '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
        isHost: true,
        score: 0,
        wordsFound: [],
        streak: 0,
        roundWins: 0,
        color: '#0ea5e9',
        isReady: true,
        connected: true,
        lastPing: Date.now()
      }
    },
    state: 'WAITING',
    createdAt: Date.now(),
    chatMessages: [
      { sender: 'ضاري المطيري', text: 'أهلاً بك في غرفة الكويت! جاهز للمنافسة؟ 🇰🇼', time: Date.now() }
    ]
  };
}

const roomBotTimers: Record<string, NodeJS.Timeout[]> = {};
const roomSpeedTimers: Record<string, NodeJS.Timeout> = {};
const roomActiveShields: Record<string, Record<string, boolean>> = {};
const SPEED_MODE_TURN_MS = 20_000;

function clearRoomBotTimers(roomCode: string) {
  const list = roomBotTimers[roomCode];
  if (list) {
    list.forEach(t => clearTimeout(t));
    delete roomBotTimers[roomCode];
  }
}

function clearRoomSpeedTimer(roomCode: string) {
  const t = roomSpeedTimers[roomCode];
  if (t) {
    clearInterval(t);
    delete roomSpeedTimers[roomCode];
  }
}

function pickSecretLetterForBeneficiary(
  room: ActiveRoom,
  beneficiaryId: string
): { row: number; col: number; label: string; word: string } | null {
  if (!room.secretRevealedLetters) room.secretRevealedLetters = {};
  const alreadyRevealed = room.secretRevealedLetters[beneficiaryId] || [];
  const revealedKeys = new Set(alreadyRevealed.map(rc => `${rc.row},${rc.col}`));

  const unfoundPlacements = (room.wordPlacements || []).filter(wp => !wp.foundBy);
  const candidates: { row: number; col: number; word: string }[] = [];
  for (const wp of unfoundPlacements) {
    for (const c of wp.cells || []) {
      if (!revealedKeys.has(`${c.row},${c.col}`)) {
        candidates.push({ row: c.row, col: c.col, word: wp.word });
      }
    }
  }
  if (candidates.length === 0) return null;

  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  const cellEntry = {
    row: picked.row,
    col: picked.col,
    label: 'حرف سري 👁️',
    word: picked.word
  };
  room.secretRevealedLetters[beneficiaryId] = [...alreadyRevealed, cellEntry];
  return cellEntry;
}

function evaluateSpeedModeDeadlines(room: ActiveRoom, nowMs = Date.now()) {
  if (room.gameMode !== 'SPEED_REVEAL_20S' || room.state !== 'PLAYING') return;
  if (!room.playerDeadlines) room.playerDeadlines = {};
  const playerIds = Object.keys(room.players || {});
  if (playerIds.length < 2) return;

  for (const pid of playerIds) {
    const deadline = room.playerDeadlines[pid];
    if (!deadline) {
      room.playerDeadlines[pid] = nowMs + SPEED_MODE_TURN_MS;
      continue;
    }
    if (nowMs >= deadline) {
      // Reset timed-out player's 20-second clock
      const newDeadline = nowMs + SPEED_MODE_TURN_MS;
      room.playerDeadlines[pid] = newDeadline;

      // Pick a secret letter ONLY for opposing players (never exposed to the timed-out player!)
      const otherPlayerIds = playerIds.filter(id => id !== pid);
      if (otherPlayerIds.length === 0) continue;

      const sockets = roomSockets[room.code];

      // 1) Notify timed-out player ONLY that their 20s expired (NO revealed cell coordinates/word!)
      const timedOutWs = sockets?.get(pid);
      if (timedOutWs && timedOutWs.readyState === WebSocket.OPEN) {
        timedOutWs.send(
          JSON.stringify({
            type: 'SPEED_TURN_TIMEOUT',
            payload: {
              timedOutPlayerId: pid,
              newDeadline,
              playerDeadlines: { ...room.playerDeadlines }
            }
          })
        );
      }

      // 2) Send a secret revealed letter EXCLUSIVELY to each opposing player
      for (const otherPlayerId of otherPlayerIds) {
        const revealedCell = pickSecretLetterForBeneficiary(room, otherPlayerId);
        const beneficiaryWs = sockets?.get(otherPlayerId);
        if (beneficiaryWs && beneficiaryWs.readyState === WebSocket.OPEN) {
          beneficiaryWs.send(
            JSON.stringify({
              type: 'SECRET_LETTER_REVEALED',
              payload: {
                timedOutPlayerId: pid,
                timedOutPlayerName: room.players[pid]?.displayName || 'الخصم',
                cell: revealedCell,
                playerDeadlines: { ...room.playerDeadlines }
              }
            })
          );
        }
      }
    }
  }
}

function startSpeedModeForRoom(room: ActiveRoom) {
  clearRoomSpeedTimer(room.code);
  if (room.gameMode !== 'SPEED_REVEAL_20S' || room.state !== 'PLAYING') return;

  const now = Date.now();
  room.speedTurnSeconds = 20;
  room.secretRevealedLetters = {};
  room.playerDeadlines = {};
  Object.keys(room.players || {}).forEach(pid => {
    room.playerDeadlines![pid] = now + SPEED_MODE_TURN_MS;
  });

  roomSpeedTimers[room.code] = setInterval(() => {
    const current = activeRooms[room.code];
    if (!current || current.state !== 'PLAYING' || current.gameMode !== 'SPEED_REVEAL_20S') {
      clearRoomSpeedTimer(room.code);
      return;
    }
    evaluateSpeedModeDeadlines(current, Date.now());
  }, 1000);
}

function claimWordInRoom(
  code: string,
  rawWord: string,
  playerId: string,
  ws?: WebSocket,
  cells?: { row?: number; col?: number; r?: number; c?: number }[]
): boolean {
  const room = activeRooms[code];
  if (!room || room.state !== 'PLAYING') return false;
  if (room.seriesCompleted || (room.roundNumber || 1) > (room.stagesCount || 50)) {
    room.seriesCompleted = true;
    room.state = 'FINISHED';
    return false;
  }

  // Verify player is actually a member of this room
  const claimingPlayer = room.players[playerId];
  if (!claimingPlayer) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          payload: { code: 'NOT_IN_ROOM', message: 'غير مصرح: لست عضواً في هذه الغرفة' }
        })
      );
    }
    return false;
  }

  let placement: ActiveRoom['wordPlacements'][number] | undefined;
  if (Array.isArray(cells) && cells.length > 0) {
    const normalizedCells = cells.map(cell => ({
      row: Number(cell.row ?? cell.r ?? 0),
      col: Number(cell.col ?? cell.c ?? 0)
    }));
    const verifiedPlacement = verifyWordOnServerBoard(room.grid, room.wordPlacements as any, rawWord, normalizedCells);
    if (!verifiedPlacement) {
      return false;
    }
    placement = room.wordPlacements.find(p => p.word === verifiedPlacement.word);
    if (placement && Array.isArray(verifiedPlacement.cells) && verifiedPlacement.cells.length >= 2) {
      placement.cells = verifiedPlacement.cells;
    }
  } else {
    const cleanTarget = cleanArabic(rawWord);
    placement = room.wordPlacements.find(p => p.word === cleanTarget);
  }

  if (!placement) {
    return false;
  }

  const cleanTarget = placement.word;

  if (placement.foundBy) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const claimerName = room.players[placement.foundBy]?.displayName || 'الخصم';
      ws.send(
        JSON.stringify({
          type: 'WORD_ALREADY_CLAIMED',
          payload: {
            word: placement.displayWord,
            claimedBy: placement.foundBy,
            claimedByName: claimerName,
            room: sanitizeRoomForClient(room)
          }
        })
      );
    }
    return false;
  }

  // Authoritatively assign word ownership to the first player who caught it!
  placement.foundBy = playerId;
  let wordScore = 100 + cleanTarget.length * 20;
  let currentStreak = 1;

  Object.values(room.players).forEach(p => {
    if (p.id === playerId) {
      p.streak = (p.streak || 0) + 1;
      currentStreak = p.streak;
      if (currentStreak >= 2) {
        wordScore += currentStreak * 25;
      }
      p.score += wordScore;
      p.totalScore = (p.totalScore || 0) + wordScore;
      if (!p.wordsFound.includes(cleanTarget)) {
        p.wordsFound.push(cleanTarget);
      }
    } else {
      p.streak = 0;
    }
  });

  const eventSig = signRealtimeEvent({
    type: 'WORD_CLAIMED',
    code,
    word: cleanTarget,
    playerId,
    wordScore
  });

  // Reset this player's 20-second word clock when playing SPEED_REVEAL_20S
  if (room.gameMode === 'SPEED_REVEAL_20S') {
    if (!room.playerDeadlines) room.playerDeadlines = {};
    room.playerDeadlines[playerId] = Date.now() + SPEED_MODE_TURN_MS;
  }

  broadcastToRoom(code, {
    type: 'WORD_CLAIMED',
    payload: {
      word: cleanTarget,
      displayWord: placement.displayWord,
      playerId,
      playerColor: claimingPlayer?.color || '#0ea5e9',
      playerName: claimingPlayer?.displayName || 'اللاعب',
      wordScore,
      streak: currentStreak,
      cells: placement.cells,
      signature: eventSig,
      room: sanitizeRoomForClient(room)
    }
  });

  // Check if all words have been caught
  const allFound = room.wordPlacements.every(p => !!p.foundBy);
  if (allFound) {
    room.state = 'FINISHED';
    clearRoomBotTimers(code);
    clearRoomSpeedTimer(code);

    // Winner of this stage is determined by who caught more words first (with score as tie-breaker)
    let bestWordsCount = -1;
    let bestScore = -1;
    let topStagePlayers: typeof room.players[string][] = [];

    Object.values(room.players).forEach(p => {
      const wCount = p.wordsFound.length;
      if (wCount > bestWordsCount || (wCount === bestWordsCount && p.score > bestScore)) {
        bestWordsCount = wCount;
        bestScore = p.score;
        topStagePlayers = [p];
      } else if (wCount === bestWordsCount && p.score === bestScore) {
        topStagePlayers.push(p);
      }
    });

    const winnerId: string | undefined = topStagePlayers.length === 1 ? topStagePlayers[0].id : undefined;

    room.winnerId = winnerId;
    if (winnerId && room.players[winnerId]) {
      room.players[winnerId].roundWins = (room.players[winnerId].roundWins || 0) + 1;
    }

    const standings = computeRoomStandings(room, winnerId || null);
    room.stageWinnerId = standings.stageWinnerId;
    room.stageWinnerName = standings.stageWinnerName;
    room.seriesCompleted = standings.seriesCompleted;
    room.seriesWinnerId = standings.seriesWinnerId;
    room.seriesWinnerName = standings.seriesWinnerName;
    room.standings = standings;

    // Update persistent user stats
    Object.values(room.players).forEach(p => {
      if (p.id.startsWith('bot_rival_')) return;
      const u = Object.values(db.users).find(usr => usr.id === p.id || usr.username === p.username);
      if (u) {
        if (p.id === winnerId) {
          u.multiplayerWins += 1;
          u.xp += 300;
          u.coins += 50;
          u.level = Math.floor(u.xp / 300) + 1;
          if (u.multiplayerWins >= 3 && !u.achievements.includes('online_champion')) {
            u.achievements.push('online_champion');
          }
        } else {
          u.multiplayerLosses += 1;
          u.xp += 100;
          u.coins += 20;
          u.level = Math.floor(u.xp / 300) + 1;
        }
        if (!u.achievements.includes('online_warrior')) {
          u.achievements.push('online_warrior');
        }
        if (db === prodDb) {
          void syncProductionUserToSupabase(u);
        }
      }
    });
    saveDatabase(db);

    broadcastToRoom(code, {
      type: 'GAME_FINISHED',
      payload: {
        room: sanitizeRoomForClient(room),
        winnerId,
        winnerName: standings.stageWinnerName,
        stageWinnerId: standings.stageWinnerId,
        stageWinnerName: standings.stageWinnerName,
        roundNumber: standings.stageNumber,
        stagesCount: standings.totalStages,
        seriesCompleted: standings.seriesCompleted,
        seriesWinnerId: standings.seriesWinnerId,
        seriesWinnerName: standings.seriesWinnerName,
        standings
      }
    });
  }

  return true;
}

function scheduleBotRivalLoop(code: string, botId: string) {
  clearRoomBotTimers(code);
  const timers: NodeJS.Timeout[] = [];
  roomBotTimers[code] = timers;

  const runStep = () => {
    const room = activeRooms[code];
    if (!room || room.state !== 'PLAYING' || !room.players[botId]) return;

    const unclaimed = room.wordPlacements.filter(wp => !wp.foundBy);
    if (unclaimed.length === 0) return;

    // Pick a random unclaimed word to simulate searching & then claiming if player doesn't catch it first
    const target = unclaimed[Math.floor(Math.random() * unclaimed.length)];
    const botPlayer = room.players[botId];

    // Step 1: Show bot dragging across the first 2-3 letters as a live cursor teaser
    const previewTimer = setTimeout(() => {
      const rNow = activeRooms[code];
      if (!rNow || rNow.state !== 'PLAYING') return;
      const sliceLen = Math.min(target.cells.length, 3);
      broadcastToRoom(code, {
        type: 'OPPONENT_CURSOR',
        payload: {
          playerId: botId,
          playerName: botPlayer?.displayName || 'منافس كويتي',
          playerColor: botPlayer?.color || '#ec4899',
          cells: target.cells.slice(0, sliceLen)
        }
      });
    }, 3200);
    timers.push(previewTimer);

    // Step 2: Bot completes the drag and claims the word if still unclaimed!
    const claimDelay = 6800 + Math.floor(Math.random() * 3200);
    const claimTimer = setTimeout(() => {
      const rNow = activeRooms[code];
      if (!rNow || rNow.state !== 'PLAYING') return;

      // Re-check unclaimed words in case human player already snatched `target`!
      const stillUnclaimed = rNow.wordPlacements.filter(wp => !wp.foundBy);
      if (stillUnclaimed.length === 0) return;

      const wordToClaim = !target.foundBy
        ? target
        : stillUnclaimed[Math.floor(Math.random() * stillUnclaimed.length)];

      claimWordInRoom(code, wordToClaim.word, botId);

      if (rNow.state === 'PLAYING') {
        runStep();
      }
    }, claimDelay);
    timers.push(claimTimer);
  };

  runStep();
}

app.post('/api/rooms/add-rival', (req, res) => {
  const { code, username } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanCode = (code || '').trim().toUpperCase();
  const room = activeRooms[cleanCode];
  if (!room) {
    return res.status(404).json({ success: false, message: 'الغرفة غير موجودة' });
  }

  // Idempotency: If room is already playing with authoritative board, return it safely
  if (
    room.state === 'PLAYING' &&
    Array.isArray(room.words) &&
    room.words.length > 0 &&
    Array.isArray(room.grid) &&
    room.grid.length > 0
  ) {
    return res.json({ success: true, room: sanitizeRoomForClient(room), alreadyStarted: true });
  }

  if (room.state !== 'WAITING') {
    return res.status(400).json({ success: false, message: 'الغرفة غير جاهزة لإضافة منافس' });
  }

  const hostPlayer = room.players[room.hostId];
  if (!hostPlayer || normalizeUsername(hostPlayer.username) !== verified.username) {
    return res.status(403).json({ success: false, message: 'فقط مضيف الغرفة يمكنه إضافة منافس' });
  }

  const maxAllowed = normalizeMaxPlayers(room.maxPlayers);
  if (Object.keys(room.players).length >= maxAllowed) {
    return res.status(400).json({ success: false, message: 'الغرفة ممتلئة بالفعل' });
  }

  const rivalNames = ['جاسم الكويتي', 'ضاري المطيري', 'دلال العتيبي', 'فهد الرشيدي', 'سارة الدوسري'];
  const rivalAvatars = [
    '/assets/images/avatar_kuwaiti_girl_1794404783186.jpg',
    '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
    '/assets/images/login_kuwaiti_mascot_1794483388654.jpg'
  ];
  const botId = `bot_rival_${Date.now()}`;
  const pickedName = rivalNames[Math.floor(Math.random() * rivalNames.length)];
  const pickedAvatar = rivalAvatars[Math.floor(Math.random() * rivalAvatars.length)];

  room.players[botId] = {
    id: botId,
    username: 'kuwait_rival',
    displayName: pickedName,
    avatar: pickedAvatar,
    isHost: false,
    score: 0,
    totalScore: 0,
    wordsFound: [],
    streak: 0,
    roundWins: 0,
    color: assignRoomPlayerColor(room, botId),
    isReady: true,
    connected: true,
    lastPing: Date.now()
  };

  assignAuthoritativeBoardToRoom(room);
  room.state = 'PLAYING';
  room.startedAt = Date.now();
  room.roundNumber = 1;
  startSpeedModeForRoom(room);

  const sanitized = sanitizeRoomForClient(room);
  broadcastToRoom(cleanCode, {
    type: 'ROOM_UPDATED',
    payload: { room: sanitized }
  });

  broadcastToRoom(cleanCode, {
    type: 'GAME_STARTED',
    payload: { room: sanitized }
  });

  scheduleBotRivalLoop(cleanCode, botId);
  broadcastPublicRooms();

  res.json({ success: true, room: sanitized });
});

app.post('/api/rooms/start', (req, res) => {
  const { code, username, playerId } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanCode = (code || '').trim().toUpperCase();
  const room = activeRooms[cleanCode];
  if (!room) {
    return res.status(404).json({ success: false, message: 'الغرفة غير موجودة' });
  }

  // Enforce strict host permission check
  const hostPlayer = room.players[room.hostId];
  const isCallerHost =
    hostPlayer &&
    normalizeUsername(hostPlayer.username) === verified.username &&
    (!playerId || playerId === room.hostId);

  if (!isCallerHost) {
    return res.status(403).json({
      success: false,
      error: 'غير مصرح: فقط مضيف الغرفة يملك صلاحية بدء المباراة',
      message: 'غير مصرح: فقط مضيف الغرفة يملك صلاحية بدء المباراة'
    });
  }

  if (Object.keys(room.players).length < 2) {
    return res.status(400).json({
      success: false,
      error: 'يجب وجود لاعبين اثنين على الأقل لبدء المباراة',
      message: 'يجب وجود لاعبين اثنين على الأقل لبدء المباراة'
    });
  }

  // STRICT IDEMPOTENCY:
  // If the room has already been started and has an active authoritative board,
  // do NOT regenerate the board! Reuse the existing board and return the sanitized state.
  if (
    room.state === 'PLAYING' &&
    Array.isArray(room.words) &&
    room.words.length > 0 &&
    Array.isArray(room.grid) &&
    room.grid.length > 0
  ) {
    const sanitized = sanitizeRoomForClient(room);
    return res.json({ success: true, room: sanitized, alreadyStarted: true });
  }

  assignAuthoritativeBoardToRoom(room);
  room.state = 'PLAYING';
  room.startedAt = Date.now();
  room.roundNumber = 1;
  startSpeedModeForRoom(room);

  const sanitized = sanitizeRoomForClient(room);
  broadcastToRoom(cleanCode, {
    type: 'ROOM_UPDATED',
    payload: { room: sanitized }
  });

  broadcastToRoom(cleanCode, {
    type: 'GAME_STARTED',
    payload: { room: sanitized }
  });

  const botPlayer = Object.values(room.players).find(p => p.id.startsWith('bot_'));
  if (botPlayer) {
    scheduleBotRivalLoop(cleanCode, botPlayer.id);
  }

  broadcastPublicRooms();
  res.json({ success: true, room: sanitized });
});

function executeAuthoritativeRoomRematch(room: ActiveRoom, initiatorPlayerId: string) {
  const maxStages = room.stagesCount || 50;
  const currentRound = room.roundNumber || 1;
  if (room.seriesCompleted || currentRound >= maxStages) {
    room.seriesCompleted = true;
    room.state = 'FINISHED';
    return {
      seriesCompleted: true,
      error: `انتهت المباراة باختتام جميع المراحل المختارة (${maxStages}) وتم إعلان الفائز النهائي!`
    };
  }

  clearRoomBotTimers(room.code);
  clearRoomSpeedTimer(room.code);
  delete roomActiveShields[room.code];

  assignAuthoritativeBoardToRoom(room, true);
  room.roundNumber = (room.roundNumber || 1) + 1;
  room.state = 'PLAYING';
  room.startedAt = Date.now();
  room.winnerId = undefined;
  room.stageWinnerId = undefined;
  room.stageWinnerName = undefined;
  room.seriesCompleted = false;
  startSpeedModeForRoom(room);

  Object.values(room.players).forEach(p => {
    p.totalScore = p.totalScore ?? p.score ?? 0;
    p.score = 0;
    p.wordsFound = [];
    p.streak = 0;
  });

  const initiatorName = room.players[initiatorPlayerId]?.displayName || 'المنافس';
  const sanitized = sanitizeRoomForClient(room);

  broadcastToRoom(room.code, {
    type: 'GAME_REMATCH_STARTED',
    payload: {
      room: sanitized,
      initiatedBy: initiatorName,
      roundNumber: room.roundNumber
    }
  });

  const botPlayer = Object.values(room.players).find(p => p.id.startsWith('bot_rival_'));
  if (botPlayer) {
    scheduleBotRivalLoop(room.code, botPlayer.id);
  }

  return {
    seriesCompleted: false,
    room: sanitized,
    initiatedBy: initiatorName,
    roundNumber: room.roundNumber
  };
}

app.post('/api/rooms/rematch', (req, res) => {
  const { code, playerId, username, currentRoundNumber } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanCode = (code || '').trim().toUpperCase();
  const room = activeRooms[cleanCode];
  if (!room) {
    return res.status(404).json({ success: false, message: 'الغرفة غير موجودة أو انتهت' });
  }

  const memberPlayer =
    Object.values(room.players).find(
      p => normalizeUsername(p.username) === verified.username && (!playerId || p.id === playerId)
    ) ||
    Object.values(room.players).find(p => normalizeUsername(p.username) === verified.username);

  if (!memberPlayer) {
    return res.status(403).json({ success: false, message: 'غير مصرح: لست عضواً في هذه الغرفة' });
  }
  if (playerId && playerId !== memberPlayer.id) {
    return res.status(403).json({ success: false, message: 'غير مصرح: لا يمكنك بدء جولة باسم لاعب آخر' });
  }

  if (
    !room.seriesCompleted &&
    typeof currentRoundNumber === 'number' &&
    room.roundNumber > currentRoundNumber &&
    room.roundNumber <= (room.stagesCount || 50) &&
    room.state === 'PLAYING'
  ) {
    return res.json({
      success: true,
      room: sanitizeRoomForClient(room),
      initiatedBy: memberPlayer.displayName || 'المنافس',
      roundNumber: room.roundNumber,
      alreadyAdvanced: true
    });
  }

  if (room.seriesCompleted || (room.roundNumber || 1) >= (room.stagesCount || 50)) {
    return res.status(400).json({
      success: false,
      code: 'SERIES_COMPLETED',
      message: `انتهت المباراة باختتام جميع المراحل المختارة (${room.stagesCount || 50})!`,
      seriesCompleted: true,
      seriesWinnerId: room.seriesWinnerId,
      seriesWinnerName: room.seriesWinnerName,
      room: sanitizeRoomForClient(room)
    });
  }

  const result = executeAuthoritativeRoomRematch(room, memberPlayer.id);
  if (result.seriesCompleted) {
    return res.status(400).json({
      success: false,
      code: 'SERIES_COMPLETED',
      message: result.error,
      seriesCompleted: true,
      room: sanitizeRoomForClient(room)
    });
  }
  res.json({
    success: true,
    ...result
  });
});

// REST sync for SPEED_REVEAL_20S mode (delivers caller's own revealed cells ONLY, never opponent's)
app.post('/api/rooms/speed-sync', (req, res) => {
  const { code, playerId, username } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanCode = (code || '').trim().toUpperCase();
  const room = activeRooms[cleanCode];
  if (!room || room.gameMode !== 'SPEED_REVEAL_20S') {
    return res.status(404).json({ success: false, message: 'غرفة التحدي الخاطف غير موجودة' });
  }

  const memberPlayer =
    Object.values(room.players).find(
      p => normalizeUsername(p.username) === verified.username && (!playerId || p.id === playerId)
    ) ||
    Object.values(room.players).find(p => normalizeUsername(p.username) === verified.username);

  if (!memberPlayer) {
    return res.status(403).json({ success: false, message: 'غير مصرح: لست عضواً في هذه الغرفة' });
  }

  let nowMs = Date.now();
  if (isTestDbRequest(req) && req.headers['x-test-speed-now-ms']) {
    const parsed = Number(req.headers['x-test-speed-now-ms']);
    if (Number.isFinite(parsed) && parsed > 0) nowMs = parsed;
  }

  evaluateSpeedModeDeadlines(room, nowMs);
  const scopedRoom = sanitizeRoomForClient(room, memberPlayer.id);
  res.json({
    success: true,
    playerDeadlines: room.playerDeadlines || {},
    myRevealedCells: scopedRoom.myRevealedCells || []
  });
});

app.post('/api/rooms/claim-word', (req, res) => {
  const { code, word, playerId, cells, username } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanCode = (code || '').trim().toUpperCase();
  const room = activeRooms[cleanCode];
  if (!room || room.state !== 'PLAYING') {
    return res.status(400).json({ success: false, error: 'الغرفة غير نشطة حالياً' });
  }

  const memberPlayer = Object.values(room.players).find(
    p => normalizeUsername(p.username) === verified.username
  );
  if (!memberPlayer) {
    return res.status(403).json({ success: false, error: 'غير مصرح: لست عضواً في هذه الغرفة' });
  }

  if (playerId && playerId !== memberPlayer.id) {
    return res.status(403).json({
      success: false,
      error: 'غير مصرح: لا يمكنك تسجيل كلمة باسم لاعب آخر'
    });
  }

  const claimed = claimWordInRoom(cleanCode, word, memberPlayer.id, undefined, cells);
  if (!claimed) {
    const cleanTargetErr = cleanArabic(word);
    const existPlacement = room.wordPlacements.find(p => p.word === cleanTargetErr);
    const claimerName = existPlacement?.foundBy
      ? room.players[existPlacement.foundBy]?.displayName || 'الخصم'
      : undefined;
    return res.status(400).json({
      success: false,
      claimed: false,
      claimedBy: existPlacement?.foundBy,
      claimedByName: claimerName,
      error: claimerName
        ? `هذه الكلمة صادها «${claimerName}» قبلك وانحسبت له!`
        : 'الكلمة غير صحيحة أو تم التقاطها مسبقاً',
      room: sanitizeRoomForClient(room)
    });
  }

  const cleanTarget = cleanArabic(word);
  const placement = room.wordPlacements.find(p => p.word === cleanTarget);
  const wordScore = 100 + cleanTarget.length * 20;
  const signature = signRealtimeEvent({
    type: 'WORD_CLAIMED',
    code: cleanCode,
    word: cleanTarget,
    playerId: memberPlayer.id,
    wordScore
  });

  res.json({
    success: true,
    claimed: true,
    word: cleanTarget,
    displayWord: placement?.displayWord || word,
    cells: placement?.cells || [],
    playerId: memberPlayer.id,
    wordScore,
    signature,
    room: sanitizeRoomForClient(room)
  });
});

app.post('/api/rooms/verify-mqtt-message', (req, res) => {
  const { code, type, word, playerId, wordScore, signature, pts } = req.body || {};
  const cleanCode = (code || '').trim().toUpperCase();
  const room = activeRooms[cleanCode];
  if (!room) {
    return res.status(404).json({ valid: false, error: 'الغرفة غير موجودة' });
  }

  // Reject any unsigned MQTT message or raw client `pts` manipulation
  if (!signature || typeof signature !== 'string' || pts !== undefined) {
    return res.status(403).json({
      valid: false,
      error: 'رسالة MQTT غير موثقة من الخادم أو تحتوي على تلاعب بالنقاط'
    });
  }

  const isValid = verifyRealtimeEventSignature(
    {
      type: String(type || 'WORD_CLAIMED'),
      code: cleanCode,
      word: cleanArabic(String(word || '')),
      playerId: String(playerId || ''),
      wordScore: Number(wordScore || 0)
    },
    signature
  );

  if (!isValid) {
    return res.status(403).json({
      valid: false,
      error: 'توقيع رسالة MQTT غير صالح (تم رفض الرسالة المزورة)'
    });
  }

  res.json({
    valid: true,
    room: sanitizeRoomForClient(room)
  });
});

app.post('/api/rooms/leave', (req, res) => {
  const { code, playerId, username } = req.body || {};
  const verified = requireVerifiedRequestUser(req, res, username);
  if (!verified) return;

  const cleanCode = (code || '').trim().toUpperCase();
  const room = activeRooms[cleanCode];
  if (room) {
    const memberPlayer = Object.values(room.players).find(
      p => normalizeUsername(p.username) === verified.username
    );
    if (!memberPlayer || (playerId && playerId !== memberPlayer.id)) {
      return res.status(403).json({ success: false, error: 'لا يمكنك إخراج لاعب آخر من الغرفة' });
    }

    const targetId = memberPlayer.id;
    clearRoomBotTimers(cleanCode);
    delete room.players[targetId];
    roomSockets[cleanCode]?.delete(targetId);
    const humanPlayers = Object.values(room.players).filter(p => !p.id.startsWith('bot_'));
    if (humanPlayers.length === 0) {
      delete activeRooms[cleanCode];
      delete roomSockets[cleanCode];
    } else {
      const remaining = humanPlayers[0];
      if (remaining) {
        room.hostId = remaining.id;
        remaining.isHost = true;
      }
      broadcastToRoom(cleanCode, {
        type: 'ROOM_UPDATED',
        payload: { room: sanitizeRoomForClient(room) }
      });
    }
    broadcastPublicRooms();
  }
  broadcastPresenceUpdate();
  res.json({ success: true });
});

wss.on('connection', (ws, req) => {
  let boundRoomCode: string | null = null;
  let boundPlayerId: string | null = null;
  let boundUsername: string | null = null;
  let authenticatedUsername: string | null = null;
  const processedWsMessageIds = new Set<string>();
  allLobbySockets.add(ws);

  const registerSocketUsername = (rawUsername?: string) => {
    const clean = normalizeUsername(rawUsername);
    if (!clean) return;
    boundUsername = clean;
    if (!userPresenceSockets.has(clean)) {
      userPresenceSockets.set(clean, new Set());
    }
    userPresenceSockets.get(clean)!.add(ws);
    userLastSeen.set(clean, Date.now());
  };

  // Check initial WebSocket handshake URL / headers for auth token
  try {
    const urlObj = new URL(req.url || '/ws', 'http://localhost');
    const queryToken = urlObj.searchParams.get('token') || urlObj.searchParams.get('authToken');
    const headerAuth = req.headers['authorization'];
    const headerToken =
      typeof headerAuth === 'string' && headerAuth.startsWith('Bearer ')
        ? headerAuth.slice(7).trim()
        : (req.headers['x-auth-token'] as string | undefined);
    const initialPayload = verifyAuthToken(queryToken || headerToken);
    if (initialPayload) {
      authenticatedUsername = initialPayload.username;
      registerSocketUsername(initialPayload.username);
    }
  } catch {
    // Ignore URL parse issues
  }

  const verifySocketCaller = (
    msg: Record<string, any>,
    claimedUsername?: string
  ): string | null => {
    const msgToken =
      msg?.authToken ||
      msg?.token ||
      msg?.payload?.authToken ||
      msg?.payload?.token ||
      msg?.payload?.player?.authToken;
    if (msgToken) {
      const verified = verifyAuthToken(String(msgToken));
      if (!verified) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            payload: { code: 'UNAUTHORIZED', message: 'غير مصرح: رمز جلسة WebSocket غير صالح' }
          })
        );
        return null;
      }
      authenticatedUsername = verified.username;
      registerSocketUsername(verified.username);
    }

    if (!authenticatedUsername) {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          payload: { code: 'UNAUTHORIZED', message: 'غير مصرح: يجب تسجيل الدخول قبل إرسال أوامر WebSocket' }
        })
      );
      return null;
    }

    if (claimedUsername) {
      const cleanClaimed = normalizeUsername(claimedUsername);
      if (cleanClaimed && cleanClaimed !== authenticatedUsername) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            payload: { code: 'FORBIDDEN_USER_SPOOF', message: 'غير مصرح: لا يمكنك انتحال هوية لاعب آخر عبر WebSocket' }
          })
        );
        return null;
      }
    }

    return authenticatedUsername;
  };

  const verifySocketRoomMember = (
    roomCode: string,
    claimedPlayerId?: string
  ): { room: ActiveRoom; playerId: string } | null => {
    const cleanCode = (roomCode || '').trim().toUpperCase();
    const room = activeRooms[cleanCode];
    if (!room) {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          payload: { code: 'ROOM_NOT_FOUND', message: 'الغرفة غير موجودة' }
        })
      );
      return null;
    }

    if (!authenticatedUsername) {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          payload: { code: 'UNAUTHORIZED', message: 'غير مصرح: يجب المصادقة أولاً' }
        })
      );
      return null;
    }

    // Find the player in this room belonging to authenticatedUsername (supporting multi-tab same account if claimedPlayerId matches)
    const memberEntry =
      (claimedPlayerId
        ? Object.values(room.players).find(
            p => normalizeUsername(p.username) === authenticatedUsername && p.id === claimedPlayerId
          )
        : undefined) ||
      Object.values(room.players).find(
        p => normalizeUsername(p.username) === authenticatedUsername
      );
    if (!memberEntry || (boundRoomCode && boundRoomCode !== cleanCode)) {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          payload: { code: 'NOT_ROOM_MEMBER', message: 'غير مصرح: لست عضواً في هذه الغرفة' }
        })
      );
      return null;
    }

    if (claimedPlayerId && claimedPlayerId !== memberEntry.id) {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          payload: { code: 'FORBIDDEN_PLAYER_SPOOF', message: 'غير مصرح: لا يمكنك إرسال أحداث باسم لاعب آخر' }
        })
      );
      return null;
    }

    // Ensure verified socket is bound and registered in roomSockets so broadcasts (including GAME_REMATCH_STARTED) always reach it
    if (!boundRoomCode) boundRoomCode = cleanCode;
    if (!boundPlayerId) boundPlayerId = memberEntry.id;
    memberEntry.connected = true;
    memberEntry.lastPing = Date.now();
    if (!roomSockets[cleanCode]) {
      roomSockets[cleanCode] = new Map();
    }
    if (roomSockets[cleanCode].get(memberEntry.id) !== ws) {
      roomSockets[cleanCode].set(memberEntry.id, ws);
    }

    return { room, playerId: memberEntry.id };
  };

  // Immediately send current public waiting rooms
  ws.send(JSON.stringify({
    type: 'PUBLIC_ROOMS_UPDATED',
    payload: { rooms: getPublicRoomsSummary() }
  }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const { type, payload } = msg;

      // Deduplicate repeated messageIds if supplied
      const msgId = msg?.messageId || payload?.messageId || payload?.requestId;
      if (msgId && typeof msgId === 'string') {
        if (processedWsMessageIds.has(msgId)) {
          ws.send(
            JSON.stringify({
              type: 'DUPLICATE_IGNORED',
              payload: { messageId: msgId }
            })
          );
          return;
        }
        processedWsMessageIds.add(msgId);
      }

      switch (type) {
        case 'REGISTER_PRESENCE': {
          const verifiedUser = verifySocketCaller(msg, payload?.username);
          if (!verifiedUser) break;
          registerSocketUsername(verifiedUser);
          ws.send(
            JSON.stringify({
              type: 'FRIENDS_PRESENCE_UPDATED',
              payload: getFriendsPayloadForUser(verifiedUser)
            })
          );
          broadcastPresenceUpdate();
          break;
        }

        case 'SEND_ROOM_INVITE': {
          const { fromUsername, toUsername, roomCode, roomName, categoryId, stagesCount } = payload || {};
          const verifiedUser = verifySocketCaller(msg, fromUsername);
          if (!verifiedUser) break;

          const senderClean = verifiedUser;
          const targetClean = normalizeUsername(toUsername);
          const cleanCode = (roomCode || '').trim().toUpperCase();
          const senderUser = db.users[senderClean];
          const targetUser = db.users[targetClean];

          if (targetUser && cleanCode && !isUserBlockedEitherWay(senderClean, targetClean)) {
            const invite: ServerRoomInvite = {
              id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              fromUsername: senderUser?.username || senderClean,
              fromDisplayName: senderUser?.displayName || 'صديق',
              fromAvatar: senderUser?.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
              toUsername: targetUser.username,
              roomCode: cleanCode,
              roomName: roomName || `غرفة ${senderUser?.displayName || 'خاصة'}`,
              categoryId: categoryId || 'kuwait_heritage',
              stagesCount: Number(stagesCount) || 50,
              createdAt: Date.now()
            };

            if (!pendingRoomInvites[targetClean]) {
              pendingRoomInvites[targetClean] = [];
            }
            pendingRoomInvites[targetClean] = [
              invite,
              ...pendingRoomInvites[targetClean].filter(i => i.roomCode !== cleanCode)
            ].slice(0, 10);

            const targetSockets = userPresenceSockets.get(targetClean);
            let deliveredLive = false;
            if (targetSockets) {
              const inviteMsg = JSON.stringify({
                type: 'ROOM_INVITE_RECEIVED',
                payload: { invite }
              });
              targetSockets.forEach(s => {
                if (s.readyState === WebSocket.OPEN) {
                  s.send(inviteMsg);
                  deliveredLive = true;
                }
              });
            }

            ws.send(
              JSON.stringify({
                type: 'ROOM_INVITE_SENT',
                payload: { invite, deliveredLive }
              })
            );
          }
          break;
        }

        case 'GET_PUBLIC_ROOMS': {
          ws.send(JSON.stringify({
            type: 'PUBLIC_ROOMS_UPDATED',
            payload: { rooms: getPublicRoomsSummary(boundUsername || undefined) }
          }));
          break;
        }

        case 'ROOM_CREATE': {
          const { code, roomName, player, categoryId, levelNumber, stagesCount, isPublic, gameMode, difficulty, maxPlayers } = payload || {};
          if (!player || !player.id) {
            ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'بيانات اللاعب غير صالحة' } }));
            break;
          }
          const verifiedUser = verifySocketCaller(msg, player.username);
          if (!verifiedUser) break;

          if (typeof roomName === 'string' && roomName.trim()) {
            const modCheck = checkTextModeration(roomName, 'اسم الغرفة');
            if (!modCheck.allowed) {
              ws.send(JSON.stringify({ type: 'ERROR', payload: { code: 'MODERATION_BLOCKED', message: modCheck.reason } }));
              break;
            }
          }

          const requestedMode = gameMode === 'SPEED_REVEAL_20S' ? 'SPEED_REVEAL_20S' : 'WORD_RACE';

          if (code !== undefined && code !== null && String(code).trim() !== '') {
            const reqCode = String(code).trim().toUpperCase();
            if (activeRooms[reqCode]) {
              ws.send(
                JSON.stringify({
                  type: 'ERROR',
                  payload: { code: 'CODE_CONFLICT', message: 'رمز الغرفة مستخدم بالفعل ولا يمكن الكتابة فوق غرفة قائمة' }
                })
              );
              break;
            }
            ws.send(
              JSON.stringify({
                type: 'ERROR',
                payload: { code: 'CLIENT_CODE_FORBIDDEN', message: 'يتم توليد رمز الغرفة حصرياً من الخادم' }
              })
            );
            break;
          }

          const roomCode = generateServerRoomCode(isPublic ? 'PUB' : 'KWT');
          boundRoomCode = roomCode;
          boundPlayerId = player.id;
          registerSocketUsername(verifiedUser);
          const resolvedDifficulty = normalizeOnlineDifficulty(difficulty);
          const diffCfg = getOnlineDifficultyConfig(resolvedDifficulty);
          const resolvedMaxPlayers = normalizeMaxPlayers(maxPlayers);

          activeRooms[roomCode] = {
            code: roomCode,
            roomName: (roomName || `غرفة ${player.displayName?.split(' ')[0] || 'أحمد'}`).trim(),
            hostId: player.id,
            isPublic: Boolean(isPublic),
            maxPlayers: resolvedMaxPlayers,
            gameMode: requestedMode,
            difficulty: resolvedDifficulty,
            usedWords: [],
            speedTurnSeconds: requestedMode === 'SPEED_REVEAL_20S' ? 20 : undefined,
            roundNumber: 1,
            stagesCount: normalizeStagesCount(stagesCount),
            seriesCompleted: false,
            categoryId: categoryId || 'kuwait_heritage',
            levelNumber: levelNumber || 1,
            gridSize: diffCfg.gridSize,
            words: [],
            grid: [],
            wordPlacements: [],
            players: {
              [player.id]: {
                ...player,
                username: verifiedUser,
                isHost: true,
                score: 0,
                totalScore: 0,
                wordsFound: [],
                streak: 0,
                roundWins: 0,
                color: ONLINE_PLAYER_COLORS[0],
                isReady: true,
                connected: true,
                lastPing: Date.now()
              }
            },
            state: 'WAITING',
            createdAt: Date.now(),
            chatMessages: []
          };

          if (!roomSockets[roomCode]) {
            roomSockets[roomCode] = new Map();
          }
          roomSockets[roomCode].set(player.id, ws);

          ws.send(JSON.stringify({
            type: 'ROOM_CREATED',
            payload: { room: sanitizeRoomForClient(activeRooms[roomCode]) }
          }));

          broadcastPublicRooms();
          broadcastPresenceUpdate();
          break;
        }

        case 'QUICK_MATCH': {
          const { player, categoryId, roomName, stagesCount, gameMode, difficulty, maxPlayers } = payload || {};
          if (!player || !player.id) break;
          const verifiedUser = verifySocketCaller(msg, player.username);
          if (!verifiedUser) break;

          if (typeof roomName === 'string' && roomName.trim()) {
            const modCheck = checkTextModeration(roomName, 'اسم الغرفة');
            if (!modCheck.allowed) {
              ws.send(JSON.stringify({ type: 'ERROR', payload: { code: 'MODERATION_BLOCKED', message: modCheck.reason } }));
              break;
            }
          }

          const requestedMode = gameMode === 'SPEED_REVEAL_20S' ? 'SPEED_REVEAL_20S' : 'WORD_RACE';
          const requestedStagesCount = normalizeStagesCount(stagesCount);
          const resolvedDifficulty = normalizeOnlineDifficulty(difficulty);
          const diffCfg = getOnlineDifficultyConfig(resolvedDifficulty);
          const requestedMaxPlayers = normalizeMaxPlayers(maxPlayers);

          const preferredCat = categoryId || 'kuwait_heritage';

          // Find an open waiting public room matching the requested mode & exact stagesCount (excluding blocked players)
          const openPublicRooms = Object.values(activeRooms).filter(
            r =>
              r.isPublic &&
              r.state === 'WAITING' &&
              r.gameMode === requestedMode &&
              normalizeStagesCount(r.stagesCount) === requestedStagesCount &&
              Object.keys(r.players).length < normalizeMaxPlayers(r.maxPlayers) &&
              !r.players[player.id] &&
              !Object.values(r.players).some(p => isUserBlockedEitherWay(verifiedUser, p.username))
          );

          const matchedRoom =
            openPublicRooms.find(
              r => r.categoryId === preferredCat && (r.difficulty || 'MEDIUM') === resolvedDifficulty
            ) ||
            openPublicRooms.find(r => (r.difficulty || 'MEDIUM') === resolvedDifficulty) ||
            openPublicRooms.find(r => r.categoryId === preferredCat) ||
            openPublicRooms[0];

          if (matchedRoom) {
            const code = matchedRoom.code;
            boundRoomCode = code;
            boundPlayerId = player.id;

            const existingCount = Object.keys(matchedRoom.players).length;
            const existingNames = new Set(Object.values(matchedRoom.players).map(p => p.displayName));
            const finalDisplayName = existingNames.has(player.displayName)
              ? `${player.displayName} (${existingCount + 1})`
              : player.displayName;
            const seatColor = assignRoomPlayerColor(matchedRoom, player.id);

            matchedRoom.players[player.id] = {
              ...player,
              username: verifiedUser,
              displayName: finalDisplayName,
              isHost: false,
              score: 0,
              totalScore: 0,
              wordsFound: [],
              streak: 0,
              roundWins: 0,
              color: seatColor,
              isReady: true,
              connected: true,
              lastPing: Date.now()
            };

            if (!roomSockets[code]) {
              roomSockets[code] = new Map();
            }
            roomSockets[code].set(player.id, ws);

            const roomCapacity = normalizeMaxPlayers(matchedRoom.maxPlayers);
            if (Object.keys(matchedRoom.players).length >= roomCapacity) {
              assignAuthoritativeBoardToRoom(matchedRoom);
              matchedRoom.state = 'PLAYING';
              matchedRoom.startedAt = Date.now();
              matchedRoom.roundNumber = 1;
              startSpeedModeForRoom(matchedRoom);

              const sanitizedMatched = sanitizeRoomForClient(matchedRoom);
              broadcastToRoom(code, {
                type: 'ROOM_UPDATED',
                payload: { room: sanitizedMatched }
              });

              broadcastToRoom(code, {
                type: 'GAME_STARTED',
                payload: { room: sanitizedMatched }
              });
            } else {
              const sanitizedMatched = sanitizeRoomForClient(matchedRoom);
              ws.send(JSON.stringify({
                type: 'ROOM_CREATED',
                payload: { room: sanitizedMatched, isQuickMatchWaiting: true }
              }));
              broadcastToRoom(code, {
                type: 'ROOM_UPDATED',
                payload: { room: sanitizedMatched }
              });
            }

            broadcastPublicRooms();
          } else {
            const code = generateServerRoomCode('RACE');
            boundRoomCode = code;
            boundPlayerId = player.id;

            activeRooms[code] = {
              code,
              roomName: (roomName || `غرفة ${player.displayName?.split(' ')[0] || 'أحمد'}`).trim(),
              hostId: player.id,
              isPublic: true,
              maxPlayers: requestedMaxPlayers,
              gameMode: requestedMode,
              difficulty: resolvedDifficulty,
              usedWords: [],
              speedTurnSeconds: requestedMode === 'SPEED_REVEAL_20S' ? 20 : undefined,
              roundNumber: 1,
              stagesCount: normalizeStagesCount(stagesCount),
              seriesCompleted: false,
              categoryId: preferredCat,
              levelNumber: 1,
              gridSize: diffCfg.gridSize,
              words: [],
              grid: [],
              wordPlacements: [],
              players: {
                [player.id]: {
                  ...player,
                  username: verifiedUser,
                  isHost: true,
                  score: 0,
                  totalScore: 0,
                  wordsFound: [],
                  streak: 0,
                  roundWins: 0,
                  color: ONLINE_PLAYER_COLORS[0],
                  isReady: true,
                  connected: true,
                  lastPing: Date.now()
                }
              },
              state: 'WAITING',
              createdAt: Date.now(),
              chatMessages: []
            };

            if (!roomSockets[code]) {
              roomSockets[code] = new Map();
            }
            roomSockets[code].set(player.id, ws);

            ws.send(JSON.stringify({
              type: 'ROOM_CREATED',
              payload: { room: sanitizeRoomForClient(activeRooms[code]), isQuickMatchWaiting: true }
            }));

            broadcastPublicRooms();
          }
          break;
        }

        case 'ADD_LIVE_RIVAL': {
          const { code } = payload || {};
          if (!verifySocketCaller(msg)) break;
          const memberCheck = verifySocketRoomMember(code);
          if (!memberCheck) break;
          const { room, playerId } = memberCheck;
          if (room.state !== 'WAITING' || room.hostId !== playerId) {
            ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'فقط مضيف الغرفة يمكنه إضافة منافس' } }));
            break;
          }
          if (Object.keys(room.players).length >= normalizeMaxPlayers(room.maxPlayers)) {
            ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'الغرفة ممتلئة بالفعل' } }));
            break;
          }

          const rivalNames = ['جاسم الكويتي', 'ضاري المطيري', 'دلال العتيبي', 'فهد الرشيدي', 'سارة الدوسري'];
          const rivalAvatars = [
            '/assets/images/avatar_kuwaiti_girl_1794404783186.jpg',
            '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
            '/assets/images/login_kuwaiti_mascot_1794483388654.jpg'
          ];
          const botId = `bot_rival_${Date.now()}`;
          const pickedName = rivalNames[Math.floor(Math.random() * rivalNames.length)];
          const pickedAvatar = rivalAvatars[Math.floor(Math.random() * rivalAvatars.length)];

          room.players[botId] = {
            id: botId,
            username: 'kuwait_rival',
            displayName: pickedName,
            avatar: pickedAvatar,
            isHost: false,
            score: 0,
            totalScore: 0,
            wordsFound: [],
            streak: 0,
            roundWins: 0,
            color: assignRoomPlayerColor(room, botId),
            isReady: true,
            connected: true,
            lastPing: Date.now()
          };

          assignAuthoritativeBoardToRoom(room);
          room.state = 'PLAYING';
          room.startedAt = Date.now();
          room.roundNumber = 1;
          startSpeedModeForRoom(room);

          const sanitized = sanitizeRoomForClient(room);
          broadcastToRoom(room.code, {
            type: 'ROOM_UPDATED',
            payload: { room: sanitized }
          });

          broadcastToRoom(room.code, {
            type: 'GAME_STARTED',
            payload: { room: sanitized }
          });

          scheduleBotRivalLoop(room.code, botId);
          broadcastPublicRooms();
          break;
        }

        case 'ROOM_LEAVE': {
          const { code, playerId } = payload || {};
          if (!verifySocketCaller(msg)) break;
          const memberCheck = verifySocketRoomMember(code, playerId);
          if (!memberCheck) break;
          const { room, playerId: verifiedPlayerId } = memberCheck;

          clearRoomBotTimers(room.code);
          clearRoomSpeedTimer(room.code);
          delete room.players[verifiedPlayerId];
          roomSockets[room.code]?.delete(verifiedPlayerId);
          const humanPlayers = Object.values(room.players).filter(p => !p.id.startsWith('bot_rival_'));
          if (humanPlayers.length === 0) {
            delete activeRooms[room.code];
            delete roomSockets[room.code];
          } else {
            const remaining = humanPlayers[0];
            if (remaining) {
              room.hostId = remaining.id;
              remaining.isHost = true;
            }
            broadcastToRoom(room.code, {
              type: 'ROOM_UPDATED',
              payload: { room: sanitizeRoomForClient(room) }
            });
          }
          broadcastPublicRooms();
          boundRoomCode = null;
          broadcastPresenceUpdate();
          break;
        }

        case 'ROOM_JOIN': {
          const { code, player } = payload || {};
          if (!player || !player.id) {
            ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'بيانات اللاعب غير صالحة' } }));
            break;
          }
          const verifiedUser = verifySocketCaller(msg, player.username);
          if (!verifiedUser) break;

          const cleanCode = (code || '').trim().toUpperCase();
          const room = activeRooms[cleanCode];

          if (!room) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              payload: { message: 'الغرفة غير موجودة أو انتهت' }
            }));
            return;
          }

          if (room.state !== 'WAITING' && !room.players[player.id]) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              payload: { message: 'المباراة بدأت بالفعل في هذه الغرفة' }
            }));
            return;
          }

          const maxAllowed = normalizeMaxPlayers(room.maxPlayers);
          const existingPlayerCount = Object.keys(room.players).length;
          if (existingPlayerCount >= maxAllowed && !room.players[player.id]) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              payload: { message: `الغرفة مكتملة (${maxAllowed} لاعبين كحد أقصى)` }
            }));
            return;
          }

          if (!room.players[player.id]) {
            const blockedConflict = Object.values(room.players).some(p => isUserBlockedEitherWay(verifiedUser, p.username));
            if (blockedConflict) {
              ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { code: 'BLOCKED_PLAYER', message: 'لا يمكن الانضمام إلى هذه الغرفة لوجود حظر بين اللاعبين' }
              }));
              return;
            }
          }

          boundRoomCode = cleanCode;
          boundPlayerId = player.id;
          registerSocketUsername(verifiedUser);

          const otherNames = new Set(
            Object.values(room.players)
              .filter(p => p.id !== player.id)
              .map(p => p.displayName)
          );
          const finalDisplayName =
            !room.players[player.id] && otherNames.has(player.displayName)
              ? `${player.displayName} (${existingPlayerCount + 1})`
              : room.players[player.id]?.displayName || player.displayName;

          const playerColor = assignRoomPlayerColor(room, player.id);
          room.players[player.id] = {
            ...player,
            username: verifiedUser,
            displayName: finalDisplayName,
            isHost: player.id === room.hostId,
            score: room.players[player.id]?.score || 0,
            totalScore: room.players[player.id]?.totalScore ?? room.players[player.id]?.score ?? 0,
            wordsFound: room.players[player.id]?.wordsFound || [],
            streak: room.players[player.id]?.streak || 0,
            roundWins: room.players[player.id]?.roundWins || 0,
            color: playerColor,
            isReady: true,
            connected: true,
            lastPing: Date.now()
          };

          if (!roomSockets[cleanCode]) {
            roomSockets[cleanCode] = new Map();
          }
          roomSockets[cleanCode].set(player.id, ws);

          const sanitized = sanitizeRoomForClient(room);
          broadcastToRoom(cleanCode, {
            type: 'ROOM_UPDATED',
            payload: { room: sanitized }
          });

          // If this is a Public Room and the room reached its player capacity, auto-start the Live Word Race!
          if (room.isPublic && Object.keys(room.players).length >= maxAllowed && room.state === 'WAITING') {
            assignAuthoritativeBoardToRoom(room);
            room.state = 'PLAYING';
            room.startedAt = Date.now();
            room.roundNumber = 1;
            startSpeedModeForRoom(room);

            broadcastToRoom(cleanCode, {
              type: 'GAME_STARTED',
              payload: { room: sanitizeRoomForClient(room) }
            });
          }

          broadcastPublicRooms();
          broadcastPresenceUpdate();
          break;
        }

        case 'ROOM_REJOIN': {
          const { code, playerId, username } = payload || {};
          const verifiedUser = verifySocketCaller(msg, username);
          if (!verifiedUser) break;

          const cleanCode = (code || '').trim().toUpperCase();
          const room = activeRooms[cleanCode];
          if (!room) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              payload: { message: 'الغرفة غير موجودة أو انتهت' }
            }));
            break;
          }

          const matchedPlayer = Object.values(room.players).find(
            p => normalizeUsername(p.username) === verifiedUser && (!playerId || p.id === playerId)
          );

          if (!matchedPlayer) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              payload: { message: 'اللاعب غير مسجل في هذه الغرفة' }
            }));
            break;
          }

          boundRoomCode = cleanCode;
          boundPlayerId = matchedPlayer.id;
          registerSocketUsername(verifiedUser);

          matchedPlayer.connected = true;
          matchedPlayer.lastPing = Date.now();
          if (!roomSockets[cleanCode]) {
            roomSockets[cleanCode] = new Map();
          }
          roomSockets[cleanCode].set(matchedPlayer.id, ws);

          const sanitized = sanitizeRoomForClient(room, matchedPlayer.id);
          ws.send(JSON.stringify({
            type: 'ROOM_REJOINED',
            payload: { room: sanitized, playerId: matchedPlayer.id }
          }));

          broadcastToRoom(
            cleanCode,
            {
              type: 'PLAYER_RECONNECTED',
              payload: {
                playerId: matchedPlayer.id,
                playerName: matchedPlayer.displayName,
                room: sanitized
              }
            },
            matchedPlayer.id
          );
          broadcastPresenceUpdate();
          break;
        }

        case 'ROOM_START': {
          const { code, playerId } = payload || {};
          if (!verifySocketCaller(msg)) break;
          const memberCheck = verifySocketRoomMember(code, playerId);
          if (!memberCheck) break;
          const { room, playerId: verifiedPlayerId } = memberCheck;

          if (room.hostId !== verifiedPlayerId) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              payload: { code: 'FORBIDDEN_NOT_HOST', message: 'غير مصرح: فقط مضيف الغرفة يملك صلاحية بدء المباراة' }
            }));
            return;
          }

          // Verify room has at least 2 players
          if (Object.keys(room.players).length < 2) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              payload: { message: 'يجب انتظار اللاعب الثاني لبدء المباراة' }
            }));
            return;
          }

          // STRICT IDEMPOTENCY:
          // If the room has already been started and has an active authoritative board,
          // do NOT regenerate! Re-send the authoritative room state to ensure sync.
          if (
            room.state === 'PLAYING' &&
            Array.isArray(room.words) &&
            room.words.length > 0 &&
            Array.isArray(room.grid) &&
            room.grid.length > 0
          ) {
            ws.send(JSON.stringify({
              type: 'GAME_STARTED',
              payload: { room: sanitizeRoomForClient(room) }
            }));
            return;
          }

          // SECURITY (Task 2 & Task 5): Always generate board on the server! Never trust clientBoard.
          assignAuthoritativeBoardToRoom(room);

          room.state = 'PLAYING';
          room.startedAt = Date.now();
          room.roundNumber = room.roundNumber || 1;
          startSpeedModeForRoom(room);

          broadcastToRoom(room.code, {
            type: 'GAME_STARTED',
            payload: { room: sanitizeRoomForClient(room) }
          });

          const botPlayer = Object.values(room.players).find(p => p.id.startsWith('bot_rival_'));
          if (botPlayer) {
            scheduleBotRivalLoop(room.code, botPlayer.id);
          }

          broadcastPublicRooms();
          broadcastPresenceUpdate();
          break;
        }

        case 'ROOM_REMATCH': {
          const { code, playerId, currentRoundNumber } = payload || {};
          if (!verifySocketCaller(msg)) break;
          const memberCheck = verifySocketRoomMember(code, playerId);
          if (!memberCheck) break;
          const { room, playerId: verifiedPlayerId } = memberCheck;

          if (
            !room.seriesCompleted &&
            typeof currentRoundNumber === 'number' &&
            room.roundNumber > currentRoundNumber &&
            room.roundNumber <= (room.stagesCount || 50) &&
            room.state === 'PLAYING'
          ) {
            ws.send(
              JSON.stringify({
                type: 'GAME_REMATCH_STARTED',
                payload: {
                  room: sanitizeRoomForClient(room),
                  initiatedBy: room.players[verifiedPlayerId]?.displayName || 'المنافس',
                  roundNumber: room.roundNumber
                }
              })
            );
            break;
          }

          if (room.seriesCompleted || (room.roundNumber || 1) >= (room.stagesCount || 50)) {
            ws.send(
              JSON.stringify({
                type: 'ERROR',
                payload: {
                  code: 'SERIES_COMPLETED',
                  message: `انتهت المباراة باختتام جميع المراحل المختارة (${room.stagesCount || 50})!`,
                  seriesCompleted: true,
                  seriesWinnerId: room.seriesWinnerId,
                  seriesWinnerName: room.seriesWinnerName,
                  room: sanitizeRoomForClient(room)
                }
              })
            );
            break;
          }

          executeAuthoritativeRoomRematch(room, verifiedPlayerId);
          break;
        }

        case 'CURSOR_DRAG': {
          const { code, playerId, cells } = payload || {};
          if (!verifySocketCaller(msg)) break;
          const memberCheck = verifySocketRoomMember(code, playerId);
          if (!memberCheck) break;
          const { room, playerId: verifiedPlayerId } = memberCheck;
          if (room.state !== 'PLAYING') return;

          const sender = room.players[verifiedPlayerId];
          broadcastToRoom(
            room.code,
            {
              type: 'OPPONENT_CURSOR',
              payload: {
                playerId: verifiedPlayerId,
                playerName: sender?.displayName || 'الخصم',
                playerColor: sender?.color || '#ec4899',
                cells: Array.isArray(cells) ? cells : []
              }
            },
            verifiedPlayerId
          );
          break;
        }

        case 'WORD_FOUND': {
          const { code, word, playerId, cells } = payload || {};
          if (!verifySocketCaller(msg)) break;
          const memberCheck = verifySocketRoomMember(code, playerId);
          if (!memberCheck) break;
          const { room, playerId: verifiedPlayerId } = memberCheck;
          claimWordInRoom(room.code, word, verifiedPlayerId, ws, cells);
          break;
        }

        case 'USE_BATTLE_CARD': {
          const { code, cardId, playerId } = payload || {};
          if (!verifySocketCaller(msg)) break;
          const memberCheck = verifySocketRoomMember(code, playerId);
          if (!memberCheck) break;
          const { room, playerId: verifiedPlayerId } = memberCheck;
          if (room.state !== 'PLAYING') return;

          const sender = room.players[verifiedPlayerId];
          if (!sender) return;

          const validCardIds = new Set([
            'CARD_FREEZE_OPPONENT',
            'CARD_SANDSTORM',
            'CARD_BLIND_WORDS',
            'CARD_STEAL_POINTS',
            'CARD_SHIELD'
          ]);
          if (!validCardIds.has(cardId)) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              payload: { message: 'معرّف الكرت غير صالح' }
            }));
            break;
          }

          const opponents = Object.values(room.players).filter(p => p.id !== verifiedPlayerId);

          if (!roomActiveShields[room.code]) {
            roomActiveShields[room.code] = {};
          }

          if (cardId === 'CARD_SHIELD') {
            roomActiveShields[room.code][verifiedPlayerId] = true;
            broadcastToRoom(room.code, {
              type: 'BATTLE_CARD_APPLIED',
              payload: {
                cardId,
                senderId: verifiedPlayerId,
                senderName: sender.displayName,
                targetId: verifiedPlayerId,
                targetIds: [verifiedPlayerId],
                blockedByIds: [],
                targetName: sender.displayName,
                blockedByShield: false,
                stolenAmount: 0,
                room: sanitizeRoomForClient(room)
              }
            });
            break;
          }

          if (cardId === 'CARD_STEAL_POINTS') {
            const topTarget = [...opponents].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
            if (topTarget && roomActiveShields[room.code][topTarget.id]) {
              roomActiveShields[room.code][topTarget.id] = false;
              broadcastToRoom(room.code, {
                type: 'BATTLE_CARD_APPLIED',
                payload: {
                  cardId,
                  senderId: verifiedPlayerId,
                  senderName: sender.displayName,
                  targetId: topTarget.id,
                  targetIds: [],
                  blockedByIds: [topTarget.id],
                  targetName: topTarget.displayName,
                  blockedByShield: true,
                  stolenAmount: 0,
                  room: sanitizeRoomForClient(room)
                }
              });
              break;
            }

            let stolenAmount = 0;
            if (topTarget) {
              stolenAmount = Math.min(100, Math.max(0, topTarget.score || 0));
              topTarget.score = Math.max(0, (topTarget.score || 0) - stolenAmount);
              topTarget.totalScore = Math.max(0, (topTarget.totalScore ?? topTarget.score) - stolenAmount);
              sender.score = (sender.score || 0) + stolenAmount;
              sender.totalScore = (sender.totalScore ?? sender.score) + stolenAmount;
            }

            broadcastToRoom(room.code, {
              type: 'BATTLE_CARD_APPLIED',
              payload: {
                cardId,
                senderId: verifiedPlayerId,
                senderName: sender.displayName,
                targetId: topTarget?.id,
                targetIds: topTarget ? [topTarget.id] : [],
                blockedByIds: [],
                targetName: topTarget?.displayName,
                blockedByShield: false,
                stolenAmount,
                room: sanitizeRoomForClient(room)
              }
            });
            break;
          }

          // Debuff attack cards (CARD_FREEZE_OPPONENT / CARD_SANDSTORM / CARD_BLIND_WORDS) apply to all unshielded opponents
          const targetIds: string[] = [];
          const blockedByIds: string[] = [];
          opponents.forEach(opp => {
            if (roomActiveShields[room.code][opp.id]) {
              roomActiveShields[room.code][opp.id] = false;
              blockedByIds.push(opp.id);
            } else {
              targetIds.push(opp.id);
            }
          });

          const primaryTarget =
            opponents.find(o => targetIds.includes(o.id)) ||
            opponents.find(o => blockedByIds.includes(o.id)) ||
            opponents[0];

          broadcastToRoom(room.code, {
            type: 'BATTLE_CARD_APPLIED',
            payload: {
              cardId,
              senderId: verifiedPlayerId,
              senderName: sender.displayName,
              targetId: primaryTarget?.id,
              targetIds,
              blockedByIds,
              targetName:
                targetIds.length > 1
                  ? 'جميع المنافسين'
                  : primaryTarget?.displayName,
              blockedByShield: blockedByIds.length > 0 && targetIds.length === 0,
              stolenAmount: 0,
              room: sanitizeRoomForClient(room)
            }
          });
          break;
        }

        case 'CHAT_MESSAGE': {
          const { code, sender, text } = payload || {};
          if (!verifySocketCaller(msg)) break;
          const memberCheck = verifySocketRoomMember(code);
          if (!memberCheck) break;
          const { room, playerId: verifiedPlayerId } = memberCheck;

          // Guideline 1.2: Strictly allow only curated quick reactions (zero free-text chat abuse)
          if (!isAllowedQuickReaction(text)) {
            ws.send(
              JSON.stringify({
                type: 'ERROR',
                payload: {
                  code: 'CHAT_REACTION_NOT_ALLOWED',
                  message: 'يُسمح فقط باستخدام عبارات التفاعل السريعة المعتمدة'
                }
              })
            );
            break;
          }

          const senderPlayer = room.players[verifiedPlayerId];
          const actualSender = senderPlayer?.displayName || sender || 'لاعب';
          const senderUsername = normalizeUsername(senderPlayer?.username);
          const chatItem = { sender: actualSender, text: text.trim(), time: Date.now() };
          room.chatMessages.push(chatItem);
          room.chatMessages = room.chatMessages.slice(-40);

          const sockets = roomSockets[room.code];
          if (sockets) {
            const payloadStr = JSON.stringify({
              type: 'CHAT_BROADCAST',
              payload: { chatItem, senderUsername }
            });
            sockets.forEach((clientWs, targetPid) => {
              const targetUsername = normalizeUsername(room.players[targetPid]?.username);
              if (targetPid !== verifiedPlayerId && senderUsername && targetUsername && isUserBlockedEitherWay(senderUsername, targetUsername)) {
                return;
              }
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(payloadStr);
              }
            });
          }
          break;
        }

        case 'PING': {
          if (boundRoomCode && boundPlayerId && activeRooms[boundRoomCode]?.players[boundPlayerId]) {
            activeRooms[boundRoomCode].players[boundPlayerId].lastPing = Date.now();
          }
          ws.send(JSON.stringify({ type: 'PONG', payload: { time: Date.now() } }));
          break;
        }
      }
    } catch (err) {
      console.error('WebSocket message parsing error:', err);
    }
  });

  ws.on('close', () => {
    allLobbySockets.delete(ws);
    if (boundUsername) {
      const setForUser = userPresenceSockets.get(boundUsername);
      if (setForUser) {
        setForUser.delete(ws);
        if (setForUser.size === 0) {
          userPresenceSockets.delete(boundUsername);
        }
      }
      userLastSeen.set(boundUsername, Date.now());
    }
    if (boundRoomCode && boundPlayerId) {
      const room = activeRooms[boundRoomCode];
      if (room && room.players[boundPlayerId]) {
        clearRoomBotTimers(boundRoomCode);
        room.players[boundPlayerId].connected = false;
        broadcastToRoom(boundRoomCode, {
          type: 'PLAYER_DISCONNECTED',
          payload: { playerId: boundPlayerId, playerName: room.players[boundPlayerId].displayName }
        });

        if (room.state === 'WAITING') {
          delete room.players[boundPlayerId];
          if (Object.keys(room.players).length === 0) {
            delete activeRooms[boundRoomCode];
            delete roomSockets[boundRoomCode];
          }
          broadcastPublicRooms();
        }
      }
      roomSockets[boundRoomCode]?.delete(boundPlayerId);
    }
    broadcastPresenceUpdate();
  });
});

// Public App Store Connect Privacy Policy & Support endpoints
app.get('/privacy-policy', (_req, res) => {
  const file = path.join(__dirname, 'public', 'privacy-policy.html');
  if (fs.existsSync(file)) {
    return res.sendFile(file);
  }
  res.redirect('/privacy-policy.html');
});

app.get('/support', (_req, res) => {
  const file = path.join(__dirname, 'public', 'support.html');
  if (fs.existsSync(file)) {
    return res.sendFile(file);
  }
  res.redirect('/support.html');
});

function resolveServerPort(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
      const p = Number(args[i + 1]);
      if (!isNaN(p) && p > 0) return p;
    }
  }
  if (process.env.NODE_ENV === 'production') {
    return Number(process.env.PORT) || 8080;
  }
  // In AI Studio dev environment, port 8080 is reserved for nginx reverse proxy; dev server must bind to port 3000
  if (process.env.PORT && Number(process.env.PORT) !== 8080) {
    return Number(process.env.PORT);
  }
  return 3000;
}

// Vite or Static handling
async function startServer() {
  const PORT = resolveServerPort();
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Central error-handling middleware for database persistence and server errors
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }
    console.error('[SERVER / PERSISTENCE ERROR CAUGHT]', err);
    const status = typeof err?.status === 'number' ? err.status : 500;
    res.status(status).json({
      success: false,
      error: err?.message || 'فشل حفظ البيانات أو معالجة الطلب في الخادم'
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  ➜  Local:   http://localhost:${PORT}/`);
    console.log(`  ➜  Network: http://0.0.0.0:${PORT}/`);
    console.log(`Fatteshha Game Server is live on http://0.0.0.0:${PORT}\n`);
    // Start automated 6-hour periodic backup schedule for production DB
    startPeriodicBackupSchedule(DB_FILE, { testDbFile: TEST_DB_FILE });
  });
}

startServer();
