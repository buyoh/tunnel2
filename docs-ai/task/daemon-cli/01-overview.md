# 01 — 全体構成・IPC プロトコル

## 背景

既存 CLI (`src/app/cli.mts`) は `readline` の対話プロンプトでシグナリング情報を受け取る。
Agent がこれを操作するには stdin への書き込みタイミング制御が必要で困難。

daemon 方式では:

1. daemon プロセスをバックグラウンドで起動し `TunnelApp` を保持
2. bash スクリプトから Unix domain socket 経由でコマンドを送信
3. daemon はコマンドを受けて `TunnelApp` のメソッドを呼び出す
4. 結果（成功/失敗、イベント履歴）は別のスクリプトで取得

これにより Agent は「スクリプト実行 → 終了コード確認」の単純なフローで操作できる。

## ファイル構成

```
scripts/
  daemon-start.sh      # daemon 起動
  daemon-stop.sh       # daemon 停止
  daemon-status.sh     # ステータス確認
  daemon-post.sh       # コマンド送信

src/
  daemon.mts           # daemon エントリーポイント
  app/
    daemon-server.mts  # HTTP サーバ + コマンドハンドラ

.var/                  # ランタイムデータ (.gitignore 対象)
  daemon.pid           # プロセス ID
  daemon.sock          # Unix domain socket
  daemon.log           # 標準出力・エラーのログ
```

## IPC プロトコル

Node.js 標準の `http` モジュールを使い、Unix domain socket (`.var/daemon.sock`) 上で HTTP を提供する。
bash スクリプトからは `curl --unix-socket` で通信する。

### エンドポイント

#### `POST /command`

daemon にコマンドを送信する。コマンドが **受理されたかどうか** を返す。
コマンドの実行結果（例: offer-ready イベント）は `/status` で別途確認する。

リクエスト:

```json
{
  "action": "listen",
  "args": { "port": 8080 }
}
```

サポートするアクション:

| action              | args                         | 説明                        |
| ------------------- | ---------------------------- | --------------------------- |
| `listen`            | `{ "port": number }`        | ローカルポートで待ち受け開始 |
| `forward`           | `{ "host": string, "port": number }` | フォワード先を指定     |
| `set-remote-offer`  | `{ "encoded": string }`     | 相手のオファーを設定         |
| `set-remote-answer` | `{ "encoded": string }`     | 相手のアンサーを設定         |
| `close`             | (なし)                       | TunnelApp を close          |

レスポンス (成功時):

```json
{
  "ok": true
}
```

レスポンス (失敗時):

```json
{
  "ok": false,
  "error": "listen() can only be called in idle state"
}
```

HTTP ステータスコード:

- `200` — コマンド受理（`ok: true`）
- `400` — コマンド拒否（不正な引数、状態不整合など）
- `404` — 不明なエンドポイント

#### `GET /status`

daemon の現在のステータスを返す。

レスポンス:

```json
{
  "state": "waiting-answer",
  "events": [
    {
      "type": "offer-ready",
      "data": "eyJ0eXBlIjoib2ZmZXIi...",
      "timestamp": "2026-03-16T10:00:00.000Z"
    }
  ],
  "lastCommand": {
    "action": "listen",
    "ok": true,
    "timestamp": "2026-03-16T09:59:59.000Z"
  }
}
```

フィールド:

- `state` — `TunnelApp` の現在の `AppState`
- `events` — daemon 起動後に発生したイベントの配列（最新 100 件を保持）
  - `type`: `offer-ready` | `answer-ready` | `connected` | `disconnected` | `error`
  - `data`: イベントに付随するデータ（offer/answer の encoded 文字列、エラーメッセージなど）
  - `timestamp`: ISO 8601
- `lastCommand` — 最後に受信したコマンドの結果
  - `action`: コマンド名
  - `ok`: 成功したか
  - `error`: 失敗時のエラーメッセージ（省略可能）
  - `timestamp`: ISO 8601

## .var/ ディレクトリ

- `.gitignore` に `.var/` を追加する
- daemon 起動時に `.var/` ディレクトリがなければ作成する
- daemon 停止時に `.var/daemon.sock` と `.var/daemon.pid` を削除する
- `.var/daemon.log` は削除せず残す（デバッグ用）

## 多重起動防止

1. `daemon-start.sh` は `.var/daemon.pid` の存在を確認
2. PID ファイルが存在する場合、`kill -0 <pid>` でプロセスの生存を確認
3. プロセスが生存中ならエラー終了
4. プロセスが死んでいれば stale な PID ファイルとして削除し、新たに起動

## シグナル処理

daemon プロセスは以下のシグナルを処理する:

- `SIGTERM` / `SIGINT` — graceful shutdown
  - `TunnelApp.close()` を呼び出し
  - HTTP サーバを close
  - `.var/daemon.pid` と `.var/daemon.sock` を削除
  - `process.exit(0)`
