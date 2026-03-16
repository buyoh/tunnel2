# 05. TCP トンネル設計

## 概要

TCP ソケットと P2P トランスポートを双方向にブリッジするモジュール。
1つの P2P チャネル上で複数の TCP 接続を多重化する。

`IP2PTransport` インターフェース経由で P2P チャネルとやり取りするため、node-datachannel に直接依存しない。

## ファイル構成

- `src/protocol.mts` — P2P チャネル上の多重化プロトコル定義
- `src/tunnel.mts` — TCP サーバー/クライアントと P2P チャネルのブリッジ

## 多重化プロトコル (`src/protocol.mts`)

1つの P2P チャネルで複数の TCP 接続を扱うため、メッセージにヘッダを付与する。

### メッセージフォーマット

バイナリフォーマット (ネットワークバイトオーダー):

```
┌───────────┬──────────┬──────────────────────────┐
│ connId    │ type     │ payload                  │
│ (4 bytes) │ (1 byte) │ (可変長)                  │
├───────────┼──────────┼──────────────────────────┤
│ uint32 BE │ uint8    │ Buffer                   │
└───────────┴──────────┴──────────────────────────┘
```

### メッセージタイプ

```typescript
export enum MessageType {
  CONNECT     = 0x01,  // 新規 TCP 接続要求 (listen → forward)
  CONNECT_ACK = 0x02,  // 接続成功応答     (forward → listen)
  CONNECT_ERR = 0x03,  // 接続失敗応答     (forward → listen)
  DATA        = 0x10,  // TCP データ転送    (双方向)
  CLOSE       = 0x20,  // TCP 接続終了      (双方向)
}
```

### 各メッセージの payload

| Type | payload | 説明 |
|---|---|---|
| CONNECT | なし | 新規 TCP 接続を要求。connId は listen 側が割り当てる |
| CONNECT_ACK | なし | TCP 接続成功 |
| CONNECT_ERR | UTF-8 文字列 | 接続失敗の理由 |
| DATA | バイナリデータ | TCP データ本体 |
| CLOSE | なし | TCP 接続の切断通知 |

### エンコード・デコード

```typescript
export interface ProtocolMessage {
  connId: number;
  type: MessageType;
  payload: Buffer;
}

// メッセージをバイナリにエンコード
export function encodeMessage(msg: ProtocolMessage): Buffer {
  const header = Buffer.alloc(5);
  header.writeUInt32BE(msg.connId, 0);
  header.writeUInt8(msg.type, 4);
  return Buffer.concat([header, msg.payload]);
}

// バイナリからメッセージをデコード
export function decodeMessage(data: Buffer): ProtocolMessage {
  const connId = data.readUInt32BE(0);
  const type = data.readUInt8(4) as MessageType;
  const payload = data.subarray(5);
  return { connId, type, payload };
}
```

## TCP トンネル (`src/tunnel.mts`)

`IP2PTransport` を受け取り、TCP ソケットとの間でデータをブリッジする。

### Listen 側 (Peer A)

ローカルポートで TCP 接続を待ち受け、P2P チャネル経由で相手ピアに転送する。

```typescript
import { IP2PTransport } from './transport/interface.mjs';

export class TunnelListener {
  private server: net.Server;
  private connections: Map<number, net.Socket>;
  private nextConnId: number;

  constructor(
    private listenPort: number,
    private transport: IP2PTransport,
  );

  // TCP サーバーを起動
  start(): void;

  // 全接続を閉じてサーバーを停止
  stop(): void;

  // P2P チャネルからのメッセージを処理
  handleMessage(msg: ProtocolMessage): void;
}
```

#### Listen 側の動作

1. `net.createServer()` で指定ポートをリッスン
2. 新規 TCP 接続時:
   - `connId` を割り当て (インクリメンタル)
   - `connections` Map に登録
   - P2P チャネルに `CONNECT` メッセージを送信
3. TCP データ受信時:
   - `DATA` メッセージとして P2P チャネルに送信
4. TCP 切断時:
   - `CLOSE` メッセージを送信
   - Map から削除
5. P2P チャネルから `DATA` 受信時:
   - connId に対応する TCP ソケットにデータを書き込み
6. P2P チャネルから `CLOSE` 受信時:
   - connId に対応する TCP ソケットを破棄
   - Map から削除

### Forward 側 (Peer B)

P2P チャネルから受信した接続要求に対し、指定先への TCP 接続を確立する。

```typescript
import { IP2PTransport } from './transport/interface.mjs';

export class TunnelForwarder {
  private connections: Map<number, net.Socket>;

  constructor(
    private forwardHost: string,
    private forwardPort: number,
    private transport: IP2PTransport,
  );

  // P2P チャネルからのメッセージを処理
  handleMessage(msg: ProtocolMessage): void;

  // 全接続を閉じる
  stop(): void;
}
```

#### Forward 側の動作

1. `CONNECT` メッセージ受信時:
   - `net.connect(forwardPort, forwardHost)` で TCP 接続
   - 成功: `CONNECT_ACK` を送信、Map に登録
   - 失敗: `CONNECT_ERR` を送信
2. `DATA` メッセージ受信時:
   - connId に対応する TCP ソケットにデータを書き込み
3. TCP データ受信時:
   - `DATA` メッセージとして P2P チャネルに送信
4. `CLOSE` メッセージ受信時:
   - connId に対応する TCP ソケットを破棄
5. TCP 切断時:
   - `CLOSE` メッセージを P2P チャネルに送信

## フロー制御

`IP2PTransport` の `bufferedAmount()` を監視し、バッファが溢れないようにする。

- `transport.bufferedAmount()` が閾値 (例: 1MB) を超えた場合、TCP ソケットの `pause()` を呼んで読み取りを停止
- `transport.onBufferedAmountLow` コールバックで TCP ソケットの `resume()` を呼んで読み取り再開
- `transport.setBufferedAmountLowThreshold()` で閾値を設定 (例: 256KB)

```typescript
const HIGH_WATER_MARK = 1 * 1024 * 1024;   // 1MB
const LOW_WATER_MARK  = 256 * 1024;         // 256KB
```

## エラーハンドリング

- TCP ソケットエラー → `CLOSE` メッセージ送信 + ソケットクリーンアップ
- `CONNECT_ERR` 受信 → 対応する TCP ソケットを破棄
- P2P チャネル切断 → 全 TCP 接続を閉じる
