import { createClient, SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
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
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

const LOCAL_USERS_DB_KEY = 'fatteshha_users_db_v1';
const LOCAL_PASSWORDS_DB_KEY = 'fatteshha_auth_passwords_v1';

// Simple deterministic hash for client-side/profile password verification fallback
function hashPassword(email: string, rawPassword: string): string {
  const normalized = `${email.trim().toLowerCase()}::${rawPassword}`;
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

function saveLocalPasswordHash(usernameOrEmail: string, hash: string): void {
  try {
    const map = loadLocalPasswordsMap();
    map[usernameOrEmail.trim().toLowerCase()] = hash;
    localStorage.setItem(LOCAL_PASSWORDS_DB_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
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
export async function syncProfileWithSupabase(
  profile: PlayerProfile,
  email?: string,
  passwordHash?: string
): Promise<PlayerProfile> {
  if (!supabase) return saveUserToLocalMap(profile);

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
    const rowPayload: Record<string, unknown> = {
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
    };
    if (passwordHash) {
      rowPayload.password_hash = passwordHash;
    }

    await supabase.from('profiles').upsert(rowPayload, { onConflict: 'username' });
  } catch {
    // Gracefully continue if Supabase table schema differs or RLS blocks anonymous write
  }

  return saveUserToLocalMap(profile);
}

// Convert a verified Supabase Auth user (from Google OAuth, Email Password, or OTP) into a PlayerProfile
export async function buildProfileFromSupabaseUser(
  sbUser: SupabaseUser,
  fallbackDisplayName?: string
): Promise<PlayerProfile> {
  const email = (sbUser.email || '').trim().toLowerCase();
  const emailPrefix = email ? email.split('@')[0] : '';
  const cleanUsername =
    emailPrefix.replace(/[^a-z0-9_]/gi, '_').toLowerCase() ||
    `user_${sbUser.id.slice(0, 8).toLowerCase()}`;

  const meta = sbUser.user_metadata || {};
  const displayName =
    fallbackDisplayName?.trim() ||
    meta.full_name ||
    meta.name ||
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

  return await syncProfileWithSupabase(saveUserToLocalMap(baseProfile), email);
}

// ============================================================================
// 1. REAL GOOGLE OAUTH REDIRECT / POPUP VIA SUPABASE AUTH
// ============================================================================
export async function signInWithRealGoogleOAuth(): Promise<{ redirected: boolean; error?: string }> {
  if (!supabase) {
    return {
      redirected: false,
      error:
        'لم يتم العثور على مفاتيح Supabase (VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY) في إعدادات الاستضافة.'
    };
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
        window.open(data.url, 'google_oauth_popup', 'width=540,height=680');
        return { redirected: true };
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
      error: err?.message || 'تعذر فتح صفحة مصادقة Google الرسمية'
    };
  }

  return { redirected: false };
}

// ============================================================================
// 2. REAL EMAIL + PASSWORD AUTHENTICATION (PREVENTS UNAUTHORIZED EMAIL ACCESS)
// ============================================================================
export async function authenticateWithEmailPassword(params: {
  mode: 'LOGIN' | 'REGISTER';
  email: string;
  password: string;
  displayName?: string;
}): Promise<PlayerProfile> {
  const cleanEmail = params.email.trim().toLowerCase();
  const rawPassword = params.password;
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('يرجى إدخال بريد إلكتروني صحيح (مثال: name@gmail.com)');
  }
  if (!rawPassword || rawPassword.length < 6) {
    throw new Error('يرجى إدخال كلمة مرور مكونة من 6 خانات على الأقل لحماية حسابك');
  }

  const emailPrefix = cleanEmail.split('@')[0];
  const cleanUsername =
    emailPrefix.replace(/[^a-z0-9_]/gi, '_').toLowerCase() || `user_${Date.now().toString(36)}`;
  const cleanDisplayName = params.displayName?.trim() || emailPrefix || 'لاعب فتّشها';
  const pwHash = hashPassword(cleanEmail, rawPassword);

  // A. If Supabase Auth is configured, use official Supabase Email+Password Auth first!
  if (supabase) {
    if (params.mode === 'LOGIN') {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: rawPassword
      });
      if (!error && data?.user) {
        saveLocalPasswordHash(cleanEmail, pwHash);
        saveLocalPasswordHash(cleanUsername, pwHash);
        return await buildProfileFromSupabaseUser(data.user, params.displayName);
      }
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
          throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة! لا يمكن الدخول إلا لصاحب الحساب.');
        }
        if (msg.includes('email not confirmed')) {
          throw new Error('يرجى تأكيد بريدك الإلكتروني عبر الرابط المرسل إلى بريدك الوارد أولاً، أو استخدم رمز التحقق (OTP).');
        }
      }
    } else {
      // REGISTER mode via Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: rawPassword,
        options: {
          data: {
            full_name: cleanDisplayName,
            username: cleanUsername
          }
        }
      });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('already registered') || msg.includes('already exists')) {
          throw new Error('هذا البريد الإلكتروني مسجّل مسبقاً! انتقل إلى «تسجيل دخول» وأدخل كلمة المرور الخاصة بك.');
        }
        throw new Error(error.message);
      }
      if (data?.user) {
        saveLocalPasswordHash(cleanEmail, pwHash);
        saveLocalPasswordHash(cleanUsername, pwHash);
        return await buildProfileFromSupabaseUser(data.user, cleanDisplayName);
      }
    }
  }

  // B. Verify against Supabase 'profiles' table & Express API & Local Password Store
  const localPasswords = loadLocalPasswordsMap();
  const storedHash = localPasswords[cleanEmail] || localPasswords[cleanUsername];

  if (supabase) {
    try {
      const { data: existingRow } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (existingRow) {
        const remoteHash = existingRow.password_hash;
        if (params.mode === 'REGISTER' && (remoteHash || storedHash)) {
          throw new Error('هذا البريد مسجّل مسبقاً ومحمِي بكلمة مرور! اختر «تسجيل دخول» وأدخل كلمة المرور.');
        }
        if (params.mode === 'LOGIN' && remoteHash && remoteHash !== pwHash) {
          throw new Error('كلمة المرور غير صحيحة لهذا الحساب! لا يمكن الدخول إلا لصاحب البريد الإلكتروني.');
        }
      } else if (params.mode === 'LOGIN' && !storedHash) {
        throw new Error('لا يوجد حساب مسجّل بهذا البريد بعد — اختر «حساب جديد» لتعيين كلمة مرور خاصة بك أولاً.');
      }
    } catch (err: any) {
      if (err?.message?.includes('كلمة المرور') || err?.message?.includes('مسجّل')) {
        throw err;
      }
    }
  }

  // C. Check Express backend (/api/auth/login or /api/auth/register) with real password
  if (params.mode === 'LOGIN') {
    if (storedHash && storedHash !== pwHash) {
      throw new Error('كلمة المرور غير صحيحة لهذا الحساب! لا يمكن الدخول إلا لصاحب البريد الإلكتروني.');
    }
    const loginRes = await safeApiJson<{ success?: boolean; user?: PlayerProfile; message?: string }>(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUsername, password: rawPassword })
      }
    );
    if (loginRes?.success && loginRes.user) {
      saveLocalPasswordHash(cleanEmail, pwHash);
      saveLocalPasswordHash(cleanUsername, pwHash);
      return await syncProfileWithSupabase(saveUserToLocalMap(loginRes.user), cleanEmail, pwHash);
    }
    const localMap = loadLocalUsersMap();
    if (!localMap[cleanUsername] && !storedHash) {
      throw new Error('لا يوجد حساب مسجّل بهذا البريد الإلكتروني — اختر «حساب جديد» لإنشاء حسابك وتعيين كلمة مرورك.');
    }
    if (!storedHash) {
      throw new Error('يرجى تعيين كلمة مرور للحساب أولاً عبر تبويب «حساب جديد» لحمايته من دخول الآخرين.');
    }
  } else {
    // REGISTER mode
    if (storedHash) {
      throw new Error('هذا الحساب مسجّل ومحمِي بكلمة مرور مسبقاً! انتقل إلى «تسجيل دخول» وأدخل كلمة المرور.');
    }
    const regRes = await safeApiJson<{ success?: boolean; user?: PlayerProfile }>(
      '/api/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUsername,
          displayName: cleanDisplayName,
          password: rawPassword,
          avatar: '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg'
        })
      }
    );
    saveLocalPasswordHash(cleanEmail, pwHash);
    saveLocalPasswordHash(cleanUsername, pwHash);
    if (regRes?.success && regRes.user) {
      return await syncProfileWithSupabase(saveUserToLocalMap(regRes.user), cleanEmail, pwHash);
    }
  }

  saveLocalPasswordHash(cleanEmail, pwHash);
  saveLocalPasswordHash(cleanUsername, pwHash);
  const profile = await loginOrRegisterAccount({
    username: cleanUsername,
    displayName: cleanDisplayName,
    email: cleanEmail
  });
  return await syncProfileWithSupabase(profile, cleanEmail, pwHash);
}

