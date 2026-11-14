import React, { useState, useEffect, useRef } from 'react';
import {
  PlayerProfile,
  OnlineRoom,
  OnlineRoomPlayer,
  PublicRoomSummary,
  ScreenState,
  FriendProfileSummary
} from '../types/game';
import { CATEGORIES, PREMIUM_CATEGORIES, findCategoryById, getRandomCategoryWords } from '../engine/gameCategories';
import { generateWordSearchGrid } from '../engine/wordSearch';
import { FriendsModal } from '../components/FriendsModal';
import { realtimeSync } from '../services/realtimeSync';
import {
  Wifi,
  Users,
  Play,
  Copy,
  Check,
  ArrowLeft,
  Zap,
  Globe,
  Lock,
  Sparkles,
  ChevronDown,
  ChevronLeft,
  Crown,
  Shuffle,
  Share2,
  LayoutGrid,
  Pencil,
  Trophy,
  QrCode,
  Info,
  X,
  RefreshCw,
  Send,
  UserPlus
} from 'lucide-react';
import { sounds } from '../utils/audio';

interface OnlineLobbyScreenProps {
  user: PlayerProfile | null;
  initialMode?: 'CREATE' | 'JOIN';
  initialJoinCode?: string | null;
  initialInviteFriend?: FriendProfileSummary | null;
  onClearInitialLobbyAction?: () => void;
  onUpdateUser?: (user: PlayerProfile) => void;
  onNavigate: (screen: ScreenState) => void;
  onStartOnlineGame: (room: OnlineRoom, ws: WebSocket, isHost: boolean, myPlayerId: string) => void;
}

