# シグナリングサーバ

WebSocket ベースのシグナリングサーバを新規作成し、既存のコピペ方式に加えて自動的に SDP/ICE Candidate を交換できるようにする。

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
