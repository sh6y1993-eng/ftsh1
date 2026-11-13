/**
 * Universal Real-time Multiplayer Engine for Fatteshha
 * Works seamlessly on:
 * - Netlify static CDN hosting (across different phones, browsers, incognito windows)
 * - Local Node.js / Express dev server
 * Uses public secure WebSocket MQTT brokers (EMQX & HiveMQ) as global serverless relay.
 */
import mqtt, { MqttClient } from 'mqtt';
import { OnlineRoom, OnlineRoomPlayer } from '../types/game';

const PRIMARY_BROKER = 'wss://broker.emqx.io:8084/mqtt';
const BACKUP_BROKER = 'wss://broker.hivemq.com:8884/mqtt';

type RoomMessageCallback = (msg: {
  type: string;
  payload: any;
  senderId: string;
}) => void;

class RealtimeSyncManager {
  private client: MqttClient | null = null;
  private currentTopic: string | null = null;
  private callback: RoomMessageCallback | null = null;
  private isConnecting = false;

  private connect(brokerUrl = PRIMARY_BROKER): Promise<MqttClient> {
    return new Promise((resolve, reject) => {
      if (this.client && this.client.connected) {
        return resolve(this.client);
      }

      this.isConnecting = true;
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
            console.warn('Switching to backup MQTT broker...');
            this.connect(BACKUP_BROKER).then(resolve).catch(reject);
          } else {
            reject(new Error('Failed to connect to real-time relay'));
          }
        }
      }, 6000);

      client.on('connect', () => {
        clearTimeout(timeout);
        this.isConnecting = false;
        this.client = client;
        resolve(client);
      });

      client.on('message', (topic, payload) => {
        try {
          const parsed = JSON.parse(payload.toString());
          if (this.callback) {
            this.callback(parsed);
          }
        } catch {
          // Ignore invalid JSON
        }
      });

      client.on('error', (err) => {
        console.warn('Realtime sync broker notice:', err.message);
      });
    });
  }

  public async subscribeToRoom(roomCode: string, onMessage: RoomMessageCallback) {
    const topic = `fatteshha/rooms/v1/${roomCode.toUpperCase()}`;
    this.currentTopic = topic;
    this.callback = onMessage;

    try {
      const client = await this.connect();
      client.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          console.warn('Failed to subscribe to room topic:', err);
        }
      });
    } catch (err) {
      console.warn('Could not subscribe to room broker:', err);
    }
  }

  public async publishToRoom(roomCode: string, type: string, payload: any, senderId: string) {
    const topic = `fatteshha/rooms/v1/${roomCode.toUpperCase()}`;
    const msg = JSON.stringify({ type, payload, senderId });

    try {
      const client = await this.connect();
      client.publish(topic, msg, { qos: 1 });
    } catch {
      // Offline fallback
    }
  }

  public leaveRoom() {
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
