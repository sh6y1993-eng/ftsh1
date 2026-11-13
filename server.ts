import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { getRandomCategoryWords } from './src/engine/gameCategories';
import { generateWordSearchGrid } from './src/engine/wordSearch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data folder exists for persistence
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_FILE = path.join(DATA_DIR, 'database.json');

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
}

interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  avatar: string;
  level: number;
  xp: number;
  coins: number;
  hintsRemaining: number;
  completedLevels: Record<string, { stars: number; bestTime: number; score: number; accuracy?: number; completedAt?: string }>;
  dailyChallenges?: ServerDailyChallengesState;
  dailyStreak?: ServerDailyStreakState;
  friends?: string[];
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

interface DatabaseState {
  users: Record<string, UserRecord>;
  localProfiles: Record<string, { id: string; name: string; avatar: string; color: string }>;
  leaderboard: { username: string; displayName: string; avatar: string; xp: number; wins: number; stars: number }[];
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
    return user.dailyChallenges;
  }

  user.dailyChallenges = {
    dateKey: today,
    tasks: generateThreeRandomTasks(user.username, forceReroll ? Date.now() : undefined)
  };
  return user.dailyChallenges;
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

  Object.entries(seedAccounts).forEach(([uname, seed]) => {
    if (!state.users[uname]) {
      state.users[uname] = { ...seed };
    } else if (!Array.isArray(state.users[uname].friends)) {
      state.users[uname].friends = seed.friends || [];
    }
  });

  Object.values(state.users).forEach(u => {
    if (!Array.isArray(u.friends)) {
      u.friends = [];
    }
    ensureUserDailyChallenges(u);
  });
}

function loadDatabase(): DatabaseState {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed: DatabaseState = JSON.parse(content);
      ensureSeedUsers(parsed);
      syncLeaderboard(parsed);
      return parsed;
    }
  } catch (err) {
    console.error('Failed to load database file, creating fresh:', err);
  }

  const defaultState: DatabaseState = {
    users: {},
    localProfiles: {
      p1: { id: 'p1', name: 'اللاعب 1 (فهد)', avatar: '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg', color: '#0ea5e9' },
      p2: { id: 'p2', name: 'اللاعب 2 (سارة)', avatar: '/assets/images/avatar_kuwaiti_girl_1794404783186.jpg', color: '#ec4899' },
      p3: { id: 'p3', name: 'اللاعب 3 (عبدالله)', avatar: '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg', color: '#10b981' },
      p4: { id: 'p4', name: 'اللاعب 4 (ريم)', avatar: '/assets/images/avatar_kuwaiti_girl_1794404783186.jpg', color: '#f59e0b' }
    },
    leaderboard: []
  };

  ensureSeedUsers(defaultState);
  syncLeaderboard(defaultState);
  saveDatabase(defaultState);
  return defaultState;
}

function saveDatabase(state: DatabaseState) {
  try {
    syncLeaderboard(state);
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save database file:', err);
  }
}

let db = loadDatabase();

