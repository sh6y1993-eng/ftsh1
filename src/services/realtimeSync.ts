/**
 * Real-time multiplayer synchronization manager.
 * - Primary transport (all environments including Vercel production & native iOS):
 *   First-party Supabase Realtime Broadcast channels + Supabase Cloud Room Snapshot store.
 * - Legacy third-party public MQTT relay (broker.emqx.io / broker.hivemq.com) remains strictly
 *   disabled in production builds and native iOS apps.
 */
import mqtt, { MqttClient } from 'mqtt';
import { RealtimeChannel } from '@supabase/supabase-js';
import { isNativeIOSApp } from '../utils/iosNative';
import { supabase } from './supabaseClient';
import {
  OnlineRoom,
  ClaimedWordRecord,
  OnlineRoomPlayer,
  PublicRoomSummary,
  FriendProfileSummary,
  RoomInviteNotification
} from '../types/game';
import { normalizeArabicWord } from '../engine/wordSearch';

const PRIMARY_BROKER = 'wss://broker.emqx.io:8084/mqtt';
const BACKUP_BROKER = 'wss://broker.hivemq.com:8884/mqtt';

const env = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env || {};

function normalizeSupabaseUrl(raw?: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  let trimmed = raw
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')
    .trim()
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/^\/+/, '');
  const mdMatch = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (mdMatch) {
    trimmed = (mdMatch[2] || mdMatch[1]).trim();
  }
  const urlMatch = trimmed.match(/https?:\/\/[^\s)\]"'<>`]+/i);
  if (urlMatch) {
    trimmed = urlMatch[0].replace(/\/+$/, '');
  }
  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      parsed.hostname.includes('.') &&
      !parsed.hostname.endsWith('.vercel.app') &&
      !parsed.hostname.endsWith('.netlify.app')
    ) {
      return `${parsed.protocol}//${parsed.host}`;
    }
  } catch {
    // invalid URL
  }
  return '';
}

const DEFAULT_PUBLIC_SUPABASE_URL = 'https://seapoygnqbuzebwzvztf.supabase.co';
const DEFAULT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_CpeWqXKruUzo97uHh5Ccuw_DSfaTWOX';

const SUPABASE_URL =
  normalizeSupabaseUrl(env.VITE_SUPABASE_URL) ||
  normalizeSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL) ||
  normalizeSupabaseUrl(env.SUPABASE_URL) ||
  DEFAULT_PUBLIC_SUPABASE_URL;

const SUPABASE_ANON_KEY = String(
  env.VITE_SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    DEFAULT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
).trim();

export const ONLINE_PLAYER_COLORS = ['#0ea5e9', '#ec4899', '#10b981', '#f59e0b'] as const;

export function assignSeatColor(
  players?: Record<string, OnlineRoomPlayer> | OnlineRoomPlayer[],
  isHost = false
): string {
  if (isHost) return ONLINE_PLAYER_COLORS[0];
  const list = Array.isArray(players) ? players : Object.values(players || {});
  const used = new Set(list.map(p => (p?.color || '').toLowerCase()).filter(Boolean));
  const available = ONLINE_PLAYER_COLORS.find(c => !used.has(c.toLowerCase()));
  if (available) return available;
  return ONLINE_PLAYER_COLORS[list.length % ONLINE_PLAYER_COLORS.length];
}

export function isPublicMqttFallbackEnabled(): boolean {
  if (env.PROD || isNativeIOSApp()) {
    return false;
  }
  return true;
}

/**
 * Resolves a raw or display word to the canonical placement `word` key in `room.wordPlacements`.
 */
export function resolveCanonicalPlacementWord(room: OnlineRoom, rawWord: string): string {
  if (!rawWord) return '';
  const norm = normalizeArabicWord(rawWord);
  const direct = (room.wordPlacements || []).find(
    wp => wp.word === rawWord || normalizeArabicWord(wp.word) === norm || normalizeArabicWord(wp.displayWord || '') === norm
  );
  return direct ? direct.word : rawWord;
}

/**
 * Enforces the invariant that each target word in a round belongs to AT MOST ONE player
 * (the earliest claimer), and rebuilds `wordPlacements[*].foundBy`, `players[*].wordsFound`,
 * and round `players[*].score` strictly from the single-owner `claimedWords` ledger.
 */
