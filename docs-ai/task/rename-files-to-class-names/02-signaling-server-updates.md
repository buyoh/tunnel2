# 02. signaling-server ドキュメントへの影響

## 概要

`docs-ai/task/signaling-server/` のドキュメント内のファイルパス参照を PascalCase 命名規約に合わせて更新する。

## 既存コードへの参照パス更新

| ドキュメント | 現在の記載 | 更新後 |
|---|---|---|
| 01-overview.md, 04-client.md | `tunnel-app.mts` | `TunnelApp.mts` |

## 新規ファイルの命名規約適用

signaling-server で計画している新規ファイルについても PascalCase を適用する。

### packages/signaling-server/src/app/

| 現在の計画 | 主要クラス | 更新後 |
|---|---|---|
| `server.mts` | `createSignalingServer` (関数) | 変更なし (関数モジュール) |
| `connection-handler.mts` | `ConnectionHandler` | `ConnectionHandler.mts` |
| `key-store.mts` | `KeyStore` | `KeyStore.mts` |
| `auth-rate-limiter.mts` | `AuthRateLimiter` | `AuthRateLimiter.mts` |
| `matching-service.mts` | `MatchingService` | `MatchingService.mts` |

### src/app/ (クライアント側)

| 現在の計画 | 主要クラス | 更新後 |
|---|---|---|
| `ws-signaling.mts` | `WsSignaling` | `WsSignaling.mts` |
| `ws-cli.mts` | `runWsCli` (関数) | 変更なし (関数モジュール) |

## 更新対象ドキュメント

- `01-overview.md` — ディレクトリ構成図・モジュール責務表・テスト方針表のファイル名
- `03-server.md` — モジュール構成表・セクション見出し・コード例内コメントのファイル名
- `04-client.md` — 既存コード参照のファイル名
