# 01. 全体アーキテクチャ

## システム概要

2つのピア間で P2P 通信を確立し、TCP 通信をトンネリングするアプリケーション。

P2P トランスポート層はインターフェースで抽象化し、具体的な実装 (node-datachannel 等) に直接依存しない。
アプリケーションロジックは `TunnelApp` クラスに集約し、CLI / Web UI / GUI など複数のフロントエンドから操作可能な設計とする。

```
[Peer A 側]                                          [Peer B 側]
┌─────────────┐    TCP     ┌──────────────────┐   P2P Transport  ┌──────────────────┐    TCP     ┌─────────────┐
│ TCP クライアント │ ──────▶ │ tunnel (listen)  │ ◀═══════════▶   │ tunnel (forward) │ ──────▶ │ TCP サーバー   │
│ (例: ssh)    │           │ ローカルポートで待受 │  (抽象化層)      │ 宛先に接続        │           │ (例: sshd)   │
└─────────────┘            └──────────────────┘                  └──────────────────┘            └─────────────┘
```

### 利用シナリオ

1. **Peer A (listen 側)**: ローカルポートで TCP 接続を待ち受け、P2P 経由で Peer B に転送
2. **Peer B (forward 側)**: P2P から受信した接続を指定先 (host:port) に TCP 転送

例: `ssh -p 2222 localhost` → Peer A (port 2222 で待受) → P2P → Peer B → `localhost:22`

## レイヤー構成

```
┌─────────────────────────────────────────────────┐
│              フロントエンド層                       │
│  ┌──────┐  ┌──────────┐  ┌──────┐               │
│  │ CLI  │  │ Web UI   │  │ GUI  │  (将来拡張)     │
│  └──┬───┘  └────┬─────┘  └──┬───┘               │
│     └───────────┼───────────┘                    │
│                 ▼                                │
│  ┌──────────────────────────────┐                │
│  │        TunnelApp             │                │
│  │  (アプリケーションコア)         │                │
│  │  - 状態管理                    │                │
│  │  - シグナリング制御              │                │
│  │  - トンネル管理                 │                │
│  │  - イベント発行                 │                │
│  └──────────┬───────────────────┘                │
│             │                                    │
│  ┌──────────▼───────────────────┐                │
│  │       トンネル層               │                │
│  │  TCP ↔ P2P ブリッジ            │                │
│  │  多重化プロトコル               │                │
│  └──────────┬───────────────────┘                │
│             │                                    │
├─────────────┼────────────────────────────────────┤
│             ▼            トランスポート抽象化層      │
│  ┌──────────────────────────────┐                │
│  │   IP2PTransport (interface)  │                │
│  └──────────┬───────────────────┘                │
│             │                                    │
│  ┌──────────▼───────────────────┐                │
│  │  DataChannelTransport        │  (実装)         │
│  │  (node-datachannel)          │                │
│  └──────────────────────────────┘                │
└─────────────────────────────────────────────────┘
```

## モジュール構成

```
src/
├── index.mts              # エントリーポイント (CLI)
├── app.mts                # TunnelApp クラス (アプリケーションコア)
├── signaling.mts          # SDP/ICE 情報のエンコード・デコード
├── tunnel.mts             # TCP ↔ P2P ブリッジ
├── protocol.mts           # P2P チャネル上の多重化プロトコル
├── transport/
│   ├── interface.mts      # IP2PTransport インターフェース定義
│   └── datachannel.mts    # node-datachannel による実装
└── cli.mts                # CLI フロントエンド
```

### モジュール間の依存関係

```
index.mts
  └── cli.mts
        └── app.mts
              ├── signaling.mts
              ├── tunnel.mts
              │     └── protocol.mts
              └── transport/interface.mts  ← インターフェースのみ依存
                        ▲
                        │ (実装を注入)
              transport/datachannel.mts    ← node-datachannel に依存
```

**ポイント**: `app.mts`, `tunnel.mts` は `transport/interface.mts` にのみ依存し、`node-datachannel` を直接 import しない。
具体的なトランスポート実装はエントリーポイント (`index.mts` / `cli.mts`) で生成して `TunnelApp` に注入する。

## 技術選定

| 技術 | 用途 | 備考 |
|---|---|---|
| node-datachannel | WebRTC DataChannel | P2P 通信基盤 (トランスポート実装) |
| Node.js `net` | TCP ソケット | socat 代替。Node.js 標準ライブラリで十分 |
| Node.js `readline` | CLI 対話 | SDP/ICE のコピペ対話 |

### socat が不要な理由

Node.js の `net` モジュールで以下を実現可能:
- `net.createServer()` でローカル TCP リスナーを作成
- `net.connect()` で宛先への TCP 接続を確立
- ソケットの read/write を P2P チャネルにブリッジ

socat を使うメリット (別プロセスとのパイプ接続) は特に必要ないため、純粋に Node.js で完結させる。

### 将来拡張: Web UI / GUI

`TunnelApp` はイベント駆動で状態を公開するため、以下のフロントエンドを追加可能 (現時点では実装しない):

- **Web UI**: 簡易 HTTP サーバー + HTML/JS で `TunnelApp` を操作。シグナリング情報の表示・入力を Web フォーム経由で行う。
- **GUI (Electron 等)**: `TunnelApp` のインスタンスをメインプロセスで保持し、IPC で操作。
- **API サーバー**: REST/WebSocket API を公開し、外部システムから制御。

## データフロー

### 接続確立フロー

```
Peer A (offer 側)                     Peer B (answer 側)
─────────────────                     ──────────────────
1. TunnelApp.listen(port) 呼出
2. IP2PTransport.createOffer()
3. Offer 生成 + ICE 収集完了
4. TunnelApp が 'offer' イベント発行
5. フロントエンドが Offer を表示
          ── ユーザーがコピペ ──▶
                                      6. TunnelApp.forward(host, port) 呼出
                                      7. TunnelApp.setRemoteOffer(data)
                                      8. IP2PTransport.acceptOffer()
                                      9. Answer 生成 + ICE 収集完了
                                      10. TunnelApp が 'answer' イベント発行
                                      11. フロントエンドが Answer を表示
          ◀── ユーザーがコピペ ──
12. TunnelApp.setRemoteAnswer(data)
13. IP2PTransport.applyAnswer()
14. P2P 接続確立
          ◀═══ P2P チャネル 開通 ═══▶
```

### TCP トンネリングフロー

```
TCP Client ──▶ [listen 側]
                 │ 新規 TCP 接続を検知
                 │ connId を割り当て
                 │ CONNECT メッセージ送信 ──▶ [forward 側]
                 │                              │ TCP connect() を実行
                 │                              │ CONNECT_ACK 送信
                 │ ◀── CONNECT_ACK ──
                 │
  TCP data ──▶ DATA メッセージ ──▶ TCP data ──▶ TCP Server
  TCP data ◀── DATA メッセージ ◀── TCP data ◀── TCP Server
                 │
                 │ TCP 切断検知
                 │ CLOSE メッセージ ──▶ TCP 切断
```

## 依存関係

- `node-datachannel` ^0.32.1 (インストール済み) — トランスポート実装のみが依存
- Node.js >= 20.0.0 (package.json で指定済み)
- 追加パッケージ不要