export function normalizeRoomWordOwnership(room: OnlineRoom): OnlineRoom {
  if (!room || !Array.isArray(room.wordPlacements) || room.wordPlacements.length === 0) {
    return room;
  }

  const players = room.players || {};
  const playerIds = Object.keys(players);
  const claimedWords: Record<string, ClaimedWordRecord> = {};

  const registerClaim = (candidate: ClaimedWordRecord) => {
    const canonical = resolveCanonicalPlacementWord(room, candidate.word);
    if (!canonical) return;
    const existing = claimedWords[canonical];
    if (!existing) {
      claimedWords[canonical] = {
        ...candidate,
        word: canonical
      };
      return;
    }
    // Earliest positive timestamp wins; on tie, keep existing
    const candTime = Number(candidate.claimedAt) || Number.MAX_SAFE_INTEGER;
    const existTime = Number(existing.claimedAt) || Number.MAX_SAFE_INTEGER;
    if (candTime < existTime) {
      claimedWords[canonical] = {
        ...candidate,
        word: canonical,
        cells: candidate.cells && candidate.cells.length >= 2 ? candidate.cells : existing.cells
      };
    } else if (!existing.cells?.length && candidate.cells && candidate.cells.length >= 2) {
      claimedWords[canonical] = {
        ...existing,
        cells: candidate.cells
      };
    }
  };

  // 1. Seed from explicit claimedWords ledger
  if (room.claimedWords && typeof room.claimedWords === 'object') {
    Object.values(room.claimedWords).forEach(rec => {
      if (rec && rec.word && rec.playerId) {
        registerClaim(rec);
      }
    });
  }

  // 2. Seed from wordPlacements.foundBy
  const sortedIdsForColors = [...playerIds].sort((a, b) =>
    a === room.hostId ? -1 : b === room.hostId ? 1 : a.localeCompare(b)
  );
  const getSeatColor = (p: OnlineRoomPlayer) => {
    if (p.color) return p.color;
    const idx = sortedIdsForColors.indexOf(p.id);
    return ONLINE_PLAYER_COLORS[Math.max(0, idx) % ONLINE_PLAYER_COLORS.length];
  };

  (room.wordPlacements || []).forEach(wp => {
    if (wp.foundBy && players[wp.foundBy]) {
      const p = players[wp.foundBy];
      registerClaim({
        word: wp.word,
        displayWord: wp.displayWord || wp.word,
        playerId: p.id,
        playerName: p.displayName || 'لاعب',
        playerColor: getSeatColor(p),
        claimedAt: (room.startedAt || room.createdAt || 1_700_000_000_000) + 1,
        wordScore: 150,
        cells: wp.cells
      });
    }
  });

  // 3. Seed from players[*].wordsFound (host first, then guests in deterministic order)
  const orderedPlayers = sortedIdsForColors
    .map(id => players[id])
    .filter(Boolean);

  orderedPlayers.forEach((p, pIdx) => {
    (p.wordsFound || []).forEach((w, wIdx) => {
      const canonical = resolveCanonicalPlacementWord(room, w);
      const wp = (room.wordPlacements || []).find(item => item.word === canonical);
      registerClaim({
        word: canonical,
        displayWord: wp?.displayWord || canonical,
        playerId: p.id,
        playerName: p.displayName || 'لاعب',
        playerColor: getSeatColor(p),
        claimedAt: (room.startedAt || room.createdAt || 1_700_000_000_000) + 100 + wIdx * 10 + pIdx,
        wordScore: 150,
        cells: wp?.cells
      });
    });
  });

  // 4. Rebuild wordPlacements with authoritative foundBy and cells
  const nextPlacements = (room.wordPlacements || []).map(wp => {
    const claim = claimedWords[wp.word];
    if (!claim) {
      return wp;
    }
    return {
      ...wp,
      foundBy: claim.playerId,
      cells: Array.isArray(claim.cells) && claim.cells.length >= 2 ? claim.cells : wp.cells
    };
  });

  // 5. Rebuild players[*].wordsFound and round scores strictly from single-owner claimedWords
  const nextPlayers: Record<string, OnlineRoomPlayer> = {};
  const claimsList = Object.values(claimedWords).sort((a, b) => (a.claimedAt || 0) - (b.claimedAt || 0));

  Object.entries(players).forEach(([pid, p]) => {
    const myClaims = claimsList.filter(c => String(c.playerId) === String(pid));
    const myWords = myClaims.map(c => c.word);
    const prevWordsCount = (p.wordsFound || []).length;
    const prevRoundScore = Number(p.score) || 0;
    const prevTotalScore = Number(p.totalScore ?? p.score) || 0;
    const baseTotalBeforeRound = Math.max(0, prevTotalScore - prevRoundScore);

    // If the player's wordsFound list changed (e.g. a duplicate word was stripped or a cloud word was added),
    // recompute round score deterministically so duplicate points can never persist.
    const computedRoundScore =
      myWords.length === 0
        ? 0
        : myWords.length === prevWordsCount && prevRoundScore > 0
          ? prevRoundScore
          : myClaims.reduce((sum, c) => sum + (Number(c.wordScore) || 150), 0);

    nextPlayers[pid] = {
      ...p,
      wordsFound: myWords,
      score: computedRoundScore,
      totalScore: baseTotalBeforeRound + computedRoundScore
    };
  });

  return {
    ...room,
    claimedWords,
    wordPlacements: nextPlacements,
    players: nextPlayers
  };
}

/**
 * Merges a local room state and a cloud room snapshot without ever allowing a stale tab
 * to overwrite words claimed by the opponent while the tab was backgrounded, and without
 * ever allowing the same word to belong to two players.
 */
export function mergeCloudAndLocalRooms(localRoom: OnlineRoom, cloudRoom: OnlineRoom | null): OnlineRoom {
  if (!cloudRoom || !cloudRoom.code || cloudRoom.code.toUpperCase() !== localRoom.code.toUpperCase()) {
    return normalizeRoomWordOwnership(localRoom);
  }

  const localRound = Number(localRoom.roundNumber) || 1;
  const cloudRound = Number(cloudRoom.roundNumber) || 1;

  if (cloudRound > localRound) {
    return normalizeRoomWordOwnership(cloudRoom);
  }
  if (localRound > cloudRound) {
    return normalizeRoomWordOwnership(localRoom);
  }

  // Same roundNumber: if one is PLAYING/FINISHED and the other is still WAITING, take the active one
  if (localRoom.state === 'WAITING' && cloudRoom.state !== 'WAITING') {
    return normalizeRoomWordOwnership(cloudRoom);
  }
  if (cloudRoom.state === 'WAITING' && localRoom.state !== 'WAITING') {
    return normalizeRoomWordOwnership(localRoom);
  }

  const normCloud = normalizeRoomWordOwnership(cloudRoom);
  const normLocal = normalizeRoomWordOwnership(localRoom);

  // Merge players (preserve latest metadata while keeping base totalScore prior to round)
  const mergedPlayers: Record<string, OnlineRoomPlayer> = {
    ...(normCloud.players || {}),
    ...(normLocal.players || {})
  };

  // Merge claimedWords: Cloud claims that already existed take precedence unless local claim has strictly earlier timestamp
  const mergedClaims: Record<string, ClaimedWordRecord> = {};
  const allClaimKeys = new Set([
    ...Object.keys(normCloud.claimedWords || {}),
    ...Object.keys(normLocal.claimedWords || {})
  ]);

  allClaimKeys.forEach(rawKey => {
    const canonical = resolveCanonicalPlacementWord(normCloud.wordPlacements?.length ? normCloud : normLocal, rawKey);
    const cClaim = normCloud.claimedWords?.[canonical] || normCloud.claimedWords?.[rawKey];
    const lClaim = normLocal.claimedWords?.[canonical] || normLocal.claimedWords?.[rawKey];

    if (cClaim && !lClaim) {
      mergedClaims[canonical] = { ...cClaim, word: canonical };
    } else if (lClaim && !cClaim) {
      mergedClaims[canonical] = { ...lClaim, word: canonical };
    } else if (cClaim && lClaim) {
      if (String(cClaim.playerId) === String(lClaim.playerId)) {
        mergedClaims[canonical] = {
          ...cClaim,
          word: canonical,
          cells: lClaim.cells && lClaim.cells.length >= 2 ? lClaim.cells : cClaim.cells
        };
      } else {
        // Conflict: two different players claimed the same word!
        // The cloud record (committed first while the other player was away) wins unless local has a strictly smaller timestamp.
        const cTime = Number(cClaim.claimedAt) || Number.MAX_SAFE_INTEGER;
        const lTime = Number(lClaim.claimedAt) || Number.MAX_SAFE_INTEGER;
        const winner = cTime <= lTime ? cClaim : lClaim;
        mergedClaims[canonical] = { ...winner, word: canonical };
      }
    }
  });

  // Construct merged base room and normalize ownership
  const isFinished = normCloud.state === 'FINISHED' || normLocal.state === 'FINISHED';
  const baseSource = normCloud.state === 'FINISHED' ? normCloud : normLocal;
  const isSpeedMode =
    normLocal.gameMode === 'SPEED_REVEAL_20S' || normCloud.gameMode === 'SPEED_REVEAL_20S';

  // SECURITY FIX 5 & 6: In SPEED_REVEAL_20S, turn ownership, sequence, and deadlines are strictly
  // server-authoritative and must NEVER be overwritten by untrusted client-writable cloud snapshots!
  const localSeq = Number(normLocal.speedTurnSeq) || 0;
  const cloudSeq = Number(normCloud.speedTurnSeq) || 0;
  const latestSpeedSrc = isSpeedMode ? normLocal : cloudSeq > localSeq ? normCloud : normLocal;

  const combined: OnlineRoom = {
    ...baseSource,
    turnOrder: isSpeedMode
      ? normLocal.turnOrder || normCloud.turnOrder
      : latestSpeedSrc.turnOrder || normCloud.turnOrder || normLocal.turnOrder,
    activeTurnPlayerId: isSpeedMode
      ? normLocal.activeTurnPlayerId || normCloud.activeTurnPlayerId
      : latestSpeedSrc.activeTurnPlayerId || baseSource.activeTurnPlayerId,
    speedTurnSeq: isSpeedMode
      ? localSeq || cloudSeq || 1
      : Math.max(localSeq, cloudSeq) || baseSource.speedTurnSeq,
    playerDeadlines: isSpeedMode
      ? normLocal.playerDeadlines || normCloud.playerDeadlines
      : latestSpeedSrc.playerDeadlines || baseSource.playerDeadlines,
    myRevealedCells: normLocal.myRevealedCells,
    grid: normLocal.grid?.length ? normLocal.grid : normCloud.grid,
    gridSize: normLocal.gridSize || normCloud.gridSize,
    words: normLocal.words?.length ? normLocal.words : normCloud.words,
    wordPlacements: (normLocal.wordPlacements?.length ? normLocal.wordPlacements : normCloud.wordPlacements || []).map(wp => ({
      ...wp,
      foundBy: mergedClaims[wp.word]?.playerId,
      cells: mergedClaims[wp.word]?.cells?.length ? mergedClaims[wp.word]!.cells! : wp.cells
    })),
    claimedWords: mergedClaims,
    players: Object.fromEntries(
      Object.entries(mergedPlayers).map(([pid, p]) => {
        const myAuthoritativeClaims = Object.values(mergedClaims).filter(
          c => String(c.playerId) === String(pid)
        );
        const prevRoundScore = Number(p.score) || 0;
        const prevTotalScore = Number(p.totalScore ?? p.score) || 0;
        const baseTotalBeforeRound = Math.max(0, prevTotalScore - prevRoundScore);
        const authoritativeRoundScore = myAuthoritativeClaims.reduce(
          (sum, c) => sum + (Number(c.wordScore) || 150),
          0
        );
        return [
          pid,
          {
            ...p,
            wordsFound: myAuthoritativeClaims.map(c => c.word),
            score: authoritativeRoundScore,
            totalScore: baseTotalBeforeRound + authoritativeRoundScore
          }
        ];
      })
    ),
    state: isFinished ? 'FINISHED' : baseSource.state
  };

  delete (combined as any).secretRevealedLetters;
  return normalizeRoomWordOwnership(combined);
}

