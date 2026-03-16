# Daemon CLI

Agent 向け daemon + POST 形式 CLI の設計ドキュメント。

既存の対話型 CLI (`src/app/cli.mts`) は `readline` による対話が必要で Agent には扱いづらい。
daemon をバックグラウンドで起動し、bash スクリプトからコマンドを POST する方式にする。

## Index

- [01-overview.md](01-overview.md) — 全体構成・IPC プロトコル
- [02-daemon-server.md](02-daemon-server.md) — Node.js daemon サーバの設計
- [03-scripts.md](03-scripts.md) — bash スクリプトの設計
