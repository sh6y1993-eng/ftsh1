import { createClient, SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
import { PlayerProfile, DailyChallengeTask, DailyChallengesState, DailyStreakState } from '../types/game';
import { evaluateAndGrantAchievements } from '../engine/gameCategories';
import {
  isNativeIOSApp,
  performNativeIOSAppleSignIn,
  resolveApiUrl
} from '../utils/iosNative';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};

function normalizeSupabaseUrl(raw?: string): string {
  if (!raw) return '';
  let trimmed = raw
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')
    .trim()
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/^\/+/, '');
  // Recover gracefully if a Markdown link "[https://...](https://...)" was pasted into an env var
  const mdMatch = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (mdMatch) {
    trimmed = (mdMatch[2] || mdMatch[1]).trim();
  }
  const urlMatch = trimmed.match(/https?:\/\/[^\s)\]"'<>`]+/i);
  if (urlMatch) {
    trimmed = urlMatch[0].replace(/\/+$/, '');
  }
  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      parsed.hostname.includes('.') &&
      !parsed.hostname.endsWith('.vercel.app') &&
      !parsed.hostname.endsWith('.netlify.app')
    ) {
      return `${parsed.protocol}//${parsed.host}`;
    }
  } catch {
    // invalid URL
  }
  return '';
}

const DEFAULT_PUBLIC_SUPABASE_URL = 'https://seapoygnqbuzebwzvztf.supabase.co';
const DEFAULT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_CpeWqXKruUzo97uHh5Ccuw_DSfaTWOX';

const SUPABASE_URL =
  normalizeSupabaseUrl(env.VITE_SUPABASE_URL) ||
  normalizeSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL) ||
  normalizeSupabaseUrl(env.SUPABASE_URL) ||
  DEFAULT_PUBLIC_SUPABASE_URL;

const SUPABASE_ANON_KEY = (
  env.VITE_SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  env.SUPABASE_ANON_KEY ||
  DEFAULT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
).trim();

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let supabaseInstance: SupabaseClient | null = null;
if (isSupabaseConfigured) {
  try {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  } catch (err) {
    console.warn('Supabase initialization warning:', err);
    supabaseInstance = null;
  }
}

export const supabase: SupabaseClient | null = supabaseInstance;

const LOCAL_USERS_DB_KEY = 'fatteshha_users_db_v1';
const LOCAL_PASSWORDS_DB_KEY = 'fatteshha_auth_passwords_v1';
const LOCAL_EMAILS_DB_KEY = 'fatteshha_auth_emails_v1';
const LOCAL_AUTH_TOKENS_KEY = 'fatteshha_auth_tokens_v1';

export function extractTokenUsernameClient(token?: string | null): string | null {
  if (!token || typeof token !== 'string') return null;
  const trimmed = token.replace(/^Bearer\s+/i, '').trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== 'fts_tok') return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    const json = atob(b64 + pad);
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed.username === 'string' && parsed.username.trim()) {
      return parsed.username.trim().replace(/^@+/, '').toLowerCase().replace(/\s+/g, '_');
    }
  } catch {
    // ignore malformed token
  }
  return null;
}

function tokenMatchesUsername(token: string | null | undefined, expectedUsername?: string | null): boolean {
  if (!token || typeof token !== 'string') return false;
  if (!expectedUsername) return true;
  const cleanExpected = expectedUsername.trim().replace(/^@+/, '').toLowerCase().replace(/\s+/g, '_');
  const tokenUser = extractTokenUsernameClient(token);
  return !tokenUser || tokenUser === cleanExpected;
}

export function getStoredAuthToken(username?: string | null): string | null {
  try {
    const rawMap = localStorage.getItem(LOCAL_AUTH_TOKENS_KEY);
    const map: Record<string, string> = rawMap ? JSON.parse(rawMap) : {};
    if (username) {
      const clean = username.trim().replace(/^@+/, '').toLowerCase().replace(/\s+/g, '_');
      if (map[clean]) {
        if (tokenMatchesUsername(map[clean], clean)) {
          return map[clean];
        }
        delete map[clean];
        localStorage.setItem(LOCAL_AUTH_TOKENS_KEY, JSON.stringify(map));
      }
      const activeToken = localStorage.getItem('fatteshha_active_token');
      if (activeToken && extractTokenUsernameClient(activeToken) === clean) {
        return activeToken;
      }
      return null;
    }

    const activeUser = localStorage.getItem('fatteshha_active_user');
    const cleanActiveUser = activeUser
      ? activeUser.trim().replace(/^@+/, '').toLowerCase().replace(/\s+/g, '_')
      : '';
    if (cleanActiveUser) {
      if (map[cleanActiveUser] && tokenMatchesUsername(map[cleanActiveUser], cleanActiveUser)) {
        return map[cleanActiveUser];
      }
      const activeToken = localStorage.getItem('fatteshha_active_token');
      if (activeToken && tokenMatchesUsername(activeToken, cleanActiveUser)) {
        return activeToken;
      }
      return null;
    }

    const activeToken = localStorage.getItem('fatteshha_active_token');
    if (activeToken) return activeToken;
  } catch {
    // ignore storage errors
  }
  return null;
}

export function saveStoredAuthToken(username: string, token?: string): void {
  if (!token || !username) return;
  try {
    const clean = username.trim().replace(/^@+/, '').toLowerCase().replace(/\s+/g, '_');
    if (!tokenMatchesUsername(token, clean)) {
      return;
    }
    const rawMap = localStorage.getItem(LOCAL_AUTH_TOKENS_KEY);
    const map: Record<string, string> = rawMap ? JSON.parse(rawMap) : {};
    map[clean] = token;
    localStorage.setItem(LOCAL_AUTH_TOKENS_KEY, JSON.stringify(map));
    localStorage.setItem('fatteshha_active_token', token);
  } catch {
    // ignore storage errors
  }
}

export function clearStoredAuthToken(username?: string | null): void {
  try {
    if (username) {
      const clean = username.trim().replace(/^@+/, '').toLowerCase().replace(/\s+/g, '_');
      const rawMap = localStorage.getItem(LOCAL_AUTH_TOKENS_KEY);
      if (rawMap) {
        const map: Record<string, string> = JSON.parse(rawMap);
        if (map[clean]) {
          delete map[clean];
          localStorage.setItem(LOCAL_AUTH_TOKENS_KEY, JSON.stringify(map));
        }
      }
      const activeTok = localStorage.getItem('fatteshha_active_token');
      const tokUser = extractTokenUsernameClient(activeTok);
      if (activeTok && (!tokUser || tokUser === clean)) {
        localStorage.removeItem('fatteshha_active_token');
      }
    } else {
      localStorage.removeItem('fatteshha_active_token');
    }
  } catch {
    // ignore storage errors
  }
}

// Safe API fetch helper that attaches auth tokens and resolves iOS Capacitor API URLs without mutating window.fetch
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith('/api/') || urlStr.includes('/api/')) {
      const resolvedUrl = urlStr.startsWith('/api/') ? resolveApiUrl(urlStr) : urlStr;
      const headers = new Headers(init?.headers || {});
      const activeToken = getStoredAuthToken();
      if (activeToken && !headers.has('Authorization') && !headers.has('x-auth-token')) {
        headers.set('Authorization', `Bearer ${activeToken}`);
        headers.set('x-auth-token', activeToken);
      }
      if (typeof window !== 'undefined') {
        const activeUser = localStorage.getItem('fatteshha_active_user');
        if (activeUser && !headers.has('x-user-id')) {
          headers.set('x-user-id', activeUser);
        }
      }
      return globalThis.fetch(resolvedUrl, { ...init, headers });
    }
  } catch {
    // fallback to globalThis.fetch
  }
  return globalThis.fetch(input, init);
}

