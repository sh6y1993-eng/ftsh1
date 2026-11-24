import type {
  Direction,
  HintType,
  MysteryBoxReward,
  UnifiedDailyAttemptClientState,
  UnifiedDailyChallengePayload,
  UnifiedDailyLeaderboardEntry,
  UnifiedDailyScoreBreakdown,
  UnifiedDailyStreakData,
  UnifiedDailyTargetWord,
  WordPlacement
} from '../types/game.ts';
import {
  ACHIEVEMENTS,
  BATTLE_CARD_ITEMS,
  BOARD_THEME_ITEMS,
  COSMETIC_ITEMS,
  EMOTE_PACK_ITEMS,
  EXCLUSIVE_AVATARS,
  getLevelConfig,
  HINT_DEFINITIONS,
  MYSTERY_BOX_PRICE,
  NAME_GLOW_ITEMS,
  ONLINE_MODE_ITEMS,
  PLAYER_TITLES,
  POWER_UP_ITEMS,
  PREMIUM_PACK_ITEMS,
  rollMysteryBoxReward,
  SEASON_PASS_TIERS,
  STARTER_PACK_DEF,
  TRAIL_STYLE_ITEMS,
  VIP_PASS_PRICE
} from './gameCategories.ts';
import {
  calculateDailyChallengeScore,
  generateDeterministicDailyBoard,
  getKuwaitDateKey,
  getKuwaitOffsetDateKey,
  getKuwaitWeekKey,
  getSecondsUntilNextKuwaitMidnight,
  SEASONAL_CHALLENGE_EVENTS,
  UNIFIED_DAILY_DURATION_SECONDS,
  UNIFIED_DAILY_GRID_SIZE,
  UNIFIED_DAILY_WORD_COUNT
} from './dailyChallengeEngine.ts';
import { generateWordSearchGrid, getStringFromCells, normalizeArabicWord } from './wordSearch.ts';

export interface ActiveStageSession {
  sessionId: string;
  username: string;
  categoryId: string;
  levelNumber: number;
  gridSize: number;
  words: string[];
  grid: string[][];
  secretPlacements: WordPlacement[];
  wordsFound: string[];
  wrongAttempts: number;
  hintsUsed: number;
  startedAt: number;
  freezeBonusSeconds: number;
  timeExtendSeconds: number;
  doubleBoostActive: boolean;
  completed: boolean;
  completedAt?: number;
}

