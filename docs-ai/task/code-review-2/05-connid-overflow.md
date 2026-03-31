# connId の UInt32 オーバーフロー未対策

## 重要度

low

## 問題点

`TunnelListener` の `nextConnId` は `1` から始まりインクリメントのみで増加するが、
`encodeMessage()` は `writeUInt32BE()` で connId を書き込むため、値の範囲は `0` 〜 `4,294,967,295` に制限される。

```typescript
// tunnel-listener.mts
private nextConnId = 1;

// 接続ごとにインクリメント
const connId = this.nextConnId;
this.nextConnId += 1;
```

```typescript
// protocol-message.mts
header.writeUInt32BE(msg.connId, 0);  // UInt32 の範囲外で RangeError
```

`nextConnId` が `0xFFFFFFFF` (4,294,967,295) を超えると `writeUInt32BE` が `RangeError` をスローする。

### 実用上のリスク

1 セッションで約 43 億接続を超える使い方は通常想定しにくいが、長期稼働デーモンで大量の短寿命接続を受け付ける場合や、
将来的に connId の範囲が変更された場合のリスクがある。

## 違反しているルール

- **防御的プログラミング**: 整数オーバーフローに対する保護が無い

## 解決策

### A. ラップアラウンドの追加（推奨）

使用済み connId との衝突を避けつつ、範囲内で再利用する:

```typescript
private nextConnId = 1;

private allocateConnId(): number {
  const start = this.nextConnId;
  while (this.connections.has(this.nextConnId)) {
    this.nextConnId = (this.nextConnId % 0xFFFFFFFF) + 1;
    if (this.nextConnId === start) {
      throw new Error('no available connId');
    }
  }
  const id = this.nextConnId;
  this.nextConnId = (this.nextConnId % 0xFFFFFFFF) + 1;
  return id;
}
```

**影響範囲**: `tunnel-listener.mts` のみ。テストに connId ラップアラウンドのケースを追加。

### B. 現状維持

実用上のリスクが極めて低いため、コメントで制約を明記するのみにとどめる。

**影響範囲**: なし（コメント追加のみ）。
