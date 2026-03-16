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
| 1. リモートアクセス・ファイル作成禁止 | **OK** | `tunnel.spec.mts` / `daemon-server.spec.mts` をモックベースへ更新 |
| 2. Mock ライブラリ差し替え禁止・DI 使用 | **OK** | TCP 層をファクトリ DI 化、サーバー層は Controller 分離 |
| 3. 単一責任原則 | **OK** | `DaemonController` 抽出で HTTP と業務ロジックを分離 |

## 対象ファイル・ドキュメント構成

| ドキュメント | 対象 | 内容 |
|---|---|---|
| [01-tunnel.md](./01-tunnel.md) | `src/app/tunnel.mts`, `src/app/tunnel.spec.mts` | TCP層のDI導入・責務分割・テスト改善 |
| [02-daemon-server.md](./02-daemon-server.md) | `src/app/daemon-server.mts`, `src/app/daemon-server.spec.mts` | 責務分割・テスト改善 |
| [03-ok-modules.md](./03-ok-modules.md) | その他のモジュール | 要件を満たしているモジュールの記録 |

## 実施ステータス (2026-03-16)

- [x] tunnel 層に TCP ファクトリ DI を導入
- [x] tunnel テストから実 TCP I/O を排除
- [x] daemon-server 層に `DaemonController` を導入して責務分離
- [x] daemon-server テストから実ファイル/実ソケット I/O を排除
- [x] Unit テスト実行: 4 suites / 17 tests 全件成功
