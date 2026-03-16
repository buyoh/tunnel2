# 02 — Daemon サーバの設計

## 概要

`src/daemon.mts` (エントリーポイント) と `src/app/daemon-server.mts` (サーバロジック) の2ファイルを新規作成する。

## `src/app/daemon-server.mts`

### クラス: `DaemonServer`

`TunnelApp` をラップし、Unix domain socket 上の HTTP サーバを提供する。

```typescript
export class DaemonServer {
  constructor(app: TunnelApp, socketPath: string)
  start(): Promise<void>     // サーバ起動・listen 開始
  stop(): Promise<void>      // graceful shutdown
}
```

### 内部構造

#### イベント蓄積

`TunnelApp` のイベント (`offer-ready`, `answer-ready`, `connected`, `disconnected`, `error`) を購読し、内部配列 `events` に蓄積する（最大 100 件、超過時は古いものから破棄）。

```typescript
interface DaemonEvent {
  type: string;
  data?: string;
  timestamp: string; // ISO 8601
}
```

#### 最終コマンド記録

```typescript
interface LastCommand {
  action: string;
  ok: boolean;
  error?: string;
  timestamp: string; // ISO 8601
}
```

### リクエストハンドラ

Express を使用する。`express.json()` ミドルウェアでリクエストボディを自動パースする。

#### ルーティング

```typescript
const app = express();
app.use(express.json());

app.get('/api/status', (req, res) => {
  handleStatus(req, res);
});

app.post('/api/command', async (req, res) => {
  await handleCommand(req, res);
});
```

#### `handleCommand`

1. `req.body` から `action` と `args` を取得（Express の `json()` ミドルウェアでパース済み）
2. `action` に応じて `TunnelApp` のメソッドを呼び出す
3. 成功: `200 { ok: true }` を返す
4. 失敗: `400 { ok: false, error: "..." }` を返す
5. `lastCommand` を更新

コマンドディスパッチ:

```typescript
switch (body.action) {
  case 'listen':
    await app.listen(body.args.port);
    break;
  case 'forward':
    await app.forward(body.args.host, body.args.port);
    break;
  case 'set-remote-offer':
    await app.setRemoteOffer(body.args.encoded);
    break;
  case 'set-remote-answer':
    await app.setRemoteAnswer(body.args.encoded);
    break;
  case 'close':
    app.close();
    break;
  default:
    // 400 unknown action
}
```

#### `handleStatus`

現在の `app.getState()`, `events` 配列, `lastCommand` を JSON で返す。

### バリデーション

- `listen`: `port` が 1–65535 の整数であること
- `forward`: `host` が空でない文字列、`port` が 1–65535 の整数であること
- `set-remote-offer` / `set-remote-answer`: `encoded` が空でない文字列であること
- バリデーション失敗は `400` で返す

## `src/daemon.mts`

エントリーポイント。以下を行う:

1. `dotenv` の読み込み（必要に応じて）
2. `.var/` ディレクトリの作成 (`mkdirSync({ recursive: true })`)
3. `DataChannelTransport` と `TunnelApp` のインスタンス化
4. `DaemonServer` の生成・起動
5. PID ファイルの書き出し (`.var/daemon.pid`)
6. シグナルハンドラの登録

```typescript
import fs from 'node:fs';
import path from 'node:path';
import { TunnelApp } from './app/app.mjs';
import { DaemonServer } from './app/daemon-server.mjs';
import { DataChannelTransport } from './app/transport/datachannel.mjs';

const VAR_DIR = path.resolve('.var');
const PID_FILE = path.join(VAR_DIR, 'daemon.pid');
const SOCKET_PATH = path.join(VAR_DIR, 'daemon.sock');

async function main(): Promise<void> {
  fs.mkdirSync(VAR_DIR, { recursive: true });

  const app = new TunnelApp(new DataChannelTransport());
  const server = new DaemonServer(app, SOCKET_PATH);

  fs.writeFileSync(PID_FILE, String(process.pid));

  await server.start();
  console.log(`Daemon started (pid=${process.pid})`);

  const shutdown = async () => {
    console.log('Shutting down...');
    app.close();
    await server.stop();
    cleanup();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function cleanup(): void {
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
  try { fs.unlinkSync(SOCKET_PATH); } catch { /* ignore */ }
}

main().catch((error: unknown) => {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(err.message);
  cleanup();
  process.exitCode = 1;
});
```

### ログ出力

daemon の標準出力・標準エラーは起動スクリプト側でリダイレクトし `.var/daemon.log` に記録する。
daemon 自身は `console.log` / `console.error` をそのまま使う。
