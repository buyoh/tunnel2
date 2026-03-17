# ファイル名をクラス名に合わせるリファクタリング

エントリーポイントを除く TypeScript ファイルについて、ファイル名を主要クラス名の kebab-case に統一する。
複数クラスを含むファイルは単一責任原則に従い分割する。

## ドキュメント

1. [01-rename-plan.md](01-rename-plan.md) — 既存ファイルのリネーム・分割計画
2. [02-signaling-server-updates.md](02-signaling-server-updates.md) — signaling-server タスクドキュメントへの影響

## ステータス

- [ ] 既存コードのリネーム・分割
- [ ] import パスの更新
- [ ] spec ファイルのリネーム
- [ ] signaling-server ドキュメントの更新
