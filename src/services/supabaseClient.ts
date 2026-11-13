import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PlayerProfile, DailyChallengeTask, DailyChallengesState, DailyStreakState } from '../types/game';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};

const SUPABASE_URL =
  env.VITE_SUPABASE_URL ||
  env.NEXT_PUBLIC_SUPABASE_URL ||
  '';

const SUPABASE_ANON_KEY =
  env.VITE_SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null;

const LOCAL_USERS_DB_KEY = 'fatteshha_users_db_v1';

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

function createDefaultDailyChallenges(): DailyChallengesState {
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

function createDefaultDailyStreak(): DailyStreakState {
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

function getSeedLocalUsers(): Record<string, PlayerProfile> {
  const nowIso = new Date().toISOString();
  return {
    ahmad_kwt: {
      id: 'usr_ahmad_kwt',
      username: 'ahmad_kwt',
      displayName: 'أحمد الكندري',
      avatar: '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
      level: 3,
      xp: 650,
      coins: 320,
      hintsRemaining: 5,
      completedLevelsCount: 0,
      completedLevels: {},
      friends: ['dana_q8', 'fahad_q8'],
      totalScore: 0,
      multiplayerWins: 4,
      multiplayerLosses: 1,
      achievements: ['first_level', 'online_warrior'],
      dailyChallenges: createDefaultDailyChallenges(),
      dailyStreak: createDefaultDailyStreak(),
      createdAt: nowIso
    },
    dana_q8: {
      id: 'usr_dana_q8',
      username: 'dana_q8',
      displayName: 'دانة المبارك',
      avatar: '/assets/images/avatar_kuwaiti_girl_1794404783186.jpg',
      level: 2,
      xp: 420,
      coins: 210,
      hintsRemaining: 5,
      completedLevelsCount: 0,
      completedLevels: {},
      friends: ['ahmad_kwt'],
      totalScore: 0,
      multiplayerWins: 2,
      multiplayerLosses: 1,
      achievements: ['first_level'],
      dailyChallenges: createDefaultDailyChallenges(),
      dailyStreak: createDefaultDailyStreak(),
      createdAt: nowIso
    }
  };
}

export function loadLocalUsersMap(): Record<string, PlayerProfile> {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_DB_KEY);
    const seeds = getSeedLocalUsers();
    if (!raw) {
      localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(seeds));
      return seeds;
    }
    const parsed = JSON.parse(raw) as Record<string, PlayerProfile>;
    return { ...seeds, ...parsed };
  } catch {
    return getSeedLocalUsers();
  }
}

export function saveUserToLocalMap(profile: PlayerProfile): PlayerProfile {
  try {
    const cleanKey = profile.username.trim().toLowerCase();
    const map = loadLocalUsersMap();
    map[cleanKey] = profile;
    localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(map));
    localStorage.setItem('fatteshha_active_user', cleanKey);
  } catch {
    // ignore storage errors
  }
  return profile;
}

