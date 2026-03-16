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

curl -s --unix-socket "$SOCK_FILE" http://localhost/api/status
echo  # 改行
