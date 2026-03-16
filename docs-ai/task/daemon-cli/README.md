# daemon-cli 動作確認で発見された問題

## 確認日

2026-03-16

## 設計ドキュメント

- [01-fix-onclosed.md](01-fix-onclosed.md) — 問題 2 の修正方針（`onClosed` → `onStateChange` への置き換え）
- [02-test-api-compat.md](02-test-api-compat.md) — API 互換性を検出する large テストの設計

## 問題一覧

### 問題 1: `daemon-start.sh` が `npx ts-node` で `.mts` ESM を解決できない

**状態**: 修正済み

**症状**: `scripts/daemon-start.sh` を実行すると daemon の起動に失敗する。

```
Error: Cannot find module '.../src/app/transport/datachannel.mjs'
  imported from .../src/daemon.mts
  code: 'ERR_MODULE_NOT_FOUND'
```

**原因**: `daemon-start.sh` が `npx ts-node src/daemon.mts` を使用していたが、ts-node v10 は `.mts` ファイル内の `.mjs` 拡張子による相対インポートを正しく解決できない。Jest では `moduleNameMapper` で `.mjs` → `.mts` のマッピングを行っているが、ts-node にはこの仕組みがない。

**修正**: `npx ts-node --esm --project tsconfig.server.json src/daemon.mts` に変更した。`--esm` で ESM ローダーを有効にし、`--project` で `tsconfig.server.json` を明示的に読み込む。

---

### 問題 2: `node-datachannel` v0.32.1 に `PeerConnection.onClosed` が存在しない

**状態**: 未修正

**症状**: `listen` コマンドを実行すると以下のエラーが返る。

```json
{"ok":false,"error":"this.peer.onClosed is not a function"}
```

**原因**: `src/app/transport/datachannel.mts` の `createPeer()` メソッドで `this.peer.onClosed(...)` を呼び出しているが、`node-datachannel` v0.32.1 の `PeerConnection` にはこのメソッドが存在しない。

利用可能な on* メソッド:
- `onTrack`
- `onLocalDescription`
- `onLocalCandidate`
- `onStateChange`
- `onIceStateChange`
- `onSignalingStateChange`
- `onGatheringStateChange`
- `onDataChannel`

**該当コード**: `src/app/transport/datachannel.mts` の `createPeer()` 内

```typescript
this.peer.onClosed(() => {
  this.events?.onClosed();
});
```

**影響**: `listen` / `forward` など、P2P 接続を確立するコマンドがすべて失敗する。daemon の起動自体や `close` / `status` コマンドは正常に動作する。

**修正案**: `onClosed` の呼び出しを削除するか、`onStateChange` コールバック内で `closed` 状態を検出して `onClosed` イベントを発火する。

---

## 正常動作が確認された機能

- TypeScript コンパイル (`tsc -p tsconfig.server.json --noEmit`): OK
- テスト (`npm test`): 4 suites, 16 tests, 全て PASS
- `scripts/daemon-start.sh` (修正後): OK
- `scripts/daemon-status.sh`: OK
- `scripts/daemon-post.sh close`: OK
- `scripts/daemon-stop.sh`: OK
- `--id` オプションによる複数 daemon 起動: OK
- 同一 ID の多重起動防止: OK