export interface ServerUnifiedDailyAttemptRecord {
  key: string; // `${dateKey}_${username}`
  dateKey: string;
  weekKey: string;
  username: string;
  displayName: string;
  avatar: string;
  selectedTitle?: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';
  startedAt: number | null;
  completedAt: number | null;
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

export const SERVER_MISSION_REWARDS: Record<string, { rewardCoins: number; rewardXP: number }> = {
  m_daily_login: { rewardCoins: 50, rewardXP: 50 },
  m_find_20_words: { rewardCoins: 120, rewardXP: 100 },
  m_complete_3_stages: { rewardCoins: 150, rewardXP: 140 },
  m_win_online_1: { rewardCoins: 200, rewardXP: 180 },
  m_no_hints_2: { rewardCoins: 160, rewardXP: 130 },
  dc_find_5_in_3m: { rewardCoins: 150, rewardXP: 120 },
  dc_speed_45s: { rewardCoins: 250, rewardXP: 200 },
  dc_no_hints: { rewardCoins: 175, rewardXP: 140 },
  dc_complete_2_levels: { rewardCoins: 180, rewardXP: 150 },
  dc_three_stars_1: { rewardCoins: 200, rewardXP: 160 },
  dc_accuracy_90: { rewardCoins: 160, rewardXP: 130 },
  dc_find_10_words: { rewardCoins: 220, rewardXP: 180 },
  dc_kuwait_stage: { rewardCoins: 165, rewardXP: 135 },
  dc_perfect_100: { rewardCoins: 230, rewardXP: 190 }
};

export const STREAK_MILESTONE_REWARDS: Record<number, { coins: number; xp: number; hints: number; title?: string }> = {
  3: { coins: 120, xp: 150, hints: 1 },
  7: { coins: 300, xp: 350, hints: 2, title: 'مواظب التحدي اليومي' },
  14: { coins: 600, xp: 700, hints: 4 },
  30: { coins: 1500, xp: 1800, hints: 8, title: 'أسطورة التحدي اليومي' }
};

/**
 * Sanitizes wordPlacements so unfound words have `cells: []` and `direction: undefined`.
 * Prevents inspecting word coordinates in DevTools/Network tab while keeping `word` and `displayWord`
 * available for `GameBoard.tsx` drag comparison and word list rendering.
 */
export function sanitizeWordPlacementsForClient(
  placements: WordPlacement[],
  foundWordsSet: Set<string>,
  revealAll = false
): WordPlacement[] {
  return placements.map(wp => {
    const isFound = revealAll || Boolean(wp.foundBy) || foundWordsSet.has(wp.word);
    return {
      word: wp.word,
      displayWord: wp.displayWord,
      cells: isFound ? wp.cells : [],
      direction: (isFound ? wp.direction : 'RIGHT_TO_LEFT') as Direction,
      color: wp.color,
      foundBy: wp.foundBy
    };
  });
}

/**
 * Verifies if a user-dragged cell path or word matches a secret WordPlacement on the server.
 */
export function verifyWordOnServerBoard(
  grid: string[][],
  secretPlacements: WordPlacement[],
  rawWord?: string,
  cells?: { row: number; col: number }[]
): WordPlacement | null {
  let candidateForward = '';
  let candidateReverse = '';

  if (Array.isArray(cells) && cells.length >= 2) {
    const extracted = getStringFromCells(grid, cells);
    candidateForward = normalizeArabicWord(extracted);
    candidateReverse = candidateForward.split('').reverse().join('');
  } else if (typeof rawWord === 'string' && rawWord.trim()) {
    candidateForward = normalizeArabicWord(rawWord);
    candidateReverse = candidateForward.split('').reverse().join('');
  }

  if (!candidateForward) return null;

  const matched = secretPlacements.find(p => {
    const pw = normalizeArabicWord(p.word);
    const pd = normalizeArabicWord(p.displayWord || p.word);
    return (
      p.word === candidateForward ||
      p.word === candidateReverse ||
      pw === candidateForward ||
      pw === candidateReverse ||
      pd === candidateForward ||
      pd === candidateReverse
    );
  });
  if (!matched) return null;

  // If cells were supplied, also verify the cell coordinates match the placement (or valid grid letters)
  if (Array.isArray(cells) && cells.length >= 2) {
    const extractedNorm = normalizeArabicWord(getStringFromCells(grid, cells));
    const extractedRev = extractedNorm.split('').reverse().join('');
    const matchedNorm = normalizeArabicWord(matched.word);
    if (extractedNorm !== matchedNorm && extractedRev !== matchedNorm) {
      return null;
    }
    return {
      ...matched,
      cells: cells.map(c => ({ row: Number(c.row), col: Number(c.col) }))
    };
  }

  return matched;
}

export function resolveServerHintDefinition(rawType?: string) {
  if (!rawType || typeof rawType !== 'string') return null;
  const trimmed = rawType.trim().toUpperCase();
  const canonicalId =
    trimmed === 'REVEAL_LETTER'
      ? 'SINGLE_LETTER'
      : trimmed === 'REVEAL_FULL_WORD'
      ? 'FULL_WORD'
      : trimmed;
  return HINT_DEFINITIONS.find(h => h.id === canonicalId) || null;
}

/**
 * Executes a server-validated hint against a secret set of WordPlacements.
 */
export function computeServerHintEffect(params: {
  hintType: HintType;
  gridSize: number;
  secretPlacements: WordPlacement[];
  alreadyFoundWords: string[];
  alreadyRevealedCells: { row: number; col: number }[];
}): {
  hintType: HintType;
  revealedCells: { row: number; col: number }[];
  removedDistractorCells: { row: number; col: number }[];
  showWordLengths: boolean;
  autoCompletedPlacement?: WordPlacement;
} {
  const { hintType, gridSize, secretPlacements, alreadyFoundWords, alreadyRevealedCells } = params;
  const foundSet = new Set(alreadyFoundWords);
  const unfoundPlacements = secretPlacements.filter(wp => !foundSet.has(wp.word));
  const revealedSet = new Set(alreadyRevealedCells.map(c => `${c.row},${c.col}`));

  if (unfoundPlacements.length === 0) {
    return {
      hintType,
      revealedCells: alreadyRevealedCells,
      removedDistractorCells: [],
      showWordLengths: false
    };
  }

  switch (hintType) {
    case 'SINGLE_LETTER':
    case 'REVEAL_LETTER': {
      const target = unfoundPlacements[0];
      const unrevealedCell =
        target.cells.find(c => !revealedSet.has(`${c.row},${c.col}`)) || target.cells[0];
      const nextRevealed = unrevealedCell
        ? [...alreadyRevealedCells, unrevealedCell]
        : alreadyRevealedCells;
      return {
        hintType,
        revealedCells: nextRevealed,
        removedDistractorCells: [],
        showWordLengths: false
      };
    }

    case 'WORD_START': {
      const target =
        unfoundPlacements.find(wp => wp.cells[0] && !revealedSet.has(`${wp.cells[0].row},${wp.cells[0].col}`)) ||
        unfoundPlacements[0];
      const startCell = target.cells[0];
      const nextRevealed = startCell
        ? [...alreadyRevealedCells, startCell]
        : alreadyRevealedCells;
      return {
        hintType,
        revealedCells: nextRevealed,
        removedDistractorCells: [],
        showWordLengths: false
      };
    }

    case 'WORD_LENGTH': {
      return {
        hintType,
        revealedCells: alreadyRevealedCells,
        removedDistractorCells: [],
        showWordLengths: true
      };
    }

    case 'REMOVE_UNUSED': {
      const usedSet = new Set<string>();
      unfoundPlacements.forEach(wp => {
        wp.cells.forEach(c => usedSet.add(`${c.row},${c.col}`));
      });
      secretPlacements
        .filter(wp => foundSet.has(wp.word))
        .forEach(wp => {
          wp.cells.forEach(c => usedSet.add(`${c.row},${c.col}`));
        });

      const distractors: { row: number; col: number }[] = [];
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          if (!usedSet.has(`${r},${c}`)) {
            distractors.push({ row: r, col: c });
          }
        }
      }
      // Remove up to 18 distractor cells
      const selectedDistractors = distractors.slice(0, 18);
      return {
        hintType,
        revealedCells: alreadyRevealedCells,
        removedDistractorCells: selectedDistractors,
        showWordLengths: false
      };
    }

