# 06. CLI インターフェース設計

## 概要

`TunnelApp` を操作する CLI フロントエンド。
`TunnelApp` のイベントを購読して表示し、ユーザー入力を `TunnelApp` のメソッド呼び出しに変換する。

## ファイル: `src/cli.mts`

## 設計方針

- `TunnelApp` の薄いラッパーに徹する
- ロジックを持たない。状態管理・P2P 制御は `TunnelApp` に委譲
- 将来 Web UI が追加されても CLI は独立して動作する

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
import { TunnelApp } from './app.mjs';
import { DataChannelTransport } from './transport/datachannel.mjs';
import { runCli } from './cli.mjs';

// トランスポート実装を選択して注入
const transport = new DataChannelTransport();
const app = new TunnelApp(transport);

// CLI フロントエンドを起動
runCli(app, process.argv.slice(2));
```

**ポイント**: `index.mts` だけが具体的なトランスポート実装 (`DataChannelTransport`) を参照する。
`cli.mts` は `TunnelApp` のみに依存する。

## CLI フロントエンド (`src/cli.mts`)

```typescript
import * as readline from 'node:readline/promises';
import { TunnelApp } from './app.mjs';

export async function runCli(app: TunnelApp, args: string[]): Promise<void> {
  const command = args[0];

  switch (command) {
    case 'listen':
      await runListenMode(app, args);
      break;
    case 'forward':
      await runForwardMode(app, args);
      break;
    default:
      printUsage();
      break;
  }
}
```

追加のコマンドライン引数パーサーライブラリは使用しない。`process.argv` を直接パースする。

## インタラクティブフロー

### listen コマンドの実行フロー

```
1. 引数バリデーション (ポート番号)
2. TunnelApp のイベント購読
3. app.listen(port) 呼出
4. 'offer-ready' イベント受信 → Offer を表示
5. readline で Answer 入力を待つ
6. app.setRemoteAnswer(input) 呼出
7. 'connected' イベント受信 → 接続成功メッセージ表示
8. Ctrl+C で app.close() → 終了
```

### forward コマンドの実行フロー

```
1. 引数バリデーション (host:port)
2. TunnelApp のイベント購読
3. app.forward(host, port) 呼出
4. readline で Offer 入力を待つ
5. app.setRemoteOffer(input) 呼出
6. 'answer-ready' イベント受信 → Answer を表示
7. 'connected' イベント受信 → 接続成功メッセージ表示
8. Ctrl+C で app.close() → 終了
```

## TunnelApp イベントの表示マッピング

```typescript
function setupEventHandlers(app: TunnelApp): void {
  app.on('offer-ready', (encoded) => {
    console.log('\n以下のオファー情報を相手に送ってください:');
    console.log('────────────────────────────────────────');
    console.log(encoded);
    console.log('────────────────────────────────────────');
  });

  app.on('answer-ready', (encoded) => {
    console.log('\n以下のアンサー情報を相手に送ってください:');
    console.log('────────────────────────────────────────');
    console.log(encoded);
    console.log('────────────────────────────────────────');
  });

  app.on('connected', () => {
    console.log('\n接続しました!');
  });

  app.on('disconnected', () => {
    console.log('\n切断されました');
  });

  app.on('error', (err) => {
    console.error('\nエラー:', err.message);
  });

  app.on('log', (msg) => {
    console.log(msg);
  });
}
```

## 対話 UI

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
  app.close();
  process.exit(0);
});
```

## 実行方法

```bash
# TypeScript を直接実行 (tsx)
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
