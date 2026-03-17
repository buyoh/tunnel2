# ファイル名をクラス名に合わせるリファクタリング

エントリーポイントを除く TypeScript ファイルについて、ファイル名を主要クラス名の kebab-case に統一する。
複数クラスを含むファイルは単一責任原則に従い分割する。

## ドキュメント

1. [01-rename-plan.md](01-rename-plan.md) — 既存ファイルのリネーム・分割計画
2. [02-signaling-server-updates.md](02-signaling-server-updates.md) — signaling-server タスクドキュメントへの影響

## ステータス

- [x] 既存コードのリネーム・分割
- [x] import パスの更新
- [x] spec ファイルのリネーム
- [x] signaling-server ドキュメントの更新

## 進捗ログ

- 2026-03-17: `src/app/` 以下の主要モジュールをクラス名ベースへリネームし、`tunnel.mts` を `tcp-socket.mts` / `tunnel-listener.mts` / `tunnel-forwarder.mts` に分割。
- 2026-03-17: `daemon-server.mts` から `daemon-controller.mts` を分離し、エントリーポイントと import パスを更新。
- 2026-03-17: `*.spec.mts` のリネーム・分割を反映し、`npm test` で全 7 suite 通過を確認。
