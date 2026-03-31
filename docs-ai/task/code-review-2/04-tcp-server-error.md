# ITcpServer に listen エラーハンドリングが無い

## 重要度

medium

## 問題点

`ITcpServer` インターフェースは `listen(port, host)` と `close()` のみを定義しており、
listen 時のエラー（`EADDRINUSE`, `EACCES` など）を通知する手段がない。

```typescript
// tcp-socket.mts
export interface ITcpServer {
  listen(port: number, host: string): void;
  close(): void;
  // エラーハンドリングが無い
}
```

`NodeTcpServerFactory.createServer()` が返す `net.Server` は `'error'` イベントを発火するが、
`ITcpServer` として扱う `TunnelListener` からはそのイベントを購読できない。

### 影響

- ポートが既に使用中の場合、`net.Server` は `'error'` イベントを発火するが、リスナーが無いため
  Node.js の未処理イベントとなり、`ERR_UNHANDLED_ERROR` でプロセスがクラッシュする可能性がある。
- `TunnelApp` は listen 成功を前提に状態遷移するが、実際にはポートが開けず接続を受け付けられない状態になりうる。

## 違反しているルール

- **エラーハンドリング**: システム境界（ネットワーク）でのエラーを無視している
- **インターフェース設計**: 実装が持つ重要なエラーパスをインターフェースが隠蔽している

## 解決策

### A. ITcpServer にエラーコールバックを追加（推奨）

```typescript
export interface ITcpServer {
  listen(port: number, host: string): void;
  close(): void;
  on(event: 'error', listener: (error: Error) => void): this;
}
```

`TunnelListener.start()` で `server.on('error', ...)` を呼び出し、エラーを上位に伝搬する。
テスト用のモックサーバも `on('error', ...)` をサポートする。

**影響範囲**: `tcp-socket.mts`（インターフェース変更）、`tunnel-listener.mts`（エラーハンドリング追加）、
`tunnel-listener.spec.mts`（テスト更新）、`tunnel-app.mts`（エラーイベント伝搬）。

### B. listen を Promise 化する

```typescript
export interface ITcpServer {
  listen(port: number, host: string): Promise<void>;
  close(): void;
}
```

`listen()` が成功したら resolve、失敗したら reject する。
`TunnelListener.start()` を async にし、try-catch でハンドリングする。

**影響範囲**: 上記 A と同等 + `TunnelListener.start()` のシグネチャ変更。
`TunnelApp.listen()` も start の結果をハンドリングする必要がある。