    case 'FULL_WORD':
    case 'REVEAL_FULL_WORD': {
      const target = unfoundPlacements[0];
      return {
        hintType,
        revealedCells: alreadyRevealedCells,
        removedDistractorCells: [],
        showWordLengths: false,
        autoCompletedPlacement: target
      };
    }
  }
}

/**
 * Evaluates and grants achievements on a server user record.
 */
export function evaluateServerUserAchievements(user: Record<string, any>): {
  newlyUnlocked: typeof ACHIEVEMENTS;
  bonusCoins: number;
  bonusXP: number;
} {
  const completedEntries = Object.values(user.completedLevels || {}) as {
    stars: number;
    bestTime: number;
    score: number;
    accuracy?: number;
  }[];
  const completedStagesCount = completedEntries.length;
  const totalWords =
    typeof user.totalWordsFound === 'number' && user.totalWordsFound > 0
      ? user.totalWordsFound
      : completedStagesCount * 6;
  const fastUnder45 = completedEntries.filter(e => e.bestTime > 0 && e.bestTime <= 45).length;
  const fastUnder30 = completedEntries.filter(e => e.bestTime > 0 && e.bestTime <= 30).length;
  const fastUnder60 = Math.max(
    user.fastStagesCount || 0,
    completedEntries.filter(e => e.bestTime > 0 && e.bestTime < 60).length
  );
  const perfectCount = Math.max(
    user.perfectStagesCount || 0,
    completedEntries.filter(e => (e.accuracy ?? 100) >= 100).length
  );
  const totalWins = completedStagesCount + (user.multiplayerWins || 0);
  const streakDays = Math.max(
    user.dailyStreak?.currentStreak || 1,
    user.dailyStreak?.longestStreak || 1
  );

  const currentAchievements = new Set<string>(user.achievements || []);
  const currentTitles = new Set<string>(user.unlockedTitles || ['مستكشف الحروف']);
  const currentCosmetics = new Set<string>(user.unlockedCosmetics || []);

  let bonusXP = 0;
  let bonusCoins = 0;
  const newlyUnlocked: typeof ACHIEVEMENTS = [];

  for (const ach of ACHIEVEMENTS) {
    if (currentAchievements.has(ach.id)) continue;

    let progress = 0;
    if (ach.id === 'exp_100' || ach.id === 'exp_500' || ach.id === 'exp_1000') {
      progress = totalWords;
    } else if (ach.id === 'spd_record_45') {
      progress = fastUnder45;
    } else if (ach.id === 'spd_record_30') {
      progress = fastUnder30;
    } else if (ach.id === 'spd_fast_10') {
      progress = fastUnder60;
    } else if (ach.id === 'acc_perfect_1' || ach.id === 'acc_perfect_5' || ach.id === 'acc_perfect_15') {
      progress = perfectCount;
    } else if (ach.id === 'chl_wins_10' || ach.id === 'chl_wins_50' || ach.id === 'chl_wins_100') {
      progress = totalWins;
    } else if (ach.id === 'con_days_7' || ach.id === 'con_days_30' || ach.id === 'con_days_100') {
      progress = streakDays;
    }

    if (progress >= ach.target) {
      currentAchievements.add(ach.id);
      bonusXP += ach.xpReward;
      bonusCoins += ach.coinReward;
      if (ach.titleReward) currentTitles.add(ach.titleReward);
      if (ach.cosmeticReward) currentCosmetics.add(ach.cosmeticReward);
      newlyUnlocked.push(ach);
    }
  }

  user.xp = (user.xp || 0) + bonusXP;
  user.coins = (user.coins || 0) + bonusCoins;
  user.level = Math.floor(user.xp / 300) + 1;
  user.totalWordsFound = totalWords;
  user.fastStagesCount = fastUnder60;
  user.perfectStagesCount = perfectCount;
  user.completedLevelsCount = completedStagesCount;
  user.achievements = Array.from(currentAchievements);
  user.unlockedTitles = Array.from(currentTitles);
  user.selectedTitle = user.selectedTitle || user.unlockedTitles[user.unlockedTitles.length - 1] || 'مستكشف الحروف';
  user.unlockedCosmetics = Array.from(currentCosmetics);

  return { newlyUnlocked, bonusCoins, bonusXP };
}

/**
 * Processes all store purchases and reward claims authoritatively on the server.
 */
