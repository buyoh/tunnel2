# 04. クライアント側 WebSocket シグナリング・再接続設計

## 概要

既存の `TunnelApp` を変更せず、WebSocket シグナリングクライアントを新規作成する。
`TunnelApp` の `listen()` / `forward()` / `setRemoteOffer()` / `setRemoteAnswer()` API を
WebSocket 経由で駆動するラッパーとして実装する。

## ファイル構成

```
src/app/
├── cli.mts             # 既存コピペ CLI (変更なし)
├── ws-signaling.mts    # 新規: WebSocket シグナリングクライアント
└── ws-cli.mts          # 新規: WebSocket モード用 CLI エントリ
```

## ws-signaling.mts 設計

### クラス概要

```typescript
interface WsSignalingOptions {
  serverUrl: string;         // シグナリングサーバ URL
  privateKeyPath: string;    // Ed25519 秘密鍵ファイルパス
  publicKeyPath: string;     // Ed25519 公開鍵ファイルパス
  mode: 'listen' | 'forward';
  room: string;
}

class WsSignaling extends EventEmitter {
  constructor(
    private readonly app: TunnelApp,
    private readonly transport: IP2PTransport,
    private readonly options: WsSignalingOptions,
  )

  /** 接続開始。P2P 切断時の自動再接続も含む */
  start(): void

  /** 完全停止 */
  stop(): void
}
```

### ライフサイクル

```
start()
  │
  ▼
connectWebSocket()
  │
  ▼
challenge 受信 → 署名作成 → authenticate 送信
  │
  ▼
authResult 受信 (成功)
  │
  ▼
join 送信 { mode, room }
  │
  ▼
matched 受信
  │
  ├── mode === 'listen' のとき:
  │     app.listen(port)
  │     offer-ready イベント → signal 送信 { data }
  │     signal 受信 (answer) → app.setRemoteAnswer(data)
  │
  └── mode === 'forward' のとき:
        app.forward(host, port)
        signal 受信 (offer) → app.setRemoteOffer(data)
        answer-ready イベント → signal 送信 { data }
  │
  ▼
P2P connected → WebSocket 切断
  │
  ▼
P2P disconnected → connectWebSocket() (最初から再開)
```

### TunnelApp の再利用

P2P 再接続時には `TunnelApp` と `IP2PTransport` を新しいインスタンスで作り直す必要がある。
`WsSignaling` にはファクトリ関数を渡す:

```typescript
interface AppFactory {
  create(): { app: TunnelApp; transport: IP2PTransport };
}
```

再接続のたびに `AppFactory.create()` で新しい `TunnelApp` + トランスポートを生成する。

## 再接続ロジック

### P2P 切断時

```
P2P disconnected イベント
  │
  ▼
WebSocket へ再接続 (即座)
  → 認証 → join → マッチング → シグナリング → P2P 接続
```

P2P が切断されたら、バックオフなしで即座に WebSocket に再接続する。

### WebSocket 異常切断時

指数バックオフで再試行する:

```
初回: 1 秒後に再試行
2回目: 2 秒後
3回目: 4 秒後
4回目: 8 秒後
5回目: 16 秒後
6回目: 32 秒後
7回目: 64 秒後
8回目以降: 128 秒後 (上限)
```

バックオフは WebSocket 接続が成功するたびにリセットする。

```typescript
class ExponentialBackoff {
  private attempt = 0;
  private readonly maxDelay = 128_000; // ms

  /** 次の待ち時間を返し、attempt をインクリメント */
  next(): number {
    const delay = Math.min(1000 * Math.pow(2, this.attempt), this.maxDelay);
    this.attempt += 1;
    return delay;
  }

  /** 成功時にリセット */
  reset(): void {
    this.attempt = 0;
  }
}
```

### 正常切断 vs 異常切断の判定

- P2P 確立後にクライアント側から切断 → 正常 (再接続不要)
- `stop()` 呼び出し → 正常 (再接続不要)
- サーバ側からの切断、ネットワーク断 → 異常 (バックオフ再接続)
- 認証失敗 → 再接続しない (鍵の問題なので繰り返しても意味がない)

## ws-cli.mts 設計

WebSocket モードの CLI エントリポイント:

```
Usage:
  tunnel ws-listen  --server <url> --key <private_key_path> --pubkey <public_key_path> --room <name> --port <port>
  tunnel ws-forward --server <url> --key <private_key_path> --pubkey <public_key_path> --room <name> --target <host:port>
```

### 処理フロー

```typescript
async function runWsCli(args: string[]): Promise<void> {
  // 1. 引数パース
  // 2. AppFactory 作成
  // 3. WsSignaling 作成
  // 4. start() 呼び出し
  // 5. プロセスシグナル (SIGINT/SIGTERM) で stop() → 終了
}
```

## 署名処理 (クライアント側)

Node.js `crypto` モジュールを使用:

```typescript
import crypto from 'node:crypto';
import fs from 'node:fs';

function signChallenge(privateKeyPath: string, nonce: string): string {
  const privateKey = fs.readFileSync(privateKeyPath, 'utf-8');
  const sign = crypto.sign(null, Buffer.from(nonce, 'hex'), privateKey);
  return sign.toString('hex');
}
```

Ed25519 は `crypto.sign(null, data, key)` で署名する (`null` はアルゴリズムを自動判定)。

## 既存機能への影響

- `cli.mts` — **変更なし**。既存のコピペ方式はそのまま動作する。
- `app.mts` (`TunnelApp`) — **変更なし**。
- `index.mts` — WebSocket モード用のサブコマンドを追加。`ws-listen` / `ws-forward` コマンドで `ws-cli.mts` を呼び出す。
