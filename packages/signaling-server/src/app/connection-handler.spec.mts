import * as crypto from 'node:crypto';
import { AuthenticatePayload, SignalPayload } from '@tunnel2/signaling-types';
import { AuthRateLimiter } from './auth-rate-limiter.mjs';
import { ConnectionEmitter, ConnectionHandler } from './connection-handler.mjs';
import { KeyStore } from './key-store.mjs';
import { MatchingService } from './matching-service.mjs';

function createKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');

  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

class TestEmitter implements ConnectionEmitter {
  readonly challenges: string[] = [];
  readonly authResults: Array<{ success: boolean; groupName?: string; error?: string }> = [];
  readonly matched: Array<{ role: 'listen' | 'forward' }> = [];
  readonly signals: SignalPayload[] = [];
  readonly errors: string[] = [];
  disconnected = false;

  emitChallenge(nonce: string): void {
    this.challenges.push(nonce);
  }

  emitAuthResult(payload: { success: boolean; groupName?: string; error?: string }): void {
    this.authResults.push(payload);
  }

  emitMatched(payload: { role: 'listen' | 'forward' }): void {
    this.matched.push(payload);
  }

  emitSignal(payload: SignalPayload): void {
    this.signals.push(payload);
  }

  emitError(message: string): void {
    this.errors.push(message);
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

function signAuthenticatePayload(publicKeyPem: string, privateKeyPem: string, nonce: string): AuthenticatePayload {
  return {
    publicKey: publicKeyPem,
    signature: crypto.sign(null, Buffer.from(nonce, 'hex'), privateKeyPem).toString('hex'),
  };
}

describe('ConnectionHandler', () => {
  it('接続時に challenge を発行する', () => {
    const emitter = new TestEmitter();
    const handler = new ConnectionHandler(
      'socket-1',
      '127.0.0.1',
      emitter,
      new KeyStore([]),
      new AuthRateLimiter({ windowMs: 60_000, maxPerIp: 5, maxGlobal: 30, maxTrackedIps: 100 }),
      new MatchingService(),
      { get: () => null },
    );

    handler.onConnect();

    expect(emitter.challenges[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('認証失敗時に auth failure を返して切断する', () => {
    const { publicKeyPem } = createKeyPair();
    const emitter = new TestEmitter();
    const handler = new ConnectionHandler(
      'socket-1',
      '127.0.0.1',
      emitter,
      new KeyStore([]),
      new AuthRateLimiter({ windowMs: 60_000, maxPerIp: 5, maxGlobal: 30, maxTrackedIps: 100 }),
      new MatchingService(),
      { get: () => null },
    );

    handler.onConnect();
    handler.onAuthenticate({ publicKey: publicKeyPem, signature: '00' });

    expect(emitter.authResults).toEqual([{ success: false, error: 'authentication failed' }]);
    expect(emitter.disconnected).toBe(true);
  });

  it('認証・join・signal relay のフローを処理する', () => {
    const listenKeys = createKeyPair();
    const forwardKeys = createKeyPair();
    const emitters = new Map<string, TestEmitter>();
    const handlers = new Map<string, ConnectionHandler>();
    const keyStore = new KeyStore([
      { group_name: 'team-alpha', keys: [listenKeys.publicKeyPem, forwardKeys.publicKeyPem] },
    ]);
    const matchingService = new MatchingService();
    const rateLimiter = new AuthRateLimiter({
      windowMs: 60_000,
      maxPerIp: 5,
      maxGlobal: 30,
      maxTrackedIps: 100,
    });
    const directory = {
      get: (socketId: string) => handlers.get(socketId) ?? null,
    };

    const listenEmitter = new TestEmitter();
    const forwardEmitter = new TestEmitter();
    emitters.set('listen-1', listenEmitter);
    emitters.set('forward-1', forwardEmitter);

    const listenHandler = new ConnectionHandler(
      'listen-1',
      '127.0.0.1',
      listenEmitter,
      keyStore,
      rateLimiter,
      matchingService,
      directory,
    );
    const forwardHandler = new ConnectionHandler(
      'forward-1',
      '127.0.0.2',
      forwardEmitter,
      keyStore,
      rateLimiter,
      matchingService,
      directory,
    );

    handlers.set('listen-1', listenHandler);
    handlers.set('forward-1', forwardHandler);

    listenHandler.onConnect();
    forwardHandler.onConnect();

    listenHandler.onAuthenticate(
      signAuthenticatePayload(
        listenKeys.publicKeyPem,
        listenKeys.privateKeyPem,
        listenEmitter.challenges[0],
      ),
    );
    forwardHandler.onAuthenticate(
      signAuthenticatePayload(
        forwardKeys.publicKeyPem,
        forwardKeys.privateKeyPem,
        forwardEmitter.challenges[0],
      ),
    );

    listenHandler.onJoin({ mode: 'listen', room: 'room_1' });
    forwardHandler.onJoin({ mode: 'forward', room: 'room_1' });

    expect(listenEmitter.matched).toEqual([{ role: 'listen' }]);
    expect(forwardEmitter.matched).toEqual([{ role: 'forward' }]);

    listenHandler.onSignal({ data: 'offer-data' });
    expect(forwardEmitter.signals).toEqual([{ data: 'offer-data' }]);
  });

  it('認証タイムアウトで切断する', () => {
    const emitter = new TestEmitter();
    let timeoutCallback: (() => void) | null = null;
    const handler = new ConnectionHandler(
      'socket-1',
      '127.0.0.1',
      emitter,
      new KeyStore([]),
      new AuthRateLimiter({ windowMs: 60_000, maxPerIp: 5, maxGlobal: 30, maxTrackedIps: 100 }),
      new MatchingService(),
      { get: () => null },
      {
        setTimeout: (callback) => {
          timeoutCallback = callback;
          const handle = {
            ref: () => handle,
            unref: () => handle,
          };
          return handle;
        },
        clearTimeout: () => {
          timeoutCallback = null;
        },
      },
    );

    handler.onConnect();
    if (timeoutCallback) {
      timeoutCallback();
    }

    expect(emitter.errors).toContain('authentication timeout');
    expect(emitter.disconnected).toBe(true);
  });
});