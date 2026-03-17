import nodeDataChannel from 'node-datachannel';
import { SignalingData } from '../signaling.mjs';
import { IP2PTransport, P2PChannelState, P2PTransportEvents } from './interface.mjs';

type DataChannelMessage = string | Buffer | ArrayBuffer;

/** node-datachannel の DataChannel が持つべき最小限のメソッド抽象。 */
interface DataChannelLike {
  close(): void;
  sendMessageBinary(buffer: Buffer): boolean;
  isOpen(): boolean;
  bufferedAmount(): number;
  setBufferedAmountLowThreshold(newSize: number): void;
  onOpen(cb: () => void): void;
  onClosed?: (cb: () => void) => void;
  onBufferedAmountLow?: (cb: () => void) => void;
  onMessage(cb: (msg: DataChannelMessage) => void): void;
}

/** node-datachannel の PeerConnection が持つべき最小限のメソッド抽象。 */
interface PeerConnectionLike {
  close(): void;
  setRemoteDescription(sdp: string, type: SignalingData['type']): void;
  addRemoteCandidate(candidate: string, mid: string): void;
  createDataChannel(label: string): DataChannelLike;
  onStateChange(cb: (state: string) => void): void;
  onDataChannel(cb: (dc: DataChannelLike) => void): void;
  onLocalDescription(cb: (sdp: string, type: string) => void): void;
  onLocalCandidate(cb: (candidate: string, mid: string) => void): void;
  onGatheringStateChange(cb: (state: string) => void): void;
}

/** node-datachannel モジュールの型抽象（DI 用）。 */
interface NodeDataChannelModule {
  PeerConnection: new (label: string, config: { iceServers: string[] }) => PeerConnectionLike;
}

/** DataChannelTransport の生成オプション。 */
interface DataChannelTransportConfig {
  iceServers?: string[];
  nodeDataChannelModule?: NodeDataChannelModule;
}

const DEFAULT_ICE_SERVERS = ['stun:stun.l.google.com:19302'];

/**
 * node-datachannel を使った IP2PTransport 実装。
 * 単体テストでは MockTransport を使用し、本実装は実行時に利用する。
 */
export class DataChannelTransport implements IP2PTransport {
  private readonly config: { iceServers: string[] };
  private readonly nodeDataChannelModule: NodeDataChannelModule;
  private events: P2PTransportEvents | null = null;
  private peer: PeerConnectionLike | null = null;
  private dc: DataChannelLike | null = null;

  constructor(config: DataChannelTransportConfig = {}) {
    this.config = {
      iceServers: config.iceServers ?? DEFAULT_ICE_SERVERS,
    };
    this.nodeDataChannelModule =
      config.nodeDataChannelModule ?? (nodeDataChannel as unknown as NodeDataChannelModule);
  }

  setEvents(events: P2PTransportEvents): void {
    this.events = events;
  }

  async createOffer(): Promise<SignalingData> {
    this.createPeer();
    const peer = this.peer;
    if (!peer) {
      throw new Error('Peer is not initialized');
    }
    // onLocalDescription が createDataChannel() で同期的に発火する場合があるため、
    // ハンドラ登録を先に行う
    const promise = this.waitForLocalDescription('offer');
    this.dc = peer.createDataChannel('tunnel');
    this.bindDataChannel(this.dc);
    return promise;
  }

  async acceptOffer(offer: SignalingData): Promise<SignalingData> {
    this.createPeer();
    const peer = this.peer;
    if (!peer) {
      throw new Error('Peer is not initialized');
    }
    // onLocalDescription が setRemoteDescription() で同期的に発火する場合があるため、
    // ハンドラ登録を先に行う
    const promise = this.waitForLocalDescription('answer');
    peer.onDataChannel((dc: DataChannelLike) => {
      this.dc = dc;
      this.bindDataChannel(dc);
    });
    peer.setRemoteDescription(offer.sdp, offer.type);
    for (const candidate of offer.candidates) {
      peer.addRemoteCandidate(candidate.candidate, candidate.mid);
    }
    return promise;
  }

  applyAnswer(answer: SignalingData): void {
    if (!this.peer) {
      throw new Error('Peer is not initialized');
    }
    this.peer.setRemoteDescription(answer.sdp, answer.type);
    for (const candidate of answer.candidates) {
      this.peer.addRemoteCandidate(candidate.candidate, candidate.mid);
    }
  }

  sendMessage(data: Buffer): boolean {
    if (!this.dc) {
      return false;
    }
    this.dc.sendMessageBinary(data);
    return true;
  }

  bufferedAmount(): number {
    if (!this.dc || typeof this.dc.bufferedAmount !== 'function') {
      return 0;
    }
    return this.dc.bufferedAmount();
  }

  setBufferedAmountLowThreshold(size: number): void {
    if (!this.dc || typeof this.dc.setBufferedAmountLowThreshold !== 'function') {
      return;
    }
    this.dc.setBufferedAmountLowThreshold(size);
  }

  isOpen(): boolean {
    if (!this.dc || typeof this.dc.isOpen !== 'function') {
      return false;
    }
    return this.dc.isOpen();
  }

  close(): void {
    if (this.dc && typeof this.dc.close === 'function') {
      this.dc.close();
    }
    if (this.peer && typeof this.peer.close === 'function') {
      this.peer.close();
    }
    this.dc = null;
    this.peer = null;
  }

  private createPeer(): void {
    if (!this.nodeDataChannelModule || typeof this.nodeDataChannelModule.PeerConnection !== 'function') {
      throw new Error('node-datachannel is not available');
    }
    this.peer = new this.nodeDataChannelModule.PeerConnection('tunnel', {
      iceServers: this.config.iceServers,
    });
    this.peer.onStateChange((state: string) => {
      this.events?.onStateChange(state as P2PChannelState);
      // node-datachannel v0.32.1 には PeerConnection.onClosed がないため、
      // state change の closed / failed を接続終了として扱う。
      if (state === 'closed' || state === 'failed') {
        this.events?.onClosed();
      }
    });
  }

  private bindDataChannel(dc: DataChannelLike): void {
    dc.onOpen(() => {
      this.events?.onOpen();
    });
    dc.onMessage((message: DataChannelMessage) => {
      const data = Buffer.isBuffer(message)
        ? message
        : message instanceof ArrayBuffer
          ? Buffer.from(new Uint8Array(message))
          : Buffer.from(message);
      this.events?.onMessage(data);
    });
    if (dc.onClosed) {
      dc.onClosed(() => {
        this.events?.onClosed();
      });
    }
    if (dc.onBufferedAmountLow) {
      dc.onBufferedAmountLow(() => {
        this.events?.onBufferedAmountLow();
      });
    }
  }

  private waitForLocalDescription(type: 'offer' | 'answer'): Promise<SignalingData> {
    const peer = this.peer;
    if (!peer) {
      throw new Error('Peer is not initialized');
    }

    return new Promise<SignalingData>((resolve, reject) => {
      const candidates: Array<{ candidate: string; mid: string }> = [];
      let localSdp = '';

      const timer = setTimeout(() => {
        reject(new Error('ICE gathering timeout'));
      }, 30_000);

      peer.onLocalDescription((sdp: string, sdpType: string) => {
        if (sdpType === type) {
          localSdp = sdp;
        }
      });

      peer.onLocalCandidate((candidate: string, mid: string) => {
        candidates.push({ candidate, mid });
      });

      peer.onGatheringStateChange((state: string) => {
        if (state !== 'complete') {
          return;
        }
        clearTimeout(timer);
        resolve({
          sdp: localSdp,
          type,
          candidates,
        });
      });
    });
  }
}
