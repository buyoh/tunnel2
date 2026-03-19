import {
  AuthenticatePayload,
  AuthResultPayload,
  JoinPayload,
  MatchedPayload,
  SignalPayload,
} from '@tunnel2/signaling-types';
import { AuthRateLimiter } from './auth-rate-limiter.mjs';
import { KeyStore, generateChallenge, verifySignature } from './key-store.mjs';
import { MatchingMode, MatchingService, validateRoomName } from './matching-service.mjs';

type ConnectionState = 'connected' | 'authenticated' | 'joined' | 'matched' | 'disconnected';

interface TimerHandle {
  ref(): TimerHandle;
  unref(): TimerHandle;
}

interface TimerApi {
  setTimeout(callback: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

/** ConnectionHandler から外部へ通知する出力インターフェース。 */
export interface ConnectionEmitter {
  emitChallenge(nonce: string): void;
  emitAuthResult(payload: AuthResultPayload): void;
  emitMatched(payload: MatchedPayload): void;
  emitSignal(payload: SignalPayload): void;
  emitError(message: string): void;
  disconnect(): void;
}

/** 接続間の相互参照を提供するディレクトリ。 */
export interface ConnectionDirectory {
  get(socketId: string): ConnectionHandler | null;
}

/** 単一接続の認証・参加・中継状態を管理するオーケストレータ。 */
export class ConnectionHandler {
  private state: ConnectionState = 'connected';
  private nonce = '';
  private groupName: string | null = null;
  private mode: MatchingMode | null = null;
  private authTimeout: TimerHandle | null = null;

  constructor(
    private readonly id: string,
    private readonly ip: string,
    private readonly emitter: ConnectionEmitter,
    private readonly keyStore: KeyStore,
    private readonly rateLimiter: AuthRateLimiter,
    private readonly matchingService: MatchingService,
    private readonly directory: ConnectionDirectory,
    private readonly timers: TimerApi = {
      setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
      clearTimeout: (handle) => clearTimeout(handle),
    },
  ) {}

  onConnect(): void {
    if (!this.rateLimiter.isAllowed(this.ip)) {
      this.emitter.emitError('too many requests');
      this.emitter.disconnect();
      this.state = 'disconnected';
      return;
    }

    this.nonce = generateChallenge();
    this.emitter.emitChallenge(this.nonce);
    this.authTimeout = this.timers.setTimeout(() => {
      if (this.state !== 'authenticated' && this.state !== 'joined' && this.state !== 'matched') {
        this.emitter.emitError('authentication timeout');
        this.emitter.disconnect();
        this.state = 'disconnected';
      }
    }, 10_000);
    this.authTimeout.unref();
  }

  onAuthenticate(payload: AuthenticatePayload): void {
    if (this.state !== 'connected') {
      this.emitter.emitError('authentication is not allowed in the current state');
      return;
    }

    const groupName = this.keyStore.findGroup(payload.publicKey);
    const success =
      groupName !== null && verifySignature(payload.publicKey, this.nonce, payload.signature);

    if (!success || !groupName) {
      this.rateLimiter.recordFailure(this.ip);
      this.finishAuth({ success: false, error: 'authentication failed' }, true);
      return;
    }

    this.groupName = groupName;
    this.state = 'authenticated';
    this.finishAuth({ success: true, groupName }, false);
  }

  onJoin(payload: JoinPayload): void {
    if (this.state !== 'authenticated') {
      this.emitter.emitError('join is not allowed in the current state');
      return;
    }

    if (!validateRoomName(payload.room)) {
      this.emitter.emitError('invalid room name');
      return;
    }

    try {
      const result = this.matchingService.join(this.groupName ?? '', payload.room, this.id, payload.mode);
      this.mode = payload.mode;
      this.state = result.matched ? 'matched' : 'joined';

      if (!result.matched) {
        return;
      }

      this.markMatched(payload.mode);

      const peerId = payload.mode === 'listen' ? result.forwardSocketId : result.listenSocketId;
      const peer = this.directory.get(peerId);
      peer?.markMatched(payload.mode === 'listen' ? 'forward' : 'listen');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitter.emitError(err.message);
    }
  }

  onSignal(payload: SignalPayload): void {
    if (this.state !== 'matched') {
      this.emitter.emitError('signal is not allowed in the current state');
      return;
    }

    const peerId = this.matchingService.getPeerId(this.id);
    if (!peerId) {
      this.emitter.emitError('peer is not connected');
      return;
    }

    this.directory.get(peerId)?.relaySignal(payload);
  }

  onDisconnect(): void {
    this.clearAuthTimeout();
    this.matchingService.leave(this.id);
    this.state = 'disconnected';
  }

  markMatched(role: MatchingMode): void {
    this.state = 'matched';
    this.emitter.emitMatched({ role });
  }

  relaySignal(payload: SignalPayload): void {
    this.emitter.emitSignal(payload);
  }

  private finishAuth(payload: AuthResultPayload, shouldDisconnect: boolean): void {
    this.clearAuthTimeout();
    this.emitter.emitAuthResult(payload);

    if (shouldDisconnect) {
      this.emitter.disconnect();
      this.state = 'disconnected';
    }
  }

  private clearAuthTimeout(): void {
    if (!this.authTimeout) {
      return;
    }
    this.timers.clearTimeout(this.authTimeout);
    this.authTimeout = null;
  }
}