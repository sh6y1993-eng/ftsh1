import React, { useState } from 'react';
import {
  PlayerProfile,
  MysteryBoxReward,
  ScreenState
} from '../types/game';
import {
  POWER_UP_ITEMS,
  BATTLE_CARD_ITEMS,
  BOARD_THEME_ITEMS,
  TRAIL_STYLE_ITEMS,
  EXCLUSIVE_AVATARS,
  NAME_GLOW_ITEMS,
  EMOTE_PACK_ITEMS,
  PREMIUM_PACK_ITEMS,
  SEASON_PASS_TIERS,
  STARTER_PACK_DEF,
  VIP_PASS_PRICE,
  MYSTERY_BOX_PRICE,
  PLAYER_TITLES,
  COSMETIC_ITEMS,
  rollMysteryBoxReward
} from '../engine/gameCategories';
import {
  X,
  Coins,
  Lightbulb,
  ShoppingBag,
  Sparkles,
  Crown,
  Gift,
  Swords,
  Zap,
  Palette,
  Check,
  Package,
  BarChart3
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { saveUserToLocalMap, syncProfileWithSupabase } from '../services/supabaseClient';

type StoreTab = 'OFFERS' | 'CARDS' | 'POWERUPS' | 'COSMETICS';

interface StoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: PlayerProfile | null;
  onUpdateUser?: (user: PlayerProfile) => void;
  onNavigate?: (screen: ScreenState) => void;
  initialTab?: StoreTab;
}

