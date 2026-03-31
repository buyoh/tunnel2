# コードレビュー 2: 設計原則の指摘

ソースコード・テストコード・設定ファイルを対象としたコードレビュー。
既存タスク `code-review-fixes/` で指摘済みの項目（ドキュメントコメント不足・ESLint 設定・未使用依存）は除外し、
新たに検出された設計上の問題を記録する。

## 検出された問題

| # | 重要度 | 概要 | 対象 |
|---|--------|------|------|
| 1 | high | ESLint が完全に動作不能（eslint-plugin-react 未インストール） | `eslint.config.mjs` |
| 2 | medium | TunnelListener / TunnelForwarder のコード重複 | `tunnel-listener.mts`, `tunnel-forwarder.mts` |
| 3 | medium | TunnelApp 状態遷移のエラーリカバリ不足 | `tunnel-app.mts` |
| 4 | medium | ITcpServer に listen エラーハンドリングが無い | `tcp-socket.mts`, `tunnel-listener.mts` |
| 5 | low | connId の UInt32 オーバーフロー未対策 | `tunnel-listener.mts` |

## ドキュメント

- [01-eslint-broken.md](01-eslint-broken.md) — ESLint 動作不能
- [02-tunnel-duplication.md](02-tunnel-duplication.md) — Listener/Forwarder 重複コード
- [03-state-recovery.md](03-state-recovery.md) — TunnelApp 状態遷移エラーリカバリ
- [04-tcp-server-error.md](04-tcp-server-error.md) — ITcpServer listen エラー
- [05-connid-overflow.md](05-connid-overflow.md) — connId オーバーフロー
