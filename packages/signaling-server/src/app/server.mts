import * as http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { ClientToServerEvents, ServerToClientEvents } from '@tunnel2/signaling-types';
import { AuthRateLimiter, RateLimitConfig } from './auth-rate-limiter.mjs';
import { ConnectionEmitter, ConnectionHandler } from './connection-handler.mjs';
import { KeyStore } from './key-store.mjs';
import { MatchingService } from './matching-service.mjs';

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxPerIp: 5,
  maxGlobal: 30,
  maxTrackedIps: 10_000,
};

/** シグナリングサーバ作成時の設定。 */
export interface ServerOptions {
  debug?: boolean;
  allowedOrigins?: string[];
  rateLimit?: Partial<RateLimitConfig>;
}

/** Express/HTTP サーバへ Socket.IO ベースのシグナリング機能を接続する。 */
export function createSignalingServer(
  httpServer: http.Server,
  keyStore: KeyStore,
  options: ServerOptions = {},
): SocketIOServer<ClientToServerEvents, ServerToClientEvents> {
  const rateLimiter = new AuthRateLimiter({
    ...DEFAULT_RATE_LIMIT,
    ...options.rateLimit,
  });
  const matchingService = new MatchingService();
  const handlers = new Map<string, ConnectionHandler>();

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: options.debug
      ? { origin: true, credentials: true }
      : {
          origin: (origin, callback) => {
            if (!origin) {
              callback(null, true);
              return;
            }

            if ((options.allowedOrigins ?? []).includes(origin)) {
              callback(null, true);
              return;
            }

            callback(new Error('origin not allowed'));
          },
          credentials: true,
        },
  });

  io.on('connection', (socket) => {
    const emitter: ConnectionEmitter = {
      emitChallenge: (nonce) => socket.emit('challenge', { nonce }),
      emitAuthResult: (payload) => socket.emit('authResult', payload),
      emitMatched: (payload) => socket.emit('matched', payload),
      emitSignal: (payload) => socket.emit('signal', payload),
      emitError: (message) => socket.emit('error', { message }),
      disconnect: () => socket.disconnect(true),
    };

    const directory = {
      get: (socketId: string) => handlers.get(socketId) ?? null,
    };

    const handler = new ConnectionHandler(
      socket.id,
      socket.handshake.address || 'unknown',
      emitter,
      keyStore,
      rateLimiter,
      matchingService,
      directory,
    );

    handlers.set(socket.id, handler);
    handler.onConnect();

    socket.on('authenticate', (payload) => handler.onAuthenticate(payload));
    socket.on('join', (payload) => handler.onJoin(payload));
    socket.on('signal', (payload) => handler.onSignal(payload));
    socket.on('disconnect', () => {
      handler.onDisconnect();
      handlers.delete(socket.id);
    });
  });

  return io;
}