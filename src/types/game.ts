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
  | 'REVEAL_LETTER'   // 1. كشف حرف واحد (مرادف قياسي)
  | 'WORD_START'      // 2. إظهار مكان بداية الكلمة
  | 'WORD_LENGTH'     // 3. إظهار عدد الحروف
  | 'REMOVE_UNUSED'   // 4. إزالة الحروف غير المستخدمة
  | 'FULL_WORD'       // 5. كشف كلمة كاملة مقابل تكلفة أعلى
  | 'REVEAL_FULL_WORD'; // 5. كشف كلمة كاملة (مرادف قياسي)

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
  manualClaimed?: boolean;
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

export type OnlineGameModeId = 'WORD_RACE' | 'SPEED_REVEAL_20S';

export type OnlineDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface OnlineModeDefinition {
  id: OnlineGameModeId;
  name: string;
  shortName: string;
  description: string;
  coinPrice: number;
  icon: string;
  turnSeconds: number;
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
  authToken?: string;
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
  unlockedOnlineModes?: string[];
  isVip?: boolean;
  seasonXp?: number;
  claimedSeasonTiers?: number[];
  starterPackPurchased?: boolean;
  granted20kFreeCoins?: boolean;
  dailyChallenges?: DailyChallengesState;
  dailyStreak?: DailyStreakState;
  friends?: string[];
  blockedUsers?: string[];
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
  totalScore?: number;
  wordsFound: string[];
  streak?: number;
  roundWins?: number;
  color: string;
  isReady: boolean;
  connected: boolean;
  lastActive: number;
  lastPing?: number;
}

export interface OnlineRoomStandings {
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
}

export interface PublicRoomSummary {
  code: string;
  roomName?: string;
  hostName: string;
  hostUsername?: string;
  hostAvatar: string;
  categoryId: string;
  gameMode?: OnlineGameModeId;
  difficulty?: OnlineDifficulty;
  stagesCount?: number;
  maxPlayers?: number;
  playerCount: number;
  createdAt: number;
}

export interface ClaimedWordRecord {
  word: string;
  displayWord?: string;
  playerId: string;
  playerName: string;
  playerColor: string;
  claimedAt: number;
  wordScore: number;
  cells?: { row: number; col: number }[];
}

export interface OnlineRoom {
  code: string;
  roomName?: string;
  hostId: string;
  isPublic?: boolean;
  maxPlayers?: number;
  gameMode?: OnlineGameModeId;
  difficulty?: OnlineDifficulty;
  speedTurnSeconds?: number;
  playerDeadlines?: Record<string, number>;
  myRevealedCells?: { row: number; col: number; label?: string; word?: string }[];
  roundNumber?: number;
  stagesCount?: number;
  usedWords?: string[];
  seriesCompleted?: boolean;
  seriesWinnerId?: string | null;
  seriesWinnerName?: string;
  stageWinnerId?: string | null;
  stageWinnerName?: string;
  standings?: OnlineRoomStandings;
  categoryId: string;
  levelNumber: number;
  gridSize: number;
  words: string[];
  grid: string[][];
  wordPlacements: WordPlacement[];
  claimedWords?: Record<string, ClaimedWordRecord>;
  players: Record<string, OnlineRoomPlayer>;
  state: 'WAITING' | 'PLAYING' | 'FINISHED';
  startedAt?: number;
  createdAt?: number;
  winnerId?: string;
  chatMessages: { sender: string; text: string; time: number }[];
}

export type UnifiedDailyAttemptStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';

export interface UnifiedDailyTargetWord {
  word: string;
  displayWord: string;
  length: number;
  found: boolean;
  cells: { row: number; col: number }[]; // Empty array [] until discovered or challenge ends
  color: string;
  direction?: Direction;
}

export interface UnifiedDailyScoreBreakdown {
  wordsScore: number;
  speedBonus: number;
  completionBonus: number;
  noHintsBonus: number;
  totalScore: number;
  earnedCoins: number;
  earnedXP: number;
}

export interface UnifiedDailyAttemptClientState {
  dateKey: string;
  status: UnifiedDailyAttemptStatus;
  startedAt: number | null;
  completedAt: number | null;
  remainingSeconds: number;
  elapsedSeconds: number;
  wordsFound: string[];
  hintsUsedCount: number;
  wrongAttempts: number;
  revealedCells: { row: number; col: number }[];
  removedDistractorCells: { row: number; col: number }[];
  showWordLengths: boolean;
  scoreBreakdown: UnifiedDailyScoreBreakdown;
  rewardClaimed: boolean;
}

export interface UnifiedDailyLeaderboardEntry {
  rank: number;
  username: string;
  displayName: string;
  avatar: string;
  selectedTitle?: string;
  score: number;
  wordsFoundCount: number;
  elapsedSeconds: number;
  completed: boolean;
  daysParticipated?: number;
}

export interface UnifiedDailyStreakData {
  currentStreak: number;
  longestStreak: number;
  lastCompletedDate: string | null;
  completedDates: string[]; // YYYY-MM-DD in Asia/Kuwait
  milestonesClaimed: number[]; // e.g., [3, 7, 14, 30]
}

export interface SeasonalChallengeEvent {
  id: string;
  title: string;
  subtitle: string;
  themeColor: string;
  badgeText: string;
  bonusMultiplier: number;
  active: boolean;
  startsAtDate: string;
  endsAtDate: string;
  rewardTitle: string;
  rewardCoins: number;
}

export interface UnifiedDailyChallengePayload {
  dateKey: string; // YYYY-MM-DD in Asia/Kuwait
  weekKey: string; // YYYY-WXX in Asia/Kuwait
  timezone: 'Asia/Kuwait';
  title: string;
  categoryName: string;
  gridSize: number;
  totalWords: number;
  durationSeconds: number;
  nextResetSeconds: number;
  grid: string[][];
  targetWords: UnifiedDailyTargetWord[];
  attempt: UnifiedDailyAttemptClientState;
  dailyStreak: UnifiedDailyStreakData;
  dailyLeaderboard: UnifiedDailyLeaderboardEntry[];
  weeklyLeaderboard: UnifiedDailyLeaderboardEntry[];
  seasonalEvents: SeasonalChallengeEvent[];
}

export type GameMode = 'SOLO' | 'LOCAL_MULTI' | 'ONLINE_MULTI';

export type ReportReason =
  | 'اسم مسيء'
  | 'إساءة أو مضايقة'
  | 'غش أو تلاعب'
  | 'انتحال شخصية'
  | 'سلوك مخالف'
  | 'سبب آخر';

export type ReportStatus = 'PENDING' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';

export interface PlayerReport {
  id: string;
  reporterUsername: string;
  reporterDisplayName?: string;
  targetUsername: string;
  targetDisplayName: string;
  reason: ReportReason;
  details?: string;
  roomCode?: string;
  context?: 'ONLINE_GAME' | 'ONLINE_LOBBY' | 'WAITING_ROOM' | 'PUBLIC_ROOM' | 'PUBLIC_ROOMS' | 'FRIENDS' | 'OTHER';
  status: ReportStatus;
  actionNote?: string;
  reviewedBy?: string;
  reviewedAt?: number | string;
  createdAt: number | string;
}

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
  | 'DAILY_CHALLENGE'
  | 'ONLINE_LOBBY'
  | 'ONLINE_JOIN'
  | 'ONLINE_ROOM'
  | 'GAME_ONLINE'
  | 'RESULTS'
  | 'PROFILE'
  | 'STATS'
  | 'LEADERBOARD'
  | 'SETTINGS'
  | 'ADMIN_MODERATION';



