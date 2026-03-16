import { DataChannelTransport } from './datachannel.mjs';
import { P2PTransportEvents } from './interface.mjs';

class FakePeerConnection {
  private onStateChangeHandler: ((state: string) => void) | null = null;
  private onDataChannelHandler: ((dc: any) => void) | null = null;
  private onLocalDescriptionHandler: ((sdp: string, type: string) => void) | null = null;
  private onLocalCandidateHandler: ((candidate: string, mid: string) => void) | null = null;
  private onGatheringStateChangeHandler: ((state: string) => void) | null = null;

  readonly createdDataChannel = new FakeDataChannel();

  constructor(_label: string, _config: { iceServers: string[] }) {}

  createDataChannel(_label: string): FakeDataChannel {
    return this.createdDataChannel;
  }

  onStateChange(handler: (state: string) => void): void {
    this.onStateChangeHandler = handler;
  }

  onDataChannel(handler: (dc: any) => void): void {
    this.onDataChannelHandler = handler;
  }

  onLocalDescription(handler: (sdp: string, sdpType: string) => void): void {
    this.onLocalDescriptionHandler = handler;
  }

  onLocalCandidate(handler: (candidate: string, mid: string) => void): void {
    this.onLocalCandidateHandler = handler;
  }

  onGatheringStateChange(handler: (state: string) => void): void {
    this.onGatheringStateChangeHandler = handler;
  }

  setRemoteDescription(_sdp: string, _type: 'offer' | 'answer'): void {
    // no-op
  }

  addRemoteCandidate(_candidate: string, _mid: string): void {
    // no-op
  }

  close(): void {
    // no-op
  }

  emitStateChange(state: string): void {
    this.onStateChangeHandler?.(state);
  }

  emitDataChannel(dc: any): void {
    this.onDataChannelHandler?.(dc);
  }

  emitLocalDescription(sdp: string, type: string): void {
    this.onLocalDescriptionHandler?.(sdp, type);
  }

  emitLocalCandidate(candidate: string, mid: string): void {
    this.onLocalCandidateHandler?.(candidate, mid);
  }

  emitGatheringStateChange(state: string): void {
    this.onGatheringStateChangeHandler?.(state);
  }
}

class FakeDataChannel {
  private onOpenHandler: (() => void) | null = null;
  private onMessageHandler: ((message: any) => void) | null = null;
  private onClosedHandler: (() => void) | null = null;
  private onBufferedAmountLowHandler: (() => void) | null = null;

  onOpen(handler: () => void): void {
    this.onOpenHandler = handler;
  }

  onMessage(handler: (message: any) => void): void {
    this.onMessageHandler = handler;
  }

  onClosed(handler: () => void): void {
    this.onClosedHandler = handler;
  }

  onBufferedAmountLow(handler: () => void): void {
    this.onBufferedAmountLowHandler = handler;
  }

  bufferedAmount(): number {
    return 0;
  }

  setBufferedAmountLowThreshold(_size: number): void {
    // no-op
  }

  isOpen(): boolean {
    return true;
  }

  sendMessageBinary(_data: Buffer): void {
    // no-op
  }

  close(): void {
    // no-op
  }

  emitOpen(): void {
    this.onOpenHandler?.();
  }

  emitMessage(message: any): void {
    this.onMessageHandler?.(message);
  }

  emitClosed(): void {
    this.onClosedHandler?.();
  }

  emitBufferedAmountLow(): void {
    this.onBufferedAmountLowHandler?.();
  }
}

class FakeDataChannelWithoutOnClosed {
  private onOpenHandler: (() => void) | null = null;
  private onMessageHandler: ((message: any) => void) | null = null;
  private onBufferedAmountLowHandler: (() => void) | null = null;

  onOpen(handler: () => void): void {
    this.onOpenHandler = handler;
  }

  onMessage(handler: (message: any) => void): void {
    this.onMessageHandler = handler;
  }

  onBufferedAmountLow(handler: () => void): void {
    this.onBufferedAmountLowHandler = handler;
  }

  emitOpen(): void {
    this.onOpenHandler?.();
  }

  emitMessage(message: any): void {
    this.onMessageHandler?.(message);
  }

  emitBufferedAmountLow(): void {
    this.onBufferedAmountLowHandler?.();
  }
}

