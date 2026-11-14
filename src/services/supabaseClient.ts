import { createClient, SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
import { PlayerProfile, DailyChallengeTask, DailyChallengesState, DailyStreakState } from '../types/game';
import { evaluateAndGrantAchievements } from '../engine/gameCategories';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};

const SUPABASE_URL =
  env.VITE_SUPABASE_URL ||
  env.NEXT_PUBLIC_SUPABASE_URL ||
  env.SUPABASE_URL ||
  '';

const SUPABASE_ANON_KEY =
  env.VITE_SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  env.SUPABASE_ANON_KEY ||
  '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

const LOCAL_USERS_DB_KEY = 'fatteshha_users_db_v1';
const LOCAL_PASSWORDS_DB_KEY = 'fatteshha_auth_passwords_v1';
const LOCAL_EMAILS_DB_KEY = 'fatteshha_auth_emails_v1';

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

  return {
    ...profile,
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
    isVip: Boolean(profile.isVip),
    seasonXp: typeof profile.seasonXp === 'number' ? profile.seasonXp : profile.xp || 0,
    claimedSeasonTiers: Array.isArray(profile.claimedSeasonTiers) ? profile.claimedSeasonTiers : [],
    starterPackPurchased: Boolean(profile.starterPackPurchased),
    friends: Array.isArray(profile.friends) ? profile.friends : [],
    achievements: Array.isArray(profile.achievements) ? profile.achievements : [],
    dailyChallenges: profile.dailyChallenges || createDefaultDailyChallenges(),
    dailyStreak: profile.dailyStreak || createDefaultDailyStreak()
  };
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
  const enriched = evaluateAndGrantAchievements(ensureFullProfileDefaults(profile)).updatedProfile;
  try {
    const cleanKey = normalizeUsernameKey(enriched.username);
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
  if (username) {
    const clean = normalizeUsernameKey(username);
    if (map[clean]) return ensureFullProfileDefaults(map[clean]);
  }
  try {
    const savedActive = localStorage.getItem('fatteshha_active_user');
    if (savedActive) {
      const cleanSaved = normalizeUsernameKey(savedActive);
      if (cleanSaved !== 'ahmad_kwt' && cleanSaved !== 'dana_q8' && map[cleanSaved]) {
        return ensureFullProfileDefaults(map[cleanSaved]);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

// Safely parse JSON response from /api/* without crashing when Vercel/Netlify returns HTML 404
export async function safeApiJson<T = any>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Sync profile with Supabase 'profiles' table if configured
export async function syncProfileWithSupabase(
  profile: PlayerProfile,
  email?: string,
  passwordHash?: string
): Promise<PlayerProfile> {
  const normalizedProfile = saveUserToLocalMap(profile);
  if (!supabase) return normalizedProfile;

  try {
    const cleanUsername = normalizeUsernameKey(normalizedProfile.username);

    // 1. Try reading existing row from Supabase 'profiles' table
    const { data: existingRow, error: selectErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', cleanUsername)
      .maybeSingle();

    if (!selectErr && existingRow) {
      const merged: PlayerProfile = ensureFullProfileDefaults({
        ...normalizedProfile,
        id: existingRow.id || normalizedProfile.id,
        username: existingRow.username || cleanUsername,
        displayName: existingRow.display_name || existingRow.displayName || normalizedProfile.displayName,
        avatar: existingRow.avatar || normalizedProfile.avatar,
        level: Math.max(
          typeof existingRow.level === 'number' ? existingRow.level : 1,
          normalizedProfile.level || 1
        ),
        xp: Math.max(
          typeof existingRow.xp === 'number' ? existingRow.xp : 0,
          normalizedProfile.xp || 0
        ),
        coins:
          typeof existingRow.coins === 'number'
            ? existingRow.coins
            : normalizedProfile.coins,
        hintsRemaining:
          typeof existingRow.hints_remaining === 'number'
            ? existingRow.hints_remaining
            : normalizedProfile.hintsRemaining,
        completedLevels: {
          ...(existingRow.completed_levels || {}),
          ...(normalizedProfile.completedLevels || {})
        },
        multiplayerWins: Math.max(
          typeof existingRow.multiplayer_wins === 'number' ? existingRow.multiplayer_wins : 0,
          normalizedProfile.multiplayerWins || 0
        ),
        multiplayerLosses: Math.max(
          typeof existingRow.multiplayer_losses === 'number' ? existingRow.multiplayer_losses : 0,
          normalizedProfile.multiplayerLosses || 0
        ),
        achievements: Array.from(
          new Set([
            ...(Array.isArray(existingRow.achievements) ? existingRow.achievements : []),
            ...(normalizedProfile.achievements || [])
          ])
        )
      });

      const savedMerged = saveUserToLocalMap(merged);

      // Update Supabase row with merged latest state
      await supabase
        .from('profiles')
        .upsert(
          {
            id: savedMerged.id,
            username: cleanUsername,
            display_name: savedMerged.displayName,
            avatar: savedMerged.avatar,
            level: savedMerged.level,
            xp: savedMerged.xp,
            coins: savedMerged.coins,
            hints_remaining: savedMerged.hintsRemaining,
            completed_levels: savedMerged.completedLevels || {},
            multiplayer_wins: savedMerged.multiplayerWins || 0,
            multiplayer_losses: savedMerged.multiplayerLosses || 0,
            achievements: savedMerged.achievements || [],
            updated_at: new Date().toISOString()
          },
          { onConflict: 'username' }
        );

      return savedMerged;
    }

    // 2. Upsert row into Supabase 'profiles' table
    const rowPayload: Record<string, unknown> = {
      id: normalizedProfile.id,
      username: cleanUsername,
      email: email || `${cleanUsername}@fatteshha.app`,
      display_name: normalizedProfile.displayName,
      avatar: normalizedProfile.avatar,
      level: normalizedProfile.level,
      xp: normalizedProfile.xp,
      coins: normalizedProfile.coins,
      hints_remaining: normalizedProfile.hintsRemaining,
      completed_levels: normalizedProfile.completedLevels || {},
      multiplayer_wins: normalizedProfile.multiplayerWins || 0,
      multiplayer_losses: normalizedProfile.multiplayerLosses || 0,
      achievements: normalizedProfile.achievements || [],
      updated_at: new Date().toISOString()
    };
    if (passwordHash) {
      rowPayload.password_hash = passwordHash;
    }

    await supabase.from('profiles').upsert(rowPayload, { onConflict: 'username' });
  } catch {
    // Gracefully continue if Supabase table schema differs
  }

  return normalizedProfile;
}

// Convert a verified Supabase Auth user (from Google OAuth or Email Auth) into a PlayerProfile
export async function buildProfileFromSupabaseUser(
  sbUser: SupabaseUser,
  fallbackDisplayName?: string
): Promise<PlayerProfile> {
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
      };

  return await syncProfileWithSupabase(saveUserToLocalMap(baseProfile), email);
}

// ============================================================================
// 1. REAL GOOGLE OAUTH REDIRECT / POPUP VIA SUPABASE AUTH
// ============================================================================
export async function signInWithRealGoogleOAuth(): Promise<{ redirected: boolean; error?: string }> {
  if (!supabase) {
    return { redirected: false };
  }

  try {
    const redirectTo = window.location.origin;
    const isInIframe = window.self !== window.top;

    if (isInIframe) {
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
      if (error) {
        return { redirected: false, error: error.message };
      }
      if (data?.url) {
        const popup = window.open(data.url, 'google_oauth_popup', 'width=540,height=680');
        if (popup) {
          return { redirected: true };
        }
        return { redirected: false };
      }
    } else {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            prompt: 'select_account'
          }
        }
      });
      if (error) {
        return { redirected: false, error: error.message };
      }
      return { redirected: true };
    }
  } catch (err: any) {
    return {
      redirected: false,
      error: err?.message
    };
  }

  return { redirected: false };
}

