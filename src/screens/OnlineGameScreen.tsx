import React, { useState, useEffect, useCallback } from 'react';
import { OnlineRoom, PlayerProfile } from '../types/game';
import { CATEGORIES } from '../engine/gameCategories';
import { GameBoard } from '../components/GameBoard';
import { WordBank } from '../components/WordBank';
import { KuwaitiCommentary } from '../components/KuwaitiCommentary';
import { TVRemoteHint } from '../components/TVRemoteHint';
import { ResultsModal } from './ResultsModal';
import { ArrowRight, AlertTriangle, Zap, Flame, Volume2, VolumeX } from 'lucide-react';
import { sounds } from '../utils/audio';
import confetti from 'canvas-confetti';
import { realtimeSync } from '../services/realtimeSync';

interface OnlineGameScreenProps {
  initialRoom: OnlineRoom;
  socket: WebSocket;
  currentUser: PlayerProfile | null;
  myPlayerId?: string;
  onExit: () => void;
  tvMode: boolean;
}

export const OnlineGameScreen: React.FC<OnlineGameScreenProps> = ({
  initialRoom,
  socket,
  currentUser,
  myPlayerId,
  onExit,
  tvMode
}) => {
  const [room, setRoom] = useState<OnlineRoom>(initialRoom);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [wordPlayerMap, setWordPlayerMap] = useState<Record<string, string>>({});
  const [wordPlayerNameMap, setWordPlayerNameMap] = useState<Record<string, string>>({});
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

  const QUICK_REACTIONS = [
    'صدتها قبلك! ⚡',
    'كفووو! 🔥',
    'يا وحش! 🦅',
    'شد حيلك! 💪',
    'ريماتش؟ 🔄'
  ];

  const playerId =
    myPlayerId ||
    sessionStorage.getItem('fatteshha_online_tab_id') ||
    currentUser?.id ||
    `guest_${Date.now()}`;
  const categoryObj = CATEGORIES.find(c => c.id === room.categoryId) || CATEGORIES[0];
  const playersList = Object.values(room.players);
  const myPlayer = room.players[playerId] || playersList[0];
  const opponent = playersList.find(p => p.id !== myPlayer?.id) || playersList[1];

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
          setRoom(updatedRoom);
          setOpponentPath([]);

          setFoundWords(prev => (prev.includes(word) ? prev : [...prev, word]));
          setWordPlayerMap(prev => ({ ...prev, [word]: playerColor }));
          setWordPlayerNameMap(prev => ({ ...prev, [word]: playerName }));

          const shownWord = displayWord || word;
          const pts = wordScore || 150;

          // Detect if this word catch flipped the match lead
          const updatedPlayers = Object.values(updatedRoom.players || {}) as Array<{
            id: string;
            score: number;
          }>;
          const claimerUpdated = updatedPlayers.find(p => p.id === claimerId);
          const rivalUpdated = updatedPlayers.find(p => p.id !== claimerId);
          const prevClaimerScore = (claimerUpdated?.score || pts) - pts;
          const rivalScore = rivalUpdated?.score || 0;
          const tookLead =
            rivalScore > 0 &&
            prevClaimerScore <= rivalScore &&
            (claimerUpdated?.score || 0) > rivalScore;

          if (claimerId === playerId) {
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
              `الخصم ${playerName} صاد كلمة «${shownWord}» قبلك وانحسبت له (+${pts} نقطة)${leadTxt}! ⚡`
            );
            setCommentType('mistake');
            setRaceFlash({
              text: `🚨 ${playerName} صاد «${shownWord}» قبلك!`,
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
          setOpponentPath([]);
          setRaceFlash(null);
          setGameFinished(false);
          setWinnerInfo(null);
          setRematchLoading(false);
          setDisconnectionNotice(null);
          setCommentType('praise');
          setKuwaitiMsg(
            `🔄 بدأ ${initiatedBy} ريماتش فوري (الجولة ${roundNumber}) في تصنيف «${categoryObj.name}»! اللي يصيد الكلمة أول تنحسب له 🔥`
          );
        }
      } catch (err) {
        console.error('Online game message error:', err);
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket, playerId, categoryObj.name]);

  // Clear flash banner after 2.2 seconds
  useEffect(() => {
    if (!raceFlash) return;
    const timer = setTimeout(() => setRaceFlash(null), 2200);
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
      // Local / Netlify static fallback: claim word directly in client state
      const placement = room.wordPlacements?.find(p => p.word === word);
      const displayWord = placement?.displayWord || word;
      const pts = 150;
      sounds.playMultiplayerWordScore(1, 0);

      // Publish word discovery over real-time cloud relay to the opponent
      realtimeSync.publishToRoom(
        room.code,
        'WORD_FOUND',
        { word, playerId, displayWord, pts },
        playerId
      );

      setFoundWords(prev => (prev.includes(word) ? prev : [...prev, word]));
      setWordPlayerMap(prev => ({ ...prev, [word]: myPlayer?.color || '#0ea5e9' }));
      setWordPlayerNameMap(prev => ({ ...prev, [word]: myPlayer?.displayName || 'أنت' }));

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
      if (senderId === playerId) return;

      if (type === 'WORD_FOUND') {
        const { word, playerId: finderId, displayWord: dw, pts } = payload;
        const finder = room.players[finderId];
        const finderColor = finder?.color || '#ec4899';
        const finderName = finder?.displayName || 'الخصم';

        setFoundWords(f => (f.includes(word) ? f : [...f, word]));
        setWordPlayerMap(m => ({ ...m, [word]: finderColor }));
        setWordPlayerNameMap(m => ({ ...m, [word]: finderName }));
        sounds.playError();
        setRaceFlash({
          text: `خصمك «${finderName}» صاد كلمة «${dw}»!`,
          subtext: `اسبق على الكلمات المتبقية`,
          isMine: false
        });

        setRoom(cur => {
          const finderP = cur.players[finderId];
          const nextScore = (finderP?.score || 0) + (pts || 150);
          const nextFound = [...(finderP?.wordsFound || []), word];
          const updated = {
            ...cur,
            players: {
              ...cur.players,
              [finderId]: {
                ...finderP,
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
              const winner = myFinal >= nextScore ? myPlayer : finder;
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
      }
    });
  }, [room.code, playerId, myPlayer, room.players]);

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
                    <span className="text-xs font-black text-sky-400 truncate">
                      أنت ({myPlayer.displayName})
                    </span>
                    {(myPlayer.roundWins || 0) > 0 && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300">
                        🏆 {myPlayer.roundWins}
                      </span>
                    )}
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
                    {(opponent.roundWins || 0) > 0 && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300">
                        🏆 {opponent.roundWins}
                      </span>
                    )}
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

      {/* Target Word Bank with Ownership Badges */}
      <WordBank
        wordPlacements={room.wordPlacements}
        foundWords={foundWords}
        playerColorMap={wordPlayerMap}
        playerNamesMap={wordPlayerNameMap}
        currentPlayerName={myPlayer?.displayName}
      />

      {/* Game Board with Live Opponent Selection Cursor */}
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
          tvMode={tvMode}
        />
      </div>

      {/* Quick Reaction Buttons */}
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
