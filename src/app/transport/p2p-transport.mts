import { SignalingData } from '../signaling-data.mjs';

/** P2P データチャネルの接続状態。 */
export type P2PChannelState = 'new' | 'connecting' | 'open' | 'closing' | 'closed';

/** P2P トランスポートが発火するイベントハンドラ群。 */
export interface P2PTransportEvents {
  onOpen: () => void;
  onMessage: (data: Buffer) => void;
  onClosed: () => void;
  onStateChange: (state: P2PChannelState) => void;
  onBufferedAmountLow: () => void;
}

/** P2P トランスポートの抽象インタフェース。 */
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