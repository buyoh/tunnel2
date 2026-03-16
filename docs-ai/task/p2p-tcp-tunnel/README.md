# P2P TCP トンネル — 設計ドキュメント

## 概要

node-datachannel (WebRTC DataChannel) を利用して、NAT越えの P2P TCP トンネルを実現する CLI アプリケーション。

シグナリングサーバーを使わず、SDP/ICE 情報をユーザーがコピー&ペーストで交換するインタラクティブ方式を採用する。

## ドキュメント構成

| ファイル | 内容 |
|---|---|
| [01-overview.md](./01-overview.md) | 全体アーキテクチャ・システム構成 |
| [02-signaling.md](./02-signaling.md) | シグナリング (SDP/ICE 交換) の設計 |
| [03-connection.md](./03-connection.md) | P2P 接続管理の設計 |
| [04-tunnel.md](./04-tunnel.md) | TCP トンネル (TCP ↔ DataChannel ブリッジ) の設計 |
| [05-cli.md](./05-cli.md) | CLI インターフェースの設計 |

## ステータス

- [x] 設計
- [ ] 実装
- [ ] テスト