// ============================================================================
// 3. REAL EMAIL OTP CODE VERIFICATION VIA SUPABASE AUTH
// ============================================================================
export async function sendEmailVerificationOtp(email: string, displayName?: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('يرجى إدخال بريد إلكتروني صحيح لإرسال رمز التحقق');
  }
  if (!supabase) {
    throw new Error('إرسال رمز التحقق عبر البريد يتطلب ربط مفاتيح Supabase في إعدادات الموقع.');
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: window.location.origin,
      data: {
        full_name: displayName?.trim() || cleanEmail.split('@')[0]
      }
    }
  });

  if (error) {
    throw new Error(error.message || 'تعذر إرسال رمز التحقق إلى البريد الإلكتروني');
  }
}

export async function verifyEmailOtpCode(
  email: string,
  tokenCode: string,
  displayName?: string
): Promise<PlayerProfile> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanToken = tokenCode.trim();
  if (!cleanToken) {
    throw new Error('يرجى إدخال رمز التحقق المرسل إلى بريدك الإلكتروني');
  }
  if (!supabase) {
    throw new Error('التحقق من الرمز يتطلب الاتصال بخدمة Supabase.');
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email: cleanEmail,
    token: cleanToken,
    type: 'email'
  });

  if (error || !data?.user) {
    throw new Error('رمز التحقق غير صحيح أو منتهي الصلاحية! تأكد من الرمز المرسل إلى بريدك.');
  }

  return await buildProfileFromSupabaseUser(data.user, displayName);
}

// Unified Account Login / Registration helper for preset accounts
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
