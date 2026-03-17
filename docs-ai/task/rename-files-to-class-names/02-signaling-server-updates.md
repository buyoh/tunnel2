# 02. signaling-server ドキュメントへの影響

## 概要

`docs-ai/task/signaling-server/` のドキュメントには、既存コードおよび新規ファイルのパスが記載されている。
ファイルリネーム規約を新規コードにも適用し、ドキュメントを更新する。

## 既存コードへの参照パス更新

signaling-server ドキュメント内で参照されている既存ファイルパスの更新:

| ドキュメント | 現在の記載 | 更新後 |
|---|---|---|
| 01-overview.md | `src/app/cli.mts` | 変更なし |
| 01-overview.md | `src/app/app.mts` の `TunnelApp` | `src/app/tunnel-app.mts` |
| 04-client.md | `src/app/cli.mts` | 変更なし |
| 04-client.md | `src/app/app.mts` (`TunnelApp`) | `src/app/tunnel-app.mts` |

## 新規ファイルの命名規約適用

signaling-server で計画している新規ファイルについても、クラス名ベースの命名規約を適用する。

### packages/signaling-server/src/app/

| 現在の計画 | 主要クラス | 更新後 |
|---|---|---|
| `server.mts` | `createSignalingServer` (関数) | 変更なし (関数モジュール) |
| `handler.mts` | `ConnectionHandler` | `connection-handler.mts` |
| `auth.mts` | `KeyStore` | `key-store.mts` |
| `rate-limit.mts` | `AuthRateLimiter` | `auth-rate-limiter.mts` |
| `matching.mts` | `MatchingService` | `matching-service.mts` |

### src/app/ (クライアント側)

| 現在の計画 | 主要クラス | 更新後 |
|---|---|---|
| `ws-signaling.mts` | `WsSignaling` | 変更なし (既に一致) |
| `ws-cli.mts` | `runWsCli` (関数) | 変更なし (関数モジュール) |

## 更新が必要なドキュメント

### 01-overview.md

- ディレクトリ構成図内のファイル名を更新:
  - `handler.mts` → `connection-handler.mts`
  - `auth.mts` → `key-store.mts`
  - `rate-limit.mts` → `auth-rate-limiter.mts`
  - `matching.mts` → `matching-service.mts`
- モジュール責務表のファイル名を更新
- レイヤー構成の参照ファイル名を更新
- 既存コード参照の `app.mts` → `tunnel-app.mts`
- テスト方針表のファイル名を更新

### 03-server.md

- モジュール構成表のファイル名を更新:
  - `src/app/handler.mts` → `src/app/connection-handler.mts`
  - `src/app/auth.mts` → `src/app/key-store.mts`
  - `src/app/rate-limit.mts` → `src/app/auth-rate-limiter.mts`
  - `src/app/matching.mts` → `src/app/matching-service.mts`
- 各セクション見出しのファイル名を更新
- コード例中の import パス・コメントのファイル名を更新
- テスト方針表のファイル名を更新

### 04-client.md

- `app.mts` (`TunnelApp`) → `tunnel-app.mts`

### 02-types.md

- 変更なし (型パッケージのみで既存コード参照なし)

## 更新後のディレクトリ構成図 (01-overview.md 用)

```
tunnel2/
├── packages/
│   ├── signaling-types/
│   │   └── src/
│   │       └── index.mts
│   └── signaling-server/
│       ├── keys.json
│       └── src/
│           ├── index.mts                  # エントリーポイント
│           └── app/
│               ├── server.mts             # フレームワーク層 (関数モジュール)
│               ├── connection-handler.mts  # ConnectionHandler (ドメイン層)
│               ├── key-store.mts          # KeyStore + 認証ロジック (ドメイン層)
│               ├── auth-rate-limiter.mts   # AuthRateLimiter (ドメイン層)
│               └── matching-service.mts    # MatchingService (ドメイン層)
└── src/
    └── app/
        ├── cli.mts
        ├── ws-signaling.mts               # WsSignaling
        └── ws-cli.mts                     # WebSocket CLI
```
