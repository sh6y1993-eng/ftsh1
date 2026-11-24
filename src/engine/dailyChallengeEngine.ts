import type { Direction, SeasonalChallengeEvent, UnifiedDailyScoreBreakdown, WordPlacement } from '../types/game.ts';
import { CATEGORY_WORD_POOLS } from './gameCategories.ts';
import { generateWordSearchGrid, normalizeArabicWord, WORD_COLORS } from './wordSearch.ts';

export const KUWAIT_TIMEZONE = 'Asia/Kuwait';
export const UNIFIED_DAILY_WORD_COUNT = 8;
export const UNIFIED_DAILY_DURATION_SECONDS = 90;
export const UNIFIED_DAILY_GRID_SIZE = 10;

/**
 * Returns YYYY-MM-DD in Asia/Kuwait timezone (UTC+3).
 */
export function getKuwaitDateKey(nowMs: number = Date.now()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: KUWAIT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(new Date(nowMs));
    const y = parts.find(p => p.type === 'year')?.value || '2026';
    const m = parts.find(p => p.type === 'month')?.value || '01';
    const d = parts.find(p => p.type === 'day')?.value || '01';
    return `${y}-${m}-${d}`;
  } catch {
    const kwtTime = new Date(nowMs + 3 * 3600 * 1000);
    return kwtTime.toISOString().slice(0, 10);
  }
}

/**
 * Returns YYYY-MM-DD in Asia/Kuwait offset by `daysOffset` days.
 */
export function getKuwaitOffsetDateKey(daysOffset: number, baseNowMs: number = Date.now()): string {
  const todayKey = getKuwaitDateKey(baseNowMs);
  const [y, m, d] = todayKey.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d + daysOffset, 12, 0, 0));
  return utcDate.toISOString().slice(0, 10);
}

/**
 * Returns ISO week key in Asia/Kuwait (e.g., "2026-W46").
 */
export function getKuwaitWeekKey(dateKey: string = getKuwaitDateKey()): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Returns remaining seconds until midnight (00:00:00) in Asia/Kuwait (UTC+3).
 */
export function getSecondsUntilNextKuwaitMidnight(nowMs: number = Date.now()): number {
  const kwtOffsetMs = 3 * 3600 * 1000;
  const kwtNow = new Date(nowMs + kwtOffsetMs);
  const nextMidnightKwt = Date.UTC(
    kwtNow.getUTCFullYear(),
    kwtNow.getUTCMonth(),
    kwtNow.getUTCDate() + 1,
    0,
    0,
    0
  );
  const diffMs = nextMidnightKwt - (nowMs + kwtOffsetMs);
  return Math.max(1, Math.floor(diffMs / 1000));
}

/**
 * Deterministic 32-bit PRNG (Mulberry32) seeded from dateKey string.
 */
function createSeededRandom(seedStr: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GeneratedUnifiedDailyBoard {
  dateKey: string;
  title: string;
  categoryName: string;
  gridSize: number;
  words: string[];
  grid: string[][];
  wordPlacements: WordPlacement[];
}

const DAILY_THEMES: { categoryId: string; categoryName: string; titlePrefix: string }[] = [
  { categoryId: 'kuwait_heritage', categoryName: 'تراث ومعالم الكويت', titlePrefix: 'تحدي الديرة اليومي' },
  { categoryId: 'kuwait_proverbs', categoryName: 'أمثال وسوالف كويتية', titlePrefix: 'تحدي الديوانية اليومي' },
  { categoryId: 'food_cuisine', categoryName: 'المائدة الكويتية', titlePrefix: 'تحدي النكهات اليومي' },
  { categoryId: 'geography_world', categoryName: 'جغرافيا وعواصم', titlePrefix: 'تحدي المعرفة اليومي' },
  { categoryId: 'science_space', categoryName: 'علوم وفضاء', titlePrefix: 'تحدي المستكشف اليومي' },
  { categoryId: 'sports_championships', categoryName: 'الرياضة والبطولات', titlePrefix: 'تحدي الأبطال اليومي' },
  { categoryId: 'animals_nature', categoryName: 'الطبيعة والصقور', titlePrefix: 'تحدي البراري اليومي' }
];

/**
 * Generates a 100% deterministic daily challenge board for the given `dateKey`
 * using the existing `generateWordSearchGrid` engine without modifying it.
 */
export function generateDeterministicDailyBoard(dateKey: string): GeneratedUnifiedDailyBoard {
  const rng = createSeededRandom(`FATTESHHA_DAILY_${dateKey}_KWT`);
  const themeIdx = Math.floor(rng() * DAILY_THEMES.length);
  const theme = DAILY_THEMES[themeIdx] || DAILY_THEMES[0];
  const poolObj = CATEGORY_WORD_POOLS[theme.categoryId] || CATEGORY_WORD_POOLS.kuwait_heritage;

  const eligibleWords = poolObj.pool.filter(w => {
    const norm = normalizeArabicWord(w);
    return norm.length >= 3 && norm.length <= 7;
  });

  const shuffledPool = [...eligibleWords];
  for (let i = shuffledPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledPool[i], shuffledPool[j]] = [shuffledPool[j], shuffledPool[i]];
  }

  const selectedWords: string[] = [];
  const usedNorm = new Set<string>();
  for (const w of shuffledPool) {
    const norm = normalizeArabicWord(w);
    if (!usedNorm.has(norm)) {
      usedNorm.add(norm);
      selectedWords.push(w);
      if (selectedWords.length === UNIFIED_DAILY_WORD_COUNT) break;
    }
  }

  // Temporarily seed Math.random during synchronous grid generation so the board is 100% identical
  // even across server restarts on the same day, while still using `generateWordSearchGrid`!
  const originalRandom = Math.random;
  let generated;
  try {
    Math.random = rng;
    generated = generateWordSearchGrid(selectedWords, UNIFIED_DAILY_GRID_SIZE);
  } finally {
    Math.random = originalRandom;
  }

  return {
    dateKey,
    title: `${theme.titlePrefix} (${dateKey})`,
    categoryName: theme.categoryName,
    gridSize: UNIFIED_DAILY_GRID_SIZE,
    words: selectedWords,
    grid: generated.grid,
    wordPlacements: generated.wordPlacements.map((wp, idx) => ({
      word: wp.word,
      displayWord: wp.displayWord,
      cells: wp.cells,
      direction: wp.direction as Direction,
      color: wp.color || WORD_COLORS[idx % WORD_COLORS.length]
    }))
  };
}

