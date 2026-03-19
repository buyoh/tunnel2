import * as crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { AuthenticatePayload } from '@tunnel2/signaling-types';
import { MockTransport } from './transport/mock-transport.mjs';
import { SignalingApp, SignalingSocket, WsSignaling } from './ws-signaling.mjs';

function createKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');

  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

class FakeSocket extends EventEmitter implements SignalingSocket {
  readonly clientEvents: Array<{ event: string; payload: unknown }> = [];

  emit(event: 'authenticate', payload: AuthenticatePayload): boolean;
  emit(event: 'join', payload: { mode: 'listen' | 'forward'; room: string }): boolean;
  emit(event: 'signal', payload: { data: string }): boolean;
  emit(event: string, payload?: unknown): boolean {
    this.clientEvents.push({ event, payload });
    return true;
  }

  disconnect(): boolean {
    return super.emit('disconnect');
  }

  serverEmit(event: string, payload?: unknown): void {
    super.emit(event, payload);
  }
}

class FakeApp extends EventEmitter implements SignalingApp {
  state = 'idle';
  readonly listenPorts: number[] = [];
  readonly forwardTargets: Array<{ host: string; port: number }> = [];
  readonly remoteOffers: string[] = [];
  readonly remoteAnswers: string[] = [];
  closeCount = 0;

  getState(): string {
    return this.state;
  }

  async listen(port: number): Promise<void> {
    this.listenPorts.push(port);
    this.state = 'waiting-answer';
    this.emit('offer-ready', 'offer-base64');
  }

  async forward(host: string, port: number): Promise<void> {
    this.forwardTargets.push({ host, port });
    this.state = 'waiting-offer';
  }

  async setRemoteOffer(encoded: string): Promise<void> {
    this.remoteOffers.push(encoded);
    this.state = 'connecting';
    this.emit('answer-ready', 'answer-base64');
    this.emit('connected');
  }

  async setRemoteAnswer(encoded: string): Promise<void> {
    this.remoteAnswers.push(encoded);
    this.state = 'connecting';
    this.emit('connected');
  }

  close(): void {
    this.closeCount += 1;
    this.state = 'closed';
  }
}

describe('WsSignaling', () => {
  it('listen モードで認証・join・signal を処理する', async () => {
    const socket = new FakeSocket();
    const app = new FakeApp();
    const { privateKeyPem, publicKeyPem } = createKeyPair();
    const signaling = new WsSignaling(
      {
        create: () => ({ app, transport: new MockTransport() }),
      },
      {
        serverUrl: 'ws://signal.test',
        privateKeyPath: '',
        publicKeyPath: '',
        privateKeyPem,
        publicKeyPem,
        mode: 'listen',
        room: 'room_1',
        listenPort: 8080,
      },
      {
        create: () => socket,
      },
    );

    signaling.start();
    socket.serverEmit('challenge', { nonce: 'ab'.repeat(32) });

    const authenticate = socket.clientEvents.find((entry) => entry.event === 'authenticate');
    expect(authenticate?.payload).toMatchObject({ publicKey: publicKeyPem });

    socket.serverEmit('authResult', { success: true, groupName: 'team-alpha' });
    expect(socket.clientEvents.find((entry) => entry.event === 'join')?.payload).toEqual({
      mode: 'listen',
      room: 'room_1',
    });

    socket.serverEmit('matched', { role: 'listen' });
    await Promise.resolve();

    expect(app.listenPorts).toEqual([8080]);
    expect(socket.clientEvents.find((entry) => entry.event === 'signal')?.payload).toEqual({
      data: 'offer-base64',
    });

    socket.serverEmit('signal', { data: 'answer-base64' });
    await Promise.resolve();

    expect(app.remoteAnswers).toEqual(['answer-base64']);
    signaling.stop();
  });

  it('P2P 切断時に新しいセッションを作り直して再接続する', async () => {
    const sockets = [new FakeSocket(), new FakeSocket()];
    const apps = [new FakeApp(), new FakeApp()];
    const { privateKeyPem, publicKeyPem } = createKeyPair();
    let socketIndex = 0;
    let appIndex = 0;
    const signaling = new WsSignaling(
      {
        create: () => ({ app: apps[appIndex++], transport: new MockTransport() }),
      },
      {
        serverUrl: 'ws://signal.test',
        privateKeyPath: '',
        publicKeyPath: '',
        privateKeyPem,
        publicKeyPem,
        mode: 'listen',
        room: 'room_1',
        listenPort: 8080,
      },
      {
        create: () => sockets[socketIndex++],
      },
    );

    signaling.start();
    sockets[0].serverEmit('challenge', { nonce: 'cd'.repeat(32) });
    sockets[0].serverEmit('authResult', { success: true, groupName: 'team-alpha' });
    sockets[0].serverEmit('matched', { role: 'listen' });
    await Promise.resolve();
    sockets[0].serverEmit('signal', { data: 'answer-base64' });
    await Promise.resolve();

    apps[0].emit('disconnected');
    await Promise.resolve();

    expect(apps[0].closeCount).toBe(1);
    expect(socketIndex).toBe(2);
    signaling.stop();
  });
});