# 03. P2P トランスポート抽象化層

## 概要

P2P 通信の具体的実装 (node-datachannel) に直接依存しないよう、インターフェースで抽象化する。
アプリケーションコア (`TunnelApp`, `tunnel.mts`) はこのインターフェースにのみ依存する。

## 設計方針

- P2P 通信の操作をインターフェース `IP2PTransport` として定義
- node-datachannel は `DataChannelTransport` として1実装を提供
- 将来的に別の P2P ライブラリや WebSocket ベースのフォールバック実装に差し替え可能

## ファイル: `src/transport/interface.mts`

### IP2PTransport インターフェース

```typescript
import { SignalingData } from '../signaling.mjs';

/** P2P チャネルの状態 */
export type P2PChannelState = 'new' | 'connecting' | 'open' | 'closing' | 'closed';

/** P2P トランスポートのイベントコールバック */
export interface P2PTransportEvents {
  /** チャネルが開通した */
  onOpen: () => void;
  /** バイナリメッセージを受信した */
  onMessage: (data: Buffer) => void;
  /** チャネルが閉じた */
  onClosed: () => void;
  /** 接続状態が変化した */
  onStateChange: (state: P2PChannelState) => void;
  /** バッファ量が閾値以下になった (フロー制御) */
  onBufferedAmountLow: () => void;
}

/** P2P トランスポートの抽象インターフェース */
export interface IP2PTransport {
  /**
   * Offer を作成する (Offer 側)
   * ICE Candidate の収集完了まで待機し、シグナリングデータを返す
   */
  createOffer(): Promise<SignalingData>;

  /**
   * Offer を受け取り、Answer を生成する (Answer 側)
   * ICE Candidate の収集完了まで待機し、シグナリングデータを返す
   */
  acceptOffer(offer: SignalingData): Promise<SignalingData>;

  /**
   * Answer を適用して接続を確立する (Offer 側)
   */
  applyAnswer(answer: SignalingData): void;

  /** バイナリメッセージを送信する */
  sendMessage(data: Buffer): boolean;

  /** 送信バッファの残量 (バイト数) */
  bufferedAmount(): number;

  /** バッファ量の低水位閾値を設定 */
  setBufferedAmountLowThreshold(size: number): void;

  /** チャネルが開いているか */
  isOpen(): boolean;

  /** トランスポートを閉じる (全リソースの解放) */
  close(): void;

  /** イベントコールバックを設定する */
  setEvents(events: P2PTransportEvents): void;
}
```

### ポイント

- `createOffer()` / `acceptOffer()` / `applyAnswer()` はシグナリングフローに対応
- `sendMessage()` / `onMessage` でバイナリデータを送受信 (プロトコルメッセージはこの上に乗る)
- `bufferedAmount()` / `setBufferedAmountLowThreshold()` / `onBufferedAmountLow` でフロー制御
- トランスポートは1つの双方向チャネルを表現する (多重化はプロトコル層で実現)

## ファイル: `src/transport/datachannel.mts`

### DataChannelTransport クラス

```typescript
import nodeDataChannel, { PeerConnection, DataChannel } from 'node-datachannel';
import { IP2PTransport, P2PTransportEvents } from './interface.mjs';
import { SignalingData } from '../signaling.mjs';

export interface DataChannelTransportConfig {
  iceServers?: string[];
}

export class DataChannelTransport implements IP2PTransport {
  private peer: PeerConnection | null = null;
  private dc: DataChannel | null = null;
  private events: P2PTransportEvents | null = null;
  private config: DataChannelTransportConfig;

  constructor(config?: DataChannelTransportConfig);

  setEvents(events: P2PTransportEvents): void;

  async createOffer(): Promise<SignalingData>;
  async acceptOffer(offer: SignalingData): Promise<SignalingData>;
  applyAnswer(answer: SignalingData): void;

  sendMessage(data: Buffer): boolean;
  bufferedAmount(): number;
  setBufferedAmountLowThreshold(size: number): void;
  isOpen(): boolean;
  close(): void;
}
```

### 内部実装概要

#### `createOffer()`

1. `PeerConnection` を作成 (STUN サーバー設定)
2. コールバック設定 (`onLocalDescription`, `onLocalCandidate`, `onGatheringStateChange`)
3. `DataChannel` を作成 (ラベル: `"tunnel"`)
4. DataChannel のイベントをバインド (`onOpen`, `onMessage`, `onClosed`)
5. ICE 収集完了を Promise で待機
6. `SignalingData` を返す

#### `acceptOffer(offer)`

1. `PeerConnection` を作成
2. コールバック設定
3. `onDataChannel` コールバックで DataChannel を受信 → イベントをバインド
4. `setRemoteDescription(offer.sdp, offer.type)` を呼ぶ
5. Offer の ICE Candidate を全て `addRemoteCandidate()` で追加
6. ICE 収集完了を Promise で待機
7. `SignalingData` (Answer) を返す

#### `applyAnswer(answer)`

1. `setRemoteDescription(answer.sdp, answer.type)` を呼ぶ
2. Answer の ICE Candidate を全て `addRemoteCandidate()` で追加

#### ICE 設定

```typescript
const DEFAULT_CONFIG: DataChannelTransportConfig = {
  iceServers: ['stun:stun.l.google.com:19302'],
};
```

#### タイムアウト

ICE 収集が 30 秒以内に完了しない場合はエラーとする。

### テスタビリティ

- `IP2PTransport` インターフェースをモックすることで、`TunnelApp` や `tunnel.mts` を node-datachannel なしで単体テスト可能
- `DataChannelTransport` 自体は結合テストで検証
