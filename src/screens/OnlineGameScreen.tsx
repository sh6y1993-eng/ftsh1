import React, { useState, useEffect, useCallback } from 'react';
import { OnlineRoom, PlayerProfile, BattleCardId } from '../types/game';
import {
  findCategoryById,
  BATTLE_CARD_ITEMS,
  EMOTE_PACK_ITEMS,
  getNameGlowClass
} from '../engine/gameCategories';
import { GameBoard } from '../components/GameBoard';
import { WordBank } from '../components/WordBank';
import { KuwaitiCommentary } from '../components/KuwaitiCommentary';
import { TVRemoteHint } from '../components/TVRemoteHint';
import { StoreModal } from '../components/StoreModal';
import { ResultsModal } from './ResultsModal';
import { ArrowRight, AlertTriangle, Zap, Flame, Volume2, VolumeX, ShoppingBag, Shield } from 'lucide-react';
import { sounds } from '../utils/audio';
import confetti from 'canvas-confetti';
import { realtimeSync } from '../services/realtimeSync';
import { saveUserToLocalMap, syncProfileWithSupabase } from '../services/supabaseClient';

interface OnlineGameScreenProps {
  initialRoom: OnlineRoom;
  socket: WebSocket;
  currentUser: PlayerProfile | null;
  onUpdateUser?: (user: PlayerProfile) => void;
  myPlayerId?: string;
  onExit: () => void;
  tvMode: boolean;
}

