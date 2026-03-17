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
│           ├── index.mts     # エントリポイント
│           ├── server.mts    # Express + Socket.IO 初期化
│           ├── auth.mts      # 公開鍵認証
│           └── matching.mts  # ルームマッチング・中継
└── src/                      # 既存の tunnel クライアント
    └── app/
        ├── cli.mts           # 既存コピペ CLI (変更なし)
        └── ws-signaling.mts  # 新規: WebSocket シグナリングクライアント
```

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
- `src/app/app.mts` の `TunnelApp` — 変更なし。`listen()` / `forward()` / `setRemoteOffer()` / `setRemoteAnswer()` の API をそのまま使う。
- 新規ファイル `src/app/ws-signaling.mts` を追加し、WebSocket シグナリング + 再接続ロジックを実装する。
- CLI にサブコマンドまたはオプションを追加して WebSocket 接続モードを選択可能にする。