// Deterministic password hash for verification across Supabase profiles & local fallback
function hashPassword(usernameKey: string, rawPassword: string): string {
  const normalized = `${usernameKey.trim().toLowerCase()}::${rawPassword}`;
  let h1 = 0xdeadbeef ^ normalized.length;
  let h2 = 0x41c6ce57 ^ normalized.length;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `fts_pw_${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

function loadLocalPasswordsMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LOCAL_PASSWORDS_DB_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveLocalPasswordHash(key: string, hash: string): void {
  try {
    const map = loadLocalPasswordsMap();
    map[key.trim().toLowerCase()] = hash;
    localStorage.setItem(LOCAL_PASSWORDS_DB_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

function loadLocalEmailsMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LOCAL_EMAILS_DB_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveLocalUserEmail(usernameKey: string, email: string): void {
  try {
    const map = loadLocalEmailsMap();
    map[usernameKey.trim().toLowerCase()] = email.trim().toLowerCase();
    localStorage.setItem(LOCAL_EMAILS_DB_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

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
  return 50 + clamped * 20;
}

const DEFAULT_DAILY_TASKS: Omit<DailyChallengeTask, 'current' | 'completed' | 'claimed'>[] = [
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
    id: 'dc_complete_2_levels',
    type: 'COMPLETE_LEVELS',
    title: 'بطل المراحل',
    description: 'أكمل مرحلتين اليوم في أي تصنيف',
    target: 2,
    rewardCoins: 180,
    rewardXP: 150
  },
  {
    id: 'dc_accuracy_90',
    type: 'HIGH_ACCURACY',
    title: 'نظرة صقر',
    description: 'أنهِ مرحلة بدقة تحديد 90% أو أعلى',
    target: 1,
    rewardCoins: 160,
    rewardXP: 130
  }
];

export function createDefaultDailyChallenges(): DailyChallengesState {
  return {
    dateKey: getTodayDateKey(),
    tasks: DEFAULT_DAILY_TASKS.map(t => ({
      ...t,
      current: 0,
      completed: false,
      claimed: false
    }))
  };
}

export function createDefaultDailyStreak(): DailyStreakState {
  const today = getTodayDateKey();
  const yesterday = getOffsetDateKey(-1);
  return {
    currentStreak: 1,
    longestStreak: 1,
    lastCompletedDate: yesterday,
    lastLoginDate: today,
    completedToday: false,
    todayBonusCoins: 0,
    nextBonusCoins: calculateStreakBonusCoins(2),
    streakHistory: [yesterday]
  };
}

// Normalize username while preserving Arabic or English characters cleanly
export function normalizeUsernameKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_');
}

export const DEFAULT_FREE_ACCOUNT_COINS = 20000;

export function ensureFullProfileDefaults(profile: PlayerProfile): PlayerProfile {
  const completedLevels = profile.completedLevels || {};
  const completedCount = Object.keys(completedLevels).length;
  const derivedTotalScore =
    typeof profile.totalScore === 'number' && profile.totalScore > 0
      ? profile.totalScore
      : Object.values(completedLevels).reduce((sum, lvl) => sum + (lvl.score || 0), 0);
  const derivedWordsFound =
    typeof profile.totalWordsFound === 'number' && profile.totalWordsFound > 0
      ? profile.totalWordsFound
      : completedCount * 6;

  const granted20k = profile.granted20kFreeCoins === true;
  const resolvedCoins = granted20k
    ? typeof profile.coins === 'number'
      ? profile.coins
      : DEFAULT_FREE_ACCOUNT_COINS
    : Math.max(typeof profile.coins === 'number' ? profile.coins : 0, DEFAULT_FREE_ACCOUNT_COINS);

  const rawDaily = profile.dailyChallenges || createDefaultDailyChallenges();
  const normalizedDaily: DailyChallengesState = {
    ...rawDaily,
    tasks: Array.isArray(rawDaily.tasks)
      ? rawDaily.tasks.map((t, idx) => {
          if (t.completed && t.claimed && idx > 0 && t.manualClaimed === undefined) {
            return { ...t, claimed: false, manualClaimed: false };
          }
          return t;
        })
      : createDefaultDailyChallenges().tasks
  };

  return {
    ...profile,
    coins: resolvedCoins,
    granted20kFreeCoins: true,
    completedLevels,
    completedLevelsCount: Math.max(profile.completedLevelsCount || 0, completedCount),
    totalScore: derivedTotalScore,
    totalWordsFound: derivedWordsFound,
    perfectStagesCount:
      typeof profile.perfectStagesCount === 'number'
        ? profile.perfectStagesCount
        : Object.values(completedLevels).filter(l => (l.accuracy ?? 100) >= 100).length,
    fastStagesCount:
      typeof profile.fastStagesCount === 'number'
        ? profile.fastStagesCount
        : Object.values(completedLevels).filter(l => (l.bestTime ?? 99) < 45).length,
    selectedTitle: profile.selectedTitle || 'مستكشف الحروف',
    unlockedTitles:
      Array.isArray(profile.unlockedTitles) && profile.unlockedTitles.length > 0
        ? profile.unlockedTitles
        : ['مستكشف الحروف'],
    selectedCosmetic: profile.selectedCosmetic || 'frame_default_cyan',
    unlockedCosmetics:
      Array.isArray(profile.unlockedCosmetics) && profile.unlockedCosmetics.length > 0
        ? profile.unlockedCosmetics
        : ['frame_default_cyan'],
    powerUps: profile.powerUps || { FREEZE_TIME: 1, DOUBLE_BOOST: 1, STREAK_SHIELD: 0, TIME_EXTEND: 1 },
    battleCards: profile.battleCards || {
      CARD_FREEZE_OPPONENT: 2,
      CARD_SANDSTORM: 1,
      CARD_BLIND_WORDS: 1,
      CARD_STEAL_POINTS: 1,
      CARD_SHIELD: 1
    },
    unlockedBoardThemes:
      Array.isArray(profile.unlockedBoardThemes) && profile.unlockedBoardThemes.length > 0
        ? profile.unlockedBoardThemes
        : ['theme_kuwait_neon'],
    equippedBoardTheme: profile.equippedBoardTheme || 'theme_kuwait_neon',
    unlockedTrails:
      Array.isArray(profile.unlockedTrails) && profile.unlockedTrails.length > 0
        ? profile.unlockedTrails
        : ['trail_amber'],
    equippedTrail: profile.equippedTrail || 'trail_amber',
    unlockedNameGlows:
      Array.isArray(profile.unlockedNameGlows) && profile.unlockedNameGlows.length > 0
        ? profile.unlockedNameGlows
        : ['glow_none'],
    equippedNameGlow: profile.equippedNameGlow || 'glow_none',
    unlockedEmotePacks: Array.isArray(profile.unlockedEmotePacks) ? profile.unlockedEmotePacks : [],
    unlockedCategories: Array.isArray(profile.unlockedCategories) ? profile.unlockedCategories : [],
    unlockedAvatars: Array.isArray(profile.unlockedAvatars) ? profile.unlockedAvatars : [],
    unlockedOnlineModes: Array.from(
      new Set([...(Array.isArray(profile.unlockedOnlineModes) ? profile.unlockedOnlineModes : []), 'SPEED_REVEAL_20S'])
    ),
    isVip: Boolean(profile.isVip),
    seasonXp: typeof profile.seasonXp === 'number' ? profile.seasonXp : profile.xp || 0,
    claimedSeasonTiers: Array.isArray(profile.claimedSeasonTiers) ? profile.claimedSeasonTiers : [],
    starterPackPurchased: Boolean(profile.starterPackPurchased),
    friends: Array.isArray(profile.friends) ? profile.friends : [],
    achievements: Array.isArray(profile.achievements) ? profile.achievements : [],
    dailyChallenges: normalizedDaily,
    dailyStreak: profile.dailyStreak || createDefaultDailyStreak()
  };
}

type CompletedLevelEntry = NonNullable<PlayerProfile['completedLevels']>[string];

export function mergeCompletedLevelsMap(
  a?: PlayerProfile['completedLevels'] | null,
  b?: PlayerProfile['completedLevels'] | null
): NonNullable<PlayerProfile['completedLevels']> {
  const merged: NonNullable<PlayerProfile['completedLevels']> = {};
  const addSource = (src?: PlayerProfile['completedLevels'] | null) => {
    if (!src || typeof src !== 'object') return;
    Object.entries(src).forEach(([key, rec]) => {
      if (!rec || typeof rec !== 'object') return;
      const existing = merged[key];
      const nextStars = Math.max(0, Number(rec.stars) || 0);
      const nextTime = Number(rec.bestTime) > 0 ? Number(rec.bestTime) : 9999;
      const nextScore = Math.max(0, Number(rec.score) || 0);
      const nextAccuracy = Math.max(0, Number(rec.accuracy) || 0);
      if (!existing) {
        merged[key] = {
          stars: nextStars,
          bestTime: nextTime,
          score: nextScore,
          ...(nextAccuracy > 0 ? { accuracy: nextAccuracy } : {}),
          ...(rec.completedAt ? { completedAt: rec.completedAt } : {})
        };
      } else {
        const bestAccuracy = Math.max(Number(existing.accuracy) || 0, nextAccuracy);
        merged[key] = {
          stars: Math.max(Number(existing.stars) || 0, nextStars),
          bestTime: Math.min(
            Number(existing.bestTime) > 0 ? Number(existing.bestTime) : 9999,
            nextTime
          ),
          score: Math.max(Number(existing.score) || 0, nextScore),
          ...(bestAccuracy > 0 ? { accuracy: bestAccuracy } : {}),
          completedAt: existing.completedAt || rec.completedAt
        };
      }
    });
  };
  addSource(a);
  addSource(b);
  return merged;
}

export function mergePlayerProfiles(
  primary: PlayerProfile,
  secondary?: PlayerProfile | null
): PlayerProfile {
  if (!secondary) {
    return ensureFullProfileDefaults(primary);
  }
  const primaryKey = normalizeUsernameKey(primary.username || '');
  const secondaryKey = normalizeUsernameKey(secondary.username || '');
  if (primaryKey && secondaryKey && primaryKey !== secondaryKey) {
    return ensureFullProfileDefaults(primary);
  }

  const mergedCompleted = mergeCompletedLevelsMap(primary.completedLevels, secondary.completedLevels);
  const completedCount = Object.keys(mergedCompleted).length;
  const completedScoreSum = Object.values(mergedCompleted).reduce(
    (sum, lvl) => sum + (Number(lvl?.score) || 0),
    0
  );

  const primaryHasProgress =
    (Number(primary.xp) || 0) > 0 || Object.keys(primary.completedLevels || {}).length > 0;
  const secondaryHasProgress =
    (Number(secondary.xp) || 0) > 0 || Object.keys(secondary.completedLevels || {}).length > 0;

  const resolvedCoins =
    !primaryHasProgress && secondaryHasProgress && typeof secondary.coins === 'number'
      ? secondary.coins
      : typeof primary.coins === 'number'
        ? primary.coins
        : secondary.coins;

  const mergedXp = Math.max(Number(primary.xp) || 0, Number(secondary.xp) || 0);
  const mergedLevel = Math.max(
    Number(primary.level) || 1,
    Number(secondary.level) || 1,
    Math.floor(mergedXp / 300) + 1
  );

  const unionStrings = (arrA?: string[], arrB?: string[]): string[] | undefined => {
    if (!Array.isArray(arrA) && !Array.isArray(arrB)) return undefined;
    return Array.from(new Set([...(arrA || []), ...(arrB || [])]));
  };

  const mergedProfile: PlayerProfile = {
    ...secondary,
    ...primary,
    id: primary.id || secondary.id,
    username: primary.username || secondary.username,
    displayName: primary.displayName || secondary.displayName,
    avatar: primary.avatar || secondary.avatar,
    email: primary.email || secondary.email,
    authToken:
      [primary.authToken, secondary.authToken].find(t =>
        tokenMatchesUsername(t, primary.username || secondary.username)
      ) || undefined,
    xp: mergedXp,
    level: mergedLevel,
    seasonXp: Math.max(Number(primary.seasonXp) || 0, Number(secondary.seasonXp) || 0, mergedXp),
    coins: typeof resolvedCoins === 'number' ? resolvedCoins : DEFAULT_FREE_ACCOUNT_COINS,
    hintsRemaining:
      !primaryHasProgress && secondaryHasProgress
        ? Math.max(Number(primary.hintsRemaining) || 0, Number(secondary.hintsRemaining) || 0)
        : typeof primary.hintsRemaining === 'number'
          ? primary.hintsRemaining
          : secondary.hintsRemaining,
    completedLevels: mergedCompleted,
    completedLevelsCount: Math.max(
      Number(primary.completedLevelsCount) || 0,
      Number(secondary.completedLevelsCount) || 0,
      completedCount
    ),
    totalScore: Math.max(
      Number(primary.totalScore) || 0,
      Number(secondary.totalScore) || 0,
      completedScoreSum
    ),
    totalWordsFound: Math.max(
      Number(primary.totalWordsFound) || 0,
      Number(secondary.totalWordsFound) || 0,
      completedCount * 6
    ),
    perfectStagesCount: Math.max(
      Number(primary.perfectStagesCount) || 0,
      Number(secondary.perfectStagesCount) || 0
    ),
    fastStagesCount: Math.max(
      Number(primary.fastStagesCount) || 0,
      Number(secondary.fastStagesCount) || 0
    ),
    multiplayerWins: Math.max(
      Number(primary.multiplayerWins) || 0,
      Number(secondary.multiplayerWins) || 0
    ),
    multiplayerLosses: Math.max(
      Number(primary.multiplayerLosses) || 0,
      Number(secondary.multiplayerLosses) || 0
    ),
    achievements: unionStrings(primary.achievements, secondary.achievements) || [],
    unlockedTitles: unionStrings(primary.unlockedTitles, secondary.unlockedTitles),
    unlockedCosmetics: unionStrings(primary.unlockedCosmetics, secondary.unlockedCosmetics),
    unlockedBoardThemes: unionStrings(primary.unlockedBoardThemes, secondary.unlockedBoardThemes),
    unlockedTrails: unionStrings(primary.unlockedTrails, secondary.unlockedTrails),
    unlockedNameGlows: unionStrings(primary.unlockedNameGlows, secondary.unlockedNameGlows),
    unlockedEmotePacks: unionStrings(primary.unlockedEmotePacks, secondary.unlockedEmotePacks),
    unlockedCategories: unionStrings(primary.unlockedCategories, secondary.unlockedCategories),
    unlockedAvatars: unionStrings(primary.unlockedAvatars, secondary.unlockedAvatars),
    unlockedOnlineModes: unionStrings(primary.unlockedOnlineModes, secondary.unlockedOnlineModes),
    friends: unionStrings(primary.friends, secondary.friends),
    claimedSeasonTiers: Array.from(
      new Set([...(primary.claimedSeasonTiers || []), ...(secondary.claimedSeasonTiers || [])])
    ),
    isVip: Boolean(primary.isVip || secondary.isVip),
    starterPackPurchased: Boolean(primary.starterPackPurchased || secondary.starterPackPurchased),
    granted20kFreeCoins: Boolean(primary.granted20kFreeCoins || secondary.granted20kFreeCoins)
  };

  return evaluateAndGrantAchievements(ensureFullProfileDefaults(mergedProfile)).updatedProfile;
}

export function loadLocalUsersMap(): Record<string, PlayerProfile> {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_DB_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PlayerProfile>;
    // Remove legacy fake demo accounts if they were previously stored
    if (parsed['ahmad_kwt']?.id === 'usr_ahmad_kwt') {
      delete parsed['ahmad_kwt'];
    }
    if (parsed['dana_q8']?.id === 'usr_dana_q8') {
      delete parsed['dana_q8'];
    }
    return parsed;
  } catch {
    return {};
  }
}

export function saveUserToLocalMap(profile: PlayerProfile): PlayerProfile {
  const cleanKey = normalizeUsernameKey(profile.username);
  const directProfileToken =
    profile.authToken && tokenMatchesUsername(profile.authToken, cleanKey) ? profile.authToken : undefined;
  const existingToken = directProfileToken || getStoredAuthToken(cleanKey) || undefined;
  let candidateProfile: PlayerProfile = {
    ...profile,
    authToken: existingToken
  };

  // Never allow a stale React closure or blank cloud/OAuth shell to wipe previously earned completed stages
  try {
    const currentMap = loadLocalUsersMap();
    const prevLocal = currentMap[cleanKey];
    if (prevLocal && !cleanKey.startsWith('guest_')) {
      const sanitizedPrev =
        prevLocal.authToken && !tokenMatchesUsername(prevLocal.authToken, cleanKey)
          ? { ...prevLocal, authToken: undefined }
          : prevLocal;
      candidateProfile = mergePlayerProfiles(candidateProfile, sanitizedPrev);
    }
  } catch {
    // ignore storage read errors
  }

  const enriched = evaluateAndGrantAchievements(
    ensureFullProfileDefaults(candidateProfile)
  ).updatedProfile;
  try {
    if (enriched.authToken && tokenMatchesUsername(enriched.authToken, cleanKey)) {
      saveStoredAuthToken(cleanKey, enriched.authToken);
    } else {
      enriched.authToken = undefined;
      localStorage.removeItem('fatteshha_active_token');
    }
    const map = loadLocalUsersMap();
    map[cleanKey] = enriched;
    localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(map));
    localStorage.setItem('fatteshha_active_user', cleanKey);
  } catch {
    // ignore storage errors
  }
  return enriched;
}

export function getLocalUserProfile(username?: string | null): PlayerProfile | null {
  const map = loadLocalUsersMap();
  const sanitizeLoaded = (raw: PlayerProfile): PlayerProfile => {
    const cleanToken =
      raw.authToken && tokenMatchesUsername(raw.authToken, raw.username)
        ? raw.authToken
        : getStoredAuthToken(raw.username) || undefined;
    return ensureFullProfileDefaults({
      ...raw,
      authToken: cleanToken
    });
  };
  if (username) {
    const clean = normalizeUsernameKey(username);
    if (map[clean]) return sanitizeLoaded(map[clean]);
  }
  try {
    const savedActive = localStorage.getItem('fatteshha_active_user');
    if (savedActive) {
      const cleanSaved = normalizeUsernameKey(savedActive);
      if (cleanSaved !== 'ahmad_kwt' && cleanSaved !== 'dana_q8' && map[cleanSaved]) {
        return sanitizeLoaded(map[cleanSaved]);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

// Safely parse JSON response from /api/* without crashing when Vercel/Netlify returns HTML 404
export async function safeApiJson<T = any>(url: string, options?: RequestInit): Promise<T | null> {
  const shouldTimeout = isNativeIOSApp() && !options?.signal;
  const controller = shouldTimeout && typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;
  try {
    const res = await apiFetch(url, controller ? { ...options, signal: controller.signal } : options);
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function syncAccountWithServerDetailed(
  profile: PlayerProfile,
  passwordHash?: string
): Promise<{ profile: PlayerProfile; serverSynced: boolean }> {
  const candidateToken =
    profile.authToken && tokenMatchesUsername(profile.authToken, profile.username)
      ? profile.authToken
      : getStoredAuthToken(profile.username);
  const token = candidateToken || undefined;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-auth-token'] = token;
  }
  const apiRes = await safeApiJson<{ success?: boolean; user?: PlayerProfile; authToken?: string }>(
    '/api/auth/sync-account',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        avatar: profile.avatar,
        passwordHash,
        authToken: token,
        selectedTitle: profile.selectedTitle,
        selectedCosmetic: profile.selectedCosmetic,
        equippedBoardTheme: profile.equippedBoardTheme,
        equippedTrail: profile.equippedTrail,
        equippedNameGlow: profile.equippedNameGlow,
        friends: profile.friends
      })
    }
  );
  if (apiRes?.success && apiRes.user) {
    const userWithToken: PlayerProfile = {
      ...apiRes.user,
      authToken: apiRes.authToken || apiRes.user.authToken || token || undefined
    };
    return { profile: saveUserToLocalMap(userWithToken), serverSynced: true };
  }
  return { profile: saveUserToLocalMap(profile), serverSynced: false };
}

// Sync account with Express server (/api/auth/sync-account) as the authoritative source of truth
export async function syncAccountWithServer(
  profile: PlayerProfile,
  passwordHash?: string
): Promise<PlayerProfile> {
  const result = await syncAccountWithServerDetailed(profile, passwordHash);
  return result.profile;
}

async function getSupabaseRestHeaders(extraHeaders?: Record<string, string>): Promise<Record<string, string>> {
  let bearer = SUPABASE_ANON_KEY;
  if (supabase) {
    try {
      const { data } = await Promise.race([
        supabase.auth.getSession(),
        new Promise<{ data: null }>(resolve => setTimeout(() => resolve({ data: null }), 1200))
      ]);
      if (data?.session?.access_token) {
        bearer = data.session.access_token;
      }
    } catch {
      // Fallback to anon key
    }
  }
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${bearer}`,
    ...(extraHeaders || {})
  };
}

