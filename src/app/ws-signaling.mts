import * as crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { io, Socket } from 'socket.io-client';
import {
  AuthenticatePayload,
  ClientToServerEvents,
  ErrorPayload,
  ServerToClientEvents,
  SignalPayload,
} from '@tunnel2/signaling-types';
import { IP2PTransport } from './transport/p2p-transport.mjs';

/** 再接続の待ち時間を指数バックオフで計算する。 */
export class ExponentialBackoff {
  private attempt = 0;
  private readonly maxDelay = 128_000;

  next(): number {
    const delay = Math.min(1000 * Math.pow(2, this.attempt), this.maxDelay);
    this.attempt += 1;
    return delay;
  }

  reset(): void {
    this.attempt = 0;
  }
}

/** WsSignaling が扱うアプリセッション。 */
export interface SignalingApp {
  on(event: 'offer-ready', listener: (encoded: string) => void): this;
  on(event: 'answer-ready', listener: (encoded: string) => void): this;
  on(event: 'connected', listener: () => void): this;
  on(event: 'disconnected', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  getState(): string;
  listen(port: number): Promise<void>;
  forward(host: string, port: number): Promise<void>;
  setRemoteOffer(encoded: string): Promise<void>;
  setRemoteAnswer(encoded: string): Promise<void>;
  close(): void;
}

export interface AppFactoryResult {
  app: SignalingApp;
  transport: IP2PTransport;
}

/** 再接続時に新しいトランスポートとアプリを生成するファクトリ。 */
export interface AppFactory {
  create(): AppFactoryResult;
}

export interface SignalingSocket {
  on(event: 'challenge', listener: (payload: Parameters<ServerToClientEvents['challenge']>[0]) => void): this;
  on(event: 'authResult', listener: (payload: Parameters<ServerToClientEvents['authResult']>[0]) => void): this;
  on(event: 'matched', listener: (payload: Parameters<ServerToClientEvents['matched']>[0]) => void): this;
  on(event: 'signal', listener: (payload: Parameters<ServerToClientEvents['signal']>[0]) => void): this;
  on(event: 'error', listener: (payload: ErrorPayload) => void): this;
  on(event: 'connect_error', listener: (error: Error) => void): this;
  on(event: 'disconnect', listener: () => void): this;
  emit(event: 'authenticate', payload: AuthenticatePayload): unknown;
  emit(event: 'join', payload: Parameters<ClientToServerEvents['join']>[0]): unknown;
  emit(event: 'signal', payload: Parameters<ClientToServerEvents['signal']>[0]): unknown;
  disconnect(): unknown;
  removeAllListeners(): this;
}

interface SocketFactory {
  create(url: string): SignalingSocket;
}

interface RetryTimers {
  setTimeout(callback: () => void, delayMs: number): NodeJS.Timeout;
  clearTimeout(handle: NodeJS.Timeout): void;
}

/** WebSocket シグナリング接続の設定。 */
export interface WsSignalingOptions {
  serverUrl: string;
  privateKeyPath: string;
  publicKeyPath: string;
  privateKeyPem?: string;
  publicKeyPem?: string;
  mode: 'listen' | 'forward';
  room: string;
  listenPort?: number;
  targetHost?: string;
  targetPort?: number;
}

/** TunnelApp を Socket.IO シグナリングで駆動するクライアント。 */
export class WsSignaling extends EventEmitter {
  private readonly backoff = new ExponentialBackoff();
  private readonly socketFactory: SocketFactory;
  private readonly timers: RetryTimers;
  private currentSocket: SignalingSocket | null = null;
  private currentSession: AppFactoryResult | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private authFailed = false;
  private ignoreSocketDisconnect = false;
  private ignoreAppDisconnect = false;
  private hasP2PConnection = false;
  private privateKeyPem: string | null = null;
  private publicKeyPem: string | null = null;

  constructor(
    private readonly appFactory: AppFactory,
    private readonly options: WsSignalingOptions,
    socketFactory: SocketFactory = {
      create: (url) =>
        io(url, {
          transports: ['websocket'],
          reconnection: false,
        }) as SignalingSocket,
    },
    timers: RetryTimers = {
      setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
      clearTimeout: (handle) => clearTimeout(handle),
    },
  ) {
    super();
    this.socketFactory = socketFactory;
    this.timers = timers;
  }

  start(): void {
    this.stopped = false;
    this.authFailed = false;
    this.ensureSession();
    this.connectWebSocket();
  }

  stop(): void {
    this.stopped = true;
    this.authFailed = false;
    this.hasP2PConnection = false;
    this.clearReconnectTimer();

    if (this.currentSocket) {
      this.ignoreSocketDisconnect = true;
      this.currentSocket.disconnect();
      this.currentSocket = null;
    }

    this.closeSession();
  }