export function getLocalUserProfile(username?: string | null): PlayerProfile | null {
  const map = loadLocalUsersMap();
  if (username) {
    const clean = username.trim().toLowerCase();
    if (map[clean]) return map[clean];
  }
  try {
    const savedActive = localStorage.getItem('fatteshha_active_user');
    if (savedActive && map[savedActive.trim().toLowerCase()]) {
      return map[savedActive.trim().toLowerCase()];
    }
  } catch {
    // ignore
  }
  return map['ahmad_kwt'] || null;
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
async function syncProfileWithSupabase(profile: PlayerProfile, email?: string): Promise<PlayerProfile> {
  if (!supabase) return profile;

  try {
    const cleanUsername = profile.username.trim().toLowerCase();

    // 1. Try reading existing row from Supabase 'profiles' table
    const { data: existingRow, error: selectErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', cleanUsername)
      .maybeSingle();

    if (!selectErr && existingRow) {
      const merged: PlayerProfile = {
        ...profile,
        id: existingRow.id || profile.id,
        username: existingRow.username || cleanUsername,
        displayName: existingRow.display_name || existingRow.displayName || profile.displayName,
        avatar: existingRow.avatar || profile.avatar,
        level: typeof existingRow.level === 'number' ? existingRow.level : profile.level,
        xp: typeof existingRow.xp === 'number' ? existingRow.xp : profile.xp,
        coins: typeof existingRow.coins === 'number' ? existingRow.coins : profile.coins,
        hintsRemaining:
          typeof existingRow.hints_remaining === 'number'
            ? existingRow.hints_remaining
            : profile.hintsRemaining,
        completedLevels: existingRow.completed_levels || profile.completedLevels || {},
        multiplayerWins:
          typeof existingRow.multiplayer_wins === 'number'
            ? existingRow.multiplayer_wins
            : profile.multiplayerWins,
        multiplayerLosses:
          typeof existingRow.multiplayer_losses === 'number'
            ? existingRow.multiplayer_losses
            : profile.multiplayerLosses,
        achievements: Array.isArray(existingRow.achievements)
          ? existingRow.achievements
          : profile.achievements || []
      };
      return saveUserToLocalMap(merged);
    }

    // 2. Upsert row into Supabase 'profiles' table if table exists
    await supabase.from('profiles').upsert(
      {
        id: profile.id,
        username: cleanUsername,
        email: email || `${cleanUsername}@gmail.com`,
        display_name: profile.displayName,
        avatar: profile.avatar,
        level: profile.level,
        xp: profile.xp,
        coins: profile.coins,
        hints_remaining: profile.hintsRemaining,
        completed_levels: profile.completedLevels || {},
        multiplayer_wins: profile.multiplayerWins || 0,
        multiplayer_losses: profile.multiplayerLosses || 0,
        achievements: profile.achievements || [],
        updated_at: new Date().toISOString()
      },
      { onConflict: 'username' }
    );
  } catch {
    // Gracefully continue if Supabase table schema differs or RLS blocks anonymous write
  }

  return saveUserToLocalMap(profile);
}

// Unified Account Login / Registration that works on Node backend, Supabase, AND Vercel/Netlify static hosting
export async function loginOrRegisterAccount(params: {
  username: string;
  displayName: string;
  email?: string;
  avatar?: string;
}): Promise<PlayerProfile> {
  const cleanUsername =
    params.username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_') || `user_${Date.now()}`;
  const cleanDisplayName = params.displayName.trim() || cleanUsername;
  const chosenAvatar = params.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg';

  // 1. Try Express API (/api/auth/login -> /api/auth/register) when running on Node server
  const loginData = await safeApiJson<{ success?: boolean; user?: PlayerProfile }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: cleanUsername, password: '123456' })
  });

  if (loginData?.success && loginData.user) {
    const updatedUser: PlayerProfile = {
      ...loginData.user,
      displayName: cleanDisplayName || loginData.user.displayName
    };
    return await syncProfileWithSupabase(saveUserToLocalMap(updatedUser), params.email);
  }

  const regData = await safeApiJson<{ success?: boolean; user?: PlayerProfile }>('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: cleanUsername,
      displayName: cleanDisplayName,
      password: '123456',
      avatar: chosenAvatar
    })
  });

  if (regData?.success && regData.user) {
    return await syncProfileWithSupabase(saveUserToLocalMap(regData.user), params.email);
  }

  // 2. Vercel / Netlify / Static or Supabase direct mode: load existing profile or create a new one immediately
  const localMap = loadLocalUsersMap();
  const existingLocal = localMap[cleanUsername];

  const baseProfile: PlayerProfile = existingLocal
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
        coins: 150,
        hintsRemaining: 5,
        completedLevelsCount: 0,
        completedLevels: {},
        dailyChallenges: createDefaultDailyChallenges(),
        dailyStreak: createDefaultDailyStreak(),
        friends: ['ahmad_kwt', 'dana_q8'].filter(f => f !== cleanUsername),
        totalScore: 0,
        multiplayerWins: 0,
        multiplayerLosses: 0,
        achievements: [],
        createdAt: new Date().toISOString()
      };

  return await syncProfileWithSupabase(saveUserToLocalMap(baseProfile), params.email);
}

// Unified Guest Login that gives each browser window/tab a distinct Guest tag & ID
export async function loginAsGuestAccount(): Promise<PlayerProfile> {
  // Use sessionStorage first so two windows/tabs playing as Guest get distinct Guest numbers!
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
  const guestProfile: PlayerProfile = existing || {
    id: `usr_${guestId}`,
    username: guestId,
    displayName: guestDisplayName,
    avatar: '/assets/images/login_kuwaiti_mascot_1794483388654.jpg',
    level: 1,
    xp: 0,
    coins: 100,
    hintsRemaining: 5,
    completedLevelsCount: 0,
    completedLevels: {},
    dailyChallenges: createDefaultDailyChallenges(),
    dailyStreak: createDefaultDailyStreak(),
    friends: [],
    totalScore: 0,
    multiplayerWins: 0,
    multiplayerLosses: 0,
    achievements: [],
    createdAt: new Date().toISOString()
  };

  return await syncProfileWithSupabase(saveUserToLocalMap(guestProfile));
}
