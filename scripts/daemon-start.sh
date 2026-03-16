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
