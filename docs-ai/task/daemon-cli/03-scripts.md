# 03 — Bash スクリプトの設計

## 共通

- すべてのスクリプトはプロジェクトルートからの相対パスで `.var/` を参照する
- スクリプト冒頭で `cd "$(dirname "$0")/.."` によりプロジェクトルートへ移動する
- `set -euo pipefail` を設定する
- 終了コード: `0` = 成功、`1` = 失敗

### 定数

```bash
VAR_DIR=".var"
PID_FILE="$VAR_DIR/daemon.pid"
SOCK_FILE="$VAR_DIR/daemon.sock"
LOG_FILE="$VAR_DIR/daemon.log"
```

---

## `scripts/daemon-start.sh`

daemon を起動する。

### 処理フロー

1. `.var/` ディレクトリを作成 (`mkdir -p`)
2. `.var/daemon.pid` が存在するか確認
   - 存在する場合、`kill -0 <pid>` でプロセス生存確認
   - 生存中 → `echo "Daemon is already running (pid=<pid>)"` して exit 1
   - 死んでいる → stale PID ファイルを削除して続行
3. stale な `.var/daemon.sock` があれば削除
4. `ts-node src/daemon.mts` をバックグラウンドで起動し、stdout/stderr を `.var/daemon.log` にリダイレクト
5. ソケットファイルの出現を最大 10 秒待つ（0.5 秒間隔でポーリング）
6. ソケットファイルが出現したら `echo "Daemon started (pid=<pid>)"` して exit 0
7. タイムアウトした場合はエラーメッセージを出して exit 1

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

VAR_DIR=".var"
PID_FILE="$VAR_DIR/daemon.pid"
SOCK_FILE="$VAR_DIR/daemon.sock"
LOG_FILE="$VAR_DIR/daemon.log"

mkdir -p "$VAR_DIR"

# 多重起動チェック
if [[ -f "$PID_FILE" ]]; then
  old_pid=$(cat "$PID_FILE")
  if kill -0 "$old_pid" 2>/dev/null; then
    echo "Daemon is already running (pid=$old_pid)" >&2
    exit 1
  fi
  rm -f "$PID_FILE"
fi

rm -f "$SOCK_FILE"

# daemon 起動
npx ts-node src/daemon.mts >> "$LOG_FILE" 2>&1 &
daemon_pid=$!

# ソケット出現を待つ
timeout=20
while [[ $timeout -gt 0 ]]; do
  if [[ -S "$SOCK_FILE" ]]; then
    echo "Daemon started (pid=$daemon_pid)"
    exit 0
  fi
  sleep 0.5
  timeout=$((timeout - 1))
done

echo "Daemon failed to start (check $LOG_FILE)" >&2
kill "$daemon_pid" 2>/dev/null || true
exit 1
```

---

## `scripts/daemon-stop.sh`

daemon を停止する。

### 処理フロー

1. `.var/daemon.pid` が存在するか確認。なければ `echo "Daemon is not running"` して exit 0
2. PID を読み取り `kill <pid>` (SIGTERM) を送信
3. 最大 5 秒間プロセスの終了を待つ（0.5 秒間隔でポーリング）
4. 終了しない場合は `kill -9 <pid>` で強制終了
5. PID ファイル・ソケットファイルを削除

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

VAR_DIR=".var"
PID_FILE="$VAR_DIR/daemon.pid"
SOCK_FILE="$VAR_DIR/daemon.sock"

if [[ ! -f "$PID_FILE" ]]; then
  echo "Daemon is not running"
  exit 0
fi

pid=$(cat "$PID_FILE")

if ! kill -0 "$pid" 2>/dev/null; then
  echo "Daemon is not running (stale pid file)"
  rm -f "$PID_FILE" "$SOCK_FILE"
  exit 0
fi

kill "$pid"

# 終了待ち
timeout=10
while [[ $timeout -gt 0 ]]; do
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "Daemon stopped"
    rm -f "$PID_FILE" "$SOCK_FILE"
    exit 0
  fi
  sleep 0.5
  timeout=$((timeout - 1))
done

echo "Force killing daemon..."
kill -9 "$pid" 2>/dev/null || true
rm -f "$PID_FILE" "$SOCK_FILE"
echo "Daemon stopped (forced)"
```

