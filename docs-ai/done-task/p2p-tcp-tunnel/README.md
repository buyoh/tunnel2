# P2P TCP トンネル — 設計ドキュメント

## 概要

P2P 通信を利用して NAT 越えの TCP トンネルを実現する CLI アプリケーション。

P2P トランスポート層はインターフェースで抽象化し、具体的な実装 (node-datachannel 等) に直接依存しない設計とする。
アプリケーションロジックは `TunnelApp` クラスに集約し、CLI / Web UI / GUI など複数のフロントエンドから操作可能なアーキテクチャを採用する。

シグナリングサーバーを使わず、SDP/ICE 情報をユーザーがコピー&ペーストで交換するインタラクティブ方式を採用する。

## ドキュメント構成

| ファイル | 内容 |
|---|---|
| [01-overview.md](./01-overview.md) | 全体アーキテクチャ・レイヤー構成 |
| [02-signaling.md](./02-signaling.md) | シグナリング (SDP/ICE 交換) の設計 |
| [03-transport.md](./03-transport.md) | P2P トランスポート抽象化層の設計 |
| [04-app.md](./04-app.md) | TunnelApp クラス (アプリケーションコア) の設計 |
| [05-tunnel.md](./05-tunnel.md) | TCP トンネル (TCP ↔ P2P ブリッジ) の設計 |
| [06-cli.md](./06-cli.md) | CLI インターフェースの設計 |
| [07-testing.md](./07-testing.md) | ユニットテスト設計 (MockTransport によるテスト戦略) |

## ステータス

- [x] 設計
- [x] 実装
- [x] テスト

## 進捗メモ (2026-03-16)

- `src/signaling.mts` を実装し、base64/JSON の検証付き encode/decode を追加
- `src/protocol.mts` を実装し、多重化メッセージの encode/decode を追加
- `src/transport/interface.mts` / `src/transport/mock.mts` / `src/transport/datachannel.mts` を追加
- `src/tunnel.mts` に `TunnelListener` / `TunnelForwarder` を実装
- `src/app.mts` / `src/cli.mts` / `src/index.mts` を実装
- `src/signaling.spec.mts` / `src/protocol.spec.mts` / `src/tunnel.spec.mts` を追加
- `jest.config.mjs` と `package.json` の test script を更新し、Unit テストを実行