function hydrateProfileFromSupabaseRow(row: any, fallbackUsername?: string): PlayerProfile {
  const rowUserKey = normalizeUsernameKey(row?.username || fallbackUsername || 'player');
  const completedLevels =
    row?.completed_levels && typeof row.completed_levels === 'object' ? row.completed_levels : {};
  const completedCount = Object.keys(completedLevels).length;
  const scoreSum = Object.values(completedLevels).reduce(
    (sum: number, lvl: any) => sum + (Number(lvl?.score) || 0),
    0
  );

  return ensureFullProfileDefaults({
    id: row?.id || `usr_${rowUserKey}`,
    username: rowUserKey,
    displayName: row?.display_name || rowUserKey,
    ...(row?.email ? { email: String(row.email).toLowerCase() } : {}),
    avatar: row?.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
    level: Math.max(Number(row?.level) || 1, Math.floor((Number(row?.xp) || 0) / 300) + 1),
    xp: Number(row?.xp) || 0,
    coins: typeof row?.coins === 'number' ? row.coins : DEFAULT_FREE_ACCOUNT_COINS,
    hintsRemaining: typeof row?.hints_remaining === 'number' ? row.hints_remaining : 5,
    completedLevelsCount: completedCount,
    completedLevels,
    dailyChallenges: createDefaultDailyChallenges(),
    dailyStreak: createDefaultDailyStreak(),
    friends: [],
    totalScore: scoreSum,
    totalWordsFound: completedCount * 6,
    perfectStagesCount: Object.values(completedLevels).filter((l: any) => (l?.accuracy ?? 100) >= 100).length,
    fastStagesCount: Object.values(completedLevels).filter((l: any) => (l?.bestTime ?? 99) < 45).length,
    selectedTitle: 'مستكشف الحروف',
    unlockedTitles: ['مستكشف الحروف'],
    selectedCosmetic: 'frame_default_cyan',
    unlockedCosmetics: ['frame_default_cyan'],
    multiplayerWins: Number(row?.multiplayer_wins) || 0,
    multiplayerLosses: Number(row?.multiplayer_losses) || 0,
    achievements: Array.isArray(row?.achievements) ? row.achievements : [],
    createdAt: row?.created_at || new Date().toISOString()
  });
}