  private connectWebSocket(): void {
    if (this.stopped || this.currentSocket) {
      return;
    }

    const socket = this.socketFactory.create(this.options.serverUrl);
    this.currentSocket = socket;

    socket.on('challenge', (payload) => {
      try {
        const authenticatePayload: AuthenticatePayload = {
          publicKey: this.loadPublicKey(),
          signature: signChallenge(this.loadPrivateKey(), payload.nonce),
        };
        socket.emit('authenticate', authenticatePayload);
      } catch (error) {
        this.emitError(error);
        this.authFailed = true;
        socket.disconnect();
      }
    });

    socket.on('authResult', (payload) => {
      if (!payload.success) {
        this.authFailed = true;
        this.emit('error', new Error(payload.error ?? 'authentication failed'));
        return;
      }
      this.backoff.reset();
      socket.emit('join', {
        mode: this.options.mode,
        room: this.options.room,
      });
    });

    socket.on('matched', async () => {
      try {
        await this.startAppForMode();
      } catch (error) {
        this.emitError(error);
      }
    });

    socket.on('signal', async (payload) => {
      try {
        await this.applySignal(payload);
      } catch (error) {
        this.emitError(error);
      }
    });

    socket.on('error', (payload: ErrorPayload) => {
      this.emit('error', new Error(payload.message));
    });

    socket.on('connect_error', (error) => {
      this.emit('error', error);
      this.releaseSocket(socket);
      this.scheduleReconnect(this.backoff.next());
    });

    socket.on('disconnect', () => {
      this.releaseSocket(socket);
      if (this.ignoreSocketDisconnect) {
        this.ignoreSocketDisconnect = false;
        return;
      }
      if (this.stopped || this.authFailed || this.hasP2PConnection) {
        return;
      }
      this.scheduleReconnect(this.backoff.next());
    });
  }

  private ensureSession(): void {
    if (this.currentSession) {
      return;
    }

    const session = this.appFactory.create();
    this.currentSession = session;

    session.app.on('offer-ready', (encoded: string) => {
      this.currentSocket?.emit('signal', { data: encoded });
    });

    session.app.on('answer-ready', (encoded: string) => {
      this.currentSocket?.emit('signal', { data: encoded });
    });

    session.app.on('connected', () => {
      this.backoff.reset();
      this.hasP2PConnection = true;
      if (this.currentSocket) {
        this.ignoreSocketDisconnect = true;
        this.currentSocket.disconnect();
      }
    });

    session.app.on('disconnected', () => {
      if (this.ignoreAppDisconnect) {
        return;
      }
      if (this.stopped || !this.hasP2PConnection) {
        return;
      }

      this.hasP2PConnection = false;
      this.closeSession();
      this.ensureSession();
      this.connectWebSocket();
    });

    session.app.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  private async startAppForMode(): Promise<void> {
    const session = this.currentSession;
    if (!session) {
      throw new Error('app session is not initialized');
    }

    if (this.options.mode === 'listen') {
      if (!this.options.listenPort) {
        throw new Error('listenPort is required for listen mode');
      }
      if (session.app.getState() === 'idle') {
        await session.app.listen(this.options.listenPort);
      }
      return;
    }

    if (!this.options.targetHost || !this.options.targetPort) {
      throw new Error('targetHost and targetPort are required for forward mode');
    }
    if (session.app.getState() === 'idle') {
      await session.app.forward(this.options.targetHost, this.options.targetPort);
    }
  }

  private async applySignal(payload: SignalPayload): Promise<void> {
    const session = this.currentSession;
    if (!session) {
      throw new Error('app session is not initialized');
    }

    if (this.options.mode === 'listen') {
      await session.app.setRemoteAnswer(payload.data);
      return;
    }

    await session.app.setRemoteOffer(payload.data);
  }

  private releaseSocket(socket: SignalingSocket): void {
    if (this.currentSocket !== socket) {
      return;
    }
    this.currentSocket.removeAllListeners();
    this.currentSocket = null;
  }

  private scheduleReconnect(delayMs: number): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = this.timers.setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }
    this.timers.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private closeSession(): void {
    if (!this.currentSession) {
      return;
    }

    this.ignoreAppDisconnect = true;
    this.currentSession.app.close();
    this.ignoreAppDisconnect = false;
    this.currentSession = null;
  }

  private loadPrivateKey(): string {
    if (this.options.privateKeyPem) {
      return this.options.privateKeyPem;
    }
    if (!this.privateKeyPem) {
      this.privateKeyPem = fs.readFileSync(this.options.privateKeyPath, 'utf-8');
    }
    return this.privateKeyPem;
  }

  private loadPublicKey(): string {
    if (this.options.publicKeyPem) {
      return this.options.publicKeyPem;
    }
    if (!this.publicKeyPem) {
      this.publicKeyPem = fs.readFileSync(this.options.publicKeyPath, 'utf-8');
    }
    return this.publicKeyPem;
  }

  private emitError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this.emit('error', err);
  }
}

/** 受け取った nonce を Ed25519 秘密鍵で署名する。 */
export function signChallenge(privateKeyPem: string, nonce: string): string {
  return crypto.sign(null, Buffer.from(nonce, 'hex'), privateKeyPem).toString('hex');
}