describe('DataChannelTransport', () => {
  function createEvents(spy: { closed: number; states: string[] }): P2PTransportEvents {
    return {
      onOpen: () => {},
      onMessage: () => {},
      onClosed: () => {
        spy.closed += 1;
      },
      onStateChange: (state) => {
        spy.states.push(state);
      },
      onBufferedAmountLow: () => {},
    };
  }

  it('fires onClosed when state becomes closed or failed', async () => {
    const peers: FakePeerConnection[] = [];
    const transport = new DataChannelTransport({
      nodeDataChannelModule: {
        PeerConnection: class extends FakePeerConnection {
          constructor(label: string, config: { iceServers: string[] }) {
            super(label, config);
            peers.push(this);
          }
        },
      },
    });

    const spy = { closed: 0, states: [] as string[] };
    transport.setEvents(createEvents(spy));

    const offerPromise = transport.createOffer();
    const peer = peers[0];
    peer.emitLocalDescription('sdp-offer', 'offer');
    peer.emitGatheringStateChange('complete');
    await offerPromise;

    peer.emitStateChange('connecting');
    peer.emitStateChange('closed');
    peer.emitStateChange('failed');

    expect(spy.states).toEqual(['connecting', 'closed', 'failed']);
    expect(spy.closed).toBe(2);
  });

  it('accepts data channel objects without onClosed handler', async () => {
    const peers: FakePeerConnection[] = [];
    const transport = new DataChannelTransport({
      nodeDataChannelModule: {
        PeerConnection: class extends FakePeerConnection {
          constructor(label: string, config: { iceServers: string[] }) {
            super(label, config);
            peers.push(this);
          }
        },
      },
    });

    transport.setEvents({
      onOpen: () => {},
      onMessage: () => {},
      onClosed: () => {},
      onStateChange: () => {},
      onBufferedAmountLow: () => {},
    });

    const answerPromise = transport.acceptOffer({
      sdp: 'sdp-offer',
      type: 'offer',
      candidates: [],
    });

    const peer = peers[0];
    peer.emitDataChannel(new FakeDataChannelWithoutOnClosed());
    peer.emitLocalDescription('sdp-answer', 'answer');
    peer.emitGatheringStateChange('complete');

    await expect(answerPromise).resolves.toEqual({
      sdp: 'sdp-answer',
      type: 'answer',
      candidates: [],
    });
  });
});

describe('DataChannelTransport (large)', () => {
  it('createOffer が API エラーなく PeerConnection を生成できる', async () => {
    const transport = new DataChannelTransport();
    transport.setEvents({
      onOpen: () => {},
      onMessage: () => {},
      onClosed: () => {},
      onStateChange: () => {},
      onBufferedAmountLow: () => {},
    });

    // createOffer は createPeer を同期的に呼ぶ
    // ICE gathering のタイムアウト(30秒)は待たず、5秒以内に
    // API エラーでリジェクトされないことを確認
    // 環境によっては STUN が即座に完了し resolve するため try/catch で処理
    try {
      await Promise.race([
        transport.createOffer(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout (expected)')), 5000)
        ),
      ]);
    } catch (e) {
      // タイムアウトは許容
      // "is not a function" 系のエラーは不可
      expect((e as Error).message).not.toMatch(/is not a function/);
    }

    transport.close();
  }, 10000);

  it('acceptOffer が API エラーなく PeerConnection を生成できる', async () => {
    const transport = new DataChannelTransport();
    transport.setEvents({
      onOpen: () => {},
      onMessage: () => {},
      onClosed: () => {},
      onStateChange: () => {},
      onBufferedAmountLow: () => {},
    });

    const dummyOffer = { sdp: 'v=0\r\n', type: 'offer' as const, candidates: [] };

    // acceptOffer も createPeer を呼ぶ
    // SDP が不正でも createPeer 段階の API エラーは即座に発生する
    try {
      await Promise.race([
        transport.acceptOffer(dummyOffer),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout (expected)')), 5000)
        ),
      ]);
    } catch (e) {
      // タイムアウトまたは SDP パースエラーは許容
      // "is not a function" 系のエラーは不可
      expect((e as Error).message).not.toMatch(/is not a function/);
    }

    transport.close();
  }, 10000);

  it('close が未接続状態でもエラーなく呼べる', () => {
    const transport = new DataChannelTransport();
    expect(() => transport.close()).not.toThrow();
  });

  it('sendMessage が dc=null のとき false を返す', () => {
    const transport = new DataChannelTransport();
    expect(transport.sendMessage(Buffer.from('test'))).toBe(false);
  });
});
