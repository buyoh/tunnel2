# 01. 全体アーキテクチャ

## システム概要

2つのピア間で WebRTC DataChannel を使い、TCP 通信をトンネリングする。

```
[Peer A 側]                                          [Peer B 側]
┌─────────────┐    TCP     ┌──────────────────┐     WebRTC      ┌──────────────────┐    TCP     ┌─────────────┐
│ TCP クライアント │ ──────▶ │ tunnel (listen)  │ ◀═══════════▶  │ tunnel (forward) │ ──────▶ │ TCP サーバー   │
│ (例: ssh)    │           │ ローカルポートで待受 │  DataChannel   │ 宛先に接続        │           │ (例: sshd)   │
└─────────────┘            └──────────────────┘                 └──────────────────┘            └─────────────┘
```

### 利用シナリオ

1. **Peer A (listen 側)**: ローカルポートで TCP 接続を待ち受け、DataChannel 経由で Peer B に転送
2. **Peer B (forward 側)**: DataChannel から受信した接続を指定先 (host:port) に TCP 転送

例: `ssh -p 2222 localhost` → Peer A (port 2222 で待受) → DataChannel → Peer B → `localhost:22`

## モジュール構成

```
src/
├── index.mts            # エントリーポイント
├── cli.mts              # CLI パーサー・ユーザーインタラクション
├── signaling.mts        # SDP/ICE 情報のエンコード・デコード・交換
├── connection.mts       # PeerConnection / DataChannel 管理
├── tunnel.mts           # TCP ↔ DataChannel ブリッジ
└── protocol.mts         # DataChannel 上の多重化プロトコル
```

## 技術選定

| 技術 | 用途 | 備考 |
|---|---|---|
| node-datachannel | WebRTC DataChannel | P2P 通信基盤 |
| Node.js `net` | TCP ソケット | socat 代替。Node.js 標準ライブラリで十分 |
| Node.js `readline` | CLI 対話 | SDP/ICE のコピペ対話 |

### socat が不要な理由

Node.js の `net` モジュールで以下を実現可能:
- `net.createServer()` でローカル TCP リスナーを作成
- `net.connect()` で宛先への TCP 接続を確立
- ソケットの read/write を DataChannel にブリッジ

socat を使うメリット (別プロセスとのパイプ接続) は特に必要ないため、純粋に Node.js で完結させる。

## データフロー

### 接続確立フロー

```
Peer A (offer 側)                     Peer B (answer 側)
─────────────────                     ──────────────────
1. PeerConnection 作成
2. DataChannel 作成
3. SDP Offer 生成
4. ICE Candidate 収集完了
5. Offer 情報を表示 (base64)
          ── ユーザーがコピペ ──▶
                                      6. PeerConnection 作成
                                      7. Remote Description 設定
                                      8. SDP Answer 生成
                                      9. ICE Candidate 収集完了
                                      10. Answer 情報を表示 (base64)
          ◀── ユーザーがコピペ ──
11. Remote Description 設定
12. P2P 接続確立
          ◀═══ DataChannel 開通 ═══▶
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

- `node-datachannel` ^0.32.1 (インストール済み)
- Node.js >= 20.0.0 (package.json で指定済み)
- 追加パッケージ不要