export function executeServerStoreAction(
  user: Record<string, any>,
  action: string,
  payload: Record<string, any>,
  todayDateKey: string
): {
  ok: boolean;
  status: number;
  error?: string;
  message?: string;
  mysteryReward?: MysteryBoxReward;
  coinsDelta?: number;
} {
  user.powerUps = user.powerUps || { FREEZE_TIME: 1, DOUBLE_BOOST: 1, STREAK_SHIELD: 0, TIME_EXTEND: 1 };
  user.battleCards = user.battleCards || {
    CARD_FREEZE_OPPONENT: 2,
    CARD_SANDSTORM: 1,
    CARD_BLIND_WORDS: 1,
    CARD_STEAL_POINTS: 1,
    CARD_SHIELD: 2
  };
  user.unlockedBoardThemes = user.unlockedBoardThemes || ['theme_kuwait_neon'];
  user.equippedBoardTheme = user.equippedBoardTheme || 'theme_kuwait_neon';
  user.unlockedTrails = user.unlockedTrails || ['trail_amber'];
  user.equippedTrail = user.equippedTrail || 'trail_amber';
  user.unlockedNameGlows = user.unlockedNameGlows || ['glow_none'];
  user.equippedNameGlow = user.equippedNameGlow || 'glow_none';
  user.unlockedEmotePacks = user.unlockedEmotePacks || [];
  user.unlockedCategories = user.unlockedCategories || [];
  user.unlockedAvatars = user.unlockedAvatars || [];
  user.unlockedOnlineModes = Array.from(new Set([...(user.unlockedOnlineModes || []), 'SPEED_REVEAL_20S']));
  user.unlockedTitles = user.unlockedTitles || ['مستكشف الحروف'];
  user.unlockedCosmetics = user.unlockedCosmetics || [];
  user.claimedSeasonTiers = user.claimedSeasonTiers || [];

  switch (action) {
    case 'BUY_STARTER_PACK': {
      if (user.starterPackPurchased) {
        return { ok: false, status: 400, error: 'تم شراء حزمة البداية السريعة مسبقاً (متاحة مرة واحدة فقط)' };
      }
      if (user.coins < STARTER_PACK_DEF.coinPrice) {
        return { ok: false, status: 400, error: 'رصيد العملات غير كافٍ لشراء حزمة البداية' };
      }
      user.coins = user.coins - STARTER_PACK_DEF.coinPrice + STARTER_PACK_DEF.rewardsCoins;
      user.hintsRemaining = (user.hintsRemaining || 0) + STARTER_PACK_DEF.rewardsHints;
      user.powerUps.FREEZE_TIME = (user.powerUps.FREEZE_TIME || 0) + 2;
      user.powerUps.DOUBLE_BOOST = (user.powerUps.DOUBLE_BOOST || 0) + 2;
      user.battleCards.CARD_FREEZE_OPPONENT = (user.battleCards.CARD_FREEZE_OPPONENT || 0) + 2;
      user.battleCards.CARD_SHIELD = (user.battleCards.CARD_SHIELD || 0) + 2;
      user.starterPackPurchased = true;
      return { ok: true, status: 200, message: 'تم تفعيل حزمة البداية السريعة بنجاح!' };
    }

    case 'OPEN_MYSTERY_BOX': {
      if (user.coins < MYSTERY_BOX_PRICE) {
        return { ok: false, status: 400, error: 'رصيد العملات غير كافٍ لفتح صندوق المفاجآت' };
      }
      user.coins -= MYSTERY_BOX_PRICE;
      const reward = rollMysteryBoxReward();
      if (reward.kind === 'COINS') {
        user.coins += reward.amount;
      } else if (reward.kind === 'HINTS') {
        user.hintsRemaining = (user.hintsRemaining || 0) + reward.amount;
      } else if (reward.kind === 'BATTLE_CARD' && reward.id) {
        user.battleCards[reward.id] = (user.battleCards[reward.id] || 0) + reward.amount;
      } else if (reward.kind === 'POWER_UP' && reward.id) {
        user.powerUps[reward.id] = (user.powerUps[reward.id] || 0) + reward.amount;
      } else if (reward.kind === 'BOARD_THEME' && reward.id) {
        if (!user.unlockedBoardThemes.includes(reward.id)) {
          user.unlockedBoardThemes.push(reward.id);
        }
      }
      return { ok: true, status: 200, mysteryReward: reward, message: `حصلت على: ${reward.label}` };
    }

    case 'BUY_VIP_PASS': {
      if (user.isVip) {
        return { ok: false, status: 400, error: 'عضوية VIP مفعّلة لديك بالفعل' };
      }
      if (user.coins < VIP_PASS_PRICE) {
        return { ok: false, status: 400, error: 'رصيد العملات غير كافٍ لتفعيل عضوية VIP' };
      }
      user.coins -= VIP_PASS_PRICE;
      user.isVip = true;
      user.hintsRemaining = (user.hintsRemaining || 0) + 5;
      user.battleCards.CARD_SHIELD = (user.battleCards.CARD_SHIELD || 0) + 2;
      return { ok: true, status: 200, message: 'تم تفعيل بطاقة موسم فتّشها VIP الملكية!' };
    }

    case 'CLAIM_SEASON_TIER': {
      const tierNum = Number(payload?.tier);
      const tierDef = SEASON_PASS_TIERS.find(t => t.tier === tierNum);
      if (!tierDef) {
        return { ok: false, status: 404, error: 'مستوى الموسم غير موجود' };
      }
      if (user.claimedSeasonTiers.includes(tierNum)) {
        return { ok: false, status: 409, error: 'تم استلام مكافأة هذا المستوى مسبقاً' };
      }
      const currentSeasonXp = Math.max(user.seasonXp || 0, user.xp || 0);
      if (currentSeasonXp < tierDef.requiredSeasonXp) {
        return { ok: false, status: 400, error: 'نقاط خبرة الموسم غير كافية لفتح هذا المستوى' };
      }
      user.claimedSeasonTiers.push(tierNum);
      if (tierDef.freeCoins) user.coins += tierDef.freeCoins;
      if (tierDef.freeHints) user.hintsRemaining = (user.hintsRemaining || 0) + tierDef.freeHints;
      if (user.isVip) {
        if (tierDef.vipCoins) user.coins += tierDef.vipCoins;
        if (tierDef.vipBattleCard) {
          user.battleCards[tierDef.vipBattleCard] = (user.battleCards[tierDef.vipBattleCard] || 0) + 1;
        }
        if (tierDef.vipPowerUp) {
          user.powerUps[tierDef.vipPowerUp] = (user.powerUps[tierDef.vipPowerUp] || 0) + 1;
        }
      }
      return { ok: true, status: 200, message: `تم استلام جوائز المستوى ${tierNum} بنجاح!` };
    }

    case 'CLAIM_DAILY_PACK': {
      user.dailyStreak = user.dailyStreak || {};
      if (user.dailyStreak.lastDailyClaimDate === todayDateKey) {
        return { ok: false, status: 409, error: 'تم استلام المكافأة اليومية المجانية اليوم مسبقاً' };
      }
      user.dailyStreak.lastDailyClaimDate = todayDateKey;
      user.coins += 60;
      user.hintsRemaining = (user.hintsRemaining || 0) + 1;
      return { ok: true, status: 200, message: 'تم استلام الهدية اليومية (+60 عملة + تلميح)!' };
    }

    case 'CLAIM_WEEKLY_PACK': {
      user.dailyStreak = user.dailyStreak || {};
      const lastWeekly = user.dailyStreak.lastWeeklyClaimDate;
      if (lastWeekly) {
        const diffMs = new Date(todayDateKey).getTime() - new Date(lastWeekly).getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays < 7) {
          return { ok: false, status: 409, error: 'تم استلام الصندوق الأسبوعي هذا الأسبوع مسبقاً' };
        }
      }
      user.dailyStreak.lastWeeklyClaimDate = todayDateKey;
      user.coins += 250;
      user.hintsRemaining = (user.hintsRemaining || 0) + 3;
      return { ok: true, status: 200, message: 'تم استلام الصندوق الأسبوعي (+250 عملة + 3 تلميحات)!' };
    }

    case 'BUY_POWER_UP': {
      const item = POWER_UP_ITEMS.find(p => p.id === payload?.itemId);
      if (!item) return { ok: false, status: 404, error: 'المعزز غير موجود' };
      if (user.coins < item.coinPrice) {
        return { ok: false, status: 400, error: 'رصيد العملات غير كافٍ لشراء هذا المعزز' };
      }
      user.coins -= item.coinPrice;
      user.powerUps[item.id] = (user.powerUps[item.id] || 0) + 1;
      return { ok: true, status: 200, message: `تم شراء ${item.name}!` };
    }

    case 'BUY_BATTLE_CARD': {
      const card = BATTLE_CARD_ITEMS.find(c => c.id === payload?.itemId);
      if (!card) return { ok: false, status: 404, error: 'الكرت غير موجود' };
      user.battleCards[card.id] = (user.battleCards[card.id] || 0) + 1;
      return { ok: true, status: 200, message: `الكرت «${card.name}» مجاني ومفتوح للجميع داخل الأونلاين!` };
    }

    case 'BUY_BATTLE_CARD_BUNDLE': {
      user.battleCards.CARD_FREEZE_OPPONENT = (user.battleCards.CARD_FREEZE_OPPONENT || 0) + 1;
      user.battleCards.CARD_SANDSTORM = (user.battleCards.CARD_SANDSTORM || 0) + 1;
      user.battleCards.CARD_SHIELD = (user.battleCards.CARD_SHIELD || 0) + 1;
      return { ok: true, status: 200, message: 'جميع كروت الأونلاين مفتوحة ومجانية للجميع!' };
    }

    case 'BUY_ONLINE_MODE': {
      const modeDef = ONLINE_MODE_ITEMS.find(m => m.id === payload?.modeId);
      if (!modeDef) return { ok: false, status: 404, error: 'نمط اللعب غير موجود' };
      if (!user.unlockedOnlineModes.includes(modeDef.id)) {
        user.unlockedOnlineModes.push(modeDef.id);
      }
      return { ok: true, status: 200, message: `«${modeDef.name}» مفتوح مجاناً للجميع!` };
    }

    case 'BUY_OR_EQUIP_BOARD_THEME': {
      const theme = BOARD_THEME_ITEMS.find(t => t.id === payload?.itemId);
      if (!theme) return { ok: false, status: 404, error: 'المظهر غير موجود' };
      if (!user.unlockedBoardThemes.includes(theme.id)) {
        if (user.coins < theme.coinPrice) {
          return { ok: false, status: 400, error: 'رصيد العملات غير كافٍ لشراء هذه الطاولة' };
        }
        user.coins -= theme.coinPrice;
        user.unlockedBoardThemes.push(theme.id);
      }
      user.equippedBoardTheme = theme.id;
      return { ok: true, status: 200, message: `تم تفعيل ${theme.name}!` };
    }

    case 'BUY_OR_EQUIP_TRAIL': {
      const trail = TRAIL_STYLE_ITEMS.find(t => t.id === payload?.itemId);
      if (!trail) return { ok: false, status: 404, error: 'تأثير السحب غير موجود' };
      if (!user.unlockedTrails.includes(trail.id)) {
        if (user.coins < trail.coinPrice) {
          return { ok: false, status: 400, error: 'رصيد العملات غير كافٍ لشراء تأثير السحب' };
        }
        user.coins -= trail.coinPrice;
        user.unlockedTrails.push(trail.id);
      }
      user.equippedTrail = trail.id;
      return { ok: true, status: 200, message: `تم تفعيل ${trail.name}!` };
    }

    case 'BUY_OR_EQUIP_NAME_GLOW': {
      const glow = NAME_GLOW_ITEMS.find(g => g.id === payload?.itemId);
      if (!glow) return { ok: false, status: 404, error: 'توهج الاسم غير موجود' };
      if (!user.unlockedNameGlows.includes(glow.id)) {
        if (user.coins < glow.coinPrice) {
          return { ok: false, status: 400, error: 'رصيد العملات غير كافٍ لشراء توهج الاسم' };
        }
        user.coins -= glow.coinPrice;
        user.unlockedNameGlows.push(glow.id);
      }
      user.equippedNameGlow = glow.id;
      return { ok: true, status: 200, message: `تم تفعيل ${glow.name}!` };
    }

    case 'BUY_OR_EQUIP_AVATAR': {
      const av = EXCLUSIVE_AVATARS.find(a => a.id === payload?.itemId);
      if (!av) return { ok: false, status: 404, error: 'الصورة الرمزية غير موجودة' };
      if (!user.unlockedAvatars.includes(av.id)) {
        if (user.coins < av.coinPrice) {
          return { ok: false, status: 400, error: 'رصيد العملات غير كافٍ لشراء هذه الشخصية' };
        }
        user.coins -= av.coinPrice;
        user.unlockedAvatars.push(av.id);
      }
      user.avatar = av.url;
      return { ok: true, status: 200, message: `تم اختيار ${av.name}!` };
    }

    case 'BUY_EMOTE_PACK': {
      const pack = EMOTE_PACK_ITEMS.find(e => e.id === payload?.itemId);
      if (!pack) return { ok: false, status: 404, error: 'حزمة التعبيرات غير موجودة' };
      if (user.unlockedEmotePacks.includes(pack.id)) {
        return { ok: false, status: 409, error: 'تم شراء حزمة التعبيرات هذه مسبقاً' };
      }
      if (user.coins < pack.coinPrice) {
        return { ok: false, status: 400, error: 'رصيد العملات غير كافٍ لشراء حزمة التعبيرات' };
      }
      user.coins -= pack.coinPrice;
      user.unlockedEmotePacks.push(pack.id);
      return { ok: true, status: 200, message: `تم فتح ${pack.name}!` };
    }

    case 'BUY_PREMIUM_CATEGORY': {
      const pack = PREMIUM_PACK_ITEMS.find(p => p.id === payload?.itemId || p.categoryId === payload?.itemId);
      if (!pack) return { ok: false, status: 404, error: 'التصنيف الحصري غير موجود' };
      if (user.unlockedCategories.includes(pack.categoryId)) {
        return { ok: false, status: 409, error: 'هذا التصنيف مفتوح لديك بالفعل' };
      }
      if (user.coins < pack.coinPrice) {
        return { ok: false, status: 400, error: 'رصيد العملات غير كافٍ لفتح هذا التصنيف' };
      }
      user.coins -= pack.coinPrice;
      user.unlockedCategories.push(pack.categoryId);
      return { ok: true, status: 200, message: `تم فتح ${pack.name}!` };
    }

    case 'BUY_OR_EQUIP_COSMETIC': {
      const cos = COSMETIC_ITEMS.find(c => c.id === payload?.itemId || c.name === payload?.itemId);
      if (!cos) return { ok: false, status: 404, error: 'الإطار غير موجود' };
      if (!user.unlockedCosmetics.includes(cos.name)) {
        if (user.coins < cos.coinPrice) {
          return { ok: false, status: 400, error: 'رصيد العملات غير كافٍ لشراء هذا الإطار' };
        }
        user.coins -= cos.coinPrice;
        user.unlockedCosmetics.push(cos.name);
      }
      user.selectedCosmetic = cos.name;
      return { ok: true, status: 200, message: `تم تفعيل ${cos.name}!` };
    }

    case 'BUY_OR_EQUIP_TITLE': {
      const titleObj = PLAYER_TITLES.find(t => t.id === payload?.itemId || t.name === payload?.itemId);
      if (!titleObj) return { ok: false, status: 404, error: 'اللقب غير موجود' };
      if (!user.unlockedTitles.includes(titleObj.name)) {
        const price = titleObj.coinPrice || 0;
        if (user.coins < price) {
          return { ok: false, status: 400, error: 'رصيد العملات غير كافٍ لشراء هذا اللقب' };
        }
        user.coins -= price;
        user.unlockedTitles.push(titleObj.name);
      }
      user.selectedTitle = titleObj.name;
      return { ok: true, status: 200, message: `تم تفعيل لقب «${titleObj.name}»!` };
    }

    default:
      return { ok: false, status: 400, error: 'عملية متجر غير معروفة' };
  }
}

