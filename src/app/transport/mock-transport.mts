import { SignalingData } from '../signaling-data.mjs';
import { IP2PTransport, P2PChannelState, P2PTransportEvents } from './p2p-transport.mjs';

/**
 * テスト用のモックトランスポート。
 * 実際の P2P 接続を行わず、メッセージ送受信と状態変化をシミュレートする。
 */
export class MockTransport implements IP2PTransport {
  private events: P2PTransportEvents | null = null;
  private open = false;
  private amount = 0;
  private sentMessages: Buffer[] = [];

  peer: MockTransport | null = null;

  setEvents(events: P2PTransportEvents): void {
    this.events = events;
  }

  async createOffer(): Promise<SignalingData> {
    return {
      sdp: 'mock-sdp-offer',
      type: 'offer',
      candidates: [{ candidate: 'mock-candidate', mid: '0' }],
    };
  }

  async acceptOffer(_offer: SignalingData): Promise<SignalingData> {
    return {
      sdp: 'mock-sdp-answer',
      type: 'answer',
      candidates: [{ candidate: 'mock-candidate', mid: '0' }],
    };
  }

  applyAnswer(_answer: SignalingData): void {
    // no-op
  }

  sendMessage(data: Buffer): boolean {
    this.sentMessages.push(data);
    if (this.peer) {
      this.peer.events?.onMessage(data);
    }
    return true;
  }

  bufferedAmount(): number {
    return this.amount;
  }

  setBufferedAmountLowThreshold(_size: number): void {
    // no-op
  }

  isOpen(): boolean {
    return this.open;
  }

  close(): void {
    this.open = false;
    this.events?.onClosed();
  }

  getSentMessages(): Buffer[] {
    return this.sentMessages;
  }

  clearSentMessages(): void {
    this.sentMessages = [];
  }

  simulateOpen(): void {
    this.open = true;
    this.events?.onOpen();
  }

  simulateMessage(data: Buffer): void {
    this.events?.onMessage(data);
  }

  simulateClosed(): void {
    this.open = false;
    this.events?.onClosed();
  }

  simulateStateChange(state: P2PChannelState): void {
    this.events?.onStateChange(state);
  }

  simulateBufferedAmountLow(): void {
    this.events?.onBufferedAmountLow();
  }

  setMockBufferedAmount(amount: number): void {
    this.amount = amount;
  }

  static createPair(): [MockTransport, MockTransport] {
    const a = new MockTransport();
    const b = new MockTransport();
    a.peer = b;
    b.peer = a;
    return [a, b];
  }
}