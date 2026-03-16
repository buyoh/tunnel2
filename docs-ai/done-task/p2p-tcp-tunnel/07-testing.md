# 07. ユニットテスト設計

## 概要

実際の P2P 接続を発生させずに、アプリケーションの各モジュールを単体テストする。
`IP2PTransport` インターフェースのモック実装を用いることで、node-datachannel やネットワーク通信なしでロジックを検証する。

## テスト基盤

- **フレームワーク**: Jest + ts-jest (インストール済み)
- **テスト分類**: Unit テスト (P2P・ネットワーク接続なし)
- **配置**: `src/` と同階層にテストファイルを配置 (`*.spec.mts`)

### テストファイル構成

```
src/
├── signaling.mts
├── signaling.spec.mts         # signaling のテスト
├── protocol.mts
├── protocol.spec.mts          # protocol のテスト
├── app.mts
├── app.spec.mts               # TunnelApp のテスト
├── tunnel.mts
├── tunnel.spec.mts            # TunnelListener / TunnelForwarder のテスト
└── transport/
    ├── interface.mts
    └── mock.mts               # テスト用モック実装
```

## MockTransport — テスト用の IP2PTransport 実装

テスト全体で再利用するモック実装。実際の P2P 接続を行わず、メソッド呼び出しの記録とイベントの手動発火が可能。

### ファイル: `src/transport/mock.mts`

```typescript
import { IP2PTransport, P2PTransportEvents } from './interface.mjs';
import { SignalingData } from '../signaling.mjs';

/**
 * テスト用のモックトランスポート。
 * 実際の P2P 接続を行わず、以下を提供する:
 * - メソッド呼び出しの記録
 * - イベントの手動発火 (simulateXxx)
 * - 2つの MockTransport をペアリングして双方向通信をシミュレート
 */
export class MockTransport implements IP2PTransport {
  private events: P2PTransportEvents | null = null;
  private _isOpen: boolean = false;
  private _bufferedAmount: number = 0;
  private sentMessages: Buffer[] = [];

  /** ペアとなる MockTransport (双方向テスト用) */
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

  async acceptOffer(offer: SignalingData): Promise<SignalingData> {
    return {
      sdp: 'mock-sdp-answer',
      type: 'answer',
      candidates: [{ candidate: 'mock-candidate', mid: '0' }],
    };
  }

  applyAnswer(answer: SignalingData): void {
    // no-op
  }

  sendMessage(data: Buffer): boolean {
    this.sentMessages.push(data);
    // ペアが設定されている場合、相手側の onMessage を呼ぶ
    if (this.peer) {
      this.peer.events?.onMessage(data);
    }
    return true;
  }

  bufferedAmount(): number {
    return this._bufferedAmount;
  }

  setBufferedAmountLowThreshold(size: number): void {
    // no-op
  }

  isOpen(): boolean {
    return this._isOpen;
  }

  close(): void {
    this._isOpen = false;
    this.events?.onClosed();
  }

  // ── テスト用ヘルパー ──

  /** 送信されたメッセージ一覧を取得 */
  getSentMessages(): Buffer[] {
    return this.sentMessages;
  }

  /** 送信メッセージをクリア */
  clearSentMessages(): void {
    this.sentMessages = [];
  }

  /** チャネル開通をシミュレート */
  simulateOpen(): void {
    this._isOpen = true;
    this.events?.onOpen();
  }

  /** メッセージ受信をシミュレート */
  simulateMessage(data: Buffer): void {
    this.events?.onMessage(data);
  }

  /** チャネル切断をシミュレート */
  simulateClosed(): void {
    this._isOpen = false;
    this.events?.onClosed();
  }

  /** 状態変化をシミュレート */
  simulateStateChange(state: P2PChannelState): void {
    this.events?.onStateChange(state);
  }

  /** バッファ量低下をシミュレート */
  simulateBufferedAmountLow(): void {
    this.events?.onBufferedAmountLow();
  }

  /** バッファ量を設定 (フロー制御テスト用) */
  setMockBufferedAmount(amount: number): void {
    this._bufferedAmount = amount;
  }

  /**
   * 2つの MockTransport をペアリングする
   * sendMessage() が相手の onMessage を自動的に呼ぶようになる
   */
  static createPair(): [MockTransport, MockTransport] {
    const a = new MockTransport();
    const b = new MockTransport();
    a.peer = b;
    b.peer = a;
    return [a, b];
  }
}
```

## テスト対象モジュールと項目

### 1. signaling.mts テスト

純粋関数のテスト。外部依存なし。

```typescript
describe('signaling', () => {
  describe('encodeSignaling', () => {
    it('SignalingData を base64 文字列にエンコードできる');
    it('エンコード結果は decodeSignaling でデコード可能');
  });

  describe('decodeSignaling', () => {
    it('有効な base64 文字列をデコードできる');
    it('不正な base64 文字列でエラーを投げる');
    it('不正な JSON でエラーを投げる');
    it('必須フィールドが欠けている場合エラーを投げる');
    it('type が offer/answer 以外の場合エラーを投げる');
    it('candidates が配列でない場合エラーを投げる');
  });
});
```

### 2. protocol.mts テスト

純粋関数のテスト。バイナリのエンコード・デコード。

