# Daemon CLI

Agent 向け daemon + POST 形式 CLI の設計ドキュメント。

既存の対話型 CLI (`src/app/cli.mts`) は `readline` による対話が必要で Agent には扱いづらい。
daemon をバックグラウンドで起動し、bash スクリプトからコマンドを POST する方式にする。

## 進捗

- [x] `src/app/daemon-server.mts` — HTTP サーバ + コマンドハンドラ実装
- [x] `src/daemon.mts` — daemon エントリーポイント実装
- [x] `scripts/daemon-start.sh` — daemon 起動スクリプト
- [x] `scripts/daemon-stop.sh` — daemon 停止スクリプト
- [x] `scripts/daemon-status.sh` — ステータス確認スクリプト
- [x] `scripts/daemon-post.sh` — コマンド送信スクリプト
- [x] `.gitignore` に `.var/` を追加
- [x] `src/app/daemon-server.spec.mts` — テスト追加 (9テスト全パス)
- [x] express をdependenciesにインストール
- [x] `src/app/transport/datachannel.spec.mts` — API 互換性 large テスト追加 (4テスト全パス: `createOffer` テストを try/catch パターンに修正済み)

## Index

- [01-overview.md](01-overview.md) — 全体構成・IPC プロトコル
- [02-daemon-server.md](02-daemon-server.md) — Node.js daemon サーバの設計
- [03-scripts.md](03-scripts.md) — bash スクリプトの設計
