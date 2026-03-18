# 03. signaling-server 実装設計

## 概要

`packages/signaling-server/` に配置する Express + Socket.IO サーバ。
公開鍵認証、ルームマッチング、シグナリングデータの中継を行う。

## モジュール構成

エントリポイント (`index.mts`) 以外のファイルは `src/app/` 以下に配置する。

| ファイル | レイヤー | 責務 |
|---|---|---|
| `src/index.mts` | エントリポイント | 環境変数読み込み・サーバ起動のみ |
| `src/app/server.mts` | フレームワーク層 | Express + Socket.IO 初期化、Socket イベントと `ConnectionHandler` の接続 |
| `src/app/ConnectionHandler.mts` | ドメイン層 | 接続ライフサイクル状態機械 (未認証→認証済→参加済→マッチ済)。KeyStore / AuthRateLimiter / MatchingService のオーケストレーション |
| `src/app/KeyStore.mts` | ドメイン層 | 公開鍵ストア管理、チャレンジ生成、署名検証 |
| `src/app/AuthRateLimiter.mts` | ドメイン層 | 認証試行のレートリミット |
| `src/app/MatchingService.mts` | ドメイン層 | ルームマッチング、シグナリング中継ロジック |
| `keys.json` | データ | 公開鍵登録データ |

## パッケージ情報

```json
{
  "name": "@tunnel2/signaling-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node --import ../../register.mjs src/index.mts"
  },
  "dependencies": {
    "express": "^5.2.1",
    "socket.io": "^4.x",
    "@tunnel2/signaling-types": "*"
  }
}
```

## 1. 公開鍵認証 (`src/app/KeyStore.mts`)

### 鍵ストレージ形式

`keys.json`:
```json
[
  {
    "group_name": "team-alpha",
    "keys": [
      "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA...\n-----END PUBLIC KEY-----"
    ]
  },
  {
    "group_name": "team-beta",
    "keys": [
      "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA...\n-----END PUBLIC KEY-----"
    ]
  }
]
```

- Ed25519 公開鍵を PEM 形式で格納する
- 1つのグループに複数の鍵を登録可能
- 同一の鍵を複数グループに登録不可 (一意制約)

### 処理フロー

```typescript
class KeyStore {
  /** keys.json を読み込み、公開鍵 → グループ名のマップを構築 */
  constructor(keysFilePath: string)

  /** 公開鍵文字列からグループ名を検索。見つからなければ null */
  findGroup(publicKey: string): string | null
}
```

### チャレンジ・レスポンス認証

```typescript
import crypto from 'node:crypto';

/** 暗号学的に安全なランダム nonce を生成 (32 bytes hex) */
function generateChallenge(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Ed25519 署名を検証 */
function verifySignature(publicKeyPem: string, nonce: string, signatureHex: string): boolean
```

1. クライアント接続時、サーバが `challenge` イベントで nonce を送信
2. クライアントが秘密鍵で nonce を署名し `authenticate` で返送
3. サーバが署名検証 + 鍵ストアから `group_name` を検索
4. 成功 → `authResult { success: true, groupName }` 送信
5. 失敗 → `authResult { success: false, error: "authentication failed" }` 送信 → 切断
   - 鍵未登録・署名不正などの理由を区別せず、固定の汎用メッセージを返す (攻撃者への情報漏洩防止)

### セキュリティ考慮

- nonce は `crypto.randomBytes(32)` で接続ごとに生成し、リプレイ攻撃を防止
- 署名検証は Node.js `crypto.verify()` を使用
- 認証タイムアウト: 接続から 10 秒以内に認証完了しなければ切断
- 認証済みでないソケットからの `join` / `signal` は拒否
- 認証失敗時のエラーメッセージは固定文言 `"authentication failed"` のみ返し、失敗理由の詳細を公開しない
- IP 単位および全体の認証試行レートリミットを適用 (後述)

## 2. 認証レートリミット (`src/app/AuthRateLimiter.mts`)

ブルートフォース攻撃を防止するため、認証失敗回数に基づくレートリミットを IP 単位・全体の 2 層で適用する。

### 設定値

