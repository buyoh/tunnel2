# テスト: DataChannelTransport API 互換性テスト

## 目的

`DataChannelTransport` が実際の `node-datachannel` ライブラリと正しく連携できることを検証する。
現在の unit テストは `MockTransport` を使用するため、実ライブラリとの API 不整合（`onClosed` 問題など）を検出できない。

## テスト種別

**large テスト** — 実際の `node-datachannel` パッケージに依存するため。

## テストファイル

`src/app/transport/datachannel.spec.mts`

## テストケース

### 1. PeerConnection 生成時に API エラーが発生しないこと

`createOffer()` を呼び出し、内部の `createPeer()` でランタイムエラーが発生しないことを検証する。

```typescript
it('createOffer が API エラーなく PeerConnection を生成できる', async () => {
  const transport = new DataChannelTransport();
  transport.setEvents({
    onOpen: () => {},
    onMessage: () => {},
    onClosed: () => {},
    onStateChange: () => {},
    onBufferedAmountLow: () => {},
  });

  // createOffer は createPeer を同期的に呼ぶ
  // ICE gathering のタイムアウト(30秒)は待たず、5秒以内に
  // API エラーでリジェクトされないことを確認
  await expect(
    Promise.race([
      transport.createOffer(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout (expected)')), 5000)
      ),
    ])
  ).rejects.toThrow('timeout (expected)');

  transport.close();
});
```

**検出できる問題**: `onClosed is not a function` のような、存在しないメソッド呼び出し

### 2. acceptOffer でも同様に API エラーが発生しないこと

```typescript
it('acceptOffer が API エラーなく PeerConnection を生成できる', async () => {
  const transport = new DataChannelTransport();
  transport.setEvents({
    onOpen: () => {},
    onMessage: () => {},
    onClosed: () => {},
    onStateChange: () => {},
    onBufferedAmountLow: () => {},
  });

  const dummyOffer = { sdp: 'v=0\r\n', type: 'offer' as const, candidates: [] };

  // acceptOffer も createPeer を呼ぶ
  // SDP が不正でも createPeer 段階の API エラーは即座に発生する
  try {
    await Promise.race([
      transport.acceptOffer(dummyOffer),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout (expected)')), 5000)
      ),
    ]);
  } catch (e) {
    // タイムアウトまたは SDP パースエラーは許容
    // "is not a function" 系のエラーは不可
    expect((e as Error).message).not.toMatch(/is not a function/);
  }

  transport.close();
});
```

### 3. close が安全に呼べること

```typescript
it('close が未接続状態でもエラーなく呼べる', () => {
  const transport = new DataChannelTransport();
  expect(() => transport.close()).not.toThrow();
});
```

### 4. sendMessage が未接続時に false を返すこと

```typescript
it('sendMessage が dc=null のとき false を返す', () => {
  const transport = new DataChannelTransport();
  expect(transport.sendMessage(Buffer.from('test'))).toBe(false);
});
```

## 実行方法

```bash
# large テストとして個別実行（ICE タイムアウト待ちがあるため時間がかかる）
NODE_OPTIONS=--experimental-vm-modules npx jest src/app/transport/datachannel.spec.mts --runInBand
```

## 既存テストとの関係

| テストファイル | 種別 | transport | 目的 |
|---|---|---|---|
| `tunnel.spec.mts` | unit | MockTransport | トンネル多重化ロジック |
| `daemon-server.spec.mts` | unit | MockTransport | daemon HTTP API |
| `protocol.spec.mts` | unit | - | プロトコルエンコード/デコード |
| `signaling.spec.mts` | unit | - | シグナリングデータ符号化 |
| **`datachannel.spec.mts`** | **large** | **DataChannelTransport** | **実ライブラリ API 互換性** |
