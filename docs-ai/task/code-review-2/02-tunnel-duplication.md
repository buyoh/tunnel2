# TunnelListener / TunnelForwarder のコード重複

## 重要度

medium

## 問題点

`TunnelListener` と `TunnelForwarder` に以下のメソッド・パターンがほぼ同一のコードとして存在する:

| メソッド/パターン | 説明 |
|-------------------|------|
| `stop()` | 全接続の `remoteClosing = true` → `socket.destroy()` → `connections.clear()` |
| `onBufferedAmountLow()` | paused な接続を全て resume |
| `send()` | `transport.sendMessage(encodeMessage(...))` |
| `applyBackpressure()` | `bufferedAmount()` が `HIGH_WATER_MARK` を超えたら pause |
| `connections: Map<number, ConnectionEntry>` | 接続管理のデータ構造 |
| `HIGH_WATER_MARK = 1 * 1024 * 1024` | 同一定数 |

両クラスで `ConnectionEntry` 型を共有し、TCP ソケットの管理ロジックが重複している。

## 違反しているルール

- **DRY (Don't Repeat Yourself)**: 同じロジックが 2 箇所に存在し、片方だけ修正されるリスクがある
- **保守性**: バックプレッシャーの閾値変更など、両方のファイルを同時に修正する必要がある

## 解決策

### A. 共通接続管理クラスの抽出（推奨）

接続管理・バックプレッシャー・送信ロジックを `ConnectionManager` のような共通クラスに抽出し、
`TunnelListener` と `TunnelForwarder` がそれを利用する形にリファクタリングする。

```
ConnectionManager
├── connections: Map<number, ConnectionEntry>
├── stop()
├── onBufferedAmountLow()
├── send(connId, type, payload)
└── applyBackpressure(connId)
```

**影響範囲**: `tunnel-listener.mts`, `tunnel-forwarder.mts`, 新規 `connection-manager.mts`、および各テストファイル。

### B. ユーティリティ関数として抽出

クラスではなく、`send()` と `applyBackpressure()` をスタンドアロン関数として共有モジュールに抽出する。
`stop()` と `onBufferedAmountLow()` は `Map<number, ConnectionEntry>` を受け取る関数にする。

**影響範囲**: 同上だが、クラスの凝集度は低下する。
