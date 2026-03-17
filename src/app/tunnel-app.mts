import { EventEmitter } from 'node:events';
import { decodeMessage } from './protocol-message.mjs';
import { decodeSignaling, encodeSignaling } from './signaling-data.mjs';
import { TunnelForwarder } from './tunnel-forwarder.mjs';
import { TunnelListener } from './tunnel-listener.mjs';
import { IP2PTransport } from './transport/p2p-transport.mjs';

/** P2P 接続のライフサイクルを表す状態。 */
export type AppState =
  | 'idle'
  | 'waiting-offer'
  | 'offering'
  | 'waiting-answer'
  | 'answering'
  | 'connecting'
  | 'connected'
  | 'closed';

/**
 * P2P 接続とトンネル起動の状態管理を行うアプリケーションコア。
 */
export class TunnelApp extends EventEmitter {
  private state: AppState = 'idle';
  private tunnel: TunnelListener | TunnelForwarder | null = null;

  constructor(private readonly transport: IP2PTransport) {
    super();

    this.transport.setBufferedAmountLowThreshold(256 * 1024);
    this.transport.setEvents({
      onOpen: () => {
        if (this.state !== 'connecting') {
          return;
        }
        if (this.tunnel instanceof TunnelListener) {
          this.tunnel.start();
        }
        this.setState('connected');
        this.emit('connected');
      },
      onMessage: (data: Buffer) => {
        if (!this.tunnel) {
          return;
        }
        try {
          this.tunnel.handleMessage(decodeMessage(data));
        } catch (error) {
          this.emit('error', error as Error);
        }
      },
      onClosed: () => {
        if (this.state === 'closed') {
          return;
        }
        this.tunnel?.stop();
        this.tunnel = null;
        this.setState('closed');
        this.emit('disconnected');
      },
      onStateChange: () => {
        // no-op
      },
      onBufferedAmountLow: () => {
        this.tunnel?.onBufferedAmountLow();
      },
    });
  }

  getState(): AppState {
    return this.state;
  }

  async listen(port: number): Promise<void> {
    this.ensureState('idle', 'listen() can only be called in idle state');

    this.tunnel = new TunnelListener(port, this.transport);
    this.setState('offering');

    const offer = await this.transport.createOffer();
    this.emit('offer-ready', encodeSignaling(offer));
    this.setState('waiting-answer');
  }

  async forward(host: string, port: number): Promise<void> {
    this.ensureState('idle', 'forward() can only be called in idle state');
    this.tunnel = new TunnelForwarder(host, port, this.transport);
    this.setState('waiting-offer');
  }

  async setRemoteOffer(encoded: string): Promise<void> {
    this.ensureState('waiting-offer', 'setRemoteOffer() can only be called in waiting-offer state');

    const offer = decodeSignaling(encoded);
    this.setState('answering');

    const answer = await this.transport.acceptOffer(offer);
    this.emit('answer-ready', encodeSignaling(answer));
    this.setState('connecting');
  }

  async setRemoteAnswer(encoded: string): Promise<void> {
    this.ensureState('waiting-answer', 'setRemoteAnswer() can only be called in waiting-answer state');

    const answer = decodeSignaling(encoded);
    this.transport.applyAnswer(answer);
    this.setState('connecting');
  }

  close(): void {
    this.tunnel?.stop();
    this.tunnel = null;
    this.transport.close();
    this.setState('closed');
  }

  private ensureState(expected: AppState, message: string): void {
    if (this.state !== expected) {
      throw new Error(message);
    }
  }

  private setState(state: AppState): void {
    this.state = state;
    this.emit('state-change', state);
  }
}