export async function fetchCloudProfileFromSupabase(
  usernameOrEmail: string,
  secondaryEmail?: string
): Promise<PlayerProfile | null> {
  if (!isSupabaseConfigured) return null;
  const raw = (usernameOrEmail || '').trim();
  if (!raw) return null;
  const cleanUser = normalizeUsernameKey(raw);
  if (
    cleanUser.startsWith('room_cache_') ||
    cleanUser.startsWith('social_cache_') ||
    cleanUser.startsWith('sec_user_') ||
    cleanUser.startsWith('audit_p') ||
    cleanUser.startsWith('test_iso_')
  ) {
    return null;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;
  try {
    const headers = await getSupabaseRestHeaders();
    const filterParam = raw.includes('@')
      ? `email=eq.${encodeURIComponent(raw.toLowerCase())}`
      : `username=eq.${encodeURIComponent(cleanUser)}`;
    const res = await globalThis.fetch(
      `${SUPABASE_URL}/rest/v1/profiles?${filterParam}&select=*&limit=1`,
      {
        method: 'GET',
        headers,
        ...(controller ? { signal: controller.signal } : {})
      }
    );
    if (res.ok) {
      const rows = (await res.json().catch(() => [])) as any[];
      if (Array.isArray(rows) && rows.length > 0) {
        return hydrateProfileFromSupabaseRow(rows[0], cleanUser);
      }
    }

    if (secondaryEmail && secondaryEmail.includes('@')) {
      const emailRes = await globalThis.fetch(
        `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(secondaryEmail.trim().toLowerCase())}&select=*&limit=1`,
        {
          method: 'GET',
          headers,
          ...(controller ? { signal: controller.signal } : {})
        }
      );
      if (emailRes.ok) {
        const rows = (await emailRes.json().catch(() => [])) as any[];
        if (Array.isArray(rows) && rows.length > 0) {
          return hydrateProfileFromSupabaseRow(rows[0], cleanUser);
        }
      }
    }
  } catch {
    // Non-blocking lookup
  } finally {
    if (timer) clearTimeout(timer);
  }
  return null;
}

// Sync profile via authoritative Express backend (or merge-before-write Supabase fallback on static hosts)
export async function syncProfileWithSupabase(
  profile: PlayerProfile,
  email?: string,
  passwordHash?: string
): Promise<PlayerProfile> {
  const { profile: serverProfile, serverSynced } = await syncAccountWithServerDetailed(profile, passwordHash);
  let normalizedProfile = mergePlayerProfiles(serverProfile, profile);

  if (
    !serverSynced &&
    isSupabaseConfigured &&
    !normalizedProfile.username.startsWith('room_cache_') &&
    !normalizedProfile.username.startsWith('social_cache_')
  ) {
    try {
      const cleanUser = normalizeUsernameKey(normalizedProfile.username);
      // CRITICAL: Always fetch existing cloud progress BEFORE writing so a fresh browser/OAuth session NEVER wipes completed stages
      const cloudExisting = await fetchCloudProfileFromSupabase(cleanUser, email);
      if (cloudExisting) {
        normalizedProfile = mergePlayerProfiles(normalizedProfile, cloudExisting);
        normalizedProfile = saveUserToLocalMap(normalizedProfile);
      }

      const payload: Record<string, unknown> = {
        id: normalizedProfile.id || `usr_${cleanUser}`,
        username: cleanUser,
        display_name: normalizedProfile.displayName || cleanUser,
        avatar: normalizedProfile.avatar,
        level: normalizedProfile.level || 1,
        xp: normalizedProfile.xp || 0,
        coins: typeof normalizedProfile.coins === 'number' ? normalizedProfile.coins : DEFAULT_FREE_ACCOUNT_COINS,
        hints_remaining: typeof normalizedProfile.hintsRemaining === 'number' ? normalizedProfile.hintsRemaining : 5,
        completed_levels: normalizedProfile.completedLevels || {},
        multiplayer_wins: normalizedProfile.multiplayerWins || 0,
        multiplayer_losses: normalizedProfile.multiplayerLosses || 0,
        achievements: normalizedProfile.achievements || [],
        updated_at: new Date().toISOString()
      };
      if (email && email.includes('@')) {
        payload.email = email.trim().toLowerCase();
      }
      const resolvedPwHash = passwordHash || loadLocalPasswordsMap()[cleanUser];
      if (resolvedPwHash) {
        payload.password_hash = resolvedPwHash;
      }
      const headers = await getSupabaseRestHeaders({
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      });
      await globalThis.fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=username`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
    } catch {
      // Non-blocking fallback
    }
  }
  return normalizedProfile;
}

// Synchronously convert a verified Supabase Auth user into an immediate PlayerProfile (never stalls or throws)
export function createQuickProfileFromSupabaseUser(
  sbUser: SupabaseUser,
  fallbackDisplayName?: string
): PlayerProfile {
  const email = (sbUser.email || '').trim().toLowerCase();
  const meta = sbUser.user_metadata || {};
  const emailPrefix = email ? email.split('@')[0] : '';
  const cleanUsername = normalizeUsernameKey(
    meta.username || emailPrefix || `user_${sbUser.id.slice(0, 8)}`
  );

  const displayName =
    fallbackDisplayName?.trim() ||
    meta.full_name ||
    meta.name ||
    meta.username ||
    emailPrefix ||
    'لاعب فتّشها';
  const avatar =
    meta.avatar_url ||
    meta.picture ||
    '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg';

  const localMap = loadLocalUsersMap();
  const existingLocal = localMap[cleanUsername];

  const baseProfile: PlayerProfile = existingLocal
    ? {
        ...existingLocal,
        id: sbUser.id || existingLocal.id,
        displayName: displayName || existingLocal.displayName,
        avatar: avatar || existingLocal.avatar
      }
    : {
        id: sbUser.id,
        username: cleanUsername,
        displayName,
        avatar,
        level: 1,
        xp: 0,
        coins: DEFAULT_FREE_ACCOUNT_COINS,
        hintsRemaining: 5,
        completedLevelsCount: 0,
        completedLevels: {},
        dailyChallenges: createDefaultDailyChallenges(),
        dailyStreak: createDefaultDailyStreak(),
        friends: [],
        totalScore: 0,
        totalWordsFound: 0,
        perfectStagesCount: 0,
        fastStagesCount: 0,
        selectedTitle: 'مستكشف الحروف',
        unlockedTitles: ['مستكشف الحروف'],
        selectedCosmetic: 'frame_default_cyan',
        unlockedCosmetics: ['frame_default_cyan'],
        multiplayerWins: 0,
        multiplayerLosses: 0,
        achievements: [],
        createdAt: new Date().toISOString()
      };

  return saveUserToLocalMap(baseProfile);
}

// Convert a verified Supabase Auth user (from Google OAuth or Email Auth) into a cloud-synced PlayerProfile
export async function buildProfileFromSupabaseUser(
  sbUser: SupabaseUser,
  fallbackDisplayName?: string
): Promise<PlayerProfile> {
  const email = (sbUser.email || '').trim().toLowerCase();
  const savedLocal = createQuickProfileFromSupabaseUser(sbUser, fallbackDisplayName);
  try {
    return await syncProfileWithSupabase(savedLocal, email);
  } catch (err) {
    console.warn('Cloud profile sync warning after OAuth:', err);
    return savedLocal;
  }
}

async function canStartSupabaseOAuthRedirect(oauthUrl: string): Promise<boolean> {
  try {
    const probe = await globalThis.fetch(oauthUrl, {
      method: 'GET',
      redirect: 'manual'
    });
    // HTTP 400+ (e.g. {"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"})
    if (probe.status >= 400) {
      return false;
    }
    // In redirect: 'manual', valid 302 redirects resolve as type 'opaqueredirect' (status 0) or 3xx
    return probe.type === 'opaqueredirect' || (probe.status >= 200 && probe.status < 400);
  } catch {
    return false;
  }
}

// ============================================================================
// 1. REAL GOOGLE OAUTH REDIRECT / POPUP VIA SUPABASE AUTH
// ============================================================================
export async function signInWithRealGoogleOAuth(): Promise<{
  redirected: boolean;
  isPopup?: boolean;
  error?: string;
}> {
  // Google blocks OAuth inside embedded iOS WKWebView (403 disallowed_useragent); use in-app verified modal instead
  if (!supabase || isNativeIOSApp()) {
    return { redirected: false };
  }

  try {
    const redirectTo = window.location.origin;
    const isInIframe = window.self !== window.top;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: {
          prompt: 'select_account'
        }
      }
    });
    if (error || !data?.url) {
      return { redirected: false, error: error?.message };
    }

    const enabled = await canStartSupabaseOAuthRedirect(data.url);
    if (!enabled) {
      return { redirected: false, error: 'Google OAuth provider is not enabled in Supabase' };
    }

    if (isInIframe) {
      const popup = window.open(data.url, 'google_oauth_popup', 'width=540,height=680');
      if (popup) {
        return { redirected: true, isPopup: true };
      }
      return { redirected: false };
    } else {
      window.location.href = data.url;
      return { redirected: true, isPopup: false };
    }
  } catch (err: any) {
    return {
      redirected: false,
      error: err?.message
    };
  }
}

function decodeJwtPayload(token?: string): { sub?: string; email?: string } | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(
      Array.prototype.map
        .call(atob(padded), (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json) as { sub?: string; email?: string };
  } catch {
    return null;
  }
}

// ============================================================================
// 1B. SIGN IN WITH APPLE (Native iOS Face ID Sheet / AppleID JS / Supabase / Express)
// ============================================================================
export async function signInWithAppleOAuth(): Promise<{
  redirected: boolean;
  canceled?: boolean;
  nativeError?: string;
  profile?: PlayerProfile;
  error?: string;
}> {
  // 0. Native iOS app: trigger official Apple system Sign in with Apple sheet (Face ID / Touch ID)
  if (isNativeIOSApp()) {
    const nativeRes = await performNativeIOSAppleSignIn();
    if (nativeRes.canceled) {
      return { redirected: false, canceled: true };
    }
    if (!nativeRes.success || !nativeRes.data) {
      return {
        redirected: false,
        nativeError: nativeRes.error || 'تعذر فتح شاشة تسجيل الدخول بحساب Apple على الآيفون'
      };
    }

    const { identityToken, fullName, rawNonce } = nativeRes.data;
    if (!identityToken) {
      return {
        redirected: false,
        nativeError: 'لم يتم استلام رمز مصادقة Apple الموقّع (identityToken) من الجهاز'
      };
    }

    // Optional Supabase Auth session creation when Apple provider is enabled in Supabase
    if (supabase && identityToken) {
      try {
        await Promise.race([
          supabase.auth.signInWithIdToken({
            provider: 'apple',
            token: identityToken,
            ...(rawNonce ? { nonce: rawNonce } : {})
          }),
          new Promise(resolve => setTimeout(resolve, 3000))
        ]);
      } catch {
        // Ignore if Apple provider isn't enabled in Supabase; Express verifies the Apple JWKS JWT directly
      }
    }

    try {
      const profile = await authenticateWithAppleAccount({
        identityToken,
        nonce: rawNonce || undefined,
        fullName: fullName || undefined
      });
      return { redirected: true, profile };
    } catch (err: any) {
      return {
        redirected: false,
        nativeError: err?.message || 'تعذر تسجيل الدخول بحساب Apple، يرجى المحاولة مرة أخرى'
      };
    }
  }

  // 1. Check if Native Apple JS SDK (AppleID.auth) is loaded in the web page
  if (typeof window !== 'undefined') {
    const winApple = (window as unknown as {
      AppleID?: {
        auth?: {
          signIn: () => Promise<{
            authorization?: { id_token?: string; code?: string };
            user?: { email?: string; name?: { firstName?: string; lastName?: string } };
          }>;
        };
      };
    }).AppleID;

    if (winApple?.auth?.signIn) {
      try {
        const appleRes = await winApple.auth.signIn();
        const idToken = appleRes?.authorization?.id_token;
        if (idToken) {
          const fullName = [appleRes?.user?.name?.firstName, appleRes?.user?.name?.lastName]
            .filter(Boolean)
            .join(' ')
            .trim();
          const profile = await authenticateWithAppleAccount({
            identityToken: idToken,
            fullName: fullName || undefined
          });
          return { redirected: true, profile };
        }
      } catch (err: any) {
        return { redirected: false, error: err?.message };
      }
    }
  }

  // 2. Check Supabase Apple OAuth only when configured AND enabled (skip redirect on 400 validation_failed)
  if (!supabase) {
    return { redirected: false };
  }

  try {
    const redirectTo = window.location.origin;
    const isInIframe = window.self !== window.top;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo,
        skipBrowserRedirect: true
      }
    });
    if (error || !data?.url) {
      return { redirected: false, error: error?.message };
    }

    const enabled = await canStartSupabaseOAuthRedirect(data.url);
    if (!enabled) {
      return { redirected: false, error: 'Apple OAuth provider is not enabled in Supabase' };
    }

    if (isInIframe) {
      const popup = window.open(data.url, 'apple_oauth_popup', 'width=540,height=680');
      if (popup) {
        return { redirected: true };
      }
      return { redirected: false };
    } else {
      window.location.href = data.url;
      return { redirected: true };
    }
  } catch (err: any) {
    return {
      redirected: false,
      error: err?.message
    };
  }
}

export async function authenticateWithAppleAccount(params: {
  identityToken: string;
  nonce?: string;
  fullName?: string;
}): Promise<PlayerProfile> {
  if (!params.identityToken || typeof params.identityToken !== 'string') {
    throw new Error('رمز مصادقة Apple الموقع (identityToken) مطلوب');
  }

  const controller = isNativeIOSApp() && typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;
  try {
    const res = await apiFetch('/api/auth/apple', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identityToken: params.identityToken,
        nonce: params.nonce,
        fullName: params.fullName
      }),
      ...(controller ? { signal: controller.signal } : {})
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('تعذر الوصول إلى خادم التحقق من توقيع Apple');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success || !data?.user) {
      throw new Error(data?.error || 'فشل التحقق من توقيع Apple ID الحقيقي');
    }

    const token = data.authToken || data.user.authToken;
    if (token && data.user.username) {
      saveStoredAuthToken(data.user.username, token);
    }
    return saveUserToLocalMap({
      ...data.user,
      authToken: token
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ============================================================================
// 1C. PERMANENT ACCOUNT DELETION (Apple App Store Guideline 5.1.1(v))
// ============================================================================
export async function deletePlayerAccountPermanently(username: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const cleanKey = normalizeUsernameKey(username);
  if (!cleanKey) {
    return { success: false, error: 'معرف الحساب غير صالح' };
  }

  try {
    const token = getStoredAuthToken(cleanKey);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-auth-token'] = token;
    }

    const res = await apiFetch('/api/auth/delete-account', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        username: cleanKey,
        confirmDelete: 'DELETE'
      })
    });

    if (res.ok) {
      await res.json().catch(() => ({}));
    } else if (res.status === 401 || res.status === 403) {
      const errData = await res.json().catch(() => ({}));
      return {
        success: false,
        error: errData?.error || 'غير مصرح بحذف هذا الحساب'
      };
    }
  } catch {
    // Continue with local cleanup if server is offline
  }

  if (supabase) {
    try {
      await supabase.auth.signOut().catch(() => {});
    } catch {
      // ignore
    }
  }

  // Purge from local storage maps
  try {
    const usersRaw = localStorage.getItem(LOCAL_USERS_DB_KEY);
    if (usersRaw) {
      const usersMap = JSON.parse(usersRaw);
      delete usersMap[cleanKey];
      localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(usersMap));
    }
    const pwRaw = localStorage.getItem(LOCAL_PASSWORDS_DB_KEY);
    if (pwRaw) {
      const pwMap = JSON.parse(pwRaw);
      delete pwMap[cleanKey];
      localStorage.setItem(LOCAL_PASSWORDS_DB_KEY, JSON.stringify(pwMap));
    }
    const mailRaw = localStorage.getItem(LOCAL_EMAILS_DB_KEY);
    if (mailRaw) {
      const mailMap = JSON.parse(mailRaw);
      delete mailMap[cleanKey];
      localStorage.setItem(LOCAL_EMAILS_DB_KEY, JSON.stringify(mailMap));
    }
    const tokRaw = localStorage.getItem(LOCAL_AUTH_TOKENS_KEY);
    if (tokRaw) {
      const tokMap = JSON.parse(tokRaw);
      delete tokMap[cleanKey];
      localStorage.setItem(LOCAL_AUTH_TOKENS_KEY, JSON.stringify(tokMap));
    }
    localStorage.removeItem('fatteshha_active_user');
    localStorage.removeItem('fatteshha_active_token');
    localStorage.removeItem(`fatteshha_reward_DAILY_${cleanKey}`);
    localStorage.removeItem(`fatteshha_reward_WEEKLY_${cleanKey}`);
  } catch {
    // ignore storage errors
  }

  return { success: true };
}

export async function logoutCurrentAccount(): Promise<void> {
  try {
    localStorage.removeItem('fatteshha_active_user');
    localStorage.removeItem('fatteshha_active_token');
    sessionStorage.removeItem('fatteshha_session_guest_id');
  } catch {
    // ignore storage errors
  }

  if (supabase) {
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise(resolve => setTimeout(resolve, 2000))
      ]);
    } catch {
      // ignore signOut errors
    }
  }
}

// ============================================================================
// 2. USERNAME + PASSWORD LOGIN CHECK (DETECTS UNREGISTERED ACCOUNTS)
// ============================================================================
export type UsernameLoginResult =
  | { status: 'SUCCESS'; profile: PlayerProfile }
  | { status: 'UNREGISTERED' }
  | { status: 'WRONG_PASSWORD'; message: string }
  | { status: 'SERVER_UNREACHABLE'; message: string };

export async function loginWithUsernameAndPassword(
  rawUsername: string,
  rawPassword: string
): Promise<UsernameLoginResult> {
  const cleanUsername = normalizeUsernameKey(rawUsername);
  if (!rawPassword || !rawPassword.trim()) {
    return {
      status: 'WRONG_PASSWORD',
      message: 'يرجى إدخال كلمة المرور لتسجيل الدخول.'
    };
  }
  const pwHash = hashPassword(cleanUsername, rawPassword);

  let expressReachable = false;
  let expressConfirmedMissing = false;
  let lastNetworkDiag = '';

  // 0. Always check authoritative Express backend (/api/auth/login) first when reachable (fast 3.5s timeout on mobile)
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUsername, password: rawPassword }),
        ...(controller ? { signal: controller.signal } : {})
      });
      const contentType = res.headers.get('content-type') || '';
      // Only treat JSON responses as coming from the real Express API (ignores Vercel 404 text/plain & AI Studio 302 HTML)
      if (contentType.includes('application/json')) {
        expressReachable = true;
        const data = await res.json();
        if (res.ok && data?.success && data.user) {
          saveLocalPasswordHash(cleanUsername, pwHash);
          const userWithToken: PlayerProfile = {
            ...data.user,
            authToken: data.authToken || data.user.authToken
          };
          return {
            status: 'SUCCESS',
            profile: saveUserToLocalMap(userWithToken)
          };
        }
        if (res.status === 404) {
          expressConfirmedMissing = true;
        } else if (res.status === 401 || res.status === 400 || data?.error === 'WRONG_PASSWORD') {
          return {
            status: 'WRONG_PASSWORD',
            message: data?.message || 'كلمة المرور غير صحيحة لهذا الحساب! يرجى التأكد من كلمة المرور.'
          };
        }
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    // Offline / static host / mobile standalone fallback below
  }

  const localMap = loadLocalUsersMap();
  const localPasswords = loadLocalPasswordsMap();
  const localEmails = loadLocalEmailsMap();

  const rawTrimmed = rawUsername.trim().toLowerCase();
  const looksLikeEmail = rawTrimmed.includes('@');

  // 1. Optional Supabase Auth verification when email was provided and Express could not locate it
  if (looksLikeEmail && supabase) {
    try {
      const { data: authData } = await supabase.auth.signInWithPassword({
        email: rawTrimmed,
        password: rawPassword
      });
      if (authData?.user) {
        const recovered = await buildProfileFromSupabaseUser(authData.user);
        saveLocalPasswordHash(normalizeUsernameKey(recovered.username), pwHash);
        return { status: 'SUCCESS', profile: recovered };
      }
    } catch {
      // fall through
    }
  }

  // 2. Check local browser cache if Express backend was unreachable
  let localProfile = localMap[cleanUsername] ? ensureFullProfileDefaults(localMap[cleanUsername]) : null;
  if (!localProfile && looksLikeEmail) {
    const matchedEntry = Object.entries(localEmails).find(([, em]) => em?.toLowerCase() === rawTrimmed);
    if (matchedEntry && localMap[matchedEntry[0]]) {
      localProfile = ensureFullProfileDefaults(localMap[matchedEntry[0]]);
    }
  }
  const resolvedLocalKey = localProfile ? normalizeUsernameKey(localProfile.username) : cleanUsername;
  const storedPasswordHash: string | undefined = localPasswords[resolvedLocalKey];
  const storedEmail: string | undefined = localEmails[resolvedLocalKey];

  // 2b. Cloud profile lookup on Supabase when Express is unreachable (restores & merges completed stages across devices)
  if (!expressReachable && isSupabaseConfigured) {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
      try {
        const headers = await getSupabaseRestHeaders();
        const filterParam = looksLikeEmail
          ? `email=eq.${encodeURIComponent(rawTrimmed)}`
          : `username=eq.${encodeURIComponent(resolvedLocalKey || cleanUsername)}`;
        let sbRes = await globalThis.fetch(
          `${SUPABASE_URL}/rest/v1/profiles?${filterParam}&select=*&limit=1`,
          {
            method: 'GET',
            headers,
            ...(controller ? { signal: controller.signal } : {})
          }
        );

        let rows: any[] = sbRes.ok ? await sbRes.json().catch(() => []) : [];
        if (sbRes.ok && (!Array.isArray(rows) || rows.length === 0) && !looksLikeEmail) {
          // Secondary lookup by display_name if player typed their display name on the TV
          const altRes = await globalThis.fetch(
            `${SUPABASE_URL}/rest/v1/profiles?display_name=ilike.${encodeURIComponent(rawUsername.trim())}&select=*&limit=1`,
            {
              method: 'GET',
              headers,
              ...(controller ? { signal: controller.signal } : {})
            }
          );
          if (altRes.ok) {
            rows = await altRes.json().catch(() => []);
            sbRes = altRes;
          }
        }

        if (sbRes.ok && Array.isArray(rows)) {
          if (rows.length === 0 && !localProfile) {
            return { status: 'UNREGISTERED' };
          }
          if (rows.length > 0) {
            const row = rows[0];
            const rowUserKey = normalizeUsernameKey(row.username || cleanUsername);
            const expectedHash = hashPassword(rowUserKey, rawPassword);
            const remoteHash = typeof row.password_hash === 'string' ? row.password_hash.trim() : '';

            if (remoteHash && remoteHash.startsWith('fts_pw_') && remoteHash !== expectedHash && remoteHash !== pwHash) {
              return {
                status: 'WRONG_PASSWORD',
                message: 'كلمة المرور غير صحيحة لهذا الحساب! يرجى التأكد من كلمة المرور.'
              };
            }

            const hydratedCloud = hydrateProfileFromSupabaseRow(row, rowUserKey);
            const mergedProfile = localProfile
              ? mergePlayerProfiles(hydratedCloud, localProfile)
              : hydratedCloud;

            saveLocalPasswordHash(rowUserKey, expectedHash);
            if (row.email && typeof row.email === 'string') {
              saveLocalUserEmail(rowUserKey, row.email);
            }
            const savedMerged = saveUserToLocalMap(mergedProfile);
            // If local device had newer stages than cloud, push the merged progress back up
            if (Object.keys(savedMerged.completedLevels || {}).length > Object.keys(hydratedCloud.completedLevels || {}).length) {
              void syncProfileWithSupabase(savedMerged, row.email || storedEmail, expectedHash);
            }
            return {
              status: 'SUCCESS',
              profile: savedMerged
            };
          }
        }
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch {
      // Fall through to offline check below
    }
  }

  if (!localProfile) {
    if (!expressReachable && !expressConfirmedMissing) {
      return {
        status: 'SERVER_UNREACHABLE',
        message: lastNetworkDiag
          ? `تعذر الاتصال بخادم اللعبة للتحقق من الحساب. (${lastNetworkDiag})`
          : 'تعذر الاتصال بخادم اللعبة للتحقق من الحساب. يرجى التأكد من اتصال الإنترنت.'
      };
    }
    return { status: 'UNREGISTERED' };
  }

  if (storedPasswordHash && !storedPasswordHash.startsWith('scrypt$') && storedPasswordHash !== pwHash) {
    return {
      status: 'WRONG_PASSWORD',
      message: 'كلمة المرور غير صحيحة لهذا الحساب! يرجى التأكد من كلمة المرور.'
    };
  }

  if (supabase && storedEmail) {
    try {
      const authResult = await Promise.race([
        supabase.auth.signInWithPassword({
          email: storedEmail,
          password: rawPassword
        }),
        new Promise<{ data: null; error: null }>(resolve =>
          setTimeout(() => resolve({ data: null, error: null }), 3500)
        )
      ]);
      const { data, error } = authResult;
      if (error && (!storedPasswordHash || storedPasswordHash.startsWith('scrypt$'))) {
        return {
          status: 'WRONG_PASSWORD',
          message: 'كلمة المرور غير صحيحة لهذا الحساب! يرجى التأكد من كلمة المرور.'
        };
      }
      if (data?.user) {
        saveLocalPasswordHash(cleanUsername, pwHash);
        const sbProfile = await buildProfileFromSupabaseUser(data.user, localProfile.displayName);
        return { status: 'SUCCESS', profile: sbProfile };
      }
    } catch {
      // Continue with local verified hash
    }
  }

  saveLocalPasswordHash(cleanUsername, pwHash);
  return {
    status: 'SUCCESS',
    profile: saveUserToLocalMap(localProfile)
  };
}

// ============================================================================
// 3. REGISTER NEW ACCOUNT WITH USERNAME + PASSWORD + EMAIL & ENTER GAME
// ============================================================================
export async function registerNewAccountWithEmail(params: {
  username: string;
  password: string;
  email: string;
  displayName?: string;
  avatar?: string;
}): Promise<PlayerProfile> {
  const displayName = (params.displayName || params.username).trim();
  const cleanUsername = normalizeUsernameKey(params.username);
  const cleanEmail = params.email.trim().toLowerCase();
  const rawPassword = params.password;

  if (!cleanUsername) {
    throw new Error('يرجى إدخال اسم المستخدم');
  }
  if (!rawPassword || rawPassword.length < 4) {
    throw new Error('يرجى إدخال كلمة مرور مكونة من 4 خانات على الأقل');
  }
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('يرجى إدخال بريد إلكتروني صحيح لإكمال تسجيل حسابك');
  }

  const pwHash = hashPassword(cleanUsername, rawPassword);
  let userId = `usr_${cleanUsername}_${Date.now().toString(36)}`;

  // 1. Register via authoritative Express backend first (enforces uniqueness + moderation + scrypt hashing)
  let regUser: PlayerProfile | null = null;
  let regToken: string | undefined;
  let expressResponded = false;
  try {
    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: cleanUsername,
        displayName,
        email: cleanEmail,
        password: rawPassword,
        avatar: params.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg'
      })
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      expressResponded = true;
      const regJson = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(regJson?.error || 'تعذر تسجيل الحساب، يرجى التحقق من البيانات');
      }
      if (regJson?.user) {
        regUser = regJson.user;
        regToken = regJson.authToken || regJson.user.authToken;
      }
    }
  } catch (err: any) {
    if (expressResponded) {
      throw err;
    }
  }

  // 2. Register in Supabase Auth if configured (bounded timeout on native iOS)
  if (!regUser && supabase) {
    try {
      const signUpPromise = supabase.auth.signUp({
        email: cleanEmail,
        password: rawPassword,
        options: {
          data: {
            username: cleanUsername,
            full_name: displayName
          }
        }
      });
      const signUpRes = isNativeIOSApp()
        ? await Promise.race([
            signUpPromise,
            new Promise<{ data: null; error: { message: string } }>(resolve =>
              setTimeout(() => resolve({ data: null, error: { message: 'SignUp timeout' } }), 3500)
            )
          ])
        : await signUpPromise;
      const { data, error } = signUpRes as { data: any; error: any };
      if (!error && data?.user?.id) {
        userId = data.user.id;
      }
    } catch {
      // ignore
    }
  }

  const newProfile: PlayerProfile = ensureFullProfileDefaults(
    regUser
      ? {
          ...regUser,
          authToken: regToken || regUser.authToken
        }
      : {
          id: userId,
          username: cleanUsername,
          displayName,
          avatar: params.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
          level: 1,
          xp: 0,
          coins: DEFAULT_FREE_ACCOUNT_COINS,
          hintsRemaining: 5,
          completedLevelsCount: 0,
          completedLevels: {},
          dailyChallenges: createDefaultDailyChallenges(),
          dailyStreak: createDefaultDailyStreak(),
          friends: [],
          totalScore: 0,
          totalWordsFound: 0,
          perfectStagesCount: 0,
          fastStagesCount: 0,
          selectedTitle: 'مستكشف الحروف',
          unlockedTitles: ['مستكشف الحروف'],
          selectedCosmetic: 'frame_default_cyan',
          unlockedCosmetics: ['frame_default_cyan'],
          multiplayerWins: 0,
          multiplayerLosses: 0,
          achievements: [],
          createdAt: new Date().toISOString()
        }
  );

  saveLocalPasswordHash(cleanUsername, pwHash);
  saveLocalUserEmail(cleanUsername, cleanEmail);

  const savedLocal = saveUserToLocalMap(newProfile);
  if (regUser) {
    return savedLocal;
  }
  return await syncProfileWithSupabase(savedLocal, cleanEmail, pwHash);
}

// Unified Account helper (used by Google Sign-In modal and cloud recovery)
export async function loginOrRegisterAccount(params: {
  username: string;
  displayName: string;
  email?: string;
  avatar?: string;
}): Promise<PlayerProfile> {
  const cleanUsername = normalizeUsernameKey(params.username) || `user_${Date.now()}`;
  const cleanDisplayName = params.displayName.trim() || cleanUsername;
  const chosenAvatar = params.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg';

  const localMap = loadLocalUsersMap();
  const existingLocal = localMap[cleanUsername];

  const baseProfile: PlayerProfile = ensureFullProfileDefaults(
    existingLocal
      ? {
          ...existingLocal,
          displayName: cleanDisplayName || existingLocal.displayName,
          avatar: params.avatar || existingLocal.avatar
        }
      : {
          id: `usr_${cleanUsername}_${Date.now().toString(36)}`,
          username: cleanUsername,
          displayName: cleanDisplayName,
          avatar: chosenAvatar,
          level: 1,
          xp: 0,
          coins: 200,
          hintsRemaining: 5,
          completedLevelsCount: 0,
          completedLevels: {},
          dailyChallenges: createDefaultDailyChallenges(),
          dailyStreak: createDefaultDailyStreak(),
          friends: [],
          totalScore: 0,
          totalWordsFound: 0,
          perfectStagesCount: 0,
          fastStagesCount: 0,
          selectedTitle: 'مستكشف الحروف',
          unlockedTitles: ['مستكشف الحروف'],
          selectedCosmetic: 'frame_default_cyan',
          unlockedCosmetics: ['frame_default_cyan'],
          multiplayerWins: 0,
          multiplayerLosses: 0,
          achievements: [],
          createdAt: new Date().toISOString()
        }
  );

  if (params.email) {
    saveLocalUserEmail(cleanUsername, params.email);
  }

  return await syncProfileWithSupabase(saveUserToLocalMap(baseProfile), params.email);
}

// Unified Guest Login that gives each browser window/tab a distinct Guest tag & ID
export async function loginAsGuestAccount(): Promise<PlayerProfile> {
  let guestId = '';
  try {
    guestId = sessionStorage.getItem('fatteshha_session_guest_id') || '';
    if (!guestId) {
      const randTag = Math.floor(100 + Math.random() * 900);
      guestId = `guest_${Date.now().toString(36)}_${randTag}`;
      sessionStorage.setItem('fatteshha_session_guest_id', guestId);
      localStorage.setItem('fatteshha_guest_id', guestId);
    }
  } catch {
    guestId = `guest_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;
  }

  const suffix = guestId.split('_').pop()?.toUpperCase() || String(Math.floor(100 + Math.random() * 900));
  const guestDisplayName = `ضيف فتّشها #${suffix}`;

  const guestToken = getStoredAuthToken(guestId);
  const guestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-id': guestId
  };
  if (guestToken) {
    guestHeaders['Authorization'] = `Bearer ${guestToken}`;
    guestHeaders['x-auth-token'] = guestToken;
  }

  let supabaseAccessToken = '';
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        throw new Error(error.message || 'فشل تسجيل الدخول كضيف عبر خدمة المصادقة');
      }
      if (data?.session?.access_token) {
        supabaseAccessToken = data.session.access_token;
      }
    } catch (err: any) {
      throw new Error(err?.message || 'تعذر إنشاء جلسة ضيف مجهولة عبر Supabase');
    }
  }

  let apiData: { success?: boolean; user?: PlayerProfile; authToken?: string } | null = null;
  try {
    const guestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-user-id': guestId
    };
    const activeTok = supabaseAccessToken || getStoredAuthToken(guestId);
    if (activeTok) {
      guestHeaders['Authorization'] = `Bearer ${activeTok}`;
      guestHeaders['x-auth-token'] = activeTok;
    }

    const res = await globalThis.fetch(resolveApiUrl('/api/auth/guest'), {
      method: 'POST',
      headers: guestHeaders,
      body: JSON.stringify({ guestId, displayName: guestDisplayName, accessToken: supabaseAccessToken })
    });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      apiData = (await res.json()) as { success?: boolean; user?: PlayerProfile; authToken?: string };
    }
  } catch {
    apiData = null;
  }

  if (apiData?.success && apiData.user) {
    const guestWithToken: PlayerProfile = {
      ...apiData.user,
      authToken: supabaseAccessToken || apiData.authToken || apiData.user.authToken
    };
    try {
      sessionStorage.setItem('fatteshha_session_guest_id', guestWithToken.username);
      localStorage.setItem('fatteshha_guest_id', guestWithToken.username);
      if (supabaseAccessToken) {
        localStorage.setItem('fatteshha_active_token', supabaseAccessToken);
      }
    } catch {
      // ignore storage errors
    }
    return await syncProfileWithSupabase(saveUserToLocalMap(guestWithToken));
  }

  const localMap = loadLocalUsersMap();
  const existing = localMap[guestId];
  const guestProfile: PlayerProfile = ensureFullProfileDefaults(
    existing || {
      id: `usr_${guestId}`,
      username: guestId,
      displayName: guestDisplayName,
      avatar: '/assets/images/login_kuwaiti_mascot_1794483388654.jpg',
      level: 1,
      xp: 0,
      coins: DEFAULT_FREE_ACCOUNT_COINS,
      hintsRemaining: 5,
      completedLevelsCount: 0,
      completedLevels: {},
      dailyChallenges: createDefaultDailyChallenges(),
      dailyStreak: createDefaultDailyStreak(),
      friends: [],
      totalScore: 0,
      totalWordsFound: 0,
      perfectStagesCount: 0,
      fastStagesCount: 0,
      selectedTitle: 'مستكشف الحروف',
      unlockedTitles: ['مستكشف الحروف'],
      selectedCosmetic: 'frame_default_cyan',
      unlockedCosmetics: ['frame_default_cyan'],
      multiplayerWins: 0,
      multiplayerLosses: 0,
      achievements: [],
      createdAt: new Date().toISOString()
    }
  );

  return await syncProfileWithSupabase(saveUserToLocalMap(guestProfile));
}

