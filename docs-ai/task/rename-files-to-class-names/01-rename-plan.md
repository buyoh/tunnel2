# 01. リネーム・分割計画

## 方針

- エントリーポイント (`src/index.mts`, `src/daemon.mts`) は対象外
- クラスを含むファイル → 主要クラス名の kebab-case にリネーム
- 複数クラスを含むファイル → 1 クラス 1 ファイルに分割
- クラスを持たないモジュール (関数・型のみ) → 主要な構造体名の kebab-case にリネーム
- spec ファイルは対応するソースファイルと同名にリネーム
- import パスを全ファイルで更新

## 変更一覧

### 1. リネームのみ (分割不要)

| 現在のパス | 主要構造体 | 新しいパス |
|---|---|---|
| `src/app/app.mts` | `TunnelApp` | `src/app/tunnel-app.mts` |
| `src/app/app.mts` の spec 無し | — | — |
| `src/app/cli.mts` | `runCli` (関数) | 変更なし |
| `src/app/protocol.mts` | `ProtocolMessage` | `src/app/protocol-message.mts` |
| `src/app/protocol.spec.mts` | — | `src/app/protocol-message.spec.mts` |
| `src/app/signaling.mts` | `SignalingData` | `src/app/signaling-data.mts` |
| `src/app/signaling.spec.mts` | — | `src/app/signaling-data.spec.mts` |
| `src/app/transport/interface.mts` | `IP2PTransport` | `src/app/transport/p2p-transport.mts` |
| `src/app/transport/datachannel.mts` | `DataChannelTransport` | `src/app/transport/data-channel-transport.mts` |
| `src/app/transport/datachannel.spec.mts` | — | `src/app/transport/data-channel-transport.spec.mts` |
| `src/app/transport/mock.mts` | `MockTransport` | `src/app/transport/mock-transport.mts` |

### 2. 分割が必要なファイル

#### `src/app/tunnel.mts` → 3 ファイルに分割

| 新しいパス | 内容 |
|---|---|
| `src/app/tcp-socket.mts` | `ITcpSocket`, `ITcpServer`, `ITcpServerFactory`, `ITcpClientFactory` (インタフェース群), `ConnectionEntry` (interface) |
| `src/app/tunnel-listener.mts` | `TunnelListener` クラス, `NodeTcpServerFactory` クラス |
| `src/app/tunnel-forwarder.mts` | `TunnelForwarder` クラス, `NodeTcpClientFactory` クラス |

**分割理由:**

- `TunnelListener` と `TunnelForwarder` はそれぞれ独立した責務を持つ (listen 側 / forward 側)
- TCP ソケット抽象インタフェースは両クラスの共通依存であり、独立ファイルに切り出す
- `NodeTcpServerFactory` は `TunnelListener` のみが使用するため同居させる
- `NodeTcpClientFactory` は `TunnelForwarder` のみが使用するため同居させる
- `ConnectionEntry` は両クラスで使用するため TCP 抽象と同じファイルに配置する

**spec ファイル:**

| 現在のパス | 新しいパス |
|---|---|
| `src/app/tunnel.spec.mts` | `src/app/tunnel-listener.spec.mts` と `src/app/tunnel-forwarder.spec.mts` に分割 |

spec の分割はテスト内容を確認のうえ、`describe('TunnelListener', ...)` と `describe('TunnelForwarder', ...)` で分ける。

#### `src/app/daemon-server.mts` → 2 ファイルに分割

| 新しいパス | 内容 |
|---|---|
| `src/app/daemon-controller.mts` | `DaemonController` クラス, `DaemonEvent`, `LastCommand`, `StatusResponse`, `CommandResponse` (型定義) |
| `src/app/daemon-server.mts` | `DaemonServer` クラス (ファイル名はそのまま) |

**分割理由:**

- `DaemonController` はアプリケーションロジック (コマンド実行・イベント記録)
- `DaemonServer` は HTTP フレームワーク層 (Express ルーティング)
- 単一責任原則に従い分離する
- `DaemonServer` がファイル名をそのまま維持するため、import 影響が小さい

