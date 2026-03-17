# Rule 4: 構造体のドキュメントコメント不足

## ルール

> 構造体の概要は必ずドキュメントコメントとして追加する。関数は規模が小さい場合、省略する

## 現状

以下の構造体（type / interface / enum / class）にドキュメントコメントが無い。

### src/app/app.mts

| 構造体 | 種別 | 追加するコメント案 |
|--------|------|-------------------|
| `AppState` | type | P2P 接続のライフサイクルを表す状態。 |

### src/app/protocol.mts

| 構造体 | 種別 | 追加するコメント案 |
|--------|------|-------------------|
| `MessageType` | enum | 多重化プロトコルのメッセージ種別。 |
| `ProtocolMessage` | interface | connId・種別・ペイロードからなるプロトコルメッセージ。 |

### src/app/signaling.mts

| 構造体 | 種別 | 追加するコメント案 |
|--------|------|-------------------|
| `SignalingCandidate` | interface | ICE candidate 情報。 |
| `SignalingData` | interface | SDP と ICE candidate をまとめたシグナリング情報。 |

### src/app/tunnel.mts

| 構造体 | 種別 | 追加するコメント案 |
|--------|------|-------------------|
| `ConnectionEntry` | interface | トンネルで管理される個別 TCP 接続の状態。 |

### src/app/transport/interface.mts

| 構造体 | 種別 | 追加するコメント案 |
|--------|------|-------------------|
| `P2PChannelState` | type | P2P データチャネルの接続状態。 |
| `P2PTransportEvents` | interface | P2P トランスポートが発火するイベントハンドラ群。 |
| `IP2PTransport` | interface | P2P トランスポートの抽象インタフェース。 |

### src/app/transport/datachannel.mts

| 構造体 | 種別 | 追加するコメント案 |
|--------|------|-------------------|
| `DataChannelLike` | interface | node-datachannel の DataChannel が持つべき最小限のメソッド抽象。 |
| `PeerConnectionLike` | interface | node-datachannel の PeerConnection が持つべき最小限のメソッド抽象。 |
| `NodeDataChannelModule` | interface | node-datachannel モジュールの型抽象（DI 用）。 |
| `DataChannelTransportConfig` | interface | DataChannelTransport の生成オプション。 |

## 対象外

- 関数: ルール上「規模が小さい場合、省略する」ため、小規模な関数は対象外。
- テストコード内のモッククラス: テスト専用のヘルパーであり、プロダクションコードではないため対象外。

## ステータス

- [ ] ドキュメントコメント追加
