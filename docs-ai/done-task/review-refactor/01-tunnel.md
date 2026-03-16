# tunnel.mts / tunnel.spec.mts のレビューと改善計画

## 対象ファイル

- `src/app/tunnel.mts` — `TunnelListener`, `TunnelForwarder` クラス
- `src/app/tunnel.spec.mts` — 上記のテスト

## 現状の問題点

### 問題1: テストで実TCP接続を使用（要件1 違反）

`tunnel.spec.mts` では以下のような実I/Oが行われている:

- `TunnelListener` テスト: ポート 31001 で実TCP サーバーをバインドし、`net.createConnection` で実接続
- 統合テスト: `net.createServer` でエコーサーバーを起動し、ポート 31002 で実TCP通信

P2P トランスポート層は `MockTransport` で適切にモックされているが、TCP 層は実ネットワーク I/O を使っている。

### 問題2: TCP層のDI欠如（要件2 違反）

`TunnelListener` は内部で直接 `net.createServer()` を呼び出し、`TunnelForwarder` は内部で直接 `net.createConnection()` を呼び出している。
TCP操作がハードコードされているため、Mockライブラリによるメソッド差し替えなしにはTCP層をモックできない構造になっている。

**該当箇所:**
- `tunnel.mts` `TunnelListener.start()` 内 `net.createServer()`
- `tunnel.mts` `TunnelForwarder.handleConnect()` 内 `net.createConnection()`

### 問題3: 単一責任原則の不足（要件3 違反）

`TunnelListener` / `TunnelForwarder` はそれぞれ以下の複数の責務を持つ:

1. **TCP サーバー/クライアント管理** — `net.createServer`, `net.createConnection`
2. **プロトコルメッセージ処理** — `handleMessage` で `MessageType` に応じた分岐
3. **バックプレッシャー制御** — `applyBackpressure`, `onBufferedAmountLow`
4. **接続状態の追跡** — `ConnectionEntry`, `connections` Map

## 改善方針

### 方針A: TCP ソケット生成のファクトリ注入

TCP サーバー / クライアント生成をインターフェースとして定義し、コンストラクタで注入可能にする。

```typescript
// TCP サーバーの抽象化
interface ITcpServerFactory {
  createServer(connectionHandler: (socket: net.Socket) => void): ITcpServer;
}

interface ITcpServer {
  listen(port: number, host: string): void;
  close(): void;
}

// TCP クライアントの抽象化
interface ITcpClientFactory {
  connect(options: { host: string; port: number }): net.Socket;
}
```

- `TunnelListener` のコンストラクタに `ITcpServerFactory` を追加
- `TunnelForwarder` のコンストラクタに `ITcpClientFactory` を追加
- デフォルト実装は `node:net` を使用し、テスト時はモック実装を注入

### 方針B: テストをモックTCPで書き直す

ファクトリ注入後、テストではモックTCPファクトリを使用:

- `MockTcpServer` — `connectionHandler` を保持し、`simulateConnection(socket)` で接続をシミュレート
- `MockSocket` — `EventEmitter` ベースで `write`, `destroy`, `pause`, `resume` をシミュレート
- 実ネットワークI/Oを一切使わない

### 変更の影響範囲

- `src/app/tunnel.mts` — クラスのコンストラクタ変更、ファクトリ経由のTCP生成
- `src/app/tunnel.spec.mts` — モック TCP を使用するテストに書き直し
- `src/app/app.mts` — `TunnelListener` / `TunnelForwarder` 生成時にファクトリを渡す
- `src/index.mts` — デフォルトファクトリの生成（必要に応じて）

## 実施結果 (2026-03-16)

- [x] `ITcpServerFactory` / `ITcpClientFactory` を `src/app/tunnel.mts` に追加し、`TunnelListener` / `TunnelForwarder` の TCP 生成を DI 化
- [x] デフォルト実装として `node:net` ベースのファクトリを追加し、既存呼び出し側の互換を維持
- [x] `src/app/tunnel.spec.mts` を実 TCP I/O なしのテストに置換
- [x] Unit テストで `TunnelListener` の CONNECT 送信、および listener/forwarder 間のデータ往復をモックソケットで検証
