# Echo / Ping 機能

ポートフォワーディングなしで P2P 通信の疎通確認を行える簡易メッセージ交換機能。

## 背景

`scripts/daemon-smoke-test.sh` でシグナリング交換後の P2P 通信まで確認したい。
しかしポートフォワーディング (TCP トンネル) の確認は現段階では不要であり、
テスト用にローカルポートを確保するコストも避けたい。
代わりに軽量な ping/pong メッセージを送り合い、P2P チャネルの疎通を検証する。

## Index

- [01-overview.md](01-overview.md) — 機能概要・プロトコル変更
- [02-app-changes.md](02-app-changes.md) — TunnelApp / DaemonController の変更
- [03-smoke-test.md](03-smoke-test.md) — スモークテストスクリプトの変更

## Progress

- [x] ドキュメントから修正内容を確認
- [x] テスト追加
- [x] 実装
- [x] テスト実行
- [x] 進捗記載

## Notes

- 2026-03-18: 追加した Unit テスト
	- src/app/tunnel-app.spec.mts
	- src/app/daemon-controller.spec.mts の新ケース追加
	- src/app/protocol-message.spec.mts の新ケース追加
- 2026-03-18: 実行結果
	- npm test -- src/app/protocol-message.spec.mts src/app/tunnel-app.spec.mts src/app/daemon-controller.spec.mts
	- Test Suites: 3 passed, 3 total
	- Tests: 23 passed, 23 total