| 環境変数 | 説明 | デフォルト |
|---|---|---|
| `RATE_LIMIT_WINDOW_MS` | スライディングウィンドウの長さ (ms) | `60000` (60 秒) |
| `RATE_LIMIT_MAX_PER_IP` | ウィンドウ内の IP 単位の最大認証失敗数 | `5` |
| `RATE_LIMIT_MAX_GLOBAL` | ウィンドウ内の全体の最大認証失敗数 | `30` |
| `RATE_LIMIT_MAX_TRACKED_IPS` | 追跡する IP アドレスの上限数 | `10000` |

### クラス設計

```typescript
interface RateLimitConfig {
  windowMs: number;       // スライディングウィンドウ (ms)
  maxPerIp: number;       // IP 単位の最大失敗数
  maxGlobal: number;      // 全体の最大失敗数
  maxTrackedIps: number;  // 追跡 IP アドレスの上限
}

class AuthRateLimiter {
  private perIp: Map<string, number[]>;  // IP → 失敗タイムスタンプ配列
  private globalFailures: number[];       // 全体の失敗タイムスタンプ配列

  constructor(private readonly config: RateLimitConfig)

  /** 指定 IP からの認証が許可されるか判定する */
  isAllowed(ip: string): boolean

  /** 認証失敗を記録する */
  recordFailure(ip: string): void
}
```

### 動作仕様

**`isAllowed(ip)`**

1. ウィンドウ外の古いエントリを除去 (現在時刻 - `windowMs` 以前)
2. 全体の失敗数が `maxGlobal` 以上 → `false` (全体ブロック)
3. 該当 IP の失敗数が `maxPerIp` 以上 → `false` (IP ブロック)
4. それ以外 → `true`

**`recordFailure(ip)`**

1. `globalFailures` に現在時刻を追加
2. `perIp` に該当 IP が未登録かつ `perIp.size >= maxTrackedIps` の場合、最も古いエントリの IP を削除して空きを確保
3. 該当 IP のタイムスタンプ配列に現在時刻を追加

### ConnectionHandler.mts への組み込み

`ConnectionHandler` が接続開始時にレートリミットを判定し、認証失敗時に記録する:

```typescript
// ConnectionHandler.mts 内
onConnect(ip: string): void {
  if (!this.rateLimiter.isAllowed(ip)) {
    this.emitter.emitError('too many requests');
    this.emitter.disconnect();
    return;
  }
  this.emitter.emitChallenge(this.nonce);
}

onAuthenticate(payload: AuthenticatePayload): void {
  // 認証処理 ...
  if (!success) {
    this.rateLimiter.recordFailure(this.ip);
    // authResult 送信 → 切断
  }
}
```

ブロック時は `emitter` 経由で `"too many requests"` を返して即切断する。
フレームワーク層 (`server.mts`) はレートリミットの存在を知らない。

## 3. ルームマッチング (`src/app/MatchingService.mts`)

### 概念

- **ルームキー**: `(groupName, roomName)` のペア
- 各ルームキーに対し、最大1つの listen ソケットと1つの forward ソケットが待機可能
- 同じルームキーに同じモードの2つ目の接続が来たらエラー

### ルーム名バリデーション

`join` イベント受信時、`room` フィールドを以下のルールで検証する。不正な場合は `error` イベントを返して処理を中断する。

| ルール | 値 |
|---|---|
| 最小長 | 1 文字 |
| 最大長 | 64 文字 |
| 許可文字 | `a-z`, `A-Z`, `0-9`, `-`, `_` |
| 正規表現 | `/^[a-zA-Z0-9_-]{1,64}$/` |

```typescript
const ROOM_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function validateRoomName(room: string): boolean {
  return ROOM_NAME_PATTERN.test(room);
}
```

### データ構造

```typescript
interface WaitingClient {
  socketId: string;
  mode: 'listen' | 'forward';
}

/** ルームキー → 待機中クライアント */
type RoomMap = Map<string, WaitingClient[]>;

function roomKey(groupName: string, roomName: string): string {
  return `${groupName}/${roomName}`;
}
```

### マッチング処理

