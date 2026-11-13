export type Direction = 
  | 'RIGHT_TO_LEFT' // natural Arabic horizontal
  | 'LEFT_TO_RIGHT'
  | 'TOP_TO_BOTTOM'
  | 'BOTTOM_TO_TOP'
  | 'DIAG_DOWN_LEFT'
  | 'DIAG_DOWN_RIGHT'
  | 'DIAG_UP_LEFT'
  | 'DIAG_UP_RIGHT';

export interface GridCell {
  row: number;
  col: number;
  letter: string;
}

export interface WordPlacement {
  word: string;
  displayWord: string; // Original word with proper Arabic presentation
  cells: { row: number; col: number }[];
  direction: Direction;
  color: string;
  foundBy?: string; // Player ID who found it
}

export interface Category {
  id: string;
  name: string;
  englishName: string;
  icon: string;
  description: string;
  accentColor: string;
  totalLevels: number;
}

export interface LevelInfo {
  levelNumber: number;
  title: string;
  gridSize: number;
  wordCount: number;
  words: string[];
  unlocked: boolean;
  completed: boolean;
  stars: number;
  bestTime?: number;
  bestScore?: number;
}

export type DailyChallengeType =
  | 'FIND_WORDS_IN_TIME'
  | 'COMPLETE_LEVELS'
  | 'EARN_THREE_STARS'
  | 'HIGH_ACCURACY'
  | 'FIND_TOTAL_WORDS'
  | 'NO_HINTS_STAGE'
  | 'CATEGORY_KUWAIT'
  | 'SPEED_45S'
  | 'PERFECT_ACCURACY';

export interface DailyChallengeTask {
  id: string;
  type: DailyChallengeType;
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

export interface DailyChallengesState {
  dateKey: string; // YYYY-MM-DD
  tasks: DailyChallengeTask[];
}

export interface DailyStreakState {
  currentStreak: number;
  longestStreak: number;
  lastCompletedDate: string | null; // YYYY-MM-DD when at least 1 level was completed
  lastLoginDate: string; // YYYY-MM-DD
  completedToday: boolean;
  todayBonusCoins: number;
  nextBonusCoins: number;
  streakHistory: string[]; // Recent YYYY-MM-DD dates completed
}

export type FriendOnlineStatus = 'ONLINE' | 'IN_ROOM' | 'IN_GAME' | 'OFFLINE';

export interface FriendProfileSummary {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  level: number;
  xp: number;
  multiplayerWins: number;
  onlineStatus: FriendOnlineStatus;
  activeRoomCode?: string;
  activeRoomName?: string;
  lastSeenAt?: number;
}

export interface RoomInviteNotification {
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

export interface PlayerProfile {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  level: number;
  xp: number;
  coins: number;
  hintsRemaining: number;
  completedLevelsCount: number;
  completedLevels?: Record<string, { stars: number; bestTime: number; score: number; accuracy?: number; completedAt?: string }>;
  dailyChallenges?: DailyChallengesState;
  dailyStreak?: DailyStreakState;
  friends?: string[];
  totalScore: number;
  multiplayerWins: number;
  multiplayerLosses: number;
  achievements: string[];
  createdAt: string;
}

export interface LocalPlayer {
  id: string;
  name: string;
  color: string;
  score: number;
  wordsFound: string[];
}

export interface OnlineRoomPlayer {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  isHost: boolean;
  score: number;
  wordsFound: string[];
  streak?: number;
  roundWins?: number;
  color: string;
  isReady: boolean;
  connected: boolean;
  lastActive: number;
  lastPing?: number;
}

export interface PublicRoomSummary {
  code: string;
  roomName?: string;
  hostName: string;
  hostAvatar: string;
  categoryId: string;
  stagesCount?: number;
  playerCount: number;
  createdAt: number;
}

export interface OnlineRoom {
  code: string;
  roomName?: string;
  hostId: string;
  isPublic?: boolean;
  gameMode?: 'WORD_RACE';
  roundNumber?: number;
  stagesCount?: number;
  categoryId: string;
  levelNumber: number;
  gridSize: number;
  words: string[];
  grid: string[][];
  wordPlacements: WordPlacement[];
  players: Record<string, OnlineRoomPlayer>;
  state: 'WAITING' | 'PLAYING' | 'FINISHED';
  startedAt?: number;
  createdAt?: number;
  winnerId?: string;
  chatMessages: { sender: string; text: string; time: number }[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  xpReward: number;
}

export type GameMode = 'SOLO' | 'LOCAL_MULTI' | 'ONLINE_MULTI';

export type ScreenState = 
  | 'SPLASH'
  | 'AUTH'
  | 'PROFILES'
  | 'HOME'
  | 'MODE_SELECT'
  | 'CATEGORIES'
  | 'LEVELS'
  | 'GAME_SOLO'
  | 'GAME_LOCAL'
  | 'ONLINE_LOBBY'
  | 'ONLINE_JOIN'
  | 'ONLINE_ROOM'
  | 'GAME_ONLINE'
  | 'RESULTS'
  | 'PROFILE'
  | 'STATS'
  | 'LEADERBOARD'
  | 'SETTINGS';