export const OnlineGameScreen: React.FC<OnlineGameScreenProps> = ({
  initialRoom,
  socket,
  currentUser,
  onUpdateUser,
  myPlayerId,
  onExit,
  tvMode
}) => {
  const [room, setRoom] = useState<OnlineRoom>(initialRoom);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [wordPlayerMap, setWordPlayerMap] = useState<Record<string, string>>({});
  const [wordPlayerNameMap, setWordPlayerNameMap] = useState<Record<string, string>>({});
  const [wordPlayerIdMap, setWordPlayerIdMap] = useState<Record<string, string>>({});
  const [opponentPath, setOpponentPath] = useState<{ row: number; col: number }[]>([]);
  const [raceFlash, setRaceFlash] = useState<{
    text: string;
    subtext: string;
    isMine: boolean;
  } | null>(null);
  const [kuwaitiMsg, setKuwaitiMsg] = useState(
    'نظام لاعبين (1 ضد 1): اللي يصيد الكلمة أول تنحسب له وتنصبغ بلونه قدام الخصم! 🔥'
  );
  const [commentType, setCommentType] = useState<'praise' | 'mistake' | 'neutral'>('neutral');
  const [disconnectionNotice, setDisconnectionNotice] = useState<string | null>(null);
  const [gameFinished, setGameFinished] = useState(false);
  const [winnerInfo, setWinnerInfo] = useState<{ id?: string; name: string } | null>(null);
  const [rematchLoading, setRematchLoading] = useState(false);
  const [soundMuted, setSoundMuted] = useState(sounds.getMuted());
  const [showStoreModal, setShowStoreModal] = useState(false);

  // Battle Card Real-Time Active Effects
  const [myFrozenSeconds, setMyFrozenSeconds] = useState(0);
  const [mySandstormSeconds, setMySandstormSeconds] = useState(0);
  const [myBlindWordsSeconds, setMyBlindWordsSeconds] = useState(0);
  const [myShieldActive, setMyShieldActive] = useState(false);
  const [oppDebuffBanner, setOppDebuffBanner] = useState<{ label: string; seconds: number } | null>(null);
  const [oppShieldActive, setOppShieldActive] = useState(false);
  const [cardCooldown, setCardCooldown] = useState(0);

  const baseReactions = [
    'صدتها قبلك! ⚡',
    'كفووو! 🔥',
    'يا وحش! 🦅',
    'شد حيلك! 💪',
    'ريماتش؟ 🔄'
  ];
  const unlockedEmoteExtras = EMOTE_PACK_ITEMS.filter(pack =>
    (currentUser?.unlockedEmotePacks || []).includes(pack.id)
  ).flatMap(pack => pack.emotes);
  const QUICK_REACTIONS = [...baseReactions, ...unlockedEmoteExtras];

  const rawPlayerId =
    myPlayerId ||
    sessionStorage.getItem('fatteshha_online_tab_id') ||
    currentUser?.id ||
    `guest_${Date.now()}`;
  const categoryObj = findCategoryById(room.categoryId);
  const playersList = Object.values(room.players);
  const myPlayer =
    room.players[rawPlayerId] ||
    playersList.find(p => p.id === rawPlayerId) ||
    playersList[0];
  const playerId = myPlayer?.id || rawPlayerId;
  const opponent = playersList.find(p => p.id !== playerId) || playersList[1];

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        const { type, payload } = data;

        if (type === 'OPPONENT_CURSOR') {
          setOpponentPath(payload.cells || []);
        } else if (type === 'WORD_CLAIMED') {
          const {
            word,
            displayWord,
            playerId: claimerId,
            playerColor,
            playerName,
            wordScore,
            streak,
            room: updatedRoom
          } = payload;
          const isClaimedByMe = String(claimerId) === String(playerId);
          const resolvedColor = playerColor || (isClaimedByMe ? '#0ea5e9' : '#ec4899');
          const resolvedName =
            playerName ||
            updatedRoom?.players?.[claimerId]?.displayName ||
            (isClaimedByMe ? myPlayer?.displayName || 'أنت' : opponent?.displayName || 'الخصم');

          setRoom(updatedRoom);
          setOpponentPath([]);

          setFoundWords(prev => (prev.includes(word) ? prev : [...prev, word]));
          setWordPlayerMap(prev => ({ ...prev, [word]: resolvedColor }));
          setWordPlayerNameMap(prev => ({ ...prev, [word]: resolvedName }));
          setWordPlayerIdMap(prev => ({ ...prev, [word]: String(claimerId) }));

          const shownWord = displayWord || word;
          const pts = wordScore || 150;

          // Detect if this word catch flipped the match lead
          const updatedPlayers = Object.values(updatedRoom.players || {}) as Array<{
            id: string;
            score: number;
          }>;
          const claimerUpdated = updatedPlayers.find(p => String(p.id) === String(claimerId));
          const rivalUpdated = updatedPlayers.find(p => String(p.id) !== String(claimerId));
          const prevClaimerScore = (claimerUpdated?.score || pts) - pts;
          const rivalScore = rivalUpdated?.score || 0;
          const tookLead =
            rivalScore > 0 &&
            prevClaimerScore <= rivalScore &&
            (claimerUpdated?.score || 0) > rivalScore;

          if (isClaimedByMe) {
            sounds.playMultiplayerWordScore(streak || 1, 0);
            if (tookLead) {
              setTimeout(() => sounds.playLeadChangeFanfare(), 240);
            }
            const comboTxt = streak && streak >= 2 ? ` • كومبو x${streak} 🔥` : '';
            const leadTxt = tookLead ? ' • 👑 انتزعت الصدارة!' : '';
            setKuwaitiMsg(
              `كفو! صدت كلمة «${shownWord}» أول وانحسبت لك (+${pts} نقطة${comboTxt}${leadTxt})`
            );
            setCommentType('praise');
            setRaceFlash({
              text: `🔊 ⚡ صدت «${shownWord}» أول! انحسبت لك`,
              subtext: `+${pts} نقطة${comboTxt}${leadTxt}`,
              isMine: true
            });
          } else {
            sounds.playOpponentFound(streak || 1);
            const comboTxt = streak && streak >= 2 ? ` (كومبو x${streak})` : '';
            const leadTxt = tookLead ? ' • انتزع الصدارة!' : '';
            setKuwaitiMsg(
              `الخصم «${resolvedName}» صاد كلمة «${shownWord}» قبلك وانحسبت له (+${pts} نقطة)${leadTxt}! ⚡`
            );
            setCommentType('mistake');
            setRaceFlash({
              text: `🚨 الخصم «${resolvedName}» صاد «${shownWord}» قبلك!`,
              subtext: `انحسبت للخصم (+${pts} نقطة)${comboTxt}${leadTxt}`,
              isMine: false
            });
          }
        } else if (type === 'WORD_ALREADY_CLAIMED') {
          sounds.playError();
          const claimer = payload.claimedByName || 'الخصم';
          setKuwaitiMsg(`صادها ${claimer} قبلك بجزء من الثانية وانحسبت له! دوّر كلمة ثانية ⚡`);
          setCommentType('mistake');
        } else if (type === 'CHAT_BROADCAST') {
          const { chatItem } = payload;
          setKuwaitiMsg(`💬 ${chatItem.sender}: ${chatItem.text}`);
          setCommentType('neutral');
        } else if (type === 'PLAYER_DISCONNECTED') {
          setDisconnectionNotice(`انقطع اتصال اللاعب ${payload.playerName}. بانتظار عودته...`);
        } else if (type === 'GAME_FINISHED') {
          const { room: finalRoom, winnerId, winnerName } = payload;
          setRoom(finalRoom);
          setOpponentPath([]);
          setGameFinished(true);
          setRematchLoading(false);
          setWinnerInfo({ id: winnerId, name: winnerName });

          if (winnerId === playerId) {
            sounds.playVictory();
            try {
              confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
            } catch {
              // Ignore
            }
          } else {
            sounds.playTap();
          }
        } else if (type === 'GAME_REMATCH_STARTED') {
          const { room: newRoom, initiatedBy, roundNumber } = payload;
          sounds.playVictory();
          setRoom(newRoom);
          setFoundWords([]);
          setWordPlayerMap({});
          setWordPlayerNameMap({});
          setWordPlayerIdMap({});
          setOpponentPath([]);
          setRaceFlash(null);
          setGameFinished(false);
          setWinnerInfo(null);
          setRematchLoading(false);
          setDisconnectionNotice(null);
          setMyFrozenSeconds(0);
          setMySandstormSeconds(0);
          setMyBlindWordsSeconds(0);
          setMyShieldActive(false);
          setOppShieldActive(false);
          setOppDebuffBanner(null);
          setCommentType('praise');
          setKuwaitiMsg(
            `🔄 بدأ ${initiatedBy} ريماتش فوري (الجولة ${roundNumber}) في تصنيف «${categoryObj.name}»! اللي يصيد الكلمة أول تنحسب له 🔥`
          );
        } else if (type === 'BATTLE_CARD_APPLIED') {
          const {
            cardId,
            senderId,
            senderName,
            targetId,
            blockedByShield,
            stolenAmount,
            room: updatedRoom
          } = payload || {};
          if (updatedRoom) {
            setRoom(updatedRoom);
          }

          const cardDef = BATTLE_CARD_ITEMS.find(c => c.id === cardId);
          const isSenderMe = String(senderId) === String(playerId);
          const isTargetMe = String(targetId) === String(playerId);

          if (cardId === 'CARD_SHIELD') {
            sounds.playHint();
            if (isSenderMe) {
              setMyShieldActive(true);
              setKuwaitiMsg('🛡️ فعّلت درع الحماية! سيتم صد كرت الهجوم القادم من خصمك تلقائياً.');
              setCommentType('praise');
            } else {
              setOppShieldActive(true);
              setKuwaitiMsg(`🛡️ الخصم «${senderName}» فعّل درع الحماية ضد هجماتك!`);
              setCommentType('neutral');
            }
            return;
          }

          if (blockedByShield) {
            sounds.playVictory();
            if (isTargetMe) {
              setMyShieldActive(false);
              setRaceFlash({
                text: `🛡️ درعك صدّ كرت «${cardDef?.shortName || 'الهجوم'}» من الخصم!`,
                subtext: 'نجوت من التأثير بنجاح 🔥',
                isMine: true
              });
              setKuwaitiMsg(`🛡️ درع الحماية صدّ هجوم الخصم (${cardDef?.name}) عنك!`);
            } else {
              setOppShieldActive(false);
              setRaceFlash({
                text: `🛡️ درع الخصم صدّ كرت «${cardDef?.shortName || 'الهجوم'}»!`,
                subtext: 'حاول بكرت آخر لكسر دفاعه',
                isMine: false
              });
              setKuwaitiMsg(`🛡️ الخصم كان محمياً بدرع وصدّ كرتك (${cardDef?.name})!`);
            }
            return;
          }

          if (isTargetMe) {
            sounds.playError();
            const effectSeconds = cardDef?.durationSec || 15;
            if (cardId === 'CARD_FREEZE_OPPONENT') {
              setMyFrozenSeconds(effectSeconds);
            } else if (cardId === 'CARD_SANDSTORM') {
              setMySandstormSeconds(effectSeconds);
            } else if (cardId === 'CARD_BLIND_WORDS') {
              setMyBlindWordsSeconds(effectSeconds);
            }
            const flashTitle =
              cardId === 'CARD_STEAL_POINTS'
                ? `⚡ الخصم «${senderName}» سرق ${stolenAmount || 0} نقطة من رصيدك!`
                : `${cardDef?.icon || '⚔️'} الخصم «${senderName}» أطلق عليك: ${cardDef?.name || 'كرت هجوم'}!`;
            setRaceFlash({
              text: flashTitle,
              subtext: cardDef?.durationSec ? `التأثير مستمر لمدة ${cardDef.durationSec} ثانية` : 'انتزع الصدارة مجدداً!',
              isMine: false
            });
            setKuwaitiMsg(flashTitle);
            setCommentType('mistake');
          } else if (isSenderMe) {
            sounds.playVictory();
            if (cardDef?.durationSec) {
              setOppDebuffBanner({
                label: `${cardDef.icon} الخصم متأثر بـ ${cardDef.shortName}`,
                seconds: cardDef.durationSec
              });
            }
            const flashTitle =
              cardId === 'CARD_STEAL_POINTS'
                ? `⚡ سرقت +${stolenAmount || 0} نقطة من الخصم وأضفتها لرصيدك!`
                : `${cardDef?.icon || '⚔️'} أصبت الخصم بـ «${cardDef?.name}»!`;
            setRaceFlash({
              text: flashTitle,
              subtext: cardDef?.durationSec ? `الخصم متأثر لمدة ${cardDef.durationSec} ثانية — أسرع بصيد الكلمات!` : 'ضربة موفقة 🔥',
              isMine: true
            });
            setKuwaitiMsg(flashTitle);
            setCommentType('praise');
          }
        }
      } catch (err) {
        console.error('Online game message error:', err);
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket, playerId, categoryObj.name]);

  // Countdown timers for active Battle Card debuffs & cooldown
  useEffect(() => {
    if (
      myFrozenSeconds <= 0 &&
      mySandstormSeconds <= 0 &&
      myBlindWordsSeconds <= 0 &&
      cardCooldown <= 0 &&
      (!oppDebuffBanner || oppDebuffBanner.seconds <= 0)
    ) {
      return;
    }
    const timer = setInterval(() => {
      setMyFrozenSeconds(s => Math.max(0, s - 1));
      setMySandstormSeconds(s => Math.max(0, s - 1));
      setMyBlindWordsSeconds(s => Math.max(0, s - 1));
      setCardCooldown(s => Math.max(0, s - 1));
      setOppDebuffBanner(prev =>
        prev && prev.seconds > 1 ? { ...prev, seconds: prev.seconds - 1 } : null
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [myFrozenSeconds, mySandstormSeconds, myBlindWordsSeconds, cardCooldown, oppDebuffBanner]);

  // Clear flash banner after 2.6 seconds
  useEffect(() => {
    if (!raceFlash) return;
    const timer = setTimeout(() => setRaceFlash(null), 2600);
    return () => clearTimeout(timer);
  }, [raceFlash]);

  // Stream player's live drag path to opponent so they see you racing on the grid
  const handleSelectionDrag = useCallback(
    (cells: { row: number; col: number }[]) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: 'CURSOR_DRAG',
            payload: {
              code: room.code,
              playerId,
              cells
            }
          })
        );
      }
    },
    [socket, room.code, playerId]
  );

  // Handle word selection from the board
  const handleWordSelected = (word: string) => {
    if (foundWords.includes(word)) {
      sounds.playError();
      const ownerName = wordPlayerNameMap[word] || 'لاعب';
      setKuwaitiMsg(`هذه الكلمة صادها «${ownerName}» وانحسبت له! اسبق على الكلمات الباقية ⚡`);
      setCommentType('mistake');
      return;
    }

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'WORD_FOUND',
          payload: {
            code: room.code,
            word,
            playerId
          }
        })
      );
    } else {
      // Local / Netlify / Vercel static fallback: claim word directly in client state
      const placement = room.wordPlacements?.find(p => p.word === word);
      const displayWord = placement?.displayWord || word;
      const pts = 150;
      const myColor = myPlayer?.color || (room.hostId === playerId ? '#0ea5e9' : '#ec4899');
      const myName = myPlayer?.displayName || 'أنت';
      sounds.playMultiplayerWordScore(1, 0);

      // Publish word discovery over real-time cloud relay to the opponent
      realtimeSync.publishToRoom(
        room.code,
        'WORD_FOUND',
        {
          word,
          playerId,
          playerName: myName,
          playerColor: myColor,
          displayWord,
          pts
        },
        playerId
      );

      setFoundWords(prev => (prev.includes(word) ? prev : [...prev, word]));
      setWordPlayerMap(prev => ({ ...prev, [word]: myColor }));
      setWordPlayerNameMap(prev => ({ ...prev, [word]: myName }));
      setWordPlayerIdMap(prev => ({ ...prev, [word]: String(playerId) }));

      setKuwaitiMsg(`كفو! صدت كلمة «${displayWord}» وانحسبت لك (+${pts} نقطة)! ⚡`);
      setCommentType('praise');
      setRaceFlash({
        text: `🔊 ⚡ صدت «${displayWord}» أول! انحسبت لك`,
        subtext: `+${pts} نقطة لصالحك`,
        isMine: true
      });

      setRoom(prev => {
        const myP = prev.players[playerId];
        const nextScore = (myP?.score || 0) + pts;
        const currentFound = myP?.wordsFound || [];
        const nextFound = currentFound.includes(word) ? currentFound : [...currentFound, word];

        const nextRoom = {
          ...prev,
          players: {
            ...prev.players,
            [playerId]: {
              ...myP,
              score: nextScore,
              wordsFound: nextFound
            }
          }
        };

        const totalWordCount = prev.wordPlacements?.length || 7;
        const oppCount = opponent?.wordsFound?.length || 0;
        if (nextFound.length + oppCount >= totalWordCount) {
          setTimeout(() => {
            const myFinal = nextScore;
            const oppFinal = opponent?.score || 0;
            const winner = myFinal >= oppFinal ? myPlayer : opponent;
            setGameFinished(true);
            setWinnerInfo({ id: winner?.id, name: winner?.displayName || 'الفائز' });
            if (winner?.id === playerId) {
              sounds.playVictory();
              try {
                confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
              } catch {
                // Ignore
              }
            }
          }, 800);
        }

        return nextRoom;
      });
    }
  };

  // Real-time listener for word discoveries by human opponent across the internet
  useEffect(() => {
    realtimeSync.subscribeToRoom(room.code, (msg) => {
      const { type, payload, senderId } = msg;
      if (String(senderId) === String(playerId) || String(payload?.playerId) === String(playerId)) {
        return;
      }

      if (type === 'WORD_FOUND') {
        const {
          word,
          playerId: finderId,
          playerName: payloadFinderName,
          playerColor: payloadFinderColor,
          displayWord: dw,
          pts
        } = payload;
        const finder =
          room.players[finderId] ||
          Object.values(room.players).find(p => String(p.id) !== String(playerId));
        const resolvedFinderId = String(finder?.id || finderId || 'opponent');
        const finderColor = finder?.color || payloadFinderColor || '#ec4899';
        const finderName = finder?.displayName || payloadFinderName || 'الخصم';
        const wordPts = pts || 150;

        setFoundWords(f => (f.includes(word) ? f : [...f, word]));
        setWordPlayerMap(m => ({ ...m, [word]: finderColor }));
        setWordPlayerNameMap(m => ({ ...m, [word]: finderName }));
        setWordPlayerIdMap(m => ({ ...m, [word]: resolvedFinderId }));
        sounds.playOpponentFound(1);
        setKuwaitiMsg(
          `الخصم «${finderName}» صاد كلمة «${dw || word}» قبلك وانحسبت له (+${wordPts} نقطة)! اسبق على الكلمات المتبقية ⚡`
        );
        setCommentType('mistake');
        setRaceFlash({
          text: `🚨 الخصم «${finderName}» صاد «${dw || word}» قبلك!`,
          subtext: `انحسبت للخصم (+${wordPts} نقطة) • اسبق على الكلمات المتبقية`,
          isMine: false
        });

        setRoom(cur => {
          const targetKey = cur.players[resolvedFinderId]
            ? resolvedFinderId
            : Object.keys(cur.players).find(k => String(k) !== String(playerId)) || resolvedFinderId;
          const finderP = cur.players[targetKey];
          const prevWords = finderP?.wordsFound || [];
          const alreadyHad = prevWords.includes(word);
          const nextScore = alreadyHad ? finderP?.score || 0 : (finderP?.score || 0) + wordPts;
          const nextFound = alreadyHad ? prevWords : [...prevWords, word];
          const updated = {
            ...cur,
            players: {
              ...cur.players,
              [targetKey]: {
                ...finderP,
                id: targetKey,
                displayName: finderP?.displayName || finderName,
                color: finderP?.color || finderColor,
                score: nextScore,
                wordsFound: nextFound
              }
            }
          };

          const totalW = cur.wordPlacements?.length || 7;
          const myCount = cur.players[playerId]?.wordsFound?.length || 0;
          if (myCount + nextFound.length >= totalW) {
            setTimeout(() => {
              const myFinal = cur.players[playerId]?.score || 0;
              const winner = myFinal >= nextScore ? myPlayer : updated.players[targetKey];
              setGameFinished(true);
              setWinnerInfo({ id: winner?.id, name: winner?.displayName || 'الفائز' });
              if (winner?.id === playerId) {
                sounds.playVictory();
                try {
                  confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
                } catch {
                  // Ignore
                }
              }
            }, 800);
          }
          return updated;
        });
      } else if (type === 'BATTLE_CARD_USED') {
        const { cardId, senderName, blockedByShield, stolenAmount } = payload || {};
        const cardDef = BATTLE_CARD_ITEMS.find(c => c.id === cardId);

        if (cardId === 'CARD_SHIELD') {
          setOppShieldActive(true);
          setKuwaitiMsg(`🛡️ الخصم «${senderName}» فعّل درع الحماية!`);
          return;
        }

        if (myShieldActive) {
          setMyShieldActive(false);
          sounds.playVictory();
          setRaceFlash({
            text: `🛡️ درعك صدّ كرت «${cardDef?.shortName || 'الهجوم'}» من الخصم!`,
            subtext: 'تم إحباط الهجوم بنجاح 🔥',
            isMine: true
          });
          realtimeSync.publishToRoom(
            room.code,
            'BATTLE_CARD_BLOCKED',
            { cardId, blockerId: playerId, blockerName: myPlayer?.displayName || 'الخصم' },
            playerId
          );
          return;
        }

        if (!blockedByShield) {
          sounds.playError();
          const effectSeconds = cardDef?.durationSec || 15;
          if (cardId === 'CARD_FREEZE_OPPONENT') setMyFrozenSeconds(effectSeconds);
          if (cardId === 'CARD_SANDSTORM') setMySandstormSeconds(effectSeconds);
          if (cardId === 'CARD_BLIND_WORDS') setMyBlindWordsSeconds(effectSeconds);
          if (cardId === 'CARD_STEAL_POINTS') {
            const amt = Number(stolenAmount) || 100;
            setRoom(cur => {
              const myP = cur.players[playerId];
              const oppKey = Object.keys(cur.players).find(k => k !== playerId);
              const oppP = oppKey ? cur.players[oppKey] : undefined;
              const actual = Math.min(amt, myP?.score || 0);
              return {
                ...cur,
                players: {
                  ...cur.players,
                  ...(myP ? { [playerId]: { ...myP, score: Math.max(0, (myP.score || 0) - actual) } } : {}),
                  ...(oppKey && oppP ? { [oppKey]: { ...oppP, score: (oppP.score || 0) + actual } } : {})
                }
              };
            });
          }
          setRaceFlash({
            text: `${cardDef?.icon || '⚔️'} الخصم «${senderName}» أطلق عليك: ${cardDef?.name}!`,
            subtext: cardDef?.durationSec ? `التأثير مستمر لمدة ${cardDef.durationSec} ثانية` : 'أسرع للتعويض!',
            isMine: false
          });
          setKuwaitiMsg(`${cardDef?.icon || '⚔️'} الخصم استخدم عليك ${cardDef?.name}!`);
          setCommentType('mistake');
        }
      } else if (type === 'BATTLE_CARD_BLOCKED') {
        const { cardId } = payload || {};
        const cardDef = BATTLE_CARD_ITEMS.find(c => c.id === cardId);
        setOppShieldActive(false);
        setOppDebuffBanner(null);
        setRaceFlash({
          text: `🛡️ درع الخصم صدّ كرت «${cardDef?.shortName || 'الهجوم'}»!`,
          subtext: 'حاول مرة أخرى لكسر دفاعه',
          isMine: false
        });
      }
    });
  }, [room.code, playerId, myPlayer, room.players, myShieldActive]);

  // Offline simulated rival ONLY if opponent is a generated bot (starts with 'bot_')
  useEffect(() => {
    if (socket.readyState === WebSocket.OPEN || gameFinished) return;
    const rivalBot = Object.values(room.players).find(p => p.id !== playerId && p.id.startsWith('bot_'));
    if (!rivalBot) return;

    const timer = setInterval(() => {
      const unclaimed = (room.wordPlacements || []).filter(wp => !foundWords.includes(wp.word));
      if (unclaimed.length === 0) return;

      const target = unclaimed[Math.floor(Math.random() * unclaimed.length)];
      setOpponentPath(target.cells.slice(0, 3));

      setTimeout(() => {
        setOpponentPath([]);
        setFoundWords(f => (f.includes(target.word) ? f : [...f, target.word]));
        setWordPlayerMap(m => ({ ...m, [target.word]: rivalBot.color || '#ec4899' }));
        setWordPlayerNameMap(m => ({ ...m, [target.word]: rivalBot.displayName }));
        sounds.playError();
        setRaceFlash({
          text: `خصمك «${rivalBot.displayName}» صاد كلمة «${target.displayWord}»!`,
          subtext: `اسبق على الكلمات المتبقية`,
          isMine: false
        });

        setRoom(cur => {
          const rivalP = cur.players[rivalBot.id];
          const nextScore = (rivalP?.score || 0) + 150;
          const nextFound = [...(rivalP?.wordsFound || []), target.word];
          const updated = {
            ...cur,
            players: {
              ...cur.players,
              [rivalBot.id]: {
                ...rivalP,
                score: nextScore,
                wordsFound: nextFound
              }
            }
          };
          const totalW = cur.wordPlacements?.length || 7;
          const myCount = cur.players[playerId]?.wordsFound?.length || 0;
          if (myCount + nextFound.length >= totalW) {
            setTimeout(() => {
              const myFinal = cur.players[playerId]?.score || 0;
              const winner = myFinal >= nextScore ? myPlayer : rivalBot;
              setGameFinished(true);
              setWinnerInfo({ id: winner?.id, name: winner?.displayName || 'الفائز' });
              if (winner?.id === playerId) {
                sounds.playVictory();
                try {
                  confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
                } catch {
                  // Ignore
                }
              }
            }, 800);
          }
          return updated;
        });
      }, 1200);
    }, 11000);

    return () => clearInterval(timer);
  }, [socket, playerId, gameFinished, foundWords, room.wordPlacements, room.players]);

  // One-Click Rematch without changing category
  const handleInstantRematch = () => {
    sounds.playTap();
    setRematchLoading(true);
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'ROOM_REMATCH',
          payload: {
            code: room.code,
            playerId
          }
        })
      );
    }
  };

  // Send quick reaction
  const sendReaction = (text: string) => {
    sounds.playTap();
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'CHAT_MESSAGE',
          payload: {
            code: room.code,
            sender: myPlayer?.displayName || currentUser?.displayName || 'لاعب',
            text
          }
        })
      );
    }
  };

  // Trigger an Online Battle Card (affecting the opponent or activating Shield)
  const handleUseBattleCard = (cardId: BattleCardId) => {
    if (gameFinished || cardCooldown > 0) return;
    const ownedCount = currentUser?.battleCards?.[cardId] || 0;
    const cardDef = BATTLE_CARD_ITEMS.find(c => c.id === cardId);
    if (!cardDef) return;

    if (ownedCount <= 0) {
      sounds.playError();
      setShowStoreModal(true);
      return;
    }

    // Deduct 1 card from inventory
    if (currentUser && onUpdateUser) {
      const nextCards = {
        ...(currentUser.battleCards || {}),
        [cardId]: Math.max(0, ownedCount - 1)
      };
      const updated = saveUserToLocalMap({
        ...currentUser,
        battleCards: nextCards
      });
      onUpdateUser(updated);
      syncProfileWithSupabase(updated);
    }

    setCardCooldown(4);

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'USE_BATTLE_CARD',
          payload: {
            code: room.code,
            cardId,
            playerId
          }
        })
      );
    } else {
      // Static / cloud relay fallback
      if (cardId === 'CARD_SHIELD') {
        sounds.playHint();
        setMyShieldActive(true);
        setKuwaitiMsg('🛡️ فعّلت درع الحماية! سيتم صد كرت الهجوم القادم تلقائياً.');
        setCommentType('praise');
        realtimeSync.publishToRoom(
          room.code,
          'BATTLE_CARD_USED',
          { cardId, playerId, senderName: myPlayer?.displayName || 'الخصم' },
          playerId
        );
        return;
      }

      if (oppShieldActive) {
        setOppShieldActive(false);
        sounds.playError();
        setRaceFlash({
          text: `🛡️ درع الخصم صدّ كرت «${cardDef.shortName}»!`,
          subtext: 'تم كسر درع الخصم الآن',
          isMine: false
        });
        return;
      }

      sounds.playVictory();
      let stolenAmount = 0;
      if (cardId === 'CARD_STEAL_POINTS' && opponent) {
        stolenAmount = Math.min(100, Math.max(0, opponent.score || 0));
        setRoom(cur => {
          const myP = cur.players[playerId];
          const oppP = cur.players[opponent.id];
          return {
            ...cur,
            players: {
              ...cur.players,
              ...(myP ? { [playerId]: { ...myP, score: (myP.score || 0) + stolenAmount } } : {}),
              ...(oppP ? { [opponent.id]: { ...oppP, score: Math.max(0, (oppP.score || 0) - stolenAmount) } } : {})
            }
          };
        });
      }

      if (cardDef.durationSec) {
        setOppDebuffBanner({
          label: `${cardDef.icon} الخصم متأثر بـ ${cardDef.shortName}`,
          seconds: cardDef.durationSec
        });
      }

      setRaceFlash({
        text:
          cardId === 'CARD_STEAL_POINTS'
            ? `⚡ سرقت +${stolenAmount} نقطة من الخصم!`
            : `${cardDef.icon} أصبت الخصم بـ «${cardDef.name}»!`,
        subtext: cardDef.durationSec ? `التأثير مستمر ${cardDef.durationSec} ثانية — اسبق الآن!` : 'ضربة قوية 🔥',
        isMine: true
      });
      setKuwaitiMsg(`${cardDef.icon} أرسلت كرت «${cardDef.name}» على الخصم!`);
      setCommentType('praise');

      realtimeSync.publishToRoom(
        room.code,
        'BATTLE_CARD_USED',
        {
          cardId,
          playerId,
          senderName: myPlayer?.displayName || 'الخصم',
          stolenAmount
        },
        playerId
      );
    }
  };

  const totalWords = room.wordPlacements?.length || 7;
  const myWordsList = myPlayer?.wordsFound || [];
  const oppWordsList = opponent?.wordsFound || [];
  const myWordsCount = myWordsList.length;
  const oppWordsCount = oppWordsList.length;
  const myPct = Math.round((myWordsCount / Math.max(1, totalWords)) * 100);
  const oppPct = Math.round((oppWordsCount / Math.max(1, totalWords)) * 100);

  // Helper to resolve displayWord for a normalized word
  const getDisplayWord = (raw: string) => {
    const found = room.wordPlacements?.find(wp => wp.word === raw);
    return found?.displayWord || raw;
  };

  return (
    <div className="safe-screen min-h-dvh w-full max-w-5xl mx-auto p-2.5 sm:p-5 space-y-3 overflow-y-auto" dir="rtl">
      {/* Top Multiplayer Word Race HUD */}
      <div
        className="rounded-3xl p-3.5 sm:p-4 shadow-2xl border border-sky-500/30 relative overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #0b2436 0%, #061520 100%)'
        }}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-800/80 flex-wrap gap-2">
          <button
            onClick={() => {
              sounds.playTap();
              onExit();
            }}
            className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold flex items-center gap-1 border border-slate-700/60 cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>مغادرة</span>
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-lime-400/15 border border-lime-400/30 text-lime-300 text-xs font-black">
              <Zap className="w-3.5 h-3.5 fill-lime-400 text-lime-400" />
              <span>تحدي لاعبين: اللي يصيد الكلمة أول تنحسب له • {categoryObj.name}</span>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700 text-amber-400 text-xs font-black">
              الجولة {room.roundNumber || 1}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const nextMuted = !soundMuted;
                sounds.setMuted(nextMuted);
                setSoundMuted(nextMuted);
                if (!nextMuted) {
                  sounds.playMultiplayerWordScore(2, 0);
                }
              }}
              className={`px-2.5 py-1 rounded-xl border text-[11px] font-black flex items-center gap-1 transition-all cursor-pointer ${
                soundMuted
                  ? 'bg-slate-900 border-slate-700 text-slate-400'
                  : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/25'
              }`}
              title="تفعيل أو تجربة المؤثرات الصوتية الحماسية للنقاط"
            >
              {soundMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span>{soundMuted ? 'الصوت مكتوم' : 'مؤثرات النقاط 🔊'}</span>
            </button>
            <div className="text-[11px] font-mono font-bold text-slate-400">
              غرفة #{room.code}
            </div>
          </div>
        </div>

        {/* Both Players Battle Score Cards + Captured Words List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* My Player */}
          {myPlayer && (
            <div className="p-3 rounded-2xl bg-slate-950/90 border-2 border-sky-500/50 flex flex-col gap-2 relative shadow-lg shadow-sky-950/30">
              <div className="flex items-center gap-3">
                <img
                  src={myPlayer.avatar}
                  alt={myPlayer.displayName}
                  className="w-11 h-11 rounded-full object-cover border-2 border-sky-400 shrink-0"
                />
                <div className="text-right flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-xs font-black truncate ${getNameGlowClass(currentUser?.equippedNameGlow)}`}>
                      أنت ({myPlayer.displayName})
                    </span>
                    <div className="flex items-center gap-1">
                      {myShieldActive && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300">
                          🛡️ محمي
                        </span>
                      )}
                      {(myPlayer.roundWins || 0) > 0 && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300">
                          🏆 {myPlayer.roundWins}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-200 text-xs font-black">
                      <span>صدت: {myWordsCount} كلمات</span>
                    </div>
                    <span className="text-sm font-black text-white">{myPlayer.score} نقطة</span>
                  </div>
                  {(myPlayer.streak || 0) >= 2 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-amber-400 animate-bounce mt-0.5">
                      <Flame className="w-3 h-3 fill-amber-400" />
                      <span>كومبو x{myPlayer.streak}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Captured Words Chips for Player 1 */}
              <div className="pt-1.5 border-t border-slate-800/80 flex items-center gap-1.5 flex-wrap min-h-[26px]">
                <span className="text-[10px] font-bold text-slate-400">كلماتك المصيدة:</span>
                {myWordsList.length === 0 ? (
                  <span className="text-[10px] text-slate-500">لم تصد أي كلمة بعد...</span>
                ) : (
                  myWordsList.map(w => (
                    <span
                      key={w}
                      className="px-2 py-0.5 rounded-full bg-sky-500/25 border border-sky-400 text-sky-200 text-[10px] font-black"
                    >
                      ✓ {getDisplayWord(w)}
                    </span>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Opponent Player */}
          {opponent ? (
            <div className="p-3 rounded-2xl bg-slate-950/90 border-2 border-pink-500/50 flex flex-col gap-2 relative shadow-lg shadow-pink-950/30">
              <div className="flex items-center gap-3">
                <img
                  src={opponent.avatar}
                  alt={opponent.displayName}
                  className="w-11 h-11 rounded-full object-cover border-2 border-pink-400 shrink-0"
                />
                <div className="text-right flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-black text-pink-400 truncate">
                      الخصم ({opponent.displayName})
                    </span>
                    <div className="flex items-center gap-1">
                      {oppShieldActive && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300">
                          🛡️ محمي
                        </span>
                      )}
                      {oppDebuffBanner && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/25 border border-amber-400/60 text-amber-200 animate-pulse">
                          {oppDebuffBanner.label} ({oppDebuffBanner.seconds}ث)
                        </span>
                      )}
                      {(opponent.roundWins || 0) > 0 && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300">
                          🏆 {opponent.roundWins}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-pink-500/20 border border-pink-400/40 text-pink-200 text-xs font-black">
                      <span>صاد: {oppWordsCount} كلمات</span>
                    </div>
                    <span className="text-sm font-black text-white">{opponent.score} نقطة</span>
                  </div>
                  {(opponent.streak || 0) >= 2 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-pink-400 animate-bounce mt-0.5">
                      <Flame className="w-3 h-3 fill-pink-400" />
                      <span>كومبو x{opponent.streak}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Captured Words Chips for Player 2 */}
              <div className="pt-1.5 border-t border-slate-800/80 flex items-center gap-1.5 flex-wrap min-h-[26px]">
                <span className="text-[10px] font-bold text-slate-400">كلمات الخصم:</span>
                {oppWordsList.length === 0 ? (
                  <span className="text-[10px] text-slate-500">لم يصد أي كلمة بعد...</span>
                ) : (
                  oppWordsList.map(w => (
                    <span
                      key={w}
                      className="px-2 py-0.5 rounded-full bg-pink-500/25 border border-pink-400 text-pink-200 text-[10px] font-black"
                    >
                      ✗ {getDisplayWord(w)}
                    </span>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-slate-950/60 border border-dashed border-slate-800 text-xs text-slate-500 flex items-center justify-center">
              بانتظار الخصم...
            </div>
          )}
        </div>

        {/* Live Tug-of-War Word Race Progress Bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] font-black mb-1 px-1">
            <span className="text-sky-400">رصيدك: {myWordsCount} كلمات</span>
            <span className="text-slate-300">
              متبقي في الطاولة: {Math.max(0, totalWords - foundWords.length)} من {totalWords}
            </span>
            <span className="text-pink-400">رصيد الخصم: {oppWordsCount} كلمات</span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-950 border border-slate-800 overflow-hidden flex">
            <div
              className="h-full bg-gradient-to-l from-sky-400 to-cyan-500 transition-all duration-300"
              style={{ width: `${myPct}%` }}
            />
            <div className="flex-1 bg-slate-900" />
            <div
              className="h-full bg-gradient-to-r from-pink-500 to-rose-400 transition-all duration-300"
              style={{ width: `${oppPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Live Word Snatch Flash Toast */}
      {raceFlash && (
        <div
          className={`p-3 rounded-2xl border-2 text-center shadow-lg transition-all animate-bounce ${
            raceFlash.isMine
              ? 'bg-sky-500/20 border-sky-400 text-white'
              : 'bg-pink-500/20 border-pink-400 text-white'
          }`}
        >
          <div className="text-sm font-black">{raceFlash.text}</div>
          <div className="text-xs font-bold opacity-90">{raceFlash.subtext}</div>
        </div>
      )}

      {disconnectionNotice && (
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{disconnectionNotice}</span>
        </div>
      )}

      {/* Kuwaiti Commentary / Reaction Live Feed */}
      <KuwaitiCommentary message={kuwaitiMsg} type={commentType} />

      {/* Target Word Bank with Ownership Badges & Blind-Words Card Support */}
      <WordBank
        wordPlacements={room.wordPlacements}
        foundWords={foundWords}
        playerColorMap={wordPlayerMap}
        playerNamesMap={wordPlayerNameMap}
        playerIdsMap={wordPlayerIdMap}
        currentPlayerId={playerId}
        currentPlayerName={myPlayer?.displayName}
        maskUnfoundWords={myBlindWordsSeconds > 0}
        maskedSeconds={myBlindWordsSeconds}
      />

      {/* Online Battle Action Cards Bar (كروت التأثير على الخصم والدفاع) */}
      <div
        className="rounded-2xl p-2.5 sm:p-3 border border-amber-400/45 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
        style={{
          background: 'linear-gradient(180deg, rgba(11, 32, 54, 0.94) 0%, rgba(5, 16, 28, 0.98) 100%)'
        }}
      >
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-black text-amber-300">
            <Shield className="w-4 h-4 text-amber-400" />
            <span>كروت التحدي الأونلاين:</span>
            {cardCooldown > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 font-mono text-[10px]">
                انتظار {cardCooldown}ث
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              setShowStoreModal(true);
            }}
            className="sm:hidden px-2.5 py-1 rounded-xl bg-amber-400/20 border border-amber-400/50 text-amber-200 text-[10px] font-black flex items-center gap-1"
          >
            <ShoppingBag className="w-3 h-3" />
            <span>شراء كروت</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 flex-1">
          {BATTLE_CARD_ITEMS.map(card => {
            const count = currentUser?.battleCards?.[card.id] ?? 0;
            const disabled = cardCooldown > 0;
            return (
              <button
                key={card.id}
                type="button"
                disabled={disabled}
                onClick={() => handleUseBattleCard(card.id)}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-black flex items-center gap-1.5 shrink-0 transition-all cursor-pointer active:scale-95 ${
                  count > 0
                    ? 'bg-[#0b2a44] hover:bg-[#133d60] text-white border-cyan-400/50 hover:border-amber-400'
                    : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:border-amber-400/50'
                } ${disabled ? 'opacity-55 cursor-not-allowed' : ''}`}
                title={card.description}
              >
                <span className="text-sm">{card.icon}</span>
                <span>{card.shortName}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
                    count > 0 ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-amber-300'
                  }`}
                >
                  {count > 0 ? `×${count}` : 'متجر'}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            sounds.playTap();
            setShowStoreModal(true);
          }}
          className="hidden sm:flex px-3 py-1.5 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/50 text-amber-200 text-[11px] font-black items-center gap-1 shrink-0 cursor-pointer"
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>شراء كروت</span>
        </button>
      </div>

      {/* Game Board with Live Opponent Selection Cursor & Active Battle Card Effects */}
      <div className="flex justify-center py-1">
        <GameBoard
          grid={room.grid}
          gridSize={room.gridSize}
          wordPlacements={room.wordPlacements}
          foundWords={foundWords}
          playerColorMap={wordPlayerMap}
          opponentPath={opponentPath}
          opponentColor={opponent?.color || '#ec4899'}
          opponentName={opponent?.displayName}
          onSelectionDrag={handleSelectionDrag}
          onWordSelected={handleWordSelected}
          boardThemeId={currentUser?.equippedBoardTheme}
          trailStyleId={currentUser?.equippedTrail}
          frozenSeconds={myFrozenSeconds}
          sandstormSeconds={mySandstormSeconds}
          tvMode={tvMode}
        />
      </div>

      {/* Quick Reaction Buttons (Including Unlocked Emote Packs) */}
      <div className="flex items-center justify-center gap-2 flex-wrap py-1">
        <span className="text-xs text-slate-400 font-bold ml-1">تفاعل مباشر:</span>
        {QUICK_REACTIONS.map(reaction => (
          <button
            key={reaction}
            onClick={() => sendReaction(reaction)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold border border-slate-700/80 transition-colors active:scale-95 cursor-pointer"
          >
            {reaction}
          </button>
        ))}
      </div>

      <StoreModal
        isOpen={showStoreModal}
        onClose={() => setShowStoreModal(false)}
        user={currentUser}
        onUpdateUser={onUpdateUser}
        initialTab="CARDS"
      />

      {/* Game Finished Winner Modal using Kuwait Neon Victory Screen Design */}
      {gameFinished && winnerInfo && (
        <ResultsModal
          stars={winnerInfo.id === playerId ? 3 : 2}
          timeSpent={
            room.startedAt
              ? Math.max(12, Math.round((Date.now() - room.startedAt) / 1000))
              : 45
          }
          score={
            winnerInfo.id === playerId
              ? myPlayer?.score || 0
              : opponent?.score || myPlayer?.score || 0
          }
          earnedXP={winnerInfo.id === playerId ? 300 : 120}
          earnedCoins={winnerInfo.id === playerId ? 175 : 75}
          levelNumber={room.roundNumber || 1}
          totalLevels={room.stagesCount || 50}
          wordsFoundCount={
            winnerInfo.id === playerId ? myWordsCount : oppWordsCount
          }
          totalWordsCount={totalWords}
          playerName={myPlayer?.displayName}
          winnerName={winnerInfo.name}
          isWinner={winnerInfo.id === playerId}
          categoryName={categoryObj.name}
          matchPlayers={[
            {
              name: `أنت (${myPlayer?.displayName || 'لاعب 1'})`,
              score: myPlayer?.score || 0,
              wordsCount: myWordsCount,
              color: '#38bdf8',
              roundWins: myPlayer?.roundWins || 0
            },
            ...(opponent
              ? [
                  {
                    name: `الخصم (${opponent.displayName})`,
                    score: opponent.score || 0,
                    wordsCount: oppWordsCount,
                    color: '#ec4899',
                    roundWins: opponent.roundWins || 0
                  }
                ]
              : [])
          ]}
          primaryButtonLabel={
            rematchLoading ? 'جاري التجهيز...' : 'المرحلة التالية'
          }
          primaryButtonDisabled={rematchLoading}
          homeButtonLabel="الرئيسية"
          onNextLevel={handleInstantRematch}
          onReplay={handleInstantRematch}
          onExit={onExit}
          onHome={onExit}
        />
      )}

      {tvMode && <TVRemoteHint />}
    </div>
  );
};
