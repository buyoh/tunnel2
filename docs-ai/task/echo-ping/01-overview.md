# 01 — 機能概要・プロトコル変更

## 目的

- P2P チャネル確立後にポートフォワーディングなしで疎通確認を行う
- スモークテストで「P2P 接続 → メッセージ往復」を自動検証する

## 新コマンド概要

### 接続コマンド (TCP トンネルなし)

| コマンド | 役割 | 既存対応 |
|----------|------|----------|
| `connect-offer` | Offer 側。P2P offer を生成する (TCP サーバなし) | `listen` から TCP を除いたもの |
| `connect-accept` | Answer 側。Offer 受信待ちに遷移する (TCP クライアントなし) | `forward` から TCP を除いたもの |

既存の `set-remote-offer` / `set-remote-answer` / `close` はそのまま使う。

### メッセージコマンド

| コマンド | 引数 | 動作 |
|----------|------|------|
| `ping` | `message: string` | P2P チャネルに PING メッセージを送信 |

受信側は PONG を自動返信する (daemon コマンド不要)。

## プロトコルメッセージ変更

### 新メッセージ種別

`protocol-message.mts` の `MessageType` enum に追加:

```typescript
PING = 0x30,
PONG = 0x31,
```

### フォーマット

既存のプロトコルメッセージと同一形式:

```
[4 bytes: connId (= 0)] [1 byte: type] [payload: UTF-8 text]
```

- `connId = 0` : PING/PONG は TCP 接続に紐づかないため固定値 0 を使用
- PING payload: 送信者が指定したテキスト
- PONG payload: 受信した PING の payload をそのまま返す (echo)

## イベント

| イベント名 | 発火タイミング | data |
|------------|----------------|------|
| `pong-received` | PONG を受信したとき | PONG の payload テキスト |