```typescript
class MatchingService {
  private rooms: RoomMap = new Map();

  /** クライアントをルームに追加。ペアが成立したら両方の socketId を返す */
  join(groupName: string, roomName: string, socketId: string, mode: 'listen' | 'forward'):
    { matched: false } | { matched: true; listenSocketId: string; forwardSocketId: string }

  /** クライアント切断時にルームから除去 */
  leave(socketId: string): void
}
```

### マッチング後のフロー

1. `matched` イベントを listen 側・forward 側の両方に送信
2. listen 側がオファーを生成し `signal` イベントで送信
3. サーバがペアの forward 側へ `signal` を中継
4. forward 側がアンサーを生成し `signal` イベントで送信
5. サーバがペアの listen 側へ `signal` を中継
6. P2P 確立後、両クライアントが WebSocket を切断

### シグナリング中継

マッチング成立後、2つのソケットのペアを記録する:

```typescript
/** マッチング成立したペア */
interface MatchedPair {
  listenSocketId: string;
  forwardSocketId: string;
}

/** socketId → ペア相手の socketId */
type PeerMap = Map<string, string>;
```

`signal` イベントを受信したら、`PeerMap` からペア相手を探して中継するだけ。

## 4. 接続ライフサイクル管理 (`src/app/ConnectionHandler.mts`)

接続ごとの状態遷移とドメインロジックのオーケストレーションを担当する。
Socket.IO に依存せず、コールバックインターフェース (`ConnectionEmitter`) 経由で出力する。

### 状態遷移

```
connected → authenticated → joined → matched
    │            │              │         │
    └────────────┴──────────────┴─────────┴──→ disconnected
```

### コールバックインターフェース

`ConnectionHandler` が外部 (フレームワーク層) に通知するためのインターフェース。
`server.mts` が `socket.emit` で実装する。

```typescript
/** ConnectionHandler → フレームワーク層への出力 */
interface ConnectionEmitter {
  emitChallenge(nonce: string): void;
  emitAuthResult(payload: AuthResultPayload): void;
  emitMatched(payload: MatchedPayload): void;
  emitSignal(payload: SignalPayload): void;
  emitError(message: string): void;
  disconnect(): void;
}
```

### ConnectionHandler

```typescript
class ConnectionHandler {
  constructor(
    private readonly id: string,
    private readonly ip: string,
    private readonly emitter: ConnectionEmitter,
    private readonly keyStore: KeyStore,
    private readonly rateLimiter: AuthRateLimiter,
    private readonly matchingService: MatchingService,
  )

  /** 接続時に呼ばれる。レートリミット判定 → チャレンジ送信 */
  onConnect(): void

  /** authenticate イベント受信時 */
  onAuthenticate(payload: AuthenticatePayload): void

  /** join イベント受信時 */
  onJoin(payload: JoinPayload): void

  /** signal イベント受信時 */
  onSignal(payload: SignalPayload): void

  /** 切断時 */
  onDisconnect(): void
}
```

### 処理フロー

1. `onConnect()`: レートリミット判定 → nonce 生成 → `emitter.emitChallenge(nonce)`
2. `onAuthenticate()`: 状態が `connected` でなければ拒否。署名検証 → KeyStore で group 検索 → 成功時 `emitter.emitAuthResult({ success: true, groupName })` / 失敗時 `recordFailure` → `emitter.emitAuthResult({ success: false })` → `emitter.disconnect()`
3. `onJoin()`: 状態が `authenticated` でなければ拒否。ルーム名バリデーション → `matchingService.join()` → マッチ成立時は両方の `ConnectionHandler` の emitter に `emitMatched` + ペアを記録
4. `onSignal()`: 状態が `matched` でなければ拒否。ペア相手の emitter に `emitSignal` で中継
5. `onDisconnect()`: `matchingService.leave()` でルームからクリーンアップ

### テスト方法

`ConnectionEmitter` をテスト用実装 (呼び出し記録) に差し替えることで、Socket.IO を起動せずに Unit テストが可能。

## 5. フレームワーク層 (`src/app/server.mts`)

Socket.IO のイベントと `ConnectionHandler` をつなぐ薄いアダプタ。
ビジネスロジックは一切記述しない。

