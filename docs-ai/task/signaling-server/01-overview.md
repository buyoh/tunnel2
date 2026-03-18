# 01. 全体アーキテクチャ

## 目的

現在はシグナリング情報 (SDP Offer/Answer, ICE Candidate) を base64 テキストにエンコードし、ユーザーが手動でコピペして交換している。
この方式は残しつつ、WebSocket ベースのシグナリングサーバを介した自動交換を追加する。

## システム構成図

```
┌───────────────┐         WebSocket         ┌────────────────┐         WebSocket        ┌───────────────┐
│  tunnel CLI   │◄─────────────────────────►│  signaling-    │◄────────────────────────►│  tunnel CLI   │
│  (listen側)   │   Socket.IO               │  server        │   Socket.IO              │  (forward側)  │
└───────┬───────┘                           └────────────────┘                          └───────┬───────┘
        │                                                                                       │
        │ P2P DataChannel (WebRTC)                                                              │
        └───────────────────────────────────────────────────────────────────────────────────────┘
```

1. 両クライアントが signaling-server に WebSocket 接続
2. 公開鍵認証を通過
3. ルーム名 + モード (listen/forward) で待機
4. ペアが揃ったらシグナリング情報を中継
5. P2P DataChannel 接続が確立したら WebSocket を切断

## サブプロジェクト構成

npm workspaces を使用し、ルートの `packages/` 以下に2つのパッケージを配置する。
エントリポイント以外のファイルは `src/app/` 以下に配置する。

```
tunnel2/
├── package.json              # workspaces: ["packages/*"] を追加
├── packages/
│   ├── signaling-types/      # WebSocket メッセージ型定義
│   │   ├── package.json      # name: "@tunnel2/signaling-types"
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.mts
│   └── signaling-server/     # Express + Socket.IO サーバ
│       ├── package.json      # name: "@tunnel2/signaling-server"
│       ├── tsconfig.json
│       ├── keys.json         # 公開鍵登録ファイル
│       └── src/
│           ├── index.mts     # エントリポイント (環境変数読み込み・サーバ起動のみ)
│           └── app/
│               ├── server.mts              # Express + Socket.IO 初期化・イベント接続 (フレームワーク層)
│               ├── connection-handler.mts   # 接続ライフサイクル管理 (ドメイン・オーケストレーション層)
│               ├── key-store.mts            # 公開鍵認証 (KeyStore, チャレンジ生成, 署名検証)
│               ├── auth-rate-limiter.mts     # 認証レートリミット
│               └── matching-service.mts      # ルームマッチング・シグナリング中継ロジック
└── src/                      # 既存の tunnel クライアント
    └── app/
        ├── cli.mts           # 既存コピペ CLI (変更なし)
        └── ws-signaling.mts  # 新規: WebSocket シグナリングクライアント
```

## レイヤー構成

既存コードベース (`DaemonController` / `DaemonServer` の分離) と同様のパターンに従い、
フレームワーク層とドメインロジック層を明確に分離する。

### ドメインロジック層 (`key-store.mts`, `auth-rate-limiter.mts`, `matching-service.mts`, `connection-handler.mts`)

フレームワーク (Express, Socket.IO) に依存しない純粋なロジック。

| モジュール | 責務 |
|---|---|
| `key-store.mts` | 公開鍵ストア管理、チャレンジ生成、Ed25519 署名検証 |
| `auth-rate-limiter.mts` | IP 単位・全体の認証試行レートリミット |
| `matching-service.mts` | ルームマッチング、ペア管理、シグナリング中継先の解決 |
| `connection-handler.mts` | 接続ごとのライフサイクル状態機械 (未認証→認証済→参加済→マッチ済) の管理。`key-store` / `auth-rate-limiter` / `matching-service` を組み合わせたドメインオーケストレーション |

`connection-handler.mts` が接続ごとの状態遷移を管理し、各イベント (authenticate, join, signal) を受けて
ドメインモジュールを呼び出し、結果をコールバック (インターフェース) 経由で返す。
Socket.IO への依存を持たないため、コールバックの差し替えで単体テストが可能。

### フレームワーク層 (`server.mts`)

Socket.IO のイベントとドメインロジック層をつなぐ薄いアダプタ。

- Socket.IO サーバの初期化 (CORS 設定含む)
- `connection` イベントで `connection-handler.mts` の `ConnectionHandler` を生成
- Socket.IO イベント (`authenticate`, `join`, `signal`, `disconnect`) を `ConnectionHandler` のメソッドに委譲
- `ConnectionHandler` のコールバック出力を `socket.emit` に接続

`server.mts` 自体にはビジネスロジックを記述しない。

### エントリポイント (`index.mts`)

環境変数の読み込みと HTTP サーバの起動のみを行う。

## テスト方針

依存性注入により各層を独立してテスト可能にする。

| テスト対象 | テスト方法 |
|---|---|
| `key-store.mts` | KeyStore, generateChallenge, verifySignature の Unit テスト |
| `auth-rate-limiter.mts` | AuthRateLimiter の Unit テスト (IP ブロック, 全体ブロック, ウィンドウ経過) |
| `matching-service.mts` | MatchingService の join/leave/マッチング Unit テスト |
| `connection-handler.mts` | ConnectionHandler にモックコールバックを注入し、状態遷移・ドメインフローの Unit テスト |
| `server.mts` | socket.io-client を用いた結合テスト |

## 依存関係

### signaling-types

依存パッケージなし (型定義のみ)。

### signaling-server

| パッケージ | 用途 |
|---|---|
| `express` | HTTP サーバ |
| `socket.io` | WebSocket サーバ |
| `@tunnel2/signaling-types` | メッセージ型 |

### tunnel クライアント (既存プロジェクト)

| 追加パッケージ | 用途 |
|---|---|
| `socket.io-client` | WebSocket クライアント |
| `@tunnel2/signaling-types` | メッセージ型 |

## 既存コードへの影響

- `src/app/cli.mts` — 既存のコピペ方式はそのまま残す。
- `src/app/tunnel-app.mts` の `TunnelApp` — 変更なし。`listen()` / `forward()` / `setRemoteOffer()` / `setRemoteAnswer()` の API をそのまま使う。
- 新規ファイル `src/app/ws-signaling.mts` を追加し、WebSocket シグナリング + 再接続ロジックを実装する。
- CLI にサブコマンドまたはオプションを追加して WebSocket 接続モードを選択可能にする。