type RoomMessageCallback = (msg: {
  type: string;
  payload: any;
  senderId: string;
  messageId?: string;
  serverSignature?: string;
}) => void;

const FORBIDDEN_CLIENT_RELAY_TYPES = new Set([
  'SPEED_TURN_TIMEOUT',
  'SECRET_LETTER_REVEALED',
  'SPEED_TIMEOUT_PENALTY',
  'FORCE_SPEED_TURN',
  'ADVANCE_SPEED_TURN'
]);

class RealtimeSyncManager {
  private client: MqttClient | null = null;
  private currentTopic: string | null = null;
  private currentRoomCode: string | null = null;
  private sbChannel: RealtimeChannel | null = null;
  private sbChannelReadyPromise: Promise<boolean> | null = null;
  private callback: RoomMessageCallback | null = null;
  private seenMessageIds: Set<string> = new Set();

  private handleIncomingPacket(parsed: any) {
    if (!parsed || typeof parsed.type !== 'string' || !parsed.senderId) {
      return;
    }
    const cleanType = parsed.type.trim().toUpperCase();
    // SECURITY FIX 5 & 6: Drop any client-relayed turn control or secret reveal packets
    if (FORBIDDEN_CLIENT_RELAY_TYPES.has(cleanType)) {
      return;
    }
    const cleanSender = String(parsed.senderId).trim();
    const payloadPlayerId = parsed.payload?.playerId ? String(parsed.payload.playerId).trim() : '';
    const payloadSenderId = parsed.payload?.senderId ? String(parsed.payload.senderId).trim() : '';
    if (payloadPlayerId && payloadPlayerId !== cleanSender && !cleanSender.startsWith('bot_')) {
      return;
    }
    if (payloadSenderId && payloadSenderId !== cleanSender && !cleanSender.startsWith('bot_')) {
      return;
    }
    if (parsed.messageId) {
      if (this.seenMessageIds.has(parsed.messageId)) {
        return;
      }
      this.seenMessageIds.add(parsed.messageId);
      if (this.seenMessageIds.size > 500) {
        const first = this.seenMessageIds.values().next().value;
        if (first) this.seenMessageIds.delete(first);
      }
    }
    if (this.callback) {
      this.callback(parsed);
    }
  }

