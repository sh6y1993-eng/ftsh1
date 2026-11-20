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
import { OnlineRoom } from '../types/game';

const PRIMARY_BROKER = 'wss://broker.emqx.io:8084/mqtt';
const BACKUP_BROKER = 'wss://broker.hivemq.com:8884/mqtt';

const env = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env || {};

const DEFAULT_PUBLIC_SUPABASE_URL = 'https://seapoygnqbuzebwzvztf.supabase.co';
const DEFAULT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_CpeWqXKruUzo97uHh5Ccuw_DSfaTWOX';

const SUPABASE_URL = String(
  env.VITE_SUPABASE_URL ||
    env.NEXT_PUBLIC_SUPABASE_URL ||
    env.SUPABASE_URL ||
    DEFAULT_PUBLIC_SUPABASE_URL
)
  .trim()
  .replace(/\/+$/, '');

const SUPABASE_ANON_KEY = String(
  env.VITE_SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    DEFAULT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
).trim();

export function isPublicMqttFallbackEnabled(): boolean {
  if (env.PROD || isNativeIOSApp()) {
    return false;
  }
  return true;
}

type RoomMessageCallback = (msg: {
  type: string;
  payload: any;
  senderId: string;
  messageId?: string;
  serverSignature?: string;
}) => void;

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

  /**
   * Persist active room snapshot in Supabase Cloud so a friend entering the 5-char room code
   * on another phone/TV (e.g. on ftsh1.vercel.app) can join even while the Host's phone tab
   * is temporarily backgrounded in WhatsApp sending the room code.
   */
  public async saveCloudRoomSnapshot(room: OnlineRoom): Promise<void> {
    if (!room?.code || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    const cleanCode = room.code.trim().toLowerCase();
    const cacheKey = `room_cache_${cleanCode}`;
    try {
      const payload = {
        id: cacheKey,
        username: cacheKey,
        display_name: `ROOM_${room.code.toUpperCase()}`,
        completed_levels: {
          __room: room,
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
        return snapshot;
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch {
      return null;
    }
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
