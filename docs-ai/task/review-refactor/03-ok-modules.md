# 要件を満たしているモジュール

以下のモジュールは3つのレビュー要件をすべて満たしている。変更不要。

## protocol.mts / protocol.spec.mts

- **要件1（モック使用）**: 純粋な関数テスト。I/O なし。問題なし。
- **要件2（DI）**: 外部依存がなく DI 不要。問題なし。
- **要件3（単一責任）**: encode/decode のみ。問題なし。

## signaling.mts / signaling.spec.mts

- **要件1（モック使用）**: 純粋な関数テスト。I/O なし。問題なし。
- **要件2（DI）**: 外部依存がなく DI 不要。問題なし。
- **要件3（単一責任）**: encode/decode + バリデーションのみ。問題なし。

## transport/interface.mts

- インターフェース定義のみ。テスト・DI・責務分割すべて問題なし。

## transport/mock.mts

- テスト用モック実装。`IP2PTransport` インターフェースを正しく実装。問題なし。

## transport/datachannel.mts

- `IP2PTransport` のプロダクション実装。実 WebRTC を使う唯一のモジュール。
- テストは `MockTransport` で差し替えられるため、本モジュール自体がテストで使われることはない。問題なし。

## app.mts

- アプリケーションオーケストレーター。`IP2PTransport` をコンストラクタ DI で受け取り、状態管理を行う。
- テストでは `MockTransport` が注入されており、要件を満たす。
- 単一責任（状態遷移管理）として妥当。

## cli.mts

- CLI のユーザー入力処理。`TunnelApp` を受け取るため DI パターンに従う。
- テストなし（対話型 CLI のため対象外）。
