# datachannel.mts の any 型を具体型に置換

## 概要

`src/app/transport/datachannel.mts` および `datachannel.spec.mts` で使われている `any` 型を、
`node-datachannel` のエクスポート型およびローカル定義のサブセット型で置き換える。

## 現状の any 使用箇所

### datachannel.mts

| 行付近 | コード | 用途 |
|--------|--------|------|
| 8 | `=> any` | `nodeDataChannelModule` DI config の PeerConnection コンストラクタ戻り値 |
| 22-23 | `=> any` | 同上 (private readonly フィールド) |
| 26 | `peer: any` | PeerConnection インスタンス保持 |
| 27 | `dc: any` | DataChannel インスタンス保持 |
| 34 | `nodeDataChannel as any` | default export をモジュール型にキャスト |
| 57 | `(dc: any)` | `onDataChannel` コールバック引数 |
| 117 | `state as any` | `onStateChange` の state を `P2PChannelState` へキャスト |
| 113 | `ndc as any` | `createPeer` 内のモジュール参照 |
| 131 | `(message: any)` | `onMessage` コールバック引数 |

### datachannel.spec.mts

`FakePeerConnection`, `FakeDataChannel`, `FakeDataChannelWithoutOnClosed` 内に計 8 箇所。

## 設計方針

### ローカルサブセットインターフェースを定義する

`node-datachannel` の `PeerConnection` / `DataChannel` インターフェースは多数のメソッドを持つが、
`DataChannelTransport` が実際に使用するメソッドは一部のみ。
フルインターフェースを DI 境界の型に使うと、テスト用 Fake クラスが不要なメソッドを全て実装する必要が生じる。

そのため、`datachannel.mts` 内にサブセットインターフェースを定義し、
DI 境界・内部フィールド両方でこれらを使う。

```typescript
/** DataChannelTransport が使用する PeerConnection のサブセット */
interface PeerConnectionLike {
  close(): void;
  setRemoteDescription(sdp: string, type: string): void;
  addRemoteCandidate(candidate: string, mid: string): void;
  createDataChannel(label: string): DataChannelLike;
  onStateChange(cb: (state: string) => void): void;
  onDataChannel(cb: (dc: DataChannelLike) => void): void;
  onLocalDescription(cb: (sdp: string, type: string) => void): void;
  onLocalCandidate(cb: (candidate: string, mid: string) => void): void;
  onGatheringStateChange(cb: (state: string) => void): void;
}

/** DataChannelTransport が使用する DataChannel のサブセット */
interface DataChannelLike {
  close(): void;
  sendMessageBinary(buffer: Buffer): boolean;
  isOpen(): boolean;
  bufferedAmount(): number;
  setBufferedAmountLowThreshold(newSize: number): void;
  onOpen(cb: () => void): void;
  onClosed?(cb: () => void): void;            // optional — 古い node-datachannel 版になかった
  onMessage(cb: (msg: string | Buffer | ArrayBuffer) => void): void;
  onBufferedAmountLow?(cb: () => void): void; // optional — 同上
}
```

### 変更点の一覧

#### 1. `datachannel.mts`

| 変更 | 詳細 |
|------|------|
| サブセット型定義追加 | `PeerConnectionLike`, `DataChannelLike` を file-local で定義 |
| `DataChannelTransportConfig.nodeDataChannelModule` | `PeerConnection` コンストラクタの戻り値を `PeerConnectionLike` に変更 |
| private readonly `nodeDataChannelModule` | 同上 |
| `peer` フィールド | `any` → `PeerConnectionLike \| null` |
| `dc` フィールド | `any` → `DataChannelLike \| null` |
| コンストラクタのキャスト | `nodeDataChannel as any` → `nodeDataChannel as unknown as { PeerConnection: ... }` |
| `createPeer` 内キャスト | `as any` 削除。`nodeDataChannelModule` は既にサブセット型 |
| `onDataChannel` コールバック | `(dc: any)` → `(dc: DataChannelLike)` |
| `onMessage` コールバック | `(message: any)` → `(msg: string \| Buffer \| ArrayBuffer)` |
| `onStateChange` キャスト | `state as any` → 不要になるか `state as P2PChannelState` に修正 |
| `bindDataChannel` 引数 | `(dc: any)` → `(dc: DataChannelLike)` |
| `onClosed` / `onBufferedAmountLow` 存在チェック | `DataChannelLike` 側が optional メソッドなので `typeof dc.onClosed === 'function'` → `if (dc.onClosed)` で OK |

#### 2. `datachannel.spec.mts`

| 変更 | 詳細 |
|------|------|
| `FakePeerConnection` コールバック | `(dc: any)` → `(dc: DataChannelLike)` |
| `FakeDataChannel` コールバック | `(message: any)` → `(msg: string \| Buffer \| ArrayBuffer)` |
| `FakeDataChannelWithoutOnClosed` 同上 | 同上 |
| `emitDataChannel(dc: any)` | `dc: DataChannelLike` |
| `emitMessage(message: any)` | `msg: string \| Buffer \| ArrayBuffer` |

### node-datachannel の型との互換性

`node-datachannel` v0.32 がエクスポートする `PeerConnection` / `DataChannel` インターフェースは、
定義するサブセットインターフェースのスーパーセットであるため、構造的型付けにより互換性がある。

コンストラクタの config 引数は `RtcConfig` 型 (`iceServers: (string | IceServer)[]`) だが、
`DataChannelTransport` は `string[]` のみ渡すため `string[]` は `(string | IceServer)[]` の部分型として互換。

## リスク・注意点

- `DataChannelLike.onClosed` / `onBufferedAmountLow` を optional メソッドにすることで、
  既存の `typeof dc.onClosed === 'function'` チェックとの整合を取る。
  optional メソッドとして定義すれば `dc.onClosed && dc.onClosed(...)` で安全に呼べる。
- `sendMessageBinary` の引数型は `node-datachannel` では `Buffer | Uint8Array` だが、
  `DataChannelTransport` は `Buffer` のみ渡すため `Buffer` に限定して問題ない。
  ただし将来的に `Uint8Array` を受け付ける必要が出た場合はサブセット型を拡張する。
- `onStateChange` の `state` パラメータは `node-datachannel` 側で `string` のため、
  `P2PChannelState` へのキャストは明示的に行う（型安全ではないが node-datachannel 側が string を返す以上避けられない）。
