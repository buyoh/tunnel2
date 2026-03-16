import nodeDataChannel from 'node-datachannel';
import { SignalingData } from '../signaling.mjs';
import { IP2PTransport, P2PTransportEvents } from './interface.mjs';

interface DataChannelTransportConfig {
  iceServers?: string[];
}

const DEFAULT_ICE_SERVERS = ['stun:stun.l.google.com:19302'];

/**
 * node-datachannel を使った IP2PTransport 実装。
 * 単体テストでは MockTransport を使用し、本実装は実行時に利用する。
 */
export class DataChannelTransport implements IP2PTransport {
  private readonly config: DataChannelTransportConfig;
  private events: P2PTransportEvents | null = null;
  private peer: any = null;
  private dc: any = null;

  constructor(config: DataChannelTransportConfig = {}) {
    this.config = {
      iceServers: config.iceServers ?? DEFAULT_ICE_SERVERS,
    };
  }

  setEvents(events: P2PTransportEvents): void {
    this.events = events;
  }

  async createOffer(): Promise<SignalingData> {
    this.createPeer();
    this.dc = this.peer.createDataChannel('tunnel');
    this.bindDataChannel(this.dc);
    return this.waitForLocalDescription('offer');
  }

  async acceptOffer(offer: SignalingData): Promise<SignalingData> {
    this.createPeer();
    this.peer.onDataChannel((dc: any) => {
      this.dc = dc;
      this.bindDataChannel(dc);
    });
    this.peer.setRemoteDescription(offer.sdp, offer.type);
    for (const candidate of offer.candidates) {
      this.peer.addRemoteCandidate(candidate.candidate, candidate.mid);
    }
    return this.waitForLocalDescription('answer');
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
    const ndc = nodeDataChannel as any;
    if (!ndc || typeof ndc.PeerConnection !== 'function') {
      throw new Error('node-datachannel is not available');
    }
    this.peer = new ndc.PeerConnection('tunnel', {
      iceServers: this.config.iceServers,
    });
    this.peer.onStateChange((state: string) => {
      this.events?.onStateChange(state as any);
    });
    this.peer.onClosed(() => {
      this.events?.onClosed();
    });
  }

  private bindDataChannel(dc: any): void {
    dc.onOpen(() => {
      this.events?.onOpen();
    });
    dc.onMessage((message: any) => {
      const data = Buffer.isBuffer(message) ? message : Buffer.from(message);
      this.events?.onMessage(data);
    });
    dc.onClosed(() => {
      this.events?.onClosed();
    });
    if (typeof dc.onBufferedAmountLow === 'function') {
      dc.onBufferedAmountLow(() => {
        this.events?.onBufferedAmountLow();
      });
    }
  }

  private waitForLocalDescription(type: 'offer' | 'answer'): Promise<SignalingData> {
    if (!this.peer) {
      throw new Error('Peer is not initialized');
    }

    return new Promise<SignalingData>((resolve, reject) => {
      const candidates: Array<{ candidate: string; mid: string }> = [];
      let localSdp = '';

      const timer = setTimeout(() => {
        reject(new Error('ICE gathering timeout'));
      }, 30_000);

      this.peer.onLocalDescription((sdp: string, sdpType: string) => {
        if (sdpType === type) {
          localSdp = sdp;
        }
      });

      this.peer.onLocalCandidate((candidate: string, mid: string) => {
        candidates.push({ candidate, mid });
      });

      this.peer.onGatheringStateChange((state: string) => {
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
