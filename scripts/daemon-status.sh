#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# --id <id> オプションのパース (省略時は "default")
DAEMON_ID="default"
if [[ "${1:-}" == "--id" ]]; then
  DAEMON_ID="${2:?'--id requires a value'}"
  shift 2
fi
if [[ ! "$DAEMON_ID" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "Invalid daemon id: $DAEMON_ID" >&2
  exit 1
fi

VAR_DIR=".var"
PID_FILE="$VAR_DIR/daemon-${DAEMON_ID}.pid"
SOCK_FILE="$VAR_DIR/daemon-${DAEMON_ID}.sock"

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
