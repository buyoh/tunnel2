# 修正: `PeerConnection.onClosed` が存在しない問題

## 対象ファイル

- `src/app/transport/datachannel.mts`

## 問題の詳細

`createPeer()` メソッドで `this.peer.onClosed(...)` を呼び出しているが、`node-datachannel` v0.32.1 の `PeerConnection` には `onClosed` メソッドが存在しない。

```typescript
// 現在のコード (createPeer 内)
this.peer.onStateChange((state: string) => {
  this.events?.onStateChange(state as any);
});
this.peer.onClosed(() => {       // ← ここでエラー
  this.events?.onClosed();
});
```

## 修正方針

### 方針: `onStateChange` で `closed` 状態を検出する

`PeerConnection.onClosed` を削除し、既存の `onStateChange` コールバック内で `closed` / `failed` 状態を検出して `onClosed` イベントを発火する。

```typescript
// 修正後
this.peer.onStateChange((state: string) => {
  this.events?.onStateChange(state as any);
  if (state === 'closed' || state === 'failed') {
    this.events?.onClosed();
  }
});
// this.peer.onClosed(...) を削除
```

### 理由

- `onStateChange` は `node-datachannel` v0.32.1 で利用可能
- `PeerConnection` のライフサイクル上、`closed` 状態への遷移は `onStateChange` で通知される
- `failed` も接続不可として `onClosed` を発火するのが妥当

## 副次的修正: `bindDataChannel` の防御的チェック

`bindDataChannel()` 内の `dc.onClosed(...)` も、他のメソッド (`dc.onBufferedAmountLow`) と同様に `typeof` チェックを入れる。DataChannel の `onClosed` は v0.32.1 に存在する可能性が高いが、一貫性のため防御的にする。

```typescript
// 現在
dc.onClosed(() => {
  this.events?.onClosed();
});

// 修正後
if (typeof dc.onClosed === 'function') {
  dc.onClosed(() => {
    this.events?.onClosed();
  });
}
```

## 影響範囲

- `createOffer()` → `createPeer()` 呼び出し
- `acceptOffer()` → `createPeer()` 呼び出し
- 修正により `listen` / `forward` コマンドが正常動作するようになる

## 注意点

- `onClosed` が `onStateChange('closed')` と `dc.onClosed()` の両方から発火される可能性がある。`TunnelApp` の `onClosed` ハンドラは `state === 'closed'` ガードがあるため二重実行は防がれる。
