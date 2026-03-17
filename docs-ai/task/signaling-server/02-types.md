# 02. signaling-types パッケージ設計

## 概要

`packages/signaling-types/` に配置する型定義パッケージ。
WebSocket (Socket.IO) で送受信するイベント名・ペイロードの型を定義する。
ランタイムコードは含まず、TypeScript の型のみをエクスポートする。

## パッケージ情報

```json
{
  "name": "@tunnel2/signaling-types",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.mts"
  }
}
```

## 型定義

### 認証関連

```typescript
/** サーバ → クライアント: チャレンジ送信 */
interface ChallengePayload {
  nonce: string; // サーバが生成するランダム文字列 (hex)
}

/** クライアント → サーバ: 認証要求 */
interface AuthenticatePayload {
  publicKey: string;   // PEM 形式の Ed25519 公開鍵
  signature: string;   // nonce を秘密鍵で署名した結果 (hex)
}

/** サーバ → クライアント: 認証結果 */
interface AuthResultPayload {
  success: boolean;
  groupName?: string;  // 認証成功時、所属グループ名
  error?: string;      // 認証失敗時、理由
}
```

### ルーム参加・マッチング

```typescript
/** クライアント → サーバ: ルーム参加 */
interface JoinPayload {
  mode: 'listen' | 'forward';
  room: string;  // 任意のルーム名
}

/** サーバ → クライアント: マッチング成立 */
interface MatchedPayload {
  role: 'listen' | 'forward';  // 自分の役割の確認
}
```

### シグナリング中継

```typescript
/** 双方向: シグナリングデータ中継 */
interface SignalPayload {
  data: string;  // base64 エンコード済みの SignalingData (既存形式をそのまま使用)
}
```

### エラー

```typescript
/** サーバ → クライアント: エラー通知 */
interface ErrorPayload {
  message: string;
}
```

## Socket.IO イベント型マップ

Socket.IO の型安全な定義に使う型マップを提供する。

```typescript
/** クライアント → サーバ のイベント */
export interface ClientToServerEvents {
  authenticate: (payload: AuthenticatePayload) => void;
  join: (payload: JoinPayload) => void;
  signal: (payload: SignalPayload) => void;
}

/** サーバ → クライアント のイベント */
export interface ServerToClientEvents {
  challenge: (payload: ChallengePayload) => void;
  authResult: (payload: AuthResultPayload) => void;
  matched: (payload: MatchedPayload) => void;
  signal: (payload: SignalPayload) => void;
  error: (payload: ErrorPayload) => void;
}
```

## プロトコルシーケンス

```
Client                          Server
  │                               │
  │◄──── challenge { nonce } ─────│   (接続直後)
  │                               │
  │── authenticate { key, sig } ──►│
  │                               │
  │◄──── authResult { ok, group } │
  │                               │
  │── join { mode, room } ────────►│
  │                               │  (ペア待ち)
  │◄──── matched { role } ────────│   (ペア成立)
  │                               │
  │── signal { data } ────────────►│   (listen→offer)
  │◄──── signal { data } ─────────│   (relay to forward)
  │                               │
  │◄──── signal { data } ─────────│   (forward→answer)
  │── signal { data } ────────────►│   (relay to listen)
  │                               │
  │         (P2P 確立 → WebSocket 切断)
```

## ファイル構成

```
packages/signaling-types/
├── package.json
├── tsconfig.json
└── src/
    └── index.mts    # 上記の型すべてをエクスポート
```