// ============================================================================
// 4. CROSS-DEVICE ACCOUNT & PROGRESS RECOVERY (استعادة الحساب والتقدم عند تغيير الجهاز)
// ============================================================================
export function exportAccountRecoveryCode(profile: PlayerProfile): string {
  const compactPayload = {
    u: profile.username,
    d: profile.displayName,
    a: profile.avatar,
    l: profile.level,
    x: profile.xp,
    c: profile.coins,
    h: profile.hintsRemaining,
    w: profile.multiplayerWins,
    lo: profile.multiplayerLosses,
    tw: profile.totalWordsFound || 0,
    ts: profile.totalScore || 0,
    st: profile.selectedTitle || 'مستكشف الحروف',
    ut: profile.unlockedTitles || ['مستكشف الحروف'],
    sc: profile.selectedCosmetic || 'frame_default_cyan',
    uc: profile.unlockedCosmetics || ['frame_default_cyan'],
    ac: profile.achievements || [],
    cl: profile.completedLevels || {},
    fr: profile.friends || []
  };
  try {
    const json = JSON.stringify(compactPayload);
    const encoded = btoa(encodeURIComponent(json));
    return `FTS-${encoded}`;
  } catch {
    return `FTS-USER:${profile.username}`;
  }
}

export async function restoreAccountFromRecoveryInput(
  rawInput: string
): Promise<PlayerProfile> {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('يرجى إدخال رمز الاستعادة أو اسم المستخدم');
  }

  // First try server-verified recovery endpoint (/api/auth/recover)
  if (trimmed.startsWith('FTS-')) {
    const serverRec = await safeApiJson<{ success?: boolean; user?: PlayerProfile; authToken?: string }>(
      '/api/auth/recover',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoveryCode: trimmed })
      }
    );
    if (serverRec?.success && serverRec.user) {
      return saveUserToLocalMap({
        ...serverRec.user,
        authToken: serverRec.authToken || serverRec.user.authToken
      });
    }
  }

  // Case A: Full portable recovery token "FTS-..." (offline fallback)
  if (trimmed.startsWith('FTS-') && !trimmed.startsWith('FTS-USER:') && !trimmed.startsWith('FTS-REC1.')) {
    try {
      const encoded = trimmed.slice(4);
      const decodedJson = decodeURIComponent(atob(encoded));
      const p = JSON.parse(decodedJson);
      const restored: PlayerProfile = ensureFullProfileDefaults({
        id: `usr_${p.u}_${Date.now().toString(36)}`,
        username: p.u || 'player_kwt',
        displayName: p.d || p.u || 'بطل فتّشها',
        avatar: p.a || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
        level: Number(p.l) || 1,
        xp: Number(p.x) || 0,
        coins: Number(p.c) || 150,
        hintsRemaining: Number(p.h) || 5,
        completedLevelsCount: Object.keys(p.cl || {}).length,
        completedLevels: p.cl || {},
        dailyChallenges: createDefaultDailyChallenges(),
        dailyStreak: createDefaultDailyStreak(),
        friends: Array.isArray(p.fr) ? p.fr : [],
        totalScore: Number(p.ts) || 0,
        totalWordsFound: Number(p.tw) || 0,
        selectedTitle: p.st || 'مستكشف الحروف',
        unlockedTitles: Array.isArray(p.ut) ? p.ut : ['مستكشف الحروف'],
        selectedCosmetic: p.sc || 'frame_default_cyan',
        unlockedCosmetics: Array.isArray(p.uc) ? p.uc : ['frame_default_cyan'],
        multiplayerWins: Number(p.w) || 0,
        multiplayerLosses: Number(p.lo) || 0,
        achievements: Array.isArray(p.ac) ? p.ac : [],
        createdAt: new Date().toISOString()
      });
      return await syncProfileWithSupabase(saveUserToLocalMap(restored));
    } catch {
      throw new Error('رمز استعادة الحساب غير صالح، يرجى التأكد من نسخه بالكامل.');
    }
  }

  // Case B: Authenticated API or Local Storage lookup (never unauthenticated Supabase table query)
  const cleanKey = normalizeUsernameKey(
    trimmed.startsWith('FTS-USER:') ? trimmed.replace('FTS-USER:', '') : trimmed.split('@')[0]
  );

  const localMap = loadLocalUsersMap();
  if (localMap[cleanKey]) {
    return saveUserToLocalMap(localMap[cleanKey]);
  }

  const apiData = await safeApiJson<{ success?: boolean; user?: PlayerProfile }>('/api/auth/me', {
    headers: { 'x-user-id': cleanKey }
  });
  if (apiData?.success && apiData.user) {
    return saveUserToLocalMap(apiData.user);
  }

  throw new Error('لم يتم العثور على حساب بهذا المعرف، تأكد من رمز الاستعادة أو اسم المستخدم.');
}