**spec ファイル:**

| 現在のパス | 新しいパス |
|---|---|
| `src/app/daemon-server.spec.mts` | `src/app/daemon-controller.spec.mts` と `src/app/daemon-server.spec.mts` に分割 |

## import パス更新

以下のファイルで import パスの更新が必要:

| ファイル | 更新内容 |
|---|---|
| `src/index.mts` | `./app/app.mjs` → `./app/tunnel-app.mjs`, `./app/transport/datachannel.mjs` → `./app/transport/data-channel-transport.mjs` |
| `src/daemon.mts` | `./app/app.mjs` → `./app/tunnel-app.mjs`, `./app/daemon-server.mjs` は維持, `./app/transport/datachannel.mjs` → `./app/transport/data-channel-transport.mjs` |
| `src/app/tunnel-app.mts` (旧 app.mts) | `./protocol.mjs` → `./protocol-message.mjs`, `./signaling.mjs` → `./signaling-data.mjs`, `./tunnel.mjs` → `./tunnel-listener.mjs` + `./tunnel-forwarder.mjs`, `./transport/interface.mjs` → `./transport/p2p-transport.mjs` |
| `src/app/cli.mts` | `./app.mjs` → `./tunnel-app.mjs` |
| `src/app/daemon-server.mts` | `./app.mjs` → `./tunnel-app.mjs` |
| `src/app/daemon-controller.mts` | `./tunnel-app.mjs` (新規ファイルの import) |
| `src/app/tunnel-listener.mts` | `./protocol.mjs` → `./protocol-message.mjs`, `./transport/interface.mjs` → `./transport/p2p-transport.mjs`, `./tcp-socket.mjs` (新規) |
| `src/app/tunnel-forwarder.mts` | 同上 |
| `src/app/transport/data-channel-transport.mts` | `../signaling.mjs` → `../signaling-data.mjs`, `./interface.mjs` → `./p2p-transport.mjs` |
| `src/app/transport/mock-transport.mts` | `../signaling.mjs` → `../signaling-data.mjs`, `./interface.mjs` → `./p2p-transport.mjs` |

## ディレクトリ構成 (変更後)

```
src/
├── index.mts                      # エントリーポイント (変更なし)
├── daemon.mts                     # エントリーポイント (変更なし)
└── app/
    ├── cli.mts                    # CLI (変更なし)
    ├── daemon-controller.mts      # DaemonController (daemon-server.mts から分割)
    ├── daemon-controller.spec.mts
    ├── daemon-server.mts          # DaemonServer (内容変更あり)
    ├── daemon-server.spec.mts
    ├── protocol-message.mts       # MessageType, ProtocolMessage (旧 protocol.mts)
    ├── protocol-message.spec.mts
    ├── signaling-data.mts         # SignalingData (旧 signaling.mts)
    ├── signaling-data.spec.mts
    ├── tcp-socket.mts             # ITcpSocket 等 TCP 抽象 (tunnel.mts から分割)
    ├── tunnel-app.mts             # TunnelApp (旧 app.mts)
    ├── tunnel-forwarder.mts       # TunnelForwarder (tunnel.mts から分割)
    ├── tunnel-forwarder.spec.mts
    ├── tunnel-listener.mts        # TunnelListener (tunnel.mts から分割)
    ├── tunnel-listener.spec.mts
    └── transport/
        ├── data-channel-transport.mts       # DataChannelTransport (旧 datachannel.mts)
        ├── data-channel-transport.spec.mts
        ├── mock-transport.mts               # MockTransport (旧 mock.mts)
        └── p2p-transport.mts                # IP2PTransport (旧 interface.mts)
```

## 作業手順

1. 分割不要なファイルをリネーム (git mv)
2. `tunnel.mts` を 3 ファイルに分割
3. `daemon-server.mts` を 2 ファイルに分割
4. 全ファイルの import パスを更新
5. spec ファイルをリネーム・分割
6. ビルド・テスト通過を確認
7. signaling-server ドキュメントのパス更新
