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
SOCK_FILE="$VAR_DIR/daemon-${DAEMON_ID}.sock"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 [--id <id>] <action> [key=value ...]" >&2
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
  http://localhost/api/command)

echo "$response"

# ok フィールドで終了コードを決定
if echo "$response" | grep -q '"ok":true'; then
  exit 0
else
  exit 1
fi
