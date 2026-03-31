# TunnelApp 状態遷移のエラーリカバリ不足

## 重要度

medium

## 問題点

`TunnelApp` の状態遷移メソッド（`listen()`, `forward()`, `connectOffer()`, `setRemoteOffer()` 等）で、
非同期処理が途中で失敗した場合に状態が中間状態のまま停止し、回復手段が `close()` 以外にない。

### 例 1: `listen()` で `createOffer()` が失敗する場合

```typescript
async listen(port: number): Promise<void> {
  this.ensureState('idle', '...');
  this.tunnel = new TunnelListener(port, this.transport);
  this.setState('offering');       // ← ここで状態変更
  const offer = await this.transport.createOffer();  // ← ここで例外発生
  // 以降は実行されず、状態は 'offering' のまま
}
```

`createOffer()` が失敗すると状態は `'offering'` に留まり、再度 `listen()` も `forward()` も呼べない。
呼び出し側が `close()` → 新規 `TunnelApp` を生成する以外にリカバリ方法がない。

### 例 2: P2P 接続タイムアウト

`setState('connecting')` 後に P2P 接続が確立しない場合（ネットワーク問題など）、
`'connecting'` 状態のまま無期限に待機する。タイムアウト機構がないため、呼び出し側が検知できない。

## 違反しているルール

- **堅牢な状態管理**: 異常系で状態が不整合になり、自己回復できない
- **Fail-fast 原則**: 失敗を適切に伝搬してリソースを解放すべき

## 解決策

### A. 失敗時に状態をロールバック（推奨）

各状態遷移メソッドに try-catch を追加し、失敗時に前の状態へ戻す。

```typescript
async listen(port: number): Promise<void> {
  this.ensureState('idle', '...');
  this.tunnel = new TunnelListener(port, this.transport);
  this.setState('offering');
  try {
    const offer = await this.transport.createOffer();
    this.emit('offer-ready', encodeSignaling(offer));
    this.setState('waiting-answer');
  } catch (error) {
    this.tunnel = null;
    this.setState('idle');
    throw error;
  }
}
```

**影響範囲**: `tunnel-app.mts` のみ。既存テストに状態ロールバックのテストケースを追加する必要がある。

### B. 接続タイムアウトの追加

`setState('connecting')` 時にタイマーを設定し、一定時間内に `'connected'` へ遷移しなければ
`close()` を呼んでエラーイベントを発火する。

**影響範囲**: `tunnel-app.mts`。タイムアウト値の設定パラメータ追加が必要。

### C. 'error' 状態の導入

`AppState` に `'error'` を追加し、異常終了した状態を明示する。
`close()` → `'idle'` へのリセットパスを用意する。

**影響範囲**: `tunnel-app.mts`, `daemon-controller.mts`（状態値の変更）、テストファイル。
