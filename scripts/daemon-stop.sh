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
