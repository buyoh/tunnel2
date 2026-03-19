# シグナリングサーバ

WebSocket ベースのシグナリングサーバを新規作成し、既存のコピペ方式に加えて自動的に SDP/ICE Candidate を交換できるようにする。

## 進捗

- [x] `packages/signaling-types/` を追加し、Socket.IO メッセージ型を定義
- [x] `packages/signaling-server/` を追加し、公開鍵認証・レートリミット・ルームマッチング・Signal relay を実装
- [x] `src/app/ws-signaling.mts` を追加し、WebSocket シグナリングと P2P 切断時の再接続を実装
- [x] `src/app/ws-cli.mts` と `src/index.mts` を更新し、`ws-listen` / `ws-forward` を追加
- [x] `jest.config.mjs` と `tsconfig.json` を更新し、workspace 配下の `.mts` テストを実行可能にした
- [x] Unit テストと Socket.IO 結合テストを追加し、`npm test` で 52 テスト全件成功を確認

## サブプロジェクト構成

| パッケージ | パス | 概要 |
|---|---|---|
| `@tunnel2/signaling-types` | `packages/signaling-types/` | WebSocket メッセージの型定義のみ |
| `@tunnel2/signaling-server` | `packages/signaling-server/` | Express + Socket.IO サーバ実装 |

## ドキュメント

1. [01-overview.md](01-overview.md) — 全体アーキテクチャ・プロジェクト構成・レイヤー設計
2. [02-types.md](02-types.md) — signaling-types パッケージ設計
3. [03-server.md](03-server.md) — signaling-server 実装設計 (ドメインロジック層・フレームワーク層)
4. [04-client.md](04-client.md) — クライアント側の WebSocket シグナリング統合・再接続
