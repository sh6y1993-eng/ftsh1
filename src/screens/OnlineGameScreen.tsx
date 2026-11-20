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
import {
  realtimeSync,
  normalizeRoomWordOwnership,
  mergeCloudAndLocalRooms,
  resolveCanonicalPlacementWord,
  ONLINE_PLAYER_COLORS
} from '../services/realtimeSync';
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
  const [opponentCursors, setOpponentCursors] = useState<
    Record<string, { cells: { row: number; col: number }[]; expiresAt: number }>
  >({});
  const [raceFlash, setRaceFlash] = useState<{
    text: string;
    subtext: string;
    isMine: boolean;
  } | null>(null);
  const initialPlayerCount = Math.max(
    2,
    Object.keys(initialRoom.players || {}).length,
    Number(initialRoom.maxPlayers) || 2
  );
  const [kuwaitiMsg, setKuwaitiMsg] = useState(
    initialRoom.gameMode === 'SPEED_REVEAL_20S'
      ? '⚡ مود التحدي الخاطف (20ث): لكل لاعب 20 ثانية يصيد كلمة، ولو خلص وقته ينكشف حرف سري عند منافسيه دون علمه!'
      : `نظام سباق ${initialPlayerCount} لاعبين: اللي يصيد الكلمة أول تنحسب له وتنصبغ بلونه قدام الجميع! 🔥`
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
  const [oppShields, setOppShields] = useState<Record<string, boolean>>({});
  const [oppDebuffs, setOppDebuffs] = useState<Record<string, { label: string; seconds: number }>>({});
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
  const opponents = playersList.filter(p => String(p.id) !== String(playerId));
  const opponent = opponents[0];
  const getPlayerSeatColor = useCallback(
    (pid: string, explicitColor?: string): string => {
      if (explicitColor) return explicitColor;
      const p = room.players?.[pid];
      if (p?.color) return p.color;
      const idx = playersList.findIndex(pl => String(pl.id) === String(pid));
      return ONLINE_PLAYER_COLORS[(idx >= 0 ? idx : 0) % ONLINE_PLAYER_COLORS.length];
    },
    [room.players, playersList]
  );

  // Keep foundWords and single-owner player maps continuously synchronized with authoritative room state
  useEffect(() => {
    const normalized = normalizeRoomWordOwnership(room);
    const claims = normalized.claimedWords || {};
    const allFound: string[] = [];
    const colorMap: Record<string, string> = {};
    const nameMap: Record<string, string> = {};
    const idMap: Record<string, string> = {};

    Object.values(claims).forEach(claim => {
      if (!claim || !claim.word) return;
      if (!allFound.includes(claim.word)) {
        allFound.push(claim.word);
      }
      const ownerP = normalized.players?.[claim.playerId];
      colorMap[claim.word] =
        claim.playerColor ||
        ownerP?.color ||
        (String(claim.playerId) === String(playerId) ? '#0ea5e9' : '#ec4899');
      nameMap[claim.word] = claim.playerName || ownerP?.displayName || 'لاعب';
      idMap[claim.word] = String(claim.playerId);
    });

    setFoundWords(allFound);
    setWordPlayerMap(colorMap);
    setWordPlayerNameMap(nameMap);
    setWordPlayerIdMap(idMap);
  }, [room, playerId]);

  const rematchFallbackTimerRef = React.useRef<number | null>(null);
  const roomRef = React.useRef<OnlineRoom>(room);
  roomRef.current = room;
  const foundWordsRef = React.useRef<string[]>(foundWords);
  foundWordsRef.current = foundWords;
  const wordPlayerNameMapRef = React.useRef<Record<string, string>>(wordPlayerNameMap);
  wordPlayerNameMapRef.current = wordPlayerNameMap;
  const wordPlayerIdMapRef = React.useRef<Record<string, string>>(wordPlayerIdMap);
  wordPlayerIdMapRef.current = wordPlayerIdMap;
  const inFlightWordsRef = React.useRef<Set<string>>(new Set());
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
      inFlightWordsRef.current.clear();
      sounds.playVictory();
      setRoom(normalizeRoomWordOwnership({ ...newRoom, claimedWords: newRoom.claimedWords || {} }));
      setFoundWords([]);
      setWordPlayerMap({});
      setWordPlayerNameMap({});
      setWordPlayerIdMap({});
      setOpponentCursors({});
      setRaceFlash(null);
      setGameFinished(false);
      setWinnerInfo(null);
      setRematchLoading(false);
      setDisconnectionNotice(null);
      setMyFrozenSeconds(0);
      setMySandstormSeconds(0);
      setMyBlindWordsSeconds(0);
      setMyShieldActive(false);
      setOppShields({});
      setOppDebuffs({});
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

    const reconcileFromCloudAndServer = async (notifyCaughtWhileAway = false) => {
      if (isUnmounted) return;
      // 1. Try authoritative Express server first if connected/available
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(room.code)}`);
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (data?.success && data.room) {
            const normServer = normalizeRoomWordOwnership(data.room);
            setRoom(normServer);
            if (normServer.playerDeadlines) {
              setPlayerDeadlines(normServer.playerDeadlines);
            }
            return;
          }
        }
      } catch {
        // Static / Vercel host fallback below
      }

      // 2. Reconcile from Supabase Cloud Room Snapshot store (critical when player returns to Safari on ftsh1.vercel.app)
      const cloudSnap = await realtimeSync.fetchCloudRoomSnapshot(room.code);
      if (!cloudSnap || isUnmounted) return;

      const curRoom = roomRef.current;
      const curRound = Number(curRoom.roundNumber) || 1;
      const snapRound = Number(cloudSnap.roundNumber) || 1;

      if (snapRound > curRound && cloudSnap.state === 'PLAYING') {
        applyRematchStarted(cloudSnap, undefined, snapRound);
        return;
      }

      if (snapRound === curRound) {
        const prevClaimedSet = new Set(Object.keys(normalizeRoomWordOwnership(curRoom).claimedWords || {}));
        const merged = mergeCloudAndLocalRooms(curRoom, cloudSnap);
        const mergedClaims = merged.claimedWords || {};
        const newlyCaughtByOpponent = Object.values(mergedClaims).filter(
          c => !prevClaimedSet.has(c.word) && String(c.playerId) !== String(playerId)
        );

        let nextRoomState = merged;
        const totalWordCount = merged.wordPlacements?.length || 7;
        if (Object.keys(mergedClaims).length >= totalWordCount && merged.state !== 'FINISHED') {
          nextRoomState = buildLocalStandingsAndFinish(merged);
        }

        if (
          newlyCaughtByOpponent.length > 0 ||
          Object.keys(mergedClaims).length !== prevClaimedSet.size ||
          nextRoomState.state !== curRoom.state
        ) {
          setRoom(nextRoomState);
          if (notifyCaughtWhileAway && newlyCaughtByOpponent.length > 0) {
            const lastCatch = newlyCaughtByOpponent[newlyCaughtByOpponent.length - 1];
            const shown = lastCatch.displayWord || lastCatch.word;
            setKuwaitiMsg(
              `⚡ الخصم «${lastCatch.playerName || 'المنافس'}» صاد كلمة «${shown}» أثناء خروجك وانحسبت له! اسبق على الكلمات المتبقية 🔥`
            );
            setCommentType('mistake');
          }
        }
      }
    };

    const handleResumeOrOnline = () => {
      sounds.resumeIfNeeded();
      ensureLiveSocket();
      void realtimeSync.reconnectRoomChannel(room.code).then(() => {
        void realtimeSync.publishToRoom(
          room.code,
          'REQUEST_ROOM_SYNC',
          { requesterId: playerId },
          playerId
        );
      });
      void reconcileFromCloudAndServer(true);
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        handleResumeOrOnline();
      }
    };

    window.addEventListener('fatteshha:app-resumed', handleResumeOrOnline);
    window.addEventListener('online', handleResumeOrOnline);
    window.addEventListener('focus', handleResumeOrOnline);
    window.addEventListener('pageshow', handleResumeOrOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Continuous 1.8s background cloud snapshot reconciliation so missed mobile packets self-heal automatically
    const cloudPollTimer = window.setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        void reconcileFromCloudAndServer(false);
      }
    }, 1800);

    return () => {
      isUnmounted = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      window.clearInterval(cloudPollTimer);
      socket.removeEventListener('open', sendRejoin);
      socket.removeEventListener('close', handleSocketClose);
      window.removeEventListener('fatteshha:app-resumed', handleResumeOrOnline);
      window.removeEventListener('online', handleResumeOrOnline);
      window.removeEventListener('focus', handleResumeOrOnline);
      window.removeEventListener('pageshow', handleResumeOrOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [socket, room.code, playerId, currentUser?.username, getWsAuthToken, applyRematchStarted, buildLocalStandingsAndFinish]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        const { type, payload } = data;

        if (type === 'OPPONENT_CURSOR') {
          const cursorPid = String(payload?.playerId || opponent?.id || 'opponent');
          const cells = Array.isArray(payload?.cells) ? payload.cells : [];
          setOpponentCursors(prev => {
            if (cells.length === 0) {
              if (!prev[cursorPid]) return prev;
              const copy = { ...prev };
              delete copy[cursorPid];
              return copy;
            }
            return {
              ...prev,
              [cursorPid]: { cells, expiresAt: Date.now() + 2600 }
            };
          });
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
          setOpponentCursors(prev => {
            const cKey = String(claimerId);
            if (!prev[cKey]) return prev;
            const copy = { ...prev };
            delete copy[cKey];
            return copy;
          });

          setFoundWords(prev => (prev.includes(word) ? prev : [...prev, word]));
          setWordPlayerMap(prev => ({ ...prev, [word]: resolvedColor }));
          setWordPlayerNameMap(prev => ({ ...prev, [word]: resolvedName }));
          setWordPlayerIdMap(prev => ({ ...prev, [word]: String(claimerId) }));

          const shownWord = displayWord || word;
          const pts = wordScore || 150;

          // Detect if this word catch flipped the match lead across all 2-4 players
          const updatedPlayers = Object.values(updatedRoom.players || {}) as Array<{
            id: string;
            score: number;
          }>;
          const claimerUpdated = updatedPlayers.find(p => String(p.id) === String(claimerId));
          const prevClaimerScore = (claimerUpdated?.score || pts) - pts;
          const maxOtherScore = Math.max(
            0,
            ...updatedPlayers
              .filter(p => String(p.id) !== String(claimerId))
              .map(p => p.score || 0)
          );
          const tookLead =
            maxOtherScore > 0 &&
            prevClaimerScore <= maxOtherScore &&
            (claimerUpdated?.score || 0) > maxOtherScore;

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
          if (payload?.room) {
            setRoom(normalizeRoomWordOwnership(payload.room));
          }
          sounds.playError();
          const claimer = payload?.claimedByName || 'الخصم';
          setKuwaitiMsg(`صادها «${claimer}» قبلك وانحسبت له! دوّر كلمة ثانية ⚡`);
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
          setOpponentCursors({});
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
            targetIds,
            blockedByIds,
            targetName,
            blockedByShield,
            stolenAmount,
            room: updatedRoom
          } = payload || {};
          if (updatedRoom) {
            setRoom(updatedRoom);
          }

          const cardDef = BATTLE_CARD_ITEMS.find(c => c.id === cardId);
          const isSenderMe = String(senderId) === String(playerId);
          const resolvedTargetIds: string[] = Array.isArray(targetIds)
            ? targetIds.map(String)
            : targetId
            ? [String(targetId)]
            : [];
          const resolvedBlockedIds: string[] = Array.isArray(blockedByIds)
            ? blockedByIds.map(String)
            : blockedByShield && targetId
            ? [String(targetId)]
            : [];
          const isTargetMe = resolvedTargetIds.includes(String(playerId));
          const isBlockedByMe = resolvedBlockedIds.includes(String(playerId));

          if (cardId === 'CARD_SHIELD') {
            sounds.playHint();
            if (isSenderMe) {
              setMyShieldActive(true);
              setKuwaitiMsg('🛡️ فعّلت درع الحماية! سيتم صد كرت الهجوم القادم من خصومك تلقائياً.');
              setCommentType('praise');
            } else {
              setOppShields(prev => ({ ...prev, [String(senderId)]: true }));
              setKuwaitiMsg(`🛡️ اللاعب «${senderName}» فعّل درع الحماية ضد الهجمات!`);
              setCommentType('neutral');
            }
            return;
          }

          if (resolvedBlockedIds.length > 0) {
            if (isBlockedByMe) {
              setMyShieldActive(false);
            }
            setOppShields(prev => {
              const next = { ...prev };
              resolvedBlockedIds.forEach(bid => {
                next[bid] = false;
              });
              return next;
            });
          }

          if (isBlockedByMe && !isTargetMe) {
            sounds.playVictory();
            setRaceFlash({
              text: `🛡️ درعك صدّ كرت «${cardDef?.shortName || 'الهجوم'}» من «${senderName}»!`,
              subtext: 'نجوت من التأثير بنجاح 🔥',
              isMine: true
            });
            setKuwaitiMsg(`🛡️ درع الحماية صدّ هجوم «${senderName}» (${cardDef?.name}) عنك!`);
            if (resolvedTargetIds.length === 0) return;
          } else if (isSenderMe && resolvedTargetIds.length === 0 && resolvedBlockedIds.length > 0) {
            sounds.playVictory();
            setRaceFlash({
              text: `🛡️ الدروع صدّت كرت «${cardDef?.shortName || 'الهجوم'}»!`,
              subtext: 'تم كسر درع المنافسين — حاول بكرت آخر',
              isMine: false
            });
            setKuwaitiMsg(`🛡️ المنافسون كانوا محميين بالدروع وصدّوا كرتك (${cardDef?.name})!`);
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
                ? `⚡ «${senderName}» سرق ${stolenAmount || 0} نقطة من رصيدك!`
                : `${cardDef?.icon || '⚔️'} «${senderName}» أطلق عليك: ${cardDef?.name || 'كرت هجوم'}!`;
            setRaceFlash({
              text: flashTitle,
              subtext: cardDef?.durationSec ? `التأثير مستمر لمدة ${cardDef.durationSec} ثانية` : 'انتزع الصدارة مجدداً!',
              isMine: false
            });
            setKuwaitiMsg(flashTitle);
            setCommentType('mistake');
          } else if (isSenderMe && resolvedTargetIds.length > 0) {
            sounds.playVictory();
            if (cardDef?.durationSec) {
              setOppDebuffs(prev => {
                const next = { ...prev };
                resolvedTargetIds.forEach(tid => {
                  next[tid] = {
                    label: `${cardDef.icon} ${cardDef.shortName}`,
                    seconds: cardDef.durationSec!
                  };
                });
                return next;
              });
            }
            const flashTitle =
              cardId === 'CARD_STEAL_POINTS'
                ? `⚡ سرقت +${stolenAmount || 0} نقطة من «${targetName || 'المتصدر'}» وأضفتها لرصيدك!`
                : resolvedTargetIds.length > 1
                ? `${cardDef?.icon || '⚔️'} أصبت ${resolvedTargetIds.length} منافسين بـ «${cardDef?.name}»!`
                : `${cardDef?.icon || '⚔️'} أصبت «${targetName || 'الخصم'}» بـ «${cardDef?.name}»!`;
            setRaceFlash({
              text: flashTitle,
              subtext: cardDef?.durationSec ? `التأثير مستمر ${cardDef.durationSec} ثانية — أسرع بصيد الكلمات!` : 'ضربة موفقة 🔥',
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
  }, [socket, playerId, categoryObj.name, applyRematchStarted, clearRematchTimer, opponent?.id]);

  // Countdown timers for active Battle Card debuffs & cooldown
  useEffect(() => {
    const hasOppDebuff = Object.keys(oppDebuffs).length > 0;
    if (
      myFrozenSeconds <= 0 &&
      mySandstormSeconds <= 0 &&
      myBlindWordsSeconds <= 0 &&
      cardCooldown <= 0 &&
      !hasOppDebuff
    ) {
      return;
    }
    const timer = setInterval(() => {
      setMyFrozenSeconds(s => Math.max(0, s - 1));
      setMySandstormSeconds(s => Math.max(0, s - 1));
      setMyBlindWordsSeconds(s => Math.max(0, s - 1));
      setCardCooldown(s => Math.max(0, s - 1));
      setOppDebuffs(prev => {
        const next: Record<string, { label: string; seconds: number }> = {};
        Object.entries(prev).forEach(([pid, val]) => {
          if (val.seconds > 1) {
            next[pid] = { ...val, seconds: val.seconds - 1 };
          }
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [myFrozenSeconds, mySandstormSeconds, myBlindWordsSeconds, cardCooldown, oppDebuffs]);

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
    const curNormalized = normalizeRoomWordOwnership(roomRef.current);
    const canonicalWord = resolveCanonicalPlacementWord(curNormalized, word);
    const existingClaim = curNormalized.claimedWords?.[canonicalWord];

    if (
      foundWordsRef.current.includes(canonicalWord) ||
      foundWords.includes(word) ||
      Boolean(existingClaim)
    ) {
      sounds.playError();
      const ownerName =
        existingClaim?.playerName ||
        wordPlayerNameMapRef.current[canonicalWord] ||
        wordPlayerNameMap[word] ||
        'لاعب';
      setKuwaitiMsg(`هذه الكلمة صادها «${ownerName}» وانحسبت له! اسبق على الكلمات الباقية ⚡`);
      setCommentType('mistake');
      return;
    }

    if (inFlightWordsRef.current.has(canonicalWord)) {
      return;
    }

    if (socket.readyState === WebSocket.OPEN) {
      if (selectedCells && selectedCells.length >= 2) {
        setRoom(prev => ({
          ...prev,
          wordPlacements: (prev.wordPlacements || []).map(wp =>
            wp.word === canonicalWord || normalizeArabicWord(wp.word) === normalizeArabicWord(canonicalWord)
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
            word: canonicalWord,
            playerId,
            username: currentUser?.username,
            authToken: currentUser?.authToken,
            cells: selectedCells
          }
        })
      );
    } else {
      // 1. Verify word claim through authoritative server endpoint first (if backend is active)
      inFlightWordsRef.current.add(canonicalWord);
      (async () => {
        try {
          try {
            const res = await fetch('/api/rooms/claim-word', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: room.code,
                word: canonicalWord,
                playerId,
                username: currentUser?.username,
                cells: selectedCells
              })
            });
            const contentType = res.headers.get('content-type') || '';
            if (res.status !== 404 && contentType.includes('application/json')) {
              const data = await res.json();
              if (res.ok && data?.success && data.room) {
                const dataRoom = data.room;
                const claimedCells =
                  Array.isArray(data.cells) && data.cells.length >= 2 ? data.cells : selectedCells;
                const mergedDataRoom = normalizeRoomWordOwnership({
                  ...dataRoom,
                  wordPlacements: (dataRoom.wordPlacements || []).map((wp: any) => {
                    if (
                      Array.isArray(claimedCells) &&
                      claimedCells.length >= 2 &&
                      (wp.word === canonicalWord ||
                        normalizeArabicWord(wp.word) === normalizeArabicWord(canonicalWord))
                    ) {
                      return { ...wp, cells: claimedCells };
                    }
                    return wp;
                  })
                });
                setRoom(mergedDataRoom);
                if (data.room.playerDeadlines) {
                  setPlayerDeadlines(data.room.playerDeadlines);
                }
                const claimedAt = Date.now();
                void realtimeSync.saveCloudRoomSnapshot(mergedDataRoom, { skipMerge: true });
                void realtimeSync.publishToRoom(
                  room.code,
                  'WORD_FOUND',
                  {
                    word: data.word || canonicalWord,
                    playerId,
                    playerName: myPlayer?.displayName || 'أنت',
                    playerColor: myPlayer?.color || (room.hostId === playerId ? '#0ea5e9' : '#ec4899'),
                    displayWord: data.displayWord || canonicalWord,
                    wordScore: data.wordScore,
                    signature: data.signature,
                    cells: claimedCells,
                    claimedAt,
                    room: mergedDataRoom
                  },
                  playerId
                );
                return;
              }

              // Authoritative server explicitly rejected the claim (e.g., word was already claimed while player was away!)
              if (data?.room) {
                setRoom(normalizeRoomWordOwnership(data.room));
              }
              sounds.playError();
              const claimerName =
                data?.claimedByName ||
                wordPlayerNameMapRef.current[canonicalWord] ||
                opponent?.displayName ||
                'الخصم';
              setKuwaitiMsg(`هذه الكلمة صادها «${claimerName}» قبلك وانحسبت له! اسبق على الكلمات الباقية ⚡`);
              setCommentType('mistake');
              return;
            }
          } catch {
            // Static host / Vercel fallback below
          }

          // 2. Static host / Vercel authoritative cloud claim via Supabase Cloud Room Snapshot store
          const placement = (roomRef.current.wordPlacements || []).find(
            p => p.word === canonicalWord || normalizeArabicWord(p.word) === normalizeArabicWord(canonicalWord)
          );
          if (!placement) return;

          const displayWord = placement.displayWord || canonicalWord;
          const pts = 150;
          const myColor = myPlayer?.color || (room.hostId === playerId ? '#0ea5e9' : '#ec4899');
          const myName = myPlayer?.displayName || 'أنت';
          const claimTimestamp = Date.now();

          const claimResult = await realtimeSync.claimWordInCloudRoom({
            room: roomRef.current,
            word: canonicalWord,
            displayWord,
            playerId,
            playerName: myName,
            playerColor: myColor,
            wordScore: pts,
            cells: selectedCells,
            claimedAt: claimTimestamp
          });

          if (!claimResult.claimed) {
            // Opponent ALREADY claimed this word in Supabase Cloud while this player was outside Safari!
            let syncedRoom = claimResult.room;
            const totalW = syncedRoom.wordPlacements?.length || 7;
            if (Object.keys(syncedRoom.claimedWords || {}).length >= totalW && syncedRoom.state !== 'FINISHED') {
              syncedRoom = buildLocalStandingsAndFinish(syncedRoom);
            }
            setRoom(syncedRoom);
            sounds.playError();
            const ownerName = claimResult.alreadyClaimedByName || opponent?.displayName || 'الخصم';
            setKuwaitiMsg(
              `هذه الكلمة صادها «${ownerName}» قبلك أثناء خروجك وانحسبت له! اسبق على الكلمات الباقية ⚡`
            );
            setCommentType('mistake');
            setRaceFlash({
              text: `🚨 «${displayWord}» صادها «${ownerName}» قبلك!`,
              subtext: 'تم تحديث اللوحة بالكلمات المصطادة • اسبق على الباقي ⚡',
              isMine: false
            });
            return;
          }

          // Successfully claimed first!
          sounds.playMultiplayerWordScore(1, 0);
          if (isSpeedMode) {
            setPlayerDeadlines(prev => ({ ...prev, [playerId]: Date.now() + 20_000 }));
          }

          let nextRoom = claimResult.room;
          const totalWordCount = nextRoom.wordPlacements?.length || 7;
          const totalClaimedCount = Object.keys(nextRoom.claimedWords || {}).length;

          if (totalClaimedCount >= totalWordCount && nextRoom.state !== 'FINISHED') {
            nextRoom = buildLocalStandingsAndFinish(nextRoom);
            void realtimeSync.saveCloudRoomSnapshot(nextRoom, { skipMerge: true });
            setTimeout(() => {
              setGameFinished(true);
              setWinnerInfo({
                id: nextRoom.stageWinnerId || undefined,
                name: nextRoom.stageWinnerName || 'تعادل'
              });
              const celebWin = nextRoom.seriesCompleted
                ? nextRoom.seriesWinnerId === playerId
                : nextRoom.stageWinnerId === playerId;
              if (celebWin) {
                sounds.playVictory();
                try {
                  confetti({ particleCount: 140, spread: 85, origin: { y: 0.6 } });
                } catch {
                  // Ignore
                }
              }
            }, 800);
          }

          setRoom(nextRoom);
          setKuwaitiMsg(`كفو! صدت كلمة «${displayWord}» وانحسبت لك (+${pts} نقطة)! ⚡`);
          setCommentType('praise');
          setRaceFlash({
            text: `🔊 ⚡ صدت «${displayWord}» أول! انحسبت لك`,
            subtext: `+${pts} نقطة لصالحك`,
            isMine: true
          });

          // Broadcast word discovery + authoritative room snapshot to opponent
          void realtimeSync.publishToRoom(
            room.code,
            'WORD_FOUND',
            {
              word: canonicalWord,
              playerId,
              playerName: myName,
              playerColor: myColor,
              displayWord,
              wordScore: pts,
              cells: selectedCells,
              claimedAt: claimResult.claimedAt,
              room: nextRoom
            },
            playerId
          );
        } finally {
          inFlightWordsRef.current.delete(canonicalWord);
        }
      })();
    }
  };

  // Real-time listener for word discoveries & state sync by human opponent across the internet
  useEffect(() => {
    void realtimeSync.subscribeToRoom(room.code, (msg) => {
      const { type, payload, senderId } = msg;
      if (String(senderId) === String(playerId) || String(payload?.playerId) === String(playerId)) {
        return;
      }

      if (type === 'REQUEST_ROOM_SYNC') {
        const authoritativeLocal = normalizeRoomWordOwnership(roomRef.current);
        void realtimeSync.saveCloudRoomSnapshot(authoritativeLocal);
        void realtimeSync.publishToRoom(
          room.code,
          'ROOM_STATE_SYNC',
          { room: authoritativeLocal },
          playerId
        );
        return;
      }

      if (type === 'ROOM_STATE_SYNC' && payload?.room) {
        const merged = mergeCloudAndLocalRooms(roomRef.current, payload.room);
        const totalW = merged.wordPlacements?.length || 7;
        const finalMerged =
          Object.keys(merged.claimedWords || {}).length >= totalW && merged.state !== 'FINISHED'
            ? buildLocalStandingsAndFinish(merged)
            : merged;
        setRoom(finalMerged);
        return;
      }

      if (type === 'WORD_CLAIM_REJECTED') {
        if (payload?.room) {
          const merged = mergeCloudAndLocalRooms(roomRef.current, payload.room);
          setRoom(merged);
        }
        if (String(payload?.rejectedPlayerId) === String(playerId)) {
          sounds.playError();
          const ownerName = payload?.ownerName || opponent?.displayName || 'الخصم';
          const shownW = payload?.displayWord || payload?.word || 'الكلمة';
          setKuwaitiMsg(`هذه الكلمة «${shownW}» صادها «${ownerName}» قبلك وانحسبت له! اسبق على الباقي ⚡`);
          setCommentType('mistake');
          setRaceFlash({
            text: `🚨 «${shownW}» صادها «${ownerName}» قبلك!`,
            subtext: 'انحسبت لمن اصطادها أولاً • اسبق على الكلمات المتبقية',
            isMine: false
          });
        }
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
          cells: payloadCells,
          claimedAt: payloadClaimedAt
        } = payload || {};

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
              return;
            }
            if (verifyData.room) {
              setRoom(normalizeRoomWordOwnership(verifyData.room));
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

          const curNorm = normalizeRoomWordOwnership(roomRef.current);
          const canonicalWord = resolveCanonicalPlacementWord(curNorm, word);
          const existingClaim = curNorm.claimedWords?.[canonicalWord];
          const incomingTime = Number(payloadClaimedAt) || Date.now();

          // CRITICAL: If this word was ALREADY claimed by me with an earlier or equal timestamp,
          // REJECT the opponent's duplicate/stale claim and push our authoritative state back to them!
          if (existingClaim && String(existingClaim.playerId) === String(playerId)) {
            const myTime = Number(existingClaim.claimedAt) || 0;
            if (myTime <= incomingTime) {
              void realtimeSync.saveCloudRoomSnapshot(curNorm, { skipMerge: true });
              void realtimeSync.publishToRoom(
                room.code,
                'WORD_CLAIM_REJECTED',
                {
                  word: canonicalWord,
                  displayWord: dw || existingClaim.displayWord || canonicalWord,
                  rejectedPlayerId: String(finderId || senderId),
                  ownerId: String(playerId),
                  ownerName: myPlayer?.displayName || 'المنافس',
                  room: curNorm
                },
                playerId
              );
              return;
            }
          }

          // If already claimed by the same opponent, ignore duplicate broadcast
          if (existingClaim && String(existingClaim.playerId) !== String(playerId)) {
            return;
          }

          const curPlayers = curNorm.players || room.players;
          const finder =
            curPlayers[finderId] ||
            Object.values(curPlayers).find(p => String(p.id) !== String(playerId));
          const resolvedFinderId = String(finder?.id || finderId || 'opponent');
          const finderColor = finder?.color || payloadFinderColor || '#ec4899';
          const finderName = finder?.displayName || payloadFinderName || 'الخصم';

          if (roomRef.current.gameMode === 'SPEED_REVEAL_20S') {
            setPlayerDeadlines(prev => ({ ...prev, [resolvedFinderId]: Date.now() + 20_000 }));
          }
          sounds.playOpponentFound(1);
          setKuwaitiMsg(
            `الخصم «${finderName}» صاد كلمة «${dw || canonicalWord}» قبلك وانحسبت له (+${verifiedPts} نقطة)! اسبق على الكلمات المتبقية ⚡`
          );
          setCommentType('mistake');
          setRaceFlash({
            text: `🚨 الخصم «${finderName}» صاد «${dw || canonicalWord}» قبلك!`,
            subtext: `انحسبت للخصم (+${verifiedPts} نقطة) • اسبق على الكلمات المتبقية`,
            isMine: false
          });

          setRoom(cur => {
            const normCur = normalizeRoomWordOwnership(cur);
            const targetKey = normCur.players[resolvedFinderId]
              ? resolvedFinderId
              : Object.keys(normCur.players).find(k => String(k) !== String(playerId)) || resolvedFinderId;

            const nextClaimedWords = {
              ...(normCur.claimedWords || {}),
              [canonicalWord]: {
                word: canonicalWord,
                displayWord: dw || canonicalWord,
                playerId: targetKey,
                playerName: finderName,
                playerColor: finderColor,
                claimedAt: incomingTime,
                wordScore: verifiedPts,
                cells: Array.isArray(payloadCells) && payloadCells.length >= 2 ? payloadCells : undefined
              }
            };

            const updated = normalizeRoomWordOwnership({
              ...normCur,
              claimedWords: nextClaimedWords,
              wordPlacements: (normCur.wordPlacements || []).map(wp =>
                wp.word === canonicalWord
                  ? {
                      ...wp,
                      foundBy: targetKey,
                      cells:
                        Array.isArray(payloadCells) && payloadCells.length >= 2
                          ? payloadCells
                          : wp.cells
                    }
                  : wp
              )
            });

            const totalW = updated.wordPlacements?.length || 7;
            const totalClaimed = Object.keys(updated.claimedWords || {}).length;
            if (totalClaimed >= totalW && updated.state !== 'FINISHED') {
              const finalized = buildLocalStandingsAndFinish(updated);
              void realtimeSync.saveCloudRoomSnapshot(finalized, { skipMerge: true });
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
            void realtimeSync.saveCloudRoomSnapshot(updated);
            return updated;
          });
        })();
      } else if (type === 'BATTLE_CARD_USED') {
        const { cardId, senderName, blockedByShield, stolenAmount, targetIds } = payload || {};
        const cardDef = BATTLE_CARD_ITEMS.find(c => c.id === cardId);
        const cardSenderId = String(payload?.playerId || senderId || '');

        if (cardId === 'CARD_SHIELD') {
          setOppShields(prev => ({ ...prev, [cardSenderId]: true }));
          setKuwaitiMsg(`🛡️ اللاعب «${senderName}» فعّل درع الحماية!`);
          return;
        }

        if (Array.isArray(targetIds) && targetIds.length > 0 && !targetIds.map(String).includes(String(playerId))) {
          return;
        }

        if (myShieldActive) {
          setMyShieldActive(false);
          sounds.playVictory();
          setRaceFlash({
            text: `🛡️ درعك صدّ كرت «${cardDef?.shortName || 'الهجوم'}» من «${senderName}»!`,
            subtext: 'تم إحباط الهجوم بنجاح 🔥',
            isMine: true
          });
          realtimeSync.publishToRoom(
            room.code,
            'BATTLE_CARD_BLOCKED',
            { cardId, blockerId: playerId, blockerName: myPlayer?.displayName || 'المنافس' },
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
              const oppKey = cur.players[cardSenderId]
                ? cardSenderId
                : Object.keys(cur.players).find(k => k !== playerId);
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
            text: `${cardDef?.icon || '⚔️'} «${senderName}» أطلق عليك: ${cardDef?.name}!`,
            subtext: cardDef?.durationSec ? `التأثير مستمر لمدة ${cardDef.durationSec} ثانية` : 'أسرع للتعويض!',
            isMine: false
          });
          setKuwaitiMsg(`${cardDef?.icon || '⚔️'} «${senderName}» استخدم عليك ${cardDef?.name}!`);
          setCommentType('mistake');
        }
      } else if (type === 'BATTLE_CARD_BLOCKED') {
        const { cardId, blockerId, blockerName } = payload || {};
        const cardDef = BATTLE_CARD_ITEMS.find(c => c.id === cardId);
        const bid = String(blockerId || senderId || '');
        if (bid) {
          setOppShields(prev => ({ ...prev, [bid]: false }));
          setOppDebuffs(prev => {
            const next = { ...prev };
            delete next[bid];
            return next;
          });
        }
        setRaceFlash({
          text: `🛡️ درع «${blockerName || 'الخصم'}» صدّ كرت «${cardDef?.shortName || 'الهجوم'}»!`,
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
      setOpponentCursors(prev => ({
        ...prev,
        [rivalBot.id]: { cells: target.cells.slice(0, 3), expiresAt: Date.now() + 2500 }
      }));

      setTimeout(() => {
        setOpponentCursors(prev => {
          const copy = { ...prev };
          delete copy[rivalBot.id];
          return copy;
        });
        setRoom(cur => {
          const normCur = normalizeRoomWordOwnership(cur);
          if (normCur.claimedWords?.[target.word]) return normCur;
          const nextClaimed = {
            ...(normCur.claimedWords || {}),
            [target.word]: {
              word: target.word,
              displayWord: target.displayWord,
              playerId: rivalBot.id,
              playerName: rivalBot.displayName,
              playerColor: rivalBot.color || ONLINE_PLAYER_COLORS[1],
              claimedAt: Date.now(),
              wordScore: 150,
              cells: target.cells
            }
          };
          const updated = normalizeRoomWordOwnership({
            ...normCur,
            claimedWords: nextClaimed
          });
          sounds.playError();
          setRaceFlash({
            text: `خصمك «${rivalBot.displayName}» صاد كلمة «${target.displayWord}»!`,
            subtext: `اسبق على الكلمات المتبقية`,
            isMine: false
          });
          const totalW = updated.wordPlacements?.length || 7;
          if (Object.keys(updated.claimedWords || {}).length >= totalW) {
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
  }, [socket, playerId, gameFinished, foundWords, room.wordPlacements, room.players, buildLocalStandingsAndFinish]);

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
      claimedWords: {},
      players: resetPlayers
    };

    void realtimeSync.saveCloudRoomSnapshot(nextRoom, { skipMerge: true });
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

  const handleBlockOpponent = async (targetUsername: string, targetDisplayName: string) => {
    if (!targetUsername || !currentUser?.username || blockingOpponent) return;
    sounds.playTap();
    setBlockingOpponent(true);
    try {
      const res = await fetch('/api/moderation/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUser.username,
          targetUsername
        })
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        sounds.playVictory();
        if (data.user && onUpdateUser) {
          onUpdateUser(data.user);
        }
        setKuwaitiMsg(`🚫 تم حظر «${targetDisplayName}» ولن يظهر لك في الغرف أو التفاعلات لاحقاً`);
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
      // Static / cloud relay fallback supporting 2-4 players
      if (cardId === 'CARD_SHIELD') {
        sounds.playHint();
        setMyShieldActive(true);
        setKuwaitiMsg('🛡️ فعّلت درع الحماية! سيتم صد كرت الهجوم القادم تلقائياً.');
        setCommentType('praise');
        realtimeSync.publishToRoom(
          room.code,
          'BATTLE_CARD_USED',
          { cardId, playerId, senderName: myPlayer?.displayName || 'المنافس' },
          playerId
        );
        return;
      }

      if (cardId === 'CARD_STEAL_POINTS') {
        const topTarget = [...opponents].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
        if (topTarget && oppShields[topTarget.id]) {
          setOppShields(prev => ({ ...prev, [topTarget.id]: false }));
          sounds.playError();
          setRaceFlash({
            text: `🛡️ درع «${topTarget.displayName}» صدّ كرت «${cardDef.shortName}»!`,
            subtext: 'تم كسر الدرع الآن',
            isMine: false
          });
          return;
        }
        let stolenAmount = 0;
        if (topTarget) {
          stolenAmount = Math.min(100, Math.max(0, topTarget.score || 0));
          setRoom(cur => {
            const myP = cur.players[playerId];
            const oppP = cur.players[topTarget.id];
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
                      [topTarget.id]: {
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
        sounds.playVictory();
        setRaceFlash({
          text: `⚡ سرقت +${stolenAmount} نقطة من «${topTarget?.displayName || 'المتصدر'}»!`,
          subtext: 'ضربة قوية 🔥',
          isMine: true
        });
        setKuwaitiMsg(`${cardDef.icon} أرسلت كرت «${cardDef.name}» على «${topTarget?.displayName || 'المتصدر'}»!`);
        setCommentType('praise');
        realtimeSync.publishToRoom(
          room.code,
          'BATTLE_CARD_USED',
          {
            cardId,
            playerId,
            senderName: myPlayer?.displayName || 'المنافس',
            targetIds: topTarget ? [topTarget.id] : [],
            stolenAmount
          },
          playerId
        );
        return;
      }

      const shieldedOpps = opponents.filter(o => oppShields[o.id]);
      const unshieldedOpps = opponents.filter(o => !oppShields[o.id]);
      if (shieldedOpps.length > 0) {
        setOppShields(prev => {
          const next = { ...prev };
          shieldedOpps.forEach(so => {
            next[so.id] = false;
          });
          return next;
        });
      }

      if (unshieldedOpps.length === 0) {
        sounds.playError();
        setRaceFlash({
          text: `🛡️ دروع الخصوم صدّت كرت «${cardDef.shortName}»!`,
          subtext: 'تم كسر الدروع الآن',
          isMine: false
        });
        return;
      }

      sounds.playVictory();
      if (cardDef.durationSec) {
        setOppDebuffs(prev => {
          const next = { ...prev };
          unshieldedOpps.forEach(uo => {
            next[uo.id] = {
              label: `${cardDef.icon} ${cardDef.shortName}`,
              seconds: cardDef.durationSec!
            };
          });
          return next;
        });
      }

      const hitText =
        unshieldedOpps.length > 1
          ? `${cardDef.icon} أصبت ${unshieldedOpps.length} منافسين بـ «${cardDef.name}»!`
          : `${cardDef.icon} أصبت «${unshieldedOpps[0].displayName}» بـ «${cardDef.name}»!`;
      setRaceFlash({
        text: hitText,
        subtext: cardDef.durationSec ? `التأثير مستمر ${cardDef.durationSec} ثانية — اسبق الآن!` : 'ضربة قوية 🔥',
        isMine: true
      });
      setKuwaitiMsg(hitText);
      setCommentType('praise');

      realtimeSync.publishToRoom(
        room.code,
        'BATTLE_CARD_USED',
        {
          cardId,
          playerId,
          senderName: myPlayer?.displayName || 'المنافس',
          targetIds: unshieldedOpps.map(o => o.id),
          stolenAmount: 0
        },
        playerId
      );
    }
  };

  const totalWords = room.wordPlacements?.length || 7;
  const orderedHudPlayers = [myPlayer, ...opponents].filter(
    (p): p is NonNullable<typeof p> => Boolean(p)
  );
  const myWordsCount = (myPlayer?.wordsFound || []).length;

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
                <span>
                  {playersList.length > 2
                    ? `سباق ${playersList.length} لاعبين: اللي يصيد الكلمة أول تنحسب له • ${categoryObj.name}`
                    : `تحدي لاعبين: اللي يصيد الكلمة أول تنحسب له • ${categoryObj.name}`}
                </span>
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

        {/* All Players Battle Score Cards (Supports 2, 3, or 4 Players) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          {orderedHudPlayers.map((p, idx) => {
            const isMe = String(p.id) === String(playerId);
            const seatColor = getPlayerSeatColor(p.id, p.color);
            const pWordsList = p.wordsFound || [];
            const pWordsCount = pWordsList.length;
            const pHasShield = isMe ? myShieldActive : Boolean(oppShields[p.id]);
            const pDebuff = !isMe ? oppDebuffs[p.id] : null;
            const canModerate =
              !isMe &&
              Boolean(currentUser?.username && p.username) &&
              !p.id.startsWith('bot_');

            return (
              <div
                key={p.id}
                className="p-3 rounded-2xl bg-slate-950/90 border-2 flex flex-col gap-2 relative shadow-lg"
                style={{
                  borderColor: `${seatColor}88`,
                  boxShadow: `0 6px 20px ${seatColor}1f`
                }}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={p.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg'}
                    alt={p.displayName}
                    className="w-11 h-11 rounded-full object-cover border-2 shrink-0"
                    style={{ borderColor: seatColor }}
                  />
                  <div className="text-right flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-xs font-black truncate ${
                          isMe ? getNameGlowClass(currentUser?.equippedNameGlow) : ''
                        }`}
                        style={!isMe ? { color: seatColor } : undefined}
                      >
                        {isMe ? `أنت (${p.displayName})` : `${p.displayName} (لاعب ${idx + 1})`}
                      </span>
                      <div className="flex items-center gap-1 flex-wrap justify-end">
                        {canModerate && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                sounds.playTap();
                                setReportTarget({
                                  username: p.username,
                                  displayName: p.displayName
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
                              onClick={() => handleBlockOpponent(p.username, p.displayName)}
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
                              (speedRemaining[p.id] ?? 20) <= 5
                                ? isMe
                                  ? 'bg-rose-500/25 border-rose-400 text-rose-200 animate-pulse'
                                  : 'bg-emerald-500/25 border-emerald-400 text-emerald-200 animate-pulse'
                                : 'bg-slate-900 border-slate-700 text-slate-200'
                            }`}
                            title={
                              isMe
                                ? 'وقتك لصيد كلمة قبل انكشاف حرف سري عند خصومك'
                                : 'وقت المنافس قبل أن ينكشف لك حرف سري'
                            }
                          >
                            <Timer className="w-3 h-3" />
                            <span>{speedRemaining[p.id] ?? 20}ث</span>
                          </span>
                        )}
                        {pHasShield && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300">
                            🛡️ محمي
                          </span>
                        )}
                        {pDebuff && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/25 border border-amber-400/60 text-amber-200 animate-pulse">
                            {pDebuff.label} ({pDebuff.seconds}ث)
                          </span>
                        )}
                        {(p.roundWins || 0) > 0 && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300">
                            🏆 {p.roundWins}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1 gap-1.5 flex-wrap">
                      <div
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border text-xs font-black"
                        style={{
                          backgroundColor: `${seatColor}26`,
                          borderColor: `${seatColor}66`,
                          color: '#f8fafc'
                        }}
                      >
                        <span>{isMe ? `صدت: ${pWordsCount}` : `صاد: ${pWordsCount}`} كلمات</span>
                      </div>
                      <div className="text-left">
                        <span className="text-sm font-black text-white">{p.score} نقطة</span>
                        {(room.roundNumber || 1) > 1 && (
                          <span className="block text-[10px] font-bold" style={{ color: seatColor }}>
                            إجمالي: {p.totalScore ?? p.score}
                          </span>
                        )}
                      </div>
                    </div>
                    {(p.streak || 0) >= 2 && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[10px] font-black animate-bounce mt-0.5"
                        style={{ color: seatColor }}
                      >
                        <Flame className="w-3 h-3 fill-current" />
                        <span>كومبو x{p.streak}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Captured Words Chips */}
                <div className="pt-1.5 border-t border-slate-800/80 flex items-center gap-1.5 flex-wrap min-h-[26px]">
                  <span className="text-[10px] font-bold text-slate-400">
                    {isMe ? 'كلماتك:' : `كلمات ${p.displayName}:`}
                  </span>
                  {pWordsList.length === 0 ? (
                    <span className="text-[10px] text-slate-500">
                      {isMe ? 'لم تصد أي كلمة بعد...' : 'لم يصد أي كلمة بعد...'}
                    </span>
                  ) : (
                    pWordsList.map(w => (
                      <span
                        key={w}
                        className="px-2 py-0.5 rounded-full border text-[10px] font-black"
                        style={{
                          backgroundColor: `${seatColor}30`,
                          borderColor: seatColor,
                          color: '#f8fafc'
                        }}
                      >
                        {isMe ? '✓' : '★'} {getDisplayWord(w)}
                      </span>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Multi-Player Live Word Race Progress Bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] font-black mb-1 px-1 flex-wrap gap-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              {orderedHudPlayers.map(p => {
                const isMe = String(p.id) === String(playerId);
                const seatColor = getPlayerSeatColor(p.id, p.color);
                return (
                  <span key={p.id} style={{ color: seatColor }}>
                    {isMe ? 'أنت' : p.displayName}: {(p.wordsFound || []).length}
                  </span>
                );
              })}
            </div>
            <span className="text-slate-300">
              متبقي في الطاولة: {Math.max(0, totalWords - foundWords.length)} من {totalWords}
            </span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-950 border border-slate-800 overflow-hidden flex">
            {orderedHudPlayers.map(p => {
              const seatColor = getPlayerSeatColor(p.id, p.color);
              const pct = ((p.wordsFound || []).length / Math.max(1, totalWords)) * 100;
              if (pct <= 0) return null;
              return (
                <div
                  key={p.id}
                  className="h-full transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: seatColor }}
                />
              );
            })}
            <div className="flex-1 bg-slate-900" />
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

      {/* Game Board with Live Multi-Opponent Selection Cursors & Active Battle Card Effects */}
      <div className="flex justify-center py-1">
        <GameBoard
          grid={room.grid}
          gridSize={room.gridSize}
          wordPlacements={room.wordPlacements}
          foundWords={foundWords}
          playerColorMap={wordPlayerMap}
          opponentPaths={opponents
            .map(opp => {
              const cur = opponentCursors[opp.id];
              if (!cur || cur.cells.length === 0 || cur.expiresAt < Date.now()) return null;
              return {
                playerId: opp.id,
                cells: cur.cells,
                color: getPlayerSeatColor(opp.id, opp.color),
                name: opp.displayName
              };
            })
            .filter((x): x is NonNullable<typeof x> => Boolean(x))}
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

      {/* Game Finished Winner Modal: Stage Result + Cumulative Standings + Final Champion (2-4 Players) */}
      {gameFinished && winnerInfo && (() => {
        const currentRound = room.roundNumber || 1;
        const totalStages = room.stagesCount || 50;
        const isSeriesCompleted = Boolean(room.seriesCompleted || currentRound >= totalStages);

        const allRankedPlayers = [...playersList].sort((a, b) => {
          const rwDiff = (b.roundWins || 0) - (a.roundWins || 0);
          if (rwDiff !== 0) return rwDiff;
          const totalDiff = (b.totalScore ?? b.score ?? 0) - (a.totalScore ?? a.score ?? 0);
          if (totalDiff !== 0) return totalDiff;
          return (b.score || 0) - (a.score || 0);
        });

        const topByWins = [...playersList].sort((a, b) => (b.roundWins || 0) - (a.roundWins || 0));
        const topByPoints = [...playersList].sort(
          (a, b) => (b.totalScore ?? b.score ?? 0) - (a.totalScore ?? a.score ?? 0)
        );

        const winsTie =
          topByWins.length > 1 && (topByWins[0]?.roundWins || 0) === (topByWins[1]?.roundWins || 0);
        const ptsTie =
          topByPoints.length > 1 &&
          (topByPoints[0]?.totalScore ?? topByPoints[0]?.score ?? 0) ===
            (topByPoints[1]?.totalScore ?? topByPoints[1]?.score ?? 0);

        const winsLeaderText =
          playersList.length <= 1
            ? `🏆 الفوز: ${myPlayer?.displayName || 'أنت'} (${myPlayer?.roundWins || 0})`
            : winsTie
            ? `🤝 تعادل في عدد الفوز (${topByWins[0]?.roundWins || 0})`
            : `🏆 المتقدم بالفوز: ${String(topByWins[0]?.id) === String(playerId) ? 'أنت' : topByWins[0]?.displayName} (${topByWins[0]?.roundWins || 0})`;

        const pointsLeaderText =
          playersList.length <= 1
            ? `⚡ النقاط: ${myPlayer?.totalScore ?? myPlayer?.score ?? 0}`
            : ptsTie
            ? `🤝 تعادل في مجموع النقاط (${topByPoints[0]?.totalScore ?? topByPoints[0]?.score ?? 0})`
            : `⚡ المتقدم بالنقاط: ${String(topByPoints[0]?.id) === String(playerId) ? 'أنت' : topByPoints[0]?.displayName} (${topByPoints[0]?.totalScore ?? topByPoints[0]?.score ?? 0})`;

        const stageWinnerIdResolved =
          room.stageWinnerId !== undefined ? room.stageWinnerId : winnerInfo.id || null;
        const stageWinnerNameResolved =
          room.stageWinnerName || winnerInfo.name || 'تعادل';
        const isStageTie = !stageWinnerIdResolved || stageWinnerNameResolved === 'تعادل';

        let resolvedSeriesWinnerId = room.seriesWinnerId ?? null;
        let resolvedSeriesWinnerName = room.seriesWinnerName || '';
        if (isSeriesCompleted && !resolvedSeriesWinnerId) {
          const first = allRankedPlayers[0];
          const second = allRankedPlayers[1];
          const overallTie =
            first &&
            second &&
            (first.roundWins || 0) === (second.roundWins || 0) &&
            (first.totalScore ?? first.score ?? 0) === (second.totalScore ?? second.score ?? 0);
          if (overallTie) {
            resolvedSeriesWinnerId = 'DRAW';
            resolvedSeriesWinnerName = 'تعادل بطولي';
          } else if (first) {
            resolvedSeriesWinnerId = first.id;
            resolvedSeriesWinnerName = first.displayName;
          }
        }

        const isMeSeriesWinner = isSeriesCompleted && resolvedSeriesWinnerId === playerId;
        const isMeStageWinner = stageWinnerIdResolved === playerId;

        const playerWinsSummary = allRankedPlayers.map(p => ({
          name: String(p.id) === String(playerId) ? `أنت (${p.displayName})` : p.displayName,
          wins: p.roundWins || 0,
          color: getPlayerSeatColor(p.id, p.color)
        }));

        const myStageScore = myPlayer?.score || 0;
        const myTotalScore = myPlayer?.totalScore ?? myStageScore;

        return (
          <ResultsModal
            stars={isSeriesCompleted ? (isMeSeriesWinner ? 3 : 2) : isMeStageWinner ? 3 : 2}
            timeSpent={
              room.startedAt
                ? Math.max(12, Math.round((Date.now() - room.startedAt) / 1000))
                : 45
            }
            score={isSeriesCompleted ? myTotalScore : myStageScore}
            earnedXP={isSeriesCompleted ? (isMeSeriesWinner ? 600 : 250) : isMeStageWinner ? 300 : 120}
            earnedCoins={isSeriesCompleted ? (isMeSeriesWinner ? 350 : 150) : isMeStageWinner ? 175 : 75}
            levelNumber={currentRound}
            totalLevels={totalStages}
            wordsFoundCount={myWordsCount}
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
            matchPlayers={allRankedPlayers.map(p => {
              const isMe = String(p.id) === String(playerId);
              return {
                name: isMe ? `أنت (${p.displayName})` : p.displayName,
                score: p.score || 0,
                totalScore: p.totalScore ?? p.score ?? 0,
                wordsCount: (p.wordsFound || []).length,
                color: getPlayerSeatColor(p.id, p.color),
                roundWins: p.roundWins || 0,
                isStageWinner: stageWinnerIdResolved === p.id,
                isSeriesWinner: isSeriesCompleted && resolvedSeriesWinnerId === p.id
              };
            })}
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
