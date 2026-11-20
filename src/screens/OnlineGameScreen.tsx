import React, { useState, useEffect, useCallback } from 'react';
import { OnlineRoom, PlayerProfile, BattleCardId } from '../types/game';
import {
  findCategoryById,
  BATTLE_CARD_ITEMS,
  EMOTE_PACK_ITEMS,
  getNameGlowClass,
  getRandomCategoryWords,
  getOnlineDifficultyConfig
} from '../engine/gameCategories';
import { generateWordSearchGrid, normalizeArabicWord } from '../engine/wordSearch';
import { GameBoard } from '../components/GameBoard';
import { WordBank } from '../components/WordBank';
import { KuwaitiCommentary } from '../components/KuwaitiCommentary';
import { TVRemoteHint } from '../components/TVRemoteHint';
import { StoreModal } from '../components/StoreModal';
import { ReportPlayerModal } from '../components/ReportPlayerModal';
import { isAllowedQuickReaction } from '../engine/moderation';
import { ResultsModal } from './ResultsModal';
import { ArrowRight, AlertTriangle, Zap, Flame, Volume2, VolumeX, Shield, Timer, Eye, Flag, Ban } from 'lucide-react';
import { sounds } from '../utils/audio';
import confetti from 'canvas-confetti';
import { realtimeSync } from '../services/realtimeSync';
import { apiFetch as fetch, getStoredAuthToken, saveUserToLocalMap, syncProfileWithSupabase } from '../services/supabaseClient';
import { resolveWebSocketUrl } from '../utils/iosNative';

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
  socket: initialSocket,
  currentUser,
  onUpdateUser,
  myPlayerId,
  onExit,
  tvMode
}) => {
  const [socket, setSocket] = useState<WebSocket>(initialSocket);
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
    initialRoom.gameMode === 'SPEED_REVEAL_20S'
      ? '⚡ مود التحدي الخاطف (20ث): لكل لاعب 20 ثانية يصيد كلمة، ولو خلص وقته ينكشف حرف سري عند خصمه فقط دون علمه!'
      : 'نظام لاعبين (1 ضد 1): اللي يصيد الكلمة أول تنحسب له وتنصبغ بلونه قدام الخصم! 🔥'
  );
  const [commentType, setCommentType] = useState<'praise' | 'mistake' | 'neutral'>('neutral');
  const [disconnectionNotice, setDisconnectionNotice] = useState<string | null>(null);
  const [gameFinished, setGameFinished] = useState(false);
  const [winnerInfo, setWinnerInfo] = useState<{ id?: string; name: string } | null>(null);
  const [rematchLoading, setRematchLoading] = useState(false);
  const [soundMuted, setSoundMuted] = useState(sounds.getMuted());
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ username: string; displayName: string } | null>(null);
  const [blockingOpponent, setBlockingOpponent] = useState(false);

  // SPEED_REVEAL_20S Mode State (Revealed secret letters visible ONLY to the beneficiary!)
  const [mySecretRevealedCells, setMySecretRevealedCells] = useState<
    { row: number; col: number; label?: string; word?: string }[]
  >(() => initialRoom.myRevealedCells || []);
  const [playerDeadlines, setPlayerDeadlines] = useState<Record<string, number>>(() => {
    if (initialRoom.playerDeadlines && Object.keys(initialRoom.playerDeadlines).length > 0) {
      return initialRoom.playerDeadlines;
    }
    if (initialRoom.gameMode === 'SPEED_REVEAL_20S') {
      const now = Date.now();
      return Object.fromEntries(Object.keys(initialRoom.players || {}).map(id => [id, now + 20_000]));
    }
    return {};
  });
  const [speedRemaining, setSpeedRemaining] = useState<Record<string, number>>({});

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

  // Hydrate already-claimed words when joining or reconnecting to an in-progress match
  useEffect(() => {
    const allFound: string[] = [];
    const colorMap: Record<string, string> = {};
    const nameMap: Record<string, string> = {};
    const idMap: Record<string, string> = {};

    Object.values(room.players || {}).forEach(p => {
      (p.wordsFound || []).forEach(w => {
        if (!allFound.includes(w)) allFound.push(w);
        colorMap[w] = p.color || (p.id === playerId ? '#0ea5e9' : '#ec4899');
        nameMap[w] = p.displayName;
        idMap[w] = String(p.id);
      });
    });

    if (allFound.length > 0) {
      setFoundWords(allFound);
      setWordPlayerMap(prev => ({ ...prev, ...colorMap }));
      setWordPlayerNameMap(prev => ({ ...prev, ...nameMap }));
      setWordPlayerIdMap(prev => ({ ...prev, ...idMap }));
    }
  }, [room.code]);

  const rematchFallbackTimerRef = React.useRef<number | null>(null);
  const roomRef = React.useRef<OnlineRoom>(room);
  roomRef.current = room;
  const foundWordsRef = React.useRef<string[]>(foundWords);
  foundWordsRef.current = foundWords;
  const mySecretRevealedCellsRef = React.useRef(mySecretRevealedCells);
  mySecretRevealedCellsRef.current = mySecretRevealedCells;
  const playerDeadlinesRef = React.useRef(playerDeadlines);
  playerDeadlinesRef.current = playerDeadlines;
  const isSpeedMode = room.gameMode === 'SPEED_REVEAL_20S';

  const pickLocalSecretCellForMe = useCallback(
    (curRoom: OnlineRoom, curFound: string[], curRevealed: { row: number; col: number; label?: string; word?: string }[]) => {
      const revealedSet = new Set(curRevealed.map(c => `${c.row},${c.col}`));
      const candidates: { row: number; col: number; word: string }[] = [];
      (curRoom.wordPlacements || []).forEach(wp => {
        if (curFound.includes(wp.word)) return;
        (wp.cells || []).forEach(c => {
          if (!revealedSet.has(`${c.row},${c.col}`)) {
            candidates.push({ row: c.row, col: c.col, word: wp.word });
          }
        });
      });
      if (candidates.length === 0) return null;
      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      return {
        row: picked.row,
        col: picked.col,
        label: 'حرف سري 👁️',
        word: picked.word
      };
    },
    []
  );

  const getWsAuthToken = useCallback(
    () => currentUser?.authToken || getStoredAuthToken(currentUser?.username) || undefined,
    [currentUser?.authToken, currentUser?.username]
  );

  const clearRematchTimer = useCallback(() => {
    if (rematchFallbackTimerRef.current !== null) {
      window.clearTimeout(rematchFallbackTimerRef.current);
      rematchFallbackTimerRef.current = null;
    }
  }, []);

  const buildLocalStandingsAndFinish = useCallback((cur: OnlineRoom): OnlineRoom => {
    const playersArr = Object.values(cur.players || {});
    let bestW = -1;
    let bestS = -1;
    let topStage: typeof playersArr = [];
    playersArr.forEach(p => {
      const wc = p.wordsFound?.length || 0;
      const sc = p.score || 0;
      if (wc > bestW || (wc === bestW && sc > bestS)) {
        bestW = wc;
        bestS = sc;
        topStage = [p];
      } else if (wc === bestW && sc === bestS) {
        topStage.push(p);
      }
    });

    const stageWinnerId = topStage.length === 1 ? topStage[0].id : null;
    const updatedPlayers: OnlineRoom['players'] = {};
    playersArr.forEach(p => {
      const prevWins = p.roundWins || 0;
      const nextWins = stageWinnerId && p.id === stageWinnerId ? prevWins + 1 : prevWins;
      updatedPlayers[p.id] = {
        ...p,
        totalScore: p.totalScore ?? p.score ?? 0,
        roundWins: nextWins
      };
    });

    const updatedArr = Object.values(updatedPlayers);
    let maxPts = -1;
    let ptsTop: typeof updatedArr = [];
    updatedArr.forEach(p => {
      const ts = p.totalScore ?? p.score ?? 0;
      if (ts > maxPts) {
        maxPts = ts;
        ptsTop = [p];
      } else if (ts === maxPts) {
        ptsTop.push(p);
      }
    });
    const pointsLeader = ptsTop.length === 1 ? ptsTop[0] : null;

    let maxWins = -1;
    let winsTop: typeof updatedArr = [];
    updatedArr.forEach(p => {
      const rw = p.roundWins || 0;
      if (rw > maxWins) {
        maxWins = rw;
        winsTop = [p];
      } else if (rw === maxWins) {
        winsTop.push(p);
      }
    });
    const winsLeader = winsTop.length === 1 ? winsTop[0] : null;

    const stageNumber = cur.roundNumber || 1;
    const totalStages = cur.stagesCount || 50;
    const seriesCompleted = stageNumber >= totalStages;

    let seriesWinnerId: string | null = null;
    let seriesWinnerName = '';
    if (seriesCompleted) {
      const sorted = [...updatedArr].sort((a, b) => {
        const rwDiff = (b.roundWins || 0) - (a.roundWins || 0);
        if (rwDiff !== 0) return rwDiff;
        return (b.totalScore ?? b.score ?? 0) - (a.totalScore ?? a.score ?? 0);
      });
      const first = sorted[0];
      const second = sorted[1];
      const isOverallTie =
        first &&
        second &&
        (first.roundWins || 0) === (second.roundWins || 0) &&
        (first.totalScore ?? first.score ?? 0) === (second.totalScore ?? second.score ?? 0);
      if (isOverallTie) {
        seriesWinnerId = 'DRAW';
        seriesWinnerName = 'تعادل بطولي';
      } else if (first) {
        seriesWinnerId = first.id;
        seriesWinnerName = first.displayName;
      }
    }

    const stageWinnerName = stageWinnerId
      ? updatedPlayers[stageWinnerId]?.displayName || 'الفائز'
      : 'تعادل';

    return {
      ...cur,
      state: 'FINISHED',
      winnerId: stageWinnerId || undefined,
      stageWinnerId,
      stageWinnerName,
      seriesCompleted,
      seriesWinnerId,
      seriesWinnerName,
      standings: {
        stageNumber,
        totalStages,
        stageWinnerId,
        stageWinnerName,
        pointsLeaderId: pointsLeader ? pointsLeader.id : null,
        pointsLeaderName: pointsLeader ? pointsLeader.displayName : 'تعادل',
        winsLeaderId: winsLeader ? winsLeader.id : null,
        winsLeaderName: winsLeader ? winsLeader.displayName : 'تعادل',
        seriesCompleted,
        seriesWinnerId,
        seriesWinnerName
      },
      players: updatedPlayers
    };
  }, []);

  const applyRematchStarted = useCallback(
    (newRoom: OnlineRoom, initiatedBy?: string, roundNumber?: number) => {
      const currentMaxStages = roomRef.current.stagesCount || 50;
      const incomingMaxStages = newRoom.stagesCount || currentMaxStages;
      const effectiveMaxStages = Math.min(currentMaxStages, incomingMaxStages);
      const targetRound = roundNumber || newRoom.roundNumber || 2;
      if (roomRef.current.seriesCompleted || targetRound > effectiveMaxStages) {
        clearRematchTimer();
        setRematchLoading(false);
        setGameFinished(true);
        return;
      }

      clearRematchTimer();
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
      setMySecretRevealedCells(newRoom.myRevealedCells || []);
      if (newRoom.gameMode === 'SPEED_REVEAL_20S') {
        const now = Date.now();
        setPlayerDeadlines(
          newRoom.playerDeadlines && Object.keys(newRoom.playerDeadlines).length > 0
            ? newRoom.playerDeadlines
            : Object.fromEntries(Object.keys(newRoom.players || {}).map(id => [id, now + 20_000]))
        );
      } else {
        setPlayerDeadlines({});
      }
      setCommentType('praise');
      const rNum = roundNumber || newRoom.roundNumber || 2;
      const totalSt = newRoom.stagesCount || 50;
      setKuwaitiMsg(
        `🔄 بدأ ${initiatedBy || 'المنافس'} المرحلة ${rNum} من ${totalSt} في تصنيف «${categoryObj.name}»! اللي يصيد الكلمة أول تنحسب له 🔥`
      );
    },
    [clearRematchTimer, categoryObj.name]
  );

  useEffect(() => {
    return () => clearRematchTimer();
  }, [clearRematchTimer]);

  // Keep gameFinished and series completion synced if state FINISHED/seriesCompleted arrives via reconnect, REST, or fallback
  useEffect(() => {
    const maxStages = room.stagesCount || 50;
    const curRound = room.roundNumber || 1;
    if ((room.state === 'FINISHED' || room.seriesCompleted || curRound > maxStages) && !gameFinished) {
      setGameFinished(true);
      setRematchLoading(false);
      setWinnerInfo(prev =>
        prev || {
          id: room.stageWinnerId || room.winnerId || undefined,
          name: room.stageWinnerName || 'تعادل'
        }
      );
    }
  }, [
    room.state,
    room.seriesCompleted,
    room.roundNumber,
    room.stagesCount,
    room.stageWinnerId,
    room.winnerId,
    room.stageWinnerName,
    gameFinished
  ]);

  // Send ROOM_REJOIN on mount (or when socket opens) and automatically recreate WebSocket if connection drops
  useEffect(() => {
    let isUnmounted = false;
    let reconnectTimer: number | null = null;

    const sendRejoin = () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: 'ROOM_REJOIN',
            payload: {
              code: room.code,
              playerId,
              username: currentUser?.username,
              authToken: getWsAuthToken()
            }
          })
        );
      }
    };

    const ensureLiveSocket = () => {
      if (isUnmounted) return;
      if (socket.readyState === WebSocket.OPEN) {
        sendRejoin();
      } else if (
        socket.readyState === WebSocket.CLOSED ||
        socket.readyState === WebSocket.CLOSING
      ) {
        try {
          const freshWs = new WebSocket(resolveWebSocketUrl());
          setSocket(freshWs);
        } catch {
          // fallback to REST sync
        }
      }
    };

    const handleSocketClose = () => {
      if (isUnmounted) return;
      reconnectTimer = window.setTimeout(() => {
        ensureLiveSocket();
      }, 900);
    };

    if (socket.readyState === WebSocket.OPEN) {
      sendRejoin();
    } else if (socket.readyState === WebSocket.CONNECTING) {
      socket.addEventListener('open', sendRejoin, { once: true });
    } else {
      ensureLiveSocket();
    }

    socket.addEventListener('close', handleSocketClose);

    const handleResumeOrOnline = () => {
      sounds.resumeIfNeeded();
      ensureLiveSocket();
      fetch(`/api/rooms/${encodeURIComponent(room.code)}`)
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (data?.success && data.room) {
            setRoom(data.room);
            if (data.room.playerDeadlines) {
              setPlayerDeadlines(data.room.playerDeadlines);
            }
          }
        })
        .catch(() => {});
    };

    window.addEventListener('fatteshha:app-resumed', handleResumeOrOnline);
    window.addEventListener('online', handleResumeOrOnline);

    return () => {
      isUnmounted = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      socket.removeEventListener('open', sendRejoin);
      socket.removeEventListener('close', handleSocketClose);
      window.removeEventListener('fatteshha:app-resumed', handleResumeOrOnline);
      window.removeEventListener('online', handleResumeOrOnline);
    };
  }, [socket, room.code, playerId, currentUser?.username, getWsAuthToken]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        const { type, payload } = data;

        if (type === 'OPPONENT_CURSOR') {
          setOpponentPath(payload.cells || []);
        } else if (type === 'ROOM_REJOINED' && payload?.room) {
          setRoom(payload.room);
          if (payload.room.playerDeadlines) {
            setPlayerDeadlines(payload.room.playerDeadlines);
          }
          if (Array.isArray(payload.room.myRevealedCells)) {
            setMySecretRevealedCells(payload.room.myRevealedCells);
          }
          setDisconnectionNotice(null);
        } else if (type === 'GAME_STARTED' && payload?.room) {
          setRoom(payload.room);
          if (payload.room.playerDeadlines) {
            setPlayerDeadlines(payload.room.playerDeadlines);
          }
          if (Array.isArray(payload.room.myRevealedCells)) {
            setMySecretRevealedCells(payload.room.myRevealedCells);
          }
          setDisconnectionNotice(null);
        } else if (type === 'PLAYER_RECONNECTED') {
          if (payload?.room) setRoom(payload.room);
          setDisconnectionNotice(null);
          setKuwaitiMsg(`✅ عاد اللاعب «${payload?.playerName || 'المنافس'}» إلى المباراة!`);
        } else if (type === 'WORD_CLAIMED') {
          const {
            word,
            displayWord,
            playerId: claimerId,
            playerColor,
            playerName,
            wordScore,
            streak,
            cells: claimedCells,
            room: updatedRoom
          } = payload;
          const isClaimedByMe = String(claimerId) === String(playerId);
          const resolvedColor = playerColor || (isClaimedByMe ? '#0ea5e9' : '#ec4899');
          const resolvedName =
            playerName ||
            updatedRoom?.players?.[claimerId]?.displayName ||
            (isClaimedByMe ? myPlayer?.displayName || 'أنت' : opponent?.displayName || 'الخصم');

          const mergedRoom = updatedRoom
            ? {
                ...updatedRoom,
                wordPlacements: (updatedRoom.wordPlacements || []).map((wp: any) => {
                  if (
                    Array.isArray(claimedCells) &&
                    claimedCells.length >= 2 &&
                    (wp.word === word || normalizeArabicWord(wp.word) === normalizeArabicWord(word))
                  ) {
                    return { ...wp, cells: claimedCells };
                  }
                  return wp;
                })
              }
            : updatedRoom;

          setRoom(mergedRoom);
          if (updatedRoom?.playerDeadlines) {
            setPlayerDeadlines(updatedRoom.playerDeadlines);
          }
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
          const { chatItem } = payload || {};
          if (!chatItem || !isAllowedQuickReaction(chatItem.text)) return;
          const blockedList = (currentUser?.blockedUsers || []).map(u => u.toLowerCase());
          const senderUname = String(chatItem.senderUsername || payload?.senderUsername || '').toLowerCase();
          if (senderUname && blockedList.includes(senderUname)) return;
          setKuwaitiMsg(`💬 ${chatItem.sender}: ${chatItem.text}`);
          setCommentType('neutral');
        } else if (type === 'PLAYER_DISCONNECTED') {
          setDisconnectionNotice(`انقطع اتصال اللاعب ${payload.playerName}. بانتظار عودته...`);
        } else if (type === 'GAME_FINISHED') {
          const { room: finalRoom, winnerId, winnerName, seriesCompleted, seriesWinnerId } = payload;
          setRoom(finalRoom);
          setOpponentPath([]);
          setGameFinished(true);
          setRematchLoading(false);
          setWinnerInfo({ id: winnerId, name: winnerName });

          const didWinCelebration = seriesCompleted
            ? seriesWinnerId === playerId
            : winnerId === playerId;
          if (didWinCelebration) {
            sounds.playVictory();
            try {
              confetti({ particleCount: 140, spread: 85, origin: { y: 0.6 } });
            } catch {
              // Ignore
            }
          } else {
            sounds.playTap();
          }
        } else if (type === 'GAME_REMATCH_STARTED') {
          const { room: newRoom, initiatedBy, roundNumber } = payload || {};
          if (newRoom) {
            applyRematchStarted(newRoom, initiatedBy, roundNumber);
          } else {
            clearRematchTimer();
            setRematchLoading(false);
          }
        } else if (type === 'SECRET_LETTER_REVEALED') {
          // Only received by the opponent who benefited when the other player ran out of 20s!
          if (payload?.playerDeadlines) {
            setPlayerDeadlines(payload.playerDeadlines);
          }
          if (payload?.cell) {
            setMySecretRevealedCells(prev => {
              const exists = prev.some(c => c.row === payload.cell.row && c.col === payload.cell.col);
              return exists ? prev : [...prev, payload.cell];
            });
          }
          sounds.playHint();
          const timedOutName = payload?.timedOutPlayerName || opponent?.displayName || 'الخصم';
          setKuwaitiMsg(
            `👁️ انتهى وقت «${timedOutName}» (20ث) دون إجابة! انكشف لك حرف سري في الجدول لا يدري عنه!`
          );
          setCommentType('praise');
          setRaceFlash({
            text: `👁️ كسبت حرفاً سرياً!`,
            subtext: `انتهى وقت «${timedOutName}» (20ث) — الحرف ظاهر لك فقط!`,
            isMine: true
          });
        } else if (type === 'SPEED_TURN_TIMEOUT') {
          // Received ONLY by the player whose 20s expired — NEVER contains the secret cell!
          if (payload?.playerDeadlines) {
            setPlayerDeadlines(payload.playerDeadlines);
          } else if (payload?.newDeadline) {
            setPlayerDeadlines(prev => ({ ...prev, [playerId]: payload.newDeadline }));
          }
          sounds.playError();
          setKuwaitiMsg('⏰ انتهت الـ 20 ثانية ولم تصد كلمة! انكشف حرف سري عند خصمك فقط دون علمك!');
          setCommentType('mistake');
          setRaceFlash({
            text: '⏰ انتهى وقتك (20 ثانية)!',
            subtext: 'تم كشف حرف من الكلمات المطلوبة عند خصمك دون علمك — أسرع الآن!',
            isMine: false
          });
        } else if (type === 'ERROR') {
          if (payload?.code === 'SERIES_COMPLETED') {
            clearRematchTimer();
            setRematchLoading(false);
            if (payload?.room) {
              setRoom(payload.room);
            }
            setGameFinished(true);
            sounds.playTap();
            if (payload?.message) {
              setKuwaitiMsg(`🏆 ${payload.message}`);
              setCommentType('praise');
            }
            return;
          }
          if (rematchFallbackTimerRef.current !== null) {
            clearRematchTimer();
            triggerRematchFallback();
          } else {
            setRematchLoading(false);
            if (payload?.message) {
              setKuwaitiMsg(`⚠️ ${payload.message}`);
              setCommentType('mistake');
            }
          }
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
  }, [socket, playerId, categoryObj.name, applyRematchStarted, clearRematchTimer]);

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

  // SPEED_REVEAL_20S: Live 20s countdown display & REST / Offline fallback sync
  useEffect(() => {
    if (!isSpeedMode || gameFinished) return;

    const updateRemaining = () => {
      const now = Date.now();
      const deadlines = playerDeadlinesRef.current;
      const nextRem: Record<string, number> = {};
      Object.keys(roomRef.current.players || {}).forEach(pid => {
        const dl = deadlines[pid] || now + 20_000;
        nextRem[pid] = Math.max(0, Math.min(20, Math.ceil((dl - now) / 1000)));
      });
      setSpeedRemaining(nextRem);
    };
    updateRemaining();
    const uiInterval = setInterval(updateRemaining, 500);

    // When WebSocket is not open, sync with authoritative REST /api/rooms/speed-sync or static MQTT fallback
    const syncInterval = setInterval(async () => {
      if (socket.readyState === WebSocket.OPEN) return;
      const curRoom = roomRef.current;
      try {
        const res = await fetch('/api/rooms/speed-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: curRoom.code,
            playerId,
            username: currentUser?.username
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.success) {
            const prevMyDeadline = playerDeadlinesRef.current[playerId];
            const nextMyDeadline = data.playerDeadlines?.[playerId];
            if (
              prevMyDeadline &&
              nextMyDeadline &&
              nextMyDeadline > prevMyDeadline + 1000 &&
              Date.now() >= prevMyDeadline - 500
            ) {
              sounds.playError();
              setKuwaitiMsg('⏰ انتهت الـ 20 ثانية ولم تصد كلمة! انكشف حرف سري عند خصمك فقط دون علمك!');
              setCommentType('mistake');
              setRaceFlash({
                text: '⏰ انتهى وقتك (20 ثانية)!',
                subtext: 'تم كشف حرف من الكلمات المطلوبة عند خصمك دون علمك!',
                isMine: false
              });
            }
            if (data.playerDeadlines) {
              setPlayerDeadlines(data.playerDeadlines);
            }
            if (Array.isArray(data.myRevealedCells)) {
              setMySecretRevealedCells(prev => {
                if (data.myRevealedCells.length > prev.length) {
                  sounds.playHint();
                  setKuwaitiMsg('👁️ انتهى وقت خصمك (20ث)! انكشف لك حرف سري في الجدول لا يدري عنه!');
                  setCommentType('praise');
                  setRaceFlash({
                    text: '👁️ كسبت حرفاً سرياً!',
                    subtext: 'انتهى وقت خصمك (20ث) — الحرف ظاهر لك فقط!',
                    isMine: true
                  });
                }
                return data.myRevealedCells;
              });
            }
            return;
          }
        }
      } catch {
        // Static offline / Netlify fallback below
      }

      const now = Date.now();
      const myDl = playerDeadlinesRef.current[playerId];
      if (myDl && now >= myDl) {
        const nextDl = now + 20_000;
        setPlayerDeadlines(prev => ({ ...prev, [playerId]: nextDl }));
        sounds.playError();
        setKuwaitiMsg('⏰ انتهت الـ 20 ثانية ولم تصد كلمة! انكشف حرف سري عند خصمك فقط دون علمك!');
        setCommentType('mistake');
        setRaceFlash({
          text: '⏰ انتهى وقتك (20 ثانية)!',
          subtext: 'تم كشف حرف من الكلمات المطلوبة عند خصمك دون علمك!',
          isMine: false
        });
        realtimeSync.publishToRoom(
          curRoom.code,
          'SPEED_TIMEOUT_PENALTY',
          { timedOutPlayerId: playerId, timedOutPlayerName: myPlayer?.displayName || 'المنافس', newDeadline: nextDl },
          playerId
        );
      }

      // Offline bot opponent timeout -> reveal a secret cell for me
      const rivalBot = Object.values(curRoom.players || {}).find(p => p.id !== playerId && p.id.startsWith('bot_'));
      if (rivalBot) {
        const botDl = playerDeadlinesRef.current[rivalBot.id];
        if (botDl && now >= botDl) {
          setPlayerDeadlines(prev => ({ ...prev, [rivalBot.id]: now + 20_000 }));
          const cell = pickLocalSecretCellForMe(curRoom, foundWordsRef.current, mySecretRevealedCellsRef.current);
          if (cell) {
            setMySecretRevealedCells(prev => [...prev, cell]);
            sounds.playHint();
            setKuwaitiMsg(`👁️ انتهى وقت «${rivalBot.displayName}» (20ث)! انكشف لك حرف سري في الجدول!`);
            setCommentType('praise');
            setRaceFlash({
              text: '👁️ كسبت حرفاً سرياً!',
              subtext: `انتهى وقت «${rivalBot.displayName}» — الحرف ظاهر لك فقط!`,
              isMine: true
            });
          }
        }
      }
    }, 1500);

    return () => {
      clearInterval(uiInterval);
      clearInterval(syncInterval);
    };
  }, [isSpeedMode, gameFinished, socket, playerId, currentUser?.username, myPlayer?.displayName, pickLocalSecretCellForMe]);

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
  const handleWordSelected = (word: string, selectedCells?: { row: number; col: number }[]) => {
    if (foundWords.includes(word)) {
      sounds.playError();
      const ownerName = wordPlayerNameMap[word] || 'لاعب';
      setKuwaitiMsg(`هذه الكلمة صادها «${ownerName}» وانحسبت له! اسبق على الكلمات الباقية ⚡`);
      setCommentType('mistake');
      return;
    }

    if (socket.readyState === WebSocket.OPEN) {
      if (selectedCells && selectedCells.length >= 2) {
        setRoom(prev => ({
          ...prev,
          wordPlacements: (prev.wordPlacements || []).map(wp =>
            wp.word === word || normalizeArabicWord(wp.word) === normalizeArabicWord(word)
              ? { ...wp, cells: selectedCells }
              : wp
          )
        }));
      }
      socket.send(
        JSON.stringify({
          type: 'WORD_FOUND',
          payload: {
            code: room.code,
            word,
            playerId,
            username: currentUser?.username,
            authToken: currentUser?.authToken,
            cells: selectedCells
          }
        })
      );
    } else {
      // Verify word claim through authoritative server endpoint first
      (async () => {
        try {
          const res = await fetch('/api/rooms/claim-word', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: room.code,
              word,
              playerId,
              username: currentUser?.username,
              cells: selectedCells
            })
          });
          const data = await res.json();
          if (res.ok && data?.success && data.room) {
            const dataRoom = data.room;
            const claimedCells = Array.isArray(data.cells) && data.cells.length >= 2 ? data.cells : selectedCells;
            const mergedDataRoom = {
              ...dataRoom,
              wordPlacements: (dataRoom.wordPlacements || []).map((wp: any) => {
                if (
                  Array.isArray(claimedCells) &&
                  claimedCells.length >= 2 &&
                  (wp.word === word || normalizeArabicWord(wp.word) === normalizeArabicWord(word))
                ) {
                  return { ...wp, cells: claimedCells };
                }
                return wp;
              })
            };
            setRoom(mergedDataRoom);
            if (data.room.playerDeadlines) {
              setPlayerDeadlines(data.room.playerDeadlines);
            }
            realtimeSync.publishToRoom(
              room.code,
              'WORD_FOUND',
              {
                word: data.word || word,
                playerId,
                playerName: myPlayer?.displayName || 'أنت',
                playerColor: myPlayer?.color || (room.hostId === playerId ? '#0ea5e9' : '#ec4899'),
                displayWord: data.displayWord || word,
                wordScore: data.wordScore,
                signature: data.signature,
                cells: claimedCells
              },
              playerId
            );
            return;
          }
        } catch {
          // Offline / static host fallback below
        }

        const placement = room.wordPlacements?.find(p => p.word === word);
        if (!placement) return;
        const displayWord = placement?.displayWord || word;
        const pts = 150;
        const myColor = myPlayer?.color || (room.hostId === playerId ? '#0ea5e9' : '#ec4899');
        const myName = myPlayer?.displayName || 'أنت';
        sounds.playMultiplayerWordScore(1, 0);

        if (isSpeedMode) {
          setPlayerDeadlines(prev => ({ ...prev, [playerId]: Date.now() + 20_000 }));
        }

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
            cells: selectedCells
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
          const currentFound = myP?.wordsFound || [];
          if (currentFound.includes(word)) return prev;
          const nextScore = (myP?.score || 0) + pts;
          const nextTotalScore = (myP?.totalScore ?? myP?.score ?? 0) + pts;
          const nextFound = [...currentFound, word];

          const nextRoom: OnlineRoom = {
            ...prev,
            wordPlacements: (prev.wordPlacements || []).map(wp =>
              (wp.word === word || normalizeArabicWord(wp.word) === normalizeArabicWord(word)) &&
              selectedCells &&
              selectedCells.length >= 2
                ? { ...wp, cells: selectedCells }
                : wp
            ),
            players: {
              ...prev.players,
              [playerId]: {
                ...myP,
                score: nextScore,
                totalScore: nextTotalScore,
                wordsFound: nextFound
              }
            }
          };

          const totalWordCount = prev.wordPlacements?.length || 7;
          const oppCount = nextRoom.players[opponent?.id || '']?.wordsFound?.length || 0;
          if (nextFound.length + oppCount >= totalWordCount) {
            const finalized = buildLocalStandingsAndFinish(nextRoom);
            void realtimeSync.saveCloudRoomSnapshot(finalized);
            setTimeout(() => {
              setGameFinished(true);
              setWinnerInfo({
                id: finalized.stageWinnerId || undefined,
                name: finalized.stageWinnerName || 'تعادل'
              });
              const celebWin = finalized.seriesCompleted
                ? finalized.seriesWinnerId === playerId
                : finalized.stageWinnerId === playerId;
              if (celebWin) {
                sounds.playVictory();
                try {
                  confetti({ particleCount: 140, spread: 85, origin: { y: 0.6 } });
                } catch {
                  // Ignore
                }
              }
            }, 800);
            return finalized;
          }

          void realtimeSync.saveCloudRoomSnapshot(nextRoom);
          return nextRoom;
        });
      })();
    }
  };

  // Real-time listener for word discoveries by human opponent across the internet (verified by server or board placements)
  useEffect(() => {
    void realtimeSync.subscribeToRoom(room.code, (msg) => {
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
          wordScore: payloadWordScore,
          signature: payloadSignature,
          pts: payloadRawPts,
          cells: payloadCells
        } = payload || {};

        // Never trust unverified MQTT WORD_FOUND or client-supplied pts when server is active:
        // Verify with /api/rooms/verify-mqtt-message before applying any score change
        (async () => {
          let verifiedPts = Number(payloadWordScore) || 150;
          try {
            const verifyRes = await fetch('/api/rooms/verify-mqtt-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: room.code,
                type: 'WORD_CLAIMED',
                word,
                playerId: finderId || senderId,
                wordScore: payloadWordScore,
                signature: payloadSignature,
                pts: payloadRawPts
              })
            });
            const contentType = verifyRes.headers.get('content-type') || '';
            if (verifyRes.status === 404 || !contentType.includes('application/json')) {
              throw new Error('Static host fallback');
            }
            const verifyData = await verifyRes.json();
            if (verifyData?.reason === 'ROOM_NOT_FOUND') {
              throw new Error('Room hosted in cloud snapshot');
            }
            if (!verifyRes.ok || !verifyData?.valid) {
              // Reject forged/unverified message!
              return;
            }
            if (verifyData.room) {
              setRoom(verifyData.room);
            }
          } catch {
            // Static host / Vercel fallback: validate word exists in active board and finder is a room member
            if (payloadRawPts !== undefined) return;
            const curRoom = roomRef.current;
            const validPlacement = curRoom.wordPlacements?.some(
              wp => wp.word === word || normalizeArabicWord(wp.word) === normalizeArabicWord(word)
            );
            const validMember = Boolean(
              curRoom.players[finderId || senderId] || Object.keys(curRoom.players || {}).length >= 2
            );
            if (!validPlacement || !validMember) return;
          }

          const curPlayers = roomRef.current.players || room.players;
          const finder =
            curPlayers[finderId] ||
            Object.values(curPlayers).find(p => String(p.id) !== String(playerId));
          const resolvedFinderId = String(finder?.id || finderId || 'opponent');
          const finderColor = finder?.color || payloadFinderColor || '#ec4899';
          const finderName = finder?.displayName || payloadFinderName || 'الخصم';

          setFoundWords(f => (f.includes(word) ? f : [...f, word]));
          setWordPlayerMap(m => ({ ...m, [word]: finderColor }));
          setWordPlayerNameMap(m => ({ ...m, [word]: finderName }));
          setWordPlayerIdMap(m => ({ ...m, [word]: resolvedFinderId }));
          if (roomRef.current.gameMode === 'SPEED_REVEAL_20S') {
            setPlayerDeadlines(prev => ({ ...prev, [resolvedFinderId]: Date.now() + 20_000 }));
          }
          sounds.playOpponentFound(1);
          setKuwaitiMsg(
            `الخصم «${finderName}» صاد كلمة «${dw || word}» قبلك وانحسبت له (+${verifiedPts} نقطة)! اسبق على الكلمات المتبقية ⚡`
          );
          setCommentType('mistake');
          setRaceFlash({
            text: `🚨 الخصم «${finderName}» صاد «${dw || word}» قبلك!`,
            subtext: `انحسبت للخصم (+${verifiedPts} نقطة) • اسبق على الكلمات المتبقية`,
            isMine: false
          });

          setRoom(cur => {
            const targetKey = cur.players[resolvedFinderId]
              ? resolvedFinderId
              : Object.keys(cur.players).find(k => String(k) !== String(playerId)) || resolvedFinderId;
            const finderP = cur.players[targetKey];
            const prevWords = finderP?.wordsFound || [];
            const alreadyHad = prevWords.includes(word);
            const nextScore = alreadyHad ? finderP?.score || 0 : (finderP?.score || 0) + verifiedPts;
            const nextTotalScore = alreadyHad
              ? finderP?.totalScore ?? finderP?.score ?? 0
              : (finderP?.totalScore ?? finderP?.score ?? 0) + verifiedPts;
            const nextFound = alreadyHad ? prevWords : [...prevWords, word];
            const updated: OnlineRoom = {
              ...cur,
              wordPlacements: (cur.wordPlacements || []).map(wp =>
                (wp.word === word || normalizeArabicWord(wp.word) === normalizeArabicWord(word)) &&
                Array.isArray(payloadCells) &&
                payloadCells.length >= 2
                  ? { ...wp, cells: payloadCells }
                  : wp
              ),
              players: {
                ...cur.players,
                [targetKey]: {
                  ...finderP,
                  id: targetKey,
                  displayName: finderP?.displayName || finderName,
                  color: finderP?.color || finderColor,
                  score: nextScore,
                  totalScore: nextTotalScore,
                  wordsFound: nextFound
                }
              }
            };

            const totalW = cur.wordPlacements?.length || 7;
            const myCount = cur.players[playerId]?.wordsFound?.length || 0;
            if (myCount + nextFound.length >= totalW && cur.state !== 'FINISHED') {
              const finalized = buildLocalStandingsAndFinish(updated);
              setTimeout(() => {
                setGameFinished(true);
                setWinnerInfo({
                  id: finalized.stageWinnerId || undefined,
                  name: finalized.stageWinnerName || 'تعادل'
                });
                const celebWin = finalized.seriesCompleted
                  ? finalized.seriesWinnerId === playerId
                  : finalized.stageWinnerId === playerId;
                if (celebWin) {
                  sounds.playVictory();
                  try {
                    confetti({ particleCount: 140, spread: 85, origin: { y: 0.6 } });
                  } catch {
                    // Ignore
                  }
                }
              }, 800);
              return finalized;
            }
            return updated;
          });
        })();
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
                  ...(myP
                    ? {
                        [playerId]: {
                          ...myP,
                          score: Math.max(0, (myP.score || 0) - actual),
                          totalScore: Math.max(0, (myP.totalScore ?? myP.score ?? 0) - actual)
                        }
                      }
                    : {}),
                  ...(oppKey && oppP
                    ? {
                        [oppKey]: {
                          ...oppP,
                          score: (oppP.score || 0) + actual,
                          totalScore: (oppP.totalScore ?? oppP.score ?? 0) + actual
                        }
                      }
                    : {})
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
      } else if (type === 'SPEED_TIMEOUT_PENALTY') {
        const timedOutId = String(payload?.timedOutPlayerId || senderId || '');
        if (!timedOutId || timedOutId === String(playerId)) return;
        const nextDl = Number(payload?.newDeadline) || Date.now() + 20_000;
        setPlayerDeadlines(prev => ({ ...prev, [timedOutId]: nextDl }));
        const cell = pickLocalSecretCellForMe(
          roomRef.current,
          foundWordsRef.current,
          mySecretRevealedCellsRef.current
        );
        if (cell) {
          setMySecretRevealedCells(prev => {
            const exists = prev.some(c => c.row === cell.row && c.col === cell.col);
            return exists ? prev : [...prev, cell];
          });
          sounds.playHint();
          const tName = payload?.timedOutPlayerName || opponent?.displayName || 'الخصم';
          setKuwaitiMsg(`👁️ انتهى وقت «${tName}» (20ث)! انكشف لك حرف سري في الجدول لا يدري عنه!`);
          setCommentType('praise');
          setRaceFlash({
            text: '👁️ كسبت حرفاً سرياً!',
            subtext: `انتهى وقت «${tName}» (20ث) — الحرف ظاهر لك فقط!`,
            isMine: true
          });
        }
      } else if (type === 'GAME_REMATCH_STARTED' && payload?.room) {
        const incomingRoom: OnlineRoom = payload.room;
        const senderIsMember = Boolean(
          roomRef.current.players?.[String(senderId)] ||
            roomRef.current.players?.[String(payload?.initiatedById || '')]
        );
        const maxStages = Math.min(
          roomRef.current.stagesCount || 50,
          incomingRoom.stagesCount || roomRef.current.stagesCount || 50
        );
        const currentRound = roomRef.current.roundNumber || 1;
        const nextRound = incomingRoom.roundNumber || 1;
        if (
          senderIsMember &&
          incomingRoom.code === room.code &&
          !roomRef.current.seriesCompleted &&
          currentRound < maxStages &&
          nextRound <= maxStages &&
          nextRound > currentRound
        ) {
          applyRematchStarted(incomingRoom, payload.initiatedBy, payload.roundNumber);
        }
      }
    });
  }, [room.code, playerId, myPlayer, room.players, myShieldActive, gameFinished, applyRematchStarted, pickLocalSecretCellForMe, opponent?.displayName]);

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
          const nextTotalScore = (rivalP?.totalScore ?? rivalP?.score ?? 0) + 150;
          const nextFound = [...(rivalP?.wordsFound || []), target.word];
          const updated: OnlineRoom = {
            ...cur,
            players: {
              ...cur.players,
              [rivalBot.id]: {
                ...rivalP,
                score: nextScore,
                totalScore: nextTotalScore,
                wordsFound: nextFound
              }
            }
          };
          const totalW = cur.wordPlacements?.length || 7;
          const myCount = cur.players[playerId]?.wordsFound?.length || 0;
          if (myCount + nextFound.length >= totalW) {
            const finalized = buildLocalStandingsAndFinish(updated);
            setTimeout(() => {
              setGameFinished(true);
              setWinnerInfo({
                id: finalized.stageWinnerId || undefined,
                name: finalized.stageWinnerName || 'تعادل'
              });
              const celebWin = finalized.seriesCompleted
                ? finalized.seriesWinnerId === playerId
                : finalized.stageWinnerId === playerId;
              if (celebWin) {
                sounds.playVictory();
                try {
                  confetti({ particleCount: 140, spread: 85, origin: { y: 0.6 } });
                } catch {
                  // Ignore
                }
              }
            }, 800);
            return finalized;
          }
          return updated;
        });
      }, 1200);
    }, 11000);

    return () => clearInterval(timer);
  }, [socket, playerId, gameFinished, foundWords, room.wordPlacements, room.players]);

  // Fallback rematch executor via REST API (/api/rooms/rematch) or MQTT/local static host board generator
  const triggerRematchFallback = useCallback(async () => {
    const activeRoom = roomRef.current;
    const initiatorName = myPlayer?.displayName || currentUser?.displayName || 'أنت';
    const expectedCurrentRound = activeRoom.roundNumber || 1;
    const maxStages = activeRoom.stagesCount || 50;

    if (activeRoom.seriesCompleted || expectedCurrentRound >= maxStages) {
      clearRematchTimer();
      setRematchLoading(false);
      setGameFinished(true);
      setKuwaitiMsg(`🏆 انتهت جميع المراحل المختارة (${maxStages}) وتم إعلان الفائز النهائي!`);
      return;
    }

    try {
      const res = await fetch('/api/rooms/rematch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: activeRoom.code,
          playerId,
          username: currentUser?.username,
          currentRoundNumber: expectedCurrentRound
        })
      });

      if (res.status === 401 || res.status === 403) {
        const errData = await res.json().catch(() => ({}));
        setRematchLoading(false);
        sounds.playError();
        setKuwaitiMsg(`⚠️ ${errData?.message || 'يرجى تسجيل الدخول للمتابعة إلى المرحلة التالية'}`);
        setCommentType('mistake');
        return;
      }

      if (res.status === 400) {
        const errData = await res.json().catch(() => ({}));
        if (errData?.code === 'SERIES_COMPLETED' || errData?.seriesCompleted) {
          clearRematchTimer();
          setRematchLoading(false);
          if (errData?.room) setRoom(errData.room);
          setGameFinished(true);
          setKuwaitiMsg(`🏆 ${errData?.message || `انتهت جميع المراحل المختارة (${maxStages})!`}`);
          return;
        }
      }

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.success && data.room) {
          const respRound = data.room.roundNumber || 1;
          const respMaxStages = data.room.stagesCount || maxStages;
          if (respRound > respMaxStages) {
            clearRematchTimer();
            setRematchLoading(false);
            setGameFinished(true);
            return;
          }
          realtimeSync.publishToRoom(
            activeRoom.code,
            'GAME_REMATCH_STARTED',
            {
              room: data.room,
              initiatedBy: data.initiatedBy || initiatorName,
              initiatedById: playerId,
              roundNumber: data.roundNumber || respRound
            },
            playerId
          );
          applyRematchStarted(data.room, data.initiatedBy || initiatorName, data.roundNumber);
          return;
        }
      }
    } catch {
      // Static / unreachable backend: fall back to client-generated board & MQTT sync below
    }

    // Re-check latest room ref AFTER network call to prevent racing past maxStages or double-incrementing roundNumber
    const latestRoom = roomRef.current;
    const latestMaxStages = latestRoom.stagesCount || maxStages;
    const nextRoundNumber = expectedCurrentRound + 1;
    if (
      latestRoom.seriesCompleted ||
      (latestRoom.roundNumber || 1) >= latestMaxStages ||
      (latestRoom.roundNumber || 1) > expectedCurrentRound ||
      nextRoundNumber > latestMaxStages
    ) {
      clearRematchTimer();
      setRematchLoading(false);
      if (latestRoom.seriesCompleted || (latestRoom.roundNumber || 1) >= latestMaxStages) {
        setGameFinished(true);
      }
      return;
    }

    // Static hosting (e.g. Vercel/Netlify) or room expired after server restart: build fresh round & sync peer
    const diffCfg = getOnlineDifficultyConfig(latestRoom.difficulty);
    const prevUsed = Array.from(new Set([...(latestRoom.usedWords || []), ...(latestRoom.words || [])]));
    const nextWords = getRandomCategoryWords(latestRoom.categoryId, diffCfg.wordCount, prevUsed);
    const freshBoard = generateWordSearchGrid(nextWords, diffCfg.gridSize, diffCfg.allowedDirections);
    const resetPlayers: OnlineRoom['players'] = {};
    Object.entries(latestRoom.players || {}).forEach(([pid, p]) => {
      resetPlayers[pid] = {
        ...p,
        totalScore: p.totalScore ?? p.score ?? 0,
        score: 0,
        wordsFound: [],
        streak: 0
      };
    });

    const nowMs = Date.now();
    const nextRoom: OnlineRoom = {
      ...latestRoom,
      roundNumber: nextRoundNumber,
      usedWords: [...prevUsed, ...nextWords],
      state: 'PLAYING',
      startedAt: nowMs,
      winnerId: undefined,
      stageWinnerId: undefined,
      stageWinnerName: undefined,
      seriesCompleted: false,
      seriesWinnerId: undefined,
      seriesWinnerName: undefined,
      standings: undefined,
      speedTurnSeconds: activeRoom.gameMode === 'SPEED_REVEAL_20S' ? 20 : activeRoom.speedTurnSeconds,
      playerDeadlines:
        activeRoom.gameMode === 'SPEED_REVEAL_20S'
          ? Object.fromEntries(Object.keys(resetPlayers).map(pid => [pid, nowMs + 20_000]))
          : undefined,
      myRevealedCells: [],
      grid: freshBoard.grid,
      gridSize: freshBoard.gridSize,
      words: nextWords,
      wordPlacements: freshBoard.wordPlacements,
      players: resetPlayers
    };

    realtimeSync.publishToRoom(
      activeRoom.code,
      'GAME_REMATCH_STARTED',
      {
        room: nextRoom,
        initiatedBy: initiatorName,
        initiatedById: playerId,
        roundNumber: nextRoundNumber
      },
      playerId
    );
    applyRematchStarted(nextRoom, initiatorName, nextRoundNumber);
  }, [applyRematchStarted, clearRematchTimer, currentUser?.displayName, currentUser?.username, myPlayer?.displayName, playerId]);

  // One-Click Rematch without changing category (WS primary + instant REST/MQTT fallback so it never hangs)
  const handleInstantRematch = () => {
    const curRound = roomRef.current.roundNumber || 1;
    const maxStages = roomRef.current.stagesCount || 50;
    if (roomRef.current.seriesCompleted || curRound >= maxStages) {
      onExit();
      return;
    }
    if (rematchLoading) return;
    sounds.playTap();
    setRematchLoading(true);
    clearRematchTimer();

    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(
          JSON.stringify({
            type: 'ROOM_REMATCH',
            payload: {
              code: room.code,
              playerId,
              username: currentUser?.username,
              currentRoundNumber: curRound,
              authToken: getWsAuthToken()
            }
          })
        );
        rematchFallbackTimerRef.current = window.setTimeout(() => {
          rematchFallbackTimerRef.current = null;
          triggerRematchFallback();
        }, 900);
        return;
      } catch {
        // Immediate fallback below
      }
    }

    triggerRematchFallback();
  };

  // Send quick reaction
  const sendReaction = (text: string) => {
    if (!isAllowedQuickReaction(text)) return;
    sounds.playTap();
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'CHAT_MESSAGE',
          payload: {
            code: room.code,
            sender: myPlayer?.displayName || currentUser?.displayName || 'لاعب',
            senderUsername: currentUser?.username || myPlayer?.username,
            text
          }
        })
      );
    }
  };

  const handleBlockOpponent = async () => {
    if (!opponent?.username || !currentUser?.username || blockingOpponent) return;
    sounds.playTap();
    setBlockingOpponent(true);
    try {
      const res = await fetch('/api/moderation/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUser.username,
          targetUsername: opponent.username
        })
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        sounds.playVictory();
        if (data.user && onUpdateUser) {
          onUpdateUser(data.user);
        }
        setKuwaitiMsg(`🚫 تم حظر «${opponent.displayName}» ولن يظهر لك في الغرف أو التفاعلات لاحقاً`);
        setCommentType('neutral');
      } else {
        sounds.playError();
      }
    } catch {
      sounds.playError();
    } finally {
      setBlockingOpponent(false);
    }
  };

  // Trigger an Online Battle Card (free for all players; only subject to 4s cooldown)
  const handleUseBattleCard = (cardId: BattleCardId) => {
    if (gameFinished || cardCooldown > 0) return;
    const cardDef = BATTLE_CARD_ITEMS.find(c => c.id === cardId);
    if (!cardDef) return;

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
              ...(myP
                ? {
                    [playerId]: {
                      ...myP,
                      score: (myP.score || 0) + stolenAmount,
                      totalScore: (myP.totalScore ?? myP.score ?? 0) + stolenAmount
                    }
                  }
                : {}),
              ...(oppP
                ? {
                    [opponent.id]: {
                      ...oppP,
                      score: Math.max(0, (oppP.score || 0) - stolenAmount),
                      totalScore: Math.max(0, (oppP.totalScore ?? oppP.score ?? 0) - stolenAmount)
                    }
                  }
                : {})
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
            {isSpeedMode ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400/15 border border-amber-400/45 text-amber-200 text-xs font-black">
                <Timer className="w-3.5 h-3.5 text-amber-300" />
                <span>التحدي الخاطف (20ث): تأخرك يكشف حرفاً عند خصمك فقط • {categoryObj.name}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-lime-400/15 border border-lime-400/30 text-lime-300 text-xs font-black">
                <Zap className="w-3.5 h-3.5 fill-lime-400 text-lime-400" />
                <span>تحدي لاعبين: اللي يصيد الكلمة أول تنحسب له • {categoryObj.name}</span>
              </span>
            )}
            <span className="px-3 py-1 rounded-full bg-slate-900 border border-amber-400/50 text-amber-300 text-xs font-black">
              المرحلة {room.roundNumber || 1} من {room.stagesCount || 50}
            </span>
            <span
              className={`px-2.5 py-1 rounded-full border text-xs font-black ${
                room.difficulty === 'EASY'
                  ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300'
                  : room.difficulty === 'HARD'
                  ? 'bg-rose-500/15 border-rose-400/50 text-rose-300'
                  : 'bg-cyan-500/15 border-cyan-400/50 text-cyan-300'
              }`}
            >
              الصعوبة: {getOnlineDifficultyConfig(room.difficulty).label}
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
                      {isSpeedMode && !gameFinished && (
                        <span
                          className={`text-[10px] font-black font-mono px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                            (speedRemaining[playerId] ?? 20) <= 5
                              ? 'bg-rose-500/25 border-rose-400 text-rose-200 animate-pulse'
                              : (speedRemaining[playerId] ?? 20) <= 10
                              ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                              : 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200'
                          }`}
                          title="وقتك لصيد كلمة قبل انكشاف حرف سري عند الخصم"
                        >
                          <Timer className="w-3 h-3" />
                          <span>{speedRemaining[playerId] ?? 20}ث</span>
                        </span>
                      )}
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
                  <div className="flex items-center justify-between mt-1 gap-1.5 flex-wrap">
                    <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-200 text-xs font-black">
                      <span>صدت: {myWordsCount} كلمات</span>
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-black text-white">{myPlayer.score} نقطة</span>
                      {(room.roundNumber || 1) > 1 && (
                        <span className="block text-[10px] font-bold text-cyan-300">
                          إجمالي: {myPlayer.totalScore ?? myPlayer.score}
                        </span>
                      )}
                    </div>
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
                      {currentUser?.username && opponent.username && !opponent.id.startsWith('bot_') && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              sounds.playTap();
                              setReportTarget({
                                username: opponent.username,
                                displayName: opponent.displayName
                              });
                            }}
                            className="p-1 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-800 cursor-pointer"
                            title="الإبلاغ عن اللاعب"
                          >
                            <Flag className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={blockingOpponent}
                            onClick={handleBlockOpponent}
                            className="p-1 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-800 cursor-pointer disabled:opacity-50"
                            title="حظر اللاعب"
                          >
                            <Ban className="w-3 h-3" />
                          </button>
                        </>
                      )}
                      {isSpeedMode && !gameFinished && (
                        <span
                          className={`text-[10px] font-black font-mono px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                            (speedRemaining[opponent.id] ?? 20) <= 5
                              ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 animate-pulse'
                              : 'bg-pink-500/15 border-pink-400/50 text-pink-200'
                          }`}
                          title="وقت الخصم قبل أن ينكشف لك حرف سري"
                        >
                          <Timer className="w-3 h-3" />
                          <span>{speedRemaining[opponent.id] ?? 20}ث</span>
                        </span>
                      )}
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
                  <div className="flex items-center justify-between mt-1 gap-1.5 flex-wrap">
                    <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-pink-500/20 border border-pink-400/40 text-pink-200 text-xs font-black">
                      <span>صاد: {oppWordsCount} كلمات</span>
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-black text-white">{opponent.score} نقطة</span>
                      {(room.roundNumber || 1) > 1 && (
                        <span className="block text-[10px] font-bold text-pink-300">
                          إجمالي: {opponent.totalScore ?? opponent.score}
                        </span>
                      )}
                    </div>
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

      {/* Online Battle Action Cards Bar (كروت التأثير على الخصم والدفاع - مجانية للجميع) */}
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
          <span className="sm:hidden px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/45 text-emerald-300 text-[10px] font-black">
            مفتوحة مجاناً ⚡
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 flex-1">
          {BATTLE_CARD_ITEMS.map(card => {
            const disabled = cardCooldown > 0;
            return (
              <button
                key={card.id}
                type="button"
                disabled={disabled}
                onClick={() => handleUseBattleCard(card.id)}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-black flex items-center gap-1.5 shrink-0 transition-all cursor-pointer active:scale-95 bg-[#0b2a44] hover:bg-[#133d60] text-white border-cyan-400/50 hover:border-amber-400 ${
                  disabled ? 'opacity-55 cursor-not-allowed' : ''
                }`}
                title={card.description}
              >
                <span className="text-sm">{card.icon}</span>
                <span>{card.shortName}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-400/20 text-emerald-300 border border-emerald-400/40">
                  مجاني
                </span>
              </button>
            );
          })}
        </div>

        <span className="hidden sm:flex px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/45 text-emerald-300 text-[11px] font-black items-center gap-1 shrink-0">
          مفتوحة مجاناً ⚡
        </span>
      </div>

      {/* Secret Revealed Letters Notice (visible exclusively to this player) */}
      {isSpeedMode &&
        mySecretRevealedCells.filter(c => !c.word || !foundWords.includes(c.word)).length > 0 && (
          <div className="px-3.5 py-2 rounded-2xl bg-amber-500/15 border border-amber-400/50 text-amber-200 text-xs font-black flex items-center justify-center gap-2 text-center shadow">
            <Eye className="w-4 h-4 text-amber-300 shrink-0" />
            <span>
              تم كشف{' '}
              {mySecretRevealedCells.filter(c => !c.word || !foundWords.includes(c.word)).length}{' '}
              حرف سري لك على اللوحة من تأخر خصمك (مخفي تماماً عن الخصم!)
            </span>
          </div>
        )}

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
          revealedCells={
            isSpeedMode
              ? mySecretRevealedCells.filter(c => !c.word || !foundWords.includes(c.word))
              : undefined
          }
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

      {reportTarget && (
        <ReportPlayerModal
          isOpen={true}
          onClose={() => setReportTarget(null)}
          currentUser={currentUser}
          targetUsername={reportTarget.username}
          targetDisplayName={reportTarget.displayName}
          roomCode={room.code}
          context="ONLINE_GAME"
          onReported={(updatedUser) => {
            if (updatedUser && onUpdateUser) {
              onUpdateUser(updatedUser);
            }
          }}
        />
      )}

      {/* Game Finished Winner Modal: Stage Result + Cumulative Standings + Final Champion */}
      {gameFinished && winnerInfo && (() => {
        const currentRound = room.roundNumber || 1;
        const totalStages = room.stagesCount || 50;
        const isSeriesCompleted = Boolean(room.seriesCompleted || currentRound >= totalStages);

        const myStageScore = myPlayer?.score || 0;
        const oppStageScore = opponent?.score || 0;
        const myTotalScore = myPlayer?.totalScore ?? myStageScore;
        const oppTotalScore = opponent?.totalScore ?? oppStageScore;
        const myWins = myPlayer?.roundWins || 0;
        const oppWins = opponent?.roundWins || 0;

        const stageWinnerIdResolved =
          room.stageWinnerId !== undefined ? room.stageWinnerId : winnerInfo.id || null;
        const stageWinnerNameResolved =
          room.stageWinnerName || winnerInfo.name || 'تعادل';
        const isStageTie = !stageWinnerIdResolved || stageWinnerNameResolved === 'تعادل';

        const winsLeaderText = !opponent
          ? `🏆 الفوز: ${myPlayer?.displayName || 'أنت'} (${myWins})`
          : myWins > oppWins
          ? `🏆 المتقدم بالفوز: أنت (${myWins} مقابل ${oppWins})`
          : oppWins > myWins
          ? `🏆 المتقدم بالفوز: ${opponent.displayName} (${oppWins} مقابل ${myWins})`
          : `🤝 تعادل في عدد الفوز (${myWins} - ${oppWins})`;

        const pointsLeaderText = !opponent
          ? `⚡ النقاط: ${myTotalScore}`
          : myTotalScore > oppTotalScore
          ? `⚡ المتقدم بالنقاط: أنت (${myTotalScore} مقابل ${oppTotalScore})`
          : oppTotalScore > myTotalScore
          ? `⚡ المتقدم بالنقاط: ${opponent.displayName} (${oppTotalScore} مقابل ${myTotalScore})`
          : `🤝 تعادل في مجموع النقاط (${myTotalScore} - ${oppTotalScore})`;

        let resolvedSeriesWinnerId = room.seriesWinnerId ?? null;
        let resolvedSeriesWinnerName = room.seriesWinnerName || '';
        if (isSeriesCompleted && !resolvedSeriesWinnerId) {
          if (!opponent) {
            resolvedSeriesWinnerId = playerId;
            resolvedSeriesWinnerName = myPlayer?.displayName || 'أنت';
          } else if (myWins !== oppWins) {
            resolvedSeriesWinnerId = myWins > oppWins ? playerId : opponent.id;
            resolvedSeriesWinnerName = myWins > oppWins ? myPlayer?.displayName || 'أنت' : opponent.displayName;
          } else if (myTotalScore !== oppTotalScore) {
            resolvedSeriesWinnerId = myTotalScore > oppTotalScore ? playerId : opponent.id;
            resolvedSeriesWinnerName = myTotalScore > oppTotalScore ? myPlayer?.displayName || 'أنت' : opponent.displayName;
          } else {
            resolvedSeriesWinnerId = 'DRAW';
            resolvedSeriesWinnerName = 'تعادل بطولي';
          }
        }

        const isMeSeriesWinner = isSeriesCompleted && resolvedSeriesWinnerId === playerId;
        const isMeStageWinner = stageWinnerIdResolved === playerId;

        const playerWinsSummary = [
          {
            name: `أنت (${myPlayer?.displayName || 'لاعب 1'})`,
            wins: myWins,
            color: '#38bdf8'
          },
          ...(opponent
            ? [
                {
                  name: `الخصم (${opponent.displayName})`,
                  wins: oppWins,
                  color: '#ec4899'
                }
              ]
            : [])
        ];

        return (
          <ResultsModal
            stars={isSeriesCompleted ? (isMeSeriesWinner ? 3 : 2) : isMeStageWinner ? 3 : 2}
            timeSpent={
              room.startedAt
                ? Math.max(12, Math.round((Date.now() - room.startedAt) / 1000))
                : 45
            }
            score={
              isSeriesCompleted
                ? Math.max(myTotalScore, oppTotalScore)
                : isMeStageWinner
                ? myStageScore
                : oppStageScore || myStageScore
            }
            earnedXP={isSeriesCompleted ? (isMeSeriesWinner ? 600 : 250) : isMeStageWinner ? 300 : 120}
            earnedCoins={isSeriesCompleted ? (isMeSeriesWinner ? 350 : 150) : isMeStageWinner ? 175 : 75}
            levelNumber={currentRound}
            totalLevels={totalStages}
            wordsFoundCount={isMeStageWinner ? myWordsCount : oppWordsCount}
            totalWordsCount={totalWords}
            playerName={myPlayer?.displayName}
            winnerName={stageWinnerNameResolved}
            isWinner={isMeStageWinner}
            isSeriesCompleted={isSeriesCompleted}
            isSeriesWinner={isMeSeriesWinner}
            seriesWinnerName={resolvedSeriesWinnerName}
            stageSummary={{
              stageNumber: currentRound,
              totalStages,
              stageWinnerName: stageWinnerNameResolved,
              isStageTie,
              pointsLeaderText,
              winsLeaderText,
              playerWinsSummary
            }}
            categoryName={categoryObj.name}
            matchPlayers={[
              {
                name: `أنت (${myPlayer?.displayName || 'لاعب 1'})`,
                score: myStageScore,
                totalScore: myTotalScore,
                wordsCount: myWordsCount,
                color: '#38bdf8',
                roundWins: myWins,
                isStageWinner: isMeStageWinner,
                isSeriesWinner: isMeSeriesWinner
              },
              ...(opponent
                ? [
                    {
                      name: `الخصم (${opponent.displayName})`,
                      score: oppStageScore,
                      totalScore: oppTotalScore,
                      wordsCount: oppWordsCount,
                      color: '#ec4899',
                      roundWins: oppWins,
                      isStageWinner: stageWinnerIdResolved === opponent.id,
                      isSeriesWinner: isSeriesCompleted && resolvedSeriesWinnerId === opponent.id
                    }
                  ]
                : [])
            ]}
            primaryButtonLabel={
              isSeriesCompleted
                ? 'العودة لصالة الأونلاين'
                : rematchLoading
                ? 'جاري التجهيز...'
                : `المرحلة التالية (${currentRound + 1} من ${totalStages})`
            }
            primaryButtonDisabled={!isSeriesCompleted && rematchLoading}
            hideReplayButton={true}
            homeButtonLabel="الرئيسية"
            onNextLevel={isSeriesCompleted ? onExit : handleInstantRematch}
            onReplay={isSeriesCompleted ? onExit : handleInstantRematch}
            onExit={onExit}
            onHome={onExit}
          />
        );
      })()}

      {tvMode && <TVRemoteHint />}
    </div>
  );
};
