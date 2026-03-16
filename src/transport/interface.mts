import { SignalingData } from '../signaling.mjs';

export type P2PChannelState = 'new' | 'connecting' | 'open' | 'closing' | 'closed';

export interface P2PTransportEvents {
  onOpen: () => void;
  onMessage: (data: Buffer) => void;
  onClosed: () => void;
  onStateChange: (state: P2PChannelState) => void;
  onBufferedAmountLow: () => void;
}

export interface IP2PTransport {
  createOffer(): Promise<SignalingData>;
  acceptOffer(offer: SignalingData): Promise<SignalingData>;
  applyAnswer(answer: SignalingData): void;
  sendMessage(data: Buffer): boolean;
  bufferedAmount(): number;
  setBufferedAmountLowThreshold(size: number): void;
  isOpen(): boolean;
  close(): void;
  setEvents(events: P2PTransportEvents): void;
}