// ============================================================================
// 2. USERNAME + PASSWORD LOGIN CHECK (DETECTS UNREGISTERED ACCOUNTS)
// ============================================================================
export type UsernameLoginResult =
  | { status: 'SUCCESS'; profile: PlayerProfile }
  | { status: 'UNREGISTERED' }
  | { status: 'WRONG_PASSWORD'; message: string };

export async function loginWithUsernameAndPassword(
  rawUsername: string,
  rawPassword: string
): Promise<UsernameLoginResult> {
  const cleanUsername = normalizeUsernameKey(rawUsername);
  const pwHash = hashPassword(cleanUsername, rawPassword);

  const localMap = loadLocalUsersMap();
  const localPasswords = loadLocalPasswordsMap();
  const localEmails = loadLocalEmailsMap();

  let foundExistingAccount = false;
  let existingProfile: PlayerProfile | null = null;
  let storedPasswordHash: string | undefined = localPasswords[cleanUsername];
  let storedEmail: string | undefined = localEmails[cleanUsername];

  // 1. Check Supabase 'profiles' table first if configured
  if (supabase) {
    try {
      const { data: row, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (!error && row) {
        foundExistingAccount = true;
        if (row.password_hash) {
          storedPasswordHash = row.password_hash;
        }
        if (row.email) {
          storedEmail = row.email;
        }
        existingProfile = ensureFullProfileDefaults({
          id: row.id || `usr_${cleanUsername}`,
          username: row.username || cleanUsername,
          displayName: row.display_name || row.displayName || rawUsername.trim(),
          avatar: row.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
          level: typeof row.level === 'number' ? row.level : 1,
          xp: typeof row.xp === 'number' ? row.xp : 0,
          coins: typeof row.coins === 'number' ? row.coins : 150,
          hintsRemaining: typeof row.hints_remaining === 'number' ? row.hints_remaining : 5,
          completedLevelsCount: Object.keys(row.completed_levels || {}).length,
          completedLevels: row.completed_levels || {},
          dailyChallenges: createDefaultDailyChallenges(),
          dailyStreak: createDefaultDailyStreak(),
          friends: [],
          totalScore: 0,
          multiplayerWins: typeof row.multiplayer_wins === 'number' ? row.multiplayer_wins : 0,
          multiplayerLosses: typeof row.multiplayer_losses === 'number' ? row.multiplayer_losses : 0,
          achievements: Array.isArray(row.achievements) ? row.achievements : [],
          createdAt: row.created_at || new Date().toISOString()
        });
      }
    } catch {
      // Ignore table query errors and check local/API
    }
  }

  // 2. Check local browser storage if not found in Supabase table yet
  if (!foundExistingAccount && localMap[cleanUsername]) {
    foundExistingAccount = true;
    existingProfile = ensureFullProfileDefaults(localMap[cleanUsername]);
  }

  // 3. Check Express backend (/api/auth/login) if running on Node server
  if (!foundExistingAccount) {
    const apiRes = await safeApiJson<{
      success?: boolean;
      user?: PlayerProfile;
      error?: string;
      message?: string;
    }>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: cleanUsername, password: rawPassword })
    });

    if (apiRes?.success && apiRes.user) {
      saveLocalPasswordHash(cleanUsername, pwHash);
      return {
        status: 'SUCCESS',
        profile: saveUserToLocalMap(apiRes.user)
      };
    }
  }

  // If account is NOT registered anywhere -> return UNREGISTERED so UI shows "هذا الحساب غير مسجل مسبقا..."
  if (!foundExistingAccount || !existingProfile) {
    return { status: 'UNREGISTERED' };
  }

  // Verify password against stored hash
  if (storedPasswordHash && storedPasswordHash !== pwHash) {
    return {
      status: 'WRONG_PASSWORD',
      message: 'كلمة المرور غير صحيحة لهذا الحساب! يرجى التأكد من كلمة المرور.'
    };
  }

  // Also sign in via Supabase Auth if we have an email for this username
  if (supabase && storedEmail) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: storedEmail,
        password: rawPassword
      });
      if (error && !storedPasswordHash) {
        return {
          status: 'WRONG_PASSWORD',
          message: 'كلمة المرور غير صحيحة لهذا الحساب! يرجى التأكد من كلمة المرور.'
        };
      }
      if (data?.user) {
        saveLocalPasswordHash(cleanUsername, pwHash);
        const sbProfile = await buildProfileFromSupabaseUser(data.user, existingProfile.displayName);
        return { status: 'SUCCESS', profile: sbProfile };
      }
    } catch {
      // Continue with verified profile
    }
  }

  saveLocalPasswordHash(cleanUsername, pwHash);
  return {
    status: 'SUCCESS',
    profile: saveUserToLocalMap(existingProfile)
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

  // 1. Register in Supabase Auth if configured
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: rawPassword,
        options: {
          data: {
            username: cleanUsername,
            full_name: displayName
          }
        }
      });
      if (!error && data?.user?.id) {
        userId = data.user.id;
      }
    } catch {
      // Continue to profile creation
    }
  }

  // 2. Register in Express API if running on Node backend
  const regRes = await safeApiJson<{ success?: boolean; user?: PlayerProfile }>('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: cleanUsername,
      displayName,
      password: rawPassword,
      avatar: params.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg'
    })
  });

  const newProfile: PlayerProfile = ensureFullProfileDefaults(
    regRes?.user || {
      id: userId,
      username: cleanUsername,
      displayName,
      avatar: params.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
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

  saveLocalPasswordHash(cleanUsername, pwHash);
  saveLocalUserEmail(cleanUsername, cleanEmail);

  return await syncProfileWithSupabase(saveUserToLocalMap(newProfile), cleanEmail, pwHash);
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

  const apiData = await safeApiJson<{ success?: boolean; user?: PlayerProfile }>('/api/auth/guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guestId, displayName: guestDisplayName })
  });

  if (apiData?.success && apiData.user) {
    return await syncProfileWithSupabase(saveUserToLocalMap(apiData.user));
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
      coins: 150,
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

  // Case A: Full portable recovery token "FTS-..."
  if (trimmed.startsWith('FTS-') && !trimmed.startsWith('FTS-USER:')) {
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

  // Case B: Username or Email lookup across Supabase Cloud, API, and Local Storage
  const cleanKey = normalizeUsernameKey(
    trimmed.startsWith('FTS-USER:') ? trimmed.replace('FTS-USER:', '') : trimmed.split('@')[0]
  );

  if (supabase) {
    try {
      const { data: row } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', cleanKey)
        .maybeSingle();

      if (row) {
        const cloudProfile: PlayerProfile = ensureFullProfileDefaults({
          id: row.id || `usr_${cleanKey}`,
          username: row.username || cleanKey,
          displayName: row.display_name || cleanKey,
          avatar: row.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
          level: Number(row.level) || 1,
          xp: Number(row.xp) || 0,
          coins: Number(row.coins) || 150,
          hintsRemaining: Number(row.hints_remaining) || 5,
          completedLevelsCount: Object.keys(row.completed_levels || {}).length,
          completedLevels: row.completed_levels || {},
          dailyChallenges: createDefaultDailyChallenges(),
          dailyStreak: createDefaultDailyStreak(),
          friends: [],
          totalScore: 0,
          multiplayerWins: Number(row.multiplayer_wins) || 0,
          multiplayerLosses: Number(row.multiplayer_losses) || 0,
          achievements: Array.isArray(row.achievements) ? row.achievements : [],
          createdAt: row.created_at || new Date().toISOString()
        });
        return saveUserToLocalMap(cloudProfile);
      }
    } catch {
      // continue
    }
  }

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
// 5. FETCH ALL KNOWN REAL PLAYERS (FOR LEADERBOARD & FRIENDS COMPARISON)
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

  // 3. Fetch from Express backend if available
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

  // 4. Fetch from Supabase 'profiles' table if configured
  if (supabase) {
    try {
      const { data: rows } = await supabase
        .from('profiles')
        .select('*')
        .order('xp', { ascending: false })
        .limit(50);

      if (Array.isArray(rows)) {
        rows.forEach(row => {
          if (!row.username) return;
          const key = normalizeUsernameKey(row.username);
          const existing = byUsername.get(key);
          const mapped: PlayerProfile = ensureFullProfileDefaults({
            id: row.id || existing?.id || `usr_${key}`,
            username: row.username,
            displayName: row.display_name || existing?.displayName || row.username,
            avatar: row.avatar || existing?.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
            level: Math.max(Number(row.level) || 1, existing?.level || 1),
            xp: Math.max(Number(row.xp) || 0, existing?.xp || 0),
            coins: Number(row.coins) ?? existing?.coins ?? 150,
            hintsRemaining: Number(row.hints_remaining) ?? existing?.hintsRemaining ?? 5,
            completedLevelsCount: Object.keys(row.completed_levels || existing?.completedLevels || {}).length,
            completedLevels: row.completed_levels || existing?.completedLevels || {},
            dailyChallenges: existing?.dailyChallenges || createDefaultDailyChallenges(),
            dailyStreak: existing?.dailyStreak || createDefaultDailyStreak(),
            friends: existing?.friends || [],
            totalScore: existing?.totalScore || 0,
            totalWordsFound: existing?.totalWordsFound || 0,
            selectedTitle: existing?.selectedTitle || 'مستكشف الحروف',
            unlockedTitles: existing?.unlockedTitles || ['مستكشف الحروف'],
            selectedCosmetic: existing?.selectedCosmetic || 'frame_default_cyan',
            unlockedCosmetics: existing?.unlockedCosmetics || ['frame_default_cyan'],
            multiplayerWins: Math.max(Number(row.multiplayer_wins) || 0, existing?.multiplayerWins || 0),
            multiplayerLosses: Math.max(Number(row.multiplayer_losses) || 0, existing?.multiplayerLosses || 0),
            achievements: Array.isArray(row.achievements) ? row.achievements : existing?.achievements || [],
            createdAt: row.created_at || existing?.createdAt || new Date().toISOString()
          });
          byUsername.set(key, mapped);
        });
      }
    } catch {
      // ignore
    }
  }

  return Array.from(byUsername.values()).sort((a, b) => (b.xp || 0) - (a.xp || 0));
}