```typescript
describe('protocol', () => {
  describe('encodeMessage / decodeMessage', () => {
    it('CONNECT メッセージをエンコード・デコードできる');
    it('DATA メッセージ (payload 付き) をエンコード・デコードできる');
    it('CLOSE メッセージをエンコード・デコードできる');
    it('CONNECT_ACK メッセージをエンコード・デコードできる');
    it('CONNECT_ERR メッセージ (UTF-8 payload) をエンコード・デコードできる');
    it('大きな connId (uint32 最大値) を正しく処理できる');
    it('大きな payload を正しく処理できる');
    it('エンコード後のデコードで元のメッセージと一致する (ラウンドトリップ)');
  });
});
```

### 3. app.mts テスト (TunnelApp)

`MockTransport` を注入してテスト。実際の P2P 接続は発生しない。

```typescript
describe('TunnelApp', () => {
  describe('listen モード', () => {
    it('listen() 呼出で状態が offering に遷移する');
    it('Offer 生成後に offer-ready イベントが発行される');
    it('Offer 生成後に状態が waiting-answer になる');
    it('setRemoteAnswer() で状態が connecting に遷移する');
    it('トランスポート開通後に connected イベントが発行される');
    it('不正な Answer データでエラーイベントが発行される');
  });

  describe('forward モード', () => {
    it('forward() 呼出で状態が waiting-offer に遷移する');
    it('setRemoteOffer() で状態が answering に遷移する');
    it('Answer 生成後に answer-ready イベントが発行される');
    it('トランスポート開通後に connected イベントが発行される');
    it('不正な Offer データでエラーイベントが発行される');
  });

  describe('状態管理', () => {
    it('初期状態は idle である');
    it('状態変化時に state-change イベントが発行される');
    it('close() で状態が closed になる');
    it('close() でトランスポートが閉じられる');
    it('不正な状態遷移時にエラーが発行される (例: idle で setRemoteAnswer)');
  });

  describe('切断', () => {
    it('トランスポートの切断で disconnected イベントが発行される');
    it('切断後に状態が closed になる');
  });
});
```

### 4. tunnel.mts テスト

`MockTransport` + ローカル TCP ソケットでテスト。
`net.createServer()` / `net.connect()` は localhost に対して使用するが、P2P 接続は発生しない。

```typescript
describe('TunnelListener', () => {
  it('start() で TCP サーバーが起動する');
  it('TCP 接続時に CONNECT メッセージが送信される');
  it('TCP データ受信時に DATA メッセージが送信される');
  it('TCP 切断時に CLOSE メッセージが送信される');
  it('CONNECT_ACK 受信後に TCP データの双方向転送が行われる');
  it('DATA メッセージ受信時にTCPソケットにデータが書き込まれる');
  it('CLOSE メッセージ受信時に TCP ソケットが破棄される');
  it('CONNECT_ERR 受信時に TCP ソケットが破棄される');
  it('stop() で全接続が閉じてサーバーが停止する');
  it('複数の TCP 接続に異なる connId が割り当てられる');
});

describe('TunnelForwarder', () => {
  it('CONNECT メッセージ受信で TCP 接続が確立される');
  it('TCP 接続成功時に CONNECT_ACK が送信される');
  it('TCP 接続失敗時に CONNECT_ERR が送信される');
  it('DATA メッセージ受信時に TCP ソケットにデータが書き込まれる');
  it('TCP データ受信時に DATA メッセージが送信される');
  it('CLOSE メッセージ受信時に TCP ソケットが破棄される');
  it('TCP 切断時に CLOSE メッセージが送信される');
  it('stop() で全接続が閉じる');
});
```

#### tunnel.mts テストでの TCP ソケットの扱い

tunnel.mts のテストでは `localhost` に対する TCP 通信 (`net.createServer`, `net.connect`) が発生するが、これはプロセス内の loopback 通信であり、外部ネットワークへの接続ではない。P2P 側は `MockTransport` でシミュレートするため、node-datachannel は一切使用しない。

```
テスト対象:
  TCP Client ─(localhost)─▶ TunnelListener ─(MockTransport)─▶ TunnelForwarder ─(localhost)─▶ TCP Server
                                     ▲                                  ▲
                                     └── P2P 接続なし (モック) ──────────┘
```

### 5. TunnelListener + TunnelForwarder 統合テスト

`MockTransport.createPair()` を使い、TunnelListener と TunnelForwarder をペアリングして双方向通信をテスト。

```typescript
describe('Tunnel 統合 (MockTransport ペアリング)', () => {
  it('TCP → Listener → MockTransport → Forwarder → TCP の双方向データ転送');
  it('複数の TCP 接続を同時に処理できる');
  it('片方の TCP 切断が他の接続に影響しない');
});
```

## テストで使わないもの

| 対象 | 理由 |
|---|---|
| node-datachannel | `MockTransport` で代替 |
| STUN/TURN サーバー | P2P 接続を行わないため不要 |
| 外部ネットワーク | localhost の TCP のみ使用 |
| シグナリングサーバー | 使用しない設計 |

## テスト実行

```bash
npx jest
```

Jest 設定 (将来 `jest.config.ts` に追加):

```typescript
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.mts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.mjs$': '$1',
  },
  transform: {
    '^.+\\.mts$': ['ts-jest', { useESM: true }],
  },
  testMatch: ['**/*.spec.mts'],
};
```
