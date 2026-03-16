# 04. TunnelApp クラス設計

## 概要

アプリケーションの中核となるクラス。P2P 接続の確立からトンネル管理までの全ロジックを保持する。
CLI / Web UI / GUI などフロントエンドに依存せず、イベント駆動で状態を公開する。

## ファイル: `src/app.mts`

## 設計方針

- フロントエンド非依存: `console.log` や `readline` を直接呼ばない
- イベント駆動: 状態変化やシグナリング情報をイベントで通知
- トランスポート注入: `IP2PTransport` をコンストラクタで受け取る (DI)
- ライフサイクル管理: 接続確立から切断までを一元管理

## TunnelApp クラス

```typescript
import { EventEmitter } from 'node:events';
import { IP2PTransport } from './transport/interface.mjs';
import { SignalingData, encodeSignaling, decodeSignaling } from './signaling.mjs';
import { TunnelListener, TunnelForwarder } from './tunnel.mjs';

/** アプリケーションの状態 */
export type AppState =
  | 'idle'            // 初期状態
  | 'waiting-offer'   // Offer 入力待ち (forward 側)
  | 'offering'        // Offer 生成中 (listen 側)
  | 'waiting-answer'  // Answer 入力待ち (listen 側)
  | 'answering'       // Answer 生成中 (forward 側)
  | 'connecting'      // P2P 接続確立中
  | 'connected'       // P2P 接続確立済み、トンネル稼働中
  | 'closed';         // 終了

/** TunnelApp が発行するイベント */
export interface TunnelAppEvents {
  /** 状態が変化した */
  'state-change': (state: AppState) => void;

  /** Offer 情報が生成された (フロントエンドが表示する) */
  'offer-ready': (encoded: string) => void;

  /** Answer 情報が生成された (フロントエンドが表示する) */
  'answer-ready': (encoded: string) => void;

  /** P2P 接続が確立された */
  'connected': () => void;

  /** 接続が切断された */
  'disconnected': () => void;

  /** エラーが発生した */
  'error': (error: Error) => void;

  /** ログメッセージ */
  'log': (message: string) => void;
}

export class TunnelApp extends EventEmitter {
  private state: AppState = 'idle';
  private transport: IP2PTransport;
  private tunnel: TunnelListener | TunnelForwarder | null = null;

  constructor(transport: IP2PTransport);

  /** 現在の状態を取得 */
  getState(): AppState;

  /**
   * Listen モードで開始する (Offer 側)
   *
   * 1. Offer を生成
   * 2. 'offer-ready' イベントで Offer のエンコード済み文字列を通知
   * 3. Answer の入力を待つ状態になる
   */
  async listen(port: number): Promise<void>;

  /**
   * Forward モードで開始する (Answer 側)
   *
   * Offer の入力を待つ状態になる。
   * setRemoteOffer() が呼ばれるまで待機。
   */
  async forward(host: string, port: number): Promise<void>;

  /**
   * リモートの Offer を設定する (Forward 側)
   *
   * 1. Offer をデコード
   * 2. Answer を生成
   * 3. 'answer-ready' イベントで Answer のエンコード済み文字列を通知
   * 4. P2P 接続の確立を待つ
   */
  async setRemoteOffer(encoded: string): Promise<void>;

  /**
   * リモートの Answer を設定する (Listen 側)
   *
   * 1. Answer をデコード
   * 2. トランスポートに Answer を適用
   * 3. P2P 接続の確立を待つ
   */
  async setRemoteAnswer(encoded: string): Promise<void>;

  /**
   * アプリケーションを終了する
   * トンネル停止 → トランスポート切断 → リソース解放
   */
  close(): void;
}
```

## 状態遷移図

```
                    listen(port)
  ┌──────┐ ─────────────────────▶ ┌───────────┐
  │ idle │                        │ offering  │
  └──┬───┘                        └─────┬─────┘
     │                                  │ Offer 生成完了
     │ forward(host, port)              ▼
     │                            ┌──────────────┐
     ▼                            │ waiting-     │
  ┌───────────────┐               │   answer     │
  │ waiting-offer │               └──────┬───────┘
  └───────┬───────┘                      │ setRemoteAnswer()
          │ setRemoteOffer()             │
          ▼                              ▼
  ┌───────────┐                   ┌────────────┐
  │ answering │                   │ connecting │
  └─────┬─────┘                   └──────┬─────┘
        │ Answer 生成完了                 │
        ▼                                │
  ┌────────────┐                         │
  │ connecting │ ◀───────────────────────┘
  └──────┬─────┘
         │ P2P チャネル開通
         ▼
  ┌───────────┐
  │ connected │
  └─────┬─────┘
        │ close() or 切断
        ▼
  ┌────────┐
  │ closed │
  └────────┘
```

## 使用例: CLI からの利用

```typescript
import { TunnelApp } from './app.mjs';
import { DataChannelTransport } from './transport/datachannel.mjs';

// トランスポートを生成して注入
const transport = new DataChannelTransport();
const app = new TunnelApp(transport);

// イベント購読
app.on('offer-ready', (encoded) => {
  console.log('以下のオファー情報を相手に送ってください:');
  console.log(encoded);
});

app.on('answer-ready', (encoded) => {
  console.log('以下のアンサー情報を相手に送ってください:');
  console.log(encoded);
});

app.on('connected', () => {
  console.log('接続しました!');
});

app.on('error', (err) => {
  console.error('エラー:', err.message);
});

// Listen モードで起動
await app.listen(2222);
// → 'offer-ready' イベントが発火
// → ユーザーが Answer を入力
await app.setRemoteAnswer(userInput);
// → 'connected' イベントが発火
```

## 使用例: 将来の Web UI からの利用 (概念)

```typescript
// Express や http サーバーから TunnelApp を操作
import { TunnelApp } from './app.mjs';
import { DataChannelTransport } from './transport/datachannel.mjs';

const app = new TunnelApp(new DataChannelTransport());

// HTTP エンドポイント
router.post('/api/listen', async (req, res) => {
  await app.listen(req.body.port);
  // offer-ready イベントで取得した Offer を返す
});

router.post('/api/set-answer', async (req, res) => {
  await app.setRemoteAnswer(req.body.answer);
  res.json({ status: app.getState() });
});

// WebSocket でイベントをリアルタイム配信
app.on('state-change', (state) => {
  ws.send(JSON.stringify({ event: 'state-change', state }));
});
```

## テスタビリティ

`IP2PTransport` のモック実装を注入することで、`TunnelApp` を単体テスト可能:

```typescript
class MockTransport implements IP2PTransport {
  // テスト用のスタブ実装
}

const app = new TunnelApp(new MockTransport());
// P2P 実装なしで状態遷移やイベント発行をテスト
```
