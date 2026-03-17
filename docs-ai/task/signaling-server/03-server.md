# 03. signaling-server 実装設計

## 概要

`packages/signaling-server/` に配置する Express + Socket.IO サーバ。
公開鍵認証、ルームマッチング、シグナリングデータの中継を行う。

## モジュール構成

| ファイル | 責務 |
|---|---|
| `src/index.mts` | エントリポイント。ポート読み込み、サーバ起動 |
| `src/server.mts` | Express + Socket.IO 初期化、Socket イベントハンドリング |
| `src/auth.mts` | 公開鍵ストア管理、チャレンジ生成、署名検証 |
| `src/matching.mts` | ルームマッチング、シグナリング中継ロジック |
| `keys.json` | 公開鍵登録データ |

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

## 1. 公開鍵認証 (`auth.mts`)

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
/** ランダムな nonce を生成 (32 bytes hex) */
function generateChallenge(): string

/** Ed25519 署名を検証 */
function verifySignature(publicKeyPem: string, nonce: string, signatureHex: string): boolean
```

1. クライアント接続時、サーバが `challenge` イベントで nonce を送信
2. クライアントが秘密鍵で nonce を署名し `authenticate` で返送
3. サーバが署名検証 + 鍵ストアから `group_name` を検索
4. 成功 → `authResult { success: true, groupName }` 送信
5. 失敗 → `authResult { success: false, error }` 送信 → 切断

### セキュリティ考慮

- nonce は接続ごとに生成し、リプレイ攻撃を防止
- 署名検証は Node.js `crypto.verify()` を使用
- 認証タイムアウト: 接続から 10 秒以内に認証完了しなければ切断
- 認証済みでないソケットからの `join` / `signal` は拒否

## 2. ルームマッチング (`matching.mts`)

### 概念

- **ルームキー**: `(groupName, roomName)` のペア
- 各ルームキーに対し、最大1つの listen ソケットと1つの forward ソケットが待機可能
- 同じルームキーに同じモードの2つ目の接続が来たらエラー

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

## 3. サーバ初期化 (`server.mts`)

```typescript
function createSignalingServer(httpServer: http.Server, keyStore: KeyStore): SocketIOServer {
  const io = new Server(httpServer, { /* CORS等設定 */ });

  io.on('connection', (socket) => {
    // 1. challenge 送信
    // 2. authenticate ハンドラ登録
    // 3. 認証成功後に join / signal ハンドラ登録
    // 4. disconnect ハンドラ (ルームから除去)
  });

  return io;
}
```

### ソケットの状態管理

各ソケットに以下の情報を紐づける:

```typescript
interface SocketState {
  authenticated: boolean;
  groupName?: string;
  mode?: 'listen' | 'forward';
  roomName?: string;
}
```

`socket.data` に格納する (Socket.IO の組み込み機能)。

## 4. エントリポイント (`index.mts`)

```typescript
const PORT = Number(process.env.SIGNALING_PORT) || 3000;

const app = express();
const httpServer = http.createServer(app);
const keyStore = new KeyStore('./keys.json');

createSignalingServer(httpServer, keyStore);

httpServer.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`);
});
```

## テスト方針

- `auth.mts`: `generateChallenge()` / `verifySignature()` / `KeyStore` の unit テスト
- `matching.mts`: `MatchingService` の join/leave/マッチング unit テスト
- `server.mts`: Socket.IO の統合テスト (socket.io-client を使用)