---

## `scripts/daemon-status.sh`

daemon のステータスを確認する。

### 処理フロー

1. `.var/daemon.pid` が存在するか確認
   - 存在しない → `echo "Daemon is not running"` して exit 1
2. `kill -0 <pid>` でプロセス生存確認
   - 死んでいる → `echo "Daemon is not running (stale pid file)"` して exit 1
3. `curl --unix-socket .var/daemon.sock http://localhost/status` でステータス取得
4. JSON を出力して exit 0

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

VAR_DIR=".var"
PID_FILE="$VAR_DIR/daemon.pid"
SOCK_FILE="$VAR_DIR/daemon.sock"

if [[ ! -f "$PID_FILE" ]]; then
  echo "Daemon is not running" >&2
  exit 1
fi

pid=$(cat "$PID_FILE")

if ! kill -0 "$pid" 2>/dev/null; then
  echo "Daemon is not running (stale pid file)" >&2
  exit 1
fi

curl -s --unix-socket "$SOCK_FILE" http://localhost/status
echo  # 改行
```

---

## `scripts/daemon-post.sh`

daemon にコマンドを送信する。

### Usage

```
scripts/daemon-post.sh <action> [key=value ...]
```

例:

```bash
scripts/daemon-post.sh listen port=8080
scripts/daemon-post.sh forward host=localhost port=3000
scripts/daemon-post.sh set-remote-offer encoded="eyJ0eXBlIjoi..."
scripts/daemon-post.sh set-remote-answer encoded="eyJ0eXBlIjoi..."
scripts/daemon-post.sh close
```

### 処理フロー

1. 第1引数を `action` とする
2. 残りの引数を `key=value` としてパースし `args` オブジェクトを構築
   - 値が整数文字列なら number に変換する
3. JSON ペイロードを構築: `{ "action": "<action>", "args": { ... } }`
4. `curl --unix-socket .var/daemon.sock -X POST -H "Content-Type: application/json" -d '<json>' http://localhost/command`
5. レスポンスの `ok` フィールドに基づき終了コードを設定
   - `ok: true` → exit 0
   - `ok: false` → exit 1
6. レスポンス JSON をそのまま stdout に出力

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

VAR_DIR=".var"
SOCK_FILE="$VAR_DIR/daemon.sock"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <action> [key=value ...]" >&2
  exit 1
fi

if [[ ! -S "$SOCK_FILE" ]]; then
  echo "Daemon is not running" >&2
  exit 1
fi

action="$1"
shift

# args を JSON オブジェクトに組み立て
args="{"
first=true
for arg in "$@"; do
  key="${arg%%=*}"
  value="${arg#*=}"
  if [[ "$first" == "true" ]]; then
    first=false
  else
    args+=","
  fi
  # 数値判定
  if [[ "$value" =~ ^[0-9]+$ ]]; then
    args+="\"$key\":$value"
  else
    args+="\"$key\":\"$value\""
  fi
done
args+="}"

json="{\"action\":\"$action\",\"args\":$args}"

response=$(curl -s --unix-socket "$SOCK_FILE" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$json" \
  http://localhost/command)

echo "$response"

# ok フィールドで終了コードを決定
if echo "$response" | grep -q '"ok":true'; then
  exit 0
else
  exit 1
fi
```

---

## Agent からの利用例

Agent が tunnel を listen → シグナリング情報を取得 → 相手の answer を設定する一連のフロー:

```bash
# 1. daemon 起動
scripts/daemon-start.sh

# 2. listen 開始
scripts/daemon-post.sh listen port=8080

# 3. offer 情報を取得
scripts/daemon-status.sh
# → events に offer-ready が含まれる。data フィールドが offer の encoded 文字列

# 4. (相手側で forward + offer 設定して answer を取得)

# 5. 相手の answer を設定
scripts/daemon-post.sh set-remote-answer encoded="eyJ0eXBlIjoi..."

# 6. 接続確認
scripts/daemon-status.sh
# → state: "connected"

# 7. 終了時
scripts/daemon-stop.sh
```
