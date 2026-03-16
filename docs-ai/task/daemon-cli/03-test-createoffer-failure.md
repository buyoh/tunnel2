# 調査: large テスト "createOffer が API エラーなく PeerConnection を生成できる" の失敗

## 発生日

2026-03-16

## 状態

未解決

## 失敗したテスト

`src/app/transport/datachannel.spec.mts`  
`DataChannelTransport (large) › createOffer が API エラーなく PeerConnection を生成できる`

## エラー内容

```
expect(received).rejects.toThrow()

Received promise resolved instead of rejected
Resolved to value: {"candidates": [...], "sdp": "", "type": "offer"}
```

## 原因

テスト設計では `createOffer()` が 5 秒以内に ICE ギャザリングを完了できず、タイムアウトエラーで `reject` されることを期待していた。  
しかし実環境では `stun:stun.l.google.com:19302` への STUN 問い合わせが即座に完了し、`createOffer()` が数十ミリ秒で `resolve` してしまった。

テスト目的（`onClosed is not a function` 等の API エラーを検出する）は達成されているが、テスト設計上の仮定（タイムアウトになる）が崩れたため `rejects.toThrow('timeout (expected)')` のアサーションが失敗する。

## 解決策の候補

1. **`acceptOffer` テストと同じパターンに変更する**  
   `try/catch` でキャッチし、エラーが `is not a function` でないことを確認する。  
   `createOffer()` が resolve した場合も（API エラーがないことを示すので）パスとして扱う。

   ```typescript
   try {
     await Promise.race([
       transport.createOffer(),
       new Promise((_, reject) =>
         setTimeout(() => reject(new Error('timeout (expected)')), 5000)
       ),
     ]);
   } catch (e) {
     expect((e as Error).message).not.toMatch(/is not a function/);
   }
   transport.close();
   ```

2. **STUN サーバーなし・オフライン設定にする**  
   `iceServers: []` を渡して ICE ギャザリングが完了しないようにする。  
   ただし空配列指定時の挙動は実装依存。

## 備考

`acceptOffer` テストは同様の `try/catch` パターンを使っており、こちらは pass している。  
`createOffer` テストのみ `rejects.toThrow` を使った設計になっていたため、修正が必要。