```typescript
interface ServerOptions {
  /** デバッグモード。true の場合 CORS チェックを無効化する (開発環境専用) */
  debug?: boolean;
  /** 許可するオリジンのリスト。debug=false 時に必須 */
  allowedOrigins?: string[];
  /** 認証レートリミット設定 */
  rateLimit?: Partial<RateLimitConfig>;
}

function createSignalingServer(
  httpServer: http.Server,
  keyStore: KeyStore,
  options: ServerOptions = {},
): SocketIOServer {
  const rateLimiter = new AuthRateLimiter({ ... });
  const matchingService = new MatchingService();
  const io = new Server(httpServer, { cors: ... });

  io.on('connection', (socket) => {
    // ConnectionEmitter を socket.emit で実装
    const emitter: ConnectionEmitter = {
      emitChallenge: (nonce) => socket.emit('challenge', { nonce }),
      emitAuthResult: (payload) => socket.emit('authResult', payload),
      emitMatched: (payload) => socket.emit('matched', payload),
      emitSignal: (payload) => socket.emit('signal', payload),
      emitError: (message) => socket.emit('error', { message }),
      disconnect: () => socket.disconnect(true),
    };

    const handler = new ConnectionHandler(
      socket.id, socket.handshake.address, emitter,
      keyStore, rateLimiter, matchingService,
    );

    handler.onConnect();
    socket.on('authenticate', (p) => handler.onAuthenticate(p));
    socket.on('join', (p) => handler.onJoin(p));
    socket.on('signal', (p) => handler.onSignal(p));
    socket.on('disconnect', () => handler.onDisconnect());
  });

  return io;
}
```

`server.mts` は以下のみを担当する:
- Socket.IO サーバの初期化 (CORS 設定含む)
- ドメインサービス (`AuthRateLimiter`, `MatchingService`) のインスタンス生成
- `ConnectionEmitter` の Socket.IO 実装
- Socket.IO イベントと `ConnectionHandler` メソッドのマッピング

## 6. エントリポイント (`src/index.mts`)

```typescript
const PORT = Number(process.env.SIGNALING_PORT) || 3000;
const DEBUG = process.env.SIGNALING_DEBUG === '1';
const ALLOWED_ORIGINS = process.env.SIGNALING_ALLOWED_ORIGINS
  ? process.env.SIGNALING_ALLOWED_ORIGINS.split(',')
  : [];

const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000;
const RATE_LIMIT_MAX_PER_IP = Number(process.env.RATE_LIMIT_MAX_PER_IP) || 5;
const RATE_LIMIT_MAX_GLOBAL = Number(process.env.RATE_LIMIT_MAX_GLOBAL) || 30;
const RATE_LIMIT_MAX_TRACKED_IPS = Number(process.env.RATE_LIMIT_MAX_TRACKED_IPS) || 10_000;

const app = express();
const httpServer = http.createServer(app);
const keyStore = new KeyStore('./keys.json');

createSignalingServer(httpServer, keyStore, {
  debug: DEBUG,
  allowedOrigins: ALLOWED_ORIGINS,
  rateLimit: {
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxPerIp: RATE_LIMIT_MAX_PER_IP,
    maxGlobal: RATE_LIMIT_MAX_GLOBAL,
    maxTrackedIps: RATE_LIMIT_MAX_TRACKED_IPS,
  },
});

httpServer.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`);
});
```

## テスト方針

| テスト対象 | テスト方法 |
|---|---|
| `KeyStore.mts` | `generateChallenge()` / `verifySignature()` / `KeyStore` の Unit テスト |
| `AuthRateLimiter.mts` | `AuthRateLimiter` の IP 単位ブロック / 全体ブロック / ウィンドウ経過後のリセット / 追跡 IP 上限の Unit テスト |
| `MatchingService.mts` | `MatchingService` の join/leave/マッチング Unit テスト |
| `ConnectionHandler.mts` | `ConnectionEmitter` をテスト用実装に差し替え、状態遷移・認証フロー・マッチングフロー・中継フローの Unit テスト |
| `server.mts` | socket.io-client を用いた結合テスト |