// In-memory active Online Multiplayer Rooms
interface ActiveRoom {
  code: string;
  roomName: string;
  hostId: string;
  isPublic: boolean;
  gameMode: 'WORD_RACE';
  roundNumber: number;
  stagesCount: number;
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

const activeRooms: Record<string, ActiveRoom> = {};
const roomSockets: Record<string, Map<string, WebSocket>> = {};
const allLobbySockets = new Set<WebSocket>();
// Real-time user presence tracking (username -> Set of active WebSockets)
const userPresenceSockets = new Map<string, Set<WebSocket>>();
const userLastSeen = new Map<string, number>();
const pendingRoomInvites: Record<string, ServerRoomInvite[]> = {};

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

function getFriendsPayloadForUser(username: string) {
  const clean = normalizeUsername(username) || 'ahmad_kwt';
  const user = db.users[clean] || db.users['ahmad_kwt'];
  if (!user) {
    return { friends: [], suggestions: [], pendingInvites: [] };
  }
  if (!Array.isArray(user.friends)) {
    user.friends = [];
  }

  const friendSummaries = user.friends
    .map(fName => db.users[normalizeUsername(fName)])
    .filter((f): f is UserRecord => Boolean(f))
    .map(f => buildFriendSummary(f))
    .sort((a, b) => {
      const rank = { IN_ROOM: 0, ONLINE: 1, IN_GAME: 2, OFFLINE: 3 };
      return rank[a.onlineStatus] - rank[b.onlineStatus] || b.xp - a.xp;
    });

  const friendSet = new Set(user.friends.map(f => normalizeUsername(f)));
  const suggestions = Object.values(db.users)
    .filter(u => normalizeUsername(u.username) !== clean && !friendSet.has(normalizeUsername(u.username)))
    .map(u => buildFriendSummary(u))
    .sort((a, b) => {
      const rank = { IN_ROOM: 0, ONLINE: 1, IN_GAME: 2, OFFLINE: 3 };
      return rank[a.onlineStatus] - rank[b.onlineStatus] || b.xp - a.xp;
    })
    .slice(0, 12);

  // Filter out expired room invites (older than 15 mins or rooms that no longer exist)
  const rawInvites = pendingRoomInvites[clean] || [];
  const validInvites = rawInvites.filter(inv => {
    const room = activeRooms[inv.roomCode];
    const ageMs = Date.now() - inv.createdAt;
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

function createAuthoritativeBoard(categoryId: string, gridSize = 10, wordCount = 7) {
  const rawWords = getRandomCategoryWords(categoryId, wordCount);
  const generated = generateWordSearchGrid(rawWords, gridSize);
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

function getPublicRoomsSummary() {
  return Object.values(activeRooms)
    .filter(r => r.isPublic && r.state === 'WAITING' && Object.keys(r.players).length < 2)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(r => {
      const host = r.players[r.hostId] || Object.values(r.players)[0];
      return {
        code: r.code,
        roomName: r.roomName || `غرفة ${host?.displayName || 'الكويت'}`,
        hostName: host?.displayName || 'لاعب كويتي',
        hostAvatar: host?.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
        categoryId: r.categoryId,
        stagesCount: r.stagesCount || 50,
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
app.use(express.json());

// Auth & Player APIs
app.post('/api/auth/register', (req, res) => {
  const { username, displayName, password, avatar } = req.body;
  if (!username || !displayName) {
    return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم والاسم المعروض' });
  }

  const cleanUser = username.trim().toLowerCase();
  if (db.users[cleanUser]) {
    return res.status(400).json({ error: 'اسم المستخدم مسجل مسبقاً، اختر اسماً آخر' });
  }

  const newUser: UserRecord = {
    id: `usr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    username: cleanUser,
    displayName: displayName.trim(),
    passwordHash: password || '123456',
    avatar: avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
    level: 1,
    xp: 0,
    coins: 100,
    hintsRemaining: 5,
    completedLevels: {},
    multiplayerWins: 0,
    multiplayerLosses: 0,
    achievements: [],
    createdAt: new Date().toISOString()
  };

  ensureUserDailyChallenges(newUser);
  db.users[cleanUser] = newUser;
  saveDatabase(db);

  res.json({ success: true, user: newUser });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم' });
  }

  const cleanUser = username.trim().toLowerCase();
  const user = db.users[cleanUser];

  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }

  if (password && user.passwordHash !== password) {
    return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
  }

  ensureUserDailyChallenges(user);
  saveDatabase(db);
  res.json({ success: true, user });
});

app.get('/api/auth/me', (req, res) => {
  const username = (req.headers['x-user-id'] as string) || 'ahmad_kwt';
  const cleanUser = username.trim().toLowerCase();
  const user = db.users[cleanUser] || db.users['ahmad_kwt'];
  if (user) {
    ensureUserDailyChallenges(user);
  }
  res.json({ success: true, user });
});

app.get('/api/users', (req, res) => {
  const usersList = Object.values(db.users).map(u => {
    ensureUserDailyChallenges(u);
    const { passwordHash: _pw, ...rest } = u;
    return rest;
  });
  res.json({ success: true, users: usersList });
});

app.post('/api/auth/guest', (req, res) => {
  const { guestId, displayName } = req.body;
  const rawId = (guestId || `g_${Date.now()}`).toString().replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  const username = rawId.startsWith('guest_') ? rawId : `guest_${rawId}`;

  if (!db.users[username]) {
    const suffix = username.replace('guest_', '').slice(-4).toUpperCase() || '1';
    db.users[username] = {
      id: `usr_${username}`,
      username,
      displayName: displayName?.trim() || `ضيف فتّشها #${suffix}`,
      passwordHash: 'guest',
      avatar: '/assets/images/login_kuwaiti_mascot_1794483388654.jpg',
      level: 1,
      xp: 0,
      coins: 100,
      hintsRemaining: 5,
      completedLevels: {},
      multiplayerWins: 0,
      multiplayerLosses: 0,
      achievements: [],
      createdAt: new Date().toISOString()
    };
  }

  ensureUserDailyChallenges(db.users[username]);
  saveDatabase(db);
  res.json({ success: true, user: db.users[username] });
});

// Update Player Profile (Avatar & Display Name)
app.post('/api/profile/update', (req, res) => {
  const { username, displayName, avatar } = req.body;
  const cleanUser = (username || 'ahmad_kwt').trim().toLowerCase();
  const user = db.users[cleanUser];

  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }

  if (typeof displayName === 'string' && displayName.trim()) {
    user.displayName = displayName.trim();
  }
  if (typeof avatar === 'string' && avatar.trim()) {
    user.avatar = avatar.trim();
  }

  saveDatabase(db);
  res.json({ success: true, user });
});

app.post('/api/progress/reset', (req, res) => {
  const { username } = req.body;
  const cleanUser = (username || 'ahmad_kwt').trim().toLowerCase();
  const user = db.users[cleanUser];

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
  ensureUserDailyChallenges(user, true);

  saveDatabase(db);
  res.json({ success: true, user });
});

// Daily Challenges Endpoints
app.get('/api/daily-challenges', (req, res) => {
  const username = ((req.query.username as string) || (req.headers['x-user-id'] as string) || 'ahmad_kwt').trim().toLowerCase();
  const user = db.users[username] || db.users['ahmad_kwt'];
  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }
  const dailyChallenges = ensureUserDailyChallenges(user);
  saveDatabase(db);
  res.json({ success: true, dailyChallenges, user });
});

app.post('/api/daily-challenges/word-found', (req, res) => {
  const { username, elapsedSeconds } = req.body;
  const cleanUser = (username || 'ahmad_kwt').trim().toLowerCase();
  const user = db.users[cleanUser];
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
  res.json({ success: true, dailyChallenges: daily, newlyCompleted, user });
});

app.post('/api/daily-challenges/claim', (req, res) => {
  const { username, taskId } = req.body;
  const cleanUser = (username || 'ahmad_kwt').trim().toLowerCase();
  const user = db.users[cleanUser];

  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }

  const daily = ensureUserDailyChallenges(user);
  const task = daily.tasks.find(t => t.id === taskId);

  if (!task) {
    return res.status(404).json({ error: 'التحدي غير موجود' });
  }

  if (!task.completed) {
    return res.status(400).json({ error: 'لم يكتمل هذا التحدي بعد' });
  }

  if (task.claimed) {
    return res.status(400).json({ error: 'تم استلام مكافأة هذا التحدي مسبقاً' });
  }

  task.claimed = true;
  user.coins += task.rewardCoins;
  user.xp += task.rewardXP;
  user.level = Math.floor(user.xp / 300) + 1;

  saveDatabase(db);
  res.json({
    success: true,
    user,
    rewardCoins: task.rewardCoins,
    rewardXP: task.rewardXP,
    dailyChallenges: daily
  });
});

app.post('/api/daily-challenges/reroll', (req, res) => {
  const { username } = req.body;
  const cleanUser = (username || 'ahmad_kwt').trim().toLowerCase();
  const user = db.users[cleanUser];

  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }

  const daily = ensureUserDailyChallenges(user, true);
  saveDatabase(db);
  res.json({ success: true, user, dailyChallenges: daily });
});

app.post('/api/progress/claim-mission', (req, res) => {
  const { username, missionId, rewardCoins, rewardXP } = req.body;
  const cleanUser = (username || 'ahmad_kwt').trim().toLowerCase();
  const user = db.users[cleanUser];

  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }

  const missionTag = `mission_${missionId}`;
  if (!user.achievements.includes(missionTag)) {
    user.achievements.push(missionTag);
    user.coins += Number(rewardCoins) || 100;
    user.xp += Number(rewardXP) || 100;
    user.level = Math.floor(user.xp / 300) + 1;
    saveDatabase(db);
  }

  res.json({ success: true, user });
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

app.post('/api/progress/complete-level', (req, res) => {
  const { username, categoryId, levelNumber, timeSpent, stars, score, accuracy, wordsFoundCount, hintsUsedCount } = req.body;
  const cleanUser = (username || 'ahmad_kwt').trim().toLowerCase();
  const user = db.users[cleanUser];

  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير مسجل' });
  }

  const levelKey = `${categoryId}_${levelNumber}`;
  const existing = user.completedLevels[levelKey];

  let earnedXP = 50 + (stars * 20) + Math.max(0, 100 - Math.floor(timeSpent));
  let earnedCoins = 10 + (stars * 5);

  const normalizedAccuracy = typeof accuracy === 'number' ? Math.max(0, Math.min(100, Math.round(accuracy))) : 95;

  user.completedLevels[levelKey] = {
    stars: Math.max(existing?.stars || 0, stars),
    bestTime: existing ? Math.min(existing.bestTime, timeSpent) : timeSpent,
    score: existing ? Math.max(existing.score, score) : score,
    accuracy: existing?.accuracy ? Math.max(existing.accuracy, normalizedAccuracy) : normalizedAccuracy,
    completedAt: new Date().toISOString()
  };

  // Evaluate Daily Challenges progress on stage completion
  const daily = ensureUserDailyChallenges(user);
  const completedDailyTasks: ServerDailyChallengeTask[] = [];
  const wordsCount = typeof wordsFoundCount === 'number' ? wordsFoundCount : 5;
  const hintsUsed = typeof hintsUsedCount === 'number' ? hintsUsedCount : 0;

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

    // Auto-award newly completed daily challenges immediately so the player gets their extra coins & XP right away!
    if (task.completed && !wasCompleted && !task.claimed) {
      task.claimed = true;
      earnedCoins += task.rewardCoins;
      earnedXP += task.rewardXP;
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
  user.coins += earnedCoins;
  user.level = Math.floor(user.xp / 300) + 1;

  // Check achievements
  const totalCompleted = Object.keys(user.completedLevels).length;
  if (totalCompleted >= 1 && !user.achievements.includes('first_level')) {
    user.achievements.push('first_level');
  }
  if (timeSpent < 60 && !user.achievements.includes('speed_demon')) {
    user.achievements.push('speed_demon');
  }
  if (stars === 3 && !user.achievements.includes('three_stars')) {
    user.achievements.push('three_stars');
  }
  if (normalizedAccuracy === 100 && !user.achievements.includes('sharpshooter')) {
    user.achievements.push('sharpshooter');
  }

  saveDatabase(db);

  res.json({
    success: true,
    user,
    earnedXP,
    earnedCoins,
    completedDailyTasks,
    streakReward,
    levelUp: user.level > Math.floor(previousXP / 300) + 1
  });
});

app.post('/api/hints/use', (req, res) => {
  const { username } = req.body;
  const cleanUser = (username || 'ahmad_kwt').trim().toLowerCase();
  const user = db.users[cleanUser];

  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }

  if (user.hintsRemaining <= 0) {
    return res.status(400).json({ error: 'نفدت التلميحات لديك!' });
  }

  user.hintsRemaining -= 1;
  saveDatabase(db);

  res.json({ success: true, hintsRemaining: user.hintsRemaining });
});

app.post('/api/hints/buy', (req, res) => {
  const { username, amount, cost } = req.body;
  const cleanUser = (username || 'ahmad_kwt').trim().toLowerCase();
  const user = db.users[cleanUser];

  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }

  if (user.coins < cost) {
    return res.status(400).json({ error: 'العملات غير كافية لشراء تلميحات' });
  }

  user.coins -= cost;
  user.hintsRemaining += amount;
  saveDatabase(db);

  res.json({ success: true, hintsRemaining: user.hintsRemaining, coins: user.coins });
});

app.get('/api/leaderboard', (req, res) => {
  res.json({ success: true, leaderboard: db.leaderboard.slice(0, 20) });
});

app.get('/api/online/rooms', (req, res) => {
  res.json({ success: true, rooms: getPublicRoomsSummary() });
});

// ============================================================================
// FRIEND SYSTEM & DIRECT PRIVATE ROOM INVITE ENDPOINTS
// ============================================================================
app.get('/api/friends', (req, res) => {
  const rawUser = (req.query.username as string) || (req.headers['x-user-id'] as string) || 'ahmad_kwt';
  const cleanUser = normalizeUsername(rawUser) || 'ahmad_kwt';
  const payload = getFriendsPayloadForUser(cleanUser);
  res.json({
    success: true,
    ...payload
  });
});

app.get('/api/friends/search', (req, res) => {
  const q = normalizeUsername((req.query.q as string) || '');
  const rawUser = (req.query.username as string) || (req.headers['x-user-id'] as string) || 'ahmad_kwt';
  const cleanUser = normalizeUsername(rawUser) || 'ahmad_kwt';
  const currentUser = db.users[cleanUser];
  const friendSet = new Set((currentUser?.friends || []).map(f => normalizeUsername(f)));

  const results = Object.values(db.users)
    .filter(u => {
      const uClean = normalizeUsername(u.username);
      if (uClean === cleanUser) return false;
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
  const { username, friendUsername } = req.body;
  const cleanUser = normalizeUsername(username) || 'ahmad_kwt';
  const targetClean = normalizeUsername(friendUsername);

  const user = db.users[cleanUser];
  if (!user) {
    return res.status(404).json({ error: 'حسابك غير موجود' });
  }

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

  if (!Array.isArray(user.friends)) user.friends = [];
  if (!Array.isArray(targetUser.friends)) targetUser.friends = [];

  if (user.friends.some(f => normalizeUsername(f) === targetClean)) {
    return res.status(400).json({ error: `اللاعب «${targetUser.displayName}» مضاف بالفعل في قائمة أصدقائك` });
  }

  user.friends.push(targetUser.username);
  if (!targetUser.friends.some(f => normalizeUsername(f) === cleanUser)) {
    targetUser.friends.push(user.username);
  }

  saveDatabase(db);
  broadcastPresenceUpdate();

  const payload = getFriendsPayloadForUser(cleanUser);
  res.json({
    success: true,
    addedFriend: buildFriendSummary(targetUser),
    user,
    ...payload
  });
});

app.post('/api/friends/remove', (req, res) => {
  const { username, friendUsername } = req.body;
  const cleanUser = normalizeUsername(username) || 'ahmad_kwt';
  const targetClean = normalizeUsername(friendUsername);

  const user = db.users[cleanUser];
  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }

  user.friends = (user.friends || []).filter(f => normalizeUsername(f) !== targetClean);
  const targetUser = db.users[targetClean];
  if (targetUser && Array.isArray(targetUser.friends)) {
    targetUser.friends = targetUser.friends.filter(f => normalizeUsername(f) !== cleanUser);
  }

  saveDatabase(db);
  broadcastPresenceUpdate();

  const payload = getFriendsPayloadForUser(cleanUser);
  res.json({
    success: true,
    user,
    ...payload
  });
});

app.post('/api/friends/invite', (req, res) => {
  const { fromUsername, toUsername, roomCode, roomName, categoryId, stagesCount } = req.body;
  const senderClean = normalizeUsername(fromUsername) || 'ahmad_kwt';
  const targetClean = normalizeUsername(toUsername);
  const cleanCode = (roomCode || '').trim().toUpperCase();

  if (!targetClean || !cleanCode) {
    return res.status(400).json({ error: 'بيانات الدعوة غير مكتملة' });
  }

  const senderUser = db.users[senderClean];
  const targetUser = db.users[targetClean];
  if (!targetUser) {
    return res.status(404).json({ error: 'اللاعب المدعو غير موجود' });
  }

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
  const { username, inviteId, roomCode } = req.body;
  const cleanUser = normalizeUsername(username) || 'ahmad_kwt';
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

// Database schema endpoint for documentation and Cloudflare export
app.get('/api/schema', (req, res) => {
  const sql = `
-- Fatteshha Database Schema (SQLite / Cloudflare D1)
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

function generateServerRoomCode(prefix = 'KWT'): string {
  const cleanPrefix = (prefix || 'KWT').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 3).padEnd(3, 'K');
  const num = Math.floor(10 + Math.random() * 89);
  const code = `${cleanPrefix}${num}`;
  if (activeRooms[code]) {
    const altPrefixes = ['KWT', 'Q8R', 'FTS', 'DER'];
    const alt = altPrefixes[Math.floor(Math.random() * altPrefixes.length)];
    return `${alt}${Math.floor(10 + Math.random() * 89)}`;
  }
  return code;
}

// ============================================================================
// REST API ENDPOINTS FOR MULTIPLAYER ROOMS (FAIL-SAFE FOR IFRAME & WS TIMEOUTS)
// ============================================================================
app.get('/api/rooms/public', (req, res) => {
  res.json({ success: true, rooms: getPublicRoomsSummary() });
});

app.get('/api/rooms/:code', (req, res) => {
  const cleanCode = (req.params.code || '').trim().toUpperCase();
  const room = activeRooms[cleanCode];
  if (!room) {
    return res.status(404).json({ success: false, message: 'الغرفة غير موجودة' });
  }
  res.json({ success: true, room });
});

app.post('/api/rooms/create', (req, res) => {
  const { code, roomName, player, categoryId, levelNumber, stagesCount, isPublic } = req.body;
  if (!player || !player.id) {
    return res.status(400).json({ success: false, message: 'بيانات اللاعب مفقودة أو غير صالحة' });
  }

  const roomCode = (code || generateServerRoomCode(isPublic ? 'PUB' : 'KWT')).toUpperCase();
  const cleanName = (roomName || `غرفة ${player.displayName?.split(' ')[0] || 'أحمد'}`).trim();

  activeRooms[roomCode] = {
    code: roomCode,
    roomName: cleanName,
    hostId: player.id,
    isPublic: Boolean(isPublic),
    gameMode: 'WORD_RACE',
    roundNumber: 1,
    stagesCount: Number(stagesCount) || 50,
    categoryId: categoryId || 'kuwait_heritage',
    levelNumber: Number(levelNumber) || 1,
    gridSize: 10,
    words: [],
    grid: [],
    wordPlacements: [],
    players: {
      [player.id]: {
        ...player,
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
    chatMessages: []
  };

  if (!roomSockets[roomCode]) {
    roomSockets[roomCode] = new Map();
  }

  broadcastPublicRooms();
  broadcastPresenceUpdate();

  res.json({
    success: true,
    room: activeRooms[roomCode]
  });
});

app.post('/api/rooms/join', (req, res) => {
  const { code, player } = req.body;
  if (!player || !player.id) {
    return res.status(400).json({ success: false, message: 'بيانات اللاعب مفقودة أو غير صالحة' });
  }

  const cleanCode = (code || '').trim().toUpperCase();
  const room = activeRooms[cleanCode];

  if (!room) {
    return res.status(404).json({
      success: false,
      message: `الغرفة ذات الرمز (${cleanCode}) غير متوفرة حالياً أو انتهت.`
    });
  }

  if (room.state !== 'WAITING' && !room.players[player.id]) {
    return res.status(400).json({
      success: false,
      message: 'المباراة بدأت بالفعل في هذه الغرفة ولا يمكن الانضمام الآن'
    });
  }

  const isHost = room.hostId === player.id;
  const existingCount = Object.keys(room.players).length;
  if (existingCount >= 2 && !room.players[player.id]) {
    return res.status(400).json({
      success: false,
      message: 'الغرفة ممتلئة باللاعبين (الحد الأقصى لاعبان)'
    });
  }

  const existingOther = Object.values(room.players).find(p => p.id !== player.id);
  const finalDisplayName =
    existingOther && existingOther.displayName === player.displayName
      ? `${player.displayName} (2)`
      : room.players[player.id]?.displayName || player.displayName;

  room.players[player.id] = {
    ...player,
    displayName: finalDisplayName,
    isHost,
    score: room.players[player.id]?.score || 0,
    wordsFound: room.players[player.id]?.wordsFound || [],
    streak: room.players[player.id]?.streak || 0,
    roundWins: room.players[player.id]?.roundWins || 0,
    color: isHost ? '#0ea5e9' : '#ec4899',
    isReady: true,
    connected: true,
    lastPing: Date.now()
  };

  broadcastToRoom(cleanCode, {
    type: 'ROOM_UPDATED',
    payload: { room }
  });

  broadcastPublicRooms();
  broadcastPresenceUpdate();

  res.json({
    success: true,
    room
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

function clearRoomBotTimers(roomCode: string) {
  const list = roomBotTimers[roomCode];
  if (list) {
    list.forEach(t => clearTimeout(t));
    delete roomBotTimers[roomCode];
  }
}

function claimWordInRoom(
  code: string,
  rawWord: string,
  playerId: string,
  ws?: WebSocket
): boolean {
  const room = activeRooms[code];
  if (!room || room.state !== 'PLAYING') return false;

  const cleanTarget = cleanArabic(rawWord);
  const placement = room.wordPlacements.find(p => p.word === cleanTarget);

  if (!placement) {
    return false;
  }

  if (placement.foundBy) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const claimerName = room.players[placement.foundBy]?.displayName || 'الخصم';
      ws.send(
        JSON.stringify({
          type: 'WORD_ALREADY_CLAIMED',
          payload: {
            word: placement.displayWord,
            claimedBy: placement.foundBy,
            claimedByName: claimerName
          }
        })
      );
    }
    return false;
  }

  // Authoritatively assign word ownership to the first player who caught it!
  placement.foundBy = playerId;
  const claimingPlayer = room.players[playerId];
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
      if (!p.wordsFound.includes(cleanTarget)) {
        p.wordsFound.push(cleanTarget);
      }
    } else {
      p.streak = 0;
    }
  });

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
      room
    }
  });

  // Check if all words have been caught
  const allFound = room.wordPlacements.every(p => !!p.foundBy);
  if (allFound) {
    room.state = 'FINISHED';
    clearRoomBotTimers(code);

    // Winner is determined by who caught more words first (with score as tie-breaker)
    let bestWordsCount = -1;
    let bestScore = -1;
    let winnerId: string | undefined = undefined;

    Object.values(room.players).forEach(p => {
      const wCount = p.wordsFound.length;
      if (wCount > bestWordsCount || (wCount === bestWordsCount && p.score > bestScore)) {
        bestWordsCount = wCount;
        bestScore = p.score;
        winnerId = p.id;
      }
    });

    room.winnerId = winnerId;
    if (winnerId && room.players[winnerId]) {
      room.players[winnerId].roundWins = (room.players[winnerId].roundWins || 0) + 1;
    }

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
      }
    });
    saveDatabase(db);

    broadcastToRoom(code, {
      type: 'GAME_FINISHED',
      payload: {
        room,
        winnerId,
        winnerName: winnerId ? room.players[winnerId]?.displayName : 'تعادل'
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
  const { code } = req.body;
  const cleanCode = (code || '').trim().toUpperCase();
  const room = activeRooms[cleanCode];
  if (!room || room.state !== 'WAITING') {
    return res.status(400).json({ success: false, message: 'الغرفة غير جاهزة لإضافة منافس' });
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
    wordsFound: [],
    streak: 0,
    roundWins: 0,
    color: '#ec4899',
    isReady: true,
    connected: true,
    lastPing: Date.now()
  };

  const board = createAuthoritativeBoard(room.categoryId, 10, 7);
  room.state = 'PLAYING';
  room.startedAt = Date.now();
  room.roundNumber = 1;
  room.grid = board.grid;
  room.gridSize = board.gridSize;
  room.words = board.words;
  room.wordPlacements = board.wordPlacements;

  broadcastToRoom(cleanCode, {
    type: 'ROOM_UPDATED',
    payload: { room }
  });

  broadcastToRoom(cleanCode, {
    type: 'GAME_STARTED',
    payload: { room }
  });

  scheduleBotRivalLoop(cleanCode, botId);
  broadcastPublicRooms();

  res.json({ success: true, room });
});

app.post('/api/rooms/start', (req, res) => {
  const { code } = req.body;
  const cleanCode = (code || '').trim().toUpperCase();
  const room = activeRooms[cleanCode];
  if (!room) {
    return res.status(404).json({ success: false, message: 'الغرفة غير موجودة' });
  }

  const board = createAuthoritativeBoard(room.categoryId, 10, 7);
  room.state = 'PLAYING';
  room.startedAt = Date.now();
  room.roundNumber = 1;
  room.grid = board.grid;
  room.gridSize = board.gridSize;
  room.words = board.words;
  room.wordPlacements = board.wordPlacements;

  broadcastToRoom(cleanCode, {
    type: 'ROOM_UPDATED',
    payload: { room }
  });

  broadcastToRoom(cleanCode, {
    type: 'GAME_STARTED',
    payload: { room }
  });

  const botPlayer = Object.values(room.players).find(p => p.id.startsWith('bot_'));
  if (botPlayer) {
    scheduleBotRivalLoop(cleanCode, botPlayer.id);
  }

  broadcastPublicRooms();
  res.json({ success: true, room });
});

app.post('/api/rooms/leave', (req, res) => {
  const { code, playerId } = req.body;
  const cleanCode = (code || '').trim().toUpperCase();
  const room = activeRooms[cleanCode];
  if (room && playerId && room.players[playerId]) {
    clearRoomBotTimers(cleanCode);
    delete room.players[playerId];
    roomSockets[cleanCode]?.delete(playerId);
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
        payload: { room }
      });
    }
    broadcastPublicRooms();
  }
  broadcastPresenceUpdate();
  res.json({ success: true });
});

wss.on('connection', (ws) => {
  let boundRoomCode: string | null = null;
  let boundPlayerId: string | null = null;
  let boundUsername: string | null = null;
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

  // Immediately send current public waiting rooms
  ws.send(JSON.stringify({
    type: 'PUBLIC_ROOMS_UPDATED',
    payload: { rooms: getPublicRoomsSummary() }
  }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const { type, payload } = msg;

      switch (type) {
        case 'REGISTER_PRESENCE': {
          const uname = normalizeUsername(payload?.username);
          if (uname) {
            registerSocketUsername(uname);
            ws.send(
              JSON.stringify({
                type: 'FRIENDS_PRESENCE_UPDATED',
                payload: getFriendsPayloadForUser(uname)
              })
            );
            broadcastPresenceUpdate();
          }
          break;
        }

        case 'SEND_ROOM_INVITE': {
          const { fromUsername, toUsername, roomCode, roomName, categoryId, stagesCount } = payload || {};
          const senderClean = normalizeUsername(fromUsername) || boundUsername || 'ahmad_kwt';
          const targetClean = normalizeUsername(toUsername);
          const cleanCode = (roomCode || '').trim().toUpperCase();
          const senderUser = db.users[senderClean];
          const targetUser = db.users[targetClean];

          if (targetUser && cleanCode) {
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
            payload: { rooms: getPublicRoomsSummary() }
          }));
          break;
        }

        case 'ROOM_CREATE': {
          const { code, roomName, player, categoryId, levelNumber, stagesCount, isPublic } = payload;
          const roomCode = (code || generateServerRoomCode(isPublic ? 'PUB' : 'KWT')).toUpperCase();
          boundRoomCode = roomCode;
          boundPlayerId = player.id;
          if (player?.username) {
            registerSocketUsername(player.username);
          }

          activeRooms[roomCode] = {
            code: roomCode,
            roomName: (roomName || `غرفة ${player.displayName?.split(' ')[0] || 'أحمد'}`).trim(),
            hostId: player.id,
            isPublic: Boolean(isPublic),
            gameMode: 'WORD_RACE',
            roundNumber: 1,
            stagesCount: Number(stagesCount) || 50,
            categoryId: categoryId || 'kuwait_heritage',
            levelNumber: levelNumber || 1,
            gridSize: 10,
            words: [],
            grid: [],
            wordPlacements: [],
            players: {
              [player.id]: {
                ...player,
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
            chatMessages: []
          };

          if (!roomSockets[roomCode]) {
            roomSockets[roomCode] = new Map();
          }
          roomSockets[roomCode].set(player.id, ws);

          ws.send(JSON.stringify({
            type: 'ROOM_CREATED',
            payload: { room: activeRooms[roomCode] }
          }));

          broadcastPublicRooms();
          broadcastPresenceUpdate();
          break;
        }

        case 'QUICK_MATCH': {
          const { player, categoryId, roomName, stagesCount } = payload;
          const preferredCat = categoryId || 'kuwait_heritage';

          // Find an open waiting public room (prefer matching category first, then any open public room)
          const openPublicRooms = Object.values(activeRooms).filter(
            r => r.isPublic && r.state === 'WAITING' && Object.keys(r.players).length < 2 && !r.players[player.id]
          );

          const matchedRoom =
            openPublicRooms.find(r => r.categoryId === preferredCat) ||
            openPublicRooms[0];

          if (matchedRoom) {
            const code = matchedRoom.code;
            boundRoomCode = code;
            boundPlayerId = player.id;

            const hostPlayer = Object.values(matchedRoom.players)[0];
            const finalDisplayName =
              hostPlayer && hostPlayer.displayName === player.displayName
                ? `${player.displayName} (2)`
                : player.displayName;

            matchedRoom.players[player.id] = {
              ...player,
              displayName: finalDisplayName,
              isHost: false,
              score: 0,
              wordsFound: [],
              streak: 0,
              roundWins: 0,
              color: '#ec4899',
              isReady: true,
              connected: true,
              lastPing: Date.now()
            };

            if (!roomSockets[code]) {
              roomSockets[code] = new Map();
            }
            roomSockets[code].set(player.id, ws);

            // Generate authoritative board for the room's category and start immediately
            const board = createAuthoritativeBoard(matchedRoom.categoryId, 10, 7);
            matchedRoom.state = 'PLAYING';
            matchedRoom.startedAt = Date.now();
            matchedRoom.roundNumber = 1;
            matchedRoom.grid = board.grid;
            matchedRoom.gridSize = board.gridSize;
            matchedRoom.words = board.words;
            matchedRoom.wordPlacements = board.wordPlacements;

            broadcastToRoom(code, {
              type: 'ROOM_UPDATED',
              payload: { room: matchedRoom }
            });

            broadcastToRoom(code, {
              type: 'GAME_STARTED',
              payload: { room: matchedRoom }
            });

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
              gameMode: 'WORD_RACE',
              roundNumber: 1,
              stagesCount: Number(stagesCount) || 50,
              categoryId: preferredCat,
              levelNumber: 1,
              gridSize: 10,
              words: [],
              grid: [],
              wordPlacements: [],
              players: {
                [player.id]: {
                  ...player,
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
              chatMessages: []
            };

            if (!roomSockets[code]) {
              roomSockets[code] = new Map();
            }
            roomSockets[code].set(player.id, ws);

            ws.send(JSON.stringify({
              type: 'ROOM_CREATED',
              payload: { room: activeRooms[code], isQuickMatchWaiting: true }
            }));

            broadcastPublicRooms();
          }
          break;
        }

        case 'ADD_LIVE_RIVAL': {
          const { code } = payload;
          const room = activeRooms[code];
          if (!room || room.state !== 'WAITING') return;

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
            wordsFound: [],
            streak: 0,
            roundWins: 0,
            color: '#ec4899',
            isReady: true,
            connected: true,
            lastPing: Date.now()
          };

          const board = createAuthoritativeBoard(room.categoryId, 10, 7);
          room.state = 'PLAYING';
          room.startedAt = Date.now();
          room.roundNumber = 1;
          room.grid = board.grid;
          room.gridSize = board.gridSize;
          room.words = board.words;
          room.wordPlacements = board.wordPlacements;

          broadcastToRoom(code, {
            type: 'ROOM_UPDATED',
            payload: { room }
          });

          broadcastToRoom(code, {
            type: 'GAME_STARTED',
            payload: { room }
          });

          scheduleBotRivalLoop(code, botId);
          broadcastPublicRooms();
          break;
        }

        case 'ROOM_LEAVE': {
          const { code, playerId } = payload;
          const room = activeRooms[code];
          if (room && room.players[playerId]) {
            clearRoomBotTimers(code);
            delete room.players[playerId];
            roomSockets[code]?.delete(playerId);
            const humanPlayers = Object.values(room.players).filter(p => !p.id.startsWith('bot_rival_'));
            if (humanPlayers.length === 0) {
              delete activeRooms[code];
              delete roomSockets[code];
            } else {
              const remaining = humanPlayers[0];
              if (remaining) {
                room.hostId = remaining.id;
                remaining.isHost = true;
              }
              broadcastToRoom(code, {
                type: 'ROOM_UPDATED',
                payload: { room }
              });
            }
            broadcastPublicRooms();
          }
          boundRoomCode = null;
          broadcastPresenceUpdate();
          break;
        }

        case 'ROOM_JOIN': {
          const { code, player } = payload;
          if (player?.username) {
            registerSocketUsername(player.username);
          }
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

          const existingPlayerCount = Object.keys(room.players).length;
          if (existingPlayerCount >= 2 && !room.players[player.id]) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              payload: { message: 'الغرفة مكتملة (لاعبان كحد أقصى)' }
            }));
            return;
          }

          boundRoomCode = cleanCode;
          boundPlayerId = player.id;

          const existingHost = Object.values(room.players).find(p => p.id !== player.id);
          const finalDisplayName =
            existingHost && existingHost.displayName === player.displayName
              ? `${player.displayName} (2)`
              : player.displayName;

          const playerColor = player.id === room.hostId ? '#0ea5e9' : '#ec4899';
          room.players[player.id] = {
            ...player,
            displayName: finalDisplayName,
            isHost: player.id === room.hostId,
            score: room.players[player.id]?.score || 0,
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

          broadcastToRoom(cleanCode, {
            type: 'ROOM_UPDATED',
            payload: { room }
          });

          // If this is a Public Room and 2 players are now present, auto-start the Live Word Race!
          if (room.isPublic && Object.keys(room.players).length >= 2 && room.state === 'WAITING') {
            const board = createAuthoritativeBoard(room.categoryId, 10, 7);
            room.state = 'PLAYING';
            room.startedAt = Date.now();
            room.roundNumber = 1;
            room.grid = board.grid;
            room.gridSize = board.gridSize;
            room.words = board.words;
            room.wordPlacements = board.wordPlacements;

            broadcastToRoom(cleanCode, {
              type: 'GAME_STARTED',
              payload: { room }
            });
          }

          broadcastPublicRooms();
          broadcastPresenceUpdate();
          break;
        }

        case 'ROOM_START': {
          const { code, board: clientBoard } = payload;
          const room = activeRooms[code];
          if (!room) return;

          // Verify room has at least 2 players
          if (Object.keys(room.players).length < 2) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              payload: { message: 'يجب انتظار اللاعب الثاني لبدء المباراة' }
            }));
            return;
          }

          const board = clientBoard && clientBoard.grid?.length
            ? clientBoard
            : createAuthoritativeBoard(room.categoryId, 10, 7);

          room.state = 'PLAYING';
          room.startedAt = Date.now();
          room.roundNumber = room.roundNumber || 1;
          room.grid = board.grid;
          room.gridSize = board.gridSize;
          room.words = board.words || board.wordPlacements?.map((w: { word: string }) => w.word) || [];
          room.wordPlacements = board.wordPlacements;

          broadcastToRoom(code, {
            type: 'GAME_STARTED',
            payload: { room }
          });

          const botPlayer = Object.values(room.players).find(p => p.id.startsWith('bot_rival_'));
          if (botPlayer) {
            scheduleBotRivalLoop(code, botPlayer.id);
          }

          broadcastPublicRooms();
          broadcastPresenceUpdate();
          break;
        }

        case 'ROOM_REMATCH': {
          const { code, playerId } = payload;
          const room = activeRooms[code];
          if (!room) return;

          clearRoomBotTimers(code);

          // Keep the EXACT same categoryId without changing it, generate a fresh board immediately!
          const freshBoard = createAuthoritativeBoard(room.categoryId, 10, 7);
          room.roundNumber = (room.roundNumber || 1) + 1;
          room.state = 'PLAYING';
          room.startedAt = Date.now();
          room.winnerId = undefined;
          room.grid = freshBoard.grid;
          room.gridSize = freshBoard.gridSize;
          room.words = freshBoard.words;
          room.wordPlacements = freshBoard.wordPlacements;

          Object.values(room.players).forEach(p => {
            p.score = 0;
            p.wordsFound = [];
            p.streak = 0;
          });

          const initiatorName = room.players[playerId]?.displayName || 'المنافس';

          broadcastToRoom(code, {
            type: 'GAME_REMATCH_STARTED',
            payload: {
              room,
              initiatedBy: initiatorName,
              roundNumber: room.roundNumber
            }
          });

          const botPlayer = Object.values(room.players).find(p => p.id.startsWith('bot_rival_'));
          if (botPlayer) {
            scheduleBotRivalLoop(code, botPlayer.id);
          }
          break;
        }

        case 'CURSOR_DRAG': {
          const { code, playerId, cells } = payload;
          const room = activeRooms[code];
          if (!room || room.state !== 'PLAYING') return;

          const sender = room.players[playerId];
          broadcastToRoom(
            code,
            {
              type: 'OPPONENT_CURSOR',
              payload: {
                playerId,
                playerName: sender?.displayName || 'الخصم',
                playerColor: sender?.color || '#ec4899',
                cells: Array.isArray(cells) ? cells : []
              }
            },
            playerId
          );
          break;
        }

        case 'WORD_FOUND': {
          const { code, word, playerId } = payload;
          claimWordInRoom(code, word, playerId, ws);
          break;
        }

        case 'CHAT_MESSAGE': {
          const { code, sender, text } = payload;
          const room = activeRooms[code];
          if (!room) return;

          const chatItem = { sender, text, time: Date.now() };
          room.chatMessages.push(chatItem);

          broadcastToRoom(code, {
            type: 'CHAT_BROADCAST',
            payload: { chatItem }
          });
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

// Vite or Static handling
async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Fatteshha Game Server is live on http://0.0.0.0:${PORT}`);
  });
}

startServer();