/**
 * Authoritative score calculation for the Unified Daily Challenge:
 * - Each discovered word: 125 pts (8 words = 1000 pts base)
 * - Speed bonus: remainingSeconds * 12 pts (if completed all 8 words) or remainingSeconds * 3 pts
 * - Completion bonus: +300 pts for finding all 8 words within 90s
 * - No-hints bonus: +200 pts if completed with 0 hints, -60 pts penalty per hint used
 */
export function calculateDailyChallengeScore(params: {
  wordsFoundCount: number;
  totalWords: number;
  remainingSeconds: number;
  hintsUsedCount: number;
  seasonalMultiplier?: number;
}): UnifiedDailyScoreBreakdown {
  const {
    wordsFoundCount,
    totalWords,
    remainingSeconds,
    hintsUsedCount,
    seasonalMultiplier = 1
  } = params;

  const completedAll = wordsFoundCount >= totalWords;
  const clampedRemaining = Math.max(0, Math.min(UNIFIED_DAILY_DURATION_SECONDS, Math.floor(remainingSeconds)));

  const wordsScore = wordsFoundCount * 125;
  const speedBonus = completedAll ? clampedRemaining * 12 : 0;
  const completionBonus = completedAll ? 300 : 0;
  const noHintsBonus = completedAll && hintsUsedCount === 0
    ? 200
    : -Math.min(wordsScore, hintsUsedCount * 60);

  const rawTotal = Math.max(0, wordsScore + speedBonus + completionBonus + noHintsBonus);
  const totalScore = Math.round(rawTotal * seasonalMultiplier);

  const baseCoins = wordsFoundCount * 15 + (completedAll ? 80 : 0) + (completedAll && hintsUsedCount === 0 ? 40 : 0);
  const baseXP = wordsFoundCount * 25 + (completedAll ? 120 : 0) + Math.floor(clampedRemaining * 1.5);

  return {
    wordsScore,
    speedBonus,
    completionBonus,
    noHintsBonus,
    totalScore,
    earnedCoins: Math.round(baseCoins * seasonalMultiplier),
    earnedXP: Math.round(baseXP * seasonalMultiplier)
  };
}

/**
 * Seasonal Challenge Events architecture (Phase 4 ready).
 */
export const SEASONAL_CHALLENGE_EVENTS: SeasonalChallengeEvent[] = [
  {
    id: 'season_kuwait_national_days',
    title: 'موسم هلا فبراير وأعياد الكويت 🇰🇼',
    subtitle: 'مكافآت مضاعفة (+25%) في التحدي اليومي وألقاب وطنية حصرية',
    themeColor: '#0ea5e9',
    badgeText: 'موسم نشط 🔥',
    bonusMultiplier: 1.25,
    active: true,
    startsAtDate: '2026-01-01',
    endsAtDate: '2027-12-31',
    rewardTitle: 'بطل موسم الكويت',
    rewardCoins: 500
  },
  {
    id: 'season_ramadan_nights',
    title: 'تحدي ليالي الغبقة الرمضانية 🌙',
    subtitle: 'شبكات كلمات تراثية رمضانية وجوائز عملات ذهبية يومية',
    themeColor: '#f59e0b',
    badgeText: 'موسم قادم ⏳',
    bonusMultiplier: 1.5,
    active: false,
    startsAtDate: '2027-02-01',
    endsAtDate: '2027-03-15',
    rewardTitle: 'نجم الغبقة الذهبي',
    rewardCoins: 750
  },
  {
    id: 'season_summer_diwaniya',
    title: 'بطولة صيف الدواوين الكبرى ☀️',
    subtitle: 'منافسات سرعة قصوى على لوحة الصدارة الأسبوعية',
    themeColor: '#10b981',
    badgeText: 'موسم قادم ⏳',
    bonusMultiplier: 1.3,
    active: false,
    startsAtDate: '2027-06-01',
    endsAtDate: '2027-08-31',
    rewardTitle: 'أسطورة الصيف',
    rewardCoins: 600
  }
];

/**
 * Builds the current month's calendar days in Asia/Kuwait for the Streak Calendar UI.
 */
export function getKuwaitMonthDays(dateKey: string, completedDates: string[]): {
  dateKey: string;
  dayNumber: number;
  isToday: boolean;
  isCompleted: boolean;
  isFuture: boolean;
}[] {
  const [y, m, todayDay] = dateKey.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const completedSet = new Set(completedDates);
  const result = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dk = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    result.push({
      dateKey: dk,
      dayNumber: day,
      isToday: day === todayDay,
      isCompleted: completedSet.has(dk),
      isFuture: day > todayDay
    });
  }
  return result;
}
