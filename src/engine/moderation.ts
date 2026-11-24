import { EMOTE_PACK_ITEMS } from './gameCategories.ts';
import type { ReportReason } from '../types/game.ts';

export const BASE_QUICK_REACTIONS: readonly string[] = [
  'صدتها قبلك! ⚡',
  'كفووو! 🔥',
  'يا وحش! 🦅',
  'شد حيلك! 💪',
  'ريماتش؟ 🔄'
];

export const ALLOWED_QUICK_REACTIONS: readonly string[] = [
  ...BASE_QUICK_REACTIONS,
  ...EMOTE_PACK_ITEMS.flatMap(pack => pack.emotes)
];

const ALLOWED_REACTION_SET = new Set<string>(ALLOWED_QUICK_REACTIONS);

export function isAllowedQuickReaction(text: unknown): text is string {
  if (typeof text !== 'string') return false;
  return ALLOWED_REACTION_SET.has(text.trim());
}

export const REPORT_REASONS: readonly ReportReason[] = [
  'اسم مسيء',
  'إساءة أو مضايقة',
  'غش أو تلاعب',
  'انتحال شخصية',
  'سلوك مخالف',
  'سبب آخر'
];

export function normalizeArabicForModeration(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .normalize('NFKC')
    .toLowerCase()
    // Remove diacritics (tashkeel) and tatweel
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    // Unify Arabic letter variants
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    // Replace punctuation/separators inside words with space for token matching
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collapseRepeatedChars(text: string): string {
  return text.replace(/([\p{L}])\1+/gu, '$1');
}

// Curated explicit offensive / abusive terms (whole-token normalized Arabic & Latin)
// Carefully audited to avoid false positives on Kuwaiti/Arabic names & game terms.
const BANNED_EXACT_TOKENS = new Set<string>(
  [
    // Arabic profanity & severe insults (normalized without diacritics/tatweel, أ->ا, ة->ه, ى->ي)
    'كلب',
    'ياكلب',
    'الكلب',
    'حمار',
    'الحمار',
    'يا حمار',
    'تافه',
    'التافه',
    'حقير',
    'الحقير',
    'سافل',
    'السافل',
    'قذر',
    'القذر',
    'وسخ',
    'الوسخ',
    'زباله',
    'الزباله',
    'نذل',
    'النذل',
    'خسيس',
    'الخسيس',
    'منحط',
    'المنحط',
    'غبي',
    'الغبي',
    'احمق',
    'الاحمق',
    'خنزير',
    'الخنزير',
    'لعنه',
    'يلعن',
    'ملعون',
    'شرموط',
    'شرموطه',
    'قحبه',
    'منيوك',
    'متناك',
    'نيك',
    'كس امك',
    'كسمك',
    'كساختك',
    'ابن الكلب',
    'ابن الحرام',
    'ولد الحرام',
    'عرص',
    'ديوث',
    'معرص',
    'زق',
    'خرا',
    'طيز',
    'طيزك',
    'مخنث',
    'لوطي',
    // English / transliterated explicit terms
    'fuck',
    'fucker',
    'fucking',
    'shit',
    'bitch',
    'asshole',
    'bastard',
    'dick',
    'pussy',
    'whore',
    'slut',
    'cunt',
    'motherfucker',
    'retard',
    'nigger',
    'faggot',
    'kosomak',
    'sharmota',
    'sharmouta',
    'gahba',
    'kalb',
    'ibnalkalb'
  ].map(t => normalizeArabicForModeration(t))
);

const BANNED_COLLAPSED_TOKENS = new Set<string>(
  Array.from(BANNED_EXACT_TOKENS).map(t => collapseRepeatedChars(t))
);

const BANNED_NO_SPACE_PHRASES: string[] = [
  'كسمك',
  'كسامك',
  'كساختك',
  'شرموطه',
  'شرموط',
  'منيوك',
  'ابنالكلب',
  'ابنالحرام',
  'fuck',
  'bitch',
  'asshole',
  'motherfucker',
  'sharmouta',
  'sharmota'
].map(t => collapseRepeatedChars(normalizeArabicForModeration(t)).replace(/\s+/g, ''));

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
}

export function checkTextModeration(rawText: unknown, fieldLabel = 'النص'): ModerationResult {
  if (typeof rawText !== 'string') {
    return { allowed: false, reason: `${fieldLabel} غير صالح` };
  }
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { allowed: false, reason: `يرجى إدخال ${fieldLabel}` };
  }

  const normalized = normalizeArabicForModeration(trimmed);
  if (!normalized) {
    return { allowed: true };
  }

  const tokens = normalized.split(' ').filter(Boolean);
  for (const tok of tokens) {
    const collapsed = collapseRepeatedChars(tok);
    if (BANNED_EXACT_TOKENS.has(tok) || BANNED_COLLAPSED_TOKENS.has(collapsed)) {
      return {
        allowed: false,
        reason: `يحتوي ${fieldLabel} على ألفاظ غير لائقة ومخالفة لسياسة الاحترام، يرجى اختيار اسم مناسب`
      };
    }
  }

  // Check multi-word exact matches & obfuscated letter-spaced phrases (e.g. "ك.ل.ب" or "ك ل ب")
  const noSpace = normalized.replace(/\s+/g, '');
  const collapsedNoSpace = collapseRepeatedChars(noSpace);
  if (BANNED_EXACT_TOKENS.has(noSpace) || BANNED_COLLAPSED_TOKENS.has(collapsedNoSpace)) {
    return {
      allowed: false,
      reason: `يحتوي ${fieldLabel} على ألفاظ غير لائقة ومخالفة لسياسة الاحترام، يرجى اختيار اسم مناسب`
    };
  }

  for (const phrase of BANNED_NO_SPACE_PHRASES) {
    if (phrase && (noSpace.includes(phrase) || collapsedNoSpace.includes(phrase))) {
      return {
        allowed: false,
        reason: `يحتوي ${fieldLabel} على ألفاظ غير لائقة ومخالفة لسياسة الاحترام، يرجى اختيار اسم مناسب`
      };
    }
  }

  // Detect spaced-out obfuscation where every token is a single character (e.g. "ف ا ك" or "ك ل ب")
  if (tokens.length >= 3 && tokens.every(t => t.length <= 2)) {
    const joined = collapseRepeatedChars(tokens.join(''));
    if (BANNED_COLLAPSED_TOKENS.has(joined)) {
      return {
        allowed: false,
        reason: `يحتوي ${fieldLabel} على ألفاظ غير لائقة ومخالفة لسياسة الاحترام، يرجى اختيار اسم مناسب`
      };
    }
  }

  return { allowed: true };
}
