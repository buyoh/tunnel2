#!/usr/bin/env bash
# daemon の簡易動作確認スクリプト
# alice(listen 側) と bob(forward 側) で daemon を起動し、
# シグナリング交換まで一通りのフローを確認する。
set -euo pipefail
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
step() { echo "--- $1"; }
ok()   { echo "  OK: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1" >&2; FAIL=$((FAIL + 1)); }

cleanup() {
  scripts/daemon-stop.sh --id alice >/dev/null 2>&1 || true
  scripts/daemon-stop.sh --id bob   >/dev/null 2>&1 || true
}
trap cleanup EXIT

# 事前クリーンアップ
cleanup

###############################################
step "1. daemon 起動 (alice)"
if scripts/daemon-start.sh --id alice >/dev/null 2>&1; then
  ok "alice daemon started"
else
  fail "alice daemon failed to start"
  cat .var/daemon-alice.log >&2 2>/dev/null || true
  exit 1
fi

###############################################
step "2. ステータス確認 (alice: idle)"
STATUS=$(scripts/daemon-status.sh --id alice 2>/dev/null)
STATE=$(echo "$STATUS" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).state)")
if [[ "$STATE" == "idle" ]]; then
  ok "alice state=idle"
else
  fail "alice state=$STATE (expected idle)"
fi

###############################################
step "3. listen コマンド (alice)"
RESULT=$(scripts/daemon-post.sh --id alice listen port=18080 2>/dev/null) || true
if echo "$RESULT" | grep -q '"ok":true'; then
  ok "listen accepted"
else
  fail "listen rejected: $RESULT"
fi

###############################################
step "4. offer-ready イベント確認 (alice)"
sleep 2
STATUS=$(scripts/daemon-status.sh --id alice 2>/dev/null)
OFFER=$(echo "$STATUS" | node -e "
const d=require('fs').readFileSync('/dev/stdin','utf8');
const j=JSON.parse(d);
const e=j.events.find(e=>e.type==='offer-ready');
if(e){
  const sig=JSON.parse(Buffer.from(e.data,'base64').toString());
  if(sig.sdp.length>0) console.log(e.data);
  else process.exit(1);
} else process.exit(1);
" 2>/dev/null) || true

if [[ -n "$OFFER" ]]; then
  ok "offer-ready received (sdp non-empty)"
else
  fail "offer-ready not received or sdp empty"
fi

###############################################
step "5. daemon 起動 (bob)"
if scripts/daemon-start.sh --id bob >/dev/null 2>&1; then
  ok "bob daemon started"
else
  fail "bob daemon failed to start"
  cat .var/daemon-bob.log >&2 2>/dev/null || true
fi

###############################################
step "6. forward コマンド (bob)"
RESULT=$(scripts/daemon-post.sh --id bob forward host=localhost port=8080 2>/dev/null) || true
if echo "$RESULT" | grep -q '"ok":true'; then
  ok "forward accepted"
else
  fail "forward rejected: $RESULT"
fi

###############################################
step "7. set-remote-offer (bob <- alice の offer)"
if [[ -n "$OFFER" ]]; then
  RESULT=$(scripts/daemon-post.sh --id bob set-remote-offer encoded="$OFFER" 2>/dev/null) || true
  if echo "$RESULT" | grep -q '"ok":true'; then
    ok "set-remote-offer accepted"
  else
    fail "set-remote-offer rejected: $RESULT"
  fi
else
  fail "skipped (no offer)"
fi

###############################################
step "8. answer-ready イベント確認 (bob)"
sleep 2
STATUS=$(scripts/daemon-status.sh --id bob 2>/dev/null)
ANSWER=$(echo "$STATUS" | node -e "
const d=require('fs').readFileSync('/dev/stdin','utf8');
const j=JSON.parse(d);
const e=j.events.find(e=>e.type==='answer-ready');
if(e){
  const sig=JSON.parse(Buffer.from(e.data,'base64').toString());
  if(sig.sdp.length>0) console.log(e.data);
  else process.exit(1);
} else process.exit(1);
" 2>/dev/null) || true

if [[ -n "$ANSWER" ]]; then
  ok "answer-ready received (sdp non-empty)"
else
  fail "answer-ready not received or sdp empty"
fi

###############################################
step "9. set-remote-answer (alice <- bob の answer)"
if [[ -n "$ANSWER" ]]; then
  RESULT=$(scripts/daemon-post.sh --id alice set-remote-answer encoded="$ANSWER" 2>/dev/null) || true
  if echo "$RESULT" | grep -q '"ok":true'; then
    ok "set-remote-answer accepted"
  else
    fail "set-remote-answer rejected: $RESULT"
  fi
else
  fail "skipped (no answer)"
fi

###############################################
step "10. 接続状態確認"
sleep 3
ALICE_STATE=$(scripts/daemon-status.sh --id alice 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).state)")
BOB_STATE=$(scripts/daemon-status.sh --id bob 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).state)")
echo "  alice=$ALICE_STATE, bob=$BOB_STATE"
if [[ "$ALICE_STATE" == "connected" && "$BOB_STATE" == "connected" ]]; then
  ok "both connected"
else
  # P2P 接続はネットワーク環境(NAT/ファイアウォール)に依存するため、
  # connecting/closed は環境依存のエラー
  echo "  NOTE: P2P connection depends on network environment (NAT/firewall)"
  if [[ "$ALICE_STATE" == "connecting" || "$BOB_STATE" == "connecting" ]]; then
    ok "signaling succeeded (P2P connecting; network may block direct connection)"
  else
    fail "unexpected states: alice=$ALICE_STATE, bob=$BOB_STATE"
  fi
fi

###############################################
step "11. close コマンド"
RESULT=$(scripts/daemon-post.sh --id alice close 2>/dev/null) || true
if echo "$RESULT" | grep -q '"ok":true'; then
  ok "close accepted"
else
  fail "close rejected: $RESULT"
fi

###############################################
step "12. daemon 停止"
scripts/daemon-stop.sh --id alice >/dev/null 2>&1
scripts/daemon-stop.sh --id bob   >/dev/null 2>&1
ok "daemons stopped"

###############################################
echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"
echo "================================"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
