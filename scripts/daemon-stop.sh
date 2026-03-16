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
