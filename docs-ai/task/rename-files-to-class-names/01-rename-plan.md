# 01. リネーム計画

## 方針

- クラス・主要構造体と一対一対応するファイル → PascalCase (クラス名そのまま) にリネーム
- 関数モジュール (`cli.mts`) → 対象外
- 複数構造体の集合ファイル (`tcp-socket.mts`) → 対象外
- エントリーポイント (`index.mts`, `daemon.mts`) → 対象外
- spec ファイルは対応するソースと同名にリネーム

## 変更一覧

### リネーム対象

| 現在のパス | 主要クラス/構造体 | 新しいパス |
|---|---|---|
| `src/app/tunnel-app.mts` | `TunnelApp` | `src/app/TunnelApp.mts` |
| `src/app/daemon-controller.mts` | `DaemonController` | `src/app/DaemonController.mts` |
| `src/app/daemon-server.mts` | `DaemonServer` | `src/app/DaemonServer.mts` |
| `src/app/tunnel-listener.mts` | `TunnelListener` | `src/app/TunnelListener.mts` |
| `src/app/tunnel-forwarder.mts` | `TunnelForwarder` | `src/app/TunnelForwarder.mts` |
| `src/app/protocol-message.mts` | `ProtocolMessage` | `src/app/ProtocolMessage.mts` |
| `src/app/signaling-data.mts` | `SignalingData` | `src/app/SignalingData.mts` |
| `src/app/transport/data-channel-transport.mts` | `DataChannelTransport` | `src/app/transport/DataChannelTransport.mts` |
| `src/app/transport/mock-transport.mts` | `MockTransport` | `src/app/transport/MockTransport.mts` |
| `src/app/transport/p2p-transport.mts` | `IP2PTransport` | `src/app/transport/IP2PTransport.mts` |

### spec ファイルのリネーム

| 現在のパス | 新しいパス |
|---|---|
| `src/app/daemon-controller.spec.mts` | `src/app/DaemonController.spec.mts` |
| `src/app/daemon-server.spec.mts` | `src/app/DaemonServer.spec.mts` |
| `src/app/tunnel-listener.spec.mts` | `src/app/TunnelListener.spec.mts` |
| `src/app/tunnel-forwarder.spec.mts` | `src/app/TunnelForwarder.spec.mts` |
| `src/app/protocol-message.spec.mts` | `src/app/ProtocolMessage.spec.mts` |
| `src/app/signaling-data.spec.mts` | `src/app/SignalingData.spec.mts` |
| `src/app/transport/data-channel-transport.spec.mts` | `src/app/transport/DataChannelTransport.spec.mts` |

### 対象外

| パス | 理由 |
|---|---|
| `src/index.mts` | エントリーポイント |
| `src/daemon.mts` | エントリーポイント |
| `src/app/cli.mts` | 関数モジュール (`runCli`) |
| `src/app/tcp-socket.mts` | 複数インタフェースの集合 (`ITcpSocket`, `ITcpServer`, `ITcpServerFactory`, `ITcpClientFactory`, `ConnectionEntry`) |

## import パス更新

import パスの `.mjs` 拡張子部分を新ファイル名に合わせて更新する。

| ファイル | 変更箇所 |
|---|---|
| `src/index.mts` | `./app/tunnel-app.mjs` → `./app/TunnelApp.mjs`, `./app/transport/data-channel-transport.mjs` → `./app/transport/DataChannelTransport.mjs` |
| `src/daemon.mts` | `./app/tunnel-app.mjs` → `./app/TunnelApp.mjs`, `./app/daemon-controller.mjs` → `./app/DaemonController.mjs`, `./app/daemon-server.mjs` → `./app/DaemonServer.mjs`, `./app/transport/data-channel-transport.mjs` → `./app/transport/DataChannelTransport.mjs` |
| `src/app/TunnelApp.mts` | `./protocol-message.mjs` → `./ProtocolMessage.mjs`, `./signaling-data.mjs` → `./SignalingData.mjs`, `./tunnel-listener.mjs` → `./TunnelListener.mjs`, `./tunnel-forwarder.mjs` → `./TunnelForwarder.mjs`, `./transport/p2p-transport.mjs` → `./transport/IP2PTransport.mjs` |
| `src/app/cli.mts` | `./tunnel-app.mjs` → `./TunnelApp.mjs` |
| `src/app/DaemonController.mts` | `./tunnel-app.mjs` → `./TunnelApp.mjs` |
| `src/app/DaemonServer.mts` | `./DaemonController.mjs` (新規パス) |
| `src/app/TunnelListener.mts` | `./protocol-message.mjs` → `./ProtocolMessage.mjs`, `./transport/p2p-transport.mjs` → `./transport/IP2PTransport.mjs` |
| `src/app/TunnelForwarder.mts` | `./protocol-message.mjs` → `./ProtocolMessage.mjs`, `./transport/p2p-transport.mjs` → `./transport/IP2PTransport.mjs` |
| `src/app/transport/DataChannelTransport.mts` | `../signaling-data.mjs` → `../SignalingData.mjs`, `./p2p-transport.mjs` → `./IP2PTransport.mjs` |
| `src/app/transport/MockTransport.mts` | `../signaling-data.mjs` → `../SignalingData.mjs`, `./p2p-transport.mjs` → `./IP2PTransport.mjs` |

spec ファイル内の import パスも同様に更新する。

## 変更後のディレクトリ構成

```
src/
├── index.mts                          # エントリーポイント
├── daemon.mts                         # エントリーポイント
└── app/
    ├── cli.mts                        # 関数モジュール (対象外)
    ├── tcp-socket.mts                 # 複数インタフェース集合 (対象外)
    ├── DaemonController.mts           # DaemonController クラス
    ├── DaemonController.spec.mts
    ├── DaemonServer.mts               # DaemonServer クラス
    ├── DaemonServer.spec.mts
    ├── ProtocolMessage.mts            # ProtocolMessage interface + MessageType enum
    ├── ProtocolMessage.spec.mts
    ├── SignalingData.mts              # SignalingData interface
    ├── SignalingData.spec.mts
    ├── TunnelApp.mts                  # TunnelApp クラス
    ├── TunnelForwarder.mts            # TunnelForwarder クラス
    ├── TunnelForwarder.spec.mts
    ├── TunnelListener.mts             # TunnelListener クラス
    ├── TunnelListener.spec.mts
    └── transport/
        ├── DataChannelTransport.mts   # DataChannelTransport クラス
        ├── DataChannelTransport.spec.mts
        ├── IP2PTransport.mts          # IP2PTransport interface
        └── MockTransport.mts          # MockTransport クラス
```

## 作業手順

1. git mv で全ファイルをリネーム (macOS の case-insensitive FS では中間名が必要)
2. 全ファイルの import パスを更新
3. spec ファイルをリネーム
4. ビルド・テスト通過を確認
