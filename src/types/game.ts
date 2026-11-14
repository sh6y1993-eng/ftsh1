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

export type HintType =
  | 'SINGLE_LETTER'   // 1. كشف حرف واحد
  | 'WORD_START'      // 2. إظهار مكان بداية الكلمة
  | 'WORD_LENGTH'     // 3. إظهار عدد الحروف
  | 'REMOVE_UNUSED'   // 4. إزالة الحروف غير المستخدمة
  | 'FULL_WORD';      // 5. كشف كلمة كاملة مقابل تكلفة أعلى

export interface HintDefinition {
  id: HintType;
  name: string;
  description: string;
  hintCost: number;
  coinCost: number;
  badge: string;
}

export type AchievementCategory =
  | 'EXPLORATION'  // الاستكشاف: اكتشف 100 و500 و1000 كلمة
  | 'SPEED'        // السرعة: أنهِ مرحلة خلال وقت قياسي
  | 'ACCURACY'     // الدقة: أنهِ مراحل دون أخطاء
  | 'CHALLENGE'    // التحدي: افُز في 10 و50 و100 مباراة
  | 'CONSISTENCY'; // الاستمرارية: العب 7 و30 و100 يوم

export interface Achievement {
  id: string;
  category: AchievementCategory;
  categoryLabel: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  xpReward: number;
  coinReward: number;
  titleReward?: string;     // لقب يمنحه الوسام للاعب
  cosmeticReward?: string;  // مظهر تجميلي / إطار يمنحه الوسام للاعب
}

export interface PlayerTitleItem {
  id: string;
  name: string;
  description: string;
  unlockRequirement: string;
  coinPrice?: number;
  badgeColor: string;
}

export interface CosmeticItem {
  id: string;
  name: string;
  type: 'AVATAR_FRAME' | 'BOARD_THEME';
  description: string;
  previewGradient: string;
  borderColor: string;
  coinPrice: number;
  unlockAchievementId?: string;
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
  lastDailyClaimDate?: string;
  lastWeeklyClaimDate?: string;
}

export type FriendOnlineStatus = 'ONLINE' | 'IN_ROOM' | 'IN_GAME' | 'OFFLINE';

export interface FriendProfileSummary {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  level: number;
  xp: number;
  totalScore?: number;
  totalWordsFound?: number;
  completedLevelsCount?: number;
  multiplayerWins: number;
  multiplayerLosses?: number;
  selectedTitle?: string;
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

export type PowerUpId =
  | 'FREEZE_TIME'    // تجميد الوقت 30 ثانية
  | 'DOUBLE_BOOST'   // مضاعف العملات والخبرة 2x
  | 'STREAK_SHIELD'  // درع السلسلة اليومية
  | 'TIME_EXTEND';   // تذكرة تمديد الوقت +60ث

export type BattleCardId =
  | 'CARD_FREEZE_OPPONENT' // تجميد لوحة الخصم 15 ثانية
  | 'CARD_SANDSTORM'       // عاصفة رملية تشوش حروف الخصم 15 ثانية
  | 'CARD_BLIND_WORDS'     // إخفاء قائمة الكلمات عن الخصم 15 ثانية
  | 'CARD_STEAL_POINTS'    // سرقة 100 نقطة من الخصم فوراً
  | 'CARD_SHIELD';         // درع حماية يصد الكرت الهجومي القادم

export type BoardThemeId =
  | 'theme_kuwait_neon'
  | 'theme_mubarakiyah'
  | 'theme_sadu'
  | 'theme_royal_gold';

export type TrailStyleId =
  | 'trail_amber'
  | 'trail_laser'
  | 'trail_kuwait'
  | 'trail_gold';

export type NameGlowId =
  | 'glow_none'
  | 'glow_gold'
  | 'glow_emerald'
  | 'glow_rainbow';

export interface PowerUpDefinition {
  id: PowerUpId;
  name: string;
  description: string;
  icon: string;
  coinPrice: number;
  badgeColor: string;
}

export interface BattleCardDefinition {
  id: BattleCardId;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  coinPrice: number;
  kind: 'ATTACK' | 'DEFENSE';
  durationSec?: number;
  accentColor: string;
}

export interface BoardThemeDefinition {
  id: BoardThemeId;
  name: string;
  description: string;
  coinPrice: number;
  boardBackground: string;
  boardBorder: string;
  boardShadow: string;
  cellBackground: string;
  cellBorder: string;
  previewGradient: string;
}

export interface TrailStyleDefinition {
  id: TrailStyleId;
  name: string;
  description: string;
  coinPrice: number;
  selectedBackground: string;
  selectedBorder: string;
  selectedShadow: string;
  selectedTextClass: string;
  previewGradient: string;
}

export interface ExclusiveAvatarItem {
  id: string;
  name: string;
  description: string;
  url: string;
  coinPrice: number;
  badge: string;
}

export interface NameGlowItem {
  id: NameGlowId;
  name: string;
  description: string;
  coinPrice: number;
  previewClass: string;
}

export interface EmotePackDefinition {
  id: string;
  name: string;
  description: string;
  coinPrice: number;
  emotes: string[];
}

export interface PremiumPackDefinition {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  coinPrice: number;
  icon: string;
  accentColor: string;
}

export interface SeasonPassTier {
  tier: number;
  requiredSeasonXp: number;
  freeRewardLabel: string;
  vipRewardLabel: string;
  freeCoins?: number;
  freeHints?: number;
  vipCoins?: number;
  vipBattleCard?: BattleCardId;
  vipPowerUp?: PowerUpId;
}

export interface MysteryBoxReward {
  kind: 'COINS' | 'HINTS' | 'BATTLE_CARD' | 'POWER_UP' | 'BOARD_THEME';
  id?: string;
  amount: number;
  label: string;
  rarity: 'شائع' | 'نادر' | 'أسطوري 👑';
}

export interface PlayerProfile {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  avatar: string;
  level: number;
  xp: number;
  coins: number; // عملات فتّشها
  hintsRemaining: number;
  completedLevelsCount: number;
  completedLevels?: Record<string, { stars: number; bestTime: number; score: number; accuracy?: number; completedAt?: string }>;
  totalWordsFound?: number;     // عدد الكلمات المكتشفة
  perfectStagesCount?: number;  // عدد المراحل المنجزة بدون أخطاء (دقة 100%)
  fastStagesCount?: number;     // عدد المراحل المنجزة في وقت قياسي
  selectedTitle?: string;       // اللقب الفعال للاعب (مثل: بطل الكويت، أسطورة فتّشها)
  unlockedTitles?: string[];    // الألقاب المفتوحة
  selectedCosmetic?: string;    // المظهر التجميلي / الإطار الفعال
  unlockedCosmetics?: string[]; // المظاهر التجميلية المفتوحة
  // New comprehensive Store, Power-Ups & Online Battle Card Inventory
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
  isVip?: boolean;
  seasonXp?: number;
  claimedSeasonTiers?: number[];
  starterPackPurchased?: boolean;
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