export const OnlineLobbyScreen: React.FC<OnlineLobbyScreenProps> = ({
  user,
  initialMode = 'CREATE',
  initialJoinCode = null,
  initialInviteFriend = null,
  onClearInitialLobbyAction,
  onUpdateUser,
  onNavigate,
  onStartOnlineGame
}) => {
  const defaultFirstName = user?.displayName?.split(' ')[0] || 'أحمد';
  const [mode, setMode] = useState<'CREATE' | 'JOIN'>(initialMode);

  // Create Room Form State (matching انشاء غرفه.png)
  const [roomName, setRoomName] = useState<string>(`غرفة ${defaultFirstName}`);
  const [selectedCategory, setSelectedCategory] = useState<string>('kuwait_heritage');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState<boolean>(false);
  const [stagesCount, setStagesCount] = useState<10 | 20 | 50>(50);
  const [isPublicRoom, setIsPublicRoom] = useState<boolean>(false); // false = خاصة (selected in screenshot), true = عامة

  // Join Room 5-Character Boxes State (matching دخول الغرفه .png: K W T 5 5)
  const [codeChars, setCodeChars] = useState<string[]>(['K', 'W', 'T', '5', '5']);
  const codeInputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);

  // Active Room & WebSocket State
  const [activeRoom, setActiveRoom] = useState<OnlineRoom | null>(null);
  const [isQuickMatchWaiting, setIsQuickMatchWaiting] = useState(false);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Friends & Direct Room Invitation State
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [friendsList, setFriendsList] = useState<FriendProfileSummary[]>([]);
  const [invitedMap, setInvitedMap] = useState<Record<string, boolean>>({});
  const [inviteToast, setInviteToast] = useState<string | null>(null);
  const pendingAutoInviteRef = useRef<FriendProfileSummary | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const activeRoomRef = useRef<OnlineRoom | null>(null);
  activeRoomRef.current = activeRoom;

  // Sync default room name when active user changes
  useEffect(() => {
    if (user?.displayName) {
      const first = user.displayName.split(' ')[0];
      setRoomName(`غرفة ${first}`);
    }
  }, [user?.displayName]);

  // Unique per-tab player ID so 2 tabs (even duplicated tabs) or 2 devices can play 1v1 together
  const tabPlayerIdRef = useRef<string>('');
  const tabGuestNameRef = useRef<string>('');
  if (!tabPlayerIdRef.current) {
    const baseId = user?.id || 'guest';
    const isFreshOrDuplicatedWindow =
      typeof window !== 'undefined' && (!window.name || !window.name.startsWith('fts_win_'));
    if (isFreshOrDuplicatedWindow && typeof window !== 'undefined') {
      window.name = `fts_win_${Math.random().toString(36).substring(2, 8)}`;
      sessionStorage.removeItem('fatteshha_online_tab_id');
      sessionStorage.removeItem('fatteshha_online_tab_name');
    }
    let storedTabId = sessionStorage.getItem('fatteshha_online_tab_id');
    if (!storedTabId) {
      storedTabId = `${baseId}_${Math.random().toString(36).substring(2, 7)}`;
      sessionStorage.setItem('fatteshha_online_tab_id', storedTabId);
    }
    let storedTabName = sessionStorage.getItem('fatteshha_online_tab_name');
    if (!storedTabName) {
      const tag = Math.floor(100 + Math.random() * 899);
      storedTabName = `ضيف فتّشها #${tag}`;
      sessionStorage.setItem('fatteshha_online_tab_name', storedTabName);
    }
    tabPlayerIdRef.current = storedTabId;
    tabGuestNameRef.current = storedTabName;
  }

  const getPlayerPayload = () => ({
    id: tabPlayerIdRef.current,
    username: userRef.current?.username || `guest_${tabPlayerIdRef.current.slice(-4)}`,
    displayName:
      userRef.current?.displayName && userRef.current.displayName !== 'لاعب كويتي'
        ? userRef.current.displayName
        : tabGuestNameRef.current || 'ضيف فتّشها',
    avatar: userRef.current?.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg'
  });

  // Fetch active public rooms via REST
  const fetchPublicRooms = async () => {
    try {
      const res = await fetch('/api/rooms/public');
      const data = await res.json();
      if (data.success && Array.isArray(data.rooms)) {
        setPublicRooms(data.rooms);
        if (data.rooms.length > 0 && data.rooms[0].code?.length === 5) {
          setCodeChars(data.rooms[0].code.toUpperCase().split(''));
        }
      }
    } catch {
      // Ignore
    }
  };

  // Initialize or maintain WebSocket connection
  const getWebSocket = () => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return wsRef.current;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setIsConnected(true);
      socket.send(JSON.stringify({ type: 'GET_PUBLIC_ROOMS', payload: {} }));
      socket.send(
        JSON.stringify({
          type: 'REGISTER_PRESENCE',
          payload: { username: userRef.current?.username || 'ahmad_kwt' }
        })
      );
    };

    socket.onerror = (e) => {
      console.warn('WS error observed, REST fallback will maintain full functionality:', e);
      setIsConnected(false);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { type, payload } = data;

        if (type === 'PUBLIC_ROOMS_UPDATED') {
          const rooms: PublicRoomSummary[] = payload.rooms || [];
          setPublicRooms(rooms);
          if (rooms.length > 0 && rooms[0].code.length === 5) {
            setCodeChars(rooms[0].code.toUpperCase().split(''));
          }
        } else if (type === 'FRIENDS_PRESENCE_UPDATED') {
          if (Array.isArray(payload?.friends)) {
            setFriendsList(payload.friends);
          }
        } else if (type === 'ROOM_CREATED' || type === 'ROOM_UPDATED') {
          setIsSubmitting(false);
          setActiveRoom(payload.room);
          if (payload.isQuickMatchWaiting) {
            setIsQuickMatchWaiting(true);
          }
          setErrorMsg('');
          // If a private room was created specifically to invite a friend, dispatch the invite immediately
          if (pendingAutoInviteRef.current && payload.room?.code) {
            const targetFriend = pendingAutoInviteRef.current;
            pendingAutoInviteRef.current = null;
            sendDirectRoomInviteToFriend(targetFriend, payload.room.code, payload.room.roomName);
          }
        } else if (type === 'ERROR') {
          setIsSubmitting(false);
          sounds.playError();
          setErrorMsg(payload.message || 'حدث خطأ في الغرفة');
          setIsQuickMatchWaiting(false);
        } else if (type === 'GAME_STARTED') {
          setIsSubmitting(false);
          sounds.playVictory();
          setIsQuickMatchWaiting(false);
          const myId = tabPlayerIdRef.current;
          onStartOnlineGame(payload.room, socket, payload.room.hostId === myId, myId);
        }
      } catch (err) {
        console.error('WS parse err:', err);
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
    };

    wsRef.current = socket;
    return socket;
  };

  const fetchFriendsList = async () => {
    try {
      const uname = userRef.current?.username || 'ahmad_kwt';
      const res = await fetch(`/api/friends?username=${encodeURIComponent(uname)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.friends)) {
        setFriendsList(data.friends);
      }
    } catch {
      // Ignore
    }
  };

  const sendDirectRoomInviteToFriend = async (
    friend: FriendProfileSummary,
    overrideCode?: string,
    overrideRoomName?: string
  ) => {
    const code = overrideCode || activeRoom?.code;
    if (!code) return;
    sounds.playTap();
    try {
      const res = await fetch('/api/friends/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUsername: userRef.current?.username || 'ahmad_kwt',
          toUsername: friend.username,
          roomCode: code,
          roomName: overrideRoomName || activeRoom?.roomName || roomName,
          categoryId: activeRoom?.categoryId || selectedCategory,
          stagesCount: activeRoom?.stagesCount || stagesCount
        })
      });
      const data = await res.json();
      if (data.success) {
        sounds.playMultiplayerWordScore(2, 0);
        setInvitedMap(prev => ({ ...prev, [friend.username]: true }));
        setInviteToast(
          `📩 تم إرسال دعوة مباشرة إلى «${friend.displayName}» (@${friend.username}) للانضمام إلى الغرفة #${code}!`
        );
        setTimeout(() => setInviteToast(null), 3500);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    getWebSocket();
    fetchFriendsList();
    fetchPublicRooms();
  }, []);

  // Handle incoming one-click room join or friend invite from Home/Global banner
  useEffect(() => {
    if (initialJoinCode) {
      const clean = initialJoinCode.trim().toUpperCase().slice(0, 5);
      if (clean.length === 5) {
        setCodeChars(clean.split(''));
      }
      setMode('JOIN');
      joinRoomByCode(clean);
      onClearInitialLobbyAction?.();
    } else if (initialInviteFriend) {
      pendingAutoInviteRef.current = initialInviteFriend;
      setIsPublicRoom(false);
      const code = generateFiveCharCode('KWT');
      const socket = getWebSocket();
      const currentPlayer = getPlayerPayload();
      const cleanRoomName = roomName.trim() || `غرفة ${defaultFirstName}`;
      const sendCreate = () => {
        try {
          socket.send(
            JSON.stringify({
              type: 'ROOM_CREATE',
              payload: {
                code,
                roomName: cleanRoomName,
                player: currentPlayer,
                categoryId: selectedCategory,
                levelNumber: 1,
                stagesCount,
                isPublic: false
              }
            })
          );
        } catch {
          // Fallback will catch
        }
      };
      if (socket.readyState === WebSocket.OPEN) {
        sendCreate();
      } else {
        socket.addEventListener('open', sendCreate, { once: true });
      }
      onClearInitialLobbyAction?.();
    }
  }, [initialJoinCode, initialInviteFriend]);

  // Generate 5-character Kuwaiti room code like KWT55, Q8R42, FTS88
  const generateFiveCharCode = (prefix = 'KWT') => {
    const prefixes = [prefix, 'KWT', 'Q8R', 'FTS'];
    const p = prefixes[Math.floor(Math.random() * prefixes.length)].slice(0, 3).padEnd(3, 'K');
    const num = Math.floor(10 + Math.random() * 89);
    return `${p}${num}`;
  };

  // Cross-tab broadcast channel & localStorage store for seamless peer multiplayer on static hosts like Netlify
  const localChannelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('fatteshha_online_rooms_channel');
        localChannelRef.current = channel;
        channel.onmessage = (event) => {
          const { type, payload } = event.data || {};
          if (type === 'ROOM_UPDATED' && payload?.room) {
            setActiveRoom((prev) => {
              if (prev && prev.code === payload.room.code) {
                return payload.room;
              }
              return prev;
            });
          }
        };
      }
    } catch {
      // Ignore
    }
    return () => {
      try {
        localChannelRef.current?.close();
      } catch {
        // Ignore
      }
    };
  }, []);

  const saveRoomLocally = (roomObj: OnlineRoom) => {
    try {
      const raw = localStorage.getItem('fatteshha_local_rooms_v1');
      const all: Record<string, OnlineRoom> = raw ? JSON.parse(raw) : {};
      all[roomObj.code] = roomObj;
      localStorage.setItem('fatteshha_local_rooms_v1', JSON.stringify(all));
      localChannelRef.current?.postMessage({ type: 'ROOM_UPDATED', payload: { room: roomObj } });
    } catch {
      // Ignore
    }
  };

  const getRoomLocally = (code: string): OnlineRoom | null => {
    try {
      const raw = localStorage.getItem('fatteshha_local_rooms_v1');
      if (!raw) return null;
      const all: Record<string, OnlineRoom> = JSON.parse(raw);
      return all[code.toUpperCase()] || null;
    } catch {
      return null;
    }
  };

  // Create Room action with instant visual feedback, server sync, and infallible client-side fallback (for Netlify/static hosting)
  const handleCreateRoomSubmit = async () => {
    if (isSubmitting) return;
    sounds.playTap();
    setErrorMsg('');
    setIsSubmitting(true);

    const currentPlayer = getPlayerPayload();
    const cleanRoomName = roomName.trim() || `غرفة ${defaultFirstName}`;

    // 1. If user selected "عامة" (Public), use QUICK_MATCH so they pair or open a public room
    if (isPublicRoom) {
      setIsQuickMatchWaiting(true);
      const socket = getWebSocket();
      const sendQuick = () => {
        try {
          socket.send(
            JSON.stringify({
              type: 'QUICK_MATCH',
              payload: {
                player: currentPlayer,
                categoryId: selectedCategory,
                roomName: cleanRoomName,
                stagesCount
              }
            })
          );
        } catch {
          // Handled by REST / local fallback
        }
      };

      if (socket.readyState === WebSocket.OPEN) {
        sendQuick();
      } else {
        socket.addEventListener('open', sendQuick, { once: true });
      }

      // REST / Local fallback
      setTimeout(async () => {
        if (!activeRoom) {
          try {
            const res = await fetch('/api/rooms/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                roomName: cleanRoomName,
                player: currentPlayer,
                categoryId: selectedCategory,
                levelNumber: 1,
                stagesCount,
                isPublic: true
              })
            });
            const data = await res.json();
            if (data.success && data.room) {
              setActiveRoom(data.room);
              setIsQuickMatchWaiting(true);
              setIsSubmitting(false);
              return;
            }
          } catch {
            // Netlify static fallback
          }

          // Infallible local room creation on static hosts like Netlify
          const code = generateFiveCharCode('PUB');
          const localRoom: OnlineRoom = {
            code,
            roomName: cleanRoomName,
            hostId: currentPlayer.id,
            isPublic: true,
            gameMode: 'WORD_RACE',
            roundNumber: 1,
            stagesCount,
            categoryId: selectedCategory,
            levelNumber: 1,
            gridSize: 10,
            words: [],
            grid: [],
            wordPlacements: [],
            players: {
              [currentPlayer.id]: {
                ...currentPlayer,
                isHost: true,
                score: 0,
                wordsFound: [],
                streak: 0,
                roundWins: 0,
                color: '#0ea5e9',
                isReady: true,
                connected: true,
                lastActive: Date.now(),
                lastPing: Date.now()
              }
            },
            state: 'WAITING',
            createdAt: Date.now(),
            chatMessages: []
          };
          saveRoomLocally(localRoom);
          setActiveRoom(localRoom);
          setIsQuickMatchWaiting(true);
          setIsSubmitting(false);
        } else {
          setIsSubmitting(false);
        }
      }, 450);
      return;
    }

    // 2. Private room with a 5-character code
    setIsQuickMatchWaiting(false);
    const code = generateFiveCharCode('KWT');
    let completed = false;

    // Send via WebSocket if available
    const socket = getWebSocket();
    const sendCreate = () => {
      try {
        socket.send(
          JSON.stringify({
            type: 'ROOM_CREATE',
            payload: {
              code,
              roomName: cleanRoomName,
              player: currentPlayer,
              categoryId: selectedCategory,
              levelNumber: 1,
              stagesCount,
              isPublic: false
            }
          })
        );
      } catch {
        // Handled by fallback
      }
    };

    if (socket.readyState === WebSocket.OPEN) {
      sendCreate();
    } else {
      socket.addEventListener('open', sendCreate, { once: true });
    }

    // Immediate REST fallback + infallible client-side creation for Netlify static host
    setTimeout(async () => {
      if (completed || activeRoomRef.current) {
        setIsSubmitting(false);
        return;
      }
      try {
        const res = await fetch('/api/rooms/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            roomName: cleanRoomName,
            player: currentPlayer,
            categoryId: selectedCategory,
            levelNumber: 1,
            stagesCount,
            isPublic: false
          })
        });
        const data = await res.json();
        if (data.success && data.room) {
          completed = true;
          if (!activeRoomRef.current) {
            setActiveRoom(data.room);
          }
          setErrorMsg('');
          setIsSubmitting(false);
          return;
        }
      } catch (err) {
        console.warn('Backend server unreachable (e.g. static hosting on Netlify). Activating local room engine:', err);
      }

      if (completed || activeRoomRef.current) {
        setIsSubmitting(false);
        return;
      }

      // If backend was unreachable (e.g. on Netlify where /api/rooms/create gives 404):
      // Seamlessly create the room in client-side state so the user never sees any error!
      const localRoom: OnlineRoom = {
        code,
        roomName: cleanRoomName,
        hostId: currentPlayer.id,
        isPublic: false,
        gameMode: 'WORD_RACE',
        roundNumber: 1,
        stagesCount,
        categoryId: selectedCategory,
        levelNumber: 1,
        gridSize: 10,
        words: [],
        grid: [],
        wordPlacements: [],
        players: {
          [currentPlayer.id]: {
            ...currentPlayer,
            isHost: true,
            score: 0,
            wordsFound: [],
            streak: 0,
            roundWins: 0,
            color: '#0ea5e9',
            isReady: true,
            connected: true,
            lastActive: Date.now(),
            lastPing: Date.now()
          }
        },
        state: 'WAITING',
        createdAt: Date.now(),
        chatMessages: []
      };
      saveRoomLocally(localRoom);
      completed = true;
      setActiveRoom(localRoom);
      setErrorMsg('');
      setIsSubmitting(false);
    }, 450);
  };

  // Join room by code (from دخول الغرفه .png)
  const joinRoomByCode = async (targetCode: string) => {
    if (isSubmitting) return;
    sounds.playTap();
    setErrorMsg('');
    const cleanCode = targetCode.trim().toUpperCase();
    if (!cleanCode || cleanCode.length < 3) {
      setErrorMsg('يرجى إدخال رمز الغرفة المكون من 5 خانات');
      return;
    }

    setIsSubmitting(true);
    const currentPlayer = getPlayerPayload();
    let completed = false;

    // A. Send via WebSocket if open
    const socket = getWebSocket();
    const sendJoin = () => {
      try {
        socket.send(
          JSON.stringify({
            type: 'ROOM_JOIN',
            payload: {
              code: cleanCode,
              player: currentPlayer
            }
          })
        );
      } catch {
        // Handled by REST
      }
    };
    if (socket.readyState === WebSocket.OPEN) {
      sendJoin();
    } else {
      socket.addEventListener('open', sendJoin, { once: true });
    }

    // B. Subscribe to real-time cloud relay for this room code
    realtimeSync.subscribeToRoom(cleanCode, (msg) => {
      const { type, payload } = msg;
      if (type === 'ROOM_UPDATED' && payload?.room) {
        completed = true;
        setActiveRoom(payload.room);
        saveRoomLocally(payload.room);
        setErrorMsg('');
        setIsSubmitting(false);
      } else if (type === 'GAME_STARTED' && payload?.room) {
        sounds.playVictory();
        const socket = getWebSocket();
        onStartOnlineGame(payload.room, socket, false, currentPlayer.id);
      }
    });

    const guestPlayer: OnlineRoomPlayer = {
      ...currentPlayer,
      isHost: false,
      score: 0,
      wordsFound: [],
      streak: 0,
      roundWins: 0,
      color: '#ec4899',
      isReady: true,
      connected: true,
      lastActive: Date.now(),
      lastPing: Date.now()
    };

    // B. Publish JOIN_REQUEST and PING_ROOM over the internet to the host
    realtimeSync.publishToRoom(cleanCode, 'JOIN_REQUEST', { player: guestPlayer }, currentPlayer.id);
    realtimeSync.publishToRoom(cleanCode, 'PING_ROOM', {}, currentPlayer.id);
    // C. REST fallback + local storage
    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: cleanCode,
          player: currentPlayer
        })
      });
      const data = await res.json();
      if (data.success && data.room) {
        completed = true;
        setActiveRoom(data.room);
        realtimeSync.publishToRoom(cleanCode, 'ROOM_UPDATED', { room: data.room }, currentPlayer.id);
        setErrorMsg('');
        setIsSubmitting(false);
        return;
      }
    } catch {
      // Netlify static fallback
    }

    // Check locally stored room (if running on same machine/browser)
    const localRoom = getRoomLocally(cleanCode);
    if (localRoom) {
      let guestId = currentPlayer.id;
      if (guestId === localRoom.hostId) {
        guestId = `${guestId}_p2`;
        tabPlayerIdRef.current = guestId;
        sessionStorage.setItem('fatteshha_online_tab_id', guestId);
      }
      const existingHost = Object.values(localRoom.players).find(p => p.id !== guestId);
      const safeName =
        existingHost && existingHost.displayName === guestPlayer.displayName
          ? `${guestPlayer.displayName} (2)`
          : guestPlayer.displayName;
      localRoom.players[guestId] = {
        ...guestPlayer,
        id: guestId,
        displayName: safeName
      };
      saveRoomLocally(localRoom);
      realtimeSync.publishToRoom(cleanCode, 'ROOM_UPDATED', { room: localRoom }, guestId);
      completed = true;
      setActiveRoom(localRoom);
      setErrorMsg('');
      setIsSubmitting(false);
      return;
    }

    // If host hasn't responded within 3.5s, inform the user
    setTimeout(() => {
      if (!completed && !activeRoomRef.current) {
        setIsSubmitting(false);
        setErrorMsg(`لم يتم العثور على الغرفة (${cleanCode}) — تأكد من الرمز أو أن المضيف لا يزال داخل الغرفة.`);
      }
    }, 3500);
  };

  // Instant creation of a room with a specific custom code
  const handleCreateRoomWithCode = async (customCode: string) => {
    const cleanCode = (customCode || '').trim().toUpperCase() || generateFiveCharCode('KWT');
    sounds.playTap();
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: cleanCode,
          roomName: `غرفة ${defaultFirstName}`,
          player: getPlayerPayload(),
          categoryId: selectedCategory,
          levelNumber: 1,
          stagesCount: 50,
          isPublic: true
        })
      });
      const data = await res.json();
      if (data.success && data.room) {
        setActiveRoom(data.room);
        setIsSubmitting(false);
        return;
      }
    } catch {
      // Netlify static fallback
    }

    const localRoom: OnlineRoom = {
      code: cleanCode,
      roomName: `غرفة ${defaultFirstName}`,
      hostId: getPlayerPayload().id,
      isPublic: true,
      gameMode: 'WORD_RACE',
      roundNumber: 1,
      stagesCount: 50,
      categoryId: selectedCategory,
      levelNumber: 1,
      gridSize: 10,
      words: [],
      grid: [],
      wordPlacements: [],
      players: {
        [getPlayerPayload().id]: {
          ...getPlayerPayload(),
          isHost: true,
          score: 0,
          wordsFound: [],
          streak: 0,
          roundWins: 0,
          color: '#0ea5e9',
          isReady: true,
          connected: true,
          lastActive: Date.now(),
          lastPing: Date.now()
        }
      },
      state: 'WAITING',
      createdAt: Date.now(),
      chatMessages: []
    };
    saveRoomLocally(localRoom);
    setActiveRoom(localRoom);
    setIsSubmitting(false);
  };

  // 5-Box OTP-style handlers for Join Room Code
  const handleCodeCharChange = (index: number, value: string) => {
    const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!cleaned) {
      const next = [...codeChars];
      next[index] = '';
      setCodeChars(next);
      return;
    }

    // If user pasted or typed multiple characters
    if (cleaned.length > 1) {
      const next = [...codeChars];
      for (let i = 0; i < cleaned.length && index + i < 5; i++) {
        next[index + i] = cleaned[i];
      }
      setCodeChars(next);
      const nextFocusIdx = Math.min(4, index + cleaned.length);
      codeInputsRef.current[nextFocusIdx]?.focus();
      return;
    }

    const next = [...codeChars];
    next[index] = cleaned[0];
    setCodeChars(next);

    if (index < 4) {
      codeInputsRef.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!codeChars[index] && index > 0) {
        const next = [...codeChars];
        next[index - 1] = '';
        setCodeChars(next);
        codeInputsRef.current[index - 1]?.focus();
      } else {
        const next = [...codeChars];
        next[index] = '';
        setCodeChars(next);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      codeInputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 4) {
      codeInputsRef.current[index + 1]?.focus();
    } else if (e.key === 'Enter') {
      joinRoomByCode(codeChars.join(''));
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData('text')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 5);
    if (pasted) {
      const next = ['', '', '', '', ''];
      for (let i = 0; i < 5; i++) {
        next[i] = pasted[i] || '';
      }
      setCodeChars(next);
      const focusIdx = Math.min(4, pasted.length);
      codeInputsRef.current[focusIdx]?.focus();
    }
  };

  const handleLeaveWaitingRoom = async () => {
    sounds.playTap();
    const currentCode = activeRoom?.code;
    const myId = getPlayerPayload().id;
    if (currentCode) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(
            JSON.stringify({
              type: 'ROOM_LEAVE',
              payload: {
                code: currentCode,
                playerId: myId
              }
            })
          );
        } catch {
          // REST will handle
        }
      }
      fetch('/api/rooms/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: currentCode, playerId: myId })
      }).catch(() => {});
    }
    setActiveRoom(null);
    setIsQuickMatchWaiting(false);
  };

  const handleStartGame = async () => {
    if (!activeRoom) return;
    const playersCount = Object.keys(activeRoom.players).length;

    if (playersCount < 2) {
      sounds.playError();
      setErrorMsg('يجب انتظار انضمام اللاعب الثاني أو الضغط على «إدخال منافس مباشر الآن»');
      return;
    }

    sounds.playTap();
    const socket = getWebSocket();
    const words = getRandomCategoryWords(activeRoom.categoryId, 7);
    const board = generateWordSearchGrid(words, 10);

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'ROOM_START',
          payload: {
            code: activeRoom.code,
            board: {
              ...board,
              words
            }
          }
        })
      );
    }

    try {
      const res = await fetch('/api/rooms/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: activeRoom.code })
      });
      const data = await res.json();
      if (data.success && data.room) {
        sounds.playVictory();
        const myId = getPlayerPayload().id;
        realtimeSync.publishToRoom(activeRoom.code, 'GAME_STARTED', { room: data.room }, myId);
        onStartOnlineGame(data.room, socket, data.room.hostId === myId, myId);
        return;
      }
    } catch {
      // Netlify static fallback: start match with local board
      const myId = getPlayerPayload().id;
      const updatedRoom: OnlineRoom = {
        ...activeRoom,
        state: 'PLAYING',
        startedAt: Date.now(),
        grid: board.grid,
        gridSize: board.gridSize,
        words: words,
        wordPlacements: board.wordPlacements
      };
      saveRoomLocally(updatedRoom);
      realtimeSync.publishToRoom(activeRoom.code, 'GAME_STARTED', { room: updatedRoom }, myId);
      sounds.playVictory();
      onStartOnlineGame(updatedRoom, socket, activeRoom.hostId === myId, myId);
    }
  };

  const handleAddLiveRival = async () => {
    if (!activeRoom) return;
    sounds.playTap();
    const socket = getWebSocket();
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'ADD_LIVE_RIVAL',
          payload: {
            code: activeRoom.code
          }
        })
      );
    }

    try {
      const res = await fetch('/api/rooms/add-rival', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: activeRoom.code })
      });
      const data = await res.json();
      if (data.success && data.room) {
        sounds.playVictory();
        const myId = getPlayerPayload().id;
        onStartOnlineGame(data.room, socket, data.room.hostId === myId, myId);
        return;
      }
    } catch {
      // Netlify static fallback: add live rival bot and start match immediately
      const botId = `bot_rival_${Date.now()}`;
      const words = getRandomCategoryWords(activeRoom.categoryId, 7);
      const board = generateWordSearchGrid(words, 10);
      const myId = getPlayerPayload().id;
      const updatedRoom: OnlineRoom = {
        ...activeRoom,
        state: 'PLAYING',
        startedAt: Date.now(),
        grid: board.grid,
        gridSize: board.gridSize,
        words: words,
        wordPlacements: board.wordPlacements,
        players: {
          ...activeRoom.players,
          [botId]: {
            id: botId,
            username: 'kuwait_rival',
            displayName: 'ضاري المطيري',
            avatar: '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg',
            isHost: false,
            score: 0,
            wordsFound: [],
            streak: 0,
            roundWins: 0,
            color: '#ec4899',
            isReady: true,
            connected: true,
            lastActive: Date.now(),
            lastPing: Date.now()
          }
        }
      };
      saveRoomLocally(updatedRoom);
      sounds.playVictory();
      onStartOnlineGame(updatedRoom, socket, true, myId);
    }
  };

  // Real-time room synchronization across Incognito, mobile phones, and Netlify static hosting
  useEffect(() => {
    if (!activeRoom?.code) return;

    const myId = getPlayerPayload().id;
    const isHost = activeRoom.hostId === myId;

    // Connect to real-time cloud relay
    realtimeSync.subscribeToRoom(activeRoom.code, (msg) => {
      const { type, payload, senderId } = msg;
      if (senderId === myId) return; // ignore self-messages

      if (type === 'JOIN_REQUEST' && isHost) {
        // A second player joined our room over the cloud!
        const guest: OnlineRoomPlayer = payload.player;
        setActiveRoom((cur) => {
          if (!cur || cur.code !== activeRoom.code) return cur;
          const guestId = guest.id === cur.hostId ? `${guest.id}_p2` : guest.id;
          const hostPlayer = cur.players[cur.hostId] || Object.values(cur.players)[0];
          const safeDisplayName =
            hostPlayer && hostPlayer.displayName === guest.displayName
              ? `${guest.displayName} (2)`
              : guest.displayName;
          const nextPlayers = {
            ...cur.players,
            [guestId]: {
              ...guest,
              id: guestId,
              displayName: safeDisplayName,
              color: '#ec4899',
              isHost: false,
              isReady: true,
              connected: true,
              lastActive: Date.now(),
              lastPing: Date.now()
            }
          };
          const nextRoom: OnlineRoom = {
            ...cur,
            players: nextPlayers
          };
          saveRoomLocally(nextRoom);
          // Broadcast the full updated room back to the guest
          realtimeSync.publishToRoom(activeRoom.code, 'ROOM_UPDATED', { room: nextRoom }, myId);
          sounds.playTap();
          return nextRoom;
        });
      } else if (type === 'PING_ROOM' && isHost) {
        realtimeSync.publishToRoom(activeRoom.code, 'ROOM_UPDATED', { room: activeRoom }, myId);
      } else if (type === 'ROOM_UPDATED' && payload?.room) {
        setActiveRoom(payload.room);
        saveRoomLocally(payload.room);
      } else if (type === 'GAME_STARTED' && payload?.room) {
        sounds.playVictory();
        const socket = getWebSocket();
        onStartOnlineGame(payload.room, socket, payload.room.hostId === myId, myId);
      }
    });

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(activeRoom.code)}`);
        const data = await res.json();
        if (data.success && data.room) {
          const remoteRoom: OnlineRoom = data.room;
          setActiveRoom(remoteRoom);
          if (remoteRoom.state === 'PLAYING') {
            sounds.playVictory();
            const socket = getWebSocket();
            onStartOnlineGame(remoteRoom, socket, remoteRoom.hostId === myId, myId);
          }
        }
      } catch {
        // Ignore
      }
    }, 2200);

    return () => clearInterval(interval);
  }, [activeRoom?.code, activeRoom?.hostId]);

  const copyRoomCode = () => {
    if (activeRoom) {
      sounds.playTap();
      navigator.clipboard.writeText(activeRoom.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getCategoryName = (catId: string) => {
    return findCategoryById(catId)?.name || 'الكويت';
  };

  // ============================================================================
  // 1. WAITING ROOM VIEW (AFTER CREATING OR JOINING A ROOM)
  // ============================================================================
  if (activeRoom) {
    const myId = getPlayerPayload().id;
    const isHost = activeRoom.hostId === myId;
    const playerList = Object.values(activeRoom.players);
    const hostPlayer = activeRoom.players[activeRoom.hostId] || playerList.find(p => p.isHost) || playerList[0];
    const secondPlayer = playerList.find(p => p.id !== hostPlayer?.id);
    const isRoomFull = playerList.length >= 2;
    const roomCategoryName = getCategoryName(activeRoom.categoryId);

    return (
      <div
        className="safe-screen min-h-dvh w-full flex flex-col items-center justify-start sm:justify-center p-3 sm:p-6 relative overflow-y-auto overflow-x-hidden select-none"
        style={{
          background: 'radial-gradient(circle at 50% 18%, #092c44 0%, #041522 55%, #020b13 100%)'
        }}
        dir="rtl"
      >
        {/* ===================================================================== */}
        {/* TOP FLOATING BAR: ROOM PRIVACY PILL | BRAND & SKYLINE | SHARE PILL    */}
        {/* ===================================================================== */}
        <div className="w-full max-w-xl z-20 mb-3 sm:mb-4">
          <div className="flex items-center justify-between gap-2 px-1">
            {/* Left Pill: Private Room with glowing neon dot */}
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#082438]/95 border border-cyan-500/40 text-xs sm:text-sm font-bold text-slate-200 shadow-[0_0_12px_rgba(56,189,248,0.25)] backdrop-blur-md">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
              <span>{activeRoom.isPublic ? 'غرفة عامة 🌐' : 'غرفة خاصة 🔒'}</span>
            </div>

            {/* Right Pill: Create & Share button */}
            <button
              onClick={() => {
                sounds.playTap();
                copyRoomCode();
                setShowFriendsModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#082438]/95 border border-cyan-500/40 text-xs sm:text-sm font-bold text-slate-200 hover:text-white shadow-[0_0_12px_rgba(56,189,248,0.25)] backdrop-blur-md cursor-pointer transition-colors active:scale-95"
            >
              <ChevronLeft className="w-4 h-4 text-cyan-400" />
              <span>إنشاء ومشاركة</span>
              <Share2 className="w-4 h-4 text-cyan-400" />
            </button>
          </div>

          {/* Central Header with Kuwait Skyline & Flag Ribbons */}
          <div className="relative flex flex-col items-center justify-center mt-2 pt-2">
            {/* SVG Skyline + Kuwait Flag Ribbons */}
            <div className="pointer-events-none absolute inset-x-0 -top-2 h-28 flex items-center justify-center overflow-visible z-0 opacity-90">
              <svg viewBox="0 0 520 120" className="w-full h-full max-w-lg" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <linearGradient id="flagCyanGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity="0.4" />
                  </linearGradient>
                </defs>

                {/* Kuwait City Skyline Silhouette in glowing cyan */}
                <g fill="url(#flagCyanGlow)" opacity="0.75">
                  <rect x="180" y="55" width="8" height="45" />
                  <rect x="192" y="42" width="12" height="58" />
                  <polygon points="210,35 214,20 218,35 218,100 210,100" />
                  <rect x="222" y="48" width="10" height="52" />
                  {/* Kuwait Main Towers Silhouette */}
                  <line x1="330" y1="15" x2="330" y2="100" stroke="#38bdf8" strokeWidth="2.5" />
                  <circle cx="330" cy="40" r="10" fill="#0284c7" stroke="#7dd3fc" strokeWidth="1.5" />
                  <circle cx="330" cy="65" r="7" fill="#0284c7" stroke="#7dd3fc" strokeWidth="1.5" />
                  <line x1="346" y1="30" x2="346" y2="100" stroke="#38bdf8" strokeWidth="2" />
                  <circle cx="346" cy="50" r="8" fill="#0284c7" stroke="#7dd3fc" strokeWidth="1.5" />
                  <line x1="318" y1="45" x2="318" y2="100" stroke="#38bdf8" strokeWidth="1.5" />
                </g>

                {/* Left Kuwait Flag Ribbon */}
                <g transform="translate(45, 20)">
                  <path d="M0,20 Q35,5 75,22 Q115,40 140,25 L140,42 Q115,57 75,39 Q35,22 0,37 Z" fill="#16a34a" />
                  <path d="M0,37 Q35,22 75,39 Q115,57 140,42 L140,59 Q115,74 75,56 Q35,39 0,54 Z" fill="#ffffff" />
                  <path d="M0,54 Q35,39 75,56 Q115,74 140,59 L140,76 Q115,91 75,73 Q35,56 0,71 Z" fill="#dc2626" />
                  <polygon points="0,20 30,45 0,71" fill="#0f172a" />
                </g>

                {/* Right Kuwait Flag Ribbon */}
                <g transform="translate(335, 20)">
                  <path d="M140,20 Q105,5 65,22 Q25,40 0,25 L0,42 Q25,57 65,39 Q105,22 140,37 Z" fill="#16a34a" />
                  <path d="M140,37 Q105,22 65,39 Q25,57 0,42 L0,59 Q25,74 65,56 Q105,39 140,54 Z" fill="#ffffff" />
                  <path d="M140,54 Q105,39 65,56 Q25,74 0,59 L0,76 Q25,91 65,73 Q105,56 140,71 Z" fill="#dc2626" />
                  <polygon points="140,20 110,45 140,71" fill="#0f172a" />
                </g>
              </svg>
            </div>

            {/* Typography */}
            <div className="relative z-10 text-center">
              <div className="flex items-center justify-center gap-1.5 text-white font-black text-lg sm:text-xl drop-shadow-[0_0_12px_rgba(255,255,255,0.7)]">
                <span>فتشها</span>
                <span className="text-xl">🔍</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-[#fffdf2] drop-shadow-[0_2px_16px_rgba(254,240,138,0.65)] tracking-wide mt-0.5">
                {activeRoom.roomName || 'غرفة ضيف'}
              </h2>
            </div>

            {/* ================================================================= */}
            {/* THE STRIP / RIBBON (اخضر نيون بدل ازرق - NEON GREEN RIBBON)       */}
            {/* ================================================================= */}
            <div className="relative z-10 mt-3 inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#04281a]/95 border-2 border-[#10b981] text-[#6ee7b7] text-xs sm:text-sm font-black shadow-[0_0_24px_rgba(16,185,129,0.55)] backdrop-blur-md">
              <Zap className="w-4 h-4 text-[#34d399] fill-[#34d399] shrink-0 animate-pulse" />
              <span>
                مدة الغرفة: 50 دقيقة • تنتهي ببدء اللعبة لأول المنضمين له
              </span>
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* MAIN NEON GLASS CARD CONTAINER                                        */}
        {/* ===================================================================== */}
        <div
          className="w-full max-w-xl rounded-[34px] p-5 sm:p-7 shadow-2xl border-2 backdrop-blur-md text-center relative z-10 overflow-hidden space-y-4"
          style={{
            background: 'linear-gradient(180deg, rgba(6, 26, 42, 0.96) 0%, rgba(3, 14, 24, 0.98) 100%)',
            borderColor: '#38bdf8',
            boxShadow: '0 0 38px rgba(56, 189, 248, 0.38)'
          }}
        >
          {/* 1. ROOM CODE DISPLAY BOX (5 CYAN TILES + COPY BUTTON) */}
          <div className="p-4 sm:p-5 rounded-3xl bg-[#061e31]/85 border border-cyan-500/40 shadow-inner">
            <span className="text-xs sm:text-sm text-sky-200/90 font-bold block mb-3">
              شارك رمز الغرفة (5 خانات) مع أصدقائك للانضمام:
            </span>
            <div className="flex items-center justify-center gap-2 sm:gap-3 mb-3.5" dir="ltr">
              {activeRoom.code.toUpperCase().padEnd(5, '-').slice(0, 5).split('').map((ch, idx) => (
                <div
                  key={idx}
                  className="w-12 h-14 sm:w-14 sm:h-16 rounded-2xl bg-[#08263c] border-2 border-[#38bdf8] shadow-[0_0_16px_rgba(56,189,248,0.55)] flex items-center justify-center text-2xl sm:text-3xl font-black font-mono text-white tracking-widest"
                >
                  {ch}
                </div>
              ))}
            </div>
            <button
              onClick={copyRoomCode}
              className="px-6 py-2 rounded-full bg-[#0d3b59] hover:bg-[#114b73] border border-cyan-400/50 text-white transition-all inline-flex items-center gap-2 text-xs sm:text-sm font-bold shadow-[0_0_12px_rgba(56,189,248,0.25)] cursor-pointer active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-300 font-black">تم نسخ الرمز ({activeRoom.code})</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-cyan-400" />
                  <span>نسخ رمز الغرفة</span>
                </>
              )}
            </button>
          </div>

          {/* 2. PLAYERS IN ROOM (1 OF 2) WITH 2 DISTINCT CARDS */}
          <div className="text-right">
            <div className="flex items-center justify-between mb-2.5 px-1">
              <span className="text-xs sm:text-sm font-bold text-slate-300 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-sky-400" />
                <span>اللاعبون في الغرفة ({playerList.length} من 2):</span>
              </span>
              <button
                onClick={handleLeaveWaitingRoom}
                className="text-[11px] text-slate-400 hover:text-rose-300 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                <span>مغادرة الغرفة</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Host Player Card (Right Card in RTL) */}
              {hostPlayer && (
                <div className="rounded-2xl bg-[#061b2b] border border-cyan-500/40 p-3 sm:p-3.5 flex items-center justify-between">
                  {/* Left (RTL): Badge + Status Dot */}
                  <div className="flex flex-col items-start gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[10px] font-black">
                      <Crown className="w-3 h-3 text-amber-300" />
                      <span>المضيف</span>
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                  </div>

                  {/* Right (RTL): Info + Avatar */}
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm sm:text-base font-black text-white">
                        {hostPlayer.displayName || 'ضيف فتشها'}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400" dir="ltr">
                        #{hostPlayer.username || activeRoom.code.slice(-3) || '981'}
                      </div>
                      <div className="text-[11px] font-bold text-amber-300 flex items-center gap-1 justify-end mt-0.5">
                        <span>رئيس الغرفة</span>
                        <Zap className="w-3 h-3 fill-amber-400 text-amber-400" />
                      </div>
                    </div>
                    <img
                      src={hostPlayer.avatar || '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg'}
                      alt={hostPlayer.displayName}
                      className="w-13 h-13 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-cyan-300 shadow-[0_0_14px_rgba(56,189,248,0.6)]"
                    />
                  </div>
                </div>
              )}

              {/* Second Player Card (Left Card in RTL) */}
              {secondPlayer ? (
                <div className="rounded-2xl bg-[#061b2b] border border-cyan-500/40 p-3 sm:p-3.5 flex items-center justify-between">
                  <div className="flex flex-col items-start gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 text-[10px] font-black">
                      <span>منافس ⚡</span>
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm sm:text-base font-black text-white">
                        {secondPlayer.displayName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400" dir="ltr">
                        #{secondPlayer.username || '772'}
                      </div>
                      <div className="text-[11px] font-bold text-emerald-400 flex items-center gap-1 justify-end mt-0.5">
                        <span>جاهز للمنافسة!</span>
                        <Check className="w-3 h-3" />
                      </div>
                    </div>
                    <img
                      src={secondPlayer.avatar}
                      alt={secondPlayer.displayName}
                      className="w-13 h-13 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-pink-400 shadow-[0_0_14px_rgba(236,72,153,0.6)]"
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-[#061b2b] border border-cyan-500/40 p-3 sm:p-3.5 flex items-center justify-center gap-3 min-h-[82px] text-center">
                  <div className="text-right">
                    <div className="text-xs sm:text-sm font-bold text-sky-200">
                      بانتظار دخول اللاعبين...
                    </div>
                  </div>
                  <div className="relative">
                    <Users className="w-8 h-8 text-cyan-400 animate-pulse" />
                    <Wifi className="w-4 h-4 text-cyan-300 absolute -top-1 -right-1" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3. ROOM TYPE AND PLAYERS LIST MANAGEMENT BOX */}
          <div className="rounded-2xl bg-[#061e31]/80 border border-cyan-500/40 p-3 sm:p-3.5 text-right">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  sounds.playTap();
                  setShowFriendsModal(true);
                }}
                className="px-3 sm:px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Users className="w-4 h-4 text-cyan-300" />
                <span>إدارة قائمة دخول اللاعبين</span>
              </button>

              <div className="h-6 w-px bg-cyan-500/30 hidden sm:block" />

              <div className="flex items-center gap-2 text-xs sm:text-sm font-black text-white">
                <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>نوع الغرفة: خاصة برمز ({activeRoom.code})</span>
              </div>
            </div>
            <div className="text-[11px] sm:text-xs text-sky-200/70 mt-2 text-right">
              لا يوجد انضمام عشوائي — فقط من يملك رمز الغرفة أو إضافته يمكنه الانضمام.
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-bold text-center">
              {errorMsg}
            </div>
          )}

          {/* 4. ACTION BUTTONS */}
          <div className="space-y-3 pt-1">
            {isHost ? (
              <>
                {/* Button 1: Host Waiting / Start Button */}
                <button
                  onClick={handleStartGame}
                  disabled={!isRoomFull}
                  className={`w-full py-3.5 sm:py-4 rounded-full font-black text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all ${
                    isRoomFull
                      ? 'bg-gradient-to-r from-lime-400 via-emerald-400 to-lime-500 text-slate-950 shadow-xl shadow-lime-500/30 active:scale-98 cursor-pointer'
                      : 'bg-slate-800/80 border border-slate-700/60 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>
                    {isRoomFull
                      ? 'انطلاق سباق الكلمات بين اللاعبين! 🔥'
                      : 'بانتظار انضمام اللاعب الثاني...'}
                  </span>
                </button>

                {/* Button 2: Bright Neon Cyan/Green Instant 1v1 Race Button */}
                {!isRoomFull && (
                  <button
                    onClick={handleAddLiveRival}
                    className="w-full py-3.5 sm:py-4 rounded-full bg-gradient-to-r from-[#00f2fe] via-[#4facfe] to-[#00f2fe] hover:brightness-110 text-slate-950 font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(79,172,254,0.65)] active:scale-98 transition-all cursor-pointer"
                  >
                    <Shuffle className="w-5 h-5 text-slate-950" />
                    <span>خلط تنافسي مباشر الآن (بدء فوري 1 ضد 1)</span>
                    <Zap className="w-4 h-4 text-amber-600 fill-amber-500" />
                  </button>
                )}
              </>
            ) : (
              /* Guest View (Player 2) */
              <div className="w-full py-4 px-6 rounded-full bg-[#082338] border-2 border-cyan-400/50 text-cyan-200 font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-[0_0_16px_rgba(56,189,248,0.3)]">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
                <span>تم الانضمام للغرفة بنجاح! بانتظار أن يبدأ المضيف اللعبة... ⚡</span>
              </div>
            )}
          </div>
        </div>

        {/* Friends Modal inside Waiting Room */}
        <FriendsModal
          isOpen={showFriendsModal}
          onClose={() => {
            setShowFriendsModal(false);
            fetchFriendsList();
          }}
          currentUser={user}
          activeRoomCode={activeRoom.code}
          activeRoomName={activeRoom.roomName}
          activeCategoryId={activeRoom.categoryId}
          activeStagesCount={activeRoom.stagesCount}
          onJoinRoomCode={(code) => {
            handleLeaveWaitingRoom();
            joinRoomByCode(code);
          }}
          onUpdateUser={onUpdateUser}
        />
      </div>
    );
  }

  // ============================================================================
  // 2. CREATE ROOM & JOIN ROOM VIEWS (MATCHING انشاء غرفه.png & دخول الغرفه .png)
  // ============================================================================
  return (
    <div
      className="safe-screen min-h-dvh w-full relative overflow-y-auto overflow-x-hidden flex flex-col justify-between select-none"
      style={{
        background: 'radial-gradient(circle at 50% 15%, #092c44 0%, #041522 55%, #020b13 100%)'
      }}
      dir="rtl"
    >
      {/* ===================================================================== */}
      {/* TOP SKYLINE & KUWAIT FLAG BACKDROP                                    */}
      {/* ===================================================================== */}
      <div className="pointer-events-none absolute top-0 inset-x-0 h-56 z-0 overflow-hidden">
        <svg viewBox="0 0 500 220" className="w-full h-full object-cover" preserveAspectRatio="none">
          <defs>
            <linearGradient id="lobbyTowerLit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.95" />
              <stop offset="65%" stopColor="#0284c7" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#fef08a" stopOpacity="0.85" />
            </linearGradient>
          </defs>

          {/* Left City Silhouette */}
          <g fill="#0c3b59" opacity="0.65">
            <rect x="18" y="95" width="18" height="75" />
            <rect x="42" y="80" width="22" height="90" />
            <polygon points="75,65 82,45 89,65 89,170 75,170" />
            <rect x="96" y="88" width="24" height="82" />
            <rect x="126" y="105" width="18" height="65" />
          </g>

          {/* Waving Kuwait Flag on Top-Left when in JOIN mode */}
          {mode === 'JOIN' && (
            <g opacity="0.95">
              <path d="M-10,55 Q75,28 155,70 L145,95 Q70,55 -10,82 Z" fill="#007A3D" />
              <path d="M-10,82 Q70,55 145,95 L135,120 Q65,80 -10,108 Z" fill="#FFFFFF" />
              <path d="M-10,108 Q65,80 135,120 L125,145 Q60,105 -10,135 Z" fill="#CE1126" />
              <polygon points="-10,55 32,72 25,112 -10,135" fill="#000000" />
            </g>
          )}

          {/* Right Glowing Kuwait Towers */}
          <g>
            <rect x="375" y="105" width="16" height="65" fill="#0a3550" opacity="0.7" />
            <rect x="396" y="92" width="18" height="78" fill="#0d4263" opacity="0.8" />
            {/* Needle Tower */}
            <polygon points="418,52 421,52 423,170 416,170" fill="url(#lobbyTowerLit)" />
            {/* Middle Tower */}
            <polygon points="438,34 442,34 445,170 435,170" fill="url(#lobbyTowerLit)" />
            <circle cx="440" cy="88" r="11" fill="#38bdf8" stroke="#bae6fd" strokeWidth="1.2" />
            {/* Main Tower */}
            <polygon points="466,8 471,8 475,170 462,170" fill="url(#lobbyTowerLit)" />
            <circle cx="468.5" cy="70" r="16" fill="#38bdf8" stroke="#e0f2fe" strokeWidth="1.5" />
            <circle cx="468.5" cy="40" r="10" fill="#7dd3fc" stroke="#ffffff" strokeWidth="1.2" />
          </g>

          {/* Horizon Curve */}
          <path d="M0,168 Q250,145 500,168 L500,220 L0,220 Z" fill="#041522" />
        </svg>
      </div>

      {/* ===================================================================== */}
      {/* TOP BAR: BACK BUTTON ON LEFT + MODE SWITCHER PILL ON RIGHT            */}
      {/* ===================================================================== */}
      <div className="relative z-20 w-full max-w-xl mx-auto px-4 pt-4 flex items-center justify-between" dir="ltr">
        {/* Top-Left Back Button matching both screenshots */}
        <button
          type="button"
          onClick={() => {
            sounds.playTap();
            onNavigate('HOME');
          }}
          className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform cursor-pointer"
          style={{
            background: 'linear-gradient(180deg, #123854 0%, #092032 100%)',
            border: '1.5px solid rgba(125, 211, 252, 0.45)'
          }}
          title="رجوع للرئيسية"
        >
          <ArrowLeft className="w-6 h-6 stroke-[2.5]" />
        </button>

        {/* Quick Mode Switcher Pill + Friends Button + Live Server Badge */}
        <div className="flex items-center gap-2 flex-wrap justify-end" dir="rtl">
          {/* Live Server Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#051826]/90 border border-cyan-400/40 text-[11px] font-black text-slate-200 shadow">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-lime-400 shadow-[0_0_8px_#a3e635] animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>{isConnected ? 'الخادم متصل ⚡' : 'جاهز للعب 🌐'}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              setShowFriendsModal(true);
            }}
            className="h-10 px-3.5 rounded-full bg-[#072235]/95 hover:bg-[#0c314b] border border-sky-400/50 text-white text-xs font-black flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer"
            title="قائمة الأصدقاء والدعوات المباشرة"
          >
            <Users className="w-4 h-4 text-sky-400" />
            <span>الأصدقاء ({friendsList.length})</span>
            {friendsList.some(f => f.onlineStatus !== 'OFFLINE') && (
              <span className="w-2 h-2 rounded-full bg-lime-400 animate-pulse" />
            )}
          </button>

          <div
            className="p-1 rounded-full flex items-center gap-1 border border-cyan-400/40 bg-[#051826]/90 backdrop-blur-md shadow-lg"
            dir="rtl"
          >
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                setMode('CREATE');
                setErrorMsg('');
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer ${
                mode === 'CREATE'
                  ? 'bg-gradient-to-r from-[#a3e635] to-[#65a30d] text-slate-950 shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              إنشاء غرفة 🎮
            </button>
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                setMode('JOIN');
                setErrorMsg('');
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer ${
                mode === 'JOIN'
                  ? 'bg-gradient-to-r from-[#38bdf8] to-[#10b981] text-slate-950 shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              انضمام إلى غرفة #
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODE A: CREATE ROOM VIEW (انشاء غرفه.png)                             */}
      {/* ===================================================================== */}
      {mode === 'CREATE' ? (
        <div className="relative z-10 w-full max-w-xl mx-auto px-4 pb-16 pt-1 flex flex-col items-center my-auto">
          {/* Top 3D White Gamepad Icon + Sparks */}
          <div className="relative flex flex-col items-center -mb-4 z-20">
            <svg viewBox="0 0 180 95" className="w-36 sm:w-40 h-20 sm:h-22 drop-shadow-[0_8px_18px_rgba(0,0,0,0.75)]">
              {/* Golden Spark Rays */}
              <line x1="26" y1="22" x2="42" y2="32" stroke="#facc15" strokeWidth="4.5" strokeLinecap="round" />
              <line x1="18" y1="44" x2="36" y2="46" stroke="#fde047" strokeWidth="4.5" strokeLinecap="round" />
              <line x1="154" y1="20" x2="138" y2="30" stroke="#facc15" strokeWidth="4.5" strokeLinecap="round" />
              <line x1="162" y1="42" x2="144" y2="45" stroke="#fde047" strokeWidth="4.5" strokeLinecap="round" />
              {/* Cyan Wire Loop */}
              <path d="M90,26 C95,10 122,12 126,28" fill="none" stroke="#38bdf8" strokeWidth="3.5" />
              {/* White 3D Controller Body */}
              <path
                d="M58,26 H122 C136,26 145,38 147,54 L149,70 C150,82 140,90 130,90 C122,90 116,84 110,74 H70 C64,84 58,90 50,90 C40,90 30,82 31,70 L33,54 C35,38 44,26 58,26 Z"
                fill="#f1f5f9"
                stroke="#94a3b8"
                strokeWidth="2.5"
              />
              {/* Dark D-Pad */}
              <rect x="52" y="47" width="18" height="6" rx="2" fill="#1e293b" />
              <rect x="58" y="41" width="6" height="18" rx="2" fill="#1e293b" />
              {/* Colored Action Buttons */}
              <circle cx="120" cy="42" r="4" fill="#3b82f6" />
              <circle cx="128" cy="50" r="4" fill="#ef4444" />
              <circle cx="112" cy="50" r="4" fill="#22c55e" />
              <circle cx="120" cy="58" r="4" fill="#f59e0b" />
            </svg>
          </div>

          {/* Glowing Title Capsule: «إنشاء غرفة» */}
          <div
            className="px-10 sm:px-14 py-2.5 rounded-full border-2 border-[#38bdf8] shadow-[0_0_25px_rgba(56,189,248,0.45)] z-10 mb-3"
            style={{
              background: 'linear-gradient(180deg, #09263a 0%, #041421 100%)'
            }}
          >
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              إنشاء غرفة
            </h1>
          </div>

          {/* Subtitle */}
          <p className="text-sm sm:text-base font-bold text-slate-200 text-center max-w-md mb-4 leading-relaxed">
            أنشئ غرفة خاصة وادعُ صديقك للانضمام واللعب معاً
          </p>

          {/* Main Glowing Cyan Form Card */}
          <div
            className="w-full rounded-[32px] p-5 sm:p-7 pb-10 relative space-y-5"
            style={{
              background: 'linear-gradient(180deg, rgba(8, 36, 54, 0.94) 0%, rgba(4, 20, 32, 0.97) 100%)',
              border: '2px solid rgba(56, 189, 248, 0.7)',
              boxShadow:
                '0 0 38px rgba(56, 189, 248, 0.28), inset 0 0 24px rgba(56, 189, 248, 0.14)'
            }}
          >
            {/* FIELD 1: اسم الغرفة */}
            <div>
              <label className="flex items-center justify-start gap-2 text-base sm:text-lg font-black text-white mb-2">
                <Pencil className="w-5 h-5 text-slate-200" />
                <span>اسم الغرفة</span>
              </label>
              <div
                className="w-full h-13 sm:h-14 rounded-full px-5 flex items-center justify-between gap-3"
                style={{
                  background: 'linear-gradient(180deg, #0c2b40 0%, #071c2b 100%)',
                  border: '1.5px solid rgba(125, 211, 252, 0.5)',
                  boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.45)'
                }}
              >
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder={`غرفة ${defaultFirstName}`}
                  maxLength={28}
                  className="flex-1 bg-transparent text-white font-black text-base sm:text-lg text-right focus:outline-none placeholder:text-slate-400"
                />
                <Users className="w-6 h-6 text-slate-300 shrink-0" />
              </div>
            </div>

            {/* FIELD 2: الفئة */}
            <div className="relative">
              <label className="flex items-center justify-start gap-2 text-base sm:text-lg font-black text-white mb-2">
                {/* Green Stacked Layers Icon */}
                <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0">
                  <polygon points="12,2 22,7 12,12 2,7" fill="#34d399" />
                  <polyline points="2,12 12,17 22,12" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
                  <polyline points="2,17 12,22 22,17" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <span>الفئة</span>
              </label>

              <button
                type="button"
                onClick={() => {
                  sounds.playTap();
                  setCategoryDropdownOpen(prev => !prev);
                }}
                className="w-full h-13 sm:h-14 rounded-full px-5 flex items-center justify-between gap-3 cursor-pointer hover:brightness-110 transition-all"
                style={{
                  background: 'linear-gradient(180deg, #0c2b40 0%, #071c2b 100%)',
                  border: '1.5px solid rgba(125, 211, 252, 0.5)',
                  boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.45)'
                }}
              >
                <div className="flex items-center gap-2.5">
                  <LayoutGrid className="w-5 h-5 text-sky-300" />
                  <span className="text-white font-black text-base sm:text-lg">
                    اختر الفئة ({getCategoryName(selectedCategory)})
                  </span>
                </div>
                <ChevronDown
                  className={`w-6 h-6 text-white transition-transform ${
                    categoryDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Dropdown Menu of Categories */}
              {categoryDropdownOpen && (
                <div
                  className="mt-2 p-2.5 rounded-2xl border border-cyan-400/60 bg-[#051826]/98 shadow-2xl grid grid-cols-3 gap-2 z-30 relative"
                >
                  {[
                    ...CATEGORIES,
                    ...PREMIUM_CATEGORIES.filter(pc => (user?.unlockedCategories || []).includes(pc.id))
                  ].map((cat) => {
                    const isSelected = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          sounds.playTap();
                          setSelectedCategory(cat.id);
                          setCategoryDropdownOpen(false);
                        }}
                        className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-black transition-all border truncate cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-500/25 text-white border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                            : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:border-cyan-400/40'
                        }`}
                      >
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* FIELD 3: عدد المراحل (10 مراحل | 20 مرحلة | 50 مرحلة) */}
            <div>
              <label className="flex items-center justify-start gap-2 text-base sm:text-lg font-black text-white mb-2.5">
                <Trophy className="w-5 h-5 text-amber-400 fill-amber-400" />
                <span>عدد المراحل</span>
              </label>

              <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
                {([
                  { count: 10 as const, label: '10 مراحل' },
                  { count: 20 as const, label: '20 مرحلة' },
                  { count: 50 as const, label: '50 مرحلة' }
                ]).map((opt) => {
                  const active = stagesCount === opt.count;
                  return (
                    <button
                      key={opt.count}
                      type="button"
                      onClick={() => {
                        sounds.playTap();
                        setStagesCount(opt.count);
                      }}
                      className="h-12 sm:h-13 rounded-full px-3 flex items-center justify-center gap-2 font-black text-sm sm:text-base text-white transition-all cursor-pointer active:scale-95"
                      style={
                        active
                          ? {
                              background:
                                'linear-gradient(180deg, rgba(16, 185, 129, 0.32) 0%, rgba(5, 102, 72, 0.5) 100%)',
                              border: '2px solid #10b981',
                              boxShadow: '0 0 20px rgba(16, 185, 129, 0.55)'
                            }
                          : {
                              background: 'linear-gradient(180deg, #0c2b40 0%, #071c2b 100%)',
                              border: '1.5px solid rgba(125, 211, 252, 0.35)'
                            }
                      }
                    >
                      {active && (
                        <span className="w-5 h-5 rounded-full bg-[#10b981] text-slate-950 flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5 stroke-[3.5]" />
                        </span>
                      )}
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* FIELD 4: نوع الغرفة (عامة | خاصة) */}
            <div>
              <label className="flex items-center justify-start gap-2 text-base sm:text-lg font-black text-white mb-2.5">
                <Lock className="w-5 h-5 text-amber-400 fill-amber-400" />
                <span>نوع الغرفة</span>
              </label>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {/* Option 1: عامة */}
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTap();
                    setIsPublicRoom(true);
                  }}
                  className="h-13 sm:h-14 rounded-full px-4 flex items-center justify-center gap-2.5 font-black text-base sm:text-lg text-white transition-all cursor-pointer active:scale-95"
                  style={
                    isPublicRoom
                      ? {
                          background:
                            'linear-gradient(180deg, rgba(16, 185, 129, 0.32) 0%, rgba(5, 102, 72, 0.5) 100%)',
                          border: '2px solid #10b981',
                          boxShadow: '0 0 22px rgba(16, 185, 129, 0.55)'
                        }
                      : {
                          background: 'linear-gradient(180deg, #0c2b40 0%, #071c2b 100%)',
                          border: '1.5px solid rgba(125, 211, 252, 0.35)'
                        }
                  }
                >
                  {isPublicRoom && (
                    <span className="w-6 h-6 rounded-full bg-[#10b981] text-slate-950 flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4 stroke-[3.5]" />
                    </span>
                  )}
                  <Users className="w-5 h-5 text-sky-300" />
                  <span>عامة</span>
                </button>

                {/* Option 2: خاصة */}
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTap();
                    setIsPublicRoom(false);
                  }}
                  className="h-13 sm:h-14 rounded-full px-4 flex items-center justify-center gap-2.5 font-black text-base sm:text-lg text-white transition-all cursor-pointer active:scale-95"
                  style={
                    !isPublicRoom
                      ? {
                          background:
                            'linear-gradient(180deg, rgba(16, 185, 129, 0.32) 0%, rgba(5, 102, 72, 0.5) 100%)',
                          border: '2px solid #10b981',
                          boxShadow: '0 0 22px rgba(16, 185, 129, 0.55)'
                        }
                      : {
                          background: 'linear-gradient(180deg, #0c2b40 0%, #071c2b 100%)',
                          border: '1.5px solid rgba(125, 211, 252, 0.35)'
                        }
                  }
                >
                  {!isPublicRoom && (
                    <span className="w-6 h-6 rounded-full bg-[#10b981] text-slate-950 flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4 stroke-[3.5]" />
                    </span>
                  )}
                  <Lock className="w-5 h-5 text-emerald-300" />
                  <span>خاصة</span>
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-bold text-center">
                {errorMsg}
              </div>
            )}
          </div>

          {/* Giant Overlapping Lime-Green Pill Button: «🎮 إنشاء الغرفة» */}
          <button
            type="button"
            onClick={handleCreateRoomSubmit}
            disabled={isSubmitting}
            className="relative z-20 -mt-7 w-[82%] max-w-md h-16 sm:h-18 rounded-full font-black text-xl sm:text-2xl text-[#072210] flex items-center justify-center gap-3 shadow-[0_10px_30px_rgba(163,230,53,0.45),inset_0_2px_2px_rgba(255,255,255,0.65)] border-2 border-[#e2ff80] hover:brightness-105 active:scale-95 transition-all cursor-pointer disabled:opacity-85 disabled:cursor-wait"
            style={{
              background: 'linear-gradient(180deg, #dbff4d 0%, #a3e635 55%, #65a30d 100%)'
            }}
          >
            {isSubmitting ? (
              <>
                <div className="w-6 h-6 border-3 border-[#072210] border-t-transparent rounded-full animate-spin shrink-0" />
                <span>جاري إنشاء الغرفة...</span>
              </>
            ) : (
              <>
                {/* Dark Green Gamepad SVG */}
                <svg viewBox="0 0 56 40" className="w-10 h-8 shrink-0">
                  <path
                    d="M14,6 H42 C48,6 52,11 53,19 L54,28 C55,34 50,38 45,38 C41,38 38,35 35,30 H21 C18,35 15,38 11,38 C6,38 1,34 2,28 L3,19 C4,11 8,6 14,6 Z"
                    fill="#0b3b14"
                  />
                  <rect x="12" y="16" width="9" height="3" rx="1" fill="#d9ff43" />
                  <rect x="15" y="13" width="3" height="9" rx="1" fill="#d9ff43" />
                  <circle cx="40" cy="15" r="2" fill="#d9ff43" />
                  <circle cx="44" cy="19" r="2" fill="#d9ff43" />
                  <circle cx="36" cy="19" r="2" fill="#d9ff43" />
                  <circle cx="40" cy="23" r="2" fill="#d9ff43" />
                </svg>
                <span>إنشاء الغرفة</span>
              </>
            )}
          </button>
        </div>
      ) : (
        /* =================================================================== */
        /* MODE B: JOIN ROOM VIEW (دخول الغرفه .png)                            */
        /* =================================================================== */
        <div className="relative z-10 w-full max-w-xl mx-auto px-4 pb-16 pt-1 flex flex-col items-center my-auto">
          {/* Top 3 Colorful 3D Players Icon (Blue, Yellow Center, Pink) */}
          <div className="relative flex flex-col items-center -mb-3 z-20">
            <svg viewBox="0 0 180 95" className="w-40 sm:w-44 h-22 drop-shadow-[0_8px_18px_rgba(0,0,0,0.75)]">
              <defs>
                <radialGradient id="blueAvatarGrad" cx="35%" cy="30%" r="70%">
                  <stop offset="0%" stopColor="#7dd3fc" />
                  <stop offset="55%" stopColor="#0ea5e9" />
                  <stop offset="100%" stopColor="#0369a1" />
                </radialGradient>
                <radialGradient id="pinkAvatarGrad" cx="35%" cy="30%" r="70%">
                  <stop offset="0%" stopColor="#f9a8d4" />
                  <stop offset="55%" stopColor="#ec4899" />
                  <stop offset="100%" stopColor="#9d174d" />
                </radialGradient>
                <radialGradient id="goldAvatarGrad" cx="35%" cy="30%" r="70%">
                  <stop offset="0%" stopColor="#fef08a" />
                  <stop offset="55%" stopColor="#facc15" />
                  <stop offset="100%" stopColor="#ca8a04" />
                </radialGradient>
              </defs>
              {/* Left Blue Player */}
              <circle cx="52" cy="36" r="14" fill="url(#blueAvatarGrad)" />
              <path d="M24,84 C24,62 37,54 52,54 C67,54 78,62 78,84 Z" fill="url(#blueAvatarGrad)" />
              {/* Right Pink Player */}
              <circle cx="128" cy="36" r="14" fill="url(#pinkAvatarGrad)" />
              <path d="M102,84 C102,62 113,54 128,54 C143,54 156,62 156,84 Z" fill="url(#pinkAvatarGrad)" />
              {/* Center Large Gold Player */}
              <circle cx="90" cy="26" r="18" fill="url(#goldAvatarGrad)" />
              <path d="M54,88 C54,60 70,48 90,48 C110,48 126,60 126,88 Z" fill="url(#goldAvatarGrad)" />
            </svg>
          </div>

          {/* Glowing Title Capsule: «انضمام إلى غرفة» */}
          <div
            className="px-10 sm:px-14 py-2.5 rounded-full border-2 border-[#2dd4bf] shadow-[0_0_25px_rgba(45,212,191,0.45)] z-10 mb-3"
            style={{
              background: 'linear-gradient(180deg, #082836 0%, #041520 100%)'
            }}
          >
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              انضمام إلى غرفة
            </h1>
          </div>

          {/* Subtitle */}
          <p className="text-sm sm:text-base font-bold text-slate-200 text-center max-w-md mb-5">
            أدخل رمز الغرفة للانضمام إلى اللعبة
          </p>

          {/* Main Glowing Cyan Card */}
          <div
            className="w-full rounded-[32px] p-5 sm:p-7 mb-5"
            style={{
              background: 'linear-gradient(180deg, rgba(8, 36, 54, 0.94) 0%, rgba(4, 20, 32, 0.97) 100%)',
              border: '2px solid rgba(34, 211, 238, 0.75)',
              boxShadow:
                '0 0 38px rgba(34, 211, 238, 0.28), inset 0 0 24px rgba(34, 211, 238, 0.14)'
            }}
          >
            {/* Label: # رمز الغرفة */}
            <div className="flex items-center justify-start gap-2 text-lg sm:text-xl font-black text-white mb-4">
              <span className="text-2xl font-black text-white">#</span>
              <span>رمز الغرفة</span>
            </div>

            {/* 5 Individual Glowing Cyan Character Boxes ([K] [W] [T] [5] [5]) */}
            <div className="flex items-center justify-center gap-2.5 sm:gap-3.5 mb-6" dir="ltr">
              {[0, 1, 2, 3, 4].map((idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    codeInputsRef.current[idx] = el;
                  }}
                  type="text"
                  inputMode="text"
                  maxLength={2}
                  value={codeChars[idx] || ''}
                  onChange={(e) => handleCodeCharChange(idx, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(idx, e)}
                  onPaste={handleCodePaste}
                  onFocus={(e) => e.target.select()}
                  className="w-13 h-14 sm:w-16 sm:h-17 rounded-2xl text-center text-2xl sm:text-3xl font-black font-mono text-white uppercase focus:outline-none focus:scale-105 transition-all"
                  style={{
                    background: 'linear-gradient(180deg, #09263a 0%, #051624 100%)',
                    border: '2px solid #22d3ee',
                    boxShadow:
                      '0 0 18px rgba(34, 211, 238, 0.45), inset 0 0 10px rgba(34, 211, 238, 0.2)'
                  }}
                />
              ))}
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-bold text-center">
                <div>{errorMsg}</div>
                {errorMsg.includes('غير متوفرة') && (
                  <button
                    type="button"
                    onClick={() => handleCreateRoomWithCode(codeChars.join(''))}
                    className="mt-2.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 mx-auto hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow"
                  >
                    <span>أنشئ غرفة بهذا الرمز ({codeChars.join('')}) فوراً 🎮</span>
                  </button>
                )}
              </div>
            )}

            {/* Glossy Lime-to-Mint Pill Button: «دخول الغرفة» */}
            <button
              type="button"
              onClick={() => joinRoomByCode(codeChars.join(''))}
              disabled={isSubmitting}
              className="w-full h-14 sm:h-16 rounded-full font-black text-xl sm:text-2xl text-[#052014] flex items-center justify-center gap-3 shadow-[0_8px_28px_rgba(52,211,153,0.45),inset_0_2px_2px_rgba(255,255,255,0.65)] border-2 border-[#a7f3d0] hover:brightness-105 active:scale-95 transition-all cursor-pointer disabled:opacity-85 disabled:cursor-wait"
              style={{
                background: 'linear-gradient(90deg, #2dd4bf 0%, #84f56b 50%, #d9ff43 100%)'
              }}
            >
              {isSubmitting ? (
                <>
                  <div className="w-6 h-6 border-3 border-[#052014] border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>جاري الدخول للغرفة...</span>
                </>
              ) : (
                <>
                  {/* Enter Door Icon matching screenshot */}
                  <svg viewBox="0 0 32 32" className="w-7 h-7 shrink-0">
                    <path
                      d="M18,6 H25 C26.6,6 28,7.4 28,9 V23 C28,24.6 26.6,26 25,26 H18"
                      fill="none"
                      stroke="#052014"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    <path
                      d="M6,16 H20 M15,10 L21,16 L15,22"
                      fill="none"
                      stroke="#052014"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>دخول الغرفة</span>
                </>
              )}
            </button>

            {/* Active Public Rooms Chips if any are waiting */}
            {publicRooms.length > 0 && (
              <div className="mt-4 pt-3.5 border-t border-cyan-500/25 text-right">
                <span className="text-[11px] font-black text-cyan-300 block mb-2">
                  غرف مفتوحة حالياً بالانتظار (اضغط للدخول المباشر):
                </span>
                <div className="flex flex-wrap gap-2">
                  {publicRooms.map((r) => (
                    <button
                      key={r.code}
                      type="button"
                      onClick={() => {
                        sounds.playTap();
                        setCodeChars(r.code.toUpperCase().split(''));
                        joinRoomByCode(r.code);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-cyan-950/90 hover:bg-cyan-900 border border-cyan-400/60 text-xs font-mono font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105 active:scale-95 shadow"
                    >
                      <span className="text-lime-400 font-black">#{r.code}</span>
                      <span className="text-slate-300 text-[11px]">({r.roomName})</span>
                      <span className="text-[10px] text-amber-300 bg-amber-400/15 px-1 rounded">1/2</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Divider with «أو» */}
          <div className="w-full flex items-center gap-4 mb-4 px-2">
            <div className="flex-1 h-px bg-slate-700/80" />
            <span className="text-sm sm:text-base font-black text-white">أو</span>
            <div className="flex-1 h-px bg-slate-700/80" />
          </div>

          {/* Scan QR / Browse Open Rooms Pill Button: «مسح رمز QR» */}
          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              const ws = getWebSocket();
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'GET_PUBLIC_ROOMS', payload: {} }));
              }
              setShowQrModal(true);
            }}
            className="w-full h-14 sm:h-15 rounded-full px-6 mb-4 flex items-center justify-center gap-3 text-white font-black text-base sm:text-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            style={{
              background: 'linear-gradient(180deg, #0b2638 0%, #061826 100%)',
              border: '1.5px solid rgba(125, 211, 252, 0.45)',
              boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)'
            }}
          >
            <QrCode className="w-6 h-6 text-white" />
            <span>مسح رمز QR</span>
          </button>

          {/* Info Box at Bottom */}
          <div
            className="w-full rounded-2xl p-4 flex items-center justify-between gap-3"
            style={{
              background: 'rgba(6, 24, 38, 0.88)',
              border: '1.5px solid rgba(56, 189, 248, 0.3)'
            }}
          >
            <div className="w-7 h-7 rounded-full border-2 border-cyan-400 text-cyan-300 flex items-center justify-center shrink-0">
              <Info className="w-4 h-4" />
            </div>
            <p className="text-xs sm:text-sm font-bold text-slate-300 text-right flex-1 leading-relaxed">
              يمكنك الحصول على رمز الغرفة من صاحب الغرفة (الذي أنشأها).
            </p>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* BOTTOM KUWAIT FLAG & GLOWING SKYLINE FOOTER                           */}
      {/* ===================================================================== */}
      <div className="pointer-events-none relative z-0 w-full h-24 -mt-12 overflow-hidden">
        <svg viewBox="0 0 500 110" className="w-full h-full object-cover" preserveAspectRatio="none">
          {/* Bottom-Left Waving Kuwait Flag */}
          <path d="M-10,30 Q90,55 210,95 L210,110 L-10,110 Z" fill="#007A3D" />
          <path d="M-10,50 Q90,72 210,103 L210,110 L-10,110 Z" fill="#FFFFFF" />
          <path d="M-10,70 Q90,90 210,109 L210,110 L-10,110 Z" fill="#CE1126" />
          <polygon points="-10,28 38,52 30,90 -10,98" fill="#000000" />

          {/* Bottom-Right Kuwait Towers Silhouette */}
          <g fill="#38bdf8" opacity="0.8">
            <polygon points="455,15 458,15 461,110 452,110" />
            <circle cx="456.5" cy="52" r="10" />
            <circle cx="456.5" cy="32" r="6" fill="#bae6fd" />
            <polygon points="435,32 438,32 440,110 433,110" />
            <circle cx="436.5" cy="64" r="7" />
            <polygon points="420,45 422,45 424,110 418,110" />
          </g>
        </svg>
      </div>

      {/* ===================================================================== */}
      {/* QR SCANNER & LIVE AVAILABLE ROOMS MODAL                               */}
      {/* ===================================================================== */}
      {showQrModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl p-6 text-right border-2 border-cyan-400/70 shadow-2xl"
            style={{
              background: 'linear-gradient(180deg, #0b283d 0%, #041320 100%)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2 text-white font-black text-base">
                <QrCode className="w-5 h-5 text-cyan-400" />
                <span>مسح رمز QR أو اختيار غرفة نشطة</span>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Simulated QR Camera Frame */}
            <div className="p-5 rounded-2xl bg-slate-950/90 border border-cyan-500/40 text-center mb-4 relative overflow-hidden">
              <div className="w-28 h-28 mx-auto rounded-2xl border-2 border-dashed border-cyan-400 flex items-center justify-center relative mb-2">
                <QrCode className="w-14 h-14 text-cyan-400/80 animate-pulse" />
                <div className="absolute inset-x-2 top-1/2 h-0.5 bg-lime-400 shadow-[0_0_8px_#a3e635]" />
              </div>
              <p className="text-xs text-slate-300 font-bold">
                وجّه الكاميرا نحو رمز QR الخاص بصاحب الغرفة أو اختر من الغرف المتاحة بالأسفل:
              </p>
            </div>

            {/* Live Open Rooms List */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-cyan-300">
                  الغرف المتاحة للانضمام الفوري ({publicRooms.length}):
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const ws = getWebSocket();
                    if (ws.readyState === WebSocket.OPEN) {
                      ws.send(JSON.stringify({ type: 'GET_PUBLIC_ROOMS', payload: {} }));
                    }
                  }}
                  className="text-xs text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>تحديث</span>
                </button>
              </div>

              {publicRooms.length === 0 ? (
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400 text-center">
                  لا توجد غرف عامة بالانتظار حالياً — يمكنك إنشاء غرفة جديدة ومشاركة رمزها!
                </div>
              ) : (
                <div className="space-y-2 max-h-44 overflow-y-auto">
                  {publicRooms.map((r) => (
                    <div
                      key={r.code}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="text-right">
                        <div className="text-xs font-black text-white">
                          {r.roomName || `غرفة ${r.hostName}`}
                        </div>
                        <div className="text-[11px] text-cyan-300">
                          الرمز: <span className="font-mono font-black">{r.code}</span> • {getCategoryName(r.categoryId)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCodeChars(r.code.padEnd(5, '5').slice(0, 5).split(''));
                          setShowQrModal(false);
                          joinRoomByCode(r.code);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-lime-400 text-slate-950 font-black text-xs cursor-pointer"
                      >
                        دخول فوري
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* Friends & Direct Invites Modal */}
      <FriendsModal
        isOpen={showFriendsModal}
        onClose={() => {
          setShowFriendsModal(false);
          fetchFriendsList();
        }}
        currentUser={user}
        activeCategoryId={selectedCategory}
        activeStagesCount={stagesCount}
        onJoinRoomCode={(code) => {
          setCodeChars(code.padEnd(5, '5').slice(0, 5).split(''));
          setMode('JOIN');
          joinRoomByCode(code);
        }}
        onCreatePrivateRoomAndInvite={(friend) => {
          pendingAutoInviteRef.current = friend;
          setIsPublicRoom(false);
          const code = generateFiveCharCode('KWT');
          const socket = getWebSocket();
          const currentPlayer = getPlayerPayload();
          const cleanRoomName = roomName.trim() || `غرفة ${defaultFirstName}`;
          const sendCreate = () => {
            socket.send(
              JSON.stringify({
                type: 'ROOM_CREATE',
                payload: {
                  code,
                  roomName: cleanRoomName,
                  player: currentPlayer,
                  categoryId: selectedCategory,
                  levelNumber: 1,
                  stagesCount,
                  isPublic: false
                }
              })
            );
          };
          if (socket.readyState === WebSocket.OPEN) {
            sendCreate();
          } else {
            socket.addEventListener('open', sendCreate, { once: true });
          }
        }}
        onUpdateUser={onUpdateUser}
      />
    </div>
  );
};