/**
 * Ensures the Unified Daily Challenge state, attempts, and leaderboards are up-to-date in `db`.
 */
export function buildUnifiedDailyPayloadForUser(
  db: Record<string, any>,
  username: string,
  overrideNowMs: number = Date.now()
): UnifiedDailyChallengePayload {
  const dateKey = getKuwaitDateKey(overrideNowMs);
  const weekKey = getKuwaitWeekKey(dateKey);
  const board = generateDeterministicDailyBoard(dateKey);

  if (!db.unifiedDailyAttempts) {
    db.unifiedDailyAttempts = {};
  }
  if (!db.unifiedDailyStreaks) {
    db.unifiedDailyStreaks = {};
  }

  const activeSeason = SEASONAL_CHALLENGE_EVENTS.find(s => s.active);
  const seasonalMultiplier = activeSeason ? activeSeason.bonusMultiplier : 1;

  // Purge any legacy synthetic/seeded bot entries so leaderboards only contain real player attempts
  const legacySeedUsernames = new Set(['fahad_q8', 'dana_q8', 'jasem_q8', 'sara_kwt']);
  const legacySeedElapsed = new Set([42, 54, 63, 90]);
  for (const [k, rec] of Object.entries(db.unifiedDailyAttempts) as [string, ServerUnifiedDailyAttemptRecord][]) {
    if (
      rec &&
      legacySeedUsernames.has(rec.username) &&
      legacySeedElapsed.has(rec.elapsedSeconds) &&
      !(rec as any).isGenuineAttempt
    ) {
      delete db.unifiedDailyAttempts[k];
    }
  }

  // Ensure user's Unified Daily Streak record exists
  const cleanUser = username.trim().toLowerCase();
  if (!db.unifiedDailyStreaks[cleanUser]) {
    const yesterdayKey = getKuwaitOffsetDateKey(-1, overrideNowMs);
    db.unifiedDailyStreaks[cleanUser] = {
      currentStreak: 0,
      longestStreak: 0,
      lastCompletedDate: null,
      completedDates: [],
      milestonesClaimed: []
    } satisfies UnifiedDailyStreakData;
    // If user already completed yesterday, preserve streak continuity
    const yAttempt = db.unifiedDailyAttempts[`${yesterdayKey}_${cleanUser}`];
    if (yAttempt && yAttempt.status === 'COMPLETED') {
      db.unifiedDailyStreaks[cleanUser].currentStreak = 1;
      db.unifiedDailyStreaks[cleanUser].longestStreak = 1;
      db.unifiedDailyStreaks[cleanUser].lastCompletedDate = yesterdayKey;
      db.unifiedDailyStreaks[cleanUser].completedDates = [yesterdayKey];
    }
  }

  const streakData: UnifiedDailyStreakData = db.unifiedDailyStreaks[cleanUser];
  const attemptKey = `${dateKey}_${cleanUser}`;
  let attempt: ServerUnifiedDailyAttemptRecord | undefined = db.unifiedDailyAttempts[attemptKey];

  let remainingSeconds = UNIFIED_DAILY_DURATION_SECONDS;
  if (attempt) {
    if (attempt.status === 'IN_PROGRESS' && attempt.startedAt) {
      const elapsedNow = Math.max(0, Math.floor((overrideNowMs - attempt.startedAt) / 1000));
      remainingSeconds = Math.max(0, UNIFIED_DAILY_DURATION_SECONDS - elapsedNow);
      attempt.elapsedSeconds = Math.min(UNIFIED_DAILY_DURATION_SECONDS, elapsedNow);

      // If time expired while disconnected, finalize the attempt automatically on the server!
      if (remainingSeconds <= 0) {
        attempt.status = attempt.wordsFound.length >= UNIFIED_DAILY_WORD_COUNT ? 'COMPLETED' : 'EXPIRED';
        attempt.completedAt = attempt.startedAt + UNIFIED_DAILY_DURATION_SECONDS * 1000;
        attempt.elapsedSeconds = UNIFIED_DAILY_DURATION_SECONDS;
        attempt.scoreBreakdown = calculateDailyChallengeScore({
          wordsFoundCount: attempt.wordsFound.length,
          totalWords: UNIFIED_DAILY_WORD_COUNT,
          remainingSeconds: 0,
          hintsUsedCount: attempt.hintsUsedCount,
          seasonalMultiplier
        });
      } else {
        attempt.scoreBreakdown = calculateDailyChallengeScore({
          wordsFoundCount: attempt.wordsFound.length,
          totalWords: UNIFIED_DAILY_WORD_COUNT,
          remainingSeconds,
          hintsUsedCount: attempt.hintsUsedCount,
          seasonalMultiplier
        });
      }
    } else if (attempt.status === 'COMPLETED' || attempt.status === 'EXPIRED') {
      remainingSeconds = Math.max(0, UNIFIED_DAILY_DURATION_SECONDS - (attempt.elapsedSeconds || 0));
    }
  }

  const clientAttempt: UnifiedDailyAttemptClientState = attempt
    ? {
        dateKey: attempt.dateKey,
        status: attempt.status,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
        remainingSeconds,
        elapsedSeconds: attempt.elapsedSeconds,
        wordsFound: attempt.wordsFound,
        hintsUsedCount: attempt.hintsUsedCount,
        wrongAttempts: attempt.wrongAttempts,
        revealedCells: attempt.revealedCells || [],
        removedDistractorCells: attempt.removedDistractorCells || [],
        showWordLengths: Boolean(attempt.showWordLengths),
        scoreBreakdown: attempt.scoreBreakdown,
        rewardClaimed: attempt.rewardClaimed
      }
    : {
        dateKey,
        status: 'NOT_STARTED',
        startedAt: null,
        completedAt: null,
        remainingSeconds: UNIFIED_DAILY_DURATION_SECONDS,
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
        rewardClaimed: false
      };

  const foundSet = new Set(clientAttempt.wordsFound);
  const isFinished = clientAttempt.status === 'COMPLETED' || clientAttempt.status === 'EXPIRED';

  // Hide coordinates of unfound words until the word is found or the challenge has ended!
  const targetWords: UnifiedDailyTargetWord[] = board.wordPlacements.map(wp => {
    const isWordFound = foundSet.has(wp.word);
    const canRevealCells = isWordFound || isFinished;
    return {
      word: wp.word,
      displayWord: wp.displayWord,
      length: wp.word.length,
      found: isWordFound,
      cells: canRevealCells ? wp.cells : [],
      color: wp.color,
      direction: canRevealCells ? wp.direction : undefined
    };
  });

  // Build Daily Leaderboard (for `dateKey`)
  const allAttempts = Object.values(db.unifiedDailyAttempts) as ServerUnifiedDailyAttemptRecord[];
  const todayAttempts = allAttempts.filter(
    a => a.dateKey === dateKey && (a.status === 'COMPLETED' || a.status === 'EXPIRED' || a.wordsFound.length > 0)
  );
  todayAttempts.sort(
    (a, b) =>
      b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore ||
      b.wordsFound.length - a.wordsFound.length ||
      a.elapsedSeconds - b.elapsedSeconds
  );

  const dailyLeaderboard: UnifiedDailyLeaderboardEntry[] = todayAttempts.slice(0, 25).map((a, idx) => ({
    rank: idx + 1,
    username: a.username,
    displayName: a.displayName,
    avatar: a.avatar,
    selectedTitle: a.selectedTitle,
    score: a.scoreBreakdown.totalScore,
    wordsFoundCount: a.wordsFound.length,
    elapsedSeconds: a.elapsedSeconds,
    completed: a.status === 'COMPLETED'
  }));

  // Build Weekly Leaderboard (aggregated across `weekKey`)
  const weekAttempts = allAttempts.filter(
    a => a.weekKey === weekKey && (a.status === 'COMPLETED' || a.status === 'EXPIRED' || a.wordsFound.length > 0)
  );
  const weeklyMap = new Map<
    string,
    {
      username: string;
      displayName: string;
      avatar: string;
      selectedTitle?: string;
      score: number;
      wordsFoundCount: number;
      elapsedSeconds: number;
      completedCount: number;
      daysParticipated: number;
    }
  >();

  for (const a of weekAttempts) {
    const prev = weeklyMap.get(a.username);
    if (!prev) {
      weeklyMap.set(a.username, {
        username: a.username,
        displayName: a.displayName,
        avatar: a.avatar,
        selectedTitle: a.selectedTitle,
        score: a.scoreBreakdown.totalScore,
        wordsFoundCount: a.wordsFound.length,
        elapsedSeconds: a.elapsedSeconds,
        completedCount: a.status === 'COMPLETED' ? 1 : 0,
        daysParticipated: 1
      });
    } else {
      prev.score += a.scoreBreakdown.totalScore;
      prev.wordsFoundCount += a.wordsFound.length;
      prev.elapsedSeconds += a.elapsedSeconds;
      prev.completedCount += a.status === 'COMPLETED' ? 1 : 0;
      prev.daysParticipated += 1;
    }
  }

  const weeklyLeaderboard: UnifiedDailyLeaderboardEntry[] = Array.from(weeklyMap.values())
    .sort((a, b) => b.score - a.score || b.wordsFoundCount - a.wordsFoundCount || a.elapsedSeconds - b.elapsedSeconds)
    .slice(0, 25)
    .map((entry, idx) => ({
      rank: idx + 1,
      username: entry.username,
      displayName: entry.displayName,
      avatar: entry.avatar,
      selectedTitle: entry.selectedTitle,
      score: entry.score,
      wordsFoundCount: entry.wordsFoundCount,
      elapsedSeconds: entry.elapsedSeconds,
      completed: entry.completedCount > 0,
      daysParticipated: entry.daysParticipated
    }));

  return {
    dateKey,
    weekKey,
    timezone: 'Asia/Kuwait',
    title: board.title,
    categoryName: board.categoryName,
    gridSize: UNIFIED_DAILY_GRID_SIZE,
    totalWords: UNIFIED_DAILY_WORD_COUNT,
    durationSeconds: UNIFIED_DAILY_DURATION_SECONDS,
    nextResetSeconds: getSecondsUntilNextKuwaitMidnight(overrideNowMs),
    grid: board.grid,
    targetWords,
    attempt: clientAttempt,
    dailyStreak: streakData,
    dailyLeaderboard,
    weeklyLeaderboard,
    seasonalEvents: SEASONAL_CHALLENGE_EVENTS
  };
}