  private ensureSupabaseChannel(roomCode: string): Promise<boolean> {
    const cleanCode = roomCode.trim().toUpperCase();
    if (!supabase || !cleanCode) {
      return Promise.resolve(false);
    }

    if (this.sbChannel && this.currentRoomCode === cleanCode && this.sbChannelReadyPromise) {
      return this.sbChannelReadyPromise;
    }

    if (this.sbChannel) {
      try {
        supabase.removeChannel(this.sbChannel);
      } catch {
        // Ignore
      }
      this.sbChannel = null;
      this.sbChannelReadyPromise = null;
    }

    this.currentRoomCode = cleanCode;
    const channelName = `fatteshha_room_${cleanCode}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false }
      }
    });

    channel.on('broadcast', { event: 'room_msg' }, (eventPayload) => {
      const msg = eventPayload?.payload || eventPayload;
      this.handleIncomingPacket(msg);
    });

    this.sbChannel = channel;
    this.sbChannelReadyPromise = new Promise<boolean>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, 2500);

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' && !settled) {
          settled = true;
          clearTimeout(timer);
          resolve(true);
        } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !settled) {
          settled = true;
          clearTimeout(timer);
          resolve(false);
        }
      });
    });

    return this.sbChannelReadyPromise;
  }

  private connect(brokerUrl = PRIMARY_BROKER): Promise<MqttClient> {
    if (!isPublicMqttFallbackEnabled()) {
      return Promise.reject(new Error('Public MQTT relay disabled in production / native iOS'));
    }

    return new Promise((resolve, reject) => {
      if (this.client && this.client.connected) {
        return resolve(this.client);
      }

      const clientId = `fatteshha_${Math.random().toString(36).substring(2, 9)}`;

      const client = mqtt.connect(brokerUrl, {
        clientId,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 3000
      });

      const timeout = setTimeout(() => {
        if (!client.connected) {
          client.end(true);
          if (brokerUrl === PRIMARY_BROKER) {
            this.connect(BACKUP_BROKER).then(resolve).catch(reject);
          } else {
            reject(new Error('Failed to connect to real-time relay'));
          }
        }
      }, 6000);

      client.on('connect', () => {
        clearTimeout(timeout);
        this.client = client;
        resolve(client);
      });

      client.on('message', (topic, payload) => {
        if (this.currentTopic && topic !== this.currentTopic) return;
        try {
          const parsed = JSON.parse(payload.toString());
          this.handleIncomingPacket(parsed);
        } catch {
          // Ignore invalid JSON
        }
      });

      client.on('error', () => {
        // Ignore transient broker notice
      });
    });
  }

  public async subscribeToRoom(roomCode: string, onMessage: RoomMessageCallback) {
    const cleanCode = roomCode.trim().toUpperCase();
    if (!cleanCode) return;

    const topic = `fatteshha/rooms/v1/${cleanCode}`;
    this.currentTopic = topic;
    this.callback = onMessage;

    // 1. Primary: First-party Supabase Realtime Broadcast channel (works in PROD Vercel, iOS, TV, and Dev)
    await this.ensureSupabaseChannel(cleanCode);

    // 2. Optional non-prod dev fallback
    if (isPublicMqttFallbackEnabled()) {
      try {
        const client = await this.connect();
        client.subscribe(topic, { qos: 1 }, () => {});
      } catch {
        // Relay unavailable; rely on Supabase Realtime / authoritative server
      }
    }
  }

  /**
   * Forces a fresh reconnection of the Supabase Realtime channel (crucial when iOS Safari returns from background).
   */
  public async reconnectRoomChannel(roomCode: string): Promise<void> {
    const cleanCode = (roomCode || '').trim().toUpperCase();
    if (!cleanCode || !supabase) return;
    if (this.sbChannel) {
      try {
        supabase.removeChannel(this.sbChannel);
      } catch {
        // Ignore
      }
      this.sbChannel = null;
      this.sbChannelReadyPromise = null;
    }
    await this.ensureSupabaseChannel(cleanCode);
  }

  public async publishToRoom(roomCode: string, type: string, payload: any, senderId: string) {
    const cleanCode = roomCode.trim().toUpperCase();
    const cleanSender = String(senderId || '').trim();
    if (!cleanCode || !cleanSender) return;

    const messageId = `rt_${cleanCode}_${cleanSender}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.seenMessageIds.add(messageId);
    const packet = { type, payload, senderId: cleanSender, messageId, timestamp: Date.now() };

    // 1. Primary: First-party Supabase Realtime Broadcast
    if (supabase) {
      try {
        await this.ensureSupabaseChannel(cleanCode);
        if (this.sbChannel) {
          await this.sbChannel.send({
            type: 'broadcast',
            event: 'room_msg',
            payload: packet
          });
        }
      } catch {
        // Continue to cloud snapshot / fallback
      }
    }

    // 2. Optional non-prod dev fallback
    if (isPublicMqttFallbackEnabled()) {
      const topic = `fatteshha/rooms/v1/${cleanCode}`;
      const msg = JSON.stringify(packet);
      try {
        const client = await this.connect();
        client.publish(topic, msg, { qos: 1 });
      } catch {
        // Offline fallback
      }
    }
  }

