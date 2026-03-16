# コード品質レビュー・リファクタリング計画

## 概要

以下のレビュー要件に基づき、既存コードベースを検査し改善方針を策定する。

### レビュー要件

1. **テストでのモック使用必須** — 実際にリモートにアクセスしたり、ファイルを作成するテストの作成は禁止
2. **Mock ライブラリによるメソッド差し替え禁止** — 依存性注入やテンプレートを使用する
3. **単一責任原則の遵守** — モジュール・構造体を適切に分割する

## レビュー結果サマリ

| 要件 | 全体判定 | 摘要 |
|---|---|---|
| 1. リモートアクセス・ファイル作成禁止 | **NG** | `tunnel.spec.mts` で実TCP、`daemon-server.spec.mts` で実ファイル・ソケット作成 |
| 2. Mock ライブラリ差し替え禁止・DI 使用 | **一部NG** | P2P層は良好だがTCP層・HTTPサーバー層のDI欠如 |
| 3. 単一責任原則 | **一部要改善** | `tunnel.mts`, `daemon-server.mts` で責務混在 |

## 対象ファイル・ドキュメント構成

| ドキュメント | 対象 | 内容 |
|---|---|---|
| [01-tunnel.md](./01-tunnel.md) | `src/app/tunnel.mts`, `src/app/tunnel.spec.mts` | TCP層のDI導入・責務分割・テスト改善 |
| [02-daemon-server.md](./02-daemon-server.md) | `src/app/daemon-server.mts`, `src/app/daemon-server.spec.mts` | 責務分割・テスト改善 |
| [03-ok-modules.md](./03-ok-modules.md) | その他のモジュール | 要件を満たしているモジュールの記録 |