export const StoreModal: React.FC<StoreModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateUser,
  onNavigate,
  initialTab = 'OFFERS'
}) => {
  const [activeTab, setActiveTab] = useState<StoreTab>(initialTab);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [mysteryOpening, setMysteryOpening] = useState(false);
  const [mysteryResult, setMysteryResult] = useState<MysteryBoxReward | null>(null);

  if (!isOpen) return null;

  const coins = user?.coins ?? 0;
  const hints = user?.hintsRemaining ?? 0;
  const seasonXp = user?.seasonXp ?? user?.xp ?? 0;

  const showFeedback = (text: string, ok: boolean) => {
    setNotice({ text, ok });
    setTimeout(() => {
      setNotice(prev => (prev?.text === text ? null : prev));
    }, 4000);
  };

  const commitProfileUpdate = (next: PlayerProfile, message: string) => {
    sounds.playVictory();
    const saved = saveUserToLocalMap(next);
    onUpdateUser?.(saved);
    syncProfileWithSupabase(saved);
    showFeedback(message, true);
  };

  const requireCoins = (price: number): boolean => {
    if (!user) {
      sounds.playError();
      showFeedback('يرجى تسجيل الدخول أولاً للشراء من المتجر!', false);
      return false;
    }
    if ((user.coins || 0) < price) {
      sounds.playError();
      showFeedback(`رصيد عملات فتّشها غير كافٍ! تحتاج ${price} عملة (رصيدك: ${user.coins || 0}) 🪙`, false);
      return false;
    }
    return true;
  };

  // 1. Starter Pack
  const handleBuyStarterPack = () => {
    if (!user || user.starterPackPurchased) return;
    if (!requireCoins(STARTER_PACK_DEF.coinPrice)) return;

    const nextPowerUps = { ...(user.powerUps || {}) };
    Object.entries(STARTER_PACK_DEF.rewardsPowerUps).forEach(([k, v]) => {
      nextPowerUps[k] = (nextPowerUps[k] || 0) + v;
    });

    const nextCards = { ...(user.battleCards || {}) };
    Object.entries(STARTER_PACK_DEF.rewardsBattleCards).forEach(([k, v]) => {
      nextCards[k] = (nextCards[k] || 0) + v;
    });

    commitProfileUpdate(
      {
        ...user,
        coins: (user.coins || 0) - STARTER_PACK_DEF.coinPrice + STARTER_PACK_DEF.rewardsCoins,
        hintsRemaining: (user.hintsRemaining || 0) + STARTER_PACK_DEF.rewardsHints,
        powerUps: nextPowerUps,
        battleCards: nextCards,
        starterPackPurchased: true
      },
      '🎉 مبروك! تم فتح حزمة البداية السريعة وإضافة العملات والتلميحات وكروت الأونلاين لحسابك!'
    );
  };

  // 2. Mystery Box
  const handleOpenMysteryBox = () => {
    if (!requireCoins(MYSTERY_BOX_PRICE) || !user) return;
    sounds.playTap();
    setMysteryOpening(true);
    setMysteryResult(null);

    setTimeout(() => {
      const reward = rollMysteryBoxReward();
      let updated: PlayerProfile = {
        ...user,
        coins: (user.coins || 0) - MYSTERY_BOX_PRICE
      };

      if (reward.kind === 'COINS') {
        updated.coins += reward.amount;
      } else if (reward.kind === 'HINTS') {
        updated.hintsRemaining = (updated.hintsRemaining || 0) + reward.amount;
      } else if (reward.kind === 'BATTLE_CARD' && reward.id) {
        const cards = { ...(updated.battleCards || {}) };
        cards[reward.id] = (cards[reward.id] || 0) + reward.amount;
        updated.battleCards = cards;
      } else if (reward.kind === 'POWER_UP' && reward.id) {
        const pus = { ...(updated.powerUps || {}) };
        pus[reward.id] = (pus[reward.id] || 0) + reward.amount;
        updated.powerUps = pus;
      } else if (reward.kind === 'BOARD_THEME' && reward.id) {
        const unlocked = Array.from(new Set([...(updated.unlockedBoardThemes || ['theme_kuwait_neon']), reward.id]));
        updated.unlockedBoardThemes = unlocked;
        updated.equippedBoardTheme = reward.id;
      }

      setMysteryOpening(false);
      setMysteryResult(reward);
      commitProfileUpdate(updated, `🎁 طلع لك من صندوق الحظ (${reward.rarity}): ${reward.label}!`);
    }, 600);
  };

  // 3. VIP Pass
  const handleBuyVipPass = () => {
    if (!user || user.isVip) return;
    if (!requireCoins(VIP_PASS_PRICE)) return;
    commitProfileUpdate(
      {
        ...user,
        coins: (user.coins || 0) - VIP_PASS_PRICE,
        isVip: true
      },
      '👑 تم تفعيل تذكرة «فتّشها بلس VIP»! صارت مكافآتك اليومية مضاعفة ومزايا الموسم مفتوحة!'
    );
  };

  // 4. Claim Season Tier
  const handleClaimSeasonTier = (tierNum: number) => {
    if (!user) return;
    const tier = SEASON_PASS_TIERS.find(t => t.tier === tierNum);
    if (!tier || seasonXp < tier.requiredSeasonXp) return;
    if ((user.claimedSeasonTiers || []).includes(tierNum)) return;

    let addCoins = tier.freeCoins || 0;
    const addHints = tier.freeHints || 0;
    const nextCards = { ...(user.battleCards || {}) };
    const nextPowerUps = { ...(user.powerUps || {}) };

    if (user.isVip) {
      addCoins += tier.vipCoins || 0;
      if (tier.vipBattleCard) {
        nextCards[tier.vipBattleCard] = (nextCards[tier.vipBattleCard] || 0) + 1;
      }
      if (tier.vipPowerUp) {
        nextPowerUps[tier.vipPowerUp] = (nextPowerUps[tier.vipPowerUp] || 0) + 1;
      }
    }

    commitProfileUpdate(
      {
        ...user,
        coins: (user.coins || 0) + addCoins,
        hintsRemaining: (user.hintsRemaining || 0) + addHints,
        battleCards: nextCards,
        powerUps: nextPowerUps,
        claimedSeasonTiers: [...(user.claimedSeasonTiers || []), tierNum]
      },
      `🏆 تم استلام جوائز المستوى ${tierNum} من تذكرة الموسم!`
    );
  };

  // 5. Daily & Weekly Free Rewards (Doubled for VIP!)
  const handleClaimRewardPack = (type: 'DAILY' | 'WEEKLY') => {
    if (!user) return;
    const todayKey = new Date().toISOString().slice(0, 10);
    const weekKey = `${new Date().getFullYear()}_W${Math.ceil(new Date().getDate() / 7)}`;
    const storageKey = `fatteshha_reward_${type}_${user.username}`;
    const lastClaim = localStorage.getItem(storageKey);

    if (type === 'DAILY' && lastClaim === todayKey) {
      sounds.playError();
      showFeedback('لقد استلمت المكافأة اليومية اليوم بالفعل! عد غداً 🎁', false);
      return;
    }
    if (type === 'WEEKLY' && lastClaim === weekKey) {
      sounds.playError();
      showFeedback('لقد استلمت المكافأة الأسبوعية هذا الأسبوع بالفعل! 🎉', false);
      return;
    }

    const mult = user.isVip ? 2 : 1;
    const addCoins = (type === 'DAILY' ? 120 : 450) * mult;
    const addHints = (type === 'DAILY' ? 2 : 6) * mult;
    const addXP = type === 'DAILY' ? 80 : 250;

    localStorage.setItem(storageKey, type === 'DAILY' ? todayKey : weekKey);
    const nextXP = (user.xp || 0) + addXP;
    commitProfileUpdate(
      {
        ...user,
        coins: (user.coins || 0) + addCoins,
        hintsRemaining: (user.hintsRemaining || 0) + addHints,
        xp: nextXP,
        seasonXp: (user.seasonXp || 0) + addXP,
        level: Math.floor(nextXP / 300) + 1
      },
      type === 'DAILY'
        ? `🎁 استلمت المكافأة اليومية${user.isVip ? ' (مضاعفة VIP 👑)' : ''}: +${addCoins} عملة و +${addHints} تلميحات!`
        : `👑 استلمت المكافأة الأسبوعية${user.isVip ? ' (مضاعفة VIP 👑)' : ''}: +${addCoins} عملة و +${addHints} تلميحات!`
    );
  };

  // 6. Buy Battle Card
  const handleBuyBattleCard = (cardId: string, price: number, cardName: string) => {
    if (!requireCoins(price) || !user) return;
    const cards = { ...(user.battleCards || {}) };
    cards[cardId] = (cards[cardId] || 0) + 1;
    commitProfileUpdate(
      {
        ...user,
        coins: (user.coins || 0) - price,
        battleCards: cards
      },
      `⚔️ تم شراء «${cardName}»! جاهز للاستخدام فوراً داخل مباريات الأونلاين.`
    );
  };

  // 7. Buy Power-Up
  const handleBuyPowerUp = (powerUpId: string, price: number, name: string) => {
    if (!requireCoins(price) || !user) return;
    const pus = { ...(user.powerUps || {}) };
    pus[powerUpId] = (pus[powerUpId] || 0) + 1;
    commitProfileUpdate(
      {
        ...user,
        coins: (user.coins || 0) - price,
        powerUps: pus
      },
      `⚡ تم شراء «${name}» وإضافته لحقيبتك!`
    );
  };

  // 8. Buy Hint Bundle
  const handleBuyHintPack = (count: number, price: number) => {
    if (!requireCoins(price) || !user) return;
    commitProfileUpdate(
      {
        ...user,
        coins: (user.coins || 0) - price,
        hintsRemaining: (user.hintsRemaining || 0) + count
      },
      `💡 تمت إضافة +${count} تلميحات ذكية إلى رصيدك!`
    );
  };

  // 9. Buy/Equip Board Theme
  const handleThemeAction = (themeId: string, price: number, name: string) => {
    if (!user) return;
    const unlocked = user.unlockedBoardThemes || ['theme_kuwait_neon'];
    if (unlocked.includes(themeId)) {
      commitProfileUpdate({ ...user, equippedBoardTheme: themeId }, `🎨 تم تفعيل طاولة «${name}» بنجاح!`);
      return;
    }
    if (!requireCoins(price)) return;
    commitProfileUpdate(
      {
        ...user,
        coins: (user.coins || 0) - price,
        unlockedBoardThemes: [...unlocked, themeId],
        equippedBoardTheme: themeId
      },
      `🎨 اشتريت وفعّلت مظهر طاولة «${name}»!`
    );
  };

  // 10. Buy/Equip Trail
  const handleTrailAction = (trailId: string, price: number, name: string) => {
    if (!user) return;
    const unlocked = user.unlockedTrails || ['trail_amber'];
    if (unlocked.includes(trailId)) {
      commitProfileUpdate({ ...user, equippedTrail: trailId }, `✨ تم تفعيل تأثير التحديد «${name}»!`);
      return;
    }
    if (!requireCoins(price)) return;
    commitProfileUpdate(
      {
        ...user,
        coins: (user.coins || 0) - price,
        unlockedTrails: [...unlocked, trailId],
        equippedTrail: trailId
      },
      `✨ اشتريت وفعّلت تأثير التحديد «${name}»!`
    );
  };

  // 11. Buy/Equip Exclusive Avatar
  const handleAvatarAction = (avId: string, url: string, price: number, name: string) => {
    if (!user) return;
    const unlocked = user.unlockedAvatars || [];
    if (unlocked.includes(avId)) {
      commitProfileUpdate({ ...user, avatar: url }, `🖼️ تم تغيير صورتك الرمزية إلى «${name}»!`);
      return;
    }
    if (!requireCoins(price)) return;
    commitProfileUpdate(
      {
        ...user,
        coins: (user.coins || 0) - price,
        unlockedAvatars: [...unlocked, avId],
        avatar: url
      },
      `🖼️ مبروك! تم فتح وتفعيل شخصية «${name}»!`
    );
  };

  // 12. Buy/Equip Name Glow
  const handleNameGlowAction = (glowId: string, price: number, name: string) => {
    if (!user) return;
    const unlocked = user.unlockedNameGlows || ['glow_none'];
    if (unlocked.includes(glowId)) {
      commitProfileUpdate({ ...user, equippedNameGlow: glowId }, `✨ تم تفعيل «${name}» على اسمك!`);
      return;
    }
    if (!requireCoins(price)) return;
    commitProfileUpdate(
      {
        ...user,
        coins: (user.coins || 0) - price,
        unlockedNameGlows: [...unlocked, glowId],
        equippedNameGlow: glowId
      },
      `✨ اشتريت وفعّلت «${name}» على اسمك!`
    );
  };

  // 13. Buy Emote Pack
  const handleBuyEmotePack = (packId: string, price: number, name: string) => {
    if (!user) return;
    const unlocked = user.unlockedEmotePacks || [];
    if (unlocked.includes(packId)) return;
    if (!requireCoins(price)) return;
    commitProfileUpdate(
      {
        ...user,
        coins: (user.coins || 0) - price,
        unlockedEmotePacks: [...unlocked, packId]
      },
      `💬 تم فتح «${name}»! يمكنك إرسالها الآن أثناء التحدي الأونلاين.`
    );
  };

  // 14. Buy Premium Category Pack
  const handleBuyPremiumCategory = (catId: string, price: number, name: string) => {
    if (!user) return;
    const unlocked = user.unlockedCategories || [];
    if (unlocked.includes(catId)) return;
    if (!requireCoins(price)) return;
    commitProfileUpdate(
      {
        ...user,
        coins: (user.coins || 0) - price,
        unlockedCategories: [...unlocked, catId]
      },
      `📚 تم فتح تصنيف «${name}»! تجده جاهزاً للعب في شاشة التصنيفات.`
    );
  };

  // 15. Buy/Equip Title or Frame
  const handleTitleAction = (titleName: string, price: number) => {
    if (!user) return;
    const unlocked = user.unlockedTitles || ['مستكشف الحروف'];
    if (unlocked.includes(titleName)) {
      commitProfileUpdate({ ...user, selectedTitle: titleName }, `🏅 تم تفعيل لقب «${titleName}»!`);
      return;
    }
    if (!requireCoins(price)) return;
    commitProfileUpdate(
      {
        ...user,
        coins: (user.coins || 0) - price,
        unlockedTitles: [...unlocked, titleName],
        selectedTitle: titleName
      },
      `🏅 مبروك! تم شراء وتفعيل لقب «${titleName}»!`
    );
  };

  const handleFrameAction = (frameId: string, frameName: string, price: number) => {
    if (!user) return;
    const unlocked = user.unlockedCosmetics || [];
    if (unlocked.includes(frameId) || unlocked.includes(frameName)) {
      commitProfileUpdate({ ...user, selectedCosmetic: frameId }, `✨ تم تفعيل «${frameName}»!`);
      return;
    }
    if (!requireCoins(price)) return;
    commitProfileUpdate(
      {
        ...user,
        coins: (user.coins || 0) - price,
        unlockedCosmetics: [...unlocked, frameId],
        selectedCosmetic: frameId
      },
      `✨ تم شراء وتفعيل «${frameName}»!`
    );
  };

  return (
    <div
      className="fixed inset-0 z-[75] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="max-w-3xl w-full rounded-3xl p-4 sm:p-6 text-right border-2 border-amber-400/65 shadow-[0_0_50px_rgba(251,191,36,0.28)] my-auto max-h-[92vh] flex flex-col"
        style={{ background: 'linear-gradient(180deg, #09263a 0%, #041320 100%)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400/30 to-orange-500/20 border border-amber-400/60 flex items-center justify-center text-amber-300 shadow">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-xl font-black text-white flex items-center gap-2">
                <span>متجر فتّشها الشامل</span>
                {user?.isVip && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                    VIP 👑
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-3 text-xs font-bold mt-0.5">
                <span className="text-amber-300 flex items-center gap-1 tabular-nums">
                  <Coins className="w-3.5 h-3.5" />
                  {coins.toLocaleString()} عملة فتّشها
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-cyan-300 flex items-center gap-1 tabular-nums">
                  <Lightbulb className="w-3.5 h-3.5" />
                  {hints} تلميحات
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/90 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Banner */}
        {notice && (
          <div
            className={`mb-3 p-3 rounded-2xl border text-xs font-black text-center shrink-0 animate-in zoom-in-95 ${
              notice.ok
                ? 'bg-lime-500/15 border-lime-400/50 text-lime-300'
                : 'bg-rose-500/15 border-rose-400/50 text-rose-300'
            }`}
          >
            {notice.text}
          </div>
        )}

        {/* Store Navigation Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 shrink-0">
          {[
            { id: 'OFFERS' as StoreTab, label: 'العروض والموسم', icon: <Crown className="w-4 h-4" /> },
            { id: 'CARDS' as StoreTab, label: 'كروت الأونلاين', icon: <Swords className="w-4 h-4" /> },
            { id: 'POWERUPS' as StoreTab, label: 'المعززات والتلميحات', icon: <Zap className="w-4 h-4" /> },
            { id: 'COSMETICS' as StoreTab, label: 'الطاولة والتأثيرات', icon: <Palette className="w-4 h-4" /> }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                sounds.playTap();
                setActiveTab(tab.id);
              }}
              className={`py-2.5 px-3 rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-slate-950 border-amber-200 shadow-lg'
                  : 'bg-[#061c2c] text-slate-300 border-cyan-500/25 hover:border-cyan-400/60 hover:text-white'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Scrollable Store Content */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-0.5">
          {/* ================================================================= */}
          {/* TAB 1: OFFERS, MYSTERY BOX, VIP SEASON PASS, FREE REWARDS         */}
          {/* ================================================================= */}
          {activeTab === 'OFFERS' && (
            <div className="space-y-4">
              {/* Daily & Weekly Free Rewards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3.5 rounded-2xl bg-[#061c2c] border border-lime-400/40 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-black text-white flex items-center gap-1.5">
                      <Gift className="w-4 h-4 text-lime-400" />
                      <span>المكافأة اليومية {user?.isVip ? '(×2 VIP)' : ''}</span>
                    </div>
                    <div className="text-[11px] text-amber-300 font-bold mt-0.5">
                      +{user?.isVip ? 240 : 120} عملة • +{user?.isVip ? 4 : 2} تلميح
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleClaimRewardPack('DAILY')}
                    className="px-3.5 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-black text-xs cursor-pointer shrink-0"
                  >
                    استلام
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#061c2c] border border-amber-400/40 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-black text-white flex items-center gap-1.5">
                      <Crown className="w-4 h-4 text-amber-400" />
                      <span>المكافأة الأسبوعية {user?.isVip ? '(×2 VIP)' : ''}</span>
                    </div>
                    <div className="text-[11px] text-amber-300 font-bold mt-0.5">
                      +{user?.isVip ? 900 : 450} عملة • +{user?.isVip ? 12 : 6} تلميحات
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleClaimRewardPack('WEEKLY')}
                    className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs cursor-pointer shrink-0"
                  >
                    استلام
                  </button>
                </div>
              </div>

              {/* Starter Pack (One-Time Offer) */}
              <div className="p-4 rounded-2xl bg-gradient-to-l from-emerald-500/15 via-cyan-500/15 to-amber-500/15 border-2 border-lime-400/55 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-lime-400 text-slate-950 text-[10px] font-black">
                      عرض خاص -70%
                    </span>
                    <h4 className="text-sm font-black text-white">{STARTER_PACK_DEF.name}</h4>
                  </div>
                  <p className="text-xs text-slate-200 font-bold leading-relaxed">
                    {STARTER_PACK_DEF.description}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(user?.starterPackPurchased)}
                  onClick={handleBuyStarterPack}
                  className={`px-4 py-2.5 rounded-xl font-black text-xs shrink-0 flex items-center gap-1.5 ${
                    user?.starterPackPurchased
                      ? 'bg-slate-800 text-emerald-300 border border-emerald-500/40 cursor-default'
                      : 'bg-lime-400 hover:bg-lime-300 text-slate-950 cursor-pointer shadow-lg'
                  }`}
                >
                  {user?.starterPackPurchased ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>تم الشراء</span>
                    </>
                  ) : (
                    <>
                      <Coins className="w-4 h-4" />
                      <span>{STARTER_PACK_DEF.coinPrice} عملة</span>
                    </>
                  )}
                </button>
              </div>

              {/* Daily Mystery Box */}
              <div className="p-4 rounded-2xl bg-[#051a29] border-2 border-purple-400/55 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-purple-300" />
                    <h4 className="text-sm font-black text-white">صندوق الحظ والمفاجآت اليومي</h4>
                  </div>
                  <p className="text-xs text-slate-300 font-bold">
                    افتح الصندوق واربح مكافأة عشوائية: حتى 300 عملة، كروت أونلاين نادرة، معززات، أو طاولة المباركية التراثية!
                  </p>
                  {mysteryResult && (
                    <div className="mt-2 px-3 py-1.5 rounded-xl bg-purple-500/20 border border-purple-400 text-purple-100 text-xs font-black inline-flex items-center gap-2 animate-bounce">
                      <span>🎁 [{mysteryResult.rarity}]</span>
                      <span>{mysteryResult.label}</span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={mysteryOpening}
                  onClick={handleOpenMysteryBox}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:brightness-110 text-white font-black text-xs shrink-0 flex items-center gap-1.5 cursor-pointer shadow-lg"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{mysteryOpening ? 'جاري الفتح...' : `افتح (${MYSTERY_BOX_PRICE} 🪙)`}</span>
                </button>
              </div>

              {/* VIP Pass & Season Track */}
              <div className="p-4 rounded-2xl bg-[#051a29] border-2 border-amber-400/55 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <div>
                    <h4 className="text-sm font-black text-amber-300 flex items-center gap-1.5">
                      <Crown className="w-4 h-4" />
                      <span>تذكرة موسم فتّشها وعضوية فتّشها بلس (VIP)</span>
                    </h4>
                    <p className="text-[11px] text-slate-300 font-bold mt-0.5">
                      نقاط موسمك الحالية: <span className="text-cyan-300 font-mono">{seasonXp} XP</span> • عضوية VIP تضاعف المكافآت اليومية والأسبوعية وتفتح جوائز المسار الملكي!
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(user?.isVip)}
                    onClick={handleBuyVipPass}
                    className={`px-4 py-2 rounded-xl font-black text-xs shrink-0 flex items-center gap-1.5 ${
                      user?.isVip
                        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/60 cursor-default'
                        : 'bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 cursor-pointer shadow'
                    }`}
                  >
                    <Crown className="w-4 h-4" />
                    <span>{user?.isVip ? 'عضوية VIP مفعّلة ✓' : `تفعيل VIP (${VIP_PASS_PRICE} 🪙)`}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SEASON_PASS_TIERS.map(tier => {
                    const reached = seasonXp >= tier.requiredSeasonXp;
                    const claimed = (user?.claimedSeasonTiers || []).includes(tier.tier);
                    return (
                      <div
                        key={tier.tier}
                        className={`p-3 rounded-2xl border flex items-center justify-between gap-2 ${
                          reached
                            ? 'bg-emerald-950/35 border-emerald-400/50'
                            : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="text-xs font-black text-white flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px]">
                              مستوى {tier.tier}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({tier.requiredSeasonXp} XP)
                            </span>
                          </div>
                          <div className="text-[11px] text-lime-300 font-bold">
                            مجاني: {tier.freeRewardLabel}
                          </div>
                          <div className="text-[11px] text-amber-300 font-bold">
                            VIP: {tier.vipRewardLabel}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={!reached || claimed}
                          onClick={() => handleClaimSeasonTier(tier.tier)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-black shrink-0 ${
                            claimed
                              ? 'bg-slate-800 text-emerald-300 cursor-default'
                              : reached
                              ? 'bg-lime-400 hover:bg-lime-300 text-slate-950 cursor-pointer'
                              : 'bg-slate-900 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {claimed ? 'مستلم ✓' : reached ? 'استلام' : 'مقفل'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 2: ONLINE BATTLE ACTION CARDS (كروت التحدي الأونلاين)          */}
          {/* ================================================================= */}
          {activeTab === 'CARDS' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-gradient-to-l from-pink-500/15 via-sky-500/15 to-slate-900 border border-pink-400/45 text-xs font-bold text-slate-200 leading-relaxed">
                ⚔️ <strong className="text-white">كروت التحدي الأونلاين:</strong> استخدم هذه الكروت مباشرة داخل مباريات 1 ضد 1 أونلاين للتأثير الفوري على خصمك (تجميد لوحته، عاصفة رملية، إخفاء الكلمات، سرقة 100 نقطة، أو تفعيل درع الصد)!
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {BATTLE_CARD_ITEMS.map(card => {
                  const owned = user?.battleCards?.[card.id] || 0;
                  return (
                    <div
                      key={card.id}
                      className="p-3.5 rounded-2xl bg-[#051a29] border border-cyan-500/35 hover:border-amber-400/60 flex flex-col justify-between gap-3 transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl shrink-0 border"
                          style={{
                            backgroundColor: `${card.accentColor}22`,
                            borderColor: `${card.accentColor}88`
                          }}
                        >
                          {card.icon}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-xs sm:text-sm font-black text-white">{card.name}</h4>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                card.kind === 'DEFENSE'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                              }`}
                            >
                              {card.kind === 'DEFENSE' ? 'دفاعي' : 'هجومي ضد الخصم'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 font-bold mt-1 leading-relaxed">
                            {card.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                        <span className="text-xs font-black text-cyan-300">
                          في حقيبتك: <span className="text-white font-mono">{owned}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleBuyBattleCard(card.id, card.coinPrice, card.name)}
                          className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Coins className="w-3.5 h-3.5" />
                          <span>شراء ({card.coinPrice})</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 3: POWER-UPS & HINT BUNDLES                                   */}
          {/* ================================================================= */}
          {activeTab === 'POWERUPS' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-black text-cyan-300 mb-2">
                  ⚡ معززات اللعب داخل المراحل الفردية:
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {POWER_UP_ITEMS.map(pu => {
                    const owned = user?.powerUps?.[pu.id] || 0;
                    return (
                      <div
                        key={pu.id}
                        className="p-3.5 rounded-2xl bg-[#051a29] border border-cyan-500/35 flex flex-col justify-between gap-2.5"
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="text-2xl">{pu.icon}</span>
                          <div>
                            <div className="text-xs sm:text-sm font-black text-white">{pu.name}</div>
                            <div className="text-[11px] text-slate-300 font-bold mt-0.5">{pu.description}</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                          <span className="text-xs font-black text-emerald-300">
                            لديك: <span className="font-mono text-white">{owned}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleBuyPowerUp(pu.id, pu.coinPrice, pu.name)}
                            className="px-3.5 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Coins className="w-3.5 h-3.5" />
                            <span>شراء ({pu.coinPrice})</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-black text-lime-300 mb-2">
                  💡 حزم التلميحات الذكية (تُستخدم للـ 5 أنواع من التلميحات):
                </h4>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { count: 3, price: 50, label: 'باقة سريعة' },
                    { count: 8, price: 120, label: 'باقة المستكشف' },
                    { count: 20, price: 260, label: 'باقة الأساطير' }
                  ].map(pack => (
                    <div
                      key={pack.count}
                      className="p-3 rounded-2xl bg-[#051a29] border border-lime-400/35 text-center flex flex-col items-center justify-between gap-2"
                    >
                      <span className="text-[11px] font-bold text-slate-300">{pack.label}</span>
                      <span className="text-sm font-black text-cyan-300">+{pack.count} تلميحات 💡</span>
                      <button
                        type="button"
                        onClick={() => handleBuyHintPack(pack.count, pack.price)}
                        className="w-full py-1.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-black text-xs cursor-pointer"
                      >
                        {pack.price} 🪙
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 4: THEMES, TRAILS, AVATARS, NAME GLOWS, EMOTES, PACKS, TITLES */}
          {/* ================================================================= */}
          {activeTab === 'COSMETICS' && (
            <div className="space-y-5">
              {/* Board Themes */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-amber-300">🎨 مظاهر طاولة اللعب:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {BOARD_THEME_ITEMS.map(theme => {
                    const owned = (user?.unlockedBoardThemes || ['theme_kuwait_neon']).includes(theme.id);
                    const equipped = (user?.equippedBoardTheme || 'theme_kuwait_neon') === theme.id;
                    return (
                      <div
                        key={theme.id}
                        className="p-3 rounded-2xl bg-[#051a29] border border-cyan-500/35 flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-10 h-10 rounded-xl border border-white/30 shrink-0"
                            style={{ background: theme.previewGradient }}
                          />
                          <div>
                            <div className="text-xs font-black text-white">{theme.name}</div>
                            <div className="text-[10px] text-slate-300 font-bold">{theme.description}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleThemeAction(theme.id, theme.coinPrice, theme.name)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-black shrink-0 cursor-pointer ${
                            equipped
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50'
                              : owned
                              ? 'bg-cyan-400 text-slate-950'
                              : 'bg-amber-400 text-slate-950'
                          }`}
                        >
                          {equipped ? 'مُفعّل ✓' : owned ? 'تفعيل' : `${theme.coinPrice} 🪙`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Swipe Trails */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-cyan-300">✨ تأثيرات مسار سحب الكلمات:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {TRAIL_STYLE_ITEMS.map(trail => {
                    const owned = (user?.unlockedTrails || ['trail_amber']).includes(trail.id);
                    const equipped = (user?.equippedTrail || 'trail_amber') === trail.id;
                    return (
                      <div
                        key={trail.id}
                        className="p-3 rounded-2xl bg-[#051a29] border border-cyan-500/35 flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-10 h-4 rounded-full border border-white/40 shrink-0"
                            style={{ background: trail.previewGradient }}
                          />
                          <div>
                            <div className="text-xs font-black text-white">{trail.name}</div>
                            <div className="text-[10px] text-slate-300 font-bold">{trail.description}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleTrailAction(trail.id, trail.coinPrice, trail.name)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-black shrink-0 cursor-pointer ${
                            equipped
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50'
                              : owned
                              ? 'bg-cyan-400 text-slate-950'
                              : 'bg-amber-400 text-slate-950'
                          }`}
                        >
                          {equipped ? 'مُفعّل ✓' : owned ? 'تفعيل' : `${trail.coinPrice} 🪙`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Exclusive Avatars & Name Glows */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-pink-300">🖼️ شخصيات وصور رمزية حصرية:</h4>
                  {EXCLUSIVE_AVATARS.map(av => {
                    const owned = (user?.unlockedAvatars || []).includes(av.id);
                    const equipped = user?.avatar === av.url;
                    return (
                      <div
                        key={av.id}
                        className="p-2.5 rounded-2xl bg-[#051a29] border border-pink-400/30 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <img src={av.url} alt={av.name} className="w-9 h-9 rounded-full object-cover border border-amber-400" />
                          <div>
                            <div className="text-xs font-black text-white">{av.name}</div>
                            <div className="text-[10px] text-amber-300">{av.badge}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAvatarAction(av.id, av.url, av.coinPrice, av.name)}
                          className={`px-3 py-1 rounded-xl text-[11px] font-black cursor-pointer ${
                            equipped
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                              : owned
                              ? 'bg-cyan-400 text-slate-950'
                              : 'bg-amber-400 text-slate-950'
                          }`}
                        >
                          {equipped ? 'مُفعّل ✓' : owned ? 'تعيين' : `${av.coinPrice} 🪙`}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-black text-lime-300">🌟 توهج ولون الاسم:</h4>
                  {NAME_GLOW_ITEMS.map(glow => {
                    const owned = (user?.unlockedNameGlows || ['glow_none']).includes(glow.id);
                    const equipped = (user?.equippedNameGlow || 'glow_none') === glow.id;
                    return (
                      <div
                        key={glow.id}
                        className="p-2.5 rounded-2xl bg-[#051a29] border border-lime-400/30 flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className={`text-xs font-black ${glow.previewClass}`}>{glow.name}</div>
                          <div className="text-[10px] text-slate-400 font-bold">{glow.description}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleNameGlowAction(glow.id, glow.coinPrice, glow.name)}
                          className={`px-3 py-1 rounded-xl text-[11px] font-black cursor-pointer ${
                            equipped
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                              : owned
                              ? 'bg-cyan-400 text-slate-950'
                              : 'bg-amber-400 text-slate-950'
                          }`}
                        >
                          {equipped ? 'مُفعّل ✓' : owned ? 'تفعيل' : `${glow.coinPrice} 🪙`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Online Emote Packs & Premium Category Packs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-sky-300">💬 حزم تعبيرات الأونلاين السريعة:</h4>
                  {EMOTE_PACK_ITEMS.map(ep => {
                    const owned = (user?.unlockedEmotePacks || []).includes(ep.id);
                    return (
                      <div
                        key={ep.id}
                        className="p-3 rounded-2xl bg-[#051a29] border border-sky-400/30 flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="text-xs font-black text-white">{ep.name}</div>
                          <div className="text-[10px] text-sky-200 font-bold mt-0.5">{ep.emotes.join(' • ')}</div>
                        </div>
                        <button
                          type="button"
                          disabled={owned}
                          onClick={() => handleBuyEmotePack(ep.id, ep.coinPrice, ep.name)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-black shrink-0 ${
                            owned ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-400 text-slate-950 cursor-pointer'
                          }`}
                        >
                          {owned ? 'مفتوحة ✓' : `${ep.coinPrice} 🪙`}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-black text-orange-300">📚 تصنيفات مراحل حصرية (50 مرحلة):</h4>
                  {PREMIUM_PACK_ITEMS.map(pk => {
                    const owned = (user?.unlockedCategories || []).includes(pk.categoryId);
                    return (
                      <div
                        key={pk.id}
                        className="p-3 rounded-2xl bg-[#051a29] border border-orange-400/30 flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="text-xs font-black text-white">
                            {pk.icon} {pk.name}
                          </div>
                          <div className="text-[10px] text-slate-300 font-bold mt-0.5">{pk.description}</div>
                        </div>
                        <button
                          type="button"
                          disabled={owned}
                          onClick={() => handleBuyPremiumCategory(pk.categoryId, pk.coinPrice, pk.name)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-black shrink-0 ${
                            owned ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-400 text-slate-950 cursor-pointer'
                          }`}
                        >
                          {owned ? 'مفتوح ✓' : `${pk.coinPrice} 🪙`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Player Titles & Avatar Frames */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-amber-300">🏅 الألقاب الرسمية وإطارات الصورة:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PLAYER_TITLES.map(t => {
                    const owned = (user?.unlockedTitles || ['مستكشف الحروف']).includes(t.name);
                    const equipped = user?.selectedTitle === t.name;
                    return (
                      <div
                        key={t.id}
                        className="p-2.5 rounded-2xl bg-[#051a29] border border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="text-xs font-black" style={{ color: t.badgeColor }}>
                            لقب: {t.name}
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold">{t.unlockRequirement}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleTitleAction(t.name, t.coinPrice || 0)}
                          className={`px-3 py-1 rounded-xl text-[11px] font-black shrink-0 cursor-pointer ${
                            equipped
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                              : owned
                              ? 'bg-cyan-400 text-slate-950'
                              : 'bg-amber-400 text-slate-950'
                          }`}
                        >
                          {equipped ? 'مُفعّل ✓' : owned ? 'تفعيل' : `${t.coinPrice || 0} 🪙`}
                        </button>
                      </div>
                    );
                  })}
                  {COSMETIC_ITEMS.map(c => {
                    const owned = (user?.unlockedCosmetics || []).some(u => u === c.id || u === c.name);
                    const equipped = user?.selectedCosmetic === c.id;
                    return (
                      <div
                        key={c.id}
                        className="p-2.5 rounded-2xl bg-[#051a29] border border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-6 h-6 rounded-full border-2 shrink-0"
                            style={{ background: c.previewGradient, borderColor: c.borderColor }}
                          />
                          <div className="text-xs font-black text-white">{c.name}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleFrameAction(c.id, c.name, c.coinPrice)}
                          className={`px-3 py-1 rounded-xl text-[11px] font-black shrink-0 cursor-pointer ${
                            equipped
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                              : owned
                              ? 'bg-cyan-400 text-slate-950'
                              : 'bg-amber-400 text-slate-950'
                          }`}
                        >
                          {equipped ? 'مُفعّل ✓' : owned ? 'تفعيل' : `${c.coinPrice} 🪙`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Button */}
        {onNavigate && (
          <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigate('PROFILE');
              }}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <BarChart3 className="w-4 h-4" />
              <span>ملف اللاعب والإنجازات</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
