import * as crypto from 'node:crypto';
import * as http from 'node:http';
import express from 'express';
import { AddressInfo } from 'node:net';
import { io, Socket } from 'socket.io-client';
import { ClientToServerEvents, ServerToClientEvents } from '@tunnel2/signaling-types';
import { KeyStore } from './key-store.mjs';
import { createSignalingServer } from './server.mjs';

function createKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');

  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

function waitForEvent<EventName extends Extract<keyof ServerToClientEvents, string>>(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  eventName: EventName,
): Promise<Parameters<ServerToClientEvents[EventName]>[0]> {
  return new Promise((resolve) => {
    socket.once(eventName, ((payload: Parameters<ServerToClientEvents[EventName]>[0]) => {
      resolve(payload);
    }) as (...args: never[]) => void);
  });
}

describe('createSignalingServer', () => {
  it('2 クライアントを認証・マッチングして signal を中継する', async () => {
    const listenKeys = createKeyPair();
    const forwardKeys = createKeyPair();
    const app = express();
    const httpServer = http.createServer(app);
    const ioServer = createSignalingServer(
      httpServer,
      new KeyStore([
        { group_name: 'team-alpha', keys: [listenKeys.publicKeyPem, forwardKeys.publicKeyPem] },
      ]),
      { debug: true },
    );

    await new Promise<void>((resolve) => {
      httpServer.listen(0, resolve);
    });

    const port = (httpServer.address() as AddressInfo).port;
    const url = `http://127.0.0.1:${port}`;
    const listenSocket: Socket<ServerToClientEvents, ClientToServerEvents> = io(url, {
      autoConnect: false,
      reconnection: false,
      transports: ['websocket'],
    });
    const forwardSocket: Socket<ServerToClientEvents, ClientToServerEvents> = io(url, {
      autoConnect: false,
      reconnection: false,
      transports: ['websocket'],
    });

    try {
      const listenChallengePromise = waitForEvent(listenSocket, 'challenge');
      const forwardChallengePromise = waitForEvent(forwardSocket, 'challenge');
      listenSocket.connect();
      forwardSocket.connect();

      const listenChallenge = await listenChallengePromise;
      const forwardChallenge = await forwardChallengePromise;

      const listenAuthResultPromise = waitForEvent(listenSocket, 'authResult');
      const forwardAuthResultPromise = waitForEvent(forwardSocket, 'authResult');

      listenSocket.emit('authenticate', {
        publicKey: listenKeys.publicKeyPem,
        signature: crypto
          .sign(null, Buffer.from(listenChallenge.nonce, 'hex'), listenKeys.privateKeyPem)
          .toString('hex'),
      });
      forwardSocket.emit('authenticate', {
        publicKey: forwardKeys.publicKeyPem,
        signature: crypto
          .sign(null, Buffer.from(forwardChallenge.nonce, 'hex'), forwardKeys.privateKeyPem)
          .toString('hex'),
      });

      await expect(listenAuthResultPromise).resolves.toEqual({ success: true, groupName: 'team-alpha' });
      await expect(forwardAuthResultPromise).resolves.toEqual({ success: true, groupName: 'team-alpha' });

      const listenMatchedPromise = waitForEvent(listenSocket, 'matched');
      const forwardMatchedPromise = waitForEvent(forwardSocket, 'matched');
      listenSocket.emit('join', { mode: 'listen', room: 'room_1' });
      forwardSocket.emit('join', { mode: 'forward', room: 'room_1' });

      await expect(listenMatchedPromise).resolves.toEqual({ role: 'listen' });
      await expect(forwardMatchedPromise).resolves.toEqual({ role: 'forward' });

      const forwardedSignalPromise = waitForEvent(forwardSocket, 'signal');
      listenSocket.emit('signal', { data: 'offer-base64' });

      await expect(forwardedSignalPromise).resolves.toEqual({ data: 'offer-base64' });
    } finally {
      listenSocket.disconnect();
      forwardSocket.disconnect();
      ioServer.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});