  private async writeRawCloudRoomSnapshot(room: OnlineRoom): Promise<void> {
    if (!room?.code || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    const cleanCode = room.code.trim().toLowerCase();
    const cacheKey = `room_cache_${cleanCode}`;
    const normalized = normalizeRoomWordOwnership(room);
    // Strip private per-player secret revealed letters so they NEVER leak through shared cloud snapshots
    const { myRevealedCells: _omitMyRevealed, ...publicSnapshot } = normalized as OnlineRoom & {
      secretRevealedLetters?: unknown;
    };
    delete (publicSnapshot as any).secretRevealedLetters;
    try {
      const payload = {
        id: cacheKey,
        username: cacheKey,
        display_name: `ROOM_${publicSnapshot.code.toUpperCase()}`,
        completed_levels: {
          __room: publicSnapshot,
          __updatedAt: Date.now()
        },
        updated_at: new Date().toISOString()
      };
      await globalThis.fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=username`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(payload)
      });
    } catch {
      // Ignore transient network errors
    }
  }

  /**
   * Persist active room snapshot in Supabase Cloud with automatic conflict-free merge
   * so a player returning from background can NEVER overwrite words caught by the opponent.
   */
  public async saveCloudRoomSnapshot(room: OnlineRoom, options?: { skipMerge?: boolean }): Promise<void> {
    if (!room?.code || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    let roomToSave = normalizeRoomWordOwnership(room);
    if (!options?.skipMerge && (room.state === 'PLAYING' || room.state === 'FINISHED')) {
      const existingCloud = await this.fetchCloudRoomSnapshot(room.code);
      if (existingCloud) {
        roomToSave = mergeCloudAndLocalRooms(roomToSave, existingCloud);
      }
    }
    await this.writeRawCloudRoomSnapshot(roomToSave);
  }

  /**
   * Atomically claims a word against the Supabase Cloud Room Snapshot store.
   * - Fetches the latest cloud snapshot first to verify whether the opponent already caught this word
   *   while the current player was outside Safari / offline.
   * - If already claimed by another player, rejects the duplicate claim and returns the synced room.
   * - If unclaimed, records the single authoritative owner with timestamp and saves to Supabase Cloud.
   */
  public async claimWordInCloudRoom(params: {
    room: OnlineRoom;
    word: string;
    displayWord: string;
    playerId: string;
    playerName: string;
    playerColor: string;
    wordScore: number;
    cells?: { row: number; col: number }[];
    claimedAt?: number;
  }): Promise<{
    claimed: boolean;
    alreadyClaimedByName?: string;
    alreadyClaimedById?: string;
    claimedAt: number;
    room: OnlineRoom;
  }> {
    const claimedAt = params.claimedAt || Date.now();
    const latestCloud = await this.fetchCloudRoomSnapshot(params.room.code);
    const mergedBase = mergeCloudAndLocalRooms(params.room, latestCloud);
    const canonicalWord = resolveCanonicalPlacementWord(mergedBase, params.word);

    const existingClaim = mergedBase.claimedWords?.[canonicalWord];
    if (existingClaim) {
      return {
        claimed: false,
        alreadyClaimedByName: existingClaim.playerName || 'الخصم',
        alreadyClaimedById: existingClaim.playerId,
        claimedAt: existingClaim.claimedAt || claimedAt,
        room: mergedBase
      };
    }

    const newClaim: ClaimedWordRecord = {
      word: canonicalWord,
      displayWord: params.displayWord || canonicalWord,
      playerId: params.playerId,
      playerName: params.playerName,
      playerColor: params.playerColor,
      claimedAt,
      wordScore: params.wordScore,
      cells: params.cells
    };

    const nextClaimedWords: Record<string, ClaimedWordRecord> = {
      ...(mergedBase.claimedWords || {}),
      [canonicalWord]: newClaim
    };

    const updatedRoom = normalizeRoomWordOwnership({
      ...mergedBase,
      claimedWords: nextClaimedWords,
      wordPlacements: (mergedBase.wordPlacements || []).map(wp =>
        wp.word === canonicalWord
          ? {
              ...wp,
              foundBy: params.playerId,
              cells: params.cells && params.cells.length >= 2 ? params.cells : wp.cells
            }
          : wp
      )
    });

    await this.writeRawCloudRoomSnapshot(updatedRoom);

    return {
      claimed: true,
      claimedAt,
      room: updatedRoom
    };
  }

  /**
   * Retrieve active room snapshot by 5-char room code from Supabase Cloud.
   */
  public async fetchCloudRoomSnapshot(roomCode: string): Promise<OnlineRoom | null> {
    const cleanCode = (roomCode || '').trim().toLowerCase();
    if (!cleanCode || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    const cacheKey = `room_cache_${cleanCode}`;
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;
      try {
        const res = await globalThis.fetch(
          `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(cacheKey)}&select=completed_levels,updated_at&limit=1`,
          {
            method: 'GET',
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`
            },
            ...(controller ? { signal: controller.signal } : {})
          }
        );
        if (!res.ok) return null;
        const rows = (await res.json()) as any[];
        if (!Array.isArray(rows) || rows.length === 0) return null;
        const snapshot = rows[0]?.completed_levels?.__room as OnlineRoom | undefined;
        const updatedAt = Number(rows[0]?.completed_levels?.__updatedAt) || 0;
        // Ignore stale rooms older than 3 hours
        if (!snapshot || !snapshot.code || (updatedAt > 0 && Date.now() - updatedAt > 3 * 60 * 60 * 1000)) {
          return null;
        }
        return normalizeRoomWordOwnership(snapshot);
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch {
      return null;
    }
  }

  /**
   * Retrieve all active public rooms (state === 'WAITING' && isPublic === true) from Supabase Cloud
   * and local room storage so public rooms work across all devices even when Express WebSocket is offline.
   */
  public async fetchCloudPublicRooms(): Promise<PublicRoomSummary[]> {
    const map = new Map<string, PublicRoomSummary>();
    const now = Date.now();
    const maxAgeMs = 30 * 60 * 1000; // 30 minutes active window

    const addRoomIfEligible = (room: OnlineRoom | null | undefined, updatedAtMs: number) => {
      if (!room || !room.code) return;
      if (!room.isPublic || room.state !== 'WAITING') return;
      if (updatedAtMs > 0 && now - updatedAtMs > maxAgeMs) return;
      const playersList = Object.values(room.players || {});
      const playerCount = playersList.length;
      const maxPlayers = room.maxPlayers || 2;
      if (playerCount <= 0 || playerCount >= maxPlayers) return;
      const host = playersList.find(p => p.id === room.hostId || p.isHost) || playersList[0];
      const codeUpper = String(room.code).trim().toUpperCase();
      map.set(codeUpper, {
        code: codeUpper,
        roomName: room.roomName || `غرفة ${host?.displayName || 'فتّشها'}`,
        hostName: host?.displayName || 'مضيف',
        hostUsername: host?.username || '',
        hostAvatar: host?.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=host',
        categoryId: room.categoryId || 'kuwait',
        gameMode: room.gameMode || 'WORD_RACE',
        difficulty: room.difficulty || 'MEDIUM',
        stagesCount: room.stagesCount || 1,
        maxPlayers,
        playerCount,
        createdAt: room.createdAt || updatedAtMs || now
      });
    };

    // 1. Check localStorage rooms first
    try {
      const rawLocal = localStorage.getItem('fatteshha_local_rooms_v1');
      if (rawLocal) {
        const localMap = JSON.parse(rawLocal) as Record<string, OnlineRoom>;
        for (const room of Object.values(localMap || {})) {
          addRoomIfEligible(room, room?.createdAt || now);
        }
      }
    } catch {
      // Ignore localStorage parse error
    }

    // 2. Query Supabase Cloud room_cache_* rows
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;
      try {
        const res = await globalThis.fetch(
          `${SUPABASE_URL}/rest/v1/profiles?username=like.room_cache_*&select=username,completed_levels,updated_at&order=updated_at.desc&limit=40`,
          {
            method: 'GET',
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`
            },
            ...(controller ? { signal: controller.signal } : {})
          }
        );
        if (res.ok) {
          const rows = (await res.json()) as any[];
          if (Array.isArray(rows)) {
            for (const row of rows) {
              const room = row?.completed_levels?.__room as OnlineRoom | undefined;
              const updatedAt =
                Number(row?.completed_levels?.__updatedAt) ||
                (row?.updated_at ? new Date(row.updated_at).getTime() : 0);
              addRoomIfEligible(room, updatedAt);
            }
          }
        }
      } catch {
        // Ignore network errors
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  private isInternalCacheUsername(username: string): boolean {
    const clean = (username || '').trim().toLowerCase();
    return (
      !clean ||
      clean.startsWith('room_cache_') ||
      clean.startsWith('social_cache_') ||
      clean.startsWith('sec_user_') ||
      clean.startsWith('audit_p') ||
      clean.startsWith('test_iso_')
    );
  }

  private getLocalSocialCache(username: string): { friends: string[]; invites: RoomInviteNotification[] } {
    const clean = (username || '').trim().toLowerCase();
    try {
      const raw = localStorage.getItem(`fatteshha_social_v1_${clean}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          friends: Array.isArray(parsed?.friends) ? parsed.friends : [],
          invites: Array.isArray(parsed?.invites) ? parsed.invites : []
        };
      }
    } catch {
      // Ignore
    }
    return { friends: [], invites: [] };
  }

  private saveLocalSocialCache(username: string, data: { friends: string[]; invites: RoomInviteNotification[] }) {
    const clean = (username || '').trim().toLowerCase();
    try {
      localStorage.setItem(`fatteshha_social_v1_${clean}`, JSON.stringify(data));
    } catch {
      // Ignore
    }
  }

  public async fetchCloudSocialState(
    username: string
  ): Promise<{ friends: string[]; invites: RoomInviteNotification[] }> {
    const clean = (username || '').trim().toLowerCase();
    const localState = this.getLocalSocialCache(clean);
    if (!clean || !SUPABASE_URL || !SUPABASE_ANON_KEY) return localState;

    const cacheKey = `social_cache_${clean}`;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;
    try {
      const res = await globalThis.fetch(
        `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(cacheKey)}&select=completed_levels&limit=1`,
        {
          method: 'GET',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`
          },
          ...(controller ? { signal: controller.signal } : {})
        }
      );
      if (res.ok) {
        const rows = (await res.json()) as any[];
        const social = rows?.[0]?.completed_levels?.__social;
        if (social) {
          const mergedFriends = Array.from(
            new Set([
              ...localState.friends,
              ...(Array.isArray(social.friends) ? social.friends : [])
            ].map((u: string) => String(u || '').trim().toLowerCase()).filter(Boolean))
          );
          const now = Date.now();
          const invites = (Array.isArray(social.invites) ? social.invites : localState.invites).filter(
            (inv: RoomInviteNotification) => inv && inv.roomCode && now - (inv.createdAt || 0) < 30 * 60 * 1000
          );
          const result = { friends: mergedFriends, invites };
          this.saveLocalSocialCache(clean, result);
          return result;
        }
      }
    } catch {
      // Fall back to local
    } finally {
      if (timer) clearTimeout(timer);
    }
    return localState;
  }

  public async saveCloudSocialState(
    username: string,
    state: { friends: string[]; invites: RoomInviteNotification[] }
  ): Promise<void> {
    const clean = (username || '').trim().toLowerCase();
    if (!clean) return;
    const normalized = {
      friends: Array.from(
        new Set((state.friends || []).map(f => String(f || '').trim().toLowerCase()).filter(Boolean))
      ),
      invites: (state.invites || []).slice(0, 15)
    };
    this.saveLocalSocialCache(clean, normalized);
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    const cacheKey = `social_cache_${clean}`;
    const payload = {
      id: cacheKey,
      username: cacheKey,
      display_name: `Social ${clean}`,
      avatar: 'social',
      level: 1,
      xp: 0,
      coins: 0,
      hints_remaining: 0,
      completed_levels: {
        __social: normalized,
        __updatedAt: Date.now()
      },
      multiplayer_wins: 0,
      multiplayer_losses: 0,
      achievements: [],
      updated_at: new Date().toISOString()
    };

    try {
      await globalThis.fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=username`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(payload)
      });
    } catch {
      // Ignore network failure
    }
  }

  private async fetchRecentRoomsAndPlayers(): Promise<{
    activePlayerRoomMap: Map<string, { room: OnlineRoom; updatedAt: number }>;
    roomPlayersByUsername: Map<string, OnlineRoomPlayer>;
  }> {
    const activePlayerRoomMap = new Map<string, { room: OnlineRoom; updatedAt: number }>();
    const roomPlayersByUsername = new Map<string, OnlineRoomPlayer>();
    const now = Date.now();

    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;
      try {
        const res = await globalThis.fetch(
          `${SUPABASE_URL}/rest/v1/profiles?username=like.room_cache_*&select=completed_levels,updated_at&order=updated_at.desc&limit=35`,
          {
            method: 'GET',
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`
            },
            ...(controller ? { signal: controller.signal } : {})
          }
        );
        if (res.ok) {
          const rows = (await res.json()) as any[];
          if (Array.isArray(rows)) {
            for (const row of rows) {
              const room = row?.completed_levels?.__room as OnlineRoom | undefined;
              const updatedAt =
                Number(row?.completed_levels?.__updatedAt) ||
                (row?.updated_at ? new Date(row.updated_at).getTime() : 0);
              if (!room || !room.code) continue;
              for (const p of Object.values(room.players || {})) {
                const uname = (p?.username || '').trim().toLowerCase();
                if (!uname) continue;
                if (!roomPlayersByUsername.has(uname)) {
                  roomPlayersByUsername.set(uname, p);
                }
                if (now - updatedAt < 25 * 60 * 1000 && room.state !== 'FINISHED' && !activePlayerRoomMap.has(uname)) {
                  activePlayerRoomMap.set(uname, { room, updatedAt });
                }
              }
            }
          }
        }
      } catch {
        // Ignore
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    return { activePlayerRoomMap, roomPlayersByUsername };
  }

  private buildFriendSummaryFromData(
    uname: string,
    profileRow: any | null,
    roomPlayer: OnlineRoomPlayer | undefined,
    activeRoomEntry: { room: OnlineRoom; updatedAt: number } | undefined
  ): FriendProfileSummary {
    const clean = uname.trim().toLowerCase();
    const displayName =
      profileRow?.display_name ||
      roomPlayer?.displayName ||
      (clean.startsWith('guest_') ? `ضيف ${clean.replace(/^guest_/, '').slice(0, 6)}` : clean);
    const avatar =
      profileRow?.avatar ||
      roomPlayer?.avatar ||
      `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(clean)}`;
    const level = Number(profileRow?.level) || 1;
    const xp = Number(profileRow?.xp) || 0;
    const multiplayerWins = Number(profileRow?.multiplayer_wins) || 0;
    const updatedAtMs = profileRow?.updated_at ? new Date(profileRow.updated_at).getTime() : 0;

    let onlineStatus: FriendProfileSummary['onlineStatus'] = 'OFFLINE';
    let activeRoomCode: string | undefined;
    let activeRoomName: string | undefined;

    if (activeRoomEntry) {
      if (activeRoomEntry.room.state === 'WAITING') {
        onlineStatus = 'IN_ROOM';
        activeRoomCode = activeRoomEntry.room.code;
        activeRoomName = activeRoomEntry.room.roomName || `غرفة #${activeRoomEntry.room.code}`;
      } else if (activeRoomEntry.room.state === 'PLAYING') {
        onlineStatus = 'IN_GAME';
      }
    } else if (updatedAtMs > 0 && Date.now() - updatedAtMs < 15 * 60 * 1000) {
      onlineStatus = 'ONLINE';
    } else if (roomPlayer) {
      onlineStatus = 'ONLINE';
    }

    return {
      id: profileRow?.id || roomPlayer?.id || `usr_${clean}`,
      username: clean,
      displayName,
      avatar,
      level,
      xp,
      multiplayerWins,
      onlineStatus,
      activeRoomCode,
      activeRoomName
    };
  }

  public async fetchCloudFriendsAndSuggestions(
    myUsername: string,
    localFriendUsernames: string[] = []
  ): Promise<{
    friends: FriendProfileSummary[];
    suggestions: FriendProfileSummary[];
    pendingInvites: RoomInviteNotification[];
    friendUsernames: string[];
  }> {
    const myClean = (myUsername || '').trim().toLowerCase();
    const socialState = await this.fetchCloudSocialState(myClean);
    const friendSet = new Set<string>(
      [...localFriendUsernames, ...socialState.friends]
        .map(u => String(u || '').trim().toLowerCase())
        .filter(u => u && u !== myClean && !this.isInternalCacheUsername(u))
    );

    const { activePlayerRoomMap, roomPlayersByUsername } = await this.fetchRecentRoomsAndPlayers();
    const profileMap = new Map<string, any>();

    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;
      try {
        const res = await globalThis.fetch(
          `${SUPABASE_URL}/rest/v1/profiles?select=id,username,display_name,avatar,level,xp,multiplayer_wins,updated_at&order=updated_at.desc&limit=80`,
          {
            method: 'GET',
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`
            },
            ...(controller ? { signal: controller.signal } : {})
          }
        );
        if (res.ok) {
          const rows = (await res.json()) as any[];
          if (Array.isArray(rows)) {
            for (const row of rows) {
              const u = String(row?.username || '').trim().toLowerCase();
              if (!this.isInternalCacheUsername(u)) {
                profileMap.set(u, row);
              }
            }
          }
        }
      } catch {
        // Ignore
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    const statusWeight: Record<string, number> = {
      IN_ROOM: 0,
      ONLINE: 1,
      IN_GAME: 2,
      OFFLINE: 3
    };

    const friends: FriendProfileSummary[] = Array.from(friendSet)
      .map(uname =>
        this.buildFriendSummaryFromData(
          uname,
          profileMap.get(uname) || null,
          roomPlayersByUsername.get(uname),
          activePlayerRoomMap.get(uname)
        )
      )
      .sort((a, b) => (statusWeight[a.onlineStatus] ?? 3) - (statusWeight[b.onlineStatus] ?? 3));

    const candidateUsernames = new Set<string>([
      ...Array.from(roomPlayersByUsername.keys()),
      ...Array.from(profileMap.keys())
    ]);
    const suggestions: FriendProfileSummary[] = [];
    for (const uname of candidateUsernames) {
      if (!uname || uname === myClean || friendSet.has(uname) || this.isInternalCacheUsername(uname)) continue;
      suggestions.push(
        this.buildFriendSummaryFromData(
          uname,
          profileMap.get(uname) || null,
          roomPlayersByUsername.get(uname),
          activePlayerRoomMap.get(uname)
        )
      );
    }
    suggestions.sort((a, b) => (statusWeight[a.onlineStatus] ?? 3) - (statusWeight[b.onlineStatus] ?? 3));

    return {
      friends,
      suggestions: suggestions.slice(0, 8),
      pendingInvites: socialState.invites,
      friendUsernames: Array.from(friendSet)
    };
  }

  public async searchCloudPlayers(
    query: string,
    viewerUsername: string,
    existingFriends: string[] = []
  ): Promise<FriendProfileSummary[]> {
    const q = (query || '').trim().replace(/^@/, '').toLowerCase();
    const myClean = (viewerUsername || '').trim().toLowerCase();
    if (!q) return [];
    const friendSet = new Set(existingFriends.map(u => String(u || '').trim().toLowerCase()));
    const { activePlayerRoomMap, roomPlayersByUsername } = await this.fetchRecentRoomsAndPlayers();
    const resultsMap = new Map<string, FriendProfileSummary>();

    // 1. Search players seen in recent rooms (including guest_* players!)
    for (const [uname, rp] of roomPlayersByUsername.entries()) {
      if (uname === myClean || friendSet.has(uname) || this.isInternalCacheUsername(uname)) continue;
      if (uname.includes(q) || (rp.displayName || '').toLowerCase().includes(q)) {
        resultsMap.set(
          uname,
          this.buildFriendSummaryFromData(uname, null, rp, activePlayerRoomMap.get(uname))
        );
      }
    }

    // 2. Search Supabase profiles
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;
      try {
        const res = await globalThis.fetch(
          `${SUPABASE_URL}/rest/v1/profiles?or=(username.ilike.*${encodeURIComponent(q)}*,display_name.ilike.*${encodeURIComponent(q)}*)&select=id,username,display_name,avatar,level,xp,multiplayer_wins,updated_at&limit=20`,
          {
            method: 'GET',
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`
            },
            ...(controller ? { signal: controller.signal } : {})
          }
        );
        if (res.ok) {
          const rows = (await res.json()) as any[];
          if (Array.isArray(rows)) {
            for (const row of rows) {
              const uname = String(row?.username || '').trim().toLowerCase();
              if (!uname || uname === myClean || friendSet.has(uname) || this.isInternalCacheUsername(uname)) {
                continue;
              }
              resultsMap.set(
                uname,
                this.buildFriendSummaryFromData(
                  uname,
                  row,
                  roomPlayersByUsername.get(uname),
                  activePlayerRoomMap.get(uname)
                )
              );
            }
          }
        }
      } catch {
        // Ignore
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    // 3. If the user typed an exact guest_* username (like guest_mwiatkds), allow direct match
    if (q.startsWith('guest_') && q.length >= 8 && q !== myClean && !friendSet.has(q) && !resultsMap.has(q)) {
      resultsMap.set(
        q,
        this.buildFriendSummaryFromData(q, null, roomPlayersByUsername.get(q), activePlayerRoomMap.get(q))
      );
    }

    return Array.from(resultsMap.values()).slice(0, 8);
  }

  public async addCloudFriend(
    myUsername: string,
    targetUsername: string,
    existingLocalFriends: string[] = []
  ): Promise<{
    ok: boolean;
    error?: string;
    addedFriend?: FriendProfileSummary;
    friends?: FriendProfileSummary[];
    suggestions?: FriendProfileSummary[];
    friendUsernames?: string[];
  }> {
    const myClean = (myUsername || '').trim().toLowerCase();
    const targetClean = (targetUsername || '').trim().replace(/^@/, '').toLowerCase();
    if (!myClean || !targetClean) {
      return { ok: false, error: 'يرجى إدخال اسم المستخدم أولاً' };
    }
    if (myClean === targetClean) {
      return { ok: false, error: 'لا يمكنك إضافة نفسك كصديق!' };
    }
    if (this.isInternalCacheUsername(targetClean)) {
      return { ok: false, error: 'لم يتم العثور على لاعب بهذا الاسم' };
    }

    const { activePlayerRoomMap, roomPlayersByUsername } = await this.fetchRecentRoomsAndPlayers();
    let targetRow: any | null = null;

    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;
      try {
        const res = await globalThis.fetch(
          `${SUPABASE_URL}/rest/v1/profiles?or=(username.eq.${encodeURIComponent(targetClean)},display_name.eq.${encodeURIComponent(targetUsername.trim())})&select=id,username,display_name,avatar,level,xp,multiplayer_wins,updated_at&limit=1`,
          {
            method: 'GET',
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`
            },
            ...(controller ? { signal: controller.signal } : {})
          }
        );
        if (res.ok) {
          const rows = (await res.json()) as any[];
          if (Array.isArray(rows) && rows.length > 0) {
            targetRow = rows[0];
          }
        }
      } catch {
        // Ignore
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    const resolvedUsername = String(targetRow?.username || targetClean).trim().toLowerCase();
    const roomPlayer = roomPlayersByUsername.get(resolvedUsername);

    if (!targetRow && !roomPlayer && !resolvedUsername.startsWith('guest_')) {
      return { ok: false, error: 'لم يتم العثور على لاعب بهذا الاسم الفريد' };
    }

    const mySocial = await this.fetchCloudSocialState(myClean);
    const nextMyFriends = Array.from(
      new Set([...existingLocalFriends, ...mySocial.friends, resolvedUsername].map(u => u.trim().toLowerCase()).filter(Boolean))
    );
    await this.saveCloudSocialState(myClean, {
      friends: nextMyFriends,
      invites: mySocial.invites
    });

    // Also add reciprocal friendship for target user in cloud social cache
    const targetSocial = await this.fetchCloudSocialState(resolvedUsername);
    if (!targetSocial.friends.includes(myClean)) {
      await this.saveCloudSocialState(resolvedUsername, {
        friends: [...targetSocial.friends, myClean],
        invites: targetSocial.invites
      });
    }

    const addedFriend = this.buildFriendSummaryFromData(
      resolvedUsername,
      targetRow,
      roomPlayer,
      activePlayerRoomMap.get(resolvedUsername)
    );
    const refreshed = await this.fetchCloudFriendsAndSuggestions(myClean, nextMyFriends);

    return {
      ok: true,
      addedFriend,
      friends: refreshed.friends,
      suggestions: refreshed.suggestions,
      friendUsernames: refreshed.friendUsernames
    };
  }

  public async removeCloudFriend(
    myUsername: string,
    friendUsername: string,
    existingLocalFriends: string[] = []
  ): Promise<{
    friends: FriendProfileSummary[];
    suggestions: FriendProfileSummary[];
    friendUsernames: string[];
  }> {
    const myClean = (myUsername || '').trim().toLowerCase();
    const targetClean = (friendUsername || '').trim().toLowerCase();
    const mySocial = await this.fetchCloudSocialState(myClean);
    const nextMyFriends = Array.from(
      new Set([...existingLocalFriends, ...mySocial.friends].map(u => u.trim().toLowerCase()))
    ).filter(u => u && u !== targetClean);

    await this.saveCloudSocialState(myClean, {
      friends: nextMyFriends,
      invites: mySocial.invites
    });

    return this.fetchCloudFriendsAndSuggestions(myClean, nextMyFriends);
  }

  public async sendCloudRoomInvite(invite: RoomInviteNotification): Promise<boolean> {
    const targetClean = (invite.toUsername || '').trim().toLowerCase();
    if (!targetClean || !invite.roomCode) return false;

    const targetSocial = await this.fetchCloudSocialState(targetClean);
    const filteredInvites = (targetSocial.invites || []).filter(
      i => !(i.fromUsername === invite.fromUsername && i.roomCode === invite.roomCode)
    );
    await this.saveCloudSocialState(targetClean, {
      friends: targetSocial.friends,
      invites: [invite, ...filteredInvites].slice(0, 15)
    });

    // Broadcast live invite over Supabase Realtime user channel
    if (supabase) {
      try {
        const channelName = `fatteshha_user_${targetClean}`;
        const ch = supabase.channel(channelName, {
          config: { broadcast: { self: false, ack: false } }
        });
        ch.subscribe(status => {
          if (status === 'SUBSCRIBED') {
            void ch
              .send({
                type: 'broadcast',
                event: 'user_invite',
                payload: invite
              })
              .finally(() => {
                setTimeout(() => {
                  try {
                    supabase?.removeChannel(ch);
                  } catch {
                    // Ignore
                  }
                }, 800);
              });
          }
        });
      } catch {
        // Ignore realtime error
      }
    }
    return true;
  }

  public async dismissCloudRoomInvite(
    myUsername: string,
    inviteId?: string,
    roomCode?: string
  ): Promise<RoomInviteNotification[]> {
    const myClean = (myUsername || '').trim().toLowerCase();
    const social = await this.fetchCloudSocialState(myClean);
    const nextInvites = (social.invites || []).filter(
      inv => inv.id !== inviteId && inv.roomCode !== roomCode
    );
    await this.saveCloudSocialState(myClean, {
      friends: social.friends,
      invites: nextInvites
    });
    return nextInvites;
  }

  public subscribeToUserInvites(
    myUsername: string,
    onInvite: (invite: RoomInviteNotification) => void
  ): () => void {
    const myClean = (myUsername || '').trim().toLowerCase();
    if (!myClean || !supabase) return () => {};
    const channelName = `fatteshha_user_${myClean}`;
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false, ack: false } }
    });
    channel
      .on('broadcast', { event: 'user_invite' }, ({ payload }) => {
        if (payload && payload.roomCode) {
          onInvite(payload as RoomInviteNotification);
        }
      })
      .subscribe();

    return () => {
      try {
        supabase?.removeChannel(channel);
      } catch {
        // Ignore
      }
    };
  }

  public leaveRoom() {
    if (this.sbChannel && supabase) {
      try {
        supabase.removeChannel(this.sbChannel);
      } catch {
        // Ignore
      }
      this.sbChannel = null;
      this.sbChannelReadyPromise = null;
      this.currentRoomCode = null;
    }
    if (this.client && this.currentTopic) {
      try {
        this.client.unsubscribe(this.currentTopic);
      } catch {
        // Ignore
      }
      this.currentTopic = null;
      this.callback = null;
    }
  }
}

export const realtimeSync = new RealtimeSyncManager();
