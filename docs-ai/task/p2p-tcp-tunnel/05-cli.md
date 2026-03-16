# 05. CLI インターフェース設計

## 概要

ユーザーが P2P トンネルを操作するための CLI インターフェース。
2つのサブコマンド (`listen`, `forward`) を提供する。

## ファイル: `src/cli.mts`

## コマンド体系

```
tunnel <command> [options]
```

### `listen` コマンド (Offer 側)

ローカルポートで TCP 接続を待ち受け、P2P 経由で転送する。

```
tunnel listen <port>
```

- `<port>`: ローカルで待ち受ける TCP ポート番号

#### 例

```bash
# ローカルの 2222 番ポートで待ち受け
tunnel listen 2222
```

### `forward` コマンド (Answer 側)

P2P 経由で受信した TCP 接続を指定先に転送する。

```
tunnel forward <target>
```

- `<target>`: 転送先を `host:port` 形式で指定

#### 例

```bash
# 受信した接続を localhost:22 に転送
tunnel forward localhost:22
```

## エントリーポイント (`src/index.mts`)

```typescript
// 引数パース
const args = process.argv.slice(2);
const command = args[0]; // 'listen' or 'forward'

switch (command) {
  case 'listen':
    // port を取得してリスナーモードで起動
    break;
  case 'forward':
    // host:port を取得してフォワーダーモードで起動
    break;
  default:
    // ヘルプを表示
    break;
}
```

追加のコマンドライン引数パーサーライブラリは使用しない。`process.argv` を直接パースする。

## インタラクティブフロー

### listen コマンドの実行フロー

```
1. 引数バリデーション (ポート番号)
2. PeerConnection 作成 + DataChannel 作成
3. SDP Offer 生成 + ICE 収集完了待ち
4. Offer 情報 (base64) を表示
5. ユーザーに Answer 情報の入力を促す
6. readline で Answer 情報を読み取り
7. Answer をデコード → PeerConnection に適用
8. 接続確立を待つ
9. DataChannel 開通
10. TCP サーバー起動 (TunnelListener)
11. 「接続しました」メッセージ表示
12. Ctrl+C で終了
```

### forward コマンドの実行フロー

```
1. 引数バリデーション (host:port)
2. ユーザーに Offer 情報の入力を促す
3. readline で Offer 情報を読み取り
4. Offer をデコード
5. PeerConnection 作成 + Answer 生成 + ICE 収集完了待ち
6. Answer 情報 (base64) を表示
7. 接続確立を待つ
8. DataChannel 開通
9. TunnelForwarder を起動
10. 「接続しました」メッセージ表示
11. Ctrl+C で終了
```

## 対話 UI

`readline` モジュールを使用してユーザーとの対話を行う。

```typescript
import * as readline from 'node:readline/promises';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// base64 文字列の入力を受け付ける
async function promptSignalingData(prompt: string): Promise<string> {
  const input = await rl.question(prompt);
  return input.trim();
}
```

### 表示フォーマット

```
── P2P TCP Tunnel ──────────────────────

以下のオファー情報を相手に送ってください:
────────────────────────────────────────
eyJ0eXBlIjoib2ZmZXIi...
────────────────────────────────────────

相手のアンサー情報を貼り付けてください:
>
```

## エラー表示

- 引数不足 → usage メッセージを表示して終了
- 不正なポート番号 → エラーメッセージを表示して終了
- 不正なシグナリングデータ → エラーメッセージを表示して再入力を促す
- 接続タイムアウト → エラーメッセージを表示して終了
- 予期しないエラー → スタックトレースを表示して終了

## シグナル処理

```typescript
process.on('SIGINT', () => {
  console.log('\n終了します...');
  // クリーンアップ: TCP サーバー停止, DataChannel 閉じる, PeerConnection 閉じる
  process.exit(0);
});
```

## 実行方法

```bash
# TypeScript を直接実行 (ts-node / tsx)
npx tsx src/index.mts listen 2222
npx tsx src/index.mts forward localhost:22
```

package.json に scripts を追加:

```json
{
  "scripts": {
    "tunnel": "tsx src/index.mts"
  }
}
```

```bash
npm run tunnel -- listen 2222
npm run tunnel -- forward localhost:22
```