// ============================================================================
// 5. FETCH ALL KNOWN REAL PLAYERS (VIA BACKEND API & LOCAL CACHE - NO PUBLIC REST SCANS)
// ============================================================================
export async function getAllKnownPlayers(currentUser?: PlayerProfile | null): Promise<PlayerProfile[]> {
  const byUsername = new Map<string, PlayerProfile>();

  // 1. Add local users (excluding legacy fake accounts)
  const localMap = loadLocalUsersMap();
  Object.values(localMap).forEach(p => {
    if (p.username && p.username !== 'ahmad_kwt' && p.username !== 'dana_q8') {
      byUsername.set(normalizeUsernameKey(p.username), ensureFullProfileDefaults(p));
    }
  });

  // 2. Add current user
  if (currentUser?.username) {
    byUsername.set(normalizeUsernameKey(currentUser.username), ensureFullProfileDefaults(currentUser));
  }

  // 3. Fetch from authoritative Express backend
  const apiUsers = await safeApiJson<{ success?: boolean; users?: PlayerProfile[] }>('/api/users');
  if (apiUsers?.success && Array.isArray(apiUsers.users)) {
    apiUsers.users.forEach(u => {
      if (u.username && u.id !== 'usr_ahmad_kwt' && u.id !== 'usr_dana_q8') {
        const key = normalizeUsernameKey(u.username);
        const existing = byUsername.get(key);
        byUsername.set(key, ensureFullProfileDefaults(existing ? { ...u, ...existing } : u));
      }
    });
  }

  return Array.from(byUsername.values()).sort((a, b) => (b.xp || 0) - (a.xp || 0